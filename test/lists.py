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
list Rikuy writes compiles with pdfLaTeX, XeLaTeX and LuaLaTeX and prints those labels. review()
holds each finding of the hostile review of PR 22 as its case: never enumitem beside the enumerate
package or paralist, one undo for a format with a start, levels and labels left as written when
OK changes nothing, a bullet pdfLaTeX's fonts lack, Tab going on where it can do nothing, and the
labels and references TeX prints, each compiled in the page. phone_run(), at 390x844 and 360x740
with touch: list levels by tapped Increase and Decrease Indent (a phone has no Tab), every list
control a 44 px target, the libraries and the dialogs inside the screen and scrolling in
themselves, no side scroll, and automatic lists from an on-screen keyboard (the marker and its
space at once, an autocorrected dash, an IME's composition).

RIKUY_DIST names another dist/."""
import os, sys, base64, io, re, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import settle, until, open_page, check, results, src, load_doc, click_text, select_text, roundtrip
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist')
WRAP = lambda body, pre='': '\\documentclass{article}\n' + pre + '\\begin{document}\n' + body + '\n\\end{document}\n'
EI = '\\usepackage{enumitem}\n'
L3 = WRAP('\\begin{itemize}\n  \\item One\n  \\item Two\n  \\item Three\n\\end{itemize}')
L3N = WRAP('\\begin{itemize}\n  \\item One\n    \\begin{itemize}\n      \\item Two\n    \\end{itemize}\n  \\item Three\n\\end{itemize}')
E3 = WRAP('\\begin{enumerate}\n  \\item One\n  \\item Two\n  \\item Three\n\\end{enumerate}')


def run(page, cid, args=None):
    r = page.evaluate('([id, a]) => window.rikuy.runCommand(id, a)', [cid, args]); settle(page, 200)
    return r


def key(page, k):
    page.keyboard.press(k); settle(page, 250)


def hist(page):
    return page.evaluate('window.rikuy.hist.length')


def labels(page):
    return page.evaluate("[...document.querySelectorAll('#pages .lbl')].map((x) => x.textContent)")


def tile(page, arrow, name):
    """Open a list button's menu and press its tile (or item) of that name"""
    page.click(arrow); settle(page, 200)
    page.get_by_role('menu').get_by_role('menuitemradio', name=name, exact=True).click(); settle(page, 250)


def checked(page, arrow, name):
    page.click(arrow); settle(page, 200)
    v = page.get_by_role('menu').get_by_role('menuitemradio', name=name, exact=True).get_attribute('aria-checked')
    page.keyboard.press('Escape'); settle(page, 100)
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
    check('Tab on the first item writes nothing, says why, and keeps the keyboard on the page (POWER-USER.md 6)', src(page) == L3 and focused == 'pages' and 'first item' in page.evaluate("document.getElementById('toast').textContent"), (focused, page.evaluate("document.getElementById('toast').textContent")))
    st = state(page, 'indent-increase')
    check('Increase Indent is disabled there and says why', st[0] is False and 'first item' in st[2], st)
    load_doc(page, L3); click_text(page, 'Two', 1); key(page, 'Shift+Tab')
    check('Shift+Tab at the first level leaves the source alone (the keyboard\'s way off the page)', src(page) == L3)
    # several items at once
    load_doc(page, E3)
    page.evaluate('''() => { const sp = [...document.querySelectorAll('#pages span.t')]; const a = sp.find((x) => x.textContent.includes('Two')), b = sp.find((x) => x.textContent.includes('Three'));
      const r = document.createRange(); r.setStart(a.firstChild, 1); r.setEnd(b.firstChild, 2); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }''')
    settle(page, 100); key(page, 'Tab')
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
    # Enter in the empty last item of a list leaves it, \end{itemize} on a line of its own (it was
    # glued to the item before: "\item Three\end{itemize}")
    load_doc(page, L3); click_text(page, 'Three', 5)
    key(page, 'Enter'); key(page, 'Enter'); page.keyboard.type('After'); settle(page, 200)
    check('Enter twice at a list\'s end leaves it, its \\end on a line of its own', src(page) == WRAP('\\begin{itemize}\n  \\item One\n  \\item Two\n  \\item Three\n\\end{itemize}\n\nAfter'), src(page)[40:])
    # in a file whose lines end in CR LF the lines written end so too (a lone LF was written)
    crlf = L3.replace('\n', '\r\n')
    load_doc(page, crlf); click_text(page, 'Three', 5)
    key(page, 'Enter'); key(page, 'Enter'); page.keyboard.type('After'); settle(page, 200)
    got = src(page)
    check('and in a CR LF file every line it writes ends in CR LF', '\\item Three\r\n\\end{itemize}\r\n\r\nAfter' in got and not re.search(r'(?<!\r)\n', got), repr(got[40:]))
    # a table cell keeps its own Tab
    tab = WRAP('\\begin{itemize}\n  \\item One\n\\end{itemize}\n\n\\begin{tabular}{ll}\na & b \\\\\n\\end{tabular}')
    load_doc(page, tab); click_text(page, 'a', 0); key(page, 'Tab')
    check('Tab in a table cell is the table\'s (the source unchanged, no list command)', src(page) == tab)
    # Change List Level: two levels in one step
    load_doc(page, WRAP('\\begin{itemize}\n  \\item A\n  \\item B\n    \\begin{itemize}\n      \\item C\n    \\end{itemize}\n  \\item D\n\\end{itemize}')); click_text(page, 'D', 1)
    h0 = hist(page); run(page, 'list-level', {'level': 3})
    check('Change List Level to level 3: two levels at once, one undo', '        \\item D' in src(page) and hist(page) == h0 + 1 and labels(page)[-1] == '∗', (src(page)[40:], labels(page)))
    load_doc(page, L3); click_text(page, 'Two', 1)
    run(page, 'list-level'); settle(page, 150)
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
    page.get_by_role('dialog', name='Define New Bullet').get_by_role('button', name='OK').click(); settle(page, 250)
    check('Define New Bullet: a symbol of its grid', 'label=$\\bigstar$' in src(page) and labels(page) == ['★'] * 3, (src(page)[:200], labels(page)))
    load_doc(page, L3); click_text(page, 'Two', 1); run(page, 'bullet-define')
    d = page.get_by_role('dialog', name='Define New Bullet')
    d.get_by_label('Character or LaTeX', exact=True).fill('{\\bf x')
    d.get_by_role('button', name='OK').click(); settle(page, 200)
    check('LaTeX that does not balance is refused with a word, nothing written', src(page) == L3 and 'balance' in d.get_by_role('alert').text_content(), d.get_by_role('alert').text_content())
    d.get_by_label('Character or LaTeX', exact=True).fill('+&')
    d.get_by_role('button', name='OK').click(); settle(page, 250)
    check('a character typed is written as text, escaped', 'label=+\\&' in src(page) or 'label={+\\&}' in src(page), src(page)[:200])
    load_doc(page, E3); click_text(page, 'Two', 1); run(page, 'number-define')
    d = page.get_by_role('dialog', name='Define New Number Format')
    d.get_by_label('Number style', exact=True).select_option('Roman')
    d.get_by_label('Text before', exact=True).fill('Part ')
    d.get_by_label('Text after', exact=True).fill(':')
    d.get_by_role('spinbutton', name='Start at').fill('3')
    d.get_by_role('button', name='OK').click(); settle(page, 300)
    check('Define New Number Format: its style, text and start', '\\begin{enumerate}[label=Part \\Roman*:,start=3]' in src(page) and labels(page)[:2] == ['Part III:', 'Part IV:'], (src(page)[:200], labels(page)))
    check('both in one step, one undo (the review of PR 22: it was two)', hist(page) == 1, hist(page))


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
    d.get_by_role('button', name='OK').click(); settle(page, 250)
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
    pick = lambda name: (lambda pg: (pg.click('#rb-ml'), settle(pg, 200), pg.get_by_role('menu').get_by_role('menuitemradio', name=name, exact=True).click(), settle(pg, 250)))
    roundtrip(page, ml, ('One', 1), pick('Multilevel 1. 1.1. 1.1.1.'), want, off_command=pick('LaTeX\'s numbering 1. (a) i. A.'), label='Multilevel list 1. 1.1. 1.1.1.')
    load_doc(page, want); click_text(page, 'One', 1); key(page, 'Enter'); page.keyboard.type('Sub'); settle(page, 200); key(page, 'Tab')
    check('with it, a level two item reads 1.1.', labels(page) == ['1.', '1.1.'], labels(page))
    page.click('#rb-ml'); settle(page, 200)
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
    d.get_by_role('button', name='OK').click(); settle(page, 250)
    check('Define New Multilevel List: the bullets of each level', '\\setlist[itemize,1]{label=$\\star$}' in src(page) and labels(page) == ['⋆'] * 3, (src(page)[:400], labels(page)))


def sorting(page):
    fruit = WRAP('\\begin{itemize}\n  \\item Pear\n  \\item \\textbf{apple}\n  \\item Fig\n\\end{itemize}')
    roundtrip(page, fruit, ('Fig', 1), lambda pg: run(pg, 'sort', {'order': 'ascending'}), WRAP('\\begin{itemize}\n  \\item \\textbf{apple}\n  \\item Fig\n  \\item Pear\n\\end{itemize}'),
              off=WRAP('\\begin{itemize}\n  \\item Pear\n  \\item Fig\n  \\item \\textbf{apple}\n\\end{itemize}'), off_command=lambda pg: run(pg, 'sort', {'order': 'descending'}), label='Sort a list\'s items by their words')
    paras = WRAP('Charlie here.\n\nAlpha here.\n\nBravo here.')
    load_doc(page, paras)
    page.evaluate('''() => { const sp = [...document.querySelectorAll('#pages span.t')]; const a = sp.find((x) => x.textContent.includes('Charlie')), b = sp.find((x) => x.textContent.includes('Bravo'));
      const r = document.createRange(); r.setStart(a.firstChild, 0); r.setEnd(b.firstChild, 3); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }''')
    settle(page, 100); run(page, 'sort')
    d = page.get_by_role('dialog', name='Sort Text')
    check('Sort Text says what it sorts', 'Sort 3 paragraphs' in d.text_content(), d.text_content())
    d.get_by_role('radio', name='Descending').check(); d.get_by_role('button', name='OK').click(); settle(page, 250)
    check('Sort: the selected paragraphs, descending', src(page) == WRAP('Charlie here.\n\nBravo here.\n\nAlpha here.'), src(page)[40:])
    load_doc(page, WRAP('Only one.')); click_text(page, 'Only', 1)
    check('Sort is off on one paragraph and says why', state(page, 'sort')[0] is False and 'select' in state(page, 'sort')[2].lower(), state(page, 'sort'))


def autolists(page):
    load_doc(page, WRAP('First.\n\nSecond words.')); click_text(page, 'Second', 0)
    h0 = hist(page)
    page.keyboard.type('- '); settle(page, 300)
    check('"- " at a paragraph\'s start: a bulleted list', src(page) == WRAP('First.\n\n\\begin{itemize}\n  \\item Second words.\n\\end{itemize}'), src(page)[40:])
    c = page.evaluate('window.rikuy.caretNow().a')
    check('the caret before the item\'s words', src(page)[c:c + 6] == 'Second', src(page)[c - 5:c + 6])
    key(page, 'Control+z')
    check('Undo gives back what was typed', src(page) == WRAP('First.\n\n- Second words.'), src(page)[40:])
    load_doc(page, WRAP('Intro.\n\nThe end.')); click_text(page, 'The end', 0); page.keyboard.type('a) '); settle(page, 300)
    check('"a) ": a numbered list in that format', src(page) == WRAP('Intro.\n\n\\begin{enumerate}[label=\\alph*)]\n  \\item The end.\n\\end{enumerate}', EI) and labels(page) == ['a)'], (src(page)[:200], labels(page)))
    load_doc(page, WRAP('Intro.\n\nLater.')); click_text(page, 'Later', 0); page.keyboard.type('3. '); settle(page, 300)
    check('"3. ": numbered from 3', '\\begin{enumerate}[start=3]' in src(page) and labels(page) == ['3.'], (src(page)[:200], labels(page)))
    lst = WRAP('\\begin{enumerate}\n  \\item One\n\\end{enumerate}\n\nNext one.')
    load_doc(page, lst); click_text(page, 'Next', 0); page.keyboard.type('2. '); settle(page, 300)
    check('"2. " right after a list of one item goes on with that list', src(page) == WRAP('\\begin{enumerate}\n  \\item One\n  \\item Next one.\n\\end{enumerate}'), src(page)[40:])
    load_doc(page, WRAP('In 1. place')); click_text(page, 'place', 0); page.keyboard.type('- '); settle(page, 250)
    check('in the middle of a paragraph "- " is text', src(page) == WRAP('In 1. - place'), src(page)[40:])
    page.evaluate('window.rikuy.prefs.autoLists = false')
    load_doc(page, WRAP('Intro.\n\nWords.')); click_text(page, 'Words', 0); page.keyboard.type('* '); settle(page, 250)
    check('Options\' switch (prefs.autoLists false): "* " stays text', src(page) == WRAP('Intro.\n\n* Words.'), src(page)[40:])
    page.evaluate('window.rikuy.prefs.autoLists = true')


def menus(page):
    load_doc(page, E3); click_text(page, 'Two', 1)
    page.click('#rb-ol-x'); settle(page, 200)
    page.keyboard.press('ArrowRight'); page.keyboard.press('ArrowDown')
    f = page.evaluate('document.activeElement.getAttribute("aria-label")')
    page.keyboard.press('Escape')
    check('the library\'s tiles: the arrow keys move in two directions (right one, down a row of three)', f == 'Capital letters A. B. C.', f)
    # the right click menu of a list item has the list's commands
    load_doc(page, E3); click_text(page, 'Two', 1)
    page.keyboard.press('Shift+F10'); settle(page, 200)
    names = page.evaluate("[...document.querySelectorAll('.pop-ctx [role^=menuitem]')].map((x) => x.getAttribute('aria-label'))")
    page.keyboard.press('Escape')
    check('a list item\'s right click menu: Increase Indent, Decrease Indent, Restart at 1, Set Numbering Value', all(n in names for n in ('Bulleted list', 'Numbered list', 'Increase Indent', 'Decrease Indent', 'Restart at 1', 'Set Numbering Value', 'List spacing', 'Sort')), names)
    # the search box finds them by Word's names
    box = page.get_by_role('combobox', name='Search', exact=True)
    got = []
    for q in ('restart', 'multilevel', 'indent', 'sort'):
        box.click(); box.fill(q); settle(page, 150)
        got.append(page.get_by_role('listbox', name='Commands', exact=True).get_by_role('option').all_inner_texts()[:1])
    page.keyboard.press('Escape')
    check('the search box finds Restart at 1, Multilevel list, Increase Indent, Sort by Word\'s words', [g[0].split('\n')[0] if g else '' for g in got] == ['Restart at 1', 'Multilevel list', 'Increase Indent', 'Sort'], got)


def toast(page):
    return page.evaluate("document.getElementById('toast').textContent")


def compiled(page):
    """The PDF of the page's document, compiled in the page: (ok, its text without spaces, errors)"""
    from pypdf import PdfReader
    r = page.evaluate("""async () => { const r = await window.rikuy.api.compile(); let s = ''; if (r.pdf) for (let i = 0; i < r.pdf.length; i += 8192) s += String.fromCharCode(...r.pdf.subarray(i, i + 8192)); return { ok: r.ok, errs: (r.problems || []).filter((p) => p.severity === 'error').map((p) => p.message).slice(0, 3), pdf: s ? btoa(s) : '' }; }""")
    text = ' '.join(pg.extract_text() for pg in PdfReader(io.BytesIO(base64.b64decode(r['pdf']))).pages) if r['pdf'] else ''
    return r['ok'], re.sub(r'\s+', '', text), r['errs']


def page_flat(page):
    return re.sub(r'\s+', '', page.evaluate("document.querySelector('#pages').innerText").replace('\u200b', ''))


def select_spans(page, a, b, b_end):
    """Select from the start of the span holding a to b_end characters into the one holding b"""
    page.evaluate('''([a, b, z]) => { const sp = [...document.querySelectorAll('#pages span.t')]; const x = sp.find((s) => s.textContent.includes(a)), y = sp.find((s) => s.textContent.includes(b));
      const r = document.createRange(); r.setStart(x.firstChild, 0); r.setEnd(y.firstChild, z); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }''', [a, b, b_end])
    settle(page, 150)


def review(page):
    """The hostile review of PR 22, each finding's case (compiled in the page where TeX erred)"""
    tex = os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')) and not os.environ.get('LISTS_NO_PDF')
    if tex:
        try: import pypdf  # noqa: F401
        except ImportError: tex = False
    page.set_default_timeout(900000)
    # H1: beside the enumerate package or paralist, never enumitem (it breaks their "(a)" lists)
    D = WRAP('\\begin{enumerate}[(a)]\n  \\item First\n  \\item Second\n\\end{enumerate}\n\n\\begin{itemize}\n  \\item Bul\n  \\item Bul2\n\\end{itemize}', '\\usepackage{enumerate}\n')
    load_doc(page, D); click_text(page, 'Bul2', 1)
    run(page, 'list-spacing', {'sep': 'noitemsep'})
    want = D.replace('\\begin{itemize}\n', '\\begin{itemize}\n  \\setlength{\\itemsep}{0pt}\n')
    check('H1 List spacing beside the enumerate package: LaTeX\'s own \\setlength{\\itemsep}, no enumitem', src(page) == want, src(page)[40:])
    load_doc(page, D); click_text(page, 'Bul2', 1)
    r = run(page, 'list-spacing', {'sep': 'nosep'})
    check('H1 Compact (enumitem\'s nosep) refused there, the source unchanged', r is False and src(page) == D, (r, src(page)[40:]))
    if tex:
        load_doc(page, want); ok, flat, errs = compiled(page)
        check('H1 that document compiles in the page and prints (a) (b)', ok and '(a)First' in flat and '(b)Second' in flat, (errs, flat[:120]))
    P = WRAP('\\begin{enumerate}[(a)]\n  \\item First\n  \\item Second\n\\end{enumerate}\n\nPara.', '\\usepackage{paralist}\n')
    load_doc(page, P); click_text(page, 'Para', 1)
    run(page, 'multilevel-define', {'kind': 'enum', 'labels': ['\\arabic*.', '\\alph*)', '\\roman*.', '\\Alph*.']})
    s1 = src(page)
    check('H1 Multilevel list beside paralist: \\renewcommand{\\labelenumii} lines, no enumitem', '\\renewcommand{\\labelenumii}{\\alph{enumii})}' in s1 and 'enumitem' not in s1 and 'setlist' not in s1, s1[:300])
    if tex:
        ok, flat, errs = compiled(page)
        check('H1 that document compiles in the page: (a) First, 1. Para.', ok and '(a)First' in flat and '1.Para.' in flat, (errs, flat[:120]))
    # H2: Define New Number Format with a start: one step, one undo
    D = WRAP('Para one.\n\nPara two.')
    load_doc(page, D); click_text(page, 'one', 1); h0 = hist(page)
    run(page, 'number-define'); settle(page, 200)
    page.get_by_label('Text before').fill('Q'); page.get_by_label('Start at').first.fill('4')
    page.get_by_role('button', name='OK').click(); settle(page, 400)
    check('H2 Define New Number Format with a start: one step', hist(page) == h0 + 1 and labels(page) == ['Q4.'], (hist(page) - h0, labels(page)))
    page.evaluate('window.rikuy.undo()'); settle(page, 200)
    check('H2 and one undo gives the bytes back', src(page) == D, src(page)[40:])
    # (letters stop at z: Start at 27 with a, b, c is refused in the dialog)
    load_doc(page, E3); click_text(page, 'One', 1)
    run(page, 'number-define'); settle(page, 200)
    page.get_by_label('Number style').select_option('alph'); page.get_by_label('Start at').first.fill('27')
    page.get_by_role('button', name='OK').click(); settle(page, 300)
    msg = page.evaluate("(document.querySelector('.pop-list .ld-msg') || {}).textContent || ''")
    check('M1 Start at 27 with letters is refused, saying why (TeX: Counter too large)', src(page) == E3 and '26' in msg, msg)
    page.keyboard.press('Escape'); settle(page, 150)
    A = WRAP('\\begin{enumerate}[label=\\alph*)]\n  \\item One\n\\end{enumerate}', EI)
    load_doc(page, A); click_text(page, 'One', 1)
    r = run(page, 'list-value', {'value': 27})
    check('M1 and Set Numbering Value 27 on a list of letters too', r is False and src(page) == A, (r, src(page)[60:]))
    # M4: OK with nothing changed keeps Step~\arabic*. (the ~ a no-break space in the field)
    D = WRAP('\\begin{enumerate}[label=Step~\\arabic*.]\n  \\item One\n\\end{enumerate}', EI)
    load_doc(page, D); click_text(page, 'One', 1)
    run(page, 'number-define'); settle(page, 200)
    before = page.get_by_label('Text before').input_value()
    page.get_by_role('button', name='OK').click(); settle(page, 300)
    check('M4 Define New Number Format, OK unchanged: the label as written, ~ shown as a no-break space', src(page) == D and before == 'Step\u00a0', (before, src(page)[60:]))
    # H3: Define New Multilevel List, OK unchanged: hand written levels kept, no levels added
    D = WRAP('\\begin{enumerate}\n  \\item One\n\\end{enumerate}', EI + '\\setlist[enumerate,2]{label=\\textbf{\\alph*}, leftmargin=2em}\n\\setlist[enumerate,3]{label=\\S\\roman*}\n')
    load_doc(page, D); click_text(page, 'One', 1)
    run(page, 'multilevel-define'); settle(page, 200)
    opt = page.get_by_label('Level 2 number style').evaluate('(s) => s.options[s.selectedIndex].text')
    page.get_by_role('button', name='OK').click(); settle(page, 300)
    check('H3 Define New Multilevel List, OK unchanged: \\textbf{\\alph*} and \\S\\roman* kept, shown as Custom (kept)', src(page) == D and 'Custom (kept)' in opt, (opt, src(page)[:260]))
    load_doc(page, D); click_text(page, 'One', 1)
    run(page, 'multilevel-define'); settle(page, 200)
    page.get_by_label('Level 1 number style').select_option('Roman')
    page.get_by_role('button', name='OK').click(); settle(page, 300)
    s1 = src(page)
    check('H3 one level changed: only its line written', '\\setlist[enumerate,1]{label=\\Roman*.}' in s1 and '\\textbf{\\alph*}' in s1 and '\\S\\roman*' in s1 and 'enumerate,4' not in s1, s1[:320])
    B = WRAP('\\begin{itemize}\n  \\item One\n\\end{itemize}', EI + '\\usepackage{pifont}\n\\setlist[itemize,1]{label=\\ding{43}}\n')
    load_doc(page, B); click_text(page, 'One', 1)
    run(page, 'multilevel-define'); settle(page, 200)
    l3 = page.get_by_label('Level 3 bullet').evaluate('(s) => s.options[s.selectedIndex].text')
    page.get_by_role('button', name='OK').click(); settle(page, 300)
    check('H3 bullets: \\ding{43} kept, level 3 LaTeX\'s own ∗', src(page) == B and '∗' in l3, (l3, src(page)[:200]))
    # M3: a typed » refused on pdfLaTeX (its fonts have none), → written as its symbol
    D = WRAP('\\begin{itemize}\n  \\item One\n  \\item Two\n\\end{itemize}')
    load_doc(page, D); click_text(page, 'Two', 1)
    r = run(page, 'bullet-define', {'code': '»'})
    check('M3 Define New Bullet » on pdfLaTeX: refused, saying why', r is False and src(page) == D and '»' in toast(page), toast(page))
    run(page, 'bullet-define', {'code': '→'})
    check('M3 → written as $\\rightarrow$', '\\begin{itemize}[label=$\\rightarrow$]' in src(page), src(page)[40:])
    if tex:
        ok, flat, errs = compiled(page)
        check('M3 that compiles in the page with pdfLaTeX', ok and not errs, errs)
    load_doc(page, D); click_text(page, 'Two', 1)
    run(page, 'bullet-define'); settle(page, 200)
    page.get_by_label('Character or LaTeX').fill('»'); page.get_by_role('button', name='OK').click(); settle(page, 300)
    msg = page.evaluate("(document.querySelector('.pop-list .ld-msg') || {}).textContent || ''")
    check('M3 the dialog refuses a typed » too, keeping itself open with why', src(page) == D and 'pdfLaTeX' in msg, msg)
    page.keyboard.press('Escape'); settle(page, 150)
    X = '% !TeX program = xelatex\n' + D
    load_doc(page, X); click_text(page, 'Two', 1); run(page, 'bullet-define', {'code': '»'})
    check('M3 on XeLaTeX » is taken as it is', '\\begin{itemize}[label=»]' in src(page), src(page)[60:])
    # M5: where nothing can be done Tab and Shift+Tab go on (the keyboard's way off the page)
    # (in the center, Tab can do something: Inner2 under Inner; Shift+Tab cannot leave the center)
    for name, D, keys in (('a paralist compactitem in an itemize', WRAP('\\begin{itemize}\n  \\item One\n    \\begin{compactitem}\n      \\item Inner\n      \\item Inner2\n    \\end{compactitem}\n  \\item Two\n\\end{itemize}', '\\usepackage{paralist}\n'), ('Tab', 'Shift+Tab')),
                          ('a list nested in a center', WRAP('\\begin{itemize}\n  \\item One\n    \\begin{center}\n    \\begin{itemize}\n      \\item Inner\n      \\item Inner2\n    \\end{itemize}\n    \\end{center}\n  \\item Two\n\\end{itemize}'), ('Shift+Tab',))):
        for k in keys:
            load_doc(page, D); click_text(page, 'Inner2', 2)
            prevented = page.evaluate("(k) => { const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: k === 'Shift+Tab', bubbles: true, cancelable: true }); document.getElementById('pages').dispatchEvent(e); return e.defaultPrevented; }", k)
            check('M5 ' + k + ' in ' + name + ': the key goes on, the source unchanged', not prevented and src(page) == D, prevented)
    # lows: an automatic list takes the \noindent with it; Sort takes paragraphs with comments
    D = WRAP('\\noindent Words here.')
    load_doc(page, D); click_text(page, 'Words', 0); page.keyboard.type('1. '); settle(page, 300)
    check('L1 "1. " after \\noindent: the list without an orphaned \\noindent', '\\noindent' not in src(page) and '\\item Words here.' in src(page), src(page)[40:])
    page.evaluate('window.rikuy.undo()'); settle(page, 200)
    check('L1 and Undo gives back what was typed', src(page) == WRAP('\\noindent 1. Words here.'), src(page)[40:])
    D = WRAP('Gamma para.\n\nalpha para.\n\n% comment (X) on "Beta": hi\nBeta para.\n\nLast.')
    load_doc(page, D); select_spans(page, 'Gamma', 'Beta para', 3)
    run(page, 'sort', {'order': 'ascending'})
    check('L7 Sort of paragraphs, one with a coauthor\'s comment above it: the comment goes with it', src(page) == WRAP('alpha para.\n\n% comment (X) on "Beta": hi\nBeta para.\n\nGamma para.\n\nLast.'), src(page)[40:])
    # M1: the page draws the labels and references TeX prints (each compiled where TeX is here)
    docs = [
        ('resume*, series, resume across levels, a labelled item, start=0, ref=', WRAP(
            '\\begin{enumerate}[label=\\alph*),start=3]\\item RA\\end{enumerate}\n\nx\n\n\\begin{enumerate}[resume*]\\item RB\\end{enumerate}\n\n'
            '\\begin{enumerate}[series=foo]\\item SA\\item SB\\end{enumerate}\n\n\\begin{enumerate}\\item SC\\end{enumerate}\n\n\\begin{enumerate}[resume=foo]\\item SD\\end{enumerate}\n\n'
            '\\begin{itemize}\\item IA \\begin{enumerate}\\item IX\\item IY\\end{enumerate}\\end{itemize}\n\n\\begin{enumerate}[resume]\\item IZ\\end{enumerate}\n\n'
            '\\begin{enumerate}\\item[(x)] LA\\item LB\\end{enumerate}\n\n\\begin{enumerate}[start=0,label=\\alph*)]\\item ZA\\item ZB\\end{enumerate}\n\n'
            '\\begin{enumerate}[label=\\alph*),ref=\\alph*]\\item KA\\label{k}\\end{enumerate} See \\ref{k}.', EI),
         ['c)RA', 'd)RB', '1.SA', '2.SB', '1.SC', '3.SD', '1.IX', '2.IY', '4.IZ', '(x)LA', '1.LB', ')ZA', 'a)ZB', 'a)KA', 'Seea.']),
        ('the enumerate package\'s (i) nested, LaTeX\'s own references', WRAP(
            '\\begin{enumerate}\\item EA\\begin{enumerate}[(i)]\\item EB\\label{b}\\end{enumerate}\\end{enumerate} See \\ref{b}.\n\n'
            '\\begin{enumerate}\\item A\\label{a} \\begin{enumerate}\\item B\\label{bb} \\begin{enumerate}\\item C\\label{c}\\end{enumerate}\\end{enumerate}\\end{enumerate}\nRefs: \\ref{a}, \\ref{bb}, \\ref{c}.', '\\usepackage{enumerate}\n'),
         ['1.EA', '(i)EB', 'See1i.', 'Refs:1,1a,1(a)i.']),
        ('\\theenumi as letters', WRAP('\\begin{enumerate}\\item One\\label{o}\\item Two\\end{enumerate} See \\ref{o}.', '\\renewcommand{\\theenumi}{\\alph{enumi}}\n'),
         ['a.One', 'b.Two', 'Seea.']),
    ]
    for name, D, want in docs:
        load_doc(page, D); settle(page, 300)
        flat = page_flat(page)
        check('M1 the page draws ' + name + ' as TeX prints them', all(w in flat for w in want), [w for w in want if w not in flat])
        if tex:
            ok, pdf, errs = compiled(page)
            check('M1 and pdfLaTeX in the page prints the same', ok and all(w in pdf for w in want), (errs, [w for w in want if w not in pdf]))
    page.set_default_timeout(30000)


# Chromium counts a tap that comes within 400 ms of the last one and near it as the second of a
# double tap (the word selected) or the third of a triple (the paragraph). The suite's taps are
# separate ones, as a person's are: one near the last waits out what is left of that time (the
# gesture's own time, which no event marks; the fixed waits once kept the taps apart).
DOUBLE_TAP, NEAR = 0.5, 100  # (browser.py's tap(): Chromium's measured 350 to 450 ms, and a margin)
_taps = {}


def finger(page, at, do):
    """A tap at the point at, made by do(), and the click Chromium makes of it: the tap gesture
    comes from the touchstart and touchend after the tap call has returned, and the click (the
    caret placed, a button pressed) with it."""
    last = _taps.get(id(page))
    if last and abs(at[0] - last[1]) < NEAR and abs(at[1] - last[2]) < NEAR and time.monotonic() - last[0] < DOUBLE_TAP:
        page.wait_for_timeout((DOUBLE_TAP - (time.monotonic() - last[0])) * 1000)
    page.evaluate('() => { window.__rkTap = 0; addEventListener("click", () => { window.__rkTap = 1; }, { capture: true, once: true }); }')
    do()
    _taps[id(page)] = (time.monotonic(), at[0], at[1])
    until(page, '() => window.__rkTap === 1', timeout=300)


def tap_text(page, text, off=0):
    """A finger's tap on the page's text: offset characters into the first span holding text"""
    xy = page.evaluate('''([t, o]) => { const s = [...document.querySelectorAll('#pages span.t')].find((x) => x.textContent.includes(t)); const n = s.firstChild, i = n.textContent.indexOf(t) + o;
      const r = document.createRange(); r.setStart(n, i); r.setEnd(n, Math.min(n.length, i + 1)); const b = r.getBoundingClientRect(); return [b.left + 1, b.top + b.height / 2]; }''', [text, off])
    finger(page, xy, lambda: page.touchscreen.tap(xy[0], xy[1])); settle(page, 300)


def tap_on(page, loc):
    """A tap on a control where it is, and its click"""
    b = loc.bounding_box() or {'x': -1e3, 'y': -1e3, 'width': 0, 'height': 0}
    finger(page, (b['x'] + b['width'] / 2, b['y'] + b['height'] / 2), loc.tap)


def tap(page, loc):
    """A tap on a control, the ribbon's row swiped to it first (a phone shows part of the row)"""
    loc.evaluate('(e) => e.scrollIntoView({ block: "nearest", inline: "center" })'); settle(page, 150)
    tap_on(page, loc); settle(page, 300)


def no_side_scroll(page):
    return page.evaluate('document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth')


def fits(page, sel):
    """The open pop up inside the screen across, and inside it down or scrolling within itself"""
    return page.evaluate('''(sel) => { const p = [...document.querySelectorAll(sel)].pop(); if (!p) return null; const r = p.getBoundingClientRect();
      return { across: r.left >= 0 && r.right <= innerWidth, down: r.top >= 0 && (r.bottom <= innerHeight || (p.scrollHeight > p.clientHeight && /auto|scroll/.test(getComputedStyle(p).overflowY))), r: [r.left, r.top, r.right, r.bottom], vw: innerWidth, vh: innerHeight }; }''', sel)


def phone_run(p, w, h, dark=False):
    """Lists on a phone: no Tab key, a finger, an on-screen keyboard (the owner's ask: everything
    works on a phone)"""
    browser, page, errors = open_page(p, w, h, dark=dark, touch=True)
    tag = ' (%dx%d)' % (w, h)
    try:
        check('the phone is a phone: a coarse pointer' + tag, page.evaluate("matchMedia('(pointer: coarse)').matches"))
        # list level without Tab: Increase Indent and Decrease Indent, tapped
        load_doc(page, L3); tap_text(page, 'Two', 1)
        c = page.evaluate("(() => { const c = window.rikuy.caretNow(); return c && window.rikuy.src('main.tex').slice(c.a - 1, c.a + 2); })()")
        check('a tap puts the caret in the item' + tag, c is not None and 'w' in c, c)
        h0 = hist(page)
        tap(page, page.get_by_role('button', name='Increase Indent', exact=True))
        check('Increase Indent tapped: the item one level down, one step' + tag, src(page) == L3N and hist(page) == h0 + 1, src(page)[40:])
        page.keyboard.insert_text('Z'); settle(page, 300)
        check('the caret still types in the item\'s words after it' + tag, 'Z' in src(page)[src(page).find('\\item T'):src(page).find('\\item T') + 14], src(page)[40:])
        page.evaluate('window.rikuy.undo()'); settle(page, 200)
        tap(page, page.get_by_role('button', name='Decrease Indent', exact=True))
        check('Decrease Indent tapped: back to the bytes of before' + tag, src(page) == L3, src(page)[40:])
        sizes = page.evaluate('''["Bulleted list", "Bulleted list options", "Numbered list", "Numbered list options", "Multilevel list", "Decrease Indent", "Increase Indent", "Sort"].map((n) => { const b = document.querySelector('.rb [aria-label="' + n + '"]'); const r = b.getBoundingClientRect(); return [n, Math.round(r.width), Math.round(r.height)]; })''')
        check('every list control is a 44 px target for a finger' + tag, all(x[1] >= 44 and x[2] >= 44 for x in sizes), [x for x in sizes if x[1] < 44 or x[2] < 44])
        # the bullet library: it fits, its tiles take a finger, a tap applies one
        load_doc(page, L3); tap_text(page, 'Two', 1)
        tap(page, page.get_by_role('button', name='Bulleted list options', exact=True))
        f = fits(page, '.pop-menu')
        tiles = page.evaluate("[...document.querySelectorAll('.pop-menu .li-tile')].map((t) => Math.round(t.getBoundingClientRect().height))")
        check('the bullet library fits the screen (or scrolls in itself), no side scroll' + tag, f and f['across'] and f['down'] and no_side_scroll(page), f)
        check('its tiles are 44 px or more tall' + tag, tiles and min(tiles) >= 44, tiles)
        tap(page, page.get_by_role('menuitemradio', name='Hollow round bullet', exact=True))
        check('a tile tapped gives the list its bullet' + tag, '\\begin{itemize}[label=$\\circ$]' in src(page) and labels(page)[:1] == ['◦'], src(page)[40:120])
        # the dialogs: Define New Number Format typed into with the phone's keyboard, Define New
        # Multilevel List (the tallest) scrolled to its OK
        load_doc(page, E3); tap_text(page, 'Two', 1)
        tap(page, page.get_by_role('button', name='Numbered list options', exact=True))
        tap(page, page.get_by_role('menuitem', name='Define New Number Format', exact=False).first)
        f = fits(page, '.pop-list')
        hs = page.evaluate("[...document.querySelectorAll('.pop-list input[type=text], .pop-list select, .pop-list .nf, .pop-list .ld-btns .btn')].filter((x) => x.offsetParent).map((x) => Math.round(x.getBoundingClientRect().height))")
        check('Define New Number Format fits the screen, no side scroll' + tag, f and f['across'] and f['down'] and no_side_scroll(page), f)
        check('its fields and buttons are 44 px tall' + tag, hs and min(hs) >= 44, hs)
        tap(page, page.get_by_label('Text before', exact=True)); page.keyboard.insert_text('Q')
        tap(page, page.get_by_role('button', name='OK', exact=True))
        check('typed on the phone\'s keyboard, OK tapped: the label written' + tag, '[label=Q\\arabic*.]' in src(page), src(page)[40:140])
        load_doc(page, E3); tap_text(page, 'Two', 1)
        tap(page, page.get_by_role('button', name='Multilevel list', exact=True))
        tap(page, page.get_by_role('menuitem', name='Define New Multilevel List', exact=False).first)
        f = fits(page, '.pop-list')
        check('Define New Multilevel List fits across and scrolls in itself, no side scroll' + tag, f and f['across'] and f['down'] and no_side_scroll(page), f)
        tap(page, page.get_by_role('button', name='OK', exact=True))
        check('scrolled to OK and tapped with nothing changed: the source as it was' + tag, src(page) == E3, src(page)[40:])
        # automatic lists from the on-screen keyboard: the marker and space at once, a dash its
        # autocorrect made of "-", the space alone, an IME composing "a) "
        D = WRAP('Words here.\n\nMore words.')
        load_doc(page, D); tap_text(page, 'Words', 0)
        page.keyboard.insert_text('- '); settle(page, 400)
        check('"- " from the phone\'s keyboard at a paragraph\'s start: a bulleted list' + tag, src(page) == WRAP('\\begin{itemize}\n  \\item Words here.\n\\end{itemize}\n\nMore words.'), src(page)[40:])
        page.evaluate('window.rikuy.undo()'); settle(page, 200)
        check('and Undo gives back what was typed' + tag, src(page) == WRAP('- Words here.\n\nMore words.'), src(page)[40:])
        load_doc(page, D); tap_text(page, 'Words', 0)
        page.keyboard.insert_text('– '); settle(page, 400)
        check('"– ", the dash a phone\'s autocorrect makes of "-": a bulleted list too' + tag, '\\begin{itemize}\n  \\item Words here.' in src(page), src(page)[40:])
        load_doc(page, D); tap_text(page, 'More', 0)
        page.keyboard.insert_text('1.'); settle(page, 200); page.keyboard.insert_text(' '); settle(page, 400)
        check('"1." then the space: a numbered list' + tag, '\\begin{enumerate}\n  \\item More words.' in src(page), src(page)[40:])
        load_doc(page, D); tap_text(page, 'Words', 0)
        cdp = page.context.new_cdp_session(page)
        cdp.send('Input.imeSetComposition', {'text': 'a)', 'selectionStart': 2, 'selectionEnd': 2}); settle(page, 100)
        cdp.send('Input.imeSetComposition', {'text': 'a) ', 'selectionStart': 3, 'selectionEnd': 3}); settle(page, 100)
        cdp.send('Input.insertText', {'text': 'a) '}); settle(page, 500)
        check('"a) " composed by an IME and committed with its space: a list a), b)' + tag, '\\begin{enumerate}[label=\\alph*)]\n  \\item Words here.' in src(page) and labels(page)[:1] == ['a)'], src(page)[40:])
        page.evaluate('window.rikuy.undo()'); settle(page, 200)
        check('and Undo gives back the composed text' + tag, src(page) == WRAP('a) Words here.\n\nMore words.'), src(page)[40:])
        check('no page errors on the phone' + tag, not errors, errors[:3])
    finally:
        browser.close()


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
        load_doc(page, doc); settle(page, 300)
        drawn = labels(page)
        r = page.evaluate("""async () => { const r = await window.rikuy.api.compile(); let s = ''; if (r.pdf) for (let i = 0; i < r.pdf.length; i += 8192) s += String.fromCharCode(...r.pdf.subarray(i, i + 8192)); return { ok: r.ok, pdf: s ? btoa(s) : '' }; }""")
        text = PdfReader(io.BytesIO(base64.b64decode(r['pdf']))).pages[0].extract_text() if r['pdf'] else ''
        flat = re.sub(r'\s+', '', text)
        # (resume continues the count, not the format: resume* would take that too)
        want = ['c)Alpha', 'd)Beta', '5.Gamma', '1.One', '1.1.Sub', 'TermMeaning']
        check('compiled in the page with ' + eng + ', the lists print c) d), 5. continued, 1.1., the term', r['ok'] and all(w in flat for w in want), flat[:300])
        check('and the page drew the same labels (' + eng + ')', drawn == ['c)', '▪', 'd)', '5.', '✓', '1.', '1.1.'], drawn)
    page.set_default_timeout(30000)


# ---- round 3's R2: picture bullets, Adjust List Indents ------------------------------------------------
def png_file(path, rgb=(200, 30, 60)):
    """A small PNG written here (8 by 8 of one colour), so the checks need no picture of their own"""
    import zlib, struct
    raw = b''.join(b'\x00' + bytes(rgb) * 8 for _ in range(8))
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 8, 8, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))
    return path


def put_picture(page, name):
    """A picture of the project (as one opened with it), for the picture bullet to use"""
    page.evaluate("""async (n) => { const c = document.createElement('canvas'); c.width = c.height = 8; const g = c.getContext('2d'); g.fillStyle = '#c81e3c'; g.fillRect(0, 0, 8, 8);
      const b = await new Promise((r) => c.toBlob(r, 'image/png')); window.rikuy.addAsset(n, b); window.rikuy.forceRender = true; window.rikuy.rebuild(); }""", name)
    settle(page, 200)


B3 = '\\begin{itemize}\n  \\item One\n  \\item Two\n\\end{itemize}'
PIC = '\\begin{itemize}[label={\\includegraphics[height=1.6ex]{figures/dot.png}}]\n  \\item One\n  \\item Two\n\\end{itemize}'


def r2(page):
    """Define New Bullet › Picture (a picture of the project, or one from a file, in the same step)
    and Adjust List Indents (enumitem's leftmargin, labelwidth, labelsep), each by the round trip
    rule, drawn as TeX sets them"""
    D = WRAP(B3)
    load_doc(page, D); put_picture(page, 'figures/dot.png')
    pic = lambda pg: pg.evaluate("window.rikuy.runCommand('bullet-picture', { file: 'figures/dot.png' })")
    own = lambda pg: pg.evaluate("window.rikuy.listLabel('itemize', null)")
    want = WRAP(PIC, '\\usepackage{enumitem}\n\\usepackage{graphicx}\n')
    load_doc(page, D); put_picture(page, 'figures/dot.png'); click_text(page, 'Two', 1); h0 = hist(page)
    pic(page); settle(page, 250)
    check('Picture Bullet: \\includegraphics[height=1.6ex] as enumitem\'s label, braced, enumitem and graphicx once, one step', src(page) == want and hist(page) == h0 + 1, src(page))
    drawn = page.evaluate("[...document.querySelectorAll('#pages .lbl')].map((l) => { const i = l.querySelector('img'); return i ? [i.src.slice(0, 5), Math.round(i.getBoundingClientRect().height)] : l.textContent; })")
    fs = page.evaluate("parseFloat(getComputedStyle(document.querySelector('#pages .it.p')).fontSize)")
    check('the page draws the picture as each item\'s bullet, a capital letter high', len(drawn) == 2 and all(isinstance(x, list) and x[0] == 'blob:' and 0.5 * fs <= x[1] <= 1.1 * fs for x in drawn), (drawn, fs))
    page.evaluate('window.rikuy.undo()'); settle(page, 200)
    check('one undo gives the source back byte for byte', src(page) == D)
    load_doc(page, want); put_picture(page, 'figures/dot.png'); click_text(page, 'Two', 1); own(page); settle(page, 200)
    check('LaTeX\'s own bullet again takes exactly the label off', src(page) == WRAP(B3, '\\usepackage{enumitem}\n\\usepackage{graphicx}\n'), src(page))
    # the dialog: a picture of the project, and one from a file going into the project in the same step
    load_doc(page, D); put_picture(page, 'figures/dot.png'); click_text(page, 'Two', 1)
    run(page, 'bullet-define'); page.get_by_role('button', name='Picture…').click(); settle(page, 250)
    dlg = page.get_by_role('dialog', name='Picture Bullet')
    dlg.get_by_role('radio', name='figures/dot.png').click(); dlg.get_by_role('button', name='OK').click(); settle(page, 300)
    check('Define New Bullet › Picture…: the project\'s picture picked and OK', src(page) == want, src(page))
    load_doc(page, D); click_text(page, 'Two', 1); h0 = hist(page)
    run(page, 'bullet-picture'); settle(page, 200)
    dlg = page.get_by_role('dialog', name='Picture Bullet')
    dlg.locator('input[type=file]').set_input_files(png_file('/tmp/r2 red dot!.png')); settle(page, 300)
    picked = dlg.get_by_role('radio', name='figures/r2-red-dot.png').get_attribute('aria-checked')
    dlg.get_by_role('button', name='OK').click(); settle(page, 400)
    has = page.evaluate("window.rikuy.assetBlobs.has('figures/r2-red-dot.png')")
    check('a picture from a file: a name TeX takes, picked, put in the project with the label in one step', picked == 'true' and has and 'label={\\includegraphics[height=1.6ex]{figures/r2-red-dot.png}}' in src(page) and hist(page) == h0 + 1, (picked, has, src(page)[-200:]))
    page.evaluate('window.rikuy.undo()'); settle(page, 250)
    check('and one undo takes both out again', src(page) == D and not page.evaluate("window.rikuy.assetBlobs.has('figures/r2-red-dot.png')"))
    r = page.evaluate("window.rikuy.runCommand('bullet-picture', { file: '../x}.png' })")
    check('a picture name TeX would not take is refused, nothing written', r is False and src(page) == D)
    load_doc(page, '\\documentclass{beamer}\n\\begin{document}\n\\begin{frame}\n' + B3 + '\n\\end{frame}\n\\end{document}\n'); click_text(page, 'Two', 1)
    st = state(page, 'bullet-picture')
    check('in beamer it is off, saying why', st[0] is False and 'Beamer' in st[2], st)

    # Adjust List Indents, by the round trip rule
    ind = lambda pg: pg.evaluate("window.rikuy.runCommand('list-indents', { leftmargin: '1.5cm', labelwidth: '1cm', labelsep: '0.25cm' })")
    ind.__name__ = 'Adjust List Indents'
    off = lambda pg: pg.evaluate("window.rikuy.runCommand('list-indents', { leftmargin: null, labelwidth: null, labelsep: null })")
    E = WRAP(B3.replace('\\begin{itemize}', '\\begin{itemize}[leftmargin=1.5cm,labelwidth=1cm,labelsep=0.25cm]'), '\\usepackage{enumitem}\n')
    roundtrip(page, WRAP(B3, '\\usepackage{enumitem}\n'), ('Two', 1), ind, E, forms=(E.replace('leftmargin=1.5cm,labelwidth=1cm,labelsep=0.25cm', 'labelsep=0.25cm, leftmargin=1.5cm , labelwidth=1cm'),), off_command=off)
    load_doc(page, E); click_text(page, 'Two', 1)
    geo = page.evaluate("""() => { const p = [...document.querySelectorAll('#pages .it.p')].find((x) => x.textContent.includes('Two')); const l = p.querySelector('.lbl'); const fs = parseFloat(getComputedStyle(p).fontSize);
      const pr = p.getBoundingClientRect(), lr = l.getBoundingClientRect(), pad = parseFloat(getComputedStyle(p).paddingLeft); return { pad: pad / fs, labRight: (lr.right - pr.left) / fs - parseFloat(getComputedStyle(l).paddingRight) / fs, w: lr.width / fs }; }""")
    # (1.5cm is 4.2675em at 10pt; the label's box ends labelsep, 0.25cm, before the text)
    check('the page draws the text at the margin and the label\'s box labelsep before it', abs(geo['pad'] - 4.2675) < 0.05 and abs(geo['labRight'] - (4.2675 - 0.71125)) < 0.05 and abs(geo['w'] - (2.845 + 0.71125)) < 0.05, geo)
    # the dialog
    load_doc(page, WRAP(B3, '\\usepackage{enumitem}\n')); click_text(page, 'Two', 1)
    run(page, 'list-indents'); settle(page, 200)
    dlg = page.get_by_role('dialog', name='Adjust List Indents')
    vals = [dlg.get_by_role('spinbutton', name=n).input_value() for n in ('Text indent', 'Label width', 'Space after label')]
    check('Adjust List Indents shows LaTeX\'s own at the level: 2.5em, 2em, 0.5em', vals == ['2.5', '2', '0.5'], vals)
    f = dlg.get_by_role('spinbutton', name='Text indent'); f.fill('3'); f.press('Tab')
    dlg.get_by_role('button', name='OK').click(); settle(page, 300)
    check('OK after a change writes the three, so TeX and the page put the label where the dialog says', '\\begin{itemize}[leftmargin=3em,labelwidth=2em,labelsep=0.5em]' in src(page), src(page))
    run(page, 'list-indents'); settle(page, 200)
    dlg = page.get_by_role('dialog', name='Adjust List Indents')
    dlg.get_by_role('button', name='LaTeX\'s own').click(); dlg.get_by_role('button', name='OK').click(); settle(page, 300)
    check('LaTeX\'s own there takes them away again', src(page) == WRAP(B3, '\\usepackage{enumitem}\n'), src(page))
    load_doc(page, WRAP('\\begin{enumerate}[(a)]\n  \\item One\n\\end{enumerate}', '\\usepackage{enumerate}\n')); click_text(page, 'One', 1)
    st = state(page, 'list-indents')
    check('beside the enumerate package it is off, saying why (enumitem would break its lists)', st[0] is False and 'enumerate package' in st[2], st)
    # the right click menu and the libraries have both
    load_doc(page, D); click_text(page, 'Two', 1)
    page.click('#rb-ul-x'); settle(page, 200)
    names = page.evaluate("[...document.querySelectorAll('.pop-menu [role^=menuitem]')].map((x) => x.getAttribute('aria-label'))")
    page.keyboard.press('Escape')
    check('the bullet library\'s menu has Picture Bullet and Adjust List Indents', 'Picture Bullet…' in names or 'Picture Bullet' in names, names)


