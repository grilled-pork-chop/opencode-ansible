import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { homedir } from "node:os"
import { fileURLToPath } from "node:url"

/** Result of {@link ensureWrapper}: the installed path, and whether it was newly created. */
interface WrapperResult {
  path: string
  created: boolean
}

/**
 * Installs the `marketplace` bang-shell wrapper so users can type
 * `!marketplace <command>` in OpenCode.
 *
 * The wrapper is a tiny shell script that runs this plugin's `cli.ts` through
 * opencode's **own** embedded Bun (`BUN_BE_BUN=1 <opencode> <cli.ts> …`). Both
 * the opencode binary and the script are referenced by absolute path, so the
 * wrapper needs no `node`/`bun` on the host — only opencode, which is already
 * installed. It is written next to the opencode binary (a directory that is, by
 * definition, on the shell `PATH`), falling back to `~/.local/bin`.
 *
 * The resolved plugin settings are baked into the wrapper as environment
 * variables, so the separate CLI process (which otherwise only sees `process.env`)
 * honors configuration set in `opencode.json` — the plugin and the CLI agree.
 *
 * Idempotent: rewrites only when the content changes (including when the baked
 * config changes).
 *
 * @param bakedEnv - Environment variables to inject ahead of the CLI invocation.
 * @returns The wrapper path and whether it was just created, or `null` if no
 *          writable target directory was found.
 */
export async function ensureWrapper(bakedEnv: Record<string, string>): Promise<WrapperResult | null> {
  const opencodeBin = process.execPath
  const cliPath = fileURLToPath(new URL("./cli.ts", import.meta.url))
  const assignments = Object.entries(bakedEnv)
    .map(([key, value]) => `${key}=${quote(value)}`)
    .join(" ")
  const content = `#!/bin/sh\nexec env BUN_BE_BUN=1 ${assignments} ${quote(opencodeBin)} ${quote(cliPath)} "$@"\n`

  for (const dir of [dirname(opencodeBin), join(homedir(), ".local", "bin")]) {
    const result = await tryWrite(dir, content)
    if (result) return result
  }
  return null
}

/** Writes the wrapper into `dir`, returning the result or `null` if the dir is not writable. */
async function tryWrite(dir: string, content: string): Promise<WrapperResult | null> {
  const path = join(dir, "marketplace")
  try {
    if ((await readFileOrNull(path)) === content) return { path, created: false }
    await mkdir(dir, { recursive: true })
    await writeFile(path, content, "utf8")
    await chmod(path, 0o755)
    return { path, created: true }
  } catch {
    return null
  }
}

/** Reads a file, or returns `null` if it does not exist. */
async function readFileOrNull(path: string): Promise<string | null> {
  try {
    await access(path)
    return await readFile(path, "utf8")
  } catch {
    return null
  }
}

/** Single-quotes a path for safe embedding in a POSIX shell script. */
function quote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}
