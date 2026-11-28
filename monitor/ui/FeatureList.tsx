import { fetchOverview } from "./api.ts"
import { AttentionTable } from "./AttentionView.tsx"
import { RefreshNotice } from "./RefreshNotice.tsx"
import { featureHref } from "./routes.ts"
import { StatusChip } from "./StatusChip.tsx"
import { usePoll } from "./usePoll.ts"

export function FeatureList({ pollInterval }: { pollInterval?: number }) {
  const { data, error, updatedAt } = usePoll(fetchOverview, pollInterval)
  if (!data) return error
    ? <RefreshNotice error={error} updatedAt={updatedAt} />
    : <p className="state state-loading">loading…</p>

  const { features, attention, diagnostics, observed_at } = data
  return (
    <>
      <RefreshNotice error={error} diagnostics={diagnostics} updatedAt={observed_at} />
      <section>
        <h2>needs attention</h2>
        <AttentionTable items={attention} incomplete={diagnostics.length > 0 || error !== null} />
      </section>
      <section>
        <h1>gbuild features</h1>
        {features.length === 0 ? (
          <p className="state state-empty">
            {diagnostics.length > 0 ? "no readable gbuild features found" : "no gbuild features found"}
          </p>
        ) : (
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
              {features.map((feature) => (
                <tr key={feature.store_id}>
                  <td className="mono">{feature.project}</td>
                  <td>
                    <a className="mono" href={featureHref(feature.store_id)}>{feature.slug}</a>
                  </td>
                  <td>{feature.destination}</td>
                  <td>
                    {Object.entries(feature.status_counts).map(([status, count]) => (
                      <StatusChip key={status} status={status}>
                        {status}: {count}
                      </StatusChip>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}
