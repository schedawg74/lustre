import type { EntryStatus } from "@lustre/block-queue/queue";
import { Icon } from "@lustre/icons/react";
import { useState } from "react";
import { AccountsTab } from "./accounts-tab";
import { Activity, ActivityNotices } from "./activity";
import { ListsTab } from "./lists-tab";
import { SettingsTab } from "./settings-tab";
import { type TabItem, Tabs } from "./ui";

type TabId = "lists" | "accounts" | "settings";

const TABS: readonly TabItem<TabId>[] = [
  { icon: "volumen", id: "lists", label: "Lists" },
  { icon: "damnatio", id: "accounts", label: "Accounts" },
  { icon: "scutum", id: "settings", label: "Settings" },
];

const PANEL_ID = "lustre-panel";

export const App = () => {
  const [tab, setTab] = useState<TabId>("lists");
  // Kept here so the header can open Accounts on a given filter.
  const [accountsFilter, setAccountsFilter] = useState<EntryStatus>();
  const showAccounts = (filter: EntryStatus) => {
    setAccountsFilter(filter);
    setTab("accounts");
  };
  return (
    <main className="flex h-[560px] w-[380px] flex-col bg-canvas font-sans text-text antialiased">
      <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
        <h1 className="inscription flex items-center gap-2 font-semibold text-base tracking-[0.28em]">
          <Icon className="text-accent" name="meandros" size={18} />
          Lustre
        </h1>
        <Activity onShowAccounts={showAccounts} />
      </header>
      <ActivityNotices />
      <nav aria-label="Lustre">
        <Tabs active={tab} items={TABS} onChange={setTab} panelId={PANEL_ID} />
      </nav>
      <div
        className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
        id={PANEL_ID}
        role="tabpanel"
      >
        {tab === "lists" ? <ListsTab /> : null}
        {tab === "accounts" ? (
          <AccountsTab
            filter={accountsFilter}
            onFilterChange={setAccountsFilter}
          />
        ) : null}
        {tab === "settings" ? <SettingsTab /> : null}
      </div>
    </main>
  );
};
