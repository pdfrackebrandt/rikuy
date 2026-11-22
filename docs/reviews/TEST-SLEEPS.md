# PR 109 (tests without fixed sleeps): hostile review

Three fresh reviewers, one per part of the diff, each with the owner's rules (no retries, no wider limits, no skipped tests, never check less). Their reports follow, then what was done.

## Review of PR 109, part A

Files: test/browser.py, AGENTS.md, test/para.py, font.py, power.py, mathfield.py, eqextras.py, review.py, consistency.py, ribbon.py, shortcuts.py, view.py, find.py, outline.py.

Repro scripts: /tmp/A-tools/{hidden,ctrls,race,starve}.py. Each imports wt-all's test/browser.py and runs on /home/claude/wt-sleeps/dist (wt-all has no dist or node_modules, so ROUTES points at wt-sleeps). Each runs once with the PR's wait (`new`) and once with the old fixed wait (`old`).

## Blockers

1. **test/browser.py:1594-1598, `vis()`: `settle(t, 300); kept(t)` replaced the fixed 300 ms.** Rules 3 and 4: the time is under test.
   - `kept()` polls for up to 5 s until `!unsaved` and IndexedDB holds the tab's copy. The ordinary 700 ms `persistSoon` satisfies that, so the wait now passes whether or not the hidden handler (`away()` → `leaving()` → `saveSoon.flush()`, src/app.js:1553-1583) saves anything.
   - The old 300 ms was shorter than 700 ms. These three checks therefore proved the save on hidden: 'a tab brings in what another tab typed when it is shown' (:1604), 'and back again, keeping its own' (:1608) and 'a keystroke just before the page is hidden and killed is kept' (:1629).
   - Repro hidden.py makes `leaving()` a no-op. With `new` the check gives True (passes). With `old` it gives False (fails).
   - Fix: for the hidden state, keep the fixed 300 ms with a comment, or use `stored(t)` (only the writes already started). Do not wait for `unsaved` to clear.

2. **test/shortcuts.py:338-339: 'Ctrl+S / Shift+F12 downloads nothing'.** Rule 1, a negative condition: the old `wait_for_timeout(1200)` is now `settle(page, 1200)`, which waits for timers due within 80 ms.
   - `saveHere` awaits `hasGitRepo()` before it toasts. Any download that starts after an await (or after a timer later than 80 ms) is no longer seen.
   - Repro ctrls.py adds a download 150 ms after Ctrl+S. `new` reports nothing downloaded (passes). `old` sees the download (fails).
   - Fix: a fixed 1200 ms with a comment (nothing may happen within 1.2 s), or `settle(page, 1200, full=True)`.

