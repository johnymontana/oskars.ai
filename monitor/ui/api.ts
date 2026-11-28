// Client for the monitor REST API. Types come from the server modules so the
// UI and the API can never drift apart; the imports are type-only and erased
// at build time.
import type { AttentionItem } from "../src/attention.ts"
import type { FeatureSummary } from "../src/features.ts"
import type { GraphDetail, GraphNode } from "../src/graph.ts"
import type { Knowledge, KnowledgeGraph, KnowledgeGraphNode } from "../src/knowledge.ts"
import type { Overview } from "../src/overview.ts"
import type { StoreGraph, StoreGraphNode, StoreGraphRel } from "../src/storegraph.ts"

export type { AttentionItem, FeatureSummary, GraphDetail, GraphNode, Knowledge, KnowledgeGraph, KnowledgeGraphNode, StoreGraph, StoreGraphNode, StoreGraphRel }

type StoreMatch = { store_id: string; project: string; slug: string }

export class AmbiguousStoreError extends Error {
  constructor(message: string, readonly matches: StoreMatch[]) {
    super(message)
  }
}

const get = async <T>(path: string, signal?: AbortSignal): Promise<T> => {
  const res = await fetch(path, { signal })
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string; matches?: StoreMatch[] } | null
    const message = body?.error ?? "GET " + path + " failed: " + res.status
    if (res.status === 409 && body?.matches) throw new AmbiguousStoreError(message, body.matches)
    throw new Error(message)
  }
  return (await res.json()) as T
}

export const fetchOverview = (signal?: AbortSignal) => get<Overview>("/api/overview", signal)
export const fetchGraph = (storeRef: string, signal?: AbortSignal) =>
  get<GraphDetail>("/api/features/" + encodeURIComponent(storeRef) + "/graph", signal)

export const fetchStoreGraph = (storeRef: string, signal?: AbortSignal) =>
  get<StoreGraph>("/api/features/" + encodeURIComponent(storeRef) + "/store-graph", signal)

export const fetchKnowledge = (signal?: AbortSignal) => get<Knowledge>("/api/knowledge", signal)
export const fetchKnowledgeGraph = (signal?: AbortSignal) => get<KnowledgeGraph>("/api/knowledge/graph", signal)

export type QueryRow = Record<string, unknown>

export interface QueryResult {
  rows: QueryRow[]
  truncated: boolean
  limit: number
}

export const postQuery = async (storeRef: string, cypher: string, signal?: AbortSignal): Promise<QueryResult> => {
  const res = await fetch(`/api/features/${encodeURIComponent(storeRef)}/query`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cypher }),
    signal,
  })
  const body = (await res.json()) as Partial<QueryResult> & { error?: string }
  if (!res.ok) throw new Error(body.error ?? `POST query failed: ${res.status}`)
  return { rows: body.rows ?? [], truncated: body.truncated ?? false, limit: body.limit ?? 500 }
}
