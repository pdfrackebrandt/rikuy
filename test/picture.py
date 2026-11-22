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
from browser import settle, until, open_page, check, results, src, load_doc, click_text, roundtrip, pressed, PRINT_LAYOUT
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


# The pictures drawn from their files: each file's size read from its first bytes (picNatural in
# src/cmd/picture.js: a read of the file, no timer, then the page drawn again in the next frame) and
# each <img> loaded. Not a timer: settle() does not wait for it.
DRAWN = """() => { const g = window.rikuy, c = g.picNat; return !g.picNatT && (!c || [...c.values()].every((v) => !v.wait))
  && [...document.querySelectorAll('#pages .a-img img')].every((i) => i.complete && i.naturalWidth > 0); }"""


def run_cmd(page, cid, args=None):
    r = page.evaluate('([id, a]) => window.rikuy.runCommand(id, a)', [cid, args])
    settle(page, 150)
    return r


def sel_pic(k=0):
    """roundtrip()'s select: the k-th picture selected, as a press on it does."""
    def f(page):
        page.evaluate('''(k) => { const g = window.rikuy, t = g.files.get('main.tex'); let i = -1; for (let j = 0; j <= k; j++) i = t.indexOf('\\\\includegraphics', i + 1); g.picSelect({ f: 'main.tex', s: i }, { tab: true }); }''', k)
        settle(page, 80)
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
    page.evaluate('window.rikuy.undo()'); settle(page, 150)
    check(label + ': one undo gives the source back byte for byte', src(page) == doc)


def shown_tabs(page):
    return page.evaluate("[...document.querySelectorAll('#rb-tabs [role=tab]')].filter((t) => !t.hidden).map((t) => t.textContent)")


def body(page):
    s = src(page)
    return s[s.find('\\begin{document}') + 16:s.find('\\end{document}')]


# ---- selecting -------------------------------------------------------------------------------------

def selecting(page):
    load_doc(page, DOC); settle(page, 500)
    box = page.locator('#pages .a-img').bounding_box()
    page.mouse.click(box['x'] + 30, box['y'] + 30); settle(page, 250)
    st = page.evaluate('''() => { const g = window.rikuy, f = document.querySelector('.pic-frame'); return { armed: g.armed && g.armed.kind, tab: g.rbTab, frame: f && !f.hidden ? f.getBoundingClientRect().toJSON() : null,
      handles: f ? [...f.querySelectorAll('.pic-h')].filter((h) => getComputedStyle(h).display !== 'none').length : 0, bubble: document.getElementById('bubble').hidden, pop: !!g.pop }; }''')
    check('a press on a picture selects it: its frame with eight handles over it, the Picture Format tab open, no bubble, no source box', st['armed'] == 'img' and st['tab'] == 'picture-format' and st['frame'] and abs(st['frame']['width'] - box['width']) < 2
          and st['handles'] == 8 and st['bubble'] and not st['pop'], st)
    check('the tab "Picture Format" shows after Help while it is selected', shown_tabs(page)[-1] == 'Picture Format', shown_tabs(page))
    names = [page.get_by_role(r, name=n, exact=True).count() for r, n in (('button', 'Change Picture'), ('button', 'Reset Picture'), ('button', 'Picture Border'), ('button', 'Insert Caption'), ('button', 'Alt Text'),
             ('button', 'Position'), ('button', 'Wrap Text'), ('button', 'Rotate'), ('button', 'Crop'), ('spinbutton', 'Height'), ('spinbutton', 'Width'), ('button', 'Lock Aspect Ratio'), ('button', 'Size and Position'))]
    check('its controls by Word\'s names: Change Picture, Reset Picture, Picture Border, Insert Caption, Alt Text, Position, Wrap Text, Rotate, Crop, Height, Width, Lock Aspect Ratio, Size and Position', names == [1] * 13, names)
    check('the fields show its size: width 50% (a share of the line), height in cm', page.input_value('#rc-picture-width') == '50%' and page.input_value('#rc-picture-height').endswith('cm'), (page.input_value('#rc-picture-width'), page.input_value('#rc-picture-height')))
    click_text(page, 'After it'); settle(page, 250)
    check('a press elsewhere lets it go: frame and tab go, Home again', not page.evaluate('!!window.rikuy.armed') and page.evaluate("document.querySelector('.pic-frame').hidden") and 'Picture Format' not in shown_tabs(page) and page.evaluate('window.rikuy.rbTab') != 'picture-format', shown_tabs(page))
    page.mouse.click(box['x'] + 30, box['y'] + 30); settle(page, 150)
    page.mouse.dblclick(box['x'] + 30, box['y'] + 30); settle(page, 250)
    check('a double click edits its source (the figure source box)', page.evaluate("!!(window.rikuy.pop && window.rikuy.pop.el.classList.contains('pop-raw'))"))
    page.keyboard.press('Escape'); settle(page, 100)
    sel_pic()(page)
    page.keyboard.press('Delete'); settle(page, 200)
    check('Delete on the selected picture takes it out, one undo puts it back', '\\includegraphics' not in src(page) and (page.evaluate('window.rikuy.undo()') or True) and src(page) == DOC)
    # a picture made by a macro is shown, not selected
    load_doc(page, WRAP('\\newcommand{\\fig}{\\includegraphics[width=3cm]{a.png}}\nText \\fig{} more.')); settle(page, 300)
    b2 = page.locator('#pages .a-img').bounding_box()
    page.mouse.click(b2['x'] + 5, b2['y'] + 5); settle(page, 200)
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
    run_cmd(page, 'picture-caption'); settle(page, 150)
    page.keyboard.type('A box')
    settle(page, 250)
    check('Insert Caption on a picture in line: \\captionof{figure} (caption\'s line once), the caret in it to type the caption', src(page) == cap.replace('\\captionof{figure}{}', '\\captionof{figure}{A box}'), body(page))
    load_doc(page, WRAP(CENTER().replace('\\begin{center}', '\\begin{figure}[t]\n\\centering').replace('\\end{center}', '\\end{figure}'))); P(page)
    run_cmd(page, 'picture-caption')
    check('in a figure: \\caption{} under the picture', '{a.png}\n\\caption{}\n\\end{figure}' in src(page), body(page))
    load_doc(page, DOC); P(page)
    page.evaluate('''(b) => { const u = Uint8Array.from(atob(b), (c) => c.charCodeAt(0)); window.rikuy.runCommand('picture-change', { file: 'b photo.png', blob: new Blob([u], { type: 'image/png' }) }); }''', base64.b64encode(png(80, 80, color=(20, 160, 60))).decode())
    settle(page, 250)
    check('Change Picture: the file under a safe name in its place, its options kept, the new picture drawn', src(page) == DOC.replace('{a.png}', '{b-photo.png}') and page.evaluate("window.rikuy.assetBlobs.has('b-photo.png') && !!document.querySelector('#pages .a-img img')"), body(page))


# ---- sizing --------------------------------------------------------------------------------------------

def sizing(page):
    load_doc(page, DOC); settle(page, 400); sel_pic()(page); settle(page, 200)
    def handle(k):
        return page.locator('.pic-frame .pic-h-' + k).bounding_box()
    tw = page.evaluate('window.rikuy.layout.g.tw * window.rikuy.layout.px')
    se = handle('se')
    h0 = page.evaluate('window.rikuy.hist.length')
    page.mouse.move(se['x'] + 4, se['y'] + 4); page.mouse.down(); page.mouse.move(se['x'] + 4 - tw * 0.1, se['y'] + 40, steps=6)
    tip = page.evaluate("document.querySelector('.pic-tip').textContent")
    page.mouse.up(); settle(page, 300)
    check('a corner dragged in by a tenth of the line: the tip says 40% of the line, and width=0.4\\linewidth is written as one step, the shape kept', src(page) == DOC.replace('0.5\\linewidth', '0.4\\linewidth') and page.evaluate('window.rikuy.hist.length') == h0 + 1 and '40% of the line' in tip, (tip, body(page)))
    check('the picture stays selected after it, its frame on its new size', page.evaluate("!!window.rikuy.armed") and abs(page.locator('.pic-frame').bounding_box()['width'] - tw * 0.4) < 3)
    page.evaluate('window.rikuy.undo()'); settle(page, 200)
    sel_pic()(page)
    e = handle('e')
    page.mouse.move(e['x'] + 4, e['y'] + 4); page.mouse.down(); page.mouse.move(e['x'] + 4 - tw * 0.137, e['y'] + 4, steps=5); page.mouse.up(); settle(page, 300)
    check('off a twentieth of the line: a length in cm (to a millimetre)', re.search(r'\[width=[\d.]+cm\]', src(page)) is not None, body(page))
    page.evaluate('window.rikuy.undo()'); settle(page, 200)
    sel_pic()(page)
    se = handle('se')
    page.keyboard.down('Shift')
    page.mouse.move(se['x'] + 4, se['y'] + 4); page.mouse.down(); page.mouse.move(se['x'] - 30, se['y'] + 60, steps=5); page.mouse.up()
    page.keyboard.up('Shift'); settle(page, 300)
    check('Shift frees the shape: width and height both written', re.search(r'\[width=[\d.]+cm,height=[\d.]+cm\]', src(page)) is not None and pressed(page, 'picture-lock') is False, body(page))
    page.evaluate('window.rikuy.undo()'); settle(page, 200)
    sel_pic()(page)
    se = handle('se')
    page.mouse.move(se['x'] + 4, se['y'] + 4); page.mouse.down(); page.mouse.move(se['x'] - 60, se['y'] - 30, steps=4); page.keyboard.press('Escape'); page.mouse.up(); settle(page, 250)
    check('Escape while dragging gives up: nothing written', src(page) == DOC)
    # the fields
    sel_pic()(page)
    page.click('#rc-picture-width'); page.fill('#rc-picture-width', '30%'); page.keyboard.press('Enter'); settle(page, 250)
    check('the Width field: 30% writes width=0.3\\linewidth', src(page) == DOC.replace('0.5\\linewidth', '0.3\\linewidth'), body(page))
    sel_pic()(page)
    page.click('#rc-picture-height'); page.fill('#rc-picture-height', '4 cm'); page.keyboard.press('Enter'); settle(page, 250)
    check('the Height field: 4 cm writes height=4cm, the width going (the shape kept)', src(page) == DOC.replace('width=0.5\\linewidth', 'height=4cm'), body(page))
    load_doc(page, DOC); sel_pic()(page)
    page.click('#rc-picture-width'); page.keyboard.press('ArrowUp'); settle(page, 250)
    check('ArrowUp in Width: five more percent of the line', src(page) == DOC.replace('0.5\\linewidth', '0.55\\linewidth'), body(page))
    # a picture filling its wrapfigure: the wrapfigure's width is what changes
    wr = WRAP('\\begin{wrapfigure}{r}{0.5\\linewidth}\n\\centering\n\\includegraphics[width=\\linewidth]{a.png}\n\\end{wrapfigure}\nText that wraps round it.', '\\usepackage{graphicx}\n\\usepackage{wrapfig}\n')
    load_doc(page, wr); settle(page, 300); sel_pic()(page)
    page.click('#rc-picture-width'); page.fill('#rc-picture-width', '35%'); page.keyboard.press('Enter'); settle(page, 250)
    check('in a wrapfigure it fills: Width sets the wrapfigure\'s width', src(page) == wr.replace('{0.5\\linewidth}', '{0.35\\linewidth}'), body(page))


