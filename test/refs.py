"""References (batch B9: src/cmd/refs.js, src/refsrc.js, src/bib.js, src/ui/refsdialog.js,
src/ui/sourceform.js), in Chromium.

The table of contents (insert, its levels by tocdepth, remove; Add Text: a heading's level, left
out by \\section*, a short title), endnotes (enotez, \\printendnotes once; Next Footnote, Show Notes;
the Footnote and Endnote dialog: format, start, restart each section or page, convert), sources
(Add New Source writes a .bib entry and the bibliography's lines where there are none; a hand
written entry edited field by field, every other byte kept; delete, paste BibTeX), the citation
style per system (natbib, biblatex, plain BibTeX: never mixed), the bibliography (insert, its
title, remove), captions (in a float, a picture or a table becoming one, above or below,
numbering by section) and the lists of figures and tables, cross references (a label added where
there is none; \\cref only with cleveref), the index (Mark Entry, Mark All, a range, a cross
reference; Insert Index in its columns), links (Ctrl+K: web, e-mail, a place; edit, remove, the
right click menu) and bookmarks. Each by the round trip rule where it has an off (one step, undo
to the bytes, read back, hand written forms taken off exactly), and the page drawing each as TeX
prints it. Then a phone at 390 and 360 px with touch (taps, 44 px targets, dialogs inside the
screen, no sideways scroll), screenshots in $RIKUY_SHOTS (default /tmp/B9-shots) when asked
(`refs.py screenshots`), and where
dist/tex holds a TeX tree, all of it compiled in the page (pdfLaTeX, XeLaTeX, LuaLaTeX; biblatex
with biber) and read back from TeX's PDF.

    cd test && python3 refs.py [section ...]"""
import os, re, sys, base64, tempfile, subprocess, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import open_page, load_doc, src, click_text, select_text, check, results, roundtrip, ROOT
from playwright.sync_api import sync_playwright

DIST = os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist')
SHOTS = os.environ.get('RIKUY_SHOTS', '/tmp/B9-shots')
TEX = os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm'))

def D(body, pre='', cls='\\documentclass{article}'):
    return cls + '\n' + pre + '\\begin{document}\n' + body + '\n\\end{document}\n'

def cmd(page, cid, args=None):
    r = page.evaluate('([c, a]) => window.rikuy.runCommand(c, a === null ? undefined : a)', [cid, args])
    page.wait_for_timeout(250)
    return r

def run(cid, args=None):
    f = lambda page: cmd(page, cid, args)
    f.__name__ = cid + (' ' + str(args) if args is not None else '')
    return f

def hist(page): return page.evaluate('window.rikuy.hist.length')

def texts(page, sel):
    return page.evaluate('(s) => [...document.querySelectorAll(s)].map((e) => e.textContent.replace(/\\s+/g, " ").trim())', sel)

def toc_rows(page):
    return page.evaluate('[...document.querySelectorAll(".toc .toc-e")].map((r) => [...r.children].map((c) => c.textContent.trim()).filter(Boolean).join(" "))')

def insert_case(page, doc, place, fn, expected, label):
    """An insertion with no off of its own: exactly expected in one step; one undo gives doc back"""
    load_doc(page, doc)
    place(page)
    h0 = hist(page)
    fn(page)
    got = src(page)
    ok = check(label + ': writes exactly the LaTeX expected, as one step', (got == expected if isinstance(expected, str) else expected(got)) and hist(page) == h0 + 1, got[-300:])
    page.evaluate('rikuy.undo()'); page.wait_for_timeout(150)
    check(label + ': one undo gives the source back byte for byte', src(page) == doc, src(page)[-200:])
    # (the step again, the project's other files as they were)
    page.evaluate('rikuy.redo()'); page.wait_for_timeout(200)
    return got

at = lambda w, k=0: (lambda page: click_text(page, w, k))
sel = lambda w: (lambda page: select_text(page, w))

BODY = 'First paragraph here.\n\n\\section{Intro}\nText of the intro.\n\n\\subsection{Detail}\nMore text.\n\n\\section*{Unnumbered}\nAside.\n\n\\section{Last}\nThe end.'
DOC = D(BODY)


# ---- the table of contents ---------------------------------------------------------------------------
def toc(page):
    want = DOC.replace('First paragraph here.\n\n', 'First paragraph here.\n\n\\tableofcontents\n\n')
    hand = DOC.replace('\\begin{document}\n', '\\begin{document}\n\\tableofcontents\n')
    off = run('toc-remove')
    roundtrip(page, DOC, ('First paragraph', 3), run('table-of-contents'), want, forms=[hand.replace('\\begin{document}\n\\tableofcontents\n', '\\begin{document}\n\\tableofcontents\n')], off_command=off, label='Table of Contents')
    load_doc(page, want); page.wait_for_timeout(300)
    rows = toc_rows(page)
    check('the page draws the contents as TeX: numbered headings, the starred one left out', rows[:3] == ['1 Intro 1', '1.1 Detail 1', '2 Last 1'] and len(rows) == 3, rows)
    click_text(page, 'First paragraph', 3)
    check('with one there, Table of Contents says why it cannot add another', page.evaluate('rikuy.cmds.command("table-of-contents").whyNot(rikuy, rikuy.ribbonAt())').startswith('The document has its table of contents'))
    lv = D(BODY, '\\setcounter{tocdepth}{1}\n')
    roundtrip(page, DOC, ('First paragraph', 3), run('toc-levels', {'levels': 1}), lv, forms=[D(BODY, '\\usepackage{amsmath}\n\\setcounter{tocdepth}{1}\n').replace('\\usepackage{amsmath}\n', '')], off_command=run('toc-levels', {'levels': None}), label='Show Levels: 1')
    load_doc(page, lv.replace('First paragraph here.\n\n', 'First paragraph here.\n\n\\tableofcontents\n\n')); page.wait_for_timeout(300)
    check('tocdepth 1: the subsection is left out of the page\'s contents', toc_rows(page) == ['1 Intro 1', '2 Last 1'], toc_rows(page))
    rep = D('\\tableofcontents\n\n\\chapter{One}\n\\section{Sec}\nText.', cls='\\documentclass{report}')
    load_doc(page, rep); click_text(page, 'Text.', 1)
    cmd(page, 'toc-levels', {'levels': 1})
    check('in a report Show Levels: 1 is the chapters, tocdepth 0', '\\setcounter{tocdepth}{0}' in src(page) and [r.split(' ')[0] for r in toc_rows(page)] == ['1'], (src(page)[:120], toc_rows(page)))
    # \addcontentsline and a short title, as TeX lists them
    ex = D('\\tableofcontents\n\n\\section*{Preface}\n\\addcontentsline{toc}{section}{Preface}\nWords.\n\n\\section[Short]{A very long title}\nText.')
    load_doc(page, ex); page.wait_for_timeout(300)
    check('\\addcontentsline\'s entry and a short title shown in the contents', toc_rows(page) == ['Preface 1', '1 Short 1'], toc_rows(page))
    # Add Text: a menu of the heading's level and none; a short title
    load_doc(page, DOC); click_text(page, 'Intro', 2)
    page.evaluate('rikuy.selectTab("references")'); page.wait_for_timeout(150)
    page.locator('#rc-toc-add-text').click(); page.wait_for_timeout(250)
    names = page.get_by_role('menu').get_by_role('menuitemradio').all_inner_texts() + page.get_by_role('menu').get_by_role('menuitem').all_inner_texts() + page.get_by_role('menu').get_by_role('menuitemcheckbox').all_inner_texts()
    check('Add Text lists Do Not Show, Level 1 to 3 and a short title', any('Do Not Show' in n for n in names) and any(n.startswith('Level 2') for n in names) and any('Text in the Table of Contents' in n for n in names), names)
    page.get_by_role('menu').get_by_role('menuitemradio', name='Level 2').click(); page.wait_for_timeout(250)
    check('Level 2 makes the heading a subsection', '\\subsection{Intro}' in src(page), src(page)[60:140])
    page.evaluate('rikuy.undo()'); page.wait_for_timeout(150)
    def short(page):
        page.evaluate('rikuy.shortTitle(rikuy.ribbonAt(), "In")'); page.wait_for_timeout(200)
    roundtrip(page, DOC, ('Intro', 2), short, DOC.replace('\\section{Intro}', '\\section[In]{Intro}'), off_command=lambda page: page.evaluate('rikuy.shortTitle(rikuy.ribbonAt(), "")'), label='Text in the Table of Contents')
    click_text(page, 'Intro', 2)
    page.locator('#rc-toc-add-text').click(); page.wait_for_timeout(200)
    page.get_by_role('menu').get_by_role('menuitem', name='Text in the Table of Contents…').click(); page.wait_for_timeout(250)
    dlg = page.get_by_role('dialog', name='Text in the Table of Contents')
    dlg.get_by_label('Short title').fill('Intro & more'); dlg.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    check('the dialog writes the short title, escaped', '\\section[Intro \\& more]{Intro}' in src(page), src(page)[60:140])


# ---- footnotes and endnotes --------------------------------------------------------------------------
def notes(page):
    doc = D('Words of a paragraph.\n\nMore words here.')
    want = D('Words\\endnote{A note \\& more.} of a paragraph.\n\nMore words here.\n\\printendnotes', '\\usepackage{enotez}\n')
    got = insert_case(page, doc, at('Words of', 5), run('endnote', {'text': 'A note & more.'}), want, 'Insert Endnote')
    check('the page draws its mark and the notes at the end under Notes, as enotez prints them', texts(page, '.a-en') == ['1'] and texts(page, '.en-e') == ['1.A note & more.'] and 'Notes' in texts(page, '.refs-h'), (texts(page, '.a-en'), texts(page, '.en-e')))
    click_text(page, 'More words', 4)
    cmd(page, 'endnote', {'text': 'Second.'})
    check('a second endnote: no second package, no second \\printendnotes', src(page).count('enotez') == 1 and src(page).count('\\printendnotes') == 1 and texts(page, '.a-en') == ['1', '2'], src(page))
    # the button: the endnote's box opens on its mark to type in
    load_doc(page, doc); click_text(page, 'Words of', 5)
    page.evaluate('rikuy.selectTab("references")'); page.locator('#rc-endnote').click(); page.wait_for_timeout(300)
    box = page.locator('#pop-endnote')
    check('Insert Endnote opens a box by its mark to type its words', box.count() == 1)
    box.type('Typed note'); page.wait_for_timeout(600)
    check('typed into the endnote', '\\endnote{Typed note}' in src(page), src(page))
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    page.locator('.a-en').first.click(); page.wait_for_timeout(250)
    check('a click on its mark opens it again', page.locator('#pop-endnote').count() == 1 and page.locator('#pop-endnote').input_value() == 'Typed note')
    page.keyboard.press('Escape')
    # a hand written endnotes package: \theendnotes, its raised numbers
    hw = D('A\\endnote{one} b.\n\n\\theendnotes', '\\usepackage{endnotes}\n')
    load_doc(page, hw); page.wait_for_timeout(200)
    check('the endnotes package\'s \\theendnotes drawn with its raised numbers', texts(page, '.en-endnotes') == ['1one'] and page.locator('.en-endnotes sup.en-n').count() == 1, texts(page, '.en-e'))
    # Next Footnote, Previous, Show Notes
    fn = D('One\\footnote{first} two\\footnote{second} three.\n\nFour\\endnote{e1} five.\n\\printendnotes', '\\usepackage{enotez}\n')
    load_doc(page, fn); click_text(page, 'One', 0)
    cmd(page, 'next-footnote')
    check('Next Footnote: the caret just after the first footnote\'s mark', page.evaluate('(() => { const r = getSelection().getRangeAt(0); const m = document.querySelectorAll("sup.a-fn")[0]; return r.comparePoint(m, 0) < 0 && r.comparePoint(document.querySelectorAll("sup.a-fn")[1], 0) > 0; })()'))
    cmd(page, 'next-footnote')
    check('again: after the second', page.evaluate('getSelection().getRangeAt(0).comparePoint(document.querySelectorAll("sup.a-fn")[1], 0) < 0'))
    cmd(page, 'previous-footnote')
    check('Previous Footnote: back after the first', page.evaluate('getSelection().getRangeAt(0).comparePoint(document.querySelectorAll("sup.a-fn")[1], 0) > 0'))
    cmd(page, 'show-notes')
    check('Show Notes by a footnote\'s mark: the caret in its text at the page\'s foot', page.evaluate('!!getSelection().anchorNode.parentElement.closest(".fn")'))
    cmd(page, 'show-notes')
    check('and Show Notes again: back to its mark', page.evaluate('!getSelection().anchorNode.parentElement || !getSelection().anchorNode.parentElement.closest(".fn")'))
    cmd(page, 'next-endnote')
    check('Next Endnote: after the endnote\'s mark', page.evaluate('getSelection().getRangeAt(0).comparePoint(document.querySelector("sup.a-en"), 0) < 0'))
    # the Footnote and Endnote dialog's settings, each a round trip
    F = D('A\\footnote{x} b\\footnote{y}.\n\n\\section{Two}\nC\\footnote{z}.')
    roundtrip(page, F, ('Two', 1), run('footnote-options', {'style': 'roman'}), F.replace('\\begin{document}', '\\renewcommand{\\thefootnote}{\\roman{footnote}}\n\\begin{document}'),
              forms=[F.replace('\\begin{document}', '\\renewcommand\\thefootnote{\\roman{footnote}}\n\\begin{document}')], off_command=run('footnote-options', {'style': 'arabic'}), label='Number format i, ii, iii')
    load_doc(page, F.replace('\\begin{document}', '\\renewcommand{\\thefootnote}{\\roman{footnote}}\n\\begin{document}')); page.wait_for_timeout(200)
    check('the page numbers them i, ii, iii', texts(page, 'sup.a-fn') == ['i', 'ii', 'iii'], texts(page, 'sup.a-fn'))
    secw = F.replace('\\begin{document}', '\\counterwithin*{footnote}{section}\n\\begin{document}')
    roundtrip(page, F, ('Two', 1), run('footnote-options', {'restart': 'section'}), secw, off_command=run('footnote-options', {'restart': 'continuous'}), label='Restart each section')
    load_doc(page, secw); page.wait_for_timeout(200)
    check('the page starts them again at the section: 1, 2, then 1', texts(page, 'sup.a-fn') == ['1', '2', '1'], texts(page, 'sup.a-fn'))
    roundtrip(page, F, ('Two', 1), run('footnote-options', {'restart': 'page'}), F.replace('\\begin{document}', '\\usepackage[perpage]{footmisc}\n\\begin{document}'), off=F.replace('\\begin{document}', '\\usepackage{footmisc}\n\\begin{document}'), off_command=run('footnote-options', {'restart': 'continuous'}), label='Restart each page (footmisc)')
    roundtrip(page, F, ('Two', 1), run('footnote-options', {'start': '5'}), F.replace('\\begin{document}', '\\setcounter{footnote}{4}\n\\begin{document}'), off_command=run('footnote-options', {'start': '1'}), label='Start at 5')
    load_doc(page, F.replace('\\begin{document}', '\\setcounter{footnote}{4}\n\\begin{document}')); page.wait_for_timeout(200)
    check('the page starts them at 5', texts(page, 'sup.a-fn') == ['5', '6', '7'], texts(page, 'sup.a-fn'))
    load_doc(page, F); click_text(page, 'Two', 1)
    h0 = hist(page)
    cmd(page, 'footnote-options', {'convert': 'en'})
    t = src(page)
    check('Convert all footnotes to endnotes: the commands renamed, enotez and \\printendnotes, one step', t.count('\\endnote{') == 3 and '\\footnote' not in t and '\\usepackage{enotez}' in t and '\\printendnotes' in t and hist(page) == h0 + 1, t)
    cmd(page, 'footnote-options', {'convert': 'fn'})
    check('and back to footnotes (the package and \\printendnotes stay)', src(page).count('\\footnote{') == 3 and '\\endnote{' not in src(page))
    # the dialog
    load_doc(page, F); click_text(page, 'Two', 1)
    page.evaluate('rikuy.selectTab("references")'); page.locator('#rc-footnote-options').click(); page.wait_for_timeout(300)
    dlg = page.get_by_role('dialog', name='Footnote and Endnote')
    dlg.get_by_label('Number format').select_option('alph'); dlg.get_by_label('Numbering').select_option('section')
    dlg.get_by_role('button', name='Apply').click(); page.wait_for_timeout(300)
    t = src(page)
    check('the dialog\'s Apply writes both, as one step', '\\renewcommand{\\thefootnote}{\\alph{footnote}}' in t and '\\counterwithin*{footnote}{section}' in t and hist(page) == 1, t[:200])


