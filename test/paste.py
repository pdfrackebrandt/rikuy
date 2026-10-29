"""Paste from Word, Google Docs, web pages, spreadsheets and chat assistants."""
import os, sys, traceback
sys.path.insert(0, os.path.dirname(__file__))
from browser import open_page, check, results, src, click_text
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
            page.wait_for_timeout(250)
            s = src(page)
            got = s[s.find('\\section{How to use it}') + len('\\section{How to use it}\n'):s.find('Click anywhere in this paragraph')]
            check('paste ' + name, got == want, repr(got))
            page.keyboard.press('Control+z'); page.wait_for_timeout(150)
            check('undo after ' + name, src(page) == base)
        # inside a heading a paste stays on one line
        click_text(page, 'How to use it', 3)
        page.evaluate(PASTE, ['<p>one</p><p>two</p>', 'one\n\ntwo'])
        page.wait_for_timeout(200)
        check('paste into a heading stays inline', '\\section{Howone two to use it}' in src(page), src(page)[src(page).find('\\section'):][:60])
        page.keyboard.press('Control+z'); page.wait_for_timeout(150)
        # Ctrl+Shift+V pastes plain text
        click_text(page, 'Click anywhere in this paragraph', 0)
        page.keyboard.down('Control'); page.keyboard.down('Shift'); page.keyboard.press('KeyV'); page.keyboard.up('Shift'); page.keyboard.up('Control')
        page.evaluate("window.rikuy.plainPaste = true")
        page.evaluate(PASTE, ['<b>bold</b>', 'bold'])
        page.wait_for_timeout(200)
        check('plain paste ignores formatting', 'bold\nClick anywhere' in src(page) or 'boldClick anywhere' in src(page), src(page)[src(page).find('use it}'):][:60])
        page.keyboard.press('Control+z'); page.wait_for_timeout(150)
        check('source restored', src(page) == base)
        # a pasted screenshot joins the project under a name of its own (the paste did nothing)
        PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
        for _ in range(2):
            click_text(page, 'Click anywhere in this paragraph', 0)
            page.evaluate('''(b) => { const f = new File([Uint8Array.from(atob(b), (c) => c.charCodeAt(0))], 'image.png', { type: 'image/png' });
              const dt = new DataTransfer(); dt.items.add(f); document.getElementById('pages').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }''', PNG)
            page.wait_for_timeout(300)
        pasted = page.evaluate("[...window.rikuy.assetBlobs.keys()].filter((n) => n.startsWith('pasted-'))")
        check('two pasted screenshots are two figures in the project', len(pasted) == 2, pasted)
        check('and the toast says how to place one', '\\includegraphics{pasted-' in page.inner_text('#toast'), page.inner_text('#toast'))
        check('no page errors', not errors, errors[:5])
        browser.close()
except Exception as e:
    # a run that stops part way has failed, whatever the checks before it said
    traceback.print_exc()
    check('the run reaches its end', False, e)
bad = [r for r in results if not r[1]]
print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
sys.exit(1 if bad else 0)
