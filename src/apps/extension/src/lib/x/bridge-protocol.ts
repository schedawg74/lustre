/**
 * Messages from the page-world bridge (x-bridge.content.ts) to the isolated
 * content script, sent with window.postMessage.
 */
export const BRIDGE_SOURCE = "feedwarden-bridge";

/** GraphQL operations whose responses the bridge forwards. */
export const FORWARDED_OPERATIONS = new Set(["ListMembers"]);

export type BridgeMessage =
  | { source: typeof BRIDGE_SOURCE; type: "auth"; authorization: string }
  | {
      source: typeof BRIDGE_SOURCE;
      type: "graphql";
      operation: string;
      url: string;
      payload: unknown;
    };

export const isBridgeMessage = (value: unknown): value is BridgeMessage => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const message = value as Partial<BridgeMessage>;
  if (message.source !== BRIDGE_SOURCE) {
    return false;
  }
  if (message.type === "auth") {
    return (
      typeof message.authorization === "string" &&
      message.authorization.startsWith("Bearer ")
    );
  }
  return (
    message.type === "graphql" &&
    typeof message.operation === "string" &&
    typeof message.url === "string"
  );
};
