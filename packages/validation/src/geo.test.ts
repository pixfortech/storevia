import { describe, expect, it } from "vitest";
import {
  countries,
  countryByCode,
  findRegion,
  hasRegions,
  regionByCode,
  regionByName,
} from "./geo";

// The reference data is what zones, tax rates and addresses are checked
// against, so its shape is tested as strictly as code.

describe("countries", () => {
  it("have unique ISO alpha-2 codes and names, sorted by name", () => {
    const codes = countries.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^[A-Z]{2}$/);
    const names = countries.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("cover every country the dashboard's selectors offered", () => {
    const offered =
      "IN US GB AE AU CA DE FR ES IT NL IE SG MY ID PH TH VN JP KR NZ ZA NG KE EG SA QA BR MX AR CL CO SE NO DK FI CH AT BE PT PL CZ BD LK NP PK";
    for (const code of offered.split(" ")) expect(countryByCode(code)?.code).toBe(code);
    expect(countries).toHaveLength(46);
  });

  it("list regions with unique codes and names that fit the stored code format", () => {
    for (const country of countries.filter((c) => c.regions)) {
      const regions = country.regions ?? [];
      expect(country.regionLabel, country.code).toBeTruthy();
      expect(country.regionsLabel, country.code).toBeTruthy();
      const codes = regions.map((r) => r.code);
      expect(new Set(codes).size, country.code).toBe(codes.length);
      const names = regions.map((r) => r.name.toLowerCase());
      expect(new Set(names).size, country.code).toBe(names.length);
      for (const r of regions) {
        expect(r.code).toMatch(/^[A-Z0-9-]{1,10}$/);
        // A superseded code never shadows a current one.
        for (const former of r.formerCodes ?? []) expect(codes).not.toContain(former);
      }
    }
  });

  it("has every Indian state and union territory, with current ISO 3166-2 codes", () => {
    const india = countryByCode("IN");
    expect(india?.regions).toHaveLength(36); // 28 states + 8 union territories
    const code = (name: string) => regionByName("IN", name)?.code;
    expect(code("Karnataka")).toBe("KA");
    expect(code("Maharashtra")).toBe("MH");
    expect(code("Tamil Nadu")).toBe("TN");
    expect(code("West Bengal")).toBe("WB");
    expect(code("Delhi")).toBe("DL");
    expect(code("Telangana")).toBe("TS");
    expect(code("Chhattisgarh")).toBe("CG");
    expect(code("Odisha")).toBe("OD");
    expect(code("Uttarakhand")).toBe("UK");
    expect(code("Ladakh")).toBe("LA");
    expect(code("Dadra and Nagar Haveli and Daman and Diu")).toBe("DH");
  });

  it("lists the US states and DC, Canada's provinces and territories, and Australia's", () => {
    expect(countryByCode("US")?.regions).toHaveLength(51);
    expect(countryByCode("CA")?.regions).toHaveLength(13);
    expect(countryByCode("AU")?.regions).toHaveLength(8);
    expect(hasRegions("GB")).toBe(false);
    expect(countryByCode("GB")?.regions).toBeNull();
  });
});

describe("lookups", () => {
  it("find countries by code in any case", () => {
    expect(countryByCode(" in ")?.name).toBe("India");
    expect(countryByCode("XX")).toBeUndefined();
    expect(countryByCode("")).toBeUndefined();
    expect(countryByCode(null)).toBeUndefined();
  });

  it("find regions by code, including superseded ISO codes", () => {
    expect(regionByCode("IN", "wb")?.name).toBe("West Bengal");
    expect(regionByCode("IN", "OR")?.code).toBe("OD");
    expect(regionByCode("IN", "TG")?.code).toBe("TS");
    expect(regionByCode("IN", "CT")?.code).toBe("CG");
    expect(regionByCode("IN", "CA")).toBeUndefined();
    expect(regionByCode("US", "CA")?.name).toBe("California");
    expect(regionByCode("GB", "ENG")).toBeUndefined();
    expect(regionByCode("ZZ", "KA")).toBeUndefined();
  });

  it("find regions by name, ignoring case, spacing, accents and '&'", () => {
    expect(regionByName("IN", "  west   BENGAL ")?.code).toBe("WB");
    expect(regionByName("IN", "Jammu & Kashmir")?.code).toBe("JK");
    expect(regionByName("IN", "Orissa")?.code).toBe("OD");
    expect(regionByName("IN", "Pondicherry")?.code).toBe("PY");
    expect(regionByName("CA", "Quebec")?.code).toBe("QC");
    expect(regionByName("CA", "Québec")?.code).toBe("QC");
    expect(regionByName("US", "Washington D.C.")?.code).toBe("DC");
    expect(regionByName("IN", "Bengal")).toBeUndefined();
    expect(regionByName("IN", "")).toBeUndefined();
  });

  it("findRegion takes a code or a name", () => {
    expect(findRegion("IN", "KA")?.name).toBe("Karnataka");
    expect(findRegion("IN", "karnataka")?.code).toBe("KA");
    expect(findRegion(countryByCode("AU"), "WA")?.name).toBe("Western Australia");
    expect(findRegion("NP", "Bagmati")).toBeUndefined();
  });

  it("hasRegions takes a country or a code", () => {
    expect(hasRegions("IN")).toBe(true);
    expect(hasRegions(countryByCode("US"))).toBe(true);
    expect(hasRegions("NP")).toBe(false);
    expect(hasRegions("XX")).toBe(false);
    expect(hasRegions(undefined)).toBe(false);
  });
});
