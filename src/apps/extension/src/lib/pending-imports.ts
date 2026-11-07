/**
 * Imports the owner started and that are still collecting members, keyed
 * by list id. Several lists can import at the same time; each one finishes
 * or is cancelled on its own.
 */
export type PendingImports = Record<string, { requestedAt: number }>;

/** A request older than this was abandoned (tab closed, crash). */
export const IMPORT_TTL_MS = 10 * 60 * 1000;

export const startImport = (
  imports: PendingImports,
  listId: string,
  now: number
): PendingImports => ({ ...imports, [listId]: { requestedAt: now } });

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
