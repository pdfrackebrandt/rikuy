"""The preamble's format (tex/engine.js, PRE): a document compiled twice with one preamble gets
its preamble dumped as a format while the worker is idle, and later passes start from it.
Checked on the worker alone (the smoke page), with pdfLaTeX:

- the third compile starts from the format and gives the PDF of the ordinary pass, byte for
  byte but for its dates and ID, with the same log lines for the page's problems and SyncTeX
  that knows the body's lines; an edit of the body compiles from it, the new text in the PDF;
- with xcolor (a colour push waits on the page when the preamble ends) and with TikZ (pgf seeds
  its random numbers from the clock at load) the same holds;
- an error in the body is reported with the file's line, by the ordinary pass, and once it is
  fixed the format is used again;
- the format is not used when anything it depends on changed: the preamble, a file of the
  project the preamble read, the names of the project's files, the shell escape mode, a
  document marked as someone else's;
- preambles a format cannot hold are refused, each for its reason, and compile as before: a file
  opened for writing (\\makeindex), \\pdfinfo, a colour stack, the clock kept in a macro, a
  program run through the shell.

Needs dist/tex. RIKUY_DIST names another dist/."""
import base64, gzip, io, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import serve
from browser import check, results
from playwright.sync_api import sync_playwright
PORT = int(os.environ.get('PORT', '8797'))
serve.start(PORT)

DOC = ('\\documentclass{article}\n\\usepackage{amsmath}\n\\usepackage[colorlinks]{hyperref}\n\\newcommand{\\who}{quokka}\n\\begin{document}\n'
       '\\section{One}\\label{s}\nA \\who{} in Section~\\ref{s}, $a^2+b^2=c^2$.\n\nSecond paragraph here.\n\\end{document}\n')
COMPILE = """([files, project, extra]) => { window.result = null; window.err = null; window.events.length = 0;
  compile(files.map(([path, data]) => ({ path, data })), 'main.tex', false, project, 'sig', 'auto', extra || {}); }"""
RESULT = """() => { const r = window.result; if (!r) return { error: String(window.err && window.err.error) };
  const b64 = (buf) => { if (!buf) return ''; const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  return { ok: r.ok, passes: r.passes, fromFormat: r.fromFormat, note: r.formatNote, log: r.log, pdf: b64(r.pdf), synctex: b64(r.synctex) }; }"""


def core(r):
    """The PDF without its dates and ID."""
    b = base64.b64decode(r['pdf'])
    b = re.sub(rb'/(CreationDate|ModDate) ?\(D:[^)]*\)', b'', b)
    return re.sub(rb'/ID ?\[ ?<[0-9A-Fa-f]*> ?<[0-9A-Fa-f]*> ?\]', b'', b)


def text(r):
    from pypdf import PdfReader
    return ' '.join((p.extract_text() or '') for p in PdfReader(io.BytesIO(base64.b64decode(r['pdf']))).pages)


def problems(r):
    return [l for l in r['log'].split('\n') if re.match(r'^(! |.*Warning|[^\s:()][^:()]*:\d+: )', l)]


