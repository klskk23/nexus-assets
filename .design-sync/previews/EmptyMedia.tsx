import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "nexus-assets-web"

/**
 * `variant="icon"` is the one this product uses: a 40px rounded muted tile
 * that sizes any bare `svg` inside it to 24px. It is the top item of
 * `EmptyHeader` -- put anywhere else it loses the centred stack.
 */
export const IconTile = () => (
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
    </Empty>
  </div>
)

/**
 * `variant="default"` (the default) draws no tile and sizes nothing -- it is a
 * bare slot for artwork that brings its own dimensions.
 */
export const Bare = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <Empty className="border" style={{ width: "100%" }}>
      <EmptyHeader>
        <EmptyMedia>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--muted-foreground)" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z" />
          </svg>
        </EmptyMedia>
        <EmptyTitle>没有匹配的设备</EmptyTitle>
        <EmptyDescription>当前筛选：网络设备 · 上海仓库 · 维修中。</EmptyDescription>
      </EmptyHeader>
    </Empty>
  </div>
)
