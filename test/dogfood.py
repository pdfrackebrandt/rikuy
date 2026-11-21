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
\\intertext drawn as a line of text between the rows; "- " in a definition starts a list there.

  python3 dogfood.py [part ...]   parts: formula arrows textfield styles table caption cite paste
                                  split filename undo_words enter reload_undo mathpkg intertext envlist
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from browser import open_page, check, results, src, load_doc, click_text, ROOT
from playwright.sync_api import sync_playwright

PARTS = sys.argv[1:] or ['formula', 'arrows', 'textfield', 'styles', 'table', 'caption', 'cite', 'paste']
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


def formula(page):
    # MathLive tells its input a moment after the key: Enter at once closed the box empty
    k = page.keyboard
    load_doc(page, DOC)
    click_text(page, 'Agent income', 5)
    k.press('Control+m'); page.wait_for_selector('#pop-field', timeout=10000); page.wait_for_timeout(200)
    k.type('x'); k.press('Enter'); page.wait_for_timeout(300)
    check('formula: x typed and Enter at once writes $x$', 'Agent$x$ income' in src(page), src(page)[40:90])
    check('formula: the box is closed and the caret on the page', not page.evaluate("!!document.querySelector('#pop-field')") and focus_id(page) == 'pages', focus_id(page))
    k.press('Control+m'); page.wait_for_selector('#pop-field', timeout=10000); page.wait_for_timeout(200)
    k.type('y_1'); k.press('Escape'); page.wait_for_timeout(300)
    check('formula: y_1 typed and Esc at once keeps it', '$y_1$' in src(page) or '$y_{1}$' in src(page), src(page)[40:100])


def arrows(page):
    k = page.keyboard
    load_doc(page, DOC)
    click_text(page, 'Agent income', 5)
    k.type(' ')
    k.press('Control+m'); page.wait_for_selector('#pop-field', timeout=10000); page.wait_for_timeout(200)
    k.type('i'); page.wait_for_timeout(100); k.press('ArrowRight'); page.wait_for_timeout(300)
    check('arrows: Right at a new formula\'s end leaves it', not page.evaluate("!!document.querySelector('#pop-field')") and focus_id(page) == 'pages', focus_id(page))
    k.type('has', delay=20); page.wait_for_timeout(300)
    check('arrows: the words typed next go after it, spaces kept', 'Agent $i$has income' in src(page), src(page)[40:100])
    # an existing formula: Left at its start puts the caret before it
    page.locator('#pages .it.p .katex').first.click(); page.wait_for_selector('#pop-field', timeout=10000); page.wait_for_timeout(300)
    page.evaluate("(() => { const mf = document.getElementById('pop-field'); mf.focus(); mf.executeCommand('moveToMathfieldStart'); })()")
    k.press('ArrowLeft'); page.wait_for_timeout(300)
    check('arrows: Left at a formula\'s start leaves it', not page.evaluate("!!document.querySelector('#pop-field')"), focus_id(page))
    k.type('Z'); page.wait_for_timeout(300)
    check('arrows: the caret stands before the formula', 'Agent Z$i$has' in src(page), src(page)[40:100])
    # Shift+Tab still reaches the LaTeX box: MathLive's move-out comes for it too, and closed the field
    load_doc(page, DOC)
    click_text(page, 'Agent income', 5)
    k.press('Control+m'); page.wait_for_selector('#pop-field', timeout=10000); page.wait_for_timeout(200)
    k.press('Shift+Tab'); page.wait_for_timeout(150)
    check('arrows: Shift+Tab in a new formula reaches its LaTeX box', focus_id(page) == 'pop-newtex', focus_id(page))
    k.press('Escape'); page.wait_for_timeout(200)
    # a display keeps its arrows
    load_doc(page, DOC.replace('Second paragraph.', '\\[\n  a+b\n\\]'))
    page.locator('#pages .katex-display').first.click(); page.wait_for_selector('#pop-field', timeout=10000); page.wait_for_timeout(300)
    page.evaluate("(() => { const mf = document.getElementById('pop-field'); mf.focus(); mf.executeCommand('moveToMathfieldEnd'); })()")
    k.press('ArrowRight'); page.wait_for_timeout(200)
    check('arrows: a display formula stays open at Right', page.evaluate("!!document.querySelector('#pop-field')"))
    k.press('Escape'); page.wait_for_timeout(200)


