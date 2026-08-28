/**
 * Every string a person reads lives here.
 *
 * Constitution principle V: identifiers, comments and error codes are English;
 * user-facing copy is Chinese. Keeping it in one file is what makes that rule
 * checkable rather than aspirational.
 */
export const zh = {
  appName: "Nexus Assets",

  nav: {
    assets: "资产",
    categories: "类别",
    fields: "信息项",
    models: "型号",
    holders: "持有方",
    users: "账号",
    signOut: "退出登录",
  },

  login: {
    title: "登录",
    email: "邮箱",
    password: "密码",
    submit: "登录",
    google: "使用 Google 登录",
    submitting: "登录中…",
  },

  status: {
    in_stock: "在库",
    in_use: "已签出",
    in_repair: "维修中",
    lost: "丢失",
    retired: "已报废",
  } as Record<string, string>,

  assets: {
    title: "资产",
    search: "搜索资产编号、MAC 或型号",
    newAsset: "录入设备",
    total: (n: number) => `共 ${n.toLocaleString("zh-CN")} 条`,
    columns: "显示列",
    includeDescendants: "含子类别",
    allCategories: "全部类别",
    allStatuses: "全部状态",
    sn: "资产编号",
    category: "类别",
    statusLabel: "状态",
    holder: "持有方",
    owner: "负责人",
    empty: "还没有任何资产",
    emptyHint: "先在类别页配置一个类别与信息项，然后录入第一台设备。",
    snChanged: (from: string, to: string) => `编号 ${from} 已变更为 ${to}`,
    archivedFields: "已归档字段",
    archivedHint: "这些信息项已不属于当前类别，保留展示但不参与校验。",
    save: "保存",
    saving: "保存中…",
    saved: "已保存",
    delete: "删除",
    deleteTitle: "删除资产",
    deleteHint: (sn: string) => `此操作不可撤销。请输入资产编号 ${sn} 以确认。`,
    deleted: "已删除",
    selectCategory: "选择类别",
    generatedSN: "编号将由类别规则自动生成",
  },

  common: {
    loading: "加载中…",
    error: "出错了",
    retry: "重试",
    cancel: "取消",
    confirm: "确认",
    required: "此字段必填",
    yes: "是",
    no: "否",
    none: "无",
  },
} as const
