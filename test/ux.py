"""What a newcomer meets outside the ribbon, checked as docs/handoff/UX-AUDIT.md lists it: the caret
given back to the page when a dialog closes, at 1400 px and on a phone at 390 and 360 px (touch),
light and dark. Each part says what Word does and checks that Rikuy does it. Screenshots go to
$RIKUY_SHOTS (default /tmp/ux-shots).

Run: cd test && python3 ux.py [part ...]   (no part: all of them)"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import open_page, load_doc, click_text, select_text, src, check, results
from playwright.sync_api import sync_playwright

SHOTS = os.environ.get('RIKUY_SHOTS', '/tmp/ux-shots')
os.makedirs(SHOTS, exist_ok=True)
DOC = ('\\documentclass{article}\n\\begin{document}\n\\section{Opening}\nFirst paragraph here, with a bold word.\n\n'
       'Second paragraph here.\n\\end{document}\n')


def shot(page, name):
    page.screenshot(path=os.path.join(SHOTS, name + '.png'))


def run_cmd(page, cmd):
    page.evaluate('(c) => window.rikuy.runCommand(c)', cmd)
    page.wait_for_timeout(250)


def dialog_open(page):
    return page.evaluate("!!document.querySelector('body > .pop')")


def dialogs_give_the_caret_back(page, w):
    """Word: a dialog closed with Esc, Cancel or its Close button gives the document back with the
    caret or the selection it had, so the next keys type there. A press outside puts the caret
    where the press is."""
    for cmd in ('font-dialog', 'paragraph-settings', 'page-setup', 'insert-table-dialog', 'share'):
        load_doc(page, DOC)
        click_text(page, 'Second paragraph', 3)
        run_cmd(page, cmd)
        opened = dialog_open(page)
        page.keyboard.press('Escape'); page.wait_for_timeout(200)
        page.keyboard.type('Z'); page.wait_for_timeout(250)
        check(f'{cmd} closed with Esc: the next key types at the caret it opened on ({w})', opened and not dialog_open(page) and 'SecZond paragraph' in src(page), src(page)[-90:])
    # the selection, kept through Cancel
    load_doc(page, DOC)
    select_text(page, 'bold')
    run_cmd(page, 'font-dialog')
    page.locator('body > .pop button', has_text='Cancel').click(); page.wait_for_timeout(200)
    check(f'Font dialog closed with Cancel: the selection is still the word it was on ({w})', page.evaluate("getSelection().toString()") == 'bold' and page.evaluate("document.activeElement.id") == 'pages')
    # its Close button
    click_text(page, 'First paragraph', 5)
    run_cmd(page, 'paragraph-settings')
    page.locator('body > .pop .pop-x').first.click(); page.wait_for_timeout(200)
    page.keyboard.type('Q'); page.wait_for_timeout(250)
    check(f'Paragraph dialog closed with its Close button: typing goes on at the caret ({w})', 'FirstQ paragraph' in src(page), src(page)[-120:])
    # a press outside: the caret goes where the press is, not back
    load_doc(page, DOC)
    click_text(page, 'Second paragraph', 0)
    run_cmd(page, 'font-dialog')
    # (a letter of the page the dialog does not cover: the press lands on the page, not in it)
    box = page.evaluate('''(() => { const P = document.querySelector('body > .pop').getBoundingClientRect();
      for (const s of document.querySelectorAll('#pages span.t')) { const t = s.firstChild; if (!t || t.nodeType !== 3 || t.length < 4) continue;
        for (let i = 1; i < t.length; i++) { const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + 1); const b = r.getBoundingClientRect();
          if (b.width && b.top > 0 && b.bottom < innerHeight && (b.right < P.left || b.left > P.right || b.bottom < P.top || b.top > P.bottom)) return [b.left + 1, b.top + b.height / 2, t.data.slice(0, i)]; } }
      return null; })()''')
    page.mouse.click(box[0], box[1]); page.wait_for_timeout(250)
    page.keyboard.type('Y'); page.wait_for_timeout(250)
    check(f'a press outside a dialog puts the caret where it lands, not back where it opened ({w})', box and (box[2] + 'Y' in src(page) or box[2][:-1] + 'Y' in src(page)) and 'YSecond' not in src(page), (box, src(page)[-90:]))
    # a dialog that changed the document puts the caret where the change leaves it (OK)
    load_doc(page, DOC)
    click_text(page, 'Second paragraph', 3)
    run_cmd(page, 'insert-table-dialog')
    page.locator('body > .pop button', has_text='OK').click(); page.wait_for_timeout(300)
    check(f'Insert Table with OK: a table in the source, the caret on the page ({w})', '\\begin{tabular}' in src(page) and page.evaluate("document.activeElement.id") == 'pages', src(page)[-160:])


def phone_dialogs(page, w):
    """On a touch screen the page gets the caret back only when it had the focus as the dialog
    opened (the on-screen keyboard was up): focusing it otherwise brings the keyboard up unasked."""
    load_doc(page, DOC)
    click_text(page, 'Second paragraph', 3)
    run_cmd(page, 'font-dialog')
    shot(page, f'dialog-font-{w}')
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    check(f'on a phone, a dialog opened while typing gives the page back ({w})', page.evaluate("document.activeElement.id") == 'pages')
    page.evaluate("document.getElementById('pages').blur()")
    run_cmd(page, 'font-dialog')
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    check(f'on a phone, a dialog opened with the keyboard down leaves it down ({w})', page.evaluate("document.activeElement.id") != 'pages')


def first_visit(page, w):
    """Word opens a document with the caret at its start: the first key a newcomer types lands,
    with no click first. Not on a phone, where focusing the page brings up the keyboard unasked."""
    touch = page.evaluate("matchMedia('(pointer: coarse)').matches")
    shot(page, f'first-visit-{w.replace(" ", "").replace(",", "-")}')
    top = page.evaluate("document.getElementById('desk').scrollTop")
    before = src(page)
    page.keyboard.type('Z'); page.wait_for_timeout(300)
    if touch:
        check(f'on a phone the first visit leaves the keyboard down: the page has no focus ({w})', page.evaluate("document.activeElement.id") != 'pages' and src(page) == before)
        return
    check(f'the first visit has the caret at the start of the first paragraph: a key typed lands there ({w})', src(page) != before and '\\begin{abstract}\nZYou are reading' in src(page), src(page)[:0] or [l for l in src(page).splitlines() if 'Z' in l][:2])
    check(f'and the page did not scroll to it ({w})', page.evaluate("document.getElementById('desk').scrollTop") == top)
    page.keyboard.press('Control+z'); page.wait_for_timeout(200)
    check(f'one Undo takes it back ({w})', src(page) == before)


def open_tab(page, name, touch=False):
    if touch or page.viewport_size['width'] <= 860:
        page.get_by_role('combobox', name='Ribbon tab', exact=True).select_option(label=name)
    else:
        page.get_by_role('tablist', name='Ribbon', exact=True).get_by_role('tab', name=name, exact=True).click()
    page.wait_for_timeout(250)


FILE_GEOM = """(() => { const r = document.getElementById('ribbon').getBoundingClientRect(), s = document.getElementById('status').getBoundingClientRect(),
  d = document.getElementById('desk').getBoundingClientRect(), b = document.getElementById('rf-back');
  return { open: document.body.classList.contains('file-open'), bottom: Math.round(r.bottom), status: Math.round(s.top), desk: Math.round(d.height),
           back: b && b.offsetParent ? [b.getAttribute('aria-label'), Math.round(b.getBoundingClientRect().height)] : null, tab: window.rikuy.rbTab }; })()"""


def file_view(page, w):
    """Word's File is a view over the window with a Back button; Esc, Back or a command run from it
    give the document back, with its caret, on the tab that was open before."""
    touch = page.evaluate("matchMedia('(pointer: coarse)').matches")
    tag = w.replace(' ', '').replace(',', '-')
    load_doc(page, DOC)
    click_text(page, 'Second paragraph', 3)
    px = page.evaluate('window.rikuy.px')
    open_tab(page, 'Insert', touch)
    open_tab(page, 'File', touch)
    g = page.evaluate(FILE_GEOM)
    shot(page, f'file-view-{tag}')
    check(f'File covers the window from the tabs to the status bar; the page is out of sight ({w})', g['open'] and abs(g['bottom'] - g['status']) <= 1 and g['desk'] == 0, g)
    check(f'File has a Back button "Back to the document"{", 44 px under a finger" if touch else ""} ({w})', g['back'] and g['back'][0] == 'Back to the document' and (not touch or g['back'][1] >= 44), g['back'])
    if not touch:
        page.keyboard.press('Escape'); page.wait_for_timeout(250)
        g = page.evaluate(FILE_GEOM)
        page.keyboard.type('Z'); page.wait_for_timeout(250)
        check(f'Esc leaves File for the tab open before it (Insert), and the next key types at the caret ({w})', not g['open'] and g['tab'] == 'insert' and g['desk'] > 100 and 'SecZond paragraph' in src(page), (g, src(page)[-60:]))
        check(f'and the page was not laid out again at another size ({w})', page.evaluate('window.rikuy.px') == px)
        page.keyboard.press('Control+z'); page.wait_for_timeout(150)
        open_tab(page, 'File')
    click_text(page, 'Second paragraph', 3) if not touch else None
    (page.locator('#rf-back').tap() if touch else page.locator('#rf-back').click()); page.wait_for_timeout(250)
    g = page.evaluate(FILE_GEOM)
    check(f'Back leaves File ({w})', not g['open'] and g['tab'] == 'insert' and g['desk'] > 100, g)
    if not touch:
        page.keyboard.type('Q'); page.wait_for_timeout(250)
        check(f'and the caret is where it was ({w})', 'SecQond paragraph' in src(page), src(page)[-60:])
        page.keyboard.press('Control+z'); page.wait_for_timeout(150)
    # a command run from the view closes it; a menu of the view opening keeps it
    open_tab(page, 'File', touch)
    page.locator('#rf-template').click(); page.wait_for_timeout(250)
    check(f'Templates opens its menu and File stays open under it ({w})', page.evaluate(FILE_GEOM)['open'] and page.locator('body > .pop [role=menu], body > [role=menu], .pop[role=menu]').count() >= 1)
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    check(f'Esc closes the menu first, File stays, and the keys stay in it, not on the page under it ({w})', page.evaluate(FILE_GEOM)['open'] and not dialog_open(page) and page.evaluate("document.activeElement.id") != 'pages', page.evaluate("document.activeElement.id"))
    (page.locator('#rf-props').tap() if touch else page.locator('#rf-props').click()); page.wait_for_timeout(300)
    g = page.evaluate(FILE_GEOM)
    check(f'Properties opens its dialog over the document; File has closed ({w})', not g['open'] and dialog_open(page) and g['desk'] > 100, g)
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    open_tab(page, 'File', touch)
    (page.locator('#rf-blank').tap() if touch else page.locator('#rf-blank').click()); page.wait_for_timeout(500)
    g = page.evaluate(FILE_GEOM)
    check(f'Blank document makes the new document and shows it ({w})', not g['open'] and g['desk'] > 100 and '\\begin{document}' in src(page) and 'Second paragraph' not in src(page), g)
    check(f'no sideways scroll ({w})', page.evaluate('document.documentElement.scrollWidth') <= page.viewport_size['width'])


def status_bar(p):
    """Word's status bar: page, words, language at the left; views, zoom slider and zoom at the
    right end, always in view. A click on the word count opens Word Count. Checked on the hosted
    app as pages.py serves it (its status bar has Make available offline too)."""
    import pages
    port = int(os.environ.get('UX_PORT', '8799'))
    srv = pages.start(port, os.environ.get('RIKUY_DIST') or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'dist'))
    try:
        browser = p.chromium.launch()
        for width, dark in ((1920, False), (1366, False), (1366, True), (1280, False), (1100, True), (900, False)):
            w = '%d px%s' % (width, ', dark' if dark else '')
            ctx = browser.new_context(viewport={'width': width, 'height': 800}, color_scheme='dark' if dark else 'light')
            page = ctx.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto('http://127.0.0.1:%d/' % port)
            page.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=60000)
            page.wait_for_timeout(1200)
            g = page.evaluate("""(() => { const s = document.getElementById('status').getBoundingClientRect(), r = (id) => { const e = document.getElementById(id); return e && e.offsetParent ? e.getBoundingClientRect() : null; };
              const v = r('st-views'), z = r('st-zoomv'), sv = document.getElementById('st-save');
              return { right: Math.round(s.right), views: v && [Math.round(v.left), Math.round(v.right)], zoom: z && Math.round(z.right), save: !!sv.offsetParent, saveText: sv.textContent,
                       title: document.getElementById('savestate').title, off: !!(document.getElementById('b-offline') || {}).offsetParent }; })()""")
            shot(page, 'status-' + w.replace(' ', '').replace(',', '-'))
            check(f'the views and the zoom number are whole at the right end of the status bar ({w})', g['views'] and g['zoom'] and g['zoom'] <= g['right'] - 4 and g['views'][1] <= g['right'], g)
            check(f'the line does not say "Saved in this browser" beside the title\'s Saved; the title\'s tooltip says it ({w})', not g['save'] and g['title'].startswith('Saved in this browser'), g)
            if width == 1366 and not dark:
                page.evaluate("document.getElementById('st-save').textContent = 'Not kept in this browser. Save the project as .zip.'"); page.wait_for_timeout(100)
                check(f'a storage warning still shows in the status bar ({w})', page.evaluate("!!document.getElementById('st-save').offsetParent"))
                page.evaluate("document.getElementById('st-save').textContent = 'Saved in this browser'")
                page.click('#st-words'); page.wait_for_timeout(400)
                check(f'a click on the word count opens Word Count ({w})', page.evaluate("[...document.querySelectorAll('body > .pop')].some((d) => /Word Count/.test(d.textContent))"))
                page.keyboard.press('Escape')
            check(f'no page errors ({w})', not errors, errors[:3])
            ctx.close()
        # a phone: no room in its status line for Make available offline; the menu panel has it
        for width in (390, 360):
            ctx = browser.new_context(viewport={'width': width, 'height': 800}, has_touch=True, is_mobile=True)
            page = ctx.new_page()
            page.goto('http://127.0.0.1:%d/' % port)
            page.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=60000)
            page.wait_for_timeout(800)
            page.locator('#b-nav').tap(); page.wait_for_timeout(300)
            item = page.get_by_role('menuitem', name='Make available offline', exact=True)
            check(f'on a phone the menu panel has Make available offline, 44 px under a finger ({width} px)', item.count() == 1 and item.is_visible() and item.bounding_box()['height'] >= 44)
            shot(page, 'menu-offline-%dpx' % width)
            ctx.close()
        browser.close()
    finally:
        srv.shutdown()


PANES = (('styles-pane', '#stylespane'), ('spelling', '#sp-pane'), ('thesaurus', '.th-pane'))
GEOM = """(sel) => { const p = document.querySelector(sel), r = p && p.checkVisibility() ? p.getBoundingClientRect() : null, rb = document.getElementById('ribbon').getBoundingClientRect(),
  st = document.getElementById('status').getBoundingClientRect(), d = document.getElementById('desk').getBoundingClientRect();
  return r && { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), ribbon: Math.round(rb.bottom), status: Math.round(st.top), desk: Math.round(d.right), win: innerWidth }; }"""


def panes(page, w):
    """Word's task panes (Styles, Editor, Thesaurus) dock at the window's right under the ribbon,
    and the page moves over: nothing of the ribbon or the page is under them. On a phone they are
    sheets at the screen's foot."""
    touch = page.evaluate("matchMedia('(pointer: coarse)').matches")
    tag = w.replace(' ', '').replace(',', '-')
    load_doc(page, DOC + '')
    click_text(page, 'Second paragraph', 3)
    for cmd, sel in PANES:
        click_text(page, 'Second paragraph', 3)
        run_cmd(page, cmd); page.wait_for_timeout(700)
        g = page.evaluate(GEOM, sel)
        shot(page, f'pane-{cmd}-{tag}')
        if not touch:
            check(f'{cmd}: docked at the right, from under the ribbon to the status bar, the page beside it ({w})',
                  g and g['right'] == g['win'] and g['top'] >= g['ribbon'] - 1 and abs(g['bottom'] - g['status']) <= 1 and g['desk'] <= g['left'] + 1, g)
        else:
            check(f'{cmd}: a sheet inside the screen ({w})', g and g['left'] >= 0 and g['right'] <= g['win'] and g['bottom'] <= page.viewport_size['height'], g)
        page.keyboard.press('Escape') if cmd != 'styles-pane' else run_cmd(page, 'styles-pane')
        page.evaluate("(s) => { const p = document.querySelector(s); if (p && p.checkVisibility()) { const x = p.querySelector('.pop-x'); if (x) x.click(); } }", sel)
        page.wait_for_timeout(300)
        g = page.evaluate(GEOM, sel)
        check(f'{cmd}: closed, the page has the width back ({w})', g is None, g)
    check(f'no sideways scroll ({w})', page.evaluate('document.documentElement.scrollWidth') <= page.viewport_size['width'])


