# 031 前端验证记录

日期：2026-10-08。前端实现代理执行并汇报，主会话汇总；本文件属于仓库验收记录。

## 实现范围

- 完整类别草稿预览、字段继承选择、编号依赖定位。
- 受控确认冻结完整草稿及 token；取消零写入，stale 后显式刷新并再次确认。
- 类别解绑复用影响确认；DELETE 可选 JSON body，续期重放保留 body。
- 类别、字段、冲突资产按 UUID 链接；必填影响使用服务端去重计数，支持失败重试。
- 集中失效有效字段消费者缓存；录入、编辑、导出过滤已撤回字段。
- 双语目录与 RTL DOM 回归。

主要新增回归：`web/tests/inheritanceConfirmation.test.tsx`、`categoryDraftDependencies.test.tsx`、`inheritanceConsumers.test.tsx`。

## 首轮源码门禁（后续569测试结果见末节）

| 命令（web 目录） | 实际结果 |
|---|---|
| `npx tsc --noEmit` | 退出 0 |
| `npx eslint .` | 退出 0 |
| `npx vitest run --maxWorkers=4` | 65 文件、565 测试通过，49.89s |
| `npm run build` | 退出 0，4.95s |
| `git diff --check -- web` | 退出 0 |

入口 JS 691.24KB，gzip **215.36KB**，低于 500KB gzip 门槛。最终产物在 `web/dist`；Docker 构建另按 Dockerfile 独立构建前端。
日志：`/tmp/031-web-full-final.log`、`/tmp/031-web-build.log`。

## 警告（未宣称零警告）

- Node localStorage 实验性警告。
- actionBar 测试中的 TransferForm 缺少 key。
- signInPermissions 测试中渲染时更新 AuthProvider。
- Vite 未压缩入口超过 600KB 警告；与 500KB gzip 门槛不是同一指标。
- 首次浏览器走查：0 error，1 条 React Router 缺少 HydrateFallback warning。

没有为清除此批既存警告扩展无关代码。

## 首次浏览器走查

使用 `envFile:false` 临时 Vite，**全部 `/api/**` 模拟**，不代表真实服务端端到端验收。

已验证中英文类别编辑/确认、取消、模拟保存成功、390px 长文、1440px 布局、Tab/Space 键盘与可见焦点。
390px 下 dialog 宽 358px、左右 16px，无页面或 dialog 横向溢出；长候选内容在表内滚动。

单次点击至下一次 requestAnimationFrame 为 **20ms**，仅为开发环境模拟交互样本，不能替代生产 TTI。
首次走查未完成解绑、stale、loading/error 的完整浏览器矩阵，已有 DOM 回归不等同于浏览器实测。
生产产物与补充浏览器测量尚待单独结果，不预先记为通过。

截图已由执行代理实际查看：
- `/tmp/031-web-evidence/031-category-narrow.png`
- `/tmp/031-web-evidence/031-confirmation-narrow-en.png`

真实 token/HMAC、数据库事务、消费者一致性及容器 smoke 见主验证与后端专项记录。

## 最终生产产物补充走查

执行代理已用最终 `web/dist` 的 `index-CgcbNgan.js` 补测；Linux、Chromium 152.0.7977.64，1440×900。Python静态服务器提供SPA fallback，localhost、不压缩、不限CPU/网络；**所有API仍为Playwright模拟**。每次导航清空HTTP缓存并禁用缓存，同一浏览器进程，不是进程冷启动。

从navigation time origin起测「编辑类别按钮可见且启用」，随后真实点击，等待弹窗名称输入可见：

| 样本 | 按钮可用（ms） | 点击后弹窗可见（ms，自导航起） |
|---|---:|---:|
| 1 | 151 | 243 |
| 2 | 132 | 216 |
| 3 | 159 | 239 |
| 4 | 132 | 210 |
| 5 | 163 | 247 |
| 中位数 | 151 | 239 |

短观察窗口无Long Task。这是生产bundle在本机模拟API条件下的业务交互代理指标，包含自动化等待开销；**没有完整TTI静默窗口或真实后端等待，不能宣称标准生产TTI≤1.5s已达标**。

