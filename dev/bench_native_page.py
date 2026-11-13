"""A keystroke in the page with the native core and without it (src/native.js; app.core.use), on
dev/bench/long and a generated 3000 paragraph document (dev/bench_native.mjs's): the time of the
whole commit (model, render, layout, caret, the source pane), of the rebuild, and of the model
alone (the rebuild less render, layout and caret), medians over N keystrokes typed in rounds
that alternate the two, so a slow stretch of a shared machine falls on both. A phone's CPU:
--cpu 4 or 6 (Chromium's CPU throttling) and --width 390; it also says how long the core takes
from its bytes to running (compile and instantiate) at that speed.
Usage: python3 dev/bench_native_page.py [-n 40] [--cpu 1] [--width 1400] [--json out.json]
(needs a built dist/)"""
import json, os, subprocess, statistics, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'test'))
from browser import open_page, load_doc  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
N = int(sys.argv[sys.argv.index('-n') + 1]) if '-n' in sys.argv else 40
OUT = sys.argv[sys.argv.index('--json') + 1] if '--json' in sys.argv else None
CPU = float(sys.argv[sys.argv.index('--cpu') + 1]) if '--cpu' in sys.argv else 1
WIDTH = int(sys.argv[sys.argv.index('--width') + 1]) if '--width' in sys.argv else 1400
CORE = 'core/' + [f for f in os.listdir(os.path.join(os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist'), 'core'))][0]
long_doc = {'main.tex': open(os.path.join(ROOT, 'dev/bench/long/main.tex')).read(), 'refs.bib': open(os.path.join(ROOT, 'dev/bench/long/refs.bib')).read()}
generated = subprocess.run(['node', '--input-type=module', '-e', '''
let s = 7; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; const pick = (a) => a[Math.floor(rnd() * a.length)];
const words = 'the model of capital and trade is identified from a shock to demand when commitment absent regulator estimator regions price index transition coalition voter persistence baseline sample'.split(' ');
const out = ['\\\\documentclass[11pt]{article}', '\\\\usepackage{amsmath,amssymb}', '\\\\newcommand{\\\\E}[1]{\\\\mathbb{E}\\\\left[#1\\\\right]}', '\\\\begin{document}', ''];
for (let p = 0; p < 3000; p++) { if (p % 60 === 0) out.push('\\\\section{Part ' + (p / 60 + 1) + '}\\\\label{sec:' + p + '}', '');
  const w = []; for (let k = 0, n = 12 + Math.floor(rnd() * 8); k < n; k++) { const r = rnd(); w.push(r < 0.04 ? '$x_{' + k + '} = \\\\alpha$' : r < 0.06 ? '\\\\textbf{' + pick(words) + '}' : r < 0.08 ? '\\\\emph{' + pick(words) + '}' : r < 0.1 ? 'Section~\\\\ref{sec:0}' : pick(words)); }
  out.push(w.join(' ') + '.'); if (p % 25 === 12) out.push('', '\\\\begin{equation}', '  y_t = \\\\E{x_t} + \\\\varepsilon_t', '\\\\end{equation}'); out.push(''); }
out.push('\\\\end{document}', ''); process.stdout.write(out.join('\\n'));'''], capture_output=True, text=True).stdout

WRAP = r'''() => {
  const g = window.rikuy; const T = window.__T = { commit: [], rebuild: [], sync: [], layout: [], caret: [] };
  const wrap = (obj, name, key) => { const f = obj[name].bind(obj); obj[name] = function (...a) { const t = performance.now(); try { return f(...a); } finally { T[key].push(performance.now() - t); } }; };
  wrap(g, 'commit', 'commit'); wrap(g, 'rebuild', 'rebuild'); wrap(g.renderer, 'sync', 'sync'); wrap(g, 'layoutPass', 'layout'); wrap(g, 'restoreCaret', 'caret');
}'''

rows = []
with sync_playwright() as p:
    browser, page, errors = open_page(p, width=WIDTH, height=844 if WIDTH < 600 else 1000)
    cdp = page.context.new_cdp_session(page)
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': CPU})
    page.evaluate('() => window.rikuy.core.load()')
    # the core from its bytes to running, at this CPU's speed (a fresh instance; median of 5)
    ready = page.evaluate('''async (f) => { const b = await (await fetch(f)).arrayBuffer(); const t = [];
      for (let k = 0; k < 5; k++) { const a = performance.now(); const { instance } = await WebAssembly.instantiate(b, { env: { emscripten_notify_memory_growth() {} } }); instance.exports._initialize(); t.push(performance.now() - a); }
      return t.sort((x, y) => x - y)[2]; }''', CORE)
    print(json.dumps({'cpu': CPU, 'width': WIDTH, 'core bytes to running ms': round(ready, 2)}))
    page.evaluate(WRAP)
    for name, files in [('long', long_doc), ('generated', {'main.tex': generated})]:
        load_doc(page, files)
        page.wait_for_timeout(1000)
        page.evaluate('''() => { const sp = [...document.querySelectorAll('#pages span.t')]; const s = sp[Math.floor(sp.length / 2)];
          const r = document.createRange(); r.setStart(s.firstChild, Math.min(3, s.firstChild.length)); r.collapse(true);
          document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); s.scrollIntoView(); }''')
        res = {0: {'commit': [], 'rebuild': [], 'model': []}, 1: {'commit': [], 'rebuild': [], 'model': []}}
        for k in range(N + 6):
            for on in ((1, 0) if k % 2 else (0, 1)):
                page.evaluate('(on) => { window.rikuy.core.use(!!on); for (const v of Object.values(window.__T)) v.length = 0; }', on)
                page.keyboard.type('x')
                page.wait_for_timeout(40)
                T = page.evaluate('() => window.__T')
                if k < 6 or not T['commit']:
                    continue
                res[on]['commit'].append(T['commit'][-1])
                res[on]['rebuild'].append(T['rebuild'][-1])
                res[on]['model'].append(T['rebuild'][-1] - sum(T['sync'][-1:]) - sum(T['layout'][-1:]) - sum(T['caret'][-1:]))
        page.evaluate('() => window.rikuy.core.use(true)')
        med = lambda v: round(statistics.median(v), 2)
        row = {'doc': name, 'cpu': CPU, 'width': WIDTH, 'n': len(res[1]['commit'])}
        for k in ('commit', 'rebuild', 'model'):
            row[k] = {'js': med(res[0][k]), 'core': med(res[1][k]), 'x': round(med(res[0][k]) / med(res[1][k]), 2)}
        rows.append(row)
        print(json.dumps(row))
    print('errors', errors[:3])
    browser.close()
if OUT:
    json.dump({'n': N, 'cpu': CPU, 'width': WIDTH, 'core_ready_ms': ready, 'rows': rows}, open(OUT, 'w'), indent=1)
