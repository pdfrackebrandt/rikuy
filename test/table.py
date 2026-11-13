"""Tables in Word's way (src/cmd/table.js, src/table.js, src/ui/tablepicker.js), in Chromium.

Insert › Table: the two by two table in booktabs (its \\usepackage once), the grid of sizes by
mouse and keys, Insert Table…, Convert Text to Table, a table from a .csv; the contextual tabs
Table Design and Table Layout in a cell; the round trip rule (test/browser.py's roundtrip) on
Insert above, below, left, right against Delete Rows and Columns, Merge Cells against Split Cells,
Header Row, Total Row, Banded Rows, First Column, Banded Columns, each look of the gallery, All
Borders, Bottom Border on one cell, the alignments, AutoFit Window, Repeat Header Rows, Text
Direction, Shading; hand written tables (\\hline grids, booktabs by hand, \\cellcolor, >{\\bfseries})
shown as what they are and edited in their own style; Tab in the last cell, Ctrl+Enter in a cell
(and outside one: nothing of the table's); Select Cell, Row, Column, Table shown as a block of
cells; Sort, Convert to Text, Delete Cells, Split Table, Distribute, Cell Margins, Pen Weight and
Pen Color, Table Properties, the caption; the packages each needs, once (xcolor's table option
before TikZ loads xcolor); the page drawing merged rows, turned words, banded rows, bold columns,
a table in a group with its settings; the right click menu; and, where dist/tex holds a TeX tree,
every construct compiled in the page.

RIKUY_DIST names another dist/."""
import os, sys, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import open_page, check, results, src, load_doc, click_text, select_text, roundtrip, place, pressed
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist')
PRE = '\\usepackage{booktabs}\n'
WRAP = lambda body, pre=PRE: '\\documentclass{article}\n' + pre + '\\begin{document}\n' + body + '\n\\end{document}\n'
FLOAT = lambda tab, cap='Results': 'Before it.\n\n\\begin{table}[h]\n\\centering\n' + tab + '\n\\caption{' + cap + '}\n\\end{table}\n\nAfter it.'
BOOK = '\\begin{tabular}{ll}\n\\toprule\nHead & Other \\\\\n\\midrule\none & two \\\\\nthree & four \\\\\n\\bottomrule\n\\end{tabular}'
GRID = '\\begin{tabular}{|l|l|}\n\\hline\nHead & Other \\\\ \\hline\none & two \\\\ \\hline\nthree & four \\\\ \\hline\n\\end{tabular}'
PLAIN = '\\begin{tabular}{ll}\nHead & Other \\\\\none & two \\\\\nthree & four \\\\\n\\end{tabular}'
DOC = WRAP(FLOAT(BOOK))


def run_cmd(page, cid, args=None):
    return page.evaluate('([id, a]) => window.rikuy.runCommand(id, a)', [cid, args])


def at_src(page, needle, k=0, f='main.tex'):
    """The caret in the cell that holds the source position of needle (+ k)."""
    page.evaluate('''([n, k, f]) => { const g = window.rikuy, p = g.files.get(f).indexOf(n) + k; document.getElementById('pages').focus(); g.caretToCell(f, p); }''', [needle, k, f])
    page.wait_for_timeout(120)


def sel(needle, k=0):
    """The caret placed by at_src, as roundtrip()'s select."""
    return lambda page: at_src(page, needle, k)


def cmd_fn(cid, args=None, where=None):
    """A command with arguments, and the caret put somewhere first, as a function for roundtrip()."""
    def f(page):
        if where: at_src(page, *where) if isinstance(where, tuple) else at_src(page, where)
        run_cmd(page, cid, args)
    f.__name__ = cid
    return f


def shown_tabs(page):
    return page.evaluate("[...document.querySelectorAll('#rb-tabs [role=tab]')].filter((t) => !t.hidden).map((t) => t.textContent)")


# ---- inserting ------------------------------------------------------------------------------

def inserting(page):
    plain = WRAP('First paragraph here.\n\nSecond paragraph here.', '')
    load_doc(page, plain); click_text(page, 'First paragraph', 3)
    run_cmd(page, 'table'); page.wait_for_timeout(200)
    want = '\\begin{table}[h]\n\\centering\n\\begin{tabular}{ll}\n\\toprule\n &  \\\\\n\\midrule\n &  \\\\\n\\bottomrule\n\\end{tabular}\n\\caption{}\n\\end{table}'
    s = src(page)
    check('Table: a two by two table in booktabs after the paragraph, \\usepackage{booktabs} added once, one step', want in s and s.count('\\usepackage{booktabs}') == 1 and s.index('First paragraph here.') < s.index(want) < s.index('Second'), s[:400])
    page.keyboard.type('Name'); page.wait_for_timeout(150)
    check('the caret in its first cell: typing goes there', '\\toprule\nName &  \\\\' in src(page), src(page)[60:220])
    page.evaluate('window.rikuy.undo()'); page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(150)
    check('undo takes the table and its package out, byte for byte', src(page) == plain, src(page)[:200])
    # a document that has booktabs already: not twice
    load_doc(page, WRAP('Words.')); click_text(page, 'Words', 2)
    run_cmd(page, 'table', {'rows': 3, 'cols': 4}); page.wait_for_timeout(200)
    s = src(page)
    check('with booktabs loaded it is not loaded again; three rows of four columns', s.count('booktabs') == 1 and '\\begin{tabular}{llll}' in s and s.count(' &  &  &  \\\\') == 3, s[:300])
    # the grid of sizes: the Table button's arrow, by mouse
    load_doc(page, plain); click_text(page, 'Second paragraph', 3)
    page.get_by_role('tab', name='Insert', exact=True).click(); page.wait_for_timeout(150)
    page.locator('#ri-table-x').click(); page.wait_for_timeout(200)
    grid = page.get_by_role('grid', name='Table size', exact=True)
    check('Insert › Table\'s arrow opens the grid of sizes, ten by eight, with Insert Table…, Convert Text to Table… and Table from Data File… under it',
          grid.count() == 1 and page.locator('.tp-cell').count() == 80 and page.get_by_role('menuitem', name='Insert Table…', exact=True).count() == 1
          and page.get_by_role('menuitem', name='Table from Data File…', exact=True).count() == 1)
    page.locator('#tp-2-3').hover(); page.mouse.move(*[v + 1 for v in page.evaluate("() => { const b = document.getElementById('tp-2-3').getBoundingClientRect(); return [b.left + 4, b.top + 4]; }")]); page.wait_for_timeout(100)
    head = page.locator('#tp-head').text_content()
    check('pointing at a size says it, as Word does ("4×3 Table")', head == '4×3 Table', head)
    page.locator('#tp-2-3').click(); page.wait_for_timeout(250)
    s = src(page)
    check('a press inserts a table of that size after the caret\'s paragraph', '\\begin{tabular}{llll}' in s and s.count(' &  &  &  \\\\') == 3 and s.index('Second paragraph') < s.index('\\begin{table}'), s[:420])
    # by the keyboard: the arrow's down arrow, then the grid's arrows and Enter
    load_doc(page, plain); click_text(page, 'Second paragraph', 3)
    page.locator('#ri-table-x').focus(); page.keyboard.press('ArrowDown'); page.wait_for_timeout(200)
    for k in ('ArrowRight', 'ArrowRight', 'ArrowDown'):
        page.keyboard.press(k)
    page.keyboard.press('Enter'); page.wait_for_timeout(250)
    s = src(page)
    check('by the keyboard: the arrows pick 3 columns by 2 rows, Enter inserts it', '\\begin{tabular}{lll}' in s and s.count(' &  &  \\\\') == 2, s[:400])
    page.get_by_role('tab', name='Home', exact=True).click()
    # Insert Table…: the dialog
    load_doc(page, plain); click_text(page, 'Second paragraph', 3)
    run_cmd(page, 'insert-table-dialog'); page.wait_for_timeout(200)
    dlg = page.get_by_role('dialog', name='Insert Table', exact=True)
    dlg.get_by_role('spinbutton', name='Number of columns', exact=True).fill('3')
    dlg.get_by_role('spinbutton', name='Number of rows', exact=True).fill('4')
    dlg.get_by_role('radio', name='AutoFit to window', exact=True).check()
    dlg.get_by_role('button', name='OK', exact=True).click(); page.wait_for_timeout(250)
    s = src(page)
    check('Insert Table…: 3 columns, 4 rows, fit to window: tabularx with X columns, tabularx loaded', '\\begin{tabularx}{\\linewidth}{XXX}' in s and s.count(' &  &  \\\\') == 4 and '\\usepackage{tabularx}' in s and s.count('\\end{tabularx}') == 1, s[:500])
    # Convert Text to Table
    csv = WRAP('Name, Age, City\n\nAda, 36, London\n\nAlan, 41, Wilmslow\n\nAfter.', '')
    load_doc(page, csv)
    page.evaluate('''() => { const sp = [...document.querySelectorAll('#pages span.t')]; const a = sp.find((x) => x.textContent.includes('Name')), z = sp.find((x) => x.textContent.includes('Wilmslow'));
      const r = document.createRange(); r.setStart(a.firstChild, 0); r.setEnd(z.firstChild, z.textContent.indexOf('Wilmslow') + 8); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }''')
    page.wait_for_timeout(150)
    run_cmd(page, 'text-to-table'); page.wait_for_timeout(200)
    dlg = page.get_by_role('dialog', name='Convert Text to Table', exact=True)
    check('Convert Text to Table…: the dialog counts 3 columns and 3 rows, cut at commas', dlg.count() == 1 and '3 columns, 3 rows' in dlg.text_content() and dlg.get_by_role('radio', name='Commas', exact=True).is_checked(), dlg.text_content() if dlg.count() else '')
    dlg.get_by_role('button', name='OK', exact=True).click(); page.wait_for_timeout(250)
    s = src(page)
    check('and OK makes them a table: a header row, booktabs, the words in their cells', '\\toprule\nName & Age & City \\\\\n\\midrule\nAda & 36 & London \\\\\nAlan & 41 & Wilmslow \\\\\n\\bottomrule' in s and 'After.' in s and '\\usepackage{booktabs}' in s, s[:500])
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(150)
    check('one undo gives the text back', src(page) == csv)
    # Table from Data File
    load_doc(page, {'main.tex': plain, 'data.csv': 'a,b\n1,2\n'}); click_text(page, 'First', 2)
    run_cmd(page, 'table-from-data', {'file': 'data.csv'}); page.wait_for_timeout(200)
    s = src(page)
    check('Table from Data File: \\csvautobooktabular[respect all]{data.csv} in a float, csvsimple, booktabs and T1 loaded', '\\csvautobooktabular[respect all]{data.csv}' in s and '\\usepackage{csvsimple}' in s and '\\usepackage{booktabs}' in s and '\\usepackage[T1]{fontenc}' in s, s[:400])


