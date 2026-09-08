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
  DrawerTrigger,
  StatusBadge,
} from "nexus-assets-web"

/**
 * The portal moves the sheet into the document body. `DrawerContent` renders it
 * for you, and that is what lets the drawer below be declared inside a clipped,
 * fixed-height card and still pin itself to the bottom edge of the viewport
 * rather than to the bottom of the card it was written in.
 */
export const EscapesItsParent = () => (
  <div style={{ width: "100%", maxWidth: "34rem" }}>
    <Card className="max-h-56 overflow-hidden">
      <CardHeader>
        <CardTitle>2199023255611</CardTitle>
      </CardHeader>
      <CardContent style={{ display: "grid", gap: "0.75rem" }}>
        <p className="text-sm text-muted-foreground">
          网络设备 · 交换机 S5720-28X · 上海仓库
        </p>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Drawer defaultOpen>
            <DrawerTrigger asChild>
              <Button size="sm" variant="outline">
                查看详情
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>
                  {/* An inline row inside the title, so the header keeps deciding where it
                      sits: centred in a bottom sheet, left in a side panel. */}
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "0.75rem", verticalAlign: "middle" }}>
                    <span className="font-mono">2199023255611</span>
                    <StatusBadge status="in_stock" />
                  </span>
                </DrawerTitle>
                <DrawerDescription>网络设备 · 上海仓库 · 负责人 周文</DrawerDescription>
              </DrawerHeader>
              <div style={{ padding: "0 1rem" }}>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground text-[13px]">序列号</dt>
                    <dd className="mt-0.5 font-mono">21500-8842-77</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-[13px]">保修截止</dt>
                    <dd className="mt-0.5 tabular-nums">2027-04-30</dd>
                  </div>
                </dl>
              </div>
              <DrawerFooter>
                <Button>签出</Button>
                <DrawerClose asChild>
                  <Button variant="outline">关闭</Button>
                </DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </div>
      </CardContent>
    </Card>
  </div>
)

/**
 * The same escape from a toolbar, into a right-side panel: the drawer is
 * written next to the 筛选 button that owns it and still takes the full height
 * of the viewport, not of the card.
 */
export const FromAToolbar = () => (
  <div style={{ width: "100%", maxWidth: "34rem" }}>
    <Card>
      <CardHeader>
        <CardTitle>已选 128 台</CardTitle>
      </CardHeader>
      <CardContent style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        <Button size="sm" variant="outline">
          导出 CSV
        </Button>
        <Drawer defaultOpen direction="right">
          <DrawerTrigger asChild>
            <Button size="sm" variant="outline">
              筛选
            </Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>筛选</DrawerTitle>
              <DrawerDescription>筛选进地址栏，刷新后还在。</DrawerDescription>
            </DrawerHeader>
            <div style={{ padding: "0 1rem" }} className="text-sm text-muted-foreground">
              当前筛选：网络设备 · 上海仓库 · 在库
            </div>
            <DrawerFooter>
              <Button>应用筛选</Button>
              <DrawerClose asChild>
                <Button variant="outline">清空</Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </CardContent>
    </Card>
  </div>
)
