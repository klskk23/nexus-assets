"use client"

import * as React from "react"

import { cn } from "cn"

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      // The header is the column's title, not the first row of data: it sits
      // on the well and closes with a full-strength rule, while the rows below
      // are separated by a third of that. The eye then runs down a column
      // instead of stepping over forty equal lines.
      className={cn(
        "bg-well [&_tr]:border-b [&_tr]:border-border",
        className
      )}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-border-muted transition-colors hover:bg-accent has-aria-expanded:bg-accent data-[state=selected]:bg-secondary",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "px-5 py-[14px] text-left align-middle text-[13px] font-semibold whitespace-nowrap text-secondary-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      // The 48px row comes out of this padding, not from a height on the row:
      // a row carrying a chip or a button is taller than its text, and an
      // explicit height would fight it instead of giving way.
      //
      // Which is why a cell holding a control drops its vertical padding. The
      // row's rhythm belongs to the text; a 22px chip or a 32px button cluster
      // added to 28px of padding would make every row that has one taller than
      // every row that does not. The prototype gets this for free -- its chips
      // are plain inline spans, and an inline box's vertical padding never
      // enters the line box. Ours are inline-flex, so they have to say it.
      //
      // `tabular-nums` because a ledger is read down a column -- proportional
      // digits make one column of device numbers look ragged.
      className={cn(
        "px-5 py-[14px] align-middle text-sm tabular-nums whitespace-nowrap [&:has(button)]:py-0 [&:has([data-slot=badge])]:py-0 [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
