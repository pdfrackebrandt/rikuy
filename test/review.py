"""Review (src/cmd/review.js, src/review.js, src/collab.js): Track Changes (Ctrl+Shift+E, the
status bar's switch) as Word's: off, edits are no changes and the changes waiting stay; on,
every edit is a change; Display for Review (Simple, All, No Markup) and Show Markup; Accept and
Reject at the caret and move to the next, all, all and stop tracking; Previous and Next change;
comments: Previous, Next, Delete, Delete All (one undo), Edit, Show Comments; Inspect Document;
Word Count (Ctrl+Shift+G) of the document and of a selection; Compare with a file; Download with
Markup (the changes package, compiled in the page where dist/tex exists); Read Aloud with the
browser's voices; changes carrying their author, Show Markup's Specific People, Accept and Reject by
author, Display for Review's Original (R4); the Review tab on a phone at 390 and 360 px with touch; screenshots in
$SHOTS/review-*."""
import os, sys, time, json, re, subprocess, tempfile
sys.path.insert(0, os.path.dirname(__file__))
from browser import settle, until, open_page, check, results, src, load_doc, click_text, select_text, SHOTS, ROOT
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


def edit(page, find, repl, kind='type'):
    page.evaluate("""([a, b, k]) => { const g = window.rikuy; const f = g.main; const s = g.files.get(f); const at = s.indexOf(a);
      if (at < 0) throw new Error('not found: ' + a); g.closeGroup(); g.commit([{ f, s: at, e: at + a.length, t: b }], null, k); g.closeGroup(); }""", [find, repl, kind])
    settle(page, 120)


def tap(page, loc):
    """A tap on a control, the ribbon's row swiped to it first (a phone shows part of the row)"""
    loc.evaluate('(e) => e.scrollIntoView({ block: "nearest", inline: "center" })'); settle(page, 150)
    loc.tap(); settle(page, 250)


def fresh(page, doc=DOC):
    """The document opened anew: its base the text as it is, Track Changes off."""
    load_doc(page, doc)
    page.wait_for_function("!!window.rikuy.base")
    page.evaluate("(() => { const g = window.rikuy; g.setBase({ t: Date.now(), label: 'Opened', files: g.files, track: false }); })()")
    settle(page, 100)


BASE_N = "window.rikuy.base ? window.rikuy.base.n || 0 : 0"


def stored(page, n, ms):
    """Track Changes' base on its way to this browser's storage: saveBase (src/review.js) reads the
    stored one, then counts the base (n) one on and puts it at once, so a read made after the
    count moved, by this tab or another, finds it (IndexedDB runs them in that order). A write is
    no timer, so settle() cannot see it; ms is the time the step once slept."""
    until(page, '(n) => !!window.rikuy.base && (window.rikuy.base.n || 0) > n', n, timeout=ms)


def adopted(page, n, ms):
    """The other tab's base taken in by adoptOtherTab, whose read of it (rvCheckBase) it does not
    wait for: this tab's count has reached the one that tab stored."""
    until(page, '(n) => !!window.rikuy.base && (window.rikuy.base.n || 0) >= n', n, timeout=ms)


