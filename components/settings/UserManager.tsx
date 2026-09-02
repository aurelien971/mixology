'use client'

import { useEffect, useState } from 'react'
import Button from '@/components/ui/Button'
import {
  StaffUser, getStaffUsers, createStaffUser, updateStaffUser, deleteStaffUser, usernameTaken,
} from '@/lib/firestore/staffUsers'
import toast from 'react-hot-toast'

const label: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 500, color: '#6b7280', marginBottom: '5px',
}
const input: React.CSSProperties = {
  width: '100%', padding: '7px 9px', border: '1px solid #e5e7eb', borderRadius: '7px',
  fontSize: '13px', outline: 'none', boxSizing: 'border-box',
}
const td: React.CSSProperties = { padding: '10px 12px', fontSize: '13px', color: '#374151' }
const th: React.CSSProperties = {
  padding: '8px 12px', fontSize: '10px', fontWeight: 600, color: '#9ca3af',
  textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left',
}

export default function UserManager() {
  const [users, setUsers] = useState<StaffUser[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [showPasswords, setShowPasswords] = useState(false)

  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'staff'>('staff')

  function load() {
    getStaffUsers().then(setUsers).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  async function add() {
    const uname = username.trim().toLowerCase()
    if (!displayName.trim() || !uname || !password.trim()) {
      return toast.error('Name, username and password are all needed')
    }
    setBusy(true)
    try {
      if (await usernameTaken(uname)) {
        toast.error(`"${uname}" is already taken — logins go by username, so it has to be unique`)
        return
      }
      await createStaffUser(uname, displayName.trim(), password.trim(), role)
      toast.success(`${displayName.trim()} can now sign in`)
      setDisplayName(''); setUsername(''); setPassword(''); setRole('staff')
      load()
    } catch {
      toast.error('Could not create the user')
    } finally { setBusy(false) }
  }

  return (
    <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #f3f4f6', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6' }}>
        <p style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: '0 0 2px' }}>People</p>
        <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>
          Who can sign in, and who can be given a project.
        </p>
      </div>

      {loading ? (
        <p style={{ padding: '18px 20px', fontSize: '13px', color: '#9ca3af', margin: 0 }}>Loading…</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#fafafa' }}>
              <th style={th}>Name</th>
              <th style={th}>Username</th>
              <th style={th}>Password</th>
              <th style={th}>Role</th>
              <th style={{ ...th, textAlign: 'right' }} />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderTop: '1px solid #f9fafb' }}>
                <td style={{ ...td, fontWeight: 600, color: '#111827' }}>
                  <input
                    defaultValue={u.displayName}
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v && v !== u.displayName) {
                        updateStaffUser(u.id, { displayName: v }).then(load)
                      }
                    }}
                    style={{ ...input, border: '1px solid transparent', padding: '4px 6px', fontWeight: 600 }}
                  />
                </td>
                <td style={{ ...td, fontFamily: 'monospace', color: '#6b7280' }}>{u.username}</td>
                <td style={{ ...td, fontFamily: 'monospace', color: '#6b7280' }}>
                  {showPasswords ? (
                    <input
                      defaultValue={u.password}
                      onBlur={(e) => {
                        const v = e.target.value.trim()
                        if (v && v !== u.password) {
                          updateStaffUser(u.id, { password: v }).then(() => { toast.success('Password changed'); load() })
                        }
                      }}
                      style={{ ...input, border: '1px solid transparent', padding: '4px 6px', fontFamily: 'monospace', width: '140px' }}
                    />
                  ) : '••••••••'}
                </td>
                <td style={td}>
                  <select
                    value={u.role}
                    onChange={(e) => updateStaffUser(u.id, { role: e.target.value as 'admin' | 'staff' }).then(load)}
                    style={{ ...input, width: 'auto', cursor: 'pointer', padding: '4px 8px' }}
                  >
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <button
                    onClick={async () => {
                      if (!confirm(`Remove ${u.displayName}?\n\nThey can no longer sign in. Projects they own keep their name on them.`)) return
                      await deleteStaffUser(u.id)
                      load()
                    }}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: '16px' }}
                  >×</button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={5} style={{ padding: '20px', textAlign: 'center', fontSize: '13px', color: '#9ca3af' }}>
                Nobody yet.
              </td></tr>
            )}
          </tbody>
        </table>
      )}

      <div style={{ padding: '16px 20px', borderTop: '1px solid #f3f4f6', background: '#fafafa' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 0.8fr auto', gap: '10px', alignItems: 'flex-end' }}>
          <div>
            <span style={label}>Name</span>
            <input
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value)
                // Username follows the name until it is edited on its own.
                if (!username || username === displayName.toLowerCase().split(' ')[0]) {
                  setUsername(e.target.value.toLowerCase().split(' ')[0])
                }
              }}
              placeholder="Dima"
              style={input}
            />
          </div>
          <div>
            <span style={label}>Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
              placeholder="dima"
              style={{ ...input, fontFamily: 'monospace' }}
            />
          </div>
          <div>
            <span style={label}>Password</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Set one"
              style={{ ...input, fontFamily: 'monospace' }}
            />
          </div>
          <div>
            <span style={label}>Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'staff')} style={{ ...input, cursor: 'pointer' }}>
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <Button onClick={add} loading={busy} disabled={busy}>Add person</Button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', marginTop: '12px', flexWrap: 'wrap' }}>
          <p style={{ fontSize: '11.5px', color: '#9ca3af', margin: 0, maxWidth: '62ch', lineHeight: 1.5 }}>
            Passwords are stored as typed, the way this tool has always worked — fine behind a private URL, worth
            knowing before anyone reuses a password they use elsewhere.
          </p>
          <button
            onClick={() => setShowPasswords((v) => !v)}
            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '11.5px', color: '#6b7280', textDecoration: 'underline', whiteSpace: 'nowrap' }}
          >
            {showPasswords ? 'Hide passwords' : 'Show and edit passwords'}
          </button>
        </div>
      </div>
    </div>
  )
}
