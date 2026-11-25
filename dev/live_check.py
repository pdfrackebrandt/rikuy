"""The hosted copy as it answers after a deployment (deploy.yml runs it): the page is this build's
(its version), it runs no inline script and loads the app's script, app-<hash>.js, byte for byte
as built, whose hash its policy names (anything that rewrote the page or the script on the way
would stop the app or show here), nothing may transform either, HSTS is on; the widget document answers at its address without .html
with the widgets' own policy and may be framed (and its .html name redirects there, as Pages
does); /git answers git's request for a git host it knows, inert, and refuses one without the
page's mark and a host it does not know.

Usage: python3 dev/live_check.py SITE DIST [DEPLOYMENT] [--within SECONDS] [--every SECONDS]
  (e.g. https://rikuy.rackebrandt.pe/ dist https://8ea17d09.rikuy-3dl.pages.dev)

DEPLOYMENT is the deployment's own address, which wrangler prints: it serves this build the moment
the upload ends, so it is checked first, and anything wrong there is the build's and fails at once.
Until it answers at all (a name that does not resolve yet, a refused connection, a 404 or 5xx for
the page) it is asked again. Where it redirects to SITE (the owner's Bulk Redirect of
rikuy-3dl.pages.dev, which takes every deployment's address under it along), it says so and the
deployment is checked at SITE alone. Then SITE, the custom domain, which serves a new deployment only once
it reaches Cloudflare's edge: it is asked every --every seconds (10) until it passes or --within
seconds (120) from the start have gone. Every try prints why it did not pass; a network error on
the runner (a name that did not resolve) is one more try of the same poll, never a pass. The last
line is the verdict, with the seconds it took or the reason of the last try."""
import argparse, base64, hashlib, http.client, os, re, sys, time, urllib.error, urllib.parse, urllib.request
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'test'))
from serve import inline_hashes


