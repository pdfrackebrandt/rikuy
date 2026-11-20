"""Motion (src/motion.js, src/caret.js, src/motion.css, the tokens of src/tokens.css), as rules M1
to M4 of the interface rules have it: every animation runs with its token's duration (100, 150,
200 or 300 ms) and curve (decelerate in, accelerate out, standard for moves), and animates only
transform (translate, scale) and opacity: a ribbon tab's content, a contextual tab, File's
backstage, menus, a split button's flyout, a gallery, the right click menu, a dialog and its going,
the Styles and Help panes, the side panel, a toast rising and leaving, the save state, Page, LaTeX
and PDF through View Transitions, the PDF pane holding the old pages until the new are drawn,
Word's animated caret gliding (and jumping out of view, hidden for a selection, the browser's own
where it cannot be read). What leaves is an inert copy (no ids, no role, no pointer). Reduced
motion: opacity alone, 100 ms, nothing leaving, the browser's caret. Animations off (File ›
Options): nothing. A click or a key during an animation acts at once. Motion's own callbacks
never come near a long task, and toasts and menus make none. Typing on dev/bench/long: input to
next paint with the animated caret on and off, alternating, the same within noise.
Usage: python3 motion.py [tokens surfaces leaving views pdf caret clicks reduced off cost latency shots]
(shots: stills of each animation a third of the way in, and a recording, into $RIKUY_SHOTS,
default /tmp/motion-shots)"""
import json, os, statistics, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import open_page, check, results, load_doc, click_text, select_text, src, tiny_pdf, ROOT
from playwright.sync_api import sync_playwright

SHOTS = os.environ.get('RIKUY_SHOTS', '/tmp/motion-shots')
DUR = {'faster': 100, 'fast': 150, 'normal': 200, 'slow': 300}
ALLOWED = {'opacity', 'translate', 'scale', 'transform'}
# animations of app.css that are not this task's (busy indicators, the find highlight; listed in
# docs/handoff/FUTURE.md), and the browser's own isolation of a view transition's two pictures
# (mix-blend-mode, constant)
OTHERS = {'flash', 'pdfmark', 'pdfbusy', 'rb-busy', '-ua-mix-blend-mode-plus-lighter'}

# every animation the page runs, caught each frame (one that lives 100 ms is seen 6 times)
RECORD = '''() => { if (window.__rec) return; window.__rec = []; const seen = new Set();
  const look = () => { for (const a of document.getAnimations()) if (!seen.has(a)) { seen.add(a); const e = a.effect, k = e.getKeyframes(), t = e.getTiming();
      const props = [...new Set(k.flatMap((f) => Object.keys(f).filter((x) => !['offset', 'easing', 'composite', 'computedOffset'].includes(x))))];
      const el = e.target;
      window.__rec.push({ id: a.id || a.animationName || (a.transitionProperty ? 'transition:' + a.transitionProperty : ''), pseudo: e.pseudoElement || null, cls: el && el.className && typeof el.className === 'string' ? el.className : (el && el.id) || '',
        duration: t.duration, easing: k.length ? (k[0].easing !== 'linear' ? k[0].easing : t.easing) : t.easing, props, first: k[0] || null, t: performance.now(), kind: a.constructor.name }); }
    requestAnimationFrame(look); };
  look(); }'''


def ev(page, js, arg=None):
    return page.evaluate(js, arg) if arg is not None else page.evaluate(js)


def mark(page):
    page.evaluate(RECORD)
    return ev(page, 'window.__rec.length')


def since(page, n, settle=450):
    page.wait_for_timeout(settle)
    return ev(page, '(n) => window.__rec.slice(n)', n)


def ours(recs, prefix='rk-'):
    return [r for r in recs if r['id'].startswith(prefix)]


def one(recs, rid):
    return next((r for r in recs if r['id'] == rid), None)


def tok(page):
    return ev(page, 'window.rikuy.motion.tokens()')


def shaped(r, dur, curve, props=None):
    """r ran for dur ms with curve, and animated only transform and opacity (props: exactly those)"""
    return bool(r) and r['duration'] == dur and r['easing'].replace(' ', '') == curve.replace(' ', '') and set(r['props']) <= ALLOWED and (props is None or set(r['props']) == set(props))


def tokens(page):
    T = tok(page)
    css = ev(page, '''() => { const cs = getComputedStyle(document.documentElement); return ['--rk-duration-faster', '--rk-duration-fast', '--rk-duration-normal', '--rk-duration-slow', '--rk-curve-decelerate', '--rk-curve-accelerate', '--rk-curve-standard'].map((n) => cs.getPropertyValue(n).trim()); }''')
    check('motion is on, in full, where nothing asks for less', ev(page, 'document.documentElement.dataset.motion') == 'full')
    check('one set of tokens: the style sheet\'s durations and curves are the ones the script plays', css[:4] == ['100ms', '150ms', '200ms', '300ms'] and [T['faster'], T['fast'], T['normal'], T['slow']] == [100, 150, 200, 300]
          and css[4] == T['decelerate'] and css[5] == T['accelerate'] and css[6] == T['standard'] and T['decelerate'] == 'cubic-bezier(0, 0, 0, 1)', (css, T))


