import { Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from "nexus-assets-web"

/**
 * The frame every table in this product sits in: a card on the page ground that
 * scrolls sideways **on its own**.
 *
 * That last part is the whole reason it exists as a component. Column sets here
 * are dynamic — a category with twelve fields makes a table wider than the
 * window — and a horizontal scrollbar on the body would drag the navigation
 * rail off with it. Ten places had written the same three classes, which is
 * nine places to miss when the answer changes.
 */
const cols = ["资产编号", "类别", "状态", "持有方", "负责人", "型号", "厂商", "基准 MAC", "固件版本", "备注"]

export const ScrollsSideways = () => (
  <TableFrame style={{ maxWidth: "34rem" }}>
    <Table>
      <TableHeader>
        <TableRow>{cols.map((c) => <TableHead key={c}>{c}</TableHead>)}</TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-mono">2199023255611</TableCell>
          <TableCell>网络设备</TableCell><TableCell>维修中</TableCell>
          <TableCell>上海仓库</TableCell><TableCell>管理员</TableCell>
          <TableCell>VEP-4600</TableCell><TableCell>Dell</TableCell>
          <TableCell className="font-mono">02000000003B</TableCell>
          <TableCell>2.2.1</TableCell><TableCell>屏幕左下角有划痕</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </TableFrame>
)

/** Narrow enough to fit: the frame is still the card the table lives on. */
export const Fits = () => (
  <TableFrame>
    <Table>
      <TableHeader><TableRow><TableHead>键名</TableHead><TableHead>类型</TableHead></TableRow></TableHeader>
      <TableBody>
        <TableRow><TableCell className="font-mono">mac</TableCell><TableCell>MAC 地址</TableCell></TableRow>
        <TableRow><TableCell className="font-mono">sn</TableCell><TableCell>表达式</TableCell></TableRow>
      </TableBody>
    </Table>
  </TableFrame>
)