class Unreachable(Exception):
    """No HTTP answer at all: the name did not resolve, the connection failed or timed out."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None


OPEN = urllib.request.build_opener(NoRedirect)


def get(site, path, **extra):
    req = urllib.request.Request(site + path, headers={'User-Agent': 'rikuy-live-check', 'Cache-Control': 'no-cache', **extra})
    try:
        r = OPEN.open(req, timeout=30)
        return r.status, {k.lower(): v for k, v in r.headers.items()}, r.read()
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read()
    except (urllib.error.URLError, OSError, http.client.HTTPException) as e:
        raise Unreachable('%s%s: %s' % (site, path, getattr(e, 'reason', e)))


def check(site, dist):
    """None when the site serves this build as it should, else (kind, why): kind 'down' when it gave
    no answer, or none yet for the page (404 or 5xx), 'wrong' for anything else."""
    try:
        return problem(site, dist)
    except Unreachable as e:
        return 'down', 'no answer: %s' % e


def problem(site, dist):
    want = re.search(r'<meta name="rikuy-app" content="([0-9a-f]{16})"', open(os.path.join(dist, 'index.html'), encoding='utf8').read()).group(1)
    st, h, body = get(site, '')
    if st == 404 or st >= 500:
        return 'down', 'the page answers %s' % st
    if st in (301, 302, 307, 308):
        return 'moved', h.get('location', '')
    page = body.decode('utf8', 'replace')
    m = re.search(r'<meta name="rikuy-app" content="([0-9a-f]{16})"', page)
    if st != 200 or not m or m.group(1) != want:
        return 'wrong', 'the page is not this build yet: %s %s (want %s)' % (st, m and m.group(1), want)
    csp = h.get('content-security-policy', '')
    named = sorted(re.findall(r"'sha256-([^']+)'", csp.split('script-src', 1)[1].split(';')[0])) if 'script-src' in csp else []
    served = sorted(inline_hashes(page))
    # the page runs no inline script (an added one is something that rewrote it on the way) and
    # loads the app as app-<hash>.js (build.mjs APP_JS), whose bytes the policy names
    app = re.findall(r'<script src="(app-[0-9a-f]{16}\.js)"></script>', page)
    if served or len(app) != 1:
        return 'wrong', 'the page serves inline scripts hashing to %s and loads %s for the app: something rewrote the page' % (served, app)
    if 'no-transform' not in h.get('cache-control', ''):
        return 'wrong', 'the page lacks Cache-Control: no-transform: %r' % h.get('cache-control')
    st, ah, js = get(site, app[0], **{'Accept-Encoding': 'identity'})
    if st != 200 or js != open(os.path.join(dist, app[0]), 'rb').read():
        return 'wrong', 'the app\'s script %s answers %s, not this build\'s bytes' % (app[0], st)
    if named != [base64.b64encode(hashlib.sha256(js).digest()).decode()]:
        return 'wrong', 'the policy names %s, not the app\'s script by its hash' % named
    if 'no-transform' not in ah.get('cache-control', ''):
        return 'wrong', 'the app\'s script lacks Cache-Control: no-transform: %r' % ah.get('cache-control')
    if h.get('strict-transport-security') != 'max-age=31536000':
        return 'wrong', 'HSTS: %r' % h.get('strict-transport-security')
    shell = [f for f in os.listdir(dist) if re.match(r'^widget-[0-9a-f]{16}\.html$', f)][0]
    st, h, body = get(site, shell[:-5])
    if st != 200 or body != open(os.path.join(dist, shell), 'rb').read():
        return 'wrong', 'the widget document at %s: %s' % (shell[:-5], st)
    if "frame-ancestors 'self'" not in h.get('content-security-policy', '') or "'unsafe-inline'" not in h.get('content-security-policy', '') or 'x-frame-options' in h:
        return 'wrong', 'the widget document\'s headers: %r' % h
    st, h, _ = get(site, shell)
    if not (st == 200 or (st in (301, 308) and h.get('location', '').rstrip('/').endswith('/' + shell[:-5]))):
        return 'wrong', 'widget .html name: %s %r' % (st, h.get('location'))
    mark = {'X-Rikuy-Git': '1'}
    st, h, body = get(site, 'git/github.com/git/git.git/info/refs?service=git-upload-pack', **mark)
    if st != 200 or h.get('content-type') != 'application/x-git-upload-pack-advertisement' or h.get('content-disposition') != 'attachment' or "sandbox" not in h.get('content-security-policy', ''):
        return 'wrong', '/git does not pass git\'s request to a git host, inert: %s %r' % (st, h)
    st, h, _ = get(site, 'git/github.com/git/git.git/info/refs?service=git-upload-pack')
    if st != 403 or "sandbox" not in h.get('content-security-policy', ''):
        return 'wrong', '/git answers a request without the client\'s mark: %s' % st
    st, _, _ = get(site, 'git/example.org/a.git/info/refs?service=git-upload-pack', **mark)
    if st != 403:
        return 'wrong', '/git forwards to a host it does not know: %s' % st
    return None


def main():
    ap = argparse.ArgumentParser(description='The hosted copy as it answers after a deployment.')
    ap.add_argument('site')
    ap.add_argument('dist')
    ap.add_argument('deployment', nargs='?')
    ap.add_argument('--within', type=float, default=120)
    ap.add_argument('--every', type=float, default=10)
    a = ap.parse_args()
    t0 = time.monotonic()
    tries = 0
    for own, name, site in ((True, 'the deployment\'s own address', a.deployment), (False, 'the site', a.site)):
        if not site:
            continue
        site = site.rstrip('/') + '/'
        while True:
            tries += 1
            got = check(site, a.dist)
            spent = time.monotonic() - t0
            if got is None:
                print('%s serves this build: %s (%.0f s, try %d)' % (name, site, spent, tries), flush=True)
                break
            kind, why = got
            # the account's Bulk Redirect sends rikuy-3dl.pages.dev and every deployment's address
            # under it to the site (PLAN.md task 36): this deployment can then be read only there
            if own and kind == 'moved' and urllib.parse.urljoin(site, why).startswith(a.site.rstrip('/') + '/'):
                print('%s redirects to the site (%s): this deployment is checked there alone' % (name, why), flush=True)
                break
            if kind == 'moved':
                why = 'the page redirects to %r' % why
                kind = 'wrong'
            print('try %d (%.0f s), %s: %s' % (tries, spent, name, why), flush=True)
            # the deployment's own address serves this upload or nothing: no edge to wait for
            if own and kind == 'wrong':
                print('live check failed: %s answers, and not as this build should: %s' % (name, why))
                return 1
            if spent + a.every > a.within:
                print('live check failed: %s did not serve this build within %.0f s (%d tries); the last: %s' % (name, a.within, tries, why))
                return 1
            time.sleep(a.every)
    print('live check passed: %s in %.0f s' % (a.site, time.monotonic() - t0))
    return 0


if __name__ == '__main__':
    sys.exit(main())
