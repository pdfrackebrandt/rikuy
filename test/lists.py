"""Lists as Word has them (src/lists.js, src/cmd/lists.js, src/ui/listdialog.js), in Chromium.

The round trip rule of GAP section 0 on every list command: written exactly, one step, one undo
to the bytes, read back as the control's state, hand written forms recognised and taken off, off
restoring. Tab and Shift+Tab in a list item (and Increase and Decrease Indent): the item a level
down under the item before it, into the list that ends that item, back up with the items after it
under it, several items at once, the caret kept in its words, the first item refused with a word
why, Shift+Tab at the first level leaving the page as everywhere, a table cell's Tab its own; Enter
in an empty nested item takes it a level up. Bulleted list and Numbered list on paragraphs, on a
nested item, on a labelled item (its label kept as words, PLAN task 29) and on a description's
term; the bullet and numbering libraries as tiles in their menus (the list's own checked; a pandoc
list's \\def\\labelenumi and the enumerate package's "(a)" checked and rewritten where they are);
Define New Bullet and Define New Number Format; Set Numbering Value, Restart at 1, Continue
Numbering; List spacing; Multilevel list (\\setlist lines, checked, LaTeX's own again); Change
List Level; the description list; Sort, of a list's items and of paragraphs; Word's automatic
lists ("- ", "1. ", "a) "), joined to the list before, Undo giving back the typed text, Options'
switch. The page draws each as TeX prints it. Where dist/tex exists, a document with every kind of
list Rikuy writes compiles with pdfLaTeX, XeLaTeX and LuaLaTeX and prints those labels.

RIKUY_DIST names another dist/."""
import os, sys, base64, io, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import open_page, check, results, src, load_doc, click_text, select_text, roundtrip
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist')
WRAP = lambda body, pre='': '\\documentclass{article}\n' + pre + '\\begin{document}\n' + body + '\n\\end{document}\n'
EI = '\\usepackage{enumitem}\n'
L3 = WRAP('\\begin{itemize}\n  \\item One\n  \\item Two\n  \\item Three\n\\end{itemize}')
L3N = WRAP('\\begin{itemize}\n  \\item One\n    \\begin{itemize}\n      \\item Two\n    \\end{itemize}\n  \\item Three\n\\end{itemize}')
E3 = WRAP('\\begin{enumerate}\n  \\item One\n  \\item Two\n  \\item Three\n\\end{enumerate}')


def run(page, cid, args=None):
    r = page.evaluate('([id, a]) => window.rikuy.runCommand(id, a)', [cid, args]); page.wait_for_timeout(200)
    return r


def key(page, k):
    page.keyboard.press(k); page.wait_for_timeout(250)


def hist(page):
    return page.evaluate('window.rikuy.hist.length')


def labels(page):
    return page.evaluate("[...document.querySelectorAll('#pages .lbl')].map((x) => x.textContent)")


def tile(page, arrow, name):
    """Open a list button's menu and press its tile (or item) of that name"""
    page.click(arrow); page.wait_for_timeout(200)
    page.get_by_role('menu').get_by_role('menuitemradio', name=name, exact=True).click(); page.wait_for_timeout(250)


def checked(page, arrow, name):
    page.click(arrow); page.wait_for_timeout(200)
    v = page.get_by_role('menu').get_by_role('menuitemradio', name=name, exact=True).get_attribute('aria-checked')
    page.keyboard.press('Escape'); page.wait_for_timeout(100)
    return v == 'true'


def state(page, cid):
    return page.evaluate("(id) => { const g = window.rikuy, at = g.ribbonAt(); if (at) at.memo = {}; const c = g.cmds.command(id); return [g.cmds.enabled(g, c, at), c.on ? c.on(g, at) : null, c.whyNot ? c.whyNot(g, at) : '']; }", cid)


