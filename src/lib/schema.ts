import type { FieldDef, FieldId } from "./types.js";

export const FIELDS: FieldDef[] = [
  { id: "location_id", label: "Loc #", kind: "string", group: "identity" },
  { id: "building_id", label: "Bldg #", kind: "string", group: "identity" },
  { id: "address", label: "Address", kind: "string", group: "location" },
  { id: "city", label: "City", kind: "string", group: "location" },
  { id: "state", label: "State", kind: "string", group: "location" },
  { id: "zip", label: "Zip", kind: "string", group: "location" },
  { id: "country", label: "Country", kind: "string", group: "location" },
  { id: "year_built", label: "Year built", kind: "year", group: "cope", cope: true },
  { id: "stories", label: "Stories", kind: "number", group: "cope" },
  { id: "sq_ft", label: "Sq ft", kind: "number", group: "cope", cope: true },
  { id: "construction", label: "Construction", kind: "enum", group: "cope", cope: true },
  { id: "occupancy", label: "Occupancy", kind: "string", group: "cope", cope: true },
  { id: "sprinklered", label: "Sprinklered", kind: "bool", group: "cope", cope: true },
  { id: "roof_type", label: "Roof type", kind: "string", group: "cope" },
  { id: "roof_year", label: "Roof year", kind: "year", group: "cope" },
  { id: "protection_class", label: "Prot. class", kind: "string", group: "cope" },
  { id: "building_value", label: "Building", kind: "money", group: "values" },
  { id: "contents_value", label: "Contents", kind: "money", group: "values" },
  { id: "bi_value", label: "BI", kind: "money", group: "values" },
  { id: "tiv", label: "TIV", kind: "money", group: "values" },
  { id: "currency", label: "Ccy", kind: "string", group: "values" },
];

export const FIELD_IDS: FieldId[] = FIELDS.map((f) => f.id);

export const FIELD_BY_ID: Record<FieldId, FieldDef> = Object.fromEntries(
  FIELDS.map((f) => [f.id, f]),
) as Record<FieldId, FieldDef>;

export const COPE_FIELDS: FieldId[] = FIELDS.filter((f) => f.cope).map((f) => f.id);

/**
 * ISO construction classes. Carriers write these a dozen ways; we keep the
 * canonical label and the class number, and leave the original in `raw`.
 */
export const CONSTRUCTION_CLASSES: { code: number; label: string; match: string[] }[] = [
  { code: 1, label: "Frame", match: ["frame", "wood", "wood frame", "timber", "class 1"] },
  {
    code: 2,
    label: "Joisted masonry",
    match: ["joisted masonry", "jm", "masonry", "brick", "class 2"],
  },
  {
    code: 3,
    label: "Non-combustible",
    match: ["non-combustible", "noncombustible", "nc", "metal", "steel frame", "class 3"],
  },
  {
    code: 4,
    label: "Masonry non-combustible",
    match: ["masonry non-combustible", "mnc", "masonry nc", "cb", "concrete block", "class 4"],
  },
  {
    code: 5,
    label: "Modified fire resistive",
    match: ["modified fire resistive", "mfr", "class 5"],
  },
  {
    code: 6,
    label: "Fire resistive",
    match: ["fire resistive", "fr", "reinforced concrete", "concrete", "class 6"],
  },
];

export const US_STATES = new Set(
  ("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM " +
    "NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR VI GU AS MP")
    .split(" "),
);

export const STATE_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
  montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH",
  oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
  "district of columbia": "DC",
};
