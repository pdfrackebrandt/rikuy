# Hosting Rikuy on Cloudflare Pages

The hosted Rikuy is the build without `RIKUY_SHARE`: `dist/index.html` is an app the browser can
install, which works offline after one visit (docs/ARCHITECTURE.md, section 6). Cloudflare Pages
serves it as static files, free: static requests are unlimited, and a deployment may hold 20,000
files of at most 25 MiB each (Rikuy has about 300; its largest is 12 MB). GitHub Actions builds
and deploys it on every push to `main`; nothing is deployed from a laptop.

It runs at <https://rikuy.rackebrandt.pe/> (since 2026-11-13; step 7), in the open: the
repository is public with it, which is how the source of the GPL and AGPL programs it ships is
offered. `rackebrandt.pe/rikuy/` forwards there (a page of the maintainer's site). The project's
own address, <https://rikuy-3dl.pages.dev/> (the name `rikuy` was taken on pages.dev), where it
ran from 2026-11-10, answers since 2026-11-20 with a permanent redirect to
<https://rikuy.rackebrandt.pe/> (a Bulk Redirect in Cloudflare's dashboard). It stays the
target of the custom domain's CNAME (step 7). Browsers keep documents by address, so documents
someone kept in a browser at the old address are no longer reachable there; a copy installed
from the old address keeps working offline, with its documents. Every page names the new address
as its canonical one.

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
   type **CNAME**, name (host) **`rikuy`**, value (target) the project's own address
   (**`rikuy-3dl.pages.dev`** here), TTL as offered.
   Cloudflare checks it and issues the certificate, usually within minutes, sometimes an hour or
   two while the record spreads; the project's Custom domains page says Active when done. (Adding
   the CNAME before the domain is set up in Cloudflare gives errors until it is.)
8. **Leave Cloudflare Web Analytics off** for this project: it adds a script to the page that the
   page's policy refuses anyway, so it would count nothing.
