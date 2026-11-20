# Hostile security review: sec-followups (PR 81) at b8b44c4 (S3 e14b888, S2 645aaf6, S5 68db1e9, S4 fd09337)

Verdict: **fix first.** Two small fixes, M1 and M2. The official host holds up under S3, S5 blocks injection, KaTeX 0.19 draws as well or better, and HSTS is right. Scripts and outputs are in `/tmp/review-sec-out/`.

Note: someone is still editing the worktree. Uncommitted changes to `build/app.mjs` (`gitProxy()`, which adds `https://cors.isomorphic-git.org` to `connect-src`), `src/app.js`, `test/browser.py` and `test/git.py`, with `dist/` rebuilt at 12:24. Because of them, `npm test` fails on `deploy_check.py` (the committed test pins `connect-src 'self' blob:`). Every other test in the chain passed. These changes are not part of what I reviewed, and they need their own review before anyone commits them. Their own comment says the proxy forwards to any host, so `connect-src` would then let the page and all its workers reach any host, and git tokens would go to a third party.

## Findings

### M1 (Medium; Low on rikuy.rackebrandt.pe): the widget shell runs script for any parent that is not stopped by headers
`src/widget.js:34` checks only `e.source !== parent`. Then it `document.write`s whatever HTML arrives into a document of the site's own origin. Isolation rests on two things: the `/widget-*` header (`frame-ancestors 'self'`) and every caller remembering `sandbox`. `runWidget` (`:57-63`) does not set `sandbox` itself.
- Repro 1 (`s3_selfhost.py`): serve the app build without `_headers`. ARCHITECTURE and AGENTS say `dist/index.html` works on "any static server". `evil.test` frames `selfhost/widget-<hash>.html` and answers its request. Result: `{'origin': 'http://selfhost.test:8835', 'ls': 'write ok'}`, meaning the attacker's script ran as the copy's origin. In Chromium the storage it wrote is partitioned. Reaching the copy's first-party storage (projects, git tokens) would need one more step, such as a same-origin popup opened after a click. I did not reproduce that step.
- Repro 2 (`s3_attack.py` case 4): a same-origin frame of the shell with no `sandbox` attribute gets the page's origin, `localStorage`, IndexedDB and `parent.document`.
- Fix (verified in `s3_fixcheck.py`): `if (e.source !== parent || e.origin !== location.origin || self.origin !== 'null' || ...) return;`. Even in a sandboxed frame, `location.origin` is the URL's origin, and `self.origin` is `'null'` only when the frame is sandboxed. Results: a cross-site parent is refused, an unsandboxed frame is refused, and the sandboxed widget still runs. Also make `runWidget` set `sandbox="allow-scripts"` itself.

### M2 (Medium, functional regression from S5): Edit Comment does nothing on a base32 comment
`src/cmd/review.js:511`: `line.indexOf(':', line.indexOf(')'))` is -1 on a `% comment32 …` line, so Save closes and changes nothing, with no message. Since `src/collab.js:450`, every comment a reader writes through a comments only link has this form, in the reader's own page as well. So a reader cannot edit their own comment, and the author cannot edit a reader's. Repro: `node /tmp/review-sec-out/s5.mjs` prints `k = -1`. Fix: have `findComments` carry `safe`. For a safe line, Save replaces the whole line with `safeCommentLine({kind:'comment', who, quote, body})`. Add a test case to `review.py`.

