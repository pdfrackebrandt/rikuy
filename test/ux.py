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
    # H1, M2 of the review: the keys, Tab and a screen reader stay in the view, not in the page under it
    before = src(page)
    u = page.evaluate("[document.activeElement.id, document.getElementById('main').inert, document.getElementById('status').inert]")
    page.keyboard.type('xyz'); page.wait_for_timeout(200)
    # (on a phone File opens from the tab list, which keeps the focus: it is in the view's row too)
    check(f'File takes the keys: the focus on Back (or a phone\'s tab list), the page and the status bar inert, typing writes nothing ({w})', u[0] in (('rf-back', 'rb-tabsel') if touch else ('rf-back',)) and u[1:] == [True, True] and src(page) == before, (u, src(page)[-60:]))
    if not touch:
        for _ in range(4): page.keyboard.press('Tab')
        check(f'Tab from Back stays in the view, never in the page under it ({w})', page.evaluate("!!document.activeElement.closest('#rp-file, #rb-top, #bar')"), page.evaluate("document.activeElement.id"))
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
    check(f'Properties opens its dialog over File, which stays behind it as Word\'s Info does ({w})', g['open'] and dialog_open(page), g)
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    check(f'Esc closes the dialog first, File stays ({w})', page.evaluate(FILE_GEOM)['open'] and not dialog_open(page))
    (page.locator('#rf-blank').tap() if touch else page.locator('#rf-blank').click()); page.wait_for_timeout(500)
    g = page.evaluate(FILE_GEOM)
    check(f'Blank document makes the new document and shows it ({w})', not g['open'] and g['desk'] > 100 and '\\begin{document}' in src(page) and 'Second paragraph' not in src(page), g)
    check(f'no sideways scroll ({w})', page.evaluate('document.documentElement.scrollWidth') <= page.viewport_size['width'])
    if touch:
        return
    # Alt, F, a letter (Word's way to File's New): the letter writes nothing into the document
    load_doc(page, DOC); click_text(page, 'Second paragraph', 3); before = src(page)
    page.keyboard.press('Alt'); page.wait_for_timeout(150); page.keyboard.press('f'); page.wait_for_timeout(300)
    opened = page.evaluate(FILE_GEOM)['open']
    page.keyboard.press('n'); page.wait_for_timeout(250)
    check(f'Alt, F opens File, and a letter typed then writes nothing into the document ({w})', opened and src(page) == before, (opened, src(page)[-60:]))
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    if page.evaluate(FILE_GEOM)['open']: page.keyboard.press('Escape'); page.wait_for_timeout(200)
    # M1: Esc closes File with the Styles pane docked under it
    run_cmd(page, 'styles-pane'); click_text(page, 'Second paragraph', 3)
    open_tab(page, 'File'); page.keyboard.press('Escape'); page.wait_for_timeout(250)
    check(f'Esc closes File while the Styles pane is docked under it ({w})', not page.evaluate(FILE_GEOM)['open'])
    run_cmd(page, 'styles-pane')
    # L4: the browser's Back closes it (a phone's Back button too)
    open_tab(page, 'File'); page.go_back(); page.wait_for_timeout(400)
    check(f'the browser\'s Back closes File and leaves Rikuy open ({w})', not page.evaluate(FILE_GEOM)['open'] and page.evaluate('!!window.rikuy && !!document.querySelector(".page")'))
    # M6: a template from File opens with the caret in it
    open_tab(page, 'File'); page.locator('#rf-template').click(); page.wait_for_timeout(250)
    page.locator('body > .pop[role=menu] [role^=menuitem]').first.click(); page.wait_for_timeout(1200)
    k = src(page); page.keyboard.type('Q'); page.wait_for_timeout(300)
    check(f'a template chosen from File opens with the caret in it: the first key lands ({w})', not page.evaluate(FILE_GEOM)['open'] and src(page) != k, page.evaluate('document.activeElement.id'))
    # the view's Home, as Word's backstage: a page for each template beside the commands, and the documents kept here
    open_tab(page, 'File'); page.wait_for_timeout(400)
    h = page.evaluate("""(() => { const h = document.getElementById('rf-home'), r = h && h.checkVisibility() ? h.getBoundingClientRect() : null, c = document.querySelector('#rp-file > .rb-tb').getBoundingClientRect();
      return { home: r && [Math.round(r.left), Math.round(r.width)], rail: Math.round(c.right), tiles: [...document.querySelectorAll('#rf-home .rf-tile')].map((t) => t.getAttribute('aria-label')),
               recent: [...document.querySelectorAll('#rf-home .rf-doc')].map((t) => t.getAttribute('aria-label')) }; })()""")
    shot(page, f'file-home-{tag}')
    check(f'File\'s Home beside the commands: a blank page and every template as a page to press ({w})', h['home'] and h['home'][0] >= h['rail'] - 1 and h['tiles'][:2] == ['New blank document', 'Article template'] and len(h['tiles']) >= 8, h)
    check(f'and the documents kept here, each a press away: the one open before the template is there ({w})', 'Open Untitled' in h['recent'] or any(x.startswith('Open ') for x in h['recent']), h['recent'])
    # N2: the keys in the view: Down along the column, Tab to the pages, the arrows across them, Tab to Recent
    page.focus('#rf-back')
    keys = []
    for k in ('ArrowDown', 'ArrowDown', 'ArrowUp', 'Tab', 'ArrowRight', 'Tab', 'Tab'):
        page.keyboard.press(k); page.wait_for_timeout(60)
        keys.append(page.evaluate("document.activeElement.getAttribute('aria-label') || document.activeElement.id"))
    check(f'in File the keys go along the column (Down, Up), Tab to the pages, Right along them, Tab to Recent and round to the column ({w})',
          keys[0] == 'Blank document' and keys[1] == 'New from template' and keys[2] == 'Blank document' and keys[3] == 'New blank document' and keys[4] == 'Article template' and keys[5].startswith('Open ') and keys[6] == 'Blank document', keys)
    # N3: a dialog opened from File by the keys and closed with Esc gives the focus back to its command
    page.focus('#rf-props'); page.keyboard.press('Enter'); page.wait_for_timeout(300)
    opened = dialog_open(page)
    page.keyboard.press('Escape'); page.wait_for_timeout(250)
    check(f'Properties opened from File by the keys and closed with Esc: the focus back on Properties ({w})', opened and page.evaluate("document.activeElement.id") == 'rf-props', page.evaluate("document.activeElement.id"))
    page.get_by_role('button', name='Report template', exact=True).click(); page.wait_for_timeout(1200)
    check(f'a press on a template\'s page makes the document and closes File ({w})', not page.evaluate(FILE_GEOM)['open'] and '\\documentclass' in src(page) and 'report' in src(page)[:200], src(page)[:120])


