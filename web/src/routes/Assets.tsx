import { InfoIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import { NONE, fromNone, toNone } from "@/lib/select"
import type { AssetPage, Category, CategorySchema } from "@/lib/types"
import { zh, zhImport, zhTransfer } from "@/i18n/zh"
import { StateBoundary } from "@/components/StateBoundary"
import { useColumnSelection } from "@/features/assets/useColumns"
import { ActionBar } from "@/features/assets/ActionBar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

/** Renders one custom attribute. Booleans read as words, not as true/false. */
function cellText(v: unknown): string {
  if (v === true) return zh.common.yes
  if (v === false) return zh.common.no
  return String(v ?? "")
}

export function Assets() {
  const navigate = useNavigate()
  const searchRef = useRef<HTMLInputElement>(null)

  // The overview links here with a filter already chosen, so the URL seeds the
  // initial state rather than the page opening blank and then jumping.
  const [searchParams] = useSearchParams()
  const [q, setQ] = useState("")
  const [categoryId, setCategoryId] = useState(searchParams.get("category_id") ?? "")
  const [includeDescendants, setIncludeDescendants] = useState(
    searchParams.get("include_descendants") !== "false",
  )
  const [status, setStatus] = useState(searchParams.get("status") ?? "")
  const { keys: extraColumns, toggle } = useColumnSelection()
  const [selected, setSelected] = useState<string[]>([])
  const [done, setDone] = useState<string | null>(null)

  const toggleSelected = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  // A barcode scanner types into whatever has focus. Without this the operator
  // has to click the box first, and "the scanner just works" stops being true.
  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  const params = new URLSearchParams()
  if (q) params.set("q", q)
  if (categoryId) {
    params.set("category_id", categoryId)
    params.set("include_descendants", String(includeDescendants))
  }
  if (status) params.set("status", status)

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
  })

  const schema = useQuery({
    queryKey: ["schema", categoryId],
    queryFn: () => api.get<CategorySchema>(`/categories/${categoryId}/schema`),
    enabled: categoryId !== "",
  })

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

  const available = schema.data?.fields?.filter((f) => f.type !== "computed") ?? []

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-xl font-semibold">{zh.assets.title}</h1>
        <Button variant="outline" asChild>
          <a href={`/api/export.csv?${params.toString()}`} download title={zhImport.exportHint}>
            {zhImport.export}
          </a>
        </Button>
        <Button onClick={() => navigate("/assets/new")}>{zh.assets.newAsset}</Button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <Field>
          <FieldLabel htmlFor="q">{zh.assets.search}</FieldLabel>
          <Input
            id="q"
            ref={searchRef}
            className="w-72"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="category">{zh.assets.category}</FieldLabel>
          <Select value={toNone(categoryId)} onValueChange={(v) => setCategoryId(fromNone(v))}>
            <SelectTrigger id="category" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={NONE}>{zh.assets.allCategories}</SelectItem>
                {(categories.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        {categoryId && (
          <Field orientation="horizontal" className="pb-2">
            <Checkbox
              id="descendants"
              checked={includeDescendants}
              onCheckedChange={(v) => setIncludeDescendants(v === true)}
            />
            <FieldLabel htmlFor="descendants">{zh.assets.includeDescendants}</FieldLabel>
          </Field>
        )}

        <Field>
          <FieldLabel htmlFor="status">{zh.assets.statusLabel}</FieldLabel>
          <Select value={toNone(status)} onValueChange={(v) => setStatus(fromNone(v))}>
            <SelectTrigger id="status" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={NONE}>{zh.assets.allStatuses}</SelectItem>
                {Object.entries(zh.status).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </div>

      {available.length > 0 && (
        <FieldSet className="rounded-md border p-3">
          <FieldLegend variant="label">{zh.assets.columns}</FieldLegend>
          <FieldGroup className="flex flex-row flex-wrap items-center gap-4">
            {available.map((f) => (
              <Field key={f.key} orientation="horizontal" className="w-auto">
                <Checkbox
                  id={`col-${f.key}`}
                  checked={extraColumns.includes(f.key)}
                  onCheckedChange={() => toggle(f.key)}
                />
                <FieldLabel htmlFor={`col-${f.key}`}>{f.label}</FieldLabel>
              </Field>
            ))}
          </FieldGroup>
        </FieldSet>
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
                  <TableHead className="w-10">
                    <span className="sr-only">{zh.common.select}</span>
                  </TableHead>
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
                  <TableRow key={a.id} className="cursor-pointer">
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        aria-label={zh.common.selectOne(a.display_name)}
                        checked={selected.includes(a.id)}
                        onCheckedChange={() => toggleSelected(a.id)}
                      />
                    </TableCell>
                    <TableCell
                      className="font-mono"
                      onClick={() => navigate(`/assets/${a.id}`)}
                    >
                      {a.display_name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{zh.status[a.status] ?? a.status}</Badge>
                    </TableCell>
                    <TableCell>{a.holder.name ?? zh.common.none}</TableCell>
                    <TableCell>{a.owner?.name ?? zh.common.none}</TableCell>
                    {extraColumns.map((k) => (
                      <TableCell key={k}>{cellText(a.attrs[k])}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      </StateBoundary>

      {done && (
        <Alert role="status">
          <InfoIcon />
          <AlertDescription>{done}</AlertDescription>
        </Alert>
      )}

      <ActionBar
        selected={selected}
        onClear={() => setSelected([])}
        onDone={(n) => setDone(zhTransfer.actions.done(n))}
      />
    </div>
  )
}
