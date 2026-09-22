# SOV Check

Drop a broker's Statement of Values, get a normalized property schedule back:
TIV, COPE, gaps flagged, and every value traced to the cell it came from.

Free, no login, nothing stored. Built by [Shrithan Devaiah](https://shrithan.site).
Not affiliated with any insurance software vendor.

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
- **Flags** missing COPE, TIV that does not add up, duplicate locations,
  impossible years, invalid states and zips, implausible areas, and any column
  it mapped at low confidence.
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

## Numbers

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
so treat this as a regression guard, not a benchmark against real submissions.
It has still caught real bugs: "Rein**state**ment Value" matching the `state`
synonym by raw substring, and `Building Value ($000s)` mapping to the building
*number* column because a shorter synonym scored equal and won on field order.

## Running it

```bash
npm install
npm run fixtures   # regenerate the synthetic SOVs
npm run dev        # http://localhost:5173
npm run eval       # accuracy + chaos harness
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
