# 快速开始：新的编号模型

**Feature**: 002-identity-and-transfer | **Date**: 2026-08-28

环境准备、`.env` 配置、开发与构建流程全部沿用
[001 的 quickstart](../../001-asset-ledger-demo/quickstart.md)，本文不重复。
这里只讲**新模型下有什么不一样**。

## 升级已有数据库

```bash
./nexus            # 启动时自动跑 migrations/002_identity.sql
```

迁移做四件事：删掉 `assets.sn` 与 `asset_sn_history`、把 `categories.sn_template`
换成 `display_key`、新建 `asset_unique_values`。

**存量资产保留，存量编号丢弃。** 升级后每台设备的显示编号变成 UUID 前 8 位，
直到你按下面的步骤配好显示编号。demo 库直接删掉重新 `seed` 更省事：

```bash
rm -f nexus.db nexus.db-wal nexus.db-shm
./nexus seed 50
```

回滚一格会完整还原 001 的形态（`sn` 列的值取 UUID 前 8 位，不是原来的编号 ——
那些值已经没有了）。

## 配置顺序：先依赖，后表达式

这是新模型下唯一需要重新学的东西。**绑定顺序现在有意义了**：

1. `/fields` 建静态键：`mac`（MAC 地址，勾选「全局唯一」）
2. `/fields` 建表达式键：`sn`（类型选 `computed`，勾选「全局唯一」，
   模板 `{{ .attrs.mac | hex2dec }}`）
3. `/categories` 建类别，然后**先绑 `mac` 并勾必填**
4. 再绑 `sn`
5. 在类别的「显示编号」下拉里选 `sn`

第 4 步和第 3 步调过来会被拒绝：

```
表达式键 sn 依赖的尚未绑定到该类别：「基准 MAC」(mac)
```

`mac` 绑了但没勾必填也会被拒绝：

```
表达式键 sn 依赖的需要先标为必填：「基准 MAC」(mac)
```

**这不是刁难。** 表达式求值失败会回滚整次保存，而依赖为空必然求值失败 ——
所以被表达式读取的静态键事实上就是必填的。不在这里拦，就会在某天变成
「为什么这台设备存不进去」，而错误指向 `sn` 而不是真正空着的 `mac`。

「显示编号」下拉只列出标为唯一的信息项。想选的字段不在里面，去 `/fields` 给它勾上唯一。

## 不配显示编号也能用

跳过第 5 步，甚至跳过第 2 和第 4 步，照样能录设备。此时列表首列显示
UUID 前 8 位（如 `a3f1e2d4`），删除确认要输的也是它。

**这正是本特性要的效果** —— 建一个新类别时不必先想清楚编号怎么编。

显示编号**不会**从父类别继承。子类别没设就是没设，显示 UUID 短码。

## 验证新行为

```bash
# 1. 扫码：任何标为唯一的字段都能直达，不限于编号
curl "…/api/assets?q=00:1A:2B:3C:4D:5E"   # 分隔符写法随意
curl "…/api/assets?q=112394521950"        # 显示编号
curl "…/api/assets?q=<uuid>"              # UUID

# 2. 改一次 MAC 之后，旧 MAC 和旧编号都还能搜到
#    （旧值归档，仍参与检索，但不再占用唯一性）

# 3. 详情页流转：单台不产生 batch_id
curl -X POST …/api/transfers \
  -d '{"asset_ids":["<id>"],"to_status":"in_use",
       "to_holder_type":"user","to_holder_id":"<uid>"}'
```

## 对帐

```bash
./nexus verify                 # 退出码非 0 表示发现不一致
```

在 001 的两项检查之外，新增第三项：`asset_unique_values` 与 `assets.attrs` 的**双向**核对。

- 索引里有一行、但 `attrs` 里的值已经变了 → 有代码绕过保存管线直接写了 `assets`
- 某个唯一字段有值、但索引里没有对应的在用行 → 该值既搜不到，也不占用唯一性，
  另一台设备可以合法地把它抢走

第二种更隐蔽，因为它不会以任何方式表现出来 —— 直到有人真的抢走了那个值。

自测一下检出能力：

```bash
sqlite3 nexus.db "UPDATE assets SET attrs = json_set(attrs,'\$.mac','00DEADBEEF00')
                  WHERE id = (SELECT id FROM assets LIMIT 1)"
./nexus verify    # 应当报出这处漂移并以非 0 退出
```

## 合并门禁

与 001 相同的七条。本特性额外要留意的两项：

- **第 4 条（DOM 测试）**：新增了流转弹层、型号选择器与显示编号编辑器三个 UI，
  对应 `web/tests/{assetDetail,modelPicker,displayKey,metadata}.test.tsx`
- **第 3 条（覆盖率）**：三处新门禁的测试必须写在 `internal/schema` **包内**。
  跨包测试（比如从 `internal/asset` 调过来）不计入该包覆盖率 ——
  实现时正是因为这个，覆盖率一度从 81.8% 掉到 75.7%

## 容易被静默做错的四处

001 的五条仍然成立（尤其第 3 条「MAC 规范化必须早于唯一性校验」，
它在新模型下同样是 `AA:BB:CC` 与 `aa-bb-cc` 不重复入库的唯一保障）。本特性新增：

1. **迁移不能包在事务里**。SQLite 重建带 UNIQUE 约束的表必须先 `PRAGMA foreign_keys=off`，
   而这个 pragma 在事务内是**空操作**，SQLite 静默忽略它。goose 默认包事务，
   于是 pragma 不生效、`DROP TABLE` 被外键挡下。`-- +goose NO TRANSACTION` 不能删。

2. **表重建时最后才 RENAME**。SQLite 3.25 起 `ALTER TABLE ... RENAME` 会连带改写
   其他表指向它的外键。要是先把旧表改名走，`asset_transfers` 的外键就会跟着指向
   `assets_old`。正确顺序是：建新表 → 搬数据 → DROP 旧表 → RENAME 新表。

3. **模板改写的复检必须跑在 UPDATE 之后**。检查函数从数据库读模板，
   跑在 UPDATE 之前读到的是旧模板，门禁形同虚设 —— 实现时这里错过一次，
   靠 `TestTemplateEditCannotIntroduceAnOptionalDependency` 抓出来。
   放在 UPDATE 之后，靠事务回滚拒绝。

4. **唯一值行必须在 `assets` 行之后写**。`asset_unique_values.asset_id` 是外键，
   资产行还不存在时插不进去。但**冲突探测**仍要在写入前做 —— 那一步的目的是给出
   「该值已被资产 X 占用」这种能执行的错误，晚了就只剩一句约束违反。
