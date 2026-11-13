"""The page's set up (src/cmd/page.js, src/pagesrc.js, src/layout.js, src/ui/pagesetup.js,
src/ui/headerfooter.js), in Chromium.

Margins, Size and Orientation from their menus write geometry once and where it stands (a hand
written \\geometry{...} and the class's a4paper edited in place, geometry's pass where the class
lays the page out), one step of history, undo back to the bytes; the page takes the sheet the PDF
has (A4 where nothing sets it), turns for landscape and moves the text block as TeX does. Ctrl+Enter is a page break outside a table and a new row in a cell; Blank page and the
Breaks menu (column, next page, continuous in multicols). Columns: two as the class's twocolumn,
three as multicols, around the selected paragraphs, one taking them out; the page draws the
columns. Line numbers in the margin. The header and footer: a double click in the top margin
opens three fields and the Header & Footer tab, what is typed goes into \\fancyhead, Escape
closes; page numbers at the top, Page X of Y, removed, formatted as roman. Different first page,
two sided (even pages mirrored), the watermark, the page's colour and border, hyphenation, the
class and its size, the Page setup dialog. Where dist/tex holds a TeX tree: the PDF compiled in
the page has the paper's size (pypdf's MediaBox), the header's words and the line numbers
(pdftotext), and Print (Ctrl+P) draws the PDF's pages for the printer; and every case of the
hostile review of b1ccf0f (H1 to M7, the low ones), on the page and, where it is about TeX, in
TeX's PDF compiled in the page and held against what the page draws (compile_pdf)."""
import os, re, sys, base64, tempfile, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import open_page, load_doc, src, click_text, select_text, check, results, roundtrip, pressed, ROOT
from playwright.sync_api import sync_playwright

DIST = os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist')
CM = 72.27 / 2.54
BODY = 'First paragraph here with words.\n\nSecond paragraph of the text.'
def DOC(pre='', body=BODY, cls='\\documentclass{article}'):
    return cls + '\n' + pre + '\\begin{document}\n' + body + '\n\\end{document}\n'

HF_OLD = '\\usepackage{fancyhdr}\n\\pagestyle{fancy}\n\\fancyhf{}\n\\fancyhead[C]{Old}\n\\fancyfoot[C]{\\thepage}\n\\renewcommand{\\headrulewidth}{0pt}\n'
HF_COMMENT = '\\usepackage{fancyhdr}\n\\pagestyle{fancy}\n\\fancyhf{}\n\\fancyhead[L]{%\n  \\textbf{My Title}% the running title\n}\n'
HF_THESIS = '\\usepackage{fancyhdr}\n\\fancypagestyle{thesis}{\\fancyhf{}\\fancyhead[L]{My Thesis}\\fancyhead[R]{\\leftmark}\\fancyfoot[R]{\\thepage}}\n\\pagestyle{thesis}\n'
LONG = ' '.join(['Words of a long paragraph that runs over several lines of the page.'] * 12)
BOOK = '\\documentclass{book}\n\\begin{document}\n\\chapter{One}\n' + '\n\n'.join([LONG] * 10) + '\n\\end{document}\n'

def cmd(page, cid, args=None):
    page.evaluate('([c, a]) => window.rikuy.runCommand(c, a === null ? undefined : a)', [cid, args]); page.wait_for_timeout(200)

def pick(page, button, item, role='menuitemradio'):
    """A ribbon menu opened by its button, an item chosen by its name."""
    page.click('#' + button); page.wait_for_timeout(200)
    page.get_by_role('menu').get_by_role(role, name=item, exact=True).click(); page.wait_for_timeout(250)

def checked(page, button, item):
    page.click('#' + button); page.wait_for_timeout(200)
    v = page.get_by_role('menu').get_by_role('menuitemradio', name=item, exact=True).get_attribute('aria-checked')
    page.keyboard.press('Escape'); page.wait_for_timeout(100)
    return v == 'true'

def geom(page):
    return page.evaluate('''() => { const g = window.rikuy.layout.g, px = window.rikuy.px, p = document.querySelector('#pages .page'), pb = p.querySelector('.pb');
      return { pw: g.pw, ph: g.ph, ml: g.ml, mt: g.mt, tw: g.tw, w: p.offsetWidth / px, h: p.offsetHeight / px, left: pb.offsetLeft / px, top: pb.offsetTop / px, width: pb.offsetWidth / px }; }''')

def open_tab(page, name):
    page.get_by_role('tablist', name='Ribbon', exact=True).get_by_role('tab', name=name, exact=True).click(); page.wait_for_timeout(200)


def margins_size_orientation(page):
    d = DOC()
    load_doc(page, d); click_text(page, 'First', 2); open_tab(page, 'Layout')
    h0 = page.evaluate('rikuy.hist.length')
    pick(page, 'rc-margins', 'Narrow')
    # (the sheet the page showed, A4 as TeX Live's PDF has it where nothing sets it, stays A4)
    check('Margins › Narrow writes \\usepackage[a4paper,margin=1.27cm]{geometry}, one step', src(page) == DOC('\\usepackage[a4paper,margin=1.27cm]{geometry}\n') and page.evaluate('rikuy.hist.length') == h0 + 1, src(page)[:120])
    g = geom(page)
    check('the page moves its text block to 1.27 cm from every edge, as geometry does', abs(g['left'] - 1.27 * CM) < 0.6 and abs(g['top'] - 1.27 * CM) < 0.6 and abs(g['width'] - (g['pw'] - 2.54 * CM)) < 0.6, g)
    check('and the menu shows Narrow chosen', checked(page, 'rc-margins', 'Narrow'))
    page.evaluate('rikuy.undo()'); page.wait_for_timeout(150)
    check('one undo gives the bytes back', src(page) == d)
    # hand written: \geometry{...} edited in place; the class's a4paper too
    hw = DOC('\\usepackage{geometry}\n\\geometry{a4paper, margin=1in}\n')
    load_doc(page, hw); click_text(page, 'First', 2)
    check('a hand written \\geometry{margin=1in} shows as Normal', checked(page, 'rc-margins', 'Normal'))
    pick(page, 'rc-margins', 'Wide')
    check('Wide edits that \\geometry line in place, margin= taken by the two keys where it stood', src(page) == DOC('\\usepackage{geometry}\n\\geometry{a4paper, vmargin=2.54cm,hmargin=5.08cm}\n'), src(page)[:140])
    a4 = DOC('', cls='\\documentclass[11pt,a4paper]{article}')
    load_doc(page, a4); click_text(page, 'First', 2)
    check('the class\'s a4paper shows as A4 in Size', checked(page, 'rc-size', 'A4'))
    g0 = geom(page)
    check('the page is A4: 597.5 by 845 pt', abs(g0['pw'] - 597.51) < 0.2 and abs(g0['ph'] - 845.05) < 0.2 and abs(g0['w'] - g0['pw']) < 1, g0)
    pick(page, 'rc-size', 'Letter')
    # (review H4: pass, which sets the PDF's sheet and leaves the class's text block where it was)
    g2 = geom(page)
    check('Size › Letter changes the class\'s option in place and loads geometry with pass, so the PDF\'s sheet follows and the class\'s text block stays the class\'s', src(page) == DOC('\\usepackage[pass]{geometry}\n', cls='\\documentclass[11pt,letterpaper]{article}')
          and abs(g2['pw'] - 614.3) < 0.2 and abs(g2['tw'] - 360) < 0.1, (src(page)[:120], g2))
    page.evaluate('rikuy.undo()'); page.wait_for_timeout(150)
    pick(page, 'rc-orientation', 'Landscape')
    g1 = geom(page)
    check('Orientation › Landscape: the class\'s landscape and pass (no geometry layout), the page wider than high', src(page) == DOC('\\usepackage[pass]{geometry}\n', cls='\\documentclass[11pt,a4paper,landscape]{article}') and g1['w'] > g1['h'] and abs(g1['pw'] - 845.05) < 0.2, (src(page)[:120], g1))
    pick(page, 'rc-orientation', 'Portrait')
    check('Portrait takes it out again: the bytes of before but the package line', src(page) == DOC('\\usepackage[pass]{geometry}\n', cls='\\documentclass[11pt,a4paper]{article}'), src(page)[:120])
    # roundtrip rule through the command
    # (a size or margins chosen again change nothing: the round trip's "again" is that)
    a5 = DOC('\\usepackage[pass]{geometry}\n', cls='\\documentclass[a5paper]{article}')
    roundtrip(page, d, ('First', 2), lambda pg: cmd(pg, 'size', 'a5'), a5, off=a5, label='Size A5')
    mir = DOC('\\usepackage[a4paper,twoside,vmargin=2.54cm,inner=3.18cm,outer=2.54cm]{geometry}\n')
    roundtrip(page, d, ('First', 2), lambda pg: cmd(pg, 'margins', 'mirrored'), mir, off=mir, label='Margins Mirrored')
    load_doc(page, DOC('\\usepackage[a4paper,twoside,vmargin=2.54cm,inner=3.18cm,outer=2.54cm]{geometry}\n', body=BODY + '\n\\newpage\nThird.'))
    ev = page.evaluate('[...document.querySelectorAll("#pages > .page")].map((p) => [p.classList.contains("even"), p.querySelector(".pb").offsetLeft])')
    check('mirrored margins: the even page has the outer margin on its left', len(ev) == 2 and ev[1][0] and not ev[0][0] and ev[1][1] < ev[0][1], ev)


