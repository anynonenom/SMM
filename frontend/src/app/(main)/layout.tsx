'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/providers'
import Sidebar, { TopNav, BottomNav } from '@/components/layout/Sidebar'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login')
    }
  }, [user, loading, router])

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

  if (!user) return null

  return (
    <>
      <TopNav />
      <div style={{ display: 'flex', paddingTop: 56, minHeight: '100vh' }}>
        <Sidebar />
        <main className="main-content">
          {children}
        </main>
      </div>
      <BottomNav />
    </>
  )
}
