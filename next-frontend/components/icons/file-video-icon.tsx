import * as React from "react"
import { cn } from "@/lib/utils"

function FileVideoIcon({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 15 20"
      fill="currentColor"
      aria-hidden="true"
      className={cn(className)}
      {...props}
    >
      <path d="M2.5 0C1.12109 0 0 1.12109 0 2.5V17.5C0 18.8789 1.12109 20 2.5 20H12.5C13.8789 20 15 18.8789 15 17.5V6.25H10C9.30859 6.25 8.75 5.69141 8.75 5V0H2.5ZM10 0V5H15L10 0ZM2.5 11.25C2.5 10.5586 3.05859 10 3.75 10H7.5C8.19141 10 8.75 10.5586 8.75 11.25V15C8.75 15.6914 8.19141 16.25 7.5 16.25H3.75C3.05859 16.25 2.5 15.6914 2.5 15V11.25ZM11.7539 15.543L10 14.375V11.875L11.7539 10.707C11.832 10.6563 11.9258 10.625 12.0195 10.625C12.2852 10.625 12.5 10.8398 12.5 11.1055V15.1445C12.5 15.4102 12.2852 15.625 12.0195 15.625C11.9258 15.625 11.832 15.5977 11.7539 15.543Z" />
    </svg>
  )
}

export { FileVideoIcon }
