"""Insert (batch B11). Interactive graphs, Rikuy's live figures made as Word makes charts: the
dialog writes the widget's file, the \\rikuywidget line, rikuy.sty and \\usepackage{rikuy} where
missing and the PDF's picture as one step, which one undo takes back byte for byte (files and
picture gone) and redo brings again; Edit graph changes the file and the picture only, writes
nothing when nothing changed, and points a hand written command's non-PNG fallback at the new
picture; each of the four kinds runs on the page, and its picture is the live figure at its
starting values (pixels compared); the first graph shows a hint once, its frame's right click asks
for Rikuy's menu (Edit graph), at most once a second; the preview and the page's frames stay
sandboxed and a description cannot break out of its script element; on a phone (390 and 360 px,
touch) the dialog fits without sideways scroll, its targets are 44 px, Edit graph is 44 px on the
screen at any zoom, and a slider moves by touch; with dist/tex a graph compiles on pdfLaTeX,
XeLaTeX and LuaLaTeX with its picture in the PDF. Then the rest of Insert and the clipboard:
cut, copy and the paste options, symbols and special characters with their keys, the LaTeX group,
AutoCorrect as typed. Screenshots in $RIKUY_SHOTS (default /tmp/B11-shots)."""
import os, sys, io, re, json, base64
sys.path.insert(0, os.path.dirname(__file__))
from browser import open_page, src, load_doc, click_text, select_text, check, results, roundtrip
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist')
SHOTS = os.environ.get('RIKUY_SHOTS', '/tmp/B11-shots')
os.makedirs(SHOTS, exist_ok=True)
DOC = '\\documentclass{article}\n\\begin{document}\nHello world.\n\nSecond para.\n\\end{document}\n'
WANT = ('\\documentclass{article}\n\\usepackage{rikuy}\n\\begin{document}\nHello world.\n\n\\begin{center}\n'
        '\\rikuywidget[width=\\linewidth]{graphs/function-1.html}{graphs/function-1.png}\n\\end{center}\n\nSecond para.\n\\end{document}\n')
GD = '[role=dialog][aria-labelledby=pop-title]'


def files(page):
    return page.evaluate('[[...window.rikuy.files.keys()].sort(), [...window.rikuy.assetBlobs.keys()].sort()]')


def blob_b64(page, name):
    return page.evaluate('''async (n) => { const b = window.rikuy.assetBlobs.get(n); if (!b) return null; const a = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode(...a.subarray(i, i + 8192)); return btoa(s); }''', name)


def newest(page, base):
    """The graph of this kind inserted last: graphs/<base>-<four letters> (each graph's name is its own)."""
    names = sorted(n[:-5] for n in page.evaluate('[...window.rikuy.files.keys()]') if re.match(r'graphs/' + base + r'-[a-z0-9]{4}\.html$', n))
    hist = page.evaluate('window.rikuy.src(window.rikuy.main)')
    return [n for n in names if n in hist][-1] if any(n in hist for n in names) else (names[-1] if names else None)


def insert_graph(page, kind=None, at=('Hello', 2), caption=None):
    click_text(page, *at)
    page.evaluate('(k) => window.rikuy.runCommand("insert-interactive-graph", k ? { template: k } : null)', kind)
    page.wait_for_selector('#gd-ok')
    page.wait_for_timeout(400)
    if caption is not None:
        page.get_by_role('textbox', name='Caption').fill(caption)
    page.click('#gd-ok')
    page.wait_for_function('!document.getElementById("gd-ok")', timeout=15000)
    page.wait_for_timeout(600)


def graph_insert(page):
    load_doc(page, DOC)
    h0 = page.evaluate('window.rikuy.hist.length')
    insert_graph(page)
    G = newest(page, 'function'); want = WANT.replace('graphs/function-1', G)
    check('graph: its name is its own (graphs/function- and four letters: two coauthors\' first graphs never meet in a merge)', bool(G), G)
    check('graph: Insert writes the \\rikuywidget block after the paragraph and \\usepackage{rikuy}', src(page) == want, src(page))
    check('graph: and its file, rikuy.sty and the picture, as one step', files(page) == [[G + '.html', 'main.tex', 'rikuy.sty'], [G + '.png']] and page.evaluate('window.rikuy.hist.length') == h0 + 1, files(page))
    html = src(page, G + '.html')
    check('graph: its file is a graph Rikuy reads back, with no request out', html.startswith('<!doctype html>') and 'id="rikuy-graph"' in html and not re.search(r'\b(src|href)\s*=', html.split('</script>', 1)[1]), html[:200])
    png = base64.b64decode(blob_b64(page, G + '.png') or '')
    check('graph: the picture is a PNG three times the text\'s width', png[:8] == b'\x89PNG\r\n\x1a\n' and int.from_bytes(png[16:20], 'big') > 1200, len(png))
    k = png.find(b'pHYs', 33, 200)
    check('graph: with its resolution written (pHYs, 288 dpi) and its mark (tEXt rikuy-graph): TeX takes its natural size as the page draws it (review H4, V2)', k > 0 and int.from_bytes(png[k + 4:k + 8], 'big') == 11339 and b'rikuy-graph\x00' + G.encode() + b'.html' in png[:400], png[33:120])
    page.wait_for_function('document.querySelectorAll("#wlayer iframe.rk-widget").length === 1', timeout=8000)
    check('graph: it runs on the page in a frame sandboxed to scripts alone', page.evaluate('document.querySelector("#wlayer iframe.rk-widget").getAttribute("sandbox")') == 'allow-scripts')
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(300)
    check('graph: one undo gives the source back byte for byte, the files and the picture gone', src(page) == DOC and files(page) == [['main.tex'], []], files(page))
    page.evaluate('window.rikuy.redo()'); page.wait_for_timeout(300)
    check('graph: redo brings them all again', src(page) == want and files(page)[1] == [G + '.png'] and src(page, G + '.html') == html)
    # a second graph takes the next names; rikuy.sty and the package are not written twice
    insert_graph(page, 'data', at=('Second', 1), caption='Data & more')
    s = src(page)
    D = newest(page, 'data')
    check('graph: a second one, a figure with its caption escaped and a \\label Cross-reference offers (review L6); no second package line', s.count('\\usepackage{rikuy}') == 1 and '\\begin{figure}[htbp]\n\\centering\n\\rikuywidget[width=\\linewidth]{%s.html}{%s.png}\n\\caption{Data \\& more}\n\\label{fig:%s}\n\\end{figure}' % (D, D, D[7:]) in s and files(page)[0].count('rikuy.sty') == 1, s)
    # from the insert list
    load_doc(page, DOC); click_text(page, 'Hello', 2)
    names = page.evaluate('window.rikuy.cmds.commands().filter((c) => c.palette).map((c) => c.palette.d)')
    check('graph: the insert list has it', any('Interactive graph' in n for n in names), names)


def graph_edit(page):
    load_doc(page, DOC)
    insert_graph(page)
    G = newest(page, 'function'); want = WANT.replace('graphs/function-1', G)
    page.evaluate('window.rikuy.graphRefresh()'); page.wait_for_timeout(300)
    before, png0 = src(page, G + '.html'), blob_b64(page, G + '.png')
    h0 = page.evaluate('window.rikuy.hist.length')
    page.evaluate('window.rikuy.runCommand("edit-graph")')
    page.wait_for_selector('#gd-ok')
    check('graph: Edit graph opens the dialog on it, its formula in the field', page.get_by_role('textbox', name='Formulas').input_value() == 'y = a sin(b x)' and page.inner_text('#gd-ok') == 'Update')
    page.click('#gd-ok'); page.wait_for_timeout(500)
    check('graph: Update with nothing changed writes nothing', page.evaluate('window.rikuy.hist.length') == h0 and src(page, G + '.html') == before)
    page.evaluate('(f) => window.rikuy.runCommand("edit-graph", { file: f })', G + '.html')
    page.wait_for_selector('#gd-ok')
    page.get_by_role('textbox', name='Formulas').fill('y = a sin(b x) + c')
    page.wait_for_timeout(400)
    check('graph: a new letter gets a slider of its own', page.get_by_role('textbox', name='Slider 3 name').input_value() == 'c')
    page.get_by_role('textbox', name='Slider 3 start').fill('0.5')
    page.click('#gd-ok'); page.wait_for_timeout(1200)
    after = src(page, G + '.html')
    check('graph: Update writes the file and the picture, the text untouched, one step', after != before and '"a sin(b x) + c"' in after and src(page) == want and blob_b64(page, G + '.png') != png0 and page.evaluate('window.rikuy.hist.length') == h0 + 1)
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(300)
    check('graph: one undo gives the file and the picture back byte for byte', src(page, G + '.html') == before and blob_b64(page, G + '.png') == png0)
    # a mistake is said where it is, and Update waits
    page.evaluate('window.rikuy.runCommand("edit-graph")'); page.wait_for_selector('#gd-ok')
    page.get_by_role('textbox', name='Formulas').fill('y = sin(x')
    page.wait_for_timeout(300)
    check('graph: a mistake in a formula is said and Update waits', 'not closed' in page.inner_text('.gd-err') and page.evaluate('document.getElementById("gd-ok").disabled'), page.inner_text('.gd-err'))
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    # hand written: the command's fallback is a .jpg; the graph gets a PNG and the command points at it
    html = before
    hand = '\\documentclass{article}\n\\usepackage{rikuy}\n\\begin{document}\nText.\n\n\\rikuywidget [ width=.8\\textwidth ] {figs/g.html} {figs/g.jpg} % mine\n\n% \\rikuywidget{figs/g.html}{figs/old.png}\n\\end{document}\n'
    load_doc(page, {'main.tex': hand, 'figs/g.html': html, 'rikuy.sty': '%'})
    page.evaluate('window.rikuy.runCommand("edit-graph")'); page.wait_for_selector('#gd-ok')
    page.get_by_role('textbox', name='Formulas').fill('y = a cos(b x)')
    page.wait_for_timeout(300)
    page.click('#gd-ok'); page.wait_for_timeout(1200)
    check('graph: a hand written command with a .jpg fallback is pointed at the new PNG, only that argument (the commented one left)', src(page) == hand.replace('{figs/g.jpg}', '{figs/g.png}') and 'figs/g.png' in files(page)[1], src(page))


