"""What an economist met writing a paper fast, keys first (dogfood of 2026-11-20), each a case
that failed before its fix: a formula typed and closed at once (Ctrl+M, x, Enter); Right and
Left out of a formula in the line; the LaTeX box's \\text{...} turning the equation field into
text that the next key wrote back; a heading or a proof on the blank paragraph after an abstract
or a proposition, which went inside it; Insert Table's first field typed over by keys; a table's
caption drawn where its \\caption stands; the citation picker offering a .bib the document does not
name yet, and writing its bibliography in the same step; text pasted from a PDF (ligatures, Greek)
that pdfLaTeX can set. Where dist/tex exists, what they write compiles with no error.

Round two: a heading on one paragraph of an abstract of several splits the abstract around it; a
new document's downloads are named by its title; typing is undone word by word and a heading apart
from the paragraph after it; Enter at a paragraph's start writes no blank lines (an empty
paragraph shows above, to type in); Undo works after a reload. Then lecture notes and a problem
set: \\mathbb typed in the equation field or pasted from a chat assistant brings amssymb; amsmath's
\\intertext drawn as a line of text between the rows; "- " in a definition starts a list there; Replace All
across the notes' files keeps the case of what it replaces. And the hostile reviews' cases
(E1 to E10; then E11 to E18: review2; the verification's V1 to V9: review3).

Round four, real documents (`real`): Enter in the words of a command of the document's own
(\\question{..}) or in a caption of algorithm's float, and at the end of a list item in braces;
a word typed after an acronym's or a glossary entry's command (\\ac{KDE}, \\Gls{slp}); enumitem's
\\newlist lists; \\marginnote's offset and \\columnseprule=.4pt drawn as no words; German quotes typed in a German document.

  python3 dogfood.py [part ...]   parts: formula arrows textfield styles table caption cite paste
                                  split filename undo_words enter reload_undo mathpkg intertext envlist replace review review2 review3 real
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from browser import settle, saved, until, ready, open_page, check, results, src, load_doc, click_text, ROOT
from playwright.sync_api import sync_playwright

PARTS = sys.argv[1:] or ['formula', 'arrows', 'textfield', 'styles', 'table', 'caption', 'cite', 'paste', 'split', 'filename', 'undo_words', 'enter', 'reload_undo', 'mathpkg', 'intertext', 'envlist', 'replace', 'review', 'review2', 'review3', 'real']
DIST = os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist')
TEX = os.path.isdir(os.path.join(DIST, 'tex')) and any(n.endswith('.wasm') for n in os.listdir(os.path.join(DIST, 'tex')))

DOC = r'''\documentclass{article}
\usepackage{amsmath}
\begin{document}
Agent income here.

Second paragraph.
\end{document}
'''


def focus_id(page):
    return page.evaluate("document.activeElement.id || document.activeElement.className")


def compiles(page, name):
    if not TEX:
        return
    r = page.evaluate("async () => { const r = await window.rikuy.api.compile(); return { ok: r.ok, problems: r.problems.filter((p) => p.severity === 'error').map((p) => p.message) }; }")
    check(name + ': compiles with no error', r['ok'] and not r['problems'], r)


def caret_text(page):
    return page.evaluate("(() => { const s = getSelection(); if (!s.rangeCount) return ''; const n = s.anchorNode; return (n.textContent || '').slice(0, s.anchorOffset).slice(-12) + '|' + (n.textContent || '').slice(s.anchorOffset, s.anchorOffset + 12); })()")


def reload(page):
    """The page loaded again and through init, as open_page() leaves it: the project, its history and
    its review read back from IndexedDB, its fonts in and the relayout they set going (ready())."""
    page.reload()
    ready(page)


def formula(page):
    # MathLive tells its input a moment after the key: Enter at once closed the box empty
    k = page.keyboard
    load_doc(page, DOC)
    click_text(page, 'Agent income', 5)
    k.press('Control+m'); page.wait_for_selector('#pop-field', timeout=10000); settle(page, 200)
    k.type('x'); k.press('Enter'); settle(page, 300)
    check('formula: x typed and Enter at once writes $x$', 'Agent$x$ income' in src(page), src(page)[40:90])
    check('formula: the box is closed and the caret on the page', not page.evaluate("!!document.querySelector('#pop-field')") and focus_id(page) == 'pages', focus_id(page))
    k.press('Control+m'); page.wait_for_selector('#pop-field', timeout=10000); settle(page, 200)
    k.type('y_1'); k.press('Escape'); settle(page, 300)
    check('formula: y_1 typed and Esc at once keeps it', '$y_1$' in src(page) or '$y_{1}$' in src(page), src(page)[40:100])


def arrows(page):
    k = page.keyboard
    load_doc(page, DOC)
    click_text(page, 'Agent income', 5)
    k.type(' ')
    k.press('Control+m'); page.wait_for_selector('#pop-field', timeout=10000); settle(page, 200)
    k.type('i'); settle(page, 100); k.press('ArrowRight'); settle(page, 300)
    check('arrows: Right at a new formula\'s end leaves it', not page.evaluate("!!document.querySelector('#pop-field')") and focus_id(page) == 'pages', focus_id(page))
    k.type('has', delay=20); settle(page, 300)
    check('arrows: the words typed next go after it, spaces kept', 'Agent $i$has income' in src(page), src(page)[40:100])
    # an existing formula: Left at its start puts the caret before it
    page.locator('#pages .it.p .katex').first.click(); page.wait_for_selector('#pop-field', timeout=10000); settle(page, 300)
    page.evaluate("(() => { const mf = document.getElementById('pop-field'); mf.focus(); mf.executeCommand('moveToMathfieldStart'); })()")
    k.press('ArrowLeft'); settle(page, 300)
    check('arrows: Left at a formula\'s start leaves it', not page.evaluate("!!document.querySelector('#pop-field')"), focus_id(page))
    k.type('Z'); settle(page, 300)
    check('arrows: the caret stands before the formula', 'Agent Z$i$has' in src(page), src(page)[40:100])
    # Shift+Tab still reaches the LaTeX box: MathLive's move-out comes for it too, and closed the field
    load_doc(page, DOC)
    click_text(page, 'Agent income', 5)
    k.press('Control+m'); page.wait_for_selector('#pop-field', timeout=10000); settle(page, 200)
    k.press('Shift+Tab'); settle(page, 150)
    check('arrows: Shift+Tab in a new formula reaches its LaTeX box', focus_id(page) == 'pop-newtex', focus_id(page))
    k.press('Escape'); settle(page, 200)
    # a display is left by Right at its end too, as Word's arrows leave an equation of its own line
    # (it once kept its arrows; mathfield.py has the rest: Left, Up, Down, an align's rows)
    load_doc(page, DOC.replace('Second paragraph.', '\\[\n  a+b\n\\]'))
    page.locator('#pages .katex-display').first.click(); page.wait_for_selector('#pop-field', timeout=10000); settle(page, 300)
    page.evaluate("(() => { const mf = document.getElementById('pop-field'); mf.focus(); mf.executeCommand('moveToMathfieldEnd'); })()")
    k.press('ArrowRight'); settle(page, 200, full=True)
    gone = page.evaluate("!document.querySelector('#pop-field')")
    k.type('Q'); settle(page, 250, full=True)
    check('arrows: Right at a display formula\'s end leaves it, the next letter after it', gone and '\\]\nQ' in src(page) and 'a+b' in src(page), src(page)[-60:])
    k.press('Escape'); settle(page, 200)


def textfield(page):
    # MathLive's setValue went in the mode at its caret: after \text{...} every value was text
    k = page.keyboard
    load_doc(page, DOC)
    click_text(page, 'Second paragraph.', 17)
    k.press('Enter'); settle(page, 100)
    k.press('Alt+='); page.wait_for_selector('#pop-field', timeout=10000); settle(page, 300)
    k.press('Shift+Tab'); settle(page, 100)
    check('textfield: Shift+Tab reaches the LaTeX box', focus_id(page) == 'pop-tex', focus_id(page))
    k.type(r'\max_{c} u(c) \quad \text{s.t.}\quad c \le w', delay=5); settle(page, 400)
    v = page.evaluate("document.getElementById('pop-field').getValue('latex')")
    check('textfield: the field shows the math, not one text run', 'textbackslash' not in v and v.startswith('\\max'), v)
    k.press('Tab'); settle(page, 100)
    check('textfield: Tab goes to the field', focus_id(page) == 'pop-field', focus_id(page))
    page.evaluate("(() => { const mf = document.getElementById('pop-field'); mf.executeCommand('moveToMathfieldEnd'); })()")
    k.type('+1'); settle(page, 300); k.press('Escape'); settle(page, 300)
    s = src(page)
    check('textfield: a key in the field keeps the source LaTeX', 'textbackslash' not in s and '\\text{s.t.}' in s and '\\max_{c}' in s and 'w+1' in s, s[s.find('\\begin{equation}'):][:120])
    compiles(page, 'textfield')


def styles(page):
    k = page.keyboard
    doc = DOC.replace('Agent income here.', '\\begin{abstract}\nWe study taxes.\n\\end{abstract}')
    load_doc(page, doc)
    click_text(page, 'We study taxes.', 15)
    k.press('Enter'); settle(page, 150)
    k.press('Control+Alt+1'); settle(page, 200)
    k.type('Model', delay=10); settle(page, 300)
    s = src(page)
    check('styles: Heading 1 on the blank paragraph after an abstract goes after \\end{abstract}', 'We study taxes.\n\\end{abstract}\n\n\\section{Model}' in s, s[s.find('\\begin{abstract}'):][:120])
    for _ in range(3):
        if src(page) == doc: break
        k.press('Control+z'); settle(page, 150)
    check('styles: undo gives the source back byte for byte', src(page) == doc, src(page))
    doc2 = DOC.replace('\\usepackage{amsmath}', '\\usepackage{amsmath}\n\\usepackage{amsthm}\n\\newtheorem{proposition}{Proposition}').replace('Agent income here.', '\\begin{proposition}\nTaxes rise.\n\\end{proposition}')
    load_doc(page, doc2)
    click_text(page, 'Taxes rise.', 11)
    k.press('Enter'); settle(page, 150)
    k.press('Control+Shift+S'); settle(page, 200); k.type('Proof'); settle(page, 200); k.press('Enter'); settle(page, 300)
    k.type('Differentiate.', delay=10); settle(page, 300)
    s = src(page)
    check('styles: Proof on the blank paragraph after a proposition goes after \\end{proposition}', 'Taxes rise.\n\\end{proposition}\n\n\\begin{proof}\nDifferentiate.\n\\end{proof}' in s, s[s.find('\\begin{proposition}'):][:160])
    compiles(page, 'styles')
    # a blank paragraph inside an abstract typed in stays in it (Normal: no change)
    load_doc(page, doc)
    click_text(page, 'We study taxes.', 15)
    k.press('Enter'); settle(page, 150)
    k.type('More.', delay=10); settle(page, 300)
    s = src(page)
    check('styles: words typed on it stay in the abstract, as before', 'We study taxes.\n\nMore.' in s and s.find('More.') < s.find('\\end{abstract}'), s)


def table(page):
    k = page.keyboard
    load_doc(page, DOC)
    click_text(page, 'Second paragraph.', 17)
    k.press('Enter'); settle(page, 100)
    k.press('Alt+q'); settle(page, 200); k.type('insert table'); settle(page, 300); k.press('Enter'); settle(page, 400)
    k.type('3'); k.press('Tab'); k.type('4'); k.press('Enter'); settle(page, 500)
    s = src(page)
    body = s[s.find('\\begin{tabular}'):s.find('\\end{tabular}')]
    check('table: 3 Tab 4 Enter makes 3 columns and 4 rows', '\\begin{tabular}{lll}' in s and body.count('\\\\') == 4, body)


def caption(page):
    doc = DOC.replace('Second paragraph.', '\\begin{table}[h]\n\\centering\n\\begin{tabular}{ll}\na & b \\\\\n\\end{tabular}\n\\caption{Below}\n\\end{table}\n\n\\begin{table}[h]\n\\centering\n\\caption{Above}\n\\begin{tabular}{ll}\nc & d \\\\\n\\end{tabular}\n\\end{table}')
    load_doc(page, doc)
    settle(page, 300)
    ys = page.evaluate("""(() => [...document.querySelectorAll('#pages .flt-table')].map((f) => { const c = f.querySelector('.cap'), t = f.querySelector('table'); return [c.textContent, c.getBoundingClientRect().top, t.getBoundingClientRect().top]; }))()""")
    check('caption: a \\caption after the tabular is drawn below it, as TeX prints it', len(ys) == 2 and 'Below' in ys[0][0] and ys[0][1] > ys[0][2], ys)
    check('caption: a \\caption before the tabular is drawn above it', len(ys) == 2 and 'Above' in ys[1][0] and ys[1][1] < ys[1][2], ys)


def cite(page):
    k = page.keyboard
    bib = '@article{mirrlees1971, author={Mirrlees, James A.}, title={An Exploration}, journal={RES}, year={1971}}\n@article{chetty2012, author={Chetty, Raj}, title={Bounds}, journal={Econometrica}, year={2012}}\n'
    load_doc(page, {'main.tex': DOC, 'refs.bib': bib})
    click_text(page, 'Agent income here.', 18)
    k.type(' See ')
    k.type('\\'); settle(page, 200); k.type('cite', delay=20); settle(page, 300); k.press('Enter')
    page.wait_for_selector('#pop-citesearch', timeout=5000); settle(page, 200)
    items = page.evaluate("[...document.querySelectorAll('.pop-cite .pitem')].map((b) => b.textContent)")
    check('cite: the picker offers the project\'s .bib the document does not name', any('Mirrlees' in x for x in items), items or page.evaluate("document.querySelector('.pop-cite').textContent"))
    k.type('mirr'); settle(page, 200); k.press('Enter'); settle(page, 400)
    k.press('Escape'); settle(page, 300)
    s = src(page)
    check('cite: the citation is written', 'See \\cite{mirrlees1971}' in s, s)
    check('cite: and the bibliography from refs.bib at the end', s.rstrip().endswith('\\bibliographystyle{plain}\n\\bibliography{refs}\n\\end{document}'), s[-120:])
    compiles(page, 'cite')
    if TEX:
        text = page.evaluate("async () => { const r = await window.rikuy.api.compile(); return r.problems.map((p) => p.message).join(' | '); }")
        check('cite: no undefined citation', 'undefined' not in text.lower(), text)
    # one Undo takes the bibliography lines and the key together
    k.press('Control+z'); settle(page, 300)
    s = src(page)
    check('cite: one Undo takes the key and the bibliography lines', '\\bibliography' not in s and 'mirrlees1971' not in s, s)


def paste(page):
    def put(text):
        page.evaluate("""(t) => { const dt = new DataTransfer(); dt.setData('text/plain', t);
          document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }""", text)
        settle(page, 400)
    load_doc(page, DOC)
    click_text(page, 'Agent income here.', 18)
    page.keyboard.type(' ')
    put('The rule τ* = 1/(1 + ε) is ﬁxed when p ≤ 0.3 − q.')
    s = src(page)
    check('paste: a PDF\'s ligature is its letters', 'fixed' in s and '\ufb01' not in s, s[40:160])
    check('paste: Greek and symbols as formulas pdfLaTeX sets', 'rule $\\tau$* = 1/(1 + $\\varepsilon$)' in s and '$\\le$ 0.3 $-$ q' in s, s[40:160])
    compiles(page, 'paste')
    # under XeLaTeX (fontspec) the characters stay as they are
    load_doc(page, DOC.replace('\\usepackage{amsmath}', '\\usepackage{amsmath}\n\\usepackage{fontspec}'))
    click_text(page, 'Agent income here.', 18)
    page.keyboard.type(' ')
    put('Rule τ ≤ ε, ﬁxed.')
    s = src(page)
    check('paste: a fontspec document keeps τ, ≤ and ε', 'Rule τ ≤ ε, fixed.' in s, s[40:200])


def split(page):
    k = page.keyboard
    doc = DOC.replace('Agent income here.', '\\begin{abstract}\nFirst para.\n\nSecond para.\n\nThird para.\n\\end{abstract}')
    load_doc(page, doc)
    click_text(page, 'Second para.', 3)
    k.press('Control+Alt+1'); settle(page, 300)
    s = src(page)
    check('split: Heading 1 on the middle paragraph of an abstract ends the abstract before it, the paragraphs after it leave it', '\\begin{abstract}\nFirst para.\n\\end{abstract}\n\n\\section{Second para.}\n\nThird para.\n\nSecond paragraph.' in s, s)
    k.type('X'); settle(page, 200)
    check('split: the caret stays in the words', '\\section{SecXond para.}' in src(page), src(page)[40:140])
    k.press('Control+z'); settle(page, 200); k.press('Control+z'); settle(page, 300)
    check('split: undo gives the source back byte for byte', src(page) == doc, src(page))
    click_text(page, 'Third para.', 1)
    k.press('Control+Alt+2'); settle(page, 300)
    check('split: on the last paragraph the abstract ends before it', '\\begin{abstract}\nFirst para.\n\nSecond para.\n\\end{abstract}\n\n\\subsection{Third para.}\n\nSecond paragraph.' in src(page), src(page))
    compiles(page, 'split')


def filename(page):
    k = page.keyboard
    page.get_by_text('New document', exact=True).click()
    # (the open project kept under Versions first, in IndexedDB: then the blank article, the caret in it)
    until(page, "() => window.rikuy.name.startsWith('Untitled') && !!window.rikuy.ghost")
    settle(page, 600)
    k.type('Optimal Taxation: a Note', delay=10)
    k.press('Control+Shift+S'); settle(page, 200); k.type('Title'); settle(page, 200); k.press('Enter'); settle(page, 400)
    check('filename: the project is still Untitled', page.evaluate("window.rikuy.name").startswith('Untitled'), page.evaluate("window.rikuy.name"))
    check('filename: downloads take the title', page.evaluate("window.rikuy.fileBase()") == 'Optimal Taxation a Note', page.evaluate("window.rikuy.fileBase()"))
    if TEX:
        with page.expect_download(timeout=90000) as d:
            from browser import download
            download(page, 'rb-pdf')
        check('filename: Download PDF is "Optimal Taxation a Note.pdf"', d.value.suggested_filename == 'Optimal Taxation a Note.pdf', d.value.suggested_filename)
    # a document of its own name keeps it
    page.evaluate("window.rikuy.name = 'My paper'")
    check('filename: a named document keeps its name', page.evaluate("window.rikuy.fileBase()") == 'My paper', page.evaluate("window.rikuy.fileBase()"))


def undo_words(page):
    k = page.keyboard
    doc = DOC
    load_doc(page, doc)
    click_text(page, 'Second paragraph.', 17)
    k.press('Enter'); k.press('Control+Alt+1'); k.type('Model', delay=15); k.press('Enter')
    k.type('Consider an economy.', delay=15); settle(page, 300)
    steps = []
    for _ in range(6):
        k.press('Control+z'); settle(page, 150); steps.append(src(page))
    want = ['Consider an \n', 'Consider \n', '\\section{Model}\n\\end', '\\section{}\n\\end', 'Second paragraph.\n\\end']
    check('undo_words: typing is undone word by word, the heading apart from the paragraph after it', all(w in steps[i] for i, w in enumerate(want)), [x[60:] for x in steps])
    check('undo_words: and back to the start byte for byte', steps[4] == doc, steps[4])


def enter(page):
    k = page.keyboard
    load_doc(page, DOC)
    click_text(page, 'Second paragraph.', 0)
    for _ in range(4): k.press('Enter')
    settle(page, 300)
    check('enter: Enter at a paragraph\'s start writes no blank lines', src(page) == DOC, src(page))
    check('enter: an empty paragraph shows above it', page.evaluate("!!document.querySelector('#pages .ghostp')"))
    k.type('Z'); settle(page, 300)
    check('enter: the caret stayed at the paragraph\'s start, as Word\'s', 'ZSecond paragraph.' in src(page), src(page))
    load_doc(page, DOC)
    click_text(page, 'Second paragraph.', 0)
    k.press('Enter'); k.press('ArrowUp'); k.type('New one.', delay=10); settle(page, 300)
    check('enter: Up types in the empty paragraph', 'Agent income here.\n\nNew one.\n\nSecond paragraph.' in src(page), src(page))
    load_doc(page, DOC)
    click_text(page, 'Second paragraph.', 7)
    for _ in range(3): k.press('Enter')
    settle(page, 300)
    check('enter: three Enters in a paragraph split it once', 'Second \n\nparagraph.' in src(page) and '\n\n\n' not in src(page), src(page))


def reload_undo(page):
    k = page.keyboard
    load_doc(page, DOC)
    page.evaluate("window.rikuy.persist()"); settle(page, 400)
    click_text(page, 'Agent income here.', 18)
    k.type(' More words.', delay=15); saved(page, 2500)
    before = src(page)
    reload(page); settle(page, 400)
    check('reload_undo: the text is back', src(page) == before, src(page))
    k.press('Control+z'); settle(page, 300)
    check('reload_undo: Undo after a reload takes the last word', 'More \n' in src(page) and 'words.' not in src(page), src(page))
    k.press('Control+y'); settle(page, 300)
    check('reload_undo: and Redo puts it back', src(page) == before, src(page))


def mathpkg(page):
    k = page.keyboard
    load_doc(page, DOC)
    click_text(page, 'Agent income here.', 18)
    k.type(' ')
    k.press('Control+m'); page.wait_for_selector('#pop-field', timeout=10000); settle(page, 200)
    k.press('Shift+Tab'); settle(page, 100)
    k.type('\\mathbb{R}^n'); settle(page, 300); k.press('Enter'); settle(page, 400)
    s = src(page)
    check('mathpkg: \\mathbb typed in the field brings amssymb', '\\usepackage{amssymb}' in s and '$\\mathbb{R}^n$' in s, s[:200])
    compiles(page, 'mathpkg field')
    load_doc(page, DOC)
    click_text(page, 'Agent income here.', 18)
    k.type(' ')
    html = '<p>Let <span class="katex"><span class="katex-mathml"><math><semantics><mrow></mrow><annotation encoding="application/x-tex">x \\in \\mathbb{R}^n</annotation></semantics></math></span></span> be given.</p>'
    page.evaluate("""(h) => { const dt = new DataTransfer(); dt.setData('text/plain', 'Let x be given.'); dt.setData('text/html', h);
      document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }""", html)
    settle(page, 500)
    s = src(page)
    check('mathpkg: \\mathbb pasted from a chat assistant brings amssymb', '\\usepackage{amssymb}' in s and 'Let $x \\in \\mathbb{R}^n$ be given.' in s, s[:200])
    compiles(page, 'mathpkg paste')
    k.press('Control+z'); settle(page, 300)
    check('mathpkg: one Undo takes the paste and its package', src(page) == DOC.replace('Agent income here.', 'Agent income here. '), src(page))


def intertext(page):
    doc = DOC.replace('Second paragraph.', '\\begin{align}\na &= b + c \\\\\n\\intertext{Taking first-order conditions, with $\\lambda>0$,}\nd &= e \\tag{FOC}\n\\end{align}\nAfter.')
    load_doc(page, doc)
    settle(page, 400)
    r = page.evaluate("""(() => { const d = document.querySelector('#pages .dm'); if (!d) return null; const t = d.querySelector('.intertext'), rows = d.querySelectorAll('.dm-rows');
      if (!t || rows.length !== 2) return { html: d.innerHTML.slice(0, 200) };
      const a = rows[0].getBoundingClientRect(), b = t.getBoundingClientRect(), c = rows[1].getBoundingClientRect(), page = document.querySelector('#pages .page .it').getBoundingClientRect();
      return { text: t.textContent, between: a.bottom <= b.top + 1 && b.bottom <= c.top + 1, left: Math.abs(b.left - page.left) < 3 }; })()""")
    check('intertext: drawn as a line of text between the rows, at the text\'s left edge', r and r.get('between') and r.get('left') and 'Taking first-order conditions, with' in r.get('text', ''), r)
    check('intertext: no formula error on the page', page.evaluate("document.querySelectorAll('#pages .has-err').length") == 0)
    compiles(page, 'intertext')


def envlist(page):
    k = page.keyboard
    doc = DOC.replace('\\usepackage{amsmath}', '\\usepackage{amsmath}\n\\usepackage{amsthm}\n\\newtheorem{definition}{Definition}').replace('Agent income here.', '\\begin{definition}\nA relation is rational if:\n\\end{definition}')
    load_doc(page, doc)
    click_text(page, 'rational if:', 12)
    k.press('Enter'); k.type('- ', delay=30); settle(page, 200); k.type('complete', delay=10); k.press('Enter'); k.type('transitive', delay=10); settle(page, 300)
    s = src(page)
    check('envlist: "- " in a definition starts a list in it', 'rational if:\n\n\\begin{itemize}\n  \\item complete\n  \\item transitive\n\\end{itemize}' in s and s.find('\\end{itemize}') < s.find('\\end{definition}'), s)
    compiles(page, 'envlist')


def replace(page):
    k = page.keyboard
    files = {'main.tex': '\\documentclass{article}\n\\begin{document}\nIntro on utility.\n\n\\input{ch1}\n\\end{document}\n',
             'ch1.tex': '\\section{Utility}\nUtility is ordinal. UTILITY matters; utility functions differ.\n'}
    load_doc(page, files)
    click_text(page, 'Intro on', 0)
    k.press('Control+h'); page.wait_for_selector('#fr-q', timeout=5000)
    page.fill('#fr-q', 'utility'); page.fill('#fr-r', 'welfare'); settle(page, 200)
    page.get_by_role('button', name='Replace All').click(); settle(page, 600)
    check('replace: Replace All without Match case keeps each one\'s case, in every file', src(page) == files['main.tex'].replace('utility', 'welfare') and src(page, 'ch1.tex') == '\\section{Welfare}\nWelfare is ordinal. WELFARE matters; welfare functions differ.\n', src(page, 'ch1.tex'))
    k.press('Escape'); settle(page, 200); k.press('Control+z'); settle(page, 300)
    check('replace: one Undo takes it all back', src(page) == files['main.tex'] and src(page, 'ch1.tex') == files['ch1.tex'], src(page, 'ch1.tex'))


def review(page):
    """The hostile review of PR 94 (E1 to E10)."""
    k = page.keyboard
    A = '@article{alpha2001, author={Alpha, Ann}, title={From A}, journal={J}, year={2001}}\n'
    Bb = '@article{beta2002, author={Beta, Ben}, title={From B}, journal={J}, year={2002}}\n'
    def cite(*keys):
        k.type('\\'); settle(page, 200); k.type('cite', delay=20); settle(page, 300); k.press('Enter')
        page.wait_for_selector('#pop-citesearch', timeout=5000); settle(page, 200)
        # (power-keys, POWER-USER.md 7: Enter cites and closes, Ctrl+Enter cites and stays for another)
        for i, q in enumerate(keys):
            k.type(q); settle(page, 200); k.press('Enter' if i == len(keys) - 1 else 'Control+Enter'); settle(page, 400)
        if page.evaluate('!!window.rikuy.pop'): k.press('Escape'); settle(page, 300)
    # E1: the main file in a folder: the .bib named from that folder, where TeX runs
    load_doc(page, {'paper/main.tex': DOC, 'paper/refs.bib': A}, main='paper/main.tex')
    click_text(page, 'Agent income here.', 18); k.type(' See ')
    cite('alpha')
    s = src(page, 'paper/main.tex')
    check('review E1: a .bib beside a main file in a folder is named from there', '\\bibliography{refs}' in s and 'paper/refs' not in s, s[-120:])
    compiles(page, 'review E1')
    # E2: a key from each of two .bib files the document names nowhere
    load_doc(page, {'main.tex': DOC, 'a.bib': A, 'b.bib': Bb})
    click_text(page, 'Agent income here.', 18); k.type(' See ')
    cite('alpha', 'beta')
    s = src(page)
    check('review E2: keys from two .bib files name both', '\\cite{alpha2001, beta2002}' in s and '\\bibliography{a,b}' in s, s[-160:])
    if TEX:
        text = page.evaluate("async () => { const r = await window.rikuy.api.compile(); return r.ok + ' ' + r.problems.map((p) => p.message).join(' | '); }")
        check('review E2: no undefined citation', text.startswith('true') and 'undefined' not in text.lower(), text)
    k.press('Control+z'); settle(page, 300)
    check('review E2: one Undo takes the keys and the bibliography lines (the empty \\cite the list wrote is a step before)', src(page) == DOC.replace('here.', 'here. See \\cite{}'), src(page))
    # E4: a \bibliography in an \input file: no second pair in main.tex
    load_doc(page, {'main.tex': DOC.replace('\\end{document}', '\\input{back}\n\\end{document}'), 'back.tex': '\\bibliographystyle{plain}\n\\bibliography{refs}\n', 'refs.bib': A, 'other.bib': Bb})
    click_text(page, 'Agent income here.', 18); k.type(' See ')
    cite('beta')
    s, back = src(page), src(page, 'back.tex')
    check('review E4: a key from another .bib joins the \\input file\'s \\bibliography, main.tex gets none', '\\bibliography' not in s and '\\bibliography{refs,other}' in back, (s[-100:], back))
    compiles(page, 'review E4')
    # E3: Tab at the end of an inline formula leaves it forward, with no error, the keys on the page
    load_doc(page, DOC)
    click_text(page, 'Agent income', 5); k.type(' ')
    k.press('Control+m'); page.wait_for_selector('#pop-field', timeout=10000); settle(page, 200)
    k.type('x'); settle(page, 100); k.press('Tab'); settle(page, 300)
    check('review E3: Tab at a formula\'s end leaves it, the keys on the page', not page.evaluate("!!document.querySelector('#pop-field')") and focus_id(page) == 'pages', focus_id(page))
    k.type('y'); settle(page, 300)
    check('review E3: what is typed next goes after it', 'Agent $x$y income' in src(page), src(page)[40:100])
    # E10: Shift+Right at a formula's end: the formula selected and one character after it
    load_doc(page, DOC)
    click_text(page, 'Agent income', 5); k.type(' ')
    k.press('Control+m'); page.wait_for_selector('#pop-field', timeout=10000); settle(page, 200)
    k.type('x'); settle(page, 100); k.press('Shift+ArrowRight'); settle(page, 400)
    sel = page.evaluate("(() => { const c = window.rikuy.caretNow(); return c ? [c.a, c.b, window.rikuy.files.get('main.tex').slice(c.a, c.b)] : null; })()")
    check('review E10: Shift+Right at a formula\'s end selects it and the next character', not page.evaluate("!!document.querySelector('#pop-field')") and sel and sel[2] == '$x$ ', sel)
    # E5: a heading after a quote inside a theorem goes to the top level
    pre = DOC.replace('\\usepackage{amsmath}', '\\usepackage{amsmath,amsthm}\n\\newtheorem{theorem}{Theorem}')
    load_doc(page, pre.replace('Agent income here.', '\\begin{theorem}\nClaim text.\n\\begin{quote}\nQuoted line.\n\\end{quote}\n\\end{theorem}'))
    click_text(page, 'Quoted line.', 12); k.press('Enter'); settle(page, 150)
    k.press('Control+Alt+1'); settle(page, 200); k.type('Next', delay=10); settle(page, 300)
    check('review E5: a heading after a quote inside a theorem goes after both', '\\end{quote}\n\\end{theorem}\n\n\\section{Next}' in src(page), src(page))
    # E9: Greek pasted where the preamble sets Greek up stays Greek; a prime is the formula's '
    def put(text):
        page.evaluate("""(t) => { const dt = new DataTransfer(); dt.setData('text/plain', t);
          document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }""", text)
        settle(page, 400)
    load_doc(page, DOC.replace('\\usepackage{amsmath}', '\\usepackage{amsmath}\n\\usepackage{textgreek}'))
    click_text(page, 'Agent income here.', 18); k.type(' ')
    put('Hence f′(x) > 0 and αβγ ≤ 1.')
    s = src(page)
    check('review E9: Greek stays where the preamble sets it up; a prime is $\'$', "f$'$(x) > 0 and αβγ $\\le$ 1." in s, s[40:200])
    # E8: Right out of a formula in a paragraph that runs right to left lands on its right side,
    # its logical start
    rtl = '\\documentclass{article}\n\\usepackage{fontspec}\n\\usepackage[bidi=basic]{babel}\n\\babelprovide[main,import]{arabic}\n\\babelfont{rm}{Amiri}\n\\begin{document}\n\u0627\u0644\u062f\u062e\u0644 $x$ \u0647\u0646\u0627.\n\\end{document}\n'
    load_doc(page, rtl); settle(page, 400)
    if page.evaluate("getComputedStyle(document.querySelector('#pages .it.p')).direction") == 'rtl':
        page.locator('#pages .it.p .katex').first.click(); page.wait_for_selector('#pop-field', timeout=10000); settle(page, 300)
        page.evaluate("(() => { const mf = document.getElementById('pop-field'); mf.focus(); mf.executeCommand('moveToMathfieldEnd'); })()")
        k.press('ArrowRight'); settle(page, 400); k.type('Q'); settle(page, 300)
        check('review E8: Right out of a formula in a right to left paragraph lands at its right, before it', 'Q$x$' in src(page), src(page)[-60:])


def pdf_text(page):
    import base64, io, pypdf
    b = page.evaluate('(async () => { const r = await window.rikuy.api.compile(); if (!r.pdf) return ""; let s = ""; const u = new Uint8Array(r.pdf); for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); })()')
    if not b:
        return ''
    return ' '.join(pg.extract_text() or '' for pg in pypdf.PdfReader(io.BytesIO(base64.b64decode(b))).pages)


def three(page, doc, name, want=()):
    """doc compiled in the page with pdfLaTeX, XeLaTeX and LuaLaTeX (dist/tex): no error, and each of
    want in the PDF's text (spaces aside), as the page draws it. Leaves the pdfLaTeX copy loaded."""
    if not TEX:
        return
    import base64, io, re, pypdf
    page.set_default_timeout(900000)
    for eng in ('xelatex', 'lualatex', 'pdflatex'):
        load_doc(page, ('% !TeX program = ' + eng + '\n' if eng != 'pdflatex' else '') + doc)
        r = page.evaluate("""async () => { const r = await window.rikuy.api.compile(); let s = ''; if (r.pdf) { const u = new Uint8Array(r.pdf); for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192)); }
          return { ok: r.ok, errs: r.problems.filter((p) => p.severity === 'error').map((p) => p.message).slice(0, 3), pdf: s ? btoa(s) : '' }; }""")
        text = ' '.join(pg.extract_text() or '' for pg in pypdf.PdfReader(io.BytesIO(base64.b64decode(r['pdf']))).pages) if r['pdf'] else ''
        flat = re.sub(r'\s+', '', text)
        miss = [w for w in want if re.sub(r'\s+', '', w) not in flat]
        check(name + ' (' + eng + '): compiles with no error' + (', the PDF reads ' + ' / '.join(want) if want else ''), r['ok'] and not r['errs'] and not miss, (r['errs'], miss, text[:200]))
    page.set_default_timeout(30000)