def status_bar(p):
    """Word's status bar: page, words, language at the left; views, zoom slider and zoom at the
    right end, always in view. A click on the word count opens Word Count. Checked on the hosted
    app as pages.py serves it (its status bar has Make available offline too)."""
    import pages
    port = int(os.environ.get('UX_PORT', '8799'))
    srv = pages.start(port, os.environ.get('RIKUY_DIST') or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'dist'))
    try:
        browser = p.chromium.launch()
        for width, dark in ((1920, False), (1366, False), (1366, True), (1280, False), (1100, True), (900, False), (800, True), (700, False)):
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
    touch = page.evaluate("matchMedia('(pointer: coarse)').matches")
    with page.expect_download(timeout=180000) as d:
        if touch:
            # (a phone's one Download button, then its menu's Download PDF)
            page.locator('#rb-dl-menu').tap(); page.wait_for_timeout(250)
            page.locator('body > .pop [role=menuitem][aria-label="Download PDF"]').tap()
        else:
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
           text: p ? p.innerText.slice(0, 3000) : '' }; })()"""


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


LONG = '\\documentclass{article}\n\\begin{document}\n' + ''.join('\\section{Part %d}\nWords of part %d, a paragraph long enough to fill a line or two of the page with plain text.\n\n' % (i, i) for i in range(1, 90)) + 'Here is a mispeled word.\n\\end{document}\n'


def caret_back(page, w):
    """The caret is where it was when a pane, Find and Replace, Go To, the Navigation pane, the
    Thesaurus or the status bar's Word Count close with Esc, though a docked pane laid the page out
    again at a new zoom; a pane opening keeps the caret's line on the screen."""
    def lands(name, mark):
        page.keyboard.type(mark); page.wait_for_timeout(250)
        t = src(page)
        # (Spelling selects the misspelling it shows, as Word's Editor does: the key types over it)
        ok = ('Words of part 4%s' % mark) in t or ('Words of part %s4' % mark) in t or (name.startswith('Spelling') and 'Here is a %s word.' % mark in t)
        check(f'{name}, then Esc: the next key lands at the caret (Spelling: over the misspelling it showed), not at the start ({w})', ok and '\\section{%sPart' % mark not in t, [l for l in t.splitlines() if mark in l][:2])
        page.keyboard.press('Control+z'); page.wait_for_timeout(150)
    load_doc(page, LONG); page.wait_for_timeout(400)
    for name, how in (('Spelling (F7), docked', lambda: page.keyboard.press('F7')),
                      ('Find and Replace (Ctrl+H)', lambda: page.keyboard.press('Control+h')),
                      ('Go To (Ctrl+G)', lambda: page.keyboard.press('Control+g')),
                      ('the Navigation pane\'s search (Ctrl+F)', lambda: page.keyboard.press('Control+f')),
                      ('the Thesaurus (Shift+F7)', lambda: page.keyboard.press('Shift+F7')),
                      ('Word Count from the status bar', lambda: page.locator('#st-words').click())):
        click_text(page, 'Words of part 4', 15)
        page.evaluate("document.getElementById('pages').focus()")
        how(); page.wait_for_timeout(900)
        page.keyboard.press('Escape'); page.wait_for_timeout(400)
        if page.evaluate("!!document.querySelector('#sp-pane:not([hidden]), .th-pane:not([hidden])') && document.activeElement.id !== 'pages'"):
            page.keyboard.press('Escape'); page.wait_for_timeout(300)
        lands(name, 'Q')
        page.evaluate("window.rikuy.toggleNav && window.rikuy.toggleNav(false)"); page.evaluate("document.querySelectorAll('#sp-pane, .th-pane').forEach((d) => d.hidden = true)")
    # a pane docked on a long document: the caret's line stays on the screen
    click_text(page, 'Words of part 40', 5)
    page.evaluate("(() => { const s = getSelection().getRangeAt(0).getBoundingClientRect(); document.getElementById('desk').scrollTop += s.top - 300; })()")
    page.wait_for_timeout(200)
    y0 = page.evaluate("getSelection().getRangeAt(0).getBoundingClientRect().top")
    run_cmd(page, 'styles-pane'); page.wait_for_timeout(900)
    y1 = page.evaluate("(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(), d = document.getElementById('desk').getBoundingClientRect(); return [Math.round(r.top), Math.round(d.top), Math.round(d.bottom)]; })()")
    check(f'the Styles pane docking keeps the caret\'s line on the screen, near where it was ({w})', y1[1] <= y1[0] <= y1[2] and abs(y1[0] - y0) < 120, (y0, y1))
    run_cmd(page, 'styles-pane')


def pane_room(page, w):
    """One task pane docks at a time (a second one asked for takes its place), and only while the
    page keeps 560 px beside it; else it lies over the page's right side and the page keeps its
    width. Never wider than the window."""
    G = """(() => { const d = document.getElementById('desk'), ps = [...document.querySelectorAll('#main > .stp, #main > .sp-pane, #main > .help-pane')].filter((e) => e.checkVisibility());
      return { desk: Math.round(d.clientWidth), panes: ps.map((e) => e.id || e.className.split(' ')[0]), float: ps.map((e) => e.classList.contains('pane-float')), scroll: document.documentElement.scrollWidth - innerWidth,
               right: Math.max(0, ...ps.map((e) => Math.round(e.getBoundingClientRect().right))) - innerWidth }; })()"""
    load_doc(page, DOC); click_text(page, 'Second paragraph', 3)
    run_cmd(page, 'styles-pane'); page.wait_for_timeout(500)
    page.keyboard.press('F7'); page.wait_for_timeout(900)
    g = page.evaluate(G)
    check(f'Spelling asked for with Styles docked takes its place: one pane at a time ({w})', g['panes'] == ['sp-pane'] and g['scroll'] <= 0, g)
    page.evaluate('window.rikuy.toggleNav(true)'); page.keyboard.press('Shift+F7'); page.wait_for_timeout(900)
    g = page.evaluate(G)
    check(f'with the side panel and the Thesaurus too, nothing runs past the window ({w})', len(g['panes']) == 1 and g['scroll'] <= 0 and g['right'] <= 0, g)
    page.evaluate('window.rikuy.toggleNav(false)'); page.evaluate("document.querySelectorAll('#sp-pane, .th-pane').forEach((d) => d.hidden = true)"); page.wait_for_timeout(300)
    page.evaluate('window.rikuy.togglePdf(true)'); page.wait_for_timeout(600)
    click_text(page, 'Second paragraph', 3); run_cmd(page, 'styles-pane'); page.wait_for_timeout(800)
    g = page.evaluate(G)
    shot(page, 'pane-room-' + w.replace(' ', '').replace(',', '-'))
    want_float = page.viewport_size['width'] < 1400
    check(f'beside the PDF pane the Styles pane {"lies over the page, which keeps its width" if want_float else "docks, the page keeping 560 px"} ({w})', g['panes'] == ['stylespane'] and (g['float'] == [True] and g['desk'] >= 400 if want_float else g['float'] == [False] and g['desk'] >= 560) and g['scroll'] <= 0, g)
    run_cmd(page, 'styles-pane'); page.evaluate('window.rikuy.togglePdf(false)')


