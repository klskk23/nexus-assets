import { useState } from "react"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

import { cn } from "cn"
import { t } from "@/i18n"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Ellipsis, TruncatedTip, useTruncated } from "./Ellipsis"

export interface SearchOption {
  value: string
  /** What the person reads and types against. */
  label: string
  /**
   * Extra text the search should match but the row need not lead with -- a
   * category's full path, a model's vendor. Matching more than is shown is
   * usually wrong; here it is the point, because these are the words people
   * remember about a thing that has a shorter name.
   */
  keywords?: string
}

interface Props {
  id?: string
  value: string
  onChange: (value: string) => void
  options: SearchOption[]
  /** Shown on the trigger when nothing is chosen, and as the "any" row. */
  placeholder: string
  className?: string
  disabled?: boolean
}

/**
 * A select for a list too long to scan.
 *
 * The product's ordinary dropdown stays where it is. This is not a replacement
 * for it: a control with five options and a search box in it is a search box
 * in front of five options, and the reader pays for a decision that was never
 * hard. The judgement is the size of the candidate list -- vendors, models,
 * holders, people and categories grow without bound; statuses and roles do not.
 *
 * Matching is on contained text, ignoring case, and does not require the match
 * to start the word: people type the middle of a number they read off a label,
 * and a prefix search would answer nothing for them.
 *
 * Not built by putting an input inside the ordinary Select. Radix Select owns
 * the keyboard -- typing jumps to whatever option begins with that letter --
 * so the two would fight over every keystroke. That conflict is the reason
 * shadcn composes a combobox out of Popover and Command, and the reason this
 * does too.
 */
export function SearchSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  className,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false)
  const chosen = options.find((o) => o.value === value)
  const { ref: triggerText, isTruncated: triggerTruncated } = useTruncated<HTMLSpanElement>()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TruncatedTip text={chosen?.label ?? placeholder} isTruncated={triggerTruncated}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn("justify-between font-normal", className)}
          >
            <span ref={triggerText} className={cn("truncate", !chosen && "text-muted-foreground")}>
              {chosen?.label ?? placeholder}
            </span>
            <ChevronDownIcon className="opacity-50" />
          </Button>
        </PopoverTrigger>
      </TruncatedTip>
      {/* Wide enough for what is in it, never narrower than the control it
          hangs off.
       *
       * It used to be exactly the trigger's width, which is the shadcn
       * combobox default rather than a decision anybody made here -- and the
       * asset filter bar's triggers are w-40, so every model came out as
       * `Dell E...`. A tooltip would have made each one readable one hover at
       * a time, in a list whose whole job is to be scanned; and a finger gets
       * no hover at all. The cap keeps a pathological name from throwing a
       * panel across the screen, and anything past it still has its tooltip. */}
      <PopoverContent
        className="max-w-[min(24rem,calc(100vw-2rem))] min-w-(--radix-popover-trigger-width) p-0"
        align="start"
      >
        <Command
          filter={(itemValue, search, keywords) => {
            const hay = [itemValue, ...(keywords ?? [])].join(" ").toLowerCase()
            return hay.includes(search.toLowerCase()) ? 1 : 0
          }}
        >
          <CommandInput placeholder={placeholder} />
          <CommandList>
            {/* A sentence, not a blank panel: an empty box reads as broken,
                which is what it looked like before somebody realised they had
                typed a name that is not in this list. */}
            <CommandEmpty>{t.common.noMatches}</CommandEmpty>
            <CommandGroup>
              {/* Clearing the filter is one of the options, not a separate
                  control beside the box. */}
              <CommandItem
                value={placeholder}
                onSelect={() => {
                  onChange("")
                  setOpen(false)
                }}
              >
                <CheckIcon className={cn(!value ? "opacity-100" : "opacity-0")} />
                <span className="text-muted-foreground">{placeholder}</span>
              </CommandItem>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  // cmdk searches the value, so the label goes here and the id
                  // travels in the closure -- ids are not what anybody types.
                  value={o.label}
                  keywords={o.keywords ? [o.keywords] : undefined}
                  onSelect={() => {
                    onChange(o.value)
                    setOpen(false)
                  }}
                >
                  <CheckIcon className={cn(value === o.value ? "opacity-100" : "opacity-0")} />
                  {/* Mouse only, and knowingly: cmdk keeps DOM focus on the
                      search box and moves a highlight with aria-activedescendant,
                      so there is no focus here for a tooltip to open on. The
                      panel above is what makes this rare. */}
                  <Ellipsis text={o.label} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