# ---- crop, dialogs, menus, where it cannot go ------------------------------------------------------

def tools(page):
    load_doc(page, DOC); settle(page, 400); sel_pic()(page)
    run_cmd(page, 'picture-crop'); settle(page, 200)
    st = page.evaluate("(() => { const c = document.querySelector('.pic-crop'); return c && { bars: c.querySelectorAll('.pc-h').length, on: document.getElementById('rc-picture-crop').getAttribute('aria-pressed') }; })()")
    check('Crop: the whole picture dim, the part kept bright, eight black bars; the button pressed', st and st['bars'] == 8 and st['on'] == 'true', st)
    bar = page.locator('.pic-crop .pc-h-e').bounding_box()
    w = page.locator('.pic-crop .pc-win').bounding_box()['width']
    page.mouse.move(bar['x'] + 2, bar['y'] + 5); page.mouse.down(); page.mouse.move(bar['x'] + 2 - w / 2, bar['y'] + 5, steps=5); page.mouse.up()
    page.keyboard.press('Enter'); settle(page, 400)
    m = re.search(r'trim=0 0 ([\d.]+)cm 0,clip', src(page))
    # the right half of 300 px at 150 dpi: 1in = 2.54cm
    check('dragging the right bar half way in, then Enter: trim=0 0 2.54cm 0,clip (TeX\'s size of the file: 150 dpi)', m and abs(float(m.group(1)) - 2.54) < 0.06, body(page))
    drawn = page.evaluate("(() => { const s = document.querySelector('#pages .a-img'); const r = s.getBoundingClientRect(); return { box: s.classList.contains('a-box'), clip: !!s.querySelector('.pic-in.clip'), ratio: r.width / r.height }; })()")
    check('the page draws the cropped picture: its box half as wide for the same height (graphicx\'s box), the rest cut off', drawn['box'] and drawn['clip'] and abs(drawn['ratio'] - 0.75) < 0.03, drawn)
    page.evaluate('window.rikuy.undo()'); settle(page, 200); sel_pic()(page)
    run_cmd(page, 'picture-crop'); page.keyboard.press('Escape'); settle(page, 200)
    check('Escape leaves Crop with nothing written', src(page) == DOC and not page.evaluate("!!document.querySelector('.pic-crop')"))
    # Alt Text dialog
    sel_pic()(page)
    run_cmd(page, 'picture-alt'); settle(page, 150)
    dlg = page.get_by_role('dialog', name='Alt Text', exact=True)
    check('Alt Text opens its dialog, named so, its text box first', dlg.count() == 1 and page.evaluate("document.activeElement.getAttribute('aria-label')") == 'Alt text')
    page.keyboard.type('Two halves, red and blue')
    dlg.get_by_role('button', name='OK', exact=True).click(); settle(page, 250)
    check('OK writes alt={…}; the page\'s picture takes it as its alt', 'alt={Two halves, red and blue}' in src(page) and page.evaluate("document.querySelector('#pages .a-img img').alt") == 'Two halves, red and blue')
    # Size and Position
    load_doc(page, DOC); sel_pic()(page)
    run_cmd(page, 'picture-size'); settle(page, 150)
    d = page.get_by_role('dialog', name='Size and Position', exact=True)
    d.get_by_role('textbox', name='Width', exact=True).fill('6cm')
    d.get_by_role('textbox', name='Rotation', exact=True).fill('90')
    d.get_by_role('combobox', name='Position', exact=True).select_option('t')
    h0 = page.evaluate('window.rikuy.hist.length')
    d.get_by_role('button', name='OK', exact=True).click(); settle(page, 300)
    check('Size and Position: width, rotation and position in one step', src(page) == WRAP(CENTER('width=6cm,angle=90').replace('\\begin{center}', '\\begin{figure}[t]\n\\centering').replace('\\end{center}', '\\end{figure}')) and page.evaluate('window.rikuy.hist.length') == h0 + 1, body(page))
    page.evaluate('window.rikuy.undo()'); settle(page, 200)
    check('and one undo takes it all back', src(page) == DOC)
    # the right click menu
    box = page.locator('#pages .a-img').bounding_box()
    page.mouse.click(box['x'] + 20, box['y'] + 20, button='right'); settle(page, 250)
    items = page.evaluate("[...document.querySelectorAll('.pop-ctx [role^=menuitem]')].map((x) => x.getAttribute('aria-label'))")
    check('the right click menu on a picture: Change Picture, Size and Position, Crop, Wrap Text, Insert Caption, Alt Text, Show Picture Source first', items[:7] == ['Change Picture', 'Size and Position', 'Crop', 'Wrap Text', 'Insert Caption', 'Alt Text', 'Show Picture Source'], items)
    page.get_by_role('menuitem', name='Wrap Text', exact=True).click(); settle(page, 200)
    wr = page.evaluate("[...document.querySelectorAll('.pop-menu [role^=menuitem]')].map((x) => [x.getAttribute('aria-label'), x.getAttribute('aria-checked'), x.getAttribute('aria-disabled')])")
    check('its Wrap Text: In Line with Text checked, Square, Tight, Through, Top and Bottom; Behind and In Front of Text disabled (LaTeX has no form)', wr[0] == ['In Line with Text', 'true', None] and [x[0] for x in wr[1:5]] == ['Square', 'Tight', 'Through', 'Top and Bottom'] and wr[5][2] == 'true' and wr[6][2] == 'true', wr)
    page.keyboard.press('Escape')
    # where it cannot go
    for doc, cid, why in ((WRAP('\\begin{multicols}{2}\n' + CENTER() + '\n\\end{multicols}', '\\usepackage{graphicx}\n\\usepackage{multicol}\n'), 'picture-place-top', 'columns'),
                          (WRAP('\\begin{itemize}\n\\item One.\n' + CENTER() + '\n\\end{itemize}'), 'picture-wrap-right', 'list'),
                          (WRAP('Words \\includegraphics[height=1em]{a.png} in a sentence.'), 'picture-place-top', 'sentence'),
                          ('\\documentclass{beamer}\n\\begin{document}\n\\begin{frame}\n' + CENTER() + '\n\\end{frame}\n\\end{document}\n', 'picture-place-top', 'beamer')):
        load_doc(page, doc); settle(page, 300); sel_pic()(page)
        r = page.evaluate('(id) => { const c = window.rikuy.cmds.command(id); const at = window.rikuy.ribbonAt(); return [window.rikuy.cmds.enabled(window.rikuy, c, at), c.whyNot(window.rikuy, at)]; }', cid)
        before = src(page)
        run_cmd(page, cid)
        check('where a picture cannot go (' + why + '): ' + cid + ' disabled with the reason, nothing written', r[0] is False and why in (r[1] or '') and src(page) == before, r)


# ---- the page draws it as graphicx sets it ----------------------------------------------------------

def drawing(page):
    tw = lambda: page.evaluate('window.rikuy.layout.g.tw * window.rikuy.layout.px')
    pt = lambda: page.evaluate('window.rikuy.layout.px')
    load_doc(page, DOC); settle(page, 500)
    r = page.locator('#pages .a-img').bounding_box()
    check('width=0.5\\linewidth: half the line wide, its shape kept (300 by 200)', abs(r['width'] - tw() / 2) < 2 and abs(r['height'] / r['width'] - 2 / 3) < 0.02, (r, tw()))
    load_doc(page, WRAP(CENTER('width=0.5\\linewidth,angle=90'))); settle(page, 500)
    r = page.locator('#pages .a-img').bounding_box()
    check('width then angle=90: the picture half the line wide turned, so half the line tall', abs(r['height'] - tw() / 2) < 2 and abs(r['width'] - tw() / 3) < 2, r)
    load_doc(page, WRAP(CENTER('angle=90,width=0.5\\linewidth'))); settle(page, 500)
    r = page.locator('#pages .a-img').bounding_box()
    check('angle then width: the turned box half the line wide', abs(r['width'] - tw() / 2) < 2, r)
    load_doc(page, WRAP('\\includegraphics{a.png}')); settle(page, 500)
    r = page.locator('#pages .a-img img').bounding_box()
    check('no width: the size TeX gives it, 300 px at 150 dpi = 2 in = 144.54 pt', abs(r['width'] - 144.54 * pt()) < 2, (r['width'], 144.54 * pt()))
    load_doc(page, WRAP(CENTER().replace('\\includegraphics[width=0.5\\linewidth]{a.png}', '\\reflectbox{\\scalebox{1}[-1]{\\includegraphics[width=0.5\\linewidth]{a.png}}}'))); settle(page, 400)
    sc = page.evaluate("getComputedStyle(document.querySelector('#pages .a-img')).scale")
    check('flips drawn on the picture: scale -1 -1 (both)', sc.replace(' ', '') in ('-1-1', '-1'), sc)
    load_doc(page, WRAP(CENTER().replace('\\includegraphics[width=0.5\\linewidth]{a.png}', '{\\setlength{\\fboxsep}{0pt}\\fbox{\\includegraphics[width=0.5\\linewidth]{a.png}}}'))); settle(page, 400)
    b = page.evaluate("(() => { const s = getComputedStyle(document.querySelector('#pages .a-img')); return [s.borderTopStyle, s.paddingTop]; })()")
    check('Picture Border drawn tight: a solid frame, no gap (\\fboxsep 0pt)', b[0] == 'solid' and b[1] == '0px', b)
    load_doc(page, WRAP('\\begin{wrapfigure}{r}{0.4\\linewidth}\n\\centering\n\\includegraphics[width=\\linewidth]{a.png}\n\\caption{Wrapped}\n\\end{wrapfigure}\nText.', '\\usepackage{graphicx}\n\\usepackage{wrapfig}\n')); settle(page, 500)
    r = page.locator('#pages .a-img').bounding_box()
    check('a wrapfigure 0.4\\linewidth wide: the picture filling it is 0.4 of the line (drawn as a float until the page wraps text, B6)', abs(r['width'] - 0.4 * tw()) < 3, (r['width'], tw()))


