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
 * Title and description, tighter than the dialog's header and padded by itself
 * -- the drawer's body has no padding of its own, which is why the header,
 * footer and anything you put between them each carry their own.
 *
 * In the bottom direction the header centres its text; from `md` up it goes
 * left-aligned. That is the header reacting to the direction on the content
 * above it, not something a call site sets.
 */
export const TitleAndDescription = () => (
  <Drawer defaultOpen>
    <DrawerContent>
      <DrawerHeader>
        <DrawerTitle>
          {/* An inline row inside the title, so the header keeps deciding where it
              sits: centred in a bottom sheet, left in a side panel. */}
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.75rem", verticalAlign: "middle" }}>
            <span className="font-mono">2199023255611</span>
            <StatusBadge status="checked_out" />
          </span>
        </DrawerTitle>
        <DrawerDescription>网络设备 · 交换机 S5720-28X · 负责人 周文</DrawerDescription>
      </DrawerHeader>
      <div style={{ padding: "0 1rem" }}>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <div>
            <dt className="text-muted-foreground text-[13px]">持有方</dt>
            <dd className="mt-0.5">李珊</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-[13px]">归属地</dt>
            <dd className="mt-0.5">上海仓库</dd>
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

/**
 * The same header in a right-side panel, where it is left-aligned at every
 * width -- a side sheet is a column of controls, and a centred title over a
 * left-aligned form reads as a mistake.
 */
export const InASidePanel = () => (
  <Drawer defaultOpen direction="right">
    <DrawerContent>
      <DrawerHeader>
        <DrawerTitle>批量变更状态</DrawerTitle>
        <DrawerDescription>
          128 台设备将改为「维修中」。已经是这个状态的会被跳过，不写流转记录。
        </DrawerDescription>
      </DrawerHeader>
      <div style={{ padding: "0 1rem" }} className="text-sm text-muted-foreground">
        当前筛选：网络设备 · 上海仓库
      </div>
      <DrawerFooter>
        <Button>变更 128 台</Button>
        <DrawerClose asChild>
          <Button variant="outline">取消</Button>
        </DrawerClose>
      </DrawerFooter>
    </DrawerContent>
  </Drawer>
)
