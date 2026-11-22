// Runs one Cypher script against a gbuild store through the relate CLI and
// parses the jsonl rows. Every store read goes through queryStore, which is
// always `relate query --read-only --mode jsonl` — the monitor never writes.
import { spawn } from "node:child_process"

export type Row = Record<string, unknown>

export function runRelate(args: string[], input: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("relate", args, { stdio: ["pipe", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (d) => (stdout += d))
    child.stderr.on("data", (d) => (stderr += d))
    child.on("error", (cause) => reject(new Error(`failed to run relate: ${cause.message}`)))
    child.on("close", (code) =>
      code === 0 ? resolvePromise(stdout) : reject(new Error(`relate exited ${code}: ${stderr.trim()}`)),
    )
    child.stdin.end(input)
  })
}

export async function queryStore(db: string, cypher: string): Promise<Row[]> {
  const stdout = await runRelate(["query", "--read-only", "--database", db, "--mode", "jsonl"], cypher)
  return stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Row)
}
