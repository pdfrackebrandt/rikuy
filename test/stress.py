"""A long document under load: build time, page fill and splitting, keystroke latency, and the
source restored exactly after the typing."""
import os, sys, time, json, traceback
sys.path.insert(0, os.path.dirname(__file__))
from browser import open_page, check, results, SHOTS, src, click_text
from playwright.sync_api import sync_playwright

D = os.path.join(os.path.dirname(__file__), 'stress')
main = open(os.path.join(D, 'main.tex')).read()
bib = open(os.path.join(D, 'refs.bib')).read()

try:
    with sync_playwright() as p:
        browser, page, errors = open_page(p, width=1280, height=900)
        t0 = time.time()
        page.evaluate('''([m, b]) => { const g = window.rikuy; g.files = new Map([['main.tex', m], ['refs.bib', b]]); g.main = 'main.tex'; g.forceRender = true; g.rebuild(); }''', [main, bib])
        dt = (time.time() - t0) * 1000
        n = page.evaluate('document.querySelectorAll(".page").length')
        check('stress: pages', n >= 15, n)
        check('stress: full build < 4s', dt < 4000, round(dt))
        print('build ms', round(dt), 'pages', n, 'model+render ms', page.evaluate('window.rikuy.lastMs'))
        over = page.evaluate('''() => [...document.querySelectorAll('.page')].map((pg,i) => {
          const pb = pg.querySelector('.pb').getBoundingClientRect();
          const fl = pg.querySelector('.flow').getBoundingClientRect();
          const fn = pg.querySelector('.fns');
          const fr = fn && !fn.hidden ? fn.getBoundingClientRect() : null;
          const last = pg.querySelector('.flow').lastElementChild;
          const lb = last ? last.getBoundingClientRect().bottom : fl.top;
          return {i: i+1, over: Math.round(lb - (fr ? fr.top : pb.bottom)), fill: Math.round((lb - pb.top) / pb.height * 100)}; })''')
        bad = [o for o in over if o['over'] > 3]
        check('stress: no overflow', not bad, bad)
        sparse = [o for o in over[2:-2] if o['fill'] < 60]
        print('fill per page', [o['fill'] for o in over])
        check('stress: pages reasonably full', len(sparse) <= 3, sparse)
        # split continuity: text of split pieces belongs to same seg
        splits = page.evaluate('document.querySelectorAll(".it.split-b").length')
        print('split pieces', splits)
        # Latency typing at the start and near the end
        for label, text in [('early', 'Section number 1'), ('late', 'Proofs')]:
            page.evaluate('''(t) => { const s = [...document.querySelectorAll('#pages span.t')].find(x => x.textContent.includes(t)); s.scrollIntoView({block: 'center'}); }''', text)
            click_text(page, text, 3)
            times = []
            for ch in 'abcdefgh':
                t1 = time.time()
                page.keyboard.type(ch)
                times.append((time.time() - t1) * 1000)
            med = sorted(times)[len(times)//2]
            print(label, 'keystroke ms', [round(x) for x in times])
            check('stress: %s keystroke median < 150ms' % label, med < 150, round(med))
            for _ in range(8): page.keyboard.press('Backspace')
        check('stress: source restored', src(page) == main, '')
        # typing inside a paragraph that is split across pages
        info = page.evaluate('''() => { const el = document.querySelector('.it.split-b span.t'); if (!el) return null; el.scrollIntoView({block:'center'}); const r = document.createRange(); r.setStart(el.firstChild, Math.min(3, el.firstChild.data.length)); r.collapse(true); document.getElementById('pages').focus(); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return el.textContent.slice(0, 20); }''')
        if info:
            before = src(page)
            page.keyboard.type('QQ')
            after = src(page)
            i = after.find('QQ')
            check('stress: typing in split continuation maps correctly', i > 0 and after.replace('QQ', '', 1) == before, after[i-20:i+20])
            page.keyboard.press('Backspace'); page.keyboard.press('Backspace')
        page.evaluate('document.querySelectorAll(".page")[0].scrollIntoView()')
        page.screenshot(path=SHOTS + '/10-stress-p1.png')
        for k in [2, 4, 8]:
            page.evaluate('(k) => document.querySelectorAll(".page")[k].scrollIntoView()', k)
            page.wait_for_timeout(50)
            page.screenshot(path=SHOTS + '/11-stress-p%d.png' % (k + 1))
        check('stress: no console errors', not errors, errors[:5])
        browser.close()
except Exception as e:
    # a run that stops part way has failed, whatever the checks before it said
    traceback.print_exc()
    check('the run reaches its end', False, e)
bad = [r for r in results if not r[1]]
print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
sys.exit(1 if bad else 0)