def levels(page):
    roundtrip(page, L3, ('Two', 1), 'indent-increase', L3N, off_command='indent-decrease', label='Increase Indent in a list: the item one level down')
    roundtrip(page, L3N, ('Two', 1), 'indent-decrease', L3, off_command='indent-increase', label='Decrease Indent in a list: the item one level up')
    # the keys
    load_doc(page, L3); click_text(page, 'Two', 2); h0 = hist(page)
    key(page, 'Tab')
    check('Tab in a list item: the item one level down, one step', src(page) == L3N and hist(page) == h0 + 1, src(page)[40:])
    c = page.evaluate('window.rikuy.caretNow().a')
    check('the caret stays in the item\'s words', src(page)[c - 2:c + 1] == 'Two', src(page)[c - 5:c + 5])
    check('the page draws the item at the second level, with its dash', labels(page) == ['•', '–', '•'], labels(page))
    key(page, 'Shift+Tab')
    check('Shift+Tab: back to the bytes of before', src(page) == L3, src(page)[40:])
    load_doc(page, L3N); click_text(page, 'Three', 1); key(page, 'Tab')
    check('Tab joins the list that ends the item before', src(page) == WRAP('\\begin{itemize}\n  \\item One\n    \\begin{itemize}\n      \\item Two\n      \\item Three\n    \\end{itemize}\n\\end{itemize}'), src(page)[40:])
    load_doc(page, L3); click_text(page, 'One', 1); key(page, 'Tab')
    focused = page.evaluate("document.activeElement && document.activeElement.id")
    check('Tab on the first item writes nothing, keeps the focus on the page, says why', src(page) == L3 and focused == 'pages' and 'first item' in page.evaluate("document.getElementById('toast').textContent"), (focused, page.evaluate("document.getElementById('toast').textContent")))
    st = state(page, 'indent-increase')
    check('Increase Indent is disabled there and says why', st[0] is False and 'first item' in st[2], st)
    load_doc(page, L3); click_text(page, 'Two', 1); key(page, 'Shift+Tab')
    check('Shift+Tab at the first level leaves the source alone (the keyboard\'s way off the page)', src(page) == L3)
    # several items at once
    load_doc(page, E3)
    page.evaluate('''() => { const sp = [...document.querySelectorAll('#pages span.t')]; const a = sp.find((x) => x.textContent.includes('Two')), b = sp.find((x) => x.textContent.includes('Three'));
      const r = document.createRange(); r.setStart(a.firstChild, 1); r.setEnd(b.firstChild, 2); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }''')
    page.wait_for_timeout(100); key(page, 'Tab')
    check('Tab on two selected items moves both, as one list', src(page) == WRAP('\\begin{enumerate}\n  \\item One\n    \\begin{enumerate}\n      \\item Two\n      \\item Three\n    \\end{enumerate}\n\\end{enumerate}'), src(page)[40:])
    check('the page numbers them (a) and (b), as TeX does', labels(page) == ['1.', '(a)', '(b)'], labels(page))
    sel = page.evaluate('(() => { const c = window.rikuy.caretNow(); return [c.collapsed, window.rikuy.src("main.tex").slice(c.a, c.b)]; })()')
    check('the selection stays on the same words', sel[0] is False and sel[1].startswith('wo') and sel[1].endswith('Th'), sel)
    # Enter in an empty nested item takes it a level up, as Word
    load_doc(page, WRAP('\\begin{itemize}\n  \\item One\n    \\begin{itemize}\n      \\item Two\n    \\end{itemize}\n\\end{itemize}')); click_text(page, 'Two', 3)
    key(page, 'Enter')
    check('Enter at an item\'s end makes the next item', '\\item Two\n      \\item ' in src(page), src(page)[40:])
    key(page, 'Enter')
    check('Enter in that empty nested item takes it a level up (Word\'s way out of a level)', src(page) == WRAP('\\begin{itemize}\n  \\item One\n    \\begin{itemize}\n      \\item Two\n    \\end{itemize}\n  \\item \n\\end{itemize}'), src(page)[40:])
    # a table cell keeps its own Tab
    tab = WRAP('\\begin{itemize}\n  \\item One\n\\end{itemize}\n\n\\begin{tabular}{ll}\na & b \\\\\n\\end{tabular}')
    load_doc(page, tab); click_text(page, 'a', 0); key(page, 'Tab')
    check('Tab in a table cell is the table\'s (the source unchanged, no list command)', src(page) == tab)
    # Change List Level: two levels in one step
    load_doc(page, WRAP('\\begin{itemize}\n  \\item A\n  \\item B\n    \\begin{itemize}\n      \\item C\n    \\end{itemize}\n  \\item D\n\\end{itemize}')); click_text(page, 'D', 1)
    h0 = hist(page); run(page, 'list-level', {'level': 3})
    check('Change List Level to level 3: two levels at once, one undo', '        \\item D' in src(page) and hist(page) == h0 + 1 and labels(page)[-1] == '∗', (src(page)[40:], labels(page)))
    load_doc(page, L3); click_text(page, 'Two', 1)
    run(page, 'list-level'); page.wait_for_timeout(150)
    names = page.evaluate("[...document.querySelectorAll('.pop-menu [role^=menuitem]')].map((x) => x.getAttribute('aria-label') + ':' + x.getAttribute('aria-checked') + ':' + (x.getAttribute('aria-disabled') || ''))")
    page.keyboard.press('Escape')
    check('Change List Level\'s menu: Level 1 checked, Level 2 offered', names[:2] == ['Level 1:true:', 'Level 2:false:'], names)
    # LaTeX's limit: four levels
    deep = WRAP('\\begin{itemize}\\item a\\begin{itemize}\\item b\\begin{itemize}\\item c\\begin{itemize}\\item d\\item e\\end{itemize}\\end{itemize}\\end{itemize}\\end{itemize}')
    load_doc(page, deep); click_text(page, 'e', 0); key(page, 'Tab')
    check('a fifth level is refused (LaTeX nests four), with a word why', src(page) == deep and '4 deep' in page.evaluate("document.getElementById('toast').textContent"), page.evaluate("document.getElementById('toast').textContent"))


