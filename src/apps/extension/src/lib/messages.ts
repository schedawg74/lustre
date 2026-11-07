import type { AddResult, Outcome, QueueEntry } from "@lustre/block-queue/queue";
import type { ListInfo, XUser } from "@lustre/x-client/users";
import { browser } from "wxt/browser";
import type { RunnerState } from "./storage";

/**
 * Every write to the queue, the runner state and the import request goes
 * through the background worker. It applies them one after another, so the
 * popup and several x.com tabs never overwrite each other's changes.
 */
export type Message =
  | { type: "import/start"; listId: string }
  | {
      type: "import/finish";
      listId: string;
      list?: ListInfo;
      users: XUser[];
    }
  | { type: "import/cancel"; listId: string }
  | { type: "lists/remove"; listId: string }
  | {
      type: "queue/outcome";
      userId: string;
      outcome: Outcome;
      /** The entry as the runner saw it (see recordOutcome). */
      attempted: QueueEntry;
    }
  | { type: "queue/skip"; userId: string }
  | { type: "queue/retryFailed" }
  | { type: "runner/update"; patch: Partial<RunnerState> };

export type ImportSummary = Omit<AddResult, "queue"> & {
  /** The list was removed while its import ran; nothing was added. */
  cancelled?: boolean;
};

export type MessageResult<M extends Message> = M extends {
  type: "import/finish";
}
  ? ImportSummary
  : undefined;

export const send = <M extends Message>(message: M) =>
  browser.runtime.sendMessage(message) as Promise<MessageResult<M>>;
