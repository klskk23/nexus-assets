import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import type { AssetPage, Category, CategorySchema } from "@/lib/types"
import { zh } from "@/i18n/zh"
import { StateBoundary } from "@/components/StateBoundary"
import { useColumnSelection } from "@/features/assets/useColumns"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export function Assets() {
  const navigate = useNavigate()
  const searchRef = useRef<HTMLInputElement>(null)

  const [q, setQ] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [includeDescendants, setIncludeDescendants] = useState(true)
  const [status, setStatus] = useState("")
  const { keys: extraColumns, toggle } = useColumnSelection()

  // A barcode scanner types into whatever has focus. Without this the operator
  // has to click the box first, and "the scanner just works" stops being true.
  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
  })

  const schema = useQuery({
    queryKey: ["schema", categoryId],
    queryFn: () => api.get<CategorySchema>(`/categories/${categoryId}/schema`),
    enabled: categoryId !== "",
  })

  const params = new URLSearchParams()
  if (q) params.set("q", q)
  if (categoryId) {
    params.set("category_id", categoryId)
    params.set("include_descendants", String(includeDescendants))
  }
  if (status) params.set("status", status)

  const assets = useQuery({
    queryKey: ["assets", params.toString()],
    queryFn: () => api.get<AssetPage>(`/assets?${params.toString()}`),
  })

  // A unique exact hit means the operator scanned a specific device.
  useEffect(() => {
    if (assets.data?.exact_match_id) {
      navigate(`/assets/${assets.data.exact_match_id}`)
    }
  }, [assets.data?.exact_match_id, navigate])

  const available = schema.data?.fields.filter((f) => f.type !== "computed") ?? []

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-xl font-semibold">{zh.assets.title}</h1>
        <Button onClick={() => navigate("/assets/new")}>{zh.assets.newAsset}</Button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="q">{zh.assets.search}</Label>
          <Input
            id="q"
            ref={searchRef}
            className="w-72"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="category">{zh.assets.category}</Label>
          <select
            id="category"
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">{zh.assets.allCategories}</option>
            {(categories.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {categoryId && (
          <div className="flex items-center gap-2 pb-2">
            <Checkbox
              id="descendants"
              checked={includeDescendants}
              onCheckedChange={(v) => setIncludeDescendants(v === true)}
            />
            <Label htmlFor="descendants">{zh.assets.includeDescendants}</Label>
          </div>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="status">{zh.assets.statusLabel}</Label>
          <select
            id="status"
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">{zh.assets.allStatuses}</option>
            {Object.entries(zh.status).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      {available.length > 0 && (
        <fieldset className="flex flex-wrap items-center gap-4 rounded-md border p-3">
          <legend className="px-1 text-sm text-muted-foreground">{zh.assets.columns}</legend>
          {available.map((f) => (
            <div key={f.key} className="flex items-center gap-2">
              <Checkbox
                id={`col-${f.key}`}
                checked={extraColumns.includes(f.key)}
                onCheckedChange={() => toggle(f.key)}
              />
              <Label htmlFor={`col-${f.key}`}>{f.label}</Label>
            </div>
          ))}
        </fieldset>
      )}

      <StateBoundary
        isLoading={assets.isLoading}
        error={assets.error as Error | null}
        isEmpty={assets.data?.items.length === 0}
        emptyTitle={zh.assets.empty}
        emptyHint={zh.assets.emptyHint}
        onRetry={() => assets.refetch()}
      >
        <>
          <p className="text-sm text-muted-foreground">{zh.assets.total(assets.data?.total ?? 0)}</p>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{zh.assets.sn}</TableHead>
                  <TableHead>{zh.assets.statusLabel}</TableHead>
                  <TableHead>{zh.assets.holder}</TableHead>
                  <TableHead>{zh.assets.owner}</TableHead>
                  {extraColumns.map((k) => (
                    <TableHead key={k}>{available.find((f) => f.key === k)?.label ?? k}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(assets.data?.items ?? []).map((a) => (
                  <TableRow
                    key={a.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/assets/${a.id}`)}
                  >
                    <TableCell className="font-mono">{a.sn}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{zh.status[a.status] ?? a.status}</Badge>
                    </TableCell>
                    <TableCell>{a.holder.name ?? zh.common.none}</TableCell>
                    <TableCell>{a.owner?.name ?? zh.common.none}</TableCell>
                    {extraColumns.map((k) => (
                      <TableCell key={k}>{String(a.attrs[k] ?? "")}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      </StateBoundary>
    </div>
  )
}
