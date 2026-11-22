"""The File tab (src/cmd/file.js), in Chromium.

New: Blank document from the default preamble (Set as default, and Forget the default), each of
New from template's eight skeletons opened as a document of its own and, where dist/tex exists,
compiled in the page without an error. Open: Recent documents lists the documents kept in this
browser and opens one; Rename a document gives one another name, its versions, its pictures and
the open one's record with it (a taken or an empty name refused). Info: Properties as round trips (a title replaced in place, one added
before \\begin{document}, & escaped, braces that do not pair refused, subject and keywords into an
existing \\hypersetup, into hyperref's options, a new hyperref with hidelinks, a \\hypersetup line
under beamer, which loads hyperref itself; one undo each, back byte for byte; hand written
\\hypersetup read back into the dialog's fields); Check accessibility (pictures without alt text,
a skipped heading level, a table without a header row, no language; Tag the PDF writing
\\DocumentMetadata once, or tagging=on into one already there, one undo; where dist/tex exists,
what it writes compiled on pdfLaTeX, XeLaTeX and LuaLaTeX into a tagged PDF 2.0). Save a copy: Export as, with pandoc where dist/word exists
(HTML, Markdown and plain text holding the document's words). Phones: the File tab's buttons 44 px
and its dialogs on the screen at 390 px.

RIKUY_DIST names another dist/."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import settle, open_page, check, results, src, load_doc, click_text, roundtrip
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist')
TEX = os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm'))
WORD = os.path.isdir(os.path.join(DIST, 'word'))
SHOTS = os.environ.get('RIKUY_SHOTS', '/tmp/B12-shots')
os.makedirs(SHOTS, exist_ok=True)
DOC = '\\documentclass{article}\n\\usepackage{amsmath}\n\\title{Old title}\n\\author{Ann}\n\\begin{document}\n\\maketitle\nSome words here.\n\\end{document}\n'


def ev(page, js, arg=None):
    return page.evaluate(js, arg) if arg is not None else page.evaluate(js)


def props(v):
    return lambda page: page.evaluate('(v) => window.rikuy.runCommand("properties", v)', v)


def new_docs(page):
    page.get_by_role('tab', name='File', exact=True).click(); settle(page, 300)
    for n in ('Blank document', 'New from template', 'Browse', 'Recent documents', 'Properties', 'Check accessibility', 'Export as', 'Print PDF', 'Set as default'):
        check('File has ' + n, page.get_by_role('button', name=n, exact=True).count() == 1)
    page.screenshot(path=os.path.join(SHOTS, 'file-tab-1366.png'))
    page.get_by_role('button', name='New from template', exact=True).click(); settle(page, 300)
    items = page.get_by_role('menuitem').all_inner_texts()
    check('New from template lists eight templates', [i.split('\n')[0] for i in items] == ['Article', 'Report', 'Book or thesis', 'Letter', 'KOMA-Script article', 'Slides', 'Exam', 'CV'], items)
    page.keyboard.press('Escape')
    for tid in ('article', 'report', 'book', 'letter', 'scrartcl', 'beamer', 'exam', 'cv'):
        ev(page, '(t) => window.rikuy.runCommand("new-template", t)', tid); settle(page, 900)
        s = src(page)
        ok = s.startswith('\\documentclass') and '\\begin{document}' in s and ev(page, 'window.rikuy.files.size') == 1
        if not TEX: print('SKIP template ' + tid + ' compiled: no TeX tree in %s' % DIST)
        if TEX:
            r = ev(page, 'window.rikuy.api.compile()')
            errs = [x for x in r['problems'] if x.get('severity') == 'error']
            check('template ' + tid + ': a document of its own that compiles in the page', ok and r['ok'] and r['pages'] >= 1 and not errs, (r['ok'], errs[:2]))
        else:
            check('template ' + tid + ': a document of its own', ok, s[:80])
    names = ev(page, '(async () => (await window.rikuy.allSnaps()).map((v) => v.name))()')
    check('each template opened as a new document, the others kept', 'Report' in names and 'Slides' in names and ev(page, 'window.rikuy.name') == 'CV', names[:12])
    # Recent documents: the others, newest first; one opens
    page.get_by_role('tab', name='File', exact=True).click(); settle(page, 200)
    page.get_by_role('button', name='Recent documents', exact=True).click(); settle(page, 500)
    items = page.get_by_role('menuitem').all_inner_texts()
    check('Recent documents lists the others, newest first, not the open one', items and items[0].startswith('Exam') and not any(i.startswith('CV') for i in items), items)
    page.get_by_role('menuitem', name='Report', exact=True).click(); settle(page, 900)
    check('a press opens it', ev(page, 'window.rikuy.name') == 'Report' and '\\documentclass[11pt]{report}' in src(page))
    # L6: Remove takes the document's pictures out of the browser too (Learn Rikuy has one)
    ev(page, "window.rikuy.runCommand('help-tour')"); settle(page, 1200)
    tour = ev(page, 'window.rikuy.name')
    ev(page, '() => window.rikuy.runCommand("new-template", "article")'); settle(page, 1200)
    KV = "(k) => new Promise((ok) => { const q = indexedDB.open('galley'); q.onsuccess = () => { const t = q.result.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => ok(!!t.result); t.onerror = () => ok(null); }; q.onerror = () => ok(null); })"
    had = ev(page, KV, 'bin:' + tour + '|main.tex')
    ev(page, '(n) => window.rikuy.runCommand("recent", { remove: n })', tour); settle(page, 300)
    page.click('#toast button'); settle(page, 800)
    check('L6: Remove takes the document\'s versions and its pictures', had is True and ev(page, KV, 'bin:' + tour + '|main.tex') is False and tour not in ev(page, '(async () => (await window.rikuy.allSnaps()).map((v) => v.name))()'), (had, tour))
    # Set as default
    load_doc(page, DOC)
    ev(page, 'window.rikuy.runCommand("set-default", "set")')
    ev(page, 'window.rikuy.runCommand("new-blank")'); settle(page, 900)
    check('Set as default: a blank document starts with this preamble', src(page) == DOC[:DOC.index('\\begin{document}')].rstrip() + '\n\n\\begin{document}\n\n\\end{document}\n', src(page))
    load_doc(page, {'main.tex': DOC.replace('\\usepackage{amsmath}', '\\input{macros}'), 'macros.tex': '\\newcommand\\R{x}\n'})
    check('L9: Set as default refuses a preamble that reads the project\'s files', ev(page, 'window.rikuy.runCommand("set-default", "set")') is False)
    load_doc(page, DOC.replace('\\usepackage{amsmath}', '\\makeatletter\\def\\input@path{{figs/}}\\makeatother'))
    check('V8: Set as default takes a preamble with \\input@path (it reads no file)', ev(page, 'window.rikuy.runCommand("set-default", "set")') is True)
    ev(page, 'window.rikuy.runCommand("set-default", "reset")')
    ev(page, 'window.rikuy.runCommand("new-blank")'); settle(page, 900)
    check('Forget the default: a plain article again', src(page).startswith('\\documentclass{article}\n\\usepackage{amsmath}\n\n\\begin{document}'), src(page))


def rename(page):
    """F4: Recent documents renames a document kept here: all of its versions, its pictures in the
    browser, the open one too (the bar, the record a reload opens); a taken or an empty name is
    refused."""
    names = lambda: ev(page, '(async () => (await window.rikuy.allSnaps()).map((v) => v.name))()')
    KV = "(k) => new Promise((ok) => { const q = indexedDB.open('galley'); q.onsuccess = () => { const t = q.result.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => ok(t.result === undefined ? false : t.result); t.onerror = () => ok(null); }; q.onerror = () => ok(null); })"
    PUT = "([k, v]) => new Promise((ok) => { const q = indexedDB.open('galley'); q.onsuccess = () => { const t = q.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => ok(true); t.onerror = () => ok(false); }; })"
    ev(page, '() => window.rikuy.runCommand("new-template", "letter")'); settle(page, 900)
    first = ev(page, 'window.rikuy.name')
    ev(page, '() => window.rikuy.runCommand("new-template", "exam")'); settle(page, 900)
    opened = ev(page, 'window.rikuy.name')
    n0 = names().count(first)
    ev(page, PUT, ['bin:' + first + '|main.tex', {'assets': [], 'extra': [], 'orig': []}])
    page.get_by_role('tab', name='File', exact=True).click(); settle(page, 200)
    page.get_by_role('button', name='Recent documents', exact=True).click(); settle(page, 500)
    page.get_by_role('menuitem', name='Rename a document…', exact=True).click(); settle(page, 300)
    items = page.get_by_role('menuitem').all_inner_texts()
    check('Rename a document… lists the open document and the others', any(i.startswith('Rename ' + opened + ' (open)') for i in items) and any(i.startswith('Rename ' + first) for i in items), items)
    page.get_by_role('menuitem', name='Rename ' + first, exact=True).click(); settle(page, 300)
    dlg = page.get_by_role('dialog', name='Rename a document')
    field = dlg.get_by_role('textbox', name='New name')
    check('a dialog "Rename a document", its field "New name" holding the name now', dlg.count() == 1 and field.input_value() == first)
    page.screenshot(path=os.path.join(SHOTS, 'file-rename-1366.png'))
    field.fill('My letter'); dlg.get_by_role('button', name='Rename', exact=True).click(); settle(page, 900)
    ns = names()
    check('renamed: every version under the new name, none under the old', n0 >= 1 and ns.count('My letter') == n0 and first not in ns, (n0, ns[:8]))
    check('its pictures kept in the browser go with it', ev(page, KV, 'bin:My letter|main.tex') not in (False, None) and ev(page, KV, 'bin:' + first + '|main.tex') is False)
    check('the open document stays open and untouched', ev(page, 'window.rikuy.name') == opened)
    ok = ev(page, '(n) => window.rikuy.runCommand("recent", { rename: n, to: "Exam renamed" })', opened); settle(page, 500)
    rec = ev(page, KV, 'project')
    check('the open document renamed: the bar says it, its versions follow, the record a reload opens too',
          ok is True and ev(page, 'window.rikuy.name') == 'Exam renamed' and ev(page, "document.getElementById('docname').textContent") == 'Exam renamed'
          and 'Exam renamed' in names() and opened not in names() and rec and rec.get('name') == 'Exam renamed', (ok, ev(page, 'window.rikuy.name'), rec and rec.get('name')))
    check('a name another document has is refused', ev(page, '() => window.rikuy.runCommand("recent", { rename: "Exam renamed", to: "My letter" })') is False and ev(page, 'window.rikuy.name') == 'Exam renamed')
    check('security: a | in a new name (records are kept under name|main) becomes a space', ev(page, '() => window.rikuy.runCommand("recent", { rename: "Exam renamed", to: "a|main.tex" })') is True and ev(page, 'window.rikuy.name') == 'a main.tex')
    ev(page, '() => window.rikuy.runCommand("recent", { rename: "a main.tex", to: "Exam renamed" })')
    check('an empty name is refused', ev(page, '() => window.rikuy.runCommand("recent", { rename: "My letter", to: "   " })') is False and 'My letter' in names())
    ev(page, '() => window.rikuy.runCommand("recent", { open: "My letter" })'); settle(page, 900)
    check('the renamed document opens under its name, its text as it was', ev(page, 'window.rikuy.name') == 'My letter' and '\\documentclass' in src(page) and 'letter' in src(page)[:60], src(page)[:60])


def rename_atomic(page):
    """The review of R5's Rename: storage failing halfway leaves everything as it was and says so
    (M4); two renames to one name at once: one wins, the other is refused, nobody's pictures lost."""
    names = lambda: ev(page, '(async () => (await window.rikuy.allSnaps()).map((v) => v.name))()')
    KV = "(k) => new Promise((ok) => { const q = indexedDB.open('galley'); q.onsuccess = () => { const t = q.result.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => ok(t.result === undefined ? false : t.result); }; })"
    PUT = "([k, v]) => new Promise((ok) => { const q = indexedDB.open('galley'); q.onsuccess = () => { const t = q.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => ok(true); }; })"
    docs = []
    for tid in ('letter', 'exam', 'report'):
        ev(page, '(t) => window.rikuy.runCommand("new-template", t)', tid); settle(page, 900)
        docs.append(ev(page, 'window.rikuy.name'))
    a, b = docs[0], docs[1]
    for n in (a, b): ev(page, PUT, ['bin:' + n + '|main.tex', {'assets': [n], 'extra': [], 'orig': []}])
    # the storage full as the pictures' record moves
    ev(page, """() => { const put = IDBObjectStore.prototype.put; window.__put = put; IDBObjectStore.prototype.put = function (v, k) { if (typeof k === 'string' && k.startsWith('bin:Moved')) { this.transaction.abort(); return null; } return put.call(this, v, k); }; }""")
    ok = ev(page, '(n) => window.rikuy.runCommand("recent", { rename: n, to: "Moved" })', a); settle(page, 400)
    ev(page, "() => { IDBObjectStore.prototype.put = window.__put; }")
    toast = ev(page, "(document.getElementById('toast') || {}).textContent || ''")
    check('M4: storage refusing halfway: nothing renamed, the pictures where they were, and it says so', ok is False and a in names() and 'Moved' not in names() and ev(page, KV, 'bin:' + a + '|main.tex') not in (False, None) and ev(page, KV, 'bin:Moved|main.tex') is False and 'nothing was renamed' in toast, (ok, toast))
    r = ev(page, '([x, y]) => Promise.all([window.rikuy.runCommand("recent", { rename: x, to: "Same" }), window.rikuy.runCommand("recent", { rename: y, to: "Same" })])', [a, b]); settle(page, 400)
    left = names()
    pics = ev(page, KV, 'bin:Same|main.tex')
    check('two renames to one name at once: one done, one refused, no versions merged, no pictures lost',
          sorted(r) == [False, True] and (a in left) != (b in left) and pics and pics['assets'][0] in (a, b) and ev(page, KV, 'bin:' + (a if a in left else b) + '|main.tex') not in (False, None), (r, pics))


