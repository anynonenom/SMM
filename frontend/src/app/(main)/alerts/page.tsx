'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useApp } from '@/app/providers'
import { getAlerts, dismissAlert } from '@/lib/api'
import type { Alert, Severity } from '@/lib/types'
import CSVUpload from '@/components/upload/CSVUpload'

const SEV_CONFIG: Record<Severity, { label: string; bg: string; text: string; border: string; dot: string }> = {
  critical: { label: 'Critical', bg: 'rgba(239,68,68,0.06)',  text: '#ef4444',   border: 'rgba(239,68,68,0.3)',  dot: '#ef4444'   },
  warning:  { label: 'Warning',  bg: 'rgba(245,158,11,0.06)', text: '#f59e0b',   border: 'rgba(245,158,11,0.3)', dot: '#f59e0b'   },
  info:     { label: 'Info',     bg: 'rgba(79,70,229,0.06)',  text: 'var(--teal)', border: 'rgba(79,70,229,0.2)', dot: 'var(--teal)' },
  good:     { label: 'Good',     bg: 'rgba(16,185,129,0.06)', text: '#10b981',   border: 'rgba(16,185,129,0.3)', dot: '#10b981'   },
}

const TYPE_ICONS: Record<string, string> = {
  anomaly: '⚡', threshold: '📊', trend: '📈', milestone: '🎯',
}

export default function AlertsPage() {
  const { activeUpload } = useApp()
  const qc = useQueryClient()
  const [filter, setFilter] = useState<Severity | 'all'>('all')
  const [showDismissed, setShowDismissed] = useState(false)

  const uploadId = activeUpload?.upload_id

  const { data, isLoading } = useQuery({
    queryKey: ['alerts', uploadId],
    queryFn:  () => getAlerts(uploadId!),
    enabled:  !!uploadId,
  })

  const dismiss = useMutation({
    mutationFn: (id: string) => dismissAlert(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts', uploadId] }),
  })

  const all = data?.alerts ?? []
  const filtered = all.filter(a =>
    (showDismissed || !a.dismissed) &&
    (filter === 'all' || a.severity === filter)
  )

  const counts = {
    critical: all.filter(a => !a.dismissed && a.severity === 'critical').length,
    warning:  all.filter(a => !a.dismissed && a.severity === 'warning').length,
    info:     all.filter(a => !a.dismissed && a.severity === 'info').length,
    good:     all.filter(a => !a.dismissed && a.severity === 'good').length,
  }

  return (
    <div className="p-6 lg:p-8 max-w-screen-xl mx-auto">
      <header className="mb-6">
        <div className="text-[11px] font-semibold tracking-[4px] uppercase mb-1" style={{ color: 'var(--teal)' }}>Monitoring</div>
        <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--forest)' }}>
          Smart <span style={{ color: 'var(--teal)' }}>Alerts</span>
        </h1>
        <p className="text-sm mt-1 italic" style={{ color: 'var(--t3)' }}>
          Anomaly detection, threshold breaches and trend signals from your data.
        </p>
      </header>

      {!activeUpload ? (
        <div className="max-w-lg"><CSVUpload /></div>
      ) : (
        <div className="space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(['critical','warning','info','good'] as Severity[]).map(sev => {
              const cfg = SEV_CONFIG[sev]
              return (
                <button
                  key={sev}
                  onClick={() => setFilter(f => f === sev ? 'all' : sev)}
                  className="card p-4 text-left transition-all"
                  style={{
                    border: filter === sev ? `2px solid ${cfg.border}` : '1px solid var(--bd-dim)',
                    background: filter === sev ? cfg.bg : undefined,
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full" style={{ background: cfg.dot }} />
                    <span className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: cfg.text }}>{cfg.label}</span>
                  </div>
                  <div className="text-2xl font-bold" style={{ color: cfg.text }}>{counts[sev]}</div>
                  <div className="text-[10px]" style={{ color: 'var(--t3)' }}>active alerts</div>
                </button>
              )
            })}
          </div>

          {/* Filter bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setFilter('all')}
              className="text-[11px] py-1.5 px-3 rounded-full font-medium transition-all"
              style={{
                background: filter === 'all' ? 'var(--teal)' : 'var(--bg-panel)',
                color: filter === 'all' ? '#fff' : 'var(--t2)',
              }}
            >
              All ({all.filter(a => !a.dismissed).length})
            </button>
            {(['critical','warning','info','good'] as Severity[]).map(sev => (
              <button
                key={sev}
                onClick={() => setFilter(f => f === sev ? 'all' : sev)}
                className="text-[11px] py-1.5 px-3 rounded-full font-medium transition-all"
                style={{
                  background: filter === sev ? SEV_CONFIG[sev].text : 'var(--bg-panel)',
                  color: filter === sev ? '#fff' : 'var(--t2)',
                }}
              >
                {SEV_CONFIG[sev].label}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-2 text-xs cursor-pointer select-none" style={{ color: 'var(--t2)' }}>
              <input
                type="checkbox"
                checked={showDismissed}
                onChange={e => setShowDismissed(e.target.checked)}
                className="rounded"
              />
              Show dismissed
            </label>
          </div>

          {/* Alert list */}
          {isLoading ? (
            <div className="card p-8 text-center text-sm" style={{ color: 'var(--t4)' }}>Loading alerts…</div>
          ) : !filtered.length ? (
            <div className="card p-12 text-center">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-sm font-semibold" style={{ color: 'var(--t2)' }}>
                {filter === 'all' ? 'No active alerts' : `No ${filter} alerts`}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--t4)' }}>Your metrics are within normal ranges.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(alert => <AlertCard key={alert.id} alert={alert} onDismiss={() => dismiss.mutate(alert.id)} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AlertCard({ alert, onDismiss }: { alert: Alert; onDismiss: () => void }) {
  const cfg = SEV_CONFIG[alert.severity]

  return (
    <div
      className="card p-4 transition-all"
      style={{
        borderLeft: `3px solid ${cfg.dot}`,
        background: alert.dismissed ? 'rgba(15,23,42,0.02)' : cfg.bg,
        opacity: alert.dismissed ? 0.5 : 1,
      }}
    >
      <div className="flex items-start gap-3">
        <span className="text-lg flex-shrink-0 mt-0.5">{TYPE_ICONS[alert.alert_type] ?? '🔔'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}>
              {cfg.label}
            </span>
            <span className="text-[9px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-panel)', color: 'var(--t3)' }}>
              {alert.alert_type}
            </span>
            {alert.metric && (
              <span className="text-[10px]" style={{ color: 'var(--t3)' }}>{alert.metric}</span>
            )}
          </div>
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--forest)' }}>{alert.title}</p>
          <p className="text-xs leading-relaxed" style={{ color: 'rgba(15,23,42,0.55)' }}>{alert.description}</p>
          {alert.value !== undefined && alert.baseline !== undefined && (
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs font-medium" style={{ color: cfg.text }}>
                Current: {alert.value.toFixed(2)}
              </span>
              <span className="text-xs" style={{ color: 'var(--t4)' }}>vs</span>
              <span className="text-xs font-medium" style={{ color: 'var(--t3)' }}>
                Baseline: {alert.baseline.toFixed(2)}
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span className="text-[10px]" style={{ color: 'var(--t4)' }}>
            {new Date(alert.created_at).toLocaleDateString()}
          </span>
          {!alert.dismissed && (
            <button
              onClick={onDismiss}
              className="text-[10px] font-semibold hover:underline"
              style={{ color: 'var(--t4)' }}
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
