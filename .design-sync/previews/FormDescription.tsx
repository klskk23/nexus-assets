import { useForm } from "react-hook-form"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, Input } from "nexus-assets-web"

/**
 * 一直可见的说明。本产品的标准是：有输入框的提示进 placeholder，这里留给必须一直看得见的三类。
 *
 * NOT this product's form idiom: nothing in nexus-assets imports `Form` — every
 * form here is `Field` / `FieldGroup` / `FieldSet` with plain controlled state.
 * Published because the repo exports it; reach for `Field` when building a
 * Nexus screen.
 */
export const Valid = () => {
  const form = useForm({ defaultValues: { key: "mac" } })
  return (
    <Form {...form}>
      <form style={{ maxWidth: "24rem" }}>
        <FormField
          control={form.control}
          name="key"
          render={({ field }) => (
            <FormItem>
              <FormLabel>键名</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormDescription>建好之后不能再改：存量的值就记在这个键下。</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  )
}

export const Refused = () => {
  const form = useForm({ defaultValues: { key: "MAC 地址" } })
  form.setError("key", { message: "键名只能包含小写字母、数字与下划线。" })
  return (
    <Form {...form}>
      <form style={{ maxWidth: "24rem" }}>
        <FormField
          control={form.control}
          name="key"
          render={({ field }) => (
            <FormItem>
              <FormLabel>键名</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormDescription>建好之后不能再改：存量的值就记在这个键下。</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  )
}
