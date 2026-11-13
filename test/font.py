"""Home's Font group, the Format Painter and the Font dialog (src/cmd/font.js, src/charfmt.js,
src/ui/fontdialog.js), in Chromium.

The round trip rule (test/browser.py's roundtrip: the exact LaTeX in one step, undo byte for byte,
the state read back, hand written forms, off) for every toggle: Bold, Italic, Underline (\\uline,
with ulem; \\underline by hand), Strikethrough, Double Strikethrough, Subscript, Superscript, Small
Caps, All Caps, Character Border, Enclose Characters, Character Shading; Subscript and Superscript
turning into each other; the keys (Ctrl+Shift+X, Ctrl+, and Ctrl+., Ctrl+Shift+A and K, Ctrl+Alt+H
and AltGr, Ctrl+D, Ctrl+Shift+F, Ctrl+Shift+> and <, Ctrl+] and [, Shift+F3, Ctrl+Space); Font
Color (the picker, Automatic, {\\color{..} ..} by hand), Text Highlight Color (yellow, a colour,
No Color, Word import's highlighter of before), Underline's styles and colour; the size box (a
selection, a number, the document's size with extarticle) and the font box (the document's font,
a selection's family, fontspec), Increase and Decrease Font Size; Change Case; Clear All
Formatting and Clear Character Formatting; the Format Painter (once, double click, Escape);
*bold* and _italic_ as typed; the Font dialog (every field, one commit, Set As Default) and the
Phonetic Guide; how the page draws each; and, where dist/tex has a TeX tree, a compile of a
document with all of them (no error, the words in the PDF).

RIKUY_DIST names another dist/."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import open_page, check, results, src, load_doc, click_text, select_text, roundtrip, place, pressed
from playwright.sync_api import sync_playwright

DIST = os.environ.get('RIKUY_DIST') or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'dist')
WRAP = lambda body, pre='': '\\documentclass{article}\n\\usepackage{amsmath}\n' + pre + '\\begin{document}\n' + body + '\n\\end{document}\n'
BODY = 'Some plain words here.\n\nAnother paragraph.'
DOC = WRAP(BODY)
ULEM = '\\usepackage[normalem]{ulem}\n'
XCOLOR = '\\usepackage{xcolor}\n'
HL = '\\DeclareRobustCommand{\\hl}[1][yellow]{\\bgroup\\markoverwith{\\textcolor{#1}{\\rule[-.5ex]{2pt}{2.5ex}}}\\ULon}\n'
DSOUT = '\\DeclareRobustCommand{\\dsout}{\\bgroup\\markoverwith{\\raise.35ex\\hbox{\\vbox{\\hrule width.2em height.4pt\\kern.25ex\\hrule width.2em height.4pt}}}\\ULon}\n'


def run_cmd(page, cmd, args=None):
    r = page.evaluate('([id, args]) => window.rikuy.runCommand(id, args)', [cmd, args])
    page.wait_for_timeout(150)
    return r


def body(page):
    t = src(page)
    return t[t.index('\\begin{document}') + 17:t.index('\\end{document}')].strip()


def pre(page):
    t = src(page)
    return t[:t.index('\\begin{document}')]


def round_trips(page):
    """The round trip rule on every toggle of the group, with the forms written by hand."""
    rep = lambda w, p='': WRAP(BODY.replace('plain words', w), p)
    roundtrip(page, DOC, 'plain words', 'bold', rep('\\textbf{plain words}'), forms=[rep('{\\bfseries plain words}'), rep('\\textbf{plain words}')], label='Bold')
    roundtrip(page, DOC, 'plain words', 'italic', rep('\\emph{plain words}'), forms=[rep('\\textit{plain words}'), rep('{\\itshape plain words}')], label='Italic')
    # Underline writes ulem's \uline, which breaks across lines; \underline by hand still reads and comes off
    roundtrip(page, DOC, 'plain words', 'underline', rep('\\uline{plain words}', ULEM), forms=[rep('\\underline{plain words}', ULEM), rep('\\uuline{plain words}', ULEM)],
              off=WRAP(BODY, ULEM), label='Underline')
    roundtrip(page, DOC, 'plain words', 'strikethrough', rep('\\sout{plain words}', ULEM), forms=[rep('\\xout{plain words}', ULEM)], off=WRAP(BODY, ULEM), label='Strikethrough')
    roundtrip(page, DOC, 'plain words', 'double-strikethrough', rep('\\dsout{plain words}', ULEM + DSOUT), off=WRAP(BODY, ULEM + DSOUT), label='Double Strikethrough')
    roundtrip(page, DOC, 'plain words', 'subscript', rep('\\textsubscript{plain words}'), label='Subscript')
    roundtrip(page, DOC, 'plain words', 'superscript', rep('\\textsuperscript{plain words}'), label='Superscript')
    roundtrip(page, DOC, 'plain words', 'small-caps', rep('\\textsc{plain words}'), forms=[rep('{\\scshape plain words}'), rep('{\\sc plain words}')], label='Small Caps')
    roundtrip(page, DOC, 'plain words', 'all-caps', rep('\\MakeUppercase{plain words}'), forms=[rep('\\uppercase{plain words}')], label='All Caps')
    roundtrip(page, DOC, 'plain words', 'char-border', rep('\\fbox{plain words}'), label='Character Border')
    roundtrip(page, DOC, 'plain', 'enclose-chars', WRAP(BODY.replace('plain', '\\textcircled{plain}')), label='Enclose Characters')
    # (a word gets a box; words, which may run over a line's end, the highlighter's grey: review L2)
    roundtrip(page, DOC, 'plain', 'char-shading', WRAP(BODY.replace('plain', '\\colorbox{lightgray}{plain}'), XCOLOR), off=WRAP(BODY, XCOLOR), label='Character Shading')
    roundtrip(page, DOC, 'plain words', 'highlight', rep('\\hl{plain words}', ULEM + XCOLOR + HL), off=WRAP(BODY, ULEM + XCOLOR + HL), label='Text Highlight Color')
    roundtrip(page, DOC, 'plain words', 'typewriter', rep('\\texttt{plain words}'), forms=[rep('{\\ttfamily plain words}')], label='Typewriter')
    # Subscript on superscript text: one becomes the other, the words still selected
    load_doc(page, WRAP('H\\textsuperscript{2}O and x.')); select_text(page, '2')
    run_cmd(page, 'subscript')
    check('Subscript on superscript text: \\textsuperscript becomes \\textsubscript in place, the 2 still selected', body(page) == 'H\\textsubscript{2}O and x.' and page.evaluate('String(getSelection())') == '2', body(page))
    # a caret: the empty wrapper, the caret between its braces, typing goes in
    load_doc(page, DOC); click_text(page, 'plain', 5)
    run_cmd(page, 'strikethrough'); page.keyboard.type('xy'); page.wait_for_timeout(200)
    check('Strikethrough at a caret: \\sout{} with the caret inside it, and what is typed goes in', 'plain\\sout{xy} words' in body(page), body(page))


def keys(page):
    """Word's keys, with the caret on the page."""
    cases = [('Control+Shift+X', '\\sout{plain}'), ('Control+,', '\\textsubscript{plain}'), ('Control+.', '\\textsuperscript{plain}'), ('Control+Shift+A', '\\MakeUppercase{plain}'),
             ('Control+Shift+K', '\\textsc{plain}'), ('Control+Alt+h', '\\hl{plain}'), ('Control+Shift+Period', '{\\large plain}'), ('Control+Shift+Comma', '{\\small plain}'),
             ('Control+]', '{\\large plain}'), ('Control+[', '{\\small plain}'), ('Control+u', '\\uline{plain}')]
    bad = []
    for chord, want in cases:
        load_doc(page, DOC); select_text(page, 'plain')
        page.keyboard.press(chord); page.wait_for_timeout(200)
        if want not in body(page): bad.append((chord, body(page)[:60]))
    check('the keys of the group: Ctrl+Shift+X, Ctrl+, Ctrl+. Ctrl+Shift+A, K, Ctrl+Alt+H, Ctrl+Shift+> <, Ctrl+] [ and Ctrl+U write their commands', not bad, bad)
    # AltGr (Ctrl+Alt with the AltGraph state): the character is typed, no highlight
    load_doc(page, DOC); select_text(page, 'plain')
    r = page.evaluate('''() => { const e = new KeyboardEvent('keydown', { key: 'h', code: 'KeyH', ctrlKey: true, altKey: true, modifierAltGraph: true, bubbles: true, cancelable: true });
      document.getElementById('pages').dispatchEvent(e); return e.defaultPrevented; }''')
    page.wait_for_timeout(150)
    check('AltGr+H (Ctrl+Alt with AltGraph) is no highlight: the key is left to type', not r and src(page) == DOC, r)
    # Shift+F3: the case in turn on the word at the caret
    load_doc(page, DOC); click_text(page, 'plain', 2)
    page.keyboard.press('Shift+F3'); page.wait_for_timeout(200)
    a = body(page)
    page.keyboard.press('Shift+F3'); page.wait_for_timeout(200)
    b = body(page)
    page.keyboard.press('Shift+F3'); page.wait_for_timeout(200)
    check('Shift+F3 on the word at the caret: Capitalize, then UPPERCASE, then lowercase', a.startswith('Some Plain words') and b.startswith('Some PLAIN words') and body(page).startswith('Some plain words'), (a[:20], b[:20], body(page)[:20]))
    # Ctrl+Space clears the character formatting
    load_doc(page, WRAP(BODY.replace('plain words', '\\textbf{\\textcolor{red}{plain words}}'))); select_text(page, 'plain words')
    page.keyboard.press('Control+Space'); page.wait_for_timeout(200)
    check('Ctrl+Space takes the character formatting off the selection', body(page) == BODY, body(page))
    # Ctrl+D opens the Font dialog; Ctrl+Shift+F puts the focus in the font box
    load_doc(page, DOC); select_text(page, 'plain')
    page.keyboard.press('Control+d'); page.wait_for_timeout(250)
    check('Ctrl+D opens the dialog "Font"', page.get_by_role('dialog', name='Font').count() == 1)
    page.keyboard.press('Escape'); page.wait_for_timeout(150)
    select_text(page, 'plain')
    page.keyboard.press('Control+Shift+F'); page.wait_for_timeout(200)
    check('Ctrl+Shift+F puts the focus in the combobox "Font"', page.evaluate('document.activeElement.id') == 'rb-font')
    page.keyboard.press('Escape'); page.wait_for_timeout(150)
    check('Escape in the box gives the caret back to the page, the words still selected', page.evaluate('document.activeElement.id') == 'pages' and page.evaluate('String(getSelection())') == 'plain')


