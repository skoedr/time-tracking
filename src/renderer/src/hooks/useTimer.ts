import { useEffect, useRef, useCallback } from 'react'
import { useTimerStore } from '../store/timerStore'
import { formatDuration as _formatDuration } from '../../../shared/duration'

// Refs shared across all useTimer() instances so listeners are registered ONCE
// globally and always invoke the latest callback.
const globalToggleRef: { current: () => void } = { current: () => {} }
const globalQuickStartRef: { current: (clientId: number) => void } = { current: () => {} }
const globalStopRef: { current: () => void } = { current: () => {} }
let listenersInstalled = false

function installGlobalListenersOnce(setIdleEvent: (e: { idleSince: string; idleSeconds: number } | null) => void): void {
  if (listenersInstalled) return
  listenersInstalled = true
  window.api.onHotkeyToggle(() => globalToggleRef.current())
  window.api.onTrayQuickStart((clientId) => globalQuickStartRef.current(clientId))
  window.api.onTrayStop(() => globalStopRef.current())
  window.api.onIdleDetected((data) => {
    if (useTimerStore.getState().runningEntry) {
      setIdleEvent(data)
    } else {
      window.api.idle.dismiss()
    }
  })
}

let initRan = false

export function useTimer() {
  const {
    clients,
    runningEntry,
    selectedClientId,
    description,
    elapsedSeconds,
    isLoading,
    idleEvent,
    setClients,
    setRunningEntry,
    setSelectedClientId,
    setDescription,
    setElapsedSeconds,
    setIsLoading,
    setIdleEvent
  } = useTimerStore()

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load clients + check for running entry on first mount only (idempotent).
  useEffect(() => {
    if (initRan) return
    initRan = true
    async function init() {
      const [clientsRes, runningRes] = await Promise.all([
        window.api.clients.getAll(),
        window.api.entries.getRunning()
      ])
      if (clientsRes.ok) setClients(clientsRes.data)
      if (runningRes.ok && runningRes.data) {
        const entry = runningRes.data
        setRunningEntry(entry)
        setSelectedClientId(entry.client_id)
        setDescription(entry.description)
        const started = new Date(entry.started_at).getTime()
        setElapsedSeconds(Math.floor((Date.now() - started) / 1000))
        const allClients = clientsRes.ok ? clientsRes.data : []
        const clientName = allClients.find((c) => c.id === entry.client_id)?.name ?? ''
        window.api.tray.update(true, clientName)
      }
    }
    init()
    installGlobalListenersOnce(setIdleEvent)
  }, [])

  // Tick interval when running
  useEffect(() => {
    if (runningEntry) {
      tickRef.current = setInterval(() => {
        setElapsedSeconds(
          Math.floor((Date.now() - new Date(runningEntry.started_at).getTime()) / 1000)
        )
      }, 1000)

      // Heartbeat every 30s
      heartbeatRef.current = setInterval(() => {
        window.api.entries.heartbeat(runningEntry.id)
      }, 30_000)
    } else {
      if (!runningEntry) setElapsedSeconds(0)
    }

    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    }
  }, [runningEntry])

  const start = useCallback(async () => {
    if (!selectedClientId) return
    setIsLoading(true)
    const res = await window.api.entries.start({
      client_id: selectedClientId,
      description,
      started_at: new Date().toISOString()
    })
    setIsLoading(false)
    if (res.ok) {
      setRunningEntry(res.data)
      const clientName = clients.find((c) => c.id === selectedClientId)?.name ?? ''
      window.api.tray.update(true, clientName)
    }
  }, [selectedClientId, description, clients])

  const stop = useCallback(async () => {
    if (!runningEntry) return
    setIsLoading(true)
    const res = await window.api.entries.stop(runningEntry.id)
    setIsLoading(false)
    if (res.ok) {
      setRunningEntry(null)
      setDescription('')
      window.api.tray.update(false, '')
      // If user manually stops, dismiss any pending idle event.
      if (useTimerStore.getState().idleEvent) {
        setIdleEvent(null)
        window.api.idle.dismiss()
      }
    }
  }, [runningEntry])

  const startWithClient = useCallback(
    async (clientId: number) => {
      if (useTimerStore.getState().runningEntry) return
      setSelectedClientId(clientId)
      setIsLoading(true)
      const res = await window.api.entries.start({
        client_id: clientId,
        description: '',
        started_at: new Date().toISOString()
      })
      setIsLoading(false)
      if (res.ok) {
        setRunningEntry(res.data)
        setDescription('')
        const clientName = clients.find((c) => c.id === clientId)?.name ?? ''
        window.api.tray.update(true, clientName)
      }
    },
    [clients]
  )

  const dismissIdle = useCallback(() => {
    setIdleEvent(null)
    window.api.idle.dismiss()
  }, [])

  const idleKeep = useCallback(() => {
    dismissIdle()
  }, [dismissIdle])

  const idleStopAtIdle = useCallback(async () => {
    const ev = useTimerStore.getState().idleEvent
    const entry = useTimerStore.getState().runningEntry
    if (!ev || !entry) {
      dismissIdle()
      return
    }
    setIsLoading(true)
    const res = await window.api.entries.update({
      id: entry.id,
      client_id: entry.client_id,
      description: entry.description,
      started_at: entry.started_at,
      stopped_at: ev.idleSince
    })
    setIsLoading(false)
    if (res.ok) {
      setRunningEntry(null)
      setDescription('')
      window.api.tray.update(false, '')
    }
    dismissIdle()
  }, [dismissIdle])

  const idleMarkPause = useCallback(async () => {
    const ev = useTimerStore.getState().idleEvent
    const entry = useTimerStore.getState().runningEntry
    if (!ev || !entry) {
      dismissIdle()
      return
    }
    setIsLoading(true)
    // 1. Stop the running entry at idleSince
    const stopRes = await window.api.entries.update({
      id: entry.id,
      client_id: entry.client_id,
      description: entry.description,
      started_at: entry.started_at,
      stopped_at: ev.idleSince
    })
    if (stopRes.ok) {
      // 2. Insert pause entry from idleSince to now
      const pauseStart = ev.idleSince
      const pauseEnd = new Date().toISOString()
      const pauseStartRes = await window.api.entries.start({
        client_id: entry.client_id,
        description: 'Pause',
        started_at: pauseStart
      })
      if (pauseStartRes.ok) {
        await window.api.entries.update({
          id: pauseStartRes.data.id,
          client_id: entry.client_id,
          description: 'Pause',
          started_at: pauseStart,
          stopped_at: pauseEnd
        })
      }
      setRunningEntry(null)
      setDescription('')
      window.api.tray.update(false, '')
    }
    setIsLoading(false)
    dismissIdle()
  }, [dismissIdle])

  // Keep refs current so listeners always call the latest fn
  globalToggleRef.current = runningEntry ? stop : start
  globalQuickStartRef.current = startWithClient
  globalStopRef.current = stop

  return {
    clients,
    runningEntry,
    selectedClientId,
    description,
    elapsedSeconds,
    isLoading,
    idleEvent,
    setSelectedClientId,
    setDescription,
    start,
    stop,
    idleKeep,
    idleStopAtIdle,
    idleMarkPause
  }
}

export function formatDuration(seconds: number): string {
  // Re-export shared util for legacy import sites; new code should import from '@shared/duration'.
  return _formatDuration(seconds)
}