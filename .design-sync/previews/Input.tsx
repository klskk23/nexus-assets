import { Input, Label } from "nexus-assets-web"

/**
 * A pill, like every other small control since 017.
 *
 * The hint for an input belongs in its placeholder -- read at the moment it is
 * needed, and costing no vertical space. A line of explanation under every
 * field is how a form ends up with more prose than controls, at which point
 * nobody reads any of it.
 */
export const Fields = () => (
  <div className="grid max-w-sm gap-4">
    <div className="grid gap-2">
      <Label htmlFor="p-sn">资产编号</Label>
      <Input id="p-sn" defaultValue="2199023255611" />
    </div>
    <div className="grid gap-2">
      <Label htmlFor="p-mac">基准 MAC</Label>
      <Input id="p-mac" placeholder="12 位十六进制，可带分隔符" />
    </div>
  </div>
)

export const States = () => (
  <div className="grid max-w-sm gap-3">
    <Input placeholder="搜索资产" />
    <Input defaultValue="2199023255611" readOnly />
    <Input placeholder="已停用的字段" disabled />
    <Input defaultValue="不是合法的 MAC" aria-invalid />
  </div>
)

export const Types = () => (
  <div className="grid max-w-sm gap-3">
    <Input type="email" placeholder="name@example.com" autoComplete="username" />
    <Input type="password" placeholder="密码" autoComplete="current-password" />
    <Input type="number" defaultValue={20} />
  </div>
)
