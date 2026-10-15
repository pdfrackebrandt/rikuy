"""Serve dist/ the way the artifact host does: the page wrapped in the publish skeleton,
its files next to it, the same Content-Security-Policy on every response."""
import http.server, os, socketserver, sys, threading, functools
ROOT = os.environ.get('GALLEY_DIST') or os.path.join(os.path.dirname(__file__), '..', 'dist')
CSP = ("default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net/pyodide/ "
       "https://cdn.jsdelivr.net/npm/ https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; "
       "font-src 'self' data: blob: https://fonts.gstatic.com; media-src 'self' data: blob:; connect-src 'self' blob: https://fonts.googleapis.com https://fonts.gstatic.com; "
       "worker-src 'self' blob:; form-action 'self'; frame-src 'self' blob: data:; object-src 'none'; base-uri 'self'")
SKELETON = ('<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">'
            '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
            'body{margin:0;font:14px system-ui,sans-serif;background:#fafafa}img{max-width:100%}[hidden]{display:none!important}</style></head><body>')
TYPES = {'.js': 'text/javascript', '.mjs': 'text/javascript', '.bin': 'application/octet-stream', '.gz': 'application/gzip', '.html': 'text/html; charset=utf-8', '.json': 'application/json'}

class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        path = self.path.split('?')[0]
        if path in ('/', '/index.html'):
            body = (SKELETON + open(os.path.join(ROOT, 'galley.html'), encoding='utf8').read() + '</body></html>').encode()
            ctype = 'text/html; charset=utf-8'
        else:
            f = os.path.normpath(os.path.join(ROOT, path.lstrip('/')))
            if not f.startswith(os.path.normpath(ROOT)) or not os.path.isfile(f):
                self.send_response(404); self.send_header('Content-Security-Policy', CSP); self.end_headers(); return
            body = open(f, 'rb').read()
            ctype = TYPES.get(os.path.splitext(f)[1], 'application/octet-stream')
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Content-Security-Policy', CSP)
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(body)

class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

def start(port=8790):
    s = Server(('127.0.0.1', port), H)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s

if __name__ == '__main__':
    start(int(sys.argv[1]) if len(sys.argv) > 1 else 8790)
    threading.Event().wait()