def colors(page):
    """Font Color, Text Highlight Color, Underline's styles and colour."""
    load_doc(page, DOC); select_text(page, 'plain words')
    run_cmd(page, 'font-color')
    check('Font Color writes \\textcolor in red at first, with xcolor', body(page).startswith('Some \\textcolor{red}{plain words}') and XCOLOR in pre(page), body(page))
    # the picker: Word's dark red is dvipsnames' BrickRed
    page.click('#rc-font-color-x'); page.wait_for_timeout(200)
    page.get_by_role('menuitem', name='Font Colors…').click(); page.wait_for_timeout(200)
    page.get_by_role('menuitemradio', name='BrickRed').click(); page.wait_for_timeout(250)
    check('the picker\'s Dark red recolours the words: \\textcolor{BrickRed}, xcolor with dvipsnames', body(page).startswith('Some \\textcolor{BrickRed}{plain words}') and '\\usepackage[dvipsnames]{xcolor}' in pre(page), (body(page)[:50], pre(page)))
    color = page.evaluate('getComputedStyle([...document.querySelectorAll("#pages .y-color")].pop()).color')
    check('and the page draws it in that colour (#B6321C)', color == 'rgb(182, 50, 28)', color)
    # the button again writes the last colour
    select_text(page, 'Another')
    run_cmd(page, 'font-color')
    check('the button writes the colour picked last', '\\textcolor{BrickRed}{Another}' in body(page), body(page))
    select_text(page, 'plain words')
    page.click('#rc-font-color-x'); page.wait_for_timeout(200)
    page.get_by_role('menuitem', name='Font Colors…').click(); page.wait_for_timeout(200)
    page.get_by_role('menuitem', name='Automatic').click(); page.wait_for_timeout(250)
    check('Automatic takes the colour off', body(page).startswith('Some plain words here.'), body(page))
    # hand written {\color{red} ..} keeps its form
    load_doc(page, WRAP(BODY.replace('plain words', '{\\color{red} plain words}'))); select_text(page, 'plain words')
    run_cmd(page, 'font-color', {'pick': {'name': 'blue'}})
    check('{\\color{red} ..} written by hand becomes {\\color{blue} ..}', body(page).startswith('Some {\\color{blue} plain words}'), body(page))
    run_cmd(page, 'font-color', {'pick': None})
    check('and Automatic takes it off whole', body(page) == BODY, body(page))
    # the highlighter in a colour
    load_doc(page, DOC); select_text(page, 'plain words')
    page.click('#rc-highlight-x'); page.wait_for_timeout(200)
    page.get_by_role('menuitemradio', name='Bright Green').click(); page.wait_for_timeout(250)
    check('Text Highlight Color options, Bright Green: \\hl[green] and its definition (ulem and xcolor) once', body(page).startswith('Some \\hl[green]{plain words}') and pre(page).count('DeclareRobustCommand{\\hl}') == 1 and ULEM in pre(page), (body(page)[:40], pre(page)))
    bg = page.evaluate('getComputedStyle(document.querySelector("#pages .y-hl")).backgroundColor')
    check('the page draws the highlight in green', bg in ('rgb(0, 255, 0)', 'rgb(30, 123, 60)'), bg)
    run_cmd(page, 'highlight')
    check('the button on words highlighted in its colour takes it off', body(page) == BODY, body(page))
    select_text(page, 'plain words')
    run_cmd(page, 'highlight', {'color': None})
    check('No Color on plain words changes nothing', body(page) == BODY, body(page))
    # Word import's highlighter of before: upgraded in place for a colour
    old = WRAP(BODY.replace('plain words', '\\hl{plain words}'), XCOLOR + ULEM + '\\DeclareRobustCommand{\\hl}{\\bgroup\\markoverwith{\\textcolor{yellow}{\\rule[-.5ex]{2pt}{2.5ex}}}\\ULon}\n')
    load_doc(page, old); select_text(page, 'Another')
    run_cmd(page, 'highlight', {'color': 'cyan'})
    check('Word import\'s highlighter without a colour becomes the one with [yellow]: \\hl[cyan] works', '\\hl[cyan]{Another}' in body(page) and HL in pre(page) and pre(page).count('DeclareRobustCommand{\\hl}') == 1, pre(page))
    # a document's own \hl keeps it: a colour is refused
    own = WRAP(BODY, '\\newcommand{\\hl}[1]{\\textbf{#1}}\n')
    load_doc(page, own); select_text(page, 'plain')
    run_cmd(page, 'highlight', {'color': 'cyan'})
    check('a document that defines \\hl itself: no colour is written over it', src(page) == own and 'defines' in page.inner_text('#toast'), page.inner_text('#toast'))
    # Underline's styles and colour
    load_doc(page, DOC); select_text(page, 'plain words')
    page.click('#rb-u-x'); page.wait_for_timeout(200)
    page.get_by_role('menuitemradio', name='Double underline').click(); page.wait_for_timeout(250)
    check('Underline options, Double underline: \\uuline', body(page).startswith('Some \\uuline{plain words}'), body(page))
    deco = page.evaluate('getComputedStyle(document.querySelector("#pages .y-ul2")).textDecorationStyle')
    check('drawn double on the page', deco == 'double', deco)
    run_cmd(page, 'underline', {'cmd': 'uwave'})
    check('Wave underline in its place: \\uwave', body(page).startswith('Some \\uwave{plain words}'), body(page))
    check('the Underline button shows it pressed', pressed(page, 'underline') is True)
    page.click('#rb-u-x'); page.wait_for_timeout(200)
    page.get_by_role('menuitem', name='Underline Color…').click(); page.wait_for_timeout(200)
    page.get_by_role('menuitemradio', name='blue', exact=True).click(); page.wait_for_timeout(250)
    check('Underline Color: \\culine{blue} (ulem\'s line coloured, defined once)', body(page).startswith('Some \\culine{blue}{plain words}') and pre(page).count('{\\culine}') == 1, (body(page)[:40], pre(page)))
    page.keyboard.press('Control+u'); page.wait_for_timeout(200)
    check('and Ctrl+U takes it off', body(page) == BODY, body(page))


