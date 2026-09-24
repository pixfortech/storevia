import { describe, expect, it } from "vitest";
import { parseTypeId, toTypeId } from "./typeid";
import { isUuid, uuidv7 } from "./uuid";

describe("uuidv7", () => {
  it("produces RFC 9562 version-7 UUIDs that sort by time", () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_000_001);
    expect(isUuid(a)).toBe(true);
    expect(a[14]).toBe("7");
    expect(["8", "9", "a", "b"]).toContain(a[19]);
    expect(a < b).toBe(true);
  });
});

describe("TypeID", () => {
  it("round-trips", () => {
    for (let i = 0; i < 200; i++) {
      const id = uuidv7();
      const typeId = toTypeId("store", id);
      expect(typeId).toMatch(/^store_[0-7][0-9a-z]{25}$/);
      expect(parseTypeId("store", typeId)).toBe(id);
    }
  });

  it("handles the zero and max UUIDs", () => {
    expect(
      parseTypeId("organisation", toTypeId("organisation", "00000000-0000-0000-0000-000000000000")),
    ).toBe("00000000-0000-0000-0000-000000000000");
    expect(
      parseTypeId("organisation", toTypeId("organisation", "ffffffff-ffff-ffff-ffff-ffffffffffff")),
    ).toBe("ffffffff-ffff-ffff-ffff-ffffffffffff");
  });

  it.each([
    ["wrong prefix", "org_01j9zq3v4n8xkq2m7c5r6t8w9y"],
    ["no prefix", "01j9zq3v4n8xkq2m7c5r6t8w9y"],
    ["too short", "store_01j9zq"],
    ["too long", "store_01j9zq3v4n8xkq2m7c5r6t8w9yy"],
    ["overflowing first char", "store_81j9zq3v4n8xkq2m7c5r6t8w9y"],
    ["excluded letter", "store_01j9zq3v4n8xkq2m7c5r6t8w9u"],
    ["upper case", "store_01J9ZQ3V4N8XKQ2M7C5R6T8W9Y"],
    ["raw uuid", "0190f2a4-0000-7000-8000-000000000000"],
    ["sql", "store_' OR 1=1 --"],
    ["empty", ""],
  ])("rejects %s", (_label, value) => {
    expect(parseTypeId("store", value)).toBeNull();
  });

  it("refuses to encode non-UUIDs", () => {
    expect(() => toTypeId("store", "not-a-uuid")).toThrow();
  });
});
