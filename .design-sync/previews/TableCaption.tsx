import { Table, TableBody, TableCaption, TableCell, TableFrame, TableHead, TableHeader, TableRow } from "nexus-assets-web"

/**
 * A line under a table saying what the table is a table OF. The product's own
 * lists get that from the page heading and the pager's range line instead, so
 * this is for a table lifted out of its page — an export preview, a printed
 * summary — where the heading is not there to carry it.
 */
export const DescribesTheTable = () => (
  <TableFrame>
    <Table>
      <TableCaption>2026 年 9 月 8 日的在库设备，含子类别，不含已报废。</TableCaption>
      <TableHeader>
        <TableRow><TableHead>资产编号</TableHead><TableHead>类别</TableHead><TableHead>持有方</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        <TableRow><TableCell className="font-mono">2199023255611</TableCell><TableCell>网络设备</TableCell><TableCell>上海仓库</TableCell></TableRow>
        <TableRow><TableCell className="font-mono">c40c1cd1</TableCell><TableCell>服务器</TableCell><TableCell>上海仓库</TableCell></TableRow>
      </TableBody>
    </Table>
  </TableFrame>
)
