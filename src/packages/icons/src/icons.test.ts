import { describe, expect, it } from "vitest";
import { ICON_NAMES, ICONS } from "./icons";
import { iconSvg } from "./svg";

/** Absolute moves and straight lines only: the Meandros style. */
const STRAIGHT_LINES_ONLY = /^(?:[MLHVZ][\d.\s-]*)+$/;

describe("Meandros icons", () => {
  it("uses straight lines on the 24-unit grid only", () => {
    for (const name of ICON_NAMES) {
      const { d } = ICONS[name];
      expect(d.replaceAll(" ", ""), name).toMatch(STRAIGHT_LINES_ONLY);
      const numbers = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      for (const value of numbers) {
        expect(value, `${name} stays inside the grid`).toBeGreaterThanOrEqual(
          0
        );
        expect(value, `${name} stays inside the grid`).toBeLessThanOrEqual(24);
      }
    }
  });

  it("renders a decorative or a labelled SVG string", () => {
    expect(iconSvg("pollice")).toContain('aria-hidden="true"');
    expect(iconSvg("pollice", { size: 16, title: "Block" })).toContain(
      'aria-label="Block"'
    );
  });
});
