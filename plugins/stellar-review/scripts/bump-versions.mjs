// Keep npm, Claude Code and Codex release versions in lockstep.
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const USAGE =
  "usage: node scripts/bump-versions.mjs <patch|minor|major> [--package-json <path>] [--plugin-json <path>] [--codex-json <path>]"

const LEVELS = new Set(["patch", "minor", "major"])
const SEMVER = /^\d+\.\d+\.\d+$/
const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..")

const die = (message) => {
  process.stderr.write(`bump-versions: ${message}\n`)
  process.exit(1)
}

const DEFAULT_PATHS = new Map([
  ["--package-json", join(pluginRoot, "package.json")],
  ["--plugin-json", join(pluginRoot, ".claude-plugin", "plugin.json")],
  ["--codex-json", join(pluginRoot, ".codex-plugin", "plugin.json")],
])

const parseArgs = (argv) => {
  const [level, ...flags] = argv
  if (!LEVELS.has(level)) die(`level must be one of patch|minor|major, got: ${level ?? "(none)"}\n${USAGE}`)
  const paths = new Map(DEFAULT_PATHS)
  for (let index = 0; index < flags.length; index += 2) {
    const flag = flags[index]
    const value = flags[index + 1]
    if (!paths.has(flag)) die(`unknown argument: ${flag}\n${USAGE}`)
    if (!value || value.startsWith("--")) die(`${flag} needs a path`)
    paths.set(flag, value)
  }
  return { level, paths: [...paths.values()] }
}

const readManifest = (path) => {
  let text
  try {
    text = readFileSync(path, "utf8")
  } catch {
    return die(`cannot read ${path}`)
  }
  let json
  try {
    json = JSON.parse(text)
  } catch (error) {
    return die(`${path} is not valid JSON: ${error.message}`)
  }
  if (typeof json.version !== "string" || !SEMVER.test(json.version)) {
    return die(`${path} has no plain x.y.z version field: ${JSON.stringify(json.version)}`)
  }
  return { text, version: json.version }
}

const bump = (version, level) => {
  const [major, minor, patch] = version.split(".").map(Number)
  if (level === "major") return `${major + 1}.0.0`
  if (level === "minor") return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

// Swap the version value in the raw text rather than re-serializing, so a bump
// diff is exactly one line: key order, the inline keywords array, indentation
// and the trailing newline all survive byte-for-byte. The old value is
// anchored (dots escaped) and must match exactly once.
const setVersion = (path, text, from, to) => {
  const needle = new RegExp(`"version"(\\s*:\\s*)"${from.replace(/\./g, "\\.")}"`, "g")
  const hits = text.match(needle)
  if (!hits || hits.length !== 1) {
    return die(`${path}: expected exactly one "version": "${from}" entry, found ${hits?.length ?? 0}`)
  }
  return text.replace(needle, `"version"$1"${to}"`)
}

const { level, paths } = parseArgs(process.argv.slice(2))
const manifests = paths.map((path) => ({ path, ...readManifest(path) }))
const version = manifests[0].version
if (manifests.some((manifest) => manifest.version !== version)) {
  const versions = manifests.map((manifest) => `${manifest.path} has ${manifest.version}`)
  die(`manifest versions disagree: ${versions.join(", ")} — align them first`)
}

const next = bump(version, level)
const rewritten = manifests.map((manifest) => ({
  path: manifest.path,
  text: setVersion(manifest.path, manifest.text, version, next),
}))
// Validate every rewrite before writing any of the manifests.
for (const { path, text } of rewritten) {
  const json = JSON.parse(text)
  if (json.version !== next) die(`${path}: rewrite lost the version field`)
}
for (const { path, text } of rewritten) writeFileSync(path, text)

process.stdout.write(`${next}\n`)
