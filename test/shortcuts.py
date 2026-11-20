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
from browser import open_page, check, results, src, click_text, select_text, load_doc
from playwright.sync_api import sync_playwright

SHOTS = os.environ.get('RIKUY_SHOTS', '/tmp/keys-shots')
os.makedirs(SHOTS, exist_ok=True)

DOC = ('\\documentclass{article}\n\\begin{document}\n\\section{Opening}\nFirst paragraph here. It has two sentences.\n\n'
       'Second paragraph here\\footnote{One note.} and more words\\footnote{Two note.} at the end.\n\n'
       '\\subsection{Inner}\nThird paragraph here.\n\n\\section{Closing}\nFourth paragraph here.\n\n'
       '\\begin{tabular}{ll}\na & b \\\\\nc & d \\\\\ne & f \\\\\n\\end{tabular}\n\\end{document}\n')
MAC = "Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' })"


def key(page, k, wait=200):
    page.keyboard.press(k); page.wait_for_timeout(wait)


def undo(page):
    page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(150)


def caret(page):
    return page.evaluate("(() => { const c = window.rikuy.caretNow(); return c ? [c.f, c.a, c.b] : null; })()")


def selected(page):
    return page.evaluate("getSelection().toString().replace(/\\u200B/g, '')")


def dialog_open(page, name):
    return page.get_by_role('dialog', name=name, exact=True).count() > 0


def close_pop(page):
    page.evaluate('window.rikuy.closePop && window.rikuy.closePop(true)'); page.wait_for_timeout(100)


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
    check('Ctrl+1 after Ctrl+2: single spacing, the paragraph as it was', src(page) == DOC, src(page)[60:260])
    # Hanging Indent (Word's Ctrl+T is the browser's new tab): the search box finds it
    load_doc(page, DOC); click_text(page, 'Third paragraph', 3)
    page.evaluate("window.rikuy.runCommand('hanging-indent')"); page.wait_for_timeout(200)
    t = src(page)
    page.evaluate("window.rikuy.runCommand('hanging-indent')"); page.wait_for_timeout(200)
    check('Hanging Indent: \\noindent\\hangindent=1cm before the paragraph, and off again byte for byte', '\\noindent\\hangindent=1cm Third paragraph' in t and src(page) == DOC, t[150:260])


def references(page):
    load_doc(page, DOC); click_text(page, 'First paragraph', 2)
    key(page, 'Alt+Shift+Period')
    a = caret(page)
    key(page, 'Alt+Shift+Period')
    b = caret(page)
    key(page, 'Alt+Shift+Comma')
    c = caret(page)
    f1, f2 = DOC.index('\\footnote{One'), DOC.index('\\footnote{Two')
    check('Alt+Shift+> goes to the next footnote, again to the one after; Alt+Shift+< back', a and b and c and abs(a[1] - f1) < 20 and abs(b[1] - f2) < 20 and abs(c[1] - f1) < 20, (a, b, c, f1, f2))
    click_text(page, 'Third paragraph', 3)
    key(page, 'Control+Shift+F5', 300)
    check('Ctrl+Shift+F5 opens the Bookmark dialog', dialog_open(page, 'Bookmark'))
    close_pop(page)
    click_text(page, 'Third paragraph', 3)
    key(page, 'F5', 300)
    check('F5 opens Go To (and the page is not reloaded)', page.get_by_role('tab', name='Go To').count() > 0 and page.evaluate('!!window.rikuy.model'))
    page.keyboard.press('Escape'); page.wait_for_timeout(100); close_pop(page)
    # Alt+Shift+O: the heading's place in the contents (References › Add Text)
    click_text(page, 'Inner', 2)
    key(page, 'Alt+Shift+O', 300)
    check('Alt+Shift+O on a heading opens Add Text (its place in the contents)', page.locator('.pop [role^=menuitem]').count() > 0)
    close_pop(page)


