"""The document agent's Word gaps (PLAN task 68), in Chromium, by the round trip rule (test/browser.py
roundtrip): tables (Table Properties' tabs: preferred width, text wrapping, repeat as header row, cell
margins; Borders and Shading, Border Styles, Pen Style, Border Painter; Formula and Update
Formulas; View Gridlines; Draw Table and Eraser), each drawn on the page as TeX prints it; where
dist/tex holds a TeX tree, what they write compiled in the page with pdfLaTeX, XeLaTeX and LuaLaTeX;
phones at 390 and 360 px with touch; screenshots in $RIKUY_SHOTS (default /tmp/g2-shots).

python3 docgaps.py [section ...]: tables, tables_compiled, tables_phones, shots, headfoot, headfoot_forms, headfoot_compiled,
headfoot_phones, headfoot_shots, view, refs_update, equation, equation_linear, insert_text, rest_compiled, rest_phones,
rest_shots."""
import os, sys, base64, io, re as _re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import open_page, check, results, src, load_doc, roundtrip, pressed
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist')
SHOTS = os.environ.get('RIKUY_SHOTS') or '/tmp/g2-shots'
HAS_TEX = os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm'))
PRE = '\\usepackage{booktabs}\n'
WRAP = lambda body, pre=PRE: '\\documentclass{article}\n' + pre + '\\begin{document}\n' + body + '\n\\end{document}\n'
PRICES = ('\\begin{tabular}{lr}\n\\toprule\nItem & Price \\\\\n\\midrule\napples & 2 \\\\\npears & 3 \\\\\nplums & 5 \\\\\nTotal & \\\\\n\\bottomrule\n\\end{tabular}')
PARA = 'These words wrap around the table when it floats at the side of the page, as Word wraps text around a table; ' * 3
FLOAT = lambda tab, cap='Prices': 'Before it.\n\n\\begin{table}[h]\n\\centering\n' + tab + '\n\\caption{' + cap + '}\n\\end{table}\n\n' + PARA + '\n\nAfter it.'
DOC = WRAP(FLOAT(PRICES))
PLAIN = WRAP('Before.\n\n\\begin{tabular}{ll}\nHead & Other \\\\\none & two \\\\\nthree & four \\\\\n\\end{tabular}\n\nAfter.', '')


def run_cmd(page, cid, args=None):
    return page.evaluate('([id, a]) => window.rikuy.runCommand(id, a)', [cid, args])


def at_src(page, needle, k=0, f='main.tex'):
    page.evaluate('''([n, k, f]) => { const g = window.rikuy, p = g.files.get(f).indexOf(n) + k; document.getElementById('pages').focus(); g.caretToCell(f, p); }''', [needle, k, f])
    page.wait_for_timeout(120)


def sel(needle, k=0):
    return lambda page: at_src(page, needle, k)


def cmd_fn(cid, args=None, where=None, name=None):
    def f(page):
        if where: at_src(page, *where) if isinstance(where, tuple) else at_src(page, where)
        run_cmd(page, cid, args)
    f.__name__ = name or cid
    return f


def hist(page):
    return page.evaluate('window.rikuy.hist.length')


def body(s):
    return s.split('\\begin{document}')[1] if '\\begin{document}' in s else s


def td_box(page, word):
    return page.evaluate('''(w) => { const td = [...document.querySelectorAll('#pages .tab td')].find((x) => x.textContent.trim() === w); if (!td) return null; const r = td.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }''', word)