def breaks(page):
    d = DOC()
    load_doc(page, d); click_text(page, 'First paragraph', 5)
    page.keyboard.press('Control+Enter'); page.wait_for_timeout(250)
    check('Ctrl+Enter cuts the paragraph with \\newpage on a line of its own', src(page) == DOC(body='First\n\\newpage\nparagraph here with words.\n\nSecond paragraph of the text.') and page.evaluate('document.querySelectorAll("#pages > .page").length') == 2, src(page)[40:140])
    page.keyboard.type('X'); page.wait_for_timeout(200)
    check('and the caret is at the start of the new page\'s text', 'Xparagraph here' in src(page))
    page.evaluate('rikuy.undo()'); page.evaluate('rikuy.undo()'); page.wait_for_timeout(150)
    check('undo gives the bytes back', src(page) == d)
    t = DOC(body='\\begin{tabular}{ll}\ncell & other \\\\\nmore & last \\\\\n\\end{tabular}\n\nAfter.')
    load_doc(page, t); click_text(page, 'cell', 2)
    page.keyboard.press('Control+Enter'); page.wait_for_timeout(250)
    check('in a table\'s cell Ctrl+Enter still adds a row, no page break', '\\newpage' not in src(page) and src(page).count('\\\\') == 3, src(page)[40:160])
    bl = DOC(body='First paragraph here with words.\n\n\\newpage\n\\null\n\\newpage\nSecond paragraph of the text.')
    roundtrip(page, d, ('Second', 0), 'blank-page', bl, off=bl, off_command=lambda pg: None, label='Blank page')
    load_doc(page, DOC(body=BODY.replace('\n\nSecond', '\n\n\\newpage\n\\null\n\\newpage\nSecond')))
    check('a blank page is drawn as TeX prints it: three pages, the middle one empty', page.evaluate('[...document.querySelectorAll("#pages > .page")].map((p) => p.querySelectorAll(".flow span.t").length > 0)') == [True, False, True])
    mc = DOC('\\usepackage{multicol}\n', body='\\begin{multicols}{2}\nOne two three.\n\nFour five.\n\\end{multicols}')
    load_doc(page, mc); click_text(page, 'Four', 0); open_tab(page, 'Layout')
    page.click('#rc-breaks'); page.wait_for_timeout(200)
    page.get_by_role('menu').get_by_role('menuitem', name='Column', exact=True).click(); page.wait_for_timeout(250)
    check('Breaks › Column in multicols writes \\columnbreak', '\\columnbreak\nFour five.' in src(page), src(page)[60:200])
    cols = page.evaluate('[...document.querySelectorAll(".mcb .mcc")].map((c) => c.textContent.trim())')
    check('and the page starts the next column there', len(cols) == 2 and cols[1].startswith('Four'), cols)
    load_doc(page, mc); click_text(page, 'Four', 0)
    page.click('#rc-breaks'); page.wait_for_timeout(200)
    page.get_by_role('menu').get_by_role('menuitem', name='Continuous', exact=True).click(); page.wait_for_timeout(250)
    check('Breaks › Continuous ends the columns and starts them again', '\\end{multicols}\n\n\\begin{multicols}{2}\nFour' in src(page), src(page)[60:220])
    load_doc(page, d); click_text(page, 'Second', 0)
    page.click('#rc-breaks'); page.wait_for_timeout(200)
    page.get_by_role('menu').get_by_role('menuitem', name='Next page', exact=True).click(); page.wait_for_timeout(250)
    check('Next page writes \\clearpage', '\\clearpage\nSecond' in src(page), src(page)[40:160])
    # review M6: Even page from page 1 goes on on page 2 (not 4); Odd page from page 1 on page 3
    for kind, want in (('Even page', ['1', '2']), ('Odd page', ['1', '2', '3'])):
        load_doc(page, DOC(cls='\\documentclass[twoside]{article}')); click_text(page, 'Second', 0)
        page.click('#rc-breaks'); page.wait_for_timeout(200)
        page.get_by_role('menu').get_by_role('menuitem', name=kind, exact=True).click(); page.wait_for_timeout(300)
        pages = page.evaluate('[...document.querySelectorAll("#pages > .page")].map((p) => [p.dataset.n, p.querySelector(".flow").textContent.includes("Second")])')
        check(kind + ' from page 1: the text on page ' + want[-1] + ', a blank page before it only where needed', [x[0] for x in pages] == want and pages[-1][1] and '\\ifodd\\value{page}' in src(page), (pages, src(page)[60:200]))
    # review M3: Ctrl+Enter in bold words closes the bold and opens it again; none in a footnote
    load_doc(page, DOC(body='Some \\textbf{bold words} here.\\footnote{A note words.}'))
    click_text(page, 'words', 0)
    page.keyboard.press('Control+Enter'); page.wait_for_timeout(250)
    check('Ctrl+Enter inside \\textbf{bold words}: the bold closed before the break and opened after it', 'Some \\textbf{bold}\n\\newpage\n\\textbf{words} here.' in src(page)
          and page.evaluate('document.querySelectorAll("#pages > .page").length') == 2 and '\\newpage' not in page.evaluate('document.getElementById("pages").textContent'), src(page)[40:160])
    load_doc(page, DOC(body='Some text.\\footnote{A note with words.}'))
    page.evaluate('''() => { const t = [...document.querySelectorAll('#pages .fns span.t')].find((s) => s.textContent.includes('with')); const r = document.createRange(); r.setStart(t.firstChild, t.textContent.indexOf('with')); r.collapse(true); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }''')
    page.wait_for_timeout(150)
    page.keyboard.press('Control+Enter'); page.wait_for_timeout(250)
    check('Ctrl+Enter in a footnote writes nothing (TeX makes no page there)', '\\newpage' not in src(page), src(page)[40:160])
    # review M2: \newpage in multicols is drawn as TeX breaks it, the page; in two columns Page break is \clearpage
    load_doc(page, DOC('\\usepackage{multicol}\n', body='\\begin{multicols}{2}\nOne two three.\n\\newpage\nFour five.\n\\end{multicols}'))
    check('\\newpage inside multicols ends the page, as TeX does (not the column)', page.evaluate('document.querySelectorAll("#pages > .page").length') == 2)
    load_doc(page, DOC(cls='\\documentclass[twocolumn]{article}')); click_text(page, 'Second', 0)
    page.keyboard.press('Control+Enter'); page.wait_for_timeout(250)
    check('in a two column document Ctrl+Enter writes \\clearpage (\\newpage would end the column), and the page draws two pages', '\\clearpage\nSecond' in src(page) and page.evaluate('document.querySelectorAll("#pages > .page").length') == 2, src(page)[40:160])


