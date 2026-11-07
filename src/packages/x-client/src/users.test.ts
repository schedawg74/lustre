import { describe, expect, it } from "vitest";
import {
  extractBottomCursor,
  extractListInfo,
  extractUsers,
  graphqlOperationName,
  graphqlVariables,
  parseListId,
  stripEmoji,
  withGraphqlVariables,
} from "./users";

const userResult = (
  id: string,
  handle: string,
  extra: Record<string, unknown> = {}
) => ({
  __typename: "User",
  core: { name: `${handle} name`, screen_name: handle },
  legacy: {},
  rest_id: id,
  ...extra,
});

/** Trimmed from a real ListMembers response. */
const listMembersPage = {
  data: {
    list: {
      members_timeline: {
        timeline: {
          instructions: [
            { type: "TimelineClearCache" },
            {
              entries: [
                {
                  content: {
                    entryType: "TimelineTimelineItem",
                    itemContent: {
                      itemType: "TimelineUser",
                      user_results: {
                        result: userResult("1", "slopper", {
                          relationship_perspectives: { following: true },
                        }),
                      },
                    },
                  },
                  entryId: "user-1",
                },
                {
                  content: {
                    entryType: "TimelineTimelineItem",
                    itemContent: {
                      itemType: "TimelineUser",
                      user_results: {
                        result: {
                          __typename: "User",
                          legacy: {
                            blocking: true,
                            name: "Legacy",
                            screen_name: "legacyshape",
                          },
                          rest_id: "2",
                        },
                      },
                    },
                  },
                  entryId: "user-2",
                },
                {
                  content: { cursorType: "Bottom", value: "abc" },
                  entryId: "cursor-bottom-1",
                },
              ],
              type: "TimelineAddEntries",
            },
          ],
        },
      },
    },
  },
};

describe("extractUsers", () => {
  it("reads users from both the current and the legacy field layout", () => {
    expect(extractUsers(listMembersPage)).toEqual([
      {
        blocking: false,
        following: true,
        id: "1",
        name: "slopper name",
        screenName: "slopper",
      },
      {
        blocking: true,
        following: false,
        id: "2",
        name: "Legacy",
        screenName: "legacyshape",
      },
    ]);
  });

  it("drops duplicates and results without a handle", () => {
    const payload = [
      userResult("1", "a"),
      { nested: userResult("1", "a") },
      { __typename: "User", rest_id: "3" },
      { __typename: "UserUnavailable", rest_id: "4" },
    ];
    expect(extractUsers(payload).map((user) => user.id)).toEqual(["1"]);
  });

  it("returns nothing for non-objects", () => {
    expect(extractUsers(null)).toEqual([]);
    expect(extractUsers("text")).toEqual([]);
  });
});

describe("stripEmoji", () => {
  it("removes emojis, modifiers and joiners, and keeps other text", () => {
    expect(stripEmoji("Thread Machine \u{1F9F5}")).toBe("Thread Machine");
    expect(
      stripEmoji("\u{1F468}\u{1F3FD}\u200D\u{1F4BB} Dev \u{1F1E9}\u{1F1EA} Guy")
    ).toBe("Dev Guy");
    expect(stripEmoji("Caf\u00E9 #1 @ 10:00")).toBe("Caf\u00E9 #1 @ 10:00");
  });

  it("falls back to the handle when the name is only emojis", () => {
    const [user] = extractUsers({
      ...userResult("9", "fire", {}),
      core: { name: "\u{1F525}\u{1F525}", screen_name: "fire" },
    });
    expect(user?.name).toBe("fire");
  });
});

describe("extractListInfo", () => {
  it("reads the list name and owner, and ignores users with the same id", () => {
    const payload = {
      data: {
        list: {
          id_str: "42",
          name: "AI slop \u{1F916}",
          user_results: { result: userResult("42", "curator") },
        },
      },
    };
    expect(extractListInfo(payload, "42")).toEqual({
      name: "AI slop",
      ownerScreenName: "curator",
    });
    expect(extractListInfo(payload, "7")).toBeUndefined();
    expect(extractListInfo({ data: {} }, "42")).toBeUndefined();
  });
});

describe("pagination", () => {
  it("reads the bottom cursor and ignores the top one", () => {
    const payload = {
      entries: [
        { content: { cursorType: "Top", value: "top" } },
        { content: { cursorType: "Bottom", value: "next-page" } },
      ],
    };
    expect(extractBottomCursor(payload)).toBe("next-page");
    expect(extractBottomCursor({ entries: [] })).toBeUndefined();
  });

  it("replaces variables and keeps the other parameters", () => {
    const variables = encodeURIComponent(
      JSON.stringify({ count: 20, listId: "1" })
    );
    const url = `https://x.com/i/api/graphql/q/ListMembers?variables=${variables}&features=%7B%22a%22%3Atrue%7D`;
    const next = new URL(withGraphqlVariables(url, { cursor: "c2" }));
    expect(JSON.parse(next.searchParams.get("variables") ?? "")).toEqual({
      count: 20,
      cursor: "c2",
      listId: "1",
    });
    expect(next.searchParams.get("features")).toBe('{"a":true}');
  });
});

describe("graphqlOperationName", () => {
  it("reads the operation from an API URL", () => {
    expect(
      graphqlOperationName(
        "https://x.com/i/api/graphql/AbC-12_x/ListMembers?variables=%7B%7D"
      )
    ).toBe("ListMembers");
    expect(graphqlOperationName("https://x.com/home")).toBeUndefined();
  });
});

describe("graphqlVariables", () => {
  it("parses the variables parameter", () => {
    const variables = encodeURIComponent(
      JSON.stringify({ count: 20, listId: "123" })
    );
    expect(
      graphqlVariables(
        `https://x.com/i/api/graphql/abc/ListMembers?variables=${variables}`
      )
    ).toEqual({ count: 20, listId: "123" });
    expect(
      graphqlVariables("https://x.com/i/api/graphql/abc/X")
    ).toBeUndefined();
    expect(
      graphqlVariables("https://x.com/i/api/graphql/abc/X?variables=%7Bbad")
    ).toBeUndefined();
  });
});

describe("parseListId", () => {
  it("accepts list URLs and bare ids", () => {
    expect(parseListId("https://x.com/i/lists/2116659176894071283")).toBe(
      "2116659176894071283"
    );
    expect(
      parseListId("https://twitter.com/i/lists/2116659176894071283/members")
    ).toBe("2116659176894071283");
    expect(parseListId(" 2116659176894071283 ")).toBe("2116659176894071283");
    expect(parseListId("https://x.com/someone")).toBeUndefined();
  });
});