# ---- tables ---------------------------------------------------------------------------------------------
def tables(page):
    # Table Properties: the table's preferred width (a tabularx at a share of the line), and back
    w80 = DOC.replace('\\begin{tabular}{lr}', '\\begin{tabularx}{0.8\\linewidth}{X>{\\raggedleft\\arraybackslash}X}').replace('\\end{tabular}', '\\end{tabularx}').replace(PRE, PRE + '\\usepackage{tabularx}\n')
    roundtrip(page, DOC, sel('apples'), cmd_fn('table-properties', {'width': '0.8\\linewidth'}), lambda s: body(s) == body(w80) and '\\usepackage{tabularx}' in s,
              off=DOC.replace(PRE, PRE + '\\usepackage{tabularx}\n'), label='Table Properties: Preferred width 80 %', off_command=cmd_fn('table-properties', {'width': None}))
    # (the review of PR 84, M4: a p{3cm} and siunitx's S column keep their kind; Off gives them back)
    pdoc = WRAP('Before.\n\n\\begin{tabular}{p{3cm}lS[table-format=1.1]}\nName & Kind & Value \\\\\nalpha & a & 1.5 \\\\\n\\end{tabular}\n\nAfter.', '\\usepackage{siunitx}\n')
    pon = pdoc.replace('\\begin{tabular}{p{3cm}lS[table-format=1.1]}', '\\begin{tabularx}{0.8\\linewidth}{p{3cm}XS[table-format=1.1]}').replace('\\end{tabular}', '\\end{tabularx}').replace('\\usepackage{siunitx}\n', '\\usepackage{siunitx}\n\\usepackage{tabularx}\n')
    roundtrip(page, pdoc, sel('alpha'), cmd_fn('table-properties', {'width': '0.8\\linewidth'}), pon,
              off=pdoc.replace('\\usepackage{siunitx}\n', '\\usepackage{siunitx}\n\\usepackage{tabularx}\n'), label='Preferred width keeps p{3cm} and S', off_command=cmd_fn('table-properties', {'width': None}))
    load_doc(page, w80); at_src(page, 'apples')
    drawn = page.evaluate("() => { const t = document.querySelector('#pages table.tab'), pb = t && t.closest('.pb'); return t && pb ? t.getBoundingClientRect().width / pb.getBoundingClientRect().width : null; }")
    check('the page draws the tabularx at 80 % of the line', drawn is not None and abs(drawn - 0.8) < 0.04, drawn)
    # Text wrapping Around: a wraptable on the right, the paragraph after it beside it
    def wrap_on(page):
        at_src(page, 'apples'); run_cmd(page, 'table-properties', {'wrap': {'around': True, 'side': 'r', 'width': '0.4\\linewidth'}})
    wrapped = DOC.replace('\\begin{table}[h]', '\\begin{wraptable}{r}{0.4\\linewidth}').replace('\\end{table}', '\\end{wraptable}').replace(PRE, PRE + '\\usepackage{wrapfig}\n')
    roundtrip(page, DOC, sel('apples'), wrap_on, wrapped, off=DOC.replace(PRE, PRE + '\\usepackage{wrapfig}\n').replace('{table}[h]', '{table}[htbp]'),
              label='Table Properties: Text wrapping Around', off_command=cmd_fn('table-properties', {'wrap': {'around': False}}, where='apples', name='wrap_off'))
    load_doc(page, wrapped); page.wait_for_timeout(300)
    side = page.evaluate("() => { const t = document.querySelector('#pages .wrap-in'); if (!t) return null; const r = t.getBoundingClientRect(), p = t.parentElement.getBoundingClientRect(); return { right: Math.abs(r.right - p.right) < 4, w: r.width / p.width, words: t.parentElement.textContent.includes('These words wrap') }; }")
    check('the page draws the wraptable at the right of the next paragraph, 40 % wide, the words beside it', side and side['right'] and abs(side['w'] - 0.4) < 0.04 and side['words'], side)
    # the dialog: its tabs, Around read back, Repeat as header row on the Row tab
    load_doc(page, wrapped); at_src(page, 'apples'); run_cmd(page, 'table-properties'); page.wait_for_timeout(250)
    dlg = page.get_by_role('dialog', name='Table Properties', exact=True)
    tabs = dlg.get_by_role('tab').all_inner_texts()
    check('Table Properties has Word\'s tabs: Table, Row, Column, Cell, Alt Text', tabs == ['Table', 'Row', 'Column', 'Cell', 'Alt Text'], tabs)
    check('and reads Around back', dlg.get_by_role('radio', name='Around', exact=True).is_checked())
    dlg.get_by_role('radio', name='None', exact=True).check()
    dlg.get_by_role('tab', name='Row', exact=True).click()
    h0 = hist(page)
    dlg.get_by_role('button', name='OK', exact=True).click(); page.wait_for_timeout(300)
    s = src(page)
    check('None by the dialog: the table float again, one step', '\\begin{table}[htbp]' in s and 'wraptable' not in body(s) and hist(page) == h0 + 1, s[60:300])
    # Repeat as header row, and the cell margins, as one step
    load_doc(page, DOC); at_src(page, 'Item'); run_cmd(page, 'table-properties'); page.wait_for_timeout(250)
    dlg = page.get_by_role('dialog', name='Table Properties', exact=True)
    dlg.get_by_role('spinbutton', name='Left and right margins', exact=True).fill('8')
    dlg.get_by_role('tab', name='Row', exact=True).click()
    dlg.get_by_role('checkbox', name='Repeat as header row at the top of each page', exact=True).check()
    h0 = hist(page)
    dlg.get_by_role('button', name='OK', exact=True).click(); page.wait_for_timeout(300)
    s = src(page)
    check('Repeat as header row and Left and right margins 8 pt: a longtable with \\endhead and \\setlength{\\tabcolsep}{8pt}, one step',
          '\\begin{longtable}{lr}' in s and '\\endhead' in s and '\\setlength{\\tabcolsep}{8pt}' in s and hist(page) == h0 + 1, body(s)[:400])
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
    check('one undo: the bytes of before', src(page) == DOC)
    # a wrap refused where no paragraph follows
    nopar = WRAP('Before.\n\n\\begin{table}[h]\n\\centering\n' + PRICES + '\n\\end{table}\n\n\\section{Next}\nText.')
    load_doc(page, nopar); at_src(page, 'apples'); run_cmd(page, 'table-properties', {'wrap': {'around': True}}); page.wait_for_timeout(200)
    toast = page.evaluate("() => (document.querySelector('.toast') || {}).textContent || ''")
    check('Around where a heading follows: nothing written, and the toast says why', src(page) == nopar and 'paragraph of words' in toast, toast)

    # Borders and Shading: All, double, on the whole table, then off again
    dbl = PLAIN.replace('{tabular}{ll}', '{tabular}{||l||l||}').replace('\\begin{tabular}{||l||l||}\n', '\\begin{tabular}{||l||l||}\n\\hline\\hline\n')
    def all_double(page):
        at_src(page, 'one'); run_cmd(page, 'borders-shading', {'scope': 'table', 'parts': {'top': True, 'bottom': True, 'left': True, 'right': True, 'insideH': True, 'insideV': True}, 'double': True})
    ok_dbl = lambda s: body(s) == body(PLAIN).replace('{tabular}{ll}\n', '{tabular}{||l||l||}\n\\hline\\hline\n').replace(' \\\\\n', ' \\\\ \\hline\\hline\n')
    roundtrip(page, PLAIN, sel('one'), all_double, ok_dbl, label='Borders and Shading: All, double, the table',
              off_command=cmd_fn('borders-shading', {'scope': 'table', 'parts': {'top': False, 'bottom': False, 'left': False, 'right': False, 'insideH': False, 'insideV': False}}, where='one', name='none'))
    load_doc(page, PLAIN); all_double(page); page.wait_for_timeout(250)
    st = page.evaluate("() => { const tr = document.querySelector('#pages table.tab tr.r-dbl'), td = document.querySelector('#pages table.tab td.vl2'); return { tr: tr && getComputedStyle(tr).borderTopStyle, td: td && getComputedStyle(td).borderLeftStyle }; }")
    check('the page draws them double (\\hline\\hline and ||)', st == {'tr': 'double', 'td': 'double'}, st)
    # the dialog: Box by its setting, the preview's edges, the fill
    load_doc(page, PLAIN); at_src(page, 'one'); run_cmd(page, 'borders-shading'); page.wait_for_timeout(250)
    dlg = page.get_by_role('dialog', name='Borders and Shading', exact=True)
    dlg.get_by_role('radio', name='Box', exact=True).check()
    pv = [dlg.get_by_role('button', name=n, exact=True).get_attribute('aria-pressed') for n in ('Top border', 'Bottom border', 'Left border', 'Right border', 'Inside horizontal border', 'Inside vertical border')]
    check('Borders and Shading: Box presses the four outside edges of the preview', pv == ['true', 'true', 'true', 'true', 'false', 'false'], pv)
    dlg.get_by_role('button', name='Inside horizontal border', exact=True).click()
    dlg.get_by_role('tab', name='Shading', exact=True).click()
    dlg.get_by_role('combobox', name='Fill', exact=True).select_option('gray!10')
    h0 = hist(page)
    dlg.get_by_role('button', name='OK', exact=True).click(); page.wait_for_timeout(300)
    s = src(page)
    check('OK: the box, the rules between rows, \\cellcolor{gray!10} in every cell, xcolor\'s table option, one step',
          '{tabular}{|ll|}' in s and s.count('\\hline') == 4 and s.count('\\rowcolor{gray!10}') == 3 and '\\usepackage[table]{xcolor}' in s and hist(page) == h0 + 1, body(s)[:400])
    # Border Styles: a preset sets the pen and arms Border Painter; a press on a cell's bottom edge draws it
    load_doc(page, PLAIN); at_src(page, 'one')
    run_cmd(page, 'border-styles', {'style': 'double-one'}); page.wait_for_timeout(200)
    s = src(page)
    check('Border Styles › Double solid lines, ¾ pt: \\arrayrulewidth 0.8pt, Border Painter on', '\\setlength{\\arrayrulewidth}{0.8pt}' in s and pressed(page, 'border-painter') is True, s[60:300])
    b = td_box(page, 'one')
    page.mouse.click(b['x'] + b['w'] / 2, b['y'] + b['h'] - 2); page.wait_for_timeout(300)
    s = src(page)
    check('Border Painter: a press on the bottom edge of "one" draws a double rule under its row (one cell: \\cline twice is no double, so the whole row\'s rule where the row is the table\'s)', 'one & two \\\\' in s and ('\\cline{1-1}' in s or '\\hline' in s), body(s)[:300])
    page.keyboard.press('Escape'); page.wait_for_timeout(100)
    check('Escape stops Border Painter', pressed(page, 'border-painter') is False)
    # Pen Style
    run_cmd(page, 'pen-style', {'style': 'single'})
    check('Pen Style › Single line: the pen single', page.evaluate('window.rikuy.penStyle') == 'single')

    # Draw Table and Eraser: an edge drawn, an edge erased (two cells merged), a merged cell split
    load_doc(page, PLAIN); at_src(page, 'one')
    run_cmd(page, 'draw-table'); page.wait_for_timeout(100)
    b = td_box(page, 'one')
    h0 = hist(page)
    page.mouse.click(b['x'] + b['w'] - 2, b['y'] + b['h'] / 2); page.wait_for_timeout(300)
    s = src(page)
    check('Draw Table: a press on the right edge of "one" draws a bar there (l|l), one step', '{tabular}{l|l}' in s and hist(page) == h0 + 1, body(s)[:200])
    run_cmd(page, 'table-eraser'); page.wait_for_timeout(100)
    check('Eraser takes over from Draw Table', pressed(page, 'table-eraser') is True and pressed(page, 'draw-table') is False)
    b = td_box(page, 'one')
    page.mouse.click(b['x'] + b['w'] - 2, b['y'] + b['h'] / 2); page.wait_for_timeout(300)
    check('Eraser on that bar: the bar goes, the bytes of before', src(page) == PLAIN, body(src(page))[:200])
    b = td_box(page, 'three')
    page.mouse.click(b['x'] + b['w'] - 2, b['y'] + b['h'] / 2); page.wait_for_timeout(300)
    s = src(page)
    check('Eraser on the edge between "three" and "four", where no bar stands: the two cells merged (\\multicolumn{2}{c}{three four}, as Merge Cells writes it)', '\\multicolumn{2}{c}{three four}' in s, body(s)[:240])
    run_cmd(page, 'draw-table'); page.wait_for_timeout(100)
    b = td_box(page, 'three four') or td_box(page, 'three  four')
    page.mouse.click(b['x'] + b['w'] / 2, b['y'] + b['h'] / 2); page.wait_for_timeout(300)
    s = src(page)
    check('Draw Table inside the merged cell: split again', '\\multicolumn' not in s and 'three' in s, body(s)[:240])
    page.keyboard.press('Escape')

    # View Gridlines: dashed edges on the page, nothing in the source
    load_doc(page, PLAIN); at_src(page, 'one')
    run_cmd(page, 'view-gridlines'); page.wait_for_timeout(100)
    o = page.evaluate("() => getComputedStyle(document.querySelector('#pages .tab td')).outlineStyle")
    check('View Gridlines: every cell\'s edge dashed on the page, the source as it was, the button pressed', o == 'dashed' and src(page) == PLAIN and pressed(page, 'view-gridlines') is True, o)
    run_cmd(page, 'view-gridlines'); page.wait_for_timeout(100)
    o = page.evaluate("() => getComputedStyle(document.querySelector('#pages .tab td')).outlineStyle")
    check('and off again', o == 'none' and pressed(page, 'view-gridlines') is False, o)

    # Formula: =SUM(ABOVE) in the empty Total cell, its value written, the formula kept; Update Formulas
    summed = DOC.replace('\\centering\n\\begin{tabular}', '\\centering\n% formula B5 [10]: =SUM(ABOVE)\n\\begin{tabular}').replace('Total & \\\\', 'Total & 10 \\\\')
    roundtrip(page, DOC, lambda p: at_src(p, 'Total & ', 8), cmd_fn('table-formula', {'text': '=SUM(ABOVE)', 'format': ''}), summed, label='Formula =SUM(ABOVE)',
              off_command=cmd_fn('table-formula', {'remove': True}, where=('Total & ', 8), name='remove_formula'))
    load_doc(page, summed); page.wait_for_timeout(200)
    drawn = page.evaluate("() => [...document.querySelectorAll('#pages .tab td')].map((t) => t.textContent.trim()).includes('10')")
    check('the page shows the value 10 in the Total row', drawn)
    # change a price by typing in the source, then Update Formulas
    page.evaluate("() => { const g = window.rikuy, s = g.files.get('main.tex'); g.commit([{ f: 'main.tex', s: s.indexOf('pears & 3') + 8, e: s.indexOf('pears & 3') + 9, t: '30' }], null, 'test'); }")
    at_src(page, 'apples')
    h0 = hist(page)
    run_cmd(page, 'update-formulas'); page.wait_for_timeout(250)
    s = src(page)
    check('Update Formulas after pears became 30: Total 37 and its line\'s last value 37, one step', 'Total & 37 \\\\' in s and '% formula B5 [37]: =SUM(ABOVE)' in s and hist(page) == h0 + 1, body(s)[:400])
    # (the review of PR 84, H2: a row inserted above made Update Formulas write over plums' 5)
    load_doc(page, summed); page.wait_for_timeout(200)
    at_src(page, 'pears', 1); run_cmd(page, 'table-row-above'); page.wait_for_timeout(250)
    s = src(page)
    check('Insert Above pears: the formula line follows its cell, B5 to B6, in the same step', '% formula B6 [10]: =SUM(ABOVE)' in s and 'B5' not in s.split('\\begin{tabular}')[0][-200:], body(s)[:300])
    at_src(page, 'Total', 1); run_cmd(page, 'update-formulas'); page.wait_for_timeout(250)
    s = src(page)
    check('then Update Formulas: plums keeps its 5, Total 8 (ABOVE stops at the new empty row, as Word\'s does)', 'plums & 5 \\\\' in s and 'Total & 8 \\\\' in s, body(s)[:400])
    load_doc(page, summed); page.wait_for_timeout(200)
    at_src(page, 'pears', 1); run_cmd(page, 'delete-rows'); page.wait_for_timeout(250)
    s = src(page)
    check('Delete Rows pears: B5 to B4', '% formula B4 [10]: =SUM(ABOVE)' in s, body(s)[:300])
    at_src(page, 'Total', 1); run_cmd(page, 'update-formulas'); page.wait_for_timeout(250)
    check('then Update Formulas: Total 7', 'Total & 7 \\\\' in src(page), body(src(page))[:400])
    # a line that names a cell holding something else (a row moved by hand): left, and said why
    stale = summed.replace('% formula B5 [10]', '% formula B4 [10]')
    load_doc(page, stale); page.wait_for_timeout(200); at_src(page, 'apples')
    run_cmd(page, 'update-formulas'); page.wait_for_timeout(250)
    toast = page.evaluate("() => (document.querySelector('.toast') || {}).textContent || ''")
    check('Update Formulas leaves a cell that does not hold its formula\'s last value, and says so', src(page) == stale and 'B4 holds 5, not 10' in toast, toast)
    # Delete Table takes the formula and alt lines with it
    bare = WRAP('Before.\n\n% formula B2 [2]: =SUM(ABOVE)\n% alt: Two\n\\begin{tabular}{lr}\nx & 2 \\\\\ny & \\\\\n\\end{tabular}\n\nAfter.', '')
    load_doc(page, bare); page.wait_for_timeout(200); at_src(page, 'x &')
    run_cmd(page, 'delete-table'); page.wait_for_timeout(250)
    check('Delete Table: its formula and alt lines go with it', src(page) == WRAP('Before.\n\nAfter.', ''), body(src(page)))
    # the dialog: a number format, the preview, OK
    load_doc(page, DOC); at_src(page, 'Total & ', 8); run_cmd(page, 'table-formula'); page.wait_for_timeout(250)
    dlg = page.get_by_role('dialog', name='Formula', exact=True)
    v = dlg.get_by_role('textbox', name='Formula', exact=True).input_value()
    check('Formula… suggests =SUM(ABOVE) where numbers stand above', v == '=SUM(ABOVE)', v)
    dlg.get_by_role('textbox', name='Formula', exact=True).fill('=AVERAGE(ABOVE)')
    dlg.get_by_role('combobox', name='Number format', exact=True).fill('0.00')
    prev = dlg.locator('.tb-fout').inner_text()
    check('its preview reads B5 will read 3.33', 'B5 will read 3.33' in prev, prev)
    dlg.get_by_role('button', name='OK', exact=True).click(); page.wait_for_timeout(250)
    s = src(page)
    check('OK: 3.33 in the cell, the formula with Word\'s \\# "0.00" switch on its line', 'Total & 3.33 \\\\' in s and '% formula B5 [3.33]: =AVERAGE(ABOVE) \\# "0.00"' in s, body(s)[:300])
    # (L1: a format of your own, typed in the box, kept)
    load_doc(page, DOC); at_src(page, 'Total & ', 8); run_cmd(page, 'table-formula'); page.wait_for_timeout(250)
    dlg = page.get_by_role('dialog', name='Formula', exact=True)
    dlg.get_by_role('combobox', name='Number format', exact=True).fill('0.000')
    dlg.get_by_role('button', name='OK', exact=True).click(); page.wait_for_timeout(250)
    s = src(page)
    check('a Number format typed by hand, 0.000: 10.000 in the cell and on the line', 'Total & 10.000 \\\\' in s and '\\# "0.000"' in s, body(s)[:300])
    at_src(page, 'Total & ', 8); run_cmd(page, 'table-formula'); page.wait_for_timeout(250)
    v = page.get_by_role('dialog', name='Formula', exact=True).get_by_role('combobox', name='Number format', exact=True).input_value()
    check('and read back in the box', v == '0.000', v)
    page.keyboard.press('Escape'); page.wait_for_timeout(150)
    load_doc(page, DOC); at_src(page, 'Total & ', 8); run_cmd(page, 'table-formula', {'text': '=SUM(ABOV)'}); page.wait_for_timeout(200)
    toast = page.evaluate("() => (document.querySelector('.toast') || {}).textContent || ''")
    check('a formula Rikuy cannot read: nothing written, the toast says why', src(page) == DOC and 'ABOV' in toast, toast)
    # the ribbon: Draw group, Formula and the corner arrow of Borders
    load_doc(page, DOC); at_src(page, 'apples')
    page.get_by_role('tab', name='Table Layout', exact=True).click(); page.wait_for_timeout(200)
    names = [n for n in ('Draw Table', 'Eraser', 'View Gridlines', 'Formula', 'Update Formulas') if page.get_by_role('button', name=n, exact=True).count() == 1]
    check('Table Layout shows Draw Table, Eraser, View Gridlines, Formula and Update Formulas', len(names) == 5, names)
    page.get_by_role('tab', name='Table Design', exact=True).click(); page.wait_for_timeout(200)
    names = [n for n in ('Border Styles', 'Pen Style', 'Border Painter', 'Borders and Shading…') if page.get_by_role('button', name=n, exact=True).count() == 1]
    check('Table Design shows Border Styles, Pen Style, Border Painter and the Borders group\'s corner arrow', len(names) == 4, names)


