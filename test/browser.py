"""Rikuy browser tests: load the built page in Chromium, type on the
typeset pages, and check the .tex source changes exactly as intended."""
import json, os, sys, time, re, tempfile
from playwright.sync_api import sync_playwright

# The build machine keeps Chromium in /opt/pw-browsers. Anywhere else Playwright's own default
# must stay, or it would miss a browser installed the usual way (`playwright install`). Every
# test imports this module before it starts Playwright, so this covers them all.
if os.path.isdir('/opt/pw-browsers'): os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NM = os.path.join(ROOT, 'node_modules')
SHOTS = os.environ.get('SHOTS', os.path.join(tempfile.gettempdir(), 'rikuy-shots'))
os.makedirs(SHOTS, exist_ok=True)

SKELETON_HEAD = ('<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">'
                 '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
                 'body{margin:0;font:14px system-ui,sans-serif;background:#fafafa}img{max-width:100%}[hidden]{display:none!important}</style></head><body>')

ROUTES = {
    'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js': os.path.join(NM, 'katex/dist/katex.min.js'),
    'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/lib/codemirror.js': os.path.join(NM, 'codemirror/lib/codemirror.js'),
    'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/mode/stex/stex.js': os.path.join(NM, 'codemirror/mode/stex/stex.js'),
    'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js': os.path.join(NM, 'jszip/dist/jszip.min.js'),
    'https://cdn.jsdelivr.net/npm/mathlive@0.110.0/mathlive.min.js': os.path.join(NM, 'mathlive/mathlive.min.js'),
    'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/contrib/mhchem.min.js': os.path.join(NM, 'katex/dist/contrib/mhchem.min.js'),
}

results = []
def check(name, cond, detail=''):
    results.append((name, bool(cond), detail))
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else '  :: ' + str(detail)[:300]))


def open_page(p, width=1400, height=1000, dark=False, clear=True, init=None):
    browser = p.chromium.launch(args=[a for a in os.environ.get('CHROME_ARGS', '').split() if a])
    ctx = browser.new_context(viewport={'width': width, 'height': height}, color_scheme='dark' if dark else 'light', device_scale_factor=1)
    page = ctx.new_page()
    errors = []
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    page.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
    dist = os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist')
    html = open(os.path.join(dist, 'rikuy.html'), encoding='utf8').read()
    doc = SKELETON_HEAD + html + '</body></html>'

    def handler(route):
        url = route.request.url
        if url.startswith('https://rikuy.test/'):
            path = url[len('https://rikuy.test/'):].split('?')[0]
            f = os.path.join(dist, path)
            if path and os.path.isfile(f):
                ct = 'text/javascript' if path.endswith(('.js', '.mjs')) else 'application/wasm' if path.endswith('.wasm') else 'application/octet-stream'
                return route.fulfill(status=200, content_type=ct, body=open(f, 'rb').read())
            return route.fulfill(status=200, content_type='text/html; charset=utf-8', body=doc)
        if url.startswith('http://127.0.0.1:'):
            return route.continue_()
        if url in ROUTES:
            # the npm package's own bytes, which the page checks against its integrity hashes;
            # the CDN answers with CORS, as a script loaded with crossorigin needs
            return route.fulfill(status=200, content_type='application/javascript', headers={'Access-Control-Allow-Origin': '*'}, body=open(ROUTES[url], 'rb').read())
        return route.abort()
    # on the context, so a second tab (page.context.new_page()) loads the same page and storage
    ctx.route('**/*', handler)
    if init:
        page.add_init_script(init)
    page.goto('https://rikuy.test/')
    if clear:
        page.evaluate('localStorage.clear()')
        page.reload()
    page.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=20000)
    page.wait_for_timeout(300)
    return browser, page, errors


def src(page, f='main.tex'):
    return page.evaluate('(f) => window.rikuy.files.get(f)', f)


def wait_src(page, text, f='main.tex', timeout=5000):
    # edits that go through a debounce or the math field land a moment later on a busy machine
    try:
        page.wait_for_function('([f, t]) => (window.rikuy.files.get(f) || "").includes(t)', arg=[f, text], timeout=timeout)
    except Exception:
        pass


def click_text(page, text, offset_chars=0, nth=0):
    """Place the caret inside the first rendered span containing text, after offset chars."""
    ok = page.evaluate('''([text, off, nth]) => {
      const spans = [...document.querySelectorAll('#pages span.t')].filter(s => s.textContent.includes(text));
      const s = spans[nth]; if (!s) return false;
      const i = s.textContent.indexOf(text) + off;
      const r = document.createRange(); r.setStart(s.firstChild, i); r.collapse(true);
      const el = document.getElementById('pages'); el.focus();
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      return true; }''', [text, offset_chars, nth])
    page.wait_for_timeout(30)
    return ok


def select_text(page, text, nth=0):
    return page.evaluate('''([text, nth]) => {
      const spans = [...document.querySelectorAll('#pages span.t')].filter(s => s.textContent.includes(text));
      const s = spans[nth]; if (!s) return false;
      const i = s.textContent.indexOf(text);
      const r = document.createRange(); r.setStart(s.firstChild, i); r.setEnd(s.firstChild, i + text.length);
      document.getElementById('pages').focus();
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      return true; }''', [text, nth])


def load_doc(page, files, main='main.tex'):
    """Replace the project with these files, as opening them would, without its toasts."""
    if isinstance(files, str):
        files = {main: files}
    page.evaluate('''([files, main]) => { const g = window.rikuy; g.files = new Map(Object.entries(files)); g.main = main; g.hist = []; g.redoStack = []; g.forceRender = true; g.rebuild(); if (g.cm) g.showSrcFile(main); }''', [files, main])
    page.wait_for_timeout(50)



def tiny_pdf():
    """A one page PDF with a blue box, written out here so the check needs no TeX."""
    stream = b'0 0 1 rg 20 20 160 60 re f'
    objs = [b'<< /Type /Catalog /Pages 2 0 R >>', b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R >>',
            b'<< /Length %d >>\nstream\n' % len(stream) + stream + b'\nendstream']
    out, offs = bytearray(b'%PDF-1.4\n'), []
    for i, o in enumerate(objs, 1):
        offs.append(len(out))
        out += b'%d 0 obj\n' % i + o + b'\nendobj\n'
    xref = len(out)
    out += b'xref\n0 %d\n0000000000 65535 f \n' % (len(objs) + 1) + b''.join(b'%010d 00000 n \n' % o for o in offs)
    out += b'trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objs) + 1, xref)
    return bytes(out)


def pdfjs_local(page, origin):
    """pdf.js loads from the page's own site and shows a PDF. A module import() takes no
    integrity hash, so pdf.js from a CDN would run whatever the CDN sent as the page; the
    routes answer only the CDN files the page pins (ROUTES), so a script from anywhere else
    fails here."""
    import base64
    reqs = []
    page.on('request', lambda r: reqs.append((r.url, r.resource_type)))
    n = page.evaluate('''async (b64) => { const g = window.rikuy; const had = g.lastPdf; g.lastPdf = had || {}; g.pdfStale = false;
      g.togglePdf(true); try { await g.pdfView.show(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))); return g.pdfView.doc.numPages; }
      catch (e) { return String(e); } finally { g.togglePdf(false); g.lastPdf = had; } }''', base64.b64encode(tiny_pdf()).decode())
    mine = [u for u, t in reqs if u == origin + 'tex/pdf.min.mjs']
    foreign = [u for u, t in reqs if t == 'script' and not u.startswith(origin) and u not in ROUTES]
    check('pdf.js comes from the page\'s own site (tex/pdf.min.mjs) and shows a PDF', n == 1 and mine, (n, reqs[:6]))
    check('and no script comes from another site without an integrity hash', not foreign, foreign)


def ui_fonts(page):
    """The interface's fonts ship inside the page: loading it asks nothing of Google's font
    servers (which would learn the address of everyone who opens it), and its text is drawn in
    IBM Plex Sans and Mono, the faces the page carries, not in a system font."""
    reqs = []
    page.on('request', lambda r: reqs.append(r.url))
    page.reload()
    page.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=20000)
    google = [u for u in reqs if re.match(r'https?://fonts\.(googleapis|gstatic)\.com/', u)]
    check('loading the page asks nothing of fonts.googleapis.com or fonts.gstatic.com', reqs and not google, google[:3])
    faces = page.evaluate('''async () => { const out = [];
      for (const f of ['400 13px "IBM Plex Sans"', '500 13px "IBM Plex Sans"', '600 13px "IBM Plex Sans"', '400 13px "IBM Plex Mono"', '500 13px "IBM Plex Mono"'])
        out.push((await document.fonts.load(f, 'Rikuy')).filter((x) => x.status === 'loaded').length && document.fonts.check(f, 'Rikuy'));
      document.body.insertAdjacentHTML('beforeend', '<div id="monoprobe" style="font: 500 12px var(--font-mono)">pitem 0123</div>');
      return out; }''')
    # what Chromium drew the text with: the fonts it used for a toolbar label and a line of mono
    cdp = page.context.new_cdp_session(page)
    cdp.send('DOM.enable')
    cdp.send('CSS.enable')
    root = cdp.send('DOM.getDocument', {'depth': -1})['root']['nodeId']
    drawn = {}
    for sel in ('#b-open span', '#st-save', '#monoprobe'):
        nid = cdp.send('DOM.querySelector', {'nodeId': root, 'selector': sel})['nodeId']
        drawn[sel] = [(f['familyName'], f['isCustomFont']) for f in cdp.send('CSS.getPlatformFontsForNode', {'nodeId': nid})['fonts']]
    page.evaluate("document.getElementById('monoprobe').remove()")
    check('IBM Plex Sans 400, 500, 600 and Mono 400, 500 load from the page itself', faces == [True] * 5, faces)
    # Chromium names a face with its style ("IBM Plex Sans Medium"); custom means the page's own
    only = lambda sel, fam: drawn[sel] and all(n.startswith(fam) and own for n, own in drawn[sel])
    check('and the interface is drawn in them: a toolbar label and the status line in Plex Sans, mono text in Plex Mono',
          only('#b-open span', 'IBM Plex Sans') and only('#st-save', 'IBM Plex Sans') and only('#monoprobe', 'IBM Plex Mono'), drawn)


