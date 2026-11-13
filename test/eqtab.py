"""The Equation tab and Word's equation tools (batch B13, GAP E1, E2, E4 to E6, I42, C4): the tab
comes with a new equation's field (shown, not brought forward, for one clicked); every structure
and symbol group writes its LaTeX into the field at its caret, the focus staying in the field (by
mouse and by keys, open or folded, on a phone too); Numbered and Display, and the right click
menu's Change to inline, display, numbered and unnumbered, are round trips byte for byte, written
by hand too; Add label, Copy reference, Copy as LaTeX; Alt+= numbered on an empty line, inline in
text; the equation gallery from Insert and from the tab, saved equations kept as text; the packages
what the tab writes needs, added once, in the same undo step, never where the document has them;
and, where dist/tex holds a TeX tree, what the tab writes compiles with pdfLaTeX, XeLaTeX and
LuaLaTeX. Screenshots at 1920, 1366 and 390 px, light and dark, in $SHOTS/eqtab-*."""
import os, sys, re, json
sys.path.insert(0, os.path.dirname(__file__))
from browser import open_page, check, results, src, load_doc, click_text, select_text, roundtrip, SHOTS, ROOT
from playwright.sync_api import sync_playwright

DIST = os.path.abspath(os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist'))
WRAP = lambda body, pre='\\usepackage{amsmath}\n': '\\documentclass{article}\n' + pre + '\\begin{document}\n' + body + '\n\\end{document}\n'
DOC = WRAP('Some text here and more.\n\nSecond paragraph.')
TAB = 'document.querySelector("#rb-tabs [aria-selected=true]").textContent'
SHOWN = '[...document.querySelectorAll("#rb-tabs [role=tab]")].filter((t) => !t.hidden).map((t) => t.textContent)'
ACTIVE = 'document.activeElement && document.activeElement.id'
FIELD_TEX = 'document.querySelector(".pop-math textarea").value'
# the first equation on the page, as a right click on it would have chosen it
FIRST_EQ = lambda page: page.evaluate('window.rikuy.eqCtx = document.querySelector("#pages .a-math, #pages .dm")')


def new_formula(page, cmd='formula'):
    page.evaluate('(c) => window.rikuy.runCommand(c)', cmd)
    page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000)
    page.wait_for_timeout(120)


def pick(page, menu, item):
    """A button of the Equation tab, then an item of its menu, by their names, as the mouse does."""
    page.get_by_role('tabpanel', name='Equation', exact=True).get_by_role('button', name=menu, exact=True).click()
    page.wait_for_timeout(60)
    page.get_by_role('menu', name=menu, exact=True).get_by_role('menuitem', name=item, exact=True).click()
    page.wait_for_timeout(60)


def close(page):
    page.evaluate('window.rikuy.closePop()'); page.wait_for_timeout(200)


def tab_comes(page):
    load_doc(page, DOC); click_text(page, 'Second paragraph', 6)
    before = page.evaluate(SHOWN)
    new_formula(page)
    shown, sel = page.evaluate(SHOWN), page.evaluate(TAB)
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    check('a new formula brings the Equation tab, after Help, to the front (as Word does)', 'Equation' not in before and shown[-1] == 'Equation' and sel == 'Equation', (shown, sel))
    check('and with its field closed the tab goes and Home is open again', 'Equation' not in page.evaluate(SHOWN) and page.evaluate(TAB) == 'Home', page.evaluate(SHOWN))
    load_doc(page, WRAP('Some text $x+1$ here.'))
    page.click('.a-math >> nth=0'); page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000); page.wait_for_timeout(200)
    check('an equation clicked shows the tab without bringing it forward', page.evaluate(SHOWN)[-1] == 'Equation' and page.evaluate(TAB) == 'Home', (page.evaluate(SHOWN), page.evaluate(TAB)))
    page.get_by_role('tab', name='Equation', exact=True).click(); page.wait_for_timeout(150)
    check('a press on the tab opens it and leaves the field open, with the focus', page.evaluate(TAB) == 'Equation' and page.evaluate('!!document.querySelector(".pop-math")') and page.evaluate(ACTIVE) == 'pop-field')
    tp = page.get_by_role('tabpanel', name='Equation', exact=True)
    names = tp.get_by_role('button').evaluate_all('(xs) => xs.filter((x) => x.offsetParent).map((x) => x.getAttribute("aria-label"))')
    want = ['Equation gallery', 'Numbered', 'Numbered options', 'Display', 'Basic math', 'Greek letters', 'Operators', 'Arrows', 'Relations', 'Sets and logic', 'Geometry',
            'Fraction', 'Script', 'Radical', 'Integral', 'Large operator', 'Bracket', 'Function', 'Accent', 'Limit and log', 'Operator', 'Matrix']
    check('its groups Tools, Symbols and Structures hold Word\'s commands by name', all(n in names for n in want) and tp.get_by_role('group').evaluate_all('(xs) => xs.map((x) => x.getAttribute("aria-label"))')[:3] == ['Tools', 'Symbols', 'Structures'], names)
    check('Display shows the formula is in the line (not pressed); Numbered is not pressed', tp.get_by_role('button', name='Display', exact=True).get_attribute('aria-pressed') == 'false' and tp.get_by_role('button', name='Numbered', exact=True).get_attribute('aria-pressed') == 'false')
    page.mouse.click(5, 600); page.wait_for_timeout(300)
    check('a press on the page closes the field, and the tab goes', not page.evaluate('!!document.querySelector(".pop-math")') and 'Equation' not in page.evaluate(SHOWN))


