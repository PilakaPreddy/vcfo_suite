import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AccentButton } from "./AccentButton";
import { Surface } from "./Surface";
import { GeometricEmpty } from "@/components/illustrations/GeometricEmpty";

interface EmptyStateIllustratedProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: LucideIcon;
  className?: string;
  art?: "inbox" | "waiting" | "success" | "empty";
}

export function EmptyStateIllustrated({
  title,
  description,
  actionLabel,
  onAction,
  icon: Icon,
  className,
  art = "empty",
}: EmptyStateIllustratedProps) {
  return (
    <Surface
      className={cn(
        "flex flex-col items-center border-fine [--edge-color:oklch(var(--brand)/0.2)] bg-brand-soft/30 px-6 py-12 text-center",
        className,
      )}
    >
      {Icon ? (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border role-accent-border role-accent-bg">
          <Icon className="h-7 w-7 text-brand" aria-hidden />
        </div>
      ) : (
        <GeometricEmpty variant={art} className="mb-2" />
      )}
      <h3 className="serif text-xl text-ink">{title}</h3>
      {description && (
        <p className="prose-narrow mt-2 text-sm text-ink-muted">{description}</p>
      )}
      {actionLabel && onAction && (
        <AccentButton className="mt-5 min-h-11" onClick={onAction}>
          {actionLabel}
        </AccentButton>
      )}
    </Surface>
  );
}
