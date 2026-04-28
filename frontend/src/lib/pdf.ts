/**
 * Client-side PDF generation using jsPDF + autoTable.
 * Runs entirely in the browser — no backend dependency.
 */
import type { AnalyticsData } from './types'

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtN(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '—'
  const v = Number(n)
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}K`
  return v.toLocaleString()
}
function fmtP(n: number | null | undefined, dec = 2): string {
  if (n == null) return '—'
  return `${Number(n).toFixed(dec)}%`
}
function fmtDate(s?: string | null): string {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return s }
}

// ── Color palette ─────────────────────────────────────────────────────────────
const TEAL   = '#0c5752'
const FOREST = '#122620'
const GOLD   = '#d7bb93'
const CREAM  = '#f5f1e8'
const WHITE  = '#ffffff'
const GRAY   = '#6b6b6b'
const LGRAY  = '#e8e4dc'

export async function generateAnalyticsPdf(a: AnalyticsData, uploadId: string): Promise<void> {
  // Dynamic import — keeps the bundle lean; only loaded when user clicks Export
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const W  = doc.internal.pageSize.getWidth()   // 210
  const ML = 14   // margin left
  const MR = 14   // margin right
  const CW = W - ML - MR  // content width ≈ 182

  const platform = (a.platform ?? 'Social').toUpperCase()
  const totalEng = (a.total_likes ?? 0) + (a.total_comments ?? 0) + (a.total_shares ?? 0) + (a.total_saves ?? 0)

  let y = 0  // current Y cursor

  // ── Helper: add a new page if not enough space ─────────────────────────────
  function need(h: number) {
    if (y + h > doc.internal.pageSize.getHeight() - 16) {
      doc.addPage()
      y = 14
    }
  }

  // ── Helper: section heading ────────────────────────────────────────────────
  function heading(text: string) {
    need(12)
    doc.setFillColor(TEAL)
    doc.rect(ML, y, CW, 7, 'F')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(WHITE)
    doc.text(text.toUpperCase(), ML + 3, y + 5)
    y += 10
  }

  // ── Helper: draw autoTable and advance y ──────────────────────────────────
  function table(head: string[][], body: (string | number)[][], colWidths?: number[]) {
    need(16)
    autoTable(doc, {
      head,
      body,
      startY: y,
      margin: { left: ML, right: MR },
      tableWidth: CW,
      columnStyles: colWidths
        ? Object.fromEntries(colWidths.map((w, i) => [i, { cellWidth: w }]))
        : {},
      headStyles: {
        fillColor: TEAL,
        textColor: WHITE,
        fontStyle: 'bold',
        fontSize: 7.5,
        cellPadding: 3,
        halign: 'center',
      },
      bodyStyles: {
        fontSize: 8,
        cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
        textColor: FOREST,
      },
      alternateRowStyles: { fillColor: CREAM },
      styles: { lineColor: LGRAY, lineWidth: 0.2 },
      theme: 'grid',
    })
    y = (doc as any).lastAutoTable.finalY + 6
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 1 — COVER
  // ══════════════════════════════════════════════════════════════════════════

  // Dark header bar
  doc.setFillColor(FOREST)
  doc.rect(0, 0, W, 40, 'F')

  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(WHITE)
  doc.text('Analytics Report', ML, 18)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(GOLD)
  doc.text(`${platform}  ·  ${fmtDate(a.date_range_start)} – ${fmtDate(a.date_range_end)}`, ML, 28)

  doc.setTextColor('#a0b0ae')
  doc.setFontSize(8)
  doc.text(`Generated ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}  ·  ${fmtN(a.total_posts)} posts analysed`, ML, 35)

  y = 50

  // ── KPI 3-column grid ─────────────────────────────────────────────────────
  heading('Performance Overview')

  const kpis: [string, string][] = [
    ['Views (Impressions)',  fmtN(a.total_impressions || a.total_reach)],
    ['Total Reach',          fmtN(a.total_reach)],
    ['Avg / Post',           fmtN(a.avg_reach_per_post)],
    ['Followers',            fmtN(a.follower_count)],
    ['Followers Gained',     fmtN(a.follower_growth)],
    ['Reach Growth',         fmtP(a.reach_growth_rate)],
    ['Avg Engagement Rate',  fmtP(a.avg_engagement_rate)],
    ['Median ER',            fmtP(a.median_engagement_rate)],
    ['ER Trend',             (a.engagement_trend ?? '—').toUpperCase()],
    ['Total Interactions',   fmtN(totalEng)],
    ['Total Likes',          fmtN(a.total_likes)],
    ['Total Comments',       fmtN(a.total_comments)],
    ['Total Shares',         fmtN(a.total_shares)],
    ['Total Saves',          fmtN(a.total_saves)],
    ['Save Rate',            fmtP(a.save_rate)],
    ['Virality Rate',        fmtP(a.virality_rate)],
    ['Comment Rate',         fmtP(a.comment_rate)],
    ['Posts Published',      fmtN(a.total_posts)],
    ['Posting Frequency',    `${(a.posting_frequency ?? 0).toFixed(1)} / wk`],
    ['Best Day',             ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][a.best_posting_day ?? 0] ?? '—'],
    ['Best Hour',            `${a.best_posting_hour ?? 0}:00`],
    ['Top Post Format',      a.top_post_type ?? '—'],
    ['P90 ER',               fmtP(a.er_p90)],
    ['ER Std Dev',           fmtP(a.er_std)],
  ]

  // Draw as 3-column cards
  const colW = CW / 3
  const rowH = 12
  kpis.forEach(([label, val], idx) => {
    const col  = idx % 3
    const row  = Math.floor(idx / 3)
    const batchRow = Math.floor(idx / 9)   // new group every 9 items (3 rows)
    if (idx % 9 === 0 && idx > 0) need(rowH * 3 + 6)

    const bx = ML + col * colW
    const by = y + (row % 3) * rowH

    doc.setFillColor(col % 2 === 0 ? WHITE : CREAM)
    doc.rect(bx, by, colW, rowH, 'F')
    doc.setDrawColor(LGRAY)
    doc.rect(bx, by, colW, rowH, 'S')

    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(GRAY)
    doc.text(label.toUpperCase(), bx + 2.5, by + 4)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(FOREST)
    doc.text(val, bx + 2.5, by + 9.5)

    if (idx % 9 === 8 || idx === kpis.length - 1) {
      y += Math.ceil(((idx % 9) + 1) / 3) * rowH + 4
    }
  })

  y += 6

  // ══════════════════════════════════════════════════════════════════════════
  // ENGAGEMENT STATS TABLE
  // ══════════════════════════════════════════════════════════════════════════
  heading('Engagement Statistics')

  table(
    [['Metric', 'Value', 'Benchmark']],
    [
      ['Average Engagement Rate',  fmtP(a.avg_engagement_rate),     'Good: > 2%'],
      ['Median ER',                fmtP(a.median_engagement_rate),  '—'],
      ['P90 ER',                   fmtP(a.er_p90),                  'Top 10% posts'],
      ['Std Deviation',            fmtP(a.er_std),                  '—'],
      ['ER Trend',                 (a.engagement_trend ?? '—').toUpperCase(), '—'],
      ['Reach Growth',             fmtP(a.reach_growth_rate),       '> 5% healthy'],
      ['Posting Frequency',        `${(a.posting_frequency ?? 0).toFixed(1)} / wk`, '3–7 / wk'],
      ['Best Posting Day',         ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][a.best_posting_day ?? 0] ?? '—', '—'],
      ['Best Posting Hour',        `${a.best_posting_hour ?? 0}:00`, '—'],
      ['Top Post Format',          a.top_post_type ?? '—',          '—'],
    ],
    [70, 50, 62]
  )

  // ══════════════════════════════════════════════════════════════════════════
  // WEEKLY TREND
  // ══════════════════════════════════════════════════════════════════════════
  const trend = Array.isArray(a.weekly_trend) ? a.weekly_trend : []
  if (trend.length > 0) {
    heading('Weekly Trend (last 12 weeks)')
    table(
      [['Week', 'Posts', 'Avg ER', 'Reach', 'Likes']],
      trend.slice(-12).map(w => [
        w.week ?? '—',
        fmtN(w.posts),
        fmtP(w.avg_er),
        fmtN(w.total_reach),
        fmtN(w.total_likes),
      ]),
      [42, 22, 32, 46, 40]
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // POST TYPE BREAKDOWN
  // ══════════════════════════════════════════════════════════════════════════
  const postTypes = a.post_type_breakdown as Record<string, { count: number; pct: number; avg_er: number; avg_reach: number }> | undefined
  if (postTypes && Object.keys(postTypes).length > 0) {
    heading('Content Mix by Post Type')
    table(
      [['Type', 'Posts', '% of Mix', 'Avg ER', 'Avg Reach']],
      Object.entries(postTypes)
        .sort(([, a], [, b]) => (b.avg_er ?? 0) - (a.avg_er ?? 0))
        .map(([type, s]) => [
          type.charAt(0).toUpperCase() + type.slice(1),
          String(s.count ?? 0),
          fmtP(s.pct),
          fmtP(s.avg_er),
          fmtN(s.avg_reach),
        ]),
      [40, 24, 32, 32, 54]
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TOP POSTS
  // ══════════════════════════════════════════════════════════════════════════
  const topPosts = Array.isArray(a.top_posts) ? a.top_posts : []
  if (topPosts.length > 0) {
    heading('Top Posts by Engagement Rate')
    table(
      [['#', 'Post ID', 'Type', 'Date', 'Likes', 'Comments', 'Reach', 'ER %']],
      topPosts.slice(0, 20).map((p, i) => [
        String(i + 1),
        (p.post_id ?? `Post_${i + 1}`).slice(0, 18),
        p.post_type ?? '—',
        p.posted_at ? new Date(p.posted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—',
        fmtN(p.likes),
        fmtN(p.comments),
        fmtN(p.reach),
        fmtP(p.engagement_rate),
      ]),
      [8, 38, 20, 22, 18, 22, 22, 18]  // ~168 total ≈ fine
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HASHTAGS
  // ══════════════════════════════════════════════════════════════════════════
  const hashtags = Array.isArray(a.top_hashtags) ? a.top_hashtags : []
  if (hashtags.length > 0) {
    heading('Top Hashtags')
    table(
      [['Hashtag', 'Count', 'Avg ER']],
      hashtags.slice(0, 15).map((h: any) => [
        String(h.tag ?? '—'),
        String(h.count ?? 0),
        fmtP(h.avg_er),
      ]),
      [110, 36, 36]
    )
  }

  // ── Footer on every page ─────────────────────────────────────────────────
  const pageCount = (doc.internal as any).pages.length - 1
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    const ph = doc.internal.pageSize.getHeight()
    doc.setFillColor(FOREST)
    doc.rect(0, ph - 10, W, 10, 'F')
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(GOLD)
    doc.text(
      `SMM Analytics  ·  ${platform}  ·  ${fmtDate(a.date_range_start)} – ${fmtDate(a.date_range_end)}`,
      ML, ph - 4
    )
    doc.setTextColor(WHITE)
    doc.text(`Page ${i} / ${pageCount}`, W - MR, ph - 4, { align: 'right' })
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  const filename = `analytics-${(a.platform ?? 'report').toLowerCase()}-${uploadId.slice(0, 8)}.pdf`
  doc.save(filename)
}
