"""How long a person waits for the PDF, in the built page (dist/, served as the artifact host
serves it), per document of dev/bench/ and per situation:

  first      the first compile of a session: nothing kept, the worker not started (its start,
             "boot", is in the total and also given on its own)
  unchanged  the same text compiled again (Ctrl+P)
  word       one word of the body changed (no .aux, .toc or .bbl changes)
  ref        a \\label and a \\ref to it added (a second pass is needed)
  cite       a citation of an entry not cited before added (BibTeX and two more passes)

For each: "total" from the edit to the PDF's visible pages drawn, without the 1.4 s the page
waits after the last keystroke before it compiles (App.pdfSoon); "tex" the worker's own time for
the compile; the engine and what ran ("tex bibtex tex tex"), with the TeX passes counted. Every
figure is the median over N runs, each run in a new browser profile; within a run the warm
situations are each measured several times.

Each document's folder holds its files and bench.json: {"main", "word": [from, to],
"ref": [from, to], "cite": [from, to]?}: the edits, as replacements of text that occurs once.

Usage: python3 dev/bench_compile.py [-n 5] [--docs sample,heavy] [--json out.json] [--against before.json]
       python3 dev/bench_compile.py --show after.json [--against before.json]
  env: RIKUY_DIST (default dist/), PORT (default 8793). On a shared machine: taskset -c 0 python3 ...
"""
import argparse, json, os, statistics, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'test'))
os.environ['RIKUY_DIST'] = os.path.abspath(os.environ.get('RIKUY_DIST') or os.path.join(HERE, '..', 'dist'))
import serve
from browser import ROUTES
from playwright.sync_api import sync_playwright

BENCH = os.path.join(HERE, 'bench')
SITUATIONS = ['first', 'unchanged', 'word', 'ref', 'cite']
WARM = 3  # times each warm situation is measured within a run

# In the page: record what the worker answers (its time, its runs), and when pages are drawn.
HOOK = """() => {
  const g = window.rikuy, e = g.texEngine();
  window.__bench = { done: [], ready: 0, draws: new Set(), drawn: 0 };
  const compile = e.compile.bind(e);
  e.compile = async (job) => { const r = await compile(job); window.__bench.done.push({ ms: r.ms, passes: r.passes, engine: r.engine, ok: r.ok, runs: (r.runs || []).map((x) => x.cmd).join(' ') }); return r; };
  const start = e.start.bind(e), t0 = performance.now();
  e.start = () => { const p = start(); if (!window.__bench.readyP) window.__bench.readyP = p.then(() => { window.__bench.ready = performance.now() - t0; }, () => {}); return p; };
  const v = g.pdfPane(), draw = v.draw.bind(v);
  // (the pane also draws the page after those in view; the wait that is timed ends with the ones in view)
  const seen = (p) => { const a = p.box.getBoundingClientRect(), b = v.host.getBoundingClientRect(); return a.bottom > b.top && a.top < b.bottom; };
  v.draw = (p) => { const fresh = p && !p.drawn && seen(p), d = draw(p); if (fresh) { window.__bench.drawn++; window.__bench.draws.add(d); Promise.resolve(d).finally(() => window.__bench.draws.delete(d)); } return d; };
}"""
# One compile, timed in the page: the text set (or not), the wait after typing skipped, the
# compile, then the pages the pane shows drawn.
RUN = """async ([text, open]) => {
  const g = window.rikuy, B = window.__bench, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  while (g.compiling) await sleep(20);
  g.pdfSoon.cancel();
  // A person's next compile comes 1.4 s after a keystroke at the soonest: what the page still
  // does after the pages in view are drawn (the next page, SyncTeX) is over by then, so here too
  await sleep(400);
  await new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 3000 }) : setTimeout(r, 200)));
  B.done = [];
  const drawn0 = B.drawn, t0 = performance.now();
  if (text != null) { await g.api.setSource(text); g.pdfSoon.cancel(); }
  if (open) g.togglePdf(true); else await g.compilePdf();
  while (g.compiling || !B.done.length) await sleep(5);
  const pages = (g.lastCompile && g.lastCompile.pages) || 0;
  // the pane draws the pages in view when the browser next lays out
  for (let k = 0; k < 400 && pages && (B.drawn === drawn0 || B.draws.size); k++) await sleep(5);
  await Promise.all([...B.draws]);
  const total = performance.now() - t0;
  g.pdfSoon.cancel();
  // (more than one compile for one measurement would be the page compiling twice: said, not hidden)
  return Object.assign({ total, pages, boot: B.ready, compiles: B.done.length, status: document.getElementById('pdf-status').textContent, errors: (g.texIssues || []).filter((x) => x.sev === 'error').length }, B.done[0]);
}"""


