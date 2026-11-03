import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverAnchor = PopoverPrimitive.Anchor;

function PopoverContent({ ref, className, align = "center", sideOffset = 4, ...props }: React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & { ref?: React.Ref<React.ElementRef<typeof PopoverPrimitive.Content>> }) {
  return (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-50 w-72 rounded-md border border-line bg-popover p-4 text-popover-foreground shadow-float outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
);
}

/**
 * Pop-over card (prototype PopoverCard): 300px, a 1px edge and the float shadow; an optional
 * 14px title bar and a footer, each with a hairline; the body scrolls at 60 % of the screen
 * height. The trigger is the child element.
 */
function PopoverCard({
  trigger,
  title,
  children,
  footer,
  align = "start",
  side = "bottom",
  width = 300,
  open,
  onOpenChange,
  label,
}: {
  trigger: React.ReactNode;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
  width?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Accessible name when the title is not plain text. */
  label?: string;
}) {
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align={align}
          side={side}
          sideOffset={6}
          collisionPadding={12}
          aria-label={label}
          className="z-50 max-w-[calc(100vw-24px)] overflow-hidden rounded-md border border-line bg-surface-raised text-ink shadow-float outline-none"
          style={{ width }}
        >
          {title ? <div className="border-b border-line-soft px-4 py-2.5 text-[14px] font-medium">{title}</div> : null}
          <div className="max-h-[60vh] overflow-y-auto">{children}</div>
          {footer ? <div className="flex items-center justify-end gap-2 border-t border-line-soft px-4 py-2.5">{footer}</div> : null}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent };
