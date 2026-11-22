"""The views and the View and Help tabs (src/cmd/view.js, src/cmd/help.js, src/tour.js), in Chromium.

The status bar's Page, LaTeX and PDF views, one at a time and at the same place: the caret's source
position into the LaTeX view and back, SyncTeX into the PDF view and back (where dist/tex exists),
no compile to switch when the PDF is current, Preview and Source still beside the page, the
preferences a reload opens with unchanged, the arrows between the three. Show LaTeX (Shift+F9; the
right click menu; Ctrl+Shift+= in the equation field): the block shown as its source where it
stands, the source unchanged by showing it, typing written as typed, one undo, Enter without a
mark, CRLF kept, Esc back, a selection over two paragraphs, a LaTeX paragraph of the document's
own left alone, the place kept when text before it changes, Word's model without it. The View
tab: Draft, Side to Side, Multiple pages, One page, 100%, Dark page, Focus and Esc, Show marks (B2's) there
(Ctrl+Shift+8) writing nothing, the zoom slider. Repeat (F4, Ctrl+Y with nothing to redo) and
Undo's list. Help: Learn Rikuy (its files, the live graph on the page, its PDF compiled where
dist/tex exists), Interactive graphs, Keyboard shortcuts, What's new. Phones at 390 and 360 px:
the three views in reach, 44 px targets, no sideways scroll, taps; screenshots light and dark in
$RIKUY_SHOTS (default /tmp/B12-shots).

RIKUY_DIST names another dist/."""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import settle, open_page, check, results, src, load_doc, click_text, select_text, roundtrip
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist')
TEX = os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm'))
SHOTS = os.environ.get('RIKUY_SHOTS', '/tmp/B12-shots')
os.makedirs(SHOTS, exist_ok=True)
WRAP = lambda body: '\\documentclass{article}\n\\begin{document}\n' + body + '\n\\end{document}\n'
LONG = WRAP('\n\n'.join('Paragraph %d of the long one, with enough words to fill a line or two of the page.' % i for i in range(1, 60)) + '\n\nThe last one says omega here.')
DOC = WRAP('Alpha beta gamma.\n\n\\begin{equation}\n  E = mc^2\n\\end{equation}\nDelta epsilon.\n\n% rikuy: latex\n\\textbf{raw} zeta.')


def ev(page, js, arg=None):
    return page.evaluate(js, arg) if arg is not None else page.evaluate(js)


def views(page):
    load_doc(page, LONG)
    prefs0 = ev(page, "JSON.parse(localStorage.getItem('galley.prefs.v1') || '{}')")
    grp = page.get_by_role('group', name='Views', exact=True)
    check('the status bar has the group Views: Page view, LaTeX view, PDF view, Page pressed',
          grp.count() == 1 and [grp.get_by_role('button', name=n, exact=True).count() for n in ('Page view', 'LaTeX view', 'PDF view')] == [1, 1, 1]
          and page.get_by_role('button', name='Page view', exact=True).get_attribute('aria-pressed') == 'true')
    click_text(page, 'omega', 2)
    at = ev(page, 'window.rikuy.caretNow().a')
    page.get_by_role('button', name='LaTeX view', exact=True).click(); settle(page, 700)
    st = ev(page, "(() => { const g = window.rikuy, d = g.cm.getDoc(); return { cls: document.body.className, cur: d.indexFromPos(d.getCursor()), focus: g.cm.hasFocus(), desk: getComputedStyle(document.getElementById('desk')).visibility, pressed: document.getElementById('sv-latex').getAttribute('aria-pressed') }; })()")
    check('LaTeX view: the source across the window, its cursor at the caret\'s source position, focused', 'view-latex' in st['cls'] and st['cur'] == at and st['focus'] and st['desk'] == 'hidden' and st['pressed'] == 'true', (st, at))
    page.keyboard.type('XY'); settle(page, 500)
    check('typing in the LaTeX view writes the source', 'omXYega' in src(page) or 'oXYmega' in src(page) or 'omeXYga' in src(page), src(page)[-80:])
    page.get_by_role('button', name='Page view', exact=True).click(); settle(page, 900)
    c = ev(page, 'window.rikuy.caretNow()')
    s = src(page)
    check('back to Page: the caret where the cursor was in the source', c and abs(c['a'] - (s.index('XY') + 2)) <= 1 and 'view-latex' not in ev(page, 'document.body.className'), (c, s.index('XY')))
    check('the views leave the panes a reload opens with as they were', ev(page, "JSON.parse(localStorage.getItem('galley.prefs.v1') || '{}')").get('source') == prefs0.get('source'))
    # Source in another view: back to the page, the source beside it
    page.get_by_role('button', name='LaTeX view', exact=True).click(); settle(page, 500)
    page.get_by_role('button', name='Source', exact=True).click(); settle(page, 500)
    cls = ev(page, 'document.body.className')
    check('Source pressed in the LaTeX view: the page again, the source beside it', 'src-on' in cls and 'view-latex' not in cls and ev(page, "document.getElementById('sv-page').getAttribute('aria-pressed')") == 'true', cls)
    page.get_by_role('button', name='Source', exact=True).click(); settle(page, 300)
    # the arrows move between the three; Enter presses
    page.focus('#sv-page'); page.keyboard.press('ArrowRight')
    check('the arrows move between the three views', ev(page, 'document.activeElement.id') == 'sv-latex')
    page.keyboard.press('ArrowLeft'); page.keyboard.press('ArrowLeft')
    check('and round', ev(page, 'document.activeElement.id') == 'sv-pdf')
    if not TEX:
        print('SKIP the PDF view by SyncTeX: no TeX tree in %s' % DIST)
        return
    click_text(page, 'omega', 1)
    t0 = time.time()
    page.get_by_role('button', name='PDF view', exact=True).click()
    page.wait_for_function('window.rikuy.lastPdf && !window.rikuy.compiling && window.rikuy.pdfView && window.rikuy.pdfView.pages.length', timeout=240000)
    settle(page, 1500)
    st = ev(page, "(() => { const h = document.getElementById('pdf-host'); return { cls: document.body.className, top: h.scrollTop, max: h.scrollHeight - h.clientHeight }; })()")
    check('PDF view: TeX\'s PDF across the window, scrolled by SyncTeX to the caret\'s line (the last page)', 'view-pdf' in st['cls'] and st['top'] > st['max'] * 0.6, st)
    page.screenshot(path=os.path.join(SHOTS, 'view-pdf-1366.png'))
    # the top of the PDF's window, back on the page
    ev(page, "document.getElementById('pdf-host').scrollTop = 0"); settle(page, 500)
    page.get_by_role('button', name='Page view', exact=True).click(); settle(page, 900)
    c = ev(page, 'window.rikuy.caretNow()')
    check('back to Page from the PDF\'s top: the caret in the first paragraphs', c and c['a'] < src(page).index('Paragraph 4 '), c)
    # current PDF: no compile to switch
    ev(page, "window.rikuy.nCompiles = 0; { const f = window.rikuy.compilePdf; window.rikuy.compilePdf = function (...a) { this.nCompiles++; return f.apply(this, a); }; } 0")
    t0 = time.time()
    page.get_by_role('button', name='PDF view', exact=True).click(); settle(page, 300)
    check('the PDF current: the PDF view without a compile, at once', ev(page, 'window.rikuy.nCompiles') == 0 and time.time() - t0 < 2, ev(page, 'window.rikuy.nCompiles'))
    # a click in the PDF view picks the place to go back to
    box = ev(page, "(() => { const p = window.rikuy.pdfView.pages[0].box.getBoundingClientRect(); return [p.left + p.width * 0.3, p.top + p.height * 0.35]; })()")
    page.mouse.click(box[0], box[1]); settle(page, 600)
    spot = ev(page, 'window.rikuy.viewPdfSpot')
    check('a click on the PDF in the PDF view is kept as the place (the hidden page does not move)', spot and spot['f'] == 'main.tex' and spot['line'] > 2 and 'view-pdf' in ev(page, 'document.body.className'), spot)
    page.get_by_role('button', name='Page view', exact=True).click(); settle(page, 900)
    c = ev(page, 'window.rikuy.caretNow()')
    line = src(page)[:c['a']].count('\n') + 1 if c else -1
    check('back to Page: the caret on the line clicked in the PDF', c and abs(line - spot['line']) <= 1, (line, spot))
    page.get_by_role('button', name='PDF view', exact=True).click(); settle(page, 400)
    page.click('#pdf-x'); settle(page, 400)
    cls = ev(page, 'document.body.className')
    check('the PDF pane closed in the PDF view: the page again', 'view-pdf' not in cls and 'pdf-on' not in cls and ev(page, "document.getElementById('sv-page').getAttribute('aria-pressed')") == 'true', cls)