# (menu, item, what is typed after it, the formula written, inline)
CASES = [
    ('Fraction', 'stacked fraction', 'a\tb', '\\frac{a}{b}'),
    ('Fraction', 'small fraction', '1\t2', '\\tfrac12'),
    ('Script', 'subscript and superscript', 'x\ti\t2', 'x_{i}^2'),
    ('Radical', 'root with degree', '3\tx', '\\sqrt[3]{x}'),
    ('Integral', 'integral with limits', 'b\ta\tf', '\\int_{a}^{b}f'),
    ('Large operator', 'summation with limits', 'n\tk=1\tk', '\\sum_{k=1}^{n}k'),
    ('Bracket', 'parentheses', 'x', '\\left(x\\right)'),
    ('Bracket', 'set builder braces', 'x\tx>0', '\\left\\{x\\middle|x>0\\right\\}'),
    ('Bracket', 'cases, two', '1\tx>0\t0\tx\\le 0', '\\begin{cases}1 & x>0\\\\ 0 & x\\le0\\end{cases}'),
    ('Bracket', 'binomial coefficient', 'n\tk', '\\binom{n}{k}'),
    ('Function', 'sine', 'x', '\\sin x'),
    ('Accent', 'hat', 'x', '\\hat{x}'),
    ('Accent', 'underbrace', 'abc\t3', '\\underbrace{abc}_3'),
    ('Limit and log', 'limit', 'x\\to 0\tf', '\\lim_{x\\to0}f'),
    ('Operator', 'right arrow with words above', 'f', '\\xrightarrow{f}'),
    ('Matrix', 'in parentheses', 'a\tb\tc\td', '\\begin{pmatrix}a & b\\\\ c & d\\end{pmatrix}'),
    ('Basic math', '\\pm plus or minus', '', '\\pm'),
    ('Greek letters', '\\alpha alpha', '', '\\alpha'),
    ('Operators', '\\otimes circled times', '', '\\otimes'),
    ('Arrows', '\\Rightarrow right double arrow', '', '\\Rightarrow'),
    ('Relations', '\\nleq neither less nor equal', '', '\\nleq'),
    ('Sets and logic', '\\mathbb{R} real numbers', '', '\\mathbb{R}'),
    ('Geometry', '\\angle angle', '', '\\angle'),
]
SQUASH = lambda t: re.sub(r'\s+', '', t)


def structures(page):
    pre = '\\usepackage{amsmath,amssymb}\n'
    bad, lost = [], []
    for menu, item, typed, want in CASES:
        load_doc(page, WRAP('Some text here.', pre)); click_text(page, 'Some text', 4)
        new_formula(page)
        pick(page, menu, item)
        if page.evaluate(ACTIVE) != 'pop-field': lost.append(menu)
        parts = typed.split('\t') if typed else []
        for k, part in enumerate(parts):
            page.keyboard.type(part)
            if k < len(parts) - 1: page.keyboard.press('Tab')
        page.wait_for_timeout(250)
        got = page.evaluate(FIELD_TEX)
        page.keyboard.press('Enter'); page.wait_for_timeout(200)
        s = src(page)
        ok = SQUASH(got) == SQUASH(want) and ('Some$' + got + '$ text') in s
        if not ok: bad.append((menu, item, got, want))
    check('every structure and symbol group puts its LaTeX into the field and so into the source (%d cases, inline)' % len(CASES), not bad, bad)
    check('and none took the focus from the field', not lost, lost)
    # in a display: the same, between \begin{equation} and \end{equation}
    load_doc(page, WRAP('Some text here.\n\nAfter.', pre)); click_text(page, 'Some text here.', 15); page.keyboard.press('Enter'); page.wait_for_timeout(100)
    new_formula(page, 'equation')
    pick(page, 'Fraction', 'stacked fraction'); page.keyboard.type('a'); page.keyboard.press('Tab'); page.keyboard.type('b'); page.wait_for_timeout(300)
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    check('in a new numbered equation: \\frac{a}{b} on its own line', '\\begin{equation}\n  \\frac{a}{b}\n\\end{equation}' in src(page), src(page)[-90:])
    # Word's rule: a structure takes the words selected in the field into its first slot
    load_doc(page, WRAP('Some text $x+1$ here.', pre)); page.click('.a-math >> nth=0')
    page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000); page.wait_for_timeout(200)
    page.evaluate('document.getElementById("pop-field").executeCommand("selectAll")')
    page.get_by_role('tab', name='Equation', exact=True).click(); page.wait_for_timeout(100)
    pick(page, 'Radical', 'square root'); page.wait_for_timeout(300)
    got = page.evaluate(FIELD_TEX)
    page.keyboard.press('Enter'); page.wait_for_timeout(200)
    check('with x+1 selected in the field, Radical gives \\sqrt{x+1}', SQUASH(got) == '\\sqrt{x+1}' and '$\\sqrt{x+1}$' in src(page).replace(' ', ''), got)
    page.keyboard.press('Control+z'); page.wait_for_timeout(200)
    check('one undo gives the source back', src(page) == WRAP('Some text $x+1$ here.', pre), src(page)[-60:])
    # the LaTeX box: a template written there as text, the selection in its first slot
    load_doc(page, WRAP('Some text $x+1$ here.', pre)); page.click('.a-math >> nth=0')
    page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000); page.wait_for_timeout(200)
    page.focus('.pop-math textarea'); page.evaluate('() => { const t = document.querySelector(".pop-math textarea"); t.setSelectionRange(0, 3); }')
    page.get_by_role('tab', name='Equation', exact=True).click(); page.wait_for_timeout(100)
    pick(page, 'Fraction', 'stacked fraction'); page.wait_for_timeout(300)
    check('in the LaTeX box (the focus there) the template goes in as text, the selection in its first slot, the caret in the next', page.evaluate(FIELD_TEX) == '\\frac{x+1}{}' and page.evaluate('document.querySelector(".pop-math textarea").selectionStart') == 11 and page.evaluate(ACTIVE) == 'pop-tex', page.evaluate(FIELD_TEX))
    close(page)


def keyboard(page):
    load_doc(page, DOC); click_text(page, 'Second paragraph', 6)
    new_formula(page)
    page.focus('#rc-eq-fraction'); page.keyboard.press('Enter'); page.wait_for_timeout(150)
    a = page.evaluate('document.activeElement.getAttribute("aria-label")')
    page.keyboard.press('ArrowRight'); b = page.evaluate('document.activeElement.getAttribute("aria-label")')
    page.keyboard.press('ArrowDown'); c = page.evaluate('document.activeElement.getAttribute("aria-label")')
    page.keyboard.press('ArrowUp'); page.keyboard.press('ArrowLeft'); page.keyboard.press('Enter'); page.wait_for_timeout(250)
    check('from the keyboard: Enter on Fraction opens its menu with the focus on its first item; the arrows move by place; Enter puts it in and the focus goes back to the field',
          a == 'stacked fraction' and b == 'linear fraction' and c not in (a, b, None) and page.evaluate(ACTIVE) == 'pop-field' and SQUASH(page.evaluate(FIELD_TEX)) == '\\frac{}{}', (a, b, c, page.evaluate(ACTIVE), page.evaluate(FIELD_TEX)))
    page.focus('#rc-eq-sym-greek'); page.keyboard.press('ArrowDown'); page.wait_for_timeout(150)
    page.keyboard.press('Escape'); page.wait_for_timeout(100)
    check('Escape in a menu closes it and gives the field the focus back', page.evaluate('!document.querySelector(".eq-menu")') and page.evaluate(ACTIVE) == 'pop-field')
    page.focus('#rc-eq-matrix'); page.keyboard.press('Escape'); page.wait_for_timeout(100)
    check('Escape on a button of the tab goes back to the field (not to the page)', page.evaluate(ACTIVE) == 'pop-field' and page.evaluate('!!document.querySelector(".pop-math")'))
    page.focus('#rc-eq-matrix'); page.keyboard.press('ArrowRight'); page.wait_for_timeout(60)
    check('the arrows move along the tab as along any toolbar', page.evaluate(ACTIVE) not in ('rc-eq-matrix', 'pop-field'), page.evaluate(ACTIVE))
    close(page)


