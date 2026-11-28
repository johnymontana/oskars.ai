// Render test for the attention dashboard: failed and blocked nodes across
// stores — against a mocked fetch.
// Runs in jsdom (no vite needed):  node --import tsx --test monitor/test/attention.test.tsx
import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { ATTENTION } from "./fixtures.ts"
import { render } from "./helpers.tsx"

const { AttentionTable, AttentionView } = await import("../ui/AttentionView.tsx")

describe("attention view", () => {
  test("lists failed and blocked nodes across stores with state, waiting_on and last failed criteria", async () => {
    const { container, unmount } = await render(<AttentionView pollInterval={60_000} />)
    const text = container.textContent ?? ""
    for (const expected of [
      "/repo/project-one",
      "alpha",
      "b-use",
      "failed",
      "uses the value",
      "/repo/project-two",
      "beta",
      "c-wire",
      "blocked",
      "b-prep",
    ]) {
      assert.ok(text.includes(expected), `attention view should contain ${JSON.stringify(expected)}`)
    }
    assert.ok(container.querySelector("a[href='#/features/store-alpha?node=b-use']"), "feature links to its graph detail")
    await unmount()
  })

  test("orders failures and groups shared downstream waits without counting them twice", async (t) => {
    const [failure, waiting, blocked] = ATTENTION
    assert.ok(failure && waiting && blocked)
    const items = [
      { ...waiting },
      { ...blocked, blocking_failures: ["b-use", "other-failure"] },
      failure,
      { ...failure, node: "other-failure" },
    ]
    const { container, unmount } = await render(<AttentionTable items={items} />)
    t.after(unmount)
    const text = container.textContent ?? ""
    assert.match(text, /2 failed · 2 blocked/)
    assert.match(text, /Failures.*b-use.*other-failure.*Blocked by failures.*d-dependent.*Waiting on work.*c-wire/)
    assert.ok(container.querySelector("a[href='#/features/store-alpha?node=d-dependent']"))
  })

})
