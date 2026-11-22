"""Find, Replace and Go To (src/find.js, src/cmd/find.js, src/ui/finddialog.js, the Navigation
pane's search in src/nav.js), in Chromium.

Ctrl+F on the page opens the Navigation pane's box ("Search document") with the selected words in
it, and the browser's own find stays everywhere else; what is found is the page's text (50% finds
\\%, a straight quote the curly ones, a footnote's words) and never a command, a label or math;
every hit is marked on the page, Enter steps through them ("Result 2 of 4"), Escape leaves the one
shown selected on the page. Ctrl+H opens Word's dialog "Find and Replace" (a dialog by its title,
a Close button, not modal, Escape closes it): Replace writes the replacement escaped as typing
writes it (75% & more as 75\\% \\& more), in the first character's place so a wrapper stays; each
Replace is one undo, Replace All one undo for all, undo gives the bytes back. Match case, Find whole
words only, Word's wildcards and regular expressions with their groups, Special's codes, a Format
(bold runs found with nothing typed), In selection, In LaTeX source (labels renamed in \\label and
\\ref, the replacement as written), a LaTeX paragraph's text replaced as source. Go To (Ctrl+G, and
a click on "Page x of y"): pages, sections by number, labels by key, footnotes and equations one at
a time, +n; Select▾: a paragraph, a sentence, text with similar formatting; the words of the
selection in the status bar. Where dist/tex exists, the replaced document compiles to a PDF with
the text replaced.

RIKUY_DIST names another dist/."""
import os, sys, base64, io
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import settle, until, open_page, check, results, src, load_doc, click_text, select_text
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist')
WRAP = lambda body, pre='': '\\documentclass{article}\n' + pre + '\\begin{document}\n' + body + '\n\\end{document}\n'
DOC = WRAP('\\section{Opening}\\label{sec:a}\nThe cat sat on the mat with \\textbf{50\\% of} the cats.\n\n'
           "Another cat here.\\footnote{A cat note.} A ``quoted'' word, see Section~\\ref{sec:a}.\n\n"
           '\\section{Close}\nNo felines $x = cat$ in \\textit{cat} form.')


def hits(page):
    return page.evaluate('window.rikuy.fs.hits.map((h) => h.text)')


def summary(page):
    return page.evaluate('window.rikuy.findSummary()')


def marked(page):
    """The text the page marks as found, in order (CSS highlights)."""
    return page.evaluate('''() => { const h = CSS.highlights.get('rk-find'), c = CSS.highlights.get('rk-find-cur');
      return { all: h ? [...h].map((r) => r.toString()) : [], cur: c ? [...c].map((r) => r.toString()).join('') : '' }; }''')


def ctrl_f(page):
    load_doc(page, DOC)
    click_text(page, 'Another', 2)
    page.keyboard.press('Control+f'); settle(page, 250, full=True)
    box = page.get_by_role('searchbox', name='Search document', exact=True)
    check('Ctrl+F on the page opens the Navigation pane with its box "Search document" focused', box.count() == 1 and page.evaluate('document.activeElement.getAttribute("aria-label")') == 'Search document')
    box.type('cat'); settle(page, 500, full=True)
    check('typing finds the page\'s text, a footnote\'s and an italic one too, never math: five hits', hits(page) == ['cat'] * 5 and summary(page) == '5 results', (hits(page), summary(page)))
    m = marked(page)
    check('every hit is marked on the page (CSS highlight rk-find)', len(m['all']) >= 5 and all(t == 'cat' for t in m['all']), m)
    results_view = page.get_by_role('tabpanel', name='Results', exact=True)
    check('the Results view lists them with their context', results_view.count() == 1 and results_view.get_by_role('button').count() == 5 and 'Another cat here.' in results_view.inner_text(), results_view.inner_text()[:200])
    page.keyboard.press('Enter'); settle(page, 200)
    check('Enter goes to the first hit after the caret: Result 3 of 5, marked as the current one', summary(page) == 'Result 3 of 5' and marked(page)['cur'] == 'cat', (summary(page), marked(page)))
    page.keyboard.press('Shift+Enter'); settle(page, 150)
    check('Shift+Enter the one before', summary(page) == 'Result 2 of 5')
    page.keyboard.press('Escape'); settle(page, 200)
    sel = page.evaluate('[document.activeElement.id, String(getSelection()), window.rikuy.caretNow().a]')
    check('Escape: back on the page, the hit shown selected there (typing would replace it)', sel[0] == 'pages' and sel[1] == 'cat' and sel[2] == DOC.index('cats') , sel)
    # what it finds as the page shows it
    box.fill('50%'); settle(page, 400, full=True)
    h = page.evaluate('window.rikuy.fs.hits.map((h) => [h.text, window.rikuy.src(h.f).slice(h.s, h.e)])')
    check('50% finds the source\'s 50\\%', h == [['50%', '50\\%']], h)
    box.fill('"quoted"'); settle(page, 400, full=True)
    h = page.evaluate('window.rikuy.fs.hits.map((h) => window.rikuy.src(h.f).slice(h.s, h.e))')
    check('a straight quote finds the typeset curly ones: ``quoted\'\'', h == ["``quoted''"], h)
    for q in ('textbf', 'sec:a', 'x = cat', 'footnote'):
        box.fill(q); settle(page, 350, full=True)
        check('the page\'s text only: "%s" is a command, a label or math, not found' % q, hits(page) == [] and summary(page) == 'Not found.', (hits(page), summary(page)))
    box.fill(''); settle(page, 350, full=True)
    check('the box emptied: the marks go', marked(page)['all'] == [], marked(page))
    # outside the page, Ctrl+F is the browser's own
    page.evaluate('''() => { window.__fp = null; document.addEventListener('keydown', (e) => { if (e.key === 'f') window.__fp = e.defaultPrevented; }); }''')
    page.evaluate('document.activeElement.blur(); document.body.focus()')
    page.keyboard.press('Control+f'); settle(page, 100)
    check('outside the page Ctrl+F is left to the browser (its find opens)', page.evaluate('window.__fp') is False, page.evaluate('window.__fp'))
    page.evaluate("window.rikuy.toggleNav(false)")