def pdf_of(page, doc):
    page.set_default_timeout(600000)
    r = page.evaluate('''async (t) => { await window.rikuy.api.setSource(t); const r = await window.rikuy.api.compile();
      let b = ''; if (r.pdf) for (let i = 0; i < r.pdf.length; i += 8192) b += String.fromCharCode(...r.pdf.subarray(i, i + 8192));
      return { ok: r.ok, engine: r.engine, pdf: btoa(b), problems: (r.problems || []).filter((x) => x.severity === 'error').map((x) => x.message).slice(0, 4) }; }''', doc)
    page.set_default_timeout(30000)
    from pypdf import PdfReader
    r['text'] = ' '.join(p.extract_text() or '' for p in PdfReader(io.BytesIO(base64.b64decode(r['pdf']))).pages) if r['pdf'] else ''
    return r


def tables_compiled(page):
    if not HAS_TEX:
        print('SKIP the tables compiled: no TeX tree in %s' % DIST)
        return
    tex = ('\\usepackage{booktabs}\n\\usepackage{tabularx}\n\\usepackage{wrapfig}\n\\usepackage{longtable}\n\\usepackage[table]{xcolor}\n\\usepackage{array}\n')
    body_ = ('Before.\n\n\\begin{wraptable}{r}{0.4\\linewidth}\n\\centering\n% formula B4: =SUM(ABOVE)\n% alt: Prices\n\\begin{tabular}{||l||r||}\n\\hline\\hline\nItem & Price \\\\\n\\hline\\hline\napples & 2 \\\\\npears & 3 \\\\\nTotal & 5 \\\\\n\\hline\\hline\n\\end{tabular}\n\\caption{Wrapped}\n\\end{wraptable}\n\n' + PARA +
             '\n\n\\begin{table}[htbp]\n\\centering\n\\begin{tabularx}{0.8\\linewidth}{X>{\\raggedleft\\arraybackslash}X}\n\\toprule\nWide & \\cellcolor{gray!10}Shaded \\\\\n\\bottomrule\n\\end{tabularx}\n\\caption{Eighty}\n\\end{table}\n\n'
             '{\\setlength{\\tabcolsep}{8pt}\n\\begin{longtable}{lr}\n\\toprule\nHeadL & HeadR \\\\\n\\midrule\n\\endhead\nlt1 & lt2 \\\\\n\\bottomrule\n\\end{longtable}}\n')
    words = ['apples', 'Total', 'Wrapped', 'Wide', 'Shaded', 'Eighty', 'HeadL', 'lt1']
    for eng, magic in (('pdflatex', ''), ('xelatex', '% !TEX program = xelatex\n'), ('lualatex', '% !TEX program = lualatex\n')):
        r = pdf_of(page, magic + WRAP(body_, tex))
        miss = [w for w in words if w not in r['text']]
        check('the tables of this batch compile with %s: wraptable, || and \\hline\\hline, formula lines, tabularx at 0.8\\linewidth, \\cellcolor, longtable with \\tabcolsep; every word in the PDF' % eng,
              r['ok'] and not r['problems'] and r['engine'] == eng and not miss, {'ok': r['ok'], 'engine': r['engine'], 'problems': r['problems'], 'missing': miss})