def graph_kinds(page):
    """Each kind on the page, and its picture against the live figure at its starting values."""
    for kind in ('function', 'data', 'curve', 'dist'):
        load_doc(page, DOC)
        page.evaluate('window.rikuy.zoomTo ? window.rikuy.zoomTo(1, null) : 0')
        insert_graph(page, kind)
        page.wait_for_function('document.querySelectorAll("#wlayer iframe.rk-widget").length === 1', timeout=8000)
        page.wait_for_timeout(900)
        name = [n for n in files(page)[1] if ('distribution' if kind == 'dist' else kind) + '-' in n][-1]
        fr = page.frame_locator('#wlayer iframe.rk-widget')
        box = fr.locator('#rk-c').bounding_box()
        shot = base64.b64encode(page.screenshot(clip=box)).decode()
        # compared in the page (CI has no Pillow): both drawn on white at the screenshot's size,
        # softened by a pixel (a 1 px bar edge rasterised at another scale is no difference a
        # reader sees), the mean of the channels' differences
        diff = page.evaluate('''async ([shot, name]) => {
          const img = async (blob) => createImageBitmap(blob);
          const a = await img(await (await fetch('data:image/png;base64,' + shot)).blob()), b = await img(window.rikuy.assetBlobs.get(name));
          const draw = (bm) => { const c = new OffscreenCanvas(a.width, a.height), g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, a.width, a.height); g.filter = 'blur(1px)'; g.drawImage(bm, 0, 0, a.width, a.height); return g.getImageData(0, 0, a.width, a.height).data; };
          const x = draw(a), y = draw(b); let sum = 0;
          for (let i = 0; i < x.length; i += 4) sum += (Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2])) / 3;
          return sum / (x.length / 4); }''', [shot, name])
        check('graph %s: the PDF\'s picture is the live figure at its starting values (mean pixel difference %.2f)' % (kind, diff), diff < 6, diff)
        ok = fr.locator('#rk-e').is_hidden()
        check('graph %s: runs on the page without a message' % kind, ok)


def graph_hint_menu(page):
    load_doc(page, DOC)
    insert_graph(page)
    page.wait_for_selector('.w-hint', timeout=8000)
    check('graph: the first graph says once how it works', 'drag its sliders' in page.inner_text('.w-hint') and 'PDF prints this picture' in page.inner_text('.w-hint'))
    page.screenshot(path=os.path.join(SHOTS, 'page-hint.png'))
    page.click('.w-hint button'); page.wait_for_timeout(200)
    check('graph: Got it puts it away for good', page.locator('.w-hint').count() == 0 and page.evaluate('window.rikuy.prefs.graphHint') == 1)
    fr = page.frame_locator('#wlayer iframe.rk-widget')
    bb = page.locator('#wlayer iframe.rk-widget').bounding_box()
    page.mouse.move(bb['x'] - 30, bb['y'] + 40); page.mouse.move(bb['x'] + 60, bb['y'] + 40, steps=8)
    fr.locator('#rk-c').click(button='right', position={'x': 60, 'y': 40})
    page.wait_for_selector('[role=menu][aria-label="Graph menu"]', timeout=4000)
    check('graph: a right click in its frame opens Rikuy\'s menu with Edit graph', page.get_by_role('menuitem', name='Edit graph').count() == 1)
    page.get_by_role('menuitem', name='Edit graph').click(); page.wait_for_timeout(300)
    check('graph: and Edit graph there opens the dialog', page.locator('#gd-ok').count() == 1)
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    # a frame asking again and again opens one menu a second at most
    n = page.evaluate('''async () => { const w = document.querySelector('#wlayer iframe.rk-widget').contentWindow; let opened = 0;
      const mo = new MutationObserver(() => { if (document.querySelector('[aria-label="Graph menu"]')) opened++; }); mo.observe(document.body, { childList: true });
      for (let i = 0; i < 5; i++) window.dispatchEvent(new MessageEvent('message', { data: { rikuy: 'menu', x: 5, y: 5 }, source: w }));
      await new Promise((r) => setTimeout(r, 100)); mo.disconnect(); return opened; }''')
    check('graph: five menu requests with no press in the frame open no menu (review H2)', n == 0, n)
    # a graph asking all the time while one types on the page and in a dialog: nothing is taken
    page.evaluate('''() => { const w = document.querySelector('#wlayer iframe.rk-widget').contentWindow; window.__spam = setInterval(() => window.dispatchEvent(new MessageEvent('message', { data: { rikuy: 'menu', x: 10, y: 10 }, source: w })), 60); }''')
    click_text(page, 'Second para.', 12); page.keyboard.type(' The quick brown fox'); page.wait_for_timeout(300)
    page.evaluate('window.rikuy.runCommand("autocorrect-options")'); page.wait_for_selector('.pop-acopt')
    page.get_by_role('textbox', name='User name').type('Ada Lovelace'); page.wait_for_timeout(300)
    still = page.locator('.pop-acopt').count() == 1 and page.get_by_role('textbox', name='User name').input_value() == 'Ada Lovelace'
    page.evaluate('clearInterval(window.__spam)'); page.keyboard.press('Escape')
    check('graph: a frame asking every 60 ms takes no typed letter and closes no dialog (review H2)', 'Second para. The quick brown fox' in src(page) and still, src(page)[-80:])
    page.keyboard.press('Escape')
    # the Edit graph button over it, and the right click menu with the graph armed
    page.mouse.move(bb['x'] - 30, bb['y'] + 40); page.hover('#wlayer .wbox'); page.wait_for_timeout(200)
    check('graph: Edit graph shows over the graph', page.evaluate('getComputedStyle(document.querySelector(".w-edit")).opacity') == '1')
    page.click('.w-edit'); page.wait_for_timeout(300)
    check('graph: and opens the dialog', page.locator('#gd-ok').count() == 1)
    page.keyboard.press('Escape')
    page.reload(); page.wait_for_function('window.rikuy && document.getElementById("boot").hidden', timeout=20000); page.wait_for_timeout(1500)
    check('graph: after a reload the hint does not come back', page.locator('.w-hint').count() == 0 and page.evaluate('document.querySelectorAll("#wlayer iframe.rk-widget").length') == 1)


def graph_safety(page):
    load_doc(page, DOC); click_text(page, 'Hello', 2)
    page.evaluate('window.rikuy.runCommand("insert-interactive-graph")'); page.wait_for_selector('#gd-ok')
    check('graph: the dialog\'s preview is sandboxed as the page\'s widgets are', page.evaluate('document.querySelector(".gd-frame").getAttribute("sandbox")') == 'allow-scripts')
    page.get_by_role('textbox', name='x label').fill('</script><script>parent.document.title="pwned"</script>')
    page.get_by_role('textbox', name='Description').fill('<img src=x onerror=alert(1)>')
    page.wait_for_timeout(700)
    page.click('#gd-ok'); page.wait_for_timeout(1500)
    html = src(page, newest(page, 'function') + '.html')
    check('graph: a description cannot end its script element or reach the page', html.count('</script>') == 2 and page.evaluate('document.title') != 'pwned' and '<img src=x' not in html.split('<body>')[0].split('<title>')[1].split('</title>')[0], html[:400])
    reach = page.frame_locator('#wlayer iframe.rk-widget').locator('body').evaluate('''() => { const r = []; try { r.push(String(parent.document)); } catch (e) { r.push('blocked'); } try { r.push(String(localStorage.length)); } catch (e) { r.push('blocked'); } return r; }''')
    check('graph: its frame reaches neither the page nor storage', reach == ['blocked', 'blocked'], reach)


