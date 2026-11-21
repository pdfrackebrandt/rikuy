# PR 94 (dogfood-econ): reviews

The reviews of the dogfood of 2026-11-20 and 21 (an economist writing a paper and lecture notes fast), oldest first, each verification appended after the review it answers.

# Hostile review 1: PR 94 (dogfood-econ @ 721eaff)

Reviewer: Claude (hostile reviewer), 2026-11-21. Range 08a4b38..721eaff, built in its own worktree (`RIKUY_NO_WORD=1`, no TeX tree), every finding reproduced in Chromium through `test/browser.py`'s helpers against the base build 08a4b38; repros in `/tmp/dogrev/` (`econ1.py`, `econ2.py`, `econ3.py`, `csl.mjs`). This review covered PR 95 (dogfood-word) too; only PR 94's part is kept here.

## Findings

### Medium

**E1. The citation picker writes the `.bib` path from the project root, not from the main file's folder.** (`src/cmd/refs.js:563`)
- TeX runs in the main file's folder (`tex/engine.js:1840-1842`).
- Repro (`econ1.py` 4): with `paper/main.tex` and `paper/refs.bib`, picking a key writes `\bibliography{paper/refs}`. BibTeX looks for `paper/paper/refs.bib`, so every citation prints [?]. That is exactly the failure the commit was meant to fix.
- Fix: make the path relative to `dirname(main)`. Leave out `.bib` files that are not reachable from there, or write `../`.

**E2. With two `.bib` files the document does not name, only the first picked file is written.** (`src/cmd/refs.js:562` returns once `bibNamed()`; `src/app.js:3284` `bibList` offers every file; `app.js:3361`)
- Repro (`econ1.py` 1): pick alpha2001 from a.bib, then beta2002 from b.bib in the same picker. Result: `\cite{alpha2001, beta2002}` with only `\bibliography{a}`, so beta2002 prints [?].
- Fix: when the document already names files, append the new loose file to the same `\bibliography{a,b}` (or add another `\addbibresource`) in the popover's session.

**E3. Tab at the end of an inline formula throws an uncaught error and drops the focus.** (`src/app.js:2845` move-out handler)
- MathLive's `leap` (Tab) sends `move-out` too. `leaveMath` tears the field down inside the event, then `leap` calls `model.announce` on the destroyed field: `PAGEERROR Cannot read properties of undefined (reading 'host')`.
- The Tab key's default then moves the focus to the status bar (`st-pages`), so the next keys go nowhere (`econ3.py`).
- Base also lost the focus on Tab, but it kept the field open and threw nothing.
- Fix: act only on arrow keys (note the key in a keydown handler), or defer with `setTimeout(() => this.leaveMath(d))` and stop the Tab keydown.

### Low

**E4. The bibliography is written twice when it lives in an `\input` file.**
- When `\bibliographystyle` and `\bibliography{refs}` sit in an `\input` file and `refs.bib` is missing, but another `.bib` is in the project, the picker writes a second pair into main.tex (`econ1.py` 2).
- BibTeX then stops with "Illegal, another \bibstyle command" and "Illegal, another \bibdata command".
- Cause: `bibNamed()` reads only the main file (`bibSetup(this.src(this.main))`). `sourceFiles` already scans every `.tex` file, so use that.

**E5. A heading after nested environments leaves only the innermost one.** (`src/cmd/styles.js:614` `ghostOutOfEnv`)
- A blank paragraph after `\end{quote}` inside a theorem gets `\section{Next}` inside the theorem (`econ2.py` 1).
- Fix: loop while the next token is the `\end` of a paragraph-style environment.
- Also note: a run-in `\paragraph` (Heading 4) at the end of a proof is now always pushed out of the proof. That is debatable for case-by-case proofs.

**E6. `\bibliographystyle` is read from the raw text, and the list of citation-order styles is short.** (`src/model.js:838-844`)
- The scan counts `\bibliographystyle` inside verbatim, `\iffalse`, or a macro body. In a test, a `\bibliographystyle{unsrt}` in verbatim switched the page to citation order.
- It takes the last one, but BibTeX uses the first `\bibstyle` in the `.aux` and rejects the rest.
- Citation-order styles that are missing from the list: IEEEtran, elsarticle-num, vancouver, naturemag, achemso, JHEP, and biblatex's `sorting=none`. Under IEEEtran the page and, since this PR, Word number by author while the PDF numbers by citation order (`csl.mjs`).
- Also unhandled: a style set in an `\include`d back-matter file.

