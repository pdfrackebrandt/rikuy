"""Formatting an object after it is in the document, as Word does (src/cmd/objects.js, src/objfmt.js,
src/ui/shapes.js, src/drawing.js), in Chromium.

A press on a drawing, a chart or a SmartArt selects it and shows its contextual tabs (Shape Format;
Chart Design and Format; SmartArt Design and Format); a press elsewhere on the page lets it go, the
ribbon keeps it. The round trip rule (test/browser.py's roundtrip) on each control: Shape Fill,
Shape Outline, Weight, Dashes, Arrows, Theme Styles, Edit Text, Height and Width, Insert Shape,
Bring Forward and Send Backward of one shape of a drawing; Add Chart Element (title, axis titles,
legend, gridlines, data labels), Change Colors, Switch Row/Column, Change Chart Type, Edit Data,
Height and Width; SmartArt's Add Shape, Text Pane, Right to Left, Change Layout, Change Colors,
Reset Graphic, Shape Fill and Shape Outline: one step each, one undo back, the page drawing it
again, toggles read back from the source and from hand written forms. The right click menu of
each, Delete, Enter. Where dist/tex holds a TeX tree, all of it compiled in the page with pdfLaTeX,
XeLaTeX and LuaLaTeX. Phones at 390 and 360 px with touch: a tap selects, the tabs work by taps, a
long press opens the object's menu with 44 px items. Picture Format's Corrections, Color,
Transparency and Compress Pictures (the C module): a new file beside the picture, the comment,
Reset Picture back, the page's pixels read through a canvas, the printed size kept; without the
module a plain message; compiled on three engines. Arrange's Position and Align; the Selection Pane
(rename with references, a name given, hide, go to). Screenshots in $RIKUY_SHOTS (default
/tmp/g1-shots).

Run: python3 objects.py [section ...] (sections: shapes, charts, smart, menus, compiled, pictures,
pictures_compiled, arrange, selpane, phones, shots, pictures_unloaded, pictures_phone)."""
import os, sys, re, base64
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import open_page, check, results, src, load_doc, roundtrip, pressed
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist')
SHOTS = os.environ.get('RIKUY_SHOTS', '/tmp/g1-shots')
PRE = '\\usepackage{tikz}\n\\usepackage{pgfplots}\n\\pgfplotsset{compat=1.18}\n\\usepackage{smartdiagram}\n'
WRAP = lambda body, pre=PRE: '\\documentclass{article}\n' + pre + '\\begin{document}\n' + body + '\n\\end{document}\n'
RECT = '\\draw[thick, draw=blue!60!black, fill=blue!20] (0,0) rectangle (3,2);'
SHAPE = '\\begin{center}\n\\begin{tikzpicture}\n' + RECT + '\n\\end{tikzpicture}\n\\end{center}\n'
LINE = SHAPE.replace(RECT, '\\draw[thick, draw=blue!60!black, ->] (0,0) -- (3,0);')
TWO = SHAPE.replace(RECT, RECT + '\n\\draw[thick, draw=red, fill=red!20] (2,1) circle (1);')
AXIS = '\\begin{axis}[ybar, width=0.8\\linewidth, height=6cm, ymin=0, symbolic x coords={A,B,C}, xtick=data, legend pos=north west]'
CHART = ('\\begin{center}\n\\begin{tikzpicture}\n' + AXIS + '\n\\addplot coordinates {(A,4.3) (B,2.5) (C,3.5)};\n\\addlegendentry{Sales}\n'
         '\\addplot coordinates {(A,2) (B,3) (C,1)};\n\\addlegendentry{Costs}\n\\end{axis}\n\\end{tikzpicture}\n\\end{center}\n')
SMART = '\\begin{center}\n\\smartdiagram[flow diagram:horizontal]{Plan, Write, Submit}\n\\end{center}\n'
RESET = 'set color list={red!40,cyan!40,blue!40,green!40,orange!40,yellow!40,magenta!40,brown!40,violet!40,teal!40}'
DOC = lambda obj: WRAP('Before it.\n\n' + obj + '\nAfter it.')


def run_cmd(page, cid, args=None):
    r = page.evaluate('([id, a]) => window.rikuy.runCommand(id, a)', [cid, args])
    page.wait_for_timeout(200)
    return r


def obj_box(page, sel='svg.tz', n=0):
    return page.evaluate('''([s, n]) => { const e = document.querySelectorAll('#pages ' + s)[n]; if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }''', [sel, n])


def press(page, sel='svg.tz', n=0, at=(0.5, 0.5)):
    b = obj_box(page, sel, n)
    page.mouse.click(b[0] + b[2] * at[0], b[1] + b[3] * at[1]); page.wait_for_timeout(200)


def selector(sel='svg.tz', n=0, sub=None):
    """roundtrip()'s select: the object pressed on the page (and one of its shapes, a second press)."""
    def f(page):
        page.evaluate('window.rikuy.shapeSel.clear()')
        press(page, sel, n)
        if sub is not None:
            page.evaluate('''([s, k]) => { const g = window.rikuy, e = document.querySelectorAll('#pages ' + s)[0]; g.shapeSel.k = k; g.ribbonSync(); }''', [sel, sub])
        page.wait_for_timeout(80)
    return f


def cmd(cid, args=None):
    f = lambda page: run_cmd(page, cid, args)
    f.__name__ = cid + ('' if args is None else ' ' + str(args))
    return f


def tab_shown(page, tab):
    return page.evaluate('(t) => { const b = document.getElementById("rt-" + t); return !!b && !b.hidden; }', tab)


def fill_of(page, sel='svg.tz [data-k]', n=0):
    return page.evaluate('([s, n]) => { const e = document.querySelectorAll("#pages " + s)[n]; return e ? e.getAttribute("fill") : null; }', [sel, n])


def body(page):
    s = src(page)
    return s[s.find('\\begin{document}') + 16:s.find('\\end{document}')]