def kinds(page):
    pre = ''
    base = WRAP('Some text $x+1$ here.', pre)
    load_doc(page, base); page.click('.a-math >> nth=0')
    page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000); page.wait_for_timeout(150)
    page.get_by_role('tab', name='Equation', exact=True).click(); page.wait_for_timeout(100)
    tp = page.get_by_role('tabpanel', name='Equation', exact=True)
    tp.get_by_role('button', name='Display', exact=True).click(); page.wait_for_timeout(400)
    s1 = src(page)
    check('Display on a formula in the line: \\begin{equation}, its text on a line of its own, \\end{equation} in the place of $…$ alone',
          s1 == base.replace('$x+1$', '\\begin{equation}\n  x+1\n\\end{equation}'), s1[-90:])
    check('the field is open again on the display, Display pressed, Numbered pressed', page.evaluate('document.querySelector(".pop-math .pop-h span").textContent') == 'Display math' and tp.get_by_role('button', name='Display', exact=True).get_attribute('aria-pressed') == 'true'
          and tp.get_by_role('button', name='Numbered', exact=True).get_attribute('aria-pressed') == 'true' and page.evaluate(ACTIVE) == 'pop-field')
    tp.get_by_role('button', name='Numbered', exact=True).click(); page.wait_for_timeout(400)
    check('Numbered off without amsmath: \\[ \\] (no package needed)', src(page) == base.replace('$x+1$', '\\[\n  x+1\n\\]'), src(page)[-60:])
    tp.get_by_role('button', name='Numbered options', exact=True).click(); page.wait_for_timeout(150)
    m = page.get_by_role('menu', name='Numbered', exact=True)
    items = m.get_by_role('menuitemradio').evaluate_all('(xs) => xs.map((x) => [x.getAttribute("aria-label"), x.getAttribute("aria-checked"), x.getAttribute("aria-disabled")])')
    check('Numbered options: the eight kinds, the current one checked', [x[0] for x in items] == ['Numbered equation', 'Unnumbered equation', 'Aligned rows, numbered', 'Aligned rows, no numbers', 'Gathered rows, numbered', 'Gathered rows, no numbers',
          'One long equation on several lines, numbered', 'One long equation on several lines, no number'] and items[1][1] == 'true', items)
    m.get_by_role('menuitemradio', name='Aligned rows, numbered', exact=True).click(); page.wait_for_timeout(400)
    s2 = src(page)
    check('Aligned rows on a document without amsmath: \\begin{align} and \\usepackage{amsmath}, once', s2 == base.replace('\\begin{document}', '\\usepackage{amsmath}\n\\begin{document}').replace('$x+1$', '\\begin{align}\n  x+1\n\\end{align}'), s2)
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
    check('one undo takes the kind and the package line back', src(page) == base.replace('$x+1$', '\\[\n  x+1\n\\]'), src(page))
    # rows: the one line kinds are off, and say why
    rows = WRAP('\\begin{align}\n  a &= b \\\\\n  c &= d\n\\end{align}')
    load_doc(page, rows); page.click('.it.dm >> nth=0')
    page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000); page.wait_for_timeout(150)
    page.get_by_role('tab', name='Equation', exact=True).click(); page.wait_for_timeout(100)
    tp.get_by_role('button', name='Numbered options', exact=True).click(); page.wait_for_timeout(150)
    off = page.get_by_role('menu', name='Numbered', exact=True).get_by_role('menuitemradio').evaluate_all('(xs) => xs.filter((x) => x.getAttribute("aria-disabled")).map((x) => [x.getAttribute("aria-label"), x.title])')
    check('with rows and &: numbered, unnumbered, gathered and multline are off, each saying why', [x[0] for x in off] == ['Numbered equation', 'Unnumbered equation', 'Gathered rows, numbered', 'Gathered rows, no numbers',
          'One long equation on several lines, numbered', 'One long equation on several lines, no number'] and all('&' in x[1] or 'rows' in x[1] for x in off), off)
    page.keyboard.press('Escape')
    check('Display is off on rows (a formula in the line has one)', tp.get_by_role('button', name='Display', exact=True).is_disabled())
    tp.get_by_role('button', name='Numbered', exact=True).click(); page.wait_for_timeout(400)
    check('Numbered off on align gives align*, its names only', src(page) == rows.replace('{align}', '{align*}'), src(page)[-80:])
    close(page)
    # the list in the field's own row does the same, the smallest edit
    load_doc(page, WRAP('\\begin{equation} E=mc^2 \\end{equation}')); page.click('.it.dm >> nth=0')
    page.wait_for_selector('#pop-env'); page.select_option('#pop-env', 'gather'); page.wait_for_timeout(400)
    check('the kind list in the field\'s row: \\begin{gather} E=mc^2 \\end{gather}, nothing inside moved', src(page) == WRAP('\\begin{gather} E=mc^2 \\end{gather}'), src(page)[-60:])
    close(page)
    # a new formula with nothing typed yet: Display gives a new numbered equation in its place
    load_doc(page, DOC); click_text(page, 'Second paragraph.', 17); page.keyboard.press('Enter'); page.wait_for_timeout(100)
    new_formula(page)
    tp.get_by_role('button', name='Display', exact=True).click(); page.wait_for_timeout(400)
    page.keyboard.type('y=1'); page.wait_for_timeout(400); page.keyboard.press('Escape'); page.wait_for_timeout(200)
    check('a new formula, still empty, made Display: a new numbered equation on the empty line', '\\begin{equation}\n  y=1\n\\end{equation}' in src(page) and '$' not in src(page), src(page)[-80:])
    # a new numbered equation, still empty: Display off makes it a new formula in the line, Numbered
    # off a new unnumbered one; given up empty, nothing stays
    load_doc(page, DOC); click_text(page, 'Some text', 4)
    new_formula(page, 'equation'); n0 = page.evaluate('window.rikuy.hist.length')
    tp.get_by_role('button', name='Display', exact=True).click(); page.wait_for_timeout(400)
    head = page.evaluate('document.querySelector(".pop-math .pop-h span").textContent')
    page.keyboard.type('z'); page.wait_for_timeout(400); page.keyboard.press('Enter'); page.wait_for_timeout(200)
    check('a new numbered equation still empty, Display off: a new formula in the line instead, no empty equation left', head == 'New inline math' and src(page) == DOC.replace('Some text', 'Some$z$ text'), (head, src(page)[-80:]))
    load_doc(page, DOC); click_text(page, 'Some text', 4)
    new_formula(page, 'equation')
    tp.get_by_role('button', name='Numbered', exact=True).click(); page.wait_for_timeout(400)
    made = src(page)
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    check('the same, Numbered off: a new equation* in its place; closed empty, nothing stays', 'Some\n\\begin{equation*}\n  \n\\end{equation*}\n text' in made and src(page) == DOC, (made[-90:], src(page)[-60:]))
    bare = WRAP('Some text here and more.', '')
    load_doc(page, bare); click_text(page, 'Some text', 4)
    new_formula(page, 'equation')
    tp.get_by_role('button', name='Numbered options', exact=True).click(); page.wait_for_timeout(150)
    page.get_by_role('menu', name='Numbered', exact=True).get_by_role('menuitemradio', name='Gathered rows, numbered', exact=True).click(); page.wait_for_timeout(400)
    page.keyboard.type('q'); page.wait_for_timeout(400); page.keyboard.press('Escape'); page.wait_for_timeout(300)
    check('a new one made gathered on a document without amsmath, typed in: \begin{gather} and amsmath once', src(page) == bare.replace('\\begin{document}', '\\usepackage{amsmath}\n\\begin{document}').replace('Some text', 'Some\n\\begin{gather}\n  q\n\\end{gather}\n text'), src(page))


