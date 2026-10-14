import Link from "next/link"

import { BrandLogo } from "@/components/auth/brand-logo"
import { VideoCameraIcon } from "@/components/icons/video-camera-icon"
import { AccountMenu } from "@/components/layout/account-menu"
import { iconButtonVariants } from "@/components/ui/icon-button"
import { cn } from "@/lib/utils"

/** Phase 03 header: logo, upload shortcut and avatar (search is Phase 07 — OQ-17). */
function AppHeader() {
  return (
    <header
      data-slot="app-header"
      className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background px-4"
    >
      <Link href="/" aria-label="StreamTube — início">
        <BrandLogo size="md" />
      </Link>
      <div className="flex items-center gap-4">
        <Link
          href="/studio/videos/new"
          aria-label="Enviar vídeo"
          className={cn(iconButtonVariants({ variant: "ghost", size: "lg" }))}
        >
          <VideoCameraIcon className="h-4 w-5" />
        </Link>
        <AccountMenu />
      </div>
    </header>
  )
}

export { AppHeader }