def tables_phones(p):
    for w, h in ((390, 844), (360, 740)):
        br, page, errs = open_page(p, w, h, touch=True)
        tag = ' (%d px, touch)' % w
        try:
            load_doc(page, DOC); at_src(page, 'Item')
            run_cmd(page, 'table-properties'); page.wait_for_timeout(300)
            fit = page.evaluate("(() => { const d = document.querySelector('.pop'); const r = d.getBoundingClientRect(); const small = [...d.querySelectorAll('[role=tab], button, select, input[type=text]')].filter((x) => x.offsetParent && (x.getBoundingClientRect().height < 43.5)); return { in: r.left >= 0 && r.right <= innerWidth + 1, small: small.map((x) => x.textContent || x.getAttribute('aria-label')).slice(0, 4), scroll: document.documentElement.scrollWidth <= innerWidth + 1 }; })()")
            check('Table Properties inside the screen, its tabs and buttons 44 px' + tag, fit['in'] and not fit['small'] and fit['scroll'], fit)
            page.get_by_role('tab', name='Row', exact=True).tap()
            page.get_by_role('checkbox', name='Repeat as header row at the top of each page', exact=True).tap()
            page.get_by_role('button', name='OK', exact=True).tap(); page.wait_for_timeout(300)
            check('a tap on Row, on Repeat as header row and on OK: a longtable' + tag, '\\begin{longtable}' in src(page), body(src(page))[:200])
            load_doc(page, PLAIN); at_src(page, 'one')
            run_cmd(page, 'borders-shading'); page.wait_for_timeout(300)
            e = page.evaluate("(() => [...document.querySelectorAll('.bs-edge')].map((b) => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); }))()")
            check('Borders and Shading: the preview\'s edges 44 px for a finger' + tag, e and min(e) >= 43.5, e)
            page.get_by_role('button', name='Top border', exact=True).tap()
            page.get_by_role('button', name='OK', exact=True).tap(); page.wait_for_timeout(300)
            check('a tap on the top edge and OK: \\hline above the first row' + tag, '\\begin{tabular}{ll}\n\\hline\nHead' in src(page), body(src(page))[:200])
            load_doc(page, DOC); at_src(page, 'Total & ', 8)
            run_cmd(page, 'table-formula'); page.wait_for_timeout(300)
            page.get_by_role('button', name='OK', exact=True).tap(); page.wait_for_timeout(300)
            check('Formula by taps: =SUM(ABOVE) gives 10' + tag, 'Total & 10 \\\\' in src(page), body(src(page))[:300])
            os.makedirs(SHOTS, exist_ok=True)
            load_doc(page, DOC); at_src(page, 'apples'); run_cmd(page, 'borders-shading'); page.wait_for_timeout(300)
            page.screenshot(path=os.path.join(SHOTS, 'table-borders-dialog-%d.png' % w))
        except Exception as ex:
            check('tables_phones runs to its end' + tag, False, repr(ex)[:300])
        br.close()


def shots(p):
    os.makedirs(SHOTS, exist_ok=True)
    for w, h, dark in ((1920, 1080, False), (1366, 768, False), (1366, 768, True)):
        br, page, errs = open_page(p, w, h, dark=dark)
        tag = '%d%s' % (w, '-dark' if dark else '')
        try:
            load_doc(page, DOC); at_src(page, 'apples')
            page.get_by_role('tab', name='Table Layout', exact=True).click(); page.wait_for_timeout(300)
            page.screenshot(path=os.path.join(SHOTS, 'table-layout-%s.png' % tag))
            page.get_by_role('tab', name='Table Design', exact=True).click(); page.wait_for_timeout(300)
            page.screenshot(path=os.path.join(SHOTS, 'table-design-%s.png' % tag))
            run_cmd(page, 'table-properties'); page.wait_for_timeout(300)
            page.screenshot(path=os.path.join(SHOTS, 'table-properties-%s.png' % tag))
            page.keyboard.press('Escape'); at_src(page, 'apples')
            run_cmd(page, 'borders-shading'); page.wait_for_timeout(300)
            page.screenshot(path=os.path.join(SHOTS, 'table-borders-%s.png' % tag))
            page.keyboard.press('Escape'); at_src(page, 'Total & ', 8)
            run_cmd(page, 'table-formula'); page.wait_for_timeout(300)
            page.screenshot(path=os.path.join(SHOTS, 'table-formula-%s.png' % tag))
            page.keyboard.press('Escape')
            wrapped = DOC.replace('\\begin{table}[h]', '\\begin{wraptable}{r}{0.4\\linewidth}').replace('\\end{table}', '\\end{wraptable}').replace('{tabular}{lr}', '{tabular}{||l||r||}').replace('\\toprule', '\\hline\\hline').replace('\\bottomrule', '\\hline\\hline')
            load_doc(page, wrapped); at_src(page, 'apples'); run_cmd(page, 'view-gridlines'); page.wait_for_timeout(400)
            page.screenshot(path=os.path.join(SHOTS, 'table-wrapped-gridlines-%s.png' % tag))
            run_cmd(page, 'view-gridlines')
        except Exception as ex:
            check('shots run to their end ' + tag, False, repr(ex)[:300])
        br.close()


# ---- the Header & Footer tab -------------------------------------------------------------------------------
HF_PRE = '\\usepackage[margin=2.5cm]{geometry}\n\\usepackage{fancyhdr}\n\\pagestyle{fancy}\n\\fancyhf{}\n\\fancyhead[C]{Head}\n\\fancyfoot[C]{\\thepage}\n'
HF_DOC = WRAP('First words.\n\n' + ('Words fill the page. ' * 400) + '\n\nLast words.', HF_PRE)


def named(page, name, tap=False):
    """A ribbon button by its name, or the item of that name in its folded group's menu."""
    b = page.get_by_role('button', name=name, exact=True)
    if b.count() == 1 and b.is_visible():
        return b.tap() if tap else b.click()
    gb = page.evaluate("""(name) => { for (const e of document.querySelectorAll('.rb-panel:not([hidden]) .rb-grp [aria-label]')) { const g = e.closest('.rb-grp').querySelector('.rb-gbtn'); if (e.getAttribute('aria-label') === name && !e.offsetParent && g && g.offsetParent) return g.id; } return null; }""", name)
    page.click('#' + gb); page.wait_for_timeout(150)
    it = page.locator('.pop [role^=menuitem][aria-label="%s"]' % name)
    return it.tap() if tap else it.click()


def png(page, name='logo.png'):
    """A small PNG made in the page and kept as window.__logo (Pictures' file)."""
    page.evaluate("""async (n) => { const c = document.createElement('canvas'); c.width = 60; c.height = 30; const x = c.getContext('2d'); x.fillStyle = '#2B74B0'; x.fillRect(0, 0, 60, 30);
      const b = await new Promise((r) => c.toBlob(r, 'image/png')); window.__logo = new File([b], n, { type: 'image/png' }); }""", name)


