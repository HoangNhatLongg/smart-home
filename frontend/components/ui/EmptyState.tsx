import type { ComponentType, ReactNode } from "react";

export interface EmptyStateProps {
  icon?: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  title?: string;
  description?: string;
  message: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Placeholder for "nothing here yet". Deliberately has no `role="alert"`:
 * an empty list is not an error.
 */
export function EmptyState({ icon: Icon, title, description, message, action, className = "" }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line bg-surface px-6 py-10 text-center ${className}`}
    >
      {Icon && <span className="flex size-11 items-center justify-center rounded-lg bg-accent-subtle text-accent"><Icon size={22} strokeWidth={1.75} /></span>}
      {title && <p className="text-sm font-semibold text-ink">{title}</p>}
      <p className="max-w-sm text-sm leading-6 text-ink-muted">{description ?? message}</p>
      {action}
    </div>
  );
}