def round_trips(page):
    t = WRAP('Some text $x+1$ more.')
    disp = t.replace('$x+1$', '\\begin{equation}\n  x+1\n\\end{equation}')
    roundtrip(page, t, FIRST_EQ, 'eq-to-display', disp, off_command='eq-to-inline', label='Change to display',
              forms=[t.replace('$x+1$', f) for f in ('\\begin{equation*} x+1 \\end{equation*}', '\\[x+1\\]', '\\begin{displaymath}\n  x+1\n\\end{displaymath}', '\\begin{equation}x+1\\end{equation}')])
    roundtrip(page, t.replace('$x+1$', '\\(x+1\\)'), FIRST_EQ, 'eq-to-display', disp, off=t, off_command='eq-to-inline', label='Change to display from \\(…\\) (back as $…$)')
    num = WRAP('Before.\n\\begin{equation}\n  a=b\n\\end{equation}\nAfter.')
    # (the hand written unnumbered forms: \[ \], $$ $$, displaymath; numbered again each is \begin{equation})
    roundtrip(page, num, FIRST_EQ, 'eq-to-unnumbered', num.replace('{equation}', '{equation*}'), off_command='eq-to-numbered', label='Change to unnumbered (amsmath: equation*)',
              forms=[num.replace('\\begin{equation}', '\\[').replace('\\end{equation}', '\\]'), num.replace('\\begin{equation}', '$$').replace('\\end{equation}', '$$'), num.replace('{equation}', '{displaymath}')])
    roundtrip(page, num.replace('{equation}', '{equation*}'), FIRST_EQ, 'eq-to-numbered', num, off_command='eq-to-unnumbered', label='Change to numbered')
    # the unnumbered form follows the document: \[ \] where it writes them, and where amsmath is not loaded
    style = WRAP('Before.\n\\begin{equation}\n  a=b\n\\end{equation}\nAfter \\[c\\] and \\[d\\].')
    roundtrip(page, style, FIRST_EQ, 'eq-to-unnumbered', style.replace('\\begin{equation}', '\\[').replace('\\end{equation}', '\\]'), off_command='eq-to-numbered', label='Change to unnumbered in a document of \\[ \\]',
              forms=[style.replace('\\begin{equation}', '$$').replace('\\end{equation}', '$$')])
    bare = WRAP('Before.\n\\begin{equation}\n  a=b\n\\end{equation}\nAfter.', '')
    roundtrip(page, bare, FIRST_EQ, 'eq-to-unnumbered', bare.replace('\\begin{equation}', '\\[').replace('\\end{equation}', '\\]'), off_command='eq-to-numbered', label='Change to unnumbered without amsmath')
    # a gather from the field's kinds on a document without amsmath: the package with it, as one step
    load_doc(page, bare); FIRST_EQ(page)
    page.evaluate('window.rikuy.eqSetKind("gather")'); page.wait_for_timeout(200)
    check('gather on a document without amsmath: the names and \\usepackage{amsmath}, as one step', src(page) == bare.replace('\\begin{document}', '\\usepackage{amsmath}\n\\begin{document}').replace('{equation}', '{gather}') and page.evaluate('window.rikuy.hist.length') == 1, src(page))
    # what cannot be inline stays, and the menu says why
    for body, why in (('\\begin{equation}\\label{e} a \\end{equation}', 'label'), ('\\begin{align} a &= b \\end{align}', '&'), ('\\begin{equation} a % note\n\\end{equation}', 'comment')):
        d = WRAP(body); load_doc(page, d); FIRST_EQ(page)
        w = page.evaluate('() => { const c = window.rikuy.cmds.command("eq-to-inline"); return [window.rikuy.cmds.enabled(window.rikuy, c, null), c.whyNot(window.rikuy)]; }')
        page.evaluate('window.rikuy.runCommand("eq-to-inline")'); page.wait_for_timeout(100)
        check('Change to inline is off for %s, saying why, and writes nothing' % body.split('\n')[0][:40], w[0] is False and why in w[1] and src(page) == d, w)
    # inline math inside braces or a heading cannot become a display
    for body in ('\\textbf{bold $x$ words}', '\\section{On $x$}', 'A note.\\footnote{See $x$.}'):
        d = WRAP(body); load_doc(page, d); FIRST_EQ(page)
        page.evaluate('window.rikuy.runCommand("eq-to-display")'); page.wait_for_timeout(100)
        check('Change to display writes nothing in %s' % body[:24], src(page) == d, src(page)[-60:])
    # a label, right after \begin{equation}; then its reference
    lab = WRAP('Before.\n\\begin{equation}\n  a=b\n\\end{equation}\nAfter \\begin{equation}\\label{eq:1} c \\end{equation}')
    load_doc(page, lab); FIRST_EQ(page)
    page.evaluate('window.rikuy.runCommand("eq-label")'); page.wait_for_timeout(200)
    check('Add label: \\label{eq:2} (eq:1 is taken) right after \\begin{equation}, one step', src(page) == lab.replace('\\begin{equation}\n  a=b', '\\begin{equation}\\label{eq:2}\n  a=b') and page.evaluate('window.rikuy.hist.length') == 1, src(page))
    FIRST_EQ(page); page.evaluate('window.rikuy.runCommand("eq-copy-ref")'); page.wait_for_timeout(200)
    check('Copy reference gives \\eqref{eq:2}', page.evaluate('window.rikuy.eqCopied') == '\\eqref{eq:2}', page.evaluate('window.rikuy.eqCopied'))
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(150)
    check('and one undo takes the label off', src(page) == lab)
    FIRST_EQ(page); page.evaluate('window.rikuy.runCommand("eq-copy-latex")'); page.wait_for_timeout(200)
    check('Copy as LaTeX gives the equation\'s source as it stands', page.evaluate('window.rikuy.eqCopied') == '\\begin{equation}\n  a=b\n\\end{equation}', page.evaluate('window.rikuy.eqCopied'))
    rows = WRAP('\\begin{align}\n  a &= b \\\\\n  c &= d\n\\end{align}')
    load_doc(page, rows); FIRST_EQ(page)
    check('Add label is off on rows (each row has its own number), and on an unnumbered equation', page.evaluate('window.rikuy.eqWhyLabel()').startswith('Each row') and (load_doc(page, WRAP('\\[ a \\]')) or FIRST_EQ(page) or True) and 'numbered' in page.evaluate('window.rikuy.eqWhyLabel()'))