def show_latex(page):
    load_doc(page, DOC)
    click_text(page, 'beta', 2)
    h0 = ev(page, 'window.rikuy.hist.length')
    page.keyboard.press('Shift+F9'); settle(page, 400)
    box = ev(page, "(() => { const b = document.querySelector('.it.tex.texview'); return b && [b.textContent, b.getAttribute('aria-roledescription')]; })()")
    check('Shift+F9: the paragraph shown as its source where it stands, as a LaTeX view', box and box[0] == 'Alpha beta gamma.' and box[1] == 'LaTeX view', box)
    check('showing it writes nothing: the source and the history unchanged', src(page) == DOC and ev(page, 'window.rikuy.hist.length') == h0)
    check('Show LaTeX shows pressed there', ev(page, "(() => { const g = window.rikuy, at = g.ribbonAt(); return g.cmds.command('show-latex').on(g, at); })()") is True)
    page.keyboard.type(' \\emph{new}'); settle(page, 400)
    s = src(page)
    check('typed in it, the source gets what is typed, as typed', '\\emph{new}' in s and s.replace(' \\emph{new}', '') == DOC, s[:120])
    check('the block stays a LaTeX view while typing', ev(page, "document.querySelectorAll('.it.tex.texview').length") == 1)
    page.keyboard.press('Enter'); settle(page, 300)
    s2 = src(page)
    check('Enter in it: a line break in the source, no mark line', s2.count('% rikuy: latex') == 1 and len(s2) == len(s) + 1, s2[:140])
    page.keyboard.press('Escape'); settle(page, 400)
    check('Esc: typeset again', ev(page, "document.querySelectorAll('.it.tex.texview').length") == 0)
    ev(page, 'window.rikuy.undo()'); ev(page, 'window.rikuy.undo()'); settle(page, 300)
    check('undo gives the source back byte for byte', src(page) == DOC, src(page)[:120])
    # Backspace at its start leaves its edges alone
    click_text(page, 'Alpha', 0); page.keyboard.press('Shift+F9'); settle(page, 300)
    page.keyboard.press('Home'); page.keyboard.press('Backspace'); settle(page, 300)
    check('Backspace at its very start writes nothing', src(page) == DOC)
    page.keyboard.press('Shift+F9'); settle(page, 300)
    check('Shift+F9 again: typeset again', ev(page, "document.querySelectorAll('.it.tex.texview').length") == 0)
    # the equation, from its field: Ctrl+Shift+=
    page.locator('.dm').first.click(); settle(page, 800)
    page.keyboard.press('Control+Shift+Equal'); settle(page, 500)
    box = ev(page, "(() => { const b = document.querySelector('.it.tex.texview'); return b && b.textContent; })()")
    check('Ctrl+Shift+= in the equation field: the equation shown as its LaTeX on the page (Word\'s Linear)', box and box.startswith('\\begin{equation}') and box.endswith('\\end{equation}') and not ev(page, 'window.rikuy.pop'), box)
    check('and the source unchanged', src(page) == DOC)
    ev(page, 'window.rikuy.hideLatexViews()'); settle(page, 200)
    # a selection over two paragraphs: both
    ev(page, """(() => { const g = window.rikuy, s = g.src('main.tex'); g.restoreCaret({ f: 'main.tex', selA: s.indexOf('beta'), selB: s.indexOf('epsilon') }); })()""")
    settle(page, 200)
    ev(page, "window.rikuy.runCommand('show-latex')"); settle(page, 400)
    n = ev(page, "document.querySelectorAll('.it.tex.texview').length")
    check('a selection over a paragraph, an equation and a paragraph: each shown as LaTeX', n == 3, n)
    # text before a shown block changes: it stays shown
    ev(page, 'window.rikuy.hideLatexViews()')
    click_text(page, 'Delta', 2); ev(page, "window.rikuy.runCommand('show-latex')"); settle(page, 300)
    ev(page, "window.rikuy.api.setSource(window.rikuy.api.getSource().replace('Alpha', 'Alpha and more words'))"); settle(page, 600)
    box = ev(page, "(() => { const b = document.querySelector('.it.tex.texview'); return b && b.textContent; })()")
    check('text written before a block shown as LaTeX: the same block stays shown', box == 'Delta epsilon.', box)
    ev(page, 'window.rikuy.undo()'); settle(page, 400)
    box = ev(page, "(() => { const b = document.querySelector('.it.tex.texview'); return b && b.textContent; })()")
    check('and after undo', box == 'Delta epsilon.', box)
    m = ev(page, "(() => { const g = window.rikuy, m = g.plainModel(); return [g.model.blocks.some((u) => u.items.some((x) => x.view)), m.blocks.some((u) => u.items.some((x) => x.view))]; })()")
    check('Word\'s export and Export as read the document without the view (plainModel)', m == [True, False], m)
    ev(page, 'window.rikuy.hideLatexViews()')
    # the document's own LaTeX paragraph is source already
    click_text(page, 'zeta', 1)
    st = ev(page, "(() => { const g = window.rikuy, at = g.ribbonAt(); return [g.cmds.enabled(g, 'show-latex', at), g.cmds.command('show-latex').whyNot(g, at)]; })()")
    check('in a LaTeX paragraph of the document\'s own: disabled, with why', st[0] is False and 'caret' in st[1], st)
    # the right click menu lists it
    click_text(page, 'gamma', 1)
    page.locator('.it', has_text='Alpha beta').first.click(button='right'); settle(page, 300)
    check('the right click menu has Show LaTeX', page.get_by_role('menuitem', name='Show LaTeX').count() == 1)
    page.keyboard.press('Escape')
    # CRLF
    crlf = DOC.replace('\n', '\r\n')
    load_doc(page, crlf); click_text(page, 'beta', 2); page.keyboard.press('Shift+F9'); settle(page, 300)
    page.keyboard.press('End'); page.keyboard.press('Enter'); page.keyboard.type('q'); settle(page, 300)
    check('a CRLF file keeps CRLF: Enter in a LaTeX view writes \\r\\n', src(page) == crlf.replace('gamma.', 'gamma.\r\nq'), repr(src(page)[:90]))
    page.keyboard.press('Escape')
    # opened again: no view carried into another document
    ev(page, "window.rikuy.runCommand('show-latex')")
    load_doc(page, DOC); settle(page, 300)
    check('another document opened: nothing shown as LaTeX', ev(page, "document.querySelectorAll('.it.tex.texview').length") == 0)


