"""How fast Rikuy loads over a network: the first visit, the repeat visit and the first PDF.

Serves a built dist/ as Cloudflare Pages serves the hosted Rikuy (test/pages.py: index.html at /,
the rules of _headers), plus what Pages does that pages.py leaves out and that decides what a
visit transfers:
  - compression of the content types Cloudflare compresses (HTML, JavaScript, CSS, JSON, the
    manifest, WebAssembly; not woff2, not application/octet-stream), of answers of 50 bytes or
    more, with Brotli at quality 4 when Python has the brotli module (pip install brotli) and
    gzip at level 6 otherwise; the table says which. Cloudflare's free plan answers Chromium
    with Zstandard or Brotli at a level it does not document, so the sizes here are close to
    the live site's, not equal to them.
  - an ETag on every answer and 304 for a matching If-None-Match
  - Pages' default Cache-Control (public, max-age=0, must-revalidate) where no rule sets one
  - HTTP/1.1 with connections kept open. Pages speaks HTTP/2 and 3: Chromium opens at most six
    connections to this server, so more than six files asked for at once queue here and would
    not there. What is measured for many small files in parallel is an upper bound.

The network is shaped by this server, not by Chromium: every answer waits one round trip
before its first byte, and all answers together share the profile's download rate (a token
bucket). Chromium's own emulation (Network.emulateNetworkConditions, --shape cdp) slows a
page and the workers it starts, sharing the rate between them, but not the service worker,
which is another target: its install (8 MB of the first visit) then costs no time and takes
nothing from the page, which flatters every cold number. --shape cdp is kept to compare.

Each scenario runs in a fresh browser profile on disk (launch_persistent_context), so the
HTTP cache, the service worker's caches and IndexedDB are real:
  cold    first visit. The sample is on the page; a keystroke lands; Preview is pressed at
          once; the first PDF page is drawn. Then the visit is left to finish (service worker
          installed, nothing in flight) and its whole transfer is counted.
  warm    the same profile, Chromium started again: the repeat visit. The PDF pane opens by
          itself (the page remembers it was open), so there is no press.
  dwell   first visit, Preview pressed --dwell seconds after the editor is usable: what a
          warm up at idle is worth to someone who reads before pressing.
  heavy   first visit, the document of --heavy (a heavy preamble) put in the place of the
          sample (rikuy.api.setSource), then Preview.
  lua     the same with --lua (LuaLaTeX, fonts of five scripts).
  idle    first visit, Preview never pressed: what a visit transfers by itself (the service
          worker's install, and anything fetched ahead), and when the line falls quiet.

Times are milliseconds from the start of the navigation (performance.timeOrigin):
  fcp       first contentful paint
  doc       the sample is on the page (the "Typesetting" veil is gone)
  ready     rikuy.api.whenReady() resolved
  key       a typed character is in the source (measured after ready, so never before it)
  press     Preview pressed (cold: right after the keystroke was taken back)
  pdf       page 1 of the PDF drawn by pdf.js
  quiet     the last byte of the visit was sent (then nothing for --quiet seconds)
Bytes are what went over the wire (after compression, 304s as their few bytes), counted by the
server at the moment they were sent; requests are counted when they arrive.

Usage: python3 dev/bench_load.py [--dist dist] [--profiles local,cable,phone] [--scenarios cold,warm,dwell,heavy,lua,idle]
                                 [--runs 5] [--out FILE.json] [--waterfall] [--codec br|gzip|none] [--shape server|cdp]
                                 [--dwell 15] [--limit 420] [--quiet 4] [--save-data]
  --profiles   local (no shaping: what the CPU alone takes), cable (20 Mbit/s down, 5 up, 40 ms
               round trip), phone (4 Mbit/s down, 1 up, 120 ms)
  --save-data  the browser says Save-Data is on (navigator.connection.saveData): what a visit is
               where nothing is fetched ahead
  --limit      seconds after the press (or the start, on a repeat visit) after which a visit
               without a PDF counts as failed, with what the PDF pane said last
  --waterfall  print, for the first run of each scenario, every request in order: when it
               started and ended, its status, its bytes on the wire and uncompressed
Run it alone and pinned to one core (taskset -c 1): TeX's own seconds are CPU, and a busy
machine moves them. Medians of --runs runs are printed; the JSON has every run.
"""
import argparse, gzip, hashlib, json, os, shutil, statistics, sys, tempfile, threading, time
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
sys.path.insert(0, os.path.join(ROOT, 'test'))
if os.path.isdir('/opt/pw-browsers'): os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
import pages
try:
    import brotli
