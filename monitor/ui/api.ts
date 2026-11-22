// Client for the monitor REST API. Types come from the server modules so the
// UI and the API can never drift apart; the imports are type-only and erased
// at build time.
import type { AttentionItem } from "../src/attention.ts"
import type { FeatureSummary } from "../src/features.ts"
import type { GraphDetail, GraphNode } from "../src/graph.ts"
import type { Knowledge, KnowledgeGraph, KnowledgeGraphNode } from "../src/knowledge.ts"

export type { AttentionItem, FeatureSummary, GraphDetail, GraphNode, Knowledge, KnowledgeGraph, KnowledgeGraphNode }

const get = async <T>(path: string): Promise<T> => {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return (await res.json()) as T
}

export const fetchFeatures = () => get<FeatureSummary[]>("/api/features")

export const fetchGraph = (slug: string) => get<GraphDetail>(`/api/features/${encodeURIComponent(slug)}/graph`)

export const fetchAttention = () => get<AttentionItem[]>("/api/attention")
export const fetchKnowledge = () => get<Knowledge>("/api/knowledge")

export const fetchKnowledgeGraph = () => get<KnowledgeGraph>("/api/knowledge/graph")

export type QueryRow = Record<string, unknown>

// Read-only ad-hoc Cypher against one feature's store. Errors (invalid body,
// invalid Cypher, a rejected write, an unknown feature) surface the server's
// message so the UI can show it verbatim.
export const postQuery = async (slug: string, cypher: string): Promise<{ rows: QueryRow[] }> => {
  const res = await fetch(`/api/features/${encodeURIComponent(slug)}/query`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cypher }),
  })
  const body = (await res.json()) as { rows?: QueryRow[]; error?: string }
  if (!res.ok) throw new Error(body.error ?? `POST query failed: ${res.status}`)
  return { rows: body.rows ?? [] }
}
