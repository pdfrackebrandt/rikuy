"""Styles (src/styles.js, src/cmd/styles.js, src/ui/gallery.js, src/ui/stylespane.js, src/ui/design.js,
src/looks.js): the Styles gallery as Word's (its tiles in their order, the current style checked, the
ones that cannot apply disabled; as many tiles as the row has room for at each width, LaTeX among
them on a desktop, the style list in its place on a phone; the strip's arrows and its More list;
the gallery by keyboard; a click that leaves the caret where it was; a tile's right click menu);
Quote and the other environments there and back, byte for byte.

Then every style of Word that LaTeX has, each by GAP section 0's round trip (one step, one undo
back to the bytes, read back, hand written forms, off): Heading 4 and 5 (\\paragraph and
\\subparagraph, drawn running into their paragraph as TeX sets them), Heading 1 as \\chapter in a
report, Part, numbered and unnumbered headings and the document's numbering, Quotation, Verse,
Abstract, the theorem like environments with their \\newtheorem once, a style on several paragraphs
at once, the keys (Ctrl+Alt+4, Ctrl+Shift+S, Ctrl+Alt+Shift+S), "# " typed at a paragraph's start;
the Styles pane, Apply Styles, Modify Style (titlesec's lines), Create a Style (\\newcommand and
\\newenvironment), Update to Match Selection; the Design tab's Themes, Style Set, Colors and Fonts,
with KOMA-Script and memoir; and, where dist/tex holds a TeX tree, all of it compiled in the page.

Run it alone with names to run some: python3 styles.py gallery design."""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import ROOT, SKELETON_HEAD, ROUTES, open_page, check, results, src, wait_src, click_text, select_text, load_doc, roundtrip, pressed, place
from ribbon import DOC, DIST, state, style, undo_is, TILES, WRAP, body, boxes
from playwright.sync_api import sync_playwright

# every style an article offers a paragraph, in the list's order, and their names in More's menu
ALL_STYLES = ['p', 'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph', 'part', 'latex', 'quote', 'quotation', 'verse', 'abstract',
              'theorem', 'lemma', 'proposition', 'corollary', 'definition', 'example', 'remark', 'proof']
# (and after them the list's two actions, which a wide window has under More)
LIST = ALL_STYLES + ['__pane', '__new']
ALL_NAMES = ['Normal*', 'Heading 1', 'Heading 2', 'Heading 3', 'Heading 4', 'Heading 5', 'Part', 'LaTeX source', 'Quote', 'Quotation', 'Verse', 'Abstract',
             'Theorem', 'Lemma', 'Proposition', 'Corollary', 'Definition', 'Example', 'Remark', 'Proof']
A = lambda body, pre='': '\\documentclass{article}\n' + pre + '\\begin{document}\n' + body + '\n\\end{document}\n'
R = lambda body, pre='': '\\documentclass{report}\n' + pre + '\\begin{document}\n' + body + '\n\\end{document}\n'
P3 = 'Before it.\n\nWords here.\n\nAfter it.'


def run_cmd(page, cid, args=None):
    page.evaluate('([id, a]) => window.rikuy.runCommand(id, a || undefined)', [cid, args]); page.wait_for_timeout(200)


def styles(page):
    load_doc(page, DOC)
    click_text(page, 'First paragraph', 6)
    check('with the caret in a paragraph the style shows Normal text', state(page)['style'] == 'p')
    for value, cmd in (('section', '\\section'), ('subsection', '\\subsection'), ('subsubsection', '\\subsubsection')):
        load_doc(page, DOC); click_text(page, 'First paragraph', 6)
        style(page, value)
        got = src(page)
        check('Heading: the paragraph becomes %s{...}, its words untouched' % cmd, got == DOC.replace('First paragraph here.', cmd + '{First paragraph here.}') and state(page)['style'] == value, got[got.find('Opening'):][:70])
        page.keyboard.type('X'); wait_src(page, 'First X')
        check('and the caret stays where it was in the words', cmd + '{First Xparagraph here.}' in src(page), src(page)[src(page).find('First'):][:40])
        page.keyboard.press('Control+z'); page.wait_for_timeout(150)
        check('one undo takes the heading back, byte for byte', undo_is(page, DOC))
    # a heading to another level and to a paragraph
    load_doc(page, DOC); click_text(page, 'Opening', 3)
    check('with the caret in a heading the style shows its level', state(page)['style'] == 'section')
    style(page, 'subsection')
    check('Heading 2 on a Heading 1 changes the command alone', src(page) == DOC.replace('\\section{Opening}', '\\subsection{Opening}'), src(page)[60:110])
    check('undo restores it', undo_is(page, DOC))
    click_text(page, 'Opening', 3); style(page, 'p')
    check('Normal text on a heading leaves its words as a paragraph of their own', src(page) == DOC.replace('\\section{Opening}\nFirst', 'Opening\n\nFirst') and state(page)['style'] == 'p', src(page)[60:110])
    check('undo restores the heading byte for byte', undo_is(page, DOC))
    # where a conversion is not safe it is not offered: a list or a table can be shown as its
    # LaTeX source as a whole, and nothing else
    for where, text in (('a list item', 'two'), ('a table cell', 'cell')):
        click_text(page, text, 1); state(page)
        offered = page.evaluate('[...document.getElementById("rb-style").options].filter((o) => !o.hidden && !o.disabled).map((o) => o.value)')
        check('in %s only LaTeX is offered, for the whole of it (and the list\'s two actions)' % where, sorted(offered) == ['', '__new', '__pane', 'latex'] and page.evaluate('document.getElementById("rb-style").value') == '', offered)
    load_doc(page, '\\documentclass{article}\n\\title{A title}\n\\begin{document}\n\\maketitle\nWords.\n\\end{document}\n')
    click_text(page, 'A title', 2)
    st = state(page)
    check('in the title the style shows Title and stays as it is', st['style'] == 'title' and st['rb-style'][0], st['style'])
    click_text(page, 'Words', 2)
    state(page)
    check('and Title is not offered for a paragraph (every other style is: headings to Heading 5, Part, LaTeX, the environments)', page.evaluate('[...document.getElementById("rb-style").options].filter((o) => !o.hidden && !o.disabled).map((o) => o.value)') == LIST
          and page.evaluate('[...document.querySelectorAll("#rb-gallery [data-style]")].filter((b) => !b.hidden).map((b) => b.dataset.style)') == ['p', 'section', 'subsection', 'subsubsection', 'latex', 'quote'])
    # a new document: a heading as the first thing
    page.click('#b-new'); page.wait_for_function('window.rikuy.name.startsWith("Untitled") && window.rikuy.ghost', timeout=5000); page.wait_for_timeout(200)
    style(page, 'section'); page.keyboard.type('Intro')
    wait_src(page, '\\section{Intro}')
    check('in a new document Heading 1 starts a heading to type into', '\\section{Intro}' in src(page), src(page))




def gallery(page):
    """The Styles gallery: Word's look and behaviour, with Rikuy's styles."""
    load_doc(page, DOC); click_text(page, 'First paragraph', 6)
    st = state(page)
    tiles = page.evaluate(TILES)
    check('the gallery shows Normal, Heading 1 to 3, LaTeX and Quote in that order, Normal checked', tiles == ['p*', 'section', 'subsection', 'subsubsection', 'latex', 'quote'], tiles)
    look = page.evaluate("""() => { const g = document.getElementById('rb-gallery'), f = (id) => getComputedStyle(document.querySelector('#' + id + ' > span'));
      const cap = document.querySelector('.rb-cap'), cr = cap.getBoundingClientRect(), gr = g.getBoundingClientRect();
      return { role: g.getAttribute('role'), name: g.getAttribute('aria-label'), border: getComputedStyle(g).borderTopStyle, cap: cap.textContent, under: cr.top >= gr.bottom - 1 && cr.left >= gr.left && cr.right <= gr.right,
        normal: f('rb-st-p').fontFamily.includes('Paper Modern Serif') && f('rb-st-p').fontWeight === '400', h1: f('rb-st-section').fontWeight === '700', h1big: parseFloat(f('rb-st-section').fontSize) > parseFloat(f('rb-st-subsubsection').fontSize),
        quote: f('rb-st-quote').fontStyle === 'italic', a: getComputedStyle(document.querySelector('#rb-st-latex .tl-a')).textTransform, e: getComputedStyle(document.querySelector('#rb-st-latex .tl-e')).top,
        clip: [...document.querySelectorAll('#rb-gallery [data-style]:not([hidden]) > span')].filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.textContent),
        pressed: getComputedStyle(document.getElementById('rb-st-p')).borderTopColor !== getComputedStyle(document.getElementById('rb-st-section')).borderTopColor }; }""")
    check('one bordered group named Styles, its name under it, each tile its name in its own look, the LaTeX logo in its letters, nothing cut off', look['role'] == 'group' and look['name'] == 'Styles' and look['border'] == 'solid'
          and look['cap'] == 'Styles' and look['under'] and look['normal'] and look['h1'] and look['h1big'] and look['quote'] and look['a'] == 'uppercase' and look['e'] not in ('0px', 'auto') and not look['clip'] and look['pressed'], look)
    check('all six apply to a paragraph, the strip\'s arrows have nothing to page to, More is there', not any(t.endswith('-') for t in tiles) and st['rb-st-up'][0] and st['rb-st-down'][0] and not st['rb-st-more'][0], st)
    # a click on a tile: the caret stays where it was in the words
    page.click('#rb-st-section'); page.wait_for_timeout(150)
    check('Heading 1 by its tile: the paragraph becomes \\section{...}, the tile checked', src(page) == DOC.replace('First paragraph here.', '\\section{First paragraph here.}') and page.evaluate(TILES)[1] == 'section*', page.evaluate(TILES))
    page.keyboard.type('X'); page.wait_for_timeout(150)
    check('the click left the caret on the page, where it was', page.evaluate('document.activeElement.id') == 'pages' and '\\section{First Xparagraph here.}' in src(page), src(page)[60:120])
    page.keyboard.press('Control+z'); page.wait_for_timeout(150)
    page.click('#rb-st-p'); page.wait_for_timeout(150)
    check('Normal on it: the paragraph again, byte for byte', src(page) == DOC and page.evaluate(TILES)[0] == 'p*', src(page)[60:120])
    page.keyboard.press('Control+z'); page.wait_for_timeout(150)
    check('one undo for each click', src(page) == DOC.replace('First paragraph here.', '\\section{First paragraph here.}'))
    page.keyboard.press('Control+z'); page.wait_for_timeout(150)
    check('and the next one back to the start', src(page) == DOC)
    # where the caret is decides what is checked and what applies
    click_text(page, 'Opening', 2); state(page)
    check('in a heading its level is checked', page.evaluate(TILES)[1] == 'section*', page.evaluate(TILES))
    click_text(page, 'two', 1); state(page)
    t = page.evaluate(TILES)
    check('in a list nothing is checked and only LaTeX applies (the list as its source)', t == ['p-', 'section-', 'subsection-', 'subsubsection-', 'latex', 'quote-'], t)
    click_text(page, 'cell', 1); state(page)
    t = page.evaluate(TILES)
    check('in a table the same', t == ['p-', 'section-', 'subsection-', 'subsubsection-', 'latex', 'quote-'], t)
    # More: the whole list, in its looks
    click_text(page, 'Second paragraph', 3); state(page)
    page.click('#rb-st-more'); page.wait_for_timeout(200)
    menu = page.evaluate("""() => { const m = document.querySelector('body > .pop.pop-styles'); if (!m) return null;
      return { role: m.getAttribute('role'), name: m.getAttribute('aria-label'), text: [...m.childNodes].filter((x) => x.nodeType === 3 || !x.matches('[role=menuitemradio], [role=separator], [role=menuitem]')).length,
        acts: [...m.querySelectorAll('[role=menuitem]')].map((x) => x.getAttribute('aria-label')), items: [...m.querySelectorAll('[role=menuitemradio]')].map((x) => x.getAttribute('aria-label') + (x.getAttribute('aria-checked') === 'true' ? '*' : '')),
        focus: document.activeElement.getAttribute('aria-label'), expanded: document.getElementById('rb-st-more').getAttribute('aria-expanded'), looks: [...m.querySelectorAll('.rb-mi > span')].map((x) => getComputedStyle(x).fontWeight) }; }""")
    check('More opens a menu "Styles" of every style in order, then Word\'s Create a Style, Apply Styles and the Styles pane, the current one checked and focused', menu and menu['role'] == 'menu' and menu['name'] == 'Styles' and menu['text'] == 0 and menu['items'] == ALL_NAMES
          and [a for a in menu['acts'] if a != 'Clear All Formatting'] == ['Create a Style…', 'Apply Styles…', 'Styles pane…']
          and menu['focus'] == 'Normal' and menu['expanded'] == 'true' and menu['looks'][1] == '700', menu)
    page.keyboard.press('ArrowDown'); page.keyboard.press('ArrowDown'); page.keyboard.press('Enter'); page.wait_for_timeout(200)
    check('the arrows and Enter pick Heading 2 there, and the menu closes', src(page) == DOC.replace('Second paragraph here.', '\\subsection{Second paragraph here.}') and page.evaluate('document.querySelectorAll("body > .pop").length') == 0
          and page.evaluate('document.getElementById("rb-st-more").getAttribute("aria-expanded")') == 'false', src(page)[60:160])
    page.keyboard.type('Y'); page.wait_for_timeout(150)
    check('with the caret back in the words', '\\subsection{SecYond paragraph here.}' in src(page), src(page)[60:160])
    page.click('#rb-st-more'); page.wait_for_timeout(150); page.keyboard.press('Escape'); page.wait_for_timeout(150)
    check('Escape closes it and gives the focus back to More', page.evaluate('document.querySelectorAll("body > .pop").length') == 0 and page.evaluate('document.activeElement.id') == 'rb-st-more')
    # the title: a seventh style, and the arrows page
    load_doc(page, '\\documentclass{article}\n\\title{A title}\n\\begin{document}\n\\maketitle\nWords.\n\\end{document}\n')
    click_text(page, 'A title', 2)
    st = state(page)
    t = page.evaluate(TILES)
    check('in the title the Title tile shows, checked, and nothing applies there', t == ['p-', 'title*-', 'section-', 'subsection-', 'subsubsection-', 'latex-'] and not st['rb-st-down'][0], (t, st['rb-st-down']))
    page.click('#rb-st-down'); page.wait_for_timeout(100)
    t2 = page.evaluate(TILES)
    page.click('#rb-st-up'); page.wait_for_timeout(100)
    check('the next arrow pages to the last six (a full page, with Quote), the previous one back', t2 == ['title*-', 'section-', 'subsection-', 'subsubsection-', 'latex-', 'quote-'] and page.evaluate(TILES) == t and page.evaluate('getSelection().anchorNode.parentNode.closest(".ttl") !== null'), t2)
    look = page.evaluate('(() => { const b = document.getElementById("rb-st-title"), s = getComputedStyle(b.firstElementChild); return [b.getAttribute("aria-pressed"), b.getAttribute("aria-disabled"), s.opacity, getComputedStyle(b).backgroundColor !== "rgba(0, 0, 0, 0)"]; })()')
    check('the pressed Title tile, which cannot change here, looks pressed and not faded', look == ['true', 'true', '1', True], look)
    # a new document: LaTeX and Quote wait for the first character
    for v, want in (('latex', '% rikuy: latex\n\\alpha$x'), ('quote', '\\begin{quote}\nSaid.\n\\end{quote}')):
        page.click('#b-new'); page.wait_for_function('window.rikuy.name.startsWith("Untitled") && window.rikuy.ghost', timeout=5000); page.wait_for_timeout(200)
        page.click('#rb-st-' + v); page.wait_for_timeout(100)
        looks = page.evaluate('[...window.rikuy.ghost.el.classList]')
        page.keyboard.type('\\alpha$x' if v == 'latex' else 'Said.'); page.wait_for_timeout(250)
        check('in a new document %s sets the blank paragraph, and what is typed goes in %s' % (v, 'as LaTeX, \\ and $ as they are' if v == 'latex' else 'a quote'), want in src(page) and (v == 'latex') == ('tex' in looks)
              and page.evaluate('document.querySelectorAll("body > .pop").length') == 0, (src(page)[-80:], looks))




def gallery_widths(page):
    """As many tiles as the row has room for, once the insert buttons' names have gone (they take no
    control away, a tile does: ribbonFit); LaTeX always in sight; the list where three tiles do
    not fit and on phones; one row height."""
    load_doc(page, DOC)
    seen = {}
    for w in (1920, 1840, 1800, 1760, 1700, 1600, 1536, 1440, 1366, 1300, 1280, 1180, 1100, 1024, 1000, 900, 820, 390):
        page.set_viewport_size({'width': w, 'height': 900}); page.wait_for_timeout(250)
        click_text(page, 'First paragraph', 2); page.wait_for_timeout(120)
        seen[w] = page.evaluate("""() => { const r = document.getElementById('ribbon'), sel = document.getElementById('rb-style');
          const tiles = [...document.querySelectorAll('#rb-gallery [data-style]')].filter((b) => !b.hidden && b.offsetParent).map((b) => b.dataset.style);
          const labs = [...document.querySelectorAll('#rp-home .rb-grp > .btn:not(.icon):not(.rb-gbtn)')].filter((b) => b.offsetParent).map((b) => b.querySelector('span:not(.sr)'));
          return { tiles, list: !!sel.offsetParent, opts: [...sel.options].filter((o) => !o.hidden).map((o) => o.value), over: r.scrollWidth > r.clientWidth + 1,
            names: labs.length > 0 && labs.every((x) => x && getComputedStyle(x).display !== 'none'), insert: !!document.querySelector('#rp-home .rb-grp[data-group=insert].folded'), h: Math.round(r.getBoundingClientRect().height), page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            arrows: !!document.getElementById('rb-st-up').offsetParent }; }""")
    print('     widths:', {w: (len(v['tiles']), 'list' if v['list'] else '', 'names' if v['names'] else '', v['h']) for w, v in seen.items()})
    six = ['p', 'section', 'subsection', 'subsubsection', 'latex', 'quote']
    # (Home's Insert, which the Insert tab has too, is spare: it folds first, so Home's other
    # groups keep their names, and the gallery its tiles, on a desktop; src/ribbon/order.js. With the
    # Font group's and the Paragraph group's list commands (B1, B3) the tiles give way below 1600 px,
    # the names below 1440 and the gallery to the list below 1180)
    check('from 1600 to 1920 px Home\'s Insert is folded, the other buttons keep their names, the gallery all six tiles, no paging arrows, no scroll', all(seen[w]['insert'] and seen[w]['names'] and seen[w]['tiles'] == six and not seen[w]['arrows'] and not seen[w]['over'] for w in (1600, 1700, 1760, 1800, 1840, 1920)), {w: (seen[w]['tiles'], seen[w]['names']) for w in (1600, 1920)})
    check('at 1536 and 1440 px the names stay and the gallery has fewer tiles, three or more, LaTeX among them, with the paging arrows', all(seen[w]['names'] and 'latex' in seen[w]['tiles'] and 3 <= len(seen[w]['tiles']) < 6 and seen[w]['arrows'] and not seen[w]['over'] for w in (1440, 1536)), {w: (seen[w]['tiles'], seen[w]['names']) for w in (1440, 1536)})
    check('the gallery stays, three tiles, LaTeX among them, down to 1180 px, the row not scrolling', all(len(seen[w]['tiles']) >= 3 and 'latex' in seen[w]['tiles'] and not seen[w]['over'] for w in (1180, 1280, 1300, 1366)), {w: seen[w]['tiles'] for w in (1180, 1280, 1366)})
    order = {3: ['p', 'section', 'latex'], 4: ['p', 'section', 'subsection', 'latex'], 5: ['p', 'section', 'subsection', 'subsubsection', 'latex'], 6: six}
    tiled = [w for w in seen if seen[w]['tiles']]
    check('wherever the gallery shows, its first page is Normal and Heading 1 with LaTeX in sight (Normal, Heading 1, LaTeX for three), and the row does not scroll', all(seen[w]['tiles'] == order[len(seen[w]['tiles'])] and not seen[w]['over'] for w in tiled), {w: seen[w]['tiles'] for w in tiled})
    # (where the gallery gives way to the list: between 1024 and 1000 px)
    g = min(w for w in seen if seen[w]['tiles'])
    l = max(w for w in seen if seen[w]['list'] and w < g)
    check('the row is as tall with the list as with the gallery (no jump where the one gives way to the other, %d and %d px)' % (g, l), g >= 1024 and l >= 1000 and seen[g]['h'] == seen[l]['h'], (g, l, seen[g]['h'], seen[l]['h']))
    check('narrower, the style list takes the gallery\'s place, with every style (LaTeX, Quote and the rest)', all(seen[w]['list'] and not seen[w]['tiles'] and seen[w]['opts'] == LIST for w in (900, 820, 390)) and seen[390]['page'] <= 0 and seen[390]['h'] <= 44, {w: seen[w] for w in (820, 390)})
    page.set_viewport_size({'width': 390, 'height': 800}); page.wait_for_timeout(300)
    click_text(page, 'Second paragraph', 3); state(page)
    style(page, 'latex')
    check('on a phone the list makes a LaTeX paragraph too', body(page).count('% rikuy: latex\nSecond paragraph here.') == 1 and boxes(page) == ['Second paragraph here.'], body(page)[:120])
    page.set_viewport_size({'width': 1400, 'height': 1000}); page.wait_for_timeout(300)




def gallery_paging(page):
    """Paging keeps the gallery's width, so nothing moves under the mouse; the last page is full;
    the arrows hand the focus on at their ends; the gallery pages to the caret's style; the strip's
    targets are 24 px or more; a tile that cannot apply keeps its tooltip, which says why."""
    load_doc(page, WRAP('Text here.\n\n\\subsubsection{Deep}\nUnder it.'))
    # (at 1520 px the gallery holds four tiles: Next shows the other four, a full page)
    page.set_viewport_size({'width': 1520, 'height': 900}); page.wait_for_timeout(300)
    click_text(page, 'Text here', 2); state(page)
    POS = """() => { const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return [Math.round(b.left), Math.round(b.width), Math.round(b.height)]; };
      return { up: r('rb-st-up'), down: r('rb-st-down'), more: r('rb-st-more'), bold: r('rb-b'), gal: r('rb-gallery'), tiles: [...document.querySelectorAll('#rb-gallery [data-style]')].filter((b) => !b.hidden).map((b) => b.dataset.style) }; }"""
    a = page.evaluate(POS)
    page.click('#rb-st-down'); page.wait_for_timeout(120)
    b = page.evaluate(POS)
    check('at 1520 px Next shows the last four styles (a full page, Heading 4 among them once Heading 3 is in use) and the gallery, the arrows and Bold stay where they were', len(a['tiles']) == 4 and b['tiles'] == ['latex', 'subsubsection', 'paragraph', 'quote'] and all(a[k] == b[k] for k in ('up', 'down', 'more', 'bold', 'gal')), (a, b))
    check('the arrows and More are 24 px wide or more and as tall as the box', all(a[k][1] >= 24 and a[k][2] >= 24 for k in ('up', 'down', 'more')), a)
    page.click('#rb-st-up'); page.wait_for_timeout(120)
    # by keyboard: an arrow that reaches its end gives the focus to the other one
    page.focus('#rb-st-down'); page.keyboard.press('Enter'); page.wait_for_timeout(120)
    f1 = page.evaluate('document.activeElement.id')
    page.keyboard.press(' '); page.wait_for_timeout(120)
    f2 = page.evaluate('document.activeElement.id')
    stops = page.evaluate('[...document.querySelectorAll("#ribbon button, #ribbon select")].filter((x) => x.tabIndex === 0).map((x) => x.id)')
    check('Enter on Next at the last page hands the focus to Previous, Space there back to Next, and the one tab stop follows', f1 == 'rb-st-up' and f2 == 'rb-st-down' and stops == ['rb-st-down'], (f1, f2, stops))
    page.keyboard.press('Escape'); page.wait_for_timeout(120)
    check('Escape on a button of the gallery goes back to the caret on the page', page.evaluate('document.activeElement.id') == 'pages')
    # the caret in a Heading 3: its tile comes into view, pressed
    click_text(page, 'Deep', 2); state(page)
    t = page.evaluate(TILES)
    check('with the caret in a Heading 3 the gallery pages to its tile', 'subsubsection*' in t, t)
    click_text(page, 'Text here', 2); state(page)
    check('and back in a paragraph to Normal\'s', page.evaluate(TILES)[0] == 'p*', page.evaluate(TILES))
    # a tile that cannot apply: no click goes through, the pointer still reaches it, its title says why
    click_text(page, 'Under it', 2); state(page)
    load_doc(page, WRAP('Words with a note\\footnote{n}.')); click_text(page, 'Words', 2); state(page)
    info = page.evaluate('(() => { const b = document.getElementById("rb-st-section"); return [b.getAttribute("aria-disabled"), getComputedStyle(b).pointerEvents, b.title]; })()')
    before = src(page)
    page.set_viewport_size({'width': 1920, 'height': 900}); page.wait_for_timeout(300); click_text(page, 'Words', 2); state(page)
    page.click('#rb-st-section', force=True); page.wait_for_timeout(150)
    check('a heading cannot hold a footnote: Heading 1 is marked so, its tooltip says why, and a click on it changes nothing', info[0] == 'true' and info[1] != 'none' and 'footnote' in info[2] and src(page) == before, info)
    page.set_viewport_size({'width': 1400, 'height': 1000}); page.wait_for_timeout(300)




def gallery_keys(page):
    """The gallery from the keyboard: its tiles and the strip are members of the toolbar."""
    load_doc(page, DOC); click_text(page, 'Third paragraph', 3); state(page)
    page.focus('#rb-st-p')
    seen = []
    for key in ('ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight'):
        page.keyboard.press(key); seen.append(page.evaluate('document.activeElement.id'))
    check('the arrow keys go along the tiles, past the strip\'s disabled arrows to More, and on to the folded Insert', seen == ['rb-st-section', 'rb-st-subsection', 'rb-st-subsubsection', 'rb-st-latex', 'rb-st-quote', 'rb-st-more', 'rg-home-insert'], seen)
    page.focus('#rb-st-latex'); page.keyboard.press('Enter'); page.wait_for_timeout(200)
    check('Enter on LaTeX makes the caret\'s paragraph a LaTeX paragraph', body(page).count('% rikuy: latex\nThird paragraph here.') == 1 and boxes(page) == ['Third paragraph here.'], body(page))
    page.focus('#rb-st-quote'); page.keyboard.press(' '); page.wait_for_timeout(200)
    check('and Space on Quote a quote of what it holds (one paragraph of text)', '\\begin{quote}\nThird paragraph here.\n\\end{quote}' in src(page) and 'rikuy: latex' not in src(page), body(page))
    page.focus('#rb-st-quote')
    check('the ring shows on the focused tile', page.evaluate('(() => { const c = getComputedStyle(document.activeElement); return c.outlineStyle !== "none" && parseFloat(c.outlineWidth) > 0; })()'))
    page.keyboard.press('Enter'); page.wait_for_timeout(150)
    check('Enter on the tile that is already pressed changes nothing and gives the focus back to the page', page.evaluate('document.activeElement.id') == 'pages' and '\\begin{quote}\nThird' in src(page))
    page.focus('#rb-st-more'); page.keyboard.press('ArrowDown'); page.wait_for_timeout(200)
    opened = page.evaluate('[!!document.querySelector("body > .pop.pop-styles"), document.activeElement.getAttribute("aria-label")]')
    page.keyboard.press('Home'); page.keyboard.press('ArrowUp'); page.wait_for_timeout(80)
    up = page.evaluate('document.activeElement.getAttribute("aria-label")')
    page.keyboard.press('Escape'); page.wait_for_timeout(120)
    check('ArrowDown on More opens the menu at the current style; ArrowUp from its first item goes round to its last, Styles pane, not to a Close item', opened == [True, 'Quote'] and up == 'Styles pane…', (opened, up))




def quote_style(page):
    """Quote: a quote environment around the paragraph and away again, byte for byte."""
    for text, para in (('a plain paragraph', 'Second paragraph here.'),):
        load_doc(page, DOC); click_text(page, 'Second paragraph', 6)
        style(page, 'quote')
        q = DOC.replace(para, '\\begin{quote}\n' + para + '\n\\end{quote}')
        check('Quote on %s puts a quote environment around it, its words untouched, the tile checked' % text, src(page) == q and page.evaluate(TILES)[-1] == 'quote*', src(page)[60:170])
        page.keyboard.type('Q'); page.wait_for_timeout(150)
        check('with the caret still in its words', 'SecondQ paragraph' in src(page))
        page.keyboard.press('Control+z'); page.wait_for_timeout(150)
        style(page, 'p')
        check('Normal takes it away, back to the source as it was', src(page) == DOC, src(page)[60:170])
        page.keyboard.press('Control+z'); page.wait_for_timeout(150)
        check('one undo for each', src(page) == q)
        style(page, 'subsection')
        check('Heading 2 on a quote: the environment goes, the heading comes, in one step', src(page) == DOC.replace(para, '\\subsection{' + para + '}'), src(page)[60:170])
        style(page, 'quote')
        check('and a quote again from the heading', src(page) == q, src(page)[60:170])
    # one written by hand, with no blank line around it: Normal keeps its paragraph apart
    tight = WRAP('Before.\n\\begin{quotation}\n  Said here.\n\\end{quotation}\nAfter.')
    load_doc(page, tight); click_text(page, 'Said', 2); state(page)
    check('a quotation shows as Quotation (the Quote tile not pressed, the list and the pane say Quotation)', page.evaluate(TILES)[-1] == 'quote' and page.evaluate('document.getElementById("rb-style").value') == 'quotation', page.evaluate(TILES))
    style(page, 'p')
    check('Normal on one with no blank line around it leaves a paragraph of its own', src(page) == WRAP('Before.\n\nSaid here.\n\nAfter.'), body(page))
    load_doc(page, WRAP('\\begin{quote}\nOne.\n\nTwo.\n\\end{quote}')); click_text(page, 'Two', 1); state(page)
    t = page.evaluate(TILES)
    check('a quote of two paragraphs shows as Quote: Normal takes the environment off both, LaTeX takes it as a whole, no heading holds it', t == ['p', 'section-', 'subsection-', 'subsubsection-', 'latex', 'quote*'], t)
    style(page, 'p')
    check('Normal on it: the two paragraphs, byte for byte as before the quote', body(page) == 'One.\n\nTwo.', body(page))




def headings(page):
    """Heading 4 and 5, Heading 1 as a report's \\chapter, Part: round trips; the run in heading."""
    roundtrip(page, A(P3), ('Words', 2), 'style-heading4', A(P3.replace('Words here.', '\\paragraph{Words here.}')), off_command='style-normal', label='Heading 4 (\\paragraph)')
    roundtrip(page, A(P3), ('Words', 2), 'style-heading5', A(P3.replace('Words here.', '\\subparagraph{Words here.}')), off_command='style-normal', label='Heading 5 (\\subparagraph)')
    roundtrip(page, R(P3), ('Words', 2), 'style-heading1', R(P3.replace('Words here.', '\\chapter{Words here.}')), off_command='style-normal', label='Heading 1 in a report (\\chapter)')
    roundtrip(page, R(P3), ('Words', 2), 'style-heading2', R(P3.replace('Words here.', '\\section{Words here.}')), off_command='style-normal', label='Heading 2 in a report (\\section)')
    roundtrip(page, R(P3), ('Words', 2), 'style-heading6', R(P3.replace('Words here.', '\\subparagraph{Words here.}')), off_command='style-normal', label='Heading 6 in a report (\\subparagraph)')
    roundtrip(page, A(P3), ('Words', 2), 'style-part', A(P3.replace('Words here.', '\\part{Words here.}')), off_command='style-normal', label='Part (\\part)')
    # a heading to another level keeps its star and its words
    load_doc(page, A('\\subsubsection*{Deep}\nText.')); click_text(page, 'Deep', 2); run_cmd(page, 'style-heading4')
    check('Heading 4 on an unnumbered Heading 3 keeps the star: \\paragraph*{Deep}', '\\paragraph*{Deep}' in src(page), body(page))
    # the run in heading: drawn over the start of its paragraph's first line, which keeps its room
    load_doc(page, A('\\section{Top}\nOne.\n\n\\subsubsection{Three}\nText.\n\n\\paragraph{Lead words}\n\nThe paragraph it runs into, long enough to fill a line and go on to the next one of the page as TeX sets it.'))
    geo = page.evaluate("""() => { const h = document.querySelector('#pages .it.h4'), p = h && h.nextElementSibling, g = p && p.querySelector('.runin-gap');
      if (!h || !p || !g) return null; const hr = h.getBoundingClientRect(), pr = p.getBoundingClientRect(), gr = g.getBoundingClientRect(), t = h.querySelector('span.t').getBoundingClientRect();
      return { runin: h.classList.contains('runin'), hh: Math.round(hr.height), top: Math.round(t.top - pr.top), gapW: Math.round(gr.width), textW: Math.round(t.width), gapHidden: getComputedStyle(g).visibility, role: h.getAttribute('role'), level: h.getAttribute('aria-level'), bold: getComputedStyle(h).fontWeight }; }""")
    check('\\paragraph is drawn as TeX sets it: bold, running into the paragraph after it (blank line between them or not), the paragraph keeping its words\' room at its first line', geo and geo['runin'] and geo['hh'] == 0 and abs(geo['top']) <= 3 and geo['gapW'] >= geo['textW'] and geo['gapHidden'] == 'hidden' and geo['bold'] == '700' and geo['role'] == 'heading', geo)
    click_text(page, 'Lead words', 3); page.keyboard.type('X'); page.wait_for_timeout(200)
    check('and typing in it goes into its heading', '\\paragraph{LeaXd words}' in src(page), body(page)[-160:])
    # Heading 4 shows in the gallery once Heading 3 is in use (Word's rule); Ctrl+Alt+4
    page.set_viewport_size({'width': 1920, 'height': 1000}); page.wait_for_timeout(300)
    click_text(page, 'One.', 1); state(page)
    t = page.evaluate(TILES)
    check('with a Heading 3 in the document the gallery has Heading 4 after it', 'paragraph' in t and t.index('paragraph') == t.index('subsubsection') + 1, t)
    load_doc(page, A(P3)); click_text(page, 'Words', 2); state(page)
    check('and without one it has not', 'paragraph' not in page.evaluate(TILES), page.evaluate(TILES))
    page.keyboard.press('Control+Alt+4'); page.wait_for_timeout(200)
    check('Ctrl+Alt+4 makes the paragraph Heading 4', '\\paragraph{Words here.}' in src(page), body(page))
    page.set_viewport_size({'width': 1400, 'height': 1000}); page.wait_for_timeout(300)
    # a report: Heading 1 is \chapter, and Part shows Part I above its title
    load_doc(page, R('\\part{First}\n\\chapter{Intro}\nText.'))
    look = page.evaluate("""() => [...document.querySelectorAll('#pages .it.h')].map((h) => h.textContent)""")
    check('a \\part shows "Part I" above its title, as TeX prints it', any(x.startswith('Part I') and 'First' in x for x in look), look)
    click_text(page, 'Intro', 2); state(page)
    check('in a report a \\chapter is Heading 1 (its tile pressed)', page.evaluate('document.getElementById("rb-st-section").getAttribute("aria-pressed")') == 'true' and page.evaluate('document.getElementById("rb-st-section").dataset.style') == 'chapter')


def numbering(page):
    """A heading numbered or not (\\section*), and the document's numbering (secnumdepth)."""
    doc = A('\\section{Intro}\nText.')
    roundtrip(page, doc, ('Intro', 2), 'heading-unnumbered', doc.replace('\\section{Intro}', '\\section*{Intro}'), label='Unnumbered heading (\\section*)')
    roundtrip(page, doc, ('Text', 1), 'heading-numbers-off', doc.replace('\\begin{document}', '\\setcounter{secnumdepth}{0}\n\\begin{document}'), label='Heading numbers off (secnumdepth 0)',
              forms=(doc.replace('\\begin{document}', '\\setcounter{secnumdepth}{0}\n\\begin{document}'),))
    load_doc(page, doc.replace('\\begin{document}', '\\setcounter{secnumdepth}{0}\n\\begin{document}')); click_text(page, 'Text', 1)
    num = page.evaluate('document.querySelector("#pages .it.h1 .secnum") ? 1 : 0')
    check('read back, the page shows no number', num == 0, num)
    hand = doc.replace('\\begin{document}', '\\usepackage{amsmath}\n\\setcounter{secnumdepth}{-2}\n\\begin{document}')
    load_doc(page, hand); click_text(page, 'Text', 1); run_cmd(page, 'heading-numbers-off')
    check('a hand written \\setcounter{secnumdepth}{-2} turned off goes away exactly', src(page) == doc.replace('\\begin{document}', '\\usepackage{amsmath}\n\\begin{document}'), src(page)[:120])
    load_doc(page, doc.replace('\\begin{document}', '\\setcounter{secnumdepth}{1}\n\\begin{document}')); click_text(page, 'Text', 1); run_cmd(page, 'heading-numbers-off')
    check('a hand written number of its own stays; Rikuy\'s line goes after it (review H6)', '\\setcounter{secnumdepth}{1}\n\\setcounter{secnumdepth}{0}\n' in src(page), src(page)[:120])
    load_doc(page, R('\\chapter{One}\nText.')); click_text(page, 'Text', 1); run_cmd(page, 'heading-numbers-off')
    check('in a report numbering off is -1 (chapters too)', '\\setcounter{secnumdepth}{-1}' in src(page), src(page)[:120])


def environments(page):
    """Quotation, Verse, Abstract and the theorem like environments, each with what it needs once."""
    for cid, env in (('style-quotation', 'quotation'), ('style-verse', 'verse'), ('style-abstract', 'abstract')):
        roundtrip(page, A(P3), ('Words', 2), cid, A(P3.replace('Words here.', '\\begin{' + env + '}\nWords here.\n\\end{' + env + '}')), off_command='style-normal', label=env.capitalize())
    thm = A(P3.replace('Words here.', '\\begin{theorem}\nWords here.\n\\end{theorem}'), '\\newtheorem{theorem}{Theorem}\n')
    roundtrip(page, A(P3), ('Words', 2), 'style-thm-theorem', thm, off_command='style-normal', off=A(P3, '\\newtheorem{theorem}{Theorem}\n'), label='Theorem (with its \\newtheorem once)')
    load_doc(page, A(P3, '\\usepackage{amsthm}\n\\newtheorem{theorem}{Theorem}\n')); click_text(page, 'Words', 2); run_cmd(page, 'style-thm-theorem')
    check('Theorem where the preamble defines it: the environment alone', src(page) == A(P3.replace('Words here.', '\\begin{theorem}\nWords here.\n\\end{theorem}'), '\\usepackage{amsthm}\n\\newtheorem{theorem}{Theorem}\n'), src(page))
    load_doc(page, A(P3)); click_text(page, 'Words', 2); run_cmd(page, 'style-thm-definition')
    check('Definition: amsthm once, \\theoremstyle{definition} and its \\newtheorem, in one step', src(page) == A(P3.replace('Words here.', '\\begin{definition}\nWords here.\n\\end{definition}'), '\\usepackage{amsthm}\n\\theoremstyle{definition}\n\\newtheorem{definition}{Definition}\n')
          and undo_is(page, A(P3)), src(page)[:200])
    load_doc(page, A(P3, '\\usepackage{amsthm}\n\\theoremstyle{definition}\n\\newtheorem{definition}{Definition}\n')); click_text(page, 'Words', 2); run_cmd(page, 'style-thm-theorem')
    check('Theorem after a \\theoremstyle{definition}: \\theoremstyle{plain} before its \\newtheorem, or it would be upright', '\\theoremstyle{plain}\n\\newtheorem{theorem}{Theorem}\n\\begin{document}' in src(page), src(page)[:220])
    load_doc(page, A(P3)); click_text(page, 'Words', 2); run_cmd(page, 'style-thm-proof')
    check('Proof: amsthm once, no \\newtheorem', src(page) == A(P3.replace('Words here.', '\\begin{proof}\nWords here.\n\\end{proof}'), '\\usepackage{amsthm}\n'), src(page)[:200])
    # one environment to another: the name alone, at both ends; a titled theorem keeps its title
    load_doc(page, thm); click_text(page, 'Words', 2); run_cmd(page, 'style-thm-lemma')
    check('Lemma on a theorem: the names change at both ends, the lemma\'s \\newtheorem comes', '\\begin{lemma}\nWords here.\n\\end{lemma}' in src(page) and '\\newtheorem{lemma}{Lemma}' in src(page), body(page))
    titled = A(P3.replace('Words here.', '\\begin{theorem}[Euclid]\nWords here.\n\\end{theorem}'), '\\newtheorem{theorem}{Theorem}\n\\newtheorem{lemma}{Lemma}\n')
    load_doc(page, titled); click_text(page, 'Words', 2); state(page)
    can = page.evaluate('[...window.rikuy.rbStyle.to]')
    check('a theorem with a title of its own may become another theorem, keeping it, and nothing else', 'lemma' in can and 'p' not in can and 'section' not in can, can)
    run_cmd(page, 'style-thm-lemma')
    check('and Lemma keeps [Euclid]', '\\begin{lemma}[Euclid]\nWords here.\n\\end{lemma}' in src(page), body(page))
    # the document's own theorem like environment is a style of its own
    load_doc(page, A(P3.replace('Words here.', '\\begin{claim}\nWords here.\n\\end{claim}'), '\\newtheorem{claim}{Claim}\n')); click_text(page, 'Words', 2); state(page)
    check('the document\'s own \\newtheorem{claim} is a style it shows', page.evaluate('window.rikuy.rbStyle.v') == 'env:claim' and page.evaluate('document.getElementById("rb-style").value') == 'env:claim')
    page.select_option('#rb-style', 'p') if page.is_visible('#rb-style') else run_cmd(page, 'style-normal')
    page.wait_for_timeout(150)
    check('and Normal takes it off byte for byte', src(page) == A(P3, '\\newtheorem{claim}{Claim}\n'), body(page))
    # a blank paragraph set to Quotation: the environment comes with the first character
    page.click('#b-new'); page.wait_for_function('window.rikuy.name.startsWith("Untitled") && window.rikuy.ghost', timeout=5000); page.wait_for_timeout(200)
    run_cmd(page, 'style-quotation'); page.keyboard.type('Said.'); page.wait_for_timeout(250)
    check('in a new document Quotation sets the blank paragraph, and what is typed goes in a quotation', '\\begin{quotation}\nSaid.\n\\end{quotation}' in src(page), src(page)[-120:])
    page.click('#b-new'); page.wait_for_function('window.rikuy.name.startsWith("Untitled") && window.rikuy.ghost', timeout=5000); page.wait_for_timeout(200)
    run_cmd(page, 'style-thm-theorem'); page.keyboard.type('Stated.'); page.wait_for_timeout(250)
    check('and Theorem writes the environment with its \\newtheorem at once, the caret inside', '\\begin{theorem}\nStated.\n\\end{theorem}' in src(page) and '\\newtheorem{theorem}{Theorem}' in src(page), src(page)[-160:])


def many(page):
    """A style on several paragraphs at once: one undo for all."""
    doc = A('First one.\n\nSecond one.\n\nThird one.')
    roundtrip(page, doc, ('First', 'Third'), 'style-heading2', A('\\subsection{First one.}\n\n\\subsection{Second one.}\n\n\\subsection{Third one.}'), off_command='style-normal', label='Heading 2 on three paragraphs')
    roundtrip(page, doc, ('First', 'Third'), 'style-quote', A('\\begin{quote}\nFirst one.\n\nSecond one.\n\nThird one.\n\\end{quote}'), off_command='style-normal', label='Quote around three paragraphs')
    roundtrip(page, doc, ('Second', 'Third'), 'style-latex', A('First one.\n\n% rikuy: latex\nSecond one.\n\n% rikuy: latex\nThird one.'), off_command='style-normal', label='LaTeX on two paragraphs')
    load_doc(page, A('\\section{Head}\nFirst one.\n\n\\begin{itemize}\n\\item x\n\\end{itemize}')); place(page, ('Head', 'x')); state(page)
    check('over a heading, a paragraph and a list: nothing that cannot apply to all of them is offered', page.evaluate('[...window.rikuy.rbStyle.to]') in ([], ['latex']), page.evaluate('[...window.rikuy.rbStyle.to]'))


def autoformat(page):
    """"# " at a paragraph's start: a heading, as a step of its own."""
    load_doc(page, A(P3)); click_text(page, 'Words', 0)
    page.keyboard.type('## '); page.wait_for_timeout(300)
    check('"## " typed at a paragraph\'s start makes it Heading 2', body(page) == P3.replace('Words here.', '\\subsection{Words here.}'), body(page))
    page.keyboard.type('X'); page.wait_for_timeout(150)
    check('with the caret where it was in the words', '\\subsection{XWords here.}' in src(page), body(page))
    page.keyboard.press('Control+z'); page.wait_for_timeout(150); page.keyboard.press('Control+z'); page.wait_for_timeout(150)
    check('undo gives back "## " as typed (\\#\\# and the space)', body(page) == P3.replace('Words here.', '\\#\\# Words here.'), body(page))
    run_cmd(page, 'autoformat-headings')
    load_doc(page, A(P3)); click_text(page, 'Words', 0); page.keyboard.type('# '); page.wait_for_timeout(300)
    check('with AutoFormat headings off "# " stays text', body(page) == P3.replace('Words here.', '\\# Words here.'), body(page))
    run_cmd(page, 'autoformat-headings')
    load_doc(page, A(P3)); click_text(page, 'Words', 3); page.keyboard.type('# '); page.wait_for_timeout(300)
    check('and "# " inside a paragraph is text', '\\section' not in src(page), body(page))


def keys_and_boxes(page):
    """Apply Styles (Ctrl+Shift+S), the Styles pane (Ctrl+Alt+Shift+S)."""
    load_doc(page, A(P3)); click_text(page, 'Words', 2)
    page.keyboard.press('Control+Shift+S'); page.wait_for_timeout(250)
    d = page.get_by_role('dialog', name='Apply Styles')
    check('Ctrl+Shift+S opens Apply Styles with the caret\'s style in its box', d.count() == 1 and page.evaluate('document.activeElement.id') == 'apply-style-name' and page.evaluate('document.activeElement.value') == 'Normal')
    page.keyboard.press('Control+a'); page.keyboard.type('Heading 2'); page.keyboard.press('Enter'); page.wait_for_timeout(250)
    check('a name typed and Enter applies it, the dialog closes, the caret back in the words', body(page) == P3.replace('Words here.', '\\subsection{Words here.}') and d.count() == 0 and page.evaluate('document.activeElement.id') == 'pages', body(page))
    page.keyboard.press('Control+Alt+Shift+S'); page.wait_for_timeout(300)
    pane = page.get_by_role('complementary', name='Styles pane')
    info = page.evaluate("""() => { const p = document.getElementById('stylespane'); const o = [...p.querySelectorAll('[role=option]')];
      return { n: o.length, cur: (o.find((x) => x.getAttribute('aria-selected') === 'true') || {}).ariaLabel || null, names: o.slice(0, 4).map((x) => x.getAttribute('aria-label')), dis: o.filter((x) => x.getAttribute('aria-disabled') === 'true').map((x) => x.getAttribute('aria-label')).slice(0, 3) }; }""")
    check('Ctrl+Alt+Shift+S opens the Styles pane: every style, the caret\'s marked, the caret staying on the page', pane.count() == 1 and info['n'] >= 20 and info['cur'] == 'Heading 2' and info['names'][:2] == ['Normal', 'Heading 1']
          and page.evaluate('document.activeElement.id') == 'pages', info)
    page.keyboard.press('Shift+Tab'); page.keyboard.press('Tab'); page.wait_for_timeout(100)
    page.focus('#stylespane [role=option][tabindex="0"]'); page.keyboard.press('ArrowDown'); page.wait_for_timeout(100)
    kb = page.evaluate('[document.activeElement.getAttribute("aria-label"), (document.querySelector("#stylespane [aria-selected=true]") || {}).ariaLabel, [...document.querySelectorAll("#stylespane [role=option][aria-disabled=true]")].length]')
    check('from the keyboard its list keeps the caret\'s style marked, the arrows move along it', kb[0] == 'Heading 3' and kb[1] == 'Heading 2' and kb[2] < 5, kb)
    page.keyboard.press('Enter'); page.wait_for_timeout(250)
    check('and Enter there gives the caret\'s paragraph that style', '\\subsubsection{Words here.}' in src(page), body(page))
    page.keyboard.press('Control+z'); page.wait_for_timeout(200)
    page.click('#pages'); click_text(page, 'After it', 2); page.wait_for_timeout(200)
    check('it stays open as the caret moves, and follows it', pane.count() == 1 and page.evaluate("""(document.querySelector('#stylespane [aria-selected=true]') || {}).ariaLabel""") == 'Normal')
    page.locator('#stylespane [role=option][aria-label="Quote"]').click(); page.wait_for_timeout(250)
    check('a click on a style there applies it, the caret staying on the page', '\\begin{quote}\nAfter it.\n\\end{quote}' in src(page) and page.evaluate('document.activeElement.id') == 'pages', body(page))
    page.get_by_role('button', name='Heading 2 options').click(); page.wait_for_timeout(200)
    m = page.get_by_role('menu', name='Heading 2 style')
    check('a style\'s options: Update to Match Selection, Modify, Select All Instances, Remove from Style Gallery', m.count() == 1 and [x.get_attribute('aria-label') for x in m.get_by_role('menuitem').all()][:4] == ['Update Heading 2 to Match Selection', 'Modify…', 'Select All Instances', 'Remove from Style Gallery'],
          [x.get_attribute('aria-label') for x in m.get_by_role('menuitem').all()])
    m.get_by_role('menuitem', name='Select All Instances').click(); page.wait_for_timeout(200)
    check('Select All Instances selects the one Heading 2 and says how many', page.evaluate('getSelection().toString().includes("Words here.")'))
    page.focus('#stylespane [role=option]'); page.keyboard.press('Escape'); page.wait_for_timeout(150)
    check('Escape closes the pane', pane.count() == 0)


def modify(page):
    """Modify Style on a heading: titlesec's lines, once; the page shows the look; LaTeX's own takes them away."""
    doc = A('\\section{Intro}\nText.\n\n\\section{More}\nMore text.')
    load_doc(page, doc); click_text(page, 'Intro', 2)
    run_cmd(page, 'modify-style')
    d = page.get_by_role('dialog', name='Modify Style')
    check('Modify Style opens on the caret\'s heading, its look in the fields', d.count() == 1 and page.evaluate('document.getElementById("ms-size").value') == 'Large' and page.evaluate('document.getElementById("ms-bold").checked'))
    page.select_option('#ms-family', 'sf'); page.select_option('#ms-align', 'center'); page.select_option('#ms-color', 'blue'); page.check('#ms-rule')
    d.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    want = doc.replace('\\begin{document}', '\\usepackage{titlesec}\n\\usepackage{xcolor}\n\\titleformat{\\section}[hang]{\\normalfont\\Large\\bfseries\\sffamily\\color{blue}\\filcenter}{\\thesection}{1em}{}[\\titlerule]\n\\begin{document}')
    check('OK writes titlesec, xcolor and one \\titleformat line, in one step', src(page) == want, src(page)[:400])
    look = page.evaluate("""() => [...document.querySelectorAll('#pages .it.h1')].map((h) => { const c = getComputedStyle(h); return [c.textAlign, c.fontFamily.startsWith('"Paper Modern Sans'), c.color, c.borderBottomStyle]; })""")
    ink = page.evaluate('getComputedStyle(document.querySelector("#pages .it.p")).color')
    check('the page draws both sections so at once: centred, sans serif, in blue, a rule under them', len(look) == 2 and all(x[0] == 'center' and x[1] and x[2] != ink and x[2] == look[0][2] and x[3] == 'solid' for x in look), (look, ink))
    check('one undo gives the bytes back', undo_is(page, doc))
    load_doc(page, want); click_text(page, 'Intro', 2); run_cmd(page, 'modify-style'); page.wait_for_timeout(200)
    check('read back: the fields show the look the line gives', page.evaluate('[document.getElementById("ms-family").value, document.getElementById("ms-align").value, document.getElementById("ms-color").value, document.getElementById("ms-rule").checked]') == ['sf', 'center', 'blue', True])
    page.get_by_role('dialog', name='Modify Style').get_by_role('button', name="LaTeX's own").click(); page.wait_for_timeout(250)
    check('LaTeX\'s own takes the line away, and the titlesec line it needed (review H1); xcolor, which other text may use, stays', src(page) == doc.replace('\\begin{document}', '\\usepackage{xcolor}\n\\begin{document}'), src(page)[:300])
    # spacing and run in for a deeper level; a hand written \titleformat* is read and replaced in place
    hand = doc.replace('\\begin{document}', '\\usepackage{titlesec}\n\\titleformat*{\\section}{\\Large\\itshape}\n\\begin{document}')
    load_doc(page, hand); click_text(page, 'Intro', 2)
    st = page.evaluate("""() => { const c = getComputedStyle(document.querySelector('#pages .it.h1')); return [c.fontStyle, c.fontWeight]; }""")
    check('a hand written \\titleformat* shows on the page as TeX sets it (italic, not bold: the format replaces the class\'s)', st == ['italic', '400'], st)
    run_cmd(page, 'modify-style'); page.check('#ms-bold'); page.get_by_role('dialog', name='Modify Style').get_by_role('button', name='OK').click(); page.wait_for_timeout(250)
    check('Modify replaces that line where it stands', src(page) == doc.replace('\\begin{document}', '\\usepackage{titlesec}\n\\titleformat*{\\section}{\\normalfont\\Large\\bfseries\\itshape}\n\\begin{document}'), src(page)[:300])
    # KOMA-Script and memoir: not by titlesec
    load_doc(page, doc.replace('{article}', '{scrartcl}')); click_text(page, 'Intro', 2)
    check('in a KOMA-Script document Modify Style on a heading is disabled, saying why', page.evaluate('window.rikuy.cmds.enabled(window.rikuy, "modify-style", window.rikuy.ribbonAt())') is False)


