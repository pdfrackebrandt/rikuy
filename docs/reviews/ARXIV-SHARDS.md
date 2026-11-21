# Hostile review: PR 99, arxiv-shards (0a8f4d6)

Verdict: fix first. M1 to M3 are a few lines each. Together, M1 and M2 mean that one cache
problem fails all eight shards and then force pushes an empty result to `arxiv-results`.

Checks run in a worktree of origin/arxiv-shards:
- `python3 test/arxiv_limits.py`: 13/13 (the browser case ran)
- `python3 test/arxiv_collect.py`: 6/6
- `actionlint`: clean
- `arxiv_collect.py` with no shard files: exits 0 and writes two empty files (this is M1)

## Medium

M1. Collect wipes `arxiv-results` when the shards never ran (`.github/workflows/arxiv.yml:276-311`, `dev/arxiv_collect.py:78`).
`collect` runs with `if: always()`. When the shards are skipped or all fail before they upload, `shards/` holds only `arxiv-ids`. The merge then writes empty jsonl files and exits 0, and `git push -f origin arxiv-results` replaces the last good merge.
This path already existed when `rikuy` failed. The PR adds two likely triggers: a `desktop` job built to stop on a slow mirror, and `fail-on-cache-miss` in every shard.
Fix: set `if: always() && (inputs.from_run != '' || needs.shard.result != 'skipped')`, and make `arxiv_collect.py` exit 1 when it keeps 0 result rows. A threshold on "papers without a row" could also stop the push, with an input to override it.

M2. The cache entry is never confirmed, and the shards stop on a miss (`arxiv.yml:139-151`, `:186-190`).
`actions/cache/save` v4.3.0 only logs a warning when the upload fails, so the `desktop` job passes and all eight shards then fail on the miss.
Eviction is a second risk. The repository has a 10 GB limit and holds `arxiv-src-*`, `rikuy-dist-*`, `dist-tex-*` and npm entries. `tl26-debs` (2.5 GB) is last used at the start of the run, while `sources` saves hours later and `tex.yml` pushes refresh `dist-tex`. Under LRU eviction, `tl26-debs` can be the one removed.
Fix:
- In `desktop`, use `lookup-only: true` on the first restore, so a hit does not download 2.5 GB for nothing.
- After the save, add a `cache/restore` with `lookup-only: true` and `fail-on-cache-miss: true` to prove the entry exists.
- In the shards, drop `fail-on-cache-miss`. `fetch_tl26.sh` already fetches whatever is missing, and the download is now bounded. In the worst case the shard writes 'budget' rows instead of being cancelled.

M3. A hostile paper can stop the comparison step, and the budget cannot stop it (`arxiv.yml:255-262`).
`pdfcompare.py`'s alarm and sweep run as `corpus`, the same uid as the paper's shell escape. A line like `kill -STOP $PPID` in a chain up to pdfcompare means the alarm never fires. The step has no `timeout-minutes`, so the job runs to 350 and is cancelled. It is unclear whether the shard's upload, which holds Rikuy's rows too, still runs after that.
Fix: enforce the deadline from outside the namespace, e.g.

    sudo timeout -k 30 $((SHARD_START + COMPARE_UNTIL*60 + 300 - $(date +%s))) sh dev/sandbox.sh ...

`sandbox.sh` execs `unshare --kill-child`, so a KILL from `timeout` ends the whole namespace. Use the same form for the compile step. Optionally, upload Rikuy's results right after "Keep Rikuy's results".

## Low

L1. A bad `.part` blocks every rerun when `MIRROR == ARCHIVE` (`dev/fetch_tl26.sh:45`).
That is the default for local use. On a hash mismatch the `.part` stays, and `curl -C -` resumes after the bad bytes on every rerun. Before this PR, `-o` overwrote it.
Fix: `good || { rm -f "$f.part"; echo ... >&2; exit 1; }`.
A truncated or tampered partial is never accepted: `mv` happens only after the sha512 check (453 of 453 packages use sha512).

L2. `npm test` now needs Linux (`test/arxiv_limits.py:52,70`).
Without `/proc`, the watchdog's sweep raises inside its thread (caught and printed), and `pg.evaluate('new Promise(() => {})')` then waits forever. With Playwright installed, `npm test` hangs on macOS; without it, the test fails.
Fix: skip the file unless `sys.platform.startswith('linux')`. Bound the evaluate, e.g. `new Promise(r => setTimeout(r, 60000))`, so a broken watchdog fails the test instead of hanging it.

