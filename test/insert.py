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
    check('graph: Insert writes the \\rikuywidget block after the paragraph and \\usepackage{rikuy}', src(page) == WANT, src(page))
    check('graph: and its file, rikuy.sty and the picture, as one step', files(page) == [['graphs/function-1.html', 'main.tex', 'rikuy.sty'], ['graphs/function-1.png']] and page.evaluate('window.rikuy.hist.length') == h0 + 1, files(page))
    html = src(page, 'graphs/function-1.html')
    check('graph: its file is a graph Rikuy reads back, with no request out', html.startswith('<!doctype html>') and 'id="rikuy-graph"' in html and not re.search(r'\b(src|href)\s*=', html.split('</script>', 1)[1]), html[:200])
    png = base64.b64decode(blob_b64(page, 'graphs/function-1.png') or '')
    check('graph: the picture is a PNG three times the text\'s width', png[:8] == b'\x89PNG\r\n\x1a\n' and int.from_bytes(png[16:20], 'big') > 1200, len(png))
    page.wait_for_function('document.querySelectorAll("#wlayer iframe.rk-widget").length === 1', timeout=8000)
    check('graph: it runs on the page in a frame sandboxed to scripts alone', page.evaluate('document.querySelector("#wlayer iframe.rk-widget").getAttribute("sandbox")') == 'allow-scripts')
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(300)
    check('graph: one undo gives the source back byte for byte, the files and the picture gone', src(page) == DOC and files(page) == [['main.tex'], []], files(page))
    page.evaluate('window.rikuy.redo()'); page.wait_for_timeout(300)
    check('graph: redo brings them all again', src(page) == WANT and files(page)[1] == ['graphs/function-1.png'] and src(page, 'graphs/function-1.html') == html)
    # a second graph takes the next names; rikuy.sty and the package are not written twice
    insert_graph(page, 'data', at=('Second', 1), caption='Data & more')
    s = src(page)
    check('graph: a second one is graphs/data-1, a figure with its caption escaped; no second package line', s.count('\\usepackage{rikuy}') == 1 and '\\begin{figure}[htbp]\n\\centering\n\\rikuywidget[width=\\linewidth]{graphs/data-1.html}{graphs/data-1.png}\n\\caption{Data \\& more}\n\\end{figure}' in s and files(page)[0].count('rikuy.sty') == 1, s)
    # from the insert list
    load_doc(page, DOC); click_text(page, 'Hello', 2)
    names = page.evaluate('window.rikuy.cmds.commands().filter((c) => c.palette).map((c) => c.palette.d)')
    check('graph: the insert list has it', any('Interactive graph' in n for n in names), names)