def view_tab(page):
    load_doc(page, LONG)
    page.get_by_role('tab', name='View', exact=True).click(); settle(page, 300)
    for n in ('Read Mode', 'Print Layout', 'LaTeX Mode', 'Draft', 'Show LaTeX', 'Show marks', 'One page', 'Multiple pages', 'Side to Side', 'Dark page', 'Focus', '100%', 'Page width'):
        check('View has ' + n, page.get_by_role('button', name=n, exact=True).count() == 1)
    page.get_by_role('button', name='Draft', exact=True).click(); settle(page, 400)
    g = ev(page, "(() => { const p = [...document.querySelectorAll('.page')]; return p.length > 1 && Math.round(p[1].getBoundingClientRect().top - p[0].getBoundingClientRect().bottom); })()")
    check('Draft: the pages run on, no gap between them', g == 0 and ev(page, "document.getElementById('rw-draft').getAttribute('aria-pressed')") == 'true', g)
    page.get_by_role('button', name='Print Layout', exact=True).click(); settle(page, 400)
    check('Print Layout: the pages apart again', 'pg-draft' not in ev(page, 'document.body.className'))
    page.get_by_role('button', name='Side to Side', exact=True).click(); settle(page, 500)
    r = ev(page, "(() => { const p = [...document.querySelectorAll('.page')]; const a = p[0].getBoundingClientRect(), b = p[1].getBoundingClientRect(); return [Math.round(a.top - b.top), b.left > a.right]; })()")
    check('Side to Side: the pages in a row', r == [0, True], r)
    page.get_by_role('button', name='Multiple pages', exact=True).click(); settle(page, 700)
    r = ev(page, "(() => { const p = [...document.querySelectorAll('.page')], d = document.getElementById('desk').getBoundingClientRect(); const a = p[0].getBoundingClientRect(), b = p[1].getBoundingClientRect(); return [Math.abs(a.top - b.top) < 2, b.right <= d.right + 1, a.bottom <= d.bottom + 60]; })()")
    check('Multiple pages: two pages side by side, both in the window', r == [True, True, True], r)
    page.get_by_role('button', name='One page', exact=True).click(); settle(page, 700)
    r = ev(page, "(() => { const p = document.querySelector('.page').getBoundingClientRect(), d = document.getElementById('desk'); return [Math.round(p.height), d.clientHeight]; })()")
    check('One page: a whole page in the window\'s height', r[0] <= r[1], r)
    page.get_by_role('button', name='100%', exact=True).click(); settle(page, 500)
    check('100%: actual size, pages one under the other', abs(ev(page, 'window.rikuy.px') - 96 / 72.27) < 0.01 and 'pg-grid' not in ev(page, 'document.body.className'))
    page.get_by_role('button', name='Dark page', exact=True).click(); settle(page, 300)
    bg = ev(page, "getComputedStyle(document.querySelector('.page')).backgroundColor")
    check('Dark page: the page dark, kept for the next visit, the source untouched', bg == 'rgb(30, 34, 39)' and ev(page, "JSON.parse(localStorage.getItem('galley.prefs.v1')).darkPage") is True and src(page) == LONG, bg)
    page.screenshot(path=os.path.join(SHOTS, 'view-dark-page-1366.png'))
    page.get_by_role('button', name='Dark page', exact=True).click()
    click_text(page, 'Paragraph 3', 3)
    page.get_by_role('tab', name='View', exact=True).click(); settle(page, 200)
    page.get_by_role('button', name='Focus', exact=True).click(); settle(page, 400)
    hid = ev(page, "['bar', 'ribbon', 'status'].map((i) => getComputedStyle(document.getElementById(i)).display)")
    check('Focus: the bars hidden, Leave Focus at hand', hid == ['none', 'none', 'none'] and page.get_by_role('button', name='Leave Focus', exact=True).is_visible(), hid)
    page.screenshot(path=os.path.join(SHOTS, 'view-focus-1366.png'))
    click_text(page, 'Paragraph 2', 3); page.keyboard.press('Escape'); settle(page, 400)
    check('Esc: the bars back', 'focus' not in ev(page, 'document.body.className').split() and page.locator('#bar').is_visible())
    # the zoom slider
    ev(page, "(() => { const s = document.getElementById('st-zoom'); s.value = '150'; s.dispatchEvent(new Event('input')); })()"); settle(page, 500)
    check('the zoom slider: 150 shows the page at 150%', abs(ev(page, 'window.rikuy.px') / (96 / 72.27) - 1.5) < 0.01 and ev(page, "document.getElementById('st-zoomv').textContent") == '150%')
    page.get_by_role('button', name='Zoom level', exact=True).click(); settle(page, 400)
    check('the zoom level: a press gives actual size', ev(page, "document.getElementById('st-zoomv').textContent") == '100%')
    page.get_by_role('button', name='Page width', exact=True).click()


