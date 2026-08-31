# Phase 1 Data Model: 中英双语与持有方生命周期

本文只描述**增量**。

---

## 1. 迁移 006

```sql
-- Up
ALTER TABLE holder_entities DROP COLUMN archived_at;
-- Down（有损）
ALTER TABLE holder_entities ADD COLUMN archived_at TEXT;
```

与 003 移除 `field_definitions.archived_at` 同一个动作、同一个理由：
一个没有任何代码能设置的列，只会让下一个读者先花时间确认停用已经没了。

**Down 有损**：谁曾被停用不可恢复。可接受 —— 停用机制在 Up 之后就不再产生这个信息。

**双语不需要迁移**。目录是代码，不是数据。状态标签、类别名、信息项显示名
是**管理员输入的数据**，不翻译 —— 这与 004 决策 57 的划分一致。

---

## 2. 服务端的消息模型

```go
type Message struct { Key string; Args []any }

func M(key string, args ...any) Message
func (m Message) Error() string             // 默认语言，供日志与测试
func (m Message) In(l Lang) string          // 渲染

func Wrap(sentinel error, key string, args ...any) error   // errors.Is 仍可用
func Text(err error, l Lang) string          // 沿 err 链找 Message
func HasText(err error) bool                 // 没有的就是内部故障
func Join(sepKey string, parts ...any) any   // 连接符本身也是文案
func Parse(acceptLanguage string) Lang
```

### 嵌套

`Message` 自身满足 `In(Lang) string`，`In` 在 `Sprintf` 之前先展开实现该接口的参数。
于是一条消息可以是另一条的参数：

```go
i18n.Wrap(ErrParentInvalid, i18n.KeyHolderParentKind,
    typeLabel(typ),               // Message：公司 / company
    labelList(allowed),           // joined：用翻译过的连接符
    parent.Name,                  // 数据，原样
    typeLabel(parent.Type))       // Message
```

### 渲染点

| 位置 | 何时渲染 | 为什么 |
|------|---------|--------|
| `FailErr` / `Fail*` | HTTP 边界 | 错误跨层往上传，到这里才知道读者是谁 |
| `FieldErrors.In(lang)` | HTTP 边界 | 同上；键不翻译，表单靠键定位输入框 |
| 导入预览 `collect` | 服务内，接收 `lang` | 报表为这一个请求构造，不向上传播 |
| CSV 表头 / 模板表头 | 服务内，接收 `lang` | 同上。**键名行不翻译** |

### `FieldErrors` 的形状变化

```diff
- type FieldErrors map[string]string
+ type FieldErrors map[string]i18n.Message
+ func (e FieldErrors) In(l i18n.Lang) map[string]string
```

键是字段 key，**不翻译** —— 动态表单靠它把消息挂到对应输入框上。

---

## 3. 前端的字典模型

```
src/i18n/
├── zh.ts        中文字典，同时是「字典的形状」（无 as const）
├── en.ts        英文字典，`typeof zh` 约束
├── index.ts     Lang、detectLang、locale、live binding、applyLang
└── useLanguage.tsx   Provider
```

导出的 9 个绑定是 `export let`：`t`、`tMeta`、`tTransfer`、`tConfig`、
`tImport`、`tAudit`、`tConfirm`、`tOverview`、`tStatuses`。
`applyLang` 重新赋值它们；`LanguageProvider` 用 `key={lang}` 重挂整棵树来传播
（research.md D4）。

**在模块加载时求值的常量必须改成函数** —— 它们不会被 typecheck 抓到。
本轮有两处：`AppShell` 的导航数组、`TransferDialog` 的 `transferActions`。

### 语言判定

```
localStorage["nexus.lang"]  →  navigator.language 以 en 开头  →  中文
```

`locale()` 另给日期与数字用：`en-GB` / `zh-CN`。与字典分开，
因为「怎么翻译」是手工的，「怎么排版数字」是平台的。

---

## 4. 持有方的删除判定

```text
Delete(id):
  1. is_default_stock        → 拒绝（ErrDefaultStockRequired）
  2. Usage.Assets > 0        → 拒绝（ErrReferenced），列出前 5 台与总数
  3. Usage.Children > 0      → 拒绝（ErrHasChildren），给出数量
  4. Usage.History           → 不参与拒绝，仅供确认框说明代价
  5. DELETE
```

`Usage` 三个数字一次算出：

```sql
-- Assets：持有 或 被引用字段指向（沿用 blockerPredicate）
-- Children：SELECT count(*) FROM holder_entities WHERE parent_id = ?
-- History：两端并集，避免同一实体内的换位被计两次
SELECT count(*) FROM (
  SELECT id FROM asset_transfers WHERE from_holder_type='entity' AND from_holder_id=?
  UNION
  SELECT id FROM asset_transfers WHERE to_holder_type='entity' AND to_holder_id=?
)
```

第 3 条是本轮新增的拒绝理由：静默把下级改挂到别处，等于替人改了组织架构。
