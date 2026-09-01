import { vi } from "vitest"

/**
 * Stands in for the parts of a download the test environment does not have.
 *
 * jsdom has no `URL.createObjectURL` and navigates nowhere on a link click, so
 * a download would fail for reasons that have nothing to do with the code. The
 * three things worth asserting survive: what was asked for, what came back,
 * and what the browser was handed.
 */
export interface Downloads {
  /** Every URL fetched, download or not, in order. */
  urls: string[]
  /** The anchors handed to the browser: `download` is the filename. */
  saved: { name: string; href: string }[]
  /** The stub behind global fetch, for tests that need a specific answer. */
  fetchMock: ReturnType<typeof vi.fn>
  /** A CSV response, optionally with the filename the server asked for. */
  csv: (body?: string, filename?: string) => Response
  /** The error envelope every refusal uses. */
  refusal: (status: number, message: string) => Response
  restore: () => void
}

function response(body: string, init: ResponseInit & { type?: string }): Response {
  const headers = new Headers(init.headers)
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    headers,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body)),
    blob: () => Promise.resolve(new Blob([body], { type: init.type ?? "text/csv" })),
  } as unknown as Response
}

export function stubDownloads(): Downloads {
  const csv = (body = "sn\n112394521950\n", filename?: string) =>
    response(body, {
      headers: filename
        ? { "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` }
        : {},
    })

  const refusal = (status: number, message: string) =>
    response(JSON.stringify({ error: { code: "validation_failed", message } }), {
      status,
      headers: { "Content-Type": "application/json" },
      type: "application/json",
    })

  const urls: string[] = []
  const fetchMock = vi.fn((url: string) => {
    urls.push(String(url))
    return Promise.resolve(csv())
  })
  vi.stubGlobal("fetch", fetchMock)

  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL
  URL.createObjectURL = vi.fn(() => "blob:nexus/1")
  URL.revokeObjectURL = vi.fn()

  const saved: { name: string; href: string }[] = []
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ name: this.download, href: this.href })
    })

  return {
    urls,
    saved,
    fetchMock,
    csv,
    refusal,
    restore: () => {
      click.mockRestore()
      URL.createObjectURL = originalCreate
      URL.revokeObjectURL = originalRevoke
      vi.unstubAllGlobals()
    },
  }
}