补测类别编辑：初始预览pending/503时禁保存；错误重试恢复已保存选择；清空草稿后503不丢空草稿；409 impact_stale保留草稿，显式刷新和重新打开确认均不PATCH，再次确认才携新token提交；写pending时取消禁用、Escape不关闭。

补测类别字段解绑：预览pending禁提交、503可刷新；取消不DELETE且原绑定仍勾选；stale刷新不自动DELETE、须再次确认；普通503保留确认/绑定并可重试；写pending禁取消/Escape；成功取消绑定勾选、出现解绑成功toast；DELETE携带确认token。

截图 `.playwright-mcp/031-production-unbind-success.png` 已实际查看。既有HydrateFallback警告仍在；503/409网络错误来自主动故障注入，未观察其他应用运行异常。临时服务器及浏览器已关闭。本轮仅走查、未改生产代码，不增加自动测试数量；消费者完整DOM矩阵单独核验。

## T052 真实消费者 DOM 补充验证

测试-only新增4条，首次运行即绿，不属于原始红灯证据：

- `assetDetail.test.tsx`：真实AssetDetail经共享invalidateSchema和真实QueryClient刷新后显示归档值；编辑器不提供该字段，保存payload不携带归档值。
- `assets.test.tsx`：已选字段列随schema及资产列表刷新消失，不显示archived_attrs，菜单不再提供撤回字段。
- `import.test.tsx`：schema_stale后保留文件；重新预览以撤回字段错误替换旧成功结果，禁用确认导入。
- `print.test.tsx`：重开真实打印弹窗获取新服务端投影；提交仅含资产UUID与标签选择，无客户端字段值。

已有覆盖复用：`newAsset.test.tsx` 的schema刷新移除输入及旧草稿值；`assetDetail.test.tsx` 的编辑中撤回与stale保留草稿；`export.test.tsx` 的导出选择过滤。`inheritanceConsumers.test.tsx` 的synthetic observer仅证明缓存失效，不替代这些真实组件DOM证据。

定向4文件124测试通过（14.41s）；tsc与eslint通过；全量65文件569测试通过（49.11s）；测试目录diff-check通过。日志：`/tmp/031-real-consumers-dom.log`、`/tmp/031-real-consumers-tsc.log`、`/tmp/031-real-consumers-eslint.log`、`/tmp/031-real-consumers-full.log`。

API仍为测试夹具：这些测试不能宣称真实后端、真实打印服务全链路已验证，服务端字段计算与归档隔离须结合后端HTTP测试/smoke。此次未改生产文件或web/dist。

## T062/T064 同库真实后端验收

2026-10-08，执行代理使用最终 `web/dist` 构建嵌入前端的临时 nexus，监听 localhost:18231；`NEXUS_ENV_FILE` 显式指向不存在的临时路径，独立临时 SQLite、一次性凭据，未读取 `.env`。**应用 API 没有 mock**。同库包含 Root → Child → Grandchild、两个型号及共同厂商、类别/型号/厂商字段、两台原始资产；随后真实浏览器录入及 CSV 导入各新增一台。

| 同库场景 | 实际结果 |
|---|---|
| 真实浏览器撤回 | Child 取消继承，确认显示2个类别、2台资产；确认提交后 Grandchild 同步失去该字段 |
| 类别、schema、编号 | 最终有效集一致；编号候选保留 Keep field、不提供 Withdraw field |
| 资产详情/编辑 | 旧值在归档区可读，编辑器不提供撤回字段；型号专属字段仍正确 |
| 列表/录入 | 列菜单和表格不提供撤回字段或旧值；切换型号后录入字段正确，真实新增成功 |
| 模板/导入 | 下载服务端真实模板，生成CSV，真实preview/commit成功导入1台 |
| CSV、rows、打印 | 逐行投影没有撤回字段和 archive-* 旧值；混合型号专属字段正确分离 |
| 恢复 | 上游恢复不自动重新选择孙类；孙类显式选择后旧值恢复有效 |
| 唯一/搜索 | 占用冲突阻止恢复；解除占用后恢复成功。普通退休历史可搜索，字段撤回后当前和历史值都退出搜索 |
| 必填/计算 | 存量缺值可读，缺值新建及编辑422；配置合法依赖后继承计算字段重算为 keep-one-computed |
| 最终对帐 | 最后再次撤回后 `nexus verify`：4 asset(s) reconcile with schema, transfer history, unique and search values |

