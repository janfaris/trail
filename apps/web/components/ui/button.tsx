import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "ghost" | "outline";
  size?: "default" | "sm" | "lg";
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const base =
      "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a7f300] disabled:pointer-events-none disabled:opacity-50";
    const variants = {
      default: "bg-[#a7f300] text-zinc-950 hover:bg-[#b9ff1f]",
      ghost: "hover:bg-zinc-900 text-zinc-100",
      outline: "border border-zinc-800 bg-transparent hover:bg-zinc-900 text-zinc-100",
    };
    const sizes = {
      default: "h-10 px-4 py-2",
      sm: "h-8 px-3 text-xs",
      lg: "h-12 px-6 text-base",
    };
    return <button className={cn(base, variants[variant], sizes[size], className)} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";
export { Button };
