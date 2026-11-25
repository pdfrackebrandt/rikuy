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
  [--rounds 6] [--keys 15] [--doc long|sample] [--phone] [--scen plain,cite,enter,back] [--json out.json]

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
KEYS_OUT = '''() => window.__k.filter((k) => k.m != null).map((k) => [k.m - k.ts, k.h != null && k.h < k.r0 ? (k.h - k.start) + (k.m - k.r0) : k.m - k.start])'''
CARET = '''(at) => { const sp = [...document.querySelectorAll('#pages span.t')].filter((x) => x.firstChild && x.firstChild.length > 40 && !x.closest('.ttl, .h, .ref, .fn, .cap, li'));
  const s = (at && sp.find((x) => x.textContent.includes(at))) || sp[Math.floor(sp.length / 2)]; const k = at && s.firstChild.data.includes(at) ? s.firstChild.data.indexOf(at) + at.length : Math.min(20, s.firstChild.length);
  const r = document.createRange(); r.setStart(s.firstChild, k); r.collapse(true);
  document.getElementById('pages').focus(); getSelection().removeAllRanges(); getSelection().addRange(r); s.scrollIntoView({ block: 'center' }); }'''


def setup(p, dist):
    os.environ['RIKUY_DIST'] = dist
    b, page, errors = open_page(p, 390 if PHONE else 1400, 844 if PHONE else 1000, touch=PHONE, layout='mobile' if PHONE else 'print')
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
    got = {(n, s): ([], [], [], []) for n, _ in builds for s in SCEN}
    for r in range(ROUNDS):
        order = list(pages.items()) if r % 2 == 0 else list(pages.items())[::-1]
        for name, (b, page, errors) in order:
            page.bring_to_front()
            for s in SCEN:
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
                    page.wait_for_timeout(120)
                page.wait_for_timeout(500)
                ks = page.evaluate(KEYS_OUT)
                got[(name, s)][0].extend(x[0] for x in ks)
                got[(name, s)][3].extend(x[1] for x in ks)
                for k, v in zip(got[(name, s)][1:3], page.evaluate('[window.__lt, window.__et]')):
                    k.extend(v)
                page.evaluate('() => { while (rikuy.hist.length) rikuy.undo(); }')
                page.wait_for_timeout(300)
    out = {'_': {'document': 'dev/bench/' + DOC, 'rounds': ROUNDS, 'keys a place a round': KEYS, 'phone': PHONE, 'against': AGAINST}}
    for (n, s), (lat, lt, et, work) in got.items():
        row = {'keys': len(lat), 'median ms': round(statistics.median(lat), 1) if lat else 0, 'p95 ms': q(lat, .95), 'worst ms': round(max(lat), 1) if lat else 0,
               'work median ms': round(statistics.median(work), 1) if work else 0, 'work p95 ms': q(work, .95), 'work worst ms': round(max(work), 1) if work else 0,
               'long tasks': len(lt), 'longest task ms': round(max(lt)) if lt else 0, 'event timing p95 ms': q(et, .95) if et else '<16'}
        out.setdefault(s, {})[n] = row
        print('RESULT %s%s %-6s %-10s to paint: median %6.1f p95 %6.1f worst %6.1f ms | work: median %5.1f p95 %5.1f worst %5.1f ms | long tasks %d (longest %s ms) | event timing p95 %s' % (DOC, ' phone' if PHONE else '', s, n, row['median ms'], row['p95 ms'], row['worst ms'], row['work median ms'], row['work p95 ms'], row['work worst ms'], row['long tasks'], row['longest task ms'], row['event timing p95 ms']), flush=True)
    print(json.dumps(out, indent=1))
    if OUT:
        open(OUT, 'w').write(json.dumps(out, indent=1) + '\n')
    for name, (b, page, errors) in pages.items():
        if errors:
            print(name, 'page errors', errors[:3])
        b.close()
    print('1 passed, 0 failed')