def textfield(page):
    # MathLive's setValue went in the mode at its caret: after \text{...} every value was text
    k = page.keyboard
    load_doc(page, DOC)
    click_text(page, 'Second paragraph.', 17)
    k.press('Enter'); page.wait_for_timeout(100)
    k.press('Alt+='); page.wait_for_selector('#pop-field', timeout=10000); page.wait_for_timeout(300)
    k.press('Shift+Tab'); page.wait_for_timeout(100)
    check('textfield: Shift+Tab reaches the LaTeX box', focus_id(page) == 'pop-tex', focus_id(page))
    k.type(r'\max_{c} u(c) \quad \text{s.t.}\quad c \le w', delay=5); page.wait_for_timeout(400)
    v = page.evaluate("document.getElementById('pop-field').getValue('latex')")
    check('textfield: the field shows the math, not one text run', 'textbackslash' not in v and v.startswith('\\max'), v)
    k.press('Tab'); page.wait_for_timeout(100)
    check('textfield: Tab goes to the field', focus_id(page) == 'pop-field', focus_id(page))
    page.evaluate("(() => { const mf = document.getElementById('pop-field'); mf.executeCommand('moveToMathfieldEnd'); })()")
    k.type('+1'); page.wait_for_timeout(300); k.press('Escape'); page.wait_for_timeout(300)
    s = src(page)
    check('textfield: a key in the field keeps the source LaTeX', 'textbackslash' not in s and '\\text{s.t.}' in s and '\\max_{c}' in s and 'w+1' in s, s[s.find('\\begin{equation}'):][:120])
    compiles(page, 'textfield')


def styles(page):
    k = page.keyboard
    doc = DOC.replace('Agent income here.', '\\begin{abstract}\nWe study taxes.\n\\end{abstract}')
    load_doc(page, doc)
    click_text(page, 'We study taxes.', 15)
    k.press('Enter'); page.wait_for_timeout(150)
    k.press('Control+Alt+1'); page.wait_for_timeout(200)
    k.type('Model', delay=10); page.wait_for_timeout(300)
    s = src(page)
    check('styles: Heading 1 on the blank paragraph after an abstract goes after \\end{abstract}', 'We study taxes.\n\\end{abstract}\n\n\\section{Model}' in s, s[s.find('\\begin{abstract}'):][:120])
    for _ in range(3):
        if src(page) == doc: break
        k.press('Control+z'); page.wait_for_timeout(150)
    check('styles: undo gives the source back byte for byte', src(page) == doc, src(page))
    doc2 = DOC.replace('\\usepackage{amsmath}', '\\usepackage{amsmath}\n\\usepackage{amsthm}\n\\newtheorem{proposition}{Proposition}').replace('Agent income here.', '\\begin{proposition}\nTaxes rise.\n\\end{proposition}')
    load_doc(page, doc2)
    click_text(page, 'Taxes rise.', 11)
    k.press('Enter'); page.wait_for_timeout(150)
    k.press('Control+Shift+S'); page.wait_for_timeout(200); k.type('Proof'); page.wait_for_timeout(200); k.press('Enter'); page.wait_for_timeout(300)
    k.type('Differentiate.', delay=10); page.wait_for_timeout(300)
    s = src(page)
    check('styles: Proof on the blank paragraph after a proposition goes after \\end{proposition}', 'Taxes rise.\n\\end{proposition}\n\n\\begin{proof}\nDifferentiate.\n\\end{proof}' in s, s[s.find('\\begin{proposition}'):][:160])
    compiles(page, 'styles')
    # a blank paragraph inside an abstract typed in stays in it (Normal: no change)
    load_doc(page, doc)
    click_text(page, 'We study taxes.', 15)
    k.press('Enter'); page.wait_for_timeout(150)
    k.type('More.', delay=10); page.wait_for_timeout(300)
    s = src(page)
    check('styles: words typed on it stay in the abstract, as before', 'We study taxes.\n\nMore.' in s and s.find('More.') < s.find('\\end{abstract}'), s)


