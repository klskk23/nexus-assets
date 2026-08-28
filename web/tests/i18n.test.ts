import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const SRC = join(process.cwd(), "src")

/** Files exempt from the rule, and why. */
const allowed = [
  join(SRC, "i18n"), // the strings themselves live here
  join(SRC, "components", "ui"), // shadcn/ui generated code, kept unmodified
]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (allowed.some((a) => full.startsWith(a))) continue
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

/** Strips comments so a Chinese explanation is not mistaken for copy. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
}

const chineseInLiteral = /(["'`])((?:(?!\1)[^\\]|\\.)*[一-鿿][^]*?)\1/g

describe("user-facing copy stays in one place", () => {
  // Constitution principle V: identifiers, comments and error codes are
  // English; anything a person reads is Chinese and lives in the i18n module.
  // Scattering copy through components is how a rename turns into a hunt.
  it("has no Chinese string literals outside the i18n module", () => {
    const offenders: string[] = []

    for (const file of walk(SRC)) {
      const source = stripComments(readFileSync(file, "utf8"))
      for (const match of source.matchAll(chineseInLiteral)) {
        offenders.push(`${file.replace(SRC, "src")}: ${match[0].slice(0, 60)}`)
      }
    }

    expect(offenders, `move these into src/i18n/zh.ts:\n${offenders.join("\n")}`).toEqual([])
  })

  it("keeps the i18n module free of anything but strings", () => {
    const source = readFileSync(join(SRC, "i18n", "zh.ts"), "utf8")
    // A translation file that imports application code stops being a place you
    // can read top to bottom.
    expect(source).not.toMatch(/^import .* from "@\//m)
  })
})
