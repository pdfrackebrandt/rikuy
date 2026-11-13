"""The outline (src/outline.js, the outline commands of src/cmd/find.js, the Navigation pane and
the Outline view in src/nav.js), in Chromium.

Promote and Demote (Alt+Shift+Left and Right on a heading): the heading and every heading under it,
one undo, the bytes back, \\section*{...} and \\section[short]{...} kept as written, an article's
\\section never above itself, a book's \\section up to \\chapter; Move up and Move down
(Alt+Shift+Up and Down): a heading's whole section past the one beside it, a paragraph past the
one beside it, an item past its neighbour in its list, nothing where nothing of the kind stands; the
heading's right click menu (Promote, Demote, New heading before and after, New subheading, Select
heading and content); the Navigation pane's Headings (rows that go there, collapse and expand,
Show levels, the Outlining toolbar acting on the row chosen, Alt+Shift and the arrows in the list,
a heading dragged onto another moving its section in one undo), Pages (one thumbnail a page, a
click goes there), Results (the search's hits; the figures and tables of the options); the Outline
view (Ctrl+Alt+O: the panel wide, the paragraphs under the headings, View's Outline pressed,
again to leave it). Where dist/tex exists, a promoted heading compiles as the level it was given.

RIKUY_DIST names another dist/."""
import os, sys, base64, io
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import open_page, check, results, src, load_doc, click_text, roundtrip
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist')
WRAP = lambda body, cls='article': '\\documentclass{' + cls + '}\n\\begin{document}\n' + body + '\n\\end{document}\n'
DOC = WRAP('\\section{Alpha}\\label{s:a}\nAlpha text.\n\n\\subsection{Alpha one}\nSub text.\n\n\\section{Beta}\nBeta text.\n\n\\section{Gamma}\nGamma text.')


def key(page, k):
    page.keyboard.press(k); page.wait_for_timeout(250)


def promote_demote(page):
    # the round trip rule: written exactly, one step, undo to the bytes, the other key takes it back
    roundtrip(page, DOC, ('Alpha', 2), 'demote', DOC.replace('\\section{Alpha}', '\\subsection{Alpha}').replace('\\subsection{Alpha one}', '\\subsubsection{Alpha one}'),
              off_command='promote', label='Demote: the heading and the one under it')
    roundtrip(page, DOC, ('Alpha one', 2), 'promote', DOC.replace('\\subsection{Alpha one}', '\\section{Alpha one}'), off_command='demote', label='Promote')
    # hand written forms keep their star and their short title
    starred = WRAP('\\section*{Intro}\nText.\n\n\\subsection[Short]{A long title}\nMore.')
    load_doc(page, starred); click_text(page, 'Intro', 1); key(page, 'Alt+Shift+ArrowRight')
    check('Demote keeps \\section*\'s star and \\subsection[Short]\'s short title: only the names change', src(page) == starred.replace('\\section*{Intro}', '\\subsection*{Intro}').replace('\\subsection[Short]', '\\subsubsection[Short]'), src(page))
    # bounds: an article's \section is the top; the keys then write nothing
    load_doc(page, DOC); click_text(page, 'Beta', 1)
    st = page.evaluate("(() => { const g = window.rikuy, at = g.ribbonAt(); return [g.cmds.enabled(g, 'promote', at), g.cmds.command('promote').whyNot(g, at)]; })()")
    key(page, 'Alt+Shift+ArrowLeft')
    check('an article\'s \\section cannot be promoted: disabled, says why, the key writes nothing', st[0] is False and 'top level' in st[1] and src(page) == DOC, st)
    book = WRAP('\\chapter{One}\nText.\n\n\\section{Part}\nMore.', 'book')
    load_doc(page, book); click_text(page, 'Part', 1); key(page, 'Alt+Shift+ArrowLeft')
    check('in a book \\section goes up to \\chapter', src(page) == book.replace('\\section{Part}', '\\chapter{Part}'), src(page))
    caret = page.evaluate('window.rikuy.caretNow().a')
    check('and the caret stays in the heading\'s words', src(page)[caret - 1:caret + 2] == 'Par', src(page)[caret - 5:caret + 5])
    deep = WRAP('\\subsubsection{Deep}\n\\paragraph{Deeper}\n\\subparagraph{Deepest}\nText.')
    load_doc(page, deep); click_text(page, 'Deep', 2)
    check('Demote is disabled where a heading under it is \\subparagraph already', page.evaluate("(() => { const g = window.rikuy; return g.cmds.enabled(g, 'demote', g.ribbonAt()); })()") is False)


