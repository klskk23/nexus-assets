# Phase 0 研究：实现级决策

**Feature**: 002-identity-and-transfer | **Date**: 2026-08-28

Technical Context 中没有 NEEDS CLARIFICATION —— 技术选型全部沿用 001，本特性不引入任何
新依赖。本文解决的是设计决策之下、编码之上的一层：**已定决策落地时必须先想清楚、
否则会在实现中途卡住或被静默做错的地方。**

与 001 的 research.md 一样，每条决策标注是否需要用一条可执行的断言验证。
凭记忆写下的数据库行为不算数。

---

## D1. `assets.sn` 的删除方式

**Decision**: 表重建。建 `assets_new` → `INSERT ... SELECT` 搬数据 → `DROP TABLE assets`
→ `ALTER TABLE assets_new RENAME TO assets` → 重建三个索引。

**Rationale**: `sn` 声明为 `TEXT NOT NULL UNIQUE`，该 UNIQUE 生成了一个隐式索引。
SQLite 的 `ALTER TABLE ... DROP COLUMN` 明确拒绝删除被索引覆盖的列，会报
`error in table assets after drop column`。`categories.sn_template` 没有任何约束，
因此那一侧可以直接 `DROP COLUMN` + `ADD COLUMN`，不必陪着重建。

重建顺序上刻意采用「先建新表、最后才 RENAME」而不是「先把旧表 RENAME 走」：
SQLite 3.25 起 `ALTER TABLE ... RENAME` 会连带改写其他表里指向它的外键，
把旧表改名会让 `asset_transfers` 的外键指向 `assets_old`，而这正是要避免的。

**Alternatives considered**:
- 保留 `sn` 列但改为可空 —— 会留下一个没有任何代码写入、却仍出现在每次 `SELECT *` 里的列。
  这种「还在但没用」的列是下一个人最容易误用的东西。
- 清空整表再重建 —— 用户已同意丢弃存量编号，但没同意丢弃存量资产。迁移应当只丢它必须丢的。

**验证**: 已完成。`internal/store/migrate_test.go` 的 `TestMigrateUpAndDown` 断言迁移后
`asset_unique_values` 存在、`asset_sn_history` 消失、`categories` 有 `display_key` 无
`sn_template`；`TestUniqueValueIndexIgnoresArchived` 顺带断言重建后的 `assets`
仍然拒绝悬空外键 —— 这是外键图未被 RENAME 破坏的证据。

---

## D2. 迁移的事务模式

**Decision**: 该迁移使用 goose 的 `-- +goose NO TRANSACTION`，并在迁移体内自行
`PRAGMA foreign_keys = off` / `on`。

**Rationale**: SQLite 官方的表重建流程要求先关闭外键检查，否则 `DROP TABLE assets`
会被 `asset_transfers` 的引用挡住。而 `PRAGMA foreign_keys` 在事务内部是**空操作** ——
SQLite 会静默忽略它，不报任何错。goose 默认把每个迁移包进一个事务，两者相加的结果是
「写了但没生效」，随后 DROP 失败。

代价是这次迁移不是原子的：中途失败会留下半改的 schema。用一条完整的 Down 迁移把风险
限制住 —— Down 必须能把 001 的形态一字不差地还原回来，包括 `asset_sn_history`、
`ix_assets_mac` 与 `sn` 列本身。

**Alternatives considered**:
- `PRAGMA legacy_alter_table=ON` 保留旧的 RENAME 语义 —— 可以绕开外键改写问题，
  但那是一个「让新版数据库假装是旧版」的开关，比显式关闭外键更难看懂。
- 让应用启动时用 Go 代码做重建 —— 把 schema 变更移出迁移文件，迁移就不再是 schema 的
  全部真相。001 的 D4 已经排除过这条路。

**验证**: 已完成。`TestMigrateUpAndDown` 跑 up → down，逐项断言回到 001 的形态
（表的有无、列的有无各两项）。

---

## D3. 唯一值怎么索引

**Decision**: 新建派生表 `asset_unique_values(asset_id, field_key, value, archived_at, created_at)`，
配一个部分唯一索引 `ux_uv_live ON (field_key, value) WHERE archived_at IS NULL`，
外加 `ix_uv_value` 与 `ix_uv_asset`。写入管线在同一事务内维护它。

**Rationale**: 「所有标为唯一的字段都参与精确匹配」这个要求下，字段集合是运行时可配的，
而值存在 `attrs` 这个 JSON 列里。三条路可走，只有这一条能同时满足唯一性与检索：

- 一张表同时解决三件事：唯一性（部分唯一索引）、精确匹配（一次索引命中）、
  历史值（`archived_at` 非空的行）。
