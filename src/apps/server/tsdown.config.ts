import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  // Workspace packages export TypeScript source, so they go into the bundle.
  deps: { alwaysBundle: [/^@lustre\//], neverBundle: true },
  entry: ["src/index.ts"],
  format: "esm",
  platform: "node",
  target: "node24",
});