def sizes(page):
    """The size box, Increase and Decrease Font Size, the document's size."""
    load_doc(page, DOC); select_text(page, 'plain words')
    page.wait_for_timeout(200)
    check('the size box shows the base size, 10', page.input_value('#rb-size') == '10', page.input_value('#rb-size'))
    page.fill('#rb-size', '12'); page.press('#rb-size', 'Enter'); page.wait_for_timeout(250)
    check('12 typed in the size box: {\\large ..} (10pt\'s large), the words still selected', body(page).startswith('Some {\\large plain words}') and page.evaluate('String(getSelection())') == 'plain words', body(page))
    page.wait_for_timeout(150)
    check('and the box shows 12 there', page.input_value('#rb-size') == '12', page.input_value('#rb-size'))
    page.fill('#rb-size', '13'); page.press('#rb-size', 'Enter'); page.wait_for_timeout(250)
    check('13: no size of LaTeX has it, {\\fontsize{13}{15.6}\\selectfont ..} in the same braces', body(page).startswith('Some {\\fontsize{13}{15.6}\\selectfont plain words}'), body(page))
    fs = page.evaluate('getComputedStyle([...document.querySelectorAll("#pages .y-fs")].pop()).fontSize')
    base = page.evaluate('getComputedStyle(document.querySelector("#pages .it")).fontSize')
    check('the page draws it 1.3 times the text', abs(float(fs[:-2]) / float(base[:-2]) - 1.3) < 0.02, (fs, base))
    run_cmd(page, 'grow-font')
    check('Increase Font Size from 13pt: the size after the nearest (large to Large)', body(page).startswith('Some {\\Large plain words}'), body(page))
    run_cmd(page, 'shrink-font'); run_cmd(page, 'shrink-font')
    check('Decrease Font Size twice: back to \\normalsize, so the switch goes', body(page) == BODY, body(page))
    # the list: each size with its LaTeX name
    select_text(page, 'plain words')
    page.focus('#rb-size'); page.keyboard.press('ArrowDown'); page.wait_for_timeout(250)
    items = page.get_by_role('menu', name='Font Size').get_by_role('menuitemradio').all_inner_texts()
    check('the size list names each size with its points: 5 tiny … 24.88 Huge', len(items) == 10 and items[0].startswith('5') and 'tiny' in items[0] and 'Huge' in items[-1], items)
    page.get_by_role('menuitemradio', name='14.4 Large').click(); page.wait_for_timeout(250)
    check('a size from the list: {\\Large ..}', body(page).startswith('Some {\\Large plain words}'), body(page))
    # at a caret in a word: that word, as Word does; the class line stays (review M7)
    load_doc(page, DOC); click_text(page, 'plain', 2)
    page.fill('#rb-size', '12'); page.press('#rb-size', 'Enter'); page.wait_for_timeout(300)
    check('the size box at a caret in a word sizes the word: {\\large plain}, the class line as it was', body(page).startswith('Some {\\large plain} words') and src(page).startswith('\\documentclass{article}'), body(page)[:60])
    run_cmd(page, 'grow-font')
    check('Increase Font Size at a caret in it: {\\Large plain}', body(page).startswith('Some {\\Large plain} words') and src(page).startswith('\\documentclass{article}'), body(page)[:60])
    load_doc(page, DOC); click_text(page, 'plain', 2)
    for _ in range(3): run_cmd(page, 'grow-font')
    check('Ctrl+] three times at a caret: the word three sizes up, never the class (\\documentclass{article} kept)', body(page).startswith('Some {\\LARGE plain} words') and src(page).startswith('\\documentclass{article}\n'), src(page)[:200])
    # the document's size: the Font dialog's Set As Default
    load_doc(page, DOC); click_text(page, 'plain', 2)
    page.keyboard.press('Control+d'); page.wait_for_timeout(300)
    dlg = page.get_by_role('dialog', name='Font')
    dlg.get_by_label('Size', exact=True).fill('14'); dlg.get_by_role('button', name='Set As Default').click(); page.wait_for_timeout(300)
    check('the document\'s size from Set As Default: 14pt, through extsizes\' extarticle', src(page).startswith('\\documentclass[14pt]{extarticle}') and body(page) == BODY, src(page)[:40])
    fs14 = page.evaluate('getComputedStyle(document.querySelector("#pages .it")).fontSize')
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
    fs10 = page.evaluate('getComputedStyle(document.querySelector("#pages .it")).fontSize')
    check('the page sets the text 14.4 / 10 times as large (size14.clo\'s \\normalsize), and one undo gives the class line of before byte for byte', abs(float(fs14[:-2]) / float(fs10[:-2]) - 1.44) < 0.02 and src(page) == DOC, (fs14, fs10))
    # a class with sizes of its own: Set As Default leaves it alone, and says so
    rev = DOC.replace('{article}', '{revtex4-2}')
    load_doc(page, rev); click_text(page, 'plain', 2)
    page.keyboard.press('Control+d'); page.wait_for_timeout(300)
    dlg = page.get_by_role('dialog', name='Font')
    dlg.get_by_label('Size', exact=True).fill('12'); dlg.get_by_role('button', name='Set As Default').click(); page.wait_for_timeout(300)
    check('a class that sets its own sizes is left alone by Set As Default', src(page) == rev, src(page)[:60])


