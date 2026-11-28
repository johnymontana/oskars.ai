import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, mkdir, rename, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { readActiveAttempt } from "../src/attempt.ts"

test("only the published timing for the current attempt is used", async () => {
  const root = await mkdtemp(join(tmpdir(), "monitor-attempt-"))
  try {
    const db = join(root, "db")
    const inbox = join(root, "inbox")
    await mkdir(inbox)
    const slug = "first-node"
    const first = randomUUID()
    const second = randomUUID()
    const path = (id: string) => join(inbox, [slug, id, "timing"].join("."))
    const start = "2026-07-28T15:00:00Z"
    const end = "2026-07-28T15:00:07Z"
    const waiting = { started_at: null, completed_at: null }
    await writeFile(path(first), start + "\n")
    assert.deepEqual(await readActiveAttempt(db, slug, first), { started_at: start, completed_at: null })
    assert.deepEqual(await readActiveAttempt(db, slug, second), waiting)
    assert.equal(await readActiveAttempt(db, slug, null), null)
    assert.equal(await readActiveAttempt(db, "../outside", first), null)

    await writeFile(path(second) + ".tmp", start + "\n" + end + "\n")
    assert.deepEqual(await readActiveAttempt(db, slug, second), waiting)
    await rename(path(second) + ".tmp", path(second))
    assert.deepEqual(await readActiveAttempt(db, slug, second), { started_at: start, completed_at: end })
    await writeFile(path(second), "2026-02-31T15:00:00Z\n")
    assert.deepEqual(await readActiveAttempt(db, slug, second), waiting)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
