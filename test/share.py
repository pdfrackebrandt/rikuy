"""Sharing with coauthors: a link opens the document in a fresh browser with no account, the
coauthor types and comments on the typeset page, sends a link back, and the author's copy takes
the edits as tracked changes (merged with what the author wrote meanwhile). Comments are LaTeX
comment lines that change nothing on the page. Save gives one .tex for a one file project, and
Open in Overleaf posts the project as a .zip. A link for comments only (R4): the coauthor's page
takes comments and refuses any other edit (typing, a command, a script's), and the copy that comes
back brings its comment lines alone, as the author's browser kept the link it made, never as the
copy says of itself. Opening one's own link keeps the project and its
figures; a link naming files outside the project, or inflating past any document, is refused; a link in
a stranger's document opens only as a web or mail address. A comment from a comments only copy
comes in written in base32 and runs nothing where a document stopped % being a comment by means no
reading of the source finds (\\csname, \\scantokens, Lua), compiled in the page (S5)."""
import base64, io, json, os, sys, zipfile, zlib
sys.path.insert(0, os.path.dirname(__file__))
from browser import settle, until, open_page, check, results, src, wait_src, click_text, select_text, download
from playwright.sync_api import sync_playwright

# what the page would ask the TeX worker for: compile() is replaced by one that notes its
# arguments and answers with an empty run
STUB_COMPILE = '''async () => {
  const g = window.rikuy, e = g.texEngine();
  let job = null;
  e.compile = async (o) => { job = { shellEscape: o.shellEscape, untrusted: o.untrusted }; return { id: o.project, log: '', runs: [], missing: [], pdf: null, engineLabel: 'pdfLaTeX' }; };
  await g.compilePdf();
  return job;
}'''
PAGE_TEXT = '() => [...document.querySelectorAll("#pages .flow")].map(f => f.innerText).join("\\n")'
# the comment threads of the open project as the page reads them, [who, quote, body, [replies]]:
# a reader's comment comes in written in base32 (src/share.js), shown as typed
COMMENTS = '() => window.rikuy.allComments().map((c) => [c.who, c.quote, c.body, c.replies.map((r) => [r.who, r.body])])'


def said(page, w):
    """Whether these words reached the open project, as source or inside a comment line."""
    return page.evaluate('(w) => [...window.rikuy.files.values()].some((t) => typeof t === "string" && t.includes(w)) || window.rikuy.allComments().some((c) => [c.who, c.quote, c.body, ...c.replies.map((r) => r.who + " " + r.body)].join(" ").includes(w))', w)


# a link opened in a page that already shows the editor changes only the fragment: the page's
# hashchange opens it (src/collab.js) and nothing says when that is done, so the test counts the
# links opened or refused to the end
LINKS = '''() => { const g = window.rikuy; if (g.__links == null) { g.__links = 0;
  for (const k of ['openSharedLink', 'openTexLink']) { const f = g[k]; g[k] = async function (...a) { try { return await f.apply(this, a); } finally { g.__links++; } }; } }
  return g.__links; }'''


