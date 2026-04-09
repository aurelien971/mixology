'use client'

import { useEffect, useState, useCallback } from 'react'
import { Order } from '@/types'
import { getOrders } from '@/lib/firestore/orders'

export function useOrders(limitCount = 100) {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getOrders(limitCount)
      setOrders(data)
    } catch (e) {
      setError('Failed to load orders')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [limitCount])

  useEffect(() => { load() }, [load])

  return { orders, loading, error, reload: load }
}