# ---- Insert's objects ------------------------------------------------------------------------------------

def objects(page):
    PLAIN = WRAP('First paragraph here.\n\nSecond paragraph here.', '')
    for sid, needle in (('rectangle', '\\draw[thick, draw=blue!60!black, fill=blue!20] (0,0) rectangle (3,2);'), ('arrow', '\\draw[thick, draw=blue!60!black, ->] (0,0) -- (3,0);'), ('star', '-- cycle;'), ('oval', 'ellipse (1.5 and 1)')):
        load_doc(page, PLAIN); click_text(page, 'First', 2)
        run_cmd(page, 'insert-shapes', {'shape': sid}); settle(page, 250)
        s = src(page)
        drawn = page.evaluate("(() => { const r = document.querySelector('#pages .raw.drawn svg.tz'); return r ? r.querySelectorAll('path, rect, circle, ellipse').length : 0; })()")
        check('Shapes › ' + sid + ': a TikZ picture in a center after the paragraph, \\usepackage{tikz} once, drawn on the page', needle in s and s.count('\\usepackage{tikz}') == 1 and s.index('First paragraph') < s.index('\\begin{tikzpicture}') < s.index('Second') and drawn >= 1, (drawn, body(page)))
    page.evaluate('window.rikuy.undo()'); settle(page, 150)
    check('one undo takes the shape and its package out', src(page) == PLAIN)
    load_doc(page, PLAIN); click_text(page, 'First', 5)
    run_cmd(page, 'insert-icons', {'icon': 'envelope'})
    check('Icons: \\faIcon{envelope} at the caret, fontawesome5 once, drawn as the icon', 'First\\faIcon{envelope} paragraph' in src(page) and '\\usepackage{fontawesome5}' in src(page) and page.evaluate("!!document.querySelector('#pages .a-icon svg.fa')"), body(page))
    load_doc(page, PLAIN); click_text(page, 'First', 2)
    run_cmd(page, 'insert-icons'); settle(page, 200)
    check('Icons\' gallery: every icon by name', page.evaluate("[...document.querySelectorAll('.pop-gal [role=menuitemradio]')].length") >= 30 and page.get_by_role('menuitemradio', name='Envelope', exact=True).count() == 1)
    page.keyboard.press('Escape')
    load_doc(page, PLAIN); click_text(page, 'First', 2)
    run_cmd(page, 'insert-smartart'); settle(page, 200)
    page.get_by_role('dialog', name='SmartArt', exact=True).get_by_role('button', name='OK', exact=True).click(); settle(page, 300)
    check('SmartArt: \\smartdiagram[flow diagram:horizontal]{Plan, Write, Submit}, smartdiagram once, drawn as three boxes', '\\smartdiagram[flow diagram:horizontal]{Plan, Write, Submit}' in src(page) and '\\usepackage{smartdiagram}' in src(page)
          and page.evaluate("document.querySelectorAll('#pages .a-smart svg rect').length") == 3, body(page))
    load_doc(page, PLAIN); click_text(page, 'First', 2)
    run_cmd(page, 'insert-chart'); settle(page, 200)
    page.get_by_role('dialog', name='Chart', exact=True).get_by_role('button', name='OK', exact=True).click(); settle(page, 300)
    s = src(page)
    check('Chart: a pgfplots axis of columns from Word\'s sample data, with its compat line once, drawn as 12 bars', '\\begin{axis}[ybar' in s and '\\addplot coordinates {(Category 1,4.3) (Category 2,2.5) (Category 3,3.5) (Category 4,4.5)};' in s
          and '\\usepackage{pgfplots}\n\\pgfplotsset{compat=1.18}' in s and page.evaluate("document.querySelectorAll('#pages .raw.drawn svg.pgf rect').length") >= 12 + 1, body(page))
    for kind, needle, pk in (('simple', '\\fbox{\\begin{minipage}{0.5\\linewidth}\nType here.\n\\end{minipage}}', None), ('shaded', '\\begin{tcolorbox}[width=0.6\\linewidth, center, colback=gray!10]\nType here.\n\\end{tcolorbox}', 'tcolorbox'),
                             ('beside', '\\begin{wrapfigure}{r}{0.4\\linewidth}\n\\fbox{\\begin{minipage}', 'wrapfig')):
        load_doc(page, PLAIN); click_text(page, 'First', 2)
        run_cmd(page, 'insert-textbox', {'kind': kind}); settle(page, 250)
        page.keyboard.type('Boxed words')
        settle(page, 250)
        check('Text Box (' + kind + '): written after the paragraph, "Type here." selected and typed over' + (', ' + pk + ' once' if pk else ''), needle.replace('Type here.', 'Boxed words') in src(page) and (not pk or src(page).count('\\usepackage{' + pk + '}') == 1), body(page))
    load_doc(page, PLAIN); click_text(page, 'First', 2)
    run_cmd(page, 'insert-textbox', {'kind': 'shaded'}); settle(page, 250)
    fr = page.evaluate("(() => { const e = document.querySelector('#pages .it.bx'); return e && [getComputedStyle(e).borderTopStyle, Math.round(e.getBoundingClientRect().width / e.parentElement.getBoundingClientRect().width * 100)]; })()")
    check('the shaded box drawn framed, 60% of the line wide', fr and fr[0] == 'solid' and abs(fr[1] - 60) <= 2, fr)
    # drop cap
    roundtrip(page, PLAIN, lambda pg: (click_text(pg, 'paragraph', 2), settle(pg, 80)), fn('dropcap-dropped'), WRAP('\\lettrine[lines=3]{F}{irst} paragraph here.\n\nSecond paragraph here.', '\\usepackage{lettrine}\n'), off=WRAP('First paragraph here.\n\nSecond paragraph here.', '\\usepackage{lettrine}\n'), off_command=fn('dropcap-none'), label='Drop Cap: Dropped, None takes it off')
    load_doc(page, WRAP('\\lettrine[lines=3]{F}{irst} paragraph here.', '\\usepackage{lettrine}\n')); click_text(page, 'paragraph', 2)
    check('a drop cap shows: Dropped checked; the letter drawn large over three lines', pressed(page, 'dropcap-dropped') is True and page.evaluate("getComputedStyle(document.querySelector('#pages .y-dropcap')).float") == 'left')
    run_cmd(page, 'dropcap-margin')
    check('In Margin: lhang=1 added to its options', '\\lettrine[lines=3,lhang=1]{F}{irst}' in src(page), body(page))
    load_doc(page, WRAP('\\textbf{Bold} start.', '')); click_text(page, 'start', 1)
    check('Drop Cap on a paragraph that starts with a command: disabled with the reason', not page.evaluate('window.rikuy.cmds.enabled(window.rikuy, "insert-dropcap", window.rikuy.ribbonAt())'))
    # screenshot: a stand in for the browser's capture
    load_doc(page, PLAIN); click_text(page, 'First', 2)
    page.evaluate('''() => { navigator.mediaDevices.getDisplayMedia = async () => { const c = document.createElement('canvas'); c.width = 64; c.height = 48; const x = c.getContext('2d'); x.fillStyle = '#c03'; x.fillRect(0, 0, 64, 48); return c.captureStream(5); }; }''')
    page.evaluate('window.rikuy.runCommand("insert-screenshot")'); settle(page, 1500)
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
        settle(page, 500)
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
    load_doc(page, DOC); settle(page, 300); sel_pic()(page)
    run_cmd(page, 'picture-rotate-right')
    page.keyboard.press('Control+z'); settle(page, 250)
    armed = page.evaluate('!!window.rikuy.armed')
    page.keyboard.press('Backspace'); settle(page, 250)
    s = src(page)
    check('H1: after Rotate Right and Ctrl+Z nothing stays selected, and Backspace leaves the picture and its center whole', not armed and '\\includegraphics[width=0.5\\linewidth]{a.png}\n\\end{center}' in s and s.count('\\begin{center}') == s.count('\\end{center}'), body(page))
    load_doc(page, DOC); settle(page, 300); sel_pic()(page)
    page.evaluate("() => { const g = window.rikuy, t = g.files.get('main.tex'), i = t.indexOf('After it'); g.commit([{ f: 'main.tex', s: i, e: i, t: 'Merged. ' }], null, 'merge'); }")
    settle(page, 250)
    page.keyboard.press('Backspace'); settle(page, 250)
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
    load_doc(page, sub); settle(page, 500)
    tw = page.evaluate('window.rikuy.layout.g.tw * window.rikuy.layout.px')
    ws = page.evaluate("[...document.querySelectorAll('#pages .a-img')].map((e) => e.getBoundingClientRect().width)")
    check('H4: a picture of width=\\linewidth in a 0.3\\linewidth subfigure is drawn 0.3 of the line wide, as TeX sets it', len(ws) == 2 and all(abs(w - 0.3 * tw) < 3 for w in ws), (ws, tw))
    load_doc(page, WRAP('\\begin{minipage}{0.45\\linewidth}\n\\includegraphics[width=0.8\\linewidth]{a.png}\n\\end{minipage}'))
    settle(page, 500)
    w = page.locator('#pages .a-img').bounding_box()['width']
    check('H4: in a 0.45\\linewidth minipage, width=0.8\\linewidth is 0.36 of the line', abs(w - 0.36 * tw) < 3, (w, tw))
    # H5: forty pictures whose size comes from their files: a handful of rebuilds, not one each
    data = base64.b64encode(png(60, 40, dpi=150)).decode()
    page.evaluate('([n, b]) => { const u = Uint8Array.from(atob(b), (c) => c.charCodeAt(0)); for (let k = 0; k < n; k++) window.rikuy.addAsset("f" + k + ".png", new Blob([u], { type: "image/png" })); }', [40, data])
    page.evaluate("() => { const g = window.rikuy; if (!window.__rbw) { const r = g.rebuild; window.__rbw = 1; g.rebuild = function (...a) { window.__rb = (window.__rb || 0) + 1; return r.apply(this, a); }; } window.__rb = 0; }")
    load_doc(page, WRAP('\n\n'.join('P %d.\n\n\\begin{center}\n\\includegraphics[height=1cm]{f%d.png}\n\\end{center}' % (k, k) for k in range(40))))
    until(page, DRAWN); settle(page, 1500)
    n = page.evaluate('window.__rb')
    # (2 or 3, as the files' sizes come in one frame or two: the count is shown when it fails, and kept out
    # of what a passing check saw, which RIKUY_CHECK_LOG sets beside another run's)
    check('H5: forty pictures sized from their files: at most 3 rebuilds (one for the document, one for the sizes that came)', n <= 3, '' if n <= 3 else n)
    # M2: the first Crop on a fresh picture opens
    asset(page, 'fresh.png', png(120, 80, dpi=144))
    load_doc(page, WRAP(CENTER().replace('a.png', 'fresh.png'))); until(page, DRAWN); settle(page, 300); sel_pic()(page)
    run_cmd(page, 'picture-crop'); settle(page, 600)
    check('M2: the first Crop on a picture opens its bars', page.evaluate("!!document.querySelector('.pic-crop') && window.rikuy.picCropping"))
    page.keyboard.press('Escape'); settle(page, 150)
    # H8, M5: starred captions have no number and shift no later one; beamer's "Figure:"
    load_doc(page, WRAP('\\begin{flushright}\n\\includegraphics[width=3cm]{a.png}\n\\captionof*{figure}{Starred}\n\\end{flushright}\n\n\\begin{figure}[h]\n\\centering\n\\includegraphics[width=3cm]{a.png}\n\\caption{Later}\n\\end{figure}', '\\usepackage{graphicx}\n\\usepackage{caption}\n'))
    settle(page, 400)
    caps = page.evaluate("[...document.querySelectorAll('#pages .cap')].map((c) => c.textContent)")
    check('H8: \\captionof*{figure}{Starred} is drawn without a number and the figure after it is Figure 1, as TeX prints them', caps == ['Starred', 'Figure 1: Later'], caps)
    load_doc(page, '\\documentclass{beamer}\n\\usepackage{caption}\n\\begin{document}\n\\begin{frame}\n\\begin{center}\n\\includegraphics[width=3cm]{a.png}\n\\captionof{figure}{Beamer cap}\n\\end{center}\n\\end{frame}\n\\end{document}\n')
    settle(page, 400)
    caps = page.evaluate("[...document.querySelectorAll('#pages .cap')].map((c) => c.textContent)")
    check('M5: in beamer a caption is "Figure: ...", as beamer prints it', caps == ['Figure: Beamer cap'], caps)
    # L4: a picture with its caption in a list item keeps the item's indent
    load_doc(page, WRAP('\\begin{itemize}\n\\item One.\n\\begin{center}\n\\includegraphics[width=3cm]{a.png}\n\\captionof{figure}{In a list}\n\\end{center}\n\\end{itemize}', '\\usepackage{graphicx}\n\\usepackage{caption}\n'))
    settle(page, 400)
    check('L4: in a list item the picture and its caption keep the item\'s indent', page.evaluate("(() => { const f = document.querySelector('#pages .flt.deep'); return !!f && getComputedStyle(f).paddingInlineStart !== '0px'; })()"))
    # H10: SmartArt with eleven items is refused
    load_doc(page, WRAP('First paragraph here.', '')); click_text(page, 'First', 2)
    before = src(page)
    r = run_cmd(page, 'insert-smartart', {'kind': 'flow diagram:horizontal', 'items': ['Item %d' % k for k in range(11)]})
    check('H10: SmartArt with eleven items is refused (TeX stops on them), nothing written', r is False and src(page) == before)
    # H9: a hand written axis keeps its source box
    load_doc(page, WRAP('\\begin{tikzpicture}\n\\begin{axis}[ymode=log]\n\\addplot coordinates {(0,1) (1,10)};\n\\end{axis}\n\\end{tikzpicture}', '\\usepackage{pgfplots}\n'))
    settle(page, 300)
    check('H9: a hand written pgfplots axis (ymode=log) is shown as its source, not drawn as a chart', not page.evaluate("!!document.querySelector('#pages svg.pgf')") and page.evaluate("!!document.querySelector('#pages .raw:not(.drawn)')"))
    # M1: the right handle of a picture turned a quarter widens the turned box
    load_doc(page, WRAP(CENTER('width=0.3\\linewidth,angle=90'))); settle(page, 500); sel_pic()(page); settle(page, 200)
    e = page.locator('.pic-frame .pic-h-e').bounding_box()
    page.mouse.move(e['x'] + 4, e['y'] + 4); page.mouse.down(); page.mouse.move(e['x'] + 44, e['y'] + 4, steps=5); page.mouse.up(); settle(page, 400)
    m = re.search(r'\[width=([\d.]+)cm,angle=90\]', src(page))
    check('M1: dragging the right handle of a picture turned 90 degrees writes its width from the turned box\'s height, so the box grows', bool(m) and float(m.group(1)) > 0.3 * page.evaluate('window.rikuy.layout.g.tw') / 28.4528 * 1.05, body(page))
    # L6: a picture in a line, an icon's size: one handle, no wide target over the words
    load_doc(page, WRAP('Words \\includegraphics[height=1em]{a.png} in a line.')); settle(page, 400); sel_pic()(page); settle(page, 200)
    check('L6: a small picture in a line has one handle, at its corner', page.evaluate("(() => { const f = document.querySelector('.pic-frame'); return f.classList.contains('tiny') && [...f.querySelectorAll('.pic-h')].filter((h) => getComputedStyle(h).display !== 'none').length === 1; })()"))
    # L2: memoir sets [H] with the float package
    load_doc(page, '\\documentclass{memoir}\n\\usepackage{graphicx}\n\\begin{document}\n' + CENTER() + '\n\\end{document}\n'); settle(page, 300); sel_pic()(page)
    run_cmd(page, 'picture-place-exact')
    check('L2: Exactly Here under memoir writes [H] with the float package', '\\begin{figure}[H]' in src(page) and '\\usepackage{float}' in src(page), body(page))
    # L3: decorative is a comment line, which every TeX reads
    load_doc(page, DOC); sel_pic()(page)
    run_cmd(page, 'picture-alt', {'text': '', 'decorative': True})
    check('L3: Mark as decorative writes "% alt (decorative)" above the picture, no artifact key', '\\begin{center}\n% alt (decorative)\n\\includegraphics[width=0.5\\linewidth]{a.png}' in src(page), body(page))
    # ---- the verification of 1c32c76 ----
    # N2: beamer steps the counter: \ref gives 1 though the caption prints "Figure:"
    load_doc(page, '\\documentclass{beamer}\n\\begin{document}\n\\begin{frame}\n\\begin{figure}\n\\includegraphics[width=3cm]{a.png}\n\\caption{Beamer cap}\\label{f:a}\n\\end{figure}\nSee \\ref{f:a}.\n\\end{frame}\n\\end{document}\n')
    settle(page, 400)
    t = page.evaluate("document.getElementById('pages').textContent")
    check('N2: in beamer "Figure: Beamer cap" and \\ref gives 1, as TeX prints them', 'Figure: Beamer cap' in t and 'See 1.' in t, t[:200])
    # N3: a picture in \scalebox{0.5} takes half its height on the page, as TeX's box does
    load_doc(page, WRAP('Before.\n\n\\begin{center}\n\\scalebox{0.5}{\\includegraphics[width=0.8\\linewidth]{a.png}}\n\\end{center}\n\nAfter.')); settle(page, 800)
    tw = page.evaluate('window.rikuy.layout.g.tw * window.rikuy.layout.px')
    b = page.locator('#pages .a-img').bounding_box()
    check('N3: \\scalebox{0.5} round width=0.8\\linewidth: a box 0.4 of the line wide and its height scaled with it', abs(b['width'] - 0.4 * tw) < 3 and abs(b['height'] - 0.4 * tw * 2 / 3) < 3, (b, tw))
    # N4: \scalebox{2}{\fbox{words}} is the Font group's scaled words, not a picture
    load_doc(page, WRAP('A \\scalebox{2}{\\fbox{Boxed}} word.')); settle(page, 300)
    check('N4: \\scalebox{2}{\\fbox{Boxed}} holds no picture: drawn as scaled words, not as a picture\'s box', not page.evaluate("!!document.querySelector('#pages .y-xf')"))
    # N6: Font Awesome 4's own name in the refusal
    load_doc(page, WRAP('First paragraph here.', '\\usepackage{fontawesome}\n')); click_text(page, 'First', 5)
    run_cmd(page, 'insert-icons', {'icon': 'map-marker-alt'})
    check('N6: with Font Awesome 4 the refusal names its own command, \\faMapMarker', '\\faMapMarker,' in page.evaluate("document.querySelector('#toast span').textContent"))
    # N7: selecting a picture with a width rebuilds nothing
    asset(page, 'once.png', png(80, 60, dpi=96))
    load_doc(page, WRAP(CENTER().replace('a.png', 'once.png'))); settle(page, 400)
    page.evaluate("() => { const g = window.rikuy; if (!window.__rbw) { const r = g.rebuild; window.__rbw = 1; g.rebuild = function (...a) { window.__rb = (window.__rb || 0) + 1; return r.apply(this, a); }; } window.__rb = 0; }")
    sel_pic()(page); settle(page, 500)
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
    r = compile_pdf(page, WRAP('\\begin{center}\n\\includegraphics{cam.jpg}\n\\end{center}')); settle(page, 800)
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
    r = compile_pdf(page, WRAP('\\begin{center}\n\\includegraphics{ea.jpg}\n\\end{center}')); settle(page, 800)
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
        # (a phone's Print Layout, which this suite was written for: browser.py, PRINT_LAYOUT)
        ctx.add_init_script(PRINT_LAYOUT)
        # (what every context of open_page() gets: the page's timers seen, so settle() waits for them,
        # and the animations off as in the other suites of features, unless RIKUY_MOTION=1; with them on,
        # a dialog measured in its entrance stands lower than it comes to rest)
        ctx.add_init_script(B.TIMERS)
        if os.environ.get('RIKUY_MOTION') != '1':
            ctx.add_init_script(B.MOTION_OFF)
        html = open(os.path.join(DIST, 'rikuy.html'), encoding='utf8').read()
        doc = B.SKELETON_HEAD + html + '</body></html>'
        def handler(route):
            url = route.request.url
            if url.startswith('https://rikuy.test/'):
                path = url[len('https://rikuy.test/'):].split('?')[0]
                f = os.path.join(DIST, path)
                # (a page file at its address without .html, as Pages serves it: the widget document of the
                # opening document's live graph; else the page itself answered, which refuses to be framed)
                if path and not os.path.isfile(f) and os.path.isfile(f + '.html'): f, path = f + '.html', path + '.html'
                if path and os.path.isfile(f):
                    return route.fulfill(status=200, content_type='text/javascript' if path.endswith(('.js', '.mjs')) else 'text/html; charset=utf-8' if path.endswith('.html') else 'application/octet-stream', headers=B.policy(DIST, '/' + path), body=open(f, 'rb').read())
                return route.fulfill(status=200, content_type='text/html; charset=utf-8', headers=B.policy(DIST, '/'), body=doc)
            if url in B.ROUTES:
                return route.fulfill(status=200, content_type='application/javascript', headers={'Access-Control-Allow-Origin': '*'}, body=open(B.ROUTES[url], 'rb').read())
            return route.abort()
        ctx.route('**/*', handler)
        page = ctx.new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto('https://rikuy.test/')
        page.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=30000)
        # (the page the test's once rikuy.ready has settled and drawn, as open_page() waits)
        page.evaluate('() => window.rikuy.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))')
        tag = ' (%d px, touch)' % w
        asset(page)
        load_doc(page, DOC); settle(page, 600)
        coarse = page.evaluate("matchMedia('(pointer: coarse)').matches")
        box = page.locator('#pages .a-img').bounding_box()
        page.touchscreen.tap(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2); settle(page, 500)
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
        settle(page, 400)
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
        page.get_by_role('button', name='Rotate', exact=True).tap(); settle(page, 300)
        page.get_by_role('menuitem', name='Rotate Left 90°', exact=True).tap(); settle(page, 300)
        check('Rotate › Rotate Left 90° by taps' + tag, 'angle=90' in src(page), body(page))
        box = page.locator('#pages .a-img').bounding_box()
        page.evaluate('([x, y]) => { const el = document.elementFromPoint(x, y); el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y })); }', [box['x'] + box['width'] / 2, box['y'] + box['height'] / 2])
        settle(page, 300)
        items = page.evaluate("[...document.querySelectorAll('.pop-ctx [role^=menuitem]')].map((x) => x.getAttribute('aria-label'))")
        check('a long press on the picture opens its menu' + tag, items[:3] == ['Change Picture', 'Size and Position', 'Crop'], items)
        page.keyboard.press('Escape'); settle(page, 150)
        sel_pic()(page)
        for cid, title in (('picture-size', 'Size and Position'), ('picture-alt', 'Alt Text')):
            run_cmd(page, cid); settle(page, 300)
            d = page.get_by_role('dialog', name=title, exact=True)
            bb = d.bounding_box()
            sc = d.evaluate('(e) => [e.scrollHeight, e.clientHeight, getComputedStyle(e).overflowY]')
            check(title + ' fits the screen (or scrolls inside itself)' + tag, bb and bb['x'] >= 0 and bb['x'] + bb['width'] <= w + 1 and bb['y'] >= 0 and bb['y'] + bb['height'] <= h + 1 and (sc[0] <= sc[1] + 1 or sc[2] in ('auto', 'scroll')), (bb, sc))
            page.keyboard.press('Escape'); settle(page, 150); sel_pic()(page)
        load_doc(page, WRAP('First paragraph here.\n\nSecond.', '')); click_text(page, 'First', 2)
        run_cmd(page, 'insert-chart'); settle(page, 300)
        d = page.get_by_role('dialog', name='Chart', exact=True)
        bb = d.bounding_box()
        check('Chart\'s dialog fits the width and scrolls' + tag, bb and bb['x'] >= 0 and bb['x'] + bb['width'] <= w + 1 and bb['y'] + bb['height'] <= h + 1, bb)
        d.get_by_role('button', name='OK', exact=True).tap(); settle(page, 300)
        check('and OK by tap writes the chart' + tag, '\\begin{axis}' in src(page))
        check('the page never scrolls sideways' + tag, page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))
        check('no page errors' + tag, not errs, errs[:3])
        br.close()


