"""Equation editor details from Word: quotes for text, slash negation, plain slash,
Shift+Enter rows, wrapping a selection, pasting with delimiters, Copy for Word, decimal
comma in German documents, chemistry with \\ce."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from browser import settle, until, open_page, check, results, src, SHOTS, load_doc, place, select_between
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser, page, errors = open_page(p, width=1400, height=900)
    page.evaluate("window.rikuy.toggleSource(false)")
    val = lambda: page.evaluate("document.getElementById('pop-field').getValue('latex')")
    ta = lambda: page.evaluate("document.getElementById('pop-tex').value")
    k = page.keyboard
    def open_inline():
        page.evaluate("document.querySelectorAll('.it.p [data-a]')[0].scrollIntoView({block:'center'})")
        page.locator('.it.p .katex').first.click()
        page.wait_for_selector('#pop-field', timeout=10000); settle(page, 300)
        k.press('End')
    def reset(t=''):
        page.evaluate("(t) => { const mf = document.getElementById('pop-field'); mf.setValue(t); mf.dispatchEvent(new Event('input')); mf.focus(); mf.executeCommand('moveToMathfieldEnd'); }", t)
        settle(page, 150)

    open_inline()
    reset('f(x)=')
    k.type('"if "'); settle(page, 50); k.type('x'); settle(page, 200)
    v = val()
    check('quotes make upright text', '\\text{if }' in v and v.endswith('x'), v)
    check('source gets \\text', '\\text{if' in ta(), ta())

    reset('a')
    k.type('/='); k.type('b'); settle(page, 200)
    check('a/=b gives not equal', val().replace(' ', '') in ('a\\neqb', 'a\\neq b'.replace(' ', '')), val())
    reset('a')
    k.type('/<b'); settle(page, 200)
    check('a/<b gives not less', '\\nless' in val() and '\\frac' not in val(), val())
    reset('x')
    k.type('/\\in'); k.press('Space'); k.type('A'); settle(page, 200)
    check('x/\\in A gives not in', '\\notin' in val() and '\\frac' not in val(), val())
    reset('a')
    k.type('/b'); settle(page, 200)
    check('a/b is still a fraction', '\\frac' in val(), val())
    reset('a')
    k.type('\\/b'); settle(page, 200)
    check('\\/ is a plain slash', val() == 'a/b', val())

    # wrap a selection
    reset('x+1')
    k.press('Shift+Home'); settle(page, 50)
    k.type('\\sqrt'); k.press('Space'); settle(page, 200)
    check('\\sqrt wraps the selection', val().replace(' ', '') in ('\\sqrt{x+1}',), val())

    # paste with delimiters into the field (through its inner editable)
    reset('y=')
    page.evaluate("""(() => { const mf = document.getElementById('pop-field'); const dt = new DataTransfer(); dt.setData('text/plain', '$x^2$');
      const t = mf.shadowRoot && (mf.shadowRoot.querySelector('[contenteditable], textarea') || mf.shadowRoot.activeElement) || mf;
      t.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true, composed: true })); })()""")
    settle(page, 250)
    check('pasting $x^2$ drops the dollars', val() == 'y=x^2', val())
    # a formula copied on the page: its LaTeX, kept beside the plain text (the drawn letters: \frac{a}{b}
    # came in as ba); words with it as \text{…}
    PASTE = """([plain, own]) => { const mf = document.getElementById('pop-field'); const dt = new DataTransfer(); dt.setData('text/plain', plain); dt.setData('text/x-galley-latex', own);
      const t = mf.shadowRoot && (mf.shadowRoot.querySelector('[contenteditable], textarea') || mf.shadowRoot.activeElement) || mf;
      t.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true, composed: true })); }"""
    reset('y=')
    page.evaluate(PASTE, [' \nb\na\n\n ', '$\\frac{a}{b}$']); settle(page, 250)
    one = val()
    reset('y=')
    page.evaluate(PASTE, ['if  b a ', 'if $\\frac{a}{b}$']); settle(page, 250)
    check('a formula copied on the page pastes into the field as its LaTeX, words as \\text', one == 'y=\\frac{a}{b}' and val() == 'y=\\text{if }\\frac{a}{b}', (one, val()))
    # (an equation copied with its label leaves the label with it; an equation of rows does not go
    # into a formula in the line)
    reset('y=')
    page.evaluate(PASTE, [' z ', '\\begin{equation}\n  z\\label{eq:z}\n\\end{equation}']); settle(page, 250)
    lab = val()
    reset('y=')
    page.evaluate(PASTE, [' a = b c = d ', '\\begin{align}\n  a &= b \\\\\n  c &= d\n\\end{align}']); settle(page, 250)
    check('pasted into a formula in the line: a copied equation without its label, rows refused', lab == 'y=z' and val() == 'y=', (lab, val()))
    k.press('Escape'); settle(page, 300)
    # (nor into an equation of one row, where the & came in as a literal \&)
    page.evaluate("document.querySelectorAll('.it.dm')[0].scrollIntoView({block:'center'})")
    page.locator('.it.dm').nth(0).click()
    page.wait_for_selector('#pop-field', timeout=10000); settle(page, 300)
    before = val()
    page.evaluate(PASTE, [' a = b c = d ', '\\begin{align}\n  a &= b \\\\\n  c &= d\n\\end{align}']); settle(page, 250)
    check('rows pasted into an equation of one row are refused', val() == before and '\\&' not in val(), (before[-40:], val()[-40:]))
    k.press('Escape'); settle(page, 300)
    # (into an equation of rows they are its rows: the field wrote q &= ra\&=b \\ c\&=d)
    page.evaluate("document.querySelectorAll('.it.dm')[1].scrollIntoView({block:'center'})")
    page.locator('.it.dm').nth(1).click()
    page.wait_for_selector('#pop-field', timeout=10000); settle(page, 300)
    page.evaluate("(() => { const mf = document.getElementById('pop-field'); mf.focus(); mf.executeCommand('moveToMathfieldEnd'); })()")
    page.evaluate(PASTE, [' a = b c = d ', '\\begin{align}\n  a &= b \\\\\n  c &= d\n\\end{align}']); settle(page, 400, full=True)
    rows = ta()
    check('rows pasted into an equation of rows are rows of it, their & kept', 'a &= b \\\\\n  c &= d' in rows and '\\&' not in rows and rows.count('\\\\') >= 3, rows[-120:])
    k.press('Escape'); settle(page, 300)
    page.evaluate("window.rikuy.undo()"); settle(page, 300)
    # (into a gather, which has no columns, the rows come without their &, which TeX rejects there)
    keep = page.evaluate("window.rikuy.files.get('main.tex')")
    load_doc(page, '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nText.\n\\begin{gather}\n  q = r \\\\\n  s = t\n\\end{gather}\nMore.\n\\end{document}\n')
    page.locator('.it.dm').nth(0).click()
    page.wait_for_selector('#pop-field', timeout=10000); settle(page, 300)
    page.evaluate("(() => { const mf = document.getElementById('pop-field'); mf.focus(); mf.executeCommand('moveToMathfieldEnd'); })()")
    page.evaluate(PASTE, [' a = b c = d ', '\\begin{align}\n  a &= b \\\\\n  c &= d\n\\end{align}']); settle(page, 400, full=True)
    rows = ta()
    check('rows pasted into a gather come without their &', '&' not in rows and 'a = b' in rows and 'c = d' in rows, rows[-80:])
    k.press('Escape'); settle(page, 300)
    # (into the middle of an align's row: the rows at the caret, the row split there and every new
    # line indented as the rows are; the paste went to the align's end, the field's place in the
    # rows never found in the box, and the row after the rows lost its indent. One row goes in at
    # the caret, the row staying one; each & of && dropped in a gather, where the second stayed)
    ALG = '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nText.\n\\begin{align}\n  a &= b \\\\\n  c &= d\n\\end{align}\nMore.\n\\end{document}\n'
    got = []
    for doc, own in ((ALG, '\\begin{align}\n  x &= y \\\\\n  z &= w\n\\end{align}'), (ALG, '$x &= y$'), (ALG.replace('align}', 'gather}').replace('&', ''), '\\begin{alignat}{2}\n  x &= y && z &= w \\\\\n  u &= v && s &= t\n\\end{alignat}')):
        load_doc(page, doc)
        page.locator('.it.dm').nth(0).click()
        page.wait_for_selector('#pop-field', timeout=10000); settle(page, 300)
        if '&' in doc: k.press('ArrowLeft'); settle(page, 100)
        page.evaluate(PASTE, [' x ', own]); settle(page, 400, full=True)
        got.append(ta())
        k.press('Escape'); settle(page, 300)
    check('rows pasted mid row into an align: at the caret, the row split there, every line indented', got[0] == '  a &= b \\\\\n  c &= \\\\\n  x &= y \\\\\n  z &= w \\\\\n  d', got[0])
    check('one row pasted mid row: at the caret, its & kept, the row one row', got[1] == '  a &= b \\\\\n  c &=x &= y d', got[1])
    check('alignat\'s && pasted into a gather: no & left', '&' not in got[2] and '  x = y' in got[2], got[2])
    # (review: one row goes into the caret's row only where the row then has no more columns than
    # its equation takes: alignat{1} 2, eqnarray 3; else it is a row of its own, as before, where
    # c &=x &= y d stopped TeX, "Extra & on this line". A paste at the start of the row after
    # \\[2pt] goes after the [2pt], which went after it and printed.)
    GO = """(v) => { const mf = document.getElementById('pop-field'); const M = mf._mathfield.model; let best = -1;
      for (let i = 0; i <= M.lastOffset; i++) { const a = M.at(i); if (a && a.value === v) best = i; } if (best >= 0) mf.position = best; return best; }"""
    got = []
    for doc, own, go in ((ALG.replace('align}', 'alignat}{1}', 1).replace('\\end{align}', '\\end{alignat}'), '$x &= y$', None),
                         (ALG.replace('align}', 'eqnarray}').replace('&=', '&=&'), '$x &=& y$', None),
                         (ALG.replace('a &= b \\\\\n', 'a &= b \\\\[2pt]\n'), '$x &= y$', 'c')):
        load_doc(page, doc)
        page.locator('.it.dm').nth(0).click()
        page.wait_for_selector('#pop-field', timeout=10000); settle(page, 300)
        if go: page.evaluate(GO, go)
        k.press('ArrowLeft'); settle(page, 100)
        page.evaluate(PASTE, [' x ', own]); settle(page, 400, full=True)
        got.append(ta())
        k.press('Escape'); settle(page, 300)
    check('one row pasted mid row into alignat{1}: a row of its own (two & in the row stopped TeX)', got[0] == '  a &= b \\\\\n  c &= \\\\\n  x &= y \\\\\n  d', got[0])
    check('and into eqnarray: a row of its own', got[1] == '  a &=& b \\\\\n  c &=& \\\\\n  x &=& y \\\\\n  d', got[1])
    check('a paste at the start of the row after \\\\[2pt]: after the [2pt], which stays the row break\'s', '\\\\[2pt]\n  x &= yc &= d' in got[2], got[2])
    load_doc(page, keep)
    open_inline()
    # paste into the LaTeX box
    page.evaluate("""(() => { const t = document.getElementById('pop-tex'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); const dt = new DataTransfer(); dt.setData('text/plain', '\\\\[ z+1 \\\\]');
      t.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); })()""")
    settle(page, 250)
    check('pasting \\[...\\] into the LaTeX box drops the brackets', ta().endswith('z+1') and '\\[' not in ta(), ta())

    # Copy for Word
    reset('\\frac{a}{b}')
    page.evaluate("""(() => { window.__copied = {}; const o = DataTransfer.prototype.setData; DataTransfer.prototype.setData = function (t, v) { window.__copied[t] = v; return o.call(this, t, v); };
      navigator.clipboard.write = () => Promise.reject(new Error('blocked')); })()""")
    page.get_by_role('button', name='Copy for Word').click()
    settle(page, 300)
    got = page.evaluate("window.__copied['text/plain']")
    check('Copy for Word puts MathML on the clipboard', got and got.startswith('<math') and '<mfrac>' in got and 'annotation' not in got, (got or '')[:120])
    # Ctrl+C and Ctrl+X in a formula in the line: the plain text is the formula as $…$ (MathLive's
    # $$ … $$ pasted as a display in the middle of a sentence)
    page.click('#pop-field'); settle(page, 100)
    page.evaluate("window.__copied = {}")
    k.press('Control+a'); k.press('Control+c'); settle(page, 150)
    got = page.evaluate("window.__copied['text/plain']")
    k.press('End'); k.press('Shift+Home'); k.press('Control+x'); settle(page, 150)
    cut = page.evaluate("window.__copied['text/plain']")
    check('copied or cut from a formula in the line, the plain text is $...$', got == '$\\frac{a}{b}$' and cut == '$\\frac{a}{b}$', (got, cut))
    k.press('Escape'); settle(page, 300)

    # Ctrl+C over words, a formula in the line and a display: the plain text has each formula as its
    # LaTeX with its delimiters, as Word gives an equation's linear form; it had the letters of their
    # drawings, one line each (x 2 + b a), which the source pane or another program then got
    cur = page.evaluate("window.rikuy.files.get('main.tex')")
    load_doc(page, '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nLet $x^2+\\frac{a}{b}$ be a value.\n\\[\ny = \\sqrt{z}\n\\]\nAfter that here.\n\\end{document}\n')
    page.evaluate("window.__copied = {}")
    place(page, lambda pg: select_between(pg, 'Let', 0, 'After that', 5))
    k.press('Control+c'); settle(page, 150)
    got = page.evaluate("window.__copied['text/plain']")
    check('copied from the page, the plain text has each formula as its LaTeX', got == 'Let $x^2+\\frac{a}{b}$ be a value.\n\\[\ny = \\sqrt{z}\n\\]\nAfter', got)
    page.evaluate("window.__copied = {}")
    place(page, lambda pg: select_between(pg, 'Let', 4, 'be a', 2))
    k.press('Control+c'); settle(page, 150)
    got = page.evaluate("window.__copied['text/plain']")
    check('and a formula with a word after it: $...$ and the word', got == '$x^2+\\frac{a}{b}$ be', got)
    load_doc(page, cur)

    # display: Shift+Enter makes a new row
    page.evaluate("document.querySelectorAll('.it.dm')[1].scrollIntoView({block:'center'})")
    page.locator('.it.dm').nth(1).click()
    page.wait_for_selector('#pop-field', timeout=10000); settle(page, 300)
    before = val().count('\\\\')
    page.evaluate("(() => { const mf = document.getElementById('pop-field'); mf.focus(); mf.executeCommand('moveToMathfieldEnd'); })()")
    k.press('Shift+Enter'); settle(page, 250)
    check('Shift+Enter adds a row', val().count('\\\\') == before + 1, val()[-80:])
    k.press('Escape'); settle(page, 300)
    page.evaluate("window.rikuy.undo()"); settle(page, 300)
    print('errors:', errors[:5])
    check('no page errors', not errors, errors[:5])
    browser.close()

    # German document: decimal comma; chemistry
    de = r"""\documentclass{article}
