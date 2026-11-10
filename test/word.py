"""Word files in the page as the host serves it (serve.py's CSP). Nothing of pandoc loads with the
page: its worker, manifest and parts come from word/ next to the page at the first Word action. A
Word file of one's own (python-docx, test/word_fixture.py) opens as a new project by Open, by
dropping it and by pasting it, with its equations as LaTeX math, its picture in figures/, its
table, list, footnote and link, and a javascript: link as plain text; it compiles with restricted
shell escape. A zip bomb and a file with a DTD are refused and the open project stays. A build
without Word (RIKUY_NO_WORD) says where Word support is and fetches nothing of it."""
import os, sys, io, re, json, base64, zipfile, tempfile, traceback, time, subprocess, shutil
sys.path.insert(0, os.path.dirname(__file__))
import serve
from browser import ROUTES, check, results
from playwright.sync_api import sync_playwright
import word_fixture

PORT = 8803
serve.start(PORT)
URL = 'http://127.0.0.1:%d/' % PORT
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP = os.path.join(tempfile.gettempdir(), 'rikuy-word')
os.makedirs(TMP, exist_ok=True)

def open_app(p, url=URL):
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1400, 'height': 1000}, accept_downloads=True, device_scale_factor=1)
    page = ctx.new_page()
    errors, reqs = [], []
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    page.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
    ctx.on('request', lambda r: reqs.append(r.url))

    def h(route):
        u = route.request.url
        if u in ROUTES:
            return route.fulfill(status=200, content_type='text/javascript', body=open(ROUTES[u], encoding='utf8').read(), headers={'Access-Control-Allow-Origin': '*'})
        if u.startswith('http://127.0.0.1'):
            return route.continue_()
        return route.abort()
    ctx.route('**/*', h)
    page.goto(url)
    page.evaluate('localStorage.clear()')
    page.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=30000)
    return b, page, errors, reqs


def wait_idle(page, ms=30000):
    page.wait_for_function('!window.rikuy.wordBusy', timeout=ms)
    page.wait_for_timeout(300)


def open_file(page, path):
    page.set_input_files('#fileinput', path)
    page.wait_for_timeout(300)
    wait_idle(page, 120000)


def src(page, f='main.tex'):
    return page.evaluate('(f) => window.rikuy.files.get(f)', f)


def parts(path):
    with zipfile.ZipFile(path) as z:
        return {n: z.read(n) for n in z.namelist()}


def edit_docx(path, out, ops):
    """Change the document.xml (and comments) of a .docx with plain string edits."""
    P = parts(path)
    d = P['word/document.xml'].decode()
    for a, b in ops:
        if callable(a):
            d = a(d)
            continue
        assert a in d, a
        d = d.replace(a, b, 1)
    P['word/document.xml'] = d.encode()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for n, b in P.items():
            z.writestr(n, b)
    return out