def context_menu(page):
    load_doc(page, WRAP('Some text $x+1$ here.\n\\begin{equation}\n  a=b\n\\end{equation}\nAfter.'))
    box = page.locator('.a-math').first.bounding_box()
    page.mouse.click(box['x'] + 4, box['y'] + 5, button='right'); page.wait_for_timeout(250)
    m = page.get_by_role('menu', name='Context menu', exact=True)
    names = m.get_by_role('menuitem').evaluate_all('(xs) => xs.map((x) => x.getAttribute("aria-label"))')
    check('a right click on a formula in the line: its menu, with what applies to it (no number, no label)', names == ['Edit equation', 'Change to display', 'Copy as LaTeX', 'Copy for Word', 'Save as new equation', 'Right click again for the browser\'s menu'], names)
    m.get_by_role('menuitem', name='Change to display', exact=True).click(); page.wait_for_timeout(300)
    check('its Change to display writes the display', 'Some text \\begin{equation}\n  x+1\n\\end{equation} here.' in src(page), src(page)[-120:])
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(150)
    box = page.locator('.it.dm').first.bounding_box()
    page.mouse.click(box['x'] + box['width'] / 2, box['y'] + 6, button='right'); page.wait_for_timeout(250)
    names = m.get_by_role('menuitem').evaluate_all('(xs) => xs.map((x) => x.getAttribute("aria-label"))')
    check('on a numbered display: Change to inline, Change to unnumbered, Add label, and the copies', all(n in names for n in ('Change to inline', 'Change to unnumbered', 'Add label', 'Copy as LaTeX', 'Copy for Word')) and 'Change to display' not in names and 'Change to numbered' not in names, names)
    page.keyboard.press('Escape'); page.wait_for_timeout(100)
    page.keyboard.down('Shift'); page.mouse.click(box['x'] + box['width'] / 2, box['y'] + 6, button='right'); page.keyboard.up('Shift'); page.wait_for_timeout(250)
    check('Shift with the right click gives the browser\'s menu, not Rikuy\'s', m.count() == 0)
    # the keyboard's way: Backspace after the formula selects it, Shift+F10 opens its menu
    click_text(page, ' here.', 0); page.keyboard.press('Backspace'); page.wait_for_timeout(150)
    page.keyboard.press('Shift+F10'); page.wait_for_timeout(250)
    check('Backspace selects the formula; Shift+F10 then opens its menu, the focus on Edit equation', m.count() == 1 and page.evaluate('document.activeElement.getAttribute("aria-label")') == 'Edit equation', page.evaluate('document.activeElement.getAttribute("aria-label")'))
    page.keyboard.press('Enter'); page.wait_for_timeout(500)
    check('and Edit equation opens its field', page.evaluate('!!document.querySelector(".pop-math")'))
    close(page)


def alt_equals(page):
    load_doc(page, DOC); click_text(page, 'Second paragraph.', 17); page.keyboard.press('Enter'); page.wait_for_timeout(120)
    page.keyboard.press('Alt+='); page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000); page.wait_for_timeout(150)
    head, sel = page.evaluate('document.querySelector(".pop-math .pop-h span").textContent'), page.evaluate(TAB)
    page.keyboard.type('E=mc^2'); page.wait_for_timeout(400); page.keyboard.press('Enter'); page.wait_for_timeout(200)
    check('Alt+= on an empty line: a numbered equation, the Equation tab in front', head == 'Display math' and sel == 'Equation' and 'Second paragraph.\n\\begin{equation}\n  E=mc^2\n\\end{equation}' in src(page), (head, sel, src(page)[-80:]))
    load_doc(page, DOC); click_text(page, 'Some text', 4)
    page.keyboard.press('Alt+='); page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000); page.wait_for_timeout(150)
    head = page.evaluate('document.querySelector(".pop-math .pop-h span").textContent')
    page.keyboard.type('x'); page.wait_for_timeout(400); page.keyboard.press('Enter'); page.wait_for_timeout(200)
    check('Alt+= in text: a formula in the line', head == 'New inline math' and 'Some$x$ text' in src(page), (head, src(page)[-60:]))
    load_doc(page, WRAP('\\section{Title}\n\nText.')); click_text(page, 'Title', 5)
    page.keyboard.press('Alt+='); page.wait_for_selector('.pop-math'); page.wait_for_timeout(150)
    check('Alt+= in a heading: in the line (a display cannot stand there)', page.evaluate('document.querySelector(".pop-math .pop-h span").textContent') == 'New inline math')
    page.keyboard.press('Escape'); page.wait_for_timeout(150)
    k = page.evaluate('''() => { const c = window.rikuy.cmds.command('insert-equation'); return [c.keys, c.mac, window.rikuy.cmds.command('equation').keys || null]; }''')
    check('the chord is Alt+= (Control+= on a Mac, where Option+= types ≠); Equation keeps no key (Ctrl+Shift+E is Track Changes)', k == [['Alt+='], {'Alt+=': 'Control+='}, None], k)
    load_doc(page, DOC); click_text(page, 'Some text', 4)
    page.keyboard.press('Control+Shift+E'); page.wait_for_timeout(300)
    check('Ctrl+Shift+E makes no equation any more', src(page) == DOC and not page.evaluate('!!document.querySelector(".pop-math")'))


