// Acceptance tab: the feature's acceptance criteria, each with the nodes whose
// SATISFIES edges cover it rendered as status chips in the status color
// language. Uncovered criteria are flagged as such.
import type { AcceptanceCriterion, GraphNode } from "../src/graph.ts"
import { StatusChip } from "./StatusChip.tsx"

export function AcceptanceTab({ acceptance, nodes }: { acceptance: AcceptanceCriterion[]; nodes: GraphNode[] }) {
  if (acceptance.length === 0) return <p className="state state-empty">no acceptance criteria recorded</p>
  const bySlug = new Map(nodes.map((n) => [n.slug, n]))
  return (
    <ul className="acceptance-list">
      {acceptance.map((criterion) => (
        <li key={criterion.id}>
          <span className="mono">{criterion.id}</span> {criterion.text}
          <div>
            {criterion.covered_by.length === 0 ? (
              <span className="text-dim">uncovered</span>
            ) : (
              criterion.covered_by.map((slug) => (
                <StatusChip key={slug} status={bySlug.get(slug)?.status ?? "blocked"}>
                  {slug}
                </StatusChip>
              ))
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