\usepackage[ngerman]{babel}
\usepackage[version=4]{mhchem}
\begin{document}
Wasser ist \ce{H2O}. Es gilt $x = 1$ und $f(0,1) + x$.
\end{document}
"""
    init = "window.__seed = " + repr(de).replace("'", '"') if False else None
    browser, page, errors = open_page(p, width=1400, height=900)
    page.evaluate("""(t) => { const g = window.rikuy; g.files = new Map([['main.tex', t]]); g.main = 'main.tex'; g.forceRender = true; g.rebuild(); }""", de)
    # (\ce draws once KaTeX's mhchem, fetched the first time a document uses it, has come and the
    # page is drawn again with it: a script loaded, no timer)
    until(page, "() => { try { window.katex.renderToString('\\\\ce{H2O}'); return true; } catch (e) { return false; } }", timeout=1500)
    settle(page, 1500)
    chem = page.evaluate("(() => { const a = [...document.querySelectorAll('.it.p [data-a]')]; return a.map(e => e.textContent).join('|'); })()")
    check('\\ce renders as a formula', 'H' in chem and '2' in chem and 'O' in chem and '\\ce' not in chem, chem)
    check('\\ce is not flagged as an error', page.evaluate("document.querySelectorAll('.has-err').length") == 0)
    page.evaluate("window.rikuy.toggleSource(false)")
    page.locator('.it.p .katex').nth(1).click()
    page.wait_for_selector('#pop-field', timeout=10000); settle(page, 300)
    page.evaluate("(() => { const mf = document.getElementById('pop-field'); mf.focus(); mf.executeCommand('moveToMathfieldEnd'); })()")
    page.keyboard.type(',5'); settle(page, 300)
    t = page.evaluate("document.getElementById('pop-tex').value")
    check('decimal comma in a German document', t.replace(' ', '') == 'x=1{,}5', t)
    page.keyboard.press('Escape'); settle(page, 300)
    page.locator('.it.p .katex').nth(2).click()
    page.wait_for_selector('#pop-field', timeout=10000); settle(page, 300)
    page.evaluate("(() => { const mf = document.getElementById('pop-field'); mf.focus(); mf.executeCommand('moveToMathfieldEnd'); })()")
    page.keyboard.press('Backspace'); page.keyboard.type('y'); settle(page, 400)
    page.keyboard.press('Escape'); settle(page, 300)
    s2 = page.evaluate("window.rikuy.files.get('main.tex')")
    check('a list f(0,1) is not turned into a decimal', '$f(0,1) + y$' in s2, s2[s2.find('und'):][:40])
    check('no page errors (German)', not errors, errors[:5])
    browser.close()

bad = [r for r in results if not r[1]]
print(f"{len(results) - len(bad)}/{len(results)} passed")
sys.exit(1 if bad else 0)