def surfaces(page):
    T = tok(page)
    D, A, S = T['decelerate'], T['accelerate'], T['standard']
    ev(page, "window.rikuy.selectTab('home')"); page.wait_for_timeout(300)
    click_text(page, 'the', 1)

    # a ribbon tab: from the side of the tab it came from, 8 px, 150 ms
    n = mark(page); page.click('#rt-insert'); r = since(page, n)
    a = one(r, 'rk-tab')
    check('a ribbon tab\'s content fades in and slides 8 px from the right going right, 150 ms, decelerating', shaped(a, 150, D, {'opacity', 'translate'}) and a['first']['translate'].startswith('8px'), r)
    n = mark(page); page.click('#rt-home'); r = since(page, n)
    a = one(r, 'rk-tab')
    check('and from the left going left', shaped(a, 150, D) and a['first']['translate'].startswith('-8px'), r)
    check('its panel clips it only meanwhile (the ribbon\'s row is measured for folding)', ev(page, "document.querySelectorAll('.rb-panel.rk-clip').length") == 0)

    # File's backstage from the left, 24 px, 300 ms
    n = mark(page); page.click('#rt-file'); r = since(page, n, 500)
    a = one(r, 'rk-backstage')
    check('File\'s backstage slides in from the left, 24 px, 300 ms', shaped(a, 300, D, {'opacity', 'translate'}) and a['first']['translate'].startswith('-24px'), r)
    page.click('#rt-home'); page.wait_for_timeout(300)

    # a contextual tab appears: a fade and a slide, 200 ms
    load_doc(page, '\\documentclass{article}\n\\begin{document}\nWords before.\n\n\\begin{tabular}{ll}\nalpha & beta\\\\\ngamma & delta\n\\end{tabular}\n\nWords after.\n\\end{document}\n')
    page.wait_for_timeout(300)
    click_text(page, 'Words before', 2); page.wait_for_timeout(300)
    n = mark(page)
    click_text(page, 'alpha', 2); ev(page, 'window.rikuy.ribbonSync()'); r = since(page, n)
    a = one(r, 'rk-ctx-tab')
    check('a contextual tab appears with a fade and an 8 px slide, 200 ms', shaped(a, 200, D) and 'rb-tab' in a['cls'] and ev(page, "!document.getElementById('rt-table-layout').hidden"), r)
    ev(page, "window.rikuy.selectTab('home')")
    load_doc(page, ev(page, '() => window.rikuy.files.get(window.rikuy.main)'))

    # a split button's flyout: 150 ms, from 0.98, at its anchor
    click_text(page, 'Words before', 2); page.wait_for_timeout(200)
    x = page.locator('#ribbon .rb-x:visible').first
    box = x.bounding_box()
    n = mark(page); x.click()
    geo = ev(page, "(() => { const p = document.querySelector('.pop[role=menu]'); const r = p.getBoundingClientRect(); return { o: p.style.transformOrigin, l: r.left, t: r.top }; })()")
    r = since(page, n, 350)
    a = one(r, 'rk-menu')
    ox, oy = [float(v[:-2]) for v in geo['o'].split()] if geo['o'] else (None, None)
    check('a split button\'s flyout fades in and grows from 0.98, 150 ms, decelerating', shaped(a, 150, D, {'opacity', 'scale'}) and a['first']['scale'] == '0.98', r)
    check('from its anchor: the arrow\'s middle, at the menu\'s top edge', ox is not None and abs(geo['l'] + ox - (box['x'] + box['width'] / 2)) < 3 and oy == 0, (geo, box))
    page.keyboard.press('Escape'); page.wait_for_timeout(250)

    # a gallery (Insert › Shapes)
    n = mark(page); ev(page, "window.rikuy.runCommand('insert-shapes')"); r = since(page, n, 350)
    check('a gallery opens as a menu does (Shapes)', shaped(one(r, 'rk-menu'), 150, D) and ev(page, "!!document.querySelector('.pop-gal')"), r)
    page.keyboard.press('Escape'); page.wait_for_timeout(250)

    # the right click menu, from the point pressed
    sp = page.locator('#pages span.t', has_text='Words after').first.bounding_box()
    px, py = sp['x'] + 10, sp['y'] + sp['height'] / 2
    n = mark(page); page.mouse.click(px, py, button='right')
    geo = ev(page, "(() => { const p = document.querySelector('.pop-ctx'); if (!p) return null; const r = p.getBoundingClientRect(); return { o: p.style.transformOrigin, l: r.left, t: r.top }; })()")
    r = since(page, n, 350)
    ok = geo and geo['o']
    check('the right click menu fades and grows from the point pressed', shaped(one(r, 'rk-menu'), 150, D) and ok and abs(geo['l'] + float(geo['o'].split()[0][:-2]) - px) < 3, (geo, r))
    page.keyboard.press('Escape'); page.wait_for_timeout(250)

    # a dialog: 200 ms from 0.96
    n = mark(page); ev(page, "window.rikuy.runCommand('word-count')"); r = since(page, n, 400)
    check('a dialog fades in and grows from 0.96, 200 ms (Word Count)', shaped(one(r, 'rk-dialog'), 200, D, {'opacity', 'scale'}) and one(r, 'rk-dialog')['first']['scale'] == '0.96', r)
    page.keyboard.press('Escape'); page.wait_for_timeout(250)

    # task panes and the Help pane from their edge, the side panel from the left
    n = mark(page); ev(page, "window.rikuy.runCommand('styles-pane')"); r = since(page, n, 400)
    a = one(r, 'rk-pane')
    check('the Styles pane slides 16 px from the right edge, 200 ms', shaped(a, 200, D, {'opacity', 'translate'}) and a['first']['translate'].startswith('16px'), r)
    ev(page, "window.rikuy.runCommand('styles-pane')"); page.wait_for_timeout(300)
    n = mark(page); ev(page, "window.rikuy.runCommand('help-how')"); r = since(page, n, 400)
    a = one(r, 'rk-pane')
    check('the Help pane slides in from the right edge too', shaped(a, 200, D) and a['first']['translate'].startswith('16px'), r)
    page.keyboard.press('Escape'); page.wait_for_timeout(250)
    n = mark(page); page.click('#b-nav'); r = since(page, n, 400)
    a = one(r, 'rk-pane')
    check('the side panel slides 16 px from the left edge', shaped(a, 200, D) and a['first']['translate'].startswith('-16px'), r)
    page.click('#b-nav'); page.wait_for_timeout(300)

    # a toast rises 8 px, and goes faster than it came
    n = mark(page); ev(page, "window.rikuy.toast('Motion test', 500)"); r = since(page, n, 900)
    a, b = one(r, 'rk-toast'), one(r, 'rk-toast-out')
    check('a toast rises 8 px and fades in, 200 ms, keeping its own centring (translate, not transform)', shaped(a, 200, D, {'opacity', 'translate'}) and a['first']['translate'] in ('0px 8px', '0 8px'), r)
    check('and fades out and down in 100 ms, accelerating', shaped(b, 100, A), r)

    # the save state's words
    click_text(page, 'Words after', 2)
    n = mark(page); page.keyboard.type('x'); r = since(page, n, 900)
    check('the save state\'s words fade in as they change, 150 ms', shaped(one(r, 'rk-save'), 150, D, {'opacity'}), [x for x in r if x['id'].startswith('rk')])
    page.keyboard.press('Backspace')


