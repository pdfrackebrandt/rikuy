# Hostile review: ribbon-tabs-word (PR 78, fa49608 on 395faad)

Verdict: **fix first.** One high finding (touch screens 900 px and wider get overlapping, clipped
controls) and the fit order puts groups at the wrong sizes. The 1366 px Review case the
coordinator saw is a symptom of that fit-order problem, not a lack of room. The rest is polish.

Scripts and evidence are in `/tmp/review-tabs-out/`. `geo.py` checks geometry per tab and width.
`kt.py` covers KeyTips, `a11y.py` accessibility, `tablet.py` and `phone.py` touch, `ctx.py`
contextual tabs, `m1.py` the 1366 alternatives, `speed.py` timing. Screenshots: `shots/`, plus the
stacked views `s1366a.png`, `s1366b.png`, `s1920.png`, `sreview.png`, `stablet.png`, `sdark.png`,
`ztoc.png` and `forced-show.png`. The baseline was the main build in `wt-bbl2/dist` (same `src/` as
395faad). It was rebuilt away partway through the review, so the last check (L9) could not be
compared against main.

## High

**H1. On touch screens 900 px and wider, controls overlap and are cut off.** This covers iPads in
landscape (1024 to 1366 px), Android tablets and other touch screens with `pointer: coarse`. The
new grid has 22 px rows (`src/app.css` 269-375, `wideLay()` at `src/ribbon/tabs.js:86`), but
existing `@media (pointer: coarse)` rules still require 44 px targets. Examples are
`#rp-review .btn` (`app.css:2191`), `#rp-equation .btn` (`1771`), Picture Format (`2141`),
thesaurus, mark-citation and tab-next. As a result:
- Buttons overlap by up to 94×20 px. At 1180 px, Spelling overlaps Thesaurus and Read Mode
  overlaps Print Layout. On Table Layout, the nine alignment buttons overlap 44×20 px each.
- Their tops are cut 7 px above the fixed 92 px row.
- Most names are gone.

Main kept one row of 44 px targets at these widths. Reproduce with `python3 tablet.py`
(`open_page(touch=True)` at 1024, 1180 and 1366) and see `stablet.png` (branch above main).

Fix: gate the grid on `(min-width: 900px) and (pointer: fine)`, both in the CSS block and in
`wideLay()`, so tablets keep main's row. Add a tablet case to `tabs.py`.

## Medium

**M1. The fit picks the wrong groups to shrink, which is why Accept and Reject lose their names at
1366.** The back pass (`tabs.js:390`) undoes the `small` and `bare` steps (`tabs.js:375-379`) one at
a time, last first, with no regard for rank. Groups of higher rank therefore stay bare while groups
of lower rank get their names back. The result also flips as the window widens.

At 1366 px, Review's Changes (rank 4) shows bare icons while Versions (rank 3) keeps "Save Version"
and "Version History". Other configurations fit at 1366 and keep Accept and Reject named
(`m1.py`):
- Changes small with Tracking bare: 1366/1366.
- Changes small with Download as one button: 1366/1366.
- Changes small with Versions bare would have been the rank-correct choice, but it is 2 px over.

More examples:
- Review's Changes is named at 1100, bare at 1200 and named again at 1280.
- Insert's Header & Footer (rank 2) keeps its names while Links (4) and Illustrations (5) are bare
  from 1000 to 1200.
- A wider window shows fewer names: Review 950→960 goes from 11 to 4, Insert 1150→1160 from 14 to
  11, Layout 1100→1110 from 14 to 9, and References 980→990 also drops (`geo.py` output,
  `sreview.png`).

Fix:
- Make the `small` steps one chain and the `bare` steps another, so a step is undone only once
  every later step of its chain is undone. This needs a flag per chain; today's single `chain`
  flag is shared with the tiles and `rb-fold`.
- Add sweep checks: visible names are never fewer at a wider width, and no group of lower rank is
  ever in a larger state than one of higher rank.
- Consider bringing `rb-dl1` (Download as one button) forward, before groups of rank 4 and above
  lose their names. The three named downloads take about 230 px on every tab, which Word does not
  spend.

**M2. Previous and Next get split across columns when large buttons turn small.** In the `sm`
state, `columns()` (`tabs.js:60`) and the CSS pack everything three to a column, so Word's pairs
break. In Review's Comments and Changes, "Previous" ends one column and "Next" starts the next
(`s1366a.png`, `sreview.png` at 1100). Fix: keep each run of small items whole, starting a new
column before a run that would not fit, both in `columns()` and in the `:is(.sm,.nm)` grid.

