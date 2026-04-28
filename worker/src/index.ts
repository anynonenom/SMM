import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { parseCSV, detectPlatform } from './lib/csv-parser'
import { computeAnalytics } from './lib/analytics'
import { getInsights, generateCaptions, explainPost, generateHashtagStrategy } from './lib/claude'

type Bindings = {
  DB: D1Database
  CSV_BUCKET: R2Bucket
  ANTHROPIC_API_KEY: string
  FRONTEND_URL: string
}

const app = new Hono<{ Bindings: Bindings }>()

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use('*', cors({
  origin: (origin) => {
    if (!origin) return '*'
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) return origin
    if (origin.endsWith('.pages.dev') || origin.endsWith('.workers.dev')) return origin
    return origin
  },
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
}))

// ── Root ──────────────────────────────────────────────────────────────────────
app.get('/', (c) => c.json({
  name: 'EIDEN SMM Analytics — Worker API',
  version: '1.1.0',
  status: 'running',
  endpoints: [
    'GET  /api/health',
    'POST /api/upload',
    'GET  /api/analytics/:uploadId',
    'GET  /api/posts/:uploadId',
    'GET  /api/posts/:uploadId/top',
    'GET  /api/posts/:uploadId/anomalies',
    'GET  /api/uploads',
    'GET  /api/forecast/:uploadId',
    'GET  /api/alerts/:uploadId',
    'PUT  /api/alerts/:alertId/dismiss',
    'GET  /api/goals',
    'POST /api/goals',
    'PUT  /api/goals/:id',
    'DELETE /api/goals/:id',
    'POST /api/ai/insights',
    'GET  /api/ai/insights/:uploadId',
    'POST /api/ai/captions',
    'POST /api/ai/explain-post',
    'POST /api/ai/hashtags',
  ],
}))

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (c) => c.json({ status: 'ok', ts: new Date().toISOString() }))

// ── Upload CSV ────────────────────────────────────────────────────────────────
app.post('/api/upload', async (c) => {
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    if (!file) return c.json({ error: 'No file provided' }, 400)
    if (!file.name.endsWith('.csv')) return c.json({ error: 'Only CSV files are supported' }, 400)

    const text   = await file.text()
    const id     = crypto.randomUUID()
    const r2Key  = `uploads/${id}/${file.name}`

    // Store raw CSV in R2
    await c.env.CSV_BUCKET.put(r2Key, text, {
      httpMetadata: { contentType: 'text/csv' },
    })

    // Parse & analyse
    const rows    = parseCSV(text)
    if (!rows.length) return c.json({ error: 'CSV is empty or could not be parsed' }, 400)

    const platform = detectPlatform(rows)
    const result   = computeAnalytics(rows, platform)

    // Persist upload record
    await c.env.DB.prepare(
      `INSERT INTO uploads (id, platform, filename, r2_key, row_count, status) VALUES (?, ?, ?, ?, ?, 'done')`
    ).bind(id, platform, file.name, r2Key, rows.length).run()

    // Persist analytics summary
    const aId = crypto.randomUUID()
    await c.env.DB.prepare(`
      INSERT INTO analytics
        (id, upload_id, platform, date_range_start, date_range_end,
         total_posts, avg_engagement_rate, total_reach, total_impressions,
         total_likes, total_comments, total_shares, follower_count, follower_growth,
         weekly_trend, posting_times, post_type_breakdown)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      aId, id, platform,
      result.date_range_start, result.date_range_end,
      result.total_posts, result.avg_engagement_rate,
      result.total_reach, result.total_impressions,
      result.total_likes, result.total_comments, result.total_shares,
      result.follower_count, result.follower_growth,
      JSON.stringify(result.weekly_trend),
      JSON.stringify(result.posting_heatmap),
      JSON.stringify(result.post_type_breakdown),
    ).run()

    // Persist posts (batch, max 500)
    const batch = result.posts.slice(0, 500).map(p =>
      c.env.DB.prepare(`
        INSERT OR IGNORE INTO posts
          (id, upload_id, platform, post_id, posted_at, post_type,
           caption, likes, comments, shares, saves, reach, impressions, engagement_rate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(), id, platform, p.post_id, p.posted_at, p.post_type,
        p.caption.slice(0, 500), p.likes, p.comments, p.shares, p.saves,
        p.reach, p.impressions, p.engagement_rate,
      )
    )
    if (batch.length) await c.env.DB.batch(batch)

    // Return snake_case analytics matching frontend AnalyticsData type
    const analytics = {
      upload_id:              id,
      platform:               result.platform,
      date_range_start:       result.date_range_start,
      date_range_end:         result.date_range_end,
      total_posts:            result.total_posts,
      avg_engagement_rate:    result.avg_engagement_rate,
      median_engagement_rate: result.median_engagement_rate,
      er_std:                 result.er_std,
      er_p75:                 result.er_p75,
      er_p90:                 result.er_p90,
      total_reach:            result.total_reach,
      total_impressions:      result.total_impressions,
      total_likes:            result.total_likes,
      total_comments:         result.total_comments,
      total_shares:           result.total_shares,
      total_saves:            result.total_saves,
      virality_rate:          result.virality_rate,
      save_rate:              result.save_rate,
      comment_rate:           result.comment_rate,
      follower_count:         result.follower_count,
      follower_growth:        result.follower_growth,
      avg_reach_per_post:     result.avg_reach_per_post,
      posting_frequency:      result.posting_frequency,
      best_posting_day:       result.best_posting_day,
      best_posting_hour:      result.best_posting_hour,
      top_post_type:          result.top_post_type,
      engagement_trend:       result.engagement_trend,
      reach_growth_rate:      result.reach_growth_rate,
      weekly_trend:           result.weekly_trend,
      posting_heatmap:        result.posting_heatmap,
      post_type_breakdown:    result.post_type_breakdown,
      top_hashtags:           result.top_hashtags,
      top_posts:              result.top_posts,
      worst_posts:            result.worst_posts,
      anomaly_posts:          result.anomaly_posts,
    }

    return c.json({
      upload_id: id,
      platform,
      row_count: rows.length,
      analytics,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: msg }, 500)
  }
})

