"""Real pdfLaTeX inside Rikuy: the PDF pane compiles the project with pdfTeX (WebAssembly),
shows the pages, recompiles after edits, reports TeX's errors with their lines, and links
PDF and page both ways (SyncTeX). Served with the artifact host's CSP."""
import os, sys, time, json
sys.path.insert(0, os.path.dirname(__file__))
import serve
from browser import ROUTES, check, results, SHOTS, pdfjs_local
from playwright.sync_api import sync_playwright
PORT = 8792
serve.start(PORT)

def open_app(p, width=1600, height=1000, dark=False):
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': width, 'height': height}, color_scheme='dark' if dark else 'light', accept_downloads=True)
    page = ctx.new_page()
    errors = []
    # the browser reports the policy refusing Open in Overleaf's form, which the page then explains
    # (in older Chromium's words and in newer's)
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text and 'Refused to send form data' not in m.text and 'Sending form data to' not in m.text else None)
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

    # Under the hosted page's CSP (form-action 'self', which serve.py mirrors) the Overleaf form
    # POST is refused: the user must be told, not left with a false "it opened". This runs before
    # the heavy compile so it needs no engine.
    page.evaluate("document.addEventListener('securitypolicyviolation', e => { (window.__viol = window.__viol || []).push(e.effectiveDirective); })")
    page.evaluate("() => window.rikuy.openInOverleaf()")
    page.wait_for_timeout(400)
    viol = page.evaluate("(window.__viol || []).some(d => (d || '').startsWith('form-action'))")
    msg = page.evaluate("document.getElementById('toast').hidden ? '' : document.getElementById('toast').innerText")
    check('Open in Overleaf is blocked by the hosted CSP', viol, page.evaluate("window.__viol"))
    check('and the user is told to use Download .zip, not a false success', 'Download .zip' in msg and 'opens in a new tab' not in msg, msg)
    # pdf.js from the page's own site under the host's policy, before any compile
    pdfjs_local(page, f'http://127.0.0.1:{PORT}/')

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
    text = page.evaluate("""(async () => { const lib = await import(new URL('tex/pdf.min.mjs', location.href).href);
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
    p2 = page.evaluate("""(async () => { const lib = await import(new URL('tex/pdf.min.mjs', location.href).href);
      const doc = await lib.getDocument({ data: new Uint8Array(window.rikuy.lastPdf.slice(0)) }).promise; const pg = await doc.getPage(2);
      return (await pg.getTextContent()).items.map(i => i.str).join(' ').replace(/\\s+/g, ' '); })()""")
    # (the paragraph may start on page 1 or end on page 3: its first words or its last are on page
    # 2; a word TeX broke at a line's end is joined again)
    import re as _re
    p2j = _re.sub(r'-\s+', '', p2)
    long = [w for w in flashed.split() if len(w) > 5]
    words = long[:4]
    check('clicking the PDF jumps to the same text on the page', after > before and words and (all(w in p2j for w in words) or all(w in p2j for w in long[-4:])), (before, after, flashed[:80], p2[:160]))

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

    # SyncTeX gives a one line paragraph the blank line after it: clicked in the PDF, the page went
    # to the next thing of that file, past an \input's text ("Main text here." showed "Last words")
    page.evaluate("""() => { const g = window.rikuy; g.files = new Map([['main.tex', '\\\\documentclass{article}\\n\\\\begin{document}\\n\\\\section{Intro}\\nMain text here.\\n\\n\\\\input{sec/one}\\n\\nLast words $x^2$ and more.\\n\\\\end{document}\\n'],
      ['sec/one.tex', 'First input file text.\\n\\nSecond paragraph of input.\\n']]); g.main = 'main.tex'; g.hist = []; g.redoStack = []; g.forceRender = true; g.rebuild(); }""")
    page.evaluate('async () => { await window.rikuy.api.compile(); }')
    page.wait_for_timeout(800)
    page.evaluate("() => { const v = window.rikuy.pdfView, o = v.opts.onClickSource; v.opts.onClickSource = (f, l) => { window.__hit = [f, l]; o(f, l); }; }")
    went = {}
    for w in ['Main text here.', 'First input file text.', 'Last words']:
        xy = page.evaluate("""async (w) => { const lib = await import(new URL('tex/pdf.min.mjs', location.href).href);
          const doc = await lib.getDocument({ data: new Uint8Array(window.rikuy.lastPdf.slice(0)) }).promise; const pg = await doc.getPage(1);
          const vp = pg.getViewport({ scale: 1 }), it = (await pg.getTextContent()).items.find((i) => i.str.includes(w.split(' ')[0]));
          return it ? [it.transform[4] / vp.width, 1 - it.transform[5] / vp.height] : null; }""", w)
        box = page.evaluate("""(() => { const p = document.querySelector('.pdf-page[data-page="1"]'); p.scrollIntoView(); const r = p.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()""")
        page.evaluate("document.querySelectorAll('.flash').forEach((e) => e.classList.remove('flash'))")
        page.mouse.click(box[0] + box[2] * xy[0] + 8, box[1] + box[3] * xy[1] - 3)
        page.wait_for_timeout(400)
        went[w] = (page.evaluate("(document.querySelector('.it.flash') || {}).textContent || ''"), page.evaluate('window.__hit'))
    check('clicking a paragraph in the PDF shows that paragraph on the page, an \\input after it or not', all(went[w][0].startswith(w) for w in went), went)
    # a $ not closed is found at the blank line that ends its paragraph: the problem names the
    # paragraph's line and words, and a press on it shows that paragraph, not the next one
    page.evaluate("""async () => { const g = window.rikuy; g.files.set('sec/one.tex', 'First input file text.\\n\\nSecond $paragraph of input.\\n\\nThird one.\\n'); g.forceRender = true; g.rebuild(); await g.api.compile(); }""")
    probs = page.evaluate("window.rikuy.texIssues.filter((x) => x.sev === 'error').map((x) => [x.f, x.line, x.msg])")
    page.click('#pdf-msg')
    page.wait_for_timeout(300)
    page.evaluate("document.querySelectorAll('.flash').forEach((e) => e.classList.remove('flash'))")
    page.locator('.prob.tex').first.click()
    page.wait_for_timeout(300)
    fl = page.evaluate("(document.querySelector('.it.flash') || {}).textContent || ''")
    check('a $ left open: the problem names its paragraph\'s line and words, and a press shows that paragraph', probs[:1] == [['sec/one.tex', 3, 'Missing $ inserted. (at Second $paragraph of input.)']] and fl.startswith('Second'), (probs, fl))
    # (and puts the caret there, on the page, as a heading's press in the Navigation pane does:
    # what is typed next to fix it goes there)
    at = page.evaluate("() => { const c = window.rikuy.caretNow(); return c && [document.activeElement.id, c.f, window.rikuy.files.get(c.f).slice(c.p, c.p + 7)]; }")
    check('a press on the problem puts the caret at its line on the page', at == ['pages', 'sec/one.tex', 'Second '], at)
    # a brace left open: TeX reads on to the file's end and names no line (or the \input's): the
    # problem is put where the words it took as the argument begin
    page.evaluate("""async () => { const g = window.rikuy; g.files.set('sec/one.tex', 'First input file text.\\n\\nSecond \\\\emph{paragraph of\\ninput.\\n\\nThird one.\\n'); g.forceRender = true; g.rebuild(); await g.api.compile(); }""")
    probs = page.evaluate("window.rikuy.texIssues.filter((x) => x.sev === 'error').map((x) => [x.f, x.line, x.msg])")
    check('a brace left open in an \\input file: the problem is at the line where it opens, its words shown', probs[:1] == [['sec/one.tex', 3, 'File ended while scanning use of \\emph . (at {paragraph of input. \\par Third one.)']], probs)
    page.evaluate("""async () => { const g = window.rikuy; g.files.set('sec/one.tex', 'Fine.\\n'); g.files.set('main.tex', g.files.get('main.tex').replace('Last words', 'Last \\\\textbf{words')); g.forceRender = true; g.rebuild(); await g.api.compile(); }""")
    probs = page.evaluate("window.rikuy.texIssues.filter((x) => x.sev === 'error').map((x) => [x.f, x.line])")
    check('and in the main file, where TeX names no line at all', probs[:1] == [['main.tex', 8]], probs)
    print('errors:', errors[:5])
    check('no page errors', not errors, errors[:5])
    b.close()

    # A preamble's format is made between compiles, in a run of TeX that cannot be stopped. A
    # preamble that loops in that run alone (it can tell it by a folder that is there only then)
    # must not take the worker with it: the page lets it go after half a minute and the compile
    # that waited is made by a new one. (For one's own document: a stranger's is never dumped.)
    b, page, errors = open_app(p)
    page.evaluate('window.rikuy.api.whenReady()')
    LOOP = ('\\documentclass{article}\n\\IfFileExists{/home/web_user/rikuy-keep/k/main.tex}{\\count255=0 \\loop\\advance\\count255 1 \\ifnum\\count255>0 \\repeat}{}\n'
            '\\begin{document}\nA word here.\n\\end{document}\n')
    for k in range(3):  # (a compile of unchanged text may be answered without TeX: three texts)
        page.evaluate('(t) => window.rikuy.api.setSource(t)', LOOP.replace('A word', 'A word ' + 'more ' * k))
        page.evaluate('window.rikuy.api.compile()')
        page.wait_for_timeout(300)
        if page.evaluate('!!window.rikuy.texEngine().fmtSince'): break
    page.wait_for_timeout(1500)  # the dump run has begun, and loops
    page.evaluate('(t) => window.rikuy.api.setSource(t)', LOOP.replace('A word here.', 'Another word here.'))
    t0 = time.time()
    r = page.evaluate('window.rikuy.api.compile().then((r) => ({ ok: r.ok, pages: r.pages, pdf: !!r.pdf }), (e) => ({ error: String(e) }))')
    took = time.time() - t0
    check('a preamble that loops while its format is made: the compile that waited is made by a new worker', r.get('ok') and 5 < took < 60 and page.evaluate('window.rikuy.texEngine().noFormat === true'), (r, round(took)))
    r2 = page.evaluate('window.rikuy.api.compile().then((r) => ({ ok: r.ok }), (e) => ({ error: String(e) }))')
    check('and no format is tried again in that session', r2.get('ok') and page.evaluate('!window.rikuy.texEngine().fmtSince'), r2)
    check('no page errors (format)', not errors, errors[:5])
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
