import { Button } from "nexus-assets-web"

/**
 * The label a button carries is the action it performs, and it keeps that name
 * through the whole flow -- the button that says "录入设备" produces a toast
 * that says the device was recorded. Every label here is one this product
 * actually uses.
 */
export const Variants = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button>录入设备</Button>
    <Button variant="secondary">导出 CSV</Button>
    <Button variant="outline">使用 Google 登录</Button>
    <Button variant="ghost">清空选择</Button>
    <Button variant="link">全部历史</Button>
    <Button variant="destructive">删除</Button>
  </div>
)

export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button size="xs">xs</Button>
    <Button size="sm">变更状态</Button>
    <Button>录入设备</Button>
    <Button size="lg">确认打印</Button>
  </div>
)

/** Every icon-only control in this product carries an aria-label; a round
 *  button with no accessible name is one a keyboard user cannot identify. */
export const IconOnly = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button size="icon-sm" variant="ghost" aria-label="打印这一台的标签">
      ⌸
    </Button>
    <Button size="icon" variant="outline" aria-label="查看这一台的详情">
      ⓘ
    </Button>
    <Button size="icon-lg" aria-label="录入设备">
      ＋
    </Button>
  </div>
)

/** Disabled is the product's answer to "you may not do this", never hiding:
 *  an action a colleague cannot see is one they cannot learn exists. */
export const Disabled = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button disabled>录入设备</Button>
    <Button variant="outline" disabled title="需要「打印标签」权限，请联系管理员">
      打印标签
    </Button>
    <Button variant="destructive" disabled>
      删除
    </Button>
  </div>
)
