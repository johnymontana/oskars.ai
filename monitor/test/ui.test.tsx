// Render tests for the monitor web UI: the feature list with its
// needs-attention section, the graph detail (grouped by wave), the attention
// dashboard, the knowledge browser, polling, and the NVL mount — all against
// a mocked fetch.
// Runs in jsdom (no vite needed):  node --import tsx --test monitor/test/ui.test.tsx
//
// jsdom has no canvas or ResizeObserver, so the canvas 2d context and
// ResizeObserver are stubbed before NVL is imported; that is enough for NVL's
// canvas renderer to initialize and hold the fixture nodes/rels.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { before, describe, mock, test } from "node:test"
import type { ReactElement } from "react"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" })
// rAF via setTimeout so pending frames are cancellable and the test process exits.
globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
  setTimeout(() => cb(Date.now()), 16)) as unknown as typeof requestAnimationFrame
globalThis.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as typeof cancelAnimationFrame
;(dom.window as any).requestAnimationFrame = globalThis.requestAnimationFrame
;(dom.window as any).cancelAnimationFrame = globalThis.cancelAnimationFrame
globalThis.window = dom.window as any
globalThis.document = dom.window.document as any
for (const key of [
  "HTMLElement",
  "HTMLCanvasElement",
  "Node",
  "MutationObserver",
  "CustomEvent",
  "MouseEvent",
  "WheelEvent",
  "KeyboardEvent",
  "PointerEvent",
  "Event",
  "ShadowRoot",
  "Element",
  "SVGElement",
  "DocumentFragment",
  "Range",
  "DOMParser",
] as const) {
  if (key in dom.window) (globalThis as any)[key] = (dom.window as any)[key]
}
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window) as any
;(globalThis as any).devicePixelRatio = 1
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as any).ResizeObserver = ResizeObserverStub
;(dom.window as any).ResizeObserver = ResizeObserverStub

const gradient = { addColorStop: () => {} }
const fakeContext = (canvas: HTMLCanvasElement) =>
  new Proxy({ canvas }, {
    get(target, prop) {
      if (prop === "canvas") return canvas
      if (prop === "measureText") return () => ({ width: 10 })
      if (prop === "createLinearGradient" || prop === "createRadialGradient" || prop === "createPattern")
        return () => gradient
      if (prop === "getImageData" || prop === "createImageData")
        return (x: number, y: number, w = 1, h = 1) => ({ data: new Uint8ClampedArray(4), width: w, height: h })
      if (prop === "getTransform") return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
      if (prop === "getLineDash") return () => []
      if (prop in target) return (target as any)[prop]
      return () => {}
    },
    set(target, prop, value) {
      ;(target as any)[prop] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
dom.window.HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
  return fakeContext(this)
} as any
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

// Imports that touch the DOM must come after the globals above.
const React = await import("react")
const { act } = React
const { createRoot } = await import("react-dom/client")
const { InteractiveNvlWrapper } = await import("@neo4j-nvl/react")
const { FeatureList } = await import("../ui/FeatureList.tsx")
const { GraphDetail } = await import("../ui/GraphDetail.tsx")
const { AttentionView } = await import("../ui/AttentionView.tsx")
const { KnowledgeView, toNvlKnowledgeGraph } = await import("../ui/KnowledgeView.tsx")
const { StoreGraphExplorer, FALLBACK_REL_COLORS } = await import("../ui/StoreGraphExplorer.tsx")
const { TimelineTab } = await import("../ui/TimelineTab.tsx")
const { App } = await import("../ui/App.tsx")
const { StatusChip } = await import("../ui/StatusChip.tsx")

const FEATURES = [
  { project: "/repo/project-one", slug: "alpha", destination: "Alpha feature done.", status_counts: { completed: 1, frontier: 1 } },
  { project: "/repo/project-two", slug: "beta", destination: "Beta feature done.", status_counts: { in_progress: 1 } },
]

const GRAPH = {
  project: "/repo/project-one",
  slug: "alpha",
  destination: "Alpha feature done.",
  nodes: [
    {
      slug: "a-impl",
      title: "Implement alpha",
      type: "code",
      status: "completed",
      wave: 0,
      acceptance: ["alpha implemented"],
      depends_on: [],
      model_tier: "fast",
      failure_policy: "retry",
      started_at: "2026-01-01T00:10:00Z",
      completed_at: "2026-01-01T00:13:05Z",
      inputs: [],
      outputs: [{ name: "value", shape: "<integer>", from: null, value: 21 }],
      reviews: [
        {
          attempt: 1,
          verdict: "fail",
          failed_criteria: ["alpha implemented"],
          checklist: ["build red", "alpha implemented — FAIL"],
          at: "2026-01-01T00:11:00Z",
        },
        {
          attempt: 2,
          verdict: "pass",
          failed_criteria: [],
          checklist: ["build green"],
          at: "2026-01-01T00:12:00Z",
        },
      ],
    },
    {
      slug: "b-use",
      title: "Use alpha value",
      type: "code",
      status: "frontier",
      wave: 1,
      acceptance: ["uses the value"],
      depends_on: ["a-impl"],
      model_tier: "standard",
      failure_policy: "halt",
      started_at: null,
      completed_at: null,
      inputs: [{ name: "value", shape: "<integer>", from: "a-impl.output.value", value: 21 }],
      outputs: [{ name: "result", shape: "<integer>", from: null, value: null }],
      reviews: [],
    },
  ],
  acceptance: [
    { id: "a1", text: "alpha works end to end", covered_by: ["a-impl", "b-use"] },
    { id: "a2", text: "no regressions", covered_by: [] },
  ],
}

const ATTENTION = [
  {
    project: "/repo/project-one",
    feature: "alpha",
    node: "b-use",
    state: "failed",
    waiting_on: [],
    last_failed_criteria: ["uses the value"],
  },
  {
    project: "/repo/project-two",
    feature: "beta",
    node: "c-wire",
    state: "blocked",
    waiting_on: ["b-prep"],
    last_failed_criteria: [],
  },
]

const KNOWLEDGE = {
  notes: [
    { topic: "setup", text: "run npm ci at the worktree root", by_node: "a-impl", project: "/repo/project-one", feature: "alpha" },
    { topic: "testing", text: "node --test runs the suite", by_node: "b-use", project: "/repo/project-one", feature: "alpha" },
    { topic: "setup", text: "relate must be on PATH", by_node: "c-wire", project: "/repo/project-two", feature: "beta" },
    { topic: "testing", text: "layout settles asynchronously in jsdom", by_node: "a-impl", project: "/repo/project-one", feature: "alpha" },
    { topic: "setup", text: "unrelated note from another node", by_node: "other-node", project: "/repo/project-one", feature: "alpha" },
  ],
  symbols: [
    { name: "listAttention", file: "src/attention.ts", purpose: "failed and blocked nodes across stores", by_node: "a-impl", project: "/repo/project-one", feature: "alpha" },
    { name: "toNvlGraph", file: "monitor/ui/NvlGraph.tsx", purpose: "maps graph nodes to NVL nodes/rels", by_node: "a-impl", project: "/repo/project-one", feature: "alpha" },
  ],
}

const QUERY_SCALAR_ROWS = [
  { slug: "a-impl", status: "completed" },
  { slug: "b-use", status: "frontier" },
]

// Node/rel row values serialize the relate jsonl way.
const QUERY_GRAPH_ROWS = [
  {
    n: { id: 1, kind: "node", labels: ["Node"], properties: { slug: "a-impl" } },
    r: { id: 9, kind: "relationship", type: "DEPENDS_ON", start_node: 2, end_node: 1, properties: {} },
    m: { id: 2, kind: "node", labels: ["Node"], properties: { slug: "b-use" } },
  },
]

// The knowledge graph for the same stores: the symbol both features define is
// one merged node, and the two setup notes share one topic hub.
const KNOWLEDGE_GRAPH = {
  nodes: [
    { id: "Feature:/repo/project-one:alpha", labels: ["Feature"], properties: { project: "/repo/project-one", feature: "alpha" } },
    { id: "Feature:/repo/project-two:beta", labels: ["Feature"], properties: { project: "/repo/project-two", feature: "beta" } },
    {
      id: "Note:/repo/project-one:alpha:setup:run npm ci at the worktree root",
      labels: ["Note"],
      properties: { topic: "setup", text: "run npm ci at the worktree root", by_node: "a-impl" },
    },
    {
      id: "Note:/repo/project-two:beta:setup:relate must be on PATH",
      labels: ["Note"],
      properties: { topic: "setup", text: "relate must be on PATH", by_node: "c-wire" },
    },
    {
      id: "Symbol:toNvlGraph:monitor/ui/NvlGraph.tsx",
      labels: ["Symbol"],
      properties: { name: "toNvlGraph", file: "monitor/ui/NvlGraph.tsx", purpose: "maps graph nodes to NVL nodes/rels" },
    },
    { id: "Topic:setup", labels: ["Topic"], properties: { topic: "setup" } },
  ],
  rels: [
    {
      id: "DEFINES:Feature:/repo/project-one:alpha->Symbol:toNvlGraph:monitor/ui/NvlGraph.tsx:a-impl",
      type: "DEFINES",
      from: "Feature:/repo/project-one:alpha",
      to: "Symbol:toNvlGraph:monitor/ui/NvlGraph.tsx",
      properties: { project: "/repo/project-one", feature: "alpha", by_node: "a-impl" },
    },
    {
      id: "DEFINES:Feature:/repo/project-two:beta->Symbol:toNvlGraph:monitor/ui/NvlGraph.tsx:c-wire",
      type: "DEFINES",
      from: "Feature:/repo/project-two:beta",
      to: "Symbol:toNvlGraph:monitor/ui/NvlGraph.tsx",
      properties: { project: "/repo/project-two", feature: "beta", by_node: "c-wire" },
    },
    {
      id: "WROTE:Feature:/repo/project-one:alpha->Note:/repo/project-one:alpha:setup:run npm ci at the worktree root:a-impl",
      type: "WROTE",
      from: "Feature:/repo/project-one:alpha",
      to: "Note:/repo/project-one:alpha:setup:run npm ci at the worktree root",
      properties: { project: "/repo/project-one", feature: "alpha", by_node: "a-impl" },
    },
    {
      id: "WROTE:Feature:/repo/project-two:beta->Note:/repo/project-two:beta:setup:relate must be on PATH:c-wire",
      type: "WROTE",
      from: "Feature:/repo/project-two:beta",
      to: "Note:/repo/project-two:beta:setup:relate must be on PATH",
      properties: { project: "/repo/project-two", feature: "beta", by_node: "c-wire" },
    },
    {
      id: "ABOUT:Note:/repo/project-one:alpha:setup:run npm ci at the worktree root->Topic:setup:a-impl",
      type: "ABOUT",
      from: "Note:/repo/project-one:alpha:setup:run npm ci at the worktree root",
      to: "Topic:setup",
      properties: { project: "/repo/project-one", feature: "alpha", by_node: "a-impl" },
    },
    {
      id: "ABOUT:Note:/repo/project-two:beta:setup:relate must be on PATH->Topic:setup:c-wire",
      type: "ABOUT",
      from: "Note:/repo/project-two:beta:setup:relate must be on PATH",
      to: "Topic:setup",
      properties: { project: "/repo/project-two", feature: "beta", by_node: "c-wire" },
    },
  ],
}

// The raw store elements of feature alpha, matching GRAPH above: every label
// and relationship type the store schema uses.
const STORE_GRAPH = {
  nodes: [
    { id: "Acceptance:a1", labels: ["Acceptance"], properties: { id: "a1", text: "alpha works end to end" } },
    { id: "Acceptance:a2", labels: ["Acceptance"], properties: { id: "a2", text: "no regressions" } },
    { id: "Feature:alpha", labels: ["Feature"], properties: { feature: "alpha", destination: "Alpha feature done." } },
    { id: "Field:a-impl:output:value", labels: ["Field"], properties: { name: "value", shape: "<integer>", value: 21 } },
    { id: "Field:b-use:input:value", labels: ["Field"], properties: { name: "value", shape: "<integer>" } },
    { id: "Field:b-use:output:result", labels: ["Field"], properties: { name: "result", shape: "<integer>" } },
    {
      id: "GbuildNode:a-impl",
      labels: ["GbuildNode", "Code"],
      properties: { slug: "a-impl", title: "Implement alpha", type: "code", status: "completed" },
    },
    {
      id: "GbuildNode:b-use",
      labels: ["GbuildNode", "Code"],
      properties: { slug: "b-use", title: "Use alpha value", type: "code", status: "pending" },
    },
    {
      id: "Note:a-impl:testing:layout settles asynchronously in jsdom",
      labels: ["Note"],
      properties: { topic: "testing", text: "layout settles asynchronously in jsdom", by_node: "a-impl" },
    },
    {
      id: "Review:a-impl:1",
      labels: ["Review"],
      properties: { attempt: 1, verdict: "fail", failed_criteria: ["alpha implemented"], checklist: ["build red"], at: "2026-01-01T00:11:00Z" },
    },
    {
      id: "Review:a-impl:2",
      labels: ["Review"],
      properties: { attempt: 2, verdict: "pass", failed_criteria: [], checklist: ["build green"], at: "2026-01-01T00:12:00Z" },
    },
    {
      id: "Symbol:a-impl:toNvlGraph",
      labels: ["Symbol"],
      properties: { name: "toNvlGraph", file: "monitor/ui/NvlGraph.tsx", purpose: "maps graph nodes to NVL nodes/rels", by_node: "a-impl" },
    },
  ],
  rels: [
    { id: "DEFINES:GbuildNode:a-impl->Symbol:a-impl:toNvlGraph", type: "DEFINES", from: "GbuildNode:a-impl", to: "Symbol:a-impl:toNvlGraph", properties: {} },
    { id: "DEPENDS_ON:GbuildNode:b-use->GbuildNode:a-impl", type: "DEPENDS_ON", from: "GbuildNode:b-use", to: "GbuildNode:a-impl", properties: {} },
    { id: "FROM:Field:b-use:input:value->Field:a-impl:output:value", type: "FROM", from: "Field:b-use:input:value", to: "Field:a-impl:output:value", properties: {} },
    { id: "HAS_ACCEPTANCE:Feature:alpha->Acceptance:a1", type: "HAS_ACCEPTANCE", from: "Feature:alpha", to: "Acceptance:a1", properties: {} },
    { id: "HAS_ACCEPTANCE:Feature:alpha->Acceptance:a2", type: "HAS_ACCEPTANCE", from: "Feature:alpha", to: "Acceptance:a2", properties: {} },
    { id: "INPUT:GbuildNode:b-use->Field:b-use:input:value", type: "INPUT", from: "GbuildNode:b-use", to: "Field:b-use:input:value", properties: {} },
    { id: "OUTPUT:GbuildNode:a-impl->Field:a-impl:output:value", type: "OUTPUT", from: "GbuildNode:a-impl", to: "Field:a-impl:output:value", properties: {} },
    { id: "OUTPUT:GbuildNode:b-use->Field:b-use:output:result", type: "OUTPUT", from: "GbuildNode:b-use", to: "Field:b-use:output:result", properties: {} },
    { id: "REVIEWED:GbuildNode:a-impl->Review:a-impl:1", type: "REVIEWED", from: "GbuildNode:a-impl", to: "Review:a-impl:1", properties: {} },
    { id: "REVIEWED:GbuildNode:a-impl->Review:a-impl:2", type: "REVIEWED", from: "GbuildNode:a-impl", to: "Review:a-impl:2", properties: {} },
    { id: "SATISFIES:GbuildNode:a-impl->Acceptance:a1", type: "SATISFIES", from: "GbuildNode:a-impl", to: "Acceptance:a1", properties: {} },
    { id: "SATISFIES:GbuildNode:b-use->Acceptance:a1", type: "SATISFIES", from: "GbuildNode:b-use", to: "Acceptance:a1", properties: {} },
    { id: "WROTE:GbuildNode:a-impl->Note:a-impl:testing:layout settles asynchronously in jsdom", type: "WROTE", from: "GbuildNode:a-impl", to: "Note:a-impl:testing:layout settles asynchronously in jsdom", properties: {} },
  ],
}

const STATUS_BY_SLUG = new Map([
  ["a-impl", "completed"],
  ["b-use", "frontier"],
])

// gamma: a three-node skeleton where c-solo sits outside a-impl/b-use's
// dependency neighborhood, for the Graph tab focus test.
const GAMMA_GRAPH = {
  project: "/repo/project-one",
  slug: "gamma",
  destination: "Gamma feature done.",
  nodes: [
    { slug: "a-impl", title: "Implement gamma", type: "code", status: "completed", wave: 0, acceptance: [], depends_on: [], model_tier: "fast", failure_policy: "retry", started_at: null, completed_at: null, inputs: [], outputs: [], reviews: [] },
    { slug: "b-use", title: "Use gamma value", type: "code", status: "frontier", wave: 1, acceptance: [], depends_on: ["a-impl"], model_tier: "standard", failure_policy: "halt", started_at: null, completed_at: null, inputs: [], outputs: [], reviews: [] },
    { slug: "c-solo", title: "Solo gamma", type: "code", status: "blocked", wave: 0, acceptance: [], depends_on: [], model_tier: "fast", failure_policy: "retry", started_at: null, completed_at: null, inputs: [], outputs: [], reviews: [] },
  ],
  acceptance: [],
}

const GAMMA_STORE = {
  nodes: [
    { id: "GbuildNode:a-impl", labels: ["GbuildNode", "Code"], properties: { slug: "a-impl", title: "Implement gamma", type: "code", status: "completed" } },
    { id: "GbuildNode:b-use", labels: ["GbuildNode", "Code"], properties: { slug: "b-use", title: "Use gamma value", type: "code", status: "frontier" } },
    { id: "GbuildNode:c-solo", labels: ["GbuildNode", "Code"], properties: { slug: "c-solo", title: "Solo gamma", type: "code", status: "blocked" } },
  ],
  rels: [
    { id: "DEPENDS_ON:GbuildNode:b-use->GbuildNode:a-impl", type: "DEPENDS_ON", from: "GbuildNode:b-use", to: "GbuildNode:a-impl", properties: {} },
  ],
}

let fetchCalls: string[] = []
globalThis.fetch = (async (input: any, init?: any) => {
  const path = String(input)
  fetchCalls.push(path)
  if (path === "/api/features") return Response.json(FEATURES)
  if (path === "/api/features/alpha/graph") return Response.json(GRAPH)
  if (path === "/api/features/alpha/query") {
    const { cypher } = JSON.parse(String(init?.body ?? "{}")) as { cypher?: string }
    if (String(cypher).includes("BROKEN"))
      return Response.json({ error: "relate exited 1: Variable `nope` not defined" }, { status: 400 })
    if (String(cypher).includes("MATCH")) return Response.json({ rows: QUERY_GRAPH_ROWS })
    return Response.json({ rows: QUERY_SCALAR_ROWS })
  }
  if (path === "/api/features/alpha/store-graph") return Response.json(STORE_GRAPH)
  if (path === "/api/features/gamma/graph") return Response.json(GAMMA_GRAPH)
  if (path === "/api/features/gamma/store-graph") return Response.json(GAMMA_STORE)
  if (path === "/api/attention") return Response.json(ATTENTION)
  if (path === "/api/knowledge") return Response.json(KNOWLEDGE)
  if (path === "/api/knowledge/graph") return Response.json(KNOWLEDGE_GRAPH)
  return new Response("not found", { status: 404 })
}) as typeof fetch

// Renders into a fresh container, flushing effects and the first poll fetch.
const render = async (element: ReactElement) => {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(element)
  })
  return {
    container,
    unmount: async () => {
      await act(async () => root.unmount())
      container.remove()
    },
  }
}

describe("monitor ui", () => {
  before(() => {
    fetchCalls = []
  })

  test("feature list renders project, slug, destination and status counts", async () => {
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
    const link = container.querySelector("a[href='#/features/alpha']")
    assert.ok(link, "slug links to the graph detail view")
    await unmount()
  })

  test("feature list re-fetches on the poll interval without a reload", async () => {
    mock.timers.enable({ apis: ["setInterval"] })
    try {
      const before = fetchCalls.filter((p) => p === "/api/features").length
      const { unmount } = await render(<FeatureList pollInterval={3_000} />)
      const afterMount = fetchCalls.filter((p) => p === "/api/features").length
      assert.equal(afterMount, before + 1, "fetches once on mount")
      await act(async () => {
        mock.timers.tick(3_000)
      })
      assert.equal(
        fetchCalls.filter((p) => p === "/api/features").length,
        afterMount + 1,
        "re-fetches after one poll interval",
      )
      await unmount()
    } finally {
      mock.timers.reset()
    }
  })

  test("graph detail: compact wave list opens the side panel with full node detail, Esc closes it", async () => {
    const { container, unmount } = await render(<GraphDetail slug="alpha" pollInterval={60_000} />)
    const text = container.textContent ?? ""
    // The wave-grouped list is a compact summary: name + status chip only.
    for (const expected of ["wave 0", "a-impl", "completed", "wave 1", "b-use", "frontier"]) {
      assert.ok(text.includes(expected), `graph detail should contain ${JSON.stringify(expected)}`)
    }
    assert.ok(!text.includes("alpha implemented"), "acceptance detail lives in the side panel, not the wave list")
    assert.ok(container.querySelector(".wave-list .status-chip[data-status='completed']"), "wave list carries status chips")
    const [wave0, wave1] = [text.indexOf("wave 0"), text.indexOf("wave 1")]
    assert.ok(wave0 !== -1 && wave1 !== -1 && wave0 < wave1, "waves render in order")
    assert.ok(container.querySelector("#NVL_interactive-wrapper"), "detail view mounts the NVL wrapper")
    assert.ok(container.querySelector("canvas"), "canvas renderer draws into the container")

    // Clicking a wave-list entry opens the side panel with full node detail.
    const entry = [...container.querySelectorAll(".wave-list button")].find((b) => b.textContent?.includes("a-impl"))
    assert.ok(entry, "wave list has an entry for a-impl")
    await act(async () => {
      entry.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    const panel = container.querySelector(".node-panel")
    assert.ok(panel, "clicking a wave-list entry opens the side panel")
    const panelText = panel.textContent ?? ""
    for (const expected of [
      "Implement alpha",
      "alpha implemented",
      "21",
      "pass",
      "build green",
      "fast",
      "retry",
      "2026-01-01T00:10:00Z",
      "2026-01-01T00:13:05Z",
      "3m 5s",
      "layout settles asynchronously in jsdom",
      "toNvlGraph",
    ]) {
      assert.ok(panelText.includes(expected), `side panel should contain ${JSON.stringify(expected)}`)
    }
    assert.ok(!panelText.includes("unrelated note"), "panel only shows the selected node's notes")

    // Esc closes the panel.
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    })
    assert.ok(!container.querySelector(".node-panel"), "Esc closes the side panel")

    // Clicking another entry reopens the panel with that node's fields.
    const other = [...container.querySelectorAll(".wave-list button")].find((b) => b.textContent?.includes("b-use"))
    assert.ok(other, "wave list has an entry for b-use")
    await act(async () => {
      other.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    const panelText2 = container.querySelector(".node-panel")?.textContent ?? ""
    for (const expected of ["uses the value", "a-impl.output.value", "result", "standard", "halt"]) {
      assert.ok(panelText2.includes(expected), `side panel should contain ${JSON.stringify(expected)}`)
    }
    await unmount()
  })

  test("graph tab: double-clicking a node dims elements outside its transitive neighborhood, Esc or canvas double-click resets", async () => {
    const ref = React.createRef<any>()
    const { container, unmount } = await render(<GraphDetail slug="gamma" pollInterval={60_000} nvlRef={ref} />)

    // Wait for the hierarchical layout to settle (synchronous fallback in jsdom).
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))
    })
    const wrapper = container.querySelector("#NVL_interactive-wrapper") as Element
    assert.ok(wrapper, "graph tab mounts the NVL wrapper")
    const positionOf = (id: string) =>
      (ref.current.getNodes() as any[]).find((n) => n.id === id).clientPosition as { x: number; y: number }
    const doubleClickAt = (x: number, y: number) =>
      wrapper.dispatchEvent(new MouseEvent("dblclick", { clientX: x, clientY: y, bubbles: true }))

    // Status colors come from the theme tokens (fallback values without CSS in jsdom).
    assert.equal(ref.current.getNodeById("GbuildNode:a-impl").color, "#4caf7d")
    assert.equal(ref.current.getNodeById("GbuildNode:b-use").color, "#5b9dff")
    assert.equal(ref.current.getNodeById("GbuildNode:c-solo").color, "#8b94a3")

    // Double-clicking b-use dims everything outside its transitive upstream+downstream neighborhood.
    const { x, y } = positionOf("GbuildNode:b-use")
    await act(async () => doubleClickAt(x, y))
    assert.equal(ref.current.getNodeById("GbuildNode:a-impl").color, "#4caf7d", "upstream dependency stays lit")
    assert.equal(ref.current.getNodeById("GbuildNode:b-use").color, "#5b9dff", "focused node stays lit")
    assert.equal(ref.current.getNodeById("GbuildNode:c-solo").color, "#8b94a32e", "the node outside the neighborhood is dimmed")

    // Esc resets the focus (restyle only).
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    })
    assert.equal(ref.current.getNodeById("GbuildNode:c-solo").color, "#8b94a3", "Esc restores the status color")

    // Focus again, then double-clicking the canvas resets it.
    await act(async () => doubleClickAt(x, y))
    assert.equal(ref.current.getNodeById("GbuildNode:c-solo").color, "#8b94a32e")
    await act(async () => doubleClickAt(-9999, -9999))
    assert.equal(ref.current.getNodeById("GbuildNode:c-solo").color, "#8b94a3", "canvas double-click restores the status color")
    await unmount()
  })

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

  test("feature list tops the landing with a needs-attention section linking to each feature", async () => {
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
    assert.ok(section?.querySelector("a[href='#/features/alpha']"), "attention item links to feature alpha")
    assert.ok(section?.querySelector("a[href='#/features/beta']"), "attention item links to feature beta")
    assert.ok(section?.querySelector(".status-chip[data-status='failed']"), "failed state uses the status chip")
    assert.ok(section?.querySelector(".status-chip[data-status='blocked']"), "blocked state uses the status chip")
    await unmount()
  })

  test("attention view lists failed and blocked nodes across stores with state, waiting_on and last failed criteria", async () => {
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
    assert.ok(container.querySelector("a[href='#/features/alpha']"), "feature links to its graph detail")
    await unmount()
  })

  test("knowledge view groups notes by topic, lists symbols, and the search box filters both", async () => {
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

  test("the timeline tab does not fetch the store graph", async () => {
    const storeGraphCalls = () => fetchCalls.filter((p) => p === "/api/features/alpha/store-graph").length
    const before = storeGraphCalls()
    const { container, unmount } = await render(<GraphDetail slug="alpha" tab="timeline" pollInterval={60_000} />)
    assert.ok(container.querySelector(".timeline-bar"), "timeline tab renders the run bars")
    assert.equal(storeGraphCalls(), before, "the timeline tab does not fetch the store graph")
    await unmount()
  })

  test("feature tabs: hash-addressable timeline, acceptance and repairs views of one feature", async () => {
    const { container, unmount } = await render(<App pollInterval={60_000} />)
    const goto = async (hash: string) => {
      window.location.hash = hash
      await act(async () => {
        window.dispatchEvent(new dom.window.Event("hashchange"))
      })
    }
    const currentTab = () => container.querySelector(".tab-bar a[aria-current='page']")?.textContent

    // The graph tab is the default; the tab bar links to all four tabs.
    await goto("#/features/alpha")
    const tabBar = container.querySelector(".tab-bar")
    assert.ok(tabBar, "feature detail renders a tab bar")
    for (const href of [
      "#/features/alpha",
      "#/features/alpha/timeline",
      "#/features/alpha/acceptance",
      "#/features/alpha/repairs",
    ]) {
      assert.ok(tabBar.querySelector(`a[href='${href}']`), `tab bar links to ${href}`)
    }
    assert.equal(currentTab(), "Graph", "graph is the current tab by default")
    assert.ok(container.querySelector("#NVL_interactive-wrapper"), "graph tab mounts the NVL wrapper")

    // Timeline tab: per-node bars from started_at/completed_at.
    await goto("#/features/alpha/timeline")
    assert.equal(currentTab(), "Timeline")
    const timelineText = container.textContent ?? ""
    for (const expected of ["a-impl", "3m 5s", "not started", "b-use"]) {
      assert.ok(timelineText.includes(expected), `timeline tab should contain ${JSON.stringify(expected)}`)
    }
    assert.ok(container.querySelector(".timeline-bar[data-status='completed']"), "timeline bar carries the status")
    assert.ok(!container.querySelector("#NVL_interactive-wrapper"), "timeline tab does not mount the graph")

    // Acceptance tab: each feature criterion with its covering nodes as status chips.
    await goto("#/features/alpha/acceptance")
    assert.equal(currentTab(), "Acceptance")
    const acceptanceText = container.textContent ?? ""
    for (const expected of ["alpha works end to end", "no regressions", "uncovered", "a-impl", "b-use"]) {
      assert.ok(acceptanceText.includes(expected), `acceptance tab should contain ${JSON.stringify(expected)}`)
    }
    const list = container.querySelector(".acceptance-list")
    assert.ok(list?.querySelector(".status-chip[data-status='completed']"), "covered-by chip carries the node status")
    assert.ok(list?.querySelector(".status-chip[data-status='frontier']"), "frontier covering node gets its chip color")

    // Repairs tab: per-node review attempts with failed criteria and checklist lines.
    await goto("#/features/alpha/repairs")
    assert.equal(currentTab(), "Repairs")
    const repairsText = container.textContent ?? ""
    for (const expected of [
      "a-impl",
      "attempt 1",
      "fail",
      "alpha implemented",
      "build red",
      "attempt 2",
      "pass",
      "build green",
    ]) {
      assert.ok(repairsText.includes(expected), `repairs tab should contain ${JSON.stringify(expected)}`)
    }
    await unmount()
    window.location.hash = ""
  })

  test("query tab: Cypher console renders rows as a table, node/rel rows also render an NVL graph, rejections show the error", async () => {
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

  test("timeline tab positions bars on a shared time axis with durations and idle gaps visible", async () => {
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

  test("store explorer: skeleton-only renders the GbuildNode set; layer toggles add their node kinds and rels", async () => {
    const ref = React.createRef<any>()
    const { container, unmount } = await render(
      <StoreGraphExplorer graph={STORE_GRAPH as any} statusBySlug={STATUS_BY_SLUG} nvlRef={ref} />,
    )
    const nodeIds = () => (ref.current.getNodes() as any[]).map((n) => n.id).sort()
    const relTypes = () => [...new Set((ref.current.getRelationships() as any[]).map((r) => r.type))].sort()
    const layerButton = (layer: string) => {
      const button = [...container.querySelectorAll(".graph-legend button")].find((b) => b.textContent === layer)
      assert.ok(button, `layer toggle for ${layer} is present`)
      return button
    }
    const toggle = async (layer: string) => {
      await act(async () => {
        layerButton(layer).dispatchEvent(new MouseEvent("click", { bubbles: true }))
      })
    }

    // Skeleton only: exactly the GbuildNode set and DEPENDS_ON.
    assert.deepEqual(nodeIds(), ["GbuildNode:a-impl", "GbuildNode:b-use"], "skeleton renders only GbuildNode elements")
    assert.deepEqual(relTypes(), ["DEPENDS_ON"], "skeleton renders only DEPENDS_ON rels")
    assert.equal(ref.current.getNodeById("GbuildNode:a-impl").caption, "a-impl", "GbuildNode caption is the slug")
    assert.equal(ref.current.getNodeById("GbuildNode:a-impl").color, "#4caf7d", "skeleton keeps status colors")

    // Contract layer: Field nodes and INPUT/OUTPUT/FROM rels.
    await toggle("contract")
    assert.ok(
      ["Field:a-impl:output:value", "Field:b-use:input:value", "Field:b-use:output:result"].every((id) =>
        nodeIds().includes(id),
      ),
      "contract layer renders the Field nodes",
    )
    assert.deepEqual(relTypes(), ["DEPENDS_ON", "FROM", "INPUT", "OUTPUT"], "contract layer adds INPUT/OUTPUT/FROM")
    assert.equal(
      ref.current.getNodeById("Field:a-impl:output:value").caption,
      "value: 21",
      "Field caption shows name: value",
    )
    await toggle("contract")

    // Acceptance layer: Acceptance nodes (plus the Feature endpoint) and
    // HAS_ACCEPTANCE/SATISFIES rels.
    await toggle("acceptance")
    assert.ok(nodeIds().includes("Acceptance:a1") && nodeIds().includes("Acceptance:a2"), "acceptance layer renders Acceptance nodes")
    assert.ok(nodeIds().includes("Feature:alpha"), "acceptance layer renders the Feature endpoint of HAS_ACCEPTANCE")
    assert.deepEqual(relTypes(), ["DEPENDS_ON", "HAS_ACCEPTANCE", "SATISFIES"], "acceptance layer adds HAS_ACCEPTANCE/SATISFIES")
    await toggle("acceptance")

    // Reviews layer: Review nodes and REVIEWED rels.
    await toggle("reviews")
    assert.ok(nodeIds().includes("Review:a-impl:1") && nodeIds().includes("Review:a-impl:2"), "reviews layer renders Review nodes")
    assert.deepEqual(relTypes(), ["DEPENDS_ON", "REVIEWED"], "reviews layer adds REVIEWED")
    await toggle("reviews")

    // Knowledge layer: Note and Symbol nodes with WROTE/DEFINES rels.
    await toggle("knowledge")
    assert.ok(
      nodeIds().includes("Note:a-impl:testing:layout settles asynchronously in jsdom"),
      "knowledge layer renders Note nodes",
    )
    assert.ok(nodeIds().includes("Symbol:a-impl:toNvlGraph"), "knowledge layer renders Symbol nodes")
    assert.deepEqual(relTypes(), ["DEFINES", "DEPENDS_ON", "WROTE"], "knowledge layer adds WROTE/DEFINES")
    await toggle("knowledge")

    // All layers off again: back to exactly the skeleton.
    assert.deepEqual(nodeIds(), ["GbuildNode:a-impl", "GbuildNode:b-use"], "untoggling restores the skeleton")
    await unmount()
  })

  test("store explorer legend lists every relationship type present in the data with its color", async () => {
    const { container, unmount } = await render(
      <StoreGraphExplorer graph={STORE_GRAPH as any} statusBySlug={STATUS_BY_SLUG} />,
    )
    const legend = container.querySelector(".graph-legend")
    assert.ok(legend, "the explorer renders a legend")
    for (const [type, color] of Object.entries(FALLBACK_REL_COLORS)) {
      assert.ok((legend.textContent ?? "").includes(type), `legend lists ${type}`)
      const swatch: Element | null = legend.querySelector(`.legend-swatch[data-color='${color}']`)
      assert.ok(swatch, `legend shows ${type} with its color ${color}`)
      // jsdom serializes the inline backgroundColor to rgb(); data-color keeps the hex.
      assert.ok(
        ((swatch as HTMLElement).style.backgroundColor ?? "").length > 0,
        `swatch for ${type} carries the color as its background`,
      )
    }
    await unmount()
  })

  test("store explorer layout: any non-skeleton layer switches to force-directed, skeleton-only restores hierarchical", async () => {
    const { container, unmount } = await render(
      <StoreGraphExplorer graph={STORE_GRAPH as any} statusBySlug={STATUS_BY_SLUG} />,
    )
    const layoutToggle = [...container.querySelectorAll(".graph-toolbar button")].find((b) =>
      b.textContent?.includes("layout:"),
    )
    assert.ok(layoutToggle, "layout toggle is present")
    assert.ok(layoutToggle.textContent?.includes("hierarchical"), "skeleton-only starts hierarchical")
    const layer = [...container.querySelectorAll(".graph-legend button")].find((b) => b.textContent === "reviews")
    assert.ok(layer, "reviews layer toggle is present")

    await act(async () => {
      layer.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    assert.ok(layoutToggle.textContent?.includes("force-directed"), "a non-skeleton layer switches to force-directed")
    assert.equal(layoutToggle.getAttribute("aria-pressed"), "true")

    // The manual layout toggle still works while a layer is on.
    await act(async () => {
      layoutToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    assert.ok(layoutToggle.textContent?.includes("hierarchical"), "manual toggle pins hierarchical with a layer on")

    await act(async () => {
      layer.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    assert.ok(layoutToggle.textContent?.includes("hierarchical"), "skeleton-only restores hierarchical")
    assert.equal(layoutToggle.getAttribute("aria-pressed"), "false")
    await unmount()
  })

  test("store explorer element panel: clicking a Field node shows its labels and properties; FROM captions the recorded value", async () => {
    const ref = React.createRef<any>()
    const { container, unmount } = await render(<GraphDetail slug="alpha" pollInterval={60_000} nvlRef={ref} />)

    // Contract layer on: the FROM rel captions the recorded value flowing through it.
    const contractLayer = [...container.querySelectorAll(".graph-legend button")].find((b) => b.textContent === "contract")
    assert.ok(contractLayer, "contract layer toggle is present")
    await act(async () => {
      contractLayer.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    const fromRel = (ref.current.getRelationships() as any[]).find(
      (r) => r.id === "FROM:Field:b-use:input:value->Field:a-impl:output:value",
    )
    assert.ok(fromRel, "contract layer renders the FROM rel")
    assert.ok(String(fromRel.caption).includes("21"), "FROM rel caption contains the recorded value")

    // Pin hierarchical layout so positions settle synchronously in jsdom.
    const layoutToggle = [...container.querySelectorAll(".graph-toolbar button")].find((b) =>
      b.textContent?.includes("layout:"),
    )
    await act(async () => {
      layoutToggle!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))
    })

    // Clicking a Field node opens the element panel with its labels and properties.
    const wrapper = container.querySelector("#NVL_interactive-wrapper") as Element
    const field = (ref.current.getNodes() as any[]).find((n) => n.id === "Field:a-impl:output:value")
    assert.ok(field, "contract layer renders the output Field node")
    const { x, y } = field.clientPosition as { x: number; y: number }
    await act(async () => {
      wrapper.dispatchEvent(new MouseEvent("mousedown", { clientX: x, clientY: y, button: 0, bubbles: true }))
      wrapper.dispatchEvent(new MouseEvent("click", { clientX: x, clientY: y, button: 0, bubbles: true }))
    })
    const panel = container.querySelector(".element-panel")
    assert.ok(panel, "clicking a Field node opens the element panel")
    assert.equal(panel.getAttribute("aria-label"), "element Field:a-impl:output:value")
    const panelText = panel.textContent ?? ""
    for (const expected of ["Field", "Field:a-impl:output:value", "name", "value", "21", "shape", "<integer>"]) {
      assert.ok(panelText.includes(expected), `element panel should contain ${JSON.stringify(expected)}`)
    }
    assert.ok(!container.querySelector(".node-panel:not(.element-panel)"), "a Field click does not open the node panel")

    // Esc closes the element panel.
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    })
    assert.ok(!container.querySelector(".element-panel"), "Esc closes the element panel")
    await unmount()
  })
})
