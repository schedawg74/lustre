import { describe, expect, it } from "vitest";
import {
  endImport,
  IMPORT_TTL_MS,
  isImporting,
  startImport,
} from "./pending-imports";

describe("pending imports", () => {
  it("keeps overlapping imports apart", () => {
    let imports = startImport({}, "a", 0);
    imports = startImport(imports, "b", 10);
    expect(isImporting(imports, "a", 20)).toBe(true);
    imports = endImport(imports, "b");
    expect(isImporting(imports, "a", 20)).toBe(true);
    expect(isImporting(imports, "b", 20)).toBe(false);
  });

  it("forgets an import after its time to live", () => {
    const imports = startImport({}, "a", 0);
    expect(isImporting(imports, "a", IMPORT_TTL_MS)).toBe(true);
    expect(isImporting(imports, "a", IMPORT_TTL_MS + 1)).toBe(false);
  });
});
