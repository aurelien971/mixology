'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'

interface AuthUser {
  username:    string
  displayName: string
  role:        'admin' | 'staff'
}

interface AuthCtx {
  user:    AuthUser | null
  loading: boolean
  login:   (user: AuthUser) => void
  logout:  () => void
}

const Ctx = createContext<AuthCtx>({
  user: null, loading: true,
  login: () => {}, logout: () => {},
})

const SESSION_KEY = 'foodlab_session'

// Routes that don't require auth
const PUBLIC_ROUTES = ['/login', '/track']

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const router   = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (raw) setUser(JSON.parse(raw))
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    if (loading) return
    const isPublic = PUBLIC_ROUTES.some(r => pathname.startsWith(r))
    if (!user && !isPublic) router.replace('/login')
    if (user && pathname === '/login') router.replace('/')
  }, [user, loading, pathname])

  function login(u: AuthUser) {
    setUser(u)
    localStorage.setItem(SESSION_KEY, JSON.stringify(u))
  }

  function logout() {
    setUser(null)
    localStorage.removeItem(SESSION_KEY)
    router.replace('/login')
  }

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>
}

export function useAuth() {
  return useContext(Ctx)
}