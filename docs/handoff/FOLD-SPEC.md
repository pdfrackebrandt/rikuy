# One fold rule for the ribbon (src/ribbon/tabs.js ribbonFit), shared by B1 and B5

Both reviews found the same class of bug in ribbonFit: folding too much, all at once, never unfolding, and not monotonic in width. B5 (PR 15) lands first; B1 (PR 16) rebases onto it. Both converge on this rule:

1. Start fully expanded: every group open, every label shown, the gallery at its widest page count.
2. While the row overflows, take ONE step, cheapest loss first, in this fixed order:
   a. hide the "Download" caption;
   b. shrink the Styles gallery one tile (down to 3);
   c. fold the open group with the lowest fold rank (ties: the rightmost); a folded group becomes ONE button that keeps a visible short label or a group icon (B5's 24 px icon) AND its group name as its accessible name, opening a menu with the same names;
   d. drop insert labels (names stay accessible);
   e. merge the three downloads into one Download button;
   f. below 861 px only: switch the gallery to the style list.
3. After the loop, try to undo steps in reverse order while the row still fits (so no empty stretch is left: never ~150 px free while a group is folded).
4. Monotonic: a wider window never shows fewer controls than a narrower one. Test it: sweep widths 390→1920 in 10 px steps on every tab with the real commands AND with extra test commands registered (rikuy.cmds.register), and assert the count of visible top-level controls never decreases as the width grows, no overflow, and no group folded while its unfolded width would fit.
5. Home's targets: at 1920 to 1024 px nothing folds that main (8035d30) shows unfolded at that width, other than the new groups this batch added; at 900 px at most one group folds; phones keep B, I, U first in the row (Format Painter and the boxes after them or in a folded Font menu).
6. Measure once per resize frame; no layout thrash (one read pass, one write pass per step); no work on caret moves.
