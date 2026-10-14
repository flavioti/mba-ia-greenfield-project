import * as React from "react"

import { AppHeader } from "@/components/layout/app-header"

/** Minimal authenticated shell (DG-1): header + content. The sidebar arrives in later phases (OQ-17). */
function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div data-slot="app-shell" className="flex min-h-full flex-1 flex-col bg-background">
      <AppHeader />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  )
}

export { AppShell }
