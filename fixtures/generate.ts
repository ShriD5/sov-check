import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { tableToPdf } from "./makePdf.js";

/**
 * Synthetic SOVs. Every address, insured and value here is invented.
 * Each fixture stresses one thing that breaks naive extraction, and ships
 * with the schedule a competent underwriting assistant would produce.
 */

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "files");
const publicDir = join(here, "..", "public", "samples");

interface Property {
  loc: number;
  bldg: number;
  address: string;
  city: string;
  state: string;
  zip: string;
  yearBuilt: number;
  stories: number;
  sqFt: number;
  construction: string;
  occupancy: string;
  sprinklered: string;
  roofType: string;
  roofYear: number;
  ppc: string;
  building: number;
  contents: number;
  bi: number;
}

const PROPERTIES: Property[] = [
  { loc: 1, bldg: 1, address: "4120 Beacon Industrial Way", city: "Grand Prairie", state: "TX", zip: "75050", yearBuilt: 1998, stories: 1, sqFt: 84000, construction: "Masonry NC", occupancy: "Warehouse", sprinklered: "Y", roofType: "Built-up", roofYear: 2016, ppc: "3", building: 6250000, contents: 1800000, bi: 950000 },
  { loc: 2, bldg: 1, address: "9 Harborview Terrace", city: "Providence", state: "RI", zip: "02903", yearBuilt: 1926, stories: 4, sqFt: 31500, construction: "Joisted Masonry", occupancy: "Office", sprinklered: "N", roofType: "Membrane", roofYear: 2009, ppc: "2", building: 4100000, contents: 620000, bi: 480000 },
  { loc: 3, bldg: 1, address: "2255 Camelback Commerce Dr", city: "Phoenix", state: "AZ", zip: "85015", yearBuilt: 2014, stories: 2, sqFt: 46200, construction: "Non-Combustible", occupancy: "Light Manufacturing", sprinklered: "Y", roofType: "Metal", roofYear: 2014, ppc: "2", building: 7800000, contents: 3400000, bi: 2100000 },
  { loc: 3, bldg: 2, address: "2255 Camelback Commerce Dr", city: "Phoenix", state: "AZ", zip: "85015", yearBuilt: 2019, stories: 1, sqFt: 12800, construction: "Non-Combustible", occupancy: "Storage", sprinklered: "Y", roofType: "Metal", roofYear: 2019, ppc: "2", building: 1450000, contents: 310000, bi: 0 },
  { loc: 4, bldg: 1, address: "781 Willow Creek Rd", city: "Boise", state: "ID", zip: "83702", yearBuilt: 1974, stories: 2, sqFt: 22400, construction: "Frame", occupancy: "Retail", sprinklered: "N", roofType: "Shingle", roofYear: 2011, ppc: "4", building: 2350000, contents: 890000, bi: 540000 },
  { loc: 5, bldg: 1, address: "1600 Riverbend Pkwy", city: "Chattanooga", state: "TN", zip: "37406", yearBuilt: 2003, stories: 1, sqFt: 118000, construction: "Masonry NC", occupancy: "Distribution", sprinklered: "Y", roofType: "TPO", roofYear: 2018, ppc: "3", building: 9600000, contents: 5200000, bi: 3100000 },
  { loc: 6, bldg: 1, address: "58 Fairmount Ave", city: "Worcester", state: "MA", zip: "01604", yearBuilt: 1951, stories: 3, sqFt: 27800, construction: "Joisted Masonry", occupancy: "Office", sprinklered: "Y", roofType: "Membrane", roofYear: 2021, ppc: "2", building: 3300000, contents: 740000, bi: 610000 },
  { loc: 7, bldg: 1, address: "3405 Sunfield Blvd", city: "Ocala", state: "FL", zip: "34474", yearBuilt: 2008, stories: 1, sqFt: 39500, construction: "Masonry NC", occupancy: "Retail", sprinklered: "Y", roofType: "Metal", roofYear: 2020, ppc: "3", building: 4750000, contents: 1950000, bi: 880000 },
  { loc: 8, bldg: 1, address: "22 Kestrel Point", city: "Bend", state: "OR", zip: "97701", yearBuilt: 1989, stories: 2, sqFt: 18600, construction: "Frame", occupancy: "Office", sprinklered: "N", roofType: "Shingle", roofYear: 2007, ppc: "5", building: 1980000, contents: 430000, bi: 260000 },
  { loc: 9, bldg: 1, address: "700 Steelyard Row", city: "Gary", state: "IN", zip: "46402", yearBuilt: 1962, stories: 1, sqFt: 96400, construction: "Non-Combustible", occupancy: "Heavy Manufacturing", sprinklered: "Y", roofType: "Built-up", roofYear: 2013, ppc: "4", building: 8200000, contents: 6900000, bi: 4400000 },
  { loc: 10, bldg: 1, address: "145 Alder Grove Ln", city: "Bellingham", state: "WA", zip: "98225", yearBuilt: 2017, stories: 3, sqFt: 52300, construction: "Fire Resistive", occupancy: "Mixed Use", sprinklered: "Y", roofType: "Membrane", roofYear: 2017, ppc: "1", building: 11200000, contents: 2300000, bi: 1750000 },
  { loc: 11, bldg: 1, address: "8801 Prairie Vista Ct", city: "Lincoln", state: "NE", zip: "68512", yearBuilt: 1995, stories: 1, sqFt: 64100, construction: "Masonry NC", occupancy: "Cold Storage", sprinklered: "Y", roofType: "TPO", roofYear: 2015, ppc: "3", building: 5400000, contents: 4100000, bi: 2600000 },
  { loc: 12, bldg: 1, address: "37 Quarry Hill Rd", city: "Barre", state: "VT", zip: "05641", yearBuilt: 1938, stories: 2, sqFt: 14900, construction: "Joisted Masonry", occupancy: "Workshop", sprinklered: "N", roofType: "Standing seam", roofYear: 2004, ppc: "6", building: 1240000, contents: 380000, bi: 190000 },
  { loc: 13, bldg: 1, address: "512 Copperline Dr", city: "Tempe", state: "AZ", zip: "85281", yearBuilt: 2011, stories: 4, sqFt: 73600, construction: "Fire Resistive", occupancy: "Office", sprinklered: "Y", roofType: "Membrane", roofYear: 2011, ppc: "1", building: 14600000, contents: 3900000, bi: 5200000 },
  { loc: 14, bldg: 1, address: "1919 Saltgrass Rd", city: "Beaumont", state: "TX", zip: "77701", yearBuilt: 1979, stories: 1, sqFt: 41200, construction: "Non-Combustible", occupancy: "Distribution", sprinklered: "Y", roofType: "Metal", roofYear: 2012, ppc: "4", building: 3850000, contents: 2100000, bi: 1150000 },
  { loc: 15, bldg: 1, address: "64 Lantern Mill Way", city: "Nashua", state: "NH", zip: "03060", yearBuilt: 2001, stories: 2, sqFt: 29300, construction: "Masonry NC", occupancy: "Lab", sprinklered: "Y", roofType: "TPO", roofYear: 2019, ppc: "2", building: 6100000, contents: 4700000, bi: 2950000 },
  { loc: 16, bldg: 1, address: "230 Cedar Bluff Pass", city: "Knoxville", state: "TN", zip: "37923", yearBuilt: 1986, stories: 1, sqFt: 33800, construction: "Frame", occupancy: "Retail", sprinklered: "N", roofType: "Shingle", roofYear: 2010, ppc: "4", building: 2680000, contents: 1020000, bi: 470000 },
  { loc: 17, bldg: 1, address: "4455 Dunes Harbor Blvd", city: "Corpus Christi", state: "TX", zip: "78411", yearBuilt: 2006, stories: 2, sqFt: 57400, construction: "Masonry NC", occupancy: "Hospitality", sprinklered: "Y", roofType: "Tile", roofYear: 2018, ppc: "3", building: 9100000, contents: 2400000, bi: 3300000 },
  { loc: 18, bldg: 1, address: "12 Foundry Yard", city: "Erie", state: "PA", zip: "16507", yearBuilt: 1948, stories: 3, sqFt: 45700, construction: "Joisted Masonry", occupancy: "Manufacturing", sprinklered: "Y", roofType: "Built-up", roofYear: 2008, ppc: "3", building: 4300000, contents: 3100000, bi: 1900000 },
  { loc: 19, bldg: 1, address: "905 Summit Ridge Ct", city: "Colorado Springs", state: "CO", zip: "80906", yearBuilt: 2015, stories: 1, sqFt: 26500, construction: "Non-Combustible", occupancy: "Office", sprinklered: "Y", roofType: "Metal", roofYear: 2015, ppc: "2", building: 4900000, contents: 1100000, bi: 820000 },
  { loc: 20, bldg: 1, address: "3377 Marsh Landing Dr", city: "Savannah", state: "GA", zip: "31408", yearBuilt: 1993, stories: 1, sqFt: 88200, construction: "Masonry NC", occupancy: "Warehouse", sprinklered: "Y", roofType: "TPO", roofYear: 2017, ppc: "3", building: 7300000, contents: 3600000, bi: 2050000 },
];