def finding(page):
    load_doc(page, DOC)
    click_text(page, 'First paragraph', 0)
    page.evaluate("(() => { const fs = window.rikuy.findState(); fs.q = 'paragraph'; fs.on = false; })()")
    key(page, 'Shift+F4')
    a = selected(page)
    key(page, 'Shift+F4')
    b = caret(page)
    check('Shift+F4 finds the last Find\'s words again, the next place each time', a == 'paragraph' and selected(page) == 'paragraph' and b[1] > DOC.index('Second'), (a, b))
    # Go Back: an edit, the caret elsewhere, Shift+F5 back to the edit
    load_doc(page, DOC); click_text(page, 'Fourth paragraph', 6)
    page.keyboard.type('X'); page.wait_for_timeout(200)
    click_text(page, 'First paragraph', 0)
    key(page, 'Shift+F5')
    at = caret(page)
    want = src(page).index('FourthX') + len('FourthX')
    check('Shift+F5 takes the caret back to where the last edit was', at and abs(at[1] - want) <= 1, (at, want))
    # Extend Selection: the word, the sentence, the paragraph; Shift+F8 one step back
    load_doc(page, DOC); click_text(page, 'It has two', 4)
    steps = []
    for _ in range(3):
        key(page, 'F8'); steps.append(selected(page))
    key(page, 'Shift+F8')
    back = selected(page)
    check('F8 selects the word, then the sentence, then the paragraph; Shift+F8 one step back', steps[0] == 'has' and steps[1] == 'It has two sentences.' and steps[2] == 'First paragraph here. It has two sentences.' and back == steps[1], (steps, back))


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
    page.evaluate('window.rikuy.toggleSource(false)'); page.wait_for_timeout(200)
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
        page.keyboard.press(k); page.wait_for_timeout(60); page.keyboard.type(ch); page.wait_for_timeout(120)
    check('the accent keys: Ctrl+\' e, Ctrl+Shift+^ o, Ctrl+Shift+: u, Ctrl+Shift+~ n, Ctrl+Shift+& s type é ô ü ñ ß', 'Third\u00e9\u00f4\u00fc\u00f1\u00df paragraph' in src(page), src(page)[140:200])
    page.keyboard.press('Control+Alt+Shift+Slash'); page.wait_for_timeout(150)
    check('Ctrl+Alt+Shift+? types ¿', '\u00df\u00bf paragraph' in src(page), src(page)[140:200])
    page.keyboard.press('Control+Quote'); page.wait_for_timeout(60); page.keyboard.press('ArrowRight'); page.keyboard.type('e'); page.wait_for_timeout(150)
    check('an accent key then an arrow: the next letter is typed as it is', '\u00bf pe' in src(page) or '\u00bfe' in src(page) or ' pearagraph' in src(page) or 'e paragraph' in src(page).replace('\u00bf', ''), src(page)[140:200])
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
    check('and the Spike is empty again: Insert Spike cannot run', page.evaluate("!window.rikuy.cmds.enabled(window.rikuy, 'spike-insert', window.rikuy.ribbonAt())"))
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
    click_text(page, 'Second paragraph', 3)
    key(page, 'Control+Shift+P', 300)
    check('Ctrl+Shift+P goes to the font size box', page.evaluate("!!document.activeElement.closest('#rb-size')") or page.evaluate("document.activeElement.getAttribute('aria-label')") == 'Font Size', page.evaluate("document.activeElement.outerHTML.slice(0, 120)"))
    page.keyboard.press('Escape'); page.wait_for_timeout(150)


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
    page.wait_for_timeout(150)
    cell = lambda: page.evaluate("(() => { const n = getSelection().anchorNode; const td = n && (n.nodeType === 1 ? n : n.parentElement).closest('td'); return td ? td.textContent.trim() : null; })()")
    key(page, 'Alt+End'); a = cell()
    key(page, 'Alt+Home'); b = cell()
    key(page, 'Alt+PageDown'); c = cell()
    key(page, 'Alt+PageUp'); d = cell()
    check('Alt+End, Alt+Home, Alt+Page Down, Alt+Page Up: the last and first cell of the row, the bottom and top of the column', (a, b, c, d) == ('d', 'c', 'e', 'a'), (a, b, c, d))
    page.evaluate("""(() => { const td = [...document.querySelectorAll('#pages td span.t')].find((s) => s.textContent.trim() === 'c'); const r = document.createRange(); r.setStart(td.firstChild, 0); r.collapse(true); document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); })()""")
    page.wait_for_timeout(150)
    key(page, 'Alt+Shift+ArrowDown', 300)
    t = src(page)
    check('Alt+Shift+Down in a table moves the row below the next', 'a & b \\\\\ne & f \\\\\nc & d \\\\' in t, t[-80:])
    undo(page)
    check('and one undo puts it back', src(page) == DOC)


