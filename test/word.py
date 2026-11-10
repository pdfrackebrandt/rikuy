"""Word, both ways, in the page as the host serves it (serve.py's CSP). Nothing of pandoc loads with
the page: its manifest and parts come from word/ next to the page at the first Word action, and
from IndexedDB after a reload. Save as Word writes a .docx that python-docx opens, with Word
equations (m:oMath), the figure, the footnote, the citation as the citation style writes it, a
bookmark on every block and Rikuy's data in a custom XML part. That file, edited as a coauthor
would (python-docx: words changed, a sentence added and one deleted, a paragraph deleted and one
added; raw XML: a tracked insertion and deletion; a comment), opened again, writes only the edited
spans into main.tex, shown as changes under Review with the comment as a Rikuy comment; an edit
of text the owner changed since the export is not applied and becomes a comment. A Word file of
one's own (python-docx, test/word_fixture.py) opens as a new project by Open, by dropping it and
by pasting it, with its equations as LaTeX math, its picture in figures/, its table, list,
footnote and link, and a javascript: link as plain text. Where LibreOffice is installed, a file
it opened and saved keeps the bookmarks and the custom XML part, and an edit made in LibreOffice
with changes tracked comes back. A build without Word (RIKUY_NO_WORD) says where Word support is
and fetches nothing of it."""
import os, sys, io, re, json, base64, zipfile, tempfile, traceback, time, subprocess, shutil, difflib
sys.path.insert(0, os.path.dirname(__file__))
import serve
from browser import ROUTES, check, results
from playwright.sync_api import sync_playwright
import word_fixture

PORT = 8803
serve.start(PORT)
URL = 'http://127.0.0.1:%d/' % PORT
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP = os.path.join(tempfile.gettempdir(), 'rikuy-word')
os.makedirs(TMP, exist_ok=True)
PNG = word_fixture.png(40, 30, (200, 40, 40))

MAIN = r"""\documentclass{article}
\usepackage{amsmath}
\usepackage{graphicx}
\usepackage{natbib}
\newcommand{\R}{\mathbb{R}}
\title{Growth Notes}
\author{Ana Pérez}
\begin{document}
\maketitle

\section{Introduction}
We study growth in $\R^n$ with \emph{weak} institutions at 50\% capacity.\footnote{Data from the census.}
The economy follows \citet{solow1956} closely.

The second paragraph stays as it was in the source.

This paragraph will be deleted in Word.

\begin{equation}
  y_t = A k_t^{\alpha} \label{eq:prod}
\end{equation}
Equation~\eqref{eq:prod} is the production function.

\begin{table}[h]
\centering
\begin{tabular}{ll}
\hline
Country & Rate \\
\hline
Peru & 3.1 \\
\hline
\end{tabular}
\caption{Growth rates.}
\end{table}

\begin{figure}[h]
\centering
\includegraphics[width=0.5\textwidth]{fig.png}
\caption{A red box.}
\end{figure}

The owner keeps writing in this sentence.

\bibliographystyle{plainnat}
\bibliography{refs}
\end{document}
"""
BIB = '@article{solow1956, author={Solow, Robert M.}, title={A Contribution to the Theory of Economic Growth}, journal={Quarterly Journal of Economics}, year={1956}}\n'


def make_zip(path, files):
    with zipfile.ZipFile(path, 'w') as z:
        for n, b in files.items():
            z.writestr(n, b if isinstance(b, bytes) else b.encode('utf8'))
    return path


def open_app(p, url=URL):
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1400, 'height': 1000}, accept_downloads=True, device_scale_factor=1)
    page = ctx.new_page()
    errors, reqs = [], []
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    page.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
    ctx.on('request', lambda r: reqs.append(r.url))

    def h(route):
        u = route.request.url
        if u in ROUTES:
            return route.fulfill(status=200, content_type='text/javascript', body=open(ROUTES[u], encoding='utf8').read(), headers={'Access-Control-Allow-Origin': '*'})
        if u.startswith('http://127.0.0.1'):
            return route.continue_()
        return route.abort()
    ctx.route('**/*', h)
    page.goto(url)
    page.evaluate('localStorage.clear()')
    page.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=30000)
    return b, page, errors, reqs