def fonts(page):
    """The font box: a word's or a selection's family; the document's font from Set As Default; fontspec."""
    load_doc(page, DOC); click_text(page, 'plain', 2); page.wait_for_timeout(200)
    check('the font box shows the document\'s font, Computer Modern', page.input_value('#rb-font') == 'Computer Modern', page.input_value('#rb-font'))
    page.fill('#rb-font', 'Times'); page.press('#rb-font', 'Enter'); page.wait_for_timeout(300)
    check('Times at a caret in a word: that word, {\\fontfamily{ptm}\\selectfont plain}; the preamble as it was (review M7)', body(page).startswith('Some {\\fontfamily{ptm}\\selectfont plain} words') and pre(page) == DOC[:DOC.index('\\begin{document}')], body(page)[:60])
    # the document's font: the Font dialog's Set As Default
    load_doc(page, DOC); click_text(page, 'plain', 2); page.wait_for_timeout(150)
    page.keyboard.press('Control+d'); page.wait_for_timeout(300)
    dlg = page.get_by_role('dialog', name='Font')
    dlg.get_by_label('Font name', exact=True).select_option(label='Times'); dlg.get_by_role('button', name='Set As Default').click(); page.wait_for_timeout(300)
    check('Times from Set As Default: the document\'s font, \\usepackage{newtxtext,newtxmath} after the packages', '\\usepackage{amsmath}\n\\usepackage{newtxtext,newtxmath}\n' in pre(page) and body(page) == BODY, pre(page))
    ff = page.evaluate('getComputedStyle(document.querySelector("#pages .it")).fontFamily')
    check('the page sets the text in a Times', 'Times' in ff or 'Termes' in ff, ff)
    page.wait_for_timeout(150); click_text(page, 'plain', 2); page.wait_for_timeout(150)
    check('and the box says Times', page.input_value('#rb-font') == 'Times', page.input_value('#rb-font'))
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
    check('one undo: the preamble of before', src(page) == DOC, pre(page))
    # a selection's family
    select_text(page, 'plain words')
    page.focus('#rb-font'); page.keyboard.press('ArrowDown'); page.wait_for_timeout(250)
    names = page.get_by_role('menu', name='Font').get_by_role('menuitemradio').all_inner_texts()
    check('with text selected the list starts with Serif, Sans Serif, Monospace', names[:3] == ['Serif', 'Sans Serif', 'Monospace'], names[:5])
    page.get_by_role('menuitemradio', name='Sans Serif').click(); page.wait_for_timeout(250)
    check('Sans Serif on the selection: \\textsf', body(page).startswith('Some \\textsf{plain words}'), body(page))
    page.fill('#rb-font', 'Palatino'); page.press('#rb-font', 'Enter'); page.wait_for_timeout(250)
    check('Palatino on it: {\\fontfamily{ppl}\\selectfont ..} in the place of \\textsf', body(page).startswith('Some {\\fontfamily{ppl}\\selectfont plain words}'), body(page))
    cls = page.evaluate('[...document.querySelectorAll("#pages .y")].map((e) => e.className).join(" ")')
    check('drawn in the Palatino look', 'y-ff-palatino' in cls, cls)
    page.fill('#rb-font', 'Computer Modern'); page.press('#rb-font', 'Enter'); page.wait_for_timeout(250)
    check('the document\'s own font on it again: the family goes', body(page) == BODY, body(page))
    # fontspec
    xe = '% !TeX program = xelatex\n' + DOC
    load_doc(page, xe); click_text(page, 'plain', 2)
    page.keyboard.press('Control+d'); page.wait_for_timeout(300)
    dlg = page.get_by_role('dialog', name='Font')
    dlg.get_by_label('Font name', exact=True).select_option(label='Palatino'); dlg.get_by_role('button', name='Set As Default').click(); page.wait_for_timeout(300)
    check('a XeLaTeX document: fontspec and \\setmainfont{TeX Gyre Pagella}', '\\usepackage{fontspec}\n\\setmainfont{TeX Gyre Pagella}\n' in src(page), pre(page))
    click_text(page, 'plain', 2)
    page.fill('#rb-font', 'Nonesuch'); page.press('#rb-font', 'Enter'); page.wait_for_timeout(200)
    check('a font Rikuy\'s TeX has not: nothing written, the fonts there are named', 'TeX Gyre Pagella' in src(page) and 'Times' in page.inner_text('#toast'), page.inner_text('#toast'))


def case_and_clear(page):
    load_doc(page, WRAP('hello \\textbf{world} again \\cite{Key} $x$.')); page.wait_for_timeout(100)
    place(page, ('hello', 'again'))
    page.click('#rc-change-case'); page.wait_for_timeout(200)
    page.get_by_role('menuitem', name='UPPERCASE').click(); page.wait_for_timeout(250)
    check('Change Case, UPPERCASE: the letters only, commands kept', body(page) == 'HELLO \\textbf{WORLD} AGAIN \\cite{Key} $x$.', body(page))
    place(page, ('HELLO', 'AGAIN'))
    page.click('#rc-change-case'); page.wait_for_timeout(200)
    page.get_by_role('menuitem', name='Sentence case.').click(); page.wait_for_timeout(250)
    check('Sentence case.', body(page) == 'Hello \\textbf{world} again \\cite{Key} $x$.', body(page))
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(150)
    check('one undo per change', body(page) == 'HELLO \\textbf{WORLD} AGAIN \\cite{Key} $x$.', body(page))
    # Clear All Formatting: the wrappers and the paragraph's alignment
    nested = WRAP('x\n\n\\begin{center}\nSome \\textbf{bold \\textcolor{red}{red}} words {\\large big}.\n\\end{center}\n\ny')
    load_doc(page, nested); place(page, ('Some', 'big'))
    run_cmd(page, 'clear-formatting')
    check('Clear All Formatting: bold, colour, size off the selection, center off its paragraph, one step', body(page) == 'x\n\nSome bold red words big.\n\ny' and page.evaluate('window.rikuy.hist.length') == 1, body(page))
    load_doc(page, nested); place(page, ('Some', 'big'))
    run_cmd(page, 'clear-char-formatting')
    check('Clear Character Formatting keeps the alignment', '\\begin{center}\nSome bold red words big.\n\\end{center}' in body(page), body(page))
    load_doc(page, WRAP('A \\textbf{bcd} e')); select_text(page, 'c')
    run_cmd(page, 'clear-formatting')
    check('Clear on part of a bold word: the parts around keep their bold', body(page) == 'A \\textbf{b}c\\textbf{d} e', body(page))


def painter(page):
    text = 'Some \\textcolor{red}{\\textbf{styled}} words and plain ones and other ones.'
    up = lambda: page.evaluate('document.getElementById("pages").dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))') or page.wait_for_timeout(300)
    load_doc(page, WRAP(text)); click_text(page, 'styled', 3)
    run_cmd(page, 'format-painter')
    check('the Format Painter is pressed while it is armed', pressed(page, 'format-painter') is True and page.evaluate('document.body.classList.contains("fpainting")'))
    select_text(page, 'plain'); up()
    check('a selection made with it gets the formats of the caret, outermost first', '\\textcolor{red}{\\textbf{plain}}' in body(page), body(page))
    check('then it is off', pressed(page, 'format-painter') is False and not page.evaluate('document.body.classList.contains("fpainting")'))
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
    check('one undo gives the words back', body(page) == text, body(page))
    # double click: until Escape; a click in a word paints the word
    click_text(page, 'styled', 3)
    page.dblclick('#rc-format-painter'); page.wait_for_timeout(200)
    for w in ('plain', 'other'):
        click_text(page, w, 2); up()
    check('double click keeps it: two words clicked into, both painted whole', body(page).count('\\textcolor{red}{\\textbf{') == 3 and '{plain}}' in body(page) and '{other}}' in body(page) and pressed(page, 'format-painter') is True, body(page))
    page.keyboard.press('Escape'); page.wait_for_timeout(150)
    check('Escape puts it away', pressed(page, 'format-painter') is False)
    # from plain words: the next selection is made plain
    load_doc(page, WRAP(text)); click_text(page, 'words', 2)
    run_cmd(page, 'format-painter')
    select_text(page, 'styled'); up()
    check('painted from plain words, formatted ones become plain', body(page) == 'Some styled words and plain ones and other ones.', body(page))


