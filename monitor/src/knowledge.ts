// GET /api/knowledge: the notes and symbols implementers left, across all
// discovered stores, each annotated with its project and feature slug.
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