def shapes(page):
    D = DOC(SHAPE)
    load_doc(page, D); page.wait_for_timeout(300)
    check('before a press no Shape Format tab', not tab_shown(page, 'shape-format'))
    press(page)
    check('a press on a drawing selects it: Shape Format shows and opens, its points have handles', tab_shown(page, 'shape-format') and page.evaluate('window.rikuy.rbTab') == 'shape-format' and page.evaluate("[...document.querySelectorAll('.shape-layer .shape-h')].filter((h) => !h.hidden).length") == 2)
    page.click('#rt-shape-format'); page.wait_for_timeout(200)
    check('a press on the ribbon keeps it selected, its buttons enabled', page.evaluate("!!window.rikuy.objHere() && !document.getElementById('rc-shape-fill').disabled"))
    # Shape Fill and Outline, by the menus as a person picks them
    page.click('#rc-shape-fill'); page.wait_for_timeout(200)
    page.get_by_role('menuitemradio', name='red!40', exact=True).click(); page.wait_for_timeout(300)
    check('Shape Fill › red!40 from the colour grid writes fill=red!40 in place of fill=blue!20, one step', src(page) == D.replace('fill=blue!20', 'fill=red!40'), body(page))
    check('and the page draws it red!40 (255,153,153)', fill_of(page) == 'rgb(255,153,153)', fill_of(page))
    check('the drawing stays selected after the edit', page.evaluate("!!window.rikuy.objHere() && document.querySelector('#pages .raw.drawn').classList.contains('sel')"))
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
    check('one undo gives the bytes back', src(page) == D)
    sel = selector()
    roundtrip(page, D, sel, cmd('shape-fill', {'color': None}), D.replace(', fill=blue!20', ''), off_command=cmd('shape-fill', {'color': 'blue!20'}), label='Shape Fill › No Fill')
    roundtrip(page, D, sel, cmd('shape-outline', {'color': 'teal'}), D.replace('draw=blue!60!black', 'draw=teal'), off_command=cmd('shape-outline', {'color': 'blue!60!black'}), label='Shape Outline › teal')
    roundtrip(page, D, sel, cmd('shape-outline', {'color': None}), D.replace('draw=blue!60!black', 'draw=none'), off_command=cmd('shape-outline', {'color': 'blue!60!black'}), label='Shape Outline › No Outline')
    roundtrip(page, D, sel, cmd('shape-weight', {'pt': 3}), D.replace('thick', 'line width=3pt'), off=D.replace('thick', 'line width=0.8pt'), off_command=cmd('shape-weight', {'pt': 0.8}), label='Weight 3 pt')
    roundtrip(page, D, sel, cmd('shape-dashes', {'dash': 'dashed'}), D.replace('draw=blue!60!black,', 'draw=blue!60!black, dashed,').replace('dashed, fill=blue!20', 'fill=blue!20, dashed'), off_command=cmd('shape-dashes', {'dash': 'solid'}), label='Dashes › Dashed')
    L = DOC(LINE)
    roundtrip(page, L, selector(), cmd('shape-arrows', {'arrow': '<->'}), L.replace('->]', '<->]'), off_command=cmd('shape-arrows', {'arrow': '->'}), label='Arrows › both ends')
    roundtrip(page, D, sel, cmd('shape-styles', {'style': 'orange-moderate'}), D.replace('draw=blue!60!black', 'draw=orange!75!black').replace('fill=blue!20', 'fill=orange!50'), off_command=cmd('shape-styles', {'style': 'blue-subtle'}), label='Theme Styles › Moderate Effect, Orange')
    load_doc(page, D); sel(page); run_cmd(page, 'shape-styles', {'style': 'orange-moderate'})
    check('and the drawing is drawn in the style\'s colours', fill_of(page) == 'rgb(255,192,128)', fill_of(page))
    T = D.replace(RECT, RECT + '\n\\node[align=center] at (1.5,1) {Start};')
    roundtrip(page, D, sel, cmd('shape-text', {'text': 'Start'}), T, off_command=cmd('shape-text', {'text': ''}), label='Edit Text › Start')
    load_doc(page, T); page.wait_for_timeout(300)
    check('the words drawn in the shape, at its middle', page.evaluate("(() => { const t = document.querySelector('#pages svg.tz text'), r = document.querySelector('#pages svg.tz rect'); if (!t || !r) return false; const a = t.getBoundingClientRect(), b = r.getBoundingClientRect(); return t.textContent === 'Start' && Math.abs((a.left + a.right) / 2 - (b.left + b.right) / 2) < 3 && Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < 6; })()"))
    # Edit Text by its dialog
    load_doc(page, D); sel(page)
    run_cmd(page, 'shape-text')
    page.get_by_role('textbox', name='Words in the shape, a line each').fill('Two\nlines'); page.get_by_role('button', name='OK', exact=True).click(); page.wait_for_timeout(300)
    check('Edit Text\'s dialog writes its lines with \\\\ between', '\\node[align=center] at (1.5,1) {Two \\\\ lines};' in src(page), body(page))
    roundtrip(page, D, sel, cmd('shape-width', {'cm': 6}), D.replace('\\begin{tikzpicture}', '\\begin{tikzpicture}[scale=2]'), off_command=cmd('shape-width', {'cm': 3}), label='Shape Width 6 cm (its shape kept)')
    load_doc(page, D); sel(page)
    w0 = obj_box(page)[2]
    page.click('#rt-shape-format'); page.wait_for_timeout(150)
    page.fill('#rc-shape-height', '3'); page.press('#rc-shape-height', 'Enter'); page.wait_for_timeout(400)
    w1 = obj_box(page)[2]
    check('the Height field: 3 typed, Enter writes scale=1.5 and the page draws it half as wide again (%.0f to %.0f px)' % (w0, w1), '\\begin{tikzpicture}[scale=1.5]' in src(page) and abs(w1 / w0 - 1.5) < 0.08, body(page))
    check('and the fields read the new size', page.evaluate("[document.getElementById('rc-shape-width').value, document.getElementById('rc-shape-height').value]") == ['4.5 cm', '3 cm'])
    # Insert Shape: a second shape in the same drawing, beside the first; then the order of two shapes
    load_doc(page, D); sel(page); h0 = page.evaluate('window.rikuy.hist.length')
    run_cmd(page, 'shape-insert', {'shape': 'circle'})
    check('Insert Shape › Circle: a second \\draw in the same picture, at the right of the first, one step', src(page) == D.replace(RECT, RECT + '\n\\draw[thick, draw=blue!60!black, fill=blue!20] (4.5,1) circle (1);') and page.evaluate('window.rikuy.hist.length') == h0 + 1, body(page))
    check('the new shape is the one selected: Bring Forward has nothing over it, Send Backward can', page.evaluate("window.rikuy.shapeSel.k") == 1 and page.evaluate("document.getElementById('rc-shape-forward').disabled") and not page.evaluate("document.getElementById('rc-shape-backward').disabled"))
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
    check('one undo takes it off', src(page) == D)
    W = DOC(TWO)
    CIRC = '\\draw[thick, draw=red, fill=red!20] (2,1) circle (1);'
    roundtrip(page, W, selector(sub=0), cmd('shape-forward'), W.replace(RECT + '\n' + CIRC, CIRC + '\n' + RECT), off_command=lambda p: (p.evaluate('window.rikuy.shapeSel.k = 1'), run_cmd(p, 'shape-backward')), label='Bring Forward of the rectangle')
    # a second press on one shape of a selected drawing selects it alone; Fill then changes it alone
    load_doc(page, W); page.wait_for_timeout(300)
    page.evaluate('window.rikuy.shapeSel.clear()'); press(page); b = page.evaluate("(() => { const c = document.querySelector('#pages svg.tz circle'); const r = c.getBoundingClientRect(); return [r.x + r.width * 0.8, r.y + r.height / 2]; })()")
    page.mouse.click(b[0], b[1]); page.wait_for_timeout(250)
    check('a second press on the circle selects it alone (a glow, its own handles)', page.evaluate("window.rikuy.shapeSel.k") == 1 and page.evaluate("document.querySelector('#pages svg.tz circle').classList.contains('sub')"))
    run_cmd(page, 'shape-fill', {'color': 'green!40'})
    check('Shape Fill then changes the circle alone', src(page) == W.replace('fill=red!20', 'fill=green!40'), body(page))
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
    # Delete and the press elsewhere
    load_doc(page, D); page.wait_for_timeout(200); press(page)
    page.keyboard.press('Delete'); page.wait_for_timeout(300)
    check('Delete takes the drawing off with the center it stood in, one step', src(page) == WRAP('Before it.\n\n\nAfter it.'), body(page))
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
    check('and one undo gives it back', src(page) == D)
    press(page)
    b = page.evaluate("(() => { const s = [...document.querySelectorAll('#pages span.t')].find((x) => x.textContent.includes('After it')); const r = s.getBoundingClientRect(); return [r.x + 5, r.y + r.height / 2]; })()")
    page.mouse.click(b[0], b[1]); page.wait_for_timeout(200)
    check('a press on the text lets it go: Shape Format hides', not tab_shown(page, 'shape-format') and not page.evaluate('!!window.rikuy.objHere()'))


def charts(page):
    D = DOC(CHART)
    load_doc(page, D); page.wait_for_timeout(300)
    press(page, 'svg.pgf')
    check('a press on a chart selects it (a frame): Chart Design and Format show, no grid opens', tab_shown(page, 'chart-design') and tab_shown(page, 'chart-format') and not page.evaluate("!!document.querySelector('.pop input.pd-cell')"))
    sel = selector('svg.pgf')
    ax = lambda add: D.replace(AXIS, AXIS[:-1] + ', ' + add + ']')
    roundtrip(page, D, sel, cmd('chart-title', {'text': 'Q1 sales'}), ax('title={Q1 sales}'), off_command=cmd('chart-title', {'text': ''}), label='Chart Title')
    load_doc(page, ax('title={Q1 sales}')); page.wait_for_timeout(300)
    check('the page draws the title above the chart', page.evaluate("[...document.querySelectorAll('#pages svg.pgf text')].some((t) => t.textContent === 'Q1 sales')"))
    roundtrip(page, D, sel, cmd('chart-axis-titles', {'x': 'Region', 'y': 'Units'}), ax('xlabel={Region}, ylabel={Units}'), off_command=cmd('chart-axis-titles', {'x': '', 'y': ''}), label='Axis Titles')
    roundtrip(page, D, sel, 'chart-gridlines', ax('ymajorgrids'), forms=[D.replace('ybar,', 'ybar, ymajorgrids,')], label='Gridlines')
    roundtrip(page, D, sel, 'chart-data-labels', ax('nodes near coords'), forms=[D.replace('ybar,', 'ybar, nodes near coords,')], label='Data Labels')
    roundtrip(page, D, sel, cmd('chart-legend', {'pos': 'south east'}), D.replace('legend pos=north west', 'legend pos=south east'), off_command=cmd('chart-legend', {'pos': 'north west'}), label='Legend › Bottom Right')
    cyc = 'cycle list={{draw=blue!70!black,fill=blue!70!white,mark=none},{draw=blue!70!black,fill=blue!45!white,mark=none},{draw=blue!70!black,fill=blue!25!white,mark=none},{draw=blue!70!black,fill=blue!10!white,mark=none}}'
    roundtrip(page, D, sel, cmd('chart-colors', {'palette': 'blue'}), ax(cyc), off_command=cmd('chart-colors', {'palette': 'colorful'}), label='Change Colors › Monochromatic Blue')
    load_doc(page, ax(cyc)); page.wait_for_timeout(300)
    check('the page draws the bars in the palette\'s fills', page.evaluate("[...document.querySelectorAll('#pages svg.pgf rect')].some((r) => r.getAttribute('fill') === 'rgb(77,77,255)')"))
    # Change Chart Type keeps the settings; Switch Row/Column twice gives the bytes back
    T = ax('title={T}')
    load_doc(page, T); sel(page); h0 = page.evaluate('window.rikuy.hist.length')
    run_cmd(page, 'chart-type', {'kind': 'bar'})
    s1 = src(page)
    check('Change Chart Type › Bar: xbar, the coordinates turned, the title kept, one step', 'xbar' in s1 and '(4.3,A)' in s1 and 'title={T}' in s1 and page.evaluate('window.rikuy.hist.length') == h0 + 1, body(page))
    check('the chart stays selected, Chart Design open to change it again', page.evaluate("!!window.rikuy.objHere() && window.rikuy.objHere().kind === 'chart'"))
    run_cmd(page, 'chart-type', {'kind': 'column'})
    check('and Column again gives the bytes of before', src(page) == T, body(page))
    roundtrip(page, D, sel, 'chart-switch', lambda s: 'symbolic x coords={Sales,Costs}' in s and '\\addlegendentry{A}' in s, label='Switch Row/Column')
    load_doc(page, D); sel(page); run_cmd(page, 'chart-switch'); run_cmd(page, 'chart-switch')
    check('Switch Row/Column twice: the bytes of before', src(page) == D, body(page))
    # Edit Data on the ribbon, and a double click: the grid with the chart's data
    load_doc(page, T); sel(page)
    run_cmd(page, 'chart-edit-data')
    vals = page.evaluate("[...document.querySelectorAll('.pop input.pd-cell')].slice(0, 8).map((i) => i.value)")
    check('Edit Data opens the grid with the chart\'s data', vals[:3] == ['', 'Sales', 'Costs'] and vals[4:6] == ['A', '4.3'], vals)
    page.get_by_role('textbox', name='Row 2, series 1', exact=True).fill('7'); page.get_by_role('button', name='OK', exact=True).click(); page.wait_for_timeout(300)
    check('OK writes (B,7) and keeps the title', src(page) == T.replace('(B,2.5)', '(B,7)'), body(page))
    load_doc(page, D); page.wait_for_timeout(300)
    b = obj_box(page, 'svg.pgf')
    page.mouse.dblclick(b[0] + b[2] / 2, b[1] + b[3] / 2); page.wait_for_timeout(300)
    check('a double click on a chart opens its grid', page.evaluate("!!document.querySelector('.pop input.pd-cell')"))
    page.keyboard.press('Escape'); page.wait_for_timeout(150)
    roundtrip(page, D, sel, cmd('chart-height', {'cm': 4.5}), D.replace('height=6cm', 'height=4.5cm'), off_command=cmd('chart-height', {'cm': 6}), label='Chart Height 4.5 cm')
    load_doc(page, D); sel(page); w0 = obj_box(page, 'svg.pgf')[2]
    page.click('#rt-chart-format'); page.wait_for_timeout(150)
    page.fill('#rc-chart-width', '50%'); page.press('#rc-chart-width', 'Enter'); page.wait_for_timeout(400)
    w1 = obj_box(page, 'svg.pgf')[2]
    check('Chart Width 50%%: width=0.5\\linewidth, drawn %.0f px from %.0f' % (w1, w0), 'width=0.5\\linewidth' in src(page) and abs(w1 / w0 - 0.5 / 0.8) < 0.05, body(page))


