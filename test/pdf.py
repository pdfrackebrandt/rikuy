"""Real pdfLaTeX inside Rikuy: the PDF pane compiles the project with pdfTeX (WebAssembly),
shows the pages, recompiles after edits, reports TeX's errors with their lines, and links
PDF and page both ways (SyncTeX). Served with the artifact host's CSP."""
import os, sys, time, json
sys.path.insert(0, os.path.dirname(__file__))
import serve
from browser import ROUTES, check, results, SHOTS
from playwright.sync_api import sync_playwright
NM = os.path.join(os.path.dirname(__file__), '..', 'node_modules')
ROUTES = dict(ROUTES)
ROUTES['https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs'] = os.path.join(NM, 'pdfjs-dist/build/pdf.min.mjs')
PORT = 8792
serve.start(PORT)

def open_app(p, width=1600, height=1000, dark=False):
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': width, 'height': height}, color_scheme='dark' if dark else 'light', accept_downloads=True)
    page = ctx.new_page()
    errors = []
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    page.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
    def h(route):
        u = route.request.url
        if u in ROUTES:
            return route.fulfill(status=200, content_type='text/javascript', body=open(ROUTES[u], encoding='utf8').read(), headers={'Access-Control-Allow-Origin': '*'})
        if u.startswith('http://127.0.0.1'):
            return route.continue_()
        return route.abort()
    page.route('**/*', h)
    page.goto(f'http://127.0.0.1:{PORT}/')
    page.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=30000)
    return b, page, errors

def wait_pdf(page, timeout=120):
    t0 = time.time()
    while time.time() - t0 < timeout:
        st = page.evaluate("document.getElementById('pdf-status').textContent")
        if (' page' in st and 'pdfLaTeX' in st and not page.evaluate('window.rikuy.compiling')) or 'stopped' in st or 'could not' in st:
            return st, time.time() - t0
        time.sleep(0.25)
    return page.evaluate("document.getElementById('pdf-status').textContent"), timeout

src = lambda page: page.evaluate("window.rikuy.files.get('main.tex')")

