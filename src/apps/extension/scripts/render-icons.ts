/**
 * Renders the brand icon of @lustre/icons to the PNG sizes the manifest uses.
 * Run with `pnpm --filter @lustre/extension icons`.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const SIZES = [16, 32, 48, 96, 128] as const;
const root = path.resolve(import.meta.dirname, "..");
/** 16 and 32 px use a simpler drawing; finer detail merges at that size. */
const SMALL_UP_TO = 32;
const brand = path.resolve(root, "../../packages/icons/brand");
const svgLarge = await readFile(path.join(brand, "icon.svg"), "utf8");
const svgSmall = await readFile(path.join(brand, "icon-small.svg"), "utf8");

const browser = await chromium.launch({ channel: "chromium" });
try {
  for (const size of SIZES) {
    const page = await browser.newPage({
      viewport: { height: size, width: size },
    });
    await page.setContent(
      `<body style="margin:0">${(size <= SMALL_UP_TO ? svgSmall : svgLarge).replace("<svg ", `<svg width="${size}" height="${size}" `)}</body>`
    );
    await page.screenshot({
      omitBackground: true,
      path: path.join(root, `public/icon/${size}.png`),
    });
    await page.close();
  }
} finally {
  await browser.close();
}
