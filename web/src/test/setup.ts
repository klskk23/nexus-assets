import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach, beforeEach } from "vitest"

import { applyLang } from "@/i18n"

/**
 * Tests run in Chinese, whatever jsdom claims navigator.language is.
 *
 * The assertions in this suite are written against the Chinese copy, and
 * jsdom reports en-US, so without this the language would follow the test
 * runner's idea of a browser rather than the thing under test. Switching
 * languages is covered on purpose in tests/language.test.tsx.
 */
applyLang("zh")

/**
 * jsdom in this setup exposes no localStorage at all -- it is undefined rather
 * than throwing. Production code therefore guards every access, and that guard
 * is load-bearing: without it the asset list would crash on mount instead of
 * simply forgetting the column selection.
 *
 * Tests that assert the selection survives need a working store, so one is
 * installed here. It is only defined when the environment lacks it, so a jsdom
 * version that does provide localStorage keeps its own implementation.
 */
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>()
  const shim: Storage = {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (k) => store.get(k) ?? null,
    key: (i) => [...store.keys()][i] ?? null,
    removeItem: (k) => void store.delete(k),
    setItem: (k, v) => void store.set(k, String(v)),
  }
  Object.defineProperty(globalThis, "localStorage", { value: shim, writable: true })
}

/**
 * Radix builds its popup components on browser APIs jsdom does not implement.
 * Without these, opening a Select throws rather than rendering its listbox, so
 * every test touching a dropdown would fail for reasons that have nothing to do
 * with the code under test.
 *
 * Each shim is the smallest thing that satisfies the call. None of them can
 * mask a real defect: they stand in for scrolling and pointer capture, neither
 * of which any assertion here depends on.
 */
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
}
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
if (typeof globalThis.DOMRect === "undefined") {
  // Radix measures the trigger to position the listbox.
  globalThis.DOMRect = class {
    constructor(
      readonly x = 0,
      readonly y = 0,
      readonly width = 0,
      readonly height = 0,
    ) {}
    get top() {
      return this.y
    }
    get left() {
      return this.x
    }
    get right() {
      return this.x + this.width
    }
    get bottom() {
      return this.y + this.height
    }
    static fromRect() {
      return new globalThis.DOMRect()
    }
    toJSON() {
      return this
    }
  } as unknown as typeof DOMRect
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
})
