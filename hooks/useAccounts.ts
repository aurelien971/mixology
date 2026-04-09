'use client'

import { useEffect, useState, useCallback } from 'react'
import { Account } from '@/types'
import { getAccounts } from '@/lib/firestore/accounts'

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getAccounts()
      setAccounts(data)
    } catch (e) {
      setError('Failed to load accounts')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { accounts, loading, error, reload: load }
}