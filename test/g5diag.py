"""Throwaway diagnostic (not for main): what lays the page out again while the Font dialog is open on a runner."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser import open_page, load_doc, select_text, settle, src
from playwright.sync_api import sync_playwright
import font as F
HOOK = """() => { const g = window.rikuy; window.__ev = []; const t0 = performance.now(); const log = (k) => window.__ev.push([Math.round(performance.now() - t0), k, (document.activeElement || {}).tagName + '.' + ((document.activeElement || {}).className || '').toString().slice(0, 20)]);
  for (const m of ['relayout', 'refit', 'rebuild', 'layoutPass', 'ribbonBack', 'restoreCaret']) { const f = g[m] && g[m].bind(g); if (f) g[m] = (...a) => { log(m + '(' + a.map((x) => typeof x === 'object' ? '{}' : String(x)).join(',') + ')'); return f(...a); }; }
  document.fonts.addEventListener('loadingdone', (e) => log('fonts ' + e.fontfaces.map((x) => x.family + ' ' + x.style + ' ' + x.weight + ' ' + x.variant).join('; ')));
  const ro = new ResizeObserver((es) => log('resize ' + es.map((e) => (e.target.id || e.target.className.toString().slice(0, 16)) + ' ' + Math.round(e.contentRect.width) + 'x' + Math.round(e.contentRect.height)).join(' | ')));
  for (const el of [g.desk, ...document.querySelectorAll('#ribbon, #status, #bar, #tabs, #main, #app > *, #main > *')]) ro.observe(el);
  new MutationObserver((ms) => { const t = new Set(ms.map((m) => (m.target.id || m.target.className || m.target.nodeName).toString().slice(0, 24))); log('mut ' + [...t].slice(0, 6).join(',')); }).observe(document.getElementById('status') || document.body, { subtree: true, childList: true, characterData: true, attributes: true }); }"""
with sync_playwright() as p:
    for k, wait in enumerate((0, 150, 0, 150)):
        br, page, errors = open_page(p, width=1400, height=900)
        page.evaluate(HOOK)
        load_doc(page, F.DOC); page.evaluate('() => window.__ev.push(["--", "loaded"])'); select_text(page, 'plain words'); page.evaluate('() => window.__ev.push(["--", "selected"])')
        page.evaluate('() => window.__ev.push(["--", "open dialog"])'); F.run_cmd(page, 'font-dialog')
        if wait: page.wait_for_timeout(wait)
        d = page.get_by_role('dialog', name='Font')
        d.get_by_role('combobox', name='Font style').select_option(label='Bold Italic')
        d.get_by_role('combobox', name='Font color').select_option('red')
        d.get_by_role('checkbox', name='Small caps').check()
        d.get_by_role('checkbox', name='Superscript', exact=True).check()
        d.get_by_role('combobox', name='Underline style').select_option('uuline')
        d.get_by_role('tab', name='Advanced').click()
        d.get_by_role('combobox', name='Spacing').select_option('e')
        page.evaluate('() => window.__ev.push(["--", "OK pressed"])')
        d.get_by_role('button', name='OK').click(); settle(page, 300)
        if wait: page.wait_for_timeout(300)
        print('RUN %d wait %d body %r' % (k, wait, F.body(page)[:90]))
        for e in page.evaluate('window.__ev'):
            if 'OK pressed' in str(e): break
            print('   ', e)
        br.close()
print('0 passed, 1 failed')
sys.exit(1)
