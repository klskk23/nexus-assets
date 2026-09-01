import { t } from "@/i18n"
import { getLang } from "@/i18n"

/** Field-level messages keyed by field key, straight from the error envelope. */
export type FieldErrors = Record<string, string>

/** A configuration object standing in the way: an expression key, or a category. */
export interface Referrer {
  kind: string
  id: string
  label: string
}

/**
 * Something standing in the way, named the way a person would refer to it.
 *
 * The three refusals that carry these block on different things -- devices
 * holding a value, devices holding a location, a whole category's children,
 * assets and models -- so the identifying field varies. `name` is the one the
 * interface actually renders, and it is always there.
 */
export interface Blocker {
  name: string
  /** Set when the blocker is an asset. */
  asset_id?: string
  /** Set when the refusal can block on several kinds of record. */
  id?: string
  kind?: string
  reason?: string
}

/** A stable key for rendering a blocker list. */
export const blockerKey = (b: Blocker) => b.asset_id ?? b.id ?? b.name

/** The single error shape every non-2xx response uses. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: FieldErrors,
    /** Configuration pointing at the target: expression keys, display keys. */
    readonly referrers?: Referrer[],
    /**
     * Devices standing in the way. The server has attached these since the
     * first version so a page could show exactly what is blocking; until now
     * the client parsed only `referrers` and threw them away.
     */
    readonly blockers?: Blocker[],
    /** How many are blocking in total; `blockers` is only the first few. */
    readonly total?: number,
  ) {
    super(message)
    this.name = "ApiError"
  }

  /** True when another writer got there first and the client must reload. */
  get isVersionConflict() {
    return this.code === "version_conflict"
  }
}

const TOKEN_KEY = "nexus.token"

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token === null) localStorage.removeItem(TOKEN_KEY)
    else localStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* private mode; the session simply does not survive a reload */
  }
}

/**
 * Trades the refresh cookie for a new access token.
 *
 * One flight at a time: a page that fires six queries on mount would otherwise
 * rotate the refresh token six times in parallel, and rotation means five of
 * those are replays -- which the server is right to treat as a stolen chain.
 */
let refreshing: Promise<boolean> | null = null

async function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch("/api/auth/refresh", { method: "POST" })
        if (!res.ok) return false
        const body = (await res.json()) as { token?: string }
        if (!body.token) return false
        setToken(body.token)
        return true
      } catch {
        return false
      }
      // Cleared as it settles, not later: everyone awaiting already holds this
      // promise, and the next failure deserves a fresh attempt rather than a
      // cached answer from minutes ago.
    })().finally(() => {
      refreshing = null
    })
  }
  return refreshing
}

/** Called when a session cannot be recovered, so the app can show the door. */
let onSessionLost: () => void = () => {}

export function setSessionLostHandler(fn: () => void) {
  onSessionLost = fn
}

/** Signs in again from the cookie alone, for a tab opened after the access
 * token expired. Returns the token when it worked. */
export async function restoreSession(): Promise<string | null> {
  return (await refreshSession()) ? getToken() : null
}

/** Ends the session on the server as well, so the cookie stops working. */
export async function endSession(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST" })
  } catch {
    // Offline: the local token is dropped either way, and the session will
    // expire on its own.
  }
  setToken(null)
}

async function request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  // The server answers in whatever this asks for, so a refusal comes back in
  // the same language as the button that caused it.
  const headers: Record<string, string> = { "Accept-Language": getLang() }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers["Content-Type"] = "application/json"

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  // An expired access token is the normal state of affairs now, not a
  // sign-out: refresh once, replay the request, and only then give up.
  if (res.status === 401 && retry && !path.startsWith("/auth/")) {
    if (await refreshSession()) return request<T>(method, path, body, false)
    setToken(null)
    onSessionLost()
  }

  if (res.status === 204) return undefined as T

  const text = await res.text()
  const payload = text ? JSON.parse(text) : null

  if (!res.ok) {
    const e = payload?.error ?? {}
    throw new ApiError(
      res.status,
      e.code ?? "internal_error",
      e.message ?? t.common.requestFailed,
      e.fields,
      e.referrers,
      e.blockers,
      e.total,
    )
  }
  return payload as T
}

/**
 * Reads the filename the server asked for, falling back to the caller's.
 *
 * Both spellings appear in one header: `filename*=UTF-8''...` is the one that
 * survives non-ASCII, and it wins when present, which is why it is read first.
 */
function filenameFrom(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1])
    } catch {
      /* a malformed header is not a reason to refuse the file */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition)
  return plain?.[1] ?? fallback
}

/**
 * Fetches a file and hands it to the browser as a download.
 *
 * It goes through fetch rather than being a link because every credential this
 * app has lives in a header: a plain `<a href download>` is a navigation, it
 * carries no Authorization, and the server answered 401 -- which the browser
 * reports as a download that failed, with no way to read why. Refreshing an
 * expired token on the way is the same reason: an export is exactly the kind
 * of thing somebody clicks after leaving a tab open all morning.
 */
export async function download(path: string, fallback: string, retry = true): Promise<void> {
  const headers: Record<string, string> = { "Accept-Language": getLang() }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`/api${path}`, { headers })

  if (res.status === 401 && retry) {
    if (await refreshSession()) return download(path, fallback, false)
    setToken(null)
    onSessionLost()
  }

  if (!res.ok) {
    const text = await res.text()
    let payload: { error?: { code?: string; message?: string } } | null = null
    try {
      payload = text ? JSON.parse(text) : null
    } catch {
      /* not the error envelope -- a proxy's own page, say */
    }
    const e = payload?.error ?? {}
    throw new ApiError(res.status, e.code ?? "internal_error", e.message ?? t.common.requestFailed)
  }

  const blob = await res.blob()
  const name = filenameFrom(res.headers.get("Content-Disposition"), fallback)
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement("a")
    a.href = url
    a.download = name
    // In the document because Firefox ignores a click on a detached node.
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    // Not straight away: the browser has to read the blob first, and revoking
    // it in the same tick cancels the download it was just given.
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
}