def go_link(page, url):
    """Open url, a link to the page itself, in a page that already shows the editor, and wait until
    the page has opened or refused what it carries."""
    n = page.evaluate(LINKS)
    page.goto(url)
    until(page, '(n) => window.rikuy.__links > n', n, timeout=20000)


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
        # (the details leave out what the link carries: its packed bytes, and so its length, move with
        # the time it was made)
        check('share makes a link to this page with the document in it', link.startswith('https://rikuy.test/#share=1.'), link[:28])
        # (the sample's live graph travels as its description, not its 85 kB file: CI on ab27d09)
        check('the link is short for the whole sample', len(link) < 12000, '%d thousand characters' % (len(link) // 1000))

        # ---- the coauthor: a browser that has never seen the document
        B, page2, errs2 = open_page(p, clear=False)
        page2.goto('about:blank')
        page2.goto(link)
        page2.wait_for_function('window.rikuy && document.body.classList.contains("guest")', timeout=20000)
        settle(page2, 400)
        check('the coauthor sees the document', src(page2) == base_src)
        # the graph's file written again from its description, as the sender has it, and its
        # picture drawn again for TeX (no link carries pictures)
        G = 'async () => { await window.rikuy.graphRefresh(); const f = window.rikuy.files.get("graphs/saving.html"); return [f, window.rikuy.assetBlobs.has("graphs/saving.pgf")]; }'
        mine, theirs = page.evaluate(G), page2.evaluate(G)
        check('and the live graph: its file written again from the description the link carries, byte for byte the sender\'s, its picture drawn again', mine[0] and theirs[0] == mine[0] and theirs[1], (len(mine[0] or ''), len(theirs[0] or ''), theirs[1]))
        check('and a line saying who shared it', 'Pedro shared this document' in page2.inner_text('#guest'))
        check('the source pane stays closed for them', 'src-on' not in (page2.get_attribute('body', 'class') or ''))
        check('and the sample and New document stay out of their way', not page2.is_visible('#b-sample') and not page2.is_visible('#b-new'))
        check('the link left the address bar', '#share=' not in page2.url, page2.url)
        # a document from a link compiles with restricted shell escape, and the worker keeps nothing
        # of it, until its owner allows more for it
        job = page2.evaluate(STUB_COMPILE)
        check('a document from a link compiles with restricted shell escape', job and job.get('shellEscape') is False and job.get('untrusted') is True, job)
        check('the Shell escape box shows it off for this document', page2.is_checked('#pdf-shell') is False)
        check('and Problems says why', 'came in a link from Pedro' in page2.evaluate('() => (window.rikuy.texIssues || []).map((x) => x.msg).join(" ")'))
        page2.evaluate('() => window.rikuy.allowShellHere()')
        job = page2.evaluate(STUB_COMPILE)
        check('allowing it for the document lifts the restriction', job and job.get('shellEscape') is True and job.get('untrusted') is False, job)
        click_text(page2, 'Click anywhere', 5)
        page2.keyboard.type(' quickly')
        check('typing on the page edits their copy', 'Click quickly anywhere' in src(page2), src(page2)[src(page2).find('Click'):][:40])
        select_text(page2, 'source map', 0)
        page2.wait_for_selector('#bubble:not([hidden])')
        # (the selection may scroll the page so the bubble can be reached: the snapshot is after that)
        before = page2.evaluate(PAGE_TEXT)
        page2.click('#bubble button[data-act="cm"]')
        page2.wait_for_selector('.pop-comment textarea')
        page2.fill('.pop-comment .share-name', 'Ana')
        page2.fill('.pop-comment textarea', 'Is this the usual term?')
        page2.click('.pop-comment button.btn:not(.ghost)')
        wait_src(page2, '% comment (Ana)')
        s2 = src(page2)
        check('a comment is a comment line under its line', '\n% comment (Ana) on "source map": Is this the usual term?\n' in s2, s2[s2.find('% comment'):][:90])
        # (the margin's comments are drawn 200 ms after the edit: commentsSoon)
        settle(page2, 500, full=True)
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

        # ---- the coauthor opens the same link again (bookmark, re-click): edits must survive, not
        # be wiped back to the pristine shared copy
        page2.goto('about:blank')
        page2.goto(link)
        page2.wait_for_function('window.rikuy && document.getElementById("boot").hidden', timeout=20000)
        settle(page2, 600)
        s_re = src(page2)
        check('reopening the link keeps the coauthor edits', 'Click quickly anywhere' in s_re and '% reply (Ana)' in s_re, s_re[s_re.find('Click'):][:40])
        check('reopening leaves them in the coauthor view', 'guest' in (page2.get_attribute('body', 'class') or ''))

        # ---- the author, who kept writing meanwhile
        click_text(page, 'every edit is computed back', 0)
        page.keyboard.type('AUTHOR ')
        check('the author edits another line', 'AUTHOR every edit' in src(page))
        go_link(page, back)
        page.wait_for_function('() => window.rikuy.files.get("main.tex").includes("quickly")', timeout=20000)
        settle(page, 500)
        s = src(page)
        check('the copy comes back merged with the author\'s edit', 'Click quickly anywhere' in s and 'AUTHOR every edit' in s and '% reply (Ana)' in s)
        n = page.evaluate('() => window.rikuy.currentChanges().length')
        check('her edits are tracked changes against the author\'s text', n >= 2, n)
        check('and the author\'s own edit is not among them', not any('AUTHOR' in c for c in page.evaluate('() => window.rikuy.currentChanges().map(c => c.b)')))
        check('the author is not in the coauthor view', 'guest' not in (page.get_attribute('body', 'class') or ''))
        check('the marks are on', page.evaluate('() => window.rikuy.markup()') == 'all')
        job = page.evaluate(STUB_COMPILE)
        check('the project the copy came back into compiles restricted too', job and job.get('untrusted') is True, job)
        page.evaluate('() => window.rikuy.toggleNav(true, "changes")')
        page.click('.cm-card button >> text=Resolve')
        settle(page, 300)
        check('resolve removes the thread', '% comment (Ana)' not in src(page) and '% reply (Ana)' not in src(page))

        # ---- leaving: one .tex, and Overleaf
        page.evaluate('''() => { const g = window.rikuy; g.files = new Map([['paper.tex', '\\\\documentclass{article}\\n\\\\begin{document}\\nHello.\\n% comment (Ana): hi\\n\\\\end{document}\\n']]); g.main = 'paper.tex'; g.name = 'paper'; g.assetBlobs.clear(); g.extra.clear(); g.forceRender = true; g.rebuild(); g.persist(); }''')
        try: page.wait_for_function('() => document.getElementById("b-save").title.includes("paper.tex")', timeout=5000)
        except Exception: pass
        check('a one file project saves as .tex: the LaTeX download names the file', 'Download the LaTeX source, paper.tex' in page.evaluate('document.getElementById("b-save").title'), page.evaluate('document.getElementById("b-save").title'))
        with page.expect_download() as d:
            download(page)
        f = d.value
        check('the download is that .tex, as it is', f.suggested_filename == 'paper.tex' and open(f.path(), encoding='utf8').read().endswith('Hello.\n% comment (Ana): hi\n\\end{document}\n'), f.suggested_filename)
        page.evaluate('() => { window.rikuy.prefs.stripComments = true; }')
        with page.expect_download() as d:
            download(page)
        check('and without the comments when asked', '% comment' not in open(d.value.path(), encoding='utf8').read())
        page.evaluate('() => { window.rikuy.prefs.stripComments = false; }')
        # (the form as Rikuy hands it to the browser: the page's policy, form-action 'self' on the
        # hosted copy and the artifact host alike, refuses the post itself, which pdf.py checks is
        # said to the user)
        got = page.evaluate('''() => new Promise((res) => { const s = HTMLFormElement.prototype.submit;
          HTMLFormElement.prototype.submit = function () { HTMLFormElement.prototype.submit = s; res({ action: this.action, fields: [...this.elements].map((e) => [e.name, e.value]) }); };
          window.rikuy.openInOverleaf(); })''')
        form = {}
        for k, v in got['fields']: form.setdefault(k, []).append(v)
        check('Open in Overleaf makes a form that posts to Overleaf', got['action'] == 'https://www.overleaf.com/docs', got['action'])
        uri = (form.get('snip_uri') or [''])[0]
        ok = uri.startswith('data:application/zip;base64,')
        names = zipfile.ZipFile(io.BytesIO(base64.b64decode(uri.split(',', 1)[1]))).namelist() if ok else []
        # (the .zip's bytes carry the time it was made: the detail shows its kind)
        check('Open in Overleaf posts the project as a .zip', ok and names == ['paper.tex'], (uri[:uri.find(',') + 1] if ok else uri[:60], names))
        check('naming its main file', (form.get('main_document') or [''])[0] == 'paper.tex')

        # ---- the author tries their own link: the project with its figure stays as it was
        page.evaluate('''() => { const g = window.rikuy;
          g.loadProject(new Map([['main.tex', '\\\\documentclass{article}\\n\\\\begin{document}\\nA figure: \\\\includegraphics{fig.png}\\n\\\\end{document}\\n']]), 'main.tex', 'Thesis', 'Opened');
          const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
          g.addAsset('fig.png', new Blob([png], { type: 'image/png' })); g.binaryDirty = true; g.persist(); }''')
        own = share_link(page, 'Pedro', 'Copy link')
        page.evaluate('(s) => window.rikuy.openSharedLink(s)', own.split('#share=')[1])
        page.wait_for_function('() => document.body.classList.contains("guest")', timeout=8000)
        check('one\'s own link opens as a project of its own', page.evaluate('() => window.rikuy.name') == 'Thesis (from Pedro)', page.evaluate('() => window.rikuy.name'))
        # the copy has no figures (a link carries none): the page says whose they are, Problems
        # stays quiet about them, and TeX gets a gray box in their place
        settle(page, 300)
        check('a copy from a link says whose its figures are', 'Stays with Pedro' in page.inner_text('#pages'), page.inner_text('#pages')[:200])
        check('and lists no missing figure as a problem', not [x for x in page.evaluate('() => window.rikuy.computeProblems().map((x) => x.msg)') if 'fig.png' in x])
        sent = page.evaluate('async () => (await window.rikuy.compileFiles()).map((f) => [f.path, f.data.length])')
        check('TeX gets a stand-in for the figure', any(p == 'fig.png' and n > 50 for p, n in sent), sent)
        page.evaluate('async () => { await window.rikuy.doReset(); }')
        settle(page, 300)
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
            settle(page, 300)
            check('a hostile link is refused (%d)' % k, 'Could not open the link' in page.inner_text('#toast'), page.inner_text('#toast')[:100])
        check('and the open project is untouched', page.evaluate('() => [window.rikuy.name, window.rikuy.files.get("main.tex")]') == before)

        # ---- a stranger's document with links: Ctrl+click opens only web and mail addresses
        page.evaluate('''() => window.rikuy.loadProject(new Map([['main.tex', '\\\\documentclass{article}\\n\\\\begin{document}\\nSee \\\\href{javascript:void(document.title=1)}{the script link} and \\\\href{https://example.org/paper}{the web link}. \\\\colorbox{url(https://example.invalid/t.png)}{Boxed}.\\n\\\\end{document}\\n']]), 'main.tex', 'Links', 'Opened')''')
        settle(page, 300)
        opened = []
        page.context.on('page', lambda pg: opened.append(pg))
        for name, want in [('the script link', 0), ('the web link', 1)]:
            box = page.locator('#pages .y-link', has_text=name).first.bounding_box()
            n0 = len(opened)
            page.keyboard.down('Control'); page.mouse.click(box['x'] + 3, box['y'] + box['height'] / 2); page.keyboard.up('Control')
            settle(page, 600)
            check('Ctrl+click on %s opens %d windows' % (name, want), len(opened) - n0 == want, len(opened) - n0)
            for pg in opened[n0:]: pg.close()
        # nor does a colour argument make the reader's browser fetch anything
        bg = page.evaluate('''() => { const s = [...document.querySelectorAll('#pages .y-bg')].find((e) => e.textContent.includes('Boxed')); return s ? getComputedStyle(s).backgroundImage : null; }''')
        check('a colour that is a url() is no colour', bg == 'none', bg)

        bad = [e for e in errs + errs2 if 'clipboard' not in e.lower()]
        check('no page errors', not bad, bad[:3])
        A.close(); B.close()


COMMENTS_DOC = '\\documentclass{article}\n\\begin{document}\nFirst line of text.\n\nSecond line stays.\n\\end{document}\n'


def comments_only():
    """RV21: a link that lets its reader comment and nothing else, enforced where the page
    applies an edit (App.commit) and again where the author's page takes the copy back."""
    with sync_playwright() as p:
        A, page, errs = open_page(p)
        page.evaluate('(t) => window.rikuy.loadProject(new Map([["main.tex", t]]), "main.tex", "cmonly", "Opened")', COMMENTS_DOC)
        settle(page, 400)
        page.click('#b-share'); page.wait_for_selector('.pop-share')
        perm = page.get_by_role('combobox', name='Link permission')
        check('comments only: the Share panel asks what the link allows, by name', perm.count() == 1 and perm.evaluate('(e) => [...e.options].map((o) => o.textContent)') == ['Can edit and comment', 'Can comment only'])
        perm.select_option('comments')
        page.fill('.pop-share .share-name', 'Pedro')
        page.click('.pop-share button.btn:not(.ghost) >> text=Copy link')
        page.wait_for_function('() => (document.querySelector(".pop-share .share-link") || {}).value', timeout=8000)
        link = page.eval_on_selector('.pop-share .share-link', 'e => e.value')
        page.keyboard.press('Escape'); page.evaluate('() => window.rikuy.closePop()')
        meta = page.evaluate('async () => (await window.rikuy.allSnaps()).filter((v) => v.share).map((v) => v.share.role)')
        check("comments only: the version shared is kept with the link's name and what it allows", meta[:1] == ['comments'], meta)
        B, page2, errs2 = open_page(p, clear=False)
        page2.goto('about:blank'); page2.goto(link)
        page2.wait_for_function('window.rikuy && document.body.classList.contains("guest")', timeout=20000)
        settle(page2, 400)
        check('comments only: the reader is told they can comment only', 'for comments' in page2.inner_text('#guest'), page2.inner_text('#guest'))
        s0 = src(page2)
        click_text(page2, 'First line', 3)
        page2.keyboard.type('XYZ')
        settle(page2, 300)
        check('comments only: typing on the page changes nothing', src(page2) == s0)
        page2.evaluate('() => window.rikuy.runCommand("bold")')
        page2.evaluate('() => window.rikuy.commit([{ f: "main.tex", s: 0, e: 0, t: "% sneaky\\n" }], null, "api")')
        check('comments only: neither a command nor an edit made by script gets in', src(page2) == s0)
        select_text(page2, 'Second line', 0)
        page2.wait_for_selector('#bubble:not([hidden])')
        page2.click('#bubble button[data-act="cm"]')
        page2.wait_for_selector('.pop-comment textarea')
        if page2.locator('.pop-comment .share-name').count():
            page2.fill('.pop-comment .share-name', 'Ana')
        page2.fill('.pop-comment textarea', 'Clearer?')
        page2.click('.pop-comment button.btn:not(.ghost)')
        wait_src(page2, '% comment32 ')
        check('comments only: a comment goes in, written in base32 and shown as typed', ['Ana', 'Second line', 'Clearer?', []] in page2.evaluate(COMMENTS)
              and any(l.startswith('% comment32 ') for l in src(page2).split('\n')), (page2.evaluate(COMMENTS), src(page2)))
        # the reader's page could be changed by hand: its copy then carries a text edit anyway
        page2.evaluate("() => { const g = window.rikuy; g.files.set('main.tex', g.files.get('main.tex').replace('First line', 'FIRST LINE')); }")
        page2.click('#b-share'); page2.wait_for_selector('.pop-share')
        page2.click('.pop-share button.btn:not(.ghost) >> text=Copy the link for Pedro')
        page2.wait_for_function('() => (document.querySelector(".pop-share .share-link") || {}).value', timeout=8000)
        back = page2.eval_on_selector('.pop-share .share-link', 'e => e.value')
        go_link(page, back)
        page.wait_for_function('() => window.rikuy.allComments().some((c) => c.body === "Clearer?")', timeout=20000)
        settle(page, 400)
        s = src(page)
        check('comments only: the copy back brings the comment and not the text edit', ['Ana', 'Second line', 'Clearer?', []] in page.evaluate(COMMENTS) and 'First line of text.' in s and 'FIRST LINE' not in s, s)
        check('comments only: the author is told an edit was left out', 'comment only' in page.evaluate('() => [...document.querySelectorAll(".toast")].map((t) => t.textContent).join(" ")'))
        # (security review) a copy back that names another version than the one shared: not opened over the document
        s_before = src(page)
        forged = page2.evaluate("async () => { const g = window.rikuy; g.shareCtx.base = 'forged-version'; g.shareCtx.rid = null; g.files.set('main.tex', g.files.get('main.tex').replace('Second line', 'SECOND LINE')); return (await g.makeShareLink('back')).url; }")
        go_link(page, forged); settle(page, 2500)
        check('comments only: a copy back naming a version this browser never shared does not open over the document', src(page) == s_before and 'not opened' in page.evaluate('() => [...document.querySelectorAll(".toast")].map((t) => t.textContent).join(" ")'), src(page)[:200])
        bad = [e for e in errs + errs2 if 'clipboard' not in e.lower()]
        check('comments only: no page errors', not bad, bad[:3])
        A.close(); B.close()


MERGE_DOC = '\\documentclass{article}\n\\begin{document}\nWe study the efect of taxes on growth in Peru and Chile.\n\nSecond paragraph.\n\\end{document}\n'


def comment_here(page, words, who, body):
    select_text(page, words, 0)
    page.wait_for_selector('#bubble:not([hidden])')
    page.click('#bubble button[data-act="cm"]')
    page.wait_for_selector('.pop-comment textarea')
    if page.locator('.pop-comment .share-name').count():
        page.fill('.pop-comment .share-name', who)
    page.fill('.pop-comment textarea', body)
    page.click('.pop-comment button.btn:not(.ghost)')
    wait_src(page, body)


def r4_merge():
    """R4: a paragraph is often one line of the source. The coauthor fixes a word of it and
    comments on it; the author meanwhile changes another word of the same line and comments on it
    too. Word combines the two copies keeping both: the merge went line by line, so the author's
    word and comment were thrown out for theirs, and the author was told they had edited the same
    lines."""
    with sync_playwright() as p:
        A, page, errs = open_page(p)
        page.evaluate('(t) => window.rikuy.loadProject(new Map([["main.tex", t]]), "main.tex", "merge", "Opened")', MERGE_DOC)
        settle(page, 400)
        link = share_link(page, 'Pedro', 'Copy link')
        B, page2, errs2 = open_page(p, clear=False)
        page2.goto('about:blank'); page2.goto(link)
        page2.wait_for_function('window.rikuy && document.body.classList.contains("guest")', timeout=20000)
        settle(page2, 400)
        click_text(page2, 'efect', 2)
        page2.keyboard.type('f')
        comment_here(page2, 'growth', 'Ana', 'Which measure?')
        check('merge: the coauthor fixed a word and commented', 'the effect of taxes' in src(page2) and 'Which measure?' in src(page2), src(page2))
        back = share_link(page2, 'Ana', 'Copy the link for Pedro')
        # the author, meanwhile, in the same paragraph's line
        click_text(page, 'Chile', 0)
        page.keyboard.type('northern ')
        comment_here(page, 'Peru', 'Pedro', 'Add Bolivia?')
        check('merge: the author changed another word of the line and commented', 'and northern Chile' in src(page) and 'Add Bolivia?' in src(page), src(page))
        go_link(page, back)
        page.wait_for_function('() => window.rikuy.files.get("main.tex").includes("effect")', timeout=20000)
        settle(page, 500)
        s = src(page)
        check('merge: both words are in the line', 'We study the effect of taxes on growth in Peru and northern Chile.' in s, s)
        check('merge: both comments are kept, theirs under mine', '% comment (Pedro) on "Peru": Add Bolivia?\n% comment (Ana) on "growth": Which measure?\n' in s, s)
        toast = page.evaluate(TOASTS)
        check('merge: no word of being told both edited the same lines', 'same lines' not in toast, toast)
        ch = page.evaluate('() => window.rikuy.currentChanges().map((c) => [c.a, c.b])')
        check('merge: her edit is the one tracked change, the author\'s word is not among them', not any('northern' in a + b for a, b in ch) and any('effect' in b for a, b in ch), ch)
        bad = [e for e in errs + errs2 if 'clipboard' not in e.lower()]
        check('merge: no page errors', not bad, bad[:3])
        A.close(); B.close()


ATTACK_DOC = ('\\documentclass{article}\n\\usepackage{url}\n\\begin{document}\nFirst line of text \\cite{knuth}.\n\nSee \\url{http://example.org/\nlong}.\n\n'
              '\\begin{verbatim}\ncode\n\\end{verbatim}\nSecond line stays.\n\\bibliographystyle{plain}\\bibliography{refs}\n\\end{document}\n')
ATTACK_BIB = '@book{knuth, author={Knuth}, title={TeXbook}, publisher={AW}, year=1984}\n'
CAT_DOC = '\\documentclass{article}\n\\begin{document}\nPercent table:\n{\\catcode`\\%=12\nRates are 5% and 7%.\n}\nEnd of text.\n\\end{document}\n'
DIST = os.environ.get('RIKUY_DIST') or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'dist')
TEX = os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm'))
TOASTS = '() => [...document.querySelectorAll(".toast")].map((t) => t.textContent).join(" | ")'


def pdf_text(page):
    """The open project compiled in the page (pdfLaTeX, BibTeX where it cites), as pdftotext reads it."""
    import base64 as b64, subprocess, tempfile
    page.set_default_timeout(600000)
    r = page.evaluate("""async () => { const r = await window.rikuy.api.compile(); let s = ''; if (r.pdf) for (let i = 0; i < r.pdf.length; i += 8192) s += String.fromCharCode(...r.pdf.subarray(i, i + 8192));
      return { ok: r.ok, b64: r.pdf ? btoa(s) : '' }; }""")
    page.set_default_timeout(30000)
    if not r['b64']:
        return ''
    f = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False); f.write(b64.b64decode(r['b64'])); f.close()
    t = subprocess.run(['pdftotext', f.name, '-'], capture_output=True, text=True).stdout
    os.unlink(f.name)
    return t


