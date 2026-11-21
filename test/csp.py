"""The hosted page's Content-Security-Policy over a whole session, with nothing refused. The page
runs under the policy dist/_headers gives it (build/app.mjs policy: the page's one inline script by
its hash, its own files, WebAssembly, no eval, no inline script or handler of anything else), as
serve.py serves it, with every refusal reported to the server (report-uri): the page's, a live
figure's and each worker's, which takes its policy from its own script. The session: open the page
and type; the source pane (CodeMirror), the math field (MathLive), the Git panel (git.js);
compile with pdfLaTeX, XeLaTeX and LuaLaTeX and see the PDF pane (pdf.js); an Asymptote figure,
minted (Pyodide) and biber; save as Word and open that file again (pandoc); spelling (Hunspell)
and grammar (Harper); a live figure. Then no report, no refusal in the page's own console, and the
features each answered. And where a browser refuses WebAssembly under the policy (Safari 15 knows
no 'wasm-unsafe-eval'; stood in for by the policy without it), the PDF pane says so plainly.
Needs dist/tex and dist/word (npm run build after the TeX tree)."""
import os, sys, json, time, tempfile, traceback
sys.path.insert(0, os.path.dirname(__file__))
import serve
from browser import ROUTES, ROOT, check, results, SHOTS
from playwright.sync_api import sync_playwright

PORT = 8783
SRV = serve.start(PORT, report=True)
URL = 'http://127.0.0.1:%d/' % PORT
TMP = tempfile.mkdtemp(prefix='rikuy-csp-')
SAMPLE = os.path.join(ROOT, 'sample', 'widget')
read = lambda n, m='r': open(os.path.join(SAMPLE, n), m, **({} if 'b' in m else {'encoding': 'utf8'})).read()


def wait_pdf(page, timeout=240):
    t = time.time()
    page.wait_for_timeout(1600)
    while time.time() - t < timeout:
        if not page.evaluate('() => window.rikuy.compiling || !!window.rikuy.compileAgain'):
            break
        page.wait_for_timeout(500)
    return page.evaluate("() => document.getElementById('pdf-status').textContent")


def open_doc(page, files, main=None):
    page.evaluate('async ([files, main]) => { await window.rikuy.openFiles(files.map(([n, t]) => new File([t], n))); if (main) window.rikuy.main = main; }', [files, main])
    page.wait_for_timeout(500)


def refused(page):
    """What the page and its frames saw refused (securitypolicyviolation, added by init script)."""
    out = []
    for f in page.frames:
        try:
            out += f.evaluate('() => window.__csp || []')
        except Exception:
            pass
    return out


VIOLATIONS = """window.__csp = []; addEventListener('securitypolicyviolation', (e) => window.__csp.push(
  [e.effectiveDirective, e.blockedURI, (e.sourceFile || '') + ':' + e.lineNumber, (e.sample || '').slice(0, 80)].join(' ')), true);"""

