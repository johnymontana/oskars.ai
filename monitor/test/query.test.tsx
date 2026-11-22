// Render tests for the query tab: the Cypher console rendering rows as a
// table, node/rel rows also rendering an NVL graph, and server rejections —
// against a mocked fetch.
// Runs in jsdom (no vite needed):  node --import tsx --test monitor/test/query.test.tsx
import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { dom } from "./setup.ts"
import "./fixtures.ts"
import { act, render } from "./helpers.tsx"

const { App } = await import("../ui/App.tsx")

describe("query tab", () => {
  test("Cypher console renders rows as a table, node/rel rows also render an NVL graph, rejections show the error", async () => {
    const { container, unmount } = await render(<App pollInterval={60_000} />)
    const goto = async (hash: string) => {
      window.location.hash = hash
      await act(async () => {
        window.dispatchEvent(new dom.window.Event("hashchange"))
      })
    }
    await goto("#/features/alpha/query")
    const tabBar = container.querySelector(".tab-bar")
    assert.ok(tabBar?.querySelector("a[href='#/features/alpha/query']"), "tab bar links to the query tab")
    assert.equal(container.querySelector(".tab-bar a[aria-current='page']")?.textContent, "Query")
    assert.ok(!container.querySelector("#NVL_interactive-wrapper"), "query tab does not mount the dependency graph")

    const form = container.querySelector(".query-console form")
    const editor = container.querySelector("textarea[aria-label='Cypher']")
    assert.ok(form && editor, "query tab renders a Cypher editor form")
    const setValue = Object.getOwnPropertyDescriptor((dom.window as any).HTMLTextAreaElement.prototype, "value")!.set!
    const submit = async (cypher: string) => {
      setValue.call(editor, cypher)
      await act(async () => {
        editor.dispatchEvent(new dom.window.Event("input", { bubbles: true }))
        form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }))
      })
      // flush the fetch and the state update it resolves into
      await act(async () => {})
    }

    // Scalar rows render as a table with the row keys as columns.
    await submit("RETURN nodes")
    const table = container.querySelector("table.query-results")
    assert.ok(table, "returned rows render as a table")
    assert.deepEqual(
      [...table.querySelectorAll("th")].map((h) => h.textContent),
      ["slug", "status"],
      "table columns come from the row keys",
    )
    const tableText = table.textContent ?? ""
    for (const expected of ["a-impl", "completed", "b-use", "frontier"]) {
      assert.ok(tableText.includes(expected), `results table should contain ${JSON.stringify(expected)}`)
    }
    assert.ok(!container.querySelector("#NVL_interactive-wrapper"), "scalar-only rows do not render a graph")

    // Rows with node/rel values render the table and an NVL graph.
    await submit("MATCH (n)-[r]->(m) RETURN n, r, m")
    const graphTable = container.querySelector("table.query-results")
    assert.ok(graphTable?.textContent?.includes("DEPENDS_ON"), "node/rel rows still render in the table")
    assert.ok(container.querySelector("#NVL_interactive-wrapper"), "node/rel rows also render an NVL graph")
    assert.ok(container.querySelector("canvas"), "the result graph draws into a canvas")

    // A rejected statement renders the server's error message.
    await submit("BROKEN CYPHER")
    const alert = container.querySelector("[role='alert']")
    assert.ok(alert, "a rejected statement renders an alert")
    assert.ok(
      alert.textContent?.includes("Variable `nope` not defined"),
      "the alert carries the server's error message",
    )
    assert.ok(!container.querySelector("table.query-results"), "a failed query clears the previous results")
    await unmount()
    window.location.hash = ""
  })
})
