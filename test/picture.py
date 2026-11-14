"""Pictures and objects in Word's way (src/cmd/picture.js, src/picture.js, src/ui/handles.js,
src/ui/picturedialogs.js, src/drawing.js), in Chromium.

A press on a picture selects it (its frame and eight handles, the Picture Format tab, no bubble of
bold and italic); a press elsewhere lets it go; a double click or Show Picture Source edits its
\\includegraphics. The round trip rule (test/browser.py's roundtrip) on Picture Border, Flip
Horizontal and Vertical, Rotate Left against Rotate Right, each Position and Wrap Text against In
Line with Text, Lock Aspect Ratio, Crop against Remove Crop, Alt Text, Reset Picture, Change
Picture, Insert Caption; hand written forms (\\fbox, \\scalebox{-1}[1], \\rotatebox, a figure by hand,
\\textwidth widths) shown as what they are and taken off as written. Sizing by the handles (the
shape kept, Shift free, the snap to a twentieth of the line, Escape gives up), the Height and Width
fields, Crop's bars, the Size and Position and Alt Text dialogs; where a picture cannot float or
wrap, the reason; the right click menu. The page drawing it as graphicx sets it (its width, a
quarter turn, a crop, flips, a tight frame, a wrapfigure's width). Insert's Shapes, Icons,
SmartArt, Chart, Screenshot, Text Box and Drop Cap: what each writes, its package once, the page's
drawing of it, undo. Where dist/tex holds a TeX tree, every construct compiled in the page, and the
picture's box in the PDF against the page's.

RIKUY_DIST names another dist/."""
import os, sys, re, base64, struct, zlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import open_page, check, results, src, load_doc, click_text, roundtrip, pressed
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist')
WRAP = lambda body, pre='\\usepackage{graphicx}\n': '\\documentclass{article}\n' + pre + '\\begin{document}\n' + body + '\n\\end{document}\n'
CENTER = lambda opts='width=0.5\\linewidth': 'Before it here.\n\n\\begin{center}\n\\includegraphics[' + opts + ']{a.png}\n\\end{center}\n\nAfter it here.'
DOC = WRAP(CENTER())