def lows(page, w):
    """The review's lows: the phone menu's zoom item has no icon of another action; a tablet's status
    bar has its views in sight; the zoom number and the comment boxes are 44 px under a finger."""
    width = page.viewport_size['width']
    if width <= 520:
        page.locator('#b-nav').tap(); page.wait_for_timeout(250)
        z = page.evaluate("(() => { const a = document.querySelector('#nav-acts [data-for=zoomv]'); return a ? a.querySelectorAll('svg').length : -1; })()")
        check(f'the menu panel\'s zoom item has no icon of another action ({w})', z == 0, z)
        page.locator('#nav-close').tap(); page.wait_for_timeout(200)
        load_doc(page, DOC); select_text(page, 'bold word'); run_cmd(page, 'comment-new')
        h = page.evaluate("[...document.querySelectorAll('.pop-comment .share-name, .pop-comment textarea')].map((e) => Math.round(e.getBoundingClientRect().height))")
        check(f'a comment\'s name and text boxes are 44 px under a finger ({w})', h and min(h) >= 44, h)
        page.keyboard.press('Escape')
    else:
        g = page.evaluate("""(() => { const s = document.getElementById('status').getBoundingClientRect(), v = document.getElementById('st-views').getBoundingClientRect(), z = document.getElementById('st-zoomv');
          return { views: [Math.round(v.left), Math.round(v.right)], status: [Math.round(s.left), Math.round(s.right)], zoom: z.checkVisibility() ? Math.round(z.getBoundingClientRect().width) : null }; })()""")
        check(f'a tablet\'s status bar has Page, LaTeX and PDF whole in sight ({w})', g['views'][0] >= g['status'][0] and g['views'][1] <= g['status'][1], g)
        if g['zoom'] is not None:
            check(f'its zoom number is 44 px wide under a finger ({w})', g['zoom'] >= 44, g)


TOP = """(() => { const D = document.getElementById('desk').getBoundingClientRect();
  for (const fy of [16, 48, 96]) { const r = document.caretRangeFromPoint(D.left + D.width / 2, D.top + fy); if (r && r.startContainer.textContent) { const m = /part (\\d+)|Part (\\d+)/.exec(r.startContainer.textContent); if (m) return +(m[1] || m[2]); } }
  return null; })()"""


def place_kept(page, w):
    """Mobile View off and on (a phone) and View › Web Layout on and off (a desktop) lay every line
    out again: the reader's place stays on the screen (the text at the top, or the caret)."""
    touch = page.evaluate("matchMedia('(pointer: coarse)').matches")
    load_doc(page, LONG); page.wait_for_timeout(500)
    page.evaluate("(() => { const s = [...document.querySelectorAll('#pages span.t')].find((x) => x.textContent.includes('Words of part 37')); document.getElementById('desk').scrollTop += s.getBoundingClientRect().top - document.getElementById('desk').getBoundingClientRect().top - 30; })()")
    page.wait_for_timeout(300)
    t0 = page.evaluate(TOP)
    flip = (lambda: page.locator('#sv-mobile').tap()) if touch else (lambda: run_cmd(page, 'web-layout'))
    seen = []
    for _ in range(2):
        flip(); page.wait_for_timeout(700); seen.append(page.evaluate(TOP))
    check(f'{"Mobile View off and on" if touch else "Web Layout on and off"}: the text at the window\'s top stays the same part ({w})', t0 == 37 and all(x is not None and abs(x - 37) <= 1 for x in seen), (t0, seen))
    # with the caret in view: it stays in view, near where it was
    if not touch:
        click_text(page, 'Words of part 40', 4)
        page.evaluate("(() => { const q = getSelection().getRangeAt(0).getBoundingClientRect(), d = document.getElementById('desk'); d.scrollTop += q.top - d.getBoundingClientRect().top - 200; })()"); page.wait_for_timeout(300)
        y0 = page.evaluate("getSelection().getRangeAt(0).getBoundingClientRect().top")
        run_cmd(page, 'web-layout'); page.wait_for_timeout(700)
        y1 = page.evaluate("(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(), d = document.getElementById('desk').getBoundingClientRect(); return [Math.round(r.top), Math.round(d.top), Math.round(d.bottom)]; })()")
        check(f'Web Layout with the caret in view: the caret stays in view, near where it was ({w})', y1[1] <= y1[0] <= y1[2] and abs(y1[0] - y0) < 60, (y0, y1))
        run_cmd(page, 'web-layout')


def verify_lows(page, w):
    """The verification's lows: the top bar's zoom says the status bar's percentage (Word shows the
    percentage; Fit width is what a press does); Help narrowed below 1000 px becomes a sheet; a
    window that opened under 700 px and widens leaves Mobile View, and goes back to it narrowed
    again; File's Download row stays in its column."""
    g = page.evaluate("[document.getElementById('zoomv').textContent, document.getElementById('st-zoomv').textContent]")
    check(f'the top bar\'s zoom and the status bar\'s say the same percentage ({w})', g[0] == g[1] and g[0].endswith('%'), g)
    page.locator('#b-help').click(); page.wait_for_timeout(400)
    page.set_viewport_size({'width': 900, 'height': 800}); page.wait_for_timeout(600)
    h = page.evaluate("(() => { const p = document.getElementById('helppane'), r = p.getBoundingClientRect(), d = document.getElementById('desk'); return [getComputedStyle(p).position, Math.round(r.left), Math.round(r.right), innerWidth, d.clientWidth]; })()")
    check(f'Help narrowed below 1000 px is a sheet at the corner, the page not squeezed ({w})', h[0] == 'fixed' and h[1] >= 0 and h[2] <= h[3] and h[4] > 700, h)
    page.evaluate('window.rikuy.closeHelpPane()')
    page.set_viewport_size({'width': 1366, 'height': 800}); page.wait_for_timeout(500)
    open_tab(page, 'File'); page.wait_for_timeout(300)
    d = page.evaluate("(() => { const c = document.querySelector('#rp-file > .rb-tb').getBoundingClientRect(), b = [...document.querySelectorAll('#rp-file .rb-dl button')].filter((x) => x.offsetParent); return [Math.round(c.right), Math.max(...b.map((x) => Math.round(x.getBoundingClientRect().right)))]; })()")
    check(f'File\'s Download row stays inside its column ({w})', d[1] <= d[0], d)
    page.keyboard.press('Escape')


