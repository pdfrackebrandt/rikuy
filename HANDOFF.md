# Handoff: work in flight

Rikuy is built by more than one agent: Claude, Grok Bot (Gato), and Pedro himself. Any of
them may stop in the middle of a task (a usage limit, a closed session), and another carries on
from the repository alone. This file is how. Read AGENTS.md first, then this, then the open pull
requests. When this file and a pull request's own Handoff section disagree, the pull request is
newer.

## Start here (state on 2026-11-20, 10:35 UK, when Grok Bot (Rikuy) stopped at Pedro's request)

Everything is pushed and merged. No pull request is open, no branch holds unmerged work, and no
agent is running. `main` is at 395faad (merge of PR 75), and its deploy succeeded.

Done since the 2026-11-17 list (all merged with a merge commit, checks green):

| PR | What | Merge |
|---|---|---|
| 72 | Handoff docs | 9882f24 |
| 62 | R2 styles and lists | 2adb064 |
| 63 | R3 objects (form fields excluded from the 5% fast-edit share only, d3e9a89) | 1feca3f |
| 73 | M7: wrapped figure margin box in `fillLines` | b2bfccd |
| 66 | R4 | a0b42ab |
| 68 | R5 | 279232d |
| 74 | Security review, `docs/reviews/SECURITY.md`; fflate 0.8.3 + ZIP64 guard (S1) | ddcdc2d |
| 75 | UI/UX pass: Word-style title band, File backstage, labelled ribbon groups, dialog launchers, KeyTips (Alt/F10), Word shortcuts, Ask Grok in Help | 395faad |

What is left, in order. None is started; each needs Pedro's go-ahead except where noted.

1. **Security follow-ups from `docs/reviews/SECURITY.md`** (all Low, Pedro has not decided yet):
   - S4 HSTS: either Pedro turns it on in Cloudflare, or a small PR adds the header.
   - S3 CSP: replace `'unsafe-inline'` / `'unsafe-eval'` for scripts with hashes; touches the build.
   - S2 KaTeX: the advisory needs the 0.19 major bump; the affected features are off in Rikuy.
   - S5: the comments-only share filter can be bypassed with TeX tricks; documented, not fixed.
2. **Word shortcuts, finishing** (PR 75 commit 0efad53 added the ones that map to an existing
   command; Ctrl+B/I/U, alignment, lists, headings etc. were already there). Not yet verified
   end to end: a full audit of Word's Home/Insert/Review shortcuts against `src/` (keys test:
   `test/keys.test.mjs`, `test/commands.test.mjs`), and the Help list of keys the browser keeps
   (Ctrl+N, Ctrl+W, Ctrl+T). Add any that are missing and still map to a real command.
3. **UI polish leftovers**: the other ribbon tabs (Insert, Design, Layout, References, Review, View)
   hold the real commands but are not yet laid out as closely to Word as Home is (large buttons,
   dialog launchers). Phone keeps one toolbar row by design.
   No Microsoft icons, fonts or assets (clean-room, like WordCraft).
4. **R6, the arXiv corpus (PLAN.md task 16)**, optional, not done: classify run 44077385415's results
   on branch `arxiv-results` as described in the previous version of this file (git log -p HANDOFF.md),
   then write the compile and match rates into PLAN.md, README.md and tex/README.md.

Pedro's taste for this repo: Word look-alike (WordCraft is the reference, clean-room), Ask Grok
stays subtle (Help tab and search only, tooltip says Rikuy is not part of xAI), plain-words
messages, merge only when all five checks (test, editor, workflows, editor-more, tex) are green.

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
