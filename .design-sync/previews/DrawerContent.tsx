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
  Timeline,
} from "nexus-assets-web"

const recent = [
  {
    id: "t2",
    asset_id: "a1",
    batch_id: null,
    kind: "checkout",
    from_status: "in_stock",
    from_holder: { type: "entity", id: "e1", name: "上海仓库" },
    from_owner_id: null,
    to_status: "checked_out",
    to_holder: { type: "user", id: "u7", name: "李珊" },
    to_owner_id: "u7",
    due_at: null,
    created_at: "2026-04-18T02:40:00Z",
    edited_at: null,
    edited_by: null,
    actor: { id: "u2", name: "周文" },
  },
  {
    id: "t1",
    asset_id: "a1",
    batch_id: null,
    kind: "create",
    from_status: null,
    from_holder: null,
    from_owner_id: null,
    to_status: "in_stock",
    to_holder: { type: "entity", id: "e1", name: "上海仓库" },
    to_owner_id: "u2",
    due_at: null,
    created_at: "2026-03-02T09:12:00Z",
    edited_at: null,
    edited_by: null,
    actor: { id: "u2", name: "周文" },
  },
]

/**
 * The sheet itself, with Portal and Overlay already inside it -- the same deal
 * `DialogContent` makes. Bottom is the default direction: it pins to the bottom
 * edge, caps at 80vh, and draws the grab handle you can see above the title.
 */
export const Bottom = () => (
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
          <DrawerDescription>最近流转</DrawerDescription>
        </DrawerHeader>

        <div style={{ padding: "0 1rem" }}>
          <Timeline events={recent} />
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
 * The same content with `direction="right"` on the root: full height, 24rem
 * wide, bordered on the leading edge, and no grab handle -- the handle is drawn
 * only for the bottom direction, because that is the only one dragged downward.
 */
export const Right = () => (
  /* Scaffolding: the card frame paints white while the product paints cream,
     and the ground is the point here -- the dim reads against it. */
  <div style={{ background: "var(--background)", padding: "1rem", minHeight: "100vh" }}>
    <Drawer defaultOpen direction="right">
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
          <DrawerDescription>最近流转</DrawerDescription>
        </DrawerHeader>

        <div style={{ padding: "0 1rem" }}>
          <Timeline events={recent} />
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
