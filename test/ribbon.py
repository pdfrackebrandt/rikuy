"""The ribbon (src/ribbon.js): the row under the bar with the paragraph's style, bold, italic and
underline, lists, the things to insert and the three downloads. Every style and list conversion
and back, with undo restoring the source byte for byte; the pressed and the disabled buttons; each
Insert button; Download LaTeX (.tex for one file, .zip for several) and Word; the mark and the
message for a document with live graphs (sample/widget/); the toolbar by keyboard; the ribbon on a
360px screen. Download PDF runs where dist/tex holds a TeX tree (CI's TeX job) and says why it is
skipped elsewhere; here it checks that a run that cannot start opens the preview with its error.

The Styles gallery: its tiles in their order, the current style checked, the ones that cannot apply
disabled; as many tiles as the row has room for at each width, LaTeX among them on a desktop, the
style list in its place on a phone; the strip's arrows and its More list; the gallery by keyboard;
a click that leaves the caret where it was. Quote and LaTeX there and back, byte for byte. A LaTeX
paragraph (src/styles.js): its box, what typing, Enter, Backspace, Delete, paste and cut write in
it, the lines to come, a blank line that ends it, undo, an unclosed brace that ends at the blank
line, and the same PDF with its marks as without them where dist/tex holds a TeX tree.

RIKUY_DIST names another dist/ (the claude.ai copy, built with RIKUY_SHARE, has the same ribbon)."""
import os, re, sys, zipfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import ROOT, open_page, check, results, src, wait_src, click_text, select_text, load_doc
from playwright.sync_api import sync_playwright

DIST = os.path.abspath(os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist'))
PNG = bytes.fromhex('89504e470d0a1a0a0000000d4948445200000001000000010806000000'
                    '1f15c4890000000d49444154789c6360f8cf00000301010018dd8db00000000049454e44ae426082')
DOC = ('\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n\\section{Opening}\nFirst paragraph here.\n\n'
       'Second paragraph here.\n\nThird paragraph here.\n\n\\begin{itemize}\n  \\item one\n  \\item two\n  \\item three\n\\end{itemize}\n\n'
       '\\begin{tabular}{ll}\ncell & other \\\\\n\\end{tabular}\n\\end{document}\n')
STATE = '''() => { const o = {}; for (const b of document.querySelectorAll('#ribbon select, #ribbon button')) o[b.id] = [b.disabled, b.getAttribute('aria-pressed') === 'true']; o.style = document.getElementById('rb-style').value; return o; }'''


def state(page):
    page.wait_for_timeout(140)   # the ribbon follows the caret a moment later
    return page.evaluate(STATE)


def press(page, bid):
    """A real click on a ribbon button: it must leave the caret on the page."""
    page.click('#' + bid)
    page.wait_for_timeout(120)


def style(page, value):
    """A style by its tile, as a click on it (the list behind More where the tile is not in view;
    the style list on a narrow screen)."""
    if page.is_visible('#rb-style'):
        page.select_option('#rb-style', value)
    elif page.is_visible('#rb-st-' + value):
        page.click('#rb-st-' + value)
    else:
        page.click('#rb-st-more'); page.wait_for_timeout(150)
        page.click('.pop-styles .rb-mi.st-' + value)
    page.wait_for_timeout(150)


def undo_is(page, before):
    page.keyboard.press('Control+z'); page.wait_for_timeout(150)
    return src(page) == before


def styles(page):
    load_doc(page, DOC)
    click_text(page, 'First paragraph', 6)
    check('with the caret in a paragraph the style shows Normal text', state(page)['style'] == 'p')
    for value, cmd in (('section', '\\section'), ('subsection', '\\subsection'), ('subsubsection', '\\subsubsection')):
        load_doc(page, DOC); click_text(page, 'First paragraph', 6)
        style(page, value)
        got = src(page)
        check('Heading: the paragraph becomes %s{...}, its words untouched' % cmd, got == DOC.replace('First paragraph here.', cmd + '{First paragraph here.}') and state(page)['style'] == value, got[got.find('Opening'):][:70])
        page.keyboard.type('X'); wait_src(page, 'First X')
        check('and the caret stays where it was in the words', cmd + '{First Xparagraph here.}' in src(page), src(page)[src(page).find('First'):][:40])
        page.keyboard.press('Control+z'); page.wait_for_timeout(150)
        check('one undo takes the heading back, byte for byte', undo_is(page, DOC))
    # a heading to another level and to a paragraph
    load_doc(page, DOC); click_text(page, 'Opening', 3)
    check('with the caret in a heading the style shows its level', state(page)['style'] == 'section')
    style(page, 'subsection')
    check('Heading 2 on a Heading 1 changes the command alone', src(page) == DOC.replace('\\section{Opening}', '\\subsection{Opening}'), src(page)[60:110])
    check('undo restores it', undo_is(page, DOC))
    click_text(page, 'Opening', 3); style(page, 'p')
    check('Normal text on a heading leaves its words as a paragraph of their own', src(page) == DOC.replace('\\section{Opening}\nFirst', 'Opening\n\nFirst') and state(page)['style'] == 'p', src(page)[60:110])
    check('undo restores the heading byte for byte', undo_is(page, DOC))
    # where a conversion is not safe it is not offered: a list or a table can be shown as its
    # LaTeX source as a whole, and nothing else
    for where, text in (('a list item', 'two'), ('a table cell', 'cell')):
        click_text(page, text, 1); state(page)
        offered = page.evaluate('[...document.getElementById("rb-style").options].filter((o) => !o.hidden && !o.disabled).map((o) => o.value)')
        check('in %s only LaTeX is offered, for the whole of it' % where, sorted(offered) == ['', 'latex'] and page.evaluate('document.getElementById("rb-style").value') == '', offered)
    load_doc(page, '\\documentclass{article}\n\\title{A title}\n\\begin{document}\n\\maketitle\nWords.\n\\end{document}\n')
    click_text(page, 'A title', 2)
    st = state(page)
    check('in the title the style shows Title and stays as it is', st['style'] == 'title' and st['rb-style'][0], st['style'])
    click_text(page, 'Words', 2)
    state(page)
    check('and Title is not offered for a paragraph', page.evaluate('[...document.getElementById("rb-style").options].filter((o) => !o.hidden && !o.disabled).map((o) => o.value)') == ['p', 'section', 'subsection', 'subsubsection', 'latex', 'quote']
          and page.evaluate('[...document.querySelectorAll("#rb-gallery [data-style]")].filter((b) => !b.hidden).map((b) => b.dataset.style)') == ['p', 'section', 'subsection', 'subsubsection', 'latex', 'quote'])
    # a new document: a heading as the first thing
    page.click('#b-new'); page.wait_for_function('window.rikuy.name.startsWith("Untitled") && window.rikuy.ghost', timeout=5000); page.wait_for_timeout(200)
    style(page, 'section'); page.keyboard.type('Intro')
    wait_src(page, '\\section{Intro}')
    check('in a new document Heading 1 starts a heading to type into', '\\section{Intro}' in src(page), src(page))


def letters(page):
    load_doc(page, DOC.replace('First paragraph here.', 'First \\textbf{bold} and \\emph{slanted} words.'))
    click_text(page, 'bold', 2)
    st = state(page)
    check('B shows pressed inside bold words, I and U do not', st['rb-b'][1] and not st['rb-i'][1] and not st['rb-u'][1], st)
    click_text(page, 'slanted', 2)
    st = state(page)
    check('I shows pressed inside italic words', st['rb-i'][1] and not st['rb-b'][1], st)
    before = src(page)
    select_text(page, 'words')
    press(page, 'rb-u')
    check('U underlines the selection and keeps it selected', '\\underline{words}' in src(page) and page.evaluate('getSelection().toString()') == 'words' and state(page)['rb-u'][1], src(page)[src(page).find('slanted'):][:40])
    press(page, 'rb-u')
    check('U again takes the underline off', src(page) == before and not state(page)['rb-u'][1])
    select_text(page, 'First')
    press(page, 'rb-b'); press(page, 'rb-i')
    check('B and I on a selection', '\\emph{\\textbf{First}}' in src(page) or '\\textbf{\\emph{First}}' in src(page), src(page)[src(page).find('Opening'):][:60])
    page.evaluate('document.getElementById("b-src").click()'); page.wait_for_timeout(500)
    page.click('#cmhost'); page.wait_for_timeout(200)
    st = state(page)
    check('with the caret in the source pane the formatting buttons are disabled, the downloads are not', all(st[k][0] for k in ('rb-style', 'rb-b', 'rb-i', 'rb-u', 'rb-ul', 'rb-ol', 'rb-math', 'rb-eq', 'rb-table', 'rb-fn')) and not any(st[k][0] for k in ('rb-pdf', 'rb-word', 'b-save')), st)
    page.evaluate('window.rikuy.toggleSource(false)')


def lists(page):
    load_doc(page, DOC); click_text(page, 'First paragraph', 6)
    press(page, 'rb-ul')
    one = DOC.replace('First paragraph here.', '\\begin{itemize}\n  \\item First paragraph here.\n\\end{itemize}')
    check('Bulleted list: the paragraph becomes the item of a new list', src(page) == one and state(page)['rb-ul'][1], src(page)[src(page).find('Opening'):][:90])
    press(page, 'rb-ol')
    check('Numbered on a bulleted list changes its kind', src(page) == one.replace('itemize}\n  \\item First', 'enumerate}\n  \\item First').replace('here.\n\\end{itemize}', 'here.\n\\end{enumerate}') and state(page)['rb-ol'][1] and not state(page)['rb-ul'][1], src(page)[src(page).find('Opening'):][:90])
    press(page, 'rb-ol')
    check('Numbered again makes the item a paragraph again', src(page) == DOC and not state(page)['rb-ol'][1], src(page)[src(page).find('Opening'):][:90])
    for _ in range(3): page.keyboard.press('Control+z'); page.wait_for_timeout(120)
    check('three undos, one for each press, end at the source as it was', src(page) == DOC)
    # several paragraphs
    page.evaluate('''() => { const sp = [...document.querySelectorAll('#pages span.t')]; const a = sp.find((s) => s.textContent.includes('First paragraph')), z = sp.find((s) => s.textContent.includes('Third paragraph'));
      const r = document.createRange(); r.setStart(a.firstChild, 2); r.setEnd(z.firstChild, 5); document.getElementById('pages').focus(); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }''')
    press(page, 'rb-ol')
    want = DOC.replace('First paragraph here.\n\nSecond paragraph here.\n\nThird paragraph here.', '\\begin{enumerate}\n  \\item First paragraph here.\n\n  \\item Second paragraph here.\n\n  \\item Third paragraph here.\n\\end{enumerate}')
    check('three selected paragraphs become three items of one list', src(page) == want, src(page)[src(page).find('Opening'):][:150])
    check('undo restores them', undo_is(page, DOC))
    # the middle item of a list leaves two lists around a paragraph
    click_text(page, 'two', 1)
    check('in a bulleted list the bullet button shows pressed', state(page)['rb-ul'][1])
    press(page, 'rb-ul')
    want = DOC.replace('  \\item one\n  \\item two\n  \\item three\n', '  \\item one\n\\end{itemize}\n\ntwo\n\n\\begin{itemize}\n  \\item three\n')
    check('the middle item of a list becomes a paragraph between two lists', src(page) == want, src(page)[src(page).find('itemize') - 8:][:120])
    page.keyboard.type('Z'); page.wait_for_timeout(200)
    check('with the caret still in its words', 'tZwo' in src(page), src(page)[src(page).find('one'):][:40])
    page.keyboard.press('Control+z'); page.wait_for_timeout(120)
    check('undo restores the list', undo_is(page, DOC))
    click_text(page, 'cell', 1)
    st = state(page)
    check('in a table cell the list buttons are disabled', st['rb-ul'][0] and st['rb-ol'][0], st)


def inserts(page):
    pops = 'document.querySelectorAll("body > .pop%s").length'
    load_doc(page, DOC); click_text(page, 'Second paragraph', 7)
    press(page, 'rb-math')
    page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000)
    page.evaluate('(v) => { const ta = document.querySelector(".pop-math textarea"); ta.focus(); ta.value = v; ta.dispatchEvent(new Event("input", { bubbles: true })); }', 'a+b')
    page.wait_for_timeout(300); page.focus('.pop-math textarea'); page.keyboard.press('Enter'); page.wait_for_timeout(200)
    check('Formula opens the formula box at the caret', 'Second $a+b$paragraph here.' in src(page), src(page)[src(page).find('Second'):][:40])
    check('undo takes it out', undo_is(page, DOC))
    click_text(page, 'Second paragraph here.', 22)
    press(page, 'rb-eq'); page.wait_for_timeout(300)
    check('Equation puts a numbered equation in and opens its box', '\\begin{equation}' in src(page) and page.evaluate(pops % '.pop-math') == 1)
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    check('given up empty it leaves the source as it was', src(page) == DOC)
    click_text(page, 'Second paragraph', 7)
    press(page, 'rb-table'); page.wait_for_timeout(200)
    # (booktabs' rules and a header row, booktabs loaded with it: B7, test/table.py)
    table = '\\begin{table}[h]\n\\centering\n\\begin{tabular}{ll}\n\\toprule\n &  \\\\\n\\midrule\n &  \\\\\n\\bottomrule\n\\end{tabular}\n\\caption{}\n\\end{table}'
    check('Table puts a two by two table after the paragraph, not inside it', src(page) == DOC.replace('\\usepackage{amsmath}\n', '\\usepackage{amsmath}\n\\usepackage{booktabs}\n').replace('Second paragraph here.\n\n', 'Second paragraph here.\n\n' + table + '\n\n'), src(page)[src(page).find('Second'):][:160])
    page.keyboard.type('A'); page.wait_for_timeout(200)
    check('with the caret in its first cell', '\\toprule\nA &  \\\\' in src(page), src(page)[src(page).find('toprule'):][:30])
    page.keyboard.press('Control+z'); page.wait_for_timeout(120)
    check('undo takes the table out', undo_is(page, DOC))
    click_text(page, 'Second paragraph', 7)
    with page.expect_file_chooser() as fc:
        press(page, 'rb-pic')
    accept = page.evaluate('document.getElementById("picinput").accept')
    fc.value.set_files([{'name': 'plot one.png', 'mimeType': 'image/png', 'buffer': PNG}])
    wait_src(page, 'includegraphics')
    check('Picture asks for a picture file and places it after the paragraph', '.png' in accept and '.tex' not in accept and 'Second paragraph here.\n\n\\begin{center}\n\\includegraphics[width=0.8\\linewidth]{plot-one.png}\n\\end{center}' in src(page) and '\\usepackage{graphicx}' in src(page), src(page)[src(page).find('Second'):][:120])
    check('undo takes the figure and its package out', undo_is(page, DOC))
    click_text(page, 'Second paragraph', 7)
    press(page, 'rb-fn'); page.keyboard.type('note'); page.wait_for_timeout(250)
    check('Footnote starts a footnote at the caret to type into', 'Second \\footnote{note}paragraph here.' in src(page), src(page)[src(page).find('Second'):][:50])
    for _ in range(3): page.keyboard.press('Control+z')
    page.wait_for_timeout(200)
    click_text(page, 'Second paragraph', 7)
    press(page, 'rb-cite'); page.wait_for_timeout(300)
    check('Citation puts a citation in and opens its list', re.search(r'Second \\cite[a-z]*\{\}paragraph', src(page)) and page.evaluate(pops % '.pop-cite') == 1, src(page)[src(page).find('Second'):][:50])
    page.keyboard.press('Escape'); page.wait_for_timeout(150)
    load_doc(page, DOC); click_text(page, 'Second paragraph', 7)
    press(page, 'rb-link'); page.keyboard.type('example.org'); page.wait_for_timeout(250)
    check('Link puts \\url{} in to type the address into', 'Second \\url{example.org}paragraph' in src(page), src(page)[src(page).find('Second'):][:60])
    click_text(page, 'Opening', 3)
    check('in a heading Equation is disabled, Formula is not', state(page)['rb-eq'][0] and not state(page)['rb-math'][0])


