import { HelpCircleIcon } from "lucide-react"

import { t } from "@/i18n"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"

/**
 * The explanation for a control that has no box to hide it in.
 *
 * A hint that says what to type belongs in the placeholder, where it is read
 * exactly when it is needed and costs no space. Selects, checkboxes and toggle
 * groups have nowhere to put one, and a line of prose under each of them turns
 * a form into an essay -- so the question mark holds it and the pointer asks
 * for it.
 *
 * Nothing that changes what the reader does goes in here: a refusal is an
 * Alert, a consequence worth knowing before ticking is an Alert, and both stay
 * on the page. This is for the sentence somebody wants once and then never
 * again.
 */
export function Hint({ children }: { children: React.ReactNode }) {
  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild>
        {/* A button, not a bare icon: the pointer is not the only way in, and
            a focusable trigger is what lets the keyboard open it too. */}
        <button
          type="button"
          aria-label={t.common.whatIsThis}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex size-4 shrink-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:outline-none"
        >
          <HelpCircleIcon className="size-3.5" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="text-muted-foreground text-sm leading-relaxed">
        {children}
      </HoverCardContent>
    </HoverCard>
  )
}
