"use client"

import * as React from "react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"

import { cn } from "@/lib/utils"

function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

function DropdownMenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
  return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
}

function DropdownMenuContent({
  className,
  sideOffset = 8,
  align = "end",
  children,
  ...props
}: MenuPrimitive.Popup.Props & MenuPrimitive.Positioner.Props) {
  return (
    <DropdownMenuPortal>
      <MenuPrimitive.Positioner
        sideOffset={sideOffset}
        align={align}
        className="z-50"
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            "min-w-[12rem] overflow-hidden rounded-lg border border-border bg-white p-1 text-foreground shadow-lg transition-[transform,scale,opacity] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
            className
          )}
          {...props}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </DropdownMenuPortal>
  )
}

const menuItemClass =
  "flex w-full cursor-pointer select-none items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground outline-none data-[highlighted]:bg-parchment-card data-[highlighted]:text-heading"

function DropdownMenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(menuItemClass, className)}
      {...props}
    />
  )
}

function DropdownMenuLinkItem({ className, ...props }: MenuPrimitive.LinkItem.Props) {
  return (
    <MenuPrimitive.LinkItem
      data-slot="dropdown-menu-link-item"
      className={cn(menuItemClass, className)}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLinkItem,
}
