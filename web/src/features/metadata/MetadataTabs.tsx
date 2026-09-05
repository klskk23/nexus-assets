import { Link } from "react-router"

import { tMeta } from "@/i18n"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

/**
 * Switches between the two lists that describe hardware: models and the
 * vendors they come from.
 *
 * Two routes, not one address with two tables. A CrudPage keeps its search and
 * its page number in the address bar, so sharing an address would mean typing
 * in one list paged the other (016, decision 107). The tabs are navigation,
 * which is why each trigger renders a Link.
 */
export function MetadataTabs({ current }: { current: "models" | "vendors" }) {
  return (
    <Tabs value={current}>
      <TabsList>
        <TabsTrigger value="models" asChild>
          <Link to="/models">{tMeta.vendors.tabModels}</Link>
        </TabsTrigger>
        <TabsTrigger value="vendors" asChild>
          <Link to="/models/vendors">{tMeta.vendors.tabVendors}</Link>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
