// UI entry point. The poll interval defaults to 3000ms and can be overridden
// with the `?poll=<ms>` query parameter.
import { createRoot } from "react-dom/client"
import { App } from "./App.tsx"
import "./theme.css"
import "./graph-tools.css"

const requested = Number(new URLSearchParams(window.location.search).get("poll"))

createRoot(document.getElementById("root") as HTMLElement).render(
  <App pollInterval={requested > 0 ? requested : undefined} />,
)
