import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DIALOG_CLOSE,
  DIALOG_CONTENT,
  DIALOG_DESCRIPTION,
  DIALOG_FOOT,
  DIALOG_HEAD,
  DIALOG_OVERLAY,
  DIALOG_TITLE,
  DIALOG_WIDTHS,
  dialogIsFlush,
  type DialogSize,
} from "@/components/ui/dialog-classes";

/* The shared dialog (VCFO Spectrum, prototype Modal): navy scrim, a 52px head with a hairline,
   a 15px title, a 32px close square, a footer with a hairline above, widths 420 / 560 / 760 /
   1000px, and a bottom sheet on phones. For a dialog built from props, use `Modal`
   (`@/components/ui/modal`). */

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

function DialogOverlay({ ref, className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay> & { ref?: React.Ref<React.ElementRef<typeof DialogPrimitive.Overlay>> }) {
  return <DialogPrimitive.Overlay ref={ref} className={cn(DIALOG_OVERLAY, className)} {...props} />;
}

function DialogContent({
  ref,
  className,
  children,
  size = "md",
  hideClose,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  ref?: React.Ref<React.ElementRef<typeof DialogPrimitive.Content>>;
  /** 420, 560 (default), 760 or 1000px. A `max-w-*` class from the caller still wins. */
  size?: DialogSize;
  /** Leave out the 32px close square (the caller draws its own). */
  hideClose?: boolean;
}) {
  const padded = !dialogIsFlush(className);
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        data-dialog-pad={padded ? "" : undefined}
        className={cn(DIALOG_CONTENT, DIALOG_WIDTHS[size], className)}
        {...props}
      >
        {children}
        {hideClose ? null : (
          <DialogPrimitive.Close className={DIALOG_CLOSE}>
            <X size={16} strokeWidth={1.6} aria-hidden />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

/** The 52px head: an optional eyebrow, the title, then chips or a description. */
const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn(DIALOG_HEAD, className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

/** Small muted line above the title. */
const DialogEyebrow = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("truncate text-[12.5px] text-ink-muted", className)} {...props} />
);
DialogEyebrow.displayName = "DialogEyebrow";

/** Buttons on the right with a hairline above. */
const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn(DIALOG_FOOT, className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

function DialogTitle({ ref, className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title> & { ref?: React.Ref<React.ElementRef<typeof DialogPrimitive.Title>> }) {
  return <DialogPrimitive.Title ref={ref} className={cn(DIALOG_TITLE, className)} {...props} />;
}

function DialogDescription({ ref, className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description> & { ref?: React.Ref<React.ElementRef<typeof DialogPrimitive.Description>> }) {
  return <DialogPrimitive.Description ref={ref} className={cn(DIALOG_DESCRIPTION, className)} {...props} />;
}

export {
  Dialog,
  DialogTrigger,
  
  
  
  DialogContent,
  DialogHeader,
  
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
