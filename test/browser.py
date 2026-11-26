"""Rikuy browser tests: load the built page in Chromium, type on the
typeset pages, and check the .tex source changes exactly as intended."""
import json, os, sys, time, re, tempfile
from playwright.sync_api import sync_playwright, Page as _Page, Frame as _Frame

# The build machine keeps Chromium in /opt/pw-browsers. Anywhere else Playwright's own default
# must stay, or it would miss a browser installed the usual way (`playwright install`). Every
# test imports this module before it starts Playwright, so this covers them all.
if os.path.isdir('/opt/pw-browsers'): os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import serve
NM = os.path.join(ROOT, 'node_modules')
SHOTS = os.environ.get('SHOTS', os.path.join(tempfile.gettempdir(), 'rikuy-shots'))
os.makedirs(SHOTS, exist_ok=True)

SKELETON_HEAD = ('<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">'
                 '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
                 'body{margin:0;font:14px system-ui,sans-serif;background:#fafafa}img{max-width:100%}[hidden]{display:none!important}</style></head><body>')

ROUTES = {
    'https://cdn.jsdelivr.net/npm/katex@0.19.1/dist/katex.min.js': os.path.join(NM, 'katex/dist/katex.min.js'),
    'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/lib/codemirror.js': os.path.join(NM, 'codemirror/lib/codemirror.js'),
    'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/mode/stex/stex.js': os.path.join(NM, 'codemirror/mode/stex/stex.js'),
    'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/addon/edit/matchbrackets.js': os.path.join(NM, 'codemirror/addon/edit/matchbrackets.js'),
    'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js': os.path.join(NM, 'jszip/dist/jszip.min.js'),
    'https://cdn.jsdelivr.net/npm/mathlive@0.110.0/mathlive.min.js': os.path.join(NM, 'mathlive/mathlive.min.js'),
    'https://cdn.jsdelivr.net/npm/katex@0.19.1/dist/contrib/mhchem.min.js': os.path.join(NM, 'katex/dist/contrib/mhchem.min.js'),
}

# The page runs without 'unsafe-eval' (build/app.mjs policy), and Playwright checks a
# wait_for_function given as an expression by eval() inside the page each time it polls, which
# that policy refuses. Given as a function, it is compiled once from outside the page and polled
# without eval: every test that imports this module has its expressions handed over as one.
_FUNCTION = re.compile(r'^\s*(async\s+)?(function\b|\([^()]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)')
for _C in (_Page, _Frame):
    def _wait(self, expression, *a, _orig=_C.wait_for_function, **k):
        if isinstance(expression, str) and not _FUNCTION.match(expression):
            expression = '() => (\n' + expression + '\n)'
        return _orig(self, expression, *a, **k)
    _C.wait_for_function = _wait


def policy(dist, path, connect=()):
    """The headers a file of the page gets here: the hosted copy's policy for that path, as
    dist/_headers gives it, with jsDelivr for rikuy.html's libraries (serve.headers_for). Every
    test that opens the page runs it, its workers and its live figures under that policy.
    connect: addresses added to connect-src, for a test's own servers standing in for hosts the
    hosted copy reaches through its git proxy (test/git.py)."""
    h = dict(serve.headers_for(dist, path))
    if connect:
        k = next((k for k in h if k.lower() == 'content-security-policy'), None)
        if k and "connect-src " in h[k]:
            h[k] = re.sub(r"(connect-src [^;]*)", lambda m: m.group(1) + ' ' + ' '.join(connect), h[k], count=1)
    return h


results = []
_CHECK_LOG = os.environ.get('RIKUY_CHECK_LOG')


# (the log is for setting two runs side by side, so what is measured in time, which differs from
# run to run, is written as <t>: a number with ms or s after it, a float with the long tail of
# performance.now() arithmetic (layout's own fractions stop at 1/64 px, six places), and the
# whole detail of a check whose name gives a time in ms, a latency or a long task)
_TIMED = re.compile(r'\d\s?ms\b|\bms\b|latency|long(est)? tasks?|median', re.I)


def _steady(text):
    text = re.sub(r'\d+(?:\.\d+)?(?=\s?(?:ms|s)\b)', '<t>', text)
    return re.sub(r'\d+\.\d{8,}', '<t>', text)


def check(name, cond, detail=''):
    results.append((name, bool(cond), detail))
    if _CHECK_LOG:
        with open(_CHECK_LOG, 'a') as f:
            f.write(json.dumps([_steady(name), bool(cond), '<timed>' if _TIMED.search(name) else _steady(repr(detail)[:4000])]) + '\n')
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else '  :: ' + str(detail)[:300]))
    return bool(cond)


# The setting File › Options › Animations keeps (src/motion.js): the tests of features run with it
# off, so what they measure (a menu's place, a target's size, a screenshot) is never caught half
# way through a 150 ms entrance; test/motion.py runs with it on (open_page(motion=True)), and
# RIKUY_MOTION=1 runs any suite with motion on.
# What the page's timers will do and when (every context open_page() makes): each setTimeout that
# has not yet run, by the time it is due; and how many of its IndexedDB writes (readwrite
# transactions) have not yet come back, for stored(). setInterval is not tracked: a wait on what an
# interval does needs a condition of its own. settle(page, ms) waits for those due within ms, the work
# a fixed wait of ms let run, and no others. The test's own waits use the timers kept raw here, so
# they wait on nothing of their own. Transparent to the page: same ids, same calls, same order.
TIMERS = """(() => { if (window.__rkT) return; const raw = { st: setTimeout.bind(window), ct: clearTimeout.bind(window) }, due = new Map();
  window.setTimeout = function (fn, ms, ...a) { if (typeof fn !== 'function') return raw.st(fn, ms, ...a); const id = raw.st(function () { due.delete(id); if (typeof fn === 'function') return fn.apply(this, a); }, ms); due.set(id, performance.now() + Math.max(0, Number(ms) || 0)); return id; };
  window.clearTimeout = function (id) { due.delete(id); return raw.ct(id); };
  const w = { n: 0 }, tx = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (stores, mode, ...r) { const t = tx.call(this, stores, mode, ...r);
    if (mode === 'readwrite') { w.n++; let open = true; const end = () => { if (open) { open = false; w.n--; } }; t.addEventListener('complete', end); t.addEventListener('abort', end); }
    return t; };
  window.__rkT = { raw, due, writes: w }; })()"""
# (the raw timer where TIMERS is in, for the test's own waits: no timer of the page's)
_RAW = '(window.__rkT ? window.__rkT.raw.st : setTimeout)'

MOTION_OFF = "try { if (!localStorage.getItem('rikuy.motion.v1')) localStorage.setItem('rikuy.motion.v1', JSON.stringify({ anim: false, caret: false })); } catch (e) {}"


# A window under 700 px opens in Mobile View (Web Layout) unless Print Layout was chosen on it. The
# suites written for a phone's Print Layout (its pages, margins, headers, the sheet's zoom) say so
# with this script, as a person's tap on Mobile View would: it marks Print Layout chosen when
# nothing is (test/ux.py tests Mobile View itself, with layout='mobile').
PRINT_LAYOUT = '''(() => { try { const k = 'galley.prefs.v1', p = JSON.parse(localStorage.getItem(k) || 'null') || {};
  if (p.narrowWeb === undefined) { p.narrowWeb = false; localStorage.setItem(k, JSON.stringify(p)); } } catch (e) {} })()'''


# One Chromium per process and Playwright instance. Each open_page() call gets a context of its own
# (its viewport, scheme, touch, storage, routes and policy), which is all a fresh browser gave it,
# without a launch per call (ux.py launched 79).
_SHARED = {}


def shared_browser(p):
    """The Chromium for this call, and whether it is the call's own: the shared one, launched with
    CHROME_ARGS as they were at the first call; where CHROME_ARGS now say otherwise (para.py's
    hinting() with --font-render-hinting=full), one launched with them for this call alone, closed
    with its contexts."""
    args = tuple(a for a in os.environ.get('CHROME_ARGS', '').split() if a)
    b = _SHARED.get(id(p))
    if b is None or b[0] is not p or not b[1].is_connected():
        b = _SHARED[id(p)] = (p, p.chromium.launch(args=list(args)), args)
    if b[2] == args:
        return b[1], False
    return p.chromium.launch(args=list(args)), True


class _Contexts:
    """The browser open_page() returns: the shared Chromium, whose close() closes the contexts this
    call made (and any a suite made through it), never the browser the next call reuses; or a
    browser of the call's own (other launch arguments), which close() closes as well."""
    def __init__(self, browser, own=False):
        self._browser, self._contexts, self._own = browser, [], own

    def new_context(self, *a, **k):
        c = self._browser.new_context(*a, **k)
        self._contexts.append(c)
        return c

    def new_page(self, *a, **k):
        pg = self._browser.new_page(*a, **k)
        self._contexts.append(pg.context)
        return pg

    def close(self, *a, **k):
        for c in self._contexts:
            c.close()
        self._contexts = []
        if self._own:
            self._browser.close()

    def __getattr__(self, name):
        return getattr(self._browser, name)


def open_page(p, width=1400, height=1000, dark=False, clear=True, init=None, touch=False, connect=(), layout='print', motion=None):
    # touch: a phone's page (a touch screen, a mobile viewport: pointer coarse, no hover; tap())
    # layout: 'print', a window under 700 px opens in Print Layout; 'mobile', in its default
    # motion: animations on (True) or off (False); None: off unless RIKUY_MOTION=1
    browser = _Contexts(*shared_browser(p))
    ctx = browser.new_context(viewport={'width': width, 'height': height}, color_scheme='dark' if dark else 'light', device_scale_factor=1, has_touch=touch, is_mobile=touch)
    if layout == 'print' and width < 700:
        ctx.add_init_script(PRINT_LAYOUT)
    page = ctx.new_page()
    errors = []
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    page.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
    dist = os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist')
    html = open(os.path.join(dist, 'rikuy.html'), encoding='utf8').read()
    doc = SKELETON_HEAD + html + '</body></html>'

    def handler(route):
        url = route.request.url
        if url.startswith('https://rikuy.test/'):
            path = url[len('https://rikuy.test/'):].split('?')[0]
            f = os.path.join(dist, path)
            # (a page file at its address without .html, as Pages serves it: the widget document)
            if path and not os.path.isfile(f) and os.path.isfile(f + '.html'): f, path = f + '.html', path + '.html'
            if path and os.path.isfile(f):
                ct = 'text/javascript' if path.endswith(('.js', '.mjs')) else 'application/wasm' if path.endswith('.wasm') else 'text/html; charset=utf-8' if path.endswith('.html') else 'application/octet-stream'
                return route.fulfill(status=200, content_type=ct, headers=policy(dist, '/' + path, connect), body=open(f, 'rb').read())
            return route.fulfill(status=200, content_type='text/html; charset=utf-8', headers=policy(dist, '/', connect), body=doc)
        if url.startswith('http://127.0.0.1:'):
            return route.continue_()
        if url in ROUTES:
            # the npm package's own bytes, which the page checks against its integrity hashes;
            # the CDN answers with CORS, as a script loaded with crossorigin needs
            return route.fulfill(status=200, content_type='application/javascript', headers={'Access-Control-Allow-Origin': '*'}, body=open(ROUTES[url], 'rb').read())
        return route.abort()
    # on the context, so a second tab (page.context.new_page()) loads the same page and storage
    ctx.route('**/*', handler)
    ctx.add_init_script(TIMERS)
    if not (motion if motion is not None else os.environ.get('RIKUY_MOTION') == '1'):
        ctx.add_init_script(MOTION_OFF)
    if init:
        page.add_init_script(init)
    page.goto('https://rikuy.test/')
    if clear:
        page.evaluate('localStorage.clear()')
        page.reload()
    page.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=20000)
    # init goes on after the boot screen hides (the review, a shared link, the first caret): the
    # page is the test's once it has settled rikuy.ready, as rikuy.api.whenReady() says, and drawn
    page.evaluate('() => window.rikuy.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))')
    fonts_settled(page)
    # (the relayout a font arriving during fonts_settled() sets going, 200 ms after; the old open_page slept 300)
    settle(page, 300)
    return browser, page, errors


# (tap(): a tap's click, seen by the page, or none to come: the page took the touch's end itself)
_TAP_WATCH = """([x, y]) => { const S = window.__rkTap = { click: false, end: false, prevented: false, off: x != null && !document.elementFromPoint(x, y) }, st = RAW;
  addEventListener('click', () => { S.click = true; }, { capture: true, once: true });
  addEventListener('touchend', (e) => { S.end = true; st(() => { S.prevented = e.defaultPrevented; }, 0); }, { capture: true, once: true }); }""".replace('RAW', _RAW)
# Chromium makes two taps closer than its double tap time (350 to 450 ms here) and near each other
# a double tap, three a triple: a word or a paragraph selected
DOUBLE_TAP = 500
_TAPS = {}


def tap(page, target, ms=0):
    """A finger's tap on target (a locator, or a point x, y), as one tap: kept DOUBLE_TAP ms from the
    tap before it where that one was near (100 px), so Chromium makes no double tap of them; then
    the click the tap becomes, which Chromium sends after tap() returns, seen by the page (or the
    page's touchend handler taking the touch, or a frame's document having it, so none comes here;
    2 s at most); then settle(page, ms)."""
    if isinstance(target, (tuple, list)):
        x, y = target
    else:
        target.scroll_into_view_if_needed()
        b = target.bounding_box()
        x, y = (b['x'] + b['width'] / 2, b['y'] + b['height'] / 2) if b else (None, None)
    last = _TAPS.get(id(page))
    if last and last[0] is page and x is not None and last[2] is not None:
        gap = (time.monotonic() - last[1]) * 1000
        if gap < DOUBLE_TAP and abs(x - last[2]) < 100 and abs(y - last[3]) < 100:
            # (the time is what keeps two taps two: Chromium's double tap window)
            page.wait_for_timeout(DOUBLE_TAP - gap)
    page.evaluate(_TAP_WATCH, [x, y])
    if isinstance(target, (tuple, list)):
        page.touchscreen.tap(x, y)
    else:
        target.tap()
    _TAPS[id(page)] = (page, time.monotonic(), x, y)
    # (the touch's end is the page's by the time tap() returns: none there, the touch went to a frame
    # of its own, a live figure, whose click this page never sees)
    # (nor a point outside the window, where no element is to be clicked)
    until(page, '() => { const S = window.__rkTap; return !S || S.click || !S.end || S.prevented || S.off; }', timeout=2000)
    settle(page, ms)


def fonts_settled(page):
    """The page's fonts are in and the page laid out again for them: a font that arrives after init
    lays the page out anew 200 ms after its loadingdone (src/app.js), which once dropped a
    selection, the caret's place and a ghost line made in between."""
    until(page, "() => document.fonts.status === 'loaded'", timeout=20000)
    settle(page, 200, full=True)


def download(page, el='b-save'):
    """Press a download as a person would at this width: its button (#b-save LaTeX, #rb-pdf, #rb-word)
    where the row shows it, else the one Download button and its item of the same name."""
    if page.locator('#' + el).is_visible():
        return page.click('#' + el)
    name = page.get_attribute('#' + el, 'aria-label')
    # (the click waits for the menu's item to be visible, stable and enabled)
    page.click('#rb-dl-menu')
    page.get_by_role('menuitem', name=name, exact=True).click()


def src(page, f='main.tex'):
    return page.evaluate('(f) => window.rikuy.files.get(f)', f)


def wait_src(page, text, f='main.tex', timeout=5000):
    # edits that go through a debounce or the math field land a moment later on a busy machine
    try:
        page.wait_for_function('([f, t]) => (window.rikuy.files.get(f) || "").includes(t)', arg=[f, text], timeout=timeout)
    except Exception:
        pass


# A selection set by a script is announced by a selectionchange event the browser sends later, as
# a task of its own; the page's handlers (where the caret was last on the page, the selection the
# font boxes keep, the ghost paragraph given up) run then. A key pressed before that task could be
# handled first, since input goes ahead of other tasks. The helpers that set a selection return
# this: a promise, which page.evaluate awaits, settled once the event has reached every listener
# of the page (this one was added last, so it runs after them). removeAllRanges() then addRange()
# always sends one; the timer only keeps a lost event from hanging the suite.
def _seen(fallback=_RAW + '(go, 1000)'):
    return """new Promise((done) => { let n = 0; const go = () => { if (n++) return; document.removeEventListener('selectionchange', go); done(true); };
      document.addEventListener('selectionchange', go); FALLBACK; })""".replace('FALLBACK', fallback)


_SEEN = _seen()


def click_text(page, text, offset_chars=0, nth=0):
    """Place the caret inside the first rendered span containing text, after offset chars."""
    ok = page.evaluate('''([text, off, nth]) => {
      const spans = [...document.querySelectorAll('#pages span.t')].filter(s => s.textContent.includes(text));
      const s = spans[nth]; if (!s) return false;
      const i = s.textContent.indexOf(text) + off;
      const r = document.createRange(); r.setStart(s.firstChild, i); r.collapse(true);
      const el = document.getElementById('pages'); el.focus();
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      return SEEN; }'''.replace('SEEN', _SEEN), [text, offset_chars, nth])
    return ok


def select_text(page, text, nth=0):
    return page.evaluate('''([text, nth]) => {
      const spans = [...document.querySelectorAll('#pages span.t')].filter(s => s.textContent.includes(text));
      const s = spans[nth]; if (!s) return false;
      const i = s.textContent.indexOf(text);
      const r = document.createRange(); r.setStart(s.firstChild, i); r.setEnd(s.firstChild, i + text.length);
      document.getElementById('pages').focus();
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      return SEEN; }'''.replace('SEEN', _SEEN), [text, nth])


def load_doc(page, files, main='main.tex'):
    """Replace the project with these files, as opening them would, without its toasts."""
    if isinstance(files, str):
        files = {main: files}
    page.evaluate('''([files, main]) => { const g = window.rikuy; g.files = new Map(Object.entries(files)); g.main = main; g.hist = []; g.redoStack = []; g.forceRender = true; g.rebuild(); if (g.cm) g.showSrcFile(main); }''', [files, main])
    # (rebuild() draws the pages before it returns: the next step finds them drawn)



