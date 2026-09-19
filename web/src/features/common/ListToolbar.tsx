import { MagnifyingGlass } from "@phosphor-icons/react"
import type { ReactNode, Ref } from "react"

import { t } from "@/i18n"
import { Field, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { useComposedInput } from "./useComposedInput"

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
 *
 * Handoff §3: the row wraps with an 8px gap; the search box is 260px with the
 * glass at 14px inside a 30px inset; every control in the row is 34px tall.
 * A fixed 260 rather than the flexible 640 it used to be -- that number was
 * Organic's, and the prototype's is a control's width, not a column's.
 */
export function ListToolbar({ q, onQ, searchHint, filters, actions, inputRef }: Props) {
  const composed = useComposedInput(q, onQ)

  return (
    <div className="flex flex-wrap items-center gap-2 [&_[data-slot=select-trigger]]:h-[34px] [&_[data-slot=button][role=combobox]]:h-[34px]">
      <Field className="w-[260px]">
        <FieldLabel htmlFor="list-q" className="sr-only">
          {searchHint}
        </FieldLabel>
        <InputGroup className="h-[34px] w-full">
          <InputGroupAddon className="pl-2.5">
            <MagnifyingGlass className="size-3.5" />
          </InputGroupAddon>
          {/* Spread, composition events included: without them a pinyin IME
              writes its half-finished spelling into the address bar and gets
              it written back on top of the word. See useComposedInput. */}
          <InputGroupInput
            id="list-q"
            ref={inputRef}
            {...composed}
            placeholder={t.common.searchPlaceholder(searchHint)}
          />
        </InputGroup>
      </Field>
      {filters}
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  )
}
