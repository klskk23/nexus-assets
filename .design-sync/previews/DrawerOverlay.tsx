import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "nexus-assets-web"

const rows = [
  { sn: "2199023255611", holder: "上海仓库", status: "in_stock" },
  { sn: "2199023255612", holder: "李珊", status: "checked_out" },
  { sn: "2199023255613", holder: "维修中心", status: "repairing" },
]

/**
 * The dim between the list and the sheet. `DrawerContent` renders it for you,
 * so it is never written at a call site -- shown here over a real device list
 * so the dim has something to do. Clicking it closes the drawer, and it fades
 * in step with the sheet as it is dragged rather than switching at the end.
 */
export const OverTheDeviceList = () => (
  <div style={{ width: "100%", maxWidth: "40rem" }}>
    <Card>
      <CardHeader>
        <CardTitle>网络设备</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>资产编号</TableHead>
              <TableHead>持有方</TableHead>
              <TableHead>状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.sn}>
                <TableCell className="font-mono">{r.sn}</TableCell>
                <TableCell>{r.holder}</TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <Drawer defaultOpen>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>
            {/* An inline row inside the title, so the header keeps deciding where it
                sits: centred in a bottom sheet, left in a side panel. */}
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.75rem", verticalAlign: "middle" }}>
              <span className="font-mono">2199023255612</span>
              <StatusBadge status="checked_out" />
            </span>
          </DrawerTitle>
          <DrawerDescription>网络设备 · 李珊 · 负责人 周文</DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <Button>归还</Button>
          <DrawerClose asChild>
            <Button variant="outline">关闭</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  </div>
)

/**
 * The same overlay under a right-side panel: full-bleed regardless of the
 * sheet's direction or width, which is what makes the 24rem panel read as being
 * over the page rather than beside it.
 */
export const UnderASidePanel = () => (
  <div style={{ width: "100%", maxWidth: "40rem" }}>
    <Card>
      <CardHeader>
        <CardTitle>已选 128 台</CardTitle>
      </CardHeader>
      <CardContent style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        <StatusBadge status="in_stock" />
        <StatusBadge status="checked_out" />
        <StatusBadge status="repairing" />
        <StatusBadge status="lost" />
      </CardContent>
    </Card>

    <Drawer defaultOpen direction="right">
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>批量变更状态</DrawerTitle>
          <DrawerDescription>128 台设备将改为「维修中」。</DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <Button>变更 128 台</Button>
          <DrawerClose asChild>
            <Button variant="outline">取消</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  </div>
)
