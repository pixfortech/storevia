import { isDomainError } from "@storevia/types";
import { describe, expect, it } from "vitest";
import { parseAddress, storedAddress } from "./input";

// Address input: regions come from the reference data (canonical ISO 3166-2
// codes plus names), India needs a state and a 6-digit PIN, other countries
// keep free-text regions and postal codes.

const BASE = {
  firstName: "Asha",
  lastName: "Rao",
  line1: "12 MG Road",
  city: "Bengaluru",
  countryCode: "IN",
  region: "KA",
  postalCode: "560001",
};

function fieldErrors(fn: () => unknown): Record<string, string> {
  try {
    fn();
  } catch (error) {
    if (isDomainError(error) && error.fieldErrors) return { ...error.fieldErrors };
    throw error;
  }
  throw new Error("expected a validation error");
}

describe("parseAddress: regions", () => {
  it("stores the canonical code and the name, from a code or a name", () => {
    expect(parseAddress(BASE)).toMatchObject({ region: "Karnataka", regionCode: "KA" });
    expect(parseAddress({ ...BASE, region: "  west bengal " })).toMatchObject({
      region: "West Bengal",
      regionCode: "WB",
    });
    expect(parseAddress({ ...BASE, region: "", regionCode: "wb" })).toMatchObject({
      region: "West Bengal",
      regionCode: "WB",
    });
    // A superseded ISO code resolves to the current one.
    expect(parseAddress({ ...BASE, region: "OR" })).toMatchObject({ regionCode: "OD" });
  });

  it("requires a state from the country's list", () => {
    expect(fieldErrors(() => parseAddress({ ...BASE, region: "" }))).toEqual({
      region: "Choose your state.",
    });
    expect(fieldErrors(() => parseAddress({ ...BASE, region: "Atlantis" }))).toEqual({
      region: "Choose your state.",
    });
    // California is a US state, not an Indian one.
    expect(fieldErrors(() => parseAddress({ ...BASE, region: "CA" }))).toHaveProperty("region");
    expect(
      fieldErrors(() => parseAddress({ ...BASE, countryCode: "CA", region: "", postalCode: "" })),
    ).toEqual({ region: "Choose your province or territory." });
  });

  it("doesn't trust a state picked from another country's list", () => {
    // The form showed India's states, then the shopper chose the US.
    expect(
      fieldErrors(() =>
        parseAddress({ ...BASE, countryCode: "US", region: "WA", regionCountry: "IN" }),
      ),
    ).toEqual({ region: "Choose your state." });
    // ...or Nepal (no list): the Indian state is dropped, not kept as text.
    expect(
      parseAddress({ ...BASE, countryCode: "NP", region: "WB", regionCountry: "IN" }),
    ).toMatchObject({ countryCode: "NP", region: null, regionCode: null });
    // Typed text from a country without a list is still read for one with a list.
    expect(parseAddress({ ...BASE, region: "Karnataka", regionCountry: "NP" })).toMatchObject({
      regionCode: "KA",
    });
    expect(parseAddress({ ...BASE, regionCountry: "IN" })).toMatchObject({ regionCode: "KA" });
  });

  it("keeps free text where the country has no list", () => {
    const nepal = { ...BASE, countryCode: "NP", postalCode: "44600" };
    expect(parseAddress({ ...nepal, region: "Bagmati" })).toMatchObject({
      region: "Bagmati",
      regionCode: null,
      postalCode: "44600",
    });
    expect(parseAddress({ ...nepal, region: "", regionCode: "BA" })).toMatchObject({
      region: null,
      regionCode: null,
    });
    expect(fieldErrors(() => parseAddress({ ...nepal, region: "x".repeat(101) }))).toHaveProperty(
      "region",
    );
  });

  it("prefixes billing field errors", () => {
    expect(
      fieldErrors(() =>
        parseAddress(
          {
            billing_firstName: "A",
            billing_lastName: "B",
            billing_line1: "1",
            billing_city: "C",
            billing_countryCode: "IN",
          },
          "billing_",
        ),
      ),
    ).toEqual({ billing_region: "Choose your state.", billing_postalCode: "Enter your PIN code." });
  });
});

describe("parseAddress: postal codes", () => {
  it("requires a 6-digit Indian PIN, spaces removed", () => {
    expect(parseAddress({ ...BASE, postalCode: " 560 001 " }).postalCode).toBe("560001");
    for (const bad of ["56001", "5600011", "060001", "56000A"]) {
      expect(fieldErrors(() => parseAddress({ ...BASE, postalCode: bad }))).toEqual({
        postalCode: "Enter a 6-digit PIN code, like 560001.",
      });
    }
    expect(fieldErrors(() => parseAddress({ ...BASE, postalCode: "" }))).toEqual({
      postalCode: "Enter your PIN code.",
    });
  });

  it("keeps the generic rule elsewhere", () => {
    const uk = { ...BASE, countryCode: "GB", region: "" };
    expect(parseAddress({ ...uk, postalCode: "SW1A 1AA" }).postalCode).toBe("SW1A 1AA");
    expect(parseAddress({ ...uk, postalCode: "" }).postalCode).toBeNull();
    expect(fieldErrors(() => parseAddress({ ...uk, postalCode: "x".repeat(21) }))).toHaveProperty(
      "postalCode",
    );
  });
});

describe("storedAddress", () => {
  it("reads back what parseAddress wrote", () => {
    const parsed = parseAddress(BASE);
    expect(storedAddress(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  it("keeps an address saved under older rules", () => {
    // No state, no PIN: valid when it was saved, so a payment in flight keeps it.
    const legacy = { ...BASE, region: null, regionCode: null, postalCode: null };
    expect(storedAddress(legacy)).toMatchObject({ city: "Bengaluru", postalCode: null });
  });

  it("rejects what isn't an address", () => {
    expect(storedAddress(null)).toBeNull();
    expect(storedAddress([])).toBeNull();
    expect(storedAddress({ ...BASE, city: "" })).toBeNull();
    expect(storedAddress({ ...BASE, countryCode: "India" })).toBeNull();
  });
});
