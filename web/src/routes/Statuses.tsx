import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertCircleIcon, Trash2Icon } from "lucide-react"

import { api, ApiError } from "@/lib/api"
import type { Status, StatusUsage } from "@/lib/types"
import { t, tStatuses } from "@/i18n"
import { CrudPage } from "@/features/metadata/CrudPage"
import { ConfirmDialog } from "@/features/common/ConfirmDialog"
import { STATUSES_KEY, statusesQuery, useStatuses } from "@/features/statuses/useStatuses"
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

  const invalidate = () => {
    // The prefix covers both the list and the usage counts. The overview's
    // cards and the asset list's badges read statuses too.
    queryClient.invalidateQueries({ queryKey: [STATUSES_KEY] })
    queryClient.invalidateQueries({ queryKey: ["overview"] })
  }

  const recolor = useMutation({
    mutationFn: (v: { key: string; color: string }) =>
      api.patch(`/statuses/${v.key}`, { color: v.color }),
    onSuccess: invalidate,
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
    <CrudPage<StatusRow>
      title={tStatuses.title}
      queryKey={STATUSES_KEY}
      // The same query useStatuses runs, mapped for the table: one cache
      // entry, so recolouring a row refreshes every badge in the app.
      list={async () => (await statusesQuery().queryFn()).map((s) => ({ ...s, id: s.key }))}
      createLabel={tStatuses.create}
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
          header: tStatuses.color,
          // Recolouring is the one edit people come here to make, so it is a
          // control in the row rather than a trip through an edit dialog.
          cell: (s) => (
            <Select value={s.color} onValueChange={(c) => recolor.mutate({ key: s.key, color: c })}>
              <SelectTrigger size="sm" aria-label={`${s.label} ${tStatuses.color}`}>
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
          ),
        },
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
        {
          header: t.common.actions,
          cell: (s) => {
            // A built-in has no delete control at all: offering one that always
            // refuses would be a worse explanation than its absence.
            if (s.builtin) return null
            const u = usage[s.key] ?? { assets: 0, history: 0 }
            return (
              <ConfirmDialog
                trigger={
                  <Button size="sm" variant="ghost" className="text-destructive">
                    <Trash2Icon data-icon="inline-start" />
                    {tStatuses.delete}
                  </Button>
                }
                title={tStatuses.deleteTitle}
                // History only degrades the timeline, so it is stated rather
                // than used to refuse -- otherwise a status used once could
                // never be removed.
                description={
                  u.history > 0
                    ? tStatuses.deleteHistoryHint(s.label, u.history)
                    : tStatuses.deleteHint(s.label)
                }
                confirmLabel={tStatuses.delete}
                requirePhrase={s.key}
                onConfirm={() => remove.mutate(s.key)}
              />
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
  )
}
