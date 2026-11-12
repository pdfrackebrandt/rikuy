"""The same PDFs before and after: every document of dev/bench/ and a spread of the corpus,
compiled by the worker of another commit (--base, default main) and by this one, step by step:

  1 clean     a clean compile
  2 again     the same text again
  3 third     and again, after the worker had the time to make the preamble's format
  4 edited    with a paragraph added before \\end{document}

For each step the two workers must agree on: a PDF or none, its page count, its text
(pdftotext), and TeX's errors and warnings as the page lists them (src/tex.js parseTeXLog on
the log, plus what the worker itself reports: programs missing, a failed BibTeX). Also told,
not required: whether the PDFs are the same bytes but for their dates and ID.

The corpus documents are picked from dev/corpus-results.jsonl (those that compiled with
pdfLaTeX in under 9 s there, and three of XeLaTeX), so many per kind of preamble: TikZ,
pgfplots, beamer, biblatex, minted, hyperref, glossaries, an index, and the rest.

Usage: python3 dev/bench_same.py [--base main] [--corpus /tmp/corpus-le/le] [--per 8] [--only SUBSTRING] [--part k/n] [--out same.jsonl]
  env: RIKUY_DIST (default dist/), PORT (two ports from it, default 8795). One core: taskset -c 0.
"""
import argparse, atexit, base64, hashlib, json, os, re, shutil, subprocess, sys, tempfile, time
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, 'test'))
if os.path.isdir('/opt/pw-browsers'): os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
from playwright.sync_api import sync_playwright

DIST = os.path.abspath(os.environ.get('RIKUY_DIST') or os.path.join(ROOT, 'dist'))
KINDS = [('tikz', r'\\usepackage(\[[^\]]*\])?\{[^}]*\btikz\b'), ('pgfplots', r'\{[^}]*\bpgfplots\b'), ('beamer', r'\\documentclass(\[[^\]]*\])?\{beamer\}'),
         ('biblatex', r'\{biblatex\}'), ('minted', r'\{minted\}'), ('hyperref', r'\{[^}]*\bhyperref\b'), ('glossaries', r'\{glossaries'),
         ('index', r'\\makeindex|\{imakeidx\}|\{makeidx\}'), ('other', r'')]
STEPS = ['clean', 'again', 'third', 'edited']
EDIT = '\n\nA paragraph the check adds: zebra quokka 12345.\n\n'


def old_dist(base):
    """dist/ with another commit's worker scripts: the packs by hard link, engine.js, shell.js and tools.js from git."""
    d = tempfile.mkdtemp(prefix='rikuy-same-')
    atexit.register(lambda: shutil.rmtree(d, ignore_errors=True))
    os.makedirs(os.path.join(d, 'tex'))
    for n in os.listdir(os.path.join(DIST, 'tex')):
        src = os.path.join(DIST, 'tex', n)
        if n in ('engine.js', 'shell.js', 'tools.js'):
            open(os.path.join(d, 'tex', n), 'wb').write(subprocess.check_output(['git', '-C', ROOT, 'show', base + ':tex/' + n]))
        else:
            try: os.link(src, os.path.join(d, 'tex', n))
            except OSError: shutil.copy(src, os.path.join(d, 'tex', n))
    return d


def pick(corpus, per):
    rows = [json.loads(l) for l in open(os.path.join(HERE, 'corpus-results.jsonl'))]
    rows.sort(key=lambda r: r['doc'])
    got, seen = [], set()
    count = {k: 0 for k, _ in KINDS}
    texts = {}
    for r in rows:
        if not (r.get('ok') and r.get('engine') == 'pdflatex' and (r.get('ms') or 1e9) < 9000): continue
        p = os.path.join(corpus, r['doc'][3:])
        if not os.path.isfile(p): continue
        texts[r['doc']] = open(p, encoding='utf8', errors='replace').read()
    # the rarer kinds first, so a document counts for the rarest kind it has
    for kind, pat in sorted(KINDS, key=lambda kp: sum(1 for t in texts.values() if kp[1] and re.search(kp[1], t)) if kp[1] else 1e9):
        for doc in sorted(texts, key=lambda d: hashlib.sha256(d.encode()).hexdigest()):  # spread over the folders, the same every time
            if count[kind] >= per: break
            if doc in seen or (pat and not re.search(pat, texts[doc])): continue
            seen.add(doc); count[kind] += 1; got.append((doc, kind))
    xe = [r['doc'] for r in rows if r.get('ok') and r.get('engine') == 'xelatex' and (r.get('ms') or 1e9) < 20000][:3]
    return got + [(d, 'xelatex') for d in xe]