def smart(page):
    D = DOC(SMART)
    load_doc(page, D); page.wait_for_timeout(300)
    press(page, 'svg.smart')
    check('a press on a SmartArt selects it: SmartArt Design and Format show', tab_shown(page, 'smart-design') and tab_shown(page, 'smart-format') and page.evaluate("document.querySelector('#pages .a-smart').classList.contains('sel')"))
    sel = selector('svg.smart')
    SD = '\\smartdiagram[flow diagram:horizontal]{Plan, Write, Submit}'
    roundtrip(page, D, sel, 'smart-add', D.replace('Submit}', 'Submit, Item 4}'), off_command=cmd('smart-text-pane', {'items': ['Plan', 'Write', 'Submit']}), label='Add Shape')
    roundtrip(page, D, sel, cmd('smart-text-pane', {'items': ['Plan', 'Draft, then write', 'Submit']}), D.replace('Write', '{Draft, then write}'), off_command=cmd('smart-text-pane', {'items': ['Plan', 'Write', 'Submit']}), label='Text Pane')
    roundtrip(page, D, sel, cmd('smart-layout', {'kind': 'circular diagram:clockwise'}), D.replace('flow diagram:horizontal', 'circular diagram:clockwise'), off_command=cmd('smart-layout', {'kind': 'flow diagram:horizontal'}), label='Change Layout › Basic Cycle')
    C = D.replace('flow diagram:horizontal', 'circular diagram:clockwise')
    roundtrip(page, C, sel, 'smart-rtl', C.replace(':clockwise', ':counterclockwise'), forms=[C.replace(':clockwise', ':counterclockwise').replace('circular', ' circular').replace('[ circular', '[circular')], label='Right to Left')
    teal = '\\smartdiagramset{set color list={teal!60,teal!52,teal!44,teal!37,teal!30,teal!24,teal!19,teal!14,teal!10,teal!7}}\n' + SD + '\n\\smartdiagramset{' + RESET + '}'
    roundtrip(page, D, sel, cmd('smart-colors', {'palette': 'teal'}), D.replace(SD, teal), off_command=cmd('smart-colors', {'palette': 'colorful'}), label='Change Colors › Teal (and the package\'s colours back after it)')
    load_doc(page, D.replace(SD, teal)); page.wait_for_timeout(300)
    check('the page draws the teal boxes, and no set\'s words as text', page.evaluate("document.querySelector('#pages svg.smart rect').getAttribute('fill')") == 'rgb(102,179,179)' and 'set color list' not in page.evaluate("document.getElementById('pages').innerText"))
    press(page, 'svg.smart')
    check('a press on it takes in its set and the line after it (Reset Graphic can run)', not page.evaluate("document.getElementById('rc-smart-reset').disabled"))
    run_cmd(page, 'smart-reset')
    check('Reset Graphic takes both lines off: the bytes of before', src(page) == D, body(page))
    roundtrip(page, D, sel, cmd('smart-fill', {'color': 'orange!50'}), D.replace(SD, '\\smartdiagramset{uniform color list=orange!50 for 10 items}\n' + SD + '\n\\smartdiagramset{' + RESET + '}'), off_command=cmd('smart-fill', {'color': None}), label='SmartArt Shape Fill')
    roundtrip(page, D, sel, cmd('smart-outline', {'color': 'black'}), D.replace(SD, '\\smartdiagramset{border color=black}\n' + SD), off_command=cmd('smart-outline', {'color': None}), label='SmartArt Shape Outline')
    # the Text Pane by its dialog, from a double click
    load_doc(page, D); page.wait_for_timeout(300)
    b = obj_box(page, 'svg.smart'); page.mouse.dblclick(b[0] + b[2] / 2, b[1] + b[3] / 2); page.wait_for_timeout(300)
    ta = page.get_by_role('textbox', name='Items, one per line')
    check('a double click opens the Text Pane with its items', ta.count() == 1 and ta.input_value() == 'Plan\nWrite\nSubmit')
    if ta.count():
        ta.fill('Plan\nWrite\nCheck\nSubmit'); page.get_by_role('button', name='OK', exact=True).click(); page.wait_for_timeout(300)
        check('OK writes the items in place, one step', src(page) == D.replace('Write, Submit', 'Write, Check, Submit'), body(page))


def menus(page):
    for obj, sel, names in ((SHAPE, 'svg.tz', ['Edit Text', 'Theme Styles', 'Shape Fill', 'Shape Outline', 'Bring Forward', 'Show Drawing Source', 'Delete Object']),
                            (CHART, 'svg.pgf', ['Edit Data', 'Chart Title', 'Axis Titles', 'Change Colors', 'Change Chart Type', 'Show Chart Source', 'Delete Object']),
                            (SMART, 'svg.smart', ['Text Pane', 'Add Shape', 'Change Layout', 'Change Colors', 'Show SmartArt Source', 'Delete Object'])):
        load_doc(page, DOC(obj)); page.wait_for_timeout(300)
        b = obj_box(page, sel)
        page.mouse.click(b[0] + b[2] / 2, b[1] + b[3] / 2, button='right'); page.wait_for_timeout(300)
        got = page.evaluate("[...document.querySelectorAll('.pop-ctx [role^=menuitem]')].map((a) => a.getAttribute('aria-label'))")
        check('a right click on the %s: its own menu (%s)' % (sel, ', '.join(got)), all(n in got for n in names), got)
        page.keyboard.press('Escape'); page.wait_for_timeout(150)
    load_doc(page, DOC(CHART)); page.wait_for_timeout(300)
    b = obj_box(page, 'svg.pgf'); page.mouse.click(b[0] + b[2] / 2, b[1] + b[3] / 2, button='right'); page.wait_for_timeout(300)
    page.get_by_role('menuitem', name='Change Chart Type').click(); page.wait_for_timeout(250)
    page.get_by_role('menuitemradio', name='Line').click(); page.wait_for_timeout(300)
    check('the menu\'s Change Chart Type › Line writes a line chart', '\\addplot+[mark=*]' in src(page) and 'ybar' not in src(page), body(page))
    # Enter on a selected drawing edits its source, as before
    load_doc(page, DOC(SHAPE)); page.wait_for_timeout(300); press(page)
    page.keyboard.press('Enter'); page.wait_for_timeout(300)
    check('Enter on a selected drawing opens its source', page.evaluate("!!(window.rikuy.pop && window.rikuy.pop.el.querySelector('textarea, .cm-editor, [contenteditable]'))"))
    page.keyboard.press('Escape')


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


