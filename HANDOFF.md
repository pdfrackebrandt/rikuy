# Handoff: work in flight

Rikuy is built by more than one agent: Claude, Grok Bot (Gato), and Pedro himself. Any of
them may stop in the middle of a task (a usage limit, a closed session), and another carries on
from the repository alone. This file is how. Read AGENTS.md first, then this, then the open pull
requests. When this file and a pull request's own Handoff section disagree, the pull request is
newer.

## Start here (2026-11-21, 10:00 UTC: Claude)

Pedro's order of work, given 2026-11-20: **UI and UX first** (Word look-alike, clean room, as
WordCraft; phones; plain words; consistency: like things the same size, for novices and power
users), **AI and agent compatibility high**, speed with quality, motion where it helps; **then**
C or C++ for WebAssembly (`docs/handoff/CPP-PLAN.md`, B1 onward). UI rules are in
`docs/handoff/UI-PRINCIPLES.md`.

Merged since the last version of this file: 78 (ribbon tabs), 79 (UX outside the ribbon), 81
(security and the git proxy), 82 (B0), 83 (Word's object tools), 84 (Word's document gaps), 85
(arXiv rerun), 86 (ribbon polish), 88 (interactive graphs as the edge), 90 (consistency outside
the ribbon), 91 (the TeX job reuses an identical tree), 92 (agents first, motion), 93 (editor jobs
get 60 minutes), 94 (dogfood as an economist), 95 (dogfood as a Word user), 96 (dogfood as an
Overleaf user), 97 and 98 (two flaky checks fixed), 87, 89, 99 and 100. Their reviews are in `docs/reviews/`.

| work | pull request, branch | state | next step |
|---|---|---|---|
| Power users: keys, Overleaf typing, pickers, quick open, the typing queue | 87, `power-keys` | merged | none |
| This file | 89, `handoff-1120b` | merged | none |
| R6, the arXiv corpus | 99, `arxiv-shards` | merged; run 5 (44904020552) is the first full run after it: 961 of 998 compiled, 896 of 961 matched, numbers in PLAN task 16 | add `sourcesanspro`, `foekfont`, cbfonts' `grmn` once `tex.yml`'s 180 minute limit is raised or the rebuild split (PLAN task 16); 1502.01027 |
| Deploy fix | 100, `fix-widget-headers` | merged. Every deploy from PR 81 to PR 99 had failed its live check (live figures did not run on the hosted site); the deploy of 1cc5449 passed | none |
| Widget document's name | 101 | open: the widget document's name hashes its headers' rule, so browsers that cached it with the wrong headers during the PR 81 to PR 100 window get a new address | merges when green |
Pedro's to do (his accounts): the WAF rate rule on `/git/` (docs/HOSTING.md step 9, one time);
the git proxy is live. Optional `RIKUY_GIT_HOSTS`.

PLAN.md's task numbers to tidy: main has two 66s (shortcuts, C/C++), 66a (ribbon), 67 (security;
UX's 67 too), 68 (document gaps); 69 objects, 70 graphs, 71 motion; power-keys wrote 68 and must
become 72. Task 71 also has a second meaning, below (marks per version).

If a branch above is not on GitHub yet, its agent's work is in `wip/<branch>` (dev/wip.sh) or
not started.

## Follow-ups, each with its source

UI and agents first, in this order:

1. **DOGFOOD-ECON, verification 2, four lows** (`docs/reviews/DOGFOOD-ECON.md`, W1 to W4):
   - W1: `resolveIn` picks a file TeX would not read (`intro` before `intro.tex`; a file of that
     name anywhere in the project, even above it).
   - W2: empty paragraphs are forgotten once the caret leaves them.
   - W3: redo and selection do not follow the counted Enters (Ctrl+Y, Shift+Left, one Ctrl+Z).
   - W4: Ctrl+B inside a longer bold run takes the bold off the whole run.
2. **dogfood-word's leftovers** (PR 95's body; the verification text is `/tmp/word-verify.md` on
   the machine that ran it, so it may be gone): tracked changes inside equations are accepted
   silently; a tracked table row; the typing path's attribution loop. Its N1 to N5 lows: changes
   past the 20000 segment cap show as "You" (`rvName('')`); `diff.js` `joinBlank` sometimes lists a
   coarser change; `rvAuthorStep` still runs the per span loop on the main thread (0.9 s for Reject
   by Bo on 3000 changes); `src/word.js:280` has two statements on one line; `chainAt` does not
   know `\usefont`.
3. **DOGFOOD-LATEX leftovers** (`docs/reviews/DOGFOOD-LATEX.md`):
   - a pull that changes only a picture keeps the Allow;
   - there is no file tree to create, rename or delete project files;
   - beamer overlay syntax (`\only<2>`, `\uncover`, `\alert<2>`) in `parser.js` and `parse.cc`;
   - code listings on the page.
4. **PLAN task 71, marks per version** (DOGFOOD-LATEX): versions should carry the mark's id, for
   another tab's text kept as a "From another tab" version and for the residual from before the fix.
5. **AGENTS-MOTION**: the typing latency check is flaky on loaded machines (its L5 and H2 notes
   give the numbers); typing on long documents wants its own task, and `LAZY` could count pages as
   well as elements.
6. **power.py's "keytips: F10, H, 1 makes the selection bold"** fails only with the full TeX tree
   after earlier parts: after F10, H drops the page's selection. Not reproduced alone; CI runs
   power.py without the tree.
7. **Watch main's Deploy runs after every merge.** A skipped deploy job is not a deploy; PR 81 to
   PR 99 deployed nothing that worked and no one saw it.
8. **Then the C and C++ batches B1 to B3** (`docs/handoff/CPP-PLAN.md`): B1 the source scanner in
   C++, B2 the parse made incremental in the core, B3 the model's text runs.

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

- `test/view.test.mjs` V4 now takes the best of three runs (PR 98); `preamble.py`'s clock case no
  longer depends on the minute (PR 97).
- The motion typing latency check fails on loaded machines; rerun it alone.
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
