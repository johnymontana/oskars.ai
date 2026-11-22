// Polling hook: fetches immediately, then re-fetches every intervalMs without
// a page reload. A null fetcher disables polling — nothing is fetched until it
// becomes non-null (e.g. a tab that only loads its data while visible). The
// interval is configurable per view; the default is DEFAULT_POLL_INTERVAL
// (3000ms).
import { useEffect, useRef, useState } from "react"

export const DEFAULT_POLL_INTERVAL = 3000

export function usePoll<T>(fetcher: (() => Promise<T>) | null, intervalMs: number = DEFAULT_POLL_INTERVAL) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef(fetcher)
  ref.current = fetcher
  const active = fetcher !== null
  useEffect(() => {
    if (!active) return
    let cancelled = false
    const tick = async () => {
      const fetchNow = ref.current
      if (!fetchNow) return
      try {
        const next = await fetchNow()
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
  }, [intervalMs, active])
  return { data, error }
}
