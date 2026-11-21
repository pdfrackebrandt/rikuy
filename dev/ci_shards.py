"""Browser suites in shards: which suite and part runs in which shard, a shard's run with its
record, and the gate that holds the shards together to the list.

.github/ci-shards.json is the editor's list (ci.yml), .github/tex-shards.json the TeX side's
(tex.yml; --list names it, before the command): every shard's commands (each run in test/), the
workflow and job that run them, the suites split by part and where their parts are read from, and
(the editor's) every other script of test/ with where it runs instead; the TeX list also has the
paths that make a pull request need TeX. Four uses:

  python3 dev/ci_shards.py [--list LIST] check
      the list against the repository: every test/*.py is in a shard or named with where it runs
      (a file that names it, or why it does not run in CI); a split suite's parts in its shards
      are its parts, each once; the workflow's matrix is the list's shards with their minutes
  python3 dev/ci_shards.py [--list LIST] run SHARD REPORT
      one shard's commands, one after another, every one even after a failure; the record (each
      command, its exit status, seconds and checks) to REPORT, a table to the job's summary;
      exits 1 if any command failed
  python3 dev/ci_shards.py [--list LIST] gate REPORTS
      check, then every shard's record in the folder REPORTS: from this commit, the list's
      commands exactly, every one passed
  python3 dev/ci_shards.py --list LIST changed FILES
      FILES lists a pull request's changed files, one a line: prints need=true when one of them
      matches the list's paths (GitHub's patterns: * within a folder, ** across), else need=false

dev/ci_balance.py rewrites the list and the matrix from main's records."""
import ast, json, os, re, subprocess, sys, time

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
LIST = os.path.join(ROOT, '.github', 'ci-shards.json')
# the suites' last lines: "N passed, M failed", "N checks, M failed" or "N/T passed"
SUMMARY_RE = re.compile(r'\b(\d+) (passed|checks), (\d+) failed|\b(\d+)/(\d+) passed\b')


def checks_of(m):
    """[passed, failed] from a summary line's match."""
    if m.group(4):
        return [int(m.group(4)), int(m.group(5)) - int(m.group(4))]
    n, f = int(m.group(1)), int(m.group(3))
    return [n - f if m.group(2) == 'checks' else n, f]


def load():
    with open(LIST, encoding='utf8') as f:
        return json.load(f)


def workflow(spec):
    """The workflow file that runs this list's shards."""
    return os.path.join(ROOT, spec.get('workflow', '.github/workflows/ci.yml'))


def matrix_re():
    """The matrix lines dev/ci_balance.py writes for this list, after their marking comment."""
    return re.compile(r'(        # shards: written by dev/ci_balance\.py from \.github/%s\n        include:\n)((?:          - .*\n)*)' % re.escape(os.path.basename(LIST)))


def glob_re(pattern):
    """A workflow's paths pattern as a regular expression: ** any characters, * any but /."""
    out = ''
    for part in re.split(r'(\*\*/?|\*|\?)', pattern):
        out += {'**/': '(?:.*/)?', '**': '.*', '*': '[^/]*', '?': '[^/]'}.get(part, re.escape(part))
    return re.compile(out + r'\Z')


def changed(spec, names):
    """The first changed file that matches the list's paths, or None."""
    pats = [glob_re(p) for p in spec['paths']]
    return next((n for n in names if any(p.match(n) for p in pats)), None)


def script_parts(path, how):
    """A split suite's own list of parts, read from its source: 'PARTS' (a module level dict's keys
    or list of functions), 'run' (the functions its run() loops over), or an option such as
    '--schemes' (the default list of the opt() call that reads it)."""
    tree = ast.parse(open(path, encoding='utf8').read())
    if how == 'PARTS':
        for n in tree.body:
            if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'PARTS' for t in n.targets):
                if isinstance(n.value, ast.Dict):
                    return [k.value for k in n.value.keys]
                if isinstance(n.value, (ast.List, ast.Tuple)):
                    return [e.id for e in n.value.elts]
    elif how == 'run':
        for fn in tree.body:
            if isinstance(fn, ast.FunctionDef) and fn.name == 'run':
                return [e.id for n in ast.walk(fn) if isinstance(n, ast.For) and isinstance(n.iter, ast.Tuple) for e in n.iter.elts]
    elif how.startswith('--'):
        for n in ast.walk(tree):
            if isinstance(n, ast.Call) and getattr(n.func, 'id', None) == 'opt' and n.args and getattr(n.args[0], 'value', None) == how:
                return [e.value for e in n.args[1].elts]
    raise ValueError('%s: no parts found as %r' % (os.path.basename(path), how))


