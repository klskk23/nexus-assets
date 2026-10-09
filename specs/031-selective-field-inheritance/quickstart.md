# 验收指南：类别字段可选继承

本指南描述实现完成后的验证步骤，不代表已经运行或通过。验证只能使用临时数据库或开发者授权的测试库，不能直接在生产库演练撤回与迁移。

## 1. 升级与备份

### 临时库可重复演练

在仓库根目录顺序执行以下命令，不并行启动测试；均由 `t.TempDir()` 建库并自动清理，不读取 `.env`、真实库或应用配置。

```sh
GOMAXPROCS=2 go test -p 1 ./internal/store \
  -run '^TestSelectiveInheritanceWALBackupUpgradeAndRestore$' -count=1 -v
GOMAXPROCS=2 go test -p 1 ./internal/store \
  -run '^TestSelectiveInheritanceMigration' -count=1 -v
GOMAXPROCS=2 go test -p 1 ./internal/schema \
  -run '^TestMigrationSelectionPreservesLegacyFieldsWithoutFutureInheritance$' -count=1
GOMAXPROCS=2 go test -p 1 ./internal/store ./internal/schema -count=1
```

第一条命令运行真实恢复演练，不是只检查 SQL 文本：

1. 使用嵌入迁移和 `goose.UpToContext(..., 23)` 建立 `working.db`；夹具含根、子、孙、显示编号、唯一字段、原始属性、搜索/唯一索引和创建事件。
2. 临时写连接执行 `PRAGMA wal_autocheckpoint = 0`，先 `PRAGMA wal_checkpoint(TRUNCATE)`，再事务提交旧数据。验证 WAL 文件非空、只读 `immutable=1` 主文件视图尚无该资产，证明待备份的已提交数据确实仍在 WAL 中。`immutable` 连接仅用于证明差异，**不是备份源**。
3. 对仍打开的正常 SQLite 连接执行 `VACUUM INTO ?`，目标为同一临时目录的新路径 `before-023.db`。逐表比较所有行及 schema，检查 goose 版本为 23、`PRAGMA integrity_check` 为 `ok`、`PRAGMA foreign_key_check` 无行；包含 goose 元数据和自增序号，不以文件字节相同为标准。
4. 原工作副本升级至 024，确认子、孙的两个选择已回填；模拟升级后新增资产及索引/事件，再以 `VACUUM INTO ?` 生成独立的 `preserved-024.db`，逐表核对新增写入已保全。
5. 调用 `MigrateDown` 必须返回 `migration 024 down is unsafe`；确认版本仍为 24，全部业务表、迁移记录和 schema 均未改变。不要人为清空选择或 suppression 来绕过拒绝。
6. 从 `before-023.db` 正常 SQLite 连接再次执行 `VACUUM INTO ?`，恢复到新路径 `restored-023.db`，不覆盖任何现有库。检查版本为 23，逐表/schema 与升级前完全一致，两项完整性检查通过；恢复副本只有原资产，024 工作副本与保全副本仍各有两台资产。这明确展示恢复旧备份**不包含升级后写入**。

第二条命令补充核对迁移矩阵，而不是重复备份演练：

- `TestSelectiveInheritanceMigrationBackfillsLegacyEffectiveFields`：真实 023 三级多分支的严格祖先选择回填，根不生成选择。
- `TestSelectiveInheritanceMigrationWithoutAncestorFields`：无字段根、三级无字段树、无字段父类下子类仅有自身直接绑定，均不生成虚假的继承选择，类别、字段定义及直接绑定逐行不变。空树的升级与安全 Down 由全包中的 `TestMigrateUpAndDown` 覆盖。
- `TestSelectiveInheritanceMigrationRollsBackOnVersionWriteFailure`：在最终 goose 版本写入处注入故障；先验证表、反向索引、suppression 列及两条回填选择均已出现，再拒绝版本写入。失败后全表/schema 与 023 完全相等；移除故障后重试成功，旧绑定、资产属性、编号配置、搜索索引及事件逐行不变。
- `TestSelectiveInheritanceMigrationPreservesArchivedUniqueHistory`：一条现行和两条已归档唯一记录的全部六个旧列（含 scope 与归档时间）不变，每行 `search_suppressed=0`。这是存储保留证明，**不代表已实测普通搜索或唯一精确匹配行为**，后者由消费者集成测试验收。
- `TestSelectiveInheritanceMigrationDownRejectsSuppressedHistoryWithoutSelections`：没有任何继承选择、仅存在抑制的历史唯一记录时，也必须拒绝 Down，版本及全表/schema 不变；与备份演练中的「有选择」拒绝分支互补。

