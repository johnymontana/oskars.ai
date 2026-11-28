// GET /api/attention: every failed and blocked node across all discovered
// stores — project, feature slug, node slug, derived state, the dependencies
// it waits on, and the failed criteria of its latest review.
import type { MonitorConfig } from "./config.ts"
import { discoverStores, type Store } from "./discover.ts"
import { blockedByFailure } from "./failureImpact.ts"
import { queryStore } from "./query.ts"

// Frontier nodes do not have a dependency to wait on.
const ATTENTION_QUERY = `MATCH (n:GbuildNode)
WHERE n.status = 'failed' OR n.status = 'pending'
OPTIONAL MATCH (n)-[:DEPENDS_ON]->(d:GbuildNode)
WITH n, [x IN collect(d) WHERE NOT x.status IN ['completed', 'cancelled'] | x.slug] AS waiting_on
WITH n, waiting_on, CASE
  WHEN n.status = 'pending' AND size(waiting_on) > 0 THEN 'blocked'
  ELSE n.status
END AS state
WHERE state IN ['failed', 'blocked']
OPTIONAL MATCH (n)-[:REVIEWED]->(r:Review)
WITH n, state, waiting_on, r ORDER BY r.attempt DESC
WITH n, state, waiting_on, head(collect(r.failed_criteria)) AS last_failed_criteria
RETURN n.slug AS node, state, waiting_on, last_failed_criteria
ORDER BY node`

export interface AttentionItem {
  store_id: string
  project: string
  feature: string
  node: string
  state: string
  waiting_on: string[]
  last_failed_criteria: string[]
  blocking_failures: string[]
  blocked_count: number
}

export async function readStoreAttention(store: Store): Promise<AttentionItem[]> {
  const rows = await queryStore(store.db, ATTENTION_QUERY)
  const items: AttentionItem[] = rows.map((row) => ({
    store_id: store.store_id,
    project: store.project,
    feature: store.slug,
    node: String(row.node),
    state: String(row.state),
    waiting_on: (row.waiting_on as string[]) ?? [],
    last_failed_criteria: (row.last_failed_criteria as string[]) ?? [],
    blocking_failures: [],
    blocked_count: 0,
  }))
  const byNode = new Map(items.map((item) => [item.node, item]))
  for (const [source, blocked] of blockedByFailure(items)) {
    byNode.get(source)!.blocked_count = blocked.length
    for (const node of blocked) byNode.get(node)!.blocking_failures.push(source)
  }
  return items
}

export async function listAttention(config: MonitorConfig): Promise<AttentionItem[]> {
  const stores = await discoverStores(config.roots, config.project)
  const results = await Promise.allSettled(stores.map(readStoreAttention))
  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
}