def command_parts(argv, how):
    """The parts one command runs of a split suite (None: the whole suite)."""
    args = argv[2:]
    if how.startswith('--'):
        if how not in args:
            return None
        return args[args.index(how) + 1].split(',')
    return args or None


def matrix_text(spec):
    """ci.yml's matrix lines, as the list gives them."""
    return ''.join('          - {shard: %s, minutes: %d}\n' % (s['name'], s['minutes']) for s in spec['shards'])




def check(spec):
    bad = []
    test = os.path.join(ROOT, 'test')
    suites = sorted(f for f in os.listdir(test) if f.endswith('.py'))
    ran = {}
    names = set()
    for s in spec['shards']:
        if s['name'] in names:
            bad.append('shard %s is named twice' % s['name'])
        names.add(s['name'])
        if not s['commands']:
            bad.append('shard %s has no commands' % s['name'])
        for c in s['commands']:
            argv = c['argv']
            if argv[:1] != ['python3'] or len(argv) < 2 or argv[1] not in suites:
                bad.append('shard %s: %r is not python3 and a script of test/' % (s['name'], argv))
                continue
            ran.setdefault(argv[1], []).append(argv)
    for name, where in spec.get('elsewhere', {}).items():
        if name in ran:
            bad.append('%s is in a shard and also said to run elsewhere' % name)
        if name not in suites:
            bad.append('%s is said to run elsewhere but test/ has no such file' % name)
        f = where.get('file')
        if f and not re.search(r'(^|[\s/"])' + re.escape(name) + r'\b', open(os.path.join(ROOT, f), encoding='utf8').read()):
            bad.append('%s is said to run in %s, which does not name it' % (name, f))
        if not f and not where.get('why'):
            bad.append('%s: neither a file it runs in nor why it does not run in CI' % name)
    for name in suites if 'elsewhere' in spec else []:
        if name not in ran and name not in spec['elsewhere']:
            bad.append('test/%s runs in no shard and is not named in "elsewhere": give it a shard (dev/ci_balance.py) or say where it runs' % name)
    for name, how in spec.get('split', {}).items():
        want = script_parts(os.path.join(test, name), how)
        got = []
        for argv in ran.get(name, []):
            p = command_parts(argv, how)
            if p is None:
                bad.append('%s is split by part, but %r runs all of it' % (name, argv))
            else:
                got += p
        dup = sorted({p for p in got if got.count(p) > 1})
        if dup:
            bad.append('%s: parts run twice: %s' % (name, dup))
        if set(got) != set(want):
            bad.append('%s: its parts %s, the shards run %s (missing %s, unknown %s)' % (
                name, want, sorted(set(got)), sorted(set(want) - set(got)), sorted(set(got) - set(want))))
    wf = os.path.relpath(workflow(spec), ROOT)
    m = matrix_re().search(open(workflow(spec), encoding='utf8').read())
    if not m:
        bad.append('%s has no matrix written by dev/ci_balance.py from %s' % (wf, os.path.basename(LIST)))
    elif m.group(2) != matrix_text(spec):
        bad.append('%s\'s matrix is not the list\'s shards and minutes: run python3 dev/ci_balance.py --list %s --write\n%s' % (wf, os.path.relpath(LIST, ROOT), m.group(2)))
    return bad


