import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * The mark in the tab is the mark in the rail, and stays that way.
 *
 * `Logo.tsx` paints itself with `var(--primary)` and friends, so recolouring
 * the product carries the mark along. **A favicon cannot**: it is a separate
 * document with no access to the application's stylesheet, so `public/logo.svg`
 * holds literal copies of those three values.
 *
 * Which is a copy, and copies drift. Nothing in the build would notice -- the
 * page would keep rendering, the icon would keep loading, and the tab would
 * quietly wear last season's terracotta. This is the only thing that would
 * say so.
 *
 * A source-level invariant, like contentColumn.test.ts: what the icon looks
 * like is a question for the walkthrough, and what it is made of is a question
 * for here.
 */
const ROOT = join(import.meta.dirname, "..")

/** The palette values the mark is built from. */
const TOKENS = ["--primary", "--background", "--accent-2"]

describe("标签页上的图标", () => {
  it("三个颜色与调色板一字不差", () => {
    const css = readFileSync(join(ROOT, "src", "index.css"), "utf8")
    const svg = readFileSync(join(ROOT, "public", "logo.svg"), "utf8")

    for (const token of TOKENS) {
      const declared = new RegExp(`^\\s*${token}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`, "m").exec(css)
      expect(declared, `index.css 里找不到 ${token}`).not.toBeNull()
      expect(
        svg.toLowerCase(),
        `public/logo.svg 里的颜色与 ${token} 不一致；换过配色就把它也改了`,
      ).toContain(declared![1].toLowerCase())
    }
  })

  // A browser asks for /favicon.ico whether or not anything declares it. This
  // app had none, so every visit logged a 404 at the server; the file exists
  // to answer that request, and the ICO header is what makes it an icon rather
  // than a PNG with the wrong extension.
  it("favicon.ico 是一个真的 ICO，且不止一个尺寸", () => {
    const ico = readFileSync(join(ROOT, "public", "favicon.ico"))
    expect(ico.readUInt16LE(0), "reserved 必须是 0").toBe(0)
    expect(ico.readUInt16LE(2), "类型必须是 1（icon）").toBe(1)
    expect(ico.readUInt16LE(4), "至少 16 与 32 两个尺寸").toBeGreaterThanOrEqual(2)
  })

  it("三个文件都被 index.html 声明了", () => {
    const html = readFileSync(join(ROOT, "index.html"), "utf8")
    for (const href of ["/logo.svg", "/favicon.ico", "/apple-touch-icon.png"]) {
      expect(html).toContain(href)
    }
  })
})