def latin_ext_fonts(page, where='', check=check):
    """Letters past Latin-1 (Ł, ő, ř, ş, ā: a file, a project or an author's name in the
    interface) are drawn in IBM Plex too, from its Latin Extended cut, not in a system font that
    looks different beside them. rikuy.html carries the cut as data:, the hosted page as files."""
    text = 'Łódź Erdős Dvořák Şişli Āpā'
    page.evaluate('''async (text) => {
      for (const f of ['400 13px "IBM Plex Sans"', '500 13px "IBM Plex Sans"', '600 13px "IBM Plex Sans"', '400 13px "IBM Plex Mono"', '500 13px "IBM Plex Mono"']) await document.fonts.load(f, text);
      const w = (s, i) => '<div id="xp' + i + '" style="font: ' + s + '">' + text + '</div>';
      document.body.insertAdjacentHTML('beforeend', [w('400 13px var(--font-ui)', 0), w('500 13px var(--font-ui)', 1), w('600 13px var(--font-ui)', 2), w('400 12px var(--font-mono)', 3), w('500 12px var(--font-mono)', 4)].join(''));
    }''', text)
    cdp = page.context.new_cdp_session(page)
    cdp.send('DOM.enable'); cdp.send('CSS.enable')
    root = cdp.send('DOM.getDocument', {'depth': -1})['root']['nodeId']
    drawn = []
    for i in range(5):
        nid = cdp.send('DOM.querySelector', {'nodeId': root, 'selector': '#xp%d' % i})['nodeId']
        drawn.append([(f['familyName'], f['isCustomFont']) for f in cdp.send('CSS.getPlatformFontsForNode', {'nodeId': nid})['fonts']])
    page.evaluate("for (let i = 0; i < 5; i++) document.getElementById('xp' + i).remove()")
    fam = ['IBM Plex Sans'] * 3 + ['IBM Plex Mono'] * 2
    check('Ł, ő, ř, ş and ā are drawn in IBM Plex Sans and Mono, every weight, not a system font' + where,
          all(d and all(n.startswith(f) and own for n, own in d) for d, f in zip(drawn, fam)), drawn)


def default_macros(page):
    """The math the page knows without a definition renders: \\tfrac was once mapped to itself,
    so KaTeX expanded it until its limit and every formula with it showed as an error."""
    doc = ('\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nHalf is $\\tfrac{1}{2}$, so\n'
           '\\[\\begin{aligned} a &= \\tfrac{1}{3} + \\nicefrac{1}{6} \\\\ b &= \\mathbbm{R}\\end{aligned}\\]\nAfter.\n\\end{document}\n')
    load_doc(page, doc)
    page.wait_for_timeout(600)
    page.evaluate('window.rikuy.refreshNav()')
    probs = page.evaluate("(window.rikuy.problems || []).filter((x) => /Math error/.test(x.msg)).map((x) => x.msg)")
    n = page.evaluate("document.querySelectorAll('#pages .katex').length")
    check('\\tfrac, \\nicefrac and \\mathbbm render without a math error', not probs and n >= 2, (probs, n))


def skipped_args(page):
    """A macro whose body skips an argument (\\newcommand{\\second}[2]{#2}) renders: KaTeX counts a
    string macro's arguments only up to the first one missing, so it took none and showed #2 as an
    error. Vertical space inside a title or a line (\\vspace, \\smallskip) shows nothing, not its length."""
    doc = ('\\documentclass{article}\n\\usepackage{amsmath}\n\\newcommand{\\nv}[2]{#2}\n\\newcommand{\\pick}[3]{#3+#1}\n'
           '\\title{\\vspace{-1.5em}\\textbf{Demand}}\n\\begin{document}\n\\maketitle\n'
           'Shares are $\\nv{b1}{0.50}$ and $\\pick{x}{y}{z}$.\\smallskip{} After.\n\\end{document}\n')
    load_doc(page, doc)
    page.wait_for_timeout(600)
    page.evaluate('window.rikuy.refreshNav()')
    probs = page.evaluate("(window.rikuy.problems || []).filter((x) => x.sev !== 'info' || /smallskip|vspace/.test(x.msg)).map((x) => x.msg)")
    text = page.evaluate("document.getElementById('pages').innerText")
    check('a macro that skips an argument renders, and \\vspace or \\smallskip in a line shows nothing',
          not probs and '0.50' in text and 'z+x' in text.replace(' ', '') and '1.5em' not in text and 'Demand' in text, (probs, text[:200]))


def hidden_deletes(page):
    """One Backspace never removes what the page does not show: at the start of a theorem's body
    the browser names a range from the paragraph's end, and a letter's \\date and \\subject sit
    between two visible lines."""
    thm = ('\\documentclass{article}\n\\usepackage{amsthm}\n\\newtheorem{theorem}{Theorem}\n\\begin{document}\n'
           '\\begin{theorem}\n    Let $x$ be a number.\n    Then it is one.\n\\end{theorem}\nAfter.\n\\end{document}\n')
    load_doc(page, thm)
    page.wait_for_timeout(300)
    click_text(page, 'Let', 0)
    page.keyboard.press('Backspace')
    page.wait_for_timeout(200)
    check('Backspace at the start of a theorem keeps its first paragraph', 'Let $x$ be a number.' in src(page) and 'Then it is one.' in src(page), src(page)[-120:])
    letter = ('\\documentclass[a4paper, 12pt, KOMAold, sections]{scrlttr2}\n\\newcommand{\\Empfaenger}{Lisa M}\n'
              '\\newcommand{\\EStrasse}{Main Street}\n\\newcommand{\\DocTitle}{Small worlds}\n\\begin{document}\n'
              '    \\begin{letter}{\\Empfaenger \\\\ \\EStrasse}\n    \\date{\\today}%a note\n    \\subject{\\DocTitle}\n'
              '    \\opening{Dear Lisa,}\n    The letter itself.\n    \\closing{Yours}\n    \\end{letter}\n\\end{document}\n')
    lost = []
    n = 0
    load_doc(page, letter)
    page.wait_for_timeout(300)
    n = page.evaluate('document.querySelectorAll("#pages span.t:not(.ph)").length')
    for k in range(n):
        load_doc(page, letter)
        page.wait_for_timeout(80)
        page.evaluate('''(k) => { const s = [...document.querySelectorAll('#pages span.t:not(.ph)')][k]; if (!s || !s.firstChild) return; const r = document.createRange(); r.setStart(s.firstChild, 0); r.collapse(true); document.getElementById('pages').focus(); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }''', k)
        page.keyboard.press('Backspace')
        page.wait_for_timeout(80)
        t = src(page)
        # a visible letter of the subject may go; the commands themselves must stay
        if '\\date{\\today}' not in t or '\\subject{' not in t:
            lost.append(k)
    check('Backspace anywhere in a letter keeps its hidden \\date and \\subject', n > 0 and not lost, (n, lost))
    # two display formulas, then a paragraph: Backspace at its start selects the nearer formula,
    # as with one formula, and deletes nothing yet (both went at once)
    two = ('\\documentclass{article}\n\\begin{document}\nThen:\n$$a = b$$\n$$= c.$$\n\nSo it follows.\n\\end{document}\n')
    load_doc(page, two)
    page.wait_for_timeout(300)
    click_text(page, 'So it follows', 0)
    page.keyboard.press('Backspace')
    page.wait_for_timeout(200)
    check('Backspace after two display formulas selects one and deletes nothing', src(page) == two and 'Press Backspace again' in page.inner_text('#toast'), (src(page)[-60:], page.inner_text('#toast')[:60]))
    page.keyboard.press('Escape')
    # a formula a macro's own text makes (\\newcommand{\\arrow}{$\\rightarrow$}, here or in a .sty)
    # is not at the call site in the file: clicking it edits nothing (it wrote \\documentcla+1ss)
    for files in ({'main.tex': '\\documentclass{article}\n\\newcommand{\\arrow}{$\\rightarrow$}\n\\begin{document}\nA \\arrow{} B.\n\\end{document}\n'},
                  {'main.tex': '\\documentclass{article}\n\\usepackage{myStyle}\n\\begin{document}\nA \\arrow{} B.\n\\end{document}\n', 'myStyle.sty': '\\newcommand{\\arrow}{$\\rightarrow$}\n'}):
        load_doc(page, files)
        page.wait_for_timeout(300)
        box = page.evaluate("() => { const k = document.querySelector('#pages .katex'); if (!k) return null; const r = k.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }")
        if box:
            page.mouse.click(box[0], box[1])
            page.wait_for_timeout(400)
            if page.evaluate("!!document.getElementById('pop-field')"):
                page.evaluate("document.getElementById('pop-field').executeCommand('moveToMathfieldEnd')")
                page.keyboard.type('+1')
                page.wait_for_timeout(300)
            page.keyboard.press('Escape')
            page.wait_for_timeout(200)
        same = all(page.evaluate('(f) => window.rikuy.files.get(f)', k) == v for k, v in files.items())
        check('a formula made by a macro%s edits nothing in the file' % (' from a .sty' if len(files) > 1 else ''), box and same, box)

def select_between(page, t1, o1, t2, o2):
    return page.evaluate('''([t1, o1, t2, o2]) => {
      const sp = [...document.querySelectorAll('#pages span.t')];
      const a = sp.find(s => s.textContent.includes(t1)), b = sp.find(s => s.textContent.includes(t2));
      if (!a || !b) return false;
      const r = document.createRange(); r.setStart(a.firstChild, a.textContent.indexOf(t1) + o1); r.setEnd(b.firstChild, b.textContent.indexOf(t2) + o2);
      document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); return true; }''', [t1, o1, t2, o2])


