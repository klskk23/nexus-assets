import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "nexus-assets-web"

/**
 * A radio item is only ever a child of a radio group: its `value` is matched
 * against the group's, and the one that matches draws the dot. Alone it has
 * nothing to compare itself to and renders unmarked.
 */
export const PageSize = () => (
  <div className="flex w-full items-start" style={{ minHeight: 256 }}>
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          每页 50 条
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuLabel>每页条数</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value="50">
          <DropdownMenuRadioItem value="20">20 条</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="50">50 条</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="100">100 条</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
)

/**
 * Selected, unselected, and disabled. A warehouse the account cannot reach
 * stays on the list and greys out, so the set of places is the same wherever
 * you are signed in from.
 */
export const States = () => (
  <div className="flex w-full items-start" style={{ minHeight: 256 }}>
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          上海仓库
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuLabel>默认库房</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value="sh">
          <DropdownMenuRadioItem value="sh">上海仓库</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="bj">北京仓库</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="sz" disabled>
            深圳仓库
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
)
