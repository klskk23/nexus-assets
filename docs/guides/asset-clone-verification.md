# 资产单台克隆验收记录

日期：2026-10-09。本记录仅对应资产列表的单台克隆增量，不将031的历史结果冒充本轮验证。

## 范围与边界

- 行右键菜单的「克隆」按该行 UUID 打开预填写的新建表单，不直接创建；不提供批量克隆。
- 复用 `asset.create`、详情读取、当前类别/型号 schema 与 `POST /assets`，没有新增端点、权限或数据库迁移。
- 预填类别、型号、备注与有效普通字段；唯一静态字段显式清空，计算字段正常重算，归档与身份/历史不复制。
- 状态、持有方、负责人采用普通新建默认；操作人员可以更正表单后保存。
- 保留工作区031改动，不读取 `.env`，只使用独立临时环境；不提交、推送、打 tag 或发布。

## 测试先行

初始红灯：`/tmp/nexus-clone-red.log`。克隆专属9条真实组件 DOM 测试及资产列表2条新增用例均因入口/预填尚未实现而失败；同次运行原有67条通过。

测试覆盖目标包括详情信封、有效字段白名单、0/false、唯一空键、型号默认值、错误重试、取消零写入、人工修改保护及普通新建隔离。后续绿灯和最终数量以实际完成结果为准。

## 本轮已执行的后端门禁

此次没有为克隆修改 Go 代码，但对当前完整工作区实跑：

| 命令 | 结果 |
|---|---|
| `GOMAXPROCS=2 go test -p 1 ./... -count=1` | 退出0，全包通过 |
| `GOMAXPROCS=2 go vet ./...` | 退出0，无输出 |
| `GOMAXPROCS=2 golangci-lint run` | 退出0，0 issues |
| `gofmt -l cmd internal migrations` | 无输出 |
| 核心包 `go test -cover -count=1` | schema 83.6%、asset 84.1%、compute 88.1%、cmd/nexus 85.1% |

日志：`/tmp/asset-clone-{go,vet,lint,coverage}.log`。OpenAPI 两份内容一致；本轮无端点变更，不增加虚假的克隆端点或 smoke 断言。

## 前端最终门禁

同源请求尚未结束时关闭再重开的补充用例先失败（`/tmp/nexus-clone-session-red.log`），再以独立会话查询键修复。准备阶段的 schema 也使用会话私有读取，避免迟到响应污染共享缓存。另在字段错误 DOM 回归出现红灯后补齐 `aria-invalid`。

| 检查 | 实际结果 |
|---|---|
| 定向 DOM 回归 | 5文件133测试通过 |
| `npx tsc --noEmit` | 退出0 |
| `npx eslint .` | 退出0 |
| `npx vitest run --maxWorkers=4` | 66文件582测试通过，51.68s |
| `npm run build` | 退出0，4.87s |
| `git diff --check` | 退出0 |

新增克隆专属10条、资产列表3条；全量比031基线增加13条。日志：`/tmp/nexus-clone-targeted-green.log`、`/tmp/asset-clone-web-{tsc,eslint,full,build}.log`。

生产入口 `index-BHFrgqDG.js` gzip **215.39KB**，低于500KB。既有Node localStorage实验警告、TransferForm缺key、SignInThenShell渲染期间更新AuthProvider，以及Vite未压缩入口超阈值警告仍在；不宣称零警告。

## 真实后端与浏览器

以最终生产前端构建 `CGO_ENABLED=0` 静态二进制，使用独立临时SQLite及一次性管理员。`NEXUS_ENV_FILE` 指向不存在的临时文件，未读取项目 `.env`。种子100台，真实浏览器新建克隆1台；创建流程应用API没有mock。

- 英文1440×1000：右键克隆，唯一MAC为空、普通固件字段预填；取消零资产写入。
- 更正MAC与备注后保存，只有一次 `POST /assets`，生成不同UUID；新值落库、计算字段重算、状态在库，重新读取源资产完整对象保持不变，资产总数100→101。
- 390×844中英文：克隆对话框宽358px、左侧16px，无对话框横向溢出；Tab焦点可见，Escape可取消。实际查看宽屏及中文窄屏截图。
- 错误分支只对一次源详情GET注入503，确认不展示可保存表单；显式重试后读取真实后端恢复。此项是故障注入，不冒充后端自然故障。
- 浏览器未捕获未处理的页面异常。自动化脚本位于 `/tmp/asset-clone-e2e/`，证据包括 `result.json`、`states.json`、`clone-ready.png`、`clone-narrow-{en,zh}.png`。

### 本地业务交互量测

Chromium153.0.8010.12、Linux、1440×1000、localhost真实后端，无CPU或网络限速。每次导航清空并禁用HTTP缓存，同一浏览器进程。固定定义为navigation origin→资产行可见→右键菜单克隆表单字段可用，含自动化操作等待。

| 样本 | 资产行可见（ms） | 克隆字段可用（ms，自导航起） |
|---|---:|---:|
| 1 | 258 | 445 |
| 2 | 162 | 305 |
| 3 | 167 | 319 |
| 4 | 160 | 309 |
| 5 | 166 | 327 |

克隆字段可用中位319ms、最大及nearest-rank p95为445ms，五次均小于1.5s。**这是本地业务交互代理指标，不是Lighthouse标准TTI，也没有完整静默窗口，不构成目标部署环境性能保证。** 不复用031类别页的性能样本作为本轮结果。数据：`/tmp/asset-clone-e2e/performance.json`。

## 交付验证与清理

- 静态二进制由 `file` 确认statically linked；种子初始对帐通过，实际克隆后再次 `nexus verify`：**101 asset(s) reconcile with schema, transfer history, unique and search values**（`/tmp/asset-clone-e2e/verify-final.log`）。
- `docker build -f deploy/Dockerfile -t nexus-assets:clone-local .` 成功；`PORT=18332 bash deploy/smoke.sh nexus-assets:clone-local` 成功，包含启动、健康检查与重启持久化。日志 `/tmp/asset-clone-{docker-build,smoke}.log`。仅本地构建，未推送镜像。
- 浏览器均在finally关闭，临时后端已停止；本次credentials、DB/WAL/SHM与pid文件已删除。未将凭据或数据库放入仓库。
- 复用现有shadcn控件，无新增基础组件或依赖；双语目录与规则已同步。
- 验收结束时工作区031既有改动保留，HEAD为 `d6c3f1a`，当时未暂存、提交、推送、打tag或发布。

## 后续发布授权

2026-10-09，开发者在验收完成后明确要求「推送更改和tag」。据此将031与单台克隆一并提交，目标为 `origin` 的 `031-selective-field-inheritance` 分支及 `v0.18.0` 标签；该标签触发既有Release流水线。此段记录授权与目标，远端推送及流水线结果以实际执行结果为准。
