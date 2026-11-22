// Render tests for the knowledge browser: the filterable notes/symbols view
// and the cross-store knowledge graph — against a mocked fetch.
// Runs in jsdom (no vite needed):  node --import tsx --test monitor/test/knowledge.test.tsx
import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { dom } from "./setup.ts"
import { KNOWLEDGE_GRAPH } from "./fixtures.ts"
import { React, act, render } from "./helpers.tsx"

const { InteractiveNvlWrapper } = await import("@neo4j-nvl/react")
const { App } = await import("../ui/App.tsx")
const { KnowledgeView, toNvlKnowledgeGraph } = await import("../ui/KnowledgeView.tsx")

describe("knowledge view", () => {
  test("groups notes by topic, lists symbols, and the search box filters both", async () => {
    const { container, unmount } = await render(<KnowledgeView pollInterval={60_000} />)
    const text = container.textContent ?? ""
    for (const expected of [
      "setup",
      "testing",
      "run npm ci at the worktree root",
      "relate must be on PATH",
      "node --test runs the suite",
      "listAttention",
      "src/attention.ts",
      "failed and blocked nodes across stores",
      "a-impl",
      "/repo/project-two/beta",
    ]) {
      assert.ok(text.includes(expected), `knowledge view should contain ${JSON.stringify(expected)}`)
    }
    const headings = [...container.querySelectorAll("h3")].map((h) => h.textContent)
    assert.deepEqual(headings, ["setup", "testing"], "notes group under their topic headings")
    const filter = container.querySelector("input[type='search']")
    assert.ok(filter, "a text search box filters the knowledge lists")
    const setValue = Object.getOwnPropertyDescriptor((dom.window as any).HTMLInputElement.prototype, "value")!.set!
    setValue.call(filter, "npm ci")
    await act(async () => {
      filter.dispatchEvent(new dom.window.Event("input", { bubbles: true }))
    })
    const filtered = container.textContent ?? ""
    assert.ok(filtered.includes("run npm ci at the worktree root"), "matching note stays")
    assert.ok(!filtered.includes("node --test runs the suite"), "non-matching note filters out")
    assert.ok(!filtered.includes("relate must be on PATH"), "non-matching topic note filters out")
    assert.ok(filtered.includes("no symbols match"), "symbols filter to an empty state")
    await unmount()
  })

  test("knowledge graph: merged symbol nodes connect to every defining feature and notes to their topic hub", async () => {
    const ref = React.createRef<any>()
    const { nodes, rels } = toNvlKnowledgeGraph(KNOWLEDGE_GRAPH as any)
    const { unmount } = await render(
      <InteractiveNvlWrapper ref={ref} nodes={nodes} rels={rels} nvlOptions={{ renderer: "canvas", disableWebGL: true }} />,
    )
    const symbolId = "Symbol:toNvlGraph:monitor/ui/NvlGraph.tsx"
    const symbolNodes = (ref.current.getNodes() as any[]).filter((n) => n.id === symbolId)
    assert.equal(symbolNodes.length, 1, "a symbol defined in two stores renders as one merged node")
    assert.equal(ref.current.getNodeById(symbolId).caption, "toNvlGraph", "symbol nodes are captioned by name")
    assert.deepEqual(
      (ref.current.getRelationships() as any[])
        .filter((r) => r.to === symbolId)
        .map((r) => r.from)
        .sort(),
      ["Feature:/repo/project-one:alpha", "Feature:/repo/project-two:beta"],
      "the merged symbol connects to both features that define it",
    )
    assert.deepEqual(
      (ref.current.getRelationships() as any[])
        .filter((r) => r.to === "Topic:setup")
        .map((r) => r.from)
        .sort(),
      [
        "Note:/repo/project-one:alpha:setup:run npm ci at the worktree root",
        "Note:/repo/project-two:beta:setup:relate must be on PATH",
      ],
      "notes connect to their shared topic hub",
    )
    assert.equal(ref.current.getNodeById("Topic:setup").caption, "setup", "topic hubs are captioned by topic")
    await unmount()
  })

  test("#/knowledge renders the knowledge graph with the filterable table still present", async () => {
    const { container, unmount } = await render(<App pollInterval={60_000} />)
    window.location.hash = "#/knowledge"
    await act(async () => {
      window.dispatchEvent(new dom.window.Event("hashchange"))
    })
    assert.ok(container.querySelector("#NVL_interactive-wrapper"), "#/knowledge mounts the knowledge graph")
    assert.ok(container.querySelector("input[type='search']"), "the filter box is still present")
    assert.ok(container.querySelector("table"), "the symbols table is still present")
    assert.ok((container.textContent ?? "").includes("run npm ci at the worktree root"), "notes list still renders")
    await unmount()
    window.location.hash = ""
  })
})