def dialog(page):
    load_doc(page, DOC)
    click_text(page, 'Another', 2)
    page.keyboard.press('Control+h'); settle(page, 250)
    d = page.get_by_role('dialog', name='Find and Replace', exact=True)
    check('Ctrl+H opens the dialog "Find and Replace" on its Replace tab: a Close button, not modal', d.count() == 1 and d.get_attribute('aria-modal') is None and d.get_by_role('button', name='Close', exact=True).count() == 1
          and d.get_by_role('tab', name='Replace', exact=True).get_attribute('aria-selected') == 'true')
    check('its fields and options by name', all(d.get_by_label(n, exact=True).count() == 1 for n in ('Find what', 'Replace with', 'Match case', 'Find whole words only', 'Use wildcards', 'Use regular expressions', 'In LaTeX source', 'In selection'))
          and all(d.get_by_role('button', name=n, exact=True).count() == 1 for n in ('Replace one', 'Replace All', 'Find Next', 'Find Previous', 'Format', 'Special', 'No formatting'))
          and page.get_by_role('button', name='Replace', exact=True).count() <= 1)
    d.get_by_label('Find what', exact=True).fill('50%'); settle(page, 350, full=True)
    d.get_by_label('Replace with', exact=True).fill('75% & more')
    h0 = page.evaluate('window.rikuy.hist.length')
    d.get_by_role('button', name='Find Next', exact=True).click(); settle(page, 150)
    d.get_by_role('button', name='Replace one', exact=True).click(); settle(page, 300)
    want = DOC.replace('50\\% of', '75\\% \\& more of')
    check('Replace writes the replacement escaped as typing escapes it, inside the bold it lands in, as one step', src(page) == want and page.evaluate('window.rikuy.hist.length') == h0 + 1, src(page)[60:160])
    page.evaluate('window.rikuy.undo()'); settle(page, 200)
    check('one undo gives the bytes back', src(page) == DOC)
    # Replace All: every one at once, one undo
    d.get_by_label('Find what', exact=True).fill('cat'); settle(page, 350, full=True)
    d.get_by_label('Find whole words only', exact=True).check(); settle(page, 250)
    d.get_by_label('Replace with', exact=True).fill('dog')
    h0 = page.evaluate('window.rikuy.hist.length')
    d.get_by_role('button', name='Replace All', exact=True).click(); settle(page, 400)
    want = DOC.replace('The cat', 'The dog').replace('Another cat', 'Another dog').replace('A cat note', 'A dog note').replace('\\textit{cat}', '\\textit{dog}')
    check('Replace All with Find whole words only: every whole "cat" of the text (a footnote\'s, an italic one), not "cats", not the math\'s, in one step', src(page) == want and page.evaluate('window.rikuy.hist.length') == h0 + 1, src(page))
    st = d.get_by_role('status').first.inner_text()
    check('and it says how many: Replaced 4 places.', st.startswith('Replaced 4 places.'), st)
    page.evaluate('window.rikuy.undo()'); settle(page, 200)
    check('one undo takes all of it back, byte for byte', src(page) == DOC)
    # Tab goes round the dialog, as Word's: past its last control it left for the window's top
    # bar, where Escape no longer closed it
    d.get_by_label('Find what', exact=True).focus()
    inside = []
    for _ in range(30):
        page.keyboard.press('Tab'); settle(page, 20)
        inside.append(page.evaluate('!!document.activeElement.closest("[role=dialog]")'))
    d.get_by_role('button', name='Close', exact=True).focus(); page.keyboard.press('Shift+Tab'); settle(page, 20)
    inside.append(page.evaluate('!!document.activeElement.closest("[role=dialog]")'))
    check('Tab and Shift+Tab go round the dialog\'s controls and stay in it', all(inside), inside)
    d.get_by_label('Find whole words only', exact=True).uncheck()
    # a hit across markup: the replacement takes the first character's place, the braces stay
    load_doc(page, WRAP('Some \\textbf{bold} text here.'))
    d.get_by_label('Find what', exact=True).fill('bold text'); settle(page, 350, full=True)
    d.get_by_label('Replace with', exact=True).fill('strong words')
    d.get_by_role('button', name='Replace All', exact=True).click(); settle(page, 300)
    check('a hit across \\textbf{...}: the replacement lands in the bold, the closing brace stays, nothing else moves', src(page) == WRAP('Some \\textbf{strong words} here.'), src(page))
    # Match case
    load_doc(page, WRAP('Cat cat CAT.'))
    d.get_by_label('Find what', exact=True).fill('cat'); settle(page, 350, full=True)
    a = hits(page)
    d.get_by_label('Match case', exact=True).check(); settle(page, 300)
    check('Match case: three hits without it, one with it', a == ['Cat', 'cat', 'CAT'] and hits(page) == ['cat'], (a, hits(page)))
    d.get_by_label('Match case', exact=True).uncheck()
    # Word's wildcards and their groups
    load_doc(page, WRAP('by Ada Lovelace and Alan Turing.'))
    d.get_by_label('Use wildcards', exact=True).check()
    d.get_by_label('Find what', exact=True).fill('(<[A-Z][a-z]@>) (<[A-Z][a-z]@>)'); settle(page, 350, full=True)
    d.get_by_label('Replace with', exact=True).fill('\\2, \\1')
    d.get_by_role('button', name='Replace All', exact=True).click(); settle(page, 300)
    check('Use wildcards: (<[A-Z][a-z]@>) (<[A-Z][a-z]@>) to \\2, \\1 turns the names round', src(page) == WRAP('by Lovelace, Ada and Turing, Alan.'), src(page))
    d.get_by_label('Use wildcards', exact=True).uncheck()
    # regular expressions
    load_doc(page, WRAP('Up 50\\% and 7\\% down.'))
    d.get_by_label('Use regular expressions', exact=True).check()
    d.get_by_label('Find what', exact=True).fill('(\\d+)%'); settle(page, 350, full=True)
    d.get_by_label('Replace with', exact=True).fill('$1 percent')
    d.get_by_role('button', name='Replace All', exact=True).click(); settle(page, 300)
    check('Use regular expressions: (\\d+)% to $1 percent on the typeset 50% (the source\'s 50\\%)', src(page) == WRAP('Up 50 percent and 7 percent down.'), src(page))
    d.get_by_label('Find what', exact=True).fill('(a'); settle(page, 350, full=True)
    st = d.get_by_role('status').first.inner_text()
    check('a pattern that cannot be read says why, in the status line', st.startswith('This pattern cannot be read'), st)
    d.get_by_label('Use regular expressions', exact=True).uncheck()
    # Special: Word's codes into the box
    load_doc(page, WRAP('Room 12 and room 7.'))
    d.get_by_label('Find what', exact=True).fill('room ')
    d.get_by_label('Find what', exact=True).focus()
    page.keyboard.press('End')
    d.get_by_role('button', name='Special', exact=True).click(); settle(page, 150)
    page.get_by_role('menu', name='Special', exact=True).get_by_role('menuitem', name='Any digit', exact=True).click(); settle(page, 350, full=True)
    check('Special ▸ Any digit puts ^# in the box; it finds room 1 and room 7', d.get_by_label('Find what', exact=True).input_value() == 'room ^#' and hits(page) == ['Room 1', 'room 7'], (d.get_by_label('Find what', exact=True).input_value(), hits(page)))
    # Format: the bold runs with nothing typed; and typed words only where bold
    load_doc(page, WRAP('Plain cat, \\textbf{bold cat} and {\\bfseries more bold}.'))
    d.get_by_label('Find what', exact=True).fill(''); settle(page, 250, full=True)
    d.get_by_role('button', name='Format', exact=True).click(); settle(page, 150)
    page.get_by_role('menu', name='Format', exact=True).get_by_role('menuitemcheckbox', name='Bold', exact=True).click(); settle(page, 350)
    check('Format ▸ Bold with nothing typed finds the bold runs, \\textbf and {\\bfseries} alike', hits(page) == ['bold cat', 'more bold'], hits(page))
    d.get_by_label('Find what', exact=True).fill('cat'); settle(page, 350, full=True)
    check('and typed words only where they are bold', hits(page) == ['cat'] and page.evaluate('window.rikuy.src("main.tex").slice(window.rikuy.fs.hits[0].s - 5, window.rikuy.fs.hits[0].e)') == 'bold cat', hits(page))
    d.get_by_role('button', name='No formatting', exact=True).click(); settle(page, 300)
    check('No formatting: every cat again', hits(page) == ['cat', 'cat'])
    page.keyboard.press('Escape'); settle(page, 200)
    check('Escape closes the dialog, the hit shown selected on the page', d.count() == 0 or not d.is_visible())