# ---- the tabs, the round trips ----------------------------------------------------------------

def tabs_and_trips(page):
    load_doc(page, DOC); at_src(page, 'two')
    t = shown_tabs(page)
    check('in a cell the contextual tabs Table Design and Table Layout come, after Help', t[-2:] == ['Table Design', 'Table Layout'], t)
    S = lambda body: WRAP(FLOAT(body))
    # rows and columns, each against its inverse
    roundtrip(page, DOC, sel('two'), 'table-row-below', S(BOOK.replace('one & two \\\\\n', 'one & two \\\\\n &  \\\\\n')),
              off_command=cmd_fn('delete-rows', where=('one & two \\\\\n &', 13)), label='Insert below against Delete Rows')
    roundtrip(page, DOC, sel('two'), 'table-row-above', S(BOOK.replace('\\midrule\none', '\\midrule\n &  \\\\\none')),
              off_command=cmd_fn('delete-rows', where=('\\midrule\n &', 9)), label='Insert above against Delete Rows')
    roundtrip(page, DOC, sel('two'), 'table-col-right', S(BOOK.replace('{ll}', '{lll}').replace('Other \\\\', 'Other & \\\\').replace('two \\\\', 'two & \\\\').replace('four \\\\', 'four & \\\\')),
              off_command=cmd_fn('delete-columns', where=('two & ', 5)), label='Insert right against Delete Columns')
    roundtrip(page, DOC, sel('two'), 'table-col-left', S(BOOK.replace('{ll}', '{lll}').replace('Head & Other', 'Head & & Other').replace('one & two', 'one & & two').replace('three & four', 'three & & four')),
              off_command=cmd_fn('delete-columns', where=('one & &', 5)), label='Insert left against Delete Columns')
    # merge across against split
    sel2 = lambda page: page.evaluate('''() => { const sp = [...document.querySelectorAll('#pages span.t')]; const a = sp.find((x) => x.textContent === 'one'), z = sp.find((x) => x.textContent === 'two');
        const r = document.createRange(); r.setStart(a.firstChild, 0); r.setEnd(z.firstChild, 3); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }''')
    roundtrip(page, S(BOOK.replace('one & two', 'one & ')), lambda page: page.evaluate('''() => { const sp = [...document.querySelectorAll('#pages span.t')]; const a = sp.find((x) => x.textContent === 'one'); const tr = a.closest('tr'); const ts = [...tr.querySelectorAll('td span.t')], z = ts[ts.length - 1];
        const r = document.createRange(); r.setStart(a.firstChild, 0); r.setEnd(z.firstChild, z.firstChild.length); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }'''),
              'merge-cells', S(BOOK.replace('one & two', '\\multicolumn{2}{c}{one} ')), off_command=cmd_fn('split-cells', where='one'), label='Merge Cells against Split Cells')
    page.wait_for_timeout(50)
    load_doc(page, DOC); sel2(page); run_cmd(page, 'merge-cells'); page.wait_for_timeout(150)
    check('Merge Cells over two cells with words: \\multicolumn{2}{c}{one two}, one step', '\\multicolumn{2}{c}{one two} \\\\' in src(page), src(page)[100:300])
    # merge down: \multirow, its package
    load_doc(page, DOC)
    page.evaluate('''() => { const sp = [...document.querySelectorAll('#pages span.t')]; const a = sp.find((x) => x.textContent === 'one'), z = sp.find((x) => x.textContent === 'three');
        const r = document.createRange(); r.setStart(a.firstChild, 0); r.setEnd(z.firstChild, 5); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }''')
    run_cmd(page, 'merge-cells'); page.wait_for_timeout(200)
    s = src(page)
    check('Merge Cells down a column: \\multirow{2}{*}{one three}, the cell under it emptied, \\usepackage{multirow} added', '\\multirow{2}{*}{one three} & two \\\\\n & four' in s and '\\usepackage{multirow}' in s, s[:500])
    td = page.evaluate("() => { const t = [...document.querySelectorAll('#pages td')].find((x) => x.textContent.includes('one three')); return t ? [t.rowSpan, t.closest('tr').nextElementSibling.querySelectorAll('td').length] : null; }")
    check('the page draws it merged: the cell spans two rows, the row under it has one cell of its own', td == [2, 1], td)
    merged = s
    at_src(page, 'one three'); run_cmd(page, 'split-cells'); page.wait_for_timeout(150)
    check('Split Cells right after the merge: the table as it was, byte for byte (the package stays)', src(page) == WRAP(FLOAT(BOOK), PRE + '\\usepackage{multirow}\n'), src(page)[100:400])
    load_doc(page, merged); at_src(page, 'one three'); run_cmd(page, 'split-cells'); page.wait_for_timeout(150)
    check('Split Cells on a merged cell read from the source: the words in the first cell, the \\multirow gone', 'one three & two \\\\\n & four' in src(page), src(page)[100:400])
    # the style options, toggles with their hand written forms
    roundtrip(page, S(PLAIN), ('two', 1), 'header-row', S(PLAIN.replace('Head & Other \\\\', '\\textbf{Head} & \\textbf{Other} \\\\ \\hline')),
              forms=[S(PLAIN.replace('Head & Other \\\\', 'Head & Other \\\\ \\hline'))], label='Header Row')
    roundtrip(page, S(PLAIN), ('two', 1), 'total-row', S(PLAIN.replace('two \\\\\nthree & four', 'two \\\\ \\hline\n\\textbf{three} & \\textbf{four}')), label='Total Row')
    roundtrip(page, DOC, ('two', 1), 'banded-rows', WRAP(FLOAT('\\rowcolors{2}{gray!10}{}\n' + BOOK), PRE + '\\usepackage[table]{xcolor}\n'), off=WRAP(FLOAT(BOOK), PRE + '\\usepackage[table]{xcolor}\n'), label='Banded Rows')
    roundtrip(page, DOC, ('two', 1), 'first-column', WRAP(FLOAT(BOOK.replace('{ll}', '{>{\\bfseries}ll}')), PRE + '\\usepackage{array}\n'), off=WRAP(FLOAT(BOOK), PRE + '\\usepackage{array}\n'),
              forms=[WRAP(FLOAT(BOOK.replace('{ll}', '{>{\\bfseries}ll}')), PRE + '\\usepackage{array}\n')], label='First Column')
    roundtrip(page, DOC, ('two', 1), 'banded-columns', WRAP(FLOAT(BOOK.replace('{ll}', '{l>{\\columncolor{gray!10}}l}')), PRE + '\\usepackage{array}\n\\usepackage[table]{xcolor}\n'),
              off=WRAP(FLOAT(BOOK), PRE + '\\usepackage{array}\n\\usepackage[table]{xcolor}\n'), label='Banded Columns')
    # looks: grid from booktabs and back; a hand written grid shows as Table Grid
    roundtrip(page, DOC, ('two', 1), 'table-look-grid', lambda s: '{|l|l|}' in s and s.count('\\hline') == 4 and 'rule' not in s.replace('\\usepackage{booktabs}', ''),
              off_command='table-look-booktabs', label='Table Grid against Booktabs')
    load_doc(page, S(GRID)); at_src(page, 'two')
    check('a hand written \\hline grid shows as Table Grid, and as All Borders', pressed(page, 'table-look-grid') is True and pressed(page, 'border-all') is True)
    run_cmd(page, 'table-row-below'); page.wait_for_timeout(150)
    check('and a row inserted in it brings its own \\hline, in its style', 'one & two \\\\ \\hline\n &  \\\\ \\hline\nthree' in src(page), src(page)[90:300])
    roundtrip(page, S(PLAIN), ('two', 1), 'border-all', S(PLAIN.replace('{ll}', '{|l|l|}').replace('{|l|l|}\n', '{|l|l|}\n\\hline\n').replace(' \\\\', ' \\\\ \\hline')),
              forms=[S(GRID)], off=S(PLAIN), label='All Borders')
    roundtrip(page, S(PLAIN), 'two', 'border-bottom', S(PLAIN.replace('one & two \\\\', 'one & two \\\\ \\cline{2-2}')), label='Bottom Border on a selected cell')
    # alignment: one cell as \multicolumn{1}, back with the column's own
    roundtrip(page, DOC, ('two', 1), 'align-top-center', S(BOOK.replace('one & two', 'one & \\multicolumn{1}{c}{two}')), off_command='align-top-left', label='Align Top Center on a cell')
    # AutoFit Window against AutoFit Contents
    roundtrip(page, DOC, ('two', 1), 'autofit-window', WRAP(FLOAT(BOOK.replace('\\begin{tabular}{ll}', '\\begin{tabularx}{\\linewidth}{XX}').replace('\\end{tabular}', '\\end{tabularx}')), PRE + '\\usepackage{tabularx}\n'),
              off=WRAP(FLOAT(BOOK), PRE + '\\usepackage{tabularx}\n'), off_command='autofit-contents', label='AutoFit Window against AutoFit Contents')
    # Repeat Header Rows: a longtable with \endhead, the caption with it; and back
    lt = '\\begin{longtable}{ll}\n\\toprule\nHead & Other \\\\\n\\midrule\n\\endhead\none & two \\\\\nthree & four \\\\\n\\bottomrule\n\\caption{Results}\n\\end{longtable}'
    roundtrip(page, DOC, ('Head', 1), 'repeat-header', WRAP('Before it.\n\n' + lt + '\n\nAfter it.', PRE + '\\usepackage{longtable}\n'), off=WRAP(FLOAT(BOOK), PRE + '\\usepackage{longtable}\n'),
              forms=[WRAP('Before it.\n\n' + lt + '\n\nAfter it.', PRE + '\\usepackage{longtable}\n')], label='Repeat Header Rows')
    # Text Direction: up, down, level again
    load_doc(page, DOC); at_src(page, 'two')
    outs = []
    for _ in range(3):
        run_cmd(page, 'text-direction'); page.wait_for_timeout(150); outs.append(src(page)); at_src(page, 'two')
    check('Text Direction: \\rotatebox{90}, then {270}, then level again', '\\rotatebox{90}{two}' in outs[0] and '\\rotatebox{270}{two}' in outs[1] and outs[2] == WRAP(FLOAT(BOOK), PRE + '\\usepackage{graphicx}\n') and '\\usepackage{graphicx}' in outs[0], [o[150:260] for o in outs])
    load_doc(page, outs[0])
    check('the page draws the words turned', page.evaluate("!!document.querySelector('#pages td .tb-rot90')"))
    # Shading: \cellcolor with xcolor's table option; off again
    sh = cmd_fn('table-shading', {'pick': {'name': 'yellow'}}, where='two')
    roundtrip(page, DOC, ('two', 1), sh, WRAP(FLOAT(BOOK.replace('one & two', 'one & \\cellcolor{yellow} two')), PRE + '\\usepackage[table]{xcolor}\n'),
              off=WRAP(FLOAT(BOOK), PRE + '\\usepackage[table]{xcolor}\n'), off_command=cmd_fn('table-shading', {'pick': None}, where='two'), label='Shading')
    load_doc(page, WRAP(FLOAT(BOOK.replace('one & two', 'one & \\cellcolor{yellow} two')), PRE + '\\usepackage[table]{xcolor}\n'))
    bg = page.evaluate("() => { const t = [...document.querySelectorAll('#pages td')].find((x) => x.textContent.trim() === 'two'); return t ? getComputedStyle(t).backgroundColor : null; }")
    check('the page draws the cell\'s colour', bg and bg not in ('rgba(0, 0, 0, 0)', 'transparent'), bg)