def toggles(page):
    para = WRAP('First words.\n\nSecond words.')
    roundtrip(page, para, ('Second', 2), 'bullets', WRAP('First words.\n\n\\begin{itemize}\n  \\item Second words.\n\\end{itemize}'), label='Bulleted list on a paragraph')
    roundtrip(page, para, ('Second', 2), 'description-list', WRAP('First words.\n\n\\begin{description}\n  \\item Second words.\n\\end{description}'), label='Description list on a paragraph')
    # a nested item made a paragraph of the item above, and back (PLAN task 29's labelled item too)
    load_doc(page, WRAP('\\begin{itemize}\n  \\item One\n    \\begin{itemize}\n      \\item Two\n      \\item Three\n    \\end{itemize}\n\\end{itemize}')); click_text(page, 'Two', 1)
    run(page, 'bullets')
    check('Bulleted list on a nested item: a paragraph of the item above, the item after it a list of its own', src(page) == WRAP('\\begin{itemize}\n  \\item One\n\n    Two\n\n    \\begin{itemize}\n      \\item Three\n    \\end{itemize}\n\\end{itemize}'), src(page)[40:])
    lab = WRAP('\\begin{itemize}\n  \\item[a)] one\n  \\item[b)] two\n\\end{itemize}')
    load_doc(page, lab); click_text(page, 'two', 1)
    st = state(page, 'bullets')
    check('a labelled item is offered the way back to a paragraph now (PLAN task 29)', st[0] is True and st[1] is True, st)
    run(page, 'bullets')
    check('its label stays as its first words', src(page) == WRAP('\\begin{itemize}\n  \\item[a)] one\n\\end{itemize}\n\nb) two'), src(page)[40:])
    desc = WRAP('\\begin{description}\n  \\item[Term] Its meaning.\n\\end{description}')
    load_doc(page, desc); click_text(page, 'meaning', 1); run(page, 'description-list')
    check('a description item made a paragraph keeps its term in bold', src(page) == WRAP('\\textbf{Term} Its meaning.'), src(page)[40:])
    # Numbered on a nested bulleted list: only that list changes kind
    load_doc(page, L3N); click_text(page, 'Two', 1); run(page, 'numbering')
    check('Numbered list in a nested bulleted list: that list becomes numbered', src(page) == L3N.replace('    \\begin{itemize}', '    \\begin{enumerate}').replace('    \\end{itemize}', '    \\end{enumerate}'), src(page)[40:])
    check('drawn 1. (an enumerate in an itemize is the first numbered level, as TeX numbers it)', labels(page) == ['•', '1.', '•'], labels(page))