// ── Get analytics ─────────────────────────────────────────────────────────────
app.get('/api/analytics/:uploadId', async (c) => {
  const { uploadId } = c.req.param()

  const analytics = await c.env.DB.prepare(
    `SELECT * FROM analytics WHERE upload_id = ? ORDER BY created_at DESC LIMIT 1`
  ).bind(uploadId).first()

  if (!analytics) return c.json({ error: 'Not found' }, 404)

  const result = {
    ...analytics,
    weekly_trend:        JSON.parse((analytics.weekly_trend as string)        ?? '[]'),
    posting_times:       JSON.parse((analytics.posting_times as string)       ?? '[]'),
    post_type_breakdown: JSON.parse((analytics.post_type_breakdown as string) ?? '{}'),
  }

  return c.json(result)
})

// ── Get posts ─────────────────────────────────────────────────────────────────
app.get('/api/posts/:uploadId', async (c) => {
  const { uploadId } = c.req.param()
  const sort  = c.req.query('sort') ?? 'engagement_rate'
  const dir   = c.req.query('dir') === 'asc' ? 'ASC' : 'DESC'
  const page  = parseInt(c.req.query('page') ?? '1', 10)
  const limit = 50
  const offset = (page - 1) * limit

  const allowed = ['engagement_rate','likes','comments','shares','reach','impressions','posted_at']
  const safeSort = allowed.includes(sort) ? sort : 'engagement_rate'

  const posts = await c.env.DB.prepare(
    `SELECT * FROM posts WHERE upload_id = ? ORDER BY ${safeSort} ${dir} LIMIT ? OFFSET ?`
  ).bind(uploadId, limit, offset).all()

  const total = await c.env.DB.prepare(
    `SELECT COUNT(*) as count FROM posts WHERE upload_id = ?`
  ).bind(uploadId).first<{ count: number }>()

  return c.json({ posts: posts.results, total: total?.count ?? 0, page, limit })
})