# ---- keys, selecting, the menu ------------------------------------------------------------------

def keys_and_select(page):
    load_doc(page, DOC); at_src(page, 'four', 2)
    page.keyboard.press('Tab'); page.wait_for_timeout(200)
    s = src(page)
    check('Tab in the last cell adds a row under it (above \\bottomrule), the caret in its first cell', 'three & four \\\\\n &  \\\\\n\\bottomrule' in s, s[100:320])
    page.keyboard.type('x'); page.wait_for_timeout(150)
    check('typing goes into the new row\'s first cell', 'three & four \\\\\nx &  \\\\' in src(page), src(page)[100:320])
    load_doc(page, DOC); at_src(page, 'one', 1)
    page.keyboard.press('Tab'); page.wait_for_timeout(120)
    check('Tab in another cell selects the next cell\'s words, nothing written', page.evaluate('getSelection().toString()') == 'two' and src(page) == DOC)
    page.keyboard.press('Shift+Tab'); page.wait_for_timeout(120)
    check('Shift+Tab goes back', page.evaluate('getSelection().toString()') == 'one')
    load_doc(page, DOC); at_src(page, 'one', 1)
    page.keyboard.press('Control+Enter'); page.wait_for_timeout(200)
    check('Ctrl+Enter in a cell adds a row under the caret\'s, one step', 'one & two \\\\\n &  \\\\\nthree' in src(page) and page.evaluate('window.rikuy.hist.length') == 1, src(page)[100:300])
    load_doc(page, DOC); click_text(page, 'After it', 2)
    page.keyboard.press('Control+Enter'); page.wait_for_timeout(200)
    check('Ctrl+Enter outside a table adds no row (the page break is B6\'s)', '&  \\\\' not in src(page))
    # Select Cell, Row, Column, Table
    load_doc(page, DOC)
    for what, rect in (('cell', [1, 1, 1, 1]), ('row', [1, 1, 0, 1]), ('column', [0, 2, 1, 1]), ('table', [0, 2, 0, 1])):
        at_src(page, 'two'); run_cmd(page, 'select-' + what); page.wait_for_timeout(200)
        got = page.evaluate("() => { const h = window.rikuy.tableHere(window.rikuy.ribbonAt()); return h ? [h.rect.r0, h.rect.r1, h.rect.c0, h.rect.c1] : null; }")
        n = page.evaluate("document.querySelectorAll('#pages td.tsel').length")
        check('Select %s: the selection covers %s, shown as a block of %d cells' % (what.title(), rect, n), got == rect and (what == 'cell' or n == (rect[1] - rect[0] + 1) * (rect[3] - rect[2] + 1)), (got, n))
    # a selected column: Delete Columns takes it; a selected row: shading the whole row is \rowcolor
    at_src(page, 'two'); run_cmd(page, 'select-row'); page.wait_for_timeout(150)
    run_cmd(page, 'table-shading', {'pick': {'html': 'C00000'}}); page.wait_for_timeout(200)
    check('Shading a whole row: \\rowcolor[HTML]{C00000} at its start', '\\midrule\n\\rowcolor[HTML]{C00000} one & two' in src(page), src(page)[100:320])
    load_doc(page, DOC); at_src(page, 'two'); run_cmd(page, 'select-column'); page.wait_for_timeout(150)
    run_cmd(page, 'delete-columns'); page.wait_for_timeout(200)
    check('Select Column then Delete Columns: the column and its letter go', src(page) == WRAP(FLOAT(BOOK.replace('{ll}', '{l}').replace(' & Other', '').replace(' & two', '').replace(' & four', ''))), src(page)[100:320])
    # the right click menu in a cell
    load_doc(page, DOC)
    r = page.evaluate('''() => { const s = [...document.querySelectorAll('#pages span.t')].find((x) => x.textContent === 'two'); const b = s.getBoundingClientRect(); return [b.left + 3, b.top + b.height / 2]; }''')
    page.mouse.click(r[0], r[1], button='right'); page.wait_for_timeout(200)
    names = page.get_by_role('menu', name='Context menu', exact=True).get_by_role('menuitem').evaluate_all('(xs) => xs.map((x) => x.getAttribute("aria-label"))')
    want = ['Insert below', 'Insert above', 'Insert left', 'Insert right', 'Delete', 'Merge Cells', 'Split Cells', 'Distribute Columns', 'AutoFit', 'Text Direction', 'Properties', 'Insert Caption']
    check('the right click menu in a cell: the table\'s items first, in Word\'s order', names[:len(want)] == want, names[:18])
    page.get_by_role('menu', name='Context menu', exact=True).get_by_role('menuitem', name='Delete', exact=True).click(); page.wait_for_timeout(200)
    sub = page.get_by_role('menu', name='Delete', exact=True)
    check('its Delete opens Delete\'s own menu at the caret: Delete Cells…, Columns, Rows, Table', sub.count() == 1 and sub.get_by_role('menuitem').all_inner_texts() == ['Delete Cells…', 'Delete Columns', 'Delete Rows', 'Delete Table'], sub.get_by_role('menuitem').all_inner_texts() if sub.count() else None)
    sub.get_by_role('menuitem', name='Delete Rows', exact=True).click(); page.wait_for_timeout(200)
    check('and Delete Rows there takes the caret\'s row', 'one & two' not in src(page) and 'three & four' in src(page), src(page)[100:260])
    page.keyboard.press('Escape')


