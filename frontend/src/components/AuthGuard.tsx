'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/app/providers'
import Sidebar, { TopNav, BottomNav } from '@/components/layout/Sidebar'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router   = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (loading) return
    const isLoginPage = pathname === '/login'
    if (!user && !isLoginPage) {
      router.replace('/login')
    } else if (user && isLoginPage) {
      router.replace('/')
    }
  }, [user, loading, pathname, router])

  // Show spinner while checking auth
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)',
      }}>
        <div style={{
          width: 32, height: 32, border: '2px solid var(--b1)',
          borderTop: '2px solid var(--sarcelle)', borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  // Login page — no nav chrome
  if (pathname === '/login') return <>{children}</>

  // Not authenticated yet — blank while redirect happens
  if (!user) return null

  // Authenticated — render full shell with nav
  return (
    <>
      <TopNav />
      <div style={{ display: 'flex', paddingTop: 52, minHeight: '100vh' }}>
        <Sidebar />
        <main className="main-content">
          {children}
        </main>
      </div>
      <BottomNav />
    </>
  )
}