### L1 (Low, unverified on the real host): Cloudflare Pages redirects `.html` files
Pages docs: "Pages will also redirect HTML pages to their extension-less counterparts". `widget-<hash>.html` is the first non-index `.html` file on the hosted site, and `test/pages.py:8` leaves this redirect out. Online, the frame follows the 308 to `/widget-<hash>`, which `/widget-*` still covers, so the headers are right. Offline, a figure then depends on the 308 being in the HTTP cache as well as the file. Even without the redirect, offline figures rely on the HTTP cache alone (the service worker never sees the frame's requests), and an evicted cache gives a blank figure with no message. The proxy here blocks the live host, so I could not check. Fix: on the hosted build, frame `widget-<hash>` with no extension, or run `curl -sI .../widget-<hash>.html` after deploying. Teach `pages.py` the redirect. Have the page say so when a shell never asks for its widget.

### L2 (Low): Safari 15 gets no plain message
README line 233 says Safari 15 cannot compile, but nothing in `src/` detects it (grep finds no `wasm-unsafe-eval` or CompileError handling outside `native.js`). The user sees the engine's raw refusal, or `The TeX engine stopped`, in Problems. Fix: when the TeX worker fails to start with a WebAssembly or eval refusal, say: "This version of Safari cannot run TeX here; the editor works. Safari 16 or later compiles."

### L3 (Low, hardening): anything that rewrites the HTML at Cloudflare's edge would stop the whole app
The page now runs only if its inline script matches the hash exactly. Email Address Obfuscation is on by default for Cloudflare zones. Today it does no harm: the page's only address, `you@example.org`, sits inside the script, and the feature skips `<script>`. But a later address in the markup, or any other edge rewrite, would change bytes. Fix: add `Cache-Control: no-transform` to the `/` and `/index.html` rules. Add a step to `deploy.yml` that fetches `/` after deploying, hashes the inline script and compares the result with the served policy.

### Info
- `build/app.mjs:883`: `frame-src 'self' blob: data:` is now unused. The page's own `<meta>` narrows it to `'self'`, and the hosted page frames only the shell. Drop `blob: data:`. `script-src blob:` (`:874`) exists for the TeX worker's Pyodide import, but it applies to the page too. It is not reachable: blob URLs come only from the page's own scripts, the project's image blobs have unguessable URLs and image MIME types, and scripts inserted through innerHTML never run. It could still be confined to the worker if the worker started from a URL with a header rule of its own.
- `src/share.js:232-234`: a decoded name or text may hold control and bidi characters. For example, `% comment32 AAAAA 0 7777…` gives the name `"\0\0\0"`. The page shows them as text. Names could be spoofed with U+202E in the plain form too. Strip `Cc` and bidi controls in `clean` and `whoOf`.
- `src/share.js:325-332`: `COMMENT_LINES`, `HAS` and `WHOLE` accept `% comment32 <anything>`, so a coauthor's change that adds such a line shows as a comment and not as a change. The plain form already had this weakness. Use `parseCommentLine`.

## What held up
- **S3** (`s3_attack.py`, under `test/pages.py` with the real `_headers`):
  - The shell is served with `WIDGET_POLICY` and without the page's policy or X-Frame-Options. A missing `/widget-zzz` returns `404.html` (which has no script) under the same policy.
  - When another site frames the shell, Chromium refuses it through `frame-ancestors 'self'`.
  - A popup the attacker opens and then posts to stays unchanged.
  - A sandboxed shell has origin `null`, and `localStorage`, IndexedDB and `parent.document` all throw `SecurityError`. `fetch` is refused.
  - A widget cannot navigate its frame to a `data:` document.
  - The shell's name and content are fixed by the build. Nothing a document supplies reaches them, so there is no path traversal.
  - Both callers set `sandbox` before `src` (`widget.js:290`, `graphdialog.js:119`).
  - No `on*` attributes, no `javascript:` URLs, and no eval reached in the shipped code.
  - Worker bootstraps load fixed URLs only.
  - The Pages docs confirm that `! Header` followed by a new value in the same rule serves the new value.
  - The claude.ai build ships no shell and keeps srcdoc.
- **S5** (`s5.mjs`):
  - Old-form injected lines are rewritten to base32.
  - Malformed `comment32` and `reply32` lines (a backslash, the wrong number of parts) are dropped.
  - Lowercase base32 is accepted and rewritten in uppercase.
  - The author's own comment is kept byte for byte.
  - Without the `u` flag, the regex does not match Unicode lookalikes such as `ſ`, `ı` or the Kelvin sign.
  - The decoder runs in linear time and returns an empty string on a bad character.
  - `share.test` passes 19/19 and `review.test` passes all 11 groups.
- **S2** (`kx/run.py`, image `kx/cmp.png`): 22 formulas drawn in Chromium with 0.16.22 and 0.19.1.
  - Identical, except: `aligned`, `gathered` and `alignedat` are 5.8 px shorter at 16 px (closer to amsmath); `diff` is 2.3 px wider (each letter gets its italic correction, as TeX sets it); `\mapsfrom` now renders instead of an error.
  - `\not` forms are identical.
  - `\href`, `\url`, `\htmlStyle`, `\htmlClass` and `\includegraphics` render as red unsupported text with `trust: false`: no `<a>`, no `<img>`, no style.
  - Nothing renders worse.
- **S4**: one `Strict-Transport-Security: max-age=31536000` under `/*`. The `/widget-*` rule does not remove it. No `includeSubDomains` and no `preload`. It appears only in the app build's `_headers`.

# Verification of 8212363

Verdict: **hold.** All of the first review's findings are fixed, and I verified the fixes. But the new proxy (b943210) adds a High: script from any https host can run on Rikuy's own origin. Fix H1 and M3 below, then merge.

## The first review's findings: fixed
- **M1, fixed** (c01b733), rerun on a fresh build with `s3_attack.py` and `s3_selfhost.py`:
  - An unsandboxed same-origin frame of the shell now gets nothing (timeout).
  - A site framing a copy served without headers gets only `{rikuy:'shell'}`; its widget never runs.
  - The sandboxed widget still runs, with origin `null`, its storage refused and `parent.document` refused.
  - Another site's frame is still refused by `frame-ancestors`.
  - `runWidget` now sets `sandbox` itself.
- **M2, fixed** (890e3ff): Save rewrites a base32 line whole, in base32. `review.py` gained the case. `share.test` passes 19/19 and `review.test` all 11 groups.
- **L1, fixed** (9f9cd6c): the frame asks for `widget-<hash>` without `.html`, and `pages.py` now models Pages' 308 from `x.html` to `x`.
- **L2, fixed**: an empty `WebAssembly.Module` probe, and the PDF pane explains in plain words.
- **L3, fixed**: `no-cache, no-transform` on `/` and `/index.html`. `dev/live_check.py` runs after deploy and compares the served script's hash with the policy. It holds no secret: `SITE` comes from `vars` through `env`, the Cloudflare secrets are scoped to the deploy step alone, and the checkout is the TeX run's own SHA.
- **Info items, fixed**: `frame-src 'self'`; control and bidi characters stripped in `clean`; `connect-src 'self' blob:` again.

## The git proxy (functions/git/[[path]].js, src/gitproxy.js)

### H1 (High): any https host's HTML runs on rikuy.rackebrandt.pe
`src/gitproxy.js:99-101` hands back the upstream's `Content-Type`. Pages does not apply `_headers` to a Function's responses (docs: "Custom headers defined in the `_headers` file are not applied to responses generated by Pages Functions"), so the response carries no CSP. A GET navigation sends no Origin, so `:71` lets it through. The service worker passes `/git/...` navigations to the network (`src/sw.js:145-147`).

The attack: a link to `https://rikuy.rackebrandt.pe/git/attacker.workers.dev/x/info/refs?service=git-upload-pack` is enough. It can sit in an email, or in a Rikuy document, since `\href` opens http(s). The attacker's host answers `text/html` with a script. The proxy serves that page as Rikuy's own, so the script can read the IndexedDB and localStorage that hold the user's projects and git tokens, and can rewrite stored projects.

Repro: `node /tmp/review-sec-out/proxy_xss.mjs` sends a request shaped like that navigation (`Sec-Fetch-Mode: navigate`) and gets `200`, `content-type: text/html`, with the script in the body.

Fix, all in `handle`:
- Refuse `Sec-Fetch-Mode: navigate`, any `Sec-Fetch-Dest` other than `empty`, and any `Sec-Fetch-Site` other than `same-origin`.
- Never pass the upstream's content type. Set git's own type for the service (`application/x-<service>-advertisement` for the GET, `-result` for the POST) and `application/octet-stream` for anything else.
- Add `Content-Security-Policy: default-src 'none'; sandbox`, `Content-Disposition: attachment` and `Cross-Origin-Resource-Policy: same-origin` to every response, including `refuse()`. These hold even in browsers that send no Sec-Fetch headers, such as Safari before 16.4.
- Add a test that a `text/html` upstream comes back inert.

### M3 (Medium): an open git-shaped forwarder, with a quota attack on every Worker in Pedro's account
- The proxy forwards to any public https host. GET reaches any path ending in `/info/refs?service=…`, and POST any path ending in `git-upload-pack` or `git-receive-pack` with up to 32 MiB. Repro: `proxy.mjs` reaches `evil.example.org/anything/at/all/info/refs` and `victim.org/admin/delete/git-upload-pack`.
- Non-browser clients send no Origin, so anyone can use it as a free anonymising git proxy (`git clone https://rikuy.rackebrandt.pe/git/github.com/...`) with no cap on response size or time. Requests to sites behind Cloudflare arrive marked with Pedro's zone, so abuse gets attributed to him.
- Browsers on other sites can fire no-cors GETs (`<img>`, or `fetch` with `mode: 'no-cors'`). These carry no Origin, so `:71` lets them through. Repro: `Sec-Fetch-Site: cross-site` with no Origin returns 401 from upstream, not 403.
- The free plan allows 100,000 Worker requests a day per account. Burning them stops `/git` and every other Worker or Function in Pedro's account for the rest of the day. Static pages keep working, because `_routes.json` sends only `/git/*` to the function.
- Fix:
  - Make hosts an allowlist: github.com, gitlab.com, bitbucket.org, codeberg.org, gitea.com, git.sr.ht, huggingface.co, dev.azure.com, plus a list Pedro keeps in a Pages environment variable. A per-user opt-in cannot be enforced on the server.
  - Have the page's git client send a custom header (isomorphic-git's `headers`, e.g. `X-Rikuy-Git: 1`) and refuse requests without it. A cross-site page cannot send it without a preflight, and the preflight is refused with 405.
  - Add a Cloudflare WAF rate-limiting rule on `/git/` per IP; the free plan includes one.
  - Cap the response size, for example by counting bytes through a TransformStream.

