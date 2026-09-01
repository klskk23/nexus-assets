import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, ApiError, getToken, restoreSession, setToken } from "@/lib/api"

// The api client talks to fetch directly, which is the level this behaviour
// lives at: an expired access token must be renewed underneath the request
// that hit it, without the page ever seeing a 401.
const fetchMock = vi.fn()

beforeEach(() => {
  setToken(null)
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  setToken(null)
})

function json(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  }
}

describe("session renewal", () => {
  it("refreshes once and replays the request that met the 401", async () => {
    setToken("stale")
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: "unauthenticated", message: "过期" } }))
      .mockResolvedValueOnce(json(200, { token: "fresh", user: { id: "u1" } }))
      .mockResolvedValueOnce(json(200, { id: "u1" }))

    await expect(api.get("/me")).resolves.toEqual({ id: "u1" })

    const paths = fetchMock.mock.calls.map((c) => c[0])
    expect(paths).toEqual(["/api/me", "/api/auth/refresh", "/api/me"])
    // The replay carries the token the refresh handed back.
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe("Bearer fresh")
    expect(getToken()).toBe("fresh")
  })

  // Rotation means a second refresh with the same cookie is a replay, which
  // the server treats as a stolen chain. Six queries on mount must therefore
  // produce one refresh, not six.
  it("refreshes once for a burst of failures", async () => {
    setToken("stale")
    const seen = new Set<string>()
    fetchMock.mockImplementation((path: string) => {
      if (path === "/api/auth/refresh") return Promise.resolve(json(200, { token: "fresh" }))
      // Each path fails once, the way three queries would when the same access
      // token expires under all of them.
      if (!seen.has(path)) {
        seen.add(path)
        return Promise.resolve(json(401, { error: { code: "unauthenticated", message: "过期" } }))
      }
      return Promise.resolve(json(200, { ok: true }))
    })

    await Promise.all([api.get("/a"), api.get("/b"), api.get("/c")])

    const refreshes = fetchMock.mock.calls.filter((c) => c[0] === "/api/auth/refresh")
    expect(refreshes).toHaveLength(1)
  })

  it("gives up when the refresh is refused, and reports the original failure", async () => {
    setToken("stale")
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: "unauthenticated", message: "过期" } }))
      .mockResolvedValueOnce(json(401, { error: { code: "unauthenticated", message: "过期" } }))

    await expect(api.get("/me")).rejects.toBeInstanceOf(ApiError)
    // The stale token is dropped, so nothing else tries to use it.
    expect(getToken()).toBeNull()
  })

  // A tab opened after the access token expired still holds the cookie, so the
  // app can come back without anyone signing in again.
  it("restores a session from the cookie alone", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { token: "fresh", user: { id: "u1" } }))
    await expect(restoreSession()).resolves.toBe("fresh")
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/refresh")
  })

  it("reports no session when the cookie is gone too", async () => {
    fetchMock.mockResolvedValueOnce(json(401, { error: {} }))
    await expect(restoreSession()).resolves.toBeNull()
  })
})
