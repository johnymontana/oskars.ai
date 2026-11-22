// Shared render helpers for the monitor UI render tests: React + act + a
// render() that mounts into a fresh container, flushing effects and the first
// poll fetch. The jsdom globals (setup.ts) are installed before React loads.
import "./setup.ts"
import type { ReactElement } from "react"

const React = await import("react")
const { act } = React
const { createRoot } = await import("react-dom/client")

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

export { React, act, render }