def downloads(page):
    load_doc(page, DOC)
    page.evaluate('(() => { const g = window.rikuy; g.assets.clear(); g.assetBlobs.clear(); g.extra.clear(); g.name = "paper"; g.persist(); })()')
    page.wait_for_timeout(200)
    labels = page.evaluate('[...document.querySelectorAll(".rb-dl button")].filter((b) => b.offsetParent).map((b) => b.textContent.trim())')
    check('Download has three buttons with their names: PDF, Word, LaTeX', labels == ['PDF', 'Word', 'LaTeX'] and page.inner_text('.rb-lab') == 'Download', labels)
    with page.expect_download(timeout=15000) as d:
        press(page, 'b-save')
    check('Download LaTeX gives the .tex of a one file document, byte for byte', d.value.suggested_filename == 'main.tex' and open(d.value.path(), encoding='utf8').read() == DOC, d.value.suggested_filename)
    page.evaluate('window.rikuy.files.set("refs.bib", "@misc{x, title={X}}\\n")')
    with page.expect_download(timeout=15000) as d:
        press(page, 'b-save')
    names = sorted(zipfile.ZipFile(d.value.path()).namelist()) if d.value.suggested_filename.endswith('.zip') else []
    check('and a .zip when the project has more files', d.value.suggested_filename == 'paper.zip' and names == ['main.tex', 'refs.bib'], (d.value.suggested_filename, names))
    click_text(page, 'First paragraph', 3)
    with page.expect_download(timeout=15000) as d:
        page.keyboard.press('Control+s')
    check('Ctrl+S still saves', d.value.suggested_filename == 'paper.zip')
    if os.path.isfile(os.path.join(DIST, 'word', 'pandoc.json')):
        with page.expect_download(timeout=180000) as d:
            press(page, 'rb-word')
        docx = zipfile.ZipFile(d.value.path()).namelist()
        check('Download Word gives a .docx', d.value.suggested_filename == 'paper.docx' and 'word/document.xml' in docx, d.value.suggested_filename)
    else:
        press(page, 'rb-word'); page.wait_for_timeout(400)
        check('Download Word on a copy without Word says where Word files are made', 'Word import and export live on the hosted copy' in page.inner_text('#toast'), page.inner_text('#toast'))
    # the PDF
    if os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        with page.expect_download(timeout=600000) as d:
            page.click('#rb-pdf')
            page.wait_for_timeout(300)
            busy = page.evaluate('(() => { const b = document.getElementById("rb-pdf"); return [b.disabled, b.textContent.trim()]; })()')
        head = open(d.value.path(), 'rb').read(5)
        check('Download PDF compiles and gives the PDF in one click, busy meanwhile', d.value.suggested_filename == 'paper.pdf' and head == b'%PDF-' and busy[0] and busy[1] != 'PDF', (d.value.suggested_filename, head, busy))
        with page.expect_download(timeout=30000) as d:
            page.click('#rb-pdf')
        check('and again at once when the text has not changed', d.value.suggested_filename == 'paper.pdf' and not page.evaluate('document.getElementById("rb-pdf").disabled'))
    else:
        print('SKIP Download PDF: no TeX tree in %s (tex/tree.wasm); it runs where dist/tex is built (CI\'s TeX job)' % DIST)
        busy = page.evaluate('(() => { const b = document.getElementById("rb-pdf"); b.click(); const was = [b.disabled, b.textContent.trim()]; b.click(); return was; })()')
        page.wait_for_function('!document.getElementById("rb-pdf").disabled', timeout=60000)
        page.wait_for_timeout(300)
        check('Download PDF is busy while TeX starts and cannot be pressed twice', busy[0] and busy[1] != 'PDF', busy)
        check('a run that fails opens the preview with its error, and the button is itself again', page.evaluate('document.body.classList.contains("pdf-on")') and 'TeX' in page.inner_text('#pdf-status') + page.inner_text('#pdf-host') and page.inner_text('#rb-pdf').strip() == 'PDF', page.inner_text('#pdf-host')[:80])
        page.evaluate('window.rikuy.togglePdf(false)')


def live_graphs(page):
    W = os.path.join(ROOT, 'sample', 'widget')
    read = lambda n, m='r': open(os.path.join(W, n), m, **({} if 'b' in m else {'encoding': 'utf8'})).read()
    load_doc(page, '\\documentclass{article}\n\\begin{document}\nWords.\n% \\rikuywidget{widgets/clt.html}{figures/clt.png} was here\n\\end{document}\n')
    page.evaluate('window.rikuy.persist()'); page.wait_for_timeout(300)
    check('a live graph named only in a comment sets no mark', not page.evaluate('document.getElementById("b-save").classList.contains("live")'), page.evaluate('document.getElementById("b-save").title'))
    check('a document with no live graph has no mark on LaTeX', not page.evaluate('document.getElementById("b-save").classList.contains("live")') and 'live graphs' not in page.evaluate('document.getElementById("b-save").title'))
    load_doc(page, {'main.tex': read('main.tex'), 'rikuy.sty': read('rikuy.sty'), 'widgets/clt.html': read('widgets/clt.html')})
    page.evaluate('(() => { const g = window.rikuy; g.name = "live"; g.persist(); })()')
    page.wait_for_timeout(400)
    mark = page.evaluate('(() => { const b = document.getElementById("b-save"); return [b.classList.contains("live"), b.title, getComputedStyle(b, "::before").width]; })()')
    check('with a live graph the LaTeX button carries a mark and says it keeps the live graphs', mark[0] and 'keeps the live graphs' in mark[1] and mark[2] == '4px', mark)
    note = 'Graphs are pictures in a PDF or Word file. Download LaTeX to keep them live.'
    if os.path.isfile(os.path.join(DIST, 'word', 'pandoc.json')):
        with page.expect_download(timeout=180000) as d:
            press(page, 'rb-word')
        page.wait_for_timeout(300)
        said = page.inner_text('#toast')
        check('Download Word still works there and says what becomes of the graphs, after its own message', d.value.suggested_filename.endswith('.docx') and said.startswith('Saved live.docx') and said.endswith(note), said)
        with page.expect_download(timeout=180000) as d:
            press(page, 'rb-word')
        page.wait_for_timeout(300)
        check('once for a document: the second download does not say it again', note not in page.inner_text('#toast') and 'Saved' in page.inner_text('#toast'), page.inner_text('#toast')[:60])
    else:
        press(page, 'rb-word'); page.wait_for_timeout(400)
        check('on a copy without Word the notice about Word stays, not the one about graphs', 'hosted copy' in page.inner_text('#toast') and page.inner_text('#toast') != note, page.inner_text('#toast')[:80])


def keyboard(page):
    load_doc(page, DOC); select_text(page, 'Second')
    state(page)
    stops = page.evaluate('[...document.querySelectorAll("#ribbon select, #ribbon button")].filter((x) => x.tabIndex === 0).map((x) => x.id)')
    # (the ribbon is the tablist "Ribbon" over one toolbar per tab, named after it; Home's groups in Word's order: Font, Paragraph, Styles, Insert)
    bar = page.evaluate('(() => { const t = document.querySelector("#rp-home > [role=toolbar]"); return [document.getElementById("rb-tabs").getAttribute("role"), document.getElementById("rb-tabs").getAttribute("aria-label"), t && t.getAttribute("aria-label")]; })()')
    check('the ribbon\'s open tab is a toolbar with one tab stop', bar == ['tablist', 'Ribbon', 'Home'] and stops == ['rb-b'], (bar, stops))
    page.focus('#rb-st-p')
    seen = []
    for key in ('ArrowRight', 'ArrowLeft', 'ArrowLeft', 'End', 'Home', 'ArrowRight'):
        page.keyboard.press(key); seen.append(page.evaluate('document.activeElement.id'))
    # (left of the gallery, Paragraph's last control that applies to a paragraph: Multilevel list, B3)
    check('arrows, Home and End move between its controls (the strip\'s disabled arrows skipped)', seen == ['rb-st-section', 'rb-st-p', 'rb-ml', 'b-save', 'rb-b', 'rb-i'], seen)
    page.focus('#rb-i'); page.keyboard.press('ArrowLeft')
    ring = page.evaluate('(() => { const c = getComputedStyle(document.activeElement); return c.outlineStyle !== "none" && parseFloat(c.outlineWidth) > 0; })()')
    page.keyboard.press('Enter'); page.wait_for_timeout(200)
    check('the focus shows, and Enter on Bold makes the words selected on the page bold', ring and '\\textbf{Second}' in src(page), src(page)[src(page).find('Second') - 8:][:30])
    check('every control names itself and its shortcut in a title', page.evaluate('[...document.querySelectorAll("#ribbon select, #ribbon button")].every((x) => x.title.length > 3)') and 'Ctrl+B' in page.evaluate('document.getElementById("rb-b").title') and 'Ctrl+Shift+E' in page.evaluate('document.getElementById("rb-eq").title'))


