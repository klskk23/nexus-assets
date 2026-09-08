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
 * The chevron at the foot of a list too long for the screen. `SelectContent`
 * renders it for you -- you never place it yourself -- and it appears only while
 * there is something below the fold, which is why a preview of it needs a list
 * of thirty categories rather than five.
 */
export const AtTheFootOfALongList = () => (
  <Select defaultValue="cat-0" defaultOpen>
    <SelectTrigger className="w-48" aria-label="类别">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>{rows}</SelectGroup>
    </SelectContent>
  </Select>
)

/**
 * In `position="popper"` the list hangs below the trigger and is capped by the
 * space left under it, so the same button appears sooner -- the further down the
 * page the control sits, the less list there is to show at once.
 */
export const UnderAPopperList = () => (
  <Select defaultValue="cat-0" defaultOpen>
    <SelectTrigger className="w-48" aria-label="类别">
      <SelectValue />
    </SelectTrigger>
    <SelectContent position="popper">
      <SelectGroup>{rows}</SelectGroup>
    </SelectContent>
  </Select>
)
