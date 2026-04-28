'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getGoals, createGoal, updateGoal, deleteGoal } from '@/lib/api'
import type { Goal } from '@/lib/types'

const METRICS = [
  'avg_engagement_rate', 'total_reach', 'total_impressions', 'follower_count',
  'total_likes', 'total_comments', 'total_shares', 'total_saves', 'posting_frequency',
]

const PLATFORMS = ['instagram','linkedin','twitter','facebook','tiktok','youtube','all']

function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

function pct(current: number, target: number) {
  if (!target) return 0
  return Math.min(100, Math.round((current / target) * 100))
}

export default function GoalsPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState<Goal | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['goals'],
    queryFn:  getGoals,
  })

  const create = useMutation({
    mutationFn: createGoal,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['goals'] }); setShowForm(false) },
  })

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Goal> }) => updateGoal(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['goals'] }); setEditing(null) },
  })

  const del = useMutation({
    mutationFn: deleteGoal,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  })

  const goals = data?.goals ?? []
  const active    = goals.filter(g => pct(g.current, g.target) < 100)
  const completed = goals.filter(g => pct(g.current, g.target) >= 100)

  return (
    <div className="p-6 lg:p-8 max-w-screen-xl mx-auto">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <div className="text-[11px] font-semibold tracking-[4px] uppercase mb-1" style={{ color: 'var(--teal)' }}>Growth Tracking</div>
          <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--forest)' }}>
            Goals & <span style={{ color: 'var(--teal)' }}>KPIs</span>
          </h1>
          <p className="text-sm mt-1 italic" style={{ color: 'var(--t3)' }}>
            Set targets, track progress, hit milestones.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90"
          style={{ background: 'var(--teal)' }}
        >
          + New Goal
        </button>
      </header>

      {/* New goal form */}
      {(showForm || editing) && (
        <GoalForm
          initial={editing ?? undefined}
          onSubmit={(data) => {
            if (editing) update.mutate({ id: editing.id, data })
            else create.mutate(data)
          }}
          onCancel={() => { setShowForm(false); setEditing(null) }}
          loading={create.isPending || update.isPending}
        />
      )}

      {/* Content Release Pipeline (Kanban) */}
      <div className="card mb-6">
        <div className="font-bold text-sm mb-0.5" style={{ color: 'var(--forest)' }}>Content Release Pipeline</div>
        <div className="text-xs italic mb-4" style={{ color: 'var(--forest-md)' }}>Campaign workflow status</div>
        <div className="kanban-track">
          {[
            { label: 'Drafted', icon: '✓', done: true },
            { label: 'Team QA', icon: '✓', done: true },
            { label: 'Client Review', icon: '👁', active: true },
            { label: 'Approved', icon: '✅', done: false },
            { label: 'Published', icon: '🚀', done: false },
          ].map((node, i, arr) => (
            <React.Fragment key={node.label}>
              <div className={`kanban-node${node.done ? ' done' : node.active ? ' active' : ''}`}>
                <div className="kanban-dot">{node.icon}</div>
                <span className="kanban-lbl">{node.label}</span>
              </div>
              {i < arr.length - 1 && <div className={`kanban-line${node.done ? ' done' : ''}`} />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="card p-8 text-center text-sm" style={{ color: 'var(--t4)' }}>Loading goals…</div>
      ) : !goals.length ? (
        <div className="card p-12 text-center">
          <div className="text-4xl mb-3">🎯</div>
          <p className="text-sm font-semibold" style={{ color: 'var(--t2)' }}>No goals yet</p>
          <p className="text-xs mt-1 mb-4" style={{ color: 'var(--t4)' }}>Create your first KPI goal to start tracking progress.</p>
          <button
            onClick={() => setShowForm(true)}
            className="px-5 py-2 rounded-xl text-white text-sm font-semibold"
            style={{ background: 'var(--teal)' }}
          >
            Create first goal
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active */}
          {active.length > 0 && (
            <div>
              <div className="s-num" style={{ color: 'var(--teal)' }}>Targets in progress ({active.length})</div>
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                {active.map(g => (
                  <GoalCard key={g.id} goal={g} onEdit={() => setEditing(g)} onDelete={() => del.mutate(g.id)} />
                ))}
              </div>
            </div>
          )}

          {/* Completed */}
          {completed.length > 0 && (
            <div>
              <div className="s-num" style={{ color: 'var(--gold)' }}>Targets conquered ({completed.length})</div>
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                {completed.map(g => (
                  <GoalCard key={g.id} goal={g} onEdit={() => setEditing(g)} onDelete={() => del.mutate(g.id)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function GoalCard({ goal, onEdit, onDelete }: { goal: Goal; onEdit: () => void; onDelete: () => void }) {
  const progress = pct(goal.current, goal.target)
  const done = progress >= 100
  const barColor = done ? '#10b981' : progress >= 60 ? 'var(--teal)' : progress >= 30 ? '#f59e0b' : '#ef4444'
  const daysLeft = goal.deadline
    ? Math.max(0, Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / 86400000))
    : null

  return (
    <div className="card p-5 transition-all hover:shadow-md" style={{ borderTop: `2px solid ${barColor}` }}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1">
          <h3 className="text-sm font-bold" style={{ color: 'var(--forest)' }}>{goal.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[9px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full" style={{ background: 'rgba(79,70,229,0.08)', color: 'var(--teal)' }}>
              {goal.metric.replace(/_/g, ' ')}
            </span>
            {goal.platform && goal.platform !== 'all' && (
              <span className="text-[9px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-panel)', color: 'var(--t3)' }}>
                {goal.platform}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={onEdit} className="text-xs px-2 py-1 rounded-lg transition-colors" style={{ color: 'var(--t3)' }}>
            ✏️
          </button>
          <button onClick={onDelete} className="text-xs px-2 py-1 rounded-lg transition-colors" style={{ color: 'rgba(239,68,68,0.5)' }}>
            ✕
          </button>
        </div>
      </div>

      <div className="flex items-end justify-between mb-1.5">
        <div>
          <span className="text-2xl font-extrabold" style={{ color: barColor }}>{fmtNum(goal.current)}</span>
          <span className="text-xs ml-1" style={{ color: 'var(--t3)' }}>/ {fmtNum(goal.target)}</span>
        </div>
        <span className="text-lg font-bold" style={{ color: barColor }}>{progress}%</span>
      </div>

      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bd-dim)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${progress}%`, background: barColor }}
        />
      </div>

      <div className="flex items-center justify-between mt-2">
        {daysLeft !== null ? (
          <span className="text-[10px]" style={{ color: daysLeft <= 7 ? '#ef4444' : 'var(--t3)' }}>
            {done ? '🎉 Completed!' : daysLeft === 0 ? 'Due today!' : `${daysLeft}d left`}
          </span>
        ) : (
          <span className="text-[10px]" style={{ color: 'var(--t4)' }}>No deadline</span>
        )}
        {done && <span className="text-[10px] font-bold" style={{ color: '#10b981' }}>✓ Goal reached</span>}
      </div>
    </div>
  )
}

function GoalForm({
  initial, onSubmit, onCancel, loading,
}: {
  initial?: Goal
  onSubmit: (d: Partial<Goal>) => void
  onCancel: () => void
  loading: boolean
}) {
  const [name,     setName]     = useState(initial?.name ?? '')
  const [metric,   setMetric]   = useState(initial?.metric ?? METRICS[0])
  const [target,   setTarget]   = useState(String(initial?.target ?? ''))
  const [current,  setCurrent]  = useState(String(initial?.current ?? '0'))
  const [deadline, setDeadline] = useState(initial?.deadline?.slice(0, 10) ?? '')
  const [platform, setPlatform] = useState(initial?.platform ?? 'all')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({ name, metric, target: +target, current: +current, deadline: deadline || undefined, platform })
  }

  return (
    <div className="card p-5 mb-5" style={{ border: '2px solid rgba(79,70,229,0.15)' }}>
      <div className="text-[10px] font-semibold tracking-[3px] uppercase mb-4" style={{ color: 'var(--t3)' }}>
        {initial ? 'Edit Goal' : 'New Goal'}
      </div>
      <form onSubmit={submit} className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'rgba(15,23,42,0.55)' }}>Goal Name</label>
          <input
            required value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Reach 10K followers"
            className="w-full px-3 py-2 rounded-xl text-sm outline-none"
            style={{ background: 'var(--bg-panel)', border: '1px solid var(--bd-base)', color: 'var(--forest)' }}
          />
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'rgba(15,23,42,0.55)' }}>Metric</label>
          <select
            value={metric} onChange={e => setMetric(e.target.value)}
            className="w-full px-3 py-2 rounded-xl text-sm outline-none cursor-pointer"
            style={{ background: 'var(--bg-panel)', border: '1px solid var(--bd-base)', color: 'var(--forest)' }}
          >
            {METRICS.map(m => <option key={m} value={m}>{m.replace(/_/g,' ')}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'rgba(15,23,42,0.55)' }}>Target Value</label>
          <input
            required type="number" min="0" value={target} onChange={e => setTarget(e.target.value)}
            placeholder="10000"
            className="w-full px-3 py-2 rounded-xl text-sm outline-none"
            style={{ background: 'var(--bg-panel)', border: '1px solid var(--bd-base)', color: 'var(--forest)' }}
          />
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'rgba(15,23,42,0.55)' }}>Current Value</label>
          <input
            type="number" min="0" value={current} onChange={e => setCurrent(e.target.value)}
            className="w-full px-3 py-2 rounded-xl text-sm outline-none"
            style={{ background: 'var(--bg-panel)', border: '1px solid var(--bd-base)', color: 'var(--forest)' }}
          />
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'rgba(15,23,42,0.55)' }}>Deadline (optional)</label>
          <input
            type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
            className="w-full px-3 py-2 rounded-xl text-sm outline-none cursor-pointer"
            style={{ background: 'var(--bg-panel)', border: '1px solid var(--bd-base)', color: 'var(--forest)' }}
          />
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'rgba(15,23,42,0.55)' }}>Platform</label>
          <select
            value={platform} onChange={e => setPlatform(e.target.value)}
            className="w-full px-3 py-2 rounded-xl text-sm outline-none cursor-pointer"
            style={{ background: 'var(--bg-panel)', border: '1px solid var(--bd-base)', color: 'var(--forest)' }}
          >
            {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="md:col-span-2 flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--teal)' }}
          >
            {loading ? 'Saving…' : initial ? 'Save Changes' : 'Create Goal'}
          </button>
          <button type="button" onClick={onCancel} className="px-5 py-2 rounded-xl text-sm font-medium" style={{ background: 'var(--bd-dim)', color: 'var(--t2)' }}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
