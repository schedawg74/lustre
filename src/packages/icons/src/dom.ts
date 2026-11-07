import { ICON_STROKE, ICON_VIEWBOX, ICONS, type IconName } from "./icons";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * An icon as a DOM element, built without innerHTML, for pages that enforce
 * Trusted Types (x.com). Decorative: hidden from screen readers.
 */
export const createIcon = (name: IconName): SVGSVGElement => {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", ICON_VIEWBOX);
  svg.setAttribute("aria-hidden", "true");
  for (const [key, value] of Object.entries(ICON_STROKE)) {
    svg.setAttribute(key, value);
  }
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", ICONS[name].d);
  svg.append(path);
  return svg;
};
