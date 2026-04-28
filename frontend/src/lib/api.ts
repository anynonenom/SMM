import type {
  UploadResponse, AnalyticsData, PostsResponse, PostData,
  Upload, ForecastData, AIInsights, AIHtmlReport, Caption, HashtagStrategy,
  Alert, Goal,
} from './types'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5001'

function getToken(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem('eiden_token') ?? ''
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}`, ...extra } : { ...extra }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...authHeaders(),
    ...(init?.headers as Record<string, string> ?? {}),
  }
  const res = await fetch(`${API}${path}`, { ...init, headers })
  if (res.status === 401) {
    // Token expired — clear it and reload to login
    if (typeof window !== 'undefined') {
      localStorage.removeItem('eiden_token')
      window.location.href = '/login'
    }
    throw new Error('Session expired')
  }
  const data = await res.json() as T & { error?: string }
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  return data
}

// ── Upload ────────────────────────────────────────────────────────────────────
export function uploadCSV(file: File): Promise<UploadResponse> {
  const form = new FormData()
  form.append('file', file)
  return req<UploadResponse>('/api/upload', {
    method: 'POST',
    body: form,
    headers: authHeaders(),   // no Content-Type so browser sets multipart boundary
  })
}

export function getUploadGroup(fileGroupId: string): Promise<{ file_group_id: string; uploads: Upload[] }> {
  return req(`/api/uploads/group/${fileGroupId}`)
}

// ── Analytics ─────────────────────────────────────────────────────────────────
export function getAnalytics(uploadId: string): Promise<AnalyticsData> {
  return req<AnalyticsData>(`/api/analytics/${uploadId}`)
}

export function getUploads(): Promise<Upload[] | { uploads: Upload[] }> {
  return req<Upload[] | { uploads: Upload[] }>('/api/uploads')
}

export function deleteUpload(id: string): Promise<void> {
  return req<void>(`/api/uploads/${id}`, { method: 'DELETE' })
}

export function getForecast(uploadId: string): Promise<ForecastData> {
  return req<ForecastData>(`/api/forecast/${uploadId}`)
}

// ── Posts ─────────────────────────────────────────────────────────────────────
export function getPosts(
  uploadId: string,
  sort = 'engagement_rate',
  dir = 'desc',
  page = 1,
  type?: string,
  search?: string,
): Promise<PostsResponse> {
  const params = new URLSearchParams({ sort, dir, page: String(page) })
  if (type)   params.set('type', type)
  if (search) params.set('search', search)
  return req<PostsResponse>(`/api/posts/${uploadId}?${params}`)
}

export function getTopPosts(uploadId: string): Promise<PostData[]> {
  return req<PostData[]>(`/api/posts/${uploadId}/top`)
}

export function getAnomalyPosts(uploadId: string): Promise<PostData[]> {
  return req<PostData[]>(`/api/posts/${uploadId}/anomalies`)
}

// ── AI ────────────────────────────────────────────────────────────────────────
export function getCachedInsights(uploadId: string): Promise<AIInsights & { cached: boolean }> {
  return req<AIInsights & { cached: boolean }>(`/api/ai/insights/${uploadId}`)
}

export function generateInsights(uploadId: string): Promise<AIInsights> {
  return req<AIInsights>('/api/ai/insights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ upload_id: uploadId }),
  })
}

export function getCachedHtmlReport(uploadId: string): Promise<AIHtmlReport | { upload_id: string; cached: false }> {
  return req<AIHtmlReport | { upload_id: string; cached: false }>(`/api/ai/report/html/${uploadId}`)
}

export function generateHtmlReport(uploadId: string, force = false): Promise<AIHtmlReport> {
  return req<AIHtmlReport>('/api/ai/report/html', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ upload_id: uploadId, force }),
  })
}

export async function downloadPdfReport(uploadId: string, force = false): Promise<Blob> {
  const params = new URLSearchParams({ force: String(force) })
  const res = await fetch(`${API}/api/ai/report/pdf/${uploadId}?${params}`, {
    headers: authHeaders(),
  })
  if (!res.ok) {
    try {
      const data = await res.json() as { error?: string }
      throw new Error(data.error ?? `HTTP ${res.status}`)
    } catch {
      throw new Error(`HTTP ${res.status}`)
    }
  }
  return res.blob()
}

export async function downloadAnalyticsPdf(uploadId: string): Promise<Blob> {
  const res = await fetch(`${API}/api/report/pdf/${uploadId}`, {
    headers: authHeaders(),
  })
  if (!res.ok) {
    try {
      const data = await res.json() as { error?: string }
      throw new Error(data.error ?? `HTTP ${res.status}`)
    } catch {
      throw new Error(`HTTP ${res.status}`)
    }
  }
  return res.blob()
}

export function explainPost(postId: string, uploadId: string): Promise<{ explanation: string }> {
  return req<{ explanation: string }>('/api/ai/explain-post', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ post_id: postId, upload_id: uploadId }),
  })
}

export function generateCaptions(params: {
  topic: string; tone: string; platform: string; count?: number; upload_id?: string
}): Promise<{ captions: Caption[] }> {
  return req<{ captions: Caption[] }>('/api/ai/captions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
}

export function generateHashtagStrategy(params: {
  platform: string; niche: string; upload_id?: string
}): Promise<HashtagStrategy> {
  return req<HashtagStrategy>('/api/ai/hashtags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
}

// ── Alerts ────────────────────────────────────────────────────────────────────
export function getAlerts(uploadId: string): Promise<{ alerts: Alert[] }> {
  return req<{ alerts: Alert[] }>(`/api/alerts/${uploadId}`)
}

export function dismissAlert(alertId: string): Promise<void> {
  return req<void>(`/api/alerts/${alertId}/dismiss`, { method: 'PUT' })
}

// ── Goals ─────────────────────────────────────────────────────────────────────
export function getGoals(): Promise<{ goals: Goal[] }> {
  return req<{ goals: Goal[] }>('/api/goals')
}

export function createGoal(data: Partial<Goal>): Promise<Goal> {
  return req<Goal>('/api/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function updateGoal(id: string, data: Partial<Goal>): Promise<Goal> {
  return req<Goal>(`/api/goals/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function deleteGoal(id: string): Promise<void> {
  return req<void>(`/api/goals/${id}`, { method: 'DELETE' })
}

