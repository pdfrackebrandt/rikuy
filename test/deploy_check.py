"""dev/pages_check.py, the check deploy.yml runs before it uploads to Cloudflare Pages: a dist/
that fits passes; one file over 25 MiB, more than 20,000 files, a _headers file of more than 100
rules or a line over 2,000 characters, or a build without the app's files fails. And the hosted
build's own _headers (build/app.mjs): its policy is test/serve.py's (the one the browser tests
run under) without the outside sources it never uses, plus frame-ancestors 'none' and
manifest-src; and the caching, nosniff, Referrer-Policy and Permissions-Policy rules are there;
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
probs, _, _ = pages_check.check(dist({'index.html': 'x', 'rikuy.html': 'x'}))
ok('the artifact build (no sw.js, no _headers) is not deployed', len(probs) == 2, probs)
ok('the script exits 1 on a problem', subprocess.run([sys.executable, os.path.join(ROOT, 'dev', 'pages_check.py'), dist({'index.html': 'x'})], stdout=subprocess.DEVNULL).returncode == 1)

# the hosted build's _headers, as build/app.mjs writes them
text = subprocess.run(['node', '--input-type=module', '-e', "import { headers } from './build/app.mjs'; process.stdout.write(headers())"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
d = dist({'_headers': text})
H = lambda path: {k.lower(): v for k, v in pages.headers_for(d, path)}
pol = lambda s: {x.split()[0]: x.split()[1:] for x in s.split(';') if x.strip()}
hosted, artifact = pol(H('/')['content-security-policy']), pol(serve.CSP)
outside = {k: [v for v in vs if v.startswith('https:')] for k, vs in artifact.items()}
ok('the hosted policy is the browser tests\' policy without its outside sources, plus frame-ancestors and manifest-src',
   {k: v for k, v in hosted.items() if k not in ('frame-ancestors', 'manifest-src')} == {k: [v for v in vs if not v.startswith('https:')] for k, vs in artifact.items()}
   and hosted['frame-ancestors'] == ["'none'"] and hosted['manifest-src'] == ["'self'"], (hosted, outside))
ok('it allows no outside source at all', not any(v.startswith(('http', '*')) for vs in hosted.values() for v in vs), hosted)
for p in ('/tex/p-0123456789abcdef.wasm', '/tex/w-0123456789abcdef.wasm', '/tex/t-0123456789abcdef.wasm', '/tex/b-0123456789abcdef.wasm', '/fonts/ibm-plex-sans-latin-ext-400-0123456789abcdef.woff2', '/core/rikuy-core-0123456789abcdef.wasm', '/texnames-0123456789abcdef.txt'):
    ok('content addressed files are cached for a year as immutable, by one rule: ' + p, H(p).get('cache-control') == 'public, max-age=31536000, immutable', H(p))
for p in ('/', '/index.html', '/sw.js', '/manifest.webmanifest'):
    ok('revalidated on every request: ' + p, H(p).get('cache-control') == 'no-cache', H(p))
ok('scripts bound to the version keep Pages\' default caching', 'cache-control' not in H('/tex/engine.js') and 'cache-control' not in H('/tex/tree.wasm'), H('/tex/engine.js'))
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
       "const k = '<script src=\"https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js\" integrity=\"sha384-cMkvdD8LoxVzGF/RPUKAcvmm49FQ0oxwDF3BGKtDXcEc+T1b2N+teh/OJfpU0jr6\" crossorigin=\"anonymous\"></script>';"
       "process.stdout.write(JSON.stringify(appPage('/nowhere', '<title>Rikuy</title>\\n<style>f</style><div id=\"app\"></div>' + k, sk, ['fonts/a-0123456789abcdef.woff2', 'fonts/b-0123456789abcdef.woff2'])))")
ahead = json.loads(subprocess.run(['node', '--input-type=module', '-e', JS2], cwd=ROOT, capture_output=True, text=True, check=True).stdout)
links = re.findall(r'<link rel="preload"[^>]*>', ahead)
ok('KaTeX\'s script and the first fonts are asked for ahead, after the lines for programs and before the app',
   links == ['<link rel="preload" as="script" href="lib/katex.min.js" integrity="sha384-cMkvdD8LoxVzGF/RPUKAcvmm49FQ0oxwDF3BGKtDXcEc+T1b2N+teh/OJfpU0jr6" crossorigin="anonymous">',
             '<link rel="preload" as="font" type="font/woff2" href="fonts/a-0123456789abcdef.woff2" crossorigin>', '<link rel="preload" as="font" type="font/woff2" href="fonts/b-0123456789abcdef.woff2" crossorigin>']
   and ahead.index('</noscript>') < ahead.index(links[0]) < ahead.index(links[-1]) < ahead.index('<div id="app">') and '<script src="lib/katex.min.js" integrity="sha384-cMkv' in ahead
   and ahead.index('<h1>Rikuy</h1>') < 4096, links)
m = re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
data = json.loads(m.group(1))
ok('schema.org data in the head: a free web application, its version and its source', html.index(m.group(0)) < html.index('</head>') and data['@context'] == 'https://schema.org' and data['@type'] == 'SoftwareApplication'
   and data['name'] == 'Rikuy' and data['url'].startswith('https://') and data['applicationCategory'] and data['operatingSystem'] == 'Any (web browser)' and data['offers'] == {'@type': 'Offer', 'price': '0', 'priceCurrency': 'USD'}
   and re.match(r'^\d+\.\d+\.\d+$', data['softwareVersion']) and data['sameAs'].startswith('https://github.com/') and len(data['description']) > 40, data)
ok('text in that data cannot end its script element or start a comment', '<' not in hostile and json.loads(hostile) == {'a': '</script><script>alert(1)</script><!--'}, hostile)
ok('the policy is not loosened for it: it is data, which no policy runs', "'unsafe-hashes'" not in H('/')['content-security-policy'] and 'sha256-' not in H('/')['content-security-policy'])
print('%d/%d passed' % (n, n))
