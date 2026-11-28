import type { Overview } from "../src/overview.ts"
import { fetchOverview } from "./api.ts"
import { RefreshNotice } from "./RefreshNotice.tsx"
import { featureHref, inSampleWorkspace } from "./routes.ts"
import { StatusChip, statusLabel } from "./StatusChip.tsx"
import { usePoll } from "./usePoll.ts"

function AttentionSummary({ items }: { items: Overview["attention"] }) {
  const failures = items.filter((item) => item.state === "failed")
    .sort((a, b) => b.blocked_count - a.blocked_count || a.node.localeCompare(b.node))
  const blockedByFailure = items.filter((item) => item.state === "blocked" && item.blocking_failures.length > 0)
  const waiting = items.filter((item) => item.state === "blocked" && !item.blocking_failures.length)
  if (items.length === 0) return null

  return (
    <section aria-labelledby="attention-summary">
      <h2 id="attention-summary">Needs attention</h2>
      <p>
        {failures.length} {failures.length === 1 ? "failure" : "failures"}
        {" · "}{blockedByFailure.length} waiting on failures
        {" · "}{waiting.length} waiting on other tasks
      </p>
      {failures.length > 0 && (
        <ul className="attention-shortlist">
          {failures.slice(0, 3).map((failure) => (
            <li key={JSON.stringify([failure.store_id, failure.node])}>
              <a href={featureHref(failure.store_id, "graph", failure.node)}>{failure.node}</a>
              {" "}<span className="text-dim">· {failure.feature} · blocks {failure.blocked_count}</span>
            </li>
          ))}
        </ul>
      )}
      <p><a href="#/attention">View all attention items</a></p>
    </section>
  )
}

function GetStarted({ scope, hasDiagnostics }: { scope?: Overview["scope"]; hasDiagnostics: boolean }) {
  if (inSampleWorkspace()) return <p className="state state-empty">The sample run is unavailable. Refresh to try again.</p>

  const hasSource = Boolean(scope?.project || scope?.roots.length)
  return (
    <section className="onboarding-panel" aria-labelledby="getting-started">
      <h2 id="getting-started">
        {hasDiagnostics ? "Check the project paths" : hasSource ? "No gbuild runs found yet" : "Choose a project or try a sample"}
      </h2>
      {hasDiagnostics ? (
        <p>Review the paths reported above. Restart the monitor with the corrected config or a Git checkout path.</p>
      ) : hasSource ? (
        <p>
          Run the <a href="https://github.com/oskarhane/oskars.ai/tree/main/plugins/gbuild#usage">gbuild plan skill</a> in
          a project in scope. The monitor will show the run when its graph is ready.
        </p>
      ) : (
        <p>To inspect your own run, start the monitor with the path to its Git checkout or worktree.</p>
      )}
      {(!hasSource || hasDiagnostics) && (
        <pre className="onboarding-command">npm start --prefix monitor -- --project /path/to/checkout</pre>
      )}
      <a className="monitor-action" href="/sample/">Try a sample run</a>
    </section>
  )
}

export function FeatureList({ pollInterval }: { pollInterval?: number }) {
  const { data, error, updatedAt } = usePoll(fetchOverview, pollInterval)
  const sample = inSampleWorkspace()
  const scope = data?.scope

  return (
    <>
      <h1>gbuild features</h1>
      <p>Read-only monitor for gbuild plans, task progress, and review results from local repositories.</p>
      <RefreshNotice error={error} diagnostics={data?.diagnostics} updatedAt={data?.observed_at ?? updatedAt} />
      {!data ? (!error && <p className="state state-loading">Loading features…</p>) : (
        <>
          {!error && !data.diagnostics.length && (
            <p className="text-dim">
              Last refreshed <time dateTime={data.observed_at}>{new Date(data.observed_at).toLocaleTimeString()}</time>
            </p>
          )}
          {!sample && (scope?.project || Boolean(scope?.roots.length)) && (
            <details className="scan-details">
              <summary>Where the monitor looks</summary>
              {scope?.project && <p>Project <code>{scope.project}</code></p>}
              {scope && scope.roots.length > 0 && (
                <ul>{scope.roots.map((root) => <li key={root}><code>{root}</code></li>)}</ul>
              )}
            </details>
          )}
          {data.features.length === 0 ? (
            <GetStarted scope={scope} hasDiagnostics={data.diagnostics.length > 0} />
          ) : (
            <section aria-label="Features">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr><th>Feature</th><th>Project</th><th>Goal</th><th>Progress</th></tr>
                  </thead>
                  <tbody>
                    {data.features.map((feature) => (
                      <tr key={feature.store_id}>
                        <td><a className="mono" href={featureHref(feature.store_id, "overview")}>{feature.slug}</a></td>
                        <td className="mono feature-project">{feature.project}</td>
                        <td>{feature.destination}</td>
                        <td>
                          {Object.entries(feature.status_counts).map(([status, count]) => (
                            <StatusChip key={status} status={status}>{statusLabel(status)}: {count}</StatusChip>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!sample && <p><a href="/sample/">Try a sample run</a></p>}
            </section>
          )}
          <AttentionSummary items={data.attention} />
        </>
      )}
    </>
  )
}