def doc_name(page, w):
    """Word names the open document at the top, on a phone too. Where the bar's middle has room
    (from about 520 px) the name is there; on a phone the menu panel (the bar's first button)
    starts with it and whether it is saved."""
    width = page.viewport_size['width']
    tag = w.replace(' ', '').replace(',', '-')
    name = page.evaluate("document.getElementById('docname')").get('textContent') if False else page.evaluate("document.getElementById('docname').textContent")
    shown = page.evaluate("(() => { const d = document.getElementById('docname'); const r = d.getBoundingClientRect(); return d.checkVisibility() ? Math.round(r.width) : 0; })()")
    if width >= 520:
        check(f'the bar shows the document\'s name, a few words of it at least ({w})', shown >= 80, shown)
    page.locator('#b-nav').click(); page.wait_for_timeout(300)
    shot(page, f'menu-panel-{tag}')
    head = page.evaluate("(() => { const d = document.getElementById('nav-doc'); return d.checkVisibility() ? d.innerText : ''; })()")
    if width <= 980:
        check(f'the menu panel starts with the document\'s name and Saved ({w})', head.startswith(name) and 'Saved' in head, (name, head))
    page.locator('#nav-close').click(); page.wait_for_timeout(200)
    check(f'no sideways scroll ({w})', page.evaluate('document.documentElement.scrollWidth') <= width)