def comments_attacks():
    """R4's hostile review: what a comments only reader's copy may bring into the author's document.
    A line feed or a lone carriage return ends a comment line for TeX (H1); a .bib, a package or a
    data file takes no comment line (H2); nor does an argument read as it stands (\\url), verbatim,
    or a document that changes what % is (M2); a copy relabelled as a new link opens beside the
    author's project, never over it (M1). Where dist/tex exists the author's document is compiled
    in the page and the injected words are not in its PDF."""
    with sync_playwright() as p:
        A, page, errs = open_page(p)
        share = lambda pg, role: pg.evaluate('async (r) => (await window.rikuy.makeShareLink(r)).url', role)
        page.evaluate('(t) => window.rikuy.loadProject(new Map([["main.tex", t[0]], ["refs.bib", t[1]]]), "main.tex", "cmonly", "Opened")', [ATTACK_DOC, ATTACK_BIB])
        settle(page, 400)
        page.evaluate('() => { window.rikuy.prefs.who = "Pedro"; }')
        link = share(page, 'comments')
        B, page2, errs2 = open_page(p, clear=False)
        page2.goto('about:blank'); page2.goto(link)
        page2.wait_for_function('window.rikuy && document.body.classList.contains("guest")', timeout=20000)
        settle(page2, 400)
        check('attacks: the reader is a comments only guest', page2.evaluate('() => window.rikuy.shareCtx.role') == 'comments')
        page2.evaluate(r"""() => { const g = window.rikuy, t = g.files.get('main.tex');
          g.files.set('main.tex', t.replace('First line of text \\cite{knuth}.\n', 'First line of text \\cite{knuth}.\n% comment (Eve): OKCOMMENT\n')
            .replace('http://example.org/\n', 'http://example.org/\n% comment (Eve): \\textbf{URLINJECTED}\n')
            .replace('code\n', 'code\n% comment (Eve): VERBINJECTED\n'));
          g.files.set('refs.bib', g.files.get('refs.bib') + '% comment (Eve): see @preamble{ "\\textbf{BIBINJECTED}" }\n');
          g.files.set('extra.sty', '\\textbf{NEWFILEINJECTED}'); }""")
        back = share(page2, 'back')
        go_link(page, back)
        page.wait_for_function('() => window.rikuy.allComments().some((c) => c.body === "OKCOMMENT")', timeout=20000)
        settle(page, 500)
        m, b = src(page), src(page, 'refs.bib')
        check('attacks: a comment on the body text comes in, in base32', ['Eve', '', 'OKCOMMENT', []] in page.evaluate(COMMENTS) and '% comment32 IV3GK 0 J5FUGT2NJVCU4VA\n' in m, m[:300])
        check('attacks: none in an argument read as it stands, nor in verbatim', not said(page, 'URLINJECTED') and not said(page, 'VERBINJECTED'), m)
        check('attacks: the .bib byte for byte as it was, no file added', b == ATTACK_BIB and page.evaluate('() => !window.rikuy.files.has("extra.sty")'), repr(b))
        check('attacks: the author is told what was left out', 'comment only' in page.evaluate(TOASTS))
        # H1: a lone carriage return in a comment line: nothing of that copy comes in
        page2.evaluate(r"""() => { const g = window.rikuy;
          g.files.set('main.tex', g.files.get('main.tex').replace('Second line stays.\n', 'Second line stays.\n% comment (Eve): looks fine\r\\textbf{CRINJECTED}\n% comment (Eve): ALSO\n')); }""")
        go_link(page, share(page2, 'back'))
        settle(page, 2500)
        m = src(page)
        check('attacks: a comment line with a lone carriage return brings nothing, not even the comments beside it', not said(page, 'CRINJECTED') and not said(page, 'ALSO') and '\r' not in m, repr(m[-300:]))
        if TEX:
            t = pdf_text(page)
            check('attacks: compiled in the page, the PDF has the text and the reference, no injected word', 'First line of text' in t and 'TeXbook' in t and not any(w in t for w in ('INJECTED', 'ALSO', 'OKCOMMENT')), t[:400])
        else:
            print('SKIP the attacks\' PDF: no TeX tree in %s' % DIST)
        # M1: the reader relabels the copy as a new link of their own: it opens beside the author's project
        page2.evaluate("() => { const g = window.rikuy; g.shareCtx = null; g.files.set('main.tex', g.files.get('main.tex').replace('Second line stays.', 'SECOND LINE REWRITTEN.')); }")
        before = src(page)
        go_link(page, share(page2, 'coauthor')); settle(page, 2500)
        st = page.evaluate('async () => { const g = window.rikuy; const v = (await g.allSnaps()).filter((x) => x.name === "cmonly" && x.main === "main.tex"); const f = v.length ? new Map(await g.versionFiles(v[0])) : null; return { name: g.name, own: f && f.get("main.tex") }; }')
        check('attacks: a copy relabelled as a new link opens as a project of its own, the author\'s kept as it was', st['name'].startswith('cmonly (from '), st['name'])
        check('attacks: the author\'s project still has its own text', st['own'] == before and 'REWRITTEN' not in (st['own'] or ''), (st['own'] or '')[:200])
        check('attacks: the author is told it opened beside theirs', 'project of its own' in page.evaluate(TOASTS), page.evaluate(TOASTS)[:300])
        # M2: a document that changes what % is takes no comment line at all
        page.evaluate('(t) => window.rikuy.loadProject(new Map([["main.tex", t]]), "main.tex", "catdoc", "Opened")', CAT_DOC)
        settle(page, 300)
        link = share(page, 'comments')
        page2.goto('about:blank'); page2.goto(link)
        page2.wait_for_function('window.rikuy && window.rikuy.name === "catdoc" && document.body.classList.contains("guest")', timeout=20000)
        page2.evaluate(r"""() => { const g = window.rikuy;
          g.files.set('main.tex', g.files.get('main.tex').replace('Rates are 5% and 7%.\n', 'Rates are 5% and 7%.\n% comment (Eve): \\textbf{CATINJECTED}\n').replace('End of text.\n', 'End of text.\n% comment (Eve): fine\n')); }""")
        go_link(page, share(page2, 'back'))
        settle(page, 2500)
        check('attacks: where a group makes % a letter, no comment line comes in', src(page) == CAT_DOC and page.evaluate('() => window.rikuy.name') == 'catdoc', src(page)[-200:])
        if TEX:
            t = pdf_text(page)
            check('attacks: compiled in the page, the PDF prints the percent signs and no injected word', '5% and 7%' in t and 'INJECTED' not in t, t[:300])
        # V2: a link naming no sender (a #share= built by hand, a #tex= link) under a kept project's name opens beside it
        def pack(o):
            c = zlib.compressobj(9, zlib.DEFLATED, -15)
            return base64.urlsafe_b64encode(c.compress(json.dumps(o).encode()) + c.flush()).rstrip(b'=').decode()
        kept = src(page)
        page.goto('https://rikuy.test/#share=1.' + pack({'v': 1, 'name': 'catdoc', 'main': 'main.tex', 'files': [['main.tex', CAT_DOC.replace('End of text.', 'NOSENDER REWRITE.')]]}))
        page.wait_for_function('() => window.rikuy.name !== "catdoc"', timeout=20000)
        st = page.evaluate('async () => { const g = window.rikuy; const v = (await g.allSnaps()).filter((x) => x.name === "catdoc" && x.main === "main.tex"); return { name: g.name, own: v.length ? new Map(await g.versionFiles(v[0])).get("main.tex") : null }; }')
        check('attacks: a #share= link with no sender opens beside the kept project of its name, which stays as it was', st['name'] == 'catdoc (from a link)' and st['own'] == kept and 'project of its own' in page.evaluate(TOASTS), st)
        # (Grok Bot's check of V2) the same name with another main file: still beside it, so Recent
        # documents, which lists projects by name, does not show the link's copy in its place
        page.evaluate('(t) => window.rikuy.loadProject(new Map([["main.tex", t]]), "main.tex", "catdoc", "Opened")', CAT_DOC); settle(page, 300)
        page.goto('https://rikuy.test/#share=1.' + pack({'v': 1, 'name': 'catdoc', 'main': 'paper.tex', 'files': [['paper.tex', CAT_DOC.replace('End of text.', 'OTHERMAIN REWRITE.')]]}))
        page.wait_for_function('() => window.rikuy.main === "paper.tex"', timeout=20000)
        check('attacks: a link under a kept name with another main file opens as a project of its own', page.evaluate('() => window.rikuy.name').startswith('catdoc (from a link'), page.evaluate('() => window.rikuy.name'))
        page.evaluate('(t) => window.rikuy.loadProject(new Map([["main.tex", t]]), "main.tex", "main.tex", "Opened")', COMMENTS_DOC)
        settle(page, 300)
        page.goto('https://rikuy.test/#tex=' + base64.urlsafe_b64encode(CAT_DOC.encode()).rstrip(b'=').decode())
        page.wait_for_function('() => window.rikuy.name !== "main.tex"', timeout=20000)
        check('attacks: a #tex= link opens beside a kept project called main.tex', page.evaluate('() => window.rikuy.name') == 'main.tex (from a link)' and src(page) == CAT_DOC, page.evaluate('() => window.rikuy.name'))
        bad = [e for e in errs + errs2 if 'clipboard' not in e.lower()]
        check('attacks: no page errors', not bad, bad[:3])
        A.close(); B.close()


