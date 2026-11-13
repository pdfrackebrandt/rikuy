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
from browser import open_page, check, results, src, load_doc, click_text, select_text
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
    page.keyboard.press('Control+f'); page.wait_for_timeout(250)
    box = page.get_by_role('searchbox', name='Search document', exact=True)
    check('Ctrl+F on the page opens the Navigation pane with its box "Search document" focused', box.count() == 1 and page.evaluate('document.activeElement.getAttribute("aria-label")') == 'Search document')
    box.type('cat'); page.wait_for_timeout(500)
    check('typing finds the page\'s text, a footnote\'s and an italic one too, never math: five hits', hits(page) == ['cat'] * 5 and summary(page) == '5 results', (hits(page), summary(page)))
    m = marked(page)
    check('every hit is marked on the page (CSS highlight rk-find)', len(m['all']) >= 5 and all(t == 'cat' for t in m['all']), m)
    results_view = page.get_by_role('tabpanel', name='Results', exact=True)
    check('the Results view lists them with their context', results_view.count() == 1 and results_view.get_by_role('button').count() == 5 and 'Another cat here.' in results_view.inner_text(), results_view.inner_text()[:200])
    page.keyboard.press('Enter'); page.wait_for_timeout(200)
    check('Enter goes to the first hit after the caret: Result 3 of 5, marked as the current one', summary(page) == 'Result 3 of 5' and marked(page)['cur'] == 'cat', (summary(page), marked(page)))
    page.keyboard.press('Shift+Enter'); page.wait_for_timeout(150)
    check('Shift+Enter the one before', summary(page) == 'Result 2 of 5')
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    sel = page.evaluate('[document.activeElement.id, String(getSelection()), window.rikuy.caretNow().a]')
    check('Escape: back on the page, the hit shown selected there (typing would replace it)', sel[0] == 'pages' and sel[1] == 'cat' and sel[2] == DOC.index('cats') , sel)
    # what it finds as the page shows it
    box.fill('50%'); page.wait_for_timeout(400)
    h = page.evaluate('window.rikuy.fs.hits.map((h) => [h.text, window.rikuy.src(h.f).slice(h.s, h.e)])')
    check('50% finds the source\'s 50\\%', h == [['50%', '50\\%']], h)
    box.fill('"quoted"'); page.wait_for_timeout(400)
    h = page.evaluate('window.rikuy.fs.hits.map((h) => window.rikuy.src(h.f).slice(h.s, h.e))')
    check('a straight quote finds the typeset curly ones: ``quoted\'\'', h == ["``quoted''"], h)
    for q in ('textbf', 'sec:a', 'x = cat', 'footnote'):
        box.fill(q); page.wait_for_timeout(350)
        check('the page\'s text only: "%s" is a command, a label or math, not found' % q, hits(page) == [] and summary(page) == 'Not found.', (hits(page), summary(page)))
    box.fill(''); page.wait_for_timeout(350)
    check('the box emptied: the marks go', marked(page)['all'] == [], marked(page))
    # outside the page, Ctrl+F is the browser's own
    page.evaluate('''() => { window.__fp = null; document.addEventListener('keydown', (e) => { if (e.key === 'f') window.__fp = e.defaultPrevented; }); }''')
    page.evaluate('document.activeElement.blur(); document.body.focus()')
    page.keyboard.press('Control+f'); page.wait_for_timeout(100)
    check('outside the page Ctrl+F is left to the browser (its find opens)', page.evaluate('window.__fp') is False, page.evaluate('window.__fp'))
    page.evaluate("window.rikuy.toggleNav(false)")


