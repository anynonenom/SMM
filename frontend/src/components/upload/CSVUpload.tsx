'use client'

import { useState, useRef, type DragEvent } from 'react'
import { uploadCSV } from '@/lib/api'
import { useApp } from '@/app/providers'
import type { FileGroup } from '@/app/providers'

export default function CSVUpload({ onDone }: { onDone?: () => void }) {
  const { setActiveUpload, setFileGroup } = useApp()
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [success, setSuccess]   = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (!file.name.endsWith('.csv')) { setError('Please upload a .csv file'); return }
    setLoading(true); setError(null); setSuccess(null)
    try {
      const result = await uploadCSV(file)

      if (result.multi_platform && result.uploads && result.uploads.length > 0) {
        // Multi-platform: set file group and activate the first platform
        const group: FileGroup = {
          file_group_id: result.file_group_id ?? '',
          filename: file.name,
          platforms: result.uploads.map(u => ({
            platform: u.platform as string,
            upload_id: u.upload_id,
            row_count: u.row_count,
            analytics: u.analytics,
          })),
        }
        setFileGroup(group)
        const first = result.uploads[0]
        setActiveUpload({ upload_id: first.upload_id, platform: first.platform, row_count: first.row_count, analytics: first.analytics })
        setSuccess(`Multi-platform file loaded: ${result.platforms?.join(', ')} — ${result.uploads.reduce((s, u) => s + u.row_count, 0).toLocaleString()} posts total.`)
      } else {
        setFileGroup(null)
        setActiveUpload(result)
        setSuccess(`Loaded ${result.row_count.toLocaleString()} posts from ${result.platform} — analytics ready.`)
      }
      onDone?.()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setLoading(false)
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div>
      <div className="lbl-xs mb-3" style={{ color: 'var(--teal)' }}>LOAD DATASET</div>

      <div
        className={`upload-zone ${dragging ? 'drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />

        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 spin"
              style={{ borderColor: 'var(--teal)', borderTopColor: 'transparent' }} />
            <span style={{ fontSize: 12, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>
              ANALYSING CSV…
            </span>
          </div>
        ) : (
          <>
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-4"
              style={{ background: 'var(--teal-bg)', border: '1px solid rgba(0,229,192,0.2)' }}
            >
              <svg className="w-6 h-6" fill="none" stroke="var(--teal)" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 4 }}>
              {dragging ? 'Drop CSV file here' : 'Drop CSV or click to browse'}
            </p>
            <p style={{ fontSize: 11, color: 'var(--t4)' }}>
              Single platform or multi-platform CSV (with a <strong>platform</strong> column)
            </p>
          </>
        )}
      </div>

      {error && (
        <div className="mt-3 px-4 py-2.5 rounded" style={{ background: 'var(--red-bg)', border: '1px solid rgba(255,75,110,0.2)', color: 'var(--red)', fontSize: 12 }}>
          {error}
        </div>
      )}

      {success && (
        <div className="mt-3 px-4 py-2.5 rounded" style={{ background: 'var(--green-bg)', border: '1px solid rgba(0,217,139,0.2)', color: 'var(--green)', fontSize: 12 }}>
          {success}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-1.5">
        {['instagram','linkedin','tiktok','twitter','facebook','youtube'].map(p => (
          <span key={p} className="tag tag-teal">{p}</span>
        ))}
      </div>
    </div>
  )
}
