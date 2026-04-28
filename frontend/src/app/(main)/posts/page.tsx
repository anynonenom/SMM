'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useApp } from '@/app/providers'
import { getPosts } from '@/lib/api'
import type { PostData } from '@/lib/types'
import CSVUpload from '@/components/upload/CSVUpload'
import clsx from 'clsx'

type SortKey = 'engagement_rate' | 'likes' | 'comments' | 'shares' | 'reach' | 'impressions' | 'posted_at'

const SORT_OPTS: { key: SortKey; label: string }[] = [
  { key: 'engagement_rate', label: 'Engagement' },
  { key: 'likes',           label: 'Likes'       },
  { key: 'comments',        label: 'Comments'    },
  { key: 'shares',          label: 'Shares'      },
  { key: 'reach',           label: 'Reach'       },
  { key: 'impressions',     label: 'Impressions' },
  { key: 'posted_at',       label: 'Date'        },
]

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return n?.toString() ?? '0'
}

function fmtDate(s?: string): string {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) }
  catch { return s }
}

export default function PostsPage() {
  const { activeUpload } = useApp()
  const [sort, setSort] = useState<SortKey>('engagement_rate')
  const [dir,  setDir]  = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  const uploadId = activeUpload?.upload_id

  const { data, isLoading } = useQuery({
    queryKey: ['posts', uploadId, sort, dir, page, typeFilter],
    queryFn:  () => getPosts(uploadId!, sort, dir, page, typeFilter || undefined),
    enabled:  !!uploadId,
  })

  function toggleSort(key: SortKey) {
    if (sort === key) setDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSort(key); setDir('desc') }
    setPage(1)
  }

  const posts = data?.posts ?? []
  const filtered = search
    ? posts.filter(p => p.caption?.toLowerCase().includes(search.toLowerCase()) || p.post_type?.toLowerCase().includes(search.toLowerCase()))
    : posts
  const total = data?.total ?? 0
  const pages = Math.ceil(total / (data?.limit ?? 50))

  const postTypes = [...new Set(posts.map(p => p.post_type).filter(Boolean))] as string[]

  return (
    <div className="p-6 lg:p-8 max-w-screen-xl mx-auto">
      <header className="mb-6">
        <div className="text-[11px] font-semibold tracking-[4px] uppercase mb-1" style={{ color: 'var(--teal)' }}>Post Analytics</div>
        <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--forest)' }}>
          Post <span style={{ color: 'var(--teal)' }}>Performance</span>
        </h1>
        <p className="text-sm mt-1 italic" style={{ color: 'var(--t3)' }}>
          Sort, filter and inspect every post in your dataset.
        </p>
      </header>

      {!activeUpload ? (
        <div className="max-w-lg"><CSVUpload /></div>
      ) : (
        <div className="space-y-5">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Sort pills */}
            <div className="flex flex-wrap gap-1.5">
              {SORT_OPTS.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => toggleSort(opt.key)}
                  className="text-[11px] py-1.5 px-3 rounded-full font-medium transition-all"
                  style={{
                    background: sort === opt.key ? 'var(--teal)' : 'var(--bg-panel)',
                    color: sort === opt.key ? '#fff' : 'var(--t2)',
                  }}
                >
                  {opt.label}
                  {sort === opt.key && <span className="ml-1 opacity-80">{dir === 'desc' ? '↓' : '↑'}</span>}
                </button>
              ))}
            </div>

            {/* Type filter */}
            {postTypes.length > 0 && (
              <select
                value={typeFilter}
                onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
                className="text-xs border rounded-full px-3 py-1.5 outline-none cursor-pointer"
                style={{ background: 'var(--surface)', borderColor: 'var(--bd-base)', color: 'var(--forest)', fontFamily: 'Inter' }}
              >
                <option value="">All types</option>
                {postTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )}

            {/* Search */}
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search captions…"
              className="ml-auto px-3 py-1.5 rounded-full text-sm outline-none"
              style={{
                background: 'var(--bg-panel)',
                border: '1px solid var(--bd-dim)',
                color: 'var(--forest)',
                minWidth: 200,
              }}
            />
          </div>

          {/* Stats bar */}
          <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--t3)' }}>
            <span>{total.toLocaleString()} posts total</span>
            {search && <span>· {filtered.length} matching</span>}
            <span>· Sorted by {sort.replace('_', ' ')} {dir}</span>
          </div>

          {/* Table */}
          <div className="card p-0 overflow-hidden">
            {isLoading ? (
              <div className="py-16 text-center text-sm" style={{ color: 'var(--t4)' }}>Loading posts…</div>
            ) : !filtered.length ? (
              <div className="py-16 text-center text-sm" style={{ color: 'var(--t4)' }}>No posts found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--bd-dim)', background: 'rgba(15,23,42,0.02)' }}>
                      {['Type','Caption','Date','ER%','Likes','Comments','Shares','Saves','Reach','Impressions'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold tracking-wider uppercase" style={{ color: 'var(--t3)' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((post, i) => (
                      <PostRow
                        key={post.id ?? i}
                        post={post}
                        avgER={activeUpload.analytics.avg_engagement_rate}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-1.5 rounded-full text-sm font-medium transition-colors disabled:opacity-30"
                style={{ background: 'var(--bg-panel)', color: 'var(--teal)' }}
              >
                ← Prev
              </button>
              <span className="text-xs font-semibold" style={{ color: 'var(--t3)' }}>
                {page} / {pages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(pages, p + 1))}
                disabled={page === pages}
                className="px-4 py-1.5 rounded-full text-sm font-medium transition-colors disabled:opacity-30"
                style={{ background: 'var(--bg-panel)', color: 'var(--teal)' }}
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PostRow({ post, avgER }: { post: PostData; avgER: number }) {
  const er = post.engagement_rate ?? 0
  const isAnomaly = post.is_anomaly
  const erColor = er === 0 ? 'var(--t4)'
    : er > avgER * 1.5 ? '#10b981'
    : er > avgER       ? 'var(--teal)'
    : '#ef4444'

  return (
    <tr
      className="transition-colors"
      style={{
        borderBottom: '1px solid var(--bg-panel)',
        background: isAnomaly ? 'rgba(245,158,11,0.04)' : undefined,
      }}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span
            className="text-[9px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full"
            style={{ background: 'var(--bd-dim)', color: 'rgba(15,23,42,0.55)' }}
          >
            {post.post_type || 'Post'}
          </span>
          {isAnomaly && <span className="text-[9px] font-bold text-amber-500">⚡</span>}
        </div>
      </td>
      <td className="px-4 py-3 max-w-xs">
        <p className="text-xs truncate" style={{ color: 'var(--t2)' }} title={post.caption}>
          {post.caption
            ? post.caption.slice(0, 70) + (post.caption.length > 70 ? '…' : '')
            : <span className="italic" style={{ color: 'rgba(15,23,42,0.25)' }}>no caption</span>
          }
        </p>
      </td>
      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--t3)' }}>
        {fmtDate(post.posted_at)}
      </td>
      <td className="px-4 py-3">
        <span className="text-sm font-bold" style={{ color: erColor }}>{er}%</span>
      </td>
      <td className="px-4 py-3 text-xs" style={{ color: 'var(--t2)' }}>{fmt(post.likes)}</td>
      <td className="px-4 py-3 text-xs" style={{ color: 'var(--t2)' }}>{fmt(post.comments)}</td>
      <td className="px-4 py-3 text-xs" style={{ color: 'var(--t2)' }}>{fmt(post.shares)}</td>
      <td className="px-4 py-3 text-xs" style={{ color: 'var(--t2)' }}>{fmt(post.saves ?? 0)}</td>
      <td className="px-4 py-3 text-xs" style={{ color: 'var(--t2)' }}>{fmt(post.reach)}</td>
      <td className="px-4 py-3 text-xs" style={{ color: 'var(--t2)' }}>{fmt(post.impressions)}</td>
    </tr>
  )
}