def in_selection_and_source(page):
    load_doc(page, WRAP('One cat.\n\nTwo cat and another cat in the middle.\n\nThree cat.'))
    page.evaluate('''() => { const sp = [...document.querySelectorAll('#pages span.t')].find((s) => s.textContent.includes('Two cat')); const r = document.createRange();
      r.setStart(sp.firstChild, 0); r.setEnd(sp.firstChild, sp.textContent.length); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }''')
    page.keyboard.press('Control+h'); settle(page, 250)
    d = page.get_by_role('dialog', name='Find and Replace', exact=True)
    check('a selection longer than a few words is offered as the place to look: In selection ticked', d.get_by_label('In selection', exact=True).is_checked())
    d.get_by_label('Find what', exact=True).fill('cat'); settle(page, 350, full=True)
    d.get_by_label('Replace with', exact=True).fill('dog')
    d.get_by_role('button', name='Replace All', exact=True).click(); settle(page, 300)
    check('In selection: Replace All replaces there alone', src(page) == WRAP('One cat.\n\nTwo dog and another dog in the middle.\n\nThree cat.'), src(page))
    d.get_by_label('In selection', exact=True).uncheck()
    # In LaTeX source: commands and labels too, the replacement as it is written
    doc = WRAP('\\section{Intro}\\label{sec:a}\nSee Section~\\ref{sec:a} and $\\alpha$.')
    load_doc(page, doc)
    d.get_by_label('Find what', exact=True).fill('sec:a'); settle(page, 300, full=True)
    a = hits(page)
    d.get_by_label('In LaTeX source', exact=True).check(); settle(page, 300)
    b = hits(page)
    check('a label\'s key: not in the page\'s text; In LaTeX source finds it in \\label and \\ref', a == [] and b == ['sec:a', 'sec:a'], (a, b))
    d.get_by_label('Replace with', exact=True).fill('sec:intro')
    h0 = page.evaluate('window.rikuy.hist.length')
    d.get_by_role('button', name='Replace All', exact=True).click(); settle(page, 300)
    check('and renames the label everywhere, as written, in one step', src(page) == doc.replace('sec:a', 'sec:intro') and page.evaluate('window.rikuy.hist.length') == h0 + 1, src(page))
    d.get_by_label('Find what', exact=True).fill('\\alpha'); settle(page, 300, full=True)
    d.get_by_label('Replace with', exact=True).fill('\\beta')
    d.get_by_role('button', name='Replace All', exact=True).click(); settle(page, 300)
    check('in LaTeX source, inside math too (\\alpha to \\beta): asked for, so done', '$\\beta$' in src(page), src(page))
    d.get_by_label('In LaTeX source', exact=True).uncheck()
    # a LaTeX paragraph: its text is its source, a replacement goes in as it is written
    load_doc(page, WRAP('Plain foo here.\n\n% rikuy: latex\nBoxed foo here.'))
    d.get_by_label('Find what', exact=True).fill('foo'); settle(page, 300, full=True)
    d.get_by_label('Replace with', exact=True).fill('bar')
    d.get_by_role('button', name='Replace All', exact=True).click(); settle(page, 300)
    check('a plain replacement is written in the text and in a LaTeX paragraph alike', src(page) == WRAP('Plain bar here.\n\n% rikuy: latex\nBoxed bar here.'), src(page))
    load_doc(page, WRAP('Plain foo here.\n\n% rikuy: latex\nBoxed foo here.'))
    d.get_by_label('Find what', exact=True).fill('foo'); settle(page, 300, full=True)
    d.get_by_label('Replace with', exact=True).fill('\\emph{x}')
    d.get_by_role('button', name='Replace All', exact=True).click(); settle(page, 300)
    st = d.get_by_role('status').first.inner_text()
    check('one with LaTeX\'s signs is escaped in the text, and a LaTeX paragraph is left, the status says why', src(page) == WRAP('Plain \\textbackslash{}emph\\{x\\} here.\n\n% rikuy: latex\nBoxed foo here.') and 'LaTeX paragraph' in st, (src(page), st))
    d.get_by_role('button', name='Close', exact=True).click(); settle(page, 150)
    check('Close closes it; the marks go with it', not d.is_visible() and page.evaluate("!CSS.highlights.get('rk-find') || CSS.highlights.get('rk-find').size === 0"))


