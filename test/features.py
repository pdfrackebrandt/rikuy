"""Projects with several files: open a zip with folders, figures and a .bib, edit inside an
included file, undo there, and save a zip whose files come back byte for byte."""
import os, sys, time, json, zipfile, io, struct, zlib, base64, tempfile, traceback
sys.path.insert(0, os.path.dirname(__file__))
from browser import open_page, check, results, SHOTS, src, wait_src, click_text, select_text, load_doc
from playwright.sync_api import sync_playwright

TMP = tempfile.mkdtemp(prefix='rikuy-features-')

def png(w=120, h=80):
    raw = b''.join(b'\x00' + b''.join(bytes([(x*2)%256, (y*3)%256, 180]) for x in range(w)) for y in range(h))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')

MAIN = r"""\documentclass{article}
\usepackage{graphicx}
\usepackage{natbib}
\begin{document}
\section{Intro}
Main text before input.
\input{sections/body}
\begin{figure}[h]
\centering
\includegraphics[width=0.5\textwidth]{figures/plot}
\caption{A plot.}\label{fig:plot}
\end{figure}
See Figure~\ref{fig:plot} and \citet{smith2020}.
\bibliographystyle{plainnat}
\bibliography{refs}
\end{document}
"""
BODY = "\\section{Body}\nText that lives in an included file.\n"
BIB = "@article{smith2020, author={Smith, Jane}, title={A Title}, journal={J. Econ.}, year={2020}}\n"
zp = os.path.join(TMP, 'project.zip')
with zipfile.ZipFile(zp, 'w') as z:
    z.writestr('MyPaper/main.tex', MAIN)
    z.writestr('MyPaper/sections/body.tex', BODY)
    z.writestr('MyPaper/refs.bib', BIB)
    z.writestr('MyPaper/figures/plot.png', png())

MOCK = """
window.__saved = null;
window.claude = { use: async (n) => {
  if (n === 'sample') { const f = async (input, opts) => { window.__lastPrompt = input; const text = 'A REWRITTEN sentence.'; await new Promise(r => setTimeout(r, 30)); opts && opts.onText && opts.onText({text, delta: text}); return {text, truncated: false, modelTierApplied: 'default'}; }; f.json = async () => ({}); f.limits = async () => ({maxPromptBytes: 262144}); return f; }
  if (n === 'downloads') return { save: async ({filename, data}) => { const b = data instanceof Blob ? data : new Blob([data]); window.__saved = {filename, size: b.size, b64: await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(b); })}; return {status: 'saved'}; } };
  return null; } };
"""

