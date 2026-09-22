import type { FieldId } from "./types.js";

/**
 * Header synonyms seen across carrier, broker and MGA SOV templates.
 * Lowercased, punctuation-stripped. Order inside a field does not matter;
 * the mapper scores every candidate and takes the best.
 */
export const SYNONYMS: Record<FieldId, string[]> = {
  location_id: [
    "loc", "loc #", "loc no", "location", "location #", "location no",
    "location number", "location id", "site", "site #", "site no", "prem",
    "premises", "premises #", "loc num",
  ],
  building_id: [
    "bldg", "bldg #", "bldg no", "building", "building #", "building no",
    "building number", "building id", "bld", "structure", "structure #",
  ],
  address: [
    "address", "street", "street address", "address 1", "addr", "addr 1",
    "location address", "situs", "situs address", "property address", "street 1",
  ],
  city: ["city", "town", "municipality", "city name"],
  state: ["state", "st", "province", "state province", "state cd", "state code"],
  zip: ["zip", "zip code", "zipcode", "postal", "postal code", "post code", "postcode"],
  country: ["country", "country code", "ctry", "nation"],
  year_built: [
    "year built", "yr built", "yearbuilt", "construction year", "year of construction",
    "yr blt", "built", "orig year built", "year constructed",
  ],
  stories: [
    "stories", "storeys", "num stories", "no of stories", "number of stories",
    "floors", "num floors", "no of floors", "height stories",
  ],
  sq_ft: [
    "sq ft", "sqft", "square feet", "square footage", "total sq ft", "total area",
    "area", "floor area", "gross area", "building area", "sf", "total sf", "gross sq ft",
  ],
  construction: [
    "construction", "const", "constr", "construction type", "const type",
    "constr type", "iso construction", "iso const", "construction class",
    "class", "building construction", "const class",
  ],
  occupancy: [
    "occupancy", "occ", "occupancy type", "occ type", "use", "building use",
    "occupancy class", "class of occupancy",
  ],
  sprinklered: [
    "sprinkler", "sprinklered", "sprinklers", "spr", "sprinkler y n",
    "sprinkler system", "auto sprinkler", "fire sprinkler", "sprinkler yn",
  ],
  roof_type: ["roof", "roof type", "roof covering", "roof material", "roof constr"],
  roof_year: [
    "roof year", "year roof", "roof updated", "roof update year",
    "year roof updated", "roof replaced", "roof age year", "last roof update",
  ],
  protection_class: [
    "protection class", "prot class", "ppc", "iso ppc", "fire protection class",
    "public protection class", "protection",
  ],
  building_value: [
    "building value", "bldg value", "building limit", "bldg limit", "building tiv",
    "bldg tiv", "real property", "building replacement cost", "bldg rc",
    "building rc", "structure value", "building", "bldg",
  ],
  contents_value: [
    "contents", "contents value", "content value", "bpp", "business personal property",
    "personal property", "contents limit", "contents tiv", "stock", "equipment",
    "contents rc",
  ],
  bi_value: [
    "bi", "business interruption", "business income", "bi value", "bi limit",
    "time element", "te", "loss of rents", "rental value", "extra expense", "bi ee",
  ],
  tiv: [
    "tiv", "total insured value", "total value", "total insurable value",
    "total limit", "total", "grand total", "total tiv", "combined tiv",
  ],
  currency: ["currency", "ccy", "curr", "currency code"],
};

/** Headers that look like data columns but are not part of the schedule. */
export const IGNORE_HEADERS = [
  "notes", "comments", "remarks", "flood zone", "distance to coast", "latitude",
  "longitude", "lat", "long", "lon", "county", "deductible", "premium", "rate",
  "policy number", "policy #", "effective date", "expiration date", "insured",
  "named insured", "agent", "broker", "underwriter",
];

/** Header hints that a money column is already scaled. */
export const SCALE_HINTS: { pattern: RegExp; scale: number; label: string }[] = [
  { pattern: /\(?\$?\s?0{3}s?\)?/i, scale: 1000, label: "thousands" },
  { pattern: /\bin\s+thousands\b/i, scale: 1000, label: "thousands" },
  { pattern: /\bthousands\b/i, scale: 1000, label: "thousands" },
  { pattern: /\bin\s+millions\b/i, scale: 1_000_000, label: "millions" },
  { pattern: /\bmillions?\b/i, scale: 1_000_000, label: "millions" },
  { pattern: /\bmm\b/i, scale: 1_000_000, label: "millions" },
];
