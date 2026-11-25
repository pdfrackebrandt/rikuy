"""Typing, Enter and Backspace on the page, this build against another, keydown to next paint.

Each build opens dev/bench/long (or --doc sample) in its own page of one browser; in rounds that
take turns (ABBA, so a slow stretch of a shared machine falls on both), each page types in the
same places: letters in a paragraph of plain text (plain) and in one with a citation (cite),
Enter and Backspace in turn in the middle of a paragraph (enter: a paragraph split, then joined
again), and Backspace (back). After each place every edit is undone, so each round starts from
the same text. Measured per key: from the keydown's time stamp to the end of the work of the
frame that paints it (to paint); its work, the handlers' time and that frame's, without the wait
for the screen's next frame between them; the long tasks (over 50 ms) the page reports while
typing; Event Timing's duration of each key (Chromium's own input to paint, in 8 ms steps).
A phone: --phone (390 px with touch, CPU 4 times slower, Mobile View as a phone opens).

  python3 dev/bench_keys.py --against /tmp/dist-main            (another build, e.g. main's)
  python3 dev/bench_keys.py --against-ref origin/main           (built here in a worktree first)
  [--rounds 6] [--keys 15] [--doc long|sample] [--phone] [--scen plain,cite,enter,back] [--parts] [--trace] [--json out.json]
(--trace: a devtools trace of 20 keys of each place on this build, the page's main thread per
key by kind of work: handlers, style, layout, paint, commit; and where the forced layouts came from)
(--motion: animations and the animated caret on, as a person has them; the tests' default is off)
(--human: keys 40 to 400 ms apart, so the ribbon's, spelling's and Find's work falls on keys now
and then; --find WORD: Find's hits marked while typing)
(--parts: then this build's handlers one by one, rikuy.rebuild, layoutPass and the rest, a call's
time and its count per key; the undo after each place is in them too)

Prints one RESULT line per place and build (dev/suite_runs.py keeps them in the job's summary),
so the comparison runs on a GitHub runner through suite.yml: suites "../dev/bench_keys.py".
(needs a built dist/, or RIKUY_DIST)"""
import json, os, statistics, subprocess, sys, tempfile
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
sys.path.insert(0, os.path.join(ROOT, 'test'))
from browser import open_page, load_doc  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

arg = lambda k, d: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
ROUNDS, KEYS, DOC, OUT = int(arg('--rounds', 6)), int(arg('--keys', 15)), arg('--doc', 'long'), arg('--json', None)
PHONE = '--phone' in sys.argv
# The time between keys. 120 ms by default, one key after another's work is done: the ribbon's sync
# (60 ms after a key), spelling's run (250 ms after) and Find's (220 ms) fall in the gaps and are
# no key's time to paint (--parts times them). --human: gaps drawn from 40 to 400 ms, the same
# sequence for every build, so that work lands now and then while a key waits, as with a person.
# --find WORD: Find on, its hits marked, while typing.
HUMAN, FIND = '--human' in sys.argv, arg('--find', None)
def gap(i):
    if not HUMAN:
        return 120
    x = (i * 2654435761 + 12345) % 4294967296 / 4294967296
    return int(40 + 360 * x)
SCEN = arg('--scen', 'plain,cite,enter,back').split(',')
HERE = os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist')


def build_ref(ref):
    """The page of another commit (a branch of origin, e.g. origin/main), built in a worktree of
    this clone with its node_modules; a runner's shallow checkout fetches the branch first."""
    out = os.path.join(tempfile.gettempdir(), 'rikuy-bench-ref')
    wt = out + '-src'
    subprocess.run(['git', '-C', ROOT, 'fetch', '-q', '--depth=1', 'origin', ref.split('/', 1)[-1]], check=True)
    if os.path.isdir(wt):
        subprocess.run(['git', '-C', ROOT, 'worktree', 'remove', '--force', wt], check=False)
    subprocess.run(['git', '-C', ROOT, 'worktree', 'add', '-q', '--detach', wt, 'FETCH_HEAD'], check=True)
    if not os.path.exists(os.path.join(wt, 'node_modules')):
        os.symlink(os.path.abspath(os.path.join(ROOT, 'node_modules')), os.path.join(wt, 'node_modules'))
    subprocess.run(['node', 'build.mjs'], cwd=wt, check=True, env=dict(os.environ, RIKUY_OUT=out, RIKUY_NO_WORD='1'), stdout=subprocess.DEVNULL)
    return out