def png(w, h, dpi=None, color=(200, 60, 40)):
    rows = []
    for y in range(h):
        # a picture whose halves differ, so a crop and a flip show
        rows.append(b'\x00' + b''.join(bytes(color if x < w // 2 else (40, 90, 200)) for x in range(w)))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    out = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
    if dpi: out += chunk(b'pHYs', struct.pack('>IIB', round(dpi / 0.0254), round(dpi / 0.0254), 1))
    return out + chunk(b'IDAT', zlib.compress(b''.join(rows))) + chunk(b'IEND', b'')

PNG = png(300, 200, dpi=150)


def asset(page, name='a.png', data=PNG):
    page.evaluate('([n, b]) => { const u = Uint8Array.from(atob(b), (c) => c.charCodeAt(0)); window.rikuy.addAsset(n, new Blob([u], { type: "image/png" })); }', [name, base64.b64encode(data).decode()])


def run_cmd(page, cid, args=None):
    r = page.evaluate('([id, a]) => window.rikuy.runCommand(id, a)', [cid, args])
    page.wait_for_timeout(150)
    return r


def sel_pic(k=0):
    """roundtrip()'s select: the k-th picture selected, as a press on it does."""
    def f(page):
        page.evaluate('''(k) => { const g = window.rikuy, t = g.files.get('main.tex'); let i = -1; for (let j = 0; j <= k; j++) i = t.indexOf('\\\\includegraphics', i + 1); g.picSelect({ f: 'main.tex', s: i }, { tab: true }); }''', k)
        page.wait_for_timeout(80)
    return f


def fn(cid, args=None):
    def f(page): run_cmd(page, cid, args)
    f.__name__ = cid
    return f


def once(page, doc, cid, want, label):
    """A command that is not its own inverse: it writes want as one step, one undo gives doc back."""
    load_doc(page, doc); sel_pic()(page)
    h0 = page.evaluate('window.rikuy.hist.length')
    run_cmd(page, cid)
    check(label + ': writes exactly the LaTeX expected, as one step', src(page) == want and page.evaluate('window.rikuy.hist.length') == h0 + 1, body(page))
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(150)
    check(label + ': one undo gives the source back byte for byte', src(page) == doc)


def shown_tabs(page):
    return page.evaluate("[...document.querySelectorAll('#rb-tabs [role=tab]')].filter((t) => !t.hidden).map((t) => t.textContent)")


def body(page):
    s = src(page)
    return s[s.find('\\begin{document}') + 16:s.find('\\end{document}')]


# ---- selecting -------------------------------------------------------------------------------------

def selecting(page):
    load_doc(page, DOC); page.wait_for_timeout(500)
    box = page.locator('#pages .a-img').bounding_box()
    page.mouse.click(box['x'] + 30, box['y'] + 30); page.wait_for_timeout(250)
    st = page.evaluate('''() => { const g = window.rikuy, f = document.querySelector('.pic-frame'); return { armed: g.armed && g.armed.kind, tab: g.rbTab, frame: f && !f.hidden ? f.getBoundingClientRect().toJSON() : null,
      handles: f ? [...f.querySelectorAll('.pic-h')].filter((h) => getComputedStyle(h).display !== 'none').length : 0, bubble: document.getElementById('bubble').hidden, pop: !!g.pop }; }''')
    check('a press on a picture selects it: its frame with eight handles over it, the Picture Format tab open, no bubble, no source box', st['armed'] == 'img' and st['tab'] == 'picture-format' and st['frame'] and abs(st['frame']['width'] - box['width']) < 2
          and st['handles'] == 8 and st['bubble'] and not st['pop'], st)
    check('the tab "Picture Format" shows after Help while it is selected', shown_tabs(page)[-1] == 'Picture Format', shown_tabs(page))
    names = [page.get_by_role(r, name=n, exact=True).count() for r, n in (('button', 'Change Picture'), ('button', 'Reset Picture'), ('button', 'Picture Border'), ('button', 'Insert Caption'), ('button', 'Alt Text'),
             ('button', 'Position'), ('button', 'Wrap Text'), ('button', 'Rotate'), ('button', 'Crop'), ('spinbutton', 'Height'), ('spinbutton', 'Width'), ('button', 'Lock Aspect Ratio'), ('button', 'Size and Position'))]
    check('its controls by Word\'s names: Change Picture, Reset Picture, Picture Border, Insert Caption, Alt Text, Position, Wrap Text, Rotate, Crop, Height, Width, Lock Aspect Ratio, Size and Position', names == [1] * 13, names)
    check('the fields show its size: width 50% (a share of the line), height in cm', page.input_value('#rc-picture-width') == '50%' and page.input_value('#rc-picture-height').endswith('cm'), (page.input_value('#rc-picture-width'), page.input_value('#rc-picture-height')))
    click_text(page, 'After it'); page.wait_for_timeout(250)
    check('a press elsewhere lets it go: frame and tab go, Home again', not page.evaluate('!!window.rikuy.armed') and page.evaluate("document.querySelector('.pic-frame').hidden") and 'Picture Format' not in shown_tabs(page) and page.evaluate('window.rikuy.rbTab') != 'picture-format', shown_tabs(page))
    page.mouse.click(box['x'] + 30, box['y'] + 30); page.wait_for_timeout(150)
    page.mouse.dblclick(box['x'] + 30, box['y'] + 30); page.wait_for_timeout(250)
    check('a double click edits its source (the figure source box)', page.evaluate("!!(window.rikuy.pop && window.rikuy.pop.el.classList.contains('pop-raw'))"))
    page.keyboard.press('Escape'); page.wait_for_timeout(100)
    sel_pic()(page)
    page.keyboard.press('Delete'); page.wait_for_timeout(200)
    check('Delete on the selected picture takes it out, one undo puts it back', '\\includegraphics' not in src(page) and (page.evaluate('window.rikuy.undo()') or True) and src(page) == DOC)
    # a picture made by a macro is shown, not selected
    load_doc(page, WRAP('\\newcommand{\\fig}{\\includegraphics[width=3cm]{a.png}}\nText \\fig{} more.')); page.wait_for_timeout(300)
    b2 = page.locator('#pages .a-img').bounding_box()
    page.mouse.click(b2['x'] + 5, b2['y'] + 5); page.wait_for_timeout(200)
    check('a picture a macro makes is not selected (its definition is edited where it is)', not page.evaluate("!!(window.rikuy.armed && window.rikuy.armed.kind === 'img')"))


# ---- round trips ----------------------------------------------------------------------------------------

def trips(page):
    P = sel_pic()
    roundtrip(page, DOC, P, 'picture-border', WRAP(CENTER().replace('\\includegraphics[width=0.5\\linewidth]{a.png}', '{\\setlength{\\fboxsep}{0pt}\\fbox{\\includegraphics[width=0.5\\linewidth]{a.png}}}')),
              forms=[WRAP(CENTER().replace('\\includegraphics[width=0.5\\linewidth]{a.png}', '\\fbox{\\includegraphics[width=0.5\\linewidth]{a.png}}'))], label='Picture Border')
    roundtrip(page, DOC, P, 'picture-flip-horizontal', WRAP(CENTER().replace('\\includegraphics[width=0.5\\linewidth]{a.png}', '\\reflectbox{\\includegraphics[width=0.5\\linewidth]{a.png}}')),
              forms=[WRAP(CENTER().replace('\\includegraphics[width=0.5\\linewidth]{a.png}', '\\scalebox{-1}[1]{\\includegraphics[width=0.5\\linewidth]{a.png}}'))], label='Flip Horizontal')
    roundtrip(page, DOC, P, 'picture-flip-vertical', WRAP(CENTER().replace('\\includegraphics[width=0.5\\linewidth]{a.png}', '\\scalebox{1}[-1]{\\includegraphics[width=0.5\\linewidth]{a.png}}')), label='Flip Vertical')
    roundtrip(page, DOC, P, 'picture-rotate-left', WRAP(CENTER('width=0.5\\linewidth,angle=90')), off_command='picture-rotate-right', label='Rotate Left 90° (Rotate Right 90° undoes it)')
    once(page, WRAP(CENTER().replace('\\includegraphics[width=0.5\\linewidth]{a.png}', '\\rotatebox{-90}{\\includegraphics[width=0.5\\linewidth]{a.png}}')), 'picture-rotate-left', DOC, 'Rotate Left on a hand written \\rotatebox{-90}: the box goes')
    fig = lambda place: WRAP(CENTER().replace('\\begin{center}', '\\begin{figure}[' + place + ']\n\\centering').replace('\\end{center}', '\\end{figure}'))
    for cid, place in (('picture-place-top', 't'), ('picture-place-bottom', 'b'), ('picture-place-best', 'htbp'), ('picture-place-here', 'h'), ('picture-place-page', 'p')):
        roundtrip(page, DOC, P, cid, fig(place), off_command='picture-inline', label='Position ' + cid.split('-')[-1] + ' ([' + place + ']), In Line with Text undoes it')
    roundtrip(page, DOC, P, 'picture-place-exact', lambda t: '\\begin{figure}[H]\n\\centering' in t and '\\usepackage{float}' in t, off=WRAP(CENTER(), '\\usepackage{graphicx}\n\\usepackage{float}\n'), off_command='picture-inline', label='Exactly Here ([H] and the float package)')
    wrapped = WRAP(CENTER('width=\\linewidth').replace('\\begin{center}', '\\begin{wrapfigure}{r}{0.5\\linewidth}\n\\centering').replace('\\end{center}', '\\end{wrapfigure}'), '\\usepackage{graphicx}\n\\usepackage{wrapfig}\n')
    roundtrip(page, DOC, P, 'picture-wrap-right', wrapped, off=WRAP(CENTER(), '\\usepackage{graphicx}\n\\usepackage{wrapfig}\n'), off_command='picture-inline', label='Right with Text Wrapping (wrapfig), In Line undoes it')
    roundtrip(page, DOC, P, 'picture-wrap-topbottom', fig('htbp'), off_command='picture-inline', label='Wrap Text: Top and Bottom (a figure)')
    hand = WRAP(CENTER().replace('\\begin{center}', '\\begin{figure}[t]\n\\centering').replace('\\end{center}', '\\end{figure}').replace('width=0.5\\linewidth', 'width=0.5\\textwidth'))
    load_doc(page, hand); P(page)
    check('a figure written by hand shows its place: Top of Page checked, Width 50% of the text', pressed(page, 'picture-place-top') is True and page.input_value('#rc-picture-width') == '50%')
    roundtrip(page, DOC, P, fn('picture-crop', {'l': 72 / 2.54, 'b': 0, 'r': 0, 't': 72 / 2.54}), WRAP(CENTER('width=0.5\\linewidth,trim=1cm 0 0 1cm,clip')), off_command='picture-crop-remove', label='Crop (trim, clip), Remove Crop undoes it')
    roundtrip(page, DOC, P, fn('picture-alt', {'text': 'A red & blue box, 50%'}), WRAP(CENTER('width=0.5\\linewidth,alt={A red \\& blue box, 50\\%}')), off_command=fn('picture-alt', {'text': ''}), label='Alt Text')
    roundtrip(page, DOC, P, fn('picture-alt', {'text': '', 'decorative': True}), WRAP(CENTER().replace('\\begin{center}\n', '\\begin{center}\n% alt (decorative)\n')), off_command=fn('picture-alt', {'text': ''}), label='Mark as decorative')
    roundtrip(page, DOC, P, 'picture-lock', lambda t: re.search(r'width=0\.5\\linewidth,height=[\d.]+cm\]', t) is not None, label='Lock Aspect Ratio off writes the height')
    load_doc(page, DOC); P(page); run_cmd(page, 'picture-lock'); P(page); run_cmd(page, 'picture-lock')
    check('Lock Aspect Ratio on again takes the height off: the bytes of before', src(page) == DOC, body(page))
    once(page, WRAP(CENTER('width=0.5\\linewidth,trim=1cm 0 0 0,clip,angle=90,alt={x}').replace('\\includegraphics[width=0.5\\linewidth,trim=1cm 0 0 0,clip,angle=90,alt={x}]{a.png}', '\\reflectbox{\\includegraphics[width=0.5\\linewidth,trim=1cm 0 0 0,clip,angle=90,alt={x}]{a.png}}')), 'picture-reset',
         WRAP(CENTER('width=0.5\\linewidth,alt={x}')), 'Reset Picture: crop, turn and flip go; size and alt text stay')
    once(page, WRAP(CENTER('width=0.5\\linewidth,trim=1cm 0 0 0,clip,alt={x}')), 'picture-reset-size', WRAP(CENTER('alt={x}')), 'Reset Picture & Size: the size goes too')
    cap = WRAP(CENTER().replace('{a.png}\n\\end{center}', '{a.png}\n\\captionof{figure}{}\n\\end{center}'), '\\usepackage{graphicx}\n\\usepackage{caption}\n')
    load_doc(page, DOC); P(page)
    h0 = page.evaluate('window.rikuy.hist.length')
    run_cmd(page, 'picture-caption'); page.wait_for_timeout(150)
    page.keyboard.type('A box')
    page.wait_for_timeout(250)
    check('Insert Caption on a picture in line: \\captionof{figure} (caption\'s line once), the caret in it to type the caption', src(page) == cap.replace('\\captionof{figure}{}', '\\captionof{figure}{A box}'), body(page))
    load_doc(page, WRAP(CENTER().replace('\\begin{center}', '\\begin{figure}[t]\n\\centering').replace('\\end{center}', '\\end{figure}'))); P(page)
    run_cmd(page, 'picture-caption')
    check('in a figure: \\caption{} under the picture', '{a.png}\n\\caption{}\n\\end{figure}' in src(page), body(page))
    load_doc(page, DOC); P(page)
    page.evaluate('''(b) => { const u = Uint8Array.from(atob(b), (c) => c.charCodeAt(0)); window.rikuy.runCommand('picture-change', { file: 'b photo.png', blob: new Blob([u], { type: 'image/png' }) }); }''', base64.b64encode(png(80, 80, color=(20, 160, 60))).decode())
    page.wait_for_timeout(250)
    check('Change Picture: the file under a safe name in its place, its options kept, the new picture drawn', src(page) == DOC.replace('{a.png}', '{b-photo.png}') and page.evaluate("window.rikuy.assetBlobs.has('b-photo.png') && !!document.querySelector('#pages .a-img img')"), body(page))


# ---- sizing --------------------------------------------------------------------------------------------

def sizing(page):
    load_doc(page, DOC); page.wait_for_timeout(400); sel_pic()(page); page.wait_for_timeout(200)
    def handle(k):
        return page.locator('.pic-frame .pic-h-' + k).bounding_box()
    tw = page.evaluate('window.rikuy.layout.g.tw * window.rikuy.layout.px')
    se = handle('se')
    h0 = page.evaluate('window.rikuy.hist.length')
    page.mouse.move(se['x'] + 4, se['y'] + 4); page.mouse.down(); page.mouse.move(se['x'] + 4 - tw * 0.1, se['y'] + 40, steps=6)
    tip = page.evaluate("document.querySelector('.pic-tip').textContent")
    page.mouse.up(); page.wait_for_timeout(300)
    check('a corner dragged in by a tenth of the line: the tip says 40% of the line, and width=0.4\\linewidth is written as one step, the shape kept', src(page) == DOC.replace('0.5\\linewidth', '0.4\\linewidth') and page.evaluate('window.rikuy.hist.length') == h0 + 1 and '40% of the line' in tip, (tip, body(page)))
    check('the picture stays selected after it, its frame on its new size', page.evaluate("!!window.rikuy.armed") and abs(page.locator('.pic-frame').bounding_box()['width'] - tw * 0.4) < 3)
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
    sel_pic()(page)
    e = handle('e')
    page.mouse.move(e['x'] + 4, e['y'] + 4); page.mouse.down(); page.mouse.move(e['x'] + 4 - tw * 0.137, e['y'] + 4, steps=5); page.mouse.up(); page.wait_for_timeout(300)
    check('off a twentieth of the line: a length in cm (to a millimetre)', re.search(r'\[width=[\d.]+cm\]', src(page)) is not None, body(page))
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
    sel_pic()(page)
    se = handle('se')
    page.keyboard.down('Shift')
    page.mouse.move(se['x'] + 4, se['y'] + 4); page.mouse.down(); page.mouse.move(se['x'] - 30, se['y'] + 60, steps=5); page.mouse.up()
    page.keyboard.up('Shift'); page.wait_for_timeout(300)
    check('Shift frees the shape: width and height both written', re.search(r'\[width=[\d.]+cm,height=[\d.]+cm\]', src(page)) is not None and pressed(page, 'picture-lock') is False, body(page))
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
    sel_pic()(page)
    se = handle('se')
    page.mouse.move(se['x'] + 4, se['y'] + 4); page.mouse.down(); page.mouse.move(se['x'] - 60, se['y'] - 30, steps=4); page.keyboard.press('Escape'); page.mouse.up(); page.wait_for_timeout(250)
    check('Escape while dragging gives up: nothing written', src(page) == DOC)
    # the fields
    sel_pic()(page)
    page.click('#rc-picture-width'); page.fill('#rc-picture-width', '30%'); page.keyboard.press('Enter'); page.wait_for_timeout(250)
    check('the Width field: 30% writes width=0.3\\linewidth', src(page) == DOC.replace('0.5\\linewidth', '0.3\\linewidth'), body(page))
    sel_pic()(page)
    page.click('#rc-picture-height'); page.fill('#rc-picture-height', '4 cm'); page.keyboard.press('Enter'); page.wait_for_timeout(250)
    check('the Height field: 4 cm writes height=4cm, the width going (the shape kept)', src(page) == DOC.replace('width=0.5\\linewidth', 'height=4cm'), body(page))
    load_doc(page, DOC); sel_pic()(page)
    page.click('#rc-picture-width'); page.keyboard.press('ArrowUp'); page.wait_for_timeout(250)
    check('ArrowUp in Width: five more percent of the line', src(page) == DOC.replace('0.5\\linewidth', '0.55\\linewidth'), body(page))
    # a picture filling its wrapfigure: the wrapfigure's width is what changes
    wr = WRAP('\\begin{wrapfigure}{r}{0.5\\linewidth}\n\\centering\n\\includegraphics[width=\\linewidth]{a.png}\n\\end{wrapfigure}\nText that wraps round it.', '\\usepackage{graphicx}\n\\usepackage{wrapfig}\n')
    load_doc(page, wr); page.wait_for_timeout(300); sel_pic()(page)
    page.click('#rc-picture-width'); page.fill('#rc-picture-width', '35%'); page.keyboard.press('Enter'); page.wait_for_timeout(250)
    check('in a wrapfigure it fills: Width sets the wrapfigure\'s width', src(page) == wr.replace('{0.5\\linewidth}', '{0.35\\linewidth}'), body(page))


# ---- crop, dialogs, menus, where it cannot go ------------------------------------------------------

def tools(page):
    load_doc(page, DOC); page.wait_for_timeout(400); sel_pic()(page)
    run_cmd(page, 'picture-crop'); page.wait_for_timeout(200)
    st = page.evaluate("(() => { const c = document.querySelector('.pic-crop'); return c && { bars: c.querySelectorAll('.pc-h').length, on: document.getElementById('rc-picture-crop').getAttribute('aria-pressed') }; })()")
    check('Crop: the whole picture dim, the part kept bright, eight black bars; the button pressed', st and st['bars'] == 8 and st['on'] == 'true', st)
    bar = page.locator('.pic-crop .pc-h-e').bounding_box()
    w = page.locator('.pic-crop .pc-win').bounding_box()['width']
    page.mouse.move(bar['x'] + 2, bar['y'] + 5); page.mouse.down(); page.mouse.move(bar['x'] + 2 - w / 2, bar['y'] + 5, steps=5); page.mouse.up()
    page.keyboard.press('Enter'); page.wait_for_timeout(400)
    m = re.search(r'trim=0 0 ([\d.]+)cm 0,clip', src(page))
    # the right half of 300 px at 150 dpi: 1in = 2.54cm
    check('dragging the right bar half way in, then Enter: trim=0 0 2.54cm 0,clip (TeX\'s size of the file: 150 dpi)', m and abs(float(m.group(1)) - 2.54) < 0.06, body(page))
    drawn = page.evaluate("(() => { const s = document.querySelector('#pages .a-img'); const r = s.getBoundingClientRect(); return { box: s.classList.contains('a-box'), clip: !!s.querySelector('.pic-in.clip'), ratio: r.width / r.height }; })()")
    check('the page draws the cropped picture: its box half as wide for the same height (graphicx\'s box), the rest cut off', drawn['box'] and drawn['clip'] and abs(drawn['ratio'] - 0.75) < 0.03, drawn)
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200); sel_pic()(page)
    run_cmd(page, 'picture-crop'); page.keyboard.press('Escape'); page.wait_for_timeout(200)
    check('Escape leaves Crop with nothing written', src(page) == DOC and not page.evaluate("!!document.querySelector('.pic-crop')"))
    # Alt Text dialog
    sel_pic()(page)
    run_cmd(page, 'picture-alt'); page.wait_for_timeout(150)
    dlg = page.get_by_role('dialog', name='Alt Text', exact=True)
    check('Alt Text opens its dialog, named so, its text box first', dlg.count() == 1 and page.evaluate("document.activeElement.getAttribute('aria-label')") == 'Alt text')
    page.keyboard.type('Two halves, red and blue')
    dlg.get_by_role('button', name='OK', exact=True).click(); page.wait_for_timeout(250)
    check('OK writes alt={…}; the page\'s picture takes it as its alt', 'alt={Two halves, red and blue}' in src(page) and page.evaluate("document.querySelector('#pages .a-img img').alt") == 'Two halves, red and blue')
    # Size and Position
    load_doc(page, DOC); sel_pic()(page)
    run_cmd(page, 'picture-size'); page.wait_for_timeout(150)
    d = page.get_by_role('dialog', name='Size and Position', exact=True)
    d.get_by_role('textbox', name='Width', exact=True).fill('6cm')
    d.get_by_role('textbox', name='Rotation', exact=True).fill('90')
    d.get_by_role('combobox', name='Position', exact=True).select_option('t')
    h0 = page.evaluate('window.rikuy.hist.length')
    d.get_by_role('button', name='OK', exact=True).click(); page.wait_for_timeout(300)
    check('Size and Position: width, rotation and position in one step', src(page) == WRAP(CENTER('width=6cm,angle=90').replace('\\begin{center}', '\\begin{figure}[t]\n\\centering').replace('\\end{center}', '\\end{figure}')) and page.evaluate('window.rikuy.hist.length') == h0 + 1, body(page))
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
    check('and one undo takes it all back', src(page) == DOC)
    # the right click menu
    box = page.locator('#pages .a-img').bounding_box()
    page.mouse.click(box['x'] + 20, box['y'] + 20, button='right'); page.wait_for_timeout(250)
    items = page.evaluate("[...document.querySelectorAll('.pop-ctx [role^=menuitem]')].map((x) => x.getAttribute('aria-label'))")
    check('the right click menu on a picture: Change Picture, Size and Position, Crop, Wrap Text, Insert Caption, Alt Text, Show Picture Source first', items[:7] == ['Change Picture', 'Size and Position', 'Crop', 'Wrap Text', 'Insert Caption', 'Alt Text', 'Show Picture Source'], items)
    page.get_by_role('menuitem', name='Wrap Text', exact=True).click(); page.wait_for_timeout(200)
    wr = page.evaluate("[...document.querySelectorAll('.pop-menu [role^=menuitem]')].map((x) => [x.getAttribute('aria-label'), x.getAttribute('aria-checked'), x.getAttribute('aria-disabled')])")
    check('its Wrap Text: In Line with Text checked, Square, Tight, Through, Top and Bottom; Behind and In Front of Text disabled (LaTeX has no form)', wr[0] == ['In Line with Text', 'true', None] and [x[0] for x in wr[1:5]] == ['Square', 'Tight', 'Through', 'Top and Bottom'] and wr[5][2] == 'true' and wr[6][2] == 'true', wr)
    page.keyboard.press('Escape')
    # where it cannot go
    for doc, cid, why in ((WRAP('\\begin{multicols}{2}\n' + CENTER() + '\n\\end{multicols}', '\\usepackage{graphicx}\n\\usepackage{multicol}\n'), 'picture-place-top', 'columns'),
                          (WRAP('\\begin{itemize}\n\\item One.\n' + CENTER() + '\n\\end{itemize}'), 'picture-wrap-right', 'list'),
                          (WRAP('Words \\includegraphics[height=1em]{a.png} in a sentence.'), 'picture-place-top', 'sentence'),
                          ('\\documentclass{beamer}\n\\begin{document}\n\\begin{frame}\n' + CENTER() + '\n\\end{frame}\n\\end{document}\n', 'picture-place-top', 'beamer')):
        load_doc(page, doc); page.wait_for_timeout(300); sel_pic()(page)
        r = page.evaluate('(id) => { const c = window.rikuy.cmds.command(id); const at = window.rikuy.ribbonAt(); return [window.rikuy.cmds.enabled(window.rikuy, c, at), c.whyNot(window.rikuy, at)]; }', cid)
        before = src(page)
        run_cmd(page, cid)
        check('where a picture cannot go (' + why + '): ' + cid + ' disabled with the reason, nothing written', r[0] is False and why in (r[1] or '') and src(page) == before, r)


# ---- the page draws it as graphicx sets it ----------------------------------------------------------

def drawing(page):
    tw = lambda: page.evaluate('window.rikuy.layout.g.tw * window.rikuy.layout.px')
    pt = lambda: page.evaluate('window.rikuy.layout.px')
    load_doc(page, DOC); page.wait_for_timeout(500)
    r = page.locator('#pages .a-img').bounding_box()
    check('width=0.5\\linewidth: half the line wide, its shape kept (300 by 200)', abs(r['width'] - tw() / 2) < 2 and abs(r['height'] / r['width'] - 2 / 3) < 0.02, (r, tw()))
    load_doc(page, WRAP(CENTER('width=0.5\\linewidth,angle=90'))); page.wait_for_timeout(500)
    r = page.locator('#pages .a-img').bounding_box()
    check('width then angle=90: the picture half the line wide turned, so half the line tall', abs(r['height'] - tw() / 2) < 2 and abs(r['width'] - tw() / 3) < 2, r)
    load_doc(page, WRAP(CENTER('angle=90,width=0.5\\linewidth'))); page.wait_for_timeout(500)
    r = page.locator('#pages .a-img').bounding_box()
    check('angle then width: the turned box half the line wide', abs(r['width'] - tw() / 2) < 2, r)
    load_doc(page, WRAP('\\includegraphics{a.png}')); page.wait_for_timeout(500)
    r = page.locator('#pages .a-img img').bounding_box()
    check('no width: the size TeX gives it, 300 px at 150 dpi = 2 in = 144.54 pt', abs(r['width'] - 144.54 * pt()) < 2, (r['width'], 144.54 * pt()))
    load_doc(page, WRAP(CENTER().replace('\\includegraphics[width=0.5\\linewidth]{a.png}', '\\reflectbox{\\scalebox{1}[-1]{\\includegraphics[width=0.5\\linewidth]{a.png}}}'))); page.wait_for_timeout(400)
    sc = page.evaluate("getComputedStyle(document.querySelector('#pages .a-img')).scale")
    check('flips drawn on the picture: scale -1 -1 (both)', sc.replace(' ', '') in ('-1-1', '-1'), sc)
    load_doc(page, WRAP(CENTER().replace('\\includegraphics[width=0.5\\linewidth]{a.png}', '{\\setlength{\\fboxsep}{0pt}\\fbox{\\includegraphics[width=0.5\\linewidth]{a.png}}}'))); page.wait_for_timeout(400)
    b = page.evaluate("(() => { const s = getComputedStyle(document.querySelector('#pages .a-img')); return [s.borderTopStyle, s.paddingTop]; })()")
    check('Picture Border drawn tight: a solid frame, no gap (\\fboxsep 0pt)', b[0] == 'solid' and b[1] == '0px', b)
    load_doc(page, WRAP('\\begin{wrapfigure}{r}{0.4\\linewidth}\n\\centering\n\\includegraphics[width=\\linewidth]{a.png}\n\\caption{Wrapped}\n\\end{wrapfigure}\nText.', '\\usepackage{graphicx}\n\\usepackage{wrapfig}\n')); page.wait_for_timeout(500)
    r = page.locator('#pages .a-img').bounding_box()
    check('a wrapfigure 0.4\\linewidth wide: the picture filling it is 0.4 of the line (drawn as a float until the page wraps text, B6)', abs(r['width'] - 0.4 * tw()) < 3, (r['width'], tw()))


# ---- Insert's objects ------------------------------------------------------------------------------------

def objects(page):
    PLAIN = WRAP('First paragraph here.\n\nSecond paragraph here.', '')
    for sid, needle in (('rectangle', '\\draw[thick, draw=blue!60!black, fill=blue!20] (0,0) rectangle (3,2);'), ('arrow', '\\draw[thick, draw=blue!60!black, ->] (0,0) -- (3,0);'), ('star', '-- cycle;'), ('oval', 'ellipse (1.5 and 1)')):
        load_doc(page, PLAIN); click_text(page, 'First', 2)
        run_cmd(page, 'insert-shapes', {'shape': sid}); page.wait_for_timeout(250)
        s = src(page)
        drawn = page.evaluate("(() => { const r = document.querySelector('#pages .raw.drawn svg.tz'); return r ? r.querySelectorAll('path, rect, circle, ellipse').length : 0; })()")
        check('Shapes › ' + sid + ': a TikZ picture in a center after the paragraph, \\usepackage{tikz} once, drawn on the page', needle in s and s.count('\\usepackage{tikz}') == 1 and s.index('First paragraph') < s.index('\\begin{tikzpicture}') < s.index('Second') and drawn >= 1, (drawn, body(page)))
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(150)
    check('one undo takes the shape and its package out', src(page) == PLAIN)
    load_doc(page, PLAIN); click_text(page, 'First', 5)
    run_cmd(page, 'insert-icons', {'icon': 'envelope'})
    check('Icons: \\faIcon{envelope} at the caret, fontawesome5 once, drawn as the icon', 'First\\faIcon{envelope} paragraph' in src(page) and '\\usepackage{fontawesome5}' in src(page) and page.evaluate("!!document.querySelector('#pages .a-icon svg.fa')"), body(page))
    load_doc(page, PLAIN); click_text(page, 'First', 2)
    run_cmd(page, 'insert-icons'); page.wait_for_timeout(200)
    check('Icons\' gallery: every icon by name', page.evaluate("[...document.querySelectorAll('.pop-gal [role=menuitemradio]')].length") >= 30 and page.get_by_role('menuitemradio', name='Envelope', exact=True).count() == 1)
    page.keyboard.press('Escape')
    load_doc(page, PLAIN); click_text(page, 'First', 2)
    run_cmd(page, 'insert-smartart'); page.wait_for_timeout(200)
    page.get_by_role('dialog', name='SmartArt', exact=True).get_by_role('button', name='OK', exact=True).click(); page.wait_for_timeout(300)
    check('SmartArt: \\smartdiagram[flow diagram:horizontal]{Plan, Write, Submit}, smartdiagram once, drawn as three boxes', '\\smartdiagram[flow diagram:horizontal]{Plan, Write, Submit}' in src(page) and '\\usepackage{smartdiagram}' in src(page)
          and page.evaluate("document.querySelectorAll('#pages .a-smart svg rect').length") == 3, body(page))
    load_doc(page, PLAIN); click_text(page, 'First', 2)
    run_cmd(page, 'insert-chart'); page.wait_for_timeout(200)
    page.get_by_role('dialog', name='Chart', exact=True).get_by_role('button', name='OK', exact=True).click(); page.wait_for_timeout(300)
    s = src(page)
    check('Chart: a pgfplots axis of columns from Word\'s sample data, with its compat line once, drawn as 12 bars', '\\begin{axis}[ybar' in s and '\\addplot coordinates {(Category 1,4.3) (Category 2,2.5) (Category 3,3.5) (Category 4,4.5)};' in s
          and '\\usepackage{pgfplots}\n\\pgfplotsset{compat=1.18}' in s and page.evaluate("document.querySelectorAll('#pages .raw.drawn svg.pgf rect').length") >= 12 + 1, body(page))
    for kind, needle, pk in (('simple', '\\fbox{\\begin{minipage}{0.5\\linewidth}\nType here.\n\\end{minipage}}', None), ('shaded', '\\begin{tcolorbox}[width=0.6\\linewidth, center, colback=gray!10]\nType here.\n\\end{tcolorbox}', 'tcolorbox'),
                             ('beside', '\\begin{wrapfigure}{r}{0.4\\linewidth}\n\\fbox{\\begin{minipage}', 'wrapfig')):
        load_doc(page, PLAIN); click_text(page, 'First', 2)
        run_cmd(page, 'insert-textbox', {'kind': kind}); page.wait_for_timeout(250)
        page.keyboard.type('Boxed words')
        page.wait_for_timeout(250)
        check('Text Box (' + kind + '): written after the paragraph, "Type here." selected and typed over' + (', ' + pk + ' once' if pk else ''), needle.replace('Type here.', 'Boxed words') in src(page) and (not pk or src(page).count('\\usepackage{' + pk + '}') == 1), body(page))
    load_doc(page, PLAIN); click_text(page, 'First', 2)
    run_cmd(page, 'insert-textbox', {'kind': 'shaded'}); page.wait_for_timeout(250)
    fr = page.evaluate("(() => { const e = document.querySelector('#pages .it.bx'); return e && [getComputedStyle(e).borderTopStyle, Math.round(e.getBoundingClientRect().width / e.parentElement.getBoundingClientRect().width * 100)]; })()")
    check('the shaded box drawn framed, 60% of the line wide', fr and fr[0] == 'solid' and abs(fr[1] - 60) <= 2, fr)
    # drop cap
    roundtrip(page, PLAIN, lambda pg: (click_text(pg, 'paragraph', 2), pg.wait_for_timeout(80)), fn('dropcap-dropped'), WRAP('\\lettrine[lines=3]{F}{irst} paragraph here.\n\nSecond paragraph here.', '\\usepackage{lettrine}\n'), off=WRAP('First paragraph here.\n\nSecond paragraph here.', '\\usepackage{lettrine}\n'), off_command=fn('dropcap-none'), label='Drop Cap: Dropped, None takes it off')
    load_doc(page, WRAP('\\lettrine[lines=3]{F}{irst} paragraph here.', '\\usepackage{lettrine}\n')); click_text(page, 'paragraph', 2)
    check('a drop cap shows: Dropped checked; the letter drawn large over three lines', pressed(page, 'dropcap-dropped') is True and page.evaluate("getComputedStyle(document.querySelector('#pages .y-dropcap')).float") == 'left')
    run_cmd(page, 'dropcap-margin')
    check('In Margin: lhang=1 added to its options', '\\lettrine[lines=3,lhang=1]{F}{irst}' in src(page), body(page))
    load_doc(page, WRAP('\\textbf{Bold} start.', '')); click_text(page, 'start', 1)
    check('Drop Cap on a paragraph that starts with a command: disabled with the reason', not page.evaluate('window.rikuy.cmds.enabled(window.rikuy, "insert-dropcap", window.rikuy.ribbonAt())'))
    # screenshot: a stand in for the browser's capture
    load_doc(page, PLAIN); click_text(page, 'First', 2)
    page.evaluate('''() => { navigator.mediaDevices.getDisplayMedia = async () => { const c = document.createElement('canvas'); c.width = 64; c.height = 48; const x = c.getContext('2d'); x.fillStyle = '#c03'; x.fillRect(0, 0, 64, 48); return c.captureStream(5); }; }''')
    page.evaluate('window.rikuy.runCommand("insert-screenshot")'); page.wait_for_timeout(1500)
    check('Screenshot: the capture placed as screenshot.png, a picture of its own after the paragraph', '\\includegraphics[width=0.8\\linewidth]{screenshot.png}' in src(page) and page.evaluate("window.rikuy.assetBlobs.has('screenshot.png')"), body(page))


# ---- compiled -------------------------------------------------------------------------------------------

def compiled(page):
    if not os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        print('SKIP pictures compiled in the page: no TeX tree in %s' % DIST)
        return
    load_doc(page, DOC); asset(page)
    pre = '\\usepackage{graphicx}\n\\usepackage{float}\n\\usepackage{wrapfig}\n\\usepackage{caption}\n\\usepackage{tikz}\n\\usepackage{pgfplots}\n\\pgfplotsset{compat=1.18}\n\\usepackage{smartdiagram}\n\\usepackage{fontawesome5}\n\\usepackage{lettrine}\n\\usepackage{tcolorbox}\n'
    doc = WRAP('\\lettrine[lines=3]{O}{nce} upon a time the words began here and went on long enough to fill the three lines that the dropped letter takes beside them, and then some more words.\n\n'
               '\\begin{figure}[H]\n\\centering\n{\\setlength{\\fboxsep}{0pt}\\fbox{\\reflectbox{\\scalebox{1}[-1]{\\includegraphics[width=0.4\\linewidth,trim=1cm 0 0 0.5cm,clip,angle=90,alt={Two halves}]{a.png}}}}}\n\\caption{Turned and cropped}\n\\end{figure}\n\n'
               '\\begin{wrapfigure}{r}{0.3\\linewidth}\n\\centering\n\\includegraphics[width=\\linewidth,artifact]{a.png}\n\\caption{Wrapped}\n\\end{wrapfigure}\nWords that wrap round the picture at the right go on here for a while. ' * 1 + 'More words. ' * 30 + '\n\n'
               '\\begin{center}\n\\includegraphics[width=0.3\\linewidth]{a.png}\n\\captionof{figure}{In line}\n\\end{center}\n\n'
               '\\begin{center}\n\\begin{tikzpicture}\n\\draw[thick, draw=blue!60!black, fill=blue!20] (1.3,2.6) -- (0.98,1.74) -- (0.06,1.7) -- (0.78,1.13) -- (0.54,0.25) -- (1.3,0.76) -- (2.06,0.25) -- (1.82,1.13) -- (2.54,1.7) -- (1.62,1.74) -- cycle;\n\\end{tikzpicture}\n\\end{center}\n\n'
               '\\begin{center}\n\\begin{tikzpicture}\n\\begin{axis}[ybar, width=0.8\\linewidth, height=6cm, ymin=0, symbolic x coords={Category 1,Category 2}, xtick=data]\n\\addplot coordinates {(Category 1,4.3) (Category 2,2.5)};\n\\end{axis}\n\\end{tikzpicture}\n\\end{center}\n\n'
               '\\begin{center}\n\\smartdiagram[flow diagram:horizontal]{Plan, Write, Submit}\n\\end{center}\n\n'
               'Mail \\faIcon{envelope} me.\n\n\\begin{center}\n\\fbox{\\begin{minipage}{0.5\\linewidth}\nBoxed words\n\\end{minipage}}\n\\end{center}\n\n'
               '\\begin{tcolorbox}[width=0.6\\linewidth, center, colback=gray!10]\nShaded words\n\\end{tcolorbox}', pre)
    page.set_default_timeout(600000)
    r = page.evaluate('''async (t) => { await window.rikuy.api.setSource(t); const r = await window.rikuy.api.compile();
      let b = ''; if (r.pdf) for (let i = 0; i < r.pdf.length; i += 8192) b += String.fromCharCode(...r.pdf.subarray(i, i + 8192));
      return { ok: r.ok, pages: r.pages, pdf: btoa(b), problems: (r.problems || []).filter((x) => x.severity === 'error').map((x) => x.message).slice(0, 4) }; }''', doc)
    page.set_default_timeout(30000)
    import io
    from pypdf import PdfReader
    pdf = PdfReader(io.BytesIO(base64.b64decode(r['pdf']))) if r['pdf'] else None
    text = ' '.join(p.extract_text() or '' for p in pdf.pages) if pdf else ''
    words = ['nce upon', 'Turned and cropped', 'Wrapped', 'In line', 'Plan', 'Write', 'Submit', 'Boxed words', 'Shaded words', 'Category']
    check('compiled in the page (pdfLaTeX): a flipped, turned, cropped, framed picture in a [H] figure, a wrapfigure, \\captionof, TikZ, pgfplots, smartdiagram, \\faIcon, lettrine, a framed minipage, tcolorbox: no error, every word in the PDF',
          r['ok'] and not r['problems'] and all(w.replace(' ', '') in text.replace(' ', '') for w in words), {'ok': r['ok'], 'problems': r['problems'], 'missing': [w for w in words if w.replace(' ', '') not in text.replace(' ', '')]})
    # the picture's box in the PDF against the page's: width then angle=90, and a crop
    for opts, want in (('width=0.5\\linewidth,angle=90', None), ('width=0.5\\linewidth,trim=0 0 1in 0,clip', None)):
        one = WRAP('\\begin{center}\n\\includegraphics[' + opts + ']{a.png}\n\\end{center}')
        page.set_default_timeout(600000)
        rr = page.evaluate('''async (t) => { await window.rikuy.api.setSource(t); const r = await window.rikuy.api.compile();
          let b = ''; if (r.pdf) for (let i = 0; i < r.pdf.length; i += 8192) b += String.fromCharCode(...r.pdf.subarray(i, i + 8192)); return { ok: r.ok, pdf: btoa(b) }; }''', one)
        page.set_default_timeout(30000)
        page.wait_for_timeout(500)
        drawn = page.evaluate("(() => { const s = document.querySelector('#pages .a-img'), r = s.getBoundingClientRect(), px = window.rikuy.layout.px; return [r.width / px, r.height / px]; })()")
        box = pdf_image_box(base64.b64decode(rr['pdf'])) if rr['ok'] else None
        check('TeX agrees: [' + opts + '] takes %s pt in the PDF and %s pt on the page' % (box and [round(v, 1) for v in box], [round(v, 1) for v in drawn]), box and abs(box[0] - drawn[0]) < 2.5 and abs(box[1] - drawn[1]) < 2.5, (box, drawn))


def pdf_image_box(data):
    """The box a picture takes on the PDF's first page, in TeX points: the matrices before its Do
    applied to the unit square of an image, or to the box of a form (pdfTeX draws a clipped
    picture as a form of its kept part)."""
    import io
    from pypdf import PdfReader
    pg = PdfReader(io.BytesIO(data)).pages[0]
    c = pg.get_contents().get_data().decode('latin1')
    i = c.find(' Do')
    name = re.findall(r'/(\w+)$', c[:i])[0]
    xo = pg['/Resources']['/XObject']['/' + name].get_object()
    w0, h0 = 1.0, 1.0
    if xo.get('/Subtype') == '/Form':
        bb = [float(v) for v in xo['/BBox']]
        w0, h0 = bb[2] - bb[0], bb[3] - bb[1]
    # the matrices of the q ... Do nest the picture is in, the outer first
    a, b, cc, d = 1.0, 0.0, 0.0, 1.0
    for x in re.findall(r'([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) [-\d.]+ [-\d.]+ cm', c[:i]):
        A, B, C, D = map(float, x)
        a, b, cc, d = A * a + B * cc, A * b + B * d, C * a + D * cc, C * b + D * d
    w = abs(a) * w0 + abs(cc) * h0; h = abs(b) * w0 + abs(d) * h0
    return [w * 72.27 / 72, h * 72.27 / 72]


# ---- the review of bd641ad ------------------------------------------------------------------------

def compile_pdf(page, doc):
    page.set_default_timeout(600000)
    r = page.evaluate("""async (t) => { await window.rikuy.api.setSource(t); const r = await window.rikuy.api.compile();
      let b = ''; if (r.pdf) for (let i = 0; i < r.pdf.length; i += 8192) b += String.fromCharCode(...r.pdf.subarray(i, i + 8192));
      return { ok: r.ok, pages: r.pages, pdf: btoa(b), problems: (r.problems || []).filter((x) => x.severity === 'error').map((x) => x.message).slice(0, 4) }; }""", doc)
    page.set_default_timeout(30000)
    return r


def pdf_text(r):
    import io
    from pypdf import PdfReader
    return ' '.join(p.extract_text() or '' for p in PdfReader(io.BytesIO(base64.b64decode(r['pdf']))).pages) if r['pdf'] else ''


def reviewed(page):
    """Each finding of the hostile review of bd641ad, its case as a check (and where TeX is the
    judge, compiled in the page)."""
    # H1: undo, then Backspace: nothing stale is deleted
    load_doc(page, DOC); page.wait_for_timeout(300); sel_pic()(page)
    run_cmd(page, 'picture-rotate-right')
    page.keyboard.press('Control+z'); page.wait_for_timeout(250)
    armed = page.evaluate('!!window.rikuy.armed')
    page.keyboard.press('Backspace'); page.wait_for_timeout(250)
    s = src(page)
    check('H1: after Rotate Right and Ctrl+Z nothing stays selected, and Backspace leaves the picture and its center whole', not armed and '\\includegraphics[width=0.5\\linewidth]{a.png}\n\\end{center}' in s and s.count('\\begin{center}') == s.count('\\end{center}'), body(page))
    load_doc(page, DOC); page.wait_for_timeout(300); sel_pic()(page)
    page.evaluate("() => { const g = window.rikuy, t = g.files.get('main.tex'), i = t.indexOf('After it'); g.commit([{ f: 'main.tex', s: i, e: i, t: 'Merged. ' }], null, 'merge'); }")
    page.wait_for_timeout(250)
    page.keyboard.press('Backspace'); page.wait_for_timeout(250)
    check('H1: a merge in the text while a picture is selected: it is let go, and Backspace deletes no picture', '\\includegraphics[width=0.5\\linewidth]{a.png}' in src(page) and not page.evaluate('!!window.rikuy.armed'), body(page))
    # H3: Font Awesome 4 clashes with fontawesome5; 6 gives \faIcon itself
    for pk, ok_ in (('fontawesome', False), ('fontawesome6', True)):
        d = WRAP('First paragraph here.', '\\usepackage{' + pk + '}\n')
        load_doc(page, d); click_text(page, 'First', 5)
        r = run_cmd(page, 'insert-icons', {'icon': 'envelope'})
        check('H3: Icons with \\usepackage{%s}: %s' % (pk, 'its own \\faIcon, no fontawesome5 line' if ok_ else 'refused with the reason, nothing written'),
              ('\\faIcon{envelope}' in src(page) and 'fontawesome5' not in src(page)) if ok_ else (r is False and src(page) == d), body(page))
    # H4: pictures in subfigures and minipages are a share of their box, not of the line
    sub = WRAP('Text.\n\n\\begin{figure}[h]\n\\centering\n\\begin{subfigure}{0.3\\linewidth}\n\\includegraphics[width=\\linewidth]{a.png}\n\\end{subfigure}\n\\begin{subfigure}{0.3\\linewidth}\n\\includegraphics[width=\\linewidth]{a.png}\n\\end{subfigure}\n\\end{figure}\n\nAfter.', '\\usepackage{graphicx}\n\\usepackage{subcaption}\n')
    load_doc(page, sub); page.wait_for_timeout(500)
    tw = page.evaluate('window.rikuy.layout.g.tw * window.rikuy.layout.px')
    ws = page.evaluate("[...document.querySelectorAll('#pages .a-img')].map((e) => e.getBoundingClientRect().width)")
    check('H4: a picture of width=\\linewidth in a 0.3\\linewidth subfigure is drawn 0.3 of the line wide, as TeX sets it', len(ws) == 2 and all(abs(w - 0.3 * tw) < 3 for w in ws), (ws, tw))
    load_doc(page, WRAP('\\begin{minipage}{0.45\\linewidth}\n\\includegraphics[width=0.8\\linewidth]{a.png}\n\\end{minipage}'))
    page.wait_for_timeout(500)
    w = page.locator('#pages .a-img').bounding_box()['width']
    check('H4: in a 0.45\\linewidth minipage, width=0.8\\linewidth is 0.36 of the line', abs(w - 0.36 * tw) < 3, (w, tw))
    # H5: forty pictures whose size comes from their files: a handful of rebuilds, not one each
    data = base64.b64encode(png(60, 40, dpi=150)).decode()
    page.evaluate('([n, b]) => { const u = Uint8Array.from(atob(b), (c) => c.charCodeAt(0)); for (let k = 0; k < n; k++) window.rikuy.addAsset("f" + k + ".png", new Blob([u], { type: "image/png" })); }', [40, data])
    page.evaluate("() => { const g = window.rikuy; if (!window.__rbw) { const r = g.rebuild; window.__rbw = 1; g.rebuild = function (...a) { window.__rb = (window.__rb || 0) + 1; return r.apply(this, a); }; } window.__rb = 0; }")
    load_doc(page, WRAP('\n\n'.join('P %d.\n\n\\begin{center}\n\\includegraphics[height=1cm]{f%d.png}\n\\end{center}' % (k, k) for k in range(40))))
    page.wait_for_timeout(1500)
    n = page.evaluate('window.__rb')
    check('H5: forty pictures sized from their files: at most 3 rebuilds (one for the document, one for the sizes that came)', n <= 3, n)
    # M2: the first Crop on a fresh picture opens
    asset(page, 'fresh.png', png(120, 80, dpi=144))
    load_doc(page, WRAP(CENTER().replace('a.png', 'fresh.png'))); page.wait_for_timeout(300); sel_pic()(page)
    run_cmd(page, 'picture-crop'); page.wait_for_timeout(600)
    check('M2: the first Crop on a picture opens its bars', page.evaluate("!!document.querySelector('.pic-crop') && window.rikuy.picCropping"))
    page.keyboard.press('Escape'); page.wait_for_timeout(150)
    # H8, M5: starred captions have no number and shift no later one; beamer's "Figure:"
    load_doc(page, WRAP('\\begin{flushright}\n\\includegraphics[width=3cm]{a.png}\n\\captionof*{figure}{Starred}\n\\end{flushright}\n\n\\begin{figure}[h]\n\\centering\n\\includegraphics[width=3cm]{a.png}\n\\caption{Later}\n\\end{figure}', '\\usepackage{graphicx}\n\\usepackage{caption}\n'))
    page.wait_for_timeout(400)
    caps = page.evaluate("[...document.querySelectorAll('#pages .cap')].map((c) => c.textContent)")
    check('H8: \\captionof*{figure}{Starred} is drawn without a number and the figure after it is Figure 1, as TeX prints them', caps == ['Starred', 'Figure 1: Later'], caps)
    load_doc(page, '\\documentclass{beamer}\n\\usepackage{caption}\n\\begin{document}\n\\begin{frame}\n\\begin{center}\n\\includegraphics[width=3cm]{a.png}\n\\captionof{figure}{Beamer cap}\n\\end{center}\n\\end{frame}\n\\end{document}\n')
    page.wait_for_timeout(400)
    caps = page.evaluate("[...document.querySelectorAll('#pages .cap')].map((c) => c.textContent)")
    check('M5: in beamer a caption is "Figure: ...", as beamer prints it', caps == ['Figure: Beamer cap'], caps)
    # L4: a picture with its caption in a list item keeps the item's indent
    load_doc(page, WRAP('\\begin{itemize}\n\\item One.\n\\begin{center}\n\\includegraphics[width=3cm]{a.png}\n\\captionof{figure}{In a list}\n\\end{center}\n\\end{itemize}', '\\usepackage{graphicx}\n\\usepackage{caption}\n'))
    page.wait_for_timeout(400)
    check('L4: in a list item the picture and its caption keep the item\'s indent', page.evaluate("(() => { const f = document.querySelector('#pages .flt.deep'); return !!f && getComputedStyle(f).paddingInlineStart !== '0px'; })()"))
    # H10: SmartArt with eleven items is refused
    load_doc(page, WRAP('First paragraph here.', '')); click_text(page, 'First', 2)
    before = src(page)
    r = run_cmd(page, 'insert-smartart', {'kind': 'flow diagram:horizontal', 'items': ['Item %d' % k for k in range(11)]})
    check('H10: SmartArt with eleven items is refused (TeX stops on them), nothing written', r is False and src(page) == before)
    # H9: a hand written axis keeps its source box
    load_doc(page, WRAP('\\begin{tikzpicture}\n\\begin{axis}[ymode=log]\n\\addplot coordinates {(0,1) (1,10)};\n\\end{axis}\n\\end{tikzpicture}', '\\usepackage{pgfplots}\n'))
    page.wait_for_timeout(300)
    check('H9: a hand written pgfplots axis (ymode=log) is shown as its source, not drawn as a chart', not page.evaluate("!!document.querySelector('#pages svg.pgf')") and page.evaluate("!!document.querySelector('#pages .raw:not(.drawn)')"))
    # M1: the right handle of a picture turned a quarter widens the turned box
    load_doc(page, WRAP(CENTER('width=0.3\\linewidth,angle=90'))); page.wait_for_timeout(500); sel_pic()(page); page.wait_for_timeout(200)
    e = page.locator('.pic-frame .pic-h-e').bounding_box()
    page.mouse.move(e['x'] + 4, e['y'] + 4); page.mouse.down(); page.mouse.move(e['x'] + 44, e['y'] + 4, steps=5); page.mouse.up(); page.wait_for_timeout(400)
    m = re.search(r'\[width=([\d.]+)cm,angle=90\]', src(page))
    check('M1: dragging the right handle of a picture turned 90 degrees writes its width from the turned box\'s height, so the box grows', bool(m) and float(m.group(1)) > 0.3 * page.evaluate('window.rikuy.layout.g.tw') / 28.4528 * 1.05, body(page))
    # L6: a picture in a line, an icon's size: one handle, no wide target over the words
    load_doc(page, WRAP('Words \\includegraphics[height=1em]{a.png} in a line.')); page.wait_for_timeout(400); sel_pic()(page); page.wait_for_timeout(200)
    check('L6: a small picture in a line has one handle, at its corner', page.evaluate("(() => { const f = document.querySelector('.pic-frame'); return f.classList.contains('tiny') && [...f.querySelectorAll('.pic-h')].filter((h) => getComputedStyle(h).display !== 'none').length === 1; })()"))
    # L2: memoir sets [H] with the float package
    load_doc(page, '\\documentclass{memoir}\n\\usepackage{graphicx}\n\\begin{document}\n' + CENTER() + '\n\\end{document}\n'); page.wait_for_timeout(300); sel_pic()(page)
    run_cmd(page, 'picture-place-exact')
    check('L2: Exactly Here under memoir writes [H] with the float package', '\\begin{figure}[H]' in src(page) and '\\usepackage{float}' in src(page), body(page))
    # L3: decorative is a comment line, which every TeX reads
    load_doc(page, DOC); sel_pic()(page)
    run_cmd(page, 'picture-alt', {'text': '', 'decorative': True})
    check('L3: Mark as decorative writes "% alt (decorative)" above the picture, no artifact key', '\\begin{center}\n% alt (decorative)\n\\includegraphics[width=0.5\\linewidth]{a.png}' in src(page), body(page))
    # ---- the verification of 1c32c76 ----
    # N2: beamer steps the counter: \ref gives 1 though the caption prints "Figure:"
    load_doc(page, '\\documentclass{beamer}\n\\begin{document}\n\\begin{frame}\n\\begin{figure}\n\\includegraphics[width=3cm]{a.png}\n\\caption{Beamer cap}\\label{f:a}\n\\end{figure}\nSee \\ref{f:a}.\n\\end{frame}\n\\end{document}\n')
    page.wait_for_timeout(400)
    t = page.evaluate("document.getElementById('pages').textContent")
    check('N2: in beamer "Figure: Beamer cap" and \\ref gives 1, as TeX prints them', 'Figure: Beamer cap' in t and 'See 1.' in t, t[:200])
    # N3: a picture in \scalebox{0.5} takes half its height on the page, as TeX's box does
    load_doc(page, WRAP('Before.\n\n\\begin{center}\n\\scalebox{0.5}{\\includegraphics[width=0.8\\linewidth]{a.png}}\n\\end{center}\n\nAfter.')); page.wait_for_timeout(800)
    tw = page.evaluate('window.rikuy.layout.g.tw * window.rikuy.layout.px')
    b = page.locator('#pages .a-img').bounding_box()
    check('N3: \\scalebox{0.5} round width=0.8\\linewidth: a box 0.4 of the line wide and its height scaled with it', abs(b['width'] - 0.4 * tw) < 3 and abs(b['height'] - 0.4 * tw * 2 / 3) < 3, (b, tw))
    # N4: \scalebox{2}{\fbox{words}} is the Font group's scaled words, not a picture
    load_doc(page, WRAP('A \\scalebox{2}{\\fbox{Boxed}} word.')); page.wait_for_timeout(300)
    check('N4: \\scalebox{2}{\\fbox{Boxed}} holds no picture: drawn as scaled words, not as a picture\'s box', not page.evaluate("!!document.querySelector('#pages .y-xf')"))
    # N6: Font Awesome 4's own name in the refusal
    load_doc(page, WRAP('First paragraph here.', '\\usepackage{fontawesome}\n')); click_text(page, 'First', 5)
    run_cmd(page, 'insert-icons', {'icon': 'map-marker-alt'})
    check('N6: with Font Awesome 4 the refusal names its own command, \\faMapMarker', '\\faMapMarker,' in page.evaluate("document.querySelector('#toast span').textContent"))
    # N7: selecting a picture with a width rebuilds nothing
    asset(page, 'once.png', png(80, 60, dpi=96))
    load_doc(page, WRAP(CENTER().replace('a.png', 'once.png'))); page.wait_for_timeout(400)
    page.evaluate("() => { const g = window.rikuy; if (!window.__rbw) { const r = g.rebuild; window.__rbw = 1; g.rebuild = function (...a) { window.__rb = (window.__rb || 0) + 1; return r.apply(this, a); }; } window.__rb = 0; }")
    sel_pic()(page); page.wait_for_timeout(500)
    check('N7: the first selection of a picture that has a width rebuilds nothing', page.evaluate('window.__rb') == 0, page.evaluate('window.__rb'))
    if not os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        print('SKIP the review\'s compiles: no TeX tree in %s' % DIST)
        return
    # H2: Rotate Right then Height: the height before the angle, and TeX sets it
    load_doc(page, WRAP(CENTER('width=3cm'))); sel_pic()(page)
    run_cmd(page, 'picture-rotate-right'); sel_pic()(page)
    run_cmd(page, 'picture-height', {'height': '3cm'})
    s2 = src(page)
    r = compile_pdf(page, s2)
    check('H2: Rotate Right then Height 3cm writes [height=3cm,angle=-90] and TeX compiles it (no "Division by 0")', '[height=3cm,angle=-90]' in s2 and r['ok'] and not r['problems'], (body(page), r['problems']))
    # H6: a camera JPEG with Exif's resolution only: the page draws it at TeX's size
    jpg = open(os.path.join(ROOT, 'test', 'fixtures', 'exif-180dpi.jpg'), 'rb').read()
    page.evaluate('(b) => { const u = Uint8Array.from(atob(b), (c) => c.charCodeAt(0)); window.rikuy.addAsset("cam.jpg", new Blob([u], { type: "image/jpeg" })); }', base64.b64encode(jpg).decode())
    r = compile_pdf(page, WRAP('\\begin{center}\n\\includegraphics{cam.jpg}\n\\end{center}')); page.wait_for_timeout(800)
    drawn = page.evaluate("(() => { const s = document.querySelector('#pages .a-img img'), r = s.getBoundingClientRect(), px = window.rikuy.layout.px; return [r.width / px, r.height / px]; })()")
    box = pdf_image_box(base64.b64decode(r['pdf'])) if r['ok'] else None
    check('H6: a JPEG with Exif at 180 dpi (no JFIF) is %s pt wide in the PDF and %s pt on the page' % (box and round(box[0], 1), round(drawn[0], 1)), bool(box) and abs(box[0] - drawn[0]) < 1.5 and abs(box[0] - 120.45) < 1, (box, drawn))
    # H8 by TeX: \captionof* then a figure numbered 1
    r = compile_pdf(page, WRAP('\\begin{flushright}\n\\includegraphics[width=3cm]{a.png}\n\\captionof*{figure}{Starred}\n\\end{flushright}\n\n\\begin{figure}[h]\n\\centering\n\\includegraphics[width=3cm]{a.png}\n\\caption{Later}\n\\end{figure}', '\\usepackage{graphicx}\n\\usepackage{caption}\n'))
    t = pdf_text(r).replace('\n', ' ')
    check('H8: TeX prints "Starred" unnumbered and "Figure 1: Later", as the page draws them', r['ok'] and 'Figure 1: Later' in t and 'Figure 1: Starred' not in t, t[:200])
    # H10: ten items, the most allowed, compile
    load_doc(page, WRAP('First paragraph here.', '')); click_text(page, 'First', 2)
    run_cmd(page, 'insert-smartart', {'kind': 'flow diagram:horizontal', 'items': ['I%d' % k for k in range(10)]})
    r = compile_pdf(page, src(page))
    check('H10: SmartArt with ten items, the most it allows, compiles', r['ok'] and not r['problems'], r['problems'])
    # N1: JFIF of no unit and Exif at 300 dpi: 72 dpi, as the three engines take it
    jpg = open(os.path.join(ROOT, 'test', 'fixtures', 'jfif0-exif300.jpg'), 'rb').read()
    page.evaluate('(b) => { const u = Uint8Array.from(atob(b), (c) => c.charCodeAt(0)); window.rikuy.addAsset("ea.jpg", new Blob([u], { type: "image/jpeg" })); }', base64.b64encode(jpg).decode())
    r = compile_pdf(page, WRAP('\\begin{center}\n\\includegraphics{ea.jpg}\n\\end{center}')); page.wait_for_timeout(800)
    drawn = page.evaluate("(() => { const s = document.querySelector('#pages .a-img img'), r = s.getBoundingClientRect(), px = window.rikuy.layout.px; return [r.width / px, r.height / px]; })()")
    box = pdf_image_box(base64.b64decode(r['pdf'])) if r['ok'] else None
    check('N1: a JPEG with a JFIF header of no unit and Exif at 300 dpi is %s pt wide in the PDF and %s pt on the page (72 dpi)' % (box and round(box[0], 1), round(drawn[0], 1)), bool(box) and abs(box[0] - drawn[0]) < 1.5 and abs(box[0] - 301.12) < 1, (box, drawn))


# ---- phones -------------------------------------------------------------------------------------------

def phones(p):
    """At 390 by 844 and 360 by 740 with touch: a tap selects a picture (the tab, its frame), a
    finger on a corner handle sizes it, a long press opens its menu, every control of the tab is
    there to tap, 44 px targets, the dialogs fit and scroll, the page never scrolls sideways."""
    import browser as B
    for w, h in ((390, 844), (360, 740)):
        br = p.chromium.launch(args=[a for a in os.environ.get('CHROME_ARGS', '').split() if a])
        ctx = br.new_context(viewport={'width': w, 'height': h}, has_touch=True, is_mobile=True, device_scale_factor=2)
        html = open(os.path.join(DIST, 'rikuy.html'), encoding='utf8').read()
        doc = B.SKELETON_HEAD + html + '</body></html>'
        def handler(route):
            url = route.request.url
            if url.startswith('https://rikuy.test/'):
                path = url[len('https://rikuy.test/'):].split('?')[0]
                f = os.path.join(DIST, path)
                if path and os.path.isfile(f):
                    return route.fulfill(status=200, content_type='text/javascript' if path.endswith(('.js', '.mjs')) else 'application/octet-stream', body=open(f, 'rb').read())
                return route.fulfill(status=200, content_type='text/html; charset=utf-8', body=doc)
            if url in B.ROUTES:
                return route.fulfill(status=200, content_type='application/javascript', headers={'Access-Control-Allow-Origin': '*'}, body=open(B.ROUTES[url], 'rb').read())
            return route.abort()
        ctx.route('**/*', handler)
        page = ctx.new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto('https://rikuy.test/')
        page.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=30000)
        tag = ' (%d px, touch)' % w
        asset(page)
        load_doc(page, DOC); page.wait_for_timeout(600)
        coarse = page.evaluate("matchMedia('(pointer: coarse)').matches")
        box = page.locator('#pages .a-img').bounding_box()
        page.touchscreen.tap(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2); page.wait_for_timeout(500)
        st = page.evaluate("({ armed: !!(window.rikuy.armed && window.rikuy.armed.kind === 'img'), tab: window.rikuy.rbTab, sel: document.getElementById('rb-tabsel').value, frame: !document.querySelector('.pic-frame').hidden })")
        check('a tap on a picture selects it: frame, the Picture Format tab chosen in "Ribbon tab"' + tag, st['armed'] and st['tab'] == 'picture-format' and st['sel'] == 'picture-format' and st['frame'], st)
        if not st['armed']: sel_pic()(page)
        hit = page.evaluate("(() => { const h = document.querySelector('.pic-frame .pic-h-se'), b = getComputedStyle(h, '::before'); return [parseFloat(b.width), parseFloat(b.height)]; })()")
        check('pointer: coarse, and each handle a 44 px target' + tag, coarse and hit == [44, 44], (coarse, hit))
        se = page.locator('.pic-frame .pic-h-se').bounding_box()
        cx, cy = se['x'] + se['width'] / 2, se['y'] + se['height'] / 2
        cdp = ctx.new_cdp_session(page)
        tw = page.evaluate('window.rikuy.layout.g.tw * window.rikuy.layout.px')
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': cx, 'y': cy}]})
        for k in range(1, 7):
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': cx - tw * 0.1 * k / 6, 'y': cy + 2 * k}]})
        held = page.evaluate('[document.documentElement.classList.contains("pic-drag"), window.visualViewport ? window.visualViewport.scale : 1]')
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        page.wait_for_timeout(400)
        check('a finger on the corner handle sizes it: width=0.4\\linewidth, the page held still meanwhile (no pan, no zoom)' + tag, src(page) == DOC.replace('0.5\\linewidth', '0.4\\linewidth') and held[0] and held[1] == 1, (body(page), held))
        if not page.evaluate("!!window.rikuy.armed"): sel_pic()(page)
        names = [('button', 'Change Picture'), ('button', 'Reset Picture'), ('button', 'Picture Border'), ('button', 'Insert Caption'), ('button', 'Alt Text'), ('button', 'Position'), ('button', 'Wrap Text'), ('button', 'Rotate'), ('button', 'Crop'), ('spinbutton', 'Height'), ('spinbutton', 'Width'), ('button', 'Lock Aspect Ratio'), ('button', 'Size and Position')]
        miss = []
        for r, n in names:
            loc = page.get_by_role(r, name=n, exact=True)
            if loc.count() != 1: miss.append(n); continue
            loc.scroll_into_view_if_needed()
            bb = loc.bounding_box()
            if not bb or bb['height'] < 43.5 or bb['x'] < -1 or bb['x'] + bb['width'] > w + 1: miss.append((n, bb))
        check('every control of Picture Format there to tap in the ribbon\'s row, 44 px high' + tag, not miss, miss)
        fld = page.locator('#rc-picture-width').bounding_box()
        check('the Width field a 44 px target' + tag, fld and fld['height'] >= 43.5, fld)
        page.get_by_role('button', name='Rotate', exact=True).tap(); page.wait_for_timeout(300)
        page.get_by_role('menuitem', name='Rotate Left 90°', exact=True).tap(); page.wait_for_timeout(300)
        check('Rotate › Rotate Left 90° by taps' + tag, 'angle=90' in src(page), body(page))
        box = page.locator('#pages .a-img').bounding_box()
        page.evaluate('([x, y]) => { const el = document.elementFromPoint(x, y); el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y })); }', [box['x'] + box['width'] / 2, box['y'] + box['height'] / 2])
        page.wait_for_timeout(300)
        items = page.evaluate("[...document.querySelectorAll('.pop-ctx [role^=menuitem]')].map((x) => x.getAttribute('aria-label'))")
        check('a long press on the picture opens its menu' + tag, items[:3] == ['Change Picture', 'Size and Position', 'Crop'], items)
        page.keyboard.press('Escape'); page.wait_for_timeout(150)
        sel_pic()(page)
        for cid, title in (('picture-size', 'Size and Position'), ('picture-alt', 'Alt Text')):
            run_cmd(page, cid); page.wait_for_timeout(300)
            d = page.get_by_role('dialog', name=title, exact=True)
            bb = d.bounding_box()
            sc = d.evaluate('(e) => [e.scrollHeight, e.clientHeight, getComputedStyle(e).overflowY]')
            check(title + ' fits the screen (or scrolls inside itself)' + tag, bb and bb['x'] >= 0 and bb['x'] + bb['width'] <= w + 1 and bb['y'] >= 0 and bb['y'] + bb['height'] <= h + 1 and (sc[0] <= sc[1] + 1 or sc[2] in ('auto', 'scroll')), (bb, sc))
            page.keyboard.press('Escape'); page.wait_for_timeout(150); sel_pic()(page)
        load_doc(page, WRAP('First paragraph here.\n\nSecond.', '')); click_text(page, 'First', 2)
        run_cmd(page, 'insert-chart'); page.wait_for_timeout(300)
        d = page.get_by_role('dialog', name='Chart', exact=True)
        bb = d.bounding_box()
        check('Chart\'s dialog fits the width and scrolls' + tag, bb and bb['x'] >= 0 and bb['x'] + bb['width'] <= w + 1 and bb['y'] + bb['height'] <= h + 1, bb)
        d.get_by_role('button', name='OK', exact=True).tap(); page.wait_for_timeout(300)
        check('and OK by tap writes the chart' + tag, '\\begin{axis}' in src(page))
        check('the page never scrolls sideways' + tag, page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))
        check('no page errors' + tag, not errs, errs[:3])
        br.close()


def run():
    with sync_playwright() as p:
        browser, page, errors = open_page(p)
        asset(page)
        names = sys.argv[1:]
        for f in (selecting, trips, sizing, tools, drawing, objects, reviewed, compiled):
            if names and f.__name__ not in names:
                continue
            try: f(page)
            except Exception as e: check(f.__name__ + ' runs to its end', False, str(e)[:400])
        check('no page errors', not [e for e in errors if 'tree.wasm' not in e and 'TeX' not in e], errors[:4])
        browser.close()
        if not names or 'phones' in names:
            try: phones(p)
            except Exception as e: check('phones runs to its end', False, str(e)[:400])
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    run()
