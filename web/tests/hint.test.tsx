import { describe, expect, it } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Hint } from "@/features/common/Hint"
import { renderWithProviders } from "@/test/renderWithProviders"

describe("Hint", () => {
  it("keeps the explanation out of the way until it is asked for", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Hint>绑到的每个类别与型号都要求填</Hint>)

    expect(screen.queryByText("绑到的每个类别与型号都要求填")).not.toBeInTheDocument()

    await user.hover(screen.getByRole("button", { name: "这是什么" }))
    expect(await screen.findByText("绑到的每个类别与型号都要求填")).toBeInTheDocument()
  })

  // A pointer is not the only way to ask. The trigger is a real button, so it
  // is in the tab order and opens on focus.
  it("opens for the keyboard as well", async () => {
    const user = userEvent.setup()
    renderWithProviders(<Hint>只能选一种</Hint>)

    await user.tab()
    expect(screen.getByRole("button", { name: "这是什么" })).toHaveFocus()
    expect(await screen.findByText("只能选一种")).toBeInTheDocument()
  })
})
