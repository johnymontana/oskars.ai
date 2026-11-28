// Render tests for the app shell: the header navigation, hash routing, and
// the theme/status-chip wiring — against a mocked fetch.
// Runs in jsdom (no vite needed):  node --import tsx --test monitor/test/app.test.tsx
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, test } from "node:test"
import { dom } from "./setup.ts"
import { GRAPH, OVERVIEW } from "./fixtures.ts"
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
      ["#/", "Features"],
      ["#/attention", "Attention"],
      ["#/knowledge", "Knowledge"],
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
    assert.ok(container.querySelector("a[href='#/features/store-alpha?node=b-use']"), "#/attention renders the attention view")
    await goto("#/knowledge")
    assert.ok(container.querySelector("input[type='search']"), "#/knowledge renders the knowledge view")
    await goto("#/")
    assert.ok((container.textContent ?? "").includes("gbuild features"), "#/ renders the feature list")
    const overview = container.querySelector("a[href='#/features/store-alpha/overview']")
    assert.ok(overview)
    await goto(overview.getAttribute("href")!)
    assert.match(container.textContent ?? "", /Progress.*Completed: 1.*Ready: 1.*Ready to run/s)
    assert.equal(container.querySelector("a[href='#/features/store-alpha?node=b-use']")?.textContent, "Use alpha value")
    await goto("#/features/alpha")
    assert.ok((container.textContent ?? "").includes("wave 0"), "#/features/<slug> still renders the graph detail")
    await unmount()
    window.location.hash = ""
  })

  test("sample navigation keeps feature requests in the sample workspace", async (t) => {
    window.history.replaceState(null, "", "/sample/#/")
    const fetch = t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
      if (String(input) === "/sample/api/overview") return Response.json(OVERVIEW)
      if (String(input) === "/sample/api/features/store-alpha/graph") return Response.json(GRAPH)
      throw new Error(`Unexpected API request ${input}`)
    })
    const { container, unmount } = await render(<App pollInterval={60_000} />)
    t.after(async () => {
      await unmount()
      window.history.replaceState(null, "", "/#/")
    })
    assert.equal(container.querySelector("aside[aria-label='Sample workspace'] a")?.getAttribute("href"), "/")
    const link = container.querySelector("a[href='#/features/store-alpha/overview']")
    assert.ok(link)
    await act(async () => {
      window.history.replaceState(null, "", link.getAttribute("href"))
      window.dispatchEvent(new dom.window.Event("hashchange"))
    })
    assert.match(container.textContent ?? "", /Progress/)
    assert.deepEqual(fetch.mock.calls.map(({ arguments: [path] }) => path), [
      "/sample/api/overview", "/sample/api/features/store-alpha/graph",
    ])
  })

  test("opens the intended node from an attention deep link on the first render", async (t) => {
    window.history.replaceState(null, "", "#/features/store-alpha?node=b-use")
    const { container, unmount } = await render(<App pollInterval={60_000} />)
    t.after(async () => {
      await unmount()
      window.history.replaceState(null, "", "#/")
    })
    assert.ok(container.querySelector("aside[aria-label='node b-use']"))
  })

  test("offers project choices for an ambiguous legacy slug", async (t) => {
    window.history.replaceState(null, "", "#/features/duplicate")
    const fetch = globalThis.fetch
    t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== "/api/features/duplicate/graph") return fetch(input, init)
      return Response.json({
        error: "feature name is ambiguous",
        matches: [
          { store_id: "store-alpha", project: "/repo/project-one", slug: "duplicate" },
          { store_id: "store-beta", project: "/repo/project-two", slug: "duplicate" },
        ],
      }, { status: 409 })
    })
    const { container, unmount } = await render(<App pollInterval={60_000} />)
    t.after(async () => {
      await unmount()
      window.history.replaceState(null, "", "#/")
    })
    assert.match(container.textContent ?? "", /Choose a project for duplicate/)
    assert.ok(container.querySelector("a[href='#/features/store-alpha']"))
    assert.ok(container.querySelector("a[href='#/features/store-beta']"))
  })

  test("cancels a slow poll when switching stores and ignores its eventual response", async (t) => {
    window.history.replaceState(null, "", "#/features/store-alpha?node=b-use")
    t.mock.timers.enable({ apis: ["setTimeout"] })
    const fetch = globalThis.fetch
    let resolveAlpha: (response: Response) => void = () => undefined
    const alphaResponse = new Promise<Response>((resolve) => { resolveAlpha = resolve })
    let alphaSignal: AbortSignal | null | undefined
    let requests = 0
    t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== "/api/features/store-alpha/graph") return fetch(input, init)
      requests += 1
      alphaSignal = init?.signal
      return alphaResponse
    })
    const { container, unmount } = await render(<App pollInterval={3_000} />)
    t.after(async () => {
      await unmount()
      window.history.replaceState(null, "", "#/")
    })
    await act(async () => { t.mock.timers.tick(9_000) })
    assert.equal(requests, 1, "a refresh is only scheduled after the active request settles")

    await act(async () => {
      window.history.replaceState(null, "", "#/features/store-gamma")
      window.dispatchEvent(new dom.window.Event("hashchange"))
    })
    assert.equal(alphaSignal?.aborted, true)
    assert.match(container.textContent ?? "", /Gamma feature done/)
    await act(async () => { resolveAlpha(Response.json(GRAPH)) })
    assert.match(container.textContent ?? "", /Gamma feature done/)
    assert.doesNotMatch(container.textContent ?? "", /Alpha feature done/)
  })

})
