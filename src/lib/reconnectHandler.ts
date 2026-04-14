/**
 * reconnectHandler.ts — Refresh data and heal subscriptions when the app
 * regains focus or connectivity. Field devices (especially iPad on hotspot)
 * sometimes suspend the realtime socket without reporting CLOSED, so we also
 * do a belt-and-braces resubscribe if realtimeConnected is false.
 */

import { useAppStore } from '../stores/appStore'
import { useRealtimeStore } from '../stores/realtimeStore'
import { replayQueue } from './syncEngine'

const DEBOUNCE_MS = 5000
let lastRefreshAt = 0
let initialized = false

async function refresh(): Promise<void> {
  const now = Date.now()
  if (now - lastRefreshAt < DEBOUNCE_MS) return
  lastRefreshAt = now

  console.log('[Reconnect] App regained focus, refreshing...')

  if (!navigator.onLine) {
    console.log('[Reconnect] Still offline — skipping network refresh')
    return
  }

  const store = useRealtimeStore.getState()
  const currentRfeId = useAppStore.getState().currentRfeId

  try {
    await store.loadRFEList()
    if (currentRfeId) {
      await store.loadRFE(currentRfeId)
    }
  } catch (e) {
    console.warn('[Reconnect] Data refresh failed:', e)
  }

  try {
    await replayQueue()
  } catch (e) {
    console.warn('[Reconnect] Queue replay failed:', e)
  }

  // Heal realtime subscription if it silently dropped
  if (!store.realtimeConnected) {
    console.log('[Reconnect] Realtime disconnected — resubscribing')
    try {
      store.unsubscribeAll()
      store.subscribeToRFEList()
      if (currentRfeId) store.subscribeToRFE(currentRfeId)
    } catch (e) {
      console.warn('[Reconnect] Resubscribe failed:', e)
    }
  }
}

export function initReconnectHandler(): void {
  if (initialized) return
  initialized = true

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void refresh()
    }
  })

  window.addEventListener('online', () => {
    void refresh()
  })

  window.addEventListener('focus', () => {
    void refresh()
  })
}
