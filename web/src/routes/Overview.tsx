import { useState } from "react"
import { useNavigate } from "react-router"
import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import type { AssetStatus, Category } from "@/lib/types"
import type { Transfer } from "@/lib/transferTypes"
import { zh, zhOverview } from "@/i18n/zh"
import { StateBoundary } from "@/components/StateBoundary"
import { Timeline } from "@/features/transfers/Timeline"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"

interface StatusCount {
  status: AssetStatus
  count: number
}

interface CategoryCount {
  category_id: string
  name: string
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
  const largest = Math.max(1, ...distribution.map((d) => d.count))
  const hasCategories = (categories.data ?? []).length > 0

  return (
    <div className="grid gap-6">
      <h1 className="text-xl font-semibold">{zhOverview.title}</h1>

      <StateBoundary
        isLoading={overview.isLoading}
        error={overview.error as Error | null}
        onRetry={() => overview.refetch()}
      >
        <div className="grid gap-6">
          <section aria-label={zhOverview.statusTitle} className="grid gap-3">
            <div className="flex items-baseline gap-3">
              <h2 className="font-medium">{zhOverview.statusTitle}</h2>
              <span className="text-sm text-muted-foreground">
                {zhOverview.total(overview.data?.total ?? 0)}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {(overview.data?.status_counts ?? []).map((s) => (
                <Card
                  key={s.status}
                  role="button"
                  tabIndex={0}
                  aria-label={`${zh.status[s.status] ?? s.status} ${s.count} ${zhOverview.unit}`}
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
                    <p className="text-sm text-muted-foreground">
                      {zh.status[s.status] ?? s.status}
                    </p>
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
                  {zhOverview.categoryTitle}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {zhOverview.categoryHint}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {distribution.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{zhOverview.emptyDistribution}</p>
                ) : (
                  <ul className="grid gap-3">
                    {distribution.map((d) => (
                      <li key={d.category_id} className="grid gap-1">
                        <div className="flex items-baseline justify-between text-sm">
                          <button
                            className="text-left hover:underline"
                            onClick={() =>
                              navigate(`/assets?category_id=${d.category_id}&include_descendants=true`)
                            }
                          >
                            {d.name}
                          </button>
                          <span className="tabular-nums text-muted-foreground">
                            {d.count} {zhOverview.unit}
                          </span>
                        </div>
                        {/* A bar and a number say everything a chart would here,
                            and keep the charting library out of the bundle. */}
                        <Progress value={(d.count / largest) * 100} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{zhOverview.quickTitle}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                {hasCategories ? (
                  <>
                    <p className="text-sm text-muted-foreground">{zhOverview.quickHint}</p>
                    <Field>
                      <FieldLabel htmlFor="ov-category">{zhOverview.quickCategory}</FieldLabel>
                      <Select value={quickCategory} onValueChange={setQuickCategory}>
                        <SelectTrigger id="ov-category">
                          <SelectValue placeholder={zh.common.select} />
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
                        {zhOverview.quickStart}
                      </Button>
                    </div>
                  </>
                ) : (
                  // A fresh install has nothing configured, so the card points
                  // at the one thing that has to happen first.
                  <>
                    <p className="font-medium">{zhOverview.noCategories}</p>
                    <p className="text-sm text-muted-foreground">{zhOverview.noCategoriesHint}</p>
                    <div>
                      <Button onClick={() => navigate("/categories")}>
                        {zhOverview.goConfigure}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <CardTitle>{zhOverview.recentTitle}</CardTitle>
              {/* Each entry is a multi-line block, so how many belong here is a
                  matter of taste rather than a constant worth guessing at. */}
              <Field orientation="horizontal" className="ml-auto w-auto">
                <FieldLabel htmlFor="recent-count" className="sr-only">
                  {zhOverview.recentCount}
                </FieldLabel>
                <Select value={String(recentCount)} onValueChange={(v) => setRecentCount(Number(v))}>
                  <SelectTrigger id="recent-count" size="sm" className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {RECENT_COUNTS.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {zhOverview.recentCountUnit(n)}
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