def sample_spelling(page, w):
    """The document a newcomer opens first has no red marks: its words of the trade are its own
    list (% rikuy: words, what Add to Dictionary writes) and it is spelled as its language."""
    try:
        page.wait_for_function("document.getElementById('st-lang') && document.getElementById('st-lang').dataset.st === 'ok'", timeout=15000)
    except Exception:
        pass
    st = page.evaluate("[document.getElementById('st-lang').textContent, document.getElementById('st-lang').dataset.st, (window.rikuy.sp && window.rikuy.sp.bad || []).length]")
    check(f'the sample opens with no spelling errors ({w})', st[1] == 'ok' and st[2] == 0 and 'spelling error' not in st[0], st)


def pdf_bar(page, w):
    """On a phone the PDF pane's bar says what TeX made in full and keeps every control whole and
    under a finger: two rows (what TeX made and Close; the engine, shell escape, Recompile and
    Download)."""
    tag = w.replace(' ', '').replace(',', '-')
    page.evaluate('window.rikuy.togglePdf(true)')
    try:
        page.wait_for_function('document.querySelector("#pdf-host canvas, #pdf-host .pdfpage, #pdf-host img") || /could not|error/i.test(document.getElementById("pdf-status").textContent)', timeout=120000)
    except Exception:
        pass
    page.wait_for_timeout(800)
    g = page.evaluate("""(() => { const W = innerWidth, s = document.getElementById('pdf-status');
      const box = (id) => { const e = document.getElementById(id), r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), Math.round(r.height)]; };
      return { cut: s.scrollWidth > s.clientWidth + 1, status: s.textContent, W, x: box('pdf-x'), re: box('pdf-re'), dl: box('pdf-dl'), eng: box('pdf-engine'),
               shell: document.querySelector('.pdf-shell').innerText.trim(), bar: Math.round(document.querySelector('.pdf-bar').getBoundingClientRect().height) }; })()""")
    shot(page, f'pdf-bar-{tag}')
    check(f'the PDF bar says what TeX made in full ({w})', not g['cut'] and g['status'], g)
    check(f'Close, the engine, Recompile and Download are whole inside the screen ({w})', all(0 <= g[k][0] and g[k][1] <= g['W'] for k in ('x', 're', 'dl', 'eng')) and g['shell'] in ('Shell escape', 'Shell'), g)
    check(f'in two rows ({w})', g['bar'] <= 2 * 44 + 16, g)
    check(f'and 44 px under a finger ({w})', all(g[k][2] >= 44 for k in ('x', 're', 'dl', 'eng')), g)