def leaving(page):
    T = tok(page)
    click_text(page, 'the', 1)
    ev(page, "window.rikuy.runCommand('word-count')"); page.wait_for_timeout(300)
    n = mark(page)
    page.keyboard.press('Escape')
    g = ev(page, '''(() => { const g = document.querySelector('.rk-ghost'); if (!g) return null; const all = [g, ...g.querySelectorAll('*')];
      return { inert: g.inert, hidden: g.getAttribute('aria-hidden'), ids: all.filter((x) => x.id).length, pe: getComputedStyle(g).pointerEvents, inLayer: !!g.closest('.rk-ghosts') }; })()''')
    roles = page.get_by_role('dialog').count()
    r = since(page, n, 300)
    check('a dialog leaves at once: no dialog in the accessibility tree the moment it closes', roles == 0, roles)
    check('what fades out is an inert copy: aria-hidden, no ids, no pointer events, in a layer of its own', g and g['inert'] and g['hidden'] == 'true' and g['ids'] == 0 and g['pe'] == 'none' and g['inLayer'], g)
    check('fading out and shrinking to 0.96 in 100 ms, accelerating', shaped(one(r, 'rk-dialog-out'), 100, T['accelerate'], {'opacity', 'scale'}), r)
    check('and the copy is gone afterwards', ev(page, "!document.querySelector('.rk-ghost, .rk-ghosts')"))