def dialog(page):
    load_doc(page, DOC)
    click_text(page, 'Another', 2)
    page.keyboard.press('Control+h'); page.wait_for_timeout(250)
    d = page.get_by_role('dialog', name='Find and Replace', exact=True)
    check('Ctrl+H opens the dialog "Find and Replace" on its Replace tab: a Close button, not modal', d.count() == 1 and d.get_attribute('aria-modal') is None and d.get_by_role('button', name='Close', exact=True).count() == 1
          and d.get_by_role('tab', name='Replace', exact=True).get_attribute('aria-selected') == 'true')
    check('its fields and options by name', all(d.get_by_label(n, exact=True).count() == 1 for n in ('Find what', 'Replace with', 'Match case', 'Find whole words only', 'Use wildcards', 'Use regular expressions', 'In LaTeX source', 'In selection'))
          and all(d.get_by_role('button', name=n, exact=True).count() == 1 for n in ('Replace', 'Replace All', 'Find Next', 'Find Previous', 'Format', 'Special', 'No formatting')))
    d.get_by_label('Find what', exact=True).fill('50%'); page.wait_for_timeout(350)
    d.get_by_label('Replace with', exact=True).fill('75% & more')
    h0 = page.evaluate('window.rikuy.hist.length')
    d.get_by_role('button', name='Find Next', exact=True).click(); page.wait_for_timeout(150)
    d.get_by_role('button', name='Replace', exact=True).click(); page.wait_for_timeout(300)
    want = DOC.replace('50\\% of', '75\\% \\& more of')
    check('Replace writes the replacement escaped as typing escapes it, inside the bold it lands in, as one step', src(page) == want and page.evaluate('window.rikuy.hist.length') == h0 + 1, src(page)[60:160])
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
    check('one undo gives the bytes back', src(page) == DOC)
    # Replace All: every one at once, one undo
    d.get_by_label('Find what', exact=True).fill('cat'); page.wait_for_timeout(350)
    d.get_by_label('Find whole words only', exact=True).check(); page.wait_for_timeout(250)
    d.get_by_label('Replace with', exact=True).fill('dog')
    h0 = page.evaluate('window.rikuy.hist.length')
    d.get_by_role('button', name='Replace All', exact=True).click(); page.wait_for_timeout(400)
    want = DOC.replace('The cat', 'The dog').replace('Another cat', 'Another dog').replace('A cat note', 'A dog note').replace('\\textit{cat}', '\\textit{dog}')
    check('Replace All with Find whole words only: every whole "cat" of the text (a footnote\'s, an italic one), not "cats", not the math\'s, in one step', src(page) == want and page.evaluate('window.rikuy.hist.length') == h0 + 1, src(page))
    st = d.get_by_role('status').first.inner_text()
    check('and it says how many: Replaced 4 places.', st.startswith('Replaced 4 places.'), st)
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
    check('one undo takes all of it back, byte for byte', src(page) == DOC)
    d.get_by_label('Find whole words only', exact=True).uncheck()
    # a hit across markup: the replacement takes the first character's place, the braces stay
    load_doc(page, WRAP('Some \\textbf{bold} text here.'))
    d.get_by_label('Find what', exact=True).fill('bold text'); page.wait_for_timeout(350)
    d.get_by_label('Replace with', exact=True).fill('strong words')
    d.get_by_role('button', name='Replace All', exact=True).click(); page.wait_for_timeout(300)
    check('a hit across \\textbf{...}: the replacement lands in the bold, the closing brace stays, nothing else moves', src(page) == WRAP('Some \\textbf{strong words} here.'), src(page))
    # Match case
    load_doc(page, WRAP('Cat cat CAT.'))
    d.get_by_label('Find what', exact=True).fill('cat'); page.wait_for_timeout(350)
    a = hits(page)
    d.get_by_label('Match case', exact=True).check(); page.wait_for_timeout(300)
    check('Match case: three hits without it, one with it', a == ['Cat', 'cat', 'CAT'] and hits(page) == ['cat'], (a, hits(page)))
    d.get_by_label('Match case', exact=True).uncheck()
    # Word's wildcards and their groups
    load_doc(page, WRAP('by Ada Lovelace and Alan Turing.'))
    d.get_by_label('Use wildcards', exact=True).check()
    d.get_by_label('Find what', exact=True).fill('(<[A-Z][a-z]@>) (<[A-Z][a-z]@>)'); page.wait_for_timeout(350)
    d.get_by_label('Replace with', exact=True).fill('\\2, \\1')
    d.get_by_role('button', name='Replace All', exact=True).click(); page.wait_for_timeout(300)
    check('Use wildcards: (<[A-Z][a-z]@>) (<[A-Z][a-z]@>) to \\2, \\1 turns the names round', src(page) == WRAP('by Lovelace, Ada and Turing, Alan.'), src(page))
    d.get_by_label('Use wildcards', exact=True).uncheck()
    # regular expressions
    load_doc(page, WRAP('Up 50\\% and 7\\% down.'))
    d.get_by_label('Use regular expressions', exact=True).check()
    d.get_by_label('Find what', exact=True).fill('(\\d+)%'); page.wait_for_timeout(350)
    d.get_by_label('Replace with', exact=True).fill('$1 percent')
    d.get_by_role('button', name='Replace All', exact=True).click(); page.wait_for_timeout(300)
    check('Use regular expressions: (\\d+)% to $1 percent on the typeset 50% (the source\'s 50\\%)', src(page) == WRAP('Up 50 percent and 7 percent down.'), src(page))
    d.get_by_label('Find what', exact=True).fill('(a'); page.wait_for_timeout(350)
    st = d.get_by_role('status').first.inner_text()
    check('a pattern that cannot be read says why, in the status line', st.startswith('This pattern cannot be read'), st)
    d.get_by_label('Use regular expressions', exact=True).uncheck()
    # Special: Word's codes into the box
    load_doc(page, WRAP('Room 12 and room 7.'))
    d.get_by_label('Find what', exact=True).fill('room ')
    d.get_by_label('Find what', exact=True).focus()
    page.keyboard.press('End')
    d.get_by_role('button', name='Special', exact=True).click(); page.wait_for_timeout(150)
    page.get_by_role('menu', name='Special', exact=True).get_by_role('menuitem', name='Any digit', exact=True).click(); page.wait_for_timeout(350)
    check('Special ▸ Any digit puts ^# in the box; it finds room 1 and room 7', d.get_by_label('Find what', exact=True).input_value() == 'room ^#' and hits(page) == ['Room 1', 'room 7'], (d.get_by_label('Find what', exact=True).input_value(), hits(page)))
    # Format: the bold runs with nothing typed; and typed words only where bold
    load_doc(page, WRAP('Plain cat, \\textbf{bold cat} and {\\bfseries more bold}.'))
    d.get_by_label('Find what', exact=True).fill(''); page.wait_for_timeout(250)
    d.get_by_role('button', name='Format', exact=True).click(); page.wait_for_timeout(150)
    page.get_by_role('menu', name='Format', exact=True).get_by_role('menuitemcheckbox', name='Bold', exact=True).click(); page.wait_for_timeout(350)
    check('Format ▸ Bold with nothing typed finds the bold runs, \\textbf and {\\bfseries} alike', hits(page) == ['bold cat', 'more bold'], hits(page))
    d.get_by_label('Find what', exact=True).fill('cat'); page.wait_for_timeout(350)
    check('and typed words only where they are bold', hits(page) == ['cat'] and page.evaluate('window.rikuy.src("main.tex").slice(window.rikuy.fs.hits[0].s - 5, window.rikuy.fs.hits[0].e)') == 'bold cat', hits(page))
    d.get_by_role('button', name='No formatting', exact=True).click(); page.wait_for_timeout(300)
    check('No formatting: every cat again', hits(page) == ['cat', 'cat'])
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    check('Escape closes the dialog, the hit shown selected on the page', d.count() == 0 or not d.is_visible())


