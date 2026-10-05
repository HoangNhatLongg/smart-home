import type { ReactNode } from "react";

export interface SectionProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  id?: string;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

/**
 * Titled block of content on the page canvas. Used instead of nesting every
 * group of fields inside one oversized card.
 */
export function Section({
  title,
  description,
  actions,
  id,
  className = "",
  bodyClassName = "",
  children,
}: SectionProps) {
  return (
    <section id={id} className={`scroll-mt-20 rounded-lg border border-line bg-surface ${className}`}>
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-ink-subtle">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <div className={`p-4 ${bodyClassName}`}>{children}</div>
    </section>
  );
}