try:
    with sync_playwright() as p:
        browser, page, errors, reqs = open_app(p)
        check('loading the page fetches nothing of pandoc', not [u for u in reqs if '/word/' in u], [u for u in reqs if '/word/' in u])
        fx = os.path.join(TMP, 'Growth and Institutions.docx')
        open(fx, 'wb').write(word_fixture.make())
        n0 = len(reqs)
        open_file(page, fx)
        got = [u for u in reqs[n0:] if '/word/' in u]
        check('the first Word action fetches the worker, the manifest and the parts from word/', any(u.endswith('/word/word.js') for u in got) and any(u.endswith('/word/pandoc.json') for u in got) and len([u for u in got if u.endswith('.bin')]) >= 2, got)
        # ---- a Word file of one's own opens as a project ----
        t = src(page)
        check('Open: a .docx becomes a project named after it, main.tex', page.evaluate('window.rikuy.name') == 'Growth and Institutions' and '\\begin{document}' in t, page.evaluate('window.rikuy.name'))
        for what, s in [('headings', '\\section{Introduction}'), ('bold and italic', '\\textbf{growth} under \\emph{weak}'), ('escaped text', '5\\% rate \\& more'),
                        ('inline math from OMML', '\\(x^{2} + \\alpha\\)'), ('display math from OMML', '\\[\\int_{0}^{1}'), ('a link', '\\href{https://example.org/data}{online}'),
                        ('lists', '\\begin{itemize}'), ('a numbered list', '\\begin{enumerate}'), ('the table', 'Peru & 3.1'), ('the footnote', '\\footnote{Data from the World Bank.}'),
                        ('the picture', '\\includegraphics[width=2in'), ('the title', '\\title{Growth and Institutions}')]:
            check('Open .docx keeps %s' % what, s in t, t[:600] if s not in t else '')
        check('a javascript: link in the Word file is plain text, not a link', 'javascript' not in t)
        check('the picture is a file of the project, shown on the page', page.evaluate("window.rikuy.assetBlobs.has('figures/figure1.png')") and page.evaluate("[...document.querySelectorAll('#pages img')].some(i => i.complete && i.naturalWidth > 0)"))
        check('the page shows it without error chips', page.evaluate("document.querySelectorAll('#pages .a-chip.err').length") == 0, page.evaluate("[...document.querySelectorAll('#pages .a-chip.err')].map(x => x.textContent)"))
        check('a project from a Word file compiles with restricted shell escape', page.evaluate("(window.rikuy.linkCache.get(window.rikuy.name + '|' + window.rikuy.main) || {}).origin") == 'docx')

        # by dropping it, and by pasting it
        b64 = base64.b64encode(word_fixture.make()).decode()
        for how, js in [('drop', "(b) => { const f = new File([Uint8Array.from(atob(b), (c) => c.charCodeAt(0))], 'Dropped.docx'); const dt = new DataTransfer(); dt.items.add(f); document.getElementById('desk').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }"),
                        ('paste', "(b) => { const f = new File([Uint8Array.from(atob(b), (c) => c.charCodeAt(0))], 'Pasted.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }); const dt = new DataTransfer(); dt.items.add(f); document.getElementById('pages').focus(); document.getElementById('pages').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }")]:
            page.evaluate(js, b64)
            page.wait_for_timeout(300)
            wait_idle(page, 120000)
            want = 'Dropped' if how == 'drop' else 'Pasted'
            check('a .docx opens by %s too' % how, page.evaluate('window.rikuy.name') == want and '\\section{Findings}' in src(page), page.evaluate('window.rikuy.name'))

        # ---- hostile files ----
        bomb = os.path.join(TMP, 'bomb.docx')
        with zipfile.ZipFile(bomb, 'w', zipfile.ZIP_DEFLATED) as z:
            z.writestr('[Content_Types].xml', '<Types/>')
            z.writestr('word/document.xml', '<w:document/>')
            for k in range(3):
                z.writestr('word/media/big%d.bin' % k, b'\0' * 150_000_000)
        name0 = page.evaluate('window.rikuy.name')
        open_file(page, bomb)
        check('a zip bomb is refused by the sizes it declares, and the open project stays', 'unpack to more than' in page.inner_text('#toast') and page.evaluate('window.rikuy.name') == name0, page.inner_text('#toast')[:200])
        xxe = edit_docx(fx, os.path.join(TMP, 'xxe.docx'), [(lambda d: d.replace('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', '<?xml version="1.0"?><!DOCTYPE w [<!ENTITY x SYSTEM "file:///etc/passwd">]>', 1), None)])
        P = parts(xxe)
        P['customXml/item1.xml'] = b'<!DOCTYPE r [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><rikuy xmlns="urn:rikuy:word:1">&b;</rikuy>'
        with zipfile.ZipFile(xxe, 'w') as z:
            for n, b in P.items(): z.writestr(n, b)
        open_file(page, xxe)
        check('a Word file with a DTD (XXE, entity expansion) is refused', 'DTD' in page.inner_text('#toast') or 'could not' in page.inner_text('#toast').lower(), page.inner_text('#toast')[:200])
        print('errors:', errors[:5])
        check('no page errors', not errors, errors[:5])
        browser.close()

    # ---- a build without Word ----
    nw = os.path.join(TMP, 'dist-noword')
    shutil.rmtree(nw, ignore_errors=True)
    r = subprocess.run(['node', os.path.join(ROOT, 'build.mjs')], cwd=ROOT, env={**os.environ, 'RIKUY_OUT': nw, 'RIKUY_NO_WORD': '1'}, capture_output=True, text=True)
    check('RIKUY_NO_WORD builds, without word/', r.returncode == 0 and not os.path.exists(os.path.join(nw, 'word')) and os.path.exists(os.path.join(nw, 'rikuy.html')), r.stderr[-300:])
    port2 = PORT + 1
    srv = subprocess.Popen([sys.executable, os.path.join(os.path.dirname(__file__), 'serve.py'), str(port2)], env={**os.environ, 'RIKUY_DIST': nw})
    time.sleep(1.0)
    try:
        with sync_playwright() as p:
            browser, page, errors, reqs = open_app(p, 'http://127.0.0.1:%d/' % port2)
            page.set_input_files('#fileinput', fx)
            page.wait_for_timeout(500)
            check('without Word: opening a .docx says Word support lives on the hosted copy, and the project stays', 'hosted copy' in page.inner_text('#toast') and 'Editing in Print' in src(page), page.inner_text('#toast'))
            check('without Word: nothing of pandoc is ever fetched', not [u for u in reqs if '/word/' in u], [u for u in reqs if '/word/' in u])
            check('without Word: no page errors', not errors, errors[:3])
            browser.close()
    finally:
        srv.terminate()
except Exception as e:
    traceback.print_exc()
    check('the run reaches its end', False, e)
bad = [r for r in results if not r[1]]
print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
sys.exit(1 if bad else 0)
