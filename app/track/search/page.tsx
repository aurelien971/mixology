'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function TrackSearch() {
  const router = useRouter()
  const [input, setInput] = useState('')
  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px 40px' }}>
      <div style={{ textAlign: 'center', marginBottom: '36px' }}>
        <p style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 6px' }}>Foodlab Cocktails</p>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>Order tracking</h1>
        <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>Enter your order number to view status and download documents</p>
      </div>
      <div style={{ width: '100%', maxWidth: '480px' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && input.trim() && router.push(`/track/${input.trim()}`)}
            placeholder="e.g. FL-2026-0001"
            style={{ flex: 1, padding: '12px 16px', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '15px', outline: 'none', background: '#fff', fontFamily: 'monospace', letterSpacing: '0.05em' }}
          />
          <button
            onClick={() => input.trim() && router.push(`/track/${input.trim()}`)}
            style={{ padding: '12px 20px', borderRadius: '10px', border: 'none', background: '#111827', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
          >
            Track
          </button>
        </div>
      </div>
      <p style={{ fontSize: '12px', color: '#d1d5db', marginTop: '40px' }}>Foodlab Cocktails · London</p>
    </div>
  )
}