def widen(p):
    """A desktop window that opened under 700 px (so in Mobile View) and widens takes a wide
    window's Print Layout, where no Mobile View toggle is; narrowed again, Mobile View."""
    browser, page, errors = open_page(p, width=600, height=800, layout='mobile')
    web = lambda: page.evaluate("[document.body.classList.contains('pg-web'), document.getElementById('sv-mobile').checkVisibility()]")
    a = web()
    page.set_viewport_size({'width': 1366, 'height': 800}); page.wait_for_timeout(500); b = web()
    page.set_viewport_size({'width': 600, 'height': 800}); page.wait_for_timeout(500); c = web()
    check('a window opened at 600 px is in Mobile View, its toggle shown; widened to 1366 px, Print Layout and no toggle; narrowed, Mobile View again', a == [True, True] and b == [False, False] and c == [True, True], (a, b, c))
    check('no console errors (widen)', not errors, errors[:3])
    browser.close()


KIND = """(sel) => { const P = document.querySelector(sel); if (!P) return null; const vis = (e) => e.checkVisibility() && e.getBoundingClientRect().height > 0;
  const h = (q) => [...new Set([...P.querySelectorAll(q)].filter(vis).map((e) => Math.round(e.getBoundingClientRect().height)))].sort();
  const t = P.querySelector('.pop-h, .stp-h, .fr-head, .help-pane-h'), x = P.querySelector('.pop-x'), cs = t ? getComputedStyle(t) : null;
  return { btn: h('.btn'), field: h('input[type=text], input[type=number], input:not([type]), select'), radius: getComputedStyle(P).borderTopLeftRadius,
           title: cs ? [cs.fontSize, cs.fontWeight, cs.lineHeight] : null, close: x && vis(x) ? [Math.round(x.getBoundingClientRect().width), Math.round(x.getBoundingClientRect().height)] : null }; }"""


def consistency(page, w):
    """One size and shape per kind in the dialogs, panes and popovers (docs/handoff/UI-PRINCIPLES.md
    C1, C5, C9, C13, T1): buttons and fields 32 px tall (44 under a finger), surfaces with 8 px
    corners, one title style, the close button 44 px under a finger, a ring on keyboard focus; a
    phone's top bar 44 px."""
    touch = page.evaluate("matchMedia('(pointer: coarse)').matches")
    H = 44 if touch else 32
    load_doc(page, DOC)
    st = page.evaluate("""(() => { const v = [...document.querySelectorAll('#status button, #status input, #status select')].filter((e) => e.offsetParent);
      const r = (e) => Math.round(e.getBoundingClientRect().height);
      return { words: [...new Set(v.filter((e) => e.matches('.linkish')).map((e) => getComputedStyle(e).fontSize))],
               views: [...new Set(v.filter((e) => e.closest('.st-views')).map((e) => r(e) + ' ' + getComputedStyle(e).borderTopLeftRadius))],
               small: v.filter((e) => r(e) < 44 || e.getBoundingClientRect().width < 44).map((e) => e.id) }; })()""")
    check(f'the status bar\'s words one size, its views one height with 4 px corners ({w})', st['words'] == ['12px'] and len(st['views']) == 1 and st['views'][0].endswith(' 4px') and (not touch or not st['small']), st)
    if not touch:
        page.get_by_role('tab', name='File').click(); page.wait_for_timeout(400)
        fv = page.evaluate("""(() => { const v = (q) => [...document.querySelectorAll(q)].filter((e) => e.offsetParent);
          return { col: [...new Set(v('#rp-file .rb-tb .btn').map((e) => Math.round(e.getBoundingClientRect().height) + ' ' + getComputedStyle(e).borderTopLeftRadius))],
                   tiles: [...new Set(v('.rf-tile').map((e) => Math.round(e.getBoundingClientRect().height) + ' ' + getComputedStyle(e).borderTopLeftRadius))] }; })()""")
        check(f'File: its column\'s commands 32 px with 4 px corners, its tiles one height ({w})', fv['col'] == ['32 4px'] and len(fv['tiles']) == 1 and fv['tiles'][0].endswith(' 4px'), fv)
        page.keyboard.press('Escape'); page.wait_for_timeout(300)
    seen = {}
    for cmd in ('font-dialog', 'paragraph-settings', 'page-setup', 'insert-table-dialog', 'share', 'properties'):
        click_text(page, 'Second paragraph', 3)
        run_cmd(page, cmd); page.wait_for_timeout(300)
        seen[cmd] = page.evaluate(KIND, 'body > .pop')
        if cmd == 'font-dialog' and not touch:
            page.keyboard.press('Tab'); page.wait_for_timeout(80)
            ring = page.evaluate("(() => { const a = document.activeElement, c = getComputedStyle(a); return [a.tagName, c.outlineStyle, c.outlineWidth]; })()")
            check(f'a control reached by Tab in a dialog has its ring as an outline, 2 px ({w})', ring[1] != 'none' and float(ring[2][:-2]) >= 2, ring)
        page.keyboard.press('Escape'); page.wait_for_timeout(150)
    bad = {k: v for k, v in seen.items() if not v or not v['btn'] or any(abs(x - H) > 1 for x in v['btn']) or v['radius'] != '8px'}
    check(f'every dialog\'s buttons {H} px tall, its corners 8 px ({w})', not bad and len(seen) == 6, bad or seen)
    badf = {k: v['field'] for k, v in seen.items() if v and v['field'] and min(v['field']) < H - 1}
    check(f'and its fields at least {H} px ({w})', not badf, badf)
    titles = {tuple(v['title']) for v in seen.values() if v and v['title']}
    check(f'one title style for every dialog: 14 px, semibold ({w})', titles == {('14px', '600', '20px')}, titles)
    if touch:
        closes = {k: v['close'] for k, v in seen.items() if v and v['close'] and min(v['close']) < 44}
        check(f'each dialog\'s Close 44 px under a finger ({w})', not closes, closes)
        bar = page.evaluate("[...document.querySelectorAll('#bar button, #bar input')].filter((e) => e.offsetParent).map((e) => [e.id, Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)])")
        check(f'the top bar\'s buttons 44 px under a finger, all on the screen ({w})', all(x[1] >= 44 and x[2] >= 44 for x in bar) and page.evaluate('document.documentElement.scrollWidth') <= page.viewport_size['width'], bar)
        # (the closed search box is one 44 px icon; opened, it must take the bar's width again:
        # the rule that made it an icon once kept it 44 px while typing, "bold" showing as "d")
        page.click('#bar .srch input')
        page.keyboard.type('bold')
        sw = page.evaluate("(() => { const r = document.querySelector('#bar .srch').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.left), Math.round(r.right)]; })()")
        check(f'the search box opened on a phone takes the bar\'s width, inside the screen ({w})', sw[0] >= page.viewport_size['width'] * 0.7 and sw[1] >= 0 and sw[2] <= page.viewport_size['width'], sw)
        page.keyboard.press('Escape')
        load_doc(page, DOC); select_text(page, 'bold word'); run_cmd(page, 'comment-new')
        cb = page.evaluate("Math.round(document.querySelector('.pop-comment .btn:not(.ghost)').getBoundingClientRect().height)")
        check(f'the comment\'s button 44 px under a finger ({w})', cb >= 44, cb)
        page.keyboard.press('Escape')
    else:
        click_text(page, 'Second paragraph', 3)
        run_cmd(page, 'styles-pane'); page.wait_for_timeout(300)
        sp = page.evaluate(KIND, '#stylespane')
        run_cmd(page, 'styles-pane')
        page.keyboard.press('Control+h'); page.wait_for_timeout(300)
        fr = page.evaluate(KIND, '#fr')
        page.keyboard.press('Escape')
        check(f'the Styles pane and Find and Replace: buttons 32 px, the same title style ({w})', sp['btn'] and fr['btn'] and all(abs(x - 32) <= 1 for x in sp['btn'] + fr['btn']) and tuple(sp['title']) == tuple(fr['title']) == ('14px', '600', '20px') and fr['radius'] == '8px', (sp, fr))


