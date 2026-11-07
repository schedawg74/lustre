import type { IconName } from "@lustre/icons/icons";
import { Icon } from "@lustre/icons/react";
import {
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  useId,
} from "react";

const BUTTON_VARIANTS = {
  primary:
    "border border-text bg-text text-canvas hover:enabled:border-accent hover:enabled:bg-accent hover:enabled:text-on-accent",
  quiet: "text-muted hover:enabled:text-accent",
  secondary:
    "border border-control text-text hover:enabled:border-accent hover:enabled:text-accent",
} as const;

export const Button = ({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
}) => (
  <button
    className={`shrink-0 cursor-pointer rounded-stone font-medium text-[11px] uppercase tracking-[0.14em] transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${variant === "quiet" ? "px-1 py-1" : "px-3 py-1.5"} ${BUTTON_VARIANTS[variant]} ${className}`}
    type="button"
    {...props}
  />
);

/** A small heading inside a tab, set like a carved inscription. */
export const Heading = ({ children }: { children: ReactNode }) => (
  <h2 className="inscription text-[11px] text-muted">{children}</h2>
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
  icon,
  checked,
  onChange,
}: {
  label: string;
  icon?: IconName;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) => (
  <button
    aria-pressed={checked}
    className={`flex cursor-pointer items-center gap-2 rounded-stone px-3 py-1.5 text-xs ring-1 ring-inset transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 ${checked ? "text-text ring-accent" : "text-muted ring-control hover:text-text"}`}
    onClick={() => onChange(!checked)}
    type="button"
  >
    {icon ? (
      <Icon
        className={checked ? "text-accent" : "text-muted"}
        name={icon}
        size={14}
      />
    ) : null}
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
    role={tone === "danger" ? "alert" : undefined}
  >
    {children}
  </p>
);

/** Border, colors and focus ring of a text field, without a width. */
export const fieldClass =
  "min-w-0 rounded-stone border border-control bg-canvas px-3 py-2 text-sm text-text placeholder:text-muted focus-visible:-outline-offset-1 focus-visible:outline-2 focus-visible:outline-accent";

export const inputClass = `w-full ${fieldClass}`;

/** Focus ring for links. */
export const linkClass =
  "rounded-stone focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";

export type TabItem<T extends string> = {
  id: T;
  label: string;
  icon: IconName;
  badge?: number;
};

/**
 * The popup's menu: a row of tabs with icons. Arrow keys move between tabs,
 * as the ARIA tabs pattern expects.
 */
export const Tabs = <T extends string>({
  items,
  active,
  onChange,
  panelId,
}: {
  items: readonly TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  panelId: string;
}) => {
  const baseId = useId();
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (!step) {
      return;
    }
    event.preventDefault();
    const index = items.findIndex((item) => item.id === active);
    const next = items[(index + step + items.length) % items.length];
    if (next) {
      onChange(next.id);
      document.getElementById(`${baseId}-${next.id}`)?.focus();
    }
  };
  return (
    <div
      aria-label="Sections"
      className="flex gap-1 px-3"
      onKeyDown={onKeyDown}
      role="tablist"
    >
      {items.map((item) => {
        const selected = item.id === active;
        return (
          <button
            aria-controls={panelId}
            aria-selected={selected}
            className={`relative flex flex-1 cursor-pointer items-center justify-center gap-2 py-2.5 text-[11px] uppercase tracking-[0.14em] transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 ${selected ? "text-text after:bg-accent" : "text-muted hover:text-text"}`}
            id={`${baseId}-${item.id}`}
            key={item.id}
            onClick={() => onChange(item.id)}
            role="tab"
            tabIndex={selected ? 0 : -1}
            type="button"
          >
            <Icon name={item.icon} size={16} />
            {item.label}
            {item.badge ? (
              <span className="text-[10px] text-accent tabular-nums">
                {item.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
};
