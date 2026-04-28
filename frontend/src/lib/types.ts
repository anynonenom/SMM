export type Platform = 'instagram' | 'linkedin' | 'twitter' | 'facebook' | 'tiktok' | 'youtube' | 'generic'
export type Severity  = 'critical' | 'warning' | 'info' | 'good'
export type AlertType = 'anomaly' | 'threshold' | 'trend' | 'milestone'

// ── Posts ─────────────────────────────────────────────────────────────────────
export interface PostData {
  id?: string
  upload_id?: string
  platform?: string
  post_id?: string
  posted_at?: string
  post_type?: string
  caption?: string
  likes: number
  comments: number
  shares: number
  saves: number
  reach: number
  impressions: number
  engagement_rate: number
  virality_rate?: number
  save_rate?: number
  z_score?: number
  is_anomaly?: boolean
  story_exits?: number
  story_replies?: number
  video_views?: number
  video_completion_rate?: number
  hashtags?: string[]
}

export interface PostsResponse {
  posts: PostData[]
  total: number
  page: number
  limit: number
}

// ── Time-series ───────────────────────────────────────────────────────────────
export interface WeeklyTrend {
  week: string
  posts: number
  avg_er: number
  total_reach: number
  total_likes: number
}

export interface MonthlyTrend {
  month: string       // "2024-01"
  posts: number
  avg_er: number
  total_reach: number
  total_likes: number
  total_comments: number
  total_shares: number
  total_impressions: number
}

export interface YearlyTrend {
  year: number
  posts: number
  avg_er: number
  total_reach: number
  total_likes: number
  total_comments: number
  total_shares: number
  total_impressions: number
}

export interface DailyTrend {
  date: string
  posts: number
  avg_er: number
  reach: number
}

export type Period = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface PostingTime {
  day: number
  hour: number
  avg_er: number
  count: number
}

export interface PostTypeBreakdown {
  [type: string]: { count: number; avg_er: number; avg_reach: number; total_likes: number; pct: number }
}

export interface TopHashtag {
  tag: string
  count: number
  avg_er: number
}

// ── Forecast ──────────────────────────────────────────────────────────────────
export interface ForecastSeries {
  dates: string[]
  forecast: number[]
  lower: number[]
  upper: number[]
  method: 'holt_winters' | 'linear_regression'
  trend: 'up' | 'down' | 'flat'
  projected_30d: number
}

export interface ForecastData {
  reach: ForecastSeries
  engagement_rate: ForecastSeries
}

// ── Audience ──────────────────────────────────────────────────────────────────
export interface AudienceData {
  age_breakdown: { group: string; pct: number }[]
  gender_breakdown: { gender: string; pct: number }[]
  top_locations: { location: string; pct: number }[]
  active_hours: { hour: number; activity_score: number }[]
  follower_quality_score: number
  audience_growth_rate: number
}

// ── Analytics ─────────────────────────────────────────────────────────────────
export interface AnalyticsData {
  id?: string
  upload_id: string
  platform: Platform
  date_range_start?: string
  date_range_end?: string
  total_posts: number
  avg_engagement_rate: number
  median_engagement_rate?: number
  er_std?: number
  er_p75?: number
  er_p90?: number
  total_reach: number
  total_impressions: number
  total_likes: number
  total_comments: number
  total_shares: number
  total_saves: number
  virality_rate?: number
  save_rate?: number
  comment_rate?: number
  follower_count: number
  follower_growth: number
  avg_reach_per_post?: number
  posting_frequency?: number
  best_posting_day?: number
  best_posting_hour?: number
  top_post_type?: string
  engagement_trend?: 'up' | 'flat' | 'down'
  reach_growth_rate?: number
  caption_length_impact?: number
  weekly_trend: WeeklyTrend[]
  monthly_trend?: MonthlyTrend[]
  yearly_trend?: YearlyTrend[]
  daily_trend?: DailyTrend[]
  posting_heatmap: PostingTime[]
  post_type_breakdown: PostTypeBreakdown
  top_hashtags?: TopHashtag[]
  forecast_data?: ForecastData
  anomalies?: Alert[]
  audience_data?: AudienceData
  top_posts?: PostData[]
  worst_posts?: PostData[]
  anomaly_posts?: PostData[]
  upload?: Upload
}

// ── Upload ────────────────────────────────────────────────────────────────────
export interface UploadSummary {
  platform: Platform
  total_posts: number
  avg_engagement_rate: number
  total_reach: number
  follower_count: number
  engagement_trend: 'up' | 'flat' | 'down' | string
  date_range_start?: string | null
  date_range_end?: string | null
}

export interface Upload {
  id: string
  platform: Platform
  filename: string
  row_count: number
  status: string
  file_group_id?: string | null
  created_at: string
  total_posts?: number
  avg_engagement_rate?: number
  total_reach?: number
  follower_count?: number
  summary?: UploadSummary | null
}

export interface UploadResponse {
  upload_id: string
  platform: Platform
  row_count: number
  analytics: AnalyticsData
  // multi-platform response
  multi_platform?: boolean
  file_group_id?: string
  platforms?: string[]
  uploads?: UploadResponse[]
}

// ── AI Insights ───────────────────────────────────────────────────────────────
export interface AIInsights {
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
  cached?: boolean
  created_at?: string
  model_used?: string
}

export interface AIHtmlReport {
  upload_id: string
  cached: boolean
  model_used?: string
  created_at?: string
  report_html: string
}

// ── Captions ──────────────────────────────────────────────────────────────────
export interface Caption {
  caption: string
  hashtags: string[]
  hook?: string
  call_to_action?: string
}

// ── Hashtag Strategy ─────────────────────────────────────────────────────────
export interface HashtagBucket { tags: string[]; description: string }
export interface HashtagStrategy {
  mega: HashtagBucket
  macro: HashtagBucket
  micro: HashtagBucket
  niche: HashtagBucket
  recommended_mix: string
  strategy_notes: string
}

// ── Alerts ────────────────────────────────────────────────────────────────────
export interface Alert {
  id: string
  upload_id?: string
  alert_type: AlertType
  severity: Severity
  title: string
  description: string
  metric?: string
  value?: number
  baseline?: number
  post_id?: string
  dismissed: boolean
  created_at: string
}

// ── Goals ─────────────────────────────────────────────────────────────────────
export interface Goal {
  id: string
  name: string
  metric: string
  target: number
  current: number
  deadline?: string
  platform?: string
  created_at: string
  updated_at?: string
}