KINDS = """(sel) => { const P = document.querySelector(sel); if (!P) return null; const vis = (e) => e.checkVisibility() && e.getBoundingClientRect().height > 0;
  const R = (e) => e.getBoundingClientRect(), nm = (e) => (e.getAttribute('aria-label') || e.textContent || e.className).trim().slice(0, 16);
  return { btns: [...P.querySelectorAll('.btn')].filter(vis).map((e) => [nm(e), Math.round(R(e).width), Math.round(R(e).height), e.scrollWidth > e.clientWidth + 1]),
    fields: [...P.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]), select, textarea, .nf')].filter(vis).filter((e) => !e.parentElement.closest('.nf') && (e.tagName !== 'TEXTAREA' || e.rows === 1)).map((e) => [e.tagName + ' ' + nm(e), Math.round(R(e).height), getComputedStyle(e).borderTopLeftRadius]),
    cropped: [...P.querySelectorAll('.nf input, .nf select')].filter(vis).filter((e) => R(e).height > R(e.closest('.nf')).height).map(nm),
    tabs: [...P.querySelectorAll('[role=tab]')].filter(vis).map((e) => [nm(e), Math.round(R(e).height)]),
    rows: [...P.querySelectorAll('label')].filter(vis).filter((l) => l.querySelector('input[type=checkbox], input[type=radio]') && !l.querySelector('input[type=text], select, textarea')).map((e) => [nm(e), Math.round(R(e).height)]) }; }"""


def dialog_kinds(page, w):
    """Inside every dialog, one height per kind (UI-PRINCIPLES.md C1, C9, T1, T2; the verification
    of 0a6ef7b): buttons whole and 32 px (44 under a finger, and at least as wide), single line fields
    32 px with 4 px corners, a dialog's tabs as tall as its buttons, a check box's row at least 24 px
    (44 under a finger), the Symbols grid's cell ringed when the keys reach it."""
    touch = page.evaluate("matchMedia('(pointer: coarse)').matches")
    H = 44 if touch else 32
    load_doc(page, DOC)
    seen = {}
    for cmd in ('font-dialog', 'paragraph-settings', 'page-setup', 'insert-table-dialog', 'share', 'properties', 'autocorrect-options', 'more-symbols', 'word-count', 'check-accessibility', 'find-replace'):
        click_text(page, 'Second paragraph', 3)
        if cmd == 'find-replace':
            page.keyboard.press('Control+h'); page.wait_for_timeout(300)
            seen[cmd] = page.evaluate(KINDS, '#fr')
        else:
            run_cmd(page, cmd); page.wait_for_timeout(300)
            seen[cmd] = page.evaluate(KINDS, 'body > .pop')
        if cmd == 'more-symbols' and not touch:
            for _ in range(4):
                page.keyboard.press('Tab'); page.wait_for_timeout(60)
                if page.evaluate("document.activeElement.matches('.sym-b')"):
                    break
            ring = page.evaluate("(() => { const a = document.activeElement, c = getComputedStyle(a); return [a.className, c.outlineStyle, c.outlineWidth]; })()")
            check(f'a cell of the Symbols grid reached by Tab has its ring, an outline ({w})', ring[0] == 'sym-b' and ring[1] != 'none' and float(ring[2][:-2]) >= 2, ring)
        page.keyboard.press('Escape'); page.wait_for_timeout(150)
    missing = [k for k, v in seen.items() if not v]
    check(f'the eleven dialogs open ({w})', not missing, missing)
    bad = {k: [b for b in v['btns'] if abs(b[2] - H) > 1 or b[3] or (touch and b[1] < 44)] for k, v in seen.items() if v}
    bad = {k: v for k, v in bad.items() if v}
    check(f'every dialog button whole, {H} px tall{" and at least 44 wide" if touch else ""} ({w})', not bad, bad)
    badf = {k: [f for f in v['fields'] if abs(f[1] - H) > 1 or f[2] != '4px'] + v['cropped'] for k, v in seen.items() if v}
    badf = {k: v for k, v in badf.items() if v}
    check(f'every single line field {H} px tall with 4 px corners, a number field\'s input inside its box ({w})', not badf, badf)
    badt = {k: [t for t in v['tabs'] if abs(t[1] - H) > 1] for k, v in seen.items() if v}
    badt = {k: v for k, v in badt.items() if v}
    check(f'a dialog\'s tabs as tall as its buttons, {H} px ({w})', not badt and any(v and v['tabs'] for v in seen.values()), badt)
    R = 44 if touch else 24
    badr = {k: [r for r in v['rows'] if r[1] < R] for k, v in seen.items() if v}
    badr = {k: v for k, v in badr.items() if v}
    check(f'every check box\'s and radio button\'s row at least {R} px ({w})', not badr and any(v and v['rows'] for v in seen.values()), badr)


CONTRAST = """(el) => { const rgb = (c) => (c.match(/[\\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  let bg = null; for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length === 3 || (c.length === 4 && c[3] > 0.9)) { bg = c.slice(0, 3); break; } }
  const fg = rgb(getComputedStyle(el).color).slice(0, 3), a = lum(fg), b = lum(bg || [255, 255, 255]);
  return Math.round((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) * 100) / 100; }"""


