// Query tab: an ad-hoc read-only Cypher console against one feature's store.
// Submits to POST /api/features/:slug/query and renders the returned rows as a
// table; rows carrying node/rel values (relate jsonl shape) additionally
// render as an NVL graph. Rejected statements show the server's error message.
import { useState } from "react"
import type { FormEvent } from "react"
import type { Layout } from "@neo4j-nvl/base"
import { postQuery } from "./api.ts"
import type { QueryRow } from "./api.ts"
import { GraphFrame } from "./GraphFrame.tsx"

// Node/rel values inside rows serialize the relate jsonl way:
// { id, kind: "node", labels, properties } and
// { id, kind: "relationship", type, start_node, end_node, properties }.
interface NodeValue {
  id: number
  kind: "node"
  labels: string[]
  properties: Record<string, unknown>
}
interface RelValue {
  id: number
  kind: "relationship"
  type: string
  start_node: number
  end_node: number
  properties: Record<string, unknown>
}

const isNode = (value: unknown): value is NodeValue =>
  typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === "node"
const isRel = (value: unknown): value is RelValue =>
  typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === "relationship"

const captionOf = (properties: Record<string, unknown>, fallback: number) => {
  for (const key of ["slug", "name", "title"]) {
    const value = properties[key]
    if (typeof value === "string" && value !== "") return value
  }
  return `#${fallback}`
}

const cellText = (value: unknown): string => {
  if (value === null || value === undefined) return "null"
  if (isNode(value)) return `${value.labels.map((label) => `:${label}`).join("")} ${captionOf(value.properties, value.id)}`
  if (isRel(value)) return `[:${value.type}] #${value.id}`
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

// Collects the node/rel values of every row into NVL nodes/rels. Rels whose
// endpoints were not returned as node values are dropped — NVL cannot draw an
// edge to a node it does not hold.
export const toResultGraph = (rows: QueryRow[]) => {
  const nodes = new Map<number, NodeValue>()
  const rels = new Map<number, RelValue>()
  for (const row of rows)
    for (const value of Object.values(row)) {
      if (isNode(value)) nodes.set(value.id, value)
      if (isRel(value)) rels.set(value.id, value)
    }
  return {
    nodes: [...nodes.values()].map((n) => ({ id: String(n.id), caption: captionOf(n.properties, n.id) })),
    rels: [...rels.values()]
      .filter((r) => nodes.has(r.start_node) && nodes.has(r.end_node))
      .map((r) => ({ id: String(r.id), from: String(r.start_node), to: String(r.end_node), caption: r.type })),
  }
}

export function QueryTab({ slug }: { slug: string }) {
  const [cypher, setCypher] = useState("")
  const [rows, setRows] = useState<QueryRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [layout, setLayout] = useState<Layout>("forceDirected")

  const run = async (event: FormEvent) => {
    event.preventDefault()
    setRunning(true)
    setError(null)
    try {
      setRows((await postQuery(slug, cypher)).rows)
    } catch (cause) {
      setRows(null)
      setError((cause as Error).message)
    } finally {
      setRunning(false)
    }
  }

  const columns = rows ? [...new Set(rows.flatMap((row) => Object.keys(row)))] : []
  const graph = rows ? toResultGraph(rows) : { nodes: [], rels: [] }

  return (
    <section className="query-console">
      <form onSubmit={run}>
        <textarea
          aria-label="Cypher"
          className="mono"
          rows={4}
          placeholder="MATCH (n:Node) RETURN n.slug, n.status"
          value={cypher}
          onChange={(event) => setCypher(event.target.value)}
        />
        <button type="submit" disabled={running}>
          {running ? "running…" : "run query"}
        </button>
      </form>
      {error && (
        <p role="alert" className="state state-error">
          {error}
        </p>
      )}
      {rows && rows.length === 0 && <p className="state state-empty">no rows returned</p>}
      {rows && rows.length > 0 && (
        <table className="query-results">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column}>{cellText(row[column])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {(graph.nodes.length > 0 || graph.rels.length > 0) && (
        <GraphFrame nodes={graph.nodes} rels={graph.rels} layout={layout} onLayoutChange={setLayout} height={320} />
      )}
    </section>
  )
}