def in_selection_and_source(page):
    load_doc(page, WRAP('One cat.\n\nTwo cat and another cat in the middle.\n\nThree cat.'))
    page.evaluate('''() => { const sp = [...document.querySelectorAll('#pages span.t')].find((s) => s.textContent.includes('Two cat')); const r = document.createRange();
      r.setStart(sp.firstChild, 0); r.setEnd(sp.firstChild, sp.textContent.length); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }''')
    page.keyboard.press('Control+h'); page.wait_for_timeout(250)
    d = page.get_by_role('dialog', name='Find and Replace', exact=True)
    check('a selection longer than a few words is offered as the place to look: In selection ticked', d.get_by_label('In selection', exact=True).is_checked())
    d.get_by_label('Find what', exact=True).fill('cat'); page.wait_for_timeout(350)
    d.get_by_label('Replace with', exact=True).fill('dog')
    d.get_by_role('button', name='Replace All', exact=True).click(); page.wait_for_timeout(300)
    check('In selection: Replace All replaces there alone', src(page) == WRAP('One cat.\n\nTwo dog and another dog in the middle.\n\nThree cat.'), src(page))
    d.get_by_label('In selection', exact=True).uncheck()
    # In LaTeX source: commands and labels too, the replacement as it is written
    doc = WRAP('\\section{Intro}\\label{sec:a}\nSee Section~\\ref{sec:a} and $\\alpha$.')
    load_doc(page, doc)
    d.get_by_label('Find what', exact=True).fill('sec:a'); page.wait_for_timeout(300)
    a = hits(page)
    d.get_by_label('In LaTeX source', exact=True).check(); page.wait_for_timeout(300)
    b = hits(page)
    check('a label\'s key: not in the page\'s text; In LaTeX source finds it in \\label and \\ref', a == [] and b == ['sec:a', 'sec:a'], (a, b))
    d.get_by_label('Replace with', exact=True).fill('sec:intro')
    h0 = page.evaluate('window.rikuy.hist.length')
    d.get_by_role('button', name='Replace All', exact=True).click(); page.wait_for_timeout(300)
    check('and renames the label everywhere, as written, in one step', src(page) == doc.replace('sec:a', 'sec:intro') and page.evaluate('window.rikuy.hist.length') == h0 + 1, src(page))
    d.get_by_label('Find what', exact=True).fill('\\alpha'); page.wait_for_timeout(300)
    d.get_by_label('Replace with', exact=True).fill('\\beta')
    d.get_by_role('button', name='Replace All', exact=True).click(); page.wait_for_timeout(300)
    check('in LaTeX source, inside math too (\\alpha to \\beta): asked for, so done', '$\\beta$' in src(page), src(page))
    d.get_by_label('In LaTeX source', exact=True).uncheck()
    # a LaTeX paragraph: its text is its source, a replacement goes in as it is written
    load_doc(page, WRAP('Plain foo here.\n\n% rikuy: latex\nBoxed foo here.'))
    d.get_by_label('Find what', exact=True).fill('foo'); page.wait_for_timeout(300)
    d.get_by_label('Replace with', exact=True).fill('\\emph{x}')
    d.get_by_role('button', name='Replace All', exact=True).click(); page.wait_for_timeout(300)
    check('in text a replacement with a backslash is escaped; in a LaTeX paragraph it is written as source', src(page) == WRAP('Plain \\textbackslash{}emph\\{x\\} here.\n\n% rikuy: latex\nBoxed \\emph{x} here.'), src(page))
    d.get_by_role('button', name='Close', exact=True).click(); page.wait_for_timeout(150)
    check('Close closes it; the marks go with it', not d.is_visible() and page.evaluate("!CSS.highlights.get('rk-find') || CSS.highlights.get('rk-find').size === 0"))