def contrast(page, w):
    """Text on the accent blue and in the search box's list reads at 4.5:1 or more (WCAG 1.4.3,
    UI-PRINCIPLES.md D1), light and dark: the primary buttons of the dialogs (OK, Apply, Copy
    link, Find Next) and a phone's selected search result."""
    touch = page.evaluate("matchMedia('(pointer: coarse)').matches")
    load_doc(page, DOC)
    got = {}
    for cmd, name in (('paragraph-settings', 'OK'), ('insert-table-dialog', 'OK'), ('properties', 'Apply'), ('share', 'Copy link'), ('find-replace', 'Find Next')):
        click_text(page, 'Second paragraph', 3)
        if cmd == 'find-replace':
            page.keyboard.press('Control+h')
        else:
            run_cmd(page, cmd)
        page.wait_for_timeout(300)
        h = page.evaluate_handle("(n) => [...document.querySelectorAll('body > .pop .btn, #fr .btn')].find((b) => b.offsetParent && b.textContent.trim() === n)", name)
        got[cmd + ' ' + name] = page.evaluate(CONTRAST, h) if page.evaluate('(h) => !!h', h) else None
        page.keyboard.press('Escape'); page.wait_for_timeout(150)
    check(f'the dialogs\' primary buttons read at 4.5:1 or more ({w})', all(v and v >= 4.5 for v in got.values()), got)
    page.locator('#bar .srch input').click() if not touch else page.tap('#bar .srch input')
    page.keyboard.type('word count'); page.wait_for_timeout(400)
    h = page.evaluate_handle("document.querySelector('.srch-opt.on .srch-n') || document.querySelector('.srch-opt.on')")
    c = page.evaluate(CONTRAST, h) if page.evaluate('(h) => !!h', h) else None
    check(f'the selected search result reads at 4.5:1 or more ({w})', c and c >= 4.5, c)
    page.keyboard.press('Escape')



def focus_rules(page, w):
    """UI-PRINCIPLES.md N7, N8 and C13 with the verification of 0a6ef7b: a dialog opened by a press
    on the ribbon or from the search box takes the focus (its first control; under a finger never a
    text field); Tab goes round inside it; opened by the keys from a control, Esc gives that
    control the focus back; one dialog at a time; File's Back shows its ring only when the keys
    opened File."""
    touch = page.evaluate("matchMedia('(pointer: coarse)').matches")
    load_doc(page, DOC)
    where = "(() => { const a = document.activeElement; return [!!(a && a.closest('body > .pop')), a.tagName, (a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 20)]; })()"
    click_text(page, 'Second paragraph', 3)
    open_tab(page, 'Review', touch)
    (page.tap if touch else page.click)('#rr-a11y'); page.wait_for_timeout(400)
    a = page.evaluate(where)
    check(f'Check accessibility from the ribbon takes the focus into its dialog ({w})', a[0] and (not touch or a[1] != 'INPUT'), a)
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    if not touch:
        page.click('#bar .srch input'); page.keyboard.type('AutoCorrect Options'); page.wait_for_timeout(300); page.keyboard.press('Enter'); page.wait_for_timeout(400)
        a = page.evaluate(where)
        check(f'AutoCorrect Options from the search box takes the focus into its dialog ({w})', a[0], a)
        page.keyboard.press('Escape'); page.wait_for_timeout(200)
        click_text(page, 'Second paragraph', 3); run_cmd(page, 'word-count'); page.wait_for_timeout(300)
        walk = []
        for _ in range(7):
            page.keyboard.press('Tab'); page.wait_for_timeout(40)
            walk.append(page.evaluate(where))
        check(f'Tab goes round inside Word Count, never out of it ({w})', all(x[0] for x in walk), walk)
        page.keyboard.press('Shift+Tab'); page.wait_for_timeout(40)
        check(f'and Shift+Tab too ({w})', page.evaluate(where)[0])
        page.keyboard.press('Escape'); page.wait_for_timeout(200)
        # opened by the keys from a control of the ribbon: Esc gives it the focus back (N7)
        page.focus('#rr-a11y'); page.keyboard.press('Enter'); page.wait_for_timeout(400)
        page.keyboard.press('Escape'); page.wait_for_timeout(200)
        back = page.evaluate("document.activeElement.id")
        check(f'a dialog opened by the keys from a ribbon button gives that button the focus back ({w})', back == 'rr-a11y', back)
        # one dialog at a time (N8)
        click_text(page, 'Second paragraph', 3); run_cmd(page, 'font-dialog'); run_cmd(page, 'paragraph-settings'); page.wait_for_timeout(300)
        n = page.evaluate("[...document.querySelectorAll('[role=dialog], [aria-modal=true]')].filter((d) => d.checkVisibility() && !d.closest('[hidden]') && d.getBoundingClientRect().width > 0).map((d) => d.id || d.className.slice(0, 30))")
        check(f'one dialog at a time: a second replaces the first ({w})', len(n) == 1, n)
        page.keyboard.press('Escape'); page.wait_for_timeout(200)
        # Back's ring: none after a press on File, shown after Alt, F
        page.get_by_role('tab', name='File').click(); page.wait_for_timeout(400)
        r1 = page.evaluate("[document.activeElement.id, document.activeElement.matches(':focus-visible')]")
        page.keyboard.press('Escape'); page.wait_for_timeout(300)
        click_text(page, 'Second paragraph', 3)
        page.keyboard.press('Alt'); page.wait_for_timeout(150); page.keyboard.press('f'); page.wait_for_timeout(400)
        r2 = page.evaluate("[document.activeElement.id, document.activeElement.matches(':focus-visible')]")
        check(f'File\'s Back: no ring after a press on File, a ring after Alt, F ({w})', r1 == ['rf-back', False] and r2 == ['rf-back', True], (r1, r2))
        page.keyboard.press('Escape')



BAR = """(() => [...document.querySelectorAll('#bar button, #bar input')].filter((e) => e.offsetParent && e.getClientRects().length).map((e) => { const r = e.getBoundingClientRect(); return [e.id || e.className.slice(0, 12), Math.round(r.left), Math.round(r.right), Math.round(r.width), Math.round(r.height)]; }).sort((a, b) => a[1] - b[1]))()"""


def bar_room(p):
    """A phone's top bar at 390, 360 and 320 px with touch (UI-PRINCIPLES.md T1, T3, L7): every
    target 44 by 44 px, 8 px between two of them, none off the screen or over another (Search ran
    10 px into Share at 320 px); Redo, gone below 380 px, is in the menu panel by name; and a
    window 320 px wide, mouse or finger, scrolls neither way (WCAG 1.4.10)."""
    for width, touch in ((390, True), (360, True), (320, True), (320, False)):
        browser, page, errors = open_page(p, width=width, height=700, touch=touch, layout='mobile')
        page.wait_for_timeout(600)
        w = f'{width} px{", touch" if touch else ""}'
        sw = page.evaluate('[document.documentElement.scrollWidth, document.body.scrollWidth]')
        check(f'nothing wider than the window ({w})', max(sw) <= width, sw)
        if touch:
            bar = page.evaluate(BAR)
            gaps = [b[1] - a[2] for a, b in zip(bar, bar[1:])]
            check(f'the bar\'s targets 44 by 44 px, 8 px apart, inside the screen ({w})', all(b[3] >= 44 and b[4] >= 44 for b in bar) and all(g >= 8 for g in gaps) and bar[0][1] >= 0 and bar[-1][2] <= width, (bar, gaps))
            if width < 380:
                page.tap('#b-nav'); page.wait_for_timeout(400)
                check(f'Redo, not on the bar, is in the menu panel by name ({w})', page.get_by_role('menuitem', name='Redo', exact=True).count() == 1)
        check(f'no console errors (bar_room, {w})', not errors, errors[:3])
        browser.close()



