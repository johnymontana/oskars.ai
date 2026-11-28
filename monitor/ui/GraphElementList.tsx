import { useId, useMemo, useState } from "react"
import type { StoreGraph } from "./api.ts"
import { graphElementNames } from "./graphElementNames.ts"

const PAGE_SIZE = 20

export function GraphElementList({
  graph,
  selectedId,
  onNodeClick,
  onRelClick,
}: {
  graph: StoreGraph
  selectedId: string | null
  onNodeClick?: (id: string, origin: HTMLButtonElement) => void
  onRelClick?: (id: string, origin: HTMLButtonElement) => void
}) {
  const searchId = useId()
  const [search, setSearch] = useState("")
  const [limit, setLimit] = useState(PAGE_SIZE)
  const entries = useMemo(() => {
    const names = graphElementNames(graph)
    return [
      ...graph.nodes.map((node) => ({
        id: node.id,
        name: names.get(node.id) ?? node.id,
        type: node.labels.join(", "),
        description: typeof node.properties.title === "string" ? node.properties.title : "",
        edge: false,
      })),
      ...graph.rels.map((rel) => ({
        id: rel.id,
        name: `${names.get(rel.from) ?? rel.from} → ${names.get(rel.to) ?? rel.to}`,
        type: rel.type,
        description: "",
        edge: true,
      })),
    ]
  }, [graph])
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const matches = entries.filter((entry) => {
    const text = `${entry.name} ${entry.type} ${entry.description}`.toLowerCase()
    return words.every((word) => text.includes(word))
  })

  return (
    <section className="graph-element-list" aria-label="Graph elements">
      <label htmlFor={searchId}>Find a graph element</label>
      <input
        id={searchId}
        type="search"
        value={search}
        placeholder="Search names or relationship types"
        onChange={(event) => {
          setSearch(event.target.value)
          setLimit(PAGE_SIZE)
        }}
      />
      <p className="text-dim" role="status">
        {matches.length === 0
          ? "No matching elements"
          : `Showing ${Math.min(limit, matches.length)} of ${matches.length} elements`}
      </p>
      {matches.length > 0 && (
        <ul>
          {matches.slice(0, limit).map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                aria-current={entry.id === selectedId || undefined}
                onClick={(event) => {
                  const inspect = entry.edge ? onRelClick : onNodeClick
                  inspect?.(entry.id, event.currentTarget)
                }}
              >
                <span>{entry.name}</span>
                <small>{entry.type}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {limit < matches.length && (
        <button type="button" className="graph-elements-more" onClick={() => setLimit(limit + PAGE_SIZE)}>
          Show more elements
        </button>
      )}
    </section>
  )
}
