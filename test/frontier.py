"""New features from the user-feedback pass: print/PDF, outline and problems, copy as
rich HTML, equation edits that keep the source spelling."""
import os, sys, io, traceback
sys.path.insert(0, os.path.dirname(__file__))
from browser import open_page, check, results, src, click_text, select_text, SHOTS
from playwright.sync_api import sync_playwright
try:
    import pypdf  # reads the printed PDF back; without it only the PDF's size can be checked
except ImportError:
    pypdf = None

try:
    with sync_playwright() as p:
        browser, page, errors = open_page(p, width=1440, height=900)
        base = src(page)
        # ---- print at the document's paper size
        n_pages = page.evaluate("document.querySelectorAll('#pages .page').length")
        page.evaluate("window.rikuy.preparePrint()")
        page.wait_for_timeout(300)
        size = page.evaluate("document.getElementById('print-page').textContent")
        pdf = page.pdf(prefer_css_page_size=True, print_background=True)
        page.evaluate("window.rikuy.endPrint()")
        if pypdf:
            r = pypdf.PdfReader(io.BytesIO(pdf))
            w, h = float(r.pages[0].mediabox.width), float(r.pages[0].mediabox.height)
            check('PDF has one sheet per page', len(r.pages) == n_pages, (len(r.pages), n_pages))
            check('PDF sheet is US letter like the document', abs(w - 612) < 3 and abs(h - 792) < 3, (w, h, size))
            txt = r.pages[0].extract_text()
            check('PDF text is real text', 'Editing in Print' in txt and 'How to use it' in txt, txt[:200])
        else:
            # said out loud, so a run without pypdf does not pass for one that checked the PDF
            print('SKIP PDF sheets, paper size and text: pypdf is not installed (pip install pypdf)')
            check('pdf produced', len(pdf) > 10000)
        # ---- outline
        page.click('#b-nav'); page.wait_for_timeout(300)
        items = page.evaluate("[...document.querySelectorAll('.nav-item')].map(b => b.textContent)")
        check('outline lists the sections', items[:2] == ['1How to use it', '2The round trip'] and len(items) == 5, items)
        page.click('.nav-item >> nth=3'); page.wait_for_timeout(300)
        vis = page.evaluate("(() => { const h = [...document.querySelectorAll('.it.h')].find(e => e.textContent.includes('Keyboard')); const r = h.getBoundingClientRect(); return r.top > 40 && r.top < 300; })()")
        check('outline click scrolls to the section', vis)
        check('current section is marked', page.evaluate("document.querySelector('.nav-item.cur') && document.querySelector('.nav-item.cur').textContent") == '4Keyboard')
        # ---- problems
        click_text(page, 'Click anywhere in this paragraph', 0)
        page.keyboard.type('See ')
        page.evaluate("""(() => { const g = window.rikuy; const f = 'main.tex'; const s = g.files.get(f); const at = s.indexOf('See ') + 4;
          g.commit([{ f, s: at, e: at, t: 'Table~\\\\ref{tab:nope} and \\\\citet{nobody}. ' }], null, 'type'); })()""")
        page.wait_for_timeout(700)
        check('status counts the problems', page.evaluate("document.getElementById('st-warn').textContent") == '2 problems', page.evaluate("document.getElementById('st-warn').textContent"))
        page.click('#st-warn'); page.wait_for_timeout(300)
        probs = page.evaluate("[...document.querySelectorAll('.prob')].map(b => b.textContent)")
        check('problems name the label and the citation', any('tab:nope' in x for x in probs) and any('nobody' in x for x in probs), probs)
        page.evaluate("window.rikuy.undo()"); page.wait_for_timeout(200)
        page.evaluate("window.rikuy.undo()"); page.wait_for_timeout(600)
        check('problems clear when fixed', page.evaluate("document.getElementById('st-warn').hidden"), page.evaluate("document.getElementById('st-warn').textContent"))
        check('source back to the start', src(page) == base)
        page.click('#nav-close'); page.wait_for_timeout(500)  # closing the panel lays the pages out again
        # ---- copy as rich HTML
        select_text(page, 'bold')
        html = page.evaluate("""(() => { const dt = new DataTransfer(); document.getElementById('pages').dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true })); return dt.getData('text/html'); })()""")
        check('copy carries bold as HTML', '<b>bold</b>' in html, html[:200])
        page.evaluate("""(() => { const m = [...document.querySelectorAll('#pages .katex')][0]; const r = document.createRange(); r.setStartBefore(m.closest('[data-a]') || m); r.setEndAfter(m.closest('[data-a]') || m); getSelection().removeAllRanges(); getSelection().addRange(r); })()""")
        html2 = page.evaluate("""(() => { const dt = new DataTransfer(); document.getElementById('pages').dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true })); return dt.getData('text/html'); })()""")
        check('copied math travels as MathML for Word', '<math' in html2 and 'katex-html' not in html2, html2[:200])
        print('errors:', errors[:5])
        check('no page errors', not errors, errors[:5])
        browser.close()
except Exception as e:
    # a run that stops part way has failed, whatever the checks before it said
    traceback.print_exc()
    check('the run reaches its end', False, e)
bad = [r for r in results if not r[1]]
print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
sys.exit(1 if bad else 0)
