"""Review (src/cmd/review.js, src/review.js, src/collab.js): Track Changes (Ctrl+Shift+E, the
status bar's switch) as Word's: off, edits are no changes and the changes waiting stay; on,
every edit is a change; Display for Review (Simple, All, No Markup) and Show Markup; Accept and
Reject at the caret and move to the next, all, all and stop tracking; Previous and Next change;
comments: Previous, Next, Delete, Delete All (one undo), Edit, Show Comments; Inspect Document;
Word Count (Ctrl+Shift+G) of the document and of a selection; Compare with a file; Download with
Markup (the changes package, compiled in the page where dist/tex exists); Read Aloud with the
browser's voices; the Review tab on a phone at 390 and 360 px with touch; screenshots in
$SHOTS/review-*."""
import os, sys, time, json, re, subprocess, tempfile
sys.path.insert(0, os.path.dirname(__file__))
from browser import open_page, check, results, src, load_doc, click_text, select_text, SHOTS, ROOT
from playwright.sync_api import sync_playwright

DOC = ('\\documentclass{article}\n\\begin{document}\n'
       'The first paragraph has some words.\n\n'
       'The second paragraph has more words.\n'
       '% comment (Ana) on "second": Is this right?\n'
       '% reply (Pedro): Yes.\n\n'
       'The third paragraph ends here.\n'
       '% comment (Bo): Shorter?\n'
       '\\end{document}\n')
N = "window.rikuy.realChanges().length"


def edit(page, find, repl):
    page.evaluate("""([a, b]) => { const g = window.rikuy; const f = g.main; const s = g.files.get(f); const at = s.indexOf(a);
      if (at < 0) throw new Error('not found: ' + a); g.closeGroup(); g.commit([{ f, s: at, e: at + a.length, t: b }], null, 'type'); g.closeGroup(); }""", [find, repl])
    page.wait_for_timeout(120)


def tap(page, loc):
    """A tap on a control, the ribbon's row swiped to it first (a phone shows part of the row)"""
    loc.evaluate('(e) => e.scrollIntoView({ block: "nearest", inline: "center" })'); page.wait_for_timeout(150)
    loc.tap(); page.wait_for_timeout(250)


def fresh(page, doc=DOC):
    """The document opened anew: its base the text as it is, Track Changes off."""
    load_doc(page, doc)
    page.wait_for_function("!!window.rikuy.base")
    page.evaluate("(() => { const g = window.rikuy; g.setBase({ t: Date.now(), label: 'Opened', files: g.files, track: false }); })()")
    page.wait_for_timeout(100)