def repeat_undo(page):
    d = WRAP('One two three four.')
    load_doc(page, d)
    select_text(page, 'two'); ev(page, "window.rikuy.runCommand('bold')"); settle(page, 300)
    select_text(page, 'four'); page.keyboard.press('F4'); settle(page, 300)
    check('F4 repeats the last command (Bold) on the new selection', src(page) == d.replace('two', '\\textbf{two}').replace('four', '\\textbf{four}'), src(page))
    select_text(page, 'One'); page.keyboard.press('Control+y'); settle(page, 300)
    check('Ctrl+Y with nothing to redo repeats it too', '\\textbf{One}' in src(page), src(page))
    page.get_by_role('button', name='Undo options', exact=True).click(); settle(page, 300)
    items = page.get_by_role('menuitem').all_inner_texts()
    check('Undo options lists the last steps', len(items) >= 3 and items[0].startswith('Undo: '), items)
    page.get_by_role('menuitem').nth(1).click(); settle(page, 400)
    check('its second item undoes two steps at once', src(page) == d.replace('two', '\\textbf{two}'), src(page))


def help_tab(page):
    page.get_by_role('tab', name='Help', exact=True).click(); settle(page, 300)
    for n in ('How it works', 'Learn Rikuy', 'Interactive graphs', 'Keyboard shortcuts', "What's new", 'Report a problem', 'For AI agents'):
        check('Help has ' + n, page.get_by_role('button', name=n, exact=True).count() == 1)
    page.get_by_role('button', name='Interactive graphs', exact=True).click(); settle(page, 400)
    dlg = page.get_by_role('dialog', name='Interactive graphs', exact=True)
    check('Interactive graphs: a guide with \\rikuywidget and the height message', dlg.count() == 1 and '\\rikuywidget[width=\\textwidth]' in dlg.inner_text() and 'postMessage' in dlg.inner_text())
    page.screenshot(path=os.path.join(SHOTS, 'help-graphs-1366.png'))
    dlg.get_by_role('button', name='Open Learn Rikuy', exact=True).click(); settle(page, 1500)
    st = ev(page, "(() => { const g = window.rikuy; return { name: g.name, files: [...g.files.keys()].sort(), assets: [...g.assetBlobs.keys()], frames: document.querySelectorAll('.wlayer iframe').length }; })()")
    check('Learn Rikuy opens a document of its own: main.tex, rikuy.sty, the widget and its picture', st['name'].startswith('Learn Rikuy') and st['files'] == ['main.tex', 'rikuy.sty', 'widgets/wave.html'] and st['assets'] == ['figures/wave.pdf'], st)
    settle(page, 1500)
    check('its live graph runs on the page', ev(page, "document.querySelectorAll('.wlayer iframe').length") == 1)
    pdf = ev(page, "(async () => { const b = await window.rikuy.assetBlobs.get('figures/wave.pdf').arrayBuffer(); return new TextDecoder().decode(b); })()")
    check('its picture for TeX is a PDF of one page with a cross reference table that adds up', pdf.startswith('%PDF-1.4') and '/MediaBox [0 0 360 160]' in pdf and pdf.rstrip().endswith('%%EOF') and int(pdf.split('startxref\n')[1].split()[0]) == pdf.index('xref\n0 6'))
    if not TEX: print('SKIP Learn Rikuy compiled in the page: no TeX tree in %s' % DIST)
    if TEX:
        r = ev(page, "window.rikuy.api.compile()")
        check('Learn Rikuy compiles in the page, its graph the picture', r['ok'] and r['pages'] >= 2 and not [x for x in r['problems'] if x.get('severity') == 'error'], (r['ok'], r['pages'], r['problems'][:3]))
    page.get_by_role('tab', name='Help', exact=True).click(); settle(page, 200)
    page.get_by_role('button', name='Keyboard shortcuts', exact=True).click(); settle(page, 300)
    t = page.get_by_role('dialog', name='Keyboard shortcuts', exact=True).inner_text()
    check('Keyboard shortcuts lists the registry\'s keys by tab: Shift+F9 Show LaTeX, F4 Repeat, Ctrl+B Bold', 'Shift+F9' in t and 'Show LaTeX' in t and 'F4' in t and 'Repeat' in t and 'Ctrl+B' in t, t[:200])
    page.keyboard.press('Escape')
    page.get_by_role('button', name="What's new", exact=True).click(); settle(page, 300)
    check("What's new is a dialog naming the views", 'Page, LaTeX, PDF' in page.get_by_role('dialog', name="What's new", exact=True).inner_text())
    page.keyboard.press('Escape')


