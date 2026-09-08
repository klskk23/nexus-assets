import { StatusBadge, Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from "nexus-assets-web"

/**
 * The rows. Row lines are lighter than the frame around them — same colour
 * family, half the weight — so the eye follows a column down rather than
 * stopping at every rule.
 */
const ROWS = [
  ["2199023255611", "网络设备", "repairing"], ["2199023255610", "网络设备", "checked_out"],
  ["c40c1cd1", "服务器", "in_stock"], ["2199023255608", "办公终端", "in_stock"],
  ["e23d9ed8", "网络设备", "repairing"], ["2199023255605", "服务器", "checked_out"],
] as const

export const ManyRows = () => (
  <TableFrame>
    <Table>
      <TableHeader>
        <TableRow><TableHead>资产编号</TableHead><TableHead>类别</TableHead><TableHead>状态</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        {ROWS.map(([sn, cat, st]) => (
          <TableRow key={sn}>
            <TableCell className="font-mono">{sn}</TableCell>
            <TableCell>{cat}</TableCell>
            <TableCell><StatusBadge status={st} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </TableFrame>
)

/** One row is still a table, not a paragraph. */
export const SingleRow = () => (
  <TableFrame>
    <Table>
      <TableHeader><TableRow><TableHead>资产编号</TableHead><TableHead>类别</TableHead></TableRow></TableHeader>
      <TableBody>
        <TableRow><TableCell className="font-mono">2199023255611</TableCell><TableCell>网络设备</TableCell></TableRow>
      </TableBody>
    </Table>
  </TableFrame>
)