def properties(page):
    roundtrip(page, DOC, 'Some', props({'title': 'New title'}), DOC.replace('Old title', 'New title'), off_command=props({'title': 'Old title'}), label='Properties: the title replaced in place')
    roundtrip(page, DOC, 'Some', props({'author': 'Ann \\and Bo & Co'}), DOC.replace('{Ann}', '{Ann \\and Bo \\& Co}'), off_command=props({'author': 'Ann'}), label='Properties: the author, & escaped, LaTeX kept')
    bare = DOC.replace('\\title{Old title}\n', '')
    roundtrip(page, bare, 'Some', props({'title': 'Fresh'}), bare.replace('\\begin{document}', '\\title{Fresh}\n\\begin{document}'), label='Properties: a title where there was none, before \\begin{document}',
              off_command=props({'title': ''}), off=bare.replace('\\begin{document}', '\\title{}\n\\begin{document}'))
    roundtrip(page, DOC, 'Some', props({'subject': 'Economics', 'keywords': 'growth, AI'}),
              DOC.replace('\\usepackage{amsmath}\n', '\\usepackage{amsmath}\n\\IfPackageLoadedTF{hyperref}{}{\\PassOptionsToPackage{hidelinks}{hyperref}}\n\\usepackage{hyperref}\n\\hypersetup{pdfsubject={Economics},pdfkeywords={growth, AI}}\n'),
              off_command=props({'subject': '', 'keywords': ''}), off=DOC.replace('\\usepackage{amsmath}\n', '\\usepackage{amsmath}\n\\IfPackageLoadedTF{hyperref}{}{\\PassOptionsToPackage{hidelinks}{hyperref}}\n\\usepackage{hyperref}\n\\hypersetup{}\n'), label='Properties: subject and keywords, a bare hyperref (hidelinks where it is new) and \\hypersetup')
    hs = DOC.replace('\\usepackage{amsmath}\n', '\\usepackage{amsmath}\n\\usepackage{hyperref}\n\\hypersetup{colorlinks=true}\n')
    roundtrip(page, hs, 'Some', props({'keywords': 'a, b'}), hs.replace('colorlinks=true', 'colorlinks=true,pdfkeywords={a, b}'), off_command=props({'keywords': ''}), label='Properties: keywords into the \\hypersetup there is')
    hl = DOC.replace('\\usepackage{amsmath}\n', '\\usepackage{amsmath}\n\\usepackage[colorlinks]{hyperref}\n')
    roundtrip(page, hl, 'Some', props({'subject': 'X'}), hl.replace('{hyperref}\n', '{hyperref}\n\\hypersetup{pdfsubject={X}}\n'), off_command=props({'subject': ''}), off=hl.replace('{hyperref}\n', '{hyperref}\n\\hypersetup{}\n'), label='Properties: hyperref loaded with options: a \\hypersetup line after it, the options untouched')
    bm = '\\documentclass{beamer}\n\\title{T}\n\\begin{document}\n\\frame{Some words}\n\\end{document}\n'
    roundtrip(page, bm, 'Some', props({'subject': 'Talk'}), bm.replace('\\begin{document}', '\\hypersetup{pdfsubject={Talk}}\n\\begin{document}'), off_command=props({'subject': ''}), off=bm.replace('\\begin{document}', '\\hypersetup{}\n\\begin{document}'), label='Properties: beamer loads hyperref: a \\hypersetup line, no \\usepackage')
    load_doc(page, DOC); h = ev(page, 'window.rikuy.hist.length')
    ev(page, '() => window.rikuy.runCommand("properties", { title: "Bad {brace" })')
    check('braces that do not pair: refused, nothing written', src(page) == DOC and ev(page, 'window.rikuy.hist.length') == h)
    # H1: only what was changed is written; the author's comment, line breaks and & stay
    auth = '\\documentclass{article}\n\\title{A study}\n\\author{%\n  Jane Doe\\thanks{Funded by X.}\\\\\n  Department of Y % office 3\n  \\and\n  John Roe}\n\\begin{document}\\maketitle Text.\\end{document}\n'
    load_doc(page, auth); h = ev(page, 'window.rikuy.hist.length')
    page.get_by_role('tab', name='File', exact=True).click(); settle(page, 200)
    page.get_by_role('button', name='Properties', exact=True).click(); settle(page, 300)
    page.get_by_role('dialog', name='Properties', exact=True).get_by_role('button', name='Apply', exact=True).click(); settle(page, 300)
    check('H1: Apply with nothing changed writes nothing', src(page) == auth and ev(page, 'window.rikuy.hist.length') == h)
    page.get_by_role('button', name='Properties', exact=True).click(); settle(page, 300)
    dlg = page.get_by_role('dialog', name='Properties', exact=True)
    dlg.get_by_role('textbox', name='Keywords', exact=True).fill('economics, AI')
    dlg.get_by_role('button', name='Apply', exact=True).click(); settle(page, 300)
    a0 = auth[auth.index('\\author'):auth.index('\\begin')]
    check('H1: Keywords alone leave the commented, multi-line author byte for byte', a0 in src(page) and 'pdfkeywords={economics, AI}' in src(page), src(page)[:260])
    # V1: two changes typed in one field: the source between them (a % comment, a tabular &) stays
    tab = '\\documentclass{article}\n\\author{\\begin{tabular}{cc}\n Ann & Ben\\\\\n MIT & ETH\n\\end{tabular}}\n\\begin{document}x\\end{document}\n'
    for d0, edits, want in ((auth, (('Jane Doe', ' Jr'), ('John Roe', 'x')), auth.replace('Jane Doe', 'Jane Doe Jr').replace('John Roe', 'John Roex')),
                            (tab, (('Ann', ' & Co'), ('ETH', ' Zurich')), tab.replace('Ann', 'Ann \\& Co').replace('ETH', 'ETH Zurich'))):
        load_doc(page, d0)
        page.get_by_role('tab', name='File', exact=True).click(); settle(page, 200)
        page.get_by_role('button', name='Properties', exact=True).click(); settle(page, 300)
        box = page.get_by_role('dialog', name='Properties', exact=True).get_by_role('textbox', name='Author', exact=True)
        for word, typed in edits:
            box.evaluate('(t, w) => { t.focus(); const i = t.value.indexOf(w) + w.length; t.setSelectionRange(i, i); }', word)
            page.keyboard.type(typed)
        page.get_by_role('dialog', name='Properties', exact=True).get_by_role('button', name='Apply', exact=True).click(); settle(page, 300)
        check('V1: two changes typed in the Author box write those two, the source between them as it was (& typed escaped)', src(page) == want, src(page)[:220])
    if not TEX: print('SKIP the review\'s Properties documents compiled (and acmart\'s PDF Info): no TeX tree in %s' % DIST)
    if TEX:
        cases = [('the author with comments', src(page)),
                 ('cleveref (hyperref before it)', '\\documentclass{article}\n\\usepackage{amsmath}\n\\usepackage{cleveref}\n\\begin{document}\n\\section{A}\\label{s}\n\\Cref{s}.\n\\end{document}\n'),
                 ('acmart (it loads hyperref)', '\\documentclass[sigconf]{acmart}\n\\begin{document}\n\\title{T}\\author{A}\\maketitle\nText.\n\\end{document}\n')]
        for name, d in cases:
            load_doc(page, d)
            if 'economics' not in d:
                ev(page, '() => window.rikuy.runCommand("properties", { subject: "Uber" })'); settle(page, 300)
            r = ev(page, 'window.rikuy.api.compile()')
            errs = [x for x in r['problems'] if x.get('severity') == 'error']
            check('Properties on ' + name + ': compiles in the page without an error', r['ok'] and not errs and ('Uber' in src(page) or 'economics' in src(page)), (errs[:2], src(page)[:200]))
            if 'acmart' in name:
                import base64, io, pypdf
                b = ev(page, '(async () => { const r = await window.rikuy.api.compile(); let s = ""; for (const x of r.pdf) s += String.fromCharCode(x); return btoa(s); })()')
                meta = pypdf.PdfReader(io.BytesIO(base64.b64decode(b))).metadata or {}
                check('V2: acmart: the Subject reaches the PDF (pypdf reads its Info)', (meta.get('/Subject') or '') == 'Uber', dict(meta))
    # read back: a hand written \hypersetup
    load_doc(page, hs.replace('colorlinks=true', 'colorlinks=true, pdfsubject = {Hand, written}, pdfkeywords=one'))
    page.get_by_role('tab', name='File', exact=True).click(); settle(page, 200)
    page.get_by_role('button', name='Properties', exact=True).click(); settle(page, 300)
    dlg = page.get_by_role('dialog', name='Properties', exact=True)
    vals = [dlg.get_by_role('textbox', name=n, exact=True).input_value() for n in ('Title', 'Author', 'Subject', 'Keywords')]
    check('the dialog reads what is written by hand', vals == ['Old title', 'Ann', 'Hand, written', 'one'], vals)
    page.screenshot(path=os.path.join(SHOTS, 'file-properties-1366.png'))
    dlg.get_by_role('textbox', name='Title', exact=True).fill('Typed in the dialog')
    dlg.get_by_role('button', name='Apply', exact=True).click(); settle(page, 300)
    check('Apply writes the changed field only', '\\title{Typed in the dialog}' in src(page) and 'pdfsubject = {Hand, written}' in src(page) and page.get_by_role('dialog').count() == 0)


