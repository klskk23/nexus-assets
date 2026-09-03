-- 角色：一组权限开关，用户绑一个。
--
-- `users.role` 那一列从 001 起就在（默认 'admin'，注释写着 reserved），但从来
-- 没有被读过。这里不动它，也不删它 —— 删一列没人读的东西是另一件事，混在权限
-- 上线这一轮里做，出问题时说不清是哪一件引起的。
--
-- is_admin 不是「所有开关都勾上」，而是「全部权限，包括以后新增的」。下一轮加第
-- 十九个开关时，勾选式的管理员会悄悄少一样权限，除非每次都记得写迁移打开它；
-- 漏一次没人会想到去查角色表。

-- +goose Up
-- +goose StatementBegin
CREATE TABLE roles (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  is_admin    INTEGER NOT NULL DEFAULT 0,
  permissions TEXT NOT NULL DEFAULT '[]',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

ALTER TABLE users ADD COLUMN role_id TEXT REFERENCES roles(id);

INSERT INTO roles (id, name, is_admin, permissions, created_at, updated_at) VALUES
  ('role-admin', '管理员', 1, '[]',
   strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  -- 预设的普通用户：日常做得完事，但改不了系统的定义，也删不掉东西。
  -- 这一行可以被编辑，它只是个起点。
  ('role-user', '普通用户', 0,
   '["asset.create","asset.update","transfer.create","print","import","export","holder.create"]',
   strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- 存量用户全部是管理员：上线那一刻没有人的能力发生变化。收权是之后由管理员
-- 逐个做的另一件事 —— 升级和收权分开，出问题时知道是哪一件引起的。
UPDATE users SET role_id = 'role-admin' WHERE role_id IS NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE users DROP COLUMN role_id;
DROP TABLE roles;
-- +goose StatementEnd
