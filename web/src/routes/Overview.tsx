import { Suspense, lazy, useState } from "react"
import { useNavigate } from "react-router"
import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import type { AssetStatus, Category } from "@/lib/types"
import type { CategoryCount } from "@/features/overview/CategoryChart"
import type { Transfer } from "@/lib/transferTypes"
import { t, tOverview } from "@/i18n"
import { useStatuses } from "@/features/statuses/useStatuses"
import { StatusBadge } from "@/features/statuses/StatusBadge"
import { StateBoundary } from "@/components/StateBoundary"
import { Timeline } from "@/features/transfers/Timeline"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
      <h1 className="text-xl font-semibold">{tOverview.title}</h1>

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
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
                  <CardContent className="pt-6">
                    <StatusBadge status={s.status} />
                    <p className="mt-1 text-2xl font-semibold tabular-nums">{s.count}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>
                  {tOverview.categoryTitle}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {tOverview.categoryHint}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {distribution.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{tOverview.emptyDistribution}</p>
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
              </CardHeader>
              <CardContent className="grid gap-4">
                {hasCategories ? (
                  <>
                    <p className="text-sm text-muted-foreground">{tOverview.quickHint}</p>
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
                    <div>
                      <Button
                        disabled={quickCategory === ""}
                        onClick={() => navigate(`/assets?new=1&category_id=${quickCategory}`)}
                      >
                        {tOverview.quickStart}
                      </Button>
                    </div>
                  </>
                ) : (
                  // A fresh install has nothing configured, so the card points
                  // at the one thing that has to happen first.
                  <>
                    <p className="font-medium">{tOverview.noCategories}</p>
                    <p className="text-sm text-muted-foreground">{tOverview.noCategoriesHint}</p>
                    <div>
                      <Button onClick={() => navigate("/categories")}>
                        {tOverview.goConfigure}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <CardTitle>{tOverview.recentTitle}</CardTitle>
              {/* Each entry is a multi-line block, so how many belong here is a
                  matter of taste rather than a constant worth guessing at. */}
              <Field orientation="horizontal" className="ml-auto w-auto">
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
