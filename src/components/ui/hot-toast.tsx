"use client";

import { Toaster } from "react-hot-toast";
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getToastVariantStyle } from "@/lib/toast-style";

type ToastIconVariant = "success" | "error" | "warning" | "info" | "loading";

const variantIconStyles: Record<ToastIconVariant, { shell: string; icon: string }> = {
  success: { shell: "bg-positive-soft", icon: "text-positive" },
  error: { shell: "bg-danger-soft", icon: "text-danger" },
  warning: { shell: "bg-warning-soft", icon: "text-warning" },
  info: { shell: "bg-info-soft", icon: "text-info" },
  loading: { shell: "bg-brand-soft", icon: "text-brand" },
};

function ToastStatusIcon({
  variant,
  Icon,
  spin = false,
}: {
  variant: ToastIconVariant;
  Icon: LucideIcon;
  spin?: boolean;
}) {
  const styles = variantIconStyles[variant];
  return (
    <span
      className={cn(
        "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-mark",
        styles.shell,
      )}
      aria-hidden
    >
      <Icon
        className={cn("h-3.5 w-3.5", styles.icon, spin && "animate-spin")}
        strokeWidth={1.6}
        aria-hidden
      />
    </span>
  );
}

function successToastIcon() {
  return <ToastStatusIcon variant="success" Icon={CheckCircle2} />;
}

function errorToastIcon() {
  return <ToastStatusIcon variant="error" Icon={AlertCircle} />;
}

export function warningToastIcon() {
  return <ToastStatusIcon variant="warning" Icon={AlertTriangle} />;
}

export function infoToastIcon() {
  return <ToastStatusIcon variant="info" Icon={Info} />;
}

function loadingToastIcon() {
  return <ToastStatusIcon variant="loading" Icon={Loader2} spin />;
}

export function HotToaster() {
  return (
    <Toaster
      position="bottom-left"
      gutter={10}
      containerStyle={{
        top: "calc(var(--shell-sticky-top) + 0.5rem)",
        right: 16,
        /* Bottom left beside the sidebar (prototype UndoToast); on phones above the tab bar.
           See --toast-left and --toast-bottom in globals.css. */
        left: "var(--toast-left, 16px)",
        bottom: "var(--toast-bottom, 24px)",
      }}
      toastOptions={{
        duration: 4500,
        style: getToastVariantStyle("default"),
        success: {
          duration: 4000,
          style: getToastVariantStyle("success"),
          icon: successToastIcon(),
        },
        error: {
          duration: 6000,
          style: getToastVariantStyle("error"),
          icon: errorToastIcon(),
        },
        loading: {
          style: getToastVariantStyle("loading"),
          icon: loadingToastIcon(),
        },
        blank: {
          style: getToastVariantStyle("info"),
          icon: infoToastIcon(),
        },
      }}
    />
  );
}
