import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: ({ browser }) => ({
    action: { default_title: "Lustre" },
    description:
      "Personal feed control for X: bulk-block lists, one-click block, mute and not interested.",
    host_permissions: ["https://x.com/*", "https://twitter.com/*"],
    name: "Lustre",
    permissions: ["storage"],
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              data_collection_permissions: { required: ["none"] },
              id: "lustre@schedawg74",
              // MAIN-world content scripts need Firefox 128.
              strict_min_version: "128.0",
            },
          },
        }
      : {}),
  }),
  modules: ["@wxt-dev/module-react"],
  publicDir: "public",
  srcDir: "src",
});
