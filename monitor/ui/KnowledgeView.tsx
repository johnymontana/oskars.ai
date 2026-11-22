// Knowledge view: the notes and symbols implementers left, across all
// discovered stores. Notes group by topic; symbols list name, file, purpose
// and the node that left them. A text search box filters both lists.
// Polls /api/knowledge.
import { useMemo, useState } from "react"
import { fetchKnowledge } from "./api.ts"
import { usePoll } from "./usePoll.ts"

export function KnowledgeView({ pollInterval }: { pollInterval?: number }) {
  const { data, error } = usePoll(fetchKnowledge, pollInterval)
  const [filter, setFilter] = useState("")
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
  if (error) return (
    <p role="alert" className="state state-error">
      failed to load knowledge: {error}
    </p>
  )
  if (!data) return <p className="state state-loading">loading…</p>
  return (
    <section>
      <h1>knowledge</h1>
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
                <li key={`${note.project}/${note.feature}/${note.by_node}/${note.text}`}>
                  {note.text}{" "}
                  <span className="text-dim">
                    — <span className="mono">{note.by_node}</span> ({note.project}/{note.feature})
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
              <tr key={`${s.project}/${s.feature}/${s.file}/${s.name}`}>
                <td className="mono">{s.name}</td>
                <td className="mono">{s.file}</td>
                <td>{s.purpose}</td>
                <td className="mono">{s.by_node}</td>
                <td className="mono">
                  {s.project}/{s.feature}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
