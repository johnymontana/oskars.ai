// Monitor config: a JSON file listing the root directories to scan for gbuild
// stores. `{ "roots": ["~/code", "/abs/path"] }` — `~/` and relative paths
// resolve to absolute. A missing file, invalid JSON or a wrong shape throws a
// clear Error; the caller prints the message, nothing crashes.
import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"

export interface MonitorConfig {
  roots: string[]
}

export async function loadConfig(path: string): Promise<MonitorConfig> {
  let raw: string
  try {
    raw = await readFile(path, "utf8")
  } catch {
    throw new Error(`monitor config not readable: ${path}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (cause) {
    throw new Error(`monitor config ${path} is not valid JSON: ${(cause as Error).message}`)
  }
  const roots = (parsed as { roots?: unknown } | null)?.roots
  if (!Array.isArray(roots) || roots.length === 0 || roots.some((r) => typeof r !== "string" || r === ""))
    throw new Error(`monitor config ${path} must be an object with a non-empty "roots" array of directory paths`)
  return {
    roots: roots.map((r) => (r.startsWith("~/") ? join(homedir(), r.slice(2)) : isAbsolute(r) ? r : resolve(r))),
  }
}