def table(page):
    k = page.keyboard
    load_doc(page, DOC)
    click_text(page, 'Second paragraph.', 17)
    k.press('Enter'); page.wait_for_timeout(100)
    k.press('Alt+q'); page.wait_for_timeout(200); k.type('insert table'); page.wait_for_timeout(300); k.press('Enter'); page.wait_for_timeout(400)
    k.type('3'); k.press('Tab'); k.type('4'); k.press('Enter'); page.wait_for_timeout(500)
    s = src(page)
    body = s[s.find('\\begin{tabular}'):s.find('\\end{tabular}')]
    check('table: 3 Tab 4 Enter makes 3 columns and 4 rows', '\\begin{tabular}{lll}' in s and body.count('\\\\') == 4, body)


def caption(page):
    doc = DOC.replace('Second paragraph.', '\\begin{table}[h]\n\\centering\n\\begin{tabular}{ll}\na & b \\\\\n\\end{tabular}\n\\caption{Below}\n\\end{table}\n\n\\begin{table}[h]\n\\centering\n\\caption{Above}\n\\begin{tabular}{ll}\nc & d \\\\\n\\end{tabular}\n\\end{table}')
    load_doc(page, doc)
    page.wait_for_timeout(300)
    ys = page.evaluate("""(() => [...document.querySelectorAll('#pages .flt-table')].map((f) => { const c = f.querySelector('.cap'), t = f.querySelector('table'); return [c.textContent, c.getBoundingClientRect().top, t.getBoundingClientRect().top]; }))()""")
    check('caption: a \\caption after the tabular is drawn below it, as TeX prints it', len(ys) == 2 and 'Below' in ys[0][0] and ys[0][1] > ys[0][2], ys)
    check('caption: a \\caption before the tabular is drawn above it', len(ys) == 2 and 'Above' in ys[1][0] and ys[1][1] < ys[1][2], ys)


def cite(page):
    k = page.keyboard
    bib = '@article{mirrlees1971, author={Mirrlees, James A.}, title={An Exploration}, journal={RES}, year={1971}}\n@article{chetty2012, author={Chetty, Raj}, title={Bounds}, journal={Econometrica}, year={2012}}\n'
    load_doc(page, {'main.tex': DOC, 'refs.bib': bib})
    click_text(page, 'Agent income here.', 18)
    k.type(' See ')
    k.type('\\'); page.wait_for_timeout(200); k.type('cite', delay=20); page.wait_for_timeout(300); k.press('Enter')
    page.wait_for_selector('#pop-citesearch', timeout=5000); page.wait_for_timeout(200)
    items = page.evaluate("[...document.querySelectorAll('.pop-cite .pitem')].map((b) => b.textContent)")
    check('cite: the picker offers the project\'s .bib the document does not name', any('Mirrlees' in x for x in items), items or page.evaluate("document.querySelector('.pop-cite').textContent"))
    k.type('mirr'); page.wait_for_timeout(200); k.press('Enter'); page.wait_for_timeout(400)
    k.press('Escape'); page.wait_for_timeout(300)
    s = src(page)
    check('cite: the citation is written', 'See \\cite{mirrlees1971}' in s, s)
    check('cite: and the bibliography from refs.bib at the end', s.rstrip().endswith('\\bibliographystyle{plain}\n\\bibliography{refs}\n\\end{document}'), s[-120:])
    compiles(page, 'cite')
    if TEX:
        text = page.evaluate("async () => { const r = await window.rikuy.api.compile(); return r.problems.map((p) => p.message).join(' | '); }")
        check('cite: no undefined citation', 'undefined' not in text.lower(), text)
    # one Undo takes the bibliography lines and the key together
    k.press('Control+z'); page.wait_for_timeout(300)
    s = src(page)
    check('cite: one Undo takes the key and the bibliography lines', '\\bibliography' not in s and 'mirrlees1971' not in s, s)


