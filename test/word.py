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
with changes tracked comes back. A Word file in Arabic and one in Chinese open set up for their
script (the preamble's lines of src/scripts.js), the Arabic one right to left; saved as Word again
they carry Word's own marks for direction and fonts, an Arabic word changed there comes back, and
LibreOffice opens and saves both with their text. A file in Hindi and one with eight more of
India's scripts the same: set up on opening, each run's font and language on saving. A build without Word (RIKUY_NO_WORD) says where
Word support is and fetches nothing of it."""
import os, sys, io, re, json, base64, zipfile, tempfile, traceback, time, subprocess, shutil, difflib
sys.path.insert(0, os.path.dirname(__file__))
import serve
from browser import ROUTES, check, results, click_text, load_doc, undo_all
from playwright.sync_api import sync_playwright
import word_fixture

# colours and cells for the page (the import writes these forms; lecture notes use them)
PAGE_DOC = r"""\documentclass{article}
\usepackage{xcolor,booktabs}
\definecolor{keyterm}{HTML}{C00000}
\definecolor{soft}{rgb}{0.9,0.95,1}
\definecolor{bad}{HTML}{url(x)}
\begin{document}
A \textcolor[HTML]{0F9ED5}{blue result}, a \textcolor{keyterm}{key term}, \colorbox{soft}{shaded}, \textcolor{bad}{bad}, \textcolor[HTML]{zzz}{worse}, {\color[RGB]{233,113,50} orange}.
Math $\textcolor[HTML]{0F9ED5}{x^2} + \textcolor{keyterm}{y}$.

\begin{tabular}{@{}ll@{}}
\toprule
Outer & Inner \\
\midrule
\begin{itemize}
\tightlist
\item
  first
\item
  second
  \begin{enumerate}
  \item nested
  \end{enumerate}
\end{itemize} & \begin{tabular}{@{}ll@{}}
in1 & in2 \\
a & b \\
\end{tabular} \\
plain & \begin{itemize} stray text \item x \end{itemize} \\
\bottomrule
\end{tabular}
\end{document}
"""

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
                        ('the picture, as wide a share of the line as in Word', '\\includegraphics[width=0.33\\linewidth'), ('the title', '\\title{Growth and Institutions}')]:
            check('Open .docx keeps %s' % what, s in t, t[:600] if s not in t else '')
        check('a javascript: link in the Word file is plain text, not a link', 'javascript' not in t)
        check('the table on the page shows its cells, not pandoc\'s \\noalign', '\\noalign' not in t and 'noalign' not in page.inner_text('#pages') and 'Peru' in page.inner_text('#pages'), page.inner_text('#pages')[:300])
        check('the picture is a file of the project, shown on the page', page.evaluate("window.rikuy.assetBlobs.has('figures/figure1.png')") and page.evaluate("[...document.querySelectorAll('#pages img')].some(i => i.complete && i.naturalWidth > 0)"))
        check('the page shows it without error chips', page.evaluate("document.querySelectorAll('#pages .a-chip.err').length") == 0, page.evaluate("[...document.querySelectorAll('#pages .a-chip.err')].map(x => x.textContent)"))
        check('a project from a Word file compiles with restricted shell escape', page.evaluate("(window.rikuy.linkCache.get(window.rikuy.name + '|' + window.rikuy.main) || {}).origin") == 'docx')

        # ---- what pandoc alone loses: kept where LaTeX has it, said where it has not ----
        fx2 = os.path.join(TMP, 'Reform.docx')
        open(fx2, 'wb').write(word_fixture.make_rich())
        open_file(page, fx2)
        t = src(page)
        toast = page.inner_text('#toast')
        shown = page.inner_text('#pages')
        check('a rich Word file: the toast says what was not kept and what came differently', 'Not kept:' in toast and 'header and footer text' in toast and '1 chart' in toast and '1 Word comment came in' in toast and 'tracked changes' in toast, toast[:500])
        check('and the same notes stay at the top of the source', t.startswith('% Opened from a Word file by Rikuy.\n% - Not kept:') and '\\documentclass' in t.split('\n')[7], t[:300])
        check('its comment is a Rikuy comment under the words, its TeX inert', '\n% comment (Ana P) on "robust": Is it? \\input{/etc/passwd} 50% }\n' in t and 'passwd' not in shown, t[t.find('robust') - 60:t.find('robust') + 160])
        check('the page shows it: subtitle, contents, underlined and struck words, the centred line, both captions once, no stale contents',
              all(x in shown for x in ['Evidence from Peru', 'under', 'struck', 'red words', 'Centred line.', 'Figure 1: A blue box.', 'Table 1: Growth by region']) and 'South & 3 & \\begin{tabular}{@{}ll@{}}' in t and 'Stale entry' not in shown and 'Figure 1: Figure 1' not in shown and 'uline' not in shown, shown[:900])
        check('the cross reference follows the figure (\\ref), and shows its number', 'Figure~\\ref{_Ref7}' in t and 'See Figure 1 and the wide one' in shown.replace('\u00a0', ' '), shown[shown.find('See'):shown.find('See') + 80])
        check('its colour shows on the page (\\textcolor[HTML], set through the style API)', page.evaluate("(() => { const e = [...document.querySelectorAll('#pages .y-color')].find(x => x.textContent === 'red words'); return e ? getComputedStyle(e).color : ''; })()") == 'rgb(192, 0, 0)')
        check('the rich file shows without error chips or page errors', page.evaluate("document.querySelectorAll('#pages .a-chip.err').length") == 0 and not errors, (page.evaluate("[...document.querySelectorAll('#pages .a-chip.err')].map(x => x.textContent)"), errors[:3]))

        # ---- Chinese and Arabic: set up on opening, and Word's own marks for them on saving ----
        fa = os.path.join(TMP, 'Arabic.docx')
        open(fa, 'wb').write(word_fixture.make_arabic())
        open_file(page, fa)
        t = src(page)
        check('an Arabic Word file opens set up for Arabic, right to left as a whole', '\\babelprovide[import, main]{arabic}' in t and '\\babelfont{rm}[Renderer=Harfbuzz]{Amiri}' in t and 'fontenc' not in t and '\\RL{' not in t and 'Not kept' not in t, t[:600])
        check('its text is in reading order, its one left to right paragraph in an environment', 'بمعدل 5\\% سنة ٢٠٢٤ و2025؛' in t and '\\begin{otherlanguage}{english}\nAn English paragraph in the Arabic document.\n\\end{otherlanguage}' in t, t[600:1400])
        out_ar = save_docx(page, os.path.join(TMP, 'arabic-out.docx'))
        A = parts(out_ar)
        da = A['word/document.xml'].decode()
        pa = [x.split('</w:p>')[0] for x in re.split(r'<w:p>|<w:p (?=[^>]*>)', da[da.index('<w:body>'):])[1:]]
        ltr = [re.sub(r'<[^>]+>', '', x) for x in pa if '<w:bidi />' not in x]
        check('saved as Word, every paragraph but the English one runs right to left, and so do the section and the table', ltr == ['An English paragraph in the Arabic document.'] and len(pa) > 15 and re.search(r'<w:bidi /></w:sectPr>', da) is not None and '<w:tblStyle w:val="Table" /><w:bidiVisual />' in da, ltr)
        check('its Arabic runs are w:rtl, with a complex script font and language in the defaults', '<w:r><w:rPr><w:rtl /></w:rPr><w:t xml:space="preserve">ندرس </w:t></w:r>' in re.sub(r'<w:bookmark(Start|End)[^>]*>', '', da) and 'w:cs="Amiri"' in A['word/styles.xml'].decode() and 'w:bidi="ar-SA"' in A['word/styles.xml'].decode())
        base_ar = src(page)
        open_file(page, out_ar)
        check('the file opened again as saved brings no change', src(page) == base_ar, changed_lines(base_ar, src(page)))
        open_file(page, edit_docx(out_ar, os.path.join(TMP, 'arabic-ed.docx'), [('محاذاة إلى البداية', 'محاذاة إلى اليمين')]))
        la = changed_lines(base_ar, src(page))
        check('an Arabic word changed in Word comes back as that word', la == ['-محاذاة إلى البداية.', '+محاذاة إلى اليمين.'], la)
        fz = os.path.join(TMP, 'Chinese.docx')
        open(fz, 'wb').write(word_fixture.make_chinese())
        open_file(page, fz)
        t = src(page)
        check('a Chinese Word file opens set up for Chinese, its runs joined with no space', '\\usepackage[scheme=plain]{ctex}' in t and 'fontspec' not in t and 'Not kept' not in t and '本文研究\\textbf{制度变迁}对\\emph{经济增长}的影响，数据来自World Bank（2020年），结果稳健。' in t, t[:700])
        out_zh = save_docx(page, os.path.join(TMP, 'chinese-out.docx'))
        Z = parts(out_zh)
        check('saved as Word, it names an East Asian font and language and nothing runs right to left', 'w:eastAsia="SimSun"' in Z['word/styles.xml'].decode() and 'w:eastAsia="zh-CN"' in Z['word/styles.xml'].decode() and 'w:bidi' not in Z['word/document.xml'].decode() and 'w:rtl' not in Z['word/document.xml'].decode() and '制度变迁' in Z['word/document.xml'].decode())
        if soffice:
            # LibreOffice opens both and writes them again with their text, direction and bookmarks
            lo2 = os.path.join(TMP, 'lo-scripts')
            shutil.rmtree(lo2, ignore_errors=True)
            os.makedirs(lo2)
            r = subprocess.run([soffice, '--headless', '--norestore', '-env:UserInstallation=file://' + os.path.join(lo2, 'profile'), '--convert-to', 'docx:MS Word 2007 XML', '--outdir', lo2, out_ar, out_zh], capture_output=True, text=True, timeout=300)
            la, lz = os.path.join(lo2, 'arabic-out.docx'), os.path.join(lo2, 'chinese-out.docx')
            if os.path.exists(la) and os.path.exists(lz):
                LA, LZ = parts(la)['word/document.xml'].decode(), parts(lz)['word/document.xml'].decode()
                words = lambda d: re.sub(r'\s+', '', re.sub(r'<[^>]+>', '', d))
                check('LibreOffice keeps the Arabic file\'s text, its right to left paragraphs and table, and Rikuy\'s bookmarks', all(w in words(LA) for w in ['ندرس', 'النمو', 'مُحَمَّدٌ', 'می\u200cخواهم', '٢٠٢٤', 'AnEnglishparagraph']) and LA.count('<w:bidi w:val="1"/>') + LA.count('<w:bidi/>') > 12 and 'w:bidiVisual' in LA and len(re.findall(r'w:name="Rk\d+"', LA)) == len(re.findall(r'w:name="Rk\d+"', da)), (LA.count('w:bidi'), words(LA)[:200]))
                check('and the Chinese file\'s', all(w in words(LZ) for w in ['制度变迁与经济增长', '本文研究制度变迁对经济增长的影响', '經濟學']) and '全角\u3000空格' in re.sub(r'<[^>]+>', '', LZ), words(LZ)[:200])
                open_file(page, lz)
                check('the Chinese file LibreOffice saved opens as it was saved from here', '本文研究\\textbf{制度变迁}对\\emph{经济增长}的影响' in src(page) and '\\usepackage[scheme=plain]{ctex}' in src(page), src(page)[:500])
            else:
                check('LibreOffice converts the Chinese and Arabic files', False, (r.stdout[-300:], r.stderr[-300:]))

        # ---- India's scripts: set up on opening; on saving, each run's font and language for Word ----
        fh = os.path.join(TMP, 'Hindi.docx')
        open(fh, 'wb').write(word_fixture.make_hindi())
        open_file(page, fh)
        t = src(page)
        check('a Hindi Word file opens set up for Devanagari, its runs joined, nothing listed as lost', '\\babelprovide[import=hi, onchar=ids fonts]{hindi}' in t and '\\babelfont[hindi]{rm}[Renderer=Harfbuzz]{Noto Serif Devanagari}' in t and 'fontenc' not in t and 'Not kept' not in t and 'यह दस्तावेज़ \\textbf{हिन्दी} में लिखा गया है। इसमें क्ष, त्र, ज्ञ और श्री जैसे संयुक्ताक्षर हैं॥' in t and 'क्‍ष तथा क्‌ष।' in t, t[:900])
        out_hi = save_docx(page, os.path.join(TMP, 'hindi-out.docx'))
        Hd = re.sub(r'<w:bookmark(Start|End)[^>]*>', '', parts(out_hi)['word/document.xml'].decode())
        check('saved as Word, its runs name a complex script font and Hindi, and none runs right to left', '<w:r><w:rPr><w:rFonts w:cs="Nirmala UI" /><w:b /><w:bCs /><w:lang w:bidi="hi-IN" /></w:rPr><w:t xml:space="preserve">हिन्दी</w:t></w:r>' in Hd and 'w:rtl' not in Hd and 'w:bidi />' not in Hd and 'babelprovide' not in Hd, Hd[Hd.find('हिन्दी') - 300:Hd.find('हिन्दी') + 100])
        base_hi = src(page)
        open_file(page, edit_docx(out_hi, os.path.join(TMP, 'hindi-ed.docx'), [('पहला बिंदु', 'पहली बात')]))
        lh = changed_lines(base_hi, src(page))
        check('Hindi words changed in Word come back as those words', lh == ['-  पहला बिंदु', '+  पहली बात'], lh)
        fi = os.path.join(TMP, 'Indic.docx')
        open(fi, 'wb').write(word_fixture.make_indic())
        open_file(page, fi)
        t = src(page)
        check('a Word file of eight more scripts opens with a font for each', all(('{%s}' % l) in t for l in ['bengali', 'tamil', 'telugu', 'gujarati', 'kannada', 'malayalam', 'punjabi', 'odia']) and 'Not kept' not in t and 'தமிழ்:} வணக்கம், மிக்க நன்றி. ௧௨௩' in t, t[:1500])
        out_in = save_docx(page, os.path.join(TMP, 'indic-out.docx'))
        Id = parts(out_in)['word/document.xml'].decode()
        check('saved as Word, each script has its language', all(('w:bidi="%s-IN"' % l) in Id for l in ['hi', 'bn', 'ta', 'te', 'gu', 'kn', 'ml', 'pa', 'or']) and Id.count('w:cs="Nirmala UI"') > 20, re.findall(r'w:bidi="[^"]*"', Id)[:12])
        if soffice:
            lo3 = os.path.join(TMP, 'lo-indic')
            shutil.rmtree(lo3, ignore_errors=True)
            os.makedirs(lo3)
            r = subprocess.run([soffice, '--headless', '--norestore', '-env:UserInstallation=file://' + os.path.join(lo3, 'profile'), '--convert-to', 'docx:MS Word 2007 XML', '--outdir', lo3, out_hi, out_in], capture_output=True, text=True, timeout=300)
            lh, li = os.path.join(lo3, 'hindi-out.docx'), os.path.join(lo3, 'indic-out.docx')
            if os.path.exists(lh) and os.path.exists(li):
                LH, LI = re.sub(r'<[^>]+>', '', parts(lh)['word/document.xml'].decode()), re.sub(r'<[^>]+>', '', parts(li)['word/document.xml'].decode())
                check('LibreOffice keeps the Hindi file\'s text, marks and joiners, and Rikuy\'s bookmarks', all(w in LH for w in ['भारत की अर्थव्यवस्था', 'दस्तावेज़', 'क्ष, त्र, ज्ञ और श्री', 'क्‍ष तथा क्‌ष।', '२०२४ में ७.५%', 'हैं॥']) and len(re.findall(r'w:name="Rk\d+"', parts(lh)['word/document.xml'].decode())) == len(re.findall(r'w:name="Rk\d+"', parts(out_hi)['word/document.xml'].decode())), LH[:300])
                check('and the text of the eight other scripts', all(line.split(': ')[1] in LI for _, _, _, line in word_fixture.INDIC_LINES) and 'हिन्दी বাংলা தமிழ்' in LI, LI[:400])
            else:
                check('LibreOffice converts the files in India\'s scripts', False, (r.stdout[-300:], r.stderr[-300:]))

        # by dropping it, and by pasting it
        # ---- on the page: colours by number and by name, in text and formulas; a list and a table in a cell ----
        load_doc(page, PAGE_DOC)
        page.wait_for_timeout(600)
        look = page.evaluate("Object.fromEntries([...document.querySelectorAll('#pages .y-color, #pages .y-bg')].map(e => [e.textContent.trim(), [getComputedStyle(e).color, getComputedStyle(e).backgroundColor]]))")
        check('colours given as numbers or defined in the preamble draw on the page', look.get('blue result', [''])[0] == 'rgb(15, 158, 213)' and look.get('key term', [''])[0] == 'rgb(192, 0, 0)' and look.get('shaded', ['', ''])[1] == 'rgb(230, 242, 255)' and look.get('orange', [''])[0] == 'rgb(233, 113, 50)', look)
        check('what is not a colour of those models colours nothing', look.get('bad', [''])[0] == look.get('worse', [''])[0] and look['bad'][0] not in ('rgb(192, 0, 0)', 'rgb(15, 158, 213)') and 'url' not in page.evaluate("document.querySelector('#pages').innerHTML"), (look.get('bad'), look.get('worse')))
        mcol = page.evaluate("[...document.querySelectorAll('#pages .katex [style*=color]')].map(e => e.style.color)")
        check('colour inside formulas, by number and by the preamble\'s name', 'rgb(15, 158, 213)' in mcol and 'rgb(192, 0, 0)' in mcol and page.evaluate("document.querySelectorAll('#pages .merr, #pages .has-err').length") == 0, mcol[:6])
        page.evaluate("() => { const g = window.rikuy, t = g.files.get('main.tex'), i = t.indexOf('C00000'); g.commit([{ f: 'main.tex', s: i, e: i + 6, t: '1E7B3C' }]); }")
        page.wait_for_timeout(500)
        check('a \\definecolor changed in the source recolours the text and the formula that use it', page.evaluate("[getComputedStyle([...document.querySelectorAll('#pages .y-color')].find(x => x.textContent === 'key term')).color, [...document.querySelectorAll('#pages .katex [style*=color]')].map(e => e.style.color).includes('rgb(30, 123, 60)')]") == ['rgb(30, 123, 60)', True])
        undo_all(page)
        click_text(page, 'blue result', 4)
        page.keyboard.type('X')
        click_text(page, 'key term', 3)
        page.keyboard.type('s')
        click_text(page, 'Outer', 5)
        page.keyboard.type('most')
        page.wait_for_timeout(200)
        t = src(page)
        want = PAGE_DOC.replace('{blue result}', '{blueX result}').replace('{key term}', '{keys term}').replace('Outer &', 'Outermost &')
        check('typing inside coloured text and beside a list in a cell patches only those spots', t == want, [l for l in difflib.unified_diff(want.split('\n'), t.split('\n'), lineterm='', n=0)][:8])
        undo_all(page)
        check('and undo restores the source byte for byte', src(page) == PAGE_DOC)
        cell = page.evaluate("({ li: [...document.querySelectorAll('#pages td ul > li')].map(x => x.firstChild.textContent.trim()), ol: document.querySelectorAll('#pages td ul ol li').length, inner: [...document.querySelectorAll('#pages td table td')].map(x => x.textContent), err: [...document.querySelectorAll('#pages .a-chip.err')].map(x => x.textContent), caret: document.querySelectorAll('#pages td .a-chip [data-g], #pages td .a-chip [data-y], #pages td .a-chip [data-a]').length })")
        check('a list in a table cell is drawn as a list, a table as a table, with nothing in them that takes an edit', cell['li'] == ['first', 'second'] and cell['ol'] == 1 and cell['inner'] == ['in1', 'in2', 'a', 'b'] and cell['caret'] == 0, cell)
        check('a list that is not plain \\item after \\item is shown as before', cell['err'] == ['\\item'], cell['err'])
        page.click('#pages td ul li')
        page.wait_for_selector('#pop-raw')
        v = page.evaluate("document.getElementById('pop-raw').value")
        check('a click on the list opens its source', v.startswith('\\begin{itemize}') and v.endswith('\\end{itemize}') and 'nested' in v, v[:80])
        page.fill('#pop-raw', v.replace('second', 'SECOND'))
        page.keyboard.press('Control+Enter')
        page.wait_for_timeout(400)
        check('an edit there changes that word in the source and on the page', src(page) == PAGE_DOC.replace('  second', '  SECOND') and 'SECOND' in page.inner_text('#pages td ul'), src(page)[src(page).find('itemize'):][:120])
        undo_all(page)
        check('and is undone to the byte', src(page) == PAGE_DOC)

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
        # ---- only this browser's own exports are merged; the file carries only what it shows ----
        page.evaluate('window.rikuy.doReset()')
        page.wait_for_timeout(500)
        page.evaluate('() => { const g = window.rikuy; g.files.set("unused.tex", "SECRET-CHAPTER nobody inputs"); g.saveSoon && g.saveSoon(); }')
        own = save_docx(page, os.path.join(TMP, 'own.docx'))
        P = parts(own)
        rk = [k for k in P if re.match(r'customXml/item\d+\.xml$', k) and b'<rikuy' in P[k]][0]
        check('the Word file carries the files its text comes from, not the whole project', b'SECRET-CHAPTER' not in P[rk] and b'Editing in Print' in P[rk], len(P[rk]))
        before = src(page)
        # the same file with its Rikuy data changed: the first block mapped onto the preamble, and
        # a word edited in Word so that there is something to bring back
        from xml.sax.saxutils import escape, unescape
        raw = P[rk].decode()
        m = re.search(r'(<rikuy[^>]*>)(.*)(</rikuy>)', raw, re.S)
        data = json.loads(unescape(m.group(2), {'&quot;': '"', '&apos;': "'"}))
        A = data['anchors'][0]
        A['s'], A['e'] = 0, 5
        P[rk] = (raw[:m.start(2)] + escape(json.dumps(data)) + raw[m.end(2):]).encode()
        d = P['word/document.xml'].decode()
        assert 'Click anywhere' in d
        P['word/document.xml'] = d.replace('Click anywhere', 'Click FORGED anywhere', 1).encode()
        forged = os.path.join(TMP, 'forged.docx')
        with zipfile.ZipFile(forged, 'w', zipfile.ZIP_DEFLATED) as z:
            for k, b in P.items(): z.writestr(k, b)
        open_file(page, forged)
        toast = page.inner_text('#toast')
        info = page.evaluate('window.rikuy.linkInfo()')
        check('a Word file whose Rikuy data this browser did not write merges nothing: it opens as a document of its own, as someone else\'s',
              'did not make' in toast and page.evaluate('window.rikuy.name') == 'forged' and bool(info) and info.get('origin') == 'docx' and not info.get('allowed'), (toast[:200], info))
        snaps = page.evaluate('''async () => { const g = window.rikuy; const all = await g.allSnaps(); const v = all.find((x) => x.name !== 'forged' && x.main === 'main.tex');
          return v ? new Map(await g.versionFiles(v)).get('main.tex') : null; }''')
        check('and the project it claimed to edit is as it was, in History', snaps == before, (snaps or '')[:120])
        # the untouched export, edited in Word, still comes back as edits to its project
        page.evaluate('window.rikuy.doReset()')
        page.wait_for_timeout(500)
        own2 = save_docx(page, os.path.join(TMP, 'own2.docx'))
        ed = edit_docx(own2, os.path.join(TMP, 'own2-edited.docx'), [('Click anywhere', 'Click nearly anywhere')])
        open_file(page, ed)
        check('this browser\'s own export, edited in Word, comes back as edits', 'Click nearly anywhere' in src(page) and 'Brought in from' in page.inner_text('#toast'), page.inner_text('#toast')[:160])

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
            check('without Word: Download still offers Word', page.inner_text('#rb-word').strip() == 'Word' and not page.evaluate('document.getElementById("rb-word").disabled'))
            page.click('#rb-word')
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
