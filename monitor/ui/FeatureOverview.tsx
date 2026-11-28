import { useState } from "react"
import { blockedByFailure } from "../src/failureImpact.ts"
import type { GraphDetail, GraphNode } from "./api.ts"
import { featureHref } from "./routes.ts"
import { StatusChip, statusLabel } from "./StatusChip.tsx"

function failureDetails(nodes: GraphNode[]) {
  const bySlug = new Map(nodes.map((node) => [node.slug, node]))
  const tasks = nodes.map((node) => ({
    node: node.slug,
    state: node.status,
    waiting_on: node.depends_on.filter((slug) => {
      const status = bySlug.get(slug)?.status
      return status !== "completed" && status !== "cancelled"
    }),
  }))
  const blocked = blockedByFailure(tasks)
  return nodes.filter((node) => node.status === "failed")
    .map((node) => ({ node, affected: blocked.get(node.slug)?.length ?? 0 }))
    .sort((a, b) => b.affected - a.affected || a.node.wave - b.node.wave || a.node.slug.localeCompare(b.node.slug))
}

function CopyFailure({ text }: { text: string }) {
  const [message, setMessage] = useState("")
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setMessage("Failure details copied")
    } catch {
      setMessage("Clipboard unavailable. Select the failure details above to copy them.")
    }
  }
  return (
    <>
      <button type="button" className="monitor-action" onClick={() => void copy()}>Copy failure details</button>
      {message && <span className="text-dim" role="status"> {message}</span>}
    </>
  )
}

export function FeatureOverview({ data }: { data: GraphDetail }) {
  const counts = new Map<string, number>()
  for (const node of data.nodes) counts.set(node.status, (counts.get(node.status) ?? 0) + 1)
  const [failure] = failureDetails(data.nodes)
  const ready = data.nodes.find((node) => node.status === "frontier")
  const inProgress = counts.get("in_progress") ?? 0
  const withStart = data.nodes.filter((node) =>
    node.status === "in_progress" && node.active_attempt?.started_at && !node.active_attempt.completed_at).length
  const orderedStatuses = ["completed", "in_progress", "frontier", "failed", "blocked", "pending", "cancelled"]
  const statuses = [...orderedStatuses, ...[...counts.keys()].filter((status) => !orderedStatuses.includes(status))]
  const latestFailure = failure?.node.reviews.at(-1)?.failed_criteria ?? []
  const readyToInspect = ready && !failure

  return (
    <section aria-label="Feature overview">
      <h2>Progress</h2>
      {counts.size === 0 && <p className="text-dim">The feature has no tasks yet.</p>}
      <div className="feature-counts">
        {statuses.map((status) => counts.has(status) && (
          <StatusChip key={status} status={status}>{statusLabel(status)}: {counts.get(status)}</StatusChip>
        ))}
      </div>
      {inProgress > 0 && (
        <p className="text-dim">
          {inProgress} {inProgress === 1 ? "task reports" : "tasks report"} in progress.
          {" "}{withStart} {withStart === 1 ? "has" : "have"} a recorded worker start without a recorded finish.
          {" "}<a href={featureHref(data.store_id, "timeline")}>View timeline</a>
        </p>
      )}
      {failure && (
        <article>
          <h3>Investigate a failure</h3>
          <p><a href={featureHref(data.store_id, "graph", failure.node.slug)}>{failure.node.title}</a></p>
          <p>{failure.affected} downstream {failure.affected === 1 ? "task is" : "tasks are"} blocked.</p>
          {latestFailure.length > 0
            ? <ul>{latestFailure.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul>
            : <p>No failed criteria were recorded.</p>}
          <CopyFailure
            key={failure.node.slug}
            text={[`${data.project} / ${data.slug}`, failure.node.slug, ...latestFailure].join("\n")}
          />
          {" "}<a href={featureHref(data.store_id, "repairs")}>Review history</a>
        </article>
      )}
      {readyToInspect && (
        <article>
          <h3>Ready to run</h3>
          <p><a href={featureHref(data.store_id, "graph", ready.slug)}>{ready.title}</a></p>
          <p className="text-dim">Its prerequisites are satisfied. Use gbuild to run the feature.</p>
        </article>
      )}
      <p><a href={featureHref(data.store_id)}>Explore the task graph</a></p>
    </section>
  )
}
