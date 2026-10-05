import type { ReactNode } from "react";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { SkeletonBlock } from "./Skeleton";

export interface DataStateProps {
  loading: boolean;
  error: string | null;
  isEmpty?: boolean;
  emptyMessage?: string;
  loadingLabel?: string;
  onRetry?: () => void;
  children: ReactNode;
}

/**
 * Every page renders through DataState so Loading / Error / Empty / Success are
 * explicit. `loading` is reserved for the first load; a background refresh keeps
 * the previous data on screen.
 */
export function DataState({
  loading,
  error,
  isEmpty = false,
  emptyMessage = "Chưa có dữ liệu.",
  loadingLabel = "Đang tải dữ liệu...",
  onRetry,
  children,
}: DataStateProps) {
  if (loading) {
    return (
      <div
        role="status"
        aria-label={loadingLabel}
        className="rounded-lg border border-line bg-surface p-4"
      >
        <span className="sr-only">{loadingLabel}</span>
        <SkeletonBlock rows={4} />
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-bad/30 bg-bad-subtle p-4 text-sm">
        <p className="font-medium text-bad">Không tải được dữ liệu</p>
        <p className="mt-1 text-ink-muted">{error}</p>
        {onRetry && (
          <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
            Thử lại
          </Button>
        )}
      </div>
    );
  }

  if (isEmpty) {
    return <EmptyState message={emptyMessage} />;
  }

  return <>{children}</>;
}