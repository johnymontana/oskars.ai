// Knowledge view: the notes and symbols implementers left, across all
// discovered stores. Topped by the cross-store knowledge graph (NVL, force-
// directed): symbols merged by name+file across stores, edged to every
// defining feature, and notes linked through shared topic hubs. Below it the
// filterable lists: notes group by topic; symbols list name, file, purpose
// and the node that left them. A text search box filters both lists.
// Polls /api/knowledge and /api/knowledge/graph.
import { useMemo, useState } from "react"
import type { Layout } from "@neo4j-nvl/base"
import { fetchKnowledge, fetchKnowledgeGraph } from "./api.ts"
import type { KnowledgeGraph, KnowledgeGraphNode } from "./api.ts"
import { statusColor } from "./colors.ts"
import { GraphFrame } from "./GraphFrame.tsx"
import { RefreshNotice } from "./RefreshNotice.tsx"
import { featureHref } from "./routes.ts"
import { usePoll } from "./usePoll.ts"

// Node colors keyed by label, from the status palette (the one color
// language): features are frontier blue, symbols completed green, notes
// in-progress amber, topic hubs blocked gray; edges are dim.
const LABEL_COLORS: Record<string, string> = {
  Feature: statusColor("frontier"),
  Symbol: statusColor("completed"),
  Note: statusColor("in_progress"),
  Topic: statusColor("blocked"),
}

const caption = (node: KnowledgeGraphNode): string => {
  const props = node.properties as { name?: string; topic?: string; feature?: string; text?: string }
  return props.name ?? props.topic ?? props.feature ?? (props.text ?? "").slice(0, 60)
}

export const toNvlKnowledgeGraph = (graph: KnowledgeGraph) => ({
  nodes: graph.nodes.map((n) => ({
    id: n.id,
    caption: caption(n),
    color: LABEL_COLORS[n.labels[0] ?? ""] ?? statusColor("blocked"),
  })),
  rels: graph.rels.map((r) => ({ id: r.id, from: r.from, to: r.to, color: statusColor("blocked") })),
})

export function KnowledgeView({ pollInterval }: { pollInterval?: number }) {
  const { data, error, updatedAt } = usePoll(fetchKnowledge, pollInterval)
  const { data: graph, error: graphError, updatedAt: graphUpdatedAt } = usePoll(fetchKnowledgeGraph, pollInterval)
  const [filter, setFilter] = useState("")
  const [layout, setLayout] = useState<Layout>("forceDirected")
  const nvlGraph = useMemo(() => (graph ? toNvlKnowledgeGraph(graph) : null), [graph])
  const notesByTopic = useMemo(() => {
    const query = filter.trim().toLowerCase()
    const groups = new Map<string, NonNullable<typeof data>["notes"]>()
    for (const note of data?.notes ?? []) {
      if (query && ![note.topic, note.text, note.by_node, note.project, note.feature].some((f) => f.toLowerCase().includes(query)))
        continue
      const group = groups.get(note.topic) ?? []
      group.push(note)
      groups.set(note.topic, group)
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [data, filter])
  const symbols = useMemo(() => {
    const query = filter.trim().toLowerCase()
    return (data?.symbols ?? []).filter(
      (s) =>
        !query ||
        [s.name, s.file, s.purpose, s.by_node, s.project, s.feature].some((f) => f.toLowerCase().includes(query)),
    )
  }, [data, filter])
  if (!data) return error
    ? <RefreshNotice error={error} updatedAt={updatedAt} />
    : <p className="state state-loading">loading…</p>
  return (
    <section>
      <h1>knowledge</h1>
      <RefreshNotice error={error} updatedAt={updatedAt} />
      <RefreshNotice error={graphError} updatedAt={graphUpdatedAt} />
      {nvlGraph && nvlGraph.nodes.length > 0 && (
        <GraphFrame
          nodes={nvlGraph.nodes}
          rels={nvlGraph.rels}
          layout={layout}
          onLayoutChange={setLayout}
          mouseEventCallbacks={{
            onZoomAndPan: true,
            onNodeClick: ({ id }: { id: string }) => {
              const feature = graph?.nodes.find((node) => node.id === id && node.labels.includes("Feature"))
              const storeId = feature?.properties.store_id
              if (typeof storeId === "string") window.location.hash = featureHref(storeId)
            },
          }}
        />
      )}
      <p>
        <input
          type="search"
          placeholder="filter notes and symbols…"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          aria-label="filter knowledge"
        />
      </p>
      <h2>notes</h2>
      {notesByTopic.length === 0 ? (
        <p className="state state-empty">no notes match</p>
      ) : (
        notesByTopic.map(([topic, notes]) => (
          <section key={topic}>
            <h3>{topic}</h3>
            <ul>
              {notes.map((note) => (
                <li key={`${note.store_id}/${note.by_node}/${note.text}`}>
                  {note.text}{" "}
                  <span className="text-dim">
                    — <span className="mono">{note.by_node}</span> (<a href={featureHref(note.store_id, "graph", note.by_node)}>{note.project}/{note.feature}</a>)
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <h2>symbols</h2>
      {symbols.length === 0 ? (
        <p className="state state-empty">no symbols match</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>name</th>
              <th>file</th>
              <th>purpose</th>
              <th>by</th>
              <th>project / feature</th>
            </tr>
          </thead>
          <tbody>
            {symbols.map((s) => (
              <tr key={`${s.store_id}/${s.file}/${s.name}`}>
                <td className="mono">{s.name}</td>
                <td className="mono">{s.file}</td>
                <td>{s.purpose}</td>
                <td className="mono">{s.by_node}</td>
                <td className="mono">
                  <a href={featureHref(s.store_id, "graph", s.by_node)}>{s.project}/{s.feature}</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
