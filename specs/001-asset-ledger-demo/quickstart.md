# 快速上手

**Feature**: 001-asset-ledger-demo | **Date**: 2026-08-28

## 前置

| 工具 | 版本 | 用途 |
|------|------|------|
| Go | 1.23+ | 后端。**构建时必须 `CGO_ENABLED=0`** |
| Node.js | 20+ | 前端构建 |
| golangci-lint | 最新 | 合并门禁 1 |

不需要安装 SQLite —— 驱动是纯 Go 的 `modernc.org/sqlite`，无需系统库与 C 工具链。

## 配置

配置来自 `.env` 文件与环境变量。**真实环境变量优先于 `.env`** —— 容器、CI 或一次性的
`NEXUS_ADDR=:9000 ./nexus` 都能覆盖文件里的值而不必改文件。没有 `.env` 也能跑，纯用
环境变量即可，CI 就是这么做的。

```bash
cp .env.example .env && chmod 600 .env
```

`.env` 在 `.gitignore` 里，`.env.example` 入库。文件里放着 JWT 密钥与初始管理员密码，
权限过宽时程序会在 stderr 告警（不阻断）。`.env` 解析失败则拒绝启动并指出行号 ——
带着一半配置跑起来比不跑更糟。

用 `NEXUS_ENV_FILE` 指定其他路径，便于同机跑多个实例。

**`NEXUS_JWT_SECRET` 缺失时程序拒绝启动**，不自动生成随机密钥 ——
否则每次重启所有人掉线，且很难查出原因。

| 变量 | 必填 | 说明 |
|------|:----:|------|
| `NEXUS_ENV_FILE` | 否 | 配置文件路径，默认 `./.env` |
| `NEXUS_DB_PATH` | 否 | 默认 `./nexus.db` |
| `NEXUS_JWT_SECRET` | **是** | JWT 签名密钥 |
| `NEXUS_ALLOWED_EMAIL_DOMAINS` | **是** | 逗号分隔，如 `yourcompany.com` |
| `NEXUS_OIDC_CLIENT_ID` | 否 | 不配则只能用本地账号登录 |
| `NEXUS_OIDC_CLIENT_SECRET` | 否 | 同上 |
| `NEXUS_OIDC_REDIRECT_URL` | 否 | 同上 |
| `NEXUS_OIDC_REQUIRE_HD` | 否 | 默认 `true`，比对 Google Workspace 的 `hd` 声明；公司未用 Workspace 时置 `false` 退回 email 后缀比对（research.md D5） |
| `NEXUS_ADMIN_EMAIL` | 否 | 库中无任何账号时用它创建初始管理员 |
| `NEXUS_ADMIN_PASSWORD` | 否 | 同上 |

## 首次运行

系统**以空库启动，不预置任何示例数据，也没有引导流程**（FR-062）。第一次进去看到的是空的。
按下面的顺序走一遍，就能录入第一台设备：

```bash
cp .env.example .env && chmod 600 .env   # 或 make dev 自动完成这一步
go run ./cmd/nexus                        # 自动执行迁移，监听 :8080
```

1. 用初始管理员账号登录
2. `/holders` 建一个位置，勾选「默认库存点」
3. `/fields` 建信息项：`mac`（MAC 地址类型，必填 + 全局唯一）、`firmware`（文本）
4. `/categories` 建「网络设备」→ 子类「SDWAN 路由器」，绑定上述信息项，
   在子类上设 `sn_template` 为 `{{ .attrs.mac | hex2dec }}`
5. `/models` 建一个型号
6. 从首页的快速录入卡片选类别，录入第一台设备

> 第 2 步其实可以跳过 —— 第一台资产的持有方可以直接选自己（FR-064）。
> 但归还功能需要默认库存点，早点建掉省事。

## 开发

前后端分开跑，Vite 代理 `/api` 到 Gin：

```bash
make dev                               # 终端 1，:8080（缺 .env 时从样例生成）
cd web && npm run dev                  # 终端 2，:5173，代理 /api → :8080
```

## 构建单二进制

前端必须先构建 —— `web/dist` 是 `embed.FS` 的挂载点，不存在时 Go 编译会失败：

```bash
cd web && npm ci && npm run build && cd ..
CGO_ENABLED=0 go build -o nexus ./cmd/nexus
```

交叉编译（纯 Go 驱动的直接好处，不需要目标平台的 C 工具链）：

```bash
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o nexus-linux-amd64 ./cmd/nexus
```

部署产物 = `nexus` 可执行文件 + `nexus.db`。

## 对帐

```bash
./nexus verify                 # 退出码非 0 表示发现不一致
```

重放全部流转事件，做两项检查：末条事件的 `to_*` 是否等于 `assets` 上的物化快照；
相邻事件的 `from_*` 是否等于前一条的 `to_*`。**第二项专门用来抓绕过保存管线直接写库的
代码路径** —— 那是物化快照漂移的唯一来源。必须进 CI。

## 测试

```bash
go test ./...                                    # 后端：单元 + 端点集成
go test -coverprofile=c.out ./internal/schema/... ./internal/asset/... \
        ./internal/compute/... && go tool cover -func=c.out   # 核心管线覆盖率 ≥ 80%
cd web && npx vitest run                         # 前端：必须含 DOM 测试
```

## 合并门禁

章程规定的七条，全部通过才能合并（`.specify/memory/constitution.md`）：

```bash
test -z "$(gofmt -l .)" && echo "1a OK"
go vet ./... && golangci-lint run          # 1b
cd web && npx tsc --noEmit && npx eslint . # 2
go test ./...                              # 3（含覆盖率）
cd web && npx vitest run                   # 4（触及 UI 时必须有新增/更新的 DOM 测试）
./nexus verify                             # 5
# 6：无未经开发者确认的自定义组件 —— 检查 web/src/components/custom/ 是否有新增
# 7：文档中文、代码英文（i18n 文案除外）
```

## 容易被静默做错的三处

1. **DSN pragma 参数漏写**：不带 pragma 参数的连接串会**静默**得到
   `journal_mode=delete`、`busy_timeout=0`、`foreign_keys=0`，开库完全不报错。
   （实测 modernc v1.57.0 两种语法都接受，所以危险的不是语法而是漏写或拼错。）
   `store.Open()` 里有回读断言，别删掉它。
2. **`BEGIN IMMEDIATE`**：靠写池 DSN 的 `_txlock=immediate`。少了它，唯一性校验会从
   "字段级清晰报错"退化成"提交时的 busy 错误"。同样有回读断言。
3. **MAC 规范化的位置**：必须在唯一性校验**之前**。顺序反了，同一张网卡的三种写法会被
   当成三台不同设备，而且全部校验通过。
4. **前端构建产物目录不能叫 `assets`**：那也是一条应用路由。同名时静态文件服务会把
   `/assets` 301 重定向到目录，SPA fallback 根本轮不到，深链接直接坏掉。
   `vite.config.ts` 里已设 `assetsDir: "static"`，别改回去。
5. **区分「键缺失」与「显式 null」**：`PATCH /categories/:id` 的 `parent_id` 用
   `json.RawMessage` 接收。反序列化 JSON null 到 `**string` 会把外层指针清成 nil，
   于是「移到根」和「不动上级」变得无法区分 —— 移动护栏会静默不执行，还返回 200。
