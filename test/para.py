"""Paragraphs (src/cmd/para.js, src/parasrc.js, src/ui/paradialog.js), in Chromium.

Align Left, Center, Align Right and Justify by their buttons and by Ctrl+L, Ctrl+E, Ctrl+R and
Ctrl+J on the page: the round trip rule for each (one step, undo to the bytes, the button pressed
on the source read back, hand written forms read and taken off exactly: center, flushright,
{\\centering ...\\par}), a selection of three paragraphs in one environment, a paragraph split out
of a centred group and joined back, a figure by \\centering, and the page drawing the alignment.
Line and Paragraph Spacing: 1.0, 1.15, 1.5, 2.0 for a paragraph (setspace's environments, setspace
loaded once) and the whole document, the page's line height following. Increase and Decrease
Indent (adjustwidth, changepage). Space before and after. Keep with next, keep lines together,
page break before, widow and orphan control. Shading and Borders (tcolorbox, rules, Horizontal
Line). Show marks (Ctrl+Shift+8): drawn, nothing written. The Paragraph dialog: its tabs, its
fields, OK as one step. Layout's paragraph fields; Design's Paragraph Spacing. Agents find every
control by its name. Where dist/tex holds a TeX tree: everything written compiles in the page,
and TeX's PDF puts the words where the page does (pdftotext's boxes)."""
import os, re, sys, base64, tempfile, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import open_page, load_doc, src, click_text, select_text, check, results, roundtrip, pressed, ROOT
from playwright.sync_api import sync_playwright

DIST = os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist')
CM = 72.27 / 2.54
def D(body, pre='', cls='\\documentclass{article}'):
    return cls + '\n' + pre + '\\begin{document}\n' + body + '\n\\end{document}\n'
PLAIN = D('First paragraph here with words.\n\nSecond paragraph of the text.\n\nThird one.')
def ENV(name, arg=''):
    return D('First paragraph here with words.\n\n\\begin{' + name + '}' + arg + '\nSecond paragraph of the text.\n\\end{' + name + '}\n\nThird one.')
PKG = lambda p: '\\usepackage{' + p + '}\n'

def cmd(page, cid, args=None):
    return page.evaluate('([c, a]) => window.rikuy.runCommand(c, a === null ? undefined : a)', [cid, args])

def item_of(page, word):
    return page.evaluate('''(w) => { const el = [...document.querySelectorAll('#pages .it')].find((x) => x.textContent.includes(w)); if (!el) return null; const s = getComputedStyle(el);
      return { cls: el.className, align: s.textAlign, lh: parseFloat(s.lineHeight), ml: parseFloat(s.marginLeft), bg: s.backgroundColor, ti: s.textIndent, pl: parseFloat(s.paddingLeft) }; }''', word)

def menu_names(page):
    return page.get_by_role('menu').get_by_role('menuitemradio').all_inner_texts() + page.get_by_role('menu').get_by_role('menuitem').all_inner_texts()


def alignment(page):
    for cid, env, key in (('align-center', 'center', 'Control+e'), ('align-right', 'flushright', 'Control+r'), ('align-left', 'flushleft', 'Control+l')):
        forms = [ENV(env).replace('\\begin{' + env + '}\nSecond', '  \\begin{' + env + '}\n  Second')] if env != 'center' else [D('First paragraph here with words.\n\n{\\centering Second paragraph of the text.\\par}\n\nThird one.')]
        # (the hand written group form comes off as the group: its own bytes back are the plain paragraph)
        roundtrip(page, PLAIN, ('Second', 3), cid, ENV(env), forms=[f for f in forms if '\\centering' in f], label=cid)
        load_doc(page, PLAIN); click_text(page, 'Second', 3)
        page.keyboard.press(key); page.wait_for_timeout(250)
        check(key + ' on the page writes the ' + env + ' environment', src(page) == ENV(env), src(page)[40:200])
        it = item_of(page, 'Second paragraph')
        check('and the page draws it ' + env, it and it['align'] == {'center': 'center', 'flushright': 'right', 'flushleft': 'left'}[env], it)
        page.keyboard.press('Control+j'); page.wait_for_timeout(250)
        check('Ctrl+J gives the bytes back: justified is LaTeX\'s own', src(page) == PLAIN)
    # a hand written flushright, indented, comes off exactly
    hw = D('First paragraph here with words.\n\n  \\begin{flushright}\n  Second paragraph of the text.\n  \\end{flushright}\n\nThird one.')
    load_doc(page, hw); click_text(page, 'Second', 3)
    check('a hand written flushright shows Align Right pressed', pressed(page, 'align-right') is True and pressed(page, 'justify') is False)
    cmd(page, 'justify'); page.wait_for_timeout(200)
    check('Justify takes exactly it off, its indented line kept', src(page) == D('First paragraph here with words.\n\n  Second paragraph of the text.\n\nThird one.'), src(page)[40:200])
    # three paragraphs selected: one environment around them all
    load_doc(page, PLAIN)
    page.evaluate('''() => { const sp = [...document.querySelectorAll('#pages span.t')]; const a = sp.find((x) => x.textContent.includes('First')), z = sp.find((x) => x.textContent.includes('Third'));
      const r = document.createRange(); r.setStart(a.firstChild, 2); r.setEnd(z.firstChild, 3); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }''')
    page.wait_for_timeout(150)
    cmd(page, 'align-center'); page.wait_for_timeout(250)
    check('Center on three selected paragraphs: one center environment around them', src(page) == D('\\begin{center}\nFirst paragraph here with words.\n\nSecond paragraph of the text.\n\nThird one.\n\\end{center}'), src(page)[40:220])
    check('the selection stays on the same words', page.evaluate('getSelection().toString()').startswith('rst paragraph') and page.evaluate('getSelection().toString()').endswith('Thi'), page.evaluate('getSelection().toString()'))
    # one of them out of the group, and back: the bytes of before
    cen = src(page)
    click_text(page, 'Second', 2); cmd(page, 'align-right'); page.wait_for_timeout(250)
    check('Align Right on the middle one splits the group around it', '\\end{center}\n\n\\begin{flushright}\nSecond paragraph of the text.\n\\end{flushright}\n\n\\begin{center}\nThird' in src(page), src(page)[40:300])
    click_text(page, 'Second', 2); cmd(page, 'align-center'); page.wait_for_timeout(250)
    check('Center again joins the three: the bytes of before', src(page) == cen, src(page)[40:300])
    # a figure: \centering at its body's start
    fig = D('Text.\n\n\\begin{figure}[h]\n\\rule{2cm}{1cm}\n\\caption{A box}\n\\end{figure}')
    load_doc(page, fig)
    page.evaluate('''() => { const r = document.createRange(), el = document.querySelector('#pages .fp'); r.setStart(el, 0); r.collapse(true); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }''')
    page.wait_for_timeout(150)
    check('a figure without \\centering shows Align Left pressed, as TeX sets it', pressed(page, 'align-left') is True, [pressed(page, x) for x in ('align-left', 'align-center')])
    cmd(page, 'align-center'); page.wait_for_timeout(250)
    check('Center on a figure writes \\centering at its start', src(page) == fig.replace('[h]\n', '[h]\n\\centering\n'), src(page)[40:200])
    check('and the page centres its picture', page.evaluate('getComputedStyle(document.querySelector("#pages .fp")).textAlign') == 'center')
    page.evaluate('rikuy.undo()'); page.wait_for_timeout(150)
    check('one undo: the bytes back', src(page) == fig)
    # what cannot: a heading, a list item
    load_doc(page, D('\\section{Head}\nText.\n\n\\begin{itemize}\n\\item One\n\\end{itemize}'))
    click_text(page, 'Head', 1)
    check('a heading: Center disabled (its style\'s)', page.evaluate('rikuy.cmds.enabled(rikuy, "align-center", rikuy.ribbonAt())') is False)
    click_text(page, 'One', 1)
    check('a list item: Center disabled (the list\'s)', page.evaluate('rikuy.cmds.enabled(rikuy, "align-center", rikuy.ribbonAt())') is False)