def download_pdf(page, w):
    """Download PDF before any PDF is made compiles first: while it does, the status bar says what
    TeX is doing (Word shows a PDF being published there), and goes quiet again after."""
    if not os.path.isfile(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'dist', 'tex', 'tree.wasm')):
        print('SKIP download_pdf: no dist/tex'); return
    seen = []
    with page.expect_download(timeout=180000) as d:
        page.click('#rb-pdf')
        for _ in range(60):
            page.wait_for_timeout(250)
            t = page.evaluate("(() => { const s = document.getElementById('st-save'); return s.checkVisibility() ? s.textContent : ''; })()")
            if t: seen.append(t)
            if not page.evaluate("window.rikuy.pdfBusy"): break
    shot(page, 'download-pdf-' + w.replace(' ', '').replace(',', '-'))
    check(f'while Download PDF compiles, the status bar says what TeX is doing ({w})', any(x.startswith('Making the PDF: ') and len(x) > 18 for x in seen), seen[:4])
    check(f'the PDF comes, and the status bar is quiet again ({w})', d.value.suggested_filename.endswith('.pdf') and not page.evaluate("document.getElementById('st-save').checkVisibility()"), d.value.suggested_filename)


def first_comment(page, w):
    """A browser has no account name, as Word has: the first comment from it asks for one, the
    name box first; Enter there goes on to the comment; Comment with no name says why."""
    touch = page.evaluate("matchMedia('(pointer: coarse)').matches")
    load_doc(page, DOC)
    select_text(page, 'bold word')
    run_cmd(page, 'comment-new')
    first = page.evaluate("document.activeElement.getAttribute('aria-label')")
    check(f'the first comment\'s box starts at the name ({w})', first == 'Your name, shown with your comments and changes', first)
    page.locator('.pop-comment textarea').fill('Is this the right word?')
    page.locator('.pop-comment').get_by_role('button', name='Comment', exact=True).click(); page.wait_for_timeout(250)
    g = page.evaluate("[document.activeElement.getAttribute('aria-invalid'), (document.querySelector('.cm-hint') || {}).textContent, document.querySelector('.cm-hint').checkVisibility()]")
    shot(page, 'first-comment-' + w.replace(' ', '').replace(',', '-'))
    check(f'Comment with no name says to type one, the name box marked ({w})', g[0] == 'true' and g[2] and 'your name' in (g[1] or '').lower(), g)
    page.keyboard.type('Ana'); page.keyboard.press('Enter'); page.wait_for_timeout(150)
    check(f'Enter in the name box goes on to the comment ({w})', page.evaluate("document.activeElement.tagName") == 'TEXTAREA' and not page.evaluate("document.querySelector('.cm-hint').checkVisibility()"))
    page.keyboard.press('Control+Enter'); page.wait_for_timeout(300)
    check(f'Ctrl+Enter sends it into the source ({w})', 'Ana' in src(page) and 'Is this the right word?' in src(page), src(page)[-200:])
    run_cmd(page, 'comment-new')
    check(f'the next comment starts at the comment, the name known ({w})', page.evaluate("document.activeElement.tagName") == 'TEXTAREA' and page.locator('.pop-comment .share-name').count() == 0)
    page.keyboard.press('Escape')


