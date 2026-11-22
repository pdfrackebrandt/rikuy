"""Scratch diagnostics (group 9, not for main): what happens between Enter and the next key."""
import os, sys, json
sys.path.insert(0, os.path.dirname(__file__))
from browser import settle, open_page, check, results, src, load_doc, click_text
from playwright.sync_api import sync_playwright

DOC = '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nAgent income here.\n\nSecond paragraph.\n\\end{document}\n'
DOCA = DOC.replace('Agent income here.', '\\begin{abstract}\nWe study taxes.\n\\end{abstract}')
INIT = r'''(() => { window.__log = []; const T = () => Math.round(performance.now());
  document.addEventListener('selectionchange', () => { const s = getSelection(), n = s.anchorNode; window.__log.push(['sel', T(), n ? String((n.parentElement || n).className).slice(0, 20) : '-']); }, true);
  if (document.fonts) document.fonts.addEventListener('loadingdone', (e) => window.__log.push(['fonts', T(), e.fontfaces.map((f) => f.family + ' ' + f.weight + ' ' + f.style).join(',').slice(0, 120)]));
  window.addEventListener('keydown', (e) => window.__log.push(['key', T(), e.key]), true);
})()'''
WRAP = r'''() => { const g = window.rikuy, T = () => Math.round(performance.now());
  for (const m of ['relayout', 'removeGhost', 'rebuild', 'showGhost', 'refit', 'restoreCaret', 'layoutPass', 'emptyGhost']) { const o = g[m]; if (typeof o !== 'function') continue;
    g[m] = function (...a) { window.__log.push([m, T(), (new Error().stack || '').split('\n').slice(2, 6).map((s) => s.trim().replace(/https?:\/\/[^ )]*\//g, '').slice(0, 70)).join(' < ')]); return o.apply(this, a); }; }
  window.__log.push(['wrapped', T()]); }'''
LOG = '() => { const l = window.__log; window.__log = []; return l; }'

def run(p, name, doc, at, n, key, wait):
    browser, page, errors = open_page(p, width=1366, height=900, init=INIT)
    page.evaluate(WRAP)
    k = page.keyboard
    load_doc(page, doc)
    page.evaluate('() => window.__log.push(["loaded", Math.round(performance.now())])')
    click_text(page, at, n)
    k.press('Enter'); settle(page, wait)
    st = page.evaluate('() => ({ ghost: !!window.rikuy.ghost, conn: !!(window.rikuy.ghost && window.rikuy.ghost.el.isConnected), focus: document.activeElement.id, c: JSON.stringify(window.rikuy.caretNow()) })')
    k.press(key)
    settle(page, 300)
    after = page.evaluate('() => ({ focus: document.activeElement.id || document.activeElement.className, dlg: [...document.querySelectorAll("[role=dialog]")].map((d) => d.getAttribute("aria-label")).join("|") })')
    log = page.evaluate(LOG)
    print('DIAG', name, json.dumps(st), json.dumps(after), src(page)[60:160].replace('\n', '/'))
    for l in log: print('   ', l)
    browser.close()
    return st, after

with sync_playwright() as p:
    for i in range(int(os.environ.get('N', '3'))):
        st, after = run(p, 'textfield', DOC, 'Second paragraph.', 17, 'Alt+=', 100)
        check('diag textfield %d: display' % i, after['focus'] == 'pop-field' and 'Display' in after['dlg'], after)
        st, after = run(p, 'styles', DOCA, 'We study taxes.', 15, 'Control+Alt+1', 150)
        check('diag styles %d' % i, st['ghost'], st)
check('diag: always print', False)
bad = [r for r in results if not r[1]]
print('\n%d passed, %d failed' % (len(results) - len(bad), len(bad)))
sys.exit(1 if bad else 0)
