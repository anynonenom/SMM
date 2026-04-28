'use client'

import { useState, useEffect, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/providers'

export default function LoginPage() {
  const router   = useRouter()
  const { login, register, user, loading: authLoading } = useAuth()

  // Already logged in → go to dashboard
  useEffect(() => {
    if (!authLoading && user) router.replace('/')
  }, [user, authLoading, router])

  const [mode,     setMode]     = useState<'login' | 'register'>('login')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [name,     setName]     = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await register(email, password, name)
      }
      router.replace('/')
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>

        {/* Brand */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 36 }}>
          <img
            src="https://eiden-group.com/wp-content/uploads/2026/04/hydra-login.png"
            alt="HYDRA"
            style={{ height: 100, width: 'auto', objectFit: 'contain' }}
          />
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--blanc)',
          border: '1px solid var(--b1)',
          padding: '32px',
        }}>
          {/* Mode tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--b1)', marginBottom: 28 }}>
            {(['login', 'register'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError('') }}
                style={{
                  flex: 1, paddingBottom: 12, fontSize: 12, fontWeight: 700,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  border: 'none', background: 'none', cursor: 'pointer',
                  color: mode === m ? 'var(--sarcelle)' : 'var(--t3)',
                  borderBottom: mode === m ? '2px solid var(--sarcelle)' : '2px solid transparent',
                  marginBottom: -1,
                  transition: 'all 0.15s',
                }}
              >
                {m === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Name (register only) */}
            {mode === 'register' && (
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--t3)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                  style={{
                    width: '100%', padding: '10px 12px', fontSize: 13,
                    border: '1px solid var(--b1)', background: 'var(--bg)',
                    color: 'var(--vert-fonce)', outline: 'none',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            {/* Email */}
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--t3)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoComplete="email"
                style={{
                  width: '100%', padding: '10px 12px', fontSize: 13,
                  border: '1px solid var(--b1)', background: 'var(--bg)',
                  color: 'var(--vert-fonce)', outline: 'none',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Password */}
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--t3)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'At least 8 characters' : '••••••••'}
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                style={{
                  width: '100%', padding: '10px 12px', fontSize: 13,
                  border: '1px solid var(--b1)', background: 'var(--bg)',
                  color: 'var(--vert-fonce)', outline: 'none',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Error message */}
            {error && (
              <div style={{
                padding: '10px 12px', fontSize: 12,
                background: 'rgba(180,40,40,0.07)',
                border: '1px solid rgba(180,40,40,0.22)',
                color: 'var(--danger)',
              }}>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 4,
                padding: '12px',
                background: loading ? 'var(--t3)' : 'var(--sarcelle)',
                color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 700, letterSpacing: '0.06em',
                textTransform: 'uppercase', transition: 'background 0.15s',
              }}
            >
              {loading
                ? 'Please wait…'
                : mode === 'login' ? 'Sign In' : 'Create Account'
              }
            </button>
          </form>

          {/* Footer note */}
          <p style={{ marginTop: 20, textAlign: 'center', fontSize: 11, color: 'var(--t4)' }}>
            {mode === 'login' ? (
              <>No account? <button onClick={() => setMode('register')} style={{ background: 'none', border: 'none', color: 'var(--sarcelle)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Create one</button></>
            ) : (
              <>Already have an account? <button onClick={() => setMode('login')} style={{ background: 'none', border: 'none', color: 'var(--sarcelle)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Sign in</button></>
            )}
          </p>
        </div>

        <p style={{ textAlign: 'center', fontSize: 10, color: 'var(--t4)', marginTop: 20 }}>
          HYDRA Analytics · by EIDEN Group
        </p>
      </div>
    </div>
  )
}
