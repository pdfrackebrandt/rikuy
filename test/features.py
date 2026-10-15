import os, sys, time, json, zipfile, io, struct, zlib, base64
sys.path.insert(0, os.path.dirname(__file__))
from browser import open_page, check, results, SHOTS, src, click_text, select_text
from playwright.sync_api import sync_playwright

TMP = '/tmp/claude-0/-home-claude/8e522320-e94c-5af0-b5c6-59aa3f1e4221/scratchpad'

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

with sync_playwright() as p:
    browser, page, errors = open_page(p, width=1300, height=900, init=MOCK)
    page.wait_for_function('document.body.classList.contains("has-ai") && document.body.classList.contains("has-dl")', timeout=5000)
    check('mocked capabilities light up', True)
    # --- open zip
    page.set_input_files('#fileinput', zp)
    page.wait_for_function('window.galley.main === "main.tex" && window.galley.files.has("sections/body.tex")', timeout=8000)
    page.wait_for_timeout(300)
    check('zip opened with nested files', page.evaluate('[...window.galley.files.keys()].sort().join(",")') == 'main.tex,refs.bib,sections/body.tex')
    check('project named after zip', page.evaluate('window.galley.name') == 'project', page.evaluate('window.galley.name'))
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
    page.wait_for_function('window.galley && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=15000)
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
    page.keyboard.type('a^2+b^2')
    page.keyboard.press('Enter')
    page.wait_for_timeout(200)
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
    check('no console errors', not errors, errors[:5])
    browser.close()

bad = [r for r in results if not r[1]]
print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