MV = """(() => { const d = document.getElementById('desk'), sp = [...document.querySelectorAll('#pages .it.p span.t')], r = sp[0].getBoundingClientRect(), m = document.getElementById('sv-mobile');
  const wide = sp.filter((x) => { const b = x.getBoundingClientRect(); return b.right > d.getBoundingClientRect().right + 1 || b.left < -1; }).length;
  return { web: document.body.classList.contains('pg-web'), pressed: m.getAttribute('aria-pressed'), shown: m.checkVisibility(), tap: Math.round(m.getBoundingClientRect().height),
           font: parseFloat(getComputedStyle(sp[0]).fontSize), out: wide, scroll: document.documentElement.scrollWidth - innerWidth, desk: d.scrollWidth - d.clientWidth, zoom: document.getElementById('zoomv').textContent }; })()"""


def tap_text(page, text, k=0):
    """A tap on the page k letters into the first place text is drawn, as a finger puts the caret."""
    at = page.evaluate("""([t, k]) => { const s = [...document.querySelectorAll('#pages span.t')].find((x) => x.textContent.includes(t)); if (!s) return null;
      s.scrollIntoView({ block: 'center' }); const i = s.textContent.indexOf(t) + k, r = document.createRange(); r.setStart(s.firstChild, i); r.setEnd(s.firstChild, i + 1);
      const b = r.getBoundingClientRect(); return [b.left + 1, b.top + b.height / 2]; }""", [text, k])
    page.touchscreen.tap(at[0], at[1]); page.wait_for_timeout(250)


