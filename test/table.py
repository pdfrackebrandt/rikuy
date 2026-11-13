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
    check('Table from Data File: \\csvautobooktabular{data.csv} in a float, csvsimple and booktabs loaded', '\\csvautobooktabular{data.csv}' in s and '\\usepackage{csvsimple}' in s and '\\usepackage{booktabs}' in s, s[:400])


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
    at_src(page, 'one three'); run_cmd(page, 'split-cells'); page.wait_for_timeout(150)
    check('Split Cells on it: the words in the first cell, the \\multirow gone', 'one three & two \\\\\n & four' in src(page), src(page)[100:400])
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
        for f in (inserting, tabs_and_trips, keys_and_select, the_rest, drawing, compiled):
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
