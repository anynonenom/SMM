'use client'

import { useApp } from '@/app/providers'
import { useQuery } from '@tanstack/react-query'
import { getPosts } from '@/lib/api'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'
import CSVUpload from '@/components/upload/CSVUpload'

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return n?.toString() ?? '0'
}

export default function StoriesPage() {
  const { activeUpload } = useApp()
  const uploadId = activeUpload?.upload_id

  const { data: storiesData, isLoading: storiesLoading } = useQuery({
    queryKey: ['posts-stories', uploadId],
    queryFn:  () => getPosts(uploadId!, 'engagement_rate', 'desc', 1, 'story'),
    enabled:  !!uploadId,
  })

  const { data: reelsData, isLoading: reelsLoading } = useQuery({
    queryKey: ['posts-reels', uploadId],
    queryFn:  () => getPosts(uploadId!, 'engagement_rate', 'desc', 1, 'reel'),
    enabled:  !!uploadId,
  })

  const { data: videoData } = useQuery({
    queryKey: ['posts-video', uploadId],
    queryFn:  () => getPosts(uploadId!, 'engagement_rate', 'desc', 1, 'video'),
    enabled:  !!uploadId,
  })

  const stories = storiesData?.posts ?? []
  const reels   = reelsData?.posts ?? []
  const videos  = videoData?.posts ?? []

  const allShortForm = [...stories, ...reels, ...videos]

  const avgCompletion = allShortForm.length
    ? allShortForm.reduce((s, p) => s + (p.video_completion_rate ?? 0), 0) / allShortForm.length
    : 0
  const avgExits = stories.length
    ? stories.reduce((s, p) => s + (p.story_exits ?? 0), 0) / stories.length
    : 0

  const completionData = allShortForm.slice(0, 12).map((p, i) => ({
    name: `#${i + 1}`,
    completion: +(p.video_completion_rate ?? 0).toFixed(1),
    views: p.video_views ?? 0,
    er: +p.engagement_rate.toFixed(2),
  }))

  return (
    <div className="p-6 lg:p-8 max-w-screen-xl mx-auto">
      <header className="mb-6">
        <div className="text-[11px] font-semibold tracking-[4px] uppercase mb-1" style={{ color: 'var(--teal)' }}>Short-form</div>
        <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--forest)' }}>
          Stories & <span style={{ color: 'var(--teal)' }}>Reels</span>
        </h1>
        <p className="text-sm mt-1 italic" style={{ color: 'rgba(15,23,42,0.45)' }}>
          Video completion rates, story exits and short-form content performance.
        </p>
      </header>

      {!activeUpload ? (
        <div className="max-w-lg"><CSVUpload /></div>
      ) : (
        <div className="space-y-3">
          {/* KPI row — story-metric style */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-[2px]">
            {[
              { label: 'Total Reels',     value: fmt(reelsData?.total ?? 0),         trend: '↑ Short-form', color: 'var(--teal)' },
              { label: 'Completion Rate', value: `${avgCompletion.toFixed(1)}%`,      trend: avgCompletion >= 50 ? '↑ Strong' : '→ Average', color: avgCompletion >= 50 ? 'var(--teal)' : 'var(--amber)' },
              { label: 'Story Exit Rate', value: avgExits > 0 ? `${avgExits.toFixed(0)}` : '—', trend: avgExits > 0 && avgExits < 500 ? '↓ Low exits' : avgExits >= 500 ? '↑ High exits' : '—', color: avgExits < 500 ? 'var(--gold)' : 'var(--red)' },
              { label: 'Total Stories',   value: fmt(storiesData?.total ?? 0),        trend: '→ Ephemeral', color: 'var(--purple)' },
            ].map(({ label, value, trend, color }) => (
              <div key={label} className="card text-center py-8 px-5">
                <div className="text-2xl font-black tracking-tight mb-1" style={{ color: 'var(--forest)', letterSpacing: '-0.03em' }}>{value}</div>
                <div className="text-[10px] font-semibold tracking-[3px] uppercase mb-1" style={{ color: 'var(--forest-md)' }}>{label}</div>
                <div className="text-xs font-semibold" style={{ color }}>{trend}</div>
              </div>
            ))}
          </div>

          {/* Completion + views chart */}
          {completionData.length > 0 && (
            <div className="card p-5">
              <div className="text-[10px] font-semibold tracking-[3px] uppercase mb-1" style={{ color: 'rgba(15,23,42,0.4)' }}>
                Video Completion Rate vs Views
              </div>
              <p className="text-xs mb-4" style={{ color: 'rgba(15,23,42,0.4)' }}>Most recent {completionData.length} short-form posts</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={completionData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.05)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'rgba(15,23,42,0.4)', fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'rgba(15,23,42,0.4)', fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'rgba(15,23,42,0.4)', fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid rgba(15,23,42,0.1)' }} />
                  <Line yAxisId="left"  type="monotone" dataKey="completion" stroke="var(--teal)" strokeWidth={2} dot={{ fill: 'var(--teal)', r: 3, strokeWidth: 0 }} name="Completion %" />
                  <Line yAxisId="right" type="monotone" dataKey="er"         stroke="var(--gold)" strokeWidth={2} dot={false} strokeDasharray="4 2" name="ER%" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Story funnel */}
          {allShortForm.length > 0 && (() => {
            const totalImp  = allShortForm.reduce((s, p) => s + p.impressions, 0)
            const totalRch  = allShortForm.reduce((s, p) => s + p.reach, 0)
            const totalEng  = allShortForm.reduce((s, p) => s + p.likes + p.comments, 0)
            const totalSave = allShortForm.reduce((s, p) => s + p.saves, 0)
            return (
              <div className="card">
                <div className="font-bold text-sm mb-1" style={{ color: 'var(--forest)' }}>Short-form Content Funnel</div>
                <div className="text-xs italic mb-4" style={{ color: 'var(--forest-md)' }}>Impression → engagement flow</div>
                <div className="h-funnel">
                  <div className="hf-step hf-s1"><div className="hf-val">{fmt(totalImp)}</div><div className="hf-lbl">Impressions</div></div>
                  <div className="hf-step hf-s2"><div className="hf-val">{fmt(totalRch)}</div><div className="hf-lbl">Reached</div></div>
                  <div className="hf-step hf-s3"><div className="hf-val">{fmt(totalEng)}</div><div className="hf-lbl">Engaged</div></div>
                  <div className="hf-step hf-s4"><div className="hf-val">{fmt(totalSave)}</div><div className="hf-lbl">Saved</div></div>
                </div>
                <div className="flex justify-between mt-3 text-xs" style={{ color: 'var(--forest-md)' }}>
                  <span>Avg completion: <strong style={{ color: 'var(--teal)' }}>{avgCompletion.toFixed(1)}%</strong></span>
                  <span>Story exits: <strong style={{ color: 'var(--red)' }}>{fmt(avgExits)}</strong> avg</span>
                </div>
              </div>
            )
          })()}

          {/* Stories table */}
          {(storiesLoading || reelsLoading) ? (
            <div className="card p-8 text-center text-sm" style={{ color: 'rgba(15,23,42,0.3)' }}>Loading short-form data…</div>
          ) : !allShortForm.length ? (
            <div className="card p-12 text-center">
              <div className="text-4xl mb-3">▶</div>
              <p className="text-sm font-semibold" style={{ color: 'rgba(15,23,42,0.5)' }}>No stories, reels or videos detected</p>
              <p className="text-xs mt-1" style={{ color: 'rgba(15,23,42,0.35)' }}>
                Your CSV may not include post_type columns differentiating stories/reels from regular posts.
              </p>
            </div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <div className="px-5 py-3 border-b" style={{ borderColor: 'rgba(15,23,42,0.06)' }}>
                <div className="text-[10px] font-semibold tracking-[3px] uppercase" style={{ color: 'rgba(15,23,42,0.4)' }}>
                  All Short-Form Content ({allShortForm.length})
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(15,23,42,0.06)', background: 'rgba(15,23,42,0.02)' }}>
                      {['Type','Caption','ER%','Views','Completion','Exits','Replies','Reach'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold tracking-wider uppercase" style={{ color: 'rgba(15,23,42,0.4)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allShortForm.slice(0, 50).map((post, i) => (
                      <tr key={post.id ?? i} style={{ borderBottom: '1px solid rgba(15,23,42,0.04)' }}>
                        <td className="px-4 py-3">
                          <span className="text-[9px] font-semibold uppercase px-2 py-0.5 rounded-full" style={{ background: 'rgba(79,70,229,0.08)', color: 'var(--teal)' }}>
                            {post.post_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <p className="text-xs truncate" style={{ color: 'rgba(15,23,42,0.6)' }}>
                            {post.caption ? post.caption.slice(0, 60) + (post.caption.length > 60 ? '…' : '') : '—'}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-sm font-bold" style={{ color: 'var(--teal)' }}>{post.engagement_rate}%</td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'rgba(15,23,42,0.6)' }}>{fmt(post.video_views ?? 0)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(15,23,42,0.06)' }}>
                              <div className="h-full rounded-full" style={{ width: `${post.video_completion_rate ?? 0}%`, background: 'var(--gold)' }} />
                            </div>
                            <span className="text-xs" style={{ color: 'rgba(15,23,42,0.6)' }}>{post.video_completion_rate?.toFixed(0) ?? 0}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'rgba(15,23,42,0.6)' }}>{fmt(post.story_exits ?? 0)}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'rgba(15,23,42,0.6)' }}>{fmt(post.story_replies ?? 0)}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'rgba(15,23,42,0.6)' }}>{fmt(post.reach)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