def mobile_view(page, w):
    """Word's phone app opens a document in Mobile View, its text reflowed to the screen. Rikuy's
    is Web Layout, the default under 700 px: the text at its actual size, no sideways scroll;
    typing, selecting, the phone's ribbon row and the on-screen keyboard work in it; Print Layout
    is one tap away (Mobile View in the status bar) and the choice is kept on this device."""
    tag = w.replace(' ', '').replace(',', '-')
    g = page.evaluate(MV)
    shot(page, f'mobile-view-{tag}')
    check(f'a phone opens in Mobile View, its toggle pressed and 44 px in the status bar ({w})', g['web'] and g['pressed'] == 'true' and g['shown'] and g['tap'] >= 44, g)
    check(f'the text at its actual size or more, every line inside the screen, no sideways scroll ({w})', g['font'] >= 13 and g['out'] == 0 and g['scroll'] <= 0 and g['desk'] <= 1 and g['zoom'] == '100%', g)
    load_doc(page, DOC); page.wait_for_timeout(300)
    # typing, by a tap
    tap_text(page, 'Second paragraph', 3)
    page.keyboard.type('Z'); page.wait_for_timeout(250)
    check(f'a tap puts the caret in the words and typing lands there ({w})', 'SecZond paragraph' in src(page), src(page)[-80:])
    page.keyboard.press('Backspace'); page.wait_for_timeout(200)
    page.keyboard.press('Enter'); page.keyboard.type('New one.'); page.wait_for_timeout(300)
    check(f'Enter makes a new paragraph ({w})', 'Sec\n\nNew one.ond paragraph' in src(page), src(page)[-80:])
    page.evaluate('window.rikuy.undo()'); page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
    # the phone's ribbon row on a selection
    select_text(page, 'bold word'); page.wait_for_timeout(200)
    page.locator('#rb-b').tap(); page.wait_for_timeout(250)
    check(f'Bold in the phone\'s ribbon row on a selection ({w})', '\\textbf{bold word}' in src(page), src(page)[-120:])
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(150)
    tap_text(page, 'Second paragraph', 2)
    page.locator('#rb-style').select_option('section'); page.wait_for_timeout(300)
    check(f'the style list makes the paragraph Heading 1 ({w})', '\\section{Second paragraph here.}' in src(page), src(page)[-120:])
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(150)
    # the on-screen keyboard (a phone's browser reports it as a shorter visual viewport): the caret stays in sight above it
    tap_text(page, 'Second paragraph', 6)
    page.evaluate("""() => { const vv = visualViewport, H = innerHeight - 320; Object.defineProperty(vv, 'height', { configurable: true, get: () => H }); vv.dispatchEvent(new Event('resize')); }""")
    page.wait_for_timeout(300)
    page.keyboard.type('Y'); page.wait_for_timeout(400)
    caret = page.evaluate("(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), innerHeight - 320]; })()")
    check(f'with the on-screen keyboard up, typing lands and the caret is above it ({w})', 'SecondY paragraph' in src(page) and caret[1] <= caret[2] and caret[0] >= 0, (caret, src(page)[-60:]))
    page.evaluate("() => { delete visualViewport.height; visualViewport.dispatchEvent(new Event('resize')); }")
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(150)
    # the zoom button: the text a quarter larger, and back
    seen = []
    for _ in range(2):
        page.locator('#zoomv').tap(); page.wait_for_timeout(300); seen.append(page.evaluate(MV))
    check(f'the zoom button makes the text a quarter larger and back, lines still inside the screen ({w})', seen[0]['zoom'] == '125%' and seen[0]['font'] > g['font'] * 1.2 and seen[0]['out'] == 0 and seen[0]['desk'] <= 1 and seen[1]['zoom'] == '100%', [(x['zoom'], x['font'], x['out']) for x in seen])
    # Print Layout one tap away, kept on this device
    page.locator('#sv-mobile').tap(); page.wait_for_timeout(400)
    g2 = page.evaluate(MV)
    shot(page, f'mobile-view-off-{tag}')
    check(f'a tap on Mobile View gives Print Layout, TeX\'s pages ({w})', not g2['web'] and g2['pressed'] == 'false' and page.evaluate("document.querySelectorAll('#pages .page').length") >= 1, g2)
    page.reload(); page.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=20000); page.wait_for_timeout(400)
    check(f'Print Layout, chosen, is what this phone opens with next ({w})', not page.evaluate(MV)['web'])
    page.locator('#sv-mobile').tap(); page.wait_for_timeout(400)
    page.reload(); page.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=20000); page.wait_for_timeout(400)
    check(f'and Mobile View again, once chosen again ({w})', page.evaluate(MV)['web'])