// ── Get all uploads ───────────────────────────────────────────────────────────
app.get('/api/uploads', async (c) => {
  const uploads = await c.env.DB.prepare(`
    SELECT u.id, u.platform, u.filename, u.row_count, u.status, u.created_at,
           a.total_posts, a.avg_engagement_rate, a.total_reach, a.follower_count
    FROM uploads u
    LEFT JOIN analytics a ON u.id = a.upload_id
    ORDER BY u.created_at DESC
    LIMIT 30
  `).all()

  return c.json({ uploads: uploads.results })
})

// ── Delete upload ─────────────────────────────────────────────────────────────
app.delete('/api/uploads/:id', async (c) => {
  const { id } = c.req.param()
  await c.env.DB.prepare(`DELETE FROM uploads WHERE id = ?`).bind(id).run()
  return c.json({ deleted: true })
})

// ── Top posts ─────────────────────────────────────────────────────────────────
app.get('/api/posts/:uploadId/top', async (c) => {
  const { uploadId } = c.req.param()
  const posts = await c.env.DB.prepare(
    `SELECT * FROM posts WHERE upload_id = ? ORDER BY engagement_rate DESC LIMIT 20`
  ).bind(uploadId).all()
  return c.json(posts.results)
})

// ── Anomaly posts ─────────────────────────────────────────────────────────────
app.get('/api/posts/:uploadId/anomalies', async (c) => {
  const { uploadId } = c.req.param()

  const analytics = await c.env.DB.prepare(
    `SELECT avg_engagement_rate FROM analytics WHERE upload_id = ? LIMIT 1`
  ).bind(uploadId).first<{ avg_engagement_rate: number }>()

  const avgER = analytics?.avg_engagement_rate ?? 0
  const threshold = avgER * 2.5

  const posts = await c.env.DB.prepare(
    `SELECT * FROM posts WHERE upload_id = ? AND engagement_rate >= ? ORDER BY engagement_rate DESC LIMIT 20`
  ).bind(uploadId, threshold).all()

  return c.json(posts.results)
})

// ── Forecast ──────────────────────────────────────────────────────────────────
app.get('/api/forecast/:uploadId', async (c) => {
  const { uploadId } = c.req.param()

  const analytics = await c.env.DB.prepare(
    `SELECT weekly_trend, avg_engagement_rate FROM analytics WHERE upload_id = ? LIMIT 1`
  ).bind(uploadId).first<{ weekly_trend: string; avg_engagement_rate: number }>()

  if (!analytics) return c.json({ error: 'Not found' }, 404)

  const weekly: Array<{ week: string; avg_er: number; total_reach: number; posts: number }> =
    JSON.parse(analytics.weekly_trend ?? '[]')

  if (weekly.length < 2) {
    return c.json({ error: 'Not enough data for forecast' }, 400)
  }

  // Simple linear regression over the last N weeks
  function linearForecast(values: number[], horizon = 4) {
    const n = values.length
    const xs = values.map((_, i) => i)
    const meanX = xs.reduce((a, b) => a + b, 0) / n
    const meanY = values.reduce((a, b) => a + b, 0) / n
    const slope = xs.reduce((acc, x, i) => acc + (x - meanX) * (values[i] - meanY), 0)
      / xs.reduce((acc, x) => acc + (x - meanX) ** 2, 0)
    const intercept = meanY - slope * meanX
    const residuals = values.map((v, i) => Math.abs(v - (intercept + slope * i)))
    const stdErr = residuals.reduce((a, b) => a + b, 0) / n

    const forecastVals = Array.from({ length: horizon }, (_, i) => intercept + slope * (n + i))
    return {
      forecast: forecastVals.map(v => Math.max(0, +v.toFixed(2))),
      lower: forecastVals.map(v => Math.max(0, +(v - stdErr * 1.5).toFixed(2))),
      upper: forecastVals.map(v => Math.max(0, +(v + stdErr * 1.5).toFixed(2))),
      trend: slope > 0.05 ? 'up' : slope < -0.05 ? 'down' : 'flat' as 'up' | 'down' | 'flat',
    }
  }

  const erValues    = weekly.map(w => w.avg_er)
  const reachValues = weekly.map(w => w.total_reach)
  const horizon     = 4
  const lastWeek    = new Date(weekly[weekly.length - 1].week)

  const futureDates = Array.from({ length: horizon }, (_, i) => {
    const d = new Date(lastWeek)
    d.setDate(d.getDate() + (i + 1) * 7)
    return d.toISOString().split('T')[0]
  })

  const erFC    = linearForecast(erValues, horizon)
  const reachFC = linearForecast(reachValues, horizon)

  return c.json({
    engagement_rate: {
      dates: futureDates,
      forecast: erFC.forecast,
      lower: erFC.lower,
      upper: erFC.upper,
      method: 'linear_regression',
      trend: erFC.trend,
      projected_30d: erFC.forecast[erFC.forecast.length - 1],
    },
    reach: {
      dates: futureDates,
      forecast: reachFC.forecast,
      lower: reachFC.lower,
      upper: reachFC.upper,
      method: 'linear_regression',
      trend: reachFC.trend,
      projected_30d: reachFC.forecast[reachFC.forecast.length - 1],
    },
  })
})

