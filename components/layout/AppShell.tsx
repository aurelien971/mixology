'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Sidebar from '@/components/layout/Sidebar'
import Link from 'next/link'

const NO_SHELL = ['/login', '/track']

// Mobile bottom nav — just the 4 pages that matter on phone
const MOBILE_NAV = [
  {
    label: 'Dashboard', href: '/',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 18 18" fill="none">
        <rect x="2" y="2" width="6" height="6" rx="1.5" fill="currentColor" opacity={active ? '1' : '.5'} />
        <rect x="10" y="2" width="6" height="6" rx="1.5" fill="currentColor" opacity={active ? '.6' : '.25'} />
        <rect x="2" y="10" width="6" height="6" rx="1.5" fill="currentColor" opacity={active ? '.6' : '.25'} />
        <rect x="10" y="10" width="6" height="6" rx="1.5" fill="currentColor" opacity={active ? '.6' : '.25'} />
      </svg>
    ),
  },
  {
    label: 'Orders', href: '/orders',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 18 18" fill="none">
        <rect x="3" y="2" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" opacity={active ? '1' : '.5'} />
        <line x1="6" y1="6.5" x2="12" y2="6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="6" y1="9.5" x2="12" y2="9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="6" y1="12.5" x2="9.5" y2="12.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'Production', href: '/production',
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 18 18" fill="none">
        <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" fill="none" opacity={active ? '1' : '.5'} />
        <path d="M5 9.5l2.5 2.5 5.5-5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: 'Menu', href: null,
    icon: (_active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 18 18" fill="none">
        <line x1="2" y1="5" x2="16" y2="5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <line x1="2" y1="9" x2="16" y2="9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <line x1="2" y1="13" x2="16" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { loading } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  const bare = NO_SHELL.some(r => pathname.startsWith(r))

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
      <p style={{ fontSize: '13px', color: '#9ca3af' }}>Loading...</p>
    </div>
  )

  if (bare) return <>{children}</>

  return (
    <>
      {/* Desktop layout */}
      <div className="hidden md:flex" style={{ minHeight: '100vh' }}>
        <Sidebar />
        <main style={{ flex: 1, padding: '2rem 2.5rem', overflowY: 'auto', minWidth: 0 }}>
          {children}
        </main>
      </div>

      {/* Mobile layout */}
      <div className="flex md:hidden flex-col" style={{ minHeight: '100vh', background: '#f9fafb' }}>

        {/* Mobile slide-over menu */}
        {menuOpen && (
          <>
            <div
              onClick={() => setMenuOpen(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40 }}
            />
            <div style={{
              position: 'fixed', top: 0, right: 0, bottom: 0, width: '280px',
              background: '#fff', zIndex: 50, boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
              overflowY: 'auto',
            }}>
              <div style={{ padding: '20px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#111' }}>Menu</span>
                <button onClick={() => setMenuOpen(false)} style={{ color: '#9ca3af', background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', lineHeight: 1 }}>×</button>
              </div>
              <div style={{ padding: '12px 0' }}>
                <Sidebar />
              </div>
            </div>
          </>
        )}

        {/* Mobile content */}
        <main style={{ flex: 1, padding: '1rem 1rem 80px', overflowY: 'auto', minWidth: 0 }}>
          {children}
        </main>

        {/* Bottom nav */}
        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30,
          background: '#fff', borderTop: '1px solid #f3f4f6',
          display: 'flex', alignItems: 'stretch',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}>
          {MOBILE_NAV.map(item => {
            const active = item.href ? (item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)) : false
            return item.href ? (
              <Link
                key={item.label}
                href={item.href}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', padding: '10px 4px 8px', gap: '3px',
                  color: active ? '#111827' : '#9ca3af', textDecoration: 'none',
                }}
              >
                {item.icon(active)}
                <span style={{ fontSize: '10px', fontWeight: active ? 600 : 400 }}>{item.label}</span>
              </Link>
            ) : (
              <button
                key={item.label}
                onClick={() => setMenuOpen(true)}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', padding: '10px 4px 8px', gap: '3px',
                  color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer',
                }}
              >
                {item.icon(false)}
                <span style={{ fontSize: '10px' }}>{item.label}</span>
              </button>
            )
          })}
        </nav>
      </div>
    </>
  )
}