try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 1500, 'height': 950}, accept_downloads=True, device_scale_factor=1)
        ctx.add_init_script(VIOLATIONS)
        page = ctx.new_page()
        console = []
        page.on('console', lambda m: console.append(m.type + ' ' + m.text) if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: console.append('PAGEERROR ' + str(e)))
        page.on('worker', lambda w: w.on('console', lambda m: console.append('worker ' + w.url.rsplit('/', 1)[-1] + ' ' + m.type + ' ' + m.text) if m.type == 'error' else None))

        def route(r):
            u = r.request.url
            if u in ROUTES:
                return r.fulfill(status=200, content_type='text/javascript', body=open(ROUTES[u], 'rb').read(), headers={'Access-Control-Allow-Origin': '*'})
            if u.startswith('http://127.0.0.1:%d/' % PORT):
                return r.continue_()
            return r.abort()
        ctx.route('**/*', route)
        page.goto(URL)
        page.evaluate('() => localStorage.clear()')
        page.reload()
        page.wait_for_function('() => window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=30000)
        pol = page.evaluate("async () => (await fetch(location.href)).headers.get('content-security-policy')")
        check('the page runs under the hosted policy: its script by hash, WebAssembly, no unsafe-inline or unsafe-eval',
              "'sha256-" in pol and "'wasm-unsafe-eval'" in pol and "'unsafe-inline'" not in pol.split('script-src')[1].split(';')[0] and "'unsafe-eval'" not in pol, pol)

        # typing on the page, the source pane, the math field, the Git panel
        # (a paragraph of words: the opening document's second block is its graph's, a frame)
        page.click('.page .it.p:has-text("Click anywhere in this paragraph")')
        page.keyboard.type('Typed under the policy. ')
        page.wait_for_timeout(800)
        check('typing on the page reaches the source', 'Typed under the policy.' in page.evaluate("() => window.rikuy.files.get('main.tex')"))
        page.click('#b-src'); page.wait_for_timeout(800)
        check('the source pane opens (CodeMirror)', page.evaluate('() => !!document.querySelector(".CodeMirror") && !!window.CodeMirror'))
        page.click('#b-src'); page.wait_for_timeout(300)
        page.evaluate("() => document.querySelectorAll('.it.dm')[0].scrollIntoView({block:'center'})")
        page.click('.it.dm >> nth=0')
        page.wait_for_selector('#pop-field', timeout=10000)
        check('the math field opens on an equation (MathLive)', bool(page.evaluate("() => document.getElementById('pop-field').getValue('latex')")))
        page.keyboard.press('Escape'); page.wait_for_timeout(300)
        page.evaluate('() => window.rikuy.loadGit()')
        check('git.js loads', page.evaluate('async () => !!(await window.rikuy.loadGit())'))

        # the three engines and the PDF pane
        page.click('#b-pdf')
        st = wait_pdf(page)
        check('pdfLaTeX compiles the sample', 'pdfLaTeX' in st and 'page' in st, st)
        n = page.evaluate('async () => { for (let i = 0; i < 60 && !(window.rikuy.pdfView && window.rikuy.pdfView.doc); i++) await new Promise((r) => setTimeout(r, 250)); return window.rikuy.pdfView && window.rikuy.pdfView.doc ? window.rikuy.pdfView.doc.numPages : 0; }')
        check('the PDF pane shows it (pdf.js)', n >= 1, n)
        page.select_option('#pdf-engine', 'xelatex')
        st = wait_pdf(page)
        check('XeLaTeX compiles it', st.startswith('XeLaTeX') and 'page' in st, st)
        page.select_option('#pdf-engine', 'lualatex')
        st = wait_pdf(page)
        check('LuaLaTeX compiles it', st.startswith('LuaLaTeX') and 'page' in st, st)
        page.select_option('#pdf-engine', 'auto')
        wait_pdf(page)
        open_doc(page, [['asy.tex', '\\documentclass{article}\n\\usepackage{asymptote}\n\\begin{document}\n\\begin{asy}\nimport graph;\nsize(5cm,3cm,IgnoreAspect);\n'
                         'draw(graph(new real(real x) {return x^2;},0,2),blue);\nxaxis("$x$",BottomTop,LeftTicks);\nyaxis("$y$",LeftRight,RightTicks);\n\\end{asy}\n\\end{document}\n']])
        st = wait_pdf(page, 300)
        probs = page.evaluate('() => window.rikuy.texIssues.filter((x) => x.sev === "error").map((x) => x.msg)')
        check('an Asymptote figure compiles (asy)', 'page' in st and not probs, (st, probs[:3]))
        open_doc(page, [['code.tex', '\\documentclass{article}\n\\usepackage{minted}\n\\begin{document}\n\\begin{minted}{python}\ndef f(x):\n    return x * 2\n\\end{minted}\n\\end{document}\n']])
        st = wait_pdf(page, 300)
        probs = page.evaluate('() => window.rikuy.texIssues.filter((x) => x.sev === "error").map((x) => x.msg)')
        check('minted compiles (Pygments in Pyodide)', 'page' in st and not probs, (st, probs[:3]))
        open_doc(page, [['bl.tex', '\\documentclass{article}\n\\usepackage[backend=biber]{biblatex}\n\\addbibresource{r.bib}\n\\begin{document}\n\\cite{k}\n\\printbibliography\n\\end{document}\n'],
                        ['r.bib', '@book{k, author={Knuth, Donald}, title={The TeXbook}, year={1984}, publisher={Addison-Wesley}}\n']], 'bl.tex')
        st = wait_pdf(page, 300)
        pdf_text = page.evaluate('async () => { const d = window.rikuy.pdfView && window.rikuy.pdfView.doc; if (!d) return ""; const pg = await d.getPage(1); return (await pg.getTextContent()).items.map((i) => i.str).join(" "); }')
        check('biblatex with biber compiles, its reference printed', 'page' in st and 'TeXbook' in pdf_text, (st, pdf_text[:200]))

        # Word: save, then open the saved file again
        page.evaluate("() => { const g = window.rikuy; g.files = new Map([['main.tex', '\\\\documentclass{article}\\n\\\\begin{document}\\nWord under the policy, $x^2$.\\n\\\\end{document}\\n']]); g.main = 'main.tex'; g.rebuild(); }")
        page.wait_for_timeout(400)
        out = os.path.join(TMP, 'csp.docx')
        with page.expect_download(timeout=180000) as d:
            page.evaluate('() => window.rikuy.saveDocx()')
        d.value.save_as(out)
        page.wait_for_function('() => !window.rikuy.wordBusy', timeout=120000)
        check('saved as Word (pandoc)', os.path.getsize(out) > 2000, os.path.getsize(out))
        page.set_input_files('#fileinput', out)
        page.wait_for_timeout(500)
        page.wait_for_function('() => !window.rikuy.wordBusy', timeout=120000)
        page.wait_for_timeout(500)
        check('and opened again from Word', 'Word under the policy' in (page.evaluate("() => window.rikuy.files.get(window.rikuy.main)") or ''), page.evaluate("() => window.rikuy.main"))

        # spelling and grammar
        page.evaluate("() => { const g = window.rikuy; g.files = new Map([['main.tex', '\\\\documentclass{article}\\n\\\\begin{document}\\nThis sentense has a mistaek. He go home and it is is clear.\\n\\\\end{document}\\n']]); g.main = 'main.tex'; g.rebuild(); }")
        page.wait_for_function("() => window.rikuy.sp && window.rikuy.sp.bad && window.rikuy.sp.bad.length >= 2", timeout=30000)
        check('spelling marks the misspelt words (Hunspell)', sorted(set(page.evaluate('() => window.rikuy.sp.bad.map((x) => x.w)'))) >= ['mistaek', 'sentense'], page.evaluate('() => window.rikuy.sp.bad.map((x) => x.w)'))
        page.evaluate("() => window.rikuy.runCommand('grammar-as-you-type')")
        page.wait_for_function("() => window.rikuy.gr && window.rikuy.gr.lastRun && window.rikuy.gr.seq", timeout=60000)
        page.wait_for_timeout(1500)
        g = page.evaluate("() => [...(CSS.highlights.get('rk-grammar') || [])].map((r) => r.toString())")
        check('grammar marks its issues (Harper)', 'is is' in g, g)

        # a live figure, from one's own project (so it runs at once)
        page.evaluate("""([m, s, c, png]) => { const g = window.rikuy; g.files = new Map([['main.tex', m], ['rikuy.sty', s], ['widgets/clt.html', c]]);
          g.binFiles = g.binFiles || new Map(); g.binFiles.set('figures/clt.png', Uint8Array.from(atob(png), (ch) => ch.charCodeAt(0))); g.main = 'main.tex'; g.rebuild(); }""",
                      [read('main.tex'), read('rikuy.sty'), read('widgets/clt.html'), __import__('base64').b64encode(read('figures/clt.png', 'rb')).decode()])
        ok = True
        try:
            page.wait_for_function('() => window.rikuy.widgets && window.rikuy.widgets.frames.size >= 1 && [...window.rikuy.widgets.frames.values()].every((F) => window.rikuy.widgets.heights.has(F.key))', timeout=20000)
        except Exception:
            ok = False
        check('a live figure runs and sizes its frame', ok, page.evaluate('() => window.rikuy.widgets ? [window.rikuy.widgets.frames.size, [...window.rikuy.widgets.heights]] : null'))
        page.wait_for_timeout(1500)
        page.screenshot(path=os.path.join(SHOTS, 'csp-session.png'))

        # interactive graphs (task 70): one inserted from a template (its preview in the dialog, its
        # frame on the page, its PGF picture), Graph this on an equation, the web page with live
        # graphs exported (KaTeX, the fonts read from the page's own files)
        page.evaluate("() => { const g = window.rikuy; g.files = new Map([['main.tex', '\\\\documentclass{article}\\n\\\\begin{document}\\nGraphs under the policy.\\n\\\\[ y = A k^{\\\\alpha} \\\\]\\n\\\\end{document}\\n']]); g.main = 'main.tex'; g.hist = []; g.rebuild(); }")
        page.wait_for_timeout(800)
        page.locator('#pages .it').first.click(); page.wait_for_timeout(200)
        page.evaluate('() => window.rikuy.runCommand("insert-interactive-graph", { template: "supply-demand" })')
        page.wait_for_selector('#gd-ok'); page.wait_for_timeout(1500)
        page.click('#gd-ok'); page.wait_for_function('() => !document.getElementById("gd-ok")', timeout=20000)
        page.wait_for_function('() => window.rikuy.widgets && window.rikuy.widgets.frames.size >= 1 && [...window.rikuy.widgets.frames.values()].every((F) => window.rikuy.widgets.heights.has(F.key))', timeout=20000)
        page.evaluate('() => window.rikuy.graphRefresh()'); page.wait_for_timeout(500)
        check('an interactive graph runs under the policy and its PGF picture is drawn', page.evaluate('() => [...window.rikuy.assetBlobs.keys()].some((k) => /\\.pgf$/.test(k))'))
        # (the first graph's hint, "Got it", out of the way of the equation under it)
        if page.locator('.w-hint button').count(): page.locator('.w-hint button').click(); page.wait_for_timeout(200)
        eq = page.evaluate_handle("() => [...document.querySelectorAll('#pages [data-a], #pages [data-m]')].find((el) => { const T = window.rikuy.eqInfo(el); return T && T.display; })")
        eq.as_element().click(button='right')
        page.get_by_role('menuitem', name='Graph this').click(); page.wait_for_timeout(2500)
        check('Graph this under the policy', page.evaluate("() => window.rikuy.files.get('main.tex').split('\\\\rikuywidget').length - 1") == 2, page.evaluate("() => window.rikuy.files.get('main.tex')"))
        page.evaluate('() => window.rikuy.runCommand("export-web-page", { link: true })')
        page.wait_for_function('() => window.rikuy.lastExport && /\\.html$/.test(window.rikuy.lastExport.name)', timeout=60000)
        web = page.evaluate('() => window.rikuy.lastExport.blob.text()')
        check('the web page with live graphs is made under the policy: its frames, KaTeX, the fonts inside', web.count('<iframe class="rk-graph"') == 2 and 'class="katex"' in web and 'Paper Modern Serif' in web and 'url(data:font/woff2' in web, len(web))

        time.sleep(1.5)
        reports = [json.loads(r).get('csp-report', r) if r.startswith('{') else r for r in SRV.reports]
        check('no refusal reported by the page, a frame or a worker over the whole session', not reports,
              [(x.get('document-uri'), x.get('effective-directive'), x.get('blocked-uri'), x.get('source-file'), x.get('line-number'), x.get('script-sample')) if isinstance(x, dict) else x for x in reports][:6])
        seen = refused(page)
        check('none seen by the page or its frames (securitypolicyviolation)', not seen, seen[:6])
        csp_console = [c for c in console if 'Content Security Policy' in c or 'Refused to' in c or 'EvalError' in c or 'CompileError' in c]
        check('the console has no refusal, EvalError or WebAssembly CompileError', not csp_console, csp_console[:6])
        # and the check itself sees a refusal: a string given to setTimeout in the page and a
        # Function made in a worker started from it are refused, and both are reported (a blob:
        # worker's report names its document as "blob" alone)
        n0 = len(SRV.reports)
        page.evaluate("""() => { setTimeout('window.__evaled = 1', 0);
          new Worker(URL.createObjectURL(new Blob(["try { new Function('return 1')(); postMessage('ran') } catch (e) { postMessage('refused') }"], { type: 'text/javascript' }))); }""")
        page.wait_for_timeout(2500)
        got = [json.loads(r).get('csp-report', {}) for r in SRV.reports[n0:] if r.startswith('{')]
        check('the check sees what the policy refuses: eval in the page and in a worker, reported', not page.evaluate('() => window.__evaled')
              and any(x.get('document-uri', '').startswith('blob') for x in got) and any(x.get('document-uri', '').startswith(URL) for x in got), [(x.get('document-uri'), x.get('effective-directive')) for x in got])
        b.close()

        # (review L2) a browser that refuses WebAssembly under the policy (Safari 15 knows no
        # 'wasm-unsafe-eval'): stood in for here by the policy without it; TeX cannot start, and
        # the PDF pane says why in plain words
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 1500, 'height': 950})
        def nowasm(r):
            u = r.request.url
            if u in ROUTES:
                return r.fulfill(status=200, content_type='text/javascript', body=open(ROUTES[u], 'rb').read(), headers={'Access-Control-Allow-Origin': '*'})
            if not u.startswith(URL):
                return r.abort()
            res = r.fetch()
            h = dict(res.headers)
            for k in list(h):
                if k.lower() == 'content-security-policy': h[k] = h[k].replace(" 'wasm-unsafe-eval'", '')
            r.fulfill(response=res, headers=h)
        ctx.route('**/*', nowasm)
        page = ctx.new_page()
        page.goto(URL)
        page.wait_for_function('() => window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=30000)
        page.click('#b-pdf')
        page.wait_for_function('() => /could not run/.test(document.getElementById("pdf-status").textContent)', timeout=120000)
        said = page.evaluate("() => document.getElementById('pdf-host').innerText")
        check('L2: where the browser refuses WebAssembly, the PDF pane says so plainly, and that the editor works', 'does not let the page run WebAssembly' in said and 'Safari 16' in said and 'The editor works' in said, said[:300])
        ctx.unroute_all(behavior='ignoreErrors')
        b.close()
except Exception as e:
    traceback.print_exc()
    check('the run reaches its end', False, str(e)[:300])

n = sum(1 for r in results if r[1])
print('\n%d passed, %d failed' % (n, len(results) - n))
sys.exit(0 if n == len(results) else 1)
