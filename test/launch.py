"""Opening files with the installed app (manifest file_handlers, launchQueue) and sharing files to
it (share_target), on the hosted build served as Cloudflare Pages serves it (pages.py).

A browser test cannot ask the operating system to open a file with an installed app, so the
page's launchQueue is a stand-in installed before the page runs: the page's consumer (src/pwa.js
takeLaunches) gets file handles as Chromium hands them, and must open them as the Open button
does: a .tex as a new project, an Overleaf .zip as a project marked as someone else's, a .bib
into the project open now. The manifest must name the three types. The share target is real: a
form posts files to ./share-target, the service worker keeps them and opens the page, which opens
them after a click, as someone else's, and never over a file the open project has.

Needs a page built without RIKUY_SHARE (npm run build); RIKUY_DIST names another dist/."""
import base64, io, json, os, sys, zipfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import ROOT, check, results, SHOTS
import pages
from playwright.sync_api import sync_playwright

DIST = os.path.abspath(os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist'))
PORT = int(os.environ.get('LAUNCH_PORT', '8797'))
URL = f'http://127.0.0.1:{PORT}/'

# the launchQueue Chromium gives an installed app's window, played by the test
FAKE_QUEUE = '''Object.defineProperty(window, 'launchQueue', { configurable: true, value: { setConsumer(f) { window.__launch = f; } } });'''
LAUNCH = '''async (files) => {
  const handles = files.map(([name, b64]) => ({ kind: 'file', name, getFile: async () => new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], name) }));
  await window.__launch({ files: handles });
}'''
b64 = lambda b: base64.b64encode(b if isinstance(b, bytes) else b.encode()).decode()
PAPER = '\\documentclass{article}\n\\begin{document}\nOpened from the file manager.\n\\end{document}\n'


def overleaf_zip():
    z = io.BytesIO()
    with zipfile.ZipFile(z, 'w') as f:
        f.writestr('Thesis/main.tex', '\\documentclass{report}\n\\begin{document}\nA thesis from Overleaf \\cite{k}.\n\\bibliography{refs}\n\\end{document}\n')
        f.writestr('Thesis/refs.bib', '@book{k, title={T}, author={A}, year={2020}}\n')
        f.writestr('Thesis/chapters/one.tex', 'One.\n')
    return z.getvalue()


def ready(page):
    page.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=30000)


def project(page):
    return page.evaluate('''() => ({ main: window.rikuy.main, name: window.rikuy.name, files: [...window.rikuy.files.keys()].sort(),
      link: (window.rikuy.linkCache && window.rikuy.linkCache.get(window.rikuy.name + '|' + window.rikuy.main)) || null })''')


