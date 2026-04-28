'use client'

import React from 'react'
import { useApp } from '@/app/providers'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { AudienceData } from '@/lib/types'
import CSVUpload from '@/components/upload/CSVUpload'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5001'

function fmt(n: number | undefined | null): string {
  if (n == null || isNaN(Number(n))) return '—'
  const v = Number(n)
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}K`
  return v.toLocaleString()
}

// ── Progress bar row ──────────────────────────────────────────────────────────
function BarRow({ name, pct, maxPct }: { name: string; pct: number; maxPct: number }) {
  const width = maxPct > 0 ? (pct / maxPct) * 100 : pct
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--forest)', minWidth: 160, flexShrink: 0 }}>{name}</span>
      <div style={{ flex: 1, height: 6, background: 'var(--bd-void)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 3,
          background: 'var(--teal)',
          width: `${Math.min(width, 100)}%`,
          transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal)', minWidth: 40, textAlign: 'right' }}>
        {pct.toFixed(1)}%
      </span>
    </div>
  )
}

// ── PDF export ─────────────────────────────────────────────────────────────────
async function triggerPdfDownload(uploadId: string) {
  try {
    const res = await fetch(`${API}/api/report/pdf/${uploadId}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `analytics-report-${uploadId.slice(0, 8)}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    alert('PDF export failed. Please try again.')
  }
}

export default function AudiencePage() {
  const { activeUpload } = useApp()
  const audience: AudienceData | undefined = activeUpload?.analytics?.audience_data
  const followers = activeUpload?.analytics?.follower_count ?? 0
  const platform  = (activeUpload?.analytics?.platform ?? '').toLowerCase()

  // ── Build grouped bar chart data (age × gender) ───────────────────────────
  const ageGroups = audience?.age_breakdown ?? []
  const genderBreakdown = audience?.gender_breakdown ?? []

  // Find female/male pct from gender breakdown
  const femaleRaw = genderBreakdown.find(g => g.gender.toLowerCase().includes('f') || g.gender.toLowerCase().includes('femme') || g.gender.toLowerCase() === 'women')
  const maleRaw   = genderBreakdown.find(g => g.gender.toLowerCase().includes('m') || g.gender.toLowerCase().includes('homme') || g.gender.toLowerCase() === 'men')
  const femalePct = femaleRaw?.pct ?? 67.3
  const malePct   = maleRaw?.pct ?? 32.7

  // Build age × gender chart data — distribute gender pct proportionally across age groups
  const ageGenderData = ageGroups.map(ag => ({
    group: ag.group,
    Women: parseFloat(((ag.pct * femalePct) / 100).toFixed(1)),
    Men:   parseFloat(((ag.pct * malePct)   / 100).toFixed(1)),
  }))

  const locData = audience?.top_locations ?? []
  const maxLocPct = locData.length > 0 ? Math.max(...locData.map(l => l.pct)) : 100

  // Split locations: cities (first half) and countries (second half)
  // In absence of separate lists, try to identify by whether the name has a comma (city, Country)
  const cityItems    = locData.filter(l => l.location.includes(','))
  const countryItems = locData.filter(l => !l.location.includes(','))

  // Fallback: show all as cities if no comma-split
  const citiesToShow    = cityItems.length > 0 ? cityItems    : locData.slice(0, Math.ceil(locData.length / 2))
  const countriesToShow = countryItems.length > 0 ? countryItems : locData.slice(Math.ceil(locData.length / 2))

  const maxCityPct    = citiesToShow.length    > 0 ? Math.max(...citiesToShow.map(l => l.pct))    : 100
  const maxCountryPct = countriesToShow.length > 0 ? Math.max(...countriesToShow.map(l => l.pct)) : 100

  const [exporting, setExporting] = React.useState(false)

  async function handleExport() {
    if (!activeUpload?.upload_id) return
    setExporting(true)
    await triggerPdfDownload(activeUpload.upload_id)
    setExporting(false)
  }

  return (
    <div className="p-4 lg:p-6 max-w-screen-xl mx-auto">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: platform === 'instagram' ? 'linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)' :
                        platform === 'facebook'  ? '#1877F2' : 'var(--teal)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>
              {platform === 'instagram' ? 'IG' : platform === 'facebook' ? 'fb' : 'SP'}
            </span>
          </div>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 700, color: 'var(--forest)' }}>Audience</h1>
            <p style={{ fontSize: 11, color: 'var(--t3)' }}>Demographic insights & geographic data</p>
          </div>
        </div>

        <button
          onClick={handleExport}
          disabled={exporting || !activeUpload}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
            background: 'var(--teal)', color: '#fff', border: 'none',
            borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            opacity: (exporting || !activeUpload) ? 0.6 : 1,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          {exporting ? 'Exporting…' : 'Export PDF'}
        </button>
      </div>

      {!activeUpload ? (
        <div className="max-w-lg"><CSVUpload /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Followers count ───────────────────────────────────────────── */}
          <div style={{ background: '#fff', border: '1px solid var(--bd-dim)', borderRadius: 12, padding: '20px 24px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 4 }}>Followers</div>
            <div style={{ fontSize: 11, color: 'var(--t4)', marginBottom: 8 }}>Global</div>
            <div style={{ fontSize: 40, fontWeight: 800, color: 'var(--forest)', fontFamily: 'var(--f-head)', letterSpacing: -1 }}>
              {followers >= 1000
                ? followers.toLocaleString()
                : fmt(followers)}
            </div>
          </div>

          {/* ── Age & Gender grouped bar chart ────────────────────────────── */}
          {(ageGenderData.length > 0 || ageGroups.length > 0) && (
            <div style={{ background: '#fff', border: '1px solid var(--bd-dim)', borderRadius: 12, padding: '20px 24px' }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--forest)', marginBottom: 2 }}>
                  Age & Gender
                </div>
                {genderBreakdown.length > 0 && (
                  <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                    {genderBreakdown.map(g => (
                      <div key={g.gender} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--t2)' }}>
                        <div style={{
                          width: 10, height: 10, borderRadius: 2,
                          background: g.gender.toLowerCase().includes('f') || g.gender.toLowerCase().includes('femme') ? '#93c5fd' : '#1d4ed8',
                        }} />
                        {g.gender} {g.pct.toFixed(1)}%
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={ageGenderData.length > 0 ? ageGenderData : ageGroups.map(a => ({ group: a.group, All: a.pct }))}
                  margin={{ top: 0, right: 10, left: -20, bottom: 0 }}
                  barGap={2}
                  barCategoryGap="30%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bd-void)" vertical={false} />
                  <XAxis dataKey="group" tick={{ fontSize: 11, fill: 'var(--t3)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--t4)' }} axisLine={false} tickLine={false} tickFormatter={v => v + '%'} />
                  <Tooltip
                    formatter={(v: number, name: string) => [`${v}%`, name]}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--bd-dim)', background: '#fff' }}
                  />
                  {ageGenderData.length > 0 ? (
                    <>
                      <Bar dataKey="Women" fill="#93c5fd" radius={[3, 3, 0, 0]} maxBarSize={30} />
                      <Bar dataKey="Men"   fill="#1d4ed8" radius={[3, 3, 0, 0]} maxBarSize={30} />
                    </>
                  ) : (
                    <Bar dataKey="All" fill="var(--teal)" radius={[3, 3, 0, 0]} maxBarSize={40} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Top Cities + Top Countries ────────────────────────────────── */}
          {locData.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

              {/* Cities */}
              <div style={{ background: '#fff', border: '1px solid var(--bd-dim)', borderRadius: 12, padding: '20px 24px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--forest)', marginBottom: 16 }}>
                  Top Cities
                </div>
                {(citiesToShow.length > 0 ? citiesToShow : locData).slice(0, 10).map(loc => (
                  <BarRow
                    key={loc.location}
                    name={loc.location}
                    pct={loc.pct}
                    maxPct={maxCityPct}
                  />
                ))}
              </div>

              {/* Countries */}
              <div style={{ background: '#fff', border: '1px solid var(--bd-dim)', borderRadius: 12, padding: '20px 24px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--forest)', marginBottom: 16 }}>
                  Top Countries
                </div>
                {(countriesToShow.length > 0 ? countriesToShow : locData).slice(0, 10).map(loc => (
                  <BarRow
                    key={loc.location}
                    name={loc.location}
                    pct={loc.pct}
                    maxPct={maxCountryPct}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── No audience data fallback ─────────────────────────────────── */}
          {!audience && (
            <div style={{ background: '#fff', border: '1px solid var(--bd-dim)', borderRadius: 12, padding: '40px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>👥</div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)' }}>No audience demographic data</p>
              <p style={{ fontSize: 11, color: 'var(--t4)', marginTop: 4 }}>
                Your CSV needs columns like age_group, gender, city/country to populate this section.
              </p>
              <div style={{ marginTop: 16, padding: '16px', background: 'var(--teal-bg)', borderRadius: 8, textAlign: 'left' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--teal)', marginBottom: 8 }}>Available data from your upload:</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { label: 'Followers',    val: fmt(followers) },
                    { label: 'Total Posts',  val: String(activeUpload.analytics?.total_posts ?? 0) },
                    { label: 'Avg ER',       val: `${(activeUpload.analytics?.avg_engagement_rate ?? 0).toFixed(2)}%` },
                    { label: 'Total Reach',  val: fmt(activeUpload.analytics?.total_reach) },
                  ].map(item => (
                    <div key={item.label} style={{ fontSize: 11, color: 'var(--t2)' }}>
                      <span style={{ color: 'var(--t4)' }}>{item.label}: </span>
                      <strong>{item.val}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