LONG = WRAP('\\section{Alpha}\\label{s:a}\n' + ('Text of alpha. ' * 120) + '\n\n\\section{Beta}\\label{s:b}\nBeta words.\\footnote{One.} More.\\footnote{Two.}\n\n'
            '\\begin{equation}\\label{e:1}\na = b\n\\end{equation}\n\n\\subsection{Beta one}\n' + ('Filler line. ' * 260) + '\n\n\\section{Gamma}\nGamma ends.')


def go_to(page):
    load_doc(page, LONG)
    page.wait_for_timeout(300)
    n = page.evaluate('window.rikuy.layout.pages.length')
    click_text(page, 'Alpha', 1)
    st = page.locator('#st-pages')
    check('the status bar says Page x of y, as a button', st.inner_text() == 'Page 1 of %d' % n and n >= 2 and st.evaluate('(b) => b.tagName') == 'BUTTON', (st.inner_text(), n))
    st.click(); page.wait_for_timeout(250)
    d = page.get_by_role('dialog', name='Find and Replace', exact=True)
    check('a click on it opens Go To', d.get_by_role('tab', name='Go To', exact=True).get_attribute('aria-selected') == 'true' and d.get_by_label('Go to what', exact=True).count() == 1)
    d.get_by_label('Go to what', exact=True).select_option('page')
    d.get_by_label('Enter page number', exact=True).fill('2'); page.keyboard.press('Enter'); page.wait_for_timeout(300)
    check('Page 2: the place kept on page 2 (the caret goes there when the dialog closes), the status bar says so', st.inner_text() == 'Page 2 of %d' % n and page.evaluate('window.rikuy.rbRange.startContainer.parentElement.closest(".page") === window.rikuy.layout.pages[1].el'), st.inner_text())
    check('and the focus stays in the dialog', page.evaluate('document.activeElement.id') == 'fr-n')
    d.get_by_label('Go to what', exact=True).select_option('section')
    d.get_by_label('Enter section number', exact=True).fill('2.1'); page.keyboard.press('Enter'); page.wait_for_timeout(250)
    check('Section 2.1 by its number', page.evaluate('window.rikuy.rbRange && window.rikuy.rbRange.startContainer.parentElement.closest(".it").textContent').endswith('Beta one'), d.get_by_role('status').last.inner_text())
    d.get_by_label('Go to what', exact=True).select_option('label')
    d.get_by_label('Enter label', exact=True).fill('e:1'); page.keyboard.press('Enter'); page.wait_for_timeout(250)
    check('a label by its key: e:1', d.get_by_role('status').last.inner_text().startswith('Label e:1'), d.get_by_role('status').last.inner_text())
    opts = page.evaluate("[...document.querySelectorAll('#fr-list option')].map((o) => o.value)")
    check('the field offers the labels', opts == ['s:a', 's:b', 'e:1'], opts)
    d.get_by_label('Go to what', exact=True).select_option('footnote')
    d.get_by_label('Enter footnote number', exact=True).fill('')
    click_text(page, 'Beta words', 0)
    d.get_by_role('button', name='Next', exact=True).click(); page.wait_for_timeout(200)
    a = d.get_by_role('status').last.inner_text()
    d.get_by_role('button', name='Next', exact=True).click(); page.wait_for_timeout(200)
    b = d.get_by_role('status').last.inner_text()
    check('footnotes one at a time with Next: 1, then 2', a.startswith('Footnote 1') and b.startswith('Footnote 2'), (a, b))
    d.get_by_label('Go to what', exact=True).select_option('equation')
    d.get_by_label('Enter equation number', exact=True).fill('+1'); page.keyboard.press('Enter'); page.wait_for_timeout(200)
    check('+1 equation from the caret', d.get_by_role('status').last.inner_text().startswith('Equation 1'), d.get_by_role('status').last.inner_text())
    d.get_by_label('Enter equation number', exact=True).fill('5'); page.keyboard.press('Enter'); page.wait_for_timeout(200)
    check('one that is not there says how many there are', d.get_by_role('status').last.inner_text() == 'No equation 5: the document has 1 equation.', d.get_by_role('status').last.inner_text())
    page.keyboard.press('Escape'); page.wait_for_timeout(150)
    page.keyboard.press('Control+g'); page.wait_for_timeout(200)
    check('Ctrl+G on the page opens Go To', d.get_by_role('tab', name='Go To', exact=True).get_attribute('aria-selected') == 'true' and page.evaluate('document.activeElement.id') == 'fr-n')
    page.keyboard.press('Escape')


