import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertCircleIcon, Trash2Icon } from "lucide-react"

import { api, ApiError } from "@/lib/api"
import type { Status, StatusUsage } from "@/lib/types"
import { zh, zhStatuses } from "@/i18n/zh"
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
  const [requiresLocation, setRequiresLocation] = useState(false)
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
    onError: (e) => setNotice(e instanceof ApiError ? e.message : zh.common.error),
  })

  const remove = useMutation({
    mutationFn: (k: string) => api.del(`/statuses/${k}`),
    onSuccess: () => {
      setNotice(null)
      invalidate()
    },
    onError: (e) => setNotice(e instanceof ApiError ? e.message : zh.common.error),
  })

  return (
    <CrudPage<StatusRow>
      title={zhStatuses.title}
      queryKey={STATUSES_KEY}
      // The same query useStatuses runs, mapped for the table: one cache
      // entry, so recolouring a row refreshes every badge in the app.
      list={async () => (await statusesQuery().queryFn()).map((s) => ({ ...s, id: s.key }))}
      createLabel={zhStatuses.create}
      createDisabled={key === "" || label === ""}
      onCreated={() => {
        setKey("")
        setLabel("")
        setColor("slate")
        setRequiresLocation(false)
        setCountsAsAvailable(true)
        setTerminal(false)
      }}
      create={() =>
        api.post("/statuses", {
          key,
          label,
          color,
          requires_location: requiresLocation,
          counts_as_available: countsAsAvailable,
          terminal,
        })
      }
      emptyTitle={zhStatuses.empty}
      emptyHint={zhStatuses.emptyHint}
      notice={
        <>
          {/* Said once above the table rather than repeated on five rows: the
              built-ins have no delete button, and this is the answer to why. */}
          <p className="text-muted-foreground text-sm">{zhStatuses.builtinLocked}</p>
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
          header: zhStatuses.label,
          cell: (s) => (
            <Badge variant="outline" className={cn("status-chip", `status-${s.color}`)}>
              {s.label}
            </Badge>
          ),
        },
        { header: zhStatuses.key, cell: (s) => <span className="font-mono text-xs">{s.key}</span> },
        {
          header: zhStatuses.color,
          // Recolouring is the one edit people come here to make, so it is a
          // control in the row rather than a trip through an edit dialog.
          cell: (s) => (
            <Select value={s.color} onValueChange={(c) => recolor.mutate({ key: s.key, color: c })}>
              <SelectTrigger size="sm" aria-label={`${s.label} ${zhStatuses.color}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {colors.map((c) => (
                    <SelectItem key={c} value={c}>
                      {zhStatuses.colors[c] ?? c}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          ),
        },
        {
          header: zhStatuses.kind,
          cell: (s) => (s.builtin ? zhStatuses.builtin : zhStatuses.custom),
        },
        {
          header: zhStatuses.behaviour,
          cell: (s) => {
            const on = [
              s.requires_location && zhStatuses.requiresLocation,
              s.terminal && zhStatuses.terminal,
              !s.counts_as_available && zhStatuses.notCounted,
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
          header: zhStatuses.usage,
          cell: (s) => {
            const u = usage[s.key] ?? { assets: 0, history: 0 }
            return (
              <span className="text-muted-foreground text-sm">
                {u.assets > 0 ? zhStatuses.inUse(u.assets) : zhStatuses.unused}
                {u.history > 0 ? `・${zhStatuses.inHistory(u.history)}` : ""}
              </span>
            )
          },
        },
        {
          header: zh.common.actions,
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
                    {zhStatuses.delete}
                  </Button>
                }
                title={zhStatuses.deleteTitle}
                // History only degrades the timeline, so it is stated rather
                // than used to refuse -- otherwise a status used once could
                // never be removed.
                description={
                  u.history > 0
                    ? zhStatuses.deleteHistoryHint(s.label, u.history)
                    : zhStatuses.deleteHint(s.label)
                }
                confirmLabel={zhStatuses.delete}
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
            <FieldLabel htmlFor="st-key">{zhStatuses.key}</FieldLabel>
            <Input
              id="st-key"
              className="font-mono"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <FieldDescription>{zhStatuses.keyHint}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="st-label">{zhStatuses.label}</FieldLabel>
            <Input id="st-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="st-color">{zhStatuses.color}</FieldLabel>
            <Select value={color} onValueChange={setColor}>
              <SelectTrigger id="st-color">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {colors.map((c) => (
                    <SelectItem key={c} value={c}>
                      {zhStatuses.colors[c] ?? c}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              <Badge variant="outline" className={cn("status-chip", `status-${color}`)}>
                {label || zhStatuses.label}
              </Badge>
            </FieldDescription>
          </Field>

          <FieldSet className="sm:col-span-3">
            <FieldLegend variant="label">{zhStatuses.behaviour}</FieldLegend>
            <FieldGroup className="gap-3">
              <Field orientation="horizontal">
                <Checkbox
                  id="st-loc"
                  checked={requiresLocation}
                  onCheckedChange={(v) => setRequiresLocation(v === true)}
                />
                <FieldLabel htmlFor="st-loc">{zhStatuses.requiresLocation}</FieldLabel>
              </Field>
              <FieldDescription>{zhStatuses.requiresLocationHint}</FieldDescription>
              <Field orientation="horizontal">
                <Checkbox
                  id="st-counts"
                  checked={countsAsAvailable}
                  onCheckedChange={(v) => setCountsAsAvailable(v === true)}
                />
                <FieldLabel htmlFor="st-counts">{zhStatuses.countsAsAvailable}</FieldLabel>
              </Field>
              <FieldDescription>{zhStatuses.countsAsAvailableHint}</FieldDescription>
              <Field orientation="horizontal">
                <Checkbox
                  id="st-terminal"
                  checked={terminal}
                  onCheckedChange={(v) => setTerminal(v === true)}
                />
                <FieldLabel htmlFor="st-terminal">{zhStatuses.terminal}</FieldLabel>
              </Field>
              <FieldDescription>{zhStatuses.terminalHint}</FieldDescription>
            </FieldGroup>
          </FieldSet>
        </div>
      }
    />
  )
}
