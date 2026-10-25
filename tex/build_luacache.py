"""luaotfload's tables for the fonts a default LuaLaTeX document uses, made by the engine itself.

luaotfload converts each OpenType font to a Lua table on first use (a second or two each). Shipping
the tables for Latin Modern means a first LuaLaTeX compile does not pay for that. They are written
to $GALLEY_WORK/extra (the overlay build_tree.py lays over the tree).
Usage: build_luacache.py [dist dir]"""
import os, sys, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'test'))
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
os.environ['GALLEY_DIST'] = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('GALLEY_WORK', '/tmp/eng') + '/dist2'
import serve
from playwright.sync_api import sync_playwright
serve.start(8802)
DOC = r'''\documentclass{article}
\usepackage{amsmath}
\usepackage{unicode-math}
\begin{document}
\section{Title} Text \textbf{bold} \textit{italic} \textbf{\textit{bi}} \textsc{Caps} \textsl{slanted} \texttt{mono} \textsf{sans \textbf{bold}}
{\tiny a}{\scriptsize a}{\footnotesize a}{\small a}{\large a}{\Large a}{\LARGE a}{\huge a}
$x^{y^z} + \int f = \sum_i a_i$ \[ \mathbf{A}\mathbb{R}\mathcal{C} \]
\end{document}'''
C = '/texlive/texmf-dist/texmf-var/luatex-cache/generic/fonts/otl'
OUT = os.environ.get('GALLEY_WORK', '/tmp/eng') + '/extra' + C
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page()
    pg.goto('http://127.0.0.1:8802/tex-smoke.html')
    pg.wait_for_function('window.ready', timeout=180000)
    # 1. luaotfload's font name database, rebuilt for the fonts in this tree (BusyTeX's knows only its own)
    NAMES = '/texlive/texmf-dist/texmf-var/luatex-cache/generic/names'
    UPD = r"""\directlua{config.luaotfload.db.update_live = true; config.luaotfload.run.live = false; local n = fonts.names; local x = n.update(nil, true, false); n.save(x); local c = 0; for _ in pairs(x.mappings or {}) do c = c + 1 end; texio.write_nl('galley-names: ' .. c)}\relax\end"""
    pg.evaluate("""([d]) => exec({args: ['luahbtex', '--interaction=nonstopmode', '--nosocket', '--fmt', '/texlive/texmf-dist/texmf-var/web2c/luahbtex/luahblatex.fmt', 'upd.tex'],
        files: [{path: 'upd.tex', data: '\\\\documentclass{article}\\\\usepackage{fontspec}' + d}], list: ['%s'], read: ['upd.log']})""" % NAMES, [UPD])
    pg.wait_for_function('window.execResult || window.err', timeout=900000)
    r0 = pg.evaluate("window.execResult ? ({code: execResult.code, listed: execResult.listed, out: new TextDecoder().decode(execResult.files['upd.log'] || new Uint8Array()) + execResult.stdout}) : window.err")
    print('names update', r0.get('code'), r0.get('listed'), [l for l in r0.get('out', '').split('\n') if 'galley-names' in l or 'rror' in l][:5])
    nfiles = [n for n in (r0.get('listed') or {}).get(NAMES) or [] if n.startswith('luaotfload-names')]
    if nfiles:
        pg.evaluate("(names) => exec({args: ['kpsewhich', '--version'], read: names.map((n) => '%s/' + n)})" % NAMES, nfiles)
        pg.wait_for_function('window.execResult || window.err', timeout=600000)
        os.makedirs(os.environ.get('GALLEY_WORK', '/tmp/eng') + '/extra' + NAMES, exist_ok=True)
        for n in nfiles:
            data = bytes(pg.evaluate("(p) => Array.from(execResult.files[p])", NAMES + '/' + n))
            open(os.environ.get('GALLEY_WORK', '/tmp/eng') + '/extra' + NAMES + '/' + n, 'wb').write(data)
            print('  saved', n, len(data))
    # 2. the tables for Latin Modern
    pg.evaluate("""([d]) => exec({args: ['luahblatex', '--interaction=nonstopmode', '--nosocket', '--fmt', '/texlive/texmf-dist/texmf-var/web2c/luahbtex/luahblatex.fmt', 'main.tex'],
        files: [{path: 'main.tex', data: d}], list: ['%s']})""" % C, [DOC])
    pg.wait_for_function('window.execResult || window.err', timeout=600000)
    r = pg.evaluate("window.execResult ? ({code: execResult.code, listed: execResult.listed}) : window.err")
    names = [n for n in (r.get('listed') or {}).get(C) or [] if n.endswith('.luc')]
    print('lualatex', r.get('code'), len(names), 'tables')
    pg.evaluate("(names) => exec({args: ['kpsewhich', '--version'], read: names.map((n) => '%s/' + n)})" % C, names)
    pg.wait_for_function('window.execResult || window.err', timeout=600000)
    os.makedirs(OUT, exist_ok=True)
    total = 0
    for n in names:
        data = bytes(pg.evaluate("(p) => Array.from(execResult.files[p])", C + '/' + n))
        open(os.path.join(OUT, n), 'wb').write(data); total += len(data)
    print('wrote', total, 'bytes to', OUT, names)
    b.close()
