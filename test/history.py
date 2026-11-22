"""Versions and track changes: the Changes tab lists each edit with Accept and Reject,
marks it on the pages, keeps versions across reloads, and restores a named version."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from browser import settle, until, saved, landed, open_page, check, results, src, click_text, select_text, SHOTS
from playwright.sync_api import sync_playwright

COUNT = "document.getElementById('nt-ccount').textContent"
ITEMS = "[...document.querySelectorAll('#nav-body .chg:not(.spacing)')].map(e => e.querySelector('.chg-txt').textContent)"
# (the versions are read from IndexedDB after the panel is drawn: listed a moment later)
VERSIONS = "() => document.querySelectorAll('.ver .ver-n').length > 0"
# (the panel and its count are drawn again 350 ms after an edit (problemsSoon), the marks 180 ms
# after (marksSoon): each step below waits for the page's timers due within its old time)

def edit(page, find, repl, nth=0):
    page.evaluate("""([a, b, nth]) => { const g = window.rikuy; const f = 'main.tex'; const s = g.files.get(f);
      let at = -1; for (let k = 0; k <= nth; k++) at = s.indexOf(a, at + 1);
      if (at < 0) throw new Error('not found: ' + a);
      g.closeGroup(); g.commit([{ f, s: at, e: at + a.length, t: b }], null, 'type'); g.closeGroup(); }""", [find, repl, nth])
    settle(page, 500, full=True)

with sync_playwright() as p:
    browser, page, errors = open_page(p, width=1440, height=900)
    base = src(page)
    # (edits are changes while Track Changes is on, as in Word: test/review.py tests the switch)
    page.wait_for_function("!!window.rikuy.base"); page.evaluate("window.rikuy.setTracking(true)")
    page.click('#b-nav'); settle(page, 200)
    page.click('#nt-changes'); settle(page, 400, full=True); until(page, VERSIONS)
    check('changes tab starts empty', page.evaluate("!!document.querySelector('#nav-body .nav-empty')") and page.evaluate(COUNT) == '')
    check('panel widens for changes', page.evaluate("document.getElementById('nav').offsetWidth") >= 330)
    vers = page.evaluate("[...document.querySelectorAll('.ver .ver-n')].map(e => e.textContent)")
    check('a version is kept at session start', 'Session start' in vers, vers)

    # one word typed on the page
    click_text(page, 'Click anywhere in this paragraph', 0)
    page.keyboard.type('Now ')
    settle(page, 600, full=True)
    check('typing shows one change', page.evaluate(COUNT) == '1', page.evaluate(COUNT))
    items = page.evaluate(ITEMS)
    ins = page.evaluate("[...document.querySelectorAll('#nav-body .chg ins')].map(e => e.textContent)")
    check('the change shows the inserted word', ins and ins[0].strip() == 'Now', (items, ins))

    # a replacement and a deletion elsewhere
    edit(page, 'round trip', 'return trip')
    edit(page, 'Display equations ', '')
    n = page.evaluate(COUNT)
    check('three changes listed', n == '3', (n, page.evaluate(ITEMS)))
    kinds = page.evaluate("[...document.querySelectorAll('#nav-body .chg .where')].map(e => e.textContent.split(' ')[0])")
    check('kinds are Added, Changed, Deleted', sorted(kinds) == ['Added', 'Changed', 'Deleted'], kinds)

    # show on the pages
    page.check('#chg-show'); settle(page, 500, full=True)
    hl = page.evaluate("CSS.highlights && CSS.highlights.get('g-ins') ? CSS.highlights.get('g-ins').size : -1")
    check('insertions are highlighted on the page', hl >= 2, hl)
    marked = page.evaluate("[...(CSS.highlights.get('g-ins') || [])].map(r => r.toString()).join('|')")
    check('highlight covers the new words', 'Now' in marked and 'return' in marked, marked)
    check('deletions get a marker', page.evaluate("document.querySelectorAll('.del-mk').length") >= 1)
    check('changed lines get a margin bar', page.evaluate("document.querySelectorAll('.chg-bar').length") >= 2)
    tip = page.evaluate("(document.querySelector('.del-mk') || {}).title")
    check('deletion marker tells what was deleted', tip and 'Display equations' in tip, tip)
    page.screenshot(path=SHOTS + '/history-marks.png')

    # two quick Rejects on the same stale item must not touch other text
    stale = page.evaluate("window.rikuy.currentChanges().find(c => c.b.trim() === 'Now')")
    before_txt = src(page)
    page.evaluate("(c) => { window.rikuy.rejectChanges([c]); window.rikuy.rejectChanges([c]); }", stale)
    settle(page, 600, full=True)
    after_txt = src(page)
    check('a second Reject on the same change does nothing', after_txt == before_txt.replace('Now ', '', 1), after_txt[after_txt.find('How to use'):][:80])
    page.evaluate("window.rikuy.undo()"); settle(page, 600, full=True)
    check('undo brings the word back', src(page) == before_txt)
    # reject the replacement: text comes back, one change fewer
    idx = page.evaluate("[...document.querySelectorAll('#nav-body .chg .where')].findIndex(e => e.textContent.startsWith('Changed'))")
    page.locator('#nav-body .chg').nth(idx).get_by_role('button', name='Reject').click()
    settle(page, 600, full=True)
    check('reject puts the old words back', 'round trip' in src(page) and 'return trip' not in src(page))
    check('two changes left', page.evaluate(COUNT) == '2', page.evaluate(COUNT))
    # accept the deletion: it stays deleted and leaves the list
    idx = page.evaluate("[...document.querySelectorAll('#nav-body .chg .where')].findIndex(e => e.textContent.startsWith('Deleted'))")
    page.locator('#nav-body .chg').nth(idx).get_by_role('button', name='Accept').click()
    settle(page, 500, full=True)
    check('accept keeps the deletion', 'Display equations ' not in src(page))
    check('one change left', page.evaluate(COUNT) == '1', page.evaluate(COUNT))
    check('no deletion marker after accept', page.evaluate("document.querySelectorAll('.del-mk').length") == 0)

    # Ctrl+Z, with the focus still in the panel whose button was clicked (it did nothing off the
    # page): first the Accept is undone (a step of its own since task 48, as Word's), the deletion
    # a change again; then the reject, which restores the replacement
    page.keyboard.press('Control+z'); settle(page, 600, full=True)
    check('Ctrl+Z after a click in the panel undoes the Accept: the deletion is a change again', 'Display equations ' not in src(page) and page.evaluate(COUNT) == '2', page.evaluate(COUNT))
    page.keyboard.press('Control+z'); settle(page, 600, full=True)
    check('Ctrl+Z again brings the rejected change back', 'return trip' in src(page) and page.evaluate(COUNT) == '3', page.evaluate(COUNT))

    # a math change outlines the equation
    s = src(page)
    import re
    m = re.search(r'\\\[(.*?)\\\]', s, re.S) or re.search(r'\\begin\{equation\}(.*?)\\end\{equation\}', s, re.S)
    if m:
        inner = m.group(1)
        tok = re.search(r'[a-z]', inner)
        page.evaluate("""([at]) => { const g = window.rikuy; g.closeGroup(); g.commit([{ f: 'main.tex', s: at, e: at, t: '2' }], null, 'type'); g.closeGroup(); }""", [m.start(1) + tok.start()])
        settle(page, 600, full=True)
        check('changed equation is outlined', page.evaluate("document.querySelectorAll('.chg-atom').length") >= 1)
        page.evaluate("window.rikuy.undo()"); settle(page, 400, full=True)

    # a named version, then more edits, then restore it
    page.fill('.ver-form input', 'Draft A')
    page.press('.ver-form input', 'Enter')
    # (the version is written to IndexedDB, then the list read back from it)
    settle(page, 700, full=True); until(page, "() => [...document.querySelectorAll('.ver .ver-n.named')].some(e => e.textContent === 'Draft A')")
    draft = src(page)
    named = page.evaluate("[...document.querySelectorAll('.ver .ver-n.named')].map(e => e.textContent)")
    check('named version is listed', 'Draft A' in named, named)
    edit(page, 'trip}', 'way round}')
    check('edit after the draft', src(page) != draft)
    idx = page.evaluate("[...document.querySelectorAll('.ver')].findIndex(e => e.textContent.includes('Draft A'))")
    # (Restore reads the version from IndexedDB and keeps one more before it writes: a step lands)
    before, h = src(page), page.evaluate('window.rikuy.hist.length')
    page.locator('.ver').nth(idx).get_by_role('button', name='Restore').click()
    landed(page, before, h); settle(page, 800, full=True)
    check('restore brings back the named version', src(page) == draft)
    page.evaluate("window.rikuy.undo()"); settle(page, 500, full=True)
    check('undo after restore returns the later text', 'way round}' in src(page))

    # compare with a version: changes are counted from there
    idx = page.evaluate("[...document.querySelectorAll('.ver')].findIndex(e => e.textContent.includes('Draft A'))")
    # (Compare reads the version from IndexedDB, then marks it as the base)
    page.locator('.ver').nth(idx).get_by_role('button', name='Compare').click()
    until(page, "() => !!document.querySelector('.ver.on')"); settle(page, 600, full=True)
    check('compare counts changes since that version', page.evaluate(COUNT) == '1', (page.evaluate(COUNT), page.evaluate(ITEMS)))
    check('compared version is marked', page.evaluate("document.querySelector('.ver.on') && document.querySelector('.ver.on').textContent.includes('Draft A')"))

    # survives a reload
    page.evaluate("window.rikuy.saveSoon.flush()"); saved(page, 600)
    cur = src(page)
    page.reload()
    page.wait_for_function('window.rikuy && document.querySelector(".page .it") && document.getElementById("boot").hidden', timeout=20000)
    # (the base and the versions come back from IndexedDB before rikuy.ready settles; the marks 180 ms after)
    page.evaluate('() => window.rikuy.ready')
    settle(page, 1200, full=True)
    check('text kept across reload', src(page) == cur)
    check('changes still counted after reload', page.evaluate(COUNT) == '1', page.evaluate(COUNT))
    page.click('#nt-changes') if page.evaluate("document.body.classList.contains('nav-on')") else (page.click('#b-nav'), page.click('#nt-changes'))
    settle(page, 500, full=True); until(page, VERSIONS)
    vers = page.evaluate("[...document.querySelectorAll('.ver .ver-n')].map(e => e.textContent)")
    check('versions kept across reload', 'Draft A' in vers and len(vers) >= 3, vers)
    check('marks shown again after reload', page.evaluate("(CSS.highlights.get('g-ins') && CSS.highlights.get('g-ins').size) || 0") >= 1 and page.evaluate("document.querySelectorAll('.chg-bar').length") >= 1)

    # accept all / reject all
    page.get_by_role('button', name='Reject all').click(); settle(page, 700, full=True)
    check('reject all returns to the compared version', src(page) == draft and page.evaluate(COUNT) == '')
    page.evaluate("window.rikuy.undo()"); settle(page, 500, full=True)
    page.get_by_role('button', name='Accept all').click(); settle(page, 500, full=True)
    check('accept all clears the list and keeps the text', src(page) == cur and page.evaluate(COUNT) == '')
    check('no marks once all accepted', page.evaluate("document.querySelectorAll('.chg-bar').length") == 0)

    # printing leaves marks out
    edit(page, 'way round}', 'longer way round}')
    page.emulate_media(media='print'); settle(page, 200)
    check('marks hidden in print', page.evaluate("[...document.querySelectorAll('.mk-layer')].every(e => getComputedStyle(e).display === 'none')"))
    page.emulate_media(media='screen')

    page.screenshot(path=SHOTS + '/history-panel.png')
    print('errors:', errors[:5])
    check('no page errors', not errors, errors[:5])
    browser.close()

    # dark mode and mobile look
    browser, page, errors = open_page(p, width=390, height=844, dark=True)
    page.wait_for_function("!!window.rikuy.base"); page.evaluate("window.rikuy.setTracking(true)")
    page.click('#b-nav'); settle(page, 200)
    page.click('#nt-changes'); settle(page, 300)
    edit(page, 'round trip', 'return trip')
    settle(page, 400)
    w = page.evaluate("document.getElementById('nav').getBoundingClientRect().width")
    check('mobile panel fits the screen', w <= 390, w)
    over = page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    check('no sideways scroll on mobile', over)
    page.screenshot(path=SHOTS + '/history-mobile-dark.png')
    check('no page errors (mobile)', not errors, errors[:5])
    browser.close()

bad = [r for r in results if not r[1]]
print(f"{len(results) - len(bad)}/{len(results)} passed")
sys.exit(1 if bad else 0)
