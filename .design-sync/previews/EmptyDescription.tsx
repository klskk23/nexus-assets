import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "nexus-assets-web"

/**
 * `EmptyDescription` is the muted sentence under the title, and it is where
 * this product does the useful part: it says what *would* fill the list, or
 * which filters are currently on. It relaxes leading and styles any link
 * inside it, so a pointer to the page that fixes the emptiness can live here.
 */
export const Explains = () => (
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

/** With a link in it -- underlined by the component, terracotta on hover. */
export const WithLink = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <Empty className="border" style={{ width: "100%" }}>
      <EmptyHeader>
        <EmptyTitle>这个类别还没有绑定字段</EmptyTitle>
        <EmptyDescription>
          字段在 <a href="/fields">字段</a> 页维护，绑定到类别后才会出现在录入表单里。
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  </div>
)
