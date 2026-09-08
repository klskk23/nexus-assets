import { Button, Toaster } from "nexus-assets-web"

/**
 * Pinned to light since 017: read from the OS this would follow the system
 * theme, and a dark toast would be the single dark surface in the product.
 *
 * A toast reports what happened in the same words as the button that caused it
 * -- 「删除」 produces 「已删除 12 台设备」, never a generic "Success".
 *
 * It renders into a portal at the page corner, so this card shows the mount
 * point and the action that would fill it; a toast is not a static thing to
 * screenshot.
 */
export const Mounted = () => (
  <div className="grid gap-4">
    <p className="text-sm text-muted-foreground">
      挂载点。真实的提示由动作触发，出现在页面角落。
    </p>
    <div className="flex gap-2">
      <Button size="sm" variant="outline">导出 CSV</Button>
      <Button size="sm" variant="destructive">删除</Button>
    </div>
    <Toaster />
  </div>
)