def libraries(page):
    # numbering library: a tile writes enumitem's label= (and loads enumitem once)
    roundtrip(page, E3, ('Two', 1), lambda pg: tile(pg, '#rb-ol-x', 'Letters a) b) c)'), WRAP('\\begin{enumerate}[label=\\alph*)]\n  \\item One\n  \\item Two\n  \\item Three\n\\end{enumerate}', EI),
              off=WRAP('\\begin{enumerate}\n  \\item One\n  \\item Two\n  \\item Three\n\\end{enumerate}', EI), off_command=lambda pg: tile(pg, '#rb-ol-x', 'Numbers 1. 2. 3.'), label='Numbering library: Letters a) b) c)')
    load_doc(page, WRAP('\\begin{enumerate}[label=\\alph*)]\n  \\item One\n  \\item Two\n\\end{enumerate}', EI)); click_text(page, 'Two', 1)
    check('the list\'s own format is the checked tile, and the page draws it', checked(page, '#rb-ol-x', 'Letters a) b) c)') and labels(page) == ['a)', 'b)'], labels(page))
    # hand written: a pandoc list (\def\labelenumi) and the enumerate package's short label
    pd = WRAP('\\begin{enumerate}\n\\def\\labelenumi{\\alph{enumi})}\n  \\item One\n  \\item Two\n\\end{enumerate}')
    load_doc(page, pd); click_text(page, 'Two', 1)
    check('a pandoc list (\\def\\labelenumi) shows its format checked and drawn', checked(page, '#rb-ol-x', 'Letters a) b) c)') and labels(page) == ['a)', 'b)'], labels(page))
    tile(page, '#rb-ol-x', 'Roman numerals i. ii. iii.')
    check('and is rewritten where it is written, in its own terms', src(page) == pd.replace('\\alph{enumi})', '\\roman{enumi}.') and labels(page) == ['i.', 'ii.'], src(page)[40:])
    sh = WRAP('\\begin{enumerate}[(a)]\n  \\item One\n\\end{enumerate}', '\\usepackage{enumerate}\n')
    load_doc(page, sh); click_text(page, 'One', 1)
    check('the enumerate package\'s "(a)" shows checked', checked(page, '#rb-ol-x', 'Letters (a) (b) (c)'))
    tile(page, '#rb-ol-x', 'Capital letters A. B. C.')
    check('and becomes its "A." (no enumitem beside the enumerate package)', src(page) == sh.replace('[(a)]', '[A.]'), src(page)[:120])
    # bullets
    roundtrip(page, L3, ('Two', 1), lambda pg: tile(pg, '#rb-ul-x', 'Hollow round bullet'), WRAP('\\begin{itemize}[label=$\\circ$]\n  \\item One\n  \\item Two\n  \\item Three\n\\end{itemize}', EI),
              off=WRAP('\\begin{itemize}\n  \\item One\n  \\item Two\n  \\item Three\n\\end{itemize}', EI), off_command=lambda pg: tile(pg, '#rb-ul-x', 'Round bullet'), label='Bullet library: hollow round bullet')
    load_doc(page, L3); click_text(page, 'Two', 1); tile(page, '#rb-ul-x', 'Check mark bullet')
    check('a check mark bullet loads amssymb with enumitem, and the page draws ✓', '\\usepackage{enumitem}\n\\usepackage{amssymb}' in src(page) or '\\usepackage{amssymb}\n\\usepackage{enumitem}' in src(page) and labels(page) == ['✓'] * 3, (src(page)[:120], labels(page)))
    nx = WRAP('\\begin{itemize}\n  \\item One\n\\end{itemize}', '\\usepackage{newtxmath}\n')
    load_doc(page, nx); click_text(page, 'One', 1); tile(page, '#rb-ul-x', 'Square bullet')
    check('with newtxmath (which has amssymb\'s symbols and clashes with it) no amssymb is added', 'amssymb' not in src(page) and 'label=\\tiny$\\blacksquare$' in src(page), src(page)[:160])
    hw = WRAP('\\begin{itemize}\n  \\renewcommand{\\labelitemi}{$\\circ$}\n  \\item One\n\\end{itemize}')
    load_doc(page, hw); click_text(page, 'One', 1)
    check('a hand written \\renewcommand{\\labelitemi} shows its bullet checked and drawn', checked(page, '#rb-ul-x', 'Hollow round bullet') and labels(page) == ['◦'], labels(page))
    # a library on paragraphs makes the list with it; on the other kind it changes the kind too
    load_doc(page, WRAP('Alpha.\n\nBeta.')); click_text(page, 'Beta', 1); tile(page, '#rb-ol-x', 'Roman numerals I. II. III.')
    check('a format on a paragraph: a numbered list with it', src(page) == WRAP('Alpha.\n\n\\begin{enumerate}[label=\\Roman*.]\n  \\item Beta.\n\\end{enumerate}', EI), src(page)[:160])
    load_doc(page, L3); click_text(page, 'Two', 1); tile(page, '#rb-ol-x', 'Letters a. b. c.')
    check('a format on a bulleted list: numbered, with it, in one step', src(page) == WRAP('\\begin{enumerate}[label=\\alph*.]\n  \\item One\n  \\item Two\n  \\item Three\n\\end{enumerate}', EI) and hist(page) == 1, src(page)[:160])
    # None
    load_doc(page, E3); click_text(page, 'Two', 1); tile(page, '#rb-ol-x', 'None')
    check('None: the item becomes a paragraph', src(page) == WRAP('\\begin{enumerate}\n  \\item One\n\\end{enumerate}\n\nTwo\n\n\\begin{enumerate}\n  \\item Three\n\\end{enumerate}'), src(page)[40:])
    # Define New Bullet and Define New Number Format
    load_doc(page, L3); click_text(page, 'Two', 1); run(page, 'bullet-define')
    page.get_by_role('dialog', name='Define New Bullet').get_by_role('radio', name='Large star').click()
    page.get_by_role('dialog', name='Define New Bullet').get_by_role('button', name='OK').click(); page.wait_for_timeout(250)
    check('Define New Bullet: a symbol of its grid', 'label=$\\bigstar$' in src(page) and labels(page) == ['★'] * 3, (src(page)[:200], labels(page)))
    load_doc(page, L3); click_text(page, 'Two', 1); run(page, 'bullet-define')
    d = page.get_by_role('dialog', name='Define New Bullet')
    d.get_by_label('Character or LaTeX', exact=True).fill('{\\bf x')
    d.get_by_role('button', name='OK').click(); page.wait_for_timeout(200)
    check('LaTeX that does not balance is refused with a word, nothing written', src(page) == L3 and 'balance' in d.get_by_role('alert').text_content(), d.get_by_role('alert').text_content())
    d.get_by_label('Character or LaTeX', exact=True).fill('»&')
    d.get_by_role('button', name='OK').click(); page.wait_for_timeout(250)
    check('a character typed is written as text, escaped', 'label=»\\&' in src(page) or 'label={»\\&}' in src(page), src(page)[:200])
    load_doc(page, E3); click_text(page, 'Two', 1); run(page, 'number-define')
    d = page.get_by_role('dialog', name='Define New Number Format')
    d.get_by_label('Number style', exact=True).select_option('Roman')
    d.get_by_label('Text before', exact=True).fill('Part ')
    d.get_by_label('Text after', exact=True).fill(':')
    d.get_by_role('spinbutton', name='Start at').fill('3')
    d.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    check('Define New Number Format: its style, text and start', '\\begin{enumerate}[label=Part \\Roman*:,start=3]' in src(page) and labels(page)[:2] == ['Part III:', 'Part IV:'], (src(page)[:200], labels(page)))
    check('as one undo... and its start as another (Word\'s dialog does both)', hist(page) == 2)


