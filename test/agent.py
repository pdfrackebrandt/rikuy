"""Rikuy as an AI agent meets it (what build/app.mjs's llms.txt tells one), in Chromium.

window.rikuy.api, every member: it is frozen and has exactly eight names; version is the
package's; whenReady resolves once the document is on the page; getSource and getFiles give the
project (a picture by its size); setSource is one edit that one Undo takes back byte for byte,
refuses a text the page cannot read and anything but a string; compile gives {ok, engine, pages,
problems, pdf} without opening the preview (a real PDF where dist/tex holds a TeX tree, the
reason there is none elsewhere); needs and setUpScripts for a document in Chinese; and in a
guest's view the reading members work while the writing ones reject and change nothing.

The controls by role and name, at 1400 and at 390 px: each has one accessible name, the same at
both widths, and what a narrow window hides is in the menu "Actions" under the same names. With
only get_by_role and get_by_label, exact names: type a sentence into a chosen paragraph, make a
word bold, set a heading by the style list, insert an equation, download the LaTeX source (by the
menu "Download" at 390 px) and read the source back with rikuy.api.getSource(). The page is a
textbox "Document" with its one sentence of description, its paragraphs and headings have roles
and still take typing. No interactive element is without a name in Chromium's accessibility
tree, with each dialog, each menu, the side panel's four tabs, the source and the PDF open.
What TeX says is in the status region "PDF status".

Links: #tex= with plain LaTeX in base64url opens as one's own document, marked as from a link
(restricted shell escape), at start and in an open page, with nothing compiled; markup in it
stays text; a broken or oversized one says why and leaves the open document; a #share= link
built by llms.txt's Python recipe opens as a guest's with "by" and as one's own without.

Needs a page built without RIKUY_SHARE (npm run build); RIKUY_DIST names another dist/."""
import base64, json, os, re, sys, zlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import ROOT, open_page, check, results, src, load_doc
from playwright.sync_api import sync_playwright, expect

