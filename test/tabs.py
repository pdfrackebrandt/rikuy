"""The ribbon's frame (src/ribbon/tabs.js, src/ribbon/order.js, src/commands.js, src/keys.js,
src/ui/search.js, src/ui/menu.js, src/ui/kit.js), in Chromium.

The tabs by mouse and by keys (the arrows, Home and End, the down arrow into the toolbar, Escape
back to the page), one tab panel in the accessibility tree at a time and no name twice in it, the
Download group at the end of every tab; the contextual tabs coming with the caret in their object
and going with it (Table Layout in a cell; Picture Format, Equation, Header & Footer with a command
brought in for the test); the row at 1400, 1024, 860 and 390 px, and groups folding into a button
named after them, whose menu runs the same commands; Ctrl+F1 and the collapse button; every
command of the registry reached by role and name on its tab; the keys of the chord table (Ctrl+Alt+1
to 3 and 0, Ctrl+Shift+L, Alt+Q, Ctrl+F1, Shift+F10), the AltGr guard and an input method composing;
the search box (Word's names, other names, Enter, a command that cannot run here); the right click
menu by context, a second right click for the browser's; the kit (split button, menu, gallery,
colour picker, number field, dialog shell); the round trip rule (test/browser.py's roundtrip) on
Bold, Italic, Underline with their hand written forms, and the headings by their keys; Bold taken
off a hand written group whose braces do something for the words around it; and the review's
other findings: the folded ribbon kept over a reload and shown for a moment by a tab, Ctrl+F1 from
a field and none kept below 861 px, the groups named, Ctrl+Shift+B, the search box with no place,
the menu (no Ask Claude outside Claude, Shift+F10 again, a long press), a contextual tab's option
on a phone, Page width on a phone, and Home whole at 860 px. Word's layout of the other tabs (src/ribbon/layout.js):
large and small buttons, group names whole, every tab as tall as Home, the steps before a group folds, and the
KeyTips of a tab's controls.

RIKUY_DIST names another dist/."""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import settle, until, ready, wait_src, open_page, check, results, src, load_doc, click_text, select_text, roundtrip, place, pressed
from playwright.sync_api import sync_playwright

WRAP = lambda body, pre='': '\\documentclass{article}\n' + pre + '\\begin{document}\n' + body + '\n\\end{document}\n'
DOC = WRAP('\\section{Opening}\nFirst paragraph here.\n\nSecond paragraph here.\n\nThird paragraph here.')
TABLE = WRAP('A paragraph.\n\n\\begin{tabular}{ll}\ncell & other \\\\\nmore & last \\\\\n\\end{tabular}\n\nAfter it.')
ACTED = {'button', 'link', 'textbox', 'searchbox', 'combobox', 'listbox', 'checkbox', 'radio', 'switch', 'slider', 'spinbutton', 'menuitem', 'menuitemcheckbox',
         'menuitemradio', 'tab', 'dialog', 'menu', 'toolbar', 'tablist', 'tabpanel'}



def named(page, name):
    """A ribbon button by its name: the button, or where its group is folded (Home's Insert, which
    the Insert tab has too, folds first), the item of that name in the group's menu."""
    b = page.get_by_role('button', name=name, exact=True)
    if b.count() == 1 and b.is_visible():
        return b.click()
    gb = page.evaluate("""(name) => { for (const e of document.querySelectorAll('.rb-panel:not([hidden]) .rb-grp [aria-label]')) { const g = e.closest('.rb-grp').querySelector('.rb-gbtn'); if (e.getAttribute('aria-label') === name && !e.offsetParent && g.offsetParent) return g.id; } return null; }""", name)
    page.click('#' + gb); settle(page, 150)
    page.locator('.pop [role^=menuitem][aria-label="%s"]' % name).click()

def ax_names(page):
    """(role, name) of everything acted on in Chromium's accessibility tree, as it is now."""
    cdp = page.context.new_cdp_session(page)
    cdp.send('Accessibility.enable')
    out = []
    for n in cdp.send('Accessibility.getFullAXTree')['nodes']:
        role = (n.get('role') or {}).get('value')
        name = ((n.get('name') or {}).get('value') or '').strip()
        if not n.get('ignored') and role in ACTED and name:
            out.append((role, name))
    cdp.detach()
    return out


def twice(page):
    names = ax_names(page)
    return sorted({x for x in names if names.count(x) > 1})


def shown_tabs(page):
    return page.evaluate("[...document.querySelectorAll('#rb-tabs [role=tab]')].filter((t) => !t.hidden).map((t) => t.textContent)")


def open_tab(page, name):
    page.get_by_role('tablist', name='Ribbon', exact=True).get_by_role('tab', name=name, exact=True).click()
    settle(page, 150)


def mouse_and_keys(page):
    load_doc(page, DOC)
    click_text(page, 'Second paragraph', 3)
    tabs = shown_tabs(page)
    WORD = ['File', 'Home', 'Insert', 'Design', 'Layout', 'References', 'Review', 'View', 'Help']
    check('the tablist "Ribbon" holds the tabs in Word\'s order, Home open; tabs without a command yet are not shown', tabs == [t for t in WORD if t in tabs] and 'Home' in tabs and 'Layout' in tabs
          and page.get_by_role('tab', name='Home', exact=True).get_attribute('aria-selected') == 'true', tabs)
    seen = []
    for name in tabs:
        open_tab(page, name)
        panels = page.get_by_role('tabpanel')
        st = page.evaluate('''(n) => { const t = [...document.querySelectorAll('#rb-tabs [role=tab]')].find((x) => x.textContent === n), p = document.getElementById(t.getAttribute('aria-controls'));
          return { sel: t.getAttribute('aria-selected'), tb: p.querySelector('[role=toolbar]').getAttribute('aria-label'), dl: !!p.querySelector('.rb-dl'), shown: [...document.querySelectorAll('.rb-panel')].filter((x) => !x.hidden).length,
            caret: document.activeElement.id }; }''', name)
        seen.append((name, st['sel'] == 'true' and st['tb'] == name and st['dl'] and st['shown'] == 1 and panels.count() == 1 and page.get_by_role('tabpanel', name=name, exact=True).count() == 1, st['caret']))
    check('a click opens each tab: its panel alone in the accessibility tree, a toolbar named after the tab, the downloads at its end', all(x[1] for x in seen), seen)
    # (File is a view over the page, which is inert under it: the keys go to its Back button there,
    # docs/handoff/UX-AUDIT.md; the next tab gives the page its caret back)
    check('and the caret stays on the page (in File, on its Back button)', all(x[2] == ('rf-back' if x[0] == 'File' else 'pages') for x in seen), seen)
    dup = {}
    for name in tabs:
        open_tab(page, name)
        d = twice(page)
        if d: dup[name] = d
    check('with each tab open, no role and name is in the accessibility tree twice', not dup, dup)
    open_tab(page, 'Home')
    # by keys: the open tab is the tablist's stop, the arrows go along, the down arrow into the toolbar
    page.focus('#rt-home')
    got = []
    for key in ('ArrowRight', 'ArrowRight', 'End', 'Home', 'ArrowLeft', 'ArrowRight'):
        page.keyboard.press(key); settle(page, 80)
        got.append(page.evaluate('[document.activeElement.textContent, document.querySelector("#rb-tabs [aria-selected=true]").textContent]'))
    # (from Home two to the right, the last, the first, back round to the last, on to the first)
    k = tabs.index('Home')
    want = [tabs[k + 1], tabs[k + 2], tabs[-1], tabs[0], tabs[-1], tabs[0]]
    check('the arrows, Home and End move along the tabs and open each (the last wraps to the first)', [g[0] for g in got] == want and all(a == b for a, b in got), got)
    stops = page.evaluate('[...document.querySelectorAll("#rb-tabs [role=tab]")].filter((t) => t.tabIndex === 0).map((t) => t.textContent)')
    check('one tab stop in the tablist: the open tab', stops == [tabs[0]], stops)
    open_tab(page, 'Home'); page.focus('#rt-home')
    page.keyboard.press('ArrowDown'); settle(page, 80)
    into = page.evaluate('[document.activeElement.id, document.activeElement.closest("[role=toolbar]") && document.activeElement.closest("[role=toolbar]").getAttribute("aria-label")]')
    check('the down arrow goes into the open tab\'s toolbar, to its tab stop', into == ['rc-paste', 'Home'], into)
    page.focus('#rt-insert'); page.keyboard.press('Enter'); settle(page, 80)
    check('Enter on a tab opens it and goes into its toolbar', page.evaluate('document.activeElement.closest("#rp-insert") !== null'))
    page.keyboard.press('Escape'); settle(page, 80)
    check('Escape there goes back to the caret on the page', page.evaluate('document.activeElement.id') == 'pages')
    open_tab(page, 'Home')
    # a copy of a command on another tab does what the first does
    click_text(page, 'Second paragraph', 6)
    open_tab(page, 'Insert')
    page.get_by_role('button', name='Table', exact=True).click(); settle(page, 200)
    check('Table on Insert (a copy of Home\'s) puts the same table in, after the caret\'s paragraph', 'Second paragraph here.\n\n\\begin{table}[h]' in src(page), src(page)[60:200])
    page.evaluate('rikuy.undo()')
    open_tab(page, 'Home')


def contextual(page):
    load_doc(page, TABLE)
    click_text(page, 'A paragraph', 2); settle(page, 200)
    before = shown_tabs(page)
    click_text(page, 'cell', 2); settle(page, 250)
    during = shown_tabs(page)
    check('with the caret in a table the contextual tab Table Layout comes, after Help', 'Table Layout' not in before and during[-1] == 'Table Layout', (before, during))
    open_tab(page, 'Table Layout')
    page.get_by_role('button', name='Insert below', exact=True).click(); settle(page, 200)
    check('its Insert below adds a row under the caret\'s', 'cell & other \\\\\n &  \\\\\nmore' in src(page) or src(page).count('\\\\') == 3, src(page)[60:200])
    page.evaluate('rikuy.undo()'); settle(page, 150)
    click_text(page, 'After it', 2); settle(page, 250)
    check('and with the caret out of the table it goes, and the tab open before it opens again', 'Table Layout' not in shown_tabs(page) and page.evaluate('document.querySelector("#rb-tabs [aria-selected=true]").textContent') == 'Home')
    # the other contextual tabs, with a command of the test in each
    page.evaluate('''() => { const R = window.rikuy.cmds; for (const [id, tab, group] of [['t-pic', 'picture-format', 'size'], ['t-eq', 'equation', 'tools'], ['t-hf', 'headfoot', 'headfoot']])
        R.register({ id, name: 'Test ' + id, tab, group, label: 'Test', when: () => true, run: () => { window.__ran = id; } }); window.rikuy.ribbonBuild(); }''')
    load_doc(page, DOC)
    click_text(page, 'Second paragraph', 3)
    named(page, 'Formula')
    page.wait_for_selector('.pop-math'); settle(page, 300)
    eq = shown_tabs(page)
    page.keyboard.press('Escape'); settle(page, 300)
    check('the Equation tab comes while the equation field is open, and goes with it', eq[-1] == 'Equation' and 'Equation' not in shown_tabs(page), (eq, shown_tabs(page)))
    page.evaluate('''() => { const el = document.createElement('img'); el.className = 'a-img'; document.querySelector('#pages .it').append(el); window.rikuy.arm({ kind: 'img', el }); window.rikuy.ribbonSync(); }''')
    pic = shown_tabs(page)
    open_tab(page, 'Picture Format')
    page.get_by_role('button', name='Test t-pic', exact=True).click()
    page.evaluate('() => { window.rikuy.disarm(); window.rikuy.ribbonSync(); }')
    check('Picture Format comes with a picture selected, its commands run, and it goes when the picture is let go', pic[-1] == 'Picture Format' and page.evaluate('window.__ran') == 't-pic' and 'Picture Format' not in shown_tabs(page), pic)
    check('Header & Footer stays away while nothing puts the caret in a header (B6 brings it)', 'Header & Footer' not in pic)
    page.evaluate('''() => { for (const id of ['t-pic', 't-eq', 't-hf']) window.rikuy.cmds.unregister(id); window.rikuy.ribbonBuild(); }''')
    page.evaluate('rikuy.toggleNav(false)')


