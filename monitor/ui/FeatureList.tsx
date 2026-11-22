// Feature list view: one row per discovered gbuild store — project path,
// slug, destination, and per-status node counts. Polls /api/features.
import { fetchFeatures } from "./api.ts"
import { StatusChip } from "./StatusChip.tsx"
import { usePoll } from "./usePoll.ts"

export function FeatureList({ pollInterval }: { pollInterval?: number }) {
  const { data, error } = usePoll(fetchFeatures, pollInterval)
  if (error) return (
    <p role="alert" className="state state-error">
      failed to load features: {error}
    </p>
  )
  if (!data) return <p className="state state-loading">loading…</p>
  if (data.length === 0) return <p className="state state-empty">no gbuild features found</p>
  return (
    <section>
      <h1>gbuild features</h1>
      <table>
        <thead>
          <tr>
            <th>project</th>
            <th>slug</th>
            <th>destination</th>
            <th>status</th>
          </tr>
        </thead>
        <tbody>
          {data.map((f) => (
            <tr key={`${f.project}/${f.slug}`}>
              <td className="mono">{f.project}</td>
              <td>
                <a className="mono" href={`#/features/${encodeURIComponent(f.slug)}`}>
                  {f.slug}
                </a>
              </td>
              <td>{f.destination}</td>
              <td>
                {Object.entries(f.status_counts).map(([status, count]) => (
                  <StatusChip key={status} status={status}>
                    {status}: {count}
                  </StatusChip>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
