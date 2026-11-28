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
      "Completed: 1",
      "Ready: 1",
      "/repo/project-two",
      "beta",
      "In progress: 1",
    ]) {
      assert.ok(text.includes(expected), `feature list should contain ${JSON.stringify(expected)}`)
    }
    const link = container.querySelector("a[href='#/features/store-alpha/overview']")
    assert.ok(link, "slug links to the feature overview")
    assert.match(container.querySelector("details")?.textContent ?? "", /Where the monitor looks\/repo/)
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

  test("shows features before a compact attention summary with direct failure links", async () => {
    const { container, unmount } = await render(<FeatureList pollInterval={60_000} />)
    const text = container.textContent ?? ""
    for (const expected of ["Needs attention", "b-use", "1 failure", "1 waiting on failures", "1 waiting on other tasks"]) {
      assert.ok(text.includes(expected), `needs-attention section should contain ${JSON.stringify(expected)}`)
    }
    assert.ok(
      text.indexOf("Alpha feature done.") < text.indexOf("Needs attention"),
      "a feature can be selected before reading the attention summary",
    )
    const section = container.querySelector("section[aria-labelledby='attention-summary']")
    assert.ok(section?.querySelector("a[href='#/features/store-alpha?node=b-use']"), "attention item opens the failed alpha node")
    assert.ok(section?.querySelector("a[href='#/attention']"), "the full list remains accessible")
    assert.doesNotMatch(section?.textContent ?? "", /c-wire|d-dependent/)
    await unmount()
  })

  test("provides a launch command, scoped guidance, or path recovery for the three empty states", async (t) => {
    const empty = { ...OVERVIEW, features: [], attention: [] }
    let response: unknown = { ...empty, scope: { roots: [] } }
    t.mock.method(globalThis, "fetch", async () => Response.json(response))
    const cases = [
      [response, /Choose a project or try a sample.*--project \/path\/to\/checkout/s],
      [{ ...empty, scope: { roots: [], project: "/repo/empty" } }, /No gbuild runs found yet.*gbuild plan skill/s],
      [{ ...empty, diagnostics: [{ root: "/missing", message: "Could not scan root" }] }, /\/missing.*Check the project paths.*corrected config/s],
    ] as const
    for (const [snapshot, expected] of cases) {
      response = snapshot
      const { container, unmount } = await render(<FeatureList pollInterval={60_000} />)
      try {
        assert.match(container.textContent ?? "", expected)
        assert.ok(container.querySelector("a[href='/sample/']"))
      } finally {
        await unmount()
      }
    }
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
