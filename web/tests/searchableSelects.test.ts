import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

/**
 * A dropdown whose options can grow without bound has to be searchable.
 *
 * The judgement is 023's (decision 149) and it is not new here. What is new is
 * that a test enforces it, because 023 wrote the rule down and then missed the
 * actor filter on the page it was building **in the same round**. A rule in a
 * document does not survive the next person who does not read it, and the next
 * person is usually the one who wrote it.
 *
 * The whitelist is every remaining ordinary Select, each with the reason its
 * options are bounded. A new one has to be added here deliberately, which is
 * the moment to notice the list is a handful of statuses and not a growing set
 * of accounts.
 */
const BOUNDED: Record<string, string> = {
  "features/assets/NewAssetDialog.tsx": "状态：由状态页配置，五到十个",
  "features/categories/CategoryEditor.tsx": "编号字段：只有本类别的唯一字段，几个",
  "features/common/Pager.tsx": "每页条数：四档常量",
  "features/fields/FieldForm.tsx": "字段类型：八种，代码里写死",
  "features/print/PrintDialog.tsx": "标签预设：本类别勾选过的那几种",
  "features/settings/SettingsDialog.tsx": "语言：中文与英文，两种",
  "features/transfers/EditEvent.tsx": "目标类型：账号或实体，两种",
  "features/transfers/TransferForm.tsx": "目标类型两种、状态由状态页配置",
  "features/users/UserEditor.tsx": "角色：由角色页配置，几个",
  "routes/Assets.tsx": "状态筛选：由状态页配置，五到十个",
  "routes/Audit.tsx": "对象类型与动作：两组常量",
  "routes/Holders.tsx": "持有方类型三种、是否默认库存点两种",
  "routes/Import.tsx": "导入页是 demo，本轮不动（026 FR-026）",
  "routes/Overview.tsx": "每页条数：常量",
  "routes/Statuses.tsx": "颜色：八个色槽",
  "routes/TransferAudit.tsx": "动作类型：六种，代码里写死",
  "routes/Users.tsx": "角色：由角色页配置，一个组织通常几个",
}

const SRC = join(import.meta.dirname, "..", "src")

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith(".tsx")) out.push(p)
  }
  return out
}

describe("候选无界的下拉都可搜", () => {
  it("用普通 Select 的地方，都在白名单上且写明了为什么有界", () => {
    const users = walk(SRC)
      .filter((f) => !f.includes(join("components", "ui")))
      .filter((f) => readFileSync(f, "utf8").includes("<SelectTrigger"))
      .map((f) => f.slice(SRC.length + 1).split("\\").join("/"))
      .sort()

    expect(users).toEqual(Object.keys(BOUNDED).sort())
  })

  it("白名单每一条都说出了理由", () => {
    for (const [file, why] of Object.entries(BOUNDED)) {
      expect(why.length, `${file} 的理由太短，说不清为什么有界`).toBeGreaterThan(6)
    }
  })
})
