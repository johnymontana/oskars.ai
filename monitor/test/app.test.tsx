// Render tests for the app shell: the header navigation, hash routing, and
// the theme/status-chip wiring — against a mocked fetch.
// Runs in jsdom (no vite needed):  node --import tsx --test monitor/test/app.test.tsx
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, test } from "node:test"
import { dom } from "./setup.ts"
import "./fixtures.ts"
import { act, render } from "./helpers.tsx"

const { App } = await import("../ui/App.tsx")
const { StatusChip } = await import("../ui/StatusChip.tsx")

describe("app shell", () => {
  test("theme stylesheet defines the status palette and status chips carry the status colors", async () => {
    const css = readFileSync(new URL("../ui/theme.css", import.meta.url), "utf8")
    const entry = readFileSync(new URL("../ui/main.tsx", import.meta.url), "utf8")
    assert.ok(
      entry.includes('import "./theme.css"'),
      "the UI entry point applies the theme stylesheet app-wide",
    )
    for (const token of ["--bg", "--bg-raised", "--border", "--text", "--text-dim", "--accent"]) {
      assert.ok(css.includes(`${token}:`), `theme defines the dark palette token ${token}`)
    }
    for (const status of ["completed", "in_progress", "frontier", "blocked", "failed", "cancelled"]) {
      const token = `--status-${status.replaceAll("_", "-")}`
      assert.ok(css.includes(`${token}:`), `theme defines ${token}`)
      assert.ok(
        new RegExp(`\\.status-chip\\[data-status="${status}"\\][^}]*var\\(${token}\\)`).test(css),
        `status chips for ${status} carry ${token}`,
      )
      const { container, unmount } = await render(<StatusChip status={status} />)
      const chip = container.querySelector(".status-chip")
      assert.ok(chip, "chip renders with the status-chip class")
      assert.equal(chip.getAttribute("data-status"), status)
      await unmount()
    }
  })

  test("app chrome: header navigates to the features, attention and knowledge routes", async () => {
    const { container, unmount } = await render(<App pollInterval={60_000} />)
    const header = container.querySelector("header.app-header")
    assert.ok(header, "app renders a header")
    for (const [href, label] of [
      ["#/", "features"],
      ["#/attention", "attention"],
      ["#/knowledge", "knowledge"],
    ] as const) {
      const link: Element | null = header.querySelector(`nav a[href='${href}']`)
      assert.ok(link, `header nav links to ${href}`)
      assert.equal(link.textContent, label)
    }
    await unmount()
  })

  test("app routes #/attention and #/knowledge to their views", async () => {
    const { container, unmount } = await render(<App pollInterval={60_000} />)
    const goto = async (hash: string) => {
      window.location.hash = hash
      await act(async () => {
        window.dispatchEvent(new dom.window.Event("hashchange"))
      })
    }
    await goto("#/attention")
    assert.ok(container.querySelector("a[href='#/features/alpha']"), "#/attention renders the attention view")
    await goto("#/knowledge")
    assert.ok(container.querySelector("input[type='search']"), "#/knowledge renders the knowledge view")
    await goto("#/")
    assert.ok((container.textContent ?? "").includes("gbuild features"), "#/ renders the feature list")
    await goto("#/features/alpha")
    assert.ok((container.textContent ?? "").includes("wave 0"), "#/features/<slug> still renders the graph detail")
    await unmount()
    window.location.hash = ""
  })
})
