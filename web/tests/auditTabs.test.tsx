import { describe, expect, it } from "vitest"
import { screen } from "@testing-library/react"

import { renderWithProviders } from "@/test/renderWithProviders"
import { AuditTabs } from "@/features/audit/AuditTabs"
import { tAudit } from "@/i18n"

/**
 * The audit is two lists now, and a tab you cannot open should not be there.
 *
 * This is the opposite of the product's usual rule -- unavailable actions are
 * disabled, not hidden, so people can learn that they exist -- and it is the
 * same exception the audit's navigation entry already makes. A tab that only
 * ever answers 403 invites the click that is refused.
 *
 * 025 removed the two metadata pairs this component also served, so the audits
 * are all it does now -- and it moved out of features/metadata with them.
 */
describe("审计的两个页签", () => {
  it("两个权限都有时，两个页签都在", () => {
    renderWithProviders(<AuditTabs current="audit" />, {
      permissions: ["audit.read", "transfer.audit"],
    })
    expect(screen.getByRole("tab", { name: tAudit.tabOperations })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: tAudit.tabMovements })).toBeInTheDocument()
  })

  // One tab is not a choice, so there is no bar at all -- a tab strip offering
  // a single destination is a control with nothing to control.
  it("只有流转审计权限时，整条页签栏都不画", () => {
    renderWithProviders(<AuditTabs current="transfers" />, {
      permissions: ["transfer.audit"],
    })
    expect(screen.queryByRole("tab", { name: tAudit.tabOperations })).not.toBeInTheDocument()
    expect(screen.queryByRole("tab", { name: tAudit.tabMovements })).not.toBeInTheDocument()
  })

  it("只有操作审计权限时同样如此", () => {
    renderWithProviders(<AuditTabs current="audit" />, { permissions: ["audit.read"] })
    expect(screen.queryByRole("tab", { name: tAudit.tabMovements })).not.toBeInTheDocument()
  })
})
