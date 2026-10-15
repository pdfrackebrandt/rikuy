"""Equation editor details from Word: quotes for text, slash negation, plain slash,
Shift+Enter rows, wrapping a selection, pasting with delimiters, Copy for Word, decimal
comma in German documents, chemistry with \\ce."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
from browser import open_page, check, results, src, SHOTS
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser, page, errors = open_page(p, width=1400, height=900)
    page.evaluate("window.galley.toggleSource(false)")
    val = lambda: page.evaluate("document.getElementById('pop-field').getValue('latex')")
    ta = lambda: page.evaluate("document.getElementById('pop-tex').value")
    k = page.keyboard
    def open_inline():
        page.evaluate("document.querySelectorAll('.it.p [data-a]')[0].scrollIntoView({block:'center'})")
        page.locator('.it.p .katex').first.click()
        page.wait_for_selector('#pop-field', timeout=10000); page.wait_for_timeout(300)
        k.press('End')
    def reset(t=''):
        page.evaluate("(t) => { const mf = document.getElementById('pop-field'); mf.setValue(t); mf.dispatchEvent(new Event('input')); mf.focus(); mf.executeCommand('moveToMathfieldEnd'); }", t)
        page.wait_for_timeout(150)

    open_inline()
    reset('f(x)=')
    k.type('"if "'); page.wait_for_timeout(50); k.type('x'); page.wait_for_timeout(200)
    v = val()
    check('quotes make upright text', '\\text{if }' in v and v.endswith('x'), v)
    check('source gets \\text', '\\text{if' in ta(), ta())

    reset('a')
    k.type('/='); k.type('b'); page.wait_for_timeout(200)
    check('a/=b gives not equal', val().replace(' ', '') in ('a\\neqb', 'a\\neq b'.replace(' ', '')), val())
    reset('a')
    k.type('/<b'); page.wait_for_timeout(200)
    check('a/<b gives not less', '\\nless' in val() and '\\frac' not in val(), val())
    reset('x')
    k.type('/\\in'); k.press('Space'); k.type('A'); page.wait_for_timeout(200)
    check('x/\\in A gives not in', '\\notin' in val() and '\\frac' not in val(), val())
    reset('a')
    k.type('/b'); page.wait_for_timeout(200)
    check('a/b is still a fraction', '\\frac' in val(), val())
    reset('a')
    k.type('\\/b'); page.wait_for_timeout(200)
    check('\\/ is a plain slash', val() == 'a/b', val())

    # wrap a selection
    reset('x+1')
    k.press('Shift+Home'); page.wait_for_timeout(50)
    k.type('\\sqrt'); k.press('Space'); page.wait_for_timeout(200)
    check('\\sqrt wraps the selection', val().replace(' ', '') in ('\\sqrt{x+1}',), val())

    # paste with delimiters into the field (through its inner editable)
    reset('y=')
    page.evaluate("""(() => { const mf = document.getElementById('pop-field'); const dt = new DataTransfer(); dt.setData('text/plain', '$x^2$');
      const t = mf.shadowRoot && (mf.shadowRoot.querySelector('[contenteditable], textarea') || mf.shadowRoot.activeElement) || mf;
      t.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true, composed: true })); })()""")
    page.wait_for_timeout(250)
    check('pasting $x^2$ drops the dollars', val() == 'y=x^2', val())
    # paste into the LaTeX box
    page.evaluate("""(() => { const t = document.getElementById('pop-tex'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); const dt = new DataTransfer(); dt.setData('text/plain', '\\\\[ z+1 \\\\]');
      t.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); })()""")
    page.wait_for_timeout(250)
    check('pasting \\[...\\] into the LaTeX box drops the brackets', ta().endswith('z+1') and '\\[' not in ta(), ta())

    # Copy for Word
    reset('\\frac{a}{b}')
    page.evaluate("""(() => { window.__copied = {}; const o = DataTransfer.prototype.setData; DataTransfer.prototype.setData = function (t, v) { window.__copied[t] = v; return o.call(this, t, v); };
      navigator.clipboard.write = () => Promise.reject(new Error('blocked')); })()""")
    page.get_by_role('button', name='Copy for Word').click()
    page.wait_for_timeout(300)
    got = page.evaluate("window.__copied['text/plain']")
    check('Copy for Word puts MathML on the clipboard', got and got.startswith('<math') and '<mfrac>' in got and 'annotation' not in got, (got or '')[:120])
    k.press('Escape'); page.wait_for_timeout(300)

    # display: Shift+Enter makes a new row
    page.evaluate("document.querySelectorAll('.it.dm')[1].scrollIntoView({block:'center'})")
    page.locator('.it.dm').nth(1).click()
    page.wait_for_selector('#pop-field', timeout=10000); page.wait_for_timeout(300)
    before = val().count('\\\\')
    page.evaluate("(() => { const mf = document.getElementById('pop-field'); mf.focus(); mf.executeCommand('moveToMathfieldEnd'); })()")
    k.press('Shift+Enter'); page.wait_for_timeout(250)
    check('Shift+Enter adds a row', val().count('\\\\') == before + 1, val()[-80:])
    k.press('Escape'); page.wait_for_timeout(300)
    page.evaluate("window.galley.undo()"); page.wait_for_timeout(300)
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
    page.evaluate("""(t) => { const g = window.galley; g.files = new Map([['main.tex', t]]); g.main = 'main.tex'; g.forceRender = true; g.rebuild(); }""", de)
    page.wait_for_timeout(1500)
    chem = page.evaluate("(() => { const a = [...document.querySelectorAll('.it.p [data-a]')]; return a.map(e => e.textContent).join('|'); })()")
    check('\\ce renders as a formula', 'H' in chem and '2' in chem and 'O' in chem and '\\ce' not in chem, chem)
    check('\\ce is not flagged as an error', page.evaluate("document.querySelectorAll('.has-err').length") == 0)
    page.evaluate("window.galley.toggleSource(false)")
    page.locator('.it.p .katex').nth(1).click()
    page.wait_for_selector('#pop-field', timeout=10000); page.wait_for_timeout(300)
    page.evaluate("(() => { const mf = document.getElementById('pop-field'); mf.focus(); mf.executeCommand('moveToMathfieldEnd'); })()")
    page.keyboard.type(',5'); page.wait_for_timeout(300)
    t = page.evaluate("document.getElementById('pop-tex').value")
    check('decimal comma in a German document', t.replace(' ', '') == 'x=1{,}5', t)
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    page.locator('.it.p .katex').nth(2).click()
    page.wait_for_selector('#pop-field', timeout=10000); page.wait_for_timeout(300)
    page.evaluate("(() => { const mf = document.getElementById('pop-field'); mf.focus(); mf.executeCommand('moveToMathfieldEnd'); })()")
    page.keyboard.press('Backspace'); page.keyboard.type('y'); page.wait_for_timeout(400)
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    s2 = page.evaluate("window.galley.files.get('main.tex')")
    check('a list f(0,1) is not turned into a decimal', '$f(0,1) + y$' in s2, s2[s2.find('und'):][:40])
    check('no page errors (German)', not errors, errors[:5])
    browser.close()

bad = [r for r in results if not r[1]]
print(f"{len(results) - len(bad)}/{len(results)} passed")
sys.exit(1 if bad else 0)
