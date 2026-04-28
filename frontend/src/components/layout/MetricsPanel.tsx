'use client'

import { useApp } from '@/app/providers'
import {
  AreaChart, Area, ResponsiveContainer, Tooltip,
} from 'recharts'

// ── Formatters ────────────────────────────────────────────────────────────────
function fmt(n: number | undefined | null): string {
  if (n == null || isNaN(Number(n))) return '—'
  const v = Number(n)
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}K`
  return v.toLocaleString()
}
function fmtPct(n: number | undefined | null): string {
  if (n == null) return '—'
  return `${Number(n).toFixed(2)}%`
}

// ── Period-over-period change ─────────────────────────────────────────────────
function computeChange(data: number[]): number {
  if (data.length < 2) return 0
  const mid = Math.floor(data.length / 2)
  const prev = data.slice(0, mid).reduce((s, v) => s + v, 0) / Math.max(mid, 1)
  const curr = data.slice(mid).reduce((s, v) => s + v, 0) / Math.max(data.length - mid, 1)
  if (prev === 0) return curr > 0 ? 100 : 0
  return ((curr - prev) / prev) * 100
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Sparkline({ data, color, dataKey }: { data: Record<string, number | string>[]; color: string; dataKey: string }) {
  if (!data || data.length < 2) return <div style={{ height: 44 }} />
  return (
    <ResponsiveContainer width="100%" height={44}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`spark-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#spark-${dataKey})`}
          dot={false}
          isAnimationActive={false}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const v = payload[0].value as number
            return (
              <div style={{
                background: '#1a1a1a', color: '#fff',
                fontSize: 10, padding: '3px 7px',
                borderRadius: 4, whiteSpace: 'nowrap',
              }}>
                {typeof v === 'number' && v < 200 ? v.toFixed(2) + '%' : fmt(v)}
              </div>
            )
          }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Metric Card ───────────────────────────────────────────────────────────────
interface MetricCardProps {
  label: string
  value: string
  change: number
  sparkData: Record<string, number | string>[]
  sparkKey: string
  sparkColor: string
  sub?: string
}

