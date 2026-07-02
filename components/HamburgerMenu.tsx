"use client"

import { useState } from "react"
import { Menu as MenuIcon, ExternalLink, Info, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLinkItem,
} from "@/components/ui/dropdown-menu"
import { AboutDialog } from "@/components/AboutDialog"

export function HamburgerMenu() {
  const [showAbout, setShowAbout] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="icon" aria-label="Open menu" />
          }
        >
          <MenuIcon className="h-5 w-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLinkItem
            href="https://paulpowell.cc/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="h-4 w-4" />
            Paul's Bible Tools
          </DropdownMenuLinkItem>
          <DropdownMenuItem onClick={() => setShowAbout(true)}>
            <Info className="h-4 w-4" />
            About
          </DropdownMenuItem>
          <DropdownMenuLinkItem href="mailto:paul.powell@gmail.com">
            <Mail className="h-4 w-4" />
            Contact Me
          </DropdownMenuLinkItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AboutDialog open={showAbout} onClose={() => setShowAbout(false)} />
    </>
  )
}