def paste(page):
    def put(text):
        page.evaluate("""(t) => { const dt = new DataTransfer(); dt.setData('text/plain', t);
          document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }""", text)
        page.wait_for_timeout(400)
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
    k.press('Control+Alt+1'); page.wait_for_timeout(300)
    s = src(page)
    check('split: Heading 1 on the middle paragraph of an abstract splits it around that paragraph', '\\begin{abstract}\nFirst para.\n\\end{abstract}\n\n\\section{Second para.}\n\n\\begin{abstract}\nThird para.\n\\end{abstract}' in s, s)
    k.type('X'); page.wait_for_timeout(200)
    check('split: the caret stays in the words', '\\section{SecXond para.}' in src(page), src(page)[40:140])
    k.press('Control+z'); page.wait_for_timeout(200); k.press('Control+z'); page.wait_for_timeout(300)
    check('split: undo gives the source back byte for byte', src(page) == doc, src(page))
    click_text(page, 'Third para.', 1)
    k.press('Control+Alt+2'); page.wait_for_timeout(300)
    check('split: on the last paragraph the abstract ends before it', '\\begin{abstract}\nFirst para.\n\nSecond para.\n\\end{abstract}\n\n\\subsection{Third para.}\n\nSecond paragraph.' in src(page), src(page))
    compiles(page, 'split')


def filename(page):
    k = page.keyboard
    page.get_by_text('New document', exact=True).click(); page.wait_for_timeout(600)
    k.type('Optimal Taxation: a Note', delay=10)
    k.press('Control+Shift+S'); page.wait_for_timeout(200); k.type('Title'); page.wait_for_timeout(200); k.press('Enter'); page.wait_for_timeout(400)
    check('filename: the project is still Untitled', page.evaluate("window.rikuy.name").startswith('Untitled'), page.evaluate("window.rikuy.name"))
    check('filename: downloads take the title', page.evaluate("window.rikuy.fileBase()") == 'Optimal-Taxation-a-Note', page.evaluate("window.rikuy.fileBase()"))
    if TEX:
        with page.expect_download(timeout=90000) as d:
            from browser import download
            download(page, 'rb-pdf')
        check('filename: Download PDF is Optimal-Taxation-a-Note.pdf', d.value.suggested_filename == 'Optimal-Taxation-a-Note.pdf', d.value.suggested_filename)
    # a document of its own name keeps it
    page.evaluate("window.rikuy.name = 'My paper'")
    check('filename: a named document keeps its name', page.evaluate("window.rikuy.fileBase()") == 'My-paper', page.evaluate("window.rikuy.fileBase()"))


def undo_words(page):
    k = page.keyboard
    doc = DOC
    load_doc(page, doc)
    click_text(page, 'Second paragraph.', 17)
    k.press('Enter'); k.press('Control+Alt+1'); k.type('Model', delay=15); k.press('Enter')
    k.type('Consider an economy.', delay=15); page.wait_for_timeout(300)
    steps = []
    for _ in range(6):
        k.press('Control+z'); page.wait_for_timeout(150); steps.append(src(page))
    want = ['Consider an \n', 'Consider \n', '\\section{Model}\n\\end', '\\section{}\n\\end', 'Second paragraph.\n\\end']
    check('undo_words: typing is undone word by word, the heading apart from the paragraph after it', all(w in steps[i] for i, w in enumerate(want)), [x[60:] for x in steps])
    check('undo_words: and back to the start byte for byte', steps[4] == doc, steps[4])