def graph_phones(p):
    for w, h in ((390, 844), (360, 740)):
        for dark in (False, True):
            browser, page, errors = open_page(p, w, h, dark=dark, touch=True)
            load_doc(page, DOC)
            click_text(page, 'Hello', 2)
            page.evaluate('window.rikuy.runCommand("insert-interactive-graph")'); page.wait_for_selector('#gd-ok'); page.wait_for_timeout(700)
            page.screenshot(path=os.path.join(SHOTS, 'dialog-%d%s.png' % (w, '-dark' if dark else '')))
            if dark:
                browser.close(); continue
            fit = page.evaluate('''() => { const d = document.querySelector('.pop-graph'), r = d.getBoundingClientRect(), f = document.querySelector('.gd-frame').getBoundingClientRect();
              const small = [...d.querySelectorAll('button, input, select, textarea')].filter((x) => x.offsetParent).map((x) => x.getBoundingClientRect()).filter((b) => b.height < 43.5 || b.width < 43.5).length;
              return { side: document.scrollingElement.scrollWidth > innerWidth, inside: r.left >= 0 && r.right <= innerWidth && f.right <= r.right, over: d.scrollWidth > d.clientWidth + 1, small }; }''')
            check('phone %d: the dialog fits, no sideways scroll, the preview inside it' % w, not fit['side'] and fit['inside'] and not fit['over'], fit)
            check('phone %d: every control of the dialog is 44 px each way' % w, fit['small'] == 0, fit)
            page.tap('#gd-ok'); page.wait_for_timeout(1500)
            page.wait_for_function('document.querySelectorAll("#wlayer iframe.rk-widget").length === 1', timeout=8000); page.wait_for_timeout(600)
            b = page.evaluate('(() => { const r = document.querySelector(".w-edit").getBoundingClientRect(); return [r.width, r.height, getComputedStyle(document.querySelector(".w-edit")).opacity]; })()')
            check('phone %d: Edit graph is shown, 44 px on the screen though the page is zoomed out' % w, b[0] >= 43.5 and b[1] >= 43.5 and b[2] == '1', b)
            fr = page.frame_locator('#wlayer iframe.rk-widget')
            sb = fr.locator('#rk-0').bounding_box()
            v0 = fr.locator('#rk-0').input_value()
            page.touchscreen.tap(sb['x'] + sb['width'] * 0.92, sb['y'] + sb['height'] / 2); page.wait_for_timeout(300)
            check('phone %d: a slider moves by a tap' % w, fr.locator('#rk-0').input_value() != v0, (v0, fr.locator('#rk-0').input_value()))
            check('phone %d: no sideways scroll on the page with the graph' % w, not page.evaluate('document.scrollingElement.scrollWidth > innerWidth'))
            page.screenshot(path=os.path.join(SHOTS, 'page-%d.png' % w))
            check('phone %d: no console errors' % w, not errors, errors[:3])
            browser.close()


def graph_compiles(page):
    if not os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        print('SKIP graphs compiled: no TeX tree in %s' % DIST)
        return
    load_doc(page, DOC)
    insert_graph(page, 'dist', caption='The mean of $n$ draws.')
    t = src(page)
    page.set_default_timeout(600000)
    for eng in ('pdflatex', 'xelatex', 'lualatex'):
        r = page.evaluate("""async (t) => { await window.rikuy.api.setSource(t); const r = await window.rikuy.api.compile();
          let s = ''; if (r.pdf) for (let i = 0; i < r.pdf.length; i += 8192) s += String.fromCharCode(...r.pdf.subarray(i, i + 8192));
          return { ok: r.ok, pages: r.pages, image: /\\/Subtype\\s*\\/Image/.test(s), w: (/\\/Width (\\d+)/.exec(s) || [])[1] }; }""", '% !TeX program = ' + eng + '\n' + t)
        check('graph: compiles on %s with its picture in the PDF' % eng, r['ok'] and r['pages'] == 1 and r['image'], r)
    page.set_default_timeout(30000)


def shots(p):
    for w, h in ((1920, 1080), (1366, 860)):
        for dark in (False, True):
            browser, page, errors = open_page(p, w, h, dark=dark)
            load_doc(page, DOC); click_text(page, 'Hello', 2)
            page.evaluate('window.rikuy.runCommand("insert-interactive-graph", { template: "dist" })'); page.wait_for_selector('#gd-ok'); page.wait_for_timeout(900)
            page.screenshot(path=os.path.join(SHOTS, 'dialog-%d%s.png' % (w, '-dark' if dark else '')))
            browser.close()


def run():
    with sync_playwright() as p:
        fns = [graph_insert, graph_edit, graph_kinds, graph_hint_menu, graph_safety, graph_compiles] + [f for f in EXTRA]
        want = sys.argv[1:]
        for fn in fns:
            if want and fn.__name__ not in want:
                continue
            browser, page, errors = open_page(p, 1400, 1000)
            try:
                fn(page)
            except Exception as e:
                check('%s runs to its end' % fn.__name__, False, repr(e)[:300])
            check('no console errors (%s)' % fn.__name__, not [e for e in errors if 'tree.wasm' not in e and 'TeX' not in e], errors[:4])
            browser.close()
        for fn in (graph_phones, shots, r3_phones):
            if not want or fn.__name__ in want:
                try:
                    fn(p)
                except Exception as e:
                    check('%s runs to its end' % fn.__name__, False, repr(e)[:300])
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    return 1 if bad else 0


W = lambda body: '\\documentclass{article}\n\\begin{document}\n' + body + '\n\\end{document}\n'


def clipboard(page):
    page.context.grant_permissions(['clipboard-read', 'clipboard-write'], origin='https://rikuy.test')
    load_doc(page, W('Alpha \\textbf{beta} gamma.\n\nDelta.'))
    check('clipboard: the search box finds Paste and its options', all(page.evaluate('(n) => window.rikuy.cmds.commands().some((c) => c.name === n)', n) for n in ('Paste', 'Keep Text Only', 'Paste as LaTeX source', 'Paste Special')))
    select_text(page, 'gamma'); page.keyboard.press('Control+c'); click_text(page, 'Delta', 5); page.keyboard.press('Control+v'); page.wait_for_timeout(300)
    by_keys = src(page)
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
    select_text(page, 'gamma')
    page.evaluate('window.rikuy.runCommand("copy")'); page.wait_for_timeout(200)
    click_text(page, 'Delta', 5)
    page.evaluate('window.rikuy.runCommand("paste")'); page.wait_for_timeout(500)
    check('clipboard: Copy then Paste, the commands, do what Ctrl+C and Ctrl+V do', src(page) == by_keys and 'Deltagamma' in by_keys, (src(page), by_keys))
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
    select_text(page, 'gamma')
    page.evaluate('window.rikuy.runCommand("cut")'); page.wait_for_timeout(300)
    check('clipboard: Cut takes the words out', 'gamma' not in src(page), src(page))
    page.evaluate('navigator.clipboard.writeText("$x_1$ & 50%")'); click_text(page, 'Delta', 0)
    page.evaluate('window.rikuy.runCommand("paste-text")'); page.wait_for_timeout(400)
    check('clipboard: Keep Text Only escapes it as typing would', '\\$x\\_1\\$ \\& 50\\%Delta' in src(page), src(page))
    page.evaluate('window.rikuy.undo()'); click_text(page, 'Delta', 0)
    page.evaluate('window.rikuy.runCommand("paste-latex")'); page.wait_for_timeout(400)
    check('clipboard: As LaTeX source writes it as it is, one undo', '$x_1$ & 50%Delta' in src(page), src(page))
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(150)
    click_text(page, 'Delta', 0)
    page.evaluate('window.rikuy.runCommand("paste-special")'); page.wait_for_selector('[role=dialog] .ps-list')
    page.get_by_role('radio', name='LaTeX source').check(); page.get_by_role('button', name='OK').click(); page.wait_for_timeout(400)
    check('clipboard: Paste Special, LaTeX source', '$x_1$ & 50%Delta' in src(page), src(page))


def once(page, doc, at, cmd, want, label):
    load_doc(page, doc); click_text(page, *at)
    h0 = page.evaluate('window.rikuy.hist.length')
    page.evaluate('(c) => window.rikuy.runCommand(c)', cmd); page.wait_for_timeout(200)
    check(label + ': writes exactly that, one step', src(page) == want and page.evaluate('window.rikuy.hist.length') == h0 + 1, src(page))
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(150)
    check(label + ': one undo gives the source back byte for byte', src(page) == doc, src(page))


def symbols(page):
    D = W('One two.')
    once(page, D, ('two', 0), 'insert-copyright', W('One \\copyright{}two.'), 'Copyright')
    once(page, D, ('two', 0), 'insert-nb-hyphen', '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nOne \\nobreakdash-two.\n\\end{document}\n', 'Nonbreaking hyphen with amsmath')
    load_doc(page, W('a-b.')); click_text(page, 'a-b', 2)
    page.keyboard.press('Control+Alt+-'); page.wait_for_timeout(200)
    check('symbols: Ctrl+Alt+- after a hyphen writes {}--- (no four hyphens)', src(page) == W('a-{}---b.'), src(page))
    load_doc(page, D); click_text(page, 'two', 0)
    page.keyboard.press('Control+Shift+Space'); page.keyboard.press('Control+Alt+T'); page.keyboard.press('Control+Alt+.'); page.wait_for_timeout(200)
    check('symbols: Ctrl+Shift+Space, Ctrl+Alt+T, Ctrl+Alt+. write ~, \\texttrademark{}, \\ldots{}', src(page) == W('One ~\\texttrademark{}\\ldots{}two.'), src(page))
    load_doc(page, D); click_text(page, 'two', 0)
    page.get_by_role('tab', name='Insert').click()
    page.locator('#rc-symbol').click(); page.wait_for_timeout(200)
    page.get_by_role('menuitemradio', name='Euro sign').click(); page.wait_for_timeout(200)
    check('symbols: the Symbol grid writes \\texteuro{}, and puts it first next time', src(page) == W('One \\texteuro{}two.') and page.evaluate('window.rikuy.prefs.symRecent[0]') == '\\texteuro{}', src(page))
    page.evaluate('window.rikuy.runCommand("more-symbols")'); page.wait_for_selector('.sym-grid')
    page.get_by_role('searchbox', name='Search symbols').fill('degree')
    check('symbols: More Symbols searches by name', page.locator('.sym-grid .sym-b').count() == 1)
    page.get_by_role('tab', name='Special Characters').click()
    check('symbols: Special Characters says each one\'s keys', 'Ctrl+Alt+-' in page.inner_text('.sym-special'))
    page.keyboard.press('Escape')


