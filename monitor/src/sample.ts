import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { MonitorConfig } from "./config.ts"
import { runRelate } from "./query.ts"

export async function createSampleWorkspace(): Promise<{ config: MonitorConfig; dispose: () => Promise<void> }> {
  const [schema, example] = await Promise.all([
    readFile(new URL("../../plugins/gbuild/cypher/schema.cypher", import.meta.url), "utf8"),
    readFile(new URL("../sample/run.cypher", import.meta.url), "utf8"),
  ])
  const directory = await mkdtemp(join(tmpdir(), "gbuild-monitor-sample-"))
  const dispose = () => rm(directory, { recursive: true, force: true })
  try {
    const gbuild = join(directory, "gbuild")
    const db = join(gbuild, "publish-a-sample-site", "db")
    await mkdir(db, { recursive: true })
    await runRelate(["query", "--database", db, "--snapshot-format", "json"], schema)
    await runRelate(["query", "--database", db], example)
    return { config: { roots: [], project: { directory: "Sample workspace", gbuild } }, dispose }
  } catch (cause) {
    await dispose()
    throw cause
  }
}
