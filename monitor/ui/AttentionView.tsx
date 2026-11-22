// Attention view: every failed and blocked node across all discovered
// stores — project, feature, node, derived state, the dependencies it waits
// on, and the failed criteria of its latest review. The same table is the
// needs-attention summary on the feature list landing. Polls /api/attention.
import type { AttentionItem } from "./api.ts"
import { fetchAttention } from "./api.ts"
import { StatusChip } from "./StatusChip.tsx"
import { usePoll } from "./usePoll.ts"

export function AttentionTable({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) return <p className="state state-empty">nothing needs attention</p>
  return (
    <table>
      <thead>
        <tr>
          <th>project</th>
          <th>feature</th>
          <th>node</th>
          <th>state</th>
          <th>waiting on</th>
          <th>last failed criteria</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={`${item.project}/${item.feature}/${item.node}`}>
            <td className="mono">{item.project}</td>
            <td>
              <a className="mono" href={`#/features/${encodeURIComponent(item.feature)}`}>
                {item.feature}
              </a>
            </td>
            <td className="mono">{item.node}</td>
            <td>
              <StatusChip status={item.state} />
            </td>
            <td className="mono">{item.waiting_on.join(", ") || "—"}</td>
            <td>{item.last_failed_criteria.join("; ") || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function AttentionView({ pollInterval }: { pollInterval?: number }) {
  const { data, error } = usePoll(fetchAttention, pollInterval)
  if (error) return (
    <p role="alert" className="state state-error">
      failed to load attention: {error}
    </p>
  )
  if (!data) return <p className="state state-loading">loading…</p>
  return (
    <section>
      <h1>needs attention</h1>
      <AttentionTable items={data} />
    </section>
  )
}