def phones(p):
    for w, h, dark in ((390, 844, False), (360, 740, True), (390, 844, True), (360, 740, False)):
        tag = ' (%d px%s)' % (w, ', dark' if dark else '')
        browser, page, errors = open_page(p, w, h, dark=dark, touch=True)
        page.evaluate("window.rikuy.runCommand('help-tour')"); settle(page, 1500)
        r = ev(page, "[...document.querySelectorAll('.st-views button')].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.right), Math.round(r.width), Math.round(r.height)]; })")
        check('the three views in reach, each 44 px or more' + tag, len(r) == 3 and all(x[0] <= w and x[1] >= 44 and x[2] >= 44 for x in r), r)
        check('no sideways scroll' + tag, ev(page, 'document.documentElement.scrollWidth') <= w)
        page.screenshot(path=os.path.join(SHOTS, 'phone-%d%s-page.png' % (w, '-dark' if dark else '')))
        page.tap('#sv-latex'); settle(page, 900)
        sp = ev(page, "(() => { const r = document.getElementById('srcpane').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.width)]; })()")
        check('LaTeX by a tap: the source across the screen' + tag, sp == [0, w] and ev(page, 'document.documentElement.scrollWidth') <= w, sp)
        page.screenshot(path=os.path.join(SHOTS, 'phone-%d%s-latex.png' % (w, '-dark' if dark else '')))
        page.tap('#sv-page'); settle(page, 700)
        check('Page by a tap' + tag, 'view-latex' not in ev(page, 'document.body.className'))
        # V3 Web Layout by a tap on View's button: the text as wide as the screen; V8 the ruler is
        # for a mouse: its button off, saying why, and no ruler drawn
        ev(page, "window.rikuy.selectTab('view')"); settle(page, 300)
        page.locator('#rw-web').tap(); settle(page, 700)
        g = ev(page, "(() => { const pb = document.querySelector('.page .pb').getBoundingClientRect(); return [document.body.classList.contains('pg-web'), Math.round(pb.left), Math.round(pb.right), document.documentElement.scrollWidth]; })()")
        check('V3: Web Layout by a tap, the text inside the screen' + tag, g[0] and g[1] >= 0 and g[2] <= w and g[3] <= w, g)
        page.screenshot(path=os.path.join(SHOTS, 'phone-%d%s-web.png' % (w, '-dark' if dark else '')))
        page.locator('#rw-print').tap(); settle(page, 500)
        rb = page.locator('#rw-ruler')
        check('V8: the Ruler button is off on a touch screen, its title says why; no ruler drawn' + tag, rb.is_disabled() and not ev(page, "!!document.getElementById('ruler') && !document.getElementById('ruler').hidden && !!document.getElementById('ruler').offsetParent"), rb.get_attribute('title'))
        if w == 390 and not dark:
            # Show LaTeX without a right click: the View tab's button, by a tap
            el = page.locator('.it.p').nth(1)
            el.tap(); settle(page, 300)
            ev(page, "window.rikuy.selectTab('view')"); settle(page, 300)
            b = page.locator('#rw-showtex')
            bb = b.bounding_box()
            b.tap(); settle(page, 500)
            check('Show LaTeX by a tap on View\'s button (a phone has no right click), 44 px', ev(page, "document.querySelectorAll('.it.tex.texview').length") == 1 and bb and bb['height'] >= 44, bb)
            page.screenshot(path=os.path.join(SHOTS, 'phone-390-showlatex.png'))
            ev(page, 'window.rikuy.hideLatexViews()')
            ev(page, "window.rikuy.runCommand('help-graphs')"); settle(page, 500)
            dl = ev(page, "(() => { const d = document.querySelector('.pop'); const r = d.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), d.scrollHeight > d.clientHeight || r.bottom <= innerHeight]; })()")
            check('Interactive graphs fits the screen and scrolls' + tag, dl[0] >= 0 and dl[1] <= w and dl[2], dl)
            page.screenshot(path=os.path.join(SHOTS, 'phone-390-graphs.png'))
        check('no errors' + tag, not errors, errors)
        browser.close()


def review(page):
    """B12's hostile review: M3, M4, L1, L2, L3, L10."""
    shown = lambda: ev(page, "[...document.querySelectorAll('.it.tex.texview')].map((b) => b.textContent)")
    d3 = WRAP('Foo one.\n\nBar two second.\n\nFoo three.')
    load_doc(page, d3); click_text(page, 'second', 2); page.keyboard.press('Shift+F9'); settle(page, 300)
    page.keyboard.press('Control+h'); settle(page, 400)
    dlg = page.get_by_role('dialog', name='Find and Replace', exact=True)
    dlg.get_by_role('textbox', name='Find what', exact=True).fill('Foo')
    dlg.get_by_role('textbox', name='Replace with', exact=True).fill('Baz')
    dlg.get_by_role('button', name='Replace All', exact=True).click(); settle(page, 500)
    page.keyboard.press('Escape'); settle(page, 200)
    if dlg.count(): dlg.get_by_role('button', name='Close', exact=True).click(); settle(page, 200)
    check('M4: Replace All before and after a block shown as LaTeX: the same block stays shown', 'Baz one.' in src(page) and shown() == ['Bar two second.'], shown())
    ev(page, r"""(() => { const g = window.rikuy, s = g.src('main.tex'), i = s.indexOf('three'), b = s.indexOf('\\begin{document}'); g.commit([{ f: 'main.tex', s: b, e: b, t: '\\usepackage{xcolor}\n' }, { f: 'main.tex', s: i, e: i + 5, t: '\\textcolor{red}{three}' }], null, 'color'); })()""")
    settle(page, 400)
    check('M4: one commit in the preamble and the body (as Font colour makes): the block stays shown', shown() == ['Bar two second.'], shown())
    ev(page, 'window.rikuy.undo()'); settle(page, 300)
    check('and after its undo', shown() == ['Bar two second.'], shown())
    # L1: Enter at its very start keeps it shown
    click_text(page, 'Bar', 0); page.keyboard.press('Home'); page.keyboard.press('Enter'); settle(page, 400)
    check('L1: Enter at the very start of a block shown as LaTeX keeps it shown', shown() == ['Bar two second.'] and '\n\n\nBar two' in src(page), (shown(), src(page)[-90:]))
    # L3: a paste of CRLF text into a view of a CRLF file writes CRLF
    crlf = d3.replace('\n', '\r\n')
    load_doc(page, crlf); click_text(page, 'second', 2); page.keyboard.press('Shift+F9'); settle(page, 300)
    ev(page, r"""(() => { const g = window.rikuy, T = g.texHere(); g.texEdit(T, T.is + 3, T.is + 3, 'one\ntwo', 'paste'); })()"""); settle(page, 300)
    check('L3: pasted lines in a view of a CRLF file get CRLF', 'Barone\r\ntwo two' in src(page) and src(page).count('\n') == src(page).count('\r\n'), repr(src(page)[-80:]))
    # L10: a view is no style to change, and Replace's LaTeX paragraph rule ignores it
    st = ev(page, "(() => { const g = window.rikuy, at = g.ribbonAt(); return g.blockStyle(at).why || ''; })()")
    check('L10: the Styles gallery says a block shown as LaTeX has no style to change while shown', 'Shown as LaTeX' in st, st)
    ev(page, 'window.rikuy.hideLatexViews()')
    # M3: Ctrl+Y after typing is no Repeat; F4 right after a command is
    load_doc(page, WRAP('Alpha beta gamma.')); select_text(page, 'beta'); page.keyboard.press('Control+b'); settle(page, 200)
    click_text(page, 'gamma', 5); page.keyboard.type(' new'); settle(page, 200)
    select_text(page, 'Alpha'); page.keyboard.press('Control+y'); settle(page, 300)
    check('M3: Ctrl+Y after typing repeats no command', '\\textbf{Alpha}' not in src(page) and not ev(page, 'window.rikuy.lastAct'), src(page))
    select_text(page, 'gamma'); page.keyboard.press('Control+b'); settle(page, 200)
    select_text(page, 'gamma'); ev(page, "window.rikuy.runCommand('clear-formatting')"); settle(page, 200)
    check('M3: a command that takes something away (Clear All Formatting) is never the one repeated', ev(page, 'window.rikuy.lastAct && window.rikuy.lastAct.id') == 'bold' and '\\textbf{gamma}' not in src(page), (ev(page, 'window.rikuy.lastAct'), src(page)))
    # L2: Interactive graphs opens below the ribbon, at its top
    ev(page, "window.rikuy.runCommand('help-graphs')"); settle(page, 400)
    r = ev(page, "(() => { const d = document.querySelector('.pop'), rb = document.getElementById('ribbon').getBoundingClientRect(), r = d.getBoundingClientRect(); return [Math.round(r.top - rb.bottom), d.scrollTop, Math.round(r.bottom), Math.round(document.getElementById('status').getBoundingClientRect().top)]; })()")
    check('L2, V9: Interactive graphs opens below the ribbon, scrolled to its top, above the status bar', r[0] >= 0 and r[1] == 0 and r[2] <= r[3], r)
    page.keyboard.press('Escape')