schema 命令另在真实 023 结构中建立根、子、孙及兄弟夹具，使用旧解析器实际捕获迁移前结果并与固定预期交叉检查；升级至 024 后逐项比较字段 ID、顺序、原始来源、options、必填、唯一、可搜索。同 sort 的绑定按逆 ID 顺序插入，验证稳定次序。随后通过真实字段创建/绑定入口分别给根、子新增字段，已有后代不自动获得新增字段。

### 实际升级与恢复边界

- 本节命令只授权临时库演练，不是生产升级命令。正式升级仍需另外授权；先停旧应用写入、取得一致性备份，在验证副本上完成迁移与业务对帐后才考虑切换。
- 活跃 WAL 库禁止只复制主 `.db` 冒充备份。使用 SQLite online backup 或本演练实际执行的 `VACUUM INTO`，目标必须是新路径；不得把 `immutable=1` 用于读取活跃库业务数据或备份。
- 需要回退时，先停写，对当前 024 库另做一致性保全备份并验证；再把升级前 023 备份恢复到**新路径**，核对版本、完整性、资产属性、编号、唯一 scope 与事件，并配套匹配的旧版本程序。不要用新版自动迁移程序打开恢复副本后再声称它仍为 023。
- 升级后写入必须保留原 024 库及保全副本，另行评估导出、核对和回放方案；本演练没有实现自动跨版本合并。未经确认不能覆盖原库或把旧备份恢复称为“零数据损失”。
- 上述命令已包含迁移中途故障注入回滚与归档唯一历史回归；历史执行结果需连同 `verification.md` 的 T010 及后续 T005 补充小节阅读，不能把较早的「仍缺失」当作最新状态。测试当前通过与原始测试先行历史是两类证据，新增回归首跑绿不能冒充红绿过程。T005–T009现已结合隔离migration mutation复核：副本分别移除选择表DDL和继承回填时既有真实旧库测试明确失败，恢复原始迁移后store/schema及WAL演练全部通过。具体diff、退出码及日志见verification的T005/T010当前负向验证小节。这是当前失败可探测性验证，不追认为历史TDD红灯；正式生产部署仍需另行授权。

## 2. 类别编辑与多级选择

1. 以有 schema.manage 的账号创建子类，继承区显示直接父类有效字段，默认全不选；自身直接绑定不出现在其中。
2. 勾选 A、取消对话框，验证所有数据不变；再次勾选并保存，详情、录入表单出现 A。
3. 孙类只能选择父类已选 A 与父类自身 D，不能跨过父类选择 B；A 来源显示 R。
4. 打开编号字段候选，仅包含最终草稿有效类别字段；允许选择非唯一字段。
5. 切换父级时，同字段 ID 且仍有效的选择保留；新字段不自动选择。同 key、不同 ID 不可冒充旧字段。
6. 无管理权限账号可读，编辑入口禁用并有说明，直接写 API 被服务端拒绝。
7. 中英两语和窄屏检查键盘勾选、焦点、加载、空候选、失败、提交禁用与成功反馈。

## 3. 撤回、依赖及确认