# ---- data, structure, settings, dialogs ----------------------------------------------------------

def the_rest(page):
    S = lambda body: WRAP(FLOAT(body))
    # Sort
    load_doc(page, S(BOOK.replace('one & two', 'zeta & 10').replace('three & four', 'alpha & 9')))
    at_src(page, 'zeta'); run_cmd(page, 'table-sort'); page.wait_for_timeout(200)
    dlg = page.get_by_role('dialog', name='Sort', exact=True)
    check('Sort…: the dialog, by the caret\'s column named by its header, the header row kept', dlg.count() == 1 and dlg.get_by_role('combobox', name='Sort by').input_value() == '0'
          and 'Column 1: Head' in dlg.get_by_role('combobox', name='Sort by').text_content() and dlg.get_by_role('radio', name='Header row', exact=True).is_checked())
    dlg.get_by_role('button', name='OK', exact=True).click(); page.wait_for_timeout(200)
    check('OK sorts the rows under the header by their words: alpha before zeta, the rules where they were', '\\midrule\nalpha & 9 \\\\\nzeta & 10 \\\\\n\\bottomrule' in src(page), src(page)[100:320])
    at_src(page, 'zeta'); run_cmd(page, 'table-sort', {'col': 1, 'header': True}); page.wait_for_timeout(200)
    check('by the second column as numbers: 9 before 10', '\\midrule\nalpha & 9 \\\\\nzeta & 10' in src(page), src(page)[100:320])
    at_src(page, 'zeta'); run_cmd(page, 'table-sort', {'col': 1, 'header': True, 'desc': True}); page.wait_for_timeout(200)
    check('down: 10 before 9', '\\midrule\nzeta & 10 \\\\\nalpha & 9' in src(page))
    # Convert to Text
    load_doc(page, DOC); at_src(page, 'two'); run_cmd(page, 'table-to-text', {'sep': ', '}); page.wait_for_timeout(200)
    check('Convert to Text with commas: each row a paragraph, the float gone, its caption kept as a paragraph', src(page) == WRAP('Before it.\n\nHead, Other\n\none, two\n\nthree, four\n\nResults\n\nAfter it.'), src(page)[60:260])
    load_doc(page, DOC); at_src(page, 'two'); run_cmd(page, 'table-to-text'); page.wait_for_timeout(200)
    check('Convert to Text… without words opens its dialog', page.get_by_role('dialog', name='Convert Table to Text', exact=True).count() == 1)
    page.keyboard.press('Escape')
    # Split Table
    load_doc(page, DOC); at_src(page, 'four'); run_cmd(page, 'split-table'); page.wait_for_timeout(200)
    check('Split Table: two tables, the first with \\bottomrule, the second with \\toprule', 'one & two \\\\\n\\bottomrule\n\\end{tabular}\n\n\\begin{tabular}{ll}\n\\toprule\nthree & four' in src(page), src(page)[100:400])
    # Delete Cells, Delete Table
    load_doc(page, DOC); at_src(page, 'one'); run_cmd(page, 'delete-cells', {'how': 'left'}); page.wait_for_timeout(200)
    check('Delete Cells, shift cells left: the row\'s words move left, an empty cell at its end', '\\midrule\ntwo &  \\\\' in src(page), src(page)[100:300])
    load_doc(page, DOC); at_src(page, 'one'); run_cmd(page, 'delete-table'); page.wait_for_timeout(200)
    check('Delete Table: the float goes with it, the paragraphs around stay', src(page) == WRAP('Before it.\n\nAfter it.'), src(page)[50:200])
    # Distribute Rows, settings: Cell Margins, Pen Weight, Pen Color, Properties
    load_doc(page, S(BOOK.replace('one & two \\\\', 'one & two \\\\[6pt]'))); at_src(page, 'two'); run_cmd(page, 'distribute-rows'); page.wait_for_timeout(150)
    check('Distribute Rows: the extra space after \\\\[6pt] goes', src(page) == DOC)
    load_doc(page, DOC); at_src(page, 'two'); run_cmd(page, 'cell-margins', {'side': '10pt', 'top': '2pt'}); page.wait_for_timeout(200)
    s = src(page)
    check('Cell Margins: \\setlength{\\tabcolsep}{10pt} and \\setlength{\\extrarowheight}{2pt} in the float, array loaded, one step', '\\centering\n\\setlength{\\tabcolsep}{10pt}\n\\setlength{\\extrarowheight}{2pt}\n\\begin{tabular}' in s and '\\usepackage{array}' in s and page.evaluate('window.rikuy.hist.length') == 1, s[60:300])
    at_src(page, 'two'); run_cmd(page, 'cell-margins', {'side': None, 'top': None}); page.wait_for_timeout(200)
    check('and back to LaTeX\'s own: the lines go', src(page) == WRAP(FLOAT(BOOK), PRE + '\\usepackage{array}\n'), src(page)[60:300])
    load_doc(page, DOC); at_src(page, 'two'); run_cmd(page, 'pen-weight', {'w': '1pt'}); page.wait_for_timeout(150)
    check('Pen Weight 1 pt: \\setlength{\\arrayrulewidth}{1pt}', '\\setlength{\\arrayrulewidth}{1pt}\n\\begin{tabular}' in src(page))
    at_src(page, 'two'); run_cmd(page, 'pen-color', {'pick': {'name': 'gray'}}); page.wait_for_timeout(150)
    check('Pen Color: \\arrayrulecolor{gray}, xcolor\'s table option', '\\arrayrulecolor{gray}' in src(page) and '\\usepackage[table]{xcolor}' in src(page), src(page)[:400])
    load_doc(page, DOC); at_src(page, 'two'); run_cmd(page, 'table-properties'); page.wait_for_timeout(200)
    dlg = page.get_by_role('dialog', name='Table Properties', exact=True)
    check('Table Properties…: its dialog, the float\'s alignment read (Center)', dlg.count() == 1 and dlg.get_by_role('radio', name='Center').first.is_checked())
    dlg.get_by_role('checkbox', name='Preferred width', exact=True).check()
    dlg.get_by_role('spinbutton', name='Column width', exact=True).fill('4')
    dlg.get_by_role('radio', name='Right', exact=True).check()
    dlg.get_by_role('button', name='OK', exact=True).click(); page.wait_for_timeout(250)
    s = src(page)
    check('OK writes what changed, as one step: \\raggedleft for the float, the caret\'s column p{4cm}', '\\raggedleft\n\\begin{tabular}{lp{4cm}}' in s and page.evaluate('window.rikuy.hist.length') == 1, s[60:300])
    # the caption
    nocap = WRAP('Before it.\n\n' + BOOK + '\n\nAfter it.')
    load_doc(page, nocap); at_src(page, 'two'); run_cmd(page, 'table-caption'); page.wait_for_timeout(200)
    check('Insert Caption on a table alone: a float around it with \\caption{} under it, the caret in the caption', '\\begin{table}[h]\n\\centering\n' + BOOK + '\n\\caption{}\n\\end{table}' in src(page), src(page)[60:400])
    page.keyboard.type('Cap'); page.wait_for_timeout(150)
    check('typing goes into the caption', '\\caption{Cap}' in src(page))
    # packages: xcolor's table option before TikZ, which loads xcolor
    tikz = WRAP(FLOAT(BOOK), PRE + '\\usepackage{tikz}\n')
    load_doc(page, tikz); at_src(page, 'two'); run_cmd(page, 'table-shading', {'pick': {'name': 'yellow'}}); page.wait_for_timeout(200)
    s = src(page)
    check('where TikZ loads xcolor first, the table option goes in before it (\\PassOptionsToPackage), no option clash', s.startswith('\\documentclass{article}\n\\PassOptionsToPackage{table}{xcolor}\n') and '\\usepackage[table]{xcolor}' not in s, s[:200])
    # dvipsnames for a colour of its names
    load_doc(page, DOC); at_src(page, 'two'); run_cmd(page, 'table-shading', {'pick': {'name': 'Apricot'}}); page.wait_for_timeout(200)
    check('a dvipsnames colour: xcolor with table and dvipsnames, once', '\\usepackage[table,dvipsnames]{xcolor}' in src(page) and '\\cellcolor{Apricot}' in src(page), src(page)[:200])


