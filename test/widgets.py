"""Live figures (rikuy.sty's \\rikuywidget), served with the artifact host's CSP (serve.py).
A project laid out as main.tex, rikuy.sty, widgets/, figures/ opens from a .zip with main.tex as
its main file. A .zip is someone else's content: its widgets show their fallback with a button,
and clicking the picture opens its command; one click runs them, and that is kept for the project
through a reload, while one's own project runs them at once. The widget runs in a frame sandboxed to scripts alone (no allow-same-origin), laid
over the box the text keeps for it and outside the editable pages; it sizes its frame through
{rikuy: "height"}, and its slider works. Inside the frame there is no storage, no parent page, no
connection and no picture from the network, while inline script runs; messages from anywhere else
are ignored and a height past a page is cut. WebRTC is gone from the widget's window, srcdoc frames
it adds are taken out before they run, document.write brings nothing back and the frame cannot be
sent to a data: document; no STUN request reaches the test's own server. Typing in the caption and
around the figure patches only the typed characters, undo gives the source back byte for byte, and
the widget keeps its state through all of it, through zoom and through being moved to another
page. The tab on the frame opens its command; Alt+click shows it in the source. Save .zip and a
share link carry the widget file; a coauthor's copy runs it and compiles with a gray box for the
fallback. A widget whose file is missing shows its fallback image, then a quiet placeholder, and
Problems names both, and a missing rikuy.sty. Five widgets of 60 KB each open, run, share and
survive a reload."""
import os, sys, io, re, json, zlib, base64, zipfile, tempfile, traceback, time, socket, threading
sys.path.insert(0, os.path.dirname(__file__))
import serve
from browser import ROUTES, check, results, click_text
from playwright.sync_api import sync_playwright

PORT = 8797
serve.start(PORT)
URL = 'http://127.0.0.1:%d/' % PORT
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAMPLE = os.path.join(ROOT, 'sample', 'widget')
TMP = os.path.join(tempfile.gettempdir(), 'rikuy-widgets')
os.makedirs(TMP, exist_ok=True)


def read(n, mode='r'):
    with open(os.path.join(SAMPLE, n), mode, **({} if 'b' in mode else {'encoding': 'utf8'})) as f:
        return f.read()


MAIN, STY, CLT, PNG = read('main.tex'), read('rikuy.sty'), read('widgets/clt.html'), read('figures/clt.png', 'rb')
CMD = '\\rikuywidget[width=\\textwidth]{widgets/clt.html}{figures/clt.png}'


def make_zip(path, files):
    with zipfile.ZipFile(path, 'w') as z:
        for n, b in files.items():
            z.writestr(n, b if isinstance(b, bytes) else b.encode('utf8'))
    return path


def open_app(p):
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1400, 'height': 1000}, accept_downloads=True, device_scale_factor=1)
    page = ctx.new_page()
    errors = []
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    page.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))

    def h(route):
        u = route.request.url
        if u in ROUTES:
            return route.fulfill(status=200, content_type='text/javascript', body=open(ROUTES[u], encoding='utf8').read(), headers={'Access-Control-Allow-Origin': '*'})
        if u.startswith('http://127.0.0.1'):
            return route.continue_()
        return route.abort()
    ctx.route('**/*', h)
    page.goto(URL)
    page.evaluate('localStorage.clear()')
    page.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=30000)
    return b, page, errors


def src(page, f='main.tex'):
    return page.evaluate('(f) => window.rikuy.files.get(f)', f)


def open_zip(page, path):
    page.set_input_files('#fileinput', path)
    page.wait_for_function("window.rikuy.main === 'main.tex' && window.rikuy.files.has('widgets/clt.html') && document.querySelector('.w-live')", timeout=15000)
    page.wait_for_timeout(300)


def run_widgets(page, n_frames):
    # the button over a widget from someone else
    page.wait_for_selector('.w-run', timeout=5000)
    page.click('.w-run')
    return wait_frames(page, n_frames)


