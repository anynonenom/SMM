'use client'

import { useEffect, useState, useMemo } from 'react'
import { useApp } from '@/app/providers'
import { getUploads, getComparison } from '@/lib/api'
import type { CompareData, CompareMetric } from '@/lib/api'
import type { Upload } from '@/lib/types'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'

type Period = 'daily' | 'weekly' | 'monthly'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(val: number, unit: string) {
  if (unit === '%') return val.toFixed(2) + '%'
  if (Math.abs(val) >= 1_000_000) return (val / 1_000_000).toFixed(1) + 'M'
  if (Math.abs(val) >= 1_000) return (val / 1_000).toFixed(1) + 'K'
  return val.toFixed(unit === '%' ? 2 : 0)
}

function DeltaBadge({ delta, pct }: { delta: number; pct: number }) {
  const up = delta >= 0
  return (
    <span
      className="text-xs font-mono px-1.5 py-0.5 rounded"
      style={{
        background: up ? 'var(--green-bg)' : 'var(--red-bg)',
        color: up ? 'var(--green)' : 'var(--red)',
      }}
    >
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

function MetricCard({ m, labelA, labelB }: { m: CompareMetric; labelA: string; labelB: string }) {
  return (
    <div className="panel-card" style={{ padding: '14px 16px' }}>
      <div className="lbl-xs" style={{ marginBottom: 8 }}>{m.label}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div className="lbl-xs" style={{ color: 'var(--teal)', marginBottom: 2 }}>{labelA}</div>
          <div className="num-sm" style={{ color: 'var(--t1)', fontSize: 18 }}>{fmt(m.a, m.unit)}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <DeltaBadge delta={m.delta} pct={m.delta_pct} />
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="lbl-xs" style={{ color: 'var(--gold)', marginBottom: 2 }}>{labelB}</div>
          <div className="num-sm" style={{ color: 'var(--t1)', fontSize: 18 }}>{fmt(m.b, m.unit)}</div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ComparePage() {
  const { activeUpload } = useApp()
  const [uploads, setUploads] = useState<Upload[]>([])
  const [idA, setIdA] = useState('')
  const [idB, setIdB] = useState('')
  const [data, setData] = useState<CompareData | null>(null)
  const [period, setPeriod] = useState<Period>('weekly')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    getUploads().then(r => {
      const list = Array.isArray(r) ? r : (r as { uploads?: Upload[] }).uploads ?? []
      setUploads(list)
      if (list.length >= 2) {
        setIdA(list[0].id)
        setIdB(list[1].id)
      } else if (list.length === 1) {
        setIdA(list[0].id)
      }
    }).catch(() => {})
  }, [])

  const canCompare = idA && idB && idA !== idB

  function run() {
    if (!canCompare) return
    setLoading(true); setErr(''); setData(null)
    getComparison(idA, idB)
      .then(setData)
      .catch(e => setErr(e.message ?? 'Failed to load comparison'))
      .finally(() => setLoading(false))
  }

  // ── Build chart data ──────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (!data) return []
    if (period === 'daily') {
      const keys = new Set([
        ...data.daily_a.map(d => d.date),
        ...data.daily_b.map(d => d.date),
      ])
      const mapA = Object.fromEntries(data.daily_a.map(d => [d.date, d]))
      const mapB = Object.fromEntries(data.daily_b.map(d => [d.date, d]))
      return Array.from(keys).sort().map(k => ({
        label: k.slice(5),  // MM-DD
        er_a:  mapA[k]?.avg_er   ?? null,
        er_b:  mapB[k]?.avg_er   ?? null,
        reach_a: mapA[k]?.reach  ?? null,
        reach_b: mapB[k]?.reach  ?? null,
      }))
    }
    if (period === 'weekly') {
      const keys = new Set([
        ...data.weekly_a.map(d => d.week),
        ...data.weekly_b.map(d => d.week),
      ])
      const mapA = Object.fromEntries(data.weekly_a.map(d => [d.week, d]))
      const mapB = Object.fromEntries(data.weekly_b.map(d => [d.week, d]))
      return Array.from(keys).sort().map(k => ({
        label: k.slice(5),  // MM-DD
        er_a:  mapA[k]?.avg_er       ?? null,
        er_b:  mapB[k]?.avg_er       ?? null,
        reach_a: mapA[k]?.total_reach ?? null,
        reach_b: mapB[k]?.total_reach ?? null,
      }))
    }
    // monthly
    const keys = new Set([
      ...data.monthly_a.map(d => d.month),
      ...data.monthly_b.map(d => d.month),
    ])
    const mapA = Object.fromEntries(data.monthly_a.map(d => [d.month, d]))
    const mapB = Object.fromEntries(data.monthly_b.map(d => [d.month, d]))
    return Array.from(keys).sort().map(k => ({
      label: k,
      er_a:  mapA[k]?.avg_er       ?? null,
      er_b:  mapB[k]?.avg_er       ?? null,
      reach_a: mapA[k]?.total_reach ?? null,
      reach_b: mapB[k]?.total_reach ?? null,
    }))
  }, [data, period])

  // ── Post type bar data ─────────────────────────────────────────────────────
  const postTypeData = useMemo(() => {
    if (!data) return []
    const types = new Set([
      ...Object.keys(data.post_type_a),
      ...Object.keys(data.post_type_b),
    ])
    return Array.from(types).map(t => ({
      type: t,
      er_a: data.post_type_a[t]?.avg_er ?? 0,
      er_b: data.post_type_b[t]?.avg_er ?? 0,
    }))
  }, [data])

  const labelA = data ? (data.upload_a.filename.replace(/\.[^.]+$/, '').slice(0, 20)) : 'Upload A'
  const labelB = data ? (data.upload_b.filename.replace(/\.[^.]+$/, '').slice(0, 20)) : 'Upload B'

  const TEAL = '#2dd4bf'
  const GOLD = '#f59e0b'
  const TEAL2 = '#0f766e'
  const GOLD2 = '#b45309'

  // ── Tooltip ────────────────────────────────────────────────────────────────
  const ChartTip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{
        background: 'var(--bg-panel)', border: '1px solid var(--bd-dim)',
        padding: '8px 12px', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 11,
      }}>
        <div style={{ color: 'var(--t3)', marginBottom: 4 }}>{label}</div>
        {payload.map((p: any, i: number) => (
          <div key={`${p.name}-${i}`} style={{ color: p.color }}>
            {p.name}: {p.value != null ? p.value.toFixed(3) : '—'}
          </div>
        ))}
      </div>
    )
  }

  // ── Key metrics to show in cards ───────────────────────────────────────────
  const cardKeys = [
    'avg_engagement_rate','total_reach','total_likes','total_comments',
    'total_shares','total_saves','follower_count','posting_frequency',
    'virality_rate','save_rate','total_posts','reach_growth_rate',
  ]

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1400, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div className="lbl-xs" style={{ color: 'var(--teal)', letterSpacing: 3, marginBottom: 4 }}>
          ANALYSIS · COMPARE
        </div>
        <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 22, color: 'var(--t1)', fontWeight: 700 }}>
          Period Comparison
        </h1>
        <p style={{ color: 'var(--t4)', fontSize: 13, marginTop: 4 }}>
          Compare two CSV uploads side-by-side — daily, weekly, and monthly breakdowns.
        </p>
      </div>

      {/* Selectors */}
      <div className="panel-card" style={{ padding: '18px 20px', marginBottom: 24, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="lbl-xs" style={{ color: 'var(--teal)', marginBottom: 6 }}>UPLOAD A (baseline)</div>
          <select
            value={idA}
            onChange={e => setIdA(e.target.value)}
            style={{
              width: '100%', background: 'var(--bg-base)', color: 'var(--t1)',
              border: '1px solid var(--teal)', borderRadius: 4, padding: '7px 10px',
              fontFamily: 'var(--font-mono)', fontSize: 12,
            }}
          >
            <option value="">— select —</option>
            {uploads.map(u => (
              <option key={u.id} value={u.id}>
                {u.filename} ({u.platform ?? '?'})
              </option>
            ))}
          </select>
        </div>

        <div style={{ color: 'var(--t4)', fontSize: 20, paddingBottom: 6 }}>⇄</div>

        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="lbl-xs" style={{ color: 'var(--gold)', marginBottom: 6 }}>UPLOAD B (compare)</div>
          <select
            value={idB}
            onChange={e => setIdB(e.target.value)}
            style={{
              width: '100%', background: 'var(--bg-base)', color: 'var(--t1)',
              border: '1px solid var(--gold)', borderRadius: 4, padding: '7px 10px',
              fontFamily: 'var(--font-mono)', fontSize: 12,
            }}
          >
            <option value="">— select —</option>
            {uploads.map(u => (
              <option key={u.id} value={u.id}>
                {u.filename} ({u.platform ?? '?'})
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={run}
          disabled={!canCompare || loading}
          style={{
            background: canCompare ? 'var(--teal)' : 'var(--bg-panel)',
            color: canCompare ? '#000' : 'var(--t4)',
            border: 'none', borderRadius: 4, padding: '8px 24px',
            fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
            cursor: canCompare ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap',
          }}
        >
          {loading ? 'Loading…' : 'COMPARE →'}
        </button>
      </div>

      {err && (
        <div style={{ background: 'var(--red-bg)', color: 'var(--red)', padding: '10px 14px', borderRadius: 6, marginBottom: 20, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          {err}
        </div>
      )}

      {!data && !loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--t4)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
          Select two uploads above and click COMPARE
        </div>
      )}

      {data && (
        <>
          {/* Period tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
            {(['daily', 'weekly', 'monthly'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  background: period === p ? 'var(--teal)' : 'var(--bg-panel)',
                  color: period === p ? '#000' : 'var(--t3)',
                  border: '1px solid ' + (period === p ? 'var(--teal)' : 'var(--bd-dim)'),
                  borderRadius: 4, padding: '5px 16px',
                  fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                  cursor: 'pointer', textTransform: 'uppercase',
                }}
              >
                {p}
              </button>
            ))}
          </div>

          {/* KPI cards grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, marginBottom: 28 }}>
            {data.metrics
              .filter(m => cardKeys.includes(m.key))
              .map(m => (
                <MetricCard key={m.key} m={m} labelA={labelA} labelB={labelB} />
              ))}
          </div>

          {/* ER trend chart */}
          <div className="panel-card" style={{ padding: '18px 20px', marginBottom: 20 }}>
            <div className="lbl-xs" style={{ color: 'var(--teal)', marginBottom: 14 }}>
              ENGAGEMENT RATE — {period.toUpperCase()} TREND
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bd-dim)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--t4)', fontSize: 10, fontFamily: 'var(--font-mono)' }} />
                <YAxis tick={{ fill: 'var(--t4)', fontSize: 10, fontFamily: 'var(--font-mono)' }} tickFormatter={v => v.toFixed(1) + '%'} />
                <Tooltip content={<ChartTip />} />
                <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: 11 }} />
                <Line type="monotone" dataKey="er_a" name={labelA} stroke={TEAL} strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="er_b" name={labelB} stroke={GOLD} strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Reach trend chart */}
          <div className="panel-card" style={{ padding: '18px 20px', marginBottom: 20 }}>
            <div className="lbl-xs" style={{ color: 'var(--gold)', marginBottom: 14 }}>
              REACH — {period.toUpperCase()} TREND
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bd-dim)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--t4)', fontSize: 10, fontFamily: 'var(--font-mono)' }} />
                <YAxis tick={{ fill: 'var(--t4)', fontSize: 10, fontFamily: 'var(--font-mono)' }} tickFormatter={v => v >= 1000 ? (v/1000).toFixed(0)+'K' : v} />
                <Tooltip content={<ChartTip />} />
                <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: 11 }} />
                <Line type="monotone" dataKey="reach_a" name={labelA} stroke={TEAL2} strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="reach_b" name={labelB} stroke={GOLD2} strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Post type ER bar chart */}
          {postTypeData.length > 0 && (
            <div className="panel-card" style={{ padding: '18px 20px', marginBottom: 20 }}>
              <div className="lbl-xs" style={{ color: 'var(--t3)', marginBottom: 14 }}>
                ENGAGEMENT RATE BY POST TYPE
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={postTypeData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bd-dim)" />
                  <XAxis dataKey="type" tick={{ fill: 'var(--t4)', fontSize: 10, fontFamily: 'var(--font-mono)' }} />
                  <YAxis tick={{ fill: 'var(--t4)', fontSize: 10, fontFamily: 'var(--font-mono)' }} tickFormatter={v => v.toFixed(1) + '%'} />
                  <Tooltip content={<ChartTip />} />
                  <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: 11 }} />
                  <Bar dataKey="er_a" name={labelA} fill={TEAL} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="er_b" name={labelB} fill={GOLD} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Full metrics table */}
          <div className="panel-card" style={{ padding: '18px 20px' }}>
            <div className="lbl-xs" style={{ color: 'var(--t3)', marginBottom: 14 }}>FULL METRICS TABLE</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--bd-dim)' }}>
                    {['Metric', labelA, labelB, 'Delta', 'Change'].map((h, i) => (
                      <th key={i} style={{ padding: '6px 12px', textAlign: 'left', color: 'var(--t4)', fontWeight: 600, fontSize: 10, letterSpacing: 1 }}>{h.toUpperCase()}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.metrics.map((m, i) => (
                    <tr
                      key={m.key}
                      style={{ borderBottom: '1px solid var(--bd-dim)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}
                    >
                      <td style={{ padding: '7px 12px', color: 'var(--t2)' }}>{m.label}</td>
                      <td style={{ padding: '7px 12px', color: 'var(--teal)' }}>{fmt(m.a, m.unit)}</td>
                      <td style={{ padding: '7px 12px', color: 'var(--gold)' }}>{fmt(m.b, m.unit)}</td>
                      <td style={{ padding: '7px 12px', color: m.delta >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {m.delta >= 0 ? '+' : ''}{fmt(m.delta, m.unit)}
                      </td>
                      <td style={{ padding: '7px 12px' }}>
                        <DeltaBadge delta={m.delta} pct={m.delta_pct} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