**M3. The contextual tabs have no KeyTips, so their controls' letters can never be reached.**
`KEYTIPS` (`src/ribbon/order.js:34`) has no entry for table-design, table-layout, picture-format,
equation or headfoot. The letters `layout.js` gives their controls are therefore dead. With the
caret in a table, Alt shows no letter on Table Design or Table Layout, and with Table Layout open,
Alt shows 0 command letters (`kt.py`). PLAN.md's "KeyTips for every control of every tab" is not
true. Fix: Word's JT, JL, JP, JE and JH, with a J wait like Help's Y, plus a test.

**M4. Unlabelled icons that repeat commands already shown elsewhere.**
- Insert › Tables (`layout.js:22`): three bare icons beside Table at every width (Insert Table,
  Convert Text to Table, Table from Data File). Table's own menu already offers them
  (`src/cmd/table.js:102`), and Word shows Table alone.
- References › Footnotes: `footnote-options I` (`layout.js:43`) repeats the new corner arrow, which
  runs the same command.
- Picture Format › Size: `picture-size I` (`layout.js:91`) repeats its corner arrow.
- Layout › Page Setup: `page-setup S` (`layout.js:35`) shows a small "Page setup" button inside the
  "Page Setup" group, next to its corner arrow.

Fix: keep them off the row (menu and corner arrow only; `controls.json` would then name the menu
path), or make them small with names. Verdict on the coordinator's first observation: it is unlike
Word, yes.

## Low

- **L1. Large split buttons sit higher than their neighbours.** Their icons are 2 px higher and
  their names 4 px higher than the plain large buttons next to them: Table and Equation against
  Picture and Symbol, Table of Contents against Insert Footnote, Spelling against Read Aloud
  (`align.py`). The cause is `app.css:331` (52 px tall, 2 px top padding, 1 px gap). Also, the
  second line "Contents" of Table of Contents runs 4 px into its arrow strip, so clicking the
  bottom of "Contents" opens the menu instead (seen from 930 to 1240 px and at 125 %; `ztoc.png`).
  Fix: Word's way, with the icon alone in the top part and the name plus arrow in the lower part.
- **L2. The visible name is not in the accessible name (WCAG 2.5.3).** "Insert Footnote" is shown
  on a button named "Footnote", and "Insert Citation" on one named "Citation" (`layout.js:43-44`).
  Speech users saying the words they see will miss. "Markup" for Display for Review and "Base size"
  were already like this.
- **L3. Some names did change, despite "No command, name or role changed".** Group names are now
  Title Case, and a folded group is a button named after its group (llms.txt). So "Page setup" became
  "Page Setup", and likewise Rows & Columns, Cell Size, Table Style Options, Citations &
  Bibliography and Document Setup. View's "Page" group is gone. `controls.json` groupName changed
  for all of these. State it in the commit and in llms.txt. Also, "Table of contents" in small
  letters next to Title Case group names reads like a typo.
- **L4. KeyTips do not stop the keys they consume.** Escape and letters only get
  `preventDefault()` (`tabs.js:608`, `613`), so `app.js:1289`'s Escape handler still runs
  `disarm()` on an armed picture. Use `stopImmediatePropagation()`. This is from reading the code,
  not from a run.
- **L5. On a Mac, a lone Option tap now leads to commands.** The tap already showed KeyTips before
  this branch, but a following letter now runs a command: Option, H, E is Clear Formatting. Word
  for Mac has no KeyTips. Suggest F10 only on a Mac.
- **L6. Arrow keys move in a line, not across the grid.** In the three-row grids, ArrowRight moves
  down a column, and ArrowDown on a non-menu button does nothing (Ruler keeps the focus). Word
  moves spatially. Focus is visible everywhere (`focus-both.png`).
- **L7. The page still jumps between 861 and 899 px.** Home is 68 px tall there and the other tabs
  49 px, because the 92 px rule (`app.css:301`) starts at 900.
- **L8. Pressed large toggles are invisible in forced colors.** Print Layout pressed looks like the
  rest, since `app.css` has no forced-colors rules (an older pattern). The new check boxes do show
  their tick (`forced-show.png`).
- **L9. Home also shows fewer names at a wider width.** At 1270 px Home shows its names, 4 tiles
  and one Download button. At 1280 px the names are gone (`rb-fold`), with 3 tiles and three
  downloads. This is the same back pass as M1. Home's steps are unchanged by this branch, so it is
  probably older, but I could not compare against main once the baseline was gone.

## What held up

- Geometry from 900 to 1920 px in 10 px steps and from 390 to 898 px in 4 px steps, on all 13 tabs:
  - No overlapping controls, no control cut by the ribbon, no control outside its group, no group
    name cut or covering a control.
  - The row fits from 521 px.
  - A wider window never shows fewer controls. The only exceptions are the phone boundary at
    518→522 and Home's gallery paging arrows, both of which the test excludes on purpose.
- Zoom at 125 % (1093, 1229 and 1536 px) and 150 % (906 to 918 and 1280 px), with a device scale
  of 1.25 and 1.5: the same results, except Table of Contents' "Contents" (L1).