def r2_pdf(page):
    """R2's lists compiled in the page with pdfLaTeX, XeLaTeX and LuaLaTeX: a picture bullet and a
    list's own indents, where TeX puts the text and the label (pdftotext -bbox) against where the
    page draws them"""
    if not os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        print('SKIP R2 lists in the PDF: no TeX tree in %s' % DIST)
        return
    import subprocess, tempfile
    from pypdf import PdfReader
    body = '\\noindent Plain words.\n\n\\begin{itemize}[leftmargin=3cm,labelwidth=1cm,labelsep=0.5cm]\n  \\item Indented\n\\end{itemize}\n\n' + PIC.replace('One', 'Pictured')
    pre = '\\usepackage{enumitem}\n\\usepackage{graphicx}\n'
    page.set_default_timeout(900000)
    for eng in ('pdflatex', 'xelatex', 'lualatex'):
        doc = ('% !TeX program = ' + eng + '\n' if eng != 'pdflatex' else '') + WRAP(body, pre)
        load_doc(page, doc); put_picture(page, 'figures/dot.png')
        # where the page draws them, in points of a 10pt font
        geo = page.evaluate("""() => { const p = [...document.querySelectorAll('#pages .it.p')].find((x) => x.textContent.includes('Indented')); const l = p.querySelector('.lbl'), fs = parseFloat(getComputedStyle(p).fontSize);
          return { text: parseFloat(getComputedStyle(p).paddingLeft) / fs * 10, lab: ((l.getBoundingClientRect().right - p.getBoundingClientRect().left) - parseFloat(getComputedStyle(l).paddingRight)) / fs * 10 }; }""")
        r = page.evaluate("""async () => { const r = await window.rikuy.api.compile(); let s = ''; if (r.pdf) for (let i = 0; i < r.pdf.length; i += 8192) s += String.fromCharCode(...r.pdf.subarray(i, i + 8192)); return { ok: r.ok, errs: (r.problems || []).filter((p) => p.severity === 'error').map((p) => p.message).slice(0, 3), pdf: s ? btoa(s) : '' }; }""")
        words, imgs = {}, 0
        if r['pdf']:
            raw = base64.b64decode(r['pdf'])
            imgs = len(PdfReader(io.BytesIO(raw)).pages[0].images)
            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as fh: fh.write(raw)
            out = subprocess.run(['pdftotext', '-bbox', fh.name, '-'], capture_output=True, text=True).stdout
            os.unlink(fh.name)
            seq = re.findall(r'xMin="([\d.]+)"[^>]*xMax="([\d.]+)"[^>]*>([^<]*)</word>', out)
            for i, (x0, x1, w) in enumerate(seq):
                if w in ('Plain', 'Indented', 'Pictured') and w not in words: words[w] = (float(x0), float(x1), float(seq[i - 1][1]) if i else 0)
        ok = r['ok'] and not r['errs'] and 'Plain' in words and 'Indented' in words and 'Pictured' in words and imgs >= 1
        if ok:
            m = words['Plain'][0]
            tx, lx = words['Indented'][0] - m, words['Indented'][2] - m
            ok = abs(tx - 85.04) < 1 and abs(lx - 70.81) < 1 and abs(geo['text'] - tx) < 1 and abs(geo['lab'] - lx) < 1
        check('R2 %s: a picture bullet and a list\'s own indents compile; TeX puts the text 3cm in and the bullet\'s right edge labelsep before it, where the page draws them' % eng, ok, (r['errs'], words, geo, imgs))
    page.set_default_timeout(30000)


