import { Link } from "react-router"

import { tAudit } from "@/i18n"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { usePermissions, type Permission } from "@/features/auth/usePermissions"

/**
 * The two audits, which are two routes behind one navigation entry.
 *
 * This used to serve the metadata pairs as well -- models/vendors and
 * fields/groups -- and it lived under features/metadata because of them. 025
 * merged both of those into master-detail pages, so the audits are all that is
 * left, and a "generic" component with one caller is a claim about the product
 * that is no longer true: the next person reads it as a site-wide convention
 * and reaches for it.
 *
 * Two routes rather than two tabs over one address, and that reason is
 * unchanged: both audits filter, both page, both write to the address, and two
 * of those behind a single address trample each other's query string (016,
 * decision 107). The metadata pairs left precisely because they were not that
 * shape -- a rail does not page against its detail.
 */
interface Tab {
  value: string
  to: string
  label: () => string
  /** Hides the tab from people who cannot open it. See below for why hidden. */
  permission?: Permission
}

const GROUPS: Record<"audit", Tab[]> = {
  // Movements first, and it is the entry's destination too: who has the device
  // is asked daily, who renamed a field is asked when something already broke.
  audit: [
    {
      value: "transfers",
      to: "/audit/transfers",
      label: () => tAudit.tabMovements,
      permission: "transfer.audit",
    },
    { value: "audit", to: "/audit", label: () => tAudit.tabOperations, permission: "audit.read" },
  ],
}

/** Which of the two audits is the current page. */
export type AuditTab = "audit" | "transfers"

export function AuditTabs({ current }: { current: AuditTab }) {
  const { can } = usePermissions()
  const tabs = GROUPS.audit.filter((tab) => !tab.permission || can(tab.permission))

  // Hidden, not disabled -- which is the opposite of this product's usual rule,
  // and the same exception the audit's own navigation entry already makes: a
  // tab that only ever answers 403 is worse than no tab, because it invites the
  // click that is refused. The pairs that carry no permission are unaffected.
  //
  // One surviving tab draws no bar at all. A tab strip offering a single
  // destination is a control with nothing to control.
  if (tabs.length < 2) return null

  return (
    <Tabs value={current}>
      <TabsList>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} asChild>
            {/* The labels are read here rather than at module load: the
                dictionary is a live binding, and an array built at import time
                freezes in whatever language loaded first. */}
            <Link to={tab.to}>{tab.label()}</Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