def review2(page):
    """The second hostile review of PR 94 (E11 to E18, and what it saw in passing)."""
    k = page.keyboard
    ghost = lambda: page.evaluate('!!window.rikuy.ghost')
    D = DOC.replace('Agent income here.', '\\section{Intro}\nFirst paragraph words.').replace('Second paragraph.', 'Second paragraph words.')
    # E11: Enter at a paragraph's start, then Backspace: the empty paragraph goes, nothing else
    load_doc(page, D)
    click_text(page, 'Second paragraph words.', 0)
    k.press('Enter'); settle(page, 200); k.press('Backspace'); settle(page, 300)
    check('review E11: Enter then Backspace at a paragraph\'s start gives back what was there', src(page) == D and not ghost(), src(page)[-90:])
    k.type('Z'); settle(page, 300)
    check('review E11: and the caret is where it was', 'ZSecond paragraph words.' in src(page), src(page)[-90:])
    load_doc(page, D)
    click_text(page, 'Second paragraph words.', 0)
    k.press('Enter'); settle(page, 200); k.press('ArrowUp'); settle(page, 200); k.press('Delete'); settle(page, 300)
    check('review E11: Delete in that empty paragraph takes it away', src(page) == D and not ghost(), src(page)[-90:])
    k.type('Y'); settle(page, 300)
    check('review E11: the caret then at the paragraph\'s start', 'YSecond paragraph words.' in src(page), src(page)[-90:])
    # E12: Undo after that Enter takes the empty paragraph, not the edit before it
    load_doc(page, D)
    click_text(page, 'First paragraph words.', 22); k.type(' Extra', delay=15); settle(page, 300)
    typed = src(page)
    click_text(page, 'Second paragraph words.', 0)
    k.press('Enter'); settle(page, 200); k.press('Control+z'); settle(page, 300)
    check('review E12: Ctrl+Z after Enter takes the empty paragraph alone', src(page) == typed and not ghost(), src(page)[-90:])
    k.press('Control+z'); settle(page, 300)
    check('review E12: the next Ctrl+Z takes the typing', src(page) == D, src(page)[-90:])
    # E18: a \noindent and a comment line stand with the paragraph below them
    Dn = D.replace('Second paragraph', '\\noindent Second paragraph')
    load_doc(page, Dn)
    click_text(page, 'Second paragraph words.', 0)
    for _ in range(2): k.press('Enter')
    settle(page, 300)
    check('review E18: Enter at a \\noindent paragraph\'s start writes nothing', src(page) == Dn and ghost(), src(page)[-90:])
    k.press('ArrowUp'); k.type('New.', delay=10); settle(page, 300)
    check('review E18: typed above, the new paragraph goes before the \\noindent', 'words.\n\nNew.\n\n\\noindent Second paragraph words.' in src(page), src(page)[-90:])
    Dc = D.replace('\nSecond paragraph', '\n% a note\nSecond paragraph')
    load_doc(page, Dc)
    click_text(page, 'Second paragraph words.', 0)
    for _ in range(2): k.press('Enter')
    settle(page, 300)
    check('review E18: Enter after a comment line writes nothing', src(page) == Dc and ghost(), src(page)[-90:])
    k.press('ArrowUp'); k.type('New.', delay=10); settle(page, 300)
    check('review E18: typed above, the new paragraph goes before the comment', 'words.\n\nNew.\n\n% a note\nSecond paragraph words.' in src(page), src(page)[-90:])
    # E13: a heading in an abstract ends it before the heading (no second "Abstract"); none in a
    # theorem or a proof
    Da = DOC.replace('Agent income here.', '\\begin{abstract}\nWe study taxes.\n\nResults follow here.\n\nPolicy implications end it.\n\\end{abstract}')
    load_doc(page, Da)
    click_text(page, 'Results follow here.', 3)
    k.press('Control+Alt+1'); settle(page, 300)
    check('review E13: a heading in an abstract: the paragraphs after it leave the abstract', '\\begin{abstract}\nWe study taxes.\n\\end{abstract}\n\n\\section{Results follow here.}\n\nPolicy implications end it.\n\nSecond paragraph.' in src(page), src(page))
    if TEX:
        t = pdf_text(page)
        check('review E13: the PDF titles the abstract once', t.count('Abstract') == 1 and 'Policy implications' in t, t[:300])
    Dt = DOC.replace('\\usepackage{amsmath}', '\\usepackage{amsmath,amsthm}\n\\newtheorem{theorem}{Theorem}').replace('Agent income here.', '\\begin{theorem}\nFirst claim words.\n\nMiddle claim words.\n\nLast claim words.\n\\end{theorem}\n\n\\begin{proof}\nStep one argued.\n\nStep two argued.\n\nStep three argued.\n\\end{proof}')
    load_doc(page, Dt)
    for words, name in (('Middle claim words.', 'theorem'), ('Step two argued.', 'proof')):
        click_text(page, words, 3)
        k.press('Control+Alt+1'); settle(page, 300)
        why = page.evaluate("(() => { const st = window.rikuy.blockStyle(window.rikuy.ribbonAt()); return window.rikuy.whyNot(st, window.rikuy.styleCatalog().levels[0]); })()")
        check('review E13: no heading inside a ' + name + ', and the reason says why', src(page) == Dt and 'cannot stand inside' in why, (why, src(page)[-200:]))
    # E14: a file opened over one of its name is a step; a step that does not fit the text is not applied
    files = {'main.tex': DOC.replace('Second paragraph.', '\\input{ch1}\n\nLast paragraph.'), 'ch1.tex': 'Chapter one text is here.\n'}
    load_doc(page, files)
    page.evaluate('window.rikuy.persist()'); settle(page, 300)
    click_text(page, 'Chapter one text is here.', 7)
    k.type(' ALPHA BETA', delay=15); settle(page, 400)
    typed = src(page, 'ch1.tex')
    NEW = 'A completely different chapter, rewritten by a coauthor and sent by mail.\n'
    page.evaluate("async (t) => { await window.rikuy.openFiles([new File([t], 'ch1.tex', { type: 'text/plain' })]); }", NEW)
    settle(page, 800)
    page.evaluate('window.rikuy.persist()'); saved(page, 600)
    reload(page); settle(page, 400)
    check('review E14: the coauthor\'s file is open after a reload', src(page, 'ch1.tex') == NEW, src(page, 'ch1.tex'))
    click_text(page, 'Last paragraph.', 4)
    k.press('Control+z'); settle(page, 400)
    check('review E14: Ctrl+Z after a reload takes the opened file back, whole', src(page, 'ch1.tex') == typed, src(page, 'ch1.tex'))
    k.press('Control+y'); settle(page, 400)
    check('review E14: and Ctrl+Y opens it again', src(page, 'ch1.tex') == NEW, src(page, 'ch1.tex'))
    # (a text changed outside the history: no step is applied to it)
    page.evaluate("window.rikuy.files.set('ch1.tex', 'Short.\\n')")
    k.press('Control+z'); settle(page, 400)
    check('review E14: a step that does not fit the text is not applied, and the history goes', src(page, 'ch1.tex') == 'Short.\n' and page.evaluate('window.rikuy.hist.length + window.rikuy.redoStack.length') == 0, src(page, 'ch1.tex'))
    # E15: a .bib whose name has a space joins under a name BibTeX reads
    A = '@article{alpha2001, author={Alpha, Ann}, title={From A}, journal={J}, year={2001}}\n'
    load_doc(page, DOC)
    page.evaluate("async (t) => { await window.rikuy.openFiles([new File([t], 'My Library.bib', { type: 'text/plain' })]); }", A)
    settle(page, 600)
    names = page.evaluate('[...window.rikuy.files.keys()]')
    check('review E15: "My Library.bib" joins as My-Library.bib', 'My-Library.bib' in names and 'My Library.bib' not in names, names)
    click_text(page, 'Agent income here.', 18); k.type(' See ')
    k.type('\\'); settle(page, 200); k.type('cite', delay=20); settle(page, 300); k.press('Enter')
    page.wait_for_selector('#pop-citesearch', timeout=5000); settle(page, 200)
    k.type('alpha'); settle(page, 200); k.press('Enter'); settle(page, 400); k.press('Escape'); settle(page, 300)
    check('review E15: the bibliography names it as BibTeX reads it', '\\bibliography{My-Library}' in src(page), src(page)[-120:])
    if TEX:
        text = page.evaluate("async () => { const r = await window.rikuy.api.compile(); return r.ok + ' ' + r.problems.map((p) => p.message).join(' | '); }")
        check('review E15: compiled in the page, no undefined citation', text.startswith('true') and 'undefined' not in text.lower() and 'database' not in text.lower(), text)
    # E16: a beamer talk beside the paper is no part of it
    Bb = '@article{beta2002, author={Beta, Ben}, title={From B}, journal={J}, year={2002}}\n'
    slides = '\\documentclass{beamer}\n\\begin{document}\n\\begin{frame}Talk \\cite{beta2002}.\\end{frame}\n\\bibliographystyle{unsrt}\n\\bibliography{talkrefs}\n\\end{document}\n'
    load_doc(page, {'main.tex': DOC, 'slides.tex': slides, 'refs.bib': A, 'talkrefs.bib': Bb})
    click_text(page, 'Agent income here.', 18); k.type(' See ')
    k.type('\\'); settle(page, 200); k.type('cite', delay=20); settle(page, 300); k.press('Enter')
    page.wait_for_selector('#pop-citesearch', timeout=5000); settle(page, 200)
    k.type('alpha'); settle(page, 200); k.press('Enter'); settle(page, 400); k.press('Escape'); settle(page, 300)
    check('review E16: the citation\'s bibliography goes into the paper, the talk is untouched', '\\bibliography{refs}' in src(page) and src(page, 'slides.tex') == slides, (src(page)[-120:], src(page, 'slides.tex')[-60:]))
    if TEX:
        text = page.evaluate("async () => { const r = await window.rikuy.api.compile(); return r.ok + ' ' + r.problems.map((p) => p.message).join(' | '); }")
        check('review E16: compiled, no undefined citation', text.startswith('true') and 'undefined' not in text.lower(), text)
    # E17: download names keep the title's letters
    page.evaluate("window.rikuy.name = 'Política Económica: Teoría y Evidencia'")
    check('review E17: a download name keeps accented letters, only a file system\'s forbidden signs go', page.evaluate('window.rikuy.fileBase()') == 'Política Económica Teoría y Evidencia', page.evaluate('window.rikuy.fileBase()'))
    page.evaluate("window.rikuy.name = '経済学の論文/草稿'")
    check('review E17: and a title in Chinese or Japanese', page.evaluate('window.rikuy.fileBase()') == '経済学の論文 草稿', page.evaluate('window.rikuy.fileBase()'))
    # in passing: Ctrl+B, "bold", Ctrl+B, " after": the bold ends for what is typed next
    load_doc(page, DOC)
    click_text(page, 'Agent income here.', 12)
    k.type(' ', delay=15); k.press('Control+b'); k.type('bold', delay=15); k.press('Control+b'); k.type(' after', delay=15); settle(page, 300)
    check('review: Ctrl+B again at the end of bold words ends the bold for what follows', 'Agent income \\textbf{bold} after here.' in src(page), src(page)[40:120])
    # not verified before: Undo's steps kept across a reload are at most 2 MB, and written only when they change
    load_doc(page, DOC)
    page.evaluate("(() => { const big = 'x'.repeat(300000); for (let i = 0; i < 6; i++) window.rikuy.commit([{ f: 'main.tex', s: 0, e: 0, t: big + i }], null, 'api'), window.rikuy.closeGroup(); })()")
    size = page.evaluate("(() => { const h = window.rikuy.historyKept({ t: 1, name: 'n', main: 'main.tex' }); return JSON.stringify(h).length * 2; })()")
    check('review: the steps kept across a reload are at most 2 MB', 1e6 < size <= 2e6, size)
    page.evaluate('window.rikuy.persist()'); settle(page, 500)
    t0 = page.evaluate("new Promise((ok) => { const q = indexedDB.open('galley'); q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get('history'); g.onsuccess = () => ok(g.result && g.result.t); }; })")
    page.evaluate('window.rikuy.persist()'); settle(page, 500)
    t1 = page.evaluate("new Promise((ok) => { const q = indexedDB.open('galley'); q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get('history'); g.onsuccess = () => ok(g.result && g.result.t); }; })")
    # (the detail: how far apart the two writes' times are, 0 when there was one write; the times
    # themselves change from run to run)
    check('review: a save with the same steps does not write them again', t0 and t0 == t1, (t1 - t0) if t0 and t1 else (t0, t1))
    # not verified before: \intertext keeps the rows' = signs on one column
    load_doc(page, DOC.replace('Second paragraph.', '\\begin{align}\na &= b + c + d + e + f \\\\\n\\intertext{Taking first-order conditions,}\ndddddddd + e &= e\n\\end{align}\nAfter.'))
    settle(page, 400)
    xs = page.evaluate("[...document.querySelectorAll('#pages .dm .dm-rows .mtable > .col-align-l')].map((l) => l.getBoundingClientRect().left)")
    check('review: the rows after \\intertext line their = up with those before', len(xs) == 2 and abs(xs[0] - xs[1]) < 1, xs)



