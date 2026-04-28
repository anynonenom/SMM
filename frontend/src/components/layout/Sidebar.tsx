'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useApp, useAuth } from '@/app/providers'
import type { FileGroup } from '@/app/providers'
import { getAnalytics } from '@/lib/api'
import type { Upload as UploadRecord } from '@/lib/types'
import clsx from 'clsx'
import {
  LayoutDashboard, FileText, Bell,
  BarChart2, GitCompare, Users, Film,
  Layers, TrendingUp,
  Menu, X, Zap,
} from 'lucide-react'
import PlatformIcon, { PLATFORM_COLORS } from '@/components/PlatformIcon'

function PlatformBadge({ platform, active, onClick }: { platform: string; active: boolean; onClick: () => void }) {
  const color = PLATFORM_COLORS[platform] ?? '#0c5752'
  const label = platform.charAt(0).toUpperCase() + platform.slice(1)
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 36, height: 36,
        border: active ? `2px solid ${color}` : '1px solid rgba(255,255,255,0.15)',
        background: active ? `${color}22` : 'rgba(255,255,255,0.07)',
        cursor: 'pointer', transition: 'all 0.15s',
        borderRadius: 6,
        opacity: active ? 1 : 0.5,
      }}
    >
      <PlatformIcon platform={platform} size={18} />
    </button>
  )
}

const BOTTOM_NAV = [
  { href: '/',          label: 'Home',      icon: LayoutDashboard },
  { href: '/analytics', label: 'Analytics', icon: Zap },
  { href: '/posts',     label: 'Posts',     icon: FileText },
  { href: '/audience',  label: 'Audience',  icon: Users },
]

const NAV = [
  {
    section: 'Dashboard',
    items: [
      { href: '/',       label: 'Overview', icon: LayoutDashboard, badge: 'LIVE' },
      { href: '/posts',  label: 'Posts',    icon: FileText },
      { href: '/alerts', label: 'Alerts',   icon: Bell },
    ],
  },
  {
    section: 'Analytics',
    items: [
      { href: '/analytics', label: 'Live Analytics',  icon: Zap,       badge: 'LIVE' },
      { href: '/reports',   label: 'Reports',         icon: BarChart2 },
      { href: '/compare',   label: 'Compare',         icon: GitCompare },
      { href: '/audience',  label: 'Audience',        icon: Users },
      { href: '/stories',   label: 'Reels & Stories', icon: Film },
    ],
  },
  {
    section: 'Ads',
    items: [
      { href: '/paid',         label: 'Ads Manager',    icon: TrendingUp },
      { href: '/paid-organic', label: 'Paid & Organic', icon: Layers },
    ],
  },
]