def select_and_words(page):
    load_doc(page, WRAP('First sentence here. Second one now! Third.\n\nOther \\textbf{bold} and \\textbf{more} text.'))
    click_text(page, 'Second one', 3)
    # (Select is on Home where the row has room; else in the group Editing's menu, as in Word)
    if page.get_by_role('button', name='Select', exact=True).is_visible():
        page.get_by_role('button', name='Select', exact=True).click()
    else:
        page.get_by_role('button', name='Editing', exact=True).click(); page.wait_for_timeout(150)
        page.get_by_role('menu', name='Editing', exact=True).get_by_role('menuitem', name='Select', exact=True).click()
    page.wait_for_timeout(200)
    menu = page.get_by_role('menu', name='Select', exact=True)
    items = [menu.get_by_role('menuitem').nth(k).get_attribute('aria-label') for k in range(menu.get_by_role('menuitem').count())]
    check('Select▾ on Home (in Editing\'s menu at 1400 px): Select All, Select paragraph, Select sentence, Select text with similar formatting', items == ['Select All', 'Select paragraph', 'Select sentence', 'Select text with similar formatting'], items)
    check('similar formatting is disabled in plain text', menu.get_by_role('menuitem', name='Select text with similar formatting', exact=True).get_attribute('aria-disabled') == 'true')
    menu.get_by_role('menuitem', name='Select sentence', exact=True).click(); page.wait_for_timeout(200)
    check('Select sentence: the caret\'s sentence', page.evaluate('String(getSelection())') == 'Second one now!', page.evaluate('String(getSelection())'))
    page.wait_for_timeout(250)
    check('the status bar counts the words selected: 3 of 12 words', page.inner_text('#st-words') == '3 of 12 words', page.inner_text('#st-words'))
    page.evaluate("window.rikuy.runCommand('select-paragraph')"); page.wait_for_timeout(100)
    check('Select paragraph: the caret\'s paragraph', page.evaluate('String(getSelection())') == 'First sentence here. Second one now! Third.', page.evaluate('String(getSelection())'))
    click_text(page, 'bold', 1)
    page.evaluate("window.rikuy.runCommand('select-similar')"); page.wait_for_timeout(300)
    check('Select text with similar formatting: every bold run marked and listed under Results', hits(page) == ['bold', 'more'] and page.get_by_role('tabpanel', name='Results', exact=True).get_by_role('button').count() == 2, hits(page))
    page.evaluate('window.rikuy.findClear(); window.rikuy.toggleNav(false)')
    click_text(page, 'Other', 1)
    page.wait_for_timeout(200)
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


def run():
    with sync_playwright() as p:
        browser, page, errors = open_page(p)
        for f in (ctrl_f, dialog, in_selection_and_source, go_to, select_and_words, pdf_check):
            try: f(page)
            except Exception as e: check(f.__name__ + ' runs to its end', False, str(e)[:400])
        check('no page errors', not [e for e in errors if 'tree.wasm' not in e and 'TeX' not in e], errors[:4])
        browser.close()
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    run()