- 唯一性因此从「应用层 `SELECT` 后 `INSERT`，靠写入串行化才成立」升级为**数据库级约束**。
  这是本特性最值得记下的副作用：章程里「写连接池为 1」那条硬规则的**理由**不再成立
  （设置本身保留，见 plan.md 的边界登记）。
- 它顺带接管了 001 的 `asset_sn_history`。原来只有编号有历史别名，现在每个唯一字段都有 ——
  覆盖面反而比被它替换掉的那张表更宽。

**Alternatives considered**:
- 标记唯一时动态 `CREATE UNIQUE INDEX ... ON assets(json_extract(attrs,'$.mac'))` ——
  约束由 SQLite 保证，无需额外表。但 DDL 变成运行时行为，迁移文件不再是 schema 的全部真相；
  且已存在重复值时建索引会失败，那个失败发生在「勾选唯一」这个看起来无害的操作上。
- 维持现状，检索时全表扫 `json_each` —— demo 量级跑得动，但唯一性仍只能靠写入串行化，
  且 001 实测的「10k 资产列表 p95 27ms」是走索引的数字，全表扫是另一回事。

**验证**: 已完成。`internal/store/migrate_test.go` 的 `TestUniqueValueIndexIgnoresArchived`
用四条直接 INSERT 断言部分索引的行为：第二条在用值被拒、归档后同值可再插、
两条归档副本共存。

---

## D4. 归档值的唯一性语义

**Decision**: 归档行（`archived_at IS NOT NULL`）**退出**唯一性约束。
一个被替换掉的值可以被另一台设备重新占用。精确匹配命中多台时不做唯一跳转，退化为列表。

**Rationale**: 001 的决策 12 规定「编号不可重用」，理由是防止贴着旧标签的设备被误认。
那条规则在「唯一值只有编号一种」时是对的，推广到全部唯一字段后会误伤真实场景：
换主板之后，旧 MAC 出现在另一台设备上是完全正常的，禁止它等于禁止记录事实。

部分唯一索引的 `WHERE archived_at IS NULL` 正好表达这个语义，不需要额外代码。

代价是精确匹配可能命中多条。处理方式是**停止跳转而不是挑一个** —— 静默打开其中一台
比不跳转更糟：使用者不会知道自己看的可能是另一台。

**Alternatives considered**:
- 归档值也占用唯一性 —— 保持 001 的语义，但如上所述会拒绝合法操作。
- 命中多条时按时间取最新 —— 猜。猜错的时候没有任何迹象提示使用者。

**验证**: 已完成。`internal/asset/query.go` 的 `exactMatch` 在任一探测阶段命中 2 条即返回
「未直达」；`TestRecomputeAppliesAndArchivesOldNumbers` 断言归档值仍能精确命中原设备。

---

## D5. 显示编号不沿祖先链继承

**Decision**: `categories.display_key` 只对本类别生效，不向下继承。子类别未设置即回退到
UUID 短码。

**Rationale**: 这与 001 的 `sn_template` 相反（那个是「未设则沿父链向上取第一个非空值」），
所以必须写清楚为什么反过来。

绑定的字段继承是自然的：父类别说「这类设备都要记 MAC」，子类别理应也记。
但「用哪个字段当编号」是一个**展示层的选择**，不是一项能力。子类别通常正是需要不同编号
规则的地方 —— 交换机和路由器都在「网络设备」下，两者的编号规则大概率不同。
静默继承父类别的选择，会让子类别显示出一个没人为它选过的编号。

回退到 UUID 短码是有意为之的「显眼的未配置状态」：它一眼就能看出没配，
而继承来的编号看上去像是配过的。

**Alternatives considered**:
- 跟 `sn_template` 一样继承 —— 一致性上更整齐，但把一个展示选择当成了能力继承。
- 强制每个类别都必须设置 —— 就是本特性要消灭的那种强制。

**验证**: 已完成。`internal/schema/store_test.go` 的 `TestDisplayKeyIsNotInherited`
断言子类别拿到空值，同时断言父类别绑定的字段**仍然可被子类别选用** ——
不继承指的是选择不继承，不是候选范围变窄。

---

## D6. 依赖门禁的判定对象与三个方向

**Decision**: 判定对象是**递归依赖闭包**（`schema.DependencyClosure`）。三个方向都要堵：

| 方向 | 触发点 | 判定 |
|------|--------|------|
| 绑定 | `Bind` 一个表达式键 | 闭包内每一项都必须已绑定；其中的静态键必须已必填 |
| 解绑 | `Unbind` 任一字段 | 该类别链与子树上，不得有表达式键的闭包含它；也不得被选作显示编号 |
| 改模板 | `UpdateField` 改写 `template` | 对它已绑定的每个类别重跑绑定门禁 |

