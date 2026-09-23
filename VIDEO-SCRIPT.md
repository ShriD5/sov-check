# SOV Check — video script

**Target: 85 seconds.** Screen recording, your voice, no face cam.
Record at 1440x900 or larger so the grid is readable after compression.

The whole video rests on one idea: it runs on real government documents, and
you can check it against the document's own math. Say "real" and "49 of 49"
clearly. Everything else is supporting detail.

**Before you hit record**

- Open https://sov-check.vercel.app in a clean window. No bookmarks bar, no extensions, browser zoom 110%.
- Click **State of Mississippi** once and let it finish, then **New file**. That caches the 1.5MB PDF and the pdf.js worker so the take doesn't open with ten seconds of loading.
- Both "break it on purpose" toggles OFF.
- Have https://github.com/ShriD5/sov-check open in a second tab.
- Talk like you're showing a friend, not reading. If you fluff a line, pause two seconds and say it again; cut it later.

---

## Shot 1 — the problem (0:00–0:10)

**On screen:** landing page. Mouse still.

> "Every property submission starts with a Statement of Values, a spreadsheet or PDF nobody agreed on the shape of. Someone retypes it into a schedule by hand. This does the first mile of that."

## Shot 2 — a real file (0:10–0:35) — the centrepiece

**Do:** click **State of Mississippi**. The page counter runs. Keep talking over it.

> "I didn't want to demo this on files I made up. This is the State of Mississippi's actual published SOV. Seventy-nine pages, almost four thousand buildings."

**Do:** the mapping screen appears. Pause on it for one beat. Click **Build the schedule**.

> "No template, no configuration. It finds the columns itself and tells you how it decided each one."

**Do:** rows stream in, about six seconds. When it finishes, move the cursor to **Ties to source totals 49/49** and hold it there.

> "And here's how you know it's right. The PDF prints a subtotal for every state department. Forty-nine of them. The schedule reproduces all forty-nine, to the dollar. I didn't write an answer key for this. The document checks itself."

## Shot 3 — provenance (0:35–0:45)

**Do:** click any TIV cell in the first few rows. The side panel opens.

> "Every number knows where it came from. Page one, line seven, and the exact text that was in the PDF."

## Shot 4 — it argues with the file (0:45–1:00)

**Do:** **New file**, click **Town of Ware, MA**, then **Build the schedule**. In the flags panel, point at the red line: *Zip 10182 is not in MA*.

> "This one's a town in Massachusetts. Their SOV is one page buried in a hundred-and-fifty-page RFQ, and it finds it. Then it catches this: five buildings listed at a New York zip code. That's a typo in the town's own published document. A cat model would have put those buildings on the wrong coast."

## Shot 5 — break it (1:00–1:18)

**Do:** **New file**. Tick **drop the connection mid-stream**. Click **State of Mississippi**, **Build the schedule**. Point at the timeline as the amber line and then the green line appear.

> "Now I kill the connection on purpose, a third of the way through. It reconnects from the last event it got, finishes without re-sending a single row, and still ties out forty-nine of forty-nine."

## Close (1:18–1:25)

**Do:** switch to the GitHub tab, scroll to the "On real documents" section.

> "What the real files broke, and how I fixed each thing, is in the README. Free, no login, nothing stored."

---

## Rules

- **Do not** say FurtherAI, "for your team", or anything about the job. The tool carries the video; the message carries the ask.
- **Do not** apologise or call it a "quick little project".
- Move the cursor slowly and only when you're pointing at something.
- If Mississippi feels long in Shot 5, it's fine to cut the middle of the stream in editing. Keep the amber "Connection closed" line and the green "Resumed" line on screen.

## If something goes wrong on the day

- **Stuck on "Reading page..."** The PDF is 1.5MB and parses in your browser. Hard-refresh and do the pre-load step again.
- **Drop toggle does nothing.** It only applies to a fresh run: **New file** first, then tick it, then load the sample.
- **Ware takes a few seconds.** It's 150 pages, most of them scans. The page counter keeps moving; talk over it.