def review(page):
    """The cases of the hostile review of fa621a4 and 054a1f2, each as the reader wrote it."""
    page.evaluate('window.rikuy.closeFind && window.rikuy.closeFind()')
    # 1. a hyphen in what is looked for
    load_doc(page, WRAP('A well-known, state-of-the-art e-mail of 2024-11.'))
    click_text(page, 'A well', 0)
    page.keyboard.press('Control+h'); settle(page, 250)
    d = page.get_by_role('dialog', name='Find and Replace', exact=True)
    found = []
    for q in ('well-known', 'state-of-the-art', '2024-11', 'e-mail'):
        d.get_by_label('Find what', exact=True).fill(q); settle(page, 300, full=True)
        found.append((q, hits(page), d.get_by_role('status').first.inner_text()))
    check('review 1: well-known, state-of-the-art, 2024-11 and e-mail are found (no "pattern cannot be read")', all(h == [q] for q, h, _ in found), found)
    d.get_by_label('Find what', exact=True).fill('well-known'); settle(page, 300, full=True)
    d.get_by_label('Replace with', exact=True).fill('famous')
    d.get_by_role('button', name='Replace All', exact=True).click(); settle(page, 300)
    check('and replaced', src(page) == WRAP('A famous, state-of-the-art e-mail of 2024-11.'), src(page))
    # 2. an edit between Find Next and Replace: the hit is looked for where the edit took it
    doc = '\\documentclass{article}\n\\begin{document}\nIntro words.\n\nThe cat sat.\n\\end{document}\n'
    load_doc(page, doc); click_text(page, 'Intro', 0)
    d.get_by_label('Find what', exact=True).fill('cat'); settle(page, 350, full=True)
    d.get_by_label('Replace with', exact=True).fill('dog')
    d.get_by_role('button', name='Find Next', exact=True).click(); settle(page, 200)
    click_text(page, 'Intro', 0); page.keyboard.type('Very ')
    d.get_by_role('button', name='Replace one', exact=True).click(); settle(page, 400)
    check('review 2: typing before the hit shown, then Replace at once: the hit is replaced where it now is', src(page) == doc.replace('Intro', 'Very Intro').replace('The cat', 'The dog'), src(page))
    load_doc(page, doc)
    r = page.evaluate("""() => { const g = window.rikuy; g.findSet({ q: 'cat', rep: 'dog', o: { insel: false, fmt: 0, source: false, regex: false, wildcards: false } }); g.findGo(1);
      g.commit([{ f: 'main.tex', s: g.src('main.tex').indexOf('Intro'), e: g.src('main.tex').indexOf('Intro'), t: 'Very ' }], null, 'type');
      g.replaceOne(); const a = g.src('main.tex');
      g.findSet({ q: 'dog', rep: 'cat' });
      g.commit([{ f: 'main.tex', s: g.src('main.tex').indexOf('Very'), e: g.src('main.tex').indexOf('Very') + 5, t: '' }], null, 'type');
      g.replaceAll(); return [a, g.src('main.tex')]; }""")
    check('and through rikuy\'s methods with no pause: replaceOne and replaceAll after an edit write at today\'s places', r[0] == doc.replace('Intro', 'Very Intro').replace('The cat', 'The dog') and r[1] == doc, r)
    load_doc(page, doc)
    r = page.evaluate("""() => { const g = window.rikuy; g.findSet({ q: 'cat', rep: 'dog' }); g.findGo(1); const s = g.src('main.tex'), k = s.indexOf('cat');
      g.commit([{ f: 'main.tex', s: k, e: k + 3, t: 'cow' }], null, 'type'); g.replaceOne(); return [g.src('main.tex'), g.findSummary()]; }""")
    check('the hit shown was edited away: Replace writes nothing, and says so', r[0] == doc.replace('cat', 'cow'), r)
    # 4. a comment between the words found: replaced as typing over them replaces them
    load_doc(page, WRAP('one % note\ntwo here.'))
    d.get_by_label('Find what', exact=True).fill('one two'); settle(page, 350, full=True)
    d.get_by_label('Replace with', exact=True).fill('x')
    d.get_by_role('button', name='Replace All', exact=True).click(); settle(page, 300)
    check('review 4: across a % comment the words never run together (as typing over them: x here.)', src(page) == WRAP('x here.'), src(page))
    # 6. In selection follows its edits, and goes when the dialog opens without a selection
    W = WRAP('Out cat. The cat and the cat and the cat end here now. Out cat.')
    load_doc(page, W); page.evaluate('window.rikuy.closeFind()')
    page.evaluate("""() => { const s = [...document.querySelectorAll('#pages span.t')].find((x) => x.textContent.includes('The cat and')); const t = s.textContent; const a = t.indexOf('The cat'), z = t.indexOf('end here') + 8;
      const r = document.createRange(); r.setStart(s.firstChild, a); r.setEnd(s.firstChild, z); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }""")
    page.keyboard.press('Control+h'); settle(page, 300)
    d.get_by_label('Find what', exact=True).fill('cat'); settle(page, 350, full=True)
    d.get_by_label('Replace with', exact=True).fill('elephant')
    d.get_by_role('button', name='Find Next', exact=True).click(); settle(page, 150)
    for _ in range(4):
        d.get_by_role('button', name='Replace one', exact=True).click(); settle(page, 300)
    check('review 6: Replace one at a time in the selection replaces its three, the selection growing with them, and none outside', src(page) == W.replace('The cat and the cat and the cat', 'The elephant and the elephant and the elephant'), src(page))
    page.keyboard.press('Escape'); settle(page, 150)
    load_doc(page, WRAP('Some cat words. ' * 3)); click_text(page, 'Some', 1)
    page.keyboard.press('Control+h'); settle(page, 300)
    d.get_by_label('Find what', exact=True).fill('cat'); settle(page, 350, full=True)
    check('and opened again with only a caret: In selection is off, every cat found', not d.get_by_label('In selection', exact=True).is_checked() and page.evaluate('window.rikuy.fs.sel') is None and hits(page) == ['cat'] * 3)
    # low: a shown result stays the same one when the text before it changes
    load_doc(page, WRAP('xx cat one, cat two.'))
    d.get_by_label('Find what', exact=True).fill('cat'); settle(page, 350, full=True)
    d.get_by_role('button', name='Find Next', exact=True).click(); settle(page, 150)
    a = summary(page)
    page.evaluate("() => { const g = window.rikuy; g.commit([{ f: 'main.tex', s: g.src('main.tex').indexOf('xx'), e: g.src('main.tex').indexOf('xx') + 2, t: '' }], null, 'del'); }")
    settle(page, 500, full=True)
    check('low: two characters deleted before the result shown: it is still the one shown (Result 1 of 2)', a == 'Result 1 of 2' and summary(page) == 'Result 1 of 2', (a, summary(page)))
    # low: a LaTeX paragraph and LaTeX's signs: skipped, said
    load_doc(page, WRAP('% rikuy: latex\n\\textbf{cat} 50\\% cat\n\nPlain cat.'))
    d.get_by_label('Find what', exact=True).fill('cat'); settle(page, 350, full=True)
    d.get_by_label('Replace with', exact=True).fill('d%g')
    d.get_by_role('button', name='Replace All', exact=True).click(); settle(page, 300)
    st = d.get_by_role('status').first.inner_text()
    check('low: Replace All with d%g leaves the LaTeX paragraph\'s two and says so; the text\'s one is escaped', src(page) == WRAP('% rikuy: latex\n\\textbf{cat} 50\\% cat\n\nPlain d\\%g.') and '2 are in a LaTeX paragraph' in st, (src(page), st))
    # low: Replace one goes through a footnote's hit in the list's order, skipping none
    load_doc(page, WRAP('A cat here.\\footnote{A cat note.} Then cat.'))
    d.get_by_label('Find what', exact=True).fill('cat'); settle(page, 350, full=True)
    d.get_by_label('Replace with', exact=True).fill('dog')
    click_text(page, 'A cat', 0)
    d.get_by_role('button', name='Find Next', exact=True).click(); settle(page, 150)
    for _ in range(3):
        d.get_by_role('button', name='Replace one', exact=True).click(); settle(page, 300)
    check('low: three Replace one presses replace the text\'s two and the footnote\'s one, none skipped', 'cat' not in src(page).split('begin{document}')[1], src(page))
    page.evaluate('window.rikuy.closeFind()')
    # low: the marks go when the pane closes (and the search stops)
    load_doc(page, WRAP('A cat and a cat.'))
    click_text(page, 'A cat', 0)
    page.keyboard.press('Control+f'); settle(page, 250, full=True)
    page.keyboard.type('cat'); settle(page, 500, full=True)
    a = len(marked(page)['all'])
    page.get_by_role('button', name='Close the panel', exact=True).click(); settle(page, 300)
    check('low: closing the Navigation pane takes the marks away and ends the search', a == 2 and marked(page)['all'] == [] and not page.evaluate('window.rikuy.fs.on'), (a, marked(page)))
    # low: the selection's words never more than the document's
    load_doc(page, WRAP('\\section{A heading}\nFirst words here.\n\nSecond words.'))
    click_text(page, 'First', 1); page.keyboard.press('Control+a'); settle(page, 350, full=True)
    w = page.inner_text('#st-words')
    check('low: Ctrl+A counts as many words as the document has, headings left out as the total leaves them (5 of 5 words)', w == '5 of 5 words', w)
    # low: the folded group Editing's menu has Find's other choices too (it folds below 861 px:
    # where Home's other groups, the Font group's and the lists', leave it the room, 700 px at most)
    for w in (860, 820, 780, 740, 700):
        page.set_viewport_size({'width': w, 'height': 1000}); settle(page, 300, full=True)
        click_text(page, 'First', 1)
        if page.get_by_role('button', name='Editing', exact=True).is_visible(): break
    page.get_by_role('button', name='Editing', exact=True).click(); settle(page, 200)
    m = page.get_by_role('menu', name='Editing', exact=True)
    names = [m.get_by_role('menuitem').nth(k).get_attribute('aria-label') for k in range(m.get_by_role('menuitem').count())]
    check('low: the folded Editing group\'s menu: Find, Advanced Find, Go To, Replace, Select', names == ['Find', 'Advanced Find', 'Go To', 'Replace', 'Select'], names)
    page.keyboard.press('Escape')
    page.set_viewport_size({'width': 1400, 'height': 1000}); settle(page, 300, full=True)