CMP = 72.27 / 2.54
RDOC = WRAP('Alpha beta gamma delta.\n\nSecond paragraph here.')
CP = RDOC.replace('\\begin{document}', '\\usepackage{changepage}\n\\begin{document}')


def marker(page, k):
    return ev(page, "(k) => { const e = document.querySelector('#ruler .ru-mk.ru-' + k) || document.querySelector('#vruler .ru-mk.ru-' + k); if (!e) return null; const r = e.getBoundingClientRect(); return { x: k === 'ml' ? r.left + 3 : k === 'mr' ? r.right - 3 : r.left + r.width / 2, y: k === 'mt' ? r.top + 2 : k === 'mb' ? r.bottom - 2 : r.top + r.height / 2, v: e.getAttribute('aria-valuetext'), off: e.classList.contains('off'), title: e.title }; }", k)


def ruler_drag(k, dcm, vert=False):
    def go(page):
        m = marker(page, k)
        d = dcm * CMP * ev(page, 'window.rikuy.layout.px')
        page.mouse.move(m['x'], m['y']); page.mouse.down()
        for f in (0.3, 0.7, 1):
            page.mouse.move(m['x'] + (0 if vert else d * f), m['y'] + (d * f if vert else 0))
        page.mouse.up(); settle(page, 300)
    go.__name__ = 'drag ' + k
    return go


def web(page):
    """V3 Web Layout: the text set as wide as the window, one sheet, no headers or footers, the lines
    the browser's; Print Layout, Draft, One page take it back; kept as the page reopens."""
    load_doc(page, WRAP(' '.join(['Word number %d of a long paragraph.' % i for i in range(60)]) + '\n\n\\newpage\nAfter the break.'))
    lines0 = ev(page, "document.querySelector('#pages .it.p').getClientRects().length")
    ev(page, "window.rikuy.runCommand('web-layout')"); settle(page, 500)
    g = ev(page, "(() => { const d = document.getElementById('desk').clientWidth, pb = document.querySelector('.page .pb').getBoundingClientRect(); return { on: document.body.classList.contains('pg-web'), d, pb: Math.round(pb.width), pages: window.rikuy.layout.pages.length, hd: getComputedStyle(document.querySelector('.page .folio')).display }; })()")
    check('Web Layout: the text as wide as the window, no folio; a page break alone starts another sheet', g['on'] and g['pb'] > g['d'] - 140 and g['pages'] == 2 and g['hd'] == 'none', g)
    check('Web Layout pressed in View, Print Layout not', ev(page, "(() => { const c = window.rikuy.cmds; return [c.command('web-layout').on(window.rikuy), c.command('print-layout').on(window.rikuy)]; })()") == [True, False])
    page.set_viewport_size({'width': 900, 'height': 800}); settle(page, 700)
    w2 = ev(page, "Math.round(document.querySelector('.page .pb').getBoundingClientRect().width)")
    check('the window narrower, the lines reflow to it', w2 < g['pb'] - 300 and w2 > 600, (w2, g['pb']))
    page.set_viewport_size({'width': 1366, 'height': 800}); settle(page, 500)
    page.screenshot(path=os.path.join(SHOTS, 'web-layout-1366.png'))
    ev(page, "window.rikuy.runCommand('draft')"); settle(page, 400)
    check('Draft takes Web Layout off: pages again, as TeX cuts them', not ev(page, "document.body.classList.contains('pg-web')") and ev(page, "document.body.classList.contains('pg-draft')"))
    ev(page, "window.rikuy.runCommand('web-layout')"); settle(page, 300)
    ev(page, "window.rikuy.runCommand('one-page')"); settle(page, 400)
    check('One page takes it off too', not ev(page, "document.body.classList.contains('pg-web')"))
    ev(page, "window.rikuy.runCommand('web-layout')"); settle(page, 300)
    check('kept with the preferences', ev(page, "JSON.parse(localStorage.getItem('galley.prefs.v1')).web") is True)
    ev(page, "window.rikuy.runCommand('print-layout')"); settle(page, 400)
    check('Print Layout: the pages as TeX sets them again, the lines as before', not ev(page, "document.body.classList.contains('pg-web')") and ev(page, "document.querySelector('#pages .it.p').getClientRects().length") == lines0 and ev(page, 'window.rikuy.layout.g.web') is None)
    ev(page, "window.rikuy.runCommand('zoom-fit')")