def numbering(page):
    roundtrip(page, E3, ('Two', 1), lambda pg: run(pg, 'list-value', {'value': 5}), WRAP('\\begin{enumerate}[start=5]\n  \\item One\n  \\item Two\n  \\item Three\n\\end{enumerate}', EI),
              off=WRAP('\\begin{enumerate}\n  \\item One\n  \\item Two\n  \\item Three\n\\end{enumerate}', EI), off_command=lambda pg: run(pg, 'list-value', {'value': 1}), label='Set Numbering Value 5')
    load_doc(page, WRAP('\\begin{enumerate}[start=5]\n  \\item One\n\\end{enumerate}', EI)); click_text(page, 'One', 1)
    check('the page draws 5.', labels(page) == ['5.'], labels(page))
    pd = WRAP('\\begin{enumerate}\n\\setcounter{enumi}{4}\n  \\item One\n\\end{enumerate}')
    load_doc(page, pd); click_text(page, 'One', 1)
    check('a hand written \\setcounter{enumi}{4} draws 5.', labels(page) == ['5.'], labels(page))
    run(page, 'list-value', {'value': 8})
    check('and Set Numbering Value rewrites it where it is', src(page) == pd.replace('{4}', '{7}'), src(page)[40:])
    run(page, 'list-value', {'value': 1})
    check('1 takes it off', src(page) == WRAP('\\begin{enumerate}\n  \\item One\n\\end{enumerate}'), src(page)[40:])
    two = WRAP('\\begin{enumerate}\n  \\item One\n  \\item Two\n\\end{enumerate}\n\nBetween.\n\n\\begin{enumerate}\n  \\item Three\n\\end{enumerate}')
    roundtrip(page, two, ('Three', 1), 'list-continue', two.replace('\\begin{enumerate}\n  \\item Three', '\\begin{enumerate}[resume]\n  \\item Three').replace('\\begin{document}', '\\usepackage{enumitem}\n\\begin{document}'),
              off=two.replace('\\begin{document}', '\\usepackage{enumitem}\n\\begin{document}'), off_command='list-restart', label='Continue Numbering')
    load_doc(page, two.replace('\\begin{enumerate}\n  \\item Three', '\\begin{enumerate}[resume]\n  \\item Three').replace('\\begin{document}', '\\usepackage{enumitem}\n\\begin{document}')); click_text(page, 'Three', 1)
    check('the page continues: 3.', labels(page) == ['1.', '2.', '3.'], labels(page))
    load_doc(page, E3); click_text(page, 'Two', 1); run(page, 'list-restart')
    check('Restart at 1 on a middle item: a new list from it', src(page) == WRAP('\\begin{enumerate}\n  \\item One\n\\end{enumerate}\n\\begin{enumerate}\n  \\item Two\n  \\item Three\n\\end{enumerate}') and labels(page) == ['1.', '1.', '2.'], (src(page)[40:], labels(page)))
    load_doc(page, E3); click_text(page, 'One', 1)
    check('Restart at 1 and Continue Numbering are off where they mean nothing', state(page, 'list-restart')[0] is False and state(page, 'list-continue')[0] is False)
    # the dialog
    load_doc(page, E3); click_text(page, 'Two', 1); run(page, 'list-value')
    d = page.get_by_role('dialog', name='Set Numbering Value')
    check('Set Numbering Value: Continue is off with no list before', d.get_by_role('radio', name='Continue from previous list').is_disabled())
    d.get_by_role('spinbutton', name='Set value to').fill('4'); d.get_by_role('spinbutton', name='Set value to').press('Tab')
    d.get_by_role('button', name='OK').click(); page.wait_for_timeout(250)
    check('its OK writes the start', '[start=4]' in src(page) and labels(page) == ['4.', '5.', '6.'], labels(page))
    # spacing
    roundtrip(page, L3, ('Two', 1), lambda pg: run(pg, 'list-spacing', {'sep': 'nosep'}), WRAP('\\begin{itemize}[nosep]\n  \\item One\n  \\item Two\n  \\item Three\n\\end{itemize}', EI),
              off=WRAP('\\begin{itemize}\n  \\item One\n  \\item Two\n  \\item Three\n\\end{itemize}', EI), off_command=lambda pg: run(pg, 'list-spacing', {'sep': None}), label='List spacing: compact')
    tight = WRAP('\\begin{itemize}\n  \\setlength{\\itemsep}{0pt}\n  \\item One\n  \\item Two\n\\end{itemize}')
    load_doc(page, tight); click_text(page, 'Two', 1)
    gap = page.evaluate("(() => { const it = [...document.querySelectorAll('#pages .it')].filter((x) => x.dataset.li); return it[1].getBoundingClientRect().top - it[0].getBoundingClientRect().bottom; })()")
    load_doc(page, L3); click_text(page, 'Two', 1)
    gap0 = page.evaluate("(() => { const it = [...document.querySelectorAll('#pages .it')].filter((x) => x.dataset.li); return it[1].getBoundingClientRect().top - it[0].getBoundingClientRect().bottom; })()")
    check('a hand written \\setlength{\\itemsep}{0pt} draws the items closer', gap < gap0, (gap, gap0))
    load_doc(page, tight); click_text(page, 'Two', 1); run(page, 'list-spacing', {'sep': 'nosep'})
    check('List spacing replaces it with the option', src(page) == WRAP('\\begin{itemize}[nosep]\n  \\item One\n  \\item Two\n\\end{itemize}', EI), src(page)[:200])


