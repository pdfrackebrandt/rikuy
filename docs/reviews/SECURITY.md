# Security review (Grok Bot, 17 November 2026)

Scope: the repository at `2adb064` (main after R2) with the R3, R4 and R5 branches read alongside, and
rechecked on main after #63, #73, #66 and #68 were merged:
the app's handling of untrusted input (documents, Word files, archives, share links, pasted HTML,
live figures), the git and collaboration paths, the hosted page's headers, the CI and deploy
workflows, the dependencies, and the whole history for committed secrets.

Severity scale: **High** (an attacker gets code execution in the page, reads a user's files or
tokens, or takes over the deploy); **Medium** (a reachable denial of service or a weakened
boundary with a plausible path to abuse); **Low** (defence in depth, hardening, or a documented
limit); **Info** (checked and found sound).

## Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| S1 | Medium | `fflate` 0.8.2 (GHSA-px8p-9vwx-vf98): a crafted ZIP whose central directory marks a size or offset as ZIP64's (0xFFFFFFFF) with no ZIP64 extra field sends `unzipSync` into an endless loop. Every Word file opened (`src/docx.js` `unzip`) and every packed archive go through it, so a single file someone sends hangs the import. The Word worker's 4 minute timeout bounds it, but the tab's import is gone for that time. | **Fixed** in this PR: `fflate` ^0.8.3, and `badZip64()` in `src/docx.js` refuses such an entry before fflate reads it (a well formed ZIP64 file still opens). Test: `test/word.test.mjs` "a ZIP64 size with no ZIP64 field". |
| S2 | Low | `katex` (GHSA-238p-pmpm-9mq7, low): the fix is in 0.19, a semver major. Rikuy renders with `trust: false` and no `\href`/`\url`/`\includegraphics` trust callback, so the affected paths are not reachable as configured. | Report only. Bump to 0.19 in its own PR once the formula suites are run against it. |
| S3 | Low | The page's CSP allows `script-src 'unsafe-inline' 'unsafe-eval'`. The build inlines the app into `index.html` (seven inline scripts, three `on*` attributes), and the TeX engines need `eval`/`wasm` compilation. Every other directive is tight (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `connect-src 'self' blob:`). | Recommendation: move the inline scripts to hashes (`'sha256-…'`) in `build/app.mjs`'s `CSP`, replace the `on*` attributes with listeners, and use `'wasm-unsafe-eval'` if the engines allow it. A separate change because `test/deploy_check.py` pins the policy. |
| S4 | Low | No `Strict-Transport-Security` on `rikuy.rackebrandt.pe`. Cloudflare redirects HTTP to HTTPS, but without HSTS the first request of a new visitor can be downgraded. | **Pedro's decision**: either "Always Use HTTPS" + HSTS in Cloudflare's SSL/TLS settings, or a `Strict-Transport-Security: max-age=31536000; includeSubDomains` line in `headers()` (`build/app.mjs`). Not changed here: preloading or includeSubDomains has effects on the whole domain. |
| S5 | Low | The "comments only" filter of a shared project (`src/share.js`) is a static reading of the source. A document that changes catcodes through `\csname`, `\scantokens` or Lua can hide text from it. | Documented trust boundary: the filter is a courtesy for honest documents, not a sandbox. The R4 verification closed the static cases (delimiter forms of `\url`/`\path`, every file scanned for `\catcode`). |
| S6 | Info | No secrets in the history: gitleaks over all 468 commits found 7 hits, all false positives (localStorage key names in `src/cmd/file.js` and `src/ui/eqtab.js`). | Nothing to rotate. |
| S7 | Info | Workflows: every action pinned by SHA; `permissions: contents: read` at the top of each workflow, widened only per job; no `pull_request_target`; the Cloudflare token is read only by deploy jobs that run on `push` to main or `workflow_dispatch`, never on pull requests; the arXiv job runs its sources in a sandbox without the token. | Sound. |
| S8 | Info | Untrusted content in the page: KaTeX with `trust: false`; pdf.js with `isEvalSupported: false`; links allowed only for `http(s)`, `mailto` and `ftp` (`safeUrl`); pasted HTML parsed by an inert `DOMParser` document and turned into LaTeX text (`src/paste.js`), never inserted as HTML; live figures (`\rikuywidget`) in `sandbox="allow-scripts"` iframes with their own CSP (`default-src 'none'`), no WebRTC, gated by "Run live figures" for documents from someone else; archives brought in (arXiv sources) refuse `..`, absolute names, symbolic and hard links (`test/arxiv` cases in CI). | Sound. |
| S9 | Info | Git: the user's token is kept per remote (`canonicalRemote`) and sent only to the host it was given for; it is never written into the project or a share link. | Sound. |

## Decisions for Pedro

1. HSTS (S4): turn it on in Cloudflare, or let a PR add the header.
2. CSP hashes (S3): worth a PR, which touches the build and `test/deploy_check.py`.
3. KaTeX 0.19 (S2): a major bump; schedule it with the formula suites.
