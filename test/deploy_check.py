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
import atexit, os, shutil, subprocess, sys, tempfile
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
# and a built dist/, where there is one: its policy names exactly the scripts its index.html runs
DIST = os.path.join(ROOT, 'dist')
if os.path.isfile(os.path.join(DIST, '_headers')) and os.path.isfile(os.path.join(DIST, 'index.html')):
    built = pol(dict((k.lower(), v) for k, v in pages.headers_for(DIST, '/'))['content-security-policy'])
    want = ["'sha256-%s'" % h for h in serve.inline_hashes(open(os.path.join(DIST, 'index.html'), encoding='utf8').read())]
    ok('dist/_headers names the hash of every script dist/index.html runs, and no other', [x for x in built['script-src'] if x.startswith("'sha256-")] == want and len(want) == 1, (built['script-src'], want))
    shells = [f for f in os.listdir(DIST) if f.startswith('widget-') and f.endswith('.html')]
    ok('dist/ has its widget document, named by its hash', len(shells) == 1 and __import__('hashlib').sha256(open(os.path.join(DIST, shells[0]), 'rb').read()).hexdigest().startswith(shells[0][7:23]), shells)
print('%d/%d passed' % (n, n))
