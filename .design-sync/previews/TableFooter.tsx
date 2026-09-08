import { Table, TableBody, TableCell, TableFooter, TableFrame, TableHead, TableHeader, TableRow } from "nexus-assets-web"

/**
 * A totals band. It belongs to tables that count things — the category
 * breakdown, an import summary — never to the asset list, where the count of
 * what matched lives in the pager's range line instead.
 *
 * Totals are tabular figures and sit in the same column as the values they add
 * up, which is the only way the eye can check them.
 */
export const Totals = () => (
  <TableFrame>
    <Table>
      <TableHeader>
        <TableRow><TableHead>类别</TableHead><TableHead>在库</TableHead><TableHead>已签出</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        <TableRow><TableCell>网络设备</TableCell><TableCell className="tabular-nums">44</TableCell><TableCell className="tabular-nums">18</TableCell></TableRow>
        <TableRow><TableCell>服务器</TableCell><TableCell className="tabular-nums">35</TableCell><TableCell className="tabular-nums">6</TableCell></TableRow>
        <TableRow><TableCell>办公终端</TableCell><TableCell className="tabular-nums">21</TableCell><TableCell className="tabular-nums">7</TableCell></TableRow>
      </TableBody>
      <TableFooter>
        <TableRow><TableCell>合计</TableCell><TableCell className="tabular-nums">100</TableCell><TableCell className="tabular-nums">31</TableCell></TableRow>
      </TableFooter>
    </Table>
  </TableFrame>
)

/** An import run's outcome, which is the other thing worth totalling. */
export const ImportSummary = () => (
  <TableFrame>
    <Table>
      <TableHeader>
        <TableRow><TableHead>结果</TableHead><TableHead>行数</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        <TableRow><TableCell>将新建</TableCell><TableCell className="tabular-nums">386</TableCell></TableRow>
        <TableRow><TableCell>将更新</TableCell><TableCell className="tabular-nums">22</TableCell></TableRow>
        <TableRow><TableCell>被拒绝</TableCell><TableCell className="tabular-nums">12</TableCell></TableRow>
      </TableBody>
      <TableFooter>
        <TableRow><TableCell>共</TableCell><TableCell className="tabular-nums">420</TableCell></TableRow>
      </TableFooter>
    </Table>
  </TableFrame>
)
