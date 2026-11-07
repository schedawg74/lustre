import type { ButtonHTMLAttributes, ReactNode } from "react";

/** A numbered section, headed like a carved inscription: "II  Lists". */
export const Section = ({
  numeral,
  title,
  aside,
  children,
}: {
  numeral: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) => (
  <section className="flex flex-col gap-3 px-5 py-3">
    <header className="flex items-baseline justify-between gap-3">
      <h2 className="inscription flex items-baseline gap-2 text-[12px] text-text">
        <span className="text-accent">{numeral}</span>
        <span>{title}</span>
      </h2>
      {aside}
    </header>
    {children}
  </section>
);

const BUTTON_VARIANTS = {
  primary:
    "border border-text bg-text text-canvas hover:enabled:border-accent hover:enabled:bg-accent hover:enabled:text-on-accent",
  quiet: "text-muted hover:enabled:text-accent",
  secondary:
    "border border-line text-text hover:enabled:border-accent hover:enabled:text-accent",
} as const;

export const Button = ({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
}) => (
  <button
    className={`shrink-0 cursor-pointer rounded-stone font-medium text-[11px] uppercase tracking-[0.14em] transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${variant === "quiet" ? "px-1 py-1" : "px-4 py-2"} ${BUTTON_VARIANTS[variant]} ${className}`}
    type="button"
    {...props}
  />
);

export const Hint = ({ children }: { children: ReactNode }) => (
  <span className="block text-muted text-xs leading-snug">{children}</span>
);

export const Toggle = ({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) => (
  <label className="flex cursor-pointer items-center justify-between gap-4 text-sm">
    <span>
      {label}
      {hint ? <Hint>{hint}</Hint> : null}
    </span>
    <input
      aria-checked={checked}
      checked={checked}
      className="relative h-[18px] w-8 shrink-0 cursor-pointer appearance-none rounded-stone bg-transparent ring-1 ring-muted ring-inset transition-colors before:absolute before:top-[4px] before:left-[4px] before:size-2.5 before:rounded-[2px] before:bg-muted before:transition-transform checked:bg-accent checked:ring-accent checked:before:translate-x-[14px] checked:before:bg-on-accent focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      onChange={(event) => onChange(event.target.checked)}
      role="switch"
      type="checkbox"
    />
  </label>
);

/** A toggle drawn as a chip, for short options that sit side by side. */
export const Chip = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) => (
  <button
    aria-pressed={checked}
    className={`flex cursor-pointer items-center gap-2 rounded-stone px-3 py-1.5 text-xs ring-1 ring-inset transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 ${checked ? "text-text ring-accent before:size-1.5 before:bg-accent" : "text-muted ring-control hover:text-text"}`}
    onClick={() => onChange(!checked)}
    type="button"
  >
    {label}
  </button>
);

export const Notice = ({
  tone = "info",
  children,
}: {
  tone?: "info" | "danger";
  children: ReactNode;
}) => (
  <p
    className={`text-xs leading-snug ${tone === "danger" ? "text-danger" : "text-muted"}`}
  >
    {children}
  </p>
);

/** One count: a large inscription numeral over a small label. */
export const Stat = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) => (
  <div className="flex flex-col-reverse items-center">
    <dt className="text-[10px] text-muted uppercase tracking-[0.16em]">
      {label}
    </dt>
    <dd className={`font-display text-2xl tabular-nums leading-tight ${tone}`}>
      {value}
    </dd>
  </div>
);

/** Border, colors and focus ring of a text field, without a width. */
export const fieldClass =
  "min-w-0 rounded-stone border border-control bg-canvas px-3 py-2 text-sm text-text placeholder:text-muted focus-visible:-outline-offset-1 focus-visible:outline-2 focus-visible:outline-accent";

/** Focus ring for links. */
export const linkClass =
  "rounded-stone focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";

export const inputClass = `w-full ${fieldClass}`;
