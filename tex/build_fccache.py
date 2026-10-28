"""fontconfig caches for the fonts in Rikuy's tree, made by the engine itself in Chromium.

XeTeX asks fontconfig for fonts by name; without caches fontconfig reads every font file in the
tree once per session (about 100 MB of packs). This runs one XeLaTeX job that makes fontconfig
scan and write its caches, and saves them to $RIKUY_WORK/fccache for build_tree.py.
Usage: build_fccache.py [DIST]   (a dist/ built from the tree the caches are for, as build_all.sh
       passes it; without one, $RIKUY_DIST, else the repository's dist/)
"""
import os, sys, json, hashlib
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'test'))
if os.path.isdir('/opt/pw-browsers'): os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
WORK = os.environ.get('RIKUY_WORK', '/tmp/eng')
if len(sys.argv) > 1: os.environ['RIKUY_DIST'] = sys.argv[1]  # else serve.py's own default
import serve
from playwright.sync_api import sync_playwright
serve.start(8798)
DOC = r'''\documentclass{article}
\usepackage{fontspec}
\setmainfont{TeX Gyre Termes}
\begin{document}
fontconfig
\end{document}'''
OUT = os.path.join(WORK, 'fccache')
CACHE = '/texlive/fontconfig-cache'
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page()
    pg.goto('http://127.0.0.1:8798/tex-smoke.html')
    pg.wait_for_function('window.ready', timeout=180000)
    pg.evaluate("""([d]) => exec({args: ['xelatex', '--interaction=nonstopmode', '-no-pdf', '--fmt', '/texlive/texmf-dist/texmf-var/web2c/xetex/xelatex.fmt', 'main.tex'],
        files: [{path: 'main.tex', data: d}], read: ['main.log'], fcdump: true})""", [DOC])
    pg.wait_for_function('window.execResult || window.err', timeout=900000)
    r = pg.evaluate("window.execResult ? ({code: execResult.code, stderr: execResult.stderr.slice(-800), dirs: Object.keys(execResult.fc)}) : window.err")
    print('xelatex', r.get('code'), r.get('stderr', '')[-300:])
    dirs = r.get('dirs') or []
    print('cache blocks', len(dirs))
    if os.path.isdir(OUT):
        for n in os.listdir(OUT): os.unlink(os.path.join(OUT, n))
    os.makedirs(OUT, exist_ok=True)
    total = 0
    for d in dirs:
        data = bytes(pg.evaluate("(d) => Array.from(execResult.fc[d])", d))
        name = hashlib.md5(d.encode()).hexdigest() + '-le32d8.cache-8'
        open(os.path.join(OUT, name), 'wb').write(data)
        total += len(data)
    print('wrote', len(dirs), 'caches,', total, 'bytes to', OUT)
    b.close()
