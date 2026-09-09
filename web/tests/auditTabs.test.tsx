import { describe, expect, it } from "vitest"
import { screen } from "@testing-library/react"

import { renderWithProviders } from "@/test/renderWithProviders"
import { MetadataTabs } from "@/features/metadata/MetadataTabs"
import { tAudit, tMeta } from "@/i18n"

/**
 * The audit is two lists now, and a tab you cannot open should not be there.
 *
 * This is the opposite of the product's usual rule -- unavailable actions are
 * disabled, not hidden, so people can learn that they exist -- and it is the
 * same exception the audit's navigation entry already makes. A tab that only
 * ever answers 403 invites the click that is refused.
 *
 * The pairs that carry no permission (models/vendors, fields/groups) must be
 * unaffected by any of this.
 */
describe("审计的两个页签", () => {
  it("两个权限都有时，两个页签都在", () => {
    renderWithProviders(<MetadataTabs current="audit" />, {
      permissions: ["audit.read", "transfer.audit"],
    })
    expect(screen.getByRole("tab", { name: tAudit.tabOperations })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: tAudit.tabMovements })).toBeInTheDocument()
  })

  // One tab is not a choice, so there is no bar at all -- a tab strip offering
  // a single destination is a control with nothing to control.
  it("只有流转审计权限时，整条页签栏都不画", () => {
    renderWithProviders(<MetadataTabs current="transfers" />, {
      permissions: ["transfer.audit"],
    })
    expect(screen.queryByRole("tab", { name: tAudit.tabOperations })).not.toBeInTheDocument()
    expect(screen.queryByRole("tab", { name: tAudit.tabMovements })).not.toBeInTheDocument()
  })

  it("只有操作审计权限时同样如此", () => {
    renderWithProviders(<MetadataTabs current="audit" />, { permissions: ["audit.read"] })
    expect(screen.queryByRole("tab", { name: tAudit.tabMovements })).not.toBeInTheDocument()
  })

  // The permission filter must not reach the pairs that never had one.
  it("型号/厂商那一对不受权限过滤影响", () => {
    renderWithProviders(<MetadataTabs current="models" />, { permissions: [] })
    expect(screen.getByRole("tab", { name: tMeta.vendors.tabModels })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: tMeta.vendors.tabVendors })).toBeInTheDocument()
  })
})
