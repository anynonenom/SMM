'use client'

import { useApp } from '@/app/providers'
import type { Period, MonthlyTrend } from '@/lib/types'

const PERIODS: { key: Period; label: string }[] = [
  { key: 'daily',   label: 'Daily' },
  { key: 'weekly',  label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly',  label: 'Yearly' },
]

interface Props {
  /** Available months from the analytics data e.g. ["2024-01", "2024-02"] */
  months?: string[]
}

export default function PeriodTabs({ months = [] }: Props) {
  const { activePeriod, setActivePeriod, activeMonth, setActiveMonth } = useApp()

  function selectPeriod(p: Period) {
    setActivePeriod(p)
    if (p !== 'monthly') setActiveMonth(null)
  }

  function fmtMonth(m: string) {
    try {
      const [y, mo] = m.split('-')
      const d = new Date(Number(y), Number(mo) - 1)
      return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    } catch { return m }
  }

  return (
    <div>
      <div className="period-tabs">
        {PERIODS.map(({ key, label }) => (
          <button
            key={key}
            className={`period-tab${activePeriod === key ? ' active' : ''}`}
            onClick={() => selectPeriod(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {activePeriod === 'monthly' && months.length > 0 && (
        <div className="month-picker">
          <button
            className={`month-chip${activeMonth === null ? ' active' : ''}`}
            onClick={() => setActiveMonth(null)}
          >
            All
          </button>
          {months.map(m => (
            <button
              key={m}
              className={`month-chip${activeMonth === m ? ' active' : ''}`}
              onClick={() => setActiveMonth(m)}
            >
              {fmtMonth(m)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