def wait_frames(page, n, timeout=15000):
    try:
        page.wait_for_function('(n) => window.rikuy.widgets.frames.size === n && [...window.rikuy.widgets.frames.values()].every((F) => window.rikuy.widgets.heights.has(F.key))', arg=n, timeout=timeout)
        return True
    except Exception:
        return False


def frame(page, i=0):
    return page.locator('#wlayer iframe.rk-widget').nth(i).element_handle().content_frame()


# every frame lies over its box, to the pixel, and is scaled with the page
ALIGNED = """() => [...window.rikuy.widgets.frames.values()].every((F) => {
  const a = F.box.getBoundingClientRect(), b = F.ph.getBoundingClientRect();
  return !F.box.hidden && Math.abs(a.left - b.left) < 1.5 && Math.abs(a.top - b.top) < 1.5 && Math.abs(a.width - b.width) < 1.5 && Math.abs(a.height - b.height) < 1.5;
})"""
MARK = "() => { const f = document.querySelector('#wlayer iframe'); f.dataset.mark = 'kept'; }"
KEPT = "() => document.querySelectorAll('#wlayer iframe').length === 1 && document.querySelector('#wlayer iframe').dataset.mark === 'kept'"


# the pages hold every item at the height it is drawn: a picture measured before it loaded (a
# fallback, any figure) is measured again once it has
MEASURED = """() => window.rikuy.items.filter((it) => it.el.isConnected && it.el.querySelector('img')).every((it) => Math.abs(it.h - it.el.getBoundingClientRect().height) < 2)"""


def measured(page):
    try:
        page.wait_for_function(MEASURED, timeout=3000)
        return True
    except Exception:
        return False


def aligned(page):
    # the frames follow their boxes within a frame of the pages changing
    try:
        page.wait_for_function(ALIGNED, timeout=3000)
        return True
    except Exception:
        return False


def link_files(url):
    payload = url.split('#share=', 1)[1]
    assert payload.startswith('1.')
    b = payload[2:].replace('-', '+').replace('_', '/')
    raw = zlib.decompress(base64.b64decode(b + '=' * (-len(b) % 4)), -15)
    return dict(json.loads(raw)['files'])


PROBE = """<!doctype html><html><body><div style="height:90px">probe</div><script>
(async function () {
  var out = { origin: self.origin, violations: [] };
  document.addEventListener('securitypolicyviolation', function (e) { out.violations.push(e.effectiveDirective); });
  try { void localStorage.length; out.storage = 'open'; } catch (e) { out.storage = 'blocked'; }
  try { void parent.document.title; out.parent = 'open'; } catch (e) { out.parent = 'blocked'; }
  try { await fetch('%(url)srikuy.html'); out.fetch = 'open'; } catch (e) { out.fetch = 'blocked'; }
  out.img = await new Promise(function (res) { var i = new Image(); i.onload = function () { res('open'); }; i.onerror = function () { res('blocked'); }; i.src = '%(url)stex/engine.js?x'; });
  out.dataImg = await new Promise(function (res) { var i = new Image(); i.onload = function () { res('open'); }; i.onerror = function () { res('blocked'); }; i.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; });
  try { out.popup = window.open('about:blank') ? 'open' : 'blocked'; } catch (e) { out.popup = 'blocked'; }
  try { top.location.href = 'about:blank'; out.top = 'open'; } catch (e) { out.top = 'blocked'; }
  try { out.evalOk = eval('1 + 1') === 2; } catch (e) { out.evalOk = false; }
  await new Promise(function (r) { setTimeout(r, 50); });
  parent.postMessage({ probe: out }, '*');
  parent.postMessage({ rikuy: 'height', px: 100000 }, '*');
})();
</script></body></html>""" % {'url': URL}


