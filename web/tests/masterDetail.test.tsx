import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { screen } from "@testing-library/react"

import { renderWithProviders } from "@/test/renderWithProviders"
import { MasterDetail } from "@/features/common/MasterDetail"
import { useMasterSelection } from "@/features/common/useMasterSelection"

describe("主从骨架的布局", () => {
  it("两栏都画出来", () => {
    renderWithProviders(<MasterDetail selected list={<p>左</p>} detail={<p>右</p>} />)
    expect(screen.getByText("左")).toBeInTheDocument()
    expect(screen.getByText("右")).toBeInTheDocument()
  })

  // jsdom performs no layout, so the media query itself cannot be observed
  // here -- what is checked is that the two panes carry opposite narrow-screen
  // classes, which is the mechanism. The rendered result is measured in a
  // browser during the walkthrough.
  it("窄屏时只留一栏，且留的是哪一栏跟着选中走", () => {
    const { unmount } = renderWithProviders(
      <MasterDetail selected={false} list={<p>左</p>} detail={<p>右</p>} />,
    )
    expect(screen.getByText("左").parentElement).not.toHaveClass("max-md:hidden")
    expect(screen.getByText("右").parentElement).toHaveClass("max-md:hidden")

    unmount()
    renderWithProviders(<MasterDetail selected list={<p>左</p>} detail={<p>右</p>} />)
    expect(screen.getByText("左").parentElement).toHaveClass("max-md:hidden")
    expect(screen.getByText("右").parentElement).not.toHaveClass("max-md:hidden")
  })
})

describe("主从骨架的选中", () => {
  it("地址里的 id 在列表里，就用它", () => {
    expect(useMasterSelection(["a", "b"], "b")).toEqual({ current: "b", missing: false })
  })

  // A default, not a redirect. Rewriting the address here is the tempting
  // version and it breaks the narrow screen, where the two panes are two pages
  // and the address without an id *is* the list page: redirect off it and the
  // list becomes unreachable from every entrance.
  it("地址里什么都没有，默认显示第一条，但地址不动", () => {
    expect(useMasterSelection(["a", "b"], undefined)).toEqual({ current: "a", missing: false })
  })

  it("地址指向不存在的 id：说出来，不悄悄换一个", () => {
    expect(useMasterSelection(["a", "b"], "zzz")).toEqual({ current: "", missing: true })
  })

  it("列表是空的，就没有可显示的", () => {
    expect(useMasterSelection([], undefined).current).toBe("")
  })
})

/**
 * The shell must not know what it is showing.
 *
 * A source-level invariant, and the only kind available: jsdom cannot observe
 * "has this component grown a category-shaped concept". What it guards is the
 * failure this repository has already paid for once -- CrudPage grew "no
 * create button", "checkbox column" and "tree" switches one caller at a time,
 * and each switch looked reasonable on the day it was added.
 *
 * The second half is the same rule from the other side: with one caller, an
 * abstraction cannot be validated, only constrained. A second import appearing
 * before anyone has re-read this is how "reusable" quietly becomes "the union
 * of two callers' needs".
 */
const SHELL = ["features/common/MasterDetail.tsx", "features/common/useMasterSelection.ts"]
const SRC = join(import.meta.dirname, "..", "src")

describe("骨架不认识任何一页的内容", () => {
  it.each(SHELL)("%s 里没有类别专有的概念", (rel) => {
    const src = readFileSync(join(SRC, rel), "utf8")
    // The comments explain why CrudPage went wrong, and naming it is the
    // point; the ban is on the vocabulary of one page.
    const body = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "")
    for (const word of ["categor", "类别", "tree", "树", "count", "计数"]) {
      expect(body.toLowerCase()).not.toContain(word)
    }
  })

  // Three now, and named. 024 allowed exactly one on the grounds that an
  // abstraction with a single caller can only be constrained, not validated;
  // 025 is the validation, and the list is spelled out so that a fourth cannot
  // arrive without somebody reading this.
  it("调用方就是这四页，不多不少", () => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (/\.tsx?$/.test(e.name) && !p.includes("MasterDetail")) files.push(p)
      }
    }
    walk(SRC)
    const importers = files.filter((f) => /from "@\/features\/common\/MasterDetail"/.test(readFileSync(f, "utf8")))
    expect(importers.map((f) => f.slice(SRC.length + 1)).sort()).toEqual([
      "routes/Categories.tsx",
      "routes/Fields.tsx",
      "routes/Holders.tsx",
      "routes/Models.tsx",
    ])
  })
})