def bench_docs():
    out = []
    for name in sorted(os.listdir(os.path.join(HERE, 'bench'))):
        d = os.path.join(HERE, 'bench', name)
        if not os.path.isfile(os.path.join(d, 'bench.json')): continue
        main = json.load(open(os.path.join(d, 'bench.json'), encoding='utf8'))['main']
        files = [{'path': n, 'data': open(os.path.join(d, n), encoding='utf8').read()} for n in sorted(os.listdir(d)) if n != 'bench.json']
        out.append(('bench/' + name, 'bench', files, main))
    return out


COMPILE = """([files, main, clean, project]) => { window.events.length = 0;
  compile(files.map(f => f.b64 ? { path: f.path, data: Uint8Array.from(atob(f.b64), c => c.charCodeAt(0)) } : f), main, clean, project, 'sig'); }"""
RESULT = """() => { const r = window.result; if (!r) return { error: String(window.err && window.err.error) };
  let s = ''; if (r.pdf) { const u = new Uint8Array(r.pdf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); }
  return { ok: r.ok, engine: r.engine, passes: r.passes, ms: r.ms, fromFormat: r.fromFormat || 0, note: r.formatNote || '', log: r.log, missing: r.missing,
    runs: r.runs.filter((x) => x.cmd !== 'tex').map((x) => [x.cmd, x.code]), pdf: btoa(s) }; }"""


class Worker:
    def __init__(self, browser, port):
        self.browser, self.port, self.page, self.n = browser, port, None, 0

    def fresh(self):
        if self.page: self.page.context.close()
        self.page = self.browser.new_context().new_page()
        self.page.goto('http://127.0.0.1:%d/tex-smoke.html' % self.port)
        self.page.wait_for_function('window.ready', timeout=180000)
        self.n = 0

    def compile(self, files, main, clean, project, limit):
        self.page.evaluate('window.result = null; window.err = null')
        self.page.evaluate(COMPILE, [files, main, clean, project])
        self.page.wait_for_function('!!(window.result || window.err)', timeout=limit * 1000, polling=100)
        return self.page.evaluate(RESULT)

    def settle(self, new):
        """The worker makes a format after the result is out: wait for its word on it (this worker), or a moment (the other)."""
        if not new: return
        try: self.page.wait_for_function("window.events.includes('format')", timeout=20000, polling=50)
        except Exception: pass


