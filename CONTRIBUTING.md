# Contributing to Rikuy

Thanks for taking the time. Bug reports with a document attached are the most useful thing you
can send; pull requests are welcome too. A security problem goes by email or private report
instead ([SECURITY.md](SECURITY.md)).

## Reporting a bug

Open an issue with:

- the smallest `.tex` file (and its `.bib` or images) that shows the problem, or the zip
  Rikuy's **Download LaTeX** gives;
- what you did on the page, what you expected and what happened;
- your browser and its version.

If a document compiles differently from a desktop TeX Live, say whether TeX Live 2026 on your
machine compiles it, and attach both PDFs if you can. Rikuy is measured against TeX Live 2026, so
a difference from an older TeX Live may be TeX Live's change, not Rikuy's.

## Changing the code

1. Read [AGENTS.md](AGENTS.md). Despite the name it is the shortest complete guide for anyone:
   the map of the repository, the setup, every command and what each one checks.
   [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains how the parts fit.
2. Make the change on a branch of your fork.
3. Run the checks that cover what you touched (AGENTS.md, "Checking a change"). `npm test` is
   the minimum. CI runs it, the editor model on the 716 document corpus, and the browser tests
   that need no TeX tree; the TeX checks (`npm run test:engines`) are yours to run.
4. Open a pull request saying what changed, why, and what you ran. For a fix found on a real
   document, include that document or a reduced copy of it as a test.

Some conventions keep the repository honest:

- Every download is pinned by hash, and `dist/tex` is rebuilt byte for byte from the same
  inputs. If your change moves `dev/dist-manifest.txt`, update it in the same commit and say why.
- `tex/vendor/` holds build outputs of `tex/build_tools.sh`. Change the script or the patches in
  `tex/native/`, never the binaries by hand.
- Patches to other projects' sources are small scripts that check their anchor text exists, so a
  version bump fails loudly instead of patching the wrong place.
- A commit is one finished change; its message says what changed and the evidence (tests,
  corpus counts).

Coding agents are welcome contributors on the same terms. AGENTS.md is written for them, and a
pull request from one should say which checks it ran, like any other.

## License

Rikuy is under the GNU Affero General Public License 3.0 or later. By sending a contribution
you agree that it is licensed under the same terms. There is no contributor agreement to sign.
