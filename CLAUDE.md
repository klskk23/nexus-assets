<!-- SPECKIT START -->
当前计划：`specs/028-master-detail-holders/plan.md`
<!-- SPECKIT END -->

必读：`.specify/memory/constitution.md`（五项原则、七条合并门禁）与当前 spec。
历史决策（1–199）在 `specs/001-*` ~ `specs/026-*` 与 `docs/archive/design-baseline*.md`，
**冲突时以最新一版为准**。**027 那一轮（决策 196–199）没有 spec 目录**，
它的决定只写在 `docs/rules/` 里 —— 找不到 `specs/027-*` 不是漏了。
001 的 `contracts/openapi.yaml` 仍是全量端点清单。

**详细规则按目录分开放，不在这里。** 动某个包之前读对应的那一份：

| | |
|---|---|
| `docs/rules/schema.md` | 字段绑定、厂商继承、字段组、唯一性、必填、`EffectiveFields` |
| `docs/rules/domain.md` | 资产内建字段、状态、持有方、归还、导入导出 |
| `docs/rules/auth.md` | 域名白名单、OIDC、会话、API 密钥 |
| `docs/rules/expr.md` | 表达式引擎与 AST 护栏 |
| `docs/rules/web-tables.md` | 表格页、列表两种形状、页面骨架 |
| `docs/rules/web-forms.md` | 表单、提示文案标准、`cn`、lazy chunk、**Organic 视觉（浅色唯一、药丸、焦点环、自托管字体）** |
| `docs/rules/printing.md` | 打印服务对接 |
| `docs/guides/` | zenith-printer 对接指南、表达式引擎调研 |

各包下有 `CLAUDE.md` 薄指针，动那个目录时会提醒你读哪一份。
**新规则默认写进 `docs/rules/`。** 要写进本文件得先过一道门：
「没有任何目录指针会提醒到它」—— 过不了就不进，否则这份文件会重新涨回四百行。

部署见 `README.md` 与 `deploy/`：`scratch` 上的静态二进制（前端 embed 在内）。
**改了端点就要改 `deploy/smoke.sh` 与合约**；容器健康检查是 `nexus healthcheck`
子命令 —— 镜像里没有 shell 也没有 curl。

**推送与发布要等确认。** 提交可以自己做，`git push`、打 tag、触发发布流水线**不要自作主张** ——
先说清这一批改了什么、验证到什么程度，等开发者说推再推。发出去的 tag 与镜像收不回来。
`.env` 里有 JWT 签名密钥与初始管理员口令，**永远不进仓库**。

---

以下每条都满足同一个条件：**没有任何目录指针会在你违反它的那一刻提醒你。**

- **权限是十八个全局开关，一个账号绑一个角色**（013 决策 77–85）。开关只回答
  「能不能」，**不回答「对哪些设备」** —— 系统里没有任何一条查询按调用者收窄。
  **读默认全开放**，只有 `GET /audit` 要权限。
  **管理员是 `roles.is_admin` 这个标记，不是十八个勾** —— 含义是「全部，包括以后新增的」。
  **加新开关要动六个地方**（023 数过）：`internal/authz/permissions.go` 的常量与 `All`、
  `internal/httpapi/permissions.go` 的名称表、**`internal/i18n/keys.go` 与 `catalog.go`**、
  `web/src/features/auth/usePermissions.ts` 的 `PERMISSIONS`、两份前端 i18n 的 `perm.names`。
  **其中五处漏了会响**（编译错误，或 `TestCatalogsCoverTheSameKeys`）；
  **只有 `PERMISSIONS` 那处是静默的** —— 漏了它，界面会以为谁都没有这个权限，
  没有任何编译错误、没有任何测试会报。
  **前端只负责禁用**，把关的永远是路由上的 `need(...)`。其余细节见 `docs/rules/auth.md`。
- **组件必须来自 shadcn/ui。** 不存在时必须先与开发者确认才能自定义，**不接受事后补批**。
  **下拉一律用 `Select`，不写原生 `<select>`**；表单布局用 `Field`/`FieldGroup`/`FieldSet`，
  不用 `div + Label`；提示用 `Alert`、空状态用 `Empty`、加载用 `Skeleton`/`Spinner`。
  `Select` 是 Radix 组件不是原生控件，测试要用 `src/test/choose.ts` 的助手而非
  `user.selectOptions`；`SelectItem` 不接受空字符串值，「未选/全部」走 `lib/select.ts` 的哨兵。
- **前端测试必须含 DOM 测试**（Vitest + React Testing Library，断言 `getByRole` 与
  `userEvent`）。只测纯函数或只做快照比对不算数。触及 UI 的 PR 必须新增或更新 DOM 测试。
  **跑全量加 `--maxWorkers=4`。** vitest 默认吃满所有核，360 个测试在这台机器上会把
  负载打到 80，worker 互相饿死后**集体 45 秒超时** —— 看起来像十几个测试同时坏了，
  实际一行代码都没错。降并发后 360 全过。
- **文档中文、代码英文；用户可见文案走目录，且必须两种语言都有。**
  前端 `web/src/i18n/{zh,en}.ts`（`en.ts` 由 `typeof zh` 约束，漏一条是编译错误），
  服务端 `internal/i18n/catalog.go`（漏一条由 `TestCatalogsCoverTheSameKeys` 抓）。
  **领域层不自己拼文案** —— 返回 `i18n.M(key, args...)` 或 `i18n.Wrap(sentinel, key, ...)`，
  由 HTTP 边界按 `Accept-Language` 渲染一次。两种语言的**参数个数与顺序必须一致**。
  标识符、日志、`error.code`、`error.fields` 的**键**、CSV 模板的键名行**都不翻译**。
- **前端字典是模块级 live binding（`export let t`）。** 在模块**加载时**求值的东西
  会冻结在首次加载的语言里，而 typecheck 看不见。导航数组、`transferActions`、
  `MetadataTabs` 的页签都已改成函数；下次再写 `const x = [{ label: t.… }]` 之前先想一遍。
- **SQLite 写事务一律 `BEGIN IMMEDIATE`，写连接池为 1。** 唯一性现在由
  `asset_unique_values` 上的部分唯一索引保证（v2 决策 32），所以这条不再是正确性前提，
  但保持不变 —— 放宽没有收益。
- **面向用户的错误一律走 `userText(c, err)`，不要用 `err.Error()`。**
  后者取的是默认语言，英文请求会收到中文。006 在七处漏过这一点，011 补齐。
- **术语：「字段」。** 009 起统一叫「字段」；001–008 的规格与设计基线里写的是
  **「信息项」，指同一样东西** —— 读历史文档时按此对应，不要以为是两个概念。
  代码里一直是 `field`，没有改过。
