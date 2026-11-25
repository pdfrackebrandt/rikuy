"""Run browser suites a set number of times and record each run's wall time and check count.

python3 dev/suite_runs.py REPEAT SUITE [SUITE ...], a suite as file.py or file.py:part1,part2.
Runs from test/ as the suites expect; every run must pass, and the first failure stops it with the
suite's own output. Writes a table to $GITHUB_STEP_SUMMARY when set, and always to stdout.
.github/workflows/suite.yml dispatches it on a branch, for work on the suites themselves.

With SUITE_VERIFY=1, each suite's first run keeps what every check saw (RIKUY_CHECK_LOG), then one
more run waits as well the fixed time each settle() replaced (RIKUY_WAIT_SHADOW=1) and keeps the
same; a check that saw something else in the two is a condition wait that ends too soon, and is
listed with both and fails the job, as do the SHADOW lines' count and sites, kept in the summary
(test/browser.py's settle(); a suite that predates it ignores both variables)."""
import json, os, re, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# the suites end with one of: "N passed, M failed", "N checks, M failed" (N all), "P/N passed"
FORMS = [(re.compile(r'(\d+) passed, (\d+) failed'), lambda a, b: (a, b)),
         (re.compile(r'(\d+) checks, (\d+) failed'), lambda a, b: (a - b, b)),
         (re.compile(r'(\d+)/(\d+) passed'), lambda a, b: (a, b - a))]


def counts(out):
    last = None
    for rx, f in FORMS:
        for m in rx.finditer(out):
            if last is None or m.start() > last[0]:
                last = (m.start(), f(int(m.group(1)), int(m.group(2))))
    return last[1] if last else (None, None)


def logged(path):
    try:
        return [json.loads(l) for l in open(path)]
    except OSError:
        return []


def verify(s, args, cwd):
    """Run s once with its checks logged and once in shadow; the checks that differ, and the
    SHADOW lines (where the page still moved after a condition wait)."""
    out = {}
    for mode in ('fast', 'shadow'):
        log = os.path.join(cwd, '.%s-%s.jsonl' % (mode, os.getpid()))
        if os.path.exists(log):
            os.remove(log)
        env = dict(os.environ, RIKUY_CHECK_LOG=log)
        if mode == 'shadow':
            env['RIKUY_WAIT_SHADOW'] = '1'
        r = subprocess.run(args, cwd=cwd, capture_output=True, text=True, env=env)
        out[mode] = (logged(log), r.stdout + r.stderr, r.returncode)
        os.remove(log) if os.path.exists(log) else None
    a, b = out['fast'][0], out['shadow'][0]
    diff = [(i, x, y) for i, (x, y) in enumerate(zip(a, b)) if x != y]
    if len(a) != len(b):
        diff.append((min(len(a), len(b)), ['(check count)', len(a), ''], ['(check count)', len(b), '']))
    shadows = [l for l in out['shadow'][1].splitlines() if l.startswith('SHADOW')]
    return diff, shadows, out


def main():
    repeat, suites = int(sys.argv[1]), sys.argv[2:]
    verifying = os.environ.get('SUITE_VERIFY') == '1'
    notes = []
    if not suites or repeat < 1:
        sys.exit('usage: suite_runs.py REPEAT SUITE [SUITE ...]')
    rows, bad = [], None
    for s in suites:
        f, _, parts = s.partition(':')
        args = ['python3', f] + [p for p in parts.split(',') if p]
        if verifying:
            diff, shadows, out = verify(s, args, os.path.join(ROOT, 'test'))
            notes.append('### %s: %d checks differ between the fast and the shadow run; %d SHADOW lines' % (s, len(diff), len(shadows)))
            notes += ['- #%d `%s`: fast %s `%s`, shadow %s `%s`' % (i, str(x[0])[:120], x[1], str(x[2])[:200], y[1], str(y[2])[:200]) for i, x, y in diff[:40]]
            sites = {}
            for l in shadows:
                k = l.split(' :: ')[0]
                sites[k] = sites.get(k, 0) + 1
            notes += ['- %s ×%d' % (k, n) for k, n in sorted(sites.items(), key=lambda kv: -kv[1])[:40]]
            print('\n'.join(notes[-(len(diff[:40]) + len(sites) + 1):]), flush=True)
            if diff:
                bad = 'checks differ in the shadow run of ' + s + '\n' + out['shadow'][1][-3000:]
                break
        for i in range(repeat):
            t0 = time.time()
            r = subprocess.run(args, cwd=os.path.join(ROOT, 'test'), capture_output=True, text=True)
            dt = time.time() - t0
            out = r.stdout + r.stderr
            passed, failed = counts(out)
            ok = r.returncode == 0 and failed in (0, None)
            rows.append((s, i + 1, dt, passed, failed, ok))
            print('%-40s run %d: %6.1f s, %s passed, %s failed%s' % (s, i + 1, dt, passed, failed, '' if ok else '  FAILED'), flush=True)
            # (a benchmark's numbers, its lines starting RESULT: kept in the summary, dev/bench_keys.py)
            res = [l for l in out.splitlines() if l.startswith('RESULT ')]
            if res:
                print('\n'.join(res), flush=True)
                notes += ['- `%s` run %d: %s' % (s, i + 1, l[7:]) for l in res]
            if not ok:
                bad = out
                break
        if bad:
            break
    lines = ['| suite | run | seconds | passed | failed |', '|---|---|---|---|---|'] + ['| %s | %d | %.1f | %s | %s |' % (s, i, dt, p, fl) for s, i, dt, p, fl, ok in rows] + [''] + notes
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as fh:
            fh.write('\n'.join(lines) + '\n')
    print('\n'.join(lines))
    if bad:
        print(bad[-6000:])
        sys.exit(1)


if __name__ == '__main__':
    main()
