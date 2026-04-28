'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/app/providers'
import CSVUpload from '@/components/upload/CSVUpload'
import { downloadPdfReport, generateHtmlReport, getCachedHtmlReport } from '@/lib/api'

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return n?.toString() ?? '0'
}

function fmtDate(s?: string) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return s }
}

const METRICS = [
  { key: 'total_posts',         label: 'Total Posts' },
  { key: 'avg_engagement_rate', label: 'Avg Engagement Rate', suffix: '%' },
  { key: 'median_engagement_rate', label: 'Median ER', suffix: '%' },
  { key: 'er_p75',              label: 'ER P75', suffix: '%' },
  { key: 'er_p90',              label: 'ER P90', suffix: '%' },
  { key: 'total_reach',         label: 'Total Reach' },
  { key: 'total_impressions',   label: 'Total Impressions' },
  { key: 'total_likes',         label: 'Total Likes' },
  { key: 'total_comments',      label: 'Total Comments' },
  { key: 'total_shares',        label: 'Total Shares' },
  { key: 'total_saves',         label: 'Total Saves' },
  { key: 'virality_rate',       label: 'Virality Rate', suffix: '%' },
  { key: 'save_rate',           label: 'Save Rate', suffix: '%' },
  { key: 'comment_rate',        label: 'Comment Rate', suffix: '%' },
  { key: 'follower_count',      label: 'Follower Count' },
  { key: 'follower_growth',     label: 'Follower Growth' },
  { key: 'avg_reach_per_post',  label: 'Avg Reach / Post' },
  { key: 'posting_frequency',   label: 'Posting Frequency / Week', suffix: '' },
]