def date_latex(page):
    once(page, W('Due on.'), ('on', 2), 'insert-date', W('Due on\\today{}.'), 'Date: \\today')
    load_doc(page, W('Para.')); click_text(page, 'Para', 2)
    page.keyboard.press('Alt+Shift+D'); page.wait_for_timeout(200)
    check('date: Alt+Shift+D writes \\today{}', src(page) == W('Pa\\today{}ra.'), src(page))
    load_doc(page, W('Para.')); click_text(page, 'Para', 4)
    page.evaluate('window.rikuy.runCommand("insert-env-center")'); page.wait_for_timeout(200)
    check('LaTeX: Environment, Centered, a center environment after it', '\\begin{center}' in src(page) and '\\end{center}' in src(page), src(page))
    page.get_by_role('tab', name='Insert').click()
    check('Insert: the tab has Interactive graph and Symbol; Date & Time and Environment are found by the search box', all(page.get_by_role('tabpanel', name='Insert').get_by_role('button', name=n, exact=True).count() == 1 for n in ('Interactive graph', 'Symbol')) and all(page.evaluate('(n) => window.rikuy.cmds.commands().some((c) => c.name === n)', n) for n in ('Date & Time', 'Environment')))
    # the right click menu has the paste options
    select_text(page, 'Para')
    page.evaluate('window.rikuy.openContextMenu(100, 100)'); page.wait_for_timeout(200)
    names = page.evaluate('[...document.querySelectorAll("[aria-label=\\"Context menu\\"] [role=menuitem]")].map((x) => x.getAttribute("aria-label"))')
    check('clipboard: the right click menu has Cut, Copy and Paste', all(n in names for n in ('Cut', 'Copy', 'Paste')), names)
    page.keyboard.press('Escape')


def autocorrect(page):
    load_doc(page, W('Start here.'))
    click_text(page, 'here', 4)
    page.keyboard.type(' (c)'); page.wait_for_timeout(200)
    check('AutoCorrect: (c) becomes \\copyright{} as ) is typed', src(page) == W('Start here \\copyright{}.'), src(page))
    page.keyboard.press('Control+z'); page.wait_for_timeout(200)
    check('AutoCorrect: one undo gives back (c) as typed', src(page) == W('Start here (c).'), src(page))
    load_doc(page, W('Start here.')); click_text(page, 'here', 5)
    page.keyboard.type(' see https://rikuy.rackebrandt.pe now'); page.wait_for_timeout(200)
    check('AutoCorrect: an address then a space becomes \\url{}', '\\url{https://rikuy.rackebrandt.pe} now' in src(page), src(page))
    page.keyboard.type(' it works. then '); page.wait_for_timeout(200)
    check('AutoCorrect: a sentence starts with a capital', 'works. Then ' in src(page), src(page))
    load_doc(page, W('Start.\n\nEnd.')); click_text(page, 'Start.', 6)
    page.keyboard.press('Enter'); page.keyboard.type('---'); page.keyboard.press('Enter'); page.wait_for_timeout(300)
    check('AutoCorrect: --- then Enter is a rule across the text', '\\noindent\\rule{\\linewidth}{0.4pt}' in src(page), src(page))
    page.evaluate('window.rikuy.runCommand("autocorrect-options")'); page.wait_for_selector('.pop-acopt')
    page.get_by_role('checkbox', name='Internet addresses as links (\\url)').uncheck()
    page.get_by_role('textbox', name='User name').fill('Ada'); page.get_by_role('textbox', name='User name').press('Tab')
    check('AutoCorrect Options: a switch and the user name are kept', page.evaluate('window.rikuy.prefs.autocorrect.links') is False and page.evaluate('window.rikuy.prefs.who') == 'Ada')
    page.keyboard.press('Escape')
    load_doc(page, W('Start here.')); click_text(page, 'here', 5)
    page.keyboard.type(' https://x.org '); page.wait_for_timeout(200)
    check('AutoCorrect: switched off, an address stays as typed', '\\url' not in src(page), src(page))


def files_in(page):
    load_doc(page, W('Para.')); click_text(page, 'Para', 2)
    tex = os.path.join(SHOTS, 'chapter one.tex'); open(tex, 'w').write('Chapter text.\n')
    with page.expect_file_chooser() as fc:
        page.evaluate('window.rikuy.runCommand("text-from-file")')
    fc.value.set_files(tex); page.wait_for_timeout(500)
    check('Text from file: the file joins the project and \\input reads it, one step', src(page) == W('Para.\n\n\\input{chapter-one}\n') and src(page, 'chapter-one.tex') == 'Chapter text.\n', src(page))
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
    check('Text from file: one undo takes both out', src(page) == W('Para.') and 'chapter-one.tex' not in files(page)[0])
    pdf = os.path.join(SHOTS, 'scan.pdf'); open(pdf, 'wb').write(b'%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n')
    click_text(page, 'Para', 2)
    with page.expect_file_chooser() as fc:
        page.evaluate('window.rikuy.runCommand("insert-pdf")')
    fc.value.set_files(pdf); page.wait_for_timeout(500)
    check('PDF pages: \\includepdf with pdfpages and the file, one step', '\\usepackage{pdfpages}' in src(page) and '\\includepdf[pages=-]{scan.pdf}' in src(page) and 'scan.pdf' in files(page)[1], src(page))
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
    check('PDF pages: one undo takes the text and the file out', src(page) == W('Para.') and 'scan.pdf' not in files(page)[1])


