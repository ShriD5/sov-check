# SOV Check

Drop a broker's Statement of Values, get a normalized property schedule back:
TIV, COPE, gaps flagged, and every value traced to the cell it came from.

Free, no login, nothing stored. Built by [Shrithan Devaiah](https://shrithan.site).
Not affiliated with any insurance software vendor.

[Watch the 90-second demo](https://sov-check.vercel.app/demo.mp4): the State of
Mississippi's real SOV tied out 49/49, a typo caught in the Town of Ware's, and
the stream cut on purpose and resumed.

---

## Why this exists

Submission intake starts with a spreadsheet nobody agreed on the shape of.
Twenty brokers send twenty templates: merged header rows, a title block above
the data, values in thousands, one sheet per state, a TIV column that is
sometimes there and sometimes has to be added up, and a subtotal row that will
double-count your exposure if you paste it straight into a schedule.

The work of turning that into a clean schedule is real, repetitive, and
currently done by hand by underwriting assistants. This is a small public tool
that does the first mile of it and shows its work.

## What it does

- **Reads** `.xlsx`, `.xls`, `.csv` and `.pdf` (text layer), in the browser.
- **Finds the header row** even under a title block, and collapses a two-tier
  merged header into single labels.
- **Maps columns** to a 21-field schedule with a synonym dictionary and bounded
  fuzzy matching, then breaks ties using the data in the column.
- **Normalizes values**: currency text, parenthesised negatives, `1.2M`,
  `$000s` scaling, ISO construction classes, spelled-out states, zips that lost
  a leading zero to Excel, two-digit years.
- **Derives TIV** from building + contents + BI when the file has no total, and
  refuses to derive it from contents alone.
- **Flags** missing COPE, TIV that does not add up, identical rows,
  impossible years, invalid states and zips, a zip that belongs to another
  state, zero TIV, value per square foot far outside the schedule's own
  median, and any column it mapped at low confidence.
- **Ties out** to any totals and subtotals printed in the source, the way an
  underwriter reconciles a schedule before trusting it.
- **Cites everything**: click a cell to see the sheet and cell reference, the
  raw text, and the confidence. Export carries a Provenance sheet.
- **Survives a broken stream** (below).

## The part that is actually hard

Extraction runs server-side and streams row by row, so three things can go
wrong mid-schedule. All three are handled, and you can trigger them yourself
with the "break it on purpose" toggles on the landing page.

| Failure | What happens |
|---|---|
| Connection drops | Client reconnects with `Last-Event-ID`, server resumes at that event. Rows already banked are never re-sent. |
| Model output truncates | Server emits a retryable error, client treats it as a continuation and reconnects from its last id. |
| Second file dropped mid-run | The run is not silently replaced. You are asked whether to cancel it or keep it, and cancel aborts the fetch immediately. |

Event ids are 1-based and index directly into the event list, so a resume is
an array slice, not a replay of work already done. That is why a resumed
schedule is byte-identical to one that never broke, which the eval asserts.

**The stream is deliberately stateless.** The first version held each run in
server memory and resumed by run id, which worked locally and broke in
production the moment a reconnect landed on a different serverless instance.
Because extraction is deterministic, the same input always produces the same
ordered event list, so the client re-sends the rows with its `lastEventId` and
the server slices from there. That costs a re-POST per retry and buys a resume
that survives cold starts, instance changes and redeploys.

SSE is consumed over `fetch` rather than `EventSource`, for four things the
browser API will not give you: a POST body, an `AbortController` so a
superseded run stops immediately, an explicit `Last-Event-ID` on every retry,
and a bounded backoff instead of an infinite reconnect loop.

## On real documents

Synthetic fixtures only prove a tool agrees with the person who wrote them. So
the tool also runs on Statements of Values that governments publish with their
insurance RFPs. Nothing here was tuned against an answer key, because there
isn't one. The check is harder than that: the document's own printed totals.

| Source | What it is | Result |
|---|---|---|
| [State of Mississippi](https://www.dfa.ms.gov/sites/default/files/State%20Property%20Insurance%20Home/EIS%20SOV%20Report%2009102026.pdf) | 79-page PDF, 3,861 buildings, $8.07B TIV | **49 of 49 department subtotals reproduced to the dollar.** 217 value-density outliers, 168 identical rows, 32 zero-TIV rows surfaced. |
| [Town of Ware, MA](https://cms1files.revize.com/warema/2-Town%20of%20Ware%20RFQ%20Insurance%20Addendum%201%2003-05-2024.pdf) | SOV on page 2 of a 150-page RFQ packet with property cards and loss runs | 62 buildings, $177M. Finds the one page that is the SOV and skips the other 149. **Catches a real typo:** five buildings at 4 Gould Road are listed at zip 10182 (New York) instead of 01082. |
| [Atlanta Housing](https://www.atlantahousing.org/wp-content/uploads/2024/04/RFP-2024-0115-Insurance-Broker-and-Related-Services-Addendum-1-Pckg-1.pdf) | RFP addendum with a coverage table and an attendee list, no SOV | Zero rows. A negative control: tables that are not schedules produce nothing rather than garbage. |

`npm run real` downloads these and prints what the pipeline made of each. Both
real SOVs are also one click away on the live site.

**What the real files broke, and what changed.** The first run on real data
parsed Mississippi's addresses into the wrong column, glued three of Ware's
headers into one, and raised 12,279 warnings on Mississippi alone. Each fix is
in the code with a comment pointing at the file that forced it:

- **Column geometry.** Real PDFs centre headers over left-aligned text and
  right-aligned money. Columns are now assigned by overlap with the header,
  then re-learned from where each column's data actually sits. The county
  "Lee" sits 3pt from one header and 4pt from the other; header geometry alone
  got it wrong by a point.
- **Two-tier headers in PDFs.** "Square" printed above "Footage" is one column.
- **Construction classes.** "Masonry Noncombustible" was matching bare
  "masonry" first and landing in class 2 instead of class 4. Phrases are now
  compared squashed and longest first.
- **Duplicates.** Ware lists a high school, press box, concession stand and
  field lights all at 237 West Street. Those are four buildings on one campus,
  not duplicates. A duplicate now has to match on address, building,
  description, area and value.
- **Value per square foot, judged against the schedule.** A fixed "under 400
  sq ft is suspicious" rule fired 819 times on real sheds, silos and pavilions.
  Relative to the schedule's own median ($110/sq ft), the same file surfaces
  a 96 sq ft guard office carrying $3.6M.
- **Columns the file never had.** Mississippi has no year built, construction
  or sprinkler column. That is one fact about the file, reported once, not
  11,861 row-level warnings.
- **Truncated values.** The Mississippi report prints the state as "Missi" in
  places. A prefix that fits exactly one state name resolves to it.
- **Request size.** Mississippi is 4.0MB of JSON, just under the platform's
  4.5MB request limit, and a resume re-sends it. The client gzips it once
  (0.31MB) and reuses the same bytes on every retry.

With a server dropping the connection at row 1,200, the Mississippi run
resumes and finishes identical to the uninterrupted one, still tying out 49/49.
`npm run smoke` asserts all of that against local or production.

## Numbers on synthetic fixtures

`npm run eval` runs seven synthetic fixtures through the same code path the app
uses, then cuts each stream at three points and compares the result to the
uninterrupted run.

```
  ok    Clean template                    21 rows  100.0% of answers right    0 deferred   0/19 cols unmapped
  ok    Two-tier header + totals row      21 rows  100.0% of answers right    0 deferred   0/14 cols unmapped
  ok    No TIV column, derive it          21 rows  100.0% of answers right    0 deferred   0/13 cols unmapped
  ok    One sheet per state               21 rows  100.0% of answers right    0 deferred   0/14 cols unmapped
  ok    Values in $000s                   21 rows  100.0% of answers right    0 deferred   0/14 cols unmapped
  ok    PDF table with blank cells        21 rows  100.0% of answers right    0 deferred   0/10 cols unmapped
  ok    Broker's own header vocabulary    21 rows  100.0% of answers right  168 deferred  11/13 cols unmapped

  Precision: values right, of values answered   100.0%  (1155/1155)
  Coverage: fields answered, not deferred       87.3%  (168 deferred to a human)
  Wrong answers                                 0
  Columns handed back for mapping               11/97
  Expected flags raised                         3/3
  Source totals tied out to the dollar          1/1
  Chaos resume identical to clean run           21/21
```

Two numbers, on purpose. **Precision** is how often it is right when it
answers. **Coverage** is how much it answers at all. A blank cell costs an
underwriting assistant a minute; a confidently wrong TIV costs a lot more, so
the eval fails the build on a single wrong answer and merely reports deferrals.

The seventh fixture is a broker's in-house template written in their own
vocabulary ("Reinstatement Value", "Gross Profit", "AFSS"). The tool maps two
of thirteen columns and hands back eleven. That is the intended behaviour, and
it is why the headline is 87% coverage rather than a rounder number.

These fixtures are synthetic and the expectations were written alongside them,
so treat this as a regression guard. The real-document section above is the
evidence.
It has still caught real bugs: "Rein**state**ment Value" matching the `state`
synonym by raw substring, and `Building Value ($000s)` mapping to the building
*number* column because a shorter synonym scored equal and won on field order.

## Running it

```bash
npm install
npm run fixtures   # regenerate the synthetic SOVs
npm run dev        # http://localhost:5173
npm run eval       # accuracy + chaos harness on synthetic fixtures
npm run real       # fetch the public SOVs and run them
npm run smoke      # wire protocol, resume and tie-out against a running server
npm run build
```

`npx tsx scripts/smoke.ts` exercises the real wire protocol against a running
server: starts a run, has the server kill the connection after eight events,
reconnects, and asserts no duplicate rows and an identical schedule. Point it
at production with `SOV_BASE=https://sov-check.vercel.app`.

## Architecture

```
src/lib/
  types.ts        every cell carries { value, raw, source, confidence }
  schema.ts       the 21-field target schedule, ISO classes, state tables
  synonyms.ts     header vocabulary per field, ignore list, scale hints
  mapHeaders.ts   exact -> word-boundary synonym -> bounded fuzzy, then a
                  data-shape tiebreak when two fields score close
  normalize.ts    value coercion per field kind, TIV derivation
  flags.ts        per-row checks plus cross-row duplicate detection
  engine.ts       one extraction path shared by the server and the eval
  sseClient.ts    fetch-based SSE with resume, cancel and bounded backoff
  parse/          SheetJS for workbooks, pdf.js with column geometry for PDFs

api/
  stream.ts       POST -> SSE, stateless, resumable by event id
  _handlers.ts    the handler, shared by Vercel and the vite dev middleware
```

The PDF path infers column boundaries from the header line's word positions
rather than reading text left to right, because a blank cell in a PDF table
shifts every later value one column over if you do not.

## What it does not do

- No geocoding, no third-party enrichment, no hazard scores.
- No accounts, no persistence, no database. Nothing is stored between requests.
- No LLM in the default path. The mapper is deterministic, so the tool costs
  nothing to run and cannot hallucinate a column. `ANTHROPIC_API_KEY` is
  reserved for a future fallback on the columns it currently defers.
- No claim to be production insurance software. It is a public tool and a
  demonstration.

## Privacy

Files are parsed in the browser. Only the extracted rows are POSTed, and only
so the server can stream them back normalized. The server holds nothing
between requests: no database, no disk, no cache. There is no analytics, no
account, and nothing to log in to.
