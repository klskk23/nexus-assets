import { Progress } from "nexus-assets-web"

/**
 * Import is the one flow in this product long enough to need a bar: a CSV of
 * several hundred devices is validated, previewed, then written.
 */
export const Importing = () => (
  <div className="grid gap-2" style={{ maxWidth: "28rem" }}>
    <div className="flex justify-between text-sm">
      <span>正在校验导入文件</span>
      <span className="tabular-nums text-muted-foreground">184 / 420</span>
    </div>
    <Progress value={44} />
  </div>
)

export const Steps = () => (
  <div className="grid gap-4" style={{ maxWidth: "28rem" }}>
    <Progress value={0} />
    <Progress value={35} />
    <Progress value={100} />
  </div>
)
