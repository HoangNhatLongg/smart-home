import type { ReactNode } from "react";

export interface CardProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
}

export function Card({
  title,
  description,
  actions,
  className = "",
  bodyClassName = "",
  children,
}: CardProps) {
  const hasHeader = Boolean(title || description || actions);
  return (
    <section className={`rounded-lg border border-line bg-surface ${className}`}>
      {hasHeader && (
        <header
          className={`flex items-start justify-between gap-3 px-4 pt-3.5 ${
            actions ? "border-b border-line pb-3.5" : "pb-0"
          }`}
        >
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-ink-subtle">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={`p-4 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function CardGrid({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-3 ${className}`}>{children}</div>;
}