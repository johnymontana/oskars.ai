// Vite config for the monitor web UI. `npm run dev` serves the UI with hot
// reload and proxies /api to a running monitor API server (MONITOR_API_URL,
// default http://127.0.0.1:8420). `npm run build` emits dist/, which the API
// server also serves when present.
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": process.env.MONITOR_API_URL ?? "http://127.0.0.1:8420",
    },
  },
})