def ruler(page):
    """V8 the rulers: the margins and the caret's paragraph (its indents, first line, the stop of a
    leader), each marker dragged and written through B2's and B6's edits by the round trip rule;
    the arrow keys; hand written forms read back; hidden where it cannot work."""
    ev(page, "window.rikuy.prefs.ruler = false")
    load_doc(page, RDOC); click_text(page, 'Second', 2)
    page.get_by_role('tab', name='View', exact=True).click(); settle(page, 200)
    page.get_by_role('button', name='Ruler', exact=True).click(); settle(page, 400)
    names = ev(page, "[...document.querySelectorAll('#ruler [role=slider], #vruler [role=slider]')].map((e) => e.getAttribute('aria-label'))")
    check('View › Ruler shows the rulers, its markers sliders by name', not ev(page, "document.getElementById('ruler').hidden") and names == ['First Line Indent', 'Hanging Indent', 'Left Indent', 'Right Indent', 'Left margin', 'Right margin', 'Top margin', 'Bottom margin'], names)
    check('the paragraph\'s first line at LaTeX\'s \\parindent, its indents at 0', marker(page, 'first')['v'] == '0.53 cm' and marker(page, 'left')['v'] == '0 cm' and marker(page, 'right')['v'] == '0 cm', [marker(page, k)['v'] for k in ('first', 'left', 'right')])
    sel = ('Second', 2)
    roundtrip(page, RDOC, sel, ruler_drag('left', 1), CP.replace('\nSecond paragraph here.', '\n\\begin{adjustwidth}{1cm}{}\nSecond paragraph here.\n\\end{adjustwidth}'), off=CP,
              forms=(CP.replace('\nSecond paragraph here.', '\n\\begin{adjustwidth}{1cm}{0pt}\nSecond paragraph here.\n\\end{adjustwidth}'),), off_command=ruler_drag('left', -1), label='Ruler: Left Indent dragged 1 cm')
    load_doc(page, CP.replace('\nSecond paragraph here.', '\n\\begin{adjustwidth}{2cm}{1.5cm}\nSecond paragraph here.\n\\end{adjustwidth}')); click_text(page, 'Second', 2); settle(page, 300)
    check('a hand written adjustwidth read back: Left Indent 2 cm, Right Indent 1.5 cm', marker(page, 'left')['v'] == '2 cm' and marker(page, 'right')['v'] == '1.5 cm', (marker(page, 'left'), marker(page, 'right')))
    roundtrip(page, RDOC, sel, ruler_drag('right', -2), CP.replace('\nSecond paragraph here.', '\n\\begin{adjustwidth}{}{2cm}\nSecond paragraph here.\n\\end{adjustwidth}'), off=CP, off_command=ruler_drag('right', 2), label='Ruler: Right Indent dragged 2 cm')
    roundtrip(page, RDOC, sel, ruler_drag('first', -1), CP.replace('\nSecond paragraph here.', '\n\\begin{adjustwidth}{-0.5cm}{}\n\\noindent\\hangindent=0.5cm Second paragraph here.\n\\end{adjustwidth}'), off=CP, off_command=ruler_drag('first', 1), label='Ruler: First Line Indent left of the others: a hanging indent')
    roundtrip(page, RDOC, sel, ruler_drag('first', -0.5), RDOC.replace('\nSecond paragraph here.', '\n\\noindent Second paragraph here.'), off_command=ruler_drag('first', 0.5), label='Ruler: First Line Indent to the left indent: \\noindent')
    # the margins, by B6's edits (geometry), each one step and one undo
    for k, d, want in (('ml', -1, 'left=3.75cm'), ('mr', 1, 'right=3.25cm'), ('mt', 1, 'top=5.5cm'), ('mb', -1, 'bottom=7cm')):
        load_doc(page, RDOC); click_text(page, 'Second', 2); settle(page, 200)
        if k == 'mb': ev(page, "(() => { const d = document.getElementById('desk'), m = document.querySelector('#vruler .ru-mk.ru-mb').getBoundingClientRect(), D = d.getBoundingClientRect(); d.scrollTop += m.top - D.top - D.height / 2; })()"); settle(page, 300)
        ruler_drag(k, d, k in ('mt', 'mb'))(page)
        s1 = src(page)
        ev(page, 'window.rikuy.undo()'); settle(page, 150)
        check('Ruler: the %s dragged writes geometry\'s %s, one step, one undo back' % (k, want), '{geometry}' in s1 and want in s1 and src(page) == RDOC, s1[:160])
    load_doc(page, RDOC.replace('\\begin{document}', '\\usepackage[margin=3cm]{geometry}\n\\begin{document}')); click_text(page, 'Second', 2); settle(page, 300)
    check('hand written geometry read back: every margin 3 cm', [marker(page, k)['v'] for k in ('ml', 'mr', 'mt', 'mb')] == ['3 cm'] * 4, [marker(page, k)['v'] for k in ('ml', 'mr', 'mt', 'mb')])
    ruler_drag('ml', 1)(page)
    check('dragged there, the margins are written into that line', '\\usepackage[top=3cm,bottom=3cm,left=4cm,right=3cm]{geometry}' in src(page) or ('left=4cm' in src(page) and src(page).count('geometry') == 1), src(page)[:140])
    # the keys: a slider moved by the arrows, one step each
    load_doc(page, RDOC); click_text(page, 'Second', 2); settle(page, 300)
    ev(page, "document.querySelector('#ruler .ru-mk.ru-left').focus()"); page.keyboard.press('ArrowRight'); settle(page, 300)
    check('Left Indent focused, the right arrow moves it a quarter centimetre: one step', '\\begin{adjustwidth}{0.25cm}{}' in src(page) and ev(page, 'window.rikuy.hist.length') == 1, src(page)[-120:])
    # a leader's stop; a heading's markers off, saying why
    load_doc(page, WRAP('\\section{Head}\nName \\dotfill{} 12.'))
    click_text(page, 'Name', 1); settle(page, 300)
    check('a paragraph with a leader shows its stop at the right indent, saying it is LaTeX\'s fill', ev(page, "!document.querySelector('#ruler .ru-tab').hidden && document.querySelector('#ruler .ru-tab').title.includes('dotfill')"))
    click_text(page, 'Head', 1); settle(page, 300)
    m = marker(page, 'left')
    check('in a heading the indent markers are off, their title says why (a heading\'s style)', m['off'] and 'style' in m['title'], m)
    load_doc(page, RDOC); click_text(page, 'Second', 2); settle(page, 300)
    page.screenshot(path=os.path.join(SHOTS, 'ruler-1366.png'))
    ev(page, "window.rikuy.setDarkPage(true)"); settle(page, 200)
    ev(page, "document.documentElement.dataset.theme = 'dark'"); settle(page, 200)
    page.screenshot(path=os.path.join(SHOTS, 'ruler-1366-dark.png'))
    ev(page, "delete document.documentElement.dataset.theme; window.rikuy.setDarkPage(false)")
    # hidden where it cannot work: Web Layout, the LaTeX view, Focus
    ev(page, "window.rikuy.runCommand('web-layout')"); settle(page, 300)
    check('hidden in Web Layout', ev(page, "document.getElementById('ruler').hidden"))
    ev(page, "window.rikuy.runCommand('print-layout')"); settle(page, 300)
    check('back in Print Layout, shown again', not ev(page, "document.getElementById('ruler').hidden"))
    if os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        load_doc(page, RDOC); click_text(page, 'Second', 2); settle(page, 200)
        ruler_drag('left', 1)(page); ruler_drag('ml', -1)(page)
        page.set_default_timeout(600000)
        r = ev(page, 'window.rikuy.api.compile()')
        page.set_default_timeout(30000)
        errs = [x for x in r['problems'] if x.get('severity') == 'error']
        check('what the rulers wrote (adjustwidth, geometry) compiles in the page', r['ok'] and not errs, errs[:2])
    ev(page, "window.rikuy.setRuler(false)")