def views(page):
    n = mark(page)
    page.click('#sv-latex'); r = since(page, n, 700)
    vt = [x for x in r if x['pseudo'] and 'view-transition' in x['pseudo'] and x['id'] not in OTHERS]
    check('LaTeX view: a view transition cross fades the page into it, 200 ms, opacity alone', len(vt) >= 2 and all(x['duration'] == 200 and set(x['props']) <= {'opacity'} for x in vt), vt)
    check('the window\'s box itself does not animate (its size stays)', not any(x['pseudo'] and 'group' in x['pseudo'] for x in r), r)
    check('and the LaTeX view is there', ev(page, 'window.rikuy.view') == 'latex')
    n = mark(page); page.click('#sv-page'); r = since(page, n, 700)
    check('back to the page the same way', ev(page, 'window.rikuy.view') == 'page' and any(x['pseudo'] and 'view-transition' in x['pseudo'] for x in r))


def pdf(page):
    import base64
    b64 = base64.b64encode(tiny_pdf()).decode()
    ev(page, '''async (b64) => { const g = window.rikuy; g.lastPdf = {}; g.pdfStale = false; g.togglePdf(true, true); await g.pdfView.show(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))); }''', b64)
    page.wait_for_timeout(800)
    n = mark(page)
    st = ev(page, '''async (b64) => { const g = window.rikuy; await g.pdfView.show(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
      const c = document.querySelector('.rk-pdf-xf'); const first = document.querySelector('.pdf-page canvas');
      return { cover: !!c, hidden: c && c.getAttribute('aria-hidden'), pe: c && getComputedStyle(c).pointerEvents, pdfPage: c && !!c.querySelector('.pdf-page, [data-page]'), drawn: c && [...c.querySelectorAll('canvas')].some((x) => x.width > 0),
        firstInHost: !!first && !!first.closest('#pdf-host') }; }''', b64)
    check('a recompiled PDF does not flash: the old pages, drawn, stay over the new ones until those are drawn', st['cover'] and st['drawn'], st)
    check('the cover is for the eye alone: aria-hidden, no pointer events, no pdf-page or data-page, the first page found is the new one', st['hidden'] == 'true' and st['pe'] == 'none' and not st['pdfPage'] and st['firstInHost'], st)
    r = since(page, n, 1500)
    check('then it cross fades away, 150 ms, opacity alone, and is gone', shaped(one(r, 'rk-pdf'), 150, tok(page)['standard'], {'opacity'}) and ev(page, "!document.querySelector('.rk-pdf-xf')"), [x for x in r if x['id'].startswith('rk')])
    ev(page, 'window.rikuy.togglePdf(false)'); page.wait_for_timeout(200)


def caret_box(page):
    return ev(page, '''(() => { const c = document.querySelector('.rk-caret'); const s = getSelection(); if (!c || !s.rangeCount) return null; const a = c.getBoundingClientRect(), b = s.getRangeAt(0).getClientRects()[0];
      return { hidden: c.hidden, x: a.left, y: a.top, h: a.height, rx: b ? b.left : null, ry: b ? b.top : null, rh: b ? b.height : null, mode: document.documentElement.dataset.caret || null, cc: getComputedStyle(document.getElementById('pages')).caretColor }; })()''')


