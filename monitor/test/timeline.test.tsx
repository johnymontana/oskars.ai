// Render tests for the timeline tab: run bars on a shared time axis, and the
// tab-scoped store-graph fetch — against a mocked fetch.
// Runs in jsdom (no vite needed):  node --import tsx --test monitor/test/timeline.test.tsx
import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { fetchCalls } from "./fixtures.ts"
import { act, render } from "./helpers.tsx"

const { GraphDetail } = await import("../ui/GraphDetail.tsx")
const { TimelineTab } = await import("../ui/TimelineTab.tsx")

describe("timeline tab", () => {
  test("does not fetch the store graph", async () => {
    const storeGraphCalls = () => fetchCalls.filter((p) => p === "/api/features/alpha/store-graph").length
    const before = storeGraphCalls()
    const { container, unmount } = await render(<GraphDetail slug="alpha" tab="timeline" pollInterval={60_000} />)
    assert.ok(container.querySelector(".timeline-bar"), "timeline tab renders the run bars")
    assert.equal(storeGraphCalls(), before, "the timeline tab does not fetch the store graph")
    await unmount()
  })

  test("positions bars on a shared time axis with durations and idle gaps visible", async () => {
    const nodes = [
      { slug: "a-first", status: "completed", started_at: "2026-01-01T00:00:00Z", completed_at: "2026-01-01T00:10:00Z" },
      { slug: "b-second", status: "completed", started_at: "2026-01-01T00:20:00Z", completed_at: "2026-01-01T00:30:00Z" },
      { slug: "c-waiting", status: "frontier", started_at: null, completed_at: null },
    ] as any
    const { container, unmount } = await render(<TimelineTab nodes={nodes} />)
    const bars = [...container.querySelectorAll(".timeline-bar")] as HTMLElement[]
    assert.equal(bars.length, 2, "one bar per started node")
    const firstEnd = parseFloat(bars[0]!.style.left) + parseFloat(bars[0]!.style.width)
    assert.equal(parseFloat(bars[0]!.style.left), 0, "first bar starts at the axis origin")
    assert.ok(
      parseFloat(bars[1]!.style.left) - firstEnd > 30,
      "the idle gap between the two runs is visible on the shared axis",
    )
    const text = container.textContent ?? ""
    assert.ok(text.includes("10m 0s"), "bars show run durations")
    assert.ok(
      text.includes("2026-01-01T00:00:00.000Z") && text.includes("2026-01-01T00:30:00.000Z"),
      "axis shows the time range",
    )
    assert.ok(text.includes("not started") && text.includes("c-waiting"), "unstarted nodes are listed")
    await unmount()
  })

  test("distinguishes legacy running nodes, queued workers, and pending nodes", async () => {
    const nodes = [
      { slug: "legacy-running", status: "in_progress", started_at: null, completed_at: null },
      {
        slug: "claimed-worker", status: "in_progress", started_at: null, completed_at: null,
        active_attempt: { started_at: null, completed_at: null },
      },
      { slug: "pending", status: "blocked", started_at: null, completed_at: null },
    ] as any
    const { container, unmount } = await render(<TimelineTab nodes={nodes} />)
    assert.equal(container.querySelectorAll(".timeline-bar").length, 0)
    assert.match(container.textContent ?? "", /Store reports in progress · start time unavailable: legacy-running/)
    assert.match(container.textContent ?? "", /Queued · waiting for worker start signal: claimed-worker/)
    assert.match(container.textContent ?? "", /not started: pending/)
    await unmount()
  })

  test("active bars advance with the clock while completed implementations hold their duration", async (t) => {
    t.mock.timers.enable({ apis: ["Date", "setInterval"], now: new Date("2026-01-01T00:00:30Z") })
    const nodes = [
      {
        slug: "active-worker", status: "in_progress", started_at: null, completed_at: null,
        active_attempt: { started_at: "2026-01-01T00:00:20Z", completed_at: null },
      },
      {
        slug: "reviewing-worker", status: "in_progress", started_at: null, completed_at: null,
        active_attempt: { started_at: "2026-01-01T00:00:00Z", completed_at: "2026-01-01T00:00:15Z" },
      },
      { slug: "done", status: "completed", started_at: "2026-01-01T00:00:01Z", completed_at: "2026-01-01T00:00:05Z" },
    ] as any
    const { container, unmount } = await render(<TimelineTab nodes={nodes} />)
    const duration = (slug: string) => [...container.querySelectorAll(".timeline-row")]
      .find((r) => r.querySelector(".timeline-label")?.textContent?.startsWith(slug))
      ?.querySelector(".timeline-bar")?.textContent
    assert.equal(duration("active-worker"), "10s")
    assert.equal(duration("reviewing-worker"), "15s")
    assert.equal(duration("done"), "4s")
    await act(async () => t.mock.timers.tick(4_000))
    assert.equal(duration("active-worker"), "14s")
    assert.equal(duration("reviewing-worker"), "15s")
    assert.equal(duration("done"), "4s")
    await unmount()
  })
})
