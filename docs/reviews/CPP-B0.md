# Hostile review: B0 of CPP-PLAN (branch cpp-plan, 332db62 on main 4063ad1)

Verdict: **no-go until F1 is fixed** (one line plus a guard). The rest holds: scan.js gives the old
answers, the memo returns only immutable values, the speed claim reproduces. F2 and F3 are cheap
follow-ups and can go in the same commit.

## F1 (medium, data loss): the joined undo window goes stale when a file changes outside commit

`src/app.js:1084` joins the windows of an open step as the minimum of each commit's. That only holds
if the text at the start of commit k+1 is the text commit k left. `openFiles` breaks this:
`src/app.js:4271` writes the opened texts into `this.files`, and `src/app.js:4283` (no figure placed)
never calls `closeGroup()`. So the next keystroke within 2 s joins the open `type` step, keeping a
window measured against a text that no longer exists. `diff()` then returns a wrong record, and
Ctrl+Z writes text that is neither version.

Repro (Chromium, the branch's `dist/`): `cd test && python3 /tmp/review-b0-out/undo_import2.py`.
The project is main.tex `\input{chap}`, with chap.tex `Hello world here.\n\nMore text.\n`. Type `x`
after "Hello", open a chap.tex with one more line at its top, then type `y`.
- recorded step: `{s:5, del:'', ins:'iyne someone added\nHellox'}`, win `{pre:5, suf:25}`
- after Ctrl+Z: `'% a l world here.\n\nMore text.\n'`. "Hello" is gone and so is half of the
  imported line.
- on main the step is `diff(b0, t2)` from both ends, which by construction undoes back to b0 (the
  import is undone with it, as before). Not corrupt.

The same happens with any step that touched two files when only the other one is replaced. The
edge.test.mjs fuzz misses this because it applies only the step's own edits between commits.

Fix: (a) `closeGroup()` before `src/app.js:4271` (a file opened over another is a step boundary
anyway). (b) Make the windows check themselves so no future path can do this. In `record()` keep
`top.after = new Map(files after this commit)`. In the join branch, for every f in `top.win`, keep
the window only if `(before.has(f) ? before.get(f) : this.files.get(f)) === top.after.get(f)`.
That check is O(1) when the string is the same object. Add a case to edge.test.mjs that changes
the text between two joined commits.

## F2 (low to medium, memory): BIB_CACHE is capped by count, not size, and outlives projects

`src/model.js:614-622` keeps up to 32 names, each with its text and parsed entries, and never lets
go of a closed project's .bib. Measured (`node --expose-gc /tmp/review-b0-out/bibmem.mjs`): 8
projects, each with a 1.2 MB .bib, built once and closed, leave **38 MB** in the heap (about 4.7 MB
per MB of .bib). At 32 names that is 150 MB or more, which a phone tab will not stand.

Fix: a character budget like scan.js's (for example 8e6 over all texts, always keeping the
newest), or drop at each `ensureBib` the names the current build did not ask for.

## F3 (low, latent): kept .bib entries are shared, mutable objects

Every build's `bibEntries` holds the same entry objects (`src/model.js:2053`). No caller writes to
them today: I checked app.js:3107, nav.js:73, refList and citeInfo, and bib.js's formatEntry,
shortAuthors and entryYear. A test that writes `e.fields.title` on one build's entry sees the change
in the next build (`/tmp/review-b0-out/cache_attack.mjs`, its NOTE line). Fix: `Object.freeze` each
entry and its `fields` when parsedBib stores them (once per text), so a future writer throws
instead of silently changing every later build.

## Nits
- `src/app.js:1112`: `undo()` clears `h.before` but not `h.win`. Harmless, because a redone step is
  never open again, but closeGroup and every other clearing site now clear `win` too.
- Pre-existing and kept on purpose, not a regression: `preamble.js stripComments` duplicates the
  character at 400000 when t[399999] is a backslash (`commentsBlanked` keeps n+1 characters, then
  `+ t.slice(n)` adds it again), so offsets after 400000 are off by one. The scan.js comment calls
  this something callers "rely on". It is a bug: worth a PLAN.md line.

## What held
- scan.js against the old loop: scan.test 5/5; my fuzz of 200,000 texts cut anywhere (backslash
  just before the cut, comments across it, lone surrogates, \r) found 0 mismatches
  (`/tmp/review-b0-out/fuzz.mjs`). Cap boundaries 200000±2 and 400000±2 with `\%`, `%...\n`, `\\%`
  across the cap: identical for preamble.js, looks.js and preambleEnd. The same text passed as a
  different string object gives the same answer.