def caret(page):
    T = tok(page)
    load_doc(page, '\\documentclass{article}\n\\begin{document}\nThe first paragraph has a few words in it.\n\nThe second paragraph is here.\n\\end{document}\n')
    page.wait_for_timeout(300)
    click_text(page, 'first paragraph', 4); page.wait_for_timeout(300)
    # (the glide steps aside where keys take over 40 ms to show; a loaded test machine can be that
    # slow on any page, so the limit is set apart here, and its own rule checked below)
    ev(page, 'window.rikuy.caret.slow = 1e9')
    n = mark(page)
    page.keyboard.type('ab'); r = since(page, n, 300)
    b = caret_box(page)
    tr = [x for x in r if x['id'] == 'transition:transform' and 'rk-caret' in x['cls']]
    check('the animated caret glides as a character is typed: a transform transition of 100 ms, easing both ways', tr and all(x['duration'] == 100 and x['easing'].replace(' ', '') == T['standard'].replace(' ', '') for x in tr), r)
    check('and stands where the browser\'s caret would (the range\'s own rect, within a pixel)', b and not b['hidden'] and abs(b['x'] - b['rx']) <= 1 and abs(b['y'] - b['ry']) <= 1 and abs(b['h'] - b['rh']) <= 1, b)
    check('the browser\'s own caret is transparent meanwhile, not twice drawn', b and b['mode'] == 'custom' and b['cc'] in ('rgba(0, 0, 0, 0)', 'transparent'), b)
    page.keyboard.press('ArrowRight'); page.keyboard.press('ArrowRight'); page.wait_for_timeout(250)
    b2 = caret_box(page)
    check('the arrow keys move it, and it lands on the new place', b2 and b2['x'] > b['x'] and abs(b2['x'] - b2['rx']) <= 1, (b, b2))
    flips = ev(page, '''() => new Promise((done) => { const c = document.querySelector('.rk-caret'), t = []; const o = new MutationObserver(() => t.push([performance.now(), c.style.opacity]));
      o.observe(c, { attributes: true, attributeFilter: ['style'] }); setTimeout(() => { o.disconnect(); done(t); }, 2300); })''')
    gaps = [round(b[0] - a[0]) for a, b in zip(flips, flips[1:])]
    check('it blinks as the browser\'s does, by a timer: 530 ms on, 530 off, never more than three flashes a second (M4)', len(flips) >= 3 and all(450 <= g <= 700 for g in gaps) and {f[1] for f in flips} == {'', '0'}, (gaps, flips[:4]))
    check('and no animation runs for it while it stands still', not ev(page, "document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.classList && a.effect.target.classList.contains('rk-caret')).length"))
    # where keys show slowly, the caret jumps rather than glide
    ev(page, 'window.rikuy.caret.slow = 0')
    n = mark(page); s0 = ev(page, '({ ...window.rikuy.caret.stats })')
    page.keyboard.type('cd'); r = since(page, n, 300); s1 = ev(page, '({ ...window.rikuy.caret.stats })')
    b6 = caret_box(page)
    check('on a page that shows keys slowly (over its limit, 40 ms) the caret jumps, as the browser\'s does, and still lands right', not [x for x in r if x['id'] == 'transition:transform' and 'rk-caret' in x['cls']] and s1['slow'] > s0['slow'] and abs(b6['x'] - b6['rx']) <= 1, (s0, s1, b6))
    ev(page, 'window.rikuy.caret.slow = 40'); page.keyboard.press('Backspace'); page.keyboard.press('Backspace')
    page.keyboard.press('Shift+ArrowRight'); page.wait_for_timeout(150)
    b3 = caret_box(page)
    check('a selection hides it, as Word\'s', b3 and b3['hidden'], b3)
    page.keyboard.press('ArrowLeft')
    # (a ribbon tab pressed keeps the caret on the page, as Word's; the search box takes it)
    page.click('#rt-insert'); page.wait_for_timeout(200)
    b4 = caret_box(page)
    check('a ribbon tab pressed: the caret stays on the page, drawn', b4 and not b4['hidden'] and abs(b4['x'] - b4['rx']) <= 1, b4)
    page.focus('#rk-search'); page.wait_for_timeout(200)
    b4 = caret_box(page)
    check('the focus off the page (the search box): no caret of ours, and the browser\'s back', (b4 is None) or (b4['hidden'] and b4['mode'] is None), b4)
    page.keyboard.press('Escape')
    ev(page, "window.rikuy.selectTab('home')")
    # a jump out of view does not glide
    long = '\\documentclass{article}\n\\begin{document}\n' + '\n\n'.join('Paragraph number %d with some words to fill the line.' % k for k in range(160)) + '\n\\end{document}\n'
    load_doc(page, long); page.wait_for_timeout(500)
    click_text(page, 'Paragraph number 1 ', 3); page.wait_for_timeout(200)
    n = mark(page)
    ev(page, "(() => { const s = [...document.querySelectorAll('#pages span.t')].filter((x) => x.textContent.includes('Paragraph number 150')); s[0].scrollIntoView(); const r = document.createRange(); r.setStart(s[0].firstChild, 3); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); })()")
    r = since(page, n, 300)
    b5 = caret_box(page)
    check('a jump to a place out of view is a jump, not a glide across the document', not [x for x in r if x['id'] == 'transition:transform' and 'rk-caret' in x['cls']] and b5 and abs(b5['y'] - b5['ry']) <= 1, (r, b5))


def clicks(page):
    load_doc(page, '\\documentclass{article}\n\\begin{document}\nPress here to make it bold.\n\\end{document}\n')
    page.wait_for_timeout(300)
    ev(page, "window.rikuy.selectTab('home')"); page.wait_for_timeout(300)
    bold = page.locator('#rb-b').bounding_box()
    page.click('#rt-insert'); page.wait_for_timeout(400)
    select_text(page, 'bold'); page.wait_for_timeout(100)
    page.click('#rt-home', no_wait_after=True)
    running = ev(page, "document.getAnimations().filter((a) => a.id === 'rk-tab' && a.playState === 'running').length")
    page.mouse.click(bold['x'] + bold['width'] / 2, bold['y'] + bold['height'] / 2)
    page.wait_for_timeout(300)
    check('a click during the tab\'s slide acts at once: Bold pressed while Home slides in bolds', running == 1 and '\\textbf{bold}' in src(page), (running, src(page)[-80:]))
    check('and the press finished the slide (nothing left running)', ev(page, "document.getAnimations().filter((a) => a.id && a.id.startsWith('rk-') && a.playState === 'running').length") == 0)
    # a key during a menu's entrance
    page.keyboard.press('Control+z'); page.wait_for_timeout(200)
    x = page.locator('#ribbon .rb-x:visible').first
    x.focus(); page.keyboard.press('ArrowDown'); page.keyboard.press('Escape')
    page.wait_for_timeout(100)
    check('a key during a menu\'s entrance acts at once: Escape right after it opened closes it', page.get_by_role('menu').count() == 0)
    # a press during a view's cross fade
    page.click('#sv-latex'); page.wait_for_timeout(600)
    page.click('#sv-page', no_wait_after=True)
    page.wait_for_timeout(30)
    page.click('#sv-pdf', no_wait_after=True)
    page.wait_for_timeout(900)
    check('two view switches pressed one after the other during the cross fade: the last pressed wins', ev(page, 'window.rikuy.view') == 'pdf', ev(page, 'window.rikuy.view'))
    page.click('#sv-page'); page.wait_for_timeout(500)


