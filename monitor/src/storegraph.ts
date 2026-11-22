// GET /api/features/:slug/store-graph: every element of one store as raw graph
// elements — nodes: [{ id, labels, properties }], rels: [{ id, type, from, to,
// properties }]. Element ids are deterministic, built from each label's
// identifying properties (slug for GbuildNode, id for Acceptance, owner+name+
// direction for Field, node+attempt for Review, node+topic+text for Note,
// node+name for Symbol, feature for Feature) — stable across polls without
// relying on engine-internal ids. A Field or Review missing its owning
// GbuildNode edge (INPUT/OUTPUT/REVIEWED) means a broken store: storeGraph
// fails with an explicit error rather than producing an id embedding
// "undefined". Nodes and rels come back sorted by id.
import type { Store } from "./discover.ts"
import { queryStore } from "./query.ts"

const NODES_QUERY = `MATCH (n) RETURN n`
const RELS_QUERY = `MATCH ()-[r]->() RETURN r`

export interface StoreGraphNode {
  id: string
  labels: string[]
  properties: Record<string, unknown>
}

export interface StoreGraphRel {
  id: string
  type: string
  from: string
  to: string
  properties: Record<string, unknown>
}

export interface StoreGraph {
  nodes: StoreGraphNode[]
  rels: StoreGraphRel[]
}

// An element as relate serializes it in --mode jsonl: engine-internal id,
// labels/properties for a node, type/start_node/end_node/properties for a rel.
interface RawNode {
  id: number
  labels: string[]
  properties: Record<string, unknown>
}

interface RawRel {
  type: string
  start_node: number
  end_node: number
  properties: Record<string, unknown>
}

export async function storeGraph(store: Store): Promise<StoreGraph> {
  const [nodeRows, relRows] = await Promise.all([queryStore(store.db, NODES_QUERY), queryStore(store.db, RELS_QUERY)])
  const rawNodes = nodeRows.map((row) => row.n as RawNode)
  const rawRels = relRows.map((row) => row.r as RawRel)
  const byInternalId = new Map(rawNodes.map((n) => [n.id, n]))

  // A Field's owner+direction and a Review's owner come from the incoming
  // INPUT/OUTPUT/REVIEWED edge of their GbuildNode.
  const fieldContext = new Map<number, { owner: string; direction: string }>()
  const reviewOwner = new Map<number, string>()
  for (const rel of rawRels) {
    const owner = byInternalId.get(rel.start_node)?.properties.slug
    if (owner == null) continue
    if (rel.type === "INPUT" || rel.type === "OUTPUT")
      fieldContext.set(rel.end_node, { owner: String(owner), direction: rel.type.toLowerCase() })
    if (rel.type === "REVIEWED") reviewOwner.set(rel.end_node, String(owner))
  }

  const nodeId = (node: RawNode): string => {
    const p = node.properties
    if (node.labels.includes("GbuildNode")) return `GbuildNode:${p.slug}`
    if (node.labels.includes("Acceptance")) return `Acceptance:${p.id}`
    if (node.labels.includes("Feature")) return `Feature:${p.feature}`
    if (node.labels.includes("Field")) {
      const ctx = fieldContext.get(node.id)
      if (!ctx) throw new Error(`Field "${String(p.name)}" has no INPUT/OUTPUT edge from an owning GbuildNode`)
      return `Field:${ctx.owner}:${ctx.direction}:${p.name}`
    }
    if (node.labels.includes("Review")) {
      const owner = reviewOwner.get(node.id)
      if (owner == null)
        throw new Error(`Review attempt ${String(p.attempt)} has no REVIEWED edge from an owning GbuildNode`)
      return `Review:${owner}:${p.attempt}`
    }
    if (node.labels.includes("Note")) return `Note:${p.by_node}:${p.topic}:${p.text}`
    if (node.labels.includes("Symbol")) return `Symbol:${p.by_node}:${p.name}`
    return `Node:${node.id}` // a label outside the gbuild schema — engine id as last resort
  }

  const ids = new Map<number, string>()
  const nodes: StoreGraphNode[] = rawNodes
    .map((n) => {
      const id = nodeId(n)
      ids.set(n.id, id)
      return { id, labels: n.labels, properties: n.properties }
    })
    .sort((a, b) => a.id.localeCompare(b.id))
  const rels: StoreGraphRel[] = rawRels
    .flatMap((r) => {
      const from = ids.get(r.start_node)
      const to = ids.get(r.end_node)
      if (from == null || to == null) return [] // an endpoint outside the node set — shouldn't happen
      return [{ id: `${r.type}:${from}->${to}`, type: r.type, from, to, properties: r.properties }]
    })
    .sort((a, b) => a.id.localeCompare(b.id))
  return { nodes, rels }
}
