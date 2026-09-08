import {
  Button,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  Field,
  FieldGroup,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
} from "nexus-assets-web"

/**
 * `asChild` hands the open behaviour to the button already in the toolbar, the
 * same contract `DialogTrigger` makes -- so a screen can switch between a
 * dialog and a drawer by breakpoint without the trigger changing at all.
 */
export const AsChildButton = () => (
  <div style={{ display: "flex" }}>
    <Drawer defaultOpen>
      <DrawerTrigger asChild>
        <Button variant="outline">打开设备</Button>
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
          <Button>完整历史</Button>
          <DrawerClose asChild>
            <Button variant="outline">关闭</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  </div>
)

/**
 * One trigger among the toolbar's other buttons: on a phone the filters do not
 * fit inline, so 筛选 opens a side panel while 导出 CSV stays an ordinary button.
 */
export const InAToolbar = () => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
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
        <div style={{ padding: "0 1rem" }}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="dwt-category">类别</FieldLabel>
              <Select defaultValue="network">
                <SelectTrigger id="dwt-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="network">网络设备</SelectItem>
                  <SelectItem value="laptop">笔记本</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="dwt-status">状态</FieldLabel>
              <Select defaultValue="repairing">
                <SelectTrigger id="dwt-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_stock">在库</SelectItem>
                  <SelectItem value="repairing">维修中</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </div>
        <DrawerFooter>
          <Button>应用筛选</Button>
          <DrawerClose asChild>
            <Button variant="outline">清空</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  </div>
)
