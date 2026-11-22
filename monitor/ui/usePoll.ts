// Polling hook: fetches immediately, then re-fetches every intervalMs without
// a page reload. The interval is configurable per view; the default is
// DEFAULT_POLL_INTERVAL (3000ms).
import { useEffect, useRef, useState } from "react"

export const DEFAULT_POLL_INTERVAL = 3000

export function usePoll<T>(fetcher: () => Promise<T>, intervalMs: number = DEFAULT_POLL_INTERVAL) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef(fetcher)
  ref.current = fetcher
  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try {
        const next = await ref.current()
        if (!cancelled) {
          setData(next)
          setError(null)
        }
      } catch (cause) {
        if (!cancelled) setError((cause as Error).message)
      }
    }
    void tick()
    const id = setInterval(tick, intervalMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [intervalMs])
  return { data, error }
}
