"""The views and the View and Help tabs (src/cmd/view.js, src/cmd/help.js, src/tour.js), in Chromium.

The status bar's Page, LaTeX and PDF views, one at a time and at the same place: the caret's source
position into the LaTeX view and back, SyncTeX into the PDF view and back (where dist/tex exists),
no compile to switch when the PDF is current, Preview and Source still beside the page, the
preferences a reload opens with unchanged, the arrows between the three. Show LaTeX (Shift+F9; the
right click menu; Ctrl+Shift+= in the equation field): the block shown as its source where it
stands, the source unchanged by showing it, typing written as typed, one undo, Enter without a
mark, CRLF kept, Esc back, a selection over two paragraphs, a LaTeX paragraph of the document's
own left alone, the place kept when text before it changes, Word's model without it. The View
tab: Draft, Side to Side, Multiple pages, One page, 100%, Dark page, Focus and Esc, Show marks
(Ctrl+Shift+8) writing nothing, the zoom slider. Repeat (F4, Ctrl+Y with nothing to redo) and
Undo's list. Help: Learn Rikuy (its files, the live graph on the page, its PDF compiled where
dist/tex exists), Interactive graphs, Keyboard shortcuts, What's new. Phones at 390 and 360 px:
the three views in reach, 44 px targets, no sideways scroll, taps; screenshots light and dark in
$RIKUY_SHOTS (default /tmp/B12-shots).

RIKUY_DIST names another dist/."""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import open_page, check, results, src, load_doc, click_text, select_text
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist')
TEX = os.path.isdir(os.path.join(DIST, 'tex'))
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
    page.get_by_role('button', name='LaTeX view', exact=True).click(); page.wait_for_timeout(700)
    st = ev(page, "(() => { const g = window.rikuy, d = g.cm.getDoc(); return { cls: document.body.className, cur: d.indexFromPos(d.getCursor()), focus: g.cm.hasFocus(), desk: getComputedStyle(document.getElementById('desk')).visibility, pressed: document.getElementById('sv-latex').getAttribute('aria-pressed') }; })()")
    check('LaTeX view: the source across the window, its cursor at the caret\'s source position, focused', 'view-latex' in st['cls'] and st['cur'] == at and st['focus'] and st['desk'] == 'hidden' and st['pressed'] == 'true', (st, at))
    page.keyboard.type('XY'); page.wait_for_timeout(500)
    check('typing in the LaTeX view writes the source', 'omXYega' in src(page) or 'oXYmega' in src(page) or 'omeXYga' in src(page), src(page)[-80:])
    page.get_by_role('button', name='Page view', exact=True).click(); page.wait_for_timeout(900)
    c = ev(page, 'window.rikuy.caretNow()')
    s = src(page)
    check('back to Page: the caret where the cursor was in the source', c and abs(c['a'] - (s.index('XY') + 2)) <= 1 and 'view-latex' not in ev(page, 'document.body.className'), (c, s.index('XY')))
    check('the views leave the panes a reload opens with as they were', ev(page, "JSON.parse(localStorage.getItem('galley.prefs.v1') || '{}')").get('source') == prefs0.get('source'))
    # Source in another view: back to the page, the source beside it
    page.get_by_role('button', name='LaTeX view', exact=True).click(); page.wait_for_timeout(500)
    page.get_by_role('button', name='Source', exact=True).click(); page.wait_for_timeout(500)
    cls = ev(page, 'document.body.className')
    check('Source pressed in the LaTeX view: the page again, the source beside it', 'src-on' in cls and 'view-latex' not in cls and ev(page, "document.getElementById('sv-page').getAttribute('aria-pressed')") == 'true', cls)
    page.get_by_role('button', name='Source', exact=True).click(); page.wait_for_timeout(300)
    # the arrows move between the three; Enter presses
    page.focus('#sv-page'); page.keyboard.press('ArrowRight')
    check('the arrows move between the three views', ev(page, 'document.activeElement.id') == 'sv-latex')
    page.keyboard.press('ArrowLeft'); page.keyboard.press('ArrowLeft')
    check('and round', ev(page, 'document.activeElement.id') == 'sv-pdf')
    if not TEX:
        return
    click_text(page, 'omega', 1)
    t0 = time.time()
    page.get_by_role('button', name='PDF view', exact=True).click()
    page.wait_for_function('window.rikuy.lastPdf && !window.rikuy.compiling && window.rikuy.pdfView && window.rikuy.pdfView.pages.length', timeout=240000)
    page.wait_for_timeout(1500)
    st = ev(page, "(() => { const h = document.getElementById('pdf-host'); return { cls: document.body.className, top: h.scrollTop, max: h.scrollHeight - h.clientHeight }; })()")
    check('PDF view: TeX\'s PDF across the window, scrolled by SyncTeX to the caret\'s line (the last page)', 'view-pdf' in st['cls'] and st['top'] > st['max'] * 0.6, st)
    page.screenshot(path=os.path.join(SHOTS, 'view-pdf-1366.png'))
    # the top of the PDF's window, back on the page
    ev(page, "document.getElementById('pdf-host').scrollTop = 0"); page.wait_for_timeout(500)
    page.get_by_role('button', name='Page view', exact=True).click(); page.wait_for_timeout(900)
    c = ev(page, 'window.rikuy.caretNow()')
    check('back to Page from the PDF\'s top: the caret in the first paragraphs', c and c['a'] < src(page).index('Paragraph 4 '), c)
    # current PDF: no compile to switch
    ev(page, "window.rikuy.nCompiles = 0; { const f = window.rikuy.compilePdf; window.rikuy.compilePdf = function (...a) { this.nCompiles++; return f.apply(this, a); }; } 0")
    t0 = time.time()
    page.get_by_role('button', name='PDF view', exact=True).click(); page.wait_for_timeout(300)
    check('the PDF current: the PDF view without a compile, at once', ev(page, 'window.rikuy.nCompiles') == 0 and time.time() - t0 < 2, ev(page, 'window.rikuy.nCompiles'))
    # a click in the PDF view picks the place to go back to
    box = ev(page, "(() => { const p = window.rikuy.pdfView.pages[0].box.getBoundingClientRect(); return [p.left + p.width * 0.3, p.top + p.height * 0.35]; })()")
    page.mouse.click(box[0], box[1]); page.wait_for_timeout(600)
    spot = ev(page, 'window.rikuy.viewPdfSpot')
    check('a click on the PDF in the PDF view is kept as the place (the hidden page does not move)', spot and spot['f'] == 'main.tex' and spot['line'] > 2 and 'view-pdf' in ev(page, 'document.body.className'), spot)
    page.get_by_role('button', name='Page view', exact=True).click(); page.wait_for_timeout(900)
    c = ev(page, 'window.rikuy.caretNow()')
    line = src(page)[:c['a']].count('\n') + 1 if c else -1
    check('back to Page: the caret on the line clicked in the PDF', c and abs(line - spot['line']) <= 1, (line, spot))
    page.get_by_role('button', name='PDF view', exact=True).click(); page.wait_for_timeout(400)
    page.click('#pdf-x'); page.wait_for_timeout(400)
    cls = ev(page, 'document.body.className')
    check('the PDF pane closed in the PDF view: the page again', 'view-pdf' not in cls and 'pdf-on' not in cls and ev(page, "document.getElementById('sv-page').getAttribute('aria-pressed')") == 'true', cls)


