"""The LaTeX formats, made by Galley's own engines from the tree they will read.

A format is LaTeX's kernel and the hyphenation patterns preloaded; it has to come from the same
engine binary and the same latex.ltx the documents then use. This runs the three ini runs of TeX
Live's fmtutil.cnf (pdflatex, xelatex, lualatex, with every language of language.dat) in the
worker, in Chromium, and saves the formats where build_tree.py takes them from:
$GALLEY_WORK/pdflatex-all.fmt and $GALLEY_WORK/fmt/{xelatex,luahblatex}.fmt.
Usage: build_formats.py DIST   (a dist/ built from the tree whose kernel the formats are for)
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'test'))
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
WORK = os.environ.get('GALLEY_WORK', '/tmp/eng')
os.environ['GALLEY_DIST'] = sys.argv[1]
import serve
from playwright.sync_api import sync_playwright

PORT = int(os.environ.get('PORT', '8803'))
serve.start(PORT)
RUNS = [  # fmtutil.cnf's lines for the three formats Galley uses
    ('pdflatex', ['pdftex', '-ini', '-jobname=pdflatex', '-progname=pdflatex', '-translate-file=cp227.tcx', '*pdflatex.ini'], 'pdflatex-all.fmt'),
    ('xelatex', ['xetex', '-ini', '-jobname=xelatex', '-progname=xelatex', '-etex', 'xelatex.ini'], 'fmt/xelatex.fmt'),
    ('luahblatex', ['luahbtex', '-ini', '-jobname=luahblatex', '-progname=luahblatex', 'lualatex.ini'], 'fmt/luahblatex.fmt'),
]
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for job, args, dest in RUNS:
        pg = b.new_page()  # a fresh engine for each: an ini run leaves TeX's memory as it ended
        pg.goto('http://127.0.0.1:%d/tex-smoke.html' % PORT)
        pg.wait_for_function('window.ready', timeout=180000)
        pg.evaluate("([args, job]) => exec({args, files: [], read: [job + '.fmt', job + '.log']})", [args, job])
        pg.wait_for_function('window.execResult || window.err', timeout=1200000)
        r = pg.evaluate("window.execResult ? ({code: execResult.code, names: Object.keys(execResult.files)}) : ({err: String(window.err && window.err.error)})")
        log = bytes(pg.evaluate("(n) => Array.from(execResult.files[n] || [])", job + '.log')).decode('latin-1') if r.get('names') else ''
        tail = [l for l in log.split('\n') if l.strip()][-6:]
        if job + '.fmt' not in (r.get('names') or []):
            print(job, 'FAILED', r, '\n  ' + '\n  '.join(tail))
            sys.exit(1)
        b64 = pg.evaluate("(n) => { const u = execResult.files[n]; let s = ''; for (let k = 0; k < u.length; k += 0x8000) s += String.fromCharCode.apply(null, u.subarray(k, k + 0x8000)); return btoa(s); }", job + '.fmt')
        import base64
        data = base64.b64decode(b64)
        out = os.path.join(WORK, dest)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        open(out, 'wb').write(data)
        hyph = [l for l in log.split('\n') if 'hyphenation' in l.lower() and 'patterns' in l.lower()][:1]
        print(job, r['code'], len(data), 'bytes ->', out, '|', ' '.join(tail[-2:])[:200])
        pg.close()
    b.close()
