"""The File tab (src/cmd/file.js), in Chromium.

New: Blank document from the default preamble (Set as default, and Forget the default), each of
New from template's eight skeletons opened as a document of its own and, where dist/tex exists,
compiled in the page without an error. Open: Recent documents lists the documents kept in this
browser and opens one. Info: Properties as round trips (a title replaced in place, one added
before \\begin{document}, & escaped, braces that do not pair refused, subject and keywords into an
existing \\hypersetup, into hyperref's options, a new hyperref with hidelinks, a \\hypersetup line
under beamer, which loads hyperref itself; one undo each, back byte for byte; hand written
\\hypersetup read back into the dialog's fields); Check accessibility (pictures without alt text,
a skipped heading level, a table without a header row, no language; Tag the PDF writing
\\DocumentMetadata once, one undo). Save a copy: Export as, with pandoc where dist/word exists
(HTML, Markdown and plain text holding the document's words). Phones: the File tab's buttons 44 px
and its dialogs on the screen at 390 px.

RIKUY_DIST names another dist/."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import open_page, check, results, src, load_doc, click_text, roundtrip
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist')
TEX = os.path.isdir(os.path.join(DIST, 'tex'))
WORD = os.path.isdir(os.path.join(DIST, 'word'))
SHOTS = os.environ.get('RIKUY_SHOTS', '/tmp/B12-shots')
os.makedirs(SHOTS, exist_ok=True)
DOC = '\\documentclass{article}\n\\usepackage{amsmath}\n\\title{Old title}\n\\author{Ann}\n\\begin{document}\n\\maketitle\nSome words here.\n\\end{document}\n'


def ev(page, js, arg=None):
    return page.evaluate(js, arg) if arg is not None else page.evaluate(js)


def props(v):
    return lambda page: page.evaluate('(v) => window.rikuy.runCommand("properties", v)', v)


def new_docs(page):
    page.get_by_role('tab', name='File', exact=True).click(); page.wait_for_timeout(300)
    for n in ('Blank document', 'New from template', 'Browse', 'Recent documents', 'Properties', 'Check accessibility', 'Export as', 'Print PDF', 'Set as default'):
        check('File has ' + n, page.get_by_role('button', name=n, exact=True).count() == 1)
    page.screenshot(path=os.path.join(SHOTS, 'file-tab-1366.png'))
    page.get_by_role('button', name='New from template', exact=True).click(); page.wait_for_timeout(300)
    items = page.get_by_role('menuitem').all_inner_texts()
    check('New from template lists eight templates', [i.split('\n')[0] for i in items] == ['Article', 'Report', 'Book or thesis', 'Letter', 'KOMA-Script article', 'Slides', 'Exam', 'CV'], items)
    page.keyboard.press('Escape')
    for tid in ('article', 'report', 'book', 'letter', 'scrartcl', 'beamer', 'exam', 'cv'):
        ev(page, '(t) => window.rikuy.runCommand("new-template", t)', tid); page.wait_for_timeout(900)
        s = src(page)
        ok = s.startswith('\\documentclass') and '\\begin{document}' in s and ev(page, 'window.rikuy.files.size') == 1
        if TEX:
            r = ev(page, 'window.rikuy.api.compile()')
            errs = [x for x in r['problems'] if x.get('sev') == 'error']
            check('template ' + tid + ': a document of its own that compiles in the page', ok and r['ok'] and r['pages'] >= 1 and not errs, (r['ok'], errs[:2]))
        else:
            check('template ' + tid + ': a document of its own', ok, s[:80])
    names = ev(page, '(async () => (await window.rikuy.allSnaps()).map((v) => v.name))()')
    check('each template opened as a new document, the others kept', 'Report' in names and 'Slides' in names and ev(page, 'window.rikuy.name') == 'CV', names[:12])
    # Recent documents: the others, newest first; one opens
    page.get_by_role('tab', name='File', exact=True).click(); page.wait_for_timeout(200)
    page.get_by_role('button', name='Recent documents', exact=True).click(); page.wait_for_timeout(500)
    items = page.get_by_role('menuitem').all_inner_texts()
    check('Recent documents lists the others, newest first, not the open one', items and items[0].startswith('Exam') and not any(i.startswith('CV') for i in items), items)
    page.get_by_role('menuitem', name='Report', exact=True).click(); page.wait_for_timeout(900)
    check('a press opens it', ev(page, 'window.rikuy.name') == 'Report' and '\\documentclass[11pt]{report}' in src(page))
    # Set as default
    load_doc(page, DOC)
    ev(page, 'window.rikuy.runCommand("set-default", "set")')
    ev(page, 'window.rikuy.runCommand("new-blank")'); page.wait_for_timeout(900)
    check('Set as default: a blank document starts with this preamble', src(page) == DOC[:DOC.index('\\begin{document}')].rstrip() + '\n\n\\begin{document}\n\n\\end{document}\n', src(page))
    ev(page, 'window.rikuy.runCommand("set-default", "reset")')
    ev(page, 'window.rikuy.runCommand("new-blank")'); page.wait_for_timeout(900)
    check('Forget the default: a plain article again', src(page).startswith('\\documentclass{article}\n\\usepackage{amsmath}\n\n\\begin{document}'), src(page))


def properties(page):
    roundtrip(page, DOC, 'Some', props({'title': 'New title'}), DOC.replace('Old title', 'New title'), off_command=props({'title': 'Old title'}), label='Properties: the title replaced in place')
    roundtrip(page, DOC, 'Some', props({'author': 'Ann \\and Bo & Co'}), DOC.replace('{Ann}', '{Ann \\and Bo \\& Co}'), off_command=props({'author': 'Ann'}), label='Properties: the author, & escaped, LaTeX kept')
    bare = DOC.replace('\\title{Old title}\n', '')
    roundtrip(page, bare, 'Some', props({'title': 'Fresh'}), bare.replace('\\begin{document}', '\\title{Fresh}\n\\begin{document}'), label='Properties: a title where there was none, before \\begin{document}',
              off_command=props({'title': ''}), off=bare.replace('\\begin{document}', '\\title{}\n\\begin{document}'))
    roundtrip(page, DOC, 'Some', props({'subject': 'Economics', 'keywords': 'growth, AI'}),
              DOC.replace('\\usepackage{amsmath}\n', '\\usepackage{amsmath}\n\\usepackage[hidelinks,pdfsubject={Economics},pdfkeywords={growth, AI}]{hyperref}\n'),
              off_command=props({'subject': '', 'keywords': ''}), off=DOC.replace('\\usepackage{amsmath}\n', '\\usepackage{amsmath}\n\\usepackage[hidelinks]{hyperref}\n'), label='Properties: subject and keywords, hyperref loaded with hidelinks')
    hs = DOC.replace('\\usepackage{amsmath}\n', '\\usepackage{amsmath}\n\\usepackage{hyperref}\n\\hypersetup{colorlinks=true}\n')
    roundtrip(page, hs, 'Some', props({'keywords': 'a, b'}), hs.replace('colorlinks=true', 'colorlinks=true,pdfkeywords={a, b}'), off_command=props({'keywords': ''}), label='Properties: keywords into the \\hypersetup there is')
    hl = DOC.replace('\\usepackage{amsmath}\n', '\\usepackage{amsmath}\n\\usepackage[colorlinks]{hyperref}\n')
    roundtrip(page, hl, 'Some', props({'subject': 'X'}), hl.replace('[colorlinks]', '[colorlinks,pdfsubject={X}]'), off_command=props({'subject': ''}), label='Properties: the subject into hyperref\'s options, no hidelinks added')
    bm = '\\documentclass{beamer}\n\\title{T}\n\\begin{document}\n\\frame{Some words}\n\\end{document}\n'
    roundtrip(page, bm, 'Some', props({'subject': 'Talk'}), bm.replace('\\begin{document}', '\\hypersetup{pdfsubject={Talk}}\n\\begin{document}'), off_command=props({'subject': ''}), off=bm.replace('\\begin{document}', '\\hypersetup{}\n\\begin{document}'), label='Properties: beamer loads hyperref: a \\hypersetup line, no \\usepackage')
    load_doc(page, DOC); h = ev(page, 'window.rikuy.hist.length')
    ev(page, '() => window.rikuy.runCommand("properties", { title: "Bad {brace" })')
    check('braces that do not pair: refused, nothing written', src(page) == DOC and ev(page, 'window.rikuy.hist.length') == h)
    # read back: a hand written \hypersetup
    load_doc(page, hs.replace('colorlinks=true', 'colorlinks=true, pdfsubject = {Hand, written}, pdfkeywords=one'))
    page.get_by_role('tab', name='File', exact=True).click(); page.wait_for_timeout(200)
    page.get_by_role('button', name='Properties', exact=True).click(); page.wait_for_timeout(300)
    dlg = page.get_by_role('dialog', name='Properties', exact=True)
    vals = [dlg.get_by_role('textbox', name=n, exact=True).input_value() for n in ('Title', 'Author', 'Subject', 'Keywords')]
    check('the dialog reads what is written by hand', vals == ['Old title', 'Ann', 'Hand, written', 'one'], vals)
    page.screenshot(path=os.path.join(SHOTS, 'file-properties-1366.png'))
    dlg.get_by_role('textbox', name='Title', exact=True).fill('Typed in the dialog')
    dlg.get_by_role('button', name='Apply', exact=True).click(); page.wait_for_timeout(300)
    check('Apply writes the changed field only', '\\title{Typed in the dialog}' in src(page) and 'pdfsubject = {Hand, written}' in src(page) and page.get_by_role('dialog').count() == 0)


def accessibility(page):
    d = '\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\n\\section{A}\n\\subsubsection{Deep}\n\\includegraphics[width=3cm]{fig}\n\\includegraphics[alt={A cat}]{cat}\n\\begin{tabular}{ll}\na & b \\\\\nc & d\n\\end{tabular}\n\\end{document}\n'
    load_doc(page, d)
    ks = ev(page, 'window.rikuy.accessibilityIssues().map((x) => x.k)')
    check('Check accessibility finds no title, no language, a picture without alt text, a skipped level, a table without a header row, no tagging', ks == ['title', 'lang', 'alt', 'heads', 'table', 'tagging'], ks)
    t = ev(page, 'window.rikuy.accessibilityIssues().find((x) => x.k === "alt").t')
    check('it counts: 1 of 2 pictures', t.startswith('1 of 2'), t)
    page.get_by_role('tab', name='File', exact=True).click(); page.wait_for_timeout(200)
    page.get_by_role('button', name='Check accessibility', exact=True).click(); page.wait_for_timeout(300)
    dlg = page.get_by_role('dialog', name='Check accessibility', exact=True)
    page.screenshot(path=os.path.join(SHOTS, 'file-a11y-1366.png'))
    h = ev(page, 'window.rikuy.hist.length')
    dlg.get_by_role('button', name='Tag the PDF', exact=True).click(); page.wait_for_timeout(300)
    check('Tag the PDF: \\DocumentMetadata before \\documentclass, one step', src(page) == '\\DocumentMetadata{lang=en,pdfstandard=ua-2,tagging=on}\n' + d and ev(page, 'window.rikuy.hist.length') == h + 1, src(page)[:90])
    check('and no second time', ev(page, 'window.rikuy.runCommand("check-accessibility", "tagging")') is False)
    ev(page, 'window.rikuy.undo()'); page.wait_for_timeout(200)
    check('one undo: the bytes of before', src(page) == d)
    # a stranger's file of spaces after \\includegraphics and \\usepackage: read in a moment
    load_doc(page, '\\documentclass{article}\n\\usepackage' + ' ' * 200000 + 'x\n\\begin{document}\n' + '\\includegraphics' + ' ' * 200000 + 'y\n\\end{document}\n')
    ms = ev(page, '(() => { const t = performance.now(); window.rikuy.accessibilityIssues(); return performance.now() - t; })()')
    check('Check accessibility on 400 KB of hostile spaces takes well under a second (a scan, no backtracking)', ms < 500, ms)
    good = '\\DocumentMetadata{lang=en,pdfstandard=ua-2,tagging=on}\n\\documentclass{article}\n\\usepackage{booktabs}\n\\title{T}\n\\begin{document}\n\\section{A}\n\\subsection{B}\n\\begin{tabular}{ll}\n\\toprule\na & b \\\\\n\\midrule\nc & d\n\\end{tabular}\n\\end{document}\n'
    load_doc(page, good)
    check('a document with a title, a language, tagging, its levels and header rows: nothing found', ev(page, 'window.rikuy.accessibilityIssues().length') == 0, ev(page, 'window.rikuy.accessibilityIssues()'))
    if TEX:
        r = ev(page, 'window.rikuy.api.compile()')
        check('the tagged document compiles in the page', r['ok'], r['problems'][:2])


def export(page):
    if not WORD:
        check('Export as needs Word: this copy says so', ev(page, '(async () => await window.rikuy.runCommand("export-as", "html"))()') is False)
        return
    load_doc(page, DOC.replace('Some words here.', 'Some words here, and $x^2$.'))
    for fmt, needle in (('html', 'Some words here'), ('markdown', 'Some words here'), ('txt', 'Some words here'), ('odt', None), ('rtf', 'Some words here'), ('epub', None)):
        ok = ev(page, '(f) => window.rikuy.runCommand("export-as", f)', fmt)
        page.wait_for_function('!window.rikuy.wordBusy', timeout=120000)
        e = ev(page, '(async () => { const x = window.rikuy.lastExport; return x ? { name: x.name, size: x.size, text: (await x.blob.text()).slice(0, 4000) } : null; })()')
        good = e and e['name'].endswith('.' + {'markdown': 'md'}.get(fmt, fmt)) and e['size'] > 50 and (needle is None or needle in e['text']) and (fmt not in ('odt', 'epub') or e['text'].startswith('PK'))
        check('Export as ' + fmt + ': a file with the document in it', good, e and (e['name'], e['size'], e['text'][:80]))
    e = ev(page, '(async () => (await window.rikuy.lastExport.blob.text()))()')


def phones(p):
    browser, page, errors = open_page(p, 390, 844, touch=True)
    ev(page, "window.rikuy.selectTab('file')"); page.wait_for_timeout(300)
    r = ev(page, "[...document.querySelectorAll('#rp-file .btn')].filter((b) => b.offsetParent).map((b) => { const r = b.getBoundingClientRect(); return [b.getAttribute('aria-label'), Math.round(r.width), Math.round(r.height)]; })")
    check('the File tab\'s buttons are 44 px under a finger (390 px)', r and all(x[1] >= 44 and x[2] >= 44 for x in r), r)
    page.locator('#rf-props').tap(); page.wait_for_timeout(400)
    dl = ev(page, "(() => { const d = document.querySelector('.pop'); const r = d.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), Math.round(r.bottom), innerHeight]; })()")
    check('Properties fits a phone\'s screen (390 px)', dl[0] >= 0 and dl[1] <= 390 and dl[2] <= dl[3], dl)
    page.screenshot(path=os.path.join(SHOTS, 'phone-390-properties.png'))
    check('no sideways scroll (390 px)', ev(page, 'document.documentElement.scrollWidth') <= 390)
    check('no errors (390 px)', not errors, errors)
    browser.close()


with sync_playwright() as p:
    want = sys.argv[1:]
    browser, page, errors = open_page(p, 1366, 800)
    for name, fn in (('new_docs', new_docs), ('properties', properties), ('accessibility', accessibility), ('export', export)):
        if want and name not in want:
            continue
        try: fn(page)
        except Exception as e: check(name + ' ran to its end', False, repr(e)[:300])
    check('no errors in the page', not errors, errors[:3])
    browser.close()
    if not want or 'phones' in want:
        phones(p)

bad = [r for r in results if not r[1]]
print('%d checks, %d failed' % (len(results), len(bad)))
sys.exit(1 if bad else 0)
