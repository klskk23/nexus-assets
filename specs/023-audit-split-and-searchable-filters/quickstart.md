# 实机走查：审计分栏、流转可查、筛选可搜

本轮大部分能写成测试。**这份走查管测试守不住的三类**：迁移在真实旧库上的行为、
键盘全流程、以及跨栏的观感一致。

```
npm --prefix web run build && CGO_ENABLED=0 go build -o /tmp/nexus ./cmd/nexus
NEXUS_ADDR=:8819 NEXUS_JWT_SECRET=... NEXUS_ADMIN_EMAIL=... NEXUS_ADMIN_PASSWORD=... \
NEXUS_ALLOWED_EMAIL_DOMAINS=example.com NEXUS_DB_PATH=/tmp/qs.db /tmp/nexus seed 60
```

> **改了前端必须先 `npm run build` 再 `go build`** —— 二进制里 embed 的是 `web/dist`。
> 021 踩过一次，而且当时 `构建 ✓` 还照样打印了，因为输出被重定向到了 `/dev/null`。
> **门禁 2 要跑 `npm run build`，不是 `tsc --noEmit`** —— 后者不覆盖测试文件。

---

## 1. 迁移：在一个真的旧库上跑 ⚠️ 这一步不能省

复制一份**升级前**的库，在上面跑新二进制，然后查角色：

```sh
cp /tmp/qs018.db /tmp/mig.db
sqlite3 /tmp/mig.db "select id, permissions from roles;"     # 记下升级前
NEXUS_DB_PATH=/tmp/mig.db /tmp/nexus verify                   # 触发迁移
sqlite3 /tmp/mig.db "select id, permissions from roles;"      # 升级后
```

- 升级前带 `audit.read` 的角色，升级后**两个都有**
- 不带 `audit.read` 的角色，**一个都没多**
- `role-admin` 的 `permissions` 仍是 `[]` —— 它靠 `is_admin`，不该被这条迁移碰
- **再跑一次迁移，不应出现重复项**（`NOT EXISTS` 那半句在守这个）

## 2. 权限的四个登记处

```sh
grep -c "transfer.audit" internal/authz/permissions.go internal/httpapi/permissions.go \
  web/src/features/auth/usePermissions.ts web/src/i18n/zh.ts web/src/i18n/en.ts
```

五处都要非零。**漏掉前端 `PERMISSIONS` 那处是静默失败** ——
界面会以为谁都没有这个权限，而没有任何编译错误或测试会报。

## 3. 两种权限的三种组合

造三个角色各配一种，分别登录：

| 角色 | 侧栏审计入口 | 打开 /audit | 打开 /audit/transfers |
|---|---|---|---|
| 只有操作审计 | 出现 | 落在操作审计，另一页签不出现 | **服务端拒绝** |
| 只有流转审计 | 出现 | **落到流转审计** | 正常 |
| 两个都没有 | **不出现** | 服务端拒绝 | 服务端拒绝 |

第三行那个「不出现」是审计页既有的例外（隐藏而非禁用），不要改成禁用。

## 4. 流转审计的筛选

四个条件逐个用、再叠加用：

- **操作人**：只剩他记的
- **资产编号**：输入编号**中间**的几个字符，**大小写混写** —— 仍命中
- **时间范围** + **动作类型**：两个同时生效
- **零结果**：空态说明是筛选造成的，并给清除
- **跨页**：结果多于一页时翻页正确，总数不随翻页变化

## 5. 两张表

- 概览「最近流转」**每行看得出是哪台设备** —— 这是本轮要修的那个缺陷
- 详情「流转历史」**没有一列在重复本页设备的编号**
- 两张表与产品其余表格**同形同色**（`TableFrame`）
- 详情页最后一条流转：**右键**出「更正此记录」；其余行右键，该项**禁用而非消失**

## 6. 可搜下拉：全程只用键盘 ⚠️

厂商、型号、持有方/负责人、类别，**每一个都试一遍**：

```
Tab 到它 → Enter/Space 打开 → 直接打字 → ↑↓ 移动 → Enter 选中 → Esc 关闭
```

全程不碰鼠标。任何一步走不通就是没做完 —— 这正是不在 `Select` 里塞输入框的原因，
那条路会让 Radix 的 typeahead 和输入框抢按键。

另外：

- 输入词**中间**的片段、**大小写不一致** —— 都要命中
- **无命中**时有明确空态，不是一片空白
- **类别在搜索时显示完整路径**（「网络设备 / SDWAN 路由器」），不是缩进

## 7. 服务端门禁（本轮真的要跑）

前四轮都是「服务端零改动」，习惯性略过是真实风险。本轮**必须**：

```sh
gofmt -l .                      # 输出为空
go vet ./...                    # 零告警
golangci-lint run               # 零告警
go test ./...                   # 全过
NEXUS_DB_PATH=/tmp/qs.db /tmp/nexus verify    # 种子库对帐
```

核心管线包（`internal/schema`、`internal/asset`、`internal/compute`）覆盖率
不低于既有水平；新增的 `internal/transfer` 查询要有自己的测试。

## 8. 契约与冒烟

```sh
grep -n "transfers" deploy/smoke.sh specs/001-*/contracts/openapi.yaml
```

新端点必须同时出现在两处 —— CLAUDE.md：「改了端点就要改 `deploy/smoke.sh` 与合约」。

## 9. 前端门禁

```sh
npm --prefix web test -- --run --maxWorkers=4    # 一定要加 --maxWorkers=4
npm --prefix web run build                        # 含 tests 的 tsc -b
npm --prefix web run lint
```
