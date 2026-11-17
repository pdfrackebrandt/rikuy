# Handoff: work in flight

Rikuy is built by more than one agent: Claude, Grok Bot (Gato), and Pedro himself. Any of
them may stop in the middle of a task (a usage limit, a closed session), and another carries on
from the repository alone. This file is how. Read AGENTS.md first, then this, then the open pull
requests. When this file and a pull request's own Handoff section disagree, the pull request is
newer.

## Start here (state on 2026-11-17, 12:10 UTC, when Claude stopped)

Everything is pushed: no work exists only on Claude's machine. Do these in order; each step
says how to know it is done.

1. **Merge the pull request that brought this file** ("Handoff: state at stop"), once its checks
   are green. It changes only this file and `docs/reviews/`.
2. **PR 62, R2 (styles, lists, Clear All, title parts, Code, Rename Style, link colours).**
   Reviewed three times, every finding fixed, main merged in. Merge when its checks are green.
3. **PR 63, R3 (drag to move, cover pages, Quick Parts, fields, form fields, wrapped figures).**
   Verified "merge", main merged in. Merge when green. Then one small fix in a new branch, M7 of
   `docs/reviews/R3.md` ("Check of the merge 7f3f269"): in `fillLines`, `src/layout.js` around
   line 1184, test the line's height against the wrapped figure's margin box, not its border box
   (a line starting just under a right hand figure is split in two; TeX sets it as one). Add the
   case to `test/picture.py`'s `r3_review`.
4. **PR 66, R4 (thesaurus, grammar, comments only share links, Original, changes by author,
   References).** The review's findings are fixed (`docs/reviews/R4.md`, with its verification
   of 1df9c63). The last four (V1 to V4: catcode words, links with no sender, `\verb` and listed
   files in `bodyAt`, `%20` in `\href`) were fixed after that verification (commits a3925f7,
   19ac237, cfb9711). Check those four against their repro text in `docs/reviews/R4.md` (each is
   now a test in `test/review.test.mjs` and `test/share.py`'s `attacks`), merge main into the
   branch (it is two commits behind), wait for green, merge.
5. **PR 68, R5 (collapse headings, ^p, find by environment, the ruler, Web Layout, rename a
   document).** Its review (`docs/reviews/R5.md`) found three Highs and five Mediums; all are fixed
   in 66a4c81 to 0f62250 (PLAN.md task 65 lists each), main merged in. Still needed: a fresh
   hostile verification of those fixes, appended to `docs/reviews/R5.md` (rerun each finding's
   case; compile the Replace results in the page), plus one unchecked point the author raised:
   the ruler on R1's landscape pages (`pg.land`). Then merge main, green, merge.
6. **After each merge, the next branch merges main** (`git merge origin/main`, never rebase or
   force push). Conflicts so far were only in PLAN.md and AGENTS.md (keep both sides) and in
   `src/app.css` (keep both sections).
7. **R6, the arXiv corpus (PLAN.md task 16).** Run 44077385415 of Actions › arXiv corpus started
   at 11:49 UTC on main cb4d5a8 (with the `.bbl` fix and the 22 packages); about two hours. When
   it is done, its results are on the branch `arxiv-results` (`dev/arxiv-results.jsonl`,
   `dev/arxiv-pdfcompare.jsonl`). If the collect job dropped rows, rerun only the merge with
   Run workflow and `from_run` set to that run's id. Then:
   - count: Rikuy compiles, desktop compiles, both, matches (the first run: 932 and 964 of 998,
     623 of 932 matching; PLAN.md task 16 has its causes);
   - classify every failure and every mismatch as task 2 did for the first corpus
     (`dev/pdfcompare_report.py`, `dev/pdfcompare-classes.json`): the rows now carry
     `fonts_only` (fonts on one side only) for mismatches and `trail` (the worker's last steps)
     for compiles that ran out of time, because the workflow keeps no PDFs;
   - fix what is Rikuy's and cheap, as PR 67 (a paper's own `.bbl`) and PR 70 (packages) did;
   - write the compile and match rates into PLAN.md's table, README.md and tex/README.md (their
     numbers must agree, AGENTS.md says).

