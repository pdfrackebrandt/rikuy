"""dev/pages_check.py, the check deploy.yml runs before it uploads to Cloudflare Pages: a dist/
that fits passes; one file over 25 MiB, more than 20,000 files, a _headers file of more than 100
rules or a line over 2,000 characters, or a build without the app's files fails. And the hosted
build's own _headers (build/app.mjs): its policy, every directive pinned (the page's one inline
script by its hash, WebAssembly, no eval, connections to the site alone (git goes through its own
/git function); the browser tests run under it, test/serve.py); and the caching, HSTS (this host only), nosniff, Referrer-Policy and Permissions-Policy
rules are there; the widget document's own policy; the build's hashes of the page's inline scripts
against this file's count, and against a built dist/ where there is one;
llms.txt, llms-full.txt, robots.txt and sitemap.xml, and no other file, are open to every site as
UTF-8 text. And the hosted page as a program reads it before any script runs (appPage): its
language, its title in the head, its schema.org data, the plain lines its body opens with.
Run by npm test; needs node (to write the headers and the page) and no browser."""
import atexit, base64, hashlib, os, re, shutil, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, 'dev'))
sys.path.insert(0, HERE)
import pages_check, serve, pages

n = 0
def ok(name, cond, detail=''):
    global n
    if not cond:
        print('FAIL', name, detail); sys.exit(1)
    n += 1

def dist(files):
    d = tempfile.mkdtemp(prefix='rikuy-pages-')
    atexit.register(shutil.rmtree, d, True)
    for rel, size in files.items():
        p = os.path.join(d, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, 'wb') as f:
            if isinstance(size, str): f.write(size.encode())
            else: f.truncate(size)
    return d

APP = {'index.html': 'x', 'sw.js': 'x', '_headers': '/*\n  X-Content-Type-Options: nosniff\n'}
probs, files, _ = pages_check.check(dist(dict(APP, **{'tex/p-0123456789abcdef.wasm': 24 * 1024 * 1024})))
ok('a dist that fits passes', probs == [] and files == 4, probs)
probs, _, _ = pages_check.check(dist(dict(APP, **{'pandoc/part-1.wasm': 25 * 1024 * 1024 + 1})))
ok('a file over 25 MiB fails', len(probs) == 1 and 'pandoc/part-1.wasm' in probs[0], probs)
many = dict(APP, **{'tex/f%05d' % i: 0 for i in range(20000)})
probs, files, _ = pages_check.check(dist(many))
ok('more than 20,000 files fail', files == 20003 and any('20003 files' in p for p in probs), probs)
probs, _, _ = pages_check.check(dist(dict(APP, _headers=''.join('/r%d\n  A: b\n' % i for i in range(101)))))
ok('a _headers file of more than 100 rules fails', any('101 rules' in p for p in probs), probs)
probs, _, _ = pages_check.check(dist(dict(APP, _headers='/*\n  Content-Security-Policy: ' + 'x' * 2000 + '\n')))
ok('a _headers line over 2,000 characters fails', any('line 2' in p for p in probs), probs)
probs, _, _ = pages_check.check(dist(dict(APP, _headers='/w-*\n  A: b\n/*\n  C: d\n/w-*\n  E: f\n')))
ok('two rules for one address pattern fail (Pages keeps only the last)', len(probs) == 1 and '2 rules for /w-*' in probs[0], probs)
probs, _, _ = pages_check.check(dist({'index.html': 'x', 'rikuy.html': 'x'}))
ok('the artifact build (no sw.js, no _headers) is not deployed', len(probs) == 2, probs)
ok('the script exits 1 on a problem', subprocess.run([sys.executable, os.path.join(ROOT, 'dev', 'pages_check.py'), dist({'index.html': 'x'})], stdout=subprocess.DEVNULL).returncode == 1)

