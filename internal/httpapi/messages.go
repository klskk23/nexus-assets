package httpapi

// User-facing text lives here, not scattered through the handlers.
//
// Constitution principle V: identifiers, comments, logs and error codes are
// English; anything a person reads on screen is Chinese. Keeping the Chinese in
// one file is what makes that rule checkable.
const (
	MsgValidationFailed  = "保存失败，请检查标注的字段"
	MsgVersionConflict   = "他人已修改这条记录，请刷新后重试"
	MsgNotFound          = "找不到该记录"
	MsgInternal          = "服务器内部错误"
	MsgUnauthenticated   = "登录状态已失效，请重新登录"
	MsgBadRequest        = "请求格式不正确"
	MsgLoginFailed       = "邮箱或密码不正确"
	MsgAccountDisabled   = "该账号已被停用"
	MsgDomainNotAllowed  = "该邮箱域名不在允许范围内"
	MsgSNMismatch        = "输入的编号与该资产不符"
	MsgOIDCDisabled      = "本系统未启用 Google 登录"
	MsgOIDCStateMismatch = "登录请求已过期，请重新发起"
)