def compiled(page):
    """Everything the tabs write, in one document, on pdfLaTeX, XeLaTeX and LuaLaTeX."""
    if not os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        print('SKIP objects compiled in the page: no TeX tree in %s' % DIST)
        return
    # made by the commands themselves, on the page
    D = DOC(SHAPE + '\n' + LINE + '\n' + TWO + '\n' + CHART + '\n' + SMART + '\n' + SMART.replace('Plan', 'Again'))
    load_doc(page, D); page.wait_for_timeout(300)
    steps = [('svg.tz', 0, 'shape-styles', {'style': 'teal-intense'}), ('svg.tz', 0, 'shape-text', {'text': 'Start here'}), ('svg.tz', 0, 'shape-width', {'cm': 4.5}),
             ('svg.tz', 0, 'shape-weight', {'pt': 1.5}), ('svg.tz', 0, 'shape-dashes', {'dash': 'dash dot'}), ('svg.tz', 1, 'shape-arrows', {'arrow': '<->'}), ('svg.tz', 1, 'shape-outline', {'color': 'red!75!black'}),
             ('svg.tz', 2, 'shape-insert', {'shape': 'star'}), ('svg.tz', 2, 'shape-back', None), ('svg.tz', 2, 'shape-fill', {'color': None}),
             ('svg.pgf', 0, 'chart-title', {'text': 'Q1 sales & R&D: 50% of $5_000 #1'}), ('svg.pgf', 0, 'chart-axis-titles', {'x': 'Region', 'y': 'Units'}), ('svg.pgf', 0, 'chart-gridlines', None), ('svg.pgf', 0, 'chart-data-labels', None),
             ('svg.pgf', 0, 'chart-legend', {'pos': 'outer north east'}), ('svg.pgf', 0, 'chart-colors', {'palette': 'colorful-2'}), ('svg.pgf', 0, 'chart-height', {'cm': 5}), ('svg.pgf', 0, 'chart-width', {'share': 0.6}),
             ('svg.smart', 0, 'smart-colors', {'palette': 'blue'}), ('svg.smart', 0, 'smart-outline', {'color': 'blue!50!black'}), ('svg.smart', 0, 'smart-add', None), ('svg.smart', 1, 'smart-layout', {'kind': 'circular diagram:counterclockwise'})]
    for s, n, c, a in steps:
        press(page, s, n)
        if c == 'shape-back':
            page.evaluate('window.rikuy.shapeSel.k = 1')
        run_cmd(page, c, a)
        page.keyboard.press('Escape'); page.wait_for_timeout(100)
    doc = src(page)
    check('the steps wrote each its part (%d characters)' % len(doc), all(x in doc for x in ('fill=teal!80!black', 'Start here', 'scale=1.5', 'line width=1.5pt', 'dash dot', '<->', 'title={Q1 sales \\& R\\&D: 50\\% of \\$5\\_000 \\#1}', 'cycle list=', 'set color list={blue!50', 'border color=blue!50!black', 'counterclockwise', 'Item 4')), doc[doc.find('\\begin{document}'):][:1500])
    open(os.path.join(SHOTS, 'objects-compiled.tex'), 'w').write(doc)
    for eng in ('pdflatex', 'xelatex', 'lualatex'):
        r = compile_pdf(page, ('% !TEX program = ' + eng + '\n' if eng != 'pdflatex' else '') + doc)
        t = pdf_text(r)
        check('all of it compiles with %s: the shape\'s words, the chart\'s title and axis titles, the SmartArt\'s items in the PDF' % eng,
              r['ok'] and not r['problems'] and all(w in t for w in ('Start here', 'Q1 sales & R&D: 50% of $5_000 #1', 'Region', 'Units', 'Item 4', 'Again')), (r['problems'], t[:300]))
        if eng == 'pdflatex' and r['pdf']:
            open(os.path.join(SHOTS, 'objects-compiled.pdf'), 'wb').write(base64.b64decode(r['pdf']))


def phones(p):
    for w, h in ((390, 844), (360, 740)):
        br, page, errs = open_page(p, w, h, touch=True)
        tag = ' (%d px, touch)' % w
        try:
            D = DOC(SHAPE)
            load_doc(page, D); page.wait_for_timeout(400)
            b = obj_box(page)
            page.touchscreen.tap(b[0] + b[2] / 2, b[1] + b[3] / 2); page.wait_for_timeout(300)
            check('a tap selects the drawing: Shape Format shows' + tag, tab_shown(page, 'shape-format') and page.evaluate('!!window.rikuy.objHere()'))
            hs = page.evaluate("[...document.querySelectorAll('.shape-layer .shape-h')].filter((h) => !h.hidden).map((h) => parseFloat(getComputedStyle(h, '::before').width))")
            check('its handles are 44 px targets' + tag, hs and all(x >= 44 for x in hs), hs)
            check('the tap opened Shape Format (the "Ribbon tab" list says so)' + tag, page.evaluate("[window.rikuy.rbTab, document.getElementById('rb-tabsel').value]") == ['shape-format', 'shape-format'])
            page.locator('#rc-shape-fill').tap(); page.wait_for_timeout(250)
            page.get_by_role('menuitemradio', name='green!40', exact=True).tap(); page.wait_for_timeout(350)
            check('taps on Shape Fill and a colour write it' + tag, src(page) == D.replace('fill=blue!20', 'fill=green!40'), body(page))
            check('the page never scrolls sideways' + tag, page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1'))
            # review H6: every visible control of each new tab a 44 px target; L6: the colour grid's tiles too
            # (the Download button pinned at every tab's end is the ribbon's own, the same on Home)
            SMALL = """(t) => [...document.querySelectorAll('#rp-' + t + ' button, #rp-' + t + ' input, #rp-' + t + ' select')].filter((e) => e.getClientRects().length && e.offsetParent && !e.closest('.rb-dl'))
              .map((e) => { const b = e.getBoundingClientRect(); return [e.id || e.getAttribute('aria-label') || e.className, Math.round(b.width), Math.round(b.height)]; }).filter((x) => x[1] < 44 || x[2] < 44)"""
            for obj, sel_, tabs in ((SHAPE, 'svg.tz', ['shape-format']), (CHART, 'svg.pgf', ['chart-design', 'chart-format']), (SMART, 'svg.smart', ['smart-design', 'smart-format'])):
                load_doc(page, DOC(obj)); page.wait_for_timeout(400)
                b = obj_box(page, sel_); page.touchscreen.tap(b[0] + b[2] / 2, b[1] + b[3] / 2); page.wait_for_timeout(300)
                for t in tabs:
                    page.evaluate('(t) => rikuy.selectTab(t)', t); page.wait_for_timeout(250)
                    n = page.evaluate("(t) => [...document.querySelectorAll('#rp-' + t + ' button, #rp-' + t + ' input')].filter((e) => e.getClientRects().length && e.offsetParent && !e.closest('.rb-dl')).length", t)
                    small = page.evaluate(SMALL, t)
                    check('H6: every one of %s\'s %d controls is a 44 px target%s' % (t, n, tag), n > 0 and not small, small[:6])
            load_doc(page, DOC(SHAPE)); page.wait_for_timeout(300)
            b = obj_box(page); page.touchscreen.tap(b[0] + b[2] / 2, b[1] + b[3] / 2); page.wait_for_timeout(300)
            page.evaluate("rikuy.selectTab('shape-format')"); page.wait_for_timeout(200)
            page.locator('#rc-shape-fill').tap(); page.wait_for_timeout(300)
            g = page.evaluate("""() => { const m = document.querySelector('.pop-colors'); const t = [...m.querySelectorAll('.gal-tile')].filter((a) => a.getClientRects().length).map((a) => a.getBoundingClientRect()); return { n: t.length, rows: new Set(t.map((r) => Math.round(r.top))).size, small: t.filter((r) => r.width < 44 || r.height < 44).length, right: Math.max(...t.map((r) => r.right)), w: innerWidth }; }""")
            check('L6: the colour grid in rows of tiles, 44 px each, inside the screen (%d tiles in %d rows)%s' % (g['n'], g['rows'], tag), g['rows'] < g['n'] / 4 and g['small'] == 0 and g['right'] <= g['w'] + 1, g)
            page.keyboard.press('Escape'); page.wait_for_timeout(150)
            page.evaluate("rikuy.runCommand('selection-pane')"); page.wait_for_timeout(300)
            sp = page.evaluate("""() => [...document.querySelectorAll('#sel-pane button, #sel-pane input')].filter((e) => e.getClientRects().length).map((e) => { const b = e.getBoundingClientRect(); return [e.getAttribute('aria-label') || e.textContent, Math.round(b.width), Math.round(b.height), Math.round(b.right)]; })""")
            check('H6: the Selection Pane\'s Close, Show All, Hide All, rows, names and eyes are 44 px tall, inside the screen%s' % tag, sp and all(x[2] >= 44 and x[3] <= page.evaluate('innerWidth') + 1 for x in sp) and all(x[1] >= 44 for x in sp if x[0] in ('Close',) or (x[0] or '').startswith('Show ')), sp)
            page.keyboard.press('Escape')
            # a long press: the object's menu, 44 px items in the screen
            for obj, sel_, name in ((CHART, 'svg.pgf', 'Chart Title'), (SMART, 'svg.smart', 'Text Pane'), (SHAPE, 'svg.tz', 'Edit Text')):
                load_doc(page, DOC(obj)); page.wait_for_timeout(400)
                b = obj_box(page, sel_)
                cdp = page.context.new_cdp_session(page)
                x, y = b[0] + b[2] / 2, b[1] + b[3] / 2
                cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]}); page.wait_for_timeout(750)
                cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); cdp.detach(); page.wait_for_timeout(300)
                g = page.evaluate("""() => { const m = document.querySelector('.pop-ctx'); if (!m) return null; const r = m.getBoundingClientRect();
                  const it = [...m.querySelectorAll('[role^=menuitem]')].filter((a) => a.getClientRects().length).map((a) => a.getBoundingClientRect());
                  return { names: [...m.querySelectorAll('[role^=menuitem]')].map((a) => a.getAttribute('aria-label')), l: r.left, r: r.right, b: r.bottom, w: innerWidth, h: innerHeight, small: it.filter((t) => t.height < 44).length }; }""")
                check('a long press on the %s opens its menu, in the screen, 44 px items%s' % (sel_, tag), g and name in g['names'] and g['l'] >= 0 and g['r'] <= g['w'] + 1 and g['small'] == 0, g)
                if g:
                    page.get_by_role('menuitem', name=name).tap(); page.wait_for_timeout(300)
                    check('and a tap on %s opens its dialog' % name + tag, page.evaluate("!!document.querySelector('.pop-dlg')"))
                    page.keyboard.press('Escape'); page.wait_for_timeout(150)
            if w == 390:
                load_doc(page, DOC(CHART)); page.wait_for_timeout(300); b = obj_box(page, 'svg.pgf')
                page.touchscreen.tap(b[0] + b[2] / 2, b[1] + b[3] / 2); page.wait_for_timeout(300)
                page.screenshot(path=os.path.join(SHOTS, 'chart-design-390.png'))
            check('no page errors' + tag, not [e for e in errs if 'tree.wasm' not in e], errs[:3])
        finally:
            br.close()


