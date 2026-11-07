import { createXClient, type XClient } from "@lustre/x-client/client";
import {
  extractBottomCursor,
  extractListInfo,
  extractUsers,
  graphqlVariables,
  type ListInfo,
  withGraphqlVariables,
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

/** One page of list members, and the cursor of the next page if any. */
export type MembersPage = {
  listId: string;
  users: XUser[];
  nextCursor?: string;
};

/** The last members request x.com made for a list, to repeat per page. */
type MembersRequest = { url: string; headers: Record<string, string> };

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
  /**
   * Fetches one page of members by repeating x.com's own members request
   * with another cursor. Works in a background tab, where x.com does not
   * load more members on its own. Throws when x.com refuses it.
   */
  fetchMembersPage: (listId: string, cursor: string) => Promise<MembersPage>;
};

/** Connects to the page bridge and builds an API client for this tab. */
export const createXSession = (): XSession => {
  let authorization: string | undefined;
  const seenPages: MembersPage[] = [];
  const listeners = new Set<MembersListener>();
  const listInfos = new Map<string, ListInfo>();
  const membersRequests = new Map<string, MembersRequest>();
  const fetchFromPage = pageFetch();

  const toPage = (listId: string, payload: unknown): MembersPage => ({
    listId,
    nextCursor: extractBottomCursor(payload),
    users: extractUsers(payload),
  });

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
    membersRequests.set(listId, {
      headers: message.headers,
      url: message.url,
    });
    const page = toPage(listId, message.payload);
    seenPages.push(page);
    for (const listener of listeners) {
      listener(page);
    }
  });

  const client = createXClient({
    fetch: fetchFromPage,
    getAuthorization: () => authorization,
    getCsrfToken: () => readCookie("ct0"),
    language: document.documentElement.lang || navigator.language.slice(0, 2),
    origin: location.origin,
  });

  return {
    client,
    fetchMembersPage: async (listId, cursor) => {
      const request = membersRequests.get(listId);
      if (!request) {
        throw new Error("x.com has not loaded this list's members yet.");
      }
      const response = await fetchFromPage(
        withGraphqlVariables(request.url, { cursor }),
        { credentials: "include", headers: request.headers }
      );
      if (!response.ok) {
        throw new Error(`x.com answered HTTP ${response.status}.`);
      }
      return toPage(listId, await response.json());
    },
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
