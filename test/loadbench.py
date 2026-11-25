"""How fast Rikuy opens, one build against another, runs taken in turn (A B B A ...): the numbers a
change to loading, the first layout or scrolling is judged by. Runs on GitHub's runners through
.github/workflows/suite.yml (a suite "loadbench.py:open,base=<ref>"), where a machine of its own
gives steadier numbers than a shared one; locally pinned to one core (taskset -c 1).

Parts:
  open    a first visit (Preview not pressed), then the repeat visit in the same browser profile
          (served by the service worker), on a cable and a phone line (dev/bench_load.py's shaped
          server): first paint, the document drawn, the editor ready, a typed key in the source
  long    the repeat visit of a 100 page document kept in the browser (dev/bench/long, two and a
          half times): opening one's own long paper
  pdf     a first visit with Preview pressed at once: the first PDF (needs dist/tex), cable line
  scroll  the 100 page document scrolled top to bottom by the wheel: frame gaps (rAF), frames over
          50 ms and long tasks

Arguments: parts (default open,long), and
  base=REF|DIR   the build to compare against: a built dist/ folder, or a git ref or commit, built
                 here into a temporary folder (with dist/tex copied in for pdf); default origin/main
  head=REF|DIR   default this checkout's dist/
  rounds=N       runs of each build (default 8; pdf 4)
  profiles=...   lines for open (default cable,phone)
Prints, per part and measure, each build's median and 95th percentile and the change of the
median; the JSON of every run goes to $LOADBENCH_OUT (default /tmp/loadbench.json). Exits 1 when
a run failed or a page had an error."""
import atexit, json, os, shutil, statistics, subprocess, sys, tempfile, time, types
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, 'dev'))
import browser  # noqa: F401  (Playwright's waits handed over as functions, under the page's policy)
import bench_load as BL
from playwright.sync_api import sync_playwright

ARGS = dict(a.split('=', 1) for a in sys.argv[1:] if '=' in a)
PARTS = [p for a in sys.argv[1:] if '=' not in a for p in a.split(',') if p] or ['open', 'long']
ROUNDS = int(ARGS.get('rounds', '0'))
OUT = os.environ.get('LOADBENCH_OUT', os.path.join(tempfile.gettempdir(), 'loadbench.json'))
failures = []


def built(spec, label):
    """A dist/ folder for spec: itself when it is one, else the ref built in a worktree."""
    if os.path.isdir(spec) and os.path.isfile(os.path.join(spec, 'index.html')):
        return os.path.abspath(spec)
    work = tempfile.mkdtemp(prefix='loadbench-' + label + '-')
    src, out = os.path.join(work, 'src'), os.path.join(work, 'dist')
    # (the worktree and the build go when the run ends: a build with dist/tex copied is 300 MB)
    atexit.register(lambda: (subprocess.run(['git', 'worktree', 'remove', '--force', src], cwd=ROOT, capture_output=True), shutil.rmtree(work, ignore_errors=True)))
    run = lambda *a, **k: subprocess.run(list(a), check=True, **k)
    # (a commit by its hash is fetched as it is: GitHub serves any commit of the repository)
    if subprocess.run(['git', 'rev-parse', '--verify', '-q', spec + '^{commit}'], cwd=ROOT, capture_output=True).returncode != 0:
        name = spec.split('/', 1)[1] if spec.startswith('origin/') else spec
        run('git', 'fetch', '-q', '--depth=1', 'origin', name, cwd=ROOT)
        spec = 'FETCH_HEAD'
    run('git', 'worktree', 'add', '-q', '--detach', src, spec, cwd=ROOT)
    os.symlink(os.path.join(ROOT, 'node_modules'), os.path.join(src, 'node_modules'))
    if os.path.isdir(os.path.join(ROOT, 'dist', 'tex')) and 'pdf' in PARTS:
        shutil.copytree(os.path.join(ROOT, 'dist', 'tex'), os.path.join(out, 'tex'))
    run('node', 'build.mjs', cwd=src, env=dict(os.environ, RIKUY_OUT=out), stdout=subprocess.DEVNULL)
    return out