# ---- sources, the style, the bibliography --------------------------------------------------------------
BIB = '% my sources\n@Book{knuth84,\n  Author = {Donald E. Knuth},\n  Title  = "The {\\TeX}book",\n  Year   = 1984,\n  Publisher = {Addison-Wesley}\n}\n\n@article{lamport94, author={Leslie Lamport}, title={LaTeX}, journal={J}, year={1994}}\n'
NAT = D('As shown \\citet{knuth84}, words.\n\n\\bibliographystyle{plainnat}\n\\bibliography{refs}', '\\usepackage{natbib}\n')
def sources(page):
    doc = D('Words to cite.')
    def add(page):
        cmd(page, 'add-source', {'type': 'book', 'fields': {'author': 'Knuth, Donald', 'title': 'The TeXbook & co', 'year': '1984', 'publisher': 'Addison-Wesley'}})
    load_doc(page, doc); click_text(page, 'to cite', 2)
    h0 = hist(page)
    add(page)
    t, b = src(page), src(page, 'refs.bib')
    check('Add New Source on a document with none: natbib, plainnat, \\bibliography{refs} and the citation, one step',
          t == D('Words to\\cite{knuth1984texbook} cite.\n\\bibliographystyle{plainnat}\n\\bibliography{refs}', '\\usepackage{natbib}\n') and hist(page) == h0 + 1, t)
    check('refs.bib made with the entry, its & escaped', b == '@book{knuth1984texbook,\n  author    = {Knuth, Donald},\n  title     = {The TeXbook \\& co},\n  year      = 1984,\n  publisher = {Addison-Wesley}\n}\n', b)
    check('the page draws the citation and the reference list from it', texts(page, '.a-cite') == ['Knuth (1984)'] and any('The TeXbook & co' in x for x in texts(page, '.it.ref')), (texts(page, '.a-cite'), texts(page, '.it.ref')))
    page.evaluate('rikuy.undo()'); page.wait_for_timeout(200)
    check('one undo: the text as it was and no refs.bib', src(page) == doc and not page.evaluate('rikuy.files.has("refs.bib")'))
    # the form, by its fields
    load_doc(page, {'main.tex': NAT, 'refs.bib': BIB}); click_text(page, 'words.', 5)
    page.evaluate('rikuy.selectTab("references")'); page.locator('#rc-add-source').click(); page.wait_for_timeout(300)
    dlg = page.get_by_role('dialog', name='Create Source')
    dlg.get_by_label('Type of source').select_option('article')
    dlg.get_by_label('Author', exact=True).fill('Doe, Jane'); dlg.get_by_label('Title', exact=True).fill('On {DNA}'); dlg.get_by_label('Journal name').fill('Nature'); dlg.get_by_label('Year').fill('2020')
    check('the tag follows what is typed', dlg.get_by_label('Tag name').input_value() == 'doe2020dna', dlg.get_by_label('Tag name').input_value())
    dlg.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    check('the form appends an @article to the .bib the document reads, and cites it with natbib\'s \\citet', src(page, 'refs.bib') == BIB + '\n@article{doe2020dna,\n  author  = {Doe, Jane},\n  title   = {On {DNA}},\n  journal = {Nature},\n  year    = 2020\n}\n' and 'words\\citep{doe2020dna}.' in src(page), (src(page, 'refs.bib')[-120:], src(page)[60:160]))
    # a hand written entry edited: only the field changed moves
    load_doc(page, {'main.tex': NAT, 'refs.bib': BIB}); click_text(page, 'words.', 1)
    page.evaluate('rikuy.selectTab("references")'); page.locator('#rc-manage-sources').click(); page.wait_for_timeout(300)
    mgr = page.get_by_role('dialog', name='Source Manager')
    check('Source Manager lists both entries, the cited one marked', mgr.get_by_role('option').count() == 2 and '✓ cited' in mgr.get_by_role('option').first.inner_text(), mgr.get_by_role('option').all_inner_texts())
    mgr.get_by_role('option').first.click(); page.wait_for_timeout(100)
    check('a cited source cannot be deleted', mgr.get_by_role('button', name='Delete').is_disabled())
    mgr.get_by_role('button', name='Edit…').click(); page.wait_for_timeout(300)
    ed = page.get_by_role('dialog', name='Edit Source')
    check('Edit Source shows the field as written, the tag fixed', ed.get_by_label('Title', exact=True).input_value() == 'The {\\TeX}book' and ed.get_by_label('Tag name').is_disabled() is False and ed.get_by_label('Tag name').get_attribute('readonly') is not None, ed.get_by_label('Title', exact=True).input_value())
    h0 = hist(page)
    ed.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    check('OK with nothing changed writes nothing', src(page, 'refs.bib') == BIB and hist(page) == h0)
    page.get_by_role('dialog', name='Source Manager').get_by_role('option').first.click()
    page.get_by_role('dialog', name='Source Manager').get_by_role('button', name='Edit…').click(); page.wait_for_timeout(300)
    ed = page.get_by_role('dialog', name='Edit Source')
    ed.get_by_label('Year').fill('1986'); ed.get_by_label('Title', exact=True).fill('The {\\TeX}book, 2nd'); ed.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    check('two fields changed: those values alone (a quoted one now in braces, review H2), padding and comment kept', src(page, 'refs.bib') == BIB.replace('= 1984', '= 1986').replace('"The {\\TeX}book"', '{The {\\TeX}book, 2nd}'), src(page, 'refs.bib'))
    page.evaluate('rikuy.undo()'); page.wait_for_timeout(150)
    check('one undo gives the .bib back byte for byte', src(page, 'refs.bib') == BIB)
    # delete one not cited; paste BibTeX
    page.evaluate('rikuy.closePop()'); click_text(page, 'words.', 1)
    page.locator('#rc-manage-sources').click(); page.wait_for_timeout(300)
    mgr = page.get_by_role('dialog', name='Source Manager')
    mgr.get_by_role('option').nth(1).click(); mgr.get_by_role('button', name='Delete').click(); page.wait_for_timeout(300)
    check('Delete takes the entry out with its line and nothing else', src(page, 'refs.bib') == BIB.replace('\n@article{lamport94, author={Leslie Lamport}, title={LaTeX}, journal={J}, year={1994}}\n', ''), src(page, 'refs.bib'))
    mgr = page.get_by_role('dialog', name='Source Manager')
    mgr.locator('summary').click()
    mgr.get_by_label('BibTeX to add').fill('@misc{knuth84, title={dup}}\n@misc{new1,\n  title = {Pasted}\n}')
    mgr.get_by_role('button', name='Add').click(); page.wait_for_timeout(300)
    check('pasted BibTeX: the entry with a new tag added as written, the one in use left', src(page, 'refs.bib').endswith('\n@misc{new1,\n  title = {Pasted}\n}\n') and src(page, 'refs.bib').count('knuth84') == 1, src(page, 'refs.bib')[-80:])
    page.evaluate('rikuy.closePop()')
    # the citation style: each system its own, never mixed
    for doc, system, style, want in ((NAT, 'natbib', 'apalike', NAT.replace('{plainnat}', '{apalike}')),
                                     (D('X \\cite{knuth84}.\n\n\\bibliographystyle{plain}\n\\bibliography{refs}'), 'bibtex', 'unsrt', None),
                                     (D('X \\parencite{knuth84}.\n\n\\printbibliography', '\\usepackage[style=authoryear]{biblatex}\n\\addbibresource{refs.bib}\n'), 'biblatex', 'apa', None)):
        if want is None: want = doc.replace('{plain}', '{unsrt}') if system == 'bibtex' else doc.replace('style=authoryear', 'style=apa')
        back = {'natbib': 'plainnat', 'bibtex': 'plain', 'biblatex': 'authoryear'}[system]
        roundtrip(page, {'main.tex': doc, 'refs.bib': BIB}['main.tex'] if False else doc, ('X' if system != 'natbib' else 'words.', 0), lambda page, st=style: (page.evaluate('rikuy.files.set("refs.bib", %r)' % BIB), cmd(page, 'citation-style', {'style': st})), want, off_command=run('citation-style', {'style': back}), label='Citation Style ' + style + ' (' + system + ')')
        load_doc(page, {'main.tex': doc, 'refs.bib': BIB}); click_text(page, 'X' if system != 'natbib' else 'words.', 0)
        page.evaluate('rikuy.selectTab("references")'); page.locator('#rc-citation-style').click(); page.wait_for_timeout(250)
        items = page.get_by_role('menu').get_by_role('menuitemradio').all_inner_texts()
        expect = {'natbib': 'Author–year', 'bibtex': 'Numbered', 'biblatex': 'MLA'}[system]
        check('the Style menu offers %s\'s own styles alone (%s)' % (system, expect), any(i.startswith(expect) for i in items) and (system == 'biblatex' or not any(i.startswith('MLA') for i in items)), items)
        page.keyboard.press('Escape')
    load_doc(page, {'main.tex': D('Words.\n\n\\begin{thebibliography}{9}\n\\bibitem{a} A.\n\\end{thebibliography}'), 'refs.bib': BIB}); click_text(page, 'Words', 1)
    check('a bibliography written by hand: Style, Add New Source and Bibliography say why not', 'by hand' in page.evaluate('rikuy.cmds.command("citation-style").whyNot(rikuy, rikuy.ribbonAt())') and 'by hand' in page.evaluate('rikuy.cmds.command("add-source").whyNot(rikuy, rikuy.ribbonAt())'))
    # the bibliography: inserted, its title, out again
    nb = D('As shown \\citet{knuth84}, words.\n\nLast.', '\\usepackage{natbib}\n')
    insert_case(page, {'main.tex': nb, 'refs.bib': BIB}['main.tex'], lambda page: (page.evaluate('rikuy.files.set("refs.bib", %r); rikuy.rebuild()' % BIB), click_text(page, 'Last', 1)), run('bibliography'), nb.replace('Last.', 'Last.\n\n\\bibliographystyle{plainnat}\n\\bibliography{refs}\n'), 'Bibliography (natbib)')
    check('the page draws it under References', 'References' in texts(page, '.refs-h') and len(texts(page, '.it.ref')) == 1, texts(page, '.refs-h'))
    wc = NAT.replace('\\bibliographystyle{plainnat}', '\\renewcommand{\\refname}{Works Cited}\n\\bibliographystyle{plainnat}')
    roundtrip(page, NAT, ('words.', 1), lambda page: (page.evaluate('rikuy.files.set("refs.bib", %r)' % BIB), page.evaluate('rikuy.bibRetitle("Works Cited")')), wc, off_command=lambda page: page.evaluate('rikuy.bibRetitle(null)'), label='Bibliography titled Works Cited (BibTeX)')
    load_doc(page, {'main.tex': wc, 'refs.bib': BIB}); page.wait_for_timeout(200)
    check('the page titles it Works Cited, as TeX does', 'Works Cited' in texts(page, '.refs-h'), texts(page, '.refs-h'))
    BLD = D('X \\parencite{knuth84}.\n\n\\printbibliography', '\\usepackage[style=authoryear]{biblatex}\n\\addbibresource{refs.bib}\n')
    roundtrip(page, BLD, ('X', 0), lambda page: page.evaluate('rikuy.bibRetitle("Works Cited")'), BLD.replace('\\printbibliography', '\\printbibliography[title=Works Cited]'), off_command=lambda page: page.evaluate('rikuy.bibRetitle(null)'), label='Bibliography titled Works Cited (biblatex)')
    load_doc(page, {'main.tex': BLD.replace('\\printbibliography', '\\printbibliography[title=Works Cited]'), 'refs.bib': BIB}); page.wait_for_timeout(200)
    check('biblatex\'s title= drawn on the page', 'Works Cited' in texts(page, '.refs-h'), texts(page, '.refs-h'))
    load_doc(page, {'main.tex': NAT, 'refs.bib': BIB}); click_text(page, 'words.', 1)
    cmd(page, 'bibliography-remove')
    check('Remove Bibliography takes both lines out', src(page) == D('As shown \\citet{knuth84}, words.\n', '\\usepackage{natbib}\n'), src(page)[-120:])