# ---- R3: the border's weight and colour, a free turn, a drawing's points, a chart's grid again, the
# wrap's text flow, a picture dragged ------------------------------------------------------------------
BORDERED = lambda pre='': WRAP(CENTER().replace('\\includegraphics[width=0.5\\linewidth]{a.png}', '{\\setlength{\\fboxsep}{0pt}' + pre + '\\fbox{\\includegraphics[width=0.5\\linewidth]{a.png}}}'))
SHAPE = '\\begin{center}\n\\begin{tikzpicture}\n\\draw[thick, draw=blue!60!black, fill=blue!20] (0,0) rectangle (3,2);\n\\end{tikzpicture}\n\\end{center}\n'
CHART = '\\begin{center}\n\\begin{tikzpicture}\n\\begin{axis}[ybar, width=0.8\\linewidth, height=6cm, ymin=0, symbolic x coords={A,B}, xtick=data]\n\\addplot coordinates {(A,4.3) (B,2.5)};\n\\end{axis}\n\\end{tikzpicture}\n\\end{center}\n'
TIKZPRE = '\\usepackage{graphicx}\n\\usepackage{tikz}\n\\usepackage{pgfplots}\n\\pgfplotsset{compat=1.18}\n'


def r3_objects(page):
    asset(page)
    # P7: the border's weight and colour, by the round trip rule; hand written forms come off whole
    roundtrip(page, DOC, sel_pic(), fn('picture-border-weight', {'weight': '1.5pt'}), BORDERED('\\setlength{\\fboxrule}{1.5pt}'), label='Border Weight 1.5 pt', off_command='picture-border',
              forms=(BORDERED('\\setlength{\\fboxrule}{2pt}\\color{blue}'), BORDERED('\\color[HTML]{1F4E79}\\setlength{\\fboxrule}{3pt}')))
    load_doc(page, BORDERED('\\setlength{\\fboxrule}{1.5pt}')); sel_pic()(page)
    h0 = page.evaluate('window.rikuy.hist.length')
    run_cmd(page, 'picture-border-color', {'color': 'red'})
    want = BORDERED('\\setlength{\\fboxrule}{1.5pt}\\color{red}').replace('\\usepackage{graphicx}\n', '\\usepackage{graphicx}\n\\usepackage{xcolor}\n')
    check('Border Color red: \\color{red} before the \\fbox, xcolor once, one step', src(page) == want and page.evaluate('window.rikuy.hist.length') == h0 + 1, body(page))
    settle(page, 300)
    st = page.evaluate("(() => { const i = document.querySelector('#pages .y-fbox.pic .a-img'), c = getComputedStyle(i); return [c.borderTopColor, parseFloat(c.borderTopWidth) / parseFloat(c.getPropertyValue('--pt')), getComputedStyle(i.closest('.y-fbox')).color]; })()")
    check('the page draws the border in the red it draws \\color{red} in, 1.5 pt wide', st[0] == st[2] and st[0] != 'rgb(0, 0, 0)' and abs(st[1] - 1.5) < 0.3, st)
    run_cmd(page, 'picture-border-weight', {'weight': None}); run_cmd(page, 'picture-border-color', {'color': None})
    check('Automatic weight and colour take their lines off, the frame stays', src(page) == BORDERED().replace('\\usepackage{graphicx}\n', '\\usepackage{graphicx}\n\\usepackage{xcolor}\n'), body(page))
    box = page.locator('#pages .a-img').bounding_box()
    page.mouse.click(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2, button='right'); settle(page, 250)
    items = page.evaluate("[...document.querySelectorAll('.pop [role^=menuitem]')].map((x) => x.getAttribute('aria-label'))")
    check('the picture\'s right click menu: Border Weight and Border Color', 'Border Weight' in items and 'Border Color' in items, items)
    page.get_by_role('menuitem', name='Border Weight', exact=True).click(); settle(page, 200)
    page.get_by_role('menuitemcheckbox', name='3 pt', exact=True).click(); settle(page, 250)
    check('and Weight › 3 pt writes \\fboxrule 3pt', '\\setlength{\\fboxrule}{3pt}\\fbox' in src(page), body(page))
    # a free turn: the round handle dragged a quarter round, Shift in steps of 15°
    for shift, label in ((False, 'by the mouse'), (True, 'with Shift')):
        load_doc(page, DOC); sel_pic()(page); settle(page, 200)
        r = page.evaluate("(() => { const h = document.querySelector('.pic-frame .pic-rot'), f = document.querySelector('.pic-frame').getBoundingClientRect(), b = h.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2, f.x + f.width / 2, f.y + f.height / 2]; })()")
        cx, cy = r[2], r[3]; rad = cy - r[1]
        page.mouse.move(r[0], r[1]); page.mouse.down()
        if shift: page.keyboard.down('Shift')
        import math
        for k in range(1, 9):
            a = math.radians(-90 + 40 * k / 8)
            page.mouse.move(cx + rad * math.cos(a), cy + rad * math.sin(a))
        page.mouse.up()
        if shift: page.keyboard.up('Shift')
        settle(page, 300)
        m = re.search(r'angle=(-?\d+)', src(page))
        ang = int(m.group(1)) if m else None
        check('a free turn %s: the handle 40° clockwise writes angle=%s (one step), as TeX turns it' % (label, ang), ang is not None and (ang == -45 if shift else abs(ang + 40) <= 2) and src(page).replace(m.group(0) if m else '', '').count('angle') == 0, body(page))
        page.evaluate('window.rikuy.undo()'); settle(page, 150)
        check('and one undo gives the bytes back (%s)' % label, src(page) == DOC)
    # I12: a drawing's point dragged writes its coordinate; Escape gives up
    D2 = WRAP('Intro.\n\n' + SHAPE + '\nAfter.', TIKZPRE)
    load_doc(page, D2); settle(page, 300)
    box = page.evaluate("(() => { const e = document.querySelector('#pages .raw.drawn svg.tz'); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()")
    page.mouse.click(box[0] + box[2] / 2, box[1] + box[3] / 2); settle(page, 300)
    hs = page.evaluate("[...document.querySelectorAll('.shape-layer .shape-h')].filter((h) => !h.hidden).map((h) => [parseFloat(h.style.left), parseFloat(h.style.top)])")
    check('a press on a drawing selects it: a handle on each of its points, no source box', len(hs) == 2 and not page.evaluate("!!(window.rikuy.pop && window.rikuy.pop.el.classList.contains('pop-raw'))"), hs)
    h0 = page.evaluate('window.rikuy.hist.length')
    px = page.evaluate('window.rikuy.layout.px')
    cm = 72.27 / 2.54 * px
    page.mouse.move(hs[1][0], hs[1][1]); page.mouse.down(); page.mouse.move(hs[1][0] + cm, hs[1][1] + cm / 2, steps=6); page.mouse.up(); settle(page, 400)
    m = re.search(r'rectangle \(([\d.]+),([\d.]+)\)', src(page))
    check('dragging its corner a centimetre right and half down writes (4,1.5) in place of (3,2), one step', m and abs(float(m.group(1)) - 4) < 0.08 and abs(float(m.group(2)) - 1.5) < 0.08 and src(page).replace(m.group(0), 'rectangle (3,2)') == D2 and page.evaluate('window.rikuy.hist.length') == h0 + 1, body(page))
    page.evaluate('window.rikuy.undo()'); settle(page, 200)
    check('one undo gives the drawing back', src(page) == D2)
    hs = page.evaluate("[...document.querySelectorAll('.shape-layer .shape-h')].filter((h) => !h.hidden).map((h) => [parseFloat(h.style.left), parseFloat(h.style.top)])")
    if hs:
        page.mouse.move(hs[0][0], hs[0][1]); page.mouse.down(); page.mouse.move(hs[0][0] + 30, hs[0][1] + 30, steps=4); page.keyboard.press('Escape'); page.mouse.up(); settle(page, 300)
    check('Escape while dragging a point writes nothing', src(page) == D2)
    page.keyboard.press('Escape')
    # a chart opened again in its grid
    D3 = WRAP('Intro.\n\n' + CHART + '\nAfter.', TIKZPRE)
    load_doc(page, D3); settle(page, 300)
    box = page.evaluate("(() => { const e = document.querySelector('#pages .raw.drawn svg.pgf'); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()")
    page.mouse.dblclick(box[0] + box[2] / 2, box[1] + box[3] / 2); settle(page, 300)
    vals = page.evaluate("[...document.querySelectorAll('.pop input.pd-cell')].slice(0, 12).map((i) => i.value)")
    check('a double click on a chart Rikuy made opens its grid again with its data (a click selects it: Chart Design)', vals[:4] == ['', 'Series 1', '', ''] and vals[4:6] == ['A', '4.3'], vals)
    h0 = page.evaluate('window.rikuy.hist.length')
    page.get_by_role('textbox', name='Row 2, series 1', exact=True).fill('7'); page.get_by_role('button', name='OK', exact=True).click(); settle(page, 300)
    check('OK writes the chart again in its place: (B,7), one step', src(page) == D3.replace('(B,2.5)', '(B,7)') and page.evaluate('window.rikuy.hist.length') == h0 + 1, body(page))
    page.evaluate('window.rikuy.undo()'); settle(page, 150)
    check('one undo gives the chart back', src(page) == D3)
    # the wrap's text flow: a wrapfigure's words beside it on the page
    D4 = WRAP('\\begin{wrapfigure}{r}{0.4\\linewidth}\n\\centering\n\\includegraphics[width=\\linewidth]{a.png}\n\\end{wrapfigure}\n' + 'Words beside the figure flow round it as TeX sets them. ' * 12 + '\n\nNext paragraph.', '\\usepackage{graphicx}\n\\usepackage{wrapfig}\n')
    load_doc(page, D4); settle(page, 500)
    st = page.evaluate("""(() => { const w = document.querySelector('#pages .wrap-in'); if (!w) return null; const p = w.parentElement, r = w.getBoundingClientRect(), q = p.getBoundingClientRect();
      const sp = [...p.querySelectorAll('span.t')]; const first = sp[0].getClientRects()[0], rects = sp.flatMap((x) => [...x.getClientRects()]); const below = rects.filter((x) => x.top > r.bottom + 2);
      return { float: getComputedStyle(w).float, para: p.classList.contains('p'), w: r.width / q.width, beside: first.right < r.left + 1, full: below.length > 0 && Math.max(...below.map((x) => x.right)) > r.left + 10 }; })()""")
    check('a wrapfigure drawn as wrapfig sets it: at the right of the paragraph after it, the words beside it, then the whole line again under it', st and st['float'] == 'right' and st['para'] and abs(st['w'] - 0.4) < 0.03 and st['beside'] and st['full'], st)
    # a picture dragged: its center to after the last paragraph, one step; among words to another word
    D5 = WRAP(CENTER() + '\n\nLast words here.')
    load_doc(page, D5); sel_pic()(page); settle(page, 200)
    a = page.evaluate("(() => { const r = document.querySelector('#pages .a-img').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()")
    t = page.evaluate("(() => { const p = [...document.querySelectorAll('#pages .it.p')].find((x) => x.textContent.includes('Last words')); const r = p.getBoundingClientRect(); return [r.x + 30, r.y + r.height * 0.8]; })()")
    h0 = page.evaluate('window.rikuy.hist.length')
    page.mouse.move(a[0], a[1]); page.mouse.down(); page.mouse.move(a[0] + 20, a[1] + 20, steps=3); page.mouse.move(t[0], t[1], steps=6)
    mark = page.evaluate("!document.querySelector('.move-mark').hidden")
    page.mouse.up(); settle(page, 400)
    want = WRAP('Before it here.\n\nAfter it here.\n\nLast words here.\n\n\\begin{center}\n\\includegraphics[width=0.5\\linewidth]{a.png}\n\\end{center}\n')
    check('a selected picture dragged below the last paragraph moves there with its center, a line showing where; one step', src(page) == want and mark and page.evaluate('window.rikuy.hist.length') == h0 + 1, body(page))
    check('and it stays selected there', page.evaluate("!!(window.rikuy.armed && window.rikuy.armed.kind === 'img')"))
    page.evaluate('window.rikuy.undo()'); settle(page, 150)
    check('one undo gives the bytes back', src(page) == D5, body(page))
    D6 = WRAP('Alpha \\includegraphics[height=1em]{a.png} beta gamma.')
    load_doc(page, D6); sel_pic()(page); settle(page, 200)
    a = page.evaluate("(() => { const r = document.querySelector('#pages .a-img').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()")
    t = page.evaluate("(() => { const s = [...document.querySelectorAll('#pages span.t')].find((x) => x.textContent.includes('gamma')); const r = document.createRange(); const i = s.textContent.indexOf('gamma'); r.setStart(s.firstChild, i); r.setEnd(s.firstChild, i + 1); const b = r.getBoundingClientRect(); return [b.x + 0.5, b.y + b.height / 2]; })()")
    page.mouse.move(a[0], a[1]); page.mouse.down(); page.mouse.move(a[0] + 15, a[1], steps=3); page.mouse.move(t[0], t[1], steps=6); page.mouse.up(); settle(page, 400)
    check('a picture among words dragged before another word moves there', src(page) == WRAP('Alpha  beta \\includegraphics[height=1em]{a.png}gamma.'), body(page))