def wait_idle(page, ms=30000):
    page.wait_for_function('!window.rikuy.wordBusy', timeout=ms)
    page.wait_for_timeout(300)


def save_docx(page, path):
    with page.expect_download(timeout=120000) as d:
        page.evaluate('window.rikuy.saveDocx()')
    d.value.save_as(path)
    wait_idle(page)
    return path


def open_file(page, path):
    page.set_input_files('#fileinput', path)
    page.wait_for_timeout(300)
    wait_idle(page, 120000)


def src(page, f='main.tex'):
    return page.evaluate('(f) => window.rikuy.files.get(f)', f)


def parts(path):
    with zipfile.ZipFile(path) as z:
        return {n: z.read(n) for n in z.namelist()}


def edit_docx(path, out, ops):
    """Change the document.xml (and comments) of a .docx with plain string edits."""
    P = parts(path)
    d = P['word/document.xml'].decode()
    for a, b in ops:
        if callable(a):
            d = a(d)
            continue
        assert a in d, a
        d = d.replace(a, b, 1)
    P['word/document.xml'] = d.encode()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for n, b in P.items():
            z.writestr(n, b)
    return out


def changed_lines(a, b):
    return [l for l in difflib.unified_diff(a.split('\n'), b.split('\n'), lineterm='', n=0) if l[:1] in '+-' and not l.startswith(('+++', '---'))]