def gallery(page):
    load_doc(page, DOC); click_text(page, 'Second paragraph.', 17); page.keyboard.press('Enter'); page.wait_for_timeout(120)
    page.get_by_role('tab', name='Insert', exact=True).click(); page.wait_for_timeout(120)
    page.get_by_role('button', name='Equation options', exact=True).click(); page.wait_for_timeout(200)
    g = page.get_by_role('menu', name='Equation gallery', exact=True)
    names = g.get_by_role('menuitem').evaluate_all('(xs) => xs.map((x) => x.getAttribute("aria-label"))')
    check('Insert, Equation options: Word\'s nine equations, then Insert new equation', names == ['Area of circle', 'Binomial theorem', 'Expansion of a sum', 'Fourier series', 'Pythagorean theorem', 'Quadratic formula',
          'Taylor expansion', 'Trig identity 1', 'Trig identity 2', 'Insert new equation'] and page.evaluate('document.querySelectorAll(".eq-gal .katex").length') == 9, names)
    g.get_by_role('menuitem', name='Pythagorean theorem', exact=True).click(); page.wait_for_timeout(400)
    s = src(page)
    check('on an empty line: a numbered equation of it, open in its field, the tab in front', 'Second paragraph.\n\\begin{equation}\n  a^2+b^2=c^2\n\\end{equation}' in s and page.evaluate(ACTIVE) == 'pop-field' and page.evaluate(TAB) == 'Equation', s[-90:])
    close(page)
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(150)
    check('one undo takes it out', src(page) == DOC)
    bare = WRAP('Some text here and more.', '')
    load_doc(page, bare); click_text(page, 'Some text', 4)
    page.get_by_role('tab', name='Insert', exact=True).click(); page.wait_for_timeout(120)
    page.get_by_role('button', name='Equation options', exact=True).click(); page.wait_for_timeout(200)
    g.get_by_role('menuitem', name='Binomial theorem', exact=True).click(); page.wait_for_timeout(400)
    close(page)
    s = src(page)
    check('in text: in the line; \\binom needs amsmath, which comes once, with it', s.count('\\usepackage{amsmath}') == 1 and 'Some$(x+a)^n=\\sum_{k=0}^{n}\\binom{n}{k}x^k a^{n-k}$ text' in s, s)
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(150)
    check('one undo takes both back', src(page) == bare, src(page))
    # from the tab: into the open field at its caret
    load_doc(page, DOC); click_text(page, 'Some text', 4); new_formula(page)
    pick(page, 'Equation gallery', 'Area of circle'); page.wait_for_timeout(300)
    check('the tab\'s Equation gallery puts it into the field', SQUASH(page.evaluate(FIELD_TEX)) == 'A=\\pir^2', page.evaluate(FIELD_TEX))
    close(page)
    load_doc(page, DOC); click_text(page, 'Some text', 4)
    page.keyboard.press('Alt+q'); page.keyboard.type('quadratic'); page.wait_for_timeout(200)
    found = page.locator('#rk-search-list [role=option] .srch-n').all_text_contents()
    page.keyboard.press('Enter'); page.wait_for_timeout(250)
    check('the search box finds the gallery by an equation\'s name; Enter opens it, its first item focused', found[:1] == ['Equation gallery'] and page.evaluate('document.activeElement.getAttribute("aria-label")') == 'Area of circle', (found, page.evaluate('document.activeElement.getAttribute("aria-label")')))
    page.keyboard.press('Enter'); page.wait_for_timeout(400); close(page)
    check('and its item puts the equation in at the place on the page', 'Some$A=\\pi r^2$ text' in src(page), src(page)[-60:])


