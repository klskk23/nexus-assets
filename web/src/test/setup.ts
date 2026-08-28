import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach, beforeEach } from "vitest"

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

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
})