# ---- captions, the lists of figures and tables ---------------------------------------------------------
FIG = D('Text before.\n\n\\begin{figure}[htbp]\n\\centering\nPICTURE\n\\end{figure}\n\nText after.')
def captions(page):
    want = FIG.replace('PICTURE\n', 'PICTURE\n\\caption{A cat \\& a dog}\n\\label{fig:cat}\n')
    insert_case(page, FIG, at('PICTURE', 2), run('insert-caption', {'text': 'A cat & a dog', 'label': 'fig:cat'}), want, 'Insert Caption in a figure, below')
    check('the page draws Figure 1 and its words', texts(page, '.cap') == ['Figure 1: A cat & a dog'], texts(page, '.cap'))
    click_text(page, 'PICTURE', 2)
    check('in a figure with a caption: why not', 'has its caption' in page.evaluate('rikuy.captionWhyNot(rikuy.ribbonAt())'))
    insert_case(page, FIG, at('PICTURE', 2), run('insert-caption', {'text': 'Above', 'label': '', 'position': 'above'}), FIG.replace('\\centering\n', '\\centering\n\\caption{Above}\n'), 'Insert Caption above, after \\centering')
    pic = D('Text before.\n\n\\begin{center}\n  \\includegraphics[width=2cm]{cat}\n\\end{center}\n\nText after.', '\\usepackage{graphicx}\n')
    def in_pic(page):
        page.evaluate('''() => { const it = [...document.querySelectorAll('#pages .it')].find((e) => e.querySelector('.a-img, .img-missing, img')); const r = document.createRange(); r.setStart(it, 0); r.collapse(true); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }''')
        page.wait_for_timeout(100)
    insert_case(page, pic, in_pic, run('insert-caption', {'text': 'Cat', 'label': 'fig:c'}), pic.replace('\\begin{center}\n  \\includegraphics[width=2cm]{cat}\n\\end{center}', '\\begin{figure}[htbp]\n\\centering\n  \\includegraphics[width=2cm]{cat}\n\\caption{Cat}\n\\label{fig:c}\n\\end{figure}'), 'A centred picture becomes a figure with its caption, its own line kept')
    tab = D('Text before.\n\n\\begin{tabular}{ll}\na & b\n\\end{tabular}\n\nText after.')
    def in_tab(page):
        page.evaluate('''() => { const td = document.querySelector('#pages td'); const s = td.querySelector('span.t') || td; const r = document.createRange(); r.setStart(s.firstChild || s, 0); r.collapse(true); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }''')
        page.wait_for_timeout(100)
    insert_case(page, tab, in_tab, run('insert-caption', {'text': 'Data', 'label': 'tab:data'}), tab.replace('\\begin{tabular}{ll}\na & b\n\\end{tabular}', '\\begin{table}[htbp]\n\\centering\n\\caption{Data}\n\\label{tab:data}\n\\begin{tabular}{ll}\na & b\n\\end{tabular}\n\\end{table}'), 'A table on its own becomes a table, its caption above')
    check('the page draws Table 1 above it', texts(page, '.cap') == ['Table 1: Data'], texts(page, '.cap'))
    sec = D('\\section{One}\n' + FIG[FIG.find('Text before'):FIG.find('\\end{document}')])
    insert_case(page, sec, at('PICTURE', 2), run('insert-caption', {'text': 'S', 'label': '', 'numbering': 'section'}), lambda t: '\\counterwithin{figure}{section}\n\\begin{document}' in t and '\\caption{S}' in t, 'Numbering by section: \\counterwithin{figure}{section}, in the same step')
    check('the page numbers it 1.1', texts(page, '.cap') == ['Figure 1.1: S'], texts(page, '.cap'))
    mc = D('\\begin{multicols}{2}\nWords in a column.\n\n\\begin{tabular}{l}\nx\n\\end{tabular}\n\\end{multicols}', '\\usepackage{multicol}\n')
    load_doc(page, mc); in_tab(page)
    check('a table inside multicols: Insert Caption says why not (a float there stops TeX)', 'multicols' in page.evaluate('rikuy.captionWhyNot(rikuy.ribbonAt())'), page.evaluate('rikuy.captionWhyNot(rikuy.ribbonAt())'))
    # the dialog
    load_doc(page, FIG); click_text(page, 'PICTURE', 2)
    page.evaluate('rikuy.selectTab("references")'); page.locator('#rc-insert-caption').click(); page.wait_for_timeout(300)
    dlg = page.get_by_role('dialog', name='Caption')
    dlg.get_by_label('Caption', exact=True).fill('Sunset over the sea')
    check('the dialog shows Figure 1: and a label from the words', dlg.locator('.cap-pre').inner_text().strip() == 'Figure 1:' and dlg.get_by_label('Reference label', exact=True).input_value() == 'fig:sunset-over-the-sea')
    dlg.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    check('OK writes it', '\\caption{Sunset over the sea}\n\\label{fig:sunset-over-the-sea}\n\\end{figure}' in src(page), src(page)[-140:])
    # lists of figures and tables
    two = D('Intro.\n\n\\begin{figure}[htbp]\nA\n\\caption[Short cat]{A long caption of a cat}\n\\end{figure}\n\n\\begin{table}[htbp]\n\\caption{Numbers}\nB\n\\end{table}\n\n\\begin{figure}[h]\nC\n\\caption*{Unlisted}\n\\end{figure}')
    lof = two.replace('Intro.\n\n', 'Intro.\n\n\\listoffigures\n\n')
    roundtrip(page, two, ('Intro', 1), run('table-of-figures'), lof, forms=[two.replace('\\begin{document}\n', '\\begin{document}\n\\listoffigures\n')], off_command=run('remove-list-of-figures'), label='Insert Table of Figures')
    load_doc(page, lof.replace('\\listoffigures', '\\listoffigures\n\\listoftables')); page.wait_for_timeout(400)
    check('the page draws List of Figures and List of Tables as TeX: the short title, page numbers, \\caption* left out', texts(page, '.toc-head') == ['List of Figures', 'List of Tables'] and toc_rows(page) == ['1 Short cat 1', '1 Numbers 1'], (texts(page, '.toc-head'), toc_rows(page)))
    check('\\caption* drawn with no label', 'Unlisted' in texts(page, '.cap') and not any(x.startswith('Figure 2') for x in texts(page, '.cap')), texts(page, '.cap'))
    click_text(page, 'Intro', 1)
    insert_case(page, two, at('Intro', 1), run('list-of-tables'), two.replace('Intro.\n\n', 'Intro.\n\n\\listoftables\n\n'), 'List of Tables')


# ---- cross references -----------------------------------------------------------------------------------
def xrefs(page):
    doc = D('See here.\n\n\\section{Method}\nText.\n\n\\begin{figure}[h]\nX\n\\caption{Cat}\\label{fig:cat}\n\\end{figure}')
    load_doc(page, doc); click_text(page, 'See here', 3)
    page.evaluate('rikuy.selectTab("insert")'); page.locator('#ri-xref').click(); page.wait_for_timeout(300)
    dlg = page.get_by_role('dialog', name='Cross-reference')
    forms = [o for o in dlg.get_by_label('Insert reference to').locator('option').all_inner_texts()]
    check('without cleveref or hyperref: only \\ref and \\pageref offered', len(forms) == 2 and '\\ref' in forms[0] and '\\pageref' in forms[1], forms)
    opts = dlg.get_by_role('option').all_inner_texts()
    check('headings listed, one without a label says a label is added', any('1 Method' in o and 'a label is added: sec:method' in o for o in opts), opts)
    dlg.get_by_role('button', name='Insert').click(); page.wait_for_timeout(300)
    t = src(page)
    check('Insert writes \\ref and the heading\'s label in one step', 'See\\ref{sec:method} here.' in t and '\\section{Method}\\label{sec:method}' in t and hist(page) == 1, t[40:140])
    check('the page draws the number', texts(page, '.a-ref') == ['1'], texts(page, '.a-ref'))
    insert_case(page, doc, at('See here', 3), run('cross-reference', {'target': 'fig:cat', 'form': 'pageref', 'kind': 'figure'}), doc.replace('See here', 'See\\pageref{fig:cat} here'), 'A figure\'s page by its label (\\pageref)')
    cl = D(doc[doc.find('See'):doc.find('\\end{document}')], '\\usepackage{hyperref}\n\\usepackage{cleveref}\n')
    load_doc(page, cl); click_text(page, 'See here', 3)
    check('with cleveref: \\cref and \\Cref offered', [v for v, _ in page.evaluate('rikuy.refForms("figure")')] == ['ref', 'pageref', 'cref', 'Cref'])
    cmd(page, 'cross-reference', {'target': 'fig:cat', 'form': 'cref', 'kind': 'figure'})
    check('\\cref written and drawn with its name', '\\cref{fig:cat}' in src(page) and texts(page, '.a-ref') == ['fig. 1'], texts(page, '.a-ref'))
    load_doc(page, doc); click_text(page, 'See here', 3)
    cmd(page, 'cross-reference', {'target': 'fig:cat', 'form': 'cref', 'kind': 'figure'})
    check('\\cref asked for without cleveref falls back to \\ref', '\\ref{fig:cat}' in src(page) and '\\cref' not in src(page))


# ---- the index ----------------------------------------------------------------------------------------------
def index(page):
    doc = D('Alpha words here.\n\nBeta words and alpha again.\n\nGamma at the end.')
    want = D('Alpha\\index{Alpha} words here.\n\nBeta words and alpha again.\n\nGamma at the end.', '\\usepackage{imakeidx}\n\\makeindex\n')
    insert_case(page, doc, sel('Alpha'), run('mark-entry', {'main': 'Alpha'}), want, 'Mark Entry: imakeidx, \\makeindex and \\index after the selection')
    insert_case(page, doc, sel('Beta'), run('mark-entry', {'main': 'Beta', 'sub': 'words', 'bold': True}), lambda t: 'Beta\\index{Beta!words|textbf} words' in t, 'a subentry, its page bold')
    insert_case(page, doc, sel('Gamma'), run('mark-entry', {'main': 'Gamma', 'see': 'Alpha'}), lambda t: 'Gamma\\index{Gamma|see{Alpha}}' in t, 'a cross reference: see')
    insert_case(page, doc, lambda page: page.evaluate('''() => { const sp = [...document.querySelectorAll('#pages span.t')]; const a = sp.find((x) => x.textContent.includes('Beta')), z = sp.find((x) => x.textContent.includes('again')); const r = document.createRange(); r.setStart(a.firstChild, a.textContent.indexOf('Beta')); r.setEnd(z.firstChild, z.textContent.indexOf('again') + 5); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }'''),
                run('mark-entry', {'main': 'Beta', 'range': True}), lambda t: '\\index{Beta|(}Beta words and alpha again\\index{Beta|)}.' in t, 'a page range: |( and |) around the selection')
    insert_case(page, doc, sel('Alpha'), run('mark-entry', {'main': 'alpha', 'all': True}), lambda t: t.count('\\index{alpha}') == 1 and 'alpha\\index{alpha} again' in t, 'Mark All: every place the words stand, as typed (case kept)')
    insert_case(page, doc, sel('Alpha'), run('mark-entry', {'main': 'A!b@c|d'}), lambda t: '\\index{A"!b"@c\\textbar{}d}' in t, 'makeindex\'s own characters quoted, a | as \\textbar{} (hyperref reads a quoted one too)')
    marked = D('Alpha\\index{Alpha} words here\\index{beta!sub|textbf}.\n\nBeta\\index{Gamma|see{Alpha}} words.\n\nLast.', '\\usepackage{imakeidx}\n\\makeindex\n')
    got = insert_case(page, marked, at('Last', 1), run('insert-index', {'columns': 2}), marked.replace('Last.', 'Last.\n\n\\printindex\n'), 'Insert Index: \\printindex after the paragraph')
    page.wait_for_timeout(300)
    rows = texts(page, '.idx-e')
    check('the page draws the index as makeindex sorts it: Alpha, beta and its subentry, Gamma see Alpha', rows == ['Alpha, 1', 'beta', 'sub, 1', 'Gamma, see Alpha'], rows)
    check('a subentry\'s page in bold, the index in two columns on a page of its own', page.locator('.idx-e b').count() == 1 and page.evaluate('[...document.querySelectorAll(".idx-e")].every((e) => e.closest(".page") !== document.querySelector("#pages .page"))'))
    insert_case(page, marked.replace('Last.', 'Last.\n\n\\printindex\n'), at('Last', 1), run('insert-index', {'columns': 3}), marked.replace('\\makeindex', '\\makeindex[columns=3]').replace('Last.', 'Last.\n\n\\printindex\n'), 'Insert Index again: its columns changed where \\makeindex is')
    # the dialog: Mark Index Entry by Alt+Shift+X
    load_doc(page, doc); select_text(page, 'Gamma')
    page.keyboard.press('Alt+Shift+X'); page.wait_for_timeout(300)
    dlg = page.get_by_role('dialog', name='Mark Index Entry')
    check('Alt+Shift+X opens Mark Index Entry with the selected words', dlg.count() == 1 and dlg.get_by_label('Main entry').input_value() == 'Gamma')
    dlg.get_by_label('Italic').check(); dlg.get_by_role('button', name='Mark', exact=True).click(); page.wait_for_timeout(300)
    check('Mark writes it, italic page', 'Gamma\\index{Gamma|textit}' in src(page), src(page)[-80:])


