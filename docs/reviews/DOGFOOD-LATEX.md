# Hostile review, security first: PR 96 (dogfood-latex), 08a4b38..17bb758

Verdict: **fix first.** One escalation from restricted to full shell escape is new in this PR (I1). A second one is older, but this PR edits the line that causes it (I2). The rest are nits.

Checks run on 17bb758 (worktree build plus a copy of dist/tex, engine.js refreshed by the build):
- `npm test`: passes.
- `test/files.py` with dist/tex: 85 passed, 0 failed.
- The repro scripts `/tmp/latexrev/repro.py` and `reproC.py`, browser, run with a stub engine that records the flags `compilePdf` sends to the worker.
- `dev/texrun.py` on three biber documents.

## Important

### I1. Opening a version gives a stranger's .zip full shell escape (new: src/review.js:588)

`openVersion` runs `carryLink(await this.linkInfo(), v.main)` whenever the version has the open project's name and another main file. The current key's mark is written over the target key's mark:
- when the current key has no mark, `carryLink(null, …)` calls `kvDel('link:name|main')` and deletes the stranger's restricted mark;
- when the current key is allowed, that Allow overwrites the stranger's restricted mark.

A .zip opens under its own file name (`zipName`, src/app.js:4465). Unlike share links (collab.js:199), that name is not checked against projects this browser already keeps, so a stranger's `thesis.zip` lands under the user's own name `thesis`. The attacker also picks the main file, either through `.latexmkrc` `@default_files` or through the folder layout.

Repro A (`/tmp/latexrev/repro.py`):
1. Open your own `thesis.tex`. It is unmarked.
2. Open the stranger's `thesis.zip`, holding `talk/evil.tex` with `\immediate\write18`. The worker gets `shellEscape: false, untrusted: true`.
3. New document.
4. In Review › Versions, open `thesis` / `thesis.tex`. It is unmarked, as it should be.
5. In Review › Versions, open `thesis` / `talk/evil.tex`. The mark is now `null` and the worker gets `{shellEscape: true, untrusted: false}`.
6. Reload. The mark is still null and the flags are still full shell escape: the deletion was persisted.

Repro C (`reproC.py`):
1. Open a trusted `paper.zip` and Allow it.
2. Open a stranger's `paper.zip` (main `evil.tex`). It is restricted.
3. New document.
4. Open the trusted version.
5. Open the stranger's version. Its mark becomes `{origin: 'zip', allowed: true}`, and the worker gets full shell escape.

Impact: the stranger's TeX runs with `-shell-escape`, which reaches Python, gs and the other emulated programs. Because the compile is no longer `untrusted`:
- the worker is not let go afterwards (src/tex.js:89), so the stranger's code can poison the tree in memory that later compiles of the user's own projects read;
- LuaLaTeX font caches are saved to IndexedDB (engine.js:2028), so the poisoning outlives the session.

Fix: the mark carried to another main file must never be less strict than the mark that key already has. Take the stricter of the two and never `kvDel` the target. Do the same in `setMain` (src/cmd/file.js:271), which calls `carryLink(mark, name)` the same way. Better still:
- keep one mark per project name, not per name and main file;
- open a .zip under a name not already taken, as share links do.

Add a files.py case for each repro.

### I2. A git pull or branch switch that drops the main file compiles with full shell escape (older bug; this PR edits the line: src/app.js:4062)

`loadGitFiles` picks a new main with `pickMain` when the old main file is gone. It marks the project only when `origin` is set, which is true for a clone but not for 'Pulled' or 'Switched to'. The new key `name|newmain` therefore has no mark.

Repro: in the same script, `openRepoFiles('repo', {main.tex})` gives `{origin: 'git', allowed: false}` and a restricted compile. Then `loadGitFiles({paper.tex}, 'Pulled')` gives mark `null` and the worker gets `shellEscape: true`.

The remote's owner only has to rename `main.tex` (or add a `latexmkrc` naming a file that is not main.tex). The PR says the mark is "carried on switch", but this switch carries nothing.

Fix: when `this.main` changes here, carry the old key's mark, the stricter of the two as in I1.

## Nits

