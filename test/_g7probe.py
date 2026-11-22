"""A probe of picture.py's R3 XeLaTeX compile on a runner (temporary, branch g7-probe): why it fails."""
import os, sys, subprocess
if len(sys.argv) > 1 and sys.argv[1] == 'inner':
    import picture as P
    diag = []
    orig = P.compile_pdf
    def compile_pdf(page, doc):
        if doc.startswith('% !TEX program = xelatex'):
            r = page.evaluate('''async (t) => { await window.rikuy.api.setSource(t); const r = await window.rikuy.api.compile();
              return { ok: r.ok, pages: r.pages, n: r.pdf ? r.pdf.length : 0, problems: (r.problems || []).map((x) => x.severity + ': ' + x.message).slice(0, 8), log: (r.log || '').slice(-1500), keys: Object.keys(r) }; }''', doc)
            diag.append(r)
        return orig(page, doc)
    P.compile_pdf = compile_pdf
    sys.argv = ['picture.py'] + sys.argv[2:]
    try:
        P.run()
    except SystemExit:
        pass
    for r in diag:
        print('DIAG ok=%s pages=%s n=%s keys=%s problems=%s' % (r['ok'], r['pages'], r['n'], r['keys'], r['problems']))
        print('DIAG log tail:', r['log'][-1200:])
    sys.exit(1)
for parts in (['r3_compiled'], ['compiled', 'r3_objects', 'r3_review', 'r3_compiled']):
    out = subprocess.run([sys.executable, __file__, 'inner'] + parts, capture_output=True, text=True)
    lines = (out.stdout + out.stderr).splitlines()
    print('=== ' + ' '.join(parts) + ': ' + ' | '.join(l for l in lines if l.startswith(('FAIL', 'DIAG ok')) or ' passed, ' in l)[:1500])
    print('\n'.join(l for l in lines if l.startswith('DIAG log'))[-1300:])
print('0 passed, 1 failed')
sys.exit(1)
