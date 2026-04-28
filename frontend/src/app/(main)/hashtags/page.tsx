'use client'

import { useState } from 'react'
import { useApp } from '@/app/providers'
import { generateHashtagStrategy } from '@/lib/api'
import type { HashtagStrategy, HashtagBucket } from '@/lib/types'
import CSVUpload from '@/components/upload/CSVUpload'

const PLATFORM_OPTS = ['instagram','tiktok','twitter','linkedin','facebook','youtube']
const NICHE_OPTS    = [
  'fitness & wellness','fashion & beauty','food & cooking','travel','tech & gadgets',
  'business & entrepreneurship','art & photography','music & entertainment','gaming',
  'education & learning','real estate','e-commerce & retail',
]

const BUCKET_CONFIG = [
  { key: 'mega',  label: 'Mega',  sub: '1M+ posts',   color: '#6366f1', bg: 'rgba(99,102,241,0.06)'  },
  { key: 'macro', label: 'Macro', sub: '500K–1M posts',color: 'var(--teal)', bg: 'rgba(79,70,229,0.06)' },
  { key: 'micro', label: 'Micro', sub: '50K–500K',     color: 'var(--gold)', bg: 'rgba(16,185,129,0.06)' },
  { key: 'niche', label: 'Niche', sub: '<50K posts',   color: '#a78bfa', bg: 'rgba(167,139,250,0.06)' },
] as const