def spacing(page):
    sp = lambda v: lambda pg: cmd(pg, 'line-spacing', v)
    roundtrip(page, PLAIN, ('Second', 3), sp('1.5'), ENV('onehalfspace').replace('\\begin{document}', PKG('setspace') + '\\begin{document}'),
              off=D('First paragraph here with words.\n\nSecond paragraph of the text.\n\nThird one.', PKG('setspace')), off_command=sp('1.0'), label='Line spacing 1.5 (onehalfspace)')
    load_doc(page, PLAIN); click_text(page, 'Second', 3)
    lh0 = item_of(page, 'Second')['lh']
    cmd(page, 'line-spacing', '2.0'); page.wait_for_timeout(250)
    check('2.0 writes doublespace and loads setspace once', src(page) == ENV('doublespace').replace('\\begin{document}', PKG('setspace') + '\\begin{document}'), src(page)[:200])
    lh = item_of(page, 'Second')['lh']
    check('the page spaces its lines as \\doublespacing does at 10pt (1.667 times)', abs(lh / lh0 - 1.667) < 0.02, (lh0, lh))
    cmd(page, 'line-spacing', '1.15'); page.wait_for_timeout(250)
    check('1.15 changes it to spacing{1.15}, setspace not loaded again', '\\begin{spacing}{1.15}\nSecond' in src(page) and src(page).count('{setspace}') == 1, src(page)[:220])
    # the menu: Word's values, the one in force checked, and the whole document's
    page.click('#rc-line-spacing'); page.wait_for_timeout(200)
    names = page.get_by_role('menu').get_by_role('menuitemradio').all_inner_texts()
    checked = page.get_by_role('menu').get_by_role('menuitemradio', name='1.15', exact=True).get_attribute('aria-checked')
    check('the menu lists 1.0 to 3.0 and the whole document\'s, 1.15 checked', names[:6] == ['1.0', '1.15', '1.5', '2.0', '2.5', '3.0'] and checked == 'true' and any('Whole document' in n for n in names), names)
    page.get_by_role('menu').get_by_role('menuitemradio', name='Whole document: 1.5', exact=True).click(); page.wait_for_timeout(250)
    check('Whole document: 1.5 writes \\onehalfspacing in the preamble', '\\usepackage{setspace}\n\\onehalfspacing\n\\begin{document}' in src(page), src(page)[:200])
    lh1 = item_of(page, 'First')['lh']
    check('and every paragraph of the page takes it', abs(lh1 / lh0 - 1.25) < 0.02, (lh0, lh1))
    # hand written: \linespread kept as written
    hw = D('Words.', '\\linespread{1.3}\n')
    load_doc(page, hw); click_text(page, 'Words', 2)
    cmd(page, 'line-spacing', {'v': '1.15', 'scope': 'document'}); page.wait_for_timeout(200)
    check('a hand written \\linespread{1.3} keeps its form: \\linespread{1.15}', src(page) == D('Words.', '\\linespread{1.15}\n'), src(page)[:120])
    cmd(page, 'line-spacing', {'v': '1.0', 'scope': 'document'}); page.wait_for_timeout(200)
    check('Whole document: 1.0 takes it off', src(page) == D('Words.'))
    # space before and after
    roundtrip(page, PLAIN, ('Second', 3), 'space-before', PLAIN.replace('\n\nSecond', '\n\n\\vspace{12pt}\nSecond'), label='Add Space Before Paragraph')
    roundtrip(page, PLAIN, ('Second', 3), 'space-after', PLAIN.replace('the text.\n', 'the text.\n\\vspace{12pt}\n'), label='Add Space After Paragraph')
    load_doc(page, PLAIN.replace('\n\nSecond', '\n\n\\vspace{12pt}\nSecond')); click_text(page, 'Second', 3)
    page.click('#rc-line-spacing'); page.wait_for_timeout(200)
    check('the menu says Remove Space Before Paragraph where there is some', page.get_by_role('menu').get_by_role('menuitem', name='Remove Space Before Paragraph', exact=True).count() == 1)
    page.keyboard.press('Escape')


def indents(page):
    # (Home's Increase and Decrease Indent are B3's: outside a list they run these two)
    aw = ENV('adjustwidth', '{1.27cm}{}').replace('\\begin{document}', PKG('changepage') + '\\begin{document}')
    roundtrip(page, PLAIN, ('Second', 3), 'paragraph-indent', aw, off=D('First paragraph here with words.\n\nSecond paragraph of the text.\n\nThird one.', PKG('changepage')), off_command='paragraph-outdent', label='Increase paragraph indent (adjustwidth)')
    load_doc(page, aw); click_text(page, 'Second', 3)
    it = item_of(page, 'Second')
    check('the page sets the paragraph 1.27 cm in', abs(it['ml'] / page.evaluate('rikuy.px') - 1.27 * CM) < 0.5, it)
    cmd(page, 'paragraph-indent'); page.wait_for_timeout(200)
    check('again: 2.54 cm, Word\'s next step', '\\begin{adjustwidth}{2.54cm}{}' in src(page), src(page)[:200])
    load_doc(page, PLAIN); click_text(page, 'Second', 3)
    check('Decrease paragraph indent is off where there is no indent', page.evaluate('rikuy.cmds.enabled(rikuy, "paragraph-outdent", rikuy.ribbonAt())') is False)
    # memoir has adjustwidth itself: no changepage
    load_doc(page, PLAIN.replace('{article}', '{memoir}')); click_text(page, 'Second', 3)
    cmd(page, 'paragraph-indent'); page.wait_for_timeout(200)
    check('in memoir no changepage is loaded', '\\begin{adjustwidth}{1.27cm}{}' in src(page) and 'changepage' not in src(page), src(page)[:200])