# ---- what the page draws -----------------------------------------------------------------------

def drawing(page):
    body = ('\\begin{table}[h]\n\\centering\n\\rowcolors{2}{gray!10}{}\n\\begin{tabular}{>{\\bfseries}lm{3cm}}\n\\toprule\nA & B \\\\\n\\midrule\nb1 & c1 \\\\\nb2 & c2 \\\\\nb3 & c3 \\\\\n\\bottomrule\n\\end{tabular}\n\\caption{x}\n\\end{table}\n\n'
            'Then.\n\n{\\renewcommand{\\arraystretch}{1.6}\n\\begin{tabular}{ll}\ng1 & g2 \\\\\n\\end{tabular}}\n\nEnd.')
    load_doc(page, WRAP(body, PRE + '\\usepackage[table]{xcolor}\n\\usepackage{array}\n'))
    got = page.evaluate('''() => { const td = (t) => [...document.querySelectorAll('#pages td')].find((x) => x.textContent.trim() === t);
      const bg = (t) => getComputedStyle(td(t).closest('tr')).backgroundColor;
      return { bold: td('b1').classList.contains('tb-b'), mid: td('c1').classList.contains('tb-vm'), band: [bg('A'), bg('b1'), bg('b2')], group: !!td('g1') && !!td('g1').closest('table.tb-set') }; }''')
    check('the page draws a bold column (>{\\bfseries}), an m{} column in the middle, \\rowcolors\' bands (rows 3, 5 …), a table in a group with \\arraystretch', got['bold'] and got['mid'] and got['band'][0] == got['band'][1] != got['band'][2] and got['group'], got)
    # an empty cell (&&) still takes the caret
    load_doc(page, WRAP('\\begin{tabular}{lll}\na && c \\\\\n\\end{tabular}'))
    n = page.evaluate("[...document.querySelectorAll('#pages td')].filter((x) => x.querySelector('span.t')).length")
    check('a cell with nothing in it (&&) holds a place for the caret', n == 3, n)


# ---- the hostile review's cases (each finding's case, done in the page) --------------------------

def sel_words(page, a, z):
    """A selection from the cell whose words are a to the one whose words are z."""
    page.evaluate('''([a, z]) => { const sp = [...document.querySelectorAll('#pages td span.t')]; const A = sp.find((x) => x.textContent === a), Z = sp.find((x) => x.textContent === z);
      const r = document.createRange(); r.setStart(A.firstChild, 0); r.setEnd(Z.firstChild, Z.firstChild.length); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }''', [a, z])
    page.wait_for_timeout(150)


def files_of(page):
    return page.evaluate('[...window.rikuy.files.keys()]')


def review(page):
    # H1: Rikuy's own table, filled by Tab: the new row above \bottomrule, \midrule once
    load_doc(page, WRAP('First paragraph here.\n\nSecond.', '')); click_text(page, 'First paragraph', 3)
    run_cmd(page, 'table'); page.wait_for_timeout(200)
    for w in ('h1', 'h2', 'v1', 'v2', 'n1'):
        page.keyboard.type(w); page.wait_for_timeout(80)
        if w != 'n1': page.keyboard.press('Tab'); page.wait_for_timeout(150)
    s = src(page)
    check('H1: Rikuy\'s new table filled with Tab: Tab in its last cell writes the row above \\bottomrule, \\midrule once',
          '\\toprule\nh1 & h2 \\\\\n\\midrule\nv1 & v2 \\\\\nn1 &  \\\\\n\\bottomrule\n\\end{tabular}' in s and s.count('\\midrule') == 1, s[60:400])
    at_src(page, 'h1')
    check('H1: and its Header Row shows pressed', pressed(page, 'header-row') is True)
    # H2: Insert above never copies a comment
    c = WRAP('\\begin{tabular}{ll}\na & b \\\\\n% comment (Ana) on "gamma": check this\ngamma & delta \\\\\n\\end{tabular}', '')
    load_doc(page, c); at_src(page, 'gamma'); run_cmd(page, 'table-row-above'); page.wait_for_timeout(150)
    check('H2: Insert above a row under a review comment: the comment once, the new row above it', src(page) == c.replace('a & b \\\\\n', 'a & b \\\\\n &  \\\\\n'), src(page)[40:260])
    # H7: two columns: Repeat Header Rows says why, writes nothing
    two = DOC.replace('\\documentclass{article}', '\\documentclass[twocolumn]{article}')
    load_doc(page, two); at_src(page, 'Head'); run_cmd(page, 'repeat-header'); page.wait_for_timeout(150)
    check('H7: Repeat Header Rows in a two column document: refused, nothing written', src(page) == two)
    # M4: only from the first rows
    load_doc(page, DOC); at_src(page, 'three'); run_cmd(page, 'repeat-header'); page.wait_for_timeout(150)
    check('M4: Repeat Header Rows with the caret in a body row: refused, nothing written', src(page) == DOC)
    at_src(page, 'Head'); run_cmd(page, 'repeat-header'); page.wait_for_timeout(150)
    s = src(page)
    check('M4: from the first row: that row repeats (\\endhead under it)', '\\midrule\n\\endhead\none & two' in s, s[60:400])
    # M3: Sort on a longtable with its head, "Header row" as the dialog has it
    lt = '\\begin{longtable}{ll}\n\\toprule\nName & N \\\\\n\\midrule\n\\endhead\nzeta & 3 \\\\\nalpha & 1 \\\\\nbeta & 2 \\\\\n\\bottomrule\n\\end{longtable}'
    load_doc(page, WRAP(lt, PRE + '\\usepackage{longtable}\n')); at_src(page, 'zeta'); run_cmd(page, 'table-sort', {'col': 0, 'header': True}); page.wait_for_timeout(200)
    s = src(page)
    check('M3: Sort on a longtable with \\endhead: every body row sorted, the head stays', '\\endhead\nalpha & 1 \\\\\nbeta & 2 \\\\\nzeta & 3 \\\\' in s and 'Name & N' in s, s[60:400])
    # M7: Merge down a grid, then Split: byte for byte back
    g = '\\begin{tabular}{|l|l|l|}\n\\hline\na &  &  \\\\ \\hline\nd &  & f \\\\ \\hline\ng & h & i \\\\ \\hline\n\\end{tabular}'
    gd = WRAP(g, '\\usepackage{multirow}\n')
    load_doc(page, gd); sel_words(page, 'a', 'f'); run_cmd(page, 'merge-cells'); page.wait_for_timeout(200)
    merged = src(page)
    at_src(page, 'a d f'); run_cmd(page, 'split-cells'); page.wait_for_timeout(200)
    check('M7: Merge over two ruled rows then Split: the source as it was, \\hline and spaces included', '\\multirow{2}' in merged and src(page) == gd, [merged[40:300], src(page)[40:300]])
    # M1: merged both ways, then a row inserted under it: three cells drawn, each reachable
    t3 = WRAP('\\begin{tabular}{lll}\nq1 & q2 & q3 \\\\\nq4 & q5 & q6 \\\\\nq7 & q8 & q9 \\\\\n\\end{tabular}', '\\usepackage{multirow}\n')
    load_doc(page, t3); sel_words(page, 'q1', 'q5'); run_cmd(page, 'merge-cells'); page.wait_for_timeout(200)
    at_src(page, 'q6'); run_cmd(page, 'table-row-below'); page.wait_for_timeout(200)
    n = page.evaluate("() => { const td = [...document.querySelectorAll('#pages td')].find((x) => x.textContent.trim() === 'q6'); const tr = td && td.closest('tr').nextElementSibling; return tr ? [...tr.querySelectorAll('td')].filter((x) => x.querySelector('span.t')).length : -1; }")
    check('M1: under a cell merged two by two, a new row draws its three cells', n == 3, [n, src(page)[40:300]])
    # M2: a table over two pages: Tab, Select Table and the painted block go across
    long = '\\begin{tabular}{ll}\n' + ''.join('r%da & r%db \\\\\n' % (k, k) for k in range(90)) + '\\end{tabular}'
    load_doc(page, WRAP('Before.\n\n' + long + '\n\nAfter.', '')); page.wait_for_timeout(400)
    pieces = page.evaluate("() => { const t = document.querySelector('#pages table[data-tab]'); return t ? document.querySelectorAll('#pages table[data-tab=\"' + CSS.escape(t.dataset.tab) + '\"]').length : 0; }")
    last = page.evaluate("() => { const t = document.querySelector('#pages table[data-tab]'); const sp = [...t.querySelectorAll('td span.t')]; return sp[sp.length - 1].textContent; }")
    at_src(page, last, len(last))
    before = src(page)
    page.keyboard.press('Tab'); page.wait_for_timeout(200)
    k = int(re.match(r'r(\d+)b', last).group(1)) if re.match(r'r(\d+)b', last) else -1
    check('M2: a table over pages: Tab in the last cell of a page goes to the next page\'s first cell, no row written',
          pieces >= 2 and src(page) == before and page.evaluate('getSelection().toString()') == 'r%da' % (k + 1), [pieces, last, page.evaluate('getSelection().toString()')])
    at_src(page, 'r0a'); ok = run_cmd(page, 'select-table'); page.wait_for_timeout(400)
    got = page.evaluate("() => [getSelection().toString().trim().slice(0, 3), getSelection().toString().trim().slice(-4), document.querySelectorAll('#pages table.tsel-on').length]")
    check('M2: Select Table selects every cell on every page, the block painted on each piece', ok and got[0] == 'r0a' and got[1] == 'r89b' and got[2] == pieces, [ok, got, pieces])
    # L2: one command named Outside Borders
    n = page.evaluate("window.rikuy.cmds.commands().filter((c) => c.name === 'Outside Borders').length")
    check('L2: one command named Outside Borders (the look is Box)', n == 1, n)
    # L3: a file picked in Table from Data File joins the project only with Insert, undone with it
    plain = WRAP('First paragraph here.\n\nSecond.', '')
    for button in ('Cancel', 'Insert'):
        load_doc(page, plain); click_text(page, 'First paragraph', 3); run_cmd(page, 'table-from-data'); page.wait_for_timeout(200)
        dlg = page.get_by_role('dialog', name='Table from Data File', exact=True)
        dlg.locator('input[type=file]').set_input_files({'name': 'my data.csv', 'mimeType': 'text/csv', 'buffer': b'user_id,share\nu_1,50%\n'}); page.wait_for_timeout(250)
        early = 'my_data.csv' in files_of(page)
        dlg.get_by_role('button', name=button, exact=True).click(); page.wait_for_timeout(250)
        if button == 'Cancel':
            check('L3: a file picked, then Cancel: the project as it was, no file added', not early and 'my_data.csv' not in files_of(page) and src(page) == plain, files_of(page))
        else:
            s = src(page)
            ok = 'my_data.csv' in files_of(page) and '\\csvautobooktabular[respect all]{my_data.csv}' in s and page.evaluate('window.rikuy.hist.length') == 1
            page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
            check('L3: Insert adds the file and the table as one step; Undo takes both away', ok and 'my_data.csv' not in files_of(page) and src(page) == plain, [ok, files_of(page)])
    # M6, H10: Banded Rows on a table in \resizebox{…}{!}{…} in its float: in the argument, read again, off again
    rb = WRAP(FLOAT('\\resizebox{\\linewidth}{!}{' + BOOK + '}'), PRE + '\\usepackage{graphicx}\n\\usepackage[table]{xcolor}\n')
    load_doc(page, rb); at_src(page, 'two'); run_cmd(page, 'banded-rows'); page.wait_for_timeout(200)
    s = src(page)
    at_src(page, 'two')
    on = pressed(page, 'banded-rows')
    run_cmd(page, 'banded-rows'); page.wait_for_timeout(200)
    check('M6, H10: Banded Rows on a table in \\resizebox: \\rowcolors in its argument, pressed, and off gives the source back, braces and all',
          '\\resizebox{\\linewidth}{!}{\\rowcolors{2}{gray!10}{}\n\\begin{tabular}' in s and on is True and src(page) == rb, [s[60:300], on, src(page)[60:300]])
    # H9: listings and colortbl, no xcolor: shading and banded rows load xcolor too
    lst = WRAP(FLOAT(BOOK), PRE + '\\usepackage{listings}\n\\usepackage{colortbl}\n')
    load_doc(page, lst); at_src(page, 'two'); run_cmd(page, 'table-shading', {'pick': {'name': 'yellow'}}); page.wait_for_timeout(200)
    at_src(page, 'two'); run_cmd(page, 'banded-rows'); page.wait_for_timeout(200)
    s = src(page)
    check('H9: where only listings and colortbl stand, Shading and Banded Rows write xcolor\'s table option and load xcolor',
          '\\PassOptionsToPackage{table}{xcolor}' in s and '\\usepackage{xcolor}' in s and '\\cellcolor{yellow}' in s and '\\rowcolors' in s, s[:400])
    return s


