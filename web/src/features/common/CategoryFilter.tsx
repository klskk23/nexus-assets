import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import { NONE, fromNone, toNone } from "@/lib/select"
import type { Category } from "@/lib/types"
import { tMeta } from "@/i18n"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/**
 * The category dropdown three pages narrow by.
 *
 * It asks for the categories without paging parameters, which is how these
 * endpoints answer with the whole set: a dropdown that only offered the first
 * page would hide exactly the category somebody was looking for.
 */
export function CategoryFilter({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
  })

  return (
    <Field className="w-auto">
      <FieldLabel htmlFor="filter-category" className="sr-only">
        {tMeta.fields.categoryFilter}
      </FieldLabel>
      <Select value={toNone(value)} onValueChange={(v) => onChange(fromNone(v))}>
        <SelectTrigger id="filter-category" className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value={NONE}>{tMeta.fields.allCategories}</SelectItem>
            {(categories.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )
}
