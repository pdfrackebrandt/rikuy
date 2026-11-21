"""Merge the arXiv corpus shards' results into dev/arxiv-results.jsonl and dev/arxiv-pdfcompare.jsonl
(the collect job of .github/workflows/arxiv.yml, which may push).

  arxiv_collect.py IDS SHARDS_DIR OUT_DIR

The shard files are what papers compiled with shell escape could touch, so they are data to
check, not to trust: a line is kept only if it is a JSON object whose "doc" names a paper of the
sample, at most once per paper and kind; anything else is counted and dropped. corpus_full.py
names a paper arxiv/<id>/<main file>, the id in IDS and the main file a relative path inside the
paper's folder (arxiv/<id> alone is taken too). A row the old merge took on trust (no "doc", a
"doc" that is not a string) stopped the job before it committed anything; the merge after it read
only arxiv/<id> and so dropped every real row (run 43936586314: 0 kept, 998 dropped).
It also says how many papers with a main file have no row (a shard that never compiled: run
44766248361 merged 375 of 998 without saying so) and how many a shard left for lack of time
(rows with the error "budget").
"""
import glob, json, os, re, sys

MAX_LINE = 1 << 20  # a row is a few hundred bytes; a megabyte is a paper writing on purpose
BAD_PART = re.compile(r'^(\.\.?)?$|[\x00-\x1f\x7f\\]')  # empty, . or .., control characters, backslashes


def paper(doc, order):
    """The sample's id a row's "doc" names, or None."""
    parts = doc.split('/') if isinstance(doc, str) and len(doc) <= 512 else []
    if len(parts) < 2 or parts[0] != 'arxiv' or parts[1] not in order: return None
    if any(BAD_PART.search(p) for p in parts[2:]): return None
    return parts[1]


def load(ids_path):
    ids = [l.split()[0] for l in open(ids_path, encoding='utf8') if l.strip() and not l.startswith('#')]
    return {i: n for n, i in enumerate(ids)}


def rows_of(paths, order):
    kept, seen, dropped = [], set(), 0
    for path in sorted(paths):
        if os.path.islink(path) or not os.path.isfile(path):
            dropped += 1
            continue
        with open(path, 'rb') as f:
            for raw in f:
                try:
                    if len(raw) > MAX_LINE: raise ValueError('long')
                    r = json.loads(raw.decode('utf8'))
                    pid = paper(r.get('doc'), order) if isinstance(r, dict) else None
                    if pid is None or pid in seen: raise ValueError(pid)
                except (ValueError, UnicodeDecodeError, AttributeError):
                    if raw.strip(): dropped += 1
                    continue
                seen.add(pid)
                kept.append(r)
    kept.sort(key=lambda r: order[r['doc'].split('/')[1]])
    return kept, dropped


def expected(ids_path):
    """The papers a run compiles: those with a main file in IDS's third field."""
    out = set()
    for l in open(ids_path, encoding='utf8'):
        x = l.split()
        if l.startswith('#') or len(x) != 3 or x[2] in ('-', 'SPARE', 'PDF-ONLY', 'NO-MAIN'):
            continue
        out.add(x[0])
    return out


def main(ids_path, shards, out_dir):
    order = load(ids_path)
    want = expected(ids_path)
    for kind in ('results', 'pdfcompare'):
        rows, dropped = rows_of(glob.glob(os.path.join(shards, 'arxiv-shard-*', 'arxiv-%s-*.jsonl' % kind)), order)
        with open(os.path.join(out_dir, 'arxiv-%s.jsonl' % kind), 'w', encoding='utf8') as out:
            for r in rows:
                out.write(json.dumps(r) + '\n')
        have = {r['doc'].split('/')[1] for r in rows}
        print(kind, len(rows), 'kept,', dropped, 'dropped,', len(want - have), 'papers without a row,',
              sum(1 for r in rows if r.get('error') == 'budget'), 'left for lack of time')


if __name__ == '__main__':
    main(*sys.argv[1:4])