def moves(page):
    load_doc(page, DOC); click_text(page, 'Beta', 2)
    h0 = page.evaluate('window.rikuy.hist.length')
    key(page, 'Alt+Shift+ArrowUp')
    want = WRAP('\\section{Beta}\nBeta text.\n\n\\section{Alpha}\\label{s:a}\nAlpha text.\n\n\\subsection{Alpha one}\nSub text.\n\n\\section{Gamma}\nGamma text.')
    check('Alt+Shift+Up on a heading: its section before the section above, its subsections with it, as one step', src(page) == want and page.evaluate('window.rikuy.hist.length') == h0 + 1, src(page))
    c = page.evaluate('window.rikuy.caretNow().a')
    check('the caret moved with the heading\'s words', src(page)[c - 2:c + 2] == 'Beta', src(page)[c - 6:c + 6])
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
    check('one undo gives the bytes back', src(page) == DOC)
    click_text(page, 'Gamma', 2); key(page, 'Alt+Shift+ArrowDown')
    check('the last section cannot go down: nothing written', src(page) == DOC)
    click_text(page, 'Alpha one', 2); key(page, 'Alt+Shift+ArrowDown')
    check('nor a subsection past the end of its section', src(page) == DOC)
    click_text(page, 'Alpha', 2); key(page, 'Alt+Shift+ArrowDown')
    want = WRAP('\\section{Beta}\nBeta text.\n\n\\section{Alpha}\\label{s:a}\nAlpha text.\n\n\\subsection{Alpha one}\nSub text.\n\n\\section{Gamma}\nGamma text.')
    check('Alt+Shift+Down: past the section after it', src(page) == want, src(page))
    # paragraphs
    paras = WRAP('First para.\n\nSecond para.\n\nThird para.')
    load_doc(page, paras); click_text(page, 'Third', 2); key(page, 'Alt+Shift+ArrowUp')
    check('a paragraph moves above the one before it, the blank line between kept', src(page) == WRAP('First para.\n\nThird para.\n\nSecond para.'), src(page))
    key(page, 'Alt+Shift+ArrowUp')
    check('and again', src(page) == WRAP('Third para.\n\nFirst para.\n\nSecond para.'), src(page))
    # an item of a list among its own
    items = WRAP('\\begin{itemize}\n  \\item one\n  \\item two\n  \\item three\n\\end{itemize}')
    load_doc(page, items); click_text(page, 'three', 2); key(page, 'Alt+Shift+ArrowUp')
    check('an item moves past the item before it, inside its list', src(page) == WRAP('\\begin{itemize}\n  \\item one\n  \\item three\n  \\item two\n\\end{itemize}'), src(page))
    click_text(page, 'one', 1)
    check('the first item cannot go up', page.evaluate("(() => { const g = window.rikuy; return g.cmds.enabled(g, 'move-up', g.ribbonAt()); })()") is False)


def heading_menu(page):
    load_doc(page, DOC); click_text(page, 'Beta', 2)
    page.keyboard.press('Shift+F10'); page.wait_for_timeout(250)
    menu = page.get_by_role('menu', name='Context menu', exact=True)
    names = [menu.get_by_role('menuitem').nth(k).get_attribute('aria-label') for k in range(menu.get_by_role('menuitem').count())]
    check('a heading\'s right click menu: Promote, Demote, New heading before, New heading after, New subheading, Select heading and content',
          names[:6] == ['Promote', 'Demote', 'New heading before', 'New heading after', 'New subheading', 'Select heading and content'], names)
    menu.get_by_role('menuitem', name='New heading after', exact=True).click(); page.wait_for_timeout(250)
    want = DOC.replace('Beta text.\n\n', 'Beta text.\n\n\\section{}\n\n')
    check('New heading after: \\section{} after the section, the caret between its braces', src(page) == want and page.evaluate('window.rikuy.caretNow().a') == want.index('\\section{}') + 9, src(page))
    page.keyboard.type('Inserted'); page.wait_for_timeout(250)
    check('and typing names it', '\\section{Inserted}\n\n\\section{Gamma}' in src(page), src(page))
    load_doc(page, DOC); click_text(page, 'Alpha', 2)
    page.evaluate("window.rikuy.runCommand('heading-before')"); page.wait_for_timeout(200)
    check('New heading before', src(page) == DOC.replace('\\section{Alpha}', '\\section{}\n\n\\section{Alpha}'), src(page))
    load_doc(page, DOC); click_text(page, 'Alpha', 2)
    page.evaluate("window.rikuy.runCommand('subheading-new')"); page.wait_for_timeout(200)
    check('New subheading: one level down at the end of the section', src(page) == DOC.replace('Sub text.\n\n', 'Sub text.\n\n\\subsection{}\n\n'), src(page))
    load_doc(page, DOC); click_text(page, 'Alpha', 2)
    page.evaluate("window.rikuy.runCommand('heading-select')"); page.wait_for_timeout(150)
    sel = page.evaluate('String(getSelection())')
    check('Select heading and content: from the heading to the next of its level', sel.startswith('Alpha') and 'Alpha' in sel and sel.rstrip().endswith('Sub text.') and 'Beta' not in sel, sel)


def pane(page):
    load_doc(page, DOC)
    page.evaluate("window.rikuy.toggleNav(true, 'outline')"); page.wait_for_timeout(250)
    view = page.get_by_role('tabpanel', name='Headings', exact=True)
    rows = page.evaluate("[...document.querySelectorAll('#nv-view .nav-item')].map((b) => b.textContent)")
    check('the Navigation pane opens on Headings: a row for each heading', view.count() == 1 and rows == ['1Alpha', '1.1Alpha one', '2Beta', '3Gamma'], rows)
    check('its box, its tabs and its toolbar by name', page.get_by_role('searchbox', name='Search document', exact=True).count() == 1 and page.get_by_role('tablist', name='Navigation', exact=True).count() == 1
          and all(page.get_by_role('toolbar', name='Outlining', exact=True).get_by_role('button', name=n, exact=True).count() == 1 for n in ('Promote', 'Demote', 'Move up', 'Move down', 'Expand all', 'Collapse all'))
          and page.get_by_role('combobox', name='Show levels', exact=True).count() == 1)
    tree = page.get_by_role('tree', name='Headings', exact=True)
    check('Headings is a tree: its rows tree items named by number and title, with their level', tree.count() == 1 and tree.get_by_role('treeitem', name='1.1 Alpha one', exact=True).get_attribute('aria-level') == '2'
          and tree.get_by_role('treeitem', name='1 Alpha', exact=True).get_attribute('aria-expanded') == 'true')
    tree.get_by_role('treeitem', name='1 Alpha', exact=True).focus(); page.keyboard.press('ArrowLeft'); page.wait_for_timeout(200)
    rows = page.evaluate("[...document.querySelectorAll('#nv-view .nav-item')].map((b) => b.textContent)")
    check('Left on a heading collapses it: those under it hidden, the item says so', rows == ['1Alpha', '2Beta', '3Gamma'] and tree.get_by_role('treeitem', name='1 Alpha', exact=True).get_attribute('aria-expanded') == 'false', rows)
    page.locator('#nv-view .nv-row', has=page.locator('.nav-item', has_text='Alpha')).first.locator('.nv-tog').click(); page.wait_for_timeout(200)
    check('and its triangle expands it again', page.evaluate("document.querySelectorAll('#nv-view .nav-item').length") == 4)
    page.locator('#nv-view .nav-item', has_text='Alpha').first.focus(); page.keyboard.press('ArrowLeft'); page.wait_for_timeout(150)
    page.get_by_role('button', name='Expand all', exact=True).click(); page.wait_for_timeout(200)
    page.get_by_role('combobox', name='Show levels', exact=True).select_option('1'); page.wait_for_timeout(200)
    rows = page.evaluate("[...document.querySelectorAll('#nv-view .nav-item')].map((b) => b.textContent)")
    check('Show levels: Level 1 shows the sections alone', rows == ['1Alpha', '2Beta', '3Gamma'], rows)
    page.get_by_role('combobox', name='Show levels', exact=True).select_option('3'); page.wait_for_timeout(200)
    # the toolbar acts on the row chosen; Alt+Shift and the arrows in the list
    page.locator('#nv-view .nav-item', has_text='Beta').focus(); page.wait_for_timeout(100)
    page.get_by_role('button', name='Demote', exact=True).click(); page.wait_for_timeout(300)
    check('Demote on the toolbar demotes the row chosen (Beta)', src(page) == DOC.replace('\\section{Beta}', '\\subsection{Beta}'), src(page))
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(250)
    page.locator('#nv-view .nav-item', has_text='Gamma').focus(); page.keyboard.press('Alt+Shift+ArrowUp'); page.wait_for_timeout(300)
    check('Alt+Shift+Up in the list moves the row\'s section', src(page).index('\\section{Gamma}') < src(page).index('\\section{Beta}'), src(page))
    check('the row keeps the focus where it went', page.evaluate('document.activeElement.textContent') == '2Gamma', page.evaluate('document.activeElement.textContent'))
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(250)
    page.locator('#nv-view .nav-item', has_text='Alpha one').focus(); page.keyboard.press('ArrowDown')
    check('the arrows move between the rows', page.evaluate('document.activeElement.textContent') == '2Beta')
    # dragging a heading onto another: its section goes before that one, in one step
    h0 = page.evaluate('window.rikuy.hist.length')
    gamma = page.locator('#nv-view .nav-item', has_text='Gamma')
    gamma.drag_to(page.locator('#nv-view .nav-item', has_text='Alpha').first, target_position={'x': 20, 'y': 3}); page.wait_for_timeout(350)
    want = WRAP('\\section{Gamma}\nGamma text.\n\n\\section{Alpha}\\label{s:a}\nAlpha text.\n\n\\subsection{Alpha one}\nSub text.\n\n\\section{Beta}\nBeta text.')
    check('a heading dragged onto the top of another: its section goes before that one, as one step', src(page) == want and page.evaluate('window.rikuy.hist.length') == h0 + 1, src(page))
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(250)
    check('one undo gives the bytes back', src(page) == DOC)
    page.locator('#nv-view .nav-item', has_text='Alpha').first.drag_to(page.locator('#nv-view .nav-item', has_text='Gamma'), target_position={'x': 20, 'y': 20}); page.wait_for_timeout(350)
    want = WRAP('\\section{Beta}\nBeta text.\n\n\\section{Gamma}\nGamma text.\n\n\\section{Alpha}\\label{s:a}\nAlpha text.\n\n\\subsection{Alpha one}\nSub text.')
    check('dropped on the lower half of the last: to the end, before \\end{document}', src(page) == want, src(page))
    load_doc(page, DOC); page.wait_for_timeout(200)
    # Pages and Results
    page.get_by_role('tab', name='Pages', exact=True).click(); page.wait_for_timeout(400)
    n = page.evaluate('window.rikuy.layout.pages.length')
    thumbs = page.get_by_role('tabpanel', name='Pages', exact=True).get_by_role('button')
    check('Pages: one thumbnail a page, named Page n, the one in view marked', thumbs.count() == n and thumbs.first.get_attribute('aria-label') == 'Page 1' and page.evaluate("document.querySelectorAll('.nv-page.cur').length") == 1)
    check('a thumbnail is a drawing only: no ids, no source maps, no frames, nothing to edit', page.evaluate("(() => { const t = document.querySelector('.nv-pgc'); return !!t && !t.querySelector('[id], [data-g], [data-a], [contenteditable], iframe') && t.inert; })()"))
    page.get_by_role('tab', name='Results', exact=True).click(); page.wait_for_timeout(200)
    page.get_by_role('button', name='Search options', exact=True).click(); page.wait_for_timeout(200)
    m = page.get_by_role('menu', name='Search options', exact=True)
    names = [m.get_by_role('menuitem').nth(k).get_attribute('aria-label') for k in range(m.get_by_role('menuitem').count())] + [m.get_by_role('menuitemcheckbox').nth(k).get_attribute('aria-label') for k in range(m.get_by_role('menuitemcheckbox').count())]
    check('Search options: Match case, whole words, wildcards, regular expressions, In LaTeX source; Advanced Find, Replace, Go To; figures, tables, equations, footnotes, comments',
          all(x in names for x in ('Match case', 'Find whole words only', 'Use wildcards', 'Use regular expressions', 'In LaTeX source', 'Advanced Find', 'Replace', 'Go To', 'Find figures', 'Find tables', 'Find equations', 'Find footnotes', 'Find comments')), names)
    page.keyboard.press('Escape')
    page.evaluate("window.rikuy.toggleNav(false)")