# ---- links and bookmarks -----------------------------------------------------------------------------------
def links(page):
    doc = D('Read the manual today.\n\n\\section{Install}\nSteps.')
    want = D('Read the \\href{https://ctan.org/a\\%20b\\#x}{manual} today.\n\n\\section{Install}\nSteps.', '\\usepackage[hidelinks]{hyperref}\n')
    insert_case(page, doc, sel('manual'), run('link', {'url': 'ctan.org/a%20b#x', 'kind': 'web'}), want, 'Link around the selection: \\href, # and % escaped, hyperref with hidelinks')
    click_text(page, 'manual', 2)
    check('the caret in it: the link context of the right click menu', page.evaluate('rikuy.menuContexts(rikuy.ribbonAt())')[0] == 'link')
    for c in ('link-edit', 'link-open', 'link-copy', 'link-remove'):
        check(c + ' enabled in the link', page.evaluate('(id) => rikuy.cmds.enabled ? true : true', c) and page.evaluate('(id) => { const c = rikuy.cmds.command(id); return !c.when || c.when(rikuy, rikuy.ribbonAt()); }', c))
    cmd(page, 'link-remove')
    check('Remove Link: its words stay, exactly as they were', src(page) == want.replace('\\href{https://ctan.org/a\\%20b\\#x}{manual}', 'manual'), src(page))
    insert_case(page, doc, at('today', 0), run('link', {'url': 'a@b.org', 'kind': 'mail'}), lambda t: '\\href{mailto:a@b.org}{a@b.org}today' in t, 'an e-mail address: mailto:')
    insert_case(page, doc, at('today', 0), run('link', {'url': 'https://example.org', 'kind': 'web'}), lambda t: '\\url{https://example.org}today' in t, 'an address alone: \\url')
    insert_case(page, doc, sel('manual'), run('link', {'kind': 'place', 'target': {'add': {'f': 'main.tex', 'p': doc.find('\\section{Install}') + 17, 'prefix': 'sec:', 'words': 'Install'}}}), lambda t: '\\hyperref[sec:install]{manual}' in t and '\\section{Install}\\label{sec:install}' in t, 'a place in this document: \\hyperref and the heading\'s label, one step')
    # Ctrl+K: the dialog; with the caret in a link, Edit Hyperlink
    load_doc(page, want); click_text(page, 'manual', 2)
    page.keyboard.press('Control+k'); page.wait_for_timeout(300)
    dlg = page.get_by_role('dialog', name='Edit Hyperlink')
    check('Ctrl+K in a link opens Edit Hyperlink with its address and words', dlg.count() == 1 and dlg.get_by_label('Address', exact=True).input_value() == 'https://ctan.org/a%20b#x' and dlg.get_by_label('Text to display').input_value() == 'manual')
    dlg.get_by_label('Address', exact=True).fill('https://ctan.org'); dlg.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    check('only the address changed, the words\' source kept', src(page) == want.replace('https://ctan.org/a\\%20b\\#x', 'https://ctan.org'), src(page)[40:140])
    load_doc(page, D('Some \\textbf{bold words} here.')); select_text(page, 'bold words')
    page.keyboard.press('Control+k'); page.wait_for_timeout(300)
    dlg = page.get_by_role('dialog', name='Insert Hyperlink')
    check('Ctrl+K on a selection: Insert Hyperlink, its words shown', dlg.count() == 1 and dlg.get_by_label('Text to display').input_value() == 'bold words')
    dlg.get_by_label('Address', exact=True).fill('example.com'); page.keyboard.press('Enter'); page.wait_for_timeout(300)
    check('the selection\'s own source kept as the link\'s words', 'Some \\textbf{\\href{https://example.com}{bold words}} here.' in src(page) or 'Some \\href{https://example.com}{\\textbf{bold words}} here.' in src(page), src(page))
    # a \url clicked: the dialog, Remove there
    load_doc(page, D('Go to \\url{https://a_b.org} now.', '\\usepackage{url}\n'))
    page.locator('.a-url').first.click(); page.wait_for_timeout(300)
    dlg = page.get_by_role('dialog', name='Edit Hyperlink')
    check('a click on a \\url opens Edit Hyperlink', dlg.count() == 1 and dlg.get_by_label('Address', exact=True).input_value() == 'https://a_b.org')
    dlg.get_by_role('button', name='Remove Link').click(); page.wait_for_timeout(300)
    check('Remove Link on \\url: its address as text, escaped', 'Go to https://a\\_b.org now.' in src(page), src(page))
    # bookmarks
    bdoc = D('Para one.\n\nPara two.', '\\usepackage{hyperref}\n')
    insert_case(page, bdoc, at('Para two', 4), run('bookmark', {'add': 'here'}), bdoc.replace('Para two', 'Para\\phantomsection\\label{here} two'), 'Bookmark in running text: \\phantomsection\\label')
    page.evaluate('rikuy.bookmarkDelete("here")'); page.wait_for_timeout(200)
    check('deleted again: the bytes of before', src(page) == bdoc, src(page))
    load_doc(page, bdoc.replace('Para two', 'Para\\label{mark} two')); click_text(page, 'Para one', 1)
    page.evaluate('rikuy.selectTab("insert")'); page.locator('#rc-bookmark').click(); page.wait_for_timeout(300)
    dlg = page.get_by_role('dialog', name='Bookmark')
    check('the Bookmark dialog lists the labels', dlg.get_by_role('option').all_inner_texts()[0].startswith('mark'))
    dlg.get_by_role('option').first.click(); dlg.get_by_role('button', name='Go To').click(); page.wait_for_timeout(300)
    check('Go To puts the caret at it', page.evaluate('(() => { const c = rikuy.caretNow(); return c && rikuy.src(c.f).slice(c.a, c.a + 6); })()') == '\\label')


# ---- a phone ----------------------------------------------------------------------------------------------------
def open_phone(p, width, height, dark=False):
    import browser as B
    br = p.chromium.launch(args=[a for a in os.environ.get('CHROME_ARGS', '').split() if a])
    ctx = br.new_context(viewport={'width': width, 'height': height}, color_scheme='dark' if dark else 'light', device_scale_factor=2, has_touch=True, is_mobile=True)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
    html = open(os.path.join(DIST, 'rikuy.html'), encoding='utf8').read()
    doc = B.SKELETON_HEAD + html + '</body></html>'
    def handler(route):
        url = route.request.url
        if url.startswith('https://rikuy.test/'):
            path = url[len('https://rikuy.test/'):].split('?')[0]
            f = os.path.join(DIST, path)
            if path and os.path.isfile(f):
                ct = 'text/javascript' if path.endswith(('.js', '.mjs')) else 'application/wasm' if path.endswith('.wasm') else 'application/octet-stream'
                return route.fulfill(status=200, content_type=ct, body=open(f, 'rb').read())
            return route.fulfill(status=200, content_type='text/html; charset=utf-8', body=doc)
        if url in B.ROUTES:
            return route.fulfill(status=200, content_type='application/javascript', headers={'Access-Control-Allow-Origin': '*'}, body=open(B.ROUTES[url], 'rb').read())
        return route.abort()
    ctx.route('**/*', handler)
    page.goto('https://rikuy.test/')
    page.evaluate('localStorage.clear()'); page.reload()
    page.wait_for_function('window.rikuy && document.getElementById("boot").hidden', timeout=60000)
    return br, page, errors

def tap_word(page, word, off=2):
    b = page.evaluate('''([w, off]) => { const s = [...document.querySelectorAll('#pages span.t')].find((x) => x.textContent.includes(w)); if (!s) return null; s.scrollIntoView({ block: 'center' });
      const r = document.createRange(), i = s.textContent.indexOf(w) + off; r.setStart(s.firstChild, i); r.setEnd(s.firstChild, i + 1); const b = r.getBoundingClientRect(); return [b.left + 1, b.top + b.height / 2]; }''', [word, off])
    page.wait_for_timeout(150)
    page.touchscreen.tap(b[0], b[1]); page.wait_for_timeout(250)

def sideways(page): return page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')

def fits(page, cls):
    return page.evaluate('''(c) => { const d = document.querySelector(c); if (!d) return null; const r = d.getBoundingClientRect(), s = getComputedStyle(d);
      return { ok: r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1 && (d.scrollHeight <= d.clientHeight + 1 || /auto|scroll/.test(s.overflowY)), r: [r.left, r.right, r.top, r.bottom, innerWidth, innerHeight] }; }''', cls)

def phone(p):
    os.makedirs(SHOTS, exist_ok=True)
    for w, h in ((390, 844), (360, 740)):
        br, page, errors = open_phone(p, w, h)
        load_doc(page, FIG.replace('Text after.', 'Text after.\n\n\\section{Two}\nMore.')); page.wait_for_timeout(300)
        tap_word(page, 'PICTURE', 2)
        page.select_option('#rb-tabsel', 'references'); page.wait_for_timeout(300)
        page.evaluate('document.getElementById("rc-insert-caption").scrollIntoView({ inline: "center" })'); page.wait_for_timeout(150)
        page.locator('#rc-insert-caption').tap(); page.wait_for_timeout(400)
        f = fits(page, '.pop-refs')
        check('%d px: Insert Caption by a tap opens its dialog inside the screen, scrolling where it is longer' % w, f and f['ok'], f)
        dlg = page.get_by_role('dialog', name='Caption')
        dlg.get_by_label('Caption', exact=True).fill('On a phone')
        small = page.evaluate('''() => [...document.querySelectorAll('.pop-refs input:not([type=checkbox]):not([type=radio]), .pop-refs select, .pop-refs .btn')].filter((e) => e.offsetParent).map((e) => Math.round(e.getBoundingClientRect().height)).filter((h) => h < 44)''')
        check('%d px: the dialog\'s fields and buttons are 44 px for a finger' % w, not small, small)
        dlg.get_by_role('button', name='OK').tap(); page.wait_for_timeout(300)
        check('%d px: OK by a tap writes the caption' % w, '\\caption{On a phone}' in src(page), src(page)[-160:])
        big = page.evaluate('''() => [...document.querySelectorAll('.rb-grp:not(.folded) button')].filter((b) => b.offsetParent && b.closest('[role=tabpanel]') && !b.closest('[role=tabpanel]').hidden).map((b) => { const r = b.getBoundingClientRect(); return [b.id || b.dataset.cmd || '', Math.round(r.width), Math.round(r.height)]; })''')
        check('%d px: the References tab\'s buttons are 44 px (a split button\'s arrow 28 wide)' % w, big and all(x[2] >= 44 and (x[1] >= 44 or (x[0].endswith('-x') and x[1] >= 28)) for x in big), [x for x in big if x[2] < 44 or (x[1] < 44 and not x[0].endswith('-x'))][:6])
        tap_word(page, 'More', 1)
        page.evaluate('document.getElementById("rc-table-of-contents") && document.getElementById("rc-table-of-contents").scrollIntoView({ inline: "center" })')
        page.locator('#rc-table-of-contents').tap(); page.wait_for_timeout(300)
        check('%d px: a tap on Table of Contents writes it, no key needed' % w, '\\tableofcontents' in src(page))
        tap_word(page, 'More', 1)
        page.locator('#rc-mark-entry').tap(); page.wait_for_timeout(300)
        f = fits(page, '.pop-refs')
        check('%d px: Mark Entry (Alt+Shift+X on a keyboard) has a button a finger reaches; its dialog fits' % w, f and f['ok'], f)
        page.get_by_role('dialog', name='Mark Index Entry').get_by_label('Main entry').fill('More')
        page.get_by_role('dialog', name='Mark Index Entry').get_by_role('button', name='Mark', exact=True).tap(); page.wait_for_timeout(300)
        check('%d px: Mark by a tap' % w, '\\index{More}' in src(page))
        page.select_option('#rb-tabsel', 'insert'); page.wait_for_timeout(200)
        select_text(page, 'More'); page.wait_for_timeout(100)
        page.evaluate('document.getElementById("ri-link").scrollIntoView({ inline: "center" })')
        page.locator('#ri-link').tap(); page.wait_for_timeout(400)
        dlg = page.get_by_role('dialog', name='Insert Hyperlink')
        f = fits(page, '.pop-refs')
        check('%d px: Link (Ctrl+K on a keyboard) by a tap: its dialog inside the screen' % w, dlg.count() == 1 and f and f['ok'], f)
        dlg.get_by_label('Address', exact=True).fill('example.org'); dlg.get_by_role('button', name='OK').tap(); page.wait_for_timeout(300)
        check('%d px: the link written by a tap' % w, '\\href{https://example.org}{M' in src(page), src(page)[-120:])
        tap_word(page, 'More', 1)
        page.locator('#ri-link').tap(); page.wait_for_timeout(300)
        dlg = page.get_by_role('dialog', name='Edit Hyperlink')
        check('%d px: the right click menu\'s Edit, Open, Copy and Remove Link are buttons of the link\'s dialog' % w, dlg.count() == 1 and all(dlg.get_by_role('button', name=n).count() == 1 for n in ('Remove Link', 'Open', 'Copy', 'OK')))
        dlg.get_by_role('button', name='Remove Link').tap(); page.wait_for_timeout(300)
        check('%d px: Remove Link by a tap' % w, '\\href' not in src(page))
        page.select_option('#rb-tabsel', 'references'); page.wait_for_timeout(200)
        tap_word(page, 'More', 1)
        page.evaluate('document.getElementById("rc-manage-sources").scrollIntoView({ inline: "center" })')
        page.locator('#rc-manage-sources').tap(); page.wait_for_timeout(300)
        f = fits(page, '.pop-refs')
        check('%d px: Source Manager fits the screen' % w, f and f['ok'], f)
        page.get_by_role('dialog', name='Source Manager').get_by_role('button', name='New…').tap(); page.wait_for_timeout(300)
        f = fits(page, '.pop-refs')
        check('%d px: Create Source fits the screen and scrolls' % w, f and f['ok'], f)
        page.keyboard.press('Escape')
        check('%d px: the page never scrolled sideways' % w, sideways(page) <= 0, sideways(page))
        check('%d px: no page errors' % w, not errors, errors[:3])
        br.close()
    for dark in (False, True):
        br, pg, er = open_phone(p, 390, 844, dark)
        load_doc(pg, D('\\tableofcontents\n\n\\section{Intro}\nText\\endnote{A note.} with a note\\index{note}.\n\n\\begin{figure}[htbp]\n\\centering\nX\n\\caption{A figure}\n\\end{figure}\n\n\\printendnotes', '\\usepackage{enotez}\n\\usepackage{imakeidx}\n\\makeindex\n'))
        tap_word(pg, 'Text', 1)
        pg.select_option('#rb-tabsel', 'references'); pg.wait_for_timeout(300)
        tag = 'phone-' + ('dark' if dark else 'light') + '-390'
        pg.screenshot(path=os.path.join(SHOTS, tag + '.png'))
        pg.locator('#rc-footnote-options').tap(); pg.wait_for_timeout(400)
        pg.screenshot(path=os.path.join(SHOTS, tag + '-notes.png'))
        pg.keyboard.press('Escape'); tap_word(pg, 'Text', 1)
        pg.locator('#rc-add-source').tap(); pg.wait_for_timeout(400)
        pg.screenshot(path=os.path.join(SHOTS, tag + '-source.png'))
        br.close()


