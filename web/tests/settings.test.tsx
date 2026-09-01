import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { SettingsDialog } from "@/features/settings/SettingsDialog"
import { renderWithProviders } from "@/test/renderWithProviders"
import { chooseFromMenu } from "@/test/menu"
import { applyLang } from "@/i18n"

const get = vi.fn()
const post = vi.fn()
const patch = vi.fn()
const del = vi.fn()
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: {
      get: (p: string) => get(p),
      post: (p: string, b: unknown) => post(p, b),
      patch: (p: string, b: unknown) => patch(p, b),
      del: (p: string) => del(p),
    },
  }
})

const keys = [
  {
    id: "k1",
    name: "盘点脚本",
    prefix: "nxk_abc123def456",
    expires_at: "2026-12-01T00:00:00Z",
    last_used_at: undefined,
    created_at: "2026-09-01T00:00:00Z",
  },
]

beforeEach(() => {
  // One case switches the language for real, and the dictionaries are
  // module-level bindings: without this the next case renders in English.
  applyLang("zh")
  get.mockReset().mockResolvedValue(keys)
  post.mockReset().mockResolvedValue({ key: { ...keys[0], id: "k2" }, secret: "nxk_new.secret-value" })
  patch.mockReset().mockResolvedValue({})
  del.mockReset().mockResolvedValue(undefined)
})

describe("SettingsDialog", () => {
  // The preference belongs to the person, not the machine: choosing English on
  // one computer used to mean choosing it again on the next.
  it("saves the language to the account as well as applying it", async () => {
    const user = userEvent.setup()
    renderWithProviders(<SettingsDialog onClose={vi.fn()} />)

    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("combobox", { name: "语言" }))
    await user.click(await screen.findByRole("option", { name: "English" }))

    await waitFor(() => expect(patch).toHaveBeenCalledWith("/me", { lang: "en" }))
  })

  it("saves the theme to the account", async () => {
    const user = userEvent.setup()
    renderWithProviders(<SettingsDialog onClose={vi.fn()} />)

    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("combobox", { name: "主题" }))
    await user.click(await screen.findByRole("option", { name: "浅色" }))

    await waitFor(() => expect(patch).toHaveBeenCalledWith("/me", { theme: "light" }))
  })

  it("lists the keys it has, without ever showing a secret", async () => {
    renderWithProviders(<SettingsDialog onClose={vi.fn()} />)

    const row = await screen.findByRole("row", { name: /盘点脚本/ })
    expect(within(row).getByText("nxk_abc123def456")).toBeInTheDocument()
    // Never used is a fact worth saying, not a blank cell.
    expect(within(row).getByText("从未使用")).toBeInTheDocument()
  })

  // Only the hash is kept, so the response that creates a key is the one and
  // only chance to copy it. The dialog says so.
  it("shows a new key once, with a way to copy it", async () => {
    const user = userEvent.setup()
    renderWithProviders(<SettingsDialog onClose={vi.fn()} />)
    await screen.findByRole("row", { name: /盘点脚本/ })

    await user.click(screen.getByRole("button", { name: "新建密钥" }))
    await user.type(screen.getByLabelText("名称"), "监控")
    await user.click(screen.getByRole("button", { name: "生成密钥" }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/api-keys", { name: "监控", days: 90 }),
    )
    expect(await screen.findByText("nxk_new.secret-value")).toBeInTheDocument()
    expect(screen.getByText(/再也看不到/)).toBeInTheDocument()
  })

  it("revokes a key from the row menu, after confirming", async () => {
    const user = userEvent.setup()
    renderWithProviders(<SettingsDialog onClose={vi.fn()} />)

    const row = await screen.findByRole("row", { name: /盘点脚本/ })
    await chooseFromMenu(user, row, "撤销")
    const confirm = await screen.findByRole("alertdialog")
    await user.click(within(confirm).getByRole("button", { name: "撤销" }))

    await waitFor(() => expect(del).toHaveBeenCalledWith("/api-keys/k1"))
  })

  // The documentation is served by this very binary, so the link is a plain
  // same-origin one -- no CDN to be unreachable on an internal network.
  it("links to the embedded API docs", async () => {
    renderWithProviders(<SettingsDialog onClose={vi.fn()} />)
    const link = await screen.findByRole("link", { name: /打开接口文档/ })
    expect(link).toHaveAttribute("href", "/api/docs")
    expect(link).toHaveAttribute("target", "_blank")
  })
})
