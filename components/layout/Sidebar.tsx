'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

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
    label: 'Payments',
    href: '/payments',
    icon: (
      <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
        <rect x="2" y="5" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" opacity=".9" />
        <line x1="2" y1="9" x2="16" y2="9" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="5.5" cy="12" r="1" fill="currentColor" opacity=".7" />
      </svg>
    ),
  },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside style={{
      width: '220px',
      minWidth: '220px',
      minHeight: '100vh',
      background: '#ffffff',
      borderRight: '1px solid #e5e7eb',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        padding: '20px 20px 16px',
        borderBottom: '1px solid #f3f4f6',
      }}>
        <p style={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 4px' }}>
          Foodlab
        </p>
        <h1 style={{ fontSize: '15px', fontWeight: 600, color: '#111827', margin: 0, lineHeight: 1.3 }}>
          Cocktail Manager
        </h1>
      </div>

      <nav style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {nav.map((item) => {
          const active =
            item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 500,
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

      <div style={{ padding: '12px 20px', borderTop: '1px solid #f3f4f6' }}>
        <p style={{ fontSize: '11px', color: '#d1d5db', margin: 0 }}>
          Foodlab © {new Date().getFullYear()}
        </p>
      </div>
    </aside>
  )
}