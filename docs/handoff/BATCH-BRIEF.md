# Brief for a Word gap batch in Rikuy

<!-- The brief every round 1 to 3 batch author got, kept so another agent can start a batch the
same way. Machine notes: `/tmp/rk-heavy` was a semaphore on the build machine letting two heavy
runs at a time; elsewhere run heavy suites one or two at a time. Worktrees and branches are named
in each batch's own brief; HANDOFF.md says what is in flight. -->

Rikuy (repo pdfrackebrandt/rikuy, live at rikuy.rackebrandt.pe) is a LaTeX editor in the browser: you type on the typeset page as in Word, each edit patches the `.tex` source minimally, real TeX Live 2026 runs in the page. The owner wants every option Microsoft Word and WordCraft have that Rikuy lacks, done "strictly better": Word's ease, clean standard LaTeX underneath that Overleaf opens, and hand written LaTeX for the same thing shown and edited the same way.

## Read first, in this order
1. AGENTS.md in your worktree (rules, checks, pitfalls). Its rules hold everywhere.
2. docs/handoff/GAP.md §0 (the rules every BUILD row obeys, including the round trip rule), §2 (tabs, groups, keys, names for agents), §3 (your batch's row in the batches table: what you own, shared files, tests).
3. Every row of docs/handoff/GAP.md §1 your batch owns (ids listed in your brief). Implement every row marked BUILD. If a row turns out wrong or impossible, say so in your report with the reason; do not silently drop it.
4. docs/handoff/B0-REPORT.md: the frame you build on (registry, order.js groups, kit, preamble.js, wrap.js, blockenv.js, roundtrip()). Use them; do not re-implement them. Each batch edits only its own src/cmd/<area>.js and its own new files; shared files only as GAP §3 "Shared files" allows (rows added to model.js tables, new cases appended in wordast.js / wordjobs.js, one section per batch in app.css).


## The machine (read this before running anything)
- 2 cores, 7 GB RAM, shared with up to 12 agents. Wrap EVERY CPU heavy command in the semaphore `/tmp/rk-heavy`, which lets at most two run at a time across all agents: every Playwright/Chromium script (all test/*.py, screenshots), every in page compile, `npm test`, `npm run test:corpus`, `npm run build` is light enough to run directly. Example: `/tmp/rk-heavy python3 test/ribbon.py`, `/tmp/rk-heavy npm test`. Waiting for the semaphore is normal; never bypass it. Keep each heavy run short: run only your own new suite while developing; the full set once at the end.

## Lessons from the reviews of the first batches (each found 5 to 13 high bugs; design against them from the start)
- Never write unbalanced or unescaped text (use App.escapeAt for text from fields); never let a write land inside a comment, inside an argument of another command, or inside a `% rikuy: latex` paragraph (raw LaTeX: skip it or treat it as source).
- Never break a group that is an argument (`\noindent{…}`, `\textbf{…}`, `\resizebox{…}{!}{…}`, `\multicolumn{…}{…}{…}`); keep `\noindent`, `\label`, comments with what they belong to; keep CRLF files CRLF; never duplicate comments (Rikuy's review comments are `%` lines).
- Every package line through App.packageEdits (once, options merged, \PassOptionsToPackage where loaded elsewhere, never inside \if…\fi); never stack a package that conflicts with one already loaded or with the class (beamer, KOMA, memoir: use their own mechanisms or disable with whyNot); check hand written equivalents and the class's defaults before adding anything.
- Everything Rikuy writes must compile on pdfLaTeX, XeLaTeX and LuaLaTeX where relevant (in page compile with dist/tex in your tests), and the page must draw it as TeX prints it; floats never inside multicols or other floats.
- Partial selections split formatting as Word does; undo is one step and byte for byte; Replace/edits never use stale positions after typing.
- Bounded scans only on a stranger's text (preambles, macros, .bib, .csv): no backtracking regexes, caps on sizes, caches for repeated work.
- Folded ribbon groups and new tabs must pass tabs.py's monotonic width sweep (see docs/handoff/B0-REPORT.md "After B5 merged").


## Phones (the owner asked for it explicitly)
Everything you build must work on a phone, not just fit: test at 390×844 and 360×740 with touch (Playwright `has_touch=True`, `is_mobile=True`, tap instead of click, no hover, no right click: every right click menu item must also be reachable by long press or by a visible button; every key shortcut's command must have a tappable control). Dialogs fit the screen and scroll; menus open above the on-screen keyboard; hit targets at least 44×44 px under `pointer: coarse`; no horizontal page scroll; the selection handles and the caret keep working after your commands. Add these phone cases to your own test file, and screenshots at 390 px light and dark.

## C and C++ where they fit (the owner asked for it, twice: "run mostly on C/C++")
Where a feature needs real computation (spelling and suggestions, hyphenation, text shaping, image decoding or resampling, large data parsing), use an established C or C++ library compiled to WebAssembly the way Rikuy already builds its programs: a recipe in tex/build_tools.sh (Ubuntu's Emscripten 3.1.6; `apt-get install -y emscripten` if emcc is missing), sources pinned by hash in tex/fetch_inputs.sh, output committed in tex/vendor/ and verified byte for byte by vendor.yml, lines in SOURCES.md and NOTICE, entered through the existing native layer conventions (tex/native/, galley_main). Do not rewrite in JS what a mature C/C++ library does better; do not move plain UI logic to C. If the toolchain cannot be installed here, say so in your report and ship the JS path behind the same interface so the WASM build can replace it.

## How
- Your worktree and branch are given in your brief (made from main after B0 merged, or from branch ribbon-tabs for the first wave). Work and commit only there. Do NOT push, open PRs, or touch other worktrees. Other agents work in parallel in sibling worktrees on other batches.
- The machine has 2 cores shared with other agents: run your own new tests while developing; run the full set AGENTS.md asks for at the end; no heavy loops; if a timing test flakes once under load, rerun it before calling it a failure.
- Every command: a registry entry with Word's name (unless Rikuy has one), placed in Word's tab and group (GAP §2), tooltip with keys, synonyms for Search, right click entry where Word has one, keys from GAP §2's table (only those your batch owns; AltGr guard and browser clashes as listed). Disabled with whyNot where it cannot apply.
- Every edit: the smallest source change; packages through preamble.js only (once, options merged); undo gives the source back byte for byte; the page shows the result immediately (model.js/render.js) the same as TeX will print it; hand written equivalents (GAP lists them) are recognised, shown pressed, and come off exactly. Word export and import (wordast.js / wordsync.js) carry the construct both ways where Word has it.
- Tests: a test/<area>.py using roundtrip() (a table of cases: apply, undo, state, hand written forms, off), unit tests in test/<area>.test.mjs for pure source logic, Word round trip cases in word.test.mjs where relevant, and, if the TeX build can check it, a compile check (see how ribbon.py compiles in the page with dist/tex). Add new test files to package.json / ci.yml (no TeX) or tex.yml (needs dist/tex) as AGENTS.md says, and name them in AGENTS.md's Commands table.
- Visuals: screenshots of your tab and dialogs at 1920, 1366 and 390 px, light and dark, in /tmp/<batch>-shots/; look at them and fix anything off. It must look as clean as Word.
- Agents: llms.txt is written from the registry; add a line to llms-full.txt (llmsFull in build/app.mjs) for anything an agent needs to know (key changes above all). test/agent.py must stay green with its count only growing.
- Security: anything reading a stranger's document text (a preamble, a macro, a .bib) stays bounded: no backtracking regexes on unbounded input; run the security audit skill's quick profile on your changed files per AGENTS.md (output in ~/security-audit-skill/rikuy/<batch>/, never in git); fix confirmed findings with tests.
- Checks before you finish: npm test, npm run test:browser, npm run test:agent, test/tabs.py, test/ribbon.py, your new suites, test:corpus (the model run, 2 min) if model.js or parser.js changed, word.py if Word mapping changed, offline.py and launch.py if build/app.mjs changed, deploy_check and pages_check. All green, counts only growing.
- Docs: PLAN.md gets your task entry (number in your brief) with evidence and what is left; docs/ARCHITECTURE.md where your module fits; README "What works" one line, no new numbers that disagree with PLAN.md.
- Commits: one per finished task (a batch may be 1 to 3 commits), message says what changed and the evidence; end every message with exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011PpCfkd1KHBb2oNJ9yUUQ4

## Report back
Commit hashes; each GAP row id: done / changed (how) / not done (why); key changes; test results with counts; screenshots' paths; anything a reviewer should attack first. Tight.
