import { Button, Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "nexus-assets-web"

/**
 * `EmptyHeader` is the centred stack that holds the icon, the headline and the
 * sentence under it -- and nothing else. It is capped at `max-w-sm` so the
 * sentence wraps to a readable measure however wide the panel is; the action
 * belongs in `EmptyContent` below it, outside this group.
 */
export const Grouped = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <Empty className="border" style={{ width: "100%" }}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-6l-2 3h-4l-2-3H2" />
            <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
          </svg>
        </EmptyMedia>
        <EmptyTitle>这个类别还没有绑定字段</EmptyTitle>
        <EmptyDescription>绑定字段后，录入这个类别的设备时会多出对应的填写项。</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline">绑定字段</Button>
      </EmptyContent>
    </Empty>
  </div>
)

/** A header with no media at all -- legal, and the right call when the panel is small. */
export const TextOnly = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <Empty className="border" style={{ width: "100%" }}>
      <EmptyHeader>
        <EmptyTitle>还没有配置类别</EmptyTitle>
        <EmptyDescription>类别决定一台设备要填哪些字段，是录入前必须先有的一步。</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button>去配置类别</Button>
      </EmptyContent>
    </Empty>
  </div>
)
