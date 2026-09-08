import { Button, PageHeader } from "nexus-assets-web"

/**
 * The top of every page: what this is, optionally why, and what can be done
 * with it. One component rather than a heading per page -- eleven of them had
 * drifted, some pushing the buttons over with ml-auto on the heading and some
 * on the first button, with the gap below it different on three pages.
 *
 * The title takes the display face; the explanation goes behind the question
 * mark rather than into a line of prose that pushes the table down the screen
 * on every single visit.
 */
export const WithActions = () => (
  <PageHeader title="资产">
    <Button variant="outline">导出 CSV</Button>
    <Button>录入设备</Button>
  </PageHeader>
)

export const WithHint = () => (
  <PageHeader title="类别" hint="类别决定一台设备有哪些字段。子类别继承父类别的绑定。">
    <Button>新建类别</Button>
  </PageHeader>
)

/** A page that is only read takes no actions at all. */
export const TitleOnly = () => <PageHeader title="审计日志" />