// ── Alerts ────────────────────────────────────────────────────────────────────
app.get('/api/alerts/:uploadId', async (c) => {
  const { uploadId } = c.req.param()

  // Check if alerts already generated for this upload
  const existing = await c.env.DB.prepare(
    `SELECT COUNT(*) as count FROM alerts WHERE upload_id = ?`
  ).bind(uploadId).first<{ count: number }>()

  if (!existing || existing.count === 0) {
    // Auto-generate alerts from analytics
    const analytics = await c.env.DB.prepare(
      `SELECT * FROM analytics WHERE upload_id = ? LIMIT 1`
    ).bind(uploadId).first<Record<string, unknown>>()

    if (analytics) {
      const avgER = analytics.avg_engagement_rate as number
      const reach = analytics.total_reach as number
      const posts = analytics.total_posts as number
      const followerGrowth = analytics.follower_growth as number
      const weeklyTrend: Array<{ avg_er: number }> = JSON.parse((analytics.weekly_trend as string) ?? '[]')

      const toInsert: Array<{ type: string; sev: string; title: string; desc: string; metric?: string; value?: number; baseline?: number }> = []

      // ER anomaly check
      if (avgER > 10) {
        toInsert.push({ type: 'milestone', sev: 'good', title: 'Exceptional Engagement Rate', desc: `Your avg ER of ${avgER.toFixed(2)}% is well above the industry benchmark of 1–3%. This signals a highly engaged audience.`, metric: 'avg_engagement_rate', value: avgER, baseline: 3 })
      } else if (avgER < 0.5) {
        toInsert.push({ type: 'threshold', sev: 'critical', title: 'Low Engagement Rate Detected', desc: `Your avg ER of ${avgER.toFixed(2)}% is below healthy benchmarks. Review content quality, posting times, and audience targeting.`, metric: 'avg_engagement_rate', value: avgER, baseline: 1 })
      }

      // Reach check
      if (reach > 0 && posts > 0) {
        const avgReachPerPost = reach / posts
        if (avgReachPerPost < 100) {
          toInsert.push({ type: 'threshold', sev: 'warning', title: 'Low Reach Per Post', desc: `Avg reach of ${Math.round(avgReachPerPost)} per post suggests limited distribution. Consider more consistent posting and engagement-boosting formats.`, metric: 'avg_reach_per_post', value: avgReachPerPost, baseline: 500 })
        }
      }

      // Follower growth
      if (followerGrowth < 0) {
        toInsert.push({ type: 'trend', sev: 'warning', title: 'Follower Decline Detected', desc: `You lost ${Math.abs(followerGrowth).toLocaleString()} followers this period. Audit content quality and posting cadence to reverse this trend.`, metric: 'follower_growth', value: followerGrowth, baseline: 0 })
      } else if (followerGrowth > 1000) {
        toInsert.push({ type: 'milestone', sev: 'good', title: 'Strong Follower Growth', desc: `You gained ${followerGrowth.toLocaleString()} new followers this period — a positive signal of growing reach and content resonance.`, metric: 'follower_growth', value: followerGrowth, baseline: 100 })
      }

      // Trend check
      if (weeklyTrend.length >= 3) {
        const recent = weeklyTrend.slice(-3)
        const declining = recent.every((w, i) => i === 0 || w.avg_er < recent[i - 1].avg_er)
        const improving = recent.every((w, i) => i === 0 || w.avg_er > recent[i - 1].avg_er)
        if (declining) {
          toInsert.push({ type: 'trend', sev: 'warning', title: 'Declining Engagement Trend', desc: 'Engagement rate has declined for 3 consecutive weeks. Consider refreshing your content strategy and testing new formats.', metric: 'engagement_trend' })
        } else if (improving) {
          toInsert.push({ type: 'trend', sev: 'good', title: 'Positive Engagement Trend', desc: 'Engagement rate has grown for 3 consecutive weeks — your content strategy is working. Double down on what\'s performing.', metric: 'engagement_trend' })
        }
      }

      // Posting volume check
      if (posts < 5) {
        toInsert.push({ type: 'threshold', sev: 'info', title: 'Low Post Volume', desc: `Only ${posts} posts in the dataset. Increase posting frequency to 3–5 times per week to improve algorithmic reach.`, metric: 'total_posts', value: posts, baseline: 20 })
      }

      if (toInsert.length === 0) {
        toInsert.push({ type: 'info', sev: 'info', title: 'Account Health Normal', desc: 'All key metrics are within expected ranges. Keep up the consistent posting strategy.', metric: 'overall' })
      }

      const batch = toInsert.map(a =>
        c.env.DB.prepare(
          `INSERT INTO alerts (id, upload_id, alert_type, severity, title, description, metric, value, baseline)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          crypto.randomUUID(), uploadId, a.type, a.sev, a.title, a.desc,
          a.metric ?? null, a.value ?? null, a.baseline ?? null
        )
      )
      if (batch.length) await c.env.DB.batch(batch)
    }
  }

  const alerts = await c.env.DB.prepare(
    `SELECT * FROM alerts WHERE upload_id = ? ORDER BY created_at DESC`
  ).bind(uploadId).all()

  return c.json({
    alerts: alerts.results.map(a => ({ ...a, dismissed: a.dismissed === 1 }))
  })
})

app.put('/api/alerts/:alertId/dismiss', async (c) => {
  const { alertId } = c.req.param()
  await c.env.DB.prepare(
    `UPDATE alerts SET dismissed = 1 WHERE id = ?`
  ).bind(alertId).run()
  return c.json({ dismissed: true })
})

// ── Goals ─────────────────────────────────────────────────────────────────────
app.get('/api/goals', async (c) => {
  const goals = await c.env.DB.prepare(
    `SELECT * FROM goals ORDER BY created_at DESC`
  ).all()
  return c.json({ goals: goals.results })
})

app.post('/api/goals', async (c) => {
  try {
    const body = await c.req.json<{
      name: string; metric: string; target: number; current?: number;
      deadline?: string; platform?: string
    }>()
    const { name, metric, target, current = 0, deadline, platform = 'all' } = body
    if (!name || !metric || !target) {
      return c.json({ error: 'name, metric, and target are required' }, 400)
    }
    const id = crypto.randomUUID()
    await c.env.DB.prepare(
      `INSERT INTO goals (id, name, metric, target, current, deadline, platform) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, name, metric, target, current, deadline ?? null, platform).run()
    const goal = await c.env.DB.prepare(`SELECT * FROM goals WHERE id = ?`).bind(id).first()
    return c.json(goal, 201)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: msg }, 500)
  }
})