def headfoot(page):
    import re as _re
    load_doc(page, HF_DOC); page.wait_for_timeout(400)
    page.evaluate("window.rikuy.pageHFOpen('head', { page: 0 })"); page.wait_for_timeout(300)
    tabs = page.evaluate("[...document.querySelectorAll('#rb-tabs [role=tab]')].filter((t) => !t.hidden).map((t) => t.textContent)")
    check('the header open: the Header & Footer tab shows', 'Header & Footer' in tabs, tabs)
    page.get_by_role('tab', name='Header & Footer', exact=True).click(); page.wait_for_timeout(200)
    groups = page.evaluate("[...document.querySelectorAll('.rb-panel:not([hidden]) .rb-grp')].map((g) => g.dataset.group)")
    check('its groups in Word\'s order: Header & Footer, Insert, Navigation, Options, Position, Close', groups == ['headfoot', 'insert', 'navigation', 'options', 'position', 'close'], groups)
    check('Go to Header is off in the header, Go to Footer on', page.get_by_role('button', name='Go to Header', exact=True).is_disabled() and not page.get_by_role('button', name='Go to Footer', exact=True).is_disabled())
    named(page, 'Go to Footer'); page.wait_for_timeout(300)
    w = page.evaluate('window.rikuy.hf && [window.rikuy.hf.where, window.rikuy.hf.k]')
    check('Go to Footer: the same page\'s footer open, its fields there', w == ['foot', 0] and page.get_by_role('textbox', name='Footer center', exact=True).count() == 1, w)
    named(page, 'Go to Header'); page.wait_for_timeout(300)
    check('Go to Header: back to the header', page.evaluate('window.rikuy.hf && window.rikuy.hf.where') == 'head')
    check('Previous and Next are off where every page has the one header (one sided)', page.get_by_role('button', name='Next Header or Footer', exact=True).is_disabled())
    # Header from Top: the box reads Word's distance, Enter writes geometry's headsep, the text stays
    v = page.get_by_role('spinbutton', name='Header from Top', exact=True).input_value()
    want = round((2.5 * 72.27 / 2.54 - 25 - 12) / (72.27 / 2.54), 2)
    check('Header from Top reads the top margin less headsep and headheight: %s cm' % want, v == '%s cm' % want, v)
    h0 = hist(page)
    page.get_by_role('spinbutton', name='Header from Top', exact=True).fill('1')
    page.keyboard.press('Enter'); page.wait_for_timeout(400)
    s = src(page)
    m = _re.search(r'\\usepackage\[margin=2\.5cm,headsep=([\d.]+)pt\]\{geometry\}', s)
    hs = 2.5 * 72.27 / 2.54 - 12 - 72.27 / 2.54
    check('Enter: geometry\'s headsep = the top margin less headheight less 1 cm (%.2f pt), one step' % hs, bool(m) and abs(float(m.group(1)) - hs) < 0.02 and hist(page) == h0 + 1, s[:200])
    page.wait_for_timeout(200)
    sp = page.get_by_role('spinbutton', name='Header from Top', exact=True)
    v = sp.input_value() if sp.count() else None
    check('the box reads it back: 1 cm', v == '1 cm', v)
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
    check('one undo: the bytes of before', src(page) == HF_DOC)
    page.evaluate("window.rikuy.runCommand('hf-footer-bottom', { cm: 1.2 })"); page.wait_for_timeout(300)
    s = src(page)
    g = page.evaluate('(() => { const g = window.rikuy.layout.g; return { ph: g.paperH || g.ph, mt: g.mt, th: g.th, fs: g.footskip }; })()')
    check('Footer from Bottom 1.2 cm: geometry\'s footskip set so the footer stands 1.2 cm above the sheet\'s foot', 'footskip=' in s and abs(g['ph'] - g['mt'] - g['th'] - g['fs'] - 1.2 * 72.27 / 2.54) < 0.05, (s[:200], g))
    page.evaluate("window.rikuy.runCommand('hf-header-top', { cm: 3 })"); page.wait_for_timeout(300)
    toast = page.evaluate("() => (document.querySelector('.toast') || {}).textContent || ''")
    check('Header from Top past the top margin: refused, and the toast says how far it may go', 'run into the text' in toast, toast)
    # Pictures: a logo in the header, a line high, graphicx with it, drawn on the page
    load_doc(page, HF_DOC); page.wait_for_timeout(300)
    page.evaluate("window.rikuy.pageHFOpen('head', { page: 0, slot: 'L' })"); page.wait_for_timeout(300)
    png(page)
    h0 = hist(page)
    page.evaluate("window.rikuy.runCommand('hf-picture', { file: 'logo.png', blob: window.__logo })"); page.wait_for_timeout(500)
    s = src(page)
    check('Pictures: \\includegraphics[height=\\baselineskip]{logo.png} in the header\'s left place, \\usepackage{graphicx} with it, one step',
          '\\fancyhead[L]{\\includegraphics[height=\\baselineskip]{logo.png}}' in s and '\\usepackage{graphicx}' in s and hist(page) == h0 + 1, s[:400])
    page.keyboard.press('Escape'); page.wait_for_timeout(400)
    img = page.evaluate("(() => { const i = document.querySelector('#pages .page .hd img.hf-pic'); return i ? { h: i.getBoundingClientRect().height, ok: i.complete && i.naturalWidth > 0 } : null; })()")
    check('the page draws the logo in the header, a line high (12 pt)', img and img['ok'] and abs(img['h'] - 12 * page.evaluate('window.rikuy.px')) < 2, img)
    # Quick Parts: Page X of Y's NumPages
    page.evaluate("window.rikuy.pageHFOpen('foot', { page: 0, slot: 'R' })"); page.wait_for_timeout(300)
    page.evaluate("window.rikuy.runCommand('hf-quick-parts', { tex: '\\\\pageref{LastPage}', pk: 'lastpage' })"); page.wait_for_timeout(400)
    s = src(page)
    check('Quick Parts › NumPages in the footer\'s right place: \\pageref{LastPage}, lastpage loaded', '\\fancyfoot[R]{\\pageref{LastPage}}' in s and '\\usepackage{lastpage}' in s, s[:400])
    items = page.evaluate("window.rikuy.hfPartItems().filter(Boolean).map((x) => x.name)")
    check('the header\'s Quick Parts: Page, NumPages, Date, FileName', items[:4] == ['Page', 'NumPages', 'Date', 'FileName'], items)
    # Show Document Text
    page.evaluate("window.rikuy.runCommand('hf-show-text')"); page.wait_for_timeout(150)
    vis = page.evaluate("getComputedStyle(document.querySelector('#pages .page .pb')).visibility")
    check('Show Document Text off: the page\'s text hidden, the header and footer left', vis == 'hidden' and pressed(page, 'hf-show-text') is False, vis)
    page.evaluate("window.rikuy.runCommand('hf-show-text')"); page.wait_for_timeout(150)
    vis = page.evaluate("getComputedStyle(document.querySelector('#pages .page .pb')).visibility")
    check('and on again', vis == 'visible' and pressed(page, 'hf-show-text') is True, vis)
    page.keyboard.press('Escape')
    # two sided: Next goes to an even page's header, Previous back
    two = HF_DOC.replace('\\documentclass{article}', '\\documentclass[twoside]{article}').replace('\\fancyhead[C]{Head}', '\\fancyhead[LE]{Even}\\fancyhead[RO]{Odd}')
    load_doc(page, two); page.wait_for_timeout(500)
    page.evaluate("window.rikuy.pageHFOpen('head', { page: 0 })"); page.wait_for_timeout(300)
    page.evaluate("window.rikuy.runCommand('hf-next')"); page.wait_for_timeout(300)
    w = page.evaluate('window.rikuy.hf && [window.rikuy.hf.k, window.rikuy.hf.side, window.rikuy.hf.el.getAttribute("aria-label")]')
    check('two sided: Next opens the even page\'s header (page 2), its fields named so', w and w[0] == 1 and w[1] == 'E' and 'even' in w[2], w)
    v = page.get_by_role('textbox', name='Header left', exact=True).input_value()
    check('with the even pages\' text in it', v == 'Even', v)
    page.evaluate("window.rikuy.runCommand('hf-prev')"); page.wait_for_timeout(300)
    check('Previous: the odd page\'s again', page.evaluate('window.rikuy.hf && window.rikuy.hf.side') == 'O')
    page.keyboard.press('Escape')


# The review of PR 84, M3: Header from Top under geometry's includehead moved the text and left the
# header; with \setlength{\headsep} by hand the page read the header 0.5 cm off. Each form: the field
# set to 1 cm, read back 1 cm, and in TeX's PDF the header 1 cm down (its words as far below that as
# before) and the text where it was.
HF_FORMS = {
    'a hand set \\headsep': '\\documentclass{article}\n\\setlength{\\headsep}{40pt}\n\\pagestyle{myheadings}\\markright{HEADMARK}\n\\begin{document}\nText.\n\\end{document}\n',
    'geometry with includehead': '\\documentclass{article}\n\\usepackage[margin=2cm,headsep=10pt,includehead]{geometry}\n\\pagestyle{myheadings}\\markright{HEADMARK}\n\\begin{document}\nText.\n\\end{document}\n',
}


def pdf_tops(r, words):
    import subprocess, tempfile, re as re_
    d = tempfile.mkdtemp()
    open(os.path.join(d, 'a.pdf'), 'wb').write(base64.b64decode(r['pdf']))
    subprocess.run(['pdftotext', '-bbox', os.path.join(d, 'a.pdf'), os.path.join(d, 'a.html')], check=True)
    h = open(os.path.join(d, 'a.html')).read()
    out = {}
    for m in re_.finditer(r'yMin="([\d.]+)" xMax="[\d.]+" yMax="[\d.]+">([^<]+)<', h):
        if m.group(2) in words and m.group(2) not in out:
            out[m.group(2)] = float(m.group(1)) * 2.54 / 72
    return out


def headfoot_forms(page):
    for name, doc in HF_FORMS.items():
        load_doc(page, doc); page.wait_for_timeout(400); at_src(page, 'Text.'); page.wait_for_timeout(200)
        v0 = page.evaluate("window.rikuy.runCommand && (() => { const d = window.rikuy.layout.g; return Math.round((d.mt - d.headsep - d.headheight) / (72.27 / 2.54) * 100) / 100; })()")
        h0 = hist(page)
        run_cmd(page, 'hf-header-top', {'cm': 1.0}); page.wait_for_timeout(400)
        s1 = src(page)
        check('Header from Top 1 cm (%s): one step' % name, hist(page) == h0 + 1 and s1 != doc, s1.split('\\begin{document}')[0])
        if 'includehead' in doc:
            check('under includehead the top margin moves to 1 cm and headsep takes up the rest', bool(_re.search(r'top=28\.4[0-9]pt', s1)) and 'headsep=' in s1, s1.split('\\begin{document}')[0])
        load_doc(page, s1); page.wait_for_timeout(400); at_src(page, 'Text.'); page.wait_for_timeout(200)
        sp = page.get_by_role('spinbutton', name='Header from Top', exact=True)
        v = page.evaluate("(() => { const d = window.rikuy.layout.g; return Math.round((d.mt - d.headsep - d.headheight) / (72.27 / 2.54) * 100) / 100; })()")
        check('the page reads it back as TeX sets it: 1 cm (%s)' % name, v == 1.0, v)
        page.evaluate('window.rikuy.undo()')
        if not HAS_TEX:
            continue
        a, b = pdf_of(page, doc), pdf_of(page, s1)
        ta, tb = pdf_tops(a, ('HEADMARK', 'Text.')), pdf_tops(b, ('HEADMARK', 'Text.'))
        ok = a['ok'] and b['ok'] and len(ta) == 2 and len(tb) == 2
        check('in TeX\'s PDF (%s): the header 1 cm down from the top as it was %.2f cm, the text where it was' % (name, v0),
              ok and abs((tb['HEADMARK'] - 1.0) - (ta['HEADMARK'] - v0)) < 0.03 and abs(tb['Text.'] - ta['Text.']) < 0.03, (ta, tb, v0))
    # (and the footer under includefoot: the bottom margin moves, footskip with it)
    doc = HF_FORMS['geometry with includehead'].replace('includehead', 'includefoot')
    load_doc(page, doc); page.wait_for_timeout(400); at_src(page, 'Text.'); page.wait_for_timeout(200)
    th0 = page.evaluate('window.rikuy.layout.g.th')
    run_cmd(page, 'hf-footer-bottom', {'cm': 1.0}); page.wait_for_timeout(400)
    s1 = src(page)
    load_doc(page, s1); page.wait_for_timeout(400)
    g = page.evaluate('(() => { const g = window.rikuy.layout.g; return [Math.round(((g.paperH || g.ph) - g.mt - g.th - g.footskip) / (72.27 / 2.54) * 100) / 100, g.th]; })()')
    check('Footer from Bottom 1 cm under includefoot: bottom=28.45pt and footskip, read back 1 cm, the text block as tall', bool(_re.search(r'bottom=28\.4[0-9]pt', s1)) and g[0] == 1.0 and abs(g[1] - th0) < 0.05, (s1.split('\\begin{document}')[0], g, th0))