def reduced(page):
    page.emulate_media(reduced_motion='reduce'); page.wait_for_timeout(100)
    check('reduced motion: the page knows (data-motion reduced)', ev(page, 'document.documentElement.dataset.motion') == 'reduced')
    click_text(page, 'Press', 1); page.wait_for_timeout(200)
    n = mark(page)
    page.click('#rt-insert'); page.wait_for_timeout(250); page.click('#rt-home'); page.wait_for_timeout(250)
    x = page.locator('#ribbon .rb-x:visible').first
    x.click(); page.wait_for_timeout(200); page.keyboard.press('Escape'); page.wait_for_timeout(200)
    ev(page, "window.rikuy.toast('Reduced', 300)"); page.wait_for_timeout(600)
    page.click('#sv-latex'); page.wait_for_timeout(500); page.click('#sv-page'); page.wait_for_timeout(500)
    r = [x for x in since(page, n, 300) if x['id'] not in OTHERS]
    mine = ours(r)
    check('reduced motion: nothing moves, things fade in for 100 ms (M2)', mine and all(set(x['props']) == {'opacity'} and x['duration'] == 100 for x in mine), mine)
    check('and nothing fades out', not any(x['id'].endswith('-out') for x in mine), mine)
    vt = [x for x in r if x['pseudo'] and 'view-transition' in x['pseudo']]
    check('a view switch cross fades in 150 ms, opacity alone', vt and all(x['duration'] == 150 and set(x['props']) <= {'opacity'} for x in vt), vt)
    click_text(page, 'Press', 2); page.wait_for_timeout(200)
    b = caret_box(page)
    check('and the caret is the browser\'s own', (b is None or b['hidden']) and ev(page, '!document.documentElement.dataset.caret'), b)
    page.emulate_media(reduced_motion='no-preference'); page.wait_for_timeout(100)


def off(page):
    ev(page, "window.rikuy.runCommand('animations')"); page.wait_for_timeout(100)
    kept = ev(page, "JSON.parse(localStorage.getItem('rikuy.motion.v1'))")
    check('File › Options › Animations off: data-motion off, kept in this browser', ev(page, 'document.documentElement.dataset.motion') == 'off' and kept['anim'] is False, kept)
    page.click('#rt-file'); page.wait_for_timeout(300)
    pressed = page.get_attribute('#rc-animations', 'aria-pressed') if page.locator('#rc-animations').count() else None
    check('its control in File shows it off (aria-pressed false)', pressed == 'false', pressed)
    page.click('#rt-home'); page.wait_for_timeout(200)
    click_text(page, 'Press', 2)
    n = mark(page)
    page.click('#rt-insert'); page.wait_for_timeout(200); page.click('#rt-home'); page.wait_for_timeout(200)
    x = page.locator('#ribbon .rb-x:visible').first
    x.click(); page.wait_for_timeout(200); page.keyboard.press('Escape')
    page.click('#sv-latex'); page.wait_for_timeout(400); page.click('#sv-page'); page.wait_for_timeout(400)
    click_text(page, 'Press', 3); page.keyboard.type('q'); page.keyboard.press('Backspace')
    r = [x for x in since(page, n, 300) if x['id'] not in OTHERS]
    check('and nothing animates: no tab, menu, view transition or caret glide', not r, r)
    check('the caret is the browser\'s', ev(page, '!document.documentElement.dataset.caret'))
    ev(page, "window.rikuy.runCommand('animated-caret')")
    check('Animated caret is a setting of its own, kept', ev(page, "JSON.parse(localStorage.getItem('rikuy.motion.v1')).caret") is False)
    ev(page, "window.rikuy.runCommand('animated-caret')"); ev(page, "window.rikuy.runCommand('animations')"); page.wait_for_timeout(100)
    check('and both come back on', ev(page, 'document.documentElement.dataset.motion') == 'full' and ev(page, "JSON.parse(localStorage.getItem('rikuy.motion.v1'))") == {'anim': True, 'caret': True})