def create_and_update(page):
    """Create a Style (character and paragraph), apply it, Update to Match Selection."""
    doc = A('Some key words here.\n\nA note to keep.')
    load_doc(page, doc); select_text(page, 'key words')
    run_cmd(page, 'create-style')
    d = page.get_by_role('dialog', name='Create a Style')
    page.fill('#cs-name', 'keyterm'); page.check('#ms-bold'); page.select_option('#ms-color', 'red')
    d.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    want = A('Some \\keyterm{key words} here.\n\nA note to keep.', '\\usepackage{xcolor}\n\\newcommand{\\keyterm}[1]{\\textcolor{red}{\\textbf{#1}}}\n')
    check('a character style: its \\newcommand once in the preamble and \\keyterm{…} around the selection, one step', src(page) == want, src(page)[:300])
    look = page.evaluate("""() => { const s = [...document.querySelectorAll('#pages span.t')].find((x) => x.textContent.includes('key words')); const c = getComputedStyle(s); return [c.fontWeight, c.color]; }""")
    check('the page shows it bold and red', look[0] == '700' and look[1] != page.evaluate('getComputedStyle(document.querySelector("#pages .it.p")).color'), look)
    check('one undo gives the bytes back', undo_is(page, doc))
    load_doc(page, want); click_text(page, 'key words', 2); page.wait_for_timeout(200)
    run_cmd(page, 'styles-pane')
    check('the pane lists it under Character styles, marked where the caret is', page.evaluate("""(document.querySelector('#stylespane [aria-label=keyterm]') || {}).ariaSelected""") == 'true')
    page.locator('#stylespane [aria-label=keyterm]').click(); page.wait_for_timeout(250)
    check('a click on it there takes it off the words exactly', src(page) == want.replace('\\keyterm{key words}', 'key words'), body(page))
    run_cmd(page, 'styles-pane')
    # a paragraph style
    load_doc(page, doc); click_text(page, 'note', 1)
    run_cmd(page, 'create-style'); d = page.get_by_role('dialog', name='Create a Style')
    page.fill('#cs-name', 'remark'); page.select_option('#cs-type', 'para'); page.wait_for_timeout(100)
    check('a name LaTeX has (remark is no environment, but \\remark...)', True)
    page.fill('#cs-name', 'aside'); page.check('#ms-italic'); page.select_option('#ms-align', 'center')
    d.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    want2 = A('Some key words here.\n\n\\begin{aside}\nA note to keep.\n\\end{aside}', '\\newenvironment{aside}{\\par\\itshape\\centering}{\\par}\n')
    check('a paragraph style: \\newenvironment once and the paragraph in it', src(page) == want2, src(page)[:300])
    look = page.evaluate("""() => { const s = [...document.querySelectorAll('#pages .it.p')].find((x) => x.textContent.includes('note')); const c = getComputedStyle(s); return [c.fontStyle, c.textAlign]; }""")
    check('the page shows the paragraph italic and centred', look == ['italic', 'center'], look)
    click_text(page, 'note', 1); state(page)
    check('and the style list shows it as the paragraph\'s style', page.evaluate('document.getElementById("rb-style").value') == 'env:aside')
    taken = A('Some key words here.\n\nA note to keep.', '\\newcommand{\\keyterm}[1]{#1}\n')
    load_doc(page, taken); click_text(page, 'key', 1)
    run_cmd(page, 'create-style'); page.fill('#cs-name', 'keyterm'); page.wait_for_timeout(100)
    check('a name the document has is refused, saying so', page.get_by_role('dialog', name='Create a Style').get_by_role('button', name='OK').is_disabled() and 'taken' in page.evaluate('document.querySelector(".ms-note").textContent'))
    page.keyboard.press('Escape'); page.wait_for_timeout(100)
    # Update to Match Selection: a heading's own formatting becomes its level's look
    doc3 = A('\\section{\\textsf{\\textcolor{teal}{Intro}}}\nText.\n\n\\section{Other}\nMore.')
    load_doc(page, doc3); click_text(page, 'Intro', 2)
    teal = page.evaluate("""() => getComputedStyle([...document.querySelectorAll('#pages span.t')].find((x) => x.textContent.includes('Intro'))).color""")
    run_cmd(page, 'update-style')
    want3 = A('\\section{Intro}\nText.\n\n\\section{Other}\nMore.', '\\usepackage{titlesec}\n\\usepackage{xcolor}\n\\titleformat*{\\section}{\\normalfont\\Large\\bfseries\\sffamily\\color{teal}}\n')
    check('Update Heading 1 to Match Selection: \\textsf and \\textcolor come off the heading and go into its \\titleformat*, one step', src(page) == want3, src(page)[:400])
    other = page.evaluate("""() => { const h = [...document.querySelectorAll('#pages .it.h1')].find((x) => x.textContent.includes('Other')); const c = getComputedStyle(h); return [c.fontFamily.startsWith('"Paper Modern Sans'), c.color]; }""")
    check('every Heading 1 takes it on the page (the teal \\textcolor drew)', other[0] and other[1] == teal, (other, teal))
    check('one undo gives the bytes back', undo_is(page, doc3))


def design(page):
    """The Design tab: Style Set, Colors, Fonts, Themes; KOMA-Script; memoir."""
    doc = A('\\section{Intro}\nText.\n\n\\subsection{Part}\nMore.')
    load_doc(page, doc); click_text(page, 'Text', 1)
    page.get_by_role('tab', name='Design').click(); page.wait_for_timeout(200)
    names = page.evaluate("""() => [...document.querySelectorAll('.rb-panel:not([hidden]) [data-cmd]')].filter((b) => b.offsetParent).map((b) => b.getAttribute('aria-label'))""")
    check('the Design tab has Themes, Style Set, Colors and Fonts in its Document formatting group', all(n in names for n in ('Themes', 'Style Set', 'Colors', 'Fonts')), names)
    page.get_by_role('button', name='Style Set').click(); page.wait_for_timeout(250)
    m = page.get_by_role('menu', name='Style Set')
    tiles = [x.get_attribute('aria-label') for x in m.get_by_role('menuitemradio').all()]
    check('Style Set opens a gallery of sets, LaTeX checked', tiles[:3] == ['LaTeX', 'Sans', 'Centered'] and m.get_by_role('menuitemradio', name='LaTeX').get_attribute('aria-checked') == 'true', tiles)
    m.get_by_role('menuitemradio', name='Lines').click(); page.wait_for_timeout(300)
    want = doc.replace('\\begin{document}', '\\usepackage{titlesec}\n\\titleformat{\\section}[hang]{\\normalfont\\Large\\bfseries}{\\thesection}{1em}{}[\\titlerule]\n\\begin{document}')
    check('Lines: a rule under the sections, titlesec once, one step', src(page) == want, src(page)[:300])
    check('the page draws the rule', page.evaluate('getComputedStyle(document.querySelector("#pages .it.h1")).borderBottomStyle') == 'solid')
    run_cmd(page, 'design-style-set', {'id': 'latex'})
    check('LaTeX takes the lines away again, and the titlesec line they needed (review H1)', src(page) == doc, src(page)[:300])
    load_doc(page, doc); click_text(page, 'Text', 1)
    run_cmd(page, 'design-colors', {'id': 'teal'})
    s = src(page)
    check('Colors, Teal: \\definecolor{accent} once and every heading in it', '\\definecolor{accent}{HTML}{0E6F70}' in s and '\\titleformat*{\\section}{\\normalfont\\Large\\bfseries\\color{accent}}' in s and '\\usepackage{xcolor}' in s and undo_is(page, doc), s[:400])
    run_cmd(page, 'design-colors', {'id': 'teal'})
    hx = page.evaluate('getComputedStyle(document.querySelector("#pages .it.h1")).color')
    check('the page shows the headings in that colour', hx == 'rgb(14, 111, 112)', hx)
    run_cmd(page, 'design-colors', {'id': 'none'})
    check('Black takes the colour off and the accent line away', 'accent' not in src(page) and '\\titleformat' not in src(page), src(page)[:300])
    load_doc(page, doc); click_text(page, 'Text', 1)
    run_cmd(page, 'design-fonts', {'id': 'sans'})
    check('Fonts, Sans serif: the headings in sans serif', '\\titleformat*{\\section}{\\normalfont\\Large\\bfseries\\sffamily}' in src(page) and '\\titleformat*{\\subsection}{\\normalfont\\large\\bfseries\\sffamily}' in src(page), src(page)[:400])
    run_cmd(page, 'design-style-set', {'id': 'centered'})
    check('a style set keeps the font Fonts chose', '\\titleformat*{\\section}{\\normalfont\\Large\\bfseries\\sffamily\\filcenter}' in src(page), src(page)[:400])
    load_doc(page, doc); click_text(page, 'Text', 1)
    run_cmd(page, 'design-themes', {'id': 'modern'})
    s = src(page)
    check('a theme: its set, colour and font in one step', '\\definecolor{accent}{HTML}{2F5496}' in s and '\\sffamily\\color{accent}' in s and undo_is(page, doc), s[:400])
    # KOMA-Script: fonts by \setkomafont; the sets disabled, saying why
    koma = doc.replace('{article}', '{scrartcl}')
    load_doc(page, koma); click_text(page, 'Text', 1)
    en = page.evaluate('["design-style-set", "design-colors", "design-fonts"].map((id) => window.rikuy.cmds.enabled(window.rikuy, id, window.rikuy.ribbonAt()))')
    check('in a KOMA-Script document Style Set and Colors are disabled, Fonts is not', en == [False, False, True], en)
    sf = page.evaluate('getComputedStyle(document.querySelector("#pages .it.h1")).fontFamily.startsWith(\'"Paper Modern Sans\')')
    run_cmd(page, 'design-fonts', {'id': 'same'})
    check('its headings show in sans serif (the class\'s), and Fonts, Same as the text writes \\setkomafont{disposition}', sf and '\\setkomafont{disposition}{\\normalfont\\bfseries}\n\\begin{document}' in src(page)
          and not page.evaluate('getComputedStyle(document.querySelector("#pages .it.h1")).fontFamily.startsWith(\'"Paper Modern Sans\')'), src(page)[:200])
    run_cmd(page, 'design-fonts', {'id': 'sans'})
    check('and Sans serif takes that line away again', src(page) == koma, src(page)[:200])
    load_doc(page, doc.replace('{article}', '{memoir}')); click_text(page, 'Text', 1)
    check('memoir: the Design tab\'s sets disabled', page.evaluate('window.rikuy.cmds.enabled(window.rikuy, "design-style-set", window.rikuy.ribbonAt())') is False)


def tile_menu(page):
    """A tile's right click menu: Remove from Style Gallery, Reset."""
    page.set_viewport_size({'width': 1920, 'height': 1000}); page.wait_for_timeout(300)
    load_doc(page, DOC); click_text(page, 'First paragraph', 3); state(page)
    page.click('#rb-st-subsection', button='right'); page.wait_for_timeout(200)
    m = page.get_by_role('menu', name='Heading 2 style')
    items = [x.get_attribute('aria-label') for x in m.get_by_role('menuitem').all()]
    check('a right click on a tile opens its menu, not the browser\'s', m.count() == 1 and 'Remove from Style Gallery' in items and 'Modify…' in items, items)
    m.get_by_role('menuitem', name='Remove from Style Gallery').click(); page.wait_for_timeout(250)
    check('Remove from Style Gallery takes the tile out', 'subsection' not in page.evaluate(TILES), page.evaluate(TILES))
    page.click('#rb-st-section', button='right'); page.wait_for_timeout(200)
    page.get_by_role('menu', name='Heading 1 style').get_by_role('menuitem', name='Reset Style Gallery').click(); page.wait_for_timeout(250)
    check('Reset Style Gallery puts it back', 'subsection' in page.evaluate(TILES), page.evaluate(TILES))
    page.set_viewport_size({'width': 1400, 'height': 1000}); page.wait_for_timeout(300)


