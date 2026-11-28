// Tests for scripts/bump-versions.mjs, the lockstep bump for stellar-review's three
// manifests. Spawns the script as a subprocess (the way the release process
// invokes it) against fixture manifests in a throwaway temp dir — never the
// real manifests — covering the three bump
// levels and the version-drift refusal. Run via repo-root `npm test`.
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const root = dirname(fileURLToPath(import.meta.url))
const script = join(root, "scripts", "bump-versions.mjs")

// The script must exist where the contract says it does — the assertions below
// spawn it via its documented relative path instead.
assert.ok(existsSync(script), `missing ${script}`)

// Fixtures modeled on the real manifests' formatting — including the inline
// keywords array a re-serializing bump would clobber — so the byte-exact
// assertions below prove only the version line moved.
const packageJsonText = (version: string) => `{
  "name": "opencode-stellar-review",
  "version": "${version}",
  "type": "module",
  "keywords": ["fixture", "inline", "array"]
}
`

const pluginJsonText = (version: string) => `{
  "name": "stellar-review",
  "version": "${version}",
  "description": "fixture standing in for .claude-plugin/plugin.json"
}
`

const writeFixtures = (version: string, overrides: { claude?: string, codex?: string } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "stellar-bump-"))
  const packageJson = join(dir, "package.json")
  const pluginJson = join(dir, "plugin.json")
  const codexJson = join(dir, "codex-plugin.json")
  writeFileSync(packageJson, packageJsonText(version))
  writeFileSync(pluginJson, pluginJsonText(overrides.claude ?? version))
  writeFileSync(codexJson, pluginJsonText(overrides.codex ?? version))
  return { packageJson, pluginJson, codexJson }
}

// The documented invocation, run the way the release process runs it: node
// scripts/bump-versions.mjs <level> with plugins/gbuild/ as the cwd, paths
// overridden at the fixtures. `root` is plugins/gbuild/ wherever the runner
// starts from, so this holds under repo-root `npm test` too.
const bump = (level: string, { packageJson, pluginJson, codexJson }: ReturnType<typeof writeFixtures>) =>
  spawnSync(
    process.execPath,
    ["scripts/bump-versions.mjs", level, "--package-json", packageJson, "--plugin-json", pluginJson,
      "--codex-json", codexJson],
    { cwd: root, encoding: "utf8" },
  )

test("patch, minor and major each bump all three manifests from 0.1.0 and print the new version", () => {
  for (const [level, expected] of [
    ["patch", "0.1.1"],
    ["minor", "0.2.0"],
    ["major", "1.0.0"],
  ] as const) {
    const fixtures = writeFixtures("0.1.0")
    const { packageJson, pluginJson, codexJson } = fixtures
    const r = bump(level, fixtures)
    assert.equal(r.status, 0, `${level}: bump failed: ${r.stderr}`)
    assert.equal(r.stdout, `${expected}\n`, `${level}: stdout is exactly the new semver`)
    assert.equal(readFileSync(packageJson, "utf8"), packageJsonText(expected), `${level}: package.json rewritten`)
    assert.equal(readFileSync(pluginJson, "utf8"), pluginJsonText(expected), `${level}: plugin.json rewritten`)
    assert.equal(readFileSync(codexJson, "utf8"), pluginJsonText(expected), `${level}: Codex manifest rewritten`)
  }
})

test("Claude and Codex version drift each fail the bump without rewriting any manifest", () => {
  for (const client of ["claude", "codex"] as const) {
    const fixtures = writeFixtures("0.1.0", { [client]: "0.0.9" })
    const paths = Object.values(fixtures)
    const before = paths.map((path) => readFileSync(path, "utf8"))
    const r = bump("patch", fixtures)
    assert.notEqual(r.status, 0, "drift must fail the bump")
    assert.ok(r.stderr.includes(fixtures.packageJson), "message names the package manifest")
    const mismatched = client === "claude" ? fixtures.pluginJson : fixtures.codexJson
    assert.ok(r.stderr.includes(mismatched), "message names the mismatched manifest")
    assert.deepEqual(paths.map((path) => readFileSync(path, "utf8")), before)
  }
})

test("an unknown level is rejected with usage before anything runs", () => {
  const fixtures = writeFixtures("0.1.0")
  const paths = Object.values(fixtures)
  const before = paths.map((path) => readFileSync(path, "utf8"))
  const r = bump("premajor", fixtures)
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /usage: node scripts\/bump-versions\.mjs/)
  assert.deepEqual(paths.map((path) => readFileSync(path, "utf8")), before)
})
