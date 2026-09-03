import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertCircleIcon } from "lucide-react"

import { api, ApiError } from "@/lib/api"
import type { Status, StatusUsage } from "@/lib/types"
import { t, tMeta, tStatuses } from "@/i18n"
import { usePermissions } from "@/features/auth/usePermissions"
import { CrudPage, type ListPage } from "@/features/metadata/CrudPage"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { STATUSES_KEY, useStatuses } from "@/features/statuses/useStatuses"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  Field,
  FieldDescription,
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

/** CrudPage keys rows by `id`; a status is keyed by its own key. */
type StatusRow = Status & { id: string }

/**
 * Manages the statuses a device can be in.
 *
 * The five built-ins carry behaviour the rest of the system is written
 * against, so they can be renamed and recoloured but not removed and not
 * rewired -- their three switches are shown here, disabled, because "why can't
 * I change this" is a better question to be able to answer than "where did
 * that go".
 */
export function Statuses() {
  const queryClient = useQueryClient()
  const { deniedReason } = usePermissions()
  const { colors } = useStatuses()

  // Only this page cares what a delete would cost, so the counts are fetched
  // here rather than loaded on every screen that renders a badge.
  const usageQuery = useQuery({
    queryKey: [STATUSES_KEY, "usage"],
    queryFn: () => api.get<Record<string, StatusUsage>>("/status-usage"),
  })
  const usage = usageQuery.data ?? {}

  const [key, setKey] = useState("")
  const [label, setLabel] = useState("")
  const [color, setColor] = useState("slate")
  const [countsAsAvailable, setCountsAsAvailable] = useState(true)
  const [terminal, setTerminal] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [editing, setEditing] = useState<Status | null>(null)

  const invalidate = () => {
    // The prefix covers both the list and the usage counts. The overview's
    // cards and the asset list's badges read statuses too.
    queryClient.invalidateQueries({ queryKey: [STATUSES_KEY] })
    queryClient.invalidateQueries({ queryKey: ["overview"] })
  }

  const save = useMutation({
    mutationFn: (v: Status) =>
      api.patch(`/statuses/${v.key}`, { label: v.label, color: v.color }),
    onSuccess: () => {
      invalidate()
      setEditing(null)
    },
    onError: (e) => setNotice(e instanceof ApiError ? e.message : t.common.error),
  })


  const remove = useMutation({
    mutationFn: (k: string) => api.del(`/statuses/${k}`),
    onSuccess: () => {
      setNotice(null)
      invalidate()
    },
    onError: (e) => setNotice(e instanceof ApiError ? e.message : t.common.error),
  })

  return (
    <>
    <CrudPage<StatusRow>
      title={tStatuses.title}
      queryKey={STATUSES_KEY}
      // The same query useStatuses runs, mapped for the table: one cache
      // entry, so recolouring a row refreshes every badge in the app.
      searchHint={tStatuses.searchHint}
      list={async (params) => {
        const page = await api.get<ListPage<Status>>(`/statuses?${params}`)
        return { items: page.items.map((s: Status) => ({ ...s, id: s.key })), total: page.total }
      }}
      createLabel={tStatuses.create}
      createDeniedReason={deniedReason("status.manage")}
      createDisabled={key === "" || label === ""}
      onCreated={() => {
        setKey("")
        setLabel("")
        setColor("slate")
        setCountsAsAvailable(true)
        setTerminal(false)
      }}
      create={() =>
        api.post("/statuses", {
          key,
          label,
          color,
          counts_as_available: countsAsAvailable,
          terminal,
        })
      }
      onRowClick={(s) => setEditing(s)}
      rowActions={[
        { label: tStatuses.edit, onSelect: (s) => setEditing(s) },
        {
          label: tStatuses.delete,
          destructive: true,
          // A built-in carries behaviour the system is written against, so
          // the action is offered and disabled rather than missing -- "why is
          // there no delete" is a worse question than a greyed-out row.
          disabled: (s) => s.builtin,
          onSelect: (s) => remove.mutate(s.key),
          confirm: (s) => {
            const u = usage[s.key] ?? { assets: 0, children: 0, history: 0 }
            return {
              title: tStatuses.deleteTitle,
              description:
                u.history > 0
                  ? tStatuses.deleteHistoryHint(s.label, u.history)
                  : tStatuses.deleteHint(s.label),
              phrase: s.key,
            }
          },
        },
      ]}
      emptyTitle={tStatuses.empty}
      emptyHint={tStatuses.emptyHint}
      notice={
        <>
          {/* Said once above the table rather than repeated on five rows: the
              built-ins have no delete button, and this is the answer to why. */}
          <p className="text-muted-foreground text-sm">{tStatuses.builtinLocked}</p>
          {notice && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          )}
        </>
      }
      columns={[
        {
          header: tStatuses.label,
          cell: (s) => (
            <Badge variant="outline" className={cn("status-chip", `status-${s.color}`)}>
              {s.label}
            </Badge>
          ),
        },
        { header: tStatuses.key, cell: (s) => <span className="font-mono text-xs">{s.key}</span> },
        {
          header: tStatuses.kind,
          cell: (s) => (s.builtin ? tStatuses.builtin : tStatuses.custom),
        },
        {
          header: tStatuses.behaviour,
          cell: (s) => {
            // The other two are fixed on the built-ins, so they are shown, not
            // offered.
            const on = [
              s.terminal && tStatuses.terminal,
              !s.counts_as_available && tStatuses.notCounted,
            ].filter(Boolean) as string[]
            if (on.length === 0) return <span className="text-muted-foreground">—</span>
            return (
              <div className="flex flex-wrap gap-1">
                {on.map((t) => (
                  <Badge key={t} variant="secondary">
                    {t}
                  </Badge>
                ))}
              </div>
            )
          },
        },
        {
          header: tStatuses.usage,
          cell: (s) => {
            const u = usage[s.key] ?? { assets: 0, history: 0 }
            return (
              <span className="text-muted-foreground text-sm">
                {u.assets > 0 ? tStatuses.inUse(u.assets) : tStatuses.unused}
                {u.history > 0 ? `・${tStatuses.inHistory(u.history)}` : ""}
              </span>
            )
          },
        },
      ]}
      form={
        <div className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="st-key">{tStatuses.key}</FieldLabel>
            <Input
              id="st-key"
              className="font-mono"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <FieldDescription>{tStatuses.keyHint}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="st-label">{tStatuses.label}</FieldLabel>
            <Input id="st-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="st-color">{tStatuses.color}</FieldLabel>
            <Select value={color} onValueChange={setColor}>
              <SelectTrigger id="st-color">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {colors.map((c) => (
                    <SelectItem key={c} value={c}>
                      {tStatuses.colors[c] ?? c}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              <Badge variant="outline" className={cn("status-chip", `status-${color}`)}>
                {label || tStatuses.label}
              </Badge>
            </FieldDescription>
          </Field>

          <FieldSet className="sm:col-span-3">
            <FieldLegend variant="label">{tStatuses.behaviour}</FieldLegend>
            <FieldGroup className="gap-3">
              <Field orientation="horizontal">
                <Checkbox
                  id="st-counts"
                  checked={countsAsAvailable}
                  onCheckedChange={(v) => setCountsAsAvailable(v === true)}
                />
                <FieldLabel htmlFor="st-counts">{tStatuses.countsAsAvailable}</FieldLabel>
              </Field>
              <FieldDescription>{tStatuses.countsAsAvailableHint}</FieldDescription>
              <Field orientation="horizontal">
                <Checkbox
                  id="st-terminal"
                  checked={terminal}
                  onCheckedChange={(v) => setTerminal(v === true)}
                />
                <FieldLabel htmlFor="st-terminal">{tStatuses.terminal}</FieldLabel>
              </Field>
              <FieldDescription>{tStatuses.terminalHint}</FieldDescription>
            </FieldGroup>
          </FieldSet>
        </div>
      }
    />

      <StatusEditor
        status={editing}
        colors={colors}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={(s) => save.mutate(s)}
        saving={save.isPending}
      />
    </>
  )
}

interface EditProps {
  status: Status | null
  colors: string[]
  onOpenChange: (open: boolean) => void
  onSave: (s: Status) => void
  saving: boolean
}

/**
 * Edits one status.
 *
 * The key is fixed and the two behaviour switches are not offered: a built-in
 * carries meaning the rest of the system is written against, and a custom
 * status that changed what it means underneath existing devices would rewrite
 * history rather than record it. Name and colour are presentation, and those
 * are yours.
 */
function StatusEditor({ status, colors, onOpenChange, onSave, saving }: EditProps) {
  const [draft, setDraft] = useState<Status | null>(status)
  if (status?.key !== draft?.key) setDraft(status)
  if (!draft) return null

  return (
    <Dialog open={status !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tStatuses.editTitle}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="se-label">{tStatuses.label}</FieldLabel>
            <Input
              id="se-label"
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="se-color">{tStatuses.color}</FieldLabel>
            <Select value={draft.color} onValueChange={(c) => setDraft({ ...draft, color: c })}>
              <SelectTrigger id="se-color">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {colors.map((c) => (
                    <SelectItem key={c} value={c}>
                      {tStatuses.colors[c] ?? c}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              <Badge variant="outline" className={cn("status-chip", `status-${draft.color}`)}>
                {draft.label || tStatuses.label}
              </Badge>
            </FieldDescription>
          </Field>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{t.common.cancel}</Button>
          </DialogClose>
          <Button disabled={draft.label === "" || saving} onClick={() => onSave(draft)}>
            {tMeta.holders.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