- Tab height is 93 px everywhere from 900 (92 px plus the border). Table tabs and the equation field
  coming and going on Home, Review and View, from 900 to 1920 px, never change the ribbon's height
  or the page's top. The tab row does not overflow at 900 px with both table tabs showing.
- At 1366 px with the navigation pane open, the ribbon keeps its full width.
- KeyTips on the 8 ordinary tabs at 1920, 1366, 1100, 1000 and 900 px: no duplicates, no prefix
  conflicts, no overlapping badges, none off screen. Escape steps back a level at a time. Letters
  that match nothing never reach the source. AltGr is unaffected ('AltGraph').
- Every laid-out group has role=group and a name. Toggles keep aria-pressed (the check boxes are
  still toggle buttons). The focus ring shows on large buttons, small ones and check boxes.
- Phones at 390 and 360 px with touch: the same as main in height, controls and target sizes
  (Insert and Layout's undersized targets were already there). No grid, two-line names or arrows
  leak below 900 px.
- Dark mode is readable (`sdark.png`). In forced colors the check box tick shows.
- Speed: switching tabs on page.py's long document takes 11 to 39 ms (main: 8 to 17 ms), and
  ribbonFit takes 1 to 15 ms. Resize already runs once per animation frame, so there is no thrash
  worth fixing. `page.py long_document`: the branch measured 32 and 43 ms, main 39 ms, against a
  40 ms limit, on a busy machine. The branch does not touch any command's when or on, so this is
  machine noise.

## Verification of 22cbe35

Verdict: **merge.** Every finding is fixed. I reran every repro on a fresh `npm run build` of
22cbe35 and found no regressions. `npm test` passes (rc 0) and `npm run test:tabs` gives 137
passed, 0 failed.

- **H1 (touch screens):** `tablet.py` at 1024, 1180 and 1366 px with touch now finds no overlaps
  and no cut controls on Home, Insert, Review, View or Table Layout. Their heights and 44 px
  targets match main's. Home's old Copy over Format Painter overlap is gone too.
- **M1 (shrinking order):**
  - At 1366 Review folds Download into one button. Accept, Reject, Previous and Next keep their
    names, and Versions (rank 3) is the group that goes bare (`v1366.png`).
  - `geo.py` from 900 to 1920 px in 10 px steps finds no width where a wider window shows fewer
    names on any tab.
  - On Home, the control count still dips at 1270→1280 and 1470→1480. That comes from the
    gallery's paging arrows and tile chain, which the branch did not touch.
- **M2 (Previous and Next split):** Previous and Next now sit in a column of their own in both
  Comments and Changes.
- **M3 (contextual KeyTips):** Table Design shows JT and Table Layout JL, with 15 and 31 control
  letters. There are no duplicates, prefix conflicts or overlapping badges at 1920, 1366 or
  1000 px, and the same holds on Insert, Review, References, View and Layout. Alt, J, L, A inserts
  a row (`kt2.py`).
- **M4 (repeated icons):** Table now stands alone, and the dialogs are corner arrows that keep the
  same ids (`rc-page-setup`, `rc-footnote-options`, `rc-picture-size`). The corner arrows never
  cover the group names' text at 1920, 1366 or 1000 px (`corner.py`). My sweep's "on label" hits
  are this new arrow class, not real overlaps.
- **L1 (split buttons):** large split buttons are now Word's: a 30 px icon part, then a 36 px part
  holding the name and the arrow. Icons line up at 9 px and names with the plain buttons'. "Table
  of Contents" lies wholly in its menu part.
- **L2 (label in name):** no laid-out button shows a name missing from its accessible name. The
  buttons now read "Footnote" and "Citation".
- **L4 and L5 (keys):** Escape out of KeyTips leaves a selected picture selected. On a Mac (the
  platform set to MacIntel), Option alone shows nothing and F10 shows the letters.
- **L7 (861 to 899 px):** every tab is now 68 px tall there (`geo.py` from 390 to 898 px), with no
  overlaps or clipping below 900.
- **L8 (forced colors):** pressed Print Layout now gets a Highlight background; Web Layout stays
  transparent.
- **Zoom:** at 125 % (1093 px) and 150 % (911 px) the only hits are the corner-arrow false
  positives above.
- **Phones at 390 and 360 px:** the same as main, except Insert has 3 fewer controls. Those are
  the table commands, which are now only in Table's own menu.
- **Speed:** switching tabs takes 10 to 25 ms on the long document, and `ribbonFit` at most 9 ms.

Left over, low:
- On touch screens 900 px and wider, the group names "Immersive" and "Page Movement" in View's
  single-button groups are cut short, as Comments, Accessibility and Language already were on main.
- Insert's Pages group (rank 1) shows bare icons at 1366, which the rank order allows.