def narrow(page):
    for w in (360, 390, 430, 820):
        page.set_viewport_size({'width': w, 'height': 800}); page.wait_for_timeout(300)
        m = page.evaluate('''() => { const r = document.getElementById('ribbon'), b = r.getBoundingClientRect(), d = document.querySelector('.rb-dl button span');
          return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, h: Math.round(b.height), scrolls: r.scrollWidth > r.clientWidth, right: Math.round(b.right), w: innerWidth, label: getComputedStyle(d).display }; }''')
        check('at %dpx the ribbon is one row inside the screen and scrolls sideways when it is longer' % w, m['page'] <= 0 and m['h'] <= 44 and m['right'] <= m['w'] and (m['scrolls'] or w > 700) and m['label'] != 'none', m)
    page.set_viewport_size({'width': 390, 'height': 800}); page.wait_for_timeout(300)
    page.click('#b-nav'); page.wait_for_timeout(200)
    acts = page.evaluate('[...document.querySelectorAll("#nav-acts .nav-act")].map((a) => a.textContent.trim())')
    check('the downloads are first in the menu panel too', acts[:3] == ['Download PDF', 'Download Word', 'Download LaTeX'], acts[:4])
    page.evaluate('window.rikuy.toggleNav(false)')
    page.set_viewport_size({'width': 1400, 'height': 1000}); page.wait_for_timeout(200)


def top_bar(page):
    ids = page.evaluate('[...document.querySelectorAll("#bar .tools button:not(.ai-only)")].map((b) => b.id)')
    check('the top bar keeps Open, Preview, Share, undo and redo, zoom, Source and Help', ids == ['b-open', 'b-pdf', 'b-share', 'b-undo', 'b-redo', 'b-zout', 'zoomv', 'b-zin', 'b-src', 'b-help'] and page.inner_text('#b-pdf').strip() == 'Preview', ids)
    page.evaluate('window.rikuy.toggleSource(true)'); page.wait_for_timeout(500)
    page.context.grant_permissions(['clipboard-read', 'clipboard-write'])
    page.click('#b-copy'); page.wait_for_timeout(300)
    check('Copy source is in the source pane\'s head and copies the source', page.evaluate('!!document.querySelector("#srcpane #b-copy")') and 'Copied' in page.inner_text('#toast'), page.inner_text('#toast'))
    page.evaluate('window.rikuy.toggleSource(false)')
    page.click('#b-help'); page.wait_for_timeout(200)
    check('Help says what the row of buttons and Download do', 'Download gives you the paper as a PDF, as a Word file or as LaTeX' in page.inner_text('.pop-help'))
    page.keyboard.press('Escape')


def one_save(page):
    """One press, one file: on the ribbon, from the menu panel, and with Ctrl+S in the source pane."""
    load_doc(page, DOC)
    page.evaluate('(() => { const g = window.rikuy; g.assets.clear(); g.assetBlobs.clear(); g.extra.clear(); g.name = "paper"; g.persist(); })()')
    got = []
    page.on('download', lambda d: got.append(d.suggested_filename))

    def count(do):
        got.clear(); do(); page.wait_for_timeout(1200)
        return list(got)
    check('one click on Download LaTeX saves one file', count(lambda: page.click('#b-save')) == ['main.tex'], got)
    page.set_viewport_size({'width': 390, 'height': 800}); page.wait_for_timeout(300)
    page.click('#b-nav'); page.wait_for_timeout(200)
    check('Download LaTeX in the menu panel saves one file', count(lambda: page.click('#nav-acts [data-for=b-save]')) == ['main.tex'], got)
    page.set_viewport_size({'width': 1400, 'height': 1000}); page.wait_for_timeout(300)
    page.evaluate('window.rikuy.toggleSource(true)'); page.wait_for_timeout(600)
    page.click('#cmhost .CodeMirror-lines'); page.wait_for_timeout(150)
    check('Ctrl+S in the source pane saves one file', count(lambda: page.keyboard.press('Control+s')) == ['main.tex'], got)
    click_text(page, 'First paragraph', 3)
    check('Ctrl+S on the page saves one file', count(lambda: page.keyboard.press('Control+s')) == ['main.tex'], got)
    page.evaluate('window.rikuy.toggleSource(false)')