def screenshots(p):
    os.makedirs(SHOTS, exist_ok=True)
    doc = D('\\tableofcontents\n\\listoffigures\n\n\\section{Intro}\nText\\endnote{A note.} cited \\citet{knuth84}, with a note\\index{note} and\\index{alpha}\\index{alpha!beta|textbf} more.\n\n\\begin{figure}[htbp]\n\\centering\nX\n\\caption{A figure}\\label{fig:a}\n\\end{figure}\n\n\\section{Two}\nSee Figure~\\ref{fig:a}.\n\n\\printendnotes\n\\bibliographystyle{plainnat}\n\\bibliography{refs}\n\\printindex',
          '\\usepackage{natbib}\n\\usepackage{enotez}\n\\usepackage{imakeidx}\n\\makeindex\n')
    for dark in (False, True):
        for w in (1920, 1366, 390):
            b, page, errors = open_page(p, width=w, height=900, dark=dark)
            load_doc(page, {'main.tex': doc, 'refs.bib': BIB}); page.wait_for_timeout(400)
            click_text(page, 'Text', 1)
            if w > 860: page.evaluate('rikuy.selectTab("references")')
            else: page.select_option('#rb-tabsel', 'references')
            page.wait_for_timeout(300)
            tag = ('dark' if dark else 'light') + '-' + str(w)
            page.screenshot(path=os.path.join(SHOTS, 'references-' + tag + '.png'))
            if w == 1366:
                for cid, name in (('manage-sources', 'sources'), ('footnote-options', 'notes')):
                    click_text(page, 'Text', 1); cmd(page, cid); page.wait_for_timeout(300)
                    page.screenshot(path=os.path.join(SHOTS, name + '-' + tag + '.png')); page.evaluate('rikuy.closePop()')
                click_text(page, 'X', 0) if False else None
                page.evaluate('''() => { const el = [...document.querySelectorAll('#pages .idx-e')].pop(); if (el) el.scrollIntoView(); }'''); page.wait_for_timeout(300)
                page.screenshot(path=os.path.join(SHOTS, 'index-page-' + tag + '.png'))
            b.close()


# ---- TeX agrees ----------------------------------------------------------------------------------------------
def compile_doc(page, text, files=None):
    page.set_default_timeout(600000)
    if files:
        for n, t in files.items(): page.evaluate('([n, t]) => rikuy.files.set(n, t)', [n, t])
    r = page.evaluate('''async (t) => { await window.rikuy.api.setSource(t); const r = await window.rikuy.api.compile(); let s = ''; if (r.pdf) for (let i = 0; i < r.pdf.length; i += 8192) s += String.fromCharCode(...r.pdf.subarray(i, i + 8192));
      return { ok: r.ok, pages: r.pages, b64: r.pdf ? btoa(s) : '', log: (r.problems || []).map((p) => p.message || JSON.stringify(p)).join('\\n').slice(-1500) }; }''', text)
    page.set_default_timeout(30000)
    out = {'ok': r['ok'], 'pages': r['pages'], 'text': '', 'log': r['log']}
    if r['b64']:
        f = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False); f.write(base64.b64decode(r['b64'])); f.close()
        out['text'] = subprocess.run(['pdftotext', '-layout', f.name, '-'], capture_output=True, text=True).stdout
        os.unlink(f.name)
    return out

def compiled(page):
    if not TEX:
        print('SKIP the PDF of references: no TeX tree in %s' % DIST)
        return
    # everything B9 writes, written by its commands, then compiled
    doc = D('First paragraph.\n\n\\section{Intro}\nText of the intro.\n\n\\begin{figure}[htbp]\n\\centering\nX\n\\end{figure}\n\n\\section{Two}\nSee here. Words to cite and an alpha word.\n\nLast.')
    load_doc(page, doc)
    click_text(page, 'First paragraph', 3); cmd(page, 'table-of-contents')
    click_text(page, 'First paragraph', 3); cmd(page, 'table-of-figures')
    click_text(page, 'X', 0); cmd(page, 'insert-caption', {'text': 'A cat & dog', 'label': 'fig:cat'})
    click_text(page, 'See here', 3); cmd(page, 'cross-reference', {'target': 'fig:cat', 'form': 'ref', 'kind': 'figure'})
    click_text(page, 'Text of', 4); cmd(page, 'endnote', {'text': 'An endnote 50%.'})
    click_text(page, 'Text of', 2); cmd(page, 'footnote-options', {'style': 'roman', 'restart': 'section'})
    click_text(page, 'to cite', 2); cmd(page, 'add-source', {'type': 'article', 'fields': {'author': 'Doe, Jane and Roe, Rick', 'title': 'On {DNA} & more', 'journal': 'Nature', 'year': '2020', 'url': 'https://x.org/a b#c'}})
    select_text(page, 'alpha'); cmd(page, 'mark-entry', {'main': 'alpha', 'bold': True})
    click_text(page, 'Last', 1); cmd(page, 'insert-index', {'columns': 2})
    select_text(page, 'Words'); cmd(page, 'link', {'url': 'https://ctan.org/#top', 'kind': 'web'})
    click_text(page, 'Last', 1); cmd(page, 'bookmark', {'add': 'last'})
    t, bib = src(page), src(page, 'refs.bib')
    check('everything written, in the source', all(x in t for x in ('\\tableofcontents', '\\listoffigures', '\\caption{A cat \\& dog}', '\\ref{fig:cat}', '\\endnote{An endnote 50\\%.}', '\\printendnotes', '\\citet{doe2020dna}' if '\\citet{' in t else '\\cite{doe2020dna}', '\\index{alpha|textbf}', '\\printindex', '\\href{https://ctan.org/\\#top}{Words}', '\\label{last}')), t)
    for engine in ('pdflatex', 'xelatex', 'lualatex'):
        text = t if engine == 'pdflatex' else '% !TeX program = ' + engine + '\n' + t
        c = compile_doc(page, text, {'refs.bib': bib})
        T = re.sub(r'\s+', ' ', c['text'])
        check(engine + ': what References wrote compiles in the page', c['ok'] and c['text'], c['log'][-400:])
        check(engine + ': TeX prints the contents, the list of figures, the caption, the reference, the notes, the bibliography and the index',
              not [x for x in ('Contents', '1 Intro', 'List of Figures', 'Figure 1: A cat & dog', 'See1 here', 'Notes', 'An endnote 50%.', 'References', 'On DNA & more', 'Index', 'alpha, 1') if x not in T], [x for x in ('Contents', '1 Intro', 'List of Figures', 'Figure 1: A cat & dog', 'See1 here', 'Notes', 'An endnote 50%.', 'References', 'On DNA & more', 'Index', 'alpha, 1') if x not in T])
        if engine == 'pdflatex':
            check('the index has the entry\'s page as the page drew it', re.search(r'alpha, (\d+)', T) and page.evaluate('[...document.querySelectorAll(".idx-e")].map((e) => e.textContent)') == ['alpha, ' + re.search(r'alpha, (\d+)', T).group(1)], (T[-300:], page.evaluate('[...document.querySelectorAll(".idx-e")].map((e) => e.textContent)')))
    # the review's cases where TeX is the judge
    nb = D('Words \\citet{knuth84} here.\n\n\\bibliographystyle{plainnat}\n\\bibliography{refs}', '\\usepackage{natbib}\n')
    load_doc(page, {'main.tex': nb, 'refs.bib': BIB}); click_text(page, 'here', 1)
    cmd(page, 'citation-style', {'style': 'IEEEtranN:numbers'})
    c = compile_doc(page, src(page), {'refs.bib': BIB}); T = re.sub(r'\s+', ' ', c['text'])
    check('H6: IEEE under natbib (IEEEtranN, numbers) compiles and TeX prints [1], as the page does', c['ok'] and '[1]' in T and texts(page, '.a-cite') == ['Knuth [1]'], (c['log'][-300:], T[:200], texts(page, '.a-cite')))
    sty = D('Words here.', '\\usepackage{mystyle}\n')
    load_doc(page, {'main.tex': sty, 'mystyle.sty': '\\RequirePackage[style=authoryear]{biblatex}\n\\addbibresource{refs.bib}\n', 'refs.bib': ''}); click_text(page, 'Words', 2)
    cmd(page, 'add-source', {'type': 'book', 'fields': {'author': 'Doe, Jane', 'title': 'A Title', 'year': '2020', 'publisher': 'P'}})
    files = {'refs.bib': src(page, 'refs.bib'), 'mystyle.sty': '\\RequirePackage[style=authoryear]{biblatex}\n\\addbibresource{refs.bib}\n'}
    c = compile_doc(page, src(page), files); T = re.sub(r'\s+', ' ', c['text'])
    check('H8: Add New Source with biblatex from a .sty compiles with biber; TeX prints the citation and the entry', c['ok'] and 'Doe' in T and '2020' in T and '?' not in T, (c['log'][-300:], T[:300]))
    ub = '@misc{u, title={U}, url={https://e.com/p\\#s}}\n@article{q, author = "M{\\"u}ller, A.", title={Q}, journal={J}, year=2001}\n'
    mix = D('\\section{Results}\nWords \\cite{u} and \\cite{q}.\n\n\\bibliographystyle{plainnat}\n\\bibliography{refs}', '\\usepackage{url}\n')
    load_doc(page, {'main.tex': mix, 'refs.bib': ub}); click_text(page, 'Results', 2)
    page.evaluate('rikuy.shortTitle(rikuy.ribbonAt(), "Results [draft]")'); page.wait_for_timeout(200)
    click_text(page, 'Words', 2); cmd(page, 'manage-sources'); mgr = page.get_by_role('dialog', name='Source Manager')
    mgr.get_by_role('option').first.click(); mgr.get_by_role('button', name='Edit…').click(); page.wait_for_timeout(300)
    ed = page.get_by_role('dialog', name='Edit Source'); ed.get_by_label('URL').fill(ed.get_by_label('URL').input_value().replace('/p', '/q')); ed.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    click_text(page, 'Words', 2); cmd(page, 'manage-sources'); mgr = page.get_by_role('dialog', name='Source Manager')
    mgr.get_by_role('option').nth(1).click(); mgr.get_by_role('button', name='Edit…').click(); page.wait_for_timeout(300)
    ed = page.get_by_role('dialog', name='Edit Source'); ed.get_by_label('Author', exact=True).fill(ed.get_by_label('Author', exact=True).input_value() + ' and Doe, C.'); ed.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    c = compile_doc(page, src(page), {'refs.bib': src(page, 'refs.bib')}); T = unicodedata.normalize('NFC', re.sub(r'\s+', ' ', c['text']))
    check('M7, L4, H2: a short title with ], an edited url with # and a quoted accent edited: TeX prints each', c['ok'] and '1 Results' in T and 'https://e.com/q#s' in T and 'Müller' in T and 'Doe' in T, (c['log'][-300:], T[:500]))
    # V1, V2 where TeX is the judge
    load_doc(page, {'main.tex': D('Words \\cite{s} to cite.\n\n\\bibliographystyle{plainnat}\n\\bibliography{refs}', '\\usepackage{natbib}\n'), 'refs.bib': '@book{s, author = {Roe, R.}, title = {Science and Society}, year = 2000}\n'})
    click_text(page, 'Words', 2)
    ed = edit_source(page); ed.get_by_label('Title', exact=True).fill('Science & Society, 50% of it'); ed.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    click_text(page, 'to cite', 2)
    cmd(page, 'add-source', {'type': 'misc', 'fields': {'author': 'Doe, J.', 'title': 'Page', 'year': '2020', 'url': 'https://e.com/p#s?a=1%202'}})
    c = compile_doc(page, src(page), {'refs.bib': src(page, 'refs.bib')}); T = re.sub(r'\s+', ' ', c['text'])
    check('V1, V2: a typed & and % and an address with # and % compile in natbib; TeX prints them', c['ok'] and 'Science & Society, 50% of it' in T and 'https://e.com/p#s?a=1%202' in T, (c['log'][-300:], T[:400]))
    # biblatex with biber: APA, Works Cited
    bl = D('As \\textcite{knuth84} shows.\n\n\\printbibliography', '\\usepackage[style=authoryear]{biblatex}\n\\addbibresource{refs.bib}\n')
    load_doc(page, {'main.tex': bl, 'refs.bib': BIB}); click_text(page, 'shows', 1)
    cmd(page, 'citation-style', {'style': 'apa'}); page.evaluate('rikuy.bibRetitle("Works Cited")'); page.wait_for_timeout(200)
    c = compile_doc(page, src(page), {'refs.bib': BIB})
    T = re.sub(r'\s+', ' ', c['text'])
    check('biblatex: style=apa and title=Works Cited compile with biber, and TeX prints them', c['ok'] and 'Works Cited' in T and 'Knuth' in T and '1984' in T, (c['log'][-300:], T[:400]))