except ImportError:
    brotli = None

PROFILES = {  # download and upload in bits per second, round trip in ms
    'local': None,
    'cable': {'down': 20e6, 'up': 5e6, 'rtt': 40},
    'phone': {'down': 4e6, 'up': 1e6, 'rtt': 120},
}
# https://developers.cloudflare.com/speed/optimization/content/compression/ : the types of this
# build that are on Cloudflare's list (font/woff2, images and application/octet-stream are not)
COMPRESSED = {'text/html', 'application/javascript', 'text/javascript', 'text/css', 'application/json', 'application/manifest+json',
              'application/wasm', 'text/plain', 'application/xml', 'image/svg+xml'}
MIN_COMPRESS = 50
PAGES_DEFAULT_CACHE = 'public, max-age=0, must-revalidate'


class Shaper:
    """All answers share one download rate; each write books the next free slot on the line."""
    def __init__(self):
        self.lock = threading.Lock()
        self.set(None)

    def set(self, profile):
        with self.lock:
            self.rate = profile['down'] / 8 if profile else None  # bytes per second
            self.rtt = profile['rtt'] / 1000 if profile else 0
            self.free = 0.0
            # a slice of 10 ms of the line, so answers in flight take turns
            self.chunk = max(1024, int(self.rate * 0.01)) if self.rate else 1 << 20

    def book(self, n):
        """Seconds to wait before sending n bytes."""
        if not self.rate: return 0
        with self.lock:
            now = time.monotonic()
            at = max(now, self.free)
            self.free = at + n / self.rate
            return at - now


class Log:
    def __init__(self):
        self.lock = threading.Lock()
        self.reset()

    def reset(self):
        with self.lock:
            self.reqs = []    # dicts: path, t0, t1 (epoch ms), status, wire, raw, enc
            self.sent = []    # (epoch ms, bytes) for every write
            self.flying = 0
            self.last = time.time()

    def bytes_by(self, t):
        with self.lock: return sum(n for at, n in self.sent if at <= t)

    def reqs_by(self, t):
        with self.lock: return sum(1 for r in self.reqs if r['t0'] <= t)


class Compressor:
    """Compressed bodies, kept on disk by content hash so only the first run pays for them."""
    def __init__(self, codec):
        self.codec = codec
        self.dir = os.path.join(tempfile.gettempdir(), 'rikuy-bench-' + codec)
        os.makedirs(self.dir, exist_ok=True)
        self.mem = {}
        self.lock = threading.Lock()

    def info(self, f):
        """(etag, raw size) of a file, by its bytes."""
        st = os.stat(f)
        key = (f, st.st_mtime_ns, st.st_size)
        with self.lock:
            if key in self.mem: return self.mem[key]
        h = hashlib.sha256(open(f, 'rb').read()).hexdigest()[:32]
        with self.lock: self.mem[key] = (h, st.st_size)
        return h, st.st_size

    def body(self, f, etag):
        if self.codec == 'none': return None
        p = os.path.join(self.dir, etag)
        if os.path.isfile(p): return open(p, 'rb').read()
        raw = open(f, 'rb').read()
        z = brotli.compress(raw, quality=4) if self.codec == 'br' else gzip.compress(raw, 6, mtime=0)
        tmp = p + '.%d.%d' % (os.getpid(), threading.get_ident())
        open(tmp, 'wb').write(z)
        os.replace(tmp, p)
        return z


