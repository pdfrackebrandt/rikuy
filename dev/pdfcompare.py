"""Compare Rikuy's PDFs with a desktop TeX Live 2026's, document by document.

Rikuy's side comes from a corpus run that kept its PDFs (corpus_full.py with PDF_DIR and SDE
set). For each document that compiled, this runs the desktop TeX Live (dev/tl26.sh) with the
engine Rikuy chose and the same fixed clock, through latexmk with shell escape (Rikuy's own
loop: TeX, then bibtex or biber, makeindex, xindy, asy, until the references settle), and
compares:

  pages   the page count
  text    pdftotext -layout per page, whitespace collapsed
  pixels  every page rendered at 72 dpi in grey (pdftoppm), the share of pixels whose grey
          values differ by more than 64 of 255; a page matches at or under 0.1 %

A document matches when all three do. Usage:
  pdfcompare.py RESULTS.jsonl PDF_DIR OUT.jsonl [filter]
env: SDE (the SOURCE_DATE_EPOCH the corpus run used, default 1700000000), CORPUS_REPO,
     TL26 (default /opt/tl26), KEEP (a folder to keep both PDFs of each mismatch in),
     DESKTOP_CACHE (a folder for the desktop's PDFs, reused by later comparisons of other
     Rikuy builds: the desktop side depends only on the document and the engine)
"""
import difflib, json, os, re, shutil, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from corpus_full import project, OLD  # noqa: E402  the same files Rikuy compiled

SDE = os.environ.get('SDE', '1700000000')
TL26 = os.environ.get('TL26', '/opt/tl26')
KEEP = os.environ.get('KEEP')
DESKTOP_CACHE = os.environ.get('DESKTOP_CACHE')
PIXEL_TOL = 64
PAGE_SHARE = 0.001
ENGINE_FLAG = {'pdflatex': '-pdf', 'xelatex': '-xelatex', 'lualatex': '-lualatex', 'latex': '-pdfps'}
LATEXMKRC = r'''
# what Rikuy's worker does between passes, written as latexmk custom dependencies
add_cus_dep('glo', 'gls', 0, 'makeglossaries');
add_cus_dep('acn', 'acr', 0, 'makeglossaries');
sub makeglossaries { my ($base_name, $path) = fileparse($_[0]); pushd $path; my $r = system "makeglossaries", "$base_name"; popd; return $r; }
add_cus_dep('nlo', 'nls', 0, 'makenlo2nls');
sub makenlo2nls { system("makeindex \"$_[0].nlo\" -s nomencl.ist -o \"$_[0].nls\""); }
add_cus_dep('asy', 'pdf', 0, 'asy');
add_cus_dep('asy', 'eps', 0, 'asy');
add_cus_dep('asy', 'tex', 0, 'asy');
sub asy { return system("asy -o \"$_[0]\" \"$_[0]\""); }
$max_repeat = 6;
'''


_xvfb = None


def display():
    """An X display for the desktop's asy, which renders 3D pictures in a window: the one set, or
    an Xvfb started for this run (a desktop without a display draws them blank)."""
    global _xvfb
    if os.environ.get('DISPLAY'):
        return os.environ['DISPLAY']
    if _xvfb is None:
        n = 90 + os.getpid() % 100
        _xvfb = subprocess.Popen(['Xvfb', ':%d' % n, '-screen', '0', '1280x1024x24', '-nolisten', 'tcp'],
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1)
        _xvfb.display = ':%d' % n
    return _xvfb.display


def desktop(doc, engine, key=None):
    """Compile with the desktop TeX Live in a fresh folder; returns (pdf bytes or None, log tail, seconds)."""
    if DESKTOP_CACHE and key:
        stem = os.path.join(DESKTOP_CACHE, '%s-%s' % (key, engine))
        if os.path.exists(stem + '.json'):
            m = json.load(open(stem + '.json'))
            if m.get('doc') == doc:
                return (open(stem + '.pdf', 'rb').read() if m['pdf'] and os.path.exists(stem + '.pdf') else None), m['tail'], m['secs']
        pdf, tail, secs = desktop(doc, engine)
        os.makedirs(DESKTOP_CACHE, exist_ok=True)
        if pdf:
            open(stem + '.pdf', 'wb').write(pdf)
        if tail != 'timeout':  # a timeout may be the machine's, not the document's
            json.dump({'doc': doc, 'pdf': pdf is not None, 'tail': tail, 'secs': secs}, open(stem + '.json', 'w'))
        return pdf, tail, secs
    files, main = project(doc)
    d = tempfile.mkdtemp(prefix='tl26-')
    for f in files:
        p = os.path.join(d, f['path'])
        os.makedirs(os.path.dirname(p), exist_ok=True)
        if 'b64' in f:
            import base64
            open(p, 'wb').write(base64.b64decode(f['b64']))
        else:
            open(p, 'w', encoding='utf8').write(f['data'])
    sub = os.path.dirname(main)
    cwd = os.path.join(d, sub) if sub else d
    base = os.path.basename(main)
    open(os.path.join(cwd, 'latexmkrc'), 'w').write(LATEXMKRC)
    env = dict(os.environ, SOURCE_DATE_EPOCH=SDE, FORCE_SOURCE_DATE='1', DISPLAY=display())
    cmd = [os.path.join(HERE, 'tl26.sh'), 'latexmk', ENGINE_FLAG.get(engine, '-pdf'), '-shell-escape', '-interaction=nonstopmode',
           '-f', '-r', 'latexmkrc', base]
    t0 = time.time()
    try:
        r = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, timeout=600)
        tail = (r.stdout + r.stderr)[-2000:].decode('utf8', 'replace')
    except subprocess.TimeoutExpired:
        tail = 'timeout'
    pdf_path = os.path.join(cwd, base[:-4] + '.pdf')
    pdf = open(pdf_path, 'rb').read() if os.path.exists(pdf_path) and os.path.getsize(pdf_path) else None  # pdfTeX leaves an empty file after "No pages of output"
    shutil.rmtree(d, ignore_errors=True)
    return pdf, tail, round(time.time() - t0, 1)


