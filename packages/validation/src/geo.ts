// Country and region reference data (09-commerce §4, ADR-0031 §1, §7): the
// one list the store country, shipping zones, tax rates and checkout
// addresses are chosen from. Pure data and lookups, safe on server and
// client, no dependencies.
//
// Country codes are ISO 3166-1 alpha-2. Region codes are ISO 3166-2
// subdivision codes without the country prefix ("IN-KA" is stored as "KA"),
// so shipping zones, tax rates and addresses all use the same canonical
// codes. A country with `regions: null` has no list here yet: addresses take
// free-text regions and zones cover the whole country. To add a country's
// regions, give it the full ISO 3166-2 list (current codes; superseded codes
// go in `formerCodes` so older input still resolves), a `regionLabel` and
// `regionsLabel`, and a test of its count in geo.test.ts.

export interface Region {
  /** ISO 3166-2 subdivision code without the country prefix, e.g. "KA". */
  readonly code: string;
  /** English name, as shown in address forms. */
  readonly name: string;
  /** Superseded ISO codes still accepted as input (e.g. "OR" for Odisha). */
  readonly formerCodes?: readonly string[];
  /** Other names still in common use (e.g. "Orissa"). */
  readonly otherNames?: readonly string[];
}

export interface PostalCodeRule {
  /** What the code is called, e.g. "PIN code". */
  readonly label: string;
  /** Matched after spaces are removed. */
  readonly pattern: RegExp;
  readonly example: string;
  readonly required: boolean;
  /** Digits only (a numeric keyboard on phones). */
  readonly numeric: boolean;
  /** Shown when a code doesn't match. */
  readonly message: string;
}

export interface Country {
  /** ISO 3166-1 alpha-2. */
  readonly code: string;
  /** English short name. */
  readonly name: string;
  /** Every first-level subdivision used in addresses, or null when we don't list them yet. */
  readonly regions: readonly Region[] | null;
  /** What a region is called in an address ("State", "Province or territory"); null without a list. */
  readonly regionLabel: string | null;
  /** The same, for the whole list ("States and union territories"); null without a list. */
  readonly regionsLabel: string | null;
  /** How the country's postal codes look, when checked; null keeps the generic free-text rule. */
  readonly postalCode: PostalCodeRule | null;
}

const r = (code: string, name: string, extra: Omit<Region, "code" | "name"> = {}): Region => ({
  code,
  name,
  ...extra,
});

/**
 * ISO 3166-2:IN as of 2025: 28 states and 8 union territories. Codes changed
 * by ISO since 2019: Odisha OR → OD (2019), Chhattisgarh CT → CG, Telangana
 * TG → TS and Uttarakhand UT → UK (2023); Dadra and Nagar Haveli (DN) and
 * Daman and Diu (DD) merged into DH (2020); Ladakh (LA) was added in 2019.
 */
const INDIA: readonly Region[] = [
  // States.
  r("AP", "Andhra Pradesh"),
  r("AR", "Arunachal Pradesh"),
  r("AS", "Assam"),
  r("BR", "Bihar"),
  r("CG", "Chhattisgarh", { formerCodes: ["CT"] }),
  r("GA", "Goa"),
  r("GJ", "Gujarat"),
  r("HR", "Haryana"),
  r("HP", "Himachal Pradesh"),
  r("JH", "Jharkhand"),
  r("KA", "Karnataka"),
  r("KL", "Kerala"),
  r("MP", "Madhya Pradesh"),
  r("MH", "Maharashtra"),
  r("MN", "Manipur"),
  r("ML", "Meghalaya"),
  r("MZ", "Mizoram"),
  r("NL", "Nagaland"),
  r("OD", "Odisha", { formerCodes: ["OR"], otherNames: ["Orissa"] }),
  r("PB", "Punjab"),
  r("RJ", "Rajasthan"),
  r("SK", "Sikkim"),
  r("TN", "Tamil Nadu"),
  r("TS", "Telangana", { formerCodes: ["TG"] }),
  r("TR", "Tripura"),
  r("UP", "Uttar Pradesh"),
  r("UK", "Uttarakhand", { formerCodes: ["UT"], otherNames: ["Uttaranchal"] }),
  r("WB", "West Bengal"),
  // Union territories.
  r("AN", "Andaman and Nicobar Islands"),
  r("CH", "Chandigarh"),
  r("DH", "Dadra and Nagar Haveli and Daman and Diu", { formerCodes: ["DN", "DD"] }),
  r("DL", "Delhi", { otherNames: ["New Delhi", "NCT of Delhi"] }),
  r("JK", "Jammu and Kashmir"),
  r("LA", "Ladakh"),
  r("LD", "Lakshadweep"),
  r("PY", "Puducherry", { otherNames: ["Pondicherry"] }),
];