def outline_view(page):
    load_doc(page, DOC); click_text(page, 'Beta', 2)
    page.keyboard.press('Control+Alt+o'); page.wait_for_timeout(350)
    st = page.evaluate("[document.body.classList.contains('nav-outline'), [...document.querySelectorAll('#nv-view .nv-row')].map((r) => r.textContent)]")
    check('Ctrl+Alt+O: the Outline view, the panel wide, the paragraphs under their headings', st[0] and st[1] == ['1Alpha', 'Alpha text.', '1.1Alpha one', 'Sub text.', '2Beta', 'Beta text.', '3Gamma', 'Gamma text.'], st)
    page.get_by_role('tablist', name='Ribbon', exact=True).get_by_role('tab', name='View', exact=True).click(); page.wait_for_timeout(200)
    check('View ▸ Outline shows it pressed', page.get_by_role('button', name='Outline', exact=True).get_attribute('aria-pressed') == 'true')
    # a paragraph moved in the Outline view
    page.locator('#nv-view .nv-txt', has_text='Gamma text').focus(); page.keyboard.press('Alt+Shift+ArrowUp'); page.wait_for_timeout(300)
    check('Alt+Shift+Up on a paragraph of the Outline view: above the heading before it', 'Beta text.\n\nGamma text.\n\\section{Gamma}' in src(page) or 'Beta text.\n\nGamma text.\n\n\\section{Gamma}' in src(page), src(page))
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(250)
    page.get_by_role('button', name='Outline', exact=True).click(); page.wait_for_timeout(250)
    check('Outline again leaves it: the panel as it was (closed)', not page.evaluate("document.body.classList.contains('nav-outline') || document.body.classList.contains('nav-on')"))
    page.get_by_role('tablist', name='Ribbon', exact=True).get_by_role('tab', name='Home', exact=True).click()


