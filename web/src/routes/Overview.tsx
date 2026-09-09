import { ChartColumnIcon, PlusIcon } from "lucide-react"
import { useState } from "react"
import { Link, useNavigate } from "react-router"
import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import type { AssetStatus, Category } from "@/lib/types"
import type { Transfer } from "@/lib/transferTypes"
import { t, tAudit, tOverview, tImport } from "@/i18n"
import { useStatuses } from "@/features/statuses/useStatuses"
import { StatusBadge } from "@/features/statuses/StatusBadge"
import { StateBoundary } from "@/components/StateBoundary"
import { DistributionBar } from "@/features/overview/DistributionBar"
import { PageHeader } from "@/features/common/PageHeader"
import { ImportDialog } from "@/features/import/ImportDialog"
import { usePermissions } from "@/features/auth/usePermissions"
import { TransferChange } from "@/features/transfers/TransferChange"
import { TableFrame } from "@/features/common/TableFrame"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/ui/empty"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface StatusCount {
  status: AssetStatus
  count: number
}

interface OverviewData {
  status_counts: StatusCount[]
  category_distribution: {
    category_id: string
    name: string
    count: number
  }[]
  total: number
  recent_transfers: Transfer[]
}

/** How many recent entries the card offers. The middle one is the default. */
const RECENT_COUNTS = [5, 10, 20]

export function Overview() {
  const navigate = useNavigate()
  const statuses = useStatuses()
  const [recentCount, setRecentCount] = useState(RECENT_COUNTS[1])
  const [importing, setImporting] = useState(false)
  const { deniedReason } = usePermissions()

  const overview = useQuery({
    queryKey: ["overview", recentCount],
    queryFn: () => api.get<OverviewData>(`/overview?recent=${recentCount}`),
    placeholderData: (prev) => prev,
  })
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
  })

  const distribution = overview.data?.category_distribution ?? []
  const hasCategories = (categories.data ?? []).length > 0

  return (
    <div className="grid gap-14">
      <PageHeader title={tOverview.title}>
        {/* Importing is an act performed from where the devices are, not a
            place on the navigation bar beside the eleven things people do
            daily. Here and on the asset list, which are the two screens
            somebody is looking at when a spreadsheet of new devices arrives. */}
        <Button
          variant="outline"
          onClick={() => setImporting(true)}
          disabled={deniedReason("import") !== undefined}
          title={deniedReason("import")}
        >
          {tImport.title}
        </Button>
        <Button
          disabled={!hasCategories}
          title={hasCategories ? undefined : tOverview.noCategoriesHint}
          onClick={() => navigate("/assets?new=1")}
        >
          <PlusIcon />
          {t.assets.newAsset}
        </Button>
      </PageHeader>
      {importing && <ImportDialog onClose={() => setImporting(false)} />}

      <StateBoundary
        isLoading={overview.isLoading}
        error={overview.error as Error | null}
        onRetry={() => overview.refetch()}
      >
        <div className="grid gap-14">
          {/* Two lists of the same shape, side by side: how many of each
              status, how many in each category. They used to be a row of five
              big cards and a chart, which made the same kind of fact look like
              two different kinds. */}
          <div className="grid gap-10 lg:grid-cols-2">
            <section
              aria-label={tOverview.statusTitle}
              className="bg-well grid content-start gap-3 rounded-[28px] px-[26px] py-[22px]"
            >
              <div className="flex items-baseline gap-3">
                <h2 className="text-[21px] leading-tight font-bold">{tOverview.statusTitle}</h2>
                <span className="text-muted-foreground text-sm">
                  {tOverview.total(overview.data?.total ?? 0)}
                </span>
              </div>
              <DistributionBar
                data={(overview.data?.status_counts ?? []).map((s) => ({
                  id: s.status,
                  label: <StatusBadge status={s.status} />,
                  count: s.count,
                }))}
                rowLabel={(r) => `${statuses.label(r.id)} ${r.count} ${tOverview.unit}`}
                onSelect={(id) => navigate(`/assets?status=${id}`)}
              />
            </section>

            <section
              aria-label={tOverview.categoryTitle}
              className="bg-well grid content-start gap-3 rounded-[28px] px-[26px] py-[22px]"
            >
              <div className="grid gap-1">
                <h2 className="text-[21px] leading-tight font-bold">{tOverview.categoryTitle}</h2>
                <p className="text-sm text-muted-foreground">{tOverview.categoryHint}</p>
              </div>
              <div>
                {distribution.length === 0 ? (
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <ChartColumnIcon />
                      </EmptyMedia>
                      <EmptyDescription>{tOverview.emptyDistribution}</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <DistributionBar
                    data={distribution.map((c) => ({
                      id: c.category_id,
                      label: c.name,
                      count: c.count,
                    }))}
                    rowLabel={(r) => `${r.label} ${r.count} ${tOverview.unit}`}
                    onSelect={(id) => navigate(`/assets?category_id=${id}&include_descendants=true`)}
                  />
                )}
              </div>
            </section>

          </div>

          <section aria-label={tOverview.recentTitle} className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[21px] leading-tight font-bold">{tOverview.recentTitle}</h2>
              {/* Each entry is a multi-line block, so how many belong here is a
                  matter of taste rather than a constant worth guessing at. */}
              <Field orientation="horizontal" className="w-auto">
                <FieldLabel htmlFor="recent-count" className="sr-only">
                  {tOverview.recentCount}
                </FieldLabel>
                <Select value={String(recentCount)} onValueChange={(v) => setRecentCount(Number(v))}>
                  <SelectTrigger id="recent-count" size="sm" className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {RECENT_COUNTS.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {tOverview.recentCountUnit(n)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            {/* A table, not the device page's timeline. That component is
                right where it lives -- the whole page is one device, so every
                row repeating its number would be noise -- and wrong here,
                where the rows come from all over the ledger and the first
                thing anybody wants to know is which device. Same component,
                same correct code, a premise that stopped holding. */}
            <TableFrame>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tAudit.when}</TableHead>
                    <TableHead>{t.assets.title}</TableHead>
                    <TableHead>{tAudit.change}</TableHead>
                    <TableHead>{tAudit.actor}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(overview.data?.recent_transfers ?? []).map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="whitespace-nowrap">
                        {new Date(it.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Link
                          to={`/assets/${it.asset_id}`}
                          className="tabular-nums hover:text-primary"
                        >
                          {it.asset_display_name ?? it.asset_id}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <TransferChange event={it} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {it.actor?.name ?? t.common.none}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableFrame>
          </section>
        </div>
      </StateBoundary>
    </div>
  )
}
