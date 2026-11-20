# Hostile review: word-shortcuts (PR 80), /home/claude/wt-keys at 17c6f92

## Verdict

**Changes requested.** Two high findings: Move Row can break a table so it no longer compiles, and F2/Shift+F2 leave a hidden mode that later swallows Enter or moves text. Five medium findings. Most fixes are a few lines each. The key matching, the field guards and the speed all held up.

The probe scripts and their outputs are in `/tmp/review-keys-out/`: `mr.mjs`, `mr2.mjs`, `scan.mjs`, `sim.mjs`, `perf.mjs`, `probe.py` to `probe5.py`, and `probe.json`. The worktree was not changed.

## High

**H1. Move Row Up/Down adds a column to a row whose last cells are empty.** At `src/table.js:1285`, `moveRow` swaps `[cs, rowEnd)`. `rowEnd` (`src/table.js:643`) stops after the last *non-empty* cell, so the empty cells' `&` stay where they were and are joined to the other row.
- Repro (`probe.py` A, and the node probe `mr2.mjs`): take `\begin{tabular}{ll}` with the rows `alpha & \\` and `gamma & delta \\`. Put the caret in "alpha" and press Alt+Shift+Down. The rows become `gamma & delta & \\` and `alpha \\`, which is 3 cells in an `ll` table, so TeX stops with "Extra alignment tab". With `lll` and `a & & \\`, the moved row gets 5 cells.
- Fix: swap the whole cell span, from `A.cs` to the end of the row's last cell including empty ones (the trimmed `sepS ?? e`). Add a `test/table.test.mjs` case that checks every row keeps its cell count.

**H2. F2 and Shift+F2 arm a mode that never ends.** In `src/cmd/typing.js:195-202`, only Escape or Enter clears `app.moveText`. Clicks, typing and time do not.
- Repro (`probe.py` F): select "Second" and press F2. Click into the other paragraph, type " typed", then press Enter. Enter is swallowed: no paragraph break, and a toast says "The text changed while it was dragged". `moveText` was still armed 9 s later, after the 8 s toast had gone.
- If nothing was typed, any Enter pressed later moves the old selection away from its place, out of sight.
- Fix: end the mode on any edit (the commit hook) and on any key other than navigation keys, Shift, Enter and Escape. When `moveTextDrop` fails, let Enter through. Show the waiting state for as long as it lasts, not in an 8 s toast.

## Medium

**M1. The Spike puts a paragraph break inside a command's argument.** The `inArg` join at `src/cmd/typing.js:157` only covers the joins *between* pieces. A piece cut across paragraphs keeps its `\n\n`.
- Repro (`probe.py` B): cut "two three. / Four five" with Ctrl+F3, put the caret inside `\section{Opening}` and press Ctrl+Shift+F3. The result is `\section{Opentwo three.\n\nFour fiveing}`, and TeX stops with "Paragraph ended before \@sect was complete".
- Fix: when `inArg`, replace blank lines inside each piece with a space, or refuse with a message.

**M2. On a Mac, Option+Shift+O (which types Ø) is swallowed everywhere on the page.** `src/cmd/refs.js:93` adds `Alt+Shift+O` with no `mac` rule. On a Mac, matching goes by `e.code`, and `lookup` calls `preventDefault` even when the command cannot run.
- Repro (`probe3.py`): a keydown with key 'Ø', code KeyO, Option and Shift in a paragraph gives defaultPrevented = true. In a heading it opens the Add Text menu instead of typing Ø.
- The same was already true of `Alt+Shift+X` and `Alt+Shift+I` (˛ and ˆ) before this branch.
- Fix: `mac: { 'Alt+Shift+O': 'Control+Shift+O' }` (or `false`), the same for X and I. Add a `keys.test.mjs` rule: no Mac binding may be Option plus a letter, digit or sign without Cmd or Control (`scan.mjs optonly` lists them).

