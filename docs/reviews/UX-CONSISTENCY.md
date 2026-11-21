# Review: PR 90, ux-consistency-2 at de8eb26

Built `dist/` in /home/claude/wt-ux-ver (`RIKUY_NO_WORD=1`, no TeX tree). To tell regressions apart from older
problems, 0a6ef7b (PR 79's last state) was built in /home/claude/wt-ux-base. Probes are
/tmp/ux-ver-out/pr90/probeM.py to probeQ.py, logs M.log, M2.log, N.log, ux.log, screenshots
/tmp/ux-ver-out/pr90/shots/. Each repro uses a real mouse caret, Playwright keys, or touch where it says so.

## Verdict

**Fix first, one small regression.** Opening a dialog from inside another dialog by the keys now sends the
focus, on Esc, to a ribbon button the user never touched, and the next keys are lost. 0a6ef7b gave the caret
back. Everything else in the PR holds or is LOW. `ux.py`: 447 passed, 0 failed (two fewer than the PR's 449,
the ones that need TeX).

## MEDIUM

**M1. Regression: a dialog opened from a dialog by keys gives the focus to the ribbon, not back to the caret.**
- Repro, at 1366 px:
  - Put the caret in "Sec|ond paragraph".
  - Press Shift+F10, then Enter on "Paragraph Settings…". Or open Paragraph Settings by its command; the result
    is the same.
  - Tab to "Tabs…" and press Enter.
  - Press Esc, then type Z.
- What happens: the focus is on the ribbon's Paragraph Settings launcher and Z goes nowhere.
- On 0a6ef7b: the focus is on the page and Z lands at "Sec|ond" (probeP.py).
- By mouse it still works.
- Cause (337a03e): Tabs… replaces the Paragraph dialog. The Tabs dialog's opener is then the Tabs… button,
  which is gone, and because the last action was a key, the close falls back to the command's ribbon control.
- Fix: a dialog opened from inside another dialog takes over that dialog's return target (the page and caret,
  or its own opener), rather than looking for one again. Test: `ux.py dialogs`, Paragraph, then Tabs… by keys,
  Esc, then a typed key lands at the caret.

## LOW

- **L1. The horizontal ruler never opens Page setup.**
  - Repro: double click the Left margin marker, 5 px from the indent markers. Paragraph opens. A double click
    40 px left of it, on the grey margin, does nothing (probeO.py). Only the vertical ruler's Top margin opens
    Page setup.
  - Word opens Page Setup from a double click anywhere in the ruler's margin area.
  - Fix: a double click on the grey part, or on a margin marker where it does not overlap an indent marker,
    opens Page setup.
- **L2. Under a finger, gaps below 8 px remain (T3; 3ec0143 claims 8 px in the dialogs).** At 390, 360 and 320
  px:
  - Font dialog: the check rows are 4 px apart, OK and Cancel 6 px.
  - Insert Table: its rows are 4 to 6 px apart, and Number of columns and Number of rows 6 px.
  - AutoCorrect Options: rows 6 px apart.
  - Bookmark: Go To and Delete 6 px apart, Cancel and Add 6 px.
  - Find and Replace: the check boxes 3 px apart, Format and Special 4 px.
  - Symbols: the grid cells 4 px apart.
  - (N.log, N-font-dialog-390t.png.)
- **L3. A text field takes the focus on a phone.** Page setup, Insert Table, Properties, Share, Bookmark, a new
  comment, and Find and Replace focus a text field as they open under a finger, so Android raises its keyboard
  over the dialog. The PR's rule says "under a finger never a text field". It applies only when nothing else
  took the focus, and these dialogs focus their own field. It was the same on 0a6ef7b. 6443103 keeps the field
  in sight: Page setup's Bottom field sits at 191 to 233 px inside the 490 px left above the keyboard.
- **L4. The right click menu:**
  - "Update to Match Selection" is shown, but its accessible name is "Update Style to Match Selection". The
    words shown are not inside the name (WCAG 2.5.3), so voice control misses it.
  - AutoFit (table) and List Spacing (list) open a submenu but show no arrow and carry no `aria-haspopup`.
  - A menu opened by a mouse right click puts a 2 px focus ring on its first item, Paste (C13 says rings only
    for the keys; Word highlights nothing).
  - Fixes: name the command "Update to Match Selection" or show its full name; give submenu items
    `aria-haspopup="menu"` and a ›; focus the menu itself on a pointer open.
- **L5. Tooltips (ba9e0df):** "Undo (Ctrl+Z)" and "Redo (Ctrl+Shift+Z)" have no sentence saying what they do.
  Share's sentence does not start with a verb ("A link anyone can open…"). Open's keys come at the end, after
  the sentence, not after the name. Word's Redo tooltip shows Ctrl+Y.

## Unlike Word, for a novice or a power user

- The menu says "Font Settings…" and "Paragraph Settings…" where Word says "Font…" and "Paragraph…".
- Every right click menu ends with "Next Tab Stop", "Show in Source" and "Show LaTeX", then a greyed line,
  "Right click again for the browser's menu".
- A heading's menu has 22 items, with expand and collapse scattered among the others: Collapse Heading,
  Heading Numbers Off, Expand Heading, Modify Style…, Expand All Headings, Update to Match Selection,
  Collapse All Headings. Word keeps them in one Expand/Collapse submenu.
- In a list item's menu, Change List Level is greyed out; Word offers it as a submenu.
- At 320 px the phone's ribbon row draws B, I, then a third button cut under Download (ribbon agent's area).

## What held up

- **Dialogs by keys:** Font (Ctrl+D), Paragraph, Page setup, Insert Table, Share, Properties, Word Count
  (Ctrl+Shift+G), AutoCorrect Options, Check accessibility, Bookmark, Symbols and Insert Hyperlink (Ctrl+K):
  - Each takes the focus on its first control, never Close.
  - 25 Tabs and 25 Shift+Tabs never leave the dialog, and the focus ring is a 2 px outline.
  - Esc gives the caret back and the next key lands (M.log).
- **Focus back to the opener:** a ribbon launcher reached by keys gets the focus back on Esc, and a second Esc
  returns to the page. By mouse, Alt+Q search, or the right click menu by mouse or Shift+F10, Esc gives the
  page back.
- **The right click menu:** every item ending in "…" opened a dialog. Words are capitalised and at most four,
  except the greyed hint line.
- **Ruler:** a double click on an indent marker opens Paragraph and on the top margin opens Page setup; the
  source is left unchanged.
- **Empty panes:** an empty Navigation pane says "No headings yet…" and offers Apply Heading 1.
- **Contrast:** dark mode's blue buttons are 7.6:1 (were 2.4). The search list's "Bold" is 13:1 in light and
  10:1 in dark (was 1.3).
- **Phones at 390, 375, 360 and 320 px:**
  - The top bar's buttons are 44 px with at least 8 px between them, nothing overlaps, and nothing scrolls
    sideways. Redo moves to the menu panel under 380 px; Open and Source are there too.
  - The search box opens 378, 363, 348 and 308 px wide.
  - Every dialog fits the screen and every target is at least 44 px. A number field with its unit is one
    44 px frame. Insert Table's Cancel and OK are whole now.
  - A number typed in Page setup with OK writes `bottom=3cm`.
- **Suites:** `ux.py` 447 passed, 0 failed.
