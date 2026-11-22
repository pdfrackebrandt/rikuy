"""Spelling in the page (src/cmd/review.js, src/spell/, src/ui/spellpane.js): Hunspell in its
worker marks the words the dictionary does not know with a red wavy line and nothing else (no
command, key, math, code, address); the right click menu and a long press on a phone offer its
suggestions; a suggestion changes only the characters that differ, one undo back; Ignore Once,
Ignore All, Add to Dictionary (a `% rikuy: words` line, cspell's lines read too), Recheck
Document, Check Spelling as You Type; the dictionary per language (babel, \\selectlanguage,
\\foreignlanguage); Review › Language for a selection and the document as round trips; the
Spelling pane (F7) by mouse and keys; the status bar's proofing language; a 141 KB paper's time;
the phone at 390 and 360 px with touch; the Thesaurus and grammar (R4); screenshots in
$SHOTS/spell-*, thesaurus-* and grammar-*."""
import os, sys, time, json
sys.path.insert(0, os.path.dirname(__file__))
from browser import settle, until, frame, tap, open_page, check, results, src, load_doc, click_text, select_text, roundtrip, SHOTS, ROOT
from playwright.sync_api import sync_playwright

DOC = ('\\documentclass{article}\n\\begin{document}\n'
       'This sentense has a mistaek, a \\textbf{wr}onng word and $x_{abcdefg}$ math \\label{sec:keyz} \\cite{knuthh} '
       '\\texttt{codez} \\url{https://example.com/pathz} and main.tex, NASA, x2.\n\\end{document}\n')
BAD = "window.rikuy.sp ? window.rikuy.sp.bad.map(x => x.w) : null"


def spell_settle(page, ms=6000):
    """Until the spell worker has answered for the text as it is now."""
    t0 = time.time()
    settle(page, 350)
    done = until(page, """() => { const S = window.rikuy.sp; if (!S || !S.plan || S.planModel !== window.rikuy.model) return false;
          for (const [d, set] of S.plan.words) { const K = S.known.get(d); if (S.failed.has(d)) continue; if (!K) return false; for (const w of set) if (!K.has(w)) return false; }
          return true; }""", timeout=max(1, int(ms - (time.time() - t0) * 1000)))
    if done:
        settle(page, 120)
    return done


def timed(ms, limit):
    """A time for a check's detail: itself when it is over the limit, else that it was under (the
    times are printed beside; under the limit they move from run to run)."""
    return round(ms, 1) if ms >= limit else 'under %d ms' % limit


def menu_names(page):
    return page.evaluate("[...document.querySelectorAll('.pop-ctx [role=menuitem], .pop-ctx [role=menuitemcheckbox], .pop-ctx [role=menuitemradio]')].map(e => e.getAttribute('aria-label') || e.textContent.trim())")


THES_DOC = '\\documentclass{article}\n\\begin{document}\nThe results are Fast and \\textbf{quick}. He go home and it is is clear that $x$ is small.\n\\end{document}\n'
DE_DOC = '\\documentclass{article}\n\\usepackage[ngerman]{babel}\n\\begin{document}\nDie Häuser sind groß.\n\\end{document}\n'


def grammar_settle(page, ms=30000):
    done = until(page, "() => !!(window.rikuy.gr && window.rikuy.gr.lastRun && window.rikuy.gr.seq && !window.rikuy.grammarSoonD_pending)", timeout=ms)
    if done:
        settle(page, 300)
    return done