def word_box(page, word):
    return page.evaluate("""(w) => { const sp = [...document.querySelectorAll('#pages span.t')].find((x) => x.textContent.includes(w)); const r = document.createRange(); const i = sp.textContent.indexOf(w);
      r.setStart(sp.firstChild, i); r.setEnd(sp.firstChild, i + w.length); const b = r.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; }""", word)


def r3_review(page):
    """The review of fc36bf5: H3 a wrapfigure taken out is no longer drawn, also before the text's first
    paragraph; H4 a wrapped paragraph breaks across pages below its figure, never past a sheet; M5 a
    figure taller than its paragraph goes on beside the next; M4 a figure taken from a paragraph's
    middle leaves it one paragraph; L1 a picture dropped on a list goes before or after the whole list,
    where the line is drawn."""
    asset(page)
    P2 = '\\usepackage{graphicx}\n\\usepackage{wrapfig}\n'
    fig = '\\begin{wrapfigure}{r}{0.4\\linewidth}\n\\centering\n\\includegraphics[width=\\linewidth]{a.png}\n\\caption{FIGCAP}\n\\end{wrapfigure}\n'
    D = WRAP(fig + 'Alpha words beside the figure. ' * 4 + '\n\nSecond paragraph here.', P2)
    load_doc(page, D); settle(page, 400)
    s = src(page); a = s.index('\\begin{wrapfigure}'); e = s.index('\\end{wrapfigure}') + len('\\end{wrapfigure}') + 1
    page.evaluate('([a, e]) => { const g = window.rikuy; g.commit([{ f: "main.tex", s: a, e, t: "" }], { f: "main.tex", p: a }); }', [a, e]); settle(page, 400)
    check('H3: a wrapfigure deleted before the first paragraph is no longer drawn in it', not page.evaluate("document.getElementById('pages').textContent.includes('FIGCAP') || !!document.querySelector('#pages .wrap-in, #pages .has-wrap')"))
    long = ' '.join(['Lorem ipsum dolor sit amet consectetur adipiscing elit sed do.'] * 140)
    D4 = WRAP('Intro paragraph.\n\n' + fig + long + '\n\nSecond paragraph here.', P2)
    load_doc(page, D4); settle(page, 800)
    r = page.evaluate("""() => { const out = []; for (const pg of document.querySelectorAll('#pages .page')) { const pr = pg.getBoundingClientRect(); for (const it of pg.querySelectorAll('.it.p')) { const q = it.getBoundingClientRect(); out.push([Math.round(pr.top), Math.round(pr.bottom), Math.round(q.top), Math.round(q.bottom), it.textContent.slice(0, 12), !!it.querySelector('.wrap-in')]); } } return out; }""")
    over = [x for x in r if x[3] > x[1] + 1]
    first = [x for x in r if x[5]]
    pieces = [x for x in r if 'Intro' not in x[4] and 'Second' not in x[4]]
    check('H4: the wrapped paragraph starts on page 1 with its figure and goes on over the next pages; nothing runs past a sheet', not over and first and first[0][0] == r[0][0] and len(pieces) >= 2 and pieces[0][5], (over, r[:6]))
    tall = '\\begin{wrapfigure}{r}{0.4\\textwidth}\n\\centering\\includegraphics[height=6cm]{a.png}\n\\end{wrapfigure}\n'
    D5 = WRAP(tall + 'Short first paragraph beside the figure, two lines at most here.\n\n' + 'Second paragraph words flow on and on here. ' * 12, P2)
    load_doc(page, D5); settle(page, 600)
    st = page.evaluate("""() => { const w = document.querySelector('#pages .wrap-in'), f = w.getBoundingClientRect(); const p2 = [...document.querySelectorAll('#pages .it.p')].find((x) => x.textContent.includes('Second paragraph')); const sp = p2.querySelector('span.t'); const q = sp.getClientRects()[0];
      return { gap: Math.round(p2.getBoundingClientRect().top - w.parentElement.getBoundingClientRect().bottom), beside: q.right < f.left + 1 && q.top < f.bottom, ghost: p2.classList.contains('has-ghost') }; }""")
    check('M5: a figure taller than its paragraph goes on beside the next one, no blank under the first', st['beside'] and st['ghost'] and st['gap'] < 20, st)
    # N4: ArrowLeft at the start of that paragraph goes to the end of the one before, past the empty float
    p2 = page.evaluate("(() => { const p = [...document.querySelectorAll('#pages .it.p')].find((x) => x.textContent.includes('Second paragraph')); const r = document.createRange(); const t = p.querySelector('span.t').firstChild; r.setStart(t, 0); r.collapse(true); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); return true; })()")
    page.keyboard.press('ArrowLeft'); page.keyboard.type('L'); settle(page, 300)
    check('N4: ArrowLeft from a paragraph beside the empty float reaches the paragraph before', 'most here.L' in src(page), body(page)[:240])
    # N1: around a wrapfigure every paragraph stays drawn: its caption typed in, its width changed, it deleted first, undo
    words = ['Alpha words', 'Second paragraph', 'Third one']
    D8 = WRAP(fig + 'Alpha words beside the figure. ' * 6 + '\n\nSecond paragraph here. ' * 1 + '\n\nThird one here.', P2)
    missing = lambda ws: page.evaluate("(ws) => { const t = [...document.querySelectorAll('#pages .page')].map((p) => p.textContent).join(' '); return ws.filter((w) => !t.includes(w)); }", ws)
    load_doc(page, D8); settle(page, 500)
    cap = word_box(page, 'FIGCAP')
    page.mouse.click(cap[0] + cap[2] / 2, cap[1] + cap[3] / 2); page.keyboard.type('QR'); settle(page, 500)
    check('N1: letters typed in a wrapfigure\'s caption: the caption and every paragraph stay drawn', not missing(words + ['FIG']) and page.evaluate("document.querySelector('#pages').textContent.includes('Q')") and 'Q' in src(page), (missing(words + ['FIG']), body(page)[:200]))
    load_doc(page, D8); settle(page, 400)
    s = src(page); a = s.index('{0.4\\linewidth}')
    page.evaluate('([a]) => { window.rikuy.commit([{ f: "main.tex", s: a + 1, e: a + 4, t: "0.3" }], { f: "main.tex", p: a }); }', [a]); settle(page, 500)
    check('N1: a wrapfigure\'s width changed: the figure and every paragraph stay drawn', not missing(words + ['FIGCAP']), missing(words + ['FIGCAP']))
    load_doc(page, D8); settle(page, 400)
    s = src(page); a = s.index('\\begin{wrapfigure}'); e = s.index('\\end{wrapfigure}') + len('\\end{wrapfigure}') + 1
    page.evaluate('([a, e]) => { window.rikuy.commit([{ f: "main.tex", s: a, e, t: "" }], { f: "main.tex", p: a }); }', [a, e]); settle(page, 500)
    gone = missing(words)
    page.evaluate('window.rikuy.undo()'); settle(page, 500)
    check('N1: a wrapfigure first in the text deleted: every paragraph stays drawn; undo brings the figure back, drawn', not gone and not missing(words + ['FIGCAP']) and src(page) == D8, (gone, missing(words + ['FIGCAP'])))
    # M4: a figure from a paragraph's middle
    D6 = WRAP('Joined part one\n\\begin{figure}[h]\n\\centering\n\\includegraphics[width=0.3\\linewidth]{a.png}\n\\end{figure}\njoined part two.\n\nBottom para.')
    load_doc(page, D6); sel_pic()(page); settle(page, 200)
    a = page.evaluate("(() => { const r = document.querySelector('#pages .a-img').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()")
    t = page.evaluate("(() => { const p = [...document.querySelectorAll('#pages .it.p')].find((x) => x.textContent.includes('Bottom para')); const r = p.getBoundingClientRect(); return [r.x + 30, r.y + r.height * 0.8]; })()")
    page.mouse.move(a[0], a[1]); page.mouse.down(); page.mouse.move(a[0] + 20, a[1] + 20, steps=3); page.mouse.move(t[0], t[1], steps=6); page.mouse.up(); settle(page, 400)
    check('M4: a figure taken from a paragraph\'s middle leaves it one paragraph', 'Joined part one\njoined part two.' in src(page) and body(page).rstrip().endswith('\\end{figure}'), body(page))
    # L1: dropped on a list's lower half: after the whole list, where the line is drawn
    D7 = WRAP(CENTER() + '\n\n\\begin{itemize}\n\\item One\n\\item Two\n\\item Three\n\\end{itemize}\n\nLast.')
    load_doc(page, D7); sel_pic()(page); settle(page, 200)
    a = page.evaluate("(() => { const r = document.querySelector('#pages .a-img').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()")
    t = page.evaluate("(() => { const p = [...document.querySelectorAll('#pages .it')].find((x) => x.textContent.includes('Three')); const r = p.getBoundingClientRect(); return [r.x + 30, r.y + r.height * 0.7]; })()")
    page.mouse.move(a[0], a[1]); page.mouse.down(); page.mouse.move(a[0] + 20, a[1] + 20, steps=3); page.mouse.move(t[0], t[1], steps=6)
    line = page.evaluate("(() => { const m = document.querySelector('.move-mark').getBoundingClientRect(); const l = [...document.querySelectorAll('#pages .it')].find((x) => x.textContent.includes('Three')).getBoundingClientRect(); return Math.abs(m.top - l.bottom) < 3; })()")
    page.mouse.up(); settle(page, 400)
    b = body(page)
    check('L1: dropped on a list\'s last item, the picture goes after the whole list, where the line was drawn', line and b.index('\\end{itemize}') < b.index('\\begin{center}') < b.index('Last.'), (line, b))
    # (merge with R1) \hfill beside a wrapped figure, and beside what is left of it, stretches to the
    # figure's side, not under it; on a landscape page the figure still wraps
    D9 = WRAP(tall + 'Lefta\\hfill Righta\n\nLeftb\\hfill Rightb', P2)
    load_doc(page, D9); settle(page, 600)
    st = page.evaluate("""() => { const f = document.querySelector('#pages .wrap-in').getBoundingClientRect(), out = {};
      for (const w of ['Righta', 'Rightb']) { const s = [...document.querySelectorAll('#pages span.t')].find((x) => x.textContent.includes(w)); const q = s.getClientRects()[0]; out[w] = [Math.round(q.right), Math.round(q.top)]; }
      return { left: Math.round(f.left), bottom: Math.round(f.bottom), ...out }; }""")
    check('merge: \\hfill beside a wrapped figure and beside its empty float ends at the figure, on the first line', all(st[w][0] <= st['left'] + 1 and st[w][0] > st['left'] - 40 and st[w][1] < st['bottom'] for w in ('Righta', 'Rightb')), st)
    # M7 (check of the merge 7f3f269): a fill row in the strip under a right hand figure, inside its
    # bottom margin, is still set beside it, as one line, as TeX sets it
    rows = ''.join('Left%d \\hfill Right%d\\\\\n' % (i, i) for i in range(14))
    load_doc(page, WRAP('\\begin{wrapfigure}{r}{4cm}\n\\centering\n\\includegraphics[width=\\linewidth]{a.png}\n\\end{wrapfigure}\n' + rows + 'End.', P2)); settle(page, 600)
    st = page.evaluate("""() => { const w = document.querySelector('#pages .wrap-in'), f = w.getBoundingClientRect(), mb = parseFloat(getComputedStyle(w).marginBottom) || 0;
      const box = (t) => { const s = [...document.querySelectorAll('#pages span.t')].find((x) => x.textContent.includes(t)); const r = document.createRange(); const i = s.textContent.indexOf(t); r.setStart(s.firstChild, i); r.setEnd(s.firstChild, i + t.length); return r.getBoundingClientRect(); };
      const rows = []; for (let i = 0; i < 14; i++) { const l = box('Left' + i), r = box('Right' + i); rows.push([i, Math.round(l.top), Math.round(r.top), Math.round(l.bottom), Math.round(r.right)]); }
      return { left: Math.round(f.left), bottom: f.bottom, mb, rows }; }""")
    split = [r for r in st['rows'] if r[1] != r[2]]
    strip = [r for r in st['rows'] if st['bottom'] - 0.5 < r[1] < st['bottom'] + st['mb']]
    check('M7: every \\hfill row beside a right hand wrapfigure is one line; a row in its bottom margin ends at the figure', not split and all(r[4] <= st['left'] + 1 for r in strip), (split, strip, st['left'], st['bottom']))
    load_doc(page, WRAP('\\begin{landscape}\n' + fig + 'Alpha words beside the figure. ' * 6 + '\n\\end{landscape}', P2 + '\\usepackage{pdflscape}\n')); settle(page, 600)
    check('merge: a wrapfigure on a landscape page (R1) wraps its paragraph', page.evaluate("!!document.querySelector('#pages .page.land .has-wrap > .wrap-in')"), body(page)[:200])