def tap_alternatives(page, w):
    """Every drag has a single press alternative (UI-PRINCIPLES.md T5, WCAG 2.5.7): a double click
    on a ruler's indent marker opens the Paragraph dialog, on a margin marker Page setup, as Word's
    ruler does, and their tooltips say so; a picture's handles and Crop's bars have Height, Width
    and Crop by Numbers."""
    load_doc(page, DOC)
    run_cmd(page, 'ruler') if not page.evaluate('!!window.rikuy.prefs.ruler') else None
    click_text(page, 'Second paragraph', 3); page.wait_for_timeout(400)
    got = {}
    for k in ('left', 'first', 'ml', 'mt'):
        loc = page.locator(f'#ruler .ru-mk.ru-{k}, #vruler .ru-mk.ru-{k}').first
        if not loc.count() or not loc.is_visible():
            got[k] = None
            continue
        title = loc.get_attribute('title') or ''
        # (where view.py presses them: a margin's marker lies under the indents' at its edge)
        r = loc.bounding_box()
        x = r['x'] + 3 if k == 'ml' else r['x'] + r['width'] / 2
        y = r['y'] + 2 if k == 'mt' else r['y'] + r['height'] / 2
        page.mouse.dblclick(x, y); page.wait_for_timeout(400)
        got[k] = [page.evaluate("(document.querySelector('body > .pop #pop-title') || {}).textContent || ''"), title]
        page.keyboard.press('Escape'); page.wait_for_timeout(200)
        click_text(page, 'Second paragraph', 3)
    ok = got.get('left') and got['left'][0] == 'Paragraph' and got.get('first') and got['first'][0] == 'Paragraph' and got.get('ml') and got['ml'][0].startswith('Page') and 'double click' in got['left'][1] and 'Page setup' in got['ml'][1]
    check(f'a ruler marker double clicked opens its dialog: an indent the Paragraph dialog, a margin Page setup, as its tooltip says ({w})', ok, got)
    # (Picture Format's Height and Width are number fields, as Word's; Crop's arrow has Crop by Numbers)
    import json
    ctl = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist', 'controls.json')))['controls']
    have = {x['command']: x['role'] for x in ctl if x.get('command') in ('picture-height', 'picture-width', 'picture-crop')}
    crop = page.evaluate("(window.rikuy.commandMenu ? window.rikuy.commandMenu('picture-crop') : null)")
    check(f'a picture\'s handles have Height and Width as number fields, Crop a button ({w})', have == {'picture-height': 'spinbutton', 'picture-width': 'spinbutton', 'picture-crop': 'button'}, (have, crop))



MOTION = """(() => { const out = { kf: {}, tr: [] }; const walk = (rules, media) => { for (const r of rules) {
  if (r instanceof CSSKeyframesRule) { const props = new Set(); for (const f of r.cssRules) for (let i = 0; i < f.style.length; i++) props.add(f.style[i]); out.kf[r.name] = [...props]; }
  else if (r instanceof CSSMediaRule) walk(r.cssRules, r.conditionText);
  else if (r.style && r.style.transitionProperty && !['unset', 'none', 'initial'].includes(r.style.transitionProperty)) out.tr.push([r.selectorText, r.style.transitionProperty, r.style.transitionDuration, media || '']); } };
  for (const s of document.styleSheets) { try { walk(s.cssRules, ''); } catch (e) {} } return out; })()"""


def motion(page, w):
    """Motion as UI-PRINCIPLES.md M1 to M3 ask: animations and transitions move only opacity and
    transform (the jump's mark is a still one now, the PDF's progress no longer animates its
    width), transitions last 50 to 300 ms in steps of 50 (three ran 120 ms); with reduced motion
    asked for, the PDF's busy bar stands still, the outline's triangles turn at once and the PDF
    pane does not glide. (CodeMirror's own blink is the source editor's caret.)"""
    m = page.evaluate(MOTION)
    kf = {k: v for k, v in m['kf'].items() if k != 'blink' and not set(v) <= {'opacity', 'transform'}}
    check(f'every animation moves opacity or transform only ({w})', not kf and m['kf'], kf or m['kf'])
    ok = lambda d: all(x.strip().endswith('ms') and int(float(x.strip()[:-2])) % 50 == 0 and 50 <= float(x.strip()[:-2]) <= 300 or x.strip().endswith('s') and not x.strip().endswith('ms') and round(float(x.strip()[:-1]) * 1000) % 50 == 0 and 0.05 <= float(x.strip()[:-1]) <= 0.3 for x in d.split(','))
    bad = [t for t in m['tr'] if not set(x.strip() for x in t[1].split(',')) <= {'opacity', 'transform'} or not ok(t[2])]
    check(f'every transition moves opacity or transform, in 50 to 300 ms by steps of 50 ({w})', not bad, bad)
    page.emulate_media(reduced_motion='reduce')
    load_doc(page, DOC)
    r = page.evaluate("""(() => { const p = document.createElement('div'); p.className = 'pdf-prog busy'; const s = document.createElement('span'); p.append(s); document.body.append(p);
      const t = document.createElement('button'); t.className = 'nv-tog'; t.innerHTML = '<svg></svg>'; document.body.append(t);
      const out = [getComputedStyle(s).animationName, getComputedStyle(t.querySelector('svg')).transitionDuration]; p.remove(); t.remove(); return out; })()""")
    check(f'with reduced motion the PDF\'s busy bar stands still and the outline\'s triangles turn at once ({w})', r == ['none', '0s'], r)
    page.emulate_media(reduced_motion='no-preference')



MENU_DOC = ('\\documentclass{article}\n\\begin{document}\n\\section{Opening}\nFirst paragraph here, with a bold word.\n\n'
            'Second paragraph here.\n\\end{document}\n')
SMALL = {'a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to'}