def where_it_applies(page):
    """What a button can do depends on where the caret is: in a cell, a caption, a footnote or
    bold words an equation or a footnote cannot be written; the row never takes the caret away."""
    doc = ('\\documentclass{article}\n\\begin{document}\n\\section{Opening}\nPlain words and \\textbf{bold words} here.\\footnote{A note below.}\n\n'
           'Second paragraph here.\n\n\\begin{table}[h]\n\\begin{tabular}{ll}\ncell & other \\\\\n\\end{tabular}\n\\caption{The caption.}\n\\end{table}\n\\end{document}\n')
    load_doc(page, doc)
    for where, text, off, on in (('a table cell', 'cell', ('rb-eq', 'rb-fn'), ('rb-table', 'rb-pic', 'rb-math')), ('a caption', 'The caption', ('rb-eq', 'rb-fn'), ('rb-table', 'rb-pic')),
                                 ('a footnote', 'A note below', ('rb-eq', 'rb-fn'), ('rb-pic', 'rb-math')), ('bold words', 'bold words', ('rb-eq',), ('rb-fn', 'rb-math')),
                                 ('a heading', 'Opening', ('rb-eq', 'rb-fn'), ('rb-math',)), ('a paragraph', 'Second paragraph', (), ('rb-eq', 'rb-fn', 'rb-table', 'rb-pic'))):
        click_text(page, text, 2)
        st = state(page)
        check('in %s: %s' % (where, ', '.join([b[3:] + ' off' for b in off] + [b[3:] + ' on' for b in on])), all(st[b][0] for b in off) and not any(st[b][0] for b in on), {b: st[b][0] for b in off + on})
    page.evaluate("""() => { const sp = [...document.querySelectorAll('#pages span.t')]; const a = sp.find((s) => s.textContent.includes('Plain words')), z = sp.find((s) => s.textContent.includes('Second paragraph'));
      const r = document.createRange(); r.setStart(a.firstChild, 2); r.setEnd(z.firstChild, 5); document.getElementById('pages').focus(); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
    check('with a selection over two paragraphs the style cannot be changed', state(page)['rb-style'][0])
    # the row keeps the caret: a click on a disabled button, on the Download label, on empty space
    # (at 1600 px, where the label shows whatever Home holds)
    page.set_viewport_size({'width': 1600, 'height': 1000}); page.wait_for_timeout(300)
    click_text(page, 'cell', 2); state(page)
    for what, sel in (('a disabled button', '#rb-eq'), ('the Download label', '.rb-lab'), ('the empty part of the row', '#ribbon .rb-panel:not([hidden]) .grow')):
        r = page.evaluate('(s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }', sel)
        page.mouse.click(*r); page.wait_for_timeout(100)
        page.keyboard.type('Q'); page.wait_for_timeout(150)
        ok = 'ceQll' in src(page)
        page.keyboard.press('Control+z'); page.wait_for_timeout(120)
        check('a click on %s leaves the caret on the page' % what, ok and page.evaluate('document.activeElement.id') == 'pages')
        click_text(page, 'cell', 2); state(page)
    page.set_viewport_size({'width': 1400, 'height': 1000}); page.wait_for_timeout(300)
    # the style list gives the focus back: typing after it goes to the page, not into the list
    # (the list is what a narrower window has in the gallery's place)
    page.set_viewport_size({'width': 820, 'height': 900}); page.wait_for_timeout(300)
    click_text(page, 'Second paragraph', 7); state(page)
    page.focus('#rb-style'); page.keyboard.press('Escape'); page.wait_for_timeout(100)
    check('Escape in the style list returns to the page', page.evaluate('document.activeElement.id') == 'pages')
    page.focus('#rb-style'); page.keyboard.type('Hello'); page.wait_for_timeout(250)
    check('typing with the style list focused types on the page and picks no heading', 'Second Helloparagraph here.' in src(page) and '\\section{Second' not in src(page) and src(page).count('\\section') == 1, src(page)[src(page).find('Second') - 12:][:50])
    style(page, 'section'); page.keyboard.type('X'); page.wait_for_timeout(200)
    check('after a style is picked the caret is back in the words', page.evaluate('document.activeElement.id') == 'pages' and 'X' in src(page)[src(page).find('\\section{Second'):][:40], src(page)[src(page).find('Second') - 12:][:50])
    page.set_viewport_size({'width': 1400, 'height': 1000}); page.wait_for_timeout(300)


def list_edges(page):
    """A list item made a paragraph again keeps clear of its neighbours, keeps the list's own
    setup with the items that stay, and never leaves a list with no item; a comment at a
    paragraph's end does not swallow a heading's closing brace."""
    wrap = lambda body: '\\documentclass{article}\n\\begin{document}\n' + body + '\n\\end{document}\n'
    tight = 'Before.\n\\begin{itemize}\n  \\item one\n  \\item two\n\\end{itemize}\nAfter.'
    load_doc(page, wrap(tight)); click_text(page, 'one', 1); press(page, 'rb-ul')
    check('the first item of a list with no blank line before it becomes a paragraph of its own', src(page) == wrap('Before.\n\none\n\n\\begin{itemize}\n  \\item two\n\\end{itemize}\nAfter.'), src(page)[40:])
    check('undo restores it byte for byte', undo_is(page, wrap(tight)))
    click_text(page, 'two', 1); press(page, 'rb-ul')
    check('the last item of a list with no blank line after it does not join the next paragraph', src(page) == wrap('Before.\n\\begin{itemize}\n  \\item one\n\\end{itemize}\n\ntwo\n\nAfter.'), src(page)[40:])
    load_doc(page, wrap('Before.\n\\begin{itemize}\n  \\item only\n\\end{itemize}\nAfter.')); click_text(page, 'only', 1); press(page, 'rb-ul')
    check('the only item of such a list becomes a paragraph between the two', src(page) == wrap('Before.\n\nonly\n\nAfter.'), src(page)[40:])
    setup = '\\begin{itemize}\n\\setlength\\itemsep{0pt}\n  \\item one\n  \\item two\n\\end{itemize}'
    load_doc(page, wrap(setup)); click_text(page, 'one', 1); press(page, 'rb-ul')
    check('with setup lines before the first item, the list that keeps items keeps them, and none is left without an item', src(page) == wrap('one\n\n\\begin{itemize}\n  \\setlength\\itemsep{0pt}\n  \\item two\n\\end{itemize}'), src(page)[40:])
    check('undo restores it', undo_is(page, wrap(setup)))
    click_text(page, 'two', 1); press(page, 'rb-ul')
    check('the same from the last item', src(page) == wrap('\\begin{itemize}\n  \\setlength\\itemsep{0pt}\n  \\item one\n\\end{itemize}\n\ntwo'), src(page)[40:])
    load_doc(page, wrap('\\begin{itemize}\n  \\item[a)] one\n  \\item[b)] two\n\\end{itemize}')); click_text(page, 'two', 1)
    st = state(page)
    # (task 29 left it open; task 41: the label stays as the paragraph's first words, test/lists.py)
    check('an item with a label of its own is offered the way back to a paragraph, its bullet pressed', not st['rb-ul'][0] and st['rb-ul'][1] and not st['rb-ol'][0], (st['rb-ul'], st['rb-ol']))
    # a paragraph that starts with a bracket: \item would read it as the item's label
    para = '[Draft] words to keep.'
    load_doc(page, wrap(para)); click_text(page, 'words to keep', 2); press(page, 'rb-ul')
    shown = page.evaluate('[...document.querySelectorAll("#pages .it")].map((e) => e.textContent).join("|")')
    check('a paragraph starting with a bracket keeps the bracket as text in its item', src(page) == wrap('\\begin{itemize}\n  \\item {}[Draft] words to keep.\n\\end{itemize}') and '[Draft] words to keep.' in shown, (src(page)[40:], shown))
    press(page, 'rb-ul')
    check('and is the same paragraph again after the way back', src(page) == wrap(para), src(page)[40:])
    # a comment at the paragraph's end: \\% is a line break and then a comment, \% is the sign
    for label, para, want in (('after a line break (\\\\%)', 'alpha and gamma\\\\% hidden', '\\section{alpha and gamma\\\\% hidden\n}'), ('(a plain one)', 'alpha % hidden', '\\section{alpha % hidden\n}'),
                              ('(none: \\% is the sign)', 'alpha 50\\% done', '\\section{alpha 50\\% done}')):
        load_doc(page, wrap(para)); click_text(page, 'alpha', 2); style(page, 'section')
        check('Heading on a paragraph ending in a comment %s closes its brace outside the comment' % label, src(page) == wrap(want) and page.evaluate('document.querySelectorAll("#pages .it.h").length') == 1, src(page)[40:])
        check('undo restores it', undo_is(page, wrap(para)))
    load_doc(page, wrap('alpha and gamma\\\\% hidden')); click_text(page, 'alpha', 2); press(page, 'rb-ol')
    check('a list from that paragraph ends on a line of its own', src(page) == wrap('\\begin{enumerate}\n  \\item alpha and gamma\\\\% hidden\n\\end{enumerate}'), src(page)[40:])


def insert_edges(page):
    """Footnote, Citation and Link leave nothing behind when they are given up empty, and the
    undo history is as before the press; a footnote goes after selected words, not around them;
    the Picture dialog takes pictures only."""
    hist = lambda: page.evaluate('[window.rikuy.hist.length, window.rikuy.redoStack.length]')
    away = lambda: (click_text(page, 'Third paragraph', 3), page.wait_for_timeout(250))
    load_doc(page, DOC); click_text(page, 'First paragraph', 2); page.keyboard.type('Q'); page.wait_for_timeout(2200)
    base, h0 = src(page), hist()
    select_text(page, 'Second'); press(page, 'rb-fn')
    check('Footnote with words selected puts an empty footnote after them and leaves the words', src(page) == base.replace('Second paragraph', 'Second\\footnote{} paragraph'), src(page)[src(page).find('Second'):][:40])
    page.keyboard.type('n'); page.wait_for_timeout(200)
    check('with the caret in it', 'Second\\footnote{n} paragraph' in src(page), src(page)[src(page).find('Second'):][:40])
    page.keyboard.press('Control+z'); page.keyboard.press('Control+z'); page.wait_for_timeout(200)
    h0 = hist()   # (with the two steps just undone waiting to be redone)
    for name, bid, cmd in (('Footnote', 'rb-fn', '\\footnote{}'), ('Link', 'rb-link', '\\url{}')):
        click_text(page, 'Second paragraph', 7); press(page, bid)
        put = cmd in src(page)
        away()
        check('%s left empty goes again when the caret leaves it, and undo is as it was before' % name, put and src(page) == base and hist() == h0, (src(page)[src(page).find('Second'):][:40], hist(), h0))
    click_text(page, 'Second paragraph', 7); press(page, 'rb-cite'); page.wait_for_timeout(300)
    put = re.search(r'\\cite[a-z]*\{\}', src(page)) and page.evaluate('document.querySelectorAll("body > .pop.pop-cite").length') == 1
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    check('Citation closed with nothing picked leaves no empty citation, and undo is as it was before', put and src(page) == base and hist() == h0 and page.evaluate('document.querySelectorAll("#pages .a-cite").length') == 0, (src(page)[src(page).find('Second'):][:40], hist(), h0))
    page.keyboard.press('Control+z'); page.wait_for_timeout(200)
    check('so the next undo takes back the typing before it', 'Q' not in src(page)[src(page).find('Opening'):][:30] and '\\cite' not in src(page) and '\\footnote' not in src(page))
    # Link in a new, empty document: the caret is in the braces
    page.click('#b-new'); page.wait_for_function('window.rikuy.name.startsWith("Untitled") && window.rikuy.ghost', timeout=5000); page.wait_for_timeout(200)
    press(page, 'rb-link'); page.keyboard.type('example.org'); page.wait_for_timeout(250)
    check('Link in an empty document puts the caret between its braces', '\\url{example.org}' in src(page), src(page)[60:])
    # the Picture dialog takes pictures: a .tex picked there is not opened as a project
    load_doc(page, DOC); click_text(page, 'Second paragraph', 7)
    with page.expect_file_chooser() as fc:
        press(page, 'rb-pic')
    fc.value.set_files([{'name': 'other.tex', 'mimeType': 'text/plain', 'buffer': b'\\documentclass{article}\n\\begin{document}\nAnother paper.\n\\end{document}\n'}])
    page.wait_for_timeout(500)
    check('a .tex picked in the Picture dialog is refused in plain words, and the document stays', src(page) == DOC and page.evaluate('window.rikuy.main') == 'main.tex' and 'other.tex' in page.inner_text('#toast') and 'picture' in page.inner_text('#toast').lower(), page.inner_text('#toast'))
    click_text(page, 'Second paragraph', 7)
    with page.expect_file_chooser() as fc:
        press(page, 'rb-pic')
    fc.value.set_files([{'name': 'notes.txt', 'mimeType': 'text/plain', 'buffer': b'notes'}, {'name': 'fig.png', 'mimeType': 'image/png', 'buffer': PNG}])
    wait_src(page, 'includegraphics')
    check('with a picture among them, the picture is placed and the other file named as left out', '{fig.png}' in src(page) and not page.evaluate('window.rikuy.files.has("notes.txt")') and 'notes.txt' in page.inner_text('#toast'), page.inner_text('#toast'))


def downloads_in_sight(page):
    """The downloads stay at the right end of the row at every width, the other buttons scrolling
    under a soft edge beside them; below 861 px where the row has no room for the three, and on a
    phone, they are one Download button with the three choices."""
    load_doc(page, DOC)
    IN = """(ids) => { const r = document.getElementById('ribbon'); r.scrollLeft = 0; return ids.map((id) => { const e = document.getElementById(id), b = e.getBoundingClientRect(), rr = r.getBoundingClientRect();
      const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return b.width > 0 && b.left >= rr.left - 1 && b.right <= innerWidth + 1 && !!top && (top === e || e.contains(top)); }); }"""
    for w in (820, 860, 1000):
        page.set_viewport_size({'width': w, 'height': 800}); page.wait_for_timeout(300)
        # (above 860 px the three where the row has room for them, else the one button: Home's
        # Paragraph group with the list commands leaves 1000 px without room for three)
        three = w > 860 and page.evaluate("!!document.getElementById('rb-pdf').offsetParent")
        seen = page.evaluate(IN, ['rb-pdf', 'rb-word', 'b-save'] if three else ['rb-dl-menu'])
        over = page.evaluate('(() => { const r = document.getElementById("ribbon"); return r.scrollWidth > r.clientWidth + 1; })()')
        if w > 860:
            check('at %dpx the downloads (PDF, Word and LaTeX, or the one Download button) are in sight with the row not scrolled' % w, all(seen) and not over, (seen, over))
        else:
            # (the tabs' list at the row's start left no room for the three: Footnote, Citation and Link went under them)
            check('at %dpx, with no room for the three, one Download button is in sight and the row does not scroll: every button to insert is on the screen' % w, all(seen) and not over, (seen, over))
        clear = page.evaluate("""() => { const r = document.getElementById('ribbon'); r.scrollLeft = r.scrollWidth; const a = document.getElementById('rb-link').getBoundingClientRect(), d = document.querySelector('.rb-dl').getBoundingClientRect(); r.scrollLeft = 0; return a.right <= d.left + 1; }""")
        check('and scrolled to its end, the last button to insert is clear of them', clear)
    for w in (360, 390, 430):
        page.set_viewport_size({'width': w, 'height': 800}); page.wait_for_timeout(300)
        seen = page.evaluate(IN, ['rb-dl-menu'])
        m = page.evaluate('(() => { const r = document.getElementById("ribbon"), b = r.getBoundingClientRect(); return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, h: Math.round(b.height), label: document.getElementById("rb-dl-menu").textContent.trim(), room: Math.round(document.querySelector(".rb-dl").getBoundingClientRect().left) }; })()')
        check('at %dpx one Download button is in sight at the row\'s end, with room for the other buttons' % w, all(seen) and m['label'] == 'Download' and m['page'] <= 0 and m['h'] <= 44 and m['room'] >= 200, (seen, m))
    page.set_viewport_size({'width': 390, 'height': 800}); page.wait_for_timeout(300)
    page.evaluate('(() => { const g = window.rikuy; g.assets.clear(); g.assetBlobs.clear(); g.extra.clear(); g.name = "paper"; g.persist(); })()')
    click_text(page, 'First paragraph', 3)
    page.click('#rb-dl-menu'); page.wait_for_timeout(300)
    items = page.evaluate('[...document.querySelectorAll("body > .pop.pop-dl button.nav-act")].map((b) => b.textContent.trim())')
    check('it opens the three choices by name', items == ['PDF', 'Word', 'LaTeX'], items)
    got = []
    page.on('download', lambda d: got.append(d.suggested_filename))
    page.click('body > .pop.pop-dl button.nav-act >> nth=2'); page.wait_for_timeout(1200)
    check('and LaTeX there saves the file, once', got == ['main.tex'] and page.evaluate('document.querySelectorAll("body > .pop").length') == 0, got)
    page.set_viewport_size({'width': 1400, 'height': 1000}); page.wait_for_timeout(200)
    check('a wide screen shows the three buttons and no Download button', not page.is_visible('#rb-dl-menu') and page.is_visible('#rb-pdf') and page.is_visible('#b-save'))


def bold_across(page):
    """Bold over a selection that runs across paragraphs wraps each paragraph's part: one command
    around both took the blank line between them inside its braces, which TeX refuses."""
    SEL = """([a, i, z, j]) => { const sp = [...document.querySelectorAll('#pages span.t')]; const A = sp.find((s) => s.textContent.includes(a)), Z = sp.find((s) => s.textContent.includes(z));
      const r = document.createRange(); r.setStart(A.firstChild, A.textContent.indexOf(a) + i); r.setEnd(Z.firstChild, Z.textContent.indexOf(z) + j); document.getElementById('pages').focus(); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }"""
    load_doc(page, DOC)
    page.evaluate(SEL, ['First paragraph', 6, 'Third paragraph', 5]); page.wait_for_timeout(100)
    press(page, 'rb-b')
    want = DOC.replace('First paragraph here.\n\nSecond paragraph here.\n\nThird paragraph', 'First \\textbf{paragraph here.}\n\n\\textbf{Second paragraph here.}\n\n\\textbf{Third} paragraph')
    check('B over three paragraphs wraps the part of each, and they stay three paragraphs', src(page) == want and page.evaluate('document.querySelectorAll("#pages .it.p").length') >= 3, src(page)[src(page).find('First'):][:120])
    check('one undo takes all of it back, byte for byte', undo_is(page, DOC))
    page.evaluate(SEL, ['First paragraph', 6, 'Second paragraph', 6]); page.wait_for_timeout(100)
    page.keyboard.press('Control+i'); page.wait_for_timeout(200)
    check('the same for Ctrl+I', src(page) == DOC.replace('First paragraph here.\n\nSecond paragraph', 'First \\emph{paragraph here.}\n\n\\emph{Second} paragraph'), src(page)[src(page).find('First'):][:90])
    check('and its undo', undo_is(page, DOC))


TILES = '() => [...document.querySelectorAll("#rb-gallery [data-style]")].filter((b) => !b.hidden).map((b) => b.dataset.style + (b.getAttribute("aria-pressed") === "true" ? "*" : "") + (b.getAttribute("aria-disabled") === "true" ? "-" : ""))'
WRAP = lambda body: '\\documentclass{article}\n\\begin{document}\n' + body + '\n\\end{document}\n'


def body(page):
    t = src(page)
    return t[t.index('\\begin{document}\n') + 17:t.index('\n\\end{document}')]


def boxes(page):
    """The LaTeX paragraphs on the page, by their text (a box split over two pages counts once)."""
    return page.evaluate('[...new Set([...document.querySelectorAll("#pages .it.tex:not(.ghostp)")].map((e) => e.dataset.b))].map((b) => [...document.querySelectorAll(`#pages .it.tex[data-b="${b}"]`)].map((e) => e.textContent).join(""))')


def gallery(page):
    """The Styles gallery: Word's look and behaviour, with Rikuy's styles."""
    load_doc(page, DOC); click_text(page, 'First paragraph', 6)
    st = state(page)
    tiles = page.evaluate(TILES)
    check('the gallery shows Normal, Heading 1 to 3, LaTeX and Quote in that order, Normal checked', tiles == ['p*', 'section', 'subsection', 'subsubsection', 'latex', 'quote'], tiles)
    look = page.evaluate("""() => { const g = document.getElementById('rb-gallery'), f = (id) => getComputedStyle(document.querySelector('#' + id + ' > span'));
      const cap = document.querySelector('.rb-cap'), cr = cap.getBoundingClientRect(), gr = g.getBoundingClientRect();
      return { role: g.getAttribute('role'), name: g.getAttribute('aria-label'), border: getComputedStyle(g).borderTopStyle, cap: cap.textContent, under: cr.top >= gr.bottom - 1 && cr.left >= gr.left && cr.right <= gr.right,
        normal: f('rb-st-p').fontFamily.includes('Paper Modern Serif') && f('rb-st-p').fontWeight === '400', h1: f('rb-st-section').fontWeight === '700', h1big: parseFloat(f('rb-st-section').fontSize) > parseFloat(f('rb-st-subsubsection').fontSize),
        quote: f('rb-st-quote').fontStyle === 'italic', a: getComputedStyle(document.querySelector('#rb-st-latex .tl-a')).textTransform, e: getComputedStyle(document.querySelector('#rb-st-latex .tl-e')).top,
        clip: [...document.querySelectorAll('#rb-gallery [data-style]:not([hidden]) > span')].filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.textContent),
        pressed: getComputedStyle(document.getElementById('rb-st-p')).borderTopColor !== getComputedStyle(document.getElementById('rb-st-section')).borderTopColor }; }""")
    check('one bordered group named Styles, its name under it, each tile its name in its own look, the LaTeX logo in its letters, nothing cut off', look['role'] == 'group' and look['name'] == 'Styles' and look['border'] == 'solid'
          and look['cap'] == 'Styles' and look['under'] and look['normal'] and look['h1'] and look['h1big'] and look['quote'] and look['a'] == 'uppercase' and look['e'] not in ('0px', 'auto') and not look['clip'] and look['pressed'], look)
    check('all six apply to a paragraph, the strip\'s arrows have nothing to page to, More is there', not any(t.endswith('-') for t in tiles) and st['rb-st-up'][0] and st['rb-st-down'][0] and not st['rb-st-more'][0], st)
    # a click on a tile: the caret stays where it was in the words
    page.click('#rb-st-section'); page.wait_for_timeout(150)
    check('Heading 1 by its tile: the paragraph becomes \\section{...}, the tile checked', src(page) == DOC.replace('First paragraph here.', '\\section{First paragraph here.}') and page.evaluate(TILES)[1] == 'section*', page.evaluate(TILES))
    page.keyboard.type('X'); page.wait_for_timeout(150)
    check('the click left the caret on the page, where it was', page.evaluate('document.activeElement.id') == 'pages' and '\\section{First Xparagraph here.}' in src(page), src(page)[60:120])
    page.keyboard.press('Control+z'); page.wait_for_timeout(150)
    page.click('#rb-st-p'); page.wait_for_timeout(150)
    check('Normal on it: the paragraph again, byte for byte', src(page) == DOC and page.evaluate(TILES)[0] == 'p*', src(page)[60:120])
    page.keyboard.press('Control+z'); page.wait_for_timeout(150)
    check('one undo for each click', src(page) == DOC.replace('First paragraph here.', '\\section{First paragraph here.}'))
    page.keyboard.press('Control+z'); page.wait_for_timeout(150)
    check('and the next one back to the start', src(page) == DOC)
    # where the caret is decides what is checked and what applies
    click_text(page, 'Opening', 2); state(page)
    check('in a heading its level is checked', page.evaluate(TILES)[1] == 'section*', page.evaluate(TILES))
    click_text(page, 'two', 1); state(page)
    t = page.evaluate(TILES)
    check('in a list nothing is checked and only LaTeX applies (the list as its source)', t == ['p-', 'section-', 'subsection-', 'subsubsection-', 'latex', 'quote-'], t)
    click_text(page, 'cell', 1); state(page)
    t = page.evaluate(TILES)
    check('in a table the same', t == ['p-', 'section-', 'subsection-', 'subsubsection-', 'latex', 'quote-'], t)
    # More: the whole list, in its looks
    click_text(page, 'Second paragraph', 3); state(page)
    page.click('#rb-st-more'); page.wait_for_timeout(200)
    menu = page.evaluate("""() => { const m = document.querySelector('body > .pop.pop-styles'); if (!m) return null;
      return { role: m.getAttribute('role'), name: m.getAttribute('aria-label'), text: [...m.childNodes].filter((x) => x.nodeType === 3 || !x.matches('[role=menuitemradio]')).length, items: [...m.querySelectorAll('[role=menuitemradio]')].map((x) => x.getAttribute('aria-label') + (x.getAttribute('aria-checked') === 'true' ? '*' : '')),
        focus: document.activeElement.getAttribute('aria-label'), expanded: document.getElementById('rb-st-more').getAttribute('aria-expanded'), looks: [...m.querySelectorAll('.rb-mi > span')].map((x) => getComputedStyle(x).fontWeight) }; }""")
    check('More opens a menu "Styles" of every style in order and nothing else, the current one checked and focused', menu and menu['role'] == 'menu' and menu['name'] == 'Styles' and menu['text'] == 0 and menu['items'] == ['Normal*', 'Heading 1', 'Heading 2', 'Heading 3', 'LaTeX source', 'Quote']
          and menu['focus'] == 'Normal' and menu['expanded'] == 'true' and menu['looks'][1] == '700', menu)
    page.keyboard.press('ArrowDown'); page.keyboard.press('ArrowDown'); page.keyboard.press('Enter'); page.wait_for_timeout(200)
    check('the arrows and Enter pick Heading 2 there, and the menu closes', src(page) == DOC.replace('Second paragraph here.', '\\subsection{Second paragraph here.}') and page.evaluate('document.querySelectorAll("body > .pop").length') == 0
          and page.evaluate('document.getElementById("rb-st-more").getAttribute("aria-expanded")') == 'false', src(page)[60:160])
    page.keyboard.type('Y'); page.wait_for_timeout(150)
    check('with the caret back in the words', '\\subsection{SecYond paragraph here.}' in src(page), src(page)[60:160])
    page.click('#rb-st-more'); page.wait_for_timeout(150); page.keyboard.press('Escape'); page.wait_for_timeout(150)
    check('Escape closes it and gives the focus back to More', page.evaluate('document.querySelectorAll("body > .pop").length') == 0 and page.evaluate('document.activeElement.id') == 'rb-st-more')
    # the title: a seventh style, and the arrows page
    load_doc(page, '\\documentclass{article}\n\\title{A title}\n\\begin{document}\n\\maketitle\nWords.\n\\end{document}\n')
    click_text(page, 'A title', 2)
    st = state(page)
    t = page.evaluate(TILES)
    check('in the title the Title tile shows, checked, and nothing applies there', t == ['p-', 'title*-', 'section-', 'subsection-', 'subsubsection-', 'latex-'] and not st['rb-st-down'][0], (t, st['rb-st-down']))
    page.click('#rb-st-down'); page.wait_for_timeout(100)
    t2 = page.evaluate(TILES)
    page.click('#rb-st-up'); page.wait_for_timeout(100)
    check('the next arrow pages to the last six (a full page, with Quote), the previous one back', t2 == ['title*-', 'section-', 'subsection-', 'subsubsection-', 'latex-', 'quote-'] and page.evaluate(TILES) == t and page.evaluate('getSelection().anchorNode.parentNode.closest(".ttl") !== null'), t2)
    look = page.evaluate('(() => { const b = document.getElementById("rb-st-title"), s = getComputedStyle(b.firstElementChild); return [b.getAttribute("aria-pressed"), b.getAttribute("aria-disabled"), s.opacity, getComputedStyle(b).backgroundColor !== "rgba(0, 0, 0, 0)"]; })()')
    check('the pressed Title tile, which cannot change here, looks pressed and not faded', look == ['true', 'true', '1', True], look)
    # a new document: LaTeX and Quote wait for the first character
    for v, want in (('latex', '% rikuy: latex\n\\alpha$x'), ('quote', '\\begin{quote}\nSaid.\n\\end{quote}')):
        page.click('#b-new'); page.wait_for_function('window.rikuy.name.startsWith("Untitled") && window.rikuy.ghost', timeout=5000); page.wait_for_timeout(200)
        page.click('#rb-st-' + v); page.wait_for_timeout(100)
        looks = page.evaluate('[...window.rikuy.ghost.el.classList]')
        page.keyboard.type('\\alpha$x' if v == 'latex' else 'Said.'); page.wait_for_timeout(250)
        check('in a new document %s sets the blank paragraph, and what is typed goes in %s' % (v, 'as LaTeX, \\ and $ as they are' if v == 'latex' else 'a quote'), want in src(page) and (v == 'latex') == ('tex' in looks)
              and page.evaluate('document.querySelectorAll("body > .pop").length') == 0, (src(page)[-80:], looks))


def gallery_widths(page):
    """As many tiles as the row has room for, once the insert buttons' names have gone (they take no
    control away, a tile does: ribbonFit); LaTeX always in sight; the list where three tiles do
    not fit and on phones; one row height."""
    load_doc(page, DOC)
    seen = {}
    for w in (1920, 1600, 1536, 1440, 1366, 1300, 1280, 1180, 1100, 1024, 1000, 900, 820, 390):
        page.set_viewport_size({'width': w, 'height': 900}); page.wait_for_timeout(250)
        click_text(page, 'First paragraph', 2); page.wait_for_timeout(120)
        seen[w] = page.evaluate("""() => { const r = document.getElementById('ribbon'), sel = document.getElementById('rb-style');
          const tiles = [...document.querySelectorAll('#rb-gallery [data-style]')].filter((b) => !b.hidden && b.offsetParent).map((b) => b.dataset.style);
          const lab = document.querySelector('#rb-math span'); return { tiles, list: !!sel.offsetParent, opts: [...sel.options].filter((o) => !o.hidden).map((o) => o.value), over: r.scrollWidth > r.clientWidth + 1,
            names: !!lab && getComputedStyle(lab).display !== 'none', h: Math.round(r.getBoundingClientRect().height), page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            arrows: !!document.getElementById('rb-st-up').offsetParent }; }""")
    print('     widths:', {w: (len(v['tiles']), 'list' if v['list'] else '', 'names' if v['names'] else '', v['h']) for w, v in seen.items()})
    six = ['p', 'section', 'subsection', 'subsubsection', 'latex', 'quote']
    check('at 1920 px all six tiles with the insert buttons\' names, no paging arrows, a row that does not scroll', seen[1920]['tiles'] == six and seen[1920]['names'] and not seen[1920]['arrows'] and not seen[1920]['over'], seen[1920])
    # (Home's Paragraph group has the list commands, B3: the tiles give way from 1440 px, the list from 1100)
    check('from 1600 to 1536 px the insert buttons\' names go first and the gallery keeps its six tiles, no paging arrows, no scroll', all(seen[w]['tiles'] == six and not seen[w]['names'] and not seen[w]['arrows'] and not seen[w]['over'] for w in (1536, 1600)), {w: (seen[w]['tiles'], seen[w]['names']) for w in (1536, 1600)})
    check('then fewer tiles, LaTeX among them, with the paging arrows (1440 to 1180 px)', all('latex' in seen[w]['tiles'] and 3 <= len(seen[w]['tiles']) < 6 and seen[w]['arrows'] and not seen[w]['over'] for w in (1440, 1366, 1300, 1280, 1180)), {w: seen[w]['tiles'] for w in (1440, 1366, 1300, 1280, 1180)})
    order = {3: ['p', 'section', 'latex'], 4: ['p', 'section', 'subsection', 'latex'], 5: ['p', 'section', 'subsection', 'subsubsection', 'latex'], 6: six}
    tiled = [w for w in seen if seen[w]['tiles']]
    check('wherever the gallery shows, its first page is Normal and Heading 1 with LaTeX in sight (Normal, Heading 1, LaTeX for three), and the row does not scroll', all(seen[w]['tiles'] == order[len(seen[w]['tiles'])] and not seen[w]['over'] for w in tiled), {w: seen[w]['tiles'] for w in tiled})
    # (where the gallery gives way to the list: between 1100 and 1024 px since Home has its Editing
    # group, between 1024 and 1000 px before)
    g = min(w for w in seen if seen[w]['tiles'])
    l = max(w for w in seen if seen[w]['list'] and w < g)
    check('the row is as tall with the list as with the gallery (no jump where the one gives way to the other, %d and %d px)' % (g, l), g >= 1024 and l >= 1000 and seen[g]['h'] == seen[l]['h'], (g, l, seen[g]['h'], seen[l]['h']))
    check('narrower, the style list takes the gallery\'s place, with LaTeX and Quote', all(seen[w]['list'] and not seen[w]['tiles'] and seen[w]['opts'] == six for w in (900, 820, 390)) and seen[390]['page'] <= 0 and seen[390]['h'] <= 44, {w: seen[w] for w in (820, 390)})
    page.set_viewport_size({'width': 390, 'height': 800}); page.wait_for_timeout(300)
    click_text(page, 'Second paragraph', 3); state(page)
    style(page, 'latex')
    check('on a phone the list makes a LaTeX paragraph too', body(page).count('% rikuy: latex\nSecond paragraph here.') == 1 and boxes(page) == ['Second paragraph here.'], body(page)[:120])
    page.set_viewport_size({'width': 1400, 'height': 1000}); page.wait_for_timeout(300)


def gallery_paging(page):
    """Paging keeps the gallery's width, so nothing moves under the mouse; the last page is full;
    the arrows hand the focus on at their ends; the gallery pages to the caret's style; the strip's
    targets are 24 px or more; a tile that cannot apply keeps its tooltip, which says why."""
    load_doc(page, WRAP('Text here.\n\n\\subsubsection{Deep}\nUnder it.'))
    page.set_viewport_size({'width': 1440, 'height': 900}); page.wait_for_timeout(300)
    click_text(page, 'Text here', 2); state(page)
    POS = """() => { const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return [Math.round(b.left), Math.round(b.width), Math.round(b.height)]; };
      return { up: r('rb-st-up'), down: r('rb-st-down'), more: r('rb-st-more'), bold: r('rb-b'), gal: r('rb-gallery'), tiles: [...document.querySelectorAll('#rb-gallery [data-style]')].filter((b) => !b.hidden).map((b) => b.dataset.style) }; }"""
    a = page.evaluate(POS)
    page.click('#rb-st-down'); page.wait_for_timeout(120)
    b = page.evaluate(POS)
    check('at 1440 px Next shows the last four styles (a full page) and the gallery, the arrows and Bold stay where they were', len(a['tiles']) == 4 and b['tiles'] == ['subsection', 'latex', 'subsubsection', 'quote'] and all(a[k] == b[k] for k in ('up', 'down', 'more', 'bold', 'gal')), (a, b))
    check('the arrows and More are 24 px wide or more and as tall as the box', all(a[k][1] >= 24 and a[k][2] >= 24 for k in ('up', 'down', 'more')), a)
    page.click('#rb-st-up'); page.wait_for_timeout(120)
    # by keyboard: an arrow that reaches its end gives the focus to the other one
    page.focus('#rb-st-down'); page.keyboard.press('Enter'); page.wait_for_timeout(120)
    f1 = page.evaluate('document.activeElement.id')
    page.keyboard.press(' '); page.wait_for_timeout(120)
    f2 = page.evaluate('document.activeElement.id')
    stops = page.evaluate('[...document.querySelectorAll("#ribbon button, #ribbon select")].filter((x) => x.tabIndex === 0).map((x) => x.id)')
    check('Enter on Next at the last page hands the focus to Previous, Space there back to Next, and the one tab stop follows', f1 == 'rb-st-up' and f2 == 'rb-st-down' and stops == ['rb-st-down'], (f1, f2, stops))
    page.keyboard.press('Escape'); page.wait_for_timeout(120)
    check('Escape on a button of the gallery goes back to the caret on the page', page.evaluate('document.activeElement.id') == 'pages')
    # the caret in a Heading 3: its tile comes into view, pressed
    click_text(page, 'Deep', 2); state(page)
    t = page.evaluate(TILES)
    check('with the caret in a Heading 3 the gallery pages to its tile', 'subsubsection*' in t, t)
    click_text(page, 'Text here', 2); state(page)
    check('and back in a paragraph to Normal\'s', page.evaluate(TILES)[0] == 'p*', page.evaluate(TILES))
    # a tile that cannot apply: no click goes through, the pointer still reaches it, its title says why
    click_text(page, 'Under it', 2); state(page)
    load_doc(page, WRAP('Words with a note\\footnote{n}.')); click_text(page, 'Words', 2); state(page)
    info = page.evaluate('(() => { const b = document.getElementById("rb-st-section"); return [b.getAttribute("aria-disabled"), getComputedStyle(b).pointerEvents, b.title]; })()')
    before = src(page)
    page.set_viewport_size({'width': 1920, 'height': 900}); page.wait_for_timeout(300); click_text(page, 'Words', 2); state(page)
    page.click('#rb-st-section', force=True); page.wait_for_timeout(150)
    check('a heading cannot hold a footnote: Heading 1 is marked so, its tooltip says why, and a click on it changes nothing', info[0] == 'true' and info[1] != 'none' and 'footnote' in info[2] and src(page) == before, info)
    page.set_viewport_size({'width': 1400, 'height': 1000}); page.wait_for_timeout(300)


def gallery_keys(page):
    """The gallery from the keyboard: its tiles and the strip are members of the toolbar."""
    load_doc(page, DOC); click_text(page, 'Third paragraph', 3); state(page)
    page.focus('#rb-st-p')
    seen = []
    for key in ('ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight'):
        page.keyboard.press(key); seen.append(page.evaluate('document.activeElement.id'))
    check('the arrow keys go along the tiles, past the strip\'s disabled arrows to More, and on to Formula', seen == ['rb-st-section', 'rb-st-subsection', 'rb-st-subsubsection', 'rb-st-latex', 'rb-st-quote', 'rb-st-more', 'rb-math'], seen)
    page.focus('#rb-st-latex'); page.keyboard.press('Enter'); page.wait_for_timeout(200)
    check('Enter on LaTeX makes the caret\'s paragraph a LaTeX paragraph', body(page).count('% rikuy: latex\nThird paragraph here.') == 1 and boxes(page) == ['Third paragraph here.'], body(page))
    page.focus('#rb-st-quote'); page.keyboard.press(' '); page.wait_for_timeout(200)
    check('and Space on Quote a quote of what it holds (one paragraph of text)', '\\begin{quote}\nThird paragraph here.\n\\end{quote}' in src(page) and 'rikuy: latex' not in src(page), body(page))
    page.focus('#rb-st-quote')
    check('the ring shows on the focused tile', page.evaluate('(() => { const c = getComputedStyle(document.activeElement); return c.outlineStyle !== "none" && parseFloat(c.outlineWidth) > 0; })()'))
    page.keyboard.press('Enter'); page.wait_for_timeout(150)
    check('Enter on the tile that is already pressed changes nothing and gives the focus back to the page', page.evaluate('document.activeElement.id') == 'pages' and '\\begin{quote}\nThird' in src(page))
    page.focus('#rb-st-more'); page.keyboard.press('ArrowDown'); page.wait_for_timeout(200)
    opened = page.evaluate('[!!document.querySelector("body > .pop.pop-styles"), document.activeElement.getAttribute("aria-label")]')
    page.keyboard.press('Home'); page.keyboard.press('ArrowUp'); page.wait_for_timeout(80)
    up = page.evaluate('document.activeElement.getAttribute("aria-label")')
    page.keyboard.press('Escape'); page.wait_for_timeout(120)
    check('ArrowDown on More opens the menu at the current style; ArrowUp from its first item goes round to Quote, not to a Close item', opened == [True, 'Quote'] and up == 'Quote', (opened, up))


def quote_style(page):
    """Quote: a quote environment around the paragraph and away again, byte for byte."""
    for text, para in (('a plain paragraph', 'Second paragraph here.'),):
        load_doc(page, DOC); click_text(page, 'Second paragraph', 6)
        style(page, 'quote')
        q = DOC.replace(para, '\\begin{quote}\n' + para + '\n\\end{quote}')
        check('Quote on %s puts a quote environment around it, its words untouched, the tile checked' % text, src(page) == q and page.evaluate(TILES)[-1] == 'quote*', src(page)[60:170])
        page.keyboard.type('Q'); page.wait_for_timeout(150)
        check('with the caret still in its words', 'SecondQ paragraph' in src(page))
        page.keyboard.press('Control+z'); page.wait_for_timeout(150)
        style(page, 'p')
        check('Normal takes it away, back to the source as it was', src(page) == DOC, src(page)[60:170])
        page.keyboard.press('Control+z'); page.wait_for_timeout(150)
        check('one undo for each', src(page) == q)
        style(page, 'subsection')
        check('Heading 2 on a quote: the environment goes, the heading comes, in one step', src(page) == DOC.replace(para, '\\subsection{' + para + '}'), src(page)[60:170])
        style(page, 'quote')
        check('and a quote again from the heading', src(page) == q, src(page)[60:170])
    # one written by hand, with no blank line around it: Normal keeps its paragraph apart
    tight = WRAP('Before.\n\\begin{quotation}\n  Said here.\n\\end{quotation}\nAfter.')
    load_doc(page, tight); click_text(page, 'Said', 2); state(page)
    check('a quotation shows as Quote', page.evaluate(TILES)[-1] == 'quote*', page.evaluate(TILES))
    style(page, 'p')
    check('Normal on one with no blank line around it leaves a paragraph of its own', src(page) == WRAP('Before.\n\nSaid here.\n\nAfter.'), body(page))
    load_doc(page, WRAP('\\begin{quote}\nOne.\n\nTwo.\n\\end{quote}')); click_text(page, 'Two', 1); state(page)
    t = page.evaluate(TILES)
    check('a quote of two paragraphs shows as Quote and is changed only as a whole (LaTeX)', t == ['p-', 'section-', 'subsection-', 'subsubsection-', 'latex', 'quote*'], t)


def latex_style(page):
    """LaTeX as a style: the mark alone goes in and out, and what can be one."""
    load_doc(page, DOC); click_text(page, 'Second paragraph', 6)
    style(page, 'latex')
    marked = DOC.replace('Second paragraph here.', '% rikuy: latex\nSecond paragraph here.')
    check('LaTeX on a paragraph writes the mark\'s line before it and nothing else', src(page) == marked, body(page)[:120])
    box = page.evaluate("""() => { const b = document.querySelector('#pages .it.tex'); if (!b) return null; const c = getComputedStyle(b), h = getComputedStyle(b, '::before');
      return { text: b.textContent, font: c.fontFamily, ws: c.whiteSpace, head: h.content, role: b.getAttribute('role'), desc: b.getAttribute('aria-roledescription'), dir: b.dir, spell: b.spellcheck, cur: b.classList.contains('cur') }; }""")
    check('the paragraph shows as its source in a monospace box headed LaTeX, the caret\'s box marked', box and box['text'] == 'Second paragraph here.' and 'Typewriter' in box['font'] and box['ws'] == 'pre-wrap' and 'LaTeX' in box['head']
          and box['role'] == 'paragraph' and box['desc'] == 'LaTeX paragraph' and box['dir'] == 'ltr' and box['spell'] is False and box['cur'], box)
    check('the LaTeX tile is checked; Normal, the headings and Quote may take it back', page.evaluate(TILES) == ['p', 'section', 'subsection', 'subsubsection', 'latex*', 'quote'], page.evaluate(TILES))
    page.keyboard.type('Z'); page.wait_for_timeout(150)
    check('the caret stayed where it was, now in the box', 'SecondZ paragraph' in src(page), body(page)[:80])
    page.keyboard.press('Control+z'); page.wait_for_timeout(150)
    style(page, 'p')
    check('Normal takes the mark\'s line out and nothing else', src(page) == DOC, body(page)[:120])
    page.keyboard.press('Control+z'); page.wait_for_timeout(150)
    check('undo puts it back in one step', src(page) == marked)
    page.keyboard.press('Control+z'); page.wait_for_timeout(150)
    check('and the next undo leaves the source as it was', src(page) == DOC)
    # LaTeX on other blocks: a heading with its label, a list, a table, a display
    doc = WRAP('\\section{Opening}\\label{s:o}\nText.\n\n\\begin{itemize}\n  \\item one\n\\end{itemize}\n\n\\[ x^2 \\]\nAfter it.\n\n\\section{Close}\n\\label{s:c}\n\nEnd.')
    load_doc(page, doc)
    for what, text, ok in (('a list', 'one', True), ('a heading followed by text on the next line', 'Opening', False), ('a heading with its label on the next line', 'Close', True)):
        click_text(page, text, 1); state(page)
        t = page.evaluate(TILES)
        check('LaTeX applies to %s: %s' % (what, ok), ('latex' in t) == ok, t)
    click_text(page, 'one', 1); style(page, 'latex')
    check('a list made LaTeX shows as its source, environment and all', boxes(page) == ['\\begin{itemize}\n  \\item one\n\\end{itemize}'] and src(page) == doc.replace('\\begin{itemize}', '% rikuy: latex\n\\begin{itemize}'), boxes(page))
    click_text(page, 'Close', 1); style(page, 'latex')
    check('a heading made LaTeX takes its label line with it', '\\section{Close}\n\\label{s:c}' in boxes(page), boxes(page))
    style(page, 'p')
    check('and Normal gives the heading back, number and all', page.evaluate('[...document.querySelectorAll("#pages .it.h")].map((e) => e.textContent)') == ['1Opening', '2Close'], src(page)[-60:])
    # what a LaTeX paragraph holds decides where it can go back to
    load_doc(page, WRAP('% rikuy: latex\nWords with a footnote\\footnote{here}.\n\n% rikuy: latex\n\\begin{center}\nx\n\\end{center}'))
    click_text(page, 'footnote', 2); state(page)
    t1 = page.evaluate(TILES)
    click_text(page, 'center', 2); state(page)
    t2 = page.evaluate(TILES)
    check('from LaTeX: one paragraph with a footnote may become Normal or Quote, not a heading; an environment only Normal', t1 == ['p', 'section-', 'subsection-', 'subsubsection-', 'latex*', 'quote'] and t2 == ['p', 'section-', 'subsection-', 'subsubsection-', 'latex*', 'quote-'], (t1, t2))


def latex_typing(page):
    """Typing in a LaTeX paragraph writes LaTeX; Enter, Backspace and Delete keep it one paragraph."""
    doc = WRAP('Before it.\n\n% rikuy: latex\nalpha line\n  beta line\n\nAfter it.')
    load_doc(page, doc); click_text(page, 'alpha', 5)
    page.keyboard.type(' $\\x_{1}$ 50% & #~ "q" -- <b>'); page.wait_for_timeout(250)
    check('what is typed in the box is written as it is: \\ $ % & # ~ " -- and markup', 'alpha $\\x_{1}$ 50% & #~ "q" -- <b> line' in src(page) and page.evaluate('document.querySelectorAll("body > .pop").length') == 0, body(page))
    check('and shows as text, never as markup', page.evaluate('document.querySelectorAll("#pages .it.tex b").length') == 0 and '<b> line' in boxes(page)[0], boxes(page))
    page.keyboard.press('Control+z'); page.wait_for_timeout(200)
    check('one undo takes the typing back', src(page) == doc, body(page))
    # Enter in the middle of a line: a line break with the line's indent
    click_text(page, 'beta', 2); page.keyboard.press('Enter'); page.wait_for_timeout(200)
    check('Enter in a line breaks it, the new line indented as it was, and the paragraph stays one box', '  be\n  ta line' in src(page) and len(boxes(page)) == 1, body(page))
    page.keyboard.press('Control+z'); page.wait_for_timeout(200)
    # Enter at a line's end: a line to come, written with its first character
    click_text(page, 'alpha line', 10); page.keyboard.press('Enter'); page.wait_for_timeout(200)
    shown = page.evaluate('[!!window.rikuy.ghost && window.rikuy.ghost.tex, document.querySelector("#pages .it.tex").textContent]')
    check('Enter at the end of a line shows an empty line under it, and writes nothing yet', shown[0] == 'after' and shown[1].startswith('alpha line\n\u200b\n  beta') and src(page) == doc, (shown, body(page)))
    page.keyboard.type('  gamma'); page.wait_for_timeout(200)
    check('typing there writes the line, spaces first', 'alpha line\n  gamma\n  beta line' in src(page) and len(boxes(page)) == 1, body(page))
    page.keyboard.press('Control+z'); page.wait_for_timeout(200)
    # at the end of the box: Enter, Enter leaves it for a paragraph of text
    click_text(page, 'beta line', 9); page.keyboard.press('Enter'); page.keyboard.type('x'); page.wait_for_timeout(200)
    check('Enter at its end and typing adds a line to the paragraph', '  beta line\nx\n\nAfter it.' in src(page) and len(boxes(page)) == 1, body(page))
    page.keyboard.press('Enter'); page.wait_for_timeout(150); page.keyboard.press('Enter'); page.wait_for_timeout(150)
    page.keyboard.type('New text.'); page.wait_for_timeout(200)
    check('Enter twice at its end is the blank line that ends it: what is typed next is a paragraph of text after it', '  beta line\nx\n\nNew text.\n\nAfter it.' in src(page) and len(boxes(page)) == 1
          and 'New text.' in page.evaluate('[...document.querySelectorAll("#pages .it.p")].map((e) => e.textContent).join("|")'), body(page))
    load_doc(page, doc)
    # Enter twice between two lines: two LaTeX paragraphs, as TeX reads a blank line
    click_text(page, 'alpha line', 10); page.keyboard.press('Enter'); page.keyboard.press('Enter'); page.wait_for_timeout(200)
    check('Enter twice between its lines makes two LaTeX paragraphs, the rest keeping its style', body(page) == 'Before it.\n\n% rikuy: latex\nalpha line\n\n% rikuy: latex\n  beta line\n\nAfter it.' and boxes(page) == ['alpha line', '  beta line'], body(page))
    page.keyboard.type('Q'); page.wait_for_timeout(150)
    check('with the caret at the start of the second', '% rikuy: latex\nQ  beta line' in src(page), body(page))
    page.keyboard.press('Control+z'); page.keyboard.press('Control+z'); page.wait_for_timeout(250)
    check('two undos, and it is one paragraph again', src(page) == doc, body(page))
    # Backspace and Delete
    load_doc(page, WRAP('Before it.\n\n% rikuy: latex\nalpha line\nz\n  beta line\n\nAfter it.'))
    click_text(page, 'z', 1); page.keyboard.press('Backspace'); page.wait_for_timeout(200)
    check('Backspace on a line\'s last character leaves the line empty on the page, never as a blank line in the source', body(page) == 'Before it.\n\n% rikuy: latex\nalpha line\n  beta line\n\nAfter it.'
          and page.evaluate('!!window.rikuy.ghost && window.rikuy.ghost.tex') == 'after' and len(boxes(page)) == 1, body(page))
    page.keyboard.press('Backspace'); page.keyboard.type('W'); page.wait_for_timeout(200)
    check('Backspace again takes the empty line, and the caret is at the end of the line before', 'alpha lineW\n  beta line' in src(page), body(page))
    load_doc(page, doc); click_text(page, 'alpha', 0); page.keyboard.press('Backspace'); page.wait_for_timeout(200)
    check('Backspace at the start of the box takes its LaTeX style off: the mark\'s line goes', src(page) == doc.replace('% rikuy: latex\n', '') and boxes(page) == [], body(page))
    page.keyboard.press('Control+z'); page.wait_for_timeout(200)
    click_text(page, 'beta line', 9); page.keyboard.press('Delete'); page.wait_for_timeout(200)
    check('Delete at its end brings the next paragraph in, on a line of its own', body(page) == 'Before it.\n\n% rikuy: latex\nalpha line\n  beta line\nAfter it.' and boxes(page) == ['alpha line\n  beta line\nAfter it.'], body(page))
    load_doc(page, doc); click_text(page, 'Before it.', 10); page.keyboard.press('Delete'); page.wait_for_timeout(200)
    check('Delete at the end of the paragraph before it joins it to that paragraph, as text: the mark goes', 'rikuy' not in src(page) and boxes(page) == [], body(page))
    # all of it deleted: the box goes with its mark, and a blank LaTeX paragraph takes the caret
    load_doc(page, doc)
    page.evaluate("""() => { const b = document.querySelector('#pages .it.tex span.t'); const r = document.createRange(); r.selectNodeContents(b); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }""")
    page.keyboard.press('Backspace'); page.wait_for_timeout(200)
    g = page.evaluate('window.rikuy.ghost && [window.rikuy.ghost.style, [...window.rikuy.ghost.el.classList].includes("tex")]')
    check('deleting all of it takes the mark too, and leaves a blank LaTeX paragraph with the caret', body(page) == 'Before it.\n\nAfter it.' and g == ['latex', True], (body(page), g))
    page.keyboard.type('\\new'); page.wait_for_timeout(200)
    check('typing there makes it again', body(page) == 'Before it.\n\n% rikuy: latex\n\\new\n\nAfter it.', body(page))
    # an unclosed brace while typing: the paragraph still ends at its blank line
    load_doc(page, doc); click_text(page, 'beta line', 9)
    page.keyboard.type(' \\textbf{'); page.wait_for_timeout(200)
    check('a brace typed and not yet closed keeps the box to its own lines; the paragraph after stays text', boxes(page) == ['alpha line\n  beta line \\textbf{'] and page.evaluate('[...document.querySelectorAll("#pages .it.p")].map((e) => e.textContent)') == ['Before it.', 'After it.'], (boxes(page), body(page)))
    page.keyboard.type('b}'); page.wait_for_timeout(200)
    check('and once closed all is as it was, with the bold command in the box', boxes(page) == ['alpha line\n  beta line \\textbf{b}'], boxes(page))
    # in and out with the arrow keys
    load_doc(page, doc); click_text(page, 'Before it.', 3)
    page.keyboard.press('ArrowDown'); page.wait_for_timeout(120)
    a = page.evaluate('!!window.rikuy.texHere()')
    page.keyboard.press('ArrowDown'); page.keyboard.press('ArrowDown'); page.wait_for_timeout(120)
    b = page.evaluate('[!!window.rikuy.texHere(), getSelection().anchorNode.parentNode.textContent]')
    check('the arrow keys go into the box and out of it', a and not b[0] and 'After' in b[1], (a, b))


def latex_after_ghost(page):
    """After a line to come, the caret and the selection go where they are put: a click, a double
    click and the arrow keys in the same box act there, not at the box's start or end (the text
    split around the line to come was put together in a way that moved them)."""
    doc = WRAP('Before it.\n\n% rikuy: latex\nalpha line\n  beta line\n  gamma line\n\nAfter it.')
    AT = """([w, o]) => { const s = [...document.querySelectorAll('#pages span.t')].find((s) => s.textContent.includes(w)); const n = s.firstChild, i = n.data.indexOf(w) + o;
      const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); const b = r.getBoundingClientRect(); return [b.left + 1, b.top + b.height / 2]; }"""
    def ghost_under_beta():
        load_doc(page, doc); click_text(page, 'beta line', 9); page.keyboard.press('Enter'); page.wait_for_timeout(150)
        return page.evaluate('!!window.rikuy.ghost && window.rikuy.ghost.tex') == 'after'
    for what, word, off, act, want in (('a click after the line to come, then typing', 'gamma', 2, 'Z', '  gaZmma line'), ('a click before it, then typing', 'alpha', 2, 'Z', 'alZpha line'),
                                       ('a double click on a word after it, then typing', 'gamma', 2, 'W', '  W line'), ('a double click on a word before it, then Backspace', 'alpha', 2, 'Backspace', '% rikuy: latex\n line\n')):
        ok = ghost_under_beta()
        x, y = page.evaluate(AT, [word, off])
        (page.mouse.dblclick if 'double' in what else page.mouse.click)(x, y); page.wait_for_timeout(250)
        page.keyboard.press(act) if act == 'Backspace' else page.keyboard.type(act)
        page.wait_for_timeout(200)
        check('after a line to come: %s acts where it was put' % what, ok and want in src(page) and len(boxes(page)) == 1, body(page))
    load_doc(page, doc); click_text(page, 'alpha line', 10); page.keyboard.press('Enter'); page.keyboard.press('ArrowDown'); page.wait_for_timeout(150)
    page.keyboard.type('Z'); page.wait_for_timeout(200)
    check('after a line to come: ArrowDown and typing write in the next line', 'gamma lineZ' not in src(page) and 'Z' in body(page).split('alpha line')[1].split('gamma')[0], body(page))
    load_doc(page, WRAP('Before it.\n\n% rikuy: latex\nalpha line\nz\n  beta line\n\nAfter it.'))
    click_text(page, 'z', 1); page.keyboard.press('Backspace'); page.wait_for_timeout(150)
    x, y = page.evaluate(AT, ['beta', 2]); page.mouse.click(x, y); page.wait_for_timeout(250)
    page.keyboard.type('Z'); page.wait_for_timeout(200)
    check('after Backspace empties a line, a click in the next line and typing write there', '  beZta line' in src(page), body(page))


def latex_edges(page):
    """What would leave a blank line in a LaTeX paragraph by accident does not: line breaks at the
    ends of what is pasted; a mark under a line of text stays where it is when Enter starts a
    paragraph after that line. Ctrl+Shift+E writes nothing in a box; a blank paragraph set to Quote
    keeps the quote for a formula and for the insert list; text typed over a selection that ends in
    a box lands there as source."""
    doc = WRAP('Before it.\n\n% rikuy: latex\nalpha line\n  beta line\n\nAfter it.')
    PASTE = """(t) => { const d = new DataTransfer(); d.setData('text/plain', t); document.getElementById('pages').dispatchEvent(new ClipboardEvent('paste', { clipboardData: d, bubbles: true, cancelable: true })); }"""
    one = lambda: len(boxes(page)) == 1 and 'alpha' in boxes(page)[0] and 'beta line' in boxes(page)[0] and '\n\n' not in boxes(page)[0]
    for what, prep, text in (('"\\nfoo" at the box\'s start', lambda: click_text(page, 'alpha', 0), '\nfoo'), ('"\\n" at the start of its second line', lambda: click_text(page, '  beta', 0), '\n'),
                             ('"foo\\n" on a line to come after a line', lambda: (click_text(page, 'alpha line', 10), page.keyboard.press('Enter')), 'foo\n'),
                             ('"foo\\n" on a line to come before a line', lambda: (click_text(page, '  beta', 0), page.keyboard.press('Enter')), 'foo\n'),
                             ('"\\nfoo" on a line to come', lambda: (click_text(page, 'alpha line', 10), page.keyboard.press('Enter')), '\nfoo')):
        load_doc(page, doc); prep(); page.wait_for_timeout(120)
        page.evaluate(PASTE, text); page.wait_for_timeout(250)
        check('paste %s writes no blank line: one LaTeX paragraph still holds all its lines' % what, one() and ('foo' in boxes(page)[0] or text == '\n'), (body(page), boxes(page)))
    load_doc(page, doc); click_text(page, 'alpha line', 10)
    page.evaluate(PASTE, 'one\n\ntwo'); page.wait_for_timeout(250)
    check('a blank line inside what is pasted stays: it was meant (TeX ends the paragraph there)', 'alpha lineone\n\ntwo\n  beta line' in src(page), body(page))
    load_doc(page, WRAP('Before it.')); click_text(page, 'Before it.', 10); page.keyboard.press('Enter'); page.wait_for_timeout(120)
    page.click('#rb-st-latex'); page.wait_for_timeout(120)
    page.evaluate(PASTE, '\n\\alpha x\n'); page.wait_for_timeout(250)
    check('a blank paragraph set to LaTeX, paste "\\n\\alpha x\\n": a LaTeX paragraph of it, the mark marking it', boxes(page) == ['\\alpha x'] and '% rikuy: latex\n\\alpha x' in src(page), body(page))
    # a mark written by hand right under a line of text: TeX reads one paragraph, and so does the page
    hand = WRAP('Before it.\n% rikuy: latex\nalpha \\x\n\nAfter it.')
    load_doc(page, hand)
    one_para = page.evaluate('[...document.querySelectorAll("#pages .it")].map((e) => e.className.includes("tex") ? "tex" : e.textContent.trim())')
    click_text(page, 'Before it.', 10); page.keyboard.press('Enter'); page.wait_for_timeout(250)
    check('a mark under a line of text is a comment in that paragraph (no box); Enter there splits the paragraph, and the mark starts the second part', 'tex' not in one_para and one_para[0] == 'Before it. alpha \\x' and boxes(page) == ['alpha \\x'] and src(page) == hand.replace('Before it.\n', 'Before it.\n\n\n'), (one_para, body(page)))
    # under a heading: Enter at its end puts the new paragraph before the mark, not between the mark and its paragraph
    under = WRAP('\\section{A}\n% rikuy: latex\nalpha \\x\n\nAfter it.')
    load_doc(page, under); click_text(page, 'A', 1); page.keyboard.press('Enter'); page.wait_for_timeout(120); page.keyboard.type('New'); page.wait_for_timeout(250)
    check('Enter at the end of a heading with a LaTeX paragraph right under it: the new paragraph goes before the mark', src(page) == under.replace('\\section{A}\n', '\\section{A}\n\nNew\n\n') and boxes(page) == ['alpha \\x'], body(page))
    # Ctrl+Shift+E in a box
    load_doc(page, doc); click_text(page, 'alpha', 3); page.keyboard.press('Control+Shift+E'); page.wait_for_timeout(300)
    check('Ctrl+Shift+E in a LaTeX paragraph writes nothing (Equation is off there)', src(page) == doc and page.evaluate('document.querySelectorAll("body > .pop").length') == 0, body(page))
    page.keyboard.press('Escape')
    # a blank paragraph set to Quote: $ and the insert list
    load_doc(page, WRAP('Before it.')); click_text(page, 'Before it.', 10); page.keyboard.press('Enter'); page.wait_for_timeout(120)
    page.click('#rb-st-quote'); page.wait_for_timeout(120)
    page.keyboard.type('$'); page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000)
    page.evaluate('(v) => { const ta = document.querySelector(".pop-math textarea"); ta.focus(); ta.value = v; ta.dispatchEvent(new Event("input", { bubbles: true })); }', 'x^2')
    page.wait_for_timeout(300); page.focus('.pop-math textarea'); page.keyboard.press('Enter'); page.wait_for_timeout(250)
    check('a blank paragraph set to Quote keeps the quote for a formula started with $', '\\begin{quote}\n$x^2$\n\\end{quote}' in src(page), body(page))
    load_doc(page, WRAP('Before it.')); click_text(page, 'Before it.', 10); page.keyboard.press('Enter'); page.wait_for_timeout(120)
    page.click('#rb-st-quote'); page.wait_for_timeout(120)
    page.keyboard.type('\\'); page.wait_for_timeout(250); page.keyboard.type('emph'); page.wait_for_timeout(150); page.keyboard.press('Enter'); page.wait_for_timeout(250)
    check('and for what the insert list (\\) puts in', '\\begin{quote}\n\\emph{' in src(page) and src(page).count('\\end{quote}') == 1, body(page))
    # typing over a selection from a paragraph into a box: the text lands in the box, as source
    load_doc(page, doc)
    page.evaluate("""() => { const sp = [...document.querySelectorAll('#pages span.t')]; const a = sp.find((s) => s.textContent.includes('alpha line')), z = sp.find((s) => s.textContent.includes('After it'));
      const r = document.createRange(); r.setStart(a.firstChild, a.textContent.indexOf('line')); r.setEnd(z.firstChild, 5); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }""")
    page.keyboard.type('$\\x'); page.wait_for_timeout(250)
    check('typing over a selection that starts in a box writes the text there as source ($ and \\ as they are)', 'alpha $\\x' in src(page) and '\\textbackslash' not in src(page) and '\\$' not in src(page), body(page))


def latex_clipboard(page):
    """Copy, cut and paste in a LaTeX paragraph: its source, as it is."""
    doc = WRAP('Some $x$ text.\n\n% rikuy: latex\nalpha \\beta{} gamma\n\nAfter.')
    load_doc(page, doc)
    page.context.grant_permissions(['clipboard-read', 'clipboard-write'])
    select_text(page, '\\beta{}')
    page.keyboard.press('Control+c'); page.wait_for_timeout(150)
    check('copy in the box gives its source', page.evaluate('window.rikuy.lastCopy.latex') == '\\beta{}' and page.evaluate('window.rikuy.lastCopy.plain') == '\\beta{}')
    page.keyboard.press('Control+x'); page.wait_for_timeout(200)
    check('cut takes exactly that out', 'alpha  gamma' in src(page), body(page))
    click_text(page, 'gamma', 5)
    page.evaluate("""(t) => { const d = new DataTransfer(); d.setData('text/plain', t); document.getElementById('pages').dispatchEvent(new ClipboardEvent('paste', { clipboardData: d, bubbles: true, cancelable: true })); }""", ' 100% & \\delta_{2}\n\\eps')
    page.wait_for_timeout(200)
    check('paste puts the text in as it is, lines and all', 'gamma 100% & \\delta_{2}\n\\eps\n\nAfter.' in src(page) and len(boxes(page)) == 1, body(page))
    # what was copied on the page goes into the box as its source
    load_doc(page, doc)
    page.evaluate("() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('#pages .it.p')); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }")
    page.keyboard.press('Control+c'); page.wait_for_timeout(150)
    click_text(page, 'gamma', 5)
    page.evaluate("""() => { const d = new DataTransfer(); d.setData('text/plain', window.rikuy.lastCopy.plain); d.setData('text/x-galley-latex', window.rikuy.lastCopy.latex); document.getElementById('pages').dispatchEvent(new ClipboardEvent('paste', { clipboardData: d, bubbles: true, cancelable: true })); }""")
    page.wait_for_timeout(200)
    check('words copied from the typeset page come into the box as their LaTeX', 'gammaSome $x$ text' in src(page), body(page))
    # bold is not for a box of source
    load_doc(page, doc); select_text(page, 'gamma'); state(page)
    st = state(page)
    page.keyboard.press('Control+b'); page.wait_for_timeout(150)
    check('in the box Bold, Italic, Underline and Equation are disabled, and Ctrl+B writes nothing', all(st[k][0] for k in ('rb-b', 'rb-i', 'rb-u', 'rb-eq')) and not st['rb-math'][0] and src(page) == doc, (st['rb-b'], src(page)[-60:]))


def latex_pdf(page):
    """The PDF of a document with LaTeX paragraphs is the PDF of the same document without the marks."""
    if not os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        print('SKIP the PDF with and without the marks: no TeX tree in %s' % DIST)
        return
    plain = WRAP('\\section{Opening}\\label{s:o}\nFirst paragraph with $x^2$ and a note.\\footnote{A note.}\n\n'
                 'Second paragraph, see Section~\\ref{s:o}.\n\n\\begin{itemize}\n  \\item one\n  \\item two\n\\end{itemize}\n\n\\begin{equation}\\label{e}\na = b\n\\end{equation}\nAfter it (\\ref{e}).\n\n\\section{Close}\nEnd.')
    marked = plain.replace('Second paragraph', '% rikuy: latex\nSecond paragraph').replace('\\begin{itemize}', '% rikuy: latex\n\\begin{itemize}').replace('\\section{Close}', '% rikuy: latex\n\\section{Close}')
    page.set_default_timeout(600000)
    got = []
    for text in (plain, marked):
        got.append(page.evaluate("""async (t) => { await window.rikuy.api.setSource(t); const r = await window.rikuy.api.compile();
          const core = (b) => { let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192)); return s.replace(/\\/(CreationDate|ModDate) ?\\(D:[^)]*\\)/g, '/$1 ()').replace(/\\/ID ?\\[ ?<[0-9A-Fa-f]*> ?<[0-9A-Fa-f]*> ?\\]/, '/ID []'); };
          return { ok: r.ok, pages: r.pages, n: r.pdf ? r.pdf.length : 0, core: r.pdf ? core(r.pdf) : '', boxes: document.querySelectorAll('#pages .it.tex').length }; }""", text))
    page.set_default_timeout(30000)
    a, b = got
    check('compiled in the page, the document with three LaTeX paragraphs gives the same PDF as without their marks (dates and ID aside)', a['ok'] and b['ok'] and a['pages'] == b['pages'] and a['n'] == b['n'] and a['core'] == b['core'] and b['boxes'] == 3 and a['boxes'] == 0,
          {k: (a[k], b[k]) for k in ('ok', 'pages', 'n', 'boxes')})


def run():
    with sync_playwright() as p:
        fns = (top_bar, styles, letters, lists, inserts, keyboard, narrow, downloads, one_save, where_it_applies, list_edges, insert_edges, downloads_in_sight, bold_across, live_graphs,
               gallery, gallery_widths, gallery_paging, gallery_keys, quote_style, latex_style, latex_typing, latex_after_ghost, latex_edges, latex_clipboard, latex_pdf)
        # (the tests that read the tiles see all six: from 1600 px the gallery has room for them)
        wide = (styles, gallery, gallery_keys, quote_style, latex_style, latex_edges)
        # (names given on the command line run those alone)
        for fn in [f for f in fns if len(sys.argv) < 2 or f.__name__ in sys.argv[1:]]:
            browser, page, errors = open_page(p, width=1920 if fn in wide else 1400)
            try:
                fn(page)
            except Exception as e:
                check('%s runs to its end' % fn.__name__, False, e)
            check('no console errors (%s)' % fn.__name__, not [e for e in errors if 'tree.wasm' not in e and 'TeX' not in e], errors[:4])
            browser.close()
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(run())
