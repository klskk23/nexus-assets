import { useForm } from "react-hook-form"
import { Button, Form, FormControl, FormField, FormItem, FormLabel, FormMessage, Input } from "nexus-assets-web"

/**
 * NOT this product's form idiom.
 *
 * `Form` is shadcn scaffolding over react-hook-form, and nothing in nexus-assets
 * imports it — every form here is built from `Field` / `FieldGroup` / `FieldSet`
 * with plain controlled state. It is published because the repo exports it, and
 * these cells show it working. When building a Nexus screen, reach for `Field`.
 */
function useDemoForm(defaults: Record<string, string> = { key: "mac", label: "基准 MAC" }) {
  return useForm({ defaultValues: defaults })
}

export const FieldEditor = () => {
  const form = useDemoForm()
  return (
    <Form {...form}>
      <form className="grid gap-4" style={{ maxWidth: "24rem" }}>
        <FormField
          control={form.control}
          name="key"
          render={({ field }) => (
            <FormItem>
              <FormLabel>键名</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="label"
          render={({ field }) => (
            <FormItem>
              <FormLabel>显示名称</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div><Button type="button">保存</Button></div>
      </form>
    </Form>
  )
}
