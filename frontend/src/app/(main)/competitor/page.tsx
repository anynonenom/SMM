'use client'

import { useState, useRef, type DragEvent } from 'react'
import { uploadCSV } from '@/lib/api'
import { useApp } from '@/app/providers'
import type { AnalyticsData } from '@/lib/types'
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts'

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return n?.toString() ?? '0'
}

function normalize(v: number, max: number) {
  return max > 0 ? Math.round((v / max) * 100) : 0
}

function DropZone({ label, onFile, loading, data, color }: {
  label: string
  onFile: (f: File) => void
  loading: boolean
  data: AnalyticsData | null
  color: string
}) {
  const [dragging, setDragging] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  function onDrop(e: DragEvent) {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]; if (f?.name.endsWith('.csv')) onFile(f)
  }

  return (
    <div className="card p-5 flex-1">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-3 h-3 rounded-full" style={{ background: color }} />
        <div className="text-[10px] font-semibold tracking-[3px] uppercase" style={{ color: 'rgba(15,23,42,0.4)' }}>{label}</div>
      </div>

      {!data ? (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => ref.current?.click()}
          className="rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all"
          style={{ borderColor: dragging ? color : 'rgba(15,23,42,0.12)', background: dragging ? `${color}08` : 'transparent' }}
        >
          <input ref={ref} type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
          {loading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: color, borderTopColor: 'transparent' }} />
              <span className="text-xs" style={{ color: 'rgba(15,23,42,0.4)' }}>Parsing…</span>
            </div>
          ) : (
            <>
              <p className="text-sm font-semibold mb-1" style={{ color: 'rgba(15,23,42,0.5)' }}>Drop CSV here</p>
              <p className="text-xs" style={{ color: 'rgba(15,23,42,0.35)' }}>or click to browse</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[9px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-full" style={{ background: `${color}15`, color }}>
              {data.platform?.toUpperCase()}
            </span>
            <span className="text-xs" style={{ color: 'rgba(15,23,42,0.45)' }}>{data.total_posts} posts</span>
          </div>
          {[
            { label: 'Avg ER',      value: `${data.avg_engagement_rate}%` },
            { label: 'Total Reach', value: fmt(data.total_reach) },
            { label: 'Followers',   value: fmt(data.follower_count) },
            { label: 'Total Likes', value: fmt(data.total_likes) },
            { label: 'Comments',    value: fmt(data.total_comments) },
            { label: 'Shares',      value: fmt(data.total_shares) },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between items-center py-1.5 border-b" style={{ borderColor: 'rgba(15,23,42,0.05)' }}>
              <span className="text-xs" style={{ color: 'rgba(15,23,42,0.5)' }}>{label}</span>
              <span className="text-sm font-bold" style={{ color }}>{value}</span>
            </div>
          ))}
          <button
            onClick={() => ref.current?.click()}
            className="text-xs mt-2"
            style={{ color: 'rgba(15,23,42,0.35)' }}
          >
            Replace dataset
          </button>
          <input ref={ref} type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
        </div>
      )}
    </div>
  )
}

