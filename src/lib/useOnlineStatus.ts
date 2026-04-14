/**
 * useOnlineStatus — event-driven hook that reports connectivity and the
 * number of pending offline mutations. `pendingCount` is sourced from the
 * realtimeStore, which keeps it reactive via subscribeToQueueChanges.
 */

import { useEffect, useState } from 'react'
import { useRealtimeStore } from '../stores/realtimeStore'

export function useOnlineStatus(): { isOnline: boolean; pendingCount: number } {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const pendingCount = useRealtimeStore(s => s.pendingCount)

  useEffect(() => {
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  return { isOnline, pendingCount }
}