def autoformat(page):
    load_doc(page, DOC); click_text(page, 'here', 4)
    page.keyboard.type(' *bold words*'); page.wait_for_timeout(250)
    check('*bold words* typed: \\textbf{bold words}', 'here \\textbf{bold words}.' in body(page), body(page))
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
    check('one undo gives the marks back as typed', 'here *bold words*.' in body(page), body(page))
    load_doc(page, DOC); click_text(page, 'here', 4)
    page.keyboard.type(' _slanted_'); page.wait_for_timeout(250)
    check('_slanted_ typed: \\emph{slanted}', 'here \\emph{slanted}.' in body(page), body(page))
    load_doc(page, DOC); click_text(page, 'here', 4)
    page.keyboard.type(' 2*3*4'); page.wait_for_timeout(250)
    check('2*3*4 stays as typed: a mark inside a word is no format', 'here 2*3*4.' in body(page), body(page))


def dialog(page):
    load_doc(page, DOC); select_text(page, 'plain words')
    run_cmd(page, 'font-dialog')
    d = page.get_by_role('dialog', name='Font')
    check('the Font dialog: its fields by name, the tabs Font and Advanced, a preview', d.get_by_role('combobox', name='Font name').count() == 1 and d.get_by_role('tab', name='Advanced').count() == 1
          and d.get_by_role('checkbox', name='Small caps').count() == 1 and d.get_by_role('img', name='Preview').count() == 1)
    d.get_by_role('combobox', name='Font style').select_option(label='Bold Italic')
    d.get_by_role('combobox', name='Font color').select_option('red')
    d.get_by_role('checkbox', name='Small caps').check()
    d.get_by_role('checkbox', name='Superscript', exact=True).check()
    d.get_by_role('combobox', name='Underline style').select_option('uuline')
    d.get_by_role('tab', name='Advanced').click()
    d.get_by_role('combobox', name='Spacing').select_option('e')
    pv = page.evaluate('(() => { const s = getComputedStyle(document.querySelector(".fd-pvt")); return [s.fontWeight, s.fontStyle, s.fontVariantCaps || s.fontVariant, s.textDecorationStyle]; })()')
    check('the preview shows the choices as they are made', pv[0] == '700' and pv[1] == 'italic' and 'small-caps' in pv[2] and pv[3] == 'double', pv)
    d.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    b = body(page)
    check('OK writes each change as its command, in one step', all(x in b for x in ('\\textbf{', '\\emph{', '\\textcolor{red}{', '\\textsc{', '\\textsuperscript{', '\\uuline{', '\\textls[100]{'))
          and page.evaluate('window.rikuy.hist.length') == 1 and '\\usepackage{microtype}' in pre(page), b)
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
    check('one undo: the source of before, byte for byte', src(page) == DOC, src(page)[-120:])
    # read back: the dialog shows what the words have
    load_doc(page, WRAP(BODY.replace('plain words', '\\textbf{\\textcolor{blue}{\\sout{plain words}}}'), XCOLOR + ULEM)); select_text(page, 'plain words')
    page.keyboard.press('Control+d'); page.wait_for_timeout(250)
    d = page.get_by_role('dialog', name='Font')
    st = [d.get_by_role('combobox', name='Font style').input_value(), d.get_by_role('combobox', name='Font color').input_value(), d.get_by_role('checkbox', name='Strikethrough', exact=True).is_checked()]
    check('opened on formatted words it shows their formats', st == ['b', 'blue', True], st)
    d.get_by_role('checkbox', name='Double strikethrough').check()
    check('Double strikethrough takes Strikethrough\'s place (one of the two)', not d.get_by_role('checkbox', name='Strikethrough', exact=True).is_checked())
    d.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    check('and OK changes only that', '\\textbf{\\textcolor{blue}{\\dsout{plain words}}}' in body(page), body(page))
    # Set As Default: the document's font and size
    load_doc(page, DOC); click_text(page, 'plain', 2)
    page.keyboard.press('Control+d'); page.wait_for_timeout(250)
    d = page.get_by_role('dialog', name='Font')
    d.get_by_role('combobox', name='Font name').select_option(label='Charter')
    d.get_by_role('textbox', name='Size').fill('12') if d.get_by_role('textbox', name='Size').count() else d.get_by_role('combobox', name='Size').fill('12')
    d.get_by_role('button', name='Set As Default').click(); page.wait_for_timeout(300)
    check('Set As Default: the document in Charter at 12pt, one step', src(page).startswith('\\documentclass[12pt]{article}') and '\\usepackage{XCharter}' in pre(page) and page.evaluate('window.rikuy.hist.length') == 1, pre(page))
    # Phonetic Guide
    load_doc(page, DOC); select_text(page, 'plain')
    run_cmd(page, 'phonetic-guide')
    g = page.get_by_role('dialog', name='Phonetic Guide')
    g.get_by_role('textbox', name='Ruby text').fill('pleyn'); g.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    check('Phonetic Guide: \\ruby{plain}{pleyn} and its definition', body(page).startswith('Some \\ruby{plain}{pleyn} words') and '\\providecommand{\\ruby}' in pre(page), body(page))
    title = page.evaluate('document.querySelector("#pages .y-ruby").title')
    check('drawn with the reading over it', title == 'pleyn', title)


def page_looks(page):
    """How the page draws what the group writes."""
    load_doc(page, WRAP('a \\uwave{w} \\dashuline{d} \\dotuline{o} \\dsout{s} \\textcircled{c} \\hl{h} \\raisebox{3pt}{r} \\textls[100]{l}'))
    st = page.evaluate('''(() => { const g = (c, p) => getComputedStyle(document.querySelector('#pages .' + c))[p];
      return [g('y-ulw', 'textDecorationStyle'), g('y-uld', 'textDecorationStyle'), g('y-ulo', 'textDecorationStyle'), g('y-so2', 'textDecorationStyle'), g('y-circ', 'borderTopLeftRadius'), g('y-hl', 'backgroundColor'), g('y-raise', 'top'), g('y-ls', 'letterSpacing')]; })()''')
    check('wave, dashed, dotted, double strike, a circle, the highlight, raised and spaced letters are drawn', st[:4] == ['wavy', 'dashed', 'dotted', 'double'] and st[4] == '50%' and st[5] != 'rgba(0, 0, 0, 0)' and st[6].startswith('-') and st[7] != 'normal', st)


