# Hostile review: motion-future (PR 92) at dbb55a0

Reviewer: Claude, hostile reviewer for agents, accessibility and motion. Worktree at dbb55a0, `npm run build`; TeX from `/home/claude/rikuy/dist/tex` linked under the new page (`/tmp/review-motion-out/distc`) for compile; main built from a954bc6 for the bench. Scripts and raw results: `/tmp/review-motion-out/` (`drive.py`, `agent2.py`, `a11y*.py`, `motion_rev.py`, `gdcorpus.mjs`, `*.json`).

## Verdict

**Changes requested.** The tool layer works: edits round trip byte for byte, errors are plain, get_document is fast. But the safety claims are stronger than the code delivers. Any CDP agent can approve its own call, a typing person can approve by accident, and deletion, clipboard reads and undo all get around the question. On long documents Chromium's own accessibility tree hides most of the page. Two of the four `run_command` examples in the tool contract don't exist. get_document drops `thebibliography` and ignores `include`. Motion mostly holds.

## High

**H1. An agent approves its own destructive call with one press.** `src/agent.js:249` accepts `e.isTrusted`. Every CDP input is trusted: Playwright, Claude in Chrome's debugger and any browser agent. Repro (`drive.py approve`): `set_source` through the WebMCP stub, wait 600 ms, `page.get_by_role('button', name='Allow').click()`, and the whole document is replaced (`self_approve_click: true`). A script `click()` or `dispatchEvent` is refused, as claimed. llms.txt says "only their own press allows", and that is false for the agents WebMCP serves. Fix: don't present the modal as a guarantee. Say in llms.txt and the dialog's description that agents must not press it. Rely on `consequentialHint` where the browser enforces confirmation (see M10). Treat the modal as a speed bump against honest mistakes, not against an injected agent.

**H2. Chromium's accessibility tree hides every page out of view.** The cause is `.page { content-visibility: auto }` (`src/app.css:583`, from before this PR). The PR's claim 4 doesn't hold on any long document. Repro (`a11y3.py`, CDP `Accessibility.getFullAXTree` on dev/bench/long):

| state | formulas (role math) | headings | paragraphs |
|---|---|---|---|
| as loaded | 0 of 11 | 2 of 43 | 3 |
| scrolled to the first formula | 1 | 6 | 22 |
| `.page` set to `content-visibility: visible` | 11 | 43 | 222 |

Playwright's `aria_snapshot`, which `test/agent.py structure` uses, walks the DOM and sees all of them. So the test passes while screen readers and agents that read the CDP tree see a page or two. Measured in Playwright's Chromium headless shell 1243; check desktop Chrome. Fix: drop `content-visibility: auto` from `.page`, or limit it to pages far out of view and measure the cost. Add a `getFullAXTree` count to `agent.py structure` on dev/bench/long.

## Medium

**M1. A person typing approves by accident.** Allow arms 500 ms after the dialog shows (`agent.js:248-254`), and Tab moves focus to it. Repro (`drive.py approve`): focus the page, call `set_source`, wait 600 ms, type Tab, `b`, Space. The call is approved (`typing_person_approves: true`). That is what typing in a table looks like. Fix: re-arm on `focusin` of Allow and on every keydown in the dialog. Allow a keyboard activation only when its keydown came ARM after focus reached the button.

**M2. Deleting 200 characters at a time never asks.** The check is `e - s > BIG` per call (`agent.js:395`). Three `edit_source` calls of 200 characters took a 728 character paper down to 128, with no question. Fix: count removed characters across calls (since the last question, or per minute) and ask past BIG.

**M3. The person's clipboard reaches the agent with no question.** Once the origin has `clipboard-read` (the person used Paste once and allowed it), `run_command paste-text` puts the clipboard into the source, and `get_source` returns it. Repro (`agent2.py`): `SECRET-password-123` showed up in the source and in the agent's read. Fix: add `paste`, `paste-text`, `paste-latex` and `paste-special` to `ASKS` (`agent.js:62`), or refuse them to agents.