# the hosted build's _headers, as build/app.mjs writes them
HASH = 'n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg='
text = subprocess.run(['node', '--input-type=module', '-e', "import { headers } from './build/app.mjs'; process.stdout.write(headers(['%s']))" % HASH], cwd=ROOT, capture_output=True, text=True, check=True).stdout
d = dist({'_headers': text})
pats = [l.strip() for l in text.split('\n') if l.strip() and not l.startswith((' ', '#'))]
ok('the built _headers has one rule per address pattern', len(pats) == len(set(pats)), [p for p in pats if pats.count(p) > 1])
H = lambda path: {k.lower(): v for k, v in pages.headers_for(d, path)}
pol = lambda s: {x.split()[0]: x.split()[1:] for x in s.split(';') if x.strip()}
hosted = pol(H('/')['content-security-policy'])
# every directive pinned: a change to the policy is a change to this list, made on purpose
ok('the hosted policy: scripts are the site\'s files, the page\'s one inline script by its hash, WebAssembly and blob: (Pyodide), nothing else',
   hosted == {'default-src': ["'self'"], 'script-src': ["'self'", "'sha256-" + HASH + "'", "'wasm-unsafe-eval'", 'blob:'], 'style-src': ["'self'", "'unsafe-inline'"],
              'img-src': ["'self'", 'data:', 'blob:'], 'font-src': ["'self'", 'data:', 'blob:'], 'media-src': ["'self'", 'data:', 'blob:'], 'connect-src': ["'self'", 'blob:'],
              'worker-src': ["'self'", 'blob:'], 'manifest-src': ["'self'"], 'form-action': ["'self'"], 'frame-src': ["'self'"],
              'frame-ancestors': ["'none'"], 'object-src': ["'none'"], 'base-uri': ["'self'"]}, hosted)
ok('no inline script but the hashed one, no eval: neither \'unsafe-inline\' nor \'unsafe-eval\' nor \'unsafe-hashes\'', not ({"'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'"} & set(hosted['script-src'])), hosted['script-src'])
ok('it allows no outside source at all', not any(v.startswith(('http', '*')) for vs in hosted.values() for v in vs), hosted)
# git reaches its hosts through the site's own proxy, a Pages Function deployed beside dist/
fn = os.path.join(ROOT, 'functions', 'git', '[[path]].js')
ok('the git proxy is a Pages Function of the site (functions/git/[[path]].js, src/gitproxy.js), the Git panel\'s default',
   os.path.isfile(fn) and "from '../../src/gitproxy.js'" in open(fn, encoding='utf8').read() and "new URL('git', location.href)" in open(os.path.join(ROOT, 'src', 'app.js'), encoding='utf8').read())
ok('a page with no hash is refused, not given a policy that runs nothing', subprocess.run(['node', '--input-type=module', '-e', "import { headers } from './build/app.mjs'; headers([])"], cwd=ROOT, capture_output=True).returncode != 0)
# the live figures' document: the page's policy and its framing rule taken away, the widgets' own
# in their place (one value, not joined to the page's), cached for good, HSTS and nosniff kept
w = H('/widget-0123456789abcdef.html')
ok('the widget document has the widgets\' policy alone, and may be framed by the page', w.get('content-security-policy') == "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; worker-src blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"
   and 'x-frame-options' not in w and w.get('cache-control') == 'public, max-age=31536000, immutable' and w.get('strict-transport-security') == 'max-age=31536000' and w.get('x-content-type-options') == 'nosniff', w)
ok('and no other file loses the page\'s policy or its framing rule', all(H(p).get('content-security-policy', '').startswith("default-src 'self'") and H(p).get('x-frame-options') == 'DENY'
   for p in ('/', '/index.html', '/rikuy.html', '/404.html', '/widget.html', '/x/widget-0123456789abcdef.html', '/tex/engine.js', '/spell/spell-0123456789abcdef.js')), [(p, H(p)) for p in ('/rikuy.html', '/widget.html')])
for p in ('/tex/p-0123456789abcdef.wasm', '/tex/w-0123456789abcdef.wasm', '/tex/t-0123456789abcdef.wasm', '/tex/b-0123456789abcdef.wasm', '/fonts/ibm-plex-sans-latin-ext-400-0123456789abcdef.woff2', '/core/rikuy-core-0123456789abcdef.wasm', '/texnames-0123456789abcdef.txt'):
    ok('content addressed files are cached for a year as immutable, by one rule: ' + p, H(p).get('cache-control') == 'public, max-age=31536000, immutable', H(p))
for p in ('/', '/index.html'):
    ok('the page is revalidated on every request, and no one between may change it (its script runs by its hash): ' + p, H(p).get('cache-control') == 'no-cache, no-transform', H(p))