def multilevel(page):
    ml = WRAP('\\begin{enumerate}\n  \\item One\n\\end{enumerate}', EI)
    want = WRAP('\\begin{enumerate}\n  \\item One\n\\end{enumerate}', EI + '\\setlist[enumerate,1]{label=\\arabic*.}\n\\setlist[enumerate,2]{label=\\arabic{enumi}.\\arabic*.}\n\\setlist[enumerate,3]{label=\\arabic{enumi}.\\arabic{enumii}.\\arabic*.}\n\\setlist[enumerate,4]{label=\\arabic{enumi}.\\arabic{enumii}.\\arabic{enumiii}.\\arabic*.}\n')
    pick = lambda name: (lambda pg: (pg.click('#rb-ml'), pg.wait_for_timeout(200), pg.get_by_role('menu').get_by_role('menuitemradio', name=name, exact=True).click(), pg.wait_for_timeout(250)))
    roundtrip(page, ml, ('One', 1), pick('Multilevel 1. 1.1. 1.1.1.'), want, off_command=pick('LaTeX\'s numbering 1. (a) i. A.'), label='Multilevel list 1. 1.1. 1.1.1.')
    load_doc(page, want); click_text(page, 'One', 1); key(page, 'Enter'); page.keyboard.type('Sub'); page.wait_for_timeout(200); key(page, 'Tab')
    check('with it, a level two item reads 1.1.', labels(page) == ['1.', '1.1.'], labels(page))
    page.click('#rb-ml'); page.wait_for_timeout(200)
    on = page.get_by_role('menu').get_by_role('menuitemradio', name='Multilevel 1. 1.1. 1.1.1.', exact=True).get_attribute('aria-checked')
    page.keyboard.press('Escape')
    check('and the preset shows checked', on == 'true')
    load_doc(page, L3); click_text(page, 'Two', 1)
    pick('Multilevel 1) a) i)')(page)
    check('a numbered preset in a bulleted list makes the list numbered too', '\\begin{enumerate}\n  \\item One' in src(page) and '\\setlist[enumerate,2]{label=\\alph*)}' in src(page) and labels(page) == ['1)', '2)', '3)'], (src(page)[:300], labels(page)))
    check('in one undo', hist(page) == 1)
    load_doc(page, L3); click_text(page, 'Two', 1); run(page, 'multilevel-define')
    d = page.get_by_role('dialog', name='Define New Multilevel List')
    d.get_by_label('List', exact=True).select_option('item')
    d.get_by_label('Level 1 bullet', exact=True).select_option('$\\star$')
    d.get_by_role('button', name='OK').click(); page.wait_for_timeout(250)
    check('Define New Multilevel List: the bullets of each level', '\\setlist[itemize,1]{label=$\\star$}' in src(page) and labels(page) == ['⋆'] * 3, (src(page)[:400], labels(page)))


