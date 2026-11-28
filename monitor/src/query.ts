// Store queries always run read-only. Passive reads request the entire graph,
// while the query console uses a separate row and byte budget.
import { spawn } from "node:child_process"

export type Row = Record<string, unknown>

interface QueryLimits {
  maxRows?: number
  maxBytes?: number
  timeoutMs?: number
}

const STORE_TIMEOUT_MS = 10_000
const STORE_MAX_BYTES = 64 * 1024 * 1024

export class RelateLimitError extends Error {
  constructor(readonly kind: "timeout" | "output", message: string) {
    super(message)
  }
}

export function runRelate(args: string[], input: string, limits: QueryLimits = {}): Promise<string> {
  const { maxBytes = STORE_MAX_BYTES, timeoutMs = STORE_TIMEOUT_MS } = limits
  return new Promise((resolvePromise, reject) => {
    const child = spawn("relate", args, { stdio: ["pipe", "pipe", "pipe"] })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let received = 0
    let limit: RelateLimitError | undefined
    const stop = (error: RelateLimitError) => {
      if (limit) return
      limit = error
      child.kill("SIGKILL")
    }
    const deadline = setTimeout(() => stop(new RelateLimitError("timeout", `Relate query timed out after ${timeoutMs / 1000}s`)), timeoutMs)
    const read = (chunks: Buffer[]) => (chunk: Buffer) => {
      if (limit) return
      received += chunk.byteLength
      if (received > maxBytes) {
        stop(new RelateLimitError("output", `Relate query exceeded the ${maxBytes} byte output limit`))
        return
      }
      chunks.push(chunk)
    }
    child.stdout.on("data", read(stdout))
    child.stderr.on("data", read(stderr))
    child.on("error", (cause) => {
      clearTimeout(deadline)
      reject(new Error(`failed to run relate: ${cause.message}`))
    })
    child.on("close", (code) => {
      clearTimeout(deadline)
      if (limit) reject(limit)
      else if (code === 0) resolvePromise(Buffer.concat(stdout).toString("utf8"))
      else reject(new Error(`relate exited ${code}: ${Buffer.concat(stderr).toString("utf8").trim()}`))
    })
    // Relate can exit before reading stdin. Report its exit and stderr.
    child.stdin.on("error", () => {})
    child.stdin.end(input)
  })
}

export async function queryStore(db: string, cypher: string, limits: QueryLimits = {}): Promise<Row[]> {
  const args = ["query", "--read-only", "--database", db, "--mode", "jsonl", "--max-rows", String(limits.maxRows ?? 0)]
  const stdout = await runRelate(args, cypher, limits)
  return stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Row)
}
