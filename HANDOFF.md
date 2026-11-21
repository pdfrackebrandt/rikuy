# Handoff: work in flight

Rikuy is built by more than one agent: Claude, Grok Bot (Gato), and Pedro himself. Any of
them may stop in the middle of a task (a usage limit, a closed session), and another carries on
from the repository alone. This file is how. Read AGENTS.md first, then this, then the open pull
requests. When this file and a pull request's own Handoff section disagree, the pull request is
newer.

## Start here (2026-11-20, 15:30 UTC: Claude)

Pedro's order of work, given 2026-11-20: **UI and UX first** (Word look-alike, clean room, as
WordCraft; phones; plain words), maximum speed and quality; **then** move everything possible to
C or C++ compiled to WebAssembly (`docs/handoff/CPP-PLAN.md`, batches B1 onward). Reviews of the
work below are in `docs/reviews/` (RIBBON-TABS, UX-2, SHORTCUTS, SECURITY-2, CPP-B0).

| work | pull request, branch | state | next step |
|---|---|---|---|
| Ribbon tabs laid out like Word's | 78, `ribbon-tabs-word` | reviewed (RIBBON-TABS.md: merge); after merging main, CI's tabs.py fold rule fails on Home at 1150 to 1160 px (main's new commands); an agent is fixing it | fix, green, merge |
| The downloads as a Word group (Pedro: PDF, Word, LaTeX stacked, prettier) | `ribbon-downloads`, no PR yet (based on 78) | built at 943b91c, being finished | PR once 78 merges; a short review |
| UX outside the ribbon | 79, `ux-pass-2` | review UX-2.md: fix first; an agent is fixing H1, H2, M1 to M6, the lows, File backstage, the phone's reflowed view | finish, merge main, verify against UX-2.md, merge |
| Security S2 to S5 and the git proxy | 81, `sec-followups` | SECURITY-2.md's last verification: merge | merge when green; then L6 (the proxy's byte cap costs Worker CPU on big clones) |
| Word's gaps: objects (contextual tabs, picture corrections in C, Selection Pane, Arrange) | 83, `word-gaps-objects` | done; hostile review running | review, fixes, merge main after 78, renumber its PLAN task 68 (84 also has a 68), merge |
| Word's gaps: document (Table Properties, Formula, Header & Footer tab, Split, UnicodeMath) | 84, `word-gaps-doc` | done; hostile review running | the same |
| R6, the arXiv corpus | 99, `arxiv-shards` | run 4 (44766248361) partial: five shards spent 5 h 50 min downloading the desktop TeX Live from a slowed mirror; this PR downloads it once into the cache, adds hard limits per document and per shard; partial numbers in PLAN task 16 | merge; dispatch arXiv corpus with `sources_from_run=44077385415`; classify; rates into PLAN.md's table, README.md, tex/README.md; add `sourcesanspro`, `foekfont`, cbfonts' `grmn` to the tree; 1502.01027 printing "begindocument/b..." |
| C and C++, B0 | 82, merged | B0 done | B1 to B3 after the UI work |

Pedro's to do (needs his accounts): a WAF rate rule on `/git/` (docs/HOSTING.md step 9) before
or at the deploy of 81; optionally `RIKUY_GIT_HOSTS`. Open in Overleaf cannot post (the page's
`form-action 'self'`); Safari 15 cannot compile.

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
