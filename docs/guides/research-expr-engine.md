# 调研：把公式引擎换成 expr-lang/expr

**日期**：2026-08-31 　**状态**：调研结论，**尚未实施**
**结论**：**可行，建议做**，但有三条现有引擎白送、换过去要自己重建的护栏。

本文的判断都来自一个跑起来的原型（`expr v1.17.8`），不是读文档得出的。

---

## 1. 现状

`internal/compute` 用 `text/template`，约 700 行（含测试）：

| 文件 | 职责 |
| --- | --- |
| `parse.go` | 编译 + 拒绝 `if`/`range`/`with`/`template` |
| `deps.go` | 从语法树提取引用（`attrs.mac`、`category.code`） |
| `dag.go` | 拓扑排序 + 环检测 |
| `eval.go` | 求值，拒绝空串与 `<no value>` |
| `funcs.go` | 11 个白名单函数 |

**`deps.go` 是整个系统的支柱**，不只是公式的一部分。三处护栏建在它上面：

- 表达式键之间的环检测（`dag.go`）
- 绑定门禁：表达式键的依赖必须已绑定且标为必填（`schema/binding.go`）
- 「被引用则拒绝」：删除或解绑一个被表达式读取的字段会被拒绝（`schema/refcheck.go`）

换引擎必须先回答：**新引擎能不能同样可靠地回答「这条公式读了哪些字段」**。

实际使用的模板形态（全库扫描）都很简单：

```
{{ .attrs.mac }}                      {{ .id }}
{{ .attrs.mac | hex2dec }}            {{ .category.code }}
{{ .attrs.mac | hex2dec | pad 16 }}   {{ .attrs.firmware | upper }}
```

---

## 2. 引用提取：可行

`parser.Parse` 拿到 AST，`ast.Walk` + 一个 Visitor 就能收集成员链。实测：

| 表达式 | 提取到 |
| --- | --- |
| `hex2dec(attrs.mac)` | `attrs.mac` |
| `attrs.mac \| hex2dec()` | `attrs.mac` |
| `category.code + "-" + pad(attrs.seq, 4)` | `attrs.seq`, `category.code` |
| `upper(trim(attrs.mac))` | `attrs.mac` |
| `attrs.mac ?? "unknown"` | `attrs.mac` |
| `len(attrs.mac) > 4 ? upper(attrs.mac) : "short"` | `attrs.mac` |

管道、嵌套调用、三元、空值合并都能穿透。**这一条成立，其余才值得谈。**

两个实现注意点，原型第一版都踩了：

- `id` 是裸 `IdentifierNode`，不是 `MemberNode`。只遍历成员节点会漏掉它。
- 一条链会产生多个前缀（`attrs`、`attrs.b`、`attrs.b.c`），要只保留最长的。

---

## 3. 三条必须自己重建的护栏

这是本次调研的**主要发现**。`text/template` 的贫乏语法白送了三样东西，
换到一门真正的表达式语言就得自己造。

### 3.1 动态下标会让静态分析说谎

```
attrs[attrs.which]     // 读了哪个字段？没有任何静态分析答得出
```

`text/template` 根本无法表达这种写法。expr 可以。一旦允许，
「被引用则拒绝删除」的护栏就有了一个洞：一个字段明明被读着，
分析却看不见，于是允许删除，删完公式在下一次求值时才炸。

**处置**：AST 检查里拒绝非常量下标。实测可行 ——
`attrs["mac"]` 的 Property 是 `StringNode`，`attrs[attrs.which]` 不是。

### 3.2 缺失的字段会被静默拼进编号

```go
category.code + "-" + string(attrs.missing)   // => "RT-<nil>"，无错误
```

现有实现有一条专门的检查：输出含 `<no value>` 就拒绝。
expr 下 `attrs.missing` 是合法的 `nil`，拼接后成为字符串的一部分 ——
**一个写着 `<nil>` 的资产编号会被写进数据库，而且是唯一索引的那一列。**

**处置**：求值后检查 `nil` 与 `<nil>` 子串，与现在拒绝 `<no value>` 同一条路子。
或者用 struct env 换取编译期类型检查 —— 但 `attrs` 的键是运行时配置的，做不到。

### 3.3 集合运算与谓词

`expr.DisableAllBuiltins()` **挡不住语言构造**：`1..1000000`、`map(...)`、
`filter(...)` 是语法而非 builtin。实测 `map(1..2000, {map(1..2000, {#})})`
编译通过，运行时才被 expr 自带的 memory budget 拦下（`memory budget exceeded`）。

