import type { CSSProperties } from "react";

/* VCFO Spectrum toasts (prototype UndoToast A1): white, a 1.5px edge, the float shadow, a 22px
   status tile on the left. No coloured side bars; the tile carries the status colour. */
const toastShellBase: CSSProperties = {
  borderRadius: "var(--radius-md)",
  padding: "12px 14px",
  fontSize: "14px",
  lineHeight: "20px",
  boxShadow: "var(--shadow-float)",
  maxWidth: "380px",
  background: "oklch(var(--surface-raised))",
  color: "oklch(var(--ink))",
  border: "1.5px solid oklch(var(--line))",
};

export type ToastSemanticVariant = "success" | "error" | "warning" | "info" | "loading" | "default";

const semanticToastShell: Record<ToastSemanticVariant, CSSProperties> = {
  default: {},
  success: {},
  error: {},
  warning: {},
  info: {},
  loading: {},
};

/** Central semantic shell styles for react-hot-toast variants. */
export function getToastVariantStyle(variant: ToastSemanticVariant): CSSProperties {
  return { ...toastShellBase, ...semanticToastShell[variant] };
}
