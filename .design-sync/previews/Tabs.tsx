import { Tabs, TabsContent, TabsList, TabsTrigger } from "nexus-assets-web"

/**
 * The two metadata pairs -- 字段/字段组 and 型号/厂商 -- are the real use: two
 * lists that describe one thing between them, under one navigation entry.
 * Since 017 the list is a pill and each trigger a pill inside it.
 */
export const Metadata = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <Tabs defaultValue="fields" style={{ width: "100%" }}>
      <TabsList>
        <TabsTrigger value="fields">字段</TabsTrigger>
        <TabsTrigger value="groups">字段组</TabsTrigger>
      </TabsList>
      <TabsContent value="fields">
        <p className="text-sm text-muted-foreground">共 24 个字段，其中 6 个为必填。</p>
      </TabsContent>
      <TabsContent value="groups">
        <p className="text-sm text-muted-foreground">共 5 个字段组。</p>
      </TabsContent>
    </Tabs>
  </div>
)

/**
 * `orientation="vertical"` turns the root into a row: the list becomes a rail
 * down the side with left-aligned, full-width triggers, and the panel sits
 * beside it. Give the rail a width (`w-36` here) -- left to `w-fit` it shrinks
 * to the longest label and reads as a blob rather than a rail.
 */
export const Vertical = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <Tabs defaultValue="models" orientation="vertical" style={{ width: "100%" }}>
      <TabsList className="w-36">
        <TabsTrigger value="models">型号</TabsTrigger>
        <TabsTrigger value="vendors">厂商</TabsTrigger>
        <TabsTrigger value="categories">类别</TabsTrigger>
      </TabsList>
      <TabsContent value="models">
        <p className="text-sm text-muted-foreground">共 38 个型号，覆盖 11 家厂商。</p>
      </TabsContent>
      <TabsContent value="vendors">
        <p className="text-sm text-muted-foreground">共 11 家厂商。</p>
      </TabsContent>
      <TabsContent value="categories">
        <p className="text-sm text-muted-foreground">共 7 个类别。</p>
      </TabsContent>
    </Tabs>
  </div>
)
