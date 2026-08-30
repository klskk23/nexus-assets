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

  // Copy outlives the behaviour it describes. Two hints kept telling people
  // that a category decides how numbers are generated for a whole release after
  // that stopped being true, and nothing failed.
  it("describes no behaviour the system has dropped", () => {
    const source = readFileSync(join(SRC, "i18n", "zh.ts"), "utf8")
    const gone = [
      { phrase: "编号怎么生成", why: "编号规则已不属于类别，改由信息项承担" },
      { phrase: "编号生成规则", why: "同上" },
      { phrase: "停用信息项", why: "信息项改为可删除，停用机制已移除" },
    ]
    const found = gone.filter((g) => source.includes(g.phrase))
    expect(
      found.map((g) => `${g.phrase} —— ${g.why}`),
      "these describe behaviour that no longer exists",
    ).toEqual([])
  })

  // A string nothing references is a leftover: either the feature went and the
  // copy stayed, or the copy was written for a feature that never landed.
  it("has no entry that nothing in the application references", () => {
    const source = readFileSync(join(SRC, "i18n", "zh.ts"), "utf8")
    const keys = new Set<string>()
    for (const m of source.matchAll(/^\s{2,}(\w+):\s*[("`']/gm)) keys.add(m[1])

    const code = walk(SRC)
      .map((f) => readFileSync(f, "utf8"))
      .join("\n")

    // Some groups are read by dynamic index (zh.status[asset.status]), so a
    // literal ".key" will never appear for their members.
    const dynamic = /(zh\.status|zhMeta\.entityTypes|zhMeta\.fieldTypes|zhTransfer\.kind|zhAudit\.actions|zhAudit\.targets)\s*\[/
    const dynamicallyIndexed = dynamic.test(code)

    const statusLike = new Set([
      "in_stock", "in_use", "in_repair", "lost", "retired",
      "create", "checkout", "checkin", "transfer", "reassign", "status_change",
      "update", "archive", "delete", "recompute",
      "company", "location", "department",
      "text", "number", "boolean", "date", "enum", "reference", "mac", "ip", "url", "computed",
      "category", "field", "binding", "model", "holder", "user",
    ])

    const dead = [...keys].filter(
      (k) => !(dynamicallyIndexed && statusLike.has(k)) && !new RegExp(`\\.${k}\\b`).test(code),
    )
    expect(dead, `nothing references these entries in src/i18n/zh.ts:\n${dead.join("\n")}`).toEqual([])
  })

  it("keeps the i18n module free of anything but strings", () => {
    const source = readFileSync(join(SRC, "i18n", "zh.ts"), "utf8")
    // A translation file that imports application code stops being a place you
    // can read top to bottom.
    expect(source).not.toMatch(/^import .* from "@\//m)
  })
})
