/** An X account as the web app's GraphQL responses describe it. */
export type XUser = {
  id: string;
  screenName: string;
  name: string;
  /** You follow this account. */
  following: boolean;
  /** You already block this account. */
  blocking: boolean;
};

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null;

const readString = (source: unknown, key: string): string | undefined => {
  if (!isObject(source)) {
    return;
  }
  const value = source[key];
  return typeof value === "string" ? value : undefined;
};

const readBoolean = (source: unknown, key: string): boolean =>
  isObject(source) && source[key] === true;

const EMOJI =
  /\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|\u{FE0F}|\u{200D}|\u{20E3}/gu;

/** Removes emojis from display text and collapses the spaces they leave. */
export const stripEmoji = (text: string): string =>
  text
    .replace(EMOJI, "")
    .replace(/\s{2,}/g, " ")
    .trim();

/**
 * Reads one GraphQL `User` result. X moved fields between `legacy`, `core`
 * and `relationship_perspectives` over time, so each field is read from every
 * place it has lived.
 */
const toUser = (result: JsonObject): XUser | undefined => {
  const id = readString(result, "rest_id");
  const { legacy, core } = result;
  const perspectives = result.relationship_perspectives;
  const screenName =
    readString(core, "screen_name") ?? readString(legacy, "screen_name");
  if (!(id && screenName)) {
    return;
  }
  return {
    blocking:
      readBoolean(perspectives, "blocking") || readBoolean(legacy, "blocking"),
    following:
      readBoolean(perspectives, "following") ||
      readBoolean(legacy, "following"),
    id,
    name:
      stripEmoji(
        readString(core, "name") ?? readString(legacy, "name") ?? ""
      ) || screenName,
    screenName,
  };
};

/**
 * Collects every user in a GraphQL response, in document order and without
 * duplicates. It walks the whole tree instead of following one fixed path, so
 * it keeps working when X renames or nests the timeline containers.
 */
export const extractUsers = (payload: unknown): XUser[] => {
  const users = new Map<string, XUser>();
  const stack: unknown[] = [payload];
  while (stack.length > 0) {
    const node = stack.pop();
    if (Array.isArray(node)) {
      for (let index = node.length - 1; index >= 0; index -= 1) {
        stack.push(node[index]);
      }
      continue;
    }
    if (!isObject(node)) {
      continue;
    }
    if (node.__typename === "User") {
      const user = toUser(node);
      if (user && !users.has(user.id)) {
        users.set(user.id, user);
      }
    }
    const values = Object.values(node);
    for (let index = values.length - 1; index >= 0; index -= 1) {
      stack.push(values[index]);
    }
  }
  return [...users.values()];
};

export type ListInfo = { name?: string; ownerScreenName?: string };

/**
 * The name and owner of list `listId` in a GraphQL response (ListByRestId,
 * and any other response that embeds the list object). Emojis are removed
 * from the name.
 */
export const extractListInfo = (
  payload: unknown,
  listId: string
): ListInfo | undefined => {
  const stack: unknown[] = [payload];
  while (stack.length > 0) {
    const node = stack.pop();
    if (Array.isArray(node)) {
      stack.push(...node);
      continue;
    }
    if (!isObject(node)) {
      continue;
    }
    const id = readString(node, "id_str") ?? readString(node, "rest_id");
    const name = readString(node, "name");
    if (id === listId && name && node.__typename !== "User") {
      const [owner] = extractUsers(node.user_results ?? node.user);
      return {
        name: stripEmoji(name) || undefined,
        ownerScreenName: owner?.screenName,
      };
    }
    stack.push(...Object.values(node));
  }
};

/** The GraphQL operation name in an X API URL, such as `ListMembers`. */
export const graphqlOperationName = (url: string): string | undefined => {
  const match = GRAPHQL_PATH.exec(url);
  return match?.[1];
};

const GRAPHQL_PATH = /\/i\/api\/graphql\/[^/]+\/([A-Za-z]+)/;

/** The `variables` query parameter of a GraphQL GET request, parsed. */
export const graphqlVariables = (
  url: string
): Record<string, unknown> | undefined => {
  try {
    const raw = new URL(url, "https://x.com").searchParams.get("variables");
    const parsed: unknown = raw ? JSON.parse(raw) : undefined;
    return isObject(parsed) ? parsed : undefined;
  } catch {
    // Not JSON: no variables.
  }
};

const LIST_ID_PATTERNS = [/\/i\/lists\/(\d+)/, /^(\d+)$/];

/** Reads a list id from `https://x.com/i/lists/<id>` or from the bare id. */
export const parseListId = (input: string): string | undefined => {
  const trimmed = input.trim();
  for (const pattern of LIST_ID_PATTERNS) {
    const match = pattern.exec(trimmed);
    if (match?.[1]) {
      return match[1];
    }
  }
};