DIST = os.path.abspath(os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist'))
TREE = os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm'))
VERSION = json.load(open(os.path.join(ROOT, 'package.json'), encoding='utf8'))['version']
HOME = 'https://rikuy.test/'
DOC = ('\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n\\section{Opening}\nFirst paragraph here.\n\n'
       'Second paragraph here.\n\n\\subsection{Details}\nThird paragraph here.\n\\end{document}\n')
ZH = '\\documentclass{article}\n\\begin{document}\n\u4e2d\u6587\u6bb5\u843d\u3002\n\\end{document}\n'
PNG = ('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf00000301010018dd8db00000000049454e44ae426082')
HOW = 'The typeset page. Click a paragraph and type; edits change the LaTeX source.'
# every control of the bar and the ribbon, by the one name it has at every width
NAMES = {'b-nav': 'Outline and problems', 'b-open': 'Open', 'b-pdf': 'Preview', 'b-share': 'Share', 'b-undo': 'Undo', 'b-redo': 'Redo', 'b-zout': 'Zoom out',
         'zoomv': 'Fit width', 'b-zin': 'Zoom in', 'b-src': 'Source', 'b-help': 'Help', 'rb-style': 'Style of this paragraph', 'rb-b': 'Bold', 'rb-i': 'Italic',
         'rb-u': 'Underline', 'rb-ul': 'Bulleted list', 'rb-ol': 'Numbered list', 'rb-math': 'Formula', 'rb-eq': 'Equation', 'rb-table': 'Table',
         'rb-pic': 'Picture', 'rb-fn': 'Footnote', 'rb-cite': 'Citation', 'rb-link': 'Link', 'rb-dl-menu': 'Download', 'rb-pdf': 'Download PDF',
         'rb-word': 'Download Word', 'b-save': 'Download LaTeX', 'b-new': 'New document', 'b-sample': 'Load the sample'}
ACTIONS = ['Download PDF', 'Download Word', 'Download LaTeX', 'Open', 'Preview', 'Copy source', 'Share', 'Undo', 'Redo', 'Zoom out', 'Fit width', 'Zoom in', 'Source', 'Help']
# roles a person or an agent acts on, and the containers they look for them in
ACTED = {'button', 'link', 'textbox', 'searchbox', 'combobox', 'listbox', 'checkbox', 'radio', 'switch', 'slider', 'spinbutton', 'menuitem', 'menuitemcheckbox',
         'menuitemradio', 'tab', 'dialog', 'alertdialog', 'menu', 'toolbar', 'tablist', 'tabpanel'}


def ax(page):
    cdp = page.context.new_cdp_session(page)
    cdp.send('Accessibility.enable')
    cdp.send('DOM.enable')
    return cdp


def unnamed(cdp):
    """What Chromium's accessibility tree holds of the roles above with no name: [(role, html)]."""
    out = []
    for n in cdp.send('Accessibility.getFullAXTree')['nodes']:
        role = (n.get('role') or {}).get('value')
        if n.get('ignored') or role not in ACTED or ((n.get('name') or {}).get('value') or '').strip():
            continue
        html = ''
        if n.get('backendDOMNodeId'):
            try: html = cdp.send('DOM.getOuterHTML', {'backendNodeId': n['backendDOMNodeId']})['outerHTML'][:140]
            except Exception as e: html = str(e)[:80]
        out.append((role, html))
    return out


def ready(page):
    page.wait_for_function('window.rikuy && window.rikuy.api && document.getElementById("boot").hidden', timeout=20000)
    page.evaluate('rikuy.api.whenReady()')
    page.wait_for_timeout(250)


def go(page, link):
    """Open an address as a new visit does (from another page, so the app starts with it)."""
    page.goto('about:blank')
    page.goto(link)
    ready(page)


def b64(text):
    return base64.urlsafe_b64encode(text.encode('utf8')).decode()


def share(o):
    """llms.txt's Python recipe for a #share= link, to the letter."""
    data = json.dumps(o).encode('utf8')
    c = zlib.compressobj(9, zlib.DEFLATED, -15)
    payload = base64.urlsafe_b64encode(c.compress(data) + c.flush()).rstrip(b'=').decode()
    return HOME + '#share=1.' + payload


def toast(page):
    return page.evaluate("document.getElementById('toast').hidden ? '' : document.getElementById('toast').textContent")


def close_all(page):
    page.evaluate("rikuy.closePop(true, true); rikuy.toggleNav(false); if (document.body.classList.contains('src-on')) rikuy.toggleSource(false); if (document.body.classList.contains('pdf-on')) rikuy.togglePdf(false)")
    page.wait_for_timeout(120)


# ---- window.rikuy.api ---------------------------------------------------------------------

def api(p):
    # asked for before the app has started: it resolves once the document is on the page
    early = '''(() => { const t = setInterval(() => { if (!window.rikuy || !window.rikuy.api) return; clearInterval(t);
      window.__early = { boot: document.getElementById('boot').hidden };
      window.rikuy.api.whenReady().then((v) => { window.__ready = { v, boot: document.getElementById('boot').hidden, page: !!document.querySelector('.page .it'), source: window.rikuy.api.getSource().length }; }); }, 1); })()'''
    browser, page, errors = open_page(p, init=early)
    page.wait_for_function('window.__ready', timeout=20000)
    r = page.evaluate('[window.__early, window.__ready]')
    check('api.whenReady, asked for while the app starts, resolves when the document is on the page', r[0]['boot'] is False and r[1].get('v') is None and r[1]['boot'] and r[1]['page'] and r[1]['source'] > 1000, r)
    shape = page.evaluate('''() => { const a = window.rikuy.api, before = Object.keys(a).sort().join(' ');
      let threw = 0; for (const f of [() => { 'use strict'; a.extra = 1; }, () => { 'use strict'; a.getSource = () => 'x'; }, () => { 'use strict'; delete a.compile; }, () => { 'use strict'; window.rikuy.api = {}; }]) try { f(); } catch (e) { threw++; }
      return { keys: before, after: Object.keys(window.rikuy.api).sort().join(' '), frozen: Object.isFrozen(a), threw, same: window.rikuy.api === a, types: Object.fromEntries(Object.keys(a).map((k) => [k, typeof a[k]])) }; }''')
    check('api is frozen and has exactly its eight members', shape['keys'] == 'compile getFiles getSource needs setSource setUpScripts version whenReady' and shape['after'] == shape['keys']
          and shape['frozen'] and shape['threw'] == 4 and shape['same'] and all(t == ('string' if k == 'version' else 'function') for k, t in shape['types'].items()), shape)
    check('api.version is the package\'s version (the installed app adds its own: test/offline.py)', page.evaluate('rikuy.api.version') == VERSION, page.evaluate('rikuy.api.version'))

    # reading
    check('api.getSource is the main file\'s text', page.evaluate('rikuy.api.getSource()') == src(page) and src(page).startswith('\\documentclass'))
    page.evaluate('''() => window.rikuy.openFiles([new File([Uint8Array.from('%s'.match(/../g).map((h) => parseInt(h, 16)))], 'dot.png', { type: 'image/png' })])''' % PNG)
    page.wait_for_function('window.rikuy.assetBlobs.has("dot.png")', timeout=5000)
    files = page.evaluate('rikuy.api.getFiles()')
    check('api.getFiles gives each text file with its text and a picture with its size', [sorted(f) for f in files] == [['name', 'text'], ['name', 'text'], ['bytes', 'name']]
          and [f['name'] for f in files] == ['main.tex', 'refs.bib', 'dot.png'] and files[0]['text'] == src(page) and files[1]['text'] == src(page, 'refs.bib') and files[2]['bytes'] == len(PNG) // 2, [(f['name'], f.get('bytes')) for f in files])
    before = [src(page), page.evaluate('rikuy.hist.length')]
    check('the sample needs no script set up: api.needs is [] and api.setUpScripts resolves to null, changing nothing',
          page.evaluate('rikuy.api.needs()') == [] and page.evaluate('rikuy.api.setUpScripts()') is None and [src(page), page.evaluate('rikuy.hist.length')] == before)

    # writing: one edit, through the edit path
    load_doc(page, DOC)
    page.evaluate('rikuy.toggleSource(true)')
    page.wait_for_function('window.rikuy.cm', timeout=8000)
    new = DOC.replace('Second paragraph here.', 'Second paragraph, set by a script.').replace('\\section{Opening}', '\\section{Opening}\nA new first line.\n')
    got = page.evaluate('''async (t) => { const r = await window.rikuy.api.setSource(t); return { r: r === undefined, source: window.rikuy.api.getSource() === t, page: document.getElementById('pages').textContent,
      hist: window.rikuy.hist.length, undo: !document.getElementById('b-undo').disabled, pane: window.rikuy.cm.getValue() === t, dirty: document.body.classList.contains('zip-dirty') }; }''', new)
    check('api.setSource replaces the main file and resolves when the page shows it', got['r'] and got['source'] and 'set by a script.' in got['page'] and 'A new first line.' in got['page'] and 'Second paragraph here.' not in got['page'], got)
    check('as one edit of the usual kind: one step of history, Undo lit, the source pane and the saved copy follow', got['hist'] == 1 and got['undo'] and got['pane'] and got['dirty'], got)
    page.get_by_role('button', name='Undo', exact=True).click()
    page.wait_for_timeout(150)
    check('one Undo takes it back byte for byte', src(page) == DOC and page.evaluate('rikuy.hist.length') == 0 and 'Second paragraph here.' in page.inner_text('#pages'))
    page.get_by_role('button', name='Redo', exact=True).click()
    page.wait_for_timeout(150)
    check('and Redo puts it back', src(page) == new)
    same = page.evaluate('async (t) => { const n = window.rikuy.hist.length; await window.rikuy.api.setSource(t); return window.rikuy.hist.length - n; }', new)
    check('the text it already has is no edit', same == 0, same)
    # typed just now, not yet a step of its own: the two do not merge into one
    page.evaluate('rikuy.toggleSource(false)')
    page.get_by_role('textbox', name='Document', exact=True).get_by_role('paragraph').nth(0).click()
    page.keyboard.type('zz')
    page.wait_for_timeout(60)
    page.evaluate('(t) => window.rikuy.api.setSource(t)', DOC)
    page.get_by_role('button', name='Undo', exact=True).click()
    page.wait_for_timeout(120)
    check('typing just before it stays a step of its own', 'zz' in src(page) and src(page).replace('zz', '') == new, src(page)[:160])
    page.evaluate('(t) => window.rikuy.api.setSource(t)', DOC)
    # with a dialog open that writes into the source as it closes
    page.get_by_role('textbox', name='Document', exact=True).get_by_role('paragraph').nth(1).click()
    page.get_by_role('button', name='Equation', exact=True).click()
    field = page.get_by_role('dialog', name='Display math', exact=True).get_by_role('textbox', name='Equation editor', exact=True)
    field.wait_for(state='attached', timeout=8000)
    page.wait_for_timeout(500)
    field.press_sequentially('x+y')
    page.wait_for_timeout(300)
    open_ = page.evaluate('(t) => window.rikuy.api.setSource(t).then(() => [window.rikuy.api.getSource() === t, document.querySelectorAll(".pop").length])', new)
    check('with a dialog open, setSource closes it and the source is the text given, to the byte', open_ == [True, 0] and 'x+y' not in src(page), open_)
    page.evaluate('(t) => window.rikuy.api.setSource(t)', DOC)
    bad = page.evaluate('''async () => { const out = [], before = window.rikuy.api.getSource(), n = window.rikuy.hist.length;
      for (const t of [7, null, undefined, { toString: () => 'x' }, ['a']]) try { await window.rikuy.api.setSource(t); out.push('took ' + t); } catch (e) { out.push(e.name); }
      try { await window.rikuy.api.setSource('\\\\begin{document}' + '{'.repeat(200000) + '}'.repeat(200000) + '\\\\end{document}'); out.push('took the deep one'); } catch (e) { out.push(e.name + ': ' + e.message); }
      return { out, same: window.rikuy.api.getSource() === before, hist: window.rikuy.hist.length - n, stale: !!window.rikuy.stale, editable: document.getElementById('pages').isContentEditable }; }''')
    check('anything but a string is refused with a TypeError', bad['out'][:5] == ['TypeError'] * 5, bad['out'])
    check('a text the page cannot read is refused, and nothing changes', bad['out'][5].startswith('Error: The page cannot read this source (') and bad['out'][5].endswith('Nothing was changed.')
          and bad['same'] and bad['hist'] == 0 and not bad['stale'] and bad['editable'], bad)
    check('a script\'s setSource leaves no element or script of its text on the page',
          page.evaluate('''async () => { await window.rikuy.api.setSource('\\\\documentclass{article}\\\\begin{document}<img src=x onerror="window.__hit=1"><script>window.__hit=2</script> text\\\\end{document}');
            await new Promise((r) => setTimeout(r, 300)); return [window.__hit === undefined, document.querySelectorAll('#pages img, #pages script').length, document.getElementById('pages').textContent.includes('<img src=x')]; }''') == [True, 0, True])
    page.evaluate('(t) => window.rikuy.api.setSource(t)', DOC)

    # a compile, with the preview closed
    page.set_default_timeout(400000 if TREE else 30000)
    r = page.evaluate('''async () => { const r = await window.rikuy.api.compile();
      return { keys: Object.keys(r).sort().join(' '), ok: r.ok, engine: r.engine, pages: r.pages, problems: r.problems, kind: r.pdf && r.pdf.constructor.name, n: r.pdf ? r.pdf.length : 0, head: r.pdf ? String.fromCharCode(...r.pdf.slice(0, 5)) : '',
        pane: document.body.classList.contains('pdf-on'), pressed: document.getElementById('b-pdf').getAttribute('aria-pressed') }; }''')
    said = page.get_by_role('status', name='PDF status', exact=True).inner_text()
    shape = r['keys'] == 'engine ok pages pdf problems' and isinstance(r['problems'], list) and all(sorted(x) == ['file', 'line', 'message', 'severity'] for x in r['problems'])
    check('api.compile opens no preview', r['pane'] is False and r['pressed'] == 'false', r)
    if TREE:
        check('api.compile makes the PDF: {ok, engine, pages, problems, pdf}', shape and r['ok'] is True and r['engine'] == 'pdflatex' and r['pages'] == 1 and r['problems'] == [] and r['kind'] == 'Uint8Array' and r['n'] > 3000 and r['head'] == '%PDF-', r)
        check('and the status region "PDF status" says how it ended', 'pdfLaTeX' in said and '1 page' in said, said)
        r2 = page.evaluate('''async () => { await window.rikuy.api.setSource(window.rikuy.api.getSource().replace('Second paragraph', 'Second \\\\nosuchmacro paragraph'));
          const r = await window.rikuy.api.compile(); return { ok: r.ok, problems: r.problems, said: document.getElementById('pdf-live').textContent }; }''')
        errs = [x for x in r2['problems'] if x['severity'] == 'error']
        check('TeX\'s errors come as problems with their file and line, and are said in "PDF status"', len(errs) == 1 and 'Undefined control sequence' in errs[0]['message'] and errs[0]['file'] == 'main.tex' and errs[0]['line'] == 7
              and '1 error' in r2['said'] and 'Undefined control sequence' in r2['said'], r2)
        page.evaluate('(t) => window.rikuy.api.setSource(t)', DOC)
    else:
        print('SKIP a real PDF from api.compile: no TeX tree in %s (tex/tree.wasm); it runs where dist/tex is built' % DIST)
        check('with no TeX to run, api.compile resolves with ok false, no PDF and the reason as a problem', shape and r['ok'] is False and r['pdf' if 'pdf' in r else 'kind'] is None and r['n'] == 0 and r['pages'] == 0 and r['engine'] is None
              and len(r['problems']) == 1 and r['problems'][0]['severity'] == 'error' and len(r['problems'][0]['message']) > 5 and r['problems'][0]['file'] is None and r['problems'][0]['line'] is None, r)
        check('and the status region "PDF status" says so', said.startswith('TeX could not run here.') and r['problems'][0]['message'] in said, said)
    page.set_default_timeout(30000)

    # scripts: what the text needs, and the set up
    page.evaluate('(t) => window.rikuy.api.setSource(t)', ZH)
    check('api.needs names the script a document is written in and does not set up', page.evaluate('rikuy.api.needs()') == ['chinese'], page.evaluate('rikuy.api.needs()'))
    n0 = page.evaluate('rikuy.hist.length')
    eng = page.evaluate('rikuy.api.setUpScripts()')
    after = src(page)
    check('api.setUpScripts adds the lines as one edit and resolves to the engine they need', eng == 'xelatex' and '{ctex}' in after and after != ZH and page.evaluate('rikuy.hist.length') == n0 + 1 and page.evaluate('rikuy.api.needs()') == [], (eng, after[:120]))
    check('a second call finds nothing to add: null', page.evaluate('rikuy.api.setUpScripts()') is None and src(page) == after)
    page.get_by_role('button', name='Undo', exact=True).click()
    page.wait_for_timeout(150)
    check('one Undo takes the set up out again', src(page) == ZH and page.evaluate('rikuy.api.needs()') == ['chinese'])
    check('no page errors (the API)', not [e for e in errors if 'tree.wasm' not in e and 'TeX' not in e and 'fetch' not in e], errors[:4])

    # a guest's view: the document someone shared, opened from their link
    go(page, share({'v': 1, 'name': 'Shared paper', 'main': 'main.tex', 'files': [['main.tex', ZH], ['refs.bib', '@book{a, title={T}}']], 'by': 'Ana'}))
    g = page.evaluate('''async () => { const a = window.rikuy.api, out = { guest: document.body.classList.contains('guest'), bar: document.getElementById('guest-msg').textContent, source: a.getSource(), files: a.getFiles().map((f) => f.name), needs: a.needs(), n: window.rikuy.hist.length };
      try { await a.setSource('x'); out.set = 'took it'; } catch (e) { out.set = e.name + ': ' + e.message; }
      try { await a.setUpScripts(); out.setup = 'took it'; } catch (e) { out.setup = e.name + ': ' + e.message; }
      out.same = a.getSource() === out.source && window.rikuy.hist.length === out.n; out.notice = document.getElementById('script-note').hidden;
      const r = await a.compile(); out.compile = Object.keys(r).sort().join(' '); await a.whenReady(); out.version = a.version; return out; }''')
    check('a link with "by" opens as that sender\'s guest', g['guest'] and g['bar'].startswith('Ana shared this document with you.'), g['bar'])
    check('there the reading members work: getSource, getFiles, needs, compile, whenReady, version', g['source'] == ZH and g['files'] == ['main.tex', 'refs.bib'] and g['needs'] == ['chinese']
          and g['compile'] == 'engine ok pages pdf problems' and g['version'] == VERSION, g)
    check('and setSource and setUpScripts reject with an Error that says why, changing nothing', g['same'] and all(g[k].startswith('Error: rikuy.api.' + f + '() changes the document, and this one is open in guest view')
          for k, f in (('set', 'setSource'), ('setup', 'setUpScripts'))) and g['notice'], (g['set'], g['setup']))
    page.get_by_role('button', name='Hide', exact=True).click()
    page.wait_for_timeout(150)
    check('once the guest closes the bar the document is theirs to change', page.evaluate('(t) => window.rikuy.api.setSource(t).then(() => window.rikuy.api.getSource() === t)', DOC))
    browser.close()


# ---- the controls by role and name --------------------------------------------------------

def names(page, width):
    w = ' (%d px)' % width
    seen, wrong, twice = [], [], []
    for i, name in NAMES.items():
        loc = page.locator('#' + i)
        if not loc.is_visible():
            continue
        seen.append(i)
        try: expect(loc).to_have_accessible_name(name, timeout=1000)
        except AssertionError as e: wrong.append((i, str(e)[:120]))
        role = 'combobox' if i == 'rb-style' else 'button'
        if page.get_by_role(role, name=name, exact=True).count() != 1:
            twice.append((name, page.get_by_role(role, name=name, exact=True).count()))
    wide = set(NAMES) - {'rb-dl-menu'}
    narrow = set(NAMES) - {'b-zout', 'b-zin', 'b-help', 'rb-pdf', 'rb-word', 'b-save'}
    check('every control in view has its one name, and no other control has it' + w, not wrong and not twice and set(seen) == (wide if width > 1000 else narrow), (wrong, twice, sorted(set(seen) ^ (wide if width > 1000 else narrow))))
    check('each keeps its longer hint as a title' + w, page.evaluate('(ids) => ids.every((i) => { const b = document.getElementById(i); return b.title.length > 3 && b.getAttribute("aria-label").length <= b.title.length + 12; })', [i for i in NAMES if i not in ('b-new', 'b-sample')]))
    check('no glyph is read as part of a name' + w, page.evaluate('''() => [...document.querySelectorAll('#bar svg, #ribbon svg, #ribbon b, #ribbon i, #ribbon u, #bubble b, #bubble i')].every((x) => x.getAttribute('aria-hidden') === 'true')'''))
    doc = page.get_by_role('textbox', name='Document', exact=True)
    try:
        expect(doc).to_have_accessible_description(HOW, timeout=1000)
        said = HOW
    except AssertionError as e: said = str(e)[:200]
    check('the page is one textbox "Document" that says in a sentence what it is' + w, doc.count() == 1 and said == HOW and page.get_by_label('Document', exact=True).count() == 1, said)
    heads = doc.get_by_role('heading')
    check('its headings are headings, with their level' + w, heads.all_inner_texts() == ['1Opening', '1.1Details'] and doc.get_by_role('heading', level=2).count() == 1 and doc.get_by_role('heading', level=3).count() == 1
          and doc.get_by_role('heading', name='Details').get_attribute('aria-level') == '3', heads.all_inner_texts())
    check('and its paragraphs paragraphs' + w, [t.strip() for t in doc.get_by_role('paragraph').all_inner_texts()] == ['First paragraph here.', 'Second paragraph here.', 'Third paragraph here.'], doc.get_by_role('paragraph').all_inner_texts())
    # the side panel's menu: every action of the bar by the name its button has
    page.get_by_role('button', name='Outline and problems', exact=True).click()
    page.wait_for_timeout(250)
    tabs = page.get_by_role('tablist', name='Panel', exact=True).get_by_role('tab')
    check('the side panel\'s tabs are Outline, Problems, Review and Git, and the open one names the panel' + w, [tabs.nth(k).get_attribute('aria-label') for k in range(tabs.count())] == ['Outline', 'Problems', 'Review', 'Git']
          and page.get_by_role('tab', name='Outline', exact=True).get_attribute('aria-selected') == 'true' and page.get_by_role('tabpanel', name='Outline', exact=True).count() == 1, tabs.all_inner_texts())
    menu = page.get_by_role('menu', name='Actions', exact=True)
    if width < 1000:
        items = menu.get_by_role('menuitem')
        got = [items.nth(k).get_attribute('aria-label') for k in range(items.count())]
        check('a narrow window\'s panel has every action of the bar as a menu item of the same name' + w, got == ACTIONS and all(menu.get_by_role('menuitem', name=n, exact=True).count() == 1 for n in ACTIONS), got)
        menu.get_by_role('menuitem', name='Help', exact=True).click()
        page.wait_for_timeout(250)
        check('Help, which the narrow bar hides, opens from there' + w, page.get_by_role('dialog', name='How Rikuy works', exact=True).is_visible())
        page.get_by_role('dialog', name='How Rikuy works', exact=True).get_by_role('button', name='Close', exact=True).click()
    else:
        check('a wide window shows the bar itself, not that menu' + w, not menu.is_visible())
        page.get_by_role('button', name='Close the panel', exact=True).click()
    page.wait_for_timeout(150)
    close_all(page)


def five(page, width):
    """The five things an audit asked of an agent, by role and name alone."""
    w = ' (%d px)' % width
    button = lambda name: page.get_by_role('button', name=name, exact=True)
    doc = page.get_by_role('textbox', name='Document', exact=True)
    paras = doc.get_by_role('paragraph')
    pick = lambda text: next(k for k, t in enumerate(paras.all_inner_texts()) if text in t)
    # 1. a sentence into a chosen paragraph
    paras.nth(pick('Second paragraph')).click()
    page.keyboard.press('End')
    page.keyboard.type(' Typed by an agent.')
    page.wait_for_timeout(200)
    check('1. a sentence typed into the paragraph the agent chose' + w, 'Second paragraph here. Typed by an agent.\n' in src(page) and src(page).count('Typed by an agent.') == 1, src(page)[90:200])
    # 2. a word in bold
    paras.nth(pick('Third paragraph')).click()
    page.keyboard.press('Home')
    page.keyboard.press('Control+Shift+ArrowRight')
    page.wait_for_timeout(250)
    word = page.evaluate('getSelection().toString()')
    button('Bold').click()
    page.wait_for_timeout(250)
    check('2. a word made bold with the button named Bold' + w, word.strip() == 'Third' and '\\textbf{Third} paragraph here.' in src(page) and button('Bold').get_attribute('aria-pressed') == 'true', (word, src(page)[-90:]))
    check('   (the bubble over a selection has names of its own, so "Bold" stays one button)' + w, page.get_by_role('toolbar', name='Selection', exact=True).get_by_role('button', name='Bold selection', exact=True).count() == 1 and button('Bold').count() == 1)
    # a heading from the style list, by its label
    paras.nth(pick('First paragraph')).click()
    page.get_by_label('Style of this paragraph', exact=True).select_option(label='Heading 2')
    page.wait_for_timeout(250)
    check('   a paragraph made a heading with the list labelled "Style of this paragraph"' + w, '\\subsection{First paragraph here.}' in src(page) and doc.get_by_role('heading', name='First paragraph here.').count() == 1, src(page)[60:140])
    doc.get_by_role('heading', name='First paragraph here.').click()
    page.keyboard.press('End')
    page.keyboard.type(' Still typed')
    page.wait_for_timeout(200)
    check('   and a heading takes typing as before' + w, '\\subsection{First paragraph here. Still typed}' in src(page), src(page)[60:150])
    # 3. an equation
    paras = doc.get_by_role('paragraph')
    paras.nth(pick('Typed by an agent.')).click()
    page.keyboard.press('End')
    button('Equation').click()
    dlg = page.get_by_role('dialog', name='Display math', exact=True)
    dlg.wait_for(timeout=8000)
    field = dlg.get_by_role('textbox', name='Equation editor', exact=True)
    field.wait_for(state='attached', timeout=8000)
    page.wait_for_timeout(500)
    field.press_sequentially('a^2+b^2=c^2')
    page.wait_for_timeout(300)
    page.keyboard.press('Enter')
    page.wait_for_timeout(400)
    check('3. an equation inserted by the button Equation and the dialog "Display math"' + w, re.search(r'Typed by an agent\.\n\\begin\{equation\}\n\s*a\^2\+b\^2=c\^2\n\\end\{equation\}', src(page)) and page.get_by_role('dialog').count() == 0, src(page)[150:320])
    paras.nth(pick('Third')).click()
    page.keyboard.press('End')
    button('Formula').click()
    page.get_by_role('dialog', name='New inline math', exact=True).get_by_role('textbox', name='Equation editor', exact=True).wait_for(state='attached', timeout=8000)
    page.wait_for_timeout(500)
    page.keyboard.type('x^2+1')
    page.wait_for_timeout(300)
    page.keyboard.press('Enter')
    page.wait_for_timeout(400)
    check('   a formula in the line by the button Formula and the dialog "New inline math", typed where the focus is' + w, 'paragraph here.$x^2+1$\n' in src(page) and page.get_by_role('dialog').count() == 0, src(page)[-80:])
    # 4. the LaTeX source, downloaded
    with page.expect_download() as dl:
        if width > 1000:
            button('Download LaTeX').click()
        else:
            button('Download').click()
            menu = page.get_by_role('menu', name='Download', exact=True)
            items = menu.get_by_role('menuitem')
            check('   the menu "Download" names its items: PDF, Word and LaTeX, and Close' + w, [items.nth(k).get_attribute('aria-label') for k in range(items.count())] == ['Close', 'Download PDF', 'Download Word', 'Download LaTeX'])
            menu.get_by_role('menuitem', name='Download LaTeX', exact=True).click()
    saved = open(dl.value.path(), encoding='utf8').read()
    # 5. the whole source, read back
    back = page.evaluate('rikuy.api.getSource()')
    check('4. the LaTeX source downloaded as a .tex' + w, dl.value.suggested_filename.endswith('.tex') and saved == src(page), dl.value.suggested_filename)
    check('5. the whole source read back with rikuy.api.getSource(): the download, to the byte' + w, back == saved and all(x in back for x in ('Typed by an agent.', '\\textbf{Third}', 'a^2+b^2=c^2', 'Still typed')) and back.endswith('\\end{document}\n'), len(back))
    close_all(page)


def audit(page, cdp, width):
    """Nothing a person or an agent acts on is without a name, in each state the app has."""
    w = ' (%d px)' % width
    button = lambda name: page.get_by_role('button', name=name, exact=True)
    doc = page.get_by_role('textbox', name='Document', exact=True)
    first = lambda: (doc.get_by_role('paragraph').nth(1).click(), page.keyboard.press('End'))
    found = {}

    looked = []
    def look(state, wait=350):
        page.wait_for_timeout(wait)
        looked.append(state)
        bad = unnamed(cdp)
        if bad: found[state] = bad

    def via(name):
        """A bar button, or on a narrow window its item in the panel's menu."""
        if button(name).is_visible():
            button(name).click()
        else:
            button('Outline and problems').click()
            page.get_by_role('menu', name='Actions', exact=True).get_by_role('menuitem', name=name, exact=True).click()

    look('at rest')
    opened = []
    def dialog(state, name, how):
        first()
        how()
        d = page.get_by_role('dialog', name=name, exact=True)
        try: d.wait_for(timeout=8000)
        except Exception: pass
        ok = d.count() == 1 and d.get_attribute('aria-modal') == 'true' and d.get_by_role('button', name='Close', exact=True).count() == 1
        opened.append((name, ok))
        look(state, 900 if 'math' in state else 350)
        close_all(page)

    dialog('Help', 'How Rikuy works', lambda: via('Help'))
    dialog('Share', 'Share', lambda: via('Share'))
    dialog('Formula', 'New inline math', lambda: button('Formula').click())
    dialog('Equation (math field)', 'Display math', lambda: button('Equation').click())
    page.evaluate('rikuy.undo()')
    dialog('Citation', 'Citation', lambda: button('Citation').click())
    page.evaluate('rikuy.undo()')
    dialog('Insert', 'Insert', lambda: page.keyboard.press('Control+k'))
    dialog('Comment', 'Comment', lambda: (page.keyboard.press('Control+Shift+ArrowLeft'), page.keyboard.press('Control+Alt+m')))
    check('each dialog is a dialog named by its title, modal, with a Close button' + w, all(ok for _, ok in opened) and len(opened) == 7, opened)
    c = page.get_by_role('dialog', name='Citation', exact=True)
    first(); button('Citation').click(); c.wait_for(timeout=8000)
    check('the citation dialog\'s fields have names: style, search, text before and after' + w, c.get_by_role('combobox', name='Citation style', exact=True).count() == 1 and c.get_by_role('searchbox', name='Search the bibliography', exact=True).count() == 1
          and c.get_by_label('Text before the citation', exact=True).count() == 1 and c.get_by_label('Text after the citation', exact=True).count() == 1)
    close_all(page)
    page.evaluate('rikuy.undo()')
    # a selection: the bubble over it
    first(); page.keyboard.press('Control+Shift+ArrowLeft')
    look('a selection and its bubble')
    bubble = page.get_by_role('toolbar', name='Selection', exact=True).get_by_role('button')
    check('the bubble over a selection: Bold, Emphasize, Typewriter, Comment and Show in source, each "selection"' + w,
          [bubble.nth(k).get_attribute('aria-label') for k in range(bubble.count())] == ['Bold selection', 'Emphasize selection', 'Typewriter selection', 'Comment on selection', 'Show selection in source'], bubble.all_inner_texts())
    page.keyboard.press('ArrowRight')
    # the side panel, tab by tab (a narrow window has the menu of actions in it)
    button('Outline and problems').click()
    for tab in ('Outline', 'Problems', 'Review', 'Git'):
        page.get_by_role('tab', name=tab, exact=True).click()
        look('the panel: ' + tab)
        check('the panel is named by its open tab: ' + tab + w, page.get_by_role('tabpanel', name=tab, exact=True).count() == 1)
    close_all(page)
    if width < 1000:
        button('Download').click()
        look('the menu Download')
        close_all(page)
    via('Source')
    page.wait_for_function('window.rikuy.cm', timeout=8000)
    look('the source pane')
    check('the source pane has its Copy source button and file tabs by name' + w, button('Copy source').is_visible() if width > 1000 else True)
    close_all(page)
    via('Preview')
    look('the PDF preview', 900)
    pane = page.get_by_label('PDF from TeX', exact=True)
    check('the preview\'s controls by name: engine, Shell escape, Recompile, Download this PDF, Close the PDF' + w, pane.get_by_role('combobox', name='TeX engine', exact=True).count() == 1 and pane.get_by_role('checkbox', name='Shell escape', exact=True).count() == 1
          and pane.get_by_role('button', name='Recompile', exact=True).count() == 1 and pane.get_by_role('button', name='Download this PDF', exact=True).count() == 1 and pane.get_by_role('button', name='Close the PDF', exact=True).count() == 1)
    status = page.get_by_role('status', name='PDF status', exact=True)
    page.wait_for_function('!window.rikuy.compiling && document.getElementById("pdf-live").textContent.length > 5', timeout=400000 if TREE else 30000)
    said = status.inner_text()
    check('what TeX did, or why it could not, is in the status region "PDF status", which is polite' + w, status.count() == 1 and status.get_attribute('aria-live') == 'polite'
          and (('pdfLaTeX' in said and 'page' in said) if TREE else said.startswith('TeX could not run here.')) and page.evaluate("document.getElementById('pdf-status').textContent.trim().length > 0"), said)
    close_all(page)
    # the notice for a script the preamble does not set up
    page.evaluate('(t) => window.rikuy.api.setSource(t)', ZH)
    page.wait_for_selector('#script-note:not([hidden])', timeout=6000)
    look('the script notice')
    check('the notice\'s buttons: Set it up, Not now' + w, button('Set it up').is_visible() and button('Not now').is_visible())
    page.evaluate('rikuy.undo()')
    check('no interactive element is without a name, in any of %d states' % len(looked) + w, not found and len(looked) == (16 if width > 1000 else 17), found or looked)


def controls(p):
    for width in (1400, 390):
        browser, page, errors = open_page(p, width=width, height=900)
        cdp = ax(page)
        load_doc(page, DOC)
        names(page, width)
        five(page, width)
        load_doc(page, DOC)
        audit(page, cdp, width)
        check('no page errors (%d px)' % width, not [e for e in errors if 'tree.wasm' not in e and 'TeX' not in e and 'fetch' not in e], errors[:4])
        browser.close()


# ---- links an agent builds -------------------------------------------------------------------

def links(p):
    browser, page, errors = open_page(p)
    kept = src(page)
    hostile = DOC.replace('First paragraph here.', 'Linked <img src=x onerror="window.__hit=1"><script>window.__hit=2</script> \u00fc \u4e2d \\input{../../etc/passwd}')
    go(page, HOME + '#tex=' + b64(hostile))
    s = page.evaluate('''async () => { const r = window.rikuy, v = r.linkCache.get('main.tex|main.tex');
      return { name: r.name, main: r.main, files: [...r.files.keys()], guest: document.body.classList.contains('guest'), bar: document.getElementById('guest').hidden, href: location.href, mark: v && [v.by, v.allowed, v.origin],
        hit: window.__hit, els: document.querySelectorAll('#pages img, #pages script').length, text: document.getElementById('pages').textContent, compiling: !!r.compiling, pdf: document.body.classList.contains('pdf-on'),
        hist: r.hist.length, snaps: (await r.allSnaps()).map((x) => x.name), shell: document.getElementById('pdf-shell').checked, toast: document.getElementById('toast').hidden }; }''')
    check('a #tex= link opens its LaTeX as a document of one file, main.tex', src(page) == hostile and s['name'] == 'main.tex' and s['main'] == 'main.tex' and s['files'] == ['main.tex'] and s['hist'] == 0, (s['name'], s['files']))
    check('as one\'s own: no guest bar, nobody to send it back to', s['guest'] is False and s['bar'] is True, s)
    check('and the page says that a link\'s document is open and where the one before went', toast(page) == 'The document from the link is open. The one you had is under Review, Versions.', toast(page))
    check('marked as from a link, so it compiles with restricted shell escape until allowed', s['mark'] == ['', False, 'link'] and s['shell'] is False, s['mark'])
    check('markup in it is text on the page: no element, no script run', s['hit'] is None and s['els'] == 0 and '<img src=x onerror=' in s['text'] and '<script>' in s['text'], s['text'][:120])
    check('nothing is compiled by opening it, and the address loses the document', s['compiling'] is False and s['pdf'] is False and s['href'] == HOME, s['href'])
    check('the document that was open is kept as a version', 'Editing in Print' in s['snaps'], s['snaps'])
    check('rikuy.api reads it and may change it', page.evaluate('rikuy.api.getSource()') == hostile and page.evaluate('(t) => window.rikuy.api.setSource(t).then(() => window.rikuy.api.getSource() === t)', DOC))
    # in a page already open: the fragment alone changes
    page.evaluate('(h) => { location.hash = h; }', '#tex=' + b64(ZH))
    page.wait_for_function('(t) => window.rikuy.api.getSource() === t', arg=ZH, timeout=5000)
    check('a #tex= link opened in a tab that already shows Rikuy opens too', page.evaluate('location.href') == HOME and page.evaluate('rikuy.api.needs()') == ['chinese'])
    # standard base64, padded, as most tools write it
    plain = base64.b64encode((DOC + '%>>>???\n').encode()).decode()
    page.evaluate('(h) => { location.hash = h; }', '#tex=' + plain)
    page.wait_for_function('(t) => window.rikuy.api.getSource() === t', arg=DOC + '%>>>???\n', timeout=5000)
    check('plain base64 with + / and = is read as well', ('+' in plain or '/' in plain) and src(page) == DOC + '%>>>???\n')
    # a long one: 300 kB of LaTeX in the address
    long = DOC.replace('Third paragraph here.', 'Filler words here. ' * 16000)
    go(page, HOME + '#tex=' + b64(long))
    check('a 300 kB document opens from its link (%d characters of address)' % (len(b64(long)) + 30), len(long) > 300000 and src(page) == long and page.evaluate('location.href') == HOME, len(src(page)))
    # broken and oversized links say why and leave the document
    go(page, HOME + '#tex=' + b64(DOC))
    said = []
    for h in ('#tex=', '#tex=!!!', '#tex=A', '#tex=' + b64(DOC)[:41], '#tex=' + base64.urlsafe_b64encode(b'\xff\xfe\\begin').decode(), '#tex=' + b64('   \n')):
        page.evaluate("document.getElementById('toast').hidden = true")
        page.evaluate('(h) => { location.hash = h; }', h)
        page.wait_for_function("!document.getElementById('toast').hidden", timeout=5000)
        said.append((toast(page), src(page) == DOC, page.evaluate('location.href') == HOME))
    check('a link cut short, not base64, not UTF-8 or empty opens nothing: the page says why and the document stays',
          all(t in ('Could not open the link: The link is damaged or cut short.', 'Could not open the link: The link does not hold a document.') and same and clean for t, same, clean in said) and len({t for t, _, _ in said}) == 2, said)
    page.evaluate("document.getElementById('toast').hidden = true")
    page.evaluate('(n) => { location.hash = "#tex=" + "YWFh".repeat(n); }', 250001)
    page.wait_for_function("!document.getElementById('toast').hidden", timeout=8000)
    check('one over the size limit is refused with the limit and the other ways in', toast(page) == 'Could not open the link: The document in this link is too large to open: a #tex= link holds up to 750 kB of LaTeX. A #share= link is compressed and holds more, and Open takes a .tex file of any size.'
          and src(page) == DOC, toast(page))
    # pasted into the page, a link is offered, not typed
    page.evaluate("document.getElementById('toast').hidden = true")
    page.get_by_role('textbox', name='Document', exact=True).get_by_role('paragraph').nth(0).click()
    page.evaluate('''(t) => { const d = new DataTransfer(); d.setData('text/plain', t); document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: d, bubbles: true, cancelable: true })); }''', HOME + '#tex=' + b64(ZH))
    page.wait_for_timeout(250)
    check('a #tex= link pasted into the page is offered with "Open it", not typed', toast(page).startswith('That is a link to a shared document.') and src(page) == DOC and page.get_by_role('button', name='Open it', exact=True).is_visible(), toast(page))
    page.get_by_role('button', name='Open it', exact=True).click()
    page.wait_for_function('(t) => window.rikuy.api.getSource() === t', arg=ZH, timeout=5000)
    check('and opens when asked', src(page) == ZH)

    # #share= by llms.txt's recipe: "name" and "by" are optional
    go(page, share({'v': 1, 'main': 'main.tex', 'files': [['main.tex', DOC], ['refs.bib', '@book{a, title={T}}']]}))
    s = page.evaluate("({ name: rikuy.name, files: [...rikuy.files.keys()], guest: document.body.classList.contains('guest'), bar: document.getElementById('guest').hidden, mark: rikuy.linkCache.get('main.tex|main.tex'), href: location.href })")
    check('a #share= link with no "name" and no "by" opens as one\'s own document, named by its main file', src(page) == DOC and s['name'] == 'main.tex' and s['files'] == ['main.tex', 'refs.bib'] and s['guest'] is False and s['bar'] is True
          and s['mark']['by'] == '' and s['mark']['allowed'] is False and s['href'] == HOME, s)
    go(page, share({'v': 1, 'name': 'Our paper', 'main': 'main.tex', 'files': [['main.tex', DOC]], 'by': 'An agent'}))
    s = page.evaluate("({ name: rikuy.name, guest: document.body.classList.contains('guest'), msg: document.getElementById('guest-msg').textContent, mark: rikuy.linkCache.get('Our paper|main.tex') })")
    check('with "by" it opens as that sender\'s guest: the bar names them and has Send back', s['name'] == 'Our paper' and s['guest'] and s['msg'].startswith('An agent shared this document with you.') and s['mark']['by'] == 'An agent'
          and page.get_by_role('button', name='Send back', exact=True).is_visible(), s)
    go(page, HOME + '#share=1.' + 'A' * 40)
    check('a broken #share= link says so and keeps the open document', toast(page).startswith('Could not open the link: ') and page.evaluate('rikuy.name') == 'Our paper', toast(page))
    check('no page errors (links)', not [e for e in errors if 'tree.wasm' not in e and 'TeX' not in e and 'fetch' not in e], errors[:4])
    del kept
    browser.close()


if __name__ == '__main__':
    with sync_playwright() as p:
        api(p)
        controls(p)
        links(p)
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    sys.exit(1 if bad else 0)