class H(pages.H):
    protocol_version = 'HTTP/1.1'

    def do_GET(self):
        srv = self.server
        t0 = time.time() * 1000
        with srv.log.lock: srv.log.flying += 1
        rec = {'path': self.path, 't0': t0, 't1': None, 'status': 0, 'wire': 0, 'raw': 0, 'enc': ''}
        try:
            self.answer(rec)
        except (BrokenPipeError, ConnectionResetError):
            rec['status'] = rec['status'] or -1  # the browser went away (a page closed mid answer)
        finally:
            rec['t1'] = time.time() * 1000
            with srv.log.lock:
                srv.log.reqs.append(rec); srv.log.flying -= 1; srv.log.last = time.time()

    do_HEAD = do_GET

    def answer(self, rec):
        srv = self.server
        root = os.path.abspath(srv.root)
        path = self.path.split('?')[0].split('#')[0]
        if srv.shaper.rtt: time.sleep(srv.shaper.rtt)
        if path == '/index.html':
            return self.put(rec, 308, b'', 'text/plain', path, [('Location', '/')])
        rel = 'index.html' if path == '/' else path.lstrip('/')
        f = os.path.normpath(os.path.join(root, rel))
        if os.path.commonpath([root, f]) != root or not os.path.isfile(f):
            nf = os.path.join(root, '404.html')
            return self.put(rec, 404, open(nf, 'rb').read() if os.path.isfile(nf) else b'Not found', 'text/html; charset=utf-8', path)
        ctype = pages.TYPES.get(os.path.splitext(f)[1], 'application/octet-stream')
        etag, size = srv.comp.info(f)
        rec['raw'] = size
        accepts = [x.split(';')[0].strip() for x in (self.headers.get('Accept-Encoding') or '').split(',')]
        enc = srv.comp.codec if (srv.comp.codec in accepts and ctype.split(';')[0] in COMPRESSED and size >= MIN_COMPRESS) else ''
        # (compression on the way makes the tag a weak one, as Cloudflare's does)
        tag = ('W/"%s"' if enc else '"%s"') % etag
        inm = self.headers.get('If-None-Match')
        if inm and etag in [x.strip().removeprefix('W/').strip('"') for x in inm.split(',')]:
            return self.put(rec, 304, b'', ctype, path, [('ETag', tag)])
        body = srv.comp.body(f, etag) if enc else open(f, 'rb').read()
        rec['enc'] = enc
        self.put(rec, 200, body, ctype, path, [('ETag', tag)] + ([('Content-Encoding', enc), ('Vary', 'Accept-Encoding')] if enc else []))

    def put(self, rec, code, body, ctype, path, extra=()):
        srv = self.server
        rec['status'] = code
        self.send_response(code)
        hs = pages.headers_for(srv.root, path)
        if not any(k.lower() == 'content-type' for k, v in hs): self.send_header('Content-Type', ctype)
        if not any(k.lower() == 'cache-control' for k, v in hs): self.send_header('Cache-Control', PAGES_DEFAULT_CACHE)
        self.send_header('Content-Length', str(len(body)))
        for k, v in list(hs) + list(extra): self.send_header(k, v)
        self.end_headers()
        if self.command == 'HEAD' or code == 304: body = b''
        head = 300  # about what the status line and headers weigh once HTTP/2 has packed them
        sh, log = srv.shaper, srv.log
        view = memoryview(body)
        i = 0
        while True:
            n = min(sh.chunk, len(view) - i)
            wait = sh.book(n + head)
            if wait > 0: time.sleep(wait)
            if n: self.wfile.write(view[i:i + n])
            with log.lock: log.sent.append((time.time() * 1000, n + head))
            rec['wire'] += n + head
            head = 0
            i += n
            if i >= len(view): break
        self.wfile.flush()

    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0)
        if n: self.rfile.read(n)
        self.send_response(405); self.send_header('Content-Length', '0'); self.end_headers()


def serve(port, root, codec):
    s = pages.Server(('127.0.0.1', port), H)
    s.root = root
    s.hits = []
    s.shaper, s.log, s.comp = Shaper(), Log(), Compressor(codec)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s


