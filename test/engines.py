"""Engines and shell escape in the page: Auto picks XeLaTeX for fontspec and LuaLaTeX for a
magic comment, the menu overrides it per project, minted and EPS figures compile, pygmentize
does not load code a document wrote, PSTricks with
XeLaTeX and with latex + dvips, Asymptote figures, xindy indexes and glossaries, pipes, and a
program that cannot run in a browser is reported in Problems."""
import os, sys, time, base64, traceback
sys.path.insert(0, os.path.dirname(__file__))
from browser import open_page, check, results, SHOTS
from playwright.sync_api import sync_playwright

EPS = '%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 60 40\nnewpath 30 20 15 0 360 arc 0.8 0.2 0.2 setrgbcolor fill showpage\n'


def open_doc(page, files):
    page.evaluate("""async (files) => {
      const list = files.map(([n, t]) => new File([t], n));
      await window.rikuy.openFiles(list); }""", files)
    page.wait_for_timeout(500)


def wait_pdf(page, timeout=180):
    t = time.time()
    page.wait_for_timeout(1600)
    while time.time() - t < timeout:
        busy = page.evaluate("window.rikuy.compiling || !!window.rikuy.compileAgain")
        if not busy: break
        page.wait_for_timeout(500)
    return page.evaluate("document.getElementById('pdf-status').textContent")