def place(page, select):
    """The caret or the selection the way a round trip names it: 'words' selects those words (the
    first place they are drawn), ('words', k) puts the caret k characters into them, ('from', 'to')
    selects from the start of one to the end of the other, a function does it itself."""
    if callable(select):
        # (a suite's own placing: its selectionchange has reached the page, or, where it moved
        # nothing and sent none, the tasks queued before the next frame have run)
        page.evaluate('() => { window.__rkSel = 0; document.addEventListener("selectionchange", () => { window.__rkSel++; }, { once: true }); }')
        select(page)
        page.evaluate('() => window.__rkSel || ' + _seen('requestAnimationFrame(() => ' + _RAW + '(go, 0))'))
    elif isinstance(select, str):
        select_text(page, select)
    elif isinstance(select[1], int):
        click_text(page, select[0], select[1])
    else:
        page.evaluate('''([a, z]) => { const sp = [...document.querySelectorAll('#pages span.t')]; const s = sp.find((x) => x.textContent.includes(a)), e = sp.find((x) => x.textContent.includes(z));
          const r = document.createRange(); r.setStart(s.firstChild, s.textContent.indexOf(a)); r.setEnd(e.firstChild, e.textContent.indexOf(z) + z.length);
          document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); return SEEN; }'''.replace('SEEN', _SEEN), list(select))
    # (and what the move set going on timers: the ruler's markers at 90 ms, the status bar at 120)
    settle(page, 120, full=True)


def pressed(page, command):
    """What the command's control shows where the caret is: pressed (True), not (False), or None for a command that is no toggle."""
    return page.evaluate('''(id) => { const c = window.rikuy.cmds.command(id), at = window.rikuy.ribbonAt(); if (at) at.memo = {}; if (!c.on) return null; const v = c.on(window.rikuy, at); return v == null ? null : !!v; }''', command)


def landed(page, before, h, f='main.tex', timeout=5000, ms=0):
    """A command's step has landed: the source is no longer before, or the history no longer h
    steps long. A command run by its id is done when runCommand returns (or the promise it returns
    settles); one given as a function of the page, or a dialog's button, may land a moment later.
    A step that never lands is the check's to report: the wait gives up and the check fails."""
    try:
        page.wait_for_function('([f, t, h]) => (window.rikuy.files.get(f) ?? "") !== t || window.rikuy.hist.length !== h', arg=[f, before, h], timeout=timeout)
    except Exception:
        pass
    # (and what the step set going: its next frame, and its timers due within ms, settle())
    settle(page, ms)


# (a frame, then a task; where frames do not come, a page in the background, 100 ms instead)
_FRAME = """() => new Promise((r) => { const st = RAW; let n = 0; const go = () => { if (!n++) st(r, 0); }; requestAnimationFrame(go); st(go, 100); })""".replace('RAW', _RAW)
# (frames until no timer of the page's due by then waits; once one ran, a frame more for what it queued)
_SETTLE = """([ms, after, writes]) => new Promise((done) => { const T = window.__rkT, g = window.rikuy, end = performance.now() + ms, st = T ? T.raw.st : setTimeout; let ran = false;
  if (!T && writes) return done(null);
  const busy = () => (!!T && [...T.due.values()].some((d) => d <= end)) || after.some((k) => g && g[k] && g[k].pending && g[k].pending()) || (writes && !!T && T.writes.n > 0);
  const next = (f) => { let n = 0; const go = () => { if (!n++) st(f, 0); }; requestAnimationFrame(go); st(go, 100); };
  const t0 = performance.now(), step = () => next(() => { if (busy()) { ran = true; if (performance.now() - t0 > 10000) done(false); else step(); } else if (ran) { ran = false; step(); } else done(true); }); if (T) step(); else st(step, ms); })"""


def _settled(page, arg):
    # (work named in after, or a write, that never stops waiting is a bug of its own: raised)
    r = page.evaluate(_SETTLE, arg)
    if r is False:
        raise RuntimeError('the page never settled in 10 s: %r' % (arg,))
    if r is None:
        raise RuntimeError('stored() needs the TIMERS init script in this context (add_init_script(TIMERS))')


def frame(page):
    """What the last step queued has run: the next frame's callbacks (a menu placed, the ribbon
    fitted) and the tasks queued before them (the letters typed in one batch, a timer of 0)."""
    page.evaluate(_FRAME)


# (the page's own refreshes a step sets going at once: the ribbon's, 60 ms after the caret moved)
SOON = 80


# (the repaints every rebuild of the page sets going: Track Changes' marks at 180 ms, comments at
# 200; settle(page, ms, after=REPAINTS) before a check on them, cheaper than full=True)
REPAINTS = ('marksSoon', 'commentsSoon')


def settle(page, ms=0, full=False, after=()):
    """The wait after a step, for what the step set going: its next frame (a menu placed, the
    ribbon fitted, the letters typed in one batch) and every timer of the page's due within ms (the
    page laid out again 150 ms after a resize, the caret scrolled into sight after 120 ms, a
    debounced push), then the frame after them: what a fixed wait of ms let happen, without waiting
    out the rest of it. ms is the time the step once slept; full is kept for the calls that name it
    and changes nothing. Where the context has no TIMERS hook, the fixed wait of ms itself. Work that
    is not a timer (a fetch, a worker, a module loaded, IndexedDB) needs a condition of its own, and a
    check that something does NOT happen within a time keeps that time as a fixed wait.
    RIKUY_WAIT_SHADOW=1 waits ms as well and prints SHADOW
    where the page still moved; RIKUY_CHECK_LOG keeps what every check saw, to set beside a run
    with the old times. after names the page's debounced work to wait for as well, whenever it
    is due (rikuy[name].pending(): REPAINTS, srcRebuild, syncSoon, problemsSoon...)."""
    # (every timer due within ms, full or not: a wait of SOON alone let a check run before what the
    # old fixed wait let happen, which a negative check or an error check cannot tell: PR 109's review)
    _settled(page, [ms or 0, list(after), False])
    if _SHADOW and ms:
        # (where: the line that waited, and the line that called it when that was a suite's helper)
        f, at = sys._getframe(1), []
        while f and len(at) < 3:
            at.append(os.path.basename(f.f_code.co_filename) + ':' + str(f.f_lineno))
            f = f.f_back
        shadow(page, ms, '<'.join(at))


# (saved(): a save's writes have all come back when persist() calls noteSaveState with what they
# kept, the status bar's Saved; the hook counts those calls, the page's own call going on as before)
_SAVE_HOOK = """() => { const g = window.rikuy; if (!g.__rkSaveHook) { const f = g.noteSaveState;
  g.noteSaveState = function (kept) { if (kept !== undefined) g.__rkSaves = (g.__rkSaves || 0) + 1; return f.apply(this, arguments); }; g.__rkSaveHook = true; }
  g.__rkSaves0 = g.__rkSaves || 0; return !!g.unsaved; }"""
# (no edit waiting to be saved, and the copy IndexedDB holds is the one this tab last wrote or
# took, savedT: its own save back, or another tab's taken in; read in turns of 50 ms for at most
# timeout ms, as a read made after a write of the page's sees that write)
_KEPT = """(timeout) => new Promise((done) => { const g = window.rikuy, st = RAW, t0 = performance.now();
  const kept = () => new Promise((ok) => { if (g.unsaved) return ok(false); if (g.noIdb || !g.savedT) return ok(true);
    const r = indexedDB.open('galley'); r.onerror = () => ok(false);
    r.onsuccess = () => { const db = r.result; try { const q = db.transaction('kv').objectStore('kv').get('project'); q.onsuccess = () => { db.close(); ok(!!q.result && q.result.t === g.savedT); }; q.onerror = () => { db.close(); ok(false); }; } catch (e) { db.close(); ok(false); } }; });
  const turn = () => kept().then((y) => y ? done(true) : performance.now() - t0 > timeout ? done(false) : st(turn, 50)); turn(); })""".replace('RAW', _RAW)


def kept(page, timeout=5000):
    """This tab's copy and IndexedDB's agree (_KEPT): what it saved is written, or what another
    tab saved is taken in (on being shown). Whether they came to: the next check reports one that
    never did."""
    return page.evaluate(_KEPT, timeout)


def stored(page, ms=0):
    """What the page writes to IndexedDB has been written: its timers due within ms run (full),
    then no readwrite transaction of its own still open (the project, Undo's history, versions,
    Track Changes' base, a coauthor's names). A write started after an await on something else
    is not seen in between: wait for the step's own sign first where there is one."""
    settle(page, ms, full=True)
    _settled(page, [0, [], True])


def saved(page, ms=1200):
    """The project kept in this browser, as a reload or another tab reads it: an edit waiting to be
    saved has been, its writes all back (the version another tab's text became too), or, with
    none waiting, the copy in IndexedDB is this tab's last. Whether it was: a save that never comes
    back is the next check's to report."""
    waiting = page.evaluate(_SAVE_HOOK)
    settle(page, ms, full=True)
    ok = until(page, '() => (window.rikuy.__rkSaves || 0) > window.rikuy.__rkSaves0') if waiting else kept(page)
    # (and any other write the save set going: the version another tab's text became)
    _settled(page, [0, [], True])
    return ok


def ready(page):
    """The page loaded (again) has gone through init: its boot screen gone is not yet that (the
    review, a shared link, the source pane a setting keeps and the first caret come after it),
    rikuy.ready is (rikuy.api.whenReady())."""
    page.wait_for_function('window.rikuy && window.rikuy.ready && document.getElementById("boot").hidden', timeout=30000)
    page.evaluate('() => window.rikuy.ready.then(() => true)')
    fonts_settled(page)


def until(page, fn, arg=None, timeout=5000):
    """Wait for fn (a function of the page, given arg) to be true, as the step before it promised;
    whether it came. One that never comes is the next check's to report: no exception here, so
    the check fails with its own words and the suite goes on."""
    try:
        page.wait_for_function(fn, arg=arg, timeout=timeout)
        return True
    except Exception:
        return False


# RIKUY_WAIT_SHADOW=1: after each condition wait that replaced a fixed one, wait that fixed time
# as well and print SHADOW with what moved in it (the files, the history, the caret, the focus,
# the selection, a field's value, a scroll position, the saved copy, a part of the page by its id):
# evidence that the condition is all the next step needed, since the step after it then sees what
# it saw after the fixed time (a line of its own, never a PASS or FAIL).
_SHADOW = os.environ.get('RIKUY_WAIT_SHADOW') == '1'
_STATE = '''() => { const h = (s) => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return (x >>> 0).toString(36) + ':' + s.length; };
  const g = window.rikuy, o = {}, c = g && g.caretNow && g.caretNow();
  if (g) { o.files = h([...g.files].map(([k, v]) => k + '\\0' + v).join('\\1')); o.hist = g.hist.length; o.caret = c ? [c.f, c.p, c.a, c.b].join() : ''; o.saved = String(g.savedT); }
  const a = document.activeElement; o.focus = a ? a.tagName + '#' + a.id + '.' + a.className : '';
  const s = getSelection(); o.sel = s.rangeCount ? [s.anchorNode && s.anchorNode.nodeName, s.anchorOffset, s.focusNode && s.focusNode.nodeName, s.focusOffset, h(String(s))].join() : '';
  o.vals = h([...document.querySelectorAll('input, textarea, select')].map((e) => e.type === 'checkbox' || e.type === 'radio' ? e.checked : e.value).join('\\1'));
  o.scroll = [...document.querySelectorAll('*')].filter((e) => e.scrollTop || e.scrollLeft).map((e) => (e.id || e.className) + ':' + e.scrollTop + ',' + e.scrollLeft).join('|');
  try { o.ls = h(JSON.stringify(Object.entries(localStorage))); } catch (e) { o.ls = ''; }
  for (const e of document.querySelectorAll('body > *, #app > *, #main > *, #w > *')) if (e.tagName !== 'SCRIPT' && e.tagName !== 'STYLE') o['#' + (e.id || e.tagName + '.' + String(e.className).slice(0, 24))] = h(e.outerHTML);
  return o; }'''


def shadow(page, ms, where):
    if not _SHADOW:
        return
    a = page.evaluate(_STATE)
    # (the page's debounced work still waiting as the fixed time starts: what moved, by name)
    soon = page.evaluate('() => { const T = window.__rkT, t = performance.now(); return T ? [...T.due.values()].map((d) => Math.round(d - t)).sort((x, y) => x - y).slice(0, 8) : ["no timers"]; }')
    page.wait_for_timeout(ms)
    b = page.evaluate(_STATE)
    moved = sorted(k for k in set(a) | set(b) if a.get(k) != b.get(k))
    if moved:
        print('SHADOW ' + where + ' :: ' + ' '.join(moved)[:300] + ' :: timers due in ms: ' + ' '.join(map(str, soon)))


def roundtrip(page, doc, select, command, expected, forms=(), off=None, label=None, off_command=None):
    """The round trip rule of GAP section 0 as one call, for a command of the registry:
    1. on the document doc, with select placed (see place()), the command writes exactly expected,
       as one step of history; 2. one Undo gives doc back byte for byte; 3. the page rebuilt from
       expected shows the command's state (its control pressed) with the same words selected;
    4. each hand written form (a source with the same construct written another way) shows the
       state, and the command takes exactly that form off: doc again; 5. the command on expected
       restores doc (or off, when the command leaves a preamble line it added). command is an id
       (run as its button runs it) or a function of the page; off_command the command that turns it
       off where that is another (Normal for a heading); expected a string or a test of the source.
       Returns whether every step held; each is a check() of its own."""
    name = label or (command if isinstance(command, str) else command.__name__)
    runner = lambda cmd: (lambda: page.evaluate('(id) => window.rikuy.runCommand(id)', cmd)) if isinstance(cmd, str) else (lambda: cmd(page))
    run, undo_run = runner(command), runner(off_command or command)
    want = (lambda t: t == expected) if isinstance(expected, str) else expected
    back = doc if off is None else off
    ok = []
    load_doc(page, doc); place(page, select)
    h0 = page.evaluate('window.rikuy.hist.length')
    run(); landed(page, doc, h0, ms=200)
    got = src(page)
    ok.append(check(name + ': writes exactly the LaTeX expected, as one step', want(got) and page.evaluate('window.rikuy.hist.length') == h0 + 1, got[-160:]))
    # (undo() puts the text back and draws the page before it returns)
    page.evaluate('window.rikuy.undo()'); settle(page, 150)
    ok.append(check(name + ': one undo gives the source back byte for byte', src(page) == doc, src(page)[-160:]))
    toggle = pressed(page, command) is not None if isinstance(command, str) else False
    if isinstance(expected, str):
        load_doc(page, expected); place(page, select)
        if toggle:
            ok.append(check(name + ': read back from that source, the control shows it', pressed(page, command) is True))
        undo_run(); landed(page, expected, 0, ms=200)
        ok.append(check(name + ': again on it, the bytes of before (off restores)', src(page) == back, src(page)[-160:]))
    for form in forms:
        load_doc(page, form); place(page, select)
        if toggle:
            ok.append(check(name + ': a hand written form shows as it: ' + form[form.find('\\begin{document}') + 16:][:40].strip(), pressed(page, command) is True))
        undo_run(); landed(page, form, 0, ms=200)
        ok.append(check(name + ': and takes off exactly that form', src(page) == back, src(page)[-160:]))
    return all(ok)


def tiny_pdf():
    """A one page PDF with a blue box, written out here so the check needs no TeX."""
    stream = b'0 0 1 rg 20 20 160 60 re f'
    objs = [b'<< /Type /Catalog /Pages 2 0 R >>', b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R >>',
            b'<< /Length %d >>\nstream\n' % len(stream) + stream + b'\nendstream']
    out, offs = bytearray(b'%PDF-1.4\n'), []
    for i, o in enumerate(objs, 1):
        offs.append(len(out))
        out += b'%d 0 obj\n' % i + o + b'\nendobj\n'
    xref = len(out)
    out += b'xref\n0 %d\n0000000000 65535 f \n' % (len(objs) + 1) + b''.join(b'%010d 00000 n \n' % o for o in offs)
    out += b'trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objs) + 1, xref)
    return bytes(out)


def pdfjs_local(page, origin):
    """pdf.js loads from the page's own site and shows a PDF. A module import() takes no
    integrity hash, so pdf.js from a CDN would run whatever the CDN sent as the page; the
    routes answer only the CDN files the page pins (ROUTES), so a script from anywhere else
    fails here."""
    import base64
    reqs = []
    page.on('request', lambda r: reqs.append((r.url, r.resource_type)))
    n = page.evaluate('''async (b64) => { const g = window.rikuy; const had = g.lastPdf; g.lastPdf = had || {}; g.pdfStale = false;
      g.togglePdf(true); try { await g.pdfView.show(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))); return g.pdfView.doc.numPages; }
      catch (e) { return String(e); } finally { g.togglePdf(false); g.lastPdf = had; } }''', base64.b64encode(tiny_pdf()).decode())
    mine = [u for u, t in reqs if u == origin + 'tex/pdf.min.mjs']
    foreign = [u for u, t in reqs if t == 'script' and not u.startswith(origin) and u not in ROUTES]
    check('pdf.js comes from the page\'s own site (tex/pdf.min.mjs) and shows a PDF', n == 1 and mine, (n, reqs[:6]))
    check('and no script comes from another site without an integrity hash', not foreign, foreign)