### L4 (Low): `www-authenticate` is passed down (`:24`)
A same-origin 401 can bring up the browser's own login box under Rikuy's address. Any host the user named can choose the realm text, for example "Enter your GitHub token". With the old cross-origin proxy, no box appeared. isomorphic-git does not read this header (the bundle never names it). Drop it.

### Info
- **Private addresses through DNS:** names that resolve to private or metadata addresses pass, for example `127.0.0.1.nip.io`, `169.254.169.254.nip.io`, `10.0.0.1.sslip.io` and `kubernetes.default.svc`. No name check can stop that, so the claim in `:11-12` is too strong. The impact is small: a Pages Function fetches from Cloudflare's edge, which has no route to anyone's private network or to a metadata service. I could not test that from here. The allowlist in M3 makes the question moot.
- **What held up:** every numeric IPv4 form, IPv6, userinfo, ports including `:443`, trailing dots, non-ASCII and IDN-mapped names, `%2e%2e` and encoded slashes, duplicate or extra query keys, and redirects to another host, a port, an IP or anything not https (502, token not sent on).
- **No request smuggling:** CR and LF stay percent-encoded in the forwarded URL, Content-Length must match, and chunked uploads are refused (411).
- **No token in error text:** refusals are fixed strings. A remote with userinfo is already refused by `canonicalRemote`.
- **Logging:** if Workers Logs or tail are ever turned on, check that they redact `Authorization`.
- **POST after a 301 or 302:** it is re-sent as POST, which is harmless.