def press(page, k, key, n=1):
    for _ in range(n):
        ev(page, "(k) => document.querySelector('#ruler .ru-mk.ru-' + k).focus()", k) if _ == 0 else None
        page.keyboard.press(key); settle(page, 350)


def r5_ruler(page):
    """The review of R5's rulers: an even page of a two sided document moves the outer margin (M1);
    a slider keeps the focus, two presses two steps (M2); First Line goes from one of LaTeX's states
    to the next a press, and Hanging never moves the first line (M3)."""
    ev(page, "window.rikuy.setRuler(true)")
    two = '\\documentclass[twoside]{article}\n\\usepackage[left=3cm,right=2cm]{geometry}\n\\begin{document}\nPage one.\n\\newpage\nPage two words.\n\\end{document}\n'
    load_doc(page, two); click_text(page, 'two words', 1); settle(page, 400)
    check('M1: on an even page of a two sided document the left margin shown is the outer one', marker(page, 'ml')['v'] == '2 cm', marker(page, 'ml'))
    press(page, 'ml', 'ArrowRight')
    check('M1: moving it writes the outer margin (right=), the inner one stays', 'left=3cm' in src(page) and 'right=2.25cm' in src(page), src(page)[:120])
    if os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        page.set_default_timeout(600000)
        r = ev(page, 'window.rikuy.api.compile()')
        page.set_default_timeout(30000)
        check('M1: it compiles in the page', r['ok'] and not [x for x in r['problems'] if x.get('severity') == 'error'])
    load_doc(page, RDOC); click_text(page, 'Second', 2); settle(page, 300)
    press(page, 'left', 'ArrowRight', 2)
    check('M2: two presses on Left Indent, two steps, 0.5 cm, the focus kept on it', '\\begin{adjustwidth}{0.5cm}{}' in src(page) and ev(page, 'window.rikuy.hist.length') == 2 and ev(page, "document.activeElement.getAttribute('aria-label')") == 'Left Indent', (src(page)[-120:], ev(page, 'window.rikuy.hist.length')))
    load_doc(page, RDOC); click_text(page, 'Second', 2); settle(page, 300)
    press(page, 'first', 'ArrowLeft')
    check('M3: First Line from \\parindent, one press left: \\noindent', '\\noindent Second' in src(page) and ev(page, 'window.rikuy.hist.length') == 1, src(page)[-100:])
    page.keyboard.press('ArrowLeft'); settle(page, 350)
    check('M3: again: a hanging indent of a quarter centimetre', '\\begin{adjustwidth}{-0.25cm}{}' in src(page) and '\\hangindent=0.25cm' in src(page) and ev(page, 'window.rikuy.hist.length') == 2, src(page)[-140:])
    page.keyboard.press('ArrowRight'); settle(page, 350); page.keyboard.press('ArrowRight'); settle(page, 350)
    check('M3: two presses right: \\parindent again, the source as it was', src(page) == RDOC.replace('\\begin{document}', '\\usepackage{changepage}\n\\begin{document}'), src(page)[-140:])
    load_doc(page, RDOC); click_text(page, 'Second', 2); settle(page, 300)
    f0 = marker(page, 'first')['v']
    ruler_drag('hang', 0.25)(page)
    check('M3: Hanging dragged right of the others but short of the first line writes nothing (the first line would move)', src(page) == RDOC and marker(page, 'first')['v'] == f0)
    press(page, 'hang', 'ArrowRight')
    check('M3: Hanging moved right by a press goes to the first line: the first line stays at \\parindent', '\\noindent' in src(page) and marker(page, 'first')['v'] == f0, (src(page)[-140:], marker(page, 'first')['v']))
    # (Grok Bot's check: R1's landscape pages) the ruler measures the turned page; its margins are
    # the portrait pages' and stay off there; an indent goes inside the landscape environment
    LAND = WRAP('Portrait words here.\n\\begin{landscape}\nLandscape words here, a paragraph on its own page.\n\\end{landscape}\nAfter.').replace('\\begin{document}', '\\usepackage{pdflscape}\n\\usepackage[left=3cm,right=2cm,top=2.5cm,bottom=4cm]{geometry}\n\\begin{document}')
    load_doc(page, LAND); settle(page, 400); click_text(page, 'Landscape words', 1); settle(page, 400)
    g = ev(page, "(() => { const pg = document.querySelector('#pages .page.land'), t = pg.querySelector('.it.p').getBoundingClientRect(), l = document.querySelector('#ruler .ru-mk.ru-left').getBoundingClientRect(), r = document.querySelector('#ruler .ru-mk.ru-right').getBoundingClientRect(); return { t: [t.left, t.right], l: l.left + l.width / 2, r: r.left + r.width / 2 }; })()")
    check('landscape: the indent markers stand at the turned page\'s text edges', abs(g['l'] - g['t'][0]) < 8 and abs(g['r'] - g['t'][1]) < 8, g)
    m = marker(page, 'ml')
    check('landscape: the margin markers are off, saying the margins are the portrait pages\'', m['off'] and 'portrait' in m['title'], m)
    press(page, 'left', 'ArrowRight')
    check('landscape: Left Indent writes adjustwidth inside the landscape environment', '\\begin{landscape}\n\\begin{adjustwidth}{0.25cm}{}\nLandscape words' in src(page), src(page)[-220:])
    ev(page, "window.rikuy.setRuler(false)")


with sync_playwright() as p:
    want = sys.argv[1:]
    browser, page, errors = open_page(p, 1366, 800)
    for name, fn in (('views', views), ('show_latex', show_latex), ('view_tab', view_tab), ('repeat_undo', repeat_undo), ('help_tab', help_tab), ('review', review), ('web', web), ('ruler', ruler), ('r5_ruler', r5_ruler)):
        if want and name not in want:
            continue
        try: fn(page)
        except Exception as e: check(name + ' ran to its end', False, repr(e)[:300])
    check('no errors in the page', not errors, errors[:3])
    browser.close()
    if not want or 'phones' in want:
        phones(p)

bad = [r for r in results if not r[1]]
print('%d checks, %d failed' % (len(results), len(bad)))
for r in bad: print('FAIL', r[0], str(r[2])[:300])
sys.exit(1 if bad else 0)
