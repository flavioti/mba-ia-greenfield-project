import * as React from "react"
import { cn } from "@/lib/utils"

function PlayIcon({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 27 36"
      fill="currentColor"
      aria-hidden="true"
      className={cn(className)}
      {...props}
    >
      <path d="M5.13281 2.74219C4.09219 2.10234 2.78438 2.08125 1.72266 2.67891C0.660937 3.27656 0 4.40156 0 5.625V30.375C0 31.5984 0.660937 32.7234 1.72266 33.3211C2.78438 33.9188 4.09219 33.8906 5.13281 33.2578L25.3828 20.8828C26.3883 20.2711 27 19.1813 27 18C27 16.8188 26.3883 15.7359 25.3828 15.1172L5.13281 2.74219Z" />
    </svg>
  )
}

export { PlayIcon }
