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

## Verification of eb14945

Reviewer: Claude, hostile, in a fresh worktree at eb14945 (`origin/power-keys`), `npm run build`, no
TeX tree. Scripts in `/tmp/review-power-out/scripts/` (`v3.py <part>`, plus the first rounds'
`atk.py`, `v2.py`, `eqime*.py`), each run with `/tmp/rk-heavy`.

**Verdict: fix first.** The price rule of e144b5f and 0a411ee (`$5 ` writes `\$5`) also catches
formulas that open with a number and a space, which math papers write all the time. And `$$` in a
footnote, caption or `\textbf{}` drops the first key. Both are small fixes; the rest holds.

### Fix first

**V1 (High, from the price rule): a formula that opens with a number and a space becomes prose.**
- Where: `src/app.js:3430` (`priceKey`), which fires on the space after digits.
- Repro (`v3.py price`, typed key by key in a paragraph):

  | typed | source written |
  |---|---|
  | `the $1 - \alpha$ level` | `the \$1 - \textbackslash{}alpha\$ level` |
  | `with $0 < x < 1$ ok` | `with \$0 < x < 1\$ ok` |
  | `and $2 \times 3$ ok` | `and \$2 \textbackslash{}times 3\$ ok` |

  The `\` of `\alpha` then opened the insert list, which took the keys up to Esc. In pdfLaTeX's OT1
  encoding a `<` in prose prints as ¡.
- What still works: `$10^3$` and `$1+2$` (no space), prices (`costs $5 each.` gives `\$5 each.`,
  `$5.50,` gives `\$5.50,`).
- Fix: decide at the key after the space. A letter makes it a price; a sign, a backslash, a digit
  or `$` keeps the formula, with the space in it.

**V2 (Medium-High, from e144b5f with ed4f37a): `$$x^2$$` inside a command's argument loses its
first key and writes a stray dollar sign.**
- Where: `src/app.js:3513` (`dollarPairTakes`). `newDisplayMath` makes a formula in the line there
  (`blockBase` false), which has no `#pop-tex`, so `if (!pop || !ta) return true;` eats the key.
- Repro (`v3.py ctx`): ` $$x^2$$ z` typed in `\footnote{Note here}` gives
  `\footnote{Note here $^2$\$ z.}`. In `\caption{Cap text}` and `\textbf{strong words}` the result
  is the same.
- Fix: there, put the key into the line formula's `#pop-newtex` and let its closing `$$` end it
  (`swallowDollar`), or keep the `\$` and type the key after it.

### Medium

**V3: `$$x^2$$` in a table cell writes a display, and its closing `$$` leaves a `\$`.**
- Repro (`v3.py ctx`): in an `l` column, `Cell a` gives `Cell a \n\[x^2\]\$ z\n & Cell b`.
- A display in a `tabular` `l`, `c` or `r` cell is a TeX error (LR mode), and the second closing
  `$` became `\$`.
- Fix: a table cell (not a `p{}`, `m{}` or `X` column) takes a formula in the line, as an argument
  does.

### Low

- **V4:** after `$$…$$` in the middle of a paragraph, the display's trailing line break stays
  between the words typed after it and the rest of the paragraph. `abc $$x^2$$ end` before the
  paragraph's `.` gives `\] end\n.`, which prints "end ." with a stray space. The list item case is
  the same. `src/app.js:3541` (`tail`): with the line closed by `$$`, write no line break after
  `\]`.
- **V5:** Ctrl+Enter with `\text{if` still open ends the argument and makes the display an `align`
  (`\begin{align} x=1\text{if} \end{align}`), but adds no row. "insertText" is gone (N1 fixed).
- **V6:** a paste is inconsistent. Plain text `costs $5 and $x^2$ here` pastes as text
  (`\$5 and \$x\textasciicircum{}2\$`), but `$$x$$` pastes as a display.

### Held up