def compiles(page):
    """The PDF of a document with every format the group writes (dist/tex only)."""
    if not os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        print('SKIP the PDF of every format: no TeX tree in %s' % DIST)
        return
    words = ['under', 'double', 'wave', 'dashed', 'dotted', 'colored', 'struck', 'twice', 'lower', 'upper', 'marked', 'greened', 'reddish', 'smallcaps', 'allcaps', 'boxed', 'shaded',
             'circled', 'larger', 'thirteen', 'palatino', 'spaced', 'scaled', 'raised', 'base']
    load_doc(page, WRAP(' '.join(words) + '.'))
    steps = [('under', 'underline', None), ('double', 'underline', {'cmd': 'uuline'}), ('wave', 'underline', {'cmd': 'uwave'}), ('dashed', 'underline', {'cmd': 'dashuline'}),
             ('dotted', 'underline', {'cmd': 'dotuline'}), ('struck', 'strikethrough', None), ('twice', 'double-strikethrough', None), ('lower', 'subscript', None),
             ('upper', 'superscript', None), ('marked', 'highlight', None), ('greened', 'highlight', {'color': 'green'}), ('reddish', 'font-color', {'pick': {'name': 'BrickRed'}}),
             ('smallcaps', 'small-caps', None), ('allcaps', 'all-caps', None), ('boxed', 'char-border', None), ('shaded', 'char-shading', None), ('circled', 'enclose-chars', None),
             ('larger', 'grow-font', None)]
    for w, cmd, args in steps:
        select_text(page, w); run_cmd(page, cmd, args)
    select_text(page, 'colored'); page.evaluate('window.rikuy.underlineColor ? 0 : 0')
    page.evaluate('window.rikuy.fmtSet("underline", { cmd: "culine", args: ["red"] })'); page.wait_for_timeout(150)
    select_text(page, 'thirteen'); page.evaluate('window.rikuy.setFontSize(13)'); page.wait_for_timeout(150)
    select_text(page, 'palatino'); page.evaluate('window.rikuy.setFontName("palatino")'); page.wait_for_timeout(150)
    select_text(page, 'spaced'); page.evaluate('window.rikuy.fmtSet("spacing", { cmd: "textls", opt: "80" })'); page.wait_for_timeout(150)
    select_text(page, 'scaled'); page.evaluate('window.rikuy.fmtSet("scale", { cmd: "scalebox", args: ["1.5"], opt2: "1" })'); page.wait_for_timeout(150)
    select_text(page, 'raised'); page.evaluate('window.rikuy.fmtSet("position", { cmd: "raisebox", args: ["3pt"] })'); page.wait_for_timeout(150)
    select_text(page, 'base'); run_cmd(page, 'phonetic-guide')
    page.get_by_role('dialog', name='Phonetic Guide').get_by_role('textbox', name='Ruby text').fill('reading')
    page.get_by_role('dialog', name='Phonetic Guide').get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    click_text(page, 'under', 1); page.evaluate('window.rikuy.setDocSize(14)'); page.wait_for_timeout(150)
    page.evaluate('window.rikuy.setDocFont("times")'); page.wait_for_timeout(150)
    t = src(page)
    page.set_default_timeout(600000)
    r = page.evaluate("""async (t) => { await window.rikuy.api.setSource(t); const r = await window.rikuy.api.compile();
      let s = ''; if (r.pdf) for (let i = 0; i < r.pdf.length; i += 8192) s += String.fromCharCode(...r.pdf.subarray(i, i + 8192));
      return { ok: r.ok, pages: r.pages, problems: (window.rikuy.api.problems ? window.rikuy.api.problems() : []), pdf: s ? btoa(s) : '' }; }""", t)
    page.set_default_timeout(30000)
    probs = [p for p in (r.get('problems') or []) if (p.get('severity') if isinstance(p, dict) else '') == 'error']
    pdf = r.pop('pdf', '')
    check('every format the group writes compiles in the page (extarticle 14pt, Times, ulem, xcolor, the definitions)', r['ok'] and r['pages'] == 1 and not probs, (r, t[:900]))
    try:
        import base64, io, pypdf
        text = ' '.join(pg.extract_text() for pg in pypdf.PdfReader(io.BytesIO(base64.b64decode(pdf))).pages)
        # (all caps prints its word in capitals; the rest as written)
        want = [w for w in words if w not in ('allcaps', 'smallcaps')] + ['ALLCAPS']
        check('and the PDF has every word, ALLCAPS in capitals, and the reading over its base', all(w in text for w in want) and 'reading' in text, [w for w in want if w not in text])
    except ImportError:
        print('SKIP the words of the PDF: no pypdf')