export default function ReportsPage() {
  const { activeUpload } = useApp()
  const a = activeUpload?.analytics
  const [reportHtml, setReportHtml] = useState('')
  const [reportModel, setReportModel] = useState<string | undefined>(undefined)
  const [reportCreatedAt, setReportCreatedAt] = useState<string | undefined>(undefined)
  const [reportCached, setReportCached] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadCached() {
      if (!activeUpload?.upload_id) {
        setReportHtml('')
        setReportModel(undefined)
        setReportCreatedAt(undefined)
        setReportCached(false)
        setReportError(null)
        return
      }
      try {
        const res = await getCachedHtmlReport(activeUpload.upload_id)
        if (cancelled) return
        if ('cached' in res && res.cached && 'report_html' in res) {
          setReportHtml(res.report_html ?? '')
          setReportModel((res as { model_used?: string }).model_used)
          setReportCreatedAt((res as { created_at?: string }).created_at)
          setReportCached(true)
        } else {
          setReportHtml('')
          setReportModel(undefined)
          setReportCreatedAt(undefined)
          setReportCached(false)
        }
      } catch {
        if (!cancelled) {
          setReportHtml('')
          setReportModel(undefined)
          setReportCreatedAt(undefined)
          setReportCached(false)
        }
      }
    }

    loadCached()
    return () => { cancelled = true }
  }, [activeUpload?.upload_id])

  async function generateAIReport(force = false) {
    if (!activeUpload?.upload_id) return
    setReportLoading(true)
    setReportError(null)
    try {
      const res = await generateHtmlReport(activeUpload.upload_id, force)
      setReportHtml(res.report_html)
      setReportModel(res.model_used)
      setReportCreatedAt(res.created_at)
      setReportCached(res.cached)
    } catch (e: unknown) {
      setReportError(e instanceof Error ? e.message : 'Failed to generate AI report')
    } finally {
      setReportLoading(false)
    }
  }

  function exportJSON() {
    if (!a) return
    const blob = new Blob([JSON.stringify(a, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `smm-report-${activeUpload.upload_id}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  function exportCSV() {
    if (!a) return
    const rows = METRICS.map(({ key, label, suffix }) => {
      const raw = (a as unknown as Record<string, unknown>)[key]
      const val = typeof raw === 'number' ? raw.toFixed(2) + (suffix ?? '') : raw ?? '—'
      return `"${label}","${val}"`
    })
    const csv = ['Metric,Value', ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `smm-report-${activeUpload!.upload_id}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  function exportHTML() {
    if (!reportHtml || !activeUpload?.upload_id) return
    const blob = new Blob([reportHtml], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `smm-ai-report-${activeUpload.upload_id}.html`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function exportPDF() {
    if (!activeUpload?.upload_id) return
    setPdfLoading(true)
    setReportError(null)
    try {
      const blob = await downloadPdfReport(activeUpload.upload_id, false)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `smm-ai-report-${activeUpload.upload_id}.pdf`
      link.click()
      URL.revokeObjectURL(url)
    } catch (e: unknown) {
      setReportError(e instanceof Error ? e.message : 'Failed to export PDF report')
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-screen-xl mx-auto">
      <header className="mb-6">
        <div className="text-[11px] font-semibold tracking-[4px] uppercase mb-1" style={{ color: 'var(--teal)' }}>Export</div>
        <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--forest)' }}>
          Reports & <span style={{ color: 'var(--teal)' }}>Export</span>
        </h1>
        <p className="text-sm mt-1 italic" style={{ color: 'var(--t3)' }}>
          Full analytics report with all KPIs. Generate AI HTML and export to PDF/CSV/JSON.
        </p>
      </header>

      {!activeUpload ? (
        <div className="max-w-lg"><CSVUpload /></div>
      ) : (
        <div className="space-y-5">
          {/* Export actions */}
          <div className="card p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm font-bold" style={{ color: 'var(--forest)' }}>
                {a?.platform?.toUpperCase()} Report
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>
                {fmtDate(a?.date_range_start)} → {fmtDate(a?.date_range_end)} · {a?.total_posts} posts
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => generateAIReport(false)}
                disabled={reportLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-60"
                style={{ background: 'rgba(14,165,233,0.1)', color: 'var(--teal)' }}
              >
                {reportLoading ? '…' : reportHtml ? '↻ AI HTML' : '✦ AI HTML'}
              </button>
              <button
                onClick={exportPDF}
                disabled={pdfLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-60"
                style={{ background: 'rgba(15,23,42,0.08)', color: 'var(--forest)' }}
              >
                {pdfLoading ? 'Generating PDF…' : '↓ PDF'}
              </button>
              <button
                onClick={exportHTML}
                disabled={!reportHtml}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-45"
                style={{ background: 'rgba(14,165,233,0.08)', color: 'var(--teal)' }}
              >
                ↓ HTML
              </button>
              <button
                onClick={exportCSV}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}
              >
                ↓ CSV
              </button>
              <button
                onClick={exportJSON}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                style={{ background: 'rgba(79,70,229,0.08)', color: 'var(--teal)' }}
              >
                ↓ JSON
              </button>
            </div>
          </div>

          {reportError && (
            <div className="card p-4" style={{ borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.04)' }}>
              <div className="text-xs" style={{ color: '#ef4444' }}>{reportError}</div>
            </div>
          )}

          {reportHtml && (
            <div className="card p-0 overflow-hidden">
              <div className="px-5 py-3 border-b flex items-center justify-between gap-3" style={{ borderColor: 'var(--bd-dim)' }}>
                <div>
                  <div className="text-[10px] font-semibold tracking-[3px] uppercase" style={{ color: 'var(--t3)' }}>
                    AI HTML Report Preview
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--t3)' }}>
                    {reportModel ? `Model: ${reportModel}` : 'Model: —'}
                    {reportCreatedAt ? ` · ${new Date(reportCreatedAt).toLocaleString()}` : ''}
                    {reportCached ? ' · cached' : ''}
                  </div>
                </div>
                <button
                  onClick={() => generateAIReport(true)}
                  disabled={reportLoading}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                  style={{ background: 'var(--teal-bg)', color: 'var(--teal)' }}
                >
                  {reportLoading ? 'Regenerating…' : 'Regenerate'}
                </button>
              </div>
              <iframe
                title="AI HTML Report"
                srcDoc={reportHtml}
                style={{ width: '100%', height: 780, border: 0, background: '#ffffff' }}
              />
            </div>
          )}

          {/* KPI table */}
          <div className="card p-0 overflow-hidden">
            <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--bd-dim)' }}>
              <div className="text-[10px] font-semibold tracking-[3px] uppercase" style={{ color: 'var(--t3)' }}>
                Full KPI Summary
              </div>
            </div>
            <div className="divide-y" style={{ '--tw-divide-opacity': 1 } as React.CSSProperties}>
              {METRICS.map(({ key, label, suffix }) => {
                const raw = a ? (a as unknown as Record<string, unknown>)[key] : undefined
                const val = typeof raw === 'number' ? raw : undefined
                const display = val !== undefined
                  ? (val >= 1000 && !suffix ? fmt(val) : val.toFixed(2) + (suffix ?? ''))
                  : '—'
                return (
                  <div key={key} className="px-5 py-3 flex justify-between items-center" style={{ borderColor: 'var(--bd-dim)' }}>
                    <span className="text-xs" style={{ color: 'rgba(15,23,42,0.55)' }}>{label}</span>
                    <span className="text-sm font-bold" style={{ color: val !== undefined ? 'var(--teal)' : 'rgba(15,23,42,0.25)' }}>
                      {display}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Weekly trend table */}
          {(a?.weekly_trend?.length ?? 0) > 0 && (
            <div className="card p-0 overflow-hidden">
              <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--bd-dim)' }}>
                <div className="text-[10px] font-semibold tracking-[3px] uppercase" style={{ color: 'var(--t3)' }}>
                  Weekly Breakdown ({a?.weekly_trend?.length ?? 0} weeks)
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--bd-dim)', background: 'rgba(15,23,42,0.02)' }}>
                      {['Week','Posts','Avg ER%','Total Reach','Total Likes'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold tracking-wider uppercase" style={{ color: 'var(--t3)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(a?.weekly_trend ?? []).map((w, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--bg-panel)' }}>
                        <td className="px-4 py-3 text-xs font-medium" style={{ color: 'var(--forest)' }}>
                          {new Date(w.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--t2)' }}>{w.posts}</td>
                        <td className="px-4 py-3 text-xs font-bold" style={{ color: 'var(--teal)' }}>{w.avg_er?.toFixed(2)}%</td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--t2)' }}>{fmt(w.total_reach)}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--t2)' }}>{fmt(w.total_likes)}</td>
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