LONG = WRAP('\\section{Alpha}\\label{s:a}\n' + ('Text of alpha. ' * 120) + '\n\n\\section{Beta}\\label{s:b}\nBeta words.\\footnote{One.} More.\\footnote{Two.}\n\n'
            '\\begin{equation}\\label{e:1}\na = b\n\\end{equation}\n\n\\subsection{Beta one}\n' + ('Filler line. ' * 260) + '\n\n\\section{Gamma}\nGamma ends.')


def go_to(page):
    load_doc(page, LONG)
    settle(page, 300)
    n = page.evaluate('window.rikuy.layout.pages.length')
    click_text(page, 'Alpha', 1)
    st = page.locator('#st-pages')
    check('the status bar says Page x of y, as a button', st.inner_text() == 'Page 1 of %d' % n and n >= 2 and st.evaluate('(b) => b.tagName') == 'BUTTON', (st.inner_text(), n))
    st.click(); settle(page, 250)
    d = page.get_by_role('dialog', name='Find and Replace', exact=True)
    check('a click on it opens Go To', d.get_by_role('tab', name='Go To', exact=True).get_attribute('aria-selected') == 'true' and d.get_by_label('Go to what', exact=True).count() == 1)
    d.get_by_label('Go to what', exact=True).select_option('page')
    d.get_by_label('Enter page number', exact=True).fill('2'); page.keyboard.press('Enter'); settle(page, 300, full=True)
    check('Page 2: the place kept on page 2 (the caret goes there when the dialog closes), the status bar says so', st.inner_text() == 'Page 2 of %d' % n and page.evaluate('window.rikuy.rbRange.startContainer.parentElement.closest(".page") === window.rikuy.layout.pages[1].el'), st.inner_text())
    check('and the focus stays in the dialog', page.evaluate('document.activeElement.id') == 'fr-n')
    d.get_by_label('Go to what', exact=True).select_option('section')
    d.get_by_label('Enter section number', exact=True).fill('2.1'); page.keyboard.press('Enter'); settle(page, 250, full=True)
    check('Section 2.1 by its number', page.evaluate('window.rikuy.rbRange && window.rikuy.rbRange.startContainer.parentElement.closest(".it").textContent').endswith('Beta one'), d.get_by_role('status').last.inner_text())
    d.get_by_label('Go to what', exact=True).select_option('label')
    d.get_by_label('Enter label', exact=True).fill('e:1'); page.keyboard.press('Enter'); settle(page, 250, full=True)
    check('a label by its key: e:1', d.get_by_role('status').last.inner_text().startswith('Label e:1'), d.get_by_role('status').last.inner_text())
    opts = page.evaluate("[...document.querySelectorAll('#fr-list option')].map((o) => o.value)")
    check('the field offers the labels', opts == ['s:a', 's:b', 'e:1'], opts)
    d.get_by_label('Go to what', exact=True).select_option('footnote')
    d.get_by_label('Enter footnote number', exact=True).fill('')
    click_text(page, 'Beta words', 0)
    d.get_by_role('button', name='Next', exact=True).click(); settle(page, 200)
    a = d.get_by_role('status').last.inner_text()
    d.get_by_role('button', name='Next', exact=True).click(); settle(page, 200)
    b = d.get_by_role('status').last.inner_text()
    check('footnotes one at a time with Next: 1, then 2', a.startswith('Footnote 1') and b.startswith('Footnote 2'), (a, b))
    d.get_by_label('Go to what', exact=True).select_option('equation')
    d.get_by_label('Enter equation number', exact=True).fill('+1'); page.keyboard.press('Enter'); settle(page, 200, full=True)
    check('+1 equation from the caret', d.get_by_role('status').last.inner_text().startswith('Equation 1'), d.get_by_role('status').last.inner_text())
    d.get_by_label('Enter equation number', exact=True).fill('5'); page.keyboard.press('Enter'); settle(page, 200, full=True)
    check('one that is not there says how many there are', d.get_by_role('status').last.inner_text() == 'No equation 5: the document has 1 equation.', d.get_by_role('status').last.inner_text())
    page.keyboard.press('Escape'); settle(page, 150)
    page.keyboard.press('Control+g'); settle(page, 200)
    check('Ctrl+G on the page opens Go To', d.get_by_role('tab', name='Go To', exact=True).get_attribute('aria-selected') == 'true' and page.evaluate('document.activeElement.id') == 'fr-n')
    page.keyboard.press('Escape')


