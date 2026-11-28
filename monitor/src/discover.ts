// Finds gbuild stores under <root>/<project>/.git/gbuild/<feature>/db.
import { createHash } from "node:crypto"
import { readFile, readdir, realpath } from "node:fs/promises"
import { join } from "node:path"
import type { ProjectSource } from "./config.ts"

export interface Store {
  store_id: string
  project: string
  slug: string
  db: string
}

export interface MonitorDiagnostic {
  root?: string
  project?: string
  store_id?: string
  slug?: string
  message: string
}

const hasCode = (cause: unknown, ...codes: string[]) =>
  codes.includes((cause as NodeJS.ErrnoException).code ?? "")

const messageOf = (cause: unknown) => (cause as Error).message

export async function scanStores(roots: string[], selected?: ProjectSource): Promise<{ stores: Store[]; diagnostics: MonitorDiagnostic[] }> {
  const stores: Store[] = []
  const diagnostics: MonitorDiagnostic[] = []
  const visited = new Set<string>()
  const visitedRoots = new Set<string>()

  async function scanProject(project: string, gbuild: string) {
    let features
    try {
      features = await readdir(gbuild, { withFileTypes: true })
    } catch (cause) {
      // Most projects have no gbuild directory. Linked worktrees have a .git file.
      if (!hasCode(cause, "ENOENT", "ENOTDIR")) {
        diagnostics.push({ project, message: `Could not scan project: ${messageOf(cause)}` })
      }
      return
    }
    for (const feature of features) {
      if (!feature.isDirectory() && !feature.isSymbolicLink()) continue
      const slug = feature.name
      let db: string
      try {
        db = await realpath(join(gbuild, slug, "db"))
      } catch (cause) {
        // gbuild may have a feature worktree before its store is created.
        if (!hasCode(cause, "ENOENT")) {
          diagnostics.push({ project, slug, message: `Could not find store: ${messageOf(cause)}` })
        }
        continue
      }
      if (visited.has(db)) continue
      visited.add(db)
      const store_id = `store-${createHash("sha256").update(db).digest("hex")}`
      try {
        const manifest = JSON.parse(await readFile(join(db, "manifest.json"), "utf8"))
        if (manifest?.query_engine == null) throw new Error("manifest has no query_engine")
        stores.push({ store_id, project, slug, db })
      } catch (cause) {
        diagnostics.push({ project, store_id, slug, message: `Could not open store manifest: ${messageOf(cause)}` })
      }
    }
  }

  if (selected) await scanProject(selected.directory, selected.gbuild)
  for (const root of roots) {
    let projects
    try {
      const canonicalRoot = await realpath(root)
      if (visitedRoots.has(canonicalRoot)) continue
      visitedRoots.add(canonicalRoot)
      projects = await readdir(canonicalRoot, { withFileTypes: true })
    } catch (cause) {
      diagnostics.push({ root, message: `Could not scan root: ${messageOf(cause)}` })
      continue
    }
    for (const entry of projects) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
      const project = join(root, entry.name)
      await scanProject(project, join(project, ".git", "gbuild"))
    }
  }
  return { stores, diagnostics }
}

export async function discoverStores(roots: string[], selected?: ProjectSource): Promise<Store[]> {
  return (await scanStores(roots, selected)).stores
}