1. 父类和孙类均继承 A，资产有 A 值。取消父类 A，确认界面显示后代及资产数量；点取消，不发生任何写入。
2. 后代的编号使用 A 时，保存失败；当前类别可在同次草稿中清空或改编号，但不能自动改后代配置。
3. 计算字段 Z 依赖 A、B，只选 Z 时明确显示依赖缺项；不自动勾选。
4. 有效计算字段仍依赖 A 时撤回失败；一起取消所有相关继承计算字段且后代无残留依赖后可提交。
5. 从字段编辑器解绑上游直接绑定，也必须进入同等确认与守卫，不能绕过类别编辑器保护。
6. 预览后另一个会话改变相关数据，旧确认提交返回冲突或要求刷新；没有新增影响未经确认就被写入。
7. 用确定性测试屏障在 Prepare 与 Persist 之间撤回字段，覆盖新建、编辑与导入；旧准备结果返回 schema_stale 且零写入，导入整批回滚。对 Recompute 独立持久化路径做同类检查，不用 sleep 制造竞争。

## 4. 旧值恢复与唯一性

1. 甲、乙继承 R 的唯一字段 U。甲资产保存 ABC。
2. 甲撤回 U 后，旧值仍在归档属性里可读，乙可以保存 ABC。
3. 搜索 ABC 只能由仍有效的匹配或其他独立有效字段返回；甲不能再由被撤回 U 的当前或历史唯一行命中，也不能精确跳转甲。
4. 甲恢复 U 因乙的 ABC 冲突而失败，选择和索引均不变，错误可定位乙的 UUID。
5. 使用无冲突数据验证恢复成功，旧值重新有效，不要求重新录入。
6. 上游恢复后孙类仍未选中，必须逐层主动选择。普通资产值替换产生的历史编号搜索仍正常，不把所有历史搜索一并关闭。
7. 恢复前改变字段格式约束，旧值不合法时拒绝并指出资产与字段。

## 5. 存量必填与计算

1. 含存量资产的子类首次继承必填采购日期，资产无值，继承保存成功，不写虚构值。
2. 新资产缺日期保存失败；旧资产下次编辑未补齐保存失败。
3. 继承计算字段时检查所有需计算资产；计算失败或唯一冲突时全部回滚。
4. 成功时计算值、唯一索引、搜索索引同步；asset version 随实际资产变更更新，旧编辑表单不可覆盖新结果。
5. 失败前后对类别、选择、资产、索引做全量快照比较，确认没有局部写入。

## 6. 消费者一致性

对同一组混合型号资产核对：类别详情、schema、资产详情与编辑、录入、编号候选、列表列解锁、导入模板、逐行校验、CSV 导出、rows、打印。

- 撤回字段只能作为归档属性查看，不是有效导出值。
- 类别筛选包含后代时，对每行按该行类别的实际有效集判定；父类仍有 A 不代表拒绝继承的子类可以导出 A 的旧值。
- 型号和厂商字段仍来自各自绑定，模板保留混合型号可能列集，逐行拒绝不适用设备字段的非空值。
- 直接绑定列表 category_ids 不因继承回填而扩大；实际有效过滤和影响数量按选择结果计算。
- 搜索与唯一值对帐应能发现漏项、残留、错误 scope；正常数据库应通过 nexus verify。

## 7. 自动化门禁

实施时保存实际命令、结果、测试数量和覆盖率，不复用上一轮验证结论。

```sh
gofmt -l ./cmd ./internal ./migrations
go vet ./...
golangci-lint run
go test ./...
# 核心管线单独生成覆盖率报告，确认不低于 80%。
```

前端在 web 目录运行：

```sh
npx tsc --noEmit
npx eslint .
npx vitest run --maxWorkers=4
npm run build
```

另需运行带嵌入前端的 CGO_ENABLED=0 构建、临时种子库上的 nexus verify、更新后的 deploy/smoke.sh，并检查 git diff --check、双语键覆盖、初始 chunk gzip 大小。

万级资产验证列表 p95 < 200ms、单条读写 p95 < 100ms、高频读取无 N+1，界面操作反馈 < 100ms、超过 300ms 显示提交状态。批量继承变更单独记录耗时及锁持有时间，超出章程要求必须在计划的偏离表中登记而非隐瞒。