def r2_phone(p, w, h, dark=False):
    """Picture Bullet and Adjust List Indents on a phone: from the bullet library's menu by taps,
    the dialogs on the screen with 44 px controls, no sideways scroll; screenshots"""
    browser, page, errors = open_page(p, w, h, dark=dark, touch=True)
    tag = ' (%dx%d)' % (w, h)
    shots = os.environ.get('RIKUY_SHOTS') or '/tmp/R2-shots'
    os.makedirs(shots, exist_ok=True)
    try:
        load_doc(page, WRAP(B3)); put_picture(page, 'figures/dot.png'); tap_text(page, 'Two', 1)
        tap(page, page.locator('#rb-ul-x')); settle(page, 200)
        tap_on(page, page.locator('.pop-menu [aria-label="Picture Bullet…"], .pop-menu [aria-label="Picture Bullet"]').first); settle(page, 300)
        f = fits(page, '.pop-list')
        small = page.evaluate("Math.min(...[...document.querySelectorAll('.pop-list .ld-pic, .pop-list .btn')].filter((x) => x.offsetParent).map((x) => Math.min(x.getBoundingClientRect().height, x.getBoundingClientRect().width)))")
        page.screenshot(path=os.path.join(shots, 'lists-picture-bullet-%d-%s.png' % (w, 'dark' if dark else 'light')))
        check('Picture Bullet by taps from the library\'s menu: on the screen, its tiles and buttons 44 px' + tag, f and f['across'] and f['down'] and small >= 44, (f, small))
        tap_on(page, page.get_by_role('radio', name='figures/dot.png')); tap_on(page, page.get_by_role('button', name='OK')); settle(page, 400)
        check('and a tap on a picture and OK writes the bullet' + tag, 'label={\\includegraphics[height=1.6ex]{figures/dot.png}}' in src(page), src(page)[-160:])
        tap_text(page, 'Two', 1)
        tap(page, page.locator('#rb-ul-x')); settle(page, 200)
        tap_on(page, page.locator('.pop-menu [aria-label="Adjust List Indents…"], .pop-menu [aria-label="Adjust List Indents"]').first); settle(page, 300)
        f = fits(page, '.pop-list')
        small = page.evaluate("Math.min(...[...document.querySelectorAll('.pop-list input, .pop-list select, .pop-list .btn')].filter((x) => x.offsetParent).map((x) => x.getBoundingClientRect().height))")
        page.screenshot(path=os.path.join(shots, 'lists-indents-%d-%s.png' % (w, 'dark' if dark else 'light')))
        check('Adjust List Indents by taps: on the screen, its fields and buttons 44 px tall' + tag, f and f['across'] and f['down'] and small >= 44, (f, small))
        fld = page.get_by_role('spinbutton', name='Text indent'); tap_on(page, fld); fld.fill('4'); tap_on(page, page.get_by_role('button', name='OK')); settle(page, 400)
        check('a value typed and OK tapped writes the indents' + tag, 'leftmargin=4em,labelwidth=2em,labelsep=0.5em' in src(page), src(page)[-200:])
        check('no sideways scroll' + tag, no_side_scroll(page))
        check('no page errors' + tag, not errors, errors[:3])
    finally:
        browser.close()


def run_all():
    # (names on the command line run those parts alone: r2, r2_pdf, phones, review, ...)
    only = set(sys.argv[1:])
    want = lambda n: not only or n in only
    with sync_playwright() as p:
        browser, page, errors = open_page(p)
        for f in (levels, toggles, libraries, numbering, multilevel, sorting, autolists, menus, review, pdf_check, r2, r2_pdf):
            if not want(f.__name__): continue
            try: f(page)
            except Exception as e: check(f.__name__ + ' runs to its end', False, str(e)[:400])
        check('no page errors', not [e for e in errors if 'tree.wasm' not in e and 'TeX' not in e], errors[:4])
        browser.close()
        for w, h, dark in ((390, 844, False), (360, 740, True)):
            if want('phones'):
                try: phone_run(p, w, h, dark)
                except Exception as e: check('the phone run at %dx%d runs to its end' % (w, h), False, str(e)[:400])
            if want('phones') or want('r2_phone'):
                try: r2_phone(p, w, h, dark)
                except Exception as e: check('the R2 phone run at %dx%d runs to its end' % (w, h), False, str(e)[:400])
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    run_all()