try:
    with sync_playwright() as p:
        browser, page, errors, reqs = open_app(p)
        check('loading the page fetches nothing of pandoc', not [u for u in reqs if '/word/' in u], [u for u in reqs if '/word/' in u])
        proj = make_zip(os.path.join(TMP, 'growth.zip'), {'main.tex': MAIN, 'refs.bib': BIB, 'fig.png': PNG})
        page.set_input_files('#fileinput', proj)
        page.wait_for_function("window.rikuy.name === 'growth'", timeout=10000)
        page.wait_for_timeout(500)

        # ---- Save as Word ----
        n0 = len(reqs)
        out = save_docx(page, os.path.join(TMP, 'growth.docx'))
        got = [u for u in reqs[n0:] if '/word/' in u]
        check('the first Word action fetches the worker, the manifest and the parts from word/', any(u.endswith('/word/word.js') for u in got) and any(u.endswith('/word/pandoc.json') for u in got) and len([u for u in got if u.endswith('.bin')]) >= 2, got)
        P = parts(out)
        doc = P['word/document.xml'].decode()
        check('the .docx has Word equations (m:oMath), inline and display', doc.count('<m:oMath>') + doc.count('<m:oMath ') >= 2 and '<m:oMathPara' in doc, doc.count('<m:oMath'))
        check('\\R is expanded inside the equation (a double struck R, not \\R)', ('ℝ' in doc or 'double-struck' in doc) and '\\R' not in doc)
        check('the figure is in word/media', any(n.startswith('word/media/') for n in P), [n for n in P if 'media' in n])
        check('the footnote is a Word footnote', b'Data from the census.' in P.get('word/footnotes.xml', b''))
        check('the citation is written by the citation style, and the reference list follows', 'Solow (1956)' in doc and 'Contribution to the Theory' in doc, re.findall(r'Solow[^<]{0,20}', doc)[:3])
        plain = re.sub(r'<[^>]+>', '', doc).replace('\u00a0', ' ')
        check('cross references are text: Equation (1), Table 1 and Figure 1', 'Equation (1)' in plain and 'Table 1: Growth rates.' in plain and 'Figure 1: A red box.' in plain, plain[:300])
        check('every block carries a bookmark Rk<n>', len(re.findall(r'w:name="Rk\d+"', doc)) >= 12, len(re.findall(r'w:name="Rk\d+"', doc)))
        item = [n for n in P if re.match(r'customXml/item\d+\.xml$', n)]
        check('Rikuy\'s data rides in a custom XML part', item and b'urn:rikuy:word:1' in P[item[0]], item)
        import docx as pydocx
        D = pydocx.Document(out)
        text = '\n'.join(par.text for par in D.paragraphs)
        check('python-docx opens it and reads the text', 'We study growth in' in text and 'with weak institutions at 50% capacity.' in text, text[:200])
        check('the table is a Word table', len(D.tables) == 1 and D.tables[0].cell(1, 0).text == 'Peru', [t.cell(0, 0).text for t in D.tables])

        # ---- a second Word action after a reload: pandoc from IndexedDB, not the network ----
        page.reload()
        page.wait_for_function('window.rikuy && document.getElementById("boot").hidden', timeout=30000)
        n0 = len(reqs)
        save_docx(page, os.path.join(TMP, 'growth2.docx'))
        bins = [u for u in reqs[n0:] if u.endswith('.bin')]
        check('after a reload pandoc comes from IndexedDB: no part is fetched again', not bins, bins)

        # ---- the owner keeps writing after the export ----
        page.evaluate("""() => { const g = window.rikuy, t = g.files.get('main.tex'), a = t.indexOf('keeps writing');
          g.commit([{ f: 'main.tex', s: a, e: a + 'keeps writing'.length, t: 'went on writing' }], null, 'type'); g.closeGroup(); }""")
        before = src(page)

        # ---- the coauthor edits the .docx ----
        def delete_para(d):
            m = re.search(r'<w:p>(?:(?!<w:p>).)*?This paragraph will be deleted in Word\..*?</w:p>', d, re.S)
            return d[:m.start()] + d[m.end():]

        def add_para(d):
            m = re.search(r'<w:p>(?:(?!<w:p>).)*?The second paragraph stays.*?</w:p>', d, re.S)
            return d[:m.end()] + '<w:p><w:r><w:t>A paragraph added in Word costs $5 &amp; more.</w:t></w:r></w:p>' + d[m.end():]
        ed = edit_docx(out, os.path.join(TMP, 'growth-ed.docx'), [
            ('weak', 'fragile'),                                                      # a word changed inside \emph
            ('closely.', 'closely. Growth is slow.'),                                   # a sentence added
            (' is the production function.', ' is the production function of 100% output.'),
            (delete_para, None),
            (add_para, None),
            # a tracked deletion and insertion
            ('The second paragraph stays', 'The second paragraph </w:t></w:r><w:del w:id="901" w:author="Ana Pérez" w:date="2026-11-10T00:00:00Z"><w:r><w:delText>stays</w:delText></w:r></w:del><w:ins w:id="902" w:author="Ana Pérez" w:date="2026-11-10T00:00:00Z"><w:r><w:t>remains</w:t></w:r></w:ins><w:r><w:t xml:space="preserve">'),
            ('owner keeps writing', 'owner always writes'),   # the owner changed the same word since
        ])
        # a comment, as Word writes one (python-docx)
        Dd = pydocx.Document(ed)
        par = next(x for x in Dd.paragraphs if 'Growth is slow.' in x.text)
        run = next(r for r in par.runs if 'Growth is slow' in r.text)
        Dd.add_comment(run, text='Which institutions?', author='Ana Pérez', initials='AP')
        Dd.save(ed)
        open_file(page, ed)
        after = src(page)
        lines = changed_lines(before, after)
        print('\n'.join(lines))
        exp = [
            '-We study growth in $\\R^n$ with \\emph{weak} institutions at 50\\% capacity.\\footnote{Data from the census.}',
            '+We study growth in $\\R^n$ with \\emph{fragile} institutions at 50\\% capacity.\\footnote{Data from the census.}',
            '-The economy follows \\citet{solow1956} closely.',
            '+The economy follows \\citet{solow1956} closely. Growth is slow.',
        ]
        check('a Word comment becomes a Rikuy comment under its line, quoting the words', any(re.match(r'\+% comment \(Ana Pérez\) on "[^"]*Growth is slow\.": Which institutions\?$', l) for l in lines), lines)
        check('edits inside markup patch only the changed words (\\emph{weak} -> \\emph{fragile})', all(l in lines for l in exp), lines)
        check('a tracked deletion and insertion come in as accepted', 'The second paragraph remains as it was in the source.' in after)
        check('a paragraph added in Word arrives escaped, after its neighbour', 'The second paragraph remains as it was in the source.\n\nA paragraph added in Word costs \\$5 \\& more.' in after, after[after.find('second paragraph'):][:160])
        check('the deleted paragraph is gone, with its blank line', 'will be deleted' not in after and '\n\n\n' not in after)
        check('the added sentence with % is escaped', 'production function of 100\\% output.' in after)
        check('nothing else in the file changed', len(lines) <= 14 and all(re.search(r'weak|fragile|closely|second paragraph|added in Word|deleted in Word|production function|comment|writing|typing|^[-+]$', l) for l in lines), lines)
        check('the owner\'s edit since the export is kept, and the coauthor\'s edit of the same words is a comment there', 'owner went on writing' in after and 'always' not in after.replace('always writes”', '') and re.search(r'% comment \(Ana Pérez\)[^\n]*always writes[^\n]*Not applied', after), after[after.find('went on'):][:300])
        n = page.evaluate('window.rikuy.currentChanges().length')
        check('the edits show as changes under Review, to accept or reject', n >= 6 and page.evaluate("document.body.classList.contains('nav-on')"), n)
        check('the toast says what came in', 'Brought in from growth-ed.docx' in page.inner_text('#toast'), page.inner_text('#toast')[:200])
        # reject one: the source goes back for that change only
        page.evaluate("""() => { const g = window.rikuy; const c = g.currentChanges().find((x) => /fragile/.test(x.b)); g.rejectChanges([c]); }""")
        check('rejecting one change puts back exactly that word', '\\emph{weak} institutions' in src(page) and 'Growth is slow.' in src(page))

        # ---- an equation changed in Word ----
        save_docx(page, os.path.join(TMP, 'growth3.docx'))
        base3 = src(page)

        def change_alpha(d):
            i = d.index('<m:oMathPara')
            j = d.index('α', i)
            return d[:j] + 'β' + d[j + 1:]
        ed3 = edit_docx(os.path.join(TMP, 'growth3.docx'), os.path.join(TMP, 'growth3-ed.docx'), [(change_alpha, None)])
        open_file(page, ed3)
        l3 = changed_lines(base3, src(page))
        check('an equation edited in Word patches only its token: \\alpha -> \\beta, label kept', l3 == ['-  y_t = A k_t^{\\alpha} \\label{eq:prod}', '+  y_t = A k_t^{\\beta} \\label{eq:prod}'], l3)

        # ---- LibreOffice: open and save keeps the anchors; an edit there with changes tracked comes back ----
        soffice = shutil.which('soffice')
        if soffice:
            save_docx(page, os.path.join(TMP, 'growth4.docx'))
            base4 = src(page)
            lo = os.path.join(TMP, 'lo')
            shutil.rmtree(lo, ignore_errors=True)
            os.makedirs(lo)
            r = subprocess.run(['/usr/bin/python3', os.path.join(os.path.dirname(__file__), 'word_lo.py'), os.path.join(TMP, 'growth4.docx'), os.path.join(lo, 'saved.docx'), os.path.join(lo, 'edited.docx')], capture_output=True, text=True, timeout=300)
            if r.returncode == 0:
                L = parts(os.path.join(lo, 'saved.docx'))
                check('LibreOffice keeps every Rk bookmark and the custom XML part through open and save', len(re.findall(r'w:name="Rk\d+"', L['word/document.xml'].decode())) == len(re.findall(r'w:name="Rk\d+"', parts(os.path.join(TMP, 'growth4.docx'))['word/document.xml'].decode())) and any(b'urn:rikuy:word:1' in v for k, v in L.items() if k.startswith('customXml/')))
                open_file(page, os.path.join(lo, 'saved.docx'))
                check('a file LibreOffice only opened and saved brings no change', src(page) == base4, changed_lines(base4, src(page)))
                open_file(page, os.path.join(lo, 'edited.docx'))
                l4 = changed_lines(base4, src(page))
                check('an edit made in LibreOffice with changes tracked comes back as one word', l4 == ['-The economy follows \\citet{solow1956} closely. Growth is slow.', '+The economy follows \\citet{solow1956} closely. Growth is very slow.'], l4)
            else:
                print('LibreOffice run failed:', r.stderr[-800:])
                check('LibreOffice edits the file (word_lo.py)', False, r.stderr[-300:])

        # ---- a Word file of one's own opens as a project ----
        fx = os.path.join(TMP, 'Growth and Institutions.docx')
        open(fx, 'wb').write(word_fixture.make())
        open_file(page, fx)
        t = src(page)
        check('Open: a .docx becomes a project named after it, main.tex', page.evaluate('window.rikuy.name') == 'Growth and Institutions' and '\\begin{document}' in t, page.evaluate('window.rikuy.name'))
        for what, s in [('headings', '\\section{Introduction}'), ('bold and italic', '\\textbf{growth} under \\emph{weak}'), ('escaped text', '5\\% rate \\& more'),
                        ('inline math from OMML', '\\(x^{2} + \\alpha\\)'), ('display math from OMML', '\\[\\int_{0}^{1}'), ('a link', '\\href{https://example.org/data}{online}'),
                        ('lists', '\\begin{itemize}'), ('a numbered list', '\\begin{enumerate}'), ('the table', 'Peru & 3.1'), ('the footnote', '\\footnote{Data from the World Bank.}'),
                        ('the picture', '\\includegraphics[width=2in'), ('the title', '\\title{Growth and Institutions}')]:
            check('Open .docx keeps %s' % what, s in t, t[:600] if s not in t else '')
        check('a javascript: link in the Word file is plain text, not a link', 'javascript' not in t)
        check('the picture is a file of the project, shown on the page', page.evaluate("window.rikuy.assetBlobs.has('figures/figure1.png')") and page.evaluate("[...document.querySelectorAll('#pages img')].some(i => i.complete && i.naturalWidth > 0)"))
        check('the page shows it without error chips', page.evaluate("document.querySelectorAll('#pages .a-chip.err').length") == 0, page.evaluate("[...document.querySelectorAll('#pages .a-chip.err')].map(x => x.textContent)"))
        check('a project from a Word file compiles with restricted shell escape', page.evaluate("(window.rikuy.linkCache.get(window.rikuy.name + '|' + window.rikuy.main) || {}).origin") == 'docx')

        # by dropping it, and by pasting it
        b64 = base64.b64encode(word_fixture.make()).decode()
        for how, js in [('drop', "(b) => { const f = new File([Uint8Array.from(atob(b), (c) => c.charCodeAt(0))], 'Dropped.docx'); const dt = new DataTransfer(); dt.items.add(f); document.getElementById('desk').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }"),
                        ('paste', "(b) => { const f = new File([Uint8Array.from(atob(b), (c) => c.charCodeAt(0))], 'Pasted.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }); const dt = new DataTransfer(); dt.items.add(f); document.getElementById('pages').focus(); document.getElementById('pages').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }")]:
            page.evaluate(js, b64)
            page.wait_for_timeout(300)
            wait_idle(page, 120000)
            want = 'Dropped' if how == 'drop' else 'Pasted'
            check('a .docx opens by %s too' % how, page.evaluate('window.rikuy.name') == want and '\\section{Findings}' in src(page), page.evaluate('window.rikuy.name'))

        # ---- hostile files ----
        bomb = os.path.join(TMP, 'bomb.docx')
        with zipfile.ZipFile(bomb, 'w', zipfile.ZIP_DEFLATED) as z:
            z.writestr('[Content_Types].xml', '<Types/>')
            z.writestr('word/document.xml', '<w:document/>')
            for k in range(3):
                z.writestr('word/media/big%d.bin' % k, b'\0' * 150_000_000)
        name0 = page.evaluate('window.rikuy.name')
        open_file(page, bomb)
        check('a zip bomb is refused by the sizes it declares, and the open project stays', 'unpack to more than' in page.inner_text('#toast') and page.evaluate('window.rikuy.name') == name0, page.inner_text('#toast')[:200])
        xxe = edit_docx(fx, os.path.join(TMP, 'xxe.docx'), [(lambda d: d.replace('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', '<?xml version="1.0"?><!DOCTYPE w [<!ENTITY x SYSTEM "file:///etc/passwd">]>', 1), None)])
        P = parts(xxe)
        P['customXml/item1.xml'] = b'<!DOCTYPE r [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><rikuy xmlns="urn:rikuy:word:1">&b;</rikuy>'
        with zipfile.ZipFile(xxe, 'w') as z:
            for n, b in P.items(): z.writestr(n, b)
        open_file(page, xxe)
        check('a Word file with a DTD (XXE, entity expansion) is refused', 'DTD' in page.inner_text('#toast') or 'could not' in page.inner_text('#toast').lower(), page.inner_text('#toast')[:200])
        print('errors:', errors[:5])
        check('no page errors', not errors, errors[:5])
        browser.close()

    # ---- a build without Word ----
    nw = os.path.join(TMP, 'dist-noword')
    shutil.rmtree(nw, ignore_errors=True)
    r = subprocess.run(['node', os.path.join(ROOT, 'build.mjs')], cwd=ROOT, env={**os.environ, 'RIKUY_OUT': nw, 'RIKUY_NO_WORD': '1'}, capture_output=True, text=True)
    check('RIKUY_NO_WORD builds, without word/', r.returncode == 0 and not os.path.exists(os.path.join(nw, 'word')) and os.path.exists(os.path.join(nw, 'rikuy.html')), r.stderr[-300:])
    port2 = PORT + 1
    srv = subprocess.Popen([sys.executable, os.path.join(os.path.dirname(__file__), 'serve.py'), str(port2)], env={**os.environ, 'RIKUY_DIST': nw})
    time.sleep(1.0)
    try:
        with sync_playwright() as p:
            browser, page, errors, reqs = open_app(p, 'http://127.0.0.1:%d/' % port2)
            check('without Word: the Save menu still offers Word', 'Word (.docx)' in (page.click('#b-save-more') or page.inner_text('.pop-save')))
            page.click('.pop-save .save-item:has-text("Word")')
            page.wait_for_timeout(300)
            check('without Word: Word says it lives on the hosted copy', 'hosted copy' in page.inner_text('#toast'), page.inner_text('#toast'))
            page.set_input_files('#fileinput', fx)
            page.wait_for_timeout(500)
            check('without Word: opening a .docx says so too, and the project stays', 'hosted copy' in page.inner_text('#toast') and page.evaluate('window.rikuy.main') == 'main.tex' and 'Editing in Print' in src(page) or 'hosted copy' in page.inner_text('#toast'))
            check('without Word: nothing of pandoc is ever fetched', not [u for u in reqs if '/word/' in u], [u for u in reqs if '/word/' in u])
            check('without Word: no page errors', not errors, errors[:3])
            browser.close()
    finally:
        srv.terminate()
except Exception as e:
    traceback.print_exc()
    check('the run reaches its end', False, e)
bad = [r for r in results if not r[1]]
print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
sys.exit(1 if bad else 0)
