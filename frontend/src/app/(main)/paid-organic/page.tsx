'use client'

import { useMemo } from 'react'
import { useApp } from '@/app/providers'
import CSVUpload from '@/components/upload/CSVUpload'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis,
} from 'recharts'
import type { PostTypeBreakdown } from '@/lib/types'

// ── Helpers ───────────────────────────────────────────────────────────────────
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

const PAID_KEYWORDS = ['ad', 'paid', 'sponsored', 'promoted', 'boosted', 'campaign', 'boost']

function isPaidType(type: string): boolean {
  const t = type.toLowerCase()
  return PAID_KEYWORDS.some(kw => t.includes(kw))
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--blanc)', border: '1px solid var(--b1)', padding: '8px 12px', fontSize: 11 }}>
      <div style={{ color: 'var(--t3)', marginBottom: 4, fontSize: 10 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color || 'var(--forest)', marginBottom: 2 }}>
          {p.name}: <strong>{typeof p.value === 'number' && p.value < 200 ? p.value.toFixed(2) + '%' : fmt(p.value)}</strong>
        </div>
      ))}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, accent = false,
}: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div style={{
      background: accent ? 'rgba(12,87,82,0.04)' : 'var(--blanc)',
      border: `1px solid ${accent ? 'rgba(12,87,82,0.2)' : 'var(--b1)'}`,
      padding: '16px 18px',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--vert-fonce)', fontFamily: 'var(--f-mono)', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

// ── Type pill ─────────────────────────────────────────────────────────────────
function TypePill({ type, paid }: { type: string; paid: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
      padding: '2px 7px',
      background: paid ? 'rgba(166,124,55,0.12)' : 'rgba(12,87,82,0.08)',
      color: paid ? 'var(--or)' : 'var(--sarcelle)',
      border: `1px solid ${paid ? 'rgba(166,124,55,0.28)' : 'rgba(12,87,82,0.2)'}`,
    }}>
      {paid ? '⬆ PAID' : '◆ ORGANIC'}
      {' '}{type.toUpperCase()}
    </span>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PaidOrganicPage() {
  const { activeUpload } = useApp()
  const a = activeUpload?.analytics

  // ── Classify post types ─────────────────────────────────────────────────────
  const { paidTypes, organicTypes, allTypeRows, hasPaid } = useMemo(() => {
    const breakdown: PostTypeBreakdown = a?.post_type_breakdown ?? {}
    const paidTypes: [string, any][]    = []
    const organicTypes: [string, any][] = []

    for (const [type, stats] of Object.entries(breakdown)) {
      if (isPaidType(type)) paidTypes.push([type, stats])
      else                  organicTypes.push([type, stats])
    }

    const allTypeRows = [...paidTypes, ...organicTypes].sort(
      ([, a], [, b]) => (b.count ?? 0) - (a.count ?? 0)
    )

    return { paidTypes, organicTypes, allTypeRows, hasPaid: paidTypes.length > 0 }
  }, [a?.post_type_breakdown])

  // ── Aggregate paid vs organic totals ────────────────────────────────────────
  const paidAgg = useMemo(() => {
    const rows = paidTypes.map(([, s]) => s)
    if (!rows.length) return null
    const totalPosts  = rows.reduce((s, r) => s + (r.count ?? 0), 0)
    const avgER       = rows.reduce((s, r) => s + (r.avg_er ?? 0), 0) / rows.length
    const avgReach    = rows.reduce((s, r) => s + (r.avg_reach ?? 0), 0) / rows.length
    const totalLikes  = rows.reduce((s, r) => s + (r.total_likes ?? 0), 0)
    return { totalPosts, avgER, avgReach, totalLikes }
  }, [paidTypes])

  const organicAgg = useMemo(() => {
    const rows = organicTypes.map(([, s]) => s)
    if (!rows.length) {
      // Use full dataset as organic fallback
      if (!a) return null
      return {
        totalPosts: a.total_posts,
        avgER:      a.avg_engagement_rate,
        avgReach:   a.avg_reach_per_post ?? 0,
        totalLikes: a.total_likes,
      }
    }
    const totalPosts = rows.reduce((s, r) => s + (r.count ?? 0), 0)
    const avgER      = rows.reduce((s, r) => s + (r.avg_er ?? 0), 0) / rows.length
    const avgReach   = rows.reduce((s, r) => s + (r.avg_reach ?? 0), 0) / rows.length
    const totalLikes = rows.reduce((s, r) => s + (r.total_likes ?? 0), 0)
    return { totalPosts, avgER, avgReach, totalLikes }
  }, [organicTypes, a])

  // ── Bar chart data (all types) ───────────────────────────────────────────────
  const barData = useMemo(() =>
    allTypeRows.slice(0, 10).map(([type, stats]) => ({
      type: type.replace(/_/g, ' '),
      er:   Number((stats.avg_er ?? 0).toFixed(2)),
      reach: stats.avg_reach ?? 0,
      posts: stats.count ?? 0,
      paid:  isPaidType(type),
    })),
  [allTypeRows])

  // ── Radar chart data ─────────────────────────────────────────────────────────
  const radarData = useMemo(() => {
    if (!paidAgg || !organicAgg) return []
    const paidMax    = Math.max(paidAgg.avgER,    organicAgg.avgER,    0.01)
    const reachMax   = Math.max(paidAgg.avgReach,  organicAgg.avgReach, 0.01)
    const likesMax   = Math.max(paidAgg.totalLikes, organicAgg.totalLikes, 0.01)
    const postsMax   = Math.max(paidAgg.totalPosts, organicAgg.totalPosts, 0.01)
    return [
      {
        metric: 'Eng. Rate',
        paid:    Math.round((paidAgg.avgER    / paidMax)   * 100),
        organic: Math.round((organicAgg.avgER / paidMax)   * 100),
      },
      {
        metric: 'Avg Reach',
        paid:    Math.round((paidAgg.avgReach    / reachMax) * 100),
        organic: Math.round((organicAgg.avgReach / reachMax) * 100),
      },
      {
        metric: 'Likes',
        paid:    Math.round((paidAgg.totalLikes    / likesMax) * 100),
        organic: Math.round((organicAgg.totalLikes / likesMax) * 100),
      },
      {
        metric: 'Post Volume',
        paid:    Math.round((paidAgg.totalPosts    / postsMax) * 100),
        organic: Math.round((organicAgg.totalPosts / postsMax) * 100),
      },
    ]
  }, [paidAgg, organicAgg])

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!a) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-xl">
          <div className="panel-card p-8">
            <div className="flex items-center gap-3 mb-6">
              <div style={{ width: 40, height: 40, background: 'var(--teal-bg)', border: '1px solid var(--bd-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth={1.5} strokeLinecap="round" className="w-5 h-5">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <div>
                <div className="lbl-sm" style={{ color: 'var(--teal)' }}>PAID & ORGANIC</div>
                <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 2 }}>Upload a CSV to see paid vs. organic breakdown</div>
              </div>
            </div>
            <CSVUpload />
          </div>
        </div>
      </div>
    )
  }

  const platform = (a.platform ?? 'social').toUpperCase()

  return (
    <div style={{ minHeight: '100vh' }}>
      <div className="p-4 lg:p-6 max-w-screen-2xl mx-auto">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ width: 34, height: 34, background: 'var(--sarcelle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2}>
                <rect x="3" y="3" width="18" height="7" rx="1"/><rect x="3" y="14" width="18" height="7" rx="1"/>
              </svg>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--vert-fonce)' }}>Paid & Organic</div>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>{platform} · {a.total_posts} posts analysed</div>
            </div>
          </div>

          {!hasPaid && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
              background: 'rgba(166,124,55,0.07)', border: '1px solid rgba(166,124,55,0.22)',
              fontSize: 11, color: 'var(--or)',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              No paid/boosted post types detected in this dataset — showing all content as organic.
              To enable paid split, add a <strong style={{ marginLeft: 3 }}>post_type</strong> column with values like <em>ad, paid, boosted</em>.
            </div>
          )}
        </div>

        {/* ── Paid vs Organic summary cards ───────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--b1)', border: '1px solid var(--b1)', marginBottom: 20 }}>

          {/* Organic block */}
          <div style={{ background: 'var(--blanc)', padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 8, height: 8, background: 'var(--sarcelle)', borderRadius: '50%' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--sarcelle)', letterSpacing: '0.07em' }}>ORGANIC</span>
              {organicAgg && (
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--t3)' }}>
                  {organicAgg.totalPosts} posts
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <StatCard label="Avg ER"       value={fmtPct(organicAgg?.avgER)}    accent />
              <StatCard label="Avg Reach"    value={fmt(organicAgg?.avgReach)} />
              <StatCard label="Total Likes"  value={fmt(organicAgg?.totalLikes)} />
              <StatCard label="Posts"        value={fmt(organicAgg?.totalPosts)} />
            </div>
          </div>

          {/* Paid block */}
          <div style={{ background: 'rgba(166,124,55,0.025)', padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 8, height: 8, background: 'var(--or)', borderRadius: '50%' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--or)', letterSpacing: '0.07em' }}>PAID / BOOSTED</span>
              {paidAgg && (
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--t3)' }}>
                  {paidAgg.totalPosts} posts
                </span>
              )}
            </div>
            {paidAgg ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <StatCard label="Avg ER"       value={fmtPct(paidAgg.avgER)}     accent />
                <StatCard label="Avg Reach"    value={fmt(paidAgg.avgReach)} />
                <StatCard label="Total Likes"  value={fmt(paidAgg.totalLikes)} />
                <StatCard label="Posts"        value={fmt(paidAgg.totalPosts)} />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 120, gap: 6 }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(166,124,55,0.35)" strokeWidth={1.5}>
                  <circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 3"/>
                </svg>
                <span style={{ fontSize: 11, color: 'var(--t4)', textAlign: 'center' }}>
                  No paid posts found.<br/>Add post types like <em>ad</em> or <em>boosted</em>.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── ER Advantage banner ──────────────────────────────────────────── */}
        {paidAgg && organicAgg && (() => {
          const delta   = paidAgg.avgER - organicAgg.avgER
          const winner  = delta > 0 ? 'paid' : 'organic'
          const diffPct = Math.abs(delta).toFixed(2)
          return (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '10px 16px', marginBottom: 20,
              background: winner === 'paid' ? 'rgba(166,124,55,0.07)' : 'rgba(12,87,82,0.07)',
              border: `1px solid ${winner === 'paid' ? 'rgba(166,124,55,0.25)' : 'rgba(12,87,82,0.2)'}`,
              fontSize: 12, color: winner === 'paid' ? 'var(--or)' : 'var(--sarcelle)', fontWeight: 600,
            }}>
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 18, fontWeight: 800 }}>
                {winner === 'paid' ? '⬆' : '◆'}
              </span>
              {winner === 'paid' ? 'Paid' : 'Organic'} posts outperform by{' '}
              <strong style={{ fontFamily: 'var(--f-mono)' }}>{diffPct}% ER</strong>
            </div>
          )
        })()}

        {/* ── Charts row ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

          {/* Bar chart: ER by post type */}
          {barData.length > 0 && (
            <div className="panel-card" style={{ padding: 0 }}>
              <div className="panel-header">
                <div>
                  <div className="lbl-xs">BY CONTENT TYPE</div>
                  <div className="panel-title" style={{ marginTop: 3 }}>Avg Engagement Rate per Type</div>
                </div>
              </div>
              <div style={{ padding: '12px 16px 20px' }}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={barData} margin={{ top: 4, right: 10, left: -20, bottom: 30 }}>
                    <CartesianGrid stroke="var(--bd-void)" vertical={false} />
                    <XAxis
                      dataKey="type"
                      tick={{ fill: 'var(--t4)', fontSize: 9 }}
                      tickLine={false} axisLine={false}
                      angle={-35} textAnchor="end" interval={0}
                    />
                    <YAxis tick={{ fill: 'var(--t4)', fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={v => v + '%'} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="er" name="Avg ER" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                      {barData.map((d, i) => (
                        <Cell key={i} fill={d.paid ? '#a67c37' : 'var(--sarcelle)'} fillOpacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                {/* Legend */}
                <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--t3)' }}>
                    <div style={{ width: 10, height: 10, background: 'var(--sarcelle)' }} /> Organic
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--t3)' }}>
                    <div style={{ width: 10, height: 10, background: 'var(--or)' }} /> Paid
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Radar chart: paid vs organic dimensions */}
          {radarData.length > 0 && (
            <div className="panel-card" style={{ padding: 0 }}>
              <div className="panel-header">
                <div>
                  <div className="lbl-xs">COMPARISON</div>
                  <div className="panel-title" style={{ marginTop: 3 }}>Paid vs Organic — All Dimensions</div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--t3)' }}>
                    <div style={{ width: 10, height: 10, background: 'var(--sarcelle)', opacity: 0.5 }} /> Organic
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--t3)' }}>
                    <div style={{ width: 10, height: 10, background: 'var(--or)', opacity: 0.5 }} /> Paid
                  </div>
                </div>
              </div>
              <div style={{ padding: '12px 16px 20px', display: 'flex', justifyContent: 'center' }}>
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="var(--bd-void)" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: 'var(--t3)', fontSize: 10 }} />
                    <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
                    <Radar name="Organic" dataKey="organic" stroke="var(--sarcelle)" fill="var(--sarcelle)" fillOpacity={0.18} strokeWidth={1.8} />
                    <Radar name="Paid"    dataKey="paid"    stroke="var(--or)"       fill="var(--or)"       fillOpacity={0.18} strokeWidth={1.8} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        {/* ── Post type breakdown table ─────────────────────────────────────── */}
        {allTypeRows.length > 0 && (
          <div className="panel-card" style={{ padding: 0 }}>
            <div className="panel-header">
              <div>
                <div className="lbl-xs">FULL BREAKDOWN</div>
                <div className="panel-title" style={{ marginTop: 3 }}>Performance by Content Type</div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--t3)' }}>{allTypeRows.length} types</div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="screener-table">
                <thead>
                  <tr>
                    <th>TYPE</th>
                    <th>CATEGORY</th>
                    <th style={{ textAlign: 'right' }}>POSTS</th>
                    <th style={{ textAlign: 'right' }}>SHARE</th>
                    <th style={{ textAlign: 'right' }}>AVG ER</th>
                    <th style={{ textAlign: 'right' }}>AVG REACH</th>
                    <th style={{ textAlign: 'right' }}>TOTAL LIKES</th>
                  </tr>
                </thead>
                <tbody>
                  {allTypeRows.map(([type, stats], i) => {
                    const paid = isPaidType(type)
                    const share = a.total_posts > 0 ? (stats.count / a.total_posts) * 100 : 0
                    return (
                      <tr key={type}>
                        <td style={{ fontWeight: 600, fontSize: 12 }}>{type.replace(/_/g, ' ')}</td>
                        <td><TypePill type={paid ? 'paid' : 'organic'} paid={paid} /></td>
                        <td className="td-num">{fmt(stats.count)}</td>
                        <td className="td-num" style={{ color: 'var(--t3)' }}>{share.toFixed(1)}%</td>
                        <td className="td-num" style={{ color: 'var(--teal)', fontWeight: 700 }}>{fmtPct(stats.avg_er)}</td>
                        <td className="td-num td-hi">{fmt(stats.avg_reach)}</td>
                        <td className="td-num">{fmt(stats.total_likes)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* Insight footer */}
            {allTypeRows.length > 0 && (() => {
              const best = allTypeRows.reduce(([bt, bs], [t, s]) =>
                (s.avg_er ?? 0) > (bs.avg_er ?? 0) ? [t, s] : [bt, bs]
              )
              return (
                <div style={{ padding: '10px 16px', borderTop: '1px solid var(--bd-void)', fontSize: 11, color: 'var(--t3)' }}>
                  Best performing type: <strong style={{ color: 'var(--vert-fonce)' }}>{best[0].replace(/_/g, ' ')}</strong>{' '}
                  with <strong style={{ color: 'var(--sarcelle)', fontFamily: 'var(--f-mono)' }}>{fmtPct(best[1].avg_er)}</strong> avg ER
                </div>
              )
            })()}
          </div>
        )}

        {/* ── No breakdown state ───────────────────────────────────────────── */}
        {allTypeRows.length === 0 && (
          <div className="panel-card" style={{ padding: '32px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 8 }}>No post type breakdown available for this dataset.</div>
            <div style={{ fontSize: 10, color: 'var(--t4)' }}>
              Add a <code style={{ background: 'var(--teal-bg)', padding: '1px 4px', fontSize: 10 }}>post_type</code> column to your CSV to see paid vs organic analysis.
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