with sync_playwright() as pw:
    b = pw.chromium.launch()
    page = b.new_page()
    page.goto('http://127.0.0.1:%d/tex-smoke.html' % PORT)
    page.wait_for_function('window.ready', timeout=180000)

    def compile(files, project, extra=None, settle=False):
        page.evaluate(COMPILE, [[[k, v] for k, v in files.items()], project, extra])
        page.wait_for_function('!!(window.result || window.err)', timeout=240000, polling=50)
        r = page.evaluate(RESULT)
        if settle:  # the worker says when the format is made or refused
            try: page.wait_for_function("window.events.includes('format')", timeout=60000, polling=50)
            except Exception: pass
        return r

    def warm(files, project, extra=None):
        """Two ordinary compiles and the wait for the format: what the third starts from."""
        compile(files, project, extra)
        return compile(files, project, extra, settle=True)

    # ---- the format is made, used, and gives the same pass ----
    f = {'main.tex': DOC}
    r1 = compile(f, 'a')
    r2 = compile(f, 'a', settle=True)
    check('two compiles are ordinary passes', r1['ok'] and r2['ok'] and r1['fromFormat'] == 0 and r2['fromFormat'] == 0, (r1.get('fromFormat'), r2.get('fromFormat'), r1.get('error')))
    r3 = compile(f, 'a')
    check('the third starts from the format', r3['ok'] and r3['fromFormat'] == 1 and r3['passes'] == 1 and r3['note'] == 'ready', (r3['fromFormat'], r3['passes'], r3['note']))
    check('and gives the same PDF but for its dates and ID', core(r3) == core(r2), (len(core(r3)), len(core(r2))))
    check('with the same errors and warnings in the log', problems(r3) == problems(r2), (problems(r3)[:3], problems(r2)[:3]))
    check('the log reads as an ordinary one: the format\'s name is pdflatex, the class is listed', '(preloaded format=pdflatex' in r3['log'] and 'article.cls' in r3['log'] and '**main.tex' in r3['log'], r3['log'][:300])
    syn = gzip.decompress(base64.b64decode(r3['synctex'])).decode('latin-1')
    line = DOC[:DOC.index('Second paragraph')].count('\n') + 1
    tag = (re.search(r'^Input:(\d+):.*main\.tex$', syn, re.M) or [0, '?'])[1]
    check('SyncTeX of that pass knows the body\'s lines of main.tex', re.search(r'^[xkg$(h]%s,%d:' % (tag, line), syn, re.M) is not None, (tag, line))
    r4 = compile({'main.tex': DOC.replace('Second paragraph here.', 'Second paragraph, with a zebra.')}, 'a')
    check('an edit of the body compiles from the format', r4['ok'] and r4['fromFormat'] == 1 and 'zebra' in text(r4), (r4['fromFormat'], text(r4)[:120]))
    r5 = compile({'main.tex': DOC.replace('Second paragraph here.', 'See also \\ref{new}.\n\\section{Two}\\label{new}')}, 'a')
    check('a new reference takes two passes, both from the format', r5['ok'] and r5['passes'] == 2 and r5['fromFormat'] == 2 and 'See also 2' in text(r5), (r5['passes'], r5['fromFormat'], text(r5)[:160]))

    # ---- an error in the body ----
    bad = DOC.replace('Second paragraph here.', 'Second \\nosuchmacro paragraph.')
    e1 = compile({'main.tex': bad}, 'a')
    eline = bad[:bad.index('\\nosuchmacro')].count('\n') + 1
    check('an error in the body: reported with the file\'s line, by an ordinary pass', e1['fromFormat'] == 0 and ('main.tex:%d: Undefined control sequence' % eline) in e1['log'], (e1['fromFormat'], [l for l in e1['log'].split('\n') if 'Undefined' in l][:2]))
    e2 = compile(f, 'a')
    e3 = compile(f, 'a')
    check('fixed: one ordinary compile, then the format again', e2['ok'] and e2['fromFormat'] == 0 and e3['fromFormat'] == 1 and core(e3) == core(r2), (e2['fromFormat'], e3['fromFormat'], e3['note']))

    # ---- what the format depends on ----
    p1 = compile({'main.tex': DOC.replace('{quokka}', '{numbat}')}, 'a')
    check('a changed preamble is compiled in full', p1['ok'] and p1['fromFormat'] == 0 and 'numbat' in text(p1), (p1['fromFormat'], text(p1)[:80]))
    back = compile(f, 'a')
    check('and the old preamble\'s format still serves the old preamble', back['fromFormat'] == 1 and 'quokka' in text(back), back['fromFormat'])
    s1 = compile(f, 'a', {'shellEscape': False})
    check('another shell escape mode does not get that format', s1['ok'] and s1['fromFormat'] == 0, s1['fromFormat'])
    s2 = compile(f, 'a', {'shellEscape': False, 'untrusted': True})
    check('nor does the document as a stranger\'s', s2['ok'] and s2['fromFormat'] == 0, s2['fromFormat'])
    check('the mode it was made in still does', compile(f, 'a')['fromFormat'] == 1)
    n1 = compile(dict(f, **{'note.txt': 'x'}), 'a')
    check('a new file in the project: compiled in full', n1['ok'] and n1['fromFormat'] == 0, n1['fromFormat'])
    g = {'main.tex': DOC.replace('\\newcommand{\\who}{quokka}', '\\usepackage{mine}'), 'mine.sty': '\\newcommand{\\who}{wombat}\n'}
    warm(g, 'b')
    g3 = compile(g, 'b')
    g4 = compile(dict(g, **{'mine.sty': '\\newcommand{\\who}{dingo}\n'}), 'b')
    check('a package of the project: the format is used while its bytes stay', g3['fromFormat'] == 1 and 'wombat' in text(g3), (g3['fromFormat'], g3['note']))
    check('and not once they change', g4['ok'] and g4['fromFormat'] == 0 and 'dingo' in text(g4), (g4['fromFormat'], text(g4)[:80]))

    # ---- what a format does not hold, put back ----
    for name, pre, body in [('xcolor', '\\usepackage{xcolor}', '\\textcolor{red}{red words} and black.'),
                            ('TikZ', '\\usepackage{tikz}', '\\begin{tikzpicture}\\draw (0,0) -- (1,1) node {end};\\end{tikzpicture}')]:
        d = {'main.tex': '\\documentclass{article}\n%s\n\\begin{document}\nText. %s\n\\end{document}\n' % (pre, body)}
        n = warm(d, 'c-' + name)
        q = compile(d, 'c-' + name)
        check('%s: from the format, the same PDF' % name, q['fromFormat'] == 1 and core(q) == core(n), (q['fromFormat'], q['note']))

    # ---- what a format cannot hold: refused, and the document compiles as before ----
    for name, pre, body, why in [
            ('an index', '\\usepackage{makeidx}\\makeindex', 'Word\\index{word}.', 'writes'),
            ('\\pdfinfo', '\\pdfinfo{/Subject (kept)}', 'Text.', 'PDF differs'),
            ('a colour stack', '\\chardef\\mystack=\\pdfcolorstackinit page direct{0 g}', 'Text.', 'colour stack'),
            ('the clock', '\\edef\\now{\\the\\time}', 'At \\now.', 'clock'),
            ('a program', '\\immediate\\write18{echo hello > made.txt}', 'Text.', '')]:  # (a compile in which a program ran is never dumped)
        d = {'main.tex': '\\documentclass{article}\n%s\n\\begin{document}\n%s\n\\end{document}\n' % (pre, body)}
        n = warm(d, 'd-' + name)
        q = compile(d, 'd-' + name)
        check('%s in the preamble: no format (%s), the same PDF as before' % (name, why or 'not tried'), q['ok'] and q['fromFormat'] == 0 and why in (q['note'] or '') and core(q) == core(n), (q['fromFormat'], q['note']))
    # ---- someone who goes on typing: a compile comes while the format is being made ----
    # (each compile drops the job that was waiting; the format dumped so far must be kept for
    # the next one, or it is dumped again after every compile and never used)
    g = {'main.tex': DOC.replace('quokka', 'numbat')}
    compile(g, 'typing'); compile(g, 'typing')
    used = []
    for k in range(5):
        page.wait_for_timeout(200)  # the dump, or its check, has begun: the next compile waits for it
        r = compile({'main.tex': g['main.tex'].replace('Second paragraph here.', 'Second paragraph, edit %d.' % k)}, 'typing')
        used.append(bool(r.get('fromFormat')))
    check('compiles that come while the format is made or checked do not start it over: it is in use within five of them', r['ok'] and used[-1] and 'edit 4' in text(r), used)

    b.close()

bad = [r for r in results if not r[1]]
print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
sys.exit(1 if bad else 0)