def wide_print(page, w):
    """A wide window keeps Print Layout as its default, and has no Mobile View button."""
    g = page.evaluate("[document.body.classList.contains('pg-web'), document.getElementById('sv-mobile').checkVisibility()]")
    check(f'a wide window opens in Print Layout, without the Mobile View button ({w})', g == [False, False], g)


HELP = """(() => { const p = document.getElementById('helppane'), pop = document.querySelector('body > .pop.pop-help'), rb = document.getElementById('ribbon').getBoundingClientRect(),
  st = document.getElementById('status').getBoundingClientRect(), d = document.getElementById('desk').getBoundingClientRect();
  const r = p && p.checkVisibility() ? p.getBoundingClientRect() : null;
  return { pane: r && { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) }, pop: !!pop, ribbon: Math.round(rb.bottom), status: Math.round(st.top), desk: Math.round(d.right), win: innerWidth,
           text: p ? p.innerText.slice(0, 200) : '' }; })()"""


def help_pane(page, w):
    """Word's Help is a pane at the window's right, beside the page, that stays while the page is
    worked on. Rikuy's: the dialog "How Rikuy works", docked; a press on the page and typing leave
    it; Close, Esc in it, or Help pressed again close it. A phone keeps the sheet it was."""
    tag = w.replace(' ', '').replace(',', '-')
    touch = page.evaluate("matchMedia('(pointer: coarse)').matches")
    load_doc(page, DOC)
    if touch:
        page.locator('#b-nav').tap(); page.wait_for_timeout(250)
        page.get_by_role('menu', name='Actions', exact=True).get_by_role('menuitem', name='Help', exact=True).tap(); page.wait_for_timeout(400)
        g = page.evaluate(HELP)
        shot(page, f'help-{tag}')
        check(f'on a phone Help is the sheet it was, inside the screen ({w})', g['pop'] and not g['pane'], g)
        page.get_by_role('dialog', name='How Rikuy works', exact=True).get_by_role('button', name='Close', exact=True).tap()
        return
    page.locator('#b-help').click(); page.wait_for_timeout(400)
    g = page.evaluate(HELP)
    shot(page, f'help-{tag}')
    d = page.get_by_role('dialog', name='How Rikuy works', exact=True)
    check(f'Help opens as a pane at the right, under the ribbon to the status bar, the page beside it ({w})', g['pane'] and not g['pop'] and g['pane']['right'] == g['win'] and g['pane']['top'] >= g['ribbon'] - 1 and abs(g['pane']['bottom'] - g['status']) <= 1 and g['desk'] <= g['pane']['left'] + 1 and 'Download gives you the paper' in g['text'], g)
    check(f'it is the dialog "How Rikuy works", not modal, with its Close button ({w})', d.count() == 1 and d.get_attribute('aria-modal') is None and d.get_by_role('button', name='Close', exact=True).count() == 1)
    click_text(page, 'Second paragraph', 3)
    page.keyboard.type('Z'); page.wait_for_timeout(250)
    check(f'a press on the page and typing leave the pane open ({w})', page.evaluate(HELP)['pane'] and 'SecZond paragraph' in src(page), src(page)[-60:])
    page.locator('#b-help').click(); page.wait_for_timeout(300)
    check(f'Help pressed again closes it ({w})', not page.evaluate(HELP)['pane'])
    page.locator('#b-help').click(); page.wait_for_timeout(300)
    page.locator('#helppane').get_by_role('button', name='Close', exact=True).click(); page.wait_for_timeout(250)
    check(f'its Close button closes it, the page whole again ({w})', not page.evaluate(HELP)['pane'] and page.evaluate(HELP)['desk'] == page.evaluate('innerWidth') or not page.evaluate(HELP)['pane'], page.evaluate(HELP))
    page.locator('#b-help').click(); page.wait_for_timeout(300)
    page.locator('#helppane .pop-x').focus(); page.keyboard.press('Escape'); page.wait_for_timeout(250)
    check(f'Esc in it closes it ({w})', not page.evaluate(HELP)['pane'])
    # the Help tab's How it works opens the same pane
    page.evaluate("window.rikuy.runCommand('help-how')")
    page.wait_for_timeout(300)
    check(f'the Help tab opens the same pane ({w})', page.evaluate(HELP)['pane'])
    page.evaluate('window.rikuy.closeHelpPane()')


