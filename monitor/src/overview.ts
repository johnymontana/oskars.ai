import { readStoreAttention, type AttentionItem } from "./attention.ts"
import type { MonitorConfig } from "./config.ts"
import { scanStores, type MonitorDiagnostic } from "./discover.ts"
import { readFeatureSummary, type FeatureSummary } from "./features.ts"

export type { MonitorDiagnostic } from "./discover.ts"

export interface Overview {
  features: FeatureSummary[]
  attention: AttentionItem[]
  diagnostics: MonitorDiagnostic[]
  observed_at: string
  scope: { roots: string[]; project?: string }
}

export async function listOverview(config: MonitorConfig): Promise<Overview> {
  const { stores, diagnostics } = await scanStores(config.roots, config.project)
  const snapshots = await Promise.all(
    stores.map(async (store) => {
      const { store_id, project, slug } = store
      const [feature, attention] = await Promise.allSettled([readFeatureSummary(store), readStoreAttention(store)])
      const unavailable: MonitorDiagnostic[] = []
      const errors = new Set<string>()
      for (const result of [feature, attention]) {
        if (result.status === "rejected") errors.add((result.reason as Error).message)
      }
      for (const error of errors) unavailable.push({ store_id, project, slug, message: error })
      return {
        features: feature.status === "fulfilled" ? [feature.value] : [],
        attention: attention.status === "fulfilled" ? attention.value : [],
        diagnostics: unavailable,
      }
    }),
  )
  return {
    features: snapshots.flatMap((snapshot) => snapshot.features),
    attention: snapshots.flatMap((snapshot) => snapshot.attention),
    diagnostics: diagnostics.concat(snapshots.flatMap((snapshot) => snapshot.diagnostics)),
    observed_at: new Date().toISOString(),
    scope: { roots: config.roots, project: config.project?.directory },
  }
}
