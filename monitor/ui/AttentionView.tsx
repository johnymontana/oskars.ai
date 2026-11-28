import type { AttentionItem } from "./api.ts"
import { fetchOverview } from "./api.ts"
import { RefreshNotice } from "./RefreshNotice.tsx"
import { featureHref } from "./routes.ts"
import { StatusChip } from "./StatusChip.tsx"
import { usePoll } from "./usePoll.ts"

export function AttentionTable({ items, incomplete = false }: { items: AttentionItem[]; incomplete?: boolean }) {
  if (items.length === 0) {
    return (
      <p className="state state-empty">
        {incomplete ? "no attention items in the available data" : "nothing needs attention"}
      </p>
    )
  }
  const failed = items.filter((item) => item.state === "failed")
  const blocked = items.filter((item) => item.state === "blocked")
  const groups = [
    { label: "Failures", items: failed },
    { label: "Blocked by failures", items: blocked.filter((item) => item.blocking_failures.length > 0) },
    { label: "Waiting on work", items: blocked.filter((item) => item.blocking_failures.length === 0) },
  ]
  const blockedTotal = new Set(blocked.map((item) => JSON.stringify([item.store_id, item.node]))).size
  return (
    <table>
      <caption>{failed.length} failed · {blockedTotal} blocked</caption>
      <thead>
        <tr>
          <th>project</th>
          <th>feature</th>
          <th>node</th>
          <th>state</th>
          <th>waiting on</th>
          <th>failure impact</th>
          <th>last failed criteria</th>
        </tr>
      </thead>
      {groups.filter((group) => group.items.length > 0).map((group) => (
        <tbody key={group.label}>
          <tr><th scope="rowgroup" colSpan={7}>{group.label}</th></tr>
          {group.items.map((item) => (
            <tr key={JSON.stringify([item.store_id, item.node])}>
              <td className="mono">{item.project}</td>
              <td><a className="mono" href={featureHref(item.store_id)}>{item.feature}</a></td>
              <td><a className="mono" href={featureHref(item.store_id, "graph", item.node)}>{item.node}</a></td>
              <td><StatusChip status={item.state} /></td>
              <td className="mono">{item.waiting_on.join(", ") || "—"}</td>
              <td>
                {item.state === "failed"
                  ? item.blocked_count + " downstream blocked"
                  : item.blocking_failures.join(", ") || "—"}
              </td>
              <td>{item.last_failed_criteria.join("; ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  )
}

export function AttentionView({ pollInterval }: { pollInterval?: number }) {
  const { data, error, updatedAt } = usePoll(fetchOverview, pollInterval)
  if (!data) return error
    ? <RefreshNotice error={error} updatedAt={updatedAt} />
    : <p className="state state-loading">loading…</p>

  return (
    <section>
      <h1>Needs attention</h1>
      <RefreshNotice error={error} diagnostics={data.diagnostics} updatedAt={data.observed_at} />
      <p className="text-dim">Failures and the tasks waiting on them. Ordinary dependency waits are listed below.</p>
      <div className="table-scroll">
        <AttentionTable items={data.attention} incomplete={data.diagnostics.length > 0 || error !== null} />
      </div>
    </section>
  )
}