def sorting(page):
    fruit = WRAP('\\begin{itemize}\n  \\item Pear\n  \\item \\textbf{apple}\n  \\item Fig\n\\end{itemize}')
    roundtrip(page, fruit, ('Fig', 1), lambda pg: run(pg, 'sort', {'order': 'ascending'}), WRAP('\\begin{itemize}\n  \\item \\textbf{apple}\n  \\item Fig\n  \\item Pear\n\\end{itemize}'),
              off=WRAP('\\begin{itemize}\n  \\item Pear\n  \\item Fig\n  \\item \\textbf{apple}\n\\end{itemize}'), off_command=lambda pg: run(pg, 'sort', {'order': 'descending'}), label='Sort a list\'s items by their words')
    paras = WRAP('Charlie here.\n\nAlpha here.\n\nBravo here.')
    load_doc(page, paras)
    page.evaluate('''() => { const sp = [...document.querySelectorAll('#pages span.t')]; const a = sp.find((x) => x.textContent.includes('Charlie')), b = sp.find((x) => x.textContent.includes('Bravo'));
      const r = document.createRange(); r.setStart(a.firstChild, 0); r.setEnd(b.firstChild, 3); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }''')
    page.wait_for_timeout(100); run(page, 'sort')
    d = page.get_by_role('dialog', name='Sort Text')
    check('Sort Text says what it sorts', 'Sort 3 paragraphs' in d.text_content(), d.text_content())
    d.get_by_role('radio', name='Descending').check(); d.get_by_role('button', name='OK').click(); page.wait_for_timeout(250)
    check('Sort: the selected paragraphs, descending', src(page) == WRAP('Charlie here.\n\nBravo here.\n\nAlpha here.'), src(page)[40:])
    load_doc(page, WRAP('Only one.')); click_text(page, 'Only', 1)
    check('Sort is off on one paragraph and says why', state(page, 'sort')[0] is False and 'select' in state(page, 'sort')[2].lower(), state(page, 'sort'))


def autolists(page):
    load_doc(page, WRAP('First.\n\nSecond words.')); click_text(page, 'Second', 0)
    h0 = hist(page)
    page.keyboard.type('- '); page.wait_for_timeout(300)
    check('"- " at a paragraph\'s start: a bulleted list', src(page) == WRAP('First.\n\n\\begin{itemize}\n  \\item Second words.\n\\end{itemize}'), src(page)[40:])
    c = page.evaluate('window.rikuy.caretNow().a')
    check('the caret before the item\'s words', src(page)[c:c + 6] == 'Second', src(page)[c - 5:c + 6])
    key(page, 'Control+z')
    check('Undo gives back what was typed', src(page) == WRAP('First.\n\n- Second words.'), src(page)[40:])
    load_doc(page, WRAP('Intro.\n\nThe end.')); click_text(page, 'The end', 0); page.keyboard.type('a) '); page.wait_for_timeout(300)
    check('"a) ": a numbered list in that format', src(page) == WRAP('Intro.\n\n\\begin{enumerate}[label=\\alph*)]\n  \\item The end.\n\\end{enumerate}', EI) and labels(page) == ['a)'], (src(page)[:200], labels(page)))
    load_doc(page, WRAP('Intro.\n\nLater.')); click_text(page, 'Later', 0); page.keyboard.type('3. '); page.wait_for_timeout(300)
    check('"3. ": numbered from 3', '\\begin{enumerate}[start=3]' in src(page) and labels(page) == ['3.'], (src(page)[:200], labels(page)))
    lst = WRAP('\\begin{enumerate}\n  \\item One\n\\end{enumerate}\n\nNext one.')
    load_doc(page, lst); click_text(page, 'Next', 0); page.keyboard.type('2. '); page.wait_for_timeout(300)
    check('"2. " right after a list of one item goes on with that list', src(page) == WRAP('\\begin{enumerate}\n  \\item One\n  \\item Next one.\n\\end{enumerate}'), src(page)[40:])
    load_doc(page, WRAP('In 1. place')); click_text(page, 'place', 0); page.keyboard.type('- '); page.wait_for_timeout(250)
    check('in the middle of a paragraph "- " is text', src(page) == WRAP('In 1. - place'), src(page)[40:])
    page.evaluate('window.rikuy.prefs.autoLists = false')
    load_doc(page, WRAP('Intro.\n\nWords.')); click_text(page, 'Words', 0); page.keyboard.type('* '); page.wait_for_timeout(250)
    check('Options\' switch (prefs.autoLists false): "* " stays text', src(page) == WRAP('Intro.\n\n* Words.'), src(page)[40:])
    page.evaluate('window.rikuy.prefs.autoLists = true')