def undo_all(page):
    for _ in range(200):
        if not page.evaluate('window.rikuy.hist.length'): break
        page.evaluate('window.rikuy.undo()')


DOC_EDGES = r"""\documentclass{article}
\begin{document}
First paragraph ends here.
% comment (Ana) on "ends": please fix

Second paragraph starts here, 50\%{more} and a tilde.

Line one\\
line two follows.

\begin{itemize}
\item alpha item
\end{itemize}

Use \verb|%| for comments, then \textbf{bold words here} follow.
\end{document}
"""


def edges(page, errors):
    """Edits next to comments, optional arguments, \\verb, wrappers and empty documents."""
    load_doc(page, DOC_EDGES)
    base = src(page)
    click_text(page, 'Second paragraph', 0)
    page.keyboard.press('Backspace')
    s = src(page)
    check('joining paragraphs keeps the comment lines between them', s == base.replace('please fix\n\nSecond', 'please fix\nSecond'), s[s.find('here.'):][:80])
    undo_all(page)
    click_text(page, 'ends here.', 10)
    page.keyboard.press('Enter')
    page.keyboard.type('New.')
    s = src(page)
    check('a new paragraph goes after the comment under the line', 'please fix\n\nNew.\n\nSecond' in s, s[s.find('here.'):][:80])
    undo_all(page)
    check('text in a group after a character command is on the page', page.evaluate('[...document.querySelectorAll("#pages span.t")].some(s => s.textContent === "more")'))
    click_text(page, 'line two', 0)
    page.keyboard.type('[1]')
    check('[ after \\\\ is written {[} (else an optional argument)', 'Line one\\\\\n{[}1]line two' in src(page), src(page)[src(page).find('Line one'):][:40])
    undo_all(page)
    click_text(page, 'alpha item', 0)
    page.keyboard.type('[x]')
    check('[ at the start of an item is written {[}', '\\item {[}x]alpha' in src(page), src(page)[src(page).find('\\item'):][:30])
    undo_all(page)
    click_text(page, 'bold words', 2)
    page.keyboard.press('Enter')
    check('Enter inside \\textbf closes and reopens it', '\\textbf{bo}\n\n\\textbf{ld words here}' in src(page), src(page)[src(page).find('then'):][:60])
    undo_all(page)
    select_between(page, 'Use', 1, 'bold words', 4)
    page.keyboard.press('Backspace')
    check('deleting across \\verb|%| keeps the \\textbf{ it reaches into', 'U\\textbf{ words here}' in src(page), src(page)[src(page).find('U'):][:60])
    undo_all(page)
    check('edges: undo gives the bytes back', src(page) == base)
    # an empty document: a blank paragraph to type into
    empty = '\\documentclass{article}\n\\begin{document}\n\n\\end{document}\n'
    load_doc(page, empty)
    check('an empty document offers a paragraph to type in', page.evaluate('!!document.querySelector("#pages .ghostp.empty")'))
    box = page.evaluate('(() => { const r = document.querySelector(".page").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()')
    page.mouse.click(box[0], box[1])
    page.keyboard.type('Hello')
    check('typing on an empty page starts its first paragraph', src(page) == '\\documentclass{article}\n\\begin{document}\n\nHello\n\n\\end{document}\n', repr(src(page)))
    # Enter at the end of a heading: the \label on its next line stays with the heading
    labelled = '\\documentclass{article}\n\\begin{document}\n\\section{Intro}\n\\label{sec:i}\nText here.\n\\end{document}\n'
    load_doc(page, labelled)
    click_text(page, 'Intro', 5)
    page.keyboard.press('Enter')
    page.keyboard.type('New.')
    check('a paragraph after a heading goes after its \\label', '\\section{Intro}\n\\label{sec:i}\n\nNew.\n\nText here.' in src(page), repr(src(page)))
    undo_all(page)
    # a document the page cannot build: the old pages take no typing
    load_doc(page, DOC_EDGES)
    deep = DOC_EDGES.replace('Second paragraph', '\\textbf{' * 10000 + 'x' + '}' * 10000 + ' Second paragraph')
    page.evaluate('(t) => { const g = window.rikuy; g.files.set("main.tex", t); g.rebuild(); }', deep)
    click_text(page, 'First paragraph', 3)
    page.keyboard.type('Z')
    check('pages that could not be rebuilt take no typing', src(page) == deep and page.evaluate('document.getElementById("pages").classList.contains("stale")'))
    errors[:] = [e for e in errors if 'Maximum call stack' not in e]
    page.evaluate('(t) => { const g = window.rikuy; g.files.set("main.tex", t); g.rebuild(); }', DOC_EDGES)
    check('a build that works again makes them editable', page.evaluate('document.getElementById("pages").contentEditable') == 'true')
    # an input method replacing a selected word: what is typed next follows it
    load_doc(page, DOC_EDGES)
    cdp = page.context.new_cdp_session(page)
    select_text(page, 'starts')
    for t in ['k', 'か']:
        cdp.send('Input.imeSetComposition', {'text': t, 'selectionStart': len(t), 'selectionEnd': len(t)})
    cdp.send('Input.insertText', {'text': '漢字'})
    page.wait_for_timeout(100)
    page.keyboard.type('Y')
    check('after composing over a selection the caret follows the new text', 'paragraph 漢字Y here' in src(page), src(page)[src(page).find('Second'):][:40])
    undo_all(page)


DOC_POP = r"""\documentclass{article}
\usepackage{amsmath,natbib}
\begin{document}
Mass $m$ and energy \citep{a} here.

Last paragraph.
\bibliographystyle{plainnat}
\bibliography{refs}
\end{document}
"""
BIB_POP = '@book{a, author={Ann, A.}, title={T}, year={2001}}\n@book{bbbbbbbb, author={Bob, B.}, title={U}, year={2002}}\n'


def popovers(page):
    """What is typed after a popover closes goes after the formula, citation or equation it made
    longer (it went inside them: \\end{ More.equation}); a new equation holds no blank line;
    Ctrl+A selects the pages' text."""
    load_doc(page, {'main.tex': DOC_POP, 'refs.bib': BIB_POP})
    base = src(page)
    page.click('.a-math >> nth=0')
    page.wait_for_selector('.pop-math textarea')
    page.fill('.pop-math textarea', 'E = m c^2 + \\mathcal{O}(v^4)')
    wait_src(page, 'O}(v^4)$')
    page.keyboard.press('Enter')
    page.wait_for_timeout(150)
    page.keyboard.type('Q')
    check('typing after a formula made longer goes after it', '$E = m c^2 + \\mathcal{O}(v^4)$Q and' in src(page), src(page)[src(page).find('Mass'):][:60])
    undo_all(page)
    page.click('.a-cite >> nth=0')
    page.wait_for_selector('.pop-cite')
    page.keyboard.type('bob')
    page.keyboard.press('Enter')
    page.wait_for_timeout(150)
    page.keyboard.press('Escape')
    page.wait_for_timeout(150)
    page.keyboard.type('Q')
    check('typing after a citation that gained a key goes after it', '\\citep{a, bbbbbbbb}Q here' in src(page), src(page)[src(page).find('energy'):][:50])
    undo_all(page)
    click_text(page, 'here.', 5)
    page.keyboard.press('Control+Shift+E')
    page.wait_for_selector('.pop-math')
    page.wait_for_timeout(300)
    page.keyboard.type('E=mc^2', delay=60)
    wait_src(page, 'E=mc^2')
    page.keyboard.press('Enter')
    page.wait_for_timeout(150)
    page.keyboard.type('Q')
    s = src(page)
    eq = s[s.find('\\begin{equation}'):s.find('\\end{equation}') + 14]
    check('a new equation holds no blank line', re.fullmatch(r'\\begin\{equation\}\n *E=mc\^2\n\\end\{equation\}', eq), repr(eq))
    check('and what is typed after it goes after \\end{equation}', '\\end{equation}Q' in s, repr(s[s.find('here.'):][:80]))
    undo_all(page)
    click_text(page, 'Last paragraph', 2)
    page.keyboard.press('Control+a')
    sel = page.evaluate('getSelection().toString()')
    check('Ctrl+A selects the text of the pages', 'Mass' in sel and 'Last paragraph.' in sel, sel[:80])
    page.keyboard.press('Backspace')
    page.wait_for_timeout(150)
    check('and Backspace deletes it', 'energy' not in src(page) and 'Last paragraph' not in src(page), src(page)[src(page).find('document}'):][:80])
    undo_all(page)
    check('popovers: undo gives the bytes back', src(page) == base)