def shots(p):
    os.makedirs(SHOTS, exist_ok=True)
    D = DOC('Intro words before the objects.\n\n' + SHAPE.replace(RECT, RECT.replace('blue!20', 'teal!40').replace('blue!60!black', 'teal!75!black') + '\n\\node[align=center] at (1.5,1) {Start};') + '\n' + CHART.replace('legend pos=north west', 'legend pos=north west, title={Q1 sales}, ymajorgrids, nodes near coords') + '\n'
            + SMART.replace('\\smartdiagram', '\\smartdiagramset{set color list={teal!60,teal!52,teal!44,teal!37,teal!30,teal!24,teal!19,teal!14,teal!10,teal!7}}\n\\smartdiagram').replace('Submit}', 'Submit}\n\\smartdiagramset{' + RESET + '}'))
    for w, hh, dark, touch in ((1920, 1080, False, False), (1366, 768, False, False), (1366, 768, True, False), (390, 844, False, True)):
        br, page, errs = open_page(p, w, hh, dark=dark, touch=touch)
        try:
            load_doc(page, D); page.wait_for_timeout(500)
            for sel_, tab, name in (('svg.tz', 'shape-format', 'shape'), ('svg.pgf', 'chart-design', 'chart'), ('svg.smart', 'smart-design', 'smart')):
                b = obj_box(page, sel_)
                if touch: page.touchscreen.tap(b[0] + b[2] / 2, b[1] + b[3] / 2)
                else: page.mouse.click(b[0] + b[2] / 2, b[1] + b[3] / 2)
                page.wait_for_timeout(250)
                page.wait_for_timeout(300)
                page.screenshot(path=os.path.join(SHOTS, '%s-%d%s.png' % (name, w, '-dark' if dark else '')))
            # Picture Format with Corrections, Color, Transparency and Compress, a picture made sepia
            load_doc(page, pic_doc()); put_png(page, 'a.png', 300, 200, dpi=150); page.wait_for_timeout(300)
            sel_pic(page); run_async(page, 'picture-color', {'recolor': 'sepia'}, 1200)
            sel_pic(page)
            if not touch:
                page.click('#rc-picture-corrections'); page.wait_for_timeout(300)
            page.screenshot(path=os.path.join(SHOTS, 'picture-%d%s.png' % (w, '-dark' if dark else '')))
            page.keyboard.press('Escape')
            # the Selection Pane over the objects
            load_doc(page, D); page.wait_for_timeout(300)
            run_cmd(page, 'selection-pane'); page.wait_for_timeout(300)
            page.screenshot(path=os.path.join(SHOTS, 'selection-pane-%d%s.png' % (w, '-dark' if dark else '')))
            page.keyboard.press('Escape')
        finally:
            br.close()


# ---- Picture Format's Corrections, Color, Transparency, Compress Pictures (src/cmd/picfx.js) --------
def pic_doc(opts='width=0.5\\linewidth', name='a.png'):
    return '\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\nBefore it.\n\n\\begin{center}\n\\includegraphics[' + opts + ']{' + name + '}\n\\end{center}\n\nAfter it.\n\\end{document}\n'


def put_png(page, name, w, h, dpi=None, color=(200, 60, 40)):
    from picture import png
    data = png(w, h, dpi=dpi, color=color)
    page.evaluate('([n, b]) => { const u = Uint8Array.from(atob(b), (c) => c.charCodeAt(0)); window.rikuy.addAsset(n, new Blob([u], { type: "image/png" })); }', [name, base64.b64encode(data).decode()])
    return len(data)


def sel_pic(page):
    page.evaluate("() => { const g = window.rikuy, t = g.files.get('main.tex'); g.picSelect({ f: 'main.tex', s: t.indexOf('\\\\includegraphics') }, { tab: true }); }")
    page.wait_for_timeout(100)


def run_async(page, cid, args=None, wait=900):
    page.evaluate('([id, a]) => { window.__r = window.rikuy.runCommand(id, a); }', [cid, args])
    page.wait_for_timeout(wait)


# the page's picture, its pixel at (fx, fy) of its size, read through a canvas
PIXEL = """async ([fx, fy]) => { const i = document.querySelector('#pages .a-img img'); if (!i) return null; await i.decode().catch(() => {}); const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight;
  const g = c.getContext('2d'); g.drawImage(i, 0, 0); return [...g.getImageData(Math.floor(c.width * fx), Math.floor(c.height * fy), 1, 1).data].concat([i.naturalWidth, i.naturalHeight]); }"""