def review_compiled(page, listings_doc):
    """The cases where TeX stopped, done in the page on one document, then compiled there."""
    if not os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        print('SKIP the review\'s cases compiled in the page: no TeX tree in %s' % DIST)
        return
    tabs = [
        ('H3a', '\\begin{tabular}{lll}\n\\toprule\n\\multicolumn{2}{c}{QMhead} & Qx1 \\\\\n\\midrule\nQx2 & Qx3 & Qx4 \\\\\n\\bottomrule\n\\end{tabular}'),
        ('H3b', '\\begin{tabular}{lll}\n\\toprule\n\\cellcolor{red} Qma & Qmb & Qmc \\\\\n\\midrule\nQmd & Qme & Qmf \\\\\n\\bottomrule\n\\end{tabular}'),
        ('H3c', '\\begin{tabular}{lll}\n\\toprule\n\\cellcolor{red} Qpa & Qpb & Qpc \\\\\n\\midrule\nQpd & Qpe & Qpf \\\\\n\\bottomrule\n\\end{tabular}'),
        ('H4', '\\begin{tabular}{p{2cm}l}\n\\toprule\nQwa & Qwb \\\\\nQwc & Qwd \\\\\n\\bottomrule\n\\end{tabular}'),
        ('H5a', '\\begin{tabular*}{\\textwidth}{@{\\extracolsep{\\fill}}lr}\n\\toprule\nQsa & Qsb \\\\\n\\bottomrule\n\\end{tabular*}'),
        ('H5b', '\\begin{tabulary}{\\linewidth}{LC}\n\\toprule\nQya & Qyb \\\\\n\\bottomrule\n\\end{tabulary}'),
        ('H6', '\\begin{longtable}[]{@{}ll@{}}\n\\toprule\\noalign{}\nQPa & QPb \\\\\n\\midrule\\noalign{}\n\\endhead\n\\bottomrule\\noalign{}\n\\endlastfoot\nQHc & QHd \\\\\n\\end{longtable}'),
        ('H7', '\\begin{table}[!htbp]\n\\centering\n\\small\n\\rowcolors{2}{gray!10}{}\n\\renewcommand{\\arraystretch}{1.3}\n\\begin{tabular}{ll}\n\\toprule\nQLa & QLb \\\\\n\\midrule\nQlc & Qld \\\\\n\\bottomrule\n\\end{tabular}\n\\caption{Longer}\n\\label{tab:long}\n\\end{table}'),
        ('H8a', '\\begin{table}[h]\n\\begin{minipage}{0.45\\linewidth}\n\\centering\n\\begin{tabular}{ll}\nQka & Qkb \\\\\n\\end{tabular}\n\\end{minipage}\n\\end{table}'),
        ('H8b', '\\begin{minipage}{5cm}\n\\centering\n\\begin{tabular}{l}\nQfa \\\\\n\\end{tabular}\n\\end{minipage}'),
        ('H10', '\\begin{table}[h]\n\\centering\n\\resizebox{0.5\\linewidth}{!}{\n\\rowcolors{2}{gray!10}{}\n\\begin{tabular}{ll}\nQra & Qrb \\\\\nQrc & Qrd \\\\\n\\end{tabular}}\n\\end{table}'),
        ('H12', '\\begin{tabular}{|*{3}{c|}}\n\\hline\nQsta & Qstb & Qstc \\\\\n\\hline\n\\end{tabular}'),
        ('H11', '\\textbf{Qtx, Qty}, Qtz\n$f(x,y)$, Qtw % a note'),
    ]
    body = '\n\n'.join(t for _, t in tabs) + '\n\nEnd.'
    pre = PRE + '\\usepackage{multirow}\n\\usepackage{graphicx}\n\\usepackage{longtable}\n\\usepackage{tabulary}\n'
    load_doc(page, {'main.tex': WRAP(body, pre), 'data.csv': 'user_id,share,note\nu_1,50%,a&b $5\n#x,~y,^z\n'})
    page.wait_for_timeout(300)
    at_src(page, 'QMhead'); run_cmd(page, 'table-shading', {'pick': {'name': 'yellow'}}); page.wait_for_timeout(150)
    sel_words(page, 'Qma', 'Qmb'); run_cmd(page, 'merge-cells'); page.wait_for_timeout(150)
    at_src(page, 'Qpa'); run_cmd(page, 'align-top-center'); page.wait_for_timeout(150)
    at_src(page, 'Qwc'); run_cmd(page, 'align-top-center'); page.wait_for_timeout(150)
    at_src(page, 'Qsa'); run_cmd(page, 'autofit-window'); page.wait_for_timeout(150)
    at_src(page, 'Qya'); run_cmd(page, 'autofit-window'); page.wait_for_timeout(150)
    at_src(page, 'QHc'); run_cmd(page, 'repeat-header'); page.wait_for_timeout(150)
    at_src(page, 'QLa'); run_cmd(page, 'repeat-header'); page.wait_for_timeout(150)
    at_src(page, 'Qka'); run_cmd(page, 'table-caption'); page.wait_for_timeout(150)
    at_src(page, 'Qfa'); run_cmd(page, 'table-caption'); page.wait_for_timeout(150)
    at_src(page, 'Qra'); run_cmd(page, 'banded-rows'); page.wait_for_timeout(150)
    at_src(page, 'Qstb'); run_cmd(page, 'table-col-right'); page.wait_for_timeout(150)
    page.evaluate('''() => { const sp = [...document.querySelectorAll('#pages span.t')]; const a = sp.find((x) => x.textContent.includes('Qtx')), z = sp.find((x) => x.textContent.includes('Qtw'));
      const r = document.createRange(); r.setStart(a.firstChild, 0); r.setEnd(z.firstChild, z.textContent.indexOf('Qtw') + 3); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }''')
    page.wait_for_timeout(150)
    run_cmd(page, 'text-to-table', {'sep': ','}); page.wait_for_timeout(200)
    click_text(page, 'End', 1); run_cmd(page, 'table-from-data', {'file': 'data.csv'}); page.wait_for_timeout(200)
    s = src(page)
    wrote = {
        'H3 shading a merged cell': '\\multicolumn{2}{c}{\\cellcolor{yellow} QMhead}' in s,
        'H3 merging a shaded cell': '\\multicolumn{2}{c}{\\cellcolor{red} Qma Qmb}' in s,
        'H3 aligning a shaded cell': '\\multicolumn{1}{c}{\\cellcolor{red} Qpa}' in s,
        'H4 one cell of a p{} column, array loaded': '>{\\centering\\arraybackslash}p{2cm}}{Qwc}' in s and '\\usepackage{array}' in s,
        'H5 tabular* to tabularx as wide': '\\begin{tabularx}{\\textwidth}{X>{\\raggedleft\\arraybackslash}X}' in s,
        'H5 tabulary to tabularx as wide': '\\begin{tabularx}{\\linewidth}{X>{\\centering\\arraybackslash}X}' in s,
        'H6 pandoc\'s longtable off: \\bottomrule at the end': 'QPa & QPb \\\\\n\\midrule\\noalign{}\nQHc & QHd \\\\\n\\bottomrule\\noalign{}\n\\end{tabular}' in s,
        'H7 on: settings in a group, placement in a comment, the label in the longtable': '{\\small\n\\rowcolors{2}{gray!10}{}\n\\renewcommand{\\arraystretch}{1.3}\n\\begin{longtable}{ll} % rikuy: \\begin{table}[!htbp]' in s and '\\caption{Longer}\n\\label{tab:long}\n\\end{longtable}}' in s,
        'H8 caption in the minipage': '\\end{tabular}\n\\caption{}\n\\end{minipage}' in s,
        'H8 captionof outside a float, caption loaded': '\\end{tabular}\n\\captionof{table}{}\n\\end{minipage}' in s and '\\usepackage{caption}' in s,
        'H10 banded rows off in \\resizebox: its braces stay': '\\resizebox{0.5\\linewidth}{!}{\n\\begin{tabular}{ll}' in s,
        'H12 a column in |*{3}{c|}: bars kept': '\\begin{tabular}{|c|c|c|c|}' in s,
        'H11 text to table: braces and math whole, the comment after \\\\': '\\textbf{Qtx, Qty} & Qtz \\\\' in s and '$f(x,y)$ & Qtw \\\\ % a note' in s,
        'H13 respect all, T1 for its characters': '\\csvautobooktabular[respect all]{data.csv}' in s and '\\usepackage[T1]{fontenc}' in s,
    }
    check('the review\'s cases written in the page: ' + ', '.join(wrote), all(wrote.values()), [k for k, v in wrote.items() if not v] + [s[s.find('\\begin{document}'):][:2500]])
    for name, doc, words in (('every case above', s, ['QMhead', 'Qma Qmb', 'Qpa', 'Qwc', 'Qsa', 'Qya', 'QPa', 'QHd', 'QLa', 'Longer', 'Qka', 'Qfa', 'Qra', 'Qstc', 'Qtx, Qty', 'Qtw', '50%', 'a&b', '#x', 'u_1']),
                             ('H9: Shading and Banded Rows with listings and colortbl, xcolor loaded by Rikuy', listings_doc, ['Head', 'two', 'four'])):
        page.set_default_timeout(600000)
        r = page.evaluate('''async (t) => { await window.rikuy.api.setSource(t); const r = await window.rikuy.api.compile();
          let b = ''; if (r.pdf) for (let i = 0; i < r.pdf.length; i += 8192) b += String.fromCharCode(...r.pdf.subarray(i, i + 8192));
          return { ok: r.ok, pages: r.pages, pdf: btoa(b), problems: (r.problems || []).filter((x) => x.severity === 'error').map((x) => x.message).slice(0, 4) }; }''', doc)
        page.set_default_timeout(30000)
        import base64, io
        from pypdf import PdfReader
        text = ' '.join(p.extract_text() or '' for p in PdfReader(io.BytesIO(base64.b64decode(r['pdf']))).pages) if r['pdf'] else ''
        miss = [w for w in words if w.replace(' ', '') not in text.replace(' ', '')]
        check('compiled in the page, no error, every word in the PDF: ' + name, r['ok'] and not r['problems'] and not miss, {'ok': r['ok'], 'problems': r['problems'], 'missing': miss})