def review(page):
    """The hostile review of a20db3f: each finding's case on the page."""
    # H3: Change Case on everything: only the words the page draws
    B = ('He said \\foreignlanguage{french}{bonjour} to me.\n\n\\begin{equation}\n  x = y + z \\label{eq:a}\n\\end{equation}\n\n'
         '\\begin{tabular}{lc}\nName & \\multicolumn{1}{c}{Total} \\\\\nab & cd\n\\end{tabular}\n\nSee \\cpageref{eq:a} words\\footnote{the note} more.\n\n% rikuy: latex\n\\textbf{raw} kept\n\nLast \\emph{words} stra\\ss e.')
    D = WRAP(B, '\\usepackage[french,english]{babel}\n\\usepackage{cleveref}\n')
    load_doc(page, D); page.wait_for_timeout(300); click_text(page, 'He said', 2)
    page.keyboard.press('Control+a'); page.wait_for_timeout(150)
    run_cmd(page, 'change-case', {'mode': 'upper'})
    want = B.replace('He said', 'HE SAID').replace('{bonjour} to me', '{BONJOUR} TO ME').replace('Name &', 'NAME &').replace('{Total}', '{TOTAL}').replace('ab & cd', 'AB & CD') \
        .replace('See \\cpageref', 'SEE \\cpageref').replace('words\\footnote', 'WORDS\\footnote').replace('more.', 'MORE.').replace('Last \\emph{words} stra\\ss e.', 'LAST \\emph{WORDS} STRA\\SS E.')
    check('review H3: Ctrl+A, UPPERCASE changes only the words the page draws (no math, label, column spec, reference key, footnote behind its mark or LaTeX paragraph)', body(page) == want, body(page))
    # H4: Underline over a footnote mark: the line closes around it, and the document compiles
    U = WRAP('Some words\\footnote{A note.} and more words here.')
    load_doc(page, U); page.wait_for_timeout(200)
    page.evaluate("""() => { const sp = [...document.querySelectorAll('#pages span.t')]; const s = sp.find((x) => x.textContent.includes('words')), e = sp.find((x) => x.textContent.includes('and more'));
      const r = document.createRange(); r.setStart(s.firstChild, s.textContent.indexOf('words')); r.setEnd(e.firstChild, e.textContent.indexOf('and more') + 3); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }""")
    page.keyboard.press('Control+u'); page.wait_for_timeout(300)
    check('review H4: Ctrl+U over a footnote mark: \\uline{words}\\footnote{A note.}\\uline{ and}', body(page) == 'Some \\uline{words}\\footnote{A note.}\\uline{ and} more words here.', body(page))
    for cmd in ('strikethrough', 'highlight', 'double-strikethrough'):
        run_cmd(page, cmd)
    h4 = src(page)
    check('and Strikethrough, Highlight, Double Strikethrough on it too, each around the footnote', '\\sout{' in h4 and '\\footnote{A note.}' in h4 and h4.count('\\footnote') == 1 and 'A note.}}' not in h4, body(page))
    if os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        page.set_default_timeout(600000)
        r = page.evaluate("""async (t) => { await window.rikuy.api.setSource(t); const r = await window.rikuy.api.compile(); return { ok: r.ok, pages: r.pages, problems: (window.rikuy.api.problems ? window.rikuy.api.problems() : []) }; }""", h4)
        page.set_default_timeout(30000)
        errs = [x for x in (r.get('problems') or []) if isinstance(x, dict) and x.get('severity') == 'error']
        check('review H4: that document compiles in the page with no error (it stopped TeX with 7)', r['ok'] and not errs, (r, h4[-300:]))
    else:
        print('SKIP the compile of review H4: no TeX tree in %s' % DIST)
    # H5: the Font dialog at a caret keeps a main font Rikuy does not list
    X = '% !TeX program = xelatex\n\\documentclass{article}\n\\usepackage{fontspec}\n\\setmainfont{Libertinus Serif}\n\\begin{document}\nSome plain words here.\n\\end{document}\n'
    load_doc(page, X); click_text(page, 'plain', 2); page.wait_for_timeout(200)
    check('review H5: the font box shows the document\'s own font, Libertinus Serif', page.input_value('#rb-font') == 'Libertinus Serif', page.input_value('#rb-font'))
    page.keyboard.press('Control+d'); page.wait_for_timeout(300)
    dlg = page.get_by_role('dialog', name='Font')
    dlg.get_by_label('Font style', exact=True).select_option(label='Bold'); dlg.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    check('review H5: Bold and OK at a caret: the word bold, \\setmainfont{Libertinus Serif} kept', '\\setmainfont{Libertinus Serif}' in src(page) and 'Latin Modern' not in src(page) and '\\textbf{plain}' in src(page), src(page)[:200])
    click_text(page, 'here', 2); page.keyboard.press('Control+d'); page.wait_for_timeout(300)
    page.get_by_role('dialog', name='Font').get_by_role('button', name='Set As Default').click(); page.wait_for_timeout(300)
    check('and Set As Default with nothing changed keeps it too', '\\setmainfont{Libertinus Serif}' in src(page) and 'Latin Modern' not in src(page), src(page)[:200])
    # H6: a font package Rikuy does not list: its name in the box, replaced by the font chosen
    F6 = WRAP('Some plain words here.', '\\usepackage{fourier}\n')
    load_doc(page, F6); click_text(page, 'plain', 2); page.wait_for_timeout(200)
    check('review H6: \\usepackage{fourier}: the box says Utopia (Fourier)', page.input_value('#rb-font') == 'Utopia (Fourier)', page.input_value('#rb-font'))
    page.keyboard.press('Control+d'); page.wait_for_timeout(300)
    dlg = page.get_by_role('dialog', name='Font')
    dlg.get_by_label('Font name', exact=True).select_option(label='Times'); dlg.get_by_role('button', name='Set As Default').click(); page.wait_for_timeout(300)
    check('review H6: Times as the default replaces fourier (no two font setups)', 'fourier' not in pre(page) and '\\usepackage{newtxtext,newtxmath}' in pre(page), pre(page))
    # M2: Increase and Decrease Font Size on part of a sized run step from its size
    load_doc(page, WRAP('A {\\large abc def ghi} z.')); select_text(page, 'def')
    page.keyboard.press('Control+]'); page.wait_for_timeout(250)
    check('review M2: Ctrl+] on a word of {\\large ..}: that word \\Large, the rest still \\large', body(page) == 'A {\\large abc }{\\Large def}{\\large ghi} z.', body(page))
    load_doc(page, WRAP('A {\\Huge abc def ghi} z.')); select_text(page, 'def')
    page.keyboard.press('Control+['); page.wait_for_timeout(250)
    check('review M2: Ctrl+[ on a word of {\\Huge ..}: \\huge, never a size below', body(page) == 'A {\\Huge abc }{\\huge def}{\\Huge ghi} z.', body(page))
    # M3: the Format Painter and the Font dialog over two paragraphs
    P = WRAP('Source \\textcolor{red}{\\textbf{styled}} word.\n\nFirst target para.\n\nSecond target para.')
    load_doc(page, P); click_text(page, 'styled', 2); run_cmd(page, 'format-painter')
    place(page, ('First', 'Second target'))
    page.evaluate('document.getElementById("pages").dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))'); page.wait_for_timeout(400)
    check('review M3: the Format Painter over two paragraphs paints each', '\\textcolor{red}{\\textbf{First target para.}}\n\n\\textcolor{red}{\\textbf{Second target}} para.' in body(page), body(page))
    load_doc(page, WRAP('First para words.\n\nSecond para words.')); place(page, ('para', 'Second'))
    page.keyboard.press('Control+d'); page.wait_for_timeout(300)
    dlg = page.get_by_role('dialog', name='Font')
    dlg.get_by_label('Font style', exact=True).select_option(label='Bold Italic'); dlg.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    check('review M3: the Font dialog over two paragraphs: bold and italic on each part', 'First \\textbf{\\emph{para words.}}' in body(page) and '\\textbf{\\emph{Second}} para words.' in body(page), body(page))
    run_cmd(page, 'bold')
    check('and Bold again on it all: off on each', 'First \\emph{para words.}' in body(page) and '\\emph{Second} para' in body(page) and 'textbf' not in body(page), body(page))
    # M4: Clear All over a LaTeX paragraph leaves its source
    L = WRAP('First \\textbf{bold words} here.\n\n% rikuy: latex\n\\textbf{Raw} code \\emph{kept} as is.\n\nLast \\emph{words} end.')
    load_doc(page, L); place(page, ('First', 'end.'))
    run_cmd(page, 'clear-formatting')
    check('review M4: Clear All over a LaTeX paragraph: the text around plain, its source as it was', body(page) == 'First bold words here.\n\n% rikuy: latex\n\\textbf{Raw} code \\emph{kept} as is.\n\nLast words end.', body(page))
    load_doc(page, L); place(page, ('First', 'end.')); run_cmd(page, 'italic')
    check('review M4: Italic over it: the mark stays on its own line, outside \\emph', '\n\n% rikuy: latex\n\\textbf{Raw}' in body(page) and '\\emph{% rikuy' not in body(page), body(page))
    # M6: Automatic on one word of a coloured run
    load_doc(page, WRAP('A \\textcolor{red}{abc def ghi} z.')); select_text(page, 'def')
    page.evaluate('window.rikuy.fmtSet("color", null)'); page.wait_for_timeout(200)
    check('review M6: Automatic on one word of a red run: that word alone', body(page) == 'A \\textcolor{red}{abc }def\\textcolor{red}{ ghi} z.', body(page))
    # L2: Character Shading: a box on a word, the highlighter's grey on words
    load_doc(page, DOC); select_text(page, 'plain'); run_cmd(page, 'char-shading')
    check('review L2: Character Shading on a word: \\colorbox{lightgray}', '\\colorbox{lightgray}{plain}' in body(page), body(page))
    load_doc(page, DOC); select_text(page, 'plain words'); run_cmd(page, 'char-shading')
    check('review L2: on words: \\hl[lightgray], which breaks across lines', '\\hl[lightgray]{plain words}' in body(page), body(page))
    run_cmd(page, 'char-shading')
    check('and again takes it off', 'plain words' in body(page) and 'lightgray' not in body(page), body(page))
    # L7: the boxes: Enter keeps the selection, Tab applies, the list opens on the size there is
    load_doc(page, DOC); select_text(page, 'plain words')
    page.keyboard.press('Control+Shift+F'); page.wait_for_timeout(200); page.keyboard.type('Palatino'); page.keyboard.press('Enter'); page.wait_for_timeout(300)
    check('review L7: Ctrl+Shift+F, a font, Enter: applied and the words still selected', '{\\fontfamily{ppl}\\selectfont plain words}' in body(page) and page.evaluate('String(getSelection())') == 'plain words', (body(page), page.evaluate('String(getSelection())')))
    load_doc(page, DOC); select_text(page, 'plain words')
    page.focus('#rb-size'); page.keyboard.type('14.4'); page.keyboard.press('Tab'); page.wait_for_timeout(300)
    check('review L7: a size typed and Tab: applied, the focus on the next control', '{\\Large plain words}' in body(page) and page.evaluate('document.activeElement.id') != 'rb-size', (body(page), page.evaluate('document.activeElement.id')))
    load_doc(page, DOC); select_text(page, 'plain words'); page.focus('#rb-size'); page.keyboard.press('ArrowDown'); page.wait_for_timeout(250)
    check('review L7: the size list opens on the size there is (10)', page.evaluate("document.activeElement.getAttribute('aria-checked') === 'true' && document.activeElement.textContent.trim().startsWith('10')"), page.evaluate('document.activeElement.textContent'))
    page.keyboard.press('Escape')


