import { useEffect, useRef, useCallback } from 'react'
import { useTimerStore } from '../store/timerStore'
import { formatDuration as _formatDuration } from '../../../shared/duration'

export function useTimer() {
  const {
    clients,
    runningEntry,
    selectedClientId,
    description,
    elapsedSeconds,
    isLoading,
    setClients,
    setRunningEntry,
    setSelectedClientId,
    setDescription,
    setElapsedSeconds,
    setIsLoading
  } = useTimerStore()

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Ref to always-current toggle fn for hotkey (avoids stale closures)
  const toggleRef = useRef<() => void>(() => {})

  // Load clients + check for running entry on mount
  useEffect(() => {
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
        // Restore tray state on app start
        const allClients = clientsRes.ok ? clientsRes.data : []
        const clientName = allClients.find((c) => c.id === entry.client_id)?.name ?? ''
        window.api.tray.update(true, clientName)
      }
    }
    init()

    // Register hotkey listener once
    const cleanup = window.api.onHotkeyToggle(() => toggleRef.current())
    return cleanup
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
    }
  }, [runningEntry])

  // Keep toggleRef current so hotkey always calls the right fn
  toggleRef.current = runningEntry ? stop : start

  return {
    clients,
    runningEntry,
    selectedClientId,
    description,
    elapsedSeconds,
    isLoading,
    setSelectedClientId,
    setDescription,
    start,
    stop
  }
}

export function formatDuration(seconds: number): string {
  // Re-export shared util for legacy import sites; new code should import from '@shared/duration'.
  return _formatDuration(seconds)
}
