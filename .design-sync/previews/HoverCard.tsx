import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "nexus-assets-web"

/* Preview glue only: the preview sheet's ground is white where the product's
   is cream, so the popover would otherwise float on a colour the product
   never shows it on. */
const ground = { background: "var(--background)", padding: "1rem", paddingBottom: 170 } as const

/**
 * What `Hint` -- the question mark beside a label -- is built on. Opened by
 * the pointer *or* the keyboard, because the trigger is a real focusable
 * button and not a bare icon.
 *
 * The house rule for what may live in here: the sentence somebody wants once
 * and then never again. A refusal, a consequence worth knowing before ticking,
 * and a statement of current state all stay on the page as an Alert -- hidden,
 * those are the same as unsaid.
 *
 * `openDelay={150}` in the product; rendered open here so the card shows what
 * it looks like.
 */
export const BesideAFieldLabel = () => (
  <div style={ground}>
    <div className="flex items-center gap-2 text-sm">
      <span className="font-medium">唯一</span>
      <HoverCard open>
        <HoverCardTrigger asChild>
          <button
            type="button"
            aria-label="这是什么？"
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex size-4 shrink-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:outline-none"
          >
            ?
          </button>
        </HoverCardTrigger>
        <HoverCardContent className="text-muted-foreground text-sm leading-relaxed">
          类别子树内或所绑型号内不重复。建好后不能改。
        </HoverCardContent>
      </HoverCard>
    </div>
  </div>
)

/**
 * On a heading, where the explanation is about what the numbers underneath
 * count rather than about a control.
 */
export const OnAHeading = () => (
  <div style={ground}>
    <h2 className="flex items-center gap-2 text-lg">
      类别分布
      <HoverCard open>
        <HoverCardTrigger asChild>
          <button
            type="button"
            aria-label="这是什么？"
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex size-4 shrink-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:outline-none"
          >
            ?
          </button>
        </HoverCardTrigger>
        <HoverCardContent className="text-muted-foreground text-sm leading-relaxed">
          含子类别，不含已报废的设备。
        </HoverCardContent>
      </HoverCard>
    </h2>
  </div>
)