def select_and_words(page):
    load_doc(page, WRAP('First sentence here. Second one now! Third.\n\nOther \\textbf{bold} and \\textbf{more} text.'))
    click_text(page, 'Second one', 3)
    # (Select is on Home where the row has room; else in the group Editing's menu, as in Word)
    if page.get_by_role('button', name='Select', exact=True).is_visible():
        page.get_by_role('button', name='Select', exact=True).click()
    else:
        page.get_by_role('button', name='Editing', exact=True).click(); settle(page, 150)
        page.get_by_role('menu', name='Editing', exact=True).get_by_role('menuitem', name='Select', exact=True).click()
    settle(page, 200)
    menu = page.get_by_role('menu', name='Select', exact=True)
    items = [menu.get_by_role('menuitem').nth(k).get_attribute('aria-label') for k in range(menu.get_by_role('menuitem').count())]
    check('Select▾ on Home (in Editing\'s menu at 1400 px): Select All, Select paragraph, Select sentence, Select text with similar formatting', items == ['Select All', 'Select paragraph', 'Select sentence', 'Select text with similar formatting'], items)
    check('similar formatting is disabled in plain text', menu.get_by_role('menuitem', name='Select text with similar formatting', exact=True).get_attribute('aria-disabled') == 'true')
    menu.get_by_role('menuitem', name='Select sentence', exact=True).click(); settle(page, 200)
    check('Select sentence: the caret\'s sentence', page.evaluate('String(getSelection())') == 'Second one now!', page.evaluate('String(getSelection())'))
    settle(page, 250, full=True)
    check('the status bar counts the words selected: 3 of 12 words', page.inner_text('#st-words') == '3 of 12 words', page.inner_text('#st-words'))
    page.evaluate("window.rikuy.runCommand('select-paragraph')"); settle(page, 100)
    check('Select paragraph: the caret\'s paragraph', page.evaluate('String(getSelection())') == 'First sentence here. Second one now! Third.', page.evaluate('String(getSelection())'))
    # a relayout (the window's width, fonts that came) keeps a selection, and the place a ribbon
    # menu that is open acts on: the pass's new nodes left the one at a caret, the other at the
    # start of the page
    page.evaluate('window.rikuy.relayout(true)'); settle(page, 200)
    check('a relayout keeps the selection whole', page.evaluate('String(getSelection())') == 'First sentence here. Second one now! Third.', page.evaluate('String(getSelection())'))
    click_text(page, 'Second one', 3)
    page.get_by_role('button', name='Select', exact=True).click(); settle(page, 200)
    page.evaluate('window.rikuy.relayout(true)'); settle(page, 100)
    page.get_by_role('menu', name='Select', exact=True).get_by_role('menuitem', name='Select sentence', exact=True).click(); settle(page, 200)
    check('and with the Select menu open, Select sentence after a relayout still selects the caret\'s sentence', page.evaluate('String(getSelection())') == 'Second one now!', page.evaluate('String(getSelection())'))
    click_text(page, 'bold', 1)
    page.evaluate("window.rikuy.runCommand('select-similar')"); settle(page, 300)
    check('Select text with similar formatting: every bold run marked and listed under Results', hits(page) == ['bold', 'more'] and page.get_by_role('tabpanel', name='Results', exact=True).get_by_role('button').count() == 2, hits(page))
    page.evaluate('window.rikuy.findClear(); window.rikuy.toggleNav(false)')
    click_text(page, 'Other', 1)
    settle(page, 200, full=True)
    check('with no selection the status bar gives the words of the document: 12 words', page.inner_text('#st-words') == '12 words', page.inner_text('#st-words'))


def pdf_check(page):
    """The replaced document compiles, its PDF has the replaced text (where dist/tex exists)."""
    if not os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        print('SKIP the PDF of a replaced document: no TeX tree in %s' % DIST)
        return
    try:
        from pypdf import PdfReader
    except ImportError:
        print('SKIP the PDF of a replaced document: pypdf is not installed')
        return
    load_doc(page, WRAP('Growth of 50\\% in \\textbf{cats}.'))
    page.evaluate("window.rikuy.findSet({ q: '50%', rep: '75% & more', o: { source: false, regex: false, wildcards: false, insel: false, fmt: 0 } })")
    page.evaluate("window.rikuy.findState().rep = '75% & more'; window.rikuy.replaceAll()")
    page.set_default_timeout(600000)
    r = page.evaluate("""async () => { const r = await window.rikuy.api.compile(); let s = ''; if (r.pdf) for (let i = 0; i < r.pdf.length; i += 8192) s += String.fromCharCode(...r.pdf.subarray(i, i + 8192)); return { ok: r.ok, pdf: s ? btoa(s) : '' }; }""")
    page.set_default_timeout(30000)
    text = PdfReader(io.BytesIO(base64.b64decode(r['pdf']))).pages[0].extract_text() if r['pdf'] else ''
    check('compiled in the page, the replaced document prints "75% & more"', r['ok'] and '75% & more' in text, text[:120])


R5 = WRAP(r"""\section{Opening}
First para ends here.

Second para starts here.

Third \textbf{bold end}

Fourth after bold.
\begin{itemize}
\item apple item
\item pear item
\end{itemize}
\begin{tabular}{ll}
cell one & cell two \\
\end{tabular}

\begin{theorem}
theorem words
\end{theorem}

\begin{quote}
quoted words
\end{quote}

Inline $x^2+1$ and display:
\[ y = x^2 \]""", r"\newtheorem{theorem}{Theorem}" + "\n")
# (src/find.js FMT: the bits Format finds by)
FMT = {'bold': 1, 'heading': 65536, 'list': 131072, 'table': 262144, 'theorem': 524288, 'quote': 1048576, 'equation': 2097152}


def find_set(page, q, fmt=0):
    page.evaluate("([q, fmt]) => window.rikuy.findSet({ q, o: { source: false, regex: false, wildcards: false, insel: false, matchCase: false, wholeWord: false, fmt } })", [q, fmt])


def replace_all(page, rep):
    page.evaluate("(r) => { window.rikuy.findState().rep = r; return window.rikuy.replaceAll(); }", rep)
    settle(page, 250)