**M3. On French AZERTY, Ctrl+1 and Ctrl+4 arm accent keys.** At `src/keys.js:80`, a sign chord that names Shift matches with or without Shift. On AZERTY the 1 key types `&` and the 4 key types `'` without Shift, so Ctrl+1 matches `Ctrl+Shift+&` (Ligature) and Ctrl+4 matches `Ctrl+'` (Acute).
- Repro (`probe3.py`): a keydown with key '&', code Digit1, Ctrl, then typing "a", writes "æ".
- French Word's Ctrl+1 (the key, not the character) is single spacing, so a French user pressing it gets æ on the next "a". `sim.mjs` lists every layout case: US, UK, DE, FR, ES.
- Fix: never let a sign chord match a Digit key pressed without Shift. Better, match `Ctrl+<digit>` by `e.code` when no Shift or AltGr is down, as Word matches by virtual key.

**M4. Hanging Indent on, then off, does not give the source back.** In `src/cmd/para.js:499-503`, "off" always writes `'first'`.
- Repro (`probe5.py`): `\noindent Alpha…` becomes `\noindent\hangindent=1cm Alpha…`, then `Alpha…`. The `\noindent` is lost and the paragraph is now indented.
- A hand-written `\hangindent=2em\hangafter=1` is not seen as "on". The first press adds a second `\hangindent`, and the second press deletes the user's own.
- Fix: "off" goes back to the special the paragraph had (none when `\noindent` stands before the hang). Read an existing `\hangindent` as on. Add a toggle-twice check to `shortcuts.py`.

**M5. Alt+X after a LaTeX accent writes nonsense.** The fallback at `src/cmd/typing.js:50-53` takes the last source character.
- Repro (node probe and `probe.py` C): `caf\'e` with the caret after é becomes `caf\'0065`, which TeX prints as an accented 0 followed by "065". `x \"o` gives `\"006F`. Word would give 00E9.
- Fix: recognise an accent macro ending at the caret (`\'e`, `{\'e}`, `\c{c}` and the like), write the composed character's code over the whole macro, or refuse.

## Low

- **L1. Go Back skips edits close to each other.** `SPOT_NEAR = 40` (`src/cmd/find.js:1254`) treats edits in short neighbouring paragraphs as one place. Repro (`probe.py` E): after edits at "GammaX", "BetaY" and the start of Alpha, three presses give GammaX, Alpha, GammaX, and BetaY is never visited. Use exact places within one paragraph.
- **L2. The Help text for Ctrl+W is wrong in a browser tab.** At `src/keys.js:206` it says "With the source or the PDF open, Ctrl+W closes that pane". Chrome and Firefox keep Ctrl+W in a tab and never deliver it, so the tab closes. It is only true in the installed app. Say so.
- **L3. An armed accent survives a mouse click.** Ctrl+' in Alpha, a click into Beta and "e" write é in Beta. Clear `accentNext` on pointerdown or when the selection changes.
- **L4. The Spike does not fix spacing.** Cutting leaves double spaces ("One  six.", "z$  and"), and inserting glues words ("holdmore"). `moveSource`'s smart spacing is not used.
- **L5. SHORTCUTS.md misses Ctrl+Alt+I.** It says "every shortcut on Microsoft's page", but Ctrl+Alt+I ("Switch to print preview") is on the page and not in the doc. Ctrl+Alt+Y and Ctrl+Shift+P are not on the current page; they are older Word keys, and the doc should say so. A Word for Mac list (hotkeysworld) gives Repeat Find as Shift+F4 or ⌘⇧F4, not ⌘G.
- **L6. F5 and Shift+F5 no longer reload with the caret on the page.** They open Go To and Go Back, as in Word, but people coming from the browser expect a reload. Help's kept-keys list could say so.
- **L7. F8 and sentences differ from Word.** The first F8 selects the word, where Word's first F8 only turns on extend mode. The sentence step splits after "Dr." (Intl.Segmenter): "Dr. Smith at noon." selects "Smith at noon.".
- **L8. Help's list on a phone.** At 390 px the key column takes about 45 % of the width.
- **L9. Untested on a real Mac.** Chromium's reserved-key list (`IsReservedCommandOrKey`: close tab or window, new tab, new or incognito window, restore tab, next or previous tab, exit) does not include ⌘1–9, so ⌘8 and ⌘1, ⌘2, ⌘5 should reach the page in Chrome. This is recalled from Chromium's source, not checked: the source page I fetched did not answer it. I could not check Safari. ⌃Space is macOS's "previous input source" when a Mac has more than one input source.