try:
    with sync_playwright() as p:
        browser, page, errors = open_page(p, width=1500, height=950)
        page.click('#b-pdf')
        st = wait_pdf(page)
        check('the sample compiles with pdfLaTeX', 'pdfLaTeX' in st and 'page' in st, st)
        check('the engine menu says Auto: pdfLaTeX', page.evaluate("document.querySelector('#pdf-engine option[value=auto]').textContent") == 'Auto: pdfLaTeX')

        open_doc(page, [['main.tex', '\\documentclass{article}\n\\usepackage{fontspec}\n\\setmainfont{TeX Gyre Pagella}\n\\begin{document}\nPagella, äöü — “quotes”.\n\\end{document}\n']])
        st = wait_pdf(page)
        check('fontspec compiles with XeLaTeX on Auto', st.startswith('XeLaTeX') and 'page' in st, st)
        check('the menu shows why', page.evaluate("document.querySelector('#pdf-engine option[value=auto]').textContent") == 'Auto: XeLaTeX'
              and 'fontspec' in page.evaluate("document.getElementById('pdf-engine').title"), page.evaluate("document.getElementById('pdf-engine').title"))
        page.select_option('#pdf-engine', 'lualatex')
        st = wait_pdf(page)
        check('choosing LuaLaTeX recompiles with it', st.startswith('LuaLaTeX') and 'page' in st, st)
        page.select_option('#pdf-engine', 'auto')
        wait_pdf(page)

        open_doc(page, [['paper.tex', '% !TeX program = lualatex\n\\documentclass{article}\n\\begin{document}\n\\directlua{tex.print("Lua " .. 6*7)}\n\\end{document}\n']])
        st = wait_pdf(page)
        check('a magic comment picks LuaLaTeX', st.startswith('LuaLaTeX') and 'page' in st, st)
        check('the menu credits the comment', 'TeX program' in page.evaluate("document.getElementById('pdf-engine').title"), page.evaluate("document.getElementById('pdf-engine').title"))

        open_doc(page, [['code.tex', '\\documentclass{article}\n\\usepackage{minted}\n\\usepackage{graphicx}\n\\begin{document}\n\\begin{minted}{python}\ndef f(x):\n    return x * 2\n\\end{minted}\n\\includegraphics{dot.eps}\n\\end{document}\n'], ['dot.eps', EPS]])
        st = wait_pdf(page, 300)
        check('minted and an EPS figure compile', st.startswith('pdfLaTeX') and 'page' in st, st)
        probs = page.evaluate("window.rikuy.texIssues.map(x => x.sev + ': ' + x.msg)")
        check('no TeX errors for them', not [x for x in probs if x.startswith('error')], probs[:5])
        page.screenshot(path=SHOTS + '/engines-minted.png')

        # pygmentize -x would run a lexer from a .py file the document wrote: Python of the
        # document's choosing in the worker, next to this browser's storage
        open_doc(page, [['probe.tex', '\\begin{filecontents*}[overwrite]{evil.py}\nopen("pwned.txt", "w").write("x")\nfrom pygments.lexer import RegexLexer\nclass Evil(RegexLexer):\n    tokens = {"root": []}\n\\end{filecontents*}\n'
                         '\\begin{filecontents*}[overwrite]{in.txt}\nhello\n\\end{filecontents*}\n\\documentclass{article}\n\\immediate\\write18{pygmentize -x -l evil.py:Evil -o out.txt in.txt}\n'
                         '\\begin{document}\n\\IfFileExists{pwned.txt}{\\PackageWarning{probe}{RIKUY-PWNED}}{\\PackageWarning{probe}{RIKUY-SAFE}}x\n\\end{document}\n']])
        st = wait_pdf(page, 240)
        probs = ' '.join(page.evaluate("window.rikuy.texIssues.map(x => x.msg)"))
        check('pygmentize -x does not run Python a document wrote', 'RIKUY-SAFE' in probs and 'RIKUY-PWNED' not in probs, (st, probs[:300]))

        # PSTricks: labels on connections (\nbput) make xdvipdfmx ask Ghostscript for their position
        open_doc(page, [['tree.tex', '\\documentclass{article}\n\\usepackage{pstricks-add,pst-node,pst-tree}\n\\begin{document}\n'
                         '\\pstree{\\TR[name=A]{Ada}}{\\TR[name=B]{Bob}\\TR[name=C]{Cy}}\n\\ncline{B}{C}\\nbput{1940}\n'
                         '\\rput{30}(1,0){turned}\n\\end{document}\n']])
        st = wait_pdf(page, 240)
        check('PSTricks (pstricks-add) compiles with XeLaTeX', st.startswith('XeLaTeX') and 'page' in st, st)
        probs = page.evaluate("window.rikuy.texIssues.map(x => x.sev + ': ' + x.msg)")
        # the connection is drawn only if xdvipdfmx had Ghostscript render PSTricks' PostScript (a
        # form on the page): without PSTricks' XeTeX driver (pst: specials) the page had the tree's
        # names and no line at all
        drawn = page.evaluate("""async () => { const lib = await import(new URL('tex/pdf.min.mjs', location.href).href);
          const p = await window.rikuy.pdfView.doc.getPage(1); const ops = (await p.getOperatorList()).fnArray;
          return ops.filter(o => o === lib.OPS.paintFormXObjectBegin || o === lib.OPS.constructPath).length; }""")
        check('with lines and labels drawn by Ghostscript', not [x for x in probs if x.startswith('error')] and drawn > 0, (probs[:5], drawn))

        # dvips: the same figure through latex, dvips and Ghostscript
        page.select_option('#pdf-engine', 'latex')
        st = wait_pdf(page, 240)
        check('LaTeX (dvips) compiles PSTricks', st.startswith('LaTeX (dvips)') and 'page' in st, st)
        page.select_option('#pdf-engine', 'auto')
        wait_pdf(page)

        # Asymptote: asymptote.sty's figures drawn by asy, its labels measured by a second TeX
        open_doc(page, [['asy.tex', '\\documentclass{article}\n\\usepackage{asymptote}\n\\begin{document}\n\\begin{asy}\nimport graph;\nsize(5cm,3cm,IgnoreAspect);\n'
                         'draw(graph(new real(real x) {return x^2;},0,2),blue);\nxaxis("$x$",BottomTop,LeftTicks);\nyaxis("$y$",LeftRight,RightTicks);\n\\end{asy}\n\\end{document}\n']])
        st = wait_pdf(page, 300)
        check('an Asymptote figure compiles', st.startswith('pdfLaTeX') and 'page' in st, st)
        probs = page.evaluate("window.rikuy.texIssues.map(x => x.sev + ': ' + x.msg)")
        check('with no missing program', not [x for x in probs if 'cannot run' in x or x.startswith('error')], probs[:5])

        # xindy: imakeidx's texindy, glossaries' xindy
        open_doc(page, [['idx.tex', '\\documentclass{article}\n\\usepackage[T1]{fontenc}\n\\usepackage[xindy]{imakeidx}\n\\makeindex[options=-L german-din -C utf8]\n'
                         '\\begin{document}\nÄpfel\\index{Äpfel} Apfel\\index{Apfel} Zahl\\index{Zahl!ganze}\n\\printindex\n\\end{document}\n']])
        st = wait_pdf(page, 300)
        check('imakeidx with texindy compiles', st.startswith('pdfLaTeX') and 'page' in st, st)
        probs = page.evaluate("window.rikuy.texIssues.map(x => x.sev + ': ' + x.msg)")
        check('xindy ran', not [x for x in probs if 'xindy' in x or x.startswith('error')], probs[:5])
        open_doc(page, [['gls.tex', '\\documentclass{article}\n\\usepackage[xindy]{glossaries}\n\\makeglossaries\n'
                         '\\newglossaryentry{zebra}{name=zebra,description={an animal}}\n\\newglossaryentry{apple}{name=apple,description={a fruit}}\n'
                         '\\begin{document}\n\\gls{zebra}, \\gls{apple}.\n\\printglossaries\n\\end{document}\n']])
        st = wait_pdf(page, 300)
        check('glossaries with xindy compiles', st.startswith('pdfLaTeX') and 'page' in st, st)
        probs = page.evaluate("window.rikuy.texIssues.map(x => x.sev + ': ' + x.msg)")
        check('and has its glossary', not [x for x in probs if 'xindy' in x or 'glossar' in x.lower() or x.startswith('error')], probs[:5])

        # a pipe: \input|"cmd" reads a program's output
        open_doc(page, [['pipe.tex', '\\documentclass{article}\n\\begin{document}\n\\input|"echo Piped text"\n\\end{document}\n']])
        st = wait_pdf(page)
        check('\\input|"echo" compiles', st.startswith('pdfLaTeX') and 'page' in st, st)

        open_doc(page, [['fig.tex', '\\documentclass{article}\n\\begin{document}\n\\immediate\\write18{inkscape figure.svg}\nText.\n\\end{document}\n']])
        st = wait_pdf(page)
        probs = page.evaluate("window.rikuy.texIssues.map(x => x.msg)")
        check('a program that cannot run is reported', any('inkscape cannot run in the browser' in x for x in probs), probs[:5])

        page.uncheck('#pdf-shell')
        st = wait_pdf(page)
        log_mode = page.evaluate("window.rikuy.prefs.shellEscape")
        check('shell escape can be turned off', log_mode is False)
        page.check('#pdf-shell')
        wait_pdf(page)

        # Chinese and Arabic: the fonts are packs of their own (build_tree.py, SCRIPT_PICKS), the
        # engine follows the set up lines src/scripts.js writes
        def pdf_fonts_text(page):
            import io, pypdf
            b64 = page.evaluate("""() => { const b = window.rikuy.lastPdf; if (!b) return ''; let s = ''; const u = new Uint8Array(b);
              for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); }""")
            if not b64: return set(), ''
            r = pypdf.PdfReader(io.BytesIO(base64.b64decode(b64)))
            fonts = set()
            for pg in r.pages:
                for f in (pg['/Resources'].get('/Font') or {}).values():
                    fonts.add(str(f.get_object().get('/BaseFont')))
            return fonts, ''.join(pg.extract_text() for pg in r.pages)

        open_doc(page, [['main.tex', '\\documentclass{article}\n\\usepackage[scheme=plain]{ctex}\n\\begin{document}\nHello 你好，世界！\\textbf{粗体} \\textit{楷体} 繁體：臺灣。\n\\end{document}\n']])
        st = wait_pdf(page)
        fonts, text = pdf_fonts_text(page)
        check('Chinese with ctex compiles with XeLaTeX on Auto', st.startswith('XeLaTeX') and 'page' in st, st)
        check('the PDF sets it in Fandol Song, bold and Kai, with the Latin in Latin Modern', all(any(n in f for f in fonts) for n in ('FandolSong-Regular', 'FandolSong-Bold', 'FandolKai-Regular', 'LMRoman10-Regular')), sorted(fonts))

        AR = '\\documentclass{article}\n\\usepackage[english, bidi=basic]{babel}\n\\babelprovide[import, %s]{arabic}\n\\babelfont%s{rm}[Renderer=Harfbuzz]{Amiri}\n\\begin{document}\n%s\n\\end{document}\n'
        open_doc(page, [['main.tex', AR % ('onchar=ids fonts', '[arabic]', 'Hello مرحبا بالعالم world (مع أقواس) 123.')]])
        st = wait_pdf(page)
        fonts, text = pdf_fonts_text(page)
        check('Arabic with babel bidi=basic compiles with LuaLaTeX on Auto', st.startswith('LuaLaTeX') and 'page' in st and 'babel bidi' in page.evaluate("document.getElementById('pdf-engine').title"), st)
        check('the PDF sets the Arabic in Amiri and the rest in Latin Modern', any('Amiri-Regular' in f for f in fonts) and any('LMRoman10' in f for f in fonts), sorted(fonts))
        check('no problems are reported', not [x for x in page.evaluate("window.rikuy.texIssues.map(x => x.sev + ' ' + x.msg)") if x.startswith('error')], page.evaluate("window.rikuy.texIssues.map(x => x.msg)")[:4])

        open_doc(page, [['main.tex', AR % ('main', '', '\\section{مقدمة}\nهذه فقرة عربية مع English وسطها. \\textbf{عريض}')]])
        st = wait_pdf(page)
        fonts, text = pdf_fonts_text(page)
        check('an Arabic main language document compiles', st.startswith('LuaLaTeX') and 'page' in st and any('Amiri-Bold' in f for f in fonts), [st, sorted(fonts)])

        open_doc(page, [['main.tex', '\\documentclass{article}\n\\usepackage{CJKutf8}\n\\begin{document}\n\\begin{CJK}{UTF8}{gbsn}你好，世界！\\end{CJK}\n\\begin{CJK}{UTF8}{bsmi}繁體中文\\end{CJK}\n\\end{document}\n']])
        st = wait_pdf(page)
        fonts, text = pdf_fonts_text(page)
        check('the CJK package compiles with pdfLaTeX (Arphic fonts)', st.startswith('pdfLaTeX') and 'page' in st and any('gbsnu' in f for f in fonts) and any('bsmiu' in f for f in fonts), [st, sorted(fonts)[:6]])

        # the whole way for a newcomer: Chinese typed into a plain document, the notice's one
        # click, and a PDF in Fandol
        open_doc(page, [['main.tex', '\\documentclass{article}\n\\begin{document}\nHello 你好，世界！\n\\end{document}\n']])
        page.wait_for_selector('#script-note:not([hidden])', timeout=8000)
        said = page.inner_text('#script-msg')
        page.click('#script-go')
        page.wait_for_timeout(400)
        st = wait_pdf(page)
        fonts, text = pdf_fonts_text(page)
        check('a plain document with Chinese text: the notice, one click, and the PDF is set in Fandol', 'Chinese' in said and st.startswith('XeLaTeX') and 'page' in st and any('FandolSong-Regular' in f for f in fonts), [said, st, sorted(fonts)])

        errs = [e for e in errors if 'favicon' not in e]
        check('no page errors', not errs, errs[:5])
        browser.close()

        # a copy without the Chinese and Arabic packs (the artifact on claude.ai): the compile
        # stops, no half made PDF is shown, and the result says that only those packs were missed
        import gzip, json, re
        raw = open(os.path.join(os.environ.get('RIKUY_DIST') or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'dist'), 'tex', 'tree.wasm'), 'rb').read()
        idx = json.loads(gzip.decompress(raw[raw.index(b'galley') + 6:]))
        xpacks = [p_['f'] for p_ in idx['packs'] if p_.get('x')]
        browser, page, errors = open_page(p, width=1500, height=950)
        page.route(re.compile('/tex/(' + '|'.join(re.escape(f) for f in xpacks) + ')$'), lambda route: route.fulfill(status=404, body='not here'))
        open_doc(page, [['main.tex', '\\documentclass{article}\n\\usepackage[scheme=plain]{ctex}\n\\begin{document}\n你好\n\\end{document}\n']])
        page.click('#b-pdf')
        wait_pdf(page)
        lc = page.evaluate("window.rikuy.lastCompile")
        shown = page.evaluate("document.getElementById('pdf-host').textContent")
        check('24 packs are marked as the Chinese and Arabic ones', len(xpacks) == 24, len(xpacks))
        check('without them a Chinese document gets no PDF, and the result names only those packs', bool(lc) and lc.get('unkeptScripts') is True and not lc.get('ok') and not page.evaluate("!!document.querySelector('#pdf-host canvas')") and 'could not be loaded' in shown, [lc and {k: lc[k] for k in ('unkept', 'unkeptScripts', 'ok')}, shown[:160]])
        browser.close()
except Exception as e:
    # a run that stops part way has failed, whatever the checks before it said
    traceback.print_exc()
    check('the run reaches its end', False, e)

bad = [r for r in results if not r[1]]
print('%d/%d passed' % (len(results) - len(bad), len(results)))
sys.exit(1 if bad else 0)
