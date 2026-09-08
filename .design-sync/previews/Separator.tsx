import { Separator } from "nexus-assets-web"

/**
 * The rule between two things that are genuinely different in kind -- on the
 * sign-in page it separates a password from somebody else's sign-in page.
 * Between rows of a table, the table's own row line does that job instead.
 */
export const Horizontal = () => (
  <div className="grid max-w-sm gap-4">
    <p className="text-sm">用邮箱与密码登录</p>
    <Separator />
    <p className="text-sm">使用 Google 登录</p>
  </div>
)

export const Vertical = () => (
  <div className="flex h-8 items-center gap-4 text-sm">
    <span>1–20 / 共 137 条</span>
    <Separator orientation="vertical" />
    <span>每页 20 条</span>
  </div>
)