with sync_playwright() as p:
    b, page, errors = open_app(p)
    page.click('#b-pdf')
    st, dt = wait_pdf(page, 180)
    check('first PDF compiles', '3 pages' in st, st)
    print('first compile (engine download + LaTeX) seconds:', round(dt, 1))
    page.wait_for_timeout(800)
    drawn = page.evaluate("""(() => { const c = document.querySelector('.pdf-page canvas'); if (!c || !c.width) return 0;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let ink = 0; for (let i = 0; i < d.length; i += 4 * 97) if (d[i] < 128) ink++; return ink; })()""")
    check('PDF pages are drawn', drawn > 50, drawn)
    pdf = page.evaluate("(() => { const u = new Uint8Array(window.rikuy.lastPdf); return [u.length, String.fromCharCode(...u.slice(0, 5))]; })()")
    check('the PDF is a real PDF', pdf[1] == '%PDF-' and pdf[0] > 100000, pdf)
    page.screenshot(path=SHOTS + '/pdf-pane.png')

    # an edit on the page shows up in the PDF a moment later, in one pass
    page.evaluate("""(() => { const g = window.rikuy; const s = g.files.get('main.tex'); const at = s.indexOf('Click anywhere');
      g.commit([{ f: 'main.tex', s: at, e: at, t: 'Zebra quokka. ' }], null, 'type'); })()""")
    page.wait_for_timeout(300)
    st, dt = wait_pdf(page, 60)
    page.wait_for_timeout(1500)
    st, dt2 = wait_pdf(page, 60)
    text = page.evaluate("""(async () => { const lib = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
      const doc = await lib.getDocument({ data: new Uint8Array(window.rikuy.lastPdf.slice(0)) }).promise; const pg = await doc.getPage(1);
      const tc = await pg.getTextContent(); return tc.items.map(i => i.str).join(' '); })()""")
    check('edit reaches the PDF', 'Zebra quokka' in text, text[:200])

    # a TeX error: listed with its line, and the PDF still shows
    page.evaluate("""(() => { const g = window.rikuy; const s = g.files.get('main.tex'); const at = s.indexOf('Zebra quokka');
      g.commit([{ f: 'main.tex', s: at, e: at, t: '\\\\notacommand ' }], null, 'type'); })()""")
    page.wait_for_timeout(2000)
    st, dt = wait_pdf(page, 60)
    probs = page.evaluate("window.rikuy.texIssues.map(x => [x.sev, x.line, x.msg])")
    line = page.evaluate("(() => { const s = window.rikuy.files.get('main.tex'); return s.slice(0, s.indexOf('\\\\notacommand')).split('\\n').length; })()")
    check('TeX error reported with its line', any(x[0] == 'error' and x[1] == line and 'Undefined control sequence' in x[2] for x in probs), (line, probs[:3]))
    check('error banner shows', page.evaluate("!document.getElementById('pdf-msg').hidden && /error/.test(document.getElementById('pdf-msg').textContent)"))
    page.click('#pdf-msg'); page.wait_for_timeout(400)
    tex_rows = page.evaluate("[...document.querySelectorAll('.prob.tex')].map(e => e.textContent)")
    check('problems panel lists pdfLaTeX errors', any('Undefined control sequence' in r for r in tex_rows), tex_rows[:3])
    page.evaluate("window.rikuy.undo()"); page.wait_for_timeout(2500)
    st, dt = wait_pdf(page, 60)
    check('fixing it clears the error', not page.evaluate("window.rikuy.texIssues.some(x => x.sev === 'error')"), page.evaluate("window.rikuy.texIssues.map(x => x.msg)"))

    # SyncTeX: clicking a PDF line moves to that spot in the document
    page.evaluate("document.querySelector('#desk').scrollTop = 0")
    box = page.evaluate("""(() => { const p = document.querySelector('.pdf-page[data-page="2"]'); p.scrollIntoView(); const r = p.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()""")
    page.wait_for_timeout(400)
    box = page.evaluate("""(() => { const p = document.querySelector('.pdf-page[data-page="2"]'); const r = p.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()""")
    before = page.evaluate("document.querySelector('#desk').scrollTop")
    page.mouse.click(box[0] + box[2] * 0.4, box[1] + box[3] * 0.25)
    page.wait_for_timeout(300)
    after = page.evaluate("document.querySelector('#desk').scrollTop")
    flashed = page.evaluate("(document.querySelector('.it.flash') || {}).textContent || ''")
    p2 = page.evaluate("""(async () => { const lib = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
      const doc = await lib.getDocument({ data: new Uint8Array(window.rikuy.lastPdf.slice(0)) }).promise; const pg = await doc.getPage(2);
      return (await pg.getTextContent()).items.map(i => i.str).join(' ').replace(/\\s+/g, ' '); })()""")
    words = [w for w in flashed.split() if len(w) > 5][:4]
    check('clicking the PDF jumps to the same text on the page', after > before and words and all(w in p2 for w in words), (before, after, flashed[:80]))

    # a run that never ends can be stopped, and the next compile starts a fresh engine
    page.evaluate("""(() => { const g = window.rikuy; const s = g.files.get('main.tex'); const at = s.indexOf('\\\\begin{document}');
      g.commit([{ f: 'main.tex', s: at, e: at, t: '\\\\def\\\\loopforever{\\\\loopforever}\\n' }], null, 'type');
      const t = g.files.get('main.tex'); const b = t.indexOf('\\\\maketitle'); g.commit([{ f: 'main.tex', s: b, e: b, t: '\\\\loopforever ' }], null, 'type'); })()""")
    page.wait_for_function("document.getElementById('pdf-re').textContent === 'Stop'", timeout=30000)
    page.click('#pdf-re')
    page.wait_for_function("!window.rikuy.compiling", timeout=20000)
    check('a stuck run can be stopped', 'Stopped after' in page.evaluate("document.getElementById('pdf-msg').textContent"), page.evaluate("document.getElementById('pdf-msg').textContent"))
    page.evaluate("window.rikuy.undo()"); page.wait_for_timeout(200); page.evaluate("window.rikuy.undo()")
    try:
        page.wait_for_function("/3 pages/.test(document.getElementById('pdf-status').textContent) && !window.rikuy.compiling", timeout=120000)
    except Exception:
        pass
    st = page.evaluate("document.getElementById('pdf-status').textContent")
    check('after stopping, the next compile works', '3 pages' in st, st)

    # download
    with page.expect_download() as d:
        page.click('#pdf-dl')
    dl = d.value
    check('download gives a .pdf', dl.suggested_filename.endswith('.pdf'), dl.suggested_filename)
    page.screenshot(path=SHOTS + '/pdf-pane-2.png')
    print('errors:', errors[:5])
    check('no page errors', not errors, errors[:5])
    b.close()

    # mobile: the PDF covers the screen and closes again
    b, page, errors = open_app(p, 390, 844, dark=True)
    page.click('#b-pdf')
    st, dt = wait_pdf(page, 180)
    w = page.evaluate("document.getElementById('pdfpane').getBoundingClientRect().width")
    check('mobile PDF pane fills the width', abs(w - 390) < 2, w)
    page.screenshot(path=SHOTS + '/pdf-mobile.png')
    page.click('#pdf-x'); page.wait_for_timeout(300)
    check('closing hides it', not page.evaluate("document.body.classList.contains('pdf-on')"))
    check('no page errors (mobile)', not errors, errors[:5])
    b.close()

bad = [r for r in results if not r[1]]
print(f"{len(results) - len(bad)}/{len(results)} passed")
sys.exit(1 if bad else 0)