def run():
    with sync_playwright() as p:
        browser, page, errors = open_page(p, width=1366, height=900)
        fresh(page)
        st = lambda: page.evaluate("document.getElementById('st-track').textContent")
        check('Track Changes is off at first, as in Word; the status bar says so', page.evaluate("window.rikuy.trackOn()") is False and st() == 'Track Changes: Off', st())
        # off: an edit is no change
        edit(page, 'some words', 'a few words')
        check('with Track Changes off an edit is no change', page.evaluate(N) == 0, page.evaluate(N))
        # Ctrl+Shift+E: on
        click_text(page, 'first paragraph', 0)
        page.keyboard.press('Control+Shift+E'); page.wait_for_timeout(200)
        check('Ctrl+Shift+E turns it on; the status bar and the button say so', page.evaluate("window.rikuy.trackOn()") is True and st() == 'Track Changes: On' and page.evaluate("document.getElementById('rv-track').getAttribute('aria-pressed')") == 'true', st())
        check('turned on, the marks show: All Markup', page.evaluate("window.rikuy.markup()") == 'all')
        edit(page, 'more words', 'many words')
        edit(page, 'ends here', 'ends')
        page.wait_for_timeout(300)
        check('with it on every edit is a change', page.evaluate(N) == 2, page.evaluate(N))
        check('marked on the page: insertions, deletions, bars', page.evaluate("(CSS.highlights.get('g-ins') || {size: 0}).size") >= 1 and page.evaluate("document.querySelectorAll('.del-mk').length") >= 1 and page.evaluate("document.querySelectorAll('.chg-bar').length") >= 1)
        page.screenshot(path=os.path.join(SHOTS, 'review-all-markup-1366.png'))
        # Display for Review
        page.evaluate("window.rikuy.setMarkup('simple')"); page.wait_for_timeout(250)
        check('Simple Markup: the bars alone', page.evaluate("document.querySelectorAll('.chg-bar').length") >= 1 and not page.evaluate("CSS.highlights.get('g-ins')") and page.evaluate("document.querySelectorAll('.del-mk').length") == 0)
        page.evaluate("window.rikuy.setMarkup('none')"); page.wait_for_timeout(250)
        check('No Markup: nothing', page.evaluate("document.querySelectorAll('.chg-bar').length") == 0)
        page.evaluate("window.rikuy.setMarkup('all')"); page.wait_for_timeout(250)
        page.evaluate("window.rikuy.setMarkupShow('showIns', false)"); page.wait_for_timeout(250)
        check('Show Markup without Insertions and Deletions: no change marks', page.evaluate("document.querySelectorAll('.chg-bar').length") == 0)
        page.evaluate("window.rikuy.setMarkupShow('showIns', true)"); page.wait_for_timeout(250)
        # off again: the changes waiting stay, new edits are none
        page.keyboard.press('Control+Shift+E'); page.wait_for_timeout(150)
        edit(page, 'The first', 'A first')
        check('off again: the two changes stay, the new edit is none', page.evaluate(N) == 2 and 'A first' in src(page), page.evaluate(N))
        edit(page, 'many words', 'many more words')
        check('an edit inside a change waiting changes that change (now "many " put in before "more")', page.evaluate(N) == 2 and page.evaluate("window.rikuy.realChanges().some(c => c.b === 'many ' && !c.a)"), page.evaluate("window.rikuy.realChanges().map(c => [c.a, c.b])"))
        # Previous and Next change, Accept and Reject
        click_text(page, 'A first', 0)
        page.evaluate("window.rikuy.runCommand('change-next')"); page.wait_for_timeout(200)
        sel = page.evaluate("String(getSelection())")
        check('Next Change goes to the first change and selects it', sel == 'many ', sel)
        page.evaluate("window.rikuy.runCommand('change-next')"); page.wait_for_timeout(200)
        check('and the next', page.evaluate("window.rikuy.caretNow().p") > src(page).index('third'), page.evaluate("String(getSelection())"))
        page.evaluate("window.rikuy.runCommand('change-prev')"); page.wait_for_timeout(200)
        check('Previous Change goes back', page.evaluate("String(getSelection())") == 'many ', page.evaluate("String(getSelection())"))
        before = src(page)
        page.evaluate("window.rikuy.runCommand('change-reject')"); page.wait_for_timeout(300)
        check('Reject (and move to next) puts the old words back, one change left', 'has more words' in src(page) and page.evaluate(N) == 1, (page.evaluate(N), src(page)[60:140]))
        page.evaluate("window.rikuy.undo()"); page.wait_for_timeout(250)
        check('one undo brings the change back byte for byte', src(page) == before and page.evaluate(N) == 2)
        click_text(page, 'many more', 2)
        page.evaluate("window.rikuy.runCommand('change-accept')"); page.wait_for_timeout(300)
        check('Accept (and move to next): the next change selected', page.evaluate("window.rikuy.caretNow().p") > src(page).index('third'))
        check('Accept keeps the text and the change goes', src(page) == before and page.evaluate(N) == 1)
        page.evaluate("window.rikuy.acceptAllChanges(false)"); page.wait_for_timeout(250)
        check('Accept All Changes: none left, the text as it was', page.evaluate(N) == 0 and src(page) == before)
        page.evaluate("window.rikuy.setTracking(true)"); edit(page, 'third', 'last'); edit(page, 'first', 'opening')
        page.evaluate("window.rikuy.rejectAllChanges(true)"); page.wait_for_timeout(300)
        check('Reject All Changes and Stop Tracking: the text back, tracking off', src(page) == before and page.evaluate(N) == 0 and page.evaluate("window.rikuy.trackOn()") is False)
        check('the Accept and Reject buttons say there is nothing to do', page.evaluate("document.getElementById('rv-accept').disabled") is True)
        # comments
        fresh(page)
        click_text(page, 'first paragraph', 0)
        page.evaluate("window.rikuy.runCommand('comment-next')"); page.wait_for_timeout(250)
        check('Next Comment: to the line Ana\'s comment is on', page.evaluate("window.rikuy.commentHere() && window.rikuy.commentHere().who") == 'Ana')
        page.evaluate("window.rikuy.runCommand('comment-next')"); page.wait_for_timeout(250)
        check('then Bo\'s', page.evaluate("window.rikuy.commentHere() && window.rikuy.commentHere().who") == 'Bo')
        page.evaluate("window.rikuy.runCommand('comment-prev')"); page.wait_for_timeout(250)
        check('Previous Comment: back to Ana\'s', page.evaluate("window.rikuy.commentHere() && window.rikuy.commentHere().who") == 'Ana')
        page.evaluate("window.rikuy.runCommand('comment-delete')"); page.wait_for_timeout(250)
        check('Delete: the comment and its reply go, nothing else', src(page) == DOC.replace('% comment (Ana) on "second": Is this right?\n% reply (Pedro): Yes.\n', ''), src(page))
        page.evaluate("window.rikuy.undo()"); page.wait_for_timeout(200)
        check('one undo, byte for byte', src(page) == DOC)
        page.evaluate("window.rikuy.runCommand('comment-delete-all')"); page.wait_for_timeout(250)
        check('Delete All Comments: every comment line, one step', '% comment' not in src(page) and '% reply' not in src(page) and page.evaluate("window.rikuy.hist.length") >= 1)
        page.evaluate("window.rikuy.undo()"); page.wait_for_timeout(200)
        check('and one undo brings them all back', src(page) == DOC)
        click_text(page, 'third paragraph', 0)
        page.evaluate("window.rikuy.runCommand('comment-edit')"); page.wait_for_timeout(250)
        page.fill('.pop-comment textarea', 'Much shorter, please.')
        page.get_by_role('button', name='Save').click(); page.wait_for_timeout(250)
        check('Edit Comment rewrites its words only', src(page) == DOC.replace('% comment (Bo): Shorter?', '% comment (Bo): Much shorter, please.'), src(page)[-120:])
        page.evaluate("window.rikuy.undo()"); page.wait_for_timeout(200)
        click_text(page, 'third paragraph', 0)
        r = page.evaluate("(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(); return [r.left, r.top]; })()")
        page.mouse.click(r[0] + 2, r[1] + 4, button='right'); page.wait_for_timeout(250)
        check('the right click menu on a commented line has Edit Comment', page.locator('.pop-ctx').get_by_role('menuitem', name='Edit Comment').count() == 1)
        page.keyboard.press('Escape')
        check('the margin shows the comments', page.evaluate("document.querySelectorAll('.cm-mark').length") == 2)
        page.evaluate("window.rikuy.runCommand('comments-show')"); page.wait_for_timeout(250)
        check('Show Comments off: no marks for them', page.evaluate("document.querySelectorAll('.cm-mark').length") == 0)
        page.evaluate("window.rikuy.runCommand('comments-show')"); page.wait_for_timeout(250)
        # Inspect Document
        page.evaluate("window.rikuy.runCommand('inspect-document')"); page.wait_for_timeout(250)
        txt = page.evaluate("document.querySelector('.rv-inspect').textContent")
        check('Inspect Document lists the comments with their authors', '2 threads, by Ana, Pedro, Bo' in txt, txt)
        page.locator('.rv-inspect').get_by_role('button', name='Remove All').click(); page.wait_for_timeout(250)
        check('and removes them at a click', '% comment' not in src(page))
        page.evaluate("window.rikuy.undo()"); page.wait_for_timeout(200)
        # Word Count
        page.keyboard.press('Escape')
        click_text(page, 'first paragraph', 0)
        page.keyboard.press('Control+Shift+G'); page.wait_for_timeout(300)
        rows = page.evaluate("Object.fromEntries([...document.querySelectorAll('.rv-stats tr')].map(r => [r.cells[0].textContent, r.cells[1].textContent]))")
        check('Ctrl+Shift+G: Word Count with pages, words, characters, paragraphs, lines', rows.get('Pages') == '1' and rows.get('Words') == '17' and rows.get('Paragraphs') == '3' and rows.get('Lines') == '3', rows)
        # (Word counts no paragraph mark among the characters)
        check('characters with and without spaces', rows.get('Characters (with spaces)') == str(len('The first paragraph has some words.The second paragraph has more words.The third paragraph ends here.')) and int(rows.get('Characters (no spaces)')) == len('Thefirstparagraphhassomewords.Thesecondparagraphhasmorewords.Thethirdparagraphendshere.'), rows)
        page.screenshot(path=os.path.join(SHOTS, 'review-wordcount-1366.png'))
        page.keyboard.press('Escape')
        select_text(page, 'second paragraph has')
        page.evaluate("window.rikuy.runCommand('word-count')"); page.wait_for_timeout(300)
        rows = page.evaluate("Object.fromEntries([...document.querySelectorAll('.rv-stats tr')].map(r => [r.cells[0].textContent, r.cells[1].textContent]))")
        cap = page.evaluate("document.querySelector('.rv-stats caption').textContent")
        check('of a selection: its own numbers', cap == 'Statistics of the selection' and rows.get('Words') == '3' and rows.get('Characters (with spaces)') == '20', (cap, rows))
        page.keyboard.press('Escape')
        fn = DOC.replace('some words.', 'some words.\\footnote{A note of five words.}')
        load_doc(page, fn); page.wait_for_timeout(200)
        page.evaluate("window.rikuy.runCommand('word-count')"); page.wait_for_timeout(300)
        w1 = page.evaluate("[...document.querySelectorAll('.rv-stats tr')].find(r => r.cells[0].textContent === 'Words').cells[1].textContent")
        page.click('#rv-count-notes'); page.wait_for_timeout(200)
        w2 = page.evaluate("[...document.querySelectorAll('.rv-stats tr')].find(r => r.cells[0].textContent === 'Words').cells[1].textContent")
        check('Include footnotes and captions counts the footnote\'s words, unticked not', w1 == '22' and w2 == '17', (w1, w2))
        page.click('#rv-count-notes'); page.keyboard.press('Escape')
        # Compare with a file
        fresh(page)
        other = DOC.replace('first paragraph', 'opening paragraph').replace('ends here', 'stops')
        tmpd = tempfile.mkdtemp()
        fp = os.path.join(tmpd, 'other.tex'); open(fp, 'w').write(other)
        with page.expect_file_chooser() as fc:
            page.evaluate("window.rikuy.runCommand('compare-file')")
        fc.value.set_files(fp); page.wait_for_timeout(500)
        check('Compare with a File: its differences are changes to accept or reject', page.evaluate(N) == 2 and page.evaluate("window.rikuy.base.label") == 'Compared with other.tex', page.evaluate(N))
        page.evaluate("window.rikuy.rejectAllChanges(false)"); page.wait_for_timeout(300)
        check('rejecting them all gives that file\'s text', src(page) == other)
        # Download with Markup: the changes package's marks, the project untouched
        fresh(page)
        page.evaluate("window.rikuy.setTracking(true)")
        edit(page, 'some words', 'some good words'); edit(page, 'more words', 'words'); edit(page, 'ends here', 'stops here')
        cur = src(page)
        with page.expect_download() as dl:
            page.evaluate("window.rikuy.runCommand('markup-copy')")
        mp = os.path.join(tmpd, 'markup.tex'); dl.value.save_as(mp)
        mt = open(mp, encoding='utf8').read()
        check('Download with Markup: \\added, \\deleted, \\replaced and the comments as \\todo', '\\usepackage{changes}\n\\usepackage{todonotes}\n\\begin{document}' in mt and '\\added{good }' in mt and '\\deleted{more }' in mt and '\\replaced{stops}{ends}' in mt and '\\todo[inline]{Ana: Is this right?}%' in mt, mt)
        check('the project itself is untouched', src(page) == cur)
        if os.path.isdir(os.path.join(ROOT, 'dist', 'tex')) and os.path.exists(os.path.join(ROOT, 'dev', 'texrun.py')) and os.environ.get('RIKUY_NO_COMPILE') != '1':
            d2 = tempfile.mkdtemp(); open(os.path.join(d2, 'main.tex'), 'w').write(mt)
            r = subprocess.run([sys.executable, os.path.join(ROOT, 'dev', 'texrun.py'), d2, 'main.tex', 'pdflatex', '240'], env={**os.environ, 'RIKUY_DIST': os.path.join(ROOT, 'dist')}, capture_output=True, text=True, timeout=600)
            out = r.stdout + r.stderr
            check('and it compiles in the page with pdfLaTeX (TeX\'s own changes and todonotes)', 'ok=True' in out and 'pdf=None' not in out, out[-400:])
        # Read Aloud, with the browser's voices (a stand in that records them)
        page.evaluate("""(() => { window.__said = []; Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel() { window.__said.push('cancel'); }, speak(u) { window.__said.push([u.lang, u.text]); setTimeout(() => u.onend && u.onend(), 5); } } });
          Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, writable: true, value: function (t) { this.text = t; } }); })()""")
        click_text(page, 'second paragraph', 0)
        page.keyboard.press('Control+Alt+Space'); page.wait_for_timeout(300)
        said = page.evaluate("window.__said")
        check('Read Aloud reads from the caret on, in the document\'s language', said and said[1][0] == 'en-US' and said[1][1].startswith('second paragraph'), said[:3])
        check('no page errors', not errors, errors[:5])
        browser.close()

        # the Review tab, its menus and the status bar at 1920 and 1366, light and dark; then a phone
        for w, h, dark in ((1920, 1080, False), (1920, 1080, True), (1366, 900, True)):
            browser, page, errors = open_page(p, width=w, height=h, dark=dark)
            fresh(page); page.evaluate("window.rikuy.setTracking(true)"); edit(page, 'more words', 'many words')
            page.get_by_role('tablist', name='Ribbon', exact=True).get_by_role('tab', name='Review', exact=True).click(); page.wait_for_timeout(300)
            page.screenshot(path=os.path.join(SHOTS, 'review-tab-%d%s.png' % (w, '-dark' if dark else '')))
            page.evaluate("window.rikuy.runCommand('display-for-review')"); page.wait_for_timeout(250)
            page.screenshot(path=os.path.join(SHOTS, 'review-display-%d%s.png' % (w, '-dark' if dark else '')))
            check('%d px%s: Display for Review\'s menu, the mode checked' % (w, ' dark' if dark else ''), page.evaluate("[...document.querySelectorAll('.pop [role=menuitemradio][aria-checked=true]')].map(e => e.textContent.trim())") == ['All Markup'])
            page.keyboard.press('Escape')
            check('%d px%s: no page errors' % (w, ' dark' if dark else ''), not errors, errors[:5])
            browser.close()
        for w, h in ((390, 844), (360, 740)):
            browser, page, errors = open_page(p, width=w, height=h, touch=True)
            fresh(page)
            # (a phone's tabs are a list to choose from)
            page.select_option('#rb-tabsel', 'review'); page.wait_for_timeout(300)
            btn = page.locator('#rv-track')
            if not btn.is_visible():
                # (folded: through its group's button)
                tap(page, page.locator('#rv-track').locator('xpath=ancestor::*[contains(@class, "rb-grp")]').locator('.rb-gbtn'))
                page.locator('.pop').get_by_role('menuitemcheckbox', name='Track Changes').tap()
            else:
                tap(page, btn)
            page.wait_for_timeout(250)
            check('%d px: Track Changes by a tap' % w, page.evaluate("window.rikuy.trackOn()") is True)
            edit(page, 'more words', 'many words')
            check('%d px: and the edit is a change' % w, page.evaluate(N) == 1)
            small = page.evaluate("[...document.querySelectorAll('#rp-review button')].filter(b => b.offsetParent && b.getBoundingClientRect().height < 44 && b.getBoundingClientRect().width > 0).map(b => b.id || b.getAttribute('aria-label'))")
            check('%d px: the Review tab\'s controls are 44 px targets' % w, not small, small)
            page.evaluate("window.rikuy.runCommand('word-count')"); page.wait_for_timeout(300)
            box = page.evaluate("(() => { const r = document.querySelector('.rv-count').getBoundingClientRect(); return [r.left, r.right, innerWidth]; })()")
            check('%d px: Word Count inside the screen' % w, box[0] >= 0 and box[1] <= box[2], box)
            page.screenshot(path=os.path.join(SHOTS, 'review-phone-%d.png' % w))
            check('%d px: no sideways scroll' % w, page.evaluate("document.documentElement.scrollWidth <= innerWidth"))
            check('%d px: no page errors' % w, not errors, errors[:5])
            browser.close()

    bad = [r for r in results if not r[1]]
    print(f"{len(results) - len(bad)}/{len(results)} passed")
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    run()
