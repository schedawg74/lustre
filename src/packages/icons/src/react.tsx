import type { SVGProps } from "react";
import { ICON_VIEWBOX, ICONS, type IconName } from "./icons";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "name"> & {
  name: IconName;
  size?: number;
  /** Set for a meaningful icon; without it the icon is decorative. */
  title?: string;
};

export const Icon = ({ name, size = 20, title, ...props }: IconProps) => (
  <svg
    aria-hidden={title ? undefined : true}
    aria-label={title}
    fill="none"
    height={size}
    role={title ? "img" : undefined}
    stroke="currentColor"
    strokeLinecap="square"
    strokeLinejoin="miter"
    strokeWidth={2}
    viewBox={ICON_VIEWBOX}
    width={size}
    {...props}
  >
    {title ? <title>{title}</title> : null}
    <path d={ICONS[name].d} />
  </svg>
);