# ---- the hostile review of 25c4b9c: each finding as its case ---------------------------------------
def review(page):
    # H1: a field written over lines, never touched, stays as it is; math is never escaped
    bib = '@article{s,\n  author = {Smith, John and\n             Doe, Jane},\n  title = {On $L_p$ spaces and\n             fifty things},\n  year = 2000\n}\n'
    load_doc(page, {'main.tex': NAT.replace('\\citet{knuth84}', '\\citet{s}'), 'refs.bib': bib}); click_text(page, 'words.', 1)
    cmd(page, 'manage-sources'); mgr = page.get_by_role('dialog', name='Source Manager')
    mgr.get_by_role('option').first.click(); mgr.get_by_role('button', name='Edit…').click(); page.wait_for_timeout(300)
    ed = page.get_by_role('dialog', name='Edit Source')
    ed.get_by_label('Year').fill('2001'); ed.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    check('H1: Edit Source changes the year alone; fields over several lines and their math kept byte for byte', src(page, 'refs.bib') == bib.replace('year = 2000', 'year = 2001'), src(page, 'refs.bib'))
    # H3: a report numbering its figures 1, 2, 3 keeps \counterwithout
    rep = D('\\chapter{One}\n\\begin{figure}[h]\nX\n\\end{figure}', '\\counterwithout{figure}{chapter}\n', cls='\\documentclass{report}')
    load_doc(page, rep); click_text(page, 'X', 0)
    page.evaluate('rikuy.selectTab("references")'); page.locator('#rc-insert-caption').click(); page.wait_for_timeout(300)
    dlg = page.get_by_role('dialog', name='Caption')
    check('H3: the dialog shows 1, 2, 3 for \\counterwithout', dlg.get_by_label('Numbering').input_value() == 'plain')
    dlg.get_by_label('Caption', exact=True).fill('C'); dlg.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    check('H3: OK leaves the preamble alone', '\\counterwithout{figure}{chapter}' in src(page) and src(page).count('counterwith') == 1 and '\\caption{C}' in src(page), src(page)[:200])
    # H4: Apply with nothing changed writes nothing
    nw = D('\\section{S}\nA\\footnote{x}.', '\\usepackage{amsmath}\n\\numberwithin{footnote}{section}\n\\renewcommand{\\thefootnote}{[\\arabic{footnote}]}\n\\setcounter{footnote}{0}\n')
    load_doc(page, nw); click_text(page, 'A', 0); h0 = hist(page)
    page.locator('#rc-footnote-options').click(); page.wait_for_timeout(300)
    page.get_by_role('dialog', name='Footnote and Endnote').get_by_role('button', name='Apply').click(); page.wait_for_timeout(300)
    check('H4: Footnote and Endnote, Apply untouched: nothing written', src(page) == nw and hist(page) == h0, src(page)[:260])
    # H5: a link over two paragraphs is refused
    two = D('Alpha one.\n\nBeta two.')
    load_doc(page, two); page.evaluate("""() => { const sp = [...document.querySelectorAll('#pages span.t')]; const a = sp.find((x) => x.textContent.includes('one.')), z = sp.find((x) => x.textContent.includes('Beta')); const r = document.createRange(); r.setStart(a.firstChild, a.textContent.indexOf('one.')); r.setEnd(z.firstChild, 4); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }""")
    cmd(page, 'link', {'url': 'https://x.org', 'kind': 'web'})
    check('H5: a link over two paragraphs is refused, the reason said', src(page) == two and 'one paragraph' in page.inner_text('#toast'), page.inner_text('#toast'))
    # H7: symbols for eleven footnotes are refused
    many = D(' '.join('W\\footnote{n}' for _ in range(11)))
    load_doc(page, many); click_text(page, 'W', 0)
    cmd(page, 'footnote-options', {'style': 'fnsymbol'})
    check('H7: symbols for 11 footnotes refused (TeX counts nine), the reason said', src(page) == many and 'nine' in page.inner_text('#toast').replace('9', 'nine'), page.inner_text('#toast'))
    cmd(page, 'footnote-options', {'style': 'fnsymbol', 'restart': 'page'})
    check('H7: with Restart each page they are allowed', '\\fnsymbol{footnote}' in src(page) and 'perpage' in src(page))
    # H8: biblatex from the project's .sty: Add New Source writes \printbibliography alone
    sty = D('Words here.', '\\usepackage{mystyle}\n')
    load_doc(page, {'main.tex': sty, 'mystyle.sty': '\\RequirePackage[style=authoryear]{biblatex}\n\\addbibresource{refs.bib}\n', 'refs.bib': ''}); click_text(page, 'Words', 2)
    cmd(page, 'add-source', {'type': 'book', 'fields': {'author': 'Doe, J.', 'title': 'T', 'year': '2020'}})
    t = src(page)
    check('H8: biblatex from a .sty: no natbib, no \\bibliography; \\printbibliography and the citation', 'natbib' not in t and '\\bibliography{' not in t and '\\printbibliography' in t and re.search(r'\\(paren)?cite\{doe2020t\}', t), t)
    # M1: an existing \counterwithin stays where it is; \numberwithin stays \numberwithin
    m1 = D('\\section{S}\n\\begin{figure}[h]\nX\n\\end{figure}', '\\usepackage{graphicx}\n\\counterwithin{figure}{section}\n\\usepackage{xcolor}\n')
    load_doc(page, m1); click_text(page, 'X', 0)
    cmd(page, 'insert-caption', {'text': 'C', 'label': '', 'numbering': 'section'})
    check('M1: \\counterwithin kept where it stands', src(page) == m1.replace('X\n', 'X\n\\caption{C}\n'), src(page)[:200])
    # M2, M3: parts in the contents; tocdepth set in the body
    load_doc(page, D('\\setcounter{tocdepth}{1}\n\\tableofcontents\n\\part{Big}\n\\section{Sec}\n\\subsection{Sub}\nText.')); page.wait_for_timeout(300)
    check('M2, M3: the contents list the part, and tocdepth 1 set in the body leaves out the subsection', toc_rows(page) == ['I Big 1', '1 Sec 1'], toc_rows(page))
    load_doc(page, D('\\setcounter{tocdepth}{1}\n\\tableofcontents\n\\section{Sec}\nText.')); click_text(page, 'Text', 1)
    cmd(page, 'toc-levels', {'levels': 3})
    check('M3: Show Levels changes the body\'s line, the one TeX reads', '\\setcounter{tocdepth}{3}\n\\tableofcontents' in src(page) and src(page).count('tocdepth') == 1, src(page)[:160])
    # M4, L6: subfigure captions are (a), (b), not in the list; the figure still takes its caption
    sf = D('\\listoffigures\n\n\\begin{figure}[h]\n\\begin{subfigure}{.4\\linewidth}A\\caption{Left}\\end{subfigure}\n\\begin{subfigure}{.4\\linewidth}B\\caption{Right}\\end{subfigure}\n\\end{figure}', '\\usepackage{subcaption}\n')
    load_doc(page, sf); page.wait_for_timeout(300)
    check('M4: subcaptions drawn (a) and (b), the list of figures empty of them', texts(page, '.cap') == ['(a) Left', '(b) Right'] and toc_rows(page) == [], (texts(page, '.cap'), toc_rows(page)))
    click_text(page, 'Left', 1)
    check('L6: a figure with subcaptions still takes its own caption', page.evaluate('rikuy.captionWhyNot(rikuy.ribbonAt())') == '', page.evaluate('rikuy.captionWhyNot(rikuy.ribbonAt())'))
    # M6: an entry another builds on is not deleted
    cr = '@book{parent, title={P}, year=2000}\n@incollection{child, title={C}, crossref={parent}}\n'
    load_doc(page, {'main.tex': NAT.replace('\\citet{knuth84}', '\\citet{child}'), 'refs.bib': cr}); click_text(page, 'words.', 1)
    cmd(page, 'manage-sources'); mgr = page.get_by_role('dialog', name='Source Manager')
    mgr.get_by_role('option', name=re.compile('P')).first.click()
    check('M6: an entry another one crossrefs cannot be deleted', mgr.get_by_role('button', name='Delete').is_disabled())
    page.evaluate('rikuy.closePop()')
    # M7: a short title with a bracket in braces
    load_doc(page, D('\\section{Results}\nText.')); click_text(page, 'Results', 2)
    page.evaluate('rikuy.shortTitle(rikuy.ribbonAt(), "Results [draft]")'); page.wait_for_timeout(200)
    check('M7: a short title holding ] is written in braces', '\\section[{Results [draft]}]{Results}' in src(page), src(page)[40:120])
    # M8, L4: a url field edited keeps its address; # and % stay bare
    ub = '@misc{u, title={U}, url={https://e.com/p\\#s?a=1\\%202}}\n'
    load_doc(page, {'main.tex': NAT.replace('\\citet{knuth84}', '\\citet{u}'), 'refs.bib': ub}); click_text(page, 'words.', 1)
    cmd(page, 'manage-sources'); mgr = page.get_by_role('dialog', name='Source Manager')
    mgr.get_by_role('option').first.click(); mgr.get_by_role('button', name='Edit…').click(); page.wait_for_timeout(300)
    ed = page.get_by_role('dialog', name='Edit Source')
    ed.get_by_label('URL').fill(ed.get_by_label('URL').input_value().replace('/p', '/q')); ed.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    check('M8, L4: an edited address keeps its # and %, written bare as url.sty reads them', 'url={https://e.com/q#s?a=1%202}' in src(page, 'refs.bib'), src(page, 'refs.bib'))
    # L5: the caption goes before a lone \label at the figure's end
    l5 = D('\\section{S}\n\\begin{figure}[h]\nX\n\\label{fig:x}\n\\end{figure}')
    load_doc(page, l5); click_text(page, 'X', 0)
    cmd(page, 'insert-caption', {'text': 'C', 'label': ''})
    check('L5: the caption before the figure\'s lone \\label', 'X\n\\caption{C}\n\\label{fig:x}\n\\end{figure}' in src(page), src(page)[-90:])
    # L10: a report's footnotes numbered within the chapter
    load_doc(page, D('\\chapter{One}\nA\\footnote{x}.', '\\counterwithin{footnote}{chapter}\n', cls='\\documentclass{report}')); page.wait_for_timeout(200)
    check('L10: \\counterwithin{footnote}{chapter}: 1.1 as TeX prints it', texts(page, 'sup.a-fn') == ['1.1'], texts(page, 'sup.a-fn'))
    # L11: changing only a link's words keeps its address's bytes
    lk = D('See \\href{https://a.org/x\\_y}{old words} now.', '\\usepackage{hyperref}\n')
    load_doc(page, lk); click_text(page, 'old', 1)
    cmd(page, 'link', {'kind': 'web', 'url': 'https://a.org/x_y', 'text': 'new words'})
    check('L11: the words changed, the address\'s \\_ kept', '\\href{https://a.org/x\\_y}{new words}' in src(page), src(page)[40:140])
    # M5: Restart each page drawn: each page's marks from 1
    pp = D(' '.join('Words of a long paragraph\\footnote{n}' for _ in range(3)) + '\n\\newpage\n' + ' '.join('More\\footnote{m}' for _ in range(2)), '\\usepackage[perpage]{footmisc}\n')
    load_doc(page, pp); page.wait_for_timeout(400)
    check('M5: footmisc\'s perpage: the second page\'s marks start from 1', texts(page, 'sup.a-fn') == ['1', '2', '3', '1', '2'], texts(page, 'sup.a-fn'))
    # R1: after typing above a figure, a label added by Cross-reference lands after its caption
    rf = D('Typed here.\n\n\\begin{figure}[h]\nX\n\\caption{Cat}\n\\end{figure}\n\nSee it.')
    load_doc(page, rf); click_text(page, 'Typed', 2); page.keyboard.type('abc '); page.wait_for_timeout(300)
    click_text(page, 'See', 3)
    tg = page.evaluate('rikuy.refTargets("figure")[0]')
    cmd(page, 'cross-reference', {'target': {'add': tg['add']}, 'form': 'ref', 'kind': 'figure'})
    check('R1: after typing above it, the label goes right after the caption', '\\caption{Cat}\\label{fig:cat}' in src(page) and 'See\\ref{fig:cat} it.' in src(page), src(page)[40:200])
    # R2: typing in a document with a list of figures and a starred heading stays on the fast path
    load_doc(page, D('\\listoffigures\n\\section*{Pre}\nPlain words to type in.\n\n\\begin{figure}[h]\nX\\caption{C}\n\\end{figure}', '\\setcounter{tocdepth}{1}\n')); click_text(page, 'Plain', 2)
    n0 = page.evaluate('window.rikuy.incr ? window.rikuy.incr.reused : null')
    page.keyboard.type('xyz'); page.wait_for_timeout(300)
    n1 = page.evaluate('window.rikuy.incr ? window.rikuy.incr.reused : null')
    check('R2: typing beside a list of figures and a starred heading takes the fast path', n0 is not None and n1 > n0, (n0, n1))
    # R3: the index's page numbers follow when its block is reused and the entry moves to page 2
    ix = D('First words.\n\nAlpha\\index{alpha}.\n\n' + '\n\n'.join(['Filler paragraph that is long enough to take room on the page. ' * 3] * 2) + '\n\n\\printindex', '\\usepackage{imakeidx}\n\\makeindex\n')
    load_doc(page, ix); page.wait_for_timeout(300)
    p1 = texts(page, '.idx-e')
    click_text(page, 'Alpha', 0); page.keyboard.press('Control+Enter'); page.wait_for_timeout(400)
    p2 = texts(page, '.idx-e')
    check('R3: an entry pushed to page 2 by a page break before it: the index says 2', p1 == ['alpha, 1'] and p2 == ['alpha, 2'], (p1, p2))

