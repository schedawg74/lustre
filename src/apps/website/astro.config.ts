import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { SITE_URL } from "./src/site";

export default defineConfig({
  integrations: [react()],
  output: "static",
  site: SITE_URL,
  vite: {
    // The hoisted root has the server's `cookie` 0.7; Astro needs its own
    // nested 2.x. Bundling it into the prerender chunk resolves it from
    // Astro's folder.
    environments: { prerender: { resolve: { noExternal: ["cookie"] } } },
    plugins: [tailwindcss()],
  },
});
