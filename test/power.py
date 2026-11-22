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
from browser import settle, until, fonts_settled, open_page, check, results, src, click_text, select_text, load_doc
from playwright.sync_api import sync_playwright


def key(page, k, wait=150):
    page.keyboard.press(k); settle(page, wait)


def typed(page, text, wait=200):
    page.keyboard.type(text); settle(page, wait)


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
            page.keyboard.type(ch); settle(page, 250 if ch == '$' else 25)
        settle(page, 300)
        s = src(page)
        check('dollars: ' + label + ' typed as in the source', 'gamma.' + want + '\n' in s, s[60:140])
        check('dollars: ' + label + ': the caret back on the page', active(page) == 'pages', active(page))
    # $$ … $$ on a line of its own: a display, the second $ of each pair taken (review M6)
    load_doc(page, MATH)
    click_text(page, 'gamma.', 6); key(page, 'Enter')
    for ch in '$$x^2$$ end':
        page.keyboard.type(ch); settle(page, 300 if ch == '$' else 30)
    settle(page, 300)
    s = src(page); i = s.find('gamma.')
    check('dollars: $$x^2$$ is a display, the text after it', '\\[' in s[i:] and 'x^2' in s[i:] and '\\]' in s[i:] and 'end' in s[s.find('\\]'):] and '\\$' not in s, s[i:i + 60])
    # $$ alone is a dollar sign at once, as before (features.py); a digit, a space, a sign or Esc
    # after it keeps it (a price); a letter or a backslash makes it the display
    for typed_, want, label in ((' costs $$5 now', ' Costs \\$5 now', 'a digit'), (' a $$ b', ' A \\$ b', 'a space'), (' ($$)', ' (\\$)', 'a sign')):
        load_doc(page, MATH)
        click_text(page, 'gamma.', 6)
        for ch in typed_:
            page.keyboard.type(ch); settle(page, 250 if ch == '$' else 25)
        settle(page, 300)
        s = src(page)
        check('dollars: $$ then ' + label + ' is a dollar sign', 'gamma.' + want + '\n' in s and active(page) == 'pages', (s[60:140], active(page)))
    load_doc(page, MATH)
    click_text(page, 'gamma.', 6)
    for ch in ' x$$': page.keyboard.type(ch); settle(page, 250 if ch == '$' else 25)
    check('dollars: $$ writes the dollar sign at once', 'gamma. x\\$\n' in src(page), src(page)[60:120])
    key(page, 'Escape', 200); typed(page, 'y')
    check('dollars: Esc after $$ keeps it', 'gamma. x\\$y\n' in src(page), src(page)[60:120])
    load_doc(page, MATH)
    click_text(page, 'gamma.', 6); key(page, 'Enter')
    for ch in '$$\\alpha+1$$ end':
        page.keyboard.type(ch); settle(page, 300 if ch == '$' else 30)
    settle(page, 300)
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
    # (the word after the space decides at its end: a space or a mark, W6)
    for typed_, want in ((' costs $5 each.', ' Costs \\$5 each.'), (' pay $12.50 now.', ' Pay \\$12.50 now.'), (' so $5x$ ok', ' So $5x$ ok')):
        load_doc(page, MATH)
        click_text(page, 'gamma.', 6)
        for ch in typed_:
            page.keyboard.type(ch); settle(page, 250 if ch == '$' else 40)
        settle(page, 300)
        s = src(page)
        check('dollars: ' + typed_.strip() + ' gives' + want, 'gamma.' + want + '\n' in s and active(page) == 'pages', (s[60:130], active(page)))
    # (verification of eb14945, V1) the key after the space decides: a letter starting a word makes
    # the price; a sign, <, =, a backslash, a digit or $ keeps the formula that opens with a number
    import re
    for typed_, want in ((' costs $5 and $10 now.', re.escape(' Costs \\$5 and \\$10 now.')), (' it costs $5. Then more', re.escape(' It costs \\$5. Then more')),
                         (' pay $5, then go', re.escape(' Pay \\$5, then go')),
                         (' the $1 - \\alpha$ level', r' The \$1\s*-\s*\\alpha\$ level'), (' with $0 < x < 1$ ok', r' With \$0\s*<\s*x\s*<\s*1\$ ok'),
                         (' and $2 \\times 3$ ok', r' And \$2\s*\\times\s*3\$ ok'), (' so $5 = x$ ok', r' So \$5\s*=\s*x\$ ok'), (' at $5 \b+1$ ok', r' At \$5\+1\$ ok')):
        load_doc(page, MATH)
        click_text(page, 'gamma.', 6)
        for ch in typed_.replace('\\b', '\x08'):
            if ch == '\x08': key(page, 'Backspace', 60); continue
            page.keyboard.type(ch); settle(page, 250 if ch == '$' else 40)
        settle(page, 300)
        s = src(page)
        check('dollars: ' + typed_.strip().replace('\\b', '(Backspace)') + (' is a price' if '\\\\$' in want else ' stays a formula'),
              re.search('gamma\\.' + want + '\n', s) is not None and 'textbackslash' not in s and active(page) == 'pages', (s[60:130], active(page)))
    # (verification of 5446132) W6: $ right after the word keeps the formula ($2 x$), a click away
    # after the word makes the price; W7: a % or \% after the number waits as the number does
    for typed_, want in ((' a $2 x$ term', r' A \$2\s*x\$ term'), (' save $5% now.', re.escape(' Save \\$5\\% now.')), (' save $5\\% now.', re.escape(' Save \\$5\\% now.'))):
        fresh(page, MATH)
        click_text(page, 'gamma.', 6)
        for ch in typed_:
            page.keyboard.type(ch); settle(page, 250 if ch == '$' else 40)
        settle(page, 300)
        s = src(page)
        check('dollars: ' + typed_.strip() + (' is a price' if '%' in typed_ else ' stays a formula'), re.search('gamma\\.' + want + '\n', s) is not None and active(page) == 'pages', (s[60:130], active(page)))
    fresh(page, MATH)
    click_text(page, 'gamma.', 6)
    for ch in ' costs $5 each': page.keyboard.type(ch); settle(page, 250 if ch == '$' else 40)
    xy = page.evaluate("(() => { const s = [...document.querySelectorAll('#pages span.t')].find((x) => x.textContent.includes('Next')); const b = s.getBoundingClientRect(); return [b.left + 2, b.top + b.height / 2]; })()")
    page.mouse.click(xy[0], xy[1]); settle(page, 400)
    check('dollars: $5 each then a click away is a price', 'gamma. Costs \\$5 each\n' in src(page), src(page)[60:130])
    # (verification of befd04a, X2) while the word after "$5 " is typed, the page keeps $5$ and the
    # box says what the word waits for, the word with its space, never $5each$ in math italics
    for width in (1400, 390):
        page.set_viewport_size({'width': width, 'height': 1000})
        fresh(page, MATH)
        click_text(page, 'gamma.', 6)
        for ch in ' costs $5 each': page.keyboard.type(ch); settle(page, 250 if ch == '$' else 60)
        # (the box's 5 reaches the source by its timer, 140 ms after it was typed)
        settle(page, 500, full=True)
        s = src(page)
        h = page.evaluate("(() => { const P = window.rikuy.pop; const e = P && P.el.querySelector('.hint'); if (!e) return null; const r = e.getBoundingClientRect(); return [e.textContent, r.width > 0 && r.right <= innerWidth + 1]; })()")
        f = page.evaluate("(() => { const t = window.rikuy.pop && window.rikuy.pop.el.querySelector('textarea'); return t && t.value; })()")
        check('dollars: "$5 each" being typed at %d px: the page keeps $5$, the box 5, its hint says "$5 each" and what it waits for' % width,
              'gamma. Costs $5$\n' in s and '5each' not in s and f == '5' and h and h[0].startswith('$5 each:') and h[1], (s[60:120], f, h))
        key(page, 'Escape', 400)
        check('dollars: and Esc then makes the price at %d px' % width, 'gamma. Costs \\$5 each\n' in src(page), src(page)[60:120])
    page.set_viewport_size({'width': 1400, 'height': 1000})
    # (agent.py at 90815ba) closed empty or as a price, the formula's Equation tab goes with it: it
    # stayed, and Insert's Equation button was out of reach
    TABS = "(() => [...document.querySelectorAll('[role=tab]')].filter((t) => t.offsetParent).map((t) => t.getAttribute('aria-label') || t.textContent.trim()))()"
    for how, keys in (('empty, by Esc', [' ', '$', 'Escape']), ('empty, by Backspace', [' ', '$', 'x', 'Backspace', 'Backspace']), ('as a price', list(' $5 each.')),
                      ('empty, by the page (closePop, as agent.py closes it)', [' ', '$', 'close']), ('as a price by the page', list(' $5 each') + ['close'])):
        fresh(page, MATH)
        click_text(page, 'gamma.', 6)
        opened = False
        for k in keys:
            if k == 'close': page.evaluate('window.rikuy.closePop(true, true)'); settle(page, 300)
            elif len(k) > 1: key(page, k, 300)
            else: page.keyboard.type(k); settle(page, 300 if k == '$' else 60)
            opened = opened or 'Equation' in page.evaluate(TABS)
        settle(page, 500)
        check('dollars: a formula closed ' + how + ' takes its Equation tab with it', opened and 'Equation' not in page.evaluate(TABS) and not page.evaluate('!!window.rikuy.pop'), page.evaluate(TABS))
    # (verification of befd04a, X1) Backspace deletes a formula's last character, then the formula,
    # as Word's does an equation: no stray \$, no undo step left for it, the caret where the $ was
    for typed_, n in ((' costs $x', 2), (' costs $ab+1', 5), (' costs $5', 2), (' costs $5 each', 7)):
        fresh(page, MATH)
        click_text(page, 'gamma.', 6)
        for ch in typed_.split('$')[0]: page.keyboard.type(ch); settle(page, 40)
        settle(page, 300); h0 = page.evaluate('window.rikuy.hist.length'); s0 = src(page)
        for ch in '$' + typed_.split('$')[1]: page.keyboard.type(ch); settle(page, 250 if ch == '$' else 60)
        settle(page, 400)
        for _ in range(n - 1): key(page, 'Backspace', 200)
        mid = page.evaluate("(() => { const P = window.rikuy.pop; const t = P && P.el.querySelector('textarea'); return t ? t.value : null; })()")
        key(page, 'Backspace', 400)
        check('dollars: ' + typed_.strip() + ', Backspace ' + str(n - 1) + ' times empties it, once more takes it away, no step left',
              mid == '' and src(page) == s0 and page.evaluate('window.rikuy.hist.length') == h0 and active(page) == 'pages', (mid, src(page)[60:120], page.evaluate('window.rikuy.hist.length'), h0, active(page)))
        typed(page, 'Q')
        check('dollars: ' + typed_.strip() + ' taken away, the next key where the $ was', s0.replace('gamma. Costs \n', 'gamma. Costs Q\n') == src(page), src(page)[60:120])

    # W5: an input method's or a dead key's word after "$5 " keeps the space
    cdp = page.context.new_cdp_session(page)
    for ins_, after, want in (('5 each', ' ok.', re.escape(' See \\$5 each ok.')), ('ab cd', '$ ok', r' See \$ab\s*cd\$ ok')):
        page.evaluate('window.rikuy.closePop && window.rikuy.closePop(true)')
        load_doc(page, MATH)
        click_text(page, 'gamma.', 6)
        for ch in ' see $': page.keyboard.type(ch); settle(page, 250 if ch == '$' else 40)
        cdp.send('Input.insertText', {'text': ins_}); settle(page, 400)
        for ch in after: page.keyboard.type(ch); settle(page, 250 if ch == '$' else 40)
        settle(page, 300)
        s = src(page)
        check('dollars: ' + repr(ins_) + ' in one insert after $ keeps its words', re.search('gamma\\.' + want + '\n', s) is not None, s[60:130])
    for how, comp, commit in (('an input method', 'に', '日本'), ('a dead key', '´', 'é')):
        page.evaluate('window.rikuy.closePop && window.rikuy.closePop(true)')
        load_doc(page, MATH)
        click_text(page, 'gamma.', 6)
        for ch in ' price $5 ': page.keyboard.type(ch); settle(page, 250 if ch == '$' else 40)
        cdp.send('Input.imeSetComposition', {'text': comp, 'selectionStart': 1, 'selectionEnd': 1}); settle(page, 200)
        cdp.send('Input.insertText', {'text': commit}); settle(page, 300)
        page.keyboard.type(' ok'); settle(page, 300)
        s = src(page)
        check('dollars: after "$5 " ' + how + '\'s word is the price\'s, the space kept', 'gamma. Price \\$5 ' + commit + ' ok\n' in s and active(page) == 'pages', (s[60:130], active(page)))


