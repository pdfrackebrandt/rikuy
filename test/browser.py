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
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs': os.path.join(NM, 'pdfjs-dist/build/pdf.min.mjs'),
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

    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    return 1 if bad else 0

if __name__ == '__main__':
    sys.exit(run())