def review3(page):
    """The verification of PR 94 (V1 to V9, and two older bugs it met on main), each failing on 119e23f."""
    k = page.keyboard
    ghost = lambda: page.evaluate('!!window.rikuy.ghost')
    D = DOC.replace('Agent income here.', '\\section{Intro}\nFirst paragraph words.').replace('Second paragraph.', 'Second paragraph words.\n\nThird paragraph words.')
    def at2():
        load_doc(page, D)
        click_text(page, 'Second paragraph words.', 0)
    # V1: a heading on the first paragraph of an abstract of several: the abstract goes on after it
    Da = DOC.replace('Agent income here.', '\\begin{abstract}\nFirst abs words.\n\nSecond abs words.\n\nThird abs words.\n\\end{abstract}')
    load_doc(page, Da)
    click_text(page, 'First abs words.', 3)
    k.press('Control+Alt+1'); settle(page, 300)
    check('review3 V1: a heading on an abstract\'s first paragraph keeps the rest in the abstract', '\\section{First abs words.}\n\n\\begin{abstract}\nSecond abs words.\n\nThird abs words.\n\\end{abstract}' in src(page), src(page))
    if TEX:
        t = pdf_text(page)
        check('review3 V1: the PDF titles the abstract once', t.count('Abstract') == 1 and 'Third abs words' in t, t[:300])
    # V2: one empty paragraph per Enter at a paragraph's start; Backspace and Undo take one each
    at2()
    k.press('Enter'); k.press('Enter'); settle(page, 200)
    check('review3 V2: two Enters at a paragraph\'s start write nothing', src(page) == D and ghost(), src(page)[-90:])
    k.press('Backspace'); settle(page, 300)
    check('review3 V2: the first Backspace takes one empty paragraph, one stays', src(page) == D and ghost(), src(page)[-90:])
    k.press('Backspace'); settle(page, 300)
    check('review3 V2: the second takes the other, and joins nothing', src(page) == D and not ghost(), src(page)[-90:])
    k.type('Z'); settle(page, 300)
    check('review3 V2: the caret is where it was', 'ZSecond paragraph words.' in src(page), src(page)[-90:])
    at2()
    k.type('Z'); settle(page, 300); k.press('ArrowLeft'); settle(page, 100)
    typed = src(page)
    k.press('Enter'); k.press('Enter'); settle(page, 200)
    k.press('Control+z'); settle(page, 300); k.press('Control+z'); settle(page, 300)
    check('review3 V2: two Ctrl+Z after two Enters take the two empty paragraphs, not the typing', src(page) == typed and not ghost(), src(page)[-90:])
    k.press('Control+z'); settle(page, 300)
    check('review3 V2: the third takes the typing', src(page) == D, src(page)[-90:])
    # V3: Shift+Left or Shift+Up after that Enter selects the empty paragraph; Backspace takes it alone
    for key in ('Shift+ArrowLeft', 'Shift+ArrowUp'):
        at2()
        k.press('Enter'); settle(page, 200); k.press(key); settle(page, 200)
        check('review3 V3: ' + key + ' after Enter keeps the empty paragraph', ghost(), src(page)[-90:])
        k.press('Backspace'); settle(page, 300)
        check('review3 V3: ' + key + ', Backspace: only the empty paragraph goes', src(page) == D and not ghost(), src(page)[-90:])
        k.type('Y'); settle(page, 300)
        check('review3 V3: ' + key + ', Backspace: the caret at the paragraph\'s start', 'YSecond paragraph words.' in src(page), src(page)[-90:])
    at2()
    k.press('Enter'); settle(page, 200); k.press('Shift+ArrowLeft'); settle(page, 200); k.type('X'); settle(page, 300)
    check('review3 V3: typed over the empty paragraph\'s mark, the letter starts the paragraph', 'words.\n\nXSecond paragraph words.' in src(page) and not ghost(), src(page)[-90:])
    # V8: Enter, Up, a letter, two Backspaces give back what was there
    at2()
    k.press('Enter'); settle(page, 200); k.press('ArrowUp'); settle(page, 200)
    k.type('x'); settle(page, 300); k.press('Backspace'); settle(page, 300); k.press('Backspace'); settle(page, 300)
    check('review3 V8: Enter, Up, x, Backspace twice: the source as it was, no space left', src(page) == D, src(page)[-90:])
    k.type('Y'); settle(page, 300)
    check('review3 V8: the caret at the end of the paragraph above', 'First paragraph words.Y\n\n' in src(page), src(page)[-90:])
    # V9: that Enter is an action: nothing is left to redo
    load_doc(page, D)
    click_text(page, 'Third paragraph words.', 22); k.type(' Q'); settle(page, 300)
    k.press('Control+z'); settle(page, 300)
    click_text(page, 'Second paragraph words.', 0); k.press('Enter'); settle(page, 200)
    k.press('Control+y'); settle(page, 300)
    check('review3 V9: Ctrl+Y after Enter at a paragraph\'s start redoes nothing undone before it', src(page) == D, src(page)[-90:])
    # (main too) Backspace at the start of a \noindent paragraph after a comment line joins with a space
    Dn = D.replace('\nSecond paragraph', '\n% note\n\\noindent Second paragraph')
    load_doc(page, Dn)
    click_text(page, 'Second paragraph words.', 0)
    k.press('Backspace'); settle(page, 300)
    check('review3: Backspace at a \\noindent paragraph\'s start after a comment keeps the comment and a space', 'First paragraph words.\n% note\nSecond paragraph words.' in src(page), src(page)[-110:])
    # V4: Ctrl+B at the end of \textbf{\emph{bold}} ends the bold for what is typed next, the italic going on
    Db = DOC.replace('Agent income here.', 'Plain \\textbf{\\emph{bold}} after.')
    load_doc(page, Db)
    page.evaluate("(p) => window.rikuy.restoreCaret({ f: 'main.tex', p, bias: -1 })", Db.index('bold}}') + 4); settle(page, 200)
    k.press('Control+b'); settle(page, 250); k.type('X'); settle(page, 400)
    check('review3 V4: Ctrl+B at the end of a nested bold keeps the word bold; X goes on in italic', 'Plain \\textbf{\\emph{bold}}\\emph{X} after.' in src(page), src(page)[60:140])
    # V5: two .bib files whose names come to the same safe name: the second gets a free one
    load_doc(page, DOC)
    openf = lambda name, text: page.evaluate("async ([n, t]) => { await window.rikuy.openFiles([new File([t], n, { type: 'text/plain' })]); }", [name, text])
    A = '@article{alpha2001, author={Alpha, Ann}, title={From A}, journal={J}, year={2001}}\n'
    B = '@article{beta2002, author={Beta, Ben}, title={From B}, journal={J}, year={2002}}\n'
    openf('My Library.bib', A); settle(page, 500)
    openf('My  Library.bib', B); settle(page, 500)
    files = page.evaluate('Object.fromEntries([...window.rikuy.files].filter(([n]) => n.endsWith(".bib")))')
    check('review3 V5: a second .bib coming to the same safe name joins under a free one', files.get('My-Library.bib') == A and files.get('My-Library-2.bib') == B, list(files))
    A2 = A + '@book{gamma2003, author={Gamma, G}, title={C}, publisher={P}, year={2003}}\n'
    openf('My Library.bib', A2); settle(page, 500)
    files = page.evaluate('Object.fromEntries([...window.rikuy.files].filter(([n]) => n.endsWith(".bib")))')
    toast = page.inner_text('#toast')
    check('review3 V5: the first opened again replaces the file it joined as, and says so', files.get('My-Library.bib') == A2 and files.get('My-Library-2.bib') == B and len(files) == 2 and 'replaced' in toast, (list(files), toast[:160]))
    # V7: download names: no marks that turn or join text unseen, no Windows device name, at most 200 bytes
    for name, want in (('Report\u202egnp.exe\u200b', 'Reportgnp.exe'), ('CON', 'CON_'), ('nul.draft', 'nul_.draft'), ('Lpt9', 'Lpt9_'), ('Console', 'Console')):
        page.evaluate('(n) => { window.rikuy.name = n; }', name)
        got = page.evaluate('window.rikuy.fileBase()')
        check('review3 V7: download name of ' + repr(name), got == want, got)
    page.evaluate("window.rikuy.name = '経'.repeat(100)")
    got = page.evaluate('window.rikuy.fileBase()')
    check('review3 V7: a long name in Chinese is cut at 200 bytes of UTF-8, between characters', got == '経' * 66, (len(got), len(got.encode())))
    # (main too) a one-paragraph proof made a heading leaves its \qedhere behind
    Dq = DOC.replace('\\usepackage{amsmath}', '\\usepackage{amsmath,amsthm}').replace('Agent income here.', '\\begin{proof}\nOnly plain step. \\qedhere\n\\end{proof}')
    load_doc(page, Dq)
    click_text(page, 'Only plain step.', 3)
    k.press('Control+Alt+1'); settle(page, 300)
    check('review3: a proof made a heading leaves \\qedhere behind', '\\section{Only plain step.}\n\nSecond paragraph.' in src(page) and 'qedhere' not in src(page), src(page)[-120:])
    compiles(page, 'review3 qedhere')