def stats(v):
    v = sorted(x for x in v if x is not None)
    if not v: return None, None
    return statistics.median(v), v[min(len(v) - 1, int(round(0.95 * (len(v) - 1))))]


def table(title, rows, builds):
    """rows: [(measure, {build: [values]})]. Each line starts RESULT, which dev/suite_runs.py keeps
    in a runner's log and summary (it shows nothing else of a run that passed)."""
    print('\nRESULT ' + title)
    print('RESULT   %-26s' % 'measure' + ''.join('%22s' % ('%s median p95' % b) for b in builds) + '%10s' % 'change')
    for name, by in rows:
        cells, meds = '', []
        for b in builds:
            m, p = stats(by.get(b, []))
            meds.append(m)
            cells += '%22s' % ('-' if m is None else '%.0f %.0f' % (m, p))
        ch = '%+.0f%%' % (100 * (meds[1] - meds[0]) / meds[0]) if len(meds) == 2 and meds[0] and meds[1] is not None else ''
        print('RESULT   %-26s' % name + cells + '%10s' % ch)


def order(r, n):
    return list(range(n)) if r % 2 == 0 else list(reversed(range(n)))


def part_open(p, builds, dists):
    rounds = ROUNDS or 8
    marks = [('first paint', 'first-contentful-paint'), ('document drawn', 'doc'), ('editor ready', 'ready'), ('key in the source', 'key')]
    res = []
    for prof in ARGS.get('profiles', 'cable,phone').split(','):
        srvs = [BL.serve(8930 + i, dists[b], 'br' if BL.brotli else 'gzip') for i, b in enumerate(builds)]
        for s in srvs: s.shaper.set(BL.PROFILES[prof])
        # (Save-Data: the visit fetches no TeX ahead, which would only be in the way of what is measured)
        args = types.SimpleNamespace(save_data=True, shape='server', limit=60, quiet=2, dwell=0)
        for r in range(rounds):
            for i in order(r, len(builds)):
                d = tempfile.mkdtemp(prefix='loadbench-profile-')
                try:
                    for visit in ('first', 'repeat'):
                        x = BL.one(p, srvs[i], 'http://127.0.0.1:%d/' % (8930 + i), prof, 'idle', d, args)
                        res.append({'part': 'open', 'build': builds[i], 'profile': prof, 'visit': visit, 't': x['t'], 'errors': x['errors']})
                        if x['errors'] or x['failed']: failures.append((builds[i], prof, visit, x['errors'][:2], x['failed']))
                        print('  open %s %s %s %d: %s' % (builds[i], prof, visit, r, json.dumps({k: x['t'].get(v) for k, v in marks})), flush=True)
                finally:
                    shutil.rmtree(d, ignore_errors=True)
        for s in srvs: s.shutdown(); s.server_close()
        for visit in ('first', 'repeat'):
            table('open, %s line, %s visit (ms from the start of the navigation)' % (prof, visit),
                  [(name, {b: [x['t'].get(k) for x in res if x['build'] == b and x['profile'] == prof and x['visit'] == visit] for b in builds}) for name, k in marks], builds)
    return res