def ui_fonts(page):
    """The interface's fonts ship inside the page: loading it asks nothing of Google's font
    servers (which would learn the address of everyone who opens it), and its text is drawn in
    IBM Plex Sans and Mono, the faces the page carries, not in a system font."""
    reqs = []
    page.on('request', lambda r: reqs.append(r.url))
    page.reload()
    page.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=20000)
    google = [u for u in reqs if re.match(r'https?://fonts\.(googleapis|gstatic)\.com/', u)]
    check('loading the page asks nothing of fonts.googleapis.com or fonts.gstatic.com', reqs and not google, google[:3])
    faces = page.evaluate('''async () => { const out = [];
      for (const f of ['400 13px "IBM Plex Sans"', '500 13px "IBM Plex Sans"', '600 13px "IBM Plex Sans"', '400 13px "IBM Plex Mono"', '500 13px "IBM Plex Mono"'])
        out.push((await document.fonts.load(f, 'Rikuy')).filter((x) => x.status === 'loaded').length && document.fonts.check(f, 'Rikuy'));
      document.body.insertAdjacentHTML('beforeend', '<div id="monoprobe" style="font: 500 12px var(--font-mono)">pitem 0123</div>');
      return out; }''')
    # what Chromium drew the text with: the fonts it used for a toolbar label and a line of mono
    cdp = page.context.new_cdp_session(page)
    cdp.send('DOM.enable')
    cdp.send('CSS.enable')
    root = cdp.send('DOM.getDocument', {'depth': -1})['root']['nodeId']
    drawn = {}
    for sel in ('#b-open span', '#st-pages', '#monoprobe'):
        nid = cdp.send('DOM.querySelector', {'nodeId': root, 'selector': sel})['nodeId']
        drawn[sel] = [(f['familyName'], f['isCustomFont']) for f in cdp.send('CSS.getPlatformFontsForNode', {'nodeId': nid})['fonts']]
    page.evaluate("document.getElementById('monoprobe').remove()")
    check('IBM Plex Sans 400, 500, 600 and Mono 400, 500 load from the page itself', faces == [True] * 5, faces)
    # Chromium names a face with its style ("IBM Plex Sans Medium"); custom means the page's own
    only = lambda sel, fam: drawn[sel] and all(n.startswith(fam) and own for n, own in drawn[sel])
    check('and the interface is drawn in them: a toolbar label and the status line in Plex Sans, mono text in Plex Mono',
          only('#b-open span', 'IBM Plex Sans') and only('#st-pages', 'IBM Plex Sans') and only('#monoprobe', 'IBM Plex Mono'), drawn)


def latin_ext_fonts(page, where='', check=check):
    """Letters past Latin-1 (Ł, ő, ř, ş, ā: a file, a project or an author's name in the
    interface) are drawn in IBM Plex too, from its Latin Extended cut, not in a system font that
    looks different beside them. rikuy.html carries the cut as data:, the hosted page as files."""
    text = 'Łódź Erdős Dvořák Şişli Āpā'
    page.evaluate('''async (text) => {
      for (const f of ['400 13px "IBM Plex Sans"', '500 13px "IBM Plex Sans"', '600 13px "IBM Plex Sans"', '400 13px "IBM Plex Mono"', '500 13px "IBM Plex Mono"']) await document.fonts.load(f, text);
      const w = (s, i) => '<div id="xp' + i + '" style="font: ' + s + '">' + text + '</div>';
      document.body.insertAdjacentHTML('beforeend', [w('400 13px var(--font-ui)', 0), w('500 13px var(--font-ui)', 1), w('600 13px var(--font-ui)', 2), w('400 12px var(--font-mono)', 3), w('500 12px var(--font-mono)', 4)].join(''));
    }''', text)
    cdp = page.context.new_cdp_session(page)
    cdp.send('DOM.enable'); cdp.send('CSS.enable')
    root = cdp.send('DOM.getDocument', {'depth': -1})['root']['nodeId']
    drawn = []
    for i in range(5):
        nid = cdp.send('DOM.querySelector', {'nodeId': root, 'selector': '#xp%d' % i})['nodeId']
        drawn.append([(f['familyName'], f['isCustomFont']) for f in cdp.send('CSS.getPlatformFontsForNode', {'nodeId': nid})['fonts']])
    page.evaluate("for (let i = 0; i < 5; i++) document.getElementById('xp' + i).remove()")
    fam = ['IBM Plex Sans'] * 3 + ['IBM Plex Mono'] * 2
    check('Ł, ő, ř, ş and ā are drawn in IBM Plex Sans and Mono, every weight, not a system font' + where,
          all(d and all(n.startswith(f) and own for n, own in d) for d, f in zip(drawn, fam)), drawn)


def default_macros(page):
    """The math the page knows without a definition renders: \\tfrac was once mapped to itself,
    so KaTeX expanded it until its limit and every formula with it showed as an error."""
    doc = ('\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nHalf is $\\tfrac{1}{2}$, so\n'
           '\\[\\begin{aligned} a &= \\tfrac{1}{3} + \\nicefrac{1}{6} \\\\ b &= \\mathbbm{R}\\end{aligned}\\]\nAfter.\n\\end{document}\n')
    load_doc(page, doc)
    settle(page, 600)
    page.evaluate('window.rikuy.refreshNav()')
    probs = page.evaluate("(window.rikuy.problems || []).filter((x) => /Math error/.test(x.msg)).map((x) => x.msg)")
    n = page.evaluate("document.querySelectorAll('#pages .katex').length")
    check('\\tfrac, \\nicefrac and \\mathbbm render without a math error', not probs and n >= 2, (probs, n))
    # \ensuremath is LaTeX's own, which KaTeX lacks: a package's macro built on it (an Overleaf
    # project's macros.sty) showed every formula using it as an error
    load_doc(page, {'main.tex': '\\documentclass{article}\n\\usepackage{mymacros}\n\\begin{document}\nRegimes $\\regime{1}, \\dots, \\regime{n}$ and \\regime{2} in text.\n\\end{document}\n',
                    'mymacros.sty': '\\ProvidesPackage{mymacros}\n\\newcommand{\\regime}[1]{\\ensuremath{\\mathcal{R}_{#1}}}\n'})
    settle(page, 600)
    page.evaluate('window.rikuy.refreshNav()')
    probs = page.evaluate("(window.rikuy.problems || []).filter((x) => /Math error/.test(x.msg)).map((x) => x.msg)")
    n = page.evaluate("document.querySelectorAll('#pages .katex').length")
    bad = page.evaluate("document.querySelectorAll('#pages .katex-error, #pages .merr').length")
    check('a macro built on \\ensuremath, in a formula and in text, renders without a math error', not probs and not bad and n >= 2, (probs, bad, n))


def skipped_args(page):
    """A macro whose body skips an argument (\\newcommand{\\second}[2]{#2}) renders: KaTeX counts a
    string macro's arguments only up to the first one missing, so it took none and showed #2 as an
    error. Vertical space inside a title or a line (\\vspace, \\smallskip) shows nothing, not its length."""
    doc = ('\\documentclass{article}\n\\usepackage{amsmath}\n\\newcommand{\\nv}[2]{#2}\n\\newcommand{\\pick}[3]{#3+#1}\n'
           '\\title{\\vspace{-1.5em}\\textbf{Demand}}\n\\begin{document}\n\\maketitle\n'
           'Shares are $\\nv{b1}{0.50}$ and $\\pick{x}{y}{z}$.\\smallskip{} After.\n\\end{document}\n')
    load_doc(page, doc)
    settle(page, 600)
    page.evaluate('window.rikuy.refreshNav()')
    probs = page.evaluate("(window.rikuy.problems || []).filter((x) => x.sev !== 'info' || /smallskip|vspace/.test(x.msg)).map((x) => x.msg)")
    text = page.evaluate("document.getElementById('pages').innerText")
    check('a macro that skips an argument renders, and \\vspace or \\smallskip in a line shows nothing',
          not probs and '0.50' in text and 'z+x' in text.replace(' ', '') and '1.5em' not in text and 'Demand' in text, (probs, text[:200]))


def hidden_deletes(page):
    """One Backspace never removes what the page does not show: at the start of a theorem's body
    the browser names a range from the paragraph's end, and a letter's \\date and \\subject sit
    between two visible lines."""
    thm = ('\\documentclass{article}\n\\usepackage{amsthm}\n\\newtheorem{theorem}{Theorem}\n\\begin{document}\n'
           '\\begin{theorem}\n    Let $x$ be a number.\n    Then it is one.\n\\end{theorem}\nAfter.\n\\end{document}\n')
    load_doc(page, thm)
    settle(page, 300)
    click_text(page, 'Let', 0)
    page.keyboard.press('Backspace')
    settle(page, 200)
    check('Backspace at the start of a theorem keeps its first paragraph', 'Let $x$ be a number.' in src(page) and 'Then it is one.' in src(page), src(page)[-120:])
    letter = ('\\documentclass[a4paper, 12pt, KOMAold, sections]{scrlttr2}\n\\newcommand{\\Empfaenger}{Lisa M}\n'
              '\\newcommand{\\EStrasse}{Main Street}\n\\newcommand{\\DocTitle}{Small worlds}\n\\begin{document}\n'
              '    \\begin{letter}{\\Empfaenger \\\\ \\EStrasse}\n    \\date{\\today}%a note\n    \\subject{\\DocTitle}\n'
              '    \\opening{Dear Lisa,}\n    The letter itself.\n    \\closing{Yours}\n    \\end{letter}\n\\end{document}\n')
    lost = []
    n = 0
    load_doc(page, letter)
    settle(page, 300)
    n = page.evaluate('document.querySelectorAll("#pages span.t:not(.ph)").length')
    for k in range(n):
        load_doc(page, letter)
        settle(page, 80)
        page.evaluate('''(k) => { const s = [...document.querySelectorAll('#pages span.t:not(.ph)')][k]; if (!s || !s.firstChild) return; const r = document.createRange(); r.setStart(s.firstChild, 0); r.collapse(true); document.getElementById('pages').focus(); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }''', k)
        page.keyboard.press('Backspace')
        settle(page, 80)
        t = src(page)
        # a visible letter of the subject may go; the commands themselves must stay
        if '\\date{\\today}' not in t or '\\subject{' not in t:
            lost.append(k)
    check('Backspace anywhere in a letter keeps its hidden \\date and \\subject', n > 0 and not lost, (n, lost))
    # two display formulas, then a paragraph: Backspace at its start selects the nearer formula,
    # as with one formula, and deletes nothing yet (both went at once)
    two = ('\\documentclass{article}\n\\begin{document}\nThen:\n$$a = b$$\n$$= c.$$\n\nSo it follows.\n\\end{document}\n')
    load_doc(page, two)
    settle(page, 300)
    click_text(page, 'So it follows', 0)
    page.keyboard.press('Backspace')
    settle(page, 200)
    check('Backspace after two display formulas selects one and deletes nothing', src(page) == two and 'Press Backspace again' in page.inner_text('#toast'), (src(page)[-60:], page.inner_text('#toast')[:60]))
    page.keyboard.press('Escape')
    # a formula a macro's own text makes (\\newcommand{\\arrow}{$\\rightarrow$}, here or in a .sty)
    # is not at the call site in the file: clicking it edits nothing (it wrote \\documentcla+1ss)
    for files in ({'main.tex': '\\documentclass{article}\n\\newcommand{\\arrow}{$\\rightarrow$}\n\\begin{document}\nA \\arrow{} B.\n\\end{document}\n'},
                  {'main.tex': '\\documentclass{article}\n\\usepackage{myStyle}\n\\begin{document}\nA \\arrow{} B.\n\\end{document}\n', 'myStyle.sty': '\\newcommand{\\arrow}{$\\rightarrow$}\n'}):
        load_doc(page, files)
        settle(page, 300)
        box = page.evaluate("() => { const k = document.querySelector('#pages .katex'); if (!k) return null; const r = k.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }")
        if box:
            page.mouse.click(box[0], box[1])
            settle(page, 400)
            if page.evaluate("!!document.getElementById('pop-field')"):
                page.evaluate("document.getElementById('pop-field').executeCommand('moveToMathfieldEnd')")
                page.keyboard.type('+1')
                settle(page, 300)
            page.keyboard.press('Escape')
            settle(page, 200)
        same = all(page.evaluate('(f) => window.rikuy.files.get(f)', k) == v for k, v in files.items())
        check('a formula made by a macro%s edits nothing in the file' % (' from a .sty' if len(files) > 1 else ''), box and same, box)

def select_between(page, t1, o1, t2, o2):
    return page.evaluate('''([t1, o1, t2, o2]) => {
      const sp = [...document.querySelectorAll('#pages span.t')];
      const a = sp.find(s => s.textContent.includes(t1)), b = sp.find(s => s.textContent.includes(t2));
      if (!a || !b) return false;
      const r = document.createRange(); r.setStart(a.firstChild, a.textContent.indexOf(t1) + o1); r.setEnd(b.firstChild, b.textContent.indexOf(t2) + o2);
      document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); return true; }''', [t1, o1, t2, o2])


def undo_all(page):
    for _ in range(200):
        if not page.evaluate('window.rikuy.hist.length'): break
        page.evaluate('window.rikuy.undo()')


DOC_EDGES = r"""\documentclass{article}
\begin{document}
First paragraph ends here.
% comment (Ana) on "ends": please fix

Second paragraph starts here, 50\%{more} and a tilde.

Line one\\
line two follows.

\begin{itemize}
\item alpha item
\end{itemize}

Use \verb|%| for comments, then \textbf{bold words here} follow.
\end{document}
"""


def edges(page, errors):
    """Edits next to comments, optional arguments, \\verb, wrappers and empty documents."""
    load_doc(page, DOC_EDGES)
    base = src(page)
    click_text(page, 'Second paragraph', 0)
    page.keyboard.press('Backspace')
    s = src(page)
    check('joining paragraphs keeps the comment lines between them', s == base.replace('please fix\n\nSecond', 'please fix\nSecond'), s[s.find('here.'):][:80])
    undo_all(page)
    click_text(page, 'ends here.', 10)
    page.keyboard.press('Enter')
    page.keyboard.type('New.')
    s = src(page)
    check('a new paragraph goes after the comment under the line', 'please fix\n\nNew.\n\nSecond' in s, s[s.find('here.'):][:80])
    undo_all(page)
    check('text in a group after a character command is on the page', page.evaluate('[...document.querySelectorAll("#pages span.t")].some(s => s.textContent === "more")'))
    click_text(page, 'line two', 0)
    page.keyboard.type('[1]')
    check('[ after \\\\ is written {[} (else an optional argument)', 'Line one\\\\\n{[}1]line two' in src(page), src(page)[src(page).find('Line one'):][:40])
    undo_all(page)
    click_text(page, 'alpha item', 0)
    page.keyboard.type('[x]')
    check('[ at the start of an item is written {[}', '\\item {[}x]alpha' in src(page), src(page)[src(page).find('\\item'):][:30])
    undo_all(page)
    click_text(page, 'bold words', 2)
    page.keyboard.press('Enter')
    check('Enter inside \\textbf closes and reopens it', '\\textbf{bo}\n\n\\textbf{ld words here}' in src(page), src(page)[src(page).find('then'):][:60])
    undo_all(page)
    select_between(page, 'Use', 1, 'bold words', 4)
    page.keyboard.press('Backspace')
    check('deleting across \\verb|%| keeps the \\textbf{ it reaches into', 'U\\textbf{ words here}' in src(page), src(page)[src(page).find('U'):][:60])
    undo_all(page)
    check('edges: undo gives the bytes back', src(page) == base)
    # an empty document: a blank paragraph to type into
    empty = '\\documentclass{article}\n\\begin{document}\n\n\\end{document}\n'
    load_doc(page, empty)
    check('an empty document offers a paragraph to type in', page.evaluate('!!document.querySelector("#pages .ghostp.empty")'))
    box = page.evaluate('(() => { const r = document.querySelector(".page").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()')
    page.mouse.click(box[0], box[1])
    page.keyboard.type('Hello')
    check('typing on an empty page starts its first paragraph', src(page) == '\\documentclass{article}\n\\begin{document}\n\nHello\n\n\\end{document}\n', repr(src(page)))
    # Enter at the end of a heading: the \label on its next line stays with the heading
    labelled = '\\documentclass{article}\n\\begin{document}\n\\section{Intro}\n\\label{sec:i}\nText here.\n\\end{document}\n'
    load_doc(page, labelled)
    click_text(page, 'Intro', 5)
    page.keyboard.press('Enter')
    page.keyboard.type('New.')
    check('a paragraph after a heading goes after its \\label', '\\section{Intro}\n\\label{sec:i}\n\nNew.\n\nText here.' in src(page), repr(src(page)))
    undo_all(page)
    # a document the page cannot build: the old pages take no typing
    load_doc(page, DOC_EDGES)
    deep = DOC_EDGES.replace('Second paragraph', '\\textbf{' * 10000 + 'x' + '}' * 10000 + ' Second paragraph')
    page.evaluate('(t) => { const g = window.rikuy; g.files.set("main.tex", t); g.rebuild(); }', deep)
    click_text(page, 'First paragraph', 3)
    page.keyboard.type('Z')
    check('pages that could not be rebuilt take no typing', src(page) == deep and page.evaluate('document.getElementById("pages").classList.contains("stale")'))
    errors[:] = [e for e in errors if 'Maximum call stack' not in e]
    page.evaluate('(t) => { const g = window.rikuy; g.files.set("main.tex", t); g.rebuild(); }', DOC_EDGES)
    check('a build that works again makes them editable', page.evaluate('document.getElementById("pages").contentEditable') == 'true')
    # an input method replacing a selected word: what is typed next follows it
    load_doc(page, DOC_EDGES)
    cdp = page.context.new_cdp_session(page)
    select_text(page, 'starts')
    for t in ['k', 'か']:
        cdp.send('Input.imeSetComposition', {'text': t, 'selectionStart': len(t), 'selectionEnd': len(t)})
    cdp.send('Input.insertText', {'text': '漢字'})
    settle(page, 100)
    page.keyboard.type('Y')
    check('after composing over a selection the caret follows the new text', 'paragraph 漢字Y here' in src(page), src(page)[src(page).find('Second'):][:40])
    undo_all(page)


DOC_POP = r"""\documentclass{article}
\usepackage{amsmath,natbib}
\begin{document}
Mass $m$ and energy \citep{a} here.

Last paragraph.
\bibliographystyle{plainnat}
\bibliography{refs}
\end{document}
"""
BIB_POP = '@book{a, author={Ann, A.}, title={T}, year={2001}}\n@book{bbbbbbbb, author={Bob, B.}, title={U}, year={2002}}\n'