# Verification of 9725d73

Verdict: **merge.** H1, M3 and L4 are fixed. Two Low items and one task for Pedro (setting up the rate rule) can follow the merge.

## Fixed and verified
`/tmp/review-sec-out/proxy3.mjs` and `proxy4.mjs` run against `src/gitproxy.js` at e790a82.
- **H1 is fixed.** My old `proxy_xss` request is refused with 403. The refusal carries `default-src 'none'; sandbox` and `attachment`. A navigation that carries the mark header is also refused.
- **No HTML gets through.** A permitted request whose host answers `text/html` comes back as `application/octet-stream`, with the same CSP and `attachment`. Only git's own type passes, with its parameters removed. The service worker answers a `/git` navigation itself with a sandboxed 403 (`src/sw.js:148`).
- **Old Safari, with no Sec-Fetch headers and no Origin on GET.**
  - A cross-site no-cors GET carries no mark and gets 403.
  - Another site cannot add the mark without a preflight. The preflight (OPTIONS) gets 403 with no CORS headers, so the browser never sends the real request.
  - The page's own same-origin request carries the mark and gets 200.
  - `Sec-Fetch-Site` values `cross-site` and `same-site` are refused. So is a different Origin, and a mark other than `1`.
- **The mark header goes only to the page's own site.** `src/git.js:176-177` (`ownProxy`) adds `X-Rikuy-Git` only when the proxy has the page's own origin. Without a proxy, or with another proxy, the header is not sent. The requests are same-origin, so no CORS is involved.
- **Host list.**
  - Allowed: `GitHub.com`, `GITHUB.COM` and `GIT.overleaf.com`.
  - Refused: `github.com.`, `gist.github.com`, `api.github.com`, `github.com.evil.com`, fullwidth `ｇithub.com`, `gïthub.com`, punycode look-alikes and `github.com:443`.
  - From `RIKUY_GIT_HOSTS`, only well-formed public names are kept. IPs, `.local` names, trailing dots and ports are dropped.
