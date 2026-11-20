# Hostile review of PR 83, `word-gaps-objects` at ce5fd26

**Verdict: request changes.** Six High findings: two break compiles, two corrupt or silently degrade pictures, one defeats Compress Pictures' main promise, and every new tab misses the 44 px phone rule. The tests miss all six because they use Rikuy's own one-line forms, one picture per line, file names without spaces, uncropped and unturned pictures, and a tap on a single phone button.

Repro scripts and outputs are in `/tmp/review-g1-out/`. `probe.py <section>` drives the page in Chromium on dist/ with dist/tex, `phone.py` sweeps target sizes, and `t1.mjs` to `t7.mjs` are node scripts on the pure modules and the wasm. The PDFs and PNGs cited below are there too.

## High

**H1. A comment on a chart's last axis option makes any Chart Design or Format control break the compile.**
Files: `src/objfmt.js:41-50` (`listSet`) and `:272-300` (`axisRange`, `chartSet`).
- `readAxis` strips comments before reading, so the chart is still selectable.
- `chartSet` then re-joins the raw entries, so the new key and the closing `]` land inside the comment.
- Repro (`probe.py chart_comment`): `...legend pos=north west % top left\n]`, then Chart Title "Q1", gives `legend pos=north west % top left, title={Q1}]`.
- pdfLaTeX then reports: `Paragraph ended before \pgfplots@@environment@axis was complete`, `\begin{tikzpicture} ended by \end{document}`.
- Fix: never re-join the list. Insert `, key` right after the last entry's own characters (before trailing spaces and any `%`). Delete an entry together with one separator. Test it with a trailing comment and with one key per line.

**H2. Position on an object already in a float writes a float inside the float.**
Files: `src/objfmt.js:445` (`blockOf` takes the innermost `center`) and `:500-540`.
- Take the classic hand-written form `\begin{figure}[htbp]\begin{center}<tikz>\end{center}\caption{Box}\end{figure}`.
- The Position menu checks "In Line with Text".
- Top of Page gives `\begin{figure}[htbp]\n\begin{figure}[t]…`, and TeX stops with `Not in outer par mode` (`probe.py nested_figure`).
- Wrap writes a wrapfigure inside the figure in the same way.
- Fix: when an enclosing figure or table exists, treat it as the block (mode float) and the `center` as its alignment. Refuse float and wrap inside minipage, `\parbox`, table cells and footnotes with a plain message.

**H3. Reset Picture replaces an untouched picture with its neighbour on the same line.**
Files: `src/picfx.js:88-102` (`lineOf`) and `src/cmd/picture.js:42-48`.
- Start from `\includegraphics{a.png}\hfill\includegraphics{b.png}` and apply Grayscale to b.
- The note sits at the end of the line, so selecting a reads b's state (`orig: b.png, recolor gray`).
- Reset Picture on a then writes `\includegraphics{b.png}\hfill\includegraphics{b-edited-…png}`. Picture a is gone and b's note is dropped (`probe.py pic_twoline`).
- `lineOf` computes `other` but nothing uses it.
- Fix: a note belongs to the last `\includegraphics` on its line. Ignore it for any picture that has another `\includegraphics` after it on that line. For such a picture, either refuse with a message or put the note on a line of its own.

**H4. File names with a space or a comma break the note.**
File: `src/picfx.js:62-63`. `readNote`'s pattern `[^,\s%{}\\]` refuses the very names it writes.
- Repro with `my photo.png` (`probe.py pic_space`), Brightness and then Grayscale:
  - The second step starts from the edited copy and wears it down, giving `my photo-edited-f996d03c-edited-914787a1.png`.
  - The notes stack: `% rikuy: from my photo.png, brightness 0.2 rikuy: from my photo-edited-f996d03c.png, recolor gray`.
  - Reset Picture does nothing.
- `\includegraphics` accepts spaces since LaTeX 2020, so these names are legitimate.
- Fix: write the name in braces (`from {my photo.png}`), read it back the same way, and add the case to `picfx.test.mjs`.

**H5. Compress Pictures ignores crop and rotation, and degrades the picture far below the chosen ppi.**
File: `src/cmd/picfx.js:155-156`. `widthPx` comes from the drawn box's width.
- Repro (`probe.py compress_size`, `pdfimages -list`), Compress at 150 ppi:

| Picture | Effective ppi before | Effective ppi after |
|---|---|---|
| `angle=90,width=3cm` | 508 | 38 |
| `trim=0 0 600 0,clip,width=4cm` | 127 | 38 |

- The cropped picture was already below 150 ppi and should have been skipped.
- Both pdfLaTeX and XeLaTeX give the same numbers.
- Fix: compute the picture's effective ppi from its pixels over its printed size along the same axis. Account for angle, trim and viewport. Skip when it is at or below the target, and otherwise scale by target ÷ effective.

