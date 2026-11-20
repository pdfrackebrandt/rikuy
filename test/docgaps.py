"""The document agent's Word gaps (PLAN task 68), in Chromium, by the round trip rule (test/browser.py
roundtrip): tables (Table Properties' tabs: preferred width, text wrapping, repeat as header row, cell
margins; Borders and Shading, Border Styles, Pen Style, Border Painter; Formula and Update
Formulas; View Gridlines; Draw Table and Eraser), each drawn on the page as TeX prints it; where
dist/tex holds a TeX tree, what they write compiled in the page with pdfLaTeX, XeLaTeX and LuaLaTeX;
phones at 390 and 360 px with touch; screenshots in $RIKUY_SHOTS (default /tmp/g2-shots).

python3 docgaps.py [section ...]: tables, tables_compiled, tables_phones, shots."""
import os, sys, base64, io
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
        if where: at_src(page, where)
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
              off=DOC.replace(PRE, PRE + '\\usepackage{array}\n\\usepackage{tabularx}\n'), label='Table Properties: Preferred width 80 %', off_command=cmd_fn('table-properties', {'width': None}))
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
          '{tabular}{|l|l|}' in s and s.count('\\hline') == 4 and s.count('\\cellcolor{gray!10}') == 6 and '\\usepackage[table]{xcolor}' in s and hist(page) == h0 + 1, body(s)[:400])
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
    check('Eraser on the edge between "three" and "four", where no bar stands: the two cells merged (\\multicolumn{2}{l}{three four})', '\\multicolumn{2}{l}{three four}' in s or '\\multicolumn{2}{l}{three  four}' in s, body(s)[:240])
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
    summed = DOC.replace('\\centering\n\\begin{tabular}', '\\centering\n% formula B5: =SUM(ABOVE)\n\\begin{tabular}').replace('Total & \\\\', 'Total & 10 \\\\')
    roundtrip(page, DOC, lambda p: at_src(p, 'Total & ', 8), cmd_fn('table-formula', {'text': '=SUM(ABOVE)', 'format': ''}), summed, label='Formula =SUM(ABOVE)',
              off_command=lambda p: (at_src(p, 'Total & ', 8), run_cmd(p, 'table-formula', {'text': '=SUM(ABOVE)', 'format': ''})))
    load_doc(page, summed); page.wait_for_timeout(200)
    drawn = page.evaluate("() => [...document.querySelectorAll('#pages .tab td')].map((t) => t.textContent.trim()).includes('10')")
    check('the page shows the value 10 in the Total row', drawn)
    # change a price by typing in the source, then Update Formulas
    page.evaluate("() => { const g = window.rikuy, s = g.files.get('main.tex'); g.commit([{ f: 'main.tex', s: s.indexOf('pears & 3') + 8, e: s.indexOf('pears & 3') + 9, t: '30' }], null, 'test'); }")
    at_src(page, 'apples')
    h0 = hist(page)
    run_cmd(page, 'update-formulas'); page.wait_for_timeout(250)
    s = src(page)
    check('Update Formulas after pears became 30: Total 37, one step', 'Total & 37 \\\\' in s and hist(page) == h0 + 1, body(s)[:400])
    # the dialog: a number format, the preview, OK
    load_doc(page, DOC); at_src(page, 'Total & ', 8); run_cmd(page, 'table-formula'); page.wait_for_timeout(250)
    dlg = page.get_by_role('dialog', name='Formula', exact=True)
    v = dlg.get_by_role('textbox', name='Formula', exact=True).input_value()
    check('Formula… suggests =SUM(ABOVE) where numbers stand above', v == '=SUM(ABOVE)', v)
    dlg.get_by_role('textbox', name='Formula', exact=True).fill('=AVERAGE(ABOVE)')
    dlg.get_by_role('combobox', name='Number format', exact=True).select_option('0.00')
    prev = dlg.locator('.tb-fout').inner_text()
    check('its preview reads B5 will read 3.33', 'B5 will read 3.33' in prev, prev)
    dlg.get_by_role('button', name='OK', exact=True).click(); page.wait_for_timeout(250)
    s = src(page)
    check('OK: 3.33 in the cell, the formula with Word\'s \\# "0.00" switch on its line', 'Total & 3.33 \\\\' in s and '% formula B5: =AVERAGE(ABOVE) \\# "0.00"' in s, body(s)[:300])
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
            load_doc(page, DOC); at_src(page, 'apples')
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


def run():
    names = sys.argv[1:]
    with sync_playwright() as p:
        browser, page, errors = open_page(p)
        for f in (tables, tables_compiled):
            if names and f.__name__ not in names:
                continue
            try: f(page)
            except Exception as e: check(f.__name__ + ' runs to its end', False, str(e)[:400])
        check('no page errors', not [e for e in errors if 'tree.wasm' not in e and 'TeX' not in e], errors[:4])
        browser.close()
        for f in (tables_phones, shots):
            if names and f.__name__ not in names:
                continue
            f(p)
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    run()
