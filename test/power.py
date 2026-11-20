"""A power user's keys (docs/handoff/POWER-USER.md): every place the audit found the keys going
somewhere wrong without a word, pressed as a person presses them, the source checked byte for
byte and the caret where the next key lands.

footnote: Esc, Shift+F5, Right at its end and Ctrl+End leave a footnote typed at the page's foot
(finding 1). dollars: $x^2$, \\(x\\), $$x^2$$ and \\$ typed as in Overleaf (2; review M6, L6). latex:
LaTeX typed into the equation field as it is typed in the source, braces and all, and what the
field cannot hold carried on in its LaTeX box (3). tab: Tab keeps the keyboard on the page, a
first line indent at a paragraph's start, a gap elsewhere; Esc then Tab leaves (6). pickers: the
reference and citation pickers by the keys, Enter closing them, with what each label names (7).
follow: F12 on a cross reference selected, or Ctrl+click on it, goes to its label, Shift+F5 back
(F12 beside one is Save As); Enter or F2 on a
formula selected alone opens it (8). linear: Ctrl+Shift+= in a new equation shows that equation
as its LaTeX on the page, never the paragraph before it (13). modes: Esc leaves Focus and Read
Mode with the caret on the page. keytips: F10 (or Alt), a tab's letter, then a command's letters run it
(H 1 is Bold, N T Insert's Table, H T Home's own Table); a letter that matches nothing is taken by
the KeyTips and never typed into the document (5). palette: Alt+Q finds by letters in order and
initials ("tbl", "hed 2", "heading2", "eqn", "toc"), lists the commands run last when empty, and
puts them first among matches as good (9). insertlist: the \\ insert list writes valid LaTeX: a math
command opens a formula holding it, \\begin{name} the environment, figure, align and cases their
own; a theorem brings its \\newtheorem; Enter twice leaves a theorem (10). repeat: F4 types the last
run of typing again, as Word's, and repeats a command as before (14); the search box throws
nothing while its place is a blank paragraph gone since (18). quickopen: Ctrl+P goes to a file of the
project by a few letters, the page's own files on the page, others in the source pane; Ctrl+P then
Enter prints, as Word's (17). burst: letters typed faster than the page is built go in together,
in order, AutoCorrect still acting on the words it corrects; any other key, Undo, a paste first write
what waits (4; review M1).
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
    # (review L1) Ctrl+End after a display formula or a table that ends the text, as Word's
    for end, name in (('Last text.\n\\begin{equation}\n  x = 1\n\\end{equation}', 'equation'), ('Last text.\n\n\\begin{tabular}{ll}\n  a & b \\\\\n  c & d\n\\end{tabular}', 'tabular')):
        load_doc(page, FN.replace('Next paragraph.', end))
        click_text(page, 'Alpha', 0); key(page, 'Control+End'); typed(page, 'ZZ')
        s = src(page)
        check('footnote: Ctrl+End goes after a closing ' + name, 'ZZ' in s and s.index('ZZ') > s.index('\\end{' + name + '}') and s.index('ZZ') < s.index('\\end{document}') and 'd\nZZ' not in s, s[40:160])


MATH = '\\documentclass{article}\n\\usepackage{amsmath,amssymb}\n\\begin{document}\n\nAlpha beta gamma.\n\nNext paragraph.\n\n\\end{document}\n'


def dollars(page):
    for typed_, want, label in ((' so $x^2$ is fine', ' So $x^2$ is fine', 'x^2'), (' and $\\alpha$ more', ' And $\\alpha$ more', 'a command before it'),
                                (' it costs \\$5', ' It costs \\$5', '\\$ a dollar sign at once (review M6)'),
                                (' so \\(x\\) y', ' So \\(x\\) y', '\\( and \\) (review M6)'),
                                (' a $ $ b', ' A \\$ \\$ b', 'a lone $ and a space (review L6)')):
        load_doc(page, MATH)
        click_text(page, 'gamma.', 6)
        for ch in typed_:
            page.keyboard.type(ch); page.wait_for_timeout(250 if ch == '$' else 25)
        page.wait_for_timeout(300)
        s = src(page)
        check('dollars: ' + label + ' typed as in the source', 'gamma.' + want + '\n' in s, s[60:140])
        check('dollars: ' + label + ': the caret back on the page', active(page) == 'pages', active(page))
    # $$ … $$ on a line of its own: a display, the second $ of each pair taken (review M6)
    load_doc(page, MATH)
    click_text(page, 'gamma.', 6); key(page, 'Enter')
    for ch in '$$x^2$$ end':
        page.keyboard.type(ch); page.wait_for_timeout(300 if ch == '$' else 30)
    page.wait_for_timeout(300)
    s = src(page); i = s.find('gamma.')
    check('dollars: $$x^2$$ is a display, the text after it', '\\[' in s[i:] and 'x^2' in s[i:] and '\\]' in s[i:] and 'end' in s[s.find('\\]'):] and '\\$' not in s, s[i:i + 60])
    # $$ alone is a dollar sign at once, as before (features.py); a digit, a space, a sign or Esc
    # after it keeps it (a price); a letter or a backslash makes it the display
    for typed_, want, label in ((' costs $$5 now', ' Costs \\$5 now', 'a digit'), (' a $$ b', ' A \\$ b', 'a space'), (' ($$)', ' (\\$)', 'a sign')):
        load_doc(page, MATH)
        click_text(page, 'gamma.', 6)
        for ch in typed_:
            page.keyboard.type(ch); page.wait_for_timeout(250 if ch == '$' else 25)
        page.wait_for_timeout(300)
        s = src(page)
        check('dollars: $$ then ' + label + ' is a dollar sign', 'gamma.' + want + '\n' in s and active(page) == 'pages', (s[60:140], active(page)))
    load_doc(page, MATH)
    click_text(page, 'gamma.', 6)
    for ch in ' x$$': page.keyboard.type(ch); page.wait_for_timeout(250 if ch == '$' else 25)
    check('dollars: $$ writes the dollar sign at once', 'gamma. x\\$\n' in src(page), src(page)[60:120])
    key(page, 'Escape', 200); typed(page, 'y')
    check('dollars: Esc after $$ keeps it', 'gamma. x\\$y\n' in src(page), src(page)[60:120])
    load_doc(page, MATH)
    click_text(page, 'gamma.', 6); key(page, 'Enter')
    for ch in '$$\\alpha+1$$ end':
        page.keyboard.type(ch); page.wait_for_timeout(300 if ch == '$' else 30)
    page.wait_for_timeout(300)
    s = src(page); i = s.find('gamma.')
    check('dollars: $$\\alpha+1$$ is a display holding \\alpha', '\\[' in s[i:] and '\\alpha+1' in s[i:] and 'end' in s[s.find('\\]'):] and '\\$' not in s, s[i:i + 60])
    seen = []
    for _ in range(5):
        if src(page) == MATH: break
        key(page, 'Control+z', 300); seen.append(src(page))
    check('dollars: undo goes back to the start, the dollar sign $$ wrote never among its steps', src(page) == MATH and not any('\\$' in x for x in seen), [x[60:120] for x in seen])
    # Esc in the insert list keeps what was typed (review M6)
    load_doc(page, MATH)
    click_text(page, 'gamma.', 6); typed(page, ' '); typed(page, '\\', 300); typed(page, 'LaTeX'); key(page, 'Escape', 300)
    check('dollars: Esc in the insert list writes what was typed, as text, never a command', 'gamma. \\textbackslash{}LaTeX' in src(page), src(page)[60:100])
    load_doc(page, MATH)
    click_text(page, 'gamma.', 6); typed(page, ' z '); typed(page, '\\', 300); typed(page, 'sec'); key(page, 'Escape', 300); typed(page, ' w')
    check('dollars: \\sec then Esc in prose is the text \\sec, not the formula command', 'gamma. Z \\textbackslash{}sec w' in src(page), src(page)[60:110])
    # a price as Word users type it: $ a number and a space is a dollar sign (verification of 2308408)
    for typed_, want in ((' costs $5 each', ' Costs \\$5 each'), (' pay $12.50 now', ' Pay \\$12.50 now'), (' so $5x$ ok', ' So $5x$ ok')):
        load_doc(page, MATH)
        click_text(page, 'gamma.', 6)
        for ch in typed_:
            page.keyboard.type(ch); page.wait_for_timeout(250 if ch == '$' else 40)
        page.wait_for_timeout(300)
        s = src(page)
        check('dollars: ' + typed_.strip() + ' gives' + want, 'gamma.' + want + '\n' in s and active(page) == 'pages', (s[60:130], active(page)))


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
    # an input method, dictation or the emoji panel in \\text{…}: on in the LaTeX box (review H2)
    cdp = page.context.new_cdp_session(page)
    for how, text in (('dictation', 'if '), ('an input method', '日本')):
        page.evaluate('window.rikuy.closePop && window.rikuy.closePop(true)')
        load_doc(page, MATH)
        click_text(page, 'gamma.', 6)
        key(page, 'Enter'); key(page, 'Alt+Equal', 600)
        page.keyboard.type('x=1\\text{', delay=15); page.wait_for_timeout(200)
        if how == 'dictation': cdp.send('Input.insertText', {'text': text})
        else: cdp.send('Input.imeSetComposition', {'text': 'ひ', 'selectionStart': 1, 'selectionEnd': 1}); page.wait_for_timeout(150); cdp.send('Input.insertText', {'text': text})
        page.wait_for_timeout(250)
        page.keyboard.type('}+y', delay=15); page.wait_for_timeout(500)
        s = src(page); body = ''.join(s[s.find('\\begin{equation}'):s.find('\\end{equation}')].split())
        check('latex: ' + how + ' in \\text{…} keeps it in the \\text', ('\\text{' + text.strip() + '}+y') in body, body)
        key(page, 'Escape', 300)
    # what the field cannot hold goes on in its LaTeX box, typed on there
    load_doc(page, MATH)
    click_text(page, 'gamma.', 6)
    key(page, 'Enter'); key(page, 'Alt+Equal', 600)
    page.keyboard.type(r'\begin{', delay=15); page.wait_for_timeout(200)
    check('latex: \\begin{ moves on to the LaTeX box', active(page) == 'pop-tex', active(page))
    page.keyboard.type(r'aligned}a&=b\\c&=d\end{aligned}', delay=10); page.wait_for_timeout(300)
    # (review N2) a box the field handed over to keeps the field's keys: Enter is done
    key(page, 'Enter', 400); typed(page, ' Next words.')
    s = src(page)
    check('latex: an aligned block typed through the LaTeX box', '\\begin{aligned}a&=b\\\\c&=d\\end{aligned}' in s, s[60:200])
    check('latex: Enter in the box the field handed over to finishes, the words after the equation', '\\end{equation}' in s and s.find('Next words.') > s.find('\\end{equation}') and active(page) == 'pages', (s[60:220], active(page)))
    for how in ('Enter', 'Control+Enter'):
        page.evaluate('window.rikuy.closePop && window.rikuy.closePop(true)')
        load_doc(page, MATH)
        click_text(page, 'gamma.', 6)
        key(page, 'Enter'); key(page, 'Alt+Equal', 600)
        page.keyboard.type('x=1\\text{', delay=15); page.wait_for_timeout(200)
        cdp.send('Input.imeSetComposition', {'text': 'ひ', 'selectionStart': 1, 'selectionEnd': 1}); page.wait_for_timeout(150); cdp.send('Input.insertText', {'text': '日本'})
        page.wait_for_timeout(250); page.keyboard.type('}+y', delay=15); page.wait_for_timeout(300)
        key(page, how, 400)
        if how == 'Enter':
            typed(page, ' Next words.'); s = src(page)
            check('latex: after an input method in \\text{, Enter finishes the display', '\\text{日本}+y' in s and s.find('Next words.') > s.find('\\end{equation}') > 0 and active(page) == 'pages', (s[60:220], active(page)))
        else:
            page.keyboard.type('z=2', delay=15); page.wait_for_timeout(300); key(page, 'Enter', 400); s = src(page)
            check('latex: and Ctrl+Enter there a new row, the display made one of rows', '\\begin{align}' in s and '+y \\\\' in s and 'z=2' in s and active(page) == 'pages', (s[60:240], active(page)))
    # (review N1) a chord with \text{ or \mathbb{ open ends the argument first; the field's own
    # insertion is never taken for typing
    for keys, want in (('x=1\\text{if', '\\text{if}'), ('x\\in\\mathbb{R', '\\mathbb{R}')):
        page.evaluate('window.rikuy.closePop && window.rikuy.closePop(true)')
        load_doc(page, MATH)
        click_text(page, 'gamma.', 6)
        key(page, 'Enter'); key(page, 'Alt+Equal', 600)
        page.keyboard.type(keys, delay=15); page.wait_for_timeout(200)
        key(page, 'Control+Enter', 400); page.wait_for_timeout(300)
        s = src(page)
        check('latex: Ctrl+Enter in ' + want[:-2] + '…} ends it, nothing else written', want in s and 'insertText' not in s, s[60:220])
        key(page, 'Escape', 300)


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
    check('tab: the page says how to leave it (review M4)', 'Escape, then Tab, leaves' in page.evaluate("document.getElementById('pages-how').textContent"), None)
    # (review L4) over a selection as Word's: inside the text the gap takes its place; from a
    # paragraph's start the paragraph's left indent a step in, Shift+Tab out again; a heading's gap
    load_doc(page, TAB)
    select_text(page, 'beta'); key(page, 'Tab')
    check('tab: Tab over words inside the text puts the gap in their place', 'Alpha \\quad gamma.' in src(page) and active(page) == 'pages', src(page)[40:80])
    load_doc(page, TAB)
    select_text(page, 'Third one'); key(page, 'Tab', 400)
    s = src(page)
    check('tab: Tab over words from a paragraph\'s start indents the paragraph', 'adjustwidth' in s and 'Third one here.' in s, s[60:220])
    select_text(page, 'Third one'); key(page, 'Shift+Tab', 400)
    s = src(page)
    check('tab: Shift+Tab takes it out again', '\\begin{adjustwidth}' not in s and '\n\nThird one here.\n\n' in s, s[60:220])
    load_doc(page, TAB.replace('Alpha beta', '\\section{Intro words}\n\nAlpha beta'))
    click_text(page, 'Intro words', 5); key(page, 'Tab')
    check('tab: Tab in a heading leaves its gap', '\\section{Intro\\quad words}' in src(page), src(page)[40:90])


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
    # (review M5) a combobox over a listbox of options, and a polite count as the filter narrows
    typed(page, 'eu')
    aria = page.evaluate("""(() => { const i = document.getElementById('pop-refsearch'), l = document.getElementById(i.getAttribute('aria-controls') || '-'), live = l && l.parentElement.querySelector('[aria-live=polite]');
      return [i.getAttribute('role'), l && l.getAttribute('role'), [...l.querySelectorAll('.pitem')].every((o) => o.getAttribute('role') === 'option'), !!document.getElementById(i.getAttribute('aria-activedescendant') || '-'), live && live.textContent]; })()""")
    check('pickers: a combobox, a listbox of options, the highlighted one named, the count said', aria == ['combobox', 'listbox', True, True, '1 match'], aria)
    page.keyboard.press('Backspace'); page.keyboard.press('Backspace'); page.wait_for_timeout(150)
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


FOLLOW = ('\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n\n\\section{Intro}\\label{sec:intro}\n\nAlpha beta $x+y$ gamma, see Section~\\ref{sec:model} now.\n\n'
          '\\section{Model}\\label{sec:model}\n\nModel text here.\n\n\\end{document}\n')


def follow(page):
    load_doc(page, FOLLOW)
    there = FOLLOW.index('\\section{Model}')
    # F12 with the caret beside a reference, nothing selected, is Save As, as Word's (review H1)
    click_text(page, ' now', 0)
    start = caret(page)
    try:
        with page.expect_download(timeout=5000) as d: key(page, 'F12', 400)
        got = d.value.suggested_filename
    except Exception: got = None
    check('follow: F12 beside a reference, nothing selected, downloads (Save As) and stays', got and caret(page) == start, (got, caret(page), start))
    for how in ('F12', 'Ctrl+click'):
        click_text(page, ' now', 0)
        if how == 'F12': key(page, 'Shift+ArrowLeft')
        start = caret(page)
        if how == 'F12': key(page, 'F12', 400)
        else: page.click('#pages .atom >> nth=1', modifiers=['Control']); page.wait_for_timeout(400)
        c = caret(page)
        check('follow: ' + how + ' on a reference goes to its label', c and there <= c[1] <= there + 60 and src(page) == FOLLOW, (c, start))
        key(page, 'Shift+F5', 300)
        check('follow: Shift+F5 comes back to the reference (' + how + ')', caret(page) == start, (caret(page), start))
    for k in ('Enter', 'F2'):
        page.evaluate('window.rikuy.closePop && window.rikuy.closePop(true)')
        load_doc(page, FOLLOW)
        click_text(page, ' gamma', 0); key(page, 'Shift+ArrowLeft'); key(page, k, 500)
        opened = page.evaluate("!!(document.getElementById('pop-field') || document.getElementById('pop-tex'))")
        check('follow: ' + k + ' on a formula selected alone opens it, the source as it was', opened and src(page) == FOLLOW, (opened, src(page)[60:120]))
        key(page, 'Escape', 300)


def linear(page):
    load_doc(page, MATH)
    click_text(page, 'gamma.', 6)
    key(page, 'Enter'); key(page, 'Alt+Equal', 600); typed(page, 'x+1', 300)
    key(page, 'Control+Shift+Equal', 600)
    box = page.evaluate("(() => { const b = [...document.querySelectorAll('.it.tex.texview')]; return b.map((x) => x.textContent); })()")
    check('linear: Ctrl+Shift+= in a new equation shows it as its LaTeX on the page', len(box) == 1 and box[0].startswith('\\begin{equation}') and 'x+1' in box[0] and 'gamma' not in box[0], box)
    page.evaluate('window.rikuy.hideLatexViews()')


def modes(page):
    load_doc(page, MATH)
    for name in ('Focus', 'Read Mode'):
        click_text(page, 'Next', 2)
        page.evaluate("window.rikuy.runCommand(%r)" % ('focus' if name == 'Focus' else 'read-mode')); page.wait_for_timeout(700)
        on = page.evaluate("document.body.classList.contains('focus') || window.rikuy.view === 'pdf'")
        key(page, 'Escape', 800)
        off = page.evaluate("!document.body.classList.contains('focus') && window.rikuy.view !== 'pdf'")
        check('modes: Esc leaves ' + name + ' with the keyboard on the page', on and off and active(page) == 'pages', (on, off, active(page)))
        typed(page, 'Q')
        check('modes: and the next key types there (' + name + ')', 'Q' in src(page), src(page)[60:110])
        load_doc(page, MATH)


def keytips(page):
    load_doc(page, MATH)
    select_text(page, 'beta')
    for k in ('F10', 'h', '1'): key(page, k, 250)
    check('keytips: F10, H, 1 makes the selection bold', '\\textbf{beta}' in src(page), src(page)[60:110])
    load_doc(page, MATH)
    click_text(page, 'beta', 2)
    # (z and a start no KeyTip of Insert's; J and W do since Word's gaps were built)
    for k in ('F10', 'n', 'z', 'a'): key(page, k, 200)
    check('keytips: letters no KeyTip has are taken, none typed into the text', src(page) == MATH and page.evaluate("document.querySelectorAll('.rb-kt-layer .rb-kt').length") > 0, src(page)[60:100])
    key(page, 't', 400)
    menu = page.evaluate("!!document.querySelector('[role=grid][aria-label=\"Table size\"]')")
    check('keytips: N then T opens Insert\'s Table, its grid as Word\'s', menu and src(page) == MATH, menu)
    key(page, 'Escape', 200); key(page, 'Escape', 200)
    page.evaluate('window.rikuy.closePop && window.rikuy.closePop(true)')
    click_text(page, 'beta', 2)
    for k in ('Alt', 'q', 'x'): key(page, k, 200)
    check('keytips: a letter no tab has is taken too', src(page) == MATH, src(page)[60:100])
    key(page, 'Escape', 200); key(page, 'Escape', 200)
    click_text(page, 'beta', 2); typed(page, 'Z')
    check('keytips: after Esc the keys type again', 'beZta' in src(page), src(page)[60:100])


def palette(page):
    load_doc(page, MATH)
    for q, want in (('tbl', 'table'), ('hed 2', 'style-heading2'), ('heading2', 'style-heading2'), ('eqn', 'equation'), ('toc', 'table-of-contents'), ('insrt table', 'insert-table-dialog'), ('xref', 'cross-reference')):
        got = page.evaluate('(q) => window.rikuy.searchCommands(q).map((c) => c.id)', q)
        check('palette: "' + q + '" finds ' + want, want in got[:3], got[:5])
    page.evaluate('window.rikuy.prefs.recentCmds = []')
    select_text(page, 'beta'); key(page, 'Control+b'); key(page, 'Control+i')
    click_text(page, 'gamma', 1); key(page, 'Alt+q', 300)
    rows = page.evaluate("[...document.querySelectorAll('#rk-search-list .srch-opt')].map((o) => o.querySelector('.srch-n').textContent)")
    check('palette: the empty box lists the commands run last, newest first', rows[:2] == ['Italic', 'Bold'], rows)
    page.keyboard.type('b'); page.wait_for_timeout(200)
    first = page.evaluate("(document.querySelector('#rk-search-list .srch-opt .srch-n') || {}).textContent")
    check('palette: a command run lately comes first among matches as good', first == 'Bold', first)
    key(page, 'Escape'); key(page, 'Escape')


PLAIN = '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n\nAlpha beta gamma.\n\nLast one.\n\n\\end{document}\n'


def insert_list(page, q, wait=500):
    typed(page, '\\', 300); page.fill('#pop-cmd', q); page.wait_for_timeout(150); key(page, 'Enter', wait)


def insertlist(page):
    load_doc(page, PLAIN)
    click_text(page, 'gamma.', 6); typed(page, ' so '); insert_list(page, 'alpha'); typed(page, '+1'); key(page, 'Enter', 400)
    check('insertlist: \\alpha in the text opens a formula holding it', 'gamma. So $\\alpha +1$' in src(page) or 'gamma. So $\\alpha+1$' in src(page), src(page)[60:110])
    load_doc(page, PLAIN)
    click_text(page, 'gamma.', 6); key(page, 'Enter'); insert_list(page, 'figure'); typed(page, 'Output')
    check('insertlist: figure writes a figure with its caption and label, the caret in the caption', '\\begin{figure}[htbp]' in src(page) and '\\caption{Output}\n  \\label{fig:1}' in src(page), src(page)[60:260])
    load_doc(page, PLAIN)
    click_text(page, 'gamma.', 6); key(page, 'Enter'); insert_list(page, 'align', 700)
    check('insertlist: align opens aligned rows in the equation field', '\\begin{align}' in src(page) and page.evaluate("!!document.getElementById('pop-field') || !!document.getElementById('pop-tex')"), src(page)[60:160])
    key(page, 'Escape', 300); page.evaluate('window.rikuy.closePop && window.rikuy.closePop(true)')
    load_doc(page, PLAIN)
    click_text(page, 'gamma.', 6); key(page, 'Enter'); insert_list(page, 'begin{quote}')
    typed(page, 'Q')
    check('insertlist: begin{quote} writes the environment', '\\begin{quote}\nQ\n\\end{quote}' in src(page), src(page)[60:160])
    load_doc(page, PLAIN)
    click_text(page, 'gamma.', 6); key(page, 'Enter'); insert_list(page, 'theorem'); typed(page, 'Stmt.')
    s = src(page)
    check('insertlist: a theorem brings its \\newtheorem where the preamble has none', '\\newtheorem{theorem}{Theorem}' in s and s.index('\\newtheorem') < s.index('\\begin{document}') and '\\begin{theorem}\nStmt.\n\\end{theorem}' in s, s[:260])
    key(page, 'Enter'); key(page, 'Enter'); typed(page, 'After it.')
    s = src(page)
    check('insertlist: Enter twice leaves the theorem', '\\begin{theorem}\nStmt.\n\\end{theorem}\n\nAfter it.' in s, s[s.find('\\begin{theorem}'):][:80])
    # (review H3) a minipage, a beamer frame or a center keep their paragraphs: Enter twice stays in
    for env in ('minipage}{0.4\\linewidth', 'center'):
        name = env.split('}')[0]
        D = PLAIN.replace('Last one.', '\\begin{' + env + '}\nInside text.\n\\end{' + name + '}')
        load_doc(page, D)
        click_text(page, 'Inside text.', 12); key(page, 'Enter'); key(page, 'Enter'); typed(page, 'NEW')
        s = src(page)
        check('insertlist: Enter twice in a ' + name + ' stays in it', 'Inside text.\n\nNEW' in s and s.index('NEW') < s.index('\\end{' + name + '}'), s[s.find('Inside'):][:60])
    load_doc(page, PLAIN)
    click_text(page, 'gamma.', 6); key(page, 'Enter'); insert_list(page, 'proof'); typed(page, 'Easy.')
    check('insertlist: a proof brings amsthm', '\\usepackage{amsmath,amsthm}' in src(page) or '\\usepackage{amsthm}' in src(page), src(page)[:120])
    # (review M2) a block typed in a heading goes after the heading and its label; in a caption it is
    # refused; a list comes with its first \item, a tabular with columns
    D = PLAIN.replace('Alpha beta', '\\section{Intro words}\\label{s:i}\n\nAlpha beta').replace('Last one.', '\\begin{figure}\n  \\centering\n  \\caption{Results here}\n\\end{figure}\n\nLast one.')
    load_doc(page, D)
    click_text(page, 'Intro words', 5); insert_list(page, 'figure'); typed(page, 'Cap')
    s = src(page)
    check('insertlist: a figure typed in a heading goes after the heading and its label', '\\section{Intro words}\\label{s:i}' in s and s.index('\\begin{figure}[htbp]') > s.index('\\label{s:i}') and '\\caption{Cap}' in s, s[60:260])
    load_doc(page, D)
    click_text(page, 'Results here', 7); before = src(page); insert_list(page, 'theorem')
    check('insertlist: a theorem typed in a caption is refused, the source unchanged', src(page) == before and 'caption' in page.evaluate("(document.getElementById('toast') || {}).textContent || ''"), src(page)[60:300])
    for env, want in (('itemize', '\\begin{itemize}\n  \\item X\n\\end{itemize}'), ('enumerate', '\\begin{enumerate}\n  \\item X\n\\end{enumerate}'), ('tabular', '\\begin{tabular}{ll}\n  X & \\\\\n\\end{tabular}')):
        load_doc(page, PLAIN)
        click_text(page, 'gamma.', 6); key(page, 'Enter'); insert_list(page, 'begin{' + env + '}'); typed(page, 'X')
        check('insertlist: begin{' + env + '} writes a ' + env + ' TeX takes', want in src(page), src(page)[60:200])
    # (review L5) \o, \O and \quad are text, written as typed with their case; \Gamma a formula
    for q, want in (('o', 'gamma.\\o'), ('O', 'gamma.\\O'), ('quad', 'gamma.\\quad'), ('Gamma', 'gamma.$\\Gamma')):
        load_doc(page, PLAIN)
        click_text(page, 'gamma.', 6); insert_list(page, q)
        if q == 'Gamma': key(page, 'Enter', 400)
        s = src(page)
        check('insertlist: \\' + q + ' Enter writes ' + want[6:], want in s and (q == 'Gamma' or '$' not in s) and '\\footnote' not in s, s[60:120])


def repeat(page):
    load_doc(page, PLAIN)
    click_text(page, 'gamma.', 6); typed(page, ' and so on')
    click_text(page, 'one.', 4); key(page, 'F4', 300)
    check('repeat: F4 types the last run of typing again', 'Last one. and so on' in src(page), src(page)[60:130])
    key(page, 'F4', 300)
    check('repeat: and again', 'Last one. and so on and so on' in src(page), src(page)[60:150])
    select_text(page, 'Alpha'); key(page, 'Control+b'); select_text(page, 'Last'); key(page, 'F4', 300)
    check('repeat: F4 after Bold makes the next selection bold, as before', '\\textbf{Last}' in src(page), src(page)[60:150])
    # the search box's place, a blank paragraph that went when the box took the focus
    load_doc(page, PLAIN)
    n0 = page.evaluate('window.__errs = 0; 0')
    page.evaluate("window.addEventListener('error', () => { window.__errs++; })")
    click_text(page, 'gamma.', 6); key(page, 'Enter'); key(page, 'Alt+q', 300)
    page.keyboard.type('theorem', delay=30); page.wait_for_timeout(300)
    check('repeat: the search box throws nothing for a blank paragraph gone since', page.evaluate('window.__errs') == 0 and page.evaluate("document.querySelectorAll('#rk-search-list .srch-opt').length") > 0)
    key(page, 'Escape'); key(page, 'Escape')


def quickopen(page):
    main = '\\documentclass{article}\n\\begin{document}\n\n\\section{Intro}\n\nAlpha beta gamma.\n\n\\input{model}\n\n\\end{document}\n'
    load_doc(page, {'main.tex': main, 'model.tex': '\\section{Model}\n\nZebra text in the second file.\n', 'refs.bib': '@book{a,\n  title = {A},\n  year = {2000}\n}\n', 'proofs.tex': '\\section{Proofs}\n'})
    click_text(page, 'Alpha', 0)
    key(page, 'Control+p', 400)
    rows = page.evaluate("[...document.querySelectorAll('.pop-qo .pitem b')].map((b) => b.textContent)")
    check('quickopen: Ctrl+P lists Print first, then the project\'s files', rows[:1] == ['Print PDF'] and set(rows[1:]) == {'main.tex', 'model.tex', 'refs.bib', 'proofs.tex'}, rows)
    # (review M3) once a letter is typed the files alone: "pr" Enter opens proofs.tex, never prints
    typed(page, 'pr')
    rows = page.evaluate("[...document.querySelectorAll('.pop-qo .pitem b')].map((b) => b.textContent)")
    check('quickopen: a letter typed lists the files alone, Print gone', rows[:1] == ['proofs.tex'] and 'Print PDF' not in rows, rows)
    key(page, 'Escape', 200); click_text(page, 'Alpha', 0)
    key(page, 'Control+p', 400)
    typed(page, 'mod'); key(page, 'Enter', 400)
    c = caret(page)
    check('quickopen: a few letters and Enter put the caret in that file on the page', c and c[0] == 'model.tex' and active(page) == 'pages', (c, active(page)))
    key(page, 'Control+p', 400); typed(page, 'refs'); key(page, 'Enter', 1200)
    check('quickopen: a file the page does not draw opens in the source pane', page.evaluate('window.rikuy.srcFile') == 'refs.bib' and page.evaluate("document.body.classList.contains('src-on')"), page.evaluate('window.rikuy.srcFile'))
    page.evaluate('window.rikuy.toggleSource(false)'); page.wait_for_timeout(300)
    click_text(page, 'Alpha', 0)
    page.evaluate('window.__printed = 0; window.rikuy.pagePrint = () => { window.__printed = 1; }')
    key(page, 'Control+p', 400); key(page, 'Enter', 300)
    check('quickopen: Ctrl+P, Enter prints, as Word\'s', page.evaluate('window.__printed') == 1)
    page.evaluate('window.__printed = 0'); click_text(page, 'Alpha', 0)
    key(page, 'Control+p', 400); typed(page, 'print'); key(page, 'Enter', 300)
    check('quickopen: Print found by its name, "print" then Enter prints', page.evaluate('window.__printed') == 1)


# keys fed to the page's own handler faster than it builds the page, every key already due handed
# over before a timer, as the browser gives input the first turn (dev/bench's long document makes
# the builds slow enough)
BURST = '''([text, gap]) => new Promise((done) => {
  const g = window.rikuy, n0 = g.files.get(g.main).length, t0 = performance.now(); let i = 0, builds = 0;
  const rb = g.rebuild; g.rebuild = function (...a) { builds++; return rb.apply(this, a); };
  const ev = (ch) => ({ inputType: 'insertText', data: ch, isComposing: false, preventDefault() {}, getTargetRanges: () => [] });
  const tick = () => {
    // (each key as late as it is: the keyboard made it at its time, the page hands it over now)
    while (i < text.length && t0 + i * gap <= performance.now()) { g.keyLate = performance.now() - (t0 + i * gap); g.onBeforeInput(ev(text[i++])); }
    if (i < text.length) setTimeout(tick, Math.max(0, t0 + i * gap - performance.now()));
    else setTimeout(() => { g.rebuild = rb; done({ builds }); }, 300);
  };
  tick();
})'''


def burst(page):
    D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dev', 'bench', 'long')
    files = {f: open(os.path.join(D, f)).read() for f in os.listdir(D) if f.endswith(('.tex', '.bib'))}
    load_doc(page, files); page.wait_for_timeout(800)
    # (a phone's speed: a key's build is then far longer than the time between a typist's keys)
    cdp = page.context.new_cdp_session(page); cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
    page.evaluate('''() => { const sp = [...document.querySelectorAll('#pages span.t')].filter((s) => s.textContent.length > 40); const s = sp[Math.floor(sp.length / 2)]; s.scrollIntoView({ block: 'center' }); const r = document.createRange(); r.setStart(s.firstChild, s.textContent.indexOf('. ') + 1); r.collapse(true); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }''')
    page.wait_for_timeout(300)
    before = src(page, files and 'main.tex')
    text = ' so the monday plan works'
    r = page.evaluate(BURST, [text, 5])
    after = src(page)
    check('burst: a run typed faster than the page builds goes in whole and in order, AutoCorrect on its words', ' So the Monday plan works' in after, after[:0])
    check('burst: in fewer builds of the page than keys', r['builds'] < len(text) - 5, r)
    n = 0
    while src(page) != before and n < 10:
        page.evaluate('window.rikuy.undo()'); n += 1
    check('burst: undo gives the bytes back', src(page) == before, n)
    # another key first writes what waits: letters queued, then Backspace
    page.evaluate('''() => { const g = window.rikuy; g.keyLate = 50; const ev = (ch) => ({ inputType: 'insertText', data: ch, isComposing: false, preventDefault() {}, getTargetRanges: () => [] });
      g.onBeforeInput(ev('x')); g.onBeforeInput(ev('y')); g.onBeforeInput(ev('z'));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true })); }''')
    page.wait_for_timeout(100)
    check('burst: a key that is no letter writes the letters waiting first', 'xyz' in src(page) and src(page).count('xyz') == 1, None)
    # (review M1) input with no key, Undo from a menu or a gesture, a paste from the Edit menu,
    # comes after the letters waiting: they go in first
    QUEUE = '''(more) => { const g = window.rikuy; g.keyLate = 50; const ev = (ch) => ({ inputType: 'insertText', data: ch, isComposing: false, preventDefault() {}, getTargetRanges: () => [] });
      for (const ch of 'QRS') g.onBeforeInput(ev(ch)); const waiting = g.typeQ; more(g); return waiting; }'''
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
    base = src(page)
    waiting = page.evaluate(QUEUE.replace('(more) =>', '() =>').replace('more(g);', "g.onBeforeInput({ inputType: 'historyUndo', preventDefault() {}, getTargetRanges: () => [] });"))
    page.wait_for_timeout(200)
    check('burst: Undo with letters waiting takes back the typing whole, nothing else', bool(waiting) and src(page) == base, (waiting, src(page) == base))
    page.evaluate('window.rikuy.redo()'); page.wait_for_timeout(200)
    check('burst: and Redo gives the typing back once', src(page).count('QRS') == 1, None)
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
    page.evaluate(QUEUE.replace('(more) =>', '() =>').replace('more(g);', "const dt = new DataTransfer(); dt.setData('text/plain', 'P'); g.root.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));"))
    page.wait_for_timeout(200)
    check('burst: a paste with letters waiting lands after them', 'QRSP' in src(page), None)
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': 1})


PARTS = [footnote, dollars, latex, tab, pickers, follow, linear, modes, keytips, palette, insertlist, repeat, quickopen, burst]


def run():
    only = sys.argv[1:]
    with sync_playwright() as p:
        browser, page, errors = open_page(p)
        for f in PARTS:
            if only and f.__name__ not in only: continue
            try: f(page)
            except Exception as e: check(f.__name__ + ' runs to its end', False, str(e)[:300])
            page.evaluate('window.rikuy.closePop && window.rikuy.closePop(true)')
        check('no page errors', not [e for e in errors if 'tree.wasm' not in e and 'TeX' not in e], errors[:4])
        browser.close()
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    run()