def reviewed(page):
    review_compiled(page, review(page))


# ---- the verifier's cases on the review fixes ----------------------------------------------------

def pdf_of(page, doc, files=None):
    """Compile doc in the page (with files beside it): ok, the error problems, the PDF's text."""
    if files:
        page.evaluate('(fs) => { for (const [n, t] of Object.entries(fs)) window.rikuy.files.set(n, t); }', files)
    page.set_default_timeout(600000)
    r = page.evaluate('''async (t) => { await window.rikuy.api.setSource(t); const r = await window.rikuy.api.compile();
      let b = ''; if (r.pdf) for (let i = 0; i < r.pdf.length; i += 8192) b += String.fromCharCode(...r.pdf.subarray(i, i + 8192));
      return { ok: r.ok, engine: r.engine, pdf: btoa(b), problems: (r.problems || []).filter((x) => x.severity === 'error').map((x) => x.message).slice(0, 4) }; }''', doc)
    page.set_default_timeout(30000)
    import base64, io
    from pypdf import PdfReader
    r['text'] = ' '.join(p.extract_text() or '' for p in PdfReader(io.BytesIO(base64.b64decode(r['pdf']))).pages) if r['pdf'] else ''
    return r


def verified(page):
    has_tex = os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm'))
    # R1: Repeat Header Rows on a float with settings: the page still draws a table, off gives it back
    flt = WRAP('Intro.\n\n\\begin{table}[!htbp]\n\\centering\n\\small\n\\rowcolors{2}{gray!10}{}\n\\setlength{\\tabcolsep}{3pt}\n\\begin{tabular}{ll}\n\\toprule\nHead & Other \\\\\n\\midrule\nbanana & 2 \\\\\napple & 10 \\\\\n\\bottomrule\n\\end{tabular}\n\\caption{Results}\n\\label{tab:r}\n\\end{table}\n\nAfter.',
               PRE + '\\usepackage[table]{xcolor}\n')
    load_doc(page, flt); at_src(page, 'Head'); run_cmd(page, 'repeat-header'); page.wait_for_timeout(300)
    on = src(page)
    drawn = page.evaluate("() => [...document.querySelectorAll('#pages td')].map((t) => t.textContent.trim()).filter(Boolean)")
    small = page.evaluate("() => { const t = [...document.querySelectorAll('#pages td')].find((x) => x.textContent.trim() === 'banana'); return !!t && !!t.closest('table.z-small'); }")
    check('R1: Repeat Header Rows on a float with \\small, \\rowcolors, \\tabcolsep: a longtable in a group of them, which the page draws as a table, small',
          '{\\small\n\\rowcolors{2}{gray!10}{}\n\\setlength{\\tabcolsep}{3pt}\n\\begin{longtable}{ll}' in on and 'banana' in drawn and 'Head' in drawn and small, [on[60:400], drawn[:6], small])
    at_src(page, 'banana')
    check('R1: and the caret goes into its cells, Repeat Header Rows pressed', pressed(page, 'repeat-header') is True)
    run_cmd(page, 'repeat-header'); page.wait_for_timeout(300)
    check('R1: off again: the float as it was, byte for byte (longtable stays loaded)', src(page).split('\\begin{document}')[1] == flt.split('\\begin{document}')[1] and '\\usepackage{longtable}' in src(page), src(page)[60:400])
    if has_tex:
        r = pdf_of(page, on)
        miss = [w for w in ('Head', 'banana', 'apple', 'Results') if w not in r['text']]
        check('R1: the longtable in its group compiles in the page, every word in the PDF', r['ok'] and not r['problems'] and not miss, {'ok': r['ok'], 'problems': r['problems'], 'missing': miss})
    # R2: Table from Data File adds T1 only for pdfLaTeX, and reads the files the preamble reads
    csv = 'user_id,score %\nab_c,5\nx&y,$3\n'
    body = 'Intro words, ä ö ü, “quoted” — dash.\n\nAfter.'
    docs = {
        'xelatex': '% !TEX program = xelatex\n' + WRAP(body, ''),
        'lualatex': '% !TEX program = lualatex\n' + WRAP(body, ''),
        'polyglossia': WRAP(body, '\\usepackage{polyglossia}\n\\setmainlanguage{english}\n'),
        'unicode-math': WRAP(body, '\\usepackage{unicode-math}\n'),
        'babel onchar': WRAP(body, '\\usepackage[english]{babel}\n\\babelprovide[import=hi, onchar=ids fonts]{hindi}\n'),
        'fontenc in an \\input file': WRAP(body, '\\input{settings}\n'),
    }
    got = {}
    for k, d in docs.items():
        load_doc(page, {'main.tex': d, 'data.csv': csv, 'settings.tex': '\\usepackage[T1]{fontenc}\n'}); click_text(page, 'Intro', 2)
        run_cmd(page, 'table-from-data', {'file': 'data.csv'}); page.wait_for_timeout(250)
        got[k] = src(page)
    check('R2: Table from Data File writes no T1 for XeLaTeX, LuaLaTeX (magic comment, polyglossia, unicode-math, babel\'s onchar), nor where an \\input file loads fontenc',
          all('\\csvautobooktabular[respect all]{data.csv}' in s and '{fontenc}' not in s.split('\\begin{document}')[0] for s in got.values()), {k: s[:160] for k, s in got.items() if '{fontenc}' in s.split('\\begin{document}')[0]})
    load_doc(page, {'main.tex': WRAP(body, ''), 'data.csv': csv}); click_text(page, 'Intro', 2)
    run_cmd(page, 'table-from-data', {'file': 'data.csv'}); page.wait_for_timeout(250)
    pdfdoc = src(page)
    check('R2: in a pdfLaTeX document T1 still comes (its _ prints as _)', '\\usepackage[T1]{fontenc}' in pdfdoc, pdfdoc[:200])
    if has_tex:
        page.evaluate("() => window.rikuy.files.set('data.csv', 'user_id,score %\\nab_c,5\\nx&y,$3\\n')")
        r = pdf_of(page, got['xelatex'])
        miss = [w for w in ('ä', 'ö', 'ü', '“quoted”', '—', 'ab_c', 'x&y', '$3') if w not in r['text']]
        check('R2: the XeLaTeX document with its data table compiles in the page, every character in the PDF', r['ok'] and not r['problems'] and r['engine'] == 'xelatex' and not miss, {'ok': r['ok'], 'engine': r['engine'], 'problems': r['problems'], 'missing': miss})
    # H7: two columns set by a project's .sty in \maketitle, or by an \input file before the table
    sty = '\\NeedsTeXFormat{LaTeX2e}\n\\ProvidesPackage{acl}\n\\renewcommand\\maketitle{\\twocolumn[\\centering\\@title]}\n'
    for name, files in (('a project .sty (acl.sty\'s \\maketitle)', {'main.tex': DOC.replace(PRE, PRE + '\\usepackage{acl}\n'), 'acl.sty': sty}),
                        ('an \\input file before the table', {'main.tex': DOC.replace('Before it.', '\\input{cols}\nBefore it.'), 'cols.tex': '\\twocolumn\n'})):
        load_doc(page, files); at_src(page, 'Head'); run_cmd(page, 'repeat-header'); page.wait_for_timeout(200)
        check('H7: Repeat Header Rows refused where two columns come from ' + name, src(page) == files['main.tex'], src(page)[60:300])
    # R5: painting a selection on a table of 3000 rows takes one look at each cell
    big = WRAP('\\begin{tabular}{ll}\n' + ''.join('a%d & b%d \\\\\n' % (k, k) for k in range(3000)) + '\\end{tabular}', '')
    load_doc(page, big); page.wait_for_timeout(2500); sel_words(page, 'a0', 'b1')
    ms = page.evaluate('() => { const at = window.rikuy.ribbonAt(); const t = performance.now(); window.rikuy.tablePaintSelection(at); return performance.now() - t; }')
    check('R5: the block of a selection painted on a table of 3000 rows in under 300 ms (it took a second)', ms < 300, ms)
    # R6: Insert Caption in a subtable that has one: the caret goes to it, nothing written
    sub = WRAP('\\begin{table}[h]\n\\begin{subtable}{0.5\\linewidth}\n\\centering\n\\begin{tabular}{ll}\nka & kb \\\\\n\\end{tabular}\n\\caption{Sub one}\n\\end{subtable}\n\\end{table}', PRE + '\\usepackage{subcaption}\n')
    load_doc(page, sub); at_src(page, 'ka'); run_cmd(page, 'table-caption'); page.wait_for_timeout(200)
    check('R6: Insert Caption where the subtable has a caption: nothing written, a second caption never', src(page) == sub, src(page)[60:300])


