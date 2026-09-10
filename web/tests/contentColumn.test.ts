import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

/**
 * One rule decides how wide a page is, and it lives in AppShell.
 *
 * That rule is now "the panel's width, and nothing else" -- AppShell declares
 * no width class at all. Which makes this test the only thing standing between
 * that and a page quietly capping itself again: with no number left in
 * AppShell to contradict, a stray max-w- would simply win.
 *
 * A source-level invariant, not a rendered one, and deliberately so: none of
 * this has behaviour jsdom can see. jsdom performs no layout, so
 * getBoundingClientRect returns zeroes and any assertion about a width or a
 * proportion would pass whatever the CSS said. The real widths are measured in
 * specs/020-fluid-content-column/measure.mjs against a browser.
 *
 * What this guards is the thing that silently comes back: a page reaching for
 * its own width. 018 shipped three of those (960 / 760 / 640) and 020 removed
 * two; nothing in the type system or the tests would notice a fourth.
 */
const ROOT = join(import.meta.dirname, "..", "src")

/** Widths that are allowed, and what each one is deciding. */
const ALLOWED: Record<string, string> = {
  "features/common/ListToolbar.tsx": "搜索框，是控件宽度不是内容列",
  "routes/Assets.tsx": "备注列的截断宽度，是单元格",
  "routes/Login.tsx":
    "登录卡片的宽度，是卡片不是内容列 —— 这一页没有外壳，卡片自己就是那块面板",
  "features/common/SearchSelect.tsx":
    "下拉面板的上限，是浮层不是内容列 —— 面板按内容撑开，这个数只拦住病态的长名字",
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".tsx") ? [join(dir, e.name)] : [],
  )
}

describe("the content column", () => {
  it("is declared in one place, and no page declares its own width", () => {
    const found: string[] = []
    for (const file of [...walk(join(ROOT, "routes")), ...walk(join(ROOT, "features"))]) {
      const src = readFileSync(file, "utf8")
      // sm:max-w-* is a dialog's own ceiling, which is not a content column.
      const hits = src.match(/(?<!sm:)max-w-[\w[\]%().,-]+/g) ?? []
      if (hits.length) found.push(file.slice(ROOT.length + 1).replaceAll("\\", "/"))
    }
    expect(found.sort()).toEqual(Object.keys(ALLOWED).sort())
  })
})