## What held up

- **Fields.** In the equation field, none of 11 new keys tried (Ctrl+', Alt+X, F8, Ctrl+Shift+P, Alt+Shift+1, Ctrl+F3, Shift+F5, F2, Ctrl+Alt+Y, Alt+Home, Ctrl+/) changed the source or armed anything; the field sits outside `#pages`. Same in the search box (F8, F2, Ctrl+', Alt+X, F7). From the source pane, Ctrl+Alt+P and N, Shift+F12, F1 and Ctrl+F2 do what the doc says.
- **AltGr.** Windows AltGr (Ctrl+Alt with AltGraph) is refused for every Ctrl+Alt chord. In the US, UK, DE, FR and ES simulations, no character typed with AltGr is caught. The input method guard (`isComposing` or keyCode 229) holds, and an armed accent is cleared by 'Process'.
- **Move Row on hand-written tables.** Rows separated by `\hline`, rows with `\multicolumn`, `\rowcolor` or a comment, rows ending `\\[4pt]`, and a last row with no `\\` all come back byte for byte when moved down and up again. Rows with `\multirow` are refused.
- **Alt+X round trips.** 😀 ↔ 1F600 and U+1F600 → 😀 work. e followed by U+0301 gives 0301, which goes back. `\%` gives 0025.
- **One step, one undo.** The Spike's cut and its insert are one step each, and one undo restores the source. Ctrl+1, Ctrl+2 and Ctrl+5 are one step each and undo cleanly.
- **Speed.** `page.py long_document` passes all 6 checks: 27 ms for every command's when and on on 3000 paragraphs (the limit is 40), none over 5 ms. A key lookup takes 0.18 ms per keydown with 148 bindings (node).
- **Unit tests.** keys, typing, table and commands all pass.
- **SHORTCUTS.md, Windows.** About 45 rows checked against Microsoft's page: Alt+Shift+O, P, A and 1–9, Alt+Shift+< and >, Alt+X, Shift+F5, Ctrl+Alt+Z, F8, F2 and Shift+F2, Ctrl+F3, Alt+F3, Ctrl+Alt+C and V, the keypad dashes, ¿ ¡, Ctrl+Shift+8, the table keys, Alt+Num 5, Ctrl+Alt+D and M, Alt+F7, Ctrl+F9, Alt+F9, Ctrl+Alt+P and N, Shift+F1, Ctrl+F2, the F12 family, F6 and Ctrl+F6, F5, Ctrl+Shift+F5, Ctrl+T and the accent keys. All match apart from L5.
- **SHORTCUTS.md, Mac.** Microsoft's macOS tab could not be fetched. Against a third-party Word for Mac list, these rows match: ⌥⌘G, ⌥⌘E, ⌥⌘A, ⌥⌘L, ⌥⌘R, ⌘⌃V, ⌃⇧P, ⌃⇧M and ⌘⇧M, ⌃⇧D, ⌃⇧T, ⌃⇧A, ⌥F7, ⌥F9, ⌘F3 and ⌘⇧F3, ⌘F9, ⌘⇧F5, ⌃Home.
- **Help on screen.** The kept-keys list is readable at 1366 px dark and at 390 px.

## Verification of 9848f49

**Verdict: merge.** Every high and medium finding is fixed and I re-ran its repro. The new Save holds up under the attacks I tried. The four points left are low and none blocks the merge.

