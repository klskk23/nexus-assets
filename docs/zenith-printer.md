# 对接 zenith-printer

*English: [`zenith-printer.en.md`](./zenith-printer.en.md)*

打标签这件事不在本系统里做。nexus-assets 记录设备，zenith-printer 设计标签、
连打印机、管作业；两个产品各自能独立跑，配上对方之后才出现「勾几台设备、一键打印」。

这份文档只讲**怎么把两边接起来、接起来之后怎么用**。标签长什么样、用哪台机器、
纸多大、序号池怎么走，全部是 zenith 那边的事，本文不重复。

## 一、两边各配什么

**nexus 这边**（`.env`）：

```sh
ZENITH_PRINTER_SERVICE_URL=http://127.0.0.1:3000
```

不配这一项，界面上**不会出现任何与打印有关的东西** —— 没有打印机的安装本来就该长这样。
配上之后，资产页出现「打印标签」，类别编辑对话框里出现「打印预设」。

**zenith 那边**（它的 `.env`）：

```sh
NEXUS_ASSETS_SERVICE_URL=http://127.0.0.1:8080
NEXUS_ASSETS_SERVICE_API_KEY=nxk_xxxxxxxxxxxx.yyyyyyyy
```

密钥在 nexus 的「设置 → API 密钥」里新建，**明文只显示一次**；它等同于创建它的账号，
没有第二套权限模型。也可以用配置文件里的管理员密钥（`NEXUS_ADMIN_API_KEY`）。
密钥只存在 zenith 的配置文件里，不落它的数据库、不会被它回显。

两个地址互相可达即可，不需要同机。**注意方向**：nexus 主动调 zenith 打印，
zenith 主动调 nexus 取数据 —— 两条路都要通。

## 二、接起来之后的数据流

```
        取行数据（zenith → nexus）
zenith  ──  GET /api/categories        选哪个类别
        ──  GET /api/rows?category_id= 该类别的表格数据

        送去打印（nexus → zenith）
nexus   ──  GET  /api/print-presets            有哪些标签
        ──  POST /api/print-presets/{id}/print 打这一批
        ──  GET  /api/print-jobs/{id}          打完了没有
```

浏览器**不直接问 zenith** —— 它不发 CORS 头。预设清单与作业状态都由 nexus 转发，
对应 `GET /api/print/presets` 与 `GET /api/print/jobs/:id`。

`GET /api/rows` 是给外部消费的表格视图，与 `export.csv` 是同一份数据的两种形态：

- **列名用字段键**，不用显示名 —— 显示名改了不该让对面的模板失效；
- 内建列加 `sys_` 前缀让路，因为字段键是类别自己的词汇，今天就有一个字段叫 `sn`；
- 行的身份是 `sys_id`，zenith 按它合并刷新，所以刷新前勾的行刷新后还是同一批设备；
- 内建列一共十个：`sys_id`、`sys_sn`、`sys_category`、`sys_status`、`sys_holder`、
  `sys_owner`、`sys_model`、`sys_vendor`、`sys_note`、`sys_created_at`；
- **必须指定类别**，理由同上：字段键只在一个类别的子树内唯一；
- 015 起字段还可以绑到**型号**而不是类别，这类字段同样会作为该类别的一列出现，
  不属于该型号的设备那一行留空——是**加列**不是改列，按列名取值不会因此报错。

## 三、在 zenith 里接一个数据源

zenith 的「数据源 → 新建」里选 **NEXUS**，然后从下拉框里选一个类别就完了 ——
地址与密钥它自己从配置文件读，不用在界面上填第二遍。

## 四、类别与标签预设

**标签绑在类别上。** 在 nexus 的类别编辑对话框里勾选这个类别能用哪些预设，
存成 `print_preset_ids` 列表。

**一个类别可以有多种标签**（编号标签、位置标签……）。打印时：

- 只有一种：不问，直接用；
- 有多种：在打印对话框里选；
- 有多种而没选：后端**拒绝这一批**，不替人猜。

预设本身（模板、打印机、纸型、份数）都在 zenith 那边定义，nexus 只存 id。