def r3_compiled(page):
    """With dist/tex: a picture with a red 1.5 pt border turned 30° by the handle, a moved drawing, a chart
    written again and a wrapfigure, on pdfLaTeX, XeLaTeX and LuaLaTeX; the turned box in the PDF as on the page."""
    if not os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        print('SKIP R3 pictures compiled in the page: no TeX tree in %s' % DIST)
        return
    asset(page)
    pre = TIKZPRE + '\\usepackage{wrapfig}\n\\usepackage{xcolor}\n'
    body_ = ('\\begin{center}\n{\\setlength{\\fboxsep}{0pt}\\setlength{\\fboxrule}{1.5pt}\\color{red}\\fbox{\\includegraphics[width=0.4\\linewidth,angle=30]{a.png}}}\n\\end{center}\n\n'
             + SHAPE.replace('(3,2)', '(4.12,1.5)') + '\n' + CHART.replace('(B,2.5)', '(B,7)') + '\n'
             + '\\begin{wrapfigure}{r}{0.3\\linewidth}\n\\centering\n\\includegraphics[width=\\linewidth]{a.png}\n\\end{wrapfigure}\n' + 'Words beside it. ' * 30)
    for eng in ('pdflatex', 'xelatex', 'lualatex'):
        doc = ('% !TEX program = ' + eng + '\n' if eng != 'pdflatex' else '') + WRAP(body_, pre)
        r = compile_pdf(page, doc)
        # (spaces aside: the pypdf CI pins, 5.9.0, reads XeLaTeX's kerned "Wo" as "W o")
        check('R3 pictures compile with %s: a coloured, weighted border on a picture turned 30°, a moved drawing, a chart written again, a wrapfigure' % eng, r['ok'] and not r['problems'] and 'Wordsbesideit' in re.sub(r'\s', '', pdf_text(r)), (r['problems'], pdf_text(r)[:200]))
    one = WRAP('\\begin{center}\n\\includegraphics[width=0.4\\linewidth,angle=30]{a.png}\n\\end{center}')
    rr = compile_pdf(page, one)
    settle(page, 500)
    drawn = page.evaluate("(() => { const s = document.querySelector('#pages .a-img'), r = s.getBoundingClientRect(), px = window.rikuy.layout.px; return [r.width / px, r.height / px]; })()")
    box = pdf_image_box(base64.b64decode(rr['pdf'])) if rr['ok'] else None
    check('TeX agrees on a free turn: angle=30 takes %s pt in the PDF and %s pt on the page' % (box and [round(v, 1) for v in box], [round(v, 1) for v in drawn]), box and abs(box[0] - drawn[0]) < 2.5 and abs(box[1] - drawn[1]) < 2.5, (box, drawn))