def r4(p):
    """R4: changes carry their author (the name in AutoCorrect Options, or the coauthor whose copy
    came back), Show Markup's Specific People, Accept and Reject by author, Display for Review's
    Original (the page draws the text before the changes and takes no edit), on a phone too."""
    browser, page, errors = open_page(p, width=1366, height=900)
    fresh(page)
    page.evaluate("window.rikuy.prefs.who = 'Pedro'; window.rikuy.setTracking(true)")
    edit(page, 'some words', 'a few words')
    # a coauthor's copy coming in (src/collab.js takeBack names them for the step)
    page.evaluate("(() => { const g = window.rikuy, f = g.main, s = g.files.get(f), at = s.indexOf('ends here'); g.rvBy = 'Ana'; g.closeGroup(); g.commit([{ f, s: 0, e: s.length, t: s.slice(0, at) + 'stops here' + s.slice(at + 9) }], null, 'merge'); g.closeGroup(); g.rvBy = null; })()")
    settle(page, 200)
    who = page.evaluate("window.rikuy.realChanges().map(c => [c.b, window.rikuy.rvName(c.who)])")
    check('R4: each change carries its author: yours by your name, the copy\'s by its sender', sorted(who) == sorted([['a few', 'Pedro'], ['stops', 'Ana']]), who)
    page.evaluate("window.rikuy.toggleNav(true, 'changes')"); settle(page, 300)
    check('R4: the Changes list names each change\'s author', 'Pedro' in page.inner_text('#nav-body') and 'Ana' in page.inner_text('#nav-body'))
    page.evaluate("window.rikuy.setMarkup('all')"); settle(page, 300)
    tones = page.evaluate("['g-ins', 'g-ins2'].map(k => CSS.highlights.get(k) ? [...CSS.highlights.get(k)].map(r => r.toString()).join('|') : '')")
    check('R4: each reviewer\'s insertions in a colour of their own', 'a few' in tones[0] and 'stops' in tones[1], tones)
    page.evaluate("window.rikuy.runCommand('show-markup')"); settle(page, 250)
    names = page.evaluate("[...document.querySelectorAll('.pop [role=menuitemcheckbox]')].map(e => [e.getAttribute('aria-label'), e.getAttribute('aria-checked')])")
    check('R4: Show Markup lists All Reviewers and each reviewer, checked', ['All Reviewers', 'true'] in names and ['Pedro', 'true'] in names and ['Ana', 'true'] in names, names)
    page.locator('.pop').get_by_role('menuitemcheckbox', name='Ana', exact=True).click(); settle(page, 300)
    tones = page.evaluate("['g-ins', 'g-ins2'].map(k => CSS.highlights.get(k) ? [...CSS.highlights.get(k)].map(r => r.toString()).join('|') : '')")
    check('R4: Ana unticked, her changes leave the pages', 'stops' not in ''.join(tones) and 'a few' in ''.join(tones), tones)
    items = page.evaluate("window.rikuy.commandMenu(window.rikuy.cmds.command('change-accept')).map(i => i && i.name)")
    check('R4: Accept\'s arrow offers Accept All Changes Shown, and All by each reviewer', 'Accept All Changes Shown' in items and 'Accept All by Ana' in items and 'Accept All by Pedro' in items, items)
    s0 = src(page)
    page.evaluate("window.rikuy.acceptShown()"); settle(page, 250)
    left = page.evaluate("window.rikuy.realChanges().map(c => window.rikuy.rvName(c.who))")
    check('R4: Accept All Changes Shown keeps Pedro\'s, Ana\'s still wait', left == ['Ana'] and src(page) == s0, left)
    page.evaluate("window.rikuy.rvHidden = new Set(); window.rikuy.rvAfterFilter()")
    page.evaluate("window.rikuy.rvActByAuthor('reject', 'Ana')"); settle(page, 250)
    check('R4: Reject All by Ana puts her words back', 'ends here' in src(page) and page.evaluate(N) == 0)
    page.keyboard.press('Control+z'); settle(page, 250)
    check('R4: and Ctrl+Z brings her change back, hers still', page.evaluate("window.rikuy.realChanges().map(c => window.rikuy.rvName(c.who))") == ['Ana'])
    # Display for Review › Original
    page.evaluate("window.rikuy.runCommand('display-for-review')"); settle(page, 250)
    opts = page.evaluate("[...document.querySelectorAll('.pop [role=menuitemradio]')].map(e => e.getAttribute('aria-label'))")
    check('R4: Display for Review offers Original, after No Markup as Word\'s', opts == ['Simple Markup', 'All Markup', 'No Markup', 'Original'], opts)
    page.locator('.pop').get_by_role('menuitemradio', name='Original', exact=True).click(); settle(page, 500)
    text = page.evaluate("[...document.querySelectorAll('#pages .flow')].map(f => f.innerText).join(' ')")
    check('R4: Original: the page draws the text before the changes', 'ends here' in text and 'stops here' not in text, text[:200])
    check('R4: Original: no marks on the page, and it takes no typing', not page.evaluate("CSS.highlights.get('g-ins2') && CSS.highlights.get('g-ins2').size") and page.evaluate("document.getElementById('pages').contentEditable") == 'false')
    s1 = src(page)
    page.evaluate("window.rikuy.runCommand('bold')"); settle(page, 200)
    page.evaluate("(() => { const g = window.rikuy; g.commit([{ f: g.main, s: 0, e: 0, t: '%x\\n' }], null, 'type'); })()"); settle(page, 200)
    check('R4: Original: no command or edit reaches the source', src(page) == s1)
    page.screenshot(path=os.path.join(SHOTS, 'review-original-1366.png'))
    page.evaluate("window.rikuy.setMarkup('all')"); settle(page, 500)
    text = page.evaluate("[...document.querySelectorAll('#pages .flow')].map(f => f.innerText).join(' ')")
    check('R4: back to All Markup: the text as it is now, editable again', 'stops here' in text and page.evaluate("document.getElementById('pages').contentEditable") == 'true')
    edit(page, 'first paragraph', 'first PARAGRAPH')
    check('R4: and an edit goes in again', 'first PARAGRAPH' in src(page))
    check('R4: no page errors', not errors, errors[:5])
    browser.close()
    for w, h in ((390, 844), (360, 740)):
        browser, page, errors = open_page(p, width=w, height=h, touch=True)
        fresh(page)
        page.evaluate("window.rikuy.prefs.who = 'Pedro'; window.rikuy.setTracking(true)")
        edit(page, 'some words', 'a few words')
        page.select_option('#rb-tabsel', 'review'); settle(page, 300)
        page.evaluate("window.rikuy.runCommand('display-for-review')"); settle(page, 300)
        it = page.locator('.pop').get_by_role('menuitemradio', name='Original', exact=True)
        box = it.bounding_box()
        check('R4 %d px: Original in Display for Review\'s menu, a 44 px target inside the screen' % w, box and box['height'] >= 44 and box['x'] >= 0 and box['x'] + box['width'] <= w, box)
        it.tap(); settle(page, 500)
        text = page.evaluate("[...document.querySelectorAll('#pages .flow')].map(f => f.innerText).join(' ')")
        check('R4 %d px: Original by a tap draws the text before the changes' % w, 'some words' in text and 'a few' not in text)
        page.screenshot(path=os.path.join(SHOTS, 'review-original-%d.png' % w))
        page.evaluate("window.rikuy.setMarkup('simple')"); settle(page, 300)
        check('R4 %d px: no sideways scroll, no page errors' % w, page.evaluate("document.documentElement.scrollWidth <= innerWidth") and not errors, errors[:3])
        browser.close()


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
        page.keyboard.press('Control+Shift+E'); settle(page, 200)
        check('Ctrl+Shift+E turns it on; the status bar and the button say so', page.evaluate("window.rikuy.trackOn()") is True and st() == 'Track Changes: On' and page.evaluate("document.getElementById('rv-track').getAttribute('aria-pressed')") == 'true', st())
        check('turned on, the marks show: All Markup', page.evaluate("window.rikuy.markup()") == 'all')
        edit(page, 'more words', 'many words')
        edit(page, 'ends here', 'ends')
        # (the marks are painted 180 ms after the page is drawn again: marksSoon, src/app.js)
        settle(page, 300, full=True)
        check('with it on every edit is a change', page.evaluate(N) == 2, page.evaluate(N))
        check('marked on the page: insertions, deletions, bars', page.evaluate("(CSS.highlights.get('g-ins') || {size: 0}).size") >= 1 and page.evaluate("document.querySelectorAll('.del-mk').length") >= 1 and page.evaluate("document.querySelectorAll('.chg-bar').length") >= 1)
        page.screenshot(path=os.path.join(SHOTS, 'review-all-markup-1366.png'))
        # Display for Review
        page.evaluate("window.rikuy.setMarkup('simple')"); settle(page, 250)
        check('Simple Markup: the bars alone', page.evaluate("document.querySelectorAll('.chg-bar').length") >= 1 and not page.evaluate("CSS.highlights.get('g-ins')") and page.evaluate("document.querySelectorAll('.del-mk').length") == 0)
        page.evaluate("window.rikuy.setMarkup('none')"); settle(page, 250)
        check('No Markup: nothing', page.evaluate("document.querySelectorAll('.chg-bar').length") == 0)
        page.evaluate("window.rikuy.setMarkup('all')"); settle(page, 250)
        page.evaluate("window.rikuy.setMarkupShow('showIns', false)"); settle(page, 250)
        check('Show Markup without Insertions and Deletions: no change marks', page.evaluate("document.querySelectorAll('.chg-bar').length") == 0)
        page.evaluate("window.rikuy.setMarkupShow('showIns', true)"); settle(page, 250)
        # off again: the changes waiting stay, new edits are none
        page.keyboard.press('Control+Shift+E'); settle(page, 150)
        edit(page, 'The first', 'A first')
        check('off again: the two changes stay, the new edit is none', page.evaluate(N) == 2 and 'A first' in src(page), page.evaluate(N))
        edit(page, 'many words', 'many more words')
        check('an edit beside a change waiting, with tracking off, is no change: the waiting one stays as it was', page.evaluate(N) == 2 and page.evaluate("window.rikuy.realChanges().some(c => c.a === 'more' && c.b === 'many')"), page.evaluate("window.rikuy.realChanges().map(c => [c.a, c.b])"))
        # Previous and Next change, Accept and Reject
        click_text(page, 'A first', 0)
        page.evaluate("window.rikuy.runCommand('change-next')"); settle(page, 200)
        sel = page.evaluate("String(getSelection())")
        check('Next Change goes to the first change and selects it', sel == 'many', sel)
        page.evaluate("window.rikuy.runCommand('change-next')"); settle(page, 200)
        check('and the next', page.evaluate("window.rikuy.caretNow().p") > src(page).index('third'), page.evaluate("String(getSelection())"))
        page.evaluate("window.rikuy.runCommand('change-prev')"); settle(page, 200)
        check('Previous Change goes back', page.evaluate("String(getSelection())") == 'many', page.evaluate("String(getSelection())"))
        before = src(page)
        page.evaluate("window.rikuy.runCommand('change-reject')"); settle(page, 300)
        check('Reject (and move to next) puts the old word back (the untracked one stays), one change left', 'has more more words' in src(page) and page.evaluate(N) == 1, (page.evaluate(N), src(page)[60:140]))
        page.evaluate("window.rikuy.undo()"); settle(page, 250)
        check('one undo brings the change back byte for byte', src(page) == before and page.evaluate(N) == 2)
        click_text(page, 'many more', 2)
        page.evaluate("window.rikuy.runCommand('change-accept')"); settle(page, 300)
        check('Accept (and move to next): the next change selected', page.evaluate("window.rikuy.caretNow().p") > src(page).index('third'))
        check('Accept keeps the text and the change goes', src(page) == before and page.evaluate(N) == 1)
        page.evaluate("window.rikuy.acceptAllChanges(false)"); settle(page, 250)
        check('Accept All Changes: none left, the text as it was', page.evaluate(N) == 0 and src(page) == before)
        page.evaluate("window.rikuy.setTracking(true)"); edit(page, 'third', 'last'); edit(page, 'first', 'opening')
        page.evaluate("window.rikuy.rejectAllChanges(true)"); settle(page, 300)
        check('Reject All Changes and Stop Tracking: the text back, tracking off', src(page) == before and page.evaluate(N) == 0 and page.evaluate("window.rikuy.trackOn()") is False)
        check('the Accept and Reject buttons say there is nothing to do', page.evaluate("document.getElementById('rv-accept').disabled") is True)
        # ---- the hostile review of task 48 (py/track.py S1 to S6, M1 to M4, L7, L8) ----
        D2 = ('\\documentclass{article}\n\\begin{document}\n'
              'Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu.\n\n'
              'Second paragraph stays here as it is.\n\\end{document}\n')
        chg = lambda: page.evaluate("window.rikuy.realChanges().map(c => [c.a, c.b])")
        U = lambda: (page.evaluate("window.rikuy.undo()"), settle(page, 150))
        R = lambda: (page.evaluate("window.rikuy.redo()"), settle(page, 150))
        T = lambda on: (page.evaluate("(o) => window.rikuy.setTracking(o)", on), settle(page, 80))
        def fresh2(track):
            fresh(page, D2); page.evaluate("(t) => { const g = window.rikuy; g.setBase({ t: Date.now(), label: 'Opened', files: g.files, track: t }); }", track)
        fresh2(True); edit(page, 'gamma', 'gamma NEWWORD'); T(False); U(); R()
        check('H2: a tracked insertion stays a change through Track Changes off, undo and redo', len(chg()) == 1 and chg()[0][0] == '' and chg()[0][1].strip() == 'NEWWORD', chg())
        fresh2(False)
        page.evaluate("""() => { const g = window.rikuy; const mine = new Map(g.files); const f = g.main; const s = g.files.get(f);
          const at = s.indexOf('delta'); g.closeGroup(); g.commit([{ f, s: at, e: at + 5, t: 'DELTA-FROM-ANA' }], null, 'merge'); g.closeGroup();
          g.setBase({ t: Date.now(), label: 'Before the changes from Ana', files: mine }); }""")
        settle(page, 150); U(); R()
        check('H1: a coauthor\'s merge undone and redone keeps its changes', chg() == [['delta', 'DELTA-FROM-ANA']], chg())
        fresh2(True); edit(page, 'beta', 'BETA2'); T(False); edit(page, 'lambda mu', 'lambda mu nu')
        check('H3: an untracked edit in a waiting change\'s line is no change', chg() == [['beta', 'BETA2']], chg())
        page.evaluate("window.rikuy.rejectAllChanges(false)"); settle(page, 200)
        check('H3: and Reject All keeps it', 'mu nu.' in src(page) and 'Alpha beta' in src(page), src(page)[40:140])
        fresh2(True); edit(page, 'Second', 'Secund'); T(False)
        page.evaluate("""() => { const g = window.rikuy; const f = g.main; const s = g.files.get(f); const ed = [];
          for (const w of ['Alpha', 'zeta']) { const at = s.indexOf(w); ed.push({ f, s: at, e: at + w.length, t: w.toUpperCase() }); }
          const at2 = s.indexOf('as it is'); ed.push({ f, s: at2, e: at2 + 2, t: 'AS' });
          g.closeGroup(); g.commit(ed, null, 'replace'); g.closeGroup(); }""")
        settle(page, 150)
        check('H3: a Replace All with tracking off: none of its edits is a change', chg() == [['Second', 'Secund']], chg())
        fresh2(False); edit(page, 'gamma', 'big gamma'); T(True); U()
        check('M1: an untracked edit undone with tracking on leaves no phantom change', chg() == [], chg())
        fresh2(True); edit(page, 'iota', 'IOTA5'); page.evaluate("window.rikuy.acceptAllChanges(false)"); settle(page, 150); U()
        check('M1: Accept is undone by Ctrl+Z, the change back, the text as it was', chg() == [['iota', 'IOTA5']] and 'IOTA5' in src(page), (chg(), src(page)[40:120]))
        # M2: a merge while changes of your own wait keeps yours
        fresh2(True); edit(page, 'kappa', 'KAPPA'); T(False)
        page.evaluate("""() => { const g = window.rikuy; const pend = g.realChanges().length > 0; const mine = new Map(g.files); const f = g.main; const s = g.files.get(f);
          const at = s.indexOf('eta theta'); g.closeGroup(); g.commit([{ f, s: at, e: at + 3, t: 'ETA' }], null, 'merge'); g.closeGroup();
          if (!pend) g.setBase({ t: Date.now(), label: 'x', files: mine }); }""")
        settle(page, 150)
        check('M2: bringing a coauthor\'s copy back keeps your own changes beside theirs', sorted(chg()) == [['eta', 'ETA'], ['kappa', 'KAPPA']], chg())
        # M3: another tab's text with tracking off here is no absorbed edit; its base comes from storage
        fresh2(False)
        edit(page, 'mu.', 'mu, from the other tab.', 'other-tab')
        check('M3: another tab\'s edits are never absorbed', len(chg()) == 1, chg())
        page.evaluate("(async () => { const g = window.rikuy; g.base.track = true; await g.saveBase(true); g.base.track = false; await g.rvReloadBase(); })()"); settle(page, 300)
        check('M3: and the base and its switch are read back as that tab left them', page.evaluate("window.rikuy.trackOn()") is True)
        # M4: leaving writes the base at once
        fresh2(False); T(True); edit(page, 'Alpha', 'Alphas'); T(False); edit(page, 'theta', 'thetas')
        waiting = page.evaluate("!!window.rikuy.baseSaveT")
        page.evaluate("(() => { const g = window.rikuy; g.unsaved = true; g.leaving(); })()"); settle(page, 200)
        check('M4: leaving the page writes the base that was waiting to be saved', waiting and not page.evaluate("window.rikuy.baseSaveT"), waiting)
        # L7: a compared version stays tracked
        page.evaluate("(async () => { const g = window.rikuy; const v = await g.snapshot('L7', { force: true, named: true }); await g.compareWith(v); })()"); settle(page, 300)
        check('L7: comparing with a version tracks from it', page.evaluate("window.rikuy.trackOn()") is True)
        T(False)
        toast = page.evaluate("[...document.querySelectorAll('.toast, #toast')].map(e => e.textContent).join(' ')")
        check('V-L3: comparing says Track Changes is now on', 'Track Changes is on' in toast, toast[:200])
        # V-M1 (v2/track2.py T9): the one word between two waiting changes a word apart
        fresh2(True); edit(page, 'Alpha', 'Omega'); edit(page, 'gamma', 'Gamma'); T(False); edit(page, 'beta', 'BETA')
        page.evaluate("window.rikuy.rejectAllChanges(false)"); settle(page, 200)
        check('V-M1: Reject All keeps an untracked edit of the word between two changes', 'Alpha BETA gamma' in src(page), src(page)[40:100])
        page.evaluate("(() => { const g = window.rikuy; delete g.prefs.markup; g.prefs.marks = true; g.reviewStatusInstall(); })()")
        check('L8: the old setting (prefs.marks) taken over once as All Markup', page.evaluate("window.rikuy.markup()") == 'all')
        page.evaluate("window.rikuy.setMarkup('none')")
        # comments
        fresh(page)
        click_text(page, 'first paragraph', 0)
        page.evaluate("window.rikuy.runCommand('comment-next')"); settle(page, 250)
        check('Next Comment: to the line Ana\'s comment is on', page.evaluate("window.rikuy.commentHere() && window.rikuy.commentHere().who") == 'Ana')
        page.evaluate("window.rikuy.runCommand('comment-next')"); settle(page, 250)
        check('then Bo\'s', page.evaluate("window.rikuy.commentHere() && window.rikuy.commentHere().who") == 'Bo')
        page.evaluate("window.rikuy.runCommand('comment-prev')"); settle(page, 250)
        check('Previous Comment: back to Ana\'s', page.evaluate("window.rikuy.commentHere() && window.rikuy.commentHere().who") == 'Ana')
        page.evaluate("window.rikuy.runCommand('comment-delete')"); settle(page, 250)
        check('Delete: the comment and its reply go, nothing else', src(page) == DOC.replace('% comment (Ana) on "second": Is this right?\n% reply (Pedro): Yes.\n', ''), src(page))
        page.evaluate("window.rikuy.undo()"); settle(page, 200)
        check('one undo, byte for byte', src(page) == DOC)
        page.evaluate("window.rikuy.runCommand('comment-delete-all')"); settle(page, 250)
        check('Delete All Comments: every comment line, one step', '% comment' not in src(page) and '% reply' not in src(page) and page.evaluate("window.rikuy.hist.length") >= 1)
        page.evaluate("window.rikuy.undo()"); settle(page, 200)
        check('and one undo brings them all back', src(page) == DOC)
        click_text(page, 'third paragraph', 0)
        page.evaluate("window.rikuy.runCommand('comment-edit')"); settle(page, 250)
        page.fill('.pop-comment textarea', 'Much shorter, please.')
        page.locator('.pop-comment').get_by_role('button', name='Save', exact=True).click(); settle(page, 250)
        check('Edit Comment rewrites its words only', src(page) == DOC.replace('% comment (Bo): Shorter?', '% comment (Bo): Much shorter, please.'), src(page)[-120:])
        page.evaluate("window.rikuy.undo()"); settle(page, 200)
        # (review M2) a comment in base32, as a reader of a comments only link writes it: Edit
        # Comment writes the line again whole, in that form, with the new words
        import base64
        b32 = lambda s: base64.b32encode(s.encode()).decode().rstrip('=') or '0'
        line32 = lambda body: '% comment32 ' + b32('Bo') + ' 0 ' + b32(body)
        safe_doc = DOC.replace('% comment (Bo): Shorter?', line32('Shorter?'))
        fresh(page, safe_doc)
        click_text(page, 'third paragraph', 0)
        page.evaluate("window.rikuy.runCommand('comment-edit')"); settle(page, 250)
        check('Edit Comment on a comment in base32 shows its words', page.input_value('.pop-comment textarea') == 'Shorter?', page.input_value('.pop-comment textarea'))
        page.fill('.pop-comment textarea', 'Much shorter, please.')
        page.locator('.pop-comment').get_by_role('button', name='Save', exact=True).click(); settle(page, 250)
        check('and writes its line again, in base32, with the new words', src(page) == safe_doc.replace(line32('Shorter?'), line32('Much shorter, please.')), src(page)[-160:])
        page.evaluate("window.rikuy.undo()"); settle(page, 200)
        check('one undo, byte for byte', src(page) == safe_doc)
        fresh(page)
        click_text(page, 'third paragraph', 0)
        r = page.evaluate("(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(); return [r.left, r.top]; })()")
        # (and the comments' marks, painted 200 ms after the pages were drawn: commentsSoon, src/app.js)
        page.mouse.click(r[0] + 2, r[1] + 4, button='right'); settle(page, 250, full=True)
        check('the right click menu on a commented line has Edit Comment', page.locator('.pop-ctx').get_by_role('menuitem', name='Edit Comment').count() == 1)
        page.keyboard.press('Escape')
        check('the margin shows the comments', page.evaluate("document.querySelectorAll('.cm-mark').length") == 2)
        page.evaluate("window.rikuy.runCommand('comments-show')"); settle(page, 250)
        check('Show Comments off: no marks for them', page.evaluate("document.querySelectorAll('.cm-mark').length") == 0)
        page.evaluate("window.rikuy.runCommand('comments-show')"); settle(page, 250)
        # Inspect Document
        page.evaluate("window.rikuy.runCommand('inspect-document')"); settle(page, 250)
        txt = page.evaluate("document.querySelector('.rv-inspect').textContent")
        check('Inspect Document lists the comments with their authors', '2 threads, by Ana, Pedro, Bo' in txt, txt)
        page.locator('.rv-inspect').get_by_role('button', name='Remove All').click(); settle(page, 250)
        check('and removes them at a click', '% comment' not in src(page))
        page.evaluate("window.rikuy.undo()"); settle(page, 200)
        # Word Count
        page.keyboard.press('Escape')
        click_text(page, 'first paragraph', 0)
        page.keyboard.press('Control+Shift+G'); settle(page, 300)
        rows = page.evaluate("Object.fromEntries([...document.querySelectorAll('.rv-stats tr')].map(r => [r.cells[0].textContent, r.cells[1].textContent]))")
        check('Ctrl+Shift+G: Word Count with pages, words, characters, paragraphs, lines', rows.get('Pages') == '1' and rows.get('Words') == '17' and rows.get('Paragraphs') == '3' and rows.get('Lines') == '3', rows)
        # (Word counts no paragraph mark among the characters)
        check('characters with and without spaces', rows.get('Characters (with spaces)') == str(len('The first paragraph has some words.The second paragraph has more words.The third paragraph ends here.')) and int(rows.get('Characters (no spaces)')) == len('Thefirstparagraphhassomewords.Thesecondparagraphhasmorewords.Thethirdparagraphendshere.'), rows)
        page.screenshot(path=os.path.join(SHOTS, 'review-wordcount-1366.png'))
        page.keyboard.press('Escape')
        select_text(page, 'second paragraph has')
        page.evaluate("window.rikuy.runCommand('word-count')"); settle(page, 300)
        rows = page.evaluate("Object.fromEntries([...document.querySelectorAll('.rv-stats tr')].map(r => [r.cells[0].textContent, r.cells[1].textContent]))")
        cap = page.evaluate("document.querySelector('.rv-stats caption').textContent")
        check('of a selection: its own numbers', cap == 'Statistics of the selection' and rows.get('Words') == '3' and rows.get('Characters (with spaces)') == '20', (cap, rows))
        page.keyboard.press('Escape')
        fn = DOC.replace('some words.', 'some words.\\footnote{A note of five words.}')
        load_doc(page, fn); settle(page, 200)
        page.evaluate("window.rikuy.runCommand('word-count')"); settle(page, 300)
        w1 = page.evaluate("[...document.querySelectorAll('.rv-stats tr')].find(r => r.cells[0].textContent === 'Words').cells[1].textContent")
        page.click('#rv-count-notes'); settle(page, 200)
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
        # (the file is read with File.text(), no timer: the base it makes is the step's end)
        fc.value.set_files(fp); until(page, "() => window.rikuy.base && window.rikuy.base.label.startsWith('Compared with')", timeout=500); settle(page, 500)
        check('Compare with a File: its differences are changes to accept or reject', page.evaluate(N) == 2 and page.evaluate("window.rikuy.base.label") == 'Compared with other.tex', page.evaluate(N))
        page.evaluate("window.rikuy.rejectAllChanges(false)"); settle(page, 300)
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
        # M6: only prose is marked: never the preamble, a label, a citation key or math
        fresh(page, '\\documentclass{article}\n\\usepackage{amsmath}\n% comment (Pre): in the preamble\n\\begin{document}\nSee \\label{sec:old} and \\cite{smith2020} for $x+y$ in a sentence that ends here.\n\\end{document}\n')
        page.evaluate("window.rikuy.setTracking(true)")
        edit(page, '{amsmath}', '{amsmath,amssymb}'); edit(page, 'sec:old', 'sec:new'); edit(page, 'smith2020', 'smith2021'); edit(page, 'x+y', 'x+z'); edit(page, 'here', 'there')
        with page.expect_download() as dl2:
            page.evaluate("window.rikuy.runCommand('markup-copy')")
        mp2 = os.path.join(tmpd, 'markup2.tex'); dl2.value.save_as(mp2)
        m2 = open(mp2, encoding='utf8').read()
        check('M6: Download with Markup marks prose only, never the preamble, a label, a citation or math', '\\usepackage{amsmath,amssymb}' in m2 and '\\label{sec:new}' in m2 and '\\cite{smith2021}' in m2 and '$x+z$' in m2 and '\\replaced{there}{here}' in m2 and '% comment (Pre): in the preamble' in m2 and m2.count('\\added') + m2.count('\\deleted') + m2.count('\\replaced') == 1, m2)
        fresh(page)
        # the build always makes dist/tex for the worker's own files; a TeX tree is there only with tree.wasm
        if os.path.exists(os.path.join(ROOT, 'dist', 'tex', 'tree.wasm')) and os.path.exists(os.path.join(ROOT, 'dev', 'texrun.py')) and os.environ.get('RIKUY_NO_COMPILE') != '1':
            d2 = tempfile.mkdtemp(); open(os.path.join(d2, 'main.tex'), 'w').write(mt)
            r = subprocess.run([sys.executable, os.path.join(ROOT, 'dev', 'texrun.py'), d2, 'main.tex', 'pdflatex', '240'], env={**os.environ, 'RIKUY_DIST': os.path.join(ROOT, 'dist')}, capture_output=True, text=True, timeout=600)
            out = r.stdout + r.stderr
            # (what it saw without the compile's time, which differs from run to run)
            check('and it compiles in the page with pdfLaTeX (TeX\'s own changes and todonotes)', 'ok=True' in out and 'pdf=None' not in out, re.sub(r' ms=\d+', '', out)[-400:])
        # Read Aloud, with the browser's voices (a stand in that records them)
        page.evaluate("""(() => { window.__said = []; Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel() { window.__said.push('cancel'); }, speak(u) { window.__said.push([u.lang, u.text]); setTimeout(() => u.onend && u.onend(), 5); } } });
          Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, writable: true, value: function (t) { this.text = t; } }); })()""")
        click_text(page, 'second paragraph', 0)
        page.keyboard.press('Control+Alt+Space'); settle(page, 300)
        said = page.evaluate("window.__said")
        check('Read Aloud reads from the caret on, in the document\'s language', said and said[1][0] == 'en-US' and said[1][1].startswith('second paragraph'), said[:3])
        # V-M2: two tabs on one project: one's Track Changes switch and Accept reach the other
        fresh(page)
        # (the project's write goes out as leaving() returns; the base's after its read: stored())
        n = page.evaluate(BASE_N)
        page.evaluate("(() => { const g = window.rikuy; g.unsaved = true; g.leaving(); g.saveBase(true, true); })()"); stored(page, n, 400); settle(page, 400)
        pb = page.context.new_page()
        pb.goto('https://rikuy.test/')
        pb.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden && window.rikuy.base', timeout=20000)
        settle(pb, 500)
        check('V-M2: the second tab opened the same project', pb.evaluate("window.rikuy.src(window.rikuy.main)") == src(page))
        n = page.evaluate(BASE_N)
        page.bring_to_front(); page.evaluate("window.rikuy.setTracking(true)"); stored(page, n, 400); settle(page, 400)
        n = page.evaluate(BASE_N)
        pb.bring_to_front(); pb.evaluate("window.rikuy.adoptOtherTab()"); adopted(pb, n, 500); settle(pb, 500)
        check('V-M2: Track Changes turned on in one tab is on in the other once it is back', pb.evaluate("window.rikuy.trackOn()") is True)
        pb.evaluate("(() => { const g = window.rikuy, f = g.main, s = g.files.get(f), at = s.indexOf('more words'); g.closeGroup(); g.commit([{ f, s: at, e: at + 4, t: 'many' }], null, 'type'); g.closeGroup(); g.unsaved = true; g.leaving(); })()")
        settle(pb, 400)
        page.bring_to_front(); page.evaluate("window.rikuy.adoptOtherTab()"); settle(page, 700)
        check('V-M2: its typing is a change in the first tab too, whose switch stays on', 'many words' in src(page) and page.evaluate("window.rikuy.trackOn()") is True and page.evaluate("window.rikuy.realChanges().length") == 1, page.evaluate("window.rikuy.realChanges().map(c => [c.a, c.b])"))
        n = page.evaluate(BASE_N)
        page.evaluate("window.rikuy.acceptAllChanges(false)"); stored(page, n, 400); settle(page, 400)
        n = page.evaluate(BASE_N)
        pb.bring_to_front(); pb.evaluate("window.rikuy.adoptOtherTab()"); adopted(pb, n, 600); settle(pb, 600)
        check('V-M2: an Accept in one tab is accepted in the other', pb.evaluate("window.rikuy.realChanges().length") == 0, pb.evaluate("window.rikuy.realChanges().map(c => [c.a, c.b])"))
        pb.close()
        check('no page errors', not errors, errors[:5])
        browser.close()

        # the Review tab, its menus and the status bar at 1920 and 1366, light and dark; then a phone
        for w, h, dark in ((1920, 1080, False), (1920, 1080, True), (1366, 900, True)):
            browser, page, errors = open_page(p, width=w, height=h, dark=dark)
            fresh(page); page.evaluate("window.rikuy.setTracking(true)"); edit(page, 'more words', 'many words')
            page.get_by_role('tablist', name='Ribbon', exact=True).get_by_role('tab', name='Review', exact=True).click(); settle(page, 300)
            page.screenshot(path=os.path.join(SHOTS, 'review-tab-%d%s.png' % (w, '-dark' if dark else '')))
            page.evaluate("window.rikuy.runCommand('display-for-review')"); settle(page, 250)
            page.screenshot(path=os.path.join(SHOTS, 'review-display-%d%s.png' % (w, '-dark' if dark else '')))
            check('%d px%s: Display for Review\'s menu, the mode checked' % (w, ' dark' if dark else ''), page.evaluate("[...document.querySelectorAll('.pop [role=menuitemradio][aria-checked=true]')].map(e => e.textContent.trim())") == ['All Markup'])
            page.keyboard.press('Escape')
            check('%d px%s: no page errors' % (w, ' dark' if dark else ''), not errors, errors[:5])
            browser.close()
        for w, h in ((390, 844), (360, 740)):
            browser, page, errors = open_page(p, width=w, height=h, touch=True)
            fresh(page)
            # (a phone's tabs are a list to choose from)
            page.select_option('#rb-tabsel', 'review'); settle(page, 300)
            btn = page.locator('#rv-track')
            if not btn.is_visible():
                # (folded: through its group's button)
                tap(page, page.locator('#rv-track').locator('xpath=ancestor::*[contains(@class, "rb-grp")]').locator('.rb-gbtn'))
                page.locator('.pop').get_by_role('menuitemcheckbox', name='Track Changes').tap()
            else:
                tap(page, btn)
            settle(page, 250)
            check('%d px: Track Changes by a tap' % w, page.evaluate("window.rikuy.trackOn()") is True)
            edit(page, 'more words', 'many words')
            check('%d px: and the edit is a change' % w, page.evaluate(N) == 1)
            small = page.evaluate("[...document.querySelectorAll('#rp-review button')].filter(b => b.offsetParent && b.getBoundingClientRect().height < 44 && b.getBoundingClientRect().width > 0).map(b => b.id || b.getAttribute('aria-label'))")
            check('%d px: the Review tab\'s controls are 44 px targets' % w, not small, small)
            page.evaluate("window.rikuy.runCommand('word-count')"); settle(page, 300)
            box = page.evaluate("(() => { const r = document.querySelector('.rv-count').getBoundingClientRect(); return [r.left, r.right, innerWidth]; })()")
            check('%d px: Word Count inside the screen' % w, box[0] >= 0 and box[1] <= box[2], box)
            page.screenshot(path=os.path.join(SHOTS, 'review-phone-%d.png' % w))
            check('%d px: no sideways scroll' % w, page.evaluate("document.documentElement.scrollWidth <= innerWidth"))
            check('%d px: no page errors' % w, not errors, errors[:5])
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
