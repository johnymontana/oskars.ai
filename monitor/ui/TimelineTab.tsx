// Plot completed implementations against their recorded end time and
// active workers against the live clock.
import { useEffect, useState } from "react"
import type { GraphNode } from "../src/graph.ts"
import { formatDuration } from "./NodePanel.tsx"

export function TimelineTab({ nodes }: { nodes: GraphNode[] }) {
  const [clock, setClock] = useState(Date.now)
  const ticking = nodes.some((n) => n.status === "in_progress" &&
    n.active_attempt?.started_at && !n.active_attempt.completed_at)
  useEffect(() => {
    if (!ticking) return
    setClock(Date.now())
    const interval = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [ticking])

  const rows: {
    node: GraphNode
    start: number
    end: number
    duration: string
    awaitingVerdict: boolean
  }[] = []
  const queued: string[] = []
  const running: string[] = []
  const pending: string[] = []
  const untimed: string[] = []
  for (const node of nodes) {
    const active = node.status === "in_progress"
    const attempt = active ? node.active_attempt : null
    const startedAt = active ? attempt?.started_at : node.started_at
    const start = startedAt ? Date.parse(startedAt) : NaN
    if (!Number.isFinite(start)) {
      if (active) (attempt ? queued : running).push(node.slug)
      else if (node.status === "completed" || node.status === "failed") untimed.push(node.slug)
      else pending.push(node.slug)
      continue
    }

    const completedAt = active
      ? attempt?.completed_at ?? new Date(Math.max(start, clock)).toISOString()
      : node.completed_at
    const end = completedAt ? Date.parse(completedAt) : start
    rows.push({
      node,
      start,
      end: Number.isFinite(end) ? Math.max(start, end) : start,
      duration: formatDuration(startedAt ?? null, completedAt),
      awaitingVerdict: !!attempt?.completed_at,
    })
  }

  rows.sort((a, b) => a.start - b.start || a.node.slug.localeCompare(b.node.slug))
  const first = rows[0]?.start ?? 0
  const last = rows.reduce((max, row) => Math.max(max, row.end), first)
  const span = Math.max(last - first, 1)
  if (!nodes.length) return <p className="state state-empty">This feature has no tasks with timing data yet.</p>

  return (
    <div className="timeline">
      {rows.length > 0 && (
        <p className="timeline-axis text-dim">
          <span className="mono">{new Date(first).toISOString()}</span>
          {" → "}
          <span className="mono">{new Date(last).toISOString()}</span>
        </p>
      )}
      {rows.map(({ node, start, end, duration, awaitingVerdict }) => {
        const left = ((start - first) / span) * 100
        const width = Math.max(((end - start) / span) * 100, 1)
        return (
          <div className="timeline-row" key={node.slug}>
            <span className="timeline-label mono">
              {node.slug}{awaitingVerdict && " · awaiting verdict"}
            </span>
            <div className="timeline-track">
              <div
                className="timeline-bar"
                data-status={node.status}
                style={{ left: `${left}%`, width: `${width}%` }}
              >
                {duration}
              </div>
            </div>
          </div>
        )
      })}
      {running.length > 0 && (
        <p className="text-dim">
          Store reports in progress · start time unavailable: <span className="mono">{running.join(", ")}</span>
        </p>
      )}
      {queued.length > 0 && (
        <p className="text-dim">
          Queued · waiting for worker start signal: <span className="mono">{queued.join(", ")}</span>
        </p>
      )}
      {pending.length > 0 && (
        <p className="text-dim">
          not started: <span className="mono">{pending.join(", ")}</span>
        </p>
      )}
      {untimed.length > 0 && (
        <p className="text-dim">
          Timing unavailable: <span className="mono">{untimed.join(", ")}</span>
        </p>
      )}
    </div>
  )
}