def field(page, keys):
    # Alt+= on an empty line, keys typed into the field, Enter: the equation's body as written
    page.evaluate('window.rikuy.closePop && window.rikuy.closePop(true)')
    load_doc(page, MATH)
    click_text(page, 'gamma.', 6)
    key(page, 'Enter'); key(page, 'Alt+Equal', 600)
    page.keyboard.type(keys, delay=15); settle(page, 300)
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
                       ('x^(n+1)', [r'x^{n+1}']),
                       (r'x\in\mathbb{R}', [r'x\in\mathbb{R}'])):
        got = field(page, keys)
        check('latex: ' + keys + ' typed into the equation field', got in [''.join(w.split()) for w in want], got)
    # an input method, dictation or the emoji panel in \\text{…}: on in the LaTeX box (review H2)
    cdp = page.context.new_cdp_session(page)
    for how, text in (('dictation', 'if '), ('an input method', '日本')):
        page.evaluate('window.rikuy.closePop && window.rikuy.closePop(true)')
        load_doc(page, MATH)
        click_text(page, 'gamma.', 6)
        key(page, 'Enter'); key(page, 'Alt+Equal', 600)
        # (inside the race: the box's push of x=1 focuses the field again, and MathLive focuses its
        # keyboard sink 60 ms later; a composition begun before that lost the focus to it, its ひ
        # left in the box as text and 日本 at the box's start. The input begins while that late
        # focus waits, every time)
        page.keyboard.type('x=1\\text{', delay=15)
        until(page, '() => { const m = window.rikuy.pop && window.rikuy.pop.field && window.rikuy.pop.field._mathfield; return !!(m && m.focusBlurInProgress); }', timeout=1000)
        if how == 'dictation': cdp.send('Input.insertText', {'text': text})
        else: cdp.send('Input.imeSetComposition', {'text': 'ひ', 'selectionStart': 1, 'selectionEnd': 1}); settle(page, 150); cdp.send('Input.insertText', {'text': text})
        settle(page, 250)
        # (the field open: its box writes the source 140 ms after the last key, the page's timer)
        page.keyboard.type('}+y', delay=15); settle(page, 500, full=True)
        s = src(page); body = ''.join(s[s.find('\\begin{equation}'):s.find('\\end{equation}')].split())
        check('latex: ' + how + ' in \\text{…} keeps it in the \\text', ('\\text{' + text.strip() + '}+y') in body, body)
        key(page, 'Escape', 300)
    # (CI on 5994e31: \text{if}\}) dictation as the field opens, before MathLive's late focus of
    # its keyboard and its late input event: the keys typed into the field, the dictation and the
    # keys after it all kept, in the \text
    bad = []
    for _ in range(6):
        page.evaluate('window.rikuy.closePop && window.rikuy.closePop(true)')
        load_doc(page, MATH)
        click_text(page, 'gamma.', 6)
        key(page, 'Enter'); key(page, 'Alt+Equal', 20)
        page.keyboard.type('x=1\\text{'); cdp.send('Input.insertText', {'text': 'if '}); settle(page, 250)
        page.keyboard.type('}+y', delay=15); settle(page, 500, full=True)
        s = src(page); body = ''.join(s[s.find('\\begin{equation}'):s.find('\\end{equation}')].split())
        if 'x=1\\text{if}+y' not in body: bad.append(body)
        key(page, 'Escape', 300)
    check('latex: dictation in \\text{…} as the field opens keeps every key, six times over', not bad, bad)
    # (verification of 5446132) W2: the whole formula in one insert with no key: the rest after
    # \text{ goes to the LaTeX box as it came
    page.evaluate('window.rikuy.closePop && window.rikuy.closePop(true)')
    load_doc(page, MATH)
    click_text(page, 'gamma.', 6)
    key(page, 'Enter'); key(page, 'Alt+Equal', 800)
    cdp.send('Input.insertText', {'text': 'x=1\\text{if }+y'}); settle(page, 800); key(page, 'Enter', 600)
    s = src(page); body = ''.join(s[s.find('\\begin{equation}'):s.find('\\end{equation}')].split())
    check('latex: x=1\\text{if }+y in one insert is written as it came', body == '\\begin{equation}x=1\\text{if}+y', body)
    # W3: a press on the field while the box holds \begin{ unfinished keeps the keys in the box
    page.evaluate('window.rikuy.closePop && window.rikuy.closePop(true)')
    load_doc(page, MATH)
    click_text(page, 'gamma.', 6)
    key(page, 'Enter'); key(page, 'Alt+Equal', 800)
    page.keyboard.type('x=\\begin{'); settle(page, 200)
    page.click('#pop-field', timeout=2000); settle(page, 200)
    page.keyboard.type('aligned}a&=b\\end{aligned}'); settle(page, 800)
    box = page.evaluate("(() => { const t = document.querySelector('#pop-tex'); return t && t.value; })()")
    check('latex: a press on the field with \\begin{ unfinished leaves the keys in the LaTeX box', (box or '').strip() == 'x=\\begin{aligned}a&=b\\end{aligned}' and active(page) == 'pop-tex', (box, active(page)))
    key(page, 'Escape', 400)
    # (verification of befd04a, X3) MathLive's late focus of its keyboard, 60 ms after the field took
    # the focus, never takes the box's focus away: the field focused, then the box at once, as a
    # click or a fill of the box as the field arrives (browser.py lost \gamma under load)
    load_doc(page, MATH.replace('Alpha beta', 'Alpha $x+y$ beta'))
    page.click('.a-math >> nth=0'); page.wait_for_selector('#pop-field')
    page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000)
    page.evaluate("(() => { const mf = document.querySelector('#pop-field'), ta = document.querySelector('#pop-tex'); ta.focus(); mf.focus(); const k = mf.shadowRoot && mf.shadowRoot.querySelector('.ML__keyboard-sink'); if (k) k.focus(); ta.focus(); })()")
    settle(page, 300)
    a = active(page); page.keyboard.type('+z'); settle(page, 400)
    box = page.evaluate("(() => { const t = document.querySelector('#pop-tex'); return t && t.value; })()")
    check('latex: the field\'s late focus leaves the box the focus, the keys typed there', a == 'pop-tex' and box == 'x+y+z', (a, box))
    key(page, 'Escape', 400)
    # (and browser.py's case: the box filled the moment the field has the focus)
    for _ in range(3):
        load_doc(page, MATH.replace('Alpha beta', 'Alpha $x+y$ beta'))
        page.click('.a-math >> nth=0'); page.wait_for_selector('#pop-field')
        page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000)
        page.fill('#pop-tex', '\\alpha + \\beta = \\delta'); until(page, '(t) => window.rikuy.files.get("main.tex").includes(t)', '$\\alpha + \\beta = \\delta$'); settle(page, 600)
        s = src(page)
        if '$\\alpha + \\beta = \\delta$' not in s: break
        key(page, 'Escape', 300)
    check('latex: the box filled as the field takes the focus writes what was filled', '$\\alpha + \\beta = \\delta$' in s, s[50:110])
    key(page, 'Escape', 300)
    # what the field cannot hold goes on in its LaTeX box, typed on there
    load_doc(page, MATH)
    click_text(page, 'gamma.', 6)
    key(page, 'Enter'); key(page, 'Alt+Equal', 600)
    page.keyboard.type(r'\begin{', delay=15); settle(page, 200)
    check('latex: \\begin{ moves on to the LaTeX box', active(page) == 'pop-tex', active(page))
    page.keyboard.type(r'aligned}a&=b\\c&=d\end{aligned}', delay=10); settle(page, 300)
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
        page.keyboard.type('x=1\\text{', delay=15); settle(page, 200, full=True)
        cdp.send('Input.imeSetComposition', {'text': 'ひ', 'selectionStart': 1, 'selectionEnd': 1}); settle(page, 150); cdp.send('Input.insertText', {'text': '日本'})
        settle(page, 250); page.keyboard.type('}+y', delay=15); settle(page, 300)
        key(page, how, 400)
        if how == 'Enter':
            typed(page, ' Next words.'); s = src(page)
            check('latex: after an input method in \\text{, Enter finishes the display', '\\text{日本}+y' in s and s.find('Next words.') > s.find('\\end{equation}') > 0 and active(page) == 'pages', (s[60:220], active(page)))
        else:
            page.keyboard.type('z=2', delay=15); settle(page, 300); key(page, 'Enter', 400); s = src(page)
            check('latex: and Ctrl+Enter there a new row, the display made one of rows', '\\begin{align}' in s and '+y \\\\' in s and 'z=2' in s and active(page) == 'pages', (s[60:240], active(page)))
    # (review N1) a chord with \text{ or \mathbb{ open ends the argument first; the field's own
    # insertion is never taken for typing
    for keys, want in (('x=1\\text{if', '\\text{if}'), ('x\\in\\mathbb{R', '\\mathbb{R}')):
        page.evaluate('window.rikuy.closePop && window.rikuy.closePop(true)')
        load_doc(page, MATH)
        click_text(page, 'gamma.', 6)
        key(page, 'Enter'); key(page, 'Alt+Equal', 600)
        page.keyboard.type(keys, delay=15); settle(page, 200)
        key(page, 'Control+Enter', 400); settle(page, 300)
        s = src(page)
        check('latex: Ctrl+Enter in ' + want[:-2] + '…} ends it, nothing else written', want in s and 'insertText' not in s, s[60:220])
        # (verification of eb14945, V5) and adds the row, as without the argument open
        page.keyboard.type('z=2', delay=15); settle(page, 300); key(page, 'Enter', 400)
        s = src(page); b = ''.join(s[s.find('\\begin{align}'):s.find('\\end{align}')].split())
        check('latex: Ctrl+Enter in ' + want[:-2] + '…} makes a new row, typed on in it', b.startswith('\\begin{align}') and (want + '\\\\z=2') in b, s[60:220])
        # (Enter closed it: an Esc now would be the page's, and its Tab the next part's, leaving the page)
        page.evaluate('window.rikuy.closePop && window.rikuy.closePop(true)')


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
    page.keyboard.press('Backspace'); page.keyboard.press('Backspace'); settle(page, 150)
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
        else: page.click('#pages .atom >> nth=1', modifiers=['Control']); settle(page, 400)
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
        page.evaluate("window.rikuy.runCommand(%r)" % ('focus' if name == 'Focus' else 'read-mode')); settle(page, 700)
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
    page.keyboard.type('b'); settle(page, 200)
    first = page.evaluate("(document.querySelector('#rk-search-list .srch-opt .srch-n') || {}).textContent")
    check('palette: a command run lately comes first among matches as good', first == 'Bold', first)
    key(page, 'Escape'); key(page, 'Escape')