def graph_edit(page):
    load_doc(page, DOC)
    insert_graph(page)
    before, png0 = src(page, 'graphs/function-1.html'), blob_b64(page, 'graphs/function-1.png')
    h0 = page.evaluate('window.rikuy.hist.length')
    page.evaluate('window.rikuy.runCommand("edit-graph")')
    page.wait_for_selector('#gd-ok')
    check('graph: Edit graph opens the dialog on it, its formula in the field', page.get_by_role('textbox', name='Formulas').input_value() == 'y = a sin(b x)' and page.inner_text('#gd-ok') == 'Update')
    page.click('#gd-ok'); page.wait_for_timeout(500)
    check('graph: Update with nothing changed writes nothing', page.evaluate('window.rikuy.hist.length') == h0 and src(page, 'graphs/function-1.html') == before)
    page.evaluate('window.rikuy.runCommand("edit-graph", { file: "graphs/function-1.html" })')
    page.wait_for_selector('#gd-ok')
    page.get_by_role('textbox', name='Formulas').fill('y = a sin(b x) + c')
    page.wait_for_timeout(400)
    check('graph: a new letter gets a slider of its own', page.get_by_role('textbox', name='Slider 3 name').input_value() == 'c')
    page.get_by_role('textbox', name='Slider 3 start').fill('0.5')
    page.click('#gd-ok'); page.wait_for_timeout(1200)
    after = src(page, 'graphs/function-1.html')
    check('graph: Update writes the file and the picture, the text untouched, one step', after != before and '"a sin(b x) + c"' in after and src(page) == WANT and blob_b64(page, 'graphs/function-1.png') != png0 and page.evaluate('window.rikuy.hist.length') == h0 + 1)
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(300)
    check('graph: one undo gives the file and the picture back byte for byte', src(page, 'graphs/function-1.html') == before and blob_b64(page, 'graphs/function-1.png') == png0)
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
    from PIL import Image, ImageChops, ImageStat, ImageFilter
    for kind in ('function', 'data', 'curve', 'dist'):
        load_doc(page, DOC)
        page.evaluate('window.rikuy.zoomTo ? window.rikuy.zoomTo(1, null) : 0')
        insert_graph(page, kind)
        page.wait_for_function('document.querySelectorAll("#wlayer iframe.rk-widget").length === 1', timeout=8000)
        page.wait_for_timeout(900)
        name = [n for n in files(page)[1] if ('distribution' if kind == 'dist' else kind) + '-' in n][-1]
        fr = page.frame_locator('#wlayer iframe.rk-widget')
        box = fr.locator('#rk-c').bounding_box()
        shot = Image.open(io.BytesIO(page.screenshot(clip=box))).convert('RGB')
        pic = Image.open(io.BytesIO(base64.b64decode(blob_b64(page, name)))).convert('RGBA')
        white = Image.new('RGBA', pic.size, (255, 255, 255, 255)); white.alpha_composite(pic)
        pic = white.convert('RGB').resize(shot.size, Image.LANCZOS)
        # (both softened by a pixel: a 1 px bar edge rasterised at another scale is not a difference a reader sees)
        soft = lambda im: im.filter(ImageFilter.GaussianBlur(1))
        diff = ImageStat.Stat(ImageChops.difference(soft(shot), soft(pic)).convert('L')).mean[0]
        shot.save(os.path.join(SHOTS, 'live-%s.png' % kind)); pic.save(os.path.join(SHOTS, 'fallback-%s.png' % kind))
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
    fr.locator('#rk-c').click(button='right', position={'x': 60, 'y': 40})
    page.wait_for_selector('[role=menu][aria-label="Graph menu"]', timeout=4000)
    check('graph: a right click in its frame opens Rikuy\'s menu with Edit graph', page.get_by_role('menuitem', name='Edit graph').count() == 1)
    page.get_by_role('menuitem', name='Edit graph').click(); page.wait_for_timeout(300)
    check('graph: and Edit graph there opens the dialog', page.locator('#gd-ok').count() == 1)
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    # a frame asking again and again opens one menu a second at most
    n = page.evaluate('''async () => { const w = document.querySelector('#wlayer iframe.rk-widget').contentWindow; let opened = 0;
      const mo = new MutationObserver(() => { if (document.querySelector('[aria-label="Graph menu"]')) opened++; }); mo.observe(document.body, { childList: true });
      window.rikuy.graphMenuT = 0; for (let i = 0; i < 5; i++) window.dispatchEvent(new MessageEvent('message', { data: { rikuy: 'menu', x: 5, y: 5 }, source: w }));
      await new Promise((r) => setTimeout(r, 100)); mo.disconnect(); return opened; }''')
    check('graph: five menu requests at once open one menu', n == 1, n)
    page.keyboard.press('Escape')
    # the Edit graph button over it, and the right click menu with the graph armed
    page.hover('#wlayer .wbox'); page.wait_for_timeout(200)
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
    html = src(page, 'graphs/function-1.html')
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
        for fn in (graph_phones, shots):
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
    check('Insert: the tab has Interactive graph, Date & Time, Symbol and Environment', all(page.get_by_role('tabpanel', name='Insert').get_by_role('button', name=n, exact=True).count() == 1 for n in ('Environment', 'Interactive graph', 'Symbol', 'Date & Time')))
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


EXTRA = [clipboard, symbols, date_latex, autocorrect, files_in]

if __name__ == '__main__':
    sys.exit(run())
