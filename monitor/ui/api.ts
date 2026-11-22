// Client for the monitor REST API. Types come from the server modules so the
// UI and the API can never drift apart; the imports are type-only and erased
// at build time.
import type { FeatureSummary } from "../src/features.ts"
import type { GraphDetail, GraphNode } from "../src/graph.ts"

export type { FeatureSummary, GraphDetail, GraphNode }

const get = async <T>(path: string): Promise<T> => {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return (await res.json()) as T
}

export const fetchFeatures = () => get<FeatureSummary[]>("/api/features")

export const fetchGraph = (slug: string) => get<GraphDetail>(`/api/features/${encodeURIComponent(slug)}/graph`)
