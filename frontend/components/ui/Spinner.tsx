export function Spinner({ label = "Đang tải" }: { label?: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      className="inline-block size-4 animate-spin rounded-full border-2 border-line-strong border-t-accent"
    />
  );
}