# WebRTC, the way out no policy closes in Chromium: a STUN request to the author's server would tell
# them who opened the document. widgetGuard takes the interfaces away; these try them, and the ways
# around that the guard closes. Every child that runs at all is in a window of its own, so it posts
# what it found; each also aims a STUN request at the test's own UDP port.
STUN = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
STUN.bind(('127.0.0.1', 0))
STUN_PORT = STUN.getsockname()[1]
stun_packets = []


def stun_listen():
    while True:
        stun_packets.append(STUN.recvfrom(2048)[1])


threading.Thread(target=stun_listen, daemon=True).start()


def rtc_child(how):
    return ("<script>try { var pc = new RTCPeerConnection({iceServers: [{urls: 'stun:127.0.0.1:%d'}]}); pc.createDataChannel('x');"
            " pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }); } catch (e) {}"
            " top.postMessage({rtcChild: '%s', rtc: typeof RTCPeerConnection}, '*');</script>" % (STUN_PORT, how))


def attr(s):
    return s.replace('&', '&amp;').replace('"', '&quot;')


def js(s):
    return json.dumps(s).replace('</', '<\\/')


RTC_PROBE = """<!doctype html><html><body><div style="height:90px">rtc</div>
<iframe srcdoc="%(markup)s"></iframe>
<script>
(function () {
  var out = {};
  try { var pc = new RTCPeerConnection({iceServers: [{urls: 'stun:127.0.0.1:%(port)d'}]}); pc.createDataChannel('x');
    pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }); out.rtc = 'made'; } catch (e) { out.rtc = 'refused'; }
  out.left = Object.getOwnPropertyNames(window).filter(function (n) { return /RTC/.test(n); });
  var f = document.createElement('iframe'); f.srcdoc = %(script)s; document.body.appendChild(f);
  var h = document.createElement('div'); document.body.appendChild(h);
  h.attachShadow({ mode: 'closed' }).innerHTML = '<iframe srcdoc="' + %(shadow)s + '"></iframe>';
  parent.postMessage({ rtcProbe: out }, '*');
})();
</script></body></html>""" % {'markup': attr(rtc_child('markup')), 'port': STUN_PORT, 'script': js(rtc_child('script')), 'shadow': js(attr(rtc_child('shadow')))}
RTC_WRITE = """<!doctype html><html><body>w<script>addEventListener('load', function () { document.open();
  document.write(%s); document.close(); });</script></body></html>""" % js("<script>top.postMessage({rtcWrite: typeof RTCPeerConnection + ' ' + typeof webkitRTCPeerConnection}, '*')</script>")
RTC_LEAVE = """<!doctype html><html><body>leave<script>setTimeout(function () { location.href = 'data:text/html,' + encodeURIComponent(%s); }, 50);</script></body></html>""" % js(rtc_child('location'))
RTC_REFRESH = """<!doctype html><html><head><meta http-equiv="refresh" content="0;url=data:text/html,%s"></head><body>refresh</body></html>""" % attr(rtc_child('refresh'))


def big_widget(k):
    # a widget of about 60 KB, as the website's lecture notes export: one inline script, mostly data
    data = ','.join('%.5f' % (((i * 7919 + k * 104729) % 100003) / 100003) for i in range(7600))
    return CLT.replace("'use strict';", "'use strict';\n  var DATA = [" + data + "]; // widget " + str(k))


