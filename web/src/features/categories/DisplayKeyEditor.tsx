import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { api, ApiError } from "@/lib/api"
import { NONE, fromNone, toNone } from "@/lib/select"
import type { BoundField } from "@/lib/types"
import { t, tConfig } from "@/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Props {
  categoryID: string
  displayKey: string
  fields: BoundField[]
}

/**
 * Picks which bound field is the number people read aloud.
 *
 * Recomputing used to live here as a second button, because changing an
 * expression left existing assets on the old rule until someone remembered to
 * press it. Saving the expression now recomputes what it governs (see
 * FieldEditor), so there is nothing left for this page to remember.
 */
export function DisplayKeyEditor({ categoryID, displayKey, fields }: Props) {
  const queryClient = useQueryClient()
  const [value, setValue] = useState(displayKey)
  const [banner, setBanner] = useState<string | null>(null)

  // Only unique fields are offered: a number two devices can share is not an
  // identifier, and the server refuses the rest anyway.
  const candidates = fields.filter((f) => f.is_unique)

  const save = useMutation({
    mutationFn: () => api.patch(`/categories/${categoryID}`, { display_key: value }),
    onSuccess: () => {
      setBanner(tConfig.displayKey.saved)
      queryClient.invalidateQueries({ queryKey: ["categories"] })
      queryClient.invalidateQueries({ queryKey: ["category-schema", categoryID] })
    },
    onError: (err) => setBanner(err instanceof ApiError ? err.message : t.common.error),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tConfig.displayKey.title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Field>
          <FieldLabel htmlFor="display-key">{tConfig.displayKey.label}</FieldLabel>
          <Select value={toNone(value)} onValueChange={(v) => setValue(fromNone(v))}>
            <SelectTrigger id="display-key">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={NONE}>{tConfig.displayKey.none}</SelectItem>
                {candidates.map((f) => (
                  <SelectItem key={f.key} value={f.key}>
                    {f.label}（{f.key}）
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>{tConfig.displayKey.hint}</FieldDescription>
        </Field>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {tConfig.displayKey.save}
          </Button>
        </div>

        {banner && (
          <p role="status" className="text-sm">
            {banner}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
