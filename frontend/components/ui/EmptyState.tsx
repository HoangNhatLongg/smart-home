import type { ComponentType, ReactNode } from "react";

export interface EmptyStateProps {
  icon?: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  message: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Placeholder for "nothing here yet". Deliberately has no `role="alert"`:
 * an empty list is not an error.
 */
export function EmptyState({ icon: Icon, message, action, className = "" }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line bg-surface px-6 py-10 text-center ${className}`}
    >
      {Icon && <Icon size={20} strokeWidth={1.75} className="text-ink-subtle" />}
      <p className="max-w-sm text-sm text-ink-muted">{message}</p>
      {action}
    </div>
  );
}