// Node detail side panel: everything the store knows about one gbuild node —
// properties, acceptance criteria, input/output field values, review history,
// and the notes/symbols the node left. Opened by clicking a graph node or a
// wave-list entry; closed via the close button, Esc, or canvas double-click.
import type { Ref } from "react"
import type { FieldValue, GraphNode } from "../src/graph.ts"
import type { KnowledgeNote, KnowledgeSymbol } from "../src/knowledge.ts"
import { StatusChip } from "./StatusChip.tsx"
import { formatValue } from "./format.ts"

// Human-readable run duration from the ISO timestamps, e.g. "3m 5s".
export const formatDuration = (startedAt: string | null, completedAt: string | null) => {
  if (!startedAt || !completedAt) return "—"
  const ms = Date.parse(completedAt) - Date.parse(startedAt)
  if (Number.isNaN(ms) || ms < 0) return "—"
  const s = Math.round(ms / 1000)
  const parts: string[] = []
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) parts.push(`${h}h`)
  if (h > 0 || m > 0) parts.push(`${m}m`)
  parts.push(`${s % 60}s`)
  return parts.join(" ")
}

export function FieldList({ title, fields }: { title: string; fields: FieldValue[] }) {
  if (fields.length === 0) return null
  return (
    <div>
      <h4>{title}</h4>
      <ul>
        {fields.map((f) => (
          <li key={f.name}>
            <code>{f.name}</code> {f.shape}
            {f.from ? ` (from ${f.from})` : ""}: <code>{formatValue(f.value)}</code>
          </li>
        ))}
      </ul>
    </div>
  )
}

export interface NodePanelProps {
  node: GraphNode
  notes: KnowledgeNote[]
  symbols: KnowledgeSymbol[]
  onClose: () => void
  headingRef?: Ref<HTMLHeadingElement>
}

export function NodePanel({ node, notes, symbols, onClose, headingRef }: NodePanelProps) {
  const startedAt = node.status === "in_progress" ? node.active_attempt?.started_at ?? null : node.started_at
  const completedAt = node.status === "in_progress" ? node.active_attempt?.completed_at ?? null : node.completed_at
  return (
    <aside className="node-panel" aria-label={`node ${node.slug}`}>
      <button type="button" className="node-panel-close" aria-label="close panel" onClick={onClose}>
        ×
      </button>
      <h2 tabIndex={-1} ref={headingRef}>
        <span className="mono">{node.slug}</span> <StatusChip status={node.status} />
      </h2>
      <p>{node.title}</p>
      <dl>
        <dt>type</dt>
        <dd>{node.type}</dd>
        <dt>wave</dt>
        <dd>{node.wave}</dd>
        <dt>model tier</dt>
        <dd className="mono">{node.model_tier}</dd>
        <dt>failure policy</dt>
        <dd className="mono">{node.failure_policy}</dd>
        <dt>started</dt>
        <dd className="mono">{startedAt ?? "—"}</dd>
        <dt>completed</dt>
        <dd className="mono">{completedAt ?? "—"}</dd>
        <dt>duration</dt>
        <dd className="mono">{formatDuration(startedAt, completedAt)}</dd>
      </dl>
      {node.acceptance.length > 0 && (
        <div>
          <h4>acceptance</h4>
          <ul>
            {node.acceptance.map((criterion) => (
              <li key={criterion}>{criterion}</li>
            ))}
          </ul>
        </div>
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
                {r.checklist.length > 0 && (
                  <ul>
                    {r.checklist.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {notes.length > 0 && (
        <div>
          <h4>notes</h4>
          <ul>
            {notes.map((note, i) => (
              <li key={i}>
                <strong>{note.topic}</strong>: {note.text}
              </li>
            ))}
          </ul>
        </div>
      )}
      {symbols.length > 0 && (
        <div>
          <h4>symbols</h4>
          <ul>
            {symbols.map((symbol) => (
              <li key={symbol.name}>
                <code>{symbol.name}</code> (<span className="mono">{symbol.file}</span>) — {symbol.purpose}
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  )
}
