# Handoff: work in flight

Rikuy is built by more than one agent: Claude, Grok Bot (Gato), and Pedro himself. Any of
them may stop in the middle of a task (a usage limit, a closed session), and another carries on
from the repository alone. This file is how. Read AGENTS.md first, then this, then the open pull
requests. When this file and a pull request's own Handoff section disagree, the pull request is
newer.

## Start here (2026-11-20, 19:00 UTC: Claude)

Pedro's order of work, given 2026-11-20: **UI and UX first** (Word look-alike, clean room, as
WordCraft; phones; plain words; consistency: like things the same size, for novices and power
users), maximum speed and quality; **then** C or C++ for WebAssembly (`docs/handoff/CPP-PLAN.md`,
B1 onward). Merged today: 78 (ribbon tabs as Word's), 80 (shortcuts), 81 (security S2 to S5 and
the git proxy), 82 (B0), 85 (arXiv rerun). Reviews in `docs/reviews/`.

| work | pull request, branch | state | next step |
|---|---|---|---|
| UX outside the ribbon | 79, `ux-pass-2` | review UX-2: fixed; N1 to N6 and a consistency pass done (0a6ef7b); a verifier is on 0a6ef7b | verdict, merge |
| Word's gaps: objects | 83, `word-gaps-objects` | fixes verified except N1 to N9 (floats in floats, multicols, boxes; see the review's last section); author fixing | verification, merge |
| Word's gaps: document | 84, `word-gaps-doc` | all review findings fixed and main merged (3d3bfc4); References' Update buttons 44 px on phones being fixed; verifier on 3d3bfc4 | verdict, merge |
| Ribbon polish | 86, `ribbon-downloads` | the stacked Download group, one label weight and size, `test/consistency.py`, `docs/handoff/UI-PRINCIPLES.md`; in progress: light blue title bar, Frontier in References › Research (coming soon), 44 px touch for the tab picker and Download menu | finish, review against UI-PRINCIPLES.md, merge |
| Power users | 87, `power-keys` | from `docs/handoff/POWER-USER.md`: footnote exit, Overleaf typing, pickers, KeyTips, fuzzy search, quick open, F4; latency next | finish, power user review, merge |
| Interactive graphs as the edge | 88, `graphs-edge` | opening document with a live graph, Graph this, economics kinds, vector PDF, web page export (`docs/handoff/GRAPHS.md`); CI's editor job failing on tests that read the old sample | fix, finish, review, merge |
| R6, the arXiv corpus | run 44766248361 | run 2's 998 papers again with the .bbl fix | classify; rates into PLAN.md task 16, README.md, tex/README.md; add `sourcesanspro`, `foekfont`, cbfonts' `grmn`; 1502.01027 |

Pedro's to do (his accounts): the WAF rate rule on `/git/` (docs/HOSTING.md step 9), now that the
git proxy is live. Optional `RIKUY_GIT_HOSTS`.

PLAN.md's task numbers: main has 66 (shortcuts), 66 (C/C++), 66a (ribbon), 67 (security, and
UX's 67 on its branch); 68 is word-gaps-doc's, 69 word-gaps-objects', 70 graphs-edge's. Renumber
once these merge.

If a branch above is not on GitHub yet, its agent's work is in `wip/<branch>` (dev/wip.sh) or
not started.

### Grok Bot's list of 2026-11-20 (for the record)

1. Security follow-ups from `docs/reviews/SECURITY.md` (S2 KaTeX, S3 the script policy, S4 HSTS,
   S5 the comments only filter).
2. Word shortcuts, an audit end to end, Help's list of the keys the browser keeps.
3. The other ribbon tabs laid out as closely to Word as Home.
4. R6: classify the arXiv run, write the rates into PLAN.md, README.md and tex/README.md.

Merged before that, by Grok Bot: PRs 72, 62, 63, 73, 66, 68, 74 (security review, fflate 0.8.3),
75 (Word-style title band, File backstage, labelled groups, dialog launchers, KeyTips, shortcuts,
Ask Grok in Help). Pedro's taste: Word look-alike (WordCraft the reference, clean room), Ask Grok
stays subtle (Help tab and search only; its tooltip says Rikuy is not part of xAI), plain words,
merge only when every check is green.

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
