# SOV Check — video script

**Target: 80 seconds.** Screen recording, your voice, no face cam needed.
Record at 1440x900 or larger so the grid text is readable.

**Before you hit record**

- Open https://sov-check.vercel.app in a clean window, no bookmarks bar, no extensions.
- Both "break it on purpose" toggles OFF.
- Zoom the browser to 110% so the grid is legible in a compressed upload.
- Have `https://github.com/ShriD5/sov-check` open in a second tab.
- Say the numbers out loud once before recording. Don't read this script word for word, it should sound like you explaining it to someone, not narrating.

---

## Shot 1 — the problem (0:00–0:12)

**On screen:** the landing page. Don't move the mouse while you talk.

> "Submission intake starts with a spreadsheet nobody agreed on the shape of. Twenty brokers, twenty templates. Somebody retypes it into a schedule by hand. This is the first mile of that, as a free tool."

## Shot 2 — the ugly file (0:12–0:30)

**Do:** click **Values in $000s**. Let the mapping screen land. Hover the `x1,000` badge next to "Building Value ($000s)".

> "Here's a real-shaped mess. Values in thousands, a two-tier header, a totals row that would double-count your TIV. It maps the columns, tells you how it decided each one, and flags the thousands multiplier instead of silently getting every number wrong by three orders of magnitude."

**Do:** click **Build the schedule**. Let rows stream in for two seconds.

> "Rows stream in as they're normalized."

## Shot 3 — provenance (0:30–0:45)

**Do:** click a Building value cell, e.g. the 6,250,000 on row 1. The side panel opens.

> "Every cell knows where it came from. That's 6,250,000, the raw text in the file was 6250, it came from cell K2, and it's 81% confidence because the mapping was a synonym match, not exact. Nothing here is a number you have to take on faith."

**Do:** scroll the flags panel so the TIV mismatch and the 2098 year are visible.

> "And it argues with the file. That TIV doesn't equal building plus contents plus BI, and somebody typed a year built of 2098."

## Shot 4 — break it (0:45–1:05) — **this is the important shot**

**Do:** click **New file**. Tick **drop the connection mid-stream**. Click **Values in $000s**, then **Build the schedule**. Let it run. Point the cursor at the timeline as the lines appear.

> "Now the part I actually care about. I'm going to kill the connection halfway through on purpose."

**Wait for the timeline to show the interrupt and the resume.**

> "Connection dies at event seven. Six rows already banked. It reconnects from that event id and finishes without re-sending a single row you already had. The first version of this kept the run in server memory and it broke in production the second a retry hit a different instance, so the stream is stateless now and the resume survives a cold start."

## Shot 5 — the numbers (1:05–1:20)

**Do:** switch to the GitHub tab, scroll to the eval block in the README.

> "Seven fixtures, and the harness cuts every stream at three points and asserts the resumed schedule is identical to the clean one. A hundred percent precision on what it answers, zero wrong answers. The seventh fixture is a broker using their own vocabulary, and it hands back eleven of thirteen columns instead of guessing. A blank cell costs a minute. A confidently wrong TIV costs a lot more."

## Close (1:20–1:25)

> "Free, no login, nothing stored. Code's in the repo."

---

## Rules while recording

- **Do not** say FurtherAI, do not say "I built this for you", do not mention the job. The tool speaks for itself; the note carries the ask.
- **Do not** apologise for anything or say "quick demo of a little thing I made".
- If you fluff a line, stop, pause two seconds, say it again. Trim later.
- Cursor movement: slow and deliberate. Nothing is more unwatchable than a jittery pointer.
- If the stream finishes too fast to narrate Shot 4, reload and use the **One sheet per state** sample instead, it has more rows.

## If something goes wrong on the day

- Rows don't appear: check the network tab for `/api/stream`. A 400 means the file parsed to zero rows, pick another sample.
- The drop toggle does nothing: it only fires on a fresh run, so click **New file** first, then tick it, then load the sample.
- PDF sample is slow on first load: pdf.js worker is ~1.4MB, load it once before recording so it's cached.