// ── Compare ───────────────────────────────────────────────────────────────────
export function getComparison(idA: string, idB: string): Promise<CompareData> {
  return req<CompareData>(`/api/compare/${idA}/${idB}`)
}

export interface CompareUploadSummary {
  id: string
  filename: string
  platform: string
  total_posts: number
  avg_engagement_rate: number
  date_range_start: string | null
  date_range_end: string | null
  engagement_trend: string
}

export interface CompareMetric {
  key: string
  label: string
  unit: string
  a: number
  b: number
  delta: number
  delta_pct: number
  trend: 'up' | 'down' | 'flat'
}

export interface CompareTrendDay {
  date: string
  posts: number
  avg_er: number
  reach: number
}

export interface CompareTrendWeek {
  week: string
  posts: number
  avg_er: number
  total_reach: number
  total_likes: number
}

export interface CompareTrendMonth {
  month: string
  posts: number
  avg_er: number
  total_reach: number
}

export interface CompareData {
  upload_a: CompareUploadSummary
  upload_b: CompareUploadSummary
  metrics: CompareMetric[]
  daily_a: CompareTrendDay[]
  daily_b: CompareTrendDay[]
  weekly_a: CompareTrendWeek[]
  weekly_b: CompareTrendWeek[]
  monthly_a: CompareTrendMonth[]
  monthly_b: CompareTrendMonth[]
  post_type_a: Record<string, { count: number; avg_er: number; avg_reach: number }>
  post_type_b: Record<string, { count: number; avg_er: number; avg_reach: number }>
}