for p in ('/sw.js', '/manifest.webmanifest'):
    ok('revalidated on every request: ' + p, H(p).get('cache-control') == 'no-cache', H(p))
ok('scripts bound to the version keep Pages\' default caching', 'cache-control' not in H('/tex/engine.js') and 'cache-control' not in H('/tex/tree.wasm'), H('/tex/engine.js'))
for p in ('/', '/index.html', '/sw.js', '/git.js', '/tex/engine.js', '/tex/p-0123456789abcdef.wasm', '/llms.txt', '/x/y'):
    ok('HTTPS only for a year, on this host alone (no includeSubDomains, no preload): ' + p, H(p).get('strict-transport-security') == 'max-age=31536000', H(p))
h = H('/git.js')
ok('nosniff, no framing, no referrer and no device access on every file', h.get('x-content-type-options') == 'nosniff' and h.get('x-frame-options') == 'DENY'
   and h.get('referrer-policy') == 'no-referrer' and 'camera=()' in h.get('permissions-policy', '') and 'geolocation=()' in h.get('permissions-policy', ''), h)
# what agents and crawlers fetch: readable from a script on any site, as UTF-8 text, and nothing else is
for p in ('/llms.txt', '/llms-full.txt', '/robots.txt'):
    h = H(p)
    ok('open to every site, as UTF-8 plain text: ' + p, h.get('access-control-allow-origin') == '*' and h.get('content-type') == 'text/plain; charset=utf-8'
       and 'cache-control' not in h and h.get('x-content-type-options') == 'nosniff' and 'content-security-policy' in h, h)
h = H('/sitemap.xml')
ok('the sitemap likewise, as XML', h.get('access-control-allow-origin') == '*' and h.get('content-type') == 'application/xml; charset=utf-8', h)
for p in ('/', '/index.html', '/sw.js', '/git.js', '/tex/engine.js', '/tex/p-0123456789abcdef.wasm', '/manifest.webmanifest', '/og.png', '/LICENSES.txt', '/x/llms.txt', '/llms.txt.bak', '/word/llms-full.txt'):
    ok('no other file is opened to other sites or given a type: ' + p, 'access-control-allow-origin' not in H(p) and 'content-type' not in H(p), H(p))
probs, _, _ = pages_check.check(dist(dict(APP, _headers=text)))
ok('and they fit Pages\' limits', probs == [], probs)

# the hosted page as a program reads it before any script runs (appPage): the language, one title
# in the head, what the app is as schema.org data, and plain lines at the top of the body
import json, re
JS = ("import { appPage, jsonScript } from './build/app.mjs';"
      "const sk = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content=x><style>s</style></head><body>';"
      "process.stdout.write(JSON.stringify([appPage('/nowhere', '<title>Rikuy</title>\\n<style>f</style><div id=\"app\"></div>', sk), jsonScript({ a: '</script><script>alert(1)</script><!--' })]))")
html, hostile = json.loads(subprocess.run(['node', '--input-type=module', '-e', JS], cwd=ROOT, capture_output=True, text=True, check=True).stdout)
ok('the page names its language and has its one title in the head', html.startswith('<!doctype html><html lang="en"><head><meta charset=utf8><title>Rikuy: ')
   and html.count('<title>') == 1 and html.index('</title>') < html.index('</head>'), html[:200])
body = html[html.index('<body>') + 6:]
ok('the body opens with what Rikuy is, then says what a browser without JavaScript needs, then the app',
   body.startswith('<div class="rk-intro"><h1>Rikuy</h1><p>') and 0 < body.index('href="llms.txt"') < body.index('href="llms-full.txt"') < body.index('github.com/') < body.index('</div><noscript>')
   < body.index('needs JavaScript') < body.index('</noscript>') < body.index('<div id="app">') and html.index('</noscript>') < 6000 and '.rk-intro{position:absolute;width:1px;height:1px' in html, body[:300])