def facts(r, tmp, parse):
    if 'error' in r: return {'ok': False, 'pages': 0, 'text': '', 'problems': ['worker: ' + r['error']], 'core': ''}
    pdf = base64.b64decode(r['pdf']) if r.get('pdf') else b''
    pages, text, core = 0, '', ''
    if pdf:
        p = os.path.join(tmp, 'x.pdf'); open(p, 'wb').write(pdf)
        info = subprocess.run(['pdfinfo', p], capture_output=True, text=True).stdout
        pages = int((re.search(r'^Pages:\s+(\d+)', info, re.M) or [0, 0])[1])
        text = subprocess.run(['pdftotext', '-layout', p, '-'], capture_output=True, text=True, errors='replace').stdout
        c = re.sub(rb'/(CreationDate|ModDate) ?\(D:[^)]*\)', b'', pdf)
        core = hashlib.sha256(re.sub(rb'/ID ?\[ ?<[0-9A-Fa-f]*> ?<[0-9A-Fa-f]*> ?\]', b'', c)).hexdigest()
    problems = parse(r.get('log') or '') + ['missing: ' + m for m in r.get('missing') or []] + ['%s exit %s' % (c, k) for c, k in r.get('runs') or [] if k]
    return {'ok': bool(r.get('ok')), 'pages': pages, 'text': text, 'problems': problems, 'core': core, 'engine': r.get('engine'), 'passes': r.get('passes'),
            'ms': r.get('ms'), 'fromFormat': r.get('fromFormat', 0), 'note': r.get('note', '')}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--base', default='main', help='the commit whose worker is "before" (default main)')
    ap.add_argument('--corpus', default='/tmp/corpus-le/le', help='a clone of LaTeX-examples at 8bfd313b8d98')
    ap.add_argument('--per', type=int, default=8, help='corpus documents per kind of preamble (default 8: 72 and 3 of XeLaTeX)')
    ap.add_argument('--only', default='', help='only documents whose name has this')
    ap.add_argument('--part', default='', help='k/n: the documents whose place in the list is k modulo n (a long run in pieces)')
    ap.add_argument('--out', help='one JSON line per document')
    a = ap.parse_args()
    os.environ['CORPUS_REPO'] = a.corpus
    sys.path.insert(0, HERE)
    from corpus_full import project
    docs = bench_docs()
    for doc, kind in (pick(a.corpus, a.per) if os.path.isdir(a.corpus) else []):
        files, main_ = project(doc)
        docs.append((doc, kind, files, main_))
    docs = [d for d in docs if a.only in d[0]]
    if a.part: docs = [d for i, d in enumerate(docs) if i % int(a.part.split('/')[1]) == int(a.part.split('/')[0])]
    port = int(os.environ.get('PORT', '8795'))
    servers = []
    for k, dist in enumerate([old_dist(a.base), DIST]):
        servers.append(subprocess.Popen([sys.executable, os.path.join(ROOT, 'test', 'serve.py'), str(port + k)], env=dict(os.environ, RIKUY_DIST=dist)))
    atexit.register(lambda: [s.kill() for s in servers])
    time.sleep(1.5)
    tmp = tempfile.mkdtemp(prefix='rikuy-same-pdf-'); atexit.register(lambda: shutil.rmtree(tmp, ignore_errors=True))
    # the page's own reading of a log
    node = subprocess.Popen(['node', '--input-type=module', '-e',
                             "import { parseTeXLog } from %s; import readline from 'node:readline'; const rl = readline.createInterface({ input: process.stdin });"
                             "rl.on('line', (l) => { const p = parseTeXLog(JSON.parse(l)).map((x) => [x.sev, x.file, x.line, x.msg].join(' | ')); process.stdout.write(JSON.stringify(p) + '\\n'); });" % json.dumps('file://' + os.path.join(ROOT, 'src', 'tex.js'))],
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    atexit.register(node.kill)

    def parse(log):
        node.stdin.write(json.dumps(log) + '\n'); node.stdin.flush()
        return json.loads(node.stdout.readline())
    out = open(a.out, 'w') if a.out else None
    equal = differ = used = 0
    refused = {}
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        W = [Worker(browser, port), Worker(browser, port + 1)]
        for i, (doc, kind, files, main_) in enumerate(docs):
            text = next((f['data'] for f in files if f['path'] == main_ and 'data' in f), None)
            cut = text.rfind('\\end{document}') if text else -1
            edited = [dict(f, data=text[:cut] + EDIT + text[cut:]) if f['path'] == main_ and cut >= 0 else f for f in files]
            res = [[], []]
            for k, w in enumerate(W):
                if w.page is None or w.n >= 12: w.fresh()  # a worker keeps three projects; a new one now and then keeps its memory small
                w.n += 1
                try:
                    for step in STEPS:
                        r = w.compile(edited if step == 'edited' else files, main_, step == 'clean', 'same-%d' % i, 240)
                        res[k].append(facts(r, tmp, parse))
                        if step == 'again': w.settle(k == 1)
                except Exception as e:
                    res[k].append({'ok': False, 'pages': 0, 'text': '', 'problems': ['harness: ' + str(e)[:200]], 'core': ''})
                    w.page = None
            diffs = []
            for s, step in enumerate(STEPS):
                o = res[0][s] if s < len(res[0]) else None; n = res[1][s] if s < len(res[1]) else None
                if not o or not n: diffs.append(step + ': not run'); continue
                for key in ('ok', 'pages', 'text', 'problems'):
                    if o[key] != n[key]: diffs.append('%s: %s' % (step, key))
            fmt = sum(x.get('fromFormat', 0) for x in res[1])
            note = next((x['note'] for x in reversed(res[1]) if x.get('note')), '')
            used += 1 if fmt else 0
            if not fmt and note: refused[note.split(':')[0] + (':' + note.split(':')[1][:40] if ':' in note else '')] = refused.get(note.split(':')[0] + (':' + note.split(':')[1][:40] if ':' in note else ''), 0) + 1
            equal += 0 if diffs else 1; differ += 1 if diffs else 0
            bytes_same = sum(1 for s in range(min(len(res[0]), len(res[1]))) if res[0][s]['core'] and res[0][s]['core'] == res[1][s]['core'])
            row = {'doc': doc, 'kind': kind, 'equal': not diffs, 'diffs': diffs, 'format_passes': fmt, 'note': note, 'pdf_bytes_same': bytes_same,
                   'old': [{k: v for k, v in x.items() if k != 'text'} for x in res[0]], 'new': [{k: v for k, v in x.items() if k != 'text'} for x in res[1]]}
            if out: out.write(json.dumps(row) + '\n'); out.flush()
            ms = lambda xs: '/'.join(str(x.get('ms', '-')) for x in xs)
            print('%-5s %-9s %-58s format %d  bytes %d/4  ms %s -> %s  %s' % ('same' if not diffs else 'DIFF', kind, doc[-58:], fmt, bytes_same, ms(res[0]), ms(res[1]), '; '.join(diffs) or note), flush=True)
        browser.close()
    print('\n%d documents: %d the same at every step, %d differ; the format was used in %d' % (len(docs), equal, differ, used))
    for k, v in sorted(refused.items(), key=lambda kv: -kv[1]): print('  no format, %d: %s' % (v, k))
    sys.exit(1 if differ else 0)


if __name__ == '__main__':
    main()
