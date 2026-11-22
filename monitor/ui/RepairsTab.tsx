// Repairs tab: the review attempt history of every reviewed node — verdict,
// failed criteria and checklist lines per attempt — so a repair loop is
// readable end to end without opening each node panel.
import type { GraphNode } from "../src/graph.ts"
import { StatusChip } from "./StatusChip.tsx"

export function RepairsTab({ nodes }: { nodes: GraphNode[] }) {
  const reviewed = nodes.filter((n) => n.reviews.length > 0)
  if (reviewed.length === 0) return <p className="state state-empty">no review attempts yet</p>
  return (
    <div className="repairs-list">
      {reviewed.map((n) => (
        <article key={n.slug}>
          <h3>
            <span className="mono">{n.slug}</span> <StatusChip status={n.status} />
          </h3>
          <ul>
            {n.reviews.map((r) => (
              <li key={r.attempt}>
                attempt {r.attempt}:{" "}
                <span className="review-verdict mono" data-verdict={r.verdict}>
                  {r.verdict}
                </span>{" "}
                <span className="text-dim mono">{r.at}</span>
                {r.failed_criteria.length > 0 && (
                  <ul className="failed-criteria">
                    {r.failed_criteria.map((criterion) => (
                      <li key={criterion}>{criterion}</li>
                    ))}
                  </ul>
                )}
                {r.checklist.length > 0 && (
                  <ul className="review-checklist">
                    {r.checklist.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  )
}
