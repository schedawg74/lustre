import { createXClient, type XClient } from "@lustre/x-client/client";
import {
  extractListInfo,
  extractUsers,
  graphqlVariables,
  type ListInfo,
  type XUser,
} from "@lustre/x-client/users";
import { isBridgeMessage } from "./bridge-protocol";

const readCookie = (name: string): string | undefined => {
  for (const part of document.cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) {
      return decodeURIComponent(value.join("="));
    }
  }
};

/**
 * Firefox runs content-script fetch() with the extension's origin. Its
 * `content.fetch` sends the request as the page does, like Chrome's fetch.
 */
const pageFetch = (): typeof fetch => {
  const firefoxContent = (globalThis as { content?: { fetch?: typeof fetch } })
    .content;
  return firefoxContent?.fetch
    ? firefoxContent.fetch.bind(firefoxContent)
    : globalThis.fetch.bind(globalThis);
};

/** One page of list members that x.com loaded. */
export type MembersPage = { listId: string; users: XUser[] };

type MembersListener = (page: MembersPage) => void;

export type XSession = {
  client: XClient;
  /**
   * Calls `listener` for every page of list members x.com loads, starting
   * with the pages this tab already loaded, so an import that starts late
   * still sees the first page.
   */
  onListMembers: (listener: MembersListener) => () => void;
  /** The list's name and owner, once x.com loaded them in this tab. */
  listInfo: (listId: string) => ListInfo | undefined;
};

/** Connects to the page bridge and builds an API client for this tab. */
export const createXSession = (): XSession => {
  let authorization: string | undefined;
  const seenPages: MembersPage[] = [];
  const listeners = new Set<MembersListener>();
  const listInfos = new Map<string, ListInfo>();

  window.addEventListener("message", (event) => {
    if (event.source !== window || !isBridgeMessage(event.data)) {
      return;
    }
    const message = event.data;
    if (message.type === "auth") {
      ({ authorization } = message);
      return;
    }
    const listId = graphqlVariables(message.url)?.listId;
    if (typeof listId !== "string") {
      return;
    }
    const info = extractListInfo(message.payload, listId);
    if (info) {
      listInfos.set(listId, { ...listInfos.get(listId), ...info });
    }
    if (message.operation !== "ListMembers") {
      return;
    }
    const page = { listId, users: extractUsers(message.payload) };
    seenPages.push(page);
    for (const listener of listeners) {
      listener(page);
    }
  });

  const client = createXClient({
    fetch: pageFetch(),
    getAuthorization: () => authorization,
    getCsrfToken: () => readCookie("ct0"),
    language: document.documentElement.lang || navigator.language.slice(0, 2),
    origin: location.origin,
  });

  return {
    client,
    listInfo: (listId) => listInfos.get(listId),
    onListMembers: (listener) => {
      for (const page of seenPages) {
        listener(page);
      }
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