AGAINST = arg('--against', None) or (build_ref(arg('--against-ref', '')) if '--against-ref' in sys.argv else None)
D = os.path.join(ROOT, 'dev/bench', DOC)
files = {f: open(os.path.join(D, f), encoding='utf8').read() for f in sorted(os.listdir(D)) if f.endswith(('.tex', '.bib'))}
# where each place is: the words the caret goes after (None: a long paragraph half way down)
AT = {'long': {'plain': 'As a result, the panel is bounded', 'cite': 'A planner follows from the common trend', 'enter': 'At the same time, the lower bound is robust', 'back': 'A planner pins down the tax base'}}.get(DOC, {})
# (per key: its keydown's time stamp and the moment its first handler starts; the end of the last
# of its input tasks (keydown, keypress, beforeinput: a message posted from each, the last one's
# kept); the start of the frame after it (an animation callback) and the end of that frame's work
# (a message posted from there). Its work is the handlers' time and the frame's, without the wait
# for the screen's next frame between them, which no page can shorten.)
PROBE = '''() => { const K = window.__k = []; window.__lt = []; window.__et = [];
  const mark = (e) => { let k = K[K.length - 1];
    if (e.type === 'keydown') { k = { ts: e.timeStamp, start: performance.now() }; K.push(k); }
    if (!k) return;
    const n = k.n = (k.n || 0) + 1;
    const c = new MessageChannel(); c.port1.onmessage = () => { if (k.n === n) k.h = performance.now(); }; c.port2.postMessage(0);
    requestAnimationFrame(() => { if (k.n !== n) return; k.r0 = performance.now(); const d = new MessageChannel(); d.port1.onmessage = () => { if (k.n === n) k.m = performance.now(); }; d.port2.postMessage(0); }); };
  for (const t of ['keydown', 'keypress', 'beforeinput']) addEventListener(t, mark, true);
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(e.duration); }).observe({ type: 'longtask' });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'keydown' && e.interactionId) window.__et.push(e.duration); }).observe({ type: 'event', durationThreshold: 16 }); }'''
KEYS_OUT = '''() => window.__k.filter((k) => k.m != null).map((k) => [k.m - k.ts, k.h != null && k.h < k.r0 ? (k.h - k.start) + (k.m - k.r0) : k.m - k.start, (k.h != null ? Math.min(k.h, k.r0) : k.r0) - k.start, k.m - k.r0])'''
# (--parts: after the rounds, this build's handlers timed one by one on 40 more keys of each place)
PARTS = '''() => { window.__t = {}; const W = (o, k, name) => { const f = o && o[k]; if (!f) return; o[k] = function (...a) { const t0 = performance.now(); try { return f.apply(this, a); } finally { (window.__t[name] = window.__t[name] || []).push(performance.now() - t0); } }; };
  const g = rikuy; for (const k of ['commit', 'rebuild', 'layoutPass', 'restoreCaret', 'status', 'computePx', 'tocPages', 'ribbonSync', 'spellRun', 'spellPaint', 'findRun', 'findPaint', 'grammarPaint', 'refreshNav', 'deleteInput', 'enter']) W(g, k, k);
  W(g.renderer, 'sync', 'render'); W(g.layout, 'measure', 'measure'); W(g.layout, 'plan', 'plan'); W(g.layout, 'apply', 'apply');
  const S = Selection.prototype.collapse; Selection.prototype.collapse = function (...a) { const t0 = performance.now(); try { return S.apply(this, a); } finally { (window.__t['selection collapse'] = window.__t['selection collapse'] || []).push(performance.now() - t0); } }; }'''
CARET = '''(at) => { const sp = [...document.querySelectorAll('#pages span.t')].filter((x) => x.firstChild && x.firstChild.length > 40 && !x.closest('.ttl, .h, .ref, .fn, .cap, li'));
  const s = (at && sp.find((x) => x.textContent.includes(at))) || sp[Math.floor(sp.length / 2)]; const k = at && s.firstChild.data.includes(at) ? s.firstChild.data.indexOf(at) + at.length : Math.min(20, s.firstChild.length);
  const r = document.createRange(); r.setStart(s.firstChild, k); r.collapse(true);
  document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); s.scrollIntoView({ block: 'center' }); }'''


