import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { SITE_URL } from "./src/site";

export default defineConfig({
  integrations: [react()],
  output: "static",
  site: SITE_URL,
  vite: {
    plugins: [tailwindcss()],
  },
});