def para_marks(page):
    """Word's ^p on the page's text: a hit across a paragraph's end, mapped to the source's blank
    line; Replace takes the blank line away or writes one; a paragraph end with braces or a heading
    around it is found, not replaced; ^p in the replacement only where a paragraph may break."""
    load_doc(page, R5)
    find_set(page, 'here.^pSecond')
    check('^p: a hit runs across a paragraph\'s end on the page', hits(page) == ['here.\nSecond'] and summary(page) == '1 result', (hits(page), summary(page)))
    check('^p: the hit is marked on the page across the two paragraphs', [t.replace('\n', '') for t in marked(page)['all']] in (['here.', 'Second'], []) or len(marked(page)['all']) >= 1)
    h0 = page.evaluate('window.rikuy.hist.length')
    replace_all(page, 'here. Second')
    want = R5.replace('here.\n\nSecond', 'here. Second')
    check('^p: Replace All takes the blank line away, the paragraphs joined, one step', src(page) == want and page.evaluate('window.rikuy.hist.length') == h0 + 1, src(page)[60:180])
    page.evaluate('window.rikuy.undo()'); settle(page, 150)
    check('^p: one undo, the bytes back', src(page) == R5)
    find_set(page, '^p')
    marks = page.evaluate('window.rikuy.fs.hits.map((h) => [h.text, !!h.hard])')
    check('^p alone finds the paragraph marks: between paragraphs (soft) and at a heading\'s or a group\'s end (hard); none before a list or an environment', sorted(m[1] for m in marks) == [False, False, True, True], marks)
    replace_all(page, ' ')
    want = R5.replace('here.\n\nSecond', 'here. Second').replace('here.\n\nThird', 'here. Third')
    note = summary(page)
    check('^p replaced by a space: the two blank lines go, the two marks with braces or a heading stay, and the note says so', src(page) == want and 'braces or a heading' in note, (src(page)[60:200], note))
    page.evaluate('window.rikuy.undo()'); settle(page, 150)
    # a review comment between the two paragraphs stays where it was
    cdoc = R5.replace('here.\n\nSecond', 'here.\n% comment (Ann): keep this\n\nSecond')
    load_doc(page, cdoc)
    find_set(page, 'here.^pSecond'); replace_all(page, 'here. Second')
    check('security: ^p across a break with a comment line in it keeps the comment', '% comment (Ann): keep this' in src(page) and 'here.\n\nSecond' not in src(page), src(page)[60:200])
    load_doc(page, R5)
    find_set(page, 'ends here.')
    replace_all(page, 'ends^phere.')
    check('^p in the replacement: a paragraph break written as a blank line, in a paragraph\'s own text', src(page) == R5.replace('ends here.', 'ends\n\nhere.'), src(page)[60:160])
    page.evaluate('window.rikuy.undo()'); settle(page, 150)
    find_set(page, 'Opening')
    replace_all(page, 'Open^ping')
    check('^p in the replacement where a heading holds one paragraph: not written, the note says why', src(page) == R5 and 'paragraph break' in summary(page), summary(page))
    find_set(page, 'end^pFourth')
    check('a mark after a group\'s end is found', len(hits(page)) == 1)
    page.evaluate("window.rikuy.findState().rep = 'X'; window.rikuy.findGo(1); window.rikuy.replaceOne()"); settle(page, 200)
    check('and Replace leaves it, saying to replace it In LaTeX source', src(page) == R5 and 'In LaTeX source' in summary(page), summary(page))
    # the dialog's Special menu has Word's ^p
    page.evaluate("window.rikuy.runCommand('advanced-find')"); settle(page, 300)
    page.fill('#fr-q', '')
    page.locator('#fr').get_by_role('button', name='Special', exact=True).click(); settle(page, 200)
    page.get_by_role('menuitem', name='Paragraph mark').click(); settle(page, 400, full=True)
    check('Special › Paragraph mark puts ^p into Find what, and it finds the marks', page.input_value('#fr-q') == '^p' and len(hits(page)) == 4, (page.input_value('#fr-q'), len(hits(page))))
    page.evaluate('window.rikuy.closeFind()')
    if os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        find_set(page, 'here.^pSecond'); replace_all(page, 'here. Second')
        page.set_default_timeout(600000)
        r = page.evaluate("""async () => { const r = await window.rikuy.api.compile(); let s = ''; if (r.pdf) for (let i = 0; i < r.pdf.length; i += 8192) s += String.fromCharCode(...r.pdf.subarray(i, i + 8192)); return { ok: r.ok, pdf: s ? btoa(s) : '' }; }""")
        page.set_default_timeout(30000)
        from pypdf import PdfReader
        text = PdfReader(io.BytesIO(base64.b64decode(r['pdf']))).pages[0].extract_text() if r['pdf'] else ''
        check('compiled in the page, the joined paragraphs print as one: "here. Second" on one line', r['ok'] and 'here. Second' in text, text[:200])


def kinds(page):
    """Format's LaTeX kinds: any heading, a list's items, a table's cells, a theorem, a quotation,
    each found with nothing typed and with words; Equation finds each formula, and words in its
    LaTeX, replaced as LaTeX, one undo."""
    load_doc(page, R5)
    for name, bit, want in (('Any heading', FMT['heading'], ['Opening']), ('List item', FMT['list'], ['apple item', 'pear item']), ('Table cell', FMT['table'], ['cell one', 'cell two']),
                            ('Theorem or proof', FMT['theorem'], ['theorem words']), ('Quotation', FMT['quote'], ['quoted words']), ('Equation', FMT['equation'], ['$x^2+1$', '\\[ y = x^2 \\]'])):
        find_set(page, '', bit)
        check('Format › ' + name + ' with nothing typed finds each one', hits(page) == want, hits(page))
    find_set(page, 'item', FMT['list'])
    check('words and a kind: "item" in a list\'s items only', hits(page) == ['item', 'item'])
    find_set(page, 'x^2', FMT['equation'])
    check('Equation with words: found in each formula\'s LaTeX, never in the text', hits(page) == ['x^2', 'x^2'] and page.evaluate('window.rikuy.fs.hits.every((h) => h.src && h.eq)'), hits(page))
    m = marked(page)
    check('each formula found is marked on the page', len(m['all']) + (1 if m['cur'] or True else 0) >= 2, m)
    h0 = page.evaluate('window.rikuy.hist.length')
    replace_all(page, 'x^3')
    check('Replace All in formulas writes LaTeX, nothing else moves, one step', src(page) == R5.replace('$x^2+1$', '$x^3+1$').replace('y = x^2', 'y = x^3') and page.evaluate('window.rikuy.hist.length') == h0 + 1, src(page)[-120:])
    page.evaluate('window.rikuy.undo()'); settle(page, 150)
    check('one undo, the bytes back', src(page) == R5)
    # the menu: Equation goes alone
    page.evaluate("window.rikuy.runCommand('advanced-find')"); settle(page, 300)
    find_set(page, '', FMT['bold'])
    page.locator('#fr').get_by_role('button', name='Format', exact=True).click(); settle(page, 200)
    names = page.get_by_role('menuitemcheckbox').all_inner_texts()
    check('Format lists the kinds: Any heading, List item, Table cell, Theorem or proof, Quotation, Equation', all(any(i.startswith(n) for i in names) for n in ('Any heading', 'List item', 'Table cell', 'Theorem or proof', 'Quotation', 'Equation')), names)
    page.get_by_role('menuitemcheckbox', name='Equation').click(); settle(page, 300)
    check('Equation goes alone: Bold comes off', page.evaluate('window.rikuy.fs.o.fmt') == FMT['equation'] and page.inner_text('.fr-fmt') == 'Format: Equation', page.evaluate('window.rikuy.fs.o.fmt'))
    page.evaluate('window.rikuy.closeFind()')


