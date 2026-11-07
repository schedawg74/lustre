/**
 * Imports the owner started and that are still collecting members, keyed
 * by list id. Several lists can import at the same time; each one finishes
 * or is cancelled on its own.
 */
export type PendingImport = {
  /** Epoch ms of the request or the last progress; keeps the import alive. */
  requestedAt: number;
  /** The background tab the extension opened for this import. */
  tabId?: number;
  /** Members collected so far. */
  found?: number;
};

export type PendingImports = Record<string, PendingImport>;

/** A request older than this was abandoned (tab closed, crash). */
export const IMPORT_TTL_MS = 10 * 60 * 1000;

export const startImport = (
  imports: PendingImports,
  listId: string,
  now: number
): PendingImports => ({ ...imports, [listId]: { requestedAt: now } });

/** Records progress or the import's tab on a running import. */
export const updateImport = (
  imports: PendingImports,
  listId: string,
  patch: Partial<PendingImport>
): PendingImports => {
  const current = imports[listId];
  return current ? { ...imports, [listId]: { ...current, ...patch } } : imports;
};

/** Ends one import (finished, cancelled or its list removed). */
export const endImport = (
  imports: PendingImports,
  listId: string
): PendingImports => {
  const { [listId]: _ended, ...rest } = imports;
  return rest;
};

/** True while `listId` has an import that has not expired. */
export const isImporting = (
  imports: PendingImports,
  listId: string,
  now: number
): boolean => {
  const request = imports[listId];
  return request !== undefined && now - request.requestedAt <= IMPORT_TTL_MS;
};