srv = pages.start(PORT, DIST)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1300, 'height': 900})
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.add_init_script(FAKE_QUEUE)
    page.goto(URL)
    ready(page)

    man = json.loads(open(os.path.join(DIST, 'manifest.webmanifest'), encoding='utf8').read())
    acc = {ext for h in man.get('file_handlers', []) for exts in h['accept'].values() for ext in exts}
    check('the manifest hands .tex, .bib, .zip and Word files to the app, in its scope', acc == {'.tex', '.bib', '.zip', '.docx'} and all(h['action'] == './' for h in man['file_handlers']), man.get('file_handlers'))
    check('into the window already open', man.get('launch_handler', {}).get('client_mode', [None])[0] == 'focus-existing')
    check('and takes files shared to it by post', man.get('share_target', {}).get('method') == 'POST' and man['share_target']['action'] == './share-target')

    page.wait_for_function('typeof window.__launch === "function"', timeout=10000)
    check('the page consumes launchQueue', True)
    page.evaluate(LAUNCH, [['paper.tex', b64(PAPER)]])
    pr = project(page)
    check('a .tex opened with Rikuy opens as a project of its own', pr['main'] == 'paper.tex' and pr['files'] == ['paper.tex'] and 'Opened from the file manager' in page.evaluate('window.rikuy.files.get("paper.tex")'), pr)
    check('as the user\'s own, as the Open button opens it', pr['link'] is None, pr['link'])
    page.evaluate(LAUNCH, [['extra.bib', b64('@misc{x, title={X}}\n')]])
    check('a .bib opened with Rikuy joins the project open now', project(page)['files'] == ['extra.bib', 'paper.tex'], project(page))
    page.evaluate(LAUNCH, [['Thesis.zip', b64(overleaf_zip())]])
    page.wait_for_function('window.rikuy.main === "main.tex"', timeout=10000)
    pr = project(page)
    check('an Overleaf .zip opened with Rikuy opens as its project', pr['name'] == 'Thesis' and pr['files'] == ['chapters/one.tex', 'main.tex', 'refs.bib'], pr)
    check('marked as someone else\'s, as the Open button marks a .zip', bool(pr['link']) and pr['link']['origin'] == 'zip' and not pr['link']['allowed'], pr['link'])
    page.wait_for_function('document.querySelectorAll("#pages .page").length > 0')
    page.screenshot(path=os.path.join(SHOTS, 'launch.png'))

    # ---- shared to the app --------------------------------------------------------------
    page.wait_for_function('navigator.serviceWorker.controller !== null', timeout=30000)
    POST = '''([files]) => {
      const f = document.createElement('form'); f.method = 'POST'; f.action = 'share-target'; f.enctype = 'multipart/form-data';
      const i = document.createElement('input'); i.type = 'file'; i.name = 'files'; i.multiple = true;
      const dt = new DataTransfer();
      for (const [name, b] of files) dt.items.add(new File([Uint8Array.from(atob(b), (c) => c.charCodeAt(0))], name));
      i.files = dt.files; f.append(i); document.body.append(f); f.submit(); }'''
    with page.expect_navigation():
        page.evaluate(POST, [[['shared.tex', b64(PAPER.replace('file manager', 'share sheet'))]]])
    ready(page)
    page.wait_for_function('!document.getElementById("toast").hidden && document.getElementById("toast").innerText.includes("shared.tex")', timeout=10000)
    check('a share opens the app with the files waiting, and the address loses the id', '?' not in page.url and page.is_visible('#toast') and 'shared.tex' in page.inner_text('#toast'), (page.url, page.inner_text('#toast')))
    check('nothing opens before the click', project(page)['main'] == 'main.tex')
    page.click('#toast button')
    page.wait_for_function('window.rikuy.main === "shared.tex"', timeout=10000)
    pr = project(page)
    check('after the click the shared .tex opens as a project, marked as someone else\'s', pr['files'] == ['shared.tex'] and pr['link'] and pr['link']['origin'] == 'share', pr)
    check('and the service worker keeps nothing of it', page.evaluate('caches.open("rikuy-share").then(c => c.keys()).then(k => k.length)') == 0)

    # a page elsewhere posting a chapter named like a file of the open project replaces nothing
    before = page.evaluate('window.rikuy.files.get("shared.tex")')
    with page.expect_navigation():
        page.evaluate(POST, [[['shared.tex', b64('Planted text.\n')], ['notes.tex', b64('New notes.\n')]]])
    ready(page)
    page.click('#toast button')
    page.wait_for_function('window.rikuy.files.has("notes.tex")', timeout=10000)
    check('shared files never replace a file of the project open now', page.evaluate('window.rikuy.files.get("shared.tex")') == before and 'Not replaced: shared.tex' in page.inner_text('#toast'), page.inner_text('#toast'))
    # the user's own project (opened from the file manager, unrestricted), then a class shared to
    # it by a page elsewhere: with a stranger's code in it, the project is someone else's
    page.evaluate(LAUNCH, [['thesis.tex', b64(PAPER)]])
    page.wait_for_function('window.rikuy.main === "thesis.tex"', timeout=10000)
    check('(a project of the user\'s own is open, unrestricted)', project(page)['link'] is None, project(page)['link'])
    with page.expect_navigation():
        page.evaluate(POST, [[['article.cls', b64('\\ProvidesClass{article}\n')], ['hyperref.cfg', b64('% planted\n')]]])
    ready(page)
    page.click('#toast button')
    page.wait_for_function('window.rikuy.files.has("article.cls")', timeout=10000)
    pr = project(page)
    check('a class shared into the user\'s own project makes it someone else\'s: shell escape restricted', pr['main'] == 'thesis.tex' and pr['link'] and pr['link']['origin'] == 'share' and not pr['link']['allowed'], pr)
    # opening a file of the same name with the app replaces it, with the version before in History
    n0 = page.evaluate('window.rikuy.allSnaps().then((a) => a.length)')
    page.evaluate(LAUNCH, [['article.cls', b64('% mine now\n')]])
    page.wait_for_function('window.rikuy.files.get("article.cls").includes("mine now")', timeout=10000)
    labels = page.evaluate('window.rikuy.allSnaps().then((a) => a.map((v) => v.label))')
    check('a file opened over one of the same name leaves the version before in History', len(labels) > n0 and any('article.cls was replaced' in (l or '') for l in labels), labels[:4])
    check('no page errors', not errors, errors[:3])
    b.close()
srv.shutdown(); srv.server_close()
fails = [r for r in results if not r[1]]
print('\n%d/%d passed' % (len(results) - len(fails), len(results)))
sys.exit(1 if fails else 0)
