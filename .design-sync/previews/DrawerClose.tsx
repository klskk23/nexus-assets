import {
  Alert,
  AlertDescription,
  AlertTitle,
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
 * A drawer has no × in its corner, so the close is something you write. Wrapped
 * around the outline button in the footer it dismisses without the open state
 * having to be passed down -- and it is the only visible way out besides
 * dragging the sheet down.
 */
export const AsTheCancelButton = () => (
  /* Scaffolding: the card frame paints white while the product paints cream,
     and the ground is the point here -- the dim reads against it. */
  <div style={{ background: "var(--background)", padding: "1rem", minHeight: "100vh" }}>
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
          <DrawerDescription>网络设备 · 李珊 · 负责人 周文</DrawerDescription>
        </DrawerHeader>
        <div style={{ padding: "0 1rem" }}>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <div>
              <dt className="text-muted-foreground text-[13px]">签出日期</dt>
              <dd className="mt-0.5 tabular-nums">2026-04-18</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-[13px]">应归还</dt>
              <dd className="mt-0.5 tabular-nums">2026-05-02</dd>
            </div>
          </dl>
        </div>
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
 * After the act there is nothing left to cancel, so the close becomes the
 * primary and only button. The same component, filled instead of outline --
 * what changes is which button it wraps.
 */
export const AsTheOnlyWayOut = () => (
  /* Scaffolding: the card frame paints white while the product paints cream,
     and the ground is the point here -- the dim reads against it. */
  <div style={{ background: "var(--background)", padding: "1rem", minHeight: "100vh" }}>
    <Drawer defaultOpen>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>已变更 128 台</DrawerTitle>
          <DrawerDescription>状态已改为「维修中」，流转记录已写入。</DrawerDescription>
        </DrawerHeader>
        <div style={{ padding: "0 1rem" }}>
          <Alert>
            {/* A real <svg>: Alert's icon column only opens for one. */}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            <AlertTitle>跳过了 6 台</AlertTitle>
            <AlertDescription>这 6 台本来就是「维修中」，没有重复写记录。</AlertDescription>
          </Alert>
        </div>
        <DrawerFooter>
          <DrawerClose asChild>
            <Button>完成</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  </div>
)
