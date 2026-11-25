"""Serve dist/ for the browser tests and the build's tools: the page wrapped in the publish skeleton
(as the claude.ai artifact host wraps rikuy.html), its files next to it, and on every response the
hosted copy's Content-Security-Policy (and X-Frame-Options) as dist/_headers gives it for that path
(build/app.mjs wrote it; headers_for): the page's own, with the hash of its inline bundle, for
the page and every file and worker; the widgets' own for widget-<hash>.html. To it comes jsDelivr,
where rikuy.html takes the libraries index.html ships in lib/. So the browser tests that open the
page here or with browser.py's open_page run under the policy the hosted copy has, and a page that
needed more would fail them. tex/tex-smoke.html, the
worker's test page for the build's tools (not shipped), is a harness: it gets the artifact host's
policy, and the workers it starts the hosted one from their own responses. A dist/ without
_headers (the artifact's build, RIKUY_SHARE) is served with ARTIFACT_CSP, the claude.ai host's."""
import base64, hashlib, http.server, os, re, socketserver, sys, threading, functools
ROOT = os.environ.get('RIKUY_DIST') or os.path.join(os.path.dirname(__file__), '..', 'dist')
SMOKE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tex', 'tex-smoke.html')
# the claude.ai artifact host's policy, under which the artifact's copy (built with RIKUY_SHARE) runs
ARTIFACT_CSP = ("default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net/pyodide/ "
       "https://cdn.jsdelivr.net/npm/ https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; "
       "font-src 'self' data: blob: https://fonts.gstatic.com; media-src 'self' data: blob:; connect-src 'self' blob: https://fonts.googleapis.com https://fonts.gstatic.com; "
       "worker-src 'self' blob:; form-action 'self'; frame-src 'self' blob: data:; object-src 'none'; base-uri 'self'")
# where rikuy.html takes KaTeX, CodeMirror, JSZip and MathLive from (browser.py's ROUTES answer it)
CDN = 'https://cdn.jsdelivr.net/npm/'


def inline_hashes(doc):
    """The SHA-256 (base64) of every inline script of an HTML page that runs, as build/app.mjs's
    pageHashes counts them (written again here, so each checks the other: test/deploy_check.py)."""
    out = []
    for m in re.finditer(r'<script\b([^>]*)>([\s\S]*?)</script\s*>', doc, re.I):
        attrs, body = m.group(1), m.group(2)
        if re.search(r'\ssrc\s*=', attrs, re.I):
            continue
        ty = re.search(r'\stype\s*=\s*["\']?([^"\'\s>]+)', attrs, re.I)
        if ty and not re.match(r'^(text/javascript|application/javascript|module)$', ty.group(1), re.I):
            continue
        h = base64.b64encode(hashlib.sha256(body.encode('utf8')).digest()).decode()
        if h not in out:
            out.append(h)
    return out


def headers_for(root, path):
    """[(name, value)]: the policy (and X-Frame-Options) a response for path gets."""
    if not os.path.isfile(os.path.join(root, '_headers')) or path == '/tex-smoke.html':
        return [('Content-Security-Policy', ARTIFACT_CSP)]
    import pages
    hs = [(k, v) for k, v in pages.headers_for(root, path) if k.lower() in ('content-security-policy', 'x-frame-options')]
    if re.match(r'^/widget-[0-9a-f]{16}(\.html)?$', path):
        return hs
    return [(k, re.sub(r"(^|;\s*)(script-src [^;]*)", lambda m: m.group(1) + m.group(2) + ' ' + CDN, v) if k.lower() == 'content-security-policy' else v) for k, v in hs]


SKELETON = ('<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">'
            '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
            'body{margin:0;font:14px system-ui,sans-serif;background:#fafafa}img{max-width:100%}[hidden]{display:none!important}</style></head><body>')
TYPES = {'.js': 'text/javascript', '.mjs': 'text/javascript', '.bin': 'application/octet-stream', '.gz': 'application/gzip', '.html': 'text/html; charset=utf-8', '.json': 'application/json'}

class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def policy(self, path):
        # a server started with report=True has every refusal reported to it (test/csp.py): the
        # page's, a frame's and each worker's, whose policy comes with its own script
        hs = headers_for(ROOT, path)
        if getattr(self.server, 'reports', None) is None:
            return hs
        return [(k, v + '; report-uri /__csp-report' if k.lower() == 'content-security-policy' else v) for k, v in hs]

    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0)
        body = self.rfile.read(n) if n else b''
        if self.path == '/__csp-report' and getattr(self.server, 'reports', None) is not None:
            self.server.reports.append(body.decode('utf8', 'replace'))
            self.send_response(204); self.end_headers(); return
        self.send_response(405); self.end_headers()

    def do_GET(self):
        path = self.path.split('?')[0]
        if path in ('/', '/index.html'):
            body = (SKELETON + open(os.path.join(ROOT, 'rikuy.html'), encoding='utf8').read() + '</body></html>').encode()
            ctype = 'text/html; charset=utf-8'
            path = '/'
        elif path == '/tex-smoke.html':
            # the worker's test page, from the repository: dist/ does not ship it
            body = open(SMOKE, 'rb').read()
            ctype = 'text/html; charset=utf-8'
        else:
            # inside ROOT itself: a plain prefix test let /../dist-old/x reach a sibling folder
            root = os.path.abspath(ROOT)
            f = os.path.normpath(os.path.join(root, path.lstrip('/')))
            # (a page file at its address without .html, as Pages serves it: the widget document)
            if not os.path.isfile(f) and os.path.isfile(f + '.html'): f += '.html'
            if os.path.commonpath([root, f]) != root or not os.path.isfile(f):
                self.send_response(404)
                for k, v in self.policy(path): self.send_header(k, v)
                self.end_headers(); return
            body = open(f, 'rb').read()
            ctype = TYPES.get(os.path.splitext(f)[1], 'application/octet-stream')
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        for k, v in self.policy(path): self.send_header(k, v)
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(body)

class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

def start(port=8790, report=False):
    s = Server(('127.0.0.1', port), H)
    # (report: every policy names /__csp-report, and what the browser posts there is kept here)
    s.reports = [] if report else None
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s

if __name__ == '__main__':
    start(int(sys.argv[1]) if len(sys.argv) > 1 else 8790)
    threading.Event().wait()
