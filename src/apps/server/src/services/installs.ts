import { createHash, randomBytes, randomUUID } from "node:crypto";
import { type Database, installs } from "@lustre/db";
import { and, eq, lt } from "drizzle-orm";

const LAST_SEEN_RESOLUTION_MS = 60 * 60 * 1000;

export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export const createInstallService = (db: Database, now: () => Date) => ({
  // Returns the install id for a valid token, else undefined.
  authenticate: (token: string): string | undefined => {
    const row = db
      .select({ id: installs.id })
      .from(installs)
      .where(eq(installs.tokenHash, hashToken(token)))
      .get();
    if (!row) {
      return;
    }
    // One write per hour at most, so reads stay reads.
    const seenAt = now();
    db.update(installs)
      .set({ lastSeenAt: seenAt })
      .where(
        and(
          eq(installs.id, row.id),
          lt(
            installs.lastSeenAt,
            new Date(seenAt.getTime() - LAST_SEEN_RESOLUTION_MS)
          )
        )
      )
      .run();
    return row.id;
  },

  create: () => {
    const installId = randomUUID();
    const token = randomBytes(32).toString("base64url");
    const createdAt = now();
    db.insert(installs)
      .values({
        createdAt,
        id: installId,
        lastSeenAt: createdAt,
        tokenHash: hashToken(token),
      })
      .run();
    return { installId, token };
  },
});