3. **test/power.py:353: the race 'the box filled as the field takes the focus writes what was filled'.** Rule 4.
   - `until(text written)` is met by the first push, at 140 ms. `settle(page, 600)` without `full` then waits only for timers due within 80 ms, so a revert pushed later (the field's late focus, the bug this case guards) lands after the check. The old fixed 600 ms covered it.
   - Repro race.py adds a revert 300 ms after the fill. `new` gives True (passes). `old` gives False (fails).
   - Fix: `settle(page, 600, full=True)`.

4. **Every suite: the page's debounced work rarely runs any more, so the 'no page errors' and 'no console errors' checks cover less code.** Rule 1, check less.
   - `settle()` without `full` moves on after 80 ms, and the next step re-arms each debounce. Counts per part, `new` then `old` (starve.py):

     | part | refreshNav | scriptNotice | paintComments |
     |---|---|---|---|
     | select_all | 0 vs 3 | – | 4 vs 16 |
     | hidden_deletes | 0 vs 4 | 0 vs 4 | – |
     | formula_mistakes | 3 vs 14 | 0 vs 10 | 7 vs 27 |

   - Code that never runs cannot throw. The same goes for the last step before each errors check:
     - eqextras.py:84-87: undo's `commentsSoon` (200 ms) never runs before 'no page errors'.
     - browser.py:1578-1582: the 150 ms refit after the resize never runs before 'no console errors (mobile)'.
   - Fix: before every errors check, `settle(page, 600, full=True, after=('problemsSoon','scriptsSoon','commentsSoon','marksSoon','syncSoon'))`. Losing the runs on intermediate states is a trade-off for the owner to decide.

5. **test/browser.py:380-381 (`_SETTLE`) and `stored()`: without `window.__rkT`, `busy()` is always false.** Rule 6: `settle(page, ms, full=True)` silently becomes a one-frame wait, and `stored()` returns at once.
   - Live outside part A in graphs.py:470: `pg.goto('file://'+out); settle(pg, 2500)` runs in a `browser.new_context()` that has no TIMERS. It comes before 'the policy refuses nothing' and 'no script of the document ran' (EVIL_WIDGET), and those checks lost most of their 2.5 s window.
   - Fix: raise when `ms` is set and `__rkT` is absent.

## Nits

6. **browser.py:95: TIMERS drops a handler that is not a function.** A string `setTimeout` never reaches Chromium, so the CSP refusal and its console error never happen. A 'no console errors' check would pass. This contradicts "transparent to the page". No string timers exist in src/ today. Fix: pass `fn` through unchanged when it is not a function.

7. **browser.py:371 and :488: `landed()` and `until()` catch every exception.** A predicate that throws (TypeError) returns at once with no wait, and the next check runs early. Catch only `TimeoutError`.

8. **browser.py:1289, browser.py:1539, ribbon.py:428: waits of 2100 and 2200 ms became `settle()`, about 80 ms.** Those waits outran the history's 2 s merge window (src/app.js:1300). The fast run now tests a different case (the typing step still open). I found no path where this turns a failure into a pass. Either keep a fixed wait with a comment, or call `rikuy.closeGroup()`.

9. **para.py:515-517: `open_phone` now adds MOTION_OFF.** Phone runs had motion on before. This changes the environment beyond the sleeps.

10. **view.py:95: `until(..., 1500)` followed by `settle(1500, full=True)`.** viewPlaceInPdf's 100 ms poll keeps settle busy, so a failed until waits up to 1.5 s more. The SyncTeX check's window grew from 1.5 s to 3 s (rule 3). The same pattern appears at :287, :291, :318 and :324.

11. **browser.py:67: `_TIMED` masks the whole detail of any check whose name merely mentions ms.** Examples are insert.py:229 and :615. For those checks the verify run compared only the pass or fail result.

## Checked with nothing found

- `check(` counts per file are equal before and after, except font.py, which has one new check.
- Changed `check(` lines change only the detail string.
- No new try/except outside the helpers, and no new skips or early returns.
- The remaining fixed waits are `DOUBLE_TAP` (time under test) and the shadow wait.
- review.py's local `stored()`/`adopted()` and the `saved()` hook (`noteSaveState(kept)` runs after `Promise.all(jobs)`) are sound.

## Hostile review of PR 109, part B

Files: test/wordmath.py, agent.py, dogfood.py, refs.py, lists.py, table.py, page.py, docgaps.py, eqtab.py, graphs.py, insert.py (diff origin/main...sleeps-all).

## Findings

1. **test/agent.py:550-551 with :634 and :665. Blocker. Rule: never check less (item 4).**
   Old: `look()` ran `page.wait_for_timeout(wait)` (900 ms for 'the PDF preview'), then audited Chromium's accessibility tree for unnamed controls. New: `settle(page, wait)` without `full`. That waits only for the page's timers due within 80 ms. The PDF pane's outcome comes from a worker, not a timer, so the audit now runs before that outcome is drawn.
   Evidence: I ran a probe on the branch's tests (copied to /tmp/probeB/root, using wt-g10's dist with the same src). It took the accessibility snapshot after the new settle and again after the old 900 ms. The interactive controls went from 110 to 112. 'Print the preview' and 'Try again' were new in the second snapshot, so the final check at :665 ("no interactive element is without a name, in any of 25 states") no longer audits them. The other 24 looks matched. SUITE_VERIFY cannot see this, because both runs find zero unnamed controls.
   Fix: take this look after the wait at :639 (`!rikuy.compiling && #pdf-live` text), or wait on the pane's final status first.