**E7. Word puts a von name in a different place from the page and the PDF.** (`src/word.js:23` `demote-non-dropping-particle="sort-only"` in the sorted CSL)
- BibTeX's plain sorts "van Dijk" under v. The page agrees, giving Smith [1] and van Dijk [2]. Word sorts it under D, giving van Dijk [1] (`csl.mjs`).
- This matters in economics: Van Reenen, von Wachter.
- Fix: use `demote-non-dropping-particle="never"` in the sorted variant.

**E8. Right out of a formula in an RTL paragraph puts the caret on the wrong side.**
- Right at the formula's visual right end leaves the caret at its left edge, which is the logical "after" (`rtl.py`: formula at x 918 to 928, caret at x 918.5).
- Fix: swap the direction when the paragraph's `dir` is rtl.

**E9. The paste replacements are too blunt in places.** (`src/editor.js:350-356`)
- In a pdfLaTeX document that already sets up Greek (babel greek with LGR, textgreek, `\DeclareUnicodeCharacter`, newunicodechar), pasted Greek prose becomes one math letter per character, and accented Greek stays raw.
- `′` becomes `$\prime$`, which prints a large prime; `f$'$(x)` would be right.

**E10. Shift+Right at a formula's end does not extend the selection out of it, as Word's does.** This is minor.

**Not verified:** Word export probably still draws a table's caption above the table, through pandoc's Table caption, even when the source and the page now put it below (round trip rule 7).

### What held up
- A formula typed and closed at once (x then Enter, y_1 then Esc) is kept.
- Right and Left leave inline formulas in a paragraph, a `\section` title and a table cell. Left at a paragraph's start works. An edit plus Right undoes in one step to the byte. A display keeps its arrows.
- A heading after an abstract, a proof after a proposition, and a heading after a list inside a theorem all land after the `\end`.
- The citation picker on a flat project works. With biblatex, `\addbibresource` is added in the citation's own undo step.
- `$\alpha$$\beta$` from adjacent Greek letters parses as two inline formulas, in the model and in TeX.
- A commented `\bibliographystyle` is skipped. The CSL sort uses family names, not initials.
- Insert Table's first field is selected, and table captions are drawn by their place in the source.

## Verdict
- **PR 94: fix first.** E1 to E3 are small fixes. E1 and E2 make the new citation feature print [?], which is the failure it was meant to remove. E3 is a new uncaught exception. E4 to E10 can follow.

---

# Hostile review 2: PR 94 (dogfood-econ), 721eaff..0e7fc74

Reviewer: Claude (hostile reviewer), 2026-11-21. I read every diff in the range. The build is 0e7fc74 in its own worktree (`RIKUY_NO_WORD=1`, with the TeX packs of `wt-dog-econ/dist/tex`). Every finding below was reproduced in Chromium through `test/browser.py`'s helpers. Where TeX's output matters, I also ran desktop pdflatex/bibtex. The repro scripts are in `/tmp/econrev2/`: `undo1.py`, `words.py`, `enter.py`, `split.py`, `repl.py`, `bib.py`, `bib2.py` and `verb.py`, with `h.py` as the shared harness. I did not run the full suites.

## Verdict: fix first

E11 and E12 are regressions in everyday keys, introduced by 762b20d: Enter followed by Backspace, and Enter followed by Ctrl+Z. E13 makes the PDF print "Abstract", "Proof." and a new theorem number a second time. E14 is a hole in 3c9507b: an undo step is applied to text it did not make, and that now survives a reload. Each fix is small.

---

## High

**E11. Enter at a paragraph's start, then Backspace, joins the paragraph to the one before it.** (`src/app.js:1929`)
- 762b20d makes Enter at a paragraph's start show an empty paragraph (a ghost) and write nothing, with the caret left where it was.
- Backspace then acts on the real caret. It deletes the blank line before the paragraph.
- Repro (`enter.py` 1): caret at the start of "Second paragraph words.", Enter, Backspace. The source becomes `First paragraph words. Second paragraph words.`
- Word: Enter then Backspace gives back exactly what was there. Base also did, because Enter wrote `\n\n` and Backspace took it away. This is the most common "oops" pair of keys.
- Fix: while `this.ghost.keepAt` is the caret, Backspace (and Delete in the ghost, `enter.py` 4, which does nothing now) only removes the ghost.

## Medium

**E12. Ctrl+Z after that Enter undoes the edit before it.** (`src/app.js:1929`: Enter records no step)
- Repro (`enter.py` 2): type " Extra" at the end of paragraph 1, then Enter at the start of paragraph 2, then Ctrl+Z. " Extra" is gone and the ghost is gone too.
- Word removes the empty paragraph and leaves the typing. Base also undid the Enter.
- Fix: in `undo()`, when a `keepAt` ghost is showing, remove it and return. That counts as one undo.

**E13. A heading in a theorem, a proof or an abstract makes a second one, which TeX titles and numbers again.** (`src/cmd/styles.js:413` `split: !q.opt && !q.one` applies to every environment `quoteOf` reads; `src/styles.js:179` `splitEnvEdits`)
- Repro (`split.py`, Ctrl+Alt+1 on the middle paragraph of each, then compiled with pdflatex). The PDF reads:
  - `Abstract / We study taxes. / 1 Results follow here. / Abstract / Policy implications end it.`
  - `Theorem 1. First claim… / 2 Middle claim words. / Theorem 2. Last claim words.` Every later theorem is renumbered.
  - `Proof. Step one… / 3 Step two argued. / Proof. Step three…`, with two QED boxes.
- The page draws the same (2 "Abstract" titles), so the page and the PDF agree. Both are wrong.
- The commit message names "an abstract or a quote", and dogfood.py only checks that the result compiles.
- Fix:
  - Split only quote, quotation and verse, which have no title and no counter.
  - For abstract, either take the paragraphs after the heading out of the environment (one `\end{abstract}`, no second `\begin`), or refuse the heading with a reason.
  - For theorem-like environments and proof, refuse the heading ("A heading cannot stand inside a theorem").
- Add a check on the PDF's text to dogfood.py's split test.

**E14. Undo applies a step to text it did not make, and since 3c9507b that survives a reload.** (`src/app.js:1248-1252` `undo()`, which also covers `redo`; the cause here is `src/app.js:4581`)
- Opening a `.tex` chapter (no `\documentclass`) or a `.bib` under a name the project already has replaces that file with `this.files.set`. It records no step and keeps `hist`.
- Repro (`undo1.py`):
  1. Type " ALPHA BETA" into `ch1.tex`.
  2. Open a coauthor's new `ch1.tex` over it.
  3. Reload.
  4. Ctrl+Z gives "A completely drent chapter…". A second Ctrl+Z gives "A compleent chapter…".
- The coauthor's file is corrupted with no message. Before this PR the hole lasted only for the session. Now it lasts for as long as the steps are kept.
- Re-importing `refs.bib` from Zotero, or a chapter sent by mail, is common.
- Fix (both parts):
  1. Guard `undo`/`redo`: for each file, check `t.slice(d.s, d.s + d.ins.length) === d.ins` (redo checks `d.del`). If that fails, drop both stacks with a toast and apply nothing. That also protects against any future inconsistent path.
  2. In `openFiles`, make the replacement a recorded step (`commit` of the whole file), or clear `hist`/`redoStack`.

