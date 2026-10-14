"use client"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useSession } from "@/hooks/use-session"

/**
 * Phase 03: shows only the signed-in user's avatar (initial of the e-mail).
 * The account menu with logout lands with the authenticated chrome (Phase 04).
 */
function AccountMenu() {
  const { email } = useSession()
  const initial = email.charAt(0).toUpperCase() || "?"

  return (
    <Avatar data-slot="account-menu" aria-label={`Conta de ${email}`} role="img">
      <AvatarFallback>{initial}</AvatarFallback>
    </Avatar>
  )
}

export { AccountMenu }