export default function CompetitorPage() {
  const { activeUpload } = useApp()

  const [compData, setCompData]     = useState<AnalyticsData | null>(null)
  const [compLoading, setCompLoading] = useState(false)
  const [compError, setCompError]   = useState<string | null>(null)

  const myData   = activeUpload?.analytics ?? null
  const [myLoading] = useState(false)
  const [myError]   = useState<string | null>(null)

  async function loadCompetitor(file: File) {
    setCompLoading(true); setCompError(null)
    try {
      const r = await uploadCSV(file)
      setCompData(r.analytics)
    } catch (e: unknown) {
      setCompError(e instanceof Error ? e.message : 'Failed to parse CSV')
    } finally {
      setCompLoading(false)
    }
  }

  // Build radar data
  const radarData = myData && compData ? (() => {
    const maxER = Math.max(myData.avg_engagement_rate, compData.avg_engagement_rate)
    const maxReach = Math.max(myData.total_reach, compData.total_reach)
    const maxLikes = Math.max(myData.total_likes, compData.total_likes)
    const maxCom = Math.max(myData.total_comments, compData.total_comments)
    const maxShares = Math.max(myData.total_shares, compData.total_shares)
    const maxPosts = Math.max(myData.total_posts, compData.total_posts)
    return [
      { metric: 'Engagement Rate', you: normalize(myData.avg_engagement_rate, maxER), competitor: normalize(compData.avg_engagement_rate, maxER) },
      { metric: 'Total Reach',     you: normalize(myData.total_reach, maxReach),   competitor: normalize(compData.total_reach, maxReach) },
      { metric: 'Likes',           you: normalize(myData.total_likes, maxLikes),   competitor: normalize(compData.total_likes, maxLikes) },
      { metric: 'Comments',        you: normalize(myData.total_comments, maxCom),  competitor: normalize(compData.total_comments, maxCom) },
      { metric: 'Shares',          you: normalize(myData.total_shares, maxShares), competitor: normalize(compData.total_shares, maxShares) },
      { metric: 'Volume',          you: normalize(myData.total_posts, maxPosts),   competitor: normalize(compData.total_posts, maxPosts) },
    ]
  })() : []

  // Win/lose comparison
  const wins = myData && compData ? [
    { label: 'Engagement Rate',  you: myData.avg_engagement_rate, comp: compData.avg_engagement_rate, suffix: '%', better: 'higher' },
    { label: 'Total Reach',      you: myData.total_reach,         comp: compData.total_reach,         suffix: '',  better: 'higher' },
    { label: 'Follower Count',   you: myData.follower_count,      comp: compData.follower_count,       suffix: '',  better: 'higher' },
    { label: 'Avg Likes/Post',   you: myData.total_likes / myData.total_posts,   comp: compData.total_likes / compData.total_posts,   suffix: '', better: 'higher' },
    { label: 'Avg Comments/Post',you: myData.total_comments / myData.total_posts,comp: compData.total_comments / compData.total_posts,suffix: '', better: 'higher' },
    { label: 'Post Volume',      you: myData.total_posts,         comp: compData.total_posts,          suffix: '',  better: 'higher' },
  ] : []

  return (
    <div className="p-6 lg:p-8 max-w-screen-xl mx-auto">
      <header className="mb-6">
        <div className="text-[11px] font-semibold tracking-[4px] uppercase mb-1" style={{ color: 'var(--teal)' }}>Benchmarking</div>
        <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--forest)' }}>
          Competitor <span style={{ color: 'var(--teal)' }}>Analysis</span>
        </h1>
        <p className="text-sm mt-1 italic" style={{ color: 'rgba(15,23,42,0.45)' }}>
          Upload two CSV exports to benchmark your account against a competitor side-by-side.
        </p>
      </header>

      {/* Upload row */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <DropZone
          label="Your Account"
          onFile={() => {}}
          loading={myLoading}
          data={myData}
          color="var(--teal)"
        />
        <div className="flex items-center justify-center">
          <div className="text-xl font-black" style={{ color: 'rgba(15,23,42,0.2)' }}>VS</div>
        </div>
        <DropZone
          label="Competitor"
          onFile={loadCompetitor}
          loading={compLoading}
          data={compData}
          color="#6366f1"
        />
      </div>

      {compError && (
        <div className="card p-4 mb-5 text-sm" style={{ background: 'rgba(239,68,68,0.06)', color: '#ef4444' }}>
          {compError}
        </div>
      )}

      {myData && compData && (
        <div className="space-y-5">
          {/* Radar chart */}
          <div className="card p-5">
            <div className="text-[10px] font-semibold tracking-[3px] uppercase mb-4" style={{ color: 'rgba(15,23,42,0.4)' }}>
              Performance Radar
            </div>
            <div className="flex flex-col md:flex-row items-center gap-6">
              <ResponsiveContainer width={320} height={280}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="rgba(15,23,42,0.08)" />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: 'rgba(15,23,42,0.5)', fontFamily: 'Inter' }} />
                  <Radar name="You"        dataKey="you"        stroke="var(--teal)" fill="var(--teal)" fillOpacity={0.15} strokeWidth={2} />
                  <Radar name="Competitor" dataKey="competitor" stroke="#6366f1"     fill="#6366f1"     fillOpacity={0.1}  strokeWidth={2} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                </RadarChart>
              </ResponsiveContainer>
              <div className="flex gap-6">
                {[
                  { color: 'var(--teal)', label: 'You' },
                  { color: '#6366f1',     label: 'Competitor' },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: color }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--forest)' }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Metric comparison table */}
          <div className="card p-0 overflow-hidden">
            <div className="px-5 py-3 border-b" style={{ borderColor: 'rgba(15,23,42,0.06)' }}>
              <div className="text-[10px] font-semibold tracking-[3px] uppercase" style={{ color: 'rgba(15,23,42,0.4)' }}>Head-to-Head</div>
            </div>
            <div className="divide-y" style={{ '--tw-divide-opacity': 1 } as React.CSSProperties}>
              {wins.map(({ label, you, comp, suffix, better }) => {
                const youWins = better === 'higher' ? you >= comp : you <= comp
                const diff = you > 0 ? Math.abs(((you - comp) / you) * 100).toFixed(1) : '—'
                return (
                  <div key={label} className="px-5 py-3 flex items-center gap-4" style={{ borderColor: 'rgba(15,23,42,0.06)' }}>
                    <span className="text-xs flex-1" style={{ color: 'rgba(15,23,42,0.55)' }}>{label}</span>
                    <div className="flex items-center gap-1">
                      {youWins && <span className="text-[9px] font-bold text-emerald-500">WIN</span>}
                      <span className="text-sm font-bold" style={{ color: youWins ? 'var(--teal)' : '#ef4444' }}>
                        {fmt(+you.toFixed(2))}{suffix}
                      </span>
                    </div>
                    <span className="text-xs" style={{ color: 'rgba(15,23,42,0.3)' }}>vs</span>
                    <div className="flex items-center gap-1">
                      {!youWins && <span className="text-[9px] font-bold text-emerald-500">WIN</span>}
                      <span className="text-sm font-bold" style={{ color: !youWins ? '#6366f1' : 'rgba(15,23,42,0.4)' }}>
                        {fmt(+comp.toFixed(2))}{suffix}
                      </span>
                    </div>
                    <span className="text-[10px] w-16 text-right" style={{ color: 'rgba(15,23,42,0.35)' }}>
                      {diff}% {youWins ? '↑' : '↓'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