def review(page):
    """The hostile review of a228b19, each finding's case (H3, H5 in node, H6, H7, M1, M3, M4, L1 in
    the phones, L2, L3, L4, L8, L10 in node); what TeX judges is in review_compiles."""
    page.context.grant_permissions(['clipboard-read', 'clipboard-write'], origin='https://rikuy.test')
    # H3: the picture at its own box's width, in a column
    load_doc(page, '\\documentclass[twocolumn]{article}\n\\begin{document}\nHello world.\n\nSecond para.\n\\end{document}\n')
    insert_graph(page)
    G = newest(page, 'function')
    page.wait_for_function('document.querySelectorAll("#wlayer iframe.rk-widget").length === 1', timeout=8000); page.wait_for_timeout(500)
    page.evaluate('window.rikuy.graphRefresh()'); page.wait_for_timeout(800)
    w = page.evaluate('''async (n) => { const app = window.rikuy, box = [...document.querySelectorAll('.w-live')].find((b) => b.dataset.wf === n + '.html');
      const a = new Uint8Array(await app.assetBlobs.get(n + '.png').arrayBuffer()); return [box.getBoundingClientRect().width / app.widgets.host.scale(), new DataView(a.buffer).getUint32(16) / 3]; }''', G)
    check('review H3: in two columns the picture is drawn at the column\'s width, as the live figure', abs(w[0] - w[1]) < 3, w)
    # M1: a picture gone (a share link has none) is drawn again
    page.evaluate('(n) => window.rikuy.setAsset(n + ".png", null)', G)
    page.evaluate('window.rikuy.graphRefresh()'); page.wait_for_timeout(800)
    check('review M1: a graph\'s missing picture is drawn again', page.evaluate('(n) => window.rikuy.assetBlobs.has(n + ".png")', G))
    # H7: a rikuy.sty in another folder is not the one TeX reads
    load_doc(page, {'main.tex': DOC, 'old/rikuy.sty': '% old'})
    insert_graph(page)
    check('review H7: rikuy.sty is written beside the main file though old/rikuy.sty exists', 'rikuy.sty' in files(page)[0], files(page)[0])
    size = len(src(page, newest(page, 'function') + '.html').encode())
    check('review L7: a graph\'s file in the built page holds graphKit minified, under 36 KB (%d bytes)' % size, size < 36000, size)
    # M3: a hand written graph's own shape and exact range: Update with nothing touched writes nothing
    html = src(page, newest(page, 'function') + '.html').replace('"aspect": 0.5', '"aspect": 0.6')
    hand = '\\documentclass{article}\n\\usepackage{rikuy}\n\\begin{document}\nText.\n\n\\rikuywidget{plot.html}{plot.png}\n\\end{document}\n'
    load_doc(page, {'main.tex': hand, 'plot.html': html.replace('"kind": "function"', '"kind": "curve"'), 'rikuy.sty': '%'})
    h0 = page.evaluate('window.rikuy.hist.length')
    page.evaluate('window.rikuy.runCommand("edit-graph")'); page.wait_for_selector('#gd-ok'); page.wait_for_timeout(300)
    page.click('#gd-ok'); page.wait_for_timeout(600)
    check('review M3: Update with nothing touched on a hand written graph (its own shape, 2π exact) writes nothing', page.evaluate('window.rikuy.hist.length') == h0, page.evaluate('window.rikuy.hist.length') - h0)
    # H6: Text from file with a whole document: its body, its packages here
    load_doc(page, W('Para.')); click_text(page, 'Para', 2)
    tex = os.path.join(SHOTS, 'whole.tex'); open(tex, 'w').write('\\documentclass{article}\n\\usepackage{amssymb}\n\\begin{document}\nChapter text $\\mathbb{R}$.\n\\end{document}\n')
    with page.expect_file_chooser() as fc:
        page.evaluate('window.rikuy.runCommand("text-from-file")')
    fc.value.set_files(tex); page.wait_for_timeout(500)
    check('review H6: a whole document comes in as its body, its packages in this preamble', src(page, 'whole.tex') == 'Chapter text $\\mathbb{R}$.\n' and '\\usepackage{amssymb}' in src(page), (src(page), src(page, 'whole.tex')))
    # L2: Paste Special over a selection replaces it
    load_doc(page, W('One two three.'))
    page.evaluate('navigator.clipboard.writeText("$x$")')
    select_text(page, 'two')
    page.evaluate('window.rikuy.runCommand("paste-special")'); page.wait_for_selector('.ps-list')
    page.get_by_role('radio', name='LaTeX source').check(); page.get_by_role('button', name='OK').click(); page.wait_for_timeout(400)
    check('review L2: Paste Special replaces the selection', src(page) == W('One $x$ three.'), src(page))
    # L3: a Mac keeps Option+Shift+D and T for their characters
    check('review L3: on a Mac, Date and Time are Control+Shift+D and T', page.evaluate('[window.rikuy.cmds.command("insert-date").mac, window.rikuy.cmds.command("insert-time").mac]') == [{'Alt+Shift+D': 'Control+Shift+D'}, {'Alt+Shift+T': 'Control+Shift+T'}])
    # L4: one's own replacement escaped as typing escapes it
    page.evaluate('window.rikuy.runCommand("autocorrect-options")'); page.wait_for_selector('.pop-acopt')
    page.get_by_role('textbox', name='Replace').fill('apx'); page.get_by_role('textbox', name='With', exact=True).fill('~5 ^ \\'); page.get_by_role('button', name='Add', exact=True).click()
    page.keyboard.press('Escape')
    got = page.evaluate('window.rikuy.prefs.acList[0]')
    check('review L4: one\'s own replacement is escaped as typing escapes it', got[1] == '\\textasciitilde{}5 \\textasciicircum{} \\textbackslash{}', got)
    # M4: a correction undone becomes an exception
    load_doc(page, W('Start here.')); click_text(page, 'here', 5)
    page.keyboard.type(' THis '); page.wait_for_timeout(200)
    page.keyboard.press('Control+z'); page.wait_for_timeout(200)
    page.keyboard.type('x'); page.wait_for_timeout(200)
    check('review M4: TWo INitial CApitals undone: that word is an exception from then on', 'THis' in (page.evaluate('window.rikuy.prefs.acExcept') or []), page.evaluate('window.rikuy.prefs.acExcept'))
    # L8: no Abstract where the class has none; align* brings amsmath
    load_doc(page, '\\documentclass{book}\n\\begin{document}\nPara.\n\\end{document}\n'); click_text(page, 'Para', 2)
    items = [x and x.get('name') for x in page.evaluate('window.rikuy.cmds.command("insert-environment").menuItems(window.rikuy)')]
    check('review L8: a book\'s Environment menu has no Abstract', 'Abstract' not in items and 'Centered' in items, items)
    page.evaluate('window.rikuy.runCommand("insert-env-other")'); page.wait_for_selector('.pop-env')
    page.get_by_role('textbox', name='Environment name').fill('align*'); page.keyboard.press('Enter'); page.wait_for_timeout(400)
    check('review L8: Other environment align* brings amsmath, one undo', '\\usepackage{amsmath}' in src(page) and '\\begin{align*}' in src(page), src(page))
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
    check('review L8: and one undo takes both out', src(page) == '\\documentclass{book}\n\\begin{document}\nPara.\n\\end{document}\n', src(page))


def verify(page):
    """The verification of d107908: V1 (a frame focusing itself), V2 (one's own PNG), V4 (a width option)."""
    # V1, hostile: a graph whose script calls focus() (an input's, the window's, a contentEditable's)
    # every 10 ms and asks for the menu, while one types fast on the page; again with the CPU 6
    # times slower (CI's runner lost a key to the frame between its focus() and a check after it)
    load_doc(page, DOC); insert_graph(page)
    G = newest(page, 'function')
    evil = src(page, G + '.html').replace('</body>', '<div contenteditable id="ce">x</div><label for="lb">l</label><input id="lb"><dialog id="dg"><input></dialog><script>let k = 0; setInterval(() => { k++; const i = document.querySelector("input"); if (i) i.focus(); window.focus(); self.focus(); document.getElementById("ce").focus(); document.querySelector("label").click(); try { getSelection().collapse(document.getElementById("ce"), 0); } catch (e) {} if (k % 50 === 0) { try { const d = document.getElementById("dg"); d.close(); d.show(); } catch (e) {} } parent.postMessage({ rikuy: "menu", x: 10, y: 10 }, "*"); }, 10);</script></body>')
    cdp = page.context.new_cdp_session(page)
    for rate in (1, 6):
        load_doc(page, {'main.tex': DOC.replace('Second para.', '\\rikuywidget[width=\\linewidth]{%s.html}{%s.png}\n\nSecond para.' % (G, G)).replace('\\begin{document}', '\\usepackage{rikuy}\n\\begin{document}'), G + '.html': evil, 'rikuy.sty': '%'})
        page.wait_for_function('document.querySelectorAll("#wlayer iframe.rk-widget").length === 1', timeout=8000); page.wait_for_timeout(800)
        cdp.send('Emulation.setCPUThrottlingRate', {'rate': rate})
        click_text(page, 'Second para.', 12)
        page.keyboard.type(' One two three four five six seven eight nine ten.', delay=15)
        page.wait_for_timeout(800 * rate)
        cdp.send('Emulation.setCPUThrottlingRate', {'rate': 1})
        check('verify V1 (CPU %dx): a frame calling focus() every 10 ms takes no letter of fast typing and opens no menu' % rate,
              'Second para. One two three four five six seven eight nine ten.' in src(page) and page.locator('[aria-label="Graph menu"]').count() == 0, src(page)[-90:])
    # V2: one's own picture under a graph's name, or named by its command, is never drawn over
    photo = page.evaluate('''async () => { const c = new OffscreenCanvas(90, 60), g = c.getContext('2d'); g.fillStyle = '#c00'; g.fillRect(0, 0, 90, 60); const b = await c.convertToBlob({ type: 'image/png' }); return Array.from(new Uint8Array(await b.arrayBuffer())); }''')
    html = src(page, G + '.html')
    for fb in ('figures/photo.png', G + '.png'):
        load_doc(page, {'main.tex': '\\documentclass{article}\n\\usepackage{rikuy}\n\\begin{document}\n\\includegraphics{figures/photo.png}\n\n\\rikuywidget[width=\\linewidth]{%s.html}{%s}\n\\end{document}\n' % (G, fb), G + '.html': html, 'rikuy.sty': '%'})
        page.evaluate('([n, a]) => window.rikuy.setAsset(n, new Blob([new Uint8Array(a)], { type: "image/png" }))', [fb, photo])
        page.evaluate('window.rikuy.graphRefresh()'); page.wait_for_timeout(800)
        kept = page.evaluate('async (n) => Array.from(new Uint8Array(await window.rikuy.assetBlobs.get(n).arrayBuffer()))', fb)
        check('verify V2: one\'s own picture named %s is left as it is' % fb, kept == photo, len(kept))
    # V4: a width option sizes the live figure, and so its picture
    load_doc(page, {'main.tex': '\\documentclass{article}\n\\usepackage{rikuy}\n\\begin{document}\nText.\n\n\\begin{center}\n\\rikuywidget[width=0.5\\linewidth]{%s.html}{%s.png}\n\\end{center}\n\\end{document}\n' % (G, G), G + '.html': html, 'rikuy.sty': '%'})
    page.evaluate('(n) => window.rikuy.setAsset(n + ".png", null)', G)
    page.wait_for_function('document.querySelectorAll("#wlayer iframe.rk-widget").length === 1', timeout=8000); page.wait_for_timeout(600)
    page.evaluate('window.rikuy.graphRefresh()'); page.wait_for_timeout(800)
    w = page.evaluate('''async (n) => { const app = window.rikuy, k = app.widgets.host.scale(), box = document.querySelector('.w-live'), line = box.parentElement.getBoundingClientRect().width;
      const a = new Uint8Array(await app.assetBlobs.get(n + '.png').arrayBuffer()); return [box.getBoundingClientRect().width / line, box.getBoundingClientRect().width / k, new DataView(a.buffer).getUint32(16) / 3]; }''', G)
    check('verify V4: width=0.5\\linewidth: the live figure is half the line, its picture drawn at that width', abs(w[0] - 0.5) < 0.03 and abs(w[1] - w[2]) < 3, w)