def real(page):
    """Round 4: real documents of the corpus, edited as a Word user does, then compiled."""
    k = page.keyboard
    # Enter in the words of \question{..}, a command of the document's own: its braces close
    # before the break and open again after it, as a format's do; at its end the new paragraph is
    # after it. A blank line went inside, and TeX stopped ("Paragraph ended before \@ssect")
    D = DOC.replace('\\usepackage{amsmath}', '\\usepackage{amsmath}\n\\newcommand{\\question}[1]{\\subsection*{#1}}').replace('Agent income here.', '\\question{\\bf Wie haben Sie gelernt?}')
    load_doc(page, D)
    click_text(page, 'Wie haben', 9); k.press('Enter'); settle(page, 200); k.type('Q')
    settle(page, 200)
    check('real: Enter in a command of its own closes and opens it again round the break', '\\question{\\bf Wie haben}\n\n\\question{\\bf Q Sie gelernt?}' in src(page), src(page)[-120:])
    three(page, src(page), 'real question split')
    load_doc(page, D)
    click_text(page, 'gelernt?', 8); k.press('Enter'); settle(page, 200); k.type('After')
    settle(page, 200)
    # (its words' bold goes on in the new paragraph, as Word's formats do)
    check('real: Enter at the end of its words starts a paragraph after it', '\\question{\\bf Wie haben Sie gelernt?}\n\n{\\bf After}' in src(page), src(page)[-120:])
    three(page, src(page), 'real question end')
    # (review B1) a group after an argument is a group, which holds the break: the command before it
    # was copied into the new paragraph, \textbf{Keywords:} printed twice, \LaTeX{} twice
    for body, at, want in (('Intro words. \\textbf{Keywords:} {\\small alpha beta gamma} end.', 'beta', '{\\small alpha \n\nQbeta gamma} end.'),
                           ('We use \\LaTeX{} {\\it for typesetting long documents} here.', 'typesetting', '\\LaTeX{} {\\it for \n\nQtypesetting long'),
                           ('Start \\textcolor{red}{Warning} {\\bf read this carefully now} end.', 'carefully', '{Warning} {\\bf read this \n\nQcarefully now}')):
        load_doc(page, DOC.replace('\\usepackage{amsmath}', '\\usepackage{amsmath,xcolor}').replace('Agent income here.', body))
        click_text(page, at, 0); k.press('Enter'); settle(page, 200); k.type('Q'); settle(page, 200)
        check('real: Enter in a group after ' + body.split('{')[0].split()[-1] + ' keeps the group, the command once', want in src(page) and src(page).count(body.split('{')[0].split()[-1]) == 1, src(page)[-140:])
        three(page, src(page), 'real group after ' + body.split('{')[0].split()[-1], ('Qbeta' if 'beta' in want else 'Qtypesetting' if 'typesetting' in want else 'Qcarefully',))
    # (review B2) Enter in a minipage inside a command of the document's own: the break stays in the
    # minipage; the command was split between \begin and \end, and TeX stopped
    Db = DOC.replace('\\usepackage{amsmath}', '\\usepackage{amsmath}\n\\newcommand{\\mybox}[1]{\\fbox{#1}}').replace('Agent income here.', '\\mybox{\\begin{minipage}{5cm}\nFirst words of the box and more.\n\\end{minipage}}')
    load_doc(page, Db)
    click_text(page, 'box and', 0); k.press('Enter'); settle(page, 200); k.type('Q'); settle(page, 200)
    check('real: Enter in a minipage inside \\mybox{..} keeps the break in the minipage', 'First words of the \n\nQbox and more.\n\\end{minipage}}' in src(page) and src(page).count('\\mybox{') == 1, src(page)[-160:])
    three(page, src(page), 'real minipage in a command', ('First words of the', 'Qbox and more.'))
    # (review N1) a \long command of the document's own whose words reach no other command takes
    # paragraphs: one exercise of two paragraphs, not two exercises
    load_doc(page, DOC.replace('\\usepackage{amsmath}', '\\usepackage{amsmath}\n\\newcounter{ex}\n\\newcommand{\\exercise}[1]{\\refstepcounter{ex}\\par\\noindent\\textbf{Exercise \\theex.} #1}').replace('Agent income here.', '\\exercise{Prove the first claim and then the second}'))
    click_text(page, 'and then', 0); k.press('Enter'); settle(page, 200); k.type('Q'); settle(page, 200)
    check('real: Enter in \\exercise{..} (#1 at its top) writes the paragraph inside it', '\\exercise{Prove the first claim \n\nQand then the second}' in src(page), src(page)[-120:])
    three(page, src(page), 'real long command', ('Exercise 1. Prove the first claim', 'Qand then the second'))
    # Enter at the end of a list item in a group: the new \item after the group, not in it,
    # where the page drew it as the text "\item"
    load_doc(page, DOC.replace('Agent income here.', '\\begin{enumerate}\n\\item {\\textbf{First}}\n\\item {\\bf Second}\n\\end{enumerate}'))
    click_text(page, 'Second', 6); k.press('Enter'); settle(page, 200); k.type('Third')
    settle(page, 200)
    check('real: Enter at the end of an item in braces writes the new \\item after them', '\\item {\\bf Second}\n\\item Third\n\\end{enumerate}' in src(page), src(page)[-120:])
    check('real: and the page draws it as an item', page.evaluate("[...document.querySelectorAll('#pages .it')].some((e) => e.dataset.li && e.textContent.trim().endsWith('Third') && !e.textContent.includes('\\\\item'))"))
    three(page, src(page), 'real item group')
    # Enter in the middle of a caption outside a float (\captionof) or a letter's \closing writes
    # nothing, as in a figure's caption: closed and opened again round the break it printed twice
    load_doc(page, DOC.replace('\\usepackage{amsmath}', '\\usepackage{amsmath,caption}').replace('Agent income here.', 'Text.\n\n\\begin{center}\n\\captionof{figure}{Stone with names and years.}\n\\end{center}'))
    before = src(page)
    click_text(page, 'names and', 5); k.press('Enter'); settle(page, 200); k.type('Q')
    settle(page, 200)
    check('real: Enter inside \\captionof{..} writes no second caption', src(page) == before.replace('names and', 'namesQ and'), src(page)[-160:])
    # (review N2, N9) Enter in a letter's \closing is a line in it, \\: it wrote a blank line inside,
    # which TeX refuses, and then a second \closing
    load_doc(page, '\\documentclass{letter}\n\\signature{Pedro}\n\\begin{document}\n\\begin{letter}{Firm\\\\Town}\n\\opening{Dear Sir,}\nBody text here.\n\\closing{Kind regards, yours}\n\\end{letter}\n\\end{document}\n')
    click_text(page, 'regards,', 8); k.press('Enter'); settle(page, 200); k.type('Q'); settle(page, 200)
    check('real: Enter in \\closing{..} writes a line break in it', '\\closing{Kind regards,\\\\\nQ yours}' in src(page), src(page)[-120:])
    three(page, src(page), 'real closing', ('Kind regards,', 'Q yours'))
    # and in the middle of an environment's own title, \begin{definition}{Title} (a frame of the
    # document's own): a blank line went inside it, and TeX stopped ("Paragraph ended before \@textcolor")
    D2 = DOC.replace('\\usepackage{amsmath}', '\\usepackage{amsmath}\n\\newenvironment{definition}[1]{\\par\\textcolor{black}{\\textbf{#1}}\\par}{\\par}\n\\usepackage{xcolor}').replace('Agent income here.', '\\begin{definition}{Rekurrentes Neuronale Netz}\nEin RNN ist.\n\\end{definition}')
    load_doc(page, D2)
    before = src(page)
    click_text(page, 'Neuronale Netz', 9); k.press('Enter'); settle(page, 200); k.type('Q')
    settle(page, 200)
    check('real: Enter inside an environment\'s title writes no blank line in it', src(page) == before.replace('Neuronale Netz', 'NeuronaleQ Netz'), src(page)[-160:])
    three(page, src(page), 'real environment title')
    # the algorithm package's float, as TeX sets it (review B5): ruled by default, the caption first
    # between rules, "Algorithm 1" in bold then a space, wherever \caption stands; plain, "Algorithm 1:"
    # last; numbered within the section by [section]; a \ref to it numbered; its algorithmic drawn
    # in it. Enter inside the caption writes nothing (as in a figure's), where it wrote a blank
    # line in \caption and TeX stopped
    alg = lambda opt: DOC.replace('\\usepackage{amsmath}', '\\usepackage{amsmath}\n\\usepackage' + opt + '{algorithm}\n\\usepackage{algpseudocode}').replace('Agent income here.', '\\section{Intro}\nSee Algorithm~\\ref{alg:a}.\n\n\\begin{algorithm}\n\\begin{algorithmic}\n\\State $s \\gets 0$\n\\end{algorithmic}\n\\caption{Solve the problem}\\label{alg:a}\n\\end{algorithm}')
    for opt, cap, first in (('', 'Algorithm 1 Solve the problem', True), ('[section]', 'Algorithm 1.1 Solve the problem', True), ('[plain]', 'Algorithm 1: Solve the problem', False)):
        load_doc(page, alg(opt))
        txt = page.evaluate("document.getElementById('pages').innerText").replace('\u00a0', ' ')
        num = cap.split()[1].rstrip(':')
        order = txt.find(cap) >= 0 and txt.find('\\State') >= 0 and (txt.find(cap) < txt.find('\\State')) == first
        check('real: algorithm' + opt + ' drawn "' + cap + '" ' + ('above' if first else 'below') + ' its lines, "See Algorithm ' + num + '."', order and 'See Algorithm ' + num + '.' in txt, txt[:300])
        if TEX:
            three(page, alg(opt), 'real algorithm' + opt, ('See Algorithm ' + num + '.', cap.replace(' Solve', 'Solve') if first else cap.replace(': ', ':')))
            r = pdf_text(page).replace('\n', ' ')
            check('real: and TeX prints it ' + ('above' if first else 'below') + ' the lines (pdfLaTeX)', (r.find('Solve the problem') < r.find('s\u2190')) == first, r[:200])
    # (review N8) algorithm2e's float, ruled: "Algorithm 1:" in bold, first
    D2e = DOC.replace('\\usepackage{amsmath}', '\\usepackage{amsmath}\n\\usepackage[ruled]{algorithm2e}').replace('Agent income here.', 'See Algorithm~\\ref{alg:b}.\n\n\\begin{algorithm}\n$s \\gets 0$\\;\n\\caption{Solve it}\\label{alg:b}\n\\end{algorithm}')
    load_doc(page, D2e)
    txt = page.evaluate("document.getElementById('pages').innerText").replace('\u00a0', ' ')
    check('real: algorithm2e\'s ruled float drawn "Algorithm 1: Solve it" first, "See Algorithm 1."', 'See Algorithm 1.' in txt and 0 <= txt.find('Algorithm 1: Solve it') < txt.find('s\u2190'), txt[:200])
    three(page, D2e, 'real algorithm2e', ('See Algorithm 1.', 'Algorithm 1:Solve it'))
    load_doc(page, alg(''))
    before = src(page)
    click_text(page, 'Solve the', 5); k.press('Enter'); settle(page, 200); k.type('X')
    settle(page, 200)
    check('real: Enter inside an algorithm\'s caption writes no blank line in it', '\\caption{SolveX the problem}' in src(page) and src(page).replace('SolveX', 'Solve') == before, src(page)[-160:])
    three(page, src(page), 'real algorithm')
    # \ac{KDE} and \Gls{slp}: an entry's key, drawn as a field; a word typed after it goes after
    # its braces. It went into the key, and TeX stopped ("Glossary entry `slp Zq' has not been defined")
    load_doc(page, DOC.replace('\\usepackage{amsmath}', '\\usepackage{amsmath}\n\\usepackage{acronym}\n\\usepackage{glossaries}\n\\newacronym{slp}{SLP}{single-layer perceptron}\n\\makeglossaries').replace('Agent income here.', 'Convallis \\ac{KDE} nec a erat. Egestas \\Gls{slp} Mauris.\n\n\\begin{acronym}\n\\acro{KDE}{K Desktop Environment}\n\\end{acronym}'))
    for i in range(2):
        page.evaluate("""(i) => { const a = [...document.querySelectorAll('#pages .atom')].filter((x) => /^(KDE|slp)$/.test(x.textContent))[i]; const r = document.createRange(); r.setStartAfter(a); r.collapse(true);
          const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.getElementById('pages').focus(); }""", i)
        settle(page, 100); k.type('Zq'); settle(page, 200)
    check('real: a word typed after \\ac{..} or \\Gls{..} goes after its braces, not into its key', '\\ac{KDE}Zq nec' in src(page) and '\\Gls{slp}Zq Mauris' in src(page), src(page)[-200:])
    three(page, src(page), 'real acronyms')
    # (acronym's \\acreset and acro's \\acuse print nothing: review N7)
    load_doc(page, src(page).replace('Mauris.', 'Mauris \\acreset{KDE}\\acuse{KDE}\\acused{KDE}end.'))
    txt = page.evaluate("document.getElementById('pages').innerText")
    check('real: \\acreset, \\acuse and \\acused draw nothing', txt.count('KDE') == 1 and 'Mauris end.' in txt, txt[:200])
    # enumitem's \newlist{todolist}{itemize}{2}: a list, its items drawn with its own label; its
    # \item were drawn as words, and Enter at an item's end made a paragraph, not an item
    load_doc(page, DOC.replace('\\usepackage{amsmath}', '\\usepackage{amsmath,amssymb,enumitem}\n\\newlist{todolist}{itemize}{2}\n\\setlist[todolist]{label=$\\square$}').replace('Agent income here.', '\\begin{todolist}\n  \\item Passport\n  \\item Tickets\n\\end{todolist}'))
    txt = page.evaluate("document.getElementById('pages').innerText")
    check('real: a list of enumitem\'s \\newlist is drawn as a list with its label', '\\item' not in txt and '\u25a1' in txt and page.evaluate("[...document.querySelectorAll('#pages .it')].filter((e) => e.dataset.li).length") == 2, txt[:200])
    click_text(page, 'Tickets', 7); k.press('Enter'); settle(page, 200); k.type('Money')
    settle(page, 200)
    check('real: Enter at the end of its item makes the next item', '\\item Tickets\n  \\item Money\n\\end{todolist}' in src(page), src(page)[-120:])
    three(page, src(page), 'real newlist')
    # (review B6) an itemize inside it keeps its own first level's bullet, as enumitem counts a
    # \newlist list's depth apart: it was drawn a level deeper, "–"; (N3) Tab nests an item in a
    # todolist of its own, Shift+Tab takes it back, as in an itemize
    Dn = DOC.replace('\\usepackage{amsmath}', '\\usepackage{amsmath,amssymb,enumitem}\n\\newlist{todolist}{itemize}{2}\n\\setlist[todolist]{label=$\\square$}').replace('Agent income here.', '\\begin{todolist}\n  \\item Passport\n  \\begin{itemize}\n  \\item Inner\n  \\end{itemize}\n  \\item Tickets\n  \\item Money\n\\end{todolist}')
    load_doc(page, Dn)
    txt = page.evaluate("document.getElementById('pages').innerText")
    check('real: an itemize in a \\newlist list has its first level\'s bullet', '\u25a1\nPassport\n\u2022\nInner\n\u25a1\nTickets' in txt, txt[:120])
    three(page, Dn, 'real nested newlist', ('Passport', '\u2022Inner', 'Tickets'))
    click_text(page, 'Money', 0); k.press('Tab'); settle(page, 300)
    check('real: Tab in a todolist item nests it in a todolist', '\\item Tickets\n    \\begin{todolist}\n      \\item Money\n    \\end{todolist}\n\\end{todolist}' in src(page), src(page)[-160:])
    k.press('Shift+Tab'); settle(page, 300)
    check('real: Shift+Tab takes it back', src(page) == Dn, src(page)[-160:])
    # marginnote's offset after its text (\marginnote{..}[0cm]) and a layout register's assignment
    # in the text (\columnseprule=.4pt) are no words of the page; they were drawn as "[0cm]", "=.4pt"
    # (and its documented form, \\marginnote[left page's text]{text}[offset]: review B4)
    Dm = DOC.replace('\\usepackage{amsmath}', '\\usepackage{amsmath,marginnote}').replace('Agent income here.', 'Agent income here.\\marginnote{A note.}[0cm] More.\\marginnote[Left side]{Right side}[0cm] Words.\n\n\\columnseprule=.4pt\n\\fboxsep=2pt Last words.')
    load_doc(page, Dm)
    txt = page.evaluate("document.getElementById('pages').innerText")
    check('real: \\marginnote{..}[0cm], \\marginnote[..]{..}[0cm] and \\columnseprule=.4pt draw no "[0cm]", "side" or "=.4pt"', '[0cm]' not in txt and 'side' not in txt and '=.4pt' not in txt and '=2pt' not in txt and 'fboxsep' not in txt and 'More.' in txt and 'Words.' in txt and 'Last words.' in txt, txt[:200])
    three(page, Dm, 'real margin notes', ('A note.', 'Right side', 'Words.', 'Last words.'))
    # (R4, V2 of its verification) a price and a formula typed after "$5 " and "$2 ": TeX's pairing
    # decides, and the PDF reads "$5 (excl. tax) now." as text and 2(ab + c) as a formula
    load_doc(page, DOC)
    click_text(page, 'here.', 5)
    for ch in ' It costs $5 (excl. tax) now.':
        k.type(ch); settle(page, 250 if ch == '$' else 40)
    k.press('Escape'); settle(page, 300)
    for ch in ' So $2 (ab + c)$ holds.':
        k.type(ch); settle(page, 250 if ch == '$' else 40)
    settle(page, 300)
    check('real: "$5 (excl. tax) now." typed is a price, "$2 (ab + c)$" a formula', 'It costs \\$5 (excl. tax) now. So $2 (ab + c)$ holds.' in src(page), src(page)[-120:])
    three(page, src(page), 'real price and formula', ('It costs $5 (excl. tax) now.', 'holds.'))
    # a $ in the source with no closing $ is drawn as TeX reads it: a formula to the paragraph's end,
    # marked as TeX's error "Missing $ inserted"; it was a "$" chip and the words after it as text
    Du = DOC.replace('Agent income here.', 'Costs $5 (excl. tax) now.')
    load_doc(page, Du)
    txt = page.evaluate("document.getElementById('pages').innerText")
    err = page.evaluate("[...document.querySelectorAll('#pages .m.has-err')].map((e) => e.title)")
    check('real: an unclosed $ draws the rest of its paragraph as a formula, marked', 'Costs 5(excl.tax)now.' in txt and err and 'Missing $ inserted' in err[0], (txt[:80], err))
    if TEX:
        for eng in ('pdflatex', 'xelatex', 'lualatex'):
            load_doc(page, ('% !TeX program = ' + eng + '\n' if eng != 'pdflatex' else '') + Du)
            r = page.evaluate("async () => { const r = await window.rikuy.api.compile(); return r.problems.filter((p) => p.severity === 'error').map((p) => p.message); }")
            t = pdf_text(page).replace('\n', ' ')
            check('real: and TeX (' + eng + ') says "Missing $ inserted" and sets the same', any('Missing $ inserted' in x for x in r) and 'Costs 5(excl.tax)now.' in t.replace(' ', '').replace('Costs', 'Costs '), (r[:2], t[:80]))
    # (review N4) inside a line or a group, and a glue's stretch with it
    Dr = DOC.replace('Agent income here.', 'Before {\\fboxsep=0pt\\fbox{boxed}} after.\n\n\\parfillskip=0pt plus 1fil Some words here.')
    load_doc(page, Dr)
    txt = page.evaluate("document.getElementById('pages').innerText")
    check('real: {\\fboxsep=0pt\\fbox{..}} and \\parfillskip=0pt plus 1fil draw no value', '=0pt' not in txt and 'plus' not in txt and 'fil' not in txt and 'Before boxed after.' in txt and 'Some words here.' in txt, txt[:200])
    three(page, Dr, 'real registers', ('Before boxed after.', 'Some words here.'))
    # straight quotes typed where the text is German as babel or polyglossia set it: „..“ and ‚..‘,
    # as Word's smart quotes make them in German; they were English ``..'', printed “..” there. In an
    # English passage of it, and in a document whose class option alone says German (no babel, so
    # pdfLaTeX's OT1 has no „), they stay ``..'' (review B7, B8, N5, N6)
    Dq = '\\documentclass{article}\n\\usepackage[english,ngerman]{babel}\n\\begin{document}\nDas ist ein Text hier.\n\n\\selectlanguage{english}\nEnglish words here.\n\\end{document}\n'
    load_doc(page, Dq)
    click_text(page, 'Text', 4); k.type(' "Hallo" und \'nein\' geht\'s'); settle(page, 300)
    click_text(page, 'words', 5); k.type(' "quoted" it\'s'); settle(page, 300)
    s_ = src(page)
    check('real: quotes typed in German text are \u201eHallo\u201c and \u201anein\u2018, an apostrophe stays', 'Text \u201eHallo\u201c und \u201anein\u2018 geht\'s hier.' in s_ and 'Text \u201eHallo\u201c und \u201anein\u2018 geht\u2019s hier.' in page.evaluate("document.getElementById('pages').innerText"), s_[-160:])
    check('real: and in its English passage ``quoted\'\'', "English words ``quoted'' it's here." in s_, s_[-80:])
    # (pdfLaTeX's OT1 sets babel's „ as a lowered ”, which the PDF's text reads as ”)
    three(page, s_, 'real German quotes', ('Hallo\u201c', 'nein\u2018', '\u201cquoted\u201d'))
    for D, name in (('\\documentclass[ngerman]{article}\n\\begin{document}\nDas ist ein Text hier.\n\\end{document}\n', 'a class option alone'),
                    ('\\documentclass[ngerman]{scrartcl}\n\\usepackage{babel}\n\\begin{document}\nDas ist ein Text hier.\n\\end{document}\n', 'KOMA\'s class option with babel')):
        load_doc(page, D)
        click_text(page, 'Text', 4); k.type(' "Hallo" und'); settle(page, 300)
        want = "``Hallo''" if 'alone' in name else '\u201eHallo\u201c'
        check('real: German set by ' + name + ': ' + want, 'Text ' + want + ' und hier.' in src(page), src(page)[-80:])
        three(page, src(page), 'real quotes, ' + name)


with sync_playwright() as p:
    for part in PARTS:
        browser, page, errors = open_page(p, width=1366, height=900)
        try:
            globals()[part](page)
        except Exception as e:
            check(part + ': ran', False, repr(e)[:300])
        check(part + ': no page errors', not errors, errors[:3])
        browser.close()

bad = [r for r in results if not r[1]]
print(f"{len(results) - len(bad)}/{len(results)} passed")
sys.exit(1 if bad else 0)