def flags(page):
    roundtrip(page, PLAIN, ('Second', 3), 'keep-with-next', PLAIN.replace('the text.\n', 'the text.\n\\nopagebreak\n'), label='Keep with next')
    roundtrip(page, PLAIN, ('Second', 3), 'page-break-before', PLAIN.replace('\n\nSecond', '\n\n\\clearpage\nSecond'), label='Page break before')
    roundtrip(page, PLAIN, ('Second', 3), 'keep-lines-together', ENV('samepage'), label='Keep lines together')
    load_doc(page, PLAIN.replace('\n\nSecond', '\n\n\\clearpage\nSecond')); click_text(page, 'Second', 3)
    check('a page break before is drawn: the paragraph on page 2', page.evaluate('[...document.querySelectorAll("#pages > .page")].length') == 2)
    w = D('First paragraph here with words.\n\nSecond paragraph of the text.\n\nThird one.', '\\widowpenalty=10000\n\\clubpenalty=10000\n')
    roundtrip(page, PLAIN, ('Second', 3), 'widow-control', w, label='Widow/Orphan control')
    load_doc(page, PLAIN); click_text(page, 'Second', 3)
    check('Suppress line numbers waits for line numbers; Don\'t hyphenate for babel', page.evaluate('rikuy.cmds.enabled(rikuy, "suppress-line-numbers", rikuy.ribbonAt())') is False and page.evaluate('rikuy.cmds.enabled(rikuy, "dont-hyphenate", rikuy.ribbonAt())') is False)
    bb = D('First paragraph here with words.\n\nSecond paragraph of the text.\n\nThird one.', '\\usepackage[english]{babel}\n')
    roundtrip(page, bb, ('Second', 3), 'dont-hyphenate', bb.replace('\n\nSecond paragraph of the text.\n', '\n\n\\begin{hyphenrules}{nohyphenation}\nSecond paragraph of the text.\n\\end{hyphenrules}\n'), label='Don\'t hyphenate')
    load_doc(page, bb.replace('\n\nSecond paragraph of the text.\n', '\n\n\\begin{hyphenrules}{nohyphenation}\nSecond paragraph of the text.\n\\end{hyphenrules}\n'))
    check('the page does not hyphenate it', 'nohy' in item_of(page, 'Second')['cls'])


def boxes(page):
    sh = ENV('tcolorbox', '[colback=yellow!20,colframe=yellow!20,boxrule=0pt,sharp corners]').replace('\\begin{document}', PKG('tcolorbox') + '\\begin{document}')
    roundtrip(page, PLAIN, ('Second', 3), 'shading', sh, off=D('First paragraph here with words.\n\nSecond paragraph of the text.\n\nThird one.', PKG('tcolorbox')),
              off_command=lambda pg: cmd(pg, 'shading', {'color': None}), label='Shading')
    load_doc(page, sh); click_text(page, 'Second', 3)
    it = item_of(page, 'Second')
    check('the page draws the paragraph on its colour, its text 5 mm in as tcolorbox sets it', it['bg'] not in ('rgba(0, 0, 0, 0)', 'transparent') and abs(it['pl'] / page.evaluate('rikuy.px') - 14.23) < 0.5, it)
    # Word's standard colours are dvipsnames: xcolor gets the option, before tcolorbox loads it
    load_doc(page, PLAIN); click_text(page, 'Second', 3)
    cmd(page, 'shading', {'color': 'Orange'}); page.wait_for_timeout(250)
    check('Orange (a dvipsnames colour): \\usepackage[dvipsnames]{xcolor} before tcolorbox', '\\usepackage[dvipsnames]{xcolor}\n\\usepackage{tcolorbox}\n' in src(page) and 'colback=Orange' in src(page), src(page)[:240])
    # borders
    roundtrip(page, PLAIN, ('Second', 3), 'borders', PLAIN.replace('the text.\n', 'the text.\n\\par\\noindent\\rule{\\linewidth}{0.4pt}\n'), label='Borders (Bottom Border)')
    load_doc(page, PLAIN); click_text(page, 'Second', 3)
    cmd(page, 'borders', {'kind': 'box'}); page.wait_for_timeout(250)
    check('Outside Borders: a framed tcolorbox', '\\begin{tcolorbox}[colback=white,colframe=black,boxrule=0.4pt,sharp corners]\nSecond' in src(page), src(page)[:260])
    cmd(page, 'borders', {'kind': 'none'}); page.wait_for_timeout(250)
    check('No Border takes the box off again (the package line stays)', src(page) == D('First paragraph here with words.\n\nSecond paragraph of the text.\n\nThird one.', PKG('tcolorbox')), src(page)[:200])
    load_doc(page, PLAIN); click_text(page, 'Second', 3)
    cmd(page, 'horizontal-line'); page.wait_for_timeout(250)
    check('Horizontal Line: a rule as a paragraph of its own after this one', src(page) == PLAIN.replace('the text.\n', 'the text.\n\n\\noindent\\rule{\\linewidth}{0.4pt}\n'), src(page)[40:240])
    check('drawn on the page', page.evaluate('!!document.querySelector("#pages .a-rule, #pages .atom.a-rule")'))


def marks(page):
    load_doc(page, D('A paragraph.\n\nLine one\\\\ line two.\n\nDots\\dotfill 5\n\n\\vspace{12pt}\nAfter.')); click_text(page, 'A para', 2)
    before = src(page)
    page.keyboard.press('Control+Shift+8'); page.wait_for_timeout(200)
    on = page.evaluate('document.body.classList.contains("marks-on")')
    pil = page.evaluate('getComputedStyle(document.querySelector("#pages .it.p"), "::after").content')
    br = page.evaluate('getComputedStyle(document.querySelector("#pages .a-br"), "::before").content')
    check('Ctrl+Shift+8 shows the marks: ¶ at each paragraph\'s end, ↵ at a line break', on and '¶' in pil and '↵' in br, (on, pil, br))
    check('Show marks is pressed, and nothing is written', pressed(page, 'show-marks') is True and src(page) == before)
    check('the leader of \\dotfill is drawn as dots', 'dots' in page.evaluate('document.querySelector("#pages .a-sp").className'))
    page.keyboard.press('Control+Shift+8'); page.wait_for_timeout(150)
    check('and again hides them', not page.evaluate('document.body.classList.contains("marks-on")'))


def dialog(page):
    load_doc(page, PLAIN); click_text(page, 'Second', 3)
    cmd(page, 'paragraph-settings'); page.wait_for_timeout(300)
    dlg = page.get_by_role('dialog', name='Paragraph')
    check('the Paragraph dialog opens, named Paragraph, with Word\'s two tabs', dlg.count() == 1 and dlg.get_by_role('tab', name='Indents and Spacing').count() == 1 and dlg.get_by_role('tab', name='Line and Page Breaks').count() == 1)
    vis = page.evaluate('(() => { const r = document.querySelector(".pop-pd").getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth; })()')
    check('it stands inside the window', vis)
    dlg.get_by_role('combobox', name='Alignment').select_option('center')
    dlg.get_by_label('Before (pt)').fill('6')
    dlg.get_by_role('combobox', name='Line spacing', exact=True).select_option('onehalf')
    dlg.get_by_role('tab', name='Line and Page Breaks').click()
    dlg.get_by_label('Keep with next').check()
    h0 = page.evaluate('rikuy.hist.length')
    dlg.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    s = src(page)
    check('OK writes each change, one step of history', page.evaluate('rikuy.hist.length') == h0 + 1 and s == D('First paragraph here with words.\n\n\\vspace{6pt}\n\\begin{onehalfspace}\n\\begin{center}\nSecond paragraph of the text.\n\\end{center}\n\\end{onehalfspace}\n\\nopagebreak\n\nThird one.', PKG('setspace')), s[:400])
    page.evaluate('rikuy.undo()'); page.wait_for_timeout(200)
    check('one undo gives the bytes back', src(page) == PLAIN)
    # read back
    load_doc(page, D('A.\n\n\\vspace{6pt}\n\\begin{flushright}\n\\noindent\\hangindent=1.5cm Second paragraph of the text.\n\\end{flushright}\n\nB.')); click_text(page, 'Second', 3)
    cmd(page, 'paragraph-settings'); page.wait_for_timeout(300)
    dlg = page.get_by_role('dialog', name='Paragraph')
    vals = page.evaluate('["pd-align", "pd-special", "pd-by", "pd-before"].map((id) => document.getElementById(id).value)')
    check('the dialog shows what the source has: Right, Hanging by 1.5 cm, 6 pt before', vals == ['right', 'hanging', '1.5', '6'], vals)
    page.keyboard.press('Escape'); page.wait_for_timeout(100)
    check('Escape closes it, nothing written', page.get_by_role('dialog', name='Paragraph').count() == 0)
    # the right click menu has Paragraph…
    load_doc(page, PLAIN); click_text(page, 'Second', 3)
    page.evaluate('rikuy.runCommand("context-menu")'); page.wait_for_timeout(200)
    check('the right click menu offers Paragraph Settings', page.get_by_role('menu').get_by_role('menuitem', name='Paragraph Settings').count() == 1)
    page.keyboard.press('Escape')