def columns(page):
    d = DOC(body='\\maketitle\n\n' + BODY, pre='\\title{T}\n')
    load_doc(page, d); click_text(page, 'First', 2); open_tab(page, 'Layout')
    pick(page, 'rc-columns', 'Two')
    check('Columns › Two: the class\'s twocolumn', src(page).startswith('\\documentclass[twocolumn]{article}'), src(page)[:60])
    n = page.evaluate('document.querySelectorAll(".mcb").length')
    t = page.evaluate('document.querySelector(".page .flow > .it.ttl") !== null')
    check('the page draws two columns, the title across them', n >= 1 and t and checked(page, 'rc-columns', 'Two'), (n, t))
    pick(page, 'rc-columns', 'Three')
    check('Three: multicols{3} around the body after \\maketitle, twocolumn gone', '\\begin{multicols}{3}\nFirst' in src(page) and src(page).startswith('\\documentclass{article}') and '\\usepackage{multicol}' in src(page), src(page)[:200])
    check('drawn as three columns', page.evaluate('document.querySelector(".mcb") && getComputedStyle(document.querySelector(".mcb")).getPropertyValue("--n")') == '3')
    pick(page, 'rc-columns', 'One')
    check('One takes the environment out (the package line stays)', src(page) == DOC(pre='\\usepackage{multicol}\n\\title{T}\n', body='\\maketitle\n\n' + BODY), src(page)[:200])
    load_doc(page, d)
    page.evaluate('''() => { const sp = [...document.querySelectorAll('#pages span.t')]; const a = sp.find((x) => x.textContent.includes('First')), z = sp.find((x) => x.textContent.includes('Second'));
      const r = document.createRange(); r.setStart(a.firstChild, 0); r.setEnd(z.firstChild, 6); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }''')
    page.wait_for_timeout(150)
    cmd(page, 'columns', 2)
    check('selected paragraphs: multicols{2} around them, the package added in the same step', '\\begin{multicols}{2}\nFirst paragraph here with words.\n\nSecond paragraph of the text.\n\\end{multicols}' in src(page) and '\\usepackage{multicol}' in src(page) and page.evaluate('rikuy.hist.length') == 1, src(page)[:260])
    page.evaluate('rikuy.undo()'); page.wait_for_timeout(150)
    check('and one undo gives the bytes back', src(page) == d)
    # review H5: a float is never put inside multicols
    fig = DOC(body='Text before words.\n\\begin{figure}[h]\n\\centering\nFIGBODY\n\\caption{A caption}\n\\end{figure}\nText after.')
    load_doc(page, fig); click_text(page, 'words', 0)
    cmd(page, 'columns', 3)
    t = src(page)
    check('Columns › Three around a figure: multicols ended before it and begun again after it, the figure drawn', '\\end{multicols}\n\\begin{figure}[h]' in t and '\\end{figure}\n\\begin{multicols}{3}\nText after.' in t
          and 'A caption' in page.evaluate('document.getElementById("pages").textContent') and checked(page, 'rc-columns', 'Three'), t[60:400])
    cmd(page, 'columns', 1)
    check('and One takes both parts out again', src(page) == fig.replace('\\begin{document}', '\\usepackage{multicol}\n\\begin{document}'), src(page)[60:300])
    load_doc(page, DOC('\\usepackage{multicol}\n', body='\\begin{multicols}{2}\nOne.\n\\begin{figure}\nX\\caption{Gone}\n\\end{figure}\nTwo.\n\\end{multicols}'))
    check('a figure a document has inside multicols is drawn as left out of the PDF, as TeX leaves it out', 'left out of the PDF' in page.evaluate('document.getElementById("pages").textContent'))
    # More columns: the line between
    load_doc(page, DOC('\\usepackage{multicol}\n', body='\\begin{multicols}{2}\n' + BODY + '\n\\end{multicols}'))
    click_text(page, 'First', 2)
    page.click('#rc-columns'); page.wait_for_timeout(150)
    page.get_by_role('menu').get_by_role('menuitem', name='More columns…').click(); page.wait_for_timeout(200)
    dlg = page.get_by_role('dialog', name='Columns')
    dlg.get_by_label('Number of columns').fill('3')
    dlg.get_by_role('checkbox', name='Line between').check()
    dlg.get_by_role('button', name='OK').click(); page.wait_for_timeout(250)
    check('More columns: three, a line between (\\columnseprule), one step', '\\begin{multicols}{3}' in src(page) and '\\setlength{\\columnseprule}{0.4pt}' in src(page) and page.evaluate('rikuy.hist.length') == 1, src(page)[:200])


def line_numbers_and_more(page):
    d = DOC()
    load_doc(page, d); click_text(page, 'First', 2); open_tab(page, 'Layout')
    pick(page, 'rc-line-numbers', 'Continuous')
    n = page.evaluate('[...document.querySelectorAll(".lnum span")].map((s) => s.textContent)')
    check('Line numbers › Continuous: lineno and \\linenumbers, numbers drawn beside the lines', src(page) == DOC('\\usepackage{lineno}\n\\linenumbers\n') and n[:2] == ['1', '2'], (src(page)[:100], n))
    pick(page, 'rc-line-numbers', 'None')
    check('None takes \\linenumbers out (the package line stays), the numbers go', src(page) == DOC('\\usepackage{lineno}\n') and page.evaluate('document.querySelectorAll(".lnum span").length') == 0)
    # hyphenation
    load_doc(page, d); click_text(page, 'First', 2)
    pick(page, 'rc-hyphenation', 'None')
    check('Hyphenation › None: \\usepackage[none]{hyphenat}, and the page breaks no word', src(page) == DOC('\\usepackage[none]{hyphenat}\n') and page.evaluate('document.querySelector(".sheet").classList.contains("nohyph")'))
    pick(page, 'rc-hyphenation', 'Automatic')
    check('Automatic: the bytes of before', src(page) == d)
    click_text(page, 'paragraph', 4)
    page.click('#rc-hyphenation'); page.wait_for_timeout(150)
    page.get_by_role('menu').get_by_role('menuitem', name='Manual', exact=True).click(); page.wait_for_timeout(200)
    check('Manual: an optional hyphen (\\-) at the caret', 'para\\-graph' in src(page), src(page)[40:100])
    # the class
    load_doc(page, d); click_text(page, 'First', 2)
    pick(page, 'rc-base-size', '12 pt')
    check('Base size › 12 pt: the class\'s option', src(page).startswith('\\documentclass[12pt]{article}'))
    pick(page, 'rc-doc-class', 'Report')
    check('Class › Report: the class\'s name', src(page).startswith('\\documentclass[12pt]{report}'))
    roundtrip(page, d, ('First', 2), 'two-sided', DOC(cls='\\documentclass[twoside]{article}'), label='Two sided')
    # review, Low: a commented class line before the real one is no class
    cm = '%\\documentclass[twocolumn]{report}\n' + d
    load_doc(page, cm); click_text(page, 'First', 2)
    cmd(page, 'doc-class', 'book')
    check('Class with a commented \\documentclass line before it: the real one changes, the comment stays', src(page) == '%\\documentclass[twocolumn]{report}\n' + DOC(cls='\\documentclass{book}'), src(page)[:100])
    # review, Low: beamer sets its own page: the page controls are off, saying why
    load_doc(page, DOC(cls='\\documentclass{beamer}', body='\\begin{frame}Hi words\\end{frame}')); page.wait_for_timeout(200)
    st = page.evaluate('["margins", "size", "orientation", "header"].map((id) => window.rikuy.commandState ? window.rikuy.commandState(id) : null)')
    dis = page.evaluate('["rc-margins", "rc-size", "rc-orientation"].map((id) => { const b = document.getElementById(id); return b && (b.disabled || b.getAttribute("aria-disabled") === "true"); })')
    check('beamer: Margins, Size and Orientation are off (geometry would clash with beamer)', all(dis), (dis, st))
    # review, Low: \pagenumbering{gobble} draws no number; \addtocounter{page}{-1} counts back
    load_doc(page, DOC(body='\\pagenumbering{gobble}\nHello.\n\\newpage\nTwo.'))
    f = page.evaluate('[...document.querySelectorAll("#pages > .page")].map((p) => p.querySelector(".ft").hidden ? "" : p.querySelector(".ft").textContent)')
    check('\\pagenumbering{gobble}: no page numbers drawn', f == ['', ''], f)
    load_doc(page, DOC('\\pagenumbering{gobble}\n', body='Hello.'))
    check('\\pagenumbering{gobble} in the preamble too', page.evaluate('document.querySelector("#pages .page .ft").hidden'))
    load_doc(page, DOC(body='Title page.\n\\newpage\n\\addtocounter{page}{-1}\nHello.'))
    f = page.evaluate('[...document.querySelectorAll("#pages > .page")].map((p) => p.dataset.n)')
    check('\\addtocounter{page}{-1}: the second page is numbered 1, as TeX numbers it', f == ['1', '1'], f)
    load_doc(page, DOC(cls='\\documentclass{book}')); click_text(page, 'First', 2)
    check('a book is two sided: the control shows it pressed', pressed(page, 'two-sided') is True)