def run(name, report):
    spec = load()
    shard = next((s for s in spec['shards'] if s['name'] == name), None)
    if shard is None:
        sys.exit('no shard named %r in %s' % (name, LIST))
    env = dict(os.environ, PYTHONUNBUFFERED='1')
    out = {'shard': name, 'sha': os.environ.get('GITHUB_SHA', ''), 'run_id': os.environ.get('GITHUB_RUN_ID', ''), 'commands': []}
    for c in shard['commands']:
        argv = c['argv']
        line = ' '.join(argv)
        print('::group::%s' % line, flush=True)
        t = time.monotonic()
        p = subprocess.Popen(argv, cwd=os.path.join(ROOT, 'test'), env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors='replace')
        last = None
        for l in p.stdout:
            sys.stdout.write(l)
            m = SUMMARY_RE.search(l)
            if m:
                last = m
        code = p.wait()
        sec = round(time.monotonic() - t, 1)
        print('::endgroup::', flush=True)
        checks = checks_of(last) if last else None
        print('%s: exit %d, %.1f s, %s' % (line, code, sec, '%d passed, %d failed' % tuple(checks) if checks else 'no summary line'), flush=True)
        if code:
            print('::error title=%s failed::%s exited %d after %.0f s (shard %s)' % (argv[1], line, code, sec, name), flush=True)
        out['commands'].append({'argv': argv, 'exit': code, 'seconds': sec, 'checks': checks})
        with open(report, 'w', encoding='utf8') as f:
            json.dump(out, f, indent=1)
    total = sum(c['seconds'] for c in out['commands'])
    rows = ['### Shard %s: %d commands, %.0f s' % (name, len(out['commands']), total), '',
            '| command | seconds | checks passed | failed | exit |', '|---|---|---|---|---|']
    for c in out['commands']:
        ch = c['checks'] or ['', '']
        rows.append('| `%s` | %.1f | %s | %s | %s |' % (' '.join(c['argv'][1:]), c['seconds'], ch[0], ch[1], c['exit']))
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf8') as f:
            f.write('\n'.join(rows) + '\n\n')
    sys.exit(1 if any(c['exit'] for c in out['commands']) else 0)


def gate(folder):
    spec = load()
    bad = check(spec)
    # the shards' job as GitHub ended it: a shard cut at its limit, cancelled or skipped may have
    # left no record, or one it wrote before it stopped
    result = os.environ.get('SHARDS_RESULT')
    if result is not None and result != 'success':
        bad.append('the shards ended %s, not success' % result)
    sha = os.environ.get('GITHUB_SHA', '')
    reports = {}
    for f in sorted(os.listdir(folder)) if os.path.isdir(folder) else []:
        if f.endswith('.json'):
            with open(os.path.join(folder, f), encoding='utf8') as fh:
                r = json.load(fh)
            reports[r['shard']] = r
    rows = ['### The shards against .github/ci-shards.json', '', '| shard | commands | seconds | result |', '|---|---|---|---|']
    for s in spec['shards']:
        r = reports.pop(s['name'], None)
        if r is None:
            bad.append('shard %s left no record: it did not run, or stopped before its first command ended' % s['name'])
            rows.append('| %s | | | no record |' % s['name'])
            continue
        if sha and r['sha'] != sha:
            bad.append('shard %s\'s record is from %s, not this commit %s' % (s['name'], r['sha'], sha))
        want = [c['argv'] for c in s['commands']]
        got = [c['argv'] for c in r['commands']]
        if got != want:
            bad.append('shard %s ran %s, the list has %s' % (s['name'], got, want))
        failed = [' '.join(c['argv']) for c in r['commands'] if c['exit'] != 0]
        if failed:
            bad.append('shard %s: failed: %s' % (s['name'], failed))
        rows.append('| %s | %d of %d | %.0f | %s |' % (s['name'], len(got), len(want), sum(c['seconds'] for c in r['commands']), 'failed' if failed or got != want else 'passed'))
    for n in reports:
        bad.append('a record from shard %s, which the list does not have' % n)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf8') as f:
            f.write('\n'.join(rows) + '\n\n' + ('\n'.join('- ' + b for b in bad) if bad else 'Every suite and part of the list ran in its shard and passed.') + '\n')
    return bad


if __name__ == '__main__':
    argv = sys.argv[1:]
    if argv[:1] == ['--list'] and len(argv) > 1:
        LIST = os.path.abspath(argv[1])
        argv = argv[2:]
    cmd = argv[0] if argv else ''
    if cmd == 'run' and len(argv) == 3:
        run(argv[1], argv[2])
    elif cmd == 'changed' and len(argv) == 2:
        with open(argv[1], encoding='utf8') as f:
            hit = changed(load(), [l.strip() for l in f if l.strip()])
        print('need=%s' % ('true' if hit else 'false'))
        print('(%s)' % ('%s matches a path of %s' % (hit, os.path.basename(LIST)) if hit else 'no changed file matches a path of %s' % os.path.basename(LIST)), file=sys.stderr)
    elif cmd in ('check', 'gate') and len(argv) == (1 if cmd == 'check' else 2):
        problems = check(load()) if cmd == 'check' else gate(argv[1])
        for b in problems:
            print('::error::' + b if os.environ.get('GITHUB_ACTIONS') else b)
        print('%s: %s' % (cmd, '%d problems' % len(problems) if problems else 'every suite and part accounted for'))
        sys.exit(1 if problems else 0)
    else:
        sys.exit(__doc__)
