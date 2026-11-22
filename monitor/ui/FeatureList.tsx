// Feature list view: one row per discovered gbuild store — project path,
// slug, destination, and per-status node counts. Polls /api/features.
import { fetchFeatures } from "./api.ts"
import { usePoll } from "./usePoll.ts"

export function FeatureList({ pollInterval }: { pollInterval?: number }) {
  const { data, error } = usePoll(fetchFeatures, pollInterval)
  if (error) return <p role="alert">failed to load features: {error}</p>
  if (!data) return <p>loading…</p>
  if (data.length === 0) return <p>no gbuild features found</p>
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
              <td>{f.project}</td>
              <td>
                <a href={`#/features/${encodeURIComponent(f.slug)}`}>{f.slug}</a>
              </td>
              <td>{f.destination}</td>
              <td>
                {Object.entries(f.status_counts)
                  .map(([status, count]) => `${status}: ${count}`)
                  .join(", ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
