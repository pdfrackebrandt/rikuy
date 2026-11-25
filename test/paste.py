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
    # (a quote after a no-break space opens: it came out ''q'')
    ('a quote after a no-break space', '<p>Section&nbsp;"Data" here.</p>', 'Section\u00a0"Data" here.', "Section~``Data'' here."),
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
        # (round 2) LaTeX with a list, a display or a comment between its paragraphs, pasted into a
        # bold, italic or underlined word: the part the format's braces cannot hold goes between them,
        # the format closed before it and opened again after it. Whole, \\textbf{..} or \\uline{..}
        # with a paragraph break or a list in it stopped TeX ("Paragraph ended before \\text@command")
        LTX = """([p, l]) => { const dt = new DataTransfer(); dt.setData('text/plain', p); dt.setData('text/x-galley-latex', l);
          document.getElementById('pages').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }"""
        for name, doc, latex, want in (
                ('a list into a bold word', 'Some \\textbf{boldword} here.', 'One.\n\n\\begin{itemize}\n  \\item x\n\\end{itemize}', 'Some \\textbf{boldOne.}\n\n\\begin{itemize}\n  \\item x\n\\end{itemize}\n\n\\textbf{word} here.'),
                ('a display into an underlined word', '\\usepackage{ulem}Some \\uline{boldword} here.', 'One.\n\\[ x \\]\n\nTwo.', '\\usepackage{ulem}Some \\uline{bold}One.\n\\[ x \\]\n\n\\uline{Two.word} here.'),
                ('a comment into a bold word', 'Some \\textbf{boldword} here.', 'One. % c\n\nTwo.', 'Some \\textbf{boldOne. % c\n}\n\n\\textbf{Two.word} here.'),
                # (review of round 2: a % in \\verb is no comment, and no format's argument holds \\verb)
                ('\\verb into a bold word', 'Some \\textbf{boldword} here.', 'One.\n\nThe \\verb|%x| code.', 'Some \\textbf{boldOne.}\n\nThe \\verb|%x| code.\n\n\\textbf{word} here.')):
            d = W(doc).replace('\\begin{document}\n\\usepackage{ulem}', '\\usepackage{ulem}\n\\begin{document}\n')
            load_doc(page, d); click_text(page, 'boldword', 4)
            page.evaluate(LTX, ['One.\n\nx', latex]); settle(page, 250)
            s = src(page)
            check('paste LaTeX ' + name + ': no paragraph break or block inside the format\'s braces', s == W(want).replace('\\begin{document}\n\\usepackage{ulem}', '\\usepackage{ulem}\n\\begin{document}\n'), repr(s[s.find('Some'):][:120]))
            page.keyboard.press('Control+z'); settle(page, 150)
            check('undo after LaTeX ' + name, src(page) == d)
        # (round 2) plain text that begins with a blank line, pasted at a paragraph's end, starts a
        # paragraph of its own, as Word's: the blank line was dropped and the words ran on ("para.New")
        for name, plain, at, want in (('a blank line first, at a paragraph\'s end', '\n\nNew words.', ('Alpha para.', 11), 'Alpha para.\n\nNew words.\n\nOmega.'),
                                      ('CRLF', '\r\n\r\nNew words.', ('Alpha para.', 11), 'Alpha para.\n\nNew words.\n\nOmega.'),
                                      ('a blank line last, at a paragraph\'s start', 'New words.\n\n', ('Alpha para.', 0), 'New words.\n\nAlpha para.\n\nOmega.'),
                                      ('a lone line end first: a space', '\nNew words.', ('Alpha para.', 11), 'Alpha para. New words.\n\nOmega.')):
            load_doc(page, W('Alpha para.\n\nOmega.')); click_text(page, *at)
            page.evaluate(PASTE, [None, plain]); settle(page, 250)
            check('paste plain text with %s: its paragraph break kept' % name, src(page) == W(want), repr(src(page)[40:]))
        page.keyboard.type('X'); settle(page, 200)
        check('the caret after the pasted words', src(page) == W('Alpha para. New words.X\n\nOmega.'), repr(src(page)[40:]))
        # (review of round 2) the same at a list item's end: a new item, as Word's paste starts a new bullet
        load_doc(page, W('\\begin{itemize}\n  \\item One words\n\\end{itemize}')); click_text(page, 'One words', 9)
        page.evaluate(PASTE, [None, '\n\nNew words.']); settle(page, 250)
        check('paste plain text with a blank line first at an item\'s end: a new item', src(page) == W('\\begin{itemize}\n  \\item One words\n  \\item New words.\n\\end{itemize}'), repr(src(page)[40:]))
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
        # (round 2) a link whose address holds a % (a URL's %20) copied with the words round it: its
        # \\href comes too. The % read as a comment made the range unbalanced, and only the words went
        HREF = '\\usepackage{hyperref}\n'
        load_doc(page, W('See \\href{http://a.b/%20x}{the link} here.\n\nplain words.').replace('\\begin{document}', HREF + '\\begin{document}'))
        place(page, ('See', 'here')); page.keyboard.press('Control+c'); settle(page, 150)
        click_text(page, 'plain', 5); page.evaluate(LAST); settle(page, 250)
        check('copy words round a link with %20 in its address, paste: the link comes too', 'plainSee \\href{http://a.b/%20x}{the link} here words.' in src(page), repr(src(page)[60:]))
        # the hostile review: a block never goes inside a format's braces. On the blank paragraph after
        # a formatted word (Enter), a list or a heading goes in as it is, italic into italic is italic
        # once, two paragraphs after Ctrl+B are both bold; inside a \\uline word a list or a heading is
        # flattened onto the line as before, paragraphs of text still split
        UL = '\\usepackage[normalem]{ulem}\n'
        W2 = lambda b, pre='': '\\documentclass{article}\n' + pre + '\\begin{document}\n' + b + '\n\\end{document}\n'
        LIST = '<ul><li>one</li><li>two</li></ul>'
        made = []
        for name, pre, doc, word, keys, html, plain, want in (
                ('B2 italic after Enter at \\emph{italic}', '', 'Some \\emph{italic}\n\nEnd.', 'italic', ('Enter',), '<i>XY</i>', 'XY', 'Some \\emph{italic}\n\n\\emph{XY}\n\nEnd.'),
                ('B3 a list after Enter at \\uline{ul}', UL, 'Some \\uline{ul}\n\nEnd.', 'ul', ('Enter',), LIST, 'one\ntwo', 'Some \\uline{ul}\n\n\\begin{itemize}\n  \\item one\n  \\item two\n\\end{itemize}\n\nEnd.'),
                ('B3 a heading after Enter at \\textbf{bold}', '', 'Some \\textbf{bold}\n\nEnd.', 'bold', ('Enter',), '<h1>Head</h1>', 'Head', 'Some \\textbf{bold}\n\n\\section{Head}\n\nEnd.'),
                ('B4 a list into a \\uline word', UL, 'Some \\uline{ulword} here.', ('ulword', 2), (), LIST, 'one\ntwo', 'Some \\uline{ulone twoword} here.'),
                ('B4 a heading into a \\uline word', UL, 'Some \\uline{ulword} here.', ('ulword', 2), (), '<h1>Head</h1>', 'Head', 'Some \\uline{ulHeadword} here.'),
                ('paragraphs into a \\uline word', UL, 'Some \\uline{ulword} here.', ('ulword', 2), (), None, 'P1\n\nP2', 'Some \\uline{ulP1}\n\n\\uline{P2word} here.'),
                ('paragraphs into {\\bfseries ..}', '', 'Some {\\bfseries boldword} here.', ('boldword', 4), (), None, 'P1\n\nP2', 'Some {\\bfseries boldP1}\n\n{\\bfseries P2word} here.'),
                ('N5 two paragraphs after Enter and Ctrl+B', '', 'Some words.\n\nEnd.', 'words.', ('Enter', 'Control+b'), None, 'P1\n\nP2', 'Some words.\n\n\\textbf{P1}\n\n\\textbf{P2}\n\nEnd.'),
                ('N4 a double underline into \\uline stays double', UL, 'Some \\uline{ulword} here.', ('ulword', 2), (), None, None, 'Some \\uline{ul\\uuline{x}word} here.'),
                ('N4 a footnote\'s bold into bold stays', '', 'Some \\textbf{boldword} here.', ('boldword', 4), (), None, None, 'Some \\textbf{boldX\\footnote{see \\textbf{this}}word} here.')):
            load_doc(page, W2(doc, pre))
            if isinstance(word, tuple): click_text(page, *word)
            else: click_text(page, word, len(word))
            for key in keys: page.keyboard.press(key); settle(page, 120)
            if html is None and plain is None:
                # (LaTeX copied on the page: what the paste keeps of it)
                lt = 'X\\footnote{see \\textbf{this}}' if 'footnote' in name else '\\uuline{x}'
                page.evaluate('''(t) => { const d = new DataTransfer(); d.setData('text/plain', 'x'); d.setData('text/x-galley-latex', t);
                  document.getElementById('pages').dispatchEvent(new ClipboardEvent('paste', { clipboardData: d, bubbles: true, cancelable: true })); }''', lt)
            else: page.evaluate(PASTE, [html, plain])
            settle(page, 250)
            s = src(page)
            check('review %s: %r' % (name, want), s == W2(want, pre), s[s.find('\\begin{document}') + 17:][:120])
            made.append((name, s))
        # (round 3) paragraphs and a list pasted into a bold word in a footnote's text: the note holds
        # them, so only \\textbf is closed round them. The note's brace was counted as a format's,
        # everything went inside \\textbf{..}, and pdfLaTeX stopped ("Paragraph ended before \\text@command")
        FN = 'Text\\footnote{See \\textbf{boldword} here.} after.'
        FNW = 'Text\\footnote{See \\textbf{boldIntro.}\n\n\\begin{itemize}\n  \\item one\nITEMS\\end{itemize}\n\n\\textbf{After.word} here.} after.'
        for name, html, plain, latex, want in (('LaTeX', None, 'Intro.\n\none\n\nAfter.', 'Intro.\n\n\\begin{itemize}\n  \\item one\n\\end{itemize}\n\nAfter.', FNW.replace('ITEMS', '')),
                                               ('HTML', '<p>Intro.</p><ul><li>one</li><li>two</li></ul><p>After.</p>', 'Intro.\none\ntwo\nAfter.', None, FNW.replace('ITEMS', '  \\item two\n')),
                                               # (review of round 3: a table or code there is no float and no verbatim, which stop TeX in a note)
                                               ('a table in HTML', '<p>Intro.</p><table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table><p>After.</p>', 'Intro.\na\tb\nc\td\nAfter.', None,
                                                'Text\\footnote{See \\textbf{boldIntro.}\n\n\\begin{tabular}{ll}\n\\hline\na & b \\\\\nc & d \\\\\n\\hline\n\\end{tabular}\n\n\\textbf{After.word} here.} after.'),
                                               ('code in HTML', '<p>Intro.</p><pre>x = 1\ny = 2</pre><p>After.</p>', 'Intro.\nx = 1\ny = 2\nAfter.', None,
                                                'Text\\footnote{See \\textbf{boldIntro.}\n\n\\textbf{\\texttt{x = 1}\\\\\n\\texttt{y = 2}}\n\n\\textbf{After.word} here.} after.')):
            load_doc(page, W2(FN)); click_text(page, 'boldword', 4)
            if latex: page.evaluate(LTX, [plain, latex])
            else: page.evaluate(PASTE, [html, plain])
            settle(page, 250)
            s = src(page)
            check('r3 %s paragraphs and a list into \\textbf in a footnote: the format closed round them, inside the note' % name, s == W2(want), repr(s[s.find('Text'):][:200]))
            made.append(('r3 %s list into \\textbf in a footnote' % name, s))
        if os.path.isfile(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist', 'tex', 'tree.wasm')):
            page.set_default_timeout(600000)
            for name, t in made:
                # (and no error of TeX's: a PDF is made after one too, in nonstop mode)
                r = page.evaluate('async (t) => { await window.rikuy.api.setSource(t); const r = await window.rikuy.api.compile(); return r.ok && !r.problems.some((p) => p.severity === "error"); }', t)
                check('review %s compiles' % name, r, t[t.find('begin{document}'):][:160])
            page.set_default_timeout(30000)
        else:
            print('SKIP the compiles of the review cases: no TeX tree in dist')
        # (round 3) strikethrough, a font colour and the highlighter pasted from Word, Google Docs or a
        # page come as the Font group writes them, with the preamble's lines in the same step; a colour
        # or a background over most of the text is the page's ink and paper, not a mark (they were dropped)
        BODY = lambda d: d[d.find('\\begin{document}') + 17:d.find('\n\\end{document}')]
        KD = '<span class="katex-display"><span class="katex"><span class="katex-mathml"><math><semantics><mrow><mi>x</mi></mrow><annotation encoding="application/x-tex">x=1</annotation></semantics></math></span></span></span>'
        PRE = lambda d: d[:d.find('\\begin{document}')]
        r3 = []
        for name, html, plain, want, pkgs in (
                ('Word\'s strikethrough', "<p class=MsoNormal>Some <s>old</s> text.<o:p></o:p></p>", 'Some old text.', 'Alpha para. Some \\sout{old} text.', ['\\usepackage[normalem]{ulem}']),
                ('Word\'s font colour', "<p class=MsoNormal>The <span style='color:#C00000'>red words</span> and the plain words after them.</p>", 'x',
                 'Alpha para. The \\textcolor[HTML]{C00000}{red words} and the plain words after them.', ['\\usepackage{xcolor}']),
                ('Word\'s highlighter', "<p class=MsoNormal>A <span style='background:yellow;mso-highlight:yellow'>marked</span> word and <span style='background:lime;mso-highlight:lime'>green</span>.</p>", 'x',
                 'Alpha para. A \\hl{marked} word and \\hl[green]{green}.', ['\\usepackage[normalem]{ulem}', '\\usepackage{xcolor}', '\\DeclareRobustCommand{\\hl}[1][yellow]']),
                ('Google Docs\' runs', '<b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr"><span style="color:#000000;background-color:transparent;">Plain and </span><span style="color:#000000;background-color:transparent;text-decoration:line-through;">struck</span><span style="color:#ff0000;background-color:#ffff00;"> red on yellow</span><span style="color:#000000;background-color:transparent;"> then the rest of it.</span></p></b>', 'x',
                 'Alpha para. Plain and \\sout{struck} \\textcolor[HTML]{FF0000}{\\hl{red on yellow}} then the rest of it.', ['\\usepackage[normalem]{ulem}', '\\usepackage{xcolor}']),
                ('a page\'s grey ink and white paper', '<span style="color: rgb(32, 33, 36); background-color: rgb(255, 255, 255);">Words from a page, <span style="color: rgb(26, 13, 171);">one blue</span> in them.</span>', 'x',
                 'Alpha para. Words from a page, \\textcolor[HTML]{1A0DAB}{one blue} in them.', ['\\usepackage{xcolor}']),
                ('a struck line break', "<p class=MsoNormal><s>one<br>two</s></p>", 'x', 'Alpha para. \\sout{one}\n\n\\sout{two}', ['\\usepackage[normalem]{ulem}']),
                # (a heading's colour is its style's: \\section draws it as headings are)
                ('a coloured heading', "<h2><span style='color:#2F5496'>Title</span></h2><p>Some words in it here, and more of them.</p>", 'x', 'Alpha para. \\section{Title}\n\nSome words in it here, and more of them.', ['!xcolor']),
                # (review of round 3: a mark round blocks goes on their words, never round them:
                # \\sout{\\begin{itemize}..}, \\sout{\\section{..}} and \\hl{..\\[..\\]..} stopped TeX)
                ('a struck list', '<del><p>gone</p><ul><li>one</li></ul></del>', 'x', 'Alpha para. \\sout{gone}\n\n\\begin{itemize}\n  \\item \\sout{one}\n\\end{itemize}', ['\\usepackage[normalem]{ulem}']),
                ('a struck heading', '<del><h2>Gone</h2></del>', 'x', 'Alpha para. \\section{\\sout{Gone}}', ['\\usepackage[normalem]{ulem}']),
                ('a highlighted display', "<p><span style='background:yellow;mso-highlight:yellow'>E " + KD + " ok</span></p>", 'x', 'Alpha para. \\hl{E}\n\\[\nx=1\n\\]\n\\hl{ok}', ['\\usepackage[normalem]{ulem}']),
                # (a hued mark on all of what was copied is no ink: a red phrase copied alone from Word,
                # a phrase Google Docs highlights; a grey one, and near white paper, are the page's)
                ('a red phrase alone from Word', "<p class=MsoNormal><span style='color:#C00000'>red words</span></p>", 'x', 'Alpha para. \\textcolor[HTML]{C00000}{red words}', ['\\usepackage{xcolor}']),
                ('a highlighted phrase alone from Google Docs', '<b id="docs-internal-guid-1" style="font-weight:normal"><p><span style="background-color:#ffff00;color:#000000">marked words</span></p></b>', 'x', 'Alpha para. \\hl{marked words}', ['\\usepackage[normalem]{ulem}']),
                ('grey words on a code box\'s paper', '<span style="color: rgb(32, 33, 36); background-color: rgb(246, 248, 250);">All grey words</span>', 'x', 'Alpha para. All grey words', ['!xcolor', '!ulem'])):
            load_doc(page, W2('Alpha para.')); click_text(page, 'Alpha para.', 11); page.keyboard.type(' '); settle(page, 100)
            page.evaluate(PASTE, [html, plain]); settle(page, 250)
            s = src(page)
            check('r3 paste %s: %r' % (name, want), BODY(s) == want, repr(BODY(s)))
            check('r3 paste %s: the preamble gets %s' % (name, ', '.join(pkgs)), all((k[1:] not in PRE(s)) if k[0] == '!' else (k in PRE(s)) for k in pkgs) and PRE(s).count('ulem') <= 1, repr(PRE(s)))
            page.keyboard.press('Control+z'); settle(page, 150)
            check('r3 undo after paste %s: one step' % name, src(page) == W2('Alpha para. '), repr(src(page)))
            r3.append((name, s))
        # (soul's \\hl takes no colour: a green highlight pasted there is \\hl alone, and no definition comes)
        SOUL = '\\usepackage{soul}\n'
        load_doc(page, W2('Alpha para.', SOUL)); click_text(page, 'Alpha para.', 11)
        page.evaluate(PASTE, ["<span style='background:lime;mso-highlight:lime'>green</span>", 'green']); settle(page, 250)
        check('r3 paste a green highlight where soul defines \\hl: \\hl{..}, no definition', BODY(src(page)) == 'Alpha para.\\hl{green}' and 'DeclareRobustCommand' not in src(page), repr(src(page)))
        # (review of round 3: soul's \\hl holds words alone; a colour or \\sout in it stopped TeX: it goes inside them)
        for name, html, want in (('a colour in a highlight', "<p>x <span style='background:yellow;mso-highlight:yellow'>a <span style='color:#FF0000'>b</span></span> y</p>", 'Alpha para.x \\hl{a} \\textcolor[HTML]{FF0000}{\\hl{b}} y'),
                                 ('struck and highlighted', '<b id="docs-internal-guid-1" style="font-weight:normal"><p><span style="background-color:#ffff00;text-decoration:line-through">both</span><span> plain words</span></p></b>', 'Alpha para.\\sout{\\hl{both}} plain words')):
            load_doc(page, W2('Alpha para.', SOUL + '\\usepackage{xcolor}\n')); click_text(page, 'Alpha para.', 11)
            page.evaluate(PASTE, [html, 'x']); settle(page, 250)
            check('r3 soul: %s keeps \\hl innermost' % name, BODY(src(page)) == want, repr(BODY(src(page))))
            r3.append(('soul: ' + name, src(page)))
        if os.path.isfile(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist', 'tex', 'tree.wasm')):
            page.set_default_timeout(600000)
            for name, t in r3:
                # (and no error of TeX's: a PDF is made after one too, in nonstop mode)
                r = page.evaluate('async (t) => { await window.rikuy.api.setSource(t); const r = await window.rikuy.api.compile(); return r.ok && !r.problems.some((p) => p.severity === "error"); }', t)
                check('r3 paste %s compiles' % name, r, t[:300])
            page.set_default_timeout(30000)
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