interface Expected {
  locations: number;
  tiv: number;
  rows: {
    address: string;
    state: string;
    zip: string;
    year_built: number | null;
    sq_ft: number | null;
    construction: string | null;
    building_value: number;
    contents_value: number;
    tiv: number;
  }[];
  expectFlags?: { code: string; atLeast: number }[];
}

const CONSTRUCTION_CANONICAL: Record<string, string> = {
  Frame: "1 Frame",
  "Joisted Masonry": "2 Joisted masonry",
  "Non-Combustible": "3 Non-combustible",
  "Masonry NC": "4 Masonry non-combustible",
  "Fire Resistive": "6 Fire resistive",
};

function expectedFor(
  props: Property[],
  overrides?: Partial<Expected> & { rowOverrides?: (p: Property, i: number) => Partial<Expected["rows"][number]> },
): Expected {
  const rows = props.map((p, i) => ({
    address: p.address,
    state: p.state,
    zip: p.zip,
    year_built: p.yearBuilt,
    sq_ft: p.sqFt,
    construction: CONSTRUCTION_CANONICAL[p.construction] ?? p.construction,
    building_value: p.building,
    contents_value: p.contents,
    tiv: p.building + p.contents + p.bi,
    ...(overrides?.rowOverrides?.(p, i) ?? {}),
  }));

  return {
    locations: props.length,
    tiv: rows.reduce((sum, r) => sum + r.tiv, 0),
    rows,
    expectFlags: overrides?.expectFlags,
  };
}