# ---- compiled -------------------------------------------------------------------------------------

def compiled(page):
    if not os.path.isfile(os.path.join(DIST, 'tex', 'tree.wasm')):
        print('SKIP the tables compiled in the page: no TeX tree in %s' % DIST)
        return
    doc = WRAP('\\begin{table}[h]\n\\centering\n\\rowcolors{2}{gray!10}{}\n\\setlength{\\tabcolsep}{8pt}\n\\begin{tabularx}{\\linewidth}{>{\\bfseries}lX>{\\centering\\arraybackslash}m{2cm}}\n\\toprule\n'
               '\\multicolumn{2}{c}{Merged head} & \\rotatebox{90}{Up} \\\\\n\\midrule\n\\multirow{2}{*}{Tall} & \\cellcolor{yellow} Shaded & m1 \\\\\n & Under & m2 \\\\\n\\cmidrule{2-3}\nLast & row & m3 \\\\\n\\bottomrule\n\\end{tabularx}\n\\caption{All of it}\n\\end{table}\n\n'
               '\\begin{longtable}{ll}\n\\toprule\nHeadL & HeadR \\\\\n\\midrule\n\\endhead\nlt1 & lt2 \\\\\n\\bottomrule\n\\caption{Long}\n\\end{longtable}\n',
               PRE + '\\usepackage[table]{xcolor}\n\\usepackage{array}\n\\usepackage{tabularx}\n\\usepackage{multirow}\n\\usepackage{graphicx}\n\\usepackage{longtable}\n')
    page.set_default_timeout(600000)
    r = page.evaluate('''async (t) => { await window.rikuy.api.setSource(t); const r = await window.rikuy.api.compile();
      let b = ''; if (r.pdf) for (let i = 0; i < r.pdf.length; i += 8192) b += String.fromCharCode(...r.pdf.subarray(i, i + 8192));
      return { ok: r.ok, pages: r.pages, pdf: btoa(b), problems: (r.problems || []).filter((x) => x.severity === 'error').map((x) => x.message).slice(0, 4) }; }''', doc)
    import base64, io
    from pypdf import PdfReader
    r['text'] = ' '.join(p.extract_text() or '' for p in PdfReader(io.BytesIO(base64.b64decode(r['pdf']))).pages) if r['pdf'] else ''
    page.set_default_timeout(30000)
    words = ['Merged head', 'Up', 'Tall', 'Shaded', 'Under', 'Last', 'All of it', 'HeadL', 'lt1', 'Long']
    check('compiled in the page: booktabs, \\multicolumn, \\multirow, \\rotatebox, \\cellcolor, \\rowcolors, tabularx, m{}, longtable with \\endhead, no error, every word in the PDF',
          r['ok'] and not r['problems'] and all(w.replace(' ', '') in r['text'].replace(' ', '') for w in words), {k: r[k] for k in ('ok', 'pages', 'problems')} | {'missing': [w for w in words if w.replace(' ', '') not in r['text'].replace(' ', '')]})


def run():
    with sync_playwright() as p:
        browser, page, errors = open_page(p)
        names = sys.argv[1:]
        for f in (inserting, tabs_and_trips, keys_and_select, the_rest, drawing, reviewed, verified, compiled):
            if names and f.__name__ not in names:
                continue
            try: f(page)
            except Exception as e: check(f.__name__ + ' runs to its end', False, str(e)[:400])
        check('no page errors', not [e for e in errors if 'tree.wasm' not in e and 'TeX' not in e], errors[:4])
        browser.close()
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    run()
