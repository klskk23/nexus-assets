import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "nexus-assets-web"

const CATEGORIES = [
  "网络设备", "服务器", "笔记本", "台式机", "显示器", "打印机", "扫描仪",
  "投影仪", "交换机", "路由器", "防火墙", "无线 AP", "机柜", "UPS 电源",
  "存储阵列", "磁带库", "光纤模块", "会议终端", "摄像头", "门禁读卡器",
  "条码枪", "标签打印机", "平板电脑", "手机", "耳机", "键鼠套装", "扩展坞",
  "移动硬盘", "加密狗", "测试仪表",
]

const rows = CATEGORIES.map((name, i) => (
  <SelectItem key={name} value={`cat-${i}`}>
    {name}
  </SelectItem>
))

/**
 * The chevron at the head of a long list. `SelectContent` renders it; it shows
 * only once something has scrolled past the top -- so here the list opens on a
 * category near the end, which is what an item-aligned list does when you
 * reopen it on a choice made earlier.
 */
export const AboveAScrolledList = () => (
  <Select defaultValue="cat-27" defaultOpen>
    <SelectTrigger className="w-48" aria-label="类别">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>{rows}</SelectGroup>
    </SelectContent>
  </Select>
)

/**
 * The same list in `position="popper"`: it hangs below the trigger and scrolls
 * to the chosen row, so both chevrons can be on screen at once.
 */
export const InAPopperList = () => (
  <Select defaultValue="cat-20" defaultOpen>
    <SelectTrigger className="w-48" aria-label="类别">
      <SelectValue />
    </SelectTrigger>
    <SelectContent position="popper">
      <SelectGroup>{rows}</SelectGroup>
    </SelectContent>
  </Select>
)
