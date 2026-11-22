// GET /api/attention: every failed and blocked node across all discovered
// stores — project, feature slug, node slug, derived state, the dependencies
// it waits on, and the failed criteria of its latest review.
import type { MonitorConfig } from "./config.ts"
import { discoverStores } from "./discover.ts"
import { queryStore } from "./query.ts"

// Frontier nodes are excluded: only genuinely stuck nodes need attention.
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
  project: string
  feature: string
  node: string
  state: string
  waiting_on: string[]
  last_failed_criteria: string[]
}

export async function listAttention(config: MonitorConfig): Promise<AttentionItem[]> {
  const stores = await discoverStores(config.roots)
  const perStore = await Promise.all(
    stores.map(async (store): Promise<AttentionItem[]> => {
      try {
        const rows = await queryStore(store.db, ATTENTION_QUERY)
        return rows.map((row) => ({
          project: store.project,
          feature: store.slug,
          node: String(row.node),
          state: String(row.state),
          waiting_on: (row.waiting_on as string[]) ?? [],
          last_failed_criteria: (row.last_failed_criteria as string[]) ?? [],
        }))
      } catch {
        return [] // a store that fails to open is skipped; the rest still list
      }
    }),
  )
  return perStore.flat()
}
