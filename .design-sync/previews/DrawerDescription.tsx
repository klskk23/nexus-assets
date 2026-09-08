import {
  Button,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  StatusBadge,
} from "nexus-assets-web"

/**
 * One muted line under the title, and the drawer's accessible description. It
 * carries what the sheet is about to do and what it will skip -- the caveat a
 * reader needs before the footer's button, not a restatement of the title.
 */
export const SaysWhatWillHappen = () => (
  <Drawer defaultOpen>
    <DrawerContent>
      <DrawerHeader>
        <DrawerTitle>批量变更状态</DrawerTitle>
        <DrawerDescription>
          128 台设备将改为「维修中」。已经是这个状态的会被跳过，不写流转记录。
        </DrawerDescription>
      </DrawerHeader>
      <DrawerFooter>
        <Button>变更 128 台</Button>
        <DrawerClose asChild>
          <Button variant="outline">取消</Button>
        </DrawerClose>
      </DrawerFooter>
    </DrawerContent>
  </Drawer>
)

/**
 * Under a device rather than an act, the description is the breadcrumb the
 * title has no room for: what kind of thing it is, where it sits, who answers
 * for it. Everything that would be a second heading on a wider screen.
 */
export const CarriesTheBreadcrumb = () => (
  <Drawer defaultOpen>
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
        <DrawerDescription>网络设备 · 交换机 S5720-28X · 上海仓库 · 负责人 周文</DrawerDescription>
      </DrawerHeader>
      <div style={{ padding: "0 1rem" }}>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <div>
            <dt className="text-muted-foreground text-[13px]">入库日期</dt>
            <dd className="mt-0.5 tabular-nums">2026-03-02</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-[13px]">保修截止</dt>
            <dd className="mt-0.5 tabular-nums">2027-04-30</dd>
          </div>
        </dl>
      </div>
      <DrawerFooter>
        <DrawerClose asChild>
          <Button variant="outline">关闭</Button>
        </DrawerClose>
      </DrawerFooter>
    </DrawerContent>
  </Drawer>
)