def show_latex(page):
    load_doc(page, DOC)
    click_text(page, 'beta', 2)
    h0 = ev(page, 'window.rikuy.hist.length')
    page.keyboard.press('Shift+F9'); page.wait_for_timeout(400)
    box = ev(page, "(() => { const b = document.querySelector('.it.tex.texview'); return b && [b.textContent, b.getAttribute('aria-roledescription')]; })()")
    check('Shift+F9: the paragraph shown as its source where it stands, as a LaTeX view', box and box[0] == 'Alpha beta gamma.' and box[1] == 'LaTeX view', box)
    check('showing it writes nothing: the source and the history unchanged', src(page) == DOC and ev(page, 'window.rikuy.hist.length') == h0)
    check('Show LaTeX shows pressed there', ev(page, "(() => { const g = window.rikuy, at = g.ribbonAt(); return g.cmds.command('show-latex').on(g, at); })()") is True)
    page.keyboard.type(' \\emph{new}'); page.wait_for_timeout(400)
    s = src(page)
    check('typed in it, the source gets what is typed, as typed', '\\emph{new}' in s and s.replace(' \\emph{new}', '') == DOC, s[:120])
    check('the block stays a LaTeX view while typing', ev(page, "document.querySelectorAll('.it.tex.texview').length") == 1)
    page.keyboard.press('Enter'); page.wait_for_timeout(300)
    s2 = src(page)
    check('Enter in it: a line break in the source, no mark line', s2.count('% rikuy: latex') == 1 and len(s2) == len(s) + 1, s2[:140])
    page.keyboard.press('Escape'); page.wait_for_timeout(400)
    check('Esc: typeset again', ev(page, "document.querySelectorAll('.it.tex.texview').length") == 0)
    ev(page, 'window.rikuy.undo()'); ev(page, 'window.rikuy.undo()'); page.wait_for_timeout(300)
    check('undo gives the source back byte for byte', src(page) == DOC, src(page)[:120])
    # Backspace at its start leaves its edges alone
    click_text(page, 'Alpha', 0); page.keyboard.press('Shift+F9'); page.wait_for_timeout(300)
    page.keyboard.press('Home'); page.keyboard.press('Backspace'); page.wait_for_timeout(300)
    check('Backspace at its very start writes nothing', src(page) == DOC)
    page.keyboard.press('Shift+F9'); page.wait_for_timeout(300)
    check('Shift+F9 again: typeset again', ev(page, "document.querySelectorAll('.it.tex.texview').length") == 0)
    # the equation, from its field: Ctrl+Shift+=
    page.locator('.dm').first.click(); page.wait_for_timeout(800)
    page.keyboard.press('Control+Shift+Equal'); page.wait_for_timeout(500)
    box = ev(page, "(() => { const b = document.querySelector('.it.tex.texview'); return b && b.textContent; })()")
    check('Ctrl+Shift+= in the equation field: the equation shown as its LaTeX on the page (Word\'s Linear)', box and box.startswith('\\begin{equation}') and box.endswith('\\end{equation}') and not ev(page, 'window.rikuy.pop'), box)
    check('and the source unchanged', src(page) == DOC)
    ev(page, 'window.rikuy.hideLatexViews()'); page.wait_for_timeout(200)
    # a selection over two paragraphs: both
    ev(page, """(() => { const g = window.rikuy, s = g.src('main.tex'); g.restoreCaret({ f: 'main.tex', selA: s.indexOf('beta'), selB: s.indexOf('epsilon') }); })()""")
    page.wait_for_timeout(200)
    ev(page, "window.rikuy.runCommand('show-latex')"); page.wait_for_timeout(400)
    n = ev(page, "document.querySelectorAll('.it.tex.texview').length")
    check('a selection over a paragraph, an equation and a paragraph: each shown as LaTeX', n == 3, n)
    # text before a shown block changes: it stays shown
    ev(page, 'window.rikuy.hideLatexViews()')
    click_text(page, 'Delta', 2); ev(page, "window.rikuy.runCommand('show-latex')"); page.wait_for_timeout(300)
    ev(page, "window.rikuy.api.setSource(window.rikuy.api.getSource().replace('Alpha', 'Alpha and more words'))"); page.wait_for_timeout(600)
    box = ev(page, "(() => { const b = document.querySelector('.it.tex.texview'); return b && b.textContent; })()")
    check('text written before a block shown as LaTeX: the same block stays shown', box == 'Delta epsilon.', box)
    ev(page, 'window.rikuy.undo()'); page.wait_for_timeout(400)
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
    page.locator('.it', has_text='Alpha beta').first.click(button='right'); page.wait_for_timeout(300)
    check('the right click menu has Show LaTeX', page.get_by_role('menuitem', name='Show LaTeX').count() == 1)
    page.keyboard.press('Escape')
    # CRLF
    crlf = DOC.replace('\n', '\r\n')
    load_doc(page, crlf); click_text(page, 'beta', 2); page.keyboard.press('Shift+F9'); page.wait_for_timeout(300)
    page.keyboard.press('End'); page.keyboard.press('Enter'); page.keyboard.type('q'); page.wait_for_timeout(300)
    check('a CRLF file keeps CRLF: Enter in a LaTeX view writes \\r\\n', src(page) == crlf.replace('gamma.', 'gamma.\r\nq'), repr(src(page)[:90]))
    page.keyboard.press('Escape')
    # opened again: no view carried into another document
    ev(page, "window.rikuy.runCommand('show-latex')")
    load_doc(page, DOC); page.wait_for_timeout(300)
    check('another document opened: nothing shown as LaTeX', ev(page, "document.querySelectorAll('.it.tex.texview').length") == 0)


