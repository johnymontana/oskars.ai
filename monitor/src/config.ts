// Monitor config: a JSON file listing the root directories to scan for gbuild
// stores. `{ "roots": ["~/code", "/abs/path"] }` — `~/` and relative paths
// resolve to absolute. A missing file, invalid JSON or a wrong shape throws a
// clear Error; the caller prints the message, nothing crashes.
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"

const exec = promisify(execFile)

export interface ProjectSource {
  directory: string
  gbuild: string
}

export interface MonitorConfig {
  roots: string[]
  project?: ProjectSource
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

export async function loadProjectConfig(path: string, cwd = process.cwd()): Promise<MonitorConfig> {
  const selected = resolve(cwd, path)
  const gitPath = async (option: string) =>
    (await exec("git", ["-C", selected, "rev-parse", "--path-format=absolute", option])).stdout.replace(/\r?\n$/, "")
  try {
    const [directory, gitDir] = await Promise.all([gitPath("--show-toplevel"), gitPath("--git-common-dir")])
    return { roots: [], project: { directory, gbuild: join(gitDir, "gbuild") } }
  } catch {
    throw new Error(`Cannot open ${selected} as a Git project. Pass the path to a checkout or linked worktree with --project.`)
  }
}

export async function checkRelate(): Promise<void> {
  const help = "Install Relate 1.0.1 or newer from https://relatedb.ai and check that relate --version works on PATH."
  let version: string
  try {
    version = (await exec("relate", ["--version"], { timeout: 5000 })).stdout
  } catch {
    throw new Error(help)
  }
  const match = /\bRelate\s+v?(\d+)\.(\d+)\.(\d+)/i.exec(version)
  const major = Number(match?.[1])
  const minor = Number(match?.[2])
  const patch = Number(match?.[3])
  if (!match || major < 1 || (major === 1 && minor === 0 && patch === 0)) {
    throw new Error(help)
  }
}