# ---- the verification of be26497 (V1 to V10) -------------------------------------------------------
def edit_source(page, k=0):
    cmd(page, 'manage-sources'); mgr = page.get_by_role('dialog', name='Source Manager')
    mgr.get_by_role('option').nth(k).click(); mgr.get_by_role('button', name='Edit…').click(); page.wait_for_timeout(300)
    return page.get_by_role('dialog', name='Edit Source')

def verify(page):
    # V1: & and % typed into an existing field escaped, the rest kept
    load_doc(page, {'main.tex': NAT.replace('\\citet{knuth84}', '\\citet{s}'), 'refs.bib': '@book{s, title = {Science and Society}, year = 2000}\n'}); click_text(page, 'words.', 1)
    ed = edit_source(page); ed.get_by_label('Title', exact=True).fill('Science & Society, 50% of it'); ed.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    check('V1: & and % typed into a field written \\& and \\%', 'title = {Science \\& Society, 50\\% of it}' in src(page, 'refs.bib'), src(page, 'refs.bib'))
    # V3: a CRLF .bib: an untouched field over two lines kept byte for byte
    crlf = '@book{s,\r\n  title = {On spaces and\r\n             things},\r\n  year = 2000\r\n}\r\n'
    load_doc(page, {'main.tex': NAT.replace('\\citet{knuth84}', '\\citet{s}'), 'refs.bib': crlf}); click_text(page, 'words.', 1)
    ed = edit_source(page); ed.get_by_label('Year').fill('2001'); ed.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    check('V3: a CRLF .bib keeps its untouched field over two lines, its line ends too', src(page, 'refs.bib') == crlf.replace('2000', '2001'), repr(src(page, 'refs.bib')))
    # V9: braces that do not balance: the dialog stays open with what was typed
    load_doc(page, {'main.tex': NAT.replace('\\citet{knuth84}', '\\citet{s}'), 'refs.bib': '@book{s, title = {A {B} C}, year = 2000}\n'}); click_text(page, 'words.', 1)
    ed = edit_source(page); ed.get_by_label('Title', exact=True).fill('A {B C'); ed.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    check('V9: unbalanced braces refused before the dialog closes, the typing kept', page.get_by_role('dialog', name='Edit Source').count() == 1 and page.get_by_role('dialog', name='Edit Source').get_by_label('Title', exact=True).input_value() == 'A {B C' and 'balance' in page.inner_text('#toast'), page.inner_text('#toast'))
    page.evaluate('rikuy.closePop()')
    # V2: a web address with # in Rikuy's own natbib set up gets url.sty in the same step
    load_doc(page, D('Words to cite.')); click_text(page, 'to cite', 2); h0 = hist(page)
    cmd(page, 'add-source', {'type': 'misc', 'fields': {'author': 'Doe, J.', 'title': 'Page', 'year': '2020', 'url': 'https://e.com/p#s?a=1%202'}})
    check('V2: an address with # and % in natbib: \\usepackage{url} in the same step', '\\usepackage{url}' in src(page) and hist(page) == h0 + 1 and '{https://e.com/p#s?a=1%202}' in src(page, 'refs.bib'), (src(page)[:120], src(page, 'refs.bib')))
    # V4: per page footnotes leave \thanks marks alone
    load_doc(page, D('\\maketitle\nWords\\footnote{a} and\\footnote{b}.', '\\usepackage[perpage]{footmisc}\n\\title{T\\thanks{one}\\thanks{two}}\n\\author{A}\n')); page.wait_for_timeout(400)
    check('V4: perpage: \\thanks keep their symbols, the footnotes 1 and 2', texts(page, 'sup.a-fn') == ['*', '†', '1', '2'], texts(page, 'sup.a-fn'))
    # V5: an entry at the end of a paragraph cut over two pages takes the second page
    long = 'Start\\index{alpha} ' + ' '.join('x%d' % k for k in range(900)) + ' End\\index{omega}.'
    load_doc(page, D(long + '\n\n\\printindex', '\\usepackage{imakeidx}\n\\makeindex\n')); page.wait_for_timeout(600)
    end_pg = page.evaluate("""() => { const sp = [...document.querySelectorAll('#pages span.t')].filter((x) => x.textContent.includes('End')).pop(); const pages = [...document.querySelectorAll('.page')]; return pages.indexOf(sp.closest('.page')) + 1; }""")
    check('V5: "End" drawn on page %d, and the index gives omega that page' % end_pg, end_pg >= 2 and texts(page, '.idx-e') == ['alpha, 1', 'omega, %d' % end_pg], texts(page, '.idx-e'))
    # V8: \footnotemark counts toward symbols' nine
    fm = D(' '.join('W\\footnote{n}' for _ in range(9)) + ' X\\footnotemark')
    load_doc(page, fm); click_text(page, 'W', 0)
    cmd(page, 'footnote-options', {'style': 'fnsymbol'})
    check('V8: nine footnotes and a \\footnotemark: symbols refused', src(page) == fm, page.inner_text('#toast'))

REFS_IDS = ['table-of-contents', 'toc-levels', 'toc-remove', 'toc-add-text', 'endnote', 'next-footnote', 'previous-footnote', 'next-endnote', 'previous-endnote', 'show-notes', 'footnote-options', 'add-source', 'manage-sources', 'citation-style', 'bibliography', 'bibliography-title', 'bibliography-remove', 'insert-caption', 'table-of-figures', 'list-of-tables', 'remove-list-of-figures', 'remove-list-of-tables', 'mark-entry', 'insert-index', 'link', 'bookmark', 'cross-reference', 'link-edit', 'link-open', 'link-copy', 'link-remove']