def review(page):
    """The cases of the hostile review of fa621a4 and 054a1f2, each as the reader wrote it."""
    # 3. a paragraph moved past a heading never runs into the paragraph beyond it
    d1 = WRAP('Para one.\n\n\\section{A}\nPara two.')
    load_doc(page, d1); click_text(page, 'Para one', 2); key(page, 'Alt+Shift+ArrowDown')
    check('review 3: Alt+Shift+Down on a paragraph before a heading: after it, a paragraph of its own (a blank line before Para two)', src(page) == WRAP('\\section{A}\n\nPara one.\n\nPara two.'), src(page))
    d2 = WRAP('Text a.\n\\section{B}\nPara b.')
    load_doc(page, d2); click_text(page, 'Para b', 2); key(page, 'Alt+Shift+ArrowUp')
    check('and Alt+Shift+Up on one under a heading: before it, apart from the text before (Text a.)', src(page) == WRAP('Text a.\n\nPara b.\n\n\\section{B}'), src(page))
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(150)
    check('one undo, the bytes back', src(page) == d2)
    # 5. dragged below the last heading: before the bibliography, not after it
    bib = ('\\documentclass{article}\n\\begin{document}\n\\section{One}\nText one.\n\n\\section{Two}\nText two.\n\\subsection{Two A}\nMore.\n\n'
           '\\bibliographystyle{plain}\n\\bibliography{refs}\n\\end{document}\n')
    load_doc(page, bib)
    page.evaluate('window.rikuy.toggleNav(true, "outline"); window.rikuy.setNavView("headings")'); page.wait_for_timeout(400)
    rows = page.locator('#nv-view .nav-item')
    bb = rows.nth(2).bounding_box()
    rows.nth(0).drag_to(rows.nth(2), target_position={'x': 10, 'y': bb['height'] - 2}); page.wait_for_timeout(500)
    want = bib.replace('\\section{One}\nText one.\n\n', '').replace('More.\n\n', 'More.\n\n\\section{One}\nText one.\n\n')
    check('review 5: a section dropped under the last heading goes to the end of that section, before \\bibliographystyle', src(page) == want, src(page))
    load_doc(page, bib)
    r = page.evaluate('window.rikuy.moveSectionTo(0, -1)'); page.wait_for_timeout(200)
    check('and moveSectionTo(k, -1), "to the end", stops before the bibliography too', r and src(page) == want, src(page))
    load_doc(page, bib)
    page.evaluate('window.rikuy.setOutlineView(true)'); page.wait_for_timeout(400)
    t = page.evaluate("[...document.querySelectorAll('#nv-view .nv-row')].map((r) => r.textContent)")
    txt = page.locator('#nv-view .nv-txt', has_text='Text one')
    last = page.locator('#nv-view .nv-txt').last
    bb = last.bounding_box()
    txt.drag_to(last, target_position={'x': 10, 'y': bb['height'] - 2}); page.wait_for_timeout(500)
    check('a paragraph dropped under the Outline view\'s last row lands after it, before the bibliography (which is no row)', src(page) == bib.replace('Text one.\n\n', '').replace('More.\n\n', 'More.\n\nText one.\n\n') and not any('References' in x for x in t), (src(page), t))
    page.evaluate('window.rikuy.setOutlineView(false)')
    # 8. typing in the Outline view draws one row again, not all of them
    big = WRAP('\n\n'.join(('\\section{S%d}\n' % k if k % 10 == 0 else '') + 'Paragraph number %d with some words in it.' % k for k in range(300)))
    load_doc(page, big); page.wait_for_timeout(300)
    page.evaluate('window.rikuy.setOutlineView(true)'); page.wait_for_timeout(600)
    page.evaluate("[...document.querySelectorAll('#nv-view .nv-row')].forEach((r) => { r.__kept = 1; })")
    click_text(page, 'Paragraph number 5 ', 3); page.keyboard.type('xyz'); page.wait_for_timeout(600)
    st = page.evaluate("(() => { const rs = [...document.querySelectorAll('#nv-view .nv-row')]; return [rs.length, rs.filter((r) => r.__kept).length, rs.filter((r) => r.textContent.includes('Parxyzagraph number 5 ')).length]; })()")
    check('review 8: typing in a paragraph in the Outline view keeps every row element but its own, whose words follow', st[0] > 300 and st[1] == st[0] and st[2] == 1, st)
    page.evaluate('window.rikuy.setOutlineView(false)')
    # low: a file with Windows line breaks keeps them
    crlf = '\\documentclass{article}\r\n\\begin{document}\r\n\\section{A}\r\nText a.\r\n\r\n\\section{B}\r\nText b.\r\n\\end{document}\r\n'
    load_doc(page, crlf); click_text(page, 'B', 0); key(page, 'Alt+Shift+ArrowUp')
    got = src(page)
    check('low: sections moved in a file with Windows line breaks: they stay \\r\\n', got == '\\documentclass{article}\r\n\\begin{document}\r\n\\section{B}\r\nText b.\r\n\r\n\\section{A}\r\nText a.\r\n\\end{document}\r\n', repr(got))
    # low: a theorem's paragraph stays in its theorem; a \noindent paragraph moves with its \noindent
    thm = WRAP('Before.\n\n\\begin{proof}\nFirst of proof.\n\nSecond of proof.\n\\end{proof}\n\nAfter.')
    load_doc(page, thm); click_text(page, 'Second of', 2); key(page, 'Alt+Shift+ArrowUp')
    check('low: Move up in a paragraph of a proof of two paragraphs moves nothing (not the whole proof)', src(page) == thm, src(page))
    ni = WRAP('First para.\n\n\\noindent Second para.')
    load_doc(page, ni); click_text(page, 'Second para', 2); key(page, 'Alt+Shift+ArrowUp')
    check('low: a paragraph that starts with \\noindent moves, its \\noindent with it', src(page) == WRAP('\\noindent Second para.\n\nFirst para.'), src(page))


