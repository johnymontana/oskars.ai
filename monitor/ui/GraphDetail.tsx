// Graph detail view: the NVL dependency graph plus the node list grouped by
// wave. Per node it shows status, acceptance criteria, input/output field
// values, and review verdicts. Polls /api/features/:slug/graph.
import type { FieldValue, GraphNode } from "../src/graph.ts"
import { fetchGraph } from "./api.ts"
import { NvlGraph } from "./NvlGraph.tsx"
import { usePoll } from "./usePoll.ts"

const formatValue = (value: unknown) => (value === null || value === undefined ? "—" : JSON.stringify(value))

function FieldList({ title, fields }: { title: string; fields: FieldValue[] }) {
  if (fields.length === 0) return null
  return (
    <div>
      <h4>{title}</h4>
      <ul>
        {fields.map((f) => (
          <li key={f.name}>
            <code>{f.name}</code> {f.shape}
            {f.from ? ` (from ${f.from})` : ""}: {formatValue(f.value)}
          </li>
        ))}
      </ul>
    </div>
  )
}

function NodeCard({ node }: { node: GraphNode }) {
  return (
    <article>
      <h3>
        {node.slug} — {node.title} [{node.type}] <strong>{node.status}</strong>
      </h3>
      {node.acceptance.length > 0 && (
        <ul>
          {node.acceptance.map((criterion) => (
            <li key={criterion}>{criterion}</li>
          ))}
        </ul>
      )}
      <FieldList title="inputs" fields={node.inputs} />
      <FieldList title="outputs" fields={node.outputs} />
      {node.reviews.length > 0 && (
        <div>
          <h4>reviews</h4>
          <ul>
            {node.reviews.map((r) => (
              <li key={r.attempt}>
                attempt {r.attempt}: {r.verdict} ({r.at})
                {r.failed_criteria.length > 0 && ` — failed: ${r.failed_criteria.join("; ")}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  )
}

export function GraphDetail({ slug, pollInterval }: { slug: string; pollInterval?: number }) {
  const { data, error } = usePoll(() => fetchGraph(slug), pollInterval)
  if (error) return <p role="alert">failed to load graph: {error}</p>
  if (!data) return <p>loading…</p>
  const waves = new Map<number, GraphNode[]>()
  for (const node of data.nodes) {
    const group = waves.get(node.wave) ?? []
    group.push(node)
    waves.set(node.wave, group)
  }
  return (
    <section>
      <h1>{data.slug}</h1>
      <p>
        {data.project} — {data.destination}
      </p>
      <p>
        <a href="#/">← all features</a>
      </p>
      <NvlGraph nodes={data.nodes} />
      {[...waves.entries()]
        .sort(([a], [b]) => a - b)
        .map(([wave, nodes]) => (
          <section key={wave}>
            <h2>wave {wave}</h2>
            {nodes.map((node) => (
              <NodeCard key={node.slug} node={node} />
            ))}
          </section>
        ))}
    </section>
  )
}