def setup(p, dist):
    os.environ['RIKUY_DIST'] = dist
    b, page, errors = open_page(p, 390 if PHONE else 1400, 844 if PHONE else 1000, touch=PHONE, layout='mobile' if PHONE else 'print', motion=True if '--motion' in sys.argv else None)
    cdp = page.context.new_cdp_session(page)
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4 if PHONE else 1})
    load_doc(page, files)
    page.wait_for_timeout(1500)
    page.evaluate(PROBE)
    return b, page, errors


def q(xs, p):
    return round(sorted(xs)[min(len(xs) - 1, int(p * len(xs)))], 1) if xs else 0


with sync_playwright() as p:
    builds = [('this build', HERE)] + ([('against', AGAINST)] if AGAINST else [])
    pages = {name: setup(p, d) for name, d in builds}
    got = {(n, s): ([], [], [], [], [], []) for n, _ in builds for s in SCEN}
    for r in range(ROUNDS):
        order = list(pages.items()) if r % 2 == 0 else list(pages.items())[::-1]
        for name, (b, page, errors) in order:
            page.bring_to_front()
            for s in SCEN:
                if FIND:
                    page.evaluate('(q) => window.rikuy.findSet({ q })', FIND)
                page.evaluate(CARET, AT.get(s))
                page.wait_for_timeout(400)
                page.evaluate('window.__k.length = 0; window.__lt = []; window.__et = []')
                for i in range(KEYS):
                    if s in ('plain', 'cite'):
                        page.keyboard.type('abcdefghij klmnopqrst '[i % 22])
                    elif s == 'enter':
                        page.keyboard.press('Enter' if i % 2 == 0 else 'Backspace')
                    else:
                        page.keyboard.press('Backspace')
                    page.wait_for_timeout(gap(r * KEYS + i))
                page.wait_for_timeout(500)
                ks = page.evaluate(KEYS_OUT)
                got[(name, s)][0].extend(x[0] for x in ks)
                got[(name, s)][3].extend(x[1] for x in ks)
                got[(name, s)][4].extend(x[2] for x in ks)
                got[(name, s)][5].extend(x[3] for x in ks)
                for k, v in zip(got[(name, s)][1:3], page.evaluate('[window.__lt, window.__et]')):
                    k.extend(v)
                page.evaluate('() => { while (rikuy.hist.length) rikuy.undo(); }')
                page.wait_for_timeout(300)
    out = {'_': {'document': 'dev/bench/' + DOC, 'rounds': ROUNDS, 'keys a place a round': KEYS, 'phone': PHONE, 'against': AGAINST, 'gaps': 'human, 40 to 400 ms' if HUMAN else '120 ms', 'find': FIND}}
    for (n, s), (lat, lt, et, work, hand, frame) in got.items():
        row = {'keys': len(lat), 'median ms': round(statistics.median(lat), 1) if lat else 0, 'p95 ms': q(lat, .95), 'worst ms': round(max(lat), 1) if lat else 0,
               'work median ms': round(statistics.median(work), 1) if work else 0, 'work p95 ms': q(work, .95), 'work worst ms': round(max(work), 1) if work else 0,
               'handlers median ms': round(statistics.median(hand), 1) if hand else 0, 'handlers p95 ms': q(hand, .95), 'frame median ms': round(statistics.median(frame), 1) if frame else 0, 'frame p95 ms': q(frame, .95),
               'long tasks': len(lt), 'longest task ms': round(max(lt)) if lt else 0, 'event timing p95 ms': q(et, .95) if et else '<16'}
        out.setdefault(s, {})[n] = row
        print('RESULT %s%s%s%s %-6s %-10s to paint: median %6.1f p95 %6.1f worst %6.1f ms | work: median %5.1f p95 %5.1f worst %5.1f ms (handlers %.1f/%.1f, frame %.1f/%.1f) | long tasks %d (longest %s ms) | event timing p95 %s' % (DOC, ' phone' if PHONE else '', ' human' if HUMAN else '', ' find' if FIND else '', s, n, row['median ms'], row['p95 ms'], row['worst ms'], row['work median ms'], row['work p95 ms'], row['work worst ms'], row['handlers median ms'], row['handlers p95 ms'], row['frame median ms'], row['frame p95 ms'], row['long tasks'], row['longest task ms'], row['event timing p95 ms']), flush=True)
    if '--trace' in sys.argv:
        # (a devtools trace of 20 keys of each place on this build: the renderer's main thread per
        # key, by kind of work, and where each forced layout came from)
        b, page, errors = pages['this build']
        page.bring_to_front()
        cdp = page.context.new_cdp_session(page)
        evs, done = [], []
        cdp.on('Tracing.dataCollected', lambda e: evs.extend(e['value']))
        cdp.on('Tracing.tracingComplete', lambda e: done.append(1))
        for s in SCEN:
            page.evaluate(CARET, AT.get(s))
            page.wait_for_timeout(400)
            evs.clear(); done.clear()
            cdp.send('Tracing.start', {'categories': 'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.stack', 'transferMode': 'ReportEvents'})
            for i in range(20):
                if s in ('plain', 'cite'):
                    page.keyboard.type('abcdefghij klmnopqrst '[i % 22])
                elif s == 'enter':
                    page.keyboard.press('Enter' if i % 2 == 0 else 'Backspace')
                else:
                    page.keyboard.press('Backspace')
                page.wait_for_timeout(150)
            page.wait_for_timeout(300)
            cdp.send('Tracing.end')
            while not done:
                page.wait_for_timeout(100)
            page.evaluate('() => { while (rikuy.hist.length) rikuy.undo(); }')
            busy = {}
            for e in evs:
                if e.get('ph') == 'X' and e.get('name') == 'RunTask':
                    busy[(e['pid'], e['tid'])] = busy.get((e['pid'], e['tid']), 0) + e.get('dur', 0)
            names = {(e['pid'], e['tid']): e['args']['name'] for e in evs if e.get('name') == 'thread_name'}
            main = max((k for k in busy if names.get(k) == 'CrRendererMain'), key=lambda k: busy[k], default=None)
            sums, counts, forced = {}, {}, {}
            for e in evs:
                if (e['pid'], e['tid']) != main or e.get('ph') != 'X':
                    continue
                n, d = e['name'], e.get('dur', 0) / 1000
                if n in ('EventDispatch', 'TimerFire', 'FireAnimationFrame', 'UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'Layerize', 'Commit', 'RunMicrotasks', 'MinorGC', 'MajorGC', 'HitTest', 'UpdateLayer', 'RasterTask'):
                    sums[n] = sums.get(n, 0) + d
                    counts[n] = counts.get(n, 0) + 1
                if n in ('Layout', 'UpdateLayoutTree'):
                    st = ((e.get('args') or {}).get('beginData') or {}).get('stackTrace') or []
                    if st:
                        k = n + ' from ' + ' < '.join(f.get('functionName') or '?' for f in st[:3])
                        forced[k] = forced.get(k, 0) + d
            for n, v in sorted(sums.items(), key=lambda kv: -kv[1]):
                print('RESULT trace %-6s %-18s ms a key %6.2f  (%.1f a key)' % (s, n, v / 20, counts[n] / 20), flush=True)
            for k, v in sorted(forced.items(), key=lambda kv: -kv[1])[:6]:
                print('RESULT trace %-6s forced %s: ms a key %.2f' % (s, k[:120], v / 20), flush=True)
    if '--parts' in sys.argv:
        b, page, errors = pages['this build']
        page.bring_to_front()
        page.evaluate(PARTS)
        n = 0
        for s in SCEN:
            if FIND:
                page.evaluate('(q) => window.rikuy.findSet({ q })', FIND)
            page.evaluate(CARET, AT.get(s))
            page.wait_for_timeout(300)
            for i in range(40):
                if s in ('plain', 'cite'):
                    page.keyboard.type('abcdefghij klmnopqrst '[i % 22])
                elif s == 'enter':
                    page.keyboard.press('Enter' if i % 2 == 0 else 'Backspace')
                else:
                    page.keyboard.press('Backspace')
                page.wait_for_timeout(gap(n + i))
            n += 40
            page.evaluate('() => { while (rikuy.hist.length) rikuy.undo(); }')
        for k, v in sorted(page.evaluate('window.__t').items(), key=lambda kv: -sum(kv[1])):
            print('RESULT parts %-18s calls a key %.2f  ms a key %.2f  median %.2f  p95 %.2f' % (k, len(v) / n, sum(v) / n, statistics.median(v), q(v, .95)), flush=True)
    print(json.dumps(out, indent=1))
    if OUT:
        open(OUT, 'w').write(json.dumps(out, indent=1) + '\n')
    for name, (b, page, errors) in pages.items():
        if errors:
            print(name, 'page errors', errors[:3])
        b.close()
    print('1 passed, 0 failed')