PLAIN = '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n\nAlpha beta gamma.\n\nLast one.\n\n\\end{document}\n'


def insert_list(page, q, wait=500):
    typed(page, '\\', 300); page.fill('#pop-cmd', q); settle(page, 150); key(page, 'Enter', wait)


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
    page.keyboard.type('theorem', delay=30); settle(page, 300)
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
    # (the source pane shows it once CodeMirror, fetched the first time the pane opens, has come)
    until(page, "() => window.rikuy.srcFile === 'refs.bib' && document.body.classList.contains('src-on')", timeout=1200)
    check('quickopen: a file the page does not draw opens in the source pane', page.evaluate('window.rikuy.srcFile') == 'refs.bib' and page.evaluate("document.body.classList.contains('src-on')"), page.evaluate('window.rikuy.srcFile'))
    page.evaluate('window.rikuy.toggleSource(false)'); settle(page, 300)
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
    load_doc(page, files); settle(page, 800)
    # (a phone's speed: a key's build is then far longer than the time between a typist's keys)
    cdp = page.context.new_cdp_session(page); cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
    page.evaluate('''() => { const sp = [...document.querySelectorAll('#pages span.t')].filter((s) => s.textContent.length > 40); const s = sp[Math.floor(sp.length / 2)]; s.scrollIntoView({ block: 'center' }); const r = document.createRange(); r.setStart(s.firstChild, s.textContent.indexOf('. ') + 1); r.collapse(true); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }''')
    settle(page, 300)
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
    settle(page, 100)
    check('burst: a key that is no letter writes the letters waiting first', 'xyz' in src(page) and src(page).count('xyz') == 1, None)
    # (review M1) input with no key, Undo from a menu or a gesture, a paste from the Edit menu,
    # comes after the letters waiting: they go in first
    QUEUE = '''(more) => { const g = window.rikuy; g.keyLate = 50; const ev = (ch) => ({ inputType: 'insertText', data: ch, isComposing: false, preventDefault() {}, getTargetRanges: () => [] });
      for (const ch of 'QRS') g.onBeforeInput(ev(ch)); const waiting = g.typeQ; more(g); return waiting; }'''
    page.evaluate('window.rikuy.undo()'); settle(page, 200)
    base = src(page)
    waiting = page.evaluate(QUEUE.replace('(more) =>', '() =>').replace('more(g);', "g.onBeforeInput({ inputType: 'historyUndo', preventDefault() {}, getTargetRanges: () => [] });"))
    settle(page, 200)
    check('burst: Undo with letters waiting takes back the typing whole, nothing else', bool(waiting) and src(page) == base, (waiting, src(page) == base))
    page.evaluate('window.rikuy.redo()'); settle(page, 200)
    check('burst: and Redo gives the typing back once', src(page).count('QRS') == 1, None)
    page.evaluate('window.rikuy.undo()'); settle(page, 200)
    page.evaluate(QUEUE.replace('(more) =>', '() =>').replace('more(g);', "const dt = new DataTransfer(); dt.setData('text/plain', 'P'); g.root.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));"))
    settle(page, 200)
    check('burst: a paste with letters waiting lands after them', 'QRSP' in src(page), None)
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': 1})


