"""Run browser suites a set number of times and record each run's wall time and check count.

python3 dev/suite_runs.py REPEAT SUITE [SUITE ...], a suite as file.py or file.py:part1,part2.
Runs from test/ as the suites expect; every run must pass, and the first failure stops it with the
suite's own output. Writes a table to $GITHUB_STEP_SUMMARY when set, and always to stdout.
.github/workflows/suite.yml dispatches it on a branch, for work on the suites themselves."""
import os, re, subprocess, sys, time

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


def main():
    repeat, suites = int(sys.argv[1]), sys.argv[2:]
    if not suites or repeat < 1:
        sys.exit('usage: suite_runs.py REPEAT SUITE [SUITE ...]')
    rows, bad = [], None
    for s in suites:
        f, _, parts = s.partition(':')
        args = ['python3', f] + [p for p in parts.split(',') if p]
        for i in range(repeat):
            t0 = time.time()
            r = subprocess.run(args, cwd=os.path.join(ROOT, 'test'), capture_output=True, text=True)
            dt = time.time() - t0
            out = r.stdout + r.stderr
            passed, failed = counts(out)
            ok = r.returncode == 0 and failed in (0, None)
            rows.append((s, i + 1, dt, passed, failed, ok))
            print('%-40s run %d: %6.1f s, %s passed, %s failed%s' % (s, i + 1, dt, passed, failed, '' if ok else '  FAILED'), flush=True)
            if not ok:
                bad = out
                break
        if bad:
            break
    lines = ['| suite | run | seconds | passed | failed |', '|---|---|---|---|---|'] + ['| %s | %d | %.1f | %s | %s |' % (s, i, dt, p, fl) for s, i, dt, p, fl, ok in rows]
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as fh:
            fh.write('\n'.join(lines) + '\n')
    print('\n'.join(lines))
    if bad:
        print(bad[-6000:])
        sys.exit(1)


if __name__ == '__main__':
    main()
