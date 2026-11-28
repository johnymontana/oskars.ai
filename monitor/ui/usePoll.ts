import { useEffect, useRef, useState } from "react"

export const DEFAULT_POLL_INTERVAL = 3000

interface Snapshot<T> {
  key: string
  data: T | null
  error: Error | null
  updatedAt: string | null
}

// Each refresh finishes before the next one is scheduled. Changing the key
// hides the previous snapshot immediately and aborts its outstanding request.
export function usePoll<T>(
  fetcher: ((signal: AbortSignal) => Promise<T>) | null,
  intervalMs: number = DEFAULT_POLL_INTERVAL,
  key = "",
) {
  const [snapshot, setSnapshot] = useState<Snapshot<T> | null>(null)
  const ref = useRef(fetcher)
  ref.current = fetcher
  const active = fetcher !== null

  useEffect(() => {
    if (!active) return

    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      const fetchNow = ref.current
      if (!fetchNow || controller.signal.aborted) return
      try {
        const data = await fetchNow(controller.signal)
        if (!controller.signal.aborted) setSnapshot({ key, data, error: null, updatedAt: new Date().toISOString() })
      } catch (cause) {
        if (!controller.signal.aborted) {
          const error = cause instanceof Error ? cause : new Error(String(cause))
          setSnapshot((current) => current?.key === key
            ? { ...current, error }
            : { key, data: null, error, updatedAt: null })
        }
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(tick, intervalMs)
      }
    }

    void tick()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [key, intervalMs, active])

  return active && snapshot?.key === key ? snapshot : { data: null, error: null, updatedAt: null }
}