def review_compiles(page):
    """What TeX judges in the review (H1, H4, H6, M1): each compiled in the page."""
    if not os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        print('SKIP the review\'s compiles: no TeX tree in %s' % DIST)
        return
    page.set_default_timeout(600000)
    comp = lambda: page.evaluate('''async () => { const r = await window.rikuy.api.compile(); return { ok: r.ok, pages: r.pages, errors: (window.rikuy.api.problems ? window.rikuy.api.problems() : []).filter((p) => p.severity === 'error').map((p) => p.message || p.text).slice(0, 3) }; }''')
    # H1: an address typed in a plain article
    load_doc(page, W('Start here.')); click_text(page, 'here.', 5)
    page.keyboard.type(' See www.example.org for more. '); page.wait_for_timeout(300)
    r = comp()
    check('review H1: an address typed becomes \\url with \\usepackage{url}, and it compiles', '\\usepackage{url}' in src(page) and '\\url{https://www.example.org}' in src(page) and r['ok'], (src(page), r))
    # H4 and M1: a hand written command with no width, Edit graph, its picture missing at first
    load_doc(page, DOC); insert_graph(page)
    html = src(page, newest(page, 'function') + '.html')
    hand = '\\documentclass{article}\n\\usepackage{rikuy}\n\\begin{document}\nText.\n\n\\rikuywidget{plot.html}{plot.png}\n\\end{document}\n'
    load_doc(page, {'main.tex': hand, 'plot.html': html, 'rikuy.sty': open(os.path.join(ROOT, 'sample', 'widget', 'rikuy.sty')).read()})
    page.evaluate('window.rikuy.runCommand("edit-graph")'); page.wait_for_selector('#gd-ok')
    page.get_by_role('textbox', name='Formulas').fill('y = a cos(b x)'); page.wait_for_timeout(300); page.click('#gd-ok'); page.wait_for_timeout(1200)
    r = comp()
    check('review H4: a command with no width prints the picture at the text\'s width: one page, no overfull line', r['ok'] and r['pages'] == 1, r)
    page.evaluate('window.rikuy.setAsset("plot.png", null)')
    # (a change to the text, so TeX runs again: an unchanged text keeps the PDF it has)
    click_text(page, 'Text.', 4); page.keyboard.type('s'); page.wait_for_timeout(300)
    r = comp()
    check('review M1: with its picture gone, the compile draws it again first', r['ok'] and page.evaluate('window.rikuy.assetBlobs.has("plot.png")'), r)
    # H6: a whole document read in by Text from file compiles
    load_doc(page, W('Para.')); click_text(page, 'Para', 2)
    tex = os.path.join(SHOTS, 'whole2.tex'); open(tex, 'w').write('\\documentclass{article}\n\\usepackage{amssymb}\n\\begin{document}\nChapter $\\mathbb{R}$.\n\\end{document}\n')
    with page.expect_file_chooser() as fc:
        page.evaluate('window.rikuy.runCommand("text-from-file")')
    fc.value.set_files(tex); page.wait_for_timeout(500)
    r = comp()
    check('review H6: and the document compiles', r['ok'] and r['pages'] == 1, r)
    # V3: a whole document with its own definitions (\\newcommand, \\newtheorem) compiles too
    load_doc(page, W('Para.')); click_text(page, 'Para', 2)
    tex = os.path.join(SHOTS, 'defs.tex'); open(tex, 'w').write('\\documentclass{article}\n\\usepackage{amssymb,amsthm}\n\\newcommand{\\R}{\\mathbb{R}}\n\\newtheorem{theorem}{Theorem}\n\\DeclareMathOperator{\\Var}{Var}\n\\begin{document}\n\\begin{theorem}\nFor $x \\in \\R$, $\\Var x \\ge 0$.\n\\end{theorem}\n\\end{document}\n')
    with page.expect_file_chooser() as fc:
        page.evaluate('window.rikuy.runCommand("text-from-file")')
    fc.value.set_files(tex); page.wait_for_timeout(500)
    r = comp()
    check('verify V3: a whole document with its own \\newcommand, \\newtheorem and \\DeclareMathOperator compiles', r['ok'] and r['pages'] == 1 and '\\newtheorem{theorem}{Theorem}' in src(page, 'defs.tex'), (r, src(page, 'defs.tex')[:200]))
    page.set_default_timeout(30000)


# ---- R3: Cover Page, Quick Parts, Document Property and Field, form fields, drag to move ----------------
R3DOC = '\\documentclass{article}\n\\title{Report}\n\\author{Ann}\n\\begin{document}\n\\maketitle\nHello world.\n\nSecond para.\n\\end{document}\n'
run_cmd = lambda page, cid, args=None: page.evaluate('([c, a]) => window.rikuy.runCommand(c, a)', [cid, args])
hist = lambda page: page.evaluate('window.rikuy.hist.length')


def one_step(page, doc, at, fn, label, test, back=True):
    """fn on doc with the caret at at: test(source) holds, one step of history, one undo gives doc back."""
    load_doc(page, doc); click_text(page, *at)
    h0 = hist(page)
    fn(page); page.wait_for_timeout(250)
    got = src(page)
    ok = check(label + ': written, one step', test(got) and hist(page) == h0 + 1, got[-300:])
    if back:
        page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(150)
        ok = check(label + ': one undo gives the source back byte for byte', src(page) == doc, src(page)[-200:]) and ok
    return got


def r3_fields(page):
    """Insert › Quick Parts › Field and Document Property (I32, I33): each as the LaTeX that prints it,
    its package once, drawn on the page as TeX prints it (the page's number, the pages' count)."""
    D = R3DOC
    want = {'PAGE': ('Hello\\thepage{} world.', None), 'NUMPAGES': ('Hello\\pageref{LastPage} world.', 'lastpage'), 'SECTION': ('Hello\\thesection{} world.', None),
            'DATE': ('Hello\\today{} world.', None), 'TIME': ('Hello\\thistime{} world.', 'scrtime'), 'FILENAME': ('Hello\\jobname{} world.', None),
            'TITLE': ('Hello\\thetitle{} world.', 'titling'), 'AUTHOR': ('Hello\\theauthor{} world.', 'titling'), 'CREATEDATE': ('Hello\\today{} world.', None)}
    for fid, (txt, pk) in want.items():
        one_step(page, D, ('Hello', 5), lambda pg: run_cmd(pg, 'insert-field', {'field': fid}), 'Field ' + fid,
                 lambda g: txt in g and (pk is None and g.count('\\usepackage') == 0 or pk is not None and g.count('\\usepackage{' + pk + '}') == 1) and g.replace(txt, 'Hello world.').replace('\\usepackage{%s}\n' % pk, '') == D)
    # the page draws them: the page each is on, the pages' count, the title
    load_doc(page, D.replace('Hello world.', 'Hello \\thepage{} \\thetitle{}.').replace('Second para.', '\\newpage\nSecond \\thepage{} of \\pageref{LastPage}.').replace('\\title', '\\usepackage{titling,lastpage}\n\\title'))
    page.wait_for_timeout(400)
    drawn = page.evaluate("[...document.querySelectorAll('#pages .a-chip')].map((x) => x.textContent)")
    check('fields drawn as TeX prints them: page 1, the title, page 2 of 2', drawn == ['1', 'Report', '2', '2'], drawn)
    # a document property the document has not: said, nothing written
    load_doc(page, W('Hello world.')); click_text(page, 'Hello', 5)
    run_cmd(page, 'insert-field', {'field': 'TITLE'}); page.wait_for_timeout(200)
    check('Title in a document with no \\title: nothing written, the toast says where to set it', src(page) == W('Hello world.') and 'File' in page.evaluate("document.getElementById('toast').textContent"))
    # beamer has its own: \inserttitle, no package
    bd = '\\documentclass{beamer}\n\\title{Talk}\n\\begin{document}\n\\begin{frame}\nHello world.\n\\end{frame}\n\\end{document}\n'
    one_step(page, bd, ('Hello', 5), lambda pg: run_cmd(pg, 'insert-field', {'field': 'TITLE'}), 'Title in beamer', lambda g: g == bd.replace('Hello world.', 'Hello\\inserttitle{} world.'))
    # the Field dialog: NumPages picked, OK
    load_doc(page, D); click_text(page, 'Hello', 5)
    run_cmd(page, 'insert-field'); page.wait_for_timeout(200)
    page.get_by_role('radio', name='NumPages', exact=True).check(); page.get_by_role('button', name='OK', exact=True).click(); page.wait_for_timeout(250)
    check('the Field dialog: NumPages, OK writes \\pageref{LastPage} at the caret and lastpage once', 'Hello\\pageref{LastPage} world.' in src(page) and src(page).count('\\usepackage{lastpage}') == 1, src(page)[:200])


