'use client'

import { useApp } from '@/app/providers'
import InsightsPanel from '@/components/ai/InsightsPanel'
import CSVUpload from '@/components/upload/CSVUpload'

function fmtDate(s?: string): string {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return s }
}

export default function AIInsightsPage() {
  const { activeUpload } = useApp()
  const a = activeUpload?.analytics

  return (
    <div className="p-6 lg:p-8 max-w-screen-xl mx-auto">
      <header className="mb-6">
        <div className="text-[11px] font-semibold tracking-[4px] uppercase mb-1" style={{ color: 'var(--teal)' }}>
          Claude AI · Analysis
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--forest)' }}>
          AI <span style={{ color: 'var(--teal)' }}>Insights</span>
        </h1>
        <p className="text-sm mt-1 italic" style={{ color: 'var(--t3)' }}>
          Strategic analysis powered by Anthropic Claude — narratives that numbers alone can&apos;t tell.
        </p>
      </header>

      {!activeUpload ? (
        <div className="max-w-lg space-y-4">
          <div className="card p-5">
            <div className="text-[10px] font-semibold tracking-[3px] uppercase mb-2" style={{ color: 'var(--t3)' }}>No Dataset Loaded</div>
            <p className="text-sm mb-4" style={{ color: 'var(--t2)' }}>
              Upload a CSV export first, then Claude will analyse your social media performance.
            </p>
          </div>
          <CSVUpload />
        </div>
      ) : (
        <div className="max-w-3xl space-y-4">
          {/* Dataset context */}
          <div className="card p-4">
            <div className="flex flex-wrap gap-3 items-center">
              <span
                className="text-[9px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(79,70,229,0.1)', color: 'var(--teal)' }}
              >
                {a?.platform?.toUpperCase()}
              </span>
              <span className="text-xs" style={{ color: 'var(--t3)' }}>
                {a?.total_posts?.toLocaleString()} posts
              </span>
              <span className="text-xs" style={{ color: 'rgba(15,23,42,0.25)' }}>·</span>
              <span className="text-xs" style={{ color: 'var(--t3)' }}>
                Avg ER: <strong style={{ color: 'var(--t2)' }}>{a?.avg_engagement_rate}%</strong>
              </span>
              <span className="text-xs" style={{ color: 'rgba(15,23,42,0.25)' }}>·</span>
              <span className="text-xs" style={{ color: 'var(--t3)' }}>
                {fmtDate(a?.date_range_start)} → {fmtDate(a?.date_range_end)}
              </span>
            </div>
          </div>

          <InsightsPanel
            uploadId={activeUpload.upload_id}
            avgER={a?.avg_engagement_rate}
          />
        </div>
      )}
    </div>
  )
}
