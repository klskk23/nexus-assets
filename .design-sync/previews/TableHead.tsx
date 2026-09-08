import { Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from "nexus-assets-web"

/**
 * One column heading. It names what is under it and nothing else — no sort
 * arrows in this product, because the server decides the order and a control
 * that looks interactive but is not is worse than no control.
 *
 * A column of numbers gets its heading right-aligned with its values, or the
 * eye has to find the column twice.
 */
export const Headings = () => (
  <TableFrame>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>类别</TableHead>
          <TableHead>台数</TableHead>
          <TableHead>占比</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow><TableCell>网络设备</TableCell><TableCell className="tabular-nums">62</TableCell><TableCell className="tabular-nums">45%</TableCell></TableRow>
        <TableRow><TableCell>服务器</TableCell><TableCell className="tabular-nums">41</TableCell><TableCell className="tabular-nums">30%</TableCell></TableRow>
        <TableRow><TableCell>办公终端</TableCell><TableCell className="tabular-nums">28</TableCell><TableCell className="tabular-nums">20%</TableCell></TableRow>
      </TableBody>
    </Table>
  </TableFrame>
)
