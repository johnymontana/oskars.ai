import type { MonitorDiagnostic } from "../src/overview.ts"

export function RefreshNotice({
  error,
  updatedAt,
  diagnostics = [],
}: {
  error: Error | null
  updatedAt: string | null
  diagnostics?: MonitorDiagnostic[]
}) {
  if (!error && diagnostics.length === 0) return null

  return (
    <div className="state state-error" role="status">
      {error && <p>Refresh failed · {error.message}</p>}
      {diagnostics.length > 0 && (
        <>
          <p>Some monitor data could not be loaded.</p>
          <ul>
            {diagnostics.map(({ root, project, store_id, slug, message }) => (
              <li key={JSON.stringify([root, project, store_id, slug, message])}>
                {[project ?? root, slug].filter(Boolean).join(" / ")} · {message}
              </li>
            ))}
          </ul>
        </>
      )}
      {updatedAt && <p>{diagnostics.length ? "Available data captured" : "Last successful refresh"} <time dateTime={updatedAt}>{new Date(updatedAt).toLocaleString()}</time></p>}
    </div>
  )
}
