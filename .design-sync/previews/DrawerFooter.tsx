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
 * Unlike the dialog's footer this one stacks: full-width buttons, primary on
 * top, dismiss under it -- the order a thumb reaches them in. `mt-auto` pins it
 * to the bottom edge of the sheet however short the body is.
 */
export const StackedActions = () => (
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
 * With a destructive act in it, the order is unchanged and the wording carries
 * the count -- what is about to be destroyed is readable without scrolling back
 * up to the description. 取消 stays the last thing above the edge.
 */
export const WithADestructiveAct = () => (
  <Drawer defaultOpen>
    <DrawerContent>
      <DrawerHeader>
        <DrawerTitle>
          {/* An inline row inside the title, so the header keeps deciding where it
              sits: centred in a bottom sheet, left in a side panel. */}
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.75rem", verticalAlign: "middle" }}>
            <span className="font-mono">2199023255611</span>
            <StatusBadge status="retired" />
          </span>
        </DrawerTitle>
        <DrawerDescription>
          此操作不可撤销，将删除这台设备及其全部流转历史。
        </DrawerDescription>
      </DrawerHeader>
      <DrawerFooter>
        <Button variant="destructive">删除设备</Button>
        <DrawerClose asChild>
          <Button variant="outline">取消</Button>
        </DrawerClose>
      </DrawerFooter>
    </DrawerContent>
  </Drawer>
)