app.put('/api/goals/:id', async (c) => {
  try {
    const { id } = c.req.param()
    const body = await c.req.json<Partial<{ name: string; metric: string; target: number; current: number; deadline: string; platform: string }>>()
    const fields = Object.entries(body)
      .filter(([, v]) => v !== undefined)
      .map(([k]) => `${k} = ?`)
      .join(', ')
    const values = Object.entries(body)
      .filter(([, v]) => v !== undefined)
      .map(([, v]) => v)
    if (!fields) return c.json({ error: 'No fields to update' }, 400)
    await c.env.DB.prepare(
      `UPDATE goals SET ${fields}, updated_at = datetime('now') WHERE id = ?`
    ).bind(...values, id).run()
    const goal = await c.env.DB.prepare(`SELECT * FROM goals WHERE id = ?`).bind(id).first()
    return c.json(goal)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: msg }, 500)
  }
})

app.delete('/api/goals/:id', async (c) => {
  const { id } = c.req.param()
  await c.env.DB.prepare(`DELETE FROM goals WHERE id = ?`).bind(id).run()
  return c.json({ deleted: true })
})

// ── Generate AI insights ──────────────────────────────────────────────────────
app.post('/api/ai/insights', async (c) => {
  try {
    const body = await c.req.json<{ upload_id?: string; uploadId?: string }>()
    const uploadId = body.upload_id ?? body.uploadId

    const analytics = await c.env.DB.prepare(
      `SELECT * FROM analytics WHERE upload_id = ?`
    ).bind(uploadId).first()
    if (!analytics) return c.json({ error: 'Analytics not found' }, 404)

    const topPosts = await c.env.DB.prepare(
      `SELECT * FROM posts WHERE upload_id = ? ORDER BY engagement_rate DESC LIMIT 10`
    ).bind(uploadId).all()

    const insights = await getInsights(
      c.env.ANTHROPIC_API_KEY,
      analytics as Record<string, unknown>,
      topPosts.results as Record<string, unknown>[],
    )

    // Cache in DB
    await c.env.DB.prepare(
      `INSERT INTO ai_insights (id, upload_id, insight_type, content) VALUES (?, ?, 'full_analysis', ?)`
    ).bind(crypto.randomUUID(), uploadId, JSON.stringify(insights)).run()

    return c.json(insights)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: msg }, 500)
  }
})

