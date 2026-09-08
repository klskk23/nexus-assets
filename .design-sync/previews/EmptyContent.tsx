import { Button, Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "nexus-assets-web"

/**
 * `EmptyContent` is the slot under the header for the way out -- the button
 * that would make the list non-empty. It stacks its children full width up to
 * `max-w-sm`, so one button reads as the obvious next step and two stack
 * rather than sitting side by side.
 */
export const OneAction = () => (
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
 * Two ways out. Wrap them in a row yourself -- the slot stacks by default, and
 * that is usually right; side by side only when neither is clearly primary.
 */
export const TwoActions = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <Empty className="border" style={{ width: "100%" }}>
      <EmptyHeader>
        <EmptyTitle>没有匹配的设备</EmptyTitle>
        <EmptyDescription>当前筛选：网络设备 · 上海仓库 · 维修中。</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Button variant="outline">清除全部筛选</Button>
          <Button variant="ghost">导出 CSV</Button>
        </div>
      </EmptyContent>
    </Empty>
  </div>
)