- **Limits.** Past the answer cap the stream errors. A host that sends no headers in time gets 504. A body that stalls ends when the timeout fires.
- **The merge of main.**
  - `npm test`: every file passes, `deploy_check` included, except `view.test.mjs` V4. That is a timing assertion: it took 89 and 106 ms against a 50 ms limit, at a load average of 4 on 2 cores. The test and the code it times are byte for byte main's, so this is contention on this machine.
  - `git.py`: 49/49. `csp.py`: 22/22, with no refusal of the policy over a whole session.

## Left (Low; can follow the merge)
- **L5: the rate rule is a manual step.** Anyone can read the mark header and send it from curl. Until Pedro sets up the WAF rate rule (HOSTING.md step 9), a script can still use up the account's 100,000 Worker requests a day. The allowlist only limits where those requests can go. `live_check` cannot see whether the rule exists. Do step 9 when deploying.
- **L6: the byte cap runs JavaScript on every chunk** (`gitproxy.js`, the TransformStream). Workers charge CPU time for each chunk that passes through JavaScript, while passing `res.body` straight through costs nothing. In node, the cap added about 80 ms of CPU per 100 MiB. The free plan allows 10 ms of CPU per request, so a large clone could be cut off with error 1102. The 120 s limit will also cut off a clone over a slow phone line.
  - Option: keep the cap only when the host sends no Content-Length, and refuse a Content-Length over the cap up front.
  - Option: drop the cap, now that only known hosts are reached.
  - Measure it with a clone of 50 MB or more on the live site.

# Verification of cea68c9

Verdict: **merge.** L6 is fixed, and nothing that H1 and M3 relied on has weakened (`/tmp/review-sec-out/proxy5.mjs`, `proxy3.mjs`, `gitproxy.test` 12 groups).
- **Refused before any byte is passed on, with the inert headers** (`default-src 'none'; sandbox`, `attachment`, plain text):
  - a length past the cap (`20000` against a cap of `10000`), and `9999999999999999`
  - a length that is not a plain number: `1e3`, `-1`, `0x10`, `10, 10`
- **Passed through untouched, with no transform on the stream:**
  - no length at all
  - `10`, and `' 10 '` with spaces around it
- **Unchanged from 9725d73:**
  - the answer's type is git's own or `application/octet-stream`: an upstream `text/html` with a length still comes back as `application/octet-stream` under the sandbox CSP
  - a navigation gets 403, and so does a request without the mark
  - every probe in `proxy3.mjs` gives the same result as before
- **The timeout still applies.** A body that stalls after its headers ends at the timeout (301 ms on a 300 ms limit). A host that sends no headers in time gets 504.
- **Info.** For an answer with no length, or one sent compressed, the length is only a hint and the real bound is the 300 s timeout. That is acceptable now that only the known git hosts are reached.