def cached(page):
    """The References commands' when and on on a long document of several files: read once for each
    text of the project (CI's page.py long_document named them at 27 to 84 ms a look at the caret),
    under 2 ms each at a look, and the same answers as a fresh read after an edit to any file."""
    pre = ''.join('\\newcommand{\\m%s}{x} %% %s\n' % (chr(97 + k % 26) * (1 + k // 26), 'y' * 60) for k in range(1500))
    body = '\n\n'.join('\\subsection{Head %d}\nWords of paragraph %d here.' % (k, k) for k in range(1500))
    main = '\\documentclass{article}\n' + pre + '\\usepackage{natbib}\n\\begin{document}\n\\input{ch1}\n' + body + '\n\\end{document}\n'
    load_doc(page, {'main.tex': main, 'ch1.tex': 'Chapter words.\n', 'refs.bib': BIB}); click_text(page, 'Words of paragraph 3 ', 2); page.wait_for_timeout(300)
    STATE = """(ids) => { const g = window.rikuy, C = g.cmds, at = g.ribbonAt(), out = {};
      for (const id of ids) { const c = C.command(id); at.memo = {}; out[id] = [C.enabled(g, c, at), c.on ? !!c.on(g, at) : null]; } return out; }"""
    FRESH = "(ids) => { window.rikuy.refsMemo = null; return (" + STATE + ")(ids); }"
    a = page.evaluate(STATE, REFS_IDS)
    check('its answers are a fresh read\'s', a == page.evaluate(FRESH, REFS_IDS), a)
    page.evaluate(STATE, REFS_IDS)  # (the look the ribbon makes after a fresh read)
    t = page.evaluate("""(ids) => { const g = window.rikuy, C = g.cmds, at = g.ribbonAt(), t = {};
      for (let k = 0; k < 10; k++) { at.memo = {}; for (const id of ids) { const c = C.command(id), t0 = performance.now(); C.enabled(g, c, at); if (c.on) c.on(g, at); t[id] = (t[id] || 0) + performance.now() - t0; } }
      return Object.entries(t).map(([id, v]) => [id, Math.round(v / 10 * 10) / 10]).filter(([, v]) => v > 2); }""", REFS_IDS)
    check('a preamble of 167 KB, 3000 paragraphs and two more files: no References command\'s when and on over 2 ms at a look at the caret', not t, t)
    steps = [('ch1.tex gets \\listoffigures', 'rikuy.files.set("ch1.tex", "\\\\listoffigures\\n\\nChapter words.\\n")', 'remove-list-of-figures'),
             ('ch1.tex gets \\tableofcontents', 'rikuy.files.set("ch1.tex", "\\\\tableofcontents\\n\\\\listoffigures\\n\\nChapter words.\\n")', 'toc-remove'),
             ('main.tex gets its bibliography', 'rikuy.files.set("main.tex", rikuy.src("main.tex").replace("\\\\end{document}", "\\\\bibliographystyle{plainnat}\\n\\\\bibliography{refs}\\n\\\\end{document}"))', 'bibliography-remove'),
             ('main.tex becomes a thebibliography document', 'rikuy.files.set("main.tex", rikuy.src("main.tex").replace("\\\\bibliographystyle{plainnat}\\n\\\\bibliography{refs}", "\\\\begin{thebibliography}{9}\\\\bibitem{a} A.\\\\end{thebibliography}"))', '!add-source')]
    for label, js, cid in steps:
        before = page.evaluate(STATE, REFS_IDS)
        page.evaluate(js)
        now = page.evaluate(STATE, REFS_IDS)
        want = not cid.startswith('!')
        check('after an edit (%s) the answers are a fresh read\'s, %s %s' % (label, cid.lstrip('!'), 'on' if want else 'off'), now == page.evaluate(FRESH, REFS_IDS) and now[cid.lstrip('!')][0] == want and before[cid.lstrip('!')][0] != want, (before[cid.lstrip('!')], now[cid.lstrip('!')]))
    page.evaluate('rikuy.files.set("other.tex", "\\\\documentclass{article}\\n\\\\begin{document}\\nOther.\\n\\\\end{document}\\n"); rikuy.main = "other.tex"')
    now = page.evaluate(STATE, REFS_IDS)
    check('another main file: the answers are a fresh read\'s (add-source on again, no bibliography)', now == page.evaluate(FRESH, REFS_IDS) and now['add-source'][0] and not now['bibliography-remove'][0], now['add-source'])


# ---- R4: endnote formats, New Label, Exclude label, right aligned index numbers, the Table of Authorities
def r4refs(page):
    from browser import roundtrip
    EN = D('Text\\endnote{One.} more\\endnote{Two.}.\n\n\\printendnotes', '\\usepackage{enotez}\n')
    insert_case(page, EN, at('Text', 2), run('footnote-options', {'enStyle': 'roman'}), EN.replace('\\usepackage{enotez}\n', '\\usepackage{enotez}\n\\setenotez{counter-format=roman}\n'), 'R4 endnote number format (enotez): \\setenotez{counter-format=roman}')
    check('R4 the page numbers the endnotes i, ii as TeX will', texts(page, 'sup.a-en')[:2] == ['i', 'ii'], texts(page, 'sup.a-en'))
    hand = EN.replace('\\usepackage{enotez}\n', '\\usepackage{enotez}\n\\setenotez{list-name=Notes,counter-format=Alph}\n')
    load_doc(page, hand)
    check('R4 a hand written \\setenotez{…,counter-format=Alph} is read: A, B on the page and in the dialog', texts(page, 'sup.a-en')[:2] == ['A', 'B'] and page.evaluate('window.rikuy.model.opts.refs.en.style') == 'Alph')
    insert_case(page, hand, at('Text', 2), run('footnote-options', {'enStyle': 'arabic'}), hand.replace('list-name=Notes,counter-format=Alph', 'list-name=Notes'), 'R4 back to 1, 2: the key taken out, the other kept')
    ENP = D('Text\\endnote{One.}.\n\n\\theendnotes', '\\usepackage{endnotes}\n')
    insert_case(page, ENP, at('Text', 2), run('footnote-options', {'enStyle': 'Roman'}), ENP.replace('\\usepackage{endnotes}\n', '\\usepackage{endnotes}\n\\renewcommand{\\theendnote}{\\Roman{endnote}}\n'), 'R4 endnote number format (endnotes package): \\theendnote')
    load_doc(page, EN); click_text(page, 'Text', 2)
    cmd(page, 'footnote-options')
    check('R4 the Footnote and Endnote dialog has the endnotes\' Number format', page.locator('#en-format').count() == 1)
    page.keyboard.press('Escape'); page.evaluate('window.rikuy.closePop()')
    # New Label: a float of the document's own, newfloat's
    want = FIG.replace('\\begin{figure}', '\\begin{scheme}').replace('\\end{figure}', '\\caption{A reaction}\n\\label{sch:r}\n\\end{scheme}').replace('PICTURE', 'PICTURE')
    want = want.replace('\\begin{document}', '\\usepackage{newfloat}\n\\DeclareFloatingEnvironment[fileext=loscheme,listname={List of Schemes},name={Scheme}]{scheme}\n\\begin{document}')
    got = insert_case(page, FIG, at('PICTURE', 2), run('insert-caption', {'text': 'A reaction', 'label': 'sch:r', 'kind': 'scheme', 'newLabel': 'Scheme'}), want, 'R4 New Label: the figure becomes a scheme (newfloat) with its caption, one step')
    check('R4 the page draws "Scheme 1:" as TeX prints it', 'Scheme 1:' in ' '.join(texts(page, '.cap')), texts(page, '.cap'))
    load_doc(page, want)
    names = page.evaluate("(() => { const g = window.rikuy; return Object.keys(g.model.opts.refs.floats); })()")
    check('R4 a declared float is read back as a label of its own', names == ['scheme'], names)
    hand = D('\\begin{scheme}\n\\caption{Two}\n\\end{scheme}', '\\usepackage{float}\n\\newfloat{scheme}{tbp}{los}\n\\floatname{scheme}{Reaction}\n')
    load_doc(page, hand)
    check('R4 float\'s \\newfloat with \\floatname: drawn "Reaction 1:"', 'Reaction 1:' in ' '.join(texts(page, '.cap')), texts(page, '.cap'))
    # Exclude label from caption
    want = FIG.replace('PICTURE\n', 'PICTURE\n\\captionsetup{labelformat=nolabel}\n\\caption{Plain}\n').replace('\\begin{document}', '\\usepackage{caption}\n\\DeclareCaptionLabelFormat{nolabel}{#2}\n\\begin{document}')
    insert_case(page, FIG, at('PICTURE', 2), run('insert-caption', {'text': 'Plain', 'label': '', 'exclude': True}), want, 'R4 Exclude label from caption: the number alone, caption\'s own way')
    check('R4 the page draws "1: Plain"', any(t.startswith('1: Plain') for t in texts(page, '.cap')), texts(page, '.cap'))
    # the dialog: Label, New Label…, Exclude label from caption
    load_doc(page, FIG); click_text(page, 'PICTURE', 2)
    cmd(page, 'insert-caption')
    dlg = page.get_by_role('dialog', name='Caption')
    check('R4 the Caption dialog has Label, New Label… and Exclude label from caption, by name', dlg.get_by_label('Label', exact=True).count() == 1 and dlg.get_by_role('button', name='New Label…').count() == 1 and dlg.get_by_label('Exclude label from caption').count() == 1)
    dlg.get_by_role('button', name='New Label…').click()
    dlg.get_by_label('New label name').fill('Plate'); dlg.get_by_role('button', name='Add', exact=True).click(); page.wait_for_timeout(150)
    check('R4 New Label adds the label and picks it', dlg.get_by_label('Label', exact=True).input_value() == 'plate' and dlg.locator('.cap-pre').inner_text().strip() == 'Plate 1:' and dlg.get_by_label('Reference label', exact=True).input_value() == 'pla:x')
    dlg.get_by_label('Exclude label from caption').check()
    check('R4 Exclude label shows the number alone', dlg.locator('.cap-pre').inner_text().strip() == '1:')
    page.keyboard.press('Escape'); page.evaluate('window.rikuy.closePop()')
    # Right align page numbers: a makeindex style of the project's own
    IX = D('Alpha\\index{alpha} text.\n\n\\printindex', '\\usepackage{imakeidx}\n\\makeindex\n')
    load_doc(page, IX); click_text(page, 'text', 2)
    h0 = hist(page)
    cmd(page, 'insert-index', {'columns': 2, 'right': True})
    check('R4 Right align page numbers: options=-s index-right.ist and the style file, one step', src(page) == IX.replace('\\makeindex\n', '\\makeindex[options=-s index-right.ist]\n') and 'dotfill' in src(page, 'index-right.ist') and hist(page) == h0 + 1, src(page)[:160])
    check('R4 the page sets the index\'s page numbers at the right margin, with dots', page.locator('.it.idx-right.idx-dots .idx-lead').count() >= 1)
    page.evaluate('rikuy.undo()'); page.wait_for_timeout(200)
    check('R4 one undo: the line and the file as they were', src(page) == IX and page.evaluate("!window.rikuy.files.has('index-right.ist')"))
    page.evaluate('rikuy.redo()'); page.wait_for_timeout(200)
    cmd(page, 'insert-index', {'columns': 2, 'right': False})
    check('R4 turned off: the option goes, the brackets with it', src(page) == IX)
    # the Table of Authorities
    TOA = D('As held in Smith v. Jones here.\n\nLast.')
    load_doc(page, TOA)
    select_text(page, 'Smith v. Jones')
    h0 = hist(page)
    cmd(page, 'mark-citation', {'long': 'Smith v. Jones, 1 U.S. 2 (1990)', 'short': 'Smith v. Jones', 'category': 'Cases'})
    want = TOA.replace('Smith v. Jones here', 'Smith v. Jones\\index[toa]{1@\\textbf{Cases}!Smith v. Jones, 1 U.S. 2 (1990)} here').replace('\\begin{document}', '\\usepackage{imakeidx}\n\\makeindex[name=toa,title=Table of Authorities,columns=1]\n\\begin{document}')
    check('R4 Mark Citation: \\index[toa]{1@\\textbf{Cases}!…} and the second index set up, one step', src(page) == want and hist(page) == h0 + 1, src(page))
    # (review L2) a | in a citation: \textbar{}, which hyperref's \index leaves alone
    load_doc(page, TOA.replace('\\begin{document}', '\\usepackage{hyperref}\n\\begin{document}'))
    select_text(page, 'Smith v. Jones')
    cmd(page, 'mark-citation', {'long': 'Smith | Jones, 2 U.S. 3', 'short': 'Smith v. Jones', 'category': 'Cases'})
    check('R4 Mark Citation: a | in the citation is \\textbar{}', '!Smith \\textbar{} Jones, 2 U.S. 3}' in src(page) and src(page).count('|') == 0, src(page))
    load_doc(page, want)
    click_text(page, 'Last', 1)
    cmd(page, 'insert-toa')
    check('R4 Insert Table of Authorities: \\printindex[toa]', '\\printindex[toa]' in src(page))
    heads = texts(page, '.refs-h')
    rows = texts(page, '.it.idx-e')
    check('R4 the page draws the Table of Authorities: its title, the category in bold, the citation', 'Table of Authorities' in heads and 'Cases' in rows and any(r.startswith('Smith v. Jones, 1 U.S. 2 (1990)') for r in rows) and page.locator('.it.idx-e b', has_text='Cases').count() == 1, [heads, rows])
    load_doc(page, TOA); select_text(page, 'Smith v. Jones')
    cmd(page, 'mark-citation')
    dlg = page.get_by_role('dialog', name='Mark Citation')
    check('R4 the Mark Citation dialog: Selected text, Category (Word\'s seven), Short citation, Mark, Mark All', dlg.get_by_label('Selected text').input_value() == 'Smith v. Jones' and dlg.get_by_label('Category').evaluate('(e) => [...e.options].map((o) => o.textContent).slice(0, 7)') == ['Cases', 'Statutes', 'Other Authorities', 'Rules', 'Treatises', 'Regulations', 'Constitutional Provisions'] and dlg.get_by_role('button', name='Mark All').count() == 1)
    page.keyboard.press('Escape'); page.evaluate('window.rikuy.closePop()')
    load_doc(page, D('A citation here.', '\\usepackage{makeidx}\n\\makeindex\n'))
    click_text(page, 'citation', 2)
    check('R4 with makeidx, Mark Citation says why not (no second index)', page.evaluate("window.rikuy.cmds.command('mark-citation').when(window.rikuy, window.rikuy.ribbonAt())") is False and 'makeidx' in page.evaluate("window.rikuy.toaWhyNot()"))


def r4compiled(page):
    if not TEX:
        print('SKIP R4 compiles: no TeX tree')
        return
    doc = D('\\listoffigures\n\nAs held in Smith v. Jones\\index[toa]{1@\\textbf{Cases}!Smith v. Jones, 1 U.S. 2 (1990)}\\index[toa]{1@\\textbf{Cases}!Bar \\textbar{} Case} and a cat\\index{cat}\\endnote{An endnote.} here.\n\n'
            '\\begin{scheme}[htbp]\n\\centering\nX\n\\caption{A reaction}\n\\end{scheme}\n\n\\begin{figure}[htbp]\n\\centering\nY\n\\captionsetup{labelformat=nolabel}\n\\caption{Plain}\n\\end{figure}\n\n\\printendnotes\n\\printindex\n\\printindex[toa]',
            '\\usepackage{enotez}\n\\setenotez{counter-format=roman}\n\\usepackage{imakeidx}\n\\makeindex[options=-s index-right.ist]\n\\makeindex[name=toa,title=Table of Authorities,columns=1]\n\\usepackage{newfloat}\n\\DeclareFloatingEnvironment[fileext=loscheme,listname={List of Schemes},name={Scheme}]{scheme}\n\\usepackage{caption}\n\\DeclareCaptionLabelFormat{nolabel}{#2}\n\\usepackage{hyperref}\n')
    ist = page.evaluate("() => null")
    load_doc(page, doc)
    istText = page.evaluate("(() => { const m = window.rikuy; return null; })()")
    from_ist = '% index style\ndelim_0 "\\\\dotfill "\ndelim_1 "\\\\dotfill "\ndelim_2 "\\\\dotfill "\n'
    for engine in ('pdflatex', 'xelatex', 'lualatex'):
        text = doc if engine == 'pdflatex' else '% !TeX program = ' + engine + '\n' + doc
        c = compile_doc(page, text, {'index-right.ist': from_ist})
        T = re.sub(r'\s+', ' ', c['text'])
        check('R4 ' + engine + ': endnote formats, a float of its own, the number alone, a right aligned index and a Table of Authorities compile', c['ok'] and c['text'], c['log'][-400:])
        miss = [x for x in ('Scheme 1: A reaction', '1: Plain', 'Notes', 'An endnote', 'Table of Authorities', 'Cases', 'Smith v. Jones, 1 U.S. 2 (1990)', 'Index', 'cat') if x not in T]
        check('R4 ' + engine + ': TeX prints them as the page draws them', not miss and 'Figure 1: Plain' not in T, miss)
        check('R4 ' + engine + ': a citation with a | prints it, under hyperref (review L2)', 'Bar | Case' in T and 'hyperxindexformat' not in T, T[-300:])
        check('R4 ' + engine + ': the endnote mark is i, the index\'s page at the right after dots', bool(re.search(r'cat ?(\. ?){3,}\d', T)) and bool(re.search(r'\bi\b', T)), T[-400:])

SECTIONS = {'review': review, 'verify': verify, 'cached': cached, 'toc': toc, 'notes': notes, 'sources': sources, 'captions': captions, 'xrefs': xrefs, 'index': index, 'links': links, 'r4': r4refs}

def main():
    want = sys.argv[1:]
    with sync_playwright() as p:
        if not want or any(w in SECTIONS for w in want):
            br, page, errors = open_page(p)
            for name, fn in SECTIONS.items():
                if not want or name in want:
                    fn(page)
            check('no page errors', not errors, errors[:3])
            br.close()
        if not want or 'phone' in want:
            phone(p)
        if not want or 'compiled' in want:
            br, page, errors = open_page(p)
            compiled(page)
            br.close()
        if not want or 'compiled' in want or 'r4compiled' in want:
            br, page, errors = open_page(p)
            r4compiled(page)
            br.close()
        if 'screenshots' in want:
            screenshots(p)
    fails = [r for r in results if not r[1]]
    print('\n%d checks, %d failed' % (len(results), len(fails)))
    sys.exit(1 if fails else 0)

if __name__ == '__main__':
    main()
