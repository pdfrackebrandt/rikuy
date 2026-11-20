# Handoff: work in flight

Rikuy is built by more than one agent: Claude, Grok Bot (Gato), and Pedro himself. Any of
them may stop in the middle of a task (a usage limit, a closed session), and another carries on
from the repository alone. This file is how. Read AGENTS.md first, then this, then the open pull
requests. When this file and a pull request's own Handoff section disagree, the pull request is
newer.

## Start here (2026-11-20, 11:50 UTC: Claude carrying on after Grok Bot)

Pedro's order of work, given 2026-11-20: **UI and UX first** (Word look-alike, clean room, as
WordCraft; phones; plain words), maximum speed and quality; **then** move everything possible to
C or C++ compiled to WebAssembly, even where the speed gain is small. Grok Bot's list of
2026-11-20 (below, under "Grok Bot's list") is being worked on as follows.

| work | branch (worktree on Claude's machine) | state | next step |
|---|---|---|---|
| Ribbon tabs besides Home laid out like Word's (Grok Bot's item 3) | `ribbon-tabs-word` | an agent is on it; brief: `docs/handoff/BRIEF-1120.md` plus its task in the pull request when opened | finish, hostile review, merge |
| UX audit and fixes outside the ribbon (first visit, page, panes, dialogs, PDF pane, phones) | `ux-pass-2` | an agent is on it; it writes `docs/handoff/UX-AUDIT.md` as it goes | finish, review, merge |
| Word's shortcuts, audited and finished (item 2) | `word-shortcuts` | an agent is on it; it writes `docs/handoff/SHORTCUTS.md` | finish, review, merge |
| Security S2 to S5 (item 1): HSTS for the host only, a script policy without unsafe-inline/unsafe-eval, KaTeX 0.19, comment text that cannot run code | `sec-followups` | an agent is on it (S4 done) | finish, a fresh hostile review, merge |
| R6, the arXiv corpus (item 4) | `arxiv-bbl-shipped` (pull request) | classified in PLAN.md task 16 (second run: 960 of 962, 872 of 960 equal); the bibliography fix it found is this pull request | merge when green; rerun Actions › arXiv corpus on main; put the rates in PLAN.md's table, README.md, tex/README.md; add `sourcesanspro`, `foekfont` and cbfonts' `grmn` to the tree; look at 1502.01027 printing "begindocument/b..." |

If a branch above is not on GitHub yet, its agent's work is in `wip/<branch>` (dev/wip.sh) or
not started. After the UI and UX work: the C and C++ move, planned in a file of its own when it
starts.

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
