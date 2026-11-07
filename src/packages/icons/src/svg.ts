import { ICON_STROKE, ICON_VIEWBOX, ICONS, type IconName } from "./icons";

/**
 * An icon as an SVG string, for static HTML (Astro pages, emails). The icon
 * draws in `currentColor`.
 */
export const iconSvg = (
  name: IconName,
  { size = 24, title }: { size?: number; title?: string } = {}
): string => {
  const attributes = Object.entries(ICON_STROKE)
    .map(([key, value]) => `${key}="${value}"`)
    .join(" ");
  const label = title
    ? `role="img" aria-label="${title}"><title>${title}</title>`
    : 'aria-hidden="true">';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${ICON_VIEWBOX}" ${attributes} ${label}<path d="${ICONS[name].d}"/></svg>`;
};