def accessibility(page):
    d = '\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\n\\section{A}\n\\subsubsection{Deep}\n\\includegraphics[width=3cm]{fig}\n\\includegraphics[alt={A cat}]{cat}\n\\begin{tabular}{ll}\na & b \\\\\nc & d\n\\end{tabular}\n\\end{document}\n'
    load_doc(page, d)
    ks = ev(page, 'window.rikuy.accessibilityIssues().map((x) => x.k)')
    check('Check accessibility finds no title, no language, a picture without alt text, a skipped level, a table without a header row, no tagging', ks == ['title', 'lang', 'alt', 'heads', 'table', 'tagging'], ks)
    t = ev(page, 'window.rikuy.accessibilityIssues().find((x) => x.k === "alt").t')
    check('it counts: 1 of 2 pictures', t.startswith('1 of 2'), t)
    page.get_by_role('tab', name='File', exact=True).click(); settle(page, 200)
    page.get_by_role('button', name='Check accessibility', exact=True).click(); settle(page, 300)
    dlg = page.get_by_role('dialog', name='Check accessibility', exact=True)
    page.screenshot(path=os.path.join(SHOTS, 'file-a11y-1366.png'))
    h = ev(page, 'window.rikuy.hist.length')
    dlg.get_by_role('button', name='Tag the PDF', exact=True).click(); settle(page, 300)
    check('Tag the PDF: \\DocumentMetadata before \\documentclass, one step', src(page) == '\\DocumentMetadata{lang=en,pdfstandard=ua-2,tagging=on}\n' + d and ev(page, 'window.rikuy.hist.length') == h + 1, src(page)[:90])
    check('and no second time; the check finds it tagged', ev(page, 'window.rikuy.runCommand("check-accessibility", "tagging")') is False and 'tagging' not in ev(page, 'window.rikuy.accessibilityIssues().map((x) => x.k)'))
    ev(page, 'window.rikuy.undo()'); settle(page, 200)
    check('one undo: the bytes of before', src(page) == d)
    # a \DocumentMetadata already there (CRLF, a comment, a group in a value, tagging=off) gets
    # tagging=on among its keys; one commented out is no \DocumentMetadata
    for name, before, after in (
            ('keys of its own', '\\DocumentMetadata{\r\n  lang=de-DE, % German\r\n  testphase={phase-III,math},\r\n  tagging=off\r\n}\r\n\\documentclass{article}\r\n\\begin{document}\r\nText.\r\n\\end{document}\r\n',
             '\\DocumentMetadata{\r\n  lang=de-DE, % German\r\n  testphase={phase-III,math},\r\n  tagging=on\r\n}\r\n\\documentclass{article}\r\n\\begin{document}\r\nText.\r\n\\end{document}\r\n'),
            ('no tagging key', '\\DocumentMetadata{pdfversion=2.0}\n\\documentclass{article}\n\\begin{document}\nText.\n\\end{document}\n',
             '\\DocumentMetadata{pdfversion=2.0,tagging=on}\n\\documentclass{article}\n\\begin{document}\nText.\n\\end{document}\n'),
            ('one commented out', '% \\DocumentMetadata{tagging=on}\n\\documentclass{article}\n\\begin{document}\nText.\n\\end{document}\n',
             '% \\DocumentMetadata{tagging=on}\n\\DocumentMetadata{lang=en,pdfstandard=ua-2,tagging=on}\n\\documentclass{article}\n\\begin{document}\nText.\n\\end{document}\n')):
        load_doc(page, before)
        ks = ev(page, 'window.rikuy.accessibilityIssues().map((x) => x.k)')
        r = ev(page, 'window.rikuy.runCommand("check-accessibility", "tagging")')
        ok = 'tagging' in ks and r is True and src(page) == after
        ev(page, 'window.rikuy.undo()'); settle(page, 200)
        check('Tag the PDF on a \\DocumentMetadata with ' + name + ': tagging=on, the rest as written; one undo back', ok and src(page) == before, (ks, r, src(page)[:120]))
    load_doc(page, '\\DocumentMetadata{testphase={a,b},lang=en,tagging=on}\n\\documentclass{article}\n\\begin{document}\nText.\n\\end{document}\n')
    check('a group in a value does not hide the lang and tagging=on after it', 'tagging' not in ev(page, 'window.rikuy.accessibilityIssues().map((x) => x.k)') and 'lang' not in ev(page, 'window.rikuy.accessibilityIssues().map((x) => x.k)'))
    load_doc(page, '\\DocumentMetadata{lang=en,\n\\documentclass{article}\n\\begin{document}\nText.\n\\end{document}\n')
    check('a \\DocumentMetadata whose brace never closes: no button, nothing written', ev(page, 'window.rikuy.accessibilityIssues().find((x) => x.k === "tagging").fix') is None and ev(page, 'window.rikuy.runCommand("check-accessibility", "tagging")') is False)
    tagged(page)
    # a stranger's file of spaces after \\includegraphics and \\usepackage: read in a moment
    load_doc(page, '\\documentclass{article}\n\\usepackage' + ' ' * 200000 + 'x\n\\begin{document}\n' + '\\includegraphics' + ' ' * 200000 + 'y\n\\end{document}\n')
    ms = ev(page, '(() => { const t = performance.now(); window.rikuy.accessibilityIssues(); return performance.now() - t; })()')
    check('Check accessibility on 400 KB of hostile spaces takes well under a second (a scan, no backtracking)', ms < 500, ms)
    good = '\\DocumentMetadata{lang=en,pdfstandard=ua-2,tagging=on}\n\\documentclass{article}\n\\usepackage{booktabs}\n\\title{T}\n\\begin{document}\n\\section{A}\n\\subsection{B}\n\\begin{tabular}{ll}\n\\toprule\na & b \\\\\n\\midrule\nc & d\n\\end{tabular}\n\\end{document}\n'
    load_doc(page, good)
    check('a document with a title, a language, tagging, its levels and header rows: nothing found', ev(page, 'window.rikuy.accessibilityIssues().length') == 0, ev(page, 'window.rikuy.accessibilityIssues()'))


