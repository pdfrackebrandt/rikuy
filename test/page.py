"""The page's set up (src/cmd/page.js, src/pagesrc.js, src/layout.js, src/ui/pagesetup.js,
src/ui/headerfooter.js), in Chromium.

Margins, Size and Orientation from their menus write geometry once and where it stands (a hand
written \\geometry{...} and the class's a4paper edited in place), one step of history, undo back
to the bytes; the page takes the paper's size, turns for landscape and moves the text block as
TeX does. Ctrl+Enter is a page break outside a table and a new row in a cell; Blank page and the
Breaks menu (column, next page, continuous in multicols). Columns: two as the class's twocolumn,
three as multicols, around the selected paragraphs, one taking them out; the page draws the
columns. Line numbers in the margin. The header and footer: a double click in the top margin
opens three fields and the Header & Footer tab, what is typed goes into \\fancyhead, Escape
closes; page numbers at the top, Page X of Y, removed, formatted as roman. Different first page,
two sided (even pages mirrored), the watermark, the page's colour and border, hyphenation, the
class and its size, the Page setup dialog. Where dist/tex holds a TeX tree: the PDF compiled in
the page has the paper's size (pypdf's MediaBox), the header's words and the line numbers
(pdftotext), and Print (Ctrl+P) draws the PDF's pages for the printer."""
import os, re, sys, base64, tempfile, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import open_page, load_doc, src, click_text, select_text, check, results, roundtrip, pressed, ROOT
from playwright.sync_api import sync_playwright

DIST = os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist')
CM = 72.27 / 2.54
BODY = 'First paragraph here with words.\n\nSecond paragraph of the text.'
def DOC(pre='', body=BODY, cls='\\documentclass{article}'):
    return cls + '\n' + pre + '\\begin{document}\n' + body + '\n\\end{document}\n'

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
    check('Margins › Narrow writes \\usepackage[margin=1.27cm]{geometry}, one step', src(page) == DOC('\\usepackage[margin=1.27cm]{geometry}\n') and page.evaluate('rikuy.hist.length') == h0 + 1, src(page)[:120])
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
    check('Wide edits that \\geometry line in place', src(page) == DOC('\\usepackage{geometry}\n\\geometry{a4paper,vmargin=2.54cm,hmargin=5.08cm}\n'), src(page)[:140])
    a4 = DOC('', cls='\\documentclass[11pt,a4paper]{article}')
    load_doc(page, a4); click_text(page, 'First', 2)
    check('the class\'s a4paper shows as A4 in Size', checked(page, 'rc-size', 'A4'))
    g0 = geom(page)
    check('the page is A4: 597.5 by 845 pt', abs(g0['pw'] - 597.51) < 0.2 and abs(g0['ph'] - 845.05) < 0.2 and abs(g0['w'] - g0['pw']) < 1, g0)
    pick(page, 'rc-size', 'Letter')
    check('Size › Letter changes the class\'s option in place and loads geometry so the PDF\'s sheet follows', src(page) == DOC('\\usepackage{geometry}\n', cls='\\documentclass[11pt,letterpaper]{article}'), src(page)[:120])
    page.evaluate('rikuy.undo()'); page.wait_for_timeout(150)
    pick(page, 'rc-orientation', 'Landscape')
    g1 = geom(page)
    check('Orientation › Landscape: landscape in geometry, the page wider than high', '\\usepackage[landscape]{geometry}' in src(page) and g1['w'] > g1['h'] and abs(g1['pw'] - 845.05) < 0.2, (src(page)[:120], g1))
    pick(page, 'rc-orientation', 'Portrait')
    check('Portrait takes it out again: the bytes of before but the package line', src(page) == DOC('\\usepackage{geometry}\n', cls='\\documentclass[11pt,a4paper]{article}'), src(page)[:120])
    # roundtrip rule through the command
    # (a size or margins chosen again change nothing: the round trip's "again" is that)
    a5 = DOC('\\usepackage[a5paper]{geometry}\n')
    roundtrip(page, d, ('First', 2), lambda pg: cmd(pg, 'size', 'a5'), a5, off=a5, label='Size A5')
    mir = DOC('\\usepackage[twoside,vmargin=2.54cm,inner=3.18cm,outer=2.54cm]{geometry}\n')
    roundtrip(page, d, ('First', 2), lambda pg: cmd(pg, 'margins', 'mirrored'), mir, off=mir, label='Margins Mirrored')
    load_doc(page, DOC('\\usepackage[twoside,vmargin=2.54cm,inner=3.18cm,outer=2.54cm]{geometry}\n', body=BODY + '\n\\newpage\nThird.'))
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
    off = page.get_by_role('menu').get_by_role('menuitem', name='Odd page', exact=True).get_attribute('aria-disabled')
    page.get_by_role('menu').get_by_role('menuitem', name='Next page', exact=True).click(); page.wait_for_timeout(250)
    check('Next page writes \\clearpage; Odd page waits for a two sided document', '\\clearpage\nSecond' in src(page) and off == 'true', src(page)[40:160])


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
    load_doc(page, DOC(cls='\\documentclass{book}')); click_text(page, 'First', 2)
    check('a book is two sided: the control shows it pressed', pressed(page, 'two-sided') is True)