def widths(page):
    load_doc(page, DOC)
    seen = {}
    for w in (1400, 1024, 860, 390):
        page.set_viewport_size({'width': w, 'height': 900}); settle(page, 300, full=True)
        click_text(page, 'Second paragraph', 3); settle(page, 150)
        seen[w] = page.evaluate('''() => { const r = document.getElementById('ribbon'), b = r.getBoundingClientRect(), top = document.getElementById('rb-top');
          return { tabs: !!top.offsetParent, sel: !!document.getElementById('rb-tabsel').offsetParent, over: r.scrollWidth > r.clientWidth + 1, h: Math.round(b.height),
            folded: [...document.querySelectorAll('.rb-grp.folded')].map((g) => g.dataset.group), ico: [...document.querySelectorAll('.rb-grp.ico')].map((g) => g.dataset.group), page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            dl: [...document.querySelectorAll('.rb-dl button')].filter((x) => x.offsetParent).map((x) => x.id) }; }''')
    print('     widths:', seen)
    # (Home's Insert, which the Insert tab has too, is spare: it folds first, into one icon button
    # named Insert, so Home's other groups keep their buttons and names; src/ribbon/order.js)
    # (at 860 px, where the Font group keeps Bold, Italic and Underline beside its button (B1), the
    # Paragraph group (B3's lists, B2's alignment and spacing) is one row and folds into its button
    # with Insert: a wider window then never shows fewer controls, which two rows here broke at 870 px)
    check('at 1400 and 1024 px the row does not scroll and Home folds its spare Insert alone, into one icon button named Insert, the tabs a row above the toolbar; at 860 px Paragraph and Insert, each one icon button named after it', all(seen[w]['tabs'] and not seen[w]['sel'] for w in (1400, 1024))
          and all(not seen[w]['over'] and seen[w]['folded'] == ['insert'] and seen[w]['ico'] == ['insert'] for w in (1400, 1024)) and not seen[860]['over'] and seen[860]['folded'] == ['paragraph', 'insert'] and seen[860]['ico'] == ['paragraph', 'insert'], seen)
    check('at 860 and 390 px the tabs are the combobox "Ribbon tab" at the row\'s start, in one row that scrolls sideways on a phone', all(not seen[w]['tabs'] and seen[w]['sel'] and seen[w]['h'] <= 44 and seen[w]['page'] <= 0 for w in (860, 390)) and seen[390]['over'], seen)
    # (the three go before any group folds: they take two controls, Editing three; at 860 px the
    # folded Paragraph group leaves room for them)
    # (from 900 px with a mouse the three stand one under another, a group as narrow as its longest
    # name: Home has room for them at 1024 px)
    check('the downloads: three at 1400 and 1024 px; one Download menu where the row has no room for three (860 px, and on a phone)', all(seen[w]['dl'] == ['rb-pdf', 'rb-word', 'b-save'] for w in (1400, 1024)) and all(seen[w]['dl'] == ['rb-dl-menu'] for w in (860, 390)) and not seen[860]['over'], {w: seen[w]['dl'] for w in seen})
    page.set_viewport_size({'width': 390, 'height': 900}); settle(page, 300, full=True)
    page.get_by_role('combobox', name='Ribbon tab', exact=True).select_option(label='Insert'); settle(page, 200)
    check('on a phone the combobox opens a tab: Insert\'s Picture is there by its name', page.get_by_role('tabpanel', name='Insert', exact=True).get_by_role('button', name='Picture', exact=True).is_visible())
    page.get_by_role('combobox', name='Ribbon tab', exact=True).select_option(label='Home'); settle(page, 200)
    # groups fold, the lowest rank first, into a button named after the group
    page.evaluate('''() => { const R = window.rikuy.cmds;
      for (let k = 0; k < 6; k++) R.register({ id: 't-ed' + k, name: 'Editing test ' + k, tab: 'home', group: 'editing', label: 'Editing test ' + k, icon: '<path d="M4 4h12"/>', when: () => true, run: () => { window.__ran = 't-ed' + k; } });
      for (let k = 0; k < 8; k++) R.register({ id: 't-cl' + k, name: 'Clipboard test ' + k, tab: 'home', group: 'clipboard', label: 'Clipboard test ' + k, icon: '<path d="M4 4h12"/>', when: () => true, run: () => {} });
      window.rikuy.ribbonBuild(); }''')
    f = {}
    for w in (900, 1024):
        page.set_viewport_size({'width': w, 'height': 900}); settle(page, 300, full=True)
        click_text(page, 'Second paragraph', 3); settle(page, 150)
        f[w] = page.evaluate('''() => ({ folded: [...document.querySelectorAll('#rp-home .rb-grp.folded')].map((g) => g.dataset.group), over: document.getElementById('ribbon').scrollWidth > document.getElementById('ribbon').clientWidth + 1 })''')
    # (Clipboard folds at 900 px too where the downloads stand side by side; one under another they
    # leave it room)
    # (eight more in Clipboard, with their names, are three columns: at 1024 px it folds with Insert)
    check('with more than fits, groups fold, the spare Insert first and then the lowest ranks: at 1024 px Insert and at most Clipboard and Editing (ranks 2 and 1), at 900 px Editing with them and then Paragraph (rank 4) as the row needs; the row fits', 'insert' in f[1024]['folded'] and set(f[1024]['folded']) <= {'clipboard', 'editing', 'insert'} and {'editing', 'insert'} <= set(f[900]['folded']) <= {'clipboard', 'editing', 'insert', 'paragraph'} and not f[900]['over'] and not f[1024]['over'], f)
    page.set_viewport_size({'width': 900, 'height': 900}); settle(page, 300, full=True)
    gb = page.get_by_role('button', name='Editing', exact=True)
    check('a folded group is one button named after it; its own buttons are out of the accessibility tree', gb.count() == 1 and page.get_by_role('button', name='Editing test 0', exact=True).count() == 0 and not twice(page), twice(page))
    gb.click(); settle(page, 200)
    menu = page.get_by_role('menu', name='Editing', exact=True)
    names = [menu.get_by_role('menuitem').nth(k).get_attribute('aria-label') for k in range(menu.get_by_role('menuitem').count())]
    # (Home's own Editing commands, Find (with its menu's Advanced Find and Go To), Replace and Select, come first: B5's)
    check('it opens a menu "Editing" of its commands by their names', names[-6:] == ['Editing test %d' % k for k in range(6)] and names[:-6] == ['Find', 'Advanced Find', 'Go To', 'Replace', 'Select'] and gb.get_attribute('aria-expanded') == 'true', names)
    menu.get_by_role('menuitem', name='Editing test 3', exact=True).click(); settle(page, 150)
    check('and an item runs its command, the menu closed, the caret on the page', page.evaluate('window.__ran') == 't-ed3' and page.get_by_role('menu').count() == 0 and page.evaluate('document.activeElement.id') == 'pages')
    page.set_viewport_size({'width': 1920, 'height': 900}); settle(page, 300, full=True)
    check('with room again (1920 px) every group is open but the spare Insert', page.evaluate("[...document.querySelectorAll('.rb-grp.folded')].map((g) => g.dataset.group)") in ([], ['insert']), page.evaluate("[...document.querySelectorAll('.rb-grp.folded')].map((g) => g.dataset.group)"))
    page.evaluate('''() => { for (const c of window.rikuy.cmds.commands()) if (/^t-(ed|cl)/.test(c.id)) window.rikuy.cmds.unregister(c.id); window.rikuy.ribbonBuild(); }''')
    page.set_viewport_size({'width': 1400, 'height': 1000}); settle(page, 300, full=True)


def collapse(page):
    load_doc(page, DOC); click_text(page, 'Second paragraph', 3)
    page.keyboard.press('Control+F1'); settle(page, 200)
    a = page.evaluate('[document.body.classList.contains("rb-collapsed"), !!document.getElementById("ribbon").offsetParent, document.getElementById("rb-collapse").getAttribute("aria-pressed"), document.activeElement.id]')
    page.keyboard.press('Control+F1'); settle(page, 200)
    b = page.evaluate('[document.body.classList.contains("rb-collapsed"), !!document.getElementById("ribbon").offsetParent]')
    check('Ctrl+F1 folds the ribbon to its tabs (the caret stays on the page) and shows it again', a == [True, False, 'true', 'pages'] and b == [False, True], (a, b))
    page.get_by_role('button', name='Collapse the ribbon', exact=True).click(); settle(page, 150)
    open_tab(page, 'Insert')
    c = page.evaluate('[document.body.classList.contains("rb-collapsed"), !!document.getElementById("ribbon").offsetParent, document.querySelector("#rb-tabs [aria-selected=true]").textContent]')
    check('the button "Collapse the ribbon" does it too, and a tab pressed while folded shows the ribbon with that tab (the setting stays folded)', c == [True, True, 'Insert'], c)
    page.get_by_role('button', name='Collapse the ribbon', exact=True).click(); settle(page, 150)
    open_tab(page, 'Home')
    check('and the button shows it again for good', page.evaluate('[document.body.classList.contains("rb-collapsed"), !!document.getElementById("ribbon").offsetParent]') == [False, True])


# (a drawing, a chart and a SmartArt: their contextual tabs, src/cmd/objects.js)
OBJDOC = ('\\documentclass{article}\n\\usepackage{tikz}\n\\usepackage{pgfplots}\n\\pgfplotsset{compat=1.18}\n\\usepackage{smartdiagram}\n\\begin{document}\nA paragraph.\n\n'
          '\\begin{center}\n\\begin{tikzpicture}\n\\draw[thick, draw=blue!60!black, fill=blue!20] (0,0) rectangle (3,2);\n\\draw[thick, draw=red, fill=red!20] (2,1) circle (1);\n\\end{tikzpicture}\n\\end{center}\n\n'
          '\\begin{center}\n\\begin{tikzpicture}\n\\begin{axis}[ybar, width=0.8\\linewidth, height=6cm, ymin=0, symbolic x coords={A,B}, xtick=data, legend pos=north west]\n\\addplot coordinates {(A,1) (B,2)};\n\\addlegendentry{S}\n\\addplot coordinates {(A,2) (B,1)};\n\\addlegendentry{T}\n\\end{axis}\n\\end{tikzpicture}\n\\end{center}\n\n'
          '\\begin{center}\n\\smartdiagram[circular diagram:clockwise]{One, Two, Three}\n\\end{center}\n\\end{document}\n')
OBJ_TABS = {'shape-format': ('shape', 'svg.tz'), 'chart-design': ('chart', 'svg.pgf'), 'chart-format': ('chart', 'svg.pgf'), 'smart-design': ('smart', 'svg.smart'), 'smart-format': ('smart', 'svg.smart')}


def obj_select(page, tab):
    """The object of a contextual tab selected by a press on it, as a person does (one shape of a
    drawing too, so Bring Forward and Send Backward can run)."""
    kind, sel = OBJ_TABS[tab]
    if page.evaluate('(k) => { const o = rikuy.objHere(); return !!o && o.kind === k; }', kind):
        return
    if page.evaluate('!!rikuy.hf'): page.evaluate('rikuy.pageHFClose()')
    if page.evaluate('!!document.querySelector(".pop-math")'): page.evaluate('rikuy.closePop(true)'); settle(page, 100)
    load_doc(page, OBJDOC); settle(page, 250)
    page.locator('#pages ' + sel).first.click(); settle(page, 250)
    if kind == 'shape': page.evaluate('() => { rikuy.shapeSel.k = 0; rikuy.ribbonSync(); }')


PICDOC = '\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\nA paragraph.\n\n\\begin{center}\n\\includegraphics[width=0.5\\linewidth]{figure.png}\n\\end{center}\n\\end{document}\n'