## 五、打印的两个入口与确认

入口有两个：资产页**勾选后的操作栏**（打选中的那些），以及**行右键菜单**
（打这一台，不必先勾）。

**出纸前一定有一次确认**，因为纸真的会从另一个房间的机器里出来：

1. 对话框打开时先发一次 `dry_run` 试算，把分批（**一次打印 = 一个类别**）、
   **待打设备的编号**、用哪种标签、哪个类别根本不能打，都摆在眼前；
2. 第二次按下才真的花纸；
3. 确认后按钮消失，同一个对话框打不出两遍。

送出后 nexus 轮询作业状态直到完成或失败。zenith 序号池被这次作业消耗掉的号段
（`seqClaims`）会显示出来 —— 号是在对面分配的，不说就等于两套编号各走各的。

失败时对话框里的链接指向 zenith 的 `/queue`，卡住的作业在那里放行。

## 六、跳过去手动打印

打印对话框里，标签名本身是一个链接，指向

```
{ZENITH_PRINTER_SERVICE_URL}/design/{templateId}?preset={presetId}
```

`templateId` 由 `GET /api/print-presets` 返回。这条链接今天能打开**对应的模板**；
`?preset=` 是给 zenith 用来把**打印机与打印参数**也一并摆好的，
zenith 认了这个参数才生效（截至本文写作时尚未实现，链接不会因此出错）。
类别对话框里另有一个链接指向 `/print-presets`，那是管理标签的地方。

**点这条链接会先让 zenith 重新读一遍这个类别。** 设计器画的是 zenith
自己那份行拷贝，只有有人在那边按过刷新才是新的 —— 不刷的话，你跳过去核对的那台设备
显示的是昨天的持有方，而两边屏幕上都没有一句话解释为什么。

调用链是 `POST /api/print/refresh-source {"category_id"}` →
`GET {zenith}/api/data-sources` 找出 `sourceKind=nexus` 且 `nexus.categoryId` 对得上的表
→ 对每一张 `POST {zenith}/api/data-sources/{id}/refresh`。三件事要知道：

- **绑到同一个类别的表格全刷**，一个类别可以有多张（两种标签要不同的列）；
- **一张都没连不是错误**，打印对话框会照实说「那边看到的仍是它自己的表格」；
- **列集变了时 zenith 回 `needsConfirmation` 而不刷新**，nexus 不带
  `confirmColumnChange` 过去 —— 那意味着类别的字段动了，按列名取值的标签可能当场失效，
  这个头要有人在 zenith 那边点。

刷新是在浏览器打开新标签页的同时发出的，不挡着跳转（挡一下再 `window.open` 会被拦成弹窗）。
另外 zenith 自己还有两条路会刷新：数据源上的定时刷新，以及作业提交前刷新
（`refreshBeforePrint`）—— 这一条补的是**人跳过去看**的那条路。

## 七、不通的时候先看哪里

| 现象 | 多半是 |
| --- | --- |
| 界面上完全没有打印相关的东西 | nexus 没配 `ZENITH_PRINTER_SERVICE_URL` |
| 打印按钮在，但预设下拉是空的 | 地址配了但对面没起，或该类别还没勾预设 |
| zenith 刷新数据源报 `NEXUS_UNAUTHORISED` | 密钥被删或写错；重新建一把 |
| zenith 报 `NEXUS_BAD_REQUEST` | 请求没带类别 —— `/api/rows` 必须指定类别 |
| 某一批有 `error` 而没有 `job_id` | 这一批没送出去（没配预设 / 多种标签没选 / 对面拒绝），其余批次照常提交 |
| 打了两遍 | 界面确认后按钮就消失了，同一个对话框打不出两遍；脚本调用要自己带 `Idempotency-Key` 头（nexus 按 `键:类别id` 逐批转给 zenith），重复提交返回同一个作业。不带则每次提交都是新作业 |

相关约定另见 `CLAUDE.md`（打印那一条）与 `specs/001-asset-ledger-demo/contracts/openapi.yaml`
里的 `/print`、`/print/presets`、`/print/jobs/{id}`、`/rows`。
