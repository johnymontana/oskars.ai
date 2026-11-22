// Finds gbuild stores under the configured roots: a store is
// <root>/<project>/.git/gbuild/<feature>/db holding a Relate manifest.
import { readFile, readdir } from "node:fs/promises"
import { join } from "node:path"

export interface Store {
  project: string
  slug: string
  db: string
}

const isStore = async (db: string): Promise<boolean> => {
  try {
    const manifest = JSON.parse(await readFile(join(db, "manifest.json"), "utf8"))
    return manifest?.query_engine != null
  } catch {
    return false
  }
}

export async function discoverStores(roots: string[]): Promise<Store[]> {
  const stores: Store[] = []
  for (const root of roots) {
    let projects
    try {
      projects = await readdir(root, { withFileTypes: true })
    } catch {
      continue // a missing or unreadable root is not fatal — other roots still scan
    }
    for (const project of projects) {
      if (!project.isDirectory()) continue
      const gbuild = join(root, project.name, ".git", "gbuild")
      let features
      try {
        features = await readdir(gbuild, { withFileTypes: true })
      } catch {
        continue // no .git/gbuild (or .git is a worktree file) — not a gbuild project
      }
      for (const feature of features) {
        if (!feature.isDirectory()) continue
        const db = join(gbuild, feature.name, "db")
        if (await isStore(db)) stores.push({ project: join(root, project.name), slug: feature.name, db })
      }
    }
  }
  return stores
}
