"""Compile every LaTeX-examples document with its whole project folder (the way a user opens it),
through the real worker in Chromium. Usage: corpus_full.py OUT.jsonl [engine-mode] [filter]"""
import os, sys, json, time, base64
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'test'))
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
import serve
from playwright.sync_api import sync_playwright
PORT = int(os.environ.get('PORT', '8794'))
serve.start(PORT)
REPO = os.environ.get('CORPUS_REPO', '/tmp/eng/le-full/repo')  # a clone of https://github.com/MartinThoma/LaTeX-examples
OLD = [json.loads(l)['doc'] for l in open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'corpus-docs.jsonl'))]
OUT = sys.argv[1]
FILT = sys.argv[2] if len(sys.argv) > 2 else ''
TEXT = {'tex', 'sty', 'cls', 'bib', 'bst', 'def', 'cfg', 'clo', 'txt', 'dat', 'csv', 'tikz', 'java', 'c', 'py', 'pgf', 'table',
        'data', 'gnuplot', 'gp', 'asy', 'mp', 'lua', 'cpp', 'h', 'js', 'html', 'xml', 'sh', 'hs', 'pl', 'scala', 'go', 'rb', 'm', 'r', 'sql', 'ldf', 'fd', 'bbx', 'cbx', 'lbx', 'dbx', 'ist', 'tsv', 'input', 'pgf-plot', 'pygtex', 'listing'}
BIN = {'png', 'jpg', 'jpeg', 'pdf', 'eps', 'ps', 'mps', 'gif', 'svg', 'ttf', 'otf'}
def project(doc):
    rel = doc[3:]  # strip 'le/'
    parts = rel.split('/')
    root = os.path.join(REPO, *parts[:2]) if len(parts) > 2 else os.path.join(REPO, parts[0])
    main = os.path.relpath(os.path.join(REPO, rel), root)
    files, total = [], 0
    for dp, dn, fn in os.walk(root):
        dn[:] = [d for d in dn if not d.startswith('.')]
        for n in sorted(fn):
            q = os.path.join(dp, n)
            ext = n.rsplit('.', 1)[-1].lower() if '.' in n else ''
            sz = os.path.getsize(q)
            if sz > 4_000_000 or total > 40_000_000: continue
            p = os.path.relpath(q, root)
            if ext in TEXT or (ext == '' and sz < 200_000):
                files.append({'path': p, 'data': open(q, encoding='utf8', errors='replace').read()}); total += sz
            elif ext in BIN:
                if ext == 'pdf' and os.path.exists(q[:-4] + '.tex') and q[:-4] + '.tex' == os.path.join(REPO, rel): continue  # its own output
                files.append({'path': p, 'b64': base64.b64encode(open(q, 'rb').read()).decode()}); total += sz
    return files, main
out = open(OUT, 'w')
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page()
    pg.goto('http://127.0.0.1:%d/tex-smoke.html' % PORT)
    pg.wait_for_function('window.ready', timeout=180000)
    t0 = time.time()
    for i, doc in enumerate(OLD):
        if FILT and FILT not in doc: continue
        if i < int(os.environ.get('START', '0')): continue
        if not os.path.exists(os.path.join(REPO, doc[3:])):
            out.write(json.dumps({'doc': doc, 'ok': None, 'error': 'gone'}) + '\n'); continue
        files, main = project(doc)
        try:
            pg.evaluate("""([files, main, id]) => compile(files.map(f => f.b64 ? { path: f.path, data: Uint8Array.from(atob(f.b64), c => c.charCodeAt(0)) } : f), main, true, 'c' + id)""", [files, main, i])
            pg.wait_for_function('window.result || window.err', timeout=240000, polling=200)
            r = pg.evaluate("window.result ? ({ok: result.ok, ms: result.ms, passes: result.passes, net: result.net, log: result.log, engine: result.engine, runs: result.runs.map(x => [x.cmd, x.code, (x.log||'').slice(-600)])}) : ({error: window.err.error})")
        except Exception as e:
            r = {'error': 'harness ' + str(e)[:200]}
            try:  # a crashed page cannot reload: start a new one
                pg.close()
            except Exception: pass
            try:
                pg = b.new_page(); pg.goto('http://127.0.0.1:%d/tex-smoke.html' % PORT); pg.wait_for_function('window.ready', timeout=180000)
            except Exception as e2: print('reopen failed', e2, flush=True)
        log = r.get('log') or ''
        lines = log.split('\n')
        errs = [l for l in lines if l.startswith('!') or ': LaTeX Error' in l or ':' in l[:80] and ' Error:' in l][:4]
        miss = [l for l in lines if 'not found' in l and ('File' in l or 'file' in l)][:3]
        out.write(json.dumps({'doc': doc, 'main': main, 'nfiles': len(files), 'ok': r.get('ok'), 'ms': r.get('ms'), 'passes': r.get('passes'), 'net': r.get('net'),
                              'engine': r.get('engine'), 'errs': errs, 'miss': miss, 'error': r.get('error'), 'runs': r.get('runs'), 'tail': log[-1500:] if not r.get('ok') else ''}) + '\n'); out.flush()
        if i % 50 == 0: print(i, doc, r.get('ok'), r.get('ms'), round(time.time() - t0), flush=True)
    b.close()
print('done', flush=True)