def headfoot_compiled(page):
    if not HAS_TEX:
        print('SKIP the header and footer compiled: no TeX tree in %s' % DIST)
        return
    png(page)
    for eng, magic in (('pdflatex', ''), ('xelatex', '% !TEX program = xelatex\n'), ('lualatex', '% !TEX program = lualatex\n')):
        doc = magic + WRAP('First words.\n\nLast words.', HF_PRE.replace('margin=2.5cm', 'margin=2.5cm,headsep=30.68pt,footskip=36pt') + '\\usepackage{graphicx}\n\\usepackage{lastpage}\n\\fancyhead[L]{\\includegraphics[height=\\baselineskip]{logo.png}}\n\\fancyfoot[R]{Page \\thepage\\ of \\pageref{LastPage}}\n')
        page.evaluate("window.rikuy.pageAssetName('logo.png', window.__logo)")
        r = pdf_of(page, doc)
        check('the header\'s logo, NumPages and geometry\'s headsep and footskip compile with %s, the words in the PDF' % eng,
              r['ok'] and not r['problems'] and r['engine'] == eng and 'Page 1 of 1' in r['text'] and 'Head' in r['text'], {'ok': r['ok'], 'engine': r['engine'], 'problems': r['problems'], 'text': r['text'][:120]})


def headfoot_phones(p):
    for w, h in ((390, 844), (360, 740)):
        br, page, errs = open_page(p, w, h, touch=True)
        tag = ' (%d px, touch)' % w
        try:
            load_doc(page, HF_DOC); page.wait_for_timeout(400)
            page.evaluate("window.rikuy.pageHFOpen('head', { page: 0 })"); page.wait_for_timeout(300)
            sel = page.evaluate("[window.rikuy.rbTab, document.getElementById('rb-tabsel') && document.getElementById('rb-tabsel').value]")
            check('the header open on a phone: the Header & Footer tab chosen in "Ribbon tab"' + tag, sel == ['headfoot', 'headfoot'], sel)
            named(page, 'Go to Footer', tap=True); page.wait_for_timeout(300)
            check('Go to Footer by a tap' + tag, page.evaluate('window.rikuy.hf && window.rikuy.hf.where') == 'foot')
            # (the ribbon's buttons are one size on a phone, the ribbon's own rule: the new ones as the old)
            sz = page.evaluate("(() => { const b = [...document.querySelectorAll('.rb-panel:not([hidden]) button')].filter((x) => x.offsetParent); const of = (n) => { const x = b.find((y) => y.getAttribute('aria-label') === n); return x ? [Math.round(x.getBoundingClientRect().width), Math.round(x.getBoundingClientRect().height)] : null; }; return { mine: ['Go to Header', 'Go to Footer', 'Header Picture', 'Header Quick Parts', 'Show Document Text'].map(of), old: of('Header') }; })()")
            check('the new buttons of the Header & Footer tab as large as the tab\'s others on a phone' + tag, sz['old'] and all(x == sz['old'] for x in sz['mine']), sz)
            os.makedirs(SHOTS, exist_ok=True)
            page.screenshot(path=os.path.join(SHOTS, 'headfoot-%d.png' % w))
        except Exception as ex:
            check('headfoot_phones runs to its end' + tag, False, repr(ex)[:300])
        br.close()


def headfoot_shots(p):
    os.makedirs(SHOTS, exist_ok=True)
    for w, h, dark in ((1920, 1080, False), (1366, 768, False), (1366, 768, True)):
        br, page, errs = open_page(p, w, h, dark=dark)
        tag = '%d%s' % (w, '-dark' if dark else '')
        try:
            load_doc(page, HF_DOC.replace('\\fancyhead[C]{Head}', '\\fancyhead[C]{Head}\\fancyhead[L]{\\includegraphics[height=\\baselineskip]{logo.png}}')); png(page)
            page.evaluate("window.rikuy.pageAssetName('logo.png', window.__logo); window.rikuy.forceRender = true; window.rikuy.rebuild()"); page.wait_for_timeout(500)
            page.evaluate("window.rikuy.pageHFOpen('head', { page: 0 })"); page.wait_for_timeout(300)
            page.get_by_role('tab', name='Header & Footer', exact=True).click(); page.wait_for_timeout(300)
            page.screenshot(path=os.path.join(SHOTS, 'headfoot-%s.png' % tag))
        except Exception as ex:
            check('headfoot shots ' + tag, False, repr(ex)[:300])
        br.close()


# ---- View: Gridlines, Zoom, Split, Vertical ---------------------------------------------------------------
LONG = WRAP('\\section{One}\n' + ('Words of the first part run on. ' * 120) + '\n\n\\section{Two}\n' + ('Words of the second part run on. ' * 120) + '\n\nThe end.', '')


def view(page):
    load_doc(page, LONG); page.wait_for_timeout(500)
    page.get_by_role('tab', name='View', exact=True).click(); page.wait_for_timeout(200)
    named(page, 'Gridlines'); page.wait_for_timeout(150)
    bg = page.evaluate("getComputedStyle(document.querySelector('#pages .page .pb')).backgroundImage")
    check('View › Gridlines: lines over the page\'s text area, the source as it was', 'repeating-linear-gradient' in bg and src(page) == LONG and pressed(page, 'view-gridlines-page') is True, bg[:80])
    named(page, 'Gridlines'); page.wait_for_timeout(150)
    check('and off again', page.evaluate("getComputedStyle(document.querySelector('#pages .page .pb')).backgroundImage") == 'none')
    # Zoom: the dialog, 75 %, Text width, Many pages
    named(page, 'Zoom dialog'); page.wait_for_timeout(200)
    dlg = page.get_by_role('dialog', name='Zoom', exact=True)
    radios = [dlg.get_by_role('radio', name=n, exact=True).count() for n in ('200%', '100%', '75%', 'Page width', 'Text width', 'Whole page', 'Many pages')]
    check('Zoom…: Word\'s choices, 200 %, 100 %, 75 %, Page width, Text width, Whole page, Many pages, and a percent', radios == [1] * 7 and dlg.get_by_role('spinbutton', name='Percent', exact=True).count() == 1, radios)
    dlg.get_by_role('radio', name='75%', exact=True).check(); dlg.get_by_role('button', name='OK', exact=True).click(); page.wait_for_timeout(400)
    z = page.evaluate('Math.round(window.rikuy.px / (96 / 72.27) * 100)')
    check('75 %: the page at three quarters of its size', z == 75, z)
    page.evaluate("window.rikuy.runCommand('zoom-dialog', { zoom: 'text' })"); page.wait_for_timeout(400)
    tw = page.evaluate("(() => { const g = window.rikuy.layout.g, d = document.getElementById('desk'); return (g.tw * window.rikuy.px) / d.clientWidth; })()")
    check('Text width: the text block across the window', 0.85 < tw <= 1.0, tw)
    page.evaluate("window.rikuy.runCommand('zoom-dialog', { zoom: 'many', pages: 3 })"); page.wait_for_timeout(400)
    across = page.evaluate("(() => { const p = [...document.querySelectorAll('#pages > .page')].slice(0, 3).map((x) => x.getBoundingClientRect().top); return p.length === 3 && Math.abs(p[0] - p[2]) < 2; })()")
    check('Many pages, 3: three pages side by side', across)
    page.evaluate("window.rikuy.runCommand('zoom-dialog', { zoom: 1 })"); page.wait_for_timeout(300)
    # Vertical and Side to Side, a pair
    page.evaluate("window.rikuy.runCommand('side-to-side')"); page.wait_for_timeout(200)
    check('Side to Side pressed, Vertical not', pressed(page, 'side-to-side') is True and pressed(page, 'page-vertical') is False)
    page.evaluate("window.rikuy.runCommand('page-vertical')"); page.wait_for_timeout(200)
    check('Vertical: the pages one under the other again', pressed(page, 'side-to-side') is False and pressed(page, 'page-vertical') is True)
    # Split: a second view, scrolled on its own, kept current; a press in it takes the caret there
    page.evaluate("window.rikuy.runCommand('split-view')"); page.wait_for_timeout(500)
    sv = page.evaluate("(() => { const v = document.getElementById('split-view'), d = document.getElementById('desk'); if (!v) return null; const a = v.getBoundingClientRect(), b = d.getBoundingClientRect(); return { below: a.top >= b.bottom - 1, words: v.textContent.includes('second part'), ids: v.querySelectorAll('[id]').length, edit: v.querySelectorAll('[contenteditable=true]').length }; })()")
    check('Split: a second view under the first, the same pages, no ids twice, not editable', sv and sv['below'] and sv['words'] and sv['ids'] == 0 and sv['edit'] == 0, sv)
    page.evaluate("document.getElementById('split-view').scrollTop = 2000"); page.wait_for_timeout(100)
    tops = page.evaluate("[document.getElementById('desk').scrollTop, document.getElementById('split-view').scrollTop]")
    check('each view scrolled on its own', tops[0] != tops[1], tops)
    page.evaluate("() => { const g = window.rikuy, s = g.files.get('main.tex'); g.commit([{ f: 'main.tex', s: s.indexOf('The end.'), e: s.indexOf('The end.') + 8, t: 'The very end.' }], null, 'test'); }"); page.wait_for_timeout(800)
    check('an edit shows in the second view too', page.evaluate("document.getElementById('split-view').textContent.includes('The very end.')"))
    ok = page.evaluate("""(() => { const v = document.getElementById('split-view'); const sp = [...v.querySelectorAll('[data-g]')].find((x) => x.textContent.includes('second part')); if (!sp) return false; sp.dispatchEvent(new MouseEvent('click', { bubbles: true })); const c = window.rikuy.caretNow(); return !!c && window.rikuy.files.get('main.tex').slice(c.a - 40, c.a + 40).includes('second part'); })()""")
    check('a press in the second view puts the caret there in the first', ok)
    page.evaluate("window.rikuy.runCommand('split-view')"); page.wait_for_timeout(300)
    check('Split again: one view, the page as it was', page.evaluate("!document.getElementById('split-view') && document.getElementById('desk').parentElement.id === 'main'"))