def layout_and_design(page):
    load_doc(page, PLAIN); click_text(page, 'Second', 3)
    page.get_by_role('tablist', name='Ribbon').get_by_role('tab', name='Layout', exact=True).click(); page.wait_for_timeout(200)
    click_text(page, 'Second', 3); page.wait_for_timeout(200)
    f = page.get_by_role('spinbutton', name='Indent Left', exact=True)
    check('Layout › Paragraph has its four fields', all(page.get_by_role('spinbutton', name=n, exact=True).count() == 1 for n in ('Indent Left', 'Indent Right', 'Spacing Before', 'Spacing After')))
    f.fill('1.5'); f.press('Enter'); page.wait_for_timeout(300)
    check('Indent Left 1.5 writes adjustwidth{1.5cm}{}', '\\begin{adjustwidth}{1.5cm}{}\nSecond' in src(page), src(page)[:200])
    click_text(page, 'Second', 3); page.wait_for_timeout(200)
    check('and the field shows it back', page.evaluate('document.getElementById("rl-indent-left").value') == '1.5')
    sb = page.get_by_role('spinbutton', name='Spacing After', exact=True)
    sb.fill('6'); sb.press('Enter'); page.wait_for_timeout(300)
    check('Spacing After 6 writes \\vspace{6pt} after it', '\\vspace{6pt}' in src(page), src(page)[100:300])
    page.get_by_role('tablist', name='Ribbon').get_by_role('tab', name='Design', exact=True).click(); page.wait_for_timeout(200)
    load_doc(page, PLAIN); click_text(page, 'Second', 3)
    page.click('#rc-paragraph-spacing'); page.wait_for_timeout(200)
    items = page.get_by_role('menu').get_by_role('menuitemradio').all_inner_texts()
    check('Design › Paragraph Spacing lists Word\'s sets', items == ['No Paragraph Space', 'Compact', 'Tight', 'Open', 'Relaxed', 'Double'], items)
    page.get_by_role('menu').get_by_role('menuitemradio', name='Relaxed').click(); page.wait_for_timeout(300)
    check('Relaxed: parskip with 6 pt and \\onehalfspacing', src(page) == D('First paragraph here with words.\n\nSecond paragraph of the text.\n\nThird one.', '\\usepackage[skip=6pt]{parskip}\n\\usepackage{setspace}\n\\onehalfspacing\n'), src(page)[:220])
    check('the page leaves 6 pt between the paragraphs', abs(page.evaluate('rikuy.model.opts.parskip') * 10 - 6) < 0.01)
    page.click('#rc-paragraph-spacing'); page.wait_for_timeout(200)
    page.get_by_role('menu').get_by_role('menuitemradio', name='No Paragraph Space').click(); page.wait_for_timeout(300)
    check('No Paragraph Space takes both off (setspace\'s line stays)', src(page) == D('First paragraph here with words.\n\nSecond paragraph of the text.\n\nThird one.', '\\usepackage{setspace}\n'), src(page)[:200])
    page.get_by_role('tablist', name='Ribbon').get_by_role('tab', name='Home', exact=True).click(); page.wait_for_timeout(150)


def agents(page):
    load_doc(page, PLAIN); click_text(page, 'Second', 3)
    names = ['Show marks', 'Align Left', 'Center', 'Align Right', 'Justify', 'Line and Paragraph Spacing', 'Shading', 'Borders', 'Paragraph Settings']
    tb = page.get_by_role('tabpanel', name='Home')
    got = {n: tb.get_by_role('button', name=n, exact=True).count() for n in names}
    check('Home › Paragraph has Word\'s controls by their names', all(v == 1 for v in got.values()), got)
    box = page.get_by_role('combobox', name='Search', exact=True)
    box.click(); box.fill('double spacing'); page.wait_for_timeout(150)
    found = page.get_by_role('listbox', name='Commands', exact=True).get_by_role('option').all_inner_texts()
    page.keyboard.press('Escape'); page.keyboard.press('Escape')
    check('the search box finds Line and Paragraph Spacing by "double spacing"', found and found[0].startswith('Line and Paragraph Spacing'), found[:3])
    click_text(page, 'Second', 3)
    check('Ctrl+M is still Formula, not an indent', page.evaluate('rikuy.cmds.commands().filter((c) => (c.keys || []).includes("Ctrl+M")).map((c) => c.id)') == ['formula'])


