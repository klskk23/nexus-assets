import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import type { Category } from "@/lib/types"
import { tMeta } from "@/i18n"
import { Field, FieldLabel } from "@/components/ui/field"
import { SearchSelect } from "@/features/common/SearchSelect"

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
      {/* Searchable: categories grow without bound. */}
      <SearchSelect
        id="filter-category"
        className="w-44"
        value={value}
        onChange={onChange}
        placeholder={tMeta.fields.allCategories}
        options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
      />
    </Field>
  )
}
