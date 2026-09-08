import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger } from "nexus-assets-web"

/**
 * `TabsContent` is the panel for one `value`; only the matching one is in the
 * tree at a time, so anything that must survive a tab switch belongs above the
 * `Tabs`, not inside a panel. It adds no padding of its own -- the gap you see
 * comes from `Tabs`, which is a `gap-2` column.
 */
export const Panels = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <Tabs defaultValue="models" style={{ width: "100%" }}>
      <TabsList>
        <TabsTrigger value="models">型号</TabsTrigger>
        <TabsTrigger value="vendors">厂商</TabsTrigger>
      </TabsList>
      <TabsContent value="models">
        <Card>
          <CardHeader>
            <CardTitle>型号</CardTitle>
            <CardDescription>共 38 个，覆盖 11 家厂商</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              一个型号属于一家厂商，字段可以绑定到型号，也可以由厂商继承下来。
            </p>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="vendors">
        <Card>
          <CardHeader>
            <CardTitle>厂商</CardTitle>
            <CardDescription>共 11 家</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">绑定到厂商的字段，会出现在它名下每一个型号上。</p>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  </div>
)

/** A panel holding a control, under the line variant. */
export const WithAction = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <Tabs defaultValue="import" style={{ width: "100%" }}>
      <TabsList variant="line">
        <TabsTrigger value="import">导入</TabsTrigger>
        <TabsTrigger value="export">导出</TabsTrigger>
      </TabsList>
      <TabsContent value="import">
        <div style={{ display: "grid", gap: "0.75rem", justifyItems: "start" }}>
          <p className="text-sm text-muted-foreground">按 CSV 模板逐行录入，键名行不翻译。</p>
          <Button variant="outline" size="sm">
            下载 CSV 模板
          </Button>
        </div>
      </TabsContent>
      <TabsContent value="export">
        <div style={{ display: "grid", gap: "0.75rem", justifyItems: "start" }}>
          <p className="text-sm text-muted-foreground">导出当前筛选下的 62 台设备。</p>
          <Button variant="outline" size="sm">
            导出 CSV
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  </div>
)