def cost(page):
    ev(page, "window.__lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(e.duration); }).observe({ type: 'longtask' });")
    s0 = ev(page, '({ ...window.rikuy.motion.stats })')
    click_text(page, 'Press', 1)
    for k in range(8):
        ev(page, "window.rikuy.toast('Toast %d', 120)" % k); page.wait_for_timeout(260)
    for k in range(8):
        page.locator('#ribbon .rb-x:visible').first.click(); page.wait_for_timeout(180); page.keyboard.press('Escape'); page.wait_for_timeout(140)
    lt = ev(page, 'window.__lt')
    for tab in ['insert', 'layout', 'review', 'view', 'home']:
        page.click('#rt-' + tab); page.wait_for_timeout(250)
    s1 = ev(page, '({ ...window.rikuy.motion.stats })')
    check('motion\'s own work: every callback of it under 50 ms (a long task), in fact under 16', s1['worst'] < 16, s1)
    print('  motion callbacks: %d, %.1f ms in all, the longest %.2f ms' % (s1['calls'] - s0['calls'], s1['total'] - s0['total'], s1['worst']))
    check('toasts and menus opened and closed eight times each: no long task (over 50 ms)', not lt, lt)


def latency(page, rounds=6, per=20):
    """keydown to the next paint (a frame's rAF, then a task after it), and the Event Timing
    duration, typing on dev/bench/long with the animated caret on and off, rounds alternating"""
    files = {f: open(os.path.join(ROOT, 'dev/bench/long', f), encoding='utf8').read() for f in ('main.tex', 'refs.bib')}
    load_doc(page, files); page.wait_for_timeout(1500)
    ev(page, '''() => { window.__lat = []; window.__et = [];
      addEventListener('keydown', (e) => { const t0 = e.timeStamp; requestAnimationFrame(() => { const c = new MessageChannel(); c.port1.onmessage = () => window.__lat.push(performance.now() - t0); c.port2.postMessage(0); }); }, true);
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'keydown' && e.interactionId) window.__et.push(e.duration); }).observe({ type: 'event', durationThreshold: 16, buffered: false }); }''')
    ev(page, '''() => { const sp = [...document.querySelectorAll('#pages span.t')]; const s = sp[Math.floor(sp.length / 2)]; const r = document.createRange(); r.setStart(s.firstChild, Math.min(3, s.firstChild.length)); r.collapse(true);
      document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); s.scrollIntoView({ block: 'center' }); }''')
    page.wait_for_timeout(500)
    got = {True: [], False: []}
    ets = {True: [], False: []}
    for k in range(rounds * 2):
        on = k % 2 == 0
        ev(page, '(on) => window.rikuy.motion.set({ caret: on })', on); page.wait_for_timeout(200)
        ev(page, 'window.__lat = []; window.__et = []')
        page.keyboard.type('abcdefghijklmnopqrstuvwxyz'[:per], delay=60)
        page.wait_for_timeout(300)
        got[on] += ev(page, 'window.__lat'); ets[on] += ev(page, 'window.__et')
        for _ in range(per):
            page.keyboard.press('Backspace', delay=20)
        page.wait_for_timeout(300)
    ev(page, 'window.rikuy.motion.set({ caret: true })')
    q = lambda xs, p: sorted(xs)[min(len(xs) - 1, int(p * len(xs)))] if xs else 0
    row = {('on' if k else 'off'): {'n': len(v), 'median': round(statistics.median(v), 1), 'p95': round(q(v, 0.95), 1), 'event timing over 16 ms': len(ets[k])} for k, v in got.items()}
    print('  typing on dev/bench/long, keydown to next paint (ms):', json.dumps(row))
    on, off_ = row['on'], row['off']
    check('typing with the animated caret: input to next paint the same as without it, within noise (median +2 ms or 15 %, p95 +8 ms or 25 %)',
          on['median'] <= off_['median'] + max(2, off_['median'] * 0.15) and on['p95'] <= off_['p95'] + max(8, off_['p95'] * 0.25), row)
    return row