# ---- References: Update Table, Update Index -----------------------------------------------------------------
def refs_update(page):
    doc = WRAP('\\tableofcontents\n\n\\section{Alpha}\nText.\n\n\\begin{figure}[h]\\centering\\rule{1cm}{1cm}\\caption{A box}\\end{figure}\n\n\\listoffigures\n\n\\section{Beta}\nMore\\index{word}.\n\n\\printindex', '\\usepackage{makeidx}\n\\makeindex\n')
    load_doc(page, doc); page.wait_for_timeout(400)
    page.get_by_role('tab', name='References', exact=True).click(); page.wait_for_timeout(200)
    names = [n for n in ('Update Table', 'Update Table of Figures', 'Update Index') if page.get_by_role('button', name=n, exact=True).count() == 1 and page.get_by_role('button', name=n, exact=True).is_enabled()]
    check('References shows Update Table, Update Table (of figures) and Update Index, on where the document has them', len(names) == 3, names)
    h0 = hist(page)
    named(page, 'Update Table'); page.wait_for_timeout(100)
    flash = page.evaluate("document.querySelectorAll('#pages .toc.rk-updated').length")
    toast = page.evaluate("() => (document.querySelector('.toast') || {}).textContent || ''")
    check('Update Table: the contents rebuilt and flashed on the page, the source untouched, the toast says when the PDF takes it', flash >= 1 and hist(page) == h0 and 'up to date on the page' in toast, (flash, toast))
    page.evaluate("() => { const g = window.rikuy, s = g.files.get('main.tex'); g.commit([{ f: 'main.tex', s: s.indexOf('Beta'), e: s.indexOf('Beta') + 4, t: 'Gamma' }], null, 'test'); }"); page.wait_for_timeout(300)
    named(page, 'Update Table'); page.wait_for_timeout(200)
    check('after a heading changed: the contents read Gamma', 'Gamma' in page.evaluate("document.querySelector('#pages .toc').textContent"))
    named(page, 'Update Index'); page.wait_for_timeout(100)
    check('Update Index flashes the index', page.evaluate("document.querySelectorAll('#pages .rk-updated').length") >= 1)
    load_doc(page, WRAP('No lists.', '')); page.wait_for_timeout(200); page.evaluate("document.getElementById('pages').focus()")
    page.get_by_role('tab', name='References', exact=True).click(); page.wait_for_timeout(200)
    check('in a document with no contents Update Table is off', page.get_by_role('button', name='Update Table', exact=True).is_disabled())


# ---- Equation: Convert, Unicode and LaTeX, Normal Text, Equation Options -------------------------------------
EQ = WRAP('Before.\n\n\\begin{equation}\n  \\frac{a+b}{c} = x^{2}\n\\end{equation}\n\nAfter.', '\\usepackage{amsmath}\n')


def open_eq(page):
    page.click('#pages .dm >> nth=0')
    page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=15000)
    page.wait_for_timeout(200)


def equation(page):
    load_doc(page, EQ); page.wait_for_timeout(300)
    open_eq(page)
    page.get_by_role('tab', name='Equation', exact=True).click(); page.wait_for_timeout(200)
    names = [n for n in ('Convert', 'Unicode', 'LaTeX format', 'Normal Text') if page.get_by_role('button', name=n, exact=True).count() == 1]
    check('the Equation tab\'s Conversions: Convert, Unicode, LaTeX, Normal Text', len(names) == 4, names)
    page.evaluate("window.rikuy.runCommand('eq-unicode')")
    page.evaluate("window.rikuy.runCommand('eq-convert', { to: 'linear' })"); page.wait_for_timeout(200)
    v = page.get_by_role('textbox', name='The equation, in Word\'s linear format', exact=True).input_value()
    check('Convert › Linear (Unicode): the equation as Word types it, (a+b)/c=x^2', v == '(a+b)/c=x^2', v)
    box = page.get_by_role('textbox', name='The equation, in Word\'s linear format', exact=True)
    box.fill('(a+b)/c=√(x+1)'); page.wait_for_timeout(400)
    s = src(page)
    check('typed in linear: x^{2} becomes \\sqrt{x+1}, the rest of the line\'s bytes kept', '  \\frac{a+b}{c} = \\sqrt{x+1}\n' in s, s[s.find('equation'):][:100])
    page.evaluate("window.rikuy.runCommand('eq-convert', { to: 'professional' })"); page.wait_for_timeout(300)
    check('Convert › Professional: the field again, built up', page.evaluate("!document.querySelector('.pop-math math-field').hidden && document.querySelector('#pop-lin').hidden"))
    page.evaluate("window.rikuy.runCommand('eq-latex-format')"); page.wait_for_timeout(100)
    page.evaluate("window.rikuy.runCommand('eq-convert', { to: 'linear' })"); page.wait_for_timeout(200)
    st = page.evaluate("[document.querySelector('.pop-math math-field').hidden, document.activeElement && document.activeElement.id]")
    check('with LaTeX chosen, Linear is the equation\'s LaTeX to type in', st == [True, 'pop-tex'], st)
    page.evaluate("window.rikuy.runCommand('eq-convert', { to: 'professional' })"); page.wait_for_timeout(200)
    page.evaluate("window.rikuy.runCommand('eq-unicode')")
    # Normal Text: words in the field are \text{}
    page.evaluate("document.querySelector('.pop-math math-field').focus(); document.querySelector('.pop-math math-field').executeCommand('moveToMathfieldEnd')")
    page.evaluate("window.rikuy.runCommand('eq-normal-text')"); page.wait_for_timeout(100)
    check('Normal Text pressed: the field types words', pressed(page, 'eq-normal-text') is True)
    page.keyboard.type(' if'); page.wait_for_timeout(500)
    s = src(page)
    check('typed words come as \\text{…} in the source', '\\text{ if}' in s or '\\text{if}' in s, s[s.find('equation'):][:120])
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    # Equation Options: Alt+= on an empty line makes the kind chosen
    page.evaluate("window.rikuy.runCommand('eq-options', { newEnv: 'equation*', format: 'unicode' })")
    check('Equation Options kept', page.evaluate('window.rikuy.prefs.eqNewEnv') == 'equation*')
    page.evaluate("window.rikuy.runCommand('eq-options')"); page.wait_for_timeout(200)
    dlg = page.get_by_role('dialog', name='Equation Options', exact=True)
    check('its dialog reads them back', dlg.get_by_role('radio', name='Unnumbered (equation*)', exact=True).is_checked())
    dlg.get_by_role('radio', name='Numbered (equation)', exact=True).check(); dlg.get_by_role('button', name='OK', exact=True).click(); page.wait_for_timeout(200)
    check('and OK sets them again', page.evaluate('window.rikuy.prefs.eqNewEnv') == 'equation')


# The review of PR 84, H1: a space typed in the Linear box rewrote \hat{x}, \frac{a}{b}^2, \leftarrow
# and \mathbf{v} into LaTeX that did not compile. Now nothing but what is typed moves.
LIN_EQ = '\\hat{x} = \\frac{a}{b}^2 \\leftarrow \\mathbf{v}'


def equation_linear(page):
    doc = WRAP('Text.\n\\begin{equation}\n' + LIN_EQ + '\n\\end{equation}\nMore.\n\n\\begin{equation}\n\\frac{1}m + x\n\\end{equation}\nEnd.', '\\usepackage{amsmath}\n')
    load_doc(page, doc); page.wait_for_timeout(300)
    open_eq(page)
    run_cmd(page, 'eq-unicode'); run_cmd(page, 'eq-convert', {'to': 'linear'}); page.wait_for_timeout(300)
    box = page.get_by_role('textbox', name='The equation, in Word\'s linear format', exact=True)
    v = box.input_value()
    check('Linear shows commands it has no form for as written, a fraction with a script in Word\'s 〖 〗', v == '\\hat{x}=〖a/b〗^2←\\mathbf{v}', v)
    box.press('End'); page.keyboard.type(' '); page.wait_for_timeout(500)
    check('a space typed at the end: the source byte for byte as it was', src(page) == doc, body(src(page))[:160])
    h0 = hist(page)
    page.keyboard.type('+1'); page.wait_for_timeout(500)
    s1 = src(page)
    check('+1 typed: only +1 added, the rest of the equation\'s bytes kept', s1 == doc.replace(LIN_EQ, LIN_EQ + '+1'), body(s1)[:160])
    page.keyboard.press('Home'); page.keyboard.type('y=')
    page.wait_for_timeout(500)
    s2 = src(page)
    check('y= typed at the start: written before \\hat, nothing else moved', s2 == doc.replace(LIN_EQ, 'y=' + LIN_EQ + '+1'), body(s2)[:160])
    page.keyboard.press('Escape'); page.wait_for_timeout(400)
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(300)
    check('one undo: the bytes of before', src(page) == doc, (hist(page), h0))
    # an equation the linear format would change (\frac{1}m reads back as \frac{1}{m}) waits for Enter
    page.click('#pages .dm >> nth=1')
    page.wait_for_function('document.activeElement && document.activeElement.id === "pop-field"', timeout=15000)
    page.wait_for_timeout(200)
    run_cmd(page, 'eq-convert', {'to': 'linear'}); page.wait_for_timeout(300)
    box = page.get_by_role('textbox', name='The equation, in Word\'s linear format', exact=True)
    box.press('End'); page.keyboard.type('y'); page.wait_for_timeout(500)
    note = page.evaluate("(() => { const n = document.getElementById('pop-lin-note'); return n && !n.hidden ? n.textContent : ''; })()")
    check('typing there writes nothing yet, and says Enter will', src(page) == doc and 'Enter writes' in note, note)
    page.keyboard.press('Enter'); page.wait_for_timeout(500)
    s3 = src(page)
    check('Enter writes it, as Word builds an equation up on Enter', '\\frac{1}{m}+xy' in s3, body(s3)[-120:])
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(300)
    check('and one undo takes it back', src(page) == doc)


