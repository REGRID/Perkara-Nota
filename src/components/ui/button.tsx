import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium ring-offset-background transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none active:scale-98",
  {
    variants: {
      variant: {
        default: "bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 shadow-xs",
        destructive:
          "bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 shadow-xs",
        outline:
          "border border-slate-200 bg-white hover:bg-slate-100 hover:text-slate-900 text-slate-700",
        secondary:
          "bg-slate-100 text-slate-900 hover:bg-slate-200 active:bg-slate-300",
        ghost: "hover:bg-slate-100 hover:text-slate-900 text-slate-700",
        link: "text-emerald-600 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 text-xs sm:text-sm",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-10 rounded-xl px-6 text-sm",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
