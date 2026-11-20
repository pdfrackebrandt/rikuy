"""A power user's keys (docs/handoff/POWER-USER.md): every place the audit found the keys going
somewhere wrong without a word, pressed as a person presses them, the source checked byte for
byte and the caret where the next key lands.

footnote: Esc, Shift+F5, Right at its end and Ctrl+End leave a footnote typed at the page's foot
(finding 1). dollars: $x^2$ typed as in Overleaf ends the formula at its closing $ (2). latex:
LaTeX typed into the equation field as it is typed in the source, braces and all, and what the
field cannot hold carried on in its LaTeX box (3). tab: Tab keeps the keyboard on the page, a
first line indent at a paragraph's start, a gap elsewhere; Esc then Tab leaves (6). pickers: the
reference and citation pickers by the keys, Enter closing them, with what each label names (7).
Each part is a function; `python3 power.py
footnote` runs one."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import open_page, check, results, src, click_text, select_text, load_doc
from playwright.sync_api import sync_playwright


def key(page, k, wait=150):
    page.keyboard.press(k); page.wait_for_timeout(wait)


def typed(page, text, wait=200):
    page.keyboard.type(text); page.wait_for_timeout(wait)


def active(page):
    return page.evaluate("(() => { const a = document.activeElement; return a ? (a.id || a.tagName.toLowerCase()) : null; })()")


def caret(page):
    return page.evaluate("(() => { const c = window.rikuy.caretNow(); return c ? [c.f, c.a, c.b] : null; })()")


FN = '\\documentclass{article}\n\\begin{document}\n\nAlpha beta gamma.\n\nNext paragraph.\n\n\\end{document}\n'


def footnote(page):
    # Ctrl+Alt+F, the note typed, then a way out; what is typed next goes after the mark
    for ways, label in ((['Escape'], 'Esc'), (['Shift+F5'], 'Shift+F5'), (['ArrowRight'], 'Right at its end'), (['Control+End'], 'Ctrl+End')):
        load_doc(page, FN)
        click_text(page, 'gamma.', 6)
        key(page, 'Control+Alt+f'); typed(page, 'Note.', 300)
        for k in ways: key(page, k, 250)
        typed(page, ' XYZ')
        s = src(page)
        want = 'gamma.\\footnote{Note.} XYZ' if label != 'Ctrl+End' else 'Next paragraph. XYZ'
        check('footnote: ' + label + ' leaves it, the next words after ' + ('the mark' if label != 'Ctrl+End' else 'the text\'s end'), want in s, s[40:120])
    # Right inside the note's text moves on in it, as before
    load_doc(page, FN)
    click_text(page, 'gamma.', 6)
    key(page, 'Control+Alt+f'); typed(page, 'Note.', 300)
    key(page, 'ArrowLeft'); key(page, 'ArrowLeft'); key(page, 'ArrowRight'); typed(page, 'Q')
    check('footnote: Right inside its text stays in it', '\\footnote{NoteQ.}' in src(page), src(page)[40:100])


MATH = '\\documentclass{article}\n\\usepackage{amsmath,amssymb}\n\\begin{document}\n\nAlpha beta gamma.\n\nNext paragraph.\n\n\\end{document}\n'


def dollars(page):
    for typed_, want, label in ((' so $x^2$ is fine', ' So $x^2$ is fine', 'x^2'), (' and $\\alpha$ more', ' And $\\alpha$ more', 'a command before it'),
                                (' it costs $$5', ' It costs \\$5', 'two at once stay a dollar sign')):
        load_doc(page, MATH)
        click_text(page, 'gamma.', 6)
        for ch in typed_:
            page.keyboard.type(ch); page.wait_for_timeout(250 if ch == '$' else 25)
        page.wait_for_timeout(300)
        s = src(page)
        check('dollars: ' + label + ' typed as in the source', 'gamma.' + want + '\n' in s, s[60:140])
        check('dollars: ' + label + ': the caret back on the page', active(page) == 'pages', active(page))


def field(page, keys):
    # Alt+= on an empty line, keys typed into the field, Enter: the equation's body as written
    page.evaluate('window.rikuy.closePop && window.rikuy.closePop(true)')
    load_doc(page, MATH)
    click_text(page, 'gamma.', 6)
    key(page, 'Enter'); key(page, 'Alt+Equal', 600)
    page.keyboard.type(keys, delay=15); page.wait_for_timeout(300)
    key(page, 'Enter', 400)
    s = src(page)
    i, j = s.find('\\begin{equation}'), s.find('\\end{equation}')
    return ''.join(s[i + 16:j].split()) if i >= 0 and j > i else None


def latex(page):
    for keys, want in ((r'\sum_{i=1}^n x_i', [r'\sum_{i=1}^{n}x_{i}', r'\sum_{i=1}^nx_i']),
                       (r'\frac{a}{b}+1', [r'\frac{a}{b}+1']),
                       (r'\frac{x_i}{n}', [r'\frac{x_{i}}{n}', r'\frac{x_i}{n}']),
                       (r'\mathbb{R}^n', [r'\mathbb{R}^{n}', r'\mathbb{R}^n']),
                       (r'\mathbb{E}[x]', [r'\mathbb{E}[x]', r'\mathbb{E}\left[x\right]']),
                       (r'\text{if }x>0', [r'\text{if}x>0', r'\text{if }x>0']),
                       (r'\sqrt{x}+\hat{y}', [r'\sqrt{x}+\hat{y}']),
                       (r'x^{(a)}', [r'x^{(a)}', r'x^{\left(a\right)}']),
                       (r'\left( x \right)', [r'\left(x\right)', '(x)']),
                       ('a/b ', [r'\frac{a}{b}']),
                       ('x^(n+1)', [r'x^{n+1}'])):
        got = field(page, keys)
        check('latex: ' + keys + ' typed into the equation field', got in [''.join(w.split()) for w in want], got)
    # what the field cannot hold goes on in its LaTeX box, typed on there
    load_doc(page, MATH)
    click_text(page, 'gamma.', 6)
    key(page, 'Enter'); key(page, 'Alt+Equal', 600)
    page.keyboard.type(r'\begin{', delay=15); page.wait_for_timeout(200)
    check('latex: \\begin{ moves on to the LaTeX box', active(page) == 'pop-tex', active(page))
    page.keyboard.type(r'aligned}a&=b\\c&=d\end{aligned}', delay=10); page.wait_for_timeout(300)
    key(page, 'Escape', 400)
    check('latex: an aligned block typed through the LaTeX box', '\\begin{aligned}a&=b\\\\c&=d\\end{aligned}' in src(page), src(page)[60:200])


TAB = '\\documentclass{article}\n\\begin{document}\n\nAlpha beta gamma.\n\n\\noindent Second one here.\n\nThird one here.\n\n\\end{document}\n'


def tab(page):
    load_doc(page, TAB)
    click_text(page, 'beta', 4); key(page, 'Tab'); typed(page, 'zz')
    check('tab: Tab in a line leaves a gap and the keyboard on the page', 'Alpha beta\\quad{}zz gamma.' in src(page) and active(page) == 'pages', (src(page)[40:80], active(page)))
    load_doc(page, TAB)
    click_text(page, 'Second', 0); key(page, 'Tab')
    check('tab: Tab at a paragraph\'s start indents its first line (\\noindent goes)', '\n\nSecond one here.' in src(page) and active(page) == 'pages', src(page)[40:100])
    load_doc(page, TAB)
    click_text(page, 'Third', 0); key(page, 'Shift+Tab')
    check('tab: Shift+Tab at a paragraph\'s start takes the indent off (\\noindent)', '\\noindent Third one here.' in src(page) and active(page) == 'pages', src(page)[60:120])
    key(page, 'Control+z')
    check('tab: one undo gives the bytes back', src(page) == TAB)
    click_text(page, 'beta', 4); key(page, 'Escape'); key(page, 'Tab')
    check('tab: Esc, then Tab, leaves the page and writes nothing', active(page) != 'pages' and src(page) == TAB, active(page))


REFS = ('\\documentclass{article}\n\\usepackage{amsmath}\n\\usepackage{natbib}\n\\begin{document}\n\n\\section{Intro}\\label{sec:intro}\n\nAlpha beta gamma.\n\n'
        '\\begin{equation}\\label{eq:euler}\nu\'(c_t) = \\beta R u\'(c_{t+1})\n\\end{equation}\n\nLast paragraph here.\n\n\\bibliographystyle{plainnat}\n\\bibliography{refs}\n\\end{document}\n')
BIB = ('@article{ramsey1928,\n  author = {Ramsey, Frank P.},\n  title = {A Mathematical Theory of Saving},\n  journal = {The Economic Journal},\n  year = {1928}\n}\n'
       '@book{barro2004,\n  author = {Barro, Robert J. and Sala-i-Martin, Xavier},\n  title = {Economic Growth},\n  year = {2004},\n  publisher = {MIT Press}\n}\n')


def pickers(page):
    load_doc(page, {'main.tex': REFS, 'refs.bib': BIB})
    click_text(page, 'Last', 0)
    typed(page, 'See '); typed(page, '\\', 300); typed(page, 'ref'); key(page, 'Enter', 400)
    rows = page.evaluate("[...document.querySelectorAll('.pitem')].map((b) => b.textContent)")
    check('pickers: each label shows what it names (the heading, the equation)', len(rows) == 2 and 'Intro' in rows[0] and 'β' in rows[1], rows)
    key(page, 'ArrowDown'); key(page, 'Enter', 400)
    check('pickers: Down, Enter takes the second label and closes the picker', 'See \\eqref{eq:euler}' in src(page) and active(page) == 'pages', (src(page)[src(page).find('See'):][:40], active(page)))
    typed(page, ' XYZ')
    check('pickers: the next words go after the reference', 'See \\eqref{eq:euler} XYZLast' in src(page), src(page)[src(page).find('See'):][:40])
    click_text(page, 'Last', 0)
    typed(page, 'Cf. '); typed(page, '\\', 300); typed(page, 'cite'); key(page, 'Enter', 400)
    typed(page, 'barro'); key(page, 'Control+Enter', 300)
    check('pickers: Ctrl+Enter cites and stays for another work', page.evaluate("!!document.getElementById('pop-citesearch')") and '\\citep{barro2004}' in src(page), src(page)[src(page).find('Cf.'):][:40])
    typed(page, 'ramsey'); key(page, 'Enter', 400); typed(page, ' QQ')
    check('pickers: Enter cites the second and closes, the words after it', 'Cf. \\citep{barro2004, ramsey1928} QQ' in src(page) and active(page) == 'pages', src(page)[src(page).find('Cf.'):][:50])


PARTS = [footnote, dollars, latex, tab, pickers]


def run():
    only = sys.argv[1:]
    with sync_playwright() as p:
        browser, page, errors = open_page(p)
        for f in PARTS:
            if only and f.__name__ not in only: continue
            try: f(page)
            except Exception as e: check(f.__name__ + ' runs to its end', False, str(e)[:300])
            page.keyboard.press('Escape'); page.evaluate('window.rikuy.closePop && window.rikuy.closePop(true)')
        check('no page errors', not [e for e in errors if 'tree.wasm' not in e and 'TeX' not in e], errors[:4])
        browser.close()
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    run()
