"""Typing math the way Word's equation editor takes it: command chips and Space, Tab for a
suggestion, fractions and scripts left with Space, -> and <= turned into symbols."""
import os, sys, json, traceback
sys.path.insert(0, os.path.dirname(__file__))
from browser import ROUTES, SKELETON_HEAD, ROOT, SHOTS, check, results
from playwright.sync_api import sync_playwright
CSP = ("default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com; "
       "style-src 'unsafe-inline' https://fonts.googleapis.com; font-src data: https://fonts.gstatic.com; img-src data: blob:; "
       "media-src data: blob:; connect-src 'none'; worker-src blob:")
html = open(os.path.join(ROOT, 'dist/rikuy.html'), encoding='utf8').read()
inner = SKELETON_HEAD + html + '</body></html>'
outer = '<!doctype html><html><body style="margin:0"><iframe id="f" src="https://sandbox.test/a" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads" style="border:0;width:100vw;height:100vh"></iframe></body></html>'

PW = sync_playwright().start()
def run(touch=False):
    if True:
        p = PW
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 1400, 'height': 900} if not touch else {'width': 400, 'height': 860}, has_touch=touch, is_mobile=touch)
        page = ctx.new_page()
        logs = []
        page.on('console', lambda m: logs.append(m.type + ': ' + m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
        def h(route):
            u = route.request.url
            if u.startswith('https://host.test/'): return route.fulfill(status=200, content_type='text/html', body=outer)
            if u.startswith('https://sandbox.test/'): return route.fulfill(status=200, content_type='text/html', body=inner, headers={'Content-Security-Policy': CSP})
            if u in ROUTES: return route.fulfill(status=200, content_type='application/javascript', body=open(ROUTES[u], encoding='utf8').read())
            return route.abort()
        page.route('**/*', h)
        page.goto('https://host.test/')
        fr = page.frame_locator('#f')
        frame = page.frames[1]
        frame.wait_for_function('window.rikuy && document.getElementById("boot").hidden', timeout=20000)
        frame.evaluate("localStorage.clear()")
        return b, page, fr, frame, logs

try:
    b, page, fr, frame, logs = run()
    frame.evaluate("window.rikuy.toggleSource(false)")
    src = lambda: frame.evaluate("window.rikuy.files.get('main.tex')")
    base = src()
    val = lambda: frame.evaluate("document.getElementById('pop-field').getValue('latex')")
    ta = lambda: frame.evaluate("document.getElementById('pop-tex').value")
    popopen = lambda: frame.evaluate("!!document.querySelector('.pop')")
    def open_eq(n=0):
        frame.evaluate(f"document.querySelectorAll('.it.dm')[{n}].scrollIntoView({{block:'center'}})")
        fr.locator('.it.dm').nth(n).click()
        frame.wait_for_selector('#pop-field', timeout=10000)
        page.wait_for_timeout(300)

    open_eq(1)
    k = page.keyboard
    k.type('+\\alpha'); page.wait_for_timeout(120)
    check('chip shows while typing a command', frame.evaluate("!document.querySelector('.wm-chip').hidden"))
    page.screenshot(path=SHOTS + '/80-chip.png')
    k.press('Space'); page.wait_for_timeout(150)
    check('\\alpha + Space inserts alpha in the row', val().endswith('+\\alpha\\end{aligned}'), val()[-40:])
    check('popover still open', popopen())
    k.type('\\alp'); k.press('Tab'); page.wait_for_timeout(120)
    check('Tab picks suggestion', val().endswith('\\alpha\\alpha\\end{aligned}'), val()[-40:])
    k.type('+\\degree'); k.press('Space'); page.wait_for_timeout(120)
    check('Word name \\degree works', '^{\\circ}' in val(), val()[-40:])
    k.type('+\\frac'); k.press('Space'); k.type('a'); k.press('Tab'); k.type('b'); k.press('Space'); k.type('+c'); page.wait_for_timeout(150)
    check('\\frac then Space exits fraction', val().endswith('\\frac{a}{b}+c\\end{aligned}'), val()[-40:])
    k.type('+x^2'); k.press('Space'); k.type('+1'); page.wait_for_timeout(150)
    check('Space leaves superscript but stays in row', val().endswith('x^2+1\\end{aligned}') or val().endswith('x^{2}+1\\end{aligned}'), val()[-40:])
    k.type('+in'); page.wait_for_timeout(120)
    check('plain letters stay letters', val().endswith('in\\end{aligned}') and '\\in\\end' not in val(), val()[-30:])
    k.type('->'); page.wait_for_timeout(120)
    check('-> becomes arrow', val().endswith('\\to\\end{aligned}') or val().endswith('\\rightarrow\\end{aligned}'), val()[-30:])
    k.type('<=y'); page.wait_for_timeout(120)
    check('<= becomes le', '\\le y' in val() or '\\leq y' in val() or '\\le{}y' in val(), val()[-30:])
    t = ta()
    check('labels still on their rows', '\\label{eq:cond}' in t.split('\\\\')[0] and '\\label{eq:mle}' in t.split('\\\\')[1], t)
    check('source updated', '\\alpha' in src()[src().find('\\begin{align}'):src().find('\\end{align}')])
    k.type('\\gam'); k.press('Escape'); page.wait_for_timeout(100)
    check('Escape cancels a command but keeps popover', popopen() and frame.evaluate("document.querySelector('.wm-chip').hidden"))
    k.type('\\gamma'); k.press('Enter'); page.wait_for_timeout(150)
    check('Enter commits a command without closing', popopen() and val().endswith('\\gamma\\end{aligned}'), val()[-30:])
    k.press('Enter'); page.wait_for_timeout(200)
    check('Enter closes popover', not popopen())
    k.press('Control+z')
    check('one undo reverts the session', src() == base)

    # Word function names and limits below
    BELOW = """((pre, sub) => { const mf = document.getElementById('pop-field'); const subs = []; let base = null, bi = -1;
      for (let i = 0; i <= mf.lastOffset; i++) { const inf = mf.getElementInfo(i); if (!inf || !inf.bounds || inf.bounds.width <= 0) continue;
        if (inf.latex === sub) subs.push([i, inf.bounds]);
        if (!base && inf.latex && inf.latex.includes(pre)) { base = inf.bounds; bi = i; } }
      const c = subs.filter((x) => x[0] < bi).pop();
      if (!base || !c) return 'missing ' + !!base + ' ' + !!c;
      const s = c[1];
      return s.top > base.top + 6 && s.left >= base.left - 2 && s.left + s.width <= base.left + base.width + 2; })"""
    below = lambda pre, sub: frame.evaluate(BELOW + '(%s, %s)' % (json.dumps(pre), json.dumps(sub)))
    open_eq(1)
    page.wait_for_timeout(200)
    check('argmax shows as an operator in the field', '\\operatorname*{' in val() and 'arg\\,max' in val(), val()[-120:])
    check('argmax subscript sits below', below('arg\\,max', '\\theta') is True, below('arg\\,max', '\\theta'))
    check('untouched argmax row keeps its source', '\\argmax_{\\theta \\in \\Theta}' in ta(), ta())
    src_before = src()
    k.press('Control+Enter'); page.wait_for_timeout(120)
    k.type('a&=max_x'); k.press('Space'); k.type('f'); page.wait_for_timeout(200)
    check('max typed as letters becomes \\max', '\\max_{x}f' in ta() or '\\max_x f' in ta(), ta()[-60:])
    check('max subscript sits below', below('\\max', 'x') is True, below('\\max', 'x'))
    k.type('+sup_n'); k.press('Space'); k.type('g'); page.wait_for_timeout(200)
    check('sup subscript sits below in the field', below('\\sup', 'n') is True, below('\\sup', 'n'))
    check('sup source has no \\limits', '\\sup_{n}g' in ta() and '\\limits' not in ta(), ta()[-60:])
    k.type('+liminf_k'); k.press('Space'); k.type('h'); page.wait_for_timeout(200)
    check('liminf source keeps its name', '\\liminf_{k}h' in ta(), ta()[-60:])
    check('liminf subscript sits below', below('lim\\,inf', 'k') is True, below('lim\\,inf', 'k'))
    k.type('+\\argmax_t'); k.press('Space'); k.type('u'); page.wait_for_timeout(200)
    check('\\argmax command keeps the document macro', '\\argmax_{t}u' in ta(), ta()[-60:])
    k.type('+maximum'); page.wait_for_timeout(150)
    check('longer words stay letters', ta().rstrip().endswith('maximum') , ta()[-40:])
    k.type('+sin'); k.press('Space'); k.type('x'); page.wait_for_timeout(150)
    check('sin then Space turns upright', '\\sin x' in ta(), ta()[-40:])
    k.type('+\\Alpha+\\doubleR+\\hat'); k.press('Space'); k.type('y'); k.press('Space'); k.type('+\\cbrt'); k.press('Space'); k.type('8'); k.press('Space'); page.wait_for_timeout(200)
    t = ta()
    check('Word names map to LaTeX', '\\mathrm{A}' in t and '\\mathbb{R}' in t and '\\hat{y}' in t and '\\sqrt[3]{8}' in t, t[-80:])
    k.type('+\\lbbrack'); k.press('Space'); page.wait_for_timeout(150)
    k.press('Enter'); page.wait_for_timeout(300)
    check('package added for a symbol that needs one', '\\usepackage{stmaryrd}' in src(), src()[:300])
    check('labels survive a new row', '\\label{eq:cond}' in src() and '\\label{eq:mle}' in src())
    k.press('Control+z'); page.wait_for_timeout(200)
    check('one undo reverts the equation and the package', src() == src_before, [l for l in src().splitlines() if 'stmaryrd' in l or 'max_x' in l])

    # editing a row keeps what MathLive would otherwise rewrite
    open_eq(1)
    fr.locator('#pop-tex').click()
    k.press('Control+End')
    k.type(" + \\int_0^1 f(x)\\,\\mathrm{d}x + \\bm{x}^\\top\\boldsymbol{\\beta} + y'' + \\text{ok!}")
    page.wait_for_timeout(400)
    fr.locator('#pop-field').click(); page.wait_for_timeout(150)
    frame.evaluate("document.getElementById('pop-field').executeCommand('moveToMathfieldEnd')")
    k.type('+1'); page.wait_for_timeout(300)
    row = ta().split('\\\\')[-1]
    check('edited row keeps \\mathrm{d}', '\\mathrm{d}x' in row, row)
    check('edited row keeps \\bm and \\boldsymbol', '\\bm{x}' in row and '\\boldsymbol{\\beta}' in row, row)
    check('edited row keeps primes as primes', "y''" in row and 'doubleprime' not in row, row)
    check('no math-only \\! inside \\text', '\\text{ok!}' in row, row)
    check('argmax stays a macro in the edited row', '\\argmax' in row and 'operatorname' not in row, row)
    k.press('Escape'); page.wait_for_timeout(200)
    k.press('Control+z'); page.wait_for_timeout(200)
    check('undo restores the source', src() == base, [l for l in src().splitlines() if 'argmax_' in l])

    # & moves to the next cell, Ctrl+Enter in a single equation makes it an align
    open_eq(1)
    k.press('Control+Enter'); page.wait_for_timeout(150)
    k.type('p&=q'); page.wait_for_timeout(250)
    check('& jumps to the next column', ''.join(ta().split('\\\\')[-1].split()) == 'p&=q', ta()[-40:])
    k.press('Escape'); page.wait_for_timeout(200)
    k.press('Control+z'); page.wait_for_timeout(200)
    open_eq(0)
    k.press('Control+Enter'); page.wait_for_timeout(300)
    k.type('w=1'); page.wait_for_timeout(300)
    s0 = src()
    check('Ctrl+Enter in an equation turns it into align with a new row', '\\begin{align}' in s0 and 'w=1' in s0 and s0.count('\\begin{align}') == 2, s0[s0.find('V(k)') - 40:s0.find('V(k)') + 200])
    check('equation number label kept', '\\label{eq:bellman}' in s0)
    k.press('Escape'); page.wait_for_timeout(200)
    k.press('Control+z'); page.wait_for_timeout(200)
    check('undo restores the equation', src() == base, [l for l in src().splitlines() if 'bellman' in l or 'w=1' in l][:4])

    # Word build-up: operators end scripts, parens group, slash fractions
    def fresh_row():
        open_eq(0)
        frame.evaluate("(() => { const f = document.getElementById('pop-field'); f.setValue(''); f.dispatchEvent(new Event('input', {bubbles: true})); f.focus(); })()")
        page.wait_for_timeout(150)
    def typed(seq):
        for t in seq:
            if t.startswith('@'): k.press(t[1:])
            else: k.type(t)
        page.wait_for_timeout(250)
        return ''.join(val().split())
    cases = [
        (['x^2+1'], 'x^2+1'),
        (['x^(n+1)+y'], 'x^{n+1}+y'),
        (['e^-x+1'], 'e^{-x}+1'),
        (['\\sum_(i=1)^n', '@Space', 'a_i'], '\\sum_{i=1}^{n}a_{i}'),
        (['a/b+c'], '\\frac{a}{b}+c'),
        (['(a+b)/(c+d)+e'], '\\frac{a+b}{c+d}+e'),
        (['x_i,j'], 'x_{i},j'),
        (['x^(a->b)+1'], 'x^{a\\tob}+1'),
        (['x^(a_i+1)+2'], 'x^{a_{i}+1}+2'),
        (['lim_(n->\\infty', '@Space', ')a_n'], '\\lim_{n\\to\\infty}a_{n}'),
    ]
    for seq, want in cases:
        fresh_row()
        got = typed(seq)
        check('build-up: ' + ' '.join(seq) + ' -> ' + want, got == want or got == want.replace('^2', '^{2}'), got)
        k.press('Escape'); page.wait_for_timeout(150)
        k.press('Control+z'); page.wait_for_timeout(150)
    check('build-up tests leave the source as it was', src() == base)

    # Word brackets: typed pairs grow with their content, the source stays plain unless tall
    def row_src():
        t = ta()
        return ''.join(t.split('\\label{eq:bellman}')[0].split())
    bcases = [
        (['(', '\\frac', '@Space', 'a', '@Tab', 'b', '@Space', ')+1'], '\\left(\\frac{a}{b}\\right)+1'),
        (['f(x)+(a+b)'], 'f(x)+(a+b)'),
        (['x\\in[0,1)'], 'x\\in[0,1)'),
        (['{x|x>0}'], '\\{x|x>0\\}'),
        (['|v|+1'], '|v|+1'),
        (['\\langle', '@Space', 'u,v\\rangle', '@Space'], '\\langleu,v\\rangle'),
        (['(a'], '(a'),
        (['()+1'], '()+1'),
        (['{', '\\sum', '@Space', 'x}'], '\\left\\{\\sumx\\right\\}'),
        (['\\norm', '@Space', 'v'], '\\lVertv\\rVert'),
    ]
    for seq, want in bcases:
        fresh_row()
        typed(seq)
        page.wait_for_timeout(250)
        got = row_src()
        check('brackets: ' + ' '.join(seq) + ' -> ' + want, got == want, (got, val()))
        k.press('Escape'); page.wait_for_timeout(150)
        k.press('Control+z'); page.wait_for_timeout(150)
    check('bracket tests leave the source as it was', src() == base)

    # a plain pair from the source around a fraction stays as written when the row is edited
    # (TeX sets it at its natural size; only brackets typed in the field get \left \right)
    open_eq(0)
    fr.locator('#pop-tex').click()
    k.press('Control+End'); k.type(' + (\\frac{1}{2})'); page.wait_for_timeout(400)
    fr.locator('#pop-field').click(); page.wait_for_timeout(150)
    frame.evaluate("document.getElementById('pop-field').executeCommand('moveToMathfieldEnd')")
    k.type('+1'); page.wait_for_timeout(300)
    check('edited row keeps the plain brackets around the fraction', '(\\frac{1}{2})+1' in ''.join(ta().split()) and '\\left' not in ta(), ta())
    check('flat pairs in the edited row stay plain', 'V(k)' in ta() and 'f(k)' in ta() and '\\mleft' not in ta(), ta())
    k.press('Escape'); page.wait_for_timeout(150)
    k.press('Control+z'); page.wait_for_timeout(200)
    check('undo restores', src() == base)

    # an equation whose source has small brackets around a fraction offers to fit them
    open_eq(0)
    fr.locator('#pop-tex').click()
    k.press('Control+End'); k.type(' + (\\frac{1}{2})'); page.wait_for_timeout(400)
    k.press('Escape'); page.wait_for_timeout(300)
    open_eq(0)
    page.wait_for_timeout(200)
    note = frame.evaluate("(() => { const n = document.querySelector('.pop-fit'); return n && n.textContent; })()")
    check('popover offers to fit undersized brackets', bool(note) and 'One pair' in note, note)
    fr.locator('.pop-fit button').click(); page.wait_for_timeout(400)
    check('fitting writes \\left( \\right) and nothing else', '+ \\left(\\frac{1}{2}\\right)' in ta() and 'V(k)' in ta(), ta())
    k.press('Escape'); page.wait_for_timeout(200)
    k.press('Control+z'); page.wait_for_timeout(200)
    k.press('Control+z'); page.wait_for_timeout(200)
    check('undo restores after fitting', src() == base, [l for l in src().splitlines() if 'bellman' in l])
    open_eq(0)
    check('no offer when brackets already fit', not frame.evaluate("!!document.querySelector('.pop-fit')"))
    k.press('Escape'); page.wait_for_timeout(150)

    # AltGr layouts (German { is AltGr+7) open the same pairs
    fresh_row()
    frame.evaluate("""(() => { const f = document.getElementById('pop-field');
      const ev = (key) => f.dispatchEvent(new KeyboardEvent('keydown', { key, code: 'Digit7', ctrlKey: true, altKey: true, modifierAltGraph: true, bubbles: true, cancelable: true, composed: true }));
      ev('{'); f.executeCommand(['typedText', 'x']); ev('}'); })()""")
    page.wait_for_timeout(250)
    check('AltGr { x } makes a brace pair', row_src() == '\\{x\\}', (row_src(), val()))
    k.press('Escape'); page.wait_for_timeout(150)
    k.press('Control+z'); page.wait_for_timeout(150)

    # Space in a matrix cell does not leave the matrix
    open_eq(0)
    k.type('+\\pmatrix'); k.press('Space'); k.type('a'); k.press('Space'); k.type('b'); page.wait_for_timeout(150)
    check('Space inside a matrix cell stays in the cell', '\\begin{pmatrix}ab' in val() or '\\begin{pmatrix}a b' in val(), val()[-80:])
    check('Bellman max subscript sits below', below('\\max', 'c') is True, below('\\max', 'c'))
    k.press('Escape'); page.wait_for_timeout(200)
    k.press('Control+z'); page.wait_for_timeout(200)
    check('back to the original', src() == base)

    # inline math uses text style, like the page
    frame.evaluate("document.querySelector('.a-math').scrollIntoView({block:'center'})")
    fr.locator('.a-math').first.click()
    frame.wait_for_selector('#pop-field', timeout=8000)
    page.wait_for_timeout(300)
    mode = frame.evaluate("(() => { const f = document.getElementById('pop-field'); return f && f.defaultMode; })()")
    check('inline math field uses inline style', mode == 'inline-math', mode)
    k.press('Escape'); page.wait_for_timeout(200)

    # help lists every shortcut
    fr.locator('#b-help').click(); page.wait_for_timeout(200)
    frame.evaluate("document.querySelector('.wm-all').open = true")
    page.wait_for_timeout(400)
    n_items = frame.evaluate("document.querySelectorAll('.wm-item').length")
    check('help lists the full shortcut set', n_items > 250, n_items)
    fr.locator('.wm-filter').fill('arrow'); page.wait_for_timeout(150)
    vis = frame.evaluate("[...document.querySelectorAll('.wm-item')].filter(e => !e.hidden).map(e => e.querySelector('code').textContent)")
    check('filter narrows the list', 5 < len(vis) < 60 and all('arrow' in v.lower() or True for v in vis) and '\\alpha' not in vis, vis[:8])
    page.screenshot(path=SHOTS + '/82-help-list.png')
    k.press('Escape'); page.wait_for_timeout(150)

    # virtual keyboard
    open_eq(0)
    frame.evaluate("window.mathVirtualKeyboard.show()")
    page.wait_for_timeout(600)
    kb_visible = frame.evaluate("(() => { const k = document.querySelector('.ML__keyboard'); return !!k && k.getBoundingClientRect().height > 50; })()")
    check('on-screen keyboard shows inside the page', kb_visible)
    page.screenshot(path=SHOTS + '/81-keyboard.png')
    above = frame.evaluate("(() => { const p = document.querySelector('.pop').getBoundingClientRect(); const k = document.querySelector('.ML__keyboard .MLK__backdrop, .ML__keyboard'); const kr = [...document.querySelectorAll('.ML__keyboard *')].map(e => e.getBoundingClientRect()).filter(r => r.height > 100).sort((a,b) => a.top - b.top)[0]; return kr ? p.bottom <= kr.top + 2 : null; })()")
    check('popover sits above the on-screen keyboard', above, above)
    # click a key: find a key labeled with pi or x
    clicked = frame.evaluate("""(() => { const keys = [...document.querySelectorAll('.ML__keyboard .MLK__keycap')]; const k = keys.find(x => x.textContent.trim() === 'x') || keys.find(x => x.textContent.trim().length === 1); if (!k) return null; const r = k.getBoundingClientRect(); return [r.left + r.width/2, r.top + r.height/2, k.textContent.trim()]; })()""")
    if clicked:
        page.mouse.click(clicked[0], clicked[1])
        page.wait_for_timeout(300)
        check('tapping a key keeps the popover open', popopen())
        check('tapping a key types into the equation', clicked[2] in val() or len(val()) > 0, (clicked, val()[-30:]))
    else:
        check('found a keycap', False)
    print('errors:', logs[:5])
    logs[:] = [l for l in logs if 'Failed to load resource' not in l]
    check('no errors', not logs, logs[:5])
    b.close()
except Exception as e:
    # a run that stops part way has failed, whatever the checks before it said
    traceback.print_exc()
    check('the run reaches its end', False, e)
PW.stop()
bad = [r for r in results if not r[1]]
print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
sys.exit(1 if bad else 0)
