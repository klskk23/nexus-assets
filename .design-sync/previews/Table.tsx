import {
  Badge, StatusBadge, Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow,
} from "nexus-assets-web"

/**
 * The asset list, which is what this product mostly is.
 *
 * Two conventions the markup will not tell you: the row itself is the click
 * target (it opens the device — the pointer cursor used to sit on the whole row
 * while only the number cell listened, so four columns out of five looked
 * clickable and were not), and **nothing clickable goes inside a cell**, because
 * it would fire together with the row and one click would produce two results.
 * Row actions live in a right-click menu or in a hover strip at the row's end
 * that stops propagation.
 *
 * Numbers are tabular throughout: a ledger is read down a column.
 */
const ROWS = [
  { sn: "2199023255611", cat: "网络设备", status: "repairing", holder: "上海仓库", owner: "管理员" },
  { sn: "2199023255610", cat: "网络设备", status: "checked_out", holder: "张三", owner: "管理员" },
  { sn: "c40c1cd1", cat: "服务器", status: "in_stock", holder: "上海仓库", owner: "李四" },
  { sn: "2199023255608", cat: "办公终端", status: "in_stock", holder: "北京仓库", owner: "管理员" },
]

export const AssetList = () => (
  <TableFrame>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>资产编号</TableHead>
          <TableHead>类别</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>持有方</TableHead>
          <TableHead>负责人</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ROWS.map((r) => (
          <TableRow key={r.sn} className="cursor-pointer">
            <TableCell className="font-mono">{r.sn}</TableCell>
            <TableCell>{r.cat}</TableCell>
            <TableCell><StatusBadge status={r.status} /></TableCell>
            <TableCell>{r.holder}</TableCell>
            <TableCell>{r.owner}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </TableFrame>
)

/** A metadata table: fewer columns, chips carrying what a row *is*. */
export const MetadataList = () => (
  <TableFrame>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>键名</TableHead>
          <TableHead>显示名称</TableHead>
          <TableHead>类型</TableHead>
          <TableHead>绑定到</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow className="cursor-pointer">
          <TableCell className="font-mono">mac</TableCell>
          <TableCell>基准 MAC</TableCell>
          <TableCell>MAC 地址</TableCell>
          <TableCell><Badge variant="outline">类别</Badge> 网络设备</TableCell>
        </TableRow>
        <TableRow className="cursor-pointer">
          <TableCell className="font-mono">sn</TableCell>
          <TableCell>设备编号</TableCell>
          <TableCell>表达式</TableCell>
          <TableCell><Badge variant="outline">类别</Badge> 网络设备</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </TableFrame>
)
