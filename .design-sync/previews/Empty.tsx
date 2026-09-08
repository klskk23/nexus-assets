import { Button, Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "nexus-assets-web"

/**
 * No list in this product renders a blank rectangle. An empty state says what
 * would have filled it, and -- when a filter is what emptied it -- offers the
 * way back out. `Empty` itself draws no border: it is `border-dashed` with no
 * width, so a standalone one adds `border`; one sitting inside a `Card` leaves
 * it off and borrows the card's edge.
 */
export const NoAssets = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <Empty className="border" style={{ width: "100%" }}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-6l-2 3h-4l-2-3H2" />
            <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
          </svg>
        </EmptyMedia>
        <EmptyTitle>还没有任何资产</EmptyTitle>
        <EmptyDescription>录入第一台设备后，这里会列出它的资产编号、类别与持有方。</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button>录入第一台设备</Button>
      </EmptyContent>
    </Empty>
  </div>
)

/**
 * Emptied by a filter rather than by having nothing: the description names the
 * filters that are on, and the content slot offers the one action that undoes
 * them. Without it the reader is left to guess which control to hunt down.
 */
export const FilteredOut = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <Empty className="border" style={{ width: "100%" }}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z" />
          </svg>
        </EmptyMedia>
        <EmptyTitle>没有匹配的设备</EmptyTitle>
        <EmptyDescription>当前筛选：网络设备 · 上海仓库 · 维修中。</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline">清除全部筛选</Button>
      </EmptyContent>
    </Empty>
  </div>
)

/** Header only -- the shape a panel takes when there is nothing to act on yet. */
export const NoTransfers = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <Empty className="border" style={{ width: "100%" }}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </EmptyMedia>
        <EmptyTitle>还没有流转记录</EmptyTitle>
        <EmptyDescription>签出、归还或转移这台设备后，记录会出现在这里。</EmptyDescription>
      </EmptyHeader>
    </Empty>
  </div>
)
