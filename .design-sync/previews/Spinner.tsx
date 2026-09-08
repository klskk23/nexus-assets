import { Button, Spinner } from "nexus-assets-web"

/**
 * For a wait short enough that a skeleton would flash. It never appears alone:
 * a spinner with no words beside it says something is happening but not what.
 */
export const InAButton = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button disabled>
      <Spinner data-icon="inline-start" aria-hidden />
      登录中…
    </Button>
    <Button variant="outline" disabled>
      <Spinner data-icon="inline-start" aria-hidden />
      正在导出
    </Button>
  </div>
)

export const Inline = () => (
  <p className="flex items-center gap-2 text-sm text-muted-foreground">
    <Spinner aria-hidden />
    正在核对符合筛选的 137 条…
  </p>
)