- Memo safety: it returns only strings and numbers, so no caller can mutate a kept answer. A
  text edited and then edited back, two projects with same-length .bib texts interleaved, and the
  same name in two projects all give their own entries (cache_attack.mjs: no failures).
- Memo memory: 40 distinct 2 MB texts through every reader leave 7.6 MB in the heap, inside
  BUDGET.
- Undo window math: correct whenever the precondition holds. The prefix and suffix windows compose
  by min, the hints cannot change diff's answer, and edits are filtered in-range first
  (app.js:1025), so a negative suf cannot happen. Surrogates behave as before (code units, same
  answer as an unhinted diff).
- Tests on the branch: model ok (bib cache ok), edge 7677/7677, native 43/43, incremental 34/34.
  `INCR_FULL=1` failed 1 check (the fast-path share, 334 vs a floor of 380), and main's sources
  (/tmp/rk-main) fail it identically. Not a regression; PLAN.md says so.
- Speed (`taskset -c 0 dev/bench_native.mjs -n 9`, one run each; files in /tmp/review-b0-out/):
  `long` keystroke model JS 35.4 → 14.3 ms and core 35.6 → 14.6 ms. `long` first load 50.6/50.0 →
  34.6/32.4 ms. `generated` first load 269/196 → 138/141 ms. Parse unchanged. This matches
  PLAN.md task 66's numbers.

## Verification of 442c9b5

Verdict: **merge.** F1, F2 and F3 are fixed, and so is the old offset bug at 400,000. 8b38220's
argument holds. Two performance nits are left, both no worse than main.

- **F1 (c155bb4).** `undo_import2.py` on a rebuilt `dist/`: opening chap.tex now ends the step, so
  the typing before and after it are two undos, and Ctrl+Z gives a text that existed.
  `undo_import3.py` tests the guard directly: `files.set` with no `closeGroup` between two
  keystrokes. stepJoin drops the window (win `[]`), the record is a comparison from both ends, and
  Ctrl+Z gives back the original text, as main does.
  - The stepJoin check is sound. For each windowed file it compares the step's kept text with the
    text this commit started from (or the text now, for a file this commit did not touch). It
    compares contents, so a file edited and edited back keeps its window, correctly. In the common
    case it is the same string object, so the check is O(1).
  - The paths I checked:
    - two files in one step: covered by edge.test, 10691 of 10691 with 1145 outside changes
    - Track Changes: Accept and Reject are commits of other kinds and touch only `B.files`
    - another tab: closeGroup on both sides (app.js:4487)
    - a remote pull: `loadGitFiles` replaces the files and resets the history
    - rename and delete: no code path renames a file, and the only delete is undo of a made file,
      which pops the step
    - the only other place that pushes a step pushes a closed one (`review.js:535`)
- **F2 and F3 (708861b).** `bibmem.mjs`: 38 MB → 6 MB held after 8 closed projects. A write to an
  entry now throws (cache_attack.mjs, strict mode). Nothing in src writes to an entry; the only
  readers are app.js:3103 and nav.js:73. Every cache_attack check passes except the old-oracle
  check at the 400,000 cap, which 0964fa9 changes on purpose.
- **0964fa9.** `cap400.mjs`: 35 texts, the cap at ±3 with `\%`, `%…\n`, `\\%`, a comment with no
  newline, and a lone backslash across it. stripComments keeps the text's length every time, and
  the result is the blanked part followed by the rest.
- **8b38220.** Accepted. The new exact check, a keystroke in the middle of each paragraph of each
  repository document, passes on main's sources (/tmp/rk-main) with the same floors. So B0 takes
  the fast path exactly where main does, and the 1 in 20 share was luck in the random streams.
  Lowering it to 1 in 40 is safe, because the per-paragraph check is a stricter guard than the
  share it relaxes.
- **Tests on 442c9b5:**

| test | result |
|---|---|
| scan | 8/8 |
| model | bib cache ok |
| edge | 10691/10691 |
| preamble | 20 groups |
| looks | 11 groups |
| styles | 29 groups |
| bib | 71/71 |
| native | 43/43 |
| incremental | 35/35 |
| `INCR_FULL=1` incremental | 35/35 |
| fuzz.mjs | 0 mismatches in 200,000 |

- Nits, performance only and no worse than main:
  - (a) `parsedBib`'s `asked` grows as the loop goes. A miss past the 4 M budget can therefore
    drop a .bib that the same build asks for later, and that file is read again within the
    build. Fix: resolve every name into `asked` before the loop.
  - (b) A build of other files (collab.js:160 and 288, a shared link's check) drops the open
    project's .bib, so the next keystroke reads it once more.
  - Not a regression: if a file in an open step were ever deleted between commits,
    `diff(b, undefined)` would throw, as it does on main. No path deletes a file today.