// ── Get cached AI insights ────────────────────────────────────────────────────
app.get('/api/ai/insights/:uploadId', async (c) => {
  const { uploadId } = c.req.param()

  const insight = await c.env.DB.prepare(`
    SELECT * FROM ai_insights
    WHERE upload_id = ? AND insight_type = 'full_analysis'
    ORDER BY created_at DESC LIMIT 1
  `).bind(uploadId).first()

  if (!insight) return c.json({ cached: false })

  return c.json({ cached: true, ...JSON.parse(insight.content as string), createdAt: insight.created_at })
})

// ── Explain a single post ─────────────────────────────────────────────────────
app.post('/api/ai/explain-post', async (c) => {
  try {
    const body = await c.req.json<{ postId?: string; post_id?: string; uploadId?: string; upload_id?: string }>()
    const postId = body.postId ?? body.post_id
    const uploadId = body.uploadId ?? body.upload_id

    const post = await c.env.DB.prepare(
      `SELECT * FROM posts WHERE id = ? AND upload_id = ?`
    ).bind(postId, uploadId).first()
    if (!post) return c.json({ error: 'Post not found' }, 404)

    const analytics = await c.env.DB.prepare(
      `SELECT avg_engagement_rate FROM analytics WHERE upload_id = ?`
    ).bind(uploadId).first<{ avg_engagement_rate: number }>()

    const explanation = await explainPost(
      c.env.ANTHROPIC_API_KEY,
      post as Record<string, unknown>,
      analytics?.avg_engagement_rate ?? 0,
    )

    return c.json({ explanation })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: msg }, 500)
  }
})

// ── Caption generator ─────────────────────────────────────────────────────────
app.post('/api/ai/captions', async (c) => {
  try {
    const body = await c.req.json<{ topic: string; tone: string; platform: string; count?: number }>()
    const { topic, tone, platform, count = 3 } = body

    if (!topic || !tone || !platform) {
      return c.json({ error: 'topic, tone, and platform are required' }, 400)
    }

    const captions = await generateCaptions(c.env.ANTHROPIC_API_KEY, { topic, tone, platform, count })
    return c.json({ captions })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: msg }, 500)
  }
})

// ── Hashtag strategy ──────────────────────────────────────────────────────────
app.post('/api/ai/hashtags', async (c) => {
  try {
    const body = await c.req.json<{ platform: string; niche: string; upload_id?: string }>()
    const { platform, niche } = body
    if (!platform || !niche) {
      return c.json({ error: 'platform and niche are required' }, 400)
    }
    const strategy = await generateHashtagStrategy(c.env.ANTHROPIC_API_KEY, { platform, niche })
    return c.json(strategy)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: msg }, 500)
  }
})

export default app
