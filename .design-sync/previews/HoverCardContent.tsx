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
 * The panel itself: `w-64` by default, popover ground, and the muted small
 * type this product gives every hint. It is portalled, so it is never clipped
 * by the dialog or the table cell its trigger lives in.
 *
 * One or two sentences. Anything longer is documentation, and documentation
 * that only appears while the pointer is still is documentation nobody reads.
 */
export const OneSentence = () => (
  <div style={ground}>
    <div className="flex items-center gap-2 text-sm">
      <span className="font-medium">含子类别</span>
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
          勾上时「网络设备」也会带出交换机、路由器下面的设备。
        </HoverCardContent>
      </HoverCard>
    </div>
  </div>
)

/**
 * `align="start"` and a side keep the panel over its own column instead of
 * centred on a mark at the edge of the screen. The width is the one knob worth
 * turning -- a monospaced key list needs more than 16rem to stop wrapping
 * mid-identifier.
 */
export const WiderAndAligned = () => (
  <div style={{ ...ground, paddingBottom: 200 }}>
    <div className="flex items-center gap-2 text-sm">
      <span className="font-medium">表达式</span>
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
        <HoverCardContent
          align="start"
          side="bottom"
          className="text-muted-foreground w-72 text-sm leading-relaxed"
        >
          可以引用同一台设备上的其他字段，写作{" "}
          <code className="font-mono">fields.warranty_until</code>
          。计算出来的值不可直接填写。
        </HoverCardContent>
      </HoverCard>
    </div>
  </div>
)