function MetricCard({ label, value, change, sparkData, sparkKey, sparkColor, sub }: MetricCardProps) {
  const isUp = change > 0
  const isNeutral = change === 0
  return (
    <div style={{
      borderBottom: '1px solid var(--b1)',
      padding: '10px 14px 6px',
    }}>
      {/* Label */}
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--t4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>

      {/* Value + Change badge */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{
          fontSize: 18, fontWeight: 700, color: 'var(--t0)',
          fontFamily: 'var(--f-mono)', lineHeight: 1,
        }}>
          {value}
        </span>
        {!isNeutral && (
          <span style={{
            fontSize: 10, fontWeight: 600,
            color: isUp ? '#10b981' : '#ef4444',
            background: isUp ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
            padding: '2px 5px', borderRadius: 3,
            display: 'flex', alignItems: 'center', gap: 2,
          }}>
            {isUp ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%
          </span>
        )}
      </div>

      {/* Sparkline */}
      <Sparkline data={sparkData} color={sparkColor} dataKey={sparkKey} />

      {/* Sub label */}
      {sub && (
        <div style={{ fontSize: 9, color: 'var(--t4)', marginTop: 2, textAlign: 'right' }}>
          {sub}
        </div>
      )}
    </div>
  )
}

// ── Main Panel ────────────────────────────────────────────────────────────────
export default function MetricsPanel() {
  const { activeUpload } = useApp()
  const a = activeUpload?.analytics

  if (!a) {
    return (
      <aside style={{
        width: 220, flexShrink: 0,
        borderLeft: '1px solid var(--b1)',
        background: 'var(--surface)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 24, gap: 8,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'var(--teal-bg)', border: '1px solid rgba(12,87,82,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
        </div>
        <div style={{ fontSize: 11, color: 'var(--t4)', textAlign: 'center', lineHeight: 1.6 }}>
          Load a dataset<br />to see live metrics
        </div>
      </aside>
    )
  }

  const trend = a.weekly_trend ?? []
  const platform = (a.platform ?? '').toUpperCase()
  const totalEng = (a.total_likes ?? 0) + (a.total_comments ?? 0) + (a.total_shares ?? 0) + (a.total_saves ?? 0)

  // Derived sparkline data
  const reachSpark  = trend.map(w => ({ week: w.week, v: w.total_reach ?? 0 }))
  const erSpark     = trend.map(w => ({ week: w.week, v: w.avg_er ?? 0 }))
  const likesSpark  = trend.map(w => ({ week: w.week, v: w.total_likes ?? 0 }))

  // Changes
  const reachChange = computeChange(trend.map(w => w.total_reach ?? 0))
  const erChange    = computeChange(trend.map(w => w.avg_er ?? 0))
  const likesChange = computeChange(trend.map(w => w.total_likes ?? 0))

  const cards: MetricCardProps[] = [
    {
      label: 'Views / Reach',
      value: fmt(a.total_impressions || a.total_reach),
      change: reachChange,
      sparkData: reachSpark,
      sparkKey: 'v',
      sparkColor: '#0C5752',
      sub: `avg ${fmt(a.avg_reach_per_post)} / post`,
    },
    {
      label: 'Reach',
      value: fmt(a.total_reach),
      change: reachChange,
      sparkData: reachSpark,
      sparkKey: 'v',
      sparkColor: '#0C5752',
      sub: fmtPct(a.reach_growth_rate) + ' growth',
    },
    {
      label: 'Engagement Rate',
      value: fmtPct(a.avg_engagement_rate),
      change: erChange,
      sparkData: erSpark,
      sparkKey: 'v',
      sparkColor: '#6366f1',
      sub: `median ${fmtPct(a.median_engagement_rate)}`,
    },
    {
      label: 'Interactions',
      value: fmt(totalEng),
      change: likesChange,
      sparkData: likesSpark,
      sparkKey: 'v',
      sparkColor: '#f59e0b',
      sub: `${fmt(a.total_likes)} likes`,
    },
    {
      label: 'Followers',
      value: fmt(a.follower_count),
      change: a.reach_growth_rate ?? 0,
      sparkData: reachSpark,
      sparkKey: 'v',
      sparkColor: '#10b981',
      sub: `+${fmt(a.follower_growth)} gained`,
    },
    {
      label: 'Likes',
      value: fmt(a.total_likes),
      change: likesChange,
      sparkData: likesSpark,
      sparkKey: 'v',
      sparkColor: '#ec4899',
    },
    {
      label: 'Comments',
      value: fmt(a.total_comments),
      change: 0,
      sparkData: likesSpark,
      sparkKey: 'v',
      sparkColor: '#8b5cf6',
      sub: fmtPct(a.comment_rate) + ' rate',
    },
    {
      label: 'Saves',
      value: fmt(a.total_saves),
      change: 0,
      sparkData: likesSpark,
      sparkKey: 'v',
      sparkColor: '#0ea5e9',
      sub: fmtPct(a.save_rate) + ' save rate',
    },
    {
      label: 'Shares',
      value: fmt(a.total_shares),
      change: 0,
      sparkData: likesSpark,
      sparkKey: 'v',
      sparkColor: '#f97316',
      sub: fmtPct(a.virality_rate) + ' virality',
    },
  ]

  return (
    <aside style={{
      width: 220, flexShrink: 0,
      borderLeft: '1px solid var(--b1)',
      background: 'var(--surface)',
      overflowY: 'auto',
      height: '100%',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px 9px',
        borderBottom: '1px solid var(--b1)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1,
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t1)' }}>
          Analytics
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span className="live-dot" />
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--teal)', fontFamily: 'var(--f-mono)' }}>
            {platform}
          </span>
        </div>
      </div>

      {/* Metric cards */}
      <div>
        {cards.map(card => (
          <MetricCard key={card.label} {...card} />
        ))}
      </div>

      {/* Date footer */}
      <div style={{
        padding: '8px 14px',
        borderTop: '1px solid var(--b1)',
        fontSize: 9, color: 'var(--t4)', lineHeight: 1.6,
        position: 'sticky', bottom: 0, background: 'var(--surface)',
      }}>
        {a.date_range_start
          ? new Date(a.date_range_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : '—'}
        {' → '}
        {a.date_range_end
          ? new Date(a.date_range_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : '—'}
      </div>
    </aside>
  )
}