# what the page notes about itself, from its first script on
INIT = '''(() => {
  const B = window.__bench = { t: {} };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!(e.name in B.t)) B.t[e.name] = e.startTime; }).observe({ type: 'paint', buffered: true }); } catch (e) {}
  const iv = setInterval(() => {
    const boot = document.getElementById('boot');
    if (!('doc' in B.t) && boot && boot.hidden && document.querySelector('#pages .it')) B.t.doc = performance.now();
    if (!B.hooked && window.rikuy && window.rikuy.api) { B.hooked = true; window.rikuy.api.whenReady().then(() => { B.t.ready = performance.now(); }, (e) => { B.error = String(e); }); }
    // page 1 of the PDF drawn: pdf.js's render of it is through
    const pv = window.rikuy && window.rikuy.pdfView;
    if (pv && !pv.__bench) {
      pv.__bench = true;
      const draw = pv.draw.bind(pv);
      pv.draw = async (p) => { await draw(p); if (p && p.n === 1 && p.drawn && !('pdf' in B.t)) B.t.pdf = performance.now(); };
    }
    const c = window.rikuy && window.rikuy.lastCompile;
    if (c && !window.rikuy.compiling && (c.failed || c.ok === false) && !B.failed) B.failed = c.failed || 'TeX stopped at an error';
    if ('pdf' in B.t && 'ready' in B.t) clearInterval(iv);
  }, 4);
})();'''


def one(p, srv, url, prof, scenario, profile_dir, args, doc=None):
    """One visit in the profile folder given; returns its times, bytes, requests and waterfall."""
    srv.log.reset()
    ctx = p.chromium.launch_persistent_context(profile_dir, headless=True, viewport={'width': 1300, 'height': 900})
    try:
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.add_init_script(INIT)
        if args.save_data: page.add_init_script("Object.defineProperty(Navigator.prototype, 'connection', { get() { return { saveData: true, effectiveType: '4g' }; } })")
        if args.shape == 'cdp' and PROFILES[prof]:
            c = ctx.new_cdp_session(page)
            c.send('Network.enable')
            c.send('Network.emulateNetworkConditions', {'offline': False, 'latency': PROFILES[prof]['rtt'], 'downloadThroughput': PROFILES[prof]['down'] / 8, 'uploadThroughput': PROFILES[prof]['up'] / 8})
        page.goto(url, wait_until='commit')
        page.wait_for_function('window.__bench && window.__bench.t.ready !== undefined || window.__bench && window.__bench.error', timeout=180000, polling=20)
        t = {}
        auto = page.evaluate('document.body.classList.contains("pdf-on")')
        if not auto:
            # a keystroke lands: a character typed at the end of the first paragraph is in the source
            before = page.evaluate('window.rikuy.api.getSource()')
            page.evaluate('''() => { const s = document.querySelector('#pages .it.p span.t'); const r = document.createRange(); r.setStart(s.firstChild, s.firstChild.length); r.collapse(true);
              document.getElementById('pages').focus(); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }''')
            page.keyboard.type('Q')
            page.wait_for_function('window.rikuy.api.getSource().length === %d' % (len(before) + 1), timeout=10000, polling=10)
            t['key'] = page.evaluate('performance.now()')
            page.keyboard.press('Backspace')
            page.wait_for_function('window.rikuy.api.getSource().length === %d' % len(before), timeout=10000, polling=10)
            if doc is not None:
                page.evaluate('(s) => window.rikuy.api.setSource(s)', doc)
            if scenario == 'dwell':
                page.wait_for_timeout(args.dwell * 1000)
            if scenario != 'idle':
                t['press'] = page.evaluate('performance.now()')
                page.click('#b-pdf')
        if scenario != 'idle':
            try: page.wait_for_function('window.__bench.t.pdf !== undefined || window.__bench.failed', timeout=args.limit * 1000, polling=50)
            except Exception: page.evaluate('(n) => { window.__bench.failed = "no PDF " + n + " s after the press; the PDF pane says: " + document.getElementById("pdf-status").textContent; }', args.limit)
        B = page.evaluate('({ t: window.__bench.t, failed: window.__bench.failed || null, origin: performance.timeOrigin, status: document.getElementById("pdf-status").textContent })')
        t.update(B['t'])
        origin = B['origin']
        # the visit left to finish: the service worker in charge, nothing in flight for --quiet seconds
        try: page.wait_for_function('!navigator.serviceWorker || navigator.serviceWorker.controller !== null', timeout=180000)
        except Exception: pass
        until = time.time() + 180
        while time.time() < until:
            with srv.log.lock: quiet = srv.log.flying == 0 and time.time() - srv.log.last > args.quiet
            if quiet or B['failed']: break
            time.sleep(0.25)
        log = srv.log
        r = {'profile': prof, 'scenario': scenario, 'auto': auto, 'failed': B['failed'], 'status': B['status'], 'errors': errors,
             't': {k: round(v) for k, v in t.items()}}
        for k in ('ready', 'pdf'):
            if k in t:
                r['bytes_' + k] = log.bytes_by(origin + t[k]); r['reqs_' + k] = log.reqs_by(origin + t[k])
        if 'press' in t and 'pdf' in t:
            r['bytes_press_pdf'] = log.bytes_by(origin + t['pdf']) - log.bytes_by(origin + t['press'])
            r['reqs_press_pdf'] = log.reqs_by(origin + t['pdf']) - log.reqs_by(origin + t['press'])
        with log.lock:
            r['bytes_all'] = sum(n for at, n in log.sent); r['reqs_all'] = len(log.reqs)
            if log.sent: r['t']['quiet'] = round(max(at for at, n in log.sent) - origin)
            r['waterfall'] = [{'path': q['path'], 'start': round(q['t0'] - origin), 'end': round(q['t1'] - origin), 'status': q['status'], 'wire': q['wire'], 'raw': q['raw'], 'enc': q['enc']}
                              for q in sorted(log.reqs, key=lambda q: q['t0'])]
        return r
    finally:
        ctx.close()