## The rule

- **Nothing lives only on one machine.** Commit each finished step on its branch and push it.
  On a branch that is not merged yet, a commit "WIP: done X; left Y" is fine.
- **Stopping in the middle:** `sh dev/wip.sh [worktree] "done X; left Y"` pushes the worktree as
  it stands (uncommitted changes, untracked files, a half done merge with its conflict markers)
  to `wip/<branch>`, without touching the worktree. Every push is a fast forward.
- **Every open pull request ends with a `## Handoff` section**: its state, the next step, where
  its review is. Whoever stops updates it (`gh pr edit N --body-file body.md`).
- **Reviews are files in the repository**: `docs/reviews/<batch>.md`, with the verdicts and each
  later verification appended to the same file.
- **Merging:** only when the required checks are green (test, editor, workflows; editor-more and
  tex run too) and the latest verification in the review says merge. A merge to main deploys
  (tex.yml, then deploy.yml). Never force push; when a branch must take main, merge main into it.
- **This file** is rewritten whenever the list above changes. It is the one status file the
  "no status commits" rule of PLAN.md allows.

## Picking up a `wip/` snapshot

```sh
git fetch origin <branch> wip/<branch>
git log -1 origin/wip/<branch>     # what was done, what was left, whether a merge was in progress
git switch <branch>
# if its message says a merge was in progress: git merge --no-commit <the commit it names>
git restore --source origin/wip/<branch> --staged --worktree -- .
# finish, run the checks AGENTS.md names for what you touched, commit on <branch>, push
```

The `wip/round3-r2-styles`, `wip/round3-r3-objects` and `wip/round3-r4-review` snapshots of
2026-11-17 11:15 UTC are superseded: their branches have everything since. Ignore them.

## Known flaky checks

- `test/view.test.mjs` V4 times an action against 50 ms and fails on a loaded machine; rerun it
  alone before calling it a failure.
- `test/widgets.py` failed four checks once in CI on a docs only change (PR 71) and passed on the
  rerun of the same job.

## Lows accepted in reviews, open

R1: L4 (landscape pages with a footnote and an `[h]` float break differently from TeX). R2: L4
(highlight colour in a .docx title, author or abstract), L5 (link colours set in an `\input`
preamble not drawn). R3: L7 (wrapfigure's `i` and `o` in two sided documents), L2 for text
dropped from another page (glued to the next word). R5: L1 (a break inside `{\bfseries ..}` not
offered as a mark), L5 (deleting across a collapsed heading takes its hidden text, as Word
does), L6 (ruler markers mouse only). Each is a line in PLAN.md.

## Background an agent needs

- `docs/handoff/ROUND3.md`: round 3 by batch (R0 and R1 merged; R2 to R5 above; R6 the arXiv
  corpus) and what stays undone by design.
- `docs/handoff/GAP.md`: every Word and WordCraft feature, Rikuy's status per row, the rules
  each BUILD row obeys (section 0, the round trip rule). The master list behind rounds 1 to 3.
- `docs/handoff/BATCH-BRIEF.md`: the brief each batch author got; `B0-REPORT.md` and
  `FOLD-SPEC.md`: the ribbon frame every batch builds on.
- `docs/reviews/`: the round 3 reviews. `docs/REVIEW_PROCESS.md`: how a change is reviewed.
- Pedro's standing wishes for Rikuy: everything works on phones (390 and 360 px, touch);
  C or C++ compiled to WebAssembly wherever real computation is needed; "strictly better" than
  Word, with clean standard LaTeX underneath; interactive graphs move only on Rikuy's page, the
  PDF and Word get the static picture.
