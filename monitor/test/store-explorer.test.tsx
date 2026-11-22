// Render tests for the store graph explorer (the feature detail Graph tab):
// layer toggles, the rel-type legend, layout switching, and the element panel
// for node and relationship clicks — against a mocked fetch.
// Runs in jsdom (no vite needed):  node --import tsx --test monitor/test/store-explorer.test.tsx
import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { STATUS_BY_SLUG, STORE_GRAPH } from "./fixtures.ts"
import { React, act, render } from "./helpers.tsx"

const { GraphDetail } = await import("../ui/GraphDetail.tsx")
const { StoreGraphExplorer, FALLBACK_REL_COLORS } = await import("../ui/StoreGraphExplorer.tsx")

// Clicks the canvas at a client position the way NVL's click interaction
// expects: mousedown to anchor the drag check, then click.
const clickAt = async (wrapper: Element, x: number, y: number) => {
  await act(async () => {
    wrapper.dispatchEvent(new MouseEvent("mousedown", { clientX: x, clientY: y, button: 0, bubbles: true }))
    wrapper.dispatchEvent(new MouseEvent("click", { clientX: x, clientY: y, button: 0, bubbles: true }))
  })
}

// Renders the Graph tab and waits for the hierarchical layout to settle
// (synchronous fallback in jsdom).
const renderGraphTab = async () => {
  const ref = React.createRef<any>()
  const rendered = await render(<GraphDetail slug="alpha" pollInterval={60_000} nvlRef={ref} />)
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300))
  })
  const wrapper = rendered.container.querySelector("#NVL_interactive-wrapper") as Element
  assert.ok(wrapper, "graph tab mounts the NVL wrapper")
  const positionOf = (id: string) =>
    (ref.current.getNodes() as any[]).find((n) => n.id === id).clientPosition as { x: number; y: number }
  return { ref, wrapper, positionOf, ...rendered }
}

describe("store graph explorer", () => {
  test("skeleton-only renders the GbuildNode set; layer toggles add their node kinds and rels", async () => {
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

  test("legend lists every relationship type present in the data with its color", async () => {
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

  test("layout: any non-skeleton layer switches to force-directed, skeleton-only restores hierarchical", async () => {
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

  test("element panel: clicking a Field node shows its labels and properties; FROM captions the recorded value", async () => {
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
    await clickAt(wrapper, x, y)
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

  test("element panel for a node lists its incoming and outgoing relationships with the element at the other end", async () => {
    const { container, unmount, wrapper, positionOf } = await renderGraphTab()

    // Contract layer on so the input Field (which has both an incoming INPUT
    // and an outgoing FROM rel) is rendered; pin hierarchical and let it settle.
    const contractLayer = [...container.querySelectorAll(".graph-legend button")].find((b) => b.textContent === "contract")
    assert.ok(contractLayer, "contract layer toggle is present")
    await act(async () => {
      contractLayer.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    const layoutToggle = [...container.querySelectorAll(".graph-toolbar button")].find((b) =>
      b.textContent?.includes("layout:"),
    )
    await act(async () => {
      layoutToggle!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 300))
    })

    const { x, y } = positionOf("Field:b-use:input:value")
    await clickAt(wrapper, x, y)
    const panel = container.querySelector(".element-panel")
    assert.ok(panel, "clicking the input Field opens the element panel")
    assert.equal(panel.getAttribute("aria-label"), "element Field:b-use:input:value")
    const panelText = panel.textContent ?? ""
    for (const expected of [
      "incoming",
      "INPUT",
      "GbuildNode:b-use",
      "outgoing",
      "FROM",
      "Field:a-impl:output:value",
    ]) {
      assert.ok(panelText.includes(expected), `element panel should contain ${JSON.stringify(expected)}`)
    }
    await unmount()
  })

  test("clicking a relationship opens the element panel with its type, endpoints and properties", async () => {
    const { container, unmount, wrapper, positionOf } = await renderGraphTab()

    // The skeleton DEPENDS_ON rel is always visible; click its midpoint.
    const from = positionOf("GbuildNode:b-use")
    const to = positionOf("GbuildNode:a-impl")
    await clickAt(wrapper, (from.x + to.x) / 2, (from.y + to.y) / 2)

    const panel = container.querySelector(".element-panel")
    assert.ok(panel, "clicking a relationship opens the element panel")
    assert.equal(
      panel.getAttribute("aria-label"),
      "element DEPENDS_ON:GbuildNode:b-use->GbuildNode:a-impl",
      "the panel shows the clicked rel",
    )
    const panelText = panel.textContent ?? ""
    for (const expected of [
      "DEPENDS_ON",
      "from",
      "GbuildNode:b-use",
      "to",
      "GbuildNode:a-impl",
      "reason",
      '"charted order"',
    ]) {
      assert.ok(panelText.includes(expected), `element panel should contain ${JSON.stringify(expected)}`)
    }
    assert.ok(!container.querySelector(".node-panel:not(.element-panel)"), "a rel click does not open the node panel")
    await unmount()
  })
})
