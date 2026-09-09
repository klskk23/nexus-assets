import { Link } from "react-router"

import { tAudit, tMeta } from "@/i18n"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { usePermissions, type Permission } from "@/features/auth/usePermissions"

/**
 * The pairs of lists that describe one thing between them.
 *
 * Two routes each, not one address with two tables: a CrudPage keeps its
 * search and its page number in the address bar, so sharing an address would
 * mean typing in one list paged the other (016, decision 107). The two audits
 * joined this for the same reason -- both filter, both page, both write to the
 * address.
 *
 * Two routes, one navigation entry. A vendor is something a model has and a
 * group is a handful of fields -- neither is a place of its own, and giving
 * each a top-level entry would make the bar longer without making anything
 * easier to find.
 */
interface Tab {
  value: string
  to: string
  label: () => string
  /** Hides the tab from people who cannot open it. See below for why hidden. */
  permission?: Permission
}

const GROUPS: Record<string, Tab[]> = {
  models: [
    { value: "models", to: "/models", label: () => tMeta.vendors.tabModels },
    { value: "vendors", to: "/models/vendors", label: () => tMeta.vendors.tabVendors },
  ],
  fields: [
    { value: "fields", to: "/fields", label: () => tMeta.fieldGroups.tabFields },
    { value: "groups", to: "/fields/groups", label: () => tMeta.fieldGroups.tabGroups },
  ],
  audit: [
    { value: "audit", to: "/audit", label: () => tAudit.tabOperations, permission: "audit.read" },
    {
      value: "transfers",
      to: "/audit/transfers",
      label: () => tAudit.tabMovements,
      permission: "transfer.audit",
    },
  ],
}

/** Which tab bar, and which of its two is the current page. */
export type MetadataTab = "models" | "vendors" | "fields" | "groups" | "audit" | "transfers"

const GROUP_OF: Record<MetadataTab, keyof typeof GROUPS> = {
  models: "models",
  vendors: "models",
  fields: "fields",
  groups: "fields",
  audit: "audit",
  transfers: "audit",
}

export function MetadataTabs({ current }: { current: MetadataTab }) {
  const { can } = usePermissions()
  const tabs = GROUPS[GROUP_OF[current]].filter((tab) => !tab.permission || can(tab.permission))

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