def read_doc(name):
    d = os.path.join(BENCH, name)
    spec = json.load(open(os.path.join(d, 'bench.json'), encoding='utf8'))
    files = {}
    for dp, _, fn in os.walk(d):
        for n in fn:
            if n == 'bench.json': continue
            p = os.path.join(dp, n)
            files[os.path.relpath(p, d).replace(os.sep, '/')] = open(p, encoding='utf8').read()
    text = files[spec['main']]
    for k in ('word', 'ref', 'cite'):
        if k in spec and text.count(spec[k][0]) != 1: raise SystemExit('%s: bench.json\'s "%s" must name text that occurs once in %s' % (name, k, spec['main']))
    return spec, files


def open_app(pw, port):
    b = pw.chromium.launch(args=[a for a in os.environ.get('CHROME_ARGS', '').split() if a])
    ctx = b.new_context(viewport={'width': 1600, 'height': 1000})
    page = ctx.new_page()

    def h(route):
        u = route.request.url
        if u in ROUTES: return route.fulfill(status=200, content_type='text/javascript', body=open(ROUTES[u], encoding='utf8').read(), headers={'Access-Control-Allow-Origin': '*'})
        if u.startswith('http://127.0.0.1'): return route.continue_()
        return route.abort()
    page.route('**/*', h)
    page.goto('http://127.0.0.1:%d/' % port)
    page.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=60000)
    # (the app's start goes on after the page shows, and opens the preview by itself where it was open before)
    page.evaluate('window.rikuy.api.whenReady()')
    return b, page


def one_run(pw, port, name, spec, files):
    """One session with one document: every situation, in a new browser profile."""
    b, page = open_app(pw, port)
    out = {k: [] for k in SITUATIONS}
    try:
        page.evaluate("""async ([files, main]) => { await window.rikuy.openFiles(Object.entries(files).sort((a, b) => (a[0] === main ? -1 : b[0] === main ? 1 : 0)).map(([n, t]) => new File([t], n))); }""", [files, spec['main']])
        page.wait_for_function('(m) => window.rikuy.main === m && !window.rikuy.compiling', arg=spec['main'], timeout=30000)
        page.evaluate(HOOK)
        text = files[spec['main']]

        def run(kind, t=None, first=False):
            r = page.evaluate(RUN, [t, first])
            if not r.get('ok'): raise SystemExit('%s, %s: no PDF (%s)' % (name, kind, r.get('status')))
            if r['compiles'] != 1: raise SystemExit('%s, %s: the page compiled %d times for one measurement' % (name, kind or 'back', r['compiles']))
            if kind: out[kind].append(r)
            return r
        run('first', None, True)
        for _ in range(WARM): run('unchanged')
        word = text.replace(*spec['word'])
        for k in range(WARM): run('word', word if k % 2 == 0 else text)
        if WARM % 2: run(None, text)
        for kind in ('ref', 'cite'):
            if kind not in spec: continue
            for _ in range(WARM):
                run(kind, text.replace(*spec[kind]))
                run(None, text)  # back, not measured: each addition starts from the same files
    finally:
        b.close()
    return out


def med(xs): return statistics.median(xs) if xs else None


