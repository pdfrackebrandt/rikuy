"""Spelling in the page (src/cmd/review.js, src/spell/, src/ui/spellpane.js): Hunspell in its
worker marks the words the dictionary does not know with a red wavy line and nothing else (no
command, key, math, code, address); the right click menu and a long press on a phone offer its
suggestions; a suggestion changes only the characters that differ, one undo back; Ignore Once,
Ignore All, Add to Dictionary (a `% rikuy: words` line, cspell's lines read too), Recheck
Document, Check Spelling as You Type; the dictionary per language (babel, \\selectlanguage,
\\foreignlanguage); Review › Language for a selection and the document as round trips; the
Spelling pane (F7) by mouse and keys; the status bar's proofing language; a 141 KB paper's time;
the phone at 390 and 360 px with touch; screenshots in $SHOTS/spell-*."""
import os, sys, time, json
sys.path.insert(0, os.path.dirname(__file__))
from browser import open_page, check, results, src, load_doc, click_text, select_text, roundtrip, SHOTS, ROOT
from playwright.sync_api import sync_playwright

DOC = ('\\documentclass{article}\n\\begin{document}\n'
       'This sentense has a mistaek, a \\textbf{wr}onng word and $x_{abcdefg}$ math \\label{sec:keyz} \\cite{knuthh} '
       '\\texttt{codez} \\url{https://example.com/pathz} and main.tex, NASA, x2.\n\\end{document}\n')
BAD = "window.rikuy.sp ? window.rikuy.sp.bad.map(x => x.w) : null"


def settle(page, ms=6000):
    """Until the spell worker has answered for the text as it is now."""
    t0 = time.time()
    page.wait_for_timeout(350)
    while time.time() - t0 < ms / 1000:
        done = page.evaluate("""() => { const S = window.rikuy.sp; if (!S || !S.plan || S.planModel !== window.rikuy.model) return false;
          for (const [d, set] of S.plan.words) { const K = S.known.get(d); if (S.failed.has(d)) continue; if (!K) return false; for (const w of set) if (!K.has(w)) return false; }
          return true; }""")
        if done:
            page.wait_for_timeout(120)
            return True
        page.wait_for_timeout(100)
    return False


def menu_names(page):
    return page.evaluate("[...document.querySelectorAll('.pop-ctx [role=menuitem], .pop-ctx [role=menuitemcheckbox], .pop-ctx [role=menuitemradio]')].map(e => e.getAttribute('aria-label') || e.textContent.trim())")


