'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useApp } from '@/app/providers'
import { getPosts } from '@/lib/api'
import type { PostData } from '@/lib/types'
import CSVUpload from '@/components/upload/CSVUpload'

const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function erColor(er: number, avg: number) {
  if (er > avg * 1.5) return '#10b981'
  if (er > avg)       return 'var(--teal)'
  if (er > 0)         return '#f59e0b'
  return '#ef4444'
}

export default function CalendarPage() {
  const { activeUpload } = useApp()
  const uploadId = activeUpload?.upload_id

  const today = new Date()
  const [viewYear,  setViewYear]  = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selected,  setSelected]  = useState<PostData[] | null>(null)
  const [selDate,   setSelDate]   = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['posts-all', uploadId],
    queryFn:  () => getPosts(uploadId!, 'posted_at', 'desc', 1, undefined, undefined),
    enabled:  !!uploadId,
  })

  const avgER = activeUpload?.analytics?.avg_engagement_rate ?? 0

  // Build date → posts map
  const byDate = useMemo(() => {
    const map: Record<string, PostData[]> = {}
    ;(data?.posts ?? []).forEach(p => {
      if (!p.posted_at) return
      const key = p.posted_at.slice(0, 10)
      if (!map[key]) map[key] = []
      map[key].push(p)
    })
    return map
  }, [data])

  // Calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  function selectDay(day: number) {
    const key = `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    const posts = byDate[key]
    if (posts?.length) { setSelected(posts); setSelDate(key) }
  }

  // Heatmap: count posts per day
  const monthKeys = Array.from({ length: daysInMonth }, (_, i) =>
    `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${String(i + 1).padStart(2,'0')}`
  )
  const maxPosts = Math.max(1, ...monthKeys.map(k => byDate[k]?.length ?? 0))

  return (
    <div className="p-6 lg:p-8 max-w-screen-xl mx-auto">
      <header className="mb-6">
        <div className="text-[11px] font-semibold tracking-[4px] uppercase mb-1" style={{ color: 'var(--teal)' }}>Scheduling</div>
        <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--forest)' }}>
          Content <span style={{ color: 'var(--teal)' }}>Calendar</span>
        </h1>
        <p className="text-sm mt-1 italic" style={{ color: 'rgba(15,23,42,0.45)' }}>
          Visualise your posting cadence and engagement patterns across the month.
        </p>
      </header>

      {!activeUpload ? (
        <div className="max-w-lg"><CSVUpload /></div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-5">
          {/* Calendar */}
          <div className="lg:col-span-2 card p-5">
            {/* Month nav */}
            <div className="flex items-center justify-between mb-5">
              <button onClick={prevMonth} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors" style={{ background: 'rgba(15,23,42,0.05)' }}>
                ‹
              </button>
              <h2 className="text-base font-bold" style={{ color: 'var(--forest)' }}>
                {MONTHS[viewMonth]} {viewYear}
              </h2>
              <button onClick={nextMonth} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors" style={{ background: 'rgba(15,23,42,0.05)' }}>
                ›
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {DAYS.map(d => (
                <div key={d} className="text-center py-1 text-[10px] font-semibold tracking-wider uppercase" style={{ color: 'rgba(15,23,42,0.35)' }}>{d}</div>
              ))}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: firstDay }, (_, i) => <div key={`empty-${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1
                const key = `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                const posts = byDate[key] ?? []
                const count = posts.length
                const heat  = count / maxPosts
                const bestER = count > 0 ? Math.max(...posts.map(p => p.engagement_rate)) : 0
                const isToday = viewYear === today.getFullYear() && viewMonth === today.getMonth() && day === today.getDate()
                const isSelected = selDate === key

                return (
                  <div
                    key={day}
                    onClick={() => selectDay(day)}
                    className="aspect-square rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all relative"
                    style={{
                      background: count > 0 ? `rgba(79,70,229,${0.06 + heat * 0.2})` : 'rgba(15,23,42,0.02)',
                      border: isSelected ? '2px solid var(--teal)' : isToday ? '1.5px solid var(--teal)' : '1px solid transparent',
                    }}
                  >
                    <span
                      className="text-xs font-semibold"
                      style={{ color: isToday ? 'var(--teal)' : count > 0 ? 'var(--forest)' : 'rgba(15,23,42,0.4)' }}
                    >
                      {day}
                    </span>
                    {count > 0 && (
                      <>
                        <div className="flex gap-0.5 mt-0.5">
                          {[...Array(Math.min(count, 3))].map((_, j) => (
                            <div key={j} className="w-1 h-1 rounded-full" style={{ background: erColor(bestER, avgER) }} />
                          ))}
                        </div>
                        <span className="text-[8px] mt-0.5" style={{ color: 'rgba(15,23,42,0.45)' }}>{count}p</span>
                      </>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-4 text-[10px]" style={{ color: 'rgba(15,23,42,0.4)' }}>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: '#10b981' }} />
                Above avg ER
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: 'var(--teal)' }} />
                Near avg ER
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: '#f59e0b' }} />
                Below avg ER
              </div>
            </div>
          </div>

          {/* Side panel */}
          <div className="space-y-4">
            {/* Monthly stats */}
            <div className="card p-5">
              <div className="text-[10px] font-semibold tracking-[3px] uppercase mb-3" style={{ color: 'rgba(15,23,42,0.4)' }}>
                {MONTHS[viewMonth]} Summary
              </div>
              {(() => {
                const monthPosts = monthKeys.flatMap(k => byDate[k] ?? [])
                const total = monthPosts.length
                const avgMonthER = total > 0 ? monthPosts.reduce((s,p) => s + p.engagement_rate, 0) / total : 0
                const totalReach = monthPosts.reduce((s,p) => s + p.reach, 0)
                const activeDays = monthKeys.filter(k => byDate[k]?.length).length
                return (
                  <div className="space-y-2.5">
                    {[
                      { label: 'Posts Published', value: total.toString() },
                      { label: 'Active Days',     value: activeDays.toString() },
                      { label: 'Avg ER',          value: `${avgMonthER.toFixed(2)}%` },
                      { label: 'Total Reach',     value: total > 0 ? `${(totalReach/1000).toFixed(1)}K` : '—' },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between">
                        <span className="text-xs" style={{ color: 'rgba(15,23,42,0.5)' }}>{label}</span>
                        <span className="text-sm font-bold" style={{ color: 'var(--forest)' }}>{value}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>

            {/* Selected day posts */}
            {selected && (
              <div className="card p-5">
                <div className="text-[10px] font-semibold tracking-[3px] uppercase mb-3" style={{ color: 'rgba(15,23,42,0.4)' }}>
                  {selDate} · {selected.length} post{selected.length !== 1 ? 's' : ''}
                </div>
                <div className="space-y-3">
                  {selected.map((p, i) => (
                    <div key={p.id ?? i} className="p-3 rounded-xl" style={{ background: 'rgba(15,23,42,0.03)', borderLeft: `2.5px solid ${erColor(p.engagement_rate, avgER)}` }}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[9px] font-semibold uppercase px-2 py-0.5 rounded-full" style={{ background: 'rgba(79,70,229,0.08)', color: 'var(--teal)' }}>
                          {p.post_type ?? 'Post'}
                        </span>
                        <span className="text-xs font-bold" style={{ color: erColor(p.engagement_rate, avgER) }}>
                          {p.engagement_rate}% ER
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: 'rgba(15,23,42,0.6)' }}>
                        {p.caption ? p.caption.slice(0, 80) + (p.caption.length > 80 ? '…' : '') : 'No caption'}
                      </p>
                      <div className="flex gap-3 mt-1.5 text-[10px]" style={{ color: 'rgba(15,23,42,0.4)' }}>
                        <span>♥ {p.likes}</span>
                        <span>💬 {p.comments}</span>
                        <span>📤 {p.shares}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!selected && (
              <div className="card p-5 text-center" style={{ color: 'rgba(15,23,42,0.35)' }}>
                <div className="text-3xl mb-2">📅</div>
                <p className="text-xs">Click a day with posts to see details</p>
              </div>
            )}

            {isLoading && (
              <div className="card p-5 text-center text-sm" style={{ color: 'rgba(15,23,42,0.3)' }}>
                Loading calendar…
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