try:
    with sync_playwright() as p:
        browser, page, errors = open_page(p, width=1300, height=900, init=MOCK)
        page.wait_for_function('document.body.classList.contains("has-ai") && document.body.classList.contains("has-dl")', timeout=5000)
        check('mocked capabilities light up', True)
        # --- open zip
        page.set_input_files('#fileinput', zp)
        page.wait_for_function('window.rikuy.main === "main.tex" && window.rikuy.files.has("sections/body.tex")', timeout=8000)
        page.wait_for_timeout(300)
        check('zip opened with nested files', page.evaluate('[...window.rikuy.files.keys()].sort().join(",")') == 'main.tex,refs.bib,sections/body.tex')
        check('project named after zip', page.evaluate('window.rikuy.name') == 'project', page.evaluate('window.rikuy.name'))
        check('included file rendered', page.evaluate('[...document.querySelectorAll("#pages span.t")].some(s => s.textContent.includes("lives in an included file"))'))
        check('figure image displayed', page.evaluate('!!document.querySelector(".a-img img")'))
        check('citation from bib in zip', page.evaluate('[...document.querySelectorAll(".a-cite")].some(e => e.textContent === "Smith (2020)")'), page.evaluate('[...document.querySelectorAll(".a-cite")].map(e=>e.textContent)'))
        check('figure ref resolves', page.evaluate('[...document.querySelectorAll(".a-ref")].some(e => e.textContent === "1")'))
        # edit inside included file
        click_text(page, 'lives in an included file', 6)
        page.keyboard.type('!!')
        check('edit lands in included file', 'lives !!in an included file' in src(page, 'sections/body.tex') and '!!' not in src(page, 'main.tex'))
        page.keyboard.press('Control+z')
        check('undo in included file', src(page, 'sections/body.tex') == BODY)
        page.screenshot(path=SHOTS + '/20-zip.png')
        # --- save zip through mocked downloads
        page.click('#b-save')
        page.wait_for_function('window.__saved', timeout=8000)
        saved = page.evaluate('window.__saved')
        data = base64.b64decode(saved['b64'])
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            names = sorted(n for n in z.namelist() if not n.endswith('/'))
            check('saved zip contains project', names == ['figures/plot.png', 'main.tex', 'refs.bib', 'sections/body.tex'], names)
            check('saved tex is byte-identical', z.read('main.tex').decode() == MAIN)
        check('save filename', saved['filename'] == 'project.zip', saved['filename'])
        # --- persistence across reload
        click_text(page, 'Main text before input', 4)
        page.keyboard.type('X')
        page.wait_for_timeout(900)
        page.reload()
        page.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=15000)
        check('document persists across reload', 'MainX text' in src(page))
        page.keyboard.press('Control+z')
        # --- Ask Claude
        click_text(page, 'MainX text before input', 0)
        select_text(page, 'MainX text before input')
        page.click('#b-ai')
        page.wait_for_selector('#ask:not([hidden])')
        page.click('[data-ask^="Tighten"]')
        page.wait_for_function('!document.getElementById("ask-actions").hidden', timeout=5000)
        prompt = page.evaluate('window.__lastPrompt')
        check('ask prompt carries fragment and house style', 'MainX text before input' in prompt and 'House style' in prompt)
        page.click('#ask-accept')
        page.wait_for_timeout(200)
        check('accepting replaces selection in source', 'A REWRITTEN sentence.' in src(page) and 'MainX' not in src(page), src(page)[src(page).find('Intro'):][:80])
        page.keyboard.press('Control+z')
        # --- paste plain text with specials and paragraphs
        page.evaluate('''() => { const s = [...document.querySelectorAll('#pages span.t')].find(x => x.textContent.includes('before input')); s.scrollIntoView(); }''')
        click_text(page, 'before input', 0)
        page.evaluate('''() => { const dt = new DataTransfer(); dt.setData('text/plain', '50% & co.\\n\\nNew para '); document.getElementById('pages').dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true})); }''')
        s = src(page)
        check('paste escapes and keeps paragraphs', '50\\% \\& co.\n\nNew para before input' in s, s[s.find('Intro'):][:80])
        page.keyboard.press('Control+z')
        # paste LaTeX-looking text offers conversion
        click_text(page, 'before input', 0)
        page.evaluate('''() => { const dt = new DataTransfer(); dt.setData('text/plain', 'see $x^2$ and \\\\emph{this} '); document.getElementById('pages').dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true})); }''')
        page.wait_for_selector('#toast:not([hidden]) button')
        page.click('#toast button')
        s = src(page)
        check('paste as LaTeX converts', 'see $x^2$ and \\emph{this} before input' in s, s[s.find('Intro'):][:80])
        page.keyboard.press('Control+z'); page.keyboard.press('Control+z')
        # --- $ opens new math, Enter inserts
        click_text(page, 'before input', 6)
        page.keyboard.type('$')
        page.wait_for_selector('#pop-newtex')
        # the math field takes each key after the one before has moved its cursor
        page.keyboard.type('a^2+b^2', delay=60)
        page.keyboard.press('Enter')
        wait_src(page, 'before$a^2+b^2$ input')
        s = src(page)
        check('dollar inserts inline math', 'before$a^2+b^2$ input' in s, s[s.find('Main'):][:60])
        page.keyboard.type('Z')
        check('caret lands after new math', 'before$a^2+b^2$Z input' in src(page), src(page)[src(page).find('Main'):][:60])
        page.keyboard.press('Control+z'); page.keyboard.press('Control+z')
        # dollar twice -> literal
        click_text(page, 'before input', 6)
        page.keyboard.type('$')
        page.wait_for_selector('#pop-newtex')
        page.keyboard.type('$')
        page.wait_for_timeout(100)
        check('dollar dollar gives literal \\$', 'before\\$ input' in src(page), src(page)[src(page).find('Main'):][:40])
        page.keyboard.press('Control+z')
        # --- palette: footnote
        click_text(page, 'before input', 6)
        page.keyboard.type('\\')
        page.wait_for_selector('#pop-cmd')
        page.keyboard.type('foot')
        page.keyboard.press('Enter')
        page.keyboard.type('note text')
        s = src(page)
        check('palette inserts footnote and caret inside', 'before\\footnote{note text} input' in s, s[s.find('Main'):][:60])
        page.keyboard.press('Control+z'); page.keyboard.press('Control+z')
        # --- select-first atom deletion
        click_text(page, 'and', 0, nth=0)
        page.evaluate('''() => { const c = document.querySelector('.a-cite'); const r = document.createRange(); r.setStartAfter(c); r.collapse(true); document.getElementById('pages').focus(); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }''')
        page.keyboard.press('Backspace')
        check('first backspace selects citation', page.evaluate('!!document.querySelector(".a-cite.sel")') and '\\citet{smith2020}' in src(page))
        page.keyboard.press('Backspace')
        check('second backspace deletes citation', '\\citet{smith2020}' not in src(page))
        page.keyboard.press('Control+z')
        check('undo restores citation', '\\citet{smith2020}' in src(page))
        # --- IME composition
        click_text(page, 'before input', 6)
        cdp = page.context.new_cdp_session(page)
        cdp.send('Input.imeSetComposition', {'text': '\u00b4', 'selectionStart': 1, 'selectionEnd': 1})
        cdp.send('Input.insertText', {'text': '\u00e9'})
        page.wait_for_timeout(150)
        s = src(page)
        check('IME composed character inserted once', s.count('\u00e9') == 1 and 'before\u00e9 input' in s, s[s.find('Main'):][:40])
        page.keyboard.press('Control+z')
        # --- empty bold placeholder: ctrl+b then type, then remove
        click_text(page, 'before input', 6)
        page.keyboard.press('Control+b')
        page.keyboard.type('bo')
        check('ctrl+b with caret types bold', 'before\\textbf{bo} input' in src(page), src(page)[src(page).find('Main'):][:50])
        page.keyboard.press('Backspace'); page.keyboard.press('Backspace')
        page.keyboard.press('Backspace')
        s = src(page)
        check('backspace in empty bold removes wrapper', 'before input' in s and '\\textbf{}' not in s, s[s.find('Main'):][:50])
        # --- a chapter (no \documentclass) opened beside the project joins it, as an upload to
        # Overleaf does; it used to replace the whole project
        chap = os.path.join(TMP, 'conclusion.tex')
        open(chap, 'w').write('\\section{Conclusion}\nWe are done.\n')
        page.set_input_files('#fileinput', chap)
        page.wait_for_function('window.rikuy.files.has("conclusion.tex")', timeout=8000)
        check('a chapter opened beside a project joins it', page.evaluate('window.rikuy.main') == 'main.tex' and page.evaluate('window.rikuy.files.has("sections/body.tex")'), page.evaluate('[window.rikuy.main, [...window.rikuy.files.keys()]]'))
        check('and the toast says how to use it', '\\input{conclusion}' in page.inner_text('#toast'), page.inner_text('#toast'))
        # --- biblatex without its natbib option has no \citep: Insert, Citation writes \parencite
        load_doc(page, {'main.tex': '\\documentclass{article}\n\\usepackage[style=authoryear]{biblatex}\n\\addbibresource{refs.bib}\n\\begin{document}\nHybrid regimes are common.\n\\end{document}\n', 'refs.bib': BIB})
        click_text(page, 'are common', 10)
        page.keyboard.press('Control+k')
        page.wait_for_selector('#pop-cmd')
        page.keyboard.type('cite')
        page.keyboard.press('Enter')
        page.wait_for_selector('.pop-cite')
        opts = page.evaluate("[...document.querySelectorAll('#pop-citecmd option')].map((o) => o.value)")
        check('biblatex: a new citation is \\parencite', '\\parencite{}' in src(page), src(page)[src(page).find('common'):][:30])
        check('biblatex: the menu offers its own commands, not natbib\'s', 'citep' not in opts and 'textcite' in opts, opts)
        page.keyboard.press('Escape')
        # --- a PDF figure named without its extension is in the project, not missing
        page.evaluate("() => window.rikuy.addAsset('figs/curve.pdf', new Blob(['%PDF-1.4'], { type: 'application/pdf' }))")
        load_doc(page, '\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\n\\includegraphics{curve}\n\\end{document}\n')
        page.wait_for_selector('.img-missing small', timeout=5000)
        note = page.evaluate("(document.querySelector('.img-missing small') || {}).textContent")
        check('\\includegraphics{curve} of a curve.pdf says it shows in the PDF', note == 'PDF and EPS figures show in the compiled PDF', note)
        # New document: a blank article to type into, the old one kept as a version
        before = page.evaluate('() => window.rikuy.name')
        page.click('#b-new')
        page.wait_for_function("() => window.rikuy.name.startsWith('Untitled')", timeout=5000)
        page.wait_for_timeout(400)
        check('New document opens a blank article', page.evaluate("() => window.rikuy.files.get('main.tex')") == '\\documentclass{article}\n\\usepackage{amsmath}\n\n\\begin{document}\n\n\\end{document}\n')
        kept = page.evaluate('async (n) => (await window.rikuy.allSnaps()).some((v) => v.name === n)', before)
        check('and the document before it stays under Versions', kept, before)
        page.click('#pages .page')
        page.keyboard.type('Hello')
        wait_src(page, 'Hello')
        check('typing on its empty page starts the text', '\\begin{document}\nHello' in src(page) or '\nHello\n' in src(page), src(page))
        check('no console errors', not errors, errors[:5])
        browser.close()
except Exception as e:
    # a run that stops part way has failed, whatever the checks before it said
    traceback.print_exc()
    check('the run reaches its end', False, e)

bad = [r for r in results if not r[1]]
print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
sys.exit(1 if bad else 0)