9. **The git proxy's two settings** (`/git`, below). They protect the account's daily allowance
   of Functions requests, which `/git` shares with every Worker of the account.
   - **A rate limiting rule** (the free plan has one). In the dashboard, the zone
     `rackebrandt.pe`, **Security rules**, **Create rule**, **Rate limiting rules**. Rule name:
     `Rikuy git proxy`. When incoming requests match: Field **URI Path**, Operator **starts
     with**, Value `/git/`. With the same characteristics: **IP**. When rate exceeds: **10**
     requests per **10 seconds** (a push or a pull is two or three). Then take action: **Block**,
     Duration **10 seconds** (the free plan's only period and timeout). **Deploy**. One address
     can then make at most 86,400 `/git` requests a day, and a person never meets the limit.
   - **More git hosts, if wanted.** Workers & Pages, the project, **Settings**, **Variables and
     Secrets**, Production, **Add**: Type **Text**, Variable name `RIKUY_GIT_HOSTS`, Value the
     host names by commas or spaces (`git.uni.edu, gitlab.example.org`), **Save**; the next
     deployment uses them. Hosts that are not public names by DNS (an address, a port, `.local`)
     are ignored.

## What the workflows do

- **`tex.yml` (TeX)**, on every push to `main`: restores `dist/tex` from the Actions cache when
  `tex/`, `inputs/`, `package-lock.json` and `dev/dist-manifest.txt` are unchanged, or builds it
  from the pinned inputs; builds the page (`node build.mjs`); checks `dist/tex` byte for byte
  against `dev/dist-manifest.txt`; runs the tests that compile with TeX (`engines.py`, `pdf.py`,
  `offline.py`'s offline compile); keeps `dist/` as the artifact `rikuy-dist` for a week.
- **`deploy.yml` (Deploy)**, when a TeX run on `main` has passed: downloads that run's `dist/`,
  builds the page again from the same commit, checks the manifest and Pages' limits
  (`dev/pages_check.py`: 20,000 files, 25 MiB per file, 100 header rules), and uploads with the
  `wrangler` pinned in `package.json` (`wrangler pages deploy dist --branch main`), then checks
  the live site (`dev/live_check.py`): the page is this build, its policy names the hash of the
  script it serves, `no-transform` and HSTS are there, the widget document answers at its address
  without `.html` with its own policy, and `/git` passes git's request and refuses an IP address.
  Deploys run one at a time, in order.
- **What Pages serves**: `_headers` (written by `build/app.mjs`): the page's Content-Security-
  Policy (the one the browser tests run under: scripts only from the site and the app's bundle
  inline by its SHA-256, which the build computes from `rikuy.html`, the copy the tests run;
  `index.html` loads the same bytes as `app-<hash>.js`, and its one inline script, the guard that
  says so when that file does not load (`BOOT_GUARD` in `build.mjs`), by its SHA-256 too; WebAssembly but no
  eval; no outside source, git included (it goes through `/git`, below); `frame-ancestors
  'none'`), and for `widget-<hash>.html`, the document
  live figures run in, the widgets' own policy in its place (`frame-ancestors 'self'`, no
  `X-Frame-Options`), `Strict-Transport-Security: max-age=31536000` (HTTPS only for a year, for this host
  alone: no `includeSubDomains`, no preload), `nosniff`, `Referrer-Policy: no-referrer`, a Permissions-Policy turning off cameras,
  microphones, location and the like; TeX packs, engine chunks, programs and fonts (named by their
  hash) cached for a year as immutable; the page, `sw.js` and the manifest revalidated on every
  request, the page with `no-transform` (an inline script added on the way, as Email Address
  Obfuscation adds one, would not run, and nothing may rewrite the page); `app-<hash>.js`, the
  app's script, cached for a year as immutable and with `no-transform` too.
  `404.html` keeps Pages from answering a missing file with the page.
- **The git proxy, `/git`**: a Pages Function, `functions/git/[[path]].js` (the code is
  `src/gitproxy.js`), which `wrangler pages deploy` finds beside `dist/` and deploys with it. A
  browser cannot speak git to GitHub or GitLab itself (they send no CORS headers), so the Git
  panel's push, pull and clone go to `/git/<host>/<path>` on Rikuy's own site, and the page's
  policy keeps `connect-src 'self'`: no third party sees a token. It forwards git's smart HTTP
  and nothing else: `GET …/info/refs?service=git-upload-pack` or `git-receive-pack`, and `POST
  …/git-upload-pack` or `…/git-receive-pack` with git's own content type and at most 32 MiB,
  over https to the git hosts it knows: github.com, gitlab.com, bitbucket.org, codeberg.org,
  gitea.com, git.sr.ht, huggingface.co, dev.azure.com and git.overleaf.com, and those named in
  the project's variable `RIKUY_GIT_HOSTS` (below), each a public host by name (no IP address in
  any form, no port, no private name); a redirect only to the same host. It answers Rikuy's git
  client alone: a request must carry the header `X-Rikuy-Git: 1`, which the page sends and
  another site's page cannot send without a preflight (refused), and a navigation, anything but
  a script's fetch, or another site's request (`Sec-Fetch-*`, `Origin`) is refused, so a link to
  `/git/...` shows nothing. Every answer, refusals too, is git's own content type or
  `application/octet-stream`, with `Content-Security-Policy: default-src 'none'; sandbox`,
  `Content-Disposition: attachment`, `Cross-Origin-Resource-Policy: same-origin`, `nosniff` and
  `no-store` (Pages applies no `_headers` to a Function's answers; the service worker of an
  installed copy refuses a navigation to `/git` itself). An answer stops at 256 MiB or 120 s.
  `Authorization` goes to that host alone and is never logged; cookies and a host's question for
  a password (`WWW-Authenticate`) go neither way; nothing is cached. wrangler writes a `_routes.json` that sends only `/git/*` to the function,
  so every other file stays a static file. **Cost:** a git request is one Functions request; a
  push or pull is two or three. The free plan allows 100,000 a day (Workers and Pages Functions
  together, from midnight UTC), 10 ms of CPU each (the proxy waits on the network, which does not
  count), 128 MB of memory and 50 outgoing requests per request; past the daily allowance
  `/git` answers with Cloudflare's error 1027 until midnight UTC, and the static site is not
  affected. Static requests stay free and unlimited. Locally `test/gitproxy_server.mjs` runs the
  same code (`test/git.py`), and `test/gitproxy.test.mjs` checks what it lets through. Two
  settings in Cloudflare's dashboard, which no file can make (step 9).
- **For crawlers and AI agents**: `robots.txt` (everyone allowed, the AI services' crawlers by
  name too), `sitemap.xml`, `llms.txt` (what Rikuy is, what a person can do with it, how an agent
  builds a link that opens a document in it, the page's controls by name and `rikuy.api`) and
  `llms-full.txt` (the same with the keys, the engines and the sample's source); these four are
  served as UTF-8 text with `Access-Control-Allow-Origin: *`, and no other file is. The page
  itself says what it is before any script runs: `<html lang="en">`, its title and a schema.org
  `SoftwareApplication` block in the head, and a few plain lines at the top of the body that a
  screen does not show. Its head also has a canonical address and the tags a pasted link's
  preview reads, with `og.png` (`docs/screenshot.png`). All carry the site's address:
  `RIKUY_SITE` at build time, by default the hosted copy's. The service worker keeps none of the
  five files.

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
