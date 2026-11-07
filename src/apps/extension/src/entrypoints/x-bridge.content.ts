import { graphqlOperationName } from "@lustre/x-client/users";
import { defineContentScript } from "wxt/utils/define-content-script";
import {
  BRIDGE_SOURCE,
  type BridgeMessage,
  FORWARDED_OPERATIONS,
} from "@/lib/x/bridge-protocol";

type WithoutSource<T> = T extends unknown ? Omit<T, "source"> : never;

/**
 * Runs in the page's own JavaScript world, before x.com's scripts. It watches
 * the API calls x.com makes and forwards two things to the content script:
 * the bearer header x.com currently uses, and the responses of the GraphQL
 * operations in FORWARDED_OPERATIONS (list members while importing a list).
 * It never changes a request or a response.
 */
export default defineContentScript({
  main() {
    const post = (message: WithoutSource<BridgeMessage>) => {
      window.postMessage(
        { ...message, source: BRIDGE_SOURCE },
        location.origin
      );
    };

    let lastAuthorization: string | undefined;
    const seeHeader = (name: string, value: string) => {
      if (
        name.toLowerCase() === "authorization" &&
        value.startsWith("Bearer ") &&
        value !== lastAuthorization
      ) {
        lastAuthorization = value;
        post({ authorization: value, type: "auth" });
      }
    };

    const forward = (url: string, readJson: () => Promise<unknown>) => {
      const operation = graphqlOperationName(url);
      if (!(operation && FORWARDED_OPERATIONS.has(operation))) {
        return;
      }
      readJson().then(
        (payload) => post({ operation, payload, type: "graphql", url }),
        () => undefined
      );
    };

    const requestUrls = new WeakMap<XMLHttpRequest, string>();
    const { open, send, setRequestHeader } = XMLHttpRequest.prototype;

    XMLHttpRequest.prototype.open = function patchedOpen(
      this: XMLHttpRequest,
      ...args: Parameters<XMLHttpRequest["open"]>
    ) {
      requestUrls.set(this, String(args[1]));
      return (open as (...a: unknown[]) => void).apply(this, args);
    } as XMLHttpRequest["open"];

    XMLHttpRequest.prototype.setRequestHeader = function patchedSetHeader(
      this: XMLHttpRequest,
      name: string,
      value: string
    ) {
      seeHeader(name, value);
      return setRequestHeader.call(this, name, value);
    };

    XMLHttpRequest.prototype.send = function patchedSend(
      this: XMLHttpRequest,
      body?: Document | XMLHttpRequestBodyInit | null
    ) {
      const url = requestUrls.get(this);
      if (url) {
        this.addEventListener("load", () => {
          if (this.status !== 200) {
            return;
          }
          forward(url, async () =>
            this.responseType === "json"
              ? this.response
              : JSON.parse(this.responseText)
          );
        });
      }
      return send.call(this, body);
    };

    const originalFetch = window.fetch;
    window.fetch = async function patchedFetch(input, init) {
      // Read the URL and headers without building a new Request: that would
      // consume the body of a Request passed in as `input`.
      const isRequest = input instanceof Request;
      const url = isRequest ? input.url : String(input);
      const headers = new Headers(
        init?.headers ?? (isRequest ? input.headers : undefined)
      );
      for (const [name, value] of headers) {
        seeHeader(name, value);
      }
      const response = await originalFetch.call(this, input, init);
      if (response.ok) {
        forward(url, () => response.clone().json());
      }
      return response;
    };
  },
  matches: ["https://x.com/*", "https://twitter.com/*"],
  runAt: "document_start",
  world: "MAIN",
});