/** ISO 3166-2:US: the 50 states and the District of Columbia (the USPS codes). */
const UNITED_STATES: readonly Region[] = [
  r("AL", "Alabama"),
  r("AK", "Alaska"),
  r("AZ", "Arizona"),
  r("AR", "Arkansas"),
  r("CA", "California"),
  r("CO", "Colorado"),
  r("CT", "Connecticut"),
  r("DE", "Delaware"),
  r("DC", "District of Columbia", { otherNames: ["Washington DC", "Washington D.C."] }),
  r("FL", "Florida"),
  r("GA", "Georgia"),
  r("HI", "Hawaii"),
  r("ID", "Idaho"),
  r("IL", "Illinois"),
  r("IN", "Indiana"),
  r("IA", "Iowa"),
  r("KS", "Kansas"),
  r("KY", "Kentucky"),
  r("LA", "Louisiana"),
  r("ME", "Maine"),
  r("MD", "Maryland"),
  r("MA", "Massachusetts"),
  r("MI", "Michigan"),
  r("MN", "Minnesota"),
  r("MS", "Mississippi"),
  r("MO", "Missouri"),
  r("MT", "Montana"),
  r("NE", "Nebraska"),
  r("NV", "Nevada"),
  r("NH", "New Hampshire"),
  r("NJ", "New Jersey"),
  r("NM", "New Mexico"),
  r("NY", "New York"),
  r("NC", "North Carolina"),
  r("ND", "North Dakota"),
  r("OH", "Ohio"),
  r("OK", "Oklahoma"),
  r("OR", "Oregon"),
  r("PA", "Pennsylvania"),
  r("RI", "Rhode Island"),
  r("SC", "South Carolina"),
  r("SD", "South Dakota"),
  r("TN", "Tennessee"),
  r("TX", "Texas"),
  r("UT", "Utah"),
  r("VT", "Vermont"),
  r("VA", "Virginia"),
  r("WA", "Washington"),
  r("WV", "West Virginia"),
  r("WI", "Wisconsin"),
  r("WY", "Wyoming"),
];

/** ISO 3166-2:CA: 10 provinces and 3 territories. */
const CANADA: readonly Region[] = [
  r("AB", "Alberta"),
  r("BC", "British Columbia"),
  r("MB", "Manitoba"),
  r("NB", "New Brunswick"),
  r("NL", "Newfoundland and Labrador"),
  r("NS", "Nova Scotia"),
  r("NT", "Northwest Territories"),
  r("NU", "Nunavut"),
  r("ON", "Ontario"),
  r("PE", "Prince Edward Island"),
  r("QC", "Quebec", { otherNames: ["Québec"] }),
  r("SK", "Saskatchewan"),
  r("YT", "Yukon"),
];

/** ISO 3166-2:AU: 6 states and 2 mainland territories. */
const AUSTRALIA: readonly Region[] = [
  r("ACT", "Australian Capital Territory"),
  r("NSW", "New South Wales"),
  r("NT", "Northern Territory"),
  r("QLD", "Queensland"),
  r("SA", "South Australia"),
  r("TAS", "Tasmania"),
  r("VIC", "Victoria"),
  r("WA", "Western Australia"),
];

const INDIA_PIN: PostalCodeRule = {
  label: "PIN code",
  pattern: /^[1-9][0-9]{5}$/,
  example: "560001",
  required: true,
  numeric: true,
  message: "Enter a 6-digit PIN code, like 560001.",
};

const c = (
  code: string,
  name: string,
  more: Partial<Pick<Country, "regions" | "regionLabel" | "regionsLabel" | "postalCode">> = {},
): Country => ({
  code,
  name,
  regions: more.regions ?? null,
  regionLabel: more.regionLabel ?? null,
  regionsLabel: more.regionsLabel ?? null,
  postalCode: more.postalCode ?? null,
});

