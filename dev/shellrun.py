"""Run one program through the worker's shell in a folder of files.
Usage: shellrun.py DIR TOOLS ARGV...   env: DIST, READ=a,b  (TOOLS: comma list or -)"""
import os, sys, json, time, base64
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'test'))
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
os.environ['GALLEY_DIST'] = os.environ.get('DIST', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist'))
import serve
from playwright.sync_api import sync_playwright
PORT = int(os.environ.get('PORT', str(8500 + os.getpid() % 200))); serve.start(PORT)
d, tools, argv = sys.argv[1], sys.argv[2], sys.argv[3:]
files = []
for n in sorted(os.listdir(d)):
    p = os.path.join(d, n)
    if os.path.isfile(p): files.append({'path': n, 'b64': base64.b64encode(open(p, 'rb').read()).decode()})
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page()
    pg.on('console', lambda m: print('console:', m.text) if os.environ.get('CONSOLE') else None)
    pg.goto('http://127.0.0.1:%d/tex-smoke.html' % PORT)
    pg.wait_for_function('window.ready', timeout=180000)
    t = time.time()
    pg.evaluate("""([files, tools, argv, read]) => shell({ id: 't', tools, argv, read, files: files.map(f => ({ path: f.path, data: Uint8Array.from(atob(f.b64), c => c.charCodeAt(0)) })) })""",
                [files, [] if tools == '-' else tools.split(','), argv, (os.environ.get('READ') or '').split(',') if os.environ.get('READ') else []])
    pg.wait_for_function('window.shellResult || window.err', timeout=600000)
    r = pg.evaluate("window.shellResult ? ({code: shellResult.code, out: shellResult.out, err: shellResult.err, files: Object.fromEntries(Object.entries(shellResult.files).map(([k, v]) => [k, Array.from(v)]))}) : window.err")
    print('time %.1fs' % (time.time() - t))
    for k, v in (r.get('files') or {}).items():
        open(os.path.join(d, '_' + k), 'wb').write(bytes(v)); print('wrote _' + k)
    print('code', r.get('code')); print('--- out\n' + (r.get('out') or '')); print('--- err\n' + (r.get('err') or ''))
    b.close()