L3. The sweep can kill Xvfb's children (`dev/pdfcompare.py:68`, `dev/doclimit.py:70`).
`keep` spares only the Xvfb process itself. Xvfb starts without `-noreset`, so it runs xkbcomp each time its last client leaves. A sweep that lands during that compile kills it, and a failed keymap is fatal to Xvfb. After that, every later paper's asy 3D draws blank.
Fix: add `-noreset`, and spare the descendants of kept pids in `sweep`.

L4. A watchdog that fires as a document ends breaks the next one (`dev/corpus_full.py:136`).
Right after the kill, `is_connected()` can still return True, so the next paper gets a false "harness Target closed" row.
Fix: `if dog.fired: pg = fresh()`, closing the old page and browser first.
Separately, after three failed launches every remaining paper gets 'harness no page' (line 111). Try `fresh()` again per document while the budget allows.

L5. A paper's output can fill memory (`dev/doclimit.py:98`).
The output goes to a `TemporaryFile` in the sandbox's `/tmp`, a tmpfs with no `size=`. A paper printing for 600 s can fill RAM. This is still better than `capture_output`.
Fix: give the tmpfs a `size=` in `sandbox.sh`, or put the file on disk (`dir=` under home).

L6. The comparison runs even when "Keep Rikuy's results" failed (`arxiv.yml:256`).
Integrity still holds, because `rikuy-out` is not mounted writable in the compare step. A half done move would still give a crash or a partial comparison.
Fix: give the Keep step an id and add `steps.keep.outcome == 'success'` to the condition.

## Nits

- If `SHARD_START` is unset, `DEADLINE` comes out as 12600 and every row silently becomes 'budget'. Use `${SHARD_START:?}`.
- `pdfcompare.py:248` marks rows that need no compile (`ok` None) as 'budget', which inflates the "left for lack of time" count.
- When `pdfcompare.py` resumes, its `done` set includes 'budget' rows, so those papers are never compared again.
- The workflow has no `concurrency:` group. Two dispatches would race on the cache save.
- `fetch_tl26.sh:41` throws away up to 2 h of the mirror's partial download before trying the archive. Resuming it would be safe, since the final hash check still decides.
- The http archive and mirror are fine: every package is sha512 pinned, and curl refuses redirects to non http(s) URLs.

## Checked and fine

- **Cache poisoning from a PR or a fork: not possible.**
  - The workflow is dispatch only. PR caches are scoped to `refs/pull/N/merge` and branch caches to their branch.
  - The restore uses the exact key with no `restore-keys`, and no other workflow's prefix (`dist-tex-`) matches `tl26-debs-`.
  - A key cannot be changed once saved. The shards run after `desktop` and have no network or token inside the sandbox.
  - One limit, not new to this PR: `actions/cache` extracts with `-P`, so a crafted entry could write outside `debs` despite the per package hash checks. That is the same trust every main scoped entry gets, `rikuy-dist` included.
- **Workflow setup:** actions are pinned by SHA with the same pins as elsewhere. Permissions are unchanged, and `desktop` inherits `contents: read`. `needs:` is correct: `desktop` is skipped with `from_run`, and the shards are skipped with it. `sandbox.sh` and the `-w` sets are unchanged.
- **doclimit.py:**
  - In CI it only sees the sandbox's PID namespace. Elsewhere it reaches only its own descendants.
  - `killpg` is called only on a child that has not been reaped, so its pgid cannot be reused, and `setpgid` cannot leave the session.
  - A `setsid` daemon comes back to pdfcompare through the subreaper.
  - Zombies are filtered out, and only killed pids are reaped.
  - `corpus_full.py` leaving the subreaper unset is correct: if it were set, orphaned Chromium processes would come back at depth 1, where `sweep(depth=2)` does not look.
- **Budget math:**
  - A Rikuy compile that starts at minute 204.5 ends by 210. Browser relaunches add up to 15 minutes that are not budgeted; the comparison's absolute deadline absorbs them.
  - The comparison ends by 335, which leaves about 14 minutes for taking out and uploading the results.
  - The 240 minute step backstop on the compile step is safe.
