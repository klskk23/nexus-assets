# UI 合约：token 与不变量

这一轮没有 API 合约要改。这里写的是**设计与代码之间的合约**：哪些值必须一字不差，
哪些东西必须为零。`web/tests/nocturne.test.ts` 就是它的可执行形式。

## 1. 语义 token（`web/src/index.css` `:root`）

| 槽位 | 值 | 来源 |
|---|---|---|
| `--background` | `#161826` | Nocturne `--color-bg` |
| `--foreground` | `#e9e9ed` | `--color-text` |
| `--card` / `--card-foreground` | `#232532` / `#e9e9ed` | `--color-surface` |
| `--popover` / `--popover-foreground` | `#232532` / `#e9e9ed` | `--color-surface` |
| `--primary` | `#9184d9` | `--color-accent` |
| `--primary-foreground` | `#161826` | `--color-bg` |
| `--secondary` / `--secondary-foreground` | `color-mix(in srgb, #e9e9ed 7%, transparent)` / `#e9e9ed` | `.btn-secondary:hover` |
| `--muted` / `--muted-foreground` | `#292b31` / `#b2b6ca` | neutral-900 / neutral-400 |
| `--accent` / `--accent-foreground` | `color-mix(in srgb, #e9e9ed 6%, transparent)` / `#e9e9ed` | 导航悬停 |
| `--selected` / `--selected-foreground` | `color-mix(in srgb, #9184d9 12%, transparent)` / `#e7e5fe` | 导航激活 / accent-200 |
| `--destructive` / `--destructive-line` | `oklch(0.72 0.12 20)` / `oklch(0.64 0.16 20)` | 交接文档 |
| `--border` / `--input` | `color-mix(in srgb, #e9e9ed 16%, transparent)` | `--color-divider` |
| `--border-muted` | `color-mix(in srgb, #e9e9ed 8%, transparent)` | 表格行线 |
| `--ring` | `#9184d9` | `:focus-visible` |
| `--well` | `#161826` | 事实 `dl` / `code` 底 |
| `--accent-2` | `#9397ab` | neutral-500（数量） |
| `--radius-sm` / `-md` / `-lg` | `4px` / `8px` / `14px` | Nocturne |
| `--shadow-sm` | `0 0 0 1px #3f424d` | Nocturne |
| `--shadow-md` | `0 0 0 1px #595d6c, 0 6px 18px rgba(0,0,0,.55)` | Nocturne |
| `--shadow-lg` | `0 0 0 1px #9397ab, 0 16px 40px rgba(0,0,0,.65)` | Nocturne |

**必须不存在**：`--primary-hover`、`--radius-2xl`、`--radius-xl`（Organic 专有）。

## 2. 色阶（`@theme inline`，暴露为 Tailwind 类）

`--color-neutral-100…900` = `#f3f5fe #e4e7f5 #cfd3e5 #b2b6ca #9397ab #75798c #595d6c #3f424d #292b31`
（**覆盖** Tailwind 内建 `neutral-*`）

`--color-accent-100…900` = `#f5f4ff #e7e5fe #d2cefd #b5abfc #968ae0 #796cbf #5d5294 #423a6a #2b2741`

## 3. 状态色（八组三值，`.status-*` 类，**逐字**）

| 槽位 | `--status-bg` | `--status-fg` | `--status-line`（= 交接文档的 `bar`） |
|---|---|---|---|
| slate | `oklch(0.34 0.02 260)` | `oklch(0.86 0.02 260)` | `oklch(0.62 0.03 260)` |
| green | `oklch(0.34 0.06 150)` | `oklch(0.88 0.10 150)` | `oklch(0.66 0.12 150)` |
| blue | `oklch(0.34 0.07 250)` | `oklch(0.88 0.08 250)` | `oklch(0.66 0.12 250)` |
| amber | `oklch(0.36 0.07 75)` | `oklch(0.90 0.12 80)` | `oklch(0.72 0.14 75)` |
| red | `oklch(0.34 0.08 20)` | `oklch(0.88 0.10 20)` | `oklch(0.64 0.16 20)` |
| violet | `oklch(0.34 0.08 300)` | `oklch(0.88 0.08 300)` | `oklch(0.66 0.13 300)` |
| teal | `oklch(0.34 0.05 190)` | `oklch(0.88 0.08 190)` | `oklch(0.66 0.10 190)` |
| rose | `oklch(0.34 0.07 350)` | `oklch(0.88 0.09 350)` | `oklch(0.66 0.14 350)` |

## 4. 字体

- `--font-sans` = `"Inter Variable", "Noto Sans SC", ui-sans-serif, system-ui, sans-serif`
- `--font-heading` = 同上（字重 500 在 `font-heading` 工具类里给）
- `--font-mono` = `ui-monospace, SFMono-Regular, Menlo, monospace`
- Noto Sans SC 引入 **400 / 500 / 700** 三个文件
- 根元素 `color-scheme: dark`

## 5. 零命中清单（`src/**`，除非另注）

| 模式 | 范围 | 例外 |
|---|---|---|
| `animate-in\|animate-out\|fade-in-\|fade-out-\|zoom-in-\|zoom-out-\|slide-in-\|slide-out-` | `src/**` | 无（`animate-spin` 不在此列） |
| `lucide-react` | `src/**`、`package.json` | 无 |
| `dark:`、`\.dark\b` | `src/**` | 无 |
| `tw-animate-css` | `index.css`、`package.json` | 无 |
| `#[0-9a-fA-F]{6}\b` | `src/routes/**`、`src/features/**` | 无（token 只在 `index.css`） |
| `googleapis\|gstatic` | `src/**`、`dist/**` | 无 |
| `Caprasimo\|Figtree` | `src/**`、`package.json` | 无 |
| `rounded-full` | `src/**` | `AppShell` 头像、`radio-group` 圆点、`spinner` |

## 6. 版面数字（决策 215：来自原型，有约束力）

白名单进 `contentColumn.test.ts`，每条引用 `design/handoff.md`：

| 文件 | 数字 | handoff 段落 |
|---|---|---|
| `routes/AppShell.tsx` | 导航 `216px` / 折叠 `60px`；内容区 `padding 26px 36px 64px 32px` | 全局壳 |
| `features/common/MasterDetail.tsx` | 左栏 `280px` | §5 类别 |
| `routes/Login.tsx` | 卡片区 `max-width 420px` | §1 登录 |
| `routes/AssetDetail.tsx` | `max-width 1100px` | §4 设备详情 |
| `features/common/ListToolbar.tsx` | 搜索框 `260px` | §3 资产列表 |
| `routes/Statuses.tsx` | 搜索框 `max-width 360px` | §8 状态 |
| `routes/Assets.tsx` | 备注列 `max-width 220px` | §3 资产列表 |
| `features/common/SearchSelect.tsx` | 面板上限 `min(24rem, 100vw − 2rem)` | 029（沿用） |
| 13 个弹窗 | 各自宽度 440–680 | 弹窗表 |
