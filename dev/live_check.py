"""The hosted copy as it answers after a deployment (deploy.yml runs it): the page is this build's
(its version), its policy names the hash of the inline script it serves byte for byte (anything
that rewrote the HTML on the way would stop the app, which the policy runs only by that hash),
nothing may transform it, HSTS is on; the widget document answers at its address without .html
with the widgets' own policy and may be framed (and its .html name redirects there, as Pages
does); /git answers git's request for a public host and refuses an IP address.
Usage: python3 dev/live_check.py SITE DIST   (e.g. https://rikuy.rackebrandt.pe/ dist)
Exits 1 on the first problem, after a few tries while the deployment reaches the edge."""
import os, re, sys, time, urllib.request, urllib.error
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'test'))
from serve import inline_hashes

SITE, DIST = sys.argv[1].rstrip('/') + '/', sys.argv[2]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None


OPEN = urllib.request.build_opener(NoRedirect)


def get(path):
    req = urllib.request.Request(SITE + path, headers={'User-Agent': 'rikuy-live-check', 'Cache-Control': 'no-cache'})
    try:
        r = OPEN.open(req, timeout=30)
        return r.status, {k.lower(): v for k, v in r.headers.items()}, r.read()
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read()


def check():
    want = re.search(r'<meta name="rikuy-app" content="([0-9a-f]{16})"', open(os.path.join(DIST, 'index.html'), encoding='utf8').read()).group(1)
    st, h, body = get('')
    page = body.decode('utf8', 'replace')
    m = re.search(r'<meta name="rikuy-app" content="([0-9a-f]{16})"', page)
    if st != 200 or not m or m.group(1) != want:
        return 'the page is not this build yet: %s %s (want %s)' % (st, m and m.group(1), want)
    csp = h.get('content-security-policy', '')
    named = sorted(re.findall(r"'sha256-([^']+)'", csp.split('script-src', 1)[1].split(';')[0])) if 'script-src' in csp else []
    served = sorted(inline_hashes(page))
    if not served or named != served:
        return 'the policy names %s, the page serves inline scripts hashing to %s: something rewrote the page' % (named, served)
    if 'no-transform' not in h.get('cache-control', ''):
        return 'the page lacks Cache-Control: no-transform: %r' % h.get('cache-control')
    if h.get('strict-transport-security') != 'max-age=31536000':
        return 'HSTS: %r' % h.get('strict-transport-security')
    shell = [f for f in os.listdir(DIST) if re.match(r'^widget-[0-9a-f]{16}\.html$', f)][0]
    st, h, body = get(shell[:-5])
    if st != 200 or body != open(os.path.join(DIST, shell), 'rb').read():
        return 'the widget document at %s: %s' % (shell[:-5], st)
    if "frame-ancestors 'self'" not in h.get('content-security-policy', '') or "'unsafe-inline'" not in h.get('content-security-policy', '') or 'x-frame-options' in h:
        return 'the widget document\'s headers: %r' % h
    st, h, _ = get(shell)
    if not (st == 200 or (st in (301, 308) and h.get('location', '').rstrip('/').endswith('/' + shell[:-5]))):
        return 'widget .html name: %s %r' % (st, h.get('location'))
    st, h, body = get('git/github.com/git/git.git/info/refs?service=git-upload-pack')
    if st != 200 or h.get('content-type') != 'application/x-git-upload-pack-advertisement':
        return '/git does not pass git\'s request to a public host: %s %r' % (st, h.get('content-type'))
    st, _, _ = get('git/127.0.0.1/a.git/info/refs?service=git-upload-pack')
    if st != 403:
        return '/git does not refuse an IP address: %s' % st
    return None


for attempt in range(8):
    why = check()
    if not why:
        print('live check passed:', SITE)
        sys.exit(0)
    print('try %d: %s' % (attempt + 1, why))
    time.sleep(15)
sys.exit(1)