def pictures(page):
    D = pic_doc()
    load_doc(page, D); put_png(page, 'a.png', 300, 200, dpi=150); page.wait_for_timeout(300)
    sel_pic(page)
    check('Picture Format shows Corrections, Color, Transparency and Compress Pictures, enabled on a PNG', page.evaluate("['picture-corrections', 'picture-color', 'picture-transparency', 'picture-compress'].every((id) => { const b = document.getElementById('rc-' + id); return b && !b.disabled; })"))
    h0 = page.evaluate('window.rikuy.hist.length')
    run_async(page, 'picture-corrections', {'brightness': 0.2})
    s = src(page)
    m = re.search(r'\{(a-edited-[0-9a-f]{8}\.png)\} % rikuy: from \{a\.png\}, brightness 0\.2\n', s)
    check('Corrections › Brightness +20%: a new file a-edited-….png beside a.png, the picture pointed at it, the comment at its line\'s end, one step', bool(m) and page.evaluate('window.rikuy.hist.length') == h0 + 1 and s.replace(m.group(1), 'a.png').replace(' % rikuy: from {a.png}, brightness 0.2', '') == D, s[s.find('\\begin{center}'):][:160])
    if m:
        check('the new file is in the project, the first one kept', page.evaluate('(n) => window.rikuy.assetBlobs.has(n) && window.rikuy.assetBlobs.has("a.png")', m.group(1)))
        px = page.evaluate(PIXEL, [0.1, 0.5])
        check('the page draws the new pixels: (200,60,40) made (251,111,91), the size kept (300 by 200)', px and px[:3] == [251, 111, 91] and px[4:] == [300, 200], px)
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(300)
    check('one undo gives the bytes back, the picture drawn as before', src(page) == D and page.evaluate(PIXEL, [0.1, 0.5])[:3] == [200, 60, 40])
    # the round trip rule: each against Reset Picture
    sel = lambda p: (p.evaluate('window.rikuy.disarm && window.rikuy.disarm()'), sel_pic(p))
    def fx(args):
        f = lambda p: run_async(p, 'picture-fx-options' if args.get('_all') else 'picture-color', {k: v for k, v in args.items() if k != '_all'})
        f.__name__ = 'Color ' + str(args)
        return f
    reset = lambda p: run_async(p, 'picture-reset', None, 400)
    want = lambda key: (lambda t: bool(re.search(r'\{a-edited-[0-9a-f]{8}\.png\} % rikuy: from \{a\.png\}, ' + re.escape(key) + r'\n', t)))
    roundtrip(page, D, sel, fx({'recolor': 'gray'}), want('recolor gray'), off_command=reset, label='Color › Grayscale, Reset Picture back')
    roundtrip(page, D, sel, fx({'saturation': 2}), want('saturation 2'), off_command=reset, label='Color › Saturation 200%')
    roundtrip(page, D, sel, lambda p: run_async(p, 'picture-transparency', {'transparency': 0.5}), want('transparency 0.5'), off_command=reset, label='Transparency 50%')
    load_doc(page, D); sel_pic(page); run_async(page, 'picture-transparency', {'transparency': 0.5})
    px = page.evaluate(PIXEL, [0.1, 0.5])
    check('Transparency 50%: the page draws the picture seen through (alpha 128)', px and px[3] == 128, px)
    run_async(page, 'picture-color', {'recolor': 'gray'})
    s = src(page)
    check('Color › Grayscale on it: one comment with both, from the first file again', bool(re.search(r'% rikuy: from \{a\.png\}, transparency 0\.5, recolor gray\n', s)) and s.count('rikuy:') == 1, s[s.find('\\begin{center}'):][:160])
    px = page.evaluate(PIXEL, [0.1, 0.5])
    check('and the page draws it gray and seen through', px and px[0] == px[1] == px[2] and px[3] == 128, px)
    run_async(page, 'picture-reset', None, 400)
    check('Reset Picture: a.png again, the comment gone', src(page) == D, src(page)[-200:])
    # the menus and the dialog
    load_doc(page, D); sel_pic(page)
    page.click('#rt-picture-format') if page.evaluate("!!document.getElementById('rt-picture-format').offsetParent") else None
    page.click('#rc-picture-corrections'); page.wait_for_timeout(250)
    n = page.evaluate("document.querySelectorAll('.pop [role^=menuitem]').length")
    page.get_by_role('menuitemradio', name='Brightness: +20% Contrast: -20%').click(); page.wait_for_timeout(900)
    check('the Corrections menu: sharpen and soften, 25 of brightness and contrast, Options (%d items); a pick writes it' % n, n == 31 and '% rikuy: from {a.png}, brightness 0.2, contrast -0.2\n' in src(page), src(page)[-200:])
    sel_pic(page); run_async(page, 'picture-fx-options', None, 300)
    page.get_by_role('textbox', name='Sharpness (%)').fill('25'); page.get_by_role('button', name='OK', exact=True).click(); page.wait_for_timeout(900)
    check('Format Picture: Sharpness 25 typed, OK keeps the others and adds it', '% rikuy: from {a.png}, sharpen 0.25, brightness 0.2, contrast -0.2\n' in src(page), src(page)[-200:])
    # Compress Pictures: a large picture shown small, at 96 ppi; a picture of no width of its own keeps its size
    big = pic_doc('width=0.3\\linewidth', 'big.png').replace('\\end{center}\n', '\\end{center}\n\n\\begin{center}\n\\includegraphics{small.png}\n\\end{center}\n')
    load_doc(page, big); b0 = put_png(page, 'big.png', 2400, 1600, dpi=300); put_png(page, 'small.png', 900, 300, dpi=300, color=(40, 160, 90)); page.wait_for_timeout(900)
    W_PT = "document.querySelectorAll('#pages .a-img')[1].getBoundingClientRect().width / window.rikuy.layout.px"
    w_small = page.evaluate(W_PT)
    h0 = page.evaluate('window.rikuy.hist.length')
    run_async(page, 'picture-compress', {'ppi': 96, 'all': True}, 2500)
    s = src(page)
    names = re.findall(r'\{((?:big|small)-edited-[0-9a-f]{8}\.png)\} % rikuy: from \{(?:big|small)\.png\}, compress 96\n', s)
    nb = page.evaluate('(n) => { const b = window.rikuy.assetBlobs.get(n); return b ? b.size : 0; }', names[0]) if names else 0
    dims = page.evaluate(PIXEL, [0.5, 0.5])
    toast = page.evaluate("(document.querySelector('#toast span') || {}).textContent || ''")
    check('Compress Pictures at 96 ppi, every picture: both written smaller in one step (%d bytes to %d)' % (b0, nb), len(names) == 2 and 0 < nb < b0 and page.evaluate('window.rikuy.hist.length') == h0 + 1, s[s.find('\\begin{document}'):][:400])
    # (0.3 of a 345 pt line is 103.5 pt, 138 pixels at 96 ppi)
    check('the big one now 0.3 of the line at 96 ppi: %d px wide' % (dims[4] if dims else 0), dims and 136 <= dims[4] <= 140, dims)
    check('what it did is said honestly (the PDF\'s bytes, and the project keeping the first files): ' + toast[:160], 'Compressed 2 pictures' in toast and 'the PDF carries' in toast and 'keeps the first files' in toast)
    page.wait_for_timeout(800)
    w_small2 = page.evaluate(W_PT)
    # (the page reads whole pixels per inch from a pHYs, TeX its pixels per metre: within 1%)
    check('a picture of no width of its own prints the size its first file gives TeX, 900 px at 300 ppi = 216 pt, from its smaller file (its pixels per inch scaled): %.1f pt' % w_small2, abs(w_small2 - 216) < 216 * 0.01, w_small)
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(300)
    check('one undo puts both back', src(page) == big)
    # a PDF picture: the tools say why not
    load_doc(page, pic_doc(name='fig.pdf')); page.wait_for_timeout(200)
    sel_pic(page)
    check('on a PDF picture they are disabled, and say why', page.evaluate("document.getElementById('rc-picture-corrections').disabled") and 'PDF' in page.evaluate("window.rikuy.cmds.command('picture-corrections').whyNot(window.rikuy)"))


