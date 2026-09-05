import { Link } from "react-router"

import { tMeta } from "@/i18n"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

/**
 * The pairs of lists that describe one thing between them.
 *
 * Two routes each, not one address with two tables: a CrudPage keeps its
 * search and its page number in the address bar, so sharing an address would
 * mean typing in one list paged the other (016, decision 107).
 *
 * Two routes, one navigation entry. A vendor is something a model has and a
 * group is a handful of fields -- neither is a place of its own, and giving
 * each a top-level entry would make the bar longer without making anything
 * easier to find.
 */
const GROUPS = {
  models: [
    { value: "models", to: "/models", label: () => tMeta.vendors.tabModels },
    { value: "vendors", to: "/models/vendors", label: () => tMeta.vendors.tabVendors },
  ],
  fields: [
    { value: "fields", to: "/fields", label: () => tMeta.fieldGroups.tabFields },
    { value: "groups", to: "/fields/groups", label: () => tMeta.fieldGroups.tabGroups },
  ],
} as const

/** Which tab bar, and which of its two is the current page. */
export type MetadataTab = "models" | "vendors" | "fields" | "groups"

export function MetadataTabs({ current }: { current: MetadataTab }) {
  const tabs = current === "models" || current === "vendors" ? GROUPS.models : GROUPS.fields
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
