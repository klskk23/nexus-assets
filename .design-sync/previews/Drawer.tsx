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
 * The narrow-screen counterpart of the asset detail: the same device, the same
 * status chip, reached by a sheet that comes up from the bottom edge instead of
 * a box centred over a table there is no room for. `defaultOpen` skips the
 * enter animation; the grab handle at the top is drawn by `DrawerContent`
 * itself, and only for the bottom direction.
 */
export const AssetDetailOnNarrowScreens = () => (
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
          <DrawerDescription>网络设备 · 交换机 S5720-28X</DrawerDescription>
        </DrawerHeader>

        <div style={{ padding: "0 1rem" }}>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <div>
              <dt className="text-muted-foreground text-[13px]">持有方</dt>
              <dd className="mt-0.5">李珊</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-[13px]">负责人</dt>
              <dd className="mt-0.5">周文</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-[13px]">归属地</dt>
              <dd className="mt-0.5">上海仓库</dd>
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
 * `direction="right"` turns the same component into a side panel, capped at
 * 24rem and full height -- the shape a filter panel wants when the toolbar's
 * inline filters no longer fit. No grab handle in this direction: it is dragged
 * from the edge, not from a bar.
 *
 * Note for whoever ports this: Drawer is not used anywhere in nexus-assets
 * today, so these cells are idiomatic vaul compositions in the product's
 * vocabulary rather than screenshots of a real screen.
 */
export const FromTheRight = () => (
  /* Scaffolding: the card frame paints white while the product paints cream,
     and the ground is the point here -- the dim reads against it. */
  <div style={{ background: "var(--background)", padding: "1rem", minHeight: "100vh" }}>
    <Drawer defaultOpen direction="right">
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>筛选</DrawerTitle>
          <DrawerDescription>筛选进地址栏，刷新后还在。</DrawerDescription>
        </DrawerHeader>

        <div style={{ padding: "0 1rem" }}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="dw-category">类别</FieldLabel>
              <Select defaultValue="network">
                <SelectTrigger id="dw-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="network">网络设备</SelectItem>
                  <SelectItem value="laptop">笔记本</SelectItem>
                  <SelectItem value="server">服务器</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="dw-status">状态</FieldLabel>
              <Select defaultValue="in_stock">
                <SelectTrigger id="dw-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_stock">在库</SelectItem>
                  <SelectItem value="checked_out">已签出</SelectItem>
                  <SelectItem value="repairing">维修中</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="dw-holder">持有方</FieldLabel>
              <Select defaultValue="sh">
                <SelectTrigger id="dw-holder">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sh">上海仓库</SelectItem>
                  <SelectItem value="rd">研发一部</SelectItem>
                  <SelectItem value="fix">维修中心</SelectItem>
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
