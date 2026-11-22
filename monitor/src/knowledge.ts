// GET /api/knowledge: the notes and symbols implementers left, across all
// discovered stores, each annotated with its project and feature slug.
// GET /api/knowledge/graph: the same reads as a graph — symbols merged by
// name+file across stores, notes individual and linked to shared topic hubs,
// one node per feature, and DEFINES/WROTE/ABOUT edges carrying project,
// feature and by_node provenance.
import type { MonitorConfig } from "./config.ts"
import { discoverStores } from "./discover.ts"
import { queryStore } from "./query.ts"

const NOTES_QUERY = `MATCH (n:Note)
RETURN n.topic AS topic, n.text AS text, n.by_node AS by_node
ORDER BY n.at, topic`

const SYMBOLS_QUERY = `MATCH (s:Symbol)
RETURN s.name AS name, s.file AS file, s.purpose AS purpose, s.by_node AS by_node
ORDER BY s.at, name`

export interface KnowledgeNote {
  topic: string
  text: string
  by_node: string
  project: string
  feature: string
}

export interface KnowledgeSymbol {
  name: string
  file: string
  purpose: string
  by_node: string
  project: string
  feature: string
}

export interface Knowledge {
  notes: KnowledgeNote[]
  symbols: KnowledgeSymbol[]
}

export async function listKnowledge(config: MonitorConfig): Promise<Knowledge> {
  const stores = await discoverStores(config.roots)
  const perStore = await Promise.all(
    stores.map(async (store): Promise<Knowledge> => {
      try {
        const noteRows = await queryStore(store.db, NOTES_QUERY)
        const symbolRows = await queryStore(store.db, SYMBOLS_QUERY)
        return {
          notes: noteRows.map((row) => ({
            topic: String(row.topic),
            text: String(row.text),
            by_node: String(row.by_node),
            project: store.project,
            feature: store.slug,
          })),
          symbols: symbolRows.map((row) => ({
            name: String(row.name),
            file: String(row.file),
            purpose: String(row.purpose),
            by_node: String(row.by_node),
            project: store.project,
            feature: store.slug,
          })),
        }
      } catch {
        return { notes: [], symbols: [] } // a store that fails to open is skipped
      }
    }),
  )
  return {
    notes: perStore.flatMap((k) => k.notes),
    symbols: perStore.flatMap((k) => k.symbols),
  }
}

export interface KnowledgeGraphNode {
  id: string
  labels: string[]
  properties: Record<string, unknown>
}

export interface KnowledgeGraphRel {
  id: string
  type: string
  from: string
  to: string
  properties: { project: string; feature: string; by_node: string }
}

export interface KnowledgeGraph {
  nodes: KnowledgeGraphNode[]
  rels: KnowledgeGraphRel[]
}

export async function knowledgeGraph(config: MonitorConfig): Promise<KnowledgeGraph> {
  const { notes, symbols } = await listKnowledge(config)
  const nodes = new Map<string, KnowledgeGraphNode>()
  const rels = new Map<string, KnowledgeGraphRel>()
  const addNode = (node: KnowledgeGraphNode) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node)
  }
  const featureNode = (project: string, feature: string): string => {
    const id = `Feature:${project}:${feature}`
    addNode({ id, labels: ["Feature"], properties: { project, feature } })
    return id
  }
  const addRel = (
    type: string,
    from: string,
    to: string,
    provenance: { project: string; feature: string; by_node: string },
  ) => {
    const id = `${type}:${from}->${to}:${provenance.by_node}`
    rels.set(id, {
      id,
      type,
      from,
      to,
      properties: { project: provenance.project, feature: provenance.feature, by_node: provenance.by_node },
    })
  }
  for (const symbol of symbols) {
    // name+file merges across stores; the first occurrence's purpose stands
    const id = `Symbol:${symbol.name}:${symbol.file}`
    addNode({ id, labels: ["Symbol"], properties: { name: symbol.name, file: symbol.file, purpose: symbol.purpose } })
    addRel("DEFINES", featureNode(symbol.project, symbol.feature), id, symbol)
  }
  for (const note of notes) {
    const noteId = `Note:${note.project}:${note.feature}:${note.topic}:${note.text}`
    addNode({ id: noteId, labels: ["Note"], properties: { topic: note.topic, text: note.text, by_node: note.by_node } })
    const topicId = `Topic:${note.topic}`
    addNode({ id: topicId, labels: ["Topic"], properties: { topic: note.topic } })
    addRel("WROTE", featureNode(note.project, note.feature), noteId, note)
    addRel("ABOUT", noteId, topicId, note)
  }
  const byId = <T extends { id: string }>(a: T, b: T) => a.id.localeCompare(b.id)
  return { nodes: [...nodes.values()].sort(byId), rels: [...rels.values()].sort(byId) }
}
