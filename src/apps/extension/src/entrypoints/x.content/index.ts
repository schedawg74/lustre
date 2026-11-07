import "./style.css";
import { defineContentScript } from "wxt/utils/define-content-script";
import { startBlockRunner } from "@/lib/x/block-runner";
import { mountInlineActions } from "@/lib/x/inline-actions";
import { maybeStartListImport } from "@/lib/x/list-import";
import { createXSession } from "@/lib/x/session";

export default defineContentScript({
  main(ctx) {
    const session = createXSession();
    startBlockRunner(ctx, session);

    let importRunning = false;
    const checkImport = () =>
      maybeStartListImport(
        ctx,
        session,
        () => importRunning,
        () => {
          importRunning = true;
        }
      );

    const onReady = () => {
      mountInlineActions(ctx, session);
      checkImport();
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", onReady, { once: true });
    } else {
      onReady();
    }
    // x.com is a single-page app: opening a list does not reload the page.
    ctx.addEventListener(window, "wxt:locationchange", checkImport);
  },
  matches: ["https://x.com/*", "https://twitter.com/*"],
  // Start before x.com loads data, so the bridge's first messages arrive.
  runAt: "document_start",
});