- **arxiv_collect.py:** the totals are correct, and SPARE, PDF-ONLY and NO-MAIN are excluded, consistent with `corpus_full.py:23`.

## Fixes (on top of 0a8f4d6)

- **M1.** collect runs only when the shards ran, or with `from_run`. `arxiv_collect.py` exits 1 when it keeps no result row, so nothing is committed. It exits 2 when the run is partial (a paper with no row, or one left for lack of time) and has fewer tried papers than the `arxiv-results` already there; that merge then stays, and this one goes to `arxiv-results-partial-<run>`. Tested in `test/arxiv_collect.py` (9/9; the two new cases fail with the exits taken out).
- **M2.** In the `desktop` job, the first restore is `lookup-only`, and after the save a `lookup-only` restore with `fail-on-cache-miss` confirms the entry. The shards no longer use `fail-on-cache-miss`: `fetch_tl26.sh` downloads whatever is missing, within the step's new 150 min limit.
- **M3.** Both sandbox steps run under `sudo timeout -k 30 <seconds to the deadline + 300>`. `timeout -k 2 3 unshare --pid --fork --kill-child ...` around processes that ignore TERM, one of them in a session of its own, ended everything in 5 s (exit 137). Rikuy's rows are now uploaded as `arxiv-shard-<k>-rikuy` before the comparison starts (collect's glob takes them).
- **L1.** A part of a download that is not good is removed before the script exits. The archive resumes a transfer the mirror broke off, and then tries once from nothing. Tested on one package: a fresh download, a stale part of 30 KB of zeros (ends with the right bytes), and the mirror down (falls back to the archive).
- **L2.** `test/arxiv_limits.py` exits 0 off Linux, and the browser case's evaluate is bounded to 60 s.
- **L3.** Xvfb runs with `-noreset`. `sweep` spares the kept pids and everything under them. New case: a kept process and its child survive a sweep, and another child is killed (it fails without the change).
- **L4.** After every watchdog kill, `corpus_full.py` closes the old browser and starts a new one. A failed launch is retried for each document (once, if the budget allows another 5 min).
- **L5.** The sandbox's `/tmp` is a 4 GB tmpfs, and `/var/tmp` and `/dev/shm` 1 GB each. `sandbox_check.py` passes inside it.
- **L6.** The Keep step has `id: keep`, and the comparison requires its success.
- **Nits:**
  - `${SHARD_START:?}`.
  - pdfcompare marks 'budget' only on rows that need a compile.
  - A resumed pdfcompare drops its 'budget' rows and compares those papers again (new case).
  - `concurrency: arxiv-corpus`.
  - The mirror's partial download is resumed by the archive.

Checks: `test/arxiv_limits.py` 15/15, `test/arxiv_collect.py` 9/9, `test/arxiv_unpack.py` 10/10; three papers through `corpus_full.py`; pdfcompare's budget and resume on real rows; actionlint 1.7.12 clean.

## Verification of 3b57bc0 (the answer to this review; 25 minute check)

Verdict: fix first. F1 and F3 are a few lines each. The rest of 3b57bc0 holds.

Checks at 3b57bc0:
- `test/arxiv_limits.py`: 15/15 (the browser case ran)
- `test/arxiv_collect.py`: 9/9
- `actionlint`: clean
- Probes: `arxiv_collect.py` run on hand made shard folders (A to C below), and `timeout -k` against `unshare --kill-child` with processes that ignore TERM and leave their session

**Held:**
- M1: collect is skipped when the shards were skipped, and 0 rows exits 1.
- M2: the first restore is lookup only, the save is confirmed, a shard falls back to downloading on a miss, and the setup step has 150 min.
- M3: the outer `sudo timeout -k 30` works. Tried here, a namespace whose processes ignore TERM and leave their session is gone at KILL, with nothing left over.
- L1 to L6 and the nits.
- Artifact names against collect's glob: `arxiv-shard-k-rikuy/arxiv-results-k.jsonl` and `arxiv-shard-k/arxiv-pdfcompare-k.jsonl` each match exactly one glob. Older runs' artifacts (both files in `arxiv-shard-k`) still merge.
- Partial branch name: `$RUN` is checked to be digits only before the merge step, and it reaches the shell as an env value, not through `${{ }}`. `arxiv-results-partial-<digits>` cannot be injected.
- tmpfs sizes: the repository is public, so runners have 16 GB. /tmp at 4g holds a paper's copy, its build, the `tlhome` copy and both PDFs' PGMs (a 300 page paper is about 0.3 GB). /dev/shm at 1g is well above the 64 MB that breaks Chromium. I did not measure the size of the warmed `/mnt/tl26/home`.
- Concurrency: a fixed group with `cancel-in-progress: false` serialises runs, including `from_run` collects, and nothing else pushes `arxiv-results`. Nit: GitHub keeps one pending run per group, so a third dispatch silently cancels the second.