def first_words(page):
    """What someone who has never used LaTeX does first: New document and typing at once,
    deleting it all and typing again, a formula or a heading as the first thing in a paragraph,
    Enter in the title, Backspace in a heading left empty."""
    body = lambda: src(page)[src(page).find('\\begin{document}') + 16:src(page).find('\\end{document}')]
    slow = dict(delay=40)   # the math field takes keys as a person types them, not all at once
    page.click('#b-new')
    page.wait_for_function('window.rikuy.name.startsWith("Untitled") && window.rikuy.ghost', timeout=5000)
    name = page.evaluate('window.rikuy.name')
    page.keyboard.type('First words')
    wait_src(page, 'First words')
    check('after New document the first words typed land on the page, with no click', 'First words' in body() and page.evaluate('window.rikuy.name') == name, (body(), page.evaluate('window.rikuy.name')))
    for _ in range(len('First words')): page.keyboard.press('Backspace')
    page.wait_for_timeout(150)
    page.keyboard.type('again')
    wait_src(page, 'again')
    check('with every word deleted, typing starts the document again', body().strip() == 'again', body())
    page.keyboard.press('Enter'); page.keyboard.type('$'); page.wait_for_timeout(400)
    opened = page.evaluate('!!document.querySelector("body > .pop.pop-math")')
    page.keyboard.type('x^2', **slow); page.wait_for_timeout(100); page.keyboard.press('Enter')
    wait_src(page, '$x^2$')
    check('a dollar sign on a new line starts a formula, as it does inside a line', opened and 'again\n\n$x^2$' in body(), body())
    page.keyboard.type(' is math'); page.keyboard.press('Enter'); page.keyboard.type('$'); page.wait_for_timeout(400)
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    page.keyboard.type('next')
    wait_src(page, 'next')
    check('closing that formula empty leaves the caret on the line', re.search(r'is math\n\nnext\s*$', body()), body())
    page.keyboard.press('Enter'); page.keyboard.type('\\'); page.wait_for_timeout(400)
    pal = page.evaluate('!!document.querySelector("body > .pop.pop-pal")')
    page.keyboard.type('sec', **slow); page.wait_for_timeout(200); page.keyboard.press('Enter'); page.wait_for_timeout(300)
    page.keyboard.type('Results')
    wait_src(page, '\\section{Results}')
    check('a backslash on a new line opens the list of things to insert', pal and '\\section{Results}' in body(), body())
    click_text(page, 'Results'); page.keyboard.press('Shift+End'); page.keyboard.press('Delete'); page.wait_for_timeout(200)
    emptied = '\\section{}' in body()
    page.keyboard.press('Backspace'); page.wait_for_timeout(200)
    check('Backspace in a heading left empty removes the heading', emptied and '\\section' not in body() and 'next' in body(), body())
    # a formula as the first thing in a new document, then more typing
    page.click('#b-new'); page.wait_for_timeout(400)
    page.keyboard.type('$'); page.wait_for_timeout(400); page.keyboard.type('y', **slow); page.wait_for_timeout(100); page.keyboard.press('Enter'); page.wait_for_timeout(300)
    page.keyboard.type('follows')
    wait_src(page, 'follows')
    check('after a formula that is all the document holds, typing goes on', re.search(r'\$y\$\s+follows', body()), body())
    # a title alone: the page had nowhere to start the text
    load_doc(page, '\\documentclass{article}\n\\title{Only a title}\n\\begin{document}\n\\maketitle\n\\end{document}\n')
    page.wait_for_timeout(200)
    r = page.evaluate('(() => { const r = document.querySelector(".page").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()')
    page.mouse.click(*r); page.keyboard.type('Below')
    wait_src(page, 'Below')
    check('under a title alone, a click on the page and typing start the first paragraph', '\\title{Only a title}' in src(page) and '\\maketitle\n\nBelow' in src(page), src(page))
    for _ in range(5): page.keyboard.press('Backspace')
    page.wait_for_timeout(150)
    r = page.evaluate('(() => { const s = [...document.querySelectorAll("#pages span.t")].find((s) => s.textContent.includes("Only a title")); const r = s.getBoundingClientRect(); return [r.right - 2, r.top + r.height / 2]; })()')
    page.mouse.click(*r); page.keyboard.type('!')
    wait_src(page, 'title!')
    check('and the title itself is still edited where it stands', '\\title{Only a title!}' in src(page), src(page))
    page.keyboard.press('Enter'); page.keyboard.type('From the title')
    wait_src(page, 'From the title')
    check('Enter in the title starts the text after \\maketitle', '\\title{Only a title!}' in src(page) and '\\maketitle\n\nFrom the title' in src(page), src(page))


def phone_layout(page):
    """The bar, the status line, Help and the PDF bar on screens as wide as phones are."""
    BAR = """() => { const W = document.documentElement.clientWidth; const box = (e) => e.getBoundingClientRect(); const vis = (e) => box(e).width > 0;
      const kids = [...document.querySelectorAll('#b-nav, #bar .brand .mark, #bar .tools > button, #bar .tools .zoom > *')].filter(vis);
      const off = kids.filter((e) => box(e).right > W + 0.5 || box(e).left < -0.5).map((e) => e.id || e.className);
      const over = [];
      for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const a = box(kids[i]), b = box(kids[j]); if (a.left < b.right - 1 && b.left < a.right - 1) over.push((kids[i].id || kids[i].className) + '~' + (kids[j].id || kids[j].className)); }
      const st = document.getElementById('status');
      return { off, over: over.filter((x) => x !== 'b-save~b-save-more'), nav: Math.round(box(document.getElementById('b-nav')).width), page: document.documentElement.scrollWidth - W,
        status: Math.round(box(st).height), pdfx: Math.round(box(document.getElementById('pdf-x')).right) - W }; }"""
    for w in (360, 390, 430, 540, 700):
        page.set_viewport_size({'width': w, 'height': 800})
        page.wait_for_timeout(250)
        m = page.evaluate(BAR)
        check('at %dpx no button of the bar lies over another or the name, or off the screen' % w, not m['off'] and not m['over'] and m['page'] <= 0 and m['nav'] >= 28, m)
        if w <= 430: check('at %dpx the status line is one line' % w, m['status'] <= 30, m['status'])
    page.set_viewport_size({'width': 360, 'height': 800})
    page.wait_for_timeout(250)
    page.evaluate('window.rikuy.togglePdf(true)')
    page.wait_for_timeout(300)
    m = page.evaluate(BAR)
    check('at 360px the PDF pane\'s close button is on the screen', m['pdfx'] <= 0, m['pdfx'])
    page.evaluate('window.rikuy.togglePdf(false)')
    check('a phone has no Help button in the bar', not page.is_visible('#b-help'))
    page.click('#b-nav')
    page.wait_for_timeout(200)
    acts = page.evaluate('[...document.querySelectorAll("#nav-acts .nav-act")].map((a) => [a.dataset.for, a.textContent.trim(), a.disabled, a.getBoundingClientRect().height])')
    bar = page.evaluate('[...document.querySelectorAll("#bar .tools button:not(.ai-only)")].map((b) => b.id)')
    check('the menu panel lists every action of the bar by name, each large enough to tap', sorted(a[0] for a in acts) == sorted(bar) and all(a[1] and a[3] >= 36 for a in acts), (acts, bar))
    check('Undo and Redo are greyed there when there is nothing to undo, and the zoom shows its value', all(a[2] for a in acts if a[0] in ('b-undo', 'b-redo')) and re.match(r'Zoom: (Fit|\d+%)$', [a[1] for a in acts if a[0] == 'zoomv'][0]), acts)
    page.click('#nav-acts [data-for=b-help]')
    page.wait_for_timeout(300)
    r = page.evaluate('(() => { const e = document.querySelector("body > .pop.pop-help"); if (!e) return null; const dd = e.querySelector(".keys dd").getBoundingClientRect(), b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), Math.round(dd.width), document.documentElement.clientWidth]; })()')
    check('so Help opens from the menu panel, which closes', r and not page.evaluate('document.body.classList.contains("nav-on")'), r)
    check('and fits the screen, its explanations in a column wide enough to read', r and r[0] >= 0 and r[1] <= r[3] and r[2] >= 150, r)
    page.keyboard.press('Escape')
    page.click('#b-nav'); page.wait_for_timeout(200)
    page.click('#nav-acts [data-for=b-src]'); page.wait_for_timeout(300)
    check('an action pressed there does what its button does', page.evaluate('document.body.classList.contains("src-on")') and not page.evaluate('document.body.classList.contains("nav-on")'))
    page.evaluate('window.rikuy.toggleSource(false)')
    page.set_viewport_size({'width': 1400, 'height': 1000})
    page.wait_for_timeout(250)
    page.evaluate('window.rikuy.toggleNav(true)')
    check('a wide screen, where the buttons carry their names, has no such list', page.is_visible('#b-help') and not page.is_visible('#nav-acts'))
    page.evaluate('window.rikuy.toggleNav(false)')
    # keyboard alone: a popover opened from a button of the bar gives the focus back to it
    back = []
    for b in ('#b-share', '#b-save-more', '#b-help'):
        page.focus(b); page.keyboard.press('Enter'); page.wait_for_timeout(250)
        opened = page.evaluate('document.querySelectorAll("body > .pop").length')
        page.keyboard.press('Escape'); page.wait_for_timeout(150)
        back.append((b, opened, page.evaluate('document.querySelectorAll("body > .pop").length'), page.evaluate('"#" + document.activeElement.id')))
    check('Escape closes Share, Save and Help and the focus returns to their buttons', all(o == 1 and c == 0 and a == b for b, o, c, a in back), back)