def long_files():
    B = os.path.join(ROOT, 'dev', 'bench', 'long')
    s = open(os.path.join(B, 'main.tex'), encoding='utf8').read()
    i = s.index('\\begin{document}') + len('\\begin{document}')
    j = s.index('\\end{document}')
    body = s[i:j].replace('\\tableofcontents', '').replace('\\maketitle', '')
    extra = body.replace('\\label{', '\\label{x') + body[:len(body) // 2].replace('\\label{', '\\label{y')
    return {'main.tex': s[:j] + extra + s[j:], 'refs.bib': open(os.path.join(B, 'refs.bib'), encoding='utf8').read()}


PUT_LONG = '''(files) => new Promise((done) => { const g = window.rikuy; g.files = new Map(Object.entries(files)); g.main = 'main.tex'; g.name = 'Long paper';
  g.hist = []; g.redoStack = []; g.forceRender = true; g.rebuild(); const f = g.noteSaveState; let n = 0;
  g.noteSaveState = function (kept) { if (kept !== undefined && !n++) setTimeout(() => done(document.querySelectorAll('#pages .page').length), 300); return f.apply(this, arguments); };
  g.saveSoon(); g.saveSoon.flush(); })'''


def part_long(p, builds, dists):
    rounds = ROUNDS or 8
    files = long_files()
    marks = [('document drawn', 'doc'), ('editor ready', 'ready'), ('key in the source', 'key')]
    srvs = [BL.serve(8940 + i, dists[b], 'br' if BL.brotli else 'gzip') for i, b in enumerate(builds)]
    args = types.SimpleNamespace(save_data=True, shape='server', limit=60, quiet=2, dwell=0)
    res, profs = [], {}
    try:
        for i, b in enumerate(builds):
            # one profile per build: a first visit, the long document put in its place and kept
            d = profs[b] = tempfile.mkdtemp(prefix='loadbench-long-')
            BL.one(p, srvs[i], 'http://127.0.0.1:%d/' % (8940 + i), 'local', 'idle', d, args)
            ctx = p.chromium.launch_persistent_context(d, headless=True, viewport={'width': 1300, 'height': 900})
            pg = ctx.pages[0]
            pg.goto('http://127.0.0.1:%d/' % (8940 + i))
            pg.wait_for_function('window.rikuy && window.rikuy.ready && document.getElementById("boot").hidden', timeout=60000)
            pg.evaluate('window.rikuy.ready')
            n = pg.evaluate(PUT_LONG, files)
            print('  long %s: %d pages kept' % (b, n), flush=True)
            ctx.close()
        for r in range(rounds):
            for i in order(r, len(builds)):
                x = BL.one(p, srvs[i], 'http://127.0.0.1:%d/' % (8940 + i), 'local', 'idle', profs[builds[i]], args)
                res.append({'part': 'long', 'build': builds[i], 't': x['t'], 'errors': x['errors']})
                if x['errors'] or x['failed']: failures.append((builds[i], 'long', x['errors'][:2], x['failed']))
                print('  long %s %d: %s' % (builds[i], r, json.dumps({k: x['t'].get(v) for k, v in marks})), flush=True)
    finally:
        for s in srvs: s.shutdown(); s.server_close()
        for d in profs.values(): shutil.rmtree(d, ignore_errors=True)
    table('long: the repeat visit of a 100 page document (ms from the start of the navigation)',
          [(name, {b: [x['t'].get(k) for x in res if x['build'] == b] for b in builds}) for name, k in marks], builds)
    return res


def part_pdf(p, builds, dists):
    rounds = ROUNDS or 4
    res = []
    prof = ARGS.get('pdfline', 'cable')
    srvs = [BL.serve(8950 + i, dists[b], 'br' if BL.brotli else 'gzip') for i, b in enumerate(builds)]
    for s in srvs: s.shaper.set(BL.PROFILES[prof])
    args = types.SimpleNamespace(save_data=False, shape='server', limit=420, quiet=2, dwell=0)
    try:
        for r in range(rounds):
            for i in order(r, len(builds)):
                d = tempfile.mkdtemp(prefix='loadbench-pdf-')
                try:
                    x = BL.one(p, srvs[i], 'http://127.0.0.1:%d/' % (8950 + i), prof, 'cold', d, args)
                finally:
                    shutil.rmtree(d, ignore_errors=True)
                t = x['t']
                res.append({'part': 'pdf', 'build': builds[i], 't': t, 'errors': x['errors'], 'bytes_press_pdf': x.get('bytes_press_pdf')})
                if x['errors'] or x['failed']: failures.append((builds[i], 'pdf', x['errors'][:2], x['failed']))
                print('  pdf %s %s %d: press %s, pdf %s, press to pdf %s, MB %.1f' % (builds[i], prof, r, t.get('press'), t.get('pdf'), t['pdf'] - t['press'] if 'pdf' in t and 'press' in t else None, (x.get('bytes_press_pdf') or 0) / 1e6), flush=True)
    finally:
        for s in srvs: s.shutdown(); s.server_close()
    table('pdf: a first visit, Preview pressed at once, %s line (ms)' % prof,
          [('press to first PDF page', {b: [x['t']['pdf'] - x['t']['press'] for x in res if x['build'] == b and 'pdf' in x['t'] and 'press' in x['t']] for b in builds}),
           ('first PDF page', {b: [x['t'].get('pdf') for x in res if x['build'] == b] for b in builds})], builds)
    return res


SCROLL = '''async () => { const sc = [...document.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 1000 && /auto|scroll/.test(getComputedStyle(e).overflowY));
  window.__sc = sc; sc.scrollTop = 0; window.__fr = []; window.__lt = []; window.__stop = false;
  let last = performance.now(); const tick = (t) => { window.__fr.push(t - last); last = t; if (!window.__stop) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  if (window.__po) window.__po.disconnect(); window.__po = new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(e.duration); }); window.__po.observe({ type: 'longtask' }); }'''


def part_scroll(p, builds, dists):
    rounds = ROUNDS or 4
    files = long_files()
    res = []
    for r in range(rounds):
        for i in order(r, len(builds)):
            os.environ['RIKUY_DIST'] = dists[builds[i]]
            b, page, errs = browser.open_page(p, width=1300, height=900)
            try:
                n = page.evaluate('''(files) => { const g = window.rikuy; g.files = new Map(Object.entries(files)); g.main = 'main.tex'; g.hist = []; g.redoStack = []; g.forceRender = true; g.rebuild(); return document.querySelectorAll('#pages .page').length; }''', files)
                page.wait_for_timeout(4000)  # (spelling and the rest the rebuild set going: done, as before a person scrolls)
                page.evaluate(SCROLL)
                page.mouse.move(650, 500)
                steps = 0
                while page.evaluate('() => window.__sc.scrollTop + window.__sc.clientHeight < window.__sc.scrollHeight - 2') and steps < 3000:
                    page.mouse.wheel(0, 400); steps += 1
                    page.wait_for_timeout(16)
                page.wait_for_timeout(300)
                fr, lt = page.evaluate('() => { window.__stop = true; return [window.__fr.slice(1), window.__lt]; }')
            finally:
                b.close()
            x = {'part': 'scroll', 'build': builds[i], 'pages': n, 'frames': len(fr), 'p95': stats(fr)[1], 'max': max(fr), 'over50': sum(1 for f in fr if f > 50),
                 'longtasks': len(lt), 'longest': max(lt) if lt else 0, 'errors': errs}
            res.append(x)
            if errs: failures.append((builds[i], 'scroll', errs[:2]))
            print('  scroll %s %d: %d pages, %d frames, p95 %.1f, max %.0f, over 50 ms %d, long tasks %d (longest %.0f)' % (builds[i], r, n, x['frames'], x['p95'], x['max'], x['over50'], x['longtasks'], x['longest']), flush=True)
    os.environ.pop('RIKUY_DIST', None)
    table('scroll: a 100 page document, top to bottom by the wheel',
          [(k, {b: [x[k] for x in res if x['build'] == b] for b in builds}) for k in ('over50', 'max', 'p95', 'longtasks', 'longest')], builds)
    return res


def main():
    builds = ['base', 'head']
    dists = {'base': built(ARGS.get('base', 'origin/main'), 'base'), 'head': built(ARGS.get('head', os.path.join(ROOT, 'dist')), 'head')}
    print('base %s\nhead %s\nparts %s' % (dists['base'], dists['head'], PARTS), flush=True)
    out = []
    with sync_playwright() as p:
        for part in PARTS:
            out += {'open': part_open, 'long': part_long, 'pdf': part_pdf, 'scroll': part_scroll}[part](p, builds, dists)
    json.dump({'dists': dists, 'runs': out}, open(OUT, 'w'))
    for f in failures: print('RESULT FAILED', f)
    n = len(out)
    print('\n%d runs, %d failed' % (n, len(failures)))
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
