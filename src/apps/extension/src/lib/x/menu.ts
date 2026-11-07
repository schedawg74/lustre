import { SELECTORS, sleep, waitForElement } from "./dom";

/**
 * Menu entries of a post's "⋯" menu, matched by text. x.com gives most entries
 * no test id, so each pattern covers the English and German wording, plus a
 * few other languages where the wording is known.
 */
export const MENU_ENTRIES = {
  block: /\bblock\b|\bblockieren\b|\bbloquear\b|\bbloquer\b/i,
  mute: /\bmute\b|\bstummschalten\b|\bsilenciar\b/i,
  notInterested:
    /not interested|kein interesse|nicht interessiert|pas intéressé|no me interesa/i,
} as const;

export class MenuEntryMissingError extends Error {
  constructor(entry: keyof typeof MENU_ENTRIES) {
    super(`The post menu has no "${entry}" entry here.`);
    this.name = "MenuEntryMissingError";
  }
}

const SILENT_CLASS = "lustre-silent-menu";

/**
 * "Mute @user" and "Mute this conversation" both match the mute pattern, so
 * an entry that names an @handle wins.
 */
const findEntry = (entry: keyof typeof MENU_ENTRIES) => {
  const matches = [
    ...document.querySelectorAll<HTMLElement>(SELECTORS.menuItem),
  ].filter((element) => MENU_ENTRIES[entry].test(element.textContent ?? ""));
  return (
    matches.find((element) => element.textContent?.includes("@")) ?? matches[0]
  );
};

const closeMenu = () => {
  document.body.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })
  );
};

/**
 * Opens the post's "⋯" menu and clicks the entry that matches `entry`, the way
 * you would by hand. The menu stays invisible while this runs.
 */
export const clickMenuEntry = async (
  article: Element,
  entry: keyof typeof MENU_ENTRIES
): Promise<void> => {
  const caret = article.querySelector<HTMLElement>(SELECTORS.caret);
  if (!caret) {
    throw new MenuEntryMissingError(entry);
  }
  document.documentElement.classList.add(SILENT_CLASS);
  try {
    caret.click();
    const item = await waitForElement(() => findEntry(entry), 1500);
    if (!item) {
      closeMenu();
      throw new MenuEntryMissingError(entry);
    }
    item.click();
    if (entry === "block") {
      const confirm = await waitForElement(
        () => document.querySelector<HTMLElement>(SELECTORS.confirmButton),
        1500
      );
      confirm?.click();
    }
    await sleep(50);
  } finally {
    document.documentElement.classList.remove(SILENT_CLASS);
  }
};