2. **test/docgaps.py:717 with :733, :736, :737, :757. Nit. Rule 5.**
   One comment says every wait in `split_long` is measured. Some are not:
   - the 1200 ms after resizing to 900 px comes before a width equality check (it could be `until` widths within 2 px, timeout 1200);
   - the 600 ms after resizing back;
   - the two 300 ms waits after toggling Split off have no check after them.

3. **test/refs.py:428-432. Nit. A change of setup, no condition loosened.**
   `open_phone` now adds MOTION_OFF, so the phone dialogs are measured with animations off where before they were measured with them on. This matches `open_page()`'s default.

4. **test/refs.py:466, test/lists.py:518, test/table.py:679. Nit. Possible flaky failure, not a false pass.**
   These files have their own `finger()` and `tap_click()` instead of browser.py's `tap()`. They use DOUBLE_TAP 0.45 s, which is the top of the 350 to 450 ms double-tap window that browser.py gives (browser.py itself uses 500).

## Checked and found sound

- check() counts are the same in all 11 files, and no condition changed (only detail strings). No retries, no new try/except, no early returns.
- The kept and newly added fixed waits are timing logic or windows under test, each with a comment:
  - ARM 500 ms and the H1 windows (agent.py);
  - the long press and the short tap (eqtab.py);
  - the dialog history's 1 s and the drag-speed rests (graphs.py);
  - the hostile frame's `800*rate` (insert.py);
  - the frame's 300 ms focus window: press_slider in graphs.py and the new wait in graph_hint_menu in insert.py.
- dogfood.py's t0 == t1 check is sound: the readonly read is ordered after a readwrite already created.
- agent.py's setSource with a dialog open: closePop writes the pending push, and the push's `this.pop` guard makes a late timer do nothing.
- The CLOSED, `landed`, `running` and FACES waits are each satisfied only by the step's own effect.

## Review of PR 109, part C

Files: objects, picture, history, frontier, paste, features, widgets, share, spell, file, files, git, word, ux, styles and tabs (.py).

## What I checked and found clean

- Every `check(` in old and new was paired by its text. The counts match in all 16 files. 21 calls differ. 16 of those change only the detail. Two change the condition: objects.py:720 and picture.py:919, covered below. The other three are fine:
  - history.py:147 adds `|| 0`. A missing highlight used to crash on `None >= 1`; now it is a FAIL, which is stricter.
  - ux.py:403 (`said`) and tabs.py:875 (`away`) hold the same condition, moved into a variable.
- No try/except was added, no part returns early, and no retry loop was added. No timeout on an existing wait grew. objects.py's two 30 s reload waits are now `ready()`, which also has 30 s.
- spell.py's local `settle` was renamed `spell_settle`. All 24 old call sites were mapped, and none fell through to browser.settle.
- Sleeps kept: widgets.py:401, 411, 492, ux.py:395 (the sampling loop) and tabs.py:839. Each has a comment and the time really is under test.
- The new `until` conditions are not already true when they start: git (DRAWN, REPO, COMMITTED, ON_BRANCH, RAN), share (`__links`), paste, files (SAID) and ux. ON_BRANCH holds because the select's change handler resets the value to the current branch.

## The weak point all the findings share

Without `full`, `settle(page, ms)` waits only for timers due within 80 ms. SUITE_VERIFY cannot catch the cost of this for negative checks, "stays" checks or timing windows. Their effect comes on a timer between 80 ms and `ms`, so in the fast run they pass whatever the page later does.

## Findings

1. **spell.py:317-318, rule 4, BLOCKER.**
   - Old: `type(' recieve'); wait 700`. New: `settle(page, 700)`.
   - Spelling runs 250 ms after the edit (spellSoon). I reproduced it: after the new settle, `sp.planModel !== model`, so BAD still lists the previous run's words. After a real 700 ms the plan is current.
   - "the word being typed is not marked yet" is therefore vacuous.
   - Fix: `spell_settle(page)` or `full=True`.

2. **word.py:406-408, rule 1 (the timing window got shorter), BLOCKER.**
   - Old: Reject All, then 500 ms of rAF gap measured. New: `settle(page, 500)`.
   - I reproduced it: at the moment `g_all` is read, marksSoon and commentsSoon are still pending. So "hold the page under half a second" no longer covers the repaints.
   - Fix: `after=REPAINTS`, as `open_file` already does.