ACC = ('\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n\n\\section{How to use it}\n\nClick to make it \\textbf{bold} here.\n\n'
       'First para ends here.\n\n\\begin{figure}\n  \\centering\n  \\caption{Results here}\n\\end{figure}\n\nLast para.\n\n\\end{document}\n')
FRAC = '\\frac{\\partial u}{\\partial x_k} = \\sum_{i=1}^n \\alpha_i'


def typ(page, text, how):
    # at full speed: keys with no pause between them, or the characters alone (insertText, as
    # dictation, an on-screen keyboard or a script sends them, with no key)
    if how == 'keys': page.keyboard.type(text, delay=0)
    else:
        for ch in text: page.keyboard.insert_text(ch)


def fresh(page, doc=ACC):
    page.evaluate('window.rikuy.closePop && window.rikuy.closePop(true)')
    load_doc(page, doc)


def accept(page):
    """What Pedro met on the live site, typed at full speed, and the rules for where the caret goes
    when the equation field closes (the coordinator's acceptance checks)."""
    for how in ('keys', 'insertText'):
        w = ' (' + how + ')'
        # (1) a formula typed with the words around it in a new paragraph
        fresh(page); click_text(page, 'ends here.', 10); key(page, 'Enter', 100)
        typ(page, 'New para $a^2+b^2=c^2$ then text.', how); settle(page, 900)
        s = src(page)
        check('accept: a new paragraph typed at full speed keeps its formula' + w, '\n\nNew para $a^2+b^2=c^2$ then text.\n\n' in s and active(page) == 'pages', (s[s.find('ends'):][:90], active(page)))
        # (2) Ctrl+End from inside a paragraph: the end of the text
        fresh(page); click_text(page, 'First', 2); key(page, 'Control+End', 100); typ(page, 'ZZ', how); settle(page, 400)
        check('accept: Ctrl+End from inside a paragraph goes to the end of the text' + w, 'Last para.ZZ\n' in src(page), src(page)[-60:])
        # (3) Alt+= on an empty paragraph and LaTeX typed at once: a display, its structure as typed
        fresh(page); click_text(page, 'ends here.', 10); key(page, 'Enter', 100); key(page, 'Alt+Equal', 0)
        # (a font the field's formula brings, KaTeX_Fraktur, lays the page out again 200 ms after it
        # came, and that relayout drops the line after a display closed meanwhile, the next words
        # then on \end{equation}'s line: the app's race, reported; here, as before, it comes first)
        typ(page, FRAC, how); fonts_settled(page); settle(page, 400); key(page, 'Enter', 500)
        s = src(page); i, j = s.find('\\begin{equation}'), s.find('\\end{equation}')
        body = ''.join(s[i + 16:j].split()) if 0 <= i < j else None
        check('accept: Alt+= on an empty paragraph, LaTeX at full speed: a display equation, as typed' + w,
              body in ('\\frac{\\partialu}{\\partialx_{k}}=\\sum_{i=1}^{n}\\alpha_{i}', '\\frac{\\partialu}{\\partialx_k}=\\sum_{i=1}^n\\alpha_i') and '$' not in s, (body, s[s.find('ends'):][:140]))
        # (4) after its Enter, the next words on a line of their own after it, in its paragraph, and
        # no blank line added; a second Enter, a new paragraph
        typ(page, 'After.', how); settle(page, 500)
        s = src(page)
        check('accept: after Enter closes the display, what is typed goes on the next line, no blank line added' + w, '\\end{equation}\nAfter.\n\n\\begin{figure}' in s, s[s.find('\\end{equation}'):][:40])
        fresh(page); click_text(page, 'ends here.', 10); key(page, 'Enter', 100); key(page, 'Alt+Equal', 0)
        typ(page, 'y=1', how); settle(page, 400); key(page, 'Enter', 400); key(page, 'Enter', 200); typ(page, 'Para.', how); settle(page, 400)
        s = src(page)
        check('accept: a second Enter after the display, a new paragraph' + w, '\\end{equation}\n\nPara.\n\n\\begin{figure}' in s, s[s.find('\\end{equation}'):][:40])
        # (5) a formula at a heading's end, Enter, then End, Enter, Q: Q a paragraph after the heading
        for close in ('Enter', 'Escape'):
            fresh(page); click_text(page, 'How to use it', 13); key(page, 'Alt+Equal', 0)
            typ(page, 'x+y', how); settle(page, 400); key(page, close, 400)
            key(page, 'End', 100); key(page, 'Enter', 100); typ(page, 'Q', how); settle(page, 400)
            s = src(page)
            check('accept: a heading\'s formula closed by ' + close + ', then End, Enter, Q: Q after the heading' + w, '\\section{How to use it$x+y$}\n\nQ\n\nClick to make it \\textbf{bold} here.' in s and active(page) == 'pages', s[s.find('section'):][:90])
    # a display is never written inside a command's argument: after the heading, inline in a caption
    fresh(page); click_text(page, 'How to use it', 6); insert_list(page, 'equation', 600)
    typ(page, 'E=mc^2', 'keys'); settle(page, 300); key(page, 'Enter', 400)
    s = src(page)
    check('accept: an equation asked for in a heading goes after the heading', '\\section{How to use it}' in s and s.find('\\begin{equation}') > s.find('\\section{How to use it}') and 'E=mc^2' in s.replace(' ', ''), s[s.find('section'):][:120])
    fresh(page); click_text(page, 'Results here', 12); insert_list(page, 'equation', 600)
    typ(page, 'x', 'keys'); settle(page, 300); key(page, 'Enter', 400)
    s = src(page)
    check('accept: an equation asked for in a caption is a formula in the line there', '\\caption{Results here$x$}' in s and '\\begin{equation}' not in s, s[s.find('caption'):][:60])
    # a display closed by Esc: the caret after it too; one closed empty goes, leaving no step
    fresh(page); click_text(page, 'ends here.', 10); key(page, 'Enter', 100); key(page, 'Alt+Equal', 400)
    typ(page, 'y=2', 'keys'); settle(page, 300); key(page, 'Escape', 400); typ(page, 'Then.', 'keys'); settle(page, 300)
    check('accept: a display closed by Esc, what is typed goes on the next line', '\\end{equation}\nThen.\n\n' in src(page), src(page)[src(page).find('\\end{equation}'):][:30])
    fresh(page); n = page.evaluate('window.rikuy.hist.length')
    click_text(page, 'ends here.', 10); key(page, 'Enter', 100); key(page, 'Alt+Equal', 400); key(page, 'Escape', 400)
    check('accept: an equation closed empty goes with its environment, leaving no undo step', src(page) == ACC and page.evaluate('window.rikuy.hist.length') == n, (src(page)[100:200], page.evaluate('window.rikuy.hist.length'), n))


