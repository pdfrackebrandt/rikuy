"""Compile every LaTeX-examples document (or, with CORPUS_LIST, every arXiv paper of the sample) with
its whole project folder (the way a user opens it), through the real worker in Chromium.
Usage: corpus_full.py OUT.jsonl [filter]

Each document has TIMEOUT seconds (240) for TeX and 90 more for its files going in and its PDF
coming out; past that a watchdog kills Chromium (dev/doclimit.py), which ends the Playwright call
that waits, and the next document gets a new browser. DEADLINE (seconds since the epoch, the
arXiv workflow's shard budget): no document starts that could run past it; each one left gets a
row with the error "budget", so the shard stops in time to compare and upload what it has."""
import os, sys, json, time, base64
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'test'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # doclimit, also under python3 -I
if os.path.isdir('/opt/pw-browsers'): os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
PORT = int(os.environ.get('PORT', '8794'))
WORK = os.environ.get('RIKUY_WORK', '/tmp/eng')
REPO = os.environ.get('CORPUS_REPO', os.path.join(WORK, 'le-full/repo'))  # a clone of https://github.com/MartinThoma/LaTeX-examples at 8bfd313b8d98
OLD = [json.loads(l)['doc'] for l in open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'corpus-docs.jsonl'))]
# CORPUS_LIST: another corpus, as dev/arxiv-ids.txt lists it (id, category, main file), each paper
# in CORPUS_REPO/<id>/; its documents are named arxiv/<id>/<main>
CORPUS_LIST = os.environ.get('CORPUS_LIST')
if CORPUS_LIST:
    OLD = ['arxiv/%s/%s' % (x[0], x[2]) for x in (l.split() for l in open(CORPUS_LIST) if l.strip() and not l.startswith('#'))
           if len(x) == 3 and x[2] not in ('-', 'SPARE', 'PDF-ONLY', 'NO-MAIN')]
# PDF_DIR: keep each PDF as <PDF_DIR>/<index>.pdf (for pdfcompare.py). SDE: a fixed SOURCE_DATE_EPOCH
# for every run, with FORCE_SOURCE_DATE, so \today and the PDF dates match a desktop run's.
PDF_DIR = os.environ.get('PDF_DIR')
# SHARD=k/n: only the documents whose index is k modulo n (CI runs the arXiv corpus in parallel jobs)
SHARD = tuple(int(x) for x in os.environ['SHARD'].split('/')) if os.environ.get('SHARD') else None
SDE = os.environ.get('SDE')
TEXT = {'tex', 'sty', 'cls', 'bib', 'bst', 'def', 'cfg', 'clo', 'txt', 'dat', 'csv', 'tikz', 'java', 'c', 'py', 'pgf', 'table',
        'data', 'gnuplot', 'gp', 'asy', 'mp', 'lua', 'cpp', 'h', 'js', 'html', 'xml', 'sh', 'hs', 'pl', 'scala', 'go', 'rb', 'm', 'r', 'sql', 'ldf', 'fd', 'bbx', 'cbx', 'lbx', 'dbx', 'ist', 'tsv', 'input', 'pgf-plot', 'pygtex', 'listing'}
BIN = {'png', 'jpg', 'jpeg', 'pdf', 'eps', 'ps', 'mps', 'gif', 'svg', 'ttf', 'otf'}
# arXiv papers come with what arXiv itself typesets from: the .bbl instead of running BibTeX,
# figures exported with their LaTeX part (.pdf_tex)
ARXIV_TEXT = TEXT | {'bbl', 'pdf_tex', 'eps_tex', 'ind', 'nls', 'gls', 'toc', 'pstex_t', 'pgf'}
def project(doc):
    text = TEXT
    if doc.startswith('arxiv/'):
        _, pid, main = doc.split('/', 2)
        root, rel, text = os.path.join(REPO, pid), pid + '/' + main, ARXIV_TEXT
    else:
        rel = doc[3:]  # strip 'le/'
        parts = rel.split('/')
        root = os.path.join(REPO, *parts[:2]) if len(parts) > 2 else os.path.join(REPO, parts[0])
        main = os.path.relpath(os.path.join(REPO, rel), root)
    files, total = [], 0
    for dp, dn, fn in os.walk(root):
        dn[:] = [d for d in dn if not d.startswith('.')]
        for n in sorted(fn):
            q = os.path.join(dp, n)
            ext = n.rsplit('.', 1)[-1].lower() if '.' in n else ''
            sz = os.path.getsize(q)
            if sz > 4_000_000 or total > 40_000_000: continue
            p = os.path.relpath(q, root)
            if ext in text or (ext == '' and sz < 200_000):
                files.append({'path': p, 'data': open(q, encoding='utf8', errors='replace').read()}); total += sz
            elif ext in BIN:
                if ext == 'pdf' and os.path.exists(q[:-4] + '.tex') and q[:-4] + '.tex' == os.path.join(REPO, rel): continue  # its own output
                files.append({'path': p, 'b64': base64.b64encode(open(q, 'rb').read()).decode()}); total += sz
    return files, main
