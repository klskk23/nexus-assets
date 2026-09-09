import { describe, expect, it, vi } from "vitest"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { renderWithProviders } from "@/test/renderWithProviders"
import { SearchSelect } from "@/features/common/SearchSelect"
import { t } from "@/i18n"

const OPTIONS = [
  { value: "v1", label: "MikroTik" },
  { value: "v2", label: "Dell EMC" },
  { value: "v3", label: "华三通信" },
  { value: "c1", label: "SDWAN 路由器", keywords: "网络设备 / SDWAN 路由器" },
]

function open() {
  return renderWithProviders(
    <SearchSelect value="" onChange={vi.fn()} options={OPTIONS} placeholder="全部厂商" />,
  )
}

describe("可搜下拉", () => {
  it("匹配词中间的片段，不要求从头", async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole("combobox"))
    await user.type(screen.getByPlaceholderText("全部厂商"), "roTi")

    const list = screen.getByRole("listbox")
    expect(within(list).getByText("MikroTik")).toBeInTheDocument()
    expect(within(list).queryByText("Dell EMC")).not.toBeInTheDocument()
  })

  it("大小写不一致仍然命中", async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole("combobox"))
    await user.type(screen.getByPlaceholderText("全部厂商"), "MIKROTIK")
    expect(within(screen.getByRole("listbox")).getByText("MikroTik")).toBeInTheDocument()
  })

  // A category's own name is short and repeats across the tree; what people
  // remember is where it sits. Searching the path finds it, and the row still
  // leads with the name.
  it("按额外关键字（如类别路径）也能搜到", async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole("combobox"))
    await user.type(screen.getByPlaceholderText("全部厂商"), "网络设备")
    expect(within(screen.getByRole("listbox")).getByText("SDWAN 路由器")).toBeInTheDocument()
  })

  // A blank panel reads as broken, which is what it looked like right up until
  // somebody realised they had typed a name that is not in the list.
  it("没有命中时说出来，而不是一片空白", async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole("combobox"))
    await user.type(screen.getByPlaceholderText("全部厂商"), "zzzz")
    expect(screen.getByText(t.common.noMatches)).toBeInTheDocument()
  })

  // The whole reason this is a Popover and a Command rather than an input
  // inside the ordinary Select: the two would fight over every keystroke.
  it("纯键盘可以走完：打开、输入、上下、回车", async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <SearchSelect value="" onChange={onChange} options={OPTIONS} placeholder="全部厂商" />,
    )

    await user.tab()
    expect(screen.getByRole("combobox")).toHaveFocus()
    await user.keyboard("{Enter}")

    await user.keyboard("dell")
    await user.keyboard("{ArrowDown}")
    await user.keyboard("{Enter}")

    expect(onChange).toHaveBeenCalledWith("v2")
  })

  it("清除是选项之一，不是旁边另一个控件", async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <SearchSelect value="v1" onChange={onChange} options={OPTIONS} placeholder="全部厂商" />,
    )
    await user.click(screen.getByRole("combobox"))
    await user.click(within(screen.getByRole("listbox")).getByText("全部厂商"))
    expect(onChange).toHaveBeenCalledWith("")
  })
})