def saved(page):
    page.evaluate('localStorage.removeItem("rikuy.equations.v1")')
    load_doc(page, WRAP('Some text $e^{i\\pi}+1=0$ here.'))
    page.click('.a-math >> nth=0'); page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000); page.wait_for_timeout(150)
    page.get_by_role('tab', name='Equation', exact=True).click(); page.wait_for_timeout(100)
    pick(page, 'Equation gallery', 'Save as new equation'); page.wait_for_timeout(150)
    d = page.get_by_role('dialog', name='Save as new equation', exact=True)
    d.get_by_role('textbox', name='Name', exact=True).fill('Euler <img src=x onerror=window.__hit=1>'); page.keyboard.press('Enter'); page.wait_for_timeout(200)
    kept = page.evaluate('JSON.parse(localStorage.getItem("rikuy.equations.v1"))')
    check('Save as new equation keeps it in this browser, under its name', kept == [{'name': 'Euler <img src=x onerror=window.__hit=1>', 'tex': 'e^{i\\pi}+1=0'}] and page.evaluate(ACTIVE) == 'pop-field', kept)
    close(page)
    load_doc(page, DOC); click_text(page, 'Some text', 4)
    page.get_by_role('tab', name='Insert', exact=True).click(); page.wait_for_timeout(120)
    page.get_by_role('button', name='Equation options', exact=True).click(); page.wait_for_timeout(200)
    g = page.get_by_role('menu', name='Equation gallery', exact=True)
    item = g.get_by_role('menuitem', name='Euler <img src=x onerror=window.__hit=1>', exact=True)
    check('the gallery lists it under "Saved in this browser", its name as text (no element made of it)', item.count() == 1 and page.evaluate('[window.__hit, document.querySelectorAll(".eq-menu img").length]') == [None, 0])
    item.click(); page.wait_for_timeout(400); close(page)
    check('and puts it in like the others', 'Some$e^{i\\pi}+1=0$ text' in src(page), src(page)[-60:])
    page.get_by_role('tab', name='Insert', exact=True).click(); page.wait_for_timeout(120)
    click_text(page, 'Second', 2)
    page.get_by_role('button', name='Equation options', exact=True).click(); page.wait_for_timeout(200)
    g.get_by_role('menuitem', name='Remove a saved equation', exact=True).click(); page.wait_for_timeout(150)
    page.get_by_role('menu', name='Remove a saved equation', exact=True).get_by_role('menuitem', name='Remove Euler <img src=x onerror=window.__hit=1>', exact=True).click(); page.wait_for_timeout(150)
    check('Remove a saved equation takes it out of this browser', page.evaluate('JSON.parse(localStorage.getItem("rikuy.equations.v1"))') == [])
    page.evaluate('localStorage.setItem("rikuy.equations.v1", "{broken")')
    page.get_by_role('button', name='Equation options', exact=True).click(); page.wait_for_timeout(200)
    check('a broken store reads as none: the gallery still opens', g.get_by_role('menuitem').count() == 10)
    page.keyboard.press('Escape'); page.wait_for_timeout(100)
    page.evaluate('localStorage.setItem("rikuy.equations.v1", JSON.stringify([{ name: "Hostile", tex: "x$ \\\\input{/etc/passwd} $" }]))')
    page.get_by_role('button', name='Equation options', exact=True).click(); page.wait_for_timeout(200)
    check('a saved equation that would close its formula early (x$ \\input… $) is not offered', g.get_by_role('menuitem', name='Hostile', exact=True).count() == 0 and g.get_by_role('menuitem').count() == 10)
    page.keyboard.press('Escape'); page.wait_for_timeout(100)
    before = src(page)
    page.evaluate('() => window.rikuy.eqInsertNew("x$ \\\\input{/etc/passwd} $")'); page.wait_for_timeout(200)
    check('and put in by hand it is refused, the source unchanged', src(page) == before)
    page.evaluate('localStorage.removeItem("rikuy.equations.v1")')
    load_doc(page, WRAP('\\begin{align}\n  a &= b \\\\\n  c &= d\n\\end{align}'))
    page.click('.it.dm >> nth=0'); page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000); page.wait_for_timeout(150)
    page.evaluate('window.rikuy.eqSave()'); page.wait_for_timeout(150)
    check('an equation with rows cannot be saved whole (a formula in the line takes one row)', page.get_by_role('dialog', name='Save as new equation', exact=True).count() == 0 and 'rows' in page.evaluate('document.getElementById("toast").textContent'))
    close(page)
    page.get_by_role('tab', name='Home', exact=True).click()


def packages(page):
    bare = WRAP('Some text here.', '')
    load_doc(page, bare); click_text(page, 'Some text', 4); new_formula(page)
    pick(page, 'Sets and logic', '\\mathbb{R} real numbers'); pick(page, 'Relations', '\\nleq neither less nor equal'); page.wait_for_timeout(300)
    page.keyboard.press('Enter'); page.wait_for_timeout(300)
    s = src(page)
    check('symbols of amssymb put in by the tab: \\usepackage{amssymb} once, when the field closes', s.count('\\usepackage{amssymb}') == 1 and '$\\mathbb{R}\\nleq$' in s.replace(' ', ''), s)
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(150)
    check('one undo: the formula and the line both go', src(page) == bare, src(page))
    load_doc(page, bare); click_text(page, 'Some text', 4); new_formula(page)
    pick(page, 'Sets and logic', '\\mathbb{R} real numbers'); page.wait_for_timeout(200)
    page.keyboard.press('Backspace'); page.keyboard.press('Backspace'); page.keyboard.type('x'); page.wait_for_timeout(300); page.keyboard.press('Enter'); page.wait_for_timeout(300)
    check('taken out again before the field closed: no package', 'amssymb' not in src(page), src(page))
    tx = WRAP('Some text here.', '\\usepackage{newtxmath}\n')
    load_doc(page, tx); click_text(page, 'Some text', 4); new_formula(page)
    pick(page, 'Sets and logic', '\\varnothing empty set, variant'); page.wait_for_timeout(300); page.keyboard.press('Enter'); page.wait_for_timeout(300)
    check('with newtxmath (which has them, and stops TeX with amssymb after it) no amssymb', 'amssymb' not in src(page) and '\\varnothing' in src(page), src(page))


def folded(page):
    load_doc(page, DOC)
    for w in (860, 640):
        page.set_viewport_size({'width': w, 'height': 900}); page.wait_for_timeout(250)
        click_text(page, 'Some text', 4); new_formula(page); page.wait_for_timeout(200)
        f = page.evaluate('[...document.querySelectorAll("#rp-equation .rb-grp.folded")].map((g) => g.dataset.group)')
        if not f:
            check('at %d px a group of the Equation tab folds' % w, False, f); close(page); continue
        gname = {'symbols': 'Symbols', 'structures': 'Structures', 'tools': 'Tools'}[f[0]]
        page.get_by_role('tabpanel', name='Equation', exact=True).get_by_role('button', name=gname, exact=True).click(); page.wait_for_timeout(150)
        gm = page.get_by_role('menu', name=gname, exact=True)
        first = gm.get_by_role('menuitem').first.get_attribute('aria-label') if gm.count() else None
        open_still = page.evaluate('!!document.querySelector(".pop-math")')
        menu = 'Basic math' if gname == 'Symbols' else 'Fraction' if gname == 'Structures' else 'Equation gallery'
        gm.get_by_role('menuitem', name=menu, exact=True).click(); page.wait_for_timeout(150)
        item = {'Basic math': '\\infty infinity', 'Fraction': 'stacked fraction', 'Equation gallery': 'Area of circle'}[menu]
        page.get_by_role('menu', name=menu, exact=True).get_by_role('menuitem', name=item, exact=True).click(); page.wait_for_timeout(300)
        got = page.evaluate(FIELD_TEX)
        check('at %d px the folded group %s opens its own menu, the field still open, and its galleries put LaTeX in' % (w, gname), open_still and first and got.strip() != '' and page.evaluate(ACTIVE) == 'pop-field', (f, first, got))
        close(page)
    page.set_viewport_size({'width': 390, 'height': 800}); page.wait_for_timeout(300)
    load_doc(page, DOC); click_text(page, 'Some text', 4); new_formula(page)
    sel = page.get_by_role('combobox', name='Ribbon tab', exact=True)
    v = sel.evaluate('(s) => s.value')
    page.get_by_role('tabpanel', name='Equation', exact=True).get_by_role('button', name='Fraction', exact=True).click(); page.wait_for_timeout(150)
    page.get_by_role('menu', name='Fraction', exact=True).get_by_role('menuitem', name='stacked fraction', exact=True).click(); page.wait_for_timeout(300)
    check('on a phone the Ribbon tab list is on Equation, and its Fraction works the same', v == 'equation' and SQUASH(page.evaluate(FIELD_TEX)) == '\\frac{}{}', (v, page.evaluate(FIELD_TEX)))
    page.keyboard.press('Escape'); page.wait_for_timeout(150)
    click_text(page, 'Some text', 4); new_formula(page)
    sel.select_option(label='Home'); page.wait_for_timeout(150); sel.select_option(label='Equation'); page.wait_for_timeout(150)
    check('picking another tab in the list and Equation again leaves the field open', page.evaluate('!!document.querySelector(".pop-math")') and page.evaluate(TAB) == 'Equation')
    close(page)
    page.set_viewport_size({'width': 1400, 'height': 1000}); page.wait_for_timeout(300)


