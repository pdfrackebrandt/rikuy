"""Round trip of whole projects: open a zip, save it, every file comes back byte-identical;
an edit re-encodes only the edited file in its own encoding; everything survives a reload.
Names in a zip that would leave the project are left out; a file that cannot be opened (a broken
.zip, a picture named .tex, a .doc) is refused in plain words; with storage turned off or full the
page still opens and says the work is not kept."""
import os, sys, io, zipfile, tempfile, traceback
sys.path.insert(0, os.path.dirname(__file__))
from browser import open_page, check, results, src, click_text
from playwright.sync_api import sync_playwright

TMP = os.environ.get('TMPDIR_RIKUY', os.path.join(tempfile.gettempdir(), 'rikuy-files'))
os.makedirs(TMP, exist_ok=True)
PNG = bytes.fromhex('89504e470d0a1a0a0000000d4948445200000001000000010806000000'
                    '1f15c4890000000d49444154789c6360f8cf00000301010018dd8db00000000049454e44ae426082')
main = ('\\documentclass{article}\r\n\\usepackage[ngerman]{babel}\r\n\\begin{document}\r\n'
        'Gr\u00fc\u00dfe aus Hannover. Eine Zeile mit Prozent: 50\\%.\r\n\r\n'
        '\\input{sec/intro}\r\n\\includegraphics{fig.png}\r\n\\end{document}\r\n')
files = {
    'paper/main.tex': main.encode('latin-1'),
    'paper/sec/intro.tex': '\ufeffIntro text with \u00e9t\u00e9.\n'.encode('utf-8'),
    'paper/refs.bib': b'@book{k, title={T}, year={1999}}\r\n',
    'paper/data.csv': b'x,y\n1,2\n',
    'paper/fig.png': PNG,
    'paper/fonts/Custom.otf': bytes(range(256)),
    'paper/style.sty': b'\\ProvidesPackage{style}\n',
}
zpath = os.path.join(TMP, 'proj.zip')
with zipfile.ZipFile(zpath, 'w') as z:
    for n, b in files.items():
        z.writestr(n, b)

def saved(page):
    with page.expect_download() as d:
        page.click('#b-save')
    path = os.path.join(TMP, 'out.zip')
    d.value.save_as(path)
    with zipfile.ZipFile(path) as z:
        return {n: z.read(n) for n in z.namelist() if not n.endswith('/')}