def r3_quickparts(page):
    """Quick Parts (I31): a selection kept with its formatting, put in again in another document with the
    packages its commands need, one step; a part of paragraphs after the caret's paragraph; the gallery,
    the organizer; a stranger's storage read with caps."""
    A = '\\documentclass{article}\n\\usepackage{xcolor}\n\\begin{document}\nKind \\textcolor{red}{regards}, Ann.\n\nOther.\n\\end{document}\n'
    load_doc(page, A)
    place_sel(page, ('Kind', 'regards'))
    run_cmd(page, 'quick-part-save', {'name': 'Closing'}); page.wait_for_timeout(150)
    parts = page.evaluate('window.rikuy.prefs.quickParts')
    check('Save Selection to Quick Part Gallery: the words with the colour round them, under its name', parts == [{'name': 'Closing', 'tex': 'Kind \\textcolor{red}{regards}'}], parts)
    B = W('Hello world.\n\nSecond para.')
    one_step(page, B, ('world', 5), lambda pg: run_cmd(pg, 'quick-part-insert', {'name': 'Closing'}), 'a Quick Part put in another document',
             lambda g: 'Hello worldKind \\textcolor{red}{regards}.' in g and g.count('\\usepackage{xcolor}') == 1)
    # a part of paragraphs goes after the caret's paragraph
    page.evaluate("window.rikuy.prefs.quickParts = [{ name: 'Two', tex: 'First kept.\\n\\nSecond kept.' }, ...window.rikuy.prefs.quickParts]; window.rikuy.savePrefs()")
    one_step(page, B, ('Hello', 2), lambda pg: run_cmd(pg, 'quick-part-insert', {'name': 'Two'}), 'a Quick Part of two paragraphs', lambda g: g == B.replace('Hello world.\n', 'Hello world.\n\nFirst kept.\n\nSecond kept.\n'))
    # the gallery lists them, then Document Property and Field
    load_doc(page, B); click_text(page, 'Hello', 2)
    page.get_by_role('tab', name='Insert', exact=True).click(); page.wait_for_timeout(150)
    page.get_by_role('button', name='Quick Parts', exact=True).click(); page.wait_for_timeout(200)
    items = page.evaluate("[...document.querySelectorAll('.pop [role^=menuitem]')].map((x) => x.getAttribute('aria-label'))")
    check('the Quick Parts menu: the parts, Title, Author, Date, Field…, the organizer, Save Selection', items[:2] == ['Two', 'Closing'] and 'Field…' in items and 'Save Selection to Quick Part Gallery…' in items, items)
    page.keyboard.press('Escape'); page.wait_for_timeout(100)
    # the organizer renames and deletes
    run_cmd(page, 'building-blocks'); page.wait_for_timeout(200)
    page.get_by_role('textbox', name='Name of Two', exact=True).fill('Pair')
    page.keyboard.press('Tab'); page.wait_for_timeout(150)
    page.get_by_role('button', name='Delete Closing', exact=True).click(); page.wait_for_timeout(150)
    check('the Building Blocks Organizer renames one and deletes another', [x['name'] for x in page.evaluate('window.rikuy.prefs.quickParts')] == ['Pair'], page.evaluate('window.rikuy.prefs.quickParts'))
    page.keyboard.press('Escape'); click_text(page, 'Hello', 2)
    # a stranger's storage (another page of the origin wrote it): read with caps, the menu still opens
    page.evaluate("window.rikuy.prefs.quickParts = [{ name: 5, tex: 'x' }, { name: 'Ok', tex: 'Fine.' }, { name: 'Big', tex: 'x'.repeat(70000) }, null, { name: '<img src=x onerror=alert(1)>', tex: 'y' }]; window.rikuy.savePrefs()")
    names = page.evaluate('window.rikuy.quickParts().map((x) => x.name)')
    page.get_by_role('button', name='Quick Parts', exact=True).click(); page.wait_for_timeout(200)
    imgs = page.evaluate("document.querySelectorAll('.pop img').length")
    check('a stranger\'s Quick Parts: bad entries left out, a name with markup set as text', names == ['Ok', '<img src=x onerror=alert(1)>'] and imgs == 0, (names, imgs))
    page.keyboard.press('Escape')


def place_sel(page, sel):
    from browser import place
    place(page, sel)


def r3_cover(page):
    """Insert › Cover Page (I1): a titlepage after \\begin{document} with the document's own title,
    author and date (titling), one step; another design in its place; Remove Current Cover Page gives
    the bytes of before, also for a hand written titlepage; drawn as a page of its own, unnumbered."""
    D = R3DOC
    cover = ('\\begin{titlepage}\n\\centering\n\\vspace*{\\fill}\n{\\Huge\\bfseries \\thetitle{}\\par}\n\\vspace{2em}\n{\\Large \\theauthor{}\\par}\n'
             '\\vspace{1em}\n{\\large \\today{}\\par}\n\\vspace*{\\fill}\n\\end{titlepage}\n')
    want = D.replace('\\title', '\\usepackage{titling}\n\\title').replace('\\begin{document}\n', '\\begin{document}\n' + cover)
    roundtrip(page, D, ('Hello', 2), lambda pg: run_cmd(pg, 'cover-page', {'design': 'plain'}), want, label='Cover Page (Plain)', off_command='cover-page-remove', off=D.replace('\\title', '\\usepackage{titling}\n\\title'))
    # a hand written titlepage first in the text is the cover page: Remove takes exactly it, its comment stays
    hand = D.replace('\\begin{document}\n', '\\begin{document}\n% hand written\n\\begin{titlepage}\nMy own cover.\n\\end{titlepage}\n')
    one_step(page, hand, ('Hello', 2), lambda pg: run_cmd(pg, 'cover-page-remove'), 'Remove Current Cover Page on a hand written titlepage', lambda g: g == D.replace('\\begin{document}\n', '\\begin{document}\n% hand written\n'))
    load_doc(page, want); page.wait_for_timeout(300)
    st = page.evaluate("(() => { const ps = [...document.querySelectorAll('#pages .page')]; return [ps.length, ps[0].innerText.includes('Report'), ps[0].dataset.n, ps[1] && ps[1].dataset.n]; })()")
    check('the cover drawn as a page of its own, and the text after it numbered 1 again', st[0] == 2 and st[1] and st[3] == '1', st)
    run_cmd(page, 'cover-page', {'design': 'sideline'}); page.wait_for_timeout(250)
    check('another design takes the cover\'s place: one titlepage, Sideline\'s rules', src(page).count('\\begin{titlepage}') == 1 and '\\rule{\\linewidth}{1pt}' in src(page))
    bd = '\\documentclass{beamer}\n\\begin{document}\n\\begin{frame}\nHello world.\n\\end{frame}\n\\end{document}\n'
    load_doc(page, bd); click_text(page, 'Hello', 2)
    check('in a presentation Cover Page is off and says why', page.evaluate("(() => { const c = window.rikuy.cmds.command('cover-page'); return !c.when(window.rikuy, window.rikuy.ribbonAt()) && /frame/.test(c.whyNot(window.rikuy)); })()"))


def r3_forms(page):
    """Form fields (DV1): Word's content controls as hyperref's fields in one Form round the text, hyperref
    once, one step each; the Form grows to reach a field written outside it; drawn as boxes."""
    D = W('Hello world.\n\nSecond para.')
    wrap = lambda body: '\\documentclass{article}\n\\usepackage{hyperref}\n\\begin{document}\n\\begin{Form}\n' + body + '\n\\end{Form}\n\\end{document}\n'
    tex = {'text': '\\TextField[name=text1, width=4cm]{}', 'check': '\\CheckBox[name=check1]{}', 'combo': '\\ChoiceMenu[combo, name=combo1, width=4cm]{}{Choose an item,Item 1,Item 2}',
           'list': '\\ChoiceMenu[name=list1, width=4cm]{}{Choose an item,Item 1,Item 2}', 'date': '\\TextField[name=date1, width=3cm, format={AFDate_FormatEx("dd/mm/yyyy");}, keystroke={AFDate_KeystrokeEx("dd/mm/yyyy");}]{}'}
    for k, t in tex.items():
        one_step(page, D, ('Hello', 6), lambda pg: run_cmd(pg, 'form-' + k), 'Form field ' + k, lambda g: g == wrap('Hello ' + t + 'world.\n\nSecond para.'))
    load_doc(page, wrap('Hello ' + tex['text'] + 'world.\n\nSecond para.')); page.wait_for_timeout(300)
    check('a text field drawn as hyperref sets it: a box 4 cm wide', page.evaluate("(() => { const b = document.querySelector('#pages .a-form.ff-text .ff'); return !!b && Math.abs(b.getBoundingClientRect().width / window.rikuy.layout.px - 113.8) < 3; })()"))
    click_text(page, 'Second', 6); run_cmd(page, 'form-check', {'label': 'I agree & sign'}); page.wait_for_timeout(250)
    check('a second field: the same Form, a name of its own, its label escaped', src(page).count('\\begin{Form}') == 1 and 'Second\\CheckBox[name=check1]{I agree \\& sign} para.' in src(page), src(page))
    # a Form round the second paragraph only, a field before it: the Form grows to the whole text
    hand = '\\documentclass{article}\n\\usepackage{hyperref}\n\\begin{document}\nHello world.\n\n\\begin{Form}\nSecond \\TextField[name=text1]{} para.\n\\end{Form}\n\\end{document}\n'
    one_step(page, hand, ('Hello', 6), lambda pg: run_cmd(pg, 'form-text'), 'a field before the Form there is',
             lambda g: g == '\\documentclass{article}\n\\usepackage{hyperref}\n\\begin{document}\n\\begin{Form}\nHello \\TextField[name=text2, width=4cm]{}world.\n\nSecond \\TextField[name=text1]{} para.\n\\end{Form}\n\\end{document}\n')


