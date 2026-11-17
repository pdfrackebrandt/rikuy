# Handoff: work in flight

Rikuy is built by more than one agent: Claude, Grok Bot (Gato), and Pedro himself. Any of
them may stop in the middle of a task (a usage limit, a closed session), and another carries on
from the repository alone. This file is how. Read AGENTS.md first, then this, then the open pull
requests. When this file and a pull request's own Handoff section disagree, the pull request is
newer.

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
- **This file** is rewritten whenever the list below changes. It is the one status file the
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

## In flight (2026-11-17, 11:20 UTC)

Round 3 is the last of the Word gap list: every Word or WordCraft feature Rikuy lacked,
`docs/handoff/ROUND3.md` by batch. R0 (Tag the PDF) and R1 (pages and paragraphs, PR 64 and
its follow-up 69) are merged.

| pull request | branch | what | state | next step |
|---|---|---|---|---|
| 62 | round3-r2-styles | R2: Clear All for paragraphs, picture bullets, Adjust List Indents, title parts, Code, Rename Style, link colours | reviewed three times (docs/reviews/R2.md): every High and Medium fixed; N4 left (renaming `theorem` turns `\renewcommand{\theoremautorefname}` into an undefined `\thmautorefname`: write `\providecommand` there); main being merged in | finish N4 and the merge of main, push, green, merge |
| 63 | round3-r3-objects | R3: drag to move, cover pages, Quick Parts, fields, form fields, wrapped figures drawn, alt text | verified "merge" at e6e6b15 (docs/reviews/R3.md); main merged in locally | push the merge, green, merge |
| 66 | round3-r4-review | R4: thesaurus (MyThes), grammar (Harper), comments only share links, Display for Review › Original, changes by author, the rest of References | review says request changes (docs/reviews/R4.md): a comments only copy can still change the document (a lone CR ends a TeX line inside a `%` line; `%` lines in a `.bib`; a copy relabelled as a coauthor link), plus Mediums; fixes in progress (`wip/round3-r4-review`) | finish the fixes, then a fresh verification of each finding, merge main, green, merge |
| 68 | round3-r5-view | R5: collapse headings, ^p, find by environment, the ruler, Web Layout, rename a document | review says changes needed (docs/reviews/R5.md): three Highs in Replace write LaTeX that does not compile; Mediums in the ruler, rename, collapsed headings | fix, verify, merge main, green, merge |
| 70 | arxiv-tree-packages | the 22 packages and font sets the first arXiv run found missing from the tree | built and tested (its description) | green, merge; then R6 below |

### R6: the arXiv corpus (PLAN.md task 16)

The first run (998 papers) and what it found are under task 16. Two fixes are merged (PR 65:
the merge of the shard files; PR 67: a paper's own `.bbl`); PR 70 adds the missing packages.
Once 70 is merged: run Actions › arXiv corpus › Run workflow on main (about two hours; the
results land on the branch `arxiv-results`), then classify every failure and every mismatch as
task 2 did for the first corpus (`dev/pdfcompare_report.py`, `dev/pdfcompare-classes.json`), and
put the compile and match rates in PLAN.md's table, README.md and tex/README.md. Rows now carry
the fonts on one side only (mismatches) and the worker's last steps (compiles that ran out of
time), since the run keeps no PDFs.

### Lows accepted in reviews, open

R1: L4 (landscape pages with a footnote and an `[h]` float break differently from TeX). R2: L4
(highlight colour in a .docx title, author or abstract), L5 (link colours set in an `\input`
preamble not drawn). R3: L7 (wrapfigure's `i` and `o` in two sided documents), L2 for text
dropped from another page (glued to the next word). Each is a line in PLAN.md.

## Background an agent needs

- `docs/handoff/GAP.md`: every Word and WordCraft feature, Rikuy's status per row, the rules
  each BUILD row obeys (section 0, the round trip rule). The master list behind rounds 1 to 3.
- `docs/handoff/BATCH-BRIEF.md`: the brief each batch author got; `B0-REPORT.md` and
  `FOLD-SPEC.md`: the ribbon frame every batch builds on.
- `docs/reviews/`: the round 3 reviews. `docs/REVIEW_PROCESS.md`: how a change is reviewed.
