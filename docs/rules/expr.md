# 表达式引擎

改 `internal/compute` 之前读这一份。

- **表达式引擎是 expr-lang/expr，不是 `text/template`**（011 起）。
  `hex2dec(attrs.mac)`、`attrs.mac | hex2dec() | pad(16)`、`a == b ? x : y`、`??` 都可用。
  **管道把左值传成第一个参数**，与旧引擎相反 —— 自定义函数的签名都是「主语在前」。
  `internal/compute/translate.go` 保留着旧语法的转换器，供从旧备份恢复的人使用。

- **`internal/compute` 的 AST 护栏不是加固，是前提。** 旧语法的贫乏白送了三样东西，
  新语法把它们拿走了：非常量下标（会让「读了哪些字段」无法回答）、遍历构造、
  未定义的名字（会静默变成空值拼进编号）。三者都在 `parse.go` 的 `guard` 里拒绝。
  **动这个文件前先读 `docs/guides/research-expr-engine.md`。**
