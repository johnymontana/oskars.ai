// Shared jsdom environment for the monitor UI render tests. Import this (via
// helpers.tsx) before any module that touches the DOM.
//
// jsdom has no canvas or ResizeObserver, so the canvas 2d context and
// ResizeObserver are stubbed before NVL is imported; that is enough for NVL's
// canvas renderer to initialize and hold the fixture nodes/rels.
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

export { dom }
