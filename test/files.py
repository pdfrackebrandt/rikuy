"""Round trip of whole projects: open a zip, save it, every file comes back byte-identical;
an edit re-encodes only the edited file in its own encoding; everything survives a reload."""
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
        page.set_input_files('#fileinput', zpath)
        page.wait_for_function("window.rikuy.main === 'main.tex' && window.rikuy.files.has('sec/intro.tex')", timeout=10000)
        page.wait_for_timeout(600)
        check('latin-1 file decodes', '\u00fc' in src(page), src(page)[:120])
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
        print('errors:', errors[:5])
        check('no page errors', not errors, errors[:5])
        browser.close()
except Exception as e:
    # a run that stops part way has failed, whatever the checks before it said
    traceback.print_exc()
    check('the run reaches its end', False, e)
bad = [r for r in results if not r[1]]
print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
sys.exit(1 if bad else 0)