def shots(p):
    """stills a third of the way through each animation, and a recording of them all"""
    os.makedirs(SHOTS, exist_ok=True)
    b, page, errors = open_page(p, 1280, 800, motion=True)

    def still(name, start, settle=40):
        start()
        page.wait_for_timeout(settle)
        ev(page, "(() => { for (const a of document.getAnimations()) if (a.id && a.id.startsWith('rk-')) { a.pause(); a.currentTime = a.effect.getTiming().duration / 3; } })()")
        page.wait_for_timeout(60)
        page.screenshot(path=os.path.join(SHOTS, name + '.png'))
        ev(page, "(() => { for (const a of document.getAnimations()) if (a.id && a.id.startsWith('rk-')) a.finish(); })()")
        page.wait_for_timeout(200)

    click_text(page, 'the', 1)
    still('tab-switch', lambda: page.click('#rt-insert'))
    still('backstage', lambda: page.click('#rt-file'))
    page.click('#rt-home'); page.wait_for_timeout(300); click_text(page, 'the', 1)
    still('menu', lambda: page.locator('#ribbon .rb-x:visible').first.click())
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    still('dialog', lambda: ev(page, "window.rikuy.runCommand('word-count')"))
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    still('styles-pane', lambda: ev(page, "window.rikuy.runCommand('styles-pane')"))
    ev(page, "window.rikuy.runCommand('styles-pane')"); page.wait_for_timeout(300)
    still('toast', lambda: ev(page, "window.rikuy.toast('Saved in this browser', 1500)"))
    b.close()
    # the recording: everything at its own pace
    vdir = os.path.join(SHOTS, 'video')
    os.makedirs(vdir, exist_ok=True)
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={'width': 1280, 'height': 800}, record_video_dir=vdir, record_video_size={'width': 1280, 'height': 800})
    page = ctx.new_page()
    from browser import policy, SKELETON_HEAD, ROUTES
    dist = os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist')
    doc = SKELETON_HEAD + open(os.path.join(dist, 'rikuy.html'), encoding='utf8').read() + '</body></html>'

    def handler(route):
        u = route.request.url
        if u.startswith('https://rikuy.test/'):
            path = u[len('https://rikuy.test/'):].split('?')[0]
            f = os.path.join(dist, path)
            if path and os.path.isfile(f):
                ct = 'text/javascript' if path.endswith(('.js', '.mjs')) else 'application/wasm' if path.endswith('.wasm') else 'application/octet-stream'
                return route.fulfill(status=200, content_type=ct, headers=policy(dist, '/' + path), body=open(f, 'rb').read())
            return route.fulfill(status=200, content_type='text/html; charset=utf-8', headers=policy(dist, '/'), body=doc)
        if u in ROUTES:
            return route.fulfill(status=200, content_type='application/javascript', headers={'Access-Control-Allow-Origin': '*'}, body=open(ROUTES[u], 'rb').read())
        return route.abort()
    ctx.route('**/*', handler)
    page.goto('https://rikuy.test/')
    page.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=30000)
    page.wait_for_timeout(800)
    click_text(page, 'the', 1); page.wait_for_timeout(400)
    page.keyboard.type('and so on ', delay=120); page.wait_for_timeout(400)
    for k in range(4): page.keyboard.press('ArrowLeft', delay=150)
    page.wait_for_timeout(400)
    for t in ['insert', 'layout', 'review', 'home']:
        page.click('#rt-' + t); page.wait_for_timeout(600)
    page.locator('#ribbon .rb-x:visible').first.click(); page.wait_for_timeout(700); page.keyboard.press('Escape'); page.wait_for_timeout(500)
    ev(page, "window.rikuy.runCommand('word-count')"); page.wait_for_timeout(800); page.keyboard.press('Escape'); page.wait_for_timeout(500)
    ev(page, "window.rikuy.runCommand('styles-pane')"); page.wait_for_timeout(900); ev(page, "window.rikuy.runCommand('styles-pane')"); page.wait_for_timeout(500)
    page.click('#rt-file'); page.wait_for_timeout(900); page.click('#rt-home'); page.wait_for_timeout(500)
    page.click('#sv-latex'); page.wait_for_timeout(900); page.click('#sv-page'); page.wait_for_timeout(900)
    ev(page, "window.rikuy.toast('Saved in this browser', 1200)"); page.wait_for_timeout(1800)
    video = page.video.path()
    ctx.close(); browser.close()
    out = os.path.join(SHOTS, 'motion.webm')
    os.replace(video, out)
    print('  stills and', out)


SECTIONS = [('tokens', tokens), ('surfaces', surfaces), ('leaving', leaving), ('views', views), ('pdf', pdf), ('caret', caret), ('clicks', clicks), ('reduced', reduced), ('off', off), ('cost', cost), ('latency', latency)]
with sync_playwright() as p:
    want = sys.argv[1:]
    browser, page, errors = open_page(p, 1400, 900, motion=True)
    for name, fn in SECTIONS:
        if want and name not in want:
            continue
        try: fn(page)
        except Exception as e: check(name + ' ran to its end', False, repr(e)[:400])
    check('no errors in the page', not errors, errors[:3])
    browser.close()
    if 'shots' in want:
        shots(p)

bad = [r for r in results if not r[1]]
print('%d checks, %d failed' % (len(results), len(bad)))
for r in bad: print('FAIL', r[0], str(r[2])[:300])
sys.exit(1 if bad else 0)
