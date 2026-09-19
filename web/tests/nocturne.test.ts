import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

/**
 * The Nocturne system, pinned at the source (030).
 *
 * Nine things that would each drift silently. A pale token back in the sheet,
 * a Lucide import in a new file, an `animate-in` restored by `shadcn add`, a
 * `dark:` utility with no styles behind it -- the page keeps rendering, the
 * build keeps passing, and the product wears a little of last season. jsdom
 * cannot see any of it, so these read the files instead, the way
 * contentColumn.test.ts and favicon.test.ts already do.
 *
 * The twenty-four status values are the one place this is stricter than a
 * grep: the handoff calls them final, and a retune nobody re-measured is how a
 * status quietly stops being tellable from the page.
 */
const WEB = join(import.meta.dirname, "..")
const SRC = join(WEB, "src")

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(tsx?|css)$/.test(e.name)) out.push(p)
  }
  return out
}

/** Files under src/ that match, as src-relative paths. */
function hits(re: RegExp, roots: string[] = [SRC]): string[] {
  return roots
    .flatMap((r) => walk(r))
    .filter((f) => re.test(readFileSync(f, "utf8")))
    .map((f) => f.slice(WEB.length + 1).replaceAll("\\", "/"))
    .sort()
}

const css = readFileSync(join(SRC, "index.css"), "utf8")
const pkg = readFileSync(join(WEB, "package.json"), "utf8")

describe("Nocturne 钉在源码上", () => {
  // Handoff §Design Tokens, verbatim. bg / fg / bar, in that order.
  it("八个状态色的二十四个值与交接文档一字不差", () => {
    const want: Record<string, [string, string, string]> = {
      slate: ["oklch(0.34 0.02 260)", "oklch(0.86 0.02 260)", "oklch(0.62 0.03 260)"],
      green: ["oklch(0.34 0.06 150)", "oklch(0.88 0.10 150)", "oklch(0.66 0.12 150)"],
      blue: ["oklch(0.34 0.07 250)", "oklch(0.88 0.08 250)", "oklch(0.66 0.12 250)"],
      amber: ["oklch(0.36 0.07 75)", "oklch(0.90 0.12 80)", "oklch(0.72 0.14 75)"],
      red: ["oklch(0.34 0.08 20)", "oklch(0.88 0.10 20)", "oklch(0.64 0.16 20)"],
      violet: ["oklch(0.34 0.08 300)", "oklch(0.88 0.08 300)", "oklch(0.66 0.13 300)"],
      teal: ["oklch(0.34 0.05 190)", "oklch(0.88 0.08 190)", "oklch(0.66 0.10 190)"],
      rose: ["oklch(0.34 0.07 350)", "oklch(0.88 0.09 350)", "oklch(0.66 0.14 350)"],
    }
    for (const [slot, [bg, fg, line]] of Object.entries(want)) {
      const m = new RegExp(
        `\\.status-${slot}\\s*\\{\\s*--status-bg:\\s*([^;]+);\\s*--status-fg:\\s*([^;]+);\\s*--status-line:\\s*([^;]+);`,
      ).exec(css)
      expect(m, `index.css 里找不到 .status-${slot} 的三个值`).not.toBeNull()
      expect([m![1].trim(), m![2].trim(), m![3].trim()], slot).toEqual([bg, fg, line])
    }
  })

  // Not a bare `animate-`: animate-spin is the loading ring and stays. What
  // goes is every enter/exit transition shadcn ships on its floating layers.
  it("没有进出场动画", () => {
    expect(hits(/animate-(in|out)\b|fade-(in|out)-|zoom-(in|out)-|slide-(in|out)-/)).toEqual([])
    expect(css).not.toMatch(/tw-animate-css/)
    expect(pkg).not.toMatch(/tw-animate-css/)
  })

  it("图标只有 Phosphor", () => {
    expect(hits(/lucide-react/)).toEqual([])
    expect(pkg).not.toMatch(/lucide-react/)
  })

  // 017's rule, kept: one theme, and a dark: utility would be a class with
  // nothing behind it.
  it("没有第二套主题", () => {
    expect(hits(/\bdark:|\.dark\b|prefers-color-scheme/)).toEqual([])
  })

  // Colour lives in the token sheet and nowhere else (017, now enforced).
  it("routes 与 features 里零处十六进制色", () => {
    expect(hits(/#[0-9a-fA-F]{6}\b/, [join(SRC, "routes"), join(SRC, "features")])).toEqual([])
  })

  // Self-hosted, and the previous faces are gone with their theme.
  it("字体自托管，旧字体不再出现", () => {
    expect(hits(/googleapis|gstatic/)).toEqual([])
    expect(hits(/Caprasimo|Figtree/)).toEqual([])
    expect(pkg).not.toMatch(/caprasimo|figtree/)
  })

  // Nocturne has no pills. The five that remain are round because the thing
  // itself is round: a radio's dot, the 16px "?" (handoff: 16px 圆形), the
  // import dialog's numbered step circles, the avatar in the rail, and the two
  // outlined circles behind the sign-in card.
  it("rounded-full 只在五处", () => {
    expect(hits(/rounded-full/)).toEqual([
      "src/components/ui/radio-group.tsx",
      "src/features/common/Hint.tsx",
      "src/features/import/ImportDialog.tsx",
      "src/routes/AppShell.tsx",
      "src/routes/Login.tsx",
    ])
  })

  // Two Organic-only tokens. Either coming back means somebody reached for a
  // hover or a radius the system does not have.
  it("Organic 专有的 token 不存在", () => {
    expect(css).not.toMatch(/--primary-hover|--radius-2xl|--radius-xl/)
  })

  it("根元素声明 color-scheme: dark", () => {
    expect(css).toMatch(/color-scheme:\s*dark/)
  })
})