# ---- Insert: Signature Line, Date & Time and Object on the ribbon --------------------------------------------
def insert_text(page):
    doc = WRAP('Yours sincerely,\n\nThe end.', '')
    load_doc(page, doc); page.wait_for_timeout(300)
    page.evaluate("() => { const sp = [...document.querySelectorAll('#pages span.t')].find((x) => x.textContent.includes('sincerely')); const r = document.createRange(); r.setStart(sp.firstChild, 3); r.collapse(true); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }")
    page.wait_for_timeout(100)
    page.get_by_role('tab', name='Insert', exact=True).click(); page.wait_for_timeout(200)
    names = [n for n in ('Signature Line', 'Date & Time', 'Object') if page.get_by_role('button', name=n, exact=True).count() == 1]
    check('Insert › Text holds Signature Line, Date & Time and Object, as Word\'s', len(names) == 3, names)
    named(page, 'Signature Line'); page.wait_for_timeout(200)
    dlg = page.get_by_role('dialog', name='Signature Setup', exact=True)
    dlg.get_by_role('textbox', name='Suggested signer', exact=True).fill('Ada Lovelace')
    dlg.get_by_role('textbox', name='Suggested signer\'s title', exact=True).fill('Analyst & Co')
    h0 = hist(page)
    dlg.get_by_role('button', name='OK', exact=True).click(); page.wait_for_timeout(300)
    s = src(page)
    want = '\\par\\bigskip\\bigskip\n\\noindent\\rule{6cm}{0.4pt}\\\\\nAda Lovelace\\\\\nAnalyst \\& Co\\\\\n\\today\\par\n'
    check('Signature Line: room, a 6 cm line, the name, the title (its & written \\&), the date, after the paragraph, one step', want in s and s.index(want) > s.index('sincerely') and hist(page) == h0 + 1, s[s.find('sincerely'):][:200])
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
    check('one undo: the bytes of before', src(page) == doc)


def rest_compiled(page):
    if not HAS_TEX:
        print('SKIP the rest compiled: no TeX tree in %s' % DIST)
        return
    body_ = ('Yours sincerely,\n\n\\par\\bigskip\\bigskip\n\\noindent\\rule{6cm}{0.4pt}\\\\\nAda Lovelace\\\\\nAnalyst \\& Co\\\\\n\\today\\par\n\n'
             '\\begin{equation*}\n  \\frac{a+b}{c}=\\sqrt{x+1}\\text{ if }x>0\n\\end{equation*}\n'
             '\\begin{equation}\ny=' + LIN_EQ + '+1\n\\end{equation}\n')
    for eng, magic in (('pdflatex', ''), ('xelatex', '% !TEX program = xelatex\n'), ('lualatex', '% !TEX program = lualatex\n')):
        r = pdf_of(page, magic + WRAP(body_, '\\usepackage{amsmath}\n'))
        miss = [w for w in ('Ada Lovelace', 'Analyst & Co', 'sincerely', 'if') if w not in r['text']]
        check('the signature line and an equation from Linear with Normal Text compile with %s, the words in the PDF' % eng, r['ok'] and not r['problems'] and r['engine'] == eng and not miss, {'ok': r['ok'], 'engine': r['engine'], 'problems': r['problems'], 'missing': miss})


def rest_phones(p):
    for w, h in ((390, 844), (360, 740)):
        br, page, errs = open_page(p, w, h, touch=True)
        tag = ' (%d px, touch)' % w
        try:
            load_doc(page, LONG); page.wait_for_timeout(400)
            page.evaluate("window.rikuy.runCommand('zoom-dialog')"); page.wait_for_timeout(300)
            fit = page.evaluate("(() => { const d = document.querySelector('.pop'); const r = d.getBoundingClientRect(); const small = [...d.querySelectorAll('button, select, label.tb-r')].filter((x) => x.offsetParent && x.getBoundingClientRect().height < 43.5); return { in: r.left >= 0 && r.right <= innerWidth + 1, small: small.length }; })()")
            check('Zoom… inside the screen, its choices 44 px' + tag, fit['in'] and fit['small'] == 0, fit)
            page.get_by_role('radio', name='Whole page', exact=True).tap(); page.get_by_role('button', name='OK', exact=True).tap(); page.wait_for_timeout(400)
            whole = page.evaluate("(() => { const p = document.querySelector('#pages .page').getBoundingClientRect(), d = document.getElementById('desk').getBoundingClientRect(); return p.height <= d.height + 1; })()")
            check('Whole page by taps: a page in the window' + tag, whole)
            page.evaluate("window.rikuy.runCommand('split-view')"); page.wait_for_timeout(500)
            sv = page.evaluate("(() => { const v = document.getElementById('split-view'); return !!v && v.getBoundingClientRect().height > 100 && document.documentElement.scrollWidth <= innerWidth + 1; })()")
            check('Split on a phone: the second view under the first, nothing wider than the screen' + tag, sv)
            os.makedirs(SHOTS, exist_ok=True)
            page.screenshot(path=os.path.join(SHOTS, 'split-%d.png' % w))
            page.evaluate("window.rikuy.runCommand('split-view')")
            load_doc(page, WRAP('Yours sincerely,', '')); page.wait_for_timeout(300)
            page.evaluate("() => { const sp = [...document.querySelectorAll('#pages span.t')].find((x) => x.textContent.includes('sincerely')); const r = document.createRange(); r.setStart(sp.firstChild, 3); r.collapse(true); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }")
            page.evaluate("window.rikuy.runCommand('signature-line')"); page.wait_for_timeout(300)
            page.get_by_role('textbox', name='Suggested signer', exact=True).fill('Ada')
            page.get_by_role('button', name='OK', exact=True).tap(); page.wait_for_timeout(300)
            check('Signature Line by a tap on OK' + tag, '\\noindent\\rule{6cm}{0.4pt}\\\\\nAda\\\\' in src(page), src(page)[-160:])
        except Exception as ex:
            check('rest_phones runs to its end' + tag, False, repr(ex)[:300])
        br.close()


def rest_shots(p):
    os.makedirs(SHOTS, exist_ok=True)
    for w, h, dark in ((1920, 1080, False), (1366, 768, False), (1366, 768, True)):
        br, page, errs = open_page(p, w, h, dark=dark)
        tag = '%d%s' % (w, '-dark' if dark else '')
        try:
            load_doc(page, LONG); page.wait_for_timeout(400)
            page.get_by_role('tab', name='View', exact=True).click(); page.wait_for_timeout(200)
            page.evaluate("window.rikuy.runCommand('view-gridlines-page'); window.rikuy.runCommand('split-view')"); page.wait_for_timeout(600)
            page.screenshot(path=os.path.join(SHOTS, 'view-split-gridlines-%s.png' % tag))
            page.evaluate("window.rikuy.runCommand('view-gridlines-page'); window.rikuy.runCommand('split-view')")
            page.evaluate("window.rikuy.runCommand('zoom-dialog')"); page.wait_for_timeout(300)
            page.screenshot(path=os.path.join(SHOTS, 'view-zoom-%s.png' % tag))
            page.keyboard.press('Escape')
            load_doc(page, EQ); page.wait_for_timeout(300); open_eq(page)
            page.get_by_role('tab', name='Equation', exact=True).click(); page.wait_for_timeout(200)
            page.evaluate("window.rikuy.runCommand('eq-convert', { to: 'linear' })"); page.wait_for_timeout(300)
            page.screenshot(path=os.path.join(SHOTS, 'equation-linear-%s.png' % tag))
            page.keyboard.press('Escape'); page.wait_for_timeout(200)
            load_doc(page, WRAP('Yours sincerely,', '')); page.wait_for_timeout(300)
            page.get_by_role('tab', name='Insert', exact=True).click(); page.wait_for_timeout(200)
            page.evaluate("() => { const sp = [...document.querySelectorAll('#pages span.t')][0]; const r = document.createRange(); r.setStart(sp.firstChild, 2); r.collapse(true); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }")
            page.evaluate("window.rikuy.runCommand('signature-line')"); page.wait_for_timeout(300)
            page.screenshot(path=os.path.join(SHOTS, 'insert-signature-%s.png' % tag))
        except Exception as ex:
            check('rest shots ' + tag, False, repr(ex)[:300])
        br.close()


def run():
    names = sys.argv[1:]
    with sync_playwright() as p:
        browser, page, errors = open_page(p)
        for f in (tables, tables_compiled, headfoot, headfoot_forms, headfoot_compiled, view, refs_update, equation, equation_linear, insert_text, rest_compiled):
            if names and f.__name__ not in names:
                continue
            try: f(page)
            except Exception as e: check(f.__name__ + ' runs to its end', False, str(e)[:400])
        check('no page errors', not [e for e in errors if 'tree.wasm' not in e and 'TeX' not in e], errors[:4])
        browser.close()
        for f in (tables_phones, shots, headfoot_phones, headfoot_shots, rest_phones, rest_shots):
            if names and f.__name__ not in names:
                continue
            f(p)
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    run()