def r3_move(page):
    """Drag to move (H82): selected words dragged elsewhere move as one edit, Word's smart spaces; one undo
    gives the bytes back; Ctrl copies; a drop in another file moves nothing; a drop from another page is
    its words and HTML (never LaTeX it says it is)."""
    D = W('Alpha \\textbf{beta} gamma.\n\nDelta epsilon.')
    def drag(pg, word, to, ctrl=False):
        x = word_box(pg, word); y = word_box(pg, to)
        pg.mouse.move(x[0] + 4, x[1] + x[3] / 2); pg.mouse.down(); pg.mouse.move(x[0] + 30, x[1] + 30, steps=4); pg.mouse.move(y[0] + 1, y[1] + y[3] / 2, steps=4)
        if ctrl: pg.keyboard.down('Control')
        pg.mouse.up()
        if ctrl: pg.keyboard.up('Control')
        pg.wait_for_timeout(300)
    load_doc(page, D); select_text(page, 'gamma'); h0 = hist(page)
    drag(page, 'gamma', 'epsilon')
    check('a word dragged to another paragraph moves there, its space with it: one step', src(page) == D.replace(' gamma.', '.').replace('Delta epsilon', 'Delta gamma epsilon') and hist(page) == h0 + 1, src(page))
    check('the moved words stay selected', page.evaluate('getSelection().toString()') == 'gamma')
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
    check('one undo gives the bytes of before', src(page) == D, src(page))
    load_doc(page, D); select_text(page, 'gamma'); drag(page, 'gamma', 'epsilon', ctrl=True)
    check('Ctrl as it drops copies instead', src(page) == D.replace('Delta epsilon', 'Delta gamma epsilon'), src(page))
    # across files: nothing moves
    two = {'main.tex': W('Alpha gamma.\n\n\\input{b}'), 'b.tex': 'Delta epsilon.\n'}
    load_doc(page, two); select_text(page, 'gamma'); drag(page, 'gamma', 'epsilon')
    check('a drop in another file moves nothing (and says so)', src(page) == two['main.tex'] and src(page, 'b.tex') == two['b.tex'], (src(page), src(page, 'b.tex')))
    # from another page: its HTML as a paste, never the LaTeX it says it is
    load_doc(page, D)
    y = word_box(page, 'epsilon')
    page.evaluate("""([x, y]) => { const dt = new DataTransfer(); dt.setData('text/plain', 'bold'); dt.setData('text/html', '<b>bold</b>'); dt.setData('text/x-galley-latex', '\\\\immediate\\\\write18{rm -rf x}'); dt.setData('text/x-rikuy-move', 'guess');
      const t = document.elementFromPoint(x, y); for (const k of ['dragenter', 'dragover', 'drop']) t.dispatchEvent(new DragEvent(k, { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt })); }""", [y[0] + 1, y[1] + y[3] / 2])
    page.wait_for_timeout(300)
    check('a drop from another page: its HTML as LaTeX (\\textbf), not the LaTeX it carried', '\\textbf{bold}' in src(page) and 'write18' not in src(page), src(page))


def word_box(page, word):
    return page.evaluate("""(w) => { const sp = [...document.querySelectorAll('#pages span.t')].find((x) => x.textContent.includes(w)); const r = document.createRange(); const i = sp.textContent.indexOf(w);
      r.setStart(sp.firstChild, i); r.setEnd(sp.firstChild, i + w.length); const b = r.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; }""", word)


def r3_phones(p):
    """On a phone (390 and 360 px, touch): Cover Page, Quick Parts and Form Fields from the Insert tab by taps,
    their menus inside the screen with 44 px items, the Field dialog fits, nothing scrolls sideways."""
    for w, h in ((390, 844), (360, 740)):
        browser, page, errors = open_page(p, w, h, touch=True)
        tag = ' (%d px, touch)' % w
        try:
            load_doc(page, R3DOC); page.wait_for_timeout(300)
            sp = word_box(page, 'Hello')
            page.touchscreen.tap(sp[0] + 10, sp[1] + sp[3] / 2); page.wait_for_timeout(300)
            page.select_option('#rb-tabsel', 'insert'); page.wait_for_timeout(250)
            for name in ('Quick Parts', 'Form Fields', 'Cover Page'):
                b = page.get_by_role('button', name=name, exact=True)
                if not b.count() or not b.first.is_visible():
                    # (folded: its group's button first)
                    page.get_by_role('button', name='Text' if name != 'Cover Page' else 'Pages', exact=True).first.tap(); page.wait_for_timeout(200)
                    page.get_by_role('menuitem', name=name, exact=True).first.tap()
                else:
                    b.first.tap()
                page.wait_for_timeout(250)
                m = page.evaluate("""(() => { const p = document.querySelector('.pop'); if (!p) return null; const r = p.getBoundingClientRect(); const it = [...p.querySelectorAll('[role^=menuitem]')];
                  return { in: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0, n: it.length, small: it.filter((x) => x.getBoundingClientRect().height < 43.5).length }; })()""")
                check(name + ': its menu opens by a tap, inside the screen, its items 44 px' + tag, bool(m) and m['in'] and m['n'] >= 3 and m['small'] == 0, m)
                if name == 'Form Fields':
                    page.get_by_role('menuitem', name='Check Box Content Control', exact=True).tap(); page.wait_for_timeout(300)
                    check('a tap puts a check box in, in a Form, hyperref once' + tag, '\\CheckBox[name=check1]{}' in src(page) and src(page).count('\\usepackage{hyperref}') == 1, src(page)[-200:])
                elif name == 'Cover Page':
                    page.get_by_role('menuitemradio', name='Plain', exact=True).tap(); page.wait_for_timeout(300)
                    check('a tap puts the cover page in' + tag, '\\begin{titlepage}' in src(page))
                else:
                    page.get_by_role('menuitem', name='Field…', exact=True).tap(); page.wait_for_timeout(300)
                    fit = page.evaluate("(() => { const d = document.querySelector('.pop-field'); const r = d.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1; })()")
                    check('the Field dialog fits the screen' + tag, fit)
                    page.get_by_role('radio', name='Page', exact=True).tap(); page.get_by_role('button', name='OK', exact=True).tap(); page.wait_for_timeout(300)
                    check('and a tap on OK writes \\thepage' + tag, '\\thepage{}' in src(page), src(page)[-200:])
                    sp = word_box(page, 'Second')
                    page.touchscreen.tap(sp[0] + 10, sp[1] + sp[3] / 2); page.wait_for_timeout(250)
            check('no sideways scroll' + tag, page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))
            page.screenshot(path=os.path.join(SHOTS, 'r3-insert-%d.png' % w))
        except Exception as e:
            check('r3_phones runs to its end' + tag, False, repr(e)[:300])
        browser.close()


def r3_compiles(page):
    """With dist/tex: a cover page, every field, every form field and a Quick Part compile with pdfLaTeX,
    XeLaTeX and LuaLaTeX; the PDF prints the title, the pages' numbers and holds the fields."""
    if not os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        print('SKIP R3\'s compiles: no TeX tree in %s' % DIST)
        return
    load_doc(page, R3DOC)
    run_cmd(page, 'cover-page', {'design': 'sideline'}); page.wait_for_timeout(200)
    click_text(page, 'Hello', 5)
    for fid in ('PAGE', 'NUMPAGES', 'SECTION', 'DATE', 'TIME', 'FILENAME', 'TITLE', 'AUTHOR'):
        run_cmd(page, 'insert-field', {'field': fid}); page.wait_for_timeout(120); page.keyboard.type(' ')
    click_text(page, 'Second', 6)
    for k in ('text', 'check', 'combo', 'list', 'date'):
        run_cmd(page, 'form-' + k, {'label': 'L' + k}); page.wait_for_timeout(150)
    body = src(page)
    import base64, io
    from pypdf import PdfReader
    for eng in ('pdflatex', 'xelatex', 'lualatex'):
        doc = ('% !TEX program = ' + eng + '\n' + body) if eng != 'pdflatex' else body
        page.set_default_timeout(600000)
        r = page.evaluate("""async (t) => { await window.rikuy.api.setSource(t); const r = await window.rikuy.api.compile();
          let b = ''; if (r.pdf) for (let i = 0; i < r.pdf.length; i += 8192) b += String.fromCharCode(...r.pdf.subarray(i, i + 8192));
          return { ok: r.ok, engine: r.engine, pdf: btoa(b), problems: (r.problems || []).filter((x) => x.severity === 'error').map((x) => x.message).slice(0, 4) }; }""", doc)
        page.set_default_timeout(30000)
        rd = PdfReader(io.BytesIO(base64.b64decode(r['pdf']))) if r['pdf'] else None
        txt = ' '.join(pg.extract_text() or '' for pg in rd.pages) if rd else ''
        fields = sorted((rd.get_fields() or {}).keys()) if rd else []
        check('R3 compiles with %s: cover, fields, form fields; the title and "Report" printed, the five fields in the PDF\'s form' % eng,
              r['ok'] and not r['problems'] and r['engine'] == eng and 'Report' in txt and 'main' in txt and fields == ['check1', 'combo1', 'date1', 'list1', 'text1'], {'ok': r['ok'], 'problems': r['problems'], 'fields': fields, 'text': txt[:200]})


EXTRA = [clipboard, symbols, date_latex, autocorrect, files_in, review, verify, review_compiles, r3_fields, r3_quickparts, r3_cover, r3_forms, r3_move, r3_compiles]

if __name__ == '__main__':
    sys.exit(run())
