import { ChartColumnIcon } from "lucide-react"
import { Suspense, lazy, useState } from "react"
import { useNavigate } from "react-router"
import { useQuery } from "@tanstack/react-query"

import { cn } from "cn"
import { api } from "@/lib/api"
import type { AssetStatus, Category } from "@/lib/types"
import type { CategoryCount } from "@/features/overview/CategoryChart"
import type { Transfer } from "@/lib/transferTypes"
import { t, tOverview } from "@/i18n"
import { useStatuses } from "@/features/statuses/useStatuses"
import { StatusBadge } from "@/features/statuses/StatusBadge"
import { StateBoundary } from "@/components/StateBoundary"
import { PageHeader } from "@/features/common/PageHeader"
import { Timeline } from "@/features/transfers/Timeline"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Field, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"

// The charting library outweighs the rest of this page, and the status cards
// and recent transfers have no reason to wait for it.
const CategoryChart = lazy(() => import("@/features/overview/CategoryChart"))
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
    <div className="grid gap-6">
      <PageHeader title={tOverview.title} />

      <StateBoundary
        isLoading={overview.isLoading}
        error={overview.error as Error | null}
        onRetry={() => overview.refetch()}
      >
        <div className="grid gap-6">
          <section aria-label={tOverview.statusTitle} className="grid gap-3">
            <div className="flex items-baseline gap-3">
              <h2 className="font-medium">{tOverview.statusTitle}</h2>
              <span className="text-sm text-muted-foreground">
                {tOverview.total(overview.data?.total ?? 0)}
              </span>
            </div>
            {/* One row, sharing the width. Fixed column counts put five
                statuses on one line and the sixth on a line of its own, which
                made a configurable list look like two unrelated groups. The
                cards shrink instead, and only wrap once one of them would go
                under 6rem -- narrower than that and the label stops fitting,
                which is the point where wrapping is the lesser evil. */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(6rem,1fr))] gap-3">
              {(overview.data?.status_counts ?? []).map((s) => (
                <Card
                  key={s.status}
                  role="button"
                  tabIndex={0}
                  aria-label={`${statuses.label(s.status)} ${s.count} ${tOverview.unit}`}
                  className="cursor-pointer transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  onClick={() => navigate(`/assets?status=${s.status}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      navigate(`/assets?status=${s.status}`)
                    }
                  }}
                >
                  <CardContent className="px-4 py-3.5">
                    <StatusBadge status={s.status} />
                    {/* The count is the content and the chip is its label, so
                        the count is what carries weight -- and a zero is
                        allowed to recede. Five equally loud cards, two of them
                        reading 0, spend the page's attention on nothing. */}
                    <p
                      className={cn(
                        "mt-1.5 text-[28px] leading-none font-semibold tabular-nums",
                        s.count === 0 && "text-muted-foreground/50",
                      )}
                    >
                      {s.count}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{tOverview.categoryTitle}</CardTitle>
                <CardDescription>{tOverview.categoryHint}</CardDescription>
              </CardHeader>
              <CardContent>
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
                  <Suspense fallback={<Skeleton className="h-40 w-full" />}>
                    <CategoryChart
                      data={distribution}
                      onSelect={(id) =>
                        navigate(`/assets?category_id=${id}&include_descendants=true`)
                      }
                    />
                  </Suspense>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{tOverview.quickTitle}</CardTitle>
                <CardDescription>
                  {hasCategories ? tOverview.quickHint : tOverview.noCategoriesHint}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
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
                  // A fresh install has nothing configured, so the card points
                  // at the one thing that has to happen first.
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
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{tOverview.recentTitle}</CardTitle>
              {/* Each entry is a multi-line block, so how many belong here is a
                  matter of taste rather than a constant worth guessing at. */}
              <CardAction>
                <Field orientation="horizontal" className="w-auto">
                  <FieldLabel htmlFor="recent-count" className="sr-only">
                    {tOverview.recentCount}
                  </FieldLabel>
                  <Select
                    value={String(recentCount)}
                    onValueChange={(v) => setRecentCount(Number(v))}
                  >
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
              </CardAction>
            </CardHeader>
            <CardContent>
              <Timeline events={overview.data?.recent_transfers ?? []} />
            </CardContent>
          </Card>
        </div>
      </StateBoundary>
    </div>
  )
}