function writeBook(name: string, sheets: { name: string; aoa: unknown[][] }[]) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet.aoa), sheet.name);
  }
  const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
  writeFileSync(join(outDir, name), buffer);
  writeFileSync(join(publicDir, name), buffer);
}

function writeExpected(name: string, expected: Expected) {
  writeFileSync(join(outDir, name), JSON.stringify(expected, null, 2));
}

function build() {
  mkdirSync(outDir, { recursive: true });
  mkdirSync(publicDir, { recursive: true });

  // 1. Clean template. The happy path.
  writeBook("01-clean.xlsx", [
    {
      name: "SOV",
      aoa: [
        ["Loc #", "Bldg #", "Address", "City", "State", "Zip", "Year Built", "Stories", "Sq Ft", "Construction", "Occupancy", "Sprinklered", "Roof Type", "Roof Year", "Protection Class", "Building Value", "Contents Value", "BI Value", "TIV"],
        ...PROPERTIES.map((p) => [p.loc, p.bldg, p.address, p.city, p.state, p.zip, p.yearBuilt, p.stories, p.sqFt, p.construction, p.occupancy, p.sprinklered, p.roofType, p.roofYear, p.ppc, p.building, p.contents, p.bi, p.building + p.contents + p.bi]),
      ],
    },
  ]);
  writeExpected("01-clean.expected.json", expectedFor(PROPERTIES));

  // 2. Title block, blank rows, two-tier merged header.
  writeBook("02-merged-header.xlsx", [
    {
      name: "Schedule",
      aoa: [
        ["MERIDIAN RISK PARTNERS", "", "", "", ""],
        ["Statement of Values — Program 2026-A", "", "", "", ""],
        [""],
        ["Location", "", "", "", "", "", "Building Detail", "", "", "", "Values", "", "", ""],
        ["Loc #", "Address", "City", "State", "Zip", "Occupancy", "Year Built", "Sq Ft", "Construction", "Sprinklered", "Building", "Contents", "BI", "Total"],
        ...PROPERTIES.map((p) => [p.loc, p.address, p.city, p.state, p.zip, p.occupancy, p.yearBuilt, p.sqFt, p.construction, p.sprinklered, p.building, p.contents, p.bi, p.building + p.contents + p.bi]),
        ["", "", "", "", "", "", "", "", "", "TOTAL", PROPERTIES.reduce((s, p) => s + p.building, 0), PROPERTIES.reduce((s, p) => s + p.contents, 0), PROPERTIES.reduce((s, p) => s + p.bi, 0), PROPERTIES.reduce((s, p) => s + p.building + p.contents + p.bi, 0)],
      ],
    },
  ]);
  writeExpected("02-merged-header.expected.json", expectedFor(PROPERTIES));

  // 3. No TIV column at all; it has to be derived. Plus currency-formatted text.
  writeBook("03-split-tiv.xlsx", [
    {
      name: "Values",
      aoa: [
        ["Premises No", "Street Address", "City", "St", "Postal Code", "Yr Blt", "Total SF", "Const Type", "Occ", "Spr", "Real Property", "Business Personal Property", "Business Income"],
        ...PROPERTIES.map((p) => [
          p.loc,
          p.address,
          p.city,
          p.state,
          p.zip,
          p.yearBuilt,
          p.sqFt,
          p.construction,
          p.occupancy,
          p.sprinklered,
          `$${p.building.toLocaleString("en-US")}.00`,
          `$${p.contents.toLocaleString("en-US")}.00`,
          p.bi === 0 ? "-" : `$${p.bi.toLocaleString("en-US")}.00`,
        ]),
      ],
    },
  ]);
  writeExpected("03-split-tiv.expected.json", expectedFor(PROPERTIES));

  // 4. One sheet per state, different column order on each, zips that lost
  //    their leading zero, states spelled out.
  const byState = PROPERTIES.reduce<Record<string, Property[]>>((acc, p) => {
    (acc[p.state] ??= []).push(p);
    return acc;
  }, {});
  const stateNames: Record<string, string> = { TX: "Texas", RI: "Rhode Island", AZ: "Arizona", ID: "Idaho", TN: "Tennessee", MA: "Massachusetts", FL: "Florida", OR: "Oregon", IN: "Indiana", WA: "Washington", NE: "Nebraska", VT: "Vermont", NH: "New Hampshire", PA: "Pennsylvania", CO: "Colorado", GA: "Georgia" };

  writeBook(
    "04-multi-sheet.xlsx",
    Object.entries(byState).map(([state, props]) => ({
      name: state,
      aoa: [
        ["Loc", "Address", "City", "State", "Zip", "Construction", "Year Built", "Sq Ft", "Sprinkler", "Occupancy", "Bldg Value", "Contents", "BI", "TIV"],
        ...props.map((p) => [
          p.loc,
          p.address,
          p.city,
          stateNames[p.state] ?? p.state,
          // New England zips arrive stripped of the leading zero.
          p.zip.startsWith("0") ? Number(p.zip) : p.zip,
          p.construction,
          p.yearBuilt,
          p.sqFt,
          p.sprinklered,
          p.occupancy,
          p.building,
          p.contents,
          p.bi,
          p.building + p.contents + p.bi,
        ]),
      ],
    })),
  );
  const multiOrder = Object.values(byState).flat();
  writeExpected("04-multi-sheet.expected.json", expectedFor(multiOrder));

  // 5. Values in thousands, plus two rows that are genuinely wrong: a TIV that
  //    does not add up and a year built in the future. A good tool flags these
  //    instead of silently passing them through.
  writeBook("05-thousands.xlsx", [
    {
      name: "SOV ($000s)",
      aoa: [
        ["Loc #", "Address", "City", "State", "Zip", "Year Built", "Sq Ft", "Construction", "Occupancy", "Sprinklered", "Building Value ($000s)", "Contents Value ($000s)", "BI Value ($000s)", "TIV ($000s)"],
        ...PROPERTIES.map((p, i) => {
          const building = p.building / 1000;
          const contents = p.contents / 1000;
          const bi = p.bi / 1000;
          const badTiv = i === 4;
          const badYear = i === 9;
          return [
            p.loc,
            p.address,
            p.city,
            p.state,
            p.zip,
            badYear ? 2098 : p.yearBuilt,
            p.sqFt,
            p.construction,
            p.occupancy,
            p.sprinklered,
            building,
            contents,
            bi,
            badTiv ? building + contents : building + contents + bi,
          ];
        }),
      ],
    },
  ]);
  writeExpected(
    "05-thousands.expected.json",
    expectedFor(PROPERTIES, {
      rowOverrides: (p, i) => ({
        year_built: i === 9 ? 2098 : p.yearBuilt,
        tiv: i === 4 ? p.building + p.contents : p.building + p.contents + p.bi,
      }),
      expectFlags: [
        { code: "tiv_mismatch", atLeast: 1 },
        { code: "year_out_of_range", atLeast: 1 },
      ],
    }),
  );

  // 6. PDF table with a real text layer and a blank cell that would shift
  //    every later column if you extracted text without column geometry.
  const pdfHeaders = [
    { label: "Loc", x: 40 },
    { label: "Address", x: 75 },
    { label: "City", x: 260 },
    { label: "State", x: 350 },
    { label: "Zip", x: 385 },
    { label: "Year Built", x: 430 },
    { label: "Sq Ft", x: 490 },
    { label: "Construction", x: 540 },
    { label: "Building Value", x: 640 },
    { label: "Contents", x: 715 },
  ];
  const pdfRows = PROPERTIES.map((p, i) => [
    String(p.loc),
    p.address,
    p.city,
    p.state,
    p.zip,
    // Two rows have no year, the gap that shifts columns in naive extraction.
    i === 2 || i === 11 ? "" : String(p.yearBuilt),
    String(p.sqFt),
    p.construction,
    String(p.building),
    String(p.contents),
  ]);
  const pdf = tableToPdf(pdfHeaders, pdfRows);
  writeFileSync(join(outDir, "06-table.pdf"), pdf);
  writeFileSync(join(publicDir, "06-table.pdf"), pdf);
  writeExpected(
    "06-table.expected.json",
    expectedFor(PROPERTIES, {
      rowOverrides: (p, i) => ({
        year_built: i === 2 || i === 11 ? null : p.yearBuilt,
        tiv: p.building + p.contents,
      }),
      expectFlags: [{ code: "missing_cope", atLeast: 2 }],
    }),
  );

  // 7. Adversarial. A broker's in-house template where the headers are their
  //    own vocabulary, not the industry's. The synonym dictionary is expected
  //    to miss some of these; the point of the fixture is that the misses show
  //    up as unmapped columns for a human, never as a confident wrong guess.
  writeBook("07-adversarial.xlsx", [
    {
      name: "Sched A",
      aoa: [
        ["Ref", "Risk Situation", "Town", "Region", "Post", "Vintage", "Footprint", "Fabric", "Trade", "AFSS", "Reinstatement Value", "Stock & Plant", "Gross Profit"],
        ...PROPERTIES.map((p) => [
          `L${p.loc}-${p.bldg}`,
          p.address,
          p.city,
          p.state,
          p.zip,
          p.yearBuilt,
          p.sqFt,
          p.construction,
          p.occupancy,
          p.sprinklered,
          p.building,
          p.contents,
          p.bi,
        ]),
      ],
    },
  ]);
  writeExpected(
    "07-adversarial.expected.json",
    expectedFor(PROPERTIES, {
      rowOverrides: (p) => ({
        // "Region" and "Post" are not in the dictionary, so state and zip stay
        // unmapped rather than being guessed from a neighbouring column.
        state: p.state,
        zip: p.zip,
      }),
    }),
  );

  console.log(`Wrote 7 fixtures to ${outDir} and copied the inputs to ${publicDir}`);
}

build();
