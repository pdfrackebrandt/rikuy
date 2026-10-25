"""Engines and shell escape in the page: Auto picks XeLaTeX for fontspec and LuaLaTeX for a
magic comment, the menu overrides it per project, minted and EPS figures compile, PSTricks with
XeLaTeX and with latex + dvips, Asymptote figures, xindy indexes and glossaries, pipes, and a
program that cannot run in a browser is reported in Problems."""
import os, sys, time, base64
sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
from browser import open_page, check, results, SHOTS
from playwright.sync_api import sync_playwright

EPS = '%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 60 40\nnewpath 30 20 15 0 360 arc 0.8 0.2 0.2 setrgbcolor fill showpage\n'


def open_doc(page, files):
    page.evaluate("""async (files) => {
      const list = files.map(([n, t]) => new File([t], n));
      await window.galley.openFiles(list); }""", files)
    page.wait_for_timeout(500)


def wait_pdf(page, timeout=180):
    t = time.time()
    page.wait_for_timeout(1600)
    while time.time() - t < timeout:
        busy = page.evaluate("window.galley.compiling || !!window.galley.compileAgain")
        if not busy: break
        page.wait_for_timeout(500)
    return page.evaluate("document.getElementById('pdf-status').textContent")


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
    probs = page.evaluate("window.galley.texIssues.map(x => x.sev + ': ' + x.msg)")
    check('no TeX errors for them', not [x for x in probs if x.startswith('error')], probs[:5])
    page.screenshot(path=SHOTS + '/engines-minted.png')

    # PSTricks: labels on connections (\nbput) make xdvipdfmx ask Ghostscript for their position
    open_doc(page, [['tree.tex', '\\documentclass{article}\n\\usepackage{pstricks-add,pst-node,pst-tree}\n\\begin{document}\n'
                     '\\pstree{\\TR[name=A]{Ada}}{\\TR[name=B]{Bob}\\TR[name=C]{Cy}}\n\\ncline{B}{C}\\nbput{1940}\n'
                     '\\rput{30}(1,0){turned}\n\\end{document}\n']])
    st = wait_pdf(page, 240)
    check('PSTricks (pstricks-add) compiles with XeLaTeX', st.startswith('XeLaTeX') and 'page' in st, st)
    probs = page.evaluate("window.galley.texIssues.map(x => x.sev + ': ' + x.msg)")
    # the connection is drawn only if xdvipdfmx had Ghostscript render PSTricks' PostScript (a
    # form on the page): without PSTricks' XeTeX driver (pst: specials) the page had the tree's
    # names and no line at all
    drawn = page.evaluate("""async () => { const lib = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
      const p = await window.galley.pdfView.doc.getPage(1); const ops = (await p.getOperatorList()).fnArray;
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
    probs = page.evaluate("window.galley.texIssues.map(x => x.sev + ': ' + x.msg)")
    check('with no missing program', not [x for x in probs if 'cannot run' in x or x.startswith('error')], probs[:5])

    # xindy: imakeidx's texindy, glossaries' xindy
    open_doc(page, [['idx.tex', '\\documentclass{article}\n\\usepackage[T1]{fontenc}\n\\usepackage[xindy]{imakeidx}\n\\makeindex[options=-L german-din -C utf8]\n'
                     '\\begin{document}\nÄpfel\\index{Äpfel} Apfel\\index{Apfel} Zahl\\index{Zahl!ganze}\n\\printindex\n\\end{document}\n']])
    st = wait_pdf(page, 300)
    check('imakeidx with texindy compiles', st.startswith('pdfLaTeX') and 'page' in st, st)
    probs = page.evaluate("window.galley.texIssues.map(x => x.sev + ': ' + x.msg)")
    check('xindy ran', not [x for x in probs if 'xindy' in x or x.startswith('error')], probs[:5])
    open_doc(page, [['gls.tex', '\\documentclass{article}\n\\usepackage[xindy]{glossaries}\n\\makeglossaries\n'
                     '\\newglossaryentry{zebra}{name=zebra,description={an animal}}\n\\newglossaryentry{apple}{name=apple,description={a fruit}}\n'
                     '\\begin{document}\n\\gls{zebra}, \\gls{apple}.\n\\printglossaries\n\\end{document}\n']])
    st = wait_pdf(page, 300)
    check('glossaries with xindy compiles', st.startswith('pdfLaTeX') and 'page' in st, st)
    probs = page.evaluate("window.galley.texIssues.map(x => x.sev + ': ' + x.msg)")
    check('and has its glossary', not [x for x in probs if 'xindy' in x or 'glossar' in x.lower() or x.startswith('error')], probs[:5])

    # a pipe: \input|"cmd" reads a program's output
    open_doc(page, [['pipe.tex', '\\documentclass{article}\n\\begin{document}\n\\input|"echo Piped text"\n\\end{document}\n']])
    st = wait_pdf(page)
    check('\\input|"echo" compiles', st.startswith('pdfLaTeX') and 'page' in st, st)

    open_doc(page, [['fig.tex', '\\documentclass{article}\n\\begin{document}\n\\immediate\\write18{inkscape figure.svg}\nText.\n\\end{document}\n']])
    st = wait_pdf(page)
    probs = page.evaluate("window.galley.texIssues.map(x => x.msg)")
    check('a program that cannot run is reported', any('inkscape cannot run in the browser' in x for x in probs), probs[:5])

    page.uncheck('#pdf-shell')
    st = wait_pdf(page)
    log_mode = page.evaluate("window.galley.prefs.shellEscape")
    check('shell escape can be turned off', log_mode is False)
    page.check('#pdf-shell')
    wait_pdf(page)

    errs = [e for e in errors if 'favicon' not in e]
    check('no page errors', not errs, errs[:5])
    browser.close()

print('%d/%d passed' % (sum(1 for r in results if r[1]), len(results)))