# what the page needs first is asked for at the top of the body, after those lines: KaTeX's script
# by the hash its tag checks it with, and the fonts the build names, each without credentials
JS2 = ("import { appPage } from './build/app.mjs';"
       "const sk = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content=x><style>s</style></head><body>';"
       "const k = '<script src=\"https://cdn.jsdelivr.net/npm/katex@0.19.1/dist/katex.min.js\" integrity=\"sha384-a1WQdjRj162i159OYq041X6I4K8NenkrI09LlPmiHg0YOb7CR+wJOraXwK9abpnE\" crossorigin=\"anonymous\"></script>';"
       "process.stdout.write(JSON.stringify(appPage('/nowhere', '<title>Rikuy</title>\\n<style>f</style><div id=\"app\"></div>' + k, sk, ['fonts/a-0123456789abcdef.woff2', 'fonts/b-0123456789abcdef.woff2'])))")
ahead = json.loads(subprocess.run(['node', '--input-type=module', '-e', JS2], cwd=ROOT, capture_output=True, text=True, check=True).stdout)
links = re.findall(r'<link rel="preload"[^>]*>', ahead)
ok('KaTeX\'s script and the first fonts are asked for ahead, after the lines for programs and before the app',
   links == ['<link rel="preload" as="script" href="lib/katex.min.js" integrity="sha384-a1WQdjRj162i159OYq041X6I4K8NenkrI09LlPmiHg0YOb7CR+wJOraXwK9abpnE" crossorigin="anonymous">',
             '<link rel="preload" as="font" type="font/woff2" href="fonts/a-0123456789abcdef.woff2" crossorigin>', '<link rel="preload" as="font" type="font/woff2" href="fonts/b-0123456789abcdef.woff2" crossorigin>']
   and ahead.index('</noscript>') < ahead.index(links[0]) < ahead.index(links[-1]) < ahead.index('<div id="app">') and '<script src="lib/katex.min.js" integrity="sha384-a1WQ' in ahead
   and ahead.index('<h1>Rikuy</h1>') < 4096, links)
m = re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
data = json.loads(m.group(1))
ok('schema.org data in the head: a free web application, its version and its source', html.index(m.group(0)) < html.index('</head>') and data['@context'] == 'https://schema.org' and data['@type'] == 'SoftwareApplication'
   and data['name'] == 'Rikuy' and data['url'].startswith('https://') and data['applicationCategory'] and data['operatingSystem'] == 'Any (web browser)' and data['offers'] == {'@type': 'Offer', 'price': '0', 'priceCurrency': 'USD'}
   and re.match(r'^\d+\.\d+\.\d+$', data['softwareVersion']) and data['sameAs'].startswith('https://github.com/') and len(data['description']) > 40, data)
ok('text in that data cannot end its script element or start a comment', '<' not in hostile and json.loads(hostile) == {'a': '</script><script>alert(1)</script><!--'}, hostile)
# the hashes the build gives the policy (build/app.mjs pageHashes) against this file's own count
# (serve.inline_hashes): the app's script and a module, never data or a script loaded by src
JS3 = ("import { pageHashes } from './build/app.mjs';"
       "const p = '<script type=\"application/ld+json\">{\"a\":1}</script><script src=\"lib/k.js\"></script><script>var a = 1;</script><script type=module>import \"./x.js\"</script><script type=\"text/plain\">x</script>';"
       "let cr = 'kept'; try { pageHashes('<script>a\\rb</script>'); } catch (e) { cr = 'refused'; }"
       "process.stdout.write(JSON.stringify([pageHashes(p), cr, pageHashes(%s)]))" % json.dumps(html))