- **`$$`:**
  - `pay $$5 now` gives `\$5 now`; `a $$ b` gives `a \$ b`.
  - `so $$\alpha$$ end` and `abc $$x^2$$ end` give a display.
  - Undo across the conversion steps back through the typing, the formula, the display and the
    start (four Undos); Redo gives it all back. No `\$` step is left in the chain.
- **Displays in context:**
  - Heading: goes after the heading.
  - List item and minipage: inside, valid.
  - A LaTeX paragraph (`% rikuy: latex`): `$$y$$` is written raw.
- **After a display:**
  - Enter then `where x`: `\end{equation}\nwhere x`, before `\end{document}`.
  - Enter, Enter: a new paragraph.
  - Esc, then typing: the same line.
  - Closing and doing nothing, or clicking away: no stray lines.
- **IME and dead keys through the field:**
  - Dead `^` then `^2` (composition): `x^2+y`.
  - IME `α` in the field: `x+\alpha+1`.
  - `\text{` + IME `日本`, then Enter, then words: `x=1\text{日本}+y`, the words after
    `\end{equation}` (N2 fixed).
  - A dead `^` in the inline box: `$x^2$`.
- **Insert list and equation field:**
  - Empty Alt+= then Esc: no change, no undo step.
  - `\` `equation` Enter: an equation.
  - `\sec` then Esc: `\textbackslash{}sec` (valid).
- **Caret after a heading ending in a formula:** End, Enter makes a new paragraph after the
  heading.
- **Earlier rounds, rechecked:** the queue cases (the first Edit menu Undo now gives the text back exactly; Redo, paste, IME, real keys), F12, Ctrl+P (`print` now finds Print)
  and Enter twice, as in the verification of 2308408.
- **Suites:** all pass.

  | suite | checks |
  |---|---|
  | power.py | 147 |
  | browser.py | 201 |
  | mathfield.py | 19 |
  | wordmath.py | 84 |
  | eqtab.py | 158 |
  | eqextras.py | 18 |
  | lists.py | 203 |
  | find.py | 114 |
  | view.py | 154 |
  | shortcuts.py | 82 |
  | styles.py | 410 |
  | page.py | 129 |
  | agent.py | 142 |

Not tested: `$$` typed in the source pane. CodeMirror there has no page handlers, so it is written
as typed.

## Fixes after the verification of eb14945 (author)

| finding | commit | what changed |
|---|---|---|
| CI | 3a9b8da, 8ab19a9 | dictation into `\text{` as the field opens (CI at 5994e31: `\text{if}\}`): two races with MathLive acting a task late. Its keyboard's focus 60 ms after the field's no longer takes the focus back from the LaTeX box after a hand over; the field's input event, sent after a timeout, no longer writes over the box, which takes the field's keys first (`pull`) |
| V5 | b4e6e77 | Ctrl+Enter (and Shift+Enter) with `\text{` open ends it, then adds the row; every whole value set in the field is read as math (after `\text{…}` MathLive read it as text: the align's LaTeX went in as words) |
| V1 | 11f98ac | `$5` and a space wait for the next key: a letter makes the price, a sign, `<`, `=`, a backslash, a digit, a brace, `^`, `_`, `$` or Enter keeps the formula; Backspace takes the space back |
| V2, V3, V4 | c9d7aa8 | `$$` where a display cannot go (a command's braces, an `l`, `c` or `r` cell) opens a formula in the line with the key in it, closed by `$$` as one; a `$$` display mid line has no line break after `\]`, and the caret stays in the line however it closes |
| V6 | 294ffe7 | pasted text: a `$..$` pair taken for money gave its closing `$` away from the next pair (`$x^2$` was lost to `$5 and $`); `$$..$$` is `$..$` where a display cannot go. The rules, typed and pasted, in `docs/handoff/SHORTCUTS.md` (Equations) |

3a9b8da and b4e6e77 were staged with zero context lines and put three hunks in the wrong place
(a syntax error in `src/app.js`, an IndentationError in `test/power.py`); 8ab19a9 puts them back,
without rewriting history: skip the two when bisecting. Each finding has checks in
`test/power.py` (173 in all; new parts `pairs` and `paste`) that fail on 5994e31's build.

## Verification of 5446132

Reviewer: Claude, hostile, in a fresh worktree at 5446132, `npm run build`, no TeX tree. I reran
`v3.py` (as `v3w.py`) and wrote `v4.py` and `v4b.py` for this round's attacks, all in
`/tmp/review-power-out/scripts/` and run with `/tmp/rk-heavy`.

**Verdict: fix first, one small thing.** V1, V4, V5 and V6 hold, and V2 and V3 hold where the
first round found them. But `$$x^2$$` still writes a display inside `\href`'s text, and it leaves
a stray `\$` after every display in a `p{}` or `X` cell or a `\parbox`. That is the bug class
V2/V3 named, in places this round did not cover. The two Medium race findings can follow.

### Fix first

**W1 (Medium-High, V2/V3 not covered): `$$…$$` in a `p{}` or `X` cell, a `\parbox`, or `\href`'s
text leaves `\$` after the display, and in `\href` writes the display itself.**
- Repro (`v4.py v23`, ` $$x^2$$ z` typed key by key):

  | where | source written |
  |---|---|
  | `\href{https://x.org}{the link text}` | `{the link \n\[x^2\]\$ z text}` (a display in link text: TeX error) |
  | `tabularx` `X` column | `Cell xcol \n\[x^2\]\$ z` |
  | `p{3cm}` column | `Cell para \n\[x^2\]\$ z` |
  | `\parbox{4cm}{…}` | `{parbox \n\[x^2\]\$ z words}` |

  In the last three the display itself is valid, but the second closing `$` prints as a dollar
  sign. `l` and `c` cells, footnotes, captions and `\textbf{}` correctly get `$x^2$ z`.
- Fix: the second `$` of the closing pair must be swallowed for a display written in one line
  (`\[x^2\]`), as it is for one on its own lines. `\href`'s text, like every argument, takes a
  formula in the line.

### Medium (may follow)

**W2: a keyless insert of several characters into the equation field goes through its rules
wrongly.**
- Repro (`v4b.py`, also at 4x CPU in `v4.py race`): Alt+= on a new line, then one
  `Input.insertText` of `x=1\text{if }+y` (dictation, a phone keyboard's commit). The result is
  `x=1\text{i}f\}+y`.
- The same characters inserted one at a time give `x=1\text{if }+y`, which is the case
  `power.py` covers.

**W3: clicking into the field after the hand-over to the LaTeX box loses what the box held.**
- Repro (`v4.py race`, at 1x and 4x): type `x=\begin{`, which hands over to the box; click the
  field; type `aligned}a&=b\end{aligned}`.
- The box ends `x=aligned\}a\&=b\end{aligned}`: `\begin{` is gone, and `}` and `&` are escaped.
- The field's value replaced the box's text, which the field could not hold.

**W4: a keyless insert of words into a `$` field just opened is lost.**
- Repro (`v4b.py`): after ` see $`, one insert of `5 each` or `ab cd`, then `$ ok`. The result is
  `see \$ \$ ok`: the words are gone.
- Single tokens work (`x^2` gives `$x^2$`, `5` gives `$5$`). This is the iOS predictive bar and
  dictation case.

### Low

- **W5:** after `$5 `, a key that comes by an input method or a Mac dead key makes the price but
  drops the waiting space: `\$5日本`, `\$5é lan`. A typed letter keeps it (`\$5 each`).
- **W6:** `$2 x$` (a coefficient, a space, a variable) is taken for a price: `\$2 x\$`. This is
  the price rule's remaining ambiguity.
- **W7:** `$5% now` and `$5\% now` give `$5\%now$`: the words after it go into the formula with
  their spaces lost. That is the old `$5 each` problem for a percentage. A space after `%` or `\%`
  could decide as the space after digits does.

### V6's rule: sound

Pasted text keeps `$…$` as math when its inside looks mathematical, and money otherwise. A pair
taken for money gives its closing `$` to the next pair, and Ctrl+Shift+V escapes everything. Mixed
paragraphs come out right:
- `It costs $5 and $10, while $x^2 + y$ holds and $$z = 1$$ too.` gives
  `\$5 and \$10, while $x^2 + y$ holds and \[z = 1\] too`.
- `From $5 to $x$`, `Pay $3 now; $a+b$ later, $2 more.`, `We need $n$ items at $4 each.` and
  `Value $1,000 vs $\alpha$.` are all right.
- Hostile money: `Total $5 + $3 = $8 today.`, `Pay $5 x 3 = $15 now.` and `Ranges $5-$10 and
  $20-$30.` all stay money.
- Ctrl+Shift+V of `costs $5 and $x^2$` gives `\$5 and \$x\textasciicircum{}2\$`.

Chat-pasted math staying math is right for this owner, and the escape key exists. Only W4's typed
counterpart (keyless words) loses text; paste does not.

### Held up

- **V1:**
  - `$1 - \alpha$`, `$0 < x < 1$`, `$2 \times 3$` and `$1 = 1$` stay formulas.
  - `costs $5 each and $x^2$ here` gives `\$5 each and $x^2$ here`; `pay $5 for $2x + 1$` gives
    `\$5 for $2x+1$`.
  - `$5$` alone is a formula. `$5, then $y$` and `$5. Then` are prices.
  - Space, Backspace, `x`: `$5x$`. Space, Backspace, space, `each`: a price.
  - Space, Enter or Esc: `$5$`. Shift and a capital: `\$5 Each`.
- **V2 and V3 as first found:** a footnote, a caption and `\textbf{}` give `$x^2$ z`; `l`/`c`
  cells give `$x^2$ z`; a minipage and a list item get a valid display.
- **V4:** `abc \[x^2\] end.`, with no stray break, after Esc too.
- **V5:** Ctrl+Enter with `\text{if` open adds the row (`x=1\text{if} \\ &`).
- **Whole `v3.py` rerun:**
  - `$$`, its Undo chain and Redo.
  - Enter and Esc after a display at the document's end.
  - IME and dead keys through the field (`x^2`, `\alpha`, `\text{日本}`).
  - N1 and N2.
  - Empty Alt+= leaves no undo step; `\equation`, `\sec` then Esc, a heading ending in a formula.
  - `$$` in a LaTeX paragraph.
- **Suites:** all pass.

  | suite | checks |
  |---|---|
  | power.py | 173 |
  | browser.py | 201 |
  | mathfield.py | 19 |
  | paste.py | 25 |
  | eqtab.py | 158 |

## Fixes after the verification of 5446132 (author)

| finding | commit | what changed |
|---|---|---|
| W1 | 9f474ff | `blockBase` reads past a command's earlier arguments: `\href`'s text, `\parbox` and `\colorbox` take a formula in the line; any formula opened by `$$` takes its second closing `$`, a display in a `p{}` or `X` cell drawn in the line too |
| W2, W3 | c3a4440 | one keyless insert goes to the LaTeX box from where `\text{` or `\begin{` handed over, as it came, and on the page from where the formula closed; while the box holds what the field cannot show, a press on the field leaves the keys in the box (a toast says why) |
| W4 to W7 | e5ecf60 | the price rule decides at the end of the word after the space: a space or a mark, Enter, Esc or a click away make the price, a `$` right after the word the formula (`$2 x$`); `$5%` and `$5\%` wait as the number does; words dictated into a `$` just opened are kept; an input method's or a dead key's text after `$5 ` is the price's word, the space kept |
| docs | 379ae81 | `docs/handoff/SHORTCUTS.md`'s dollar rules |
| main | cd236e9 | origin/main merged (PR 88, 90, 97); `src/app.js` and `PLAN.md` conflicts kept both sides |

Each with checks in `test/power.py` (187 in all) that fail on 14522ac's build. Staged as whole
files built from the intended text (no zero context hunks). On the merged build: power.py 187,
browser.py 201, mathfield.py 19, paste.py 25, eqtab.py 159 (with `dist/tex`), wordmath.py 84,
tabs.py 156, ux.py focus_rules dialogs 42, `npm test` green.


## Verification of befd04a

Reviewer: Claude, hostile, time-boxed, in a fresh worktree at befd04a, `npm run build`. I reran
`v4.py` and `v4b.py` and wrote `v5.py`, `v5b.py` and `v5c.py` (`/tmp/review-power-out/scripts/`).

**Verdict: fix first, one regression.** Backspace can no longer delete the last character of a
formula typed with `$`. W1 to W7 are fixed.

### Fix first

**X1 (Medium-High, regression): Backspace stops at the last character of a `$` formula.**
- Repro (`v5c.py`): ` costs $ab+1`, then Backspace four times. The field (`#pop-field`, which has
  the focus) goes `ab+`, `ab`, `a`, `a`; Esc then writes `$a$`.
- `$5` and `$x` cannot be erased by Backspace at all. On a954bc6 the same keys empty the formula.
- Backspacing through a pending price hits the same wall: `$5 each` goes `5eac`, `5ea`, `5e`, `5`,
  then stops; Esc writes `$5$`.
- Word's Backspace in an equation deletes its last character and then the equation.

### Low

- **X2, the visible change:** while `$5 each` is typed, the formula box shows `5each` and the page
  draws `$5each$` in math italic until the space. The hint still reads "Enter or $ to insert. $ at
  once is a dollar sign, or a display when a letter follows." Nothing says it may become a price,
  so for four keys a Word user sees their price as a strange formula, which then snaps to
  `\$5 each`. Not blocking, but worth a look:
  - show the waiting word as text, with its space (`$5 each`, dimmed, "a price at the next space or
    mark; $ keeps a formula");
  - or keep the field's preview at `5` until it is decided.
- **X3:** browser.py's first run under load failed 12 checks. The cascade began at "math popover
  edits source live" (the edit lost `\gamma`). A rerun passed 201 of 201. It looks like the late
  focus race in `attachField`, which may still show in CI when the machine is busy.

### W1 to W7: fixed

| finding | result |
|---|---|
| W1 | `\href` text and `\parbox` give `$x^2$ z`. `X` and `p{}` cells give `\[x^2\] z` with no stray `\$`. `l`/`c` cells give `$x^2$`. |
| W2 | One keyless `x=1\text{if }+y` gives `x=1\text{if }+y` at 1x and 4x CPU. |
| W3 | Clicking the field after the hand-over keeps `x=\begin{aligned}a&=b\end{aligned}` in the box. |
| W4 | Keyless `5 each` followed by Esc gives `\$5 each`. With a `$` right after, the same insert gives `$5each$`, as typed keys would. |
| W5 | `\$5 日本lan`, `\$5 élan`: the space is kept. |
| W6 | `$2 x$` gives `$2x$`. `$5 x$` gives `$5x$`. `$5 x y` then Esc, or a space, gives `\$5 x y`. |
| W7 | `$5\% now` and `$5% now` give `\$5\% now`. |

### Also held

- **Undo across the price conversion** of `costs $5 each and more`:
  1. ` and more` is taken back;
  2. then `\$5 each` goes in one step;
  3. then the start comes back.
  
  Redo restores the whole sentence.
- **Once it is a price,** Backspace on the page deletes normally (`\$5 e`).
- **The v4 set:**
  - V1 math stays math.
  - V4: no stray break after `\]`.
  - V6 paste mixes are right, money with arithmetic included.
- **Suites:** power.py 187/187. browser.py 201/201 on rerun; the first run is X3.