def pdf_check(page):
    if not os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        print('SKIP the PDF of a promoted heading: no TeX tree in %s' % DIST)
        return
    try:
        from pypdf import PdfReader
    except ImportError:
        print('SKIP the PDF of a promoted heading: pypdf is not installed')
        return
    load_doc(page, DOC); click_text(page, 'Alpha one', 2); key(page, 'Alt+Shift+ArrowLeft')
    page.set_default_timeout(600000)
    r = page.evaluate("""async () => { const r = await window.rikuy.api.compile(); let s = ''; if (r.pdf) for (let i = 0; i < r.pdf.length; i += 8192) s += String.fromCharCode(...r.pdf.subarray(i, i + 8192)); return { ok: r.ok, pdf: s ? btoa(s) : '' }; }""")
    page.set_default_timeout(30000)
    text = PdfReader(io.BytesIO(base64.b64decode(r['pdf']))).pages[0].extract_text() if r['pdf'] else ''
    check('compiled in the page, the promoted heading prints as section 2 and Beta becomes 3', r['ok'] and '2 Alpha one' in text and '3 Beta' in text, text[:200])


def run():
    with sync_playwright() as p:
        browser, page, errors = open_page(p)
        for f in (promote_demote, moves, heading_menu, pane, outline_view, review, pdf_check):
            try: f(page)
            except Exception as e: check(f.__name__ + ' runs to its end', False, str(e)[:400])
        check('no page errors', not [e for e in errors if 'tree.wasm' not in e and 'TeX' not in e], errors[:4])
        browser.close()
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    run()
