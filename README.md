# nexus-assets

*English: [`README.en.md`](./README.en.md)*

内部固定资产台账：设备、类别与字段、状态与流转、导入导出、变更审计。
配上 [zenith-printer](./docs/zenith-printer.md) 之后，还能勾几台设备一键打标签。

**整个部署物就是一个文件**：Go 静态二进制，前端和数据库迁移都编译在里面，
数据是同目录下的一个 SQLite 文件。没有 Redis、没有第二个进程、不需要外部数据库。

## 跑起来

### 方式一：Docker Compose（推荐）

```bash
cd deploy
cp ../.env.example .env && chmod 600 .env   # 至少填 NEXUS_JWT_SECRET
docker compose up -d
```

打开 <http://localhost:8080>。镜像同时提供 amd64 与 arm64，
`docker pull ghcr.io/klskk23/nexus-assets:latest` 会自动取对的那个。

数据在 `deploy/data/`（宿主机目录，不是具名卷）。换机器就是 `rsync -a data/`。
正式安装把它指到别处：

```bash
NEXUS_DATA=/srv/nexus-assets/data docker compose up -d
```

> **SQLite 必须放本地文件系统。** NFS/SMB 的锁不可靠，会损坏数据库而不是拒绝工作。

### 方式二：单文件

下载或自己编译，两条路都得到同一个东西。

```bash
# 下载（发布页有 linux amd64 / arm64）
curl -fLO https://github.com/klskk23/nexus-assets/releases/latest/download/nexus_linux_amd64
chmod +x nexus_linux_amd64

# 或者自己编译：先前端，再 Go —— 前端是 embed 进二进制的，顺序不能反
make build     # 等价于 cd web && npm ci && npm run build，然后 CGO_ENABLED=0 go build
```

跑起来：

```bash
export NEXUS_JWT_SECRET="$(openssl rand -base64 36)"
export NEXUS_ADMIN_EMAIL=you@yourcompany.com
export NEXUS_ADMIN_PASSWORD='第一次启动用来创建管理员'
export NEXUS_ALLOWED_EMAIL_DOMAINS=yourcompany.com
./nexus
```

装成常驻服务（`/etc/systemd/system/nexus-assets.service`）：

```ini
[Unit]
Description=nexus-assets
After=network.target

[Service]
User=nexus
WorkingDirectory=/srv/nexus-assets
EnvironmentFile=/srv/nexus-assets/.env
Environment=NEXUS_DB_PATH=/srv/nexus-assets/nexus.db
ExecStart=/srv/nexus-assets/nexus
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo chmod 600 /srv/nexus-assets/.env      # 里面有签名密钥
sudo systemctl enable --now nexus-assets
```

升级＝换掉那个文件再 `systemctl restart`。迁移在启动时自己跑完。

### 方式三：本地开发

```bash
make dev       # 首次会从 .env.example 生成 .env
cd web && npm run dev    # 另开一个终端，前端热更新
```

## 必须配的四项

| 变量 | 说明 |
| --- | --- |
| `NEXUS_JWT_SECRET` | 会话签名密钥。**没有它进程拒绝启动** —— 自动生成的密钥会在每次重启时把所有人登出，而且要一小时才查得出来 |
| `NEXUS_ADMIN_EMAIL` / `NEXUS_ADMIN_PASSWORD` | 第一次启动时创建的管理员；账号存在之后这两项不再有作用 |
| `NEXUS_ALLOWED_EMAIL_DOMAINS` | 允许登录的邮箱域名。**这是 v1 唯一的准入边界**，进得来的人能做任何事 |

其余（数据库路径、监听地址、Google 登录、打印服务、API 密钥）都在
[`.env.example`](./.env.example) 里，每一项都有说明。

`.env` **不进版本库**（`.gitignore` 已经挡住），也不进镜像层。

## 放到反向代理后面

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

用 Google 登录时，`NEXUS_OIDC_REDIRECT_URL` 必须是**对外**那个地址
（`https://台账域名/api/auth/oidc/callback`），并且与 Google Cloud 控制台里
登记的完全一致 —— 差一个斜杠都不行。

## 备份

一个文件，热备不用停服务：

```bash
sqlite3 nexus.db "VACUUM INTO '/backup/nexus-$(date +%F).db'"
```

别直接 `cp` 正在跑的库：`-wal` 里可能还有没合并的事务。

## 健康检查

`GET /api/health` 不需要凭证，答的是「这个进程还能不能读到自己的数据库」，
而不是「端口通不通」—— 后者是卡死的部署也能通过的那种检查。
容器里的检查就是二进制自己：`nexus healthcheck`。

## 开发

```bash
make gates     # lint + 测试 + 对账，合并前必须全绿
make test
make lint
```

- 项目约定与最容易违反的硬规则：[`CLAUDE.md`](./CLAUDE.md)
- 设计基线与历次决策：[`docs/`](./docs)
- 规格与 API 契约：[`specs/`](./specs)（`001-.../contracts/openapi.yaml` 是全量端点清单）
- 对接标签打印：[`docs/zenith-printer.md`](./docs/zenith-printer.md)