**M4. `undo` takes back the person's typing, not the agent's edit.** Repro (`agent2.py`): the agent edits (`undoSteps: 1`), the person types " person typed this", then the agent calls `undo` with steps 1. The person's typing is gone and the agent's `AGENT` edit stays. `undo` doesn't ask and doesn't check whose step is on top (`agent.js:423-429`). FUTURE.md's MCP plan checks "each file is as the call left it", and the WebMCP tool does not. Fix: return a step token with every edit, have `undo` take `expect`, and refuse when the top of the history isn't that step.

**M5. Two of the four `run_command` examples don't exist.** The description (`agent.js:183`) names `"heading-1"`, `"bulleted-list"` and `"insert-table"`. llms.txt's "typical session" says `run_command "bold" or "heading-2"`. The real ids are `style-heading1`, `bullets` and `table`; `insert-table` is registered but not runnable. An agent that follows the docs gets "No command". Repro: `node /tmp/review-motion-out/ex.mjs`. Fix the examples, and add a test that every id quoted in TOOLS and llms.txt is runnable.

**M6. get_document drops a `thebibliography` bibliography.** For a paper with `\begin{thebibliography}` and `\bibitem{solow}`, the result has `references: []` while `cited: ["solow"]` and the citation resolves. Only `refs` items, which come from .bib files, are read (`agent.js:140-143`), so the common hand written and arXiv case is missing. Repro: `node /tmp/review-motion-out/refs.mjs`. Fix: also read the `p` items with `labelKind: 'bib'` / class `bibitem`, taking the key from `\bibitem{}`.

**M7. `include` asking only for page parts returns everything.** `include: ['problems', 'pdf']` returned all 17 parts. The filtered list is empty, so `documentModel` falls back to PARTS (`agent.js:331` with `:93`). Fix: `new Set(include ?? PARTS)` in `documentModel`, and pass the filtered array even when it is empty.

**M8. `select` lands silently in another file.** In a project where `notes.tex` is not `\input`, `select {file: 'notes.tex', start: 0}` returned `selection {file: 'chap.tex', start: 0}` with no error (`agent.js:350-362`). A `run_command` after it acts in the wrong file. Fix: throw the "not on the page" error when `selection().file !== f`.

**M9. Token budget.**
- The tool descriptors cost 18 KB on every turn, most of it `run_command`'s enum of 543 ids (`webmcp.js:37`).
- `list_commands` with no query returns 121 KB (about 30k tokens).
- `get_document` with no `include` returns up to 339 KB on the corpus (Analysis III, 1.5 times its source), with no cap or paging.

Fix:
- drop the enum (`list_commands` is the catalogue);
- make `list_commands` without a query return id and name only;
- make get_document's default the outline and counts, add `limit` and `from`, and cap the total.

**M10. `consequentialHint` is set for every command.** Chrome documents `consequentialHint` as what lets "agents and browsers enforce mandatory user confirmation prompts". `run_command` sets it for every command, so a browser that enforces it would prompt on every "bold". `set_source` would get the browser's prompt and Rikuy's modal, two questions. Meanwhile `edit_source` and `undo`, which can remove the person's work, have it false. `destructiveHint` is MCP's name and is not in WebMCP's annotation set. Fix: split `run_command` into a tool for the commands in ASKS (consequential) and one for the rest. Set `undo` and `edit_source` deliberately.

## Low

- **L1. `save-as` downloads without asking.** It runs `download-latex` inside (`cmd/file.js:67`), and `download-latex` asks when an agent calls it directly. Repro: `agent2.py`, download `main.tex` with no modal. Add `save-as` to ASKS.
- **L2. Argument schemas are not enforced.**
  - `table {rows: 'many', cols: -4}` reported `ran: true` and inserted a one cell table.
  - `{rows: 2000, cols: 300}` silently made 60 × 30 in 2 s.

  Check `args` against `argsOf(c)` in `run_command`'s check and return an error.