def first_visit(p):
    """Someone who has never been here sees the page alone, at a size they can read; what they
    choose is kept; someone who was here before the page opened this way keeps the source pane."""
    browser = p.chromium.launch()
    try:
        def visit(ctx):
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            page.goto('https://rikuy.test/')
            page.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=20000)
            page.wait_for_timeout(300)
            return page
        dist = os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist')
        doc = SKELETON_HEAD + open(os.path.join(dist, 'rikuy.html'), encoding='utf8').read() + '</body></html>'

        def serve(route):
            url = route.request.url
            if url in ROUTES: return route.fulfill(status=200, content_type='application/javascript', headers={'Access-Control-Allow-Origin': '*'}, body=open(ROUTES[url], 'rb').read())
            if url == 'https://rikuy.test/': return route.fulfill(status=200, content_type='text/html; charset=utf-8', body=doc)
            f = os.path.join(dist, url[len('https://rikuy.test/'):].split('?')[0]) if url.startswith('https://rikuy.test/') else ''
            return route.fulfill(status=200, content_type='text/javascript', body=open(f, 'rb').read()) if f and os.path.isfile(f) else route.abort()
        on = 'document.body.classList.contains("src-on")'
        ctx = browser.new_context(viewport={'width': 1400, 'height': 900}); ctx.route('**/*', serve)
        page = visit(ctx)
        check('a first visit on a wide screen shows the page without the source pane', not page.evaluate(on) and page.is_visible('#b-src'))
        page.click('#b-help'); page.wait_for_timeout(200)
        first = page.evaluate('document.querySelector(".pop-help p").textContent')
        check('Help starts by saying what Rikuy is, before any word about LaTeX source', first.startswith('Rikuy is a writing app for papers') and 'source' not in first, first)
        page.keyboard.press('Escape')
        page.reload(); page.wait_for_function('window.rikuy && document.getElementById("boot").hidden'); page.wait_for_timeout(300)
        check('a second visit with nothing chosen is the same', not page.evaluate(on))
        page.click('#b-src'); page.wait_for_timeout(300)
        page.reload(); page.wait_for_function('window.rikuy && document.getElementById("boot").hidden'); page.wait_for_timeout(500)
        check('the Source button opens the pane and the choice is kept', page.evaluate(on))
        # here before the change: a project kept in this browser, no settings ever written
        click_text(page, 'Click anywhere'); page.keyboard.type('Mine. '); page.wait_for_timeout(1200)
        page.evaluate('localStorage.removeItem(Object.keys(localStorage).find((k) => /pref/i.test(k)))')
        page.reload(); page.wait_for_function('window.rikuy && document.getElementById("boot").hidden'); page.wait_for_timeout(500)
        check('someone with a document kept and no settings keeps the source pane of a wide screen', page.evaluate(on) and 'Mine. ' in src(page), page.evaluate('Object.keys(localStorage)'))
        ctx.close()
        for w in (360, 390, 430):
            ctx = browser.new_context(viewport={'width': w, 'height': 800}, has_touch=True, is_mobile=True); ctx.route('**/*', serve)
            page = visit(ctx)
            m = page.evaluate('(() => { const d = document.getElementById("desk"), r = document.querySelector("#pages .it.p").getBoundingClientRect(); return { font: parseFloat(getComputedStyle(document.querySelector("#pages .it.p")).fontSize), left: r.left, right: r.right, w: d.clientWidth, label: document.getElementById("zoomv").textContent, src: ' + on + ' }; })()')
            check('a first visit on a %dpx phone opens with the text block across the screen, not the sheet' % w, m['font'] > 7.5 and m['left'] >= 0 and m['right'] <= m['w'] and m['right'] - m['left'] > m['w'] - 30 and not m['src'], m)
            # what is stored must be a zoom the version before this one can read (it multiplies
            # anything but 'fit'): after a rollback its page would have no size
            z = page.evaluate('JSON.parse(localStorage.getItem("galley.prefs.v1")).zoom')
            check('the settings kept on a %dpx first visit hold a zoom the previous version reads' % w, z == 'fit' or isinstance(z, (int, float)), z)
            if w == 390:
                seen = []
                for _ in range(3):
                    page.tap('#zoomv'); page.wait_for_timeout(300); seen.append(page.inner_text('#zoomv'))
                check('the zoom button there goes to actual size, the whole sheet, and back', seen[0] == '100%' and seen[1] == 'Fit' and seen[2] == m['label'], seen)
                page.tap('#zoomv'); page.tap('#zoomv'); page.wait_for_timeout(300)
                z = page.evaluate('JSON.parse(localStorage.getItem("galley.prefs.v1")).zoom')
                page.reload(); page.wait_for_function('window.rikuy && document.getElementById("boot").hidden'); page.wait_for_timeout(300)
                check('the whole sheet, once chosen, is kept too, under a zoom the previous version reads', page.inner_text('#zoomv') == 'Fit' and z == 'fit', (page.inner_text('#zoomv'), z))
                page.tap('#zoomv'); page.wait_for_timeout(300)
                page.tap('#zoomv'); page.wait_for_timeout(300)
                page.reload(); page.wait_for_function('window.rikuy && document.getElementById("boot").hidden'); page.wait_for_timeout(300)
                check('and a zoom that was chosen is the one the next visit opens with', page.inner_text('#zoomv') == '100%', page.inner_text('#zoomv'))
            ctx.close()
    finally:
        browser.close()


def select_all(page):
    """Select all, then Delete, typing, cut or paste: the body is replaced as New document would
    leave it, the preamble stays, and one undo brings every byte back."""
    base = src(page)
    pre = base[:base.find('\\begin{document}') + len('\\begin{document}')]
    body = lambda: src(page)[len(pre):] if src(page).startswith(pre) else None
    click_text(page, 'Click anywhere'); page.keyboard.press('Control+a'); page.keyboard.press('Delete'); page.wait_for_timeout(300)
    check('select all, Delete leaves a blank body and the preamble as it was', body() == '\n\n\\end{document}\n', body())
    check('with the blank paragraph ready for typing', page.evaluate('!!(window.rikuy.ghost && window.rikuy.ghost.sticky)') and page.evaluate('(window.rikuy.caretNow() || {}).ghost === true') and page.evaluate('document.querySelectorAll("#pages .it:not(.ghostp)").length') == 0)
    page.keyboard.type('Fresh start'); wait_src(page, 'Fresh start')
    check('and typing starts the new text', (body() or '').split() == ['Fresh', 'start', '\\end{document}'], body())
    page.keyboard.press('Control+z'); page.keyboard.press('Control+z'); page.wait_for_timeout(300)
    check('undo brings the whole document back byte for byte', src(page) == base)
    click_text(page, 'Click anywhere'); page.keyboard.press('Control+a'); page.keyboard.type('Z'); wait_src(page, '\n\nZ\n\n')
    one = body()
    page.keyboard.press('Control+z'); page.wait_for_timeout(300)
    check('typing over a selection of everything replaces the body, in one undo step', one == '\n\nZ\n\n\\end{document}\n' and src(page) == base, one)
    click_text(page, 'Click anywhere'); page.keyboard.press('Control+a')
    page.evaluate("""() => { const dt = new DataTransfer(); dt.setData('text/plain', 'First pasted.\\n\\nSecond pasted.');
      document.getElementById('pages').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }""")
    wait_src(page, 'Second pasted.')
    one = body()
    page.keyboard.press('Control+z'); page.wait_for_timeout(300)
    check('a paste over everything becomes the body, its paragraphs kept', one == '\n\nFirst pasted.\n\nSecond pasted.\n\n\\end{document}\n' and src(page) == base, one)
    select_text(page, 'paragraph'); page.keyboard.press('Delete'); page.wait_for_timeout(200)
    check('a selection of less than everything deletes as before', 'in this  and start typing' in src(page) and '\\section{How to use it}' in src(page))
    page.keyboard.press('Control+z'); page.wait_for_timeout(200)
    # Only Select all is "everything". A selection from the first word to the last can leave
    # blocks with no text outside it (a picture, an equation, a listing): they must stay.
    DOC = ('\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\n\\begin{equation}\n  x = 1\n\\end{equation}\n\n'
           'The only sentence here.\n\n\\begin{verbatim}\ncode stays\n\\end{verbatim}\n\n\\begin{center}\n\\includegraphics[width=0.8\\linewidth]{shot.png}\n\\end{center}\n\\end{document}\n')
    load_doc(page, DOC)
    select_text(page, 'The only sentence here.'); page.wait_for_timeout(100)
    page.keyboard.type('B'); page.wait_for_timeout(300)
    check('a sentence selected from its first word to its last and typed over leaves the picture, the equation and the listing', src(page) == DOC.replace('The only sentence here.', 'B'), src(page))
    page.keyboard.press('Control+z'); page.wait_for_timeout(200)
    r = page.evaluate('(() => { const s = [...document.querySelectorAll("#pages span.t")].find((s) => s.textContent.includes("The only sentence")); const r = s.getBoundingClientRect(); return [r.left + 30, r.top + r.height / 2]; })()')
    page.mouse.click(r[0], r[1], click_count=3); page.wait_for_timeout(150)
    page.keyboard.press('Delete'); page.wait_for_timeout(300)
    s = src(page)
    check('the same with a triple click and Delete', all(x in s for x in ('x = 1', 'code stays', '\\includegraphics[width=0.8\\linewidth]{shot.png}')) and 'only sentence' not in s, s)
    load_doc(page, DOC)
    click_text(page, 'The only sentence'); page.keyboard.press('Control+a'); page.wait_for_timeout(100)
    click_text(page, 'The only sentence', 4); page.wait_for_timeout(100)
    select_text(page, 'The only sentence here.'); page.wait_for_timeout(100)
    page.keyboard.press('Delete'); page.wait_for_timeout(300)
    check('a Select all given up for another selection no longer counts', 'code stays' in src(page) and 'x = 1' in src(page), src(page))
    load_doc(page, DOC)
    click_text(page, 'The only sentence'); page.keyboard.press('Control+a'); page.keyboard.press('Delete'); page.wait_for_timeout(300)
    check('Select all itself still takes every block', src(page) == '\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\n\n\\end{document}\n', src(page))
    # the body is the parser's: no \end{document}, and the preamble is not what gets replaced
    for label, doc in (('with no \\end{document}', '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nWords with no end.\n'),
                       ('with \\end {document} spaced', '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nWords with an end.\n\\end {document}\n'),
                       ('with no preamble at all', 'Only words here.\n\nAnd a second paragraph.\n')):
        load_doc(page, doc)
        click_text(page, 'ords'); page.keyboard.press('Control+a'); page.keyboard.type('N'); page.wait_for_timeout(300)
        s = src(page)
        pre = doc[:doc.find('\\begin{document}') + 16] if '\\begin{document}' in doc else ''
        check('Select all and typing %s keeps everything before the text' % label, s.startswith(pre) and 'N' in s[len(pre):] and 'ords' not in s, s)
    doc = '\\documentclass{article}\n% moved from below: \\begin{document}\n\\usepackage{amsmath}\n\\newcommand{\\R}{\\mathbb{R}}\n\\begin{document}\nBody words.\n\\end{document}\n'
    load_doc(page, doc)
    click_text(page, 'Body words'); page.keyboard.press('Control+a'); page.keyboard.press('Delete'); page.wait_for_timeout(300)
    check('a comment in the preamble that names \\begin{document} is not where the body starts', src(page) == doc.replace('\nBody words.\n', '\n\n'), src(page))