def pages_text(pdf):
    with tempfile.NamedTemporaryFile(suffix='.pdf') as t:
        t.write(pdf); t.flush()
        r = subprocess.run(['pdftotext', '-layout', '-enc', 'UTF-8', t.name, '-'], capture_output=True)
    pages = r.stdout.decode('utf8', 'replace').split('\f')
    if pages and not pages[-1].strip():
        pages = pages[:-1]
    return [re.sub(r'\s+', ' ', p).strip() for p in pages]


def render(pdf, out_dir, tag):
    p = os.path.join(out_dir, tag + '.pdf')
    open(p, 'wb').write(pdf)
    subprocess.run(['pdftoppm', '-r', '72', '-gray', p, os.path.join(out_dir, tag)], capture_output=True, timeout=600)
    return sorted(f for f in os.listdir(out_dir) if f.startswith(tag + '-') and f.endswith('.pgm'))


def read_pgm(path):
    data = open(path, 'rb').read()
    # P5 width height maxval, then the bytes
    m = re.match(rb'P5\s+(\d+)\s+(\d+)\s+(\d+)\s', data)
    w, h = int(m.group(1)), int(m.group(2))
    return w, h, data[m.end():m.end() + w * h]


def pixel_share(a, b):
    wa, ha, da = read_pgm(a)
    wb, hb, db = read_pgm(b)
    if (wa, ha) != (wb, hb):
        return 1.0
    import numpy as np
    x = np.frombuffer(da, dtype=np.uint8).astype(np.int16)
    y = np.frombuffer(db, dtype=np.uint8).astype(np.int16)
    return float((np.abs(x - y) > PIXEL_TOL).mean()) if x.size else 0.0


def compare(g, t):
    out = {}
    tg, tt = pages_text(g), pages_text(t)
    out['pages'] = [len(tg), len(tt)]
    out['text_equal'] = tg == tt
    if tg != tt:
        # the share of pages whose text is the same (a whole-document diff is quadratic)
        out['text_pages_equal'] = round(sum(1 for x, y in zip(tg, tt) if x == y) / max(1, max(len(tg), len(tt))), 4)
        for i, (x, y) in enumerate(zip(tg, tt)):
            if x != y:
                sm = difflib.SequenceMatcher(None, x[:20000], y[:20000], autojunk=False)
                op = next((o for o in sm.get_opcodes() if o[0] != 'equal'), None)
                if op:
                    out['first_text_diff'] = {'page': i + 1, 'galley': x[max(0, op[1] - 40):op[2] + 40], 'desktop': y[max(0, op[3] - 40):op[4] + 40]}
                break
    d = tempfile.mkdtemp(prefix='cmp-')
    try:
        pg, pt = render(g, d, 'g'), render(t, d, 't')
        shares = [round(pixel_share(os.path.join(d, a), os.path.join(d, b)), 5) for a, b in zip(pg, pt)]
        out['pixel_worst'] = max(shares) if shares else None
        out['pixel_pages_over'] = [i + 1 for i, s in enumerate(shares) if s > PAGE_SHARE]
    finally:
        shutil.rmtree(d, ignore_errors=True)
    out['match'] = out['pages'][0] == out['pages'][1] and out['text_equal'] and not out['pixel_pages_over']
    return out


def main():
    results, pdf_dir, out_path = sys.argv[1:4]
    filt = sys.argv[4] if len(sys.argv) > 4 else ''
    done = set()
    if os.path.exists(out_path):
        done = {json.loads(l)['doc'] for l in open(out_path)}
    out = open(out_path, 'a')
    index = {doc: i for i, doc in enumerate(OLD)}
    for line in open(results):
        r = json.loads(line)
        doc = r['doc']
        if doc in done or (filt and filt not in doc):
            continue
        rec = {'doc': doc, 'engine': r.get('engine'), 'galley_ok': r.get('ok')}
        gp = os.path.join(pdf_dir, '%d.pdf' % index[doc])
        g = open(gp, 'rb').read() if r.get('ok') and os.path.exists(gp) else None
        t, tail, secs = desktop(doc, r.get('engine') or 'pdflatex', index[doc]) if r.get('ok') is not None else (None, '', 0)
        rec['desktop_ok'] = t is not None
        rec['desktop_s'] = secs
        if g and t:
            rec.update(compare(g, t))
            if KEEP and not rec['match']:
                os.makedirs(KEEP, exist_ok=True)
                stem = os.path.join(KEEP, '%d' % index[doc])
                open(stem + '-galley.pdf', 'wb').write(g)
                open(stem + '-desktop.pdf', 'wb').write(t)
        elif not t:
            rec['desktop_tail'] = tail[-800:]
        out.write(json.dumps(rec) + '\n'); out.flush()
        print(index[doc], doc, rec.get('match'), rec.get('pages'), rec.get('pixel_worst'), flush=True)


if __name__ == '__main__':
    main()