def popovers(page):
    """What is typed after a popover closes goes after the formula, citation or equation it made
    longer (it went inside them: \\end{ More.equation}); a new equation holds no blank line;
    Ctrl+A selects the pages' text."""
    load_doc(page, {'main.tex': DOC_POP, 'refs.bib': BIB_POP})
    base = src(page)
    page.click('.a-math >> nth=0')
    page.wait_for_selector('.pop-math textarea')
    page.fill('.pop-math textarea', 'E = m c^2 + \\mathcal{O}(v^4)')
    wait_src(page, 'O}(v^4)$')
    page.keyboard.press('Enter')
    settle(page, 150)
    page.keyboard.type('Q')
    check('typing after a formula made longer goes after it', '$E = m c^2 + \\mathcal{O}(v^4)$Q and' in src(page), src(page)[src(page).find('Mass'):][:60])
    undo_all(page)
    page.click('.a-cite >> nth=0')
    page.wait_for_selector('.pop-cite')
    page.keyboard.type('bob')
    page.keyboard.press('Enter')
    settle(page, 150)
    page.keyboard.press('Escape')
    settle(page, 150)
    page.keyboard.type('Q')
    check('typing after a citation that gained a key goes after it', '\\citep{a, bbbbbbbb}Q here' in src(page), src(page)[src(page).find('energy'):][:50])
    undo_all(page)
    click_text(page, 'here.', 5)
    page.evaluate('rikuy.runCommand("equation")')
    page.wait_for_selector('.pop-math')
    settle(page, 300)
    page.keyboard.type('E=mc^2', delay=60)
    wait_src(page, 'E=mc^2')
    page.keyboard.press('Enter')
    settle(page, 150)
    page.keyboard.type('Q')
    s = src(page)
    eq = s[s.find('\\begin{equation}'):s.find('\\end{equation}') + 14]
    check('a new equation holds no blank line', re.fullmatch(r'\\begin\{equation\}\n *E=mc\^2\n\\end\{equation\}', eq), repr(eq))
    # (on a line of its own after it, in the same paragraph, and no blank line added: the
    # coordinator's rule for power-keys)
    check('and what is typed after it goes after \\end{equation}, on the next line', '\\end{equation}\nQ\n\nLast paragraph.' in s, repr(s[s.find('here.'):][:80]))
    undo_all(page)
    click_text(page, 'Last paragraph', 2)
    page.keyboard.press('Control+a')
    sel = page.evaluate('getSelection().toString()')
    check('Ctrl+A selects the text of the pages', 'Mass' in sel and 'Last paragraph.' in sel, sel[:80])
    page.keyboard.press('Backspace')
    settle(page, 150)
    check('and Backspace deletes it', 'energy' not in src(page) and 'Last paragraph' not in src(page), src(page)[src(page).find('document}'):][:80])
    undo_all(page)
    check('popovers: undo gives the bytes back', src(page) == base)


def first_words(page):
    """What someone who has never used LaTeX does first: New document and typing at once,
    deleting it all and typing again, a formula or a heading as the first thing in a paragraph,
    Enter in the title, Backspace in a heading left empty."""
    body = lambda: src(page)[src(page).find('\\begin{document}') + 16:src(page).find('\\end{document}')]
    slow = dict(delay=40)   # the math field takes keys as a person types them, not all at once
    page.click('#b-new')
    page.wait_for_function('window.rikuy.name.startsWith("Untitled") && window.rikuy.ghost', timeout=5000)
    hint = page.inner_text('#empty-hint')
    check('a blank document says to type, or to drop a .tex, a .zip or a Word file', '.tex' in hint and '.zip' in hint and 'Word' in hint and 'Alt+Q' in hint, hint)
    name = page.evaluate('window.rikuy.name')
    page.keyboard.type('First words')
    wait_src(page, 'First words')
    check('after New document the first words typed land on the page, with no click', 'First words' in body() and page.evaluate('window.rikuy.name') == name, (body(), page.evaluate('window.rikuy.name')))
    for _ in range(len('First words')): page.keyboard.press('Backspace')
    settle(page, 150)
    page.keyboard.type('again')
    wait_src(page, 'again')
    check('with every word deleted, typing starts the document again', body().strip() == 'again', body())
    page.keyboard.press('Enter'); page.keyboard.type('$'); settle(page, 400)
    opened = page.evaluate('!!document.querySelector("body > .pop.pop-math")')
    page.keyboard.type('x^2', **slow); settle(page, 100); page.keyboard.press('Enter')
    wait_src(page, '$x^2$')
    check('a dollar sign on a new line starts a formula, as it does inside a line', opened and 'again\n\n$x^2$' in body(), body())
    page.keyboard.type(' is math'); page.keyboard.press('Enter'); page.keyboard.type('$'); settle(page, 400)
    page.keyboard.press('Escape'); settle(page, 200)
    page.keyboard.type('next')
    wait_src(page, 'next')
    check('closing that formula empty leaves the caret on the line', re.search(r'is math\n\nnext\s*$', body()), body())
    page.keyboard.press('Enter'); page.keyboard.type('\\'); settle(page, 400)
    pal = page.evaluate('!!document.querySelector("body > .pop.pop-pal")')
    page.keyboard.type('sec', **slow); settle(page, 200); page.keyboard.press('Enter'); settle(page, 300)
    page.keyboard.type('Results')
    wait_src(page, '\\section{Results}')
    check('a backslash on a new line opens the list of things to insert', pal and '\\section{Results}' in body(), body())
    click_text(page, 'Results'); page.keyboard.press('Shift+End'); page.keyboard.press('Delete'); settle(page, 200)
    emptied = '\\section{}' in body()
    page.keyboard.press('Backspace'); settle(page, 200)
    check('Backspace in a heading left empty removes the heading', emptied and '\\section' not in body() and 'next' in body(), body())
    # a formula as the first thing in a new document, then more typing
    page.click('#b-new'); settle(page, 400)
    page.keyboard.type('$'); settle(page, 400); page.keyboard.type('y', **slow); settle(page, 100); page.keyboard.press('Enter'); settle(page, 300)
    page.keyboard.type('follows')
    wait_src(page, 'follows')
    check('after a formula that is all the document holds, typing goes on', re.search(r'\$y\$\s+follows', body()), body())
    # a title alone: the page had nowhere to start the text
    load_doc(page, '\\documentclass{article}\n\\title{Only a title}\n\\begin{document}\n\\maketitle\n\\end{document}\n')
    settle(page, 200)
    # the blank paragraph under the title, not the title itself and not a point below the window
    page.locator('.ghostp').scroll_into_view_if_needed()
    page.locator('.ghostp').click()
    page.keyboard.type('Below')
    wait_src(page, 'Below')
    check('under a title alone, a click on the page and typing start the first paragraph', '\\title{Only a title}' in src(page) and '\\maketitle\n\nBelow' in src(page), src(page))
    for _ in range(5): page.keyboard.press('Backspace')
    settle(page, 150)
    r = page.evaluate('(() => { const s = [...document.querySelectorAll("#pages span.t")].find((s) => s.textContent.includes("Only a title")); const r = s.getBoundingClientRect(); return [r.right - 2, r.top + r.height / 2]; })()')
    page.mouse.click(*r); page.keyboard.type('!')
    wait_src(page, 'title!')
    check('and the title itself is still edited where it stands', '\\title{Only a title!}' in src(page), src(page))
    page.keyboard.press('Enter'); page.keyboard.type('From the title')
    wait_src(page, 'From the title')
    check('Enter in the title starts the text after \\maketitle', '\\title{Only a title!}' in src(page) and '\\maketitle\n\nFrom the title' in src(page), src(page))


def phone_layout(page):
    """The bar, the status line, Help and the PDF bar on screens as wide as phones are."""
    BAR = """() => { const W = document.documentElement.clientWidth; const box = (e) => e.getBoundingClientRect(); const vis = (e) => box(e).width > 0;
      const kids = [...document.querySelectorAll('#b-nav, #bar .brand .mark, #bar .qat > button, #b-share, #b-comments, #bar .tools > button, #bar .tools .zoom > *')].filter(vis);
      const off = kids.filter((e) => box(e).right > W + 0.5 || box(e).left < -0.5).map((e) => e.id || e.className);
      const over = [];
      for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const a = box(kids[i]), b = box(kids[j]); if (a.left < b.right - 1 && b.left < a.right - 1) over.push((kids[i].id || kids[i].className) + '~' + (kids[j].id || kids[j].className)); }
      const st = document.getElementById('status');
      return { off, over, nav: Math.round(box(document.getElementById('b-nav')).width), page: document.documentElement.scrollWidth - W,
        status: Math.round(box(st).height), pdfx: Math.round(box(document.getElementById('pdf-x')).right) - W }; }"""
    for w in (360, 390, 430, 540, 700):
        page.set_viewport_size({'width': w, 'height': 800})
        settle(page, 250)
        m = page.evaluate(BAR)
        check('at %dpx no button of the bar lies over another or the name, or off the screen' % w, not m['off'] and not m['over'] and m['page'] <= 0 and m['nav'] >= 28, m)
        if w <= 430: check('at %dpx the status line is one line' % w, m['status'] <= 30, m['status'])
        fade = page.evaluate('''() => { const st = document.getElementById('status'); const cs = getComputedStyle(st);
          return { ox: cs.overflowX, sw: st.scrollWidth, cw: st.clientWidth, cls: st.className }; }''')
        if fade['sw'] > fade['cw'] + 2:
            check('at %dpx the status bar scrolls, and fades where it is cut off' % w, fade['ox'] in ('auto', 'scroll') and 'st-fade-r' in fade['cls'], fade)
    page.set_viewport_size({'width': 360, 'height': 800})
    settle(page, 250)
    page.evaluate('window.rikuy.togglePdf(true)')
    settle(page, 300)
    m = page.evaluate(BAR)
    check('at 360px the PDF pane\'s close button is on the screen', m['pdfx'] <= 0, m['pdfx'])
    page.evaluate('window.rikuy.togglePdf(false)')
    check('a phone has no Help button in the bar', not page.is_visible('#b-help'))
    page.click('#b-nav')
    settle(page, 200)
    # (Make available offline is there too where the installed app shows it; not in this page)
    acts = page.evaluate('[...document.querySelectorAll("#nav-acts .nav-act:not([hidden])")].map((a) => [a.dataset.for, a.textContent.trim(), a.disabled, a.getBoundingClientRect().height])')
    bar = page.evaluate('[...document.querySelectorAll("#bar .tools button:not(.ai-only), #b-undo, #b-undo-x, #b-redo, #b-share, .rb-dl button:not(#rb-dl-menu), #b-copy")].map((b) => b.id)')
    check('the menu panel lists every action of the bar, the downloads and Copy source by name, each large enough to tap', sorted(a[0] for a in acts) == sorted(bar) and all(a[1] and a[3] >= 36 for a in acts), (acts, bar))
    check('Undo and Redo are greyed there when there is nothing to undo, and the zoom shows its value', all(a[2] for a in acts if a[0] in ('b-undo', 'b-redo')) and re.match(r'Zoom: \d+%$', [a[1] for a in acts if a[0] == 'zoomv'][0]), acts)
    page.click('#nav-acts [data-for=b-help]')
    settle(page, 300)
    r = page.evaluate('(() => { const e = document.querySelector("body > .pop.pop-help"); if (!e) return null; const dd = e.querySelector(".keys dd").getBoundingClientRect(), b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), Math.round(dd.width), document.documentElement.clientWidth]; })()')
    check('so Help opens from the menu panel, which closes', r and not page.evaluate('document.body.classList.contains("nav-on")'), r)
    check('and fits the screen, its explanations in a column wide enough to read', r and r[0] >= 0 and r[1] <= r[3] and r[2] >= 150, r)
    page.keyboard.press('Escape')
    page.click('#b-nav'); settle(page, 200)
    page.click('#nav-acts [data-for=b-src]'); settle(page, 300)
    check('an action pressed there does what its button does', page.evaluate('document.body.classList.contains("src-on")') and not page.evaluate('document.body.classList.contains("nav-on")'))
    page.evaluate('window.rikuy.toggleSource(false)')
    page.set_viewport_size({'width': 1400, 'height': 1000})
    settle(page, 250)
    page.evaluate('window.rikuy.toggleNav(true)')
    check('a wide screen, where the buttons carry their names, has no such list', page.is_visible('#b-help') and not page.is_visible('#nav-acts'))
    page.evaluate('window.rikuy.toggleNav(false)')
    # keyboard alone: a popover (Share) or a pane (Help, on a wide window) opened from a button of
    # the bar gives the focus back to it
    back = []
    for b in ('#b-share', '#b-help'):
        page.focus(b); page.keyboard.press('Enter'); settle(page, 250)
        opened = page.evaluate('document.querySelectorAll("body > .pop, #helppane").length')
        page.keyboard.press('Escape'); settle(page, 150)
        back.append((b, opened, page.evaluate('document.querySelectorAll("body > .pop, #helppane").length'), page.evaluate('"#" + document.activeElement.id')))
    check('Escape closes Share and Help and the focus returns to their buttons', all(o == 1 and c == 0 and a == b for b, o, c, a in back), back)


def first_visit(p):
    """Someone who has never been here sees the page alone, at a size they can read; what they
    choose is kept; someone who was here before the page opened this way keeps the source pane."""
    browser = p.chromium.launch()
    try:
        def visit(ctx):
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            page.goto('https://rikuy.test/')
            page.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=20000)
            ready(page); settle(page, 300)
            return page
        dist = os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist')
        doc = SKELETON_HEAD + open(os.path.join(dist, 'rikuy.html'), encoding='utf8').read() + '</body></html>'

        def serve(route):
            url = route.request.url
            if url in ROUTES: return route.fulfill(status=200, content_type='application/javascript', headers={'Access-Control-Allow-Origin': '*'}, body=open(ROUTES[url], 'rb').read())
            if url == 'https://rikuy.test/': return route.fulfill(status=200, content_type='text/html; charset=utf-8', headers=policy(dist, '/'), body=doc)
            rel = url[len('https://rikuy.test/'):].split('?')[0] if url.startswith('https://rikuy.test/') else ''
            if rel and not os.path.isfile(os.path.join(dist, rel)) and os.path.isfile(os.path.join(dist, rel + '.html')): rel += '.html'
            f = os.path.join(dist, rel) if rel else ''
            return route.fulfill(status=200, content_type='text/html; charset=utf-8' if rel.endswith('.html') else 'text/javascript', headers=policy(dist, '/' + rel), body=open(f, 'rb').read()) if f and os.path.isfile(f) else route.abort()
        on = 'document.body.classList.contains("src-on")'
        ctx = browser.new_context(viewport={'width': 1400, 'height': 900}); ctx.route('**/*', serve); ctx.add_init_script(TIMERS)
        page = visit(ctx)
        check('a first visit on a wide screen shows the page without the source pane', not page.evaluate(on) and page.is_visible('#b-src'))
        page.click('#b-help'); settle(page, 200)
        first = page.evaluate('document.querySelector(".pop-help p").textContent')
        check('Help starts by saying what Rikuy is, before any word about LaTeX source', first.startswith('Rikuy is a writing app for papers') and 'source' not in first, first)
        page.keyboard.press('Escape')
        page.reload(); ready(page); settle(page, 300)
        check('a second visit with nothing chosen is the same', not page.evaluate(on))
        page.click('#b-src'); settle(page, 300)
        page.reload(); ready(page); settle(page, 500)
        check('the Source button opens the pane and the choice is kept', page.evaluate(on))
        # here before the change: a project kept in this browser, no settings ever written
        click_text(page, 'Click anywhere'); page.keyboard.type('Mine. '); saved(page, 1200)
        page.evaluate('localStorage.removeItem(Object.keys(localStorage).find((k) => /pref/i.test(k)))')
        page.reload(); ready(page); settle(page, 500)
        check('someone with a document kept and no settings keeps the source pane of a wide screen', page.evaluate(on) and 'Mine. ' in src(page), page.evaluate('Object.keys(localStorage)'))
        ctx.close()
        for w in (360, 390, 430):
            ctx = browser.new_context(viewport={'width': w, 'height': 800}, has_touch=True, is_mobile=True); ctx.route('**/*', serve); ctx.add_init_script(TIMERS)
            page = visit(ctx)
            geo = '(() => { const d = document.getElementById("desk"), r = document.querySelector("#pages .it.p").getBoundingClientRect(); return { font: parseFloat(getComputedStyle(document.querySelector("#pages .it.p")).fontSize), left: r.left, right: r.right, w: d.clientWidth, label: document.getElementById("zoomv").textContent, src: ' + on + ', web: document.body.classList.contains("pg-web") }; })()'
            m = page.evaluate(geo)
            # (a phone opens in Mobile View, Word's phone app's: the text at its actual size, its lines as wide as the screen)
            wide = page.evaluate('Math.max(...[...document.querySelectorAll("#pages .it.p")].map((p) => p.getBoundingClientRect().width))')
            check('a first visit on a %dpx phone opens in Mobile View: the text at its actual size across the screen' % w, m['web'] and m['font'] >= 13 and m['left'] >= 0 and m['right'] <= m['w'] and wide > 0.8 * m['w'] and not m['src'] and m['label'] == '100%', (m, wide))
            # Print Layout, a tap on Mobile View away: the text block across the screen, not the sheet
            page.tap('#sv-mobile'); settle(page, 400)
            m = page.evaluate(geo)
            check('with Mobile View off a %dpx phone shows the text block across the screen, not the sheet' % w, not m['web'] and m['font'] > 7.5 and m['left'] >= 0 and m['right'] <= m['w'] and m['right'] - m['left'] > m['w'] - 30 and not m['src'], m)
            # what is stored must be a zoom the version before this one can read (it multiplies
            # anything but 'fit'): after a rollback its page would have no size
            z = page.evaluate('JSON.parse(localStorage.getItem("galley.prefs.v1")).zoom')
            check('the settings kept on a %dpx first visit hold a zoom the previous version reads' % w, z == 'fit' or isinstance(z, (int, float)), z)
            if w == 390:
                seen = []
                for _ in range(3):
                    page.tap('#zoomv'); settle(page, 300); seen.append(page.inner_text('#zoomv'))
                # (the button says the zoom as a percentage, as the status bar does: the sheet's is smaller)
                check('the zoom button there goes to actual size, the whole sheet, and back', seen[0] == '100%' and seen[1].endswith('%') and int(seen[1][:-1]) < int(m['label'][:-1]) and seen[2] == m['label'], seen)
                page.tap('#zoomv'); page.tap('#zoomv'); settle(page, 300)
                z = page.evaluate('JSON.parse(localStorage.getItem("galley.prefs.v1")).zoom')
                page.reload(); ready(page); settle(page, 300)
                check('the whole sheet, once chosen, is kept too, under a zoom the previous version reads', page.inner_text('#zoomv') == seen[1] and z == 'fit', (page.inner_text('#zoomv'), z))
                page.tap('#zoomv'); settle(page, 300)
                page.tap('#zoomv'); settle(page, 300)
                page.reload(); ready(page); settle(page, 300)
                check('and a zoom that was chosen is the one the next visit opens with', page.inner_text('#zoomv') == '100%', page.inner_text('#zoomv'))
            ctx.close()
    finally:
        browser.close()


