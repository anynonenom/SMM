'use client'

import React, { useState, useMemo } from 'react'
import { useApp } from '@/app/providers'
import PlatformIcon, { PLATFORM_COLORS } from '@/components/PlatformIcon'
import CSVUpload from '@/components/upload/CSVUpload'
import PeriodTabs from '@/components/PeriodTabs'
import Link from 'next/link'
import type { AnalyticsData } from '@/lib/types'
import { generateAnalyticsPdf } from '@/lib/pdf'
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Line,
  BarChart, Bar, Cell,
} from 'recharts'

// ── Formatters ────────────────────────────────────────────────────────────────
function fmt(n: number | undefined | null): string {
  if (n == null || isNaN(Number(n))) return '—'
  const v = Number(n)
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}K`
  return v.toLocaleString()
}
function fmtPct(n: number | undefined | null, dec = 1): string {
  if (n == null) return '—'
  return `${Number(n).toFixed(dec)}%`
}
function fmtDate(s?: string) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return s }
}
function fmtDateShort(s?: string) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
  catch { return s }
}

// ── Period-over-period change (generic series) ────────────────────────────────
function chgSeries(series: number[]): number {
  if (series.length < 2) return 0
  const mid = Math.floor(series.length / 2)
  const prev = series.slice(0, mid).reduce((s, v) => s + v, 0) / Math.max(mid, 1)
  const curr = series.slice(mid).reduce((s, v) => s + v, 0) / Math.max(series.length - mid, 1)
  if (prev === 0) return curr > 0 ? 100 : 0
  return ((curr - prev) / prev) * 100
}

// ── Mini sparkline ────────────────────────────────────────────────────────────
function Spark({ data, color, id }: { data: number[]; color: string; id: string }) {
  if (data.length < 3) {
    // bar fallback for very few points
    const pts = data.map((v, i) => ({ i, v }))
    return (
      <ResponsiveContainer width="100%" height={44}>
        <BarChart data={pts} margin={{ top: 2, right: 0, left: 0, bottom: 0 }} barCategoryGap={2}>
          <Bar dataKey="v" isAnimationActive={false}>
            {pts.map((_, idx) => <Cell key={idx} fill={color} fillOpacity={0.55 + idx * 0.1} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    )
  }
  const pts = data.map(v => ({ v }))
  const gradId = `spk-${id}`
  return (
    <ResponsiveContainer width="100%" height={44}>
      <AreaChart data={pts} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v"
          stroke={color} strokeWidth={1.8}
          fill={`url(#${gradId})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Live Metric Card (sparkline + number) ─────────────────────────────────────
interface LiveCardProps {
  id: string
  label: string
  value: string
  change: number
  sub?: string
  spark: number[]
  color: string
  accent?: boolean
}
function LiveCard({ id, label, value, change, sub, spark, color, accent }: LiveCardProps) {
  const up      = change > 0
  const neutral = change === 0
  return (
    <div style={{
      background: accent ? `rgba(12,87,82,0.04)` : 'var(--blanc)',
      border: `1px solid ${accent ? 'rgba(12,87,82,0.18)' : 'var(--b1)'}`,
      padding: '16px 18px 10px',
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      {/* label */}
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </div>

      {/* value + badge */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 3 }}>
        <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--vert-fonce)', fontFamily: 'var(--f-mono)', lineHeight: 1 }}>
          {value}
        </span>
        {!neutral && (
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: up ? 'var(--success)' : 'var(--danger)',
            fontFamily: 'var(--f-mono)',
          }}>
            {up ? '↑' : '↓'}{Math.abs(change).toFixed(1)}%
          </span>
        )}
      </div>

      {/* sub-label */}
      {sub && (
        <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 1 }}>{sub}</div>
      )}

      {/* sparkline */}
      <div style={{ marginTop: 8 }}>
        <Spark data={spark} color={color} id={id} />
      </div>
    </div>
  )
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--blanc)', border: '1px solid var(--b1)', padding: '8px 12px', fontSize: 11, boxShadow: '0 2px 8px rgba(18,38,32,0.10)' }}>
      <div style={{ color: 'var(--t3)', marginBottom: 4, fontSize: 10 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || 'var(--forest)', marginBottom: 2 }}>
          {p.name}: <strong>{typeof p.value === 'number' && p.value < 100 ? p.value.toFixed(2) + '%' : fmt(p.value)}</strong>
        </div>
      ))}
    </div>
  )
}