def header_footer(page):
    d = DOC(pre='\\usepackage{amsmath}\n')
    load_doc(page, d); click_text(page, 'First', 2)
    # a double click in the top margin (the page's top in sight first)
    page.evaluate('document.querySelector("#pages .page").scrollIntoView({ block: "start" })'); page.wait_for_timeout(150)
    box = page.evaluate('(() => { const p = document.querySelector("#pages .page").getBoundingClientRect(), b = document.querySelector("#pages .page .pb").getBoundingClientRect(); return [p.left + p.width / 2, (p.top + b.top) / 2]; })()')
    page.mouse.dblclick(box[0], box[1]); page.wait_for_timeout(300)
    tabs = page.evaluate('[...document.querySelectorAll("#rb-tabs [role=tab]")].filter((t) => !t.hidden).map((t) => t.textContent)')
    check('a double click in the top margin opens the header: three fields, the Header & Footer tab shown and open', page.get_by_role('textbox', name='Header left').count() == 1 and 'Header & Footer' in tabs
          and page.evaluate('document.querySelector("#rb-tabs [aria-selected=true]").textContent') == 'Header & Footer', tabs)
    page.get_by_role('textbox', name='Header right').fill('Draft & notes'); page.wait_for_timeout(600)
    want = DOC(pre='\\usepackage{amsmath}\n\\usepackage{fancyhdr}\n\\pagestyle{fancy}\n\\fancyhf{}\n\\renewcommand{\\headrulewidth}{0pt}\n\\fancyhead[R]{Draft \\& notes}\n\\fancyfoot[C]{\\thepage}\n')
    check('what is typed goes into \\fancyhead[R], & escaped, the page number kept at the foot', src(page) == want, src(page)[:300])
    page.get_by_role('button', name='Date', exact=True).click(); page.wait_for_timeout(500)
    check('Date puts \\today where the caret is in the header', '\\fancyhead[R]{Draft \\& notes\\today}' in src(page), src(page)[:300])
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    tabs = page.evaluate('[...document.querySelectorAll("#rb-tabs [role=tab]")].filter((t) => !t.hidden).map((t) => t.textContent)')
    hd = page.evaluate('document.querySelector("#pages .page .hd").textContent')
    check('Escape closes it, the tab goes, and the page draws the header', 'Header & Footer' not in tabs and page.get_by_role('textbox', name='Header left').count() == 0 and hd.startswith('Draft & notes'), (tabs, hd))
    n = page.evaluate('rikuy.hist.length')
    check('typing in one place, and the date put there, were one step of history', n == 1, n)
    # page numbers
    load_doc(page, d); click_text(page, 'First', 2); open_tab(page, 'Insert')
    page.click('#rc-page-number'); page.wait_for_timeout(150)
    page.get_by_role('menu').get_by_role('menuitem', name='Top right', exact=True).click(); page.wait_for_timeout(250)
    check('Page number › Top right: fancyhdr, \\thepage at the top right, none at the foot', '\\fancyhead[R]{\\thepage}' in src(page) and '\\fancyfoot' not in src(page)
          and page.evaluate('document.querySelector("#pages .page .hd .r").textContent') == '1', src(page)[:300])
    load_doc(page, d); click_text(page, 'First', 2)
    page.click('#rc-page-number'); page.wait_for_timeout(150)
    page.get_by_role('menu').get_by_role('menuitem', name='Page X of Y', exact=True).click(); page.wait_for_timeout(250)
    check('Page X of Y: lastpage, and the foot says Page 1 of 1', '\\usepackage{lastpage}' in src(page) and '\\fancyfoot[C]{Page \\thepage\\ of \\pageref{LastPage}}' in src(page)
          and page.evaluate('document.querySelector("#pages .page .ft").textContent') == 'Page 1 of 1', src(page)[:300])
    load_doc(page, d); click_text(page, 'First', 2)
    page.click('#rc-page-number'); page.wait_for_timeout(150)
    page.get_by_role('menu').get_by_role('menuitem', name='Remove page numbers', exact=True).click(); page.wait_for_timeout(250)
    check('Remove page numbers on a plain page: \\pagestyle{empty}, the foot empty', src(page) == DOC(pre='\\usepackage{amsmath}\n\\pagestyle{empty}\n') and page.evaluate('document.querySelector("#pages .page .ft").hidden'), src(page)[:200])
    load_doc(page, d); click_text(page, 'First', 2)
    page.click('#rc-page-number'); page.wait_for_timeout(150)
    page.get_by_role('menu').get_by_role('menuitem', name='Format page numbers…', exact=True).click(); page.wait_for_timeout(200)
    dlg = page.get_by_role('dialog', name='Page number format')
    dlg.get_by_label('Number format').select_option('roman')
    dlg.get_by_label('Start at').fill('3')
    dlg.get_by_role('button', name='OK').click(); page.wait_for_timeout(250)
    check('Format page numbers: \\pagenumbering{roman} and \\setcounter{page}{3}; the page is numbered iii', '\\begin{document}\n\\pagenumbering{roman}\n\\setcounter{page}{3}\n' in src(page)
          and page.evaluate('document.querySelector("#pages .page .ft").textContent') == 'iii', src(page)[40:200])
    # different first page, read back from the hand written form too
    t = DOC(pre='\\title{T}\n', body='\\maketitle\n' + BODY)
    roundtrip(page, t, ('First', 2), 'hf-first', DOC(pre='\\title{T}\n', body='\\maketitle\n\\thispagestyle{empty}\n' + BODY), label='Different first page')
    load_doc(page, DOC(pre='\\usepackage{fancyhdr}\n\\pagestyle{fancy}\n\\lhead{Hand}\\cfoot{\\thepage}\n', body=BODY + '\n\\newpage\nMore.'))
    hd = page.evaluate('[...document.querySelectorAll("#pages > .page .hd")].map((h) => h.textContent)')
    check('a hand written fancyhdr (\\lhead, \\cfoot) is drawn on every page', hd[0].startswith('Hand') and hd[1].startswith('Hand'), hd)
    # review H1: never written while braces do not pair or a backslash ends it; $ and _ typed are text
    hd = DOC(pre=HF_OLD)
    load_doc(page, hd); click_text(page, 'First', 2)
    page.evaluate('rikuy.pageHFOpen("head")'); page.wait_for_timeout(300)
    page.focus('.hfedit .hf-center'); page.keyboard.press('End')
    page.keyboard.type(' \\textbf{', delay=20); page.wait_for_timeout(700)
    mid, inv = src(page), page.evaluate('document.querySelector(".hfedit .hf-center").getAttribute("aria-invalid")')
    page.keyboard.type('x}', delay=20); page.wait_for_timeout(700)
    page.keyboard.type(' \\', delay=20); page.wait_for_timeout(700)
    mid2 = src(page)
    page.keyboard.type('thepage costs $5 and a_b', delay=20); page.wait_for_timeout(700)
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    want = hd.replace('{Old}', '{Old \\textbf{x} \\thepage costs \\$5 and a\\_b}')
    check('the header typed with a pause after \\textbf{ and after a lone backslash: nothing written until it is whole, then one line, $ and _ as text', mid == hd and inv == 'true' and mid2.count('\\fancyhead[C]') == 1 and '\\textbf{x}' in mid2 and src(page) == want, (inv, src(page)[60:300]))
    # (TeX reads no space after \thepage: "1costs", as the PDF has it)
    check('and the page draws it as TeX will print it', page.evaluate('document.querySelector("#pages .page .hd .c").textContent') == 'Old x 1costs $5 and a_b', page.evaluate('document.querySelector("#pages .page .hd .c").textContent'))
    # review H2: an argument over lines with comments: shown and edited as TeX reads it, the comments kept
    hc = DOC(pre=HF_COMMENT)
    load_doc(page, hc); click_text(page, 'First', 2)
    drawn = page.evaluate('document.querySelector("#pages .page .hd .l").textContent')
    page.evaluate('rikuy.pageHFOpen("head")'); page.wait_for_timeout(300)
    shown = page.evaluate('document.querySelector(".hfedit .hf-left").value')
    page.focus('.hfedit .hf-left'); page.keyboard.press('End'); page.keyboard.type('!'); page.wait_for_timeout(700)
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    check('a header argument with comments and line ends: drawn and shown without them, "!" typed goes in before the comment', drawn == 'My Title' and shown == '\\textbf{My Title}' and src(page) == hc.replace('{My Title}%', '{My Title}!%'), (drawn, shown, src(page)[60:260]))
    # review H3: the document's own \fancypagestyle, drawn and edited inside it
    th = DOC(pre=HF_THESIS)
    load_doc(page, th); click_text(page, 'First', 2)
    hdft = page.evaluate('[document.querySelector("#pages .page .hd").textContent, document.querySelector("#pages .page .ft .r").textContent, document.querySelector("#pages .page .ft .c").textContent]')
    page.evaluate('rikuy.pageHFOpen("head")'); page.wait_for_timeout(300)
    page.focus('.hfedit .hf-center'); page.keyboard.type('Draft'); page.wait_for_timeout(700)
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    check('a \\fancypagestyle{thesis} in use: drawn as its pages get it, "Draft" typed goes inside it, \\pagestyle{thesis} kept', hdft[0].startswith('My Thesis') and hdft[1] == '1' and hdft[2] == ''
          and src(page) == th.replace('\\fancyfoot[R]{\\thepage}}', '\\fancyfoot[R]{\\thepage}\\fancyhead[C]{Draft}}'), (hdft, src(page)[40:300]))
    # review, Low: KOMA-Script's scrlayer-scrpage: its own commands, no fancyhdr
    ko = DOC(pre='\\usepackage{scrlayer-scrpage}\n\\ihead{Left}\n', cls='\\documentclass{scrartcl}')
    load_doc(page, ko); click_text(page, 'First', 2)
    page.evaluate('rikuy.pageHFOpen("head")'); page.wait_for_timeout(300)
    page.focus('.hfedit .hf-right'); page.keyboard.type('X'); page.wait_for_timeout(700)
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    check('KOMA with scrlayer-scrpage: a header typed is \\ohead{X}, no fancyhdr', src(page) == ko.replace('\\ihead{Left}\n', '\\ihead{Left}\n\\ohead{X}\n') and page.evaluate('document.querySelector("#pages .page .hd .r").textContent') == 'X', src(page)[:200])
    # review M4: a book's pages take the headings style: the running head at the top, no number at the foot
    load_doc(page, BOOK); page.wait_for_timeout(300)
    pg = [[re.sub(r'\s+', ' ', x) for x in r] for r in page.evaluate('[...document.querySelectorAll("#pages > .page")].map((p) => [p.dataset.n, p.querySelector(".hd").hidden ? "" : p.querySelector(".hd").textContent, p.querySelector(".ft").hidden ? "" : p.querySelector(".ft").textContent])')]
    check('a book: the chapter\'s page plain, the next page "2 ... CHAPTER 1. ONE" at its top and nothing at its foot', len(pg) >= 2 and pg[0][2] == '1' and pg[1][1].startswith('2') and 'CHAPTER 1. ONE' in pg[1][1] and pg[1][2] == '', pg[:3])


