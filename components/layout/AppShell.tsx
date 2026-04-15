'use client'

import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Sidebar from '@/components/layout/Sidebar'

const NO_SHELL = ['/login', '/track']

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { loading } = useAuth()

  const bare = NO_SHELL.some(r => pathname.startsWith(r))

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <p style={{ fontSize: '13px', color: '#9ca3af' }}>Loading...</p>
      </div>
    )
  }

  if (bare) return <>{children}</>

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: '2rem 2.5rem', overflowY: 'auto', minWidth: 0 }}>
        {children}
      </main>
    </div>
  )
}