def select_all(page):
    """Select all, then Delete, typing, cut or paste: the body is replaced as New document would
    leave it, the preamble stays, and one undo brings every byte back."""
    base = src(page)
    pre = base[:base.find('\\begin{document}') + len('\\begin{document}')]
    body = lambda: src(page)[len(pre):] if src(page).startswith(pre) else None
    click_text(page, 'Click anywhere'); page.keyboard.press('Control+a'); page.keyboard.press('Delete'); settle(page, 300)
    check('select all, Delete leaves a blank body and the preamble as it was', body() == '\n\n\\end{document}\n', body())
    check('with the blank paragraph ready for typing', page.evaluate('!!(window.rikuy.ghost && window.rikuy.ghost.sticky)') and page.evaluate('(window.rikuy.caretNow() || {}).ghost === true') and page.evaluate('document.querySelectorAll("#pages .it:not(.ghostp)").length') == 0)
    page.keyboard.type('Fresh start'); wait_src(page, 'Fresh start')
    check('and typing starts the new text', (body() or '').split() == ['Fresh', 'start', '\\end{document}'], body())
    # ("start", "Fresh " and the deletion: typing is undone word by word, as Word's)
    for _ in range(3): page.keyboard.press('Control+z')
    settle(page, 300)
    check('undo brings the whole document back byte for byte', src(page) == base)
    click_text(page, 'Click anywhere'); page.keyboard.press('Control+a'); page.keyboard.type('Z'); wait_src(page, '\n\nZ\n\n')
    one = body()
    page.keyboard.press('Control+z'); settle(page, 300)
    check('typing over a selection of everything replaces the body, in one undo step', one == '\n\nZ\n\n\\end{document}\n' and src(page) == base, one)
    click_text(page, 'Click anywhere'); page.keyboard.press('Control+a')
    page.evaluate("""() => { const dt = new DataTransfer(); dt.setData('text/plain', 'First pasted.\\n\\nSecond pasted.');
      document.getElementById('pages').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }""")
    wait_src(page, 'Second pasted.')
    one = body()
    page.keyboard.press('Control+z'); settle(page, 300)
    check('a paste over everything becomes the body, its paragraphs kept', one == '\n\nFirst pasted.\n\nSecond pasted.\n\n\\end{document}\n' and src(page) == base, one)
    select_text(page, 'paragraph'); page.keyboard.press('Delete'); settle(page, 200)
    check('a selection of less than everything deletes as before', 'in this  and start typing' in src(page) and '\\section{How to use it}' in src(page))
    page.keyboard.press('Control+z'); settle(page, 200)
    # Only Select all is "everything". A selection from the first word to the last can leave
    # blocks with no text outside it (a picture, an equation, a listing): they must stay.
    DOC = ('\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\n\\begin{equation}\n  x = 1\n\\end{equation}\n\n'
           'The only sentence here.\n\n\\begin{verbatim}\ncode stays\n\\end{verbatim}\n\n\\begin{center}\n\\includegraphics[width=0.8\\linewidth]{shot.png}\n\\end{center}\n\\end{document}\n')
    load_doc(page, DOC)
    select_text(page, 'The only sentence here.'); settle(page, 100)
    page.keyboard.type('B'); settle(page, 300)
    check('a sentence selected from its first word to its last and typed over leaves the picture, the equation and the listing', src(page) == DOC.replace('The only sentence here.', 'B'), src(page))
    page.keyboard.press('Control+z'); settle(page, 200)
    r = page.evaluate('(() => { const s = [...document.querySelectorAll("#pages span.t")].find((s) => s.textContent.includes("The only sentence")); const r = s.getBoundingClientRect(); return [r.left + 30, r.top + r.height / 2]; })()')
    page.mouse.click(r[0], r[1], click_count=3); settle(page, 150)
    page.keyboard.press('Delete'); settle(page, 300)
    s = src(page)
    check('the same with a triple click and Delete', all(x in s for x in ('x = 1', 'code stays', '\\includegraphics[width=0.8\\linewidth]{shot.png}')) and 'only sentence' not in s, s)
    load_doc(page, DOC)
    click_text(page, 'The only sentence'); page.keyboard.press('Control+a'); settle(page, 100)
    click_text(page, 'The only sentence', 4); settle(page, 100)
    select_text(page, 'The only sentence here.'); settle(page, 100)
    page.keyboard.press('Delete'); settle(page, 300)
    check('a Select all given up for another selection no longer counts', 'code stays' in src(page) and 'x = 1' in src(page), src(page))
    load_doc(page, DOC)
    click_text(page, 'The only sentence'); page.keyboard.press('Control+a'); page.keyboard.press('Delete'); settle(page, 300)
    check('Select all itself still takes every block', src(page) == '\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\n\n\\end{document}\n', src(page))
    # the body is the parser's: no \end{document}, and the preamble is not what gets replaced
    for label, doc in (('with no \\end{document}', '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nWords with no end.\n'),
                       ('with \\end {document} spaced', '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nWords with an end.\n\\end {document}\n'),
                       ('with no preamble at all', 'Only words here.\n\nAnd a second paragraph.\n')):
        load_doc(page, doc)
        click_text(page, 'ords'); page.keyboard.press('Control+a'); page.keyboard.type('N'); settle(page, 300)
        s = src(page)
        pre = doc[:doc.find('\\begin{document}') + 16] if '\\begin{document}' in doc else ''
        check('Select all and typing %s keeps everything before the text' % label, s.startswith(pre) and 'N' in s[len(pre):] and 'ords' not in s, s)
    doc = '\\documentclass{article}\n% moved from below: \\begin{document}\n\\usepackage{amsmath}\n\\newcommand{\\R}{\\mathbb{R}}\n\\begin{document}\nBody words.\n\\end{document}\n'
    load_doc(page, doc)
    click_text(page, 'Body words'); page.keyboard.press('Control+a'); page.keyboard.press('Delete'); settle(page, 300)
    check('a comment in the preamble that names \\begin{document} is not where the body starts', src(page) == doc.replace('\nBody words.\n', '\n\n'), src(page))


def formula_mistakes(page):
    """A mistake in a formula's source box is said in plain words, with KaTeX's own as the
    tooltip; text that would not stay a formula (an unclosed brace) is not written into the
    document, so the paragraph around it stays as it was."""
    base = src(page)
    page.click('.a-math >> nth=0')
    page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000)
    ERR = '(() => { const e = document.querySelector(".pop-math .pv-err"); return e && !e.hidden ? [e.textContent, e.title] : null; })()'

    def typed(v):
        # the source box's text set as typing sets it; page.fill at times lost it to the math
        # field, which takes the focus back while it settles
        page.evaluate('(v) => { const ta = document.querySelector(".pop-math textarea"); ta.focus(); ta.value = v; ta.dispatchEvent(new Event("input", { bubbles: true })); }', v)
        settle(page, 350)
        return page.evaluate(ERR)
    e = typed('\\frac{a}{b')
    check('an unclosed brace is named in plain words, KaTeX\'s own in the tooltip', e and e[0].startswith('A { is not closed.') and 'Unexpected end of input' in e[1], e)
    check('and is not written into the document: the paragraph stays as it was', src(page) == base and page.evaluate('document.querySelectorAll("#pages .a-chip.err, #pages .merr").length') == 0, src(page)[src(page).find('Click $'):][:60])
    e = typed('a}')
    check('a brace too many is held back the same way', e and e[0].startswith('A } has no { before it.') and src(page) == base, e)
    for v, want in (('x^', 'Something is missing after ^.'), ('\\foo + 1', 'This command is not known: \\foo'), ('5 # x', '# cannot stand here: write \\# for the sign.'),
                    ('\\left( x', '\\left has no \\right to close it.'), ('\\frac', 'Something is missing after \\frac.'), ('x^2^3', 'Two ^ in a row: put the first in braces, as in {x^2}^3.')):
        e = typed(v)
        check('%s: "%s"' % (v, want), e and e[0] == want and e[1] and e[1] != want, e)
    wait_src(page, '$x^2^3$')
    check('a mistake that stays inside the formula is still written, as before', '$x^2^3$' in src(page))
    e = typed('\\frac{a}{b}')
    wait_src(page, '$\\frac{a}{b}$')
    check('put right, the formula is written and the message goes', e is None and '$\\frac{a}{b}$' in src(page), e)
    # What was typed is never lost: closed with a brace open, the box writes the text with the
    # missing braces added, and undo has a step for it.
    typed('\\frac{a}{b}+{c')
    page.focus('.pop-math textarea'); page.keyboard.press('Enter'); settle(page, 300)
    check('Enter with a brace open closes the box and writes the formula with the brace closed', '$\\frac{a}{b}+{c}$' in src(page) and page.evaluate('document.querySelectorAll("body > .pop").length') == 0 and page.evaluate('document.querySelectorAll("#pages .a-chip.err, #pages .merr").length') == 0, src(page)[src(page).find('Click $'):][:60])
    page.keyboard.press('Control+z'); settle(page, 300)
    check('and one undo takes back what the box wrote, as for any formula box', src(page) == base, src(page)[src(page).find('Click $'):][:60])
    page.click('.a-math >> nth=0')
    page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000)
    typed('\\sqrt{x')
    r = page.evaluate('(() => { const s = [...document.querySelectorAll("#pages span.t")].find((s) => s.textContent.includes("Editing in Print")); const r = s.getBoundingClientRect(); return [r.left + 10, r.top + r.height / 2]; })()')
    page.mouse.click(*r); settle(page, 300)
    check('a click on the page with a brace open keeps what was typed, the brace closed', '$\\sqrt{x}$' in src(page) and page.evaluate('document.querySelectorAll("body > .pop").length') == 0, src(page)[src(page).find('Click $'):][:60])
    page.click('.a-math >> nth=0')
    page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000)
    typed('y^2}')
    page.focus('.pop-math textarea'); page.keyboard.press('Enter'); settle(page, 300)
    check('Enter with a brace too many keeps the box open with its message', page.evaluate('document.querySelectorAll("body > .pop.pop-math").length') == 1 and (page.evaluate(ERR) or [''])[0].startswith('A } has no { before it.') and '$\\sqrt{x}$' in src(page), page.evaluate(ERR))
    page.keyboard.press('Escape'); settle(page, 300)
    check('and Escape then keeps every character typed, in a formula that is whole', '${y^2}$' in src(page) and page.evaluate('document.querySelectorAll("body > .pop").length') == 0, src(page)[src(page).find('Click $'):][:60])
    # a new formula: nothing is put into the text while a brace is open, all of it when the box closes
    click_text(page, 'References follow'); page.keyboard.type('$')
    page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000)
    before = src(page)
    e = typed('x^{2')
    check('a new formula with a brace open is not put into the text while it is typed', e and e[0] == 'A { is not closed.' and src(page) == before, e)
    page.focus('.pop-math textarea'); page.keyboard.press('Escape'); settle(page, 300)
    check('and closing its box then puts it there, the brace closed', '$x^{2}$References' in src(page), src(page)[src(page).find('References') - 12:][:40])
    # a new numbered equation given up with nothing typed leaves nothing behind
    before = src(page)
    click_text(page, 'The page and the source never disagree'); page.evaluate('rikuy.runCommand("equation")')
    page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000)
    made = src(page) != before and '\\begin{equation}\n  \n\\end{equation}' in src(page)
    page.focus('.pop-math textarea'); page.keyboard.press('Escape'); settle(page, 300)
    check('a new numbered equation closed empty leaves no empty equation in the text', made and src(page) == before, src(page)[src(page).find('The page and the source') - 60:][:90])
    click_text(page, 'The page and the source never disagree'); page.evaluate('rikuy.runCommand("equation")')
    page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000)
    typed('E = m c^{2')
    page.mouse.click(*r); settle(page, 300)
    check('typed into and left with a brace open, it keeps the formula, the brace closed', re.search(r'\\begin\{equation\}\s+E = m c\^\{2\}\s+\\end\{equation\}', src(page)), src(page)[src(page).find('The page and the source') - 70:][:100])
    # a backslash left at the end would take the closing brace (or the formula's closing $) with
    # it: it is held like an open brace, and dropped when the box closes
    page.evaluate('window.rikuy.doReset()'); settle(page, 600)
    base = src(page)
    red = 'document.querySelectorAll("#pages .a-chip.err, #pages .merr").length'
    page.click('.a-math >> nth=0')
    page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000)
    e = typed('x^{2}\\')
    check('a backslash at the end is not written while it is typed', e and src(page) == base, e)
    typed('x^{2\\')
    page.focus('.pop-math textarea'); page.keyboard.press('Escape'); settle(page, 300)
    check('x^{2\\ and Escape: the formula is written whole, with no \\} and nothing red on the page', '$x^{2}$' in src(page) and '\\}' not in src(page)[src(page).find('Click $'):][:20] and page.evaluate(red) == 0, src(page)[src(page).find('Click $'):][:40])
    page.keyboard.press('Control+z'); settle(page, 300)
    page.click('.a-math >> nth=0')
    page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000)
    typed('x\\\\')
    page.focus('.pop-math textarea'); page.keyboard.press('Escape'); settle(page, 300)
    check('two backslashes at the end are a line break and stay', '$x\\\\$' in src(page), src(page)[src(page).find('Click $'):][:40])
    page.keyboard.press('Control+z'); settle(page, 300)
    click_text(page, 'References follow'); page.keyboard.type('$')
    page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000)
    n = page.evaluate('window.rikuy.hist.length')
    typed('\\frac{a}{\\')
    page.focus('.pop-math textarea'); page.keyboard.press('Escape'); settle(page, 300)
    check('a new formula \\frac{a}{\\ and Escape: the text is kept, whole, with an undo step', '$\\frac{a}{}$References' in src(page) and page.evaluate('window.rikuy.hist.length') == n + 1 and page.evaluate(red) == 0, src(page)[src(page).find('References') - 16:][:40])
    page.keyboard.press('Control+z'); settle(page, 300)
    check('and undo takes it out', src(page) == base)
    # a new numbered equation given up empty: undo is as it was before it
    click_text(page, 'References follow', 3); page.keyboard.type('Q'); settle(page, 2200)
    mark, n = src(page), page.evaluate('window.rikuy.hist.length')
    click_text(page, 'The page and the source never disagree'); page.evaluate('rikuy.runCommand("equation")')
    page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000)
    page.focus('.pop-math textarea'); page.keyboard.press('Escape'); settle(page, 300)
    check('an empty new equation given up leaves the undo history as it was', src(page) == mark and page.evaluate('window.rikuy.hist.length') == n, (page.evaluate('window.rikuy.hist.length'), n))
    page.keyboard.press('Control+z'); settle(page, 300)
    check('so the next undo takes back the typing before it, not an empty equation', src(page) == base and '\\begin{equation}\n  \n\\end{equation}' not in src(page), src(page)[src(page).find('References') - 5:][:30])
    page.keyboard.press('Control+Shift+z'); settle(page, 300)
    check('and redo brings that typing back, not the equation', src(page) == mark)

def native_core(page):
    """The native core (src/native.js) runs in the page, fetched beside it: a long document is parsed
    by it, typing there writes the same source as ever, and in Chromium the core's tree of it is
    JavaScript's."""
    # (fetched once the page is in use: load() is the same promise, started if it was not)
    check('the native core runs in the page, fetched beside it after the first build', page.evaluate('() => window.rikuy.core.load()') and page.evaluate('window.rikuy.core.ready()'))
    doc = ('\\documentclass{article}\n\\newcommand{\\R}{\\mathbb{R}}\n\\begin{document}\n\\section{One}\n'
           + ''.join('Paragraph %d has \\textbf{bold} words, $x_%d \\in \\R$ and a \\emph{stress}.\n\n' % (k, k) for k in range(60))
           + 'Last words here.\n\\end{document}\n')
    load_doc(page, {'main.tex': doc})
    before = page.evaluate('window.rikuy.core.stats.parsed')
    click_text(page, 'Last words', 4)
    page.keyboard.type('XY')
    settle(page, 300)
    check('typing on a long document parses it in the core', page.evaluate('window.rikuy.core.stats.parsed') > before and 'LastXY words' in src(page), page.evaluate('window.rikuy.core.stats'))
    check('the core\'s tree of it in Chromium is JavaScript\'s', page.evaluate('() => { const g = window.rikuy; return g.core.same(g.files.get("main.tex")) && g.core.same(g.files.get("main.tex") + "\\\\verb|\\ud83d\\ude00| \\\\begin{toString}"); }'))