def r3_phones(p):
    """On a phone (390 and 360 px, touch): the round handle a 44 px target that a finger turns; a tap on a
    drawing gives its points 44 px handles and a finger moves one; a finger drags a selected picture."""
    for w, h in ((390, 844), (360, 740)):
        br, page, errs = open_page(p, w, h, touch=True)
        tag = ' (%d px, touch)' % w
        try:
            asset(page)
            load_doc(page, DOC); settle(page, 500)
            sel_pic()(page); settle(page, 300)
            hit = page.evaluate("(() => { const h = document.querySelector('.pic-frame .pic-rot'), b = getComputedStyle(h, '::before'); return [parseFloat(b.width), parseFloat(b.height), !!h.offsetParent]; })()")
            check('the round handle is there, a 44 px target' + tag, hit[0] >= 44 and hit[1] >= 44 and hit[2], hit)
            r = page.evaluate("(() => { const h = document.querySelector('.pic-frame .pic-rot').getBoundingClientRect(), f = document.querySelector('.pic-frame').getBoundingClientRect(); return [h.x + h.width / 2, h.y + h.height / 2, f.x + f.width / 2, f.y + f.height / 2]; })()")
            cdp = page.context.new_cdp_session(page)
            import math
            cx, cy, rad = r[2], r[3], r[3] - r[1]
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': r[0], 'y': r[1]}]})
            for k in range(1, 9):
                a = math.radians(-90 - 30 * k / 8)
                cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': cx + rad * math.cos(a), 'y': cy + rad * math.sin(a)}]})
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); settle(page, 400)
            m = re.search(r'angle=(-?\d+)', src(page))
            check('a finger turns the picture 30° the other way: angle=%s' % (m and m.group(1)) + tag, m and abs(int(m.group(1)) - 30) <= 2, body(page))
            load_doc(page, WRAP('Intro.\n\n' + SHAPE + '\nAfter.', TIKZPRE)); settle(page, 400)
            box = page.evaluate("(() => { const e = document.querySelector('#pages .raw.drawn svg.tz'); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()")
            page.touchscreen.tap(box[0] + box[2] / 2, box[1] + box[3] / 2); settle(page, 400)
            hs = page.evaluate("[...document.querySelectorAll('.shape-layer .shape-h')].filter((h) => !h.hidden).map((h) => [parseFloat(h.style.left), parseFloat(h.style.top), parseFloat(getComputedStyle(h, '::before').width)])")
            check('a tap on a drawing gives each point a 44 px handle' + tag, len(hs) == 2 and all(x[2] >= 44 for x in hs), hs)
            if hs:
                x0, y0 = hs[1][0], hs[1][1]
                cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x0, 'y': y0}]})
                for k in range(1, 7): cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x0 - 3 * k, 'y': y0 + 3 * k}]})
                cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); settle(page, 400)
                check('and a finger moves the point: its coordinate written' + tag, 'rectangle (3,2)' not in src(page) and re.search(r'rectangle \([\d.]+,[\d.]+\)', src(page)), body(page))
            load_doc(page, WRAP(CENTER() + '\n\nLast words here.')); settle(page, 400)
            sel_pic()(page); settle(page, 300)
            a = page.evaluate("(() => { const e = document.querySelector('#pages .a-img'); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()")
            t = page.evaluate("(() => { const p = [...document.querySelectorAll('#pages .it.p')].find((x) => x.textContent.includes('Last words')); const r = p.getBoundingClientRect(); return [r.x + 30, r.y + r.height * 0.8]; })()")
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': a[0], 'y': a[1]}]})
            for k in range(1, 9): cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': a[0] + (t[0] - a[0]) * k / 8, 'y': a[1] + (t[1] - a[1]) * k / 8}]})
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); settle(page, 500)
            check('a finger drags a selected picture below the last paragraph' + tag, body(page).strip().endswith('\\end{center}') and body(page).index('Last words') < body(page).index('\\begin{center}'), body(page))
            check('no sideways scroll' + tag, page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))
            shots = os.environ.get('RIKUY_SHOTS', '/tmp/R3-shots'); os.makedirs(shots, exist_ok=True)
            load_doc(page, DOC); settle(page, 400); sel_pic()(page); settle(page, 300)
            page.screenshot(path=os.path.join(shots, 'r3-picture-%d.png' % w))
        except Exception as e:
            check('r3_phones runs to its end' + tag, False, repr(e)[:300])
        br.close()


def run():
    with sync_playwright() as p:
        browser, page, errors = open_page(p)
        asset(page)
        names = sys.argv[1:]
        for f in (selecting, trips, sizing, tools, drawing, objects, reviewed, compiled, r3_objects, r3_review, r3_compiled):
            if names and f.__name__ not in names:
                continue
            try: f(page)
            except Exception as e: check(f.__name__ + ' runs to its end', False, str(e)[:400])
        check('no page errors', not [e for e in errors if 'tree.wasm' not in e and 'TeX' not in e], errors[:4])
        browser.close()
        if not names or 'phones' in names:
            try: phones(p)
            except Exception as e: check('phones runs to its end', False, str(e)[:400])
        if not names or 'r3_phones' in names:
            r3_phones(p)
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    run()
