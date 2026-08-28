import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { CollapsibleTree, buildTree } from "@/features/tree/CollapsibleTree"
import { renderWithProviders } from "@/test/renderWithProviders"

// Three levels: 网络设备 > SDWAN 路由器 > 边缘型
const flat = [
  { id: "net", name: "网络设备", parent_id: null },
  { id: "rt", name: "SDWAN 路由器", parent_id: "net" },
  { id: "edge", name: "边缘型", parent_id: "rt" },
  { id: "sw", name: "企业交换机", parent_id: "net" },
]

describe("CollapsibleTree", () => {
  it("builds a tree from the flat category list", () => {
    const tree = buildTree(flat)
    expect(tree).toHaveLength(1)
    expect(tree[0].children.map((c) => c.label)).toEqual(["SDWAN 路由器", "企业交换机"])
    expect(tree[0].children[0].children[0].label).toBe("边缘型")
  })

  it("expands and collapses three levels deep", async () => {
    const user = userEvent.setup()
    renderWithProviders(<CollapsibleTree nodes={buildTree(flat)} />)

    // Level 2 is visible because the root starts expanded; level 3 is not.
    expect(screen.getByRole("button", { name: "SDWAN 路由器" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "边缘型" })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "展开 SDWAN 路由器" }))
    expect(screen.getByRole("button", { name: "边缘型" })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "收起 SDWAN 路由器" }))
    expect(screen.queryByRole("button", { name: "边缘型" })).not.toBeInTheDocument()
  })

  it("reports the selected node and marks it in the tree", async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<CollapsibleTree nodes={buildTree(flat)} selectedId="rt" onSelect={onSelect} />)

    await user.click(screen.getByRole("button", { name: "企业交换机" }))
    expect(onSelect).toHaveBeenCalledWith("sw")

    const selected = screen.getAllByRole("treeitem").find((n) => n.getAttribute("aria-selected") === "true")
    expect(selected).toHaveTextContent("SDWAN 路由器")
  })
})