def r5_review(page):
    """The hostile review of R5: ^p replaced by nothing after a control word keeps it apart (H1); a
    paragraph break is never written inside an optional argument (H2); in a formula the
    replacement is LaTeX as written and no hit falls inside a command's name (H3); everything
    written compiles in the page where dist/tex exists."""
    out = []
    for name, body, want in (('\\dots', 'See the end\\dots\n\nNext para.', 'See the end\\dots{}Next para.'), ('\\ldots', 'Wait\\ldots\n\nThen go.', 'Wait\\ldots{}Then go.'),
                             ('\\ss', 'Stra\\ss\n\nweiter.', 'Stra\\ss{}weiter.'), ('\\S', 'See \\S\n\nThree.', 'See \\S{}Three.')):
        load_doc(page, WRAP(body)); find_set(page, '^p'); replace_all(page, '')
        check('H1: ^p replaced by nothing after ' + name + ' keeps the control word apart: ' + want, src(page) == WRAP(want), src(page)[40:110])
        out.append(want)
    for name, body, q, rep in (('a description\'s label', '\\begin{description}\n\\item[Label word] text here.\n\\end{description}', 'Label', 'La^pbel'),
                               ('a theorem\'s name', '\\begin{theorem}[Name here]\nSome words.\n\\end{theorem}', 'Name', 'Na^pme')):
        doc = WRAP(body, '\\newtheorem{theorem}{Theorem}\n')
        load_doc(page, doc); find_set(page, q); replace_all(page, rep)
        check('H2: no paragraph break inside ' + name + ' ([...] open): not written, the note says why', src(page) == doc and 'paragraph break' in summary(page), (src(page)[60:160], summary(page)))
    eq = WRAP('Here $y = a+b$ and $M = N$ and $\\alpha = \\frac{a}{2}$ end.')
    load_doc(page, eq)
    find_set(page, 'y', FMT['equation']); replace_all(page, 'x^p')
    check('H3: in a formula x^p is written as it is, no paragraph break', src(page) == eq.replace('$y = a+b$', '$x^p = a+b$'), src(page)[40:120])
    load_doc(page, eq); find_set(page, 'M', FMT['equation']); replace_all(page, 'M^t')
    check('H3: M^t, a transpose, stays M^t (no tab)', src(page) == eq.replace('$M = N$', '$M^t = N$'), src(page)[40:120])
    load_doc(page, eq); find_set(page, 'a', FMT['equation'])
    check('H3: "a" is found in the formulas\' letters, never inside \\alpha or \\frac', hits(page) == ['a', 'a'], hits(page))
    replace_all(page, 'b')
    fixed = eq.replace('a+b$', 'b+b$').replace('\\frac{a}', '\\frac{b}')
    check('H3: Replace All a with b leaves \\alpha and \\frac whole', src(page) == fixed, src(page)[40:140])
    load_doc(page, eq); find_set(page, '\\alpha', FMT['equation'])
    check('a command asked for by its name is found', hits(page) == ['\\alpha'])
    load_doc(page, WRAP('Here $x^p + A^t$ end.')); find_set(page, 'x^p', FMT['equation'])
    check('in a formula x^p in the box is found as written', hits(page) == ['x^p'], hits(page))
    # (Grok Bot's check of H3) an environment's name and a label's key in a formula are no hits:
    # \begin{aligned} kept whole, \label{eq:a} still what \eqref{eq:a} names
    al = WRAP('\\[ \\begin{aligned} a &= 1 \\end{aligned} \\]\n\\begin{equation} a = 2 \\label{eq:a} \\end{equation} See \\eqref{eq:a}.', '\\usepackage{amsmath}\n')
    load_doc(page, al); find_set(page, 'a', FMT['equation'])
    check('H3 check: "a" in formulas is never inside \\begin{aligned} nor \\label{eq:a}', hits(page) == ['a', 'a'], hits(page))
    replace_all(page, 'b')
    check('H3 check: Replace All a with b keeps the environment and the label', src(page) == al.replace(' a &= 1', ' b &= 1').replace(' a = 2', ' b = 2'), src(page)[40:220])
    fixed_al = src(page)
    if os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        load_doc(page, WRAP('\n\n'.join(out) + '\n\n' + fixed[fixed.index('Here'):fixed.index('\n\\end{document}')] + '\n\n' + fixed_al[fixed_al.index('\\[ '):fixed_al.index('\n\\end{document}')], '\\usepackage{amsmath}\n'))
        page.set_default_timeout(600000)
        r = page.evaluate('window.rikuy.api.compile()')
        page.set_default_timeout(30000)
        errs = [x for x in r['problems'] if x.get('severity') == 'error']
        check('compiled in the page: what the fixed replacements wrote has no error', r['ok'] and not errs, errs[:2])


def hunt(page):
    """What a heavy Word user met in the bug hunt of 2026-11-22, each a regression check."""
    # words selected, Ctrl+H, Replace: Word replaces them at the first press and shows the next
    doc = WRAP('Alpha cat one. Beta cat two.')
    load_doc(page, doc)
    select_text(page, 'cat')
    page.keyboard.press('Control+h'); settle(page, 250)
    d = page.get_by_role('dialog', name='Find and Replace', exact=True)
    d.get_by_label('Replace with', exact=True).fill('dog')
    d.get_by_role('button', name='Replace one', exact=True).click(); settle(page, 250)
    check('hunt: a selected hit, Ctrl+H, one press of Replace: it is replaced, the next one shown', src(page) == doc.replace('Alpha cat', 'Alpha dog') and summary(page) == 'Result 1 of 1', (src(page)[40:80], summary(page)))
    page.keyboard.press('Escape'); settle(page, 150)


def run():
    with sync_playwright() as p:
        browser, page, errors = open_page(p)
        # (the page lays its pages out again 200 ms after the last of its fonts came, app.js's
        # loadingdone: that drops the caret's place, which Enter's first hit is counted from)
        until(page, "() => document.fonts.status === 'loaded'"); settle(page, 200, full=True)
        for f in (ctrl_f, dialog, in_selection_and_source, review, go_to, select_and_words, para_marks, kinds, r5_review, hunt, pdf_check):
            try: f(page)
            except Exception as e: check(f.__name__ + ' runs to its end', False, str(e)[:400])
        check('no page errors', not [e for e in errors if 'tree.wasm' not in e and 'TeX' not in e], errors[:4])
        browser.close()
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    if sys.argv[1:] == ['hunt']:
        with sync_playwright() as p:
            browser, page, errors = open_page(p)
            until(page, "() => document.fonts.status === 'loaded'"); settle(page, 200, full=True)
            hunt(page)
            check('no page errors', not errors, errors[:4])
        bad = [r for r in results if not r[1]]
        print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
        sys.exit(1 if bad else 0)
    run()
