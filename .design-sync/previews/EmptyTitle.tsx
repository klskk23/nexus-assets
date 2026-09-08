import { Button, Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "nexus-assets-web"

/**
 * `EmptyTitle` is the one line that names what is missing -- a noun, not an
 * apology. It goes inside `EmptyHeader`; on its own it is an unstyled div.
 * Keep it short: it is `text-lg` and centred, so a second clause wraps and
 * stops reading as a headline.
 */
export const Named = () => (
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

/** The title carrying the whole message, with no description under it. */
export const Alone = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <Empty className="border" style={{ width: "100%" }}>
      <EmptyHeader>
        <EmptyTitle>没有匹配的设备</EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline">清除全部筛选</Button>
      </EmptyContent>
    </Empty>
  </div>
)
