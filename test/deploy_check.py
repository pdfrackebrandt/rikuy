"""dev/pages_check.py, the check deploy.yml runs before it uploads to Cloudflare Pages: a dist/
that fits passes; one file over 25 MiB, more than 20,000 files, a _headers file of more than 100
rules or a line over 2,000 characters, or a build without the app's files fails. And the hosted
build's own _headers (build/app.mjs): its policy is test/serve.py's (the one the browser tests
run under) without the outside sources it never uses, plus frame-ancestors 'none' and
manifest-src; and the caching, nosniff, Referrer-Policy and Permissions-Policy rules are there.
Run by npm test; needs node (to write the headers) and no browser."""
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
for p in ('/tex/p-0123456789abcdef.wasm', '/tex/w-0123456789abcdef.wasm', '/tex/t-0123456789abcdef.wasm', '/tex/b-0123456789abcdef.wasm', '/fonts/ibm-plex-sans-latin-ext-400-0123456789abcdef.woff2'):
    ok('content addressed files are cached for a year as immutable, by one rule: ' + p, H(p).get('cache-control') == 'public, max-age=31536000, immutable', H(p))
for p in ('/', '/index.html', '/sw.js', '/manifest.webmanifest'):
    ok('revalidated on every request: ' + p, H(p).get('cache-control') == 'no-cache', H(p))
ok('scripts bound to the version keep Pages\' default caching', 'cache-control' not in H('/tex/engine.js') and 'cache-control' not in H('/tex/tree.wasm'), H('/tex/engine.js'))
h = H('/git.js')
ok('nosniff, no framing, no referrer and no device access on every file', h.get('x-content-type-options') == 'nosniff' and h.get('x-frame-options') == 'DENY'
   and h.get('referrer-policy') == 'no-referrer' and 'camera=()' in h.get('permissions-policy', '') and 'geolocation=()' in h.get('permissions-policy', ''), h)
probs, _, _ = pages_check.check(dist(dict(APP, _headers=text)))
ok('and they fit Pages\' limits', probs == [], probs)
print('%d/%d passed' % (n, n))
