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
 * The drawer's accessible name. Smaller than a `DialogTitle` -- a sheet on a
 * narrow screen has less room to spend on a heading -- but the same job: name
 * the act in the words the trigger used.
 */
export const NamesTheAct = () => (
  <Drawer defaultOpen>
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
)

/**
 * When the subject is a device the title becomes a row: the number in mono so
 * the digits line up between one device and the next, and the live status chip
 * beside it. There is no close × in the corner to leave room for, so nothing
 * has to be reserved at the end.
 */
export const WithTheStatusChip = () => (
  <Drawer defaultOpen>
    <DrawerContent>
      <DrawerHeader>
        <DrawerTitle>
          {/* An inline row inside the title, so the header keeps deciding where it
              sits: centred in a bottom sheet, left in a side panel. */}
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.75rem", verticalAlign: "middle" }}>
            <span className="font-mono">2199023255611</span>
            <StatusBadge status="repairing" />
          </span>
        </DrawerTitle>
        <DrawerDescription>网络设备 · 维修中心</DrawerDescription>
      </DrawerHeader>
      <div style={{ padding: "0 1rem" }}>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <div>
            <dt className="text-muted-foreground text-[13px]">序列号</dt>
            <dd className="mt-0.5 font-mono">21500-8842-77</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-[13px]">送修日期</dt>
            <dd className="mt-0.5 tabular-nums">2026-06-11</dd>
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
