import os, sys, random, glob, time, json
sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
from browser import open_page, SHOTS
from playwright.sync_api import sync_playwright
ROOT = '/tmp/claude-0/-home-claude/8e522320-e94c-5af0-b5c6-59aa3f1e4221/scratchpad/corpus'
random.seed(11)
cands = []
for f in glob.glob(ROOT + '/**/*.tex', recursive=True):
    t = open(f, encoding='utf8', errors='replace').read()
    if '\\documentclass' not in t or 'beamer' in t[:400] or 'standalone' in t[:400] or 'tikzpicture' in t: continue
    body = t.split('\\begin{document}')[-1]
    if len(body) < 1500: continue
    cands.append(f)
random.shuffle(cands)
cands = cands[:int(os.environ.get('N', '80'))]
print('docs', len(cands))
fails = []
stats = {'type': 0, 'del': 0, 'docs': 0, 'pages': 0}
with sync_playwright() as p:
    browser, page, errors = open_page(p, width=1200, height=900)
    for f in cands:
        d = os.path.dirname(f)
        proj = {}
        for n in os.listdir(d):
            if n.endswith('.tex') or n.endswith('.bib'):
                proj[n] = open(os.path.join(d, n), encoding='utf8', errors='replace').read()
        main = os.path.basename(f)
        errors.clear()
        try:
            page.evaluate('''([files, main]) => { const g = window.galley; g.files = new Map(Object.entries(files)); g.main = main; g.hist = []; g.redoStack = []; g.forceRender = true; g.rebuild(); }''', [proj, main])
        except Exception as e:
            fails.append((f, 'load', str(e)[:200])); continue
        if errors:
            fails.append((f, 'console', errors[:2]))
        stats['docs'] += 1
        stats['pages'] += page.evaluate('document.querySelectorAll(".page").length')
        n = page.evaluate('document.querySelectorAll("#pages span.t:not(.ph)").length')
        if not n: continue
        base = page.evaluate('(m) => window.galley.files.get(m)', main)
        for trial in range(8):
            k = random.randrange(n)
            info = page.evaluate('''(k) => { const spans = [...document.querySelectorAll('#pages span.t:not(.ph)')]; const s = spans[k]; if (!s || !s.firstChild) return null; const L = s.firstChild.data.length; const o = Math.floor(Math.random() * (L + 1)); s.scrollIntoView({block: 'center'}); const r = document.createRange(); r.setStart(s.firstChild, o); r.collapse(true); document.getElementById('pages').focus(); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); return {text: s.firstChild.data, o, f: window.galley.caretNow() && window.galley.caretNow().f}; }''', k)
            if not info or not info['f']: continue
            fname = info['f']
            before = page.evaluate('(f) => window.galley.files.get(f)', fname)
            if trial % 2 == 0:
                page.keyboard.type('Q')
                after = page.evaluate('(f) => window.galley.files.get(f)', fname)
                i0 = 0
                while i0 < len(before) and i0 < len(after) and before[i0] == after[i0]: i0 += 1
                ok = any(after == before[:j] + ins + before[j:] for ins in ('Q', '{}Q') for j in range(max(0, i0 - 3), i0 + 1))
                if not ok:
                    i = next((j for j in range(min(len(before), len(after))) if before[j] != after[j]), min(len(before), len(after)))
                    fails.append((f, 'type', repr(before[max(0,i-30):i+30]), '=>', repr(after[max(0,i-30):i+30]), info['text'][:40], info['o']))
                stats['type'] += 1
            else:
                page.keyboard.press('Backspace')
                after = page.evaluate('(f) => window.galley.files.get(f)', fname)
                if after != before:
                    i = next((j for j in range(min(len(before), len(after))) if before[j] != after[j]), min(len(before), len(after)))
                    j = 0
                    while j < min(len(before), len(after)) - i and before[len(before)-1-j] == after[len(after)-1-j]: j += 1
                    removed = before[i:len(before)-j]
                    added = after[i:len(after)-j]
                    bal = page.evaluate('([s, a, b]) => window.galley.isBalanced(s, a, b)', [before, i, len(before)-j])
                    if not bal and not (added == ' ' and removed.strip() == ''):
                        fails.append((f, 'del-unbalanced', repr(removed[:60]), repr(added[:20]), info['text'][:40], info['o']))
                    if len(removed) > 40 and not removed.strip() == '':
                        fails.append((f, 'del-large', repr(removed[:80]), info['text'][:40], info['o']))
                stats['del'] += 1
            page.keyboard.press('Escape')
            page.keyboard.press('Control+z') if after != before else None
            back = page.evaluate('(f) => window.galley.files.get(f)', fname)
            if back != before:
                fails.append((f, 'undo-mismatch', len(before), len(back)))
                page.evaluate('([f, t]) => { window.galley.files.set(f, t); window.galley.rebuild(); }', [fname, before])
        if errors:
            fails.append((f, 'console-after', errors[:3]))
    browser.close()
print(stats)
print('failures', len(fails))
for x in fails[:40]:
    print(' ', x[0].replace(ROOT, ''), *x[1:])
