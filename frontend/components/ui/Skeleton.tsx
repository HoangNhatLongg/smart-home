export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`animate-skeleton block rounded bg-surface-muted ${className}`} />;
}

export function SkeletonBlock({ rows = 3, className = "" }: { rows?: number; className?: string }) {
  return (
    <div aria-hidden className={`flex flex-col gap-2.5 ${className}`}>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className={index === rows - 1 ? "w-3/5" : "w-full"} />
      ))}
    </div>
  );
}