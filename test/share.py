"""Sharing with coauthors: a link opens the document in a fresh browser with no account, the
coauthor types and comments on the typeset page, sends a link back, and the author's copy takes
the edits as tracked changes (merged with what the author wrote meanwhile). Comments are LaTeX
comment lines that change nothing on the page. Save gives one .tex for a one file project, and
Open in Overleaf posts the project as a .zip. Opening one's own link keeps the project and its
figures; a link naming files outside the project, or inflating past any document, is refused; a link in
a stranger's document opens only as a web or mail address."""
import base64, io, json, os, sys, zipfile, zlib
sys.path.insert(0, os.path.dirname(__file__))
from browser import open_page, check, results, src, wait_src, click_text, select_text
from playwright.sync_api import sync_playwright

PAGE_TEXT = '() => [...document.querySelectorAll("#pages .flow")].map(f => f.innerText).join("\\n")'


def share_link(page, name, button):
    page.click('#b-share')
    page.wait_for_selector('.pop-share')
    page.fill('.pop-share .share-name', name)
    page.click('.pop-share button.btn:not(.ghost) >> text=' + button)
    page.wait_for_function('() => (document.querySelector(".pop-share .share-link") || {}).value', timeout=8000)
    link = page.eval_on_selector('.pop-share .share-link', 'e => e.value')
    page.keyboard.press('Escape')
    page.evaluate('() => window.rikuy.closePop()')
    return link