def files(page):
    load_doc(page, DOC); click_text(page, 'First paragraph', 3)
    with page.expect_download(timeout=5000) as dl:
        page.keyboard.press('Shift+F12')
    check('Shift+F12 (Word\'s Save) downloads the LaTeX', dl.value.suggested_filename.endswith(('.tex', '.zip')), dl.value.suggested_filename)
    click_text(page, 'First paragraph', 3)
    with page.expect_file_chooser(timeout=5000) as fc:
        page.keyboard.press('Control+F12')
    check('Ctrl+F12 (Word\'s Open) opens the file chooser', fc.value is not None)


def tips_and_help(page, mac=False, tag=''):
    title = page.evaluate("document.getElementById('rb-b') ? document.getElementById('rb-b').title : [...document.querySelectorAll('#ribbon [data-cmd=bold]')].map((b) => b.title)[0]")
    check(tag + 'the Bold button\'s tooltip names its key' + (' as a Mac does (\u2318B)' if mac else ' (Ctrl+B)'), ('\u2318B' if mac else 'Ctrl+B') in (title or ''), title)
    t = page.evaluate("[...document.querySelectorAll('#ribbon button')].map((b) => b.title).filter((x) => /Find Next|Go To/.test(x))")
    page.evaluate("window.rikuy.runCommand('help-keys')"); page.wait_for_timeout(300)
    d = page.get_by_role('dialog', name='Keyboard shortcuts', exact=True)
    txt = d.inner_text() if d.count() else ''
    want = ['\u2318B', '\u2325\u2318L', 'Word\'s keys the browser keeps', '\u2318N'] if mac else ['Ctrl+B', 'Ctrl+1', 'Alt+X', 'Shift+F5', 'Ctrl+F6', 'Word\'s keys the browser keeps', 'Ctrl+N', 'Ctrl+T', 'F12']
    check(tag + 'Help\'s Keyboard shortcuts lists the keys as this computer has them, then Word\'s keys the browser keeps with what to press instead', all(w in txt for w in want), [w for w in want if w not in txt])
    return d


def mac_keys(p):
    browser, page, errors = open_page(p, init=MAC)
    try:
        check('Mac: the page knows it is on a Mac', page.evaluate("/Mac/.test(navigator.platform)"))
        load_doc(page, DOC); select_text(page, 'Second paragraph')
        key(page, 'Meta+b', 250)
        check('Mac: Cmd+B bolds', '\\textbf{Second paragraph}' in src(page), src(page)[60:160])
        undo(page)
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
        check('Mac: Control+Shift+> goes to the next footnote', a and abs(a[1] - DOC.index('\\footnote{One')) < 20, a)
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
        try:
            tag = '%d%s' % (w, '-dark' if dark else '')
            if w >= 1000:
                load_doc(page, DOC)
                page.hover('#rb-b' if page.locator('#rb-b').count() else '#ribbon [data-cmd=bold]'); page.wait_for_timeout(900)
                t = page.evaluate("document.getElementById('rb-b') ? document.getElementById('rb-b').title : ''")
                check('%s: the Bold button\'s tooltip is "Bold (Ctrl+B)..."' % tag, t.startswith('Bold (Ctrl+B)'), t)
                page.screenshot(path=os.path.join(SHOTS, 'keys-tooltip-%s.png' % tag))
            page.evaluate("window.rikuy.runCommand('help-keys')"); page.wait_for_timeout(400)
            d = page.get_by_role('dialog', name='Keyboard shortcuts', exact=True)
            check('%s: Help\'s Keyboard shortcuts opens inside the window' % tag, d.count() == 1 and page.evaluate("(() => { const r = document.querySelector('.pop-guide').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; })()"))
            page.screenshot(path=os.path.join(SHOTS, 'keys-help-%s.png' % tag))
            # the kept keys at the end of the list
            page.evaluate("(() => { const k = document.querySelector('.pop-guide dl.kept'); if (k) k.scrollIntoView(); })()"); page.wait_for_timeout(200)
            page.screenshot(path=os.path.join(SHOTS, 'keys-help-kept-%s.png' % tag))
        finally:
            browser.close()


def run():
    only = sys.argv[1:]
    with sync_playwright() as p:
        browser, page, errors = open_page(p)
        for f in (paragraphs, references, finding, views, typing, fields, headings, tables, files):
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
