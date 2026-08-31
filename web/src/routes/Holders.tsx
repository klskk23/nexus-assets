import { AlertCircleIcon } from "lucide-react"
import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { api, ApiError, type Blocker } from "@/lib/api"
import type { HolderEntity } from "@/lib/types"
import { zh, zhMeta } from "@/i18n/zh"
import { CrudPage } from "@/features/metadata/CrudPage"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function Holders() {
  const [name, setName] = useState("")
  const [type, setType] = useState("location")
  const queryClient = useQueryClient()

  const [banner, setBanner] = useState<string | null>(null)
  // The server has attached the blocking devices since the first version; the
  // client used to parse only `referrers` and drop these on the floor, leaving
  // the page with a count and no way to act on it.
  const [blockers, setBlockers] = useState<Blocker[]>([])
  const [blockerTotal, setBlockerTotal] = useState(0)

  const setDefault = useMutation({
    mutationFn: (id: string) => api.patch(`/holders/${id}`, { is_default_stock: true }),
    onSuccess: () => {
      setBanner(null)
      setBlockers([])
      queryClient.invalidateQueries({ queryKey: ["holders"] })
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        setBanner(e.message)
        setBlockers(e.blockers ?? [])
        setBlockerTotal(e.total ?? 0)
      } else {
        setBanner(zh.common.error)
      }
    },
  })

  return (
    <CrudPage<HolderEntity>
      title={zhMeta.holders.title}
      queryKey="holders"
      list={() => api.get<HolderEntity[]>("/holders")}
      createLabel={zhMeta.holders.create}
      createDisabled={name === ""}
      create={() => api.post("/holders", { type, name })}
      emptyTitle={zhMeta.holders.empty}
      emptyHint={zhMeta.holders.emptyHint}
      columns={[
        { header: zhMeta.holders.name, cell: (h) => h.name },
        { header: zhMeta.holders.type, cell: (h) => zhMeta.entityTypes[h.type] ?? h.type },
        {
          header: zhMeta.holders.defaultStock,
          // The marker moves but never switches off, so the current holder gets
          // a badge with no control rather than a toggle that would be refused.
          cell: (h) =>
            h.is_default_stock ? (
              <Badge>{zhMeta.holders.defaultStock}</Badge>
            ) : h.type === "location" ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={setDefault.isPending}
                onClick={() => setDefault.mutate(h.id)}
              >
                {zhMeta.holders.setDefault}
              </Button>
            ) : null,
        },
      ]}
      form={
        <div className="grid gap-4 sm:grid-cols-2">
          {banner && (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertCircleIcon />
              <AlertTitle>{zhMeta.holders.blocked}</AlertTitle>
              <AlertDescription className="grid gap-1">
                {banner}
                {blockers.length > 0 && (
                  <>
                    <p className="text-xs">{zhMeta.holders.blockedBy}</p>
                    <ul className="grid gap-0.5 font-mono text-xs">
                      {blockers.map((b) => (
                        <li key={b.asset_id}>{b.name}</li>
                      ))}
                      {blockerTotal > blockers.length && (
                        <li>{zhMeta.holders.blockedMore(blockerTotal)}</li>
                      )}
                    </ul>
                  </>
                )}
              </AlertDescription>
            </Alert>
          )}
          <Field>
            <FieldLabel htmlFor="h-name">{zhMeta.holders.name}</FieldLabel>
            <Input id="h-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="h-type">{zhMeta.holders.type}</FieldLabel>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="h-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {Object.entries(zhMeta.entityTypes).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </div>
      }
    />
  )
}
