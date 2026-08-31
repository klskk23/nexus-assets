import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { ThemeProvider, useTheme } from "@/features/theme/useTheme"

function Probe() {
  const { theme, toggle } = useTheme()
  return (
    <button onClick={toggle} data-testid="probe">
      {theme}
    </button>
  )
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove("dark")
})

describe("theme", () => {
  // Dark is the product's default, not something the app waits to be told.
  it("starts dark with nothing stored", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByTestId("probe")).toHaveTextContent("dark")
    expect(document.documentElement).toHaveClass("dark")
  })

  it("switches to light and remembers the choice", async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    await user.click(screen.getByTestId("probe"))

    expect(screen.getByTestId("probe")).toHaveTextContent("light")
    expect(document.documentElement).not.toHaveClass("dark")
    // color-scheme drives the browser's own widgets -- scrollbars, date
    // pickers -- which no class of ours reaches.
    expect(document.documentElement.style.colorScheme).toBe("light")
    expect(localStorage.getItem("nexus.theme")).toBe("light")
  })

  it("honours a stored light preference on the next visit", () => {
    localStorage.setItem("nexus.theme", "light")
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByTestId("probe")).toHaveTextContent("light")
  })

  // A private window throws on every storage access. The default has to hold
  // rather than the whole app failing to mount.
  it("falls back to the default when storage is unavailable", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied")
    })
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByTestId("probe")).toHaveTextContent("dark")
    spy.mockRestore()
  })
})