**H6. On phones, the new tabs' buttons are 32×30 px.**
File: `src/app.css:2139-2143` names only `#rp-picture-format`.
- At 390 and 360 px with touch, every control of Shape Format, Chart Design, Chart Format, SmartArt Design and SmartArt Format measures 32×30 px (`phone.py`).
- In the Selection Pane: Close is 20×20, Show All and Hide All are 26 px tall, and the name field is 32 px tall.
- `objects.py phones` only taps `#rc-shape-fill`, so it never sees the size.
- Fix: add the five `#rp-…` tabs to the rule, and give `.sel-pane .pop-x`, `.fr-btns .btn` and `.sel-lab` 44 px under `pointer: coarse`. Make the phone test sweep every visible control of each tab.

## Medium

**M1. Wrap with Text: the page does not draw what TeX prints.**
File: `src/render.js:1018-1023`. `cssLength('0pt')` returns null, so the page draws `wrapfigure{r}{0pt}` as a centred block with no wrap, while TeX wraps it at the right. This breaks rule R3. Screenshots: `wrap-simple-page.png`, and `we.png` for TeX.
- Before a list, wrapfig logs "Stationary wrapfigure forced to float" on all three engines. The PDF puts the drawing at the bottom left, after all the text (`wl-1.png`), while the page shows it centred before the list (`wrap-list-page.png`).
- Fix: draw `0pt` as the natural width. Refuse a wrap followed by a list or display within the figure's height, or say why.

**M2. Any control rewrites a hand-formatted option list onto one line.**
`listSet` re-joins with `", "`, so a hand-formatted multi-line `\begin{axis}[` or `\draw[` collapses (`t2.mjs`). This breaks rule R1: nothing else may move. The fix is the one in H1.

**M3. A replaced original brings back the old edited file.**
Files: `src/picfx.js:78-82` and `src/cmd/picfx.js:99-103`.
- The new file's name hashes the name and settings, not the bytes, and an existing name is never rewritten.
- Repro (`probe.py pic_stale`): Transparency on a red `a.png`, Reset, replace `a.png` with a green picture of the same name, Transparency again. The page shows the old red picture, and the project would ship it.
- Fix: put a hash of the original's bytes in the name.

**M4. The work runs on the main thread, and the memory is never given back.**
File: `src/picfx.js:18,120-150`.
- On a 12 MP JPEG, under node on this machine:

| Setting | Time | Output |
|---|---|---|
| Brightness | 2.3 s | |
| Sharpen | 2.0 s | |
| Transparency | 5.8 s | a 46 MB PNG |

  The tab freezes for the whole run, with no progress shown (`t5.mjs`).
- One 36 MP picture leaves the module at 379 MB of linear memory for the life of the tab (`t4.mjs`). `pic_done` frees inside the heap, but WebAssembly memory never shrinks and `X` is kept.
- Fix: run the module in a Worker. Drop the instance after any run that grew it past roughly 64 MB, as `tex/tools.js` does for its programs. Show a progress message.

**M5. Every tried setting leaves a full-size file in the project.**
Nothing ever deletes unreferenced `*-edited-*` files. After Compress, the toast says "X saved" while the project, its zip and git all grow, because the originals stay and the new files are added. Word users expect the reverse. Fix: prune unreferenced edited files when saving or downloading, or say plainly that they stay.

**M6. Label rename misses some references and edits verbatim text.**
File: `src/objlist.js:90-117`.
- Missed (`t6.mjs`): the second key of `\crefrange{x}{key}`, `\hyperref[key]{…}` and `\subref{key}`. These print ?? afterwards.
- Edited: `\ref{…}` inside `verbatim`.
- A `\label` inside a comment counts as "taken".
- Fix: use the parser's tree to skip comments and verbatim-like environments, read both arguments of the `*range` commands and hyperref's optional argument, and add subref and fancyref.

**M7. A hidden object's mark moves to another object.**
File: `src/ui/selpane.js:15`. Hidden objects are keyed by kind and index.
- Repro (`probe.py selpane_shift`): hide Drawing 2, delete Drawing 1. The hidden drawing shows again, and an insert before it would hide a different one.
- The hidden state is not kept on reload, in the Word file or in the PDF. Word keeps a hidden shape hidden in the file.
- Fix: key by source position mapped through each edit (`mapPos`) or by `\label`, and say plainly that the hide is the page's view only.

**M8. Typed characters are silently dropped.**
Files: `src/objfmt.js:142,282`, and `smartItemsSet` and `smartTex`.
- Edit Text, Chart Title, Axis Titles and Text Pane drop `& % $ _ # ^ ~ \ { }`.
- Example (`t7.mjs`): "R&D: 50% of $5_000 #1" is written as `R D: 50 of 5 000 1`.
- Fix: escape these characters (`\&`, `\%`, …) and let `readTikz`'s node pattern and `AXIS_KEYS`' title pattern read the escapes.

## Low

