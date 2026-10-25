"""Where a corpus document's compile spends its time (PLAN task 6): every status the worker
reports (each TeX pass, each program, each tool fetched), with the time it came, the passes
TeX made and the programs its shell ran. Usage: profile.py DOC [LIMIT_S]   (DOC as corpus_full.py names it, le/...)
env: GALLEY_DIST, CORPUS_REPO, SDE"""
import json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'test'))
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
from corpus_full import project  # noqa: E402
import serve  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

doc = sys.argv[1]
limit = int(sys.argv[2]) if len(sys.argv) > 2 else 900
port = int(os.environ.get('PORT', '8831'))
serve.start(port)
files, main = project(doc)
with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page()
    sde = os.environ.get('SDE')
    pg.goto('http://127.0.0.1:%d/tex-smoke.html' % port + ('?sde=' + sde if sde else ''))
    pg.wait_for_function('window.ready', timeout=180000)
    pg.evaluate("() => { window.tl = []; w.addEventListener('message', (e) => { if (e.data.status) window.tl.push([performance.now(), e.data]); }); }")
    t0 = pg.evaluate('performance.now()')
    pg.evaluate("""([files, main]) => compile(files.map(f => f.b64 ? { path: f.path, data: Uint8Array.from(atob(f.b64), c => c.charCodeAt(0)) } : f), main, true, 'prof')""", [files, main])
    try:
        pg.wait_for_function('window.result || window.err', timeout=limit * 1000, polling=500)
        r = pg.evaluate("window.result ? ({ok: result.ok, ms: result.ms, passes: result.passes, engine: result.engine, runs: result.runs.map(x => [x.cmd, x.code]), shell: (result.shell || []).slice(0, 40).map(x => [x.cmd, x.code, (x.err || '').slice(-300)])}) : ({error: String(window.err.error)})")
    except Exception as e:
        r = {'timeout': limit}
    tl = pg.evaluate('window.tl')
    last = t0
    for t, s in tl:
        s = dict(s); name = s.pop('status')
        print('%8.1f s  (+%6.1f)  %s %s' % ((t - t0) / 1000, (t - last) / 1000, name, json.dumps(s) if s else ''))
        last = t
    for x in r.pop('shell', []) or []:
        print('shell:', x[0], x[1], x[2].replace('\n', ' | ')[:300])
    print(json.dumps(r))
    b.close()
