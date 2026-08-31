import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { ExpressionHelp } from "@/features/fields/ExpressionHelp"
import { applyLang } from "@/i18n"

beforeEach(() => applyLang("zh"))
afterEach(() => applyLang("zh"))

describe("ExpressionHelp", () => {
  it("stays out of the way until asked for", async () => {
    const user = userEvent.setup()
    render(<ExpressionHelp />)

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "怎么写" }))
    expect(await screen.findByRole("dialog")).toBeInTheDocument()
  })

  // It is read while writing, so it has to carry the things you look up: what
  // can be read, what the functions do, and a worked example of each shape.
  it("covers what can be read, the functions, and worked examples", async () => {
    const user = userEvent.setup()
    render(<ExpressionHelp />)
    await user.click(screen.getByRole("button", { name: "怎么写" }))
    const panel = await screen.findByRole("dialog")

    expect(within(panel).getByText("attrs.键名")).toBeInTheDocument()
    expect(within(panel).getByText("category.code")).toBeInTheDocument()
    expect(within(panel).getByText("hex2dec(x)")).toBeInTheDocument()
    expect(within(panel).getByText("pad(x, n)")).toBeInTheDocument()

    // The two shapes the old engine could not express at all.
    expect(within(panel).getByText('attrs.kind == "spare" ? "S" : "M"')).toBeInTheDocument()
    expect(within(panel).getByText("attrs.sn ?? hex2dec(attrs.mac)")).toBeInTheDocument()

    // And the two rules that decide whether a rule will be accepted.
    expect(panel).toHaveTextContent("结果不能为空")
    expect(panel).toHaveTextContent("必须已绑定且标为必填")
  })

  it("follows the interface language", async () => {
    const user = userEvent.setup()
    applyLang("en")
    render(<ExpressionHelp />)

    await user.click(screen.getByRole("button", { name: "How to write one" }))
    const panel = await screen.findByRole("dialog")
    expect(panel).toHaveTextContent("Writing an expression")
    expect(within(panel).getByText("attrs.key")).toBeInTheDocument()
    expect(panel).toHaveTextContent("cannot be empty")
    // No Chinese left behind in the English panel.
    expect(panel.textContent ?? "").not.toMatch(/[一-鿿]/)
  })

  it("closes on its own button", async () => {
    const user = userEvent.setup()
    render(<ExpressionHelp />)
    await user.click(screen.getByRole("button", { name: "怎么写" }))
    const panel = await screen.findByRole("dialog")

    await user.click(within(panel).getByRole("button", { name: "知道了" }))
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })
})