I rebuilt `dist` (not committed). The probe scripts are `/tmp/review-keys-out/verify.py` and `guest.py`; the earlier ones were re-run as well.

### The review's findings

- **H1 (Move Row, empty cells): fixed.** In node, the rows keep their cell counts: [2,2], [3,3], [2,2]. All 8 hand-written table cases still round trip. In the page, `alpha & \\` moves down whole.
- **H2 (F2 waiting): fixed.**
  - A message with Cancel stays on screen while F2 waits.
  - A click ends the wait.
  - Typing ends it: "x" replaces the selection, and the Enter that follows is a plain new paragraph.
  - Arrows followed by Enter still move the text.
- **M1 (Spike into a heading): fixed.** `\section{Open two three. Four five ing}` compiles, and a piece put into `\textbf{…}` is flattened the same way. A piece holding a list is refused inside an argument with a plain message, and the Spike keeps it.
- **L4 (Spike spacing): fixed.** A cut leaves "One six.", with one space.
- **M2 (Mac Option+Shift+O, X, I): fixed.** They are no longer swallowed, and `scan.mjs optonly` finds no Option-only character chord left.
- **M3 (AZERTY Ctrl+1): fixed.** Ctrl+1 no longer arms an accent: "a" types "a".
- **M4 (Hanging Indent): fixed.**
  - `\noindent` survives on then off: the source comes back byte for byte.
  - A plain paragraph round trips.
  - A hand-written `\hangindent=2em\hangafter=1` is now read as on, so the first press removes it. That is how a toggle should behave.
- **M5 (Alt+X after an accent macro): fixed.** `caf\'e` → `caf00E9` → `café`. `\"o`, `{\'e}`, `\c{c}`, `\'{e}`, `\ss`, `\'\i` and `\~n` each give their character's code.
- **Low findings: fixed.**
  - L1: Go Back visits BetaY, then GammaX, then the insert, then wraps round.
  - L3: a click clears an armed accent.
  - L7: F8 goes extend mode, then the word, the sentence ("We met Dr. Smith at noon."), the paragraph.
  - L2 and L5 to L8: wording, Ctrl+Alt+I and the phone layout are done as asked.
- **Unit tests pass:** keys 21, typing 10, table 47, commands 13 groups.

### Attacks on the new Save

- **Where Ctrl+S works.** On the page, in the Find and Replace dialog's field, in the source pane and in the equation field, it says "Saved in this browser. A copy on your computer: Save As (F12)" and downloads nothing. Shift+F12 does the same.
- **F12.** With the caret on the page it downloads `main.tex`. In the search box or the source pane it downloads nothing; a real browser opens its developer tools there, as Help says.
- **Storage full.** I made IndexedDB `put`/`add` and `localStorage.setItem` throw. The message on screen at 50 ms and at 1.5 s is the failure warning, and the status bar says "Not kept in this browser. Save the .tex."
- **Offline.** Ctrl+S says "Saved in this browser", which is true: IndexedDB works offline.
- **A `#tex=` guest document.** It opens as its own `main.tex`. Ctrl+S says "Saved", and the edit is still there after a reload.

### Left, all low

1. `saveHere` shows "Saved" before the write finishes; it does not wait for it (`src/cmd/file.js`). The first failure's warning replaces that message, as seen above. But if the failure warning has already been given once (`saveWarned`) and storage then fails, "Saved" may stay on screen. Fix: await `persist()`'s result before showing a message.
2. Ctrl+S in the open equation field says "Saved" while the formula being edited is not yet in the source. Fix: commit the field first, or say so.
3. Inserting the Spike in the middle of a word adds a space on each side ("Open two three. Four five ing"). Word inserts it as it is.
4. Already on main, not caused by this branch: cutting a selection that spans a list (Ctrl+X, or Ctrl+F3) leaves an empty `\begin{itemize}\item \end{itemize}`, while the cut keeps the whole environment. Inserting it later gives two lists. Worth a separate task.
