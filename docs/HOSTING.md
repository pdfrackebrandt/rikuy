# Hosting Rikuy on Cloudflare Pages

The hosted Rikuy is the build without `RIKUY_SHARE`: `dist/index.html` is an app the browser can
install, which works offline after one visit (docs/ARCHITECTURE.md, section 6). Cloudflare Pages
serves it as static files, free: static requests are unlimited, and a deployment may hold 20,000
files of at most 25 MiB each (Rikuy has about 300; its largest is 12 MB). GitHub Actions builds
and deploys it on every push to `main`; nothing is deployed from a laptop.

Since 2026-11-10 it runs at <https://rikuy-3dl.pages.dev/> (the name `rikuy` was taken on
pages.dev), in the open: the repository is public with it, which is how the source of the GPL and
AGPL programs it ships is offered. `rackebrandt.pe/rikuy/` forwards there (a page of the
maintainer's site). Browsers keep documents by address, so a move to another address (step 7)
leaves what people kept behind at the old one: decide it early.

## Once, by hand

1. **A Cloudflare account** (the free plan is enough): <https://dash.cloudflare.com/sign-up>.
   Its **account ID** is on the dashboard's Workers & Pages overview, in the right column, and
   in the dashboard's address (`dash.cloudflare.com/<account id>/...`).
2. **An API token that can only deploy Pages.** My Profile, API Tokens, Create Token, Create
   Custom Token. Name it `rikuy-deploy`; Permissions: **Account, Cloudflare Pages, Edit** and
   nothing else; Account Resources: Include, your account. Continue, Create Token, and copy it
   (it is shown once).
3. **The Pages project** needs no step: the first deployment creates it, named `rikuy`
   (`https://rikuy.pages.dev`, or `rikuy-<letters>.pages.dev` if that name is taken; another name
   works if the variable below says it).
4. **The secrets on GitHub.** In `pdfrackebrandt/rikuy`: Settings, Secrets and variables,
   Actions. New repository secret `CLOUDFLARE_API_TOKEN` (the token) and `CLOUDFLARE_ACCOUNT_ID`
   (the account id). If the project is not called `rikuy`, add under Variables
   `CLOUDFLARE_PROJECT_NAME` with its name. Until both secrets exist, the Deploy workflow runs,
   says "Not deployed" and changes nothing.
5. **First deployment.** Actions, TeX, Run workflow on `main` (about an hour the first time, while
   it builds the TeX tree; later runs take the tree from the cache). When it passes, Deploy runs
   by itself. Check `https://rikuy.pages.dev`.
6. **Private until launch** (not in use: the launch was public). Rikuy ships GPL and AGPL programs, so a copy anyone can open comes
   with the duty to offer its source; while the repository is private, keep the site to yourself.
   Cloudflare dashboard, Zero Trust (the free plan covers 50 people), Access, Applications, Add an
   application, Self-hosted: application domain `rikuy.pages.dev` (and a second application for
   `*.rikuy.pages.dev`, the address every single deployment also gets), one policy, Allow, Include,
   Emails, your address. Signing in is a code Cloudflare mails you. The page asks for its manifest
   with credentials (`build/app.mjs`), so installing and updating work behind the wall, and an
   installed Rikuy keeps working offline whether or not the sign-in has lapsed. At launch: delete
   the two applications, make the repository public.
7. **The address, at launch.** Either the subdomain below, or `rackebrandt.pe/rikuy`: a path
   under the site needs the whole domain's DNS on Cloudflare (free: add the site in Cloudflare,
   copy the existing records, switch the nameservers at Punto.pe) and a Worker route that hands
   `/rikuy/*` to this project; the page is built for any folder, so nothing in the build changes.
   **rikuy.rackebrandt.pe.** First in Cloudflare: Workers & Pages, the `rikuy`
   project, Custom domains, Set up a custom domain, `rikuy.rackebrandt.pe`, Continue. Cloudflare
   then shows a CNAME to add. Then in Punto.pe's DNS panel for `rackebrandt.pe`, add a record:
   type **CNAME**, name (host) **`rikuy`**, value (target) **`rikuy.pages.dev`**, TTL as offered.
   Cloudflare checks it and issues the certificate, usually within minutes, sometimes an hour or
   two while the record spreads; the project's Custom domains page says Active when done. (Adding
   the CNAME before the domain is set up in Cloudflare gives errors until it is.)
