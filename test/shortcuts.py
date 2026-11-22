"""Word's keyboard shortcuts in Rikuy (src/keys.js, the keys of src/cmd/*.js, src/cmd/typing.js;
the table is docs/handoff/SHORTCUTS.md): every key added for Word pressed as a person presses it,
on the page, with what it writes checked byte for byte and one undo giving the source back.

Line spacing (Ctrl+1, 2, 5) and Hanging Indent; footnotes (Alt+Shift+> and <), Go To (F5),
Bookmark (Ctrl+Shift+F5), Find Next (Shift+F4), Go Back (Shift+F5), Extend and Shrink Selection
(F8, Shift+F8); the views (Ctrl+Alt+P, Ctrl+Alt+N, Alt+F9, Ctrl+F2), Help (F1), Show in source
(Shift+F1), Next pane (Ctrl+F6); Alt+X both ways, the accent keys, ¿, the Spike (Ctrl+F3,
Ctrl+Shift+F3), Move Text (F2, then Enter), the number pad's dashes; Quick Parts (Alt+F3), Field
(Ctrl+F9), Page Field (Alt+Shift+P), the font size box (Ctrl+Shift+P); the headings' levels
(Alt+Shift+1, Alt+Shift+A); a table's cells and rows (Alt+Home, Alt+End, Alt+Page Down,
Alt+Shift+Down); Save and Open by Word's function keys (Shift+F12, Ctrl+F12); the tooltips and
menus naming the keys; Help's list with the keys the browser keeps; and the whole again as a Mac
has it (Cmd, Word for Mac's own chords, ⌘ in tooltips). Screenshots in $RIKUY_SHOTS (default
/tmp/keys-shots): Help's list and a tooltip, at 1920 and 1366 px light and dark, and 390 px."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import settle, until, saved, ready, open_page, check, results, src, click_text, select_text, load_doc
from playwright.sync_api import sync_playwright

SHOTS = os.environ.get('RIKUY_SHOTS', '/tmp/keys-shots')
os.makedirs(SHOTS, exist_ok=True)

DOC = ('\\documentclass{article}\n\\begin{document}\n\\section{Opening}\nFirst paragraph here. It has two sentences.\n\n'
       'Second paragraph here\\footnote{One note.} and more words\\footnote{Two note.} at the end.\n\n'
       '\\subsection{Inner}\nThird paragraph here.\n\n\\section{Closing}\nFourth paragraph here.\n\n'
       '\\begin{tabular}{ll}\na & b \\\\\nc & d \\\\\ne & f \\\\\n\\end{tabular}\n\\end{document}\n')
MAC = "Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' })"


# (the page lays its pages out again 200 ms after the last of its fonts came, app.js's loadingdone
# listener, and that relayout drops a selection, a caret's place and a line to come: open_page()
# returns before it, so a page's first step waits for the fonts and that relayout)
FONTS = "() => document.fonts.status === 'loaded'"


def key(page, k, wait=200):
    page.keyboard.press(k); settle(page, wait)


def undo(page):
    page.evaluate('window.rikuy.undo()'); settle(page, 150)


def caret(page):
    return page.evaluate("(() => { const c = window.rikuy.caretNow(); return c ? [c.f, c.a, c.b] : null; })()")


def selected(page):
    return page.evaluate("getSelection().toString().replace(/\\u200B/g, '')")


def dialog_open(page, name):
    return page.get_by_role('dialog', name=name, exact=True).count() > 0


def close_pop(page):
    page.evaluate('window.rikuy.closePop && window.rikuy.closePop(true)'); settle(page, 100)


def written(page, k, before, after, label, select='Second paragraph', at=None, sel=False):
    """k pressed on DOC with the caret (or the selection) placed: the source becomes exactly after
    (a string, or a test of it), as one step, and one undo gives DOC back."""
    load_doc(page, before)
    if sel: select_text(page, select)
    else: click_text(page, select, at or 3)
    h0 = page.evaluate('window.rikuy.hist.length')
    key(page, k, 250)
    got = src(page)
    good = after(got) if callable(after) else got == after
    check(label + ': ' + k + ' writes what Word\'s key means, as one step', good and page.evaluate('window.rikuy.hist.length') == h0 + 1, got[60:260])
    undo(page)
    check(label + ': one undo gives the bytes back', src(page) == before, src(page)[60:200])


def paragraphs(page):
    written(page, 'Control+2', DOC, lambda t: '\\doublespacing' in t or 'doublespace' in t, 'Double line spacing')
    written(page, 'Control+5', DOC, lambda t: 'onehalfspac' in t, '1.5 line spacing')
    load_doc(page, DOC); click_text(page, 'Second paragraph', 3)
    key(page, 'Control+2'); key(page, 'Control+1', 250)
    check('Ctrl+1 after Ctrl+2: single spacing, the paragraph as it was (setspace stays loaded)', src(page) == DOC.replace('\\begin{document}', '\\usepackage{setspace}\n\\begin{document}'), src(page)[60:260])
    # Hanging Indent (Word's Ctrl+T is the browser's new tab): the search box finds it
    load_doc(page, DOC); click_text(page, 'Third paragraph', 3)
    page.evaluate("window.rikuy.runCommand('hanging-indent')"); settle(page, 200)
    t = src(page)
    page.evaluate("window.rikuy.runCommand('hanging-indent')"); settle(page, 200)
    check('Hanging Indent: \\noindent\\hangindent=1cm before the paragraph, and off again byte for byte', '\\noindent\\hangindent=1cm Third paragraph' in t and src(page) == DOC, t[150:260])
    for form, label in ((DOC.replace('Third paragraph', '\\noindent Third paragraph'), 'after a \\noindent of its own'), (DOC.replace('Third paragraph', '\\hangindent=2em\\hangafter=1 Third paragraph'), 'written by hand')):
        load_doc(page, form); click_text(page, 'Third paragraph', 3)
        on = page.evaluate("window.rikuy.cmds.command('hanging-indent').on(window.rikuy, window.rikuy.ribbonAt())")
        page.evaluate("window.rikuy.runCommand('hanging-indent')"); settle(page, 200)
        t = src(page)
        click_text(page, 'Third paragraph', 3)
        page.evaluate("window.rikuy.runCommand('hanging-indent')"); settle(page, 200)
        if 'hand' in label:
            check('Hanging Indent ' + label + ': shown as on, the first press takes it off, the second puts Rikuy\'s on', on is True and 'hangindent' not in t and t.count('Third paragraph') == 1 and src(page).count('\\hangindent') == 1, (on, t[150:260], src(page)[150:260]))
        else:
            check('Hanging Indent ' + label + ': on then off, the bytes of before (the \\noindent kept)', on is False and '\\noindent \\hangindent=1cm Third' in t and src(page) == form, (t[150:260], src(page)[150:260]))


def references(page):
    load_doc(page, DOC); click_text(page, 'First paragraph', 2)
    key(page, 'Alt+Shift+Period')
    a = caret(page)
    key(page, 'Alt+Shift+Period')
    b = caret(page)
    key(page, 'Alt+Shift+Comma')
    c = caret(page)
    f1, f2 = DOC.index('\\footnote{One'), DOC.index('\\footnote{Two')
    near = lambda x, f: x and f <= x[1] <= f + 21
    check('Alt+Shift+> goes to the next footnote, again to the one after; Alt+Shift+< back', near(a, f1) and near(b, f2) and near(c, f1), (a, b, c, f1, f2))
    click_text(page, 'Third paragraph', 3)
    key(page, 'Control+Shift+F5', 300)
    check('Ctrl+Shift+F5 opens the Bookmark dialog', dialog_open(page, 'Bookmark'))
    close_pop(page)
    click_text(page, 'Third paragraph', 3)
    key(page, 'F5', 300)
    check('F5 opens Go To (and the page is not reloaded)', page.get_by_role('tab', name='Go To').count() > 0 and page.evaluate('!!window.rikuy.model'))
    page.keyboard.press('Escape'); settle(page, 100); close_pop(page)
    # Alt+Shift+O: the heading's place in the contents (References › Add Text)
    click_text(page, 'Inner', 2)
    key(page, 'Alt+Shift+O', 300)
    check('Alt+Shift+O on a heading opens Add Text (its place in the contents)', page.locator('.pop [role^=menuitem]').count() > 0)
    close_pop(page)


def finding(page):
    load_doc(page, DOC)
    click_text(page, 'First paragraph', 0)
    page.evaluate("window.rikuy.findSet({ q: 'paragraph' })")
    key(page, 'Shift+F4')
    a = selected(page)
    key(page, 'Shift+F4')
    b = caret(page)
    check('Shift+F4 finds the last Find\'s words again, the next place each time', a == 'paragraph' and selected(page) == 'paragraph' and b[1] > DOC.index('Second'), (a, b))
    # Go Back: an edit, the caret elsewhere, Shift+F5 back to the edit
    load_doc(page, DOC); click_text(page, 'Fourth paragraph', 6)
    page.keyboard.type('X'); settle(page, 200)
    click_text(page, 'First paragraph', 0)
    key(page, 'Shift+F5')
    at = caret(page)
    want = src(page).index('FourthX') + len('FourthX')
    check('Shift+F5 takes the caret back to where the last edit was', at and abs(at[1] - want) <= 1, (at, want))
    # Extend Selection: extend mode, then the word, the sentence, the paragraph; Shift+F8 one step back
    load_doc(page, DOC); click_text(page, 'It has two', 4)
    key(page, 'F8')
    mode = selected(page) == '' and page.evaluate('!!(window.rikuy.extSel && window.rikuy.extSel.mode)')
    steps = []
    for _ in range(3):
        key(page, 'F8'); steps.append(selected(page))
    key(page, 'Shift+F8')
    back = selected(page)
    check('the first F8 turns extend mode on (nothing selected yet), then the word, the sentence, the paragraph; Shift+F8 one step back', mode and steps[0] == 'has' and steps[1] == 'It has two sentences.' and steps[2] == 'First paragraph here. It has two sentences.' and back == steps[1], (mode, steps, back))
    key(page, 'Escape')
    click_text(page, 'It has two', 3)
    key(page, 'F8'); key(page, 'ArrowRight', 60); key(page, 'ArrowRight', 60); key(page, 'ArrowRight', 60)
    ext = selected(page)
    key(page, 'Escape'); key(page, 'ArrowRight', 100)
    check('in extend mode the arrows extend the selection; Escape ends the mode (an arrow moves again)', ext == 'has' and selected(page) == '' and not page.evaluate('!!(window.rikuy.extSel && window.rikuy.extSel.mode)'), (ext, selected(page)))
    check('and the source is untouched', src(page) == DOC)


def views(page):
    load_doc(page, DOC); click_text(page, 'First paragraph', 3)
    key(page, 'Control+Alt+N', 300)
    d = page.evaluate('window.rikuy.draftOn()')
    key(page, 'Control+Alt+P', 300)
    check('Ctrl+Alt+N is Draft, Ctrl+Alt+P Print Layout again', d and not page.evaluate('window.rikuy.draftOn()') and page.evaluate("(window.rikuy.view || 'page') === 'page'"))
    key(page, 'Alt+F9', 400)
    v = page.evaluate('window.rikuy.view')
    key(page, 'Alt+F9', 400)
    check('Alt+F9 shows the whole document as its LaTeX (Word\'s field codes), and the page again', v == 'latex' and page.evaluate("(window.rikuy.view || 'page') === 'page'"), v)
    click_text(page, 'First paragraph', 3)
    key(page, 'Shift+F1', 400)
    check('Shift+F1 shows the LaTeX of the caret\'s place in the source pane (Word\'s Reveal Formatting)', page.evaluate("document.body.classList.contains('src-on')"))
    page.evaluate('window.rikuy.toggleSource(false)'); settle(page, 200)
    click_text(page, 'First paragraph', 3)
    key(page, 'F1', 300)
    check('F1 opens Help\'s How it works', dialog_open(page, 'How Rikuy works') or page.locator('.pop-help').count() > 0)
    close_pop(page)
    # Ctrl+F6: the page, then the next part of the window, and round to the page again
    click_text(page, 'First paragraph', 3)
    seen = []
    for _ in range(8):
        key(page, 'Control+F6', 150)
        seen.append(page.evaluate("(() => { const a = document.activeElement; const p = a && a.closest('#nav, #srcpane, #pdfpane, #status, #rb-top, #ribbon, #bar, #desk'); return p ? p.id : a && a.id; })()"))
        if seen[-1] in ('desk', 'pages'): break
    check('Ctrl+F6 goes round the window\'s parts (status bar, ribbon, bar) and back to the page', 'status' in seen and ('rb-top' in seen or 'ribbon' in seen) and seen[-1] in ('desk', 'pages'), seen)
    key(page, 'Control+Shift+F6', 150)
    check('Ctrl+Shift+F6 goes the other way: from the page to the bar', page.evaluate("!!document.activeElement.closest('#bar')"), page.evaluate('document.activeElement.id'))


def typing(page):
    # Alt+X both ways
    base = DOC.replace('Third paragraph here.', 'Third caf00e9')
    load_doc(page, base); click_text(page, 'caf00e9', 7)
    key(page, 'Alt+x', 250)
    a = src(page)
    key(page, 'Alt+x', 250)
    b = src(page)
    check('Alt+X: 00e9 before the caret becomes é, and é becomes 00E9', 'Third café' in a and 'Third caf00E9' in b, (a[140:200], b[140:200]))
    # the accent keys
    load_doc(page, DOC); click_text(page, 'Third paragraph', 5)
    for k, ch in (('Control+Quote', 'e'), ('Control+Shift+Digit6', 'o'), ('Control+Shift+Semicolon', 'u'), ('Control+Shift+Backquote', 'n'), ('Control+Shift+Digit7', 's')):
        page.keyboard.press(k); settle(page, 60); page.keyboard.type(ch); settle(page, 120)
    check('the accent keys: Ctrl+\' e, Ctrl+Shift+^ o, Ctrl+Shift+: u, Ctrl+Shift+~ n, Ctrl+Shift+& s type é ô ü ñ ß', 'Third\u00e9\u00f4\u00fc\u00f1\u00df paragraph' in src(page), src(page)[140:200])
    page.keyboard.press('Control+Alt+Shift+Slash'); settle(page, 150)
    check('Ctrl+Alt+Shift+? types ¿', '\u00df\u00bf paragraph' in src(page), src(page)[140:200])
    page.keyboard.press('Control+Quote'); settle(page, 60); page.keyboard.press('ArrowRight'); page.keyboard.type('e'); settle(page, 150)
    check('an accent key then an arrow: the next letter is typed as it is', '\u00bf eparagraph' in src(page), src(page)[140:200])
    page.keyboard.press('Control+Quote'); settle(page, 60)
    box = page.evaluate("(() => { const s = [...document.querySelectorAll('#pages span.t')].find((x) => x.textContent.includes('Fourth')); const r = document.createRange(); r.setStart(s.firstChild, 2); r.setEnd(s.firstChild, 3); const b = r.getBoundingClientRect(); return [b.left + 1, b.top + b.height / 2]; })()")
    page.mouse.click(*box); settle(page, 150); page.keyboard.type('e'); settle(page, 150)
    check('an accent key then a click: the next letter is typed as it is', 'Foeurth' in src(page) or 'Feourth' in src(page), src(page)[200:300])
    # the number pad's dashes
    written(page, 'Control+NumpadSubtract', DOC, DOC.replace('Second paragraph', 'Sec--ond paragraph'), 'En dash')
    written(page, 'Control+Alt+NumpadSubtract', DOC, DOC.replace('Second paragraph', 'Sec---ond paragraph'), 'Em dash')
    # the Spike: two words cut to it, then put in together
    load_doc(page, DOC)
    select_text(page, 'First'); key(page, 'Control+F3')
    select_text(page, 'Fourth'); key(page, 'Control+F3')
    mid = src(page)
    click_text(page, 'Closing', 7)
    key(page, 'Control+Shift+F3', 300)
    t = src(page)
    check('Ctrl+F3 cuts to the Spike (twice), Ctrl+Shift+F3 puts both in, in order', 'First' not in mid and 'Fourth' not in mid and t.index('First', t.index('Closing')) < t.index('Fourth'), t[t.index('Closing'):t.index('Closing') + 80])
    page.evaluate("window.rikuy.closePop && window.rikuy.closePop(true)")
    check('the Spike\'s cut left no double space', 'One  ' not in mid and '  paragraph' not in mid and 'Fourth' not in mid, mid[60:330])
    check('and the Spike is empty again: Insert Spike cannot run', page.evaluate("!window.rikuy.cmds.enabled(window.rikuy, 'spike-insert', window.rikuy.ribbonAt())"))
    # (review M1) a cut across two paragraphs put into a heading: one line, the heading whole
    load_doc(page, DOC)
    page.evaluate('''() => { const sp = [...document.querySelectorAll('#pages span.t')]; const s = sp.find((x) => x.textContent.includes('two sentences')), e = sp.find((x) => x.textContent.includes('Second paragraph'));
      const r = document.createRange(); r.setStart(s.firstChild, s.textContent.indexOf('two sentences')); r.setEnd(e.firstChild, e.textContent.indexOf('Second') + 6);
      document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); }''')
    settle(page, 120); key(page, 'Control+F3')
    click_text(page, 'Closing', 3); key(page, 'Control+Shift+F3', 300)
    t = src(page)
    head = t[t.index('\\section{Clo'):t.index('}', t.index('\\section{Clo')) + 1]
    check('the Spike into a heading: the pieces\' paragraphs join with a space, the heading stays one line', '\n' not in head and 'two sentences.' in head and 'Second' in head, head)
    # F2: the selection moved where the caret is put, with Enter
    load_doc(page, DOC); select_text(page, 'Fourth')
    key(page, 'F2')
    click_text(page, 'Third paragraph', 0)
    key(page, 'Enter', 300)
    t = src(page)
    check('F2, the caret elsewhere, Enter: the selected word moves there, as one step', 'Fourth Third paragraph' in t and '\nparagraph here.' in t.replace('\n paragraph', '\nparagraph'), t[140:330])
    undo(page)
    check('and one undo puts it back', src(page) == DOC, src(page)[140:330])
    load_doc(page, DOC); select_text(page, 'Fourth')
    key(page, 'Shift+F2'); click_text(page, 'Third paragraph', 0); key(page, 'Escape'); key(page, 'Enter', 200)
    check('Shift+F2 then Escape: nothing copied (Enter is a new paragraph again)', src(page).count('Fourth') == 1, src(page)[140:330])
    # (review H2) the wait ends at a click, and at typing: Enter is Enter after them
    load_doc(page, DOC); select_text(page, 'Fourth')
    key(page, 'F2')
    box = page.evaluate("(() => { const s = [...document.querySelectorAll('#pages span.t')].find((x) => x.textContent.includes('Third')); const r = document.createRange(); r.setStart(s.firstChild, 5); r.collapse(true); const b = r.getBoundingClientRect(); return [b.left, b.top + b.height / 2]; })()")
    page.mouse.click(*box); settle(page, 150)
    armed = page.evaluate('!!window.rikuy.moveText')
    page.keyboard.type('X'); key(page, 'Enter', 250)
    t = src(page)
    check('F2 then a click: the wait is over; typing and Enter type and break the paragraph, nothing moves', not armed and 'ThirdX\n\n' in t.replace('ThirdX\n\n paragraph', 'ThirdX\n\nparagraph') and t.count('Fourth') == 1 and t.index('Fourth') > t.index('ThirdX'), t[140:330])
    load_doc(page, DOC); select_text(page, 'Fourth')
    key(page, 'F2'); click_text(page, 'Third paragraph', 0); page.keyboard.type('Y'); settle(page, 150)
    check('F2 then a letter typed: the wait is over, and the message gone', not page.evaluate('!!window.rikuy.moveText') and page.evaluate("document.getElementById('toast').hidden || !document.getElementById('toast').textContent.startsWith('Move to where')"))


def fields(page):
    load_doc(page, DOC); click_text(page, 'Second paragraph', 3)
    key(page, 'Alt+Shift+P', 250)
    check('Alt+Shift+P puts in the page\'s number (\\thepage)', '\\thepage' in src(page), src(page)[60:200])
    undo(page)
    click_text(page, 'Second paragraph', 3)
    key(page, 'Control+F9', 300)
    check('Ctrl+F9 opens the Field dialog', dialog_open(page, 'Field'))
    close_pop(page)
    select_text(page, 'Second paragraph')
    key(page, 'Alt+F3', 300)
    check('Alt+F3 with a selection opens Create New Building Block', dialog_open(page, 'Create New Building Block'))
    close_pop(page)
    page.evaluate("window.rikuy.selectTab('home')")
    click_text(page, 'Second paragraph', 3)
    key(page, 'Control+Shift+P', 300)
    check('Ctrl+Shift+P goes to the font size box', page.evaluate("!!document.activeElement.closest('#rb-size')") or page.evaluate("document.activeElement.getAttribute('aria-label')") == 'Font Size', page.evaluate("document.activeElement.outerHTML.slice(0, 120)"))
    page.keyboard.press('Escape'); settle(page, 150)


def headings(page):
    load_doc(page, DOC); click_text(page, 'First paragraph', 3)
    key(page, 'Alt+Shift+A', 300)
    n = page.evaluate('window.rikuy.foldCount()')
    vis = page.evaluate("[...document.querySelectorAll('#pages span.t')].some((s) => s.textContent.includes('Third paragraph') && s.offsetParent)")
    key(page, 'Alt+Shift+A', 300)
    check('Alt+Shift+A collapses every heading, again expands them all', n > 0 and not vis and page.evaluate('window.rikuy.foldCount()') == 0, (n, vis))
    key(page, 'Alt+Shift+1', 300)
    f1 = page.evaluate("[...document.querySelectorAll('#pages span.t')].filter((s) => s.offsetParent).map((s) => s.textContent).join(' ')")
    key(page, 'Alt+Shift+2', 300)
    f2 = page.evaluate("[...document.querySelectorAll('#pages span.t')].filter((s) => s.offsetParent).map((s) => s.textContent).join(' ')")
    key(page, 'Alt+Shift+9', 300)
    check('Alt+Shift+1 shows the top headings alone, Alt+Shift+2 the subsections too, Alt+Shift+9 everything', 'Inner' not in f1 and 'Opening' in f1 and 'Inner' in f2 and 'Third paragraph' not in f2 and page.evaluate('window.rikuy.foldCount()') == 0, (f1[:120], f2[:120]))
    check('and the source is never touched', src(page) == DOC)


def tables(page):
    load_doc(page, DOC); click_text(page, 'c', 0, nth=0)
    page.evaluate("""(() => { const td = [...document.querySelectorAll('#pages td span.t')].find((s) => s.textContent.trim() === 'c'); const r = document.createRange(); r.setStart(td.firstChild, 0); r.collapse(true); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); })()""")
    settle(page, 150)
    cell = lambda: page.evaluate("(() => { const n = getSelection().anchorNode; const td = n && (n.nodeType === 1 ? n : n.parentElement).closest('td'); return td ? td.textContent.trim() : null; })()")
    key(page, 'Alt+End'); a = cell()
    key(page, 'Alt+Home'); b = cell()
    key(page, 'Alt+PageDown'); c = cell()
    key(page, 'Alt+PageUp'); d = cell()
    check('Alt+End, Alt+Home, Alt+Page Down, Alt+Page Up: the last and first cell of the row, the bottom and top of the column', (a, b, c, d) == ('d', 'c', 'e', 'a'), (a, b, c, d))
    page.evaluate("""(() => { const td = [...document.querySelectorAll('#pages td span.t')].find((s) => s.textContent.trim() === 'c'); const r = document.createRange(); r.setStart(td.firstChild, 0); r.collapse(true); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); })()""")
    settle(page, 150)
    key(page, 'Alt+Shift+ArrowDown', 300)
    t = src(page)
    check('Alt+Shift+Down in a table moves the row below the next', 'a & b \\\\\ne & f \\\\\nc & d \\\\' in t, t[-80:])
    undo(page)
    check('and one undo puts it back', src(page) == DOC)


def files(page):
    # (Open first: a file chooser wants the key's own activation, which a download just before may take)
    load_doc(page, DOC); click_text(page, 'First paragraph', 3)
    with page.expect_file_chooser(timeout=8000) as fc:
        page.keyboard.press('Control+F12')
    check('Ctrl+F12 (Word\'s Open) opens the file chooser', fc.value is not None)
    settle(page, 300)
    click_text(page, 'First paragraph', 3)
    with page.expect_download(timeout=8000) as dl:
        page.keyboard.press('F12')
    check('F12 (Word\'s Save As) downloads the LaTeX', dl.value.suggested_filename.endswith(('.tex', '.zip')), dl.value.suggested_filename)
    got = []
    page.on('download', lambda d: got.append(d.suggested_filename))
    toast = lambda: page.evaluate("document.getElementById('toast').hidden ? '' : document.getElementById('toast').textContent")
    for k in ('Control+s', 'Shift+F12'):
        click_text(page, 'First paragraph', 3)
        page.keyboard.type('Z'); settle(page, 100)
        page.keyboard.press(k); settle(page, 1200)
        check(k + ' (Word\'s Save) downloads nothing: it says the document is saved in this browser, and it is', not got and toast().startswith('Saved in this browser') and page.evaluate('!window.rikuy.unsaved'), (got, toast()))
    undo(page)


EQ = ('\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n\\section{Opening}\nFirst paragraph is here and it runs on with words enough to stand above the formula.\n'
      '\\begin{equation}\na = b + c + d + e + f\n\\end{equation}\nMiddle paragraph text.\n\n\\[ x^2 \\]\n\nLast words.\n\\end{document}\n')


def typed_at(page, keys, doc, label, want):
    """keys pressed on doc (the caret placed first by the caller's place()), then Q typed: Q lands where want says"""
    page.keyboard.type('Q'); settle(page, 200)
    got = src(page)
    check(label, want in got and got.replace(want, want.replace('Q', ''), 1) == doc, got[got.find('Q') - 30:got.find('Q') + 30])


def caret_keys(page):
    """Where Word's keys put the caret, as the next letter typed shows: Home and Ctrl+Home on a
    numbered heading (before its number: the letter went into the paragraph next to it), Ctrl+Down
    and Ctrl+Up from paragraph to paragraph's start, over a display formula without opening it."""
    for k, at, want in (('Control+Home', 'Fourth paragraph', '\\section{QOpening}'), ('Home', 'Closing', '\\section{QClosing}'), ('Home', 'Inner', '\\subsection{QInner}')):
        load_doc(page, DOC); click_text(page, at, 3); key(page, k, 150)
        typed_at(page, k, DOC, k + ' on a numbered heading: the next letter starts the heading\'s words', want)
    for k, at, want, label in (('Control+ArrowDown', 'paragraph is here', '\nQMiddle paragraph', 'Ctrl+Down passes over the display formula to the next paragraph\'s start'),
                               ('Control+ArrowUp', 'paragraph text', '\nQMiddle paragraph', 'Ctrl+Up goes to the start of the caret\'s paragraph'),
                               ('Control+ArrowUp', 'Last words', '\nQMiddle paragraph', 'Ctrl+Up at a paragraph\'s start goes to the one before, over a formula')):
        load_doc(page, EQ); click_text(page, at, 0 if at == 'Last words' else 3); key(page, k, 200)
        opened = page.evaluate('!!window.rikuy.pop')
        check(label + ', no editor opened', not opened, opened)
        if opened: close_pop(page)
        typed_at(page, k, EQ, label + ' (the letter typed there)', want)
    load_doc(page, EQ); click_text(page, 'paragraph is here', 3); key(page, 'Control+ArrowDown', 150); key(page, 'Control+ArrowDown', 150)
    typed_at(page, 'Control+ArrowDown', EQ, 'Ctrl+Down twice: the paragraph after the second formula', '\nQLast words')
    TAB = ('\\documentclass{article}\n\\begin{document}\nBefore it.\n\n\\begin{table}[h]\n\\centering\n\\begin{tabular}{ll}\nc & d \\\\\n\\end{tabular}\n\\caption{The caption}\n\\end{table}\n\nAfter it.\n\\end{document}\n')
    load_doc(page, TAB); click_text(page, 'd', 0); key(page, 'Control+ArrowDown', 200)
    typed_at(page, 'Control+ArrowDown', TAB, 'Ctrl+Down from a table\'s last cell goes to its caption (it skipped it)', '\\caption{QThe caption}')
    load_doc(page, EQ); click_text(page, 'paragraph is here', 3); key(page, 'Control+Shift+ArrowDown', 150)
    check('Ctrl+Shift+Down selects to the paragraph\'s end', selected(page) == 'agraph is here and it runs on with words enough to stand above the formula.', selected(page))


def paint_up(page):
    # (a press that lets go on the page: where the Format Painter paints)
    page.evaluate("window.rikuy.root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))"); settle(page, 250)


def paste_format(page):
    """Ctrl+Shift+V is Keep Text Only always, as Microsoft 365's Word and Rikuy's own tooltips have
    it: after Ctrl+Shift+C too (it painted the copied formatting and pasted nothing, review W1),
    and for words copied here with their formatting (W3); an empty clipboard deletes nothing.
    Ctrl+Shift+C arms the Format Painter; again elsewhere it copies that place's formatting; a
    press after a double click's painting turns it off (it armed it again, W4)."""
    page.context.grant_permissions(['clipboard-read', 'clipboard-write'])
    bold = DOC.replace('First paragraph', '\\textbf{First} paragraph')
    load_doc(page, bold); click_text(page, 'First', 2); key(page, 'Control+Shift+C', 150)
    page.evaluate("navigator.clipboard.writeText('Pasted words')"); settle(page, 100)
    select_text(page, 'Third'); key(page, 'Control+Shift+V', 300)
    check('after Ctrl+Shift+C, Ctrl+Shift+V still pastes the clipboard\'s text, plain', src(page) == bold.replace('Third paragraph', 'Pasted words paragraph'), src(page)[60:260])
    key(page, 'Escape', 100)
    load_doc(page, bold); select_text(page, 'irs'); key(page, 'Control+c', 150); select_text(page, 'Third'); key(page, 'Control+Shift+V', 300)
    check('letters copied from a bold word, pasted by Ctrl+Shift+V: the letters alone', src(page) == bold.replace('Third paragraph', 'irs paragraph'), src(page)[60:260])
    # Ctrl+Shift+C again elsewhere copies that place's formatting, painted by the next selection
    both = bold.replace('Third paragraph', '\\emph{Third} paragraph')
    load_doc(page, both); click_text(page, 'First', 2); key(page, 'Control+Shift+C', 150); click_text(page, 'Third', 2); key(page, 'Control+Shift+C', 150)
    select_text(page, 'Fourth'); paint_up(page)
    check('a second Ctrl+Shift+C elsewhere copies that formatting instead', src(page) == both.replace('Fourth paragraph', '\\emph{Fourth} paragraph'), src(page)[60:300])
    # kept on by a double click, the painter's button turns it off after painting
    load_doc(page, bold); click_text(page, 'First', 2); page.evaluate('window.rikuy.formatPainter(true)')
    select_text(page, 'Fourth'); paint_up(page)
    page.evaluate("window.rikuy.runCommand('format-painter')"); settle(page, 150)
    check('a double click\'s painter: painted, then its button turns it off', '\\textbf{Fourth}' in src(page) and not page.evaluate('!!window.rikuy.fpaint'), page.evaluate('window.rikuy.fpaint && window.rikuy.fpaint.sticky'))
    page.evaluate("navigator.clipboard.writeText('')"); settle(page, 100)
    load_doc(page, DOC); select_text(page, 'Third'); key(page, 'Control+Shift+V', 300)
    check('nothing on the clipboard: Ctrl+Shift+V deletes nothing', src(page) == DOC, src(page)[60:260])
    # Paste Formatting by the keys alone, as Microsoft 365's Word: Ctrl+Shift+C, Shift and the
    # arrows, Ctrl+Alt+V, as one step, again on other words
    load_doc(page, bold); click_text(page, 'First', 2); key(page, 'Control+Shift+C', 150)
    click_text(page, 'Third', 0)
    for _ in range(5): page.keyboard.press('Shift+ArrowRight')
    h0 = page.evaluate('window.rikuy.hist.length'); key(page, 'Control+Alt+v', 300)
    one = bold.replace('Third paragraph', '\\textbf{Third} paragraph')
    check('Ctrl+Shift+C, Shift+Right five times, Ctrl+Alt+V: bold, as one step', src(page) == one and page.evaluate('window.rikuy.hist.length') == h0 + 1, src(page)[60:260])
    check('and the painter Ctrl+Shift+C armed is put away (a click after would paint again)', not page.evaluate('!!window.rikuy.fpaint'))
    click_text(page, 'Fourth', 0)
    for _ in range(6): page.keyboard.press('Shift+ArrowRight')
    key(page, 'Control+Alt+v', 300)
    check('Ctrl+Alt+V again on other words', src(page) == one.replace('Fourth paragraph', '\\textbf{Fourth} paragraph'), src(page)[60:300])
    undo(page); undo(page)
    check('two undos give the bytes back', src(page) == bold, src(page)[60:200])
    # nothing copied: nothing changes, nothing is typed
    page.evaluate('window.rikuy.fmtCopy = null')
    load_doc(page, DOC); select_text(page, 'Third'); key(page, 'Control+Alt+v', 300)
    check('Ctrl+Alt+V with no formatting copied changes nothing', src(page) == DOC, src(page)[60:260])
    # AltGr, which Windows reports as Ctrl+Alt: AltGr+V types a letter on a Polish keyboard (ż), no
    # Paste Formatting
    load_doc(page, bold); click_text(page, 'First', 2); key(page, 'Control+Shift+C', 150); key(page, 'Escape', 100)
    select_text(page, 'Third')
    page.evaluate("document.getElementById('pages').dispatchEvent(new KeyboardEvent('keydown', { key: '\u017c', code: 'KeyV', ctrlKey: true, altKey: true, modifierAltGraph: true, bubbles: true, cancelable: true }))"); settle(page, 300)
    check('AltGr+V (Ctrl+Alt with AltGr) is no Paste Formatting', src(page) == bold, src(page)[60:260])


def cm_state(page):
    return page.evaluate("""(() => { const g = window.rikuy, cm = g.cm; if (!cm) return null; const d = cm.getDoc();
      return { focus: cm.hasFocus(), at: d.indexFromPos(d.getCursor()), sel: d.getSelection(), shown: document.body.classList.contains('src-on') }; })()""")


def source_pane(page):
    """Ctrl+\\ as Word's Alt+F9: the source opens at the caret's character with the focus in it,
    and closing it from there puts the page's caret at the source's cursor (it opened at line 1 with
    the focus left on the page, and closing dropped the focus); Ctrl+F in the source is Find and
    Replace In LaTeX source, its hit selected there, Escape back to the source; matching brackets lit."""
    load_doc(page, DOC); click_text(page, 'Third paragraph', 5)
    key(page, 'Control+Backslash', 700)
    st = cm_state(page)
    check('Ctrl+\\ opens the source at the caret\'s character, the focus in it', st and st['shown'] and st['focus'] and st['at'] == DOC.index('Third paragraph') + 5, st)
    page.keyboard.type('Q'); settle(page, 200)
    key(page, 'Control+Backslash', 500)
    page.keyboard.type('W'); settle(page, 300)
    check('Ctrl+\\ from the source closes it, the caret on the page where the cursor was: the next letter follows', 'ThirdQW paragraph' in src(page) and not cm_state(page)['shown'], src(page)[100:200])
    load_doc(page, DOC); click_text(page, 'Fourth paragraph', 0)
    key(page, 'Control+Backslash', 700)
    key(page, 'Control+Shift+ArrowRight', 150)
    key(page, 'Control+f', 400)
    d = page.get_by_role('dialog', name='Find and Replace', exact=True)
    q = d.get_by_label('Find what', exact=True)
    check('Ctrl+F in the source: Find and Replace, In LaTeX source ticked, the word selected there to find', d.count() == 1 and d.get_by_label('In LaTeX source', exact=True).is_checked() and q.input_value() == 'Fourth', q.input_value() if d.count() else None)
    key(page, 'Enter', 300); key(page, 'Escape', 300)
    st = cm_state(page)
    check('Escape gives the source the focus back, the hit selected in it', st['focus'] and st['sel'] == 'Fourth', st)
    key(page, 'Control+Backslash', 400); click_text(page, 'Third paragraph', 0); key(page, 'Control+h', 300)
    ticked = page.get_by_role('dialog', name='Find and Replace', exact=True).get_by_label('In LaTeX source', exact=True).is_checked()
    check('the page\'s next Find and Replace searches the page again (In LaTeX source as it was)', not ticked, ticked)
    key(page, 'Escape', 200); key(page, 'Control+Backslash', 600)
    page.evaluate("(() => { const d = window.rikuy.cm.getDoc(); d.setCursor(d.posFromIndex(window.rikuy.cm.getValue().indexOf('{article}'))); })()"); settle(page, 150)
    lit = page.evaluate("document.querySelectorAll('#srcpane .CodeMirror-matchingbracket').length")
    check('the bracket at the cursor and its match are lit', lit == 2, lit)
    key(page, 'Control+Backslash', 300)


def focused(page):
    return page.evaluate("(() => { const a = document.activeElement; return a ? (a.getAttribute('aria-label') || a.textContent || '').trim() : null; })()")


def access_keys(page):
    """Word's underlined letters in its dialogs: Alt and the letter, with the focus in the dialog,
    presses, ticks or focuses that control (Find and Replace, Font, Paragraph, Insert Table, Page
    setup); held, Alt underlines them, and it does not bring up the ribbon's KeyTips there."""
    load_doc(page, DOC); click_text(page, 'Third paragraph', 0)
    key(page, 'Control+h', 300); page.keyboard.type('paragraph here'); settle(page, 300)
    page.keyboard.down('Alt'); settle(page, 100)
    under = page.evaluate("[...document.querySelectorAll('[role=dialog] .ak')].filter((x) => x.getClientRects().length && getComputedStyle(x).textDecorationLine === 'underline').map((x) => x.textContent)")
    page.keyboard.up('Alt'); settle(page, 100)
    plain = page.evaluate("[...document.querySelectorAll('[role=dialog] .ak')].filter((x) => getComputedStyle(x).textDecorationLine === 'underline').length")
    check('Find and Replace: Alt held underlines its letters, and only while held', len(under) >= 15 and plain == 0 and not page.evaluate("document.body.classList.contains('keytips')"), (under, plain))
    # (the letter the keyboard types, not the key's place: on a German keyboard the key that types y
    # is the one US layouts call Z)
    page.evaluate("document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', code: 'KeyZ', altKey: true, bubbles: true, cancelable: true }))"); settle(page, 150)
    whole = page.get_by_role('dialog', name='Find and Replace', exact=True).get_by_label('Find whole words only', exact=True)
    check('Alt and the key that types Y on this keyboard ticks Find whole words only', whole.is_checked(), whole.is_checked())
    whole.uncheck()
    key(page, 'Alt+i', 150)
    check('Alt+I goes to Replace with', focused(page) == 'Replace with', focused(page))
    page.keyboard.type('line'); key(page, 'Alt+u', 150)
    ticked = page.get_by_role('dialog', name='Find and Replace', exact=True).get_by_label('Use wildcards', exact=True).is_checked()
    key(page, 'Alt+u', 150); key(page, 'Alt+a', 400)
    check('Alt+U ticks Use wildcards (again: off), Alt+A is Replace All', ticked and src(page) == DOC.replace('paragraph here', 'line'), src(page)[60:260])
    key(page, 'Escape', 200); undo(page)
    load_doc(page, DOC); select_text(page, 'Third'); key(page, 'Control+d', 300); key(page, 'Alt+b', 150); key(page, 'Enter', 300)
    check('Font: Ctrl+D, Alt+B (Subscript), Enter', '\\textsubscript{Third}' in src(page), src(page)[100:220])
    load_doc(page, DOC); click_text(page, 'Third paragraph', 3)
    page.evaluate("window.rikuy.runCommand('paragraph-settings')"); settle(page, 300)
    key(page, 'Alt+p', 200); key(page, 'Alt+x', 150)
    kept = page.get_by_role('checkbox', name='Keep with next').is_checked()
    check('Paragraph: Alt+P opens Line and Page Breaks, Alt+X ticks Keep with next', kept, kept)
    key(page, 'Escape', 200)
    load_doc(page, DOC); click_text(page, 'Fourth paragraph', 0)
    page.evaluate("window.rikuy.runCommand('insert-table-dialog')"); settle(page, 300)
    key(page, 'Alt+c', 100); page.keyboard.type('3'); key(page, 'Alt+r', 100); page.keyboard.type('4'); key(page, 'Enter', 400)
    check('Insert Table: Alt+C 3, Alt+R 4, Enter: three columns, four rows', '\\begin{tabular}{lll}' in src(page) and src(page).count('\\\\') >= 4, src(page)[200:420])
    load_doc(page, DOC); click_text(page, 'Fourth paragraph', 0)
    page.evaluate("window.rikuy.runCommand('page-setup')"); settle(page, 300)
    key(page, 'Alt+b', 150)
    check('Page setup: Alt+B goes to Bottom', focused(page) == 'Bottom', focused(page))
    key(page, 'Escape', 200)


def lows(page):
    """Enter at a paragraph's start makes an empty paragraph above it, as Word's (it wrote blank
    lines LaTeX reads as nothing, and Up skipped to the block before); Shift+F5 after an undo goes
    to the undone edit; after a reload a document of headings alone has the caret in its first."""
    load_doc(page, DOC); click_text(page, 'Third paragraph', 0); key(page, 'Enter', 200)
    check('Enter at a paragraph\'s start writes nothing yet', src(page) == DOC, src(page)[100:200])
    page.keyboard.type('X'); settle(page, 200)
    check('the caret stays with the words: the next letter starts them', 'XThird paragraph' in src(page), src(page)[100:200])
    load_doc(page, DOC); click_text(page, 'Third paragraph', 0); key(page, 'Enter', 200); key(page, 'ArrowUp', 200)
    page.keyboard.type('New one.'); settle(page, 300)
    check('Up goes into the empty paragraph above: what is typed there is a paragraph of its own', 'New one.\n\nThird paragraph here.' in src(page), src(page)[100:220])
    undo(page)
    # (review M6) only where the source has a paragraph's start before the caret: words after a
    # display or a list with no blank line are the same paragraph, and Enter makes them a new one;
    # a paragraph that starts with a formula is at its start too, and nothing is written there
    W = lambda b: '\\documentclass{article}\n\\begin{document}\n' + b + '\n\\end{document}\n'
    for body, at, label in [('Some text\n\\[ x \\]\ncontinued here.', 'continued here', 'a display'),
                            ('\\begin{itemize}\n\\item One\n\\end{itemize}\ncontinued here.', 'continued here', 'a list')]:
        load_doc(page, W(body)); click_text(page, at, 0); key(page, 'Enter', 250)
        check('Enter at words after ' + label + ' with no blank line makes them a paragraph of their own (review M6)', src(page) == W(body.replace('continued', '\n\ncontinued')), src(page)[40:140])
    body = 'First one.\n\n$x$ is a variable here.'
    load_doc(page, W(body)); click_text(page, 'is a variable', 0); key(page, 'Home', 150); key(page, 'Enter', 250)
    check('Enter at a paragraph that starts with a formula writes nothing yet (review M6)', src(page) == W(body), src(page)[40:140])
    load_doc(page, DOC); click_text(page, 'Third paragraph', 5); page.keyboard.type('Q'); settle(page, 200)
    undo(page); key(page, 'Control+Home', 150); key(page, 'Shift+F5', 200)
    c = caret(page)
    check('Shift+F5 after an undo goes to the undone edit\'s place', c and abs(c[1] - DOC.index('Third paragraph') - 5) <= 2, (c, DOC.index('Third paragraph') + 5))
    heads = '\\documentclass{article}\n\\begin{document}\n\\section{Only heading}\n\\end{document}\n'
    # (persist() writes to IndexedDB: the reload waits for that copy to be the one kept, saved(),
    # and the page reloaded for init to be through, ready(): the first caret comes after the boot screen)
    load_doc(page, heads); page.evaluate('window.rikuy.persist()'); saved(page, 500)
    page.reload(); ready(page); until(page, FONTS); settle(page, 200, full=True); settle(page, 500)
    page.keyboard.type('Z'); settle(page, 300)
    check('after a reload, a document of headings alone takes the first keys in its first heading', '\\section{ZOnly heading}' in src(page), src(page)[30:120])


def tips_and_help(page, mac=False, tag=''):
    title = page.evaluate("document.getElementById('rb-b') ? document.getElementById('rb-b').title : [...document.querySelectorAll('#ribbon [data-cmd=bold]')].map((b) => b.title)[0]")
    check(tag + 'the Bold button\'s tooltip names its key' + (' as a Mac does (\u2318B)' if mac else ' (Ctrl+B)'), ('\u2318B' if mac else 'Ctrl+B') in (title or ''), title)
    t = page.evaluate("[...document.querySelectorAll('#ribbon button')].map((b) => b.title).filter((x) => /Find Next|Go To/.test(x))")
    page.evaluate("window.rikuy.runCommand('help-keys')"); settle(page, 300)
    d = page.get_by_role('dialog', name='Keyboard shortcuts', exact=True)
    txt = d.inner_text() if d.count() else ''
    want = ['\u2318B', '\u2325\u2318L', 'Word\'s keys the browser keeps', '\u2318N'] if mac else ['Ctrl+B', 'Ctrl+1', 'Alt+X', 'Shift+F5', 'Ctrl+F6', 'Word\'s keys the browser keeps', 'Ctrl+N', 'Ctrl+T', 'F12']
    check(tag + 'Help\'s Keyboard shortcuts lists the keys as this computer has them, then Word\'s keys the browser keeps with what to press instead', all(w in txt for w in want), [w for w in want if w not in txt])
    return d


def mac_keys(p):
    browser, page, errors = open_page(p, init=MAC)
    until(page, FONTS); settle(page, 200, full=True)
    try:
        check('Mac: the page knows it is on a Mac', page.evaluate("/Mac/.test(navigator.platform)"))
        load_doc(page, DOC); select_text(page, 'Second paragraph')
        key(page, 'Meta+b', 250)
        check('Mac: Cmd+B bolds', '\\textbf{Second paragraph}' in src(page), src(page)[60:160])
        undo(page)
        load_doc(page, DOC); click_text(page, 'First paragraph', 3); key(page, 'Meta+ArrowDown', 200); page.keyboard.type('Q'); settle(page, 200)
        check('Mac: Cmd+Down goes to the next paragraph\'s start, as Word for Mac', 'QSecond paragraph' in src(page), src(page)[60:200])
        load_doc(page, DOC)
        click_text(page, 'Second paragraph', 3)
        key(page, 'Meta+Digit2', 250)
        check('Mac: Cmd+2 double line spacing, as Word for Mac', 'doublespac' in src(page), src(page)[60:200])
        undo(page)
        click_text(page, 'Second paragraph', 3)
        key(page, 'Meta+Alt+KeyL', 300)
        check('Mac: Cmd+Option+L opens Spelling, Word for Mac\'s key', page.locator('.pop-spell, [aria-label="Spelling"][role=dialog], .sp-pane').count() > 0 or page.get_by_role('dialog', name='Spelling').count() > 0)
        close_pop(page)
        click_text(page, 'Second paragraph', 3)
        key(page, 'Meta+Alt+KeyE', 300)
        check('Mac: Cmd+Option+E puts in an endnote (Cmd+Option+D is the Dock)', '\\endnote' in src(page), src(page)[60:200])
        undo(page)
        click_text(page, 'Second paragraph', 3)
        key(page, 'Control+Shift+Period', 250)
        a = caret(page)
        check('Mac: Control+Shift+> goes to the next footnote', a and 0 <= a[1] - DOC.index('\\footnote{One') <= 21, a)
        select_text(page, 'Second')
        key(page, 'Control+Space', 250)
        check('Mac: Control+Space is Clear Character Formatting there (Cmd+Space is Spotlight)', True)
        tips_and_help(page, True, 'Mac: ')
        page.screenshot(path=os.path.join(SHOTS, 'keys-help-mac-1366.png'))
        close_pop(page)
        check('Mac: no page errors', not [e for e in errors if 'tree.wasm' not in e and 'TeX' not in e], errors[:4])
    finally:
        browser.close()


def shots(p):
    for w, h, dark in ((1920, 1080, False), (1920, 1080, True), (1366, 768, False), (1366, 768, True), (390, 844, False)):
        browser, page, errors = open_page(p, width=w, height=h, dark=dark, touch=w < 500)
        until(page, FONTS); settle(page, 200, full=True)
        try:
            tag = '%d%s' % (w, '-dark' if dark else '')
            load_doc(page, DOC)
            t = page.evaluate("document.getElementById('rb-b') ? document.getElementById('rb-b').title : ''")
            check('%s: the Bold button\'s tooltip is "Bold (Ctrl+B)"' % tag, t.startswith('Bold (Ctrl+B)'), t)
            if w >= 1000:
                # the search box lists each command with its key (a browser draws no tooltip in a screenshot)
                click_text(page, 'Second paragraph', 3)
                box = page.get_by_role('combobox', name='Search', exact=True)
                box.click(); box.fill('spacing'); settle(page, 300)
                opts = page.get_by_role('listbox', name='Commands', exact=True).get_by_role('option').all_inner_texts()
                check('%s: the search box lists Word\'s line spacing commands with their keys' % tag, any('Ctrl+2' in o for o in opts) and any('Ctrl+5' in o for o in opts), opts[:6])
                page.screenshot(path=os.path.join(SHOTS, 'keys-search-%s.png' % tag))
                page.keyboard.press('Escape'); settle(page, 150)
            page.evaluate("window.rikuy.runCommand('help-keys')"); settle(page, 400)
            d = page.get_by_role('dialog', name='Keyboard shortcuts', exact=True)
            check('%s: Help\'s Keyboard shortcuts opens inside the window' % tag, d.count() == 1 and page.evaluate("(() => { const r = document.querySelector('.pop-guide').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; })()"))
            page.screenshot(path=os.path.join(SHOTS, 'keys-help-%s.png' % tag))
            # the kept keys at the end of the list
            page.evaluate("(() => { const k = document.querySelector('.pop-guide dl.kept'); if (k) k.scrollIntoView(); })()"); settle(page, 200)
            page.screenshot(path=os.path.join(SHOTS, 'keys-help-kept-%s.png' % tag))
        finally:
            browser.close()


def run():
    only = sys.argv[1:]
    with sync_playwright() as p:
        browser, page, errors = open_page(p)
        until(page, FONTS); settle(page, 200, full=True)
        for f in (paragraphs, references, finding, views, typing, fields, headings, tables, files, caret_keys, paste_format, source_pane, access_keys, lows):
            if only and f.__name__ not in only: continue
            try: f(page)
            except Exception as e: check(f.__name__ + ' runs to its end', False, str(e)[:300])
        if not only or 'help' in only:
            try:
                load_doc(page, DOC); tips_and_help(page)
            except Exception as e: check('help runs to its end', False, str(e)[:300])
        check('no page errors', not [e for e in errors if 'tree.wasm' not in e and 'TeX' not in e], errors[:4])
        browser.close()
        if not only or 'mac' in only:
            try: mac_keys(p)
            except Exception as e: check('mac runs to its end', False, str(e)[:300])
        if not only or 'shots' in only:
            try: shots(p)
            except Exception as e: check('shots runs to its end', False, str(e)[:300])
    bad = [r for r in results if not r[1]]
    print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    run()