/** Every country Storevia's selectors offer, sorted by English name. */
export const countries: readonly Country[] = [
  c("AR", "Argentina"),
  c("AU", "Australia", {
    regions: AUSTRALIA,
    regionLabel: "State or territory",
    regionsLabel: "States and territories",
  }),
  c("AT", "Austria"),
  c("BD", "Bangladesh"),
  c("BE", "Belgium"),
  c("BR", "Brazil"),
  c("CA", "Canada", {
    regions: CANADA,
    regionLabel: "Province or territory",
    regionsLabel: "Provinces and territories",
  }),
  c("CL", "Chile"),
  c("CO", "Colombia"),
  c("CZ", "Czechia"),
  c("DK", "Denmark"),
  c("EG", "Egypt"),
  c("FI", "Finland"),
  c("FR", "France"),
  c("DE", "Germany"),
  c("IN", "India", {
    regions: INDIA,
    regionLabel: "State",
    regionsLabel: "States and union territories",
    postalCode: INDIA_PIN,
  }),
  c("ID", "Indonesia"),
  c("IE", "Ireland"),
  c("IT", "Italy"),
  c("JP", "Japan"),
  c("KE", "Kenya"),
  c("MY", "Malaysia"),
  c("MX", "Mexico"),
  c("NP", "Nepal"),
  c("NL", "Netherlands"),
  c("NZ", "New Zealand"),
  c("NG", "Nigeria"),
  c("NO", "Norway"),
  c("PK", "Pakistan"),
  c("PH", "Philippines"),
  c("PL", "Poland"),
  c("PT", "Portugal"),
  c("QA", "Qatar"),
  c("SA", "Saudi Arabia"),
  c("SG", "Singapore"),
  c("ZA", "South Africa"),
  c("KR", "South Korea"),
  c("ES", "Spain"),
  c("LK", "Sri Lanka"),
  c("SE", "Sweden"),
  c("CH", "Switzerland"),
  c("TH", "Thailand"),
  c("AE", "United Arab Emirates"),
  c("GB", "United Kingdom"),
  c("US", "United States", {
    regions: UNITED_STATES,
    regionLabel: "State",
    regionsLabel: "States",
  }),
  c("VN", "Vietnam"),
];

const byCode = new Map(countries.map((country) => [country.code, country]));

/** Case-, accent- and spacing-insensitive form of a name; "&" reads as "and". */
function key(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type CountryRef = Country | string | null | undefined;

const resolve = (country: CountryRef): Country | undefined =>
  typeof country === "string" ? countryByCode(country) : (country ?? undefined);

/** The country with this ISO code (any case), if Storevia lists it. */
export function countryByCode(code: string | null | undefined): Country | undefined {
  return code ? byCode.get(code.trim().toUpperCase()) : undefined;
}

/** Whether addresses in this country choose their region from a list. */
export function hasRegions(country: CountryRef): boolean {
  return (resolve(country)?.regions?.length ?? 0) > 0;
}

/** The region with this code (any case; a superseded ISO code resolves to the current one). */
export function regionByCode(
  country: CountryRef,
  code: string | null | undefined,
): Region | undefined {
  const regions = resolve(country)?.regions;
  const wanted = code?.trim().toUpperCase();
  if (!regions || !wanted) return undefined;
  return (
    regions.find((region) => region.code === wanted) ??
    regions.find((region) => region.formerCodes?.includes(wanted))
  );
}

/** The region with this name, ignoring case, accents and spacing ("west  bengal"). */
export function regionByName(
  country: CountryRef,
  name: string | null | undefined,
): Region | undefined {
  const regions = resolve(country)?.regions;
  const wanted = name ? key(name) : "";
  if (!regions || !wanted) return undefined;
  return regions.find(
    (region) =>
      key(region.name) === wanted || (region.otherNames ?? []).some((n) => key(n) === wanted),
  );
}

/** A region from what someone typed or chose: its code first, then its name. */
export function findRegion(
  country: CountryRef,
  input: string | null | undefined,
): Region | undefined {
  return regionByCode(country, input) ?? regionByName(country, input);
}
