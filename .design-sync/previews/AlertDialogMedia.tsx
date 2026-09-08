import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "nexus-assets-web"

/**
 * `AlertDialogMedia` is the icon slot, and it goes *inside* the header --
 * placed anywhere else it loses the layout the header gives it. At
 * `size="default"` it takes a column of its own and the title and description
 * stack beside it. Tint it with the destructive token when the act destroys
 * something; the neutral default ground is for everything else.
 */
export const Warning = () => (
  <AlertDialog defaultOpen>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogMedia
          style={{ backgroundColor: "color-mix(in oklab, var(--destructive) 12%, transparent)", color: "var(--destructive)" }}
        >
          <span className="text-3xl leading-none">⚠</span>
        </AlertDialogMedia>
        <AlertDialogTitle>删除资产</AlertDialogTitle>
        <AlertDialogDescription>
          此操作不可撤销，将删除选中的 12 台设备及其全部流转历史。
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>取消</AlertDialogCancel>
        <AlertDialogAction variant="destructive">删除</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)

/**
 * In a `size="sm"` content the same media centres itself above the title --
 * the compact confirm this product uses when the question is one line long.
 */
export const Centred = () => (
  <AlertDialog defaultOpen>
    <AlertDialogContent size="sm">
      <AlertDialogHeader>
        <AlertDialogMedia
          style={{ backgroundColor: "color-mix(in oklab, var(--destructive) 12%, transparent)", color: "var(--destructive)" }}
        >
          <span className="text-3xl leading-none">⚠</span>
        </AlertDialogMedia>
        <AlertDialogTitle>删除字段组</AlertDialogTitle>
        <AlertDialogDescription>
          「保修信息」将被删除，组内字段本身保留。
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>取消</AlertDialogCancel>
        <AlertDialogAction variant="destructive">删除</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)

/** Not every media slot is a warning. A confirm that only interrupts -- here a
 *  rule change that has to be re-applied to devices already numbered under the
 *  old one -- keeps the neutral ground and an informational glyph. */
export const Neutral = () => (
  <AlertDialog defaultOpen>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogMedia>
          <span className="text-3xl leading-none">ⓘ</span>
        </AlertDialogMedia>
        <AlertDialogTitle>保存并重算编号</AlertDialogTitle>
        <AlertDialogDescription>
          表达式改了，已有设备的编号仍是按旧表达式算出来的。保存的同时重算它们，编号才会一致。
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>取消</AlertDialogCancel>
        <AlertDialogAction>保存并重算</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)