- **L1.** `shapeOrder` (`src/objfmt.js:217-237`) moves a command together with its trailing comment. If code follows the last moved command on the same line, it ends up inside that comment. Bring Forward on `\draw…; % A` followed by `\draw…; \node at (0,0) {x};` comments out the node (`t2.mjs`).
- **L2.** On `\includegraphics{a}` (no extension, common in hand-written LaTeX), Corrections, Color and Transparency are disabled with a wrong reason: "TeX places a PDF picture as it is". Compress skips the picture (`src/cmd/picfx.js:17-18,153`).
- **L3.** Wrong error messages:
  - A 20000×2 PNG hits `STBI_MAX_DIMENSIONS` (`pic.c:22`), and a header claiming 100000×100000 is also refused; both are told "no PNG or JPEG", not "too large".
  - The message also names CMYK JPEGs as unreadable, but they decode fine (`t3.mjs`).
- **L4.** EXIF orientation is dropped. A phone photo with Orientation 6 shows upright on the page and turns sideways after any correction. TeX already printed it sideways, so this mismatch predates the branch, but now the user sees it.
- **L5.** Compress lands just under the asked ppi (143 for 150), because it measures the drawn width on screen.
- **L6.** On a phone, the colour grid becomes 73 full-width rows named by their xcolor names ("blue!80").
- **L7.** `SMART_RESET` puts back the package's colours. That overrides a document's own `\smartdiagramset{set color list=…}` in the preamble for every later diagram.
- **L8.** Not this branch: with a picture selected in page.py's long document, when/on together take 121 ms against the 40 ms bound. The cost is B8's `picture-place-*` commands at 6 to 8 ms each. This branch's commands stay under 5 ms each, and a selected drawing takes 14 ms in all.

## What held up

- Hostile pictures neither crash nor trap: CMYK JPEG, 16 bit gray and RGB PNG, palette PNG with transparency, APNG (first frame), and truncated PNG and JPEG.
- The 40 MP guard refuses a 7000×6000 header before decoding.
- `editedName` strips `..` and a leading `/`. A picture in a subfolder gets its new file in the same subfolder.
- `SMART_RESET` matches smartdiagram's own defaults (`smartdiagramlibrarycore.definitions.code.tex:18-27`).
- Exactly Here adds the `float` package in the same step.
- wrapfig at a page end compiles and wraps on all three engines.
- The wasm hash check and the plain "did not load" message are in place.
- Selecting a drawing in the long document keeps when/on at 14 ms.
- The Selection Pane's row and eye buttons are 44 px on phones.
- The author's round trips (one undo, byte for byte) hold for Rikuy's own forms.

## PLAN.md numbering

- Renumber this branch's task 68 to 69. Here, "task 68" appears only in PLAN.md and six GAP.md rows (P4, P5, P9 to P12). PR 84 cites it in `test/docgaps.py`, `AGENTS.md` and 13 places in its src, test and docs, so it is the more expensive one to change.
- Note for the coordinator: origin/main already has two tasks numbered 66 (keyboard shortcuts, and C/C++). Both branches' base, `ribbon-tabs-word` (fa49608), adds another 66 and a 67. Those need renumbering at merge as well.

## Fixes for the review

Each finding with the commit that fixes it and the test that failed before it.