def every_command(page):
    load_doc(page, TABLE)
    bad, n = [], 0
    reg = page.evaluate('rikuy.cmds.describe().filter((x) => x.place === "ribbon" && x.tab && !x.fit && x.role !== "group" && x.only !== "narrow")')
    tabs = page.evaluate('Object.fromEntries([...document.querySelectorAll("#rb-tabs [role=tab]")].map((t) => [t.dataset.tab, t.textContent]))')
    for x in reg:
        if x['tab'] in OBJ_TABS:
            obj_select(page, x['tab'])
        elif x['tab'] == 'picture-format':
            # (a picture selected by a press on it, B8)
            if page.evaluate('!!rikuy.hf'): page.evaluate('rikuy.pageHFClose()')
            if page.evaluate('!!document.querySelector(".pop-math")'): page.evaluate('rikuy.closePop(true)'); settle(page, 100)
            load_doc(page, PICDOC); settle(page, 200); page.locator('#pages .a-img').click(); settle(page, 200)
        elif x['tab'].startswith('table'):
            if page.evaluate('!!rikuy.hf'): page.evaluate('rikuy.pageHFClose()')
            if page.evaluate('!!document.querySelector(".pop-math")'): page.evaluate('rikuy.closePop(true)'); settle(page, 100)
            if '\\includegraphics' in src(page) or 'smartdiagram' in src(page): load_doc(page, TABLE)
            click_text(page, 'cell', 2); settle(page, 200)
        elif x['tab'] == 'headfoot':
            # (the Header & Footer tab is there while the header is open on the page)
            if '\\includegraphics' in src(page): load_doc(page, TABLE)
            if not page.evaluate('!!rikuy.hf'): page.evaluate('rikuy.pageHFOpen("head")'); settle(page, 200)
        elif x['tab'] == 'equation':
            # (the Equation tab shows while an equation's field is open)
            if not page.evaluate('!!document.querySelector(".pop-math")'):
                click_text(page, 'A paragraph', 2); page.evaluate('rikuy.runCommand("formula")'); page.wait_for_selector('.pop-math'); settle(page, 250)
        else:
            if page.evaluate('!!rikuy.hf'): page.evaluate('rikuy.pageHFClose()')
            if page.evaluate('!!document.querySelector(".pop-math")'): page.evaluate('rikuy.closePop(true)'); settle(page, 100)
            if '\\includegraphics' in src(page) or 'smartdiagram' in src(page): load_doc(page, TABLE)
            if page.evaluate('!!rikuy.objHere()'): page.evaluate('rikuy.shapeSel.clear()')
            click_text(page, 'A paragraph', 2); settle(page, 120)
        open_tab(page, tabs[x['tab']])
        loc = page.get_by_role(x['role'], name=x['name'], exact=True)
        n += 1
        if loc.count() != 1 or not page.locator('#' + x['id']).is_visible():
            # (in a folded group, Home's spare Insert: its button's menu has it by the same name)
            gb = page.evaluate("(id) => { const e = document.getElementById(id), g = e && e.closest('.rb-grp.folded'); return g && !e.offsetParent ? g.querySelector('.rb-gbtn').id : null; }", x['id'])
            if gb and loc.count() == 0:
                page.click('#' + gb); settle(page, 150)
                m = page.locator('.pop [role^=menuitem][aria-label="%s"]' % x['name']).count()
                page.keyboard.press('Escape'); settle(page, 100)
                if m == 1:
                    continue
            bad.append((x['tabName'] if 'tabName' in x else x['tab'], x['name'], loc.count()))
    if page.evaluate('!!rikuy.hf'): page.evaluate('rikuy.pageHFClose()')
    page.evaluate('rikuy.closePop(true)'); settle(page, 150)
    open_tab(page, 'Home')
    check('every command placed on the ribbon (%d) is found by its role and name, once, with its tab open' % n, not bad and n > 20, bad)


def keys(page):
    load_doc(page, DOC)
    for k, cmd in (('1', '\\section'), ('2', '\\subsection'), ('3', '\\subsubsection')):
        click_text(page, 'Second paragraph', 3)
        page.keyboard.press('Control+Alt+' + k); settle(page, 150)
        got = src(page)
        page.keyboard.press('Control+Alt+0'); settle(page, 150)
        check('Ctrl+Alt+%s makes the paragraph %s{...}; Ctrl+Alt+0 makes it Normal again, byte for byte' % (k, cmd), got == DOC.replace('Second paragraph here.', cmd + '{Second paragraph here.}') and src(page) == DOC, got[60:140])
    select_text(page, 'Second paragraph here.')
    page.keyboard.press('Control+Shift+L'); settle(page, 150)
    check('Ctrl+Shift+L makes a bulleted list', '\\begin{itemize}\n  \\item Second paragraph here.\n\\end{itemize}' in src(page), src(page)[60:160])
    page.keyboard.press('Control+z'); settle(page, 120)
    # AltGr: Windows says Ctrl+Alt with it; German AltGr+2 types \u00b2, AltGr+0 types }
    click_text(page, 'Second paragraph', 3)
    r = page.evaluate('''() => { const out = []; for (const [key, code] of [['\\u00b2', 'Digit2'], ['}', 'Digit0'], ['1', 'Digit1']]) {
        const e = new KeyboardEvent('keydown', { key, code, ctrlKey: true, altKey: true, modifierAltGraph: true, bubbles: true, cancelable: true });
        document.getElementById('pages').dispatchEvent(e); out.push(e.defaultPrevented); } return out; }''')
    settle(page, 150)
    check('AltGr (Ctrl+Alt with the AltGraph state) is never a heading key: the character is left to be typed', r == [False, False, False] and src(page) == DOC, r)
    r = page.evaluate('''() => { const e = new KeyboardEvent('keydown', { key: '1', code: 'Digit1', ctrlKey: true, altKey: true, isComposing: true, bubbles: true, cancelable: true }); document.getElementById('pages').dispatchEvent(e); return e.defaultPrevented; }''')
    check('nothing is caught while an input method composes', r is False and src(page) == DOC)
    # Alt+Q from the page and from the ribbon
    click_text(page, 'Second paragraph', 3)
    page.keyboard.press('Alt+q'); settle(page, 120)
    a = page.evaluate('document.activeElement.id')
    page.keyboard.press('Escape'); settle(page, 100)
    page.focus('#rb-i'); page.keyboard.press('Alt+q'); settle(page, 120)
    b = page.evaluate('document.activeElement.id')
    page.keyboard.press('Escape'); settle(page, 100)
    check('Alt+Q goes to the search box from the page and from the ribbon; Escape goes back to the page', a == 'rk-search' and b == 'rk-search' and page.evaluate('document.activeElement.id') == 'pages', (a, b))
    # the page's keys are the page's: Ctrl+B in the search box is no bold
    page.focus('#rk-search'); page.keyboard.press('Control+b'); settle(page, 100)
    check('a page key in a field of the bar does nothing to the document', src(page) == DOC)
    page.keyboard.press('Escape')


def search_box(page):
    load_doc(page, DOC)
    click_text(page, 'Third paragraph', 3)
    box = page.get_by_role('combobox', name='Search', exact=True)
    box.click(); box.fill('bullets'); settle(page, 150)
    lb = page.get_by_role('listbox', name='Commands', exact=True)
    opts = lb.get_by_role('option').all_inner_texts()
    check('typing "bullets" lists Bulleted list first (Word\'s name for it), as an option of the listbox "Commands"', opts and opts[0].startswith('Bulleted list') and box.get_attribute('aria-expanded') == 'true'
          and box.get_attribute('aria-activedescendant') == 'rk-so-0', opts[:3])
    page.keyboard.press('Enter'); settle(page, 200)
    check('Enter runs it where the caret was: the paragraph is a list item, and the caret is back on the page', '\\begin{itemize}\n  \\item Third paragraph here.\n\\end{itemize}' in src(page) and page.evaluate('document.activeElement.id') == 'pages'
          and lb.is_hidden(), src(page)[60:200])
    page.keyboard.press('Control+z'); settle(page, 120)
    click_text(page, 'Opening', 3)
    box.click(); box.fill('footnote'); settle(page, 150)
    off = page.evaluate('document.querySelector("#rk-search-list [role=option]").getAttribute("aria-disabled")')
    page.keyboard.press('Enter'); settle(page, 200)
    check('a command that cannot run where the caret is (a footnote in a heading) shows faded, and picked it says so and changes nothing', off == 'true' and src(page) == DOC and 'Footnote does not apply here.' in page.inner_text('#toast'), page.inner_text('#toast'))
    box.click(); box.fill('heading 2'); page.keyboard.press('ArrowDown'); page.keyboard.press('ArrowUp'); settle(page, 100)
    first = page.evaluate('document.getElementById("rk-so-0").getAttribute("aria-selected")')
    page.keyboard.press('Escape'); settle(page, 80)
    v = box.input_value()
    page.keyboard.press('Escape'); settle(page, 80)
    check('the arrows move in the list; Escape empties the box, a second Escape goes back to the page', first == 'true' and v == '' and page.evaluate('document.activeElement.id') == 'pages', (first, v))
    box.click(); box.fill('zzzz'); settle(page, 120)
    check('a word that names nothing says so', 'No command by that name' in page.inner_text('#rk-search-list'))
    page.keyboard.press('Escape'); page.keyboard.press('Escape')


def context_menu(page):
    load_doc(page, DOC)
    select_text(page, 'Second paragraph')
    r = page.evaluate('''() => { const s = [...document.querySelectorAll('#pages span.t')].find((x) => x.textContent.includes('Second')); const b = s.getBoundingClientRect(); return [b.left + 10, b.top + b.height / 2]; }''')
    page.mouse.click(r[0], r[1], button='right'); settle(page, 200)
    menu = page.get_by_role('menu', name='Context menu', exact=True)
    items = [menu.get_by_role('menuitem').nth(k).get_attribute('aria-label') for k in range(menu.get_by_role('menuitem').count())]
    # (B11: Paste after Copy, as in Word's menu)
    # (Show in source with Show LaTeX and Next tab stop at the menu's end since PR 90's review)
    check('a right click on selected words opens Rikuy\'s menu "Context menu": Cut, Copy, Paste, Bold, Italic, New comment, Font Settings, Paragraph Settings, ..., Show in source near its end', items[:8] == ['Cut', 'Copy', 'Paste', 'Bold', 'Italic', 'New comment', 'Font Settings', 'Paragraph Settings'] and 'Show in source' in items[-4:], items)
    menu.get_by_role('menuitem', name='Bold', exact=True).click(); settle(page, 200)
    check('its Bold makes them bold, and the caret is back on the page', '\\textbf{Second paragraph} here.' in src(page) and page.evaluate('document.activeElement.id') == 'pages', src(page)[60:140])
    page.keyboard.press('Control+z'); settle(page, 120)
    # in a table: its own items first
    load_doc(page, TABLE)
    r = page.evaluate('''() => { const s = [...document.querySelectorAll('#pages span.t')].find((x) => x.textContent.includes('cell')); const b = s.getBoundingClientRect(); return [b.left + 3, b.top + b.height / 2]; }''')
    # (the page swallows a right click that comes within 400 ms of its menu's last opening: a guard
    # for the contextmenu the menu key sends after Shift+F10 or that key opened it (src/ui/menu.js,
    # ctxT), set as well when a right click opened it. A bug, reported: a person who picks Bold and
    # right clicks again at once gets no menu. The steps before once slept 520 ms; the guard's end
    # is waited for here, at most 400 ms, so this check tests the table's items, its subject)
    until(page, '() => Date.now() - (window.rikuy.ctxT || 0) >= 400', timeout=1000)
    page.mouse.click(r[0], r[1], button='right'); settle(page, 200)
    first = page.get_by_role('menu', name='Context menu', exact=True).get_by_role('menuitem').first.get_attribute('aria-label')
    check('in a table cell the table\'s items come first (Insert below)', first == 'Insert below', first)
    # a second right click is the browser's, as is one with Shift
    page.evaluate('''() => { window.__ctx = []; document.addEventListener('contextmenu', (e) => setTimeout(() => window.__ctx.push(e.defaultPrevented), 0)); }''')
    # (on the page: where the menu, taller than the room below the press, covers the place pressed, a
    # word of the page beside it)
    r = page.evaluate('''(r) => { const on = (x, y) => { const e = document.elementFromPoint(x, y); return e && document.getElementById('pages').contains(e); };
      if (on(r[0], r[1])) return r; for (const s of document.querySelectorAll('#pages span.t')) { const b = s.getBoundingClientRect(); if (b.width && on(b.left + 3, b.top + b.height / 2)) return [b.left + 3, b.top + b.height / 2]; } return r; }''', r)
    page.mouse.click(r[0], r[1], button='right'); settle(page, 150)
    page.keyboard.press('Escape')
    page.keyboard.down('Shift'); page.mouse.click(r[0], r[1], button='right'); page.keyboard.up('Shift'); settle(page, 150)
    page.keyboard.press('Escape')
    check('a second right click, and one with Shift, give the browser\'s own menu (its spelling suggestions)', page.evaluate('window.__ctx') == [False, False] and page.get_by_role('menu').count() == 0, page.evaluate('window.__ctx'))
    click_text(page, 'After it', 2)
    page.keyboard.press('Shift+F10'); settle(page, 200)
    m = page.get_by_role('menu', name='Context menu', exact=True)
    foc = page.evaluate('document.activeElement.getAttribute("role")')
    page.keyboard.press('Escape'); settle(page, 120)
    check('Shift+F10 opens it at the caret with the focus on its first item; Escape closes it and the caret is back', m.count() == 0 and foc == 'menuitem' and page.evaluate('document.activeElement.id') == 'pages', foc)