def view_tab(page):
    load_doc(page, LONG)
    page.get_by_role('tab', name='View', exact=True).click(); page.wait_for_timeout(300)
    for n in ('Read Mode', 'Print Layout', 'LaTeX Mode', 'Draft', 'Show LaTeX', 'Show marks', 'One page', 'Multiple pages', 'Side to Side', 'Dark page', 'Focus', '100%', 'Page width'):
        check('View has ' + n, page.get_by_role('button', name=n, exact=True).count() == 1)
    page.get_by_role('button', name='Draft', exact=True).click(); page.wait_for_timeout(400)
    g = ev(page, "(() => { const p = [...document.querySelectorAll('.page')]; return p.length > 1 && Math.round(p[1].getBoundingClientRect().top - p[0].getBoundingClientRect().bottom); })()")
    check('Draft: the pages run on, no gap between them', g == 0 and ev(page, "document.getElementById('rw-draft').getAttribute('aria-pressed')") == 'true', g)
    page.get_by_role('button', name='Print Layout', exact=True).click(); page.wait_for_timeout(400)
    check('Print Layout: the pages apart again', 'pg-draft' not in ev(page, 'document.body.className'))
    page.get_by_role('button', name='Side to Side', exact=True).click(); page.wait_for_timeout(500)
    r = ev(page, "(() => { const p = [...document.querySelectorAll('.page')]; const a = p[0].getBoundingClientRect(), b = p[1].getBoundingClientRect(); return [Math.round(a.top - b.top), b.left > a.right]; })()")
    check('Side to Side: the pages in a row', r == [0, True], r)
    page.get_by_role('button', name='Multiple pages', exact=True).click(); page.wait_for_timeout(700)
    r = ev(page, "(() => { const p = [...document.querySelectorAll('.page')], d = document.getElementById('desk').getBoundingClientRect(); const a = p[0].getBoundingClientRect(), b = p[1].getBoundingClientRect(); return [Math.abs(a.top - b.top) < 2, b.right <= d.right + 1, a.bottom <= d.bottom + 60]; })()")
    check('Multiple pages: two pages side by side, both in the window', r == [True, True, True], r)
    page.get_by_role('button', name='One page', exact=True).click(); page.wait_for_timeout(700)
    r = ev(page, "(() => { const p = document.querySelector('.page').getBoundingClientRect(), d = document.getElementById('desk'); return [Math.round(p.height), d.clientHeight]; })()")
    check('One page: a whole page in the window\'s height', r[0] <= r[1], r)
    page.get_by_role('button', name='100%', exact=True).click(); page.wait_for_timeout(500)
    check('100%: actual size, pages one under the other', abs(ev(page, 'window.rikuy.px') - 96 / 72.27) < 0.01 and 'pg-grid' not in ev(page, 'document.body.className'))
    page.get_by_role('button', name='Dark page', exact=True).click(); page.wait_for_timeout(300)
    bg = ev(page, "getComputedStyle(document.querySelector('.page')).backgroundColor")
    check('Dark page: the page dark, kept for the next visit, the source untouched', bg == 'rgb(30, 34, 39)' and ev(page, "JSON.parse(localStorage.getItem('galley.prefs.v1')).darkPage") is True and src(page) == LONG, bg)
    page.screenshot(path=os.path.join(SHOTS, 'view-dark-page-1366.png'))
    page.get_by_role('button', name='Dark page', exact=True).click()
    click_text(page, 'Paragraph 3', 3)
    page.keyboard.press('Control+Shift+8'); page.wait_for_timeout(300)
    marks = ev(page, "getComputedStyle(document.querySelector('.it.p'), '::after').content")
    check('Ctrl+Shift+8: Show marks draws the paragraph ends and writes nothing', 'show-marks' in ev(page, 'document.body.className') and '\u00b6' in marks and src(page) == LONG, marks)
    page.keyboard.press('Control+Shift+8')
    page.get_by_role('tab', name='View', exact=True).click(); page.wait_for_timeout(200)
    page.get_by_role('button', name='Focus', exact=True).click(); page.wait_for_timeout(400)
    hid = ev(page, "['bar', 'ribbon', 'status'].map((i) => getComputedStyle(document.getElementById(i)).display)")
    check('Focus: the bars hidden, Leave Focus at hand', hid == ['none', 'none', 'none'] and page.get_by_role('button', name='Leave Focus', exact=True).is_visible(), hid)
    page.screenshot(path=os.path.join(SHOTS, 'view-focus-1366.png'))
    click_text(page, 'Paragraph 2', 3); page.keyboard.press('Escape'); page.wait_for_timeout(400)
    check('Esc: the bars back', 'focus' not in ev(page, 'document.body.className').split() and page.locator('#bar').is_visible())
    # the zoom slider
    ev(page, "(() => { const s = document.getElementById('st-zoom'); s.value = '150'; s.dispatchEvent(new Event('input')); })()"); page.wait_for_timeout(500)
    check('the zoom slider: 150 shows the page at 150%', abs(ev(page, 'window.rikuy.px') / (96 / 72.27) - 1.5) < 0.01 and ev(page, "document.getElementById('st-zoomv').textContent") == '150%')
    page.get_by_role('button', name='Zoom level', exact=True).click(); page.wait_for_timeout(400)
    check('the zoom level: a press gives actual size', ev(page, "document.getElementById('st-zoomv').textContent") == '100%')
    page.get_by_role('button', name='Page width', exact=True).click()


