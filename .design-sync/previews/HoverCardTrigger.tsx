import {
  Badge,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "nexus-assets-web"

/* Preview glue only: the preview sheet's ground is white where the product's
   is cream, so the popover would otherwise float on a colour the product
   never shows it on. */
const ground = { background: "var(--background)", padding: "1rem", paddingBottom: 170 } as const

/**
 * Always `asChild` around something already focusable. The primitive renders a
 * plain `<a>` by default, and this product's rule is that the pointer must not
 * be the only way in: a `<button type="button">` with an `aria-label` opens on
 * focus as well as on hover, which is what makes the hint reachable by
 * keyboard at all.
 */
export const AQuestionMark = () => (
  <div style={ground}>
    <div className="flex items-center gap-2 text-sm">
      <span className="font-medium">绑定到</span>
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
          只能选一种；绑型号的字段只出现在这些型号的设备上。
        </HoverCardContent>
      </HoverCard>
    </div>
  </div>
)

/**
 * The trigger can be the thing being explained rather than a mark next to it.
 * A binding chip carries the whole rule of that binding, which is far too long
 * to sit in a table cell.
 */
export const ABadgeThatExplainsItself = () => (
  <div style={ground}>
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">保修截止</span>
      <HoverCard open>
        <HoverCardTrigger asChild>
          <button type="button" style={{ background: "none", border: 0, padding: 0, cursor: "default" }}>
            <Badge variant="outline">厂商 · 思科</Badge>
          </button>
        </HoverCardTrigger>
        <HoverCardContent className="text-muted-foreground text-sm leading-relaxed">
          厂商「思科」已经提供了这个字段，旗下所有型号都会有它，以后新建的型号也一样。
        </HoverCardContent>
      </HoverCard>
    </div>
  </div>
)