打印仅**外部服务使用本地可控 stub**，真实 nexus `/print` 构造并发送投影，捕获出站 HTTP 后断言；不代表实体打印机出纸。全量失败回滚快照、计算冲突及确定性竞争仍以后端专项自动化测试为证，不把此浏览器演练夸大为所有故障的人工复现。

### 真实生产首屏量测

固定定义：navigation origin → 主要类别字段内容可见、编辑按钮启用 → 真实点击后编辑弹窗名称输入可见。随后观察至少5秒主线程/网络静默；静默观察期不加入交互时间。**这是业务可交互指标，不是 Lighthouse 标准 TTI**。

环境：AMD Ryzen 9 6900HX、16逻辑核、29GiB内存，Linux 7.0.10+deb14-amd64，Chromium 153.0.8010.12，1440×900，localhost真实后端，无CPU/网络限速。每次清空并禁用HTTP缓存，同一浏览器进程，不是五次进程冷启动。

| 样本 | 主要内容可见且编辑启用（ms） | 点击后编辑弹窗可见（ms，自导航起） | 后续静默窗口（ms） |
|---|---:|---:|---:|
| 1 | 364 | 451 | 5102 |
| 2 | 157 | 217 | 5102 |
| 3 | 148 | 214 | 5102 |
| 4 | 156 | 226 | 5102 |
| 5 | 152 | 228 | 5102 |

成功编辑指标中位数 **226ms**，p95（nearest-rank）及最大值 **451ms**，五次均小于1.5s。第一轮导航后108.1ms开始有84ms Long Task，在可交互观测前结束；其余样本无Long Task。五次后续静默窗口均无Long Task，HTTP并发峰值0。这完成本地网络、上述固定业务定义的首屏验收，不是目标部署环境性能保证，也不声称所有页面都已量测。

无凭据证据已入本目录：`evidence/real-browser-performance.json`、`evidence/withdraw-confirm.png`、`evidence/list-effective.png`；执行代理与主会话均已实际查看两张截图。详细临时证据在 `/tmp/031-real-e2e/`，包含browser/consumers/new-form日志、模板、导入结果、CSV/rows、打印捕获、perf与最终verify日志。

首次脚本运行存在选择器及删除请求体适配失败；首次计算字段因输入未设必填被正确422拒绝。修正脚本或夹具后完成验收，未改生产代码；`recovery.log`、`conflict.log`保留的是首次失败，不能把它们列作成功日志。修正后成功结果由执行代理的Bash工具返回及补充报告核对：将 Keep field 设为必填后从计算字段创建阶段继续，计算值及再次撤回断言exit0；DELETE补齐confirm后删除竞争资产、恢复唯一旧值断言exit0；另一次执行验证撤回前历史搜索total=1、撤回后历史/当前值搜索total=0，以及存量必填编辑422。前置恢复断言已在首次脚本失败点之前通过，因此这是连续阶段验收，不是两份完整脚本从头一次全绿。最终verify日志独立记录20:54:22的成功结果。

临时脚本依赖本次夹具，不作为可重复通用测试入库。后端、打印stub、浏览器、一次性凭据及临时数据库已清理。本轮未增加自动测试数量。主会话最终只检查路径及socket元数据，确认credentials/token/browser-state和DB/WAL/SHM均不存在，18231/18232无监听，未读取这些敏感文件。

## 最后整套复跑

主会话进入web目录执行tsc、eslint、Vitest（固定maxWorkers=4），全部退出0；65文件569测试，51.41s。另重建生产产物，5.09s，入口仍为index-CgcbNgan.js，gzip215.36KB。日志 `/tmp/031-complete-web-tsc.log`、`/tmp/031-complete-web-eslint.log`、`/tmp/031-complete-web-tests.log`、`/tmp/031-complete-web-build.log`。此前从根目录运行eslint未找到配置的exit2属于命令目录错误，随后正确目录整套复跑通过；没有通过改配置掩盖错误。既有警告不变。