try:
    with sync_playwright() as p:
        browser, page, errors = open_app(p)
        check('the Open dialog offers .html', '.html' in page.get_attribute('#fileinput', 'accept').split(','))
        zpath = make_zip(os.path.join(TMP, 'clt.zip'), {'main.tex': MAIN, 'rikuy.sty': STY, 'widgets/clt.html': CLT, 'figures/clt.png': PNG})
        open_zip(page, zpath)
        check('a .zip of main.tex, rikuy.sty, widgets/ and figures/ opens with main.tex as main', page.evaluate("window.rikuy.main") == 'main.tex')
        check('the widget is a text file of the project, the fallback a figure', page.evaluate("typeof window.rikuy.files.get('widgets/clt.html') === 'string' && window.rikuy.assetBlobs.has('figures/clt.png') && !window.rikuy.extra.has('widgets/clt.html')"))
        g = page.evaluate("""() => { const s = document.querySelector('.w-live'); const i = s && s.querySelector('img'); return { gated: s.classList.contains('gated'), img: !!(i && i.complete && i.naturalWidth), frames: document.querySelectorAll('#wlayer iframe').length, run: document.querySelectorAll('#wlayer .w-run').length }; }""")
        check('from a .zip the widget waits: its fallback shows, with a Run button and no frame', g['gated'] and g['img'] and g['frames'] == 0 and g['run'] == 1, g)
        check('the pages hold that fallback at the height it is drawn, once it has loaded', measured(page), page.evaluate("window.rikuy.items.map((it) => [it.kind, Math.round(it.h), Math.round(it.el.getBoundingClientRect().height)])"))
        bb = page.locator('.w-live.gated img').bounding_box()
        page.mouse.click(bb['x'] + bb['width'] * 0.3, bb['y'] + bb['height'] * 0.3)
        page.wait_for_selector('#pop-raw', timeout=3000)
        check('a click on that picture opens its command, as a figure\'s does', page.evaluate("document.getElementById('pop-raw').value") == CMD)
        page.keyboard.press('Escape')
        page.wait_for_timeout(200)
        ran = run_widgets(page, 1)
        check('one click runs it, and it posts its height', ran, page.evaluate("[...window.rikuy.widgets.heights]"))
        info = page.evaluate("""() => { const f = document.querySelector('#wlayer iframe'); return f && { sandbox: f.getAttribute('sandbox'), inPages: !!f.closest('#pages'), csp: f.srcdoc.indexOf('Content-Security-Policy'), body: f.srcdoc.indexOf('<canvas'),
          h: window.rikuy.widgets.heights.get(document.querySelector('.w-live').dataset.w) }; }""")
        check('the frame is sandboxed to scripts alone, without allow-same-origin', info and info['sandbox'] == 'allow-scripts', info)
        check('the frame lives outside the editable pages', info and not info['inPages'], info)
        check('its policy comes before any of the widget', info and 0 <= info['csp'] < info['body'], info)
        check('the height it asked for is taken', info and 150 < (info['h'] or 0) < 700, info)
        check('the box in the text took that height and the frame lies over it', page.evaluate("document.querySelector('.w-live').classList.contains('sized')") and aligned(page))
        page.screenshot(path=os.path.join(TMP, 'widget.png'))
        fl = page.frame_locator('#wlayer iframe.rk-widget').first
        check('the widget starts at n = 4', fl.locator('#v').inner_text() == 'n = 4', fl.locator('#v').inner_text())
        fl.locator('#n').focus()
        fl.locator('#n').press('ArrowRight')
        page.wait_for_timeout(150)
        check('moving its slider in the frame changes it', fl.locator('#v').inner_text() == 'n = 5', fl.locator('#v').inner_text())
        check('no errors so far (an inline script the policy blocked would show here)', not errors, errors[:3])

        # typing next to the widget: in its caption (which redraws the figure) and around it
        page.evaluate(MARK)
        orig = src(page)
        click_text(page, 'Histogram', 9)
        page.keyboard.type(' (live)')
        page.wait_for_timeout(300)
        check('typing in the caption patches only the typed text', src(page) == orig.replace('Histogram of', 'Histogram (live) of', 1), src(page)[-700:-500])
        check('the widget keeps running through its figure being redrawn', page.evaluate(KEPT) and fl.locator('#v').inner_text() == 'n = 5')
        check('and its frame still lies over its box', aligned(page))
        click_text(page, 'four thousand', 4)
        page.keyboard.type(' or so')
        page.wait_for_timeout(300)
        want = orig.replace('Histogram of', 'Histogram (live) of', 1).replace('four thousand', 'four or so thousand', 1)
        check('typing in the paragraph before patches only the typed text', src(page) == want, src(page)[:900])
        page.click('#b-undo')
        page.wait_for_timeout(150)
        page.click('#b-undo')
        page.wait_for_timeout(300)
        check('undo gives the source back byte for byte', src(page) == orig)
        check('the widget kept its state through the edits and the undo', page.evaluate(KEPT) and fl.locator('#v').inner_text() == 'n = 5')

        # the tab: the command, as a figure's source; Alt: the line in the source pane
        page.hover('.wbox')
        page.click('.w-src')
        page.wait_for_selector('#pop-raw', timeout=3000)
        check('the tab opens the widget\'s command', page.evaluate("document.getElementById('pop-raw').value") == CMD, page.evaluate("document.getElementById('pop-raw').value"))
        page.keyboard.press('Escape')
        page.wait_for_timeout(200)
        check('closing it changes nothing', src(page) == orig)
        page.click('.w-src', modifiers=['Alt'])
        page.wait_for_function('window.rikuy.cm && document.body.classList.contains("src-on")', timeout=10000)
        page.wait_for_timeout(300)
        line = page.evaluate('window.rikuy.cm.getCursor().line')
        check('Alt+click on the tab shows its line in the source', line == orig[:orig.index(CMD)].count('\n'), (line, orig[:orig.index(CMD)].count('\n')))
        page.wait_for_timeout(400)
        check('the widget survives the source pane opening', page.evaluate(KEPT) and aligned(page))

        # zoom and pagination move the box: the frame follows and keeps its state
        s0 = page.evaluate("document.querySelector('.wbox').style.transform")
        page.click('#b-zin')
        page.wait_for_timeout(500)
        check('zoom: the frame is scaled with the page and still lies over its box', aligned(page) and page.evaluate("document.querySelector('.wbox').style.transform") != s0, (s0, page.evaluate("document.querySelector('.wbox').style.transform")))
        page.click('#zoomv')
        page.wait_for_timeout(400)
        longer = orig.replace('\\begin{figure}', ('Filler text to push the figure onward. ' * 12 + '\n\n') * 8 + '\\begin{figure}', 1)
        page.evaluate("(t) => { const g = window.rikuy; g.files.set('main.tex', t); g.rebuild(); }", longer)
        page.wait_for_timeout(500)
        pg = page.evaluate("[...document.querySelectorAll('#pages .page')].findIndex((p) => p.querySelector('.w-live'))")
        check('a figure moved to another page keeps its widget running, over its box', pg >= 1 and page.evaluate(KEPT) and aligned(page) and fl.locator('#v').inner_text() == 'n = 5', pg)
        page.evaluate("(t) => { const g = window.rikuy; g.files.set('main.tex', t); g.rebuild(); }", orig)
        page.wait_for_timeout(400)

        # leaving: the .zip and a share link carry the widget
        with page.expect_download() as d:
            page.click('#b-save')
        zout = os.path.join(TMP, 'out.zip')
        d.value.save_as(zout)
        with zipfile.ZipFile(zout) as z:
            got = {n: z.read(n) for n in z.namelist()}
        check('Save .zip carries every file byte for byte', got.get('widgets/clt.html') == CLT.encode() and got.get('figures/clt.png') == PNG and got.get('rikuy.sty') == STY.encode() and got.get('main.tex') == orig.encode(), sorted(got))
        url = page.evaluate("async () => (await window.rikuy.makeShareLink('coauthor')).url")
        lf = link_files(url)
        check('a share link carries the widget (and, as for any figure, not the fallback)', lf.get('widgets/clt.html') == CLT and 'figures/clt.png' not in lf, sorted(lf))
        payload = url.split('#share=', 1)[1]

        # a coauthor opens the link: the widget runs for them; their PDF gets a gray box for the fallback
        b2, page2, errors2 = open_app(p)
        page2.evaluate("(s) => window.rikuy.openSharedLink(s)", payload)
        page2.wait_for_selector('.w-live.gated', timeout=10000)
        txt = page2.evaluate("document.querySelector('.w-live.gated').textContent")
        check('the coauthor\'s copy waits too, and says whose live figure it is', 'Live figure from' in txt and 'not run yet' in txt, txt)
        check('one click runs it for them', run_widgets(page2, 1))
        comp = page2.evaluate("async () => (await window.rikuy.compileFiles()).filter((x) => /clt/.test(x.path)).map((x) => [x.path, typeof x.data === 'string' ? x.data.length : x.data.length])")
        check('and compiles with a stand-in for the fallback it does not have', any(n == 'figures/clt.png' for n, _ in comp), comp)
        check('no errors on the coauthor\'s page', not errors2, errors2[:3])
        b2.close()

        # missing files: the fallback, then a quiet placeholder; Problems names them
        page.evaluate("() => { const g = window.rikuy; g.files.delete('widgets/clt.html'); g.forceRender = true; g.rebuild(); }")
        page.wait_for_timeout(400)
        fb = page.evaluate("() => { const s = document.querySelector('#pages .a-widget'); const i = s && s.querySelector('img'); return s && { cls: s.className, img: i && i.src.startsWith('blob:') && i.complete && i.naturalWidth > 0, frames: document.querySelectorAll('#wlayer iframe').length }; }")
        check('without its widget file the fallback image shows, and no frame', fb and 'a-img' in fb['cls'] and fb['img'] and fb['frames'] == 0, fb)
        check('and the pages hold it at the height it is drawn', measured(page))
        probs = page.evaluate("window.rikuy.computeProblems().map((x) => x.msg)")
        check('Problems says the widget file is missing', any('widgets/clt.html' in m and 'not in the project' in m for m in probs), probs)
        page.evaluate("() => { const g = window.rikuy; g.assetBlobs.delete('figures/clt.png'); g.assets.delete('figures/clt.png'); g.forceRender = true; g.rebuild(); }")
        page.wait_for_timeout(300)
        ph = page.evaluate("() => { const s = document.querySelector('#pages .a-widget'); return s && [s.className, s.textContent]; }")
        check('without the fallback either, a quiet placeholder with the path', ph and 'img-missing' in ph[0] and 'widgets/clt.html' in ph[1], ph)
        page.evaluate("(t) => { const g = window.rikuy; g.files.set('widgets/clt.html', t); g.files.delete('rikuy.sty'); g.forceRender = true; g.rebuild(); }", CLT)
        probs = page.evaluate("window.rikuy.computeProblems().map((x) => x.msg)")
        check('Problems says rikuy.sty is missing', any('rikuy.sty' in m for m in probs), probs)
        check('with the file back the widget runs again', wait_frames(page, 1))

        # a widget edited in the source runs from its new text
        page.evaluate("(t) => { const g = window.rikuy; g.files.set('widgets/clt.html', t); g.rebuild(); }", CLT.replace('value="4"', 'value="9"'))
        wait_frames(page, 1)
        page.wait_for_timeout(300)
        check('a widget edited in the source starts again from its new text', page.frame_locator('#wlayer iframe.rk-widget').first.locator('#v').inner_text() == 'n = 9')

        # isolation, from a widget's own script under the page's real policy; foreign messages
        page.evaluate("() => { window.__probe = null; window.addEventListener('message', (e) => { if (e.data && e.data.probe) window.__probe = e.data.probe; }); }")
        page.evaluate("(t) => { const g = window.rikuy; g.files.set('widgets/clt.html', t); g.rebuild(); }", PROBE)
        page.wait_for_function('window.__probe', timeout=10000)
        pr = page.evaluate('window.__probe')
        page.wait_for_timeout(300)
        check('inside the frame inline script runs under the page\'s policy, and eval', pr.get('evalOk') is True, pr)
        check('its origin is opaque and it reaches no storage and not the page', pr.get('origin') == 'null' and pr.get('storage') == 'blocked' and pr.get('parent') == 'blocked', pr)
        check('no connection and no picture from the network (refused by the frame\'s policy); data pictures load', pr.get('fetch') == 'blocked' and pr.get('img') == 'blocked' and pr.get('dataImg') == 'open' and 'connect-src' in pr.get('violations', []) and 'img-src' in pr.get('violations', []), pr)
        check('no popups and no navigating the page', pr.get('popup') == 'blocked' and pr.get('top') == 'blocked', pr)
        hmax = page.evaluate("Math.max(...window.rikuy.widgets.heights.values())")
        th = page.evaluate("window.rikuy.layout.g.th * 96 / 72.27")
        check('a widget asking for more than a page gets a page\'s text height', abs(hmax - int(th)) <= 1, (hmax, th))
        before = page.evaluate("JSON.stringify([...window.rikuy.widgets.heights])")
        page.evaluate("""() => { window.postMessage({ rikuy: 'height', px: 333 }, '*');
          const f = document.createElement('iframe'); f.setAttribute('sandbox', 'allow-scripts');
          f.srcdoc = '<script>parent.postMessage({rikuy: "height", px: 222}, "*")<\\/script>'; document.body.appendChild(f); }""")
        page.wait_for_timeout(400)
        check('height messages from the page itself or another frame are ignored', page.evaluate("JSON.stringify([...window.rikuy.widgets.heights])") == before)
        errors[:] = [e for e in errors if 'Content Security Policy' not in e and 'Blocked opening' not in e and 'sandboxed' not in e and 'Unsafe attempt' not in e]
        check('no page errors (beyond what the probe was refused)', not errors, errors[:3])

        # WebRTC: the guard, and the ways around it it closes
        page.evaluate("""() => { window.__rtc = []; window.addEventListener('message', (e) => {
          const d = e.data; if (d && (d.rtcProbe || d.rtcChild || d.rtcWrite)) window.__rtc.push(d); }); }""")
        rtc = lambda: page.evaluate('window.__rtc')
        page.evaluate("(t) => { const g = window.rikuy; g.files.set('widgets/clt.html', t); g.rebuild(); }", RTC_PROBE)
        page.wait_for_function('window.__rtc.some((d) => d.rtcProbe)', timeout=10000)
        page.wait_for_timeout(1500)
        pr = next(d['rtcProbe'] for d in rtc() if 'rtcProbe' in d)
        check('a widget\'s new RTCPeerConnection() throws: it and every RTC interface are gone from its window', pr['rtc'] == 'refused' and not pr['left'], pr)
        check('a srcdoc frame the widget adds (in its markup, by script, in a shadow root it attaches) is taken out before it runs', not [d for d in rtc() if 'rtcChild' in d], [d['rtcChild'] for d in rtc() if 'rtcChild' in d])
        page.evaluate("(t) => { const g = window.rikuy; g.files.set('widgets/clt.html', t); g.rebuild(); }", RTC_WRITE)
        page.wait_for_function('window.__rtc.some((d) => d.rtcWrite)', timeout=10000)
        check('document.open() and write() bring none of it back', [d['rtcWrite'] for d in rtc() if 'rtcWrite' in d] == ['undefined undefined'], [d['rtcWrite'] for d in rtc() if 'rtcWrite' in d])
        for t in (RTC_LEAVE, RTC_REFRESH):
            page.evaluate("(t) => { const g = window.rikuy; g.files.set('widgets/clt.html', t); g.rebuild(); }", t)
            page.wait_for_timeout(1500)
        check('the widget cannot take its frame to a document of its own, by location or a refresh <meta>: the page refuses it', not [d for d in rtc() if d.get('rtcChild') in ('location', 'refresh')], [d['rtcChild'] for d in rtc() if 'rtcChild' in d])
        check('no STUN request from any of them reached the test\'s server', not stun_packets, len(stun_packets))
        browser.close()

        # one's own project (here the sample's, replaced in place) runs its widget with no click
        browser, page, errors = open_app(p)
        page.evaluate("""([m, s, c, png]) => { const g = window.rikuy; g.files = new Map([['main.tex', m], ['rikuy.sty', s], ['widgets/clt.html', c]]);
          g.addAsset('figures/clt.png', new Blob([Uint8Array.from(atob(png), (x) => x.charCodeAt(0))], { type: 'image/png' })); g.forceRender = true; g.rebuild(); }""", [MAIN, STY, CLT, base64.b64encode(PNG).decode()])
        check('one\'s own project runs its widget at once', wait_frames(page, 1) and not page.evaluate("document.querySelector('.w-run')"))

        # five widgets of about 60 KB each, as the website's lecture notes export
        figs = ''.join('\\begin{figure}[ht]\n  \\centering\n  \\rikuywidget[width=\\textwidth]{widgets/w%d.html}{figures/w%d.png}\n  \\caption{Widget %d.}\n\\end{figure}\n\nText after figure %d.\n\n' % (k, k, k, k) for k in range(5))
        big_main = MAIN.replace('\\end{document}', figs + '\\end{document}')
        big = {'main.tex': big_main, 'rikuy.sty': STY, 'widgets/clt.html': CLT, 'figures/clt.png': PNG}
        for k in range(5):
            big['widgets/w%d.html' % k] = big_widget(k)
            big['figures/w%d.png' % k] = PNG
        sizes = [len(big['widgets/w%d.html' % k]) for k in range(5)]
        t0 = time.time()
        open_zip(page, make_zip(os.path.join(TMP, 'big.zip'), big))
        ok = run_widgets(page, 6)
        dt = time.time() - t0
        check('five 60 KB widgets (and the sample\'s) open and run', ok and min(sizes) > 59000, (sizes, page.evaluate('window.rikuy.widgets.frames.size')))
        print('   widgets of %s bytes: all running %.1f s after the .zip was chosen and Run clicked' % (sizes, dt))
        check('they lie over their boxes', aligned(page))
        url = page.evaluate("async () => (await window.rikuy.makeShareLink('coauthor')).url")
        lf = link_files(url)
        check('a share link carries all of them, byte for byte', all(lf.get('widgets/w%d.html' % k) == big['widgets/w%d.html' % k] for k in range(5)))
        note = page.evaluate("(u) => window.rikuy.linkNote({ url: u, figures: 6 })", url)
        print('   share link: %d characters for %d KB of widgets' % (len(url), sum(sizes) // 1024))
        check('the link\'s note says when a link is long', len(url) < 60000 or 'long' in note, (len(url), note))
        huge = page.evaluate("() => window.rikuy.linkNote({ url: 'x'.repeat(2200000), figures: 0 })")
        check('and past what Chrome opens from its address bar, to paste it or send the .zip', 'pastes it onto this page' in huge and '.zip' in huge, huge)
        page.wait_for_timeout(1200)  # the project is kept in this browser (persist waits 700 ms)
        page.reload()
        page.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=30000)
        check('after a reload all six run again from what the browser kept, with no second click', wait_frames(page, 6) and not page.evaluate("document.querySelector('.w-run')"))
        check('no page errors with the large widgets', not errors, errors[:3])
        browser.close()
except Exception as e:
    # a run that stops part way has failed, whatever the checks before it said
    traceback.print_exc()
    check('the run reaches its end', False, e)
bad = [r for r in results if not r[1]]
print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
sys.exit(1 if bad else 0)
