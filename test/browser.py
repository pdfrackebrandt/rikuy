"""Galley browser tests: load the built page in Chromium, type on the
typeset pages, and check the .tex source changes exactly as intended."""
import json, os, sys, time, re
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NM = os.path.join(ROOT, 'node_modules')
SHOTS = os.environ.get('SHOTS', '/tmp/claude-0/-home-claude/8e522320-e94c-5af0-b5c6-59aa3f1e4221/scratchpad/shots')
os.makedirs(SHOTS, exist_ok=True)

SKELETON_HEAD = ('<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">'
                 '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
                 'body{margin:0;font:14px system-ui,sans-serif;background:#fafafa}img{max-width:100%}[hidden]{display:none!important}</style></head><body>')

ROUTES = {
    'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js': os.path.join(NM, 'katex/dist/katex.min.js'),
    'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/lib/codemirror.min.js': os.path.join(NM, 'codemirror/lib/codemirror.js'),
    'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/mode/stex/stex.min.js': os.path.join(NM, 'codemirror/mode/stex/stex.js'),
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
    dist = os.environ.get('GALLEY_DIST') or os.path.join(ROOT, 'dist')
    html = open(os.path.join(dist, 'galley.html'), encoding='utf8').read()
    doc = SKELETON_HEAD + html + '</body></html>'

    def handler(route):
        url = route.request.url
        if url.startswith('https://galley.test/'):
            path = url[len('https://galley.test/'):].split('?')[0]
            f = os.path.join(dist, path)
            if path and os.path.isfile(f):
                ct = 'text/javascript' if path.endswith(('.js', '.mjs')) else 'application/wasm' if path.endswith('.wasm') else 'application/octet-stream'
                return route.fulfill(status=200, content_type=ct, body=open(f, 'rb').read())
            return route.fulfill(status=200, content_type='text/html; charset=utf-8', body=doc)
        if url.startswith('http://127.0.0.1:'):
            return route.continue_()
        if url in ROUTES:
            return route.fulfill(status=200, content_type='application/javascript', body=open(ROUTES[url], encoding='utf8').read())
        return route.abort()
    page.route('**/*', handler)
    if init:
        page.add_init_script(init)
    page.goto('https://galley.test/')
    if clear:
        page.evaluate('localStorage.clear()')
        page.reload()
    page.wait_for_function('window.galley && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=20000)
    page.wait_for_timeout(300)
    return browser, page, errors


def src(page, f='main.tex'):
    return page.evaluate('(f) => window.galley.files.get(f)', f)


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


def run():
    with sync_playwright() as p:
        browser, page, errors = open_page(p)
        t = page.evaluate('window.galley.lastMs')
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
        click_text(page, 'Galley escapes special characters', 6)
        page.keyboard.type(' happily')
        check('typed word', 'Galley happily escapes' in src(page))
        page.keyboard.press('Control+z')
        check('undo restores', src(page) == base, src(page)[src(page).find('Galley escapes')-5:][:40])
        page.keyboard.press('Control+Shift+z')
        check('redo reapplies', 'Galley happily escapes' in src(page))
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
        page.wait_for_timeout(450)
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

        # 19. source pane opens and syncs
        if not page.evaluate("document.body.classList.contains('src-on')"):
            page.click('#b-src')
        page.wait_for_selector('#cmhost .CodeMirror', timeout=5000)
        page.wait_for_timeout(200)
        cmv = page.evaluate('window.galley.cm.getValue()')
        check('source pane shows main.tex', cmv == src(page))
        click_text(page, 'Math is an object', 4)
        page.keyboard.type('W')
        page.wait_for_timeout(100)
        check('page edit mirrors into source pane', page.evaluate('window.galley.cm.getValue()') == src(page) and 'MathW' in src(page))
        page.keyboard.press('Control+z')
        page.evaluate('''() => { const cm = window.galley.cm; const d = cm.getDoc(); const i = d.getValue().indexOf('Math is an object'); d.replaceRange('Algebra ', d.posFromIndex(i)); }''')
        page.wait_for_timeout(600)
        has = page.evaluate('[...document.querySelectorAll("#pages span.t")].some(s => s.textContent.includes("Algebra Math is"))')
        check('source edit re-typesets page', has)
        page.screenshot(path=SHOTS + '/02-source.png')
        page.keyboard.press('Control+z')

        check('no console errors', not errors, errors[:5])
        browser.close()

        # Mobile and dark
        browser, page, errors = open_page(p, width=390, height=844, dark=True)
        page.screenshot(path=SHOTS + '/03-mobile-dark.png')
        sw = page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
        check('no horizontal page scroll on phone', sw <= 0, sw)
        check('no console errors (mobile)', not errors, errors[:5])
        browser.close()

    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    return 1 if bad else 0

if __name__ == '__main__':
    sys.exit(run())
