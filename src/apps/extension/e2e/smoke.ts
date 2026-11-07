/**
 * Loads the built Chrome extension into Playwright's Chromium and runs it
 * against a fake x.com: list import, the block queue, and the post buttons.
 * x.com itself is never contacted; every request to it is answered here.
 *
 * Run `pnpm build` first, then `pnpm --filter @lustre/extension test:e2e`.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { chromium, type Page, type Route } from "playwright";

const EXTENSION_DIR = path.resolve(
  import.meta.dirname,
  "../.output/chrome-mv3"
);
const LIST_ID = "123";

type ApiCall = { path: string; body: string | null; authorization?: string };

const memberEntry = (
  id: string,
  handle: string,
  extra: Record<string, unknown> = {}
) => ({
  content: {
    itemContent: {
      user_results: {
        result: {
          __typename: "User",
          core: { name: `Name ${handle}`, screen_name: handle },
          legacy: {},
          rest_id: id,
          ...extra,
        },
      },
    },
  },
  entryId: `user-${id}`,
});

const membersPages: Record<string, unknown[]> = {
  "0": [
    memberEntry("101", "slop_a"),
    memberEntry("102", "friend_b", {
      relationship_perspectives: { following: true },
    }),
  ],
  "1": [memberEntry("103", "slop_c")],
};

const membersResponse = (cursor: string) => {
  const entries = membersPages[cursor] ?? [];
  return {
    data: {
      list: {
        members_timeline: { timeline: { instructions: [{ entries }] } },
      },
    },
    // Read by the fake page to draw one row per member.
    rows: entries.length,
  };
};

const post = (handle: string, text: string) => `
<div data-testid="cellInnerDiv"><article data-testid="tweet">
  <div data-testid="User-Name"><a href="/${handle}">Name</a> <a href="/${handle}">@${handle}</a></div>
  <button data-testid="caret" onclick="openMenu('${handle}')">more</button>
  <p>${text}</p>
  <div role="group"><button data-testid="reply">reply</button><button>like</button></div>
</article></div>`;

const homePage = `<!doctype html><html lang="en"><body>
<nav><a data-testid="AppTabBar_Profile_Link" href="/me">Profile</a></nav>
${post("slopposter", "10 AI tools that will replace your job")}
${post("me", "my own post")}
<div id="layers"></div>
<script>
window.menuClicks = [];
function openMenu(handle) {
  const layers = document.getElementById("layers");
  const menu = document.createElement("div");
  menu.setAttribute("role", "menu");
  for (const text of ["Not interested in this post", "Mute this conversation", "Mute @" + handle, "Block @" + handle]) {
    const item = document.createElement("div");
    item.setAttribute("role", "menuitem");
    item.textContent = text;
    item.onclick = () => { window.menuClicks.push(text); menu.remove(); };
    menu.append(item);
  }
  layers.append(menu);
}
</script></body></html>`;

const membersPage = `<!doctype html><html><body><div id="rows"></div>
<script>
let cursor = 0;
function loadMore() {
  const xhr = new XMLHttpRequest();
  const variables = encodeURIComponent(JSON.stringify({ listId: "${LIST_ID}", count: 20, cursor: String(cursor) }));
  xhr.open("GET", "/i/api/graphql/q1/ListMembers?variables=" + variables);
  xhr.setRequestHeader("authorization", "Bearer CAPTURED");
  xhr.onload = () => {
    for (let i = 0; i < JSON.parse(xhr.responseText).rows; i++) {
      const row = document.createElement("div");
      row.dataset.testid = "UserCell";
      row.style.height = "400px";
      document.getElementById("rows").append(row);
    }
    cursor++;
  };
  xhr.send();
}
loadMore();
addEventListener("scroll", () => { if (cursor < 3) loadMore(); });
</script></body></html>`;

const fakeX = (calls: ApiCall[]) => (route: Route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.pathname.startsWith("/i/api/1.1/")) {
    calls.push({
      authorization: request.headers().authorization,
      body: request.postData(),
      path: url.pathname,
    });
    return route.fulfill({ json: {} });
  }
  if (url.pathname.endsWith("/ListMembers")) {
    const { cursor } = JSON.parse(url.searchParams.get("variables") ?? "{}");
    return route.fulfill({ json: membersResponse(String(cursor)) });
  }
  const body = url.pathname.startsWith("/i/lists/") ? membersPage : homePage;
  return route.fulfill({ body, contentType: "text/html" });
};

const openPopup = async (page: Page, extensionId: string) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForSelector("h1");
};

const main = async () => {
  const calls: ApiCall[] = [];
  const context = await chromium.launchPersistentContext("", {
    args: [
      `--disable-extensions-except=${EXTENSION_DIR}`,
      `--load-extension=${EXTENSION_DIR}`,
    ],
    channel: "chromium",
    headless: true,
  });
  try {
    await context.addCookies([
      { domain: ".x.com", name: "ct0", path: "/", value: "csrf123" },
    ]);
    await context.route("https://x.com/**", fakeX(calls));
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    const extensionId = new URL(worker.url()).host;
    // A string, because `chrome` exists only inside the extension worker.
    await worker.evaluate(
      "chrome.storage.local.set({ settings: { blockDelayMs: 200 } })"
    );

    // 1. Import a list from the popup.
    const popup = await context.newPage();
    await openPopup(popup, extensionId);
    await popup.fill('input[type="url"]', `https://x.com/i/lists/${LIST_ID}`);
    const opened = context.waitForEvent("page");
    await popup.click('button[type="submit"]');
    const listTab = await opened;
    // The tab can load before the route above applies to it; load it again.
    await listTab.goto(`https://x.com/i/lists/${LIST_ID}/members`);
    await listTab.waitForFunction(
      () =>
        document
          .querySelector(".lustre-panel p")
          ?.textContent?.startsWith("Found"),
      null,
      { timeout: 30_000 }
    );
    assert.match(
      (await listTab.textContent(".lustre-panel p")) ?? "",
      /Found 3 members\. 2 new accounts queued.*1 you follow/
    );

    // 2. Run the queue.
    await listTab.click(".lustre-panel button.lustre-primary");
    const deadline = Date.now() + 10_000;
    while (calls.length < 2 && Date.now() < deadline) {
      await listTab.waitForTimeout(100);
    }
    assert.deepEqual(
      calls.map((call) => [call.path, call.body, call.authorization]),
      [
        ["/i/api/1.1/blocks/create.json", "user_id=101", "Bearer CAPTURED"],
        ["/i/api/1.1/blocks/create.json", "user_id=103", "Bearer CAPTURED"],
      ]
    );

    // 3. Post buttons.
    const home = await context.newPage();
    await home.goto("https://x.com/home");
    await home.waitForSelector(".lustre-actions");
    assert.equal(await home.locator(".lustre-actions").count(), 1);
    assert.equal(await home.locator(".lustre-action").count(), 3);

    const before = calls.length;
    await home.click(".lustre-action-mute");
    await home.waitForSelector(".lustre-toast");
    assert.equal(await home.locator(".lustre-hidden").count(), 1);
    await home.click(".lustre-toast button");
    await home.waitForFunction(
      () => document.querySelectorAll(".lustre-hidden").length === 0
    );
    assert.deepEqual(
      calls.slice(before).map((call) => [call.path, call.body]),
      [
        ["/i/api/1.1/mutes/users/create.json", "screen_name=slopposter"],
        ["/i/api/1.1/mutes/users/destroy.json", "screen_name=slopposter"],
      ]
    );

    await home.click(".lustre-action-notInterested");
    await home.waitForFunction(
      () => (window as { menuClicks?: string[] }).menuClicks?.length === 1
    );
    assert.deepEqual(
      await home.evaluate(
        () => (window as { menuClicks?: string[] }).menuClicks
      ),
      ["Not interested in this post"]
    );

    // 4. The popup shows the result.
    const popupAfter = await context.newPage();
    await openPopup(popupAfter, extensionId);
    const stats = await popupAfter
      .locator('[data-testid="queue-stats"] dd')
      .allTextContents();
    assert.deepEqual(stats, ["0", "2", "1", "0"]);
    process.stdout.write("e2e smoke test passed\n");
  } finally {
    await context.close();
  }
};

await main();