def med(runs, f):
    v = [f(r) for r in runs]
    v = [x for x in v if x is not None]
    return round(statistics.median(v)) if v else None


def show_waterfall(r):
    t = r['t']
    marks = sorted((v, k) for k, v in t.items())
    print('    marks: ' + ', '.join('%s %d' % (k, v) for v, k in marks))
    print('    %7s %7s %4s %9s %9s  %s' % ('start', 'end', 'http', 'wire', 'raw', 'path'))
    for q in r['waterfall']:
        print('    %7d %7d %4d %9d %9d  %s' % (q['start'], q['end'], q['status'], q['wire'], q['raw'], q['path']))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--dist', default=os.path.join(ROOT, 'dist'))
    ap.add_argument('--profiles', default='local,cable,phone')
    ap.add_argument('--scenarios', default='cold,warm,dwell,heavy,lua,idle')
    ap.add_argument('--runs', type=int, default=5)
    ap.add_argument('--dwell', type=int, default=15)
    ap.add_argument('--limit', type=int, default=420)
    ap.add_argument('--quiet', type=float, default=4)
    ap.add_argument('--heavy', default='/home/claude/perf/heavy/main.tex')
    ap.add_argument('--lua', default='/home/claude/perf/lua/main.tex')
    ap.add_argument('--port', type=int, default=int(os.environ.get('PORT', '8793')))
    ap.add_argument('--codec', default='br' if brotli else 'gzip', choices=['br', 'gzip', 'none'])
    ap.add_argument('--shape', default='server', choices=['server', 'cdp'])
    ap.add_argument('--save-data', action='store_true')
    ap.add_argument('--out')
    ap.add_argument('--waterfall', action='store_true')
    args = ap.parse_args()
    if args.codec == 'br' and not brotli: sys.exit('no brotli module: pip install brotli, or --codec gzip')
    from playwright.sync_api import sync_playwright
    dist = os.path.abspath(args.dist)
    srv = serve(args.port, dist, args.codec)
    url = 'http://127.0.0.1:%d/' % args.port
    scenarios = args.scenarios.split(',')
    docs = {}
    for k in ('heavy', 'lua'):
        if k in scenarios:
            if os.path.isfile(getattr(args, k)): docs[k] = open(getattr(args, k), encoding='utf8').read()
            else: print('no ' + getattr(args, k) + ': ' + k + ' is skipped'); scenarios.remove(k)
    print('dist %s, compression %s, shaping by %s, %d runs' % (dist, {'br': 'Brotli 4', 'gzip': 'gzip 6', 'none': 'none'}[args.codec], args.shape, args.runs))
    out = []
    with sync_playwright() as p:
        for prof in args.profiles.split(','):
            srv.shaper.set(PROFILES[prof] if args.shape == 'server' else None)
            for sc in scenarios:
                if sc == 'warm': continue  # runs right after cold, in its profile
                for i in range(args.runs):
                    d = tempfile.mkdtemp(prefix='rikuy-bench-profile-')
                    try:
                        r = one(p, srv, url, prof, sc, d, args, docs.get(sc))
                        r['run'] = i; out.append(r)
                        print('  %s %s %d: %s%s' % (prof, sc, i, json.dumps(r['t']), ' FAILED: ' + str(r['failed']) if r['failed'] else ''), flush=True)
                        if sc == 'cold' and 'warm' in scenarios:
                            w = one(p, srv, url, prof, 'warm', d, args)
                            w['run'] = i; out.append(w)
                            print('  %s warm %d: %s%s' % (prof, i, json.dumps(w['t']), ' FAILED: ' + str(w['failed']) if w['failed'] else ''), flush=True)
                    finally:
                        shutil.rmtree(d, ignore_errors=True)
    if args.out:
        with open(args.out, 'w') as f: json.dump({'dist': dist, 'codec': args.codec, 'shape': args.shape, 'profiles': {k: PROFILES[k] for k in args.profiles.split(',')}, 'runs': out}, f)
    print()
    print('medians of %d runs; times in ms from the start of the navigation, bytes on the wire' % args.runs)
    cols = ['fcp', 'doc', 'ready', 'key', 'press', 'pdf', 'press>pdf', 'quiet', 'B ready', 'N ready', 'B pdf', 'N pdf', 'B press>pdf', 'N press>pdf', 'B visit', 'N visit']
    print('%-6s %-6s' % ('net', 'visit') + ''.join('%12s' % c for c in cols))  # B bytes, N requests
    for prof in args.profiles.split(','):
        for sc in scenarios:
            runs = [r for r in out if r['profile'] == prof and r['scenario'] == sc and not r['failed']]
            if not runs: print('%-6s %-6s  no run went through' % (prof, sc)); continue
            T = lambda k: med(runs, lambda r: r['t'].get(k))
            row = [T('first-contentful-paint'), T('doc'), T('ready'), T('key'), T('press'), T('pdf'),
                   med(runs, lambda r: r['t']['pdf'] - r['t']['press'] if 'press' in r['t'] and 'pdf' in r['t'] else None), T('quiet'),
                   med(runs, lambda r: r.get('bytes_ready')), med(runs, lambda r: r.get('reqs_ready')), med(runs, lambda r: r.get('bytes_pdf')), med(runs, lambda r: r.get('reqs_pdf')),
                   med(runs, lambda r: r.get('bytes_press_pdf')), med(runs, lambda r: r.get('reqs_press_pdf')), med(runs, lambda r: r['bytes_all']), med(runs, lambda r: r['reqs_all'])]
            print('%-6s %-6s' % (prof, sc) + ''.join('%12s' % ('-' if x is None else x) for x in row))
    if args.waterfall:
        for prof in args.profiles.split(','):
            for sc in scenarios:
                runs = [r for r in out if r['profile'] == prof and r['scenario'] == sc]
                if runs:
                    print('\n%s %s, run 0:' % (prof, sc))
                    show_waterfall(runs[0])
    bad = [r for r in out if r['failed'] or r['errors']]
    for r in bad: print('FAILED %s %s %d: %s %s' % (r['profile'], r['scenario'], r['run'], r['failed'], r['errors'][:2]))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
