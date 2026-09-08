import { ChartColumnIcon } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router"
import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import type { AssetStatus, Category } from "@/lib/types"
import type { CategoryCount } from "@/features/overview/DistributionBar"
import type { Transfer } from "@/lib/transferTypes"
import { t, tOverview } from "@/i18n"
import { useStatuses } from "@/features/statuses/useStatuses"
import { StatusBadge } from "@/features/statuses/StatusBadge"
import { StateBoundary } from "@/components/StateBoundary"
import { DistributionBar } from "@/features/overview/DistributionBar"
import { StatCard } from "@/features/overview/StatCard"
import { PageHeader } from "@/features/common/PageHeader"
import { Timeline } from "@/features/transfers/Timeline"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
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
  category_distribution: CategoryCount[]
  total: number
  recent_transfers: Transfer[]
}

/** How many recent entries the card offers. The middle one is the default. */
const RECENT_COUNTS = [5, 10, 20]

export function Overview() {
  const navigate = useNavigate()
  const statuses = useStatuses()
  const [quickCategory, setQuickCategory] = useState("")
  const [recentCount, setRecentCount] = useState(RECENT_COUNTS[1])

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
      <PageHeader title={tOverview.title} />

      <StateBoundary
        isLoading={overview.isLoading}
        error={overview.error as Error | null}
        onRetry={() => overview.refetch()}
      >
        <div className="grid gap-14">
          <section aria-label={tOverview.statusTitle} className="grid gap-3">
            <div className="flex items-baseline gap-3">
              <h2 className="text-[21px] leading-tight font-bold">{tOverview.statusTitle}</h2>
              <span className="text-sm text-muted-foreground">
                {tOverview.total(overview.data?.total ?? 0)}
              </span>
            </div>
            {/* One row, sharing the width. Fixed column counts put five
                statuses on one line and the sixth on a line of its own, which
                made a configurable list look like two unrelated groups. The
                cards shrink instead, and only wrap once one of them would go
                under 152px -- the width the prototype gives them, and below
                which the chip and the count stop sitting comfortably. */}
            <div className="flex flex-wrap gap-[22px] [&>*]:flex-1">
              {(overview.data?.status_counts ?? []).map((s) => (
                <StatCard
                  key={s.status}
                  label={<StatusBadge status={s.status} />}
                  count={s.count}
                  ariaLabel={`${statuses.label(s.status)} ${s.count} ${tOverview.unit}`}
                  onOpen={() => navigate(`/assets?status=${s.status}`)}
                />
              ))}
            </div>
          </section>

          {/* The distribution is the wider of the two: it is a chart being
              read, and the quick-entry beside it is one select and a button. */}
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            <section aria-label={tOverview.categoryTitle} className="grid content-start gap-3">
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
                    data={distribution}
                    onSelect={(id) => navigate(`/assets?category_id=${id}&include_descendants=true`)}
                  />
                )}
              </div>
            </section>

            <section aria-label={tOverview.quickTitle} className="grid content-start gap-3">
              <div className="grid gap-1">
                <h2 className="text-[21px] leading-tight font-bold">{tOverview.quickTitle}</h2>
                <p className="text-sm text-muted-foreground">
                  {hasCategories ? tOverview.quickHint : tOverview.noCategoriesHint}
                </p>
              </div>
              <div className="grid gap-4">
                {hasCategories ? (
                  <>
                    <Field>
                      <FieldLabel htmlFor="ov-category">{tOverview.quickCategory}</FieldLabel>
                      <Select value={quickCategory} onValueChange={setQuickCategory}>
                        <SelectTrigger id="ov-category">
                          <SelectValue placeholder={t.common.select} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {(categories.data ?? []).map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Button
                      className="w-fit"
                      disabled={quickCategory === ""}
                      onClick={() => navigate(`/assets?new=1&category_id=${quickCategory}`)}
                    >
                      {tOverview.quickStart}
                    </Button>
                  </>
                ) : (
                  // A fresh install has nothing configured, so this section
                  // points at the one thing that has to happen first.
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>{tOverview.noCategories}</EmptyTitle>
                    </EmptyHeader>
                    <EmptyContent>
                      <Button onClick={() => navigate("/categories")}>
                        {tOverview.goConfigure}
                      </Button>
                    </EmptyContent>
                  </Empty>
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
            <Timeline events={overview.data?.recent_transfers ?? []} />
          </section>
        </div>
      </StateBoundary>
    </div>
  )
}
