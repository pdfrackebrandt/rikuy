"""Typing on the page, input to next paint: this build (dist/, or RIKUY_DIST) with its animations
and animated caret on, against another build (--against DIR, e.g. one of main: RIKUY_OUT=/tmp/x
node build.mjs in a worktree of it) and against this build with the animated caret off. Each page
types the same keys into the middle of a document of dev/bench (long, or --doc sample, where the
caret glides: on long a key's paint comes late enough that it jumps), in rounds that take turns,
so a slow stretch of a shared machine falls on all. Measured per key: from the keydown's time stamp to a
task after the next frame's animation callbacks (the frame that paints the key; the classic input
to next paint), and Event Timing's duration of the keydown (Chromium's own input to paint,
rounded to 8 ms, as INP takes it).
Usage: taskset -c 1 python3 dev/bench_typing.py [--doc long|sample] [--against /tmp/dist-main] [--rounds 8] [--keys 20] [--cpu 1] [--json out.json]"""
import json, os, statistics, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'test'))
from browser import open_page, load_doc  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
arg = lambda k, d: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
AGAINST = arg('--against', None)
ROUNDS, KEYS, CPU, OUT = int(arg('--rounds', 8)), int(arg('--keys', 20)), float(arg('--cpu', 1)), arg('--json', None)
HERE = os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist')
DOC = arg('--doc', 'long')
DIR = os.path.join(ROOT, 'dev/bench', DOC)
files = {f: open(os.path.join(DIR, f), encoding='utf8').read() for f in sorted(os.listdir(DIR)) if f.endswith(('.tex', '.bib'))}

PROBE = '''() => { window.__lat = []; window.__et = [];
  addEventListener('keydown', (e) => { const t0 = e.timeStamp; requestAnimationFrame(() => { const c = new MessageChannel(); c.port1.onmessage = () => window.__lat.push(performance.now() - t0); c.port2.postMessage(0); }); }, true);
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'keydown' && e.interactionId) window.__et.push(e.duration); }).observe({ type: 'event', durationThreshold: 16 }); }'''
CARET = '''() => { const sp = [...document.querySelectorAll('#pages span.t')]; const s = sp[Math.floor(sp.length / 2)]; const r = document.createRange(); r.setStart(s.firstChild, Math.min(3, s.firstChild.length)); r.collapse(true);
  document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); s.scrollIntoView({ block: 'center' }); }'''


def page_for(p, dist, motion):
    os.environ['RIKUY_DIST'] = dist
    b, page, errors = open_page(p, 1400, 1000, motion=motion)
    cdp = page.context.new_cdp_session(page)
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': CPU})
    load_doc(page, files)
    page.wait_for_timeout(1500)
    page.evaluate(PROBE)
    page.evaluate(CARET)
    page.wait_for_timeout(400)
    return b, page


def stats(xs, ets, ms):
    q = lambda p: sorted(xs)[min(len(xs) - 1, int(p * len(xs)))]
    return {'motion\'s own ms a key': round(statistics.mean(ms), 3), 'keys': len(xs), 'median ms': round(statistics.median(xs), 1), 'p95 ms': round(q(0.95), 1), 'worst ms': round(max(xs), 1),
            'event timing median ms': statistics.median(ets) if ets else '<16', 'event timing over 50 ms': sum(1 for x in ets if x > 50)}


with sync_playwright() as p:
    runs = {'this build, caret on': page_for(p, HERE, True), 'this build, caret off': page_for(p, HERE, True)}
    runs['this build, caret off'][1].evaluate('window.rikuy.motion.set({ caret: false })')
    if AGAINST:
        runs['against ' + AGAINST] = page_for(p, AGAINST, None)
    got = {k: ([], [], []) for k in runs}
    for r in range(ROUNDS):
        for k, (b, page) in (list(runs.items()) if r % 2 == 0 else list(runs.items())[::-1]):
            page.bring_to_front()
            page.evaluate('window.__lat = []; window.__et = []; window.__m0 = window.rikuy.motion ? window.rikuy.motion.stats.total : 0')
            page.keyboard.type('abcdefghijklmnopqrstuvwxyz'[:KEYS], delay=60)
            page.wait_for_timeout(300)
            got[k][0].extend(page.evaluate('window.__lat'))
            got[k][1].extend(page.evaluate('window.__et'))
            got[k][2].append(page.evaluate('(n) => window.rikuy.motion ? (window.rikuy.motion.stats.total - window.__m0) / n : 0', KEYS))
            for _ in range(KEYS):
                page.keyboard.press('Backspace', delay=20)
            page.wait_for_timeout(300)
    out = {k: stats(*v) for k, v in got.items()}
    for k, (b, page) in runs.items():
        cs = page.evaluate('window.rikuy.caret ? { ...window.rikuy.caret.stats, lag: Math.round(window.rikuy.caret.lag) } : null')
        if cs: out[k]['caret glides, jumps (of which for a slow page), its last lag ms'] = cs
    out['_'] = {'document': 'dev/bench/' + DOC, 'rounds': ROUNDS, 'keys a round': KEYS, 'cpu throttling': CPU}
    print(json.dumps(out, indent=1))
    if OUT:
        open(OUT, 'w').write(json.dumps(out, indent=1) + '\n')
    for b, page in runs.values():
        b.close()
