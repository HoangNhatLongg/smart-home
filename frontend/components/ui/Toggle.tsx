export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
  hint?: string;
}

/**
 * Presentational relay switch.
 *
 * `checked` always comes from the device State endpoint, never from the POST
 * response, so the switch can never claim an unconfirmed position.
 */
export function Toggle({ checked, onChange, disabled = false, label, hint }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-3 disabled:cursor-not-allowed disabled:opacity-60 ${
        disabled ? "" : "cursor-pointer"
      }`}
    >
      <span
        aria-hidden
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-150 ${
          checked ? "bg-accent" : "bg-line-strong"
        }`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white shadow-[0_1px_2px_rgba(16,24,40,0.2)] transition-transform duration-150 ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </span>
      <span className="text-left">
        <span className="block text-sm text-ink">{label}</span>
        {hint && <span className="block text-xs text-ink-subtle">{hint}</span>}
      </span>
    </button>
  );
}