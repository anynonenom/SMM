'use client'

import { useState } from 'react'
import { getCachedInsights, generateInsights } from '@/lib/api'
import type { AIInsights } from '@/lib/types'

interface Props { uploadId: string; avgER?: number }

export default function InsightsPanel({ uploadId }: Props) {
  const [insights, setInsights] = useState<AIInsights | null>(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [loaded, setLoaded]     = useState(false)

  async function load(forceRegen = false) {
    setLoading(true); setError(null)
    try {
      if (!forceRegen) {
        const cached = await getCachedInsights(uploadId)
        if (cached.cached) { setInsights(cached); setLoaded(true); return }
      }
      const fresh = await generateInsights(uploadId)
      setInsights(fresh); setLoaded(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load insights')
    } finally { setLoading(false) }
  }

  if (!loaded && !loading) return (
    <div className="panel-teal p-6">
      <div className="lbl-xs mb-2" style={{ color: 'var(--teal)' }}>AI INSIGHTS ENGINE</div>
      <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 16, lineHeight: 1.7 }}>
        Let AI analyse your data and generate strategic insights, content recommendations, and growth opportunities.
      </p>
      <button onClick={() => load()} className="btn-primary">
        ✦ Generate AI Insights
      </button>
    </div>
  )

  if (loading) return (
    <div className="panel p-6">
      <div className="flex items-center gap-4 py-4">
        <div className="w-8 h-8 rounded-full border-2 spin flex-shrink-0"
          style={{ borderColor: 'var(--teal)', borderTopColor: 'transparent' }} />
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>AI is analysing your data…</p>
          <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 3 }}>This takes about 5–10 seconds</p>
        </div>
      </div>
    </div>
  )

  if (error) return (
    <div className="panel p-5">
      <div className="mb-4 px-4 py-3 rounded" style={{ background: 'var(--red-bg)', border: '1px solid rgba(255,75,110,0.2)', color: 'var(--red)', fontSize: 12 }}>{error}</div>
      <button onClick={() => load()} style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600 }}>Retry →</button>
    </div>
  )

  if (!insights) return null

  const score = insights.performance_score ?? 0
  const scoreColor = score >= 75 ? 'var(--green)' : score >= 50 ? 'var(--teal)' : 'var(--amber)'

  return (
    <div className="space-y-4">
      {/* Score + Summary */}
      <div className="panel-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="lbl-xs" style={{ color: 'var(--teal)' }}>EXECUTIVE SUMMARY</div>
          <button
            onClick={() => load(true)}
            style={{ fontSize: 10, color: 'var(--t4)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}
          >
            Regenerate ↺
          </button>
        </div>
        <div className="flex items-center gap-4 mb-4">
          <div className="relative w-16 h-16 flex-shrink-0">
            <svg viewBox="0 0 36 36" className="w-16 h-16" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--bd-dim)" strokeWidth="3"/>
              <circle cx="18" cy="18" r="15.9" fill="none" stroke={scoreColor} strokeWidth="3"
                strokeDasharray={`${score} ${100 - score}`} strokeLinecap="round"/>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: scoreColor }}>{score}</span>
              <span style={{ fontSize: 7, color: 'var(--t4)', letterSpacing: 1 }}>SCORE</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: scoreColor, marginBottom: 4 }}>
              {score >= 75 ? '▲ Strong Performance' : score >= 50 ? '→ Average Performance' : '▼ Needs Improvement'}
            </div>
            <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.7 }}>{insights.executive_summary}</p>
          </div>
        </div>
        {insights.model_used && (
          <div style={{ fontSize: 10, color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>
            MODEL: {insights.model_used} · {insights.created_at ? new Date(insights.created_at).toLocaleDateString() : 'just now'}
          </div>
        )}
      </div>

      {/* Key highlights */}
      {(insights.key_highlights?.length ?? 0) > 0 && (
        <div className="panel-card p-5">
          <div className="lbl-xs mb-4" style={{ color: 'var(--teal)' }}>KEY HIGHLIGHTS</div>
          <div className="space-y-2">
            {insights.key_highlights.map((h, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded"
                style={{ background: 'var(--teal-bg)', border: '1px solid rgba(0,229,192,0.1)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--teal)', flexShrink: 0, paddingTop: 2 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.7 }}>{h}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content Analysis */}
      {insights.content_analysis && (
        <div className="panel-card p-5">
          <div className="lbl-xs mb-3" style={{ color: 'var(--teal)' }}>CONTENT ANALYSIS</div>
          <div style={{ borderLeft: '2px solid var(--teal)', paddingLeft: 14, paddingTop: 4, paddingBottom: 4 }}>
            <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.7 }}>{insights.content_analysis}</p>
          </div>
        </div>
      )}

      {/* Audience Insights */}
      {insights.audience_insights && (
        <div className="panel-card p-5">
          <div className="lbl-xs mb-3" style={{ color: 'var(--blue)' }}>AUDIENCE INSIGHTS</div>
          <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.7 }}>{insights.audience_insights}</p>
        </div>
      )}

      {/* Recommendations */}
      {(insights.recommendations?.length ?? 0) > 0 && (
        <div className="panel-card p-5">
          <div className="lbl-xs mb-4" style={{ color: 'var(--gold)' }}>STRATEGIC RECOMMENDATIONS</div>
          <div className="space-y-2">
            {insights.recommendations.map((r, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded"
                style={{ borderLeft: '2px solid var(--gold)', background: 'var(--gold-bg)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--gold)', flexShrink: 0 }}>
                  {i + 1}.
                </span>
                <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.7 }}>{r}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 30-Day Strategy */}
      {insights.content_strategy_30d && (
        <div className="panel-card p-5" style={{ borderTop: '2px solid var(--teal)' }}>
          <div className="lbl-xs mb-3" style={{ color: 'var(--teal)' }}>30-DAY CONTENT STRATEGY</div>
          <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.7 }}>{insights.content_strategy_30d}</p>
        </div>
      )}

      {/* Growth Opportunities */}
      {insights.growth_opportunities && (
        <div className="panel-card p-5" style={{ borderTop: '2px solid var(--green)' }}>
          <div className="lbl-xs mb-3" style={{ color: 'var(--green)' }}>GROWTH OPPORTUNITIES</div>
          <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.7 }}>{insights.growth_opportunities}</p>
        </div>
      )}

      {/* Anomaly Commentary */}
      {insights.anomaly_commentary && (
        <div className="panel-card p-5" style={{ borderTop: '2px solid var(--amber)' }}>
          <div className="lbl-xs mb-3" style={{ color: 'var(--amber)' }}>ANOMALY INTELLIGENCE</div>
          <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.7 }}>{insights.anomaly_commentary}</p>
        </div>
      )}

      {/* Risk Flags */}
      {insights.risk_flags && (
        <div className="panel-card p-5" style={{ borderTop: '2px solid var(--red)' }}>
          <div className="lbl-xs mb-3" style={{ color: 'var(--red)' }}>RISK FLAGS</div>
          <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.7 }}>{insights.risk_flags}</p>
        </div>
      )}
    </div>
  )
}