def menus(page):
    load_doc(page, E3); click_text(page, 'Two', 1)
    page.click('#rb-ol-x'); page.wait_for_timeout(200)
    page.keyboard.press('ArrowRight'); page.keyboard.press('ArrowDown')
    f = page.evaluate('document.activeElement.getAttribute("aria-label")')
    page.keyboard.press('Escape')
    check('the library\'s tiles: the arrow keys move in two directions (right one, down a row of three)', f == 'Capital letters A. B. C.', f)
    # the right click menu of a list item has the list's commands
    load_doc(page, E3); click_text(page, 'Two', 1)
    page.keyboard.press('Shift+F10'); page.wait_for_timeout(200)
    names = page.evaluate("[...document.querySelectorAll('.pop-ctx [role^=menuitem]')].map((x) => x.getAttribute('aria-label'))")
    page.keyboard.press('Escape')
    check('a list item\'s right click menu: Increase Indent, Decrease Indent, Restart at 1, Set Numbering Value', all(n in names for n in ('Bulleted list', 'Numbered list', 'Increase Indent', 'Decrease Indent', 'Restart at 1', 'Set Numbering Value', 'List spacing', 'Sort')), names)
    # the search box finds them by Word's names
    box = page.get_by_role('combobox', name='Search', exact=True)
    got = []
    for q in ('restart', 'multilevel', 'indent', 'sort'):
        box.click(); box.fill(q); page.wait_for_timeout(150)
        got.append(page.get_by_role('listbox', name='Commands', exact=True).get_by_role('option').all_inner_texts()[:1])
    page.keyboard.press('Escape')
    check('the search box finds Restart at 1, Multilevel list, Increase Indent, Sort by Word\'s words', [g[0].split('\n')[0] if g else '' for g in got] == ['Restart at 1', 'Multilevel list', 'Increase Indent', 'Sort'], got)


def pdf_check(page):
    if os.environ.get('LISTS_NO_PDF'):
        return
    if not os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        print('SKIP the PDF of every list Rikuy writes: no TeX tree in %s' % DIST)
        return
    try:
        from pypdf import PdfReader
    except ImportError:
        print('SKIP the PDF of every list Rikuy writes: pypdf is not installed')
        return
    body = ('\\begin{enumerate}[label=\\alph*),start=3,nosep]\n  \\item Alpha\n    \\begin{itemize}[label=\\tiny$\\blacksquare$]\n      \\item Square\n    \\end{itemize}\n  \\item Beta\n\\end{enumerate}\n\nText.\n\n'
            '\\begin{enumerate}[resume]\n  \\item Gamma\n\\end{enumerate}\n\n\\begin{itemize}[label=\\checkmark]\n  \\item Done\n\\end{itemize}\n\n'
            '\\begin{enumerate}\n  \\item One\n    \\begin{enumerate}\n      \\item Sub\n    \\end{enumerate}\n\\end{enumerate}\n\n\\begin{description}\n  \\item[Term] Meaning\n\\end{description}')
    pre = '\\usepackage{enumitem}\n\\usepackage{amssymb}\n\\setlist[enumerate,2]{label=\\arabic{enumi}.\\arabic*.}\n'
    page.set_default_timeout(900000)
    for eng in ('pdflatex', 'xelatex', 'lualatex'):
        doc = ('% !TeX program = ' + eng + '\n' if eng != 'pdflatex' else '') + WRAP(body, pre)
        load_doc(page, doc); page.wait_for_timeout(300)
        drawn = labels(page)
        r = page.evaluate("""async () => { const r = await window.rikuy.api.compile(); let s = ''; if (r.pdf) for (let i = 0; i < r.pdf.length; i += 8192) s += String.fromCharCode(...r.pdf.subarray(i, i + 8192)); return { ok: r.ok, pdf: s ? btoa(s) : '' }; }""")
        text = PdfReader(io.BytesIO(base64.b64decode(r['pdf']))).pages[0].extract_text() if r['pdf'] else ''
        flat = re.sub(r'\s+', '', text)
        # (resume continues the count, not the format: resume* would take that too)
        want = ['c)Alpha', 'd)Beta', '5.Gamma', '1.One', '1.1.Sub', 'TermMeaning']
        check('compiled in the page with ' + eng + ', the lists print c) d), 5. continued, 1.1., the term', r['ok'] and all(w in flat for w in want), flat[:300])
        check('and the page drew the same labels (' + eng + ')', drawn == ['c)', '▪', 'd)', '5.', '✓', '1.', '1.1.'], drawn)
    page.set_default_timeout(30000)


def run_all():
    with sync_playwright() as p:
        browser, page, errors = open_page(p)
        for f in (levels, toggles, libraries, numbering, multilevel, sorting, autolists, menus, pdf_check):
            try: f(page)
            except Exception as e: check(f.__name__ + ' runs to its end', False, str(e)[:400])
        check('no page errors', not [e for e in errors if 'tree.wasm' not in e and 'TeX' not in e], errors[:4])
        browser.close()
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    run_all()
