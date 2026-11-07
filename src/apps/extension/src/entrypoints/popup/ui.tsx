import type { ButtonHTMLAttributes, ReactNode } from "react";

/** A numbered section, headed like a carved inscription: "II · Block lists". */
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
  <section className="flex flex-col gap-3 border-line border-t px-5 py-4">
    <header className="flex items-center justify-between gap-3">
      <h2 className="inscription flex items-baseline gap-2 text-[13px] text-text">
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
    "border-text bg-text text-canvas hover:enabled:bg-accent hover:enabled:border-accent hover:enabled:text-on-accent",
  secondary:
    "border-line bg-transparent text-text hover:enabled:border-accent hover:enabled:text-accent",
} as const;

export const Button = ({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: "sm" | "md";
}) => (
  <button
    className={`shrink-0 cursor-pointer rounded-stone border font-medium uppercase tracking-[0.14em] transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${size === "sm" ? "px-2.5 py-1 text-[10px]" : "px-4 py-2 text-[11px]"} ${BUTTON_VARIANTS[variant]} ${className}`}
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
      checked={checked}
      className="relative h-[18px] w-8 shrink-0 cursor-pointer appearance-none rounded-full bg-line transition-colors before:absolute before:top-[3px] before:left-[3px] before:size-3 before:rounded-full before:bg-canvas before:shadow-sm before:transition-transform checked:bg-accent checked:before:translate-x-[14px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      onChange={(event) => onChange(event.target.checked)}
      type="checkbox"
    />
  </label>
);

export const Notice = ({
  tone = "info",
  children,
}: {
  tone?: "info" | "danger";
  children: ReactNode;
}) => (
  <p
    className={`border-l-2 bg-surface px-3 py-2 text-xs leading-snug ${tone === "danger" ? "border-danger text-danger" : "border-accent text-text"}`}
  >
    {children}
  </p>
);

/**
 * One count, drawn as a column: a capital rule on top, a base rule below.
 */
export const Stat = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) => (
  <div className="flex flex-col items-center gap-1 border-line border-y-2 bg-surface py-2">
    <dt className="text-[10px] text-muted uppercase tracking-[0.16em]">
      {label}
    </dt>
    <dd className={`font-display text-xl tabular-nums ${tone}`}>{value}</dd>
  </div>
);

/** Border, colors and focus ring of a text field, without a width. */
export const fieldClass =
  "min-w-0 rounded-stone border border-line bg-canvas px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none";

export const inputClass = `w-full ${fieldClass}`;