function HashtagBucketCard({ bucket, config, onCopy }: {
  bucket: HashtagBucket
  config: typeof BUCKET_CONFIG[number]
  onCopy: (tags: string[]) => void
}) {
  return (
    <div className="card p-4" style={{ borderTop: `2px solid ${config.color}` }}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-sm font-bold" style={{ color: config.color }}>{config.label}</span>
          <span className="text-xs ml-2" style={{ color: 'var(--t3)' }}>{config.sub}</span>
        </div>
        <button
          onClick={() => onCopy(bucket.tags)}
          className="text-[10px] font-semibold px-2 py-1 rounded-lg transition-colors"
          style={{ background: config.bg, color: config.color }}
        >
          Copy all
        </button>
      </div>
      <p className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--t2)' }}>{bucket.description}</p>
      <div className="flex flex-wrap gap-1.5">
        {(bucket.tags ?? []).map(tag => (
          <button
            key={tag}
            onClick={() => navigator.clipboard?.writeText(tag)}
            className="text-xs px-2.5 py-1 rounded-full font-medium hover:opacity-80 transition-opacity cursor-copy"
            style={{ background: config.bg, color: config.color }}
          >
            #{tag.replace(/^#/, '')}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function HashtagsPage() {
  const { activeUpload } = useApp()
  const [platform, setPlatform] = useState('instagram')
  const [niche,    setNiche]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [strategy, setStrategy] = useState<HashtagStrategy | null>(null)
  const [copied,   setCopied]   = useState(false)

  const topHashtags = activeUpload?.analytics?.top_hashtags ?? []

  async function generate() {
    if (!niche.trim()) { setError('Please enter a niche'); return }
    setLoading(true); setError(null)
    try {
      const result = await generateHashtagStrategy({
        platform,
        niche,
        upload_id: activeUpload?.upload_id,
      })
      setStrategy(result)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to generate strategy')
    } finally {
      setLoading(false)
    }
  }

  function copyBucket(tags: string[]) {
    const text = tags.map(t => `#${t.replace(/^#/, '')}`).join(' ')
    navigator.clipboard?.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function copyAll() {
    if (!strategy) return
    const all = [
      ...strategy.mega.tags,
      ...strategy.macro.tags,
      ...strategy.micro.tags,
      ...strategy.niche.tags,
    ].map(t => `#${t.replace(/^#/, '')}`).join(' ')
    navigator.clipboard?.writeText(all)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-6 lg:p-8 max-w-screen-xl mx-auto">
      <header className="mb-6">
        <div className="text-[11px] font-semibold tracking-[4px] uppercase mb-1" style={{ color: 'var(--teal)' }}>Discovery</div>
        <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--forest)' }}>
          Hashtag <span style={{ color: 'var(--teal)' }}>Lab</span>
        </h1>
        <p className="text-sm mt-1 italic" style={{ color: 'var(--t3)' }}>
          AI-powered hashtag strategies across mega, macro, micro and niche tiers.
        </p>
      </header>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Left: generator */}
        <div className="lg:col-span-1 space-y-4">
          <div className="card p-5">
            <div className="text-[10px] font-semibold tracking-[3px] uppercase mb-4" style={{ color: 'var(--t3)' }}>Generate Strategy</div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'rgba(15,23,42,0.55)' }}>Platform</label>
                <div className="flex flex-wrap gap-1.5">
                  {PLATFORM_OPTS.map(p => (
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
                <label className="text-xs font-medium mb-1.5 block" style={{ color: 'rgba(15,23,42,0.55)' }}>Niche / Topic</label>
                <input
                  value={niche}
                  onChange={e => setNiche(e.target.value)}
                  placeholder="e.g. sustainable fashion"
                  className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg-panel)', border: '1px solid var(--bd-base)', color: 'var(--forest)' }}
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {NICHE_OPTS.slice(0, 6).map(n => (
                    <button
                      key={n}
                      onClick={() => setNiche(n)}
                      className="text-[9px] px-2 py-0.5 rounded-full transition-colors"
                      style={{ background: 'var(--bg-panel)', color: 'var(--t3)' }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
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
                    Generating…
                  </>
                ) : (
                  <><span>✦</span> Generate Strategy</>
                )}
              </button>
            </div>
          </div>

          {/* Top hashtags from data */}
          {topHashtags.length > 0 && (
            <div className="card p-5">
              <div className="text-[10px] font-semibold tracking-[3px] uppercase mb-3" style={{ color: 'var(--t3)' }}>
                Top in Your Data
              </div>
              <div className="space-y-2">
                {topHashtags.slice(0, 10).map((h, i) => (
                  <div key={h.tag} className="flex items-center gap-2">
                    <span className="text-[10px] font-bold w-4 text-right" style={{ color: 'var(--t4)' }}>{i + 1}</span>
                    <span className="text-xs flex-1 font-medium" style={{ color: 'var(--teal)' }}>#{h.tag}</span>
                    <span className="text-[10px]" style={{ color: 'var(--t3)' }}>{h.count}×</span>
                    <span className="text-[10px] font-bold" style={{ color: 'var(--gold)' }}>{h.avg_er.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: results */}
        <div className="lg:col-span-2">
          {!strategy ? (
            <div className="card p-12 text-center h-full flex flex-col items-center justify-center gap-4">
              <div className="text-5xl">#</div>
              <p className="text-sm font-semibold" style={{ color: 'var(--t3)' }}>
                Configure your strategy on the left and hit Generate
              </p>
              {!activeUpload && (
                <div className="max-w-xs mt-2">
                  <CSVUpload />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Copy all */}
              <div className="card p-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold" style={{ color: 'var(--forest)' }}>
                    {BUCKET_CONFIG.reduce((acc, b) => acc + (strategy[b.key]?.tags?.length ?? 0), 0)} hashtags generated
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>{strategy.recommended_mix}</p>
                </div>
                <button
                  onClick={copyAll}
                  className="px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                  style={{ background: copied ? 'rgba(16,185,129,0.1)' : 'rgba(79,70,229,0.08)', color: copied ? '#10b981' : 'var(--teal)' }}
                >
                  {copied ? '✓ Copied!' : 'Copy All'}
                </button>
              </div>

              {/* Buckets */}
              <div className="grid sm:grid-cols-2 gap-4">
                {BUCKET_CONFIG.map(cfg => (
                  strategy[cfg.key] && (
                    <HashtagBucketCard
                      key={cfg.key}
                      bucket={strategy[cfg.key]}
                      config={cfg}
                      onCopy={copyBucket}
                    />
                  )
                ))}
              </div>

              {/* Strategy notes */}
              {strategy.strategy_notes && (
                <div className="card p-5">
                  <div className="text-[10px] font-semibold tracking-[3px] uppercase mb-2" style={{ color: 'var(--t3)' }}>Strategy Notes</div>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--t2)' }}>{strategy.strategy_notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