def header_footer(page):
    d = DOC(pre='\\usepackage{amsmath}\n')
    load_doc(page, d); click_text(page, 'First', 2)
    # a double click in the top margin
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
    check('OK writes what changed in one step: margins and paper in geometry', src(page) == DOC('\\usepackage[margin=2cm,a4paper]{geometry}\n') and page.evaluate('rikuy.hist.length') == 1, src(page)[:140])
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


def compile_pdf(page):
    """TeX's PDF says the same: the paper's size, the header, the line numbers."""
    if not os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        print('SKIP the PDF of the page set up: no TeX tree in %s' % DIST)
        return
    from pypdf import PdfReader
    text = DOC('\\usepackage[a5paper,landscape,margin=2cm]{geometry}\n\\usepackage{fancyhdr}\n\\pagestyle{fancy}\n\\fancyhf{}\n\\fancyhead[R]{Running head}\n\\fancyfoot[C]{\\thepage}\n\\usepackage{lineno}\n\\linenumbers\n\\usepackage{multicol}\n',
               body='\\begin{multicols}{2}\n' + ' '.join(['Words in two columns.'] * 30) + '\n\\end{multicols}')
    page.set_default_timeout(600000)
    r = page.evaluate('''async (t) => { await window.rikuy.api.setSource(t); const r = await window.rikuy.api.compile(); let s = ''; if (r.pdf) for (let i = 0; i < r.pdf.length; i += 8192) s += String.fromCharCode(...r.pdf.subarray(i, i + 8192));
      return { ok: r.ok, pages: r.pages, b64: r.pdf ? btoa(s) : '', pagePages: document.querySelectorAll('#pages > .page').length, head: document.querySelector('#pages .page .hd').textContent }; }''', text)
    page.set_default_timeout(30000)
    if not r['ok']:
        check('the page set up compiles', False, r.get('pages'))
        return
    f = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False); f.write(base64.b64decode(r['b64'])); f.close()
    pdf = PdfReader(f.name)
    mb = pdf.pages[0].mediabox
    w, h = float(mb.width), float(mb.height)
    check('the PDF\'s sheet is A5 landscape (595 by 420 bp), as the page draws it', abs(w - 595.28) < 1 and abs(h - 419.53) < 1, (w, h))
    out = subprocess.run(['pdftotext', '-layout', f.name, '-'], capture_output=True, text=True).stdout
    check('the PDF has the running head on its first page, as the page does', 'Running head' in out.split('\f')[0] and r['head'].startswith('Running head'), out[:200])
    nums = re.findall(r'(?m)^\s*(\d+)\s', out.split('\f')[0])
    check('and the line numbers in the margin (lineno)', len(nums) >= 3 and nums[0] == '1', nums[:6])
    check('the page and the PDF have as many pages', r['pages'] == r['pagePages'], (r['pages'], r['pagePages']))
    # Print: the PDF's pages drawn for the printer, the browser's dialog asked for
    page.evaluate('''() => { window.__printed = 0; window.print = () => { window.__printed = document.querySelectorAll('#print-pdf img').length; window.dispatchEvent(new Event('beforeprint')); }; window.rikuy.noPrintFallback = true; }''')
    page.evaluate('document.getElementById("pages").focus()')
    page.keyboard.press('Control+p')
    page.wait_for_function('window.__printed > 0', timeout=120000)
    check('Ctrl+P prints TeX\'s PDF: its pages drawn for the printer, then the browser\'s print dialog', page.evaluate('window.__printed') == r['pages'] and page.evaluate('document.body.classList.contains("pdf-on")'), page.evaluate('window.__printed'))
    os.unlink(f.name)


def run():
    names = sys.argv[1:]
    with sync_playwright() as p:
        browser, page, errors = open_page(p)
        for f in (margins_size_orientation, breaks, columns, line_numbers_and_more, header_footer, background, page_setup_dialog, agents_and_keys, compile_pdf):
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
