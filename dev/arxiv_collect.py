"""Merge the arXiv corpus shards' results into dev/arxiv-results.jsonl and dev/arxiv-pdfcompare.jsonl
(the collect job of .github/workflows/arxiv.yml, which may push).

  arxiv_collect.py IDS SHARDS_DIR OUT_DIR

The shard files are what papers compiled with shell escape could touch, so they are data to
check, not to trust: a line is kept only if it is a JSON object whose "doc" names a paper of the
sample (<folder>/<id>, the id in IDS), at most once per paper and kind; anything else is counted
and dropped. A row the old merge took on trust (no "doc", a "doc" that is not a string) stopped
the job before it committed anything.
"""
import glob, json, os, sys

MAX_LINE = 1 << 20  # a row is a few hundred bytes; a megabyte is a paper writing on purpose


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
                    doc = r.get('doc') if isinstance(r, dict) else None
                    parts = doc.split('/') if isinstance(doc, str) else []
                    if len(parts) != 2 or parts[1] not in order or doc in seen: raise ValueError(doc)
                except (ValueError, UnicodeDecodeError, AttributeError):
                    if raw.strip(): dropped += 1
                    continue
                seen.add(doc)
                kept.append(r)
    kept.sort(key=lambda r: order[r['doc'].split('/')[1]])
    return kept, dropped


def main(ids_path, shards, out_dir):
    order = load(ids_path)
    for kind in ('results', 'pdfcompare'):
        rows, dropped = rows_of(glob.glob(os.path.join(shards, 'arxiv-shard-*', 'arxiv-%s-*.jsonl' % kind)), order)
        with open(os.path.join(out_dir, 'arxiv-%s.jsonl' % kind), 'w', encoding='utf8') as out:
            for r in rows:
                out.write(json.dumps(r) + '\n')
        print(kind, len(rows), 'kept,', dropped, 'dropped')


if __name__ == '__main__':
    main(*sys.argv[1:4])