def run():
    with sync_playwright() as p:
        browser, page, errors = open_page(p)
        t = page.evaluate('window.rikuy.lastMs')
        npages = page.evaluate('document.querySelectorAll(".page").length')
        check('renders pages', npages >= 2, npages)
        check('initial build time < 1500ms', t < 1500, t)
        page.screenshot(path=SHOTS + '/01-initial.png')
        # overflow check: content within text body
        over = page.evaluate('''() => [...document.querySelectorAll('.page')].map((pg,i) => {
          const pb = pg.querySelector('.pb').getBoundingClientRect();
          const fl = pg.querySelector('.flow').getBoundingClientRect();
          const fn = pg.querySelector('.fns');
          const fr = fn && !fn.hidden ? fn.getBoundingClientRect() : null;
          return {i, over: Math.round(fl.bottom - (fr ? fr.top : pb.bottom)), pb: Math.round(pb.height)}; })''')
        check('no page overflows its text block', all(o['over'] <= 3 for o in over), over)

        base = src(page)
        # 1. typing inside a paragraph
        click_text(page, 'Click anywhere in this paragraph', 5)
        page.keyboard.type('XY')
        s1 = src(page)
        check('type inserts at mapped offset', 'ClickXY anywhere in this paragraph' in s1, s1[s1.find('Click'):s1.find('Click')+40])
        page.keyboard.type('%&_')
        s2 = src(page)
        check('specials are escaped', 'ClickXY\\%\\&\\_ anywhere' in s2, s2[s2.find('ClickXY'):s2.find('ClickXY')+30])
        for _ in range(5):
            page.keyboard.press('Backspace')
        s3 = src(page)
        check('backspace removes whole escapes', s3 == base, s3[s3.find('Click'):s3.find('Click')+40])

        # 2. bold toggle
        select_text(page, 'start typing')
        page.keyboard.press('Control+b')
        s4 = src(page)
        check('ctrl+b wraps selection', '\\textbf{start typing}' in s4, s4[s4.find('start')-10:s4.find('start')+30])
        page.keyboard.press('Control+b')
        s5 = src(page)
        check('ctrl+b again unwraps', s5 == base, s5[s5.find('start')-10:s5.find('start')+30])

        # 3. undo / redo
        click_text(page, 'Rikuy escapes special characters', 5)
        page.keyboard.type(' happily')
        check('typed word', 'Rikuy happily escapes' in src(page))
        page.keyboard.press('Control+z')
        check('undo restores', src(page) == base, src(page)[src(page).find('Rikuy escapes')-5:][:40])
        page.keyboard.press('Control+Shift+z')
        check('redo reapplies', 'Rikuy happily escapes' in src(page))
        page.keyboard.press('Control+z')

        # 4. enter splits paragraph
        click_text(page, 'Press', 0)
        page.keyboard.press('Enter')
        s6 = src(page)
        check('enter splits paragraph', '\n\nPress \\key{Enter}' in s6, s6[s6.find('Press')-20:s6.find('Press')+10])
        page.keyboard.press('Backspace')
        s7 = src(page)
        check('backspace at paragraph start merges', '\n\nPress \\key{Enter}' not in s7 and 'Press \\key{Enter}' in s7, s7[s7.find('Press')-20:s7.find('Press')+10])
        page.keyboard.press('Control+z'); page.keyboard.press('Control+z')
        check('undo twice back to base', src(page) == base)

        # 5. math popover
        page.click('.a-math >> nth=0')
        page.wait_for_selector('.pop-math textarea')
        # the math field takes the focus when it arrives: filled a moment before, the source box
        # lost the rest of its text to the field
        page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=10000)
        page.fill('.pop-math textarea', '\\alpha + \\beta = \\delta')
        wait_src(page, '$\\alpha + \\beta = \\delta$')
        s8 = src(page)
        check('math popover edits source live', '$\\alpha + \\beta = \\delta$' in s8, s8[s8.find('Click $'):][:50])
        page.keyboard.press('Enter')
        settle(page, 100)
        check('popover closes on enter', page.evaluate('!document.querySelector(".pop")'))
        page.keyboard.press('Control+z')
        check('undo math edit', src(page) == base, src(page)[src(page).find('Click $'):][:50])

        # 6. display math popover + env switch
        page.click('.it.dm >> nth=0')
        page.wait_for_selector('.pop-math textarea')
        # (the sample's equation has a label: unnumbered, \eqref to it would print ??, so that kind
        # is refused with the reason and the list goes back; a numbered kind is a rename)
        page.select_option('#pop-env', 'equation*')
        settle(page, 300)
        check('display env switch to unnumbered refused for a labelled equation', src(page) == base and page.input_value('#pop-env') == 'equation' and 'label' in page.evaluate('document.getElementById("toast").textContent'),
              (page.input_value('#pop-env'), page.evaluate('document.getElementById("toast").textContent')))
        page.select_option('#pop-env', 'align')
        settle(page, 300)
        s9 = src(page)
        check('display env switch', '\\begin{align}' in s9 and '\\end{align}' in s9 and s9.replace('{align}', '{equation}', 2) == base, s9[s9.find('\\begin{align'):][:40])
        page.keyboard.press('Escape')
        page.keyboard.press('Control+z')
        check('undo env switch', src(page) == base)

        # 7. selection across markup keeps it balanced
        page.evaluate('''() => {
          const a = [...document.querySelectorAll('#pages span.t')].find(s => s.textContent.includes('The round trip'));
          const b = [...document.querySelectorAll('#pages span.t')].find(s => s.textContent.includes('The page and the source'));
          const r = document.createRange(); r.setStart(a.firstChild, 4); r.setEnd(b.firstChild, 9);
          document.getElementById('pages').focus(); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }''')
        page.keyboard.press('Backspace')
        s10 = src(page)
        check('cross-structure delete keeps markup', '\\section{The }\\label{sec:roundtrip}' in s10 and 'and the source never' in s10, s10[s10.find('\\section{The'):][:80])
        page.keyboard.press('Control+z')
        check('undo cross delete', src(page) == base)

        # 8. footnote edit
        click_text(page, 'edit this footnote', 4)
        page.keyboard.type('!')
        check('footnote text editable', 'edit!' in src(page) and '\\footnote{Try it: edit! this footnote' in src(page), src(page)[src(page).find('footnote{'):][:50])
        page.keyboard.press('Control+z')

        # 9. table cell edit
        click_text(page, 'New inline math', 3)
        page.keyboard.type('Z')
        check('table cell editable', 'NewZ inline math' in src(page))
        page.keyboard.press('Control+z')

        # 10. heading edit
        click_text(page, 'How to use it', 3)
        page.keyboard.type('!')
        check('heading editable', '\\section{How! to use it}' in src(page))
        page.keyboard.press('Control+z')

        # 11. theorem optional title edit
        click_text(page, 'Minimal patches', 7)
        page.keyboard.type('!')
        check('theorem title editable', '[Minimal! patches]' in src(page))
        page.keyboard.press('Control+z')

        # 12. title edit (preamble)
        click_text(page, 'Editing in Print', 7)
        page.keyboard.type('X')
        check('title in preamble editable', '\\title{EditingX in Print}' in src(page), src(page)[src(page).find('\\title'):][:30])
        page.keyboard.press('Control+z')

        # 13. macro argument editable
        click_text(page, 'Ctrl+B', 4)
        page.keyboard.type('Q')
        check('macro arg editable', '\\key{CtrlQ+B}' in src(page), src(page)[src(page).find('\\key'):][:20])
        page.keyboard.press('Control+z')

        # 14. list item enter
        click_text(page, 'between visits', 15)
        page.keyboard.press('Enter')
        page.keyboard.type('New item')
        s11 = src(page)
        check('enter in list adds item', 'between visits.\n  \\item New item' in s11, s11[s11.find('between visits'):][:40])
        # (typing is undone word by word, as Word's: the item's Enter, "New ", "item")
        for _ in range(3): page.keyboard.press('Control+z')
        check('undo list', src(page) == base, src(page)[src(page).find('between visits'):][:40])

        # 15. enter at end of paragraph -> ghost, then type
        click_text(page, 'edited by hand.', 15)
        page.keyboard.press('Enter')
        page.keyboard.type('Fresh paragraph.')
        s12 = src(page)
        check('ghost paragraph inserts clean source', 'edited by hand.\n\nFresh paragraph.\n\n\\section{Citations' in s12, s12[s12.find('by hand.'):][:60])
        # (word by word: "Fresh " with its paragraph, then "paragraph.")
        page.keyboard.press('Control+z')
        check('undo takes the last word typed', 'edited by hand.\n\nFresh \n' in src(page) or 'edited by hand.\n\nFresh\n' in src(page), src(page)[src(page).find('by hand.'):][:60])
        page.keyboard.press('Control+z')
        check('undo ghost', src(page) == base, src(page)[src(page).find('by hand.'):][:60])

        # 16. typing speed
        click_text(page, 'The page and the source never disagree', 3)
        t0 = time.time()
        page.keyboard.type('abcdefghij', delay=0)
        dt = (time.time() - t0) / 10 * 1000
        check('per keystroke latency < 120ms', dt < 120, round(dt, 1))
        for _ in range(10):
            page.keyboard.press('Backspace')
        check('cleanup after speed test', src(page) == base)

        # 17. cite popover opens & lists entries
        page.click('.a-cite >> nth=0')
        page.wait_for_selector('.pop-cite')
        n = page.evaluate('document.querySelectorAll(".pop-cite .pitem").length')
        check('cite popover lists bib entries', n >= 3, n)
        page.keyboard.press('Escape')

        # 18. ref popover
        page.click('.a-ref >> nth=0')
        page.wait_for_selector('.pop-ref')
        n = page.evaluate('document.querySelectorAll(".pop-ref .pitem").length')
        check('ref popover lists labels', n >= 5, n)
        page.keyboard.press('Escape')

        # 18b. Enter on an equation that Backspace selected opens it, and changes nothing
        click_text(page, ' to edit its source', 0)
        page.keyboard.press('Backspace')
        page.keyboard.press('Enter')
        settle(page, 200)
        check('Enter on a selected equation opens it', page.evaluate('!!document.querySelector(".pop-math")') and src(page) == base)
        page.keyboard.press('Escape')
        settle(page, 100)
        check('closing it leaves the source alone', src(page) == base)

        # 19. source pane opens and syncs
        if not page.evaluate("document.body.classList.contains('src-on')"):
            page.click('#b-src')
        page.wait_for_selector('#cmhost .CodeMirror', timeout=5000)
        settle(page, 200)
        cmv = page.evaluate('window.rikuy.cm.getValue()')
        check('source pane shows main.tex', cmv == src(page))
        click_text(page, 'Math is an object', 4)
        page.keyboard.type('W')
        settle(page, 100)
        check('page edit mirrors into source pane', page.evaluate('window.rikuy.cm.getValue()') == src(page) and 'MathW' in src(page))
        page.keyboard.press('Control+z')
        page.evaluate('''() => { const cm = window.rikuy.cm; const d = cm.getDoc(); const i = d.getValue().indexOf('Math is an object'); d.replaceRange('Algebra ', d.posFromIndex(i)); }''')
        # (the source pane's edit reaches the page after its pause, srcRebuild's 260 ms)
        settle(page, 600, full=True)
        has = page.evaluate('[...document.querySelectorAll("#pages span.t")].some(s => s.textContent.includes("Algebra Math is"))')
        check('source edit re-typesets page', has)
        page.screenshot(path=SHOTS + '/02-source.png')
        page.keyboard.press('Control+z')
        settle(page, 300)
        # typing in the source and undoing at once: the typing goes, nothing older does
        click_text(page, 'Math is an object', 4)
        page.keyboard.type('Q')
        settle(page, 2100)
        page.evaluate('''() => { const cm = window.rikuy.cm; const d = cm.getDoc(); const i = d.getValue().indexOf('The round trip'); cm.focus(); d.setCursor(d.posFromIndex(i + 3)); }''')
        page.keyboard.type('XYZ')
        page.keyboard.press('Control+z')
        settle(page, 400)
        check('Ctrl+Z right after typing in the source undoes that typing only', 'MathQ is' in src(page) and 'XYZ' not in src(page) and page.evaluate('window.rikuy.cm.getValue()') == src(page))
        page.evaluate('''() => { const cm = window.rikuy.cm; const d = cm.getDoc(); const i = d.getValue().indexOf('The round trip'); cm.focus(); d.setCursor(d.posFromIndex(i + 3)); }''')
        page.keyboard.type('UVW')
        box = page.evaluate('''() => { const s = [...document.querySelectorAll('#pages span.t')].find(x => x.textContent.includes('Citations come from')); s.scrollIntoView({block: 'center'}); const r = document.createRange(); r.setStart(s.firstChild, 3); r.setEnd(s.firstChild, 4); const b = r.getBoundingClientRect(); return [b.left + 1, b.top + b.height / 2]; }''')
        page.mouse.click(box[0], box[1])
        page.keyboard.type('P')
        check('typing in the source, then at once on the page, keeps both', 'TheUVW round' in src(page) and 'CitPations' in src(page), src(page)[src(page).find('Citations') - 4:][:20])
        undo_all(page)
        check('and undo gives the bytes back', src(page) == base)
        # Tab indents in the source pane; Escape, then Tab, leaves it without typing anything
        page.evaluate('() => { const cm = window.rikuy.cm; cm.focus(); cm.setCursor({line: 0, ch: 0}); }')
        page.keyboard.press('Escape'); page.keyboard.press('Tab')
        settle(page, 400)
        check('Escape, then Tab, leaves the source pane and types nothing', src(page) == base and not page.evaluate("!!document.activeElement.closest('#srcpane')"), page.evaluate('document.activeElement.className'))
        edges(page, errors)
        popovers(page)
        hidden_deletes(page)
        default_macros(page)
        skipped_args(page)
        native_core(page)

        check('no console errors', not errors, errors[:5])
        browser.close()

        # Mobile and dark
        browser, page, errors = open_page(p, width=390, height=844, dark=True)
        page.screenshot(path=SHOTS + '/03-mobile-dark.png')
        sw = page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
        check('no horizontal page scroll on phone', sw <= 0, sw)
        page.click('#zoomv')
        settle(page, 300)
        r = page.evaluate('''() => { const d = document.getElementById('desk'); d.scrollLeft = 0; const pg = document.querySelector('.page').getBoundingClientRect(); return [document.getElementById('zoomv').textContent, Math.round(pg.left - d.getBoundingClientRect().left), d.scrollWidth - d.clientWidth]; }''')
        check('on a phone the Fit button switches to actual size', r[0] == '100%', r)
        check('a page wider than the window starts at its left edge and scrolls', r[1] >= 0 and r[2] > 0, r)
        page.set_viewport_size({'width': 900, 'height': 700})
        settle(page, 300)
        over = page.evaluate('''() => { const m = document.querySelector('.brand .mark').getBoundingClientRect(); const b = document.getElementById('b-open').getBoundingClientRect(); return [Math.round(m.right), Math.round(b.left)]; }''')
        check('the name and the buttons do not overlap at 900px', over[0] <= over[1], over)
        check('no console errors (mobile)', not errors, errors[:5])
        browser.close()

        # Two tabs on the project, switching between them; a tab hidden then killed
        browser, A, errors = open_page(p, width=1200, height=800)
        def tab():
            t = A.context.new_page()
            t.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
            t.goto('https://rikuy.test/')
            t.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=20000)
            ready(t); settle(t, 300)
            return t
        def vis(t, state):
            t.evaluate('''(s) => { Object.defineProperty(document, 'visibilityState', {value: s, configurable: true}); document.dispatchEvent(new Event('visibilitychange')); }''', state)
            # (hidden, the tab writes what it has at once: the time is under test, the ordinary save
            # 700 ms after an edit would satisfy any wait on the write, so 300 ms fixed, then its
            # writes finished; shown, it takes in what another tab wrote, done when its copy and
            # IndexedDB's agree)
            if state == 'hidden':
                t.wait_for_timeout(300); stored(t)
            else:
                settle(t, 300); kept(t)
        B = tab()
        vis(B, 'hidden')
        click_text(A, 'Click anywhere in this paragraph', 5)
        A.keyboard.type('AAA')
        vis(A, 'hidden'); vis(B, 'visible')
        check('a tab brings in what another tab typed when it is shown', 'ClickAAA' in src(B))
        click_text(B, 'Math is an object', 4)
        B.keyboard.type('BBB')
        vis(B, 'hidden'); vis(A, 'visible')
        check('and back again, keeping its own', 'MathBBB' in src(A) and 'ClickAAA' in src(A))
        saved(A, 900)
        C = tab()
        click_text(C, 'start typing', 3)
        C.keyboard.type('CCC')
        saved(C, 1000)
        B.close(run_before_unload=True)  # B changed nothing since it last saved
        D = tab()
        check('closing a tab that changed nothing keeps what another tab saved', 'staCCCrt typing' in src(D) and 'ClickAAA' in src(D) and 'MathBBB' in src(D))
        # both visible (side by side): A types without having seen C's text
        click_text(A, 'Rikuy escapes', 3)
        A.keyboard.type('Z')
        saved(A, 1200)
        vs = A.evaluate('window.rikuy.allSnaps().then(async vs => { for (const v of vs) { const f = new Map(await window.rikuy.versionFiles(v) || []); if (v.label === "From another tab" && (f.get("main.tex") || "").includes("staCCCrt")) return true; } return false; })')
        check('a tab that writes over another tab\'s text keeps that text as a version', vs)
        # a phone hides the page, then kills it without unload
        click_text(D, 'MathBBB is an object', 0)
        D.keyboard.type('V')
        vis(D, 'hidden')
        D.close()
        E = tab()
        check('a keystroke just before the page is hidden and killed is kept', 'VMathBBB' in src(E), src(E)[src(E).find('MathBBB') - 3:][:20])
        # pruning keeps the newest version of every project
        E.evaluate('''async () => { const g = window.rikuy; const n = g.name; g.name = 'Another project'; await g.snapshot('', {force: true}); g.name = n; for (let i = 0; i < 85; i++) { g.files.set('main.tex', g.files.get('main.tex') + ' '); await g.snapshot('', {force: true}); } await new Promise(r => setTimeout(r, 500)); g.snapList = null; }''')
        names = E.evaluate('window.rikuy.allSnaps().then(vs => vs.map(v => v.name))')
        check('pruning versions keeps the last one of a project no longer open', 'Another project' in names and len(names) <= 82, len(names))
        # an edit made just before a quick navigation away (a link followed, a bookmark)
        click_text(E, 'Rikuy escapes', 0)
        E.keyboard.type('W')
        E.goto('about:blank')
        E.goto('https://rikuy.test/')
        E.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=20000)
        check('an edit made just before navigating away is kept', 'WRikuy escapes' in src(E), src(E)[src(E).find('Rikuy escapes') - 3:][:20])
        check('no console errors (tabs)', not errors, errors[:5])
        browser.close()

        browser, page, errors = open_page(p)
        formula_mistakes(page)
        check('no console errors (formula mistakes)', not errors, errors[:5])
        browser.close()

        browser, page, errors = open_page(p)
        select_all(page)
        check('no console errors (select all)', not errors, errors[:5])
        browser.close()

        browser, page, errors = open_page(p)
        first_words(page)
        check('no console errors (first words)', not errors, errors[:5])
        browser.close()

        browser, page, errors = open_page(p, width=390, height=844)
        phone_layout(page)
        browser.close()

        first_visit(p)

        # on a page of its own, so nothing above meets the PDF pane
        browser, page, errors = open_page(p)
        pdfjs_local(page, 'https://rikuy.test/')
        # why TeX did not start: build instructions for a page built without its TeX tree, what
        # to do for a visitor whose download of it failed
        m = page.evaluate('''() => { const g = window.rikuy; const built = 'The TeX tree is not next to this page (tex/tree.wasm: Could not load https://x/tex/tree.wasm (HTTP 404)). A copy built from source needs tex/build_tree.py first; README.md, Running it';
          const net = built.replace(/Could not load.*\\(HTTP 404\\)/, 'Failed to fetch');
          return [g.texFailText(new Error(net)), g.texFailText(new Error(built)), g.texFailText(new Error(built.replace('404', '503'))), g.texFailText(new Error('TeX ran out of memory')), g.texFailText(new Error(net), true), g.texFailText(new Error('Failed to fetch')), g.texFailText(new Error('Load failed'))]; }''')
        plain = 'The TeX engine could not be downloaded. Check your connection, then press Try again. '
        check('a failed download of the TeX engine is said in plain words, with what to do', m[0] == plain and m[2] == plain and m[5] == plain and m[6] == plain and 'build_tree' not in m[0] and 'Failed to fetch' not in m[5], m)
        check('a page built without its TeX tree still names the build step; other errors pass as they are; offline has its own message', 'tex/build_tree.py' in m[1] and m[3] == 'TeX ran out of memory. ' and m[4] == '', m)
        check('no console errors (pdf.js)', not errors, errors[:5])
        browser.close()

        browser, page, errors = open_page(p)
        ui_fonts(page)
        latin_ext_fonts(page)
        browser.close()

        browser, page, errors = open_page(p, width=1400, height=900)
        zoom_gestures(page)
        check('no console errors (zoom gestures)', not errors, errors[:5])
        browser.close()

        for w, h in ((1400, 900), (390, 844)):
            browser, page, errors = open_page(p, width=w, height=h)
            enter_kept(page, w)
            check('no console errors (Enter kept, %d px)' % w, not errors, errors[:5])
            ghost_looks(page, w)
            ghost_last(page, w)
            ghost_enters(page, w)
            ghost_inside(page, w)
            check('no console errors (Enter\'s empty paragraphs, %d px)' % w, not errors, errors[:5])
            browser.close()

        browser, page, errors = open_page(p, width=1366, height=900)
        word_typing(page)
        check('no console errors (typing as in Word)', not errors, errors[:5])
        crlf_enter(page)
        check('no console errors (Enter in a CRLF file)', not errors, errors[:5])
        browser.close()

    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    return 1 if bad else 0