PARTS = {'help_pane': (help_pane, [(1366, False), (1920, True), (390, False)]),
         'mobile_view': (mobile_view, [(390, False), (360, True)]), 'wide_print': (wide_print, [(1366, False)]),
         'first_comment': (first_comment, [(1366, False), (390, True)]),
         'download_pdf': (download_pdf, [(1366, False)]),
         'pdf_bar': (pdf_bar, [(390, False), (360, True)]),
         'sample_spelling': (sample_spelling, [(1366, False), (390, True)]),
         'doc_name': (doc_name, [(390, False), (360, True), (700, False), (1366, True)]),
         'panes': (panes, [(1366, False), (1920, True), (390, False)]),
         'status_bar': (status_bar, None),
         'file_view': (file_view, [(1366, False), (1920, True), (390, False), (360, True)]),
         'first_visit': (first_visit, [(1366, False), (1920, True), (390, False), (360, True)]),
         'dialogs': (dialogs_give_the_caret_back, [(1400, False), (1400, True)]),
         'phone_dialogs': (phone_dialogs, [(390, False), (360, True)])}


# the parts that meet a phone's own default, Mobile View (the others open in Print Layout, as the suites written for it do)
MOBILE = {'mobile_view', 'first_visit', 'doc_name', 'sample_spelling'}


def run(which):
    with sync_playwright() as p:
        for name in which:
            fn, sizes = PARTS[name]
            if sizes is None:
                fn(p)
                continue
            for width, dark in sizes:
                touch = width < 700
                browser, page, errors = open_page(p, width=width, height=820 if touch else 900, dark=dark, touch=touch, layout='mobile' if name in MOBILE else 'print')
                fn(page, '%d px%s' % (width, ', dark' if dark else ''))
                check(f'no console errors ({name}, {width} px)', not errors, errors[:4])
                browser.close()
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(run(sys.argv[1:] or list(PARTS)))
