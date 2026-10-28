"""Compile a folder (or one .tex from stdin) through the worker in Chromium.
Usage: texrun.py DIR MAIN [engine] [timeout]   env: RIKUY_DIST (or DIST), PORT, OUT (dir for result.json, out.pdf), SHELL_ESCAPE=0"""
import os, sys, json, time, base64
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'test'))
if os.path.isdir('/opt/pw-browsers'): os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
# RIKUY_DIST as everywhere else; DIST is this script's older name for it, still taken
os.environ['RIKUY_DIST'] = os.environ.get('RIKUY_DIST') or os.environ.get('DIST') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist')
import serve
from playwright.sync_api import sync_playwright
PORT = int(os.environ.get('PORT', str(8700 + os.getpid() % 200))); serve.start(PORT)
d, main = sys.argv[1], sys.argv[2]
engine = sys.argv[3] if len(sys.argv) > 3 else 'auto'
wait = int(sys.argv[4]) if len(sys.argv) > 4 else 120
OUT = os.environ.get('OUT', d + '/_out'); os.makedirs(OUT, exist_ok=True)
files = []
for dp, dn, fn in os.walk(d):
    if '_out' in dp: continue
    for n in fn:
        p = os.path.join(dp, n); rel = os.path.relpath(p, d)
        files.append({'path': rel, 'b64': base64.b64encode(open(p, 'rb').read()).decode()})
with sync_playwright() as pw:
    b = pw.chromium.launch(); pg = b.new_page()
    pg.goto('http://127.0.0.1:%d/tex-smoke.html' % PORT)
    pg.wait_for_function('window.ready', timeout=180000)
    pg.evaluate("window.full = []; w.addEventListener('message', (e) => { if (e.data.status) window.full.push(JSON.stringify(e.data).slice(0, 400000)); })")
    extra = {} if os.environ.get('SHELL_ESCAPE', '1') == '1' else {'shellEscape': False}
    if os.environ.get('READ'): extra['read'] = os.environ['READ'].split(',')
    pg.evaluate("""([files, main, engine, extra]) => compile(files.map(f => ({ path: f.path, data: Uint8Array.from(atob(f.b64), c => c.charCodeAt(0)) })), main, true, 'run', '', engine, extra)""", [files, main, engine, extra])
    t = time.time(); crashed = False
    while time.time() - t < wait:
        try:
            for x in pg.evaluate('window.full.splice(0)'):
                if '"fetch"' not in x and os.environ.get('VERBOSE'): print(round(time.time() - t, 1), x if os.environ.get('VERBOSE') == '2' else x[:200], flush=True)
            if pg.evaluate('!!(window.result || window.err)'): break
        except Exception as e:
            print('CRASH', e); crashed = True; break
        time.sleep(0.3)
    if not crashed:
        r = pg.evaluate("window.result ? ({ok: result.ok, shell: result.shell, ms: result.ms, engine: result.engine, passes: result.passes, missing: result.missing, runs: result.runs, log: result.log, pdf: result.pdf ? Array.from(new Uint8Array(result.pdf.buffer || result.pdf)) : null}) : (window.err || {timeout: true})")
        pdf = r.pop('pdf', None)
        for name, data in (pg.evaluate("window.result && window.result.files ? Object.entries(window.result.files).map(([k, v]) => [k, Array.from(v)]) : []") or []):
            open(OUT + '/' + name.replace('/', '_'), 'wb').write(bytes(data))
        if pdf: open(OUT + '/out.pdf', 'wb').write(bytes(pdf))
        json.dump(r, open(OUT + '/result.json', 'w'), indent=1)
        print('ok=%s engine=%s ms=%s passes=%s missing=%s pdf=%s' % (r.get('ok'), r.get('engine'), r.get('ms'), r.get('passes'), r.get('missing'), len(pdf) if pdf else None))
        for x in (r.get('runs') or []):
            print('  run:', str(x.get('cmd') if isinstance(x, dict) else x)[:100], x.get('code') if isinstance(x, dict) else '')
    b.close()