def run():
    with sync_playwright() as p:
        browser, page, errors = open_page(p, width=1366, height=900)
        check('spelling is Rikuy\'s here: Hunspell can run', page.evaluate('window.rikuy.spellAvailable()') is True)
        load_doc(page, DOC)
        check('the first check comes back', settle(page, 15000))
        bad = page.evaluate(BAD)
        check('the words the dictionary does not know are marked, nothing of LaTeX, code, addresses or capitals', sorted(bad) == ['mistaek', 'sentense', 'wronng'], bad)
        check('the browser\'s own spelling is off where Rikuy\'s runs', page.evaluate("document.getElementById('pages').spellcheck") is False)
        marked = page.evaluate("[...(CSS.highlights.get('rk-spell') || [])].map(r => r.toString())")
        check('the red lines are on those words on the page (a word half bold in two pieces)', sorted(marked) == sorted(['sentense', 'mistaek', 'wr', 'onng']), marked)
        check('the status bar says the proofing language and the count', page.evaluate("document.getElementById('st-lang').textContent") == 'English (United States) · 3 spelling errors', page.evaluate("document.getElementById('st-lang').textContent"))
        # the right click menu on a marked word: suggestions first
        click_text(page, 'mistaek', 3)
        page.evaluate("window.rikuy.spellSuggest(window.rikuy.spellAt())")
        page.wait_for_timeout(500)
        r = page.evaluate("(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(); return [r.left, r.top]; })()")
        page.mouse.click(r[0], r[1] + 4, button='right'); page.wait_for_timeout(300)
        names = menu_names(page)
        check('right click on a marked word: suggestions, Ignore All, Add to Dictionary', names[:1] == ['mistake'] and 'Ignore All' in names and 'Add to Dictionary' in names, names)
        page.screenshot(path=os.path.join(os.environ.get('SHOTS', SHOTS), 'spell-menu-1366.png'))
        h0 = page.evaluate('window.rikuy.hist.length')
        page.get_by_role('menuitem', name='mistake').click(); page.wait_for_timeout(300)
        after = src(page)
        check('a suggestion changes only the letters that differ, as one step', after == DOC.replace('mistaek', 'mistake') and page.evaluate('window.rikuy.hist.length') == h0 + 1, after[:160])
        page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(200)
        check('one undo gives the source back byte for byte', src(page) == DOC)
        # a word across markup: the change goes where the differing letters are
        settle(page)
        page.evaluate("(() => { const x = window.rikuy.sp.bad.find(y => y.q === 'wronng'); window.rikuy.spellChange(x, 'wrong'); })()")
        page.wait_for_timeout(250)
        check('a word half bold: the letter that differs goes, the bold stays', src(page) == DOC.replace('\\textbf{wr}onng', '\\textbf{wr}ong'), src(page)[40:140])
        page.evaluate('window.rikuy.undo()'); settle(page)
        page.evaluate("(() => { const x = window.rikuy.sp.bad.find(y => y.q === 'wronng'); window.rikuy.spellChange(x, 'xronng'); })()")
        page.wait_for_timeout(250)
        check('and a change inside the bold part stays inside it', src(page) == DOC.replace('\\textbf{wr}onng', '\\textbf{xr}onng'), src(page)[40:140])
        page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(150)
        # Ignore All, Ignore Once, Recheck
        settle(page)
        page.evaluate("window.rikuy.spellIgnoreAll('sentense')"); page.wait_for_timeout(150)
        check('Ignore All: the word is no longer marked, the source untouched', 'sentense' not in page.evaluate(BAD) and src(page) == DOC)
        page.evaluate("window.rikuy.spellIgnoreOnce(window.rikuy.sp.bad.find(x => x.q === 'mistaek'))"); page.wait_for_timeout(150)
        check('Ignore Once: that one is not marked', page.evaluate(BAD) == ['wronng'], page.evaluate(BAD))
        page.evaluate("window.rikuy.runCommand('spell-recheck')"); settle(page)
        check('Recheck Document: every word marked again', sorted(page.evaluate(BAD)) == ['mistaek', 'sentense', 'wronng'], page.evaluate(BAD))
        # Add to Dictionary: the document's own list, one step, read back
        page.evaluate("window.rikuy.spellAddWord('sentense')"); page.wait_for_timeout(200)
        added = src(page)
        check('Add to Dictionary writes a % rikuy: words line before \\begin{document}, as one step', added == DOC.replace('\\begin{document}', '% rikuy: words sentense\n\\begin{document}'), added[:120])
        settle(page)
        check('and the word is no longer marked', 'sentense' not in page.evaluate(BAD), page.evaluate(BAD))
        page.evaluate("window.rikuy.spellAddWord('mistaek')"); page.wait_for_timeout(200)
        check('a second word goes on the same line', '% rikuy: words sentense mistaek\n' in src(page), src(page)[:120])
        page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(150)
        page.evaluate('window.rikuy.undo()'); page.wait_for_timeout(150)
        check('undo takes the list off byte for byte', src(page) == DOC)
        load_doc(page, DOC.replace('\\begin{document}', '% cspell:words sentense, mistaek\n\\begin{document}')); settle(page)
        check('a hand written cspell list counts as the document\'s list', page.evaluate(BAD) == ['wronng'], page.evaluate(BAD))
        # the language: babel's, \selectlanguage, \foreignlanguage
        de = ('\\documentclass{article}\n\\usepackage[english,ngerman]{babel}\n\\begin{document}\nDas Haus ist schoen und die Strase lang. '
              '\\foreignlanguage{english}{The colour and the mistaek.} {\\selectlanguage{english}A houze.} Das Ende.\n\\end{document}\n')
        load_doc(page, de); settle(page, 15000)
        check('babel\'s last language is the document\'s: German words checked in German', sorted(page.evaluate(BAD)) == ['Strase', 'colour', 'houze', 'mistaek', 'schoen'], page.evaluate(BAD))
        check('the status bar names it', page.evaluate("document.getElementById('st-lang').textContent").startswith('German (Germany)'), page.evaluate("document.getElementById('st-lang').textContent"))
        dicts = page.evaluate("[...window.rikuy.sp.plan.words.keys()].sort()")
        check('two dictionaries, each loaded when its first word came', dicts == ['de_DE', 'en_US'], dicts)
        # Review › Language as round trips
        base = '\\documentclass{article}\n\\begin{document}\nSome words here and the colour there.\n\\end{document}\n'
        # (off: the language set back; a babel line the command added stays, as GAP's rule 5 says)
        sel_lang = lambda d: (lambda pg: pg.evaluate("(d) => window.rikuy.setLanguage(d, window.rikuy.caretNow())", d))
        doc_lang = lambda d: (lambda pg: pg.evaluate("(d) => window.rikuy.setLanguage(d, null)", d))
        gb = base.replace('\\begin{document}', '\\usepackage[british,english]{babel}\n\\begin{document}')
        roundtrip(page, base, 'colour', sel_lang('en_GB'), gb.replace('the colour there', 'the \\foreignlanguage{british}{colour} there'),
                  forms=[gb.replace('the colour there', 'the \\foreignlanguage{british}{colour} there')], off=gb, off_command=sel_lang('en_US'), label='Language of a selection, no babel yet')
        withb = base.replace('\\begin{document}', '\\usepackage[english]{babel}\n\\begin{document}')
        de2 = withb.replace('[english]', '[ngerman,english]')
        roundtrip(page, withb, 'colour', sel_lang('de_DE'), de2.replace('the colour there', 'the \\foreignlanguage{ngerman}{colour} there'), off=de2, off_command=sel_lang('en_US'),
                  label='Language of a selection, babel there: the language before the document\'s')
        roundtrip(page, withb, ('Some', 1), doc_lang('es_ES'), withb.replace('[english]', '[spanish]'), off_command=doc_lang('en_US'), label='Language of the document, babel there')
        roundtrip(page, base, ('Some', 1), doc_lang('en_GB'), base.replace('\\begin{document}', '\\usepackage[british]{babel}\n\\begin{document}'),
                  off=withb, off_command=doc_lang('en_US'), label='Language of the document, no babel')
        poly = '\\documentclass{article}\n\\usepackage{polyglossia}\n\\setdefaultlanguage{english}\n\\begin{document}\nSome words.\n\\end{document}\n'
        roundtrip(page, poly, ('Some', 1), doc_lang('de_DE'), poly.replace('\\setdefaultlanguage{english}', '\\setdefaultlanguage{german}'), off_command=doc_lang('en_US'), label='Language of the document, polyglossia')
        # a selection already in another language changes language, the babel line takes the new one
        fr = withb.replace('[english]', '[british,english]').replace('the colour there', 'the \\foreignlanguage{british}{colour} there')
        load_doc(page, fr); select_text(page, 'colour'); page.evaluate("window.rikuy.setLanguage('de_DE', window.rikuy.caretNow())"); page.wait_for_timeout(200)
        check('Language on words in \\foreignlanguage: the language changes in place, babel takes it', src(page) == fr.replace('[british,english]', '[ngerman,british,english]').replace('{british}{colour}', '{ngerman}{colour}'), src(page)[:200])
        load_doc(page, base); click_text(page, 'Some', 1)
        page.get_by_role('tablist', name='Ribbon', exact=True).get_by_role('tab', name='Review', exact=True).click(); page.wait_for_timeout(200)
        page.click('#rv-lang'); page.wait_for_timeout(250)
        items = page.evaluate("[...document.querySelectorAll('.pop [role=menuitemradio]')].map(e => e.getAttribute('aria-label') || e.textContent.trim())")
        check('Review › Language lists the four dictionaries\' languages', items[:4] == ['English (United States)', 'English (United Kingdom)', 'German (Germany)', 'Spanish'], items)
        page.keyboard.press('Escape')
        # the Spelling pane (F7)
        load_doc(page, DOC); settle(page)
        click_text(page, 'This', 0)
        page.keyboard.press('F7'); page.wait_for_timeout(600)
        pane = page.locator('#sp-pane')
        check('F7 opens the Spelling pane at the first word after the caret', pane.is_visible() and page.evaluate("document.querySelector('#sp-pane .sp-w').textContent") == 'sentense', page.evaluate("(document.querySelector('#sp-pane .sp-w') || {}).textContent"))
        page.wait_for_function("document.querySelector('#sp-pane .sp-opt')", timeout=5000)
        opts = page.evaluate("[...document.querySelectorAll('#sp-pane .sp-opt')].map(e => e.textContent)")
        check('it lists Hunspell\'s suggestions', 'sentence' in opts, opts)
        page.evaluate("[...document.querySelectorAll('#sp-pane .sp-opt')].find(e => e.textContent === 'sentence').click()")
        page.get_by_role('button', name='Change', exact=True).click(); page.wait_for_timeout(500)
        check('Change: the word changed, the pane on the next word', 'This sentence has' in src(page) and page.evaluate("document.querySelector('#sp-pane .sp-w').textContent") == 'mistaek', page.evaluate("(document.querySelector('#sp-pane .sp-w') || {}).textContent"))
        page.get_by_role('button', name='Ignore Once').click(); page.wait_for_timeout(400)
        check('Ignore Once moves on', page.evaluate("document.querySelector('#sp-pane .sp-w').textContent") == 'wronng')
        page.screenshot(path=os.path.join(SHOTS, 'spell-pane-1366.png'))
        page.get_by_role('button', name='Next error').click(); page.wait_for_timeout(200)
        page.keyboard.press('Escape'); page.wait_for_timeout(200)
        check('Escape closes it', not pane.is_visible())
        # Check Spelling as You Type off: no marks, no browser spelling either
        page.evaluate("window.rikuy.runCommand('spell-as-you-type')"); page.wait_for_timeout(300)
        check('Check Spelling as You Type off: no red lines, the browser\'s off too', page.evaluate("!CSS.highlights.get('rk-spell')") and page.evaluate("document.getElementById('pages').spellcheck") is False)
        page.evaluate("window.rikuy.runCommand('spell-as-you-type')"); settle(page)
        check('and on again (what was ignored once stays so)', page.evaluate(BAD) == ['wronng'], page.evaluate(BAD))
        # (task 48's review) H6: Change pressed twice writes the correction once; L3: Enter on a
        # suggestion is Change; M5: a French document keeps the browser's own spelling
        load_doc(page, '\\documentclass{article}\n\\begin{document}\nIt occured to me that the resul was wierd.\n\\end{document}\n'); settle(page)
        for w in ('occured', 'resul', 'wierd'):
            page.evaluate("(w) => { const g = window.rikuy; const x = g.sp.bad.find(y => y.w === w); return x && g.spellSuggest(x); }", w)
        page.wait_for_timeout(1200)
        click_text(page, 'It occ', 0); page.keyboard.press('F7'); page.wait_for_timeout(500)
        page.wait_for_function("document.querySelector('#sp-pane .sp-opt')", timeout=5000)
        page.evaluate("[...document.querySelectorAll('#sp-pane .sp-opt')].find(e => e.textContent === 'occurred').click()")
        page.click('#sp-pane button[aria-label=Change]'); page.wait_for_timeout(150)
        page.click('#sp-pane button[aria-label=Change]', force=True); page.wait_for_timeout(1200)
        check('H6: Change pressed twice writes the correction once', 'It occurred to me' in src(page) and 'occurrred' not in src(page), src(page)[40:100])
        settle(page); page.wait_for_timeout(400)
        page.wait_for_function("document.querySelector('#sp-pane .sp-w') && document.querySelector('#sp-pane .sp-opt')", timeout=6000)
        word = page.evaluate("document.querySelector('#sp-pane .sp-w').textContent")
        page.evaluate("[...document.querySelectorAll('#sp-pane .sp-opt')].find(e => e.textContent === 'result').focus()") if word == 'resul' else None
        page.keyboard.press('Enter'); page.wait_for_timeout(800)
        check('L3: Enter on a suggestion with the focus is Change', word == 'resul' and 'the result was' in src(page), (word, src(page)[40:110]))
        page.keyboard.press('Escape')
        fr = '\\documentclass{article}\n\\usepackage[french]{babel}\n\\begin{document}\nBonjour le monde, voici un texte. \\foreignlanguage{english}{The colour and the mistakke.}\n\\end{document}\n'
        load_doc(page, fr); settle(page)
        st = page.evaluate("document.getElementById('st-lang').textContent")
        check('M5: a French document: the browser\'s own spelling on, Hunspell for its English words, the status says French', page.evaluate("document.getElementById('pages').spellcheck") is True and sorted(page.evaluate(BAD)) == ['colour', 'mistakke'] and st.startswith('French'), (st, page.evaluate(BAD)))
        check('M5: no dictionary called null asked for', not page.evaluate("window.rikuy.sp.failed.size"), page.evaluate("[...window.rikuy.sp.failed]"))
        # typing: the word being typed is not marked until the caret leaves it, and only new words go to the worker
        load_doc(page, DOC); settle(page)
        click_text(page, ' math', 0)
        n0 = page.evaluate("window.rikuy.sp.known.get('en_US').size")
        page.keyboard.type(' recieve'); page.wait_for_timeout(700)
        check('the word being typed is not marked yet', 'recieve' not in page.evaluate(BAD))
        page.keyboard.type(' '); settle(page)
        check('once the caret leaves it, it is', 'recieve' in page.evaluate(BAD), page.evaluate(BAD))
        check('the worker was asked only the new word', page.evaluate("window.rikuy.sp.known.get('en_US').size") - n0 == 1, page.evaluate("window.rikuy.sp.known.get('en_US').size") - n0)
        # the time on a 141 KB paper, off the main thread
        long = open(os.path.join(ROOT, 'dev/bench/long/main.tex'), encoding='utf8').read()
        bib = open(os.path.join(ROOT, 'dev/bench/long/refs.bib'), encoding='utf8').read()
        page.evaluate("([t, b]) => { const g = window.rikuy; g.sp.known.clear(); g.files = new Map([['main.tex', t], ['refs.bib', b]]); g.main = 'main.tex'; g.hist = []; g.forceRender = true; g.rebuild(); }", [long, bib])
        t0 = time.time(); settle(page, 30000); wall = (time.time() - t0) * 1000
        stat = page.evaluate("(() => { const S = window.rikuy.sp; const t0 = performance.now(); const P = window.rikuy.spellState(); return { occ: S.plan.occ.length, distinct: [...S.plan.words.values()].reduce((k, s) => k + s.size, 0), worker: S.lastCheck }; })()")
        click_text(page, 'the', 0); page.keyboard.type('x'); settle(page)
        plan_ms = page.evaluate("window.rikuy.sp.mainMs")
        print('141 KB paper:', json.dumps(stat), 'main thread plan after the first: %.1f ms' % plan_ms, 'first check to marks: %.0f ms' % wall)
        check('a 141 KB paper is checked off the main thread in under 3 s, its words in the worker', wall < 3000 and stat['worker']['ms'] < 1500, (wall, stat))
        check('and checked again after an edit in a few ms of the main thread', plan_ms < 40, plan_ms)
        # the worst case for the worker: 141 KB of prose where nearly every word is another one
        words = [l.split('/')[0] for l in open(os.path.join(ROOT, 'tex/vendor/hunspell/dict/en_US.dic'), encoding='utf8').read().split('\n')[1:]]
        words = [w for w in words if w.isalpha() and w.islower() and 3 < len(w) < 12][::3]
        body, k = [], 0
        while sum(len(x) for x in body) < 141000:
            para = []
            for _ in range(90):
                w = words[k % len(words)]; k += 1
                if k % 17 == 0: w = w[0] + w[2] + w[1] + w[3:]
                para.append(w)
            body.append(' '.join(para) + '.\n\n')
        big = '\\documentclass{article}\n\\begin{document}\n' + ''.join(body) + '\\end{document}\n'
        page.evaluate("(t) => { const g = window.rikuy; g.files = new Map([['main.tex', t]]); g.main = 'main.tex'; g.hist = []; g.forceRender = true; g.rebuild(); }", big)
        t0 = time.time(); settle(page, 60000); wall = (time.time() - t0) * 1000
        stat = page.evaluate("(() => { const S = window.rikuy.sp; return { kb: Math.round(window.rikuy.src('main.tex').length / 1024), occ: S.plan.occ.length, distinct: [...S.plan.words.values()].reduce((k, s) => k + s.size, 0), bad: S.bad.length, worker: S.lastCheck }; })()")
        click_text(page, 'a', 0); page.keyboard.type('x'); settle(page)
        plan_ms = page.evaluate("window.rikuy.sp.mainMs")
        print('141 KB of distinct words:', json.dumps(stat), 'main thread after an edit: %.1f ms' % plan_ms, 'first check to marks: %.0f ms' % wall)
        check('141 KB of nearly all distinct words: checked in the worker in under 3 s, marks on the page', wall < 3000 and stat['bad'] > 100 and stat['distinct'] > 10000, (wall, stat))
        check('no page errors', not errors, errors[:5])
        browser.close()

        # phones: a long press on a marked word, the pane as a sheet, 44 px targets, no sideways scroll
        for w, h in ((390, 844), (360, 740)):
            for dark in (False, True):
                browser, page, errors = open_page(p, width=w, height=h, touch=True, dark=dark)
                load_doc(page, DOC); settle(page, 15000)
                pt = page.evaluate("""(() => { const r = [...CSS.highlights.get('rk-spell')].find(r => r.toString() === 'mistaek'); r.startContainer.parentElement.scrollIntoView({block: 'center'}); const q = r.getBoundingClientRect(); return [q.left + 6, q.top + q.height / 2]; })()""")
                page.wait_for_timeout(200)
                pt = page.evaluate("""(() => { const r = [...CSS.highlights.get('rk-spell')].find(r => r.toString() === 'mistaek'); const q = r.getBoundingClientRect(); return [q.left + 6, q.top + q.height / 2]; })()""")
                page.evaluate("window.rikuy.spellSuggest(window.rikuy.sp.bad.find(x => x.q === 'mistaek'))"); page.wait_for_timeout(400)
                # a long press: the touch's pointerdown, then the system's contextmenu
                page.dispatch_event('#pages', 'pointerdown', {'pointerType': 'touch', 'clientX': pt[0], 'clientY': pt[1], 'bubbles': True})
                page.evaluate("([x, y]) => document.elementFromPoint(x, y).dispatchEvent(new MouseEvent('contextmenu', {clientX: x, clientY: y, bubbles: true, cancelable: true}))", pt)
                page.wait_for_timeout(400)
                names = menu_names(page)
                tag = '%d px%s' % (w, ' dark' if dark else '')
                check(tag + ': a long press on a marked word gives its suggestions', names[:1] == ['mistake'] and 'Add to Dictionary' in names, names)
                if not dark:
                    page.screenshot(path=os.path.join(SHOTS, 'spell-longpress-%d.png' % w))
                small = page.evaluate("[...document.querySelectorAll('.pop-ctx [role^=menuitem]')].filter(e => e.getBoundingClientRect().height < 44).length")
                check(tag + ': its items are 44 px tall', small == 0, small)
                page.tap('.pop-ctx [aria-label="mistake"]') if page.locator('.pop-ctx [aria-label="mistake"]').count() else page.get_by_role('menuitem', name='mistake').tap()
                page.wait_for_timeout(300)
                check(tag + ': a tap on a suggestion changes the word', 'a mistake,' in src(page), src(page)[40:90])
                page.evaluate("window.rikuy.openSpelling()"); page.wait_for_timeout(700)
                box = page.evaluate("(() => { const r = document.getElementById('sp-pane').getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom, innerWidth, innerHeight]; })()")
                check(tag + ': the Spelling pane is a sheet inside the screen', box[0] >= 0 and box[1] <= box[4] and box[2] >= 0 and box[3] <= box[5], box)
                small = page.evaluate("[...document.querySelectorAll('#sp-pane button')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 44 && !e.classList.contains('pop-x')).map(e => e.textContent)")
                check(tag + ': its buttons are 44 px tall', not small, small)
                check(tag + ': no sideways scroll', page.evaluate("document.documentElement.scrollWidth <= innerWidth"))
                page.screenshot(path=os.path.join(SHOTS, 'spell-pane-%d%s.png' % (w, '-dark' if dark else '')))
                st = page.evaluate("(() => { const r = document.getElementById('st-lang').getBoundingClientRect(); return r.height; })()")
                check(tag + ': the status bar\'s proofing button is a 44 px target', st >= 44 or page.evaluate("getComputedStyle(document.getElementById('st-lang')).minHeight") == '44px', st)
                check(tag + ': no page errors', not errors, errors[:5])
                browser.close()

    bad = [r for r in results if not r[1]]
    print(f"{len(results) - len(bad)}/{len(results)} passed")
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    run()
