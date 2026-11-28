// Render tests for the feature list: the landing list with status counts,
// polling re-fetch, and the needs-attention section — against a mocked fetch.
// Runs in jsdom (no vite needed):  node --import tsx --test monitor/test/features.test.tsx
import assert from "node:assert/strict"
import { describe, mock, test } from "node:test"
import { fetchCalls, OVERVIEW } from "./fixtures.ts"
import { act, render } from "./helpers.tsx"

const { FeatureList } = await import("../ui/FeatureList.tsx")

describe("feature list", () => {
  test("renders project, slug, destination and status counts", async () => {
    const { container, unmount } = await render(<FeatureList pollInterval={60_000} />)
    const text = container.textContent ?? ""
    for (const expected of [
      "/repo/project-one",
      "alpha",
      "Alpha feature done.",
      "completed: 1",
      "frontier: 1",
      "/repo/project-two",
      "beta",
      "in_progress: 1",
    ]) {
      assert.ok(text.includes(expected), `feature list should contain ${JSON.stringify(expected)}`)
    }
    const link = container.querySelector("a[href='#/features/store-alpha']")
    assert.ok(link, "slug links to the graph detail view")
    await unmount()
  })

  test("re-fetches on the poll interval without a reload", async () => {
    mock.timers.enable({ apis: ["setTimeout"] })
    try {
      const before = fetchCalls.filter((p) => p === "/api/overview").length
      const { unmount } = await render(<FeatureList pollInterval={3_000} />)
      const afterMount = fetchCalls.filter((p) => p === "/api/overview").length
      assert.equal(afterMount, before + 1, "fetches once on mount")
      await act(async () => {
        mock.timers.tick(3_000)
      })
      assert.equal(
        fetchCalls.filter((p) => p === "/api/overview").length,
        afterMount + 1,
        "re-fetches after one poll interval",
      )
      await unmount()
    } finally {
      mock.timers.reset()
    }
  })

  test("tops the landing with a needs-attention section linking to each feature", async () => {
    const { container, unmount } = await render(<FeatureList pollInterval={60_000} />)
    const text = container.textContent ?? ""
    for (const expected of ["needs attention", "b-use", "failed", "uses the value", "c-wire", "blocked", "b-prep"]) {
      assert.ok(text.includes(expected), `needs-attention section should contain ${JSON.stringify(expected)}`)
    }
    assert.ok(
      text.indexOf("needs attention") < text.indexOf("gbuild features"),
      "the needs-attention section renders above the feature list",
    )
    const section = container.querySelector("section")
    assert.ok(section?.querySelector("a[href='#/features/store-alpha?node=b-use']"), "attention item opens the failed alpha node")
    assert.ok(section?.querySelector("a[href='#/features/store-beta?node=c-wire']"), "attention item opens the blocked beta node")
    assert.ok(section?.querySelector(".status-chip[data-status='failed']"), "failed state uses the status chip")
    assert.ok(section?.querySelector(".status-chip[data-status='blocked']"), "blocked state uses the status chip")
    await unmount()
  })

  test("keeps the last snapshot when refresh fails and identifies partial data", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] })
    let unavailable = false
    t.mock.method(globalThis, "fetch", async () => {
      if (unavailable) return Response.json({ error: "temporary failure" }, { status: 503 })
      return Response.json({
        ...OVERVIEW,
        features: OVERVIEW.features.slice(0, 1),
        diagnostics: [{ project: "/repo/project-two", slug: "beta", message: "store unavailable" }],
      })
    })
    const { container, unmount } = await render(<FeatureList pollInterval={3_000} />)
    t.after(unmount)

    assert.match(container.textContent ?? "", /Some monitor data could not be loaded/)
    assert.match(container.textContent ?? "", /project-two \/ beta · store unavailable/)
    assert.match(container.textContent ?? "", /Alpha feature done/)
    unavailable = true
    await act(async () => { t.mock.timers.tick(3_000) })
    assert.match(container.textContent ?? "", /Refresh failed · temporary failure/)
    assert.match(container.textContent ?? "", /Alpha feature done/)
    assert.equal(container.querySelector("time")?.dateTime, OVERVIEW.observed_at)
  })

})
