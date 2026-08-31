# Feature Specification: 表达式引擎

**Branch**: `001-asset-ledger-demo` 　**Created**: 2026-08-31 　**Status**: Draft

**Input**: "调查一下公式引擎替换为 expr-lang/expr 的可行性，这样可以支持更多表达式" →
调研结论见 [`docs/research-expr-engine.md`](../../docs/research-expr-engine.md) →
"立即做，并为其添加一个帮助按钮，点击后侧边弹出 Drawer，简单介绍下基本使用方法。同样要支持双语"

> 本规格实施调研报告的建议，**按报告给的顺序**：先建护栏，再接引擎。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 写得出真正的编号规则 (Priority: P1)

「型号是备件时前缀用 S，否则用 M」—— 一条最普通的编号规则，旧语法写不出来。

**Acceptance Scenarios**:

1. **Given** 表达式 `attrs.kind == "spare" ? "S" : "M"`，**Then** 接受并按条件产出
2. **Given** `attrs.sn ?? hex2dec(attrs.mac)`，**Then** 有 sn 用 sn，没有则推导
3. **Given** `category.code + "-" + str(attrs.seq)`，**Then** 拼接成功
4. **Given** 管道 `attrs.mac | hex2dec() | pad(16)`，**Then** 等同于 `pad(hex2dec(attrs.mac), 16)`
5. **Given** 语法错误，**Then** 提示带出错位置

### User Story 2 - 分析不会说谎 (Priority: P1)

「这条规则读了哪些字段」是环检测、绑定门禁与「被引用则拒绝删除」三条护栏的共同前提。

**Acceptance Scenarios**:

1. **Given** 任意表达式，**Then** 能列出它读的全部字段，穿过管道、嵌套调用、条件与 `??`
2. **Given** `attrs[attrs.which]`，**Then** 拒绝 —— 没有分析能提前知道它读了什么
3. **Given** `map(...)`、`filter(...)`，**Then** 拒绝 —— 编号规则不做遍历
4. **Given** 未定义的名字，**Then** 拒绝，而不是当作空值
5. **Given** 不在白名单的函数，**Then** 拒绝并列出可用的

### User Story 3 - 空值不会混进编号 (Priority: P1)

**Acceptance Scenarios**:

1. **Given** 表达式读了一个没有值的字段，**Then** 拒绝写入，而不是产出含「空」的编号
2. **Given** 结果为空字符串，**Then** 拒绝

### User Story 4 - 存量规则自动迁移 (Priority: P2)

**Acceptance Scenarios**:

1. **Given** 旧库启动，**Then** 存量规则自动转换为新语法，日志逐条列出
2. **Given** 转换后，**Then** 每台存量资产的编号一字不变
3. **Given** 无法精确转换的规则，**Then** 保持原样并在日志中点名，不猜
4. **Given** 再次启动，**Then** 转换不重复执行

### User Story 5 - 边写边查 (Priority: P2)

**Acceptance Scenarios**:

1. **Given** 表达式输入框旁，**Then** 有帮助按钮
2. **Given** 点击，**Then** 侧边弹出说明：能读什么、例子、管道、函数、运算符、两条规矩
3. **Given** 切换语言，**Then** 说明随之切换，英文面板中不含中文
4. **Given** 说明打开时，**Then** 输入框仍然可见 —— 它是边写边查的东西

## Requirements *(mandatory)*

- **FR-001**: 表达式 MUST 支持条件、空值合并、比较、拼接、算术、正则与管道。
- **FR-002**: 引用分析 MUST 穿透全部构造；三条既有护栏 MUST 继续建立在它上面。
- **FR-003**: 非常量下标 MUST 拒绝。
- **FR-004**: 遍历构造 MUST 拒绝。
- **FR-005**: 未定义的名字与白名单外的函数 MUST 拒绝，MUST NOT 解析为空值。
- **FR-006**: 求值结果为空或含无值字段 MUST 拒绝写入。
- **FR-007**: 存量规则 MUST 在升级时自动转换；无法精确转换的 MUST 保留原样并点名。
- **FR-008**: 转换 MUST 只执行一次。
- **FR-009**: 全部消息 MUST 有中英两版（第三方库自身的语法错误除外，MUST 包在可翻译的句子里）。
- **FR-010**: 表达式输入处 MUST 提供帮助抽屉，双语。

## Success Criteria *(mandatory)*

- **SC-001**: 旧库升级后编号一字不变，`nexus verify` 全绿。
- **SC-002**: 三条护栏各有测试，且拒绝理由可操作。
- **SC-003**: 帮助抽屉在两种语言下都完整。
- **SC-004**: 入口 chunk 的 gzip 体积仍远低于 500KB 门禁。

## Assumptions

- **不保留双引擎。** 两套语法会让每条错误信息、每份文档与每个「这字段用哪种写法」都分叉。
- **`printf` 不迁移。** 它的格式串语义在新语言里没有对应；用到它的规则由转换器点名，人工改写。
- **第三方语法错误保持英文。** expr 的报错带列号与下划线，价值在于精确定位；
  包一层可翻译的句子已经说明了「这是语法问题」。
