"""dev/doclimit.py, the hard limits of the arXiv corpus run: a program a paper leaves behind (in the
background, in a session of its own, holding the output pipe) cannot keep a document past its
limit nor live into the next one; a Playwright call that waits on a stuck Chromium ends when the
watchdog kills it; and a shard past its budget writes a row for each paper it leaves instead of
running into GitHub's cancel (run 44766248361: five shards cancelled at 5 h 50 min, nothing
compared). The browser case runs where Playwright and its Chromium are installed."""
import json, os, shutil, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
DEV = os.path.join(HERE, '..', 'dev')
sys.path.insert(0, DEV)
import doclimit  # noqa: E402

n = bad = 0


def check(name, ok, detail=''):
    global n, bad
    n += 1
    if not ok:
        bad += 1
        print('FAIL', name, detail)


def alive(pid):
    try:
        with open('/proc/%d/stat' % pid) as f:
            return f.read().rsplit(')', 1)[1].split()[0] != 'Z'
    except OSError:
        return False


# Chromium is the second generation under this process (Playwright's driver the first): the
# watchdog's sweep(depth=2) ends a call that would wait forever, and a new browser starts.
# Before subreaper() below, as in corpus_full.py, which does not set it.
try:
    if os.path.isdir('/opt/pw-browsers'):
        os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        try:
            b = pw.chromium.launch()
        except Exception as e:
            b = None
            print('skip the browser case:', str(e).split('\n')[0])
        if b:
            pg = b.new_page()
            dog = doclimit.Watchdog(lambda: doclimit.sweep(depth=2))
            dog.arm(2)
            t0 = time.time()
            try:
                pg.evaluate('new Promise(() => {})')
                raised = False
            except Exception:
                raised = True
            check('a Playwright call waiting on a stuck page ends when the watchdog kills Chromium',
                  raised and dog.fired and time.time() - t0 < 30 and not b.is_connected(), (raised, dog.fired, time.time() - t0))
            dog.disarm()  # as corpus_full.py does before it starts a browser again
            b2 = pw.chromium.launch()
            check('a new browser starts after it', b2.new_page().evaluate('1 + 1') == 2)
            b2.close()
except ImportError:
    print('skip the browser case: no Playwright')

check('this process becomes the subreaper of its descendants', doclimit.subreaper())

# A daemon in a session of its own that keeps the output open: subprocess.run(timeout=...) killed
# the shell and then waited on the pipe for as long as the daemon lived.
t0 = time.time()
code, out = doclimit.run(['sh', '-c', 'setsid sh -c "echo daemon \\$\\$; exec sleep 300" & echo started; sleep 300'], 2)
took = time.time() - t0
daemon = int(out.split(b'daemon ')[1].split()[0]) if b'daemon ' in out else None
check('a command past its limit returns at the limit, its output kept', code is None and took < 8 and b'started' in out, (code, took, out))
check('the daemon it started in another session is killed with it', daemon is not None and not alive(daemon), daemon)

# A job left in the background by a command that ended well
code, out = doclimit.run(['sh', '-c', 'sleep 300 & echo $!'], 30)
bg = int(out.split()[0])
check('a command that leaves a background job returns at once with its code', code == 0)
check('the background job is killed', not alive(bg), bg)

code, out = doclimit.run(['sh', '-c', 'yes 0123456789 | head -c 3000008'], 30, tail=100)
check('only the output\'s tail is read when asked', code == 0 and len(out) == 100 and out.endswith(b'\n'), (code, len(out)))

# The document's own clock, around Python's work and the programs it waits on
t0 = time.time()
try:
    with doclimit.alarm(1):
        doclimit.run(['sleep', '300'], 600)
    over = False
except doclimit.Overrun:
    over = True
doclimit.sweep()
check('a document past its limit stops there, its program killed', over and time.time() - t0 < 5 and not doclimit.descendants(), doclimit.descendants())

# The watchdog for a thread that no signal reaches, killing from the second generation down
p = subprocess.Popen(['sh', '-c', 'sleep 300 & wait'])
dog = doclimit.Watchdog(lambda: doclimit.sweep(depth=2))
dog.arm(1)
try:
    p.wait(timeout=20)
    ended = True
except subprocess.TimeoutExpired:
    ended = False
    p.kill(); p.wait()
check('the watchdog kills the grandchild and keeps the child', ended and dog.fired and p.returncode is not None)
dog.arm(60); dog.disarm(); time.sleep(0.5)
check('a disarmed watchdog does not fire', not dog.fired)

b = doclimit.Budget(time.time() + 100)
check('the budget: a document fits before the deadline or not', b.fits(50) and not b.fits(200) and doclimit.Budget('').fits(1e9))

# pdfcompare.py past its deadline: a row for every paper left, at once, nothing compiled
d = tempfile.mkdtemp(prefix='limits-')
try:
    open(os.path.join(d, 'ids.txt'), 'w').write('# sample\n2401.00001 math.AG main.tex\n2401.00002 hep-th paper.tex\n')
    for pid in ('2401.00001', '2401.00002'):
        os.makedirs(os.path.join(d, 'src', pid))
    rows = [{'doc': 'arxiv/2401.00001/main.tex', 'ok': True, 'engine': 'pdflatex'}, {'doc': 'arxiv/2401.00002/paper.tex', 'ok': None, 'error': 'budget'}]
    open(os.path.join(d, 'results.jsonl'), 'w').write(''.join(json.dumps(r) + '\n' for r in rows))
    env = dict(os.environ, CORPUS_LIST=os.path.join(d, 'ids.txt'), CORPUS_REPO=os.path.join(d, 'src'), DEADLINE=str(int(time.time()) + 60), TL26='/nonexistent')
    t0 = time.time()
    r = subprocess.run([sys.executable, '-I', os.path.join(DEV, 'pdfcompare.py'), os.path.join(d, 'results.jsonl'), d, os.path.join(d, 'out.jsonl')],
                       env=env, capture_output=True, text=True, timeout=120)
    got = [json.loads(l) for l in open(os.path.join(d, 'out.jsonl'))] if os.path.exists(os.path.join(d, 'out.jsonl')) else []
    check('pdfcompare.py past its budget writes a "budget" row per paper and stops at once',
          r.returncode == 0 and [(x['doc'], x.get('error')) for x in got] == [(x['doc'], 'budget') for x in rows] and time.time() - t0 < 30
          and '2 documents not compared' in r.stdout, (r.returncode, got, r.stdout[-300:], r.stderr[-300:]))
finally:
    shutil.rmtree(d, ignore_errors=True)

print('%d/%d passed' % (n - bad, n))
sys.exit(1 if bad else 0)