- **N1. `\ensuremath` breaks inside `\text{}`** (src/render.js:21). `'{#1}'` keeps text mode, so a macro like `\R` defined as `\ensuremath{\mathbb{R}}` fails in `\text{in \R}` with "Can't use function '\mathbb' in text mode". The same happens for `\text{area \ensuremath{\alpha}}`. Checked against the bundled KaTeX: `'\\TextOrMath{$#1$}{#1}'` renders all six cases I tried, and `{#1}` fails two of them.
- **N2. A beamer item's label shows as text.** `\item<+->[a)] Lab` draws "[a)] Lab" with a bullet. The comment at model.js:2516 says `[label]` is handled. Checked with buildModel.
- **N3. A PDF's freshness ignores the shell escape mode** (`pdfSigNow`, app.js:5525). This is the same class of bug as 20415e6. After Allow or ticking Shell escape with the PDF pane closed, `api.compile`, Download PDF and Print return the restricted PDF as fresh. Neither `allowShellHere` nor the checkbox handler sets `pdfStale`. Found by reading the code, not run.
- **N4. `setMain` carries the `link:` mark but not `share:`, `scripts:` or `bin:`.** A guest who switches main file loses guest mode (Send back) after a reload, because `loadShareCtx` reads `share:name|newmain`. Found by reading the code, not run.
- **N5. Older bug, reachable now that Main document exists: biber cannot find `../refs.bib` when the main file is in a folder.** A talk at `talk/slides.tex` with `\addbibresource{../refs.bib}` gets "ERROR - Cannot find '../refs.bib'" and prints [p] (texrun, `/tmp/latexrev/bib3`). Cause: `runBiber` (engine.js:1007) strips `../`, writes `refs.bib` into `/home/web_user/biber/`, and runs biber from that folder. Fix: lay the project out under the biber folder and chdir to `<work>/<sub>`.
- **N6. Older bug: the .zip dotfile filter runs on raw names, before `cleanPath` turns `\` into `/`.** `figs\.htaccess` gets through as `figs/.htaccess`. It is harmless today, since nothing reads dotfiles, and `.git` is still refused by `cleanPath`.

## Checked and fine

- **.latexmkrc** is never run. It is read only at the project root, only its first 64 KB, and one linear regex takes `@default_files` from it, which only picks among `projectDocs`. The worker has no latexmk, so `$pdflatex` and the other settings change nothing.
- **Zip dotfiles.** The filter now keeps only `.latexmkrc`, `.keep` and `.gitkeep`, at any depth: `.keep/x.sty` and `.latexmkrc/x` are still dropped. `.git/` is refused twice, by the regex and by `cleanPath`, and git.js's repository comes only from `gitFiles`.
  - kpathsea: `TEXMFCNF` is an absolute path in the tree and `openout_any=p`, so no file in a project folder changes TeX's search path or its shell escape.
- **`../` handling** (`fromMain`, `texPath`, `fromTexPath`) only looks names up in the project's file Map. Paths are clamped at the project root, and `fromMain` returns null for a name that leaves the project.
  - The worker's path guard and `compileFiles`' `cleanPath` filter are unchanged. TeX's own `openin_any=a` is older and not part of this diff.
- **BIBER_UTF8** is pinned through engine.js's hash: the manifest line is `2b7f12f8…`, which matches `tex/engine.js`, and the manifest changes only in edcd519.
  - It is written after the data files, into a folder they cannot reach (extension filter, no `..`).
  - The `is_utf8` guard prevents decoding twice.
  - texrun after the change:
    - a UTF-8 .bib with a non-ASCII file name (`références.bib`) gives "Jürgen Pérez. “Régimes”";
    - a Latin-1 .bib with `bibencoding=latin1` gives "Jürgen Müller and A Pérez".
- **`setMain` and share links.** `setMain` re-checks the project key after its await. A share link is marked before its project loads.


---

# Verification of PR 96 (dogfood-latex) at d0cd3a7, after the review of 17bb758

Verdict: **fix first**, for one new finding (V1). Everything the review raised (I1, I2, N1 to N6) is fixed.

Checks run on d0cd3a7, in a worktree build with dist/tex copied in and the build's engine.js:
- `npm test`: passes.
- `node test/engine.test.mjs`: 9/9.
- `test/files.py marks`: 18/0.
- `test/files.py` in full: 103/0.
- dist/tex against dev/dist-manifest.txt: 0 lines differ. engine.js is `f4d5e21b…` in the source, in dist/tex and in the manifest.
- Repros: `/tmp/latexrev/verify.py` (browser, with a stub engine that records the flags compilePdf sends) and `dev/texrun.py` for biber.

## The review's findings

| finding | status | evidence |
|---|---|---|
| I1 versions and setMain loosening a mark | fixed | A stranger's thesis.zip opens as `thesis (2)`, restricted. "thesis (2).zip" opens as `thesis (2) (2)`. "a\|b.zip" opens as `a b`. Opening another main file's version keeps the stricter mark: a clone named like one's own project stays restricted when opened from another project. files.py marks repro A and C pass. |
| I2 pull or branch switch dropping main | fixed | Clone, then pull to paper.tex: `git restricted`. Branch switch to b.tex (named by its latexmkrc): `git restricted`. |
| N1 \ensuremath | fixed | KaTeX renders `\text{in \R}`, `\text{area \ensuremath{\alpha}}`, `\text{a \text{b \R}}`, `\mathrm{x\R}` and `\text{$\R$}`. |
| N2 beamer [label] | fixed | `\item<+->[a)] Lab` gives label a) and text "Lab". 3c8aad4's bound holds: 5000 items each with an unclosed `[` and 40 nodes, 2.2 MB, build in 2.3 s against 1.6 s without the brackets. |
| N3 PDF freshness and shell mode | fixed | files.py marks: `was False, stale True, compiled again with shell escape`. |
| N4 guest record on setMain | fixed | files.py marks: guest after reload. |
| N5 biber from a folder | fixed | `talk/slides.tex` with `\addbibresource{../refs.bib}` finds it and prints [1]. A root main with `bib/refs.bib` works. A non-ASCII `références.bib` works. |
| N6 `figs\.htaccess` | fixed | files.py: left out. |

### N5 and the worker's path guard

- runBiber's own paths all go through `projectPath`, which refuses `..` and NUL and strips a leading `/`. Every data file therefore lands under `/home/web_user/biber`, and a bad name stops biber inside its try with a message.
- `\addbibresource{../../../etc/passwd.bib}`, `{/opt/perl-wasm/x.bib}` and `{../../rikuy-perl/RikuyUTF8.pm}` never reach biber: biblatex finds no such file for TeX and leaves them out of the .bcf. Biber read only `../refs.bib`, exit 0.
- Even a name that does reach biber can read only that run's biber instance: a new module per run holding biber's own package files and this project's data files. No other project's files are there.
- The Perl module is written after the data files, at a path no data file can reach.

## New findings

### V1 (important, new with this PR): Allow on one's own document can allow a stranger's repository cloned under the same name

Two parts combine:
- A git clone takes its name from the URL (`openRepoFiles`, src/app.js:3994) and is not given a free name, as .zip, repository folders and shared files now are.
- `allowMark` (src/collab.js:291) sets `allowed` on every already-marked key `name|doc` for the documents of the open project.

Repro (`verify.py` D):
1. One's own `thesis` has `thesis.tex` and `talk/slides.tex`, unmarked.
2. Clone `github.com/x/thesis`, whose `talk/slides.tex` holds `\write18`. It is `thesis|talk/slides.tex`, git restricted.
3. Open one's own `thesis.tex` version. The carry gives it the stricter mark, `git restricted`, and the page says it was cloned from a git repository.
4. Allow it. Its compile runs with full shell escape, as expected.
5. Allow also set `thesis|talk/slides.tex` to allowed.
6. Open the clone's version: `['thesis|talk/slides.tex', 'git allowed', 'FULL', 'EVIL TEXT']`, and the same after a reload.

Without Allow for all documents the same collision still gets there, in more steps: setMain to one's own talk/slides.tex, then Allow there. Both mark and content are kept per `name|main`, so any key the user's own project shares with a stranger's makes their Allow the stranger's too.

Before this PR this did not happen: there was no carry and Allow covered one key.

Two more gaps of the same kind:
- Word: `openWordProject` (src/word.js:248) opens `fname` under `name|main.tex` without a free name.
- Projects from before this fix: .zip files opened under the user's own names stay shared, and Allow for all documents reaches them.

Fix:
- Give a clone, and a Word file opened, a free name, as `.zip` now gets.
- Have Allow for all documents lift only marks from the same import. Put an id in the mark at `markFromLink`, and allow other keys only where the id matches. Marks without an id, from before this fix, are then never allowed by the Allow of another key.

### V2 (pre_existing, important): two tabs, an archive dropped into the project in one, full shell escape in the other

`linkCache` is filled once per tab and never read again from storage. `adoptOtherTab` (src/app.js:4620) brings in the other tab's text when the name and main file match.

Repro (`verify.py` F):
1. Tab 1 and tab 2 have one's own `paper` open (`\usepackage{defs}`).
2. In tab 2, drop `defs.zip`, whose `defs.sty` holds `\write18`. Tab 2 is zip restricted.
3. Tab 1 adopts tab 2's text: `['paper|paper.tex', None, 'FULL']` with the evil defs.sty.

The same code is in 08a4b38, so this is not new. Fix: when `adoptOtherTab` brings text in, read the mark again from storage (drop `linkCache`'s entry first), or have the mark written with the text.


---

# Second verification of PR 96 (dogfood-latex) at f73c5aa (4929f04 and the merge of main)

Verdict: **fix first**, for W1 and W2 below. Both come down to the same few lines in `freshMark` and `allowMark`. V1 and V2 are fixed.

Checks run on f73c5aa, in a worktree build with dist/tex copied in and the build's engine.js:
- `npm test`: passes.
- `files.py marks`: 23/0.
- `git.py`: 49/49.
- dist/tex against dev/dist-manifest.txt: 0 lines differ (engine.js `f4d5e21b…`).
- Repros: `/tmp/latexrev/verify2.py` (browser, with a stub engine that records the shell escape flags each compile sends).

## Fixed
- **V1:** `github.com/x/thesis` cloned beside one's own `thesis` and `thesis (2)` opens as `thesis (3)`, git restricted. One's own Main document then Allow never reaches it.
  - Ids hold: a .zip's two documents share one id through Main document. Opening the versions twice and Allow then Main document stay within that import.
  - A share link's payload cannot set an id or `allowed`: `markFromLink` builds the mark itself, `by` is made a string, and the id is random. A .zip's file names cannot set them either.
- **V2:** tab B drops `defs.zip` into the project. A third tab opens restricted, and tab A adopts the text restricted.
- **Earlier ones:** A and the pull and branch switch (I2) still pass.

## Still open

### W1 (important, new in 4929f04): a mark storage does not have is dropped, and the next compile has full shell escape

`freshMark` (src/collab.js) takes what storage says over what this tab holds. It keeps its own mark only when the tab changed it during the read. So if the mark's write failed, or the database went away, the restriction is lost. Before 4929f04 the compile used the tab's own copy and stayed restricted.

Repro, `verify2.py w1`:
- **Storage refuses the write** (as when it is full; the write's error is silently dropped): open a stranger's `evil.zip` and the compile gets `['evil|main.tex', None, 'FULL', 'EVIL TEXT']`.
- **Another tab deletes the database** (`indexedDB.deleteDatabase('galley')`; store.js closes on versionchange, and the next read opens an empty one): `['evil|main.tex', 'zip restricted' → None, 'FULL', 'EVIL TEXT']`.

Fix: `freshMark` returns `stricterMark(cached, stored)`. Storage can add a restriction but never removes one this tab holds; this tab loosens only through its own Allow, which updates its copy.

### W2 (important; older than this PR after a reload, and immediate since freshMark): Allow in a tab with an old view lifts a newer restriction made in another tab

`allowMark` reads the mark from the tab's copy and writes `{...old, allowed: true}` over whatever storage holds.

Repro, `verify2.py w2`:
1. Tabs A and B both have `proj.zip` open (`zip restricted id=yot2i`).
2. In tab A, drop `defs.zip`, whose defs.sty holds `\write18`. A becomes `restricted id=pacfi`; it is new files, so restricted again.
3. In tab B, which still shows the old text, click Allow. Storage now holds `allowed id=yot2i`.
4. Tab A compiles: `['proj|main.tex', 'zip allowed id=yot2i', 'FULL', 'EVIL TEXT']`.

Fix:
- `allowMark` reads storage again first, and refuses when the stored mark's id is not the one this tab shows, saying the project changed in another tab.
- Together with W1's stricter rule, tab A also keeps its own restriction whatever another tab writes.

## Design notes (not blockers)

- **A pull after Allow stays allowed.** A clone allowed once compiles later pulls, including one that renames main.tex, with full shell escape: `repo|b.tex git allowed, FULL`. That is trust in the remote, and older than this PR. A .zip dropped into a project, by contrast, takes the Allow back ("new files arrived"). Consider doing the same when a pull changes `.tex`, `.sty`, `.cls` or `.bib` files.

## The residual: a key shared by a stranger's import and one's own document from before the fix

Reproduced in `verify2.py residual`, with an id-less mark as the old code left it:
1. Before the fix, a stranger's clone was saved as `thesis` with main `talk/slides.tex`. One's own `thesis` has `talk/slides.tex` too.
2. Allow on one's own `thesis.tex` no longer reaches it: `the clone (not lifted)`, restricted.
3. But one's own Main document `talk/slides.tex` takes the stranger's restriction, because the key is shared. The user's Allow there, on their own talk, makes the key allowed.
4. Restoring the clone's version, which is "mine" because the name and main file match, gives `['thesis|talk/slides.tex', 'git allowed id=-', 'FULL', 'EVIL TEXT']`.

It needs all of these:
- data from before the fix, where a stranger's import was opened under one's own name;
- one's own project holding a document at exactly the stranger's main path;
- an Allow given on that document;
- a Restore of the stranger's version.

That is narrow.

**On a one-time migration:** dropping Allow on id-less marks (with or without "more than one import origin") would not stop this chain, since the Allow comes after the upgrade. And a browser cannot tell the origins of versions saved before the fix apart. Its only gain is to make users re-allow what they allowed before; it is cheap, but not worth much here.

**What would close the residual for good:** store the mark's id with each version when it is saved. When a version is opened or restored whose stored id is not the id of the key's mark now, or which has no id while the key has an id-less mark, mark the key restricted again with a new id. That is a follow-up, not needed to merge once W1 and W2 are fixed.


---

# Third verification of PR 96 (dogfood-latex) at 2384a3e, time-boxed

Verdict: **fix first**, for two small gaps in 2384a3e's own fixes:
- X1: a pull that changes a .py or .lua file but keeps its size keeps the Allow.
- X2: the check for an out-of-date Allow is passed once the old tab has compiled.

Each is a few lines to fix. Everything else holds.

Checks run on 2384a3e, in a worktree build with dist/tex copied in and the build's engine.js:
- `files.py marks`: 28/0.
- `git.py`: 49/49.
- dist/tex against dev/dist-manifest.txt: 0 lines differ.
- Repros: `/tmp/latexrev/verify2b.py` (verify2's scenarios) and `/tmp/latexrev/verify3.py`, both in the browser with a stub engine that records the flags each compile sends.

## Holding
- **Earlier repros:** A, D (clone named `thesis (3)`), B, the import ids, F/V2 and both W1 cases all stay restricted.
  - W1: storage refusing the write, and the database deleted by another tab.
  - A refused write is now said in a toast and under Problems.
- **W2 as first reported:** an Allow from tab B, with no compile there since tab A's drop, is refused.
- **Three tabs:**
  - tab A drops an archive;
  - tab C opens after the drop and is restricted with the new id;
  - the Allow in the middle tab B is refused;
  - A and C compile restricted.
- **Storage deleted, then Allow:** the tab kept its restriction and the Allow then works (the user's own decision).
- **Pull into an allowed clone:** these all restrict again with a new id and a note:
  - `.gitattributes` alone;
  - `.latexmkrc` alone;
  - a `.lua` added;
  - a `.py` added;
  - `x.lua` changed to another size.
  
  A picture alone keeps the Allow, as intended.
- **The residual** (a key shared with a stranger's data from before the fix) behaves as already described; it is PLAN task 71.

## Still open

### X1 (important): a same-size change to a .py, .lua or other non-.tex file keeps the Allow
`loadGitFiles` (src/app.js, `codeChanged`) compares a file outside `TEXT_EXT` by whether it exists and its `Blob.size`, not by its bytes. `TEXT_EXT` covers only tex, bib, sty, cls, bst, bbl, txt, ltx, dtx, clo, cfg, def, md and html. So `.py`, `.lua`, `.asy`, `.gp`, `.mp` and `.dat` files are compared by size alone.

Repro: an allowed clone with `run.py` = `print("hello")\n` (15 bytes) pulls `run.py` = `import os;os.E\n` (15 bytes). The result is `['git allowed', 'FULL']`, with no note.

A remote's owner can pad any script to the old size, and `\directlua{dofile(...)}` or a shell escape `python3 run.py` then runs the new code with full shell escape.

Fix: compare bytes. The new bytes are in `files`, and the old ones in `this.extra`'s Blob (`arrayBuffer`). A hash would also do.

### X2 (important): an old tab's Allow passes once that tab has compiled
`allowMark` decides a tab is out of date by comparing `shown`, the tab's in-memory copy, with the stored id. But `freshMark` writes the stored mark into that copy at every compile. So a tab that compiled after the other tab's new restriction counts as up to date, though it never got the other tab's text.

Repro, `verify3.py w2b`:
1. Tabs A and B have `proj.zip` open.
2. Tab A drops `defs.zip` (`\write18` in defs.sty). The stored mark is restricted with a new id, ycz9i.
3. Tab B has unsaved typing, so it adopts nothing, and compiles. It compiles restricted, but its copy now holds ycz9i.
4. Allow in tab B is accepted, and the stored mark becomes `[allowed, ycz9i]`.
5. Tab A stays restricted, because a tab never loosens on storage's word.
6. Tab A after a reload, or any new tab: `['proj|main.tex', 'zip allowed id=ycz9i', 'FULL', 'EVIL TEXT']`.

Fix: track the id under which this tab's *text* was loaded, adopted, imported or carried, and compare the stored id with that, not with the copy. Equivalently, `freshMark` adds the key to `markStale` whenever storage brings a different id than the copy held, and only `adoptOtherTab` clears it.


---

# Fourth verification of PR 96 (dogfood-latex) at b7cba45, time-boxed

Verdict: **merge.** X1 and X2 are fixed, every earlier repro still holds, and the new probes found nothing that blocks.

Checks run on b7cba45, in a worktree build with dist/tex copied in and the build's engine.js:
- `files.py marks`: 30/0.
- dist/tex against dev/dist-manifest.txt: 0 lines differ.
- Repros: `/tmp/latexrev/verify4.py`, `verify3c.py` and `verify2c.py`, in the browser with a stub engine that records the flags each compile sends.

## Fixed
- **X1:** pulls into an allowed clone restrict again with a new id and a note:
  - `run.py` padded to its old size;
  - `run.py` removed;
  - a `.bib` changed and nothing else. This is right: a .bib's fields reach TeX through the .bbl.
  
  A pull that changes nothing keeps the Allow.
- **X2:** tab B has unsaved typing and compiles after tab A's new mark, then clicks Allow. The Allow is refused, the stored mark stays `[False, h1tsu]`, and tab A after a reload compiles restricted.
  - Three tabs: the Allow in the middle tab is refused, and A and C compile restricted.

## The probes asked for
- **The race the author names:** a mark this tab makes while storage is read is not taken as another tab's. Result: allowed False, same id, not stale, and the Allow after it works.
- **A refused write during the read:** not stale, and the Allow applies in this tab. The toast from W1 already says that storage did not keep the mark.
- **Two Allows at once:** both resolve, the result is allowed and not stale, and the compile runs with full shell escape (the user's own decision).
- **Earlier repros:** A, D (the clone opens as `thesis (3)`), B, the import ids, W1 (a refused write, and a database deleted by another tab), W2, and F/V2 all hold.

## Notes (not blockers)
- **A picture is trusted by its name:** a pull that changes only `logo.png` keeps the Allow, even where an allowed `.tex` reads it as TeX with `\input{logo.png}`, or Lua reads it with `dofile`. The hook must already be in text the user allowed, so this is low.
  - Possible tightening: compare pictures too when the project's text names them outside `\includegraphics`.
- **PLAN task 71** (versions carrying the mark's id) still covers two cases:
  - another tab's text, kept as a "From another tab" version under a key the user later allows;
  - the residual from before the fix.