def zoom_gestures(page):
    """A pinch, Ctrl with the wheel and Ctrl with + - 0 zoom the document, and the number in the bar follows."""
    lab = lambda: page.inner_text('#zoomv')
    at = page.evaluate("(() => { const r = document.querySelector('.page').getBoundingClientRect(); return [r.left + r.width * 0.3, r.top + 220]; })()")
    under = "(([x, y]) => { const n = document.elementFromPoint(x, y); return n ? (n.textContent || '').slice(0, 60) : '' })"
    page.mouse.move(*at)
    was, text = lab(), page.evaluate(under, at)
    page.keyboard.down('Control'); page.mouse.wheel(0, -100); page.keyboard.up('Control')
    settle(page, 300)
    check('Ctrl with the mouse wheel over the page zooms the document, and the zoom number follows', lab() != was and lab().endswith('%'), (was, lab()))
    check('and what was under the pointer is still under it', page.evaluate(under, at) == text, (text, page.evaluate(under, at)))
    one = lab()
    for _ in range(6):
        page.keyboard.down('Control'); page.mouse.wheel(0, -6); page.keyboard.up('Control'); settle(page, 20)
    settle(page, 300)
    check('a pinch (small steps, as a trackpad sends them) zooms by small amounts, not button steps', 0 < int(lab()[:-1]) - int(one[:-1]) < 25, (one, lab()))
    page.mouse.click(*at)
    page.keyboard.press('Control+0'); settle(page, 200)
    z0 = lab()
    page.keyboard.press('Control+Equal'); settle(page, 200)
    z1 = lab()
    page.keyboard.press('Control+Minus'); settle(page, 200)
    check('on the page Ctrl+0 is actual size, Ctrl+= and Ctrl+- step in and out', (z0, z1, lab()) == ('100%', '110%', '100%'), (z0, z1, lab()))
    # (the zoom is written to the settings after the wheel stops, by a timer)
    page.keyboard.down('Control'); page.mouse.wheel(0, -300); page.keyboard.up('Control'); settle(page, 500, full=True)
    kept = lab()
    page.reload(); ready(page); settle(page, 500)
    check('a zoom made with the wheel is the one the next visit opens with', lab() == kept, (kept, lab()))
    page.click('#b-src'); settle(page, 500)
    box = page.evaluate("(() => { const r = document.getElementById('srcpane').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()")
    page.mouse.move(*box)
    page.keyboard.down('Control'); page.mouse.wheel(0, -100); page.keyboard.up('Control'); settle(page, 300)
    check('over the source the wheel is the browser\'s again: the document\'s zoom stays', lab() == kept, (kept, lab()))


def enter_kept(page, w):
    """Enter's new line is on the page alone until something is typed: a relayout (a font that
    came, the window resized by a phone's keyboard, a pane opened) took it away, and the next words
    went on the end of the line above. The same after a display closed with Enter."""
    D = '\\documentclass{article}\n\\begin{document}\nFirst paragraph here.\n\nSecond one.\n\\end{document}\n'
    for how in ('relayout', 'resize'):
        load_doc(page, D); click_text(page, 'here.', 5); page.keyboard.press('Enter'); settle(page, 100)
        if how == 'relayout': page.evaluate('window.rikuy.relayout(true)')
        else: page.set_viewport_size({'width': w - 20, 'height': 800}); settle(page, 400); page.set_viewport_size({'width': w, 'height': 800}); settle(page, 400)
        page.keyboard.type('New'); settle(page, 300)
        s = src(page)
        check('Enter, then a %s, then words: they start a paragraph of their own (%d px)' % (how, w), 'here.\n\nNew' in s, s[s.find('First'):s.find('Second')])
    # (the Font dialog's size box with the focus while the page is laid out again: OK formats the
    # words selected, not the document's start)
    load_doc(page, D); select_text(page, 'Second one')
    page.evaluate('window.rikuy.runCommand("font-dialog")'); page.wait_for_selector('.pop input', timeout=5000); settle(page, 200)
    page.locator('.pop input').first.focus(); page.evaluate('window.rikuy.relayout(true)'); settle(page, 100)
    got = page.evaluate("window.rikuy.rbRange ? window.rikuy.rbRange.toString() : null")
    check('a relayout with a dialog\'s field focused keeps what the dialog acts on (%d px)' % w, got == 'Second one', got)
    page.keyboard.press('Escape'); settle(page, 200)


# every element of the pages (and its ::before and ::after) drawn with a dashed outline, border or
# underline: the blank page's hint had a dashed line under it
_DASHED = """() => [...document.querySelectorAll('#pages, #pages *')].flatMap((e) => [null, '::before', '::after'].map((x) => [e, x])).filter(([e, x]) => {
  const c = getComputedStyle(e, x); if (x && c.content === 'none') return false;
  return c.outlineStyle === 'dashed' || ['Top', 'Right', 'Bottom', 'Left'].some((d) => c['border' + d + 'Style'] === 'dashed') || (c.textDecorationLine !== 'none' && c.textDecorationStyle === 'dashed'); })
  .map(([e, x]) => e.className + (x || ''))"""


_GHOST_DOC = ('\\documentclass{article}\n\\begin{document}\nFirst paragraph with a note\\footnote{A note.} and $x^2$ in it, '
              'long enough to run over two lines of the page, and Ctrl+Z gives back exactly the bytes you had.\n\nSecond one.\n\\end{document}\n')
# where a word is drawn (x from its paragraph's left), its paragraph's indent and line height, the
# caret, and Enter's empty paragraphs: how many, their height, their outline
_GHOST_GEO = """(w) => { const sp = [...document.querySelectorAll('#pages span.t')].filter((x) => x.textContent.includes(w)).pop();
  const it = sp.closest('.it'), i = sp.firstChild.data.indexOf(w), r = document.createRange(); r.setStart(sp.firstChild, i); r.setEnd(sp.firstChild, i + 1);
  const R = r.getBoundingClientRect(), I = it.getBoundingClientRect(), s = getSelection(), C = s.rangeCount ? s.getRangeAt(0).getBoundingClientRect() : null;
  const g = window.rikuy.ghost, cs = getComputedStyle(it);
  return { x: R.left - I.left, y: R.top, ind: parseFloat(cs.textIndent) || 0, lh: parseFloat(cs.lineHeight), cx: C && C.left, cy: C && C.top,
    n: g ? g.n || 1 : 0, gh: g ? g.el.getBoundingClientRect().height : 0, go: g ? getComputedStyle(g.el).outlineStyle : null }; }"""


def ghost_looks(page, w):
    """Enter's empty paragraph as Word's (Pedro, 2026-11-26): no frame round it (a dashed blue box
    was drawn round it, on a white page, a dark one, in forced colours and on phones), and the blank
    page's "Type here to start." plain words with no dashed line under them. Enter before a word
    ends the paragraph there and starts the next at its indent; Enter twice more, two empty lines
    above the word, the caret staying before it."""
    load_doc(page, _GHOST_DOC)
    click_text(page, 'had.')
    page.keyboard.press('Enter'); settle(page, 100)
    a = page.evaluate(_GHOST_GEO, 'had.')
    check('Enter before a word: the paragraph ends there and the next starts at its indent, as TeX sets it (%d px)' % w,
          'you \n\nhad.' in src(page) and abs(a['x'] - a['ind']) < 1.5 and a['ind'] > 5, (a, src(page)[-80:]))
    page.keyboard.press('Enter'); settle(page, 100)
    page.keyboard.press('Enter'); settle(page, 100)
    b = page.evaluate(_GHOST_GEO, 'had.')
    check('Enter twice more there: two empty lines above the word, the caret staying before it, nothing written (%d px)' % w,
          b['n'] == 2 and abs(b['gh'] - 2 * b['lh']) < 2 and abs(b['y'] - a['y'] - 2 * b['lh']) < 2 and abs(b['cy'] - b['y']) < 3 and abs(b['x'] - b['ind']) < 1.5 and 'you \n\nhad.' in src(page), b)
    for scheme in ('white page', 'dark page', 'forced colours'):
        if scheme == 'dark page': page.evaluate("document.body.classList.add('dark-page')")
        if scheme == 'forced colours': page.evaluate("document.body.classList.remove('dark-page')"); page.emulate_media(forced_colors='active')
        d = page.evaluate(_DASHED)
        check('no dashed frame round the empty paragraphs, nor any dashed line on the page (%s, %d px)' % (scheme, w), not d and page.evaluate(_GHOST_GEO, 'had.')['go'] == 'none', d)
    page.emulate_media(forced_colors='none')
    # the blank page's hint: plain words, as Word's placeholder text
    page.click('#b-new')
    page.wait_for_function('window.rikuy.name.startsWith("Untitled") && window.rikuy.ghost', timeout=5000)
    hint = page.evaluate("(() => { const c = getComputedStyle(document.querySelector('.ghostp.empty .gh'), '::after'); return [c.content, c.borderBottomStyle, c.textDecorationLine]; })()")
    check('the blank page says "Type here to start." with no dashed line under it (%d px)' % w, 'Type here' in hint[0] and hint[1] == 'none' and hint[2] == 'none' and not page.evaluate(_DASHED), (hint, page.evaluate(_DASHED)))


def ghost_last(page, w):
    """Enter at the last paragraph's end, then a relayout (a font that came, the window resized, a
    pane opened): the empty paragraph stays below the paragraph, the caret in it. Its block takes in
    the line break before \\end{document}, so the place was read as inside it, and the empty
    paragraph and the caret went above the paragraph (ghostAt)."""
    load_doc(page, _GHOST_DOC)
    click_text(page, 'Second one.', 11)
    page.keyboard.press('Enter'); settle(page, 100)
    page.evaluate('window.rikuy.relayout(true)'); settle(page, 100)
    g = page.evaluate(_GHOST_GEO, 'Second')
    check('Enter at the last paragraph\'s end, then a relayout: the empty paragraph stays below it, the caret in it (%d px)' % w,
          g['n'] == 1 and abs(g['cy'] - g['y'] - g['lh']) < 2, g)
    page.keyboard.type('New words'); settle(page, 200)
    check('and words typed there go after it (%d px)' % w, 'Second one.\n\nNew words\n\n\\end{document}' in src(page), src(page)[-60:])


def ghost_enters(page, w):
    """Enter pressed again and again at a paragraph's end: as many empty lines, the caret on the
    last, as Word's (the second and third Enter did nothing: one empty line for three); a relayout
    keeps them; Backspace and Undo take one each, the text untouched; words typed on the last are
    a paragraph of their own."""
    load_doc(page, _GHOST_DOC)
    click_text(page, 'Second one.', 11)
    ys = []
    for _ in range(3):
        page.keyboard.press('Enter'); settle(page, 100)
        ys.append(page.evaluate(_GHOST_GEO, 'Second'))
    lh = ys[0]['lh']
    check('Enter three times at a paragraph\'s end: three empty lines, the caret on the last (%d px)' % w,
          [g['n'] for g in ys] == [1, 2, 3] and abs(ys[2]['gh'] - 3 * lh) < 2 and all(abs(g['cy'] - g['y'] - (k + 1) * lh) < 2 for k, g in enumerate(ys)), ys)
    page.evaluate('window.rikuy.relayout(true)'); settle(page, 100)
    r = page.evaluate(_GHOST_GEO, 'Second')
    check('a relayout keeps the three (%d px)' % w, r['n'] == 3 and abs(r['gh'] - 3 * lh) < 2 and abs(r['cy'] - r['y'] - 3 * lh) < 2, (r, ys[2]))
    check('and draws no dashed line round them (%d px)' % w, not page.evaluate(_DASHED), page.evaluate(_DASHED))
    page.keyboard.press('Backspace'); settle(page, 100)
    page.keyboard.press('Control+z'); settle(page, 100)
    u = page.evaluate(_GHOST_GEO, 'Second')
    check('Backspace takes one, Undo another, the text untouched (%d px)' % w, u['n'] == 1 and src(page) == _GHOST_DOC and abs(u['cy'] - u['y'] - lh) < 2, (u, src(page)[-60:]))
    page.keyboard.press('Enter'); settle(page, 100)
    page.keyboard.type('New words'); settle(page, 200)
    check('words typed on the last of them are a paragraph of their own (%d px)' % w, 'Second one.\n\nNew words\n\n\\end{document}' in src(page) and not page.evaluate('window.rikuy.ghost'), src(page)[-60:])


_ALIGNED_DOC = ('\\documentclass{article}\n\\usepackage{amsthm}\n\\newtheorem{theorem}{Theorem}\n\\begin{document}\nBefore it.\n\n'
                '\\begin{flushright}\nRight words one.\n\nRight words two.\n\\end{flushright}\n\n\\begin{center}\nCentred words.\n\\end{center}\n\n'
                '\\begin{theorem}\nTheorem words.\n\\end{theorem}\n\n\\begin{quote}\nQuoted words.\n\\end{quote}\n\nAfter it.\n\\end{document}\n')
# the caret against the paragraph whose words w are: from its left, its right, its middle, below it
_CARET_BY = """(w) => { const sp = [...document.querySelectorAll('#pages span.t')].find((x) => x.textContent.includes(w)), it = sp.closest('.it');
  const I = it.getBoundingClientRect(), C = getSelection().getRangeAt(0).getBoundingClientRect(), g = window.rikuy.ghost;
  return { left: C.left - I.left, right: I.right - C.left, mid: C.left - (I.left + I.width / 2), below: C.top - I.bottom, after: !!g && g.el.previousElementSibling === it, cls: g && g.el.className }; }"""


def ghost_inside(page, w):
    """Enter at the end of a paragraph in an environment (a theorem, a quote, a flushright, one of
    two there), then a relayout (a font that came, the window resized, a pane): the empty paragraph
    stays right after that paragraph, the caret in it, and what is typed goes there. The
    environment is one block of the page, and the place inside it was read as before it: the empty
    paragraph and the caret went above the environment (ghostAt)."""
    for words in ('Theorem words.', 'Quoted words.', 'Right words one.', 'Right words two.'):
        load_doc(page, _ALIGNED_DOC)
        click_text(page, words, len(words)); page.keyboard.press('Enter'); settle(page, 100)
        page.evaluate('window.rikuy.relayout(true)'); settle(page, 100)
        r = page.evaluate(_CARET_BY, words)
        page.keyboard.type('Zz'); settle(page, 200)
        check('Enter after %r, then a relayout: the empty paragraph and the caret right below it, the words typed after it (%d px)' % (words, w),
              r['after'] and r['below'] > -2 and words + '\n\nZz\n\n' in src(page), (r, src(page)[src(page).find(words):][:60]))


