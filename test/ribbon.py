"""The ribbon (src/ribbon.js): the row under the bar with the paragraph's style, bold, italic and
underline, lists, the things to insert and the three downloads. Every style and list conversion
and back, with undo restoring the source byte for byte; the pressed and the disabled buttons; each
Insert button; Download LaTeX (.tex for one file, .zip for several) and Word; the mark and the
message for a document with live graphs (sample/widget/); the toolbar by keyboard; the ribbon on a
360px screen. Download PDF runs where dist/tex holds a TeX tree (CI's TeX job) and says why it is
skipped elsewhere; here it checks that a run that cannot start opens the preview with its error.

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
    page.select_option('#rb-style', value)
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
    # where a conversion is not safe the list is disabled
    for where, text in (('a list item', 'two'), ('a table cell', 'cell')):
        click_text(page, text, 1)
        check('in %s the style cannot be changed' % where, state(page)['rb-style'][0])
    load_doc(page, '\\documentclass{article}\n\\title{A title}\n\\begin{document}\n\\maketitle\nWords.\n\\end{document}\n')
    click_text(page, 'A title', 2)
    st = state(page)
    check('in the title the style shows Title and stays as it is', st['style'] == 'title' and st['rb-style'][0], st['style'])
    click_text(page, 'Words', 2)
    state(page)
    check('and Title is not offered for a paragraph', page.evaluate('[...document.getElementById("rb-style").options].filter((o) => !o.hidden && !o.disabled).map((o) => o.value)') == ['p', 'section', 'subsection', 'subsubsection'])
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
    table = '\\begin{table}[h]\n\\centering\n\\begin{tabular}{ll}\n\\hline\n &  \\\\\n &  \\\\\n\\hline\n\\end{tabular}\n\\caption{}\n\\end{table}'
    check('Table puts a two by two table after the paragraph, not inside it', src(page) == DOC.replace('Second paragraph here.\n\n', 'Second paragraph here.\n\n' + table + '\n\n'), src(page)[src(page).find('Second'):][:160])
    page.keyboard.type('A'); page.wait_for_timeout(200)
    check('with the caret in its first cell', '\\hline\nA &  \\\\' in src(page), src(page)[src(page).find('hline'):][:30])
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
    labels = page.evaluate('[...document.querySelectorAll(".rb-dl button")].map((b) => b.textContent.trim())')
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
    check('a document with no live graph has no mark on LaTeX', not page.evaluate('document.getElementById("b-save").classList.contains("live")') and 'live graphs' not in page.evaluate('document.getElementById("b-save").title'))
    load_doc(page, {'main.tex': read('main.tex'), 'rikuy.sty': read('rikuy.sty'), 'widgets/clt.html': read('widgets/clt.html')})
    page.evaluate('(() => { const g = window.rikuy; g.name = "live"; g.persist(); })()')
    page.wait_for_timeout(400)
    mark = page.evaluate('(() => { const b = document.getElementById("b-save"); return [b.classList.contains("live"), b.title, getComputedStyle(b, "::before").width]; })()')
    check('with a live graph the LaTeX button carries a mark and says it keeps the live graphs', mark[0] and 'keeps the live graphs' in mark[1] and mark[2] == '7px', mark)
    note = 'Graphs are pictures in a PDF or Word file. Download LaTeX to keep them live.'
    if os.path.isfile(os.path.join(DIST, 'word', 'pandoc.json')):
        with page.expect_download(timeout=180000) as d:
            press(page, 'rb-word')
        page.wait_for_timeout(300)
        check('Download Word still works there and says what becomes of the graphs', d.value.suggested_filename.endswith('.docx') and page.inner_text('#toast') == note, page.inner_text('#toast'))
        with page.expect_download(timeout=180000) as d:
            press(page, 'rb-word')
        page.wait_for_timeout(300)
        check('once for a document: the second download does not say it again', page.inner_text('#toast') != note, page.inner_text('#toast')[:60])
    else:
        print('SKIP the live graph message after Download Word: this copy has no Word')


def keyboard(page):
    load_doc(page, DOC); select_text(page, 'Second')
    state(page)
    stops = page.evaluate('[...document.querySelectorAll("#ribbon select, #ribbon button")].filter((x) => x.tabIndex === 0).map((x) => x.id)')
    check('the ribbon is a toolbar with one tab stop', page.evaluate('document.getElementById("ribbon").getAttribute("role")') == 'toolbar' and stops == ['rb-style'], stops)
    page.focus('#rb-style')
    seen = []
    for key in ('ArrowRight', 'ArrowRight', 'ArrowLeft', 'End', 'Home', 'ArrowRight'):
        page.keyboard.press(key); seen.append(page.evaluate('document.activeElement.id'))
    check('arrows, Home and End move between its controls', seen == ['rb-b', 'rb-i', 'rb-b', 'b-save', 'rb-style', 'rb-b'], seen)
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
    page.evaluate('document.getElementById("b-save").scrollIntoView({ inline: "end" })'); page.wait_for_timeout(100)
    seen = page.evaluate('(() => { const b = document.getElementById("b-save").getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth + 1; })()')
    page.click('#b-nav'); page.wait_for_timeout(200)
    acts = page.evaluate('[...document.querySelectorAll("#nav-acts .nav-act")].map((a) => a.textContent.trim())')
    check('the downloads are reached by scrolling the ribbon, and are first in the menu panel', seen and acts[:3] == ['Download PDF', 'Download Word', 'Download LaTeX'], acts[:4])
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


def run():
    with sync_playwright() as p:
        for fn in (top_bar, styles, letters, lists, inserts, keyboard, narrow, downloads, live_graphs):
            browser, page, errors = open_page(p)
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