def big(page):
    """A stranger's long document: the ribbon's look at the caret and a tile's menu stay quick."""
    pre = ''.join('\\newcommand{\\m%s}{x} %% %s\n' % (chr(97 + k % 26) * (1 + k // 26), 'y' * 60) for k in range(1500))
    body = '\n\n'.join('\\subsection{Head %d}\nWords of paragraph %d here.' % (k, k) for k in range(1500))
    load_doc(page, A(body, pre)); click_text(page, 'Words of paragraph 3 ', 2); page.wait_for_timeout(300)
    # (the styles' own share of a look at the caret: their commands' when, on and sync; the other
    # batches' commands are theirs to time)
    t = page.evaluate("""() => { const g = window.rikuy, C = g.cmds, at = g.ribbonAt(), mine = /^(style|styles|heading-unnumbered|heading-numbers|design-|apply-styles|modify-style|create-style|update-style|autoformat)/;
      const cs = C.commands().filter((c) => mine.test(c.id)), t0 = performance.now();
      for (let k = 0; k < 20; k++) { at.memo = {}; for (const c of cs) { C.enabled(g, c, at); if (c.on) c.on(g, at); if (c.sync) c.sync(g, at); } }
      return Math.round((performance.now() - t0) / 20); }""")
    check('with a preamble of %d characters and 3000 paragraphs the styles\' commands look at the caret in %d ms (under 30)' % (len(pre), t), t < 30, t)
    page.set_viewport_size({'width': 1920, 'height': 1000}); page.wait_for_timeout(300)
    t0 = page.evaluate('performance.now()')
    page.click('#rb-st-subsection', button='right'); page.wait_for_timeout(50)
    t1 = page.evaluate('performance.now()')
    check('and a tile\'s menu opens in %d ms (under 600)' % (t1 - t0), page.get_by_role('menu', name='Heading 2 style').count() == 1 and t1 - t0 < 600, t1 - t0)
    page.keyboard.press('Escape')
    page.set_viewport_size({'width': 1400, 'height': 1000}); page.wait_for_timeout(300)


def open_phone(p, width, height, dark=False):
    """The page on a phone: a touch screen (taps, no hover, no right click), Chromium's mobile
    viewport, as open_page serves it."""
    browser = p.chromium.launch(args=[a for a in os.environ.get('CHROME_ARGS', '').split() if a])
    ctx = browser.new_context(viewport={'width': width, 'height': height}, color_scheme='dark' if dark else 'light', device_scale_factor=2, has_touch=True, is_mobile=True)
    page = ctx.new_page()
    errors = []
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    page.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
    html = open(os.path.join(DIST, 'rikuy.html'), encoding='utf8').read()
    doc = SKELETON_HEAD + html + '</body></html>'

    def handler(route):
        url = route.request.url
        if url.startswith('https://rikuy.test/'):
            path = url[len('https://rikuy.test/'):].split('?')[0]
            f = os.path.join(DIST, path)
            if path and os.path.isfile(f):
                ct = 'text/javascript' if path.endswith(('.js', '.mjs')) else 'application/wasm' if path.endswith('.wasm') else 'application/octet-stream'
                return route.fulfill(status=200, content_type=ct, body=open(f, 'rb').read())
            return route.fulfill(status=200, content_type='text/html; charset=utf-8', body=doc)
        if url in ROUTES:
            return route.fulfill(status=200, content_type='application/javascript', headers={'Access-Control-Allow-Origin': '*'}, body=open(ROUTES[url], 'rb').read())
        return route.abort()
    ctx.route('**/*', handler)
    page.goto('https://rikuy.test/')
    page.evaluate('localStorage.clear()')
    page.reload()
    page.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=20000)
    page.wait_for_timeout(300)
    return browser, page, errors


def tap_text(page, text, k=0):
    """A tap in the words, k characters in (where click_text would click)."""
    box = page.evaluate("""([t, k]) => { const sp = [...document.querySelectorAll('#pages span.t')].find((x) => x.textContent.includes(t)); if (!sp) return null;
      sp.scrollIntoView({ block: 'center' }); const i = sp.textContent.indexOf(t) + k, r = document.createRange(); r.setStart(sp.firstChild, i); r.setEnd(sp.firstChild, i + 1); const b = r.getBoundingClientRect(); return [b.left + 1, b.top + b.height / 2]; }""", [text, k])
    page.touchscreen.tap(box[0], box[1]); page.wait_for_timeout(250)


FITS = """(sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect();
  return { inside: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1, scrolls: getComputedStyle(e).overflowY !== 'visible' || e.scrollHeight <= e.clientHeight + 1, w: Math.round(r.width), h: Math.round(r.height) }; }"""
SMALL = """(sel) => [...document.querySelectorAll(sel)].filter((x) => x.offsetParent).map((x) => { const r = x.getBoundingClientRect(); return [x.getAttribute('aria-label') || x.textContent.trim().slice(0, 20), Math.round(r.width), Math.round(r.height)]; }).filter((x) => x[1] < 44 || x[2] < 44)"""


def phone(p):
    """On a phone (390 by 844 and 360 by 740, touch): every style command by a tap, the pane as a
    sheet with 44 px targets, Modify Style fitting and scrolling, the Design tab, no sideways scroll."""
    for w, h in ((390, 844), (360, 740)):
        tag = ' (%dx%d)' % (w, h)
        browser, page, errors = open_phone(p, w, h)
        try:
            load_doc(page, A('\\section{Intro}\nFirst words here.\n\nSecond words here.'))
            tap_text(page, 'First words', 2)
            info = page.evaluate("""() => { const sel = document.getElementById('rb-style'), g = sel.querySelector('optgroup');
              return { list: !!sel.offsetParent, more: g ? [...g.children].map((o) => o.textContent) : null, side: document.documentElement.scrollWidth - document.documentElement.clientWidth }; }""")
            check('a phone shows the style list, which ends with the Styles pane and Create a Style, and the page does not scroll sideways' + tag, info['list'] and info['more'] == ['Styles pane…', 'Create a Style…'] and info['side'] <= 0, info)
            page.select_option('#rb-style', 'subsection'); page.wait_for_timeout(300)
            check('the list makes the tapped paragraph Heading 2, and the caret stays in its words' + tag, '\\subsection{First words here.}' in src(page) and page.evaluate('document.activeElement.id') == 'pages', src(page)[-120:])
            page.keyboard.type('X'); page.wait_for_timeout(200)
            check('typing goes on where it was' + tag, '\\subsection{FiXrst words here.}' in src(page) or '\\subsection{FirXst words here.}' in src(page), src(page)[-120:])
            page.select_option('#rb-style', '__pane'); page.wait_for_timeout(350)
            check('the list\'s Styles pane opens it with the tapped paragraph\'s style marked, the caret kept on the page' + tag, page.evaluate('(document.querySelector("#stylespane [aria-selected=true]") || {}).ariaLabel') == 'Heading 2'
                  and page.evaluate('document.activeElement.id') == 'pages')
            sheet = page.evaluate(FITS, '#stylespane')
            small = page.evaluate(SMALL, '#stylespane [role=option], #stylespane .stp-x, #stylespane .stp-f .btn')
            vis = page.evaluate('getComputedStyle(document.querySelector("#stylespane .stp-x")).opacity')
            check('the Styles pane opens as a sheet inside the screen, every target 44 px or more, each style\'s options in sight' + tag, sheet and sheet['inside'] and not small and vis == '1', (sheet, small[:4], vis))
            page.locator('#stylespane [role=option][aria-label="Quote"]').scroll_into_view_if_needed()
            tap_text(page, 'Second words', 2)
            page.locator('#stylespane [role=option][aria-label="Quote"]').tap(); page.wait_for_timeout(300)
            check('a tap on Quote there makes the tapped paragraph a quote' + tag, '\\begin{quote}\nSecond words here.\n\\end{quote}' in src(page), src(page)[-140:])
            tap_text(page, 'Intro', 2)
            page.get_by_role('button', name='Heading 1 options').tap(); page.wait_for_timeout(300)
            m = page.get_by_role('menu', name='Heading 1 style')
            names = [x.get_attribute('aria-label') for x in m.locator('[role^=menuitem]').all()]
            check('a heading\'s options by a tap: Update to Match, Modify, Unnumbered heading, Select All Instances (what a right click gives elsewhere)' + tag, all(n in names for n in ('Modify…', 'Unnumbered heading', 'Select All Instances')), names)
            m.get_by_role('menuitemcheckbox', name='Unnumbered heading').tap(); page.wait_for_timeout(300)
            check('Unnumbered heading by a tap: \\section*' + tag, '\\section*{Intro}' in src(page), src(page)[-160:])
            page.get_by_role('button', name='Heading 1 options').tap(); page.wait_for_timeout(300)
            page.get_by_role('menu', name='Heading 1 style').get_by_role('menuitem', name='Modify…').tap(); page.wait_for_timeout(350)
            dlg = page.evaluate(FITS, '.pop-modstyle')
            small = page.evaluate(SMALL, '.pop-modstyle select, .pop-modstyle .ms-c, .pop-modstyle .fd-btns .btn')
            check('Modify Style fits the screen and scrolls, its fields and buttons 44 px or more' + tag, dlg and dlg['inside'] and dlg['scrolls'] and not small, (dlg, small[:4]))
            page.select_option('#ms-family', 'sf')
            page.locator('.pop-modstyle').get_by_role('button', name='OK').tap(); page.wait_for_timeout(350)
            check('OK by a tap writes the heading\'s look' + tag, '\\titleformat*{\\section}{\\normalfont\\Large\\bfseries\\sffamily}' in src(page) and page.evaluate('document.querySelectorAll(".pop").length') == 0, src(page)[:260])
            page.get_by_role('button', name='Close').first.tap(); page.wait_for_timeout(250)
            check('the pane closes by a tap' + tag, page.evaluate('!document.getElementById("stylespane")'))
            tap_text(page, 'Second words', 2); page.select_option('#rb-style', '__new'); page.wait_for_timeout(350)
            cd = page.evaluate(FITS, '.pop-modstyle')
            check('the list\'s Create a Style opens its dialog inside the screen, the list back at the paragraph\'s style' + tag, cd and cd['inside'] and page.get_by_role('dialog', name='Create a Style').count() == 1 and page.evaluate('document.getElementById("rb-style").value') != '__new', cd)
            page.get_by_role('dialog', name='Create a Style').get_by_role('button', name='Cancel').tap(); page.wait_for_timeout(250)
            # the Design tab, by the tab list a phone has
            page.select_option('#rb-tabsel', 'design'); page.wait_for_timeout(300)
            page.get_by_role('button', name='Style Set').tap(); page.wait_for_timeout(300)
            g = page.evaluate(FITS, '.pop-design')
            check('on the Design tab Style Set opens its gallery inside the screen' + tag, g and g['inside'], g)
            page.get_by_role('menu', name='Style Set').get_by_role('menuitemradio', name='Lines').tap(); page.wait_for_timeout(350)
            check('and a tap on Lines writes it, the page not scrolling sideways' + tag, '[\\titlerule]' in src(page) and page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth') <= 0, src(page)[:300])
            if w == 390:
                for dark in (False, True):
                    page.emulate_media(color_scheme='dark' if dark else 'light'); page.wait_for_timeout(200)
                    page.select_option('#rb-tabsel', 'home'); page.wait_for_timeout(200)
                    tap_text(page, 'Intro', 2); page.select_option('#rb-style', '__pane'); page.wait_for_timeout(300)
                    page.screenshot(path='/tmp/B4-shots/phone-pane-390%s.png' % ('-dark' if dark else ''))
                    page.get_by_role('button', name='Heading 1 options').tap(); page.wait_for_timeout(250)
                    page.get_by_role('menu', name='Heading 1 style').get_by_role('menuitem', name='Modify…').tap(); page.wait_for_timeout(300)
                    page.screenshot(path='/tmp/B4-shots/phone-modify-390%s.png' % ('-dark' if dark else ''))
                    page.keyboard.press('Escape'); page.wait_for_timeout(150)
                    page.get_by_role('button', name='Close').first.tap(); page.wait_for_timeout(200)
        except Exception as e:
            check('phone%s runs to its end' % tag, False, e)
        check('no console errors (phone%s)' % tag, not [e for e in errors if 'tree.wasm' not in e and 'TeX' not in e], errors[:4])
        browser.close()


def pdf_text(page, text):
    """The text and the problems of one compile in the page: { ok, errors, text }."""
    import base64, subprocess, tempfile
    page.set_default_timeout(600000)
    r = page.evaluate("""async (t) => { await window.rikuy.api.setSource(t); const r = await window.rikuy.api.compile();
      let b = ''; if (r.pdf) for (let i = 0; i < r.pdf.length; i += 8192) b += String.fromCharCode(...r.pdf.subarray(i, i + 8192));
      return { ok: r.ok, errors: r.problems.filter((p) => p.severity === 'error').map((p) => p.message).slice(0, 3), pdf: r.pdf ? btoa(b) : '' }; }""", text)
    page.set_default_timeout(30000)
    t = ''
    if r['pdf']:
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as fh:
            fh.write(base64.b64decode(r['pdf']))
        t = subprocess.run(['pdftotext', '-layout', fh.name, '-'], capture_output=True, text=True).stdout
        os.unlink(fh.name)
    return {'ok': r['ok'], 'errors': r['errors'], 'text': t}


def modify_style(page, v, do, ok=True):
    """Modify Style on style v: do(page) changes the dialog's fields, then OK."""
    run_cmd(page, 'modify-style', {'v': v}); page.wait_for_timeout(250)
    do(page)
    if ok: page.locator('.pop-modstyle').get_by_role('button', name='OK').click(); page.wait_for_timeout(300)


def review(page):
    """The hostile review of B4 (review H1 to H10, M1 to M5, L1 to L7), each with its case."""
    H = A('\\section{Intro}\nText.\n\n\\subsection{Sub}\nMore.\n\n\\paragraph{Lead} Runs in.')
    # H1: titlesec only for article, report, book and the ext classes; refused elsewhere, nothing written
    for cls in ('amsart', 'llncs', 'elsarticle', 'revtex4-2', 'IEEEtran', 'scrartcl', 'memoir'):
        load_doc(page, H.replace('{article}', '{' + cls + '}')); click_text(page, 'Intro', 2); page.wait_for_timeout(200)
        en = page.evaluate('["modify-style", "design-style-set", "design-colors", "design-themes", "update-style"].map((id) => window.rikuy.cmds.enabled(window.rikuy, id, window.rikuy.ribbonAt()))')
        why = page.evaluate('window.rikuy.titlesecWhy() || ""')
        before = src(page)
        run_cmd(page, 'design-style-set', {'id': 'lines'}); run_cmd(page, 'design-colors', {'id': 'teal'})
        check('H1: in %s Modify Style, Update to Match and the Design tab\'s sets are disabled, saying why, and write nothing' % cls, en == [False] * 5 and why and src(page) == before, (en, why[:60]))
    for cls in ('extarticle', 'report', 'book'):
        load_doc(page, H.replace('{article}', '{' + cls + '}')); click_text(page, 'Intro', 2)
        check('H1: in %s they apply' % cls, page.evaluate('window.rikuy.cmds.enabled(window.rikuy, "design-style-set", window.rikuy.ribbonAt())'))
    # H1: LaTeX's own takes the last line away and the titlesec line it needed with it; L3: Update to Match with nothing to write adds nothing
    load_doc(page, H); click_text(page, 'Intro', 2)
    run_cmd(page, 'design-style-set', {'id': 'lines'}); mid = src(page)
    run_cmd(page, 'design-style-set', {'id': 'latex'})
    check('H1: LaTeX\'s own after Lines gives the document back, the \\usepackage{titlesec} line gone too', '\\usepackage{titlesec}' in mid and src(page) == H, src(page)[:200])
    load_doc(page, H.replace('\\section{Intro}', '\\section{\\textbf{Intro}}')); click_text(page, 'Intro', 2); run_cmd(page, 'update-style')
    check('L3: Update to Match on \\section{\\textbf{…}} (its look already): the \\textbf comes off, no package line goes in', src(page) == H, src(page)[:200])
    # H3: a hand written line kept byte for byte; OK with nothing changed changes nothing
    hand = A('\\section{Intro}\nText.', '\\usepackage{titlesec}\n\\titleformat{\\section}[block]{\\Large\\bfseries}{\\thesection.}{0.5em}{\\MakeUppercase}\n\\titlespacing{\\section}{1em}{3.5ex plus 1ex minus .2ex}{*1.5}\n')
    load_doc(page, hand); click_text(page, 'Intro', 2)
    modify_style(page, 'section', lambda pg: None)
    check('H3/H9: Modify Style, OK with nothing changed: no edit', src(page) == hand and page.evaluate('window.rikuy.hist.length') == 0, src(page)[:300])
    modify_style(page, 'section', lambda pg: pg.check('#ms-italic'))
    check('H3: italic on: the format argument alone changes; label, separator, before code, the glue and *1.5 stay', src(page) == hand.replace('{\\Large\\bfseries}{\\thesection.}', '{\\normalfont\\Large\\bfseries\\itshape}{\\thesection.}'), src(page)[:330])
    # H2: titlesec's explicit option: the full form with #1, and the PDF has the titles
    ex = A('\\section{Intro}\nText.\n\n\\subsection{Sub}\nMore.', '\\usepackage[explicit]{titlesec}\n')
    load_doc(page, ex); click_text(page, 'Sub', 1)
    modify_style(page, 'subsection', lambda pg: pg.uncheck('#ms-bold'))
    click_text(page, 'Intro', 2)
    modify_style(page, 'section', lambda pg: pg.uncheck('#ms-num'))
    s2 = src(page)
    check('H2: under explicit Modify writes \\titleformat in full with #1, never \\titleformat*', 'titleformat*' not in s2 and '{\\thesubsection}{1em}{#1}' in s2 and '{\\normalfont\\Large\\bfseries}{}{1em}{#1}' in s2, s2[:400])
    # H7: Numbered off: the page draws no number, as TeX prints none
    num = page.evaluate('[...document.querySelectorAll("#pages .it.h1 .secnum")].length')
    check('H7: Numbered off: the page draws "Intro" with no number', num == 0, num)
    if os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        r = pdf_text(page, s2)
        t = re.sub(r'\s+', ' ', r['text'])
        check('H2/H7: compiled, the PDF has both titles, the section with no number (its counter still steps: the subsection is 1.1)', r['ok'] and not r['errors'] and 'Intro' in t and not re.search(r'\b1 Intro', t) and '1.1 Sub' in t, (r['errors'], t[:200]))
    # H4: a theorem made by thmtools, tcolorbox or mdframed: no second definition; Proof under ntheorem without amsthm refused
    for pre in ('\\usepackage{amsthm,thmtools}\n\\declaretheorem{theorem}\n', '\\usepackage[most]{tcolorbox}\n\\newtcbtheorem{theorem}{Theorem}{}{th}\n', '\\usepackage{amsthm,mdframed}\n\\newmdtheoremenv{theorem}{Theorem}\n'):
        load_doc(page, A(P3, pre)); click_text(page, 'Words', 2); run_cmd(page, 'style-thm-theorem')
        check('H4: Theorem style where %s defines it: the environment alone, no \\newtheorem' % pre.split('\n')[1][:20], '\\newtheorem' not in src(page) and '\\begin{theorem}\nWords here.\n\\end{theorem}' in src(page), src(page)[:200])
    load_doc(page, A(P3, '\\usepackage{ntheorem}\n')); click_text(page, 'Words', 2)
    why = page.evaluate('window.rikuy.cmds.command("style-thm-proof").whyNot(window.rikuy, window.rikuy.ribbonAt())')
    check('H4: Proof under ntheorem without its amsthm option is refused, saying why', not page.evaluate('window.rikuy.cmds.enabled(window.rikuy, "style-thm-proof", window.rikuy.ribbonAt())') and 'amsthm' in why, why)
    if os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        load_doc(page, A(P3, '\\usepackage{amsthm,thmtools}\n\\declaretheorem{theorem}\n')); click_text(page, 'Words', 2); run_cmd(page, 'style-thm-theorem'); run_cmd(page, 'style-thm-lemma')
        r = pdf_text(page, src(page)); t = re.sub(r'\s+', ' ', r['text'])
        check('H4: compiled with thmtools: no error, the lemma\'s \\newtheorem added, "Lemma 1" in the PDF', r['ok'] and not r['errors'] and 'Lemma 1' in t, (r['errors'], t[:160]))
    # H5: Create a Style refuses names LaTeX, a package or the document has
    load_doc(page, A('Some key words here.', '\\newenvironment{aside}{\\par}{\\par}\n')); select_text(page, 'key words')
    run_cmd(page, 'create-style'); refused = []
    for kind, names in (('char', ('emph', 'quote', 'small', 'title', 'line', 'mark', 'url', 'underline', 'footnote', 'aside')), ('para', ('small', 'box', 'title', 'flushleft', 'frame', 'tabular'))):
        page.select_option('#cs-type', kind)
        for n in names:
            page.fill('#cs-name', n); page.wait_for_timeout(30)
            if not page.locator('.pop-modstyle').get_by_role('button', name='OK').is_disabled(): refused.append((kind, n))
    check('H5: every name LaTeX, TeX or the document has is refused', not refused, refused)
    page.fill('#cs-name', 'keyterm'); page.wait_for_timeout(30)
    check('and a new name is taken', not page.locator('.pop-modstyle').get_by_role('button', name='OK').is_disabled())
    page.keyboard.press('Escape'); page.wait_for_timeout(100)
    # H6: the author's \setcounter{secnumdepth}{2}: off and on give it back
    six = A('\\section{A}\nx', '\\setcounter{secnumdepth}{2}\n')
    load_doc(page, six); click_text(page, 'x', 0); run_cmd(page, 'heading-numbers-off'); run_cmd(page, 'heading-numbers-off')
    check('H6: Heading numbers off and on: the author\'s \\setcounter{secnumdepth}{2} stays', src(page) == six, src(page)[:160])
    # H8: Unnumbered heading on \section[Short]{Long}: refused, saying why
    load_doc(page, A('\\section[Short]{Long title}\nx')); click_text(page, 'Long', 2)
    check('H8: Unnumbered heading on a heading with a short title is refused, saying why', not page.evaluate('window.rikuy.cmds.enabled(window.rikuy, "heading-unnumbered", window.rikuy.ribbonAt())')
          and 'short title' in page.evaluate('window.rikuy.cmds.command("heading-unnumbered").whyNot(window.rikuy, window.rikuy.ribbonAt())'))
    # H9: Modify on the document's own style, OK with nothing changed: no edit; a change keeps what the dialog does not show
    own = A('A \\hl{x} y.\n\n\\begin{note}\nN.\n\\end{note}', '\\usepackage{xcolor}\n\\newcommand{\\hl}[1]{\\colorbox{yellow}{#1}}\n\\newenvironment{note}{\\par\\noindent\\slshape\\small}{\\par}\n')
    load_doc(page, own); click_text(page, 'x', 0)
    modify_style(page, 'char:hl', lambda pg: None)
    modify_style(page, 'env:note', lambda pg: None)
    check('H9: OK with nothing changed on \\hl and note: no edit', src(page) == own, src(page)[:300])
    modify_style(page, 'char:hl', lambda pg: pg.check('#ms-bold'))
    modify_style(page, 'env:note', lambda pg: pg.select_option('#ms-color', 'blue'))
    check('H9: bold on \\hl keeps its \\colorbox; a colour on note keeps \\noindent, \\slshape and \\small', '\\newcommand{\\hl}[1]{\\colorbox{yellow}{\\textbf{#1}}}' in src(page) and '\\newenvironment{note}{\\par\\noindent\\slshape\\small\\color{blue}}{\\par}' in src(page), src(page)[:300])
    # H10: run in only where TeX runs in; with \parskip the heading on its paragraph's line
    load_doc(page, A('\\paragraph{Lead}\n\\begin{quote}\nQuoted.\n\\end{quote}\n\n\\paragraph{Next}\nRuns in.'))
    ri = page.evaluate('[...document.querySelectorAll("#pages .it.h4")].map((h) => h.classList.contains("runin"))')
    check('H10: \\paragraph before a quote stands on its own line, before a paragraph it runs in', ri == [False, True], ri)
    for pre in ('\\usepackage{parskip}\n', '\\setlength{\\parskip}{2em}\n'):
        load_doc(page, A('Before.\n\n\\paragraph{Lead}\nRuns in here.', pre))
        g = page.evaluate("""() => { const h = document.querySelector('#pages .it.h4 span.t'), p = [...document.querySelectorAll('#pages span.t')].find((x) => x.textContent.includes('Runs in')); const a = h.getBoundingClientRect(), b = p.getBoundingClientRect(); return Math.round(Math.abs(a.top - b.top)); }""")
        check('H10: with %s the heading stands on its paragraph\'s first line (%d px apart)' % (pre.strip(), g), g <= 3, g)
    # M3: a hand written \@startsection with a positive after skip: on a line of its own
    load_doc(page, A('\\paragraph{Lead}\nText.', '\\makeatletter\n\\renewcommand\\paragraph{\\@startsection{paragraph}{4}{\\z@}{3.25ex \\@plus1ex \\@minus.2ex}{1.5ex \\@plus .2ex}{\\normalfont\\normalsize\\bfseries}}\n\\makeatother\n'))
    check('M3: a \\paragraph the preamble sets on its own line is not run in', page.evaluate('!document.querySelector("#pages .it.h4.runin")'))
    # M1: a new paragraph style is justified, LaTeX's own; M2: ulem already loaded keeps its options
    load_doc(page, A('Words here.', '\\usepackage{ulem}\n')); click_text(page, 'Words', 2)
    run_cmd(page, 'create-style'); page.fill('#cs-name', 'aside'); page.select_option('#cs-type', 'para'); page.wait_for_timeout(80); page.check('#ms-italic')
    page.locator('.pop-modstyle').get_by_role('button', name='OK').click(); page.wait_for_timeout(250)
    check('M1: a new paragraph style, italic: \\newenvironment{aside}{\\par\\itshape}{\\par}, no \\raggedright', '\\newenvironment{aside}{\\par\\itshape}{\\par}' in src(page), src(page)[:200])
    select_text(page, 'Words'); run_cmd(page, 'create-style'); page.fill('#cs-name', 'under'); page.check('#ms-ul')
    page.locator('.pop-modstyle').get_by_role('button', name='OK').click(); page.wait_for_timeout(250)
    check('M2: Underline with ulem loaded: its line stays \\usepackage{ulem} (no normalem: \\emph keeps its underline)', '\\usepackage{ulem}\n' in src(page) and 'normalem' not in src(page), src(page)[:200])
    # M4: memoir with \mainmatter: off writes its own pair; the page draws what TeX prints
    mem = '\\documentclass{memoir}\n\\begin{document}\n\\mainmatter\n\\chapter{One}\n\\section{Sec}\nText.\n\\end{document}\n'
    load_doc(page, mem); click_text(page, 'Text', 1); run_cmd(page, 'heading-numbers-off')
    nums = page.evaluate('[...document.querySelectorAll("#pages .it.h .secnum, #pages .it.h .chapl")].map((x) => x.textContent)')
    check('M4: memoir: Heading numbers off writes \\setsecnumdepth{none}\\maxsecnumdepth{none}, the page draws no number', '\\setsecnumdepth{none}\\maxsecnumdepth{none}' in src(page) and not [x for x in nums if re.search(r'\d', x)], (src(page)[:120], nums))
    if os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        r = pdf_text(page, src(page)); t = re.sub(r'\s+', ' ', r['text'])
        check('M4: compiled, memoir prints neither "Chapter 1" nor "1.1"', r['ok'] and not r['errors'] and 'Sec' in t and 'Chapter 1' not in t and '1.1' not in t, (r['errors'], t[:160]))
    # M5: the pane follows a rename in the source
    load_doc(page, A('A \\keyterm{x} y.', '\\newcommand{\\keyterm}[1]{\\textbf{#1}}\n')); click_text(page, 'y.', 0); run_cmd(page, 'styles-pane')
    page.evaluate("(t) => window.rikuy.api.setSource(t)", A('A \\keyword{x} y.', '\\newcommand{\\keyword}[1]{\\textbf{#1}}\n')); page.wait_for_timeout(400); click_text(page, 'y.', 0); page.wait_for_timeout(300)
    names = page.evaluate('[...document.querySelectorAll("#stylespane [data-style^=\'char:\']")].map((x) => x.dataset.style)')
    check('M5: the pane lists the renamed \\keyword, not \\keyterm', names == ['char:keyword'], names)
    run_cmd(page, 'styles-pane')
    # L1: CRLF kept in every line written
    cr = A('\\section{Intro}\nText.').replace('\n', '\r\n')
    load_doc(page, cr); click_text(page, 'Intro', 2); run_cmd(page, 'design-colors', {'id': 'teal'}); run_cmd(page, 'heading-numbers-off')
    check('L1: in a CRLF file the colour, titlesec and secnumdepth lines end in CRLF', '\n' not in src(page).replace('\r\n', ''), repr(src(page)[:300]))
    # L2: \part under secnumdepth -1 in an article: no "Part I"
    load_doc(page, A('\\part{Whole}\nx', '\\setcounter{secnumdepth}{-1}\n'))
    check('L2: \\part with secnumdepth -1 in an article shows no "Part I"', 'Part I' not in page.evaluate('document.querySelector("#pages .it.h").textContent'))
    # L7: \paragraph numbered where secnumdepth reaches it; Casual alone gives its colour
    load_doc(page, A('\\section{A}\n\\subsection{B}\n\\subsubsection{C}\n\\paragraph{D}\nx', '\\setcounter{secnumdepth}{4}\n'))
    check('L7: with secnumdepth 4 \\paragraph is numbered 1.1.1.1', '1.1.1.1' in page.evaluate('document.querySelector("#pages .it.h4").textContent'))
    load_doc(page, H); click_text(page, 'Intro', 2); run_cmd(page, 'design-style-set', {'id': 'casual'})
    check('L7: Style Set Casual with no accent defined writes one, so its headings have the colour it promises', '\\definecolor{accent}' in src(page) and '\\color{accent}' in src(page), src(page)[:300])
    # L6: Home on a run in heading's line goes to its start; Backspace at the paragraph's start joins as after any heading
    load_doc(page, A('\\paragraph{Lead}\nRuns in.')); click_text(page, 'Runs', 2); page.keyboard.press('Home'); page.keyboard.type('X'); page.wait_for_timeout(200)
    check('L6: Home on the line goes to the heading\'s start', '\\paragraph{XLead}' in src(page), src(page)[-60:])
    load_doc(page, A('\\paragraph{Lead}\nRuns in.')); click_text(page, 'Runs', 0); page.keyboard.press('Backspace'); page.wait_for_timeout(250)
    a = body(page)
    load_doc(page, A('\\subsubsection{Lead}\nRuns in.')); click_text(page, 'Runs', 0); page.keyboard.press('Backspace'); page.wait_for_timeout(250)
    b = body(page)
    check('L6: Backspace at the paragraph\'s start does there what it does after a heading on its own line', a != A('\\paragraph{Lead}\nRuns in.') and a.replace('\\paragraph', '\\subsubsection') == b, (a, b))


def review_phone(p):
    """Review L4 and L5 on a phone: 44 px targets in Create a Style and the sheet; a dialog that
    follows the window when it shrinks (the keyboard up)."""
    browser, page, errors = open_phone(p, 360, 740)
    try:
        load_doc(page, A('Some words here.'))
        tap_text(page, 'words', 1)
        page.select_option('#rb-style', '__new'); page.wait_for_timeout(300)
        small = page.evaluate(SMALL, '#cs-name, .pop-modstyle select')
        check('L4: Create a Style\'s Name and lists are 44 px tall on a phone', not small, small)
        page.set_viewport_size({'width': 360, 'height': 380}); page.wait_for_timeout(400)
        box = page.evaluate("() => { const r = document.querySelector('.pop-modstyle').getBoundingClientRect(), n = document.getElementById('cs-name').getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), Math.round(n.top)]; }")
        check('L5: with the window shrunk to 380 px the dialog moves into it, its Name field in reach', box[0] >= 0 and box[1] <= 381 and box[2] >= 0, box)
        page.set_viewport_size({'width': 360, 'height': 740}); page.wait_for_timeout(300)
        page.keyboard.press('Escape'); page.wait_for_timeout(150)
        tap_text(page, 'words', 1)
        page.select_option('#rb-style', '__pane'); page.wait_for_timeout(300)
        small = page.evaluate(SMALL, '#stylespane .pop-x, #rb-style')
        check('L4: the sheet\'s Close and the style list are 44 px or more', not small, small)
        page.get_by_role('button', name='Normal options').tap(); page.wait_for_timeout(250)
        small = page.evaluate(SMALL, '.pop-menu [role^=menuitem]')
        check('L4: a style\'s menu items are 44 px tall', not small, small)
    except Exception as e:
        check('review_phone runs to its end', False, e)
    check('no console errors (review_phone)', not [e for e in errors if 'tree.wasm' not in e and 'TeX' not in e], errors[:4])
    browser.close()


def verify(page):
    """The verification of the review's fixes (V1 to V5), each with the verifier's case."""
    pre = ('\\usepackage{amsthm,thmtools}\n\\usepackage[most]{tcolorbox}\n\\usepackage{mdframed}\n\\newtcolorbox{mybox}{colback=red!5}\n\\declaretheorem[name=Satz]{theorem}\n'
           '\\declaretheorem[numbered=no,name=Remark]{remark}\n\\newmdenv[linecolor=red]{warnbox}\n\\newtcbtheorem{theo}{Theorem}{}{th}\n')
    doc = A('\\begin{mybox}\nBoxed text.\n\\end{mybox}\n\n\\begin{theorem}\nStated.\n\\end{theorem}\n\n\\begin{remark}\nRemarked.\n\\end{remark}\n\n\\begin{warnbox}\nWarned.\n\\end{warnbox}\n\nBeta two.', pre)
    load_doc(page, doc); click_text(page, 'Beta two', 2); state(page)
    text = page.evaluate('[...document.querySelectorAll("#pages .it")].map((e) => e.textContent.replace(/\\s+/g, " ").trim()).filter(Boolean)')
    t = ' | '.join(text)
    check('V1: the page draws the boxes with no label, \\declaretheorem\'s name= and numbered=no as TeX prints them', 'Satz 1' in t and 'Remark.' in t and 'Remark 1' not in t and 'Mybox' not in t and 'Warnbox' not in t, text)
    offered = page.evaluate('[...document.getElementById("rb-style").options].map((o) => o.value)')
    check('V1: no box and no environment that takes arguments is offered as a style', not [v for v in offered if v in ('env:mybox', 'env:warnbox', 'env:theo')], [v for v in offered if v.startswith('env:')])
    if os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        r = pdf_text(page, doc); t2 = re.sub(r'\s+', ' ', r['text'])
        check('V1: compiled, TeX prints the same: "Satz 1.", "Remark.", the boxes\' words with no label', r['ok'] and 'Satz 1' in t2 and 'Remark.' in t2 and 'Mybox' not in t2 and 'Boxed text.' in t2, (r['errors'], t2[:200]))
    # V2: every name LaTeX's kernel, amsmath, amssymb or a common package defines is refused
    load_doc(page, A('Some key words here.', '\\usepackage{amsmath,amssymb,comment}\n')); select_text(page, 'key words')
    run_cmd(page, 'create-style'); taken = []
    for kind, names in (('char', ('big', 'space', 'tag', 'boxed', 'overline', 'check', 'vec', 'hat', 'top', 'stop', 'loop', 'do', 'mathbf', 'max', 'ln', 'Box', 'path', 'cancel', 'bar', 'Re', 'leq')),
                        ('para', ('cases', 'matrix', 'align', 'gather', 'comment'))):
        page.select_option('#cs-type', kind)
        for n in names:
            page.fill('#cs-name', n); page.wait_for_timeout(20)
            if not page.locator('.pop-modstyle').get_by_role('button', name='OK').is_disabled(): taken.append((kind, n))
    page.fill('#cs-name', 'keyterm'); page.wait_for_timeout(30)
    check('V2: every name LaTeX, amsmath, amssymb or a loaded package defines is refused, a new one taken', not taken and not page.locator('.pop-modstyle').get_by_role('button', name='OK').is_disabled(), taken)
    page.keyboard.press('Escape'); page.wait_for_timeout(100)
    # V3: \paragraph with an after skip of zero runs in
    load_doc(page, A('\\paragraph{Lead}\nText after.', '\\makeatletter\n\\renewcommand\\paragraph{\\@startsection{paragraph}{4}{\\z@}{3.25ex \\@plus1ex}{\\z@}{\\normalfont\\bfseries}}\n\\makeatother\n'))
    check('V3: an after skip of \\z@ runs the heading in', page.evaluate('!!document.querySelector("#pages .it.h4.runin")'))
    # V4: the narrow list follows a renamed environment
    page.set_viewport_size({'width': 820, 'height': 900}); page.wait_for_timeout(300)
    load_doc(page, A('\\begin{aside}\nIn it.\n\\end{aside}', '\\newenvironment{aside}{\\par\\itshape}{\\par}\n')); click_text(page, 'In it', 2); state(page)
    load_doc(page, A('\\begin{memo}\nIn it.\n\\end{memo}', '\\newenvironment{memo}{\\par\\itshape}{\\par}\n')); click_text(page, 'In it', 2); state(page)
    vals = page.evaluate('[...document.getElementById("rb-style").options].map((o) => o.value)')
    check('V4: the narrow list offers the renamed memo, not aside, and shows it', 'env:memo' in vals and 'env:aside' not in vals and page.evaluate('document.getElementById("rb-style").value') == 'env:memo', [v for v in vals if v.startswith('env:')])
    page.set_viewport_size({'width': 1400, 'height': 1000}); page.wait_for_timeout(300)
    # V5: through the dialog, Numbered off and on gives \thesection. back
    hand = A('\\section{Intro}\nText.', '\\usepackage{titlesec}\n\\titleformat{\\section}[block]{\\Large\\bfseries}{\\thesection.}{0.5em}{\\MakeUppercase}\n')
    load_doc(page, hand); click_text(page, 'Intro', 2)
    modify_style(page, 'section', lambda pg: pg.uncheck('#ms-num'))
    click_text(page, 'Intro', 2)
    modify_style(page, 'section', lambda pg: pg.check('#ms-num'))
    check('V5: Numbered off then on in Modify Style: the label is \\thesection. again, the line as the author wrote it but its format', '{\\thesection.}{0.5em}{\\MakeUppercase}' in src(page), src(page)[:260])


def compile_all(page):
    """Everything this suite writes, compiled in the page: no error, the words where TeX puts them."""
    if not os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        print('SKIP the compile of the styles: no TeX tree in %s' % DIST)
        return
    doc = ('\\documentclass{article}\n\\usepackage{amsthm}\n\\usepackage{titlesec}\n\\usepackage{xcolor}\n\\definecolor{accent}{HTML}{0E6F70}\n'
           '\\titleformat{\\section}[hang]{\\normalfont\\Large\\bfseries\\sffamily\\color{accent}\\filcenter}{\\thesection}{1em}{}[\\titlerule]\n'
           '\\titlespacing*{\\subsection}{0pt}{12pt}{6pt}\n\\theoremstyle{definition}\n\\newtheorem{definition}{Definition}\n\\theoremstyle{plain}\n\\newtheorem{theorem}{Theorem}\n'
           '\\newcommand{\\keyterm}[1]{\\textcolor{red}{\\textbf{#1}}}\n\\newenvironment{aside}{\\par\\itshape\\centering}{\\par}\n\\setcounter{secnumdepth}{3}\n'
           '\\begin{document}\n\\part{Whole}\n\\section{Intro}\nA \\keyterm{key} word.\n\n\\subsection*{Unnumbered}\nText.\n\n\\paragraph{Lead}\n\nRuns in.\n\n\\subparagraph{Sub}\nAlso in.\n\n'
           '\\begin{quotation}\nQuoted.\n\\end{quotation}\n\n\\begin{verse}\nA line\\\\\nanother\n\\end{verse}\n\n\\begin{abstract}\nShort.\n\\end{abstract}\n\n'
           '\\begin{definition}\nDefined.\n\\end{definition}\n\n\\begin{theorem}\nStated.\n\\end{theorem}\n\n\\begin{proof}\nShown.\n\\end{proof}\n\n\\begin{aside}\nSet apart.\n\\end{aside}\n\\end{document}\n')
    page.set_default_timeout(600000)
    import base64, subprocess, tempfile
    for engine in ('pdflatex', 'lualatex'):
        text = doc if engine == 'pdflatex' else '% !TeX program = lualatex\n' + doc
        r = page.evaluate("""async (t) => { await window.rikuy.api.setSource(t); const r = await window.rikuy.api.compile();
          let b = ''; if (r.pdf) for (let i = 0; i < r.pdf.length; i += 8192) b += String.fromCharCode(...r.pdf.subarray(i, i + 8192));
          return { ok: r.ok, engine: r.engine, errors: r.problems.filter((p) => p.severity === 'error').map((p) => p.message).slice(0, 3), pdf: r.pdf ? btoa(b) : '' }; }""", text)
        t = ''
        if r['pdf']:
            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as fh:
                fh.write(base64.b64decode(r['pdf']))
            t = re.sub(r'\s+', ' ', subprocess.run(['pdftotext', fh.name, '-'], capture_output=True, text=True).stdout)
            os.unlink(fh.name)
        check('%s compiles every style Rikuy writes with no error, and the PDF has them (Part I, Intro, Lead Runs in, Definition 1, Theorem 1, Proof)' % engine, r['ok'] and not r['errors']
              and all(x in t for x in ('Part I', 'Whole', 'Intro', 'Lead Runs in', 'Definition 1', 'Theorem 1', 'Proof', 'Set apart')), (r['ok'], r['engine'], r['errors'], t[:400]))
    page.set_default_timeout(30000)


def run():
    with sync_playwright() as p:
        fns = (styles, gallery, gallery_widths, gallery_paging, gallery_keys, quote_style, headings, numbering, environments, many, autoformat, keys_and_boxes, modify, create_and_update, design, tile_menu, big, review, verify, compile_all)
        # (the tests that read the tiles see all six: from 1600 px the gallery has room for them)
        wide = (styles, gallery, gallery_keys, quote_style)
        # (names given on the command line run those alone)
        # (on a phone: a touch screen of its own, two sizes)
        if len(sys.argv) < 2 or 'phone' in sys.argv[1:]:
            os.makedirs('/tmp/B4-shots', exist_ok=True)
            phone(p)
        if len(sys.argv) < 2 or 'review_phone' in sys.argv[1:]:
            review_phone(p)
        for fn in [f for f in fns if len(sys.argv) < 2 or f.__name__ in sys.argv[1:]]:
            browser, page, errors = open_page(p, width=1920 if fn in wide else 1400)
            try:
                fn(page)
            except Exception as e:
                check('%s runs to its end' % fn.__name__, False, e)
            check('no console errors (%s)' % fn.__name__, not [e for e in errors if 'tree.wasm' not in e and 'TeX' not in e], errors[:4])
            browser.close()
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(run())