// ── Top Nav ───────────────────────────────────────────────────────────────────
export function TopNav() {
  const { activeUpload, setActiveUpload, fileGroup, setSidebarOpen, sidebarOpen } = useApp()
  const { user, logout } = useAuth()

  function switchPlatform(entry: { platform: string; upload_id: string; row_count: number; analytics: any }) {
    setActiveUpload({
      upload_id: entry.upload_id,
      platform: entry.platform as any,
      row_count: entry.row_count,
      analytics: entry.analytics,
    })
  }

  return (
    <nav className="topnav">

      {/* LEFT — hamburger + logo */}
      <div className="topnav-brand" style={{ flexShrink: 0 }}>
        <button
          className="lg:hidden flex items-center"
          style={{
            color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.12)',
            padding: '6px', marginRight: 6,
          }}
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>

        <img
          src="https://eiden-group.com/wp-content/uploads/2026/04/hydra-login.png"
          alt="HYDRA"
          style={{ height: 34, width: 'auto', objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
        />
      </div>

      {/* CENTER — platform switcher */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-center">
        {fileGroup ? (
          /* multi-platform: show icon buttons */
          <div className="flex items-center gap-1.5">
            {fileGroup.platforms.map(entry => (
              <PlatformBadge
                key={entry.platform}
                platform={entry.platform}
                active={activeUpload?.platform === entry.platform}
                onClick={() => switchPlatform(entry)}
              />
            ))}
          </div>
        ) : activeUpload ? (
          /* single platform: icon + text on desktop, icon only on mobile */
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '5px 10px',
            background: 'rgba(12,87,82,0.25)', border: '1px solid rgba(12,87,82,0.35)',
          }}>
            <span className="live-dot" />
            <span style={{ color: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center' }}>
              <PlatformIcon platform={activeUpload.platform ?? 'generic'} size={16} color="#fff" />
            </span>
            {/* text hidden on mobile */}
            <span className="hidden sm:inline" style={{ fontSize: 14, fontWeight: 600, color: 'var(--or)', whiteSpace: 'nowrap' }}>
              {activeUpload.platform?.toUpperCase()} · {activeUpload.row_count?.toLocaleString()} posts
            </span>
          </div>
        ) : (
          /* nothing loaded — hide on mobile */
          <span className="hidden sm:inline" style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)' }}>
            No dataset loaded
          </span>
        )}
      </div>

      {/* RIGHT — user info + logout */}
      <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
        {/* username — hidden on mobile */}
        {user && (
          <span
            className="hidden md:inline"
            style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {user.name || user.email}
          </span>
        )}

        {/* avatar */}
        <div style={{
          width: 32, height: 32, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700,
          background: 'var(--sarcelle)', color: 'var(--blanc)',
          border: '1px solid rgba(255,255,255,0.2)',
        }}>
          {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
        </div>

        {/* logout */}
        <button
          onClick={logout}
          title="Sign out"
          style={{
            padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
            color: 'rgba(255,255,255,0.55)', letterSpacing: '0.04em', whiteSpace: 'nowrap',
          }}
        >
          OUT
        </button>
      </div>
    </nav>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
export default function Sidebar() {
  const path = usePathname()
  const { activeUpload, sidebarOpen, setSidebarOpen } = useApp()

  return (
    <>
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 lg:hidden" style={{ background: 'rgba(0,0,0,0.25)', top: 56 }}
          onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={clsx(
          'fixed top-[56px] left-0 bottom-0 z-40 flex flex-col overflow-y-auto',
          'transition-transform duration-200 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
        style={{ width: 236, background: 'var(--blanc)', borderRight: '1px solid var(--b1)' }}
      >
        {/* Nav */}
        <nav className="flex-1 px-2 py-3">
          {NAV.map(({ section, items }) => (
            <div key={section} className="mb-1">
              <div className="sb-section-label">{section}</div>
              {items.map(({ href, label, icon: Icon, badge }) => {
                const active = href === '/' ? path === '/' : path?.startsWith(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setSidebarOpen(false)}
                    className={clsx('sb-nav-item', active && 'active')}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1 truncate">{label}</span>
                    {badge && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '1px 6px',
                        background: 'var(--teal-bg)', color: 'var(--teal)',
                        border: '1px solid rgba(12,87,82,0.18)',
                        letterSpacing: '0.05em',
                      }}>
                        {badge}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          ))}

        </nav>

      </aside>
    </>
  )
}

// ── Bottom Nav (mobile only) ──────────────────────────────────────────────────
export function BottomNav() {
  const path = usePathname()
  const { setSidebarOpen } = useApp()

  return (
    <nav className="bottom-nav">
      {BOTTOM_NAV.map(({ href, label, icon: Icon }) => {
        const active = href === '/' ? path === '/' : path?.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={`bn-item${active ? ' active' : ''}`}
          >
            <Icon size={20} />
            <span>{label}</span>
            <span className="bn-dot" />
          </Link>
        )
      })}
      <button className="bn-item" onClick={() => setSidebarOpen(true)}>
        <Menu size={20} />
        <span>More</span>
        <span className="bn-dot" />
      </button>
    </nav>
  )
}