好消息是那道 budget 真的存在且有效；`sum(1..10000000)` 也是秒回，不构成 DoS。
但**编号规则用不到集合运算**，放着只是扩大攻击面与出错面。

**处置**：AST 检查里拒绝 `PredicateNode`（`{...}` 闭包），并对 `BuiltinNode`
走白名单。实测 `map`/`filter`/`sum` 被拒，`len`/`string` 按需放行。

---

## 4. 换过去能得到什么

现有语法只能做「取一个字段，穿过几个函数」。expr 直接带来：

| 能力 | 例子 |
| --- | --- |
| 拼接与算术 | `category.code + "-" + string(attrs.seq * 10)` |
| 条件 | `attrs.kind == "spare" ? "S" : "M"` + `hex2dec(attrs.mac)` |
| 空值兜底 | `attrs.sn ?? hex2dec(attrs.mac)` |
| 比较与包含 | `attrs.vendor in ["Acme", "Beta"]` |
| 正则 | `attrs.mac matches "^[0-9A-F]{12}$"` |
| 内建字符串函数 | `trim`、`upper`、`split`、`replace`、`hasPrefix` … |

**错误信息也更好**：expr 带列号与出错位置的下划线，
`text/template` 的报错要靠 `unwrapExecError` 剥壳才能读。

```
hex2dec: "ZZ" is not hexadecimal (1:1)
 | hex2dec("ZZ")
 | ^
```

现有 11 个自定义函数原样注入即可（`expr.Function`），管道语法从
`{{ x | f }}` 变成 `x | f()`，读起来更自然。

---

## 5. 存量数据的迁移

`field_definitions.options.template` 里存的是旧语法。切换后全部失效。

单表达式模板可以**机械转换**（实测通过）：

| 旧 | 新 |
| --- | --- |
| `{{ .attrs.mac }}` | `attrs.mac` |
| `{{ .attrs.mac \| hex2dec }}` | `hex2dec(attrs.mac)` |
| `{{ .attrs.mac \| hex2dec \| pad 16 }}` | `pad(hex2dec(attrs.mac), 16)` |
| `{{ .id }}` | `id` |

**多段拼接需要人看一眼**：`{{ .category.code }}-{{ .attrs.seq }}`
要变成 `category.code + "-" + string(attrs.seq)` —— 分隔符成为表达式的一部分，
非字符串还要显式转换。全库扫下来这类模板只有一种形态，但**迁移脚本必须在
转换后重新求值并比对每台存量资产的编号**，因为编号是唯一索引，
悄悄变一个字符就会在下一次保存时撞车。

`Recompute` 那套机制（预览 → 冲突检查 → 应用）正好可以复用来做这件事。

---

## 6. 工作量

| 部分 | 规模 |
| --- | --- |
| `internal/compute` 重写（`dag.go` 可原样保留） | 约 400 行 |
| AST 白名单与三条护栏 | 约 120 行 + 测试 |
| `schema/refcheck.go`、`schema/deps.go`、`asset/pipeline.go` 的接入点 | 各改一处 |
| 模板迁移（迁移脚本 + 转换 + 重算比对） | 约 150 行 |
| 前端的语法提示文案（两种语言） | 2 处 |
| 测试 | 现有 `compute` 测试全部重写，约 250 行 |

一个中等特性的量，**其中一半是护栏与迁移，不是引擎本身**。

---

## 7. 建议

**建议做**，理由是现有语法的天花板明显：它甚至无法表达
「型号是 X 时前缀用 S，否则用 M」这种最普通的编号规则，
而这正是这个系统的核心用途。

**但要按这个顺序**，因为前两步是不可省的：

1. 先写 AST 白名单与三条护栏（含测试），**再**接进现有流程 ——
   护栏是这次改动的主体，不是收尾工作
2. 引用提取的测试要覆盖 `id`、多级链、动态下标拒绝这三类
3. 迁移脚本必须经过 `Recompute` 的比对，确认每台存量资产的编号不变
4. 灰度不必要 —— 这是单机内部系统，一次切干净比双引擎并存更容易讲清楚

**不建议**保留双引擎。两套语法意味着每条错误信息、每份文档、
每个「这个字段用的是哪种写法」都要分叉，代价远超过一次性迁移。

---

## 附：原型

`/tmp/.../scratchpad/exprprobe`，含引用提取、护栏检查与资源实测。
本文的每个表格都出自它的输出。
