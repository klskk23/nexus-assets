# 数据模型：本轮无变化

服务端零改动，数据库零改动，合约零改动。界面上出现的每一个数据都来自既有端点：

| 原型里的数据 | 来源 | 已有 |
|---|---|---|
| 账号「登录方式」（Google 单点登录 / 本地密码） | `GET /users` → `auth_type` | ✅ |
| 角色「账号数」 | `GET /roles` → `user_count` | ✅ |
| 状态「N 台设备・历史 M 条」 | `GET /status-usage` → `{assets, children, history}` | ✅ |
| 概览三张分布卡 | `GET /overview` | ✅（028 加的负责人分布） |
| 型号默认值表 | `GET /models` → `attr_defaults` | ✅ |

唯一新增的**客户端状态**：

- **导航折叠**：`localStorage["nexus.nav.collapsed"]` = `"1"` / 缺省。每人每浏览器一份，
  与列选择（`useColumns` 的 `STORAGE_KEY`）同一归属，不进账号。读写都包在 `try/catch`
  里（隐私模式下 `localStorage` 会抛），读不到就是展开。

`users.theme` 这一列在服务端仍在，前端继续一行不读（决策 216 沿用 017 的处置）。