def review2(page):
    """The verifier's last round on 921d945: each case on the page."""
    # 1: Change Case over a table: each cell and row starts a word and a sentence
    T = '\\begin{tabular}{ll}\nAb Cd & Ef Gh \\\\\nIj & Kl\n\\end{tabular}'
    for mode, before, after in (('title', T, T), ('sentence', T.replace('Ab Cd & Ef Gh', 'ab cd & ef gh').replace('Ij & Kl', 'ij & kl'), T.replace('Cd', 'cd').replace('Gh', 'gh'))):
        load_doc(page, WRAP(before)); page.wait_for_timeout(250)
        page.evaluate("""() => { const sp = [...document.querySelectorAll('#pages span.t')]; const s = sp.find((x) => /ab/i.test(x.textContent)), e = sp.find((x) => /kl/i.test(x.textContent));
          const r = document.createRange(); r.setStart(s.firstChild, 0); r.setEnd(e.firstChild, e.textContent.length); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }""")
        page.wait_for_timeout(120); run_cmd(page, 'change-case', {'mode': mode})
        check('verify 1: Change Case %s over a table: every cell and row starts its words%s' % (mode, ' and sentences' if mode == 'sentence' else ''), body(page) == after, body(page))
    # 2: \SS drawn as two letters: one edit
    load_doc(page, WRAP('STRA\\SS E and more.')); page.wait_for_timeout(200); click_text(page, 'and', 1)
    page.keyboard.press('Control+a'); page.wait_for_timeout(120); run_cmd(page, 'change-case', {'mode': 'lower'})
    check('verify 2: lowercase on \\SS gives \\ss once', body(page) == 'stra\\ss e and more.', body(page))
    # 3: Greek's final sigma
    load_doc(page, WRAP('ΟΔΟΣ ΚΑΙ ΣΟΦΙΑ.')); page.wait_for_timeout(200); click_text(page, 'ΚΑΙ', 1)
    page.keyboard.press('Control+a'); page.wait_for_timeout(120); run_cmd(page, 'change-case', {'mode': 'lower'})
    check('verify 3: lowercase Greek ends a word in ς', body(page) == 'οδος και σοφια.', body(page))
    # 4: a selection over a heading: the heading stays out of the line (and the document compiles)
    H = WRAP('Some text here.\n\\section{Head Title}\nMore text.', '\\usepackage[normalem]{ulem}\n')
    load_doc(page, H); page.wait_for_timeout(200); place(page, ('text here', 'More'))
    page.keyboard.press('Control+u'); page.wait_for_timeout(300)
    check('verify 4: Underline over a heading leaves the heading out: \\uline{text here.} \\section{Head Title} \\uline{More}', body(page) == 'Some \\uline{text here.}\n\\section{Head Title}\n\\uline{More} text.', body(page))
    if os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        page.set_default_timeout(600000)
        r = page.evaluate("""async (t) => { await window.rikuy.api.setSource(t); const r = await window.rikuy.api.compile(); return { ok: r.ok, problems: (window.rikuy.api.problems ? window.rikuy.api.problems() : []) }; }""", src(page))
        page.set_default_timeout(30000)
        errs = [x for x in (r.get('problems') or []) if isinstance(x, dict) and x.get('severity') == 'error']
        check('verify 4: and it compiles in the page with no error (\\uline{\\section..} stopped TeX)', r['ok'] and not errs, r)
    # 4: Select All over a document that reads in another file: both files
    files = {'main.tex': WRAP('Intro words here.\n\n\\input{chap}\n\nLast words.'), 'chap.tex': 'Chapter words here.\n'}
    load_doc(page, files); page.wait_for_timeout(300); click_text(page, 'Intro', 1)
    page.keyboard.press('Control+a'); page.wait_for_timeout(120); run_cmd(page, 'bold')
    m, ch = src(page), page.evaluate("window.rikuy.src('chap.tex')")
    check('verify 4: Ctrl+A, Bold over a document with \\input: the main file\'s words and the file read in, \\input left out', '\\textbf{Intro words here.}' in m and '\\textbf{Last words.}' in m and '\\input{chap}' in m and '\\textbf{\\input' not in m and ch.startswith('\\textbf{Chapter words here.}'), (m[m.index('\\begin{document}'):], ch))
    check('verify 4: and all of it is still selected', 'Chapter' in page.evaluate('String(getSelection())') and 'Intro' in page.evaluate('String(getSelection())'), page.evaluate('String(getSelection())')[:80])
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
    check('verify 4: one undo takes it off both files', src(page) == files['main.tex'] and page.evaluate("window.rikuy.src('chap.tex')") == files['chap.tex'], page.evaluate("window.rikuy.src('chap.tex')"))
    click_text(page, 'Intro', 1); page.keyboard.press('Control+a'); page.wait_for_timeout(120); run_cmd(page, 'change-case', {'mode': 'upper'})
    check('verify 4: Ctrl+A, UPPERCASE: every file\'s words', 'INTRO WORDS HERE.' in src(page) and 'LAST WORDS.' in src(page) and page.evaluate("window.rikuy.src('chap.tex')").startswith('CHAPTER WORDS HERE.'), page.evaluate("window.rikuy.src('chap.tex')"))
    # 5: the largest size says so
    load_doc(page, WRAP('A {\\Huge big} z.')); page.wait_for_timeout(200); select_text(page, 'big')
    page.evaluate('document.getElementById("toast").hidden = true')
    page.keyboard.press('Control+]'); page.wait_for_timeout(250)
    check('verify 5: Increase Font Size at \\Huge changes nothing and says it is the largest', body(page) == 'A {\\Huge big} z.' and 'largest' in page.inner_text('#toast'), page.inner_text('#toast'))
    # 5: Home fits at 521 and 525 px with every group it can fold folded
    for w in (521, 525):
        page.set_viewport_size({'width': w, 'height': 900}); page.wait_for_timeout(250)
        over = page.evaluate("(() => { const r = document.getElementById('ribbon'); return r.scrollWidth - r.clientWidth; })()")
        check('verify 5: Home\'s row fits at %d px' % w, over <= 1, over)
    page.set_viewport_size({'width': 1400, 'height': 900})


def run():
    with sync_playwright() as p:
        fns = (round_trips, keys, colors, sizes, fonts, case_and_clear, painter, autoformat, dialog, page_looks, review, review2, compiles)
        for fn in [f for f in fns if len(sys.argv) < 2 or f.__name__ in sys.argv[1:]]:
            browser, page, errors = open_page(p, width=1400, height=900)
            try:
                fn(page)
            except Exception as e:
                check('%s runs to its end' % fn.__name__, False, str(e)[:400])
            check('no console errors (%s)' % fn.__name__, not [e for e in errors if 'tree.wasm' not in e and 'TeX' not in e], errors[:4])
            browser.close()
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(run())
