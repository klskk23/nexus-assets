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

export const zhMeta = {
  fields: {
    title: "信息项",
    create: "新建信息项",
    key: "键名（英文）",
    label: "显示名（中文）",
    type: "类型",
    unique: "全局唯一",
    empty: "还没有任何信息项",
    emptyHint: "信息项是全局共用的：同名信息项在全系统含义一致。建好后到类别页绑定。",
  },
  models: {
    title: "型号",
    create: "新建型号",
    name: "型号名",
    vendor: "厂商",
    category: "所属类别",
    empty: "还没有任何型号",
    emptyHint: "型号隶属于某个类别，可为信息项提供默认值，录入时预填。",
  },
  holders: {
    title: "持有方",
    create: "新建持有方",
    name: "名称",
    type: "类型",
    defaultStock: "默认库存点",
    setDefault: "设为默认库存点",
    empty: "还没有任何持有方",
    emptyHint: "位置、公司、部门都是持有方。归还操作默认指向标记为默认库存点的位置。",
  },
  users: {
    title: "账号",
    create: "新建本地账号",
    email: "邮箱",
    name: "姓名",
    password: "密码",
    status: "状态",
    active: "正常",
    disabled: "已停用",
    disable: "停用",
    empty: "还没有任何账号",
    emptyHint: "账号只能停用不能删除；停用前必须先把其名下的设备转给他人。",
  },
  categories: {
    title: "类别",
    create: "新建类别",
    code: "代号（英文，模板中可用）",
    name: "名称",
    parent: "上级类别",
    snTemplate: "编号生成规则",
    fields: "本类别的信息项",
    inheritedFrom: "继承自",
    bind: "绑定信息项",
    required: "必填",
    empty: "还没有任何类别",
    emptyHint: "类别决定一台设备要记录哪些信息，以及编号怎么生成。子类别继承上级的全部信息项。",
  },
  entityTypes: { company: "公司", location: "位置", department: "部门" } as Record<string, string>,
  fieldTypes: {
    text: "文本", number: "数字", boolean: "布尔", date: "日期", enum: "单选",
    reference: "引用", mac: "MAC 地址", ip: "IP 地址", url: "网址", computed: "计算项",
  } as Record<string, string>,
} as const
