'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  useState, useEffect, createContext, useContext, useCallback,
  type ReactNode,
} from 'react'
import type { UploadResponse, Period } from '@/lib/types'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5001'

// ── React Query ───────────────────────────────────────────────────────────────
function ReactQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
  }))
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

// ── File group — links multi-platform uploads from same CSV ───────────────────
export interface PlatformEntry {
  platform: string
  upload_id: string
  row_count: number
  analytics: UploadResponse['analytics']
}

export interface FileGroup {
  file_group_id: string
  filename: string
  platforms: PlatformEntry[]
}

// ── Auth types ────────────────────────────────────────────────────────────────
export interface AuthUser {
  id: string
  email: string
  name?: string | null
}

interface AuthCtx {
  user: AuthUser | null
  token: string | null
  loading: boolean
  login:    (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name?: string) => Promise<void>
  logout:   () => void
}

const AuthContext = createContext<AuthCtx>({
  user: null, token: null, loading: true,
  login: async () => {}, register: async () => {}, logout: () => {},
})

export function useAuth() { return useContext(AuthContext) }

function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<AuthUser | null>(null)
  const [token,   setToken]   = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Restore token from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('eiden_token')
    if (stored) {
      setToken(stored)
      // Verify token is still valid
      fetch(`${API}/api/auth/me`, {
        headers: { Authorization: `Bearer ${stored}` },
      })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.user) setUser(data.user)
          else { localStorage.removeItem('eiden_token'); setToken(null) }
        })
        .catch(() => { localStorage.removeItem('eiden_token'); setToken(null) })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Login failed')
    localStorage.setItem('eiden_token', data.token)
    setToken(data.token)
    setUser(data.user)
  }, [])

  const register = useCallback(async (email: string, password: string, name?: string) => {
    const res = await fetch(`${API}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Registration failed')
    localStorage.setItem('eiden_token', data.token)
    setToken(data.token)
    setUser(data.user)
  }, [])

  const logout = useCallback(async () => {
    const stored = localStorage.getItem('eiden_token')
    // Invalidate session on server (increments token_version)
    if (stored) {
      fetch(`${API}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${stored}` },
      }).catch(() => {}) // fire-and-forget, don't block UI
    }
    localStorage.removeItem('eiden_token')
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// ── App context ───────────────────────────────────────────────────────────────
interface AppCtx {
  activeUpload: UploadResponse | null
  setActiveUpload: (u: UploadResponse | null) => void
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean) => void
  fileGroup: FileGroup | null
  setFileGroup: (g: FileGroup | null) => void
  activePeriod: Period
  setActivePeriod: (p: Period) => void
  activeMonth: string | null
  setActiveMonth: (m: string | null) => void
}

const AppContext = createContext<AppCtx>({
  activeUpload: null, setActiveUpload: () => {},
  sidebarOpen: false, setSidebarOpen: () => {},
  fileGroup: null, setFileGroup: () => {},
  activePeriod: 'weekly', setActivePeriod: () => {},
  activeMonth: null, setActiveMonth: () => {},
})

export function useApp() { return useContext(AppContext) }

function AppProvider({ children }: { children: ReactNode }) {
  const [activeUpload, setActiveUpload] = useState<UploadResponse | null>(null)
  const [sidebarOpen, setSidebarOpen]   = useState(false)
  const [fileGroup, setFileGroup]       = useState<FileGroup | null>(null)
  const [activePeriod, setActivePeriod] = useState<Period>('weekly')
  const [activeMonth, setActiveMonth]   = useState<string | null>(null)

  return (
    <AppContext.Provider value={{
      activeUpload, setActiveUpload,
      sidebarOpen, setSidebarOpen,
      fileGroup, setFileGroup,
      activePeriod, setActivePeriod,
      activeMonth, setActiveMonth,
    }}>
      {children}
    </AppContext.Provider>
  )
}

// ── Combined root provider ────────────────────────────────────────────────────
export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ReactQueryProvider>
      <AuthProvider>
        <AppProvider>
          {children}
        </AppProvider>
      </AuthProvider>
    </ReactQueryProvider>
  )
}