def formula_mistakes(page):
    """A mistake in a formula's source box is said in plain words, with KaTeX's own as the
    tooltip; text that would not stay a formula (an unclosed brace) is not written into the
    document, so the paragraph around it stays as it was."""
    base = src(page)
    page.click('.a-math >> nth=0')
    page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000)
    ERR = '(() => { const e = document.querySelector(".pop-math .pv-err"); return e && !e.hidden ? [e.textContent, e.title] : null; })()'

    def typed(v):
        # the source box's text set as typing sets it; page.fill at times lost it to the math
        # field, which takes the focus back while it settles
        page.evaluate('(v) => { const ta = document.querySelector(".pop-math textarea"); ta.focus(); ta.value = v; ta.dispatchEvent(new Event("input", { bubbles: true })); }', v)
        page.wait_for_timeout(350)
        return page.evaluate(ERR)
    e = typed('\\frac{a}{b')
    check('an unclosed brace is named in plain words, KaTeX\'s own in the tooltip', e and e[0].startswith('A { is not closed.') and 'Unexpected end of input' in e[1], e)
    check('and is not written into the document: the paragraph stays as it was', src(page) == base and page.evaluate('document.querySelectorAll("#pages .a-chip.err, #pages .merr").length') == 0, src(page)[src(page).find('Click $'):][:60])
    e = typed('a}')
    check('a brace too many is held back the same way', e and e[0].startswith('A } has no { before it.') and src(page) == base, e)
    for v, want in (('x^', 'Something is missing after ^.'), ('\\foo + 1', 'This command is not known: \\foo'), ('5 # x', '# cannot stand here: write \\# for the sign.'),
                    ('\\left( x', '\\left has no \\right to close it.'), ('\\frac', 'Something is missing after \\frac.'), ('x^2^3', 'Two ^ in a row: put the first in braces, as in {x^2}^3.')):
        e = typed(v)
        check('%s: "%s"' % (v, want), e and e[0] == want and e[1] and e[1] != want, e)
    wait_src(page, '$x^2^3$')
    check('a mistake that stays inside the formula is still written, as before', '$x^2^3$' in src(page))
    e = typed('\\frac{a}{b}')
    wait_src(page, '$\\frac{a}{b}$')
    check('put right, the formula is written and the message goes', e is None and '$\\frac{a}{b}$' in src(page), e)
    # What was typed is never lost: closed with a brace open, the box writes the text with the
    # missing braces added, and undo has a step for it.
    typed('\\frac{a}{b}+{c')
    page.focus('.pop-math textarea'); page.keyboard.press('Enter'); page.wait_for_timeout(300)
    check('Enter with a brace open closes the box and writes the formula with the brace closed', '$\\frac{a}{b}+{c}$' in src(page) and page.evaluate('document.querySelectorAll("body > .pop").length') == 0 and page.evaluate('document.querySelectorAll("#pages .a-chip.err, #pages .merr").length') == 0, src(page)[src(page).find('Click $'):][:60])
    page.keyboard.press('Control+z'); page.wait_for_timeout(300)
    check('and one undo takes back what the box wrote, as for any formula box', src(page) == base, src(page)[src(page).find('Click $'):][:60])
    page.click('.a-math >> nth=0')
    page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000)
    typed('\\sqrt{x')
    r = page.evaluate('(() => { const s = [...document.querySelectorAll("#pages span.t")].find((s) => s.textContent.includes("Editing in Print")); const r = s.getBoundingClientRect(); return [r.left + 10, r.top + r.height / 2]; })()')
    page.mouse.click(*r); page.wait_for_timeout(300)
    check('a click on the page with a brace open keeps what was typed, the brace closed', '$\\sqrt{x}$' in src(page) and page.evaluate('document.querySelectorAll("body > .pop").length') == 0, src(page)[src(page).find('Click $'):][:60])
    page.click('.a-math >> nth=0')
    page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000)
    typed('y^2}')
    page.focus('.pop-math textarea'); page.keyboard.press('Enter'); page.wait_for_timeout(300)
    check('Enter with a brace too many keeps the box open with its message', page.evaluate('document.querySelectorAll("body > .pop.pop-math").length') == 1 and (page.evaluate(ERR) or [''])[0].startswith('A } has no { before it.') and '$\\sqrt{x}$' in src(page), page.evaluate(ERR))
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    check('and Escape then keeps every character typed, in a formula that is whole', '${y^2}$' in src(page) and page.evaluate('document.querySelectorAll("body > .pop").length') == 0, src(page)[src(page).find('Click $'):][:60])
    # a new formula: nothing is put into the text while a brace is open, all of it when the box closes
    click_text(page, 'References follow'); page.keyboard.type('$')
    page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000)
    before = src(page)
    e = typed('x^{2')
    check('a new formula with a brace open is not put into the text while it is typed', e and e[0] == 'A { is not closed.' and src(page) == before, e)
    page.focus('.pop-math textarea'); page.keyboard.press('Escape'); page.wait_for_timeout(300)
    check('and closing its box then puts it there, the brace closed', '$x^{2}$References' in src(page), src(page)[src(page).find('References') - 12:][:40])
    # a new numbered equation given up with nothing typed leaves nothing behind
    before = src(page)
    click_text(page, 'The page and the source never disagree'); page.keyboard.press('Control+Shift+e')
    page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000)
    made = src(page) != before and '\\begin{equation}\n  \n\\end{equation}' in src(page)
    page.focus('.pop-math textarea'); page.keyboard.press('Escape'); page.wait_for_timeout(300)
    check('a new numbered equation closed empty leaves no empty equation in the text', made and src(page) == before, src(page)[src(page).find('The page and the source') - 60:][:90])
    click_text(page, 'The page and the source never disagree'); page.keyboard.press('Control+Shift+e')
    page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000)
    typed('E = m c^{2')
    page.mouse.click(*r); page.wait_for_timeout(300)
    check('typed into and left with a brace open, it keeps the formula, the brace closed', re.search(r'\\begin\{equation\}\s+E = m c\^\{2\}\s+\\end\{equation\}', src(page)), src(page)[src(page).find('The page and the source') - 70:][:100])
    # a backslash left at the end would take the closing brace (or the formula's closing $) with
    # it: it is held like an open brace, and dropped when the box closes
    page.evaluate('window.rikuy.doReset()'); page.wait_for_timeout(600)
    base = src(page)
    red = 'document.querySelectorAll("#pages .a-chip.err, #pages .merr").length'
    page.click('.a-math >> nth=0')
    page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000)
    e = typed('x^{2}\\')
    check('a backslash at the end is not written while it is typed', e and src(page) == base, e)
    typed('x^{2\\')
    page.focus('.pop-math textarea'); page.keyboard.press('Escape'); page.wait_for_timeout(300)
    check('x^{2\\ and Escape: the formula is written whole, with no \\} and nothing red on the page', '$x^{2}$' in src(page) and '\\}' not in src(page)[src(page).find('Click $'):][:20] and page.evaluate(red) == 0, src(page)[src(page).find('Click $'):][:40])
    page.keyboard.press('Control+z'); page.wait_for_timeout(300)
    page.click('.a-math >> nth=0')
    page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000)
    typed('x\\\\')
    page.focus('.pop-math textarea'); page.keyboard.press('Escape'); page.wait_for_timeout(300)
    check('two backslashes at the end are a line break and stay', '$x\\\\$' in src(page), src(page)[src(page).find('Click $'):][:40])
    page.keyboard.press('Control+z'); page.wait_for_timeout(300)
    click_text(page, 'References follow'); page.keyboard.type('$')
    page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000)
    n = page.evaluate('window.rikuy.hist.length')
    typed('\\frac{a}{\\')
    page.focus('.pop-math textarea'); page.keyboard.press('Escape'); page.wait_for_timeout(300)
    check('a new formula \\frac{a}{\\ and Escape: the text is kept, whole, with an undo step', '$\\frac{a}{}$References' in src(page) and page.evaluate('window.rikuy.hist.length') == n + 1 and page.evaluate(red) == 0, src(page)[src(page).find('References') - 16:][:40])
    page.keyboard.press('Control+z'); page.wait_for_timeout(300)
    check('and undo takes it out', src(page) == base)
    # a new numbered equation given up empty: undo is as it was before it
    click_text(page, 'References follow', 3); page.keyboard.type('Q'); page.wait_for_timeout(2200)
    mark, n = src(page), page.evaluate('window.rikuy.hist.length')
    click_text(page, 'The page and the source never disagree'); page.keyboard.press('Control+Shift+e')
    page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000)
    page.focus('.pop-math textarea'); page.keyboard.press('Escape'); page.wait_for_timeout(300)
    check('an empty new equation given up leaves the undo history as it was', src(page) == mark and page.evaluate('window.rikuy.hist.length') == n, (page.evaluate('window.rikuy.hist.length'), n))
    page.keyboard.press('Control+z'); page.wait_for_timeout(300)
    check('so the next undo takes back the typing before it, not an empty equation', src(page) == base and '\\begin{equation}\n  \n\\end{equation}' not in src(page), src(page)[src(page).find('References') - 5:][:30])
    page.keyboard.press('Control+Shift+z'); page.wait_for_timeout(300)
    check('and redo brings that typing back, not the equation', src(page) == mark)

