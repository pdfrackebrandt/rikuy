"""dev/arxiv_collect.py keeps only rows that name a paper of the sample, once each, and survives
whatever else a shard file holds (the old merge stopped on a row without "doc")."""
import json, os, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'dev'))
import arxiv_collect  # noqa: E402

n = bad = 0


def check(name, ok, detail=''):
    global n, bad
    n += 1
    if not ok:
        bad += 1
        print('FAIL', name, detail)


d = tempfile.mkdtemp(prefix='collect-')
try:
    open(os.path.join(d, 'ids.txt'), 'w').write('# sample\n2401.00001 2024\n2401.00002 2024\n2401.00003 2024\n')
    for k, lines in ((0, ['{"doc": "arxiv/2401.00002", "ok": true}', '{"doc": "arxiv/2401.00001", "ok": false}', '', 'not json',
                          '{"ok": true}', '["arxiv/2401.00003"]', '{"doc": 7}', '{"doc": "arxiv/9999.99999"}', '{"doc": "../../x/2401.00003"}',
                          '{"doc": "arxiv/2401.00001", "ok": true}', '"\\ud800"', '{"doc": "a/b/c"}']),
                     (1, ['{"doc": "arxiv/2401.00003", "ok": true}', '{"doc": "arxiv/2401.00003", "forged": true}', 'x' * (2 << 20)])):
        s = os.path.join(d, 'shards', 'arxiv-shard-%d' % k)
        os.makedirs(s)
        open(os.path.join(s, 'arxiv-results-%d.jsonl' % k), 'w').write('\n'.join(lines) + '\n')
    os.symlink('/etc/passwd', os.path.join(d, 'shards', 'arxiv-shard-1', 'arxiv-pdfcompare-1.jsonl'))
    open(os.path.join(d, 'shards', 'arxiv-shard-0', 'arxiv-pdfcompare-0.jsonl'), 'wb').write(b'\xff\xfe{"doc"\n{"doc": "arxiv/2401.00001"}\n')
    r = subprocess.run([sys.executable, '-I', os.path.join(HERE, '..', 'dev', 'arxiv_collect.py'), os.path.join(d, 'ids.txt'), os.path.join(d, 'shards'), d],
                       capture_output=True, text=True)
    check('the merge runs to its end on hostile shard files', r.returncode == 0, r.stderr[-400:])
    rows = [json.loads(l) for l in open(os.path.join(d, 'arxiv-results.jsonl'))]
    check('only rows naming a paper of the sample, once each, in the sample\'s order',
          [(x['doc'], x.get('ok')) for x in rows] == [('arxiv/2401.00001', False), ('arxiv/2401.00002', True), ('arxiv/2401.00003', True)], rows)
    check('a second row for a paper does not replace the first', not any(x.get('forged') for x in rows))
    check('the drops are counted', 'results 3 kept, 11 dropped' in r.stdout, r.stdout)
    cmp = [json.loads(l) for l in open(os.path.join(d, 'arxiv-pdfcompare.jsonl'))]
    check('a link is not followed and bytes that are not UTF-8 are dropped', cmp == [{'doc': 'arxiv/2401.00001'}] and 'pdfcompare 1 kept, 2 dropped' in r.stdout, (cmp, r.stdout))
finally:
    shutil.rmtree(d, ignore_errors=True)

print('%d/%d passed' % (n - bad, n))
sys.exit(1 if bad else 0)