ph, cr, phtml = json.loads(subprocess.run(['node', '--input-type=module', '-e', JS3], cwd=ROOT, capture_output=True, text=True, check=True).stdout)
probe = '<script type="application/ld+json">{"a":1}</script><script src="lib/k.js"></script><script>var a = 1;</script><script type=module>import "./x.js"</script><script type="text/plain">x</script>'
ok('the build hashes the inline scripts that run (a classic one, a module), as this file counts them, and not data or a loaded script', len(ph) == 2 and ph == serve.inline_hashes(probe), (ph, serve.inline_hashes(probe)))
ok('a script the HTML parser would change (a CR) is refused, not given a wrong hash', cr == 'refused', cr)
ok('the schema.org data needs no hash: it is data, which no policy runs', phtml == [], phtml)
# and a built dist/, where there is one: its policy names exactly the app's bundle, which
# rikuy.html runs inline (the copy the browser tests run under this policy) and index.html loads as
# a file beside it, app-<hash>.js, of the same bytes (build.mjs APP_JS); index.html runs no inline
# script
DIST = os.path.join(ROOT, 'dist')
if os.path.isfile(os.path.join(DIST, '_headers')) and os.path.isfile(os.path.join(DIST, 'index.html')):
    built = pol(dict((k.lower(), v) for k, v in pages.headers_for(DIST, '/'))['content-security-policy'])
    index = open(os.path.join(DIST, 'index.html'), encoding='utf8').read()
    want = ["'sha256-%s'" % h for h in serve.inline_hashes(open(os.path.join(DIST, 'rikuy.html'), encoding='utf8').read())]
    ok('dist/_headers names the hash of the script rikuy.html runs, and no other', [x for x in built['script-src'] if x.startswith("'sha256-")] == want and len(want) == 1, (built['script-src'], want))
    app = re.findall(r'<script src="(app-[0-9a-f]{16}\.js)"></script>', index)
    body = open(os.path.join(DIST, app[0]), 'rb').read() if len(app) == 1 and os.path.isfile(os.path.join(DIST, app[0])) else b''
    ok('dist/index.html runs no inline script, and loads the app as app-<hash>.js: the bytes the policy names, its name the start of their SHA-256',
       serve.inline_hashes(index) == [] and len(app) == 1 and want == ["'sha256-%s'" % base64.b64encode(hashlib.sha256(body).digest()).decode()] and hashlib.sha256(body).hexdigest().startswith(app[0][4:20]), (serve.inline_hashes(index), app))
    shells = [f for f in os.listdir(DIST) if f.startswith('widget-') and f.endswith('.html')]
    rule = subprocess.run(['node', '--input-type=module', '-e', "import { WIDGET_RULE } from './build/app.mjs'; process.stdout.write(WIDGET_RULE)"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    ok('dist/ has its widget document, named by the hash of it and its headers\' rule (a change to either is a new address, past every browser\'s cache)',
       len(shells) == 1 and __import__('hashlib').sha256(open(os.path.join(DIST, shells[0]), 'rb').read() + b'\n' + rule.encode()).hexdigest().startswith(shells[0][7:23]) and rule in open(os.path.join(DIST, '_headers'), encoding='utf8').read(), shells)
# dev/live_check.py, deploy.yml's last step, against two servers on this machine that stand in for
# the deployment's own address and the custom domain: the deployment is checked first and anything
# wrong there fails at once; the domain is asked again until it serves this build, within a bound;
# an address that does not resolve is one more try of that poll, and fails at its end, never passes
import http.server, threading, time
LIVE = tempfile.mkdtemp(prefix='rikuy-live-')
atexit.register(shutil.rmtree, LIVE, True)
SHELL = 'widget-0123456789abcdef'
open(os.path.join(LIVE, SHELL + '.html'), 'w').write('<p>widget</p>')
APPJS = 'app-0123456789abcdef.js'
open(os.path.join(LIVE, APPJS), 'w').write('go()')
APPHASH = base64.b64encode(hashlib.sha256(b'go()').digest()).decode()
def page(v, rewritten=False):
    return '<!doctype html><html><head><meta name="rikuy-app" content="%s">%s</head><body><script src="%s"></script></body></html>' % (v, '<script>x()</script>' if rewritten else '', APPJS)
open(os.path.join(LIVE, 'index.html'), 'w').write(page('aaaaaaaaaaaaaaaa'))
def server(state):
    class H(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a): pass
        def do_GET(self):
            p, hs, body = self.path, {}, b''
            if p == '/' and state.get('moved'):
                st, hs = 301, {'Location': state['moved']}
            elif p == '/':
                doc = page(state['version'], state.get('rewritten'))
                st, body = 200, doc.encode()
                hs = {'Content-Security-Policy': "script-src 'self' 'sha256-%s'" % APPHASH, 'Cache-Control': 'no-cache, no-transform', 'Strict-Transport-Security': 'max-age=31536000'}
            elif p == '/' + APPJS:
                st, body = 200, b'go()'
                hs = {'Cache-Control': 'public, max-age=31536000, immutable, no-transform'}
            elif p == '/' + SHELL:
                st, body = 200, open(os.path.join(LIVE, SHELL + '.html'), 'rb').read()
                hs = {'Content-Security-Policy': "script-src 'unsafe-inline'; frame-ancestors 'self'"} if state['widget'] else {'Content-Security-Policy': "frame-ancestors 'none'", 'X-Frame-Options': 'DENY'}
            elif p == '/' + SHELL + '.html':
                st, hs = 308, {'Location': '/' + SHELL}
            elif p.startswith('/git/github.com/') and self.headers.get('X-Rikuy-Git') == '1':
                st, hs = 200, {'Content-Type': 'application/x-git-upload-pack-advertisement', 'Content-Disposition': 'attachment', 'Content-Security-Policy': 'sandbox'}
            elif p.startswith('/git/'):
                st, hs = 403, {'Content-Security-Policy': 'sandbox'}
            else:
                st = 404
            self.send_response(st)
            for k, v in hs.items(): self.send_header(k, v)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    atexit.register(srv.shutdown)
    return 'http://127.0.0.1:%d/' % srv.server_address[1]
NOPROXY = {k: v for k, v in os.environ.items() if k.lower() not in ('http_proxy', 'https_proxy', 'all_proxy')}
def live(site, deployment, within=4):
    t = time.monotonic()
    r = subprocess.run([sys.executable, os.path.join(ROOT, 'dev', 'live_check.py'), site, LIVE] + ([deployment] if deployment else []) + ['--within', str(within), '--every', '0.3'],
                       capture_output=True, text=True, env=NOPROXY, timeout=60)
    return r.returncode, r.stdout, time.monotonic() - t
own = {'version': 'aaaaaaaaaaaaaaaa', 'widget': True}
edge = {'version': 'bbbbbbbbbbbbbbbb', 'widget': True}
OWN, EDGE = server(own), server(edge)
threading.Timer(1.0, lambda: edge.update(version='aaaaaaaaaaaaaaaa')).start()
code, out, took = live(EDGE, OWN)
ok('live check: the deployment\'s own address first, then the domain asked again until it serves this build', code == 0 and out.index("own address serves this build") < out.index('try 2') < out.index('live check passed')
   and 'the page is not this build yet' in out and took < 4, out)
own['widget'] = False
code, out, took = live(EDGE, OWN)
ok('live check: the deployment\'s own address answering wrongly fails at once, the domain never asked', code == 1 and 'not as this build should' in out and "widget document's headers" in out and EDGE not in out and took < 2, out)
own['widget'] = True
# (an inline script added on the way, as Email Address Obfuscation adds one: the page is not this build's)
own['rewritten'] = True
code, out, took = live(EDGE, OWN)
ok('live check: a page that runs an inline script it was not built with fails at once', code == 1 and 'something rewrote the page' in out and EDGE not in out and took < 2, out)
own['rewritten'] = False
edge['version'] = 'cccccccccccccccc'
code, out, took = live(EDGE, OWN, within=2)
ok('live check: a domain that never serves this build fails at the bound, with its last answer', code == 1 and 'within 2 s' in out and 'want aaaaaaaaaaaaaaaa' in out.splitlines()[-1] and 1.5 < took < 6, out)
edge['version'] = 'aaaaaaaaaaaaaaaa'
own['moved'] = EDGE
code, out, took = live(EDGE, OWN)
ok('live check: a deployment\'s address redirected to the site (the owner\'s Bulk Redirect) says so, and the site alone decides', code == 0 and 'redirects to the site' in out and 'live check passed' in out, out)
own['moved'] = 'https://elsewhere.example/'
code, out, took = live(EDGE, OWN)
ok('live check: a deployment\'s address redirected anywhere else fails at once', code == 1 and "redirects to 'https://elsewhere.example/'" in out and EDGE not in out, out)
code, out, took = live(EDGE, 'http://rikuy-live-check.invalid/', within=1.5)
ok('live check: an address that does not resolve is asked again within the bound, then fails with why; never a pass', code == 1 and out.count('no answer') >= 2 and 'live check passed' not in out
   and 'within 2 s' in out and 'no answer' in out.splitlines()[-1], out)
print('%d/%d passed' % (n, n))
