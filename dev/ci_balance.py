"""Balance the editor's shards (.github/ci-shards.json and ci.yml's matrix) by measured times.

  python3 dev/ci_balance.py [--runs N] [--run ID]... [--records DIR] [--shards K] [--write]

Each command of the list keeps a p95, in seconds. --runs N first takes them from main's last N
successful CI runs (pushes), --run ID from one run (repeatable), both from the line dev/ci_shards.py
prints after each command in the shards' logs (gh api; the logs are kept 90 days); --records DIR
from the ci-shard-*.json records instead (the artifacts, kept 30 days on main). A command with no record keeps the
p95 it had (a new suite: add its command to any shard with an estimate, then run this).

Then the commands are dealt to K shards (default: as many as now), longest first, each to the
shard with the least so far, and each shard gets timeout-minutes of 1.5 times its p95 (setup plus
its commands' p95s) rounded up: a shard over its budget fails rather than waits. Without --write
it prints the plan; with it, it rewrites the list and ci.yml's matrix."""
import argparse, glob, json, math, os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ci_shards import CI, LIST, MATRIX_RE, check, load, matrix_text

WORKFLOW, JOB = 'ci.yml', 'editor shard '


def dump(spec):
    """The list as JSON with one line per command, so a change of shard reads as a moved line."""
    one = lambda v: json.dumps(v, ensure_ascii=False)
    shards = []
    for s in spec['shards']:
        head = ',\n'.join('   %s: %s' % (one(k), one(v)) for k, v in s.items() if k != 'commands')
        shards.append('  {\n%s,\n   "commands": [\n%s\n   ]\n  }' % (head, ',\n'.join('    ' + one(c) for c in s['commands'])))
    def value(v):
        if not isinstance(v, dict):
            return one(v)
        return '{\n%s\n }' % ',\n'.join('  %s: %s' % (one(k), one(x)) for k, x in v.items())
    rest = ',\n'.join(' %s: %s' % (one(k), value(v)) for k, v in spec.items() if k != 'shards')
    return '{\n%s,\n "shards": [\n%s\n ]\n}\n' % (rest, ',\n'.join(shards))


def p95(xs):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, math.ceil(0.95 * len(xs)) - 1)]


def gh(path):
    return subprocess.run(['gh', 'api', path], capture_output=True, text=True, check=True).stdout


LINE_RE = re.compile(r'^\S+ (python3 .+?): exit (\d+), ([\d.]+) s, ', re.M)


def times_from_runs(ids):
    """Each command's seconds in these CI runs, read from the shards' logs (the line ci_shards.py
    prints after each command), so only the API is needed, not the artifacts' storage."""
    by = {}
    for rid in ids:
        jobs = json.loads(gh('repos/{owner}/{repo}/actions/runs/%s/jobs?per_page=100' % rid))['jobs']
        for j in jobs:
            if not j['name'].startswith(JOB) or j['conclusion'] != 'success':
                continue
            for cmd, code, sec in LINE_RE.findall(gh('repos/{owner}/{repo}/actions/jobs/%d/logs' % j['id'])):
                if code == '0':
                    by.setdefault(cmd, []).append(float(sec))
    return by


def main_runs(n):
    runs = json.loads(gh('repos/{owner}/{repo}/actions/workflows/%s/runs?branch=main&event=push&status=success&per_page=%d' % (WORKFLOW, n)))
    return [r['id'] for r in runs['workflow_runs']]


def times(folder):
    """The same from records (the ci-shard-* artifacts) in a folder."""
    by = {}
    for f in glob.glob(os.path.join(folder, '**', '*.json'), recursive=True):
        with open(f, encoding='utf8') as fh:
            r = json.load(fh)
        for c in r.get('commands', []):
            if c['exit'] == 0:
                by.setdefault(' '.join(c['argv']), []).append(c['seconds'])
    return by


def deal(cmds, k):
    shards = [[] for _ in range(k)]
    load_ = [0.0] * k
    for c in sorted(cmds, key=lambda c: -c['p95']):
        i = min(range(k), key=lambda j: (load_[j], j))
        shards[i].append(c)
        load_[i] += c['p95']
    order = {id(c): n for n, c in enumerate(cmds)}
    return [sorted(s, key=lambda c: order[id(c)]) for s in shards]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--runs', type=int, help="main's last N successful CI runs (pushes)")
    ap.add_argument('--run', action='append', default=[], help='a CI run by its id (any branch); repeatable')
    ap.add_argument('--records', help='a folder of ci-shard-*.json records')
    ap.add_argument('--shards', type=int)
    ap.add_argument('--write', action='store_true')
    a = ap.parse_args()
    spec = load()
    cmds = [c for s in spec['shards'] for c in s['commands']]
    ids = a.run + (main_runs(a.runs) if a.runs else [])
    if a.records or ids:
        seen = times(a.records) if a.records else times_from_runs(ids)
        for c in cmds:
            xs = seen.get(' '.join(c['argv']))
            if xs:
                c['p95'] = round(p95(xs), 1)
                c['n'] = len(xs)
            else:
                print('no record for %s: keeps %s s' % (' '.join(c['argv']), c['p95']))
    k = a.shards or len(spec['shards'])
    setup = spec['setup_seconds']
    spec['shards'] = []
    for i, s in enumerate(deal(cmds, k)):
        total = setup + sum(c['p95'] for c in s)
        spec['shards'].append({'name': str(i + 1), 'p95_seconds': round(total), 'minutes': math.ceil(1.5 * total / 60), 'commands': s})
    for s in spec['shards']:
        print('shard %s: %4.0f s, timeout %d min: %s' % (s['name'], s['p95_seconds'], s['minutes'], ', '.join(' '.join(c['argv'][1:]) for c in s['commands'])))
    if not a.write:
        return
    with open(LIST, 'w', encoding='utf8') as f:
        f.write(dump(spec))
    text = open(CI, encoding='utf8').read()
    m = MATRIX_RE.search(text)
    if not m:
        sys.exit('ci.yml has no matrix written by dev/ci_balance.py')
    with open(CI, 'w', encoding='utf8') as f:
        f.write(text[:m.start(2)] + matrix_text(spec) + text[m.end(2):])
    bad = check(spec)
    for b in bad:
        print(b)
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
