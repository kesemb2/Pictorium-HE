import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import { InstallModal } from "@/components/InstallModal"
import { renderWithCtx } from "@/__tests__/test-utils"

describe("InstallModal", () => {
  it("renders GitHub star gratification footer when open", () => {
    renderWithCtx(
      <InstallModal isOpen={true} onClose={vi.fn()} manifestUrl="https://pictorium.test/manifest.json" />
    )

    const starLink = screen.getByLabelText("Star Pictorium on GitHub")
    expect(starLink).toBeInTheDocument()
    expect(starLink).toHaveAttribute("href", "https://github.com/Eful97/Pictorium")
    expect(screen.getByText("Lascia una stella su GitHub")).toBeInTheDocument()
  })
})
