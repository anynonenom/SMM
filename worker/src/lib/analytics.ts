import type { Platform } from './csv-parser'

// ── Output types (snake_case to match frontend AnalyticsData) ─────────────────

export interface PostData {
  post_id: string
  posted_at: string
  post_type: string
  caption: string
  likes: number
  comments: number
  shares: number
  saves: number
  reach: number
  impressions: number
  engagement_rate: number
  virality_rate: number
  save_rate: number
  z_score?: number
  is_anomaly?: boolean
}

export interface WeeklyTrend {
  week: string
  posts: number
  avg_er: number
  total_reach: number
  total_likes: number
}

export interface PostingTime {
  day: number
  hour: number
  avg_er: number
  count: number
}

export interface PostTypeStats {
  count: number
  avg_er: number
  avg_reach: number
  total_likes: number
  pct: number
}

export interface TopHashtag {
  tag: string
  count: number
  avg_er: number
}

export interface AnalyticsResult {
  platform: Platform
  total_posts: number
  avg_engagement_rate: number
  median_engagement_rate: number
  er_std: number
  er_p75: number
  er_p90: number
  total_reach: number
  total_impressions: number
  total_likes: number
  total_comments: number
  total_shares: number
  total_saves: number
  virality_rate: number
  save_rate: number
  comment_rate: number
  follower_count: number
  follower_growth: number
  avg_reach_per_post: number
  posting_frequency: number
  best_posting_day: number
  best_posting_hour: number
  top_post_type: string
  engagement_trend: 'up' | 'flat' | 'down'
  reach_growth_rate: number
  date_range_start: string
  date_range_end: string
  weekly_trend: WeeklyTrend[]
  posting_heatmap: PostingTime[]
  post_type_breakdown: Record<string, PostTypeStats>
  top_hashtags: TopHashtag[]
  top_posts: PostData[]
  worst_posts: PostData[]
  anomaly_posts: PostData[]
  posts: PostData[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function num(val: string | undefined): number {
  if (!val) return 0
  return parseFloat(val.replace(/[,\s%$]/g, '')) || 0
}

function find(row: Record<string, string>, ...candidates: string[]): string {
  const rowKeys = Object.keys(row)
  for (const c of candidates) {
    const norm = c.toLowerCase().replace(/[\s_\-]/g, '')
    const match = rowKeys.find(k => k.toLowerCase().replace(/[\s_\-]/g, '') === norm)
    if (match && row[match]) return row[match]
  }
  for (const c of candidates) {
    const norm = c.toLowerCase().replace(/[\s_\-]/g, '')
    const match = rowKeys.find(k => k.toLowerCase().replace(/[\s_\-]/g, '').includes(norm))
    if (match && row[match]) return row[match]
  }
  return ''
}

function weekStart(date: Date): string {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d.toISOString().split('T')[0]
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]
}

function stdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function extractHashtags(text: string): string[] {
  return (text.match(/#(\w+)/g) ?? []).map(t => t.slice(1).toLowerCase())
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function computeAnalytics(rows: Record<string, string>[], platform: Platform): AnalyticsResult {
  const posts: PostData[] = []

  for (const row of rows) {
    const likes       = num(find(row, 'likes', 'like_count', 'reactions', 'likes_count', 'heart'))
    const comments    = num(find(row, 'comments', 'comment_count', 'comments_count', 'replies'))
    const shares      = num(find(row, 'shares', 'share_count', 'retweets', 'reposts', 'reshares'))
    const saves       = num(find(row, 'saves', 'save_count', 'bookmarks', 'saved'))
    const reach       = num(find(row, 'reach', 'accounts_reached', 'unique_impressions', 'unique_views'))
    const impressions = num(find(row, 'impressions', 'impression_count', 'views', 'video_views', 'total_impressions'))
    const followersRaw = num(find(row, 'followers', 'follower_count', 'subscribers', 'page_followers'))

    const engagements = likes + comments + shares + saves
    const denominator = reach || impressions || followersRaw || 1000
    const er = engagements > 0 ? (engagements / denominator) * 100 : 0
    const virality = shares > 0 && reach > 0 ? (shares / reach) * 100 : 0
    const saveRate = saves > 0 && reach > 0 ? (saves / reach) * 100 : 0

    const posted_at = find(row, 'date', 'posted_at', 'post_date', 'publish_time', 'timestamp', 'created_time', 'published', 'time', 'post_timestamp')
    const post_type = find(row, 'post_type', 'media_type', 'content_type', 'type', 'format') || 'Post'
    const caption   = find(row, 'caption', 'description', 'post_text', 'message', 'text', 'title') || ''
    const post_id   = find(row, 'post_id', 'id', 'post_url', 'permalink', 'url') || crypto.randomUUID()

    posts.push({
      post_id, posted_at, post_type, caption,
      likes, comments, shares, saves, reach, impressions,
      engagement_rate: Math.round(er * 100) / 100,
      virality_rate:   Math.round(virality * 100) / 100,
      save_rate:       Math.round(saveRate * 100) / 100,
    })
  }

  const n = posts.length
  if (n === 0) {
    return {
      platform, total_posts: 0, avg_engagement_rate: 0, median_engagement_rate: 0,
      er_std: 0, er_p75: 0, er_p90: 0, total_reach: 0, total_impressions: 0,
      total_likes: 0, total_comments: 0, total_shares: 0, total_saves: 0,
      virality_rate: 0, save_rate: 0, comment_rate: 0, follower_count: 0,
      follower_growth: 0, avg_reach_per_post: 0, posting_frequency: 0,
      best_posting_day: 0, best_posting_hour: 9, top_post_type: '',
      engagement_trend: 'flat', reach_growth_rate: 0,
      date_range_start: '', date_range_end: '',
      weekly_trend: [], posting_heatmap: [], post_type_breakdown: {},
      top_hashtags: [], top_posts: [], worst_posts: [], anomaly_posts: [], posts: [],
    }
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  const total_likes       = posts.reduce((s, p) => s + p.likes, 0)
  const total_comments    = posts.reduce((s, p) => s + p.comments, 0)
  const total_shares      = posts.reduce((s, p) => s + p.shares, 0)
  const total_saves       = posts.reduce((s, p) => s + p.saves, 0)
  const total_reach       = posts.reduce((s, p) => s + p.reach, 0)
  const total_impressions = posts.reduce((s, p) => s + p.impressions, 0)

  // ── ER stats ──────────────────────────────────────────────────────────────
  const erValues = posts.map(p => p.engagement_rate)
  const erSorted = [...erValues].sort((a, b) => a - b)
  const avg_engagement_rate    = Math.round((erValues.reduce((s, v) => s + v, 0) / n) * 100) / 100
  const median_engagement_rate = Math.round(percentile(erSorted, 50) * 100) / 100
  const er_std  = Math.round(stdDev(erValues, avg_engagement_rate) * 100) / 100
  const er_p75  = Math.round(percentile(erSorted, 75) * 100) / 100
  const er_p90  = Math.round(percentile(erSorted, 90) * 100) / 100

  // Z-scores & anomaly detection
  posts.forEach(p => {
    p.z_score    = er_std > 0 ? Math.round(((p.engagement_rate - avg_engagement_rate) / er_std) * 100) / 100 : 0
    p.is_anomaly = Math.abs(p.z_score ?? 0) > 2
  })

  // ── Follower data ─────────────────────────────────────────────────────────
  const firstRow = rows[0] ?? {}
  const lastRow  = rows[rows.length - 1] ?? {}
  const follower_count  = num(find(lastRow,  'followers', 'follower_count', 'subscribers'))
  const followerStart   = num(find(firstRow, 'followers', 'follower_count', 'subscribers'))
  const follower_growth = follower_count - followerStart

  // ── Date range ────────────────────────────────────────────────────────────
  const dates = posts.map(p => p.posted_at).filter(Boolean).sort()
  const date_range_start = dates[0] ?? ''
  const date_range_end   = dates[dates.length - 1] ?? ''

  // ── Rates ─────────────────────────────────────────────────────────────────
  const denom = total_reach || total_impressions || 1
  const virality_rate  = Math.round((total_shares / denom) * 100 * 100) / 100
  const save_rate      = Math.round((total_saves  / denom) * 100 * 100) / 100
  const comment_rate   = Math.round((total_comments / denom) * 100 * 100) / 100
  const avg_reach_per_post = Math.round(total_reach / n)

  // ── Posting frequency ─────────────────────────────────────────────────────
  let posting_frequency = 0
  if (dates.length >= 2) {
    const firstDate = new Date(dates[0]).getTime()
    const lastDate  = new Date(dates[dates.length - 1]).getTime()
    const weeks = (lastDate - firstDate) / (7 * 24 * 60 * 60 * 1000) || 1
    posting_frequency = Math.round((n / weeks) * 10) / 10
  }

  // ── Post type breakdown ───────────────────────────────────────────────────
  const typeMap: Record<string, { count: number; totalER: number; totalReach: number; totalLikes: number }> = {}
  posts.forEach(p => {
    const t = p.post_type || 'Post'
    if (!typeMap[t]) typeMap[t] = { count: 0, totalER: 0, totalReach: 0, totalLikes: 0 }
    typeMap[t].count++
    typeMap[t].totalER     += p.engagement_rate
    typeMap[t].totalReach  += p.reach
    typeMap[t].totalLikes  += p.likes
  })
  const post_type_breakdown: Record<string, PostTypeStats> = {}
  Object.entries(typeMap).forEach(([type, d]) => {
    post_type_breakdown[type] = {
      count:       d.count,
      avg_er:      Math.round((d.totalER / d.count) * 100) / 100,
      avg_reach:   Math.round(d.totalReach / d.count),
      total_likes: d.totalLikes,
      pct:         Math.round((d.count / n) * 100),
    }
  })

  // Top post type by avg ER
  const top_post_type = Object.entries(post_type_breakdown)
    .sort((a, b) => b[1].avg_er - a[1].avg_er)[0]?.[0] ?? ''

  // ── Weekly trend ──────────────────────────────────────────────────────────
  const weekMap: Record<string, { posts: number; totalER: number; reach: number; likes: number }> = {}
  posts.forEach(p => {
    if (!p.posted_at) return
    const d = new Date(p.posted_at)
    if (isNaN(d.getTime())) return
    const wk = weekStart(d)
    if (!weekMap[wk]) weekMap[wk] = { posts: 0, totalER: 0, reach: 0, likes: 0 }
    weekMap[wk].posts++
    weekMap[wk].totalER += p.engagement_rate
    weekMap[wk].reach   += p.reach
    weekMap[wk].likes   += p.likes
  })
  const weekly_trend: WeeklyTrend[] = Object.entries(weekMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, d]) => ({
      week,
      posts:       d.posts,
      avg_er:      Math.round((d.totalER / d.posts) * 100) / 100,
      total_reach: d.reach,
      total_likes: d.likes,
    }))

  // ── Engagement trend ──────────────────────────────────────────────────────
  let engagement_trend: 'up' | 'flat' | 'down' = 'flat'
  if (weekly_trend.length >= 3) {
    const recent = weekly_trend.slice(-3)
    const slope = recent[recent.length - 1].avg_er - recent[0].avg_er
    engagement_trend = slope > 0.3 ? 'up' : slope < -0.3 ? 'down' : 'flat'
  }

  // ── Reach growth rate ─────────────────────────────────────────────────────
  let reach_growth_rate = 0
  if (weekly_trend.length >= 2) {
    const first = weekly_trend[0].total_reach
    const last  = weekly_trend[weekly_trend.length - 1].total_reach
    reach_growth_rate = first > 0 ? Math.round(((last - first) / first) * 100 * 10) / 10 : 0
  }

  // ── Posting heatmap (day × hour) ──────────────────────────────────────────
  const heatMap: Record<string, { totalER: number; count: number }> = {}
  posts.forEach(p => {
    if (!p.posted_at) return
    const d = new Date(p.posted_at)
    if (isNaN(d.getTime())) return
    const key = `${d.getDay()}-${d.getHours()}`
    if (!heatMap[key]) heatMap[key] = { totalER: 0, count: 0 }
    heatMap[key].totalER += p.engagement_rate
    heatMap[key].count++
  })
  const posting_heatmap: PostingTime[] = Object.entries(heatMap).map(([key, d]) => {
    const [day, hour] = key.split('-').map(Number)
    return { day, hour, avg_er: Math.round((d.totalER / d.count) * 100) / 100, count: d.count }
  })

  // Best posting time
  const bestSlot = posting_heatmap.sort((a, b) => b.avg_er - a.avg_er)[0]
  const best_posting_day  = bestSlot?.day  ?? 0
  const best_posting_hour = bestSlot?.hour ?? 9

  // ── Hashtags ──────────────────────────────────────────────────────────────
  const tagMap: Record<string, { count: number; totalER: number }> = {}
  posts.forEach(p => {
    const tags = extractHashtags(p.caption)
    tags.forEach(tag => {
      if (!tagMap[tag]) tagMap[tag] = { count: 0, totalER: 0 }
      tagMap[tag].count++
      tagMap[tag].totalER += p.engagement_rate
    })
  })
  const top_hashtags = Object.entries(tagMap)
    .map(([tag, d]) => ({ tag, count: d.count, avg_er: Math.round((d.totalER / d.count) * 100) / 100 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30)

  // ── Top / worst / anomaly posts ───────────────────────────────────────────
  const byER        = [...posts].sort((a, b) => b.engagement_rate - a.engagement_rate)
  const top_posts   = byER.slice(0, 10)
  const worst_posts = byER.slice(-5).reverse()
  const anomaly_posts = posts.filter(p => p.is_anomaly && p.engagement_rate > avg_engagement_rate).slice(0, 10)

  return {
    platform,
    total_posts:           n,
    avg_engagement_rate,
    median_engagement_rate,
    er_std,
    er_p75,
    er_p90,
    total_reach,
    total_impressions,
    total_likes,
    total_comments,
    total_shares,
    total_saves,
    virality_rate,
    save_rate,
    comment_rate,
    follower_count,
    follower_growth,
    avg_reach_per_post,
    posting_frequency,
    best_posting_day,
    best_posting_hour,
    top_post_type,
    engagement_trend,
    reach_growth_rate,
    date_range_start,
    date_range_end,
    weekly_trend,
    posting_heatmap,
    post_type_breakdown,
    top_hashtags,
    top_posts,
    worst_posts,
    anomaly_posts,
    posts,
  }
}