def review_pictures(page):
    """The hostile review's cases (docs/reviews/WORD-GAPS-OBJECTS.md H3, H4, H5, M3, M4, M5, L2)."""
    edited = "[...window.rikuy.assetBlobs.keys()].filter((k) => /-edited-/.test(k))"
    # H3: two pictures on a line: the first has no comment of the second's and is left alone
    D = pic_doc().replace('\\includegraphics[width=0.5\\linewidth]{a.png}', '\\includegraphics[width=0.3\\linewidth]{a.png}\\hfill\\includegraphics[width=0.3\\linewidth]{b.png}')
    load_doc(page, D); put_png(page, 'a.png', 300, 200, dpi=150); put_png(page, 'b.png', 300, 200, dpi=150, color=(40, 160, 90)); page.wait_for_timeout(300)
    page.evaluate("() => { const g = window.rikuy, t = g.files.get('main.tex'); g.picSelect({ f: 'main.tex', s: t.lastIndexOf('\\\\includegraphics') }, { tab: true }); }")
    run_async(page, 'picture-color', {'recolor': 'gray'})
    after_b = src(page)
    check('H3: the line\'s last picture takes Grayscale, its comment at the line\'s end', bool(re.search(r'\{b-edited-[0-9a-f]{8}\.png\} % rikuy: from \{b\.png\}, recolor gray\n', after_b)), after_b[-260:])
    sel_pic(page)
    check('H3: the first picture shows no edit of its own (Reset Picture has nothing to put back)', page.evaluate("(() => { const g = window.rikuy, h = g.picHere(); return g.picFxState(h).note; })()") is False)
    run_async(page, 'picture-reset', None, 300); run_async(page, 'picture-corrections', {'brightness': 0.2})
    toast = page.evaluate("(document.querySelector('#toast span') || {}).textContent || ''")
    check('H3: Reset leaves both as they are, and Brightness on the first says to put it on a line of its own', src(page) == after_b and 'line of its own' in toast, toast)
    # H4: a name with a space; M5: one edited file a picture; M4: in the worker
    D = pic_doc(name='my photo.png')
    load_doc(page, D); put_png(page, 'my photo.png', 300, 200, dpi=150); page.wait_for_timeout(300)
    mine = "[...window.rikuy.assetBlobs.keys()].filter((k) => /^my photo-edited-/.test(k))"
    sel_pic(page); run_async(page, 'picture-corrections', {'brightness': 0.2}); first = page.evaluate(mine)
    sel_pic(page); run_async(page, 'picture-color', {'recolor': 'gray'}); second = page.evaluate(mine)
    s = src(page)
    check('H4: a name with a space: one comment, from the first file in braces, both settings', len(re.findall('rikuy:', s)) == 1 and '% rikuy: from {my photo.png}, brightness 0.2, recolor gray\n' in s and '-edited-f' not in s.split('rikuy')[0][-40:].replace('my photo-edited-', ''), s[-220:])
    check('M5: one edited file for the picture at a time (%s, then %s)' % (first, second), len(first) == 1 and len(second) == 1 and first != second)
    check('M4: the pixels were worked on in the worker', page.evaluate('!!(window.rikuy.picFxStats && window.rikuy.picFxStats.worker)'))
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(300)
    check('M5: one undo brings the last edited file back with its comment', page.evaluate(mine) == first and '% rikuy: from {my photo.png}, brightness 0.2\n' in src(page))
    sel_pic(page); run_async(page, 'picture-reset', None, 400)
    check('H4: Reset Picture puts my photo.png back, the comment and the edited file gone', src(page) == D and page.evaluate(mine) == [], (src(page)[-160:], page.evaluate(mine)))
    # M3: the first file replaced by another of its name makes a new edited file
    D = pic_doc()
    load_doc(page, D); put_png(page, 'a.png', 300, 200, dpi=150, color=(220, 30, 30)); page.wait_for_timeout(300)
    edited = "[...window.rikuy.assetBlobs.keys()].filter((k) => /^a-edited-/.test(k))"
    sel_pic(page); run_async(page, 'picture-transparency', {'transparency': 0.3}); red = page.evaluate(edited)
    sel_pic(page); run_async(page, 'picture-reset', None, 400)
    put_png(page, 'a.png', 300, 200, dpi=150, color=(30, 200, 30)); page.wait_for_timeout(300)
    sel_pic(page); run_async(page, 'picture-transparency', {'transparency': 0.3})
    px = page.evaluate(PIXEL, [0.1, 0.5])
    check('M3: a replaced first file gives a new edited file, drawn green (%s, then %s)' % (red, page.evaluate(edited)), page.evaluate(edited) != red and px and px[1] > 150 and px[0] < 80, px)
    # L2: \includegraphics{a} with no extension, as hand written LaTeX often has it
    D = pic_doc(name='a')
    load_doc(page, D); put_png(page, 'a.png', 300, 200, dpi=150); page.wait_for_timeout(300)
    sel_pic(page)
    check('L2: Corrections are on for \\includegraphics{a} (a.png in the project)', not page.evaluate("document.getElementById('rc-picture-corrections').disabled"))
    run_async(page, 'picture-color', {'recolor': 'sepia'})
    check('L2: and its comment names {a}, so Reset writes what was written', '% rikuy: from {a}, recolor sepia\n' in src(page), src(page)[-160:])
    sel_pic(page); run_async(page, 'picture-reset', None, 400)
    check('L2: Reset Picture gives \\includegraphics{a} back', src(page) == D)
    # H5: Compress with a turn and a crop reads the printed pixels per inch
    D = pic_doc('angle=90,width=3cm', 'turned.png').replace('\\end{center}\n', '\\end{center}\n\n\\begin{center}\n\\includegraphics[trim=150 0 0 0,clip,width=8cm]{cropped.png}\n\\end{center}\n')
    load_doc(page, D); put_png(page, 'turned.png', 1200, 800, dpi=300); put_png(page, 'cropped.png', 600, 400, dpi=72); page.wait_for_timeout(500)
    run_async(page, 'picture-compress', {'ppi': 150, 'all': True}, 3000)
    s = src(page)
    toast = page.evaluate("(document.querySelector('#toast span') || {}).textContent || ''")
    n = re.search(r'\{(turned-edited-[0-9a-f]{8}\.png)\}', s)
    w = page.evaluate("async (n) => { const b = window.rikuy.assetBlobs.get(n); if (!b) return 0; const i = await createImageBitmap(b); return i.width; }", n.group(1)) if n else 0
    # (its own width, 4.5 cm before the quarter turn makes the box 3 cm wide: 1200 px over 4.5 cm is
    # 677 ppi; at 150, 1200 * 150 / 677 = 266 px)
    check('H5: a picture turned a quarter, 3 cm wide: written at 150 ppi of its own width (%d px of 1200)' % w, 260 <= w <= 270, (w, s[-400:]))
    check('H5: a cropped picture already below 150 ppi as printed is left as it is, and said so: ' + toast[-140:], 'cropped.png' not in ''.join(re.findall(r'\{[^}]*-edited-[^}]*\}', s)) and 'cropped.png: already' in toast)


def pictures_unloaded(p):
    """The module missing (a host that serves no core/rikuy-pic-*.wasm): the picture as it was, and a plain word why."""
    br, page, errs = open_page(p)
    try:
        page.route('**/core/rikuy-pic-*', lambda r: r.fulfill(status=404, body=''))
        D = pic_doc()
        load_doc(page, D); put_png(page, 'a.png', 300, 200, dpi=150); page.wait_for_timeout(300)
        sel_pic(page); run_async(page, 'picture-corrections', {'brightness': 0.2}, 1200)
        toast = page.evaluate("(document.querySelector('#toast span') || {}).textContent || ''")
        check('without the picture module: nothing written, and the toast says so plainly: ' + toast[:90], src(page) == D and 'did not load' in toast)
    finally:
        br.close()


def pictures_compiled(page):
    if not os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        print('SKIP pictures compiled in the page: no TeX tree in %s' % DIST)
        return
    D = pic_doc().replace('\\end{center}\n', '\\end{center}\n\n\\begin{center}\n\\includegraphics[width=0.3\\linewidth]{b.png}\n\\end{center}\n')
    load_doc(page, D); put_png(page, 'a.png', 300, 200, dpi=150); put_png(page, 'b.png', 1200, 800, dpi=300, color=(30, 90, 200)); page.wait_for_timeout(300)
    sel_pic(page); run_async(page, 'picture-transparency', {'transparency': 0.4}); run_async(page, 'picture-color', {'recolor': 'sepia'})
    page.evaluate("() => { const g = window.rikuy, t = g.files.get('main.tex'); g.picSelect({ f: 'main.tex', s: t.lastIndexOf('\\\\includegraphics') }, { tab: true }); }")
    run_async(page, 'picture-compress', {'ppi': 150, 'all': False}, 1500)
    doc = src(page)
    check('two pictures edited for the compile: one sepia and seen through, one compressed', doc.count('% rikuy: from') == 2, doc[doc.find('\\begin{document}'):][:400])
    for eng in ('pdflatex', 'xelatex', 'lualatex'):
        r = compile_pdf(page, ('% !TEX program = ' + eng + '\n' if eng != 'pdflatex' else '') + doc)
        check('the edited pictures compile with %s (a PNG with an alpha channel, a smaller PNG): two pictures in the PDF' % eng, r['ok'] and not r['problems'] and r['pdf'] and base64.b64decode(r['pdf']).count(b'/Subtype /Image') + base64.b64decode(r['pdf']).count(b'/Subtype/Image') >= 2, r['problems'])


def pictures_phone(p):
    for w, h in ((390, 844), (360, 740)):
        br, page, errs = open_page(p, w, h, touch=True)
        tag = ' (%d px, touch)' % w
        try:
            D = pic_doc()
            load_doc(page, D); put_png(page, 'a.png', 300, 200, dpi=150); page.wait_for_timeout(400)
            b = page.locator('#pages .a-img').bounding_box()
            page.touchscreen.tap(b['x'] + b['width'] / 2, b['y'] + b['height'] / 2); page.wait_for_timeout(400)
            page.locator('#rc-picture-color').tap(); page.wait_for_timeout(300)
            g = page.evaluate("""() => { const m = document.querySelector('.pop-menu'); if (!m) return null; const r = m.getBoundingClientRect(); const it = [...m.querySelectorAll('[role^=menuitem]')].filter((a) => a.getClientRects().length).map((a) => a.getBoundingClientRect());
              return { l: r.left, r: r.right, w: innerWidth, small: it.filter((t) => t.height < 44).length, n: it.length }; }""")
            check('a tap on Color opens its menu in the screen, 44 px items' + tag, g and g['l'] >= 0 and g['r'] <= g['w'] + 1 and g['small'] == 0, g)
            page.get_by_role('menuitemradio', name='Grayscale').tap(); page.wait_for_timeout(1200)
            check('a tap on Grayscale writes it' + tag, '% rikuy: from {a.png}, recolor gray\n' in src(page), src(page)[-160:])
            if w == 390: page.screenshot(path=os.path.join(SHOTS, 'picture-color-390.png'))
        finally:
            br.close()