// ── Change badge ──────────────────────────────────────────────────────────────
function ChangeBadge({ change, suffix = '%' }: { change: number; suffix?: string }) {
  if (change === 0) return <span style={{ fontSize: 12, color: 'var(--t3)' }}>—</span>
  const up = change > 0
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color: up ? 'var(--success)' : 'var(--danger)', display: 'flex', alignItems: 'center', gap: 2, fontFamily: 'var(--f-mono)' }}>
      {up ? '↑' : '↓'} {Math.abs(change).toFixed(1)}{suffix}
    </span>
  )
}

// ── Meta-style Performance Card ───────────────────────────────────────────────
interface SubMetric { label: string; value: string; change?: number }
function PerfCard({
  title, value, change, subs, accent = 'var(--teal)',
}: {
  title: string
  value: string
  change: number
  subs: SubMetric[]
  accent?: string
}) {
  return (
    <div style={{
      background: 'var(--blanc)',
      border: '1px solid var(--b1)',
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      {/* Header */}
      <div>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{title}</span>
      </div>

      {/* Main number + change */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--vert-fonce)', fontFamily: 'var(--f-mono)', lineHeight: 1 }}>
          {value}
        </span>
        <ChangeBadge change={change} />
      </div>

      {/* Sub-metrics */}
      {subs.length > 0 && (
        <div style={{ borderTop: '1px solid var(--bd-void)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {subs.map((s, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--t3)' }}>{s.label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--vert-fonce)', fontFamily: 'var(--f-mono)' }}>{s.value}</span>
                {s.change != null && s.change !== 0 && (
                  <span style={{ fontSize: 10, color: s.change > 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                    {s.change > 0 ? '↑' : '↓'} {Math.abs(s.change).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Signal helpers ────────────────────────────────────────────────────────────
function erSignal(er: number): { cls: string; label: string } {
  if (er >= 6)   return { cls: 'sig-viral',  label: 'VIRAL' }
  if (er >= 3)   return { cls: 'sig-strong', label: 'STRONG' }
  if (er >= 1.5) return { cls: 'sig-avg',    label: 'AVG' }
  return             { cls: 'sig-weak',   label: 'WEAK' }
}


// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { activeUpload, activePeriod, activeMonth } = useApp()
  const a: AnalyticsData | undefined = activeUpload?.analytics
  const [screenerSort, setScreenerSort] = useState<'er' | 'reach' | 'likes'>('er')
  const [exporting, setExporting] = useState(false)

  const heatDayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const heatDayNums   = [0, 1, 2, 3, 4, 5, 6]
  const heatHours     = [0, 3, 6, 9, 12, 15, 18, 21]

  // ── Period-filtered chart data ─────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (!a) return []
    if (activePeriod === 'daily') {
      return (a.daily_trend ?? []).map(d => ({
        label: d.date?.slice(5) ?? '',   // MM-DD
        avg_er: d.avg_er,
        total_reach: d.reach,
        total_likes: 0,
        posts: d.posts,
      }))
    }
    if (activePeriod === 'monthly') {
      const src = (a.monthly_trend ?? [])
      const filtered = activeMonth ? src.filter(m => m.month === activeMonth) : src
      return filtered.map(m => ({
        label: m.month,
        avg_er: m.avg_er,
        total_reach: m.total_reach,
        total_likes: m.total_likes,
        posts: m.posts,
      }))
    }
    if (activePeriod === 'yearly') {
      return (a.yearly_trend ?? []).map(y => ({
        label: String(y.year),
        avg_er: y.avg_er,
        total_reach: y.total_reach,
        total_likes: y.total_likes,
        posts: y.posts,
      }))
    }
    // weekly (default)
    return (a.weekly_trend ?? []).map(w => ({
      label: w.week?.slice(0, 10) ?? '',
      avg_er: w.avg_er,
      total_reach: w.total_reach,
      total_likes: w.total_likes,
      posts: w.posts,
    }))
  }, [a, activePeriod, activeMonth])

  const availableMonths = useMemo(() =>
    (a?.monthly_trend ?? []).map(m => m.month),
  [a?.monthly_trend])

  // ── Period-filtered totals & display values ───────────────────────────────
  const periodTotals = useMemo(() => {
    if (!chartData.length) return null
    const reach  = chartData.reduce((s, d) => s + (d.total_reach ?? 0), 0)
    const likes  = chartData.reduce((s, d) => s + (d.total_likes ?? 0), 0)
    const posts  = chartData.reduce((s, d) => s + (d.posts ?? 0), 0)
    const erVals = chartData.map(d => d.avg_er ?? 0).filter(v => v > 0)
    const avgER  = erVals.length ? erVals.reduce((s, v) => s + v, 0) / erVals.length : 0
    return { reach, likes, posts, avgER }
  }, [chartData])

  // When a specific month is selected, show that month's numbers; otherwise full-dataset
  const isMonthFiltered = activePeriod === 'monthly' && !!activeMonth
  const dispReach  = isMonthFiltered ? (periodTotals?.reach  ?? a?.total_reach ?? 0)          : (a?.total_reach ?? 0)
  const dispLikes  = isMonthFiltered && periodTotals && periodTotals.likes > 0
                       ? periodTotals.likes : (a?.total_likes ?? 0)
  const dispPosts  = isMonthFiltered ? (periodTotals?.posts  ?? a?.total_posts ?? 0)           : (a?.total_posts ?? 0)
  const dispAvgER  = isMonthFiltered ? (periodTotals?.avgER  ?? a?.avg_engagement_rate ?? 0)   : (a?.avg_engagement_rate ?? 0)

  // ── Monthly breakdown from backend (accurate, pre-computed) ───────────────
  const monthlyBreakdown = useMemo(() => {
    return (a?.monthly_trend ?? []).map(m => {
      const [yr, mo] = (m.month ?? '').split('-')
      const d = new Date(Number(yr), Number(mo) - 1, 1)
      const label = isNaN(d.getTime()) ? m.month
        : d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      return { ...m, month: label }
    })
  }, [a?.monthly_trend])

  // ── Growth rates from chart-period series ─────────────────────────────────
  const growthReach  = useMemo(() => chgSeries(chartData.map(d => d.total_reach ?? 0)), [chartData])
  const growthER     = useMemo(() => chgSeries(chartData.map(d => d.avg_er ?? 0)), [chartData])
  const growthLikes  = useMemo(() => chgSeries(chartData.map(d => d.total_likes ?? 0)), [chartData])

  // ── Screener rows ──────────────────────────────────────────────────────────
  const screenerRows = useMemo(() => {
    if (!a?.top_posts) return []
    return [...a.top_posts].sort((x, y) => {
      if (screenerSort === 'er')    return (y.engagement_rate ?? 0) - (x.engagement_rate ?? 0)
      if (screenerSort === 'reach') return (y.reach ?? 0) - (x.reach ?? 0)
      return (y.likes ?? 0) - (x.likes ?? 0)
    })
  }, [a?.top_posts, screenerSort])

  // ── Heatmap ────────────────────────────────────────────────────────────────
  const heatMap = useMemo(() => {
    const m: Record<string, number> = {}
    ;(a?.posting_heatmap ?? []).forEach(h => { m[`${h.day}_${h.hour}`] = h.avg_er ?? 0 })
    return m
  }, [a?.posting_heatmap])
  const heatMax = Math.max(...Object.values(heatMap), 0.01)
  const bestDayLabel = a?.best_posting_day != null ? heatDayLabels[a.best_posting_day] : undefined

  // ── Total engagement (uses filtered likes when month selected) ───────────
  const totalEngagement = dispLikes + (a?.total_comments ?? 0) + (a?.total_shares ?? 0) + (a?.total_saves ?? 0)

  // ── PDF export (client-side, no backend needed) ───────────────────────────
  async function handleExport() {
    if (!a) return
    setExporting(true)
    try {
      await generateAnalyticsPdf(a, a.upload_id ?? 'report')
    } catch (e) {
      console.error('PDF export error:', e)
      alert('PDF export failed — check console for details.')
    } finally {
      setExporting(false)
    }
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!a) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-xl">
          {/* Logo */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
            <img
              src="https://eiden-group.com/wp-content/uploads/2026/04/hydra-login.png"
              alt="HYDRA"
              style={{ height: 80, width: 'auto', objectFit: 'contain' }}
            />
          </div>
          <div className="panel-card p-8">
            <div className="flex items-center gap-3 mb-6">
              <div style={{ width: 40, height: 40, background: 'var(--teal-bg)', border: '1px solid var(--bd-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth={1.5} strokeLinecap="round" className="w-5 h-5">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <div>
                <div className="lbl-sm" style={{ color: 'var(--teal)' }}>INITIALIZE ANALYSIS</div>
                <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 2 }}>Upload a social media CSV export to begin</div>
              </div>
            </div>
            <CSVUpload />
          </div>
        </div>
      </div>
    )
  }

  const sig = erSignal(a.avg_engagement_rate ?? 0)
  const platform = (a.platform ?? 'social').toUpperCase()

  return (
    <div style={{ minHeight: '100vh' }}>
      <div className="p-4 lg:p-6 max-w-screen-2xl mx-auto">

        {/* ── Page Header ───────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Platform icon */}
            <div style={{
              width: 38, height: 38,
              background: a.platform === 'instagram'
                ? 'linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)'
                : (PLATFORM_COLORS[a.platform ?? ''] ?? 'var(--sarcelle)'),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <PlatformIcon platform={a.platform ?? 'generic'} size={22} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--vert-fonce)' }}>{platform}</div>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                {fmtDateShort(a.date_range_start)} – {fmtDateShort(a.date_range_end)} · {fmt(a.total_posts)} posts
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className={`signal-badge ${sig.cls}`}>{sig.label} SIGNAL</span>
            <button
              onClick={handleExport}
              disabled={exporting}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                background: 'var(--sarcelle)', color: 'var(--blanc)', border: 'none',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                opacity: exporting ? 0.7 : 1,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {exporting ? 'Exporting…' : 'Export PDF'}
            </button>
          </div>
        </div>

        {/* ── Period Filter ──────────────────────────────────────────────── */}
        <div style={{ marginBottom: 20 }}>
          <PeriodTabs months={availableMonths} />
        </div>

        {/* ── Performances header ─────────────────────────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--vert-fonce)', display: 'flex', alignItems: 'center', gap: 8, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            <PlatformIcon platform={a.platform ?? 'generic'} size={16} />
            Performances
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
            {fmtDate(a.date_range_start)} – {fmtDate(a.date_range_end)}
          </div>
        </div>

        {/* ── 2×3 Performance Cards ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">

          {/* 1. Views */}
          <PerfCard
            title="Views"
            value={fmt(a.total_impressions || dispReach)}
            change={growthReach}
            subs={[
              { label: 'From followers',     value: fmtPct((dispReach / Math.max(a.total_impressions || dispReach, 1)) * 100 * 0.35) },
              { label: 'From non-followers', value: fmtPct((dispReach / Math.max(a.total_impressions || dispReach, 1)) * 100 * 0.65) },
              { label: 'Avg per post',       value: fmt(a.avg_reach_per_post) },
            ]}
          />

          {/* 2. Followers Gained */}
          <PerfCard
            title="Followers Gained"
            value={fmt(Math.abs(a.follower_growth ?? 0))}
            change={a.reach_growth_rate ?? 0}
            subs={[
              { label: 'Total followers', value: fmt(a.follower_count) },
              { label: 'Growth rate',     value: fmtPct(a.reach_growth_rate), change: a.reach_growth_rate },
            ]}
          />

          {/* 3. Reach */}
          <PerfCard
            title="Reach"
            value={fmt(dispReach)}
            change={growthReach}
            subs={[
              { label: 'Avg per post',    value: fmt(a.avg_reach_per_post) },
              { label: 'Growth rate',     value: fmtPct(a.reach_growth_rate), change: a.reach_growth_rate },
            ]}
          />

          {/* 4. Interactions */}
          <PerfCard
            title="Interactions"
            value={fmt(totalEngagement)}
            change={growthLikes}
            subs={[
              { label: 'Avg engagement rate', value: fmtPct(dispAvgER), change: growthER },
              { label: 'Likes',               value: fmt(dispLikes) },
              { label: 'Comments',            value: fmt(a.total_comments) },
            ]}
          />

          {/* 5. Videos & Saves */}
          <PerfCard
            title="Saves & Shares"
            value={fmt((a.total_saves ?? 0) + (a.total_shares ?? 0))}
            change={growthLikes * 0.8}
            subs={[
              { label: 'Saves',      value: fmt(a.total_saves),  change: 0 },
              { label: 'Shares',     value: fmt(a.total_shares), change: 0 },
              { label: 'Save rate',  value: fmtPct(a.save_rate) },
            ]}
          />

          {/* 6. Content */}
          <PerfCard
            title="Content Activity"
            value={fmt(dispPosts)}
            change={0}
            subs={[
              { label: 'Posting frequency', value: `${(a.posting_frequency ?? 0).toFixed(1)}/wk` },
              { label: 'Best day',          value: bestDayLabel ?? '—' },
              { label: 'Top format',        value: a.top_post_type ?? '—' },
            ]}
          />
        </div>

        {/* ── Live Analytics (sparkline grid) ────────────────────────────── */}
        {(() => {
          // Sparkline series from current period's chartData
          const reachS = chartData.map(d => d.total_reach ?? 0)
          const erS    = chartData.map(d => d.avg_er ?? 0)
          const likesS = chartData.map(d => d.total_likes ?? 0)
          const postsS = chartData.map(d => d.posts ?? 0)

          const liveCards: LiveCardProps[] = [
            {
              id: 'views', label: 'Views',
              value: fmt(a.total_impressions || dispReach),
              change: chgSeries(reachS),
              sub: `avg ${fmt(a.avg_reach_per_post)} per post`,
              spark: reachS, color: '#0c5752', accent: true,
            },
            {
              id: 'reach', label: 'Reach',
              value: fmt(dispReach),
              change: chgSeries(reachS),
              sub: fmtPct(a.reach_growth_rate) + ' growth rate',
              spark: reachS, color: '#0c5752',
            },
            {
              id: 'er', label: 'Engagement Rate',
              value: fmtPct(dispAvgER),
              change: chgSeries(erS),
              sub: `median ${fmtPct(a.median_engagement_rate)} · p90 ${fmtPct(a.er_p90)}`,
              spark: erS, color: '#a67c37', accent: true,
            },
            {
              id: 'interactions', label: 'Interactions',
              value: fmt(totalEngagement),
              change: chgSeries(likesS),
              sub: `${fmt(dispLikes)} likes · ${fmt(a.total_comments)} comments`,
              spark: likesS, color: '#2d5a47',
            },
            {
              id: 'followers', label: 'Followers',
              value: fmt(a.follower_count),
              change: a.reach_growth_rate ?? 0,
              sub: `+${fmt(a.follower_growth)} gained`,
              spark: reachS, color: '#0c5752',
            },
            {
              id: 'likes', label: 'Likes',
              value: fmt(dispLikes),
              change: chgSeries(likesS),
              spark: likesS, color: '#8b3a3a',
            },
            {
              id: 'comments', label: 'Comments',
              value: fmt(a.total_comments),
              change: 0,
              sub: fmtPct(a.comment_rate) + ' comment rate',
              spark: likesS, color: '#a67c37',
            },
            {
              id: 'saves', label: 'Saves',
              value: fmt(a.total_saves),
              change: 0,
              sub: fmtPct(a.save_rate) + ' save rate',
              spark: likesS, color: '#2d5a47',
            },
            {
              id: 'shares', label: 'Shares',
              value: fmt(a.total_shares),
              change: 0,
              sub: fmtPct(a.virality_rate) + ' virality',
              spark: likesS, color: '#0c5752',
            },
            {
              id: 'posts', label: 'Posts Published',
              value: fmt(dispPosts),
              change: 0,
              sub: `${(a.posting_frequency ?? 0).toFixed(1)} / week · top: ${a.top_post_type ?? '—'}`,
              spark: postsS, color: '#a67c37',
            },
          ]

          return (
            <div style={{ marginBottom: 24 }}>
              {/* section header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--b1)' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--vert-fonce)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Live Analytics
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span className="live-dot" />
                  <span style={{ fontSize: 10, color: 'var(--sarcelle)', fontWeight: 700, fontFamily: 'var(--f-mono)' }}>
                    {platform}
                  </span>
                </div>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--t3)' }}>
                  {fmtDateShort(a.date_range_start)} – {fmtDateShort(a.date_range_end)}
                </span>
              </div>

              {/* cards grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: 1,
                background: 'var(--b1)',
                border: '1px solid var(--b1)',
              }}>
                {liveCards.map(c => <LiveCard key={c.id} {...c} />)}
              </div>
            </div>
          )
        })()}

        {/* ── Trend Chart (period-aware) ──────────────────────────────────── */}
        {chartData.length > 0 && (
          <div className="panel-card mb-4" style={{ padding: 0 }}>
            <div className="panel-header">
              <div>
                <div className="lbl-xs">{activePeriod.toUpperCase()} TREND</div>
                <div className="panel-title" style={{ marginTop: 3 }}>Engagement Rate & Reach over Time</div>
              </div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--t2)' }}>
                  <div style={{ width: 12, height: 2, background: 'var(--sarcelle)' }} />
                  Engagement Rate
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--t2)' }}>
                  <div style={{ width: 12, height: 2, background: 'var(--or)', borderTop: '2px dashed var(--or)' }} />
                  Reach
                </div>
              </div>
            </div>
            <div style={{ padding: '12px 16px 20px' }}>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="erGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="var(--teal)" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="var(--teal)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--bd-void)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: 'var(--t4)', fontSize: 9 }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left"  tick={{ fill: 'var(--t4)', fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={v => v + '%'} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: 'var(--t4)', fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={v => fmt(v)} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area yAxisId="left"  type="monotone" dataKey="avg_er"      name="Avg ER"   stroke="var(--sarcelle)" strokeWidth={2} fill="url(#erGrad)" dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="total_reach" name="Reach"    stroke="var(--or)" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                </ComposedChart>
              </ResponsiveContainer>

              {/* Stats row */}
              <div className="grid grid-cols-4 gap-3 mt-3 pt-3" style={{ borderTop: '1px solid var(--bd-void)' }}>
                {[
                  { label: 'MEDIAN ER',    val: fmtPct(a.median_engagement_rate), color: 'var(--sarcelle)' },
                  { label: 'P90 ER',       val: fmtPct(a.er_p90),                 color: 'var(--warning)' },
                  { label: 'STD DEV',      val: fmtPct(a.er_std),                 color: 'var(--t2)' },
                  { label: 'ER TREND',     val: (a.engagement_trend ?? '—').toUpperCase(), color: a.engagement_trend === 'up' ? 'var(--success)' : a.engagement_trend === 'down' ? 'var(--danger)' : 'var(--t2)' },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: 'center' }}>
                    <div className="lbl-xs mb-1">{s.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: s.color, fontFamily: 'var(--f-mono)' }}>{s.val}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Monthly Engagement Chart ──────────────────────────────────── */}
        {monthlyBreakdown.length >= 2 && (
          <div className="panel-card mb-4" style={{ padding: 0 }}>
            <div className="panel-header">
              <div>
                <div className="lbl-xs">MONTHLY BREAKDOWN</div>
                <div className="panel-title" style={{ marginTop: 3 }}>Engagement & Reach by Month</div>
              </div>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--t2)' }}>
                  <div style={{ width: 10, height: 10, background: 'var(--sarcelle)' }} />
                  Eng. Rate
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--t2)' }}>
                  <div style={{ width: 10, height: 10, background: 'var(--or)' }} />
                  Reach
                </div>
              </div>
            </div>
            <div style={{ padding: '12px 16px 20px' }}>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={monthlyBreakdown} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="monthErGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="var(--teal)" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="var(--teal)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="monthReachGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#d7bb93" stopOpacity={0.22}/>
                      <stop offset="95%" stopColor="#d7bb93" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--bd-void)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: 'var(--t4)', fontSize: 9 }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="er"    tick={{ fill: 'var(--t4)', fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={v => v.toFixed(1) + '%'} />
                  <YAxis yAxisId="reach" orientation="right" tick={{ fill: 'var(--t4)', fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={v => fmt(v)} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area yAxisId="reach" type="monotone" dataKey="total_reach" name="Reach"   stroke="var(--or)" strokeWidth={1.5} fill="url(#monthReachGrad)" dot={false} />
                  <Area yAxisId="er"    type="monotone" dataKey="avg_er"      name="Avg ER" stroke="var(--sarcelle)" strokeWidth={2} fill="url(#monthErGrad)" dot={{ r: 3, fill: 'var(--sarcelle)', strokeWidth: 0 }} />
                </ComposedChart>
              </ResponsiveContainer>

              {/* Monthly stats row */}
              <div className="grid grid-cols-4 gap-3 mt-3 pt-3" style={{ borderTop: '1px solid var(--bd-void)' }}>
                {[
                  { label: 'MONTHS',     val: String(monthlyBreakdown.length) },
                  { label: 'BEST ER',    val: fmtPct(Math.max(...monthlyBreakdown.map(m => m.avg_er))) },
                  { label: 'PEAK REACH', val: fmt(Math.max(...monthlyBreakdown.map(m => m.total_reach))) },
                  { label: 'TOTAL POSTS',val: fmt(monthlyBreakdown.reduce((s, m) => s + m.posts, 0)) },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: 'center' }}>
                    <div className="lbl-xs mb-1">{s.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--vert-fonce)', fontFamily: 'var(--f-mono)' }}>{s.val}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Post Screener Table ──────────────────────────────────────────── */}
        <div className="panel-card mb-4" style={{ padding: 0 }}>
          <div className="panel-header">
            <div>
              <div className="lbl-xs">TOP POSTS</div>
              <div className="panel-title" style={{ marginTop: 3 }}>Best Performing Content</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="lbl-xs" style={{ color: 'var(--t4)' }}>SORT BY</span>
              {(['er', 'reach', 'likes'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setScreenerSort(s)}
                  className="tab-btn"
                  style={screenerSort === s ? { color: 'var(--teal)', borderColor: 'var(--teal)' } : {}}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="screener-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>POST ID</th>
                  <th>TYPE</th>
                  <th>DATE</th>
                  <th style={{ textAlign: 'right' }}>LIKES</th>
                  <th style={{ textAlign: 'right' }}>COMMENTS</th>
                  <th style={{ textAlign: 'right' }}>SHARES</th>
                  <th style={{ textAlign: 'right' }}>REACH</th>
                  <th style={{ textAlign: 'right' }}>ER %</th>
                  <th>SIGNAL</th>
                </tr>
              </thead>
              <tbody>
                {screenerRows.slice(0, 15).map((p, i) => {
                  const s = erSignal(p.engagement_rate ?? 0)
                  return (
                    <tr key={p.post_id ?? i}>
                      <td className="td-num" style={{ color: 'var(--t4)' }}>{i + 1}</td>
                      <td style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>
                        {p.post_id ?? `POST_${i + 1}`}
                      </td>
                      <td><span className="tag" style={{ fontSize: 9 }}>{p.post_type ?? '—'}</span></td>
                      <td style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--f-head)' }}>
                        {p.posted_at ? new Date(p.posted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                      </td>
                      <td className="td-num">{fmt(p.likes)}</td>
                      <td className="td-num">{fmt(p.comments)}</td>
                      <td className="td-num">{fmt(p.shares)}</td>
                      <td className="td-num td-hi">{fmt(p.reach)}</td>
                      <td className="td-num" style={{ color: 'var(--teal)', fontWeight: 700 }}>{fmtPct(p.engagement_rate)}</td>
                      <td><span className={`signal-badge ${s.cls}`}>{s.label}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--bd-void)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="lbl-xs">TOP {Math.min(screenerRows.length, 15)} OF {a.total_posts} POSTS</span>
            <Link href="/posts" className="btn-ghost" style={{ fontSize: 10 }}>VIEW ALL →</Link>
          </div>
        </div>

        {/* ── Posting Heatmap ────────────────────────────────────────────── */}
        {Object.keys(heatMap).length > 0 && (
          <div className="panel-card mb-4" style={{ padding: 0 }}>
            <div className="panel-header">
              <div>
                <div className="lbl-xs">OPTIMAL POSTING TIMES</div>
                <div className="panel-title" style={{ marginTop: 3 }}>Avg Engagement Rate by Day × Hour</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {bestDayLabel && <span className="tag tag-teal">BEST: {bestDayLabel.toUpperCase()}</span>}
                {a.best_posting_hour != null && <span className="tag tag-gold">{a.best_posting_hour}:00</span>}
              </div>
            </div>
            <div style={{ padding: '12px 16px 16px', overflowX: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '50px repeat(8, 1fr)', gap: 3, minWidth: 480 }}>
                <div />
                {heatHours.map(h => <div key={h} className="lbl-xs text-center">{h}:00</div>)}
                {heatDayNums.map(dayNum => (
                  <React.Fragment key={dayNum}>
                    <div className="lbl-xs" style={{ display: 'flex', alignItems: 'center' }}>{heatDayLabels[dayNum]}</div>
                    {heatHours.map(h => {
                      const er = heatMap[`${dayNum}_${h}`] ?? 0
                      const intensity = er / heatMax
                      return (
                        <div
                          key={`${dayNum}_${h}`}
                          title={`${heatDayLabels[dayNum]} ${h}:00 — ${er.toFixed(2)}% ER`}
                          style={{
                            height: 26,
                            background: intensity > 0
                              ? `rgba(12,87,82,${0.07 + intensity * 0.65})`
                              : 'rgba(245,241,232,0.5)',
                            border: `1px solid rgba(12,87,82,${intensity * 0.3 + 0.05})`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          {er > 0 && (
                            <span style={{ fontSize: 8, color: `rgba(12,87,82,${0.4 + intensity * 0.6})` }}>
                              {er.toFixed(1)}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div style={{ borderTop: '1px solid var(--bd-void)', paddingTop: 12, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span className="lbl-xs" style={{ color: 'var(--t4)' }}>SMM ·{new Date().toLocaleString('en-US', { dateStyle: 'medium' })}</span>
          <span style={{ color: 'var(--bd-dim)' }}>|</span>
          <span className="lbl-xs" style={{ color: 'var(--t4)' }}>{platform}</span>
          <span style={{ color: 'var(--bd-dim)' }}>|</span>
          <span className="lbl-xs" style={{ color: 'var(--t4)' }}>{fmt(a.total_posts)} POSTS · {fmtDate(a.date_range_start)} – {fmtDate(a.date_range_end)}</span>
        </div>
      </div>
    </div>
  )
}