def r4(p):
    """R4: the Thesaurus (MyThes with Hunspell's stems, Shift+F7, the right click menu's Synonyms)
    and grammar (Harper: Check Grammar as You Type, blue double lines on prose only, its
    corrections as the smallest edit, the Spelling and Grammar pane), on a phone too."""
    browser, page, errors = open_page(p, width=1366, height=900)
    check('R4: the thesaurus is here (hosted build)', page.evaluate('window.rikuy.thesAvailable()') is True)
    load_doc(page, THES_DOC); spell_settle(page, 15000)
    click_text(page, 'Fast', 2); settle(page, 200)
    t0 = time.time()
    page.keyboard.press('Shift+F7')
    page.wait_for_selector('#th-pane:not([hidden]) .th-ins', timeout=20000)
    ms = (time.time() - t0) * 1000
    check('R4: Shift+F7 opens the Thesaurus pane with the word at the cursor and its synonyms (first lookup %d ms)' % ms, page.input_value('#th-pane input') == 'Fast' and page.locator('#th-pane .th-w').count() > 3)
    names = page.evaluate("[...document.querySelectorAll('#th-pane .th-w')].map(e => e.textContent)")
    check('R4: WordNet\'s meanings of "fast", by part of speech', 'quick' in names and 'speedy' in names, names[:12])
    h0 = page.evaluate('window.rikuy.hist.length')
    page.get_by_role('button', name='Insert speedy', exact=True).first.click(); settle(page, 300)
    check('R4: Insert puts the word in, its capital kept, as one step', src(page) == THES_DOC.replace('Fast', 'Speedy') and page.evaluate('window.rikuy.hist.length') == h0 + 1, src(page)[40:120])
    page.evaluate('window.rikuy.undo()'); settle(page, 200)
    check('R4: one undo gives the source back byte for byte', src(page) == THES_DOC)
    page.locator('#th-pane .th-w', has_text='speedy').first.click(); settle(page, 800)
    check('R4: a synonym pressed is looked up in turn; Back returns', page.input_value('#th-pane input') == 'speedy' and page.get_by_role('button', name='Back', exact=True).is_enabled())
    page.get_by_role('button', name='Back', exact=True).click(); settle(page, 800)
    check('R4: Back gives the word before', page.input_value('#th-pane input') == 'Fast')
    page.screenshot(path=os.path.join(SHOTS, 'thesaurus-1366.png'))
    page.keyboard.press('Escape')
    # a word in bold: the edit stays inside the bold
    click_text(page, 'quick', 2); settle(page, 200)
    r = page.evaluate("(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(); return [r.left, r.top]; })()")
    page.mouse.click(r[0], r[1] + 4, button='right'); settle(page, 300)
    check('R4: the right click menu has Synonyms', 'Synonyms' in menu_names(page), menu_names(page))
    page.get_by_role('menuitem', name='Synonyms', exact=True).click()
    page.wait_for_function("document.querySelector('[aria-label=Synonyms] [role=menuitem]') && ![...document.querySelectorAll('[aria-label=Synonyms] [role=menuitem]')].some(e => /Looking/.test(e.textContent))", timeout=15000)
    syn = page.evaluate("[...document.querySelectorAll('[aria-label=Synonyms] [role=menuitem]')].map(e => e.getAttribute('aria-label'))")
    check('R4: Synonyms lists words and Thesaurus…', 'Thesaurus…' in syn and len(syn) > 2, syn)
    page.get_by_role('menuitem', name='fast', exact=True).click(); settle(page, 300)
    check('R4: a synonym from the menu replaces the word inside its bold', src(page) == THES_DOC.replace('\\textbf{quick}', '\\textbf{fast}'), src(page)[40:120])
    page.evaluate('window.rikuy.undo()'); settle(page, 200)
    # German: Hunspell's stem finds the entry, OpenThesaurus's data, fetched piece by piece
    seen = []
    page.context.on('request', lambda rq: seen.append(rq.url) if '/spell/th_de_DE' in rq.url else None)
    load_doc(page, DE_DOC); spell_settle(page, 15000)
    click_text(page, 'Häuser', 2); settle(page, 200)
    r = page.evaluate("(async () => { const x = window.rikuy.thesAt(); const r = await window.rikuy.synonymsFor(x.w, x.dict); return [x.dict, r.head, r.meanings.length]; })()")
    check('R4: German: "Häuser" is looked up as "haus" (Hunspell\'s stem), in OpenThesaurus', r[0] == 'de_DE' and r[1] == 'haus' and r[2] > 0, r)
    fetched = len(seen)
    check('R4: of the German data only the index and a piece or two are fetched (of 28)', 1 < fetched <= 4, fetched)
    # grammar: off at first, on by its switch
    load_doc(page, THES_DOC); spell_settle(page, 15000)
    check('R4: grammar is off until asked for: no grammar worker started', page.evaluate("!window.rikuy.gr || !window.rikuy.gr.client"))
    names = page.evaluate("window.rikuy.commandMenu(window.rikuy.cmds.command('spelling')).map(i => i && i.name)")
    check('R4: Spelling\'s arrow offers Check Grammar as You Type and Thesaurus', 'Check Grammar as You Type' in names and 'Thesaurus' in names, names)
    page.evaluate("window.rikuy.runCommand('grammar-as-you-type')")
    check('R4: Harper answers', grammar_settle(page))
    g = page.evaluate("window.rikuy.gr.bad.map(x => x.words)")
    check('R4: grammar marks "go" and "is is", nothing in the math', sorted(g) == ['go', 'is is'], g)
    marks = page.evaluate("[...(CSS.highlights.get('rk-grammar') || [])].map(r => r.toString())")
    check('R4: blue double lines under them on the page', sorted(marks) == ['go', 'is is'], marks)
    click_text(page, 'is is', 1); settle(page, 150)
    r = page.evaluate("(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(); return [r.left, r.top]; })()")
    page.mouse.click(r[0], r[1] + 4, button='right'); settle(page, 300)
    names = menu_names(page)
    check('R4: right click on a grammar issue: Harper\'s message, its correction, Ignore Once', 'Did you mean to repeat this word?' in names and 'is' in names and 'Ignore Once' in names, names)
    page.get_by_role('menuitem', name='is', exact=True).click(); settle(page, 300)
    check('R4: the correction takes out only what differs, one step', src(page) == THES_DOC.replace('it is is clear', 'it is clear'), src(page)[60:140])
    page.evaluate('window.rikuy.undo()'); settle(page, 200)
    check('R4: and one undo gives it back byte for byte', src(page) == THES_DOC)
    grammar_settle(page)
    page.keyboard.press('F7'); settle(page, 600)
    check('R4: F7 is the Spelling and Grammar pane while grammar is on', page.inner_text('#sp-title') == 'Spelling and Grammar')
    page.evaluate("(() => { const P = window.rikuy.spPane; P.cur = window.rikuy.gr.bad.find(x => x.words === 'go'); })()")
    page.get_by_role('button', name='Next error').click(); page.get_by_role('button', name='Previous error').click(); settle(page, 300)
    lab = page.inner_text('#sp-pane .sp-lab')
    check('R4: the pane shows a grammar issue with Harper\'s message', lab.startswith('Grammar:'), lab)
    page.screenshot(path=os.path.join(SHOTS, 'grammar-pane-1366.png'))
    page.keyboard.press('Escape')
    page.evaluate("window.rikuy.runCommand('grammar-as-you-type')"); settle(page, 300)
    check('R4: turned off, its marks go', not page.evaluate("CSS.highlights.get('rk-grammar') && CSS.highlights.get('rk-grammar').size"))
    check('R4: no page errors', not errors, errors[:5])
    browser.close()
    for w, h in ((390, 844), (360, 740)):
        browser, page, errors = open_page(p, width=w, height=h, touch=True)
        load_doc(page, THES_DOC); spell_settle(page, 15000)
        page.select_option('#rb-tabsel', 'review'); settle(page, 300)
        btn = page.locator('#rv-thes')
        if btn.is_visible():
            tap(page, btn)
        else:
            tap(page, page.locator('#rv-thes').locator('xpath=ancestor::*[contains(@class, "rb-grp")]').locator('.rb-gbtn'), 250)
            tap(page, page.locator('.pop').get_by_role('menuitem', name='Thesaurus'))
        settle(page, 400)
        page.fill('#th-pane input', 'happy'); tap(page, page.locator('#th-pane').get_by_role('button', name='Search'))
        page.wait_for_selector('#th-pane .th-w', timeout=15000)
        box = page.evaluate("(() => { const r = document.getElementById('th-pane').getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom, innerWidth, innerHeight]; })()")
        check('R4 %d px: the Thesaurus is a sheet inside the screen, by taps' % w, box[0] >= 0 and box[1] <= box[4] and box[3] <= box[5], box)
        small = page.evaluate("[...document.querySelectorAll('#th-pane button')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 44 && !e.classList.contains('pop-x')).map(e => e.textContent)")
        check('R4 %d px: its buttons are 44 px targets' % w, not small, small[:5])
        # (review L1) the search field, and Back once a word is followed, 44 px each way
        tap(page, page.locator('#th-pane .th-w').first); page.wait_for_selector('#th-pane .th-back', timeout=15000)
        dims = page.evaluate("(() => { const b = document.querySelector('#th-pane .th-back').getBoundingClientRect(), i = document.querySelector('#th-pane input').getBoundingClientRect(); return [b.width, b.height, i.height]; })()")
        check('R4 %d px: Back is 44 by 44 px and the search field 44 px high' % w, dims[0] >= 44 and dims[1] >= 44 and dims[2] >= 44, dims)
        page.screenshot(path=os.path.join(SHOTS, 'thesaurus-%d.png' % w))
        tap(page, page.locator('#th-pane .pop-x'))
        # a long press on a grammar issue gives its menu
        page.evaluate("window.rikuy.prefs.grammar = true; window.rikuy.grammarRun()")
        grammar_settle(page)
        r = page.evaluate("(() => { const r = [...CSS.highlights.get('rk-grammar')].find(x => x.toString() === 'go').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()")
        page.evaluate("([x, y]) => { const t = document.elementFromPoint(x, y); t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: x, clientY: y })); t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y })); }", r)
        settle(page, 400)
        names = menu_names(page)
        check('R4 %d px: a long press on a grammar issue gives its correction' % w, 'goes' in names, names)
        check('R4 %d px: no sideways scroll, no page errors' % w, page.evaluate("document.documentElement.scrollWidth <= innerWidth") and not errors, errors[:3])
        browser.close()