**F1 (Medium): a partial comparison replaces a complete one** (`dev/arxiv_collect.py:107`).
The partial rule looks only at `results`. Probe A: results 3/3, comparison 1/3, previous merge complete gives exit 0, and `arxiv-results` is force pushed with the partial comparison.
The comparison is now the part most likely to be cut short: it runs last, the outer timeout kills it, and its rows upload separately from Rikuy's.
Fix: apply the rule to both kinds. Fetch the branch's `arxiv-pdfcompare.jsonl` too, and count compared rows (no `budget`, no over the limit error). Return 2 when either kind is partial and has fewer rows than the previous one.

**F2 (Low): harness failures count as tried** (`arxiv_collect.py:74`).
`done_rows` counts `harness no page` rows. Probe B: every row `harness no page` against a complete previous merge gives exit 0. A run with no browser for most of a shard replaces a good merge.
Fix: leave `harness no page` (and `gone`) out of `done_rows`, and count such papers as missing for the partial test.

**F3 (Low): a failed fetch of the previous merge means "no previous merge"** (`arxiv.yml:344`).
Any `git fetch` failure, such as a network blip, is treated as no previous merge. Probe C: any partial run then exits 0 and replaces the full merge.
Fix: `git ls-remote --exit-code --heads origin arxiv-results`. Exit 2 means the branch is absent: go on without a previous merge. Any other failure, or a failed fetch after that, fails the job.

**F4 (Low): papers can end up with no row instead of a 'budget' row** (`dev/corpus_full.py:104,145`).
When the compile step starts late, `left` can be 1 s. corpus_full launches Chromium (up to 300 s) before its first budget check, so the outer kill lands before any 'budget' row is written. The empty file then reads as "papers without a row".
The same happens when the last document that fits fails at about minute 209: `fresh()` can take 3 x 300 s, and the kill at 215 comes before the remaining papers get their 'budget' rows.
Fix: write the 'budget' rows without starting a browser when nothing fits. After a failure, start a browser lazily: the per document `if pg is None and budget.fits(...)` already does that.

## Fixes of the verification (on top of 3b57bc0)

- **F1.** The partial rule applies to both kinds. collect fetches the branch's `arxiv-results.jsonl` and `arxiv-pdfcompare.jsonl` into a folder, and `arxiv_collect.py` exits 2 when either kind is partial and has fewer rows that count than before. A comparison row counts unless it is 'budget' or 'over the ... limit'. Probe A as a test: 3 of 3 compiled, 1 of 3 compared, against a complete merge, now exits 2.
- **F2.** A result row counts unless it is 'budget', 'harness no page' or 'gone'. Probe B as a test: every paper without a browser or a source, against a complete merge, now exits 2.
- **F3.** `git ls-remote --exit-code --heads origin arxiv-results`. Exit 2 means no merge yet. Any other exit, or a failed `git fetch` or `git show` afterwards, fails the job under `bash -e`. Checked here: 0 for arxiv-results, 2 for a missing branch.
- **F4.** `corpus_full.py` starts Playwright and the browser only when a document needs them. A document without a page must fit `limit + 300` s (the start) before one is started. After a failure or a watchdog kill, the next document starts a new browser only if it fits. A shard past its budget writes its 'budget' rows at once, and needs no Playwright to do it. New test: with the browsers' path leading nowhere and the deadline 60 s away, two 'budget' rows in under 30 s; on 3b57bc0 it exits 1 with no row.

Checks: `test/arxiv_limits.py` 16/16 and `test/arxiv_collect.py` 11/11. The three new cases fail on 3b57bc0's scripts. `test/arxiv_unpack.py` 10/10, three papers through `corpus_full.py` (a looping TeX stopped, the next compiled), actionlint 1.7.12 clean.
