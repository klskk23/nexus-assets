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
/**
 * vaul (the drawer) asks whether the viewport prefers reduced motion, and
 * jsdom has no matchMedia at all. Reporting "no preference" is the honest
 * answer for a headless run.
 */
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

/**
 * vaul also reads the drawer's transform when the pointer is released, and
 * falls back to the vendor-prefixed names when it is empty. jsdom reports ""
 * for transform and has no prefixed properties at all, so vaul ends up calling
 * .match on undefined and throws out of an event handler, where no test can
 * catch it. Reporting the CSS initial value is both honest and enough.
 */
if (typeof window !== "undefined") {
  const computed = window.getComputedStyle.bind(window)
  window.getComputedStyle = ((el: Element, pseudo?: string | null) => {
    const style = computed(el, pseudo ?? undefined)
    if (!style.transform) {
      Object.defineProperty(style, "transform", { value: "none", configurable: true })
    }
    return style
  }) as typeof window.getComputedStyle
}

/**
 * jsdom lays nothing out, so every element measures 0x0 and a chart's
 * responsive container concludes there is no room to draw in. A stub that only
 * swallows the calls leaves recharts rendering an empty SVG -- the assertions
 * then pass or fail for reasons that have nothing to do with the chart.
 *
 * So this one reports a fixed size, once, on observe. The number is arbitrary;
 * what matters is that it is not zero.
 */
if (typeof globalThis.ResizeObserver === "undefined") {
  const SIZE = { width: 640, height: 320 }
  globalThis.ResizeObserver = class {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      const entry = {
        target,
        contentRect: { ...SIZE, top: 0, left: 0, bottom: SIZE.height, right: SIZE.width, x: 0, y: 0 },
        borderBoxSize: [{ inlineSize: SIZE.width, blockSize: SIZE.height }],
        contentBoxSize: [{ inlineSize: SIZE.width, blockSize: SIZE.height }],
        devicePixelContentBoxSize: [{ inlineSize: SIZE.width, blockSize: SIZE.height }],
      } as unknown as ResizeObserverEntry
      this.callback([entry], this)
    }
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
