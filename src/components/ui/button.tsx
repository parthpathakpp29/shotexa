import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Kbd } from "./kbd";

export const buttonVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background-color,border-color,color,box-shadow] duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-white shadow-accent hover:bg-accent-hover",
        dark: "bg-dark text-white hover:bg-dark-2",
        secondary: "border border-line bg-surface text-ink shadow-xs hover:border-line-strong hover:bg-surface-3",
        soft: "bg-surface-2 text-ink hover:bg-[#ebe5db]",
        ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
        link: "h-auto px-0 text-accent-ink underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 rounded-sm px-3 text-[13px]",
        md: "h-10 rounded-md px-4 text-sm",
        lg: "h-11 rounded-md px-5 text-[15px]",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Keyboard shortcut hint shown inside the button (e.g. "⌘V"). */
  kbd?: ReactNode;
}

export function Button({ className, variant, size, asChild, kbd, children, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={cn(buttonVariants({ variant, size }), className)} type={asChild ? undefined : (type ?? "button")} {...props}>
      {asChild ? (
        children
      ) : (
        <>
          {children}
          {kbd && <Kbd tone={variant === "primary" || variant === "dark" ? "inverse" : "default"}>{kbd}</Kbd>}
        </>
      )}
    </Comp>
  );
}
