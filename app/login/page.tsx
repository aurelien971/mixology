'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getStaffUser } from '@/lib/firestore/staffUsers'

export default function LoginPage() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password.trim()) {
      setError('Enter your username and password')
      return
    }
    setLoading(true)
    setError('')
    try {
      const user = await getStaffUser(username, password)
      if (!user) {
        setError('Incorrect username or password')
        return
      }
      login({ username: user.username, displayName: user.displayName, role: user.role })
    } catch {
      setError('Something went wrong — check your connection')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f9fafb',
    }}>
      <div style={{ width: '100%', maxWidth: '380px', padding: '0 20px' }}>

        {/* Logo / brand */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <p style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 6px' }}>
            Foodlab
          </p>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', margin: 0 }}>
            Cocktail Manager
          </h1>
        </div>

        {/* Card */}
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', padding: '32px 28px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', margin: '0 0 24px' }}>Sign in</h2>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#6b7280', marginBottom: '6px' }}>
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => { setUsername(e.target.value); setError('') }}
                placeholder="e.g. dima"
                autoCapitalize="none"
                autoCorrect="off"
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb',
                  borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
                  background: '#fff', color: '#111827',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#6b7280', marginBottom: '6px' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                placeholder="••••••••"
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb',
                  borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
                  background: '#fff', color: '#111827',
                }}
              />
            </div>

            {error && (
              <p style={{ fontSize: '13px', color: '#dc2626', margin: 0, padding: '8px 12px', background: '#fef2f2', borderRadius: '6px' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '11px', borderRadius: '8px', fontSize: '14px',
                fontWeight: 600, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                background: loading ? '#9ca3af' : '#111827', color: '#fff',
                marginTop: '4px', transition: 'background 0.15s',
              }}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: '12px', color: '#9ca3af', marginTop: '20px' }}>
          Foodlab Cocktails · Internal use only
        </p>
      </div>
    </div>
  )
}