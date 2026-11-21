# Hostile review: power-keys (PR 87) at 8d5b2ae

Reviewer: Claude (hostile reviewer, keys of Word, Overleaf, VS Code). Build: own worktree at 8d5b2ae,
`npm run build`, no TeX tree. Base for comparisons: a frozen copy of `a954bc6`'s dist
(`/tmp/review-power-out/base-dist`). Scripts: `/tmp/review-power-out/scripts/` (`atk.py <part>`,
`cmp.py`, `eqime.py`, `eqime2.py`, `envleave.py`, `tabq.py`, `cend.py`, `dol2.py`, `dolfast.py`,
`undow.py`, `lat.py`, `tabs2.py`); run each with `/tmp/rk-heavy python3 <script>` (base:
`RIKUY_DIST=/tmp/review-power-out/base-dist`).

## Verdict

**Changes requested.** The typing queue holds for every key sequence, and none of the eight named
suites regressed. Three High findings remain, all small to fix. F12 is taken from Word users next
to every cross reference. In the equation field, `\text{` loses or reorders input from an input
method or a dead key. And Enter twice now leaves every environment, beamer frames included. A
Medium finding: input that arrives without a keydown while letters are queued is applied at stale
offsets, which corrupts the text on Undo. Fix H1 to H3 and M1, then merge; the rest can follow.

## High

### H1. F12 next to any cross reference goes to the label, not Save As (Download LaTeX)
- `src/cmd/refs.js:75` (`go-to-label`, `keys: ['F12'], keyRank: 1`), `src/app.js:2548` (`refHere`:
  `info.s <= c.a && c.a <= info.e`, so a collapsed caret on either side of the reference counts).
  A reference is an atom, so the caret is always at one of its edges.
