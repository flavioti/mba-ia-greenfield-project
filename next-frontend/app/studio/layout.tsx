import { redirect } from "next/navigation"

import { AppShell } from "@/components/layout/app-shell"
import { UppyProvider } from "@/components/studio/uppy-provider"
import { getSession } from "@/lib/auth/session"

/** Authenticated studio area: anonymous visitors are sent to /login before anything renders. */
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session.isLoggedIn) {
    redirect("/login")
  }

  return (
    <AppShell>
      <UppyProvider>{children}</UppyProvider>
    </AppShell>
  )
}