def run():
    with sync_playwright() as p:
        A, page, errs = open_page(p)
        base_src = src(page)
        link = share_link(page, 'Pedro', 'Copy link')
        check('share makes a link to this page with the document in it', link.startswith('https://rikuy.test/#share=1.'), link[:80])
        check('the link is short for the whole sample', len(link) < 12000, len(link))

        # ---- the coauthor: a browser that has never seen the document
        B, page2, errs2 = open_page(p, clear=False)
        page2.goto('about:blank')
        page2.goto(link)
        page2.wait_for_function('window.rikuy && document.body.classList.contains("guest")', timeout=20000)
        page2.wait_for_timeout(400)
        check('the coauthor sees the document', src(page2) == base_src)
        check('and a line saying who shared it', 'Pedro shared this document' in page2.inner_text('#guest'))
        check('the source pane stays closed for them', 'src-on' not in (page2.get_attribute('body', 'class') or ''))
        check('the link left the address bar', '#share=' not in page2.url, page2.url)
        click_text(page2, 'Click anywhere', 5)
        page2.keyboard.type(' quickly')
        check('typing on the page edits their copy', 'Click quickly anywhere' in src(page2), src(page2)[src(page2).find('Click'):][:40])
        before = page2.evaluate(PAGE_TEXT)
        select_text(page2, 'source map', 0)
        page2.wait_for_selector('#bubble:not([hidden])')
        page2.click('#bubble button[data-act="cm"]')
        page2.wait_for_selector('.pop-comment textarea')
        page2.fill('.pop-comment .share-name', 'Ana')
        page2.fill('.pop-comment textarea', 'Is this the usual term?')
        page2.click('.pop-comment button.btn:not(.ghost)')
        wait_src(page2, '% comment (Ana)')
        s2 = src(page2)
        check('a comment is a comment line under its line', '\n% comment (Ana) on "source map": Is this the usual term?\n' in s2, s2[s2.find('% comment'):][:90])
        page2.wait_for_timeout(500)
        check('and changes nothing on the page', page2.evaluate(PAGE_TEXT) == before)
        check('it shows in the margin', page2.locator('.cm-mark').count() == 1)
        page2.evaluate('() => window.rikuy.toggleNav(true, "changes")')
        check('and in the Comments list', 'Is this the usual term?' in page2.inner_text('#nav-body'))
        page2.click('.cm-card button >> text=Reply')
        page2.wait_for_selector('.pop-comment textarea')
        page2.fill('.pop-comment textarea', 'Or "source mapping"?')
        page2.click('.pop-comment button.btn:not(.ghost) >> text=Reply')
        wait_src(page2, '% reply (Ana)')
        check('a reply goes under the comment', '% comment (Ana) on "source map": Is this the usual term?\n% reply (Ana): Or "source mapping"?\n' in src(page2))
        back = share_link(page2, 'Ana', 'Copy the link for Pedro')
        check('the coauthor sends a link back', back.startswith('https://rikuy.test/#share=1.') and back != link)

        # ---- the author, who kept writing meanwhile
        click_text(page, 'every edit is computed back', 0)
        page.keyboard.type('AUTHOR ')
        check('the author edits another line', 'AUTHOR every edit' in src(page))
        page.goto(back)
        page.wait_for_function('() => window.rikuy.files.get("main.tex").includes("quickly")', timeout=20000)
        page.wait_for_timeout(500)
        s = src(page)
        check('the copy comes back merged with the author\'s edit', 'Click quickly anywhere' in s and 'AUTHOR every edit' in s and '% reply (Ana)' in s)
        n = page.evaluate('() => window.rikuy.currentChanges().length')
        check('her edits are tracked changes against the author\'s text', n >= 2, n)
        check('and the author\'s own edit is not among them', not any('AUTHOR' in c for c in page.evaluate('() => window.rikuy.currentChanges().map(c => c.b)')))
        check('the author is not in the coauthor view', 'guest' not in (page.get_attribute('body', 'class') or ''))
        check('the marks are on', page.evaluate('() => window.rikuy.prefs.marks') is True)
        page.evaluate('() => window.rikuy.toggleNav(true, "changes")')
        page.click('.cm-card button >> text=Resolve')
        page.wait_for_timeout(300)
        check('resolve removes the thread', '% comment (Ana)' not in src(page) and '% reply (Ana)' not in src(page))

        # ---- leaving: one .tex, and Overleaf
        page.evaluate('''() => { const g = window.rikuy; g.files = new Map([['paper.tex', '\\\\documentclass{article}\\n\\\\begin{document}\\nHello.\\n% comment (Ana): hi\\n\\\\end{document}\\n']]); g.main = 'paper.tex'; g.name = 'paper'; g.assetBlobs.clear(); g.extra.clear(); g.forceRender = true; g.rebuild(); g.persist(); }''')
        try: page.wait_for_function('() => document.querySelector("#b-save span").textContent === "Save .tex"', timeout=5000)
        except Exception: pass
        check('a one file project saves as .tex', page.inner_text('#b-save').strip() == 'Save .tex', page.inner_text('#b-save'))
        with page.expect_download() as d:
            page.click('#b-save')
        f = d.value
        check('the download is that .tex, as it is', f.suggested_filename == 'paper.tex' and open(f.path(), encoding='utf8').read().endswith('Hello.\n% comment (Ana): hi\n\\end{document}\n'), f.suggested_filename)
        page.evaluate('() => { window.rikuy.prefs.stripComments = true; }')
        with page.expect_download() as d:
            page.click('#b-save')
        check('and without the comments when asked', '% comment' not in open(d.value.path(), encoding='utf8').read())
        page.evaluate('() => { window.rikuy.prefs.stripComments = false; }')
        posted = {}
        def overleaf(route):
            posted['body'] = route.request.post_data or ''
            route.fulfill(status=200, content_type='text/html', body='<p>overleaf</p>')
        page.context.route('https://www.overleaf.com/**', overleaf)
        with page.expect_popup() as pop:
            page.evaluate('() => window.rikuy.openInOverleaf()')
        pop.value.wait_for_load_state()
        from urllib.parse import parse_qs
        form = parse_qs(posted.get('body', ''))
        uri = (form.get('snip_uri') or [''])[0]
        ok = uri.startswith('data:application/zip;base64,')
        names = zipfile.ZipFile(io.BytesIO(base64.b64decode(uri.split(',', 1)[1]))).namelist() if ok else []
        check('Open in Overleaf posts the project as a .zip', ok and names == ['paper.tex'], (uri[:60], names))
        check('naming its main file', (form.get('main_document') or [''])[0] == 'paper.tex')

        # ---- the author tries their own link: the project with its figure stays as it was
        page.evaluate('''() => { const g = window.rikuy;
          g.loadProject(new Map([['main.tex', '\\\\documentclass{article}\\n\\\\begin{document}\\nA figure: \\\\includegraphics{fig.png}\\n\\\\end{document}\\n']]), 'main.tex', 'Thesis', 'Opened');
          const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
          g.addAsset('fig.png', new Blob([png], { type: 'image/png' })); g.binaryDirty = true; g.persist(); }''')
        own = share_link(page, 'Pedro', 'Copy link')
        page.evaluate('(s) => window.rikuy.openSharedLink(s)', own.split('#share=')[1])
        page.wait_for_function('() => document.body.classList.contains("guest")', timeout=8000)
        check('one\'s own link opens as a project of its own', page.evaluate('() => window.rikuy.name') == 'Thesis (Pedro)', page.evaluate('() => window.rikuy.name'))
        page.evaluate('async () => { await window.rikuy.doReset(); }')
        page.wait_for_timeout(300)
        kept = page.evaluate('''() => new Promise((res) => { const r = indexedDB.open('galley'); r.onsuccess = () => {
          const q = r.result.transaction('kv').objectStore('kv').get('bin:Thesis|main.tex'); q.onsuccess = () => res(q.result ? q.result.assets.map((a) => a[0]) : null); }; })''')
        check('and the project\'s figure is still kept after switching away', kept == ['fig.png'], kept)

        # ---- a stranger's link that names a file outside the project, inflates past any document, or
        # nests deeper than the parser goes
        def pack(o):
            c = zlib.compressobj(9, zlib.DEFLATED, -15)
            return '1.' + base64.urlsafe_b64encode(c.compress(json.dumps(o).encode()) + c.flush()).decode().rstrip('=')
        before = page.evaluate('() => [window.rikuy.name, window.rikuy.files.get("main.tex")]')
        for k, s in enumerate([pack({'v': 1, 'name': 'x', 'main': 'main.tex', 'files': [['main.tex', 'x'], ['../../../texlive/texmf-dist/tex/latex/base/article.cls', 'y']]}),
                               pack({'v': 1, 'name': 'x', 'main': 'main.tex', 'files': [['main.tex', ' ' * 40000000]]}),
                               pack({'v': 1, 'name': 'x', 'main': 'main.tex', 'files': [['main.tex', '\\begin{document}' + '{' * 200000 + '}' * 200000]]})]):
            page.evaluate('(s) => window.rikuy.openSharedLink(s)', s)
            page.wait_for_timeout(300)
            check('a hostile link is refused (%d)' % k, 'Could not open the link' in page.inner_text('#toast'), page.inner_text('#toast')[:100])
        check('and the open project is untouched', page.evaluate('() => [window.rikuy.name, window.rikuy.files.get("main.tex")]') == before)

        # ---- a stranger's document with links: Ctrl+click opens only web and mail addresses
        page.evaluate('''() => window.rikuy.loadProject(new Map([['main.tex', '\\\\documentclass{article}\\n\\\\begin{document}\\nSee \\\\href{javascript:void(document.title=1)}{the script link} and \\\\href{https://example.org/paper}{the web link}. \\\\colorbox{url(https://example.invalid/t.png)}{Boxed}.\\n\\\\end{document}\\n']]), 'main.tex', 'Links', 'Opened')''')
        page.wait_for_timeout(300)
        opened = []
        page.context.on('page', lambda pg: opened.append(pg))
        for name, want in [('the script link', 0), ('the web link', 1)]:
            box = page.locator('#pages .y-link', has_text=name).first.bounding_box()
            n0 = len(opened)
            page.keyboard.down('Control'); page.mouse.click(box['x'] + 3, box['y'] + box['height'] / 2); page.keyboard.up('Control')
            page.wait_for_timeout(600)
            check('Ctrl+click on %s opens %d windows' % (name, want), len(opened) - n0 == want, len(opened) - n0)
            for pg in opened[n0:]: pg.close()
        # nor does a colour argument make the reader's browser fetch anything
        bg = page.evaluate('''() => { const s = [...document.querySelectorAll('#pages .y-bg')].find((e) => e.textContent.includes('Boxed')); return s ? getComputedStyle(s).backgroundImage : null; }''')
        check('a colour that is a url() is no colour', bg == 'none', bg)

        bad = [e for e in errs + errs2 if 'clipboard' not in e.lower()]
        check('no page errors', not bad, bad[:3])
        A.close(); B.close()


if __name__ == '__main__':
    try:
        run()
    except Exception:
        import traceback
        traceback.print_exc()
        check('the run reaches its end', False)
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    sys.exit(1 if bad else 0)
