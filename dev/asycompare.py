"""Galley's Asymptote against a desktop asy of the same version (PLAN task 9).

Each .asy file is drawn twice as PDF (asy -f pdf): by Galley's asy in the worker (Chromium,
tex-smoke.html's shell) and by a native asy 3.09 built from the same source with the same
features (dev/build_asy_native.sh), which typesets its labels with the desktop TeX Live 2026
(dev/tl26.sh). The two PDFs are compared as pdfcompare.py compares documents: pages, text per
page, pixels at 72 dpi.

Each file runs in a folder with the .asy files beside it and the data files it names, as asy
would find them in its own folder. When the native asy writes no PDF of the file's name (an
example that ships only an embedded picture, as BezierSurface's label.pdf), the PDFs it did write
are compared, each with Galley's of the same name.
Usage: asycompare.py OUT.jsonl FILE_OR_DIR...   env: GALLEY_DIST, ASY_NATIVE (the build folder,
       default $GALLEY_WORK/asy-native/build), FORMAT (default pdf), KEEP (keep mismatching PDFs)
The desktop's own asy can stand in for the native one: a folder with an `asy` that runs
/opt/tl26/usr/bin/asy and `base` linked to /opt/tl26/usr/share/asymptote; it renders 3D through
a window, so run under `xvfb-run -a`.
"""
import base64, json, os, re, shutil, subprocess, sys, tempfile, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'test'))
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
from pdfcompare import compare  # noqa: E402

WORK = os.environ.get('GALLEY_WORK', '/tmp/eng')
NATIVE = os.environ.get('ASY_NATIVE', os.path.join(WORK, 'asy-native', 'build'))
FORMAT = os.environ.get('FORMAT', 'pdf')
KEEP = os.environ.get('KEEP')
PORT = int(os.environ.get('PORT', '8821'))
LIMIT = 180


def inputs(path):
    """The .asy file and what it may read: the other .asy files of its folder (imports) and the
    files of its folder its source names in quotes (data)."""
    d = os.path.dirname(path)
    src = open(path, encoding='utf8', errors='replace').read()
    named = set(re.findall(r'"([^"\n]{1,200})"', src))
    out = {}
    for n in sorted(os.listdir(d)):
        p = os.path.join(d, n)
        if not os.path.isfile(p) or os.path.getsize(p) > 4_000_000:
            continue
        if n.endswith('.asy') or n in named or os.path.splitext(n)[0] in named:
            out[n] = open(p, 'rb').read()
    return out


def native(name, files):
    d = tempfile.mkdtemp(prefix='asyn-')
    for n, b in files.items():
        open(os.path.join(d, n), 'wb').write(b)
    env = dict(os.environ, ASYMPTOTE_SYSDIR=os.path.join(NATIVE, 'base'), ASYMPTOTE_HOME=os.path.join(d, '.asy'))
    t0 = time.time()
    try:
        r = subprocess.run([os.path.join(HERE, 'tl26.sh'), os.path.join(NATIVE, 'asy'), '-f', FORMAT, '-noV', name],
                           cwd=d, env=env, capture_output=True, timeout=LIMIT)
        log = (r.stdout + r.stderr).decode('utf8', 'replace')[-1500:]
        code = r.returncode
    except subprocess.TimeoutExpired:
        log, code = 'timeout', -1
    out = os.path.join(d, name[:-4] + '.' + FORMAT)
    data = open(out, 'rb').read() if os.path.exists(out) else None
    others = {n: open(os.path.join(d, n), 'rb').read() for n in sorted(os.listdir(d))
              if n.endswith('.' + FORMAT) and n not in files and n != os.path.basename(out)}
    shutil.rmtree(d, ignore_errors=True)
    return data, code, log, round(time.time() - t0, 1), others