**Rationale**: 三个方向是同一个失败的三条路径 —— 让一个类别进入「绑着一个求不出值的字段」
的状态，此后该类别下所有资产都存不进去，而错误指向表达式键而非真正缺值的字段。

**闭包而非一层**：表达式键可以读表达式键。只查一层的话，绑定 `label`（读 `sn`）时会以为
只要 `sn` 在就行，而 `sn` 读的 `mac` 可能根本没绑。

**必填强制是本特性最容易被忽略的一条**：求值失败会回滚整次保存（001 的 FR-029），
而依赖为空必然求值失败 —— 所以任何被表达式键读取的静态键，事实上已经是必填的。
这个联系在配置页上完全看不出来，只会以「为什么这台存不进去」的形式反复出现。
门禁把隐形约束变成显式约束，代价是绑定时多一道拒绝。

**改模板这个方向最容易漏**：门禁只在绑定那一刻跑过，事后把模板改成读一个选填字段
就绕过去了。实现时这一处曾写错顺序 —— 检查跑在 `UPDATE` 之前，读到的是旧模板，
门禁形同虚设。必须在写入之后跑，靠事务回滚。

**Alternatives considered**:
- 只堵绑定方向 —— 用户最初提的就是这一条。但解绑是它的镜像，改模板是它的后门；
  只堵一个方向的门禁只在第一天有效。
- 绑定时只告警不拦截 —— 告警会被忽略，问题仍然会在录入时爆发，只是多了一次「我提醒过你」。
- 不强制必填，改为求值失败时存空值 —— 需要改动 001 的 FR-029，影响面比这条门禁大得多，
  且会让显示编号可能为空。

**验证**: 已完成。`internal/schema/deps_test.go` 覆盖闭包的传递性与环检测、
三个方向各自的拒绝与放行、以及「被拒绝的模板改写没有被写入」。

---

## D7. 流转入口的形态

**Decision**: 做一个共享的 `TransferDialog`。详情页放一个「流转」按钮打开它（不预选动作）；
列表页的动作条按钮改为「打开同一个弹层并预选该动作」。

**Rationale**: 用户要的是「详情页加按钮」。直接的做法是把列表页动作条的表单复制一份到
详情页 —— 那会立刻违反章程原则 III：同一个操作有了两套交互与两套校验，
两边会随时间分叉，而分叉的方式通常是某一边少了一个字段。

选共享弹层而不是共享内联表单，是因为详情页没有多选上下文，一个常驻的表单区块没有意义。
列表页保留自己的动作条（它承载选中计数与清空选择），但按钮不再自己渲染表单。

单台流转不生成 `batch_id`，与 001 的决策一致 —— 一台不是一个批次。

**Alternatives considered**:
- 详情页做一个内联表单 —— 两套交互，如上。
- 详情页放五个按钮直接触发（无表单）—— 签出与转移必须选目标，无处可选。
- 按当前状态只显示合法动作 —— 状态机要在前后端各维护一份，且按钮会出现和消失。
  改为在提交时由服务端拒绝并说明，前端不复制状态机。

**验证**: 已完成。`web/tests/assetDetail.test.tsx` 新增两条 DOM 用例（签出、改状态），
断言请求体与列表页那条既有用例完全一致；`web/tests/actionBar.test.tsx` 的既有用例
在改造后原样通过 —— 它们本来就是走完整表单的，共享之后仍然走同一条路径。

---

## D8. 唯一性冲突报在哪个字段上

**Decision**: 冲突探测按「静态键优先、表达式键其次」的顺序遍历，先命中的那个进错误信息。

**Rationale**: 一个重复的 MAC 会同时让 `mac` 和由它推导出的 `sn` 两个唯一字段冲突。
按字段名排序遍历的话，`asset_tag` 或 `sn` 可能排在 `mac` 前面，于是用户看到的是
「推导编号已被占用」—— 而推导编号不是他能编辑的东西，他会去找一个找不到的输入框。

真正可操作的字段是 `mac`。顺序不是美观问题，是「这条错误能不能被执行」的问题。

数据库的部分唯一索引仍然是最终保证；这一遍探测存在的唯一理由，就是把约束违反
翻译成一句能被执行的话。

**Alternatives considered**:
- 按字段 `sort` 排序 —— 那是展示顺序，和「哪个可编辑」无关。
- 一次报出全部冲突字段 —— 信息更全，但把「先改哪个」的判断又推回给用户；
  且改掉 `mac` 之后 `sn` 的冲突自动消失，一起报出来反而误导。

**验证**: 已完成。`internal/importer/importer_test.go` 的
`TestDuplicateMACWithinTheFileIsCaught` 断言错误落在 `mac` 上 ——
该用例在实现过程中曾因遍历顺序错误而失败，是这条决策的来源。