3. **ux.py:972-975, rule 4, BLOCKER.**
   - "nothing wider than the window" runs after a non-full `settle(600)`.
   - In my shadow run, #desk and #main were laid out again after that wait, with timers due at 98 and 295 ms. The overflow it checks for would come after the check.
   - Fix: `full=True`.

4. **objects.py:720 (N1, N3) and picture.py:919 (R3), rule 1 (the condition is looser), nit.**
   - Comparing with spaces ignored is enough for what these checks claim: the compile succeeded and the caption or words are in the PDF. Every non-space character must still appear, in order.
   - What it loses is word boundaries. A dropped or added space would pass, for example "Figure1:Box".
   - It also applies to pdfLaTeX and LuaLaTeX, which passed exactly before.
   - Better: ignore spaces for XeLaTeX only, or match `\s*` between letters and `\s+` at the spaces in `want`.
   - It is a condition change in a PR that promises none. It fixes a failure that was already red on main, so the PR description should say so, or it should be its own commit.

5. **tabs.py:998-1001, rule 4, nit.**
   - "the caret's moves measure nothing": the old window was about 500 ms; now it is under 80 ms after the last key.
   - At the check I measured one timer still pending, at about 109 ms. The ribbon refresh (60 ms) is covered.

6. **ux.py:686, rule 4, nit.** A resize is followed by a non-full `settle(600)`. AGENTS.md itself says a resize needs `full=True`. In the shadow run, timers at 93 and 148 ms were pending.

7. **features.py:85, nit.**
   - `settle(900)` before the reload no longer waits for the save, which persist runs 700 ms after the edit.
   - The reload now depends on the pagehide save instead. AGENTS.md says to use `saved()` before a reload that must find an edit.

8. **frontier.py:59, nit.** The comment says closing the panel lays the pages out again, but the settle there is not `full`.

9. **tabs.py:875, nit.** The network check's window got shorter. In my shadow run, which was running beside a second suite, it FAILED: MathLive's deferred load (ensureMathLive, 2.5 s) fell inside the window. The check is flaky and depends on timing.

10. **spell.py:326 and 346, nit.** The measured `wall` no longer includes the old fixed 350 + 120 ms of waiting, so "under 3 s" now allows about 0.4 s more real work.

11. **For whoever reviews browser.py.** `open_page`'s `fonts_settled` leaves a relayout pending, due at about 236 ms. tablet() at tabs.py:958-963 measures straight after `open_page`; the old `open_page` slept 300 ms.

## Resolution

- The common cause (A4, B1, C1 to C3, C5, C6, C8, A3): `settle(page, ms)` waited only for timers due within 80 ms unless `full`. It now waits for every timer due within ms, as the old fixed wait let happen, `full` or not; debounced work (refreshNav, scriptNotice, paintComments) runs within the old windows again, so the error checks cover what they did.
- Times under test kept as fixed waits: browser.py's tab hidden save (300 ms, then `stored()`), shortcuts.py's Ctrl+S and Shift+F12 that download nothing (1200 ms).
- spell.py: the word being typed waits for the spell check itself; the 141 KB paper limits are 2530 ms, the old 3 s less the 470 ms the old waits slept.
- word.py: Reject's timings wait for the repaints (`after=REPAINTS`).
- agent.py: the PDF preview is audited again once TeX has finished (26 and 27 states).
- features.py: `saved()` before the reload.
- browser.py: `open_page` waits the old 300 ms of timers after the fonts; `settle` without the TIMERS hook waits ms fixed; `stored` without it raises; string timer handlers go to the browser untracked (CSP refuses them as before).
- objects.py N1, N3 and picture.py R3: spaces ignored for XeLaTeX only, as pypdf 5.9.0 reads its kerned pairs.
- refs.py and lists.py's own taps keep 500 ms apart, as tap() does; docgaps.py's comment says which waits are measured.
- Not changed: tabs.py's Frontier network check (its condition is the old one; MathLive's deferred load can fall in any window, a follow up); `until()` catching every exception (a false condition fails the next check); motion off on phones (measures the end state, not a frame of an animation).