def tagged(page):
    """What Tag the PDF writes, compiled in the page on the three engines: a tagged PDF 2.0 (its
    structure tree, marked, its language) with no error, lists and centred text in it (the CSS
    tagpdf embeds for them comes from its .html files, which the tree once left out: task 60)"""
    if not TEX:
        print('SKIP Tag the PDF compiled on the three engines: no TeX tree in %s' % DIST)
        return
    import base64, io, logging, pypdf
    logging.getLogger('pypdf').setLevel(logging.ERROR)

    def embedded(rd):
        """the names of the files a PDF carries (its /Filespec objects)"""
        names = set()
        for n in set(rd.xref_objStm) | {n for g in rd.xref.values() for n in g}:
            try:
                o = rd.get_object(n)
            except Exception:
                continue
            if isinstance(o, dict) and o.get('/Type') == '/Filespec':
                names.add(str(o.get('/F')))
        return names
    body = ('\\documentclass{article}\n\\usepackage{amsmath}\n\\title{Tagged}\n\\begin{document}\n\\maketitle\n\\section{One}\nWords.\n'
            '\\begin{itemize}\n\\item first\n\\end{itemize}\n\\begin{enumerate}\n\\item one\n\\end{enumerate}\n\\begin{center}\nCentred.\n\\end{center}\n'
            '\\begin{equation}\nE = mc^2\n\\end{equation}\n\\begin{tabular}{ll}\n\\hline\na & b \\\\\n\\hline\nc & d\n\\end{tabular}\n\\end{document}\n')
    load_doc(page, body)
    check('the document to tag is offered Tag the PDF', ev(page, 'window.rikuy.runCommand("check-accessibility", "tagging")') is True and src(page).startswith('\\DocumentMetadata{lang=en,pdfstandard=ua-2,tagging=on}\n\\documentclass'), src(page)[:80])
    written = src(page)
    for engine in ('pdflatex', 'xelatex', 'lualatex'):
        load_doc(page, written if engine == 'pdflatex' else '% !TeX program = ' + engine + '\n' + written)
        r = ev(page, """async () => { const r = await window.rikuy.api.compile(); let s = ''; if (r.pdf) for (let i = 0; i < r.pdf.length; i += 8192) s += String.fromCharCode(...r.pdf.subarray(i, i + 8192)); return { ok: r.ok, engine: r.engine, errs: (r.problems || []).filter((p) => p.severity === 'error').map((p) => p.message).slice(0, 3), pdf: s ? btoa(s) : '' }; }""")
        info = None
        if r['pdf']:
            raw = base64.b64decode(r['pdf']); rd = pypdf.PdfReader(io.BytesIO(raw)); root = rd.trailer['/Root']
            mark = root.get('/MarkInfo')
            info = (rd.pdf_header, '/StructTreeRoot' in root, bool(mark and mark.get('/Marked')), str(root.get('/Lang')), {'latex-list-css.html', 'latex-align-css.html'} <= embedded(rd))
        check('Tag the PDF on ' + engine + ': compiles in the page without an error, a tagged PDF 2.0 in English with the CSS of its lists and alignment',
              r['ok'] and r['engine'] == engine and not r['errs'] and info == ('%PDF-2.0', True, True, 'en', True), (r['engine'], r['errs'], info))


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
    ev(page, '() => window.rikuy.runCommand("export-as", "markdown")'); page.wait_for_function('!window.rikuy.wordBusy', timeout=120000)
    md = ev(page, '(async () => (await window.rikuy.lastExport.blob.text()))()')
    check('M1: the Markdown has none of Word\'s anchors', 'Some words here' in md and '{#Rk' not in md and '[Some' not in md, md[:200])
    # (a name in another script keeps its letters, review E17; one of only signs a file system
    # refuses and marks nobody sees comes to paper.md, never a hidden .md)
    for name, want in (('\u8bba\u6587', '\u8bba\u6587.md'), ('\u202e\u200b/:*', 'paper.md')):
        ev(page, '(n) => { window.rikuy.name = n; }', name)
        ev(page, '() => window.rikuy.runCommand("export-as", "markdown")'); page.wait_for_function('!window.rikuy.wordBusy', timeout=120000)
        check('L8: the name ' + repr(name) + ' exports as ' + want + ', never a hidden .md', ev(page, 'window.rikuy.lastExport.name') == want, ev(page, 'window.rikuy.lastExport.name'))