def menus(page, w):
    """The right click menu as UI-PRINCIPLES.md C9, C11, C13 and P2 ask: 8 px corners, items with
    4 px; every item's words capitalised (but the small ones inside), four at most, "…" on exactly
    the items that open a dialog (each pressed to see); the shortcuts in one column at the right;
    the keys' ring an outline."""
    seen = {}
    for ctx, word in (('text', 'Second paragraph'), ('heading', 'Opening')):
        load_doc(page, MENU_DOC); click_text(page, word, 2)
        page.keyboard.press('Shift+F10'); page.wait_for_timeout(300)
        m = page.evaluate("""(() => { const m = document.querySelector('.pop-ctx'); if (!m) return null; const R = (e) => e.getBoundingClientRect(); const a = document.activeElement;
          return { radius: getComputedStyle(m).borderTopLeftRadius, ring: [a.matches('.pop-ctx [role^=menuitem]'), getComputedStyle(a).outlineStyle],
            items: [...m.querySelectorAll('[role^=menuitem]:not(.mi-hint)')].map((i) => [i.getAttribute('aria-label'), (i.querySelector('.mi-n') || {}).textContent || '', i.getAttribute('aria-disabled') === 'true', getComputedStyle(i).borderTopLeftRadius]),
            keys: [...m.querySelectorAll('.mi-k')].map((k) => { const n = k.parentElement.querySelector('.mi-n'), r = document.createRange(); r.selectNodeContents(n); return [Math.round(R(k).right), Math.round(r.getBoundingClientRect().right), Math.round(R(k).left)]; }) }; })()""")
        page.keyboard.press('Escape'); page.wait_for_timeout(100)
        seen[ctx] = m
        dlg = {}
        for name, label, off, _ in (m or {}).get('items', []):
            if off or name in ('Paste', 'Cut', 'Copy', 'Synonyms', 'Ask Claude'):
                continue
            load_doc(page, MENU_DOC); click_text(page, word, 2)
            page.keyboard.press('Shift+F10'); page.wait_for_timeout(250)
            page.locator('.pop-ctx [role^=menuitem]').and_(page.get_by_label(name, exact=True)).first.click(timeout=3000); page.wait_for_timeout(300)
            dlg[label] = page.evaluate("!!document.querySelector('body > .pop.pop-dlg') || !!(document.getElementById('fr') && document.getElementById('fr').offsetParent)")
            page.keyboard.press('Escape'); page.wait_for_timeout(100)
        wrong = {k: v for k, v in dlg.items() if k.endswith('…') != v}
        check(f'"…" on exactly the items that open a dialog, in the {ctx} menu ({w})', dlg and not wrong, wrong or dlg)
    bad = []
    for ctx, m in seen.items():
        for name, label, off, rad in (m or {}).get('items', []):
            words = label.rstrip('…').split()
            if len(words) > 4 or any(not (x[0].isupper() or not x[0].isalpha() or (i and x in SMALL)) for i, x in enumerate(words)) or rad != '4px':
                bad.append((ctx, label, rad))
    check(f'every item\'s words capitalised, four at most, 4 px corners ({w})', seen and all(seen.values()) and not bad, bad)
    check(f'the menus have 8 px corners and the keys\' ring is an outline ({w})', all(m['radius'] == '8px' and m['ring'][0] and m['ring'][1] != 'none' for m in seen.values()), {k: (m['radius'], m['ring']) for k, m in seen.items()})
    check(f'the shortcuts in one column at the right, after the names ({w})', all(m['keys'] and max(x[0] for x in m['keys']) - min(x[0] for x in m['keys']) <= 1 and all(x[2] >= x[1] + 8 for x in m['keys']) for m in seen.values()), {k: m['keys'] for k, m in seen.items()})



def empty_panes(page, w):
    """An empty pane or list says in one sentence what belongs there and offers the one command
    that puts it there (UI-PRINCIPLES.md N5): the Navigation pane's headings, Apply Heading 1, which
    makes the caret's paragraph a heading; File's Recent list, Open."""
    load_doc(page, '\\documentclass{article}\n\\begin{document}\nJust one paragraph of plain words.\n\\end{document}\n')
    click_text(page, 'one paragraph', 2)
    run_cmd(page, 'navigation-pane'); page.wait_for_timeout(400)
    e = page.evaluate("(() => { const e = [...document.querySelectorAll('#nav .nav-empty')].find((x) => x.offsetParent); if (!e) return null; const t = e.innerText.trim().split('\\n').filter(Boolean); return { lines: t, buttons: [...e.querySelectorAll('button')].map((b) => b.textContent.trim()) }; })()")
    one = lambda t: t and len([x for x in t[0].split('. ') if x]) == 1 and '\\' not in t[0]
    check(f'the empty Navigation pane: one sentence, no LaTeX in it, one button ({w})', e and one(e['lines']) and e['buttons'] == ['Apply Heading 1'], e)
    if e and e['buttons']:
        page.locator('#nav .nav-empty button').click(); page.wait_for_timeout(500)
        check(f'which makes the caret\'s paragraph a heading, listed there ({w})', '\\section{Just one paragraph' in src(page) and page.evaluate("[...document.querySelectorAll('#nav .nv-row, #nav [role=treeitem]')].some((r) => r.offsetParent && r.textContent.includes('Just one'))"), src(page)[-120:])
    open_tab(page, 'File', page.evaluate("matchMedia('(pointer: coarse)').matches")); page.wait_for_timeout(500)
    r = page.evaluate("(() => { const p = document.querySelector('.rf-none'); return p && p.offsetParent ? [p.textContent, [...p.parentElement.querySelectorAll('button')].filter((b) => b.offsetParent).map((b) => b.textContent.trim())] : null; })()")
    check(f'File\'s empty Recent list: one sentence and Open ({w})', r and one([r[0]]) and r[1] == ['Open'], r)
    if r:
        with page.expect_file_chooser(timeout=3000) as fc:
            page.click('#rf-none-open')
        check(f'Open there asks for a file ({w})', fc.value is not None)
    page.keyboard.press('Escape')


PARTS = {'consistency': (consistency, [(1366, False), (1920, True), (390, False), (360, True)]),
         'bar_room': (bar_room, None),
         'motion': (motion, [(1366, False)]),
         'empty_panes': (empty_panes, [(1366, False), (1920, True)]),
         'menus': (menus, [(1366, False), (1920, True)]),
         'tap_alternatives': (tap_alternatives, [(1366, False), (1920, True)]),
         'focus_rules': (focus_rules, [(1366, False), (1920, True), (390, False)]),
         'contrast': (contrast, [(1366, False), (1366, True), (390, False), (390, True)]),
         'dialog_kinds': (dialog_kinds, [(1366, False), (1920, True), (390, False), (360, True)]),
         'verify_lows': (verify_lows, [(1366, False), (1920, True)]), 'widen': (widen, None),
         'place_kept': (place_kept, [(1366, False), (390, False)]),
         'lows': (lows, [(390, False), (768, False), (1024, True)]),
         'pane_room': (pane_room, [(1024, False), (1920, True)]),
         'caret_back': (caret_back, [(1366, False), (1100, True)]),
         'help_pane': (help_pane, [(1366, False), (1920, True), (390, False)]),
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
MOBILE = {'mobile_view', 'first_visit', 'doc_name', 'sample_spelling', 'place_kept'}
# the parts on tablets: a touch screen at any width
TOUCH = {'lows'}


def run(which):
    with sync_playwright() as p:
        for name in which:
            fn, sizes = PARTS[name]
            if sizes is None:
                fn(p)
                continue
            for width, dark in sizes:
                touch = width < 700 or name in TOUCH
                browser, page, errors = open_page(p, width=width, height=820 if touch else 900, dark=dark, touch=touch, layout='mobile' if name in MOBILE else 'print')
                fn(page, '%d px%s' % (width, ', dark' if dark else ''))
                check(f'no console errors ({name}, {width} px)', not errors, errors[:4])
                browser.close()
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(run(sys.argv[1:] or list(PARTS)))