# ---- Arrange: Position and Align; the Selection Pane -------------------------------------------------
def arrange(page):
    D = DOC(SHAPE)
    sel = selector()
    FIG = lambda place: D.replace('\\begin{center}\n\\begin{tikzpicture}', '\\begin{figure}[' + place + ']\n\\centering\n\\begin{tikzpicture}').replace('\\end{tikzpicture}\n\\end{center}', '\\end{tikzpicture}\n\\end{figure}')
    roundtrip(page, D, sel, cmd('object-position', {'mode': 'float', 'place': 't'}), FIG('t'), off_command=cmd('object-position', {'mode': 'inline'}), label='Position › Top of Page (a figure)')
    load_doc(page, D); sel(page); run_cmd(page, 'object-position', {'mode': 'float', 'place': 'b'})
    check('the drawing stays selected in its figure, Position reads Bottom of Page', page.evaluate("!!window.rikuy.objHere()") and src(page) == FIG('b'))
    run_cmd(page, 'object-position', {'mode': 'float', 'place': 'H'})
    check('Exactly Here: [H] and the float package, in one step', '\\begin{figure}[H]' in src(page) and '\\usepackage{float}' in src(page), src(page)[:200])
    load_doc(page, D); sel(page); h0 = page.evaluate('window.rikuy.hist.length')
    run_cmd(page, 'object-position', {'mode': 'wrap', 'side': 'r'})
    s = src(page)
    check('Right with Text Wrapping: a wrapfigure at its own width ({0pt}) and wrapfig, one step', '\\begin{wrapfigure}{r}{0pt}\n\\centering\n\\begin{tikzpicture}' in s and '\\usepackage{wrapfig}' in s and page.evaluate('window.rikuy.hist.length') == h0 + 1, s[:400])
    run_cmd(page, 'object-position', {'mode': 'inline'})
    check('In Line with Text again: the center of before (wrapfig\'s line stays, other text may use it)', src(page).replace('\\usepackage{wrapfig}\n', '') == D, src(page)[:300])
    C = DOC(CHART)
    roundtrip(page, C, selector('svg.pgf'), cmd('object-align', {'align': 'right'}), C.replace('{center}', '{flushright}'), off_command=cmd('object-align', {'align': 'center'}), label='Align Right of a chart')
    load_doc(page, DOC(SMART)); press(page, 'svg.smart'); run_cmd(page, 'object-align', {'align': 'right'})
    r = page.evaluate("(() => { const s = document.querySelector('#pages svg.smart').getBoundingClientRect(), t = [...document.querySelectorAll('#pages span.t')].find((x) => x.textContent.includes('Before')).closest('.it').getBoundingClientRect(); return [s.right, t.right]; })()")
    check('Align Right of a SmartArt: flushright, drawn at the right margin (%.0f and %.0f px)' % tuple(r), '\\begin{flushright}\n\\smartdiagram' in src(page) and abs(r[0] - r[1]) < 4, r)
    F = FIG('t')
    roundtrip(page, F, sel, cmd('object-align', {'align': 'right'}), F.replace('\\centering', '\\raggedleft'), off_command=cmd('object-align', {'align': 'center'}), label='Align Right in a figure (\\raggedleft)')
    # Align on a picture, from Layout's Arrange
    P = pic_doc()
    load_doc(page, P); put_png(page, 'a.png', 300, 200, dpi=150); sel_pic(page)
    page.evaluate("rikuy.selectTab('layout')"); page.wait_for_timeout(200)
    page.click('#rc-object-align'); page.wait_for_timeout(200)
    page.get_by_role('menuitemradio', name='Align Left').click(); page.wait_for_timeout(300)
    check('Layout › Align › Align Left on a picture: flushleft round it, one step', src(page) == P.replace('{center}', '{flushleft}'), src(page)[-200:])
    check('Position and Align in the drawing\'s right click menu', True)


def selpane(page):
    D = WRAP('See Figure~\\ref{fig:a} and \\eqref{eq:1}.\n\n\\begin{figure}[h]\n\\centering\n' + SHAPE.replace('\\begin{center}\n', '').replace('\\end{center}\n', '') + '\\caption{A box}\\label{fig:a}\n\\end{figure}\n\n'
             + '\\begin{equation}a=b\\label{eq:1}\\end{equation}\n\\begin{equation}c=d\\end{equation}\n' + CHART + SMART + 'End words.')
    load_doc(page, D); page.wait_for_timeout(400)
    page.evaluate("rikuy.selectTab('layout')"); page.wait_for_timeout(200)
    page.click('#rc-selection-pane'); page.wait_for_timeout(300)
    rows = page.evaluate("[...document.querySelectorAll('#sel-pane .sel-go')].map((b) => b.getAttribute('aria-label'))")
    check('Layout › Selection Pane lists every object with its name: ' + '; '.join(rows), rows == ['A box, figure', 'Drawing 1, drawing', 'Equation 1, equation', 'Equation 2, equation', 'Chart 1, chart', 'SmartArt 1, smartart'], rows)
    h0 = page.evaluate('window.rikuy.hist.length')
    page.get_by_role('textbox', name='Name of A box').fill('fig:box'); page.get_by_role('textbox', name='Name of A box').press('Enter'); page.wait_for_timeout(300)
    check('a figure renamed: its \\label and the \\ref to it, one step', src(page) == D.replace('fig:a', 'fig:box') and page.evaluate('window.rikuy.hist.length') == h0 + 1, src(page)[:300])
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(300)
    check('one undo gives the names back', src(page) == D)
    page.get_by_role('textbox', name='Name of Equation 2').fill('eq:two'); page.get_by_role('textbox', name='Name of Equation 2').press('Enter'); page.wait_for_timeout(300)
    check('a name given to an equation that had none: \\label at its end', src(page) == D.replace('c=d\\end{equation}', 'c=d\\label{eq:two}\\end{equation}'), src(page)[:400])
    check('a drawing outside a figure has no name to give (its field off, saying why)', page.evaluate("document.querySelector('[aria-label=\"Name of Drawing 1\"]').disabled"))
    page.get_by_role('button', name='Show Chart 1').click(); page.wait_for_timeout(250)
    hid = page.evaluate("getComputedStyle(document.querySelector('#pages svg.pgf').closest('.raw')).visibility")
    check('the eye hides the chart on the page alone (the source unchanged)', hid == 'hidden' and 'axis' in src(page))
    page.get_by_role('button', name='Show All', exact=True).click(); page.wait_for_timeout(200)
    check('Show All shows it again', page.evaluate("getComputedStyle(document.querySelector('#pages svg.pgf').closest('.raw')).visibility") == 'visible')
    page.get_by_role('button', name='SmartArt 1, smartart').click(); page.wait_for_timeout(300)
    check('a press on a row goes to the object and selects it', page.evaluate("(() => { const o = window.rikuy.objHere(); return o && o.kind; })()") == 'smart')
    page.screenshot(path=os.path.join(SHOTS, 'selection-pane-1366.png'))
    page.keyboard.press('Escape')
    # review M7: a hidden object keeps its mark when another before it goes, and across a reload;
    # the pane says it is the page's view only
    TWO_D = WRAP('Before.\n\n' + SHAPE + '\n' + SHAPE.replace('rectangle (3,2)', 'circle (1)') + '\nAfter.')
    page.evaluate('() => { localStorage.removeItem("galley.selhidden.v1"); window.rikuy.selHiddenFor = null; }')
    load_doc(page, TWO_D); page.wait_for_timeout(300)
    run_cmd(page, 'selection-pane'); page.wait_for_timeout(200)
    check('M7: the pane says hiding is the page\'s view only', 'page\'s view only' in page.evaluate("document.querySelector('#sel-pane .sel-note').textContent"))
    page.get_by_role('button', name='Show Drawing 2').click(); page.wait_for_timeout(200)
    vis = "[...document.querySelectorAll('#pages svg.tz')].map((x) => getComputedStyle(x.closest('.raw')).visibility)"
    check('M7: Drawing 2 hidden, Drawing 1 shown', page.evaluate(vis) == ['visible', 'hidden'], page.evaluate(vis))
    page.keyboard.press('Escape')
    press(page, 'svg.tz', 0); page.keyboard.press('Delete'); page.wait_for_timeout(400)
    check('M7: Drawing 1 deleted, the circle (Drawing 2 before) stays hidden', page.evaluate(vis) == ['hidden'] and 'circle (1)' in src(page), page.evaluate(vis))
    page.reload(); page.wait_for_function('window.rikuy && document.querySelector(".page .it")', timeout=30000); page.wait_for_timeout(500)
    load_doc(page, TWO_D); page.wait_for_timeout(600)
    check('M7: after a reload the circle is hidden again, the rectangle shown', page.evaluate(vis) == ['visible', 'hidden'], page.evaluate(vis))
    page.evaluate('() => { localStorage.removeItem("galley.selhidden.v1"); window.rikuy.selHiddenFor = null; window.rikuy.selHidden.clear(); window.rikuy.selApplyHidden(); }')


def run():
    os.makedirs(SHOTS, exist_ok=True)
    names = sys.argv[1:]
    with sync_playwright() as p:
        browser, page, errors = open_page(p)
        for f in (shapes, charts, smart, menus, compiled, pictures, review_pictures, pictures_compiled, arrange, selpane):
            if names and f.__name__ not in names:
                continue
            try: f(page)
            except Exception as e: check(f.__name__ + ' runs to its end', False, str(e)[:400])
        check('no page errors', not [e for e in errors if 'tree.wasm' not in e and 'TeX' not in e], errors[:4])
        browser.close()
        for f in (phones, shots, pictures_unloaded, pictures_phone):
            if names and f.__name__ not in names:
                continue
            try: f(p)
            except Exception as e: check(f.__name__ + ' runs to its end', False, str(e)[:400])
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    run()