def repeat_undo(page):
    d = WRAP('One two three four.')
    load_doc(page, d)
    select_text(page, 'two'); ev(page, "window.rikuy.runCommand('bold')"); page.wait_for_timeout(300)
    select_text(page, 'four'); page.keyboard.press('F4'); page.wait_for_timeout(300)
    check('F4 repeats the last command (Bold) on the new selection', src(page) == d.replace('two', '\\textbf{two}').replace('four', '\\textbf{four}'), src(page))
    select_text(page, 'One'); page.keyboard.press('Control+y'); page.wait_for_timeout(300)
    check('Ctrl+Y with nothing to redo repeats it too', '\\textbf{One}' in src(page), src(page))
    page.get_by_role('button', name='Undo options', exact=True).click(); page.wait_for_timeout(300)
    items = page.get_by_role('menuitem').all_inner_texts()
    check('Undo options lists the last steps', len(items) >= 3 and items[0].startswith('Undo: '), items)
    page.get_by_role('menuitem').nth(1).click(); page.wait_for_timeout(400)
    check('its second item undoes two steps at once', src(page) == d.replace('two', '\\textbf{two}'), src(page))


def help_tab(page):
    page.get_by_role('tab', name='Help', exact=True).click(); page.wait_for_timeout(300)
    for n in ('How it works', 'Learn Rikuy', 'Interactive graphs', 'Keyboard shortcuts', "What's new", 'Report a problem', 'For AI agents'):
        check('Help has ' + n, page.get_by_role('button', name=n, exact=True).count() == 1)
    page.get_by_role('button', name='Interactive graphs', exact=True).click(); page.wait_for_timeout(400)
    dlg = page.get_by_role('dialog', name='Interactive graphs', exact=True)
    check('Interactive graphs: a guide with \\rikuywidget and the height message', dlg.count() == 1 and '\\rikuywidget[width=\\textwidth]' in dlg.inner_text() and 'postMessage' in dlg.inner_text())
    page.screenshot(path=os.path.join(SHOTS, 'help-graphs-1366.png'))
    dlg.get_by_role('button', name='Open Learn Rikuy', exact=True).click(); page.wait_for_timeout(1500)
    st = ev(page, "(() => { const g = window.rikuy; return { name: g.name, files: [...g.files.keys()].sort(), assets: [...g.assetBlobs.keys()], frames: document.querySelectorAll('.wlayer iframe').length }; })()")
    check('Learn Rikuy opens a document of its own: main.tex, rikuy.sty, the widget and its picture', st['name'].startswith('Learn Rikuy') and st['files'] == ['main.tex', 'rikuy.sty', 'widgets/wave.html'] and st['assets'] == ['figures/wave.pdf'], st)
    page.wait_for_timeout(1500)
    check('its live graph runs on the page', ev(page, "document.querySelectorAll('.wlayer iframe').length") == 1)
    pdf = ev(page, "(async () => { const b = await window.rikuy.assetBlobs.get('figures/wave.pdf').arrayBuffer(); return new TextDecoder().decode(b); })()")
    check('its picture for TeX is a PDF of one page with a cross reference table that adds up', pdf.startswith('%PDF-1.4') and '/MediaBox [0 0 360 160]' in pdf and pdf.rstrip().endswith('%%EOF') and int(pdf.split('startxref\n')[1].split()[0]) == pdf.index('xref\n0 6'))
    if TEX:
        r = ev(page, "window.rikuy.api.compile()")
        check('Learn Rikuy compiles in the page, its graph the picture', r['ok'] and r['pages'] >= 2 and not [x for x in r['problems'] if x.get('sev') == 'error'], (r['ok'], r['pages'], r['problems'][:3]))
    page.get_by_role('tab', name='Help', exact=True).click(); page.wait_for_timeout(200)
    page.get_by_role('button', name='Keyboard shortcuts', exact=True).click(); page.wait_for_timeout(300)
    t = page.get_by_role('dialog', name='Keyboard shortcuts', exact=True).inner_text()
    check('Keyboard shortcuts lists the registry\'s keys by tab: Shift+F9 Show LaTeX, F4 Repeat, Ctrl+B Bold', 'Shift+F9' in t and 'Show LaTeX' in t and 'F4' in t and 'Repeat' in t and 'Ctrl+B' in t, t[:200])
    page.keyboard.press('Escape')
    page.get_by_role('button', name="What's new", exact=True).click(); page.wait_for_timeout(300)
    check("What's new is a dialog naming the views", 'Page, LaTeX, PDF' in page.get_by_role('dialog', name="What's new", exact=True).inner_text())
    page.keyboard.press('Escape')


