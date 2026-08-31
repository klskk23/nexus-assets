# Phase 1 Data Model: 可配置的状态

本文只描述**增量**。完整模型见 001 的 `data-model.md`，标识改动见 002，
信息项与型号改动见 003。

---

## 1. 新表 `statuses`

```sql
CREATE TABLE statuses (
  key                 TEXT PRIMARY KEY,
  label               TEXT NOT NULL,
  color               TEXT NOT NULL DEFAULT 'slate',
  sort                INTEGER NOT NULL DEFAULT 0,
  builtin             INTEGER NOT NULL DEFAULT 0,
  requires_location   INTEGER NOT NULL DEFAULT 0,
  counts_as_available INTEGER NOT NULL DEFAULT 1,
  terminal            INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX ix_statuses_sort ON statuses(sort, key);
```

`key` 直接做主键：它是人写的、稳定的、要出现在 URL 与 CSV 里的标识，
再给一个 UUID 只会多一层间接。校验规则 `^[a-z][a-z0-9_]{0,31}$`。

**种子数据**（迁移写入，`builtin = 1`）：

| key | label | color | sort | requires_location | counts_as_available | terminal |
|-----|-------|-------|------|-------------------|---------------------|----------|
| `in_stock` | 在库 | green | 10 | ✓ | ✓ | |
| `in_use` | 已签出 | blue | 20 | | ✓ | |
| `in_repair` | 维修中 | amber | 30 | | ✓ | |
| `lost` | 丢失 | red | 40 | | ✓ | |
| `retired` | 已报废 | slate | 50 | | | ✓ |

时间戳用 `strftime('%Y-%m-%dT%H:%M:%SZ', 'now')` 而不是 `datetime('now')`：
后者产出 `2026-08-31 05:21:55`，`store.ParseTime` 只认 RFC3339。
这一处在实现时先写错过一次，表现是整个仓库的时间解析用例连锁失败。

**无表重建**，因而迁移不需要 `-- +goose NO TRANSACTION`，Down 就是两条 DROP。

---

## 2. 行为落点：从常量到列

| 行为 | 001–003 的实现 | 本轮的实现 |
|------|----------------|-----------|
| 合法转换 | `legalTransitions` 5×5 | `StatusSet.CanTransition`，内置对内置仍查该矩阵 |
| 在库必须放位置 | `RequiresLocationHolder` 硬编码 `in_stock` | `requires_location` 列 |
| 报废不计入分布 | `overview.go` 硬编码 `retired` | `counts_as_available` 列 |
| 报废是终态 | 矩阵里 retired 行全 false | `terminal` 列 |
| 签出／归还推导 | `DeriveTransferKind` 硬编码 `in_stock ↔ in_use` | **不变**（FR-007） |
| 中文标签 | `zh.status` + `export.go` 各一份 | `label` 列，两份副本删除 |

### `StatusSet.CanTransition` 的三条分支

```text
from == to                      → 允许（属性编辑不移动状态，无需校验）
statuses[from].terminal         → 拒绝
from.Builtin() && to.Builtin()  → 查 legalTransitions
其余（任一方自定义）             → 允许
```

第二条放在第三条之前，是为了让**自定义的终态**也真的是终态；
把它放在矩阵之后会让 `written_off → in_stock` 漏过去。

---

## 3. 删除判定

```text
DeleteStatus(key):
  1. builtin           → 拒绝（ErrStatusBuiltin），消息里带标签
  2. count(assets)     → > 0 拒绝（ErrStatusInUse），返回台数
  3. 历史出现次数       → 不参与拒绝，仅由 GET /status-usage 供确认框说明
  4. DELETE
```

第 2 步与 003 的信息项删除是同一条规则：**被引用则拒绝，并说清是谁挡着**。
第 3 步的不对称理由见 research.md D5。

### 占用统计

```sql
-- 当前占用
SELECT status, count(*) FROM assets GROUP BY status;

-- 历史提及（两端并集，避免同状态内的持有方变更被计两次）
SELECT st, count(*) FROM (
  SELECT id, from_status AS st FROM asset_transfers WHERE from_status IS NOT NULL
  UNION
  SELECT id, to_status   AS st FROM asset_transfers
) GROUP BY st;
```

`UNION` 而不是 `UNION ALL`：一次「在库 → 在库」的换位事件只该算一次。

---

## 4. 状态集的读取路径

`internal/store/statuses.go` 提供：

```go
type Queryer interface { QueryContext(...) (*sql.Rows, error) }  // *sql.DB 与 *sql.Tx 都满足
func LoadStatuses(ctx, q Queryer) ([]model.Status, error)
func LoadStatusSet(ctx, q Queryer) (model.StatusSet, error)
```

| 调用方 | 从哪读 | 为什么 |
|--------|--------|--------|
| `transfer.Apply` / `transfer.Edit` | `tx` | 校验与写入必须看到同一份状态 |
| `asset.Persist` | `tx` | 同上 |
| `asset.Overview` | 连接池 | 只读统计，无写入窗口 |
| `httpapi` 的前置校验 | 连接池 | 只为把错误定位到具体字段；真正的判定仍在事务里 |

---

## 5. 前端的数据形状

```ts
type AssetStatus = string          // 不再是五个字面量的联合
interface Status { key, label, color, sort, builtin,
                   requires_location, counts_as_available, terminal }
const PALETTE = ["slate","green","blue","amber","red","violet","teal","rose"]
```

`GET /statuses` 返回**裸数组**，`GET /status-usage` 返回 `key -> {assets, history}`。
两者分开的理由见 research.md D6 —— 合成一个信封会让状态管理页的表格
与全局的 `useStatuses` 争夺同一个 react-query 缓存键。

### 色板

`index.css` 中每个槽位定义三个变量（`--status-bg` / `--status-fg` / `--status-line`），
浅色一份、`.dark` 一份。`.status-chip` 消费这三个变量，写在所有 `@layer` 之外
（research.md D4）。新增一个槽位 = 一个 CSS 块 + `PaletteColors` 一行 + `PALETTE` 一行。
