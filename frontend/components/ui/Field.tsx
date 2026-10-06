import { forwardRef } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

interface FieldShellProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  htmlFor?: string;
  children: ReactNode;
}

export function FieldShell({ label, hint, error, htmlFor, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-bad">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

const controlClass =
  "w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink transition-colors duration-150 outline-none placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70";

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, hint, error, id, className = "", ...rest }, ref) => {
    const inputId = id ?? `field-${label.replace(/\s+/g, "-").toLowerCase()}`;
    return (
      <FieldShell label={label} hint={hint} error={error} htmlFor={inputId}>
        <input
          ref={ref}
          id={inputId}
          className={`${controlClass} ${className}`}
          aria-invalid={error ? true : undefined}
          {...rest}
        />
      </FieldShell>
    );
  },
);

TextField.displayName = "TextField";

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

export function SelectField({ label, hint, error, id, className = "", children, ...rest }: SelectFieldProps) {
  const selectId = id ?? `field-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={selectId}>
      <select
        id={selectId}
        className={`${controlClass} ${className}`}
        aria-invalid={error ? true : undefined}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
}