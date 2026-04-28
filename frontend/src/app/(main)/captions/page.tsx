'use client'

import { useState } from 'react'
import { useApp } from '@/app/providers'
import { generateCaptions } from '@/lib/api'
import type { Caption } from '@/lib/types'

const PLATFORMS = ['instagram','linkedin','twitter','facebook','tiktok','youtube']
const TONES     = ['professional','casual','inspirational','funny','educational','storytelling','promotional']

export default function CaptionsPage() {
  const { activeUpload } = useApp()
  const [topic,    setTopic]    = useState('')
  const [tone,     setTone]     = useState('casual')
  const [platform, setPlatform] = useState('instagram')
  const [count,    setCount]    = useState(3)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [captions, setCaptions] = useState<Caption[]>([])
  const [copied,   setCopied]   = useState<number | null>(null)

  async function generate() {
    if (!topic.trim()) { setError('Please enter a topic'); return }
    setLoading(true); setError(null)
    try {
      const result = await generateCaptions({
        topic,
        tone,
        platform,
        count,
        upload_id: activeUpload?.upload_id,
      })
      setCaptions(result.captions)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to generate captions')
    } finally {
      setLoading(false)
    }
  }

  function copy(idx: number, text: string) {
    navigator.clipboard?.writeText(text)
    setCopied(idx)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="p-6 lg:p-8 max-w-screen-xl mx-auto">
      <header className="mb-6">
        <div className="text-[11px] font-semibold tracking-[4px] uppercase mb-1" style={{ color: 'var(--teal)' }}>AI Writing</div>
        <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--forest)' }}>
          Caption <span style={{ color: 'var(--teal)' }}>Generator</span>
        </h1>
        <p className="text-sm mt-1 italic" style={{ color: 'var(--t3)' }}>
          Claude crafts platform-native captions with hooks, hashtags, and CTAs.
        </p>
      </header>

      <div className="grid lg:grid-cols-5 gap-5">
        {/* Config */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-5">
            <div className="text-[10px] font-semibold tracking-[3px] uppercase mb-4" style={{ color: 'var(--t3)' }}>Configuration</div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'rgba(15,23,42,0.55)' }}>Topic / Brief</label>
                <textarea
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  rows={3}
                  placeholder="e.g. Launching our new summer collection of sustainable activewear"
                  className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
                  style={{ background: 'var(--bg-panel)', border: '1px solid var(--bd-base)', color: 'var(--forest)' }}
                />
              </div>

              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'rgba(15,23,42,0.55)' }}>Platform</label>
                <div className="flex flex-wrap gap-1.5">
                  {PLATFORMS.map(p => (
                    <button
                      key={p}
                      onClick={() => setPlatform(p)}
                      className="text-[11px] px-3 py-1.5 rounded-full font-medium capitalize transition-all"
                      style={{
                        background: platform === p ? 'var(--teal)' : 'var(--bg-panel)',
                        color: platform === p ? '#fff' : 'var(--t2)',
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'rgba(15,23,42,0.55)' }}>Tone</label>
                <div className="flex flex-wrap gap-1.5">
                  {TONES.map(t => (
                    <button
                      key={t}
                      onClick={() => setTone(t)}
                      className="text-[11px] px-3 py-1.5 rounded-full font-medium capitalize transition-all"
                      style={{
                        background: tone === t ? 'var(--gold)' : 'var(--bg-panel)',
                        color: tone === t ? '#fff' : 'var(--t2)',
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'rgba(15,23,42,0.55)' }}>
                  Variations: <strong style={{ color: 'var(--forest)' }}>{count}</strong>
                </label>
                <input
                  type="range" min={1} max={5} value={count}
                  onChange={e => setCount(+e.target.value)}
                  className="w-full accent-indigo-500"
                />
              </div>

              {error && (
                <div className="px-3 py-2 rounded-xl text-xs" style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}>
                  {error}
                </div>
              )}

              <button
                onClick={generate}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: 'var(--teal)' }}
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Writing captions…
                  </>
                ) : (
                  <><span>✦</span> Generate Captions</>
                )}
              </button>
            </div>
          </div>

          {activeUpload && (
            <div className="card p-4" style={{ background: 'rgba(79,70,229,0.04)', border: '1px solid rgba(79,70,229,0.1)' }}>
              <div className="text-[9px] font-bold tracking-wider uppercase mb-1" style={{ color: 'var(--teal)' }}>Context Aware</div>
              <p className="text-xs leading-relaxed" style={{ color: 'rgba(15,23,42,0.55)' }}>
                Claude will use your {activeUpload.analytics.platform} analytics (avg ER: {activeUpload.analytics.avg_engagement_rate}%) to tailor captions for your audience.
              </p>
            </div>
          )}
        </div>

        {/* Results */}
        <div className="lg:col-span-3 space-y-4">
          {!captions.length && !loading && (
            <div className="card p-12 text-center">
              <div className="text-5xl mb-3">✏️</div>
              <p className="text-sm font-semibold" style={{ color: 'var(--t3)' }}>
                Configure your brief and hit Generate
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--t4)' }}>
                Claude will write {count} platform-native caption{count > 1 ? 's' : ''} for {platform}
              </p>
            </div>
          )}

          {loading && (
            <div className="card p-12 text-center">
              <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-3" style={{ borderColor: 'var(--teal)', borderTopColor: 'transparent' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--t2)' }}>Claude is writing your captions…</p>
            </div>
          )}

          {captions.map((cap, i) => (
            <div key={i} className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tracking-wider uppercase w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(79,70,229,0.08)', color: 'var(--teal)' }}>
                    {i + 1}
                  </span>
                  <span className="text-[10px] font-semibold tracking-wider uppercase capitalize" style={{ color: 'var(--t3)' }}>
                    {platform} · {tone}
                  </span>
                </div>
                <button
                  onClick={() => copy(i, [
                    cap.caption,
                    ...(cap.hashtags?.length ? [cap.hashtags.map(t => `#${t.replace(/^#/,'')}`).join(' ')] : []),
                  ].join('\n\n'))}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
                  style={{
                    background: copied === i ? 'rgba(16,185,129,0.1)' : 'rgba(79,70,229,0.08)',
                    color: copied === i ? '#10b981' : 'var(--teal)',
                  }}
                >
                  {copied === i ? '✓ Copied' : 'Copy'}
                </button>
              </div>

              {cap.hook && (
                <div className="mb-3 px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: 'rgba(79,70,229,0.06)', color: 'var(--teal)' }}>
                  Hook: {cap.hook}
                </div>
              )}

              <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--forest)' }}>{cap.caption}</p>

              {cap.hashtags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {cap.hashtags.map(tag => (
                    <span
                      key={tag}
                      className="text-[10px] font-medium px-2 py-0.5 rounded-full cursor-pointer hover:opacity-75"
                      style={{ background: 'rgba(79,70,229,0.06)', color: 'var(--teal)' }}
                      onClick={() => navigator.clipboard?.writeText(`#${tag.replace(/^#/,'')}`)}
                    >
                      #{tag.replace(/^#/, '')}
                    </span>
                  ))}
                </div>
              )}

              {cap.call_to_action && (
                <div className="px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(16,185,129,0.06)', color: '#10b981', borderLeft: '2px solid #10b981' }}>
                  CTA: {cap.call_to_action}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
