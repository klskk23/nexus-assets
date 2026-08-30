import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"

import {
  AttrDefaultsEditor,
  toAttrDefaults,
  type DefaultRow,
} from "@/features/metadata/AttrDefaultsEditor"

/** A tiny host so the editor can be driven the way the Models page drives it. */
function Host({ initial = [] as DefaultRow[] }) {
  const [rows, setRows] = useState<DefaultRow[]>(initial)
  return (
    <>
      <AttrDefaultsEditor rows={rows} onChange={setRows} />
      <output data-testid="result">{JSON.stringify(toAttrDefaults(rows))}</output>
    </>
  )
}

describe("AttrDefaultsEditor", () => {
  // The capability existed in the data layer from the first version and had no
  // way in from the interface, so model defaults had never once been used.
  it("adds, edits and removes rows", async () => {
    const user = userEvent.setup()
    render(<Host />)

    await user.click(screen.getByRole("button", { name: "添加一条" }))
    await user.type(screen.getByLabelText("键名"), "firmware")
    await user.type(screen.getByLabelText("值"), "2.1.3")
    expect(screen.getByTestId("result")).toHaveTextContent('{"firmware":"2.1.3"}')

    await user.click(screen.getByRole("button", { name: /移除/ }))
    expect(screen.getByTestId("result")).toHaveTextContent("{}")
  })

  // A half-typed key is a normal intermediate state. Collapsing to an object
  // while typing would make two blank keys collide and a row vanish under the
  // cursor.
  it("keeps two blank rows apart while they are being typed", async () => {
    const user = userEvent.setup()
    render(<Host />)

    await user.click(screen.getByRole("button", { name: "添加一条" }))
    await user.click(screen.getByRole("button", { name: "添加一条" }))
    expect(screen.getAllByLabelText("键名")).toHaveLength(2)

    await user.type(screen.getAllByLabelText("键名")[1], "ports")
    expect(screen.getAllByLabelText("键名")).toHaveLength(2)
    expect(screen.getByTestId("result")).toHaveTextContent('{"ports":""}')
  })

  it("drops keys that are blank or only whitespace", () => {
    const got = toAttrDefaults([
      { key: "firmware", value: "2.1.3" },
      { key: "   ", value: "x" },
      { key: "", value: "y" },
    ])
    expect(got).toEqual({ firmware: "2.1.3" })
  })

  it("renders the rows it is given", () => {
    render(<Host initial={[{ key: "ports", value: "8" }]} />)
    const keys = screen.getAllByLabelText("键名") as HTMLInputElement[]
    expect(keys[0].value).toBe("ports")
    expect(screen.getByTestId("result")).toHaveTextContent('{"ports":"8"}')
  })
})
