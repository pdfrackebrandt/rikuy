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
