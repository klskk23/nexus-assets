import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Everything you can pick in a menu says so when it cannot be picked.
 *
 * A source-level invariant, because there is nothing to render it against:
 * the product uses no submenus yet, and jsdom computes no styles from a
 * Tailwind class anyway. What this catches is the shape the defect had --
 * shadcn's own SubTrigger ships without the disabled pair that every
 * ordinary item carries, so a disabled submenu entry looked exactly like a
 * working one, refused to open, and explained nothing. It would also catch
 * `shadcn add` putting the upstream version back.
 *
 * The product's rule is that an unavailable action is disabled and says what
 * is missing; an entry that is disabled and says nothing is half of that.
 */
const UI = join(import.meta.dirname, "..", "src", "components", "ui")

/** Anything a person aims at inside a menu. */
const PICKABLE = /^(DropdownMenu|ContextMenu)(Item|CheckboxItem|RadioItem|SubTrigger)$/

function componentsIn(file: string): Map<string, string> {
  const src = readFileSync(join(UI, file), "utf8")
  const out = new Map<string, string>()
  // Each component is `function Name(` up to the next one; enough to read the
  // class string out of, and it does not need a parser to be right.
  const starts = [...src.matchAll(/^function (\w+)\(/gm)]
  starts.forEach((m, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index! : src.length
    out.set(m[1], src.slice(m.index!, end))
  })
  return out
}

describe("menu entries", () => {
  it.each(["dropdown-menu.tsx", "context-menu.tsx"])("say when they are disabled: %s", (file) => {
    const missing: string[] = []
    for (const [name, body] of componentsIn(file)) {
      if (!PICKABLE.test(name)) continue
      const hasFade = body.includes("data-[disabled]:opacity-50")
      const hasBlock = body.includes("data-[disabled]:pointer-events-none")
      if (!hasFade || !hasBlock) missing.push(name)
    }
    expect(missing).toEqual([])
  })
})
