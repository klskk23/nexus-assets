# Phase 1 Data Model: 资产归属与表格规范

本文只描述**增量**。

---

## 1. 迁移 008

```sql
ALTER TABLE assets ADD COLUMN home_holder_type TEXT;
ALTER TABLE assets ADD COLUMN home_holder_id   TEXT;
ALTER TABLE assets ADD COLUMN home_owner_id    TEXT REFERENCES users(id);
```

三列全部可空。**空不是缺值** —— 它的意思是「没有意见，用全局默认」，
而这正是升级前每一行的真实含义，所以迁移不需要回填。

无表重建，Down 是三条 `DROP COLUMN`。

### 归属的读取

`home_holder_type` 与 `home_holder_id` **要么都有、要么都没有**：
一个有类型没 id 的持有方是一种形状，会让后面每一处都要判一次。
扫描时只在两者都存在时才构造 `HomeHolder`。

---

## 2. 归还的解析顺序

```text
applyOne(asset):
  1. 请求里给了 to_holder      → 用它（整批同一个目标）
  2. 该资产的 home_holder      → 用它
  3. 全局默认库存点（事务外读） → 用它
  4. 都没有                    → ErrNoDefaultStock，提示选位置

负责人：
  1. 请求里给了 to_owner_id    → 用它
  2. 该资产的 home_owner_id    → 用它
  3. 不变
```

解析**在 `applyOne` 里**，不在 `Apply` 里。这是这个功能能不能成立的分界：
留在批次层面的话，一批二十台来自四个仓库的设备仍然只会去一个地方，
而那正是要解决的问题。

只有第 3 步的全局默认是事务外读一次的 —— 它是全局的，与资产无关。

---

## 3. 保存时的三态

| 请求 | 含义 | 创建 | 更新 |
|------|------|------|------|
| 字段缺席 | 不动 | 归属 = 录入时的持有方与负责人 | 保持原值 |
| 显式 `null` | 清空 | （同缺席） | 归属清空，回退到全局默认 |
| 有值 | 设置 | 用它 | 用它 |

在 HTTP 层用 `json.RawMessage` 区分「缺席」与「null」，
与类别、持有方的 `parent_id` 是同一套处理 —— 不区分的话，
一次改备注会顺手把归属清掉。

`ClearHome` 是 `SaveInput` 上的独立布尔，因为 `HomeHolder == nil`
已经被「不动」占用了。

---

## 4. 型号的生命周期

```go
type UpdateModelInput struct {
    Name, Vendor, ImageURL *string
    CategoryIDs            *[]string
    AttrDefaults           *map[string]any
}
```

全指针：只提交了改动的表单不能把其余字段清空。`CategoryIDs` 尤其需要指针 ——
空切片是有意义的值（一个不关联任何类别的型号是合法状态）。

**类别关联整体替换**而不是求差：连接表除了这一对什么都不存，没有差分能保留的状态。

```text
DeleteModel(id):
  1. count(assets WHERE model_id = id) > 0 → 拒绝，给出台数
  2. 删除 product_model_categories 的关联
  3. 删除 product_models
```

第 1 步不清空 `model_id` 而是拒绝：静默清空会丢掉「这台是哪款产品」。
第 2 步是同意的级联，与 v3 决策 47 方向相反、性质相同。

---

## 5. 表格约定

`CrudPage` 新增两个可选属性：

```ts
onRowClick?: (row: T) => void
rowActions?: RowAction<T>[]

interface RowAction<T> {
  label: string
  onSelect: (row: T) => void
  destructive?: boolean                    // 红色，且置于分隔线之下
  disabled?: (row: T) => boolean           // 禁用，不是隐藏
  confirm?: (row: T) => { title, description, phrase }
}
```

**确认框渲染在表格之外**。右键菜单在触发的同时关闭，挂在菜单项上的对话框会跟着消失；
待确认的动作暂存在 `CrudPage` 的 state 里。这也是 `ConfirmDialog`
新增受控模式（`open` / `onOpenChange`，`trigger` 变可选）的原因。

各页的菜单：

| 页面 | 菜单项 |
|------|--------|
| 信息项 | 编辑、删除 |
| 型号 | 编辑、删除 |
| 持有方 | 编辑、设为默认库存点（仅位置且非当前）、删除 |
| 状态 | 编辑、删除（内置禁用） |
| 账号 | 停用（已停用的禁用）—— 没有删除，`actor_id` 永远指向它 |
| 类别 | **不适用**，它是树不是列表 |