try:
    with sync_playwright() as p:
        browser, page, errors = open_page(p)
        # an EPS figure was greyed out in the Open dialog, though the PDF draws it
        check('the Open dialog offers EPS figures', '.eps' in page.get_attribute('#fileinput', 'accept').split(','))
        page.set_input_files('#fileinput', zpath)
        page.wait_for_function("window.rikuy.main === 'main.tex' && window.rikuy.files.has('sec/intro.tex')", timeout=10000)
        page.wait_for_timeout(600)
        check('latin-1 file decodes', '\u00fc' in src(page), src(page)[:120])
        # a .zip is content from someone else, like a share link: it compiles with restricted
        # shell escape (the worker runs only TeX Live's safe programs) until the owner allows more
        job = page.evaluate("""async () => {
          const g = window.rikuy, e = g.texEngine();
          let job = null;
          e.compile = async (o) => { job = { shellEscape: o.shellEscape, untrusted: o.untrusted }; return { id: o.project, log: '', runs: [], missing: [], pdf: null, engineLabel: 'pdfLaTeX' }; };
          await g.compilePdf();
          return job;
        }""")
        check('a project opened from a .zip compiles with restricted shell escape', job and job.get('shellEscape') is False and job.get('untrusted') is True, job)
        page.evaluate('() => window.rikuy.allowShellHere()')
        job = page.evaluate("""async () => {
          const g = window.rikuy, e = g.texEngine();
          let job = null;
          e.compile = async (o) => { job = { shellEscape: o.shellEscape, untrusted: o.untrusted }; return { id: o.project, log: '', runs: [], missing: [], pdf: null, engineLabel: 'pdfLaTeX' }; };
          await g.compilePdf();
          return job;
        }""")
        check('allowing it lifts the restriction for the .zip project', job and job.get('shellEscape') is True and job.get('untrusted') is False, job)
        out = saved(page)
        for n, b in files.items():
            rel = n[len('paper/'):]
            check('untouched %s saves byte-identical' % rel, out.get(rel) == b, (len(out.get(rel) or b''), len(b)))
        check('no extra files appear', set(out) == {n[len('paper/'):] for n in files}, sorted(out))
        check('save clears the unsaved marker', not page.evaluate("document.body.classList.contains('zip-dirty')"))
        # edit main.tex on the page
        click_text(page, 'Hannover', 8)
        page.keyboard.type(' und Oxford')
        page.wait_for_timeout(400)
        check('edit marks the zip as out of date', page.evaluate("document.body.classList.contains('zip-dirty')"))
        out2 = saved(page)
        want = main.replace('Hannover', 'Hannover und Oxford').encode('latin-1')
        check('edited file keeps its Latin-1 encoding and CRLF', out2['main.tex'] == want, out2['main.tex'][:120])
        check('other files still identical after an edit', all(out2[n[len('paper/'):]] == b for n, b in files.items() if not n.endswith('main.tex')))
        # reload: text and binary files come back from this browser
        page.wait_for_timeout(1200)
        page.reload()
        page.wait_for_function('window.rikuy && document.getElementById("boot").hidden', timeout=20000)
        page.wait_for_timeout(500)
        check('project survives a reload', 'und Oxford' in src(page) and page.evaluate("window.rikuy.extra.has('data.csv') && window.rikuy.assetBlobs.has('fig.png')"))
        check('image still shows after reload', page.evaluate("[...document.querySelectorAll('#pages img')].some(i => i.complete && i.naturalWidth > 0)"))
        out3 = saved(page)
        check('after reload, untouched files still byte-identical', all(out3[n[len('paper/'):]] == b for n, b in files.items() if not n.endswith('main.tex')), sorted(out3))
        check('after reload, edited file identical to before', out3['main.tex'] == want)
        # a zip whose maker wrote names that leave the folder: JSZip resolves ../ itself; names
        # with backslashes pass it, and those that climb out are left out and named
        hpath = os.path.join(TMP, 'hostile.zip')
        with zipfile.ZipFile(hpath, 'w') as z:
            z.writestr('main.tex', '\\documentclass{article}\n\\begin{document}\nSafe.\n\\end{document}\n')
            z.writestr('../escape.tex', 'x')
            z.writestr('sub\\..\\..\\evil.tex', 'x')
            z.writestr('/abs/inside.tex', 'kept, as abs/inside.tex')
            z.writestr('win\\path.tex', 'kept, as win/path.tex')
        page.set_input_files('#fileinput', hpath)
        page.wait_for_function("window.rikuy.name === 'hostile'", timeout=10000)
        page.wait_for_timeout(300)
        names = sorted(page.evaluate('[...window.rikuy.files.keys(), ...window.rikuy.extra.keys()]'))
        check('no name from a zip leaves the project', names == ['abs/inside.tex', 'escape.tex', 'main.tex', 'win/path.tex'], names)
        check('and the user is told what was left out', 'Left out 1 file' in page.inner_text('#toast'), page.inner_text('#toast')[:160])
        check('and where the project open before is kept', 'proj is kept under Review, Versions.' in page.inner_text('#toast'), page.inner_text('#toast')[:200])
        print('errors:', errors[:5])
        check('no page errors', not errors, errors[:5])
        browser.close()

    # files someone who has never seen LaTeX drops on the page: each is opened, or refused in
    # words that say what to do, and none becomes a page of noise or vanishes into the project
    with sync_playwright() as p:
        browser, page, errors = open_page(p)
        DROP = """(files) => { const dt = new DataTransfer();
          for (const [name, b64] of files) dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], name));
          document.getElementById('desk').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }"""
        b64 = lambda b: __import__('base64').b64encode(b).decode()
        sample = page.evaluate('window.rikuy.files.get("main.tex")')

        def drop(*fs):
            page.evaluate('document.getElementById("toast").hidden = true')
            page.evaluate(DROP, [[n, b64(b)] for n, b in fs])
            for _ in range(40):
                page.wait_for_timeout(100)
                if page.is_visible('#toast'): break
            return page.inner_text('#toast')

        def untouched():
            return page.evaluate('window.rikuy.main') == 'main.tex' and page.evaluate('window.rikuy.files.get("main.tex")') == sample and page.evaluate('[...window.rikuy.extra.keys()]') == []

        empty = io.BytesIO()
        zipfile.ZipFile(empty, 'w').close()
        toast = drop(('broken.zip', b'this is no archive'))
        check('a .zip that is none is refused by its name, not with "choose .zip files"', 'broken.zip is not a .zip file' in toast and 'Choose' not in toast and untouched(), toast)
        toast = drop(('none.zip', empty.getvalue()))
        check('an empty .zip is said to be empty', 'none.zip has no files in it' in toast and untouched(), toast)
        toast = drop(('picture.tex', PNG * 20))
        check('a picture named .tex is refused, not opened as a page of noise', 'picture.tex was not opened' in toast and 'not text' in toast and untouched(), toast)
        toast = drop(('old.doc', b'\xd0\xcf\x11\xe0' + b'\0' * 64))
        check('a .doc is refused with the way to a .docx, not added silently', 'old.doc was not opened' in toast and 'Save As' in toast and '.docx' in toast and untouched(), toast)
        toast = drop(('notes.rtf', b'{\\rtf1 hi}'), ('more.bib', b'@misc{x, title={X}}\n'))
        check('beside a file that opens, the refused one is still named', 'Added more.bib' in toast and 'notes.rtf was not opened' in toast and page.evaluate('window.rikuy.files.has("more.bib")'), toast)
        toast = drop(('paper.pdf', b'%PDF-1.4\n%%EOF\n'))
        check('a PDF dropped alone joins as a figure, placed in the text, and the message says it cannot be edited', 'as a figure' in toast and 'cannot be opened for editing' in toast and '\\includegraphics[width=0.8\\linewidth]{paper.pdf}' in page.evaluate('window.rikuy.files.get("main.tex")'), toast)
        page.keyboard.press('Control+z'); page.wait_for_timeout(200)
        # a picture's name comes from outside: in the source it is letters, digits, dot, dash and
        # underscore, and the figure goes after the heading it was dropped on, not into its braces
        before = page.evaluate('window.rikuy.files.get("main.tex")')
        xy = page.evaluate('(() => { const s = [...document.querySelectorAll("#pages span.t")].find((s) => s.textContent.includes("How to use it")); s.scrollIntoView({ block: "center" }); const r = s.getBoundingClientRect(); return [r.left + 20, r.top + r.height / 2]; })()')
        page.evaluate("""([name, b, x, y]) => { const dt = new DataTransfer(); dt.items.add(new File([Uint8Array.from(atob(b), (c) => c.charCodeAt(0))], name));
          document.elementFromPoint(x, y).dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: x, clientY: y })); }""", ['my plot} \\end{document} %50 (v2).PNG', b64(PNG), xy[0], xy[1]])
        page.wait_for_function('window.rikuy.files.get("main.tex").includes("includegraphics")', timeout=5000)
        after = page.evaluate('window.rikuy.files.get("main.tex")')
        names = [n for n in page.evaluate('[...window.rikuy.assetBlobs.keys()]') if n not in ('paper.pdf',)]
        import re as _re
        check('a dropped picture is kept under a name of letters, digits, dot, dash and underscore', len(names) == 1 and _re.fullmatch(r'[A-Za-z0-9_-]+\.png', names[0]), names)
        check('and placed after the heading it was dropped on, under that name', names and '\\section{How to use it}\n\n\\begin{center}\n\\includegraphics[width=0.8\\linewidth]{%s}\n\\end{center}\n' % names[0] in after and after.count('\\end{document}') == 1 and after.count('%50') == 0, after[after.find('\\section{How'):][:200])
        page.keyboard.press('Control+z'); page.wait_for_timeout(200)
        check('one undo takes it out of the text again', page.evaluate('window.rikuy.files.get("main.tex")') == before)
        toast = drop(('art.svg', b'<svg xmlns="http://www.w3.org/2000/svg"/>'))
        check('a picture TeX cannot include as it is (SVG) joins the project and is not written into the text', 'Added art.svg' in toast and 'placed' not in toast and page.evaluate('window.rikuy.files.get("main.tex")') == before, toast)
        # two pictures whose names come to the same safe name, and one that comes to the name of a
        # picture the project has: each keeps a name of its own, and no bytes are replaced
        BYTES = '(n) => window.rikuy.assetBlobs.get(n) ? window.rikuy.assetBlobs.get(n).arrayBuffer().then((b) => b.byteLength) : -1'
        click_text(page, 'References follow')
        drop(('\u56fe\u4e00.png', PNG)); page.wait_for_timeout(300)
        drop(('\u56fe\u4e8c.png', PNG + b'\0\0\0')); page.wait_for_timeout(300)
        s = page.evaluate('window.rikuy.files.get("main.tex")')
        check('two pictures with names of no Latin letters are two files and two figures', page.evaluate(BYTES, 'figure.png') == len(PNG) and page.evaluate(BYTES, 'figure-2.png') == len(PNG) + 3 and '{figure.png}' in s and '{figure-2.png}' in s, (page.evaluate('[...window.rikuy.assetBlobs.keys()]'), page.evaluate(BYTES, 'figure.png')))
        drop(('my-plot.png', PNG)); page.wait_for_timeout(300)
        toast = drop(('my plot.png', PNG + b'\0' * 7)); page.wait_for_timeout(300)
        check('a picture whose safe name the project already has does not replace that picture', page.evaluate(BYTES, 'my-plot.png') == len(PNG) and page.evaluate(BYTES, 'my-plot-2.png') == len(PNG) + 7 and 'my-plot-2.png' in toast, (toast, page.evaluate('[...window.rikuy.assetBlobs.keys()]')))
        # A picture dropped under exactly the name of one the project has is that picture made
        # again: its bytes are replaced and no second figure is placed.
        count = lambda: page.evaluate('window.rikuy.files.get("main.tex").split("\\\\includegraphics").length - 1')
        figs = count()
        toast = drop(('my-plot.png', PNG + b'\0' * 2)); page.wait_for_timeout(300)
        check('a picture dropped under the exact name of one in the project replaces its bytes and places no figure', page.evaluate(BYTES, 'my-plot.png') == len(PNG) + 2 and count() == figs and 'my-plot.png replaced' in toast and not page.evaluate('window.rikuy.assetBlobs.has("my-plot-3.png")'), (toast, count(), figs, page.evaluate('[...window.rikuy.assetBlobs.keys()]')))
        # ... placed as usual when the text does not have it yet
        click_text(page, 'References follow')
        drop(('solo.png', PNG)); page.wait_for_timeout(300)
        page.keyboard.press('Control+z'); page.wait_for_timeout(300)
        gone = '{solo.png}' not in page.evaluate('window.rikuy.files.get("main.tex")')
        click_text(page, 'References follow')
        toast = drop(('solo.png', PNG + b'\0' * 5)); page.wait_for_timeout(300)
        check('replaced and placed when the text does not include it yet', gone and page.evaluate(BYTES, 'solo.png') == len(PNG) + 5 and page.evaluate('window.rikuy.files.get("main.tex")').count('{solo.png}') == 1 and not page.evaluate('window.rikuy.assetBlobs.has("solo-2.png")'), toast)
        # a pasted picture has no name of its own (every screenshot is image.png): always a new file
        drop(('image.png', PNG)); page.wait_for_timeout(300)
        click_text(page, 'References follow')
        page.evaluate("""(b) => { const dt = new DataTransfer(); dt.items.add(new File([Uint8Array.from(atob(b), (c) => c.charCodeAt(0))], 'image.png', { type: 'image/png' }));
          document.getElementById('pages').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }""", b64(PNG + b'\0' * 9))
        page.wait_for_timeout(500)
        pasted = [n for n in page.evaluate('[...window.rikuy.assetBlobs.keys()]') if n.startswith('pasted-')]
        check('a pasted picture never replaces a file, whatever the clipboard calls it', page.evaluate(BYTES, 'image.png') == len(PNG) and len(pasted) == 1 and page.evaluate(BYTES, pasted[0] if pasted else '') == len(PNG) + 9, pasted)
        # Typing while a version is being kept (the await before a replaced file is written): the
        # figure dropped with it must land after the caret's paragraph in the text as it is then,
        # not at an offset of the text as it was when the drop began.
        page.evaluate("""() => { const g = window.rikuy, keep = g.snapshot.bind(g); g.hookRan = 0; g.snapshot = async (...a) => { g.snapshot = keep; g.hookRan++;
          const s = g.files.get('main.tex'), at = s.indexOf('\\\\maketitle') + 10; g.commit([{ f: 'main.tex', s: at, e: at, t: '\\n\\nTyped meanwhile, forty characters or so.' }], g.caretNow(), 'type'); return keep(...a); }; }""")
        click_text(page, 'The page and the source never disagree')
        drop(('my-plot.png', PNG + b'\0' * 3), ('with-it.png', PNG)); page.wait_for_timeout(500)
        s = page.evaluate('window.rikuy.files.get("main.tex")')
        k = s.rfind('\\begin{center}\n\\includegraphics[width=0.8\\linewidth]{with-it.png}')
        check('(the version is kept and text is typed while the drop waits)', page.evaluate('window.rikuy.hookRan') == 1 and 'Typed meanwhile' in s, page.evaluate('window.rikuy.hookRan'))
        check('a figure placed while the text changes lands after its paragraph, not inside it', k > 0 and s[:k].endswith('every edit is computed back into it.\n\n'), s[max(0, k - 400):k + 30] if k > 0 else page.evaluate('[...window.rikuy.assetBlobs.keys()]'))
        # with the caret in a footnote the figure goes after the paragraph that holds the footnote
        click_text(page, 'edit this footnote')
        drop(('in-note.png', PNG)); page.wait_for_timeout(400)
        s = page.evaluate('window.rikuy.files.get("main.tex")')
        k = s.find('{in-note.png}')
        check('with the caret in a footnote the figure goes after the paragraph of the footnote, not to the end', k > 0 and s[:k].endswith('one edited by hand.\n\n\\begin{center}\n\\includegraphics[width=0.8\\linewidth]') and k < s.find('\\section{Citations'), s[max(0, k - 120):k + 20])
        # the preamble ends where the parser says: a comment naming \begin{document} is not it
        page.evaluate("""() => { const g = window.rikuy; g.files = new Map([['main.tex', '\\\\documentclass{article}\\n% was: \\\\begin{document} here\\n\\\\usepackage{amsmath}\\n\\\\begin{document}\\nA paragraph.\\n\\\\end{document}\\n']]); g.main = 'main.tex'; g.hist = []; g.forceRender = true; g.rebuild(); }""")
        click_text(page, 'A paragraph')
        drop(('late.png', PNG)); page.wait_for_timeout(400)
        s = page.evaluate('window.rikuy.files.get("main.tex")')
        check('graphicx goes after the last package, though a comment before it names \\begin{document}', s.startswith('\\documentclass{article}\n% was: \\begin{document} here\n\\usepackage{amsmath}\n\\usepackage{graphicx}\n\\begin{document}\nA paragraph.\n\n\\begin{center}'), s[:200])
        page.evaluate('window.rikuy.doReset()'); page.wait_for_timeout(600)
        # an archive with no document in it joins the project open now: it is someone else's
        # files all the same, and the project is marked so (shell escape restricted)
        cls = io.BytesIO()
        with zipfile.ZipFile(cls, 'w') as z: z.writestr('evil.cls', '\\ProvidesClass{evil}\n')
        drop(('styles.zip', cls.getvalue())); page.wait_for_timeout(400)
        link = page.evaluate("window.rikuy.linkCache.get(window.rikuy.name + '|' + window.rikuy.main) || null")
        check('a .zip holding only a class joins the project and marks it as holding someone else\'s files', page.evaluate('window.rikuy.files.has("evil.cls")') and bool(link) and link['origin'] == 'zip' and not link['allowed'], link)
        many = io.BytesIO()
        with zipfile.ZipFile(many, 'w') as z:
            for i in range(30): z.writestr('pics/p%02d.png' % i, PNG)
        toast = drop(('pics.zip', many.getvalue()))
        check('thirty files added are a few names and a count', 'and 26 more' in toast and len(toast) < 220 and len([n for n in page.evaluate('[...window.rikuy.assetBlobs.keys()]') if n.startswith('p')and n[1:3].isdigit()]) == 30, toast)
        mixed = io.BytesIO()
        with zipfile.ZipFile(mixed, 'w') as z:
            z.writestr('main.tex', '\\documentclass{article}\n\\begin{document}\nFrom the archive.\n\\end{document}\n')
            z.writestr('logo.txt', PNG * 20)
        drop(('mixed.zip', mixed.getvalue()))
        page.wait_for_function("window.rikuy.name === 'mixed'", timeout=10000)
        check('in a .zip, a file that is not text under a text name is kept as a file, not as text', page.evaluate('[...window.rikuy.files.keys()]') == ['main.tex'] and page.evaluate('[...window.rikuy.extra.keys()]') == ['logo.txt'], page.evaluate('[...window.rikuy.files.keys(), ...window.rikuy.extra.keys()]'))
        # a .zip damaged after its first file: what was read opens, named as damaged, and still as
        # someone else's project (restricted shell escape), like any .zip
        raw = io.BytesIO()
        with zipfile.ZipFile(raw, 'w') as z:
            z.writestr('main.tex', '\\documentclass{article}\n\\begin{document}\nRead before the damage.\n\\end{document}\n')
            z.writestr(zipfile.ZipInfo('zz.tex'), b'A later chapter. ' * 200, zipfile.ZIP_DEFLATED)
        dmg = bytearray(raw.getvalue())
        at = dmg.find(b'zz.tex') + len('zz.tex')          # the deflated bytes follow the local header's name
        dmg[at:at + 8] = b'\xff' * 8
        toast = drop(('half.zip', bytes(dmg)))
        page.wait_for_function("window.rikuy.name === 'half'", timeout=10000)
        link = page.evaluate("window.rikuy.linkCache.get(window.rikuy.name + '|' + window.rikuy.main) || null")
        check('a .zip damaged part way opens what was read and says the archive is damaged', page.evaluate('[...window.rikuy.files.keys()]') == ['main.tex'] and 'half.zip is not a .zip file this page can read' in page.inner_text('#toast'), page.inner_text('#toast'))
        check('and stays someone else\'s project, with shell escape restricted', bool(link) and link['origin'] == 'zip' and not link['allowed'], link)
        check('no page errors (dropped files)', not errors, errors[:5])
        browser.close()

    # When an archive makes the project someone else's (restricted shell escape): only when a
    # file from it was added that TeX can run or read as code. Pictures alone do not, a .zip that
    # could not be read does not, and the sample or a new document holds nothing of a stranger's.
    with sync_playwright() as p:
        browser, page, errors = open_page(p)
        DROP = """(files) => { const dt = new DataTransfer();
          for (const [name, b64] of files) dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], name));
          document.getElementById('desk').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }"""
        b64 = lambda b: __import__('base64').b64encode(b).decode()
        LINK = "(async () => { const v = await window.rikuy.linkInfo(); return v ? { origin: v.origin, allowed: v.allowed } : null; })()"

        def drop(*fs):
            page.evaluate('document.getElementById("toast").hidden = true')
            page.evaluate(DROP, [[n, b64(b)] for n, b in fs])
            for _ in range(40):
                page.wait_for_timeout(100)
                if page.is_visible('#toast'): break
            page.wait_for_timeout(200)
            return page.inner_text('#toast')

        def zipped(d):
            z = io.BytesIO()
            with zipfile.ZipFile(z, 'w') as f:
                for k, v in d.items(): f.writestr(k, v)
            return z.getvalue()
        toast = drop(('pics.zip', zipped({'a.png': PNG, 'sub/b.JPG': PNG, 'c.pdf': b'%PDF-1.4\n%%EOF\n'})))
        check('a .zip of pictures alone joins the project and leaves it the user\'s own', page.evaluate(LINK) is None and page.evaluate('window.rikuy.assetBlobs.has("a.png")') and 'restricted' not in toast, (page.evaluate(LINK), toast))
        toast = drop(('broken.zip', b'no archive at all'), ('mine.sty', b'\\ProvidesPackage{mine}\n'))
        check('a .zip that could not be read, dropped with the user\'s own package, marks nothing', page.evaluate(LINK) is None and page.evaluate('window.rikuy.files.has("mine.sty")'), (page.evaluate(LINK), toast))
        for name, body in (('fig.eps', '%!PS\n'), ('macros.def', '\\def\\x{}\n'), ('run.py', 'print(1)\n'), ('Makefile', 'all:\n')):
            page.evaluate('window.rikuy.clearLink()')
            toast = drop(('code.zip', zipped({name: body})))
            v = page.evaluate(LINK)
            check('a .zip that adds %s marks the project, and says so' % name, v and v['origin'] == 'zip' and not v['allowed'] and 'restricted' in toast, (v, toast))
        page.evaluate('window.rikuy.allowShellHere()'); page.wait_for_timeout(200)
        allowed = (page.evaluate(LINK) or {}).get('allowed')
        toast = drop(('later.zip', zipped({'later.cls': '\\ProvidesClass{later}\n'})))
        v = page.evaluate(LINK)
        check('a later archive with code takes an earlier Allow back, and the message says so', allowed is True and v and not v['allowed'] and 'restricted again' in toast, (allowed, v, toast))
        page.evaluate('window.rikuy.doReset()'); page.wait_for_timeout(700)
        check('loading the sample clears the mark: the sample holds nothing of a stranger\'s', page.evaluate(LINK) is None, page.evaluate(LINK))
        page.evaluate("window.rikuy.markFromLink('Ana')"); page.wait_for_timeout(100)
        marked = page.evaluate(LINK)
        page.evaluate('window.rikuy.doReset()'); page.wait_for_timeout(700)
        check('the same for a mark a shared link left under the sample\'s name', marked and page.evaluate(LINK) is None, (marked, page.evaluate(LINK)))
        page.evaluate("for (const n of ['Untitled', 'Untitled 2', 'Untitled 3', 'Untitled 4']) window.rikuy.markFromLink('', n, 'main.tex', 'zip')")
        page.click('#b-new'); page.wait_for_function('window.rikuy.name.startsWith("Untitled")', timeout=5000); page.wait_for_timeout(300)
        check('a new document carries no mark, whatever an earlier project of its name had', page.evaluate(LINK) is None, (page.evaluate('window.rikuy.name'), page.evaluate(LINK)))
        # with a document of its own a readable archive is someone else's project, as before;
        # a broken one dropped with the user's own document is not
        toast = drop(('broken.zip', b'no archive at all'), ('paper.tex', b'\\documentclass{article}\n\\begin{document}\nMine.\n\\end{document}\n'))
        page.wait_for_function("window.rikuy.main === 'paper.tex'", timeout=5000)
        check('a broken .zip dropped with the user\'s own document does not make the document a stranger\'s', page.evaluate(LINK) is None, (page.evaluate(LINK), toast))
        drop(('Thesis.zip', zipped({'main.tex': '\\documentclass{article}\n\\begin{document}\nTheirs.\n\\end{document}\n'})))
        page.wait_for_function("window.rikuy.name === 'Thesis'", timeout=5000)
        v = page.evaluate(LINK)
        check('a .zip with a document still opens as someone else\'s project', v and v['origin'] == 'zip' and not v['allowed'], v)
        check('no page errors (archive marks)', not errors, errors[:5])
        browser.close()

    # storage turned off (as in some private windows), or full: the page still opens, and says so
    NO_STORE = ("Object.defineProperty(IDBFactory.prototype, 'open', { value() { throw new DOMException('denied', 'SecurityError'); } });"
                "Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } });")
    NO_IDB = "Object.defineProperty(IDBFactory.prototype, 'open', { value() { throw new DOMException('denied', 'SecurityError'); } });"
    with sync_playwright() as p:
        for label, init, figure, want in [('turned off', NO_STORE, False, 'not keeping your work'), ('without room for figures', NO_IDB, True, 'not the figures')]:
            browser, page, errors = open_page(p, clear=False, init=init)
            if figure:
                page.evaluate("(b) => { const a = window.rikuy; a.addAsset('fig.png', new Blob([Uint8Array.from(atob(b), (c) => c.charCodeAt(0))])); }", __import__('base64').b64encode(PNG).decode())
            click_text(page, 'Click anywhere', 5)
            page.keyboard.type(' typed')
            page.wait_for_timeout(1500)
            check('storage %s: the page opens and takes edits' % label, ' typed' in src(page))
            check('storage %s: the user is told it is not kept' % label, want in page.inner_text('#toast') and 'Saved in this browser' not in page.inner_text('#st-save'), (page.inner_text('#toast')[:120], page.inner_text('#st-save')))
            check('storage %s: no page errors' % label, not errors, errors[:3])
            browser.close()
except Exception as e:
    # a run that stops part way has failed, whatever the checks before it said
    traceback.print_exc()
    check('the run reaches its end', False, e)
bad = [r for r in results if not r[1]]
print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
sys.exit(1 if bad else 0)
