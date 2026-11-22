// Timeline tab: each started node as a bar on one shared time axis, positioned
// by its started_at/completed_at so run durations and the idle gaps between
// nodes are visible at a glance. Bars carry the status color language via
// data-status (same tokens as the status chips and graph nodes).
import type { GraphNode } from "../src/graph.ts"
import { formatDuration } from "./NodePanel.tsx"

export function TimelineTab({ nodes }: { nodes: GraphNode[] }) {
  const started = nodes.filter((n) => n.started_at !== null)
  if (started.length === 0) return <p className="state state-empty">no nodes have started yet</p>

  const startOf = (n: GraphNode) => Date.parse(n.started_at as string)
  const endOf = (n: GraphNode) => Date.parse(n.completed_at ?? (n.started_at as string))
  const t0 = Math.min(...started.map(startOf))
  const t1 = Math.max(...started.map(endOf))
  const span = Math.max(t1 - t0, 1)
  const rows = [...started].sort((a, b) => startOf(a) - startOf(b) || a.slug.localeCompare(b.slug))
  const pending = nodes.filter((n) => n.started_at === null)

  return (
    <div className="timeline">
      <p className="timeline-axis text-dim">
        <span className="mono">{new Date(t0).toISOString()}</span>
        {" → "}
        <span className="mono">{new Date(t1).toISOString()}</span>
      </p>
      {rows.map((n) => {
        const left = ((startOf(n) - t0) / span) * 100
        const width = Math.max(((endOf(n) - startOf(n)) / span) * 100, 1)
        return (
          <div className="timeline-row" key={n.slug}>
            <span className="timeline-label mono">{n.slug}</span>
            <div className="timeline-track">
              <div
                className="timeline-bar"
                data-status={n.status}
                style={{ left: `${left}%`, width: `${width}%` }}
              >
                {formatDuration(n.started_at, n.completed_at)}
              </div>
            </div>
          </div>
        )
      })}
      {pending.length > 0 && (
        <p className="text-dim">
          not started: <span className="mono">{pending.map((n) => n.slug).join(", ")}</span>
        </p>
      )}
    </div>
  )
}