def kit(page):
    load_doc(page, DOC); click_text(page, 'Second paragraph', 3)
    # the colour picker: a menu of swatches, each named by its colour
    page.evaluate('''() => { const k = window.rikuy.kit, b = document.getElementById('rb-b'); k.colorPicker(window.rikuy, b, { label: 'Font Color', auto: 'Automatic', theme: [{ name: 'accent', hex: 'C00000' }, { name: 'x"><img src=x onerror=window.__hit=1>', hex: '"><b>' }], onPick: (v) => { window.__pick = v; } }); }''')
    m = page.get_by_role('menu', name='Font Color', exact=True)
    names = [m.get_by_role('menuitemradio').nth(k).get_attribute('aria-label') for k in range(5)]
    check('the colour picker is a menu "Font Color": Automatic, the document\'s own colours, Word\'s standard ones by their xcolor names, all of dvipsnames, More colors',
          m.get_by_role('menuitem', name='Automatic', exact=True).count() == 1 and names[:3] == ['accent', 'x"><img src=x onerror=window.__hit=1>', 'BrickRed'] and m.get_by_role('menuitemradio', name='ForestGreen', exact=True).count() == 1
          and m.get_by_role('menuitem', name='More colors', exact=True).count() == 1 and m.get_by_role('menuitemradio').count() > 80
          and len(set(m.get_by_role('menuitemradio').evaluate_all('(xs) => xs.map((x) => x.getAttribute("aria-label").toLowerCase())'))) == m.get_by_role('menuitemradio').count(), names)
    check('red and Red, which a screen reader says alike, are told apart by where they come from', m.get_by_role('menuitemradio', name='red', exact=True).count() == 1 and m.get_by_role('menuitemradio', name='Red (dvipsnames)', exact=True).count() == 1)
    check('a document\'s colour name and value stay text: no element made of them', page.evaluate('[window.__hit, document.querySelectorAll(".pop-colors img, .pop-colors b").length]') == [None, 0])
    m.get_by_role('menuitemradio', name='ForestGreen', exact=True).click(); settle(page, 100)
    check('a swatch picked gives its name, and the menu closes', page.evaluate('window.__pick') == {'name': 'ForestGreen'} and m.count() == 0)
    # the dialog shell
    page.evaluate('''() => { const p = window.rikuy.kit.dialog(window.rikuy, { title: 'Test dialog', anchor: document.getElementById('rb-b') }); p.append(document.createTextNode('Body')); window.rikuy.positionPop(); }''')
    d = page.get_by_role('dialog', name='Test dialog', exact=True)
    ok = d.count() == 1 and d.get_by_role('button', name='Close', exact=True).count() == 1 and d.get_attribute('aria-modal') is None
    page.keyboard.press('Escape'); settle(page, 100)
    check('the dialog shell: role dialog named by its title, a Close button, not modal; Escape closes it', ok and d.count() == 0)
    # the number field with units
    page.evaluate('''() => { const f = window.rikuy.kit.numberField({ id: 't-nf', name: 'Left margin', value: { value: 2.5, unit: 'cm' }, units: ['cm', 'mm', 'in', 'pt'], step: 0.5, min: 0, onChange: (v) => { window.__len = v; } });
      f.id = 't-nfbox'; document.getElementById('desk').prepend(f); }''')
    sb = page.get_by_role('spinbutton', name='Left margin', exact=True)
    sb.click(); page.keyboard.press('ArrowUp'); a = page.evaluate('window.__len')
    sb.fill('12pt'); page.keyboard.press('Enter'); b = page.evaluate('window.__len')
    page.get_by_role('combobox', name='Left margin unit', exact=True).select_option('mm'); c = page.evaluate('window.__len')
    sb.fill('-4'); page.keyboard.press('Enter'); d2 = page.evaluate('window.__len')
    check('the number field: a spinbutton with a unit list; the arrows step, a length typed in its unit is taken in it, another unit converts, the minimum holds',
          a == {'value': 3, 'unit': 'cm'} and b == {'value': 12, 'unit': 'pt'} and c == {'value': 4.218, 'unit': 'mm'} and d2 == {'value': 0, 'unit': 'mm'}, (a, b, c, d2))
    page.evaluate('document.getElementById("t-nfbox").remove()')
    # a split button: the command and its options
    page.evaluate('''() => { const b = document.createElement('button'); b.id = 't-split'; b.className = 'btn ghost'; b.textContent = 'Underline test'; b.setAttribute('aria-label', 'Underline test');
      b.onclick = () => { window.__main = 1; }; const s = window.rikuy.kit.splitButton(window.rikuy, b, 'Underline test', () => [{ name: 'Double', run: () => { window.__opt = 'Double'; } }, { name: 'Wave', run: () => {} }]);
      s.id = 't-splitbox'; document.querySelector('#rp-home .rb-grp[data-group="paragraph"]').append(s); }''')
    x = page.get_by_role('button', name='Underline test options', exact=True)
    x.click(); settle(page, 120)
    sm = page.get_by_role('menu', name='Underline test', exact=True)
    ok = sm.count() == 1 and x.get_attribute('aria-expanded') == 'true'
    sm.get_by_role('menuitem', name='Double', exact=True).click(); settle(page, 100)
    page.get_by_role('button', name='Underline test', exact=True).click()
    check('a split button: the command by its name, and an arrow "<name> options" whose menu runs a choice', ok and page.evaluate('[window.__opt, window.__main]') == ['Double', 1] and x.get_attribute('aria-expanded') == 'false')
    page.evaluate('document.getElementById("t-splitbox").remove()')
    # a gallery in a menu: a grid the arrows move in both ways
    page.evaluate('''() => window.rikuy.kit.openGallery(window.rikuy, document.getElementById('rb-b'), ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => ({ name: 'Tile ' + n, html: '<b>' + n + '</b>', run: () => { window.__tile = n; } })), { label: 'Test gallery', columns: 3 })''')
    settle(page, 100)
    seen = []
    for key in ('ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'):
        page.keyboard.press(key); seen.append(page.evaluate('document.activeElement.getAttribute("aria-label")'))
    page.keyboard.press('Enter'); settle(page, 100)
    check('a gallery: a menu of tiles in a grid; right, down, left and up move one tile or one row; Enter picks', seen == ['Tile b', 'Tile e', 'Tile d', 'Tile a'] and page.evaluate('window.__tile') == 'a', seen)


def round_trips(page):
    body = WRAP('Some plain words here.\n\nAnother paragraph.')
    roundtrip(page, body, 'plain words', 'bold', body.replace('plain words', '\\textbf{plain words}'),
              forms=[body.replace('plain words', '{\\bfseries plain words}'), body.replace('plain words', '{\\bf plain words}')], label='Bold')
    roundtrip(page, body, 'plain words', 'italic', body.replace('plain words', '\\emph{plain words}'),
              forms=[body.replace('plain words', '\\textit{plain words}'), body.replace('plain words', '{\\itshape plain words}')], label='Italic')
    # (Underline writes ulem's \uline, which breaks across lines, and loads ulem; \underline by hand still comes off)
    ul = body.replace('\\begin{document}', '\\usepackage[normalem]{ulem}\n\\begin{document}')
    roundtrip(page, body, 'plain words', 'underline', ul.replace('plain words', '\\uline{plain words}'), forms=[ul.replace('plain words', '\\underline{plain words}')], off=ul, label='Underline')
    roundtrip(page, body, ('Another', 3), 'style-heading1', body.replace('Another paragraph.', '\\section{Another paragraph.}'), off_command='style-normal', label='Heading 1')
    roundtrip(page, body, ('Another', 3), 'numbering', body.replace('Another paragraph.', '\\begin{enumerate}\n  \\item Another paragraph.\n\\end{enumerate}'), label='Numbered list')


def kept_braces(page):
    # Bold off keeps what the braces do for the words around them (the reviewer's cases)
    for body, sel, want in [
            ('\\noindent{\\bf Proof.} The rest of it.', 'Proof.', '\\noindent{Proof.} The rest of it.'),
            ('Look: \\textcolor{red}{\\bf warning text} here.', 'warning text', 'Look: \\textcolor{red}{warning text} here.'),
            ('\\noindent\\textbf{Proof.} The rest of it.', 'Proof.', '\\noindent Proof. The rest of it.'),
            ('{\\bf\\large Title words} and more.', 'Title words', '{\\large Title words} and more.'),
            ('Some {\\bf plain words} here.', 'plain words', 'Some plain words here.')]:
        doc = WRAP(body, '\\usepackage{xcolor}\n')
        load_doc(page, doc); place(page, sel)
        on = pressed(page, 'bold')
        page.evaluate("window.rikuy.runCommand('bold')"); settle(page, 200)
        got = src(page)
        page.evaluate('window.rikuy.undo()'); settle(page, 150)
        check('Bold off on "' + body + '" writes "' + want + '", one undo gives it back', on is True and got == WRAP(want, '\\usepackage{xcolor}\n') and src(page) == doc, (on, got[-80:]))