8. **Leave Cloudflare Web Analytics off** for this project: it adds a script to the page that the
   page's policy refuses anyway, so it would count nothing.

## What the workflows do

- **`tex.yml` (TeX)**, on every push to `main`: restores `dist/tex` from the Actions cache when
  `tex/`, `inputs/`, `package-lock.json` and `dev/dist-manifest.txt` are unchanged, or builds it
  from the pinned inputs; builds the page (`node build.mjs`); checks `dist/tex` byte for byte
  against `dev/dist-manifest.txt`; runs the tests that compile with TeX (`engines.py`, `pdf.py`,
  `offline.py`'s offline compile); keeps `dist/` as the artifact `rikuy-dist` for a week.
- **`deploy.yml` (Deploy)**, when a TeX run on `main` has passed: downloads that run's `dist/`,
  builds the page again from the same commit, checks the manifest and Pages' limits
  (`dev/pages_check.py`: 20,000 files, 25 MiB per file, 100 header rules), and uploads with the
  `wrangler` pinned in `package.json` (`wrangler pages deploy dist --branch main`). Deploys run
  one at a time, in order.
- **What Pages serves**: `_headers` (written by `build/app.mjs`): the page's Content-Security-
  Policy (the one the browser tests run under, without outside sources, and `frame-ancestors
  'none'`), `nosniff`, `Referrer-Policy: no-referrer`, a Permissions-Policy turning off cameras,
  microphones, location and the like; TeX packs, engine chunks, programs and fonts (named by their
  hash) cached for a year as immutable; the page, `sw.js` and the manifest revalidated on every
  request. `404.html` keeps Pages from answering a missing file with the page.

## Updates reach people this way

A deployment changes the version (a hash over every file but the packs). An open Rikuy finds the
new `sw.js`, keeps the new version in the background and shows **Update ready** in the status
bar; a click restarts it on the new version (the work is saved first), and otherwise it starts the
next time Rikuy is opened. A tab never runs the page of one version with the TeX worker of another.

## Rolling back

- **At once:** Cloudflare dashboard, Workers & Pages, `rikuy`, Deployments; on an earlier
  deployment, the menu (three dots), **Rollback to this deployment**. Pages serves it immediately.
- **From GitHub:** Actions, Deploy, Run workflow, with the id of the TeX run to deploy (from its
  address, `.../actions/runs/<id>`); its artifact must still exist (a week). Or revert the commit
  on `main`, which deploys the reverted state.

Either way the installed copies see a different version and offer **Update ready**, as for any
update; nothing has to be cleared by hand.

## Which browsers do what

| | install | offline after one visit | open .tex/.bib/.zip from the file manager | share files to it |
|---|---|---|---|---|
| Chrome, Edge (Windows, macOS, Linux, ChromeOS) | yes | yes | yes, once installed | ChromeOS |
| Chrome on Android | yes | yes | no | yes, once installed |
| Safari (macOS 14+, iOS 16.4+: Add to Dock / Home Screen) | yes | the page, yes; compiling offline untested | no | no |
| Firefox | no (desktop) | the page, yes; compiling offline untested | no | no |

Rikuy's tests run in Chromium. Compiling offline needs TeX's synchronous reads of packs to reach
the service worker from a worker started from a blob, which Chromium does; Safari and Firefox are
not tested for it.

## Checking it before a push

```sh
npm run build && npm run serve:app      # http://127.0.0.1:8791, served as Pages serves it
python3 dev/pages_check.py dist         # deploy.yml's check
```