def run():
    with sync_playwright() as p:
        browser, page, errors = open_page(p, width=1366, height=900)
        check('spelling is Rikuy\'s here: Hunspell can run', page.evaluate('window.rikuy.spellAvailable()') is True)
        load_doc(page, DOC)
        check('the first check comes back', spell_settle(page, 15000))
        bad = page.evaluate(BAD)
        check('the words the dictionary does not know are marked, nothing of LaTeX, code, addresses or capitals', sorted(bad) == ['mistaek', 'sentense', 'wronng'], bad)
        check('the browser\'s own spelling is off where Rikuy\'s runs', page.evaluate("document.getElementById('pages').spellcheck") is False)
        marked = page.evaluate("[...(CSS.highlights.get('rk-spell') || [])].map(r => r.toString())")
        check('the red lines are on those words on the page (a word half bold in two pieces)', sorted(marked) == sorted(['sentense', 'mistaek', 'wr', 'onng']), marked)
        check('the status bar says the proofing language and the count', page.evaluate("document.getElementById('st-lang').textContent") == 'English (United States) · 3 spelling errors', page.evaluate("document.getElementById('st-lang').textContent"))
        # the right click menu on a marked word: suggestions first
        click_text(page, 'mistaek', 3)
        page.evaluate("window.rikuy.spellSuggest(window.rikuy.spellAt())")
        settle(page, 500)
        r = page.evaluate("(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(); return [r.left, r.top]; })()")
        page.mouse.click(r[0], r[1] + 4, button='right'); settle(page, 300)
        names = menu_names(page)
        check('right click on a marked word: suggestions, Ignore All, Add to Dictionary', names[:1] == ['mistake'] and 'Ignore All' in names and 'Add to Dictionary' in names, names)
        page.screenshot(path=os.path.join(os.environ.get('SHOTS', SHOTS), 'spell-menu-1366.png'))
        h0 = page.evaluate('window.rikuy.hist.length')
        page.get_by_role('menuitem', name='mistake').click(); settle(page, 300)
        after = src(page)
        check('a suggestion changes only the letters that differ, as one step', after == DOC.replace('mistaek', 'mistake') and page.evaluate('window.rikuy.hist.length') == h0 + 1, after[:160])
        page.evaluate('window.rikuy.undo()'); settle(page, 200)
        check('one undo gives the source back byte for byte', src(page) == DOC)
        # a word across markup: the change goes where the differing letters are
        spell_settle(page)
        page.evaluate("(() => { const x = window.rikuy.sp.bad.find(y => y.q === 'wronng'); window.rikuy.spellChange(x, 'wrong'); })()")
        settle(page, 250)
        check('a word half bold: the letter that differs goes, the bold stays', src(page) == DOC.replace('\\textbf{wr}onng', '\\textbf{wr}ong'), src(page)[40:140])
        page.evaluate('window.rikuy.undo()'); spell_settle(page)
        page.evaluate("(() => { const x = window.rikuy.sp.bad.find(y => y.q === 'wronng'); window.rikuy.spellChange(x, 'xronng'); })()")
        settle(page, 250)
        check('and a change inside the bold part stays inside it', src(page) == DOC.replace('\\textbf{wr}onng', '\\textbf{xr}onng'), src(page)[40:140])
        page.evaluate('window.rikuy.undo()'); settle(page, 150)
        # Ignore All, Ignore Once, Recheck
        spell_settle(page)
        page.evaluate("window.rikuy.spellIgnoreAll('sentense')"); settle(page, 150)
        check('Ignore All: the word is no longer marked, the source untouched', 'sentense' not in page.evaluate(BAD) and src(page) == DOC)
        page.evaluate("window.rikuy.spellIgnoreOnce(window.rikuy.sp.bad.find(x => x.q === 'mistaek'))"); settle(page, 150)
        check('Ignore Once: that one is not marked', page.evaluate(BAD) == ['wronng'], page.evaluate(BAD))
        page.evaluate("window.rikuy.runCommand('spell-recheck')"); spell_settle(page)
        check('Recheck Document: every word marked again', sorted(page.evaluate(BAD)) == ['mistaek', 'sentense', 'wronng'], page.evaluate(BAD))
        # Add to Dictionary: the document's own list, one step, read back
        page.evaluate("window.rikuy.spellAddWord('sentense')"); settle(page, 200)
        added = src(page)
        check('Add to Dictionary writes a % rikuy: words line before \\begin{document}, as one step', added == DOC.replace('\\begin{document}', '% rikuy: words sentense\n\\begin{document}'), added[:120])
        spell_settle(page)
        check('and the word is no longer marked', 'sentense' not in page.evaluate(BAD), page.evaluate(BAD))
        page.evaluate("window.rikuy.spellAddWord('mistaek')"); settle(page, 200)
        check('a second word goes on the same line', '% rikuy: words sentense mistaek\n' in src(page), src(page)[:120])
        page.evaluate('window.rikuy.undo()'); settle(page, 150)
        page.evaluate('window.rikuy.undo()'); settle(page, 150)
        check('undo takes the list off byte for byte', src(page) == DOC)
        load_doc(page, DOC.replace('\\begin{document}', '% cspell:words sentense, mistaek\n\\begin{document}')); spell_settle(page)
        check('a hand written cspell list counts as the document\'s list', page.evaluate(BAD) == ['wronng'], page.evaluate(BAD))
        # the language: babel's, \selectlanguage, \foreignlanguage
        de = ('\\documentclass{article}\n\\usepackage[english,ngerman]{babel}\n\\begin{document}\nDas Haus ist schoen und die Strase lang. '
              '\\foreignlanguage{english}{The colour and the mistaek.} {\\selectlanguage{english}A houze.} Das Ende.\n\\end{document}\n')
        load_doc(page, de); spell_settle(page, 15000)
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
        load_doc(page, fr); select_text(page, 'colour'); page.evaluate("window.rikuy.setLanguage('de_DE', window.rikuy.caretNow())"); settle(page, 200)
        check('Language on words in \\foreignlanguage: the language changes in place, babel takes it', src(page) == fr.replace('[british,english]', '[ngerman,british,english]').replace('{british}{colour}', '{ngerman}{colour}'), src(page)[:200])
        load_doc(page, base); click_text(page, 'Some', 1)
        page.get_by_role('tablist', name='Ribbon', exact=True).get_by_role('tab', name='Review', exact=True).click(); settle(page, 200)
        page.click('#rv-lang'); settle(page, 250)
        items = page.evaluate("[...document.querySelectorAll('.pop [role=menuitemradio]')].map(e => e.getAttribute('aria-label') || e.textContent.trim())")
        check('Review › Language lists the four dictionaries\' languages', items[:4] == ['English (United States)', 'English (United Kingdom)', 'German (Germany)', 'Spanish'], items)
        page.keyboard.press('Escape')
        # the Spelling pane (F7)
        load_doc(page, DOC); spell_settle(page)
        click_text(page, 'This', 0)
        page.keyboard.press('F7'); settle(page, 600)
        pane = page.locator('#sp-pane')
        check('F7 opens the Spelling pane at the first word after the caret', pane.is_visible() and page.evaluate("document.querySelector('#sp-pane .sp-w').textContent") == 'sentense', page.evaluate("(document.querySelector('#sp-pane .sp-w') || {}).textContent"))
        page.wait_for_function("document.querySelector('#sp-pane .sp-opt')", timeout=5000)
        opts = page.evaluate("[...document.querySelectorAll('#sp-pane .sp-opt')].map(e => e.textContent)")
        check('it lists Hunspell\'s suggestions', 'sentence' in opts, opts)
        page.evaluate("[...document.querySelectorAll('#sp-pane .sp-opt')].find(e => e.textContent === 'sentence').click()")
        # (the pane shows a word again once the page's next check has come back from the worker)
        page.get_by_role('button', name='Change', exact=True).click(); spell_settle(page); settle(page, 500)
        check('Change: the word changed, the pane on the next word', 'This sentence has' in src(page) and page.evaluate("document.querySelector('#sp-pane .sp-w').textContent") == 'mistaek', page.evaluate("(document.querySelector('#sp-pane .sp-w') || {}).textContent"))
        page.get_by_role('button', name='Ignore Once').click(); settle(page, 400)
        check('Ignore Once moves on', page.evaluate("document.querySelector('#sp-pane .sp-w').textContent") == 'wronng')
        page.screenshot(path=os.path.join(SHOTS, 'spell-pane-1366.png'))
        page.get_by_role('button', name='Next error').click(); settle(page, 200)
        page.keyboard.press('Escape'); settle(page, 200)
        check('Escape closes it', not pane.is_visible())
        # Check Spelling as You Type off: no marks, no browser spelling either
        page.evaluate("window.rikuy.runCommand('spell-as-you-type')"); settle(page, 300)
        check('Check Spelling as You Type off: no red lines, the browser\'s off too', page.evaluate("!CSS.highlights.get('rk-spell')") and page.evaluate("document.getElementById('pages').spellcheck") is False)
        page.evaluate("window.rikuy.runCommand('spell-as-you-type')"); spell_settle(page)
        check('and on again (what was ignored once stays so)', page.evaluate(BAD) == ['wronng'], page.evaluate(BAD))
        # (task 48's review) H6: Change pressed twice writes the correction once; L3: Enter on a
        # suggestion is Change; M5: a French document keeps the browser's own spelling
        load_doc(page, '\\documentclass{article}\n\\begin{document}\nIt occured to me that the resul was wierd.\n\\end{document}\n'); spell_settle(page)
        for w in ('occured', 'resul', 'wierd'):
            page.evaluate("(w) => { const g = window.rikuy; const x = g.sp.bad.find(y => y.w === w); return x && g.spellSuggest(x); }", w)
        settle(page, 1200)
        click_text(page, 'It occ', 0); page.keyboard.press('F7'); settle(page, 500)
        page.wait_for_function("document.querySelector('#sp-pane .sp-opt')", timeout=5000)
        page.evaluate("[...document.querySelectorAll('#sp-pane .sp-opt')].find(e => e.textContent === 'occurred').click()")
        # (the second press comes as a double press does, before the page's next check: a frame, no
        # more; were it to wait, the pane would be on the next word and Change rightly change that)
        page.click('#sp-pane button[aria-label=Change]'); frame(page)
        page.click('#sp-pane button[aria-label=Change]', force=True); settle(page, 1200)
        check('H6: Change pressed twice writes the correction once', 'It occurred to me' in src(page) and 'occurrred' not in src(page), src(page)[40:100])
        spell_settle(page); settle(page, 400)
        page.wait_for_function("document.querySelector('#sp-pane .sp-w') && document.querySelector('#sp-pane .sp-opt')", timeout=6000)
        word = page.evaluate("document.querySelector('#sp-pane .sp-w').textContent")
        page.evaluate("[...document.querySelectorAll('#sp-pane .sp-opt')].find(e => e.textContent === 'result').focus()") if word == 'resul' else None
        page.keyboard.press('Enter'); settle(page, 800)
        check('L3: Enter on a suggestion with the focus is Change', word == 'resul' and 'the result was' in src(page), (word, src(page)[40:110]))
        page.keyboard.press('Escape')
        fr = '\\documentclass{article}\n\\usepackage[french]{babel}\n\\begin{document}\nBonjour le monde, voici un texte. \\foreignlanguage{english}{The colour and the mistakke.}\n\\end{document}\n'
        load_doc(page, fr); spell_settle(page)
        st = page.evaluate("document.getElementById('st-lang').textContent")
        check('M5: a French document: the browser\'s own spelling on, Hunspell for its English words, the status says French', page.evaluate("document.getElementById('pages').spellcheck") is True and sorted(page.evaluate(BAD)) == ['colour', 'mistakke'] and st.startswith('French'), (st, page.evaluate(BAD)))
        check('M5: no dictionary called null asked for', not page.evaluate("window.rikuy.sp.failed.size"), page.evaluate("[...window.rikuy.sp.failed]"))
        # typing: the word being typed is not marked until the caret leaves it, and only new words go to the worker
        load_doc(page, DOC); spell_settle(page)
        click_text(page, ' math', 0)
        n0 = page.evaluate("window.rikuy.sp.known.get('en_US').size")
        page.keyboard.type(' recieve'); settle(page, 700)
        check('the word being typed is not marked yet', 'recieve' not in page.evaluate(BAD))
        page.keyboard.type(' '); spell_settle(page)
        check('once the caret leaves it, it is', 'recieve' in page.evaluate(BAD), page.evaluate(BAD))
        check('the worker was asked only the new word', page.evaluate("window.rikuy.sp.known.get('en_US').size") - n0 == 1, page.evaluate("window.rikuy.sp.known.get('en_US').size") - n0)
        # the time on a 141 KB paper, off the main thread
        long = open(os.path.join(ROOT, 'dev/bench/long/main.tex'), encoding='utf8').read()
        bib = open(os.path.join(ROOT, 'dev/bench/long/refs.bib'), encoding='utf8').read()
        page.evaluate("([t, b]) => { const g = window.rikuy; g.sp.known.clear(); g.files = new Map([['main.tex', t], ['refs.bib', b]]); g.main = 'main.tex'; g.hist = []; g.forceRender = true; g.rebuild(); }", [long, bib])
        t0 = time.time(); spell_settle(page, 30000); wall = (time.time() - t0) * 1000
        stat = page.evaluate("(() => { const S = window.rikuy.sp; const t0 = performance.now(); const P = window.rikuy.spellState(); return { occ: S.plan.occ.length, distinct: [...S.plan.words.values()].reduce((k, s) => k + s.size, 0), worker: S.lastCheck }; })()")
        click_text(page, 'the', 0); page.keyboard.type('x'); spell_settle(page)
        plan_ms = page.evaluate("window.rikuy.sp.mainMs")
        print('141 KB paper:', json.dumps(stat), 'main thread plan after the first: %.1f ms' % plan_ms, 'first check to marks: %.0f ms' % wall)
        check('a 141 KB paper is checked off the main thread in under 3 s, its words in the worker', wall < 3000 and stat['worker']['ms'] < 1500, (timed(wall, 3000), {**stat, 'worker': {**stat['worker'], 'ms': timed(stat['worker']['ms'], 1500)}}))
        check('and checked again after an edit in a few ms of the main thread', plan_ms < 40, timed(plan_ms, 40))
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
        t0 = time.time(); spell_settle(page, 60000); wall = (time.time() - t0) * 1000
        stat = page.evaluate("(() => { const S = window.rikuy.sp; return { kb: Math.round(window.rikuy.src('main.tex').length / 1024), occ: S.plan.occ.length, distinct: [...S.plan.words.values()].reduce((k, s) => k + s.size, 0), bad: S.bad.length, worker: S.lastCheck }; })()")
        click_text(page, 'a', 0); page.keyboard.type('x'); spell_settle(page)
        plan_ms = page.evaluate("window.rikuy.sp.mainMs")
        print('141 KB of distinct words:', json.dumps(stat), 'main thread after an edit: %.1f ms' % plan_ms, 'first check to marks: %.0f ms' % wall)
        check('141 KB of nearly all distinct words: checked in the worker in under 3 s, marks on the page', wall < 3000 and stat['bad'] > 100 and stat['distinct'] > 10000, (timed(wall, 3000), {**stat, 'worker': {k: v for k, v in stat['worker'].items() if k != 'ms'}}))
        check('no page errors', not errors, errors[:5])
        browser.close()

        # phones: a long press on a marked word, the pane as a sheet, 44 px targets, no sideways scroll
        for w, h in ((390, 844), (360, 740)):
            for dark in (False, True):
                browser, page, errors = open_page(p, width=w, height=h, touch=True, dark=dark)
                load_doc(page, DOC); spell_settle(page, 15000)
                pt = page.evaluate("""(() => { const r = [...CSS.highlights.get('rk-spell')].find(r => r.toString() === 'mistaek'); r.startContainer.parentElement.scrollIntoView({block: 'center'}); const q = r.getBoundingClientRect(); return [q.left + 6, q.top + q.height / 2]; })()""")
                settle(page, 200)
                pt = page.evaluate("""(() => { const r = [...CSS.highlights.get('rk-spell')].find(r => r.toString() === 'mistaek'); const q = r.getBoundingClientRect(); return [q.left + 6, q.top + q.height / 2]; })()""")
                page.evaluate("window.rikuy.spellSuggest(window.rikuy.sp.bad.find(x => x.q === 'mistaek'))"); settle(page, 400)
                # a long press: the touch's pointerdown, then the system's contextmenu
                page.dispatch_event('#pages', 'pointerdown', {'pointerType': 'touch', 'clientX': pt[0], 'clientY': pt[1], 'bubbles': True})
                page.evaluate("([x, y]) => document.elementFromPoint(x, y).dispatchEvent(new MouseEvent('contextmenu', {clientX: x, clientY: y, bubbles: true, cancelable: true}))", pt)
                settle(page, 400)
                names = menu_names(page)
                tag = '%d px%s' % (w, ' dark' if dark else '')
                check(tag + ': a long press on a marked word gives its suggestions', names[:1] == ['mistake'] and 'Add to Dictionary' in names, names)
                if not dark:
                    page.screenshot(path=os.path.join(SHOTS, 'spell-longpress-%d.png' % w))
                small = page.evaluate("[...document.querySelectorAll('.pop-ctx [role^=menuitem]')].filter(e => e.getBoundingClientRect().height < 44).length")
                check(tag + ': its items are 44 px tall', small == 0, small)
                tap(page, page.locator('.pop-ctx [aria-label="mistake"]').first if page.locator('.pop-ctx [aria-label="mistake"]').count() else page.get_by_role('menuitem', name='mistake'), 300)
                check(tag + ': a tap on a suggestion changes the word', 'a mistake,' in src(page), src(page)[40:90])
                page.evaluate("window.rikuy.openSpelling()"); settle(page, 700)
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
        r4(p)

    bad = [r for r in results if not r[1]]
    print(f"{len(results) - len(bad)}/{len(results)} passed")
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    if sys.argv[1:] == ['r4']:
        with sync_playwright() as p:
            r4(p)
        bad = [r for r in results if not r[1]]
        print(f"{len(results) - len(bad)}/{len(results)} passed")
        sys.exit(1 if bad else 0)
    run()