def review_fixes(page):
    load_doc(page, DOC); click_text(page, 'Second paragraph', 3)
    # the ribbon folded stays folded: after a reload, and after a tab was pressed to look in it
    page.keyboard.press('Control+F1'); settle(page, 200)
    page.reload()
    page.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=20000)
    # (the page is the test's once rikuy.ready has settled, as open_page waits: the project read
    # back from storage comes after the boot screen hides, and would replace load_doc's)
    ready(page)
    settle(page, 300)
    a = page.evaluate('[document.body.classList.contains("rb-collapsed"), !!document.getElementById("ribbon").offsetParent, document.getElementById("rb-collapse").getAttribute("aria-pressed")]')
    load_doc(page, DOC)
    page.get_by_role('tab', name='Insert', exact=True).click(); settle(page, 200)
    b = page.evaluate('[!!document.getElementById("ribbon").offsetParent, document.querySelector("#rb-tabs [aria-selected=true]").textContent, JSON.parse(localStorage.getItem("galley.prefs.v1") || localStorage.getItem("rikuy.prefs") || "{}").ribbon]')
    click_text(page, 'Second paragraph', 3)
    page.mouse.click(*page.evaluate('() => { const s = [...document.querySelectorAll("#pages span.t")].find((x) => x.textContent.includes("Second")); const r = s.getBoundingClientRect(); return [r.left + 5, r.top + r.height / 2]; }')); settle(page, 200)
    c = page.evaluate('[document.body.classList.contains("rb-collapsed"), !!document.getElementById("ribbon").offsetParent]')
    check('Ctrl+F1\'s folded ribbon is folded after a reload; a tab pressed shows it for a moment, and a press on the page folds it again (Word\'s "Show tabs only")',
          a == [True, False, 'true'] and b[:2] == [True, 'Insert'] and c == [True, False], (a, b, c))
    box = page.get_by_role('combobox', name='Search', exact=True)
    box.click(); page.keyboard.press('Control+F1'); settle(page, 200)
    d = page.evaluate('[document.body.classList.contains("rb-collapsed"), document.activeElement.id]')
    check('Ctrl+F1 acts with the focus in a field too (the search box), which keeps the focus', d == [False, 'rk-search'], d)
    page.keyboard.press('Escape')
    open_tab(page, 'Home')
    page.set_viewport_size({'width': 390, 'height': 800}); settle(page, 300, full=True)
    click_text(page, 'Second paragraph', 3)
    page.keyboard.press('Control+F1'); settle(page, 200)
    e = page.evaluate('document.body.classList.contains("rb-collapsed")')
    page.set_viewport_size({'width': 1400, 'height': 1000}); settle(page, 300, full=True)
    check('below 861 px Ctrl+F1 keeps no setting that would fold the wide ribbon later', e is False and page.evaluate('!!document.getElementById("ribbon").offsetParent'))
    # the row of tabs, 28 px
    hh = page.evaluate('document.getElementById("rb-top").getBoundingClientRect().height')
    check('the row of tabs is 28 px high', hh == 28, hh)
    # groups are named groups for a screen reader
    load_doc(page, DOC); click_text(page, 'Second paragraph', 3)
    panel = page.get_by_role('tabpanel', name='Home', exact=True)
    check('Home\'s groups are groups named Font, Paragraph and Insert', all(panel.get_by_role('group', name=g, exact=True).count() == 1 for g in ('Font', 'Paragraph', 'Insert')),
          [panel.get_by_role('group', name=g, exact=True).count() for g in ('Font', 'Paragraph', 'Insert')])
    # the quiet chords of before the registry
    load_doc(page, DOC); select_text(page, 'Second paragraph')
    page.keyboard.press('Control+Shift+B'); settle(page, 200)
    check('Ctrl+Shift+B still bolds (as before the registry; it is not said anywhere)', '\\textbf{Second paragraph}' in src(page), src(page)[60:160])
    # the search box with no place on the page writes nothing and says why
    load_doc(page, DOC)
    page.evaluate('() => { document.activeElement && document.activeElement.blur(); getSelection().removeAllRanges(); }')
    box.click(); box.fill('bold'); settle(page, 150); page.keyboard.press('Enter'); settle(page, 200)
    check('the search box with no caret on the page writes nothing (not into the title) and asks for a click in the text', src(page) == DOC and 'Click in the text of the page first' in page.inner_text('#toast'), (src(page)[40:120], page.inner_text('#toast')))
    # the right click menu: Ask Claude only inside Claude; Shift+F10 again is the browser's
    load_doc(page, DOC); select_text(page, 'Second paragraph')
    page.keyboard.press('Shift+F10'); settle(page, 200)
    m = page.get_by_role('menu', name='Context menu', exact=True)
    names = m.get_by_role('menuitem').evaluate_all('(xs) => xs.map((x) => x.getAttribute("aria-label"))')
    page.evaluate("() => { window.__ctx = []; document.addEventListener('contextmenu', (e) => setTimeout(() => window.__ctx.push(e.defaultPrevented), 0)); }")
    page.keyboard.press('Shift+F10'); settle(page, 200)
    f = [m.count(), page.evaluate('document.activeElement.id'), page.evaluate('window.__ctx')]
    check('outside Claude the menu has no Ask Claude', 'Ask Claude' not in names, names)
    check('Shift+F10 again while it is open closes it, the focus on the page, and lets the browser\'s menu come', f[0] == 0 and f[1] == 'pages' and f[2] == [False], f)
    page.evaluate("() => window.rikuy.closePop && window.rikuy.closePop(true)")
    # a long press on a touch screen keeps the system's menu
    r = page.evaluate('() => { const s = [...document.querySelectorAll("#pages span.t")].find((x) => x.textContent.includes("Third")); const b = s.getBoundingClientRect(); return [b.left + 10, b.top + b.height / 2]; }')
    t = page.evaluate("""([x, y]) => { const el = document.elementFromPoint(x, y); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: x, clientY: y }));
        const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }); el.dispatchEvent(e); return [e.defaultPrevented, !!document.querySelector('.pop-ctx')]; }""", r)
    check('a long press on a touch screen gives the system\'s menu, not Rikuy\'s', t == [False, False], t)
    # the combobox of tabs on a phone: a contextual tab\'s option goes with its tab
    load_doc(page, TABLE)
    page.set_viewport_size({'width': 390, 'height': 800}); settle(page, 300, full=True)
    click_text(page, 'cell', 2); settle(page, 250)
    inside = page.evaluate('[...document.getElementById("rb-tabsel").options].filter((o) => !o.hidden && !o.disabled).map((o) => o.textContent)')
    click_text(page, 'After it', 2); settle(page, 250)
    out = page.evaluate('[...document.getElementById("rb-tabsel").options].filter((o) => !o.hidden && !o.disabled).map((o) => o.textContent)')
    check('on a phone "Ribbon tab" offers Table Layout in a table and not after it', 'Table Layout' in inside and 'Table Layout' not in out, (inside, out))
    # View, Page width on a phone: the whole sheet, every press the same
    page.evaluate("() => { window.rikuy.runCommand('page-width'); }"); settle(page, 150)
    z1 = page.evaluate('[window.rikuy.prefs.zoom, window.rikuy.prefs.phone, window.rikuy.textFit]')
    page.evaluate("() => { window.rikuy.runCommand('page-width'); }"); settle(page, 150)
    z2 = page.evaluate('[window.rikuy.prefs.zoom, window.rikuy.prefs.phone, window.rikuy.textFit]')
    check('on a phone View\'s Page width shows the whole sheet, and a second press keeps it', z1 == ['fit', 'sheet', False] and z2 == z1, (z1, z2))
    page.set_viewport_size({'width': 860, 'height': 900}); settle(page, 300, full=True)
    load_doc(page, DOC); click_text(page, 'Second paragraph', 3)
    page.get_by_role('combobox', name='Ribbon tab', exact=True).select_option(label='Home'); settle(page, 200)
    w = page.evaluate("""() => { const p = document.querySelector('#ribbon [role=tabpanel]:not([hidden]) [role=toolbar]'); const out = [...p.querySelectorAll('button')].filter((b) => b.offsetParent && b.getBoundingClientRect().right > innerWidth + 1).map((b) => b.getAttribute('aria-label') || b.textContent);
        return [out, p.scrollWidth <= p.clientWidth + 1]; }""")
    check('at 860 px every control of Home is on the screen (Footnote, Citation, Link no longer scroll off)', w == [[], True], w)
    page.set_viewport_size({'width': 1400, 'height': 1000}); settle(page, 300, full=True)



# What a laid out tab shows at a width, for each group: its controls' sizes and heights, whether
# its name is whole, and the ribbon's height (a tab as tall as Home)
LAID = """(tab) => { const app = window.rikuy, rb = document.getElementById('ribbon');
  app.rbTab = tab;
  for (const p of rb.querySelectorAll('.rb-panel')) p.hidden = p.dataset.tab !== tab;
  const P = document.getElementById('rp-' + tab);
  P.querySelector('.rb-tb').append(document.querySelector('.rb-dl'));
  app.ribbonFit(); rb.scrollLeft = 0;
  const out = { h: Math.round(rb.getBoundingClientRect().height), groups: [] };
  for (const g of P.querySelectorAll('.rb-grp.lay')) {
    const lab = g.querySelector('.rb-glab'), gb = g.getBoundingClientRect(), lb = lab.getBoundingClientRect();
    const items = [...g.children].filter((x) => x.dataset.size).map((x) => { const b = x.getBoundingClientRect(); return [x.dataset.size, Math.round(b.height), Math.round(b.top - gb.top)]; });
    out.groups.push({ id: g.dataset.group, cls: g.className, items, whole: lab.scrollWidth <= lab.clientWidth + 1 && lb.left >= gb.left - 1 && lb.right <= gb.right + 1 });
  }
  app.rbTab = null; app.selectTab('home');
  return out; }"""