def background(page):
    d = DOC()
    load_doc(page, d); click_text(page, 'First', 2); open_tab(page, 'Design')
    pick(page, 'rc-watermark', 'DRAFT')
    w = page.evaluate('(() => { const w = document.querySelector("#pages .page .wmk"); return w && [w.textContent, w.style.transform]; })()')
    check('Watermark › DRAFT: draftwatermark, the word across the page at 45 degrees', src(page) == DOC('\\usepackage{draftwatermark}\n\\DraftwatermarkOptions{text=DRAFT}\n') and w and w[0] == 'DRAFT' and 'rotate(-45deg)' in w[1], (src(page)[:120], w))
    page.click('#rc-watermark'); page.wait_for_timeout(150)
    page.get_by_role('menu').get_by_role('menuitem', name='Remove watermark').click(); page.wait_for_timeout(250)
    check('Remove watermark: the bytes of before, nothing drawn', src(page) == d and page.evaluate('document.querySelector(".wmk")') is None)
    page.click('#rc-page-color'); page.wait_for_timeout(200)
    page.get_by_role('menu').get_by_role('menuitemradio', name='yellow', exact=True).click(); page.wait_for_timeout(250)
    bg = page.evaluate('document.querySelector("#pages .page").style.background')
    check('Page color › yellow: \\pagecolor{yellow} with xcolor, the page yellow', '\\pagecolor{yellow}' in src(page) and '\\usepackage{xcolor}' in src(page) and ('255, 255, 0' in bg or 'FFFF00' in bg.upper()), (src(page)[:120], bg))
    page.click('#rc-page-color'); page.wait_for_timeout(200)
    page.get_by_role('menu').get_by_role('menuitem', name='No color', exact=True).click(); page.wait_for_timeout(250)
    check('No color takes \\pagecolor out', '\\pagecolor' not in src(page) and not page.evaluate('document.querySelector("#pages .page").style.background'))
    load_doc(page, d); click_text(page, 'First', 2)
    page.click('#rc-page-borders'); page.wait_for_timeout(200)
    dlg = page.get_by_role('dialog', name='Page borders')
    dlg.get_by_label('Setting').select_option('box')
    dlg.get_by_role('button', name='OK').click(); page.wait_for_timeout(250)
    b = page.evaluate('(() => { const b = document.querySelector("#pages .page .pbd"); return b && [b.offsetLeft / window.rikuy.px, b.offsetTop / window.rikuy.px]; })()')
    check('Page borders › Box: a TikZ rectangle on every page, drawn 1 cm in from the edge', 'shipout/background' in src(page) and '\\usepackage{tikz}' in src(page) and b and abs(b[0] - CM) < 1 and abs(b[1] - CM) < 1, (src(page)[:400], b))


def page_setup_dialog(page):
    d = DOC()
    load_doc(page, d); click_text(page, 'First', 2); open_tab(page, 'Layout')
    page.click('#rc-page-setup'); page.wait_for_timeout(250)
    dlg = page.get_by_role('dialog', name='Page setup')
    check('Page setup is a dialog by its name, its fields by theirs', dlg.count() == 1 and dlg.get_by_role('spinbutton', name='Top').count() == 1 and dlg.get_by_label('Paper size').count() == 1)
    for f in ('Top', 'Bottom', 'Left', 'Right'):
        dlg.get_by_role('spinbutton', name=f, exact=True).fill('2')
    dlg.get_by_label('Paper size').select_option('a4')
    dlg.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    # (A4 is the sheet the page shows already, as TeX Live's PDF has it: kept with the margins)
    check('OK writes what changed in one step: margins and paper in geometry', src(page) == DOC('\\usepackage[a4paper,margin=2cm]{geometry}\n') and page.evaluate('rikuy.hist.length') == 1, src(page)[:140])
    page.click('#rc-page-setup'); page.wait_for_timeout(250)
    dlg = page.get_by_role('dialog', name='Page setup')
    check('opened again it shows them', dlg.get_by_role('spinbutton', name='Top').input_value() == '2' and dlg.get_by_label('Paper size').input_value() == 'a4')
    dlg.get_by_role('button', name='Cancel').click(); page.wait_for_timeout(150)
    # vertical alignment of the caret's page
    load_doc(page, DOC(body='Title page.\n\\newpage\nRest.')); click_text(page, 'Title', 2)
    page.click('#rc-page-setup'); page.wait_for_timeout(250)
    dlg = page.get_by_role('dialog', name='Page setup')
    dlg.get_by_label('Vertical alignment', exact=True).select_option('center')
    dlg.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    top = page.evaluate('(() => { const t = [...document.querySelectorAll("#pages span.t")].find((s) => s.textContent.includes("Title")); const p = t.closest(".page"); return (t.getBoundingClientRect().top - p.getBoundingClientRect().top) / p.offsetHeight; })()')
    check('Vertical alignment › Center: \\vspace*{\\fill} before and after the page\'s text, drawn in the middle', '\\vspace*{\\fill}\nTitle page.\n\\vspace*{\\fill}\n\\newpage' in src(page) and 0.4 < top < 0.6, (src(page)[40:160], top))


def agents_and_keys(page):
    load_doc(page, DOC()); click_text(page, 'First', 2)
    page.evaluate('rikuy.pageHFOpen("foot")'); page.wait_for_timeout(250)
    names = ['Header', 'Footer', 'Page number', 'Date', 'Page number here', 'Different first page', 'Different odd & even pages', 'Close header and footer']
    got = {n: page.get_by_role('tabpanel', name='Header & Footer').get_by_role('button', name=n, exact=True).count() for n in names}
    check('the Header & Footer tab has its controls by Word\'s names', all(v == 1 for v in got.values()), got)
    page.get_by_role('button', name='Close header and footer').click(); page.wait_for_timeout(200)
    check('Close header and footer closes it', page.evaluate('!rikuy.hf'))
    box = page.get_by_role('combobox', name='Search', exact=True)
    box.click(); box.fill('landscape'); page.wait_for_timeout(150)
    found = page.get_by_role('listbox', name='Commands', exact=True).get_by_role('option').all_inner_texts()
    page.keyboard.press('Escape'); page.keyboard.press('Escape')
    check('the search box finds Orientation by "landscape"', found and found[0].startswith('Orientation'), found[:3])