def crlf_enter(page):
    """Enter on the page in a file written with Windows line ends (\\r\\n): its line breaks are
    \\r\\n too, and Enter at a paragraph's start shows the empty paragraph and writes nothing, as in a
    file with \\n. Enter wrote \\n, and at a paragraph's start a blank line, the file then had both."""
    D = '\\documentclass{article}\r\n\\begin{document}\r\nAlpha beta gamma.\r\n\r\nDelta epsilon zeta.\r\n\\end{document}\r\n'
    for name, at, off, keys, want in (('in a paragraph', 'beta', 2, ['Enter', 'X'], 'Alpha be\r\n\r\nXta gamma.'), ('at its end', 'gamma.', 6, ['Enter', 'New'], 'gamma.\r\n\r\nNew\r\n\r\nDelta'),
                                      ('at its start', 'Delta', 0, ['Enter', 'X'], 'gamma.\r\n\r\nXDelta'), ('at the last one\'s end', 'zeta.', 5, ['Enter', 'Last'], 'zeta.\r\n\r\nLast\r\n\r\n\\end')):
        load_doc(page, D); click_text(page, at, off)
        for k in keys:
            if k == 'Enter': page.keyboard.press('Enter'); settle(page, 100)
            else: page.keyboard.type(k)
        settle(page, 300)
        s = src(page)
        check('Enter %s of a CRLF file: \\r\\n written, the words where typed' % name, want in s and not re.search(r'(^|[^\r])\n', s), repr(s[40:130]))
    # another version put back whole (a version or a commit restored, a coauthor's or another tab's
    # text) keeps its own line ends: only what is typed or written here takes the file's
    LF = D.replace('\r\n', '\n').replace('gamma', 'GAMMA')
    for kind in ('restore', 'merge', 'other-tab'):
        load_doc(page, D)
        page.evaluate("([t, k]) => window.rikuy.commit([{ f: 'main.tex', s: 0, e: window.rikuy.src('main.tex').length, t }], null, k)", [LF, kind]); settle(page, 200)
        check('a %s of a version with \\n line ends into a CRLF file: that version\'s bytes' % kind, src(page) == LF, repr(src(page)[40:90]))


# A short document with what a paragraph's edges meet: a heading, bold and italic words, an inline
# formula, a footnote, a reference, a citation, a list and a display
WORD_DOC = r"""\documentclass{article}
\begin{document}
\section{Introduction}
First paragraph with \textbf{bold words} and \emph{italic words} here.
A formula $x^2+y$ sits inline, a note\footnote{The note.} too, see Section~\ref{sec:b} and \cite{knuth}.

Second paragraph is plain text only.
\begin{itemize}
\item Apple one
\item Banana two
\end{itemize}
After the list comes text.
\[ a = b \]
After display text.

\section{Background}\label{sec:b}
Last paragraph of the document.
\end{document}
"""


def word_typing(page):
    """Everyday typing as a Word user does it at 1366 px: selections by mouse and keys typed over."""
    k = page.keyboard
    def at(text, off=1):
        return page.evaluate("""([text, off]) => { const s = [...document.querySelectorAll('#pages span.t')].find((x) => x.textContent.includes(text));
          s.scrollIntoView({ block: 'center' });
          const i = s.textContent.indexOf(text) + off, r = document.createRange(); r.setStart(s.firstChild, i); r.setEnd(s.firstChild, i + 1);
          const b = r.getBoundingClientRect(); return [b.left + 1, b.top + b.height / 2]; }""", [text, off])
    # 1: the page's last paragraph above its footnotes. A triple click there, or Shift+Down on its
    # last line, ends the selection at the footnotes' start, which was read as the footnote's own
    # words, earlier in the source: typing over it deleted everything from the footnote to here
    load_doc(page, WORD_DOC)
    x, y = at('Last paragraph'); page.mouse.click(x, y, click_count=3); settle(page, 120, full=True)
    k.type('Z'); settle(page, 100)
    check('a triple click on the paragraph above the footnotes, then a letter: the paragraph alone is replaced', src(page) == WORD_DOC.replace('Last paragraph of the document.', 'Z'), src(page)[150:])
    load_doc(page, WORD_DOC)
    click_text(page, 'Last paragraph', 0); k.press('Shift+ArrowDown'); k.type('Z'); settle(page, 100)
    check('Shift+Down on the last line above the footnotes, then a letter: only that line is replaced', src(page) == WORD_DOC.replace('Last paragraph of the document.', 'Z'), src(page)[150:])
    # (and one from a footnote's words into the next page ends at that footnote's end: it ended
    # at the last footnote of the page, whose mark is in the body, and the body between went)
    fill = '\n\n'.join('Filler paragraph number %d with enough words to take a few lines on the page so pages fill up quickly here.' % i for i in range(40))
    D3 = '\\documentclass{article}\n\\begin{document}\nPara Alpha has a note\\footnote{Note one text.} and more.\n\nPara Bravo in between with words.\n\nPara Charlie has a note\\footnote{Note two text.} end.\n\n' + fill + '\n\nZeta last words.\n\\end{document}\n'
    load_doc(page, D3)
    page.evaluate("""() => { const sp = [...document.querySelectorAll('#pages span.t')];
      const a = sp.find((s) => s.textContent.includes('Note one')), z = sp.find((s) => s.textContent.includes('number 30'));
      const r = document.createRange(); r.setStart(a.firstChild, a.textContent.indexOf('one')); r.setEnd(z.firstChild, 3);
      document.getElementById('pages').focus(); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
    settle(page, 100, full=True); k.type('Z'); settle(page, 100)
    check('from a footnote\'s words into the next page, then a letter: only that footnote\'s words after the place go', src(page) == D3.replace('Note one text.', 'Note Z'), src(page)[40:260])
    # 2: a triple click selects the whole paragraph, as Word's: the browser's stopped at the first
    # formula in it, and the letter typed over it left the rest of the paragraph standing
    load_doc(page, WORD_DOC)
    x, y = at('First paragraph'); page.mouse.click(x, y, click_count=3); settle(page, 120, full=True)
    k.type('Z'); settle(page, 100)
    first = WORD_DOC[WORD_DOC.index('First paragraph'):WORD_DOC.index('\n\nSecond')]
    para = src(page)
    load_doc(page, WORD_DOC)
    x, y = at('Background'); page.mouse.click(x, y, click_count=3); settle(page, 120, full=True)
    k.type('Z'); settle(page, 100)
    check('a triple click on a paragraph with a formula, a footnote, a reference and a citation, then a letter, replaces all of it; on a heading, its words, the heading staying',
          para == WORD_DOC.replace(first, 'Z') and src(page) == WORD_DOC.replace('{Background}', '{Z}'), (para[40:200], src(page)[300:]))
    # 3: words copied from two paragraphs are pasted as two paragraphs, as Word's are: copied from
    # a paragraph into the list item or the paragraph after a heading, they came as one run of
    # words, "only.Apple one" (only a blank line in the source counted as a paragraph's end)
    # (across a bold and an italic word, each keeps its format, as Word's copy does: PR 118)
    page.context.grant_permissions(['clipboard-read', 'clipboard-write'])
    end = 'of the document.'
    bad = []
    for a, z, want in (('Second', 'Apple one', 'Second paragraph is plain text only.\n\nApple one'), ('Background', 'Last', '\\section{Background}\n\nLast'), ('bold', 'italic', '\\textbf{bold words} and \\emph{italic}')):
        load_doc(page, WORD_DOC)
        place(page, (a, z)); k.press('Control+c'); settle(page, 50)
        click_text(page, end, len(end)); k.press('Control+v'); settle(page, 100)
        if src(page) != WORD_DOC.replace(end, end + want): bad.append((a, z, src(page)[-80:]))
    check('copied from a paragraph into a list item or from a heading into a paragraph, pasted: two paragraphs; across bold and italic in one paragraph: one line', not bad, bad)
    # (and what a selection holds whole goes with its formatting and structure, as Word's copy
    # keeps the paragraphs it holds: Select All, Copy, Paste gave every heading as plain words,
    # every list as paragraphs and every bold word plain)
    load_doc(page, WORD_DOC)
    click_text(page, 'Last', 0); k.press('Control+a'); k.press('Control+c'); settle(page, 50)
    click_text(page, end, len(end)); k.press('Control+v'); settle(page, 100)
    s2 = src(page)
    check('Select All, Copy, then Paste at the end: headings, the list, bold, italic and the display come again as they are', all(s2.count(x) == 2 for x in ('\\section{Introduction}', '\\section{Background}', '\\begin{itemize}\n\\item Apple one\n\\item Banana two\n\\end{itemize}', '\\textbf{bold words}', '\\emph{italic words}', '\\[ a = b \\]', '\\footnote{The note.}')), s2[-300:])
    # (into a heading's words what is copied goes as one line of words: a heading or a list
    # pasted there as it was nested \section{Intro\section{...}} or a list in it, and TeX stopped)
    for a, z, want in (('Background', 'Last', 'Intro{Background} Lastduction'), ('Second', 'After', 'IntroSecond paragraph is plain text only.')):
        load_doc(page, WORD_DOC)
        place(page, (a, z)); k.press('Control+c'); settle(page, 50)
        click_text(page, 'Introduction', 5); k.press('Control+v'); settle(page, 100)
        h = src(page)[src(page).index('\\section{'):]; h = h[:h.index('\n')]
        check('copied from "%s" to "%s", pasted into a heading: one line of words in its braces' % (a, z), want in h and h.count('\\section') == 1 and '\\begin' not in h and h.endswith('}'), h)
    # (review of 996ae58b: a comment in what is copied ends at its line's end, so joined into
    # the heading's one line it took the closing brace with it; a footnote holds paragraphs and
    # displays, which were flattened and lost there)
    D1 = '\\documentclass{article}\n\\begin{document}\n\\section{Intro}\nSome words% joined\nmore words here.\n\n\\section{Next}\nTail para.\\footnote{A note.}\n\\end{document}\n'
    load_doc(page, D1)
    place(page, ('Some', 'here.')); k.press('Control+c'); settle(page, 50)
    click_text(page, 'Next', 4); k.press('Control+v'); settle(page, 100)
    check('words with a comment line pasted into a heading: one line as TeX reads them, the heading closed', src(page) == D1.replace('\\section{Next}', '\\section{NextSome wordsmore words here.}'), src(page)[60:160])
    # (an address keeps its %: a heading's or a cell's one line took \url{x%20y}'s % for a
    # comment and lost the brace and the words after it; the title takes no paragraph break)
    DU = ('\\documentclass{article}\n\\usepackage{url}\n\\title{My Title}\n\\begin{document}\n\\maketitle\n\\section{Next}\nSee \\url{https://a.org/x%20y} now.\n\n'
          'Para one.\n\nPara two.\n\n\\begin{tabular}{|l|l|}\n\\hline\nCell & B \\\\\n\\hline\n\\end{tabular}\n\\end{document}\n')
    url = 'See \\url{https://a.org/x%20y} now.'
    got = []
    for into, off, was, now in (('Cell', 4, 'Cell &', 'Cell' + url + ' &'), ('Next', 4, '{Next}', '{Next' + url + '}')):
        load_doc(page, DU)
        place(page, ('See', 'now.')); k.press('Control+c'); settle(page, 50)
        click_text(page, into, off); k.press('Control+v'); settle(page, 100)
        got.append(src(page) == DU.replace(was, now, 1))
    load_doc(page, DU)
    place(page, ('Para one', 'Para two.')); k.press('Control+c'); settle(page, 50)
    click_text(page, 'My Title', 3); k.press('Control+v'); settle(page, 100)
    got.append(src(page) == DU.replace('{My Title}', '{My Para one. Para two.Title}'))
    check('an address with % pasted into a cell and a heading keeps its %, brace and words; two paragraphs pasted into the title join in one line', all(got), (got, src(page)[:120]))
    load_doc(page, WORD_DOC.replace('of the document.', 'of the document.\\footnote{A note.}'))
    place(page, ('comes', 'After display')); k.press('Control+c'); settle(page, 50)
    click_text(page, 'A note', 2); k.press('Control+v'); settle(page, 100)
    fn1 = src(page)[src(page).index('\\footnote{A'):]
    load_doc(page, WORD_DOC.replace('of the document.', 'of the document.\\footnote{A note.}'))
    place(page, ('Second', 'Apple one')); k.press('Control+c'); settle(page, 50)
    click_text(page, 'A note', 2); k.press('Control+v'); settle(page, 100)
    fn = src(page)[src(page).index('\\footnote{A'):]
    check('copied into a footnote, a display stays a display and two paragraphs stay two', fn1.startswith('\\footnote{A comes text.\n\\[ a = b \\]\nAfter displaynote.}') and fn.startswith('\\footnote{A Second paragraph is plain text only.\n\nApple onenote.}'), (fn1[:80], fn[:80]))
    # 4: a selection holding whole headings or list items takes them with its words, as Word's
    # takes the paragraphs it holds; their words alone went, and an empty numbered heading or two
    # empty bullets stayed between the two paragraphs the deletion joined
    # (one key at an item's start is Word's own rule, the bullet first: lists.py review_edges)
    for a, z, key, old_, new_ in (('paragraph is', 'After', 'Backspace', 'paragraph is plain text only.\n\\begin{itemize}\n\\item Apple one\n\\item Banana two\n\\end{itemize}\nAfter', ''),
                                  ('display', 'Last', 'Z', 'display text.\n\n\\section{Background}\\label{sec:b}\nLast', 'Z'),
                                  ('one', 'Banana', 'Delete', 'one\n\\item Banana', '')):
        load_doc(page, WORD_DOC)
        place(page, (a, z))
        if len(key) == 1: k.type(key)
        else: k.press(key)
        settle(page, 100)
        check('selected from "%s" to "%s", then %s: what it held is gone, the paragraphs at its ends joined' % (a, z, key),
              src(page) == WORD_DOC.replace(old_, new_), src(page)[200:420])
    # 5: Enter at a heading's start puts an empty paragraph above it and the caret stays, as
    # Word's: the empty paragraph showed below the heading, and words typed went after it
    load_doc(page, WORD_DOC)
    click_text(page, 'Background', 0); k.press('Enter'); k.type('Q'); settle(page, 100)
    check('Enter at a heading\'s start, then a letter: it goes in the heading, at its start (as at a paragraph\'s start, the empty paragraph is written only when typed in)', src(page) == WORD_DOC.replace('{Background}', '{QBackground}'), src(page)[330:420])
    load_doc(page, WORD_DOC)
    click_text(page, 'Background', 0); k.press('Enter'); k.press('ArrowUp'); k.type('New'); settle(page, 100)
    check('Enter at a heading\'s start, Up, words: a paragraph of their own above the heading', src(page) == WORD_DOC.replace('\\section{Background}', 'New\n\n\\section{Background}'), src(page)[330:420])
    load_doc(page, WORD_DOC)
    click_text(page, 'Background', 0); k.press('Enter'); settle(page, 100)
    above = page.evaluate("() => { const h = [...document.querySelectorAll('#pages .it.h')].find((x) => x.textContent.includes('Background')); return !!h && !!h.previousElementSibling && h.previousElementSibling.classList.contains('ghostp') && !document.querySelectorAll('#pages .ghostp')[1]; }")
    k.press('Backspace'); settle(page, 100)
    gone = page.evaluate("() => !document.querySelector('#pages .ghostp')")
    check('Enter at a heading\'s start shows the empty paragraph above it; Backspace takes it away, the source as it was', above and gone and src(page) == WORD_DOC, (above, gone, src(page)[330:420]))
    # 6: Enter twice at a list's end leaves it; the words typed next are a paragraph of their own,
    # also where the list's paragraph goes on after it: they ran into those words
    load_doc(page, WORD_DOC)
    click_text(page, 'Banana two', 10); k.press('Enter'); k.press('Enter'); k.type('Out'); settle(page, 100)
    check('Enter twice at a list\'s end, then words: a paragraph between the list and the words after it', src(page) == WORD_DOC.replace('\\end{itemize}\nAfter', '\\end{itemize}\n\nOut\n\nAfter'), src(page)[250:380])
    # (also where those words stand on \end's own line, or after a comment there: review of 3185b2f3)
    for was, now in ((' After', '\n\nOut\n\n After'), ('%\nAfter', '%\n\nOut\n\nAfter')):
        D = WORD_DOC.replace('\\end{itemize}\nAfter', '\\end{itemize}' + was)
        load_doc(page, D)
        click_text(page, 'Banana two', 10); k.press('Enter'); k.press('Enter'); k.type('Out'); settle(page, 100)
        check('Enter twice at a list\'s end followed by %r, then words: a paragraph of their own' % was, src(page) == D.replace('\\end{itemize}' + was, '\\end{itemize}' + now), src(page)[250:380])
    # (and one that starts in a heading's words, Ctrl+Shift+Home here: the paragraphs it holds
    # whole go whole, their bold and italic wrappers, formula and footnote with them)
    load_doc(page, WORD_DOC)
    click_text(page, 'Second paragraph', 3); k.press('Control+Shift+Home'); k.type('Z'); settle(page, 100)
    held = WORD_DOC[WORD_DOC.index('Introduction'):WORD_DOC.index('ond paragraph')]
    check('from a paragraph, Ctrl+Shift+Home, then a letter: the heading\'s words become it, the paragraph between goes whole', src(page) == WORD_DOC.replace(held, 'Z}\n\n'), src(page)[30:120])
    # 7: words typed over a selection undo word by word, and the last Ctrl+Z gives the selected
    # words back selected, as Word's: the first letter typed was a step of its own ("n" stayed)
    load_doc(page, WORD_DOC)
    select_text(page, 'plain text'); k.type('new words'); settle(page, 100)
    k.press('Control+z'); settle(page, 100); one = src(page)
    k.press('Control+z'); settle(page, 100)
    sel = page.evaluate('getSelection().toString()')
    check('typed over a selection: Ctrl+Z takes the last word, a second gives the selection back, selected', one == WORD_DOC.replace('plain text', 'new ') and src(page) == WORD_DOC and sel == 'plain text', (one[250:300], src(page)[250:300], sel))
    # 8: Delete before a display selects it first, and the note says Delete, the key pressed
    # (it said "Press Backspace again"); a second Delete takes it
    load_doc(page, WORD_DOC)
    click_text(page, 'comes text.', 11); k.press('Delete'); settle(page, 100)
    say = page.inner_text('#toast')
    k.press('Delete'); settle(page, 100)
    check('Delete before a display: "Press Delete again", and a second Delete takes the display', 'Press Delete again' in say and src(page) == WORD_DOC.replace('\\[ a = b \\]', ''), (say[:50], src(page)[300:380]))

if __name__ == '__main__':
    sys.exit(run())
