"""A fixed sample of arXiv papers as a second corpus (PLAN task 3).

  arxiv_corpus.py sample  OUT_IDS          choose the candidates (seeded, rerunnable to the same list)
  arxiv_corpus.py fetch   IDS DIR          download sources into DIR/<id>/ (one request per 3 s,
                                           arXiv's rule for scripts) and note each main file

The sample: 1,000 papers, 84 per year from 2015 to 2026 (76 in 2026, which is not over). Each
candidate is a random identifier YYMM.NNNNN with NNNNN up to 8000 (every month since 2015 has had
more submissions than that), kept when arXiv knows it and it is not withdrawn; the draw is seeded,
with 16 spare candidates per year. fetch goes through each year's candidates in order and stops
when the year has its quota of papers with LaTeX source: a paper that is PDF only (PDF-ONLY) or
whose main file cannot be told (NO-MAIN) stays listed and the next spare takes its place; spares
not needed are marked SPARE. The list is the same every time it is made from the same arXiv.
Sources are never committed: dev/arxiv-ids.txt holds the identifiers and the main file of each,
and corpus_full.py (CORPUS_LIST) compiles the papers with a main file.
"""
import gzip, io, json, os, random, re, sys, tarfile, time, urllib.request

API = 'https://export.arxiv.org/api/query?id_list=%s&max_results=100'
EPRINT = 'https://arxiv.org/e-print/%s'
YEARS = list(range(2015, 2027))
PER_YEAR = 84
SPARES = 16
SEED = 20261016
UA = 'Rikuy corpus test (github.com/pdfrackebrandt/rikuy)'
_last = [0.0]


def get(url):
    wait = 3.0 - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    _last[0] = time.time()
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read(), r.headers.get('Content-Type', '')


def months(year):
    last = 10 if year == 2026 else 12  # the sample was drawn in October 2026
    return ['%02d%02d' % (year % 100, m) for m in range(1, last + 1)]


def quota(year):
    return PER_YEAR if year < YEARS[-1] else 1000 - PER_YEAR * (len(YEARS) - 1)


def candidates(year, rnd):
    while True:
        yield '%s.%05d' % (rnd.choice(months(year)), rnd.randint(1, 8000))


def meta(ids):
    data, _ = get(API % ','.join(ids))
    out = {}
    for e in re.findall(r'<entry>(.*?)</entry>', data.decode('utf8'), re.S):
        m = re.search(r'<id>http://arxiv.org/abs/([^<v]+)v?\d*</id>', e)
        if not m:
            continue
        cat = re.search(r'<arxiv:primary_category[^>]*term="([^"]+)"', e)
        withdrawn = 'This paper has been withdrawn' in e
        out[m.group(1)] = {'cat': cat.group(1) if cat else None, 'withdrawn': withdrawn}
    return out


def unpack(blob, ctype, dest):
    """arXiv sends a gzipped tar, a gzipped single file, or a PDF. Returns the file names."""
    os.makedirs(dest, exist_ok=True)
    if blob[:4] == b'%PDF' or 'pdf' in ctype:
        return []
    raw = gzip.decompress(blob) if blob[:2] == b'\x1f\x8b' else blob
    try:
        with tarfile.open(fileobj=io.BytesIO(raw)) as t:
            names = []
            for m in t.getmembers():
                if not m.isfile() or m.name.startswith('/') or '..' in m.name.split('/'):
                    continue
                p = os.path.join(dest, m.name)
                os.makedirs(os.path.dirname(p), exist_ok=True)
                open(p, 'wb').write(t.extractfile(m).read())
                names.append(m.name)
            return names
    except tarfile.ReadError:
        open(os.path.join(dest, 'main.tex'), 'wb').write(raw)
        return ['main.tex']


def main_file(dest, names):
    """The file arXiv would typeset: 00README's toplevel if given, else the one .tex file with
    \\documentclass that no other file inputs, preferring main.tex and ms.tex."""
    readme = [n for n in names if os.path.basename(n).startswith('00README')]
    for r in readme:
        t = open(os.path.join(dest, r), encoding='utf8', errors='replace').read()
        m = re.search(r'^\s*(\S+\.tex)\s+toplevelfile', t, re.M)
        if m and m.group(1) in names:
            return m.group(1)
    texs = [n for n in names if n.lower().endswith('.tex')]
    docs = []
    for n in texs:
        t = open(os.path.join(dest, n), encoding='utf8', errors='replace').read()
        if re.search(r'^[^%\n]*\\document(class|style)', t, re.M) and '\\begin{document}' in t:
            docs.append(n)
    if not docs:
        return None
    for pref in ('main.tex', 'ms.tex', 'paper.tex'):
        for d in docs:
            if os.path.basename(d) == pref:
                return d
    return sorted(docs, key=lambda d: (d.count('/'), -os.path.getsize(os.path.join(dest, d))))[0]


def sample(out_path):
    rnd = random.Random(SEED)
    chosen = []
    for year in YEARS:
        want = quota(year) + SPARES
        gen = candidates(year, rnd)
        got = []
        seen = set()
        while len(got) < want:
            batch = []
            while len(batch) < 40:
                c = next(gen)
                if c not in seen:
                    seen.add(c); batch.append(c)
            info = meta(batch)
            for c in batch:
                if len(got) < want and c in info and not info[c]['withdrawn']:
                    got.append((c, info[c]['cat']))
        chosen += got
        print(year, len(got), flush=True)
    with open(out_path, 'w') as f:
        f.write('# arXiv sample for PLAN task 3 (dev/arxiv_corpus.py sample, seed %d): id category main\n' % SEED)
        for c, cat in chosen:
            f.write('%s %s -\n' % (c, cat))


def fetch(ids_path, root):
    lines = open(ids_path).read().split('\n')
    out = []
    have = {}  # year: papers with a main file so far
    for line in lines:
        if not line.strip() or line.startswith('#'):
            out.append(line); continue
        pid, cat, main = line.split()
        year = 2000 + int(pid[:2])
        if main in ('-', 'SPARE'):
            if have.get(year, 0) >= quota(year):
                main = 'SPARE'
            else:
                dest = os.path.join(root, pid)
                try:
                    blob, ctype = get(EPRINT % pid)
                    names = unpack(blob, ctype, dest)
                except Exception as e:
                    print(pid, 'error', e, flush=True); names = None
                if names is None:
                    main = '-'  # not fetched: the next run tries again
                else:
                    m = main_file(dest, names) if names else None
                    main = m if m else ('PDF-ONLY' if not names else 'NO-MAIN')
                print(pid, cat, main, flush=True)
        if main not in ('-', 'SPARE', 'PDF-ONLY', 'NO-MAIN'):
            if have.get(year, 0) >= quota(year):
                main = 'SPARE'  # an earlier candidate came through on a rerun
            else:
                have[year] = have.get(year, 0) + 1
        out.append('%s %s %s' % (pid, cat, main))
    open(ids_path, 'w').write('\n'.join(out))
    print('papers with source:', sum(have.values()), {y: have[y] for y in sorted(have)})


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'sample':
        sample(sys.argv[2])
    elif cmd == 'fetch':
        fetch(sys.argv[2], sys.argv[3])