def main():
  import serve, doclimit
  serve.start(PORT)
  OUT = sys.argv[1]
  FILT = sys.argv[2] if len(sys.argv) > 2 else ''
  page = 'http://127.0.0.1:%d/tex-smoke.html' % PORT + ('?sde=' + SDE if SDE else '')
  if PDF_DIR: os.makedirs(PDF_DIR, exist_ok=True)
  out = open(OUT, 'a' if int(os.environ.get('START', '0')) else 'w')  # START: resume after a stop
  timeout = int(os.environ.get('TIMEOUT', '240'))
  limit = timeout + 90  # the whole document, hard: TeX's time and its files in and the PDF out
  start = 300  # at most, for a browser to start and its worker to be ready
  budget = doclimit.Budget(os.environ.get('DEADLINE'))
  # Playwright's driver is this process's child and Chromium the driver's: killing everything
  # from the second generation down ends Chromium, and the call waiting on it raises
  dog = doclimit.Watchdog(lambda: doclimit.sweep(depth=2))
  # Playwright and the browser start when a document needs them, not before: a shard whose time
  # is spent (it started late) writes its 'budget' rows at once, before the step is killed
  state = {'pw': None, 'b': None, 'stale': False}

  def fresh():
      """A page whose worker is ready, in a new browser when the old one is gone or the watchdog
      killed it (just after, the old one may still say it is connected); None if that fails."""
      dog.arm(start)
      try:
          if state['pw'] is None:
              from playwright.sync_api import sync_playwright
              state['pw'] = sync_playwright().start()
          if state['stale'] and state['b'] is not None:
              try: state['b'].close()
              except Exception: pass
              state['b'] = None
          state['stale'] = False
          if state['b'] is None or not state['b'].is_connected():
              state['b'] = state['pw'].chromium.launch()
          p = state['b'].new_page(); p.goto(page); p.wait_for_function('window.ready', timeout=180000)
          return p
      except Exception as e:
          print('page not ready', str(e)[:200], flush=True)
          try: state['b'].close()
          except Exception: pass
          state['b'] = None
          return None
      finally:
          dog.disarm()

  pg = None
  t0 = time.time()
  left = 0
  for i, doc in enumerate(OLD):
      if FILT and FILT not in doc: continue
      if i < int(os.environ.get('START', '0')): continue
      if SHARD and i % SHARD[1] != SHARD[0]: continue
      # no document starts that could end past the deadline, nor a browser that could not start
      # and then compile it in time
      if not budget.fits(limit if pg is not None else limit + start):
          out.write(json.dumps({'doc': doc, 'ok': None, 'error': 'budget'}) + '\n'); out.flush(); left += 1; continue
      if not os.path.exists(os.path.join(REPO, doc[len('arxiv/'):] if doc.startswith('arxiv/') else doc[3:])):
          out.write(json.dumps({'doc': doc, 'ok': None, 'error': 'gone'}) + '\n'); continue
      if pg is None:
          pg = fresh()  # the first, or after a failure: tried again for every document
      if pg is None:  # no browser would start: the rows say so instead of the shard stopping
          out.write(json.dumps({'doc': doc, 'ok': None, 'error': 'harness no page'}) + '\n'); out.flush(); continue
      dog.arm(limit)
      files, main = project(doc)
      try:
          pg.evaluate("""([files, main, id]) => compile(files.map(f => f.b64 ? { path: f.path, data: Uint8Array.from(atob(f.b64), c => c.charCodeAt(0)) } : f), main, true, 'c' + id)""", [files, main, i])
          pg.wait_for_function('window.result || window.err', timeout=timeout * 1000, polling=200)
          r = pg.evaluate("window.result ? ({ok: result.ok, ms: result.ms, passes: result.passes, net: result.net, log: result.log, engine: result.engine, runs: result.runs.map(x => [x.cmd, x.code, (x.log||'').slice(-600)])}) : ({error: window.err.error})")
          if PDF_DIR and r.get('ok'):
              # as base64: a list of numbers costs Python gigabytes for a large PDF
              b64 = pg.evaluate("(() => { const u = new Uint8Array(window.result.pdf); let s = ''; for (let k = 0; k < u.length; k += 0x8000) s += String.fromCharCode.apply(null, u.subarray(k, k + 0x8000)); return btoa(s); })()")
              open(os.path.join(PDF_DIR, '%d.pdf' % i), 'wb').write(base64.b64decode(b64))
      except Exception as e:
          r = {'error': 'harness ' + ('over the %d s limit' % limit if dog.fired else str(e)[:200])}
          try:  # what the worker was doing when time ran out (a pass, a program)
              r['trail'] = pg.evaluate('(window.trail || []).slice(-8)')
          except Exception: pass
          try:  # a TeX run still spinning keeps the page from closing: stop the worker first
              pg.evaluate('w.terminate()')
          except Exception: pass
          try:  # a crashed page cannot reload: the next document starts a new one
              pg.close()
          except Exception: pass
          pg = None
      dog.disarm()
      if dog.fired:  # also when it fired just as the document ended: a new browser next time
          pg, state['stale'] = None, True
      log = r.get('log') or ''
      lines = log.split('\n')
      errs = [l for l in lines if l.startswith('!') or ': LaTeX Error' in l or ':' in l[:80] and ' Error:' in l][:4]
      miss = [l for l in lines if 'not found' in l and ('File' in l or 'file' in l)][:3]
      out.write(json.dumps({'doc': doc, 'main': main, 'nfiles': len(files), 'ok': r.get('ok'), 'ms': r.get('ms'), 'passes': r.get('passes'), 'net': r.get('net'),
                            'engine': r.get('engine'), 'errs': errs, 'miss': miss, 'error': r.get('error'), 'trail': r.get('trail'), 'runs': r.get('runs'), 'tail': log[-1500:] if not r.get('ok') else ''}) + '\n'); out.flush()
      if i % 50 == 0: print(i, doc, r.get('ok'), r.get('ms'), round(time.time() - t0), flush=True)
  if left: print(left, 'documents not compiled: the shard\'s time was spent (rows with the error "budget")', flush=True)
  for close in (lambda: state['b'].close(), lambda: state['pw'].stop()):
      try: close()
      except Exception: pass
  print('done', flush=True)


if __name__ == '__main__':
    main()
