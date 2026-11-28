import { constants } from "node:fs"
import { open } from "node:fs/promises"
import { dirname, join } from "node:path"

export interface ActiveAttempt {
  started_at: string | null
  completed_at: string | null
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const UTC_SECOND = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
const timestamp = (value: string | undefined): string | null => {
  if (!value || !UTC_SECOND.test(value)) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) && new Date(ms).toISOString() === value.replace("Z", ".000Z")
    ? value
    : null
}

// The run claims the attempt in Relate before the worker starts. The worker
// owns the timing file, so no host-specific callback or Relate write is
// needed when the worker starts. Only the current claim's file is eligible.
export async function readActiveAttempt(db: string, slug: string, attemptId: unknown): Promise<ActiveAttempt | null> {
  if (typeof attemptId !== "string" || !UUID.test(attemptId) || !SLUG.test(slug)) return null

  const waiting: ActiveAttempt = { started_at: null, completed_at: null }
  const path = join(dirname(db), "inbox", slug + "." + attemptId + ".timing")
  try {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      // The protocol is either one or two newline-terminated 20-byte UTC timestamps.
      const buffer = Buffer.alloc(43)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      if (bytesRead !== 21 && bytesRead !== 42) return waiting
      const text = buffer.toString("utf8", 0, bytesRead)
      if (!text.endsWith("\n")) return waiting
      const [start, end] = text.slice(0, -1).split("\n")
      const started_at = timestamp(start)
      if (!started_at) return waiting
      const completed = timestamp(end)
      return { started_at, completed_at: completed && completed >= started_at ? completed : null }
    } finally {
      await handle.close()
    }
  } catch {
    return waiting
  }
}
