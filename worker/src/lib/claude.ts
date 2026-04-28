// Auto-detects API based on key prefix:
//   sk-ant-...  → Anthropic API directly
//   sk-or-v1-... → OpenRouter
const ANTHROPIC_API  = 'https://api.anthropic.com/v1/messages'
const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions'
const ANTHROPIC_MODEL  = 'claude-sonnet-4-5'
const OPENROUTER_MODEL = 'anthropic/claude-sonnet-4-5'

async function callLLM(apiKey: string, prompt: string, maxTokens = 1500): Promise<string> {
  const isAnthropic = apiKey.startsWith('sk-ant-')

  if (isAnthropic) {
    // ── Anthropic direct ──────────────────────────────────────────────────
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Anthropic API ${res.status}: ${body}`)
    }
    const data = await res.json() as { content: { type: string; text: string }[] }
    return data.content[0].text

  } else {
    // ── OpenRouter ────────────────────────────────────────────────────────
    const res = await fetch(OPENROUTER_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://eiden-smm.pages.dev',
        'X-Title': 'EIDEN SMM Analytics',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`OpenRouter API ${res.status}: ${body}`)
    }
    const data = await res.json() as { choices: { message: { content: string } }[] }
    return data.choices[0].message.content
  }
}

function extractJSON<T>(text: string): T {
  const objMatch = text.match(/\{[\s\S]*\}/)
  const arrMatch = text.match(/\[[\s\S]*\]/)
  const raw = objMatch?.[0] ?? arrMatch?.[0]
  if (!raw) throw new Error('No JSON found in AI response')
  return JSON.parse(raw) as T
}

// ── AI Insights ───────────────────────────────────────────────────────────────

export interface InsightsResult {
  executive_summary: string
  performance_score: number
  key_highlights: string[]
  content_analysis: string
  audience_insights: string
  anomaly_commentary: string
  growth_forecast_summary: string
  recommendations: string[]
  content_strategy_30d: string
  growth_opportunities: string
  risk_flags: string
  model_used: string
}

export async function getInsights(
  apiKey: string,
  analytics: Record<string, unknown>,
  topPosts: Record<string, unknown>[]
): Promise<InsightsResult> {
  const topPostsText = topPosts.slice(0, 5).map((p, i) =>
    `${i + 1}. ${p.post_type ?? 'Post'} — ER: ${p.engagement_rate}% | Likes: ${p.likes} | Comments: ${p.comments} | Reach: ${p.reach}`
  ).join('\n')

  const prompt = `You are an expert social media strategist. Analyse this performance data and deliver sharp, actionable insights.

Platform: ${analytics.platform}
Period: ${analytics.date_range_start} → ${analytics.date_range_end}
Total Posts: ${analytics.total_posts}
Avg Engagement Rate: ${analytics.avg_engagement_rate}%
Total Reach: ${Number(analytics.total_reach).toLocaleString()}
Total Likes: ${Number(analytics.total_likes).toLocaleString()}
Total Comments: ${Number(analytics.total_comments).toLocaleString()}
Total Shares: ${Number(analytics.total_shares).toLocaleString()}
Follower Count: ${Number(analytics.follower_count).toLocaleString()}
Follower Growth: ${(analytics.follower_growth as number) >= 0 ? '+' : ''}${Number(analytics.follower_growth).toLocaleString()}

Top Posts by Engagement:
${topPostsText}

Reply ONLY with valid JSON — no prose outside the JSON block:
{
  "executive_summary": "2–3 sentence executive summary with concrete numbers and a clear performance verdict",
  "performance_score": <integer 0–100 representing overall account health>,
  "key_highlights": [
    "highlight with a specific data point",
    "highlight with a specific data point",
    "highlight with a specific data point",
    "highlight with a specific data point"
  ],
  "content_analysis": "1–2 paragraphs on what content formats and topics are driving results, with specific observations",
  "audience_insights": "What the engagement patterns reveal about the audience — timing, preferences, behaviour",
  "anomaly_commentary": "Notable outliers or surprises in the data and what they suggest",
  "growth_forecast_summary": "Based on current trajectory, projected growth direction and key levers",
  "recommendations": [
    "specific actionable recommendation 1",
    "specific actionable recommendation 2",
    "specific actionable recommendation 3",
    "specific actionable recommendation 4",
    "specific actionable recommendation 5"
  ],
  "content_strategy_30d": "Concrete 30-day content plan — post types, topics, cadence, and platform-specific tactics",
  "growth_opportunities": "Top 2–3 growth levers identified from the data with estimated impact",
  "risk_flags": "Any warning signs, declining metrics, or risks to watch"
}`

  const text = await callLLM(apiKey, prompt, 1800)
  const result = extractJSON<InsightsResult>(text)
  result.model_used = ANTHROPIC_MODEL
  return result
}

// ── Captions ──────────────────────────────────────────────────────────────────

export interface Caption {
  caption: string
  hashtags: string[]
  hook?: string
  call_to_action?: string
}

export async function generateCaptions(
  apiKey: string,
  params: { topic: string; tone: string; platform: string; count: number }
): Promise<Caption[]> {
  const prompt = `Generate ${params.count} distinct social media captions for ${params.platform}.

Topic: ${params.topic}
Tone: ${params.tone}
Platform: ${params.platform}

Each caption should take a different angle or hook. Optimise length and style for ${params.platform}.
Include 5–8 relevant hashtags per caption (no # prefix in the array).
Include a strong opening hook and a clear call to action.

Reply ONLY with a JSON array — no text outside it:
[
  {
    "caption": "full caption text ready to post",
    "hook": "the opening hook line",
    "call_to_action": "the CTA at the end",
    "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5"]
  }
]`

  const text = await callLLM(apiKey, prompt, 1500)
  return extractJSON<Caption[]>(text)
}

// ── Explain single post ───────────────────────────────────────────────────────

export async function explainPost(
  apiKey: string,
  post: Record<string, unknown>,
  avgER: number
): Promise<string> {
  const direction = (post.engagement_rate as number) > avgER ? 'outperformed' : 'underperformed'

  const prompt = `You're a social media expert. Explain in 2–3 sentences why this post ${direction} the average engagement rate of ${avgER}%.

Post details:
- Type: ${post.post_type}
- Posted: ${post.posted_at}
- ER: ${post.engagement_rate}%
- Likes: ${post.likes} | Comments: ${post.comments} | Shares: ${post.shares} | Saves: ${post.saves}
- Reach: ${post.reach}
- Caption preview: "${String(post.caption ?? '').slice(0, 120)}"

Give a direct, data-informed explanation. No bullet points — flowing prose only.`

  return callLLM(apiKey, prompt, 300)
}

// ── Hashtag Strategy ──────────────────────────────────────────────────────────

export interface HashtagBucket {
  tags: string[]
  description: string
}

export interface HashtagStrategy {
  mega: HashtagBucket
  macro: HashtagBucket
  micro: HashtagBucket
  niche: HashtagBucket
  recommended_mix: string
  strategy_notes: string
}

export async function generateHashtagStrategy(
  apiKey: string,
  params: { platform: string; niche: string }
): Promise<HashtagStrategy> {
  const prompt = `You are a social media growth expert. Generate a comprehensive hashtag strategy for ${params.platform}.

Niche: ${params.niche}
Platform: ${params.platform}

Create a tiered hashtag strategy with 4 buckets. All hashtags should be without the # symbol.

Reply ONLY with valid JSON — no prose outside the JSON block:
{
  "mega": {
    "tags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5"],
    "description": "Broad reach tags with 1M+ posts — use sparingly for discoverability"
  },
  "macro": {
    "tags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5", "hashtag6"],
    "description": "Mid-tier tags with 500K–1M posts — balance between reach and competition"
  },
  "micro": {
    "tags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5", "hashtag6", "hashtag7"],
    "description": "Targeted tags with 50K–500K posts — higher engagement likelihood"
  },
  "niche": {
    "tags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5", "hashtag6", "hashtag7", "hashtag8"],
    "description": "Community-specific tags with <50K posts — strongest engagement rates"
  },
  "recommended_mix": "Use 2–3 mega + 4–5 macro + 5–6 micro + 6–8 niche for optimal reach/engagement balance on ${params.platform}",
  "strategy_notes": "Tactical notes specific to ${params.niche} on ${params.platform} — best practices, posting tips, seasonal considerations"
}`

  const text = await callLLM(apiKey, prompt, 1000)
  return extractJSON<HashtagStrategy>(text)
}