# S5 (security review of 17 November): documents that make % an ordinary character without naming
# a catcode in any form the source can be searched for, which PERCENT_CATCODE lets comments into:
# a \csname built name, \scantokens over a name made of strings, and Lua
EVASIVE = [
    ('csname', '\\documentclass{article}\n\\begin{document}\n\\csname c\\string atcode\\endcsname 37=12\nFirst line.\n\nSecond line.\n\\end{document}\n'),
    ('scantokens', '\\documentclass{article}\n\\edef\\rkcc{\\string\\c atcode}\n\\begin{document}\n\\scantokens\\expandafter{\\rkcc 37=12\\relax}\nFirst line.\n\nSecond line.\n\\end{document}\n'),
    ('luacode', '% !TeX program = lualatex\n\\documentclass{article}\n\\usepackage{luacode}\n\\begin{document}\n\\begin{luacode}\ntex["set" .. "cat" .. "code"]("global", 37, 12)\n\\end{luacode}\nFirst line.\n\nSecond line.\n\\end{document}\n'),
]
INJECT = '% comment (Eve): \\uppercase{rkinjected}\n'


def comments_catcodes():
    """S5: a comment from a comments only copy runs nothing even where % stopped being a comment.
    For each document, first the attack as the author's copy took it before (the reader's line as
    it was written): compiled in the page, its PDF has the marker its TeX makes (RKINJECTED, from
    \\uppercase), which shows % really stopped being a comment. Then the same line through a
    comments only link: it comes in written in base32, the page shows it as typed, and the PDF
    has the line's letters (comment32) and not the marker."""
    if not TEX:
        print('SKIP comments_catcodes: no TeX tree in %s' % DIST)
        return
    with sync_playwright() as p:
        A, page, errs = open_page(p)
        share = lambda pg, role: pg.evaluate('async (r) => (await window.rikuy.makeShareLink(r)).url', role)
        page.evaluate('() => { window.rikuy.prefs.who = "Pedro"; }')
        B, page2, errs2 = open_page(p, clear=False)
        for name, doc in EVASIVE:
            # the attack as it was: the line as the reader wrote it, in the author's source
            page.evaluate('(t) => window.rikuy.loadProject(new Map([["main.tex", t]]), "main.tex", "cat-before", "Opened")', doc.replace('First line.\n', 'First line.\n' + INJECT))
            settle(page, 300)
            t0 = pdf_text(page)
            check('S5 %s: the reader\'s line as it was written runs in the author\'s PDF (RKINJECTED): %% is no comment there' % name, 'RKINJECTED' in t0 and 'First line' in t0, t0[:200])
            # through a comments only link
            page.evaluate('(t) => window.rikuy.loadProject(new Map([["main.tex", t]]), "main.tex", "cat-" + t.length, "Opened")', doc)
            settle(page, 300)
            link = share(page, 'comments')
            page2.goto('about:blank'); page2.goto(link)
            page2.wait_for_function('window.rikuy && document.body.classList.contains("guest") && window.rikuy.shareCtx && window.rikuy.shareCtx.role === "comments"', timeout=20000)
            settle(page2, 300)
            page2.evaluate('(l) => { const g = window.rikuy; g.files.set("main.tex", g.files.get("main.tex").replace("First line.\\n", "First line.\\n" + l)); }', INJECT)
            go_link(page, share(page2, 'back'))
            page.wait_for_function('() => window.rikuy.allComments().some((c) => c.body === "\\\\uppercase{rkinjected}")', timeout=20000)
            settle(page, 300)
            m = src(page)
            line = [l for l in m.split('\n') if l.startswith('% comment')]
            check('S5 %s: the comment comes in, written in base32 (letters, digits, spaces), shown as typed' % name,
                  len(line) == 1 and __import__('re').match(r'^% comment32( [A-Z2-7]+| 0){3}$', line[0]) and '\\uppercase' not in m and ['Eve', '', '\\uppercase{rkinjected}', []] in page.evaluate(COMMENTS), (line, page.evaluate(COMMENTS)))
            t1 = pdf_text(page)
            check('S5 %s: compiled in the page, the PDF has the line\'s letters (%% is no comment) and not the marker' % name, 'RKINJECTED' not in t1.upper() and 'comment32' in t1 and 'First line' in t1 and 'Second line' in t1, t1[:300])
        bad = [e for e in errs + errs2 if 'clipboard' not in e.lower()]
        check('S5: no page errors', not bad, bad[:3])
        A.close(); B.close()


if __name__ == '__main__':
    try:
        if len(sys.argv) < 2 or 'run' in sys.argv[1:]:
            run()
        if len(sys.argv) < 2 or 'comments' in sys.argv[1:]:
            comments_only()
        if len(sys.argv) < 2 or 'attacks' in sys.argv[1:]:
            comments_attacks()
        if len(sys.argv) < 2 or 'catcodes' in sys.argv[1:]:
            comments_catcodes()
        if len(sys.argv) < 2 or 'r4_merge' in sys.argv[1:]:
            r4_merge()
    except Exception:
        import traceback
        traceback.print_exc()
        check('the run reaches its end', False)
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    sys.exit(1 if bad else 0)
