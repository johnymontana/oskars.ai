// Render tests for the feature detail view: the compact wave list with its
// node side panel, the graph tab neighborhood focus, and the hash-addressable
// tabs — against a mocked fetch.
// Runs in jsdom (no vite needed):  node --import tsx --test monitor/test/graph-detail.test.tsx
import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { dom } from "./setup.ts"
import "./fixtures.ts"
import { React, act, render } from "./helpers.tsx"

const { GraphDetail } = await import("../ui/GraphDetail.tsx")
const { App } = await import("../ui/App.tsx")

describe("graph detail", () => {
  test("compact wave list opens the side panel with full node detail, Esc closes it", async () => {
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
})
