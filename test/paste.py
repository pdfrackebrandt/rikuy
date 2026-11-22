"""Paste from Word, Google Docs, web pages, spreadsheets and chat assistants."""
import os, re, sys, traceback
sys.path.insert(0, os.path.dirname(__file__))
from browser import settle, until, open_page, check, results, src, click_text
from playwright.sync_api import sync_playwright

PASTE = """([html, plain]) => { const dt = new DataTransfer(); if (html) dt.setData('text/html', html); dt.setData('text/plain', plain);
  document.getElementById('pages').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }"""
cases = [
    ('google docs', '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr"><span style="font-weight:700">Bold</span><span> and </span><span style="font-style:italic">italic</span><span> with 50% off.</span></p></b>',
     'Bold and italic with 50% off.', '\\textbf{Bold} and \\emph{italic} with 50\\% off.'),
    ('word list', "<p class=MsoNormal>Intro:</p><p class=MsoListParagraphCxSpFirst style='mso-list:l0 level1 lfo1'><![if !supportLists]><span>1.<span>&nbsp;&nbsp;</span></span><![endif]>First</p><p class=MsoListParagraphCxSpLast style='mso-list:l0 level1 lfo1'><![if !supportLists]><span>2.<span>&nbsp;</span></span><![endif]>Second <i>one</i></p>",
     'Intro:\n1. First\n2. Second one', 'Intro:\n\n\\begin{enumerate}\n  \\item First\n  \\item Second \\emph{one}\n\\end{enumerate}'),
    ('katex page', '<p>Energy <span class="katex"><span class="katex-mathml"><math><semantics><mrow><mi>E</mi></mrow><annotation encoding="application/x-tex">E=mc^2</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">E=mc2</span></span> holds.</p>',
     'Energy E=mc2 holds.', 'Energy $E=mc^2$ holds.'),
    ('sheets table', '<table><tr><td>Model</td><td>R2</td></tr><tr><td>OLS</td><td>0.41</td></tr></table>', 'Model\tR2\nOLS\t0.41',
     '\\begin{table}[h]\n\\centering\n\\begin{tabular}{lr}\n\\toprule\nModel & R2 \\\\\n\\midrule\nOLS & 0.41 \\\\\n\\bottomrule\n\\end{tabular}\n\\end{table}'),
    ('markdown from a chat', None, '**Key** result:\n\n- first with $x^2$\n- second', '\\textbf{Key} result:\n\n\\begin{itemize}\n  \\item first with $x^2$\n  \\item second\n\\end{itemize}'),
    ('money stays money', None, 'It costs $5 and $10.', 'It costs \\$5 and \\$10.'),
    ('link with hyperref', '<p>See <a href="https://arxiv.org/abs/1234">the preprint</a>.</p>', 'See the preprint.', 'See \\href{https://arxiv.org/abs/1234}{the preprint}.'),
    ('display math from chatgpt', None, 'The loss is\n\n$$L=\\sum_i (y_i-\\hat y_i)^2$$', 'The loss is\n\n\\[\nL=\\sum_i (y_i-\\hat y_i)^2\n\\]'),
]
try:
    with sync_playwright() as p:
        browser, page, errors = open_page(p)
        base = src(page)
        for name, html, plain, want in cases:
            click_text(page, 'Click anywhere in this paragraph', 0)
            page.evaluate(PASTE, [html, plain])
            settle(page, 250)
            s = src(page)
            got = s[s.find('\\section{How to use it}') + len('\\section{How to use it}\n'):s.find('Click anywhere in this paragraph')]
            check('paste ' + name, got == want, repr(got))
            page.keyboard.press('Control+z'); settle(page, 150)
            check('undo after ' + name, src(page) == base)
        # inside a heading a paste stays on one line
        click_text(page, 'How to use it', 3)
        page.evaluate(PASTE, ['<p>one</p><p>two</p>', 'one\n\ntwo'])
        settle(page, 200)
        check('paste into a heading stays inline', '\\section{Howone two to use it}' in src(page), src(page)[src(page).find('\\section'):][:60])
        page.keyboard.press('Control+z'); settle(page, 150)
        # paragraphs pasted inside bold or italic words stay paragraphs: the format closes before the
        # blank line and opens again after it (they ran into one line); a list stays on the line
        from browser import load_doc
        W = lambda b: '\\documentclass{article}\n\\begin{document}\n' + b + '\n\\end{document}\n'
        for name, doc, at, html, plain, want in (
                ('plain paragraphs into a bold word', 'Some \\textbf{boldword} here.', ('boldword', 4), None, 'P1\n\nP2', 'Some \\textbf{boldP1}\n\n\\textbf{P2word} here.'),
                ('Word\'s paragraphs into an italic word', 'Some \\emph{italic} here.', ('italic', 3), '<p class=MsoNormal>A<o:p></o:p></p><p class=MsoNormal>B<o:p></o:p></p>', 'A\r\nB', 'Some \\emph{itaA}\n\n\\emph{Blic} here.'),
                ('paragraphs into \\textbf{\\emph{..}}', 'Some \\textbf{\\emph{nested}} here.', ('nested', 3), None, 'X\n\nY', 'Some \\textbf{\\emph{nesX}}\n\n\\textbf{\\emph{Yted}} here.'),
                # (italic into italic words stays italic: \emph in \emph is upright; bold into bold is bold once)
                ('italic into an italic word', 'Some \\emph{italic} here.', ('italic', 3), '<i>XY</i>', 'XY', 'Some \\emph{itaXYlic} here.'),
                ('bold and italic into a bold word', 'Some \\textbf{boldword} here.', ('boldword', 4), '<b>X</b> and <i>Y</i>', 'X and Y', 'Some \\textbf{boldX and \\emph{Y}word} here.')):
            load_doc(page, W(doc)); click_text(page, *at)
            page.evaluate(PASTE, [html, plain]); settle(page, 250)
            s = src(page)
            check('paste ' + name + ': ' + repr(want), s == W(want), s[s.find('Some'):][:80])
            page.keyboard.press('Control+z'); settle(page, 150)
            check('undo after ' + name, src(page) == W(doc))
        # words copied from a bold word into plain ones keep the bold of the bold part (they went
        # as the visible words alone, plain); inside \\emph the outer format comes too
        from browser import place
        LAST = """() => { const d = new DataTransfer(); d.setData('text/plain', window.rikuy.lastCopy.plain); d.setData('text/x-galley-latex', window.rikuy.lastCopy.latex);
          document.getElementById('pages').dispatchEvent(new ClipboardEvent('paste', { clipboardData: d, bubbles: true, cancelable: true })); }"""
        for doc, sel, want in (('Some \\textbf{bold} and plain.', ('old', 'and'), 'Some \\textbf{bold} and plain\\textbf{old} and.'),
                               ('Some \\textbf{bold} and plain.', ('Some', 'old'), 'Some \\textbf{bold} and plainSome \\textbf{bold}.'),
                               ('\\emph{A \\textbf{bold} c} and plain.', ('old', 'c'), '\\emph{A \\textbf{bold} c} and plain\\emph{\\textbf{old} c}.'),
                               # (plain words into the middle of an italic word, in one paragraph: each run its format)
                               ('Text \\emph{italic} and plain.', ('ext', 'ita'), 'Text \\emph{italic} and plainext \\emph{ita}.')):
            load_doc(page, W(doc)); place(page, sel)
            page.keyboard.press('Control+c'); settle(page, 150)
            click_text(page, 'plain', 5); page.evaluate(LAST); settle(page, 250)
            s = src(page)
            check('copy %s..%s over a bold word\'s brace, paste: %r' % (sel[0], sel[1], want), s == W(want), s[s.find('\\begin{document}') + 17:][:90])
        load_doc(page, base)
        # Ctrl+Shift+V pastes plain text
        click_text(page, 'Click anywhere in this paragraph', 0)
        page.keyboard.down('Control'); page.keyboard.down('Shift'); page.keyboard.press('KeyV'); page.keyboard.up('Shift'); page.keyboard.up('Control')
        page.evaluate("window.rikuy.plainPaste = true")
        page.evaluate(PASTE, ['<b>bold</b>', 'bold'])
        settle(page, 200)
        check('plain paste ignores formatting', 'bold\nClick anywhere' in src(page) or 'boldClick anywhere' in src(page), src(page)[src(page).find('use it}'):][:60])
        page.keyboard.press('Control+z'); settle(page, 150)
        check('source restored', src(page) == base)
        # a pasted screenshot joins the project under a name of its own (the paste did nothing)
        PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
        for k in range(2):
            click_text(page, 'Click anywhere in this paragraph', 0)
            page.evaluate('''(b) => { const f = new File([Uint8Array.from(atob(b), (c) => c.charCodeAt(0))], 'image.png', { type: 'image/png' });
              const dt = new DataTransfer(); dt.items.add(f); document.getElementById('pages').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }''', PNG)
            # (the picture is read into the project before it is placed in the text: openFiles is async)
            until(page, "(k) => (window.rikuy.files.get('main.tex').match(/pasted-/g) || []).length > k", k)
            settle(page, 300)
        pasted = page.evaluate("[...window.rikuy.assetBlobs.keys()].filter((n) => n.startsWith('pasted-'))")
        # (a pasted picture's name carries the time it came: the details name them by their order, so
        # two runs that saw the same say the same)
        nth = lambda x: re.sub(r'pasted-[a-z0-9]+\.png', lambda m: 'pasted-%d.png' % (pasted.index(m.group(0)) + 1) if m.group(0) in pasted else m.group(0), x)
        check('two pasted screenshots are two figures in the project', len(pasted) == 2, [nth(n) for n in pasted])
        s = src(page)
        at = s.find('Rikuy escapes special characters for you.') + len('Rikuy escapes special characters for you.')
        want = ''.join('\n\n\\begin{center}\n\\includegraphics[width=0.8\\linewidth]{%s}\n\\end{center}' % n for n in reversed(pasted))
        check('each is placed in the text after the paragraph the caret was in', s[at:].startswith(want + '\n\n') or s[at:].startswith(''.join('\n\n\\begin{center}\n\\includegraphics[width=0.8\\linewidth]{%s}\n\\end{center}' % n for n in pasted) + '\n\n'), nth(s[at:at + 260]))
        # (after the last \\usepackage line, rikuy.sty's for the opening document's live graph, which
        # loads graphicx itself: the pictures get their own, and keep it if the graph goes)
        last = re.findall(r'\\usepackage(?:\[[^\]]*\])?\{[^}]*\}\n', base[:base.index('\\begin{document}')])[-1]
        check('graphicx joins the preamble once, after the other packages', s.count('\\usepackage{graphicx}') == 1 and last + '\\usepackage{graphicx}\n' in s, s[:420])
        # (the opening graph's box holds its picture too, hidden while the graph runs: class wfb)
        check('the pictures show on the page and the message says they were placed', page.evaluate('document.querySelectorAll("#pages img:not(.wfb)").length') == 2 and 'placed it in the text' in page.inner_text('#toast'), nth(page.inner_text('#toast')))
        page.keyboard.press('Control+z'); settle(page, 300)
        one = src(page).count('\\includegraphics')
        page.keyboard.press('Control+z'); settle(page, 300)
        check('one undo for each takes the figure and the package out again, byte for byte', one == 1 and src(page) == base, (one, len(src(page)) - len(base)))
        check('no page errors', not errors, errors[:5])
        browser.close()
except Exception as e:
    # a run that stops part way has failed, whatever the checks before it said
    traceback.print_exc()
    check('the run reaches its end', False, e)
bad = [r for r in results if not r[1]]
print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
sys.exit(1 if bad else 0)