- **H1** (cfdb875): `listSet` edits a list in place: an entry replaced where it stands, one taken off with one separator, a new one after the last entry's own characters (before a space or a comment) with the separator the list already uses. `entries()`, the axis's `]` and a `\draw`'s `]` are read past comments. Test: `objfmt.test.mjs`, a comment after the axis's last key (`title={Q1}` landed inside the comment before).
- **H2** (11769f9, browser check d7e2032): `blockOf` takes the outermost figure, table or wrapfigure as the float and the innermost center or flush as the alignment; Position changes that float and never writes one inside it; in a minipage, a cell, a `\parbox` or a footnote a float or a wrap is refused with a plain reason. Tests: `objfmt.test.mjs` (Top of Page on figure > center > tikzpicture), `objects.py arrange` (the same on the page, compiled with pdfLaTeX, XeLaTeX and LuaLaTeX).
- **H3** (9be2f29): a note belongs to the last `\includegraphics` on its line; a picture with another after it on the line reads no note and the tools refuse it with a plain reason, so Reset no longer takes the neighbour's file. Test: `picfx.test.mjs`.
- **H4** (9be2f29): the first file's name is written in braces, `from {my photo, 2.png}`, and read back so (the unbraced form of the first commits still read). Test: `picfx.test.mjs`.
- **H5** (9be2f29): Compress reads each picture's ppi as printed, from the part trim or viewport keeps over the width graphicx gives it (`graphicBox`, a quarter turn swapping the axes), and scales by target over effective, rounding up; at or below the target, under a free angle or sized by a macro, it is left alone and the toast says which and why. Tests: `picfx.test.mjs` (`compressPlan` on the review's two cases), `objects.py review_pictures`.
- **H6** (06d036a): the touch rule in `app.css` names all five new tabs, Layout's Align and Selection Pane, the size fields, and the Selection Pane's Close, Show All, Hide All and name fields. Test: `objects.py phones` sweeps every visible control of each tab at 390 and 360 px (32 by 30 px before). The ribbon's Download button (`.rb-dl`, 30 px on every tab, Home's too) is the ribbon branch's and is left out of the sweep.
- **M1** (11769f9, browser check d7e2032): `{0pt}` is drawn at the drawing's own width (max-content) at its side, the text wrapped round it; Wrap is refused where a list, a display, a heading or another block comes right after the object. Tests: `objfmt.test.mjs` (wrap before an itemize), `objects.py arrange` (the drawing at the right margin, the next words beside it).
- **M2** (cfdb875): as H1; a list one key a line stays so, a new key put on its own line. Test: `objfmt.test.mjs`.
- **M3** (9be2f29): the edited file's name holds a hash of the first file's bytes, so a replaced original makes a new file. Test: `picfx.test.mjs`.
- **M4** (9be2f29): the pixels are worked on in a worker (`src/picworker.js`); a run that leaves the module above 64 MB lets it go; a run longer than half a second shows "Working on <file>…". Tests: `objects.py review_pictures` (the work done in the worker), `picfx.test.mjs` (the module grown past 16 MB by one run, then let go).
- **M5** (9be2f29): one edited file a picture: the step that writes a new one takes the last out in the same history step (undo brings it back), Reset Picture takes it out; Compress's toast says the PDF carries the new files and the project keeps its first ones. Test: `objects.py review_pictures`.
- **M6** (2a4a40d): labels and references are read on the parser's tree: comments, verbatim, listings and minted skipped, math environments' raw text scanned on its own, both arguments of the `*range` commands, `\hyperref`'s optional one, `\subref`, `\fref` and `\Fref`; a `\label` in a comment no longer counts as taken. Test: `objlist.test.mjs`.
- **M7** (06d036a): hiding is keyed by the object's `\label`, or by its file, kind and a hash of its source with how many before share that text; kept in this browser per project and read again after a reload; the pane says plainly that hiding is the page's view only. Test: `objects.py selpane` (hide Drawing 2, delete Drawing 1, reload).
- **M8** (06d036a, test 3a9472f): `& % $ # _` are written with a backslash and `\ { } ^ ~` as `\textbackslash{}` and its like in a shape's words, chart titles and SmartArt items, and read back for the page and the dialogs. Tests: `objfmt.test.mjs`, `drawing.test.mjs`, `objects.py compiled` ("Q1 sales & R&D: 50% of $5_000 #1" in the PDF on three engines; pdfLaTeX's OT1 `\_` is a drawn rule, so there it is compared without spaces and underscores).
- **L1** (cfdb875): `shapeOrder` moves whole lines with their comments and refuses where a command shares its line with another.
- **L2** (9be2f29): `\includegraphics{a}` finds `a.png` as TeX does, and the reasons say what is missing.
- **L3** (9be2f29): `pic.c` reads a PNG's size from its header first: 100000 by 100000 is "too large", 20000 by 2 is read; the message no longer calls CMYK JPEGs unreadable.
- **L4**: not changed. TeX ignores EXIF orientation, so the edited file prints as the first one already printed; after a correction the page and the PDF agree. Turning the picture upright is a change to what TeX prints and belongs with Rotate.
- **L5** (9be2f29): the width in pixels is rounded up from the printed size, not measured on screen.
- **L6** (06d036a): Shape Fill and Shape Outline are tiles in rows (`pop-gal`), 44 px each on a phone.
- **L7** (430df57): the line after a SmartArt with colours of its own puts back the list in effect before it (the preamble's `set color list`, or the package's), marked `% rikuy: colours back`.
- **L8**: not this branch (B8's `picture-place-*` commands).
- Numbering (0ab00f0): this branch's task is 69 in `PLAN.md`, and GAP.md's rows P4, P5, P9 to P12 with it.

Checks at 3a9472f, with `dist/tex`: `npm test` green (`objfmt` 17 groups, `picfx` 12, `objlist` 4); `objects.py` 247 passed, 0 failed; `picture.py` 228; `tabs.py` 127; `agent.py` 143.

---

# Verification of ff46de0

**Verdict: fix first.**

What blocks: H2's fix (Position) holds for the one case it was tested on, Top of Page on `figure > center > tikzpicture`. Three neighbouring cases still break:
- **Wrap breaks the compile on the very same `figure > center` form.**
- **Position inside `multicols` drops the drawing from the PDF, with no error.**
- **Position inside `tcolorbox`, `wraptable` or `sidewaysfigure` nests a float and stops TeX.**

Everything else is fixed or reduced to Medium and Low. I reran the repros in `/tmp/review-g1-out/` (`probe.py`, `phone.py`, `t1.mjs` to `t7.mjs`) on dist/ with dist/tex. New attacks: `v1.mjs` to `v9.py` and `csp_pic.py`.

## The findings, one by one

| # | Status | Evidence |
|---|---|---|
| H1 | fixed | `probe.py chart_comment`: the new title goes before the comment, pdfLaTeX shows no problem. `v1.mjs`: eight odd hand-written forms all edited in place and read back. Those forms: comments between keys, a trailing comma, a comment holding `] , {`, CRLF, a commented-out key last, an escaped title, no spaces. Toggles on then off give the bytes back. |
| H2 | **partly** | Top of Page on figure > center: one figure `[t]`, compiles; the menu shows Best Place. **Still broken**, see N1 to N3 below. |
| H3 | fixed | Reset on the first of two pictures on one line changes nothing. The tools refuse that picture with a plain reason. |
| H4 | fixed | `my photo.png`: the second step starts from the first file, one note, and Reset goes back. `v7.mjs`: braced names with unicode, commas, spaces, emoji and a subfolder are read back. A name over 240 characters is not (Low). |
| H5 | fixed | `pdfimages -list` at 150 ppi gives: natural-size picture 150, `angle=90` picture 150, cropped picture left at 127 (below the target). Same on XeLaTeX. |
| H6 | fixed | `phone.py`: every control of the five tabs, the Selection Pane's Close, Show All, Hide All and name field, and the colour tiles are at least 44 px, at 390 and 360 px. Two controls are left: `rb-tabsel` (28 px) and `rb-dl-menu` (30 px). They come from main's ribbon (PR 78) and sit on every tab: a matter for main, not this branch. |
| M1 | **partly** | The page now draws `{0pt}` at the side with the words wrapped (`wrap-simple-page.png`). Wrap just before a list is refused. **Wrap inside a list item is not refused** (N4). |
| M2 | **partly** | Hand-written line breaks are kept. **A key taken off loses a neighbour's comment** (N5). |
| M3 | fixed | A replaced original gives a new file: the green picture shows. |
| M4 | fixed | `csp_pic.py`, a 12 MP JPEG under the hosted policy served by serve.py with reports on: the work runs in the worker (`picFxStats.worker`). "Working on photo.jpg…" shows at 0.9 s and the result comes at 2.2 s. The page's longest frame gap is 97 ms. The module at 113 MB is let go (`dropped: true`). There were no policy refusals and no reports. `v8.mjs`: after the drop, node's ArrayBuffers fall back to 1 MB. |
| M5 | fixed | One edited file per picture: the second step takes out the first edited file, and undo brings it back. The Compress toast now says plainly what the project keeps. |
| M6 | **partly** | Fixed: `\crefrange`'s second key, `\hyperref[…]`, `\subref`, `\Cref*`, refs in `\footnote`, tabular and align, and an `\input` .tex file; verbatim and lstlisting are left alone. **Still missed** (N6). |
| M7 | **partly** | Hiding now survives the deletion of another object, and a reload. **It is lost when the hidden object itself is edited** (N7). |
| M8 | **partly** | Edit Text, Chart Title, Axis Titles and Text Pane escape `& % $ # _ \ { } ^ ~`. Each reads back identical (`v5.mjs`), the page shows the unescaped words (`v6.py`), and Change Chart Type keeps the title. **Edit Data still drops characters** (N8). |
| L1 | fixed | A command sharing its line is refused. |
| L2 | fixed | `\includegraphics{a}` finds a.png, and Corrections are on. |
| L3 | fixed | 20000×2 is read. 100000×100000 is "too large". The message no longer calls CMYK JPEGs unreadable. Hostile files still neither crash nor trap. |
| L5 | fixed | Compress lands at 150 ppi exactly. |
| L6 | fixed | The colour grid shows as tiles. |
| L7 | not rerun | Trusted to the author's test. |
| L4, L8 | left on purpose | I agree with both reasons. |

## New findings, from attacking the fixes

**N1 (High). Wrap breaks the compile when the figure holds a `center`.**
- This is the hand-written form H2 was about. `\begin{figure}…\begin{center}<tikz>\end{center}\caption{…}\end{figure}`, then Wrap with Text, gives `\begin{wrapfigure}{r}{0pt}\n\begin{center}…`.
- pdfLaTeX stops: "Not allowed in LR mode (at \begin{center})", "Missing \endgroup inserted".
- The cause: a `{0pt}` wrapfigure sets its body in LR mode, and a list environment cannot stand there. `\centering` with `\caption` compiles fine.
- The same error comes from a `table` float that holds a `center`. There is a second problem with tables: Wrap writes `wrapfigure`, which turns "Table 1" into "Figure 1".
- Repro: `v3.py`, `v3b.py`.
- Fix: when wrapping, rewrite a `center`, `flushleft` or `flushright` in the float's body as `\centering`, `\raggedright` or `\raggedleft`. Alternatively give the wrapfigure the object's width instead of `0pt`. Write `wraptable` for a table, or refuse.

**N2 (High). Position inside `multicols` makes the drawing vanish from the PDF.**
- Top of Page writes `figure[t]` inside `multicols`. multicol says only "Floats and marginpars not allowed inside multicols" (an info line) and drops the float.
- Repro (`v9.py`): the drawing's "MARKER" is in the PDF before the change and gone after it, and the problems list is empty.
- Wrap there compiles, but wrapfig in multicols is not reliable.
- Fix: add `multicols` to `BOXES` for float and wrap (`figure*` would be the only float allowed there).

**N3 (High). Position nests a float inside other float-like environments.**
- `blockOf`'s `FLOAT_ENVS` lacks `wraptable`, `sidewaysfigure`, `sidewaystable`, `SCfigure` and `SCtable`.
- `BOXES` lacks `tcolorbox` (and `adjustbox`'s friends).
- Top of Page in `tcolorbox`, in `wraptable` and in `sidewaysfigure` each writes `\begin{figure}[t]` inside, and TeX stops with "Not in outer par mode" (`v3.py`).
- Fix: read every float environment the model knows (`src/model.js:2205`'s list) as a float. Treat any box environment the parser marks, or an allowlist plus `tcolorbox`, as a box.

**N4 (Medium). Wrap inside a list item is not refused.**
wrapfig logs "wrapfigure used inside a conflicting environment" and "Stationary wrapfigure forced to float", so the PDF does not show what the page shows. Fix: refuse wrap when an `itemize`, `enumerate` or `description` is round the object, as it is already refused before a list.

**N5 (Low to Medium). Taking off the last key deletes the comment of the key before it.**
Option lists edited in place still move user comments (`v2.mjs`):
- Data Labels off on `…ymajorgrids, % grid lines help\n  nodes near coords % labels on bars\n]` gives `ymajorgrids % labels on bars`. "grid lines help" is gone, and the labels comment now sits on the grid line.
- Dashes → Solid on a `\draw[…, draw=red, % its colour\n dashed % style]` drops "its colour" the same way.
- A key added after the last moves that line's comment onto the new key (`title={Q1} % top left`).
- The compile is safe. This breaks rule R4 (turning off removes exactly that construct).
- Fix: when taking off the last entry, remove the separator before it together with the entry's own text, but keep the comment that follows that separator. Put a new key after the comment's line end, with its comma before the comment.

**N6 (Medium). Label rename still misses some references (`v4.mjs`).**
- Missed:
  - `\ref` inside a `tikzpicture` (`\node {see \ref{fig:a}}`): raw environments other than math are skipped.
  - A reference in an `\input` file whose name does not end in `.tex` (`plot.tikz`).
  - A document's own reference macro (`\newcommand{\figref}[1]{Figure~\ref{#1}}` with `\figref{fig:a}`), which is common in papers.
  - The PDF shows ?? for each, and nothing warns.
- Also, `lstlisting`'s `label=lst:x` does not count as taken.
- Fix:
  - Scan `tikzpicture` and other non-verbatim raw environments with `scanRaw`.
  - Read every text file the project inputs.
  - After a rename, count `{old}` wherever it still appears and say "N more places still name fig:a".

**N7 (Low). Hiding is lost when the hidden object itself is edited (`v6.py`).**
- Shape Fill on a hidden drawing, selected through the pane, shows it again: its key is a hash of its source.
- Renaming a hidden figure's label in the pane shows it again: its key is the label.
- Fix: carry the hidden key across the commit that changes the object (`objApply`, `selRename`).

**N8 (Medium to Low). Edit Data still drops characters (`v5.mjs`).**
- In Chart Design's Edit Data grid, `chartTex`'s `safe()` still drops `& % _ $ #` and the comma.
- Categories "R&D", "Q1 50%" and "a_b" become `R D`, `Q1 50` and `a b`.
- Series "Sales & Co" and "100%" become legend entries `Sales Co` and `100`.
- Legend entries can be escaped as the titles are. Symbolic categories cannot hold most of these characters: say so in the grid rather than dropping them silently.

**N9 (Low). `object-align` costs 6.1 ms per look in a long document.**
- With a drawing selected in page.py's long document (3000 paragraphs), `object-align`'s `when` takes 6.1 ms per look. It parses the whole file in `blockOf`, over page.py's 5 ms rule for one command.
- Everything together stays well inside the 40 ms bound: 15 ms with a drawing selected, 27 ms with a picture (121 before main's merge).
- Fix: memoise `blockOf` per text on `at.memo`.

## The merge of main

- `tabs.py`: 137 passed, 0 failed (the fold sweep at 530 to 1360 px on 19 tabs).
- `agent.py`: 143 passed, 0 failed.
- `csp.py`: 22 passed, 0 failed. It does not exercise the picture tools; `csp_pic.py` did, under the same policy and report-uri, with no refusal and no report.
- `npm test`: every suite passed.
- The worker loads as `core/rikuy-pic-worker-<hash>.js` through a `blob:` worker. The policy allows that: `worker-src 'self' blob:`, and `importScripts` of a file of the site.
- The wasm in dist/ has the same SHA-256 as `tex/vendor/pic/rikuy-pic.wasm`. Rebuilding it from source (`vendor.yml`) is left to CI: building here would write into the worktree.

## Fixes for the verification

Each finding with its commit and the test that failed before it.

- **N1** (c1c53e2): Wrap on a float holding a `center`, `flushleft` or `flushright` writes `\centering`, `\raggedright` or `\raggedleft` in the wrapfigure; a `table` becomes a `wraptable`, and back a `table`, its caption still "Table 1". Tests: `objfmt.test.mjs` (N1 group, and the H2 group's wrap now expecting `\centering`); `objects.py review_arrange` (the wrapfigure and the wraptable compiled with pdfLaTeX, XeLaTeX and LuaLaTeX, "Figure 1: Box" and "Table 1: Data" in each PDF).
- **N2** (c1c53e2): in `multicols`, every float and wrap place is refused and greyed in the Position menu, its reason in the tooltip; In Line with Text brings back a figure multicol dropped; a `figure*` there keeps its place's choice. Tests: `objfmt.test.mjs` (N2, N3 group), `objects.py review_arrange` (the menu greyed, nothing written).
- **N3** (c1c53e2): floats and boxes are one list, `picture.js`'s `FLOATS` and `BOXES`, exported and extended (`tcolorbox`, `mdframed`, `framed`, `adjustbox`, `tblr`, `NiceTabular` and their like); any command's argument round the block is a box; a `wraptable` round the object is the float Position changes; `sidewaysfigure`, `SCfigure` and `marginfigure` set their own place and are refused. Tests: as N2; `objects.py review_arrange` (Top of Page in a wraptable: `table[t]`, compiled on three engines; the tcolorbox menu greyed).
- **N4** (c1c53e2): Wrap is refused inside any environment wrapfig cannot wrap in (`picture.js`'s `WRAP_OK`, the rule pictures use): a list item, a quote, a theorem. Test: `objfmt.test.mjs` (N4 group).
- **N5** (bb01ef1): an entry alone on its line goes with its line; the last one also takes the comma before it, and the comment after that comma stays. An entry sharing a line goes with its comma. A new key after a line that ends in a comment puts its comma before the comment and itself on its own line. Test: `objfmt.test.mjs` (N5 group; the H1 group's expectations follow).
- **N6** (51b2387): raw environments other than verbatim are read (`tikzpicture` nodes), every text file the project inputs (`plot.tikz`), the document's own reference commands (`\newcommand`, an optional first argument, `\def`); a listing's `label=` is a name. What still names the old key is counted and the pane says "N more places still name fig:a (file)". Tests: `objlist.test.mjs` (N6 group, renamed and back byte for byte), `objects.py selpane` (the pane's message with a `\ref` left in verbatim).
- **N7** (51b2387): a step that changes a hidden object moves its mark to the object's new key (Shape Fill on it, its label renamed), kept in the browser. Test: `objects.py selpane` (both, and after a reload).
- **N8** (cecdf43): a series' name is written escaped in `\addlegendentry` and read back as typed; a category still cannot hold `& % $ # _ ^ ~ \ { } , ( ) [ ]` (pgfplots keeps it as a symbol), and the grid says so as it is typed ("R&D" is written "R D"). Tests: `objfmt.test.mjs` (N8 group), `objects.py charts` (the note, the legend, compiled on three engines).
- **N9** (c1c53e2): Align's `when` reads the app's kept tree (`picTree`) and the look's memo. Test: `objects.py review_arrange` (0.10 ms a look on page.py's long document with a drawing selected; 5.01 ms before).
- The verification of ff46de0 is placed after the first fixes' section, as the file's history runs.

Checks at cecdf43, with `dist/tex`: `npm test` green (`objfmt` 22 groups, `objlist` 5); `objects.py` 274 passed, 0 failed; `picture.py` 228.

---

# Verification of 7d163a0

**Verdict: fix first.** One item blocks: an environment the document defines itself (U1 below). Everything else holds.

I tested on dist/ built at 18:42, which no source file is newer than; 7d163a0 itself changes docs only. Repro scripts are `v1` to `v9`, `w1.py` and `w2b.py` in `/tmp/review-g1-out/`.

## N1 to N9

| # | Status | Evidence |
|---|---|---|
| N1 | fixed | Wrap on figure > center + caption writes `wrapfigure{r}{0pt}\n\centering`, and it compiles. A `table` float becomes `wraptable` and keeps "Table 1" (`v3.py`, `v3b.py`). |
| N2 | fixed | In multicols, Top of Page is refused and greyed. `v9.py`: the drawing stays in the PDF. |
| N3 | fixed for the listed environments | tcolorbox: refused. sidewaysfigure: refused with "sets its own place". wraptable: Top of Page writes `table[t]`, compiles, "Table 1". **But see U1.** |
| N4 | fixed | Wrap inside an itemize item is refused; float there is still allowed and compiles. |
| N5 | fixed | `v2.mjs`: taking off the last key keeps the previous key's comment ("% grid lines help", "% its colour"), and a key added after a comment puts its comma before it. |
| N6 | fixed | `v4.mjs`: the rename reaches `\ref` in a tikzpicture node, `plot.tikz`, and `\figref{…}`, and leaves lstlisting alone. A listing's `label=` now counts as taken. |
| N7 | fixed | `v6.py`: a hidden drawing stays hidden after Shape Fill, and a hidden figure stays hidden after its label is renamed. |
| N8 | fixed as far as pgfplots allows | Legend entries are written as `\addlegendentry{Sales \& Co}` and `100\%`. Categories still lose `& % _ , …`, which pgfplots' symbolic coordinates cannot hold; the grid now says so. |
| N9 | fixed | With an object selected on page.py's long document, when/on together take 7 ms (drawing) and 10 ms (picture); no single command is over 5 ms. |

The earlier H and M repros were not rerun this round. Suites: `objects.py` 274 passed, 0 failed; `picture.py` 228 passed, 0 failed, so B8's pictures lose nothing under the new shared lists.

## New findings

**U1 (High, the one blocker). An environment the document defines itself still gets a float written inside it.**
- Floats are refused from a deny list (`BOXES`), while wrap uses an allow list (`WRAP_OK`). An environment on neither list passes the float check.
- Repro (`w1.py`): `\newenvironment{mybox}{\begin{minipage}{6cm}}{\end{minipage}}`, or `\newtcolorbox{notebox}{…}`, around a center holding a drawing.
- Top of Page writes `\begin{figure}[t]` inside, and TeX stops with "Not in outer par mode". The drawing is missing from the PDF.
- Wrap in the same places is refused correctly, because the allow list catches them.
- `\newtcolorbox` environments are common in current documents.
- Fix: refuse a float from any environment that is not known to be safe, the same way `WRAP_OK` works for wrap. Known safe: document, lists, quote, quotation, verse, center and flush, theorem-like environments from `\newtheorem`, language, spacing and landscape. Alternatively, read the preamble's `\newenvironment`, `\NewDocumentEnvironment`, `\newtcolorbox` and `\newmdenv` definitions and treat each one as a box.

**U2 (Low). Wrap is now refused inside polyglossia's language environments.**
`\begin{french}…\end{french}` refuses Wrap, while `otherlanguage` is allowed; at ff46de0 this was written and worked. Add `\setotherlanguage`'s environments (or any environment polyglossia declares) to `WRAP_OK`.

**U3 (Low). Greyed Position items cannot be reached from the keyboard.**
- `w2b.py`, in multicols: ArrowDown never leaves "In Line with Text". The eight greyed items carry `aria-disabled` and their reason only in `title`.
- So keyboard and screen reader users never hear what is unavailable or why, and on touch there is no tooltip at all. Enter on a greyed item does nothing, which is correct.
- Word lets the arrows land on greyed items. WAI-ARIA's menu pattern recommends that disabled items stay focusable.
- Fix: keep greyed items in the arrow order, and give the reason through `aria-describedby` plus one visible note line under the menu.

**U4 (Low). Two `\centering` lines.**
On a figure that has both `\centering` and a `center`, Wrap writes `\centering\n\centering`. It is harmless; drop the second when one is already there.

**Note.** A tikzpicture inside multicols inside a figure is not drawn on the page, so Position cannot reach it there. I could not attack that case through the interface.

## Fixes for the second verification

- **U1** (7a9537d): a new float is written only where every environment round it is on an allow list (the body, lists, quotes, center and flush, a proof, theorems and the document's `\newtheorem`'s, languages, spacing, landscape, sizes), as wrap's `WRAP_OK` works. The main file's preamble is read: `\newtcolorbox`, `\newmdenv` and their like are boxes; a `\newenvironment` or `\NewDocumentEnvironment` counts as safe only where its begin part holds safe environments and plain declarations. Anything else is refused, the reason naming it ("an environment of this document's own"). Tests: `objfmt.test.mjs` (U group: mybox, notebox, a `\NewDocumentEnvironment` round a tcolorbox and an unknown environment refused; `\newenvironment{note}` of a quote, a theorem and a proof allowed; the preamble read from the main file; failing before), `objects.py review_arrange` (notebox and mybox greyed, nothing written).
- **U2** (7a9537d): polyglossia's language environments (`\setotherlanguage{french}`, `Arabic` for arabic) and babel's `otherlanguage` and `hyphenrules` allow Wrap and floats. Tests: `objfmt.test.mjs` (U group), `objects.py review_arrange` (Wrap in `\begin{french}`, compiled with XeLaTeX and LuaLaTeX).
- **U3** (7a9537d): a greyed menu item given its reason (`openMenu`'s `why`) stays in the arrows' reach, carries the reason as its `aria-describedby`, and shows it in a note line under the menu as it is reached, pointed at or pressed (a tap); Enter or a press on it writes nothing. Test: `objects.py review_arrange` (in multicols: ArrowDown lands on Best Place, its description and the note say why, the arrows go on, Enter writes nothing, a press shows the reason; failing before).
- **U4** (7a9537d): Wrap on a figure with both `\centering` and a `center` drops the center's line. Test: `objfmt.test.mjs` (U group).

Checks at 7a9537d, with `dist/tex`: `npm test` green (`objfmt` 23 groups); `objects.py` 285 passed, 0 failed; `picture.py` 228.
