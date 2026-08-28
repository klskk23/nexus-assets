import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Button } from "@/components/ui/button"

describe("toolchain smoke", () => {
  it("renders a shadcn/ui Button and finds it by role", () => {
    render(<Button>录入设备</Button>)
    expect(screen.getByRole("button", { name: "录入设备" })).toBeInTheDocument()
  })
})