def word_layout(page):
    """Word's layout of the tabs other than Home (src/ribbon/layout.js): at 1920 px every group
    open with its large buttons the icon over the name and its small ones three to a column, every
    group's name whole under it, every tab as tall as Home; narrower, a group gives way one step at
    a time (its large buttons small, then its names) before any group folds; the KeyTips of a tab's
    controls after its own (Alt, a tab's letter, the control's letters), and Escape back."""
    load_doc(page, DOC); click_text(page, 'Second paragraph', 3)
    page.set_viewport_size({'width': 1920, 'height': 900}); settle(page, 300, full=True)
    tabs = page.evaluate('rikuy.rbTabs')
    home = page.evaluate("Math.round(document.getElementById('ribbon').getBoundingClientRect().height)")
    seen = {t: page.evaluate(LAID, t) for t in tabs if t not in ('home', 'file')}
    bad = {t: [(g['id'], g['cls']) for g in v['groups'] if 'folded' in g['cls'] or ' sm' in g['cls'] or ' nm' in g['cls']] for t, v in seen.items()}
    check('at 1920 px every laid out group of the %d other tabs is open, its buttons as Word draws them on a wide window' % len(seen), not any(bad.values()) and all(v['groups'] for v in seen.values()), bad)
    big = [(t, g['id'], i) for t, v in seen.items() for g in v['groups'] for i in g['items'] if i[0] == 'L' and not (70 <= i[1] <= 72 and i[2] <= 6)]
    small = [(t, g['id'], i) for t, v in seen.items() for g in v['groups'] for i in g['items'] if i[0] in 'SI' and not (20 <= i[1] <= 24)]
    check('large buttons are the height of three small ones, from the group\'s top; small ones and icons 20 to 24 px, three to a column', not big and not small, (big[:4], small[:4]))
    cut = [(t, g['id']) for t, v in seen.items() for g in v['groups'] if not g['whole']]
    check('every group\'s name is whole under it (the group is at least as wide as its name)', not cut, cut)
    hs = {t: v['h'] for t, v in seen.items()}
    page.set_viewport_size({'width': 880, 'height': 900}); settle(page, 300, full=True)
    h880 = {t: page.evaluate(LAID, t)['h'] for t in tabs if t != 'file'}
    page.set_viewport_size({'width': 1920, 'height': 900}); settle(page, 300, full=True)
    check('every tab is as tall as Home (%d px), and at 880 px too: the page does not jump when a tab opens' % home, all(h == home for h in hs.values()) and len(set(h880.values())) == 1, (home, hs, h880))
    # a large button's name over two lines, as Word breaks it; a menu's arrow after the name
    page.evaluate("rikuy.selectTab('references')"); settle(page, 150)
    toc = page.evaluate("[...document.querySelectorAll('#rc-table-of-contents-x .rb-ln')].map((x) => [x.textContent, Math.round(x.getBoundingClientRect().top)])")
    icon = page.evaluate("[document.querySelector('#rc-table-of-contents svg').getBoundingClientRect().top, document.querySelector('#rp-references [data-cmd=footnote] svg').getBoundingClientRect().top]")
    check('References: Table of Contents as Word\'s large split button, its icon as high as Footnote\'s, "Table of" above "Contents" in the part that opens its menu; its accessible name whole',
          [x[0] for x in toc] == ['Table of', 'Contents'] and toc[1][1] > toc[0][1] and abs(icon[0] - icon[1]) < 1 and page.get_by_role('button', name='Table of Contents', exact=True).count() == 1, (toc, icon))
    # Word's check boxes, still buttons with their state
    page.evaluate("rikuy.selectTab('view')"); settle(page, 150)
    box = page.evaluate("(() => { const b = document.getElementById('rw-ruler') || document.querySelector('#rp-view [data-cmd=ruler]'); const s = getComputedStyle(b, '::before'); return [b.getAttribute('aria-pressed') !== null, s.width, getComputedStyle(b.querySelector('svg')).display]; })()")
    check('View › Show: Ruler drawn as Word\'s check box, a toggle button still', box[0] and box[1] == '13px' and box[2] == 'none', box)
    # the arrows in the grid: down a column, across a row
    page.evaluate("rikuy.selectTab('review')"); settle(page, 150)
    page.focus('#rc-thesaurus' if page.locator('#rc-thesaurus').count() else '[data-cmd=thesaurus]')
    ids = []
    for k in ('ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'ArrowLeft'):
        page.keyboard.press(k); settle(page, 60)
        ids.append(page.evaluate('document.activeElement.dataset.cmd'))
    check('in Word\'s grid the arrows move as the eye does: Thesaurus, down to Word Count, up again, right to Read Aloud (the next group), left to Thesaurus, left to Spelling', ids == ['word-count', 'thesaurus', 'read-aloud', 'thesaurus', 'spelling'], ids)
    page.keyboard.press('Escape'); settle(page, 100)
    # a pressed toggle in a forced colour scheme (Windows' contrast themes)
    page.evaluate("rikuy.selectTab('view')"); settle(page, 150)
    page.emulate_media(forced_colors='active'); settle(page, 150)
    fc = page.evaluate("[...document.querySelectorAll('#rp-view [data-cmd=print-layout], #rp-view [data-cmd=draft]')].map((b) => [b.getAttribute('aria-pressed'), getComputedStyle(b).backgroundColor])")
    page.emulate_media(forced_colors='none'); settle(page, 100)
    check('in a forced colour scheme a pressed toggle (Print Layout) is drawn in the highlight, one not pressed (Draft) is not', len(fc) == 2 and fc[0][0] == 'true' and fc[1][0] == 'false' and fc[0][1] != fc[1][1], fc)
    # narrower: the steps before any group folds
    page.set_viewport_size({'width': 1100, 'height': 900}); settle(page, 300, full=True)
    r = page.evaluate(LAID, 'review')
    check('at 1100 px Review gives way group by group (some small, some without names) and folds none', not any('folded' in g['cls'] for g in r['groups']) and any(' sm' in g['cls'] or ' nm' in g['cls'] for g in r['groups']) and all(g['whole'] for g in r['groups']), [(g['id'], g['cls']) for g in r['groups']])
    page.set_viewport_size({'width': 1920, 'height': 900}); settle(page, 300, full=True)
    # KeyTips: Alt, then N for Insert, then its controls' letters
    click_text(page, 'Second paragraph', 3)
    page.keyboard.press('Alt'); settle(page, 100)
    t1 = page.evaluate("document.body.classList.contains('keytips')")
    page.keyboard.press('n'); settle(page, 200)
    kts = page.evaluate("[...document.querySelectorAll('.rb-kt')].map((x) => x.textContent)")
    check('Alt shows the tabs\' letters; N opens Insert and shows its controls\' (Table T, Shapes SH, Header H)', t1 and page.evaluate("rikuy.rbTab") == 'insert' and all(k in kts for k in ('T', 'SH', 'H', 'NP')) and not page.evaluate("document.body.classList.contains('keytips')"), kts)
    page.keyboard.press('s'); settle(page, 100)
    left = page.evaluate("[...document.querySelectorAll('.rb-kt')].map((x) => x.textContent)")
    page.keyboard.press('h'); settle(page, 250)
    m = page.get_by_role('menu', name='Shapes', exact=True)
    check('S leaves the letters that start with S; then H opens Shapes\' menu, the letters gone', sorted(left) == ['SC', 'SH'] and m.count() == 1 and not page.evaluate("document.querySelectorAll('.rb-kt').length"), (left, m.count()))
    page.keyboard.press('Escape'); settle(page, 150)
    click_text(page, 'Second paragraph', 3)
    page.keyboard.press('Alt'); page.keyboard.press('p'); settle(page, 200)
    page.keyboard.press('i'); page.keyboard.press('l'); settle(page, 150)
    check('Alt, P, I, L: the focus in Layout\'s Indent Left field', page.evaluate('document.activeElement.id') == 'rl-indent-left', page.evaluate('document.activeElement.id'))
    page.keyboard.press('Escape'); settle(page, 100)
    click_text(page, 'Second paragraph', 3)
    page.keyboard.press('Alt'); page.keyboard.press('w'); settle(page, 200)
    page.keyboard.press('Escape'); settle(page, 100)
    back = page.evaluate("[document.body.classList.contains('keytips'), document.querySelectorAll('.rb-kt').length]")
    page.keyboard.press('Escape'); settle(page, 100)
    off = page.evaluate("[document.body.classList.contains('keytips'), document.querySelectorAll('.rb-kt').length, document.activeElement.id]")
    check('Escape goes back from a tab\'s letters to the tabs\' letters, and again away, the caret on the page', back == [True, 0] and off == [False, 0, 'pages'], (back, off))
    # a folded group's letters: Z and a letter of its name
    page.set_viewport_size({'width': 1000, 'height': 900}); settle(page, 300, full=True)
    click_text(page, 'Second paragraph', 3)
    page.keyboard.press('Alt'); page.keyboard.press('h'); settle(page, 200)
    z = page.evaluate("[...document.querySelectorAll('.rb-kt')].map((x) => x.textContent).filter((k) => k[0] === 'Z')")
    page.keyboard.press('z'); page.keyboard.press('i'); settle(page, 250)
    check('Home at 1000 px: its folded Insert has ZI, which opens its menu', 'ZI' in z and page.get_by_role('menu', name='Insert', exact=True).count() == 1, z)
    page.keyboard.press('Escape'); settle(page, 150)
    page.set_viewport_size({'width': 1920, 'height': 900}); settle(page, 300, full=True)
    # a contextual tab's letters: J then its letter, while it shows
    load_doc(page, TABLE); click_text(page, 'A paragraph', 2); settle(page, 200)
    page.keyboard.press('Alt'); settle(page, 100)
    before = page.evaluate("[...document.querySelectorAll('#rb-tabs .rb-ktip')].filter((b) => b.offsetParent).map((b) => b.dataset.k)")
    page.keyboard.press('Escape'); settle(page, 100)
    click_text(page, 'cell', 2); settle(page, 250)
    page.keyboard.press('Alt'); settle(page, 100)
    shown = page.evaluate("[...document.querySelectorAll('#rb-tabs .rb-ktip')].filter((b) => b.offsetParent).map((b) => b.dataset.k)")
    page.keyboard.press('j'); settle(page, 100)
    left = page.evaluate("[...document.querySelectorAll('#rb-tabs .rb-ktip')].filter((b) => b.offsetParent).map((b) => b.dataset.k)")
    page.keyboard.press('l'); settle(page, 250)
    kts = page.evaluate("[...document.querySelectorAll('.rb-kt')].map((x) => x.textContent)")
    check('the contextual tabs\' letters, as Word\'s: JT and JL with the caret in a table (none out of it); J leaves those two; L opens Table Layout and shows its controls\' letters (Delete D, Insert below BE)',
          'JT' not in before and 'JT' in shown and 'JL' in shown and sorted(left) == ['JL', 'JT'] and page.evaluate('rikuy.rbTab') == 'table-layout' and 'D' in kts and 'BE' in kts, (before, shown, left, kts))
    page.keyboard.press('Escape'); page.keyboard.press('Escape'); settle(page, 100)
    # the keys the letters take go nowhere else: Escape keeps a selected picture selected
    load_doc(page, PICDOC); settle(page, 200); page.locator('#pages .a-img').click(); settle(page, 200)
    armed = page.evaluate('!!(rikuy.armed && rikuy.armed.kind === "img")')
    page.keyboard.press('Alt'); settle(page, 100); page.keyboard.press('Escape'); settle(page, 150)
    check('Escape that puts the letters away does not let go of a selected picture', armed and page.evaluate('!!(rikuy.armed && rikuy.armed.kind === "img")') and not page.evaluate("document.body.classList.contains('keytips')"))
    page.evaluate('rikuy.disarm()')
    page.set_viewport_size({'width': 1400, 'height': 1000}); settle(page, 300, full=True)
    load_doc(page, DOC)
    open_tab(page, 'Home')


# The three downloads where they show: their boxes and the group's name
DL = """() => { const r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
  const bs = ['rb-pdf', 'rb-word', 'b-save'].map((id) => document.getElementById(id)).filter((b) => b.offsetParent);
  const lab = document.querySelector('.rb-dl > .rb-lab'), rb = document.getElementById('ribbon').getBoundingClientRect();
  // (each icon as it is written, on its 20 grid: src/ui/icongrid.js draws it on its pixels' grid)
  const src = (svg) => svg.dataset.gm || svg.innerHTML;
  return { b: bs.map(r), lab: lab.offsetParent ? [r(lab), lab.textContent] : null, top: Math.round(rb.top), icons: bs.map((b) => src(b.querySelector('svg'))), preview: src(document.querySelector('#b-pdf svg')) }; }"""


def downloads_group(p):
    """From 900 px with a mouse the downloads are a group as Word draws one: PDF, Word and LaTeX one
    under another in the three rows of the laid out groups, each its own icon, the group's name
    Download under them, on Home and every other tab; a touch screen keeps its row."""
    browser, page, errors = open_page(p, width=1920, height=900)
    load_doc(page, DOC); click_text(page, 'Second paragraph', 3)
    bad = {}
    for w in (1920, 1366):
        page.set_viewport_size({'width': w, 'height': 900}); settle(page, 300, full=True)
        for t in ('home', 'insert', 'review', 'view', 'help'):
            page.evaluate('(t) => rikuy.selectTab(t)', t); settle(page, 150)
            d = page.evaluate(DL)
            b = d['b']
            # (each its own icon with a download's arrow, none Preview's: review L4)
            ok = len(b) == 3 and len({x[0] for x in b}) == 1 and [x[1] - d['top'] for x in b] == [4, 28, 52] and all(x[3] == 24 for x in b) \
                and d['lab'] and d['lab'][1] == 'Download' and d['lab'][0][1] >= b[2][1] + 24 and len(set(d['icons'])) == 3 \
                and d['preview'] not in d['icons'] and all('L17 15' in i for i in d['icons'])
            if not ok: bad[(w, t)] = d
    check('from 900 px with a mouse, on Home and the laid out tabs at 1920 and 1366 px: PDF, Word and LaTeX one under another in the grid\'s three rows, each its own icon, the group\'s name Download under them', not bad, str(bad)[:400])
    # one weight and size for every button's name, as Word's: Find, Replace and Select as PDF, Word
    # and LaTeX (a glyph drawn for an icon, Bold's B, keeps its own)
    page.evaluate("rikuy.selectTab('home')"); settle(page, 150)
    wts = page.evaluate("""() => { const out = {}; for (const x of document.querySelectorAll('#ribbon .rb-panel:not([hidden]) .btn:not(.icon) > span:not(.sr), #ribbon .rb-panel:not([hidden]) .btn > .rb-bl'))
      if (x.offsetParent && x.textContent.trim()) out[x.textContent.trim()] = getComputedStyle(x).fontWeight + ' ' + getComputedStyle(x).fontSize; return out; }""")
    check('Home at 1366 px: every button\'s name in one weight and size (%d names, Find and PDF among them)' % len(wts), len(set(wts.values())) == 1 and 'Find' in wts and 'PDF' in wts, wts)
    browser.close()
    browser, page, errors = open_page(p, width=1180, height=800, touch=True)
    d = page.evaluate(DL)
    check('a touch screen at 1180 px keeps the downloads in a row', len(d['b']) in (0, 3) and (not d['b'] or len({x[1] for x in d['b']}) == 1), d)
    browser.close()


NOCARET = WRAP('\\section{Opening}\nAlpha beta gamma.\n\n\\begin{tabular}{ll}\ncell & other \\\\\nmore & last \\\\\n\\end{tabular}\n\nThe last paragraph.')
AFTER = "(([w, k]) => { const s = [...document.querySelectorAll('#pages span.t')].find((x) => x.textContent.includes(w)); const r = document.createRange(); r.setStart(s.firstChild, s.textContent.indexOf(w) + k); r.collapse(true); const b = r.getBoundingClientRect(); return [b.left, b.top + b.height / 2]; })"


def no_caret(p):
    """With no caret on the page (a press on the status bar's words, the source pane, an agent), the
    ribbon stands for the document's last selection, as Word's: both its ends, moved with every edit
    since (the source pane's typing, setSource), gone with the document (a new one: its end); a
    selection stays a selection; reading it moves no selection, so an idle page refreshes nothing.
    (Review of PR 86, H1, H2, M1: each of these failed before.)"""
    browser, page, errors = open_page(p, width=1366, height=900)
    out = lambda: page.mouse.click(*page.evaluate("(() => { const b = document.getElementById('st-save').getBoundingClientRect(); return [b.left + 4, b.top + b.height / 2]; })()"))
    # H1: the caret after "The " in the last paragraph; 29 characters typed in the source pane
    # before the table; a press outside the page: the table's commands cannot run, Page break goes
    # after "The"
    load_doc(page, NOCARET); settle(page, 300)
    page.mouse.click(*page.evaluate(AFTER, ['The last', 4])); settle(page, 300)
    page.click('#b-src'); page.wait_for_function('() => window.rikuy.cm && document.body.classList.contains("src-on")'); settle(page, 600)
    page.evaluate("(() => { const cm = rikuy.cm, i = cm.getValue().indexOf('Alpha'); cm.focus(); cm.setCursor(cm.posFromIndex(i)); })()")
    # (the source pane's typing reaches the files after its pause, srcRebuild)
    page.keyboard.type('Twenty nine characters here. '); wait_src(page, 'Twenty nine characters here. '); settle(page, 800)
    out(); settle(page, 300)
    shown = [t for t in page.evaluate('rikuy.rbTabs') if not page.evaluate('(t) => document.getElementById("rt-" + t).hidden', t)]
    ran = page.evaluate("rikuy.api.run('table-row-below')")
    before = src(page)
    page.evaluate("rikuy.selectTab('insert')"); settle(page, 200)
    page.click('#rp-insert [data-cmd=page-break]'); settle(page, 300)
    after = src(page)
    check('no caret after an edit before the last place: no table tab, a table row refused, Page break at the place moved with the edit (after "The")', 'table-layout' not in shown and ran is False and 'The\n\\newpage\nlast paragraph.' in after and after.count('\\newpage') == 1, (shown, ran, after[after.find('tabular}'):][:80]))
    page.click('#b-src'); settle(page, 300)
    # M1: words selected, a press outside: Bold bolds them
    load_doc(page, NOCARET); settle(page, 300)
    select_text(page, 'beta'); settle(page, 200)
    out(); settle(page, 300)
    page.evaluate("rikuy.selectTab('home')"); settle(page, 150)
    page.click('#rp-home [data-cmd=bold]'); settle(page, 300)
    check('words selected, then a press outside the page: Bold bolds those words (the selection kept, both ends)', 'Alpha \\textbf{beta} gamma.' in src(page), src(page)[40:110])
    # and a caret between words with no caret on the page: Bold writes nothing (no typing to format)
    load_doc(page, NOCARET); settle(page, 300)
    page.mouse.click(*page.evaluate(AFTER, ['The last', 3])); settle(page, 200)
    out(); settle(page, 300)
    b0 = src(page); r = page.evaluate("rikuy.api.run('bold')")
    check('a place between words with no caret on the page: Bold writes nothing', r is False and src(page) == b0, (r, src(page)[-60:]))
    # H1, an agent: setSource with words before the place moves it; a new document's text put in
    # its place: its end
    load_doc(page, NOCARET); settle(page, 300)
    page.mouse.click(*page.evaluate(AFTER, ['The last', 4])); settle(page, 300)
    page.evaluate('(t) => rikuy.api.setSource(t)', src(page).replace('Alpha beta gamma.', 'Alpha beta gamma, with forty more characters of new text.')); settle(page, 300)
    page.evaluate('() => { getSelection().removeAllRanges(); document.activeElement && document.activeElement.blur && document.activeElement.blur(); }'); settle(page, 200)
    page.evaluate("rikuy.api.run('page-break')"); settle(page, 300)
    a1 = src(page)
    page.evaluate('(t) => rikuy.api.setSource(t)', WRAP('A new document with other words in it.')); settle(page, 300)
    page.evaluate('() => { getSelection().removeAllRanges(); document.activeElement && document.activeElement.blur && document.activeElement.blur(); }'); settle(page, 200)
    page.evaluate("rikuy.api.run('page-break')"); settle(page, 300)
    a2 = src(page)
    check('setSource with words before the place: Page break at the place moved with them; a new document set: at its end', 'The\n\\newpage\nlast paragraph.' in a1 and 'in it.\n\\newpage\n\\end{document}' in a2, (a1[-60:], a2[-60:]))
    # N1 of the verification: the caret's paragraph taken away by setSource leaves the page with the
    # focus and no selection; a command acts at the document's end, as llms.txt says
    load_doc(page, NOCARET); settle(page, 300)
    page.mouse.click(*page.evaluate(AFTER, ['The last', 4])); settle(page, 300)
    page.evaluate('(t) => rikuy.api.setSource(t)', src(page).replace('\n\nThe last paragraph.', '')); settle(page, 300)
    st = page.evaluate("[document.activeElement.id, getSelection().rangeCount]")
    r = page.evaluate("rikuy.api.run('page-break')"); settle(page, 300)
    end = src(page)
    # (the document's end: its last words that can be edited, here the paragraph before the table)
    check('the page with the focus and no selection (setSource took the caret\'s paragraph away): Page break runs, at the document\'s last words', r is True and 'gamma.\n\\newpage' in end and end.count('\\newpage') == 1, (st, r, end[end.find('Opening'):]))
    # H2: an idle page with no caret refreshes nothing
    load_doc(page, NOCARET); settle(page, 300)
    page.mouse.click(*page.evaluate(AFTER, ['The last', 4])); settle(page, 200)
    out(); settle(page, 500)
    page.evaluate("() => { window.__syncs = 0; const app = window.rikuy, f = app.ribbonSync; app.ribbonSync = function () { window.__syncs++; return f.apply(this, arguments); }; }")
    # (the time is what is under test: 3 s of an idle page)
    page.wait_for_timeout(3000)
    n = page.evaluate('window.__syncs')
    page.evaluate("() => { delete window.rikuy.ribbonSync; }")
    check('an idle page with no caret refreshes the ribbon no more: 3 s after a press outside the page, no refresh', n == 0, n)
    # a new document: the old one's place is gone
    page.evaluate('rikuy.newDocument()'); settle(page, 800)
    page.evaluate('() => { getSelection().removeAllRanges(); document.activeElement && document.activeElement.blur && document.activeElement.blur(); }'); settle(page, 200)
    r = page.evaluate("rikuy.api.run('page-break')"); settle(page, 300)
    check('a new document keeps no place of the one before: Page break with no caret goes into its body', page.evaluate('!rikuy.rbLast || rikuy.rbLast.files === rikuy.files') and '\\begin{document}' in src(page) and src(page).count('\\newpage') <= 1 and src(page).find('\\newpage') < src(page).find('\\end{document}'), (r, src(page)))
    check('no page errors (no_caret)', not errors, errors[:3])
    browser.close()


def frontier(p):
    """References › Research › Frontier, where Word has Researcher: a press opens a small popover
    (its title, one line, Coming soon., Close) by mouse, keys and tap; Esc and Close close it, the
    focus goes back to the button; no request leaves the page."""
    browser, page, errors = open_page(p, width=1366, height=900)
    load_doc(page, DOC); click_text(page, 'Second paragraph', 3)
    reqs = []
    page.on('request', lambda r: reqs.append(r.url))
    open_tab(page, 'References')
    page.get_by_role('button', name='Frontier', exact=True).click(); settle(page, 200)
    d = page.get_by_role('dialog', name='Frontier', exact=True)
    shown = d.count() == 1 and 'Coming soon.' in d.inner_text() and 'shows how its ideas connect' in d.inner_text()
    d.get_by_role('button', name='Close', exact=True).last.click(); settle(page, 200)
    check('Frontier by mouse: its popover opens (Frontier, what it does, Coming soon.) and Close closes it', shown and page.get_by_role('dialog', name='Frontier').count() == 0)
    page.focus('#rc-frontier'); page.keyboard.press('Enter'); settle(page, 200)
    k1 = page.get_by_role('dialog', name='Frontier').count() == 1 and page.evaluate('document.activeElement.textContent') == 'Close'
    page.keyboard.press('Escape'); settle(page, 200)
    # (Word: a dialog closed with Esc gives the document back, the caret where it was, src/app.js
    # closePop; ux.py dialogs_give_the_caret_back)
    check('Frontier by keys: Enter opens it with the focus on Close, Esc closes it and the caret is back on the page', k1 and page.get_by_role('dialog', name='Frontier').count() == 0 and page.evaluate('document.activeElement.id') == 'pages', page.evaluate('document.activeElement.id'))
    check('Frontier asks nothing of the network', not [u for u in reqs if not u.startswith('https://rikuy.test/')], reqs[:4])
    box = page.get_by_role('combobox', name='Search', exact=True)
    box.click(); box.fill('Researcher'); settle(page, 200)
    found = page.get_by_role('listbox', name='Commands', exact=True).get_by_role('option').all_inner_texts()
    page.keyboard.press('Escape'); settle(page, 100)
    check('the search box finds Frontier by Researcher', found and found[0].startswith('Frontier'), found[:3])
    # (review of PR 86, L1 to L3: each of these failed before)
    fb = page.locator('#rc-frontier')
    a0 = [fb.get_attribute('aria-haspopup'), fb.get_attribute('aria-expanded')]
    fb.click(); settle(page, 250)
    d = page.get_by_role('dialog', name='Frontier', exact=True)
    a1 = fb.get_attribute('aria-expanded')
    desc = page.evaluate("(() => { const p = document.querySelector('.pop-frontier'); return (p.getAttribute('aria-describedby') || '').split(' ').map((id) => (document.getElementById(id) || {}).textContent || '').join(' '); })()")
    ring = page.evaluate("(() => { const a = document.activeElement, s = getComputedStyle(a); return [a.textContent, s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0]; })()")
    look = page.evaluate("(() => { const p = document.querySelector('.pop-frontier'), b = p.querySelector('.pop-row .btn'), x = p.querySelector('.pop-x'); return [parseFloat(getComputedStyle(p).borderTopLeftRadius), Math.round(b.getBoundingClientRect().height), Math.round(x.getBoundingClientRect().height)]; })()")
    page.keyboard.press('Tab'); settle(page, 80)
    t1 = page.evaluate("document.activeElement.closest('.pop-frontier') ? document.activeElement.getAttribute('aria-label') || document.activeElement.textContent : document.activeElement.tagName")
    page.keyboard.press('Tab'); settle(page, 80)
    t2 = page.evaluate("document.activeElement.closest('.pop-frontier') ? document.activeElement.textContent : document.activeElement.tagName")
    d.locator('.pop-row .btn').click(); settle(page, 250)
    back = page.evaluate("(() => { const a = document.activeElement, s = getComputedStyle(a); return [a.id, s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0]; })()")
    check('Frontier says it opens a dialog and whether it is open; the dialog is described by what it does and Coming soon.', a0 == ['dialog', 'false'] and a1 == 'true' and fb.get_attribute('aria-expanded') == 'false' and 'Coming soon.' in desc and 'ideas connect' in desc, (a0, a1, desc))
    check('opened and closed with the mouse no ring shows, on Close or where the focus goes after (the keyboard\'s ring for the keyboard)', ring == ['Close', False] and back[1] is False, (ring, back))
    check('Tab goes round its two buttons while it is open; its corners 8 px, its buttons 32 px tall', t1 == 'Close' and t2 == 'Close' and look == [8, 32, 32], (t1, t2, look))
    browser.close()
    browser, page, errors = open_page(p, width=390, height=800, touch=True)
    load_doc(page, DOC)
    page.get_by_role('combobox', name='Ribbon tab', exact=True).select_option(label='References'); settle(page, 200)
    page.locator('#rc-frontier').tap(); settle(page, 250)
    d = page.get_by_role('dialog', name='Frontier', exact=True)
    t1 = d.count() == 1 and d.locator('.btn').bounding_box()['height'] >= 44
    d.get_by_role('button', name='Close', exact=True).last.tap(); settle(page, 250)
    check('Frontier by tap on a phone (390 px): the popover opens, its Close 44 px tall, a tap closes it', t1 and page.get_by_role('dialog', name='Frontier').count() == 0)
    browser.close()


def mac_keytips(p):
    """On a Mac, Option alone types nothing and shows no letters (it is how a Mac types é and ©, and
    Word for Mac has no KeyTips); F10 shows them."""
    browser, page, errors = open_page(p, init="Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' })")
    load_doc(page, DOC); click_text(page, 'Second paragraph', 3)
    page.keyboard.press('Alt'); settle(page, 100)
    alt = page.evaluate("document.body.classList.contains('keytips')")
    page.keyboard.press('h'); page.keyboard.press('e'); settle(page, 150)
    typed = src(page)
    page.keyboard.press('Control+z'); settle(page, 100)
    click_text(page, 'Second paragraph', 3)
    page.keyboard.press('F10'); settle(page, 100)
    f10 = page.evaluate("document.body.classList.contains('keytips')")
    page.keyboard.press('Escape'); settle(page, 100)
    check('a Mac: Option alone shows no letters, and the letters after it are typed (no command runs); F10 shows them', not alt and 'he' in typed and f10, (alt, f10))
    browser.close()



# Controls that overlap one another or are cut off by the ribbon, on one tab as the fit leaves it
OVERLAP = """(tab) => { const app = window.rikuy, rb = document.getElementById('ribbon');
  app.rbTab = tab;
  for (const p of rb.querySelectorAll('.rb-panel')) p.hidden = p.dataset.tab !== tab;
  const P = document.getElementById('rp-' + tab);
  P.querySelector('.rb-tb').append(document.querySelector('.rb-dl'));
  app.ribbonFit(); rb.scrollLeft = 0;
  const R = rb.getBoundingClientRect(), vis = (e) => e.offsetParent !== null && e.getClientRects().length > 0;
  const cs = [...P.querySelectorAll('button, input, select')].filter(vis), rs = cs.map((e) => e.getBoundingClientRect()), ov = [], cut = [];
  for (let i = 0; i < cs.length; i++) {
    if (rs[i].top < R.top - 0.5 || rs[i].bottom > R.bottom + 0.5) cut.push(cs[i].getAttribute('aria-label') || cs[i].id);
    for (let j = i + 1; j < cs.length; j++) {
      if (cs[i].contains(cs[j]) || cs[j].contains(cs[i])) continue;
      const w = Math.min(rs[i].right, rs[j].right) - Math.max(rs[i].left, rs[j].left), h = Math.min(rs[i].bottom, rs[j].bottom) - Math.max(rs[i].top, rs[j].top);
      if (w > 1.5 && h > 1.5) ov.push([cs[i].getAttribute('aria-label') || cs[i].id, cs[j].getAttribute('aria-label') || cs[j].id]);
    }
  }
  // (the mouse's grid, three rows of small buttons; a finger's row is one row of 44 px and the name)
  const grid = [...P.querySelectorAll('.rb-grp.lay')].filter((g) => getComputedStyle(g).display === 'grid' && getComputedStyle(g).gridTemplateRows.split(' ').length > 2).length;
  app.rbTab = null; app.selectTab('home');
  return { ov, cut, grid }; }"""


def tablet(p):
    """A touch screen 900 px and wider (a tablet in landscape) keeps its row of 44 px targets, each
    group's name under it: Word's grid of three rows of small buttons is for a mouse; no control
    overlaps another or is cut off by the ribbon."""
    for w in (1024, 1180, 1366):
        browser, page, errors = open_page(p, width=w, height=800, touch=True)
        bad = {}
        for t in ('home', 'insert', 'review', 'view', 'references', 'table-layout', 'picture-format', 'equation'):
            r = page.evaluate(OVERLAP, t)
            if r['ov'] or r['cut'] or r['grid']: bad[t] = r
        check('a touch screen at %d px: no laid out group is the mouse\'s grid of three rows, no control overlaps another or is cut off, on 8 tabs' % w, not bad, str(bad)[:400])
        browser.close()


SWEEP = """() => { const app = window.rikuy, rb = document.getElementById('ribbon'), gal = document.getElementById('rb-gallery'), out = {};
  const fits = () => rb.scrollWidth <= rb.clientWidth + 1;
  for (const id of app.rbTabs) {
    // (a contextual tab too, shown as selectTab shows a tab, without the caret in its object)
    app.rbTab = id;
    for (const p of rb.querySelectorAll('.rb-panel')) p.hidden = p.dataset.tab !== id;
    const P = document.getElementById('rp-' + id);
    P.querySelector('.rb-tb').append(document.querySelector('.rb-dl'));
    app.ribbonFit(); rb.scrollLeft = 0;
    let n = 0;
    // (the gallery's tiles count, its paging arrows and More do not: they are its own way about)
    for (const x of P.querySelectorAll('button, select, input')) if (x.offsetParent && (!gal.contains(x) || x.dataset.style) && x.getBoundingClientRect().right <= innerWidth + 1) n++;
    // the names shown on buttons (not the downloads': those are controls, counted above)
    let names = 0;
    for (const x of P.querySelectorAll('.rb-grp .btn:not(.rb-gbtn) > span:not(.sr), .rb-grp .btn > .rb-bl')) if (x.offsetParent && x.getClientRects().length && x.getBoundingClientRect().right <= innerWidth + 1) names++;
    const folded = [...P.querySelectorAll('.rb-grp.folded')], wasted = [];
    // (Home's spare Insert waits for the Styles gallery: beside the style list it stays folded)
    for (const g of folded) { if (g.dataset.spare && rb.classList.contains('rb-narrow')) continue; const c = [...g.classList]; g.classList.remove('folded', 'ico'); if (fits()) wasted.push(g.dataset.group); g.className = c.join(' '); }
    out[id] = { n, names, over: !fits(), folded: folded.map((g) => g.dataset.group), wasted, small: [...P.querySelectorAll('.rb-grp.sm, .rb-grp.nm')].map((g) => g.dataset.group) };
  }
  app.rbTab = null; app.selectTab('home');
  return out; }"""


def fold_sweep(page):
    """The one fold rule (ribbonFit): from 390 to 1920 px in steps of 10 px, on every tab, with the
    real commands and with more registered: a wider window never shows fewer controls, the row fits
    from 521 px up (below, a phone's row scrolls), no group is folded where it would fit open, Home
    folds nothing but its spare Insert down to 1024 px and at most one group at 900 px."""
    load_doc(page, DOC); click_text(page, 'Second paragraph', 3)
    page.evaluate("""() => { const app = window.rikuy, f = window.__rf = app.ribbonFit; window.__fits = 0; app.ribbonFit = function () { window.__fits++; return f.apply(this, arguments); }; }""")
    for k in ('ArrowRight', 'ArrowRight', 'ArrowDown', 'End', 'Home'):
        page.keyboard.press(k); settle(page, 60)
    settle(page, 200)
    check('the caret\'s moves measure nothing: no fit of the ribbon', page.evaluate('window.__fits') == 0, page.evaluate('window.__fits'))
    order = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'ribbon', 'order.js')).read()
    every = [(t, g, name, int(r or 1)) for t, body in re.findall(r"\{ id: '([\w-]+)', name: '[^']*',(?: ctx: '\w+',)? groups: \[(.*?)\] \}", order) for g, name, r in re.findall(r"\['([\w-]+)', '([^']+)'(?:, (\d+))?\]", body)]
    rank = {(t, g): r for t, g, _, r in every}
    # (the review's: seven groups of three on File, four in Speech and four in Accessibility; then
    # three more in every group of every tab, the empty ones too)
    review = [('file', g, g, 3) for g in ('new', 'open', 'info', 'save', 'print', 'share', 'options')] + [('review', 'speech', 'Speech', 4), ('review', 'accessibility', 'Accessibility', 4)]
    widths = list(range(390, 1921, 10))
    for tag, extra in (('with the real commands', []), ('with the review\'s', review), ('with three more in every group', [(t, g, name, 3) for t, g, name, _ in every])):
        page.evaluate("""(extra) => { const R = window.rikuy.cmds; let k = 0;
          for (const c of R.commands()) if (/^t-sw/.test(c.id)) R.unregister(c.id);
          for (const [t, g, name, n] of extra) for (let i = 0; i < n; i++)
            R.register({ id: 't-sw' + k++, name: 'Sweep ' + t + ' ' + g + ' ' + i, tab: t, group: g, label: 'Sweep ' + name + ' ' + i, icon: '<path d="M4 4h12"/>', when: () => true, run: () => {} });
          window.rikuy.ribbonBuild(); }""", extra)
        seen = {}
        for w in widths:
            page.set_viewport_size({'width': w, 'height': 900}); settle(page, 40)
            seen[w] = page.evaluate(SWEEP)
        tabs = list(seen[widths[0]])
        fewer = [(t, a, b) for t in tabs for a, b in zip(widths, widths[1:]) if seen[b][t]['n'] < seen[a][t]['n'] and b != 530]
        # (where a narrower window shows more, a group of higher rank folded there and let one of
        # lower rank open: the rank says which folds first, and the tries back open what has room)
        def inverted(t, a, b):
            fa, fb = set(seen[a][t]['folded']), set(seen[b][t]['folded'])
            return any(rank[(t, x)] > rank[(t, y)] for x in fa - fb for y in fb - fa)
        flips = [x for x in fewer if inverted(*x)]
        over = [(t, w) for t in tabs for w in widths if w >= 521 and seen[w][t]['over']]
        wasted = [(t, w, seen[w][t]['wasted']) for t in tabs for w in widths if seen[w][t]['wasted']]
        print('     sweep %s: %d tabs; at 530, 860, 870, 1020, 1360 px (controls, folded): %s; where a group of higher rank folded for one of lower rank: %s' % (
            tag, len(tabs), {t: [(seen[w][t]['n'], len(seen[w][t]['folded'])) for w in (530, 860, 870, 1020, 1360)] for t in tabs}, [(t, a, b, seen[a][t]['folded'], seen[b][t]['folded']) for t, a, b in flips]))
        if extra == [] or extra == review:
            check('%s, on all %d tabs from 390 to 1920 px in 10 px steps: a wider window never shows fewer controls (but 530 px against 520, where a phone\'s row scrolls)' % (tag, len(tabs)), not fewer, fewer[:6])
            # (names as well: the steps that take a name are one chain, given back from its end)
            nfewer = [(t, a, b, seen[a][t]['names'], seen[b][t]['names']) for t in tabs for a, b in zip(widths, widths[1:]) if seen[b][t]['names'] < seen[a][t]['names'] and b != 530 and seen[b][t]['n'] == seen[a][t]['n']]
            check('%s: a wider window never shows fewer names on buttons where it shows as many controls' % tag, not nfewer, nfewer[:6])
        else:
            # spare Insert folds before the buttons' names go. A few pixels wider, the names come
            # back while Insert stays folded: the names are not controls, so the count dips.
            def spare_names(t, a, b):
                fa, fb = set(seen[a][t]['folded']), set(seen[b][t]['folded'])
                return t == 'home' and fb - fa == {'insert'} and not (fa - fb)
            check('%s, on all %d tabs: a wider window shows fewer controls only where a group of higher rank folded and let one of lower rank open' % (tag, len(tabs)), all(inverted(*x) or spare_names(*x) for x in fewer), [x for x in fewer if not inverted(*x) and not spare_names(*x)][:6])
        check('%s: from 521 px up the row fits on every tab' % tag, not over, over[:6])
        check('%s: no group is folded where it would fit open' % tag, not wasted, wasted[:6])
        if extra == []:
            home = {w: seen[w]['home'] for w in widths}
            # (at 900 px Paragraph: every split button's arrow a 24 px target, WCAG 2.5.8, made Font
            # and Paragraph wider than Clipboard and Editing can make room for)
            check('Home from 1920 to 1024 px folds nothing but its spare Insert; at 900 px one group of rank 4 or less may fold with it', all(set(home[w]['folded']) <= {'insert'} for w in widths if w >= 1024) and len(set(home[900]['folded']) - {'insert'}) <= 1 and set(home[900]['folded']) <= {'insert', 'editing', 'clipboard', 'paragraph'}, {w: home[w]['folded'] for w in (900, 1030, 1360)})
    page.evaluate("""() => { for (const c of window.rikuy.cmds.commands()) if (/^t-sw/.test(c.id)) window.rikuy.cmds.unregister(c.id); window.rikuy.ribbonBuild(); window.rikuy.ribbonFit = window.__rf; }""")
    page.set_viewport_size({'width': 1400, 'height': 1000}); settle(page, 300, full=True)
    open_tab(page, 'Home')


def run():
    # (python3 tabs.py widths fold_sweep: those parts alone)
    only = set(sys.argv[1:])
    with sync_playwright() as p:
        browser, page, errors = open_page(p)
        for f in (mouse_and_keys, contextual, widths, collapse, every_command, keys, search_box, context_menu, kit, round_trips, kept_braces, review_fixes, word_layout, fold_sweep):
            if only and f.__name__ not in only: continue
            try: f(page)
            except Exception as e: check(f.__name__ + ' runs to its end', False, str(e)[:300])
        check('no page errors', not [e for e in errors if 'tree.wasm' not in e and 'TeX' not in e], errors[:4])
        browser.close()
        for f in (tablet, mac_keytips, downloads_group, frontier, no_caret):
            if only and f.__name__ not in only: continue
            try: f(p)
            except Exception as e: check(f.__name__ + ' runs to its end', False, str(e)[:300])
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    run()