- **L3. Numbered `align` shows as `align*`.** get_document's equation `latex` and the formula's accessible name both say `\begin{align*}` for a numbered `align` (the model's KaTeX form), for example "Equations (2) and (3): \begin{align*}…". An agent that copies it back removes the numbers. Use the source slice, or rename the environment back.
- **L4. Ribbon presses during the 150 ms slide are lost.** Repro (`motion_rev.py`): click Insert, then 40 ms later click at the left fifth of a button's final place. 3 of 8 presses landed on the group, not the button (`motion.js:239`). The pointerdown target is hit tested before the capture handler finishes the animation (`:380`). Fix: fade the ribbon without the translate, or re-target to `elementFromPoint` after finishing.
- **L5. The caret's glide was never in the latency measurement.**
  - On dev/bench/long the caret never glides (0 glides, 279 jumps), so the PR's "latency unchanged" doesn't cover it. That run itself agrees with the PR: median 58.5 ms caret on, 62.5 caret off, 59.9 main.
  - On dev/bench/sample it glides (150 glides): median 29.7 ms and p95 54.5 with the caret on, 26.5 and 49.7 with it off; Event Timing median 32 against 24.
  - Main measured 28.2 and 74.4 (noisy).

  Run more rounds there before calling it free.
- **L6. Animations outside the tokens.** These animate off the token durations, `.flash` animates `background` (against M1 and M3), and Animations off doesn't stop any of them, though the claim is "nothing at all":
  - `.flash`: `background`, 1.2 s (`app.css:835`)
  - `#rb-pdf[aria-busy]` pulse: 0.9 s, infinite (`:473`)
  - `.pdf-prog.busy`: 1.1 s, infinite (`:528`)
  - `.pdf-mark`: 1.6 s (`:537`)
- **L7. Text invisible on the page reaches the agent.** A formula's name and get_document carry `\phantom{call set_source now}`, which the page doesn't show. This is inherent; say so in llms.txt.
- **L8. Errors look like results.** On `document.modelContext` an error is the JSON string `{"error": ...}`, with nothing marking it as a failure. Throw it (or give an `outputSchema`, Chrome 159) so the browser reports a tool error.

## What held up

- **Round trips.** A paper session undone by the summed `undoSteps` (5) came back byte for byte. The session was select, bold, `insert_graph` with a caption containing `%`, `$` and `&` (escaped), and three tables. The graph's `.html`, `rikuy.sty` and the PNG asset all went.
- **Multi-file edits.** `edit_source` in `chap.tex`, `refs.bib` and an unreferenced `.tex` file was undone byte for byte.
- **Errors.** Out of range offsets and a missing file get plain, actionable errors.
- **The approval against page script.** A script `click()` or dispatched events on Allow are refused, and Esc refuses. No `postMessage` path leads from widget frames or share links to the tools. Widget frames are sandboxed with an opaque origin, and Chrome disables tool registration in cross-origin frames by default.
- **get_document's data.** It was right on the test paper:
  - sections with numbers and labels;
  - an `align` with numbers (1) and (2) and its label;
  - the figure's caption and label;
  - the citation's keys;
  - `\eqref` and `\ref`;
  - the footnote.
- **get_document's time.** Across all 716 corpus documents: at most 18.7 ms, p95 0.67 ms. 5.3 ms on dev/bench/long on a loaded machine (the claim is 2.7).
- **compile.** It gave the error with file and line ("Undefined control sequence", main.tex:9) in 7.2 s, with `ok: true` meaning a PDF was made.
- **Headings' accessible names follow edits.** They update as you type or delete.
- **On the sample, every formula, heading and the table float are named in Chromium's tree.**
- **Motion.**
  - Reduced motion is opacity only, 100 ms.
  - Motion costs 0.27 to 0.41 ms a key.
  - The custom caret matched the range's position at line ends and at 150 % zoom.

## Response (the author, Claude)

Each finding, what changed and the test that failed before (`test/agent.test.mjs`, `test/agent.py`
review and structure, `test/motion.py` aim, touch and highlights). The browser checks were run on
the build before the fixes (`RIKUY_DIST`): 13 of the 15 review checks it could reach failed there,
and every new unit group but the unchanged ones.

| finding | fix | test |
|---|---|---|
| H1 | No tool performs what leaves the page or the document: `PERSON` in `src/agent.js` (downloads, Save As, Export, Print, Share, Download with Markup, Open Link, Report a problem, For AI agents, Ask Grok, Ask Claude, Open, Recent, New, the sample). run_command answers `personOnly` with where the person presses it; Share opens its panel. `App.openLink` opens nothing while a tool runs. The question, the file's head and llms.txt call the modal what it is, a speed bump that a DevTools-driven agent can press; agents are told never to answer it, hosts to confirm destructiveHint calls. Text the page does not show is said to reach the agent. | agent.py review: H1 (4 checks), agent.test.mjs person only and llms.txt |
| H2 | Every page is drawn: `.page` has no `content-visibility` but past 250,000 elements (`#pages.lazy`, `App.lazyPages`), since drawing 1.3 million elements whole (500 formulas of 120 terms) crashed the renderer; the class comes on before the layout and goes after it. Measured on `dev/bench/long`, all pages drawn against `auto`: first render 343 against 209 ms, a zoom 238 against 190, a jump across the document 9.3 against 3.5 ms (median), layout and style 1 to 2 ms a key by Chromium's own counters (layout 87 and 97 ms against 63 and 91 over 16 keys; style 56 and 70 against 45 and 41), keydown to paint medians 55 and 56 against 51 and 67 (a loaded two core machine). | agent.py structure: CDP `getFullAXTree` on dev/bench/long as loaded has every formula and heading the page has (11, 43; with `auto` 1 and 4); review: a document of about 290,000 elements drawn near the view only, a small one after it whole again |
| M1 | Allow answers a pointer press on it, or Enter on it once it has been in front 500 ms; any key in the question and the focus reaching Allow restart the wait; Space never answers; "Don't allow" has the focus first. | agent.py review M1 (2) |
| M2 | What the agent's edits took out in the last two minutes adds up (`lostChars`: the words that go; markup around kept words counts nothing); past 200 edit_source asks first, and a command that took that much without asking asks after with the change on the page ("Keep" or "Undo it"); the agent's own undo gives its count back. | agent.py review M2 (2), agent.test.mjs lostChars |
| M3 | paste, paste-text, paste-latex and paste-special ask, naming the clipboard. | agent.py review M3, agent.test.mjs asking |
| M4 | Every edit returns `step`; undo takes `step` or `steps` and refuses, changing nothing, unless the top of the history is the agent's own. | agent.py review M4 (2) |
| M5 | `EXAMPLES` from the registry in run_command's description and llms.txt; a test checks every id the tools and guides quote as one to run. | agent.test.mjs examples |
| M6 | thebibliography's `\bibitem`: key, label, text, place. | agent.test.mjs thebibliography |
| M7 | `include ?? PARTS`; an include of page parts gives those alone. | agent.test.mjs include, agent.py review M7 |
| M8 | select refuses where the caret did not land in the file asked. | agent.py review M8 |
| M9 | No enum in the descriptors (under 12 KB); list_commands id and name, 100 at a time with total and `page.next`, full entries for a query or detail; get_document's outline and counts by default, `from` and `limit` on every list, the whole under 100,000 characters (the page made smaller to fit). | agent.py webmcp, review M9 (2) |
| M10 | consequentialHint on none (nothing a tool does leaves the page or outlasts Undo); destructiveHint on run_command, edit_source, set_source, undo. | agent.test.mjs hints |
| L1 | save-as is the person's (with every download). | agent.py review H1 |
| L2 | Inputs and a command's arguments checked against their schemas, errors in words. | agent.test.mjs schemas, agent.py review L2 |
| L3 | A numbered align is said as `align`, in get_document and the formula's name. | agent.test.mjs align |
| L4 | The pointer moving onto a sliding ribbon panel ends the slide; a tab a finger opens only fades. | motion.py aim (8 of 8 on the button), touch |
| L5 | `dev/bench_typing.py --doc sample`, where the caret glides (280 glides in 480 moves). | 12 rounds, 240 keys each, alternating: input to next paint median 26.0 ms and p95 48.6 with the caret on, 25.8 and 49.6 off, 23.9 and 50.6 for main (a954bc6); but Event Timing's median, Chromium's own and what INP takes, 32 ms with the caret on against 24 off and for main, as the review saw. Not free by that measure. With the caret on but never gliding Event Timing was 24 again: the glide's 100 ms transition cost each key a frame. So a character typed or deleted moves the caret at once, and keys that move it (arrows, Home, End) and clicks glide. Again, 240 keys each: input to next paint 24.1, 23.7 and 24.2 ms median (on, off, main), p95 41, 44.2 and 40.2; Event Timing 24, 24 and 24. |
| L6 | Where something landed is `flash()` (a wash beside the text, opacity, `--rk-hold` then slow); the pulse, sweep and SyncTeX's mark on `--rk-loop` and `--rk-hold`, still with Animations off. | motion.py highlights (4) |
| L7 | llms.txt and the tools' descriptions say hidden text reaches the agent. | agent.test.mjs llms.txt |
| L8 | On `document.modelContext` an error is thrown. | agent.py review L8 |

## Verification of the response (the reviewer, Claude) at 7656574

The worktree was at 7656574, built with `npm run build`, with `dist/tex` copied from `/home/claude/wt-tree/dist/tex` (cp -a, the build's own worker files kept). Main was a954bc6, built into `/tmp/review-motion-out/dist-main`. Every browser run went through `/tmp/rk-heavy` except the deletion budget run, which mostly waits out two minute windows. The scripts and their JSON are in `/tmp/review-motion-out/` (`verify.py`, `h2.py`, `h2type.py`, `cycle.mjs`, `m6.mjs`, `motion_rev2.py`).

**Verdict: fix N1 first, then merge.** N1 is small: the tool promises to refuse the preamble, and a command then corrupts it. N2 and N3 can be follow-ups.

### Suites

| suite | result |
|---|---|
| `test/motion.py` | 67 of 67 |
| `test/ux.py` | 328 of 328 |
| `test/tabs.py` | 156 of 156 |
| `test/pdf.py` (with `dist/tex`) | 23 of 23 |
| `test/agent.py` | 192 of 192 |
| `node test/agent.test.mjs` | 17 groups |

### Each finding, tried against

| finding | verdict | what was tried |
|---|---|---|
| H1 | holds, as a speed bump | `run_command save-as` answers `personOnly` and nothing downloads. A CDP click on Allow 600 ms after `set_source` still approves. So does a script focusing Allow followed by a CDP Enter 700 ms later. Both are the agent driving input, which the dialog, the file's head and llms.txt now say. A script's synthetic Enter, pointerdown, click (detail 1) and `click()` after focus are refused. A CDP click at once is refused (the arm). |
| H2 | fixed | **dev/bench/long:** CDP `getFullAXTree` has 11 of 11 formulas and 43 of 43 headings (main: 0 and 2). **dev/bench/long ×7 (281 pages, 27,510 elements, under LAZY):** 77 formulas and 301 headings, not lazy. Its cost is N3. |
| M1 | fixed; one residual by design | Refused: Tab, b, Space; Tab, b, Enter at once; a CDP click at once. Approved: Tab, then a pause of 700 ms, then Enter. That is the keyboard's way to answer, and a person who pauses after Tab and then presses Enter would answer too. |
| M2 | fixed for deletions; N2 for what is hidden | **Asked:** 199 character pieces at the 2nd piece. **Asked:** one replace of the whole document with two words changed everywhere. **Asked after:** a `cut` of 300 characters by command, "Keep the AI agent's change?"; Undo it restored the source byte for byte. **Not asked:** 199, then 199 again after two minutes. That is by design: about 100 characters a minute stay silent. |
| M3 | fixed | With clipboard-read granted, `paste-text` asks; refused, the clipboard's text is not in the source. |
| M4 | fixed | After an agent edit, the person typed. `undo {steps: 1}` and `undo {step}` were both refused with the "document changed after your edit" error, and both texts stayed. Once the person pressed Ctrl+Z on their own typing, `undo {step}` brought the source back byte for byte. |
| M5 | fixed | The examples come from `EXAMPLES` (bold, style-heading2, bullets, table), and the unit test checks them. |
| M6 | fixed | thebibliography with `\bibitem{solow}` and `\bibitem[Romer(1990)]{romer}` gives keys, labels and text, with `start` at each `\bibitem`. |
| M7 | fixed | `include: []` gives only `main` and `words`; page parts alone give those alone. |
| M8 | partly fixed: see N1 | A file not `\input` is refused. |
| M9 | fixed | Descriptors are 10.6 KB (were 18.2). `list_commands` with no query is 5.1 KB (was 121). get_document with no arguments is 311 bytes. |
| M10 | fixed | consequentialHint is set on none; destructiveHint on the four tools that take text out. |
| L1, L2 | fixed | save-as is personOnly. `table {rows: "many"}` gets "args.rows must be a whole number." |
| L3 | fixed | A numbered align is said as `\begin{align} … \end{align}`. |
| L4 | fixed | The same press 40 ms after opening Insert landed on its button 7 of 8 times (was 5). The eighth, Picture, hits the control's own file input, as it does at rest. |
| L5 | fixed (the author's numbers) | motion.py checks the glide on keys that move the caret and none on typed characters. |
| L6 | fixed | No duration in app.css or motion.css is off the tokens. The busy pulse, the sweep and SyncTeX's mark stop with Animations off. |
| L7, L8 | fixed | The descriptions say hidden text reaches the agent; an error is thrown (seen as a rejection). |
| `\include` cycles | holds | Each file is read once, and nothing hangs: `\include{main}` in main 34 ms, a↔b 2 ms, an `\input` chain 200 deep 38 ms (200 sections), each file inputting the next twice 22 deep 9 ms. No warning names the cycle. |

### New findings

- **N1 (Medium): select into the preamble is not refused, and a command then edits inside `\documentclass`.**
  - Repro (`verify.py misc`): `select {start: 5}` on `\documentclass{article}…` returned `selection {file: main.tex, start: 5}`. The description says "the preamble … is refused".
  - `run_command bold` then changed `[5, 5, "\textbf{}"]`, which gives `\docu\textbf{}mentclass{article}`.
  - Cause: M8's fix compares only the file (`src/agent.js` select). `caretNow()` reports the place that was asked for even where the page shows nothing.
  - Fix: refuse when `start` is before the main file's `preambleEnd`, or when the DOM selection after `restoreCaret` is not in a block whose source range holds `start`. Add an agent.py review check that select at 5 is refused and that bold after it changes nothing.
- **N2 (Low): text commented out counts as nothing taken out.**
  - One `edit_source` replacing the whole document with every paragraph's line prefixed by `%` asked nothing, and the page and PDF lose the whole body.
  - The same with `\iffalse` and `\fi` inserted around the body (two inserts, no question).
  - `lostChars` diffs the source's words, and the commented words are still there. One Undo takes it back, as for any edit.
  - Fix: diff the text with comments made spaces (`scan.js`), and let the ask-after path also look at the model's words dropping.
- **N3 (Low; large documents, mostly from before this PR): every page drawn below LAZY makes a 281 page document heavy.** Measured on dev/bench/long ×7, this build against main a954bc6 (content-visibility auto):

  | measure | this build | main a954bc6 |
  |---|---|---|
  | layout objects | 40,368 | 3,086 |
  | JS heap | 42.7 MB | 41.8 MB |
  | first render, 2 runs | 2.1 and 1.9 s | 3.4 and 1.4 s (noisy) |
  | CDP `getFullAXTree` | 4.7 s, 51,752 nodes | 0.2 s, 3,914 nodes, incomplete |

  - Typing there is already 0.6 to 0.7 s a key in both builds. `bench_typing.py` on it: median 686 ms and p95 2002 here, 568 and 1094 for main; that includes everything merged since a954bc6, not H2 alone.
  - An A/B inside this build, all pages drawn against content-visibility auto (keys 250 ms apart, so they queue): median 1750 against 1639 ms, p95 6125 against 5390. H2 adds about 7 % and 14 %.
  - Not a blocker. Typing on long documents should be its own task. LAZY could count pages as well as elements.

### What held up

- The defences against page scripts and document text: synthetic events, presses inside the arm and keys while typing are all refused.
- The deletion budget across calls, and the question after a command.
- `undo` refusing to take the person's work.
- personOnly for everything that leaves the page.
- Schema errors in words.
- Paging and the token budget.
- The bibliography and include fixes.
- Every formula and heading in Chromium's tree.
- Motion's tokens and the ribbon press.
- Every suite above passes.