def run():
    with sync_playwright() as p:
        browser, page, errors = open_page(p)
        t = page.evaluate('window.rikuy.lastMs')
        npages = page.evaluate('document.querySelectorAll(".page").length')
        check('renders pages', npages >= 2, npages)
        check('initial build time < 1500ms', t < 1500, t)
        page.screenshot(path=SHOTS + '/01-initial.png')
        # overflow check: content within text body
        over = page.evaluate('''() => [...document.querySelectorAll('.page')].map((pg,i) => {
          const pb = pg.querySelector('.pb').getBoundingClientRect();
          const fl = pg.querySelector('.flow').getBoundingClientRect();
          const fn = pg.querySelector('.fns');
          const fr = fn && !fn.hidden ? fn.getBoundingClientRect() : null;
          return {i, over: Math.round(fl.bottom - (fr ? fr.top : pb.bottom)), pb: Math.round(pb.height)}; })''')
        check('no page overflows its text block', all(o['over'] <= 3 for o in over), over)

        base = src(page)
        # 1. typing inside a paragraph
        click_text(page, 'Click anywhere in this paragraph', 5)
        page.keyboard.type('XY')
        s1 = src(page)
        check('type inserts at mapped offset', 'ClickXY anywhere in this paragraph' in s1, s1[s1.find('Click'):s1.find('Click')+40])
        page.keyboard.type('%&_')
        s2 = src(page)
        check('specials are escaped', 'ClickXY\\%\\&\\_ anywhere' in s2, s2[s2.find('ClickXY'):s2.find('ClickXY')+30])
        for _ in range(5):
            page.keyboard.press('Backspace')
        s3 = src(page)
        check('backspace removes whole escapes', s3 == base, s3[s3.find('Click'):s3.find('Click')+40])

        # 2. bold toggle
        select_text(page, 'start typing')
        page.keyboard.press('Control+b')
        s4 = src(page)
        check('ctrl+b wraps selection', '\\textbf{start typing}' in s4, s4[s4.find('start')-10:s4.find('start')+30])
        page.keyboard.press('Control+b')
        s5 = src(page)
        check('ctrl+b again unwraps', s5 == base, s5[s5.find('start')-10:s5.find('start')+30])

        # 3. undo / redo
        click_text(page, 'Rikuy escapes special characters', 5)
        page.keyboard.type(' happily')
        check('typed word', 'Rikuy happily escapes' in src(page))
        page.keyboard.press('Control+z')
        check('undo restores', src(page) == base, src(page)[src(page).find('Rikuy escapes')-5:][:40])
        page.keyboard.press('Control+Shift+z')
        check('redo reapplies', 'Rikuy happily escapes' in src(page))
        page.keyboard.press('Control+z')

        # 4. enter splits paragraph
        click_text(page, 'Press', 0)
        page.keyboard.press('Enter')
        s6 = src(page)
        check('enter splits paragraph', '\n\nPress \\key{Enter}' in s6, s6[s6.find('Press')-20:s6.find('Press')+10])
        page.keyboard.press('Backspace')
        s7 = src(page)
        check('backspace at paragraph start merges', '\n\nPress \\key{Enter}' not in s7 and 'Press \\key{Enter}' in s7, s7[s7.find('Press')-20:s7.find('Press')+10])
        page.keyboard.press('Control+z'); page.keyboard.press('Control+z')
        check('undo twice back to base', src(page) == base)

        # 5. math popover
        page.click('.a-math >> nth=0')
        page.wait_for_selector('.pop-math textarea')
        # the math field takes the focus when it arrives: filled a moment before, the source box
        # lost the rest of its text to the field
        page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000)
        page.fill('.pop-math textarea', '\\alpha + \\beta = \\delta')
        wait_src(page, '$\\alpha + \\beta = \\delta$')
        s8 = src(page)
        check('math popover edits source live', '$\\alpha + \\beta = \\delta$' in s8, s8[s8.find('Click $'):][:50])
        page.keyboard.press('Enter')
        page.wait_for_timeout(100)
        check('popover closes on enter', page.evaluate('!document.querySelector(".pop")'))
        page.keyboard.press('Control+z')
        check('undo math edit', src(page) == base, src(page)[src(page).find('Click $'):][:50])

        # 6. display math popover + env switch
        page.click('.it.dm >> nth=0')
        page.wait_for_selector('.pop-math textarea')
        page.select_option('#pop-env', 'equation*')
        page.wait_for_timeout(300)
        s9 = src(page)
        check('display env switch', '\\begin{equation*}' in s9 and '\\end{equation*}' in s9, s9[s9.find('\\begin{equation'):][:40])
        page.keyboard.press('Escape')
        page.keyboard.press('Control+z')
        check('undo env switch', src(page) == base)

        # 7. selection across markup keeps it balanced
        page.evaluate('''() => {
          const a = [...document.querySelectorAll('#pages span.t')].find(s => s.textContent.includes('The round trip'));
          const b = [...document.querySelectorAll('#pages span.t')].find(s => s.textContent.includes('The page and the source'));
          const r = document.createRange(); r.setStart(a.firstChild, 4); r.setEnd(b.firstChild, 9);
          document.getElementById('pages').focus(); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }''')
        page.keyboard.press('Backspace')
        s10 = src(page)
        check('cross-structure delete keeps markup', '\\section{The }\\label{sec:roundtrip}' in s10 and 'and the source never' in s10, s10[s10.find('\\section{The'):][:80])
        page.keyboard.press('Control+z')
        check('undo cross delete', src(page) == base)

        # 8. footnote edit
        click_text(page, 'edit this footnote', 4)
        page.keyboard.type('!')
        check('footnote text editable', 'edit!' in src(page) and '\\footnote{Try it: edit! this footnote' in src(page), src(page)[src(page).find('footnote{'):][:50])
        page.keyboard.press('Control+z')

        # 9. table cell edit
        click_text(page, 'New inline math', 3)
        page.keyboard.type('Z')
        check('table cell editable', 'NewZ inline math' in src(page))
        page.keyboard.press('Control+z')

        # 10. heading edit
        click_text(page, 'How to use it', 3)
        page.keyboard.type('!')
        check('heading editable', '\\section{How! to use it}' in src(page))
        page.keyboard.press('Control+z')

        # 11. theorem optional title edit
        click_text(page, 'Minimal patches', 7)
        page.keyboard.type('!')
        check('theorem title editable', '[Minimal! patches]' in src(page))
        page.keyboard.press('Control+z')

        # 12. title edit (preamble)
        click_text(page, 'Editing in Print', 7)
        page.keyboard.type('X')
        check('title in preamble editable', '\\title{EditingX in Print}' in src(page), src(page)[src(page).find('\\title'):][:30])
        page.keyboard.press('Control+z')

        # 13. macro argument editable
        click_text(page, 'Ctrl+B', 4)
        page.keyboard.type('Q')
        check('macro arg editable', '\\key{CtrlQ+B}' in src(page), src(page)[src(page).find('\\key'):][:20])
        page.keyboard.press('Control+z')

        # 14. list item enter
        click_text(page, 'between visits', 15)
        page.keyboard.press('Enter')
        page.keyboard.type('New item')
        s11 = src(page)
        check('enter in list adds item', 'between visits.\n  \\item New item' in s11, s11[s11.find('between visits'):][:40])
        page.keyboard.press('Control+z')
        page.keyboard.press('Control+z')
        check('undo list', src(page) == base, src(page)[src(page).find('between visits'):][:40])

        # 15. enter at end of paragraph -> ghost, then type
        click_text(page, 'edited by hand.', 15)
        page.keyboard.press('Enter')
        page.keyboard.type('Fresh paragraph.')
        s12 = src(page)
        check('ghost paragraph inserts clean source', 'edited by hand.\n\nFresh paragraph.\n\n\\section{Citations' in s12, s12[s12.find('by hand.'):][:60])
        page.keyboard.press('Control+z')
        check('undo ghost', src(page) == base, src(page)[src(page).find('by hand.'):][:60])

        # 16. typing speed
        click_text(page, 'The page and the source never disagree', 3)
        t0 = time.time()
        page.keyboard.type('abcdefghij', delay=0)
        dt = (time.time() - t0) / 10 * 1000
        check('per keystroke latency < 120ms', dt < 120, round(dt, 1))
        for _ in range(10):
            page.keyboard.press('Backspace')
        check('cleanup after speed test', src(page) == base)

        # 17. cite popover opens & lists entries
        page.click('.a-cite >> nth=0')
        page.wait_for_selector('.pop-cite')
        n = page.evaluate('document.querySelectorAll(".pop-cite .pitem").length')
        check('cite popover lists bib entries', n >= 3, n)
        page.keyboard.press('Escape')

        # 18. ref popover
        page.click('.a-ref >> nth=0')
        page.wait_for_selector('.pop-ref')
        n = page.evaluate('document.querySelectorAll(".pop-ref .pitem").length')
        check('ref popover lists labels', n >= 5, n)
        page.keyboard.press('Escape')

        # 18b. Enter on an equation that Backspace selected opens it, and changes nothing
        click_text(page, ' to edit its source', 0)
        page.keyboard.press('Backspace')
        page.keyboard.press('Enter')
        page.wait_for_timeout(200)
        check('Enter on a selected equation opens it', page.evaluate('!!document.querySelector(".pop-math")') and src(page) == base)
        page.keyboard.press('Escape')
        page.wait_for_timeout(100)
        check('closing it leaves the source alone', src(page) == base)

        # 19. source pane opens and syncs
        if not page.evaluate("document.body.classList.contains('src-on')"):
            page.click('#b-src')
        page.wait_for_selector('#cmhost .CodeMirror', timeout=5000)
        page.wait_for_timeout(200)
        cmv = page.evaluate('window.rikuy.cm.getValue()')
        check('source pane shows main.tex', cmv == src(page))
        click_text(page, 'Math is an object', 4)
        page.keyboard.type('W')
        page.wait_for_timeout(100)
        check('page edit mirrors into source pane', page.evaluate('window.rikuy.cm.getValue()') == src(page) and 'MathW' in src(page))
        page.keyboard.press('Control+z')
        page.evaluate('''() => { const cm = window.rikuy.cm; const d = cm.getDoc(); const i = d.getValue().indexOf('Math is an object'); d.replaceRange('Algebra ', d.posFromIndex(i)); }''')
        page.wait_for_timeout(600)
        has = page.evaluate('[...document.querySelectorAll("#pages span.t")].some(s => s.textContent.includes("Algebra Math is"))')
        check('source edit re-typesets page', has)
        page.screenshot(path=SHOTS + '/02-source.png')
        page.keyboard.press('Control+z')
        page.wait_for_timeout(300)
        # typing in the source and undoing at once: the typing goes, nothing older does
        click_text(page, 'Math is an object', 4)
        page.keyboard.type('Q')
        page.wait_for_timeout(2100)
        page.evaluate('''() => { const cm = window.rikuy.cm; const d = cm.getDoc(); const i = d.getValue().indexOf('The round trip'); cm.focus(); d.setCursor(d.posFromIndex(i + 3)); }''')
        page.keyboard.type('XYZ')
        page.keyboard.press('Control+z')
        page.wait_for_timeout(400)
        check('Ctrl+Z right after typing in the source undoes that typing only', 'MathQ is' in src(page) and 'XYZ' not in src(page) and page.evaluate('window.rikuy.cm.getValue()') == src(page))
        page.evaluate('''() => { const cm = window.rikuy.cm; const d = cm.getDoc(); const i = d.getValue().indexOf('The round trip'); cm.focus(); d.setCursor(d.posFromIndex(i + 3)); }''')
        page.keyboard.type('UVW')
        box = page.evaluate('''() => { const s = [...document.querySelectorAll('#pages span.t')].find(x => x.textContent.includes('Citations come from')); s.scrollIntoView({block: 'center'}); const r = document.createRange(); r.setStart(s.firstChild, 3); r.setEnd(s.firstChild, 4); const b = r.getBoundingClientRect(); return [b.left + 1, b.top + b.height / 2]; }''')
        page.mouse.click(box[0], box[1])
        page.keyboard.type('P')
        check('typing in the source, then at once on the page, keeps both', 'TheUVW round' in src(page) and 'CitPations' in src(page), src(page)[src(page).find('Citations') - 4:][:20])
        undo_all(page)
        check('and undo gives the bytes back', src(page) == base)
        # Tab indents in the source pane; Escape, then Tab, leaves it without typing anything
        page.evaluate('() => { const cm = window.rikuy.cm; cm.focus(); cm.setCursor({line: 0, ch: 0}); }')
        page.keyboard.press('Escape'); page.keyboard.press('Tab')
        page.wait_for_timeout(400)
        check('Escape, then Tab, leaves the source pane and types nothing', src(page) == base and not page.evaluate("!!document.activeElement.closest('#srcpane')"), page.evaluate('document.activeElement.className'))
        edges(page, errors)
        popovers(page)
        hidden_deletes(page)
        default_macros(page)
        skipped_args(page)

        check('no console errors', not errors, errors[:5])
        browser.close()

        # Mobile and dark
        browser, page, errors = open_page(p, width=390, height=844, dark=True)
        page.screenshot(path=SHOTS + '/03-mobile-dark.png')
        sw = page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
        check('no horizontal page scroll on phone', sw <= 0, sw)
        page.click('#zoomv')
        page.wait_for_timeout(300)
        r = page.evaluate('''() => { const d = document.getElementById('desk'); d.scrollLeft = 0; const pg = document.querySelector('.page').getBoundingClientRect(); return [document.getElementById('zoomv').textContent, Math.round(pg.left - d.getBoundingClientRect().left), d.scrollWidth - d.clientWidth]; }''')
        check('on a phone the Fit button switches to actual size', r[0] == '100%', r)
        check('a page wider than the window starts at its left edge and scrolls', r[1] >= 0 and r[2] > 0, r)
        page.set_viewport_size({'width': 900, 'height': 700})
        page.wait_for_timeout(300)
        over = page.evaluate('''() => { const m = document.querySelector('.brand .mark').getBoundingClientRect(); const b = document.getElementById('b-open').getBoundingClientRect(); return [Math.round(m.right), Math.round(b.left)]; }''')
        check('the name and the buttons do not overlap at 900px', over[0] <= over[1], over)
        check('no console errors (mobile)', not errors, errors[:5])
        browser.close()

        # Two tabs on the project, switching between them; a tab hidden then killed
        browser, A, errors = open_page(p, width=1200, height=800)
        def tab():
            t = A.context.new_page()
            t.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
            t.goto('https://rikuy.test/')
            t.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=20000)
            t.wait_for_timeout(300)
            return t
        def vis(t, state):
            t.evaluate('''(s) => { Object.defineProperty(document, 'visibilityState', {value: s, configurable: true}); document.dispatchEvent(new Event('visibilitychange')); }''', state)
            t.wait_for_timeout(300)
        B = tab()
        vis(B, 'hidden')
        click_text(A, 'Click anywhere in this paragraph', 5)
        A.keyboard.type('AAA')
        vis(A, 'hidden'); vis(B, 'visible')
        check('a tab brings in what another tab typed when it is shown', 'ClickAAA' in src(B))
        click_text(B, 'Math is an object', 4)
        B.keyboard.type('BBB')
        vis(B, 'hidden'); vis(A, 'visible')
        check('and back again, keeping its own', 'MathBBB' in src(A) and 'ClickAAA' in src(A))
        A.wait_for_timeout(900)
        C = tab()
        click_text(C, 'start typing', 3)
        C.keyboard.type('CCC')
        C.wait_for_timeout(1000)
        B.close(run_before_unload=True)  # B changed nothing since it last saved
        D = tab()
        check('closing a tab that changed nothing keeps what another tab saved', 'staCCCrt typing' in src(D) and 'ClickAAA' in src(D) and 'MathBBB' in src(D))
        # both visible (side by side): A types without having seen C's text
        click_text(A, 'Rikuy escapes', 3)
        A.keyboard.type('Z')
        A.wait_for_timeout(1200)
        vs = A.evaluate('window.rikuy.allSnaps().then(async vs => { for (const v of vs) { const f = new Map(await window.rikuy.versionFiles(v) || []); if (v.label === "From another tab" && (f.get("main.tex") || "").includes("staCCCrt")) return true; } return false; })')
        check('a tab that writes over another tab\'s text keeps that text as a version', vs)
        # a phone hides the page, then kills it without unload
        click_text(D, 'MathBBB is an object', 0)
        D.keyboard.type('V')
        vis(D, 'hidden')
        D.close()
        E = tab()
        check('a keystroke just before the page is hidden and killed is kept', 'VMathBBB' in src(E), src(E)[src(E).find('MathBBB') - 3:][:20])
        # pruning keeps the newest version of every project
        E.evaluate('''async () => { const g = window.rikuy; const n = g.name; g.name = 'Another project'; await g.snapshot('', {force: true}); g.name = n; for (let i = 0; i < 85; i++) { g.files.set('main.tex', g.files.get('main.tex') + ' '); await g.snapshot('', {force: true}); } await new Promise(r => setTimeout(r, 500)); g.snapList = null; }''')
        names = E.evaluate('window.rikuy.allSnaps().then(vs => vs.map(v => v.name))')
        check('pruning versions keeps the last one of a project no longer open', 'Another project' in names and len(names) <= 82, len(names))
        # an edit made just before a quick navigation away (a link followed, a bookmark)
        click_text(E, 'Rikuy escapes', 0)
        E.keyboard.type('W')
        E.goto('about:blank')
        E.goto('https://rikuy.test/')
        E.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=20000)
        check('an edit made just before navigating away is kept', 'WRikuy escapes' in src(E), src(E)[src(E).find('Rikuy escapes') - 3:][:20])
        check('no console errors (tabs)', not errors, errors[:5])
        browser.close()

        browser, page, errors = open_page(p)
        formula_mistakes(page)
        check('no console errors (formula mistakes)', not errors, errors[:5])
        browser.close()

        browser, page, errors = open_page(p)
        select_all(page)
        check('no console errors (select all)', not errors, errors[:5])
        browser.close()

        browser, page, errors = open_page(p)
        first_words(page)
        check('no console errors (first words)', not errors, errors[:5])
        browser.close()

        browser, page, errors = open_page(p, width=390, height=844)
        phone_layout(page)
        browser.close()

        first_visit(p)

        # on a page of its own, so nothing above meets the PDF pane
        browser, page, errors = open_page(p)
        pdfjs_local(page, 'https://rikuy.test/')
        # why TeX did not start: build instructions for a page built without its TeX tree, what
        # to do for a visitor whose download of it failed
        m = page.evaluate('''() => { const g = window.rikuy; const built = 'The TeX tree is not next to this page (tex/tree.wasm: Could not load https://x/tex/tree.wasm (HTTP 404)). A copy built from source needs tex/build_tree.py first; README.md, Running it';
          const net = built.replace(/Could not load.*\\(HTTP 404\\)/, 'Failed to fetch');
          return [g.texFailText(new Error(net)), g.texFailText(new Error(built)), g.texFailText(new Error(built.replace('404', '503'))), g.texFailText(new Error('TeX ran out of memory')), g.texFailText(new Error(net), true)]; }''')
        plain = 'The TeX engine could not be downloaded. Check your connection, then press Recompile. '
        check('a failed download of the TeX engine is said in plain words, with what to do', m[0] == plain and m[2] == plain and 'build_tree' not in m[0], m)
        check('a page built without its TeX tree still names the build step; other errors pass as they are; offline has its own message', 'tex/build_tree.py' in m[1] and m[3] == 'TeX ran out of memory. ' and m[4] == '', m)
        check('no console errors (pdf.js)', not errors, errors[:5])
        browser.close()

        browser, page, errors = open_page(p)
        ui_fonts(page)
        latin_ext_fonts(page)
        browser.close()

    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    return 1 if bad else 0

if __name__ == '__main__':
    sys.exit(run())
