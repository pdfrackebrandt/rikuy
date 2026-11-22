"""Equation editor details from Word: quotes for text, slash negation, plain slash,
Shift+Enter rows, wrapping a selection, pasting with delimiters, Copy for Word, decimal
comma in German documents, chemistry with \\ce."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from browser import settle, until, open_page, check, results, src, SHOTS
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
