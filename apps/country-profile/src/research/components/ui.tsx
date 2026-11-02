import type { ReactNode } from "react";

/** A folded methods note, open by choice, on the page rather than elsewhere. */
export function MethodBlock({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  return (
    <details className="method">
      <summary>
        <span className="method-title">{title}</span>
        <span className="method-sum">{summary}</span>
      </summary>
      <div className="method-body">{children}</div>
    </details>
  );
}

/**
 * MathML, written as a string. React's JSX typings do not know the MathML
 * elements, and browsers render <math> natively, so the markup goes in as
 * HTML. Only literal strings from this codebase are passed here.
 */
export function Formula({ html }: { html: string }) {
  return <div className="formula" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Seg<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className={`seg-btn${o.value === value ? " is-active" : ""}`}
          onClick={() => onChange(o.value)}
          disabled={disabled}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Ctrl({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ctrl">
      <span className="ctrl-label">{label}</span>
      {children}
    </div>
  );
}
