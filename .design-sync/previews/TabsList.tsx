import { Tabs, TabsContent, TabsList, TabsTrigger } from "nexus-assets-web"

/**
 * `variant="default"` is the one this product uses: the list is a muted pill
 * and the active trigger is a lighter pill floating inside it. It sizes to its
 * content (`w-fit`), so it never stretches across the page.
 */
export const Pill = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <Tabs defaultValue="models" style={{ width: "100%" }}>
      <TabsList>
        <TabsTrigger value="models">型号</TabsTrigger>
        <TabsTrigger value="vendors">厂商</TabsTrigger>
      </TabsList>
      <TabsContent value="models">
        <p className="text-sm text-muted-foreground">共 38 个型号，覆盖 11 家厂商。</p>
      </TabsContent>
      <TabsContent value="vendors">
        <p className="text-sm text-muted-foreground">共 11 家厂商。</p>
      </TabsContent>
    </Tabs>
  </div>
)

/**
 * `variant="line"` drops the pill ground entirely and marks the active tab
 * with a rule under it. Reach for it where a filled pill would be too loud --
 * a dialog's own sections, say.
 */
export const Line = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <Tabs defaultValue="stock" style={{ width: "100%" }}>
      <TabsList variant="line">
        <TabsTrigger value="stock">在库</TabsTrigger>
        <TabsTrigger value="out">已签出</TabsTrigger>
        <TabsTrigger value="repair">维修中</TabsTrigger>
      </TabsList>
      <TabsContent value="stock">
        <p className="text-sm text-muted-foreground">在库 62 台，其中 9 台待入网。</p>
      </TabsContent>
      <TabsContent value="out">
        <p className="text-sm text-muted-foreground">已签出 18 台。</p>
      </TabsContent>
      <TabsContent value="repair">
        <p className="text-sm text-muted-foreground">维修中 4 台。</p>
      </TabsContent>
    </Tabs>
  </div>
)