def main():
    out_path = sys.argv[1]
    paths = []
    for a in sys.argv[2:]:
        if os.path.isdir(a):
            paths += sorted(os.path.join(a, n) for n in os.listdir(a) if n.endswith('.asy'))
        else:
            paths.append(a)
    done = {json.loads(l)['file'] for l in open(out_path)} if os.path.exists(out_path) else set()
    out = open(out_path, 'a')
    import serve
    from playwright.sync_api import sync_playwright
    serve.start(PORT)
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = None
        for path in paths:
            if path in done:
                continue
            if pg is None:  # a fresh page after a timeout: the worker may still be busy
                pg = b.new_page()
                pg.goto('http://127.0.0.1:%d/tex-smoke.html' % PORT)
                pg.wait_for_function('window.ready', timeout=180000)
            name = os.path.basename(path)
            files = inputs(path)
            rec = {'file': path}
            t, code, log, secs, others = native(name, files)
            main_out = name[:-4] + '.' + FORMAT
            read = [main_out] + ([] if t else list(others))
            t0 = time.time()
            try:
                pg.evaluate("""([files, argv, read, id]) => shell({ id, tools: ['asy'], argv, read,
                    files: files.map(f => ({ path: f[0], data: Uint8Array.from(atob(f[1]), c => c.charCodeAt(0)) })) })""",
                            [[[n, base64.b64encode(v).decode()] for n, v in files.items()], ['asy', '-f', FORMAT, '-noV', name], read, 'a%d' % paths.index(path)])
                pg.wait_for_function('window.shellResult || window.err', timeout=LIMIT * 1000, polling=200)
                r = pg.evaluate("window.shellResult ? ({code: shellResult.code, err: (shellResult.err || '').slice(-1500), f: Object.fromEntries(Object.entries(shellResult.files).map(([k, v]) => { let s = ''; for (let i = 0; i < v.length; i += 0x8000) s += String.fromCharCode.apply(null, v.subarray(i, i + 0x8000)); return [k, btoa(s)]; }))}) : ({code: -2, err: String(window.err && window.err.error)})")
                got = {k: base64.b64decode(v) for k, v in (r.get('f') or {}).items()}
                g = got.get(main_out)
                if not g and not t and others:  # no PDF of the file's name on the native side: its others
                    g_others = {k: got.get(k) for k in others}
                    rec['outputs'] = list(others)
                rec.update(galley_code=r['code'], galley_err=r['err'][-600:] if not (g or rec.get('outputs')) else '')
            except Exception as e:
                g = None
                rec.update(galley_code=-1, galley_err='timeout' if 'Timeout' in str(e) else str(e)[:300])
                try:
                    pg.evaluate('w.terminate()')
                except Exception:
                    pass
                pg.close(); pg = None
            rec['galley_s'] = round(time.time() - t0, 1)
            rec.update(native_code=code, native_s=secs, native_err=log[-600:] if not t else '')
            if rec.get('outputs'):  # compared output by output: all must be equal
                rec['galley_ok'], rec['native_ok'] = all(g_others.values()), True
                parts = [compare(g_others[k], others[k]) if g_others[k] else {'match': False} for k in others]
                rec['match'] = all(x['match'] for x in parts)
                rec['pixel_worst'] = max((x.get('pixel_worst') or 0) for x in parts)
                if KEEP and not rec['match']:
                    os.makedirs(KEEP, exist_ok=True)
                    for k in others:
                        open(os.path.join(KEEP, name[:-4] + '-' + k[:-4] + '-native.' + FORMAT), 'wb').write(others[k])
                        if g_others[k]:
                            open(os.path.join(KEEP, name[:-4] + '-' + k[:-4] + '-galley.' + FORMAT), 'wb').write(g_others[k])
                out.write(json.dumps(rec) + '\n'); out.flush()
                print(name, rec.get('match'), rec['outputs'], rec.get('pixel_worst'), flush=True)
                continue
            rec['galley_ok'], rec['native_ok'] = g is not None, t is not None
            if g and t:
                if FORMAT == 'pdf':
                    rec.update(compare(g, t))
                else:
                    rec['match'] = g == t
                if KEEP and not rec['match']:
                    os.makedirs(KEEP, exist_ok=True)
                    open(os.path.join(KEEP, name[:-4] + '-galley.' + FORMAT), 'wb').write(g)
                    open(os.path.join(KEEP, name[:-4] + '-native.' + FORMAT), 'wb').write(t)
            else:
                rec['match'] = g is None and t is None  # both refuse: the same behaviour
            out.write(json.dumps(rec) + '\n'); out.flush()
            print(name, rec.get('match'), rec.get('galley_ok'), rec.get('native_ok'), rec.get('pixel_worst'), flush=True)
        b.close()


if __name__ == '__main__':
    main()
