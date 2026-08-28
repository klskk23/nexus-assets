import { zh } from "@/i18n/zh"

/** Field-level messages keyed by field key, straight from the error envelope. */
export type FieldErrors = Record<string, string>

/** The single error shape every non-2xx response uses. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: FieldErrors,
    /** Extra payload some refusals carry, such as what is blocking an archive. */
    readonly referrers?: { kind: string; id: string; label: string }[],
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

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers["Content-Type"] = "application/json"

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (res.status === 204) return undefined as T

  const text = await res.text()
  const payload = text ? JSON.parse(text) : null

  if (!res.ok) {
    const e = payload?.error ?? {}
    throw new ApiError(res.status, e.code ?? "internal_error", e.message ?? zh.common.requestFailed, e.fields, e.referrers)
  }
  return payload as T
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
}