def enter(page):
    k = page.keyboard
    load_doc(page, DOC)
    click_text(page, 'Second paragraph.', 0)
    for _ in range(4): k.press('Enter')
    page.wait_for_timeout(300)
    check('enter: Enter at a paragraph\'s start writes no blank lines', src(page) == DOC, src(page))
    check('enter: an empty paragraph shows above it', page.evaluate("!!document.querySelector('#pages .ghostp')"))
    k.type('Z'); page.wait_for_timeout(300)
    check('enter: the caret stayed at the paragraph\'s start, as Word\'s', 'ZSecond paragraph.' in src(page), src(page))
    load_doc(page, DOC)
    click_text(page, 'Second paragraph.', 0)
    k.press('Enter'); k.press('ArrowUp'); k.type('New one.', delay=10); page.wait_for_timeout(300)
    check('enter: Up types in the empty paragraph', 'Agent income here.\n\nNew one.\n\nSecond paragraph.' in src(page), src(page))
    load_doc(page, DOC)
    click_text(page, 'Second paragraph.', 7)
    for _ in range(3): k.press('Enter')
    page.wait_for_timeout(300)
    check('enter: three Enters in a paragraph split it once', 'Second \n\nparagraph.' in src(page) and '\n\n\n' not in src(page), src(page))


def reload_undo(page):
    k = page.keyboard
    load_doc(page, DOC)
    page.evaluate("window.rikuy.persist()"); page.wait_for_timeout(400)
    click_text(page, 'Agent income here.', 18)
    k.type(' More words.', delay=15); page.wait_for_timeout(2500)
    before = src(page)
    page.reload(); page.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=20000); page.wait_for_timeout(400)
    check('reload_undo: the text is back', src(page) == before, src(page))
    k.press('Control+z'); page.wait_for_timeout(300)
    check('reload_undo: Undo after a reload takes the last word', 'More \n' in src(page) and 'words.' not in src(page), src(page))
    k.press('Control+y'); page.wait_for_timeout(300)
    check('reload_undo: and Redo puts it back', src(page) == before, src(page))


def mathpkg(page):
    k = page.keyboard
    load_doc(page, DOC)
    click_text(page, 'Agent income here.', 18)
    k.type(' ')
    k.press('Control+m'); page.wait_for_selector('#pop-field', timeout=10000); page.wait_for_timeout(200)
    k.press('Shift+Tab'); page.wait_for_timeout(100)
    k.type('\\mathbb{R}^n'); page.wait_for_timeout(300); k.press('Enter'); page.wait_for_timeout(400)
    s = src(page)
    check('mathpkg: \\mathbb typed in the field brings amssymb', '\\usepackage{amssymb}' in s and '$\\mathbb{R}^n$' in s, s[:200])
    compiles(page, 'mathpkg field')
    load_doc(page, DOC)
    click_text(page, 'Agent income here.', 18)
    k.type(' ')
    html = '<p>Let <span class="katex"><span class="katex-mathml"><math><semantics><mrow></mrow><annotation encoding="application/x-tex">x \\in \\mathbb{R}^n</annotation></semantics></math></span></span> be given.</p>'
    page.evaluate("""(h) => { const dt = new DataTransfer(); dt.setData('text/plain', 'Let x be given.'); dt.setData('text/html', h);
      document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }""", html)
    page.wait_for_timeout(500)
    s = src(page)
    check('mathpkg: \\mathbb pasted from a chat assistant brings amssymb', '\\usepackage{amssymb}' in s and 'Let $x \\in \\mathbb{R}^n$ be given.' in s, s[:200])
    compiles(page, 'mathpkg paste')
    k.press('Control+z'); page.wait_for_timeout(300)
    check('mathpkg: one Undo takes the paste and its package', src(page) == DOC.replace('Agent income here.', 'Agent income here. '), src(page))


def intertext(page):
    doc = DOC.replace('Second paragraph.', '\\begin{align}\na &= b + c \\\\\n\\intertext{Taking first-order conditions, with $\\lambda>0$,}\nd &= e \\tag{FOC}\n\\end{align}\nAfter.')
    load_doc(page, doc)
    page.wait_for_timeout(400)
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
    k.press('Enter'); k.type('- ', delay=30); page.wait_for_timeout(200); k.type('complete', delay=10); k.press('Enter'); k.type('transitive', delay=10); page.wait_for_timeout(300)
    s = src(page)
    check('envlist: "- " in a definition starts a list in it', 'rational if:\n\n\\begin{itemize}\n  \\item complete\n  \\item transitive\n\\end{itemize}' in s and s.find('\\end{itemize}') < s.find('\\end{definition}'), s)
    compiles(page, 'envlist')


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