- Repro (`atk.py keys_f12`): `\` ref Enter, "intro" Enter (the picker leaves the caret after
  `\ref{sec:intro}`), then F12. The caret jumps from 133 to 78 (the label) and nothing downloads.
  F12 elsewhere downloads `main.tex`. Base: F12 downloads in both places.
- The moment straight after inserting a reference is exactly when a Word user saves.
- Fix: bind F12 only with the reference *selected* (`atomSelected()`, e.g. after Shift+Right),
  never with a collapsed caret at its edge. Keep Ctrl+click and a right click menu item.

### H2. `\text{…}` (and the other TEXT_ARG commands) in the equation field loses or reorders IME and dead key input
- `src/wordmath.js:739` (`if (e.isComposing) return;`) and `:747-760` (`arg` collects only
  `keydown` characters). Composed text and `insertText` without a keydown go straight into
  MathLive, outside the pending `\text{`.
- Repro (`eqime.py`, `eqime2.py`): Alt+= on a new line, type `x=1\text{`, then:
  - a Mac style dead key (composition `´`, then `é`) between `caf` and `}`: the result is
    `x=1é\text{caf}+y` (reordered; expected `x=1\text{café}+y`);
  - Japanese IME `日本` then `}`: the result is `x=1日本+y` (the `\text` is gone, and CJK in math
    fails on pdfLaTeX);
  - insertText "if " (dictation, emoji panel, an IME commit): `x=1if+y` (the space is lost and
    the word is set in math italic).
  - Typed with keys only, `x=1\text{if }+y` is correct.
- Fix: while `arg` is set, a `compositionstart`, or a `beforeinput` whose data did not come
  through `onKey`, moves `'\\' + arg.name + '{' + arg.text` to the LaTeX box (`opts.toLatex`), so the
  input method types into a plain textarea. The alternative is to take the field's input data
  into `arg.text`.

### H3. Enter twice leaves every environment, not just theorems: a regression in frames, minipages, center
- `src/app.js:1937-1946` (`ghostLeaveEnv`): only document, itemize, enumerate and description are
  excluded.
- Repro (`envleave.py`): caret at the end of `Inside text.` in `\begin{frame}` (beamer), then End,
  Enter, Enter, `NEW`. Branch: `\end{frame}\n\nNEW`. Base: `Inside text.\n\nNEW\n\n\end{frame}`. The
  same happens with `minipage` and `center`.
- In beamer, text between frames is set nowhere, so the paragraph silently drops out of the
  slides. In a minipage or multicols it leaves the box.
- Fix: limit the rule to the theorem-like environments (`THM_STYLES` keys, `assumption`, `proof`)
  plus quote, quotation and verse, which is the set the audit named.

## Medium

### M1. Typing queue: input that is not a keydown is applied at offsets from before the queued letters (Undo corrupts the text)
- `src/app.js:1139` (`undo`: `hist.pop()` runs before the first `this.files` read, and that read
  is what flushes), `:1161` (`redo`), `:2248` (`onPaste`: the caret is read, then the files getter
  flushes), `:1465` (`rangeToSrc(tr)` runs before `typeFlush()`). Also `typeQueueable(' ')` keeps a
  space's keydown from flushing, so an OS autocorrect at the space sees a DOM without the word.
- Repros (`atk.py q_undo q_paste q_replace`). Letters are queued as the page queues them
  (`keyLate` 50), then:
  - `beforeinput historyUndo` (Edit menu, iPad three finger swipe, iOS shake). After the first
    Undo the text reads `4h}. xyz Importantly`: the typed `Q` was removed instead of the step it
    belonged to. Undo, Undo, Redo, Redo then leaves `2004h}.  QxyzImportant` instead of the typed
    `2004h}. Qxyz Importantly`, so the document is corrupted.
  - A `paste` event with no keydown (Edit menu): `PASTEQxy`, the paste landing before the waiting
    letters.
  - `insertReplacementText` with a target range from the DOM, as macOS or iOS autocorrect sends:
    `2004h}the teh Imp`.
- These are reachable exactly when the queue exists: the page is busy and the browser hands over
  the input waiting behind it. The phone case is the one the queue was built for.
- Fix: call `this.typeFlush()` first in `undo`, `redo`, `onPaste` and the drop handler, and at the
  top of `onBeforeInput` for every inputType except a queueable `insertText` (before reading the
  target ranges). Let a space's keydown flush on WebKit, or always, so an OS autocorrect sees the
  word in the DOM.

### M2. The `\` insert list still writes invalid LaTeX in headings, captions and empty structures
- `src/app.js:3545-3560` (`runPaletteRaw`), `runPalette` and `insertPiece`; the figure item at
  `src/cmd/insert.js:143`.
- Repro (`atk.py insert_list`):
  - caret in `\section{Intro}`, `\` figure Enter gives `\section{In\n\n\begin{figure}[htbp]…\end{figure}\n\ntro}`;
  - `\` `begin{theorem}` in a heading, `begin{center}` and `figure` inside `\caption{}`: the same
    breakage;
  - `begin{itemize}` gives an empty itemize ("missing \item");
  - `begin{tabular}` gives a tabular without a column spec.
- The theorem item inside a heading is the same on base, so the problem predates the branch. The
  branch's new figure item and its raw `\begin` widen it.
- Fix: block items go after the paragraph, heading or caption holding the caret, never inside a
  command's argument. itemize, enumerate and description get `\item `; tabular gets `{ll}` and a
  row.

### M3. Ctrl+P lists Print first for any query that is a prefix of "print"
- `src/ui/quickopen.js:50`.
- Repro (`atk.py keys_ctrlp`): files `part1.tex` and `proofs.tex`. Ctrl+P, `p`, Enter prints (rows:
  Print PDF, part1.tex, proofs.tex). With `pr`, Enter prints as well. In VS Code, Ctrl+P p Enter
  opens the first file.
- Ctrl+P also no longer shows Word's print view: it shows a file list. Ctrl+P then Enter still
  prints.
- Fix: show the Print row only while the box is empty, or rank it below files with a prefix
  match.

### M4. Tab is now kept on the page, and the page never says how to leave
- `src/template.html:96` (`pages-how`: "Click a paragraph and type…") and `src/app.js:5474` (Help
  lists "Esc, then Tab" for the source pane only). The source pane's aria-label already says
  "Tab indents; Escape, then Tab, leaves". The page now captures Tab (writing `\quad` or an
  indent) with no such advice (WCAG 2.1.2), and llms.txt is silent too.
- Fix: put the same sentence in `pages-how` and add a Help line for the page.

### M5. Pickers are not announced to screen readers
- `src/app.js:3448` (`pickerKeys`) and `:3506` (openRef's items); `src/ui/quickopen.js:29-33`.
- The reference and citation pickers have an `input type=search` with `aria-activedescendant`, but
  no `role=combobox`, `aria-controls` or `aria-expanded`. The list has no `role=listbox`, and the
  items are `<button aria-selected>` (aria-selected is not allowed on a button). There is no live
  region for the match count (`atk.py aria`: the only live region on the page is `pdf-live`).
- Quick open's list is a proper listbox, but its input has no combobox role and no `aria-controls`.
- The result is that arrowing through the list announces nothing.
- Fix: the combobox and listbox pattern of `#rk-search` (`src/template.html:20`), with options and
  a polite count.

