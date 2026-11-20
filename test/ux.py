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


PARTS = {'pdf_bar': (pdf_bar, [(390, False), (360, True)]),
         'sample_spelling': (sample_spelling, [(1366, False), (390, True)]),
         'doc_name': (doc_name, [(390, False), (360, True), (700, False), (1366, True)]),
         'panes': (panes, [(1366, False), (1920, True), (390, False)]),
         'status_bar': (status_bar, None),
         'file_view': (file_view, [(1366, False), (1920, True), (390, False), (360, True)]),
         'first_visit': (first_visit, [(1366, False), (1920, True), (390, False), (360, True)]),
         'dialogs': (dialogs_give_the_caret_back, [(1400, False), (1400, True)]),
         'phone_dialogs': (phone_dialogs, [(390, False), (360, True)])}


def run(which):
    with sync_playwright() as p:
        for name in which:
            fn, sizes = PARTS[name]
            if sizes is None:
                fn(p)
                continue
            for width, dark in sizes:
                touch = width < 700
                browser, page, errors = open_page(p, width=width, height=820 if touch else 900, dark=dark, touch=touch)
                fn(page, '%d px%s' % (width, ', dark' if dark else ''))
                check(f'no console errors ({name}, {width} px)', not errors, errors[:4])
                browser.close()
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(run(sys.argv[1:] or list(PARTS)))