def compile_doc(page, text=None):
    """TeX's PDF of the page's document (text set first, if given), compiled in the page: { ok,
    pages, pdf (pypdf's reader), txt: pdftotext's pages, words: pdftotext's words per page with
    their boxes in bp, page: what the page draws (its pages' head and foot, the sheet and the
    text block in pt) }"""
    page.set_default_timeout(600000)
    r = page.evaluate('''async (t) => { if (t !== null) await window.rikuy.api.setSource(t); const g0 = window.rikuy.layout.g, before = { pw: g0.pw, ph: g0.ph };
      const r = await window.rikuy.api.compile(); let s = ''; if (r.pdf) for (let i = 0; i < r.pdf.length; i += 8192) s += String.fromCharCode(...r.pdf.subarray(i, i + 8192));
      const g = window.rikuy.layout.g, pages = [...document.querySelectorAll('#pages > .page')];
      return { ok: r.ok, pages: r.pages, b64: r.pdf ? btoa(s) : '', before, page: { n: pages.length, g: { pw: g.pw, ph: g.ph, ml: g.ml, mt: g.mt, tw: g.tw, th: g.th },
        hd: pages.map((p) => p.querySelector('.hd').hidden ? '' : p.querySelector('.hd').textContent),
        ft: pages.map((p) => p.querySelector('.ft').hidden ? '' : p.querySelector('.ft').textContent) } }; }''', text)
    page.set_default_timeout(30000)
    out = {'ok': r['ok'], 'pages': r['pages'], 'page': r['page'], 'before': r['before'], 'pdf': None, 'txt': [], 'words': []}
    if not r['b64']: return out
    from pypdf import PdfReader
    f = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False); f.write(base64.b64decode(r['b64'])); f.close()
    out['pdf'] = PdfReader(f.name)
    out['txt'] = subprocess.run(['pdftotext', '-layout', f.name, '-'], capture_output=True, text=True).stdout.split('\f')
    bb = subprocess.run(['pdftotext', '-bbox', f.name, '-'], capture_output=True, text=True).stdout
    for pg in bb.split('<page ')[1:]:
        out['words'].append([(float(m[0]), float(m[1]), float(m[2]), float(m[3]), m[4]) for m in re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>', pg)])
    os.unlink(f.name)
    return out

BP = 72 / 72.27
def sheet(c):
    mb = c['pdf'].pages[0].mediabox
    return (float(mb.width), float(mb.height))
def block(c, k=0):
    """The text block's left and right edges in the PDF (bp): the leftmost and rightmost x of the body's words"""
    ws = [w for w in c['words'][k] if w[1] > 90 and w[3] < sheet(c)[1] - 90] if c['words'] else []
    return (min(w[0] for w in ws), max(w[2] for w in ws)) if ws else (0, 0)


def compile_pdf(page):
    """TeX's PDF says the same: the paper's size, the header, the line numbers; and the hostile
    review's cases (H1 to M7 and the low ones), each compiled in the page and held against what
    the page draws."""
    if not os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        print('SKIP the PDF of the page set up: no TeX tree in %s' % DIST)
        return
    text = DOC('\\usepackage[a5paper,landscape,margin=2cm]{geometry}\n\\usepackage{fancyhdr}\n\\pagestyle{fancy}\n\\fancyhf{}\n\\fancyhead[R]{Running head}\n\\fancyfoot[C]{\\thepage}\n\\usepackage{lineno}\n\\linenumbers\n\\usepackage{multicol}\n',
               body='\\begin{multicols}{2}\n' + ' '.join(['Words in two columns.'] * 30) + '\n\\end{multicols}')
    c = compile_doc(page, text)
    if not c['ok']:
        check('the page set up compiles', False, c.get('pages'))
        return
    w, h = sheet(c)
    check('the PDF\'s sheet is A5 landscape (595 by 420 bp), as the page draws it', abs(w - 595.28) < 1 and abs(h - 419.53) < 1, (w, h))
    out = c['txt'][0]
    check('the PDF has the running head on its first page, as the page does', 'Running head' in out and c['page']['hd'][0].startswith('Running head'), out[:200])
    nums = re.findall(r'(?m)^\s*(\d+)\s', out)
    check('and the line numbers in the margin (lineno)', len(nums) >= 3 and nums[0] == '1', nums[:6])
    check('the page and the PDF have as many pages', c['pages'] == c['page']['n'], (c['pages'], c['page']['n']))
    # Print: the PDF's pages drawn for the printer at their own size, the browser's dialog asked for
    page.evaluate('''() => { window.__printed = 0; window.print = () => { window.__printed = document.querySelectorAll('#print-pdf img').length; window.dispatchEvent(new Event('beforeprint')); }; window.rikuy.noPrintFallback = true; window.rikuy.printImages = true; }''')
    page.evaluate('document.getElementById("pages").focus()')
    page.keyboard.press('Control+p')
    page.wait_for_function('window.__printed > 0', timeout=120000)
    page.wait_for_timeout(500)
    check('Ctrl+P prints TeX\'s PDF: its pages drawn for the printer at the PDF\'s own size, then the browser\'s print dialog', page.evaluate('window.__printed') == c['pages'] and page.evaluate('document.body.classList.contains("pdf-on")')
          and page.evaluate('window.rikuy.printedSizes') == ['595.28 419.53'], (page.evaluate('window.__printed'), page.evaluate('window.rikuy.printedSizes')))
    # ---- the review's cases, each in TeX's PDF and on the page ----
    # M1: \documentclass{article} alone: TeX Live's PDF is A4; so is the page's sheet
    c = compile_doc(page, DOC(body='\\noindent ' + LONG))
    w, h = sheet(c); g = c['page']['g']
    x0, x1 = block(c)
    check('M1: an article with no paper set: the PDF is A4 (595 by 842 bp), and so is the sheet the page draws; the text block where TeX puts it',
          abs(w - 595.28) < 1 and abs(h - 841.89) < 1 and abs(g['pw'] * BP - w) < 1 and abs(g['ph'] * BP - h) < 1 and abs(x0 - g['ml'] * BP) < 1.5 and abs(x1 - (g['ml'] + g['tw']) * BP) < 1.5, ((w, h), g, (x0, x1)))
    # H4: \documentclass[letterpaper] and Size › A4: the class's A4 text block (345 pt wide), the PDF A4
    load_doc(page, DOC(body='\\noindent ' + LONG, cls='\\documentclass[letterpaper]{article}')); click_text(page, 'Words', 2)
    cmd(page, 'size', 'a4')
    c = compile_doc(page, None)
    w, h = sheet(c); g = c['page']['g']
    x0, x1 = block(c)
    check('H4: Size › A4 on [letterpaper]: [a4paper] alone (no geometry layout); the PDF A4, its text block the class\'s (345 pt from 125.27 pt), as the page draws it',
          src(page) == DOC(body='\\noindent ' + LONG, cls='\\documentclass[a4paper]{article}') and abs(w - 595.28) < 1 and abs(g['tw'] - 345) < 0.1 and abs(g['ml'] - 125.27) < 0.1 and abs(x0 - g['ml'] * BP) < 1.5 and abs(x1 - (g['ml'] + g['tw']) * BP) < 1.5, (src(page)[:80], (w, h), g, (x0, x1)))
    # H4: geometry with no options lays the page out by its own defaults; with pass it keeps the class's
    c = compile_doc(page, DOC('\\usepackage{geometry}\n', body='\\noindent ' + LONG, cls='\\documentclass[a4paper]{article}'))
    g = c['page']['g']; x0, x1 = block(c)
    check('H4: bare \\usepackage{geometry}: geometry\'s own text block (418.25 pt wide), in the PDF as on the page', abs(g['tw'] - 418.25) < 0.1 and abs(x0 - g['ml'] * BP) < 1.5 and abs(x1 - (g['ml'] + g['tw']) * BP) < 1.5, (g, (x0, x1)))
    c = compile_doc(page, DOC('\\usepackage[pass]{geometry}\n', body='\\noindent ' + LONG, cls='\\documentclass[letterpaper]{article}'))
    g = c['page']['g']; x0, x1 = block(c); w, h = sheet(c)
    check('H4: geometry with pass: the PDF Letter (612 by 792 bp), the class\'s text block (345 pt from 134.27 pt), as the page draws them', abs(w - 612) < 1 and abs(h - 792) < 1 and abs(g['pw'] * BP - w) < 1 and abs(g['tw'] - 345) < 0.1 and abs(x0 - g['ml'] * BP) < 1.5 and abs(x1 - (g['ml'] + g['tw']) * BP) < 1.5, ((w, h), g, (x0, x1)))
    # M7: the header's distance changed in Page setup: the text block stays, line for line
    load_doc(page, DOC(body='\\noindent ' + LONG)); click_text(page, 'Words', 2)
    g0 = page.evaluate('(() => { const g = window.rikuy.layout.g; return [g.ml, g.mt, g.tw, g.th]; })()')
    open_tab(page, 'Layout'); page.click('#rc-page-setup'); page.wait_for_timeout(250)
    dlg = page.get_by_role('dialog', name='Page setup')
    dlg.get_by_role('spinbutton', name='Header to text', exact=True).fill('1.5')
    dlg.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
    g1 = page.evaluate('(() => { const g = window.rikuy.layout.g; return [g.ml, g.mt, g.tw, g.th, g.headsep]; })()')
    c = compile_doc(page, None)
    x0, x1 = block(c)
    check('M7: Header to text 1.5 cm on a class laid out page: geometry with the text block pinned, so the text block and the sheet stay, in the page and in the PDF',
          all(abs(a - b) < 0.02 for a, b in zip(g0, g1[:4])) and abs(g1[4] - 1.5 * CM) < 0.1 and abs(sheet(c)[0] - 595.28) < 1 and abs(x0 - g1[0] * BP) < 1.5 and abs(x1 - (g1[0] + g1[2]) * BP) < 1.5, (src(page)[:200], g0, g1, (x0, x1)))
    # H1, H3: a header typed into the document's own style compiles and prints as drawn
    load_doc(page, DOC(pre=HF_THESIS)); click_text(page, 'First', 2)
    page.evaluate('rikuy.pageHFOpen("head")'); page.wait_for_timeout(300)
    page.focus('.hfedit .hf-center'); page.keyboard.type(' \\textbf{Draft', delay=20); page.wait_for_timeout(700); page.keyboard.type('} $5', delay=20); page.wait_for_timeout(700)
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    c = compile_doc(page, None)
    t0 = re.sub(r'\s+', ' ', c['txt'][0] if c['txt'] else '')
    check('H1, H3: "\\textbf{Draft} $5" typed in the thesis style compiles; the PDF\'s head has My Thesis and Draft $5 as the page has them', c['ok'] and 'My Thesis' in t0 and 'Draft $5' in t0 and 'My Thesis' in c['page']['hd'][0] and 'Draft $5' in c['page']['hd'][0], (c['ok'], t0[:120], c['page']['hd'][:1], src(page)[:300]))
    # M4: a book: TeX's running head on page 2 is the page's
    c = compile_doc(page, BOOK)
    t1 = re.sub(r'\s+', ' ', c['txt'][1]).strip() if len(c['txt']) > 1 else ''
    hd1 = re.sub(r'\s+', ' ', c['page']['hd'][1]) if len(c['page']['hd']) > 1 else ''
    check('M4: a book\'s page 2: TeX prints "2 CHAPTER 1. ONE" at its top and no number at its foot, and so does the page', t1.startswith('2 CHAPTER 1. ONE') and hd1.startswith('2') and 'CHAPTER 1. ONE' in hd1 and c['page']['ft'][1] == '' and not re.search(r'\b2\s*$', t1), (t1[:60], t1[-20:], hd1, c['page']['ft'][:3]))
    check('M4: as many pages in the PDF as on the page', c['pages'] == c['page']['n'], (c['pages'], c['page']['n']))
    # H5: Columns › Three around a figure: the PDF has the figure, as the page does
    load_doc(page, DOC(body='Text before words.\n\\begin{figure}[h]\n\\centering\nFIGBODY\n\\caption{A caption}\n\\end{figure}\nText after.')); click_text(page, 'words', 0)
    cmd(page, 'columns', 3)
    c = compile_doc(page, None)
    check('H5: Columns › Three around a figure: TeX prints the figure (not inside multicols), as the page draws it', c['ok'] and any('A caption' in t for t in c['txt']), [t[:80] for t in c['txt']])
    # M6: Even page from page 1: the text on page 2, in the PDF and on the page
    load_doc(page, DOC(body='Oddone words.\n\nAfterbreak words.', cls='\\documentclass[twoside]{article}')); click_text(page, 'Afterbreak', 0)
    page.evaluate('rikuy.pageBreakAt("even")'); page.wait_for_timeout(300)
    c = compile_doc(page, None)
    check('M6: Even page from page 1: TeX goes on on page 2, and so does the page', c['pages'] == 2 == c['page']['n'] and 'Afterbreak' in c['txt'][1], (c['pages'], c['page']['n'], [t[:30] for t in c['txt']]))
    # M2: a page break in a two column document: \clearpage, a page in TeX as on the page
    load_doc(page, DOC(cls='\\documentclass[twocolumn]{article}')); click_text(page, 'Second', 0)
    page.keyboard.press('Control+Enter'); page.wait_for_timeout(250)
    c = compile_doc(page, None)
    check('M2: Ctrl+Enter in two columns: TeX makes two pages, as the page draws', c['pages'] == 2 == c['page']['n'] and 'Second' in c['txt'][1], (c['pages'], c['page']['n']))
    # Low: \pagenumbering{gobble}: no number in the PDF, none on the page
    c = compile_doc(page, DOC(body='\\pagenumbering{gobble}\nHello.\n\\newpage\nTwo.'))
    check('gobble: TeX prints no page number, nor does the page', c['pages'] == 2 and not any(re.search(r'(?m)^\s*\d+\s*$', t) for t in c['txt']) and c['page']['ft'] == ['', ''], ([t.strip()[-10:] for t in c['txt']], c['page']['ft']))
    # Low: KOMA with scrlayer-scrpage: the header typed compiles with KOMA's commands, as drawn
    load_doc(page, DOC(pre='\\usepackage{scrlayer-scrpage}\n\\ihead{Left}\n', cls='\\documentclass{scrartcl}')); click_text(page, 'First', 2)
    page.evaluate('rikuy.pageHFOpen("head")'); page.wait_for_timeout(300)
    page.focus('.hfedit .hf-right'); page.keyboard.type('Right'); page.wait_for_timeout(700); page.keyboard.press('Escape'); page.wait_for_timeout(300)
    c = compile_doc(page, None)
    t0 = re.sub(r'\s+', ' ', c['txt'][0] if c['txt'] else '')
    check('KOMA: \\ohead{Right} with scrlayer-scrpage compiles, the PDF\'s head Left ... Right as the page\'s', c['ok'] and 'Left' in t0 and 'Right' in t0 and 'fancyhdr' not in src(page) and c['page']['hd'][0].startswith('Left') and c['page']['hd'][0].endswith('Right'), (t0[:80], c['page']['hd'][:1]))


def verifier_pdf(page):
    """The verifier's cases of PR 19 (c08fc02), each compiled in the page against what it draws."""
    if not os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        print('SKIP the verifier\'s PDF cases: no TeX tree in %s' % DIST)
        return
    # 1: the sheet: the page draws the PDF's before any compile (the measured table), and after it
    # (the PDF's own); a package nobody measured gets the PDF's once one is made
    cases = [('nothing', DOC()), ('graphicx', DOC('\\usepackage{graphicx}\n')), ('bookmark', DOC('\\usepackage{bookmark}\n')), ('savetrees', DOC('\\usepackage{savetrees}\n')),
             ('crop', DOC('\\usepackage[cam]{crop}\n')), ('DocumentMetadata', '\\DocumentMetadata{}\n' + DOC()), ('tufte-book', DOC(cls='\\documentclass{tufte-book}')),
             ('tufte-handout', DOC(cls='\\documentclass{tufte-handout}')), ('scrreprt', DOC(cls='\\documentclass{scrreprt}')), ('scrlttr2', DOC(body='Text.', cls='\\documentclass{scrlttr2}')),
             ('amsart', DOC(cls='\\documentclass{amsart}'))]
    for name, d in cases:
        c = compile_doc(page, d)
        w, h = sheet(c) if c['pdf'] else (0, 0)
        b, a = c['before'], c['page']['g']
        check('1: the sheet of %s: the PDF\'s (%.0f by %.0f bp) drawn before the compile and after it' % (name, w, h), c['ok'] and abs(b['pw'] * BP - w) < 1 and abs(b['ph'] * BP - h) < 1 and abs(a['pw'] * BP - w) < 1 and abs(a['ph'] * BP - h) < 1, (b, a, (w, h)))
    c = compile_doc(page, DOC('\\usepackage{xstring}\n'))
    w, h = sheet(c)
    check('1: a package not measured (xstring) is drawn on the paper until the PDF says A4, then on A4', abs(c['before']['pw'] - 614.295) < 0.1 and abs(w - 595.28) < 1 and abs(c['page']['g']['pw'] * BP - w) < 1, (c['before'], c['page']['g'], (w, h)))
    # 2: Header to text on classes the page does not model: the text stays where TeX put it
    for cls in ('amsart', 'revtex4-2', 'scrartcl', 'llncs'):
        d = DOC(body='\\noindent ' + LONG, cls='\\documentclass{%s}' % cls)
        c0 = compile_doc(page, d)
        click_text(page, 'Words', 2)
        open_tab(page, 'Layout'); page.click('#rc-page-setup'); page.wait_for_timeout(250)
        dlg = page.get_by_role('dialog', name='Page setup')
        dlg.get_by_role('spinbutton', name='Header to text', exact=True).fill('1.5')
        dlg.get_by_role('button', name='OK').click(); page.wait_for_timeout(300)
        c1 = compile_doc(page, None)
        first = lambda c: [w for w in c['words'][0] if w[4] == 'Words'][:1]
        f0, f1 = first(c0), first(c1)
        check('2: Header to text 1.5 cm on %s: only \\headsep (\\topmargin moved the other way) is written, and the body\'s first word stays where TeX put it' % cls,
              c1['ok'] and '\\setlength{\\headsep}{42.68pt}' in src(page) and 'geometry' not in src(page) and f0 and f1 and abs(f0[0][0] - f1[0][0]) < 0.1 and abs(f0[0][1] - f1[0][1]) < 0.1, (f0, f1, src(page)[:220]))
    # 3: Even page in two columns: no extra blank page
    load_doc(page, DOC(body='Oddone words.\n\nAfterbreak words.', cls='\\documentclass[twocolumn,twoside]{article}')); click_text(page, 'Afterbreak', 0)
    page.evaluate('rikuy.pageBreakAt("even")'); page.wait_for_timeout(300)
    c = compile_doc(page, None)
    check('3: Even page from page 1 in two columns: TeX goes on on page 2, and so does the page (no blank page between)', c['pages'] == 2 == c['page']['n'] and 'Afterbreak' in c['txt'][1], (c['pages'], c['page']['n']))
    # 4: a book's page numbers moved: the running heads stay on their side, in the PDF as on the page
    for where, name in (('FC', 'Bottom center'), ('HR', 'Top right')):
        load_doc(page, BOOK); click_text(page, 'Words', 2)
        cmd(page, 'page-number', where)
        c = compile_doc(page, None)
        t1 = re.sub(r'\s+', ' ', c['txt'][1]).strip() if len(c['txt']) > 1 else ''
        hd1 = re.sub(r'\s+', ' ', c['page']['hd'][1]) if len(c['page']['hd']) > 1 else ''
        ft1 = c['page']['ft'][1] if len(c['page']['ft']) > 1 else ''
        ok = 'CHAPTER 1. ONE' in t1 and 'CHAPTER 1. ONE' in hd1
        ok = ok and (t1.endswith(' 2') and ft1 == '2' if where == 'FC' else t1.startswith('2 CHAPTER 1. ONE') and hd1.startswith('2'))
        check('4: a book, Page number › %s: the even page\'s running head stays, the number where asked, in the PDF as on the page' % name, c['ok'] and ok, (t1[:50], t1[-12:], hd1, ft1, src(page)[:260]))
    # 5: Print: Escape at once (while pdf.js loads) sends nothing to the printer; a PDF over the
    # pictures' budget is downloaded instead, saying so
    page.evaluate('''() => { window.__printed = -1; window.print = () => { window.__printed = document.querySelectorAll('#print-pdf img').length; window.dispatchEvent(new Event('beforeprint')); }; window.rikuy.noPrintFallback = true; window.__dl = 0; window.rikuy.downloadPdf = async () => { window.__dl++; }; }''')
    page.evaluate('() => { window.__pp = window.rikuy.pagePrint(); }')
    page.keyboard.press('Escape')
    page.evaluate('window.__pp'); page.wait_for_timeout(300)
    check('5: Escape right after Print: nothing goes to the printer, nothing is left drawn', page.evaluate('window.__printed') == -1 and page.evaluate('!document.getElementById("print-pdf")'), page.evaluate('window.__printed'))
    page.evaluate('async () => { window.rikuy.printBudget = 1e5; await window.rikuy.pagePrint(); window.rikuy.printBudget = 0; }')
    check('5: a PDF over the budget of pictures: downloaded to print from a PDF reader, not drawn', page.evaluate('window.__printed') == -1 and page.evaluate('window.__dl') == 1)
    # 6: Ctrl+Enter in a macro of the document's own: at the paragraph's end, the macro whole
    d = DOC(pre='\\newcommand{\\pair}[2]{\\textbf{#1:} #2}\n', body='Some \\pair{Key}{value words} after.\n\nNext.')
    load_doc(page, d); click_text(page, 'words', 0)
    page.keyboard.press('Control+Enter'); page.wait_for_timeout(250)
    c = compile_doc(page, None)
    all_txt = ' '.join(c['txt'])
    check('6: Ctrl+Enter in \\pair{Key}{value words}: the break after the paragraph, Key printed once', 'Some \\pair{Key}{value words} after.\n\\newpage' in src(page) and all_txt.count('Key:') == 1 and c['pages'] == 2 == c['page']['n'], (src(page)[60:200], all_txt[:80]))
    load_doc(page, DOC(body='A {plain words \\bfseries bold words} b.'))
    page.evaluate('''() => { const sp = [...document.querySelectorAll('#pages span.t')].filter((x) => x.textContent.includes('words')); const t = sp[sp.length - 1]; const r = document.createRange(); r.setStart(t.firstChild, t.textContent.lastIndexOf('words')); r.collapse(true); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }''')
    page.wait_for_timeout(150)
    page.keyboard.press('Control+Enter'); page.wait_for_timeout(250)
    bold = page.evaluate('''() => { const p = document.querySelectorAll('#pages > .page')[1]; const t = p && [...p.querySelectorAll('span.t')].find((x) => x.textContent.includes('words')); return !!t && +getComputedStyle(t).fontWeight >= 600; }''')
    c = compile_doc(page, None)
    check('6: Ctrl+Enter after \\bfseries in a group: {\\bfseries words} on the next page, bold on the page as in the PDF', '{\\bfseries words}' in src(page) and bold and c['ok'] and c['pages'] == 2 == c['page']['n'], (src(page)[60:200], bold))
    # 7: a space after the brace TeX prints: the field shows it and typing keeps it
    load_doc(page, DOC(pre='\\usepackage{fancyhdr}\n\\pagestyle{fancy}\n\\fancyhf{}\n\\fancyhead[C]{ Title}\n')); click_text(page, 'First', 2)
    page.evaluate('rikuy.pageHFOpen("head")'); page.wait_for_timeout(300)
    shown = page.evaluate('document.querySelector(".hfedit .hf-center").value')
    page.focus('.hfedit .hf-center'); page.keyboard.press('End'); page.keyboard.type('!'); page.wait_for_timeout(700); page.keyboard.press('Escape'); page.wait_for_timeout(300)
    check('7: \\fancyhead[C]{ Title}: the field shows " Title" and "!" typed writes { Title!}', shown == ' Title' and '\\fancyhead[C]{ Title!}' in src(page), (shown, src(page)[60:200]))


def run():
    names = sys.argv[1:]
    with sync_playwright() as p:
        browser, page, errors = open_page(p)
        for f in (margins_size_orientation, breaks, columns, line_numbers_and_more, header_footer, background, page_setup_dialog, agents_and_keys, compile_pdf, verifier_pdf):
            if names and f.__name__ not in names: continue
            try: f(page)
            except Exception as e: check(f.__name__ + ' runs to its end', False, str(e)[:400])
        check('no page errors', not [e for e in errors if 'tree.wasm' not in e and 'TeX' not in e], errors[:4])
        browser.close()
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    run()