**E15. A .bib whose name has a space is written into `\bibliography` as it is, and BibTeX cannot read it.** (`src/cmd/refs.js:569` `bibRel`, used at `:615-616`)
- Zotero and Better BibTeX export "My Library.bib" by default.
- Repro (`bib2.py` 1, compiled in the page): the picker writes `\bibliography{My Library}`. BibTeX: "I couldn't open database file MyLibrary.bib", then "Citation `alpha2001' undefined".
- This prints [?], the failure E1 was meant to remove. Desktop bibtex agrees ("I found no database files").
- Fix: when the name has whitespace or other characters BibTeX refuses, rename the file to a safe name when it is added. The picture path already does this (`openFiles`' safe names). Or rename it at the moment `citeBibFor` names it, in the same step, and say so in the toast. biblatex's `\addbibresource{My Library.bib}` can keep the name.

**E16. The "whole project" scans reach `.tex` files the document never reads.** (`src/cmd/refs.js:560` `bibNamed`, `:607` `citeBibFor`; `src/model.js:851` `bibStyleIn` fallback)
- Repro (`bib.py` 2): `main.tex` has no bibliography. The project also holds `slides.tex`, a beamer talk with `\bibliography{talkrefs}`. Pick a key from `refs.bib`.
- Result: main.tex gets nothing, `slides.tex` gets `\bibliography{talkrefs,refs}`, and main prints [?].
- The same scan lets a `\bibliographystyle{unsrt}` in an unrelated file decide main's numbering, when main's own style sits in a file that Map order puts later.
- Multi-document projects (paper with slides, paper with response letter) are common on Overleaf.
- Fix: scan only the files the model reached from main, for example the set of `B.f` over `this.model`'s blocks, or the `\input`/`\include` graph, in reading order.

## Low

**E17. Download names drop every letter outside ASCII.** (`src/app.js:4820` `fileBase`: `[^\w.-]+`)
- 5266dc9 now names downloads by title, and titles are where accents appear.
- "Política Económica: Teoría y Evidencia" becomes `Pol-tica-Econ-mica-Teor-a-y-Evidencia.pdf`. A Chinese title becomes `paper.pdf`.
- Word keeps Unicode and spaces in a suggested file name. The commit message itself promises "Optimal Taxation under Political Turnover.pdf", but the code writes dashes.
- Fix: strip only `\/:*?"<>|` and control characters (`/[\\/:*?"<>|\u0000-\u001f]+/g`), and keep letters (`\p{L}`), digits and spaces.

**E18. Enter after a comment line, or at a `\noindent` paragraph's start, still writes blank lines.** (`PARA_START`, `src/app.js:~395`)
- Repro (`enter.py` 5 and 6):
  - `\noindent Second…` becomes `\noindent \n\nSecond…`. The `\noindent` is left alone and the paragraph loses it.
  - After `% a note`, two Enters write `\n\n\n`.
- This is older behaviour that the new rule does not cover. Treat `\noindent` and a comment line ending in a newline as standing before a paragraph's start.

**Not verified:**
- 3c9507b writes the whole history (up to 2e6 UTF-16 characters, so about 4 MB, not "2 MB") on every `persist`. I did not time it on a phone.
- af01ef8 draws each group of rows between `\intertext` lines as its own display. TeX keeps one set of alignment columns across `\intertext`, so the `=` signs on the page no longer line up across the words, while in the PDF they do. I did not screenshot this.

**Seen in passing, outside this range (also on the base build 08a4b38's dist):** typing Ctrl+B, "bold", Ctrl+B, " after" loses the bold. The second Ctrl+B, with the caret at the end of the bold word, takes `\textbf` off the whole word (`verb.py`; `words.py` B shows the undo trail `\textbf{bold}` → `bold`). Word toggles the format for what is typed next when the caret is at a word's end. See `src/cmd/font.js:170`, where the word rule should apply only strictly inside a word. This is worth its own issue.

---

## What held

- **73b9833 (word by word):** "Teh  model, i.e. two goods; (x) and y--z." is undone in 8 steps, one word with its trailing spaces each, back to the original bytes. Redo of all of them gives the typed text byte for byte. AutoCorrect's capital is a step of its own, as in Word, and so is a paste. Formatting toggled mid-typing makes separate steps. A heading and the paragraph typed after it are separate steps (Enter's `\n` starts a step).
- **3c9507b (persisted undo):**
  - `persist` is the only writer of `project`, and it writes `history` in the same call under the same `t`. init takes the steps only on an exact `t`, `name` and `main` match.
  - A failed history write (quota) leaves the old `t`, so the steps are dropped and nothing stale is applied. A project written to localStorage instead of IndexedDB still matches its history.
  - Two tabs: each tab's steps belong to its own text, and the last writer's text and steps travel together.
  - `loadProject` (share links, Word import, New document), `openVersion` (Recent), git loads and `doReset` all clear the steps and persist.
  - Steps with pictures or Track Changes' base are not kept.
  - The new key lives in the existing `galley` database's `kv` store, so no renamed keys.
  - Remove cannot touch the open project, and switching projects overwrites `history` with an empty list.
  - The one hole is E14.
- **762b20d (empty paragraph):** nothing is written to the source, so compile, Word export and reload are untouched; the ghost is UI only.
  - After a heading, two Enters then "New" types at the paragraph's start, as in Word.
  - Up types a paragraph into the ghost. In a quote, Up then "Above" writes a paragraph inside the quote.
- **123cdbc (case-preserving Replace All):**
  - Across main.tex, `ch1.tex` and `sub/ch 2.tex` (a path with a space), Utility, UTILITY, utility, uTILITY and `\textbf{U}tility` become Welfare, WELFARE, welfare, welfare and `\textbf{Welfare}`.
  - `\cite{utility2020}`, `\label{sec:utility}`, `\ref{sec:utility}` and the .bib are untouched.
  - "social welfare" capitalizes the first word only, as Word does.
  - One Undo restores all three files byte for byte.
- **E1:** `paper/main.tex` with a root `refs.bib` gets `\bibliography{../refs}`, and the page compiles it with no undefined citation (`bib2.py` 2).
- **E2:** a key from a second loose .bib joins the existing list (`bib.py` 2 shows the join; it went into the wrong file only because of E16).

---

# Verification of the fixes: 0e7fc74..66f6973 (12 commits)

Verifier: Claude (not the author), 2026-11-21. Build: 66f6973 in its own worktree (`RIKUY_NO_WORD=1`, with `wt-tree`'s `dist/tex`). I reran the review's repros against it (`/tmp/econver/`: the same scripts pointed at that build) and then attacked each fix with new scripts in the same folder: `ghost.py`, `hist2.py`, `hist3.py`, `fr.mjs`, `split2.py`, `ctrlb.py`, `inter.py`, `bibopen.py` and `joinbase.py`.

## Verdict: merge

Every finding from E11 to E18, and the Ctrl+B issue seen in passing, is fixed on the review's own repro. The suites pass. The attacks found one regression the fixes introduced (V1, medium) and a handful of low items. None of them blocks the merge. V1 is a one-line fix and should be done next.

## The review's repros on 66f6973

| finding | repro | result |
|---|---|---|
| E11 | `enter.py` 1 and 4 | Enter then Backspace leaves the source unchanged. Up, then Delete in the empty paragraph, also leaves it unchanged |
| E12 | `enter.py` 2 | Typing " Extra", then Enter at a paragraph's start, then Ctrl+Z: only the empty paragraph goes and " Extra" stays |
| E18 | `enter.py` 5 and 6 | `\noindent` stays with its paragraph. After a comment line, two Enters write nothing |
| E14 | `undo1.py` | Open over ch1.tex, reload, Ctrl+Z: the typed text comes back, and the next Ctrl+Z takes out the last word |
| E13 | `split.py` (PDF read with pdftotext) | `Abstract / We study taxes. / 1 Results follow here. / Policy implications end it.` The theorem and the proof are not split, the Heading tile is disabled with its reason, and there is one Theorem 1 and one Proof |
| E15 | `bib2.py` 1, `bibopen.py` | A .bib loaded with a space in its name: the picker refuses to write `\bibliography{My Library}` and says why. Opened through Open, "My Library.bib", "Müller & Co.bib", "参考文献.bib" and "  .bib" become `My-Library.bib`, `M-ller-Co.bib` and `references.bib`, and each compiles with no undefined citation |
| E16 | `bib.py` 2 and 3 | main.tex gets `\bibliography{refs}`. slides.tex is untouched and its `unsrt` no longer orders main |
| E17 | node, on `fileBase`'s rule | "Política Económica Teoría y Evidencia"; "A/B testing: why?" becomes "A B testing why" |
| Ctrl+B at a word's end | `verb.py`, `ctrlb.py` | `X \textbf{bold} after` (typed: Ctrl+B, bold, Ctrl+B, " after"). With the caret clicked at the word's end, Ctrl+B then X gives `\textbf{bold}X` |
| `\intertext` | `inter.py` (with screenshot) | The `=` column has the same left edge in both groups (708.4/708.4 px at 100%, 756.6/756.5 at 150%), and it stays aligned after typing nearby |
| E14 history | `hist2.py` | A Replace All across three files (one of them `sub/ch 2.tex`) is kept across a reload, undone as one step and redone as one step |

## What held under attack

- **E11/E12 empty paragraph:**
  - Enter then Delete deletes the "S", as Word does.
  - Enter then typing "abc" gives `abcSecond`, as Word does.
  - Clicking away and back drops the empty paragraph. Backspace then does Word's ordinary join.
  - The Undo button and Undo's menu take the empty paragraph first.
  - Enter at a paragraph's end then Ctrl+Z takes only the empty paragraph. Enter then Backspace does the same, and the next letter goes on the old paragraph's end.
  - With a comment line and `\noindent`: Enter, Up, then "New" writes the paragraph before the comment.
- **stepFits:**
  - When one of a three-file step's files was changed outside the history, Ctrl+Z applies nothing to any file. It clears both stacks and says so in a toast. Redo does the same.
  - A change after the step's place in a file still lets Undo fit and apply.
- **2 MB cap, written only when changed:**
  - A persist with no change does not rewrite `history`, and the project's `hT` names the last write.
  - After typing, `history` is rewritten and `hT` follows it.
  - A 1.2M-character paste (2.4 MB) keeps no step: after a reload Ctrl+Z says "Nothing to undo" and applies nothing.
  - A 0.9M-character paste is kept with the steps before it, and after a reload Ctrl+Z takes it out.
  - The persist with the big step took 1.5 s.
- **filesRead:**
  - Cycles stop.
  - `\import` and `\subimport`, `./ch`, `x.ltx` and `{a b}` all resolve.
  - Commented `\input` is skipped.
  - `\includegraphics` and `\includeonly` are not taken as `\include`.
  - A main file that does not exist returns `[]`.
- **E13:**
  - A one-paragraph abstract becomes the heading.
  - A heading on the last of three abstract paragraphs keeps the first two in the abstract, with one "Abstract".
  - A quote is still split in two around the heading.
  - A proof containing `\qedhere` and a `theorem[Main]` are both refused, with the reason in the tile.
- **Ctrl+B:**
  - Inside the word (`bo|ld`), Ctrl+B takes the bold off the whole word, as Word does.
  - Pressed twice at the end, it gives bold "X".
  - At the end of `{\bfseries bold}` and of `\emph{it}` (with Ctrl+I) it works.
  - Ctrl+I at the end of a bold word gives `\textbf{bold\emph{X}}`.

## Findings

### Medium

**V1. A heading on the first paragraph of an abstract of several takes the whole abstract away.** (`src/styles.js` `splitEnvEdits`, the `name === 'abstract'` branch, introduced by 9b1e193)
- Repro (`split2.py`, case 2): an abstract with three paragraphs; Ctrl+Alt+1 on the first one.
- The source becomes `\section{First abs words.}` followed by the other two paragraphs as body text. The PDF has no "Abstract" title at all.
- Before 9b1e193, k = 0 began the abstract again after the heading. That printed "Abstract" once and was right. The new branch is meant to stop a second title, but at k = 0 there is no first one.
- Word keeps the other paragraphs in the Abstract style.
- Fix: take the abstract branch only when k > 0. At k = 0, keep the `\begin{abstract}` after the heading.

### Low

**V2. A second Enter at a paragraph's start is absorbed, so a second Backspace or Ctrl+Z acts on the text.** (`ghost.py` d and d2)
- Enter, Enter, Backspace, Backspace joins the two paragraphs.
- Typing "Z", then Enter twice, then Ctrl+Z twice undoes the "Z".
- Word gives two empty paragraphs, and the same keys give back exactly what was there.
- Fix: count the Enters on the ghost, and have Backspace and Undo take one Enter each.

**V3. Shift+Left or Shift+Up right after that Enter selects nothing and drops the empty paragraph.** (`ghost.py` c and c2)
- A Backspace then joins the two paragraphs. In Word, Shift+Left selects the empty paragraph's mark, and Backspace removes that alone.
- This is E11 by a longer route, and it comes from the same cause, 762b20d.

**V4. Ctrl+B at the end of a nested bold (`\textbf{\emph{bold}}`) still takes the bold off the word.**
- It gives `\emph{boldX}`.
- The fix in bc8daa1 looks only at the innermost wrapper ending at the caret. It could step out over every closing brace that ends there.

**V5. Two different .bib files whose names make the same safe name: the second replaces the first, and the toast says "Added".** (`bibopen.py`, "My Library.bib" then "My  Library.bib")
- The replacement is an undo step and a version, so nothing is lost for good.
- The "Added" wording is older (`added` counts every text file that is not a picture). Here it hides a replacement under a different name.

**V6. filesRead follows `\subfile` paths from the main file's folder before the file's own folder, and matches by base name before folder.** (`fr.mjs`)
- `chapters/one.tex` with `\subfile{sections/s1}` reads `sections/s1.tex` rather than `chapters/sections/s1.tex`. Current subfiles resolves the path from the subfile's own folder.
- For `paper/main.tex`, `\input{intro}` reads `slides/intro.tex` when that comes first in the Map.
- `\include` inside `\iffalse` is followed.
- `\input chap1` (no braces) and `\input{"a b"}` are not followed.
- `model.js` `resolveFile` matches the same way, so the page and these scans agree.

**V7. E17 is limited to what file systems forbid.**
- Windows device names (CON, NUL, COM1), bidi and zero-width characters (U+202E, U+200B), and 100 Chinese characters (304 bytes, over the 255-byte limit of ext4 and APFS) are kept.
- Chromium and Firefox clean these names themselves, so this matters only for other consumers. Stripping `\p{Cf}` and capping by UTF-8 bytes would cover them.

**V8. Enter, Up, "x", Backspace, Backspace leaves `First paragraph words. ` with a trailing space.** (`ghost.py` a)
- The next letter is typed after that space.
- The page shows the same, and the PDF is not affected.

**V9. Enter after a new action leaves the redo stack.** (`ghost.py` g)
- Type " Q", undo it, Enter at a paragraph's start, Ctrl+Y: " Q" comes back.

### Outside this range (also on main's build)

- Backspace at the start of a `\noindent` paragraph that follows a comment line deletes the comment and the `\noindent`, and joins with no space: `words.Second` (`joinbase.py`, the same on `/home/claude/rikuy/dist`).
- Heading on a one-paragraph proof carries `\qedhere` into `\section{… \qedhere}`.
- A document whose single word is 1.2 million characters took more than 20 s to load after a reload.

## Suites on 66f6973 (with dist/tex)

- browser.py: 202 passed, 0 failed
- history.py: 40/40
- widgets.py: 66 passed, 0 failed
- dogfood.py: 124/124
- styles.py: 427 passed, 0 failed
- font.py: 309 passed, 0 failed

## Merge of main (85905b1)

- Main at 294c7e6 was merged into this branch.
- There was one conflict, in `src/app.js` openFiles. This branch's undo step for a file opened over another of its name (E14) and main's `this.rbLast = null` stood at the same line. Both were kept, the step first.
- On the merged build:
  - npm test: exit 0, every part passed.
  - browser.py: 202 passed, 0 failed.
  - dogfood.py: 124/124.
  - tabs.py: 156 passed, 0 failed.

## Fixes of the verification's findings (36f89ec to 8a42876)

| finding | commit | what changed |
|---|---|---|
| V1 | a785796 | On an abstract's first paragraph the heading goes before `\begin{abstract}` and the rest stays in it. The PDF has "Abstract" once |
| V2, V3, V9 | 5ce086f | The empty paragraph counts its Enters, and Backspace, Delete or Undo takes one each. A selection over it with no words (Shift+Left, Shift+Up) keeps it, and Backspace takes it alone. Enter that shows one clears Redo |
| V8 | d3c4d05 | No space is written where a blank line still stands beside what Backspace deletes |
| V4 | 379204e | Ctrl+B steps out through the closing braces of wrappers inside the bold and opens them again: `\textbf{\emph{bold}}\emph{X}` |
| V5 | c952c03 | A .bib keeps the name it came under (`orig.from`). The same file opened again replaces its file; another gets `My-Library-2.bib`. Text files opened over one are said replaced |
| V6 | 36f89ec | One resolver (`src/scan.js` `resolveIn`) for the scans and the model: the main file's folder, then the reader's (first for `\subfile`, `\subimport`), then the root, then a name anywhere. `\iffalse` is skipped; `\input chap1` and `\input{"a b"}` are followed |
| V7 | 0b24be8 | U+200B to U+200F, U+202A to U+202E, U+2066 to U+2069 and U+FEFF dropped; `CON_`; at most 200 bytes |
| on main | d3c4d05, a785796 | Backspace at a `\noindent` paragraph after a comment keeps the comment and a space. A proof made a heading drops `\qedhere` |
| CI's L8 | 2a186af | `论文` exports as `论文.md`; a name of only refused signs and unseen marks as `paper.md` |

- Tests: `dogfood.py review3` (31 checks; 7/29 on 119e23f's build, every finding failing at least once), `test/bib.test.mjs` V6 (5 failing on 119e23f), `test/styles.test.mjs` (the abstract's first case, `\qedhere`).
- On 8a42876's build with `dist/tex`: npm test exit 0; browser.py 202 passed, 0 failed; dogfood.py 155/155; styles.py 428 passed, 0 failed; font.py 309 passed, 0 failed; history.py 40/40; refs.py 293 checks, 0 failed; file.py 101 checks, 0 failed. `node test/native.test.mjs` 43 passed, `node test/incremental.test.mjs` 35 passed. No corpus clone on this machine: `npm run test:corpus` was not run.

---

# Verification 2: the fixes for V1 to V9, 119e23f..0024fd4 (10 commits)

Verifier: Claude (not the author), 2026-11-21.

- Build: 0024fd4 in its own worktree (`RIKUY_NO_WORD=1`, with `wt-tree`'s `dist/tex`).
- Every script in `/tmp/econver/` was rerun against that build.
- New attacks: `fr2.mjs` (resolveIn and `\iffalse`), `ghost2.py` (counted Enters, three nested wrappers) and `midb.py`.

## Verdict: merge

Every one of V1 to V9 is fixed on its repro. The two older bugs are fixed too. The attacks found only low items, listed below.

## The repros on 0024fd4

| finding | result |
|---|---|
| V1 | Heading on the first of three abstract paragraphs gives `\section{First abs words.}` and then `\begin{abstract}` holding the other two. The PDF reads "1 First abs words. / Abstract / Second… / Third…" |
| `\qedhere` | A one-paragraph proof becomes a heading without `\qedhere` |
| V2 | Enter ×2 then Backspace ×2, and Enter ×3 then Backspace ×3, leave the source as it was. "Z", Enter ×2, Ctrl+Z ×2 keeps "Z" |
| V3 | Shift+Left or Shift+Up after Enter selects the empty paragraph's mark. Backspace then leaves the source as it was |
| V9 | After a new Enter, Ctrl+Y no longer brings back an older undone step |
| V8 | Enter, Up, "x", Backspace ×2 leaves the source as it was. The next letter follows "words." with no space |
| `\noindent` join | Backspace at a `\noindent` paragraph after `% note` gives `words.\n% note\nSecond`: the comment is kept and the words stay apart |
| V4 | `\textbf{\emph{bold}}` + Ctrl+B + X gives `\textbf{\emph{bold}}\emph{X}` |
| V5 | A second "My  Library.bib" joins as `My-Library-2.bib`. Reopening is an undo step, and one Ctrl+Z gives the old content |
| V6 | `\input chap1`, `\input{"a b"}` and `{a b}` resolve. `\subfile{sections/s1}` in `chapters/one.tex` reads `chapters/sections/s1.tex`. `paper/main.tex`'s `\input{intro}` reads `paper/intro.tex` |
| V6, `\iffalse` | `\include` inside `\iffalse` is skipped, including when a nested `\ifx` or a `\newif` conditional sits inside it. `\else` and an `\iffalse` with no `\fi` are handled. `\iffalsex` is not mistaken for `\iffalse` |
| E11 to E18, `\intertext`, history | Unchanged from verification 1 (`enter.py`, `undo1.py`, `split*.py`, `bib*.py`, `verb.py`, `ctrlb.py`, `bibopen.py`, `hist2.py`, `inter.py`) |

## The counted Enters under attack (`ghost2.py`)

- Enter ×2, then Up, then Down keeps the count: two Backspaces leave the source as it was.
- Clicking into the two-line empty paragraph and typing writes one paragraph.
- Enter ×2 then Delete deletes the next paragraph's first letter, as Word does.
- With three nested wrappers, `\textbf{\emph{\underline{deep}}}`:
  - Ctrl+B gives `\emph{\underline{X}}` after the whole chain.
  - Ctrl+I gives `\underline{Y}` inside the bold.
  - Ctrl+U gives `W` inside the italic.

  Each drops only its own format, as Word does.

## Findings (all low)

**W1. The resolver can pick a file TeX would not read.** (`fr2.mjs`)
- With both a file `intro` (no extension) and `intro.tex`, it picks `intro`. TeX tries `intro.tex` first.
- Its last-guess rule (a file of that name anywhere in the project) reads files TeX would not find:
  - `intro/intro.tex` for `\input{intro}`;
  - `shared/defs.tex` for `../shared/defs` from a main file at the root, which points above the project.

  The page then draws a chapter the PDF lacks. This guess is the deliberate last resort.
- `\input chap1` is followed by the scans but not by the model: the parser gives `\input` the single letter "c". The page and the scans still differ there.

**W2. The empty paragraph is forgotten once the caret leaves it.**
- After Enter ×2, Down (or a click elsewhere), then Up, the empty paragraphs are gone. A Backspace then does Word's ordinary join of two paragraphs.
- In Word the empty paragraphs would still be there.
- This is the same design that verification 1 accepted for a click away.

**W3. Redo and selection do not fully follow the counted Enters.**
- Ctrl+Z after Enter ×2 takes one Enter, but Ctrl+Y does not bring it back.
- Shift+Left ×2 selects `​\n`. Backspace then takes one Enter, not two, and a copy of that selection would carry a zero-width space.
- After Enter ×3, Up, "x", one Ctrl+Z takes the "x" and all three Enters, where Word keeps the three empty paragraphs.

**W4. Ctrl+B at the end of a word inside a longer bold run still takes the bold off the whole run.**
- `\textbf{deep tail}` with the caret after "deep", then Ctrl+B, then X, gives `deepX tail`.
- `\textbf{\emph{deep} tail}` gives `\emph{deepX} tail`.
- This is the same on main's build. The fixes cover a caret at the wrapper's end only, not the word rule in general (the review's note on `src/cmd/font.js:170`).

## Suites on 0024fd4 (with dist/tex)

- dogfood.py: 155/155
- browser.py: 202 passed, 0 failed
- styles.py: 428 passed, 0 failed
- history.py: 40/40

## Merge of main (912a109)

- Main at d8b4dc8 (PRs 88, 90 and 97) was merged into this branch.
- Two conflicts, both resolved by keeping both sides:
  - `AGENTS.md`: main's new ux.py row stands beside this branch's dogfood.py row.
  - `src/app.js`: this branch's top-level constants and main's focus helpers, which sit just before `class App`.
- On the merged build:
  - npm test: exit 0.
  - browser.py: 202 passed, 0 failed.
  - dogfood.py: 155/155.
  - tabs.py: 156 passed, 0 failed.
  - ux.py first_visit focus_rules: 34 passed, 0 failed.