def summarize(runs):
    """runs: one {situation: [results]} per session. Medians over sessions of each session's median."""
    row = {}
    for k in SITUATIONS:
        per = [r[k] for r in runs if r.get(k)]
        if not per: continue
        row[k] = {
            'total': round(med([med([x['total'] for x in xs]) for xs in per])),
            'tex': round(med([med([x['ms'] for x in xs]) for xs in per])),
            'passes': round(med([med([x['passes'] for x in xs]) for xs in per]), 1),
            'runs': per[0][-1]['runs'], 'engine': per[0][-1]['engine'], 'pages': per[0][-1]['pages'], 'errors': per[0][-1]['errors'],
            'all': [[round(x['total']) for x in xs] for xs in per],
        }
        if k == 'first': row[k]['boot'] = round(med([xs[0]['boot'] for xs in per]))
    return row


def table(res, before=None):
    n = lambda v: '%6d' % v if v is not None else '     -'
    ps = lambda v: '-' if v is None else '%g' % v
    head = '%-8s %-9s %-10s %7s %7s %6s  %s' % ('document', 'engine', 'situation', 'total', 'tex', 'passes', 'ran')
    if before: head = '%-8s %-9s %-10s %7s %7s %6s   %7s %7s %6s  %6s  %s' % ('document', 'engine', 'situation', 'total', 'tex', 'passes', 'total', 'tex', 'passes', 'gain', 'ran')
    lines = [head]
    if before: lines.insert(0, '%-29s %22s   %22s' % ('', 'before (ms)', 'after (ms)'))
    for doc, row in res.items():
        for k in SITUATIONS:
            if k not in row: continue
            x = row[k]
            note = x['runs'] + (' (boot %d)' % x['boot'] if 'boot' in x else '') + (', %d pages' % x['pages'] if k == 'first' else '') + (', %d TeX errors' % x['errors'] if x['errors'] else '')
            if before:
                o = (before.get(doc) or {}).get(k) or {}
                gain = '%5.1fx' % (o['total'] / x['total']) if o.get('total') and x['total'] else '     -'
                lines.append('%-8s %-9s %-10s %s %s %6s   %s %s %6s  %s  %s' % (doc, x['engine'], k, n(o.get('total')), n(o.get('tex')), ps(o.get('passes')), n(x['total']), n(x['tex']), ps(x['passes']), gain, note))
            else:
                lines.append('%-8s %-9s %-10s %s %s %6s  %s' % (doc, x['engine'], k, n(x['total']), n(x['tex']), ps(x['passes']), note))
    return '\n'.join(lines)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('-n', type=int, default=5, help='sessions per document (default 5)')
    ap.add_argument('--docs', default='', help='folders of dev/bench/, comma separated (default: all)')
    ap.add_argument('--json', help='write the results here (added to what the file holds for other documents)')
    ap.add_argument('--against', help='a file --json wrote earlier: the table shows both')
    ap.add_argument('--show', help='measure nothing: print the table of a file --json wrote (with --against, of both)')
    a = ap.parse_args()
    if a.show:
        print(table(json.load(open(a.show)), json.load(open(a.against)) if a.against else None))
        return
    docs = [d for d in a.docs.split(',') if d] or sorted(d for d in os.listdir(BENCH) if os.path.isfile(os.path.join(BENCH, d, 'bench.json')))
    port = int(os.environ.get('PORT', '8793'))
    serve.start(port)
    res = {}
    with sync_playwright() as pw:
        for name in docs:
            spec, files = read_doc(name)
            runs = []
            for k in range(a.n):
                t = time.time()
                runs.append(one_run(pw, port, name, spec, files))
                print('%s: session %d of %d, %.0f s' % (name, k + 1, a.n, time.time() - t), file=sys.stderr, flush=True)
            res[name] = summarize(runs)
    if a.json:
        # documents measured before stay in the file: one document at a time gives the same file
        if os.path.isfile(a.json): res = dict(json.load(open(a.json)), **res)
        json.dump(res, open(a.json, 'w'), indent=1)
    print(table(res, json.load(open(a.against)) if a.against else None))


if __name__ == '__main__':
    main()