CTX = ('\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n\nText\\footnote{Note here.} more.\n\n'
       '\\begin{itemize}\n\\item Item text.\n\\end{itemize}\n\n\\begin{tabular}{lp{3cm}}\nCell a & Para cell\\\\\n\\end{tabular}\n\n'
       '\\begin{figure}\n\\centering\n\\caption{Cap text.}\n\\end{figure}\n\nBold \\textbf{strong words} end.\n\nPrice text.\n\n\\end{document}\n')


CTX2 = ('\\documentclass{article}\n\\usepackage{amsmath,tabularx,hyperref}\n\\begin{document}\n\nSee \\href{https://x.org}{the link text} here.\n\n'
        '\\begin{tabularx}{\\linewidth}{lX}\nCell l & Cell xcol\\\\\n\\end{tabularx}\n\n\\begin{tabular}{p{3cm}c}\nCell para & Cell cc\\\\\n\\end{tabular}\n\n'
        'Box \\parbox{4cm}{parbox words} end.\n\n\\end{document}\n')


def slow(page, text, d=60):
    for ch in text:
        page.keyboard.type(ch); settle(page, 250 if ch == '$' else d)
    settle(page, 300)


def pairs(page):
    """$$x^2$$ typed where a display cannot go, and in the middle of a line (verification of
    eb14945, V2 to V4)."""
    # (V2, V3) in a command's argument or a table cell set in a line: a formula in the line, every
    # key kept, its closing $$ taken as one
    for at, off, want in (('Note here', 9, '\\footnote{Note here $x^2$ z.}'), ('Cap text', 8, '\\caption{Cap text $x^2$ z.}'),
                          ('strong words', 6, '\\textbf{strong $x^2$ z words}'), ('Cell a', 6, 'Cell a $x^2$ z & Para cell')):
        fresh(page, CTX); click_text(page, at, off); slow(page, ' $$x^2$$ z')
        s = src(page)
        check('pairs: $$x^2$$ in ' + at + ' is a formula in the line, every key kept', want in s and '\\$' not in s and '\\[' not in s and active(page) == 'pages', (s[s.find(at.split()[0]) - 20:][:80], active(page)))
    for ch in '$$': page.keyboard.type(ch); settle(page, 250)
    check('pairs: a $$ typed again after it is a dollar sign, not swallowed', '$x^2$ z\\$' in src(page), src(page)[src(page).find('Cell a'):][:60])
    # (verification of 5446132, W1) \href's text is an argument: a formula in the line; a display
    # in a p{} or X cell or a \parbox takes its second closing $ as one too
    for at, off, want in (('link text', 4, '{the link $x^2$ z text}'), ('Cell xcol', 9, 'Cell xcol \n\\[x^2\\] z\\\\'),
                          ('Cell para', 9, 'Cell para \n\\[x^2\\] z &'), ('parbox words', 6, '{parbox $x^2$ z words}')):
        fresh(page, CTX2); click_text(page, at, off); slow(page, ' $$x^2$$ z')
        s = src(page)
        check('pairs: $$x^2$$ z in ' + at + ': no stray dollar sign', want in s and '\\$' not in s and active(page) == 'pages', (s[s.find(at.split()[0]) - 20:][:80], active(page)))
    # (a p{} cell takes a display, as a paragraph does)
    fresh(page, CTX); click_text(page, 'Para cell', 9); slow(page, ' $$x^2$$')
    s = src(page)
    check('pairs: $$x^2$$ in a p{} cell is a display', '\\[' in s and 'x^2' in s[s.find('\\['):s.find('\\]')] and '\\$' not in s, s[s.find('Para cell'):][:60])
    # (V4) in the middle of a line, the words typed after the closing $$ go on in the line, no
    # line break between them and the rest of the paragraph
    for at, off in (('Price text', 10), ('Item text', 9)):
        fresh(page, CTX); click_text(page, at, off); slow(page, ' abc $$x^2$$ end')
        s = src(page)
        check('pairs: $$x^2$$ in the middle of ' + at + ', the words after it in the line', '\\] end.' in s and 'end\n.' not in s and 'x^2' in s[s.find('\\['):s.find('\\]')], s[s.find(at.split()[0]):][:70])
        # one undo step back to the start for each part, the display's own steps among them
        for _ in range(6):
            if src(page) == CTX: break
            key(page, 'Control+z', 250)
        check('pairs: undo goes back to the document as it was (' + at + ')', src(page) == CTX, src(page)[-120:])
    # closed by Esc instead of $$: the caret in the line after \] too
    fresh(page, CTX); click_text(page, 'Price text', 10); slow(page, ' abc $$x^2'); key(page, 'Escape', 400); slow(page, ' end')
    s = src(page)
    check('pairs: $$x^2 then Esc in the middle of a line, the words after it in the line', '\\] end.' in s and 'end\n.' not in s, s[s.find('Price'):][:70])


