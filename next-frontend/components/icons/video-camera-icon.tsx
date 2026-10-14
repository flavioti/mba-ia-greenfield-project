import * as React from "react"
import { cn } from "@/lib/utils"

function VideoCameraIcon({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 18 16"
      fill="currentColor"
      aria-hidden="true"
      className={cn(className)}
      {...props}
    >
      <path d="M0 4C0 2.89688 0.896875 2 2 2H10C11.1031 2 12 2.89688 12 4V12C12 13.1031 11.1031 14 10 14H2C0.896875 14 0 13.1031 0 12V4ZM17.4719 3.11875C17.7969 3.29375 18 3.63125 18 4V12C18 12.3688 17.7969 12.7063 17.4719 12.8813C17.1469 13.0563 16.7531 13.0375 16.4438 12.8313L13.4438 10.8313L13 10.5344V10V6V5.46562L13.4438 5.16875L16.4438 3.16875C16.75 2.96563 17.1437 2.94375 17.4719 3.11875Z" />
    </svg>
  )
}

export { VideoCameraIcon }