def compile_check(page):
    if not os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        print('SKIP compiling what the tab writes: no TeX tree in %s' % DIST)
        return
    # what the tab and the gallery write, on a document without amsmath or amssymb: the packages they
    # bring make it compile on the three engines
    body = WRAP('Some text here.\n\nSecond.', '')
    load_doc(page, body); click_text(page, 'Some text', 4); new_formula(page)
    for menu, item in (('Bracket', 'cases, two'), ('Matrix', 'in parentheses'), ('Integral', 'double integral'), ('Operator', 'right arrow with words above'), ('Sets and logic', '\\mathbb{R} real numbers'),
                       ('Relations', '\\nleq neither less nor equal'), ('Accent', 'boxed formula'), ('Bracket', 'set builder braces'), ('Fraction', 'small fraction'), ('Accent', 'triple dot')):
        pick(page, menu, item); page.keyboard.type('x'); page.evaluate('document.getElementById("pop-field").executeCommand("moveToMathfieldEnd")'); page.keyboard.type('+')
    page.wait_for_timeout(400); page.keyboard.press('Enter'); page.wait_for_timeout(300)
    click_text(page, 'Second.', 7); page.keyboard.press('Enter'); page.wait_for_timeout(100)
    page.get_by_role('tab', name='Insert', exact=True).click(); page.wait_for_timeout(100)
    page.get_by_role('button', name='Equation options', exact=True).click(); page.wait_for_timeout(150)
    page.get_by_role('menu', name='Equation gallery', exact=True).get_by_role('menuitem', name='Binomial theorem', exact=True).click(); page.wait_for_timeout(300)
    close(page)
    page.get_by_role('tab', name='Home', exact=True).click()
    text = src(page)
    print('     compiled:', text.replace('\n', ' | ')[:400])
    page.set_default_timeout(600000)
    got = {}
    for eng in ('pdflatex', 'xelatex', 'lualatex'):
        r = page.evaluate("""async ([t, eng]) => { await window.rikuy.api.setSource('% !TeX program = ' + eng + '\\n' + t); const r = await window.rikuy.api.compile();
          return { ok: r.ok, engine: r.engine, pages: r.pages, errors: r.problems.filter((p) => p.severity === 'error').map((p) => p.message).slice(0, 3) }; }""", [text, eng])
        got[eng] = r
    page.set_default_timeout(30000)
    check('what the tab and the gallery write (cases, pmatrix, \\iint, \\xrightarrow, \\mathbb, \\nleq, \\boxed, \\middle, \\tfrac, \\dddot, \\binom) with the packages they brought compiles with pdfLaTeX, XeLaTeX and LuaLaTeX',
          all(got[e]['ok'] and not got[e]['errors'] for e in got) and 'amsmath' in text and 'amssymb' in text, got)


def shots(page):
    for dark in (False, True):
        for w in (1920, 1366, 390):
            page.emulate_media(color_scheme='dark' if dark else 'light')
            page.set_viewport_size({'width': w, 'height': 900 if w > 400 else 800}); page.wait_for_timeout(250)
            tag = '%d-%s' % (w, 'dark' if dark else 'light')
            load_doc(page, WRAP('Some text $x+1$ here and more.\n\\begin{equation}\\label{e}\n  a^2+b^2=c^2\n\\end{equation}\nSecond paragraph.'))
            click_text(page, 'Second paragraph', 6); new_formula(page)
            page.screenshot(path=os.path.join(SHOTS, 'eqtab-%s-tab.png' % tag))
            for menu, name in (('Fraction', 'structure'), ('Greek letters', 'symbols'), ('Equation gallery', 'gallery')):
                b = page.get_by_role('tabpanel', name='Equation', exact=True).get_by_role('button', name=menu, exact=True)
                if b.is_visible():
                    b.click(); page.wait_for_timeout(200)
                    page.screenshot(path=os.path.join(SHOTS, 'eqtab-%s-%s.png' % (tag, name)))
                    page.keyboard.press('Escape'); page.wait_for_timeout(100)
            close(page)
            box = page.locator('.it.dm').first.bounding_box()
            page.mouse.click(box['x'] + box['width'] / 2, box['y'] + 6, button='right'); page.wait_for_timeout(250)
            page.screenshot(path=os.path.join(SHOTS, 'eqtab-%s-menu.png' % tag))
            page.keyboard.press('Escape'); page.wait_for_timeout(100)
    page.emulate_media(color_scheme='light')
    page.set_viewport_size({'width': 1400, 'height': 1000}); page.wait_for_timeout(250)
    print('     screenshots in %s/eqtab-*' % SHOTS)


def run():
    with sync_playwright() as p:
        browser, page, errors = open_page(p)
        fns = (tab_comes, structures, keyboard, kinds, round_trips, context_menu, alt_equals, gallery, saved, packages, folded, compile_check, shots)
        for fn in [f for f in fns if len(sys.argv) < 2 or f.__name__ in sys.argv[1:]]:
            try: fn(page)
            except Exception as e:
                check(fn.__name__ + ' runs to its end', False, str(e)[:400])
                try: page.evaluate('window.rikuy.closePop(true, true)')
                except Exception: pass
        check('no page errors', not [e for e in errors if 'tree.wasm' not in e and 'TeX' not in e], errors[:4])
        browser.close()
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    run()
