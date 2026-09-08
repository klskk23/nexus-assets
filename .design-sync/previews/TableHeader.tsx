import { Checkbox, Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from "nexus-assets-web"

/**
 * The heading band, sunk below the card so the eye can tell a label from a
 * value at a glance.
 *
 * On the asset list its first cell is not a label at all — it is the
 * select-this-page checkbox, which is why that column has no heading text.
 */
export const WithSelectAll = () => (
  <TableFrame>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10"><Checkbox aria-label="全选本页" /></TableHead>
          <TableHead>资产编号</TableHead>
          <TableHead>类别</TableHead>
          <TableHead>持有方</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell><Checkbox aria-label="选择 2199023255611" /></TableCell>
          <TableCell className="font-mono">2199023255611</TableCell>
          <TableCell>网络设备</TableCell><TableCell>上海仓库</TableCell>
        </TableRow>
        <TableRow>
          <TableCell><Checkbox aria-label="选择 c40c1cd1" defaultChecked /></TableCell>
          <TableCell className="font-mono">c40c1cd1</TableCell>
          <TableCell>服务器</TableCell><TableCell>上海仓库</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </TableFrame>
)

export const PlainHeadings = () => (
  <TableFrame>
    <Table>
      <TableHeader>
        <TableRow><TableHead>时间</TableHead><TableHead>操作人</TableHead><TableHead>对象</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        <TableRow><TableCell>08/09 02:28</TableCell><TableCell>管理员</TableCell><TableCell>字段 mac</TableCell></TableRow>
      </TableBody>
    </Table>
  </TableFrame>
)