def phones(p):
    browser, page, errors = open_page(p, 390, 844, touch=True)
    ev(page, "window.rikuy.selectTab('file')"); settle(page, 300)
    r = ev(page, "[...document.querySelectorAll('#rp-file .btn')].filter((b) => b.offsetParent).map((b) => { const r = b.getBoundingClientRect(); return [b.getAttribute('aria-label'), Math.round(r.width), Math.round(r.height)]; })")
    check('the File tab\'s buttons are 44 px under a finger (390 px)', r and all(x[1] >= 44 and x[2] >= 44 for x in r), r)
    page.locator('#rf-props').tap(); settle(page, 400)
    dl = ev(page, "(() => { const d = document.querySelector('.pop'); const r = d.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), Math.round(r.bottom), innerHeight]; })()")
    check('Properties fits a phone\'s screen (390 px)', dl[0] >= 0 and dl[1] <= 390 and dl[2] <= dl[3], dl)
    page.screenshot(path=os.path.join(SHOTS, 'phone-390-properties.png'))
    page.keyboard.press('Escape'); settle(page, 200)
    ev(page, '() => window.rikuy.runCommand("recent", { rename: window.rikuy.name })'); settle(page, 400)
    dl = ev(page, "(() => { const d = document.querySelector('.pop-rename'); if (!d) return null; const r = d.getBoundingClientRect(), b = d.querySelector('button[aria-label=Rename]').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), Math.round(r.bottom), innerHeight, Math.round(b.height)]; })()")
    check('F4: Rename a document fits a phone\'s screen, its button 44 px (390 px)', dl and dl[0] >= 0 and dl[1] <= 390 and dl[2] <= dl[3] and dl[4] >= 44, dl)
    page.screenshot(path=os.path.join(SHOTS, 'phone-390-rename.png'))
    page.keyboard.press('Escape')
    check('no sideways scroll (390 px)', ev(page, 'document.documentElement.scrollWidth') <= 390)
    check('no errors (390 px)', not errors, errors)
    browser.close()


with sync_playwright() as p:
    want = sys.argv[1:]
    browser, page, errors = open_page(p, 1366, 800)
    for name, fn in (('new_docs', new_docs), ('rename', rename), ('rename_atomic', rename_atomic), ('properties', properties), ('accessibility', accessibility), ('export', export)):
        if want and name not in want:
            continue
        try: fn(page)
        except Exception as e: check(name + " ran to its end", False, repr(e)[:1500])
    check('no errors in the page', not errors, errors[:3])
    browser.close()
    if not want or 'phones' in want:
        phones(p)

bad = [r for r in results if not r[1]]
print('%d checks, %d failed' % (len(results), len(bad)))
sys.exit(1 if bad else 0)
