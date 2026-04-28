'use client'

import React, { useMemo, useState } from 'react'
import { useApp } from '@/app/providers'
import PlatformIcon, { PLATFORM_COLORS } from '@/components/PlatformIcon'
import CSVUpload from '@/components/upload/CSVUpload'
import type { AnalyticsData, WeeklyTrend } from '@/lib/types'
import { generateAnalyticsPdf } from '@/lib/pdf'
import {
  AreaChart, Area, BarChart, Bar, Cell,
  ComposedChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'

// ── Formatters ────────────────────────────────────────────────────────────────
function fmt(n: number | undefined | null): string {
  if (n == null || isNaN(Number(n))) return '—'
  const v = Number(n)
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}K`
  return v.toLocaleString()
}
function fmtPct(n: number | undefined | null, dec = 2): string {
  if (n == null) return '—'
  return `${Number(n).toFixed(dec)}%`
}
function fmtDate(s?: string) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return s }
}
function fmtShort(s?: string) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
  catch { return s }
}

// ── Series helpers ────────────────────────────────────────────────────────────
function chg(series: number[]): number {
  if (series.length < 2) return 0
  const mid  = Math.floor(series.length / 2)
  const prev = series.slice(0, mid).reduce((s, v) => s + v, 0) / Math.max(mid, 1)
  const curr = series.slice(mid).reduce((s, v) => s + v, 0) / Math.max(series.length - mid, 1)
  if (prev === 0) return curr > 0 ? 100 : 0
  return ((curr - prev) / prev) * 100
}

function buildMonthly(trend: WeeklyTrend[]) {
  const map: Record<string, { month: string; avg_er: number[]; total_reach: number; total_likes: number; posts: number }> = {}
  for (const w of trend) {
    if (!w.week) continue
    const d = new Date(w.week)
    if (isNaN(d.getTime())) continue
    const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    if (!map[key]) map[key] = { month: label, avg_er: [], total_reach: 0, total_likes: 0, posts: 0 }
    map[key].avg_er.push(Number(w.avg_er) || 0)
    map[key].total_reach  += Number(w.total_reach) || 0
    map[key].total_likes  += Number(w.total_likes) || 0
    map[key].posts        += Number(w.posts) || 0
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({
      month:       v.month,
      avg_er:      v.avg_er.length ? v.avg_er.reduce((s, x) => s + x, 0) / v.avg_er.length : 0,
      total_reach: v.total_reach,
      total_likes: v.total_likes,
      posts:       v.posts,
    }))
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function ChartTip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--blanc)', border: '1px solid var(--b1)', padding: '8px 12px', fontSize: 11, boxShadow: '0 2px 8px rgba(18,38,32,0.10)' }}>
      <div style={{ color: 'var(--t3)', marginBottom: 4, fontSize: 10 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, marginBottom: 2, fontFamily: 'var(--f-mono)' }}>
          {p.name}: <strong>{typeof p.value === 'number' && p.value < 200 ? p.value.toFixed(2) + '%' : fmt(p.value)}</strong>
        </div>
      ))}
    </div>
  )
}

// ── Mini sparkline ────────────────────────────────────────────────────────────
function Spark({ data, color, id }: { data: number[]; color: string; id: string }) {
  if (data.length < 3) {
    const pts = data.map((v, i) => ({ i, v }))
    return (
      <ResponsiveContainer width="100%" height={48}>
        <BarChart data={pts} margin={{ top: 2, right: 0, left: 0, bottom: 0 }} barCategoryGap={2}>
          <Bar dataKey="v" isAnimationActive={false}>
            {pts.map((_, idx) => <Cell key={idx} fill={color} fillOpacity={0.5 + idx * 0.15} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    )
  }
  const pts = data.map(v => ({ v }))
  return (
    <ResponsiveContainer width="100%" height={48}>
      <AreaChart data={pts} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`spk-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v"
          stroke={color} strokeWidth={1.8}
          fill={`url(#spk-${id})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Live metric card ──────────────────────────────────────────────────────────
interface CardDef {
  id: string; label: string; value: string; change: number
  sub?: string; spark: number[]; color: string; accent?: boolean
}
function MetricCard({ id, label, value, change, sub, spark, color, accent }: CardDef) {
  const up = change > 0
  return (
    <div style={{
      background: accent ? 'rgba(12,87,82,0.04)' : 'var(--blanc)',
      border: `1px solid ${accent ? 'rgba(12,87,82,0.18)' : 'var(--b1)'}`,
      padding: '18px 20px 12px',
      display: 'flex', flexDirection: 'column', gap: 3,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginTop: 4 }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--vert-fonce)', fontFamily: 'var(--f-mono)', lineHeight: 1 }}>
          {value}
        </span>
        {change !== 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: up ? 'var(--success)' : 'var(--danger)', fontFamily: 'var(--f-mono)' }}>
            {up ? '↑' : '↓'}{Math.abs(change).toFixed(1)}%
          </span>
        )}
      </div>
      {sub && <div style={{ fontSize: 10, color: 'var(--t3)', lineHeight: 1.5 }}>{sub}</div>}
      <div style={{ marginTop: 10 }}>
        <Spark data={spark} color={color} id={id} />
      </div>
    </div>
  )
}

// ── ER signal ─────────────────────────────────────────────────────────────────
function erSignal(er: number) {
  if (er >= 6)   return { cls: 'sig-viral',  label: 'VIRAL' }
  if (er >= 3)   return { cls: 'sig-strong', label: 'STRONG' }
  if (er >= 1.5) return { cls: 'sig-avg',    label: 'AVG' }
  return             { cls: 'sig-weak',   label: 'WEAK' }
}

// ── PAGE ──────────────────────────────────────────────────────────────────────
export default function LiveAnalyticsPage() {
  const { activeUpload } = useApp()
  const a: AnalyticsData | undefined = activeUpload?.analytics
  const [exporting, setExporting] = useState(false)

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

  // ── series
  const reachS  = useMemo(() => (a?.weekly_trend ?? []).map(w => w.total_reach ?? 0), [a])
  const erS     = useMemo(() => (a?.weekly_trend ?? []).map(w => w.avg_er ?? 0),      [a])
  const likesS  = useMemo(() => (a?.weekly_trend ?? []).map(w => w.total_likes ?? 0), [a])
  const postsS  = useMemo(() => (a?.weekly_trend ?? []).map(w => w.posts ?? 0),       [a])
  const monthly = useMemo(() => buildMonthly(a?.weekly_trend ?? []),                  [a])

  // ── empty state
  if (!a) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-xl">
          <div className="panel-card p-8">
            <div className="flex items-center gap-3 mb-6">
              <div style={{ width: 40, height: 40, background: 'var(--teal-bg)', border: '1px solid var(--bd-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth={1.5} strokeLinecap="round" className="w-5 h-5">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
              </div>
              <div>
                <div className="lbl-sm" style={{ color: 'var(--teal)' }}>LIVE ANALYTICS</div>
                <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 2 }}>Upload a CSV to view live analytics</div>
              </div>
            </div>
            <CSVUpload />
          </div>
        </div>
      </div>
    )
  }

  const platform   = (a.platform ?? 'social').toUpperCase()
  const totalEng   = (a.total_likes ?? 0) + (a.total_comments ?? 0) + (a.total_shares ?? 0) + (a.total_saves ?? 0)
  const sig        = erSignal(a.avg_engagement_rate ?? 0)
  const hasTrend   = (a.weekly_trend?.length ?? 0) > 0
  const hasMonthly = monthly.length >= 2

  // ── KPI bar items
  const kpis = [
    { label: 'Views',      value: fmt(a.total_impressions || a.total_reach), sub: `avg ${fmt(a.avg_reach_per_post)} / post` },
    { label: 'Avg ER',     value: fmtPct(a.avg_engagement_rate),             sub: `median ${fmtPct(a.median_engagement_rate)}` },
    { label: 'Reach',      value: fmt(a.total_reach),                        sub: fmtPct(a.reach_growth_rate) + ' growth' },
    { label: 'Interact.',  value: fmt(totalEng),                             sub: `${fmt(a.total_likes)} likes` },
    { label: 'Followers',  value: fmt(a.follower_count),                     sub: `+${fmt(a.follower_growth)} gained` },
    { label: 'Posts',      value: fmt(a.total_posts),                        sub: `${(a.posting_frequency ?? 0).toFixed(1)} / wk` },
  ]

  // ── metric cards
  const cards: CardDef[] = [
    {
      id: 'views', label: 'Views',
      value: fmt(a.total_impressions || a.total_reach),
      change: chg(reachS),
      sub: `avg ${fmt(a.avg_reach_per_post)} per post`,
      spark: reachS, color: '#0c5752', accent: true,
    },
    {
      id: 'reach', label: 'Reach',
      value: fmt(a.total_reach),
      change: chg(reachS),
      sub: fmtPct(a.reach_growth_rate) + ' growth rate',
      spark: reachS, color: '#0c5752',
    },
    {
      id: 'er', label: 'Engagement Rate',
      value: fmtPct(a.avg_engagement_rate),
      change: chg(erS),
      sub: `median ${fmtPct(a.median_engagement_rate)} · p90 ${fmtPct(a.er_p90)}`,
      spark: erS, color: '#a67c37', accent: true,
    },
    {
      id: 'interactions', label: 'Interactions',
      value: fmt(totalEng),
      change: chg(likesS),
      sub: `${fmt(a.total_likes)} likes · ${fmt(a.total_comments)} comments`,
      spark: likesS, color: '#2d5a47',
    },
    {
      id: 'followers', label: 'Followers',
      value: fmt(a.follower_count),
      change: a.reach_growth_rate ?? 0,
      sub: `+${fmt(a.follower_growth)} gained this period`,
      spark: reachS, color: '#0c5752',
    },
    {
      id: 'likes', label: 'Likes',
      value: fmt(a.total_likes),
      change: chg(likesS),
      sub: `${fmt(a.total_comments)} comments`,
      spark: likesS, color: '#8b3a3a',
    },
    {
      id: 'comments', label: 'Comments',
      value: fmt(a.total_comments),
      change: 0,
      sub: fmtPct(a.comment_rate, 2) + ' comment rate',
      spark: likesS, color: '#a67c37',
    },
    {
      id: 'saves', label: 'Saves',
      value: fmt(a.total_saves),
      change: 0,
      sub: fmtPct(a.save_rate, 2) + ' save rate',
      spark: likesS, color: '#2d5a47',
    },
    {
      id: 'shares', label: 'Shares',
      value: fmt(a.total_shares),
      change: 0,
      sub: fmtPct(a.virality_rate, 2) + ' virality rate',
      spark: likesS, color: '#0c5752',
    },
    {
      id: 'posts', label: 'Posts Published',
      value: fmt(a.total_posts),
      change: 0,
      sub: `${(a.posting_frequency ?? 0).toFixed(1)} / wk · top: ${a.top_post_type ?? '—'}`,
      spark: postsS, color: '#a67c37',
    },
  ]

  return (
    <div style={{ minHeight: '100vh' }}>
      <div className="p-4 lg:p-6 max-w-screen-2xl mx-auto">

        {/* ── Page header ───────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* platform badge */}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--vert-fonce)', letterSpacing: '0.03em' }}>
                  Live Analytics
                </span>
                <span className="live-dot" />
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--sarcelle)', fontFamily: 'var(--f-mono)' }}>
                  {platform}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                {fmtShort(a.date_range_start)} – {fmtShort(a.date_range_end)} · {fmt(a.total_posts)} posts analysed
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {exporting ? 'Exporting…' : 'Export PDF'}
            </button>
          </div>
        </div>

        {/* ── KPI summary bar ───────────────────────────────────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          border: '1px solid var(--b1)',
          marginBottom: 24,
        }}>
          {kpis.map((k, i) => (
            <div key={k.label} style={{
              padding: '16px 18px',
              borderRight: i < kpis.length - 1 ? '1px solid var(--b1)' : 'none',
              background: 'var(--blanc)',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                {k.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--vert-fonce)', fontFamily: 'var(--f-mono)', lineHeight: 1 }}>
                {k.value}
              </div>
              <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Metric cards with sparklines ─────────────────────────────── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--b1)' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--vert-fonce)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Metrics Overview
            </span>
            <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 4 }}>
              {fmtDate(a.date_range_start)} – {fmtDate(a.date_range_end)}
            </span>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
            gap: 1,
            background: 'var(--b1)',
            border: '1px solid var(--b1)',
          }}>
            {cards.map(c => <MetricCard key={c.id} {...c} />)}
          </div>
        </div>

        {/* ── Engagement Rate over time ─────────────────────────────────── */}
        {hasTrend && (
          <div className="panel-card mb-4" style={{ padding: 0 }}>
            <div className="panel-header">
              <div>
                <div className="lbl-xs">ENGAGEMENT RATE</div>
                <div className="panel-title" style={{ marginTop: 3 }}>Weekly ER Trend</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--t2)' }}>
                <div style={{ width: 14, height: 2, background: 'var(--sarcelle)' }} />
                Avg ER %
              </div>
            </div>
            <div style={{ padding: '16px 20px 20px' }}>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={a.weekly_trend} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <defs>
                    <linearGradient id="erGradA" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#0c5752" stopOpacity={0.20} />
                      <stop offset="100%" stopColor="#0c5752" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--bd-void)" vertical={false} />
                  <XAxis dataKey="week" tick={{ fill: 'var(--t4)', fontSize: 9 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: 'var(--t4)', fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={v => v.toFixed(1) + '%'} />
                  <Tooltip content={<ChartTip />} />
                  <Area type="monotone" dataKey="avg_er" name="Avg ER"
                    stroke="#0c5752" strokeWidth={2}
                    fill="url(#erGradA)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
              {/* ER stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, marginTop: 16, borderTop: '1px solid var(--bd-void)', paddingTop: 14 }}>
                {[
                  { label: 'MEDIAN ER',  val: fmtPct(a.median_engagement_rate), color: 'var(--sarcelle)' },
                  { label: 'P90 ER',     val: fmtPct(a.er_p90),                 color: 'var(--warning)' },
                  { label: 'STD DEV',    val: fmtPct(a.er_std),                 color: 'var(--t2)' },
                  { label: 'ER TREND',   val: (a.engagement_trend ?? '—').toUpperCase(),
                    color: a.engagement_trend === 'up' ? 'var(--success)' : a.engagement_trend === 'down' ? 'var(--danger)' : 'var(--t2)' },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: 'center', padding: '0 8px' }}>
                    <div className="lbl-xs" style={{ marginBottom: 5 }}>{s.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: s.color, fontFamily: 'var(--f-mono)' }}>{s.val}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Reach + Likes dual axis ───────────────────────────────────── */}
        {hasTrend && (
          <div className="panel-card mb-4" style={{ padding: 0 }}>
            <div className="panel-header">
              <div>
                <div className="lbl-xs">REACH & LIKES</div>
                <div className="panel-title" style={{ marginTop: 3 }}>Weekly Reach vs Likes</div>
              </div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--t2)' }}>
                  <div style={{ width: 12, height: 2, background: 'var(--sarcelle)' }} />
                  Reach
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--t2)' }}>
                  <div style={{ width: 12, height: 2, background: 'var(--or)', borderTop: '2px dashed var(--or)' }} />
                  Likes
                </div>
              </div>
            </div>
            <div style={{ padding: '16px 20px 20px' }}>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={a.weekly_trend} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <defs>
                    <linearGradient id="reachGradA" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#0c5752" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#0c5752" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--bd-void)" vertical={false} />
                  <XAxis dataKey="week" tick={{ fill: 'var(--t4)', fontSize: 9 }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="reach" tick={{ fill: 'var(--t4)', fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={v => fmt(v)} />
                  <YAxis yAxisId="likes" orientation="right" tick={{ fill: 'var(--t4)', fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={v => fmt(v)} />
                  <Tooltip content={<ChartTip />} />
                  <Area yAxisId="reach" type="monotone" dataKey="total_reach" name="Reach"
                    stroke="#0c5752" strokeWidth={2} fill="url(#reachGradA)" dot={false} />
                  <Line yAxisId="likes" type="monotone" dataKey="total_likes" name="Likes"
                    stroke="#d7bb93" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                </ComposedChart>
              </ResponsiveContainer>
              {/* reach stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, marginTop: 16, borderTop: '1px solid var(--bd-void)', paddingTop: 14 }}>
                {[
                  { label: 'TOTAL REACH',  val: fmt(a.total_reach) },
                  { label: 'AVG / POST',   val: fmt(a.avg_reach_per_post) },
                  { label: 'REACH GROWTH', val: fmtPct(a.reach_growth_rate), color: (a.reach_growth_rate ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)' },
                  { label: 'TOTAL LIKES',  val: fmt(a.total_likes) },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: 'center', padding: '0 8px' }}>
                    <div className="lbl-xs" style={{ marginBottom: 5 }}>{s.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: s.color ?? 'var(--vert-fonce)', fontFamily: 'var(--f-mono)' }}>{s.val}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Monthly breakdown ─────────────────────────────────────────── */}
        {hasMonthly && (
          <div className="panel-card mb-4" style={{ padding: 0 }}>
            <div className="panel-header">
              <div>
                <div className="lbl-xs">MONTHLY BREAKDOWN</div>
                <div className="panel-title" style={{ marginTop: 3 }}>Engagement Rate & Reach by Month</div>
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
            <div style={{ padding: '16px 20px 20px' }}>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={monthly} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <defs>
                    <linearGradient id="mErGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#0c5752" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#0c5752" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="mReachGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#d7bb93" stopOpacity={0.20} />
                      <stop offset="100%" stopColor="#d7bb93" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--bd-void)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: 'var(--t4)', fontSize: 9 }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="er"    tick={{ fill: 'var(--t4)', fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={v => v.toFixed(1) + '%'} />
                  <YAxis yAxisId="reach" orientation="right" tick={{ fill: 'var(--t4)', fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={v => fmt(v)} />
                  <Tooltip content={<ChartTip />} />
                  <Area yAxisId="reach" type="monotone" dataKey="total_reach" name="Reach"
                    stroke="#d7bb93" strokeWidth={1.5} fill="url(#mReachGrad)" dot={false} />
                  <Area yAxisId="er"    type="monotone" dataKey="avg_er"      name="Avg ER"
                    stroke="#0c5752" strokeWidth={2}   fill="url(#mErGrad)"
                    dot={{ r: 3, fill: '#0c5752', strokeWidth: 0 }} />
                </ComposedChart>
              </ResponsiveContainer>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, marginTop: 16, borderTop: '1px solid var(--bd-void)', paddingTop: 14 }}>
                {[
                  { label: 'MONTHS',      val: String(monthly.length) },
                  { label: 'BEST ER',     val: fmtPct(Math.max(...monthly.map(m => m.avg_er))), color: 'var(--sarcelle)' },
                  { label: 'PEAK REACH',  val: fmt(Math.max(...monthly.map(m => m.total_reach))) },
                  { label: 'TOTAL POSTS', val: fmt(monthly.reduce((s, m) => s + m.posts, 0)) },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: 'center', padding: '0 8px' }}>
                    <div className="lbl-xs" style={{ marginBottom: 5 }}>{s.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: s.color ?? 'var(--vert-fonce)', fontFamily: 'var(--f-mono)' }}>{s.val}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Posts published per week bar chart ───────────────────────── */}
        {hasTrend && postsS.some(v => v > 0) && (
          <div className="panel-card mb-4" style={{ padding: 0 }}>
            <div className="panel-header">
              <div>
                <div className="lbl-xs">POSTING FREQUENCY</div>
                <div className="panel-title" style={{ marginTop: 3 }}>Posts Published per Week</div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--t2)' }}>
                avg <strong style={{ fontFamily: 'var(--f-mono)', color: 'var(--vert-fonce)' }}>
                  {(a.posting_frequency ?? 0).toFixed(1)}
                </strong> / wk
              </div>
            </div>
            <div style={{ padding: '16px 20px 20px' }}>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={a.weekly_trend} margin={{ top: 5, right: 10, left: -15, bottom: 0 }} barCategoryGap="30%">
                  <CartesianGrid stroke="var(--bd-void)" vertical={false} />
                  <XAxis dataKey="week" tick={{ fill: 'var(--t4)', fontSize: 9 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: 'var(--t4)', fontSize: 9 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTip />} />
                  <Bar dataKey="posts" name="Posts" fill="#0c5752" fillOpacity={0.7} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div style={{ borderTop: '1px solid var(--bd-void)', paddingTop: 12, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span className="lbl-xs" style={{ color: 'var(--t4)' }}>
            SMM · {new Date().toLocaleString('en-US', { dateStyle: 'medium' })}
          </span>
          <span style={{ color: 'var(--bd-dim)' }}>|</span>
          <span className="lbl-xs" style={{ color: 'var(--t4)' }}>{platform}</span>
          <span style={{ color: 'var(--bd-dim)' }}>|</span>
          <span className="lbl-xs" style={{ color: 'var(--t4)' }}>
            {fmt(a.total_posts)} POSTS · {fmtDate(a.date_range_start)} – {fmtDate(a.date_range_end)}
          </span>
        </div>

      </div>
    </div>
  )
}
