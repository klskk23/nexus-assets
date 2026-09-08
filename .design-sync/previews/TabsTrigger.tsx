import { Badge, Tabs, TabsContent, TabsList, TabsTrigger } from "nexus-assets-web"

/**
 * A trigger is a pill inside the list's pill. `value` is what ties it to its
 * `TabsContent`; the active one gets the lighter ground, the rest sit at 60%
 * foreground until hovered.
 */
export const Two = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <Tabs defaultValue="fields" style={{ width: "100%" }}>
      <TabsList>
        <TabsTrigger value="fields">字段</TabsTrigger>
        <TabsTrigger value="groups">字段组</TabsTrigger>
      </TabsList>
      <TabsContent value="fields">
        <p className="text-sm text-muted-foreground">共 24 个字段。</p>
      </TabsContent>
      <TabsContent value="groups">
        <p className="text-sm text-muted-foreground">共 5 个字段组。</p>
      </TabsContent>
    </Tabs>
  </div>
)

/**
 * Triggers stretch to share the list evenly (`flex-1`), so a count badge in
 * one does not shift the others. `disabled` dims a trigger and takes it out of
 * arrow-key navigation.
 */
export const Counted = () => (
  <div style={{ background: "var(--background)", padding: "1rem" }}>
    <Tabs defaultValue="stock" style={{ width: "100%" }}>
      <TabsList>
        <TabsTrigger value="stock">
          在库 <Badge variant="secondary">62</Badge>
        </TabsTrigger>
        <TabsTrigger value="out">
          已签出 <Badge variant="secondary">18</Badge>
        </TabsTrigger>
        <TabsTrigger value="retired" disabled>
          已报废
        </TabsTrigger>
      </TabsList>
      <TabsContent value="stock">
        <p className="text-sm text-muted-foreground">在库 62 台，其中 9 台待入网。</p>
      </TabsContent>
      <TabsContent value="out">
        <p className="text-sm text-muted-foreground">已签出 18 台。</p>
      </TabsContent>
    </Tabs>
  </div>
)
