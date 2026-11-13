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
on a phone, Page width on a phone, and Home whole at 860 px.

RIKUY_DIST names another dist/."""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import open_page, check, results, src, load_doc, click_text, select_text, roundtrip, place, pressed
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
    page.click('#' + gb); page.wait_for_timeout(150)
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
    page.wait_for_timeout(150)


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
    check('and the caret stays on the page', all(x[2] == 'pages' for x in seen), seen)
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
        page.keyboard.press(key); page.wait_for_timeout(80)
        got.append(page.evaluate('[document.activeElement.textContent, document.querySelector("#rb-tabs [aria-selected=true]").textContent]'))
    # (from Home two to the right, the last, the first, back round to the last, on to the first)
    k = tabs.index('Home')
    want = [tabs[k + 1], tabs[k + 2], tabs[-1], tabs[0], tabs[-1], tabs[0]]
    check('the arrows, Home and End move along the tabs and open each (the last wraps to the first)', [g[0] for g in got] == want and all(a == b for a, b in got), got)
    stops = page.evaluate('[...document.querySelectorAll("#rb-tabs [role=tab]")].filter((t) => t.tabIndex === 0).map((t) => t.textContent)')
    check('one tab stop in the tablist: the open tab', stops == [tabs[0]], stops)
    open_tab(page, 'Home'); page.focus('#rt-home')
    page.keyboard.press('ArrowDown'); page.wait_for_timeout(80)
    into = page.evaluate('[document.activeElement.id, document.activeElement.closest("[role=toolbar]") && document.activeElement.closest("[role=toolbar]").getAttribute("aria-label")]')
    check('the down arrow goes into the open tab\'s toolbar, to its tab stop', into == ['rc-format-painter', 'Home'], into)
    page.focus('#rt-insert'); page.keyboard.press('Enter'); page.wait_for_timeout(80)
    check('Enter on a tab opens it and goes into its toolbar', page.evaluate('document.activeElement.closest("#rp-insert") !== null'))
    page.keyboard.press('Escape'); page.wait_for_timeout(80)
    check('Escape there goes back to the caret on the page', page.evaluate('document.activeElement.id') == 'pages')
    open_tab(page, 'Home')
    # a copy of a command on another tab does what the first does
    click_text(page, 'Second paragraph', 6)
    open_tab(page, 'Insert')
    page.get_by_role('button', name='Table', exact=True).click(); page.wait_for_timeout(200)
    check('Table on Insert (a copy of Home\'s) puts the same table in, after the caret\'s paragraph', 'Second paragraph here.\n\n\\begin{table}[h]' in src(page), src(page)[60:200])
    page.evaluate('rikuy.undo()')
    open_tab(page, 'Home')


def contextual(page):
    load_doc(page, TABLE)
    click_text(page, 'A paragraph', 2); page.wait_for_timeout(200)
    before = shown_tabs(page)
    click_text(page, 'cell', 2); page.wait_for_timeout(250)
    during = shown_tabs(page)
    check('with the caret in a table the contextual tab Table Layout comes, after Help', 'Table Layout' not in before and during[-1] == 'Table Layout', (before, during))
    open_tab(page, 'Table Layout')
    page.get_by_role('button', name='Insert below', exact=True).click(); page.wait_for_timeout(200)
    check('its Insert below adds a row under the caret\'s', 'cell & other \\\\\n &  \\\\\nmore' in src(page) or src(page).count('\\\\') == 3, src(page)[60:200])
    page.evaluate('rikuy.undo()'); page.wait_for_timeout(150)
    click_text(page, 'After it', 2); page.wait_for_timeout(250)
    check('and with the caret out of the table it goes, and the tab open before it opens again', 'Table Layout' not in shown_tabs(page) and page.evaluate('document.querySelector("#rb-tabs [aria-selected=true]").textContent') == 'Home')
    # the other contextual tabs, with a command of the test in each
    page.evaluate('''() => { const R = window.rikuy.cmds; for (const [id, tab, group] of [['t-pic', 'picture-format', 'size'], ['t-eq', 'equation', 'tools'], ['t-hf', 'headfoot', 'headfoot']])
        R.register({ id, name: 'Test ' + id, tab, group, label: 'Test', when: () => true, run: () => { window.__ran = id; } }); window.rikuy.ribbonBuild(); }''')
    load_doc(page, DOC)
    click_text(page, 'Second paragraph', 3)
    named(page, 'Formula')
    page.wait_for_selector('.pop-math'); page.wait_for_timeout(300)
    eq = shown_tabs(page)
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
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
        page.set_viewport_size({'width': w, 'height': 900}); page.wait_for_timeout(300)
        click_text(page, 'Second paragraph', 3); page.wait_for_timeout(150)
        seen[w] = page.evaluate('''() => { const r = document.getElementById('ribbon'), b = r.getBoundingClientRect(), top = document.getElementById('rb-top');
          return { tabs: !!top.offsetParent, sel: !!document.getElementById('rb-tabsel').offsetParent, over: r.scrollWidth > r.clientWidth + 1, h: Math.round(b.height),
            folded: [...document.querySelectorAll('.rb-grp.folded')].map((g) => g.dataset.group), ico: [...document.querySelectorAll('.rb-grp.ico')].map((g) => g.dataset.group), page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            dl: [...document.querySelectorAll('.rb-dl button')].filter((x) => x.offsetParent).map((x) => x.id) }; }''')
    print('     widths:', seen)
    # (Home's Insert, which the Insert tab has too, is spare: it folds first, into one icon button
    # named Insert, so Home's other groups keep their buttons and names; src/ribbon/order.js)
    check('at 1400, 1024 and 860 px the row does not scroll and Home folds its spare Insert alone, into one icon button named Insert; the tabs a row above the toolbar at 1400 and 1024 px', all(seen[w]['tabs'] and not seen[w]['sel'] for w in (1400, 1024))
          and all(not seen[w]['over'] and seen[w]['folded'] == ['insert'] and seen[w]['ico'] == ['insert'] for w in (1400, 1024, 860)), seen)
    check('at 860 and 390 px the tabs are the combobox "Ribbon tab" at the row\'s start, in one row that scrolls sideways on a phone', all(not seen[w]['tabs'] and seen[w]['sel'] and seen[w]['h'] <= 44 and seen[w]['page'] <= 0 for w in (860, 390)) and seen[390]['over'], seen)
    # (the three go before any group folds: they take two controls, Editing three)
    # (B2: Home's row at 1400 px has no room for the three, Insert's has)
    page.set_viewport_size({'width': 1400, 'height': 900}); page.wait_for_timeout(300)
    open_tab(page, 'Insert'); page.wait_for_timeout(200)
    ins = page.evaluate('[...document.querySelectorAll(".rb-dl button")].filter((x) => x.offsetParent).map((x) => x.id)')
    open_tab(page, 'Home'); page.set_viewport_size({'width': 390, 'height': 900}); page.wait_for_timeout(300)
    check('the downloads: three where the row has room (Insert at 1400 px); one Download menu where it has not (Home at 1400, 1024 and 860 px), and on a phone', ins == ['rb-pdf', 'rb-word', 'b-save'] and all(seen[w]['dl'] == ['rb-dl-menu'] for w in (1400, 1024, 860, 390)) and not seen[860]['over'], (ins, {w: seen[w]['dl'] for w in seen}))
    page.set_viewport_size({'width': 390, 'height': 900}); page.wait_for_timeout(300)
    page.get_by_role('combobox', name='Ribbon tab', exact=True).select_option(label='Insert'); page.wait_for_timeout(200)
    check('on a phone the combobox opens a tab: Insert\'s Picture is there by its name', page.get_by_role('tabpanel', name='Insert', exact=True).get_by_role('button', name='Picture', exact=True).is_visible())
    page.get_by_role('combobox', name='Ribbon tab', exact=True).select_option(label='Home'); page.wait_for_timeout(200)
    # groups fold, the lowest rank first, into a button named after the group
    page.evaluate('''() => { const R = window.rikuy.cmds;
      for (let k = 0; k < 6; k++) R.register({ id: 't-ed' + k, name: 'Editing test ' + k, tab: 'home', group: 'editing', label: 'Editing test ' + k, icon: '<path d="M4 4h12"/>', when: () => true, run: () => { window.__ran = 't-ed' + k; } });
      for (let k = 0; k < 8; k++) R.register({ id: 't-cl' + k, name: 'Clipboard test ' + k, tab: 'home', group: 'clipboard', label: 'Clipboard test ' + k, icon: '<path d="M4 4h12"/>', when: () => true, run: () => {} });
      window.rikuy.ribbonBuild(); }''')
    f = {}
    for w in (900, 1024):
        page.set_viewport_size({'width': w, 'height': 900}); page.wait_for_timeout(300)
        click_text(page, 'Second paragraph', 3); page.wait_for_timeout(150)
        f[w] = page.evaluate('''() => ({ folded: [...document.querySelectorAll('#rp-home .rb-grp.folded')].map((g) => g.dataset.group), over: document.getElementById('ribbon').scrollWidth > document.getElementById('ribbon').clientWidth + 1 })''')
    check('with more than fits, groups fold, the spare Insert first and then the lowest rank: Editing with it at 1024 px, Clipboard too at 900 px, and the row fits', sorted(f[1024]['folded']) == ['editing', 'insert'] and sorted(f[900]['folded']) == ['clipboard', 'editing', 'insert'] and not f[900]['over'] and not f[1024]['over'], f)
    gb = page.get_by_role('button', name='Editing', exact=True)
    check('a folded group is one button named after it; its own buttons are out of the accessibility tree', gb.count() == 1 and page.get_by_role('button', name='Editing test 0', exact=True).count() == 0 and not twice(page), twice(page))
    gb.click(); page.wait_for_timeout(200)
    menu = page.get_by_role('menu', name='Editing', exact=True)
    names = [menu.get_by_role('menuitem').nth(k).get_attribute('aria-label') for k in range(menu.get_by_role('menuitem').count())]
    # (Home's own Editing commands, Find (with its menu's Advanced Find and Go To), Replace and Select, come first: B5's)
    check('it opens a menu "Editing" of its commands by their names', names[-6:] == ['Editing test %d' % k for k in range(6)] and names[:-6] == ['Find', 'Advanced Find', 'Go To', 'Replace', 'Select'] and gb.get_attribute('aria-expanded') == 'true', names)
    menu.get_by_role('menuitem', name='Editing test 3', exact=True).click(); page.wait_for_timeout(150)
    check('and an item runs its command, the menu closed, the caret on the page', page.evaluate('window.__ran') == 't-ed3' and page.get_by_role('menu').count() == 0 and page.evaluate('document.activeElement.id') == 'pages')
    page.set_viewport_size({'width': 1920, 'height': 900}); page.wait_for_timeout(300)
    check('with room again (1920 px) every group is open but the spare Insert', page.evaluate("[...document.querySelectorAll('.rb-grp.folded')].map((g) => g.dataset.group)") in ([], ['insert']), page.evaluate("[...document.querySelectorAll('.rb-grp.folded')].map((g) => g.dataset.group)"))
    page.evaluate('''() => { for (const c of window.rikuy.cmds.commands()) if (/^t-(ed|cl)/.test(c.id)) window.rikuy.cmds.unregister(c.id); window.rikuy.ribbonBuild(); }''')
    page.set_viewport_size({'width': 1400, 'height': 1000}); page.wait_for_timeout(300)


def collapse(page):
    load_doc(page, DOC); click_text(page, 'Second paragraph', 3)
    page.keyboard.press('Control+F1'); page.wait_for_timeout(200)
    a = page.evaluate('[document.body.classList.contains("rb-collapsed"), !!document.getElementById("ribbon").offsetParent, document.getElementById("rb-collapse").getAttribute("aria-pressed"), document.activeElement.id]')
    page.keyboard.press('Control+F1'); page.wait_for_timeout(200)
    b = page.evaluate('[document.body.classList.contains("rb-collapsed"), !!document.getElementById("ribbon").offsetParent]')
    check('Ctrl+F1 folds the ribbon to its tabs (the caret stays on the page) and shows it again', a == [True, False, 'true', 'pages'] and b == [False, True], (a, b))
    page.get_by_role('button', name='Collapse the ribbon', exact=True).click(); page.wait_for_timeout(150)
    open_tab(page, 'Insert')
    c = page.evaluate('[document.body.classList.contains("rb-collapsed"), !!document.getElementById("ribbon").offsetParent, document.querySelector("#rb-tabs [aria-selected=true]").textContent]')
    check('the button "Collapse the ribbon" does it too, and a tab pressed while folded shows the ribbon with that tab (the setting stays folded)', c == [True, True, 'Insert'], c)
    page.get_by_role('button', name='Collapse the ribbon', exact=True).click(); page.wait_for_timeout(150)
    open_tab(page, 'Home')
    check('and the button shows it again for good', page.evaluate('[document.body.classList.contains("rb-collapsed"), !!document.getElementById("ribbon").offsetParent]') == [False, True])


def every_command(page):
    load_doc(page, TABLE)
    bad, n = [], 0
    reg = page.evaluate('rikuy.cmds.describe().filter((x) => x.place === "ribbon" && x.tab && !x.fit && x.role !== "group" && x.only !== "narrow")')
    tabs = page.evaluate('Object.fromEntries([...document.querySelectorAll("#rb-tabs [role=tab]")].map((t) => [t.dataset.tab, t.textContent]))')
    for x in reg:
        if x['tab'].startswith('table'):
            click_text(page, 'cell', 2); page.wait_for_timeout(200)
        elif x['tab'] == 'headfoot':
            # (the Header & Footer tab is there while the header is open on the page)
            if not page.evaluate('!!rikuy.hf'): page.evaluate('rikuy.pageHFOpen("head")'); page.wait_for_timeout(200)
        else:
            if page.evaluate('!!rikuy.hf'): page.evaluate('rikuy.pageHFClose()')
            click_text(page, 'A paragraph', 2); page.wait_for_timeout(120)
        open_tab(page, tabs[x['tab']])
        loc = page.get_by_role(x['role'], name=x['name'], exact=True)
        n += 1
        if loc.count() != 1 or not page.locator('#' + x['id']).is_visible():
            # (in a folded group, Home's spare Insert: its button's menu has it by the same name)
            gb = page.evaluate("(id) => { const e = document.getElementById(id), g = e && e.closest('.rb-grp.folded'); return g && !e.offsetParent ? g.querySelector('.rb-gbtn').id : null; }", x['id'])
            if gb and loc.count() == 0:
                page.click('#' + gb); page.wait_for_timeout(150)
                m = page.locator('.pop [role^=menuitem][aria-label="%s"]' % x['name']).count()
                page.keyboard.press('Escape'); page.wait_for_timeout(100)
                if m == 1:
                    continue
            bad.append((x['tabName'] if 'tabName' in x else x['tab'], x['name'], loc.count()))
    if page.evaluate('!!rikuy.hf'): page.evaluate('rikuy.pageHFClose()')
    open_tab(page, 'Home')
    check('every command placed on the ribbon (%d) is found by its role and name, once, with its tab open' % n, not bad and n > 20, bad)


def keys(page):
    load_doc(page, DOC)
    for k, cmd in (('1', '\\section'), ('2', '\\subsection'), ('3', '\\subsubsection')):
        click_text(page, 'Second paragraph', 3)
        page.keyboard.press('Control+Alt+' + k); page.wait_for_timeout(150)
        got = src(page)
        page.keyboard.press('Control+Alt+0'); page.wait_for_timeout(150)
        check('Ctrl+Alt+%s makes the paragraph %s{...}; Ctrl+Alt+0 makes it Normal again, byte for byte' % (k, cmd), got == DOC.replace('Second paragraph here.', cmd + '{Second paragraph here.}') and src(page) == DOC, got[60:140])
    select_text(page, 'Second paragraph here.')
    page.keyboard.press('Control+Shift+L'); page.wait_for_timeout(150)
    check('Ctrl+Shift+L makes a bulleted list', '\\begin{itemize}\n  \\item Second paragraph here.\n\\end{itemize}' in src(page), src(page)[60:160])
    page.keyboard.press('Control+z'); page.wait_for_timeout(120)
    # AltGr: Windows says Ctrl+Alt with it; German AltGr+2 types \u00b2, AltGr+0 types }
    click_text(page, 'Second paragraph', 3)
    r = page.evaluate('''() => { const out = []; for (const [key, code] of [['\\u00b2', 'Digit2'], ['}', 'Digit0'], ['1', 'Digit1']]) {
        const e = new KeyboardEvent('keydown', { key, code, ctrlKey: true, altKey: true, modifierAltGraph: true, bubbles: true, cancelable: true });
        document.getElementById('pages').dispatchEvent(e); out.push(e.defaultPrevented); } return out; }''')
    page.wait_for_timeout(150)
    check('AltGr (Ctrl+Alt with the AltGraph state) is never a heading key: the character is left to be typed', r == [False, False, False] and src(page) == DOC, r)
    r = page.evaluate('''() => { const e = new KeyboardEvent('keydown', { key: '1', code: 'Digit1', ctrlKey: true, altKey: true, isComposing: true, bubbles: true, cancelable: true }); document.getElementById('pages').dispatchEvent(e); return e.defaultPrevented; }''')
    check('nothing is caught while an input method composes', r is False and src(page) == DOC)
    # Alt+Q from the page and from the ribbon
    click_text(page, 'Second paragraph', 3)
    page.keyboard.press('Alt+q'); page.wait_for_timeout(120)
    a = page.evaluate('document.activeElement.id')
    page.keyboard.press('Escape'); page.wait_for_timeout(100)
    page.focus('#rb-i'); page.keyboard.press('Alt+q'); page.wait_for_timeout(120)
    b = page.evaluate('document.activeElement.id')
    page.keyboard.press('Escape'); page.wait_for_timeout(100)
    check('Alt+Q goes to the search box from the page and from the ribbon; Escape goes back to the page', a == 'rk-search' and b == 'rk-search' and page.evaluate('document.activeElement.id') == 'pages', (a, b))
    # the page's keys are the page's: Ctrl+B in the search box is no bold
    page.focus('#rk-search'); page.keyboard.press('Control+b'); page.wait_for_timeout(100)
    check('a page key in a field of the bar does nothing to the document', src(page) == DOC)
    page.keyboard.press('Escape')


def search_box(page):
    load_doc(page, DOC)
    click_text(page, 'Third paragraph', 3)
    box = page.get_by_role('combobox', name='Search', exact=True)
    box.click(); box.fill('bullets'); page.wait_for_timeout(150)
    lb = page.get_by_role('listbox', name='Commands', exact=True)
    opts = lb.get_by_role('option').all_inner_texts()
    check('typing "bullets" lists Bulleted list first (Word\'s name for it), as an option of the listbox "Commands"', opts and opts[0].startswith('Bulleted list') and box.get_attribute('aria-expanded') == 'true'
          and box.get_attribute('aria-activedescendant') == 'rk-so-0', opts[:3])
    page.keyboard.press('Enter'); page.wait_for_timeout(200)
    check('Enter runs it where the caret was: the paragraph is a list item, and the caret is back on the page', '\\begin{itemize}\n  \\item Third paragraph here.\n\\end{itemize}' in src(page) and page.evaluate('document.activeElement.id') == 'pages'
          and lb.is_hidden(), src(page)[60:200])
    page.keyboard.press('Control+z'); page.wait_for_timeout(120)
    click_text(page, 'Opening', 3)
    box.click(); box.fill('footnote'); page.wait_for_timeout(150)
    off = page.evaluate('document.querySelector("#rk-search-list [role=option]").getAttribute("aria-disabled")')
    page.keyboard.press('Enter'); page.wait_for_timeout(200)
    check('a command that cannot run where the caret is (a footnote in a heading) shows faded, and picked it says so and changes nothing', off == 'true' and src(page) == DOC and 'Footnote does not apply here.' in page.inner_text('#toast'), page.inner_text('#toast'))
    box.click(); box.fill('heading 2'); page.keyboard.press('ArrowDown'); page.keyboard.press('ArrowUp'); page.wait_for_timeout(100)
    first = page.evaluate('document.getElementById("rk-so-0").getAttribute("aria-selected")')
    page.keyboard.press('Escape'); page.wait_for_timeout(80)
    v = box.input_value()
    page.keyboard.press('Escape'); page.wait_for_timeout(80)
    check('the arrows move in the list; Escape empties the box, a second Escape goes back to the page', first == 'true' and v == '' and page.evaluate('document.activeElement.id') == 'pages', (first, v))
    box.click(); box.fill('zzzz'); page.wait_for_timeout(120)
    check('a word that names nothing says so', 'No command by that name' in page.inner_text('#rk-search-list'))
    page.keyboard.press('Escape'); page.keyboard.press('Escape')


def context_menu(page):
    load_doc(page, DOC)
    select_text(page, 'Second paragraph')
    r = page.evaluate('''() => { const s = [...document.querySelectorAll('#pages span.t')].find((x) => x.textContent.includes('Second')); const b = s.getBoundingClientRect(); return [b.left + 10, b.top + b.height / 2]; }''')
    page.mouse.click(r[0], r[1], button='right'); page.wait_for_timeout(200)
    menu = page.get_by_role('menu', name='Context menu', exact=True)
    items = [menu.get_by_role('menuitem').nth(k).get_attribute('aria-label') for k in range(menu.get_by_role('menuitem').count())]
    check('a right click on selected words opens Rikuy\'s menu "Context menu": Cut, Copy, Bold, Italic, New comment, Font Settings, Show in source', items[:7] == ['Cut', 'Copy', 'Bold', 'Italic', 'New comment', 'Font Settings', 'Show in source'], items)
    menu.get_by_role('menuitem', name='Bold', exact=True).click(); page.wait_for_timeout(200)
    check('its Bold makes them bold, and the caret is back on the page', '\\textbf{Second paragraph} here.' in src(page) and page.evaluate('document.activeElement.id') == 'pages', src(page)[60:140])
    page.keyboard.press('Control+z'); page.wait_for_timeout(120)
    # in a table: its own items first
    load_doc(page, TABLE)
    r = page.evaluate('''() => { const s = [...document.querySelectorAll('#pages span.t')].find((x) => x.textContent.includes('cell')); const b = s.getBoundingClientRect(); return [b.left + 3, b.top + b.height / 2]; }''')
    page.mouse.click(r[0], r[1], button='right'); page.wait_for_timeout(200)
    first = page.get_by_role('menu', name='Context menu', exact=True).get_by_role('menuitem').first.get_attribute('aria-label')
    check('in a table cell the table\'s items come first (Insert below)', first == 'Insert below', first)
    # a second right click is the browser's, as is one with Shift
    page.evaluate('''() => { window.__ctx = []; document.addEventListener('contextmenu', (e) => setTimeout(() => window.__ctx.push(e.defaultPrevented), 0)); }''')
    page.mouse.click(r[0], r[1], button='right'); page.wait_for_timeout(150)
    page.keyboard.press('Escape')
    page.keyboard.down('Shift'); page.mouse.click(r[0], r[1], button='right'); page.keyboard.up('Shift'); page.wait_for_timeout(150)
    page.keyboard.press('Escape')
    check('a second right click, and one with Shift, give the browser\'s own menu (its spelling suggestions)', page.evaluate('window.__ctx') == [False, False] and page.get_by_role('menu').count() == 0, page.evaluate('window.__ctx'))
    click_text(page, 'After it', 2)
    page.keyboard.press('Shift+F10'); page.wait_for_timeout(200)
    m = page.get_by_role('menu', name='Context menu', exact=True)
    foc = page.evaluate('document.activeElement.getAttribute("role")')
    page.keyboard.press('Escape'); page.wait_for_timeout(120)
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
    m.get_by_role('menuitemradio', name='ForestGreen', exact=True).click(); page.wait_for_timeout(100)
    check('a swatch picked gives its name, and the menu closes', page.evaluate('window.__pick') == {'name': 'ForestGreen'} and m.count() == 0)
    # the dialog shell
    page.evaluate('''() => { const p = window.rikuy.kit.dialog(window.rikuy, { title: 'Test dialog', anchor: document.getElementById('rb-b') }); p.append(document.createTextNode('Body')); window.rikuy.positionPop(); }''')
    d = page.get_by_role('dialog', name='Test dialog', exact=True)
    ok = d.count() == 1 and d.get_by_role('button', name='Close', exact=True).count() == 1 and d.get_attribute('aria-modal') is None
    page.keyboard.press('Escape'); page.wait_for_timeout(100)
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
      s.id = 't-splitbox'; document.querySelector('#rp-home .rb-grp').append(s); }''')
    x = page.get_by_role('button', name='Underline test options', exact=True)
    x.click(); page.wait_for_timeout(120)
    sm = page.get_by_role('menu', name='Underline test', exact=True)
    ok = sm.count() == 1 and x.get_attribute('aria-expanded') == 'true'
    sm.get_by_role('menuitem', name='Double', exact=True).click(); page.wait_for_timeout(100)
    page.get_by_role('button', name='Underline test', exact=True).click()
    check('a split button: the command by its name, and an arrow "<name> options" whose menu runs a choice', ok and page.evaluate('[window.__opt, window.__main]') == ['Double', 1] and x.get_attribute('aria-expanded') == 'false')
    page.evaluate('document.getElementById("t-splitbox").remove()')
    # a gallery in a menu: a grid the arrows move in both ways
    page.evaluate('''() => window.rikuy.kit.openGallery(window.rikuy, document.getElementById('rb-b'), ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => ({ name: 'Tile ' + n, html: '<b>' + n + '</b>', run: () => { window.__tile = n; } })), { label: 'Test gallery', columns: 3 })''')
    page.wait_for_timeout(100)
    seen = []
    for key in ('ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'):
        page.keyboard.press(key); seen.append(page.evaluate('document.activeElement.getAttribute("aria-label")'))
    page.keyboard.press('Enter'); page.wait_for_timeout(100)
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
        page.evaluate("window.rikuy.runCommand('bold')"); page.wait_for_timeout(200)
        got = src(page)
        page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(150)
        check('Bold off on "' + body + '" writes "' + want + '", one undo gives it back', on is True and got == WRAP(want, '\\usepackage{xcolor}\n') and src(page) == doc, (on, got[-80:]))


def review_fixes(page):
    load_doc(page, DOC); click_text(page, 'Second paragraph', 3)
    # the ribbon folded stays folded: after a reload, and after a tab was pressed to look in it
    page.keyboard.press('Control+F1'); page.wait_for_timeout(200)
    page.reload()
    page.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=20000)
    page.wait_for_timeout(300)
    a = page.evaluate('[document.body.classList.contains("rb-collapsed"), !!document.getElementById("ribbon").offsetParent, document.getElementById("rb-collapse").getAttribute("aria-pressed")]')
    load_doc(page, DOC)
    page.get_by_role('tab', name='Insert', exact=True).click(); page.wait_for_timeout(200)
    b = page.evaluate('[!!document.getElementById("ribbon").offsetParent, document.querySelector("#rb-tabs [aria-selected=true]").textContent, JSON.parse(localStorage.getItem("galley.prefs.v1") || localStorage.getItem("rikuy.prefs") || "{}").ribbon]')
    click_text(page, 'Second paragraph', 3)
    page.mouse.click(*page.evaluate('() => { const s = [...document.querySelectorAll("#pages span.t")].find((x) => x.textContent.includes("Second")); const r = s.getBoundingClientRect(); return [r.left + 5, r.top + r.height / 2]; }')); page.wait_for_timeout(200)
    c = page.evaluate('[document.body.classList.contains("rb-collapsed"), !!document.getElementById("ribbon").offsetParent]')
    check('Ctrl+F1\'s folded ribbon is folded after a reload; a tab pressed shows it for a moment, and a press on the page folds it again (Word\'s "Show tabs only")',
          a == [True, False, 'true'] and b[:2] == [True, 'Insert'] and c == [True, False], (a, b, c))
    box = page.get_by_role('combobox', name='Search', exact=True)
    box.click(); page.keyboard.press('Control+F1'); page.wait_for_timeout(200)
    d = page.evaluate('[document.body.classList.contains("rb-collapsed"), document.activeElement.id]')
    check('Ctrl+F1 acts with the focus in a field too (the search box), which keeps the focus', d == [False, 'rk-search'], d)
    page.keyboard.press('Escape')
    open_tab(page, 'Home')
    page.set_viewport_size({'width': 390, 'height': 800}); page.wait_for_timeout(300)
    click_text(page, 'Second paragraph', 3)
    page.keyboard.press('Control+F1'); page.wait_for_timeout(200)
    e = page.evaluate('document.body.classList.contains("rb-collapsed")')
    page.set_viewport_size({'width': 1400, 'height': 1000}); page.wait_for_timeout(300)
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
    page.keyboard.press('Control+Shift+B'); page.wait_for_timeout(200)
    check('Ctrl+Shift+B still bolds (as before the registry; it is not said anywhere)', '\\textbf{Second paragraph}' in src(page), src(page)[60:160])
    # the search box with no place on the page writes nothing and says why
    load_doc(page, DOC)
    page.evaluate('() => { document.activeElement && document.activeElement.blur(); getSelection().removeAllRanges(); }')
    box.click(); box.fill('bold'); page.wait_for_timeout(150); page.keyboard.press('Enter'); page.wait_for_timeout(200)
    check('the search box with no caret on the page writes nothing (not into the title) and asks for a click in the text', src(page) == DOC and 'Click in the text of the page first' in page.inner_text('#toast'), (src(page)[40:120], page.inner_text('#toast')))
    # the right click menu: Ask Claude only inside Claude; Shift+F10 again is the browser's
    load_doc(page, DOC); select_text(page, 'Second paragraph')
    page.keyboard.press('Shift+F10'); page.wait_for_timeout(200)
    m = page.get_by_role('menu', name='Context menu', exact=True)
    names = m.get_by_role('menuitem').evaluate_all('(xs) => xs.map((x) => x.getAttribute("aria-label"))')
    page.evaluate("() => { window.__ctx = []; document.addEventListener('contextmenu', (e) => setTimeout(() => window.__ctx.push(e.defaultPrevented), 0)); }")
    page.keyboard.press('Shift+F10'); page.wait_for_timeout(200)
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
    page.set_viewport_size({'width': 390, 'height': 800}); page.wait_for_timeout(300)
    click_text(page, 'cell', 2); page.wait_for_timeout(250)
    inside = page.evaluate('[...document.getElementById("rb-tabsel").options].filter((o) => !o.hidden && !o.disabled).map((o) => o.textContent)')
    click_text(page, 'After it', 2); page.wait_for_timeout(250)
    out = page.evaluate('[...document.getElementById("rb-tabsel").options].filter((o) => !o.hidden && !o.disabled).map((o) => o.textContent)')
    check('on a phone "Ribbon tab" offers Table Layout in a table and not after it', 'Table Layout' in inside and 'Table Layout' not in out, (inside, out))
    # View, Page width on a phone: the whole sheet, every press the same
    page.evaluate("() => { window.rikuy.runCommand('page-width'); }"); page.wait_for_timeout(150)
    z1 = page.evaluate('[window.rikuy.prefs.zoom, window.rikuy.prefs.phone, window.rikuy.textFit]')
    page.evaluate("() => { window.rikuy.runCommand('page-width'); }"); page.wait_for_timeout(150)
    z2 = page.evaluate('[window.rikuy.prefs.zoom, window.rikuy.prefs.phone, window.rikuy.textFit]')
    check('on a phone View\'s Page width shows the whole sheet, and a second press keeps it', z1 == ['fit', 'sheet', False] and z2 == z1, (z1, z2))
    page.set_viewport_size({'width': 860, 'height': 900}); page.wait_for_timeout(300)
    load_doc(page, DOC); click_text(page, 'Second paragraph', 3)
    page.get_by_role('combobox', name='Ribbon tab', exact=True).select_option(label='Home'); page.wait_for_timeout(200)
    w = page.evaluate("""() => { const p = document.querySelector('#ribbon [role=tabpanel]:not([hidden]) [role=toolbar]'); const out = [...p.querySelectorAll('button')].filter((b) => b.offsetParent && b.getBoundingClientRect().right > innerWidth + 1).map((b) => b.getAttribute('aria-label') || b.textContent);
        return [out, p.scrollWidth <= p.clientWidth + 1]; }""")
    check('at 860 px every control of Home is on the screen (Footnote, Citation, Link no longer scroll off)', w == [[], True], w)
    page.set_viewport_size({'width': 1400, 'height': 1000}); page.wait_for_timeout(300)


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
    const folded = [...P.querySelectorAll('.rb-grp.folded')], wasted = [];
    for (const g of folded) { const c = [...g.classList]; g.classList.remove('folded', 'ico'); if (fits()) wasted.push(g.dataset.group); g.className = c.join(' '); }
    out[id] = { n, over: !fits(), folded: folded.map((g) => g.dataset.group), wasted };
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
        page.keyboard.press(k); page.wait_for_timeout(60)
    page.wait_for_timeout(200)
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
            page.set_viewport_size({'width': w, 'height': 900}); page.wait_for_timeout(40)
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
        else:
            check('%s, on all %d tabs: a wider window shows fewer controls only where a group of higher rank folded and let one of lower rank open' % (tag, len(tabs)), all(inverted(*x) for x in fewer), [x for x in fewer if not inverted(*x)][:6])
        check('%s: from 521 px up the row fits on every tab' % tag, not over, over[:6])
        check('%s: no group is folded where it would fit open' % tag, not wasted, wasted[:6])
        if extra == []:
            home = {w: seen[w]['home'] for w in widths}
            check('Home from 1920 to 1024 px folds nothing but its spare Insert; at 900 px one group at most', all(set(home[w]['folded']) <= {'insert'} for w in widths if w >= 1024) and len(home[900]['folded']) <= 1, {w: home[w]['folded'] for w in (900, 1030, 1360)})
    page.evaluate("""() => { for (const c of window.rikuy.cmds.commands()) if (/^t-sw/.test(c.id)) window.rikuy.cmds.unregister(c.id); window.rikuy.ribbonBuild(); window.rikuy.ribbonFit = window.__rf; }""")
    page.set_viewport_size({'width': 1400, 'height': 1000}); page.wait_for_timeout(300)
    open_tab(page, 'Home')


def run():
    with sync_playwright() as p:
        browser, page, errors = open_page(p)
        for f in (mouse_and_keys, contextual, widths, collapse, every_command, keys, search_box, context_menu, kit, round_trips, kept_braces, review_fixes, fold_sweep):
            try: f(page)
            except Exception as e: check(f.__name__ + ' runs to its end', False, str(e)[:300])
        check('no page errors', not [e for e in errors if 'tree.wasm' not in e and 'TeX' not in e], errors[:4])
        browser.close()
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    run()