### M6. Overleaf's other math forms are still lost or wrong (pre-existing, inside claims 2 and 10)
- `cmp.py` and `dol2.py`, the same on base:
  - typing `$$x^2$$ end` on a new paragraph gives `\$x\textasciicircum{}2\$ end`;
  - typing ` \(x\) y` (or `\$5`) opens the insert list, which takes every following key; Esc
    loses them all (`Plain  one.`).
- The audit's own fix for `$$` (display math) was not done.
- Fix: a non-letter right after `\` writes at once: `\(` opens an inline formula, `\[` a display,
  `\$ \% \& \# \_ \{ \}` the character. `$$` opens `newDisplayMath`, and its closing `$$` ends it.

## Low

- **L1** Ctrl+End stops before a closing display equation (`Last para text.ZZ` before
  `\begin{equation}`) and goes into the last table cell, where Word goes after both
  (`src/app.js:2568`). On base Ctrl+End did nothing, so this is better, just incomplete. Footers,
  the bibliography and the appendix are handled correctly (`cend.py`).
- **L2** F2 on a formula selected alone now opens it (`src/cmd/equation.js:282`, keyRank 1). Word's
  F2 there is Move Text, which Rikuy has (`src/cmd/typing.js:176`).
- **L3** Tab in a list item that cannot change level lets the focus visit `st-pages` and come back
  (`keepFocusPastTab`, `src/app.js:2496`). A screen reader announces the status bar control.
  Prevent the key instead and show the list's reason.
- **L4** Tab over a selection, or in a heading, does nothing and says nothing; Word types a tab
  over the selection (`tabq.py`).
- **L5** `mathOnly` (`src/wordmath.js:281`) is true for `o` and `O`, so `$\o$` is an error, and for
  `quad`/`qquad` it opens a formula for a text space. The insert list's hint "Anything else you
  type is inserted as a raw command" is not true: `\o` Enter wrote `\footnote{}` because a
  description matched first.
- **L6** Typing `a $ $ b` gives `a \$ b`: a dollar and a space are lost.
- **L7** Undoing typing is not one word per step as in Word: one step removes " beta gamma". The
  same on base, so not this branch's (`undow.py`).

## What held up

- **Queue order with real keys** at 6x CPU throttle (`q_real`): autorepeat, capitals, a Windows
  dead key, Backspace at a word's start and AltGr all come out in order (`Zebraaaaaaa cafeé worX
  end`). An IME composition between queued letters keeps its order (`q_compose`: ` ab日本cd`).
- **Flushing:** keydown, pointerdown, blur and compositionstart all write what waits.
- **Spelling** marks are CSS highlights, so no DOM change happens while letters wait.
- **AutoCorrect:** `acActs` uses the same `correct()`, so the queue never swallows a correction.
- **Speed at a normal pace is unchanged** (`lat.py`, two runs each):

  | | median | p90 |
  |---|---|---|
  | branch, x1 | 48 ms | 56 to 80 ms |
  | base, x1 | 48 ms | 56 ms |
  | branch, x4 | 208 to 216 ms | |
  | base, x4 | 196 to 208 ms | |

  Long task counts are alike.
- **`$x^2$ is fine`** typed with 0 ms between keys comes out right on the sample and on
  `dev/bench/long`. Dollars in a heading are valid.
- **Tab mid-line** writes `Name\quad{}Value\quad3`, which is valid.
- **Ctrl+click** follows on `click`, so it does not clash with a Mac's Ctrl+click context menu.
- **Preferences in two tabs:** not clobbered (`tabs2.py`).
- **Regression suites on the branch all pass:**

  | suite | checks |
  |---|---|
  | browser.py | 199 |
  | mathfield.py | 19 |
  | wordmath.py | 84 |
  | eqtab.py | 158 |
  | lists.py | 203 |
  | find.py | 114 |
  | outline.py | 103 |
  | view.py | 154 |
  | shortcuts.py | 82 |
  | power.py | 79 |

Not tested: real phone keyboards (Android Gboard composes, so its typing never enters the queue;
iOS autocorrect is the M1 risk), and real NVDA or VoiceOver output (findings M4 and M5 are from
the markup).

## Fixes (author, on power-keys)

Each with checks in `test/power.py` that fail on the commit before it.

| finding | commit | what changed |
|---|---|---|
| H1 | 3cd10c8 | Go to Label (F12) wants the reference selected alone (`refHere` reads `atomSelected()`); F12 beside one downloads, as Word's Save As; Shift+F5 comes back to the selection |
| H2 | a5bb88f | in `\text{` (and the other text arguments) a composition, a dead key or inserted text without a keypress moves `\name{` and what follows to the LaTeX box, where the input method goes on |
| H3 | 6b0f029 | Enter twice leaves only theorem like environments (THM_STYLES, the document's `\newtheorem`s), proof, quote, quotation and verse; a minipage, a center or a frame keep their paragraphs |
| M1 | 8dfce2c | `typeFlush()` first in Undo, Redo, paste, drop and every input but a waiting letter; a space ends the run |
| M3 | 8de6b2f | Go to File lists Print only while its box is empty |
| M4 | 3e9507b | the page's description, Help's list and llms.txt say Escape, then Tab leaves |
| M5 | 672d5d3 | the reference and citation pickers and Go to File: a combobox (`aria-controls`, `aria-expanded`, `aria-activedescendant`) over a listbox of options, a polite count |
| M6, L6 | 88546da | `$$x^2$$` is a display, `\(x\)` and `\[x\]` close on `\)` and `\]`, `\$` and the other signs typed straight, `$` then a space a dollar sign, Esc keeps what the insert list held |
| M2 | 12c0f4d | a block from the `\` list goes after a heading it was typed in, is refused (said why) in another command's argument; `\begin{itemize}` with its `\item`, tabular with `{ll}` |
| L1 | 88beb8d | Ctrl+End after a display formula or a table that ends the text |
| L4 | 965acd5 | Tab over a selection: from a paragraph's start the paragraph indented a step (Shift+Tab out), inside the text the gap in its place; a heading's gap |
| L5 | 6d8d955 | `\o`, `\O`, `\quad`, `\qquad`, `\dots` are text; a raw command keeps its case; one letter matches names only |

Left: L2 (F2 on a selected formula opens it, kept as the coordinator accepted), L3 (Tab in a list
item that cannot change level still lets the focus visit the status bar for a moment), L7 (undo by
word, the same on base). M1 costs some of the queue's gain, since a space now ends each run: on
`dev/bench/long`, 62 characters 15 ms apart, the page is done 527 ms after the last key with the
queue and 891 ms without (3147 and 7312 at 4x CPU slowdown), on a machine shared with other runs.

## Verification of 2308408

Own worktree at 2308408 (main merged), `npm run build`, no TeX tree. I reran the first round's
scripts and added `v2.py` (the fixes), `eqbox.py`, `eqins.py`, `eqeq.py`, `eqfast.py` and
`price.py`, all in `/tmp/review-power-out/scripts/`.

**Verdict: fix first.** Two small changes, both in the equation field's switch to its LaTeX box
(N1 is new from H2's fix, N2 is now reached by every IME user). Everything else holds.

### The findings, one by one

| finding | result | evidence |
|---|---|---|
| H1 | fixed | F12 right after a picked `\ref`: caret stays (99 to 99) and `main.tex` downloads. Shift+Left over the ref, then F12: goes to the label (57), with no download. Shift+F5 comes back. |
| H2 | fixed | Japanese IME inside `\text{`: `x=1\text{日本}+y`. Dead key: `x=1\text{café}+y`. In an inline formula: `$x=1\text{日本}$`. See N1 and N2 for what the fix brings. |
| H3 | fixed | Enter twice in frame, center and multicols stays inside (`Inside text.\n\nNEW\n\n\end{frame}`). In theorem, proof and quote it leaves. |
| M1 | fixed | Edit menu Undo with letters waiting: the text stays whole, and Undo, Undo, Redo, Redo gives `2004h}. Qxyz Important` (correct). A paste goes after the letters (`QxyPASTE`). A system replacement read at the space: `teh` becomes `the`, because the space's keydown now writes the word first. |
| M2 | fixed | `\` figure or `begin{theorem}` in a heading goes after the heading. Nothing is written inside `\caption{}`. itemize gets `\item `, and tabular gets `{ll}` and a row. |
| M3 | fixed | Ctrl+P, empty box, Enter: prints. `p` Enter: opens part1.tex on the page. `pr` Enter: opens proofs.tex in the source pane. |
| M4 | fixed | `pages-how` ends with "Tab indents; Escape, then Tab, leaves." Help has the line. |
| M5 | fixed | The reference picker and Go to File are a combobox (`aria-controls`, `aria-expanded`, `aria-activedescendant`) over a listbox of options, with a polite live region. |
| M6 | fixed | `$$x^2$$` on a new paragraph gives `\[ x^2 \]`. `\(x\) y` gives `\(x\) y`; `\[x\] y` gives a display; `\$5 ok` gives `\$5 ok`; `a\\b` stays as typed. `\` then Esc writes nothing. |
| L6 | fixed | `a $ $ b` gives `a \$ \$ b`. |
| L1 | fixed | Ctrl+End goes after a closing equation and after a closing table. |
| L4 | fixed | Tab over a selection gives `he\quad{}X`. Tab in a heading gives `\section{He\quad Xad}`. |
| L5 | fixed | `\o` and `\quad` are written as text. |
| L2, L3, L7 | left, as stated | L3 is still there: focus visits a button, then comes back. |

- **Queue under real keys** at 6x CPU throttle: `Zebraaaaaaa cafeé worX end` (autorepeat,
  capitals, dead key, Backspace, AltGr), in order.
- **IME between waiting letters:** ` ab日本cd`.
- **Input to paint at a normal pace** on `dev/bench/long`: median 40 ms (base 48 ms).
- **Regression suites:** all pass.

  | suite | checks |
  |---|---|
  | power.py | 111 |
  | browser.py | 201 |
  | mathfield.py | 19 |
  | wordmath.py | 84 |
  | eqtab.py | 158 |
  | lists.py | 203 |
  | find.py | 114 |
  | outline.py | 103 |
  | view.py | 154 |
  | shortcuts.py | 82 |
  | agent.py | 142 |
  | ribbon.py | 195 |
  | ux.py | 326 |

### New

**N1 (Medium, from H2's fix): with a `\text{` or `\mathbb{` still open, Ctrl+Enter writes the
word "insertText" into the formula.**
- Where: `src/wordmath.js`, the H2 `beforeinput` listener (`toBox(e.data || '')`). It catches the
  field's own insertion for Ctrl+Enter (the display's new row).
- Repro (`eqins.py`): Alt+= on a new line, type `x=1\text{if`, then Ctrl+Enter. The box reads
  `x=1\text{ifinsertText}` and so does the source. `\mathbb{R` gives `\mathbb{RinsertText}`.
  Enter instead gives `\text{if}`, which is correct.
- Fix: take only trusted input from the person (`e.isTrusted`, no MathLive command in progress),
  or let a Ctrl, Alt or Meta chord end the argument first, as Enter does.

**N2 (Medium): after the switch to the LaTeX box in a display formula, Enter is a newline, and
the next sentence goes into the equation.**
- Where: `src/app.js`, the LaTeX box's keydown (`Enter && (!display || Ctrl)`).
- Repro (`eqbox.py`): Alt+= on a new line, `x=1\text{`, IME `日本`, `}+y`, then Enter, then
  "Next words."
  - The source becomes `x=1\text{日本}+y\n Next words.\n\end{equation}`, and the popover is still
    open.
  - The same keys without an IME close on Enter: `\end{equation} Next words.`
  - `x=\begin{aligned}…` lands in the same place: that part predates this round.
  - The field's hint says "Enter done"; once the box takes over, Enter means something else.
- Fix: a box opened by the switch (`toLatex`) keeps the field's keys. Enter is done and
  Ctrl+Enter a new row, as the hint says.

### Low, new

- Ctrl+P, typing `print`, Enter does nothing: the Print row shows only while the box is empty.
- Esc in the insert list writes what was typed as it stands: `\sec`, then Esc, gives `z \sec w`,
  math-only in prose, a TeX error. Enter on the same text opens a formula; Esc should apply the
  same rule, or write nothing.
- Not this branch's, and the same on base: a price, `costs $5 each`, becomes `$5each$`. `$$`, which
  was a dollar sign, is now a display (`pay $$ now` gives `\[ now \]`), with `$` then a space as
  the new dollar sign. That is Overleaf's behaviour, but people who learned the old hint lose it.

## Fixes after the verification of 2308408 (author)

| finding | commit | what changed |
|---|---|---|
| N1 | 0a411ee | the field's input listener takes trusted input only; a Ctrl, Alt or Meta chord ends an open `\text{` or `\mathbb{` first, as Enter does; `\in\mathbb{R}` typed in one go starts the second command |
| N2 | 0a411ee | a LaTeX box the field handed over to keeps the field's keys in a display: Enter done, Ctrl+Enter a new row (the display made align, or `\\` inside an environment the box holds) |
| lows | 0a411ee | Go to File finds Print by its name from three letters, after the files; Esc in the insert list writes `\textbackslash{}sec`, never a command; `$5 ` is a price (`\$5`) |
| `$$` | e144b5f | `$$` writes `\$` at once; a letter or a backslash next takes it back and opens a display |
| live cases | ed4f37a, f0f20be | keyless characters go through the field's rules; the caret after a formula ending its line stays in that line; a display never inside a command's argument; after a display, a new line in its paragraph, a second Enter a new paragraph, no extra blank lines |

Each with checks in `test/power.py` (147 in all, `accept` the live cases typed as keys and as
insertText) that fail on the commit before.
