import { SearchIcon } from "lucide-react"
import type { ReactNode, Ref } from "react"

import { t } from "@/i18n"
import { Field, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"

interface Props {
  q: string
  onQ: (q: string) => void
  /** What this page searches, said plainly: "键名、显示名". */
  searchHint: string
  /** The page's own filters, laid out in the same row. */
  filters?: ReactNode
  /** The column picker and anything else that belongs at the right end. */
  actions?: ReactNode
  /** A barcode scanner types into whatever has focus; the asset list uses this. */
  inputRef?: Ref<HTMLInputElement>
}

/**
 * One row: a search box, the page's filters, and whatever sits at the right
 * end. Every table page wears the same one.
 *
 * The labels are read out but not drawn -- each control already says what it
 * is, and a caption above every one of them pushed the filters onto three
 * lines. That convention started on the asset list; this is where it lives now.
 *
 * The search box is here even on pages that will never have more rows than fit
 * on a screen. A pager that disappears is obvious -- there is no second page.
 * A search box that disappears has no such tell, and "why does this page not
 * have one" is a question nobody can answer by looking.
 */
export function ListToolbar({ q, onQ, searchHint, filters, actions, inputRef }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Field className="w-auto">
        <FieldLabel htmlFor="list-q" className="sr-only">
          {searchHint}
        </FieldLabel>
        <InputGroup className="w-64">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            id="list-q"
            ref={inputRef}
            value={q}
            placeholder={t.common.searchPlaceholder(searchHint)}
            onChange={(e) => onQ(e.target.value)}
          />
        </InputGroup>
      </Field>
      {filters}
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  )
}
