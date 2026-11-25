"""The math field on display equations: aligned rows with their labels, user macros kept by
name, edits in the field and in the LaTeX box reaching the source, rows added and closed."""
import os, sys, traceback
sys.path.insert(0, os.path.dirname(__file__))
from browser import settle, open_page, check, results, SHOTS, src, click_text, load_doc
from playwright.sync_api import sync_playwright

try:
    with sync_playwright() as p:
        browser, page, errors = open_page(p, width=1440, height=900)
        base = src(page)
        # --- align display math
        page.evaluate("document.querySelectorAll('.it.dm')[1].scrollIntoView({block:'center'})")
        page.click('.it.dm >> nth=1')
        page.wait_for_selector('#pop-field', timeout=8000)
        settle(page, 300)
        fv = page.evaluate("document.getElementById('pop-field').getValue('latex')")
        print('field value:', fv)
        check('field opens with aligned rows, labels lifted out', fv.startswith('\\begin{aligned}') and '\\label' not in fv, fv)
        check('field keeps user macros by name, argmax as an operator', '\\E' in fv and 'arg\\,max' in fv, fv)
        check('field has focus', page.evaluate("document.activeElement && document.activeElement.id === 'pop-field'"))
        # type at the end of the field
        page.keyboard.type('+1')
        # (the box writes the source 140 ms after its last change: the page's timer, waited for)
        settle(page, 400, full=True)
        ta = page.evaluate("document.getElementById('pop-tex').value")
        s1 = src(page)
        print('textarea after field edit:\n' + ta)
        check('field edit rewrites the LaTeX box', '+1' in ta, ta)
        check('labels stay on their rows', '\\label{eq:cond}' in ta.split('\\\\')[0] and '\\label{eq:mle}' in ta.split('\\\\')[1], ta)
        first_row = base[base.find('\\begin{align}'):].split('\\\\')[0]
        check('untouched row keeps exact original text', ta.split('\\\\')[0].strip() == first_row.split('\n', 1)[1].strip(), (ta.split('\\\\')[0], first_row))
        check('field edit reaches the source', '+1' in s1[s1.find('\\begin{align}'):s1.find('\\end{align}')], s1[s1.find('\\begin{align}'):s1.find('\\end{align}')+11])
        check('page re-typesets', page.evaluate("[...document.querySelectorAll('.it.dm')].some(d => d.textContent.includes('+1'))"))
        page.screenshot(path=SHOTS + '/60-field-align.png')
        # typing after the block joins the last row
        page.click('#pop-field')
        page.keyboard.press('Control+End') if False else page.evaluate("document.getElementById('pop-field').executeCommand('moveToMathfieldEnd')")
        page.keyboard.type('q')
        settle(page, 300)
        taq = page.evaluate("document.getElementById('pop-tex').value")
        rows = taq.split('\\\\')
        check('text typed after block joins last row', len(rows) == 2 and 'q' in rows[1] and '\\label{eq:mle}' in rows[1] and '\\label{eq:cond}' in rows[0], taq)
        page.keyboard.press('Backspace')
        settle(page, 300)
        # edit the LaTeX box -> field follows
        page.click('#pop-tex')
        page.keyboard.press('Control+End')
        page.keyboard.type(' - z')
        settle(page, 300)
        fv2 = page.evaluate("document.getElementById('pop-field').getValue('latex')")
        check('LaTeX box edit updates the field', fv2.replace(' ', '').endswith('-z\\end{aligned}') or '-z' in fv2.replace(' ', ''), fv2)
        # ctrl+enter in field adds a row
        page.click('#pop-field')
        settle(page, 100)
        page.keyboard.press('End')
        page.keyboard.press('Control+Enter')
        settle(page, 200)
        page.keyboard.type('w=0')
        settle(page, 400)
        ta3 = page.evaluate("document.getElementById('pop-tex').value")
        check('ctrl+enter adds a row', ta3.count('\\\\') >= 2 and 'w=0' in ta3.replace(' ', ''), ta3)
        page.keyboard.press('Enter')
        settle(page, 200)
        check('enter closes popover', page.evaluate('!document.querySelector(".pop")'))
        # undo the whole popover session in one step
        page.keyboard.press('Control+z')
        check('one undo reverts the popover session', src(page) == base, src(page)[src(page).find('\\begin{align}'):][:200])

        # --- inline math in the field
        page.evaluate("document.querySelector('.a-math').scrollIntoView({block:'center'})")
        page.click('.a-math >> nth=0')
        page.wait_for_selector('#pop-field', timeout=8000)
        settle(page, 200)
        page.keyboard.press('End')
        page.keyboard.type('+1')
        settle(page, 400, full=True)
        s2 = src(page)
        check('inline field edit reaches source', '\\gamma+1$' in s2.replace(' ', ''), s2[s2.find('Click $'):][:50])
        page.keyboard.press('Enter')
        page.keyboard.press('Control+z')
        check('undo inline', src(page) == base)

        # --- new math with $ goes straight into the field
        click_text(page, 'or type a dollar sign', 3)
        page.keyboard.type('$')
        page.wait_for_selector('#pop-field', timeout=8000)
        settle(page, 200)
        page.keyboard.type('x^2')
        settle(page, 400)
        page.keyboard.press('Enter')
        settle(page, 200)
        s3 = src(page)
        seg = s3[s3.find('Click $'):][:160]
        check('new math typed visually', 'or $x^2$type' in seg or 'or $x^{2}$type' in seg, seg)
        page.keyboard.press('Control+z')
        check('undo new math', src(page) == base, src(page)[src(page).find('or t'):][:40])

        # --- a formula emptied in the field goes when it closes, as a new one closed empty does:
        # $$ was left in the line (a display running on through the text after it), and an
        # emptied equation a number beside a blank line, TeX's Missing $
        EMPTIED = ('\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nAlpha $x+y$ beta.\n'
                   '\\begin{equation}\n  E = mc^2\n\\end{equation}\nMore text.\n\\end{document}\n')
        load_doc(page, EMPTIED)
        page.click('.a-math >> nth=0')
        page.wait_for_selector('#pop-field', timeout=8000)
        settle(page, 200)
        for key in ('Control+a', 'Backspace', 'Enter'):
            page.keyboard.press(key); settle(page, 150)
        s4 = src(page)
        check('an emptied formula in the line goes, no $$ left', 'Alpha  beta.' in s4 and '$' not in s4, s4[s4.find('Alpha'):][:40])
        page.keyboard.type('Q')
        check('the caret stays where it stood', 'Alpha Q beta.' in src(page), src(page)[src(page).find('Alpha'):][:40])
        page.click('.it.dm >> nth=0')
        page.wait_for_selector('#pop-field', timeout=8000)
        settle(page, 200)
        for key in ('Control+a', 'Backspace', 'Escape'):
            page.keyboard.press(key); settle(page, 150)
        s5 = src(page)
        # (with the line breaks round it: the text on either side one paragraph again, as TeX had
        # it; a blank line left there split it)
        check('an emptied equation goes, with its environment, the paragraph whole', 'equation' not in s5 and 'beta.\nMore text.' in s5, s5[s5.find('beta'):][:60])
        page.keyboard.type('W')
        check('the caret at the start of the text after it', 'beta.\nWMore text.' in src(page), src(page)[src(page).find('beta'):][:60])
        page.keyboard.press('Control+z'); page.keyboard.press('Control+z')
        settle(page, 200)
        check('one undo brings the equation back', '\\begin{equation}\n  E = mc^2\n\\end{equation}\nMore text.' in src(page), src(page)[src(page).find('beta'):][:80])

        # --- Enter at the end of the line above a display, then words: a paragraph above the
        # display, the display going on under it as in Word; a blank line before it printed an
        # empty line above the equation (TeX begins a paragraph for the display alone)
        load_doc(page, EMPTIED)
        click_text(page, 'Alpha', 0); page.keyboard.press('End'); settle(page, 150)
        page.keyboard.press('Enter'); settle(page, 150)
        page.keyboard.type('New'); settle(page, 300, full=True)
        s6 = src(page)
        check('words typed on a new line above a display: no blank line before the display', 'beta.\n\nNew\n\\begin{equation}' in s6, s6[s6.find('beta'):][:60])

        # --- arrows leave a display as Word's leave an equation on its own line: Right at its end
        # and Down from its last row to the text after it, Left at its start and Up from its first
        # row to the text before it (they stayed in the field, and only Esc or a click got out)
        DISP = '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nBefore words here.\n\\begin{equation}\nx + y = z\n\\end{equation}\nAfter words here.\n\\end{document}\n'
        ROWS = DISP.replace('equation}\nx + y = z', 'align}\na &= b \\\\\nc &= d').replace('end{equation}', 'end{align}')
        for name, doc, keys, want in (('Right at its end', DISP, ['ArrowRight'], 'end{equation}\nQAfter'), ('Down', DISP, ['ArrowDown'], 'end{equation}\nQAfter'),
                                      ('Left at its start', DISP, ['Home', 'ArrowLeft'], 'here.Q\n\\begin'), ('Up', DISP, ['ArrowUp'], 'here.Q\n\\begin'),
                                      ('Down from an align\'s last row', ROWS, ['ArrowDown'], 'end{align}\nQAfter'),
                                      ('Up from its last row, then from its first', ROWS, ['ArrowUp', 'ArrowUp'], 'here.Q\n\\begin')):
            load_doc(page, doc)
            page.click('.it.dm >> nth=0'); page.wait_for_selector('#pop-field', timeout=8000); settle(page, 300)
            for k in keys: page.keyboard.press(k); settle(page, 120, full=True)
            gone = page.evaluate("!document.getElementById('pop-field')")
            page.keyboard.type('Q'); settle(page, 300, full=True)
            s7 = src(page)
            check('a display left by %s: the next letter in the text beside it, the display as it was' % name, gone and want in s7 and s7.replace('Q', '', 1) == doc, s7[s7.find('Before'):s7.find('\\end{document}')])
        load_doc(page, ROWS)
        page.click('.it.dm >> nth=0'); page.wait_for_selector('#pop-field', timeout=8000); settle(page, 300)
        page.keyboard.press('ArrowUp'); settle(page, 120, full=True)
        check('Up from an align\'s last row goes to the row above, inside the field', page.evaluate("!!document.getElementById('pop-field')"))
        page.keyboard.press('Escape'); settle(page, 200, full=True)
        load_doc(page, DISP.replace('After words here.\n', ''))
        page.click('.it.dm >> nth=0'); page.wait_for_selector('#pop-field', timeout=8000); settle(page, 300)
        page.keyboard.press('ArrowRight'); settle(page, 120, full=True)
        page.keyboard.type('Q'); settle(page, 300, full=True)
        s7 = src(page)
        check('Right out of a display that ends the document: a new line after it takes the letter', '\\end{equation}\nQ' in s7 and 'x + y = z' in s7, s7[-60:])

        # --- & typed in a display: an alignment point at the caret, as Word's & in an equation; a
        # display of one line becomes an align (align* for \\[ … \\]), as Ctrl+Enter makes it. It
        # wrote \\&, a printed ampersand; in an align's last column it did nothing
        STAR = DISP.replace('\\begin{equation}', '\\[').replace('\\end{equation}', '\\]')
        GATHER = DISP.replace('equation}', 'gather}')
        for name, doc, keys, want in (('an equation', DISP, ['&', 'Q'], '\\begin{align}\nx + y = z&Q\n\\end{align}'),
                                      ('\\[ \\], mid formula', STAR, ['Home', 'ArrowRight', 'ArrowRight', 'ArrowRight', '&', 'Q'], '\\begin{align*}\nx + y &Q= z\n\\end{align*}'),
                                      ('an align\'s last column', ROWS, ['&', 'Q'], 'c &= d&Q\n\\end{align}'),
                                      ('a gather (no columns: nothing written)', GATHER, ['&'], '\\begin{gather}\nx + y = z\n\\end{gather}')):
            load_doc(page, doc)
            page.click('.it.dm >> nth=0'); page.wait_for_selector('#pop-field', timeout=8000); settle(page, 300)
            for k in keys:
                if len(k) == 1: page.keyboard.type(k)
                else: page.keyboard.press(k)
                settle(page, 120, full=True)
            page.keyboard.press('Escape'); settle(page, 300, full=True)
            s8 = src(page)
            check('& in %s: an alignment point where the caret was, the letter after it in its cell, never \\&' % name, want in s8 and '\\&' not in s8, s8[s8.find('here.'):s8.find('After')])
        page.keyboard.press('Control+z'); settle(page, 300, full=True)
        load_doc(page, DISP)
        page.click('.it.dm >> nth=0'); page.wait_for_selector('#pop-field', timeout=8000); settle(page, 300)
        page.keyboard.type('&'); settle(page, 120, full=True); page.keyboard.press('Escape'); settle(page, 300, full=True)
        page.keyboard.press('Control+z'); settle(page, 300, full=True)
        check('one undo takes the & and the align back to the equation', src(page) == DISP, src(page)[60:160])

        # (review of the two above. An & is written only where TeX takes it: not past the columns its
        # environment has, alignat{n} 2n, eqnarray 3 ("Extra & on this line"); not in a display of
        # one line that holds cases or split, whose & are theirs (the display became an align, the &
        # after \end{cases}); not inside a fraction (it went to the formula's start). Arrows out of
        # a display land on a line of their own after a comment (what was typed went into it), a
        # heading or a list, and before a heading or an \item (it went into the item before).)
        TEX = os.path.isfile(os.path.join(os.environ.get('RIKUY_DIST') or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'dist'), 'tex', 'tree.wasm'))
        def compiles(doc):
            page.set_default_timeout(600000)
            r = page.evaluate('async (t) => { await window.rikuy.api.setSource(t); const r = await window.rikuy.api.compile(); return { ok: r.ok, problems: (r.problems || []).filter((x) => x.severity === "error").map((x) => x.message).slice(0, 3) }; }', doc)
            page.set_default_timeout(30000)
            return r
        GO = """(v) => { const mf = document.getElementById('pop-field'); const M = mf._mathfield.model; let best = -1;
          for (let i = 0; i <= M.lastOffset; i++) { const a = M.at(i); if (a && a.value === v) best = i; } if (best >= 0) mf.position = best; return best; }"""
        W = lambda body: '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nBefore words here.\n' + body + '\nAfter words here.\n\\end{document}\n'
        def field_keys(doc, keys):
            load_doc(page, doc)
            page.click('.it.dm >> nth=0'); page.wait_for_selector('#pop-field', timeout=8000); settle(page, 300)
            for k in keys:
                if k.startswith('@'): page.evaluate(GO, k[1:])
                elif len(k) == 1: page.keyboard.type(k)
                else: page.keyboard.press(k)
                settle(page, 120, full=True)
            page.keyboard.press('Escape'); settle(page, 300, full=True)
            return src(page)
        for name, doc, keys in (('alignat{1}\'s last column', W('\\begin{alignat}{1}\n  a &= b \\\\\n  c &= d\n\\end{alignat}'), ['&']),
                                ('eqnarray\'s third column', W('\\begin{eqnarray}\n  a &=& b \\\\\n  c &=& d\n\\end{eqnarray}'), ['&']),
                                ('the last column of cases in an equation', W('\\begin{equation}\n  f = \\begin{cases} 1 & x \\\\ 0 & y \\end{cases}\n\\end{equation}'), ['ArrowLeft', '&']),
                                ('an equation that holds cases, at its end', W('\\begin{equation}\n  f = \\begin{cases} 1 & x \\\\ 0 & y \\end{cases}\n\\end{equation}'), ['&']),
                                ('a split\'s last cell', W('\\begin{equation}\n\\begin{split}\n  a &= b \\\\\n  c &= d\n\\end{split}\n\\end{equation}'), ['ArrowLeft', '&']),
                                ('a fraction', W('\\[\n  \\frac{a}{b} + c\n\\]'), ['@a', '&'])):
            s8 = field_keys(doc, keys)
            check('& in %s: nothing written, the display as it was' % name, s8 == doc, s8[s8.find('here.'):s8.find('After')])
        doc = W('\\begin{alignat}{2}\n  a &= b \\\\\n  c &= d\n\\end{alignat}')
        s8 = field_keys(doc, ['&', 'Q'])
        check('& in alignat{2}\'s second column: its third column, the letter there', '  c &= d&Q\n\\end{alignat}' in s8, s8[s8.find('here.'):s8.find('After')])
        if TEX:
            r = compiles(s8)
            check('and that alignat compiles in the page', r['ok'] and not r['problems'], r)
        P = lambda body: '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n' + body + '\n\\end{document}\n'
        for name, doc, keys, want in (('Up after a line ending in a comment', P('Before words. % c\n\\[x=y\\]\nAfter.'), ['ArrowUp'], 'Before words. % c\nQ\n\\[x=y\\]'),
                                      ('Left after a line ending in a comment', P('Before words. % c\n\\[x=y\\]\nAfter.'), ['Home', 'ArrowLeft'], 'Before words. % c\nQ\n\\[x=y\\]'),
                                      ('Up after a heading', P('\\section{Intro}\n\\[x=y\\]\nAfter.'), ['ArrowUp'], '\\section{Intro}\nQ\n\\[x=y\\]'),
                                      ('Up after a list', P('\\begin{itemize}\n\\item One\n\\end{itemize}\n\\[x=y\\]\nAfter.'), ['ArrowUp'], '\\end{itemize}\nQ\n\\[x=y\\]'),
                                      ('Down before a heading', P('Before.\n\\[x=y\\]\n\\section{Next}\nWords.'), ['ArrowDown'], '\\[x=y\\]\nQ\n\\section{Next}'),
                                      ('Down before an \\item', P('\\begin{itemize}\n\\item One\n\\[x=y\\]\n\\item Two\n\\end{itemize}'), ['ArrowDown'], '\\[x=y\\]Q\n\\item Two')):
            load_doc(page, doc)
            page.click('.it.dm >> nth=0'); page.wait_for_selector('#pop-field', timeout=8000); settle(page, 300)
            for k in keys: page.keyboard.press(k); settle(page, 120, full=True)
            page.keyboard.type('Q'); settle(page, 300, full=True)
            s9 = src(page)
            check('%s out of a display: the letter on a line of its own, outside the comment, the heading, the item before' % name, want in s9 and s9.replace('Q', '', 1).replace('\n\n', '\n') == doc.replace('\n\n', '\n'), s9[s9.find('{document}') + 11:s9.find('\\end{document}')])
            if TEX and name.startswith('Up after a heading'):
                r = compiles(s9)
                check('and it compiles in the page', r['ok'] and not r['problems'], r)

        # --- dark mode look
        check('no console errors', not errors, errors[:5])
        browser.close()
        browser, page, errors = open_page(p, width=1440, height=900, dark=True)
        page.evaluate("document.querySelectorAll('.it.dm')[0].scrollIntoView({block:'center'})")
        page.click('.it.dm >> nth=0')
        page.wait_for_selector('#pop-field', timeout=8000)
        settle(page, 300)
        page.screenshot(path=SHOTS + '/61-field-dark.png')
        check('no console errors (dark)', not errors, errors[:5])
        browser.close()
except Exception as e:
    # a run that stops part way has failed, whatever the checks before it said
    traceback.print_exc()
    check('the run reaches its end', False, e)

bad = [r for r in results if not r[1]]
print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
sys.exit(1 if bad else 0)