def compile_doc(page, text):
    page.set_default_timeout(600000)
    r = page.evaluate('''async (t) => { await window.rikuy.api.setSource(t); const r = await window.rikuy.api.compile(); let s = ''; if (r.pdf) for (let i = 0; i < r.pdf.length; i += 8192) s += String.fromCharCode(...r.pdf.subarray(i, i + 8192));
      return { ok: r.ok, pages: r.pages, b64: r.pdf ? btoa(s) : '', log: (r.log || '').slice(-1500) }; }''', text)
    page.set_default_timeout(30000)
    out = {'ok': r['ok'], 'pages': r['pages'], 'words': [], 'log': r['log']}
    if not r['b64']: return out
    f = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False); f.write(base64.b64decode(r['b64'])); f.close()
    bb = subprocess.run(['pdftotext', '-bbox', f.name, '-'], capture_output=True, text=True).stdout
    for pg in bb.split('<page ')[1:]:
        out['words'].append([(float(m[0]), float(m[1]), float(m[2]), float(m[3]), m[4]) for m in re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>', pg)])
    os.unlink(f.name)
    return out

def page_x(page, word):
    """Where the page draws a word: its left edge from the text block's, in pt"""
    return page.evaluate('''(w) => { const px = window.rikuy.px, sp = [...document.querySelectorAll('#pages span.t')].find((s) => s.textContent.includes(w)); if (!sp) return null;
      const r = document.createRange(), i = sp.textContent.indexOf(w); r.setStart(sp.firstChild, i); r.setEnd(sp.firstChild, i + w.length); const b = r.getBoundingClientRect(), pb = sp.closest('.pb, .flow').getBoundingClientRect();
      return { l: (b.left - pb.left) / px, r: (b.right - pb.left) / px, w: pb.width / px }; }''', word)

def compile_pdf(page):
    if not os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        print('SKIP the PDF of the paragraphs: no TeX tree in %s' % DIST)
        return
    BP = 72 / 72.27
    text = D('\\noindent Leftmost words here.\n\n\\begin{center}\nCentredword alone.\n\\end{center}\n\n\\begin{flushright}\nRightword alone.\n\\end{flushright}\n\n'
             '\\begin{adjustwidth}{2cm}{}\nAdjustedword starts here.\n\\end{adjustwidth}\n\n\\begin{tcolorbox}[colback=yellow!20,colframe=yellow!20,boxrule=0pt,sharp corners]\nShadedword in a box.\n\\end{tcolorbox}\n\n'
             '\\noindent\\hangindent=1cm ' + ' '.join(['Hanging'] + ['words of a long paragraph'] * 8) + '\n\\nopagebreak\n\n\\begin{onehalfspace}\n' + ' '.join(['Spaced lines of a paragraph that runs on.'] * 6) + '\n\\end{onehalfspace}\n\n'
             '\\begin{samepage}\nKept.\n\\end{samepage}\n\n\\begin{hyphenrules}{nohyphenation}\nUnhyphenated.\n\\end{hyphenrules}\n\nDots\\dotfill 5\n\n\\vspace{12pt}\nSpaced after.',
             '\\usepackage[english]{babel}\n\\usepackage{setspace}\n\\usepackage{changepage}\n\\usepackage{tcolorbox}\n\\widowpenalty=10000\n\\clubpenalty=10000\n')
    c = compile_doc(page, text)
    check('everything Rikuy writes for paragraphs compiles in the page (pdfLaTeX)', c['ok'] and c['words'], c['log'][-400:])
    if not c['ok'] or not c['words']: return
    W = [w for pg in c['words'] for w in pg]
    x = lambda word: next((w for w in W if w[4].startswith(word)), None)
    left = x('Leftmost')[0]
    def px_of(word):
        p = page_x(page, word)
        return (p['l'] * BP + left, p['r'] * BP + left) if p else None
    for word, what in (('Centredword', 'centred'), ('Rightword', 'at the right'), ('Adjustedword', '2 cm in'), ('Shadedword', '5 mm into its box'), ('Dots', 'the leader\'s first word')):
        t, p = x(word), px_of(word)
        check('TeX sets "%s" %s, where the page draws it (within 2 bp)' % (word, what), t and p and abs(t[0] - p[0]) < 2, (t, p))
    r5 = [w for w in W if w[4] == '5']
    rw = x('Rightword'); margin = max(w[2] for w in W if abs(w[1] - rw[1]) < 1)
    check('\\dotfill sends 5 to the right margin in TeX\'s PDF', r5 and abs(r5[-1][2] - margin) < 1.5, (r5[-1:] if r5 else None, margin))
    # the hanging paragraph's lines: the first at the margin, the others 1 cm in, in TeX's PDF and on the page
    h0 = x('Hanging'); sp0 = x('Spaced')
    lines = {}
    for w in W:
        if h0[1] - 1 <= w[1] < sp0[1] - 1: lines.setdefault(round(w[1]), []).append(w[0])
    starts = [round(min(v) - left, 1) for k, v in sorted(lines.items())]
    check('the hanging indent: the first line at the margin, the next ones 1 cm in, in TeX\'s PDF', len(starts) > 1 and abs(starts[0]) < 1 and all(abs(x0 - CM * BP) < 1 for x0 in starts[1:]), starts)
    hp = page.evaluate('''() => { const el = [...document.querySelectorAll('#pages .it.p')].find((x) => x.textContent.startsWith('Hanging')); const s = getComputedStyle(el); return [parseFloat(s.paddingLeft) / window.rikuy.px, parseFloat(s.textIndent) / window.rikuy.px]; }''')
    check('and the page hangs it the same: lines after the first 1 cm in, the first at the margin', abs(hp[0] - CM) < 0.3 and abs(hp[0] + hp[1]) < 0.3, hp)
    sp = sorted({round(w[1], 1) for w in W if w[4] == 'Spaced'})
    gap = sp[1] - sp[0] if len(sp) > 1 else 0
    check('onehalfspace\'s lines 15 pt apart in TeX\'s PDF (1.25 times 12 pt), as the page spaces them', abs(gap - 15 * BP) < 0.6, sp[:4])



def select_words(page, a, b):
    """A selection from the start of word a to the end of word b on the page"""
    page.evaluate('''([a, b]) => { const sp = [...document.querySelectorAll('#pages span.t')]; const x = sp.find((s) => s.textContent.includes(a)), z = sp.find((s) => s.textContent.includes(b));
      const r = document.createRange(); r.setStart(x.firstChild, x.textContent.indexOf(a)); r.setEnd(z.firstChild, z.textContent.indexOf(b) + b.length);
      document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }''', [a, b])
    page.wait_for_timeout(150)

def balanced(t):
    st = []
    for m in re.finditer(r'\\(begin|end)\{([^}]+)\}', t):
        if m.group(1) == 'begin': st.append(m.group(2))
        elif not st or st.pop() != m.group(2): return False
    return not st

def tex_ok(page, text, label):
    """Where dist/tex has a tree: the text compiles in the page; its words and TeX's boxes"""
    if not os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')): return None
    c = compile_doc(page, text)
    check(label + ': compiles in the page (pdfLaTeX)', c['ok'] and c['words'], c['log'][-300:])
    return c if c['ok'] and c['words'] else None

# a line from margin to margin in a test's text: TeX's text block measured by it
EDGES = '\\noindent Leftedge\\hfill Rightedge\n\n'
def centred_in_pdf(c, word):
    """Whether TeX's PDF centres the line of the word: the line's middle at the text block's, which
    EDGES marks (within 3 bp)"""
    W = [w for pg in c['words'][:1] for w in pg]
    t = next((w for w in W if w[4].startswith(word)), None)
    l, r = next((w for w in W if w[4] == 'Leftedge'), None), next((w for w in W if w[4] == 'Rightedge'), None)
    if not t or not l or not r: return None
    line = [w for w in W if abs(w[1] - t[1]) < 1]
    return abs((min(w[0] for w in line) + max(w[2] for w in line)) / 2 - (l[0] + r[2]) / 2) < 3

def caret_at(page, sel):
    page.evaluate('''(sel) => { const r = document.createRange(), el = document.querySelector(sel); r.setStart(el, 0); r.collapse(true); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }''', sel)
    page.wait_for_timeout(150)


def reviewed(page):
    """The hostile review of b265b6f, each case as the reviewer gave it (b1 to b8 and t2 to t17 of
    the review), compiled where TeX refused what was written or set it elsewhere than the page drew it"""
    # b1: two paragraphs of a centred group and one after it selected, Align Right: every environment closed
    s = D('\\begin{center}\nAlpha words.\n\nBeta words.\n\\end{center}\n\nGamma words.\n\nDelta words.')
    load_doc(page, s); select_words(page, 'Beta', 'Gamma')
    cmd(page, 'align-right'); page.wait_for_timeout(250)
    t = src(page)
    check('review 1: Align Right over the end of a centred group and the paragraph after it: one flushright, every environment closed', t == D('\\begin{center}\nAlpha words.\n\\end{center}\n\n\\begin{flushright}\nBeta words.\n\nGamma words.\n\\end{flushright}\n\nDelta words.'), t[40:300])
    check('and the page draws Beta and Gamma at the right, Alpha centred', [(item_of(page, w) or {}).get('align') for w in ('Alpha', 'Beta', 'Gamma')] == ['center', 'right', 'right'])
    select_words(page, 'Alpha', 'Beta'); cmd(page, 'justify'); page.wait_for_timeout(250)
    check('Justify over the first two: the environments fit around what is left', src(page) == D('Alpha words.\n\nBeta words.\n\n\\begin{flushright}\nGamma words.\n\\end{flushright}\n\nDelta words.'), src(page)[40:300])
    tex_ok(page, t, 'review 1')
    # b2: the dialog over two paragraphs (a centred one and a plain one): Space Before for both, at their places
    s = D('\\begin{center}\nBravo words here.\n\\end{center}\n\nSpace words here.\n\nAfter.')
    load_doc(page, s); select_words(page, 'Bravo', 'Space')
    cmd(page, 'paragraph-settings'); page.wait_for_timeout(300)
    dlg = page.get_by_role('dialog', name='Paragraph')
    dlg.get_by_label('Before (pt)').fill('12')
    dlg.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    t = src(page)
    check('review 2: the dialog over two paragraphs writes each one\'s \\vspace before it, nothing inside a word', t == D('\\vspace{12pt}\n\\begin{center}\nBravo words here.\n\\end{center}\n\n\\vspace{12pt}\nSpace words here.\n\nAfter.'), t[40:300])
    tex_ok(page, t, 'review 2')
    # b5, b6: the caret after OK: the next key goes into the words, not into \begin{document}
    load_doc(page, D('Intro.\n\nTarget words here.\n\nAfter.')); click_text(page, 'Target', 3)
    cmd(page, 'paragraph-settings'); page.wait_for_timeout(300)
    dlg = page.get_by_role('dialog', name='Paragraph')
    dlg.get_by_role('combobox', name='Alignment').select_option('right')
    dlg.get_by_label('Before (pt)').fill('6')
    dlg.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    page.keyboard.type('Z'); page.wait_for_timeout(250)
    check('review 3: after OK the next key lands where the caret was, in "Target" (the caret mapped through every edit)', src(page) == D('Intro.\n\n\\vspace{6pt}\n\\begin{flushright}\nTarZget words here.\n\\end{flushright}\n\nAfter.'), src(page)[40:260])
    # t14: a commented out \end{center} before the paragraph: no join (joined, it compiled to an error)
    s = D('Intro.\n\n\\begin{center}\nX\n\\end{center}\n% \\end{center}\n\nC words here.\n\nAfter.')
    load_doc(page, s); click_text(page, 'C words', 2); cmd(page, 'align-center'); page.wait_for_timeout(250)
    t = src(page)
    check('review 4: Center beside a commented out \\end{center}: an environment of its own, the comment untouched', t == s.replace('C words here.', '\\begin{center}\nC words here.\n\\end{center}'), t[40:300])
    tex_ok(page, t, 'review 4')
    # t13: beside a LaTeX paragraph
    s = D('Intro.\n\n% rikuy: latex\n\\begin{center}\nRaw stuff\n\\end{center}\n\nC words here.\n\nAfter.')
    load_doc(page, s); click_text(page, 'C words', 2); cmd(page, 'align-center'); page.wait_for_timeout(250)
    check('review 5: Center beside a LaTeX paragraph\'s center: not joined into it', src(page) == s.replace('C words here.', '\\begin{center}\nC words here.\n\\end{center}'), src(page)[40:300])
    # b4: Tabs over a selection into \textbf{: the fill at the selection's end, nothing taken
    load_doc(page, D('Some \\textbf{bold} words here.')); select_words(page, 'Some', 'bold')
    cmd(page, 'tab-leader', 'dots'); page.wait_for_timeout(250)
    check('review 6: Tabs over a selection writes \\dotfill at its end and takes nothing away', src(page) == D('Some \\textbf{bold\\dotfill} words here.'), src(page)[40:200])
    # t17: { \centering ...} and {\centering<newline>...}
    for g, r in (('{ \\centering Words here.\\par}', '{ \\raggedleft Words here.\\par}'), ('{\\centering\nWords here.\\par}', '{\\raggedleft\nWords here.\\par}')):
        load_doc(page, D('Intro.\n\n' + g + '\n\nAfter.')); click_text(page, 'Words', 2)
        check('review 7: %s shows Center pressed' % g.replace('\n', ' (line break) '), pressed(page, 'align-center') is True)
        cmd(page, 'align-right'); page.wait_for_timeout(200)
        check('and Align Right changes its declaration in place', src(page) == D('Intro.\n\n' + r + '\n\nAfter.'), src(page)[40:200])
        tex_ok(page, src(page), 'review 7')
        click_text(page, 'Words', 2); cmd(page, 'justify'); page.wait_for_timeout(200)
        check('and Justify takes the group off', src(page) == D('Intro.\n\nWords here.\n\nAfter.'), src(page)[40:200])
    # t7, q.tex: a quote's paragraph centred: inside the quote, where TeX centres it; written outside, not centred
    s = D(EDGES + 'Intro words.\n\n\\begin{quote}\nQuoted words.\n\\end{quote}\n\nAfter.')
    load_doc(page, s); click_text(page, 'Quoted', 2); cmd(page, 'align-center'); page.wait_for_timeout(250)
    t = src(page)
    check('review 8: Center in a quote writes center inside the quote', t == s.replace('Quoted words.', '\\begin{center}\nQuoted words.\n\\end{center}'), t[40:300])
    out = D(EDGES + 'Intro words.\n\n\\begin{center}\n\\begin{quote}\nOutside words.\n\\end{quote}\n\\end{center}\n\nAfter.')
    load_doc(page, out); click_text(page, 'Outside', 2)
    check('and a center written around a quote: the page draws the words flush, as TeX sets them, and the ribbon says Justify', (item_of(page, 'Outside') or {}).get('align') != 'center' and pressed(page, 'justify') is True, (item_of(page, 'Outside'), pressed(page, 'justify')))
    c = tex_ok(page, t, 'review 8, center inside the quote')
    if c: check('TeX centres the quote\'s words when center is inside it', centred_in_pdf(c, 'Quoted') is True)
    c = tex_ok(page, out, 'review 8, center around the quote')
    if c: check('and does not centre them when center is around it, as the page draws them', centred_in_pdf(c, 'Outside') is False)
    # t12: a figure in amsart without \centering: TeX centres it, so does the page
    # (words, not a rule, in it: pdftotext's boxes are words)
    am = D(EDGES + 'Text.\n\n\\begin{figure}[h]\nFigword in a figure\n\\caption{c}\n\\end{figure}', '', '\\documentclass{amsart}')
    load_doc(page, am)
    fa = page.evaluate('''() => { const el = [...document.querySelectorAll('#pages .fp *')].filter((x) => x.textContent.includes('Figword')).pop(); let e = el; while (e && getComputedStyle(e).display === 'inline') e = e.parentElement; return e ? getComputedStyle(e).textAlign : null; }''')
    check('review 9: a figure in amsart without \\centering is drawn centred, as the class sets it', fa == 'center', fa)
    caret_at(page, '#pages .fp')
    check('and the ribbon shows Center pressed', pressed(page, 'align-center') is True)
    c = tex_ok(page, am, 'review 9')
    if c: check('and TeX\'s PDF centres it', centred_in_pdf(c, 'Figword') is True)
    # b4: Shading's More colors: an HTML colour stays a shading, compiles, drawn
    load_doc(page, D('Intro.\n\nShade words here.\n\nAfter.')); click_text(page, 'Shade', 2)
    cmd(page, 'shading', {'color': 'rgb,255:red,231;green,84;blue,128'}); page.wait_for_timeout(300)
    t = src(page)
    check('review 12: More colors\' E75480 as shading: colback={rgb,255:red,231;green,84;blue,128}, tcolorbox loaded', 'colback={rgb,255:red,231;green,84;blue,128}' in t and '\\usepackage{tcolorbox}' in t, t[:400])
    check('and the page draws it on that colour', (item_of(page, 'Shade words') or {}).get('bg') == 'rgb(231, 84, 128)', item_of(page, 'Shade words'))
    tex_ok(page, t, 'review 12')
    # b4: {\centering ...} without \par: not centred by TeX, nor by the page
    g = D(EDGES + 'Intro words here.\n\n{\\centering Grouped words.}\n\nAfter.')
    load_doc(page, g); click_text(page, 'Grouped', 2)
    check('review 13: {\\centering ...} without \\par: drawn justified, Justify pressed', pressed(page, 'justify') is True and (item_of(page, 'Grouped') or {}).get('align') != 'center')
    c = tex_ok(page, g, 'review 13')
    if c: check('and TeX does not centre it', centred_in_pdf(c, 'Grouped') is False)
    # t2: a paragraph with display math centred whole
    m = D(EDGES + 'Before.\n\nMath starts\n\\[ x^2 + y^2 \\]\nand continues.\n\nAfter.')
    load_doc(page, m); click_text(page, 'continues', 2); cmd(page, 'align-center'); page.wait_for_timeout(250)
    t = src(page)
    check('review 17: Center in a paragraph with display math centres the whole paragraph', t == D(EDGES + 'Before.\n\n\\begin{center}\nMath starts\n\\[ x^2 + y^2 \\]\nand continues.\n\\end{center}\n\nAfter.'), t[40:300])
    check('and the page draws its words before and after the formula centred', [(item_of(page, w) or {}).get('align') for w in ('Math starts', 'continues')] == ['center', 'center'])
    c = tex_ok(page, t, 'review 17')
    if c: check('as TeX\'s PDF sets them', centred_in_pdf(c, 'Math') is True and centred_in_pdf(c, 'and') is True)
    # b2: the dialog in a figure: Centered shown for \centering, Right sets \raggedleft, the widows box in the same step
    fig = D('Text.\n\n\\begin{figure}[h]\n\\centering\n\\rule{2cm}{1cm}\n\\caption{A box}\n\\end{figure}')
    load_doc(page, fig); caret_at(page, '#pages .fp')
    cmd(page, 'paragraph-settings'); page.wait_for_timeout(300)
    dlg = page.get_by_role('dialog', name='Paragraph')
    check('review 11: the dialog in a figure with \\centering shows Centered', page.evaluate('document.getElementById("pd-align").value') == 'center')
    dlg.get_by_role('combobox', name='Alignment').select_option('right')
    dlg.get_by_role('tab', name='Line and Page Breaks').click(); dlg.get_by_label('Widow/Orphan control').check()
    h0 = page.evaluate('rikuy.hist.length')
    dlg.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    t = src(page)
    check('and Right writes \\raggedleft in its place, the widows set in the same step', '\\begin{figure}[h]\n\\raggedleft\n\\rule' in t and '\\widowpenalty=10000' in t and page.evaluate('rikuy.hist.length') == h0 + 1, t[:300])


def open_phone(p, width, height, dark=False):
    """The page on a phone: a touch screen (taps, no hover, no right click), Chromium's mobile viewport"""
    import browser as B
    br = p.chromium.launch(args=[a for a in os.environ.get('CHROME_ARGS', '').split() if a])
    ctx = br.new_context(viewport={'width': width, 'height': height}, color_scheme='dark' if dark else 'light', device_scale_factor=2, has_touch=True, is_mobile=True)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
    html = open(os.path.join(DIST, 'rikuy.html'), encoding='utf8').read()
    doc = B.SKELETON_HEAD + html + '</body></html>'
    def handler(route):
        url = route.request.url
        if url.startswith('https://rikuy.test/'):
            path = url[len('https://rikuy.test/'):].split('?')[0]
            f = os.path.join(DIST, path)
            if path and os.path.isfile(f):
                ct = 'text/javascript' if path.endswith(('.js', '.mjs')) else 'application/wasm' if path.endswith('.wasm') else 'application/octet-stream'
                return route.fulfill(status=200, content_type=ct, body=open(f, 'rb').read())
            return route.fulfill(status=200, content_type='text/html; charset=utf-8', body=doc)
        if url in B.ROUTES:
            return route.fulfill(status=200, content_type='application/javascript', headers={'Access-Control-Allow-Origin': '*'}, body=open(B.ROUTES[url], 'rb').read())
        return route.abort()
    ctx.route('**/*', handler)
    page.goto('https://rikuy.test/')
    page.evaluate('localStorage.clear()'); page.reload()
    page.wait_for_function('window.rikuy && document.getElementById("boot").hidden', timeout=60000)
    return br, page, errors

def tap_word(page, word, off=2):
    """A finger on the page at a word: the caret goes there"""
    b = page.evaluate('''([w, off]) => { const s = [...document.querySelectorAll('#pages span.t')].find((x) => x.textContent.includes(w)); if (!s) return null; s.scrollIntoView({ block: 'center' });
      const r = document.createRange(), i = s.textContent.indexOf(w) + off; r.setStart(s.firstChild, i); r.setEnd(s.firstChild, i + 1); const b = r.getBoundingClientRect(); return [b.left + 1, b.top + b.height / 2]; }''', [word, off])
    page.wait_for_timeout(150)
    page.touchscreen.tap(b[0], b[1]); page.wait_for_timeout(250)

def sideways(page):
    return page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')

def phone(p):
    """On a phone (390 x 844 and 360 x 740, touch): alignment, line spacing and Show marks by a tap,
    no key needed; the Paragraph dialog fits the screen and scrolls; 44 px targets; the page never
    scrolls sideways; screenshots at 390 px, light and dark"""
    for w, h in ((390, 844), (360, 740)):
        br, page, errors = open_phone(p, w, h)
        load_doc(page, PLAIN); page.wait_for_timeout(300)
        tap_word(page, 'Second', 3)
        page.locator('#rc-align-center').tap(); page.wait_for_timeout(300)
        check('%d px: a tap on Center writes the center environment, no key needed' % w, src(page) == ENV('center'), src(page)[40:200])
        check('%d px: and the page draws it centred' % w, (item_of(page, 'Second paragraph') or {}).get('align') == 'center')
        tap_word(page, 'Second', 3)
        page.locator('#rc-justify').tap(); page.wait_for_timeout(300)
        check('%d px: a tap on Justify gives the bytes back' % w, src(page) == PLAIN, src(page)[40:200])
        tap_word(page, 'Second', 3)
        page.locator('#rc-line-spacing').tap(); page.wait_for_timeout(300)
        menu = page.get_by_role('menu')
        fits = page.evaluate('(() => { const m = [...document.querySelectorAll("body > .pop")].pop(); if (!m) return null; const r = m.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0; })()')
        check('%d px: a tap on Line and Paragraph Spacing opens its menu inside the screen' % w, menu.count() == 1 and fits, fits)
        menu.get_by_role('menuitemradio', name='1.5', exact=True).first.tap(); page.wait_for_timeout(300)
        check('%d px: a tap on 1.5 writes setspace\'s onehalfspace around the paragraph' % w, '\\begin{onehalfspace}\nSecond paragraph of the text.\n\\end{onehalfspace}' in src(page), src(page)[:300])
        page.evaluate('rikuy.undo()'); page.wait_for_timeout(200)
        page.locator('#rc-show-marks').tap(); page.wait_for_timeout(200)
        check('%d px: a tap on Show marks shows them, nothing written' % w, page.evaluate('document.body.classList.contains("marks-on")') and src(page) == PLAIN)
        page.locator('#rc-show-marks').tap(); page.wait_for_timeout(200)
        check('%d px: and a second tap hides them' % w, not page.evaluate('document.body.classList.contains("marks-on")'))
        big = page.evaluate('''() => [...document.querySelectorAll('.rb-grp[data-group="paragraph"] button')].filter((b) => b.offsetParent).map((b) => { const r = b.getBoundingClientRect(); return [b.id || b.dataset.cmd || '', Math.round(r.width), Math.round(r.height)]; })''')
        check('%d px: the Paragraph group\'s targets are 44 px for a finger (a split button\'s arrow 28 px wide beside its 44 px button)' % w, big and all(x[2] >= 44 and (x[1] >= 44 or (x[0].endswith('-x') and x[1] >= 28)) for x in big), big)
        tap_word(page, 'Second', 3)
        page.locator('#rc-paragraph-settings').tap(); page.wait_for_timeout(400)
        box = page.evaluate('''() => { const d = document.querySelector('.pop-pd'); if (!d) return null; const r = d.getBoundingClientRect(), s = getComputedStyle(d);
          return { l: r.left, r: r.right, t: r.top, b: r.bottom, sh: d.scrollHeight, ch: d.clientHeight, oy: s.overflowY, iw: innerWidth, ih: innerHeight }; }''')
        check('%d px: the Paragraph dialog opens by a tap and fits the screen\'s width and height' % w, box and box['l'] >= 0 and box['r'] <= box['iw'] + 1 and box['t'] >= 0 and box['b'] <= box['ih'] + 1, box)
        check('%d px: what it holds past the screen scrolls inside it' % w, box and (box['sh'] <= box['ch'] + 1 or box['oy'] in ('auto', 'scroll')), box)
        dlg = page.get_by_role('dialog', name='Paragraph')
        dlg.get_by_role('combobox', name='Alignment').select_option('right')
        dlg.get_by_role('button', name='OK').tap(); page.wait_for_timeout(300)
        check('%d px: OK by a tap writes it' % w, src(page) == ENV('flushright'), src(page)[40:200])
        check('%d px: the page never scrolled sideways' % w, sideways(page) <= 0, sideways(page))
        check('%d px: no page errors' % w, not errors, errors[:3])
        br.close()
    for dark in (False, True):
        br, pg, er = open_phone(p, 390, 844, dark)
        load_doc(pg, D('First paragraph here with words that run on.\n\n\\begin{center}\nA centred paragraph.\n\\end{center}\n\nThird one.'))
        tap_word(pg, 'centred', 2)
        pg.evaluate('document.getElementById("rc-align-center").scrollIntoView({ inline: "center" })'); pg.wait_for_timeout(200)
        tag = 'phone-' + ('dark' if dark else 'light') + '-390'
        pg.screenshot(path='/tmp/B2-shots/' + tag + '.png')
        pg.locator('#rc-paragraph-settings').tap(); pg.wait_for_timeout(400)
        pg.screenshot(path='/tmp/B2-shots/' + tag + '-dialog.png')
        br.close()

def screenshots(p):
    out = '/tmp/B2-shots'
    os.makedirs(out, exist_ok=True)
    for dark in (False, True):
        for w in (1920, 1366, 390):
            b, page, errors = open_page(p, width=w, height=900, dark=dark)
            tag = ('dark' if dark else 'light') + '-' + str(w)
            load_doc(page, D('First paragraph here with words that run on for a while to fill a line.\n\n\\begin{center}\nA centred paragraph.\n\\end{center}\n\n\\begin{tcolorbox}[colback=yellow!20,colframe=yellow!20,boxrule=0pt,sharp corners]\nA shaded paragraph.\n\\end{tcolorbox}\n\n\\noindent\\hangindent=1cm Hanging ' + 'words of a hanging paragraph ' * 6 + '\n\nLine one\\\\ line two.', '\\usepackage{tcolorbox}\n'))
            click_text(page, 'centred', 2); page.wait_for_timeout(300)
            page.screenshot(path=os.path.join(out, tag + '-home.png'))
            cmd(page, 'show-marks'); page.wait_for_timeout(200)
            page.screenshot(path=os.path.join(out, tag + '-marks.png'))
            cmd(page, 'show-marks')
            click_text(page, 'centred', 2)
            cmd(page, 'paragraph-settings'); page.wait_for_timeout(300)
            page.screenshot(path=os.path.join(out, tag + '-dialog.png'))
            page.get_by_role('dialog', name='Paragraph').get_by_role('tab', name='Line and Page Breaks').click(); page.wait_for_timeout(150)
            page.screenshot(path=os.path.join(out, tag + '-dialog-breaks.png'))
            page.keyboard.press('Escape'); page.wait_for_timeout(100)
            click_text(page, 'centred', 2)
            if w > 520:
                page.click('#rc-line-spacing') if page.evaluate('!!document.getElementById("rc-line-spacing").offsetParent') else page.click('#rg-home-paragraph')
                page.wait_for_timeout(200)
                page.screenshot(path=os.path.join(out, tag + '-spacing-menu.png'))
                page.keyboard.press('Escape')
            if w > 860:
                page.get_by_role('tablist', name='Ribbon').get_by_role('tab', name='Layout', exact=True).click()
            else:
                page.select_option('#rb-tabsel', 'layout')
            page.wait_for_timeout(200); click_text(page, 'centred', 2); page.wait_for_timeout(200)
            page.screenshot(path=os.path.join(out, tag + '-layout.png'))
            check('no page errors in the screenshots at %s' % tag, not errors, errors[:3])
            b.close()


def run():
    names = sys.argv[1:]
    with sync_playwright() as p:
        browser, page, errors = open_page(p)
        for f in (alignment, spacing, indents, flags, boxes, marks, dialog, layout_and_design, agents, compile_pdf, reviewed):
            if names and f.__name__ not in names: continue
            try: f(page)
            except Exception as e: check(f.__name__ + ' runs to its end', False, str(e)[:400])
        check('no page errors', not [e for e in errors if 'tree.wasm' not in e and 'TeX' not in e], errors[:4])
        browser.close()
        if not names or 'phone' in names:
            try: phone(p)
            except Exception as e: check('phone runs to its end', False, str(e)[:400])
        if not names or 'screenshots' in names:
            try: screenshots(p)
            except Exception as e: check('screenshots run to their end', False, str(e)[:400])
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    run()
