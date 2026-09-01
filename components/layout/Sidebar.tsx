'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

const nav = [
  {
    label: 'Dashboard',
    href: '/',
    icon: (
      <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
        <rect x="2" y="2" width="6" height="6" rx="1.5" fill="currentColor" opacity=".9" />
        <rect x="10" y="2" width="6" height="6" rx="1.5" fill="currentColor" opacity=".4" />
        <rect x="2" y="10" width="6" height="6" rx="1.5" fill="currentColor" opacity=".4" />
        <rect x="10" y="10" width="6" height="6" rx="1.5" fill="currentColor" opacity=".4" />
      </svg>
    ),
  },
  {
    label: 'Groups',
    href: '/groups',
    icon: (
      <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
        <circle cx="5" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.4" fill="none" opacity=".9" />
        <circle cx="13" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.4" fill="none" opacity=".9" />
        <path d="M1 15c0-2.5 1.8-4 4-4s4 1.5 4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" opacity=".9" />
        <path d="M10 15c0-2.5 1.8-4 3-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" opacity=".5" />
      </svg>
    ),
  },
  {
    label: 'Accounts',
    href: '/accounts',
    icon: (
      <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="6" r="3" fill="currentColor" opacity=".9" />
        <path d="M2 16c0-3.866 3.134-7 7-7s7 3.134 7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity=".9" />
      </svg>
    ),
  },
  {
    label: 'Orders',
    href: '/orders',
    icon: (
      <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
        <rect x="3" y="2" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" opacity=".9" />
        <line x1="6" y1="6.5" x2="12" y2="6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="6" y1="9.5" x2="12" y2="9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="6" y1="12.5" x2="9.5" y2="12.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'Projects',
    href: '/projects',
    icon: (
      <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
        <line x1="3" y1="4" x2="3" y2="15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".5" />
        <rect x="5" y="3" width="8" height="3" rx="1.2" fill="currentColor" opacity=".9" />
        <rect x="5" y="7.5" width="11" height="3" rx="1.2" fill="currentColor" opacity=".55" />
        <rect x="5" y="12" width="6" height="3" rx="1.2" fill="currentColor" opacity=".35" />
      </svg>
    ),
  },
  {
    label: 'Catalog',
    href: '/catalog',
    icon: (
      <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
        <circle cx="6" cy="9" r="3" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="12" cy="5" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="12" cy="13" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <line x1="8.5" y1="7.5" x2="10" y2="6.2" stroke="currentColor" strokeWidth="1.1" />
        <line x1="8.5" y1="10.5" x2="10" y2="11.8" stroke="currentColor" strokeWidth="1.1" />
      </svg>
    ),
  },
  {
    label: 'Recipes',
    href: '/recipes',
    icon: (
      <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
        <rect x="3" y="2" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" fill="none"/>
        <line x1="6" y1="6" x2="12" y2="6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        <line x1="6" y1="9" x2="12" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        <line x1="6" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: 'COGS',
    href: '/cogs',
    icon: (
      <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.4" fill="none"/>
        <path d="M11.5 6.5c-.5-.8-1.4-1.2-2.5-1.2-1.5 0-2.6.8-2.6 1.9 0 2.6 5.4 1.2 5.4 3.8 0 1.1-1.1 1.9-2.8 1.9-1.2 0-2.2-.5-2.7-1.3M9 4v10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: 'Swaps',
    href: '/swaps',
    icon: (
      <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
        <path d="M3 6h9l-2.5-2.5M15 12H6l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
    ),
  },
  {
    label: 'Pricing',
    href: '/pricing',
    icon: (
      <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
        <path d="M9 2v14M6 5.5h4.5a2 2 0 010 4h-3a2 2 0 000 4H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      </svg>
    ),
  },
  {
    label: 'Rate card',
    href: '/rate-card',
    icon: (
      <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
        <rect x="2" y="4" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" fill="none"/>
        <line x1="2" y1="7.5" x2="16" y2="7.5" stroke="currentColor" strokeWidth="1.2" opacity=".6"/>
        <line x1="5" y1="11" x2="9" y2="11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: 'Stock take',
    href: '/stocktake',
    icon: (
      <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
        <path d="M2 6l7-4 7 4v7l-7 4-7-4V6z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none"/>
        <path d="M2 6l7 4 7-4M9 10v7" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    label: 'LWC pricing',
    href: '/lwc',
    icon: (
      <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
        <path d="M6 2h6l1 3v10a1 1 0 01-1 1H6a1 1 0 01-1-1V5l1-3z" stroke="currentColor" strokeWidth="1.4" fill="none" opacity=".9"/>
        <line x1="5" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="1.2"/>
        <line x1="7.5" y1="11" x2="10.5" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".5"/>
      </svg>
    ),
  },
  {
    label: 'Finances',
    href: '/finances',
    icon: (
      <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
        <path d="M2 13l4-4 3 3 4-5 3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <rect x="2" y="2" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.4" fill="none" opacity=".4"/>
      </svg>
    ),
  },
  {
    label: 'Production',
    href: '/production',
    icon: (
      <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
        <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" fill="none"/>
        <path d="M5 7.5l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        <line x1="5" y1="12" x2="11" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".5"/>
      </svg>
    ),
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: (
      <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
        <path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M14.3 3.7l-1.4 1.4M5.1 12.9l-1.4 1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()

  return (
    <aside style={{
      width: '220px', minWidth: '220px', minHeight: '100vh',
      background: '#ffffff', borderRight: '1px solid #e5e7eb',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #f3f4f6' }}>
        <p style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 4px' }}>
          Foodlab
        </p>
        <h1 style={{ fontSize: '15px', fontWeight: 600, color: '#111827', margin: 0, lineHeight: 1.3 }}>
          Production Tracker
        </h1>
      </div>

      <nav style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {nav.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '8px 12px', borderRadius: '8px', fontSize: '14px', fontWeight: 500,
                textDecoration: 'none',
                color: active ? '#ffffff' : '#6b7280',
                background: active ? '#111827' : 'transparent',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ color: active ? '#ffffff' : '#9ca3af', display: 'flex', alignItems: 'center' }}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User + logout */}
      <div style={{ padding: '12px 14px', borderTop: '1px solid #f3f4f6' }}>

        {user && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                {user.displayName.charAt(0).toUpperCase()}
              </div>
              <span style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>{user.displayName}</span>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '2px', display: 'flex', alignItems: 'center' }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M11 11l3-3-3-3M14 8H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        )}
        <p style={{ fontSize: '11px', color: '#d1d5db', margin: 0 }}>Foodlab © {new Date().getFullYear()}</p>
      </div>
    </aside>
  )
}