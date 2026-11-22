// Render tests for the monitor web UI: the feature list, the graph detail
// (grouped by wave), polling, and the NVL mount — all against a mocked fetch.
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
const { toNvlGraph } = await import("../ui/NvlGraph.tsx")
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
      inputs: [],
      outputs: [{ name: "value", shape: "<integer>", from: null, value: 21 }],
      reviews: [{ attempt: 1, verdict: "pass", failed_criteria: [], at: "2026-01-01T00:11:00Z" }],
    },
    {
      slug: "b-use",
      title: "Use alpha value",
      type: "code",
      status: "frontier",
      wave: 1,
      acceptance: ["uses the value"],
      depends_on: ["a-impl"],
      inputs: [{ name: "value", shape: "<integer>", from: "a-impl.output.value", value: 21 }],
      outputs: [{ name: "result", shape: "<integer>", from: null, value: null }],
      reviews: [],
    },
  ],
}

let fetchCalls: string[] = []
globalThis.fetch = (async (input: any) => {
  const path = String(input)
  fetchCalls.push(path)
  if (path === "/api/features") return Response.json(FEATURES)
  if (path === "/api/features/alpha/graph") return Response.json(GRAPH)
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

  test("graph detail groups nodes by wave with status, acceptance, field values and verdicts", async () => {
    const { container, unmount } = await render(<GraphDetail slug="alpha" pollInterval={60_000} />)
    const text = container.textContent ?? ""
    for (const expected of [
      "wave 0",
      "a-impl",
      "completed",
      "alpha implemented",
      "21",
      "pass",
      "wave 1",
      "b-use",
      "frontier",
      "uses the value",
      "a-impl.output.value",
      "result",
    ]) {
      assert.ok(text.includes(expected), `graph detail should contain ${JSON.stringify(expected)}`)
    }
    const [wave0, wave1] = [text.indexOf("wave 0"), text.indexOf("wave 1")]
    assert.ok(wave0 !== -1 && wave1 !== -1 && wave0 < wave1, "waves render in order")
    assert.ok(container.querySelector("#NVL_interactive-wrapper"), "detail view mounts the NVL wrapper")
    assert.ok(container.querySelector("canvas"), "canvas renderer draws into the container")
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
      const link = header.querySelector(`nav a[href='${href}']`)
      assert.ok(link, `header nav links to ${href}`)
      assert.equal(link.textContent, label)
    }
    await unmount()
  })

  test("detail view mounts InteractiveNvlWrapper with the fixture nodes and DEPENDS_ON rels", async () => {
    const ref = React.createRef<any>()
    const { nodes, rels } = toNvlGraph(GRAPH.nodes as any)
    const { container, unmount } = await render(
      <InteractiveNvlWrapper ref={ref} nodes={nodes} rels={rels} nvlOptions={{ renderer: "canvas", disableWebGL: true }} />,
    )
    assert.deepEqual(
      ref.current?.getNodes().map((n: any) => n.id),
      ["a-impl", "b-use"],
    )
    assert.deepEqual(
      ref.current?.getRelationships().map((r: any) => ({ id: r.id, from: r.from, to: r.to })),
      [{ id: "b-use->a-impl", from: "b-use", to: "a-impl" }],
    )
    assert.ok(container.querySelector("canvas"), "canvas renderer draws into the container")
    await unmount()
  })
})