PASTE = """(t) => { const dt = new DataTransfer(); dt.setData('text/plain', t);
  window.rikuy.root.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }"""


def paste(page):
    """Dollars in plain text pasted (verification of eb14945, V6): money stays money, a formula is
    a formula, $..$ and $$..$$ alike; where a display cannot go $$..$$ is a formula in the line."""
    for txt, want in ((' costs $5 and $x^2$ here', ' costs \\$5 and $x^2$ here'), (' it costs $5 and $10.', ' it costs \\$5 and \\$10.'),
                      (' so $$x$$ and $y$ ok', ' so\n\\[\nx\n\\]\nand $y$ ok')):
        fresh(page, CTX); click_text(page, 'Price text', 10); page.evaluate(PASTE, txt); settle(page, 400)
        s = src(page)
        check('paste: ' + repr(txt.strip()), 'Price text' + want + '.' in s, s[s.find('Price'):][:70])
    fresh(page, CTX); click_text(page, 'Cap text', 8); page.evaluate(PASTE, ' then $$x$$ and $y$'); settle(page, 400)
    s = src(page)
    check('paste: $$x$$ into a caption is a formula in the line', '\\caption{Cap text then $x$ and $y$.}' in s, s[s.find('caption'):][:60])


PARTS = [accept, footnote, dollars, latex, tab, pickers, follow, linear, modes, keytips, palette, insertlist, repeat, quickopen, burst, pairs, paste]


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
