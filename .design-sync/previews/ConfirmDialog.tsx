import { Button, ConfirmDialog } from "nexus-assets-web"

/**
 * The product's destructive-confirmation wrapper. Every irreversible act in
 * the application goes through this one component rather than through a
 * hand-assembled AlertDialog, which is what keeps three rules true everywhere:
 *
 * - the description names *what* is destroyed and *how much*, never 「确定吗？」;
 * - the dangerous ones set `requirePhrase`, and the action stays disabled
 *   until that exact string has been typed;
 * - the phrase is shown with a copy button, because a serial hand-copied off a
 *   label is a typo waiting to happen and a typo does not make a delete safer.
 *
 * Rendered open. `trigger` is optional: an action chosen from a context menu
 * has nothing to hang off, because the menu has already closed by the time the
 * dialog should appear, so those callers drive `open` themselves.
 */
export const RequiresTheIdentifier = () => (
  <ConfirmDialog
    open
    onOpenChange={() => {}}
    title="删除资产"
    description="上海仓库 · 网络设备 · 2199023255611 将被删除，连同它的全部流转历史。"
    confirmLabel="删除"
    requirePhrase="2199023255611"
    onConfirm={() => {}}
  />
)

/**
 * A batch cannot ask for every number to be typed out, so it asks for its
 * size: you cannot confirm without having looked at how many you selected.
 */
export const ABatchTypesItsCount = () => (
  <ConfirmDialog
    open
    onOpenChange={() => {}}
    title="删除资产"
    description="此操作不可撤销，将删除选中的 12 台设备及其全部流转历史。"
    confirmLabel="删除"
    requirePhrase="12"
    onConfirm={() => {}}
  />
)

/**
 * Without `requirePhrase` there is no box to type in and the action is armed
 * from the start. Reserved for the reversible destructive acts -- stopping an
 * account can be undone by starting it again, so making somebody transcribe an
 * email address would only teach them to transcribe without reading.
 *
 * With a `trigger`, the dialog owns its own open state.
 */
export const NoPhraseNeeded = () => (
  <ConfirmDialog
    open
    onOpenChange={() => {}}
    trigger={<Button variant="outline">停用</Button>}
    title="停用账号"
    description="张伟将无法再登录。他名下的 8 台设备保持不变，负责人仍然是他。"
    confirmLabel="停用"
    onConfirm={() => {}}
  />
)
