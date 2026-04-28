'use client'

import React, { useState } from 'react'
import { useApp } from '@/app/providers'
import { useQuery } from '@tanstack/react-query'
import { getPosts } from '@/lib/api'
import type { PostData } from '@/lib/types'
import CSVUpload from '@/components/upload/CSVUpload'

function fmt(n: number | undefined | null): string {
  if (n == null || isNaN(Number(n))) return '—'
  const v = Number(n)
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}K`
  return v.toLocaleString()
}

function fmtMoney(n: number | undefined | null): string {
  if (n == null) return '—'
  return `$${Number(n).toFixed(2)}`
}

// Derive "status" from post type / engagement
function getStatus(p: PostData): 'active' | 'paused' | 'ended' {
  if (!p.post_type) return 'active'
  const t = p.post_type.toLowerCase()
  if (t.includes('pause') || t.includes('draft')) return 'paused'
  if (t.includes('archive') || t.includes('end'))  return 'ended'
  return 'active'
}

// Derive ad "results" (leads/engagement) — use likes + comments as result proxy
function getResults(p: PostData) {
  return (p.likes ?? 0) + (p.comments ?? 0)
}

// Cost per result: not available from organic data → shown as —
function getCPR(): string { return '—' }

// Amount spent: not available from organic data → shown as —
function getSpent(): string { return '—' }

function StatusBadge({ status }: { status: 'active' | 'paused' | 'ended' }) {
  const cfg = {
    active: { bg: '#dcfce7', color: '#16a34a', label: 'Active' },
    paused: { bg: '#fef9c3', color: '#ca8a04', label: 'Paused' },
    ended:  { bg: '#f1f5f9', color: '#64748b', label: 'Ended' },
  }[status]
  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 20,
      whiteSpace: 'nowrap',
    }}>
      {cfg.label}
    </span>
  )
}

// ── Column toggle state ───────────────────────────────────────────────────────
const ALL_COLS = ['results', 'cpr', 'spent', 'views', 'reach', 'saves', 'er'] as const
type Col = typeof ALL_COLS[number]

const COL_LABELS: Record<Col, string> = {
  results: 'Results',
  cpr:     'Cost / Result',
  spent:   'Amount Spent',
  views:   'Views (Impr.)',
  reach:   'Viewers (Reach)',
  saves:   'Saves',
  er:      'ER %',
}

export default function AdsManagerPage() {
  const { activeUpload } = useApp()
  const uploadId = activeUpload?.upload_id
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatus] = useState<'all' | 'active' | 'paused'>('all')
  const [showCols, setShowCols]   = useState<Set<Col>>(new Set(['results', 'cpr', 'spent', 'views', 'reach', 'saves', 'er']))
  const [colPicker, setColPicker] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['ads-manager', uploadId],
    queryFn:  () => getPosts(uploadId!, 'engagement_rate', 'desc', 1),
    enabled:  !!uploadId,
  })

  const posts: PostData[] = data?.posts ?? []

  // Filter
  const visible = posts.filter(p => {
    if (statusFilter !== 'all' && getStatus(p) !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (p.post_id ?? '').toLowerCase().includes(q) || (p.post_type ?? '').toLowerCase().includes(q)
    }
    return true
  })

  function toggleCol(c: Col) {
    setShowCols(prev => {
      const n = new Set(prev)
      n.has(c) ? n.delete(c) : n.add(c)
      return n
    })
  }

  return (
    <div className="p-4 lg:p-6 max-w-screen-2xl mx-auto">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--forest)' }}>Ads Manager</h1>
          <p style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
            Content performance in ads-manager format — all your posts at a glance
          </p>
        </div>
        {activeUpload && (
          <div style={{
            background: 'var(--teal-bg)', border: '1px solid var(--bd-dim)',
            borderRadius: 8, padding: '8px 14px', fontSize: 12, color: 'var(--teal)',
            fontWeight: 600,
          }}>
            {(activeUpload.platform ?? '').toUpperCase()} · {activeUpload.row_count} posts
          </div>
        )}
      </div>

      {!activeUpload ? (
        <div className="max-w-lg"><CSVUpload /></div>
      ) : (
        <div>
          {/* ── Filter bar ─────────────────────────────────────────────── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
            flexWrap: 'wrap',
          }}>
            {/* Status dropdown */}
            <select
              value={statusFilter}
              onChange={e => setStatus(e.target.value as typeof statusFilter)}
              style={{
                padding: '7px 12px', fontSize: 12, border: '1px solid var(--bd-dim)',
                borderRadius: 8, background: '#fff', color: 'var(--forest)', cursor: 'pointer',
              }}
            >
              <option value="all">Status: All</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
            </select>

            {/* Search */}
            <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--t4)" strokeWidth="2"
                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by ID or type…"
                style={{
                  width: '100%', padding: '7px 12px 7px 32px',
                  fontSize: 12, border: '1px solid var(--bd-dim)',
                  borderRadius: 8, background: '#fff', color: 'var(--forest)',
                }}
              />
            </div>

            {/* Column picker */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setColPicker(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', fontSize: 12, fontWeight: 600,
                  border: '1px solid var(--bd-dim)', borderRadius: 8,
                  background: '#fff', color: 'var(--forest)', cursor: 'pointer',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                  <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                </svg>
                Columns
              </button>
              {colPicker && (
                <div style={{
                  position: 'absolute', right: 0, top: '110%', zIndex: 50,
                  background: '#fff', border: '1px solid var(--bd-dim)',
                  borderRadius: 10, padding: 12, minWidth: 180,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t4)', marginBottom: 8, letterSpacing: 1 }}>SHOW COLUMNS</div>
                  {ALL_COLS.map(c => (
                    <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer', fontSize: 12, color: 'var(--forest)' }}>
                      <input
                        type="checkbox"
                        checked={showCols.has(c)}
                        onChange={() => toggleCol(c)}
                        style={{ accentColor: 'var(--teal)' }}
                      />
                      {COL_LABELS[c]}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Table ───────────────────────────────────────────────────── */}
          <div style={{ background: '#fff', border: '1px solid var(--bd-dim)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-base)', borderBottom: '1px solid var(--bd-dim)' }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--t3)', whiteSpace: 'nowrap' }}>
                      Title ↑↓
                    </th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--t3)', whiteSpace: 'nowrap' }}>
                      Status ↑↓
                    </th>
                    {showCols.has('results') && <th style={thStyle}>Results ↑↓</th>}
                    {showCols.has('cpr')     && <th style={thStyle}>Cost / Result ↑↓</th>}
                    {showCols.has('spent')   && <th style={thStyle}>Amount Spent ↑↓</th>}
                    {showCols.has('views')   && <th style={thStyle}>Views ↑↓</th>}
                    {showCols.has('reach')   && <th style={thStyle}>Viewers ↑↓</th>}
                    {showCols.has('saves')   && <th style={thStyle}>Saves ↑↓</th>}
                    {showCols.has('er')      && <th style={thStyle}>ER % ↑↓</th>}
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td colSpan={10} style={{ padding: 40, textAlign: 'center', color: 'var(--t4)', fontSize: 12 }}>
                        Loading posts…
                      </td>
                    </tr>
                  )}
                  {!isLoading && visible.length === 0 && (
                    <tr>
                      <td colSpan={10} style={{ padding: 40, textAlign: 'center', color: 'var(--t4)', fontSize: 12 }}>
                        No posts found
                      </td>
                    </tr>
                  )}
                  {visible.map((p, i) => {
                    const status = getStatus(p)
                    const results = getResults(p)
                    return (
                      <tr
                        key={p.post_id ?? i}
                        style={{ borderBottom: '1px solid var(--bd-void)', transition: 'background 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                      >
                        {/* Title cell */}
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {/* Thumbnail placeholder */}
                            <div style={{
                              width: 44, height: 44, borderRadius: 6, flexShrink: 0,
                              background: 'linear-gradient(135deg, var(--teal-bg), var(--gold-bg))',
                              border: '1px solid var(--bd-dim)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <span style={{ fontSize: 16 }}>
                                {p.post_type?.toLowerCase().includes('video') || p.post_type?.toLowerCase().includes('reel') ? '🎬' :
                                 p.post_type?.toLowerCase().includes('story') ? '📸' :
                                 p.post_type?.toLowerCase().includes('carousel') ? '🎭' : '🖼️'}
                              </span>
                            </div>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--forest)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {p.post_id ? `Post ${p.post_id.slice(0, 12)}` : `Post #${i + 1}`}
                              </div>
                              <div style={{ display: 'flex', gap: 6, marginTop: 3, alignItems: 'center' }}>
                                <span style={{ fontSize: 10, color: 'var(--t3)', background: 'var(--bd-void)', padding: '1px 6px', borderRadius: 10 }}>
                                  {p.post_type ?? 'post'}
                                </span>
                                {p.posted_at && (
                                  <span style={{ fontSize: 10, color: 'var(--t4)' }}>
                                    {new Date(p.posted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Status */}
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <StatusBadge status={status} />
                        </td>

                        {/* Results */}
                        {showCols.has('results') && (
                          <td style={tdStyle}>
                            <div style={{ fontWeight: 600, color: 'var(--forest)' }}>{fmt(results)}</div>
                            <div style={{ fontSize: 10, color: 'var(--t4)' }}>
                              {p.likes ?? 0} likes + {p.comments ?? 0} cmts
                            </div>
                          </td>
                        )}

                        {/* Cost per result */}
                        {showCols.has('cpr') && (
                          <td style={tdStyle}><span style={{ color: 'var(--t3)' }}>—</span></td>
                        )}

                        {/* Amount spent */}
                        {showCols.has('spent') && (
                          <td style={tdStyle}><span style={{ color: 'var(--t3)' }}>—</span></td>
                        )}

                        {/* Views (Impressions) */}
                        {showCols.has('views') && (
                          <td style={tdStyle}>
                            <span style={{ fontWeight: 600, color: 'var(--forest)' }}>
                              {fmt(p.impressions || p.reach)}
                            </span>
                          </td>
                        )}

                        {/* Viewers (Reach) */}
                        {showCols.has('reach') && (
                          <td style={tdStyle}>
                            <span style={{ fontWeight: 600, color: 'var(--forest)' }}>{fmt(p.reach)}</span>
                          </td>
                        )}

                        {/* Saves */}
                        {showCols.has('saves') && (
                          <td style={tdStyle}>
                            <span style={{ fontWeight: 600, color: 'var(--forest)' }}>{fmt(p.saves)}</span>
                          </td>
                        )}

                        {/* ER */}
                        {showCols.has('er') && (
                          <td style={tdStyle}>
                            <span style={{ fontWeight: 700, color: 'var(--teal)' }}>
                              {(p.engagement_rate ?? 0).toFixed(2)}%
                            </span>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Table footer */}
            <div style={{
              padding: '10px 16px', borderTop: '1px solid var(--bd-void)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'var(--bg-base)',
            }}>
              <span style={{ fontSize: 11, color: 'var(--t4)' }}>
                Showing {visible.length} of {posts.length} posts
              </span>
              {posts.length > 0 && (
                <div style={{ display: 'flex', gap: 20, fontSize: 11, color: 'var(--t3)' }}>
                  <span>Total reach: <strong style={{ color: 'var(--forest)' }}>{fmt(posts.reduce((s, p) => s + (p.reach ?? 0), 0))}</strong></span>
                  <span>Total interactions: <strong style={{ color: 'var(--forest)' }}>{fmt(posts.reduce((s, p) => s + (p.likes ?? 0) + (p.comments ?? 0), 0))}</strong></span>
                  <span>Avg ER: <strong style={{ color: 'var(--teal)' }}>{(posts.reduce((s, p) => s + (p.engagement_rate ?? 0), 0) / Math.max(posts.length, 1)).toFixed(2)}%</strong></span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'right',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--t3)',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '12px',
  textAlign: 'right',
  fontSize: 12,
  color: 'var(--forest)',
}
