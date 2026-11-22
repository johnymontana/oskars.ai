// GET /api/features: one summary per discovered store — project path, feature
// slug, destination, and per-status node counts.
import type { MonitorConfig } from "./config.ts"
import { discoverStores } from "./discover.ts"
import { queryStore } from "./query.ts"

const FEATURE_QUERY = `MATCH (f:Feature) RETURN f.feature AS slug, f.destination AS destination`

// Pending splits into frontier/blocked the way gbuild's status.cypher derives it.
const COUNTS_QUERY = `MATCH (n:GbuildNode)
OPTIONAL MATCH (n)-[:DEPENDS_ON]->(d:GbuildNode)
WITH n, [x IN collect(d) WHERE NOT x.status IN ['completed', 'cancelled'] | x.slug] AS waiting_on
WITH CASE
  WHEN n.status = 'pending' AND size(waiting_on) = 0 THEN 'frontier'
  WHEN n.status = 'pending' THEN 'blocked'
  ELSE n.status
END AS state
RETURN state, count(*) AS count
ORDER BY state`

export interface FeatureSummary {
  project: string
  slug: string
  destination: string
  status_counts: Record<string, number>
}

export async function listFeatures(config: MonitorConfig): Promise<FeatureSummary[]> {
  const stores = await discoverStores(config.roots)
  const summaries = await Promise.all(
    stores.map(async (store): Promise<FeatureSummary | null> => {
      try {
        const [feature] = await queryStore(store.db, FEATURE_QUERY)
        if (!feature) return null
        const rows = await queryStore(store.db, COUNTS_QUERY)
        const status_counts = Object.fromEntries(rows.map((r) => [String(r.state), Number(r.count)]))
        return {
          project: store.project,
          slug: String(feature.slug),
          destination: String(feature.destination),
          status_counts,
        }
      } catch {
        return null // a store that fails to open is skipped; the rest still list
      }
    }),
  )
  return summaries.filter((s): s is FeatureSummary => s !== null)
}