def phones(p):
    for w, h, dark in ((390, 844, False), (360, 740, True), (390, 844, True), (360, 740, False)):
        tag = ' (%d px%s)' % (w, ', dark' if dark else '')
        browser, page, errors = open_page(p, w, h, dark=dark, touch=True)
        page.evaluate("window.rikuy.runCommand('help-tour')"); page.wait_for_timeout(1500)
        r = ev(page, "[...document.querySelectorAll('.st-views button')].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.right), Math.round(r.width), Math.round(r.height)]; })")
        check('the three views in reach, each 44 px or more' + tag, len(r) == 3 and all(x[0] <= w and x[1] >= 44 and x[2] >= 44 for x in r), r)
        check('no sideways scroll' + tag, ev(page, 'document.documentElement.scrollWidth') <= w)
        page.screenshot(path=os.path.join(SHOTS, 'phone-%d%s-page.png' % (w, '-dark' if dark else '')))
        page.tap('#sv-latex'); page.wait_for_timeout(900)
        sp = ev(page, "(() => { const r = document.getElementById('srcpane').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.width)]; })()")
        check('LaTeX by a tap: the source across the screen' + tag, sp == [0, w] and ev(page, 'document.documentElement.scrollWidth') <= w, sp)
        page.screenshot(path=os.path.join(SHOTS, 'phone-%d%s-latex.png' % (w, '-dark' if dark else '')))
        page.tap('#sv-page'); page.wait_for_timeout(700)
        check('Page by a tap' + tag, 'view-latex' not in ev(page, 'document.body.className'))
        if w == 390 and not dark:
            # Show LaTeX without a right click: the View tab's button, by a tap
            el = page.locator('.it.p').nth(1)
            el.tap(); page.wait_for_timeout(300)
            ev(page, "window.rikuy.selectTab('view')"); page.wait_for_timeout(300)
            b = page.locator('#rw-showtex')
            bb = b.bounding_box()
            b.tap(); page.wait_for_timeout(500)
            check('Show LaTeX by a tap on View\'s button (a phone has no right click), 44 px', ev(page, "document.querySelectorAll('.it.tex.texview').length") == 1 and bb and bb['height'] >= 44, bb)
            page.screenshot(path=os.path.join(SHOTS, 'phone-390-showlatex.png'))
            ev(page, 'window.rikuy.hideLatexViews()')
            ev(page, "window.rikuy.runCommand('help-graphs')"); page.wait_for_timeout(500)
            dl = ev(page, "(() => { const d = document.querySelector('.pop'); const r = d.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), d.scrollHeight > d.clientHeight || r.bottom <= innerHeight]; })()")
            check('Interactive graphs fits the screen and scrolls' + tag, dl[0] >= 0 and dl[1] <= w and dl[2], dl)
            page.screenshot(path=os.path.join(SHOTS, 'phone-390-graphs.png'))
        check('no errors' + tag, not errors, errors)
        browser.close()


with sync_playwright() as p:
    want = sys.argv[1:]
    browser, page, errors = open_page(p, 1366, 800)
    for name, fn in (('views', views), ('show_latex', show_latex), ('view_tab', view_tab), ('repeat_undo', repeat_undo), ('help_tab', help_tab)):
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
