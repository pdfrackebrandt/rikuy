"""Serve a built dist/ the way Cloudflare Pages serves the hosted Rikuy: dist/index.html as the page
at /, every other file as it is, a missing file as 404 (with 404.html when the build has one), and
the headers of dist/_headers applied as Pages applies them (every matching rule; a header set by
two rules gets both values, joined by a comma). Without a _headers file each response gets
serve.py's policy and no-cache. The served folder can change while running (`server.root`), as a
new deployment does. Used by offline.py and launch.py; `npm run serve:app` runs it on port 8791.

What it leaves out of Pages: redirects (_redirects), pretty URLs other than /index.html -> /, and
compression."""
import http.server, os, re, socketserver, sys, threading, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import serve

TYPES = {'.js': 'application/javascript', '.mjs': 'application/javascript', '.wasm': 'application/wasm', '.html': 'text/html; charset=utf-8',
         '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
         '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.css': 'text/css', '.xml': 'application/xml'}


def parse_headers(text):
    """The rules of a Pages _headers file: [(regex, [(name, value)], [removed names])]."""
    rules, cur = [], None
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        if not line[0].isspace():
            pat = re.escape(line.strip()).replace(r'\*', '(.*)')
            pat = re.sub(r':[A-Za-z]\w*', '([^/]+)', pat)
            cur = (re.compile('^' + pat + '$'), [], [])
            rules.append(cur)
        elif cur is not None:
            s = line.strip()
            if s.startswith('!'):
                cur[2].append(s[1:].strip().lower())
            else:
                k, v = s.split(':', 1)
                cur[1].append((k.strip(), v.strip()))
    return rules


def headers_for(root, path):
    f = os.path.join(root, '_headers')
    if not os.path.isfile(f):
        return [('Content-Security-Policy', serve.CSP), ('Cache-Control', 'no-cache')]
    got, order, removed = {}, [], set()
    for rx, hs, rm in parse_headers(open(f, encoding='utf8').read()):
        if not rx.match(path):
            continue
        removed.update(rm)
        for k, v in hs:
            if k.lower() in got:
                got[k.lower()] = (got[k.lower()][0], got[k.lower()][1] + ', ' + v)
            else:
                got[k.lower()] = (k, v); order.append(k.lower())
    return [got[k] for k in order if k not in removed]


class H(http.server.BaseHTTPRequestHandler):
    # HTTP/1.0: every connection closes after its answer, so a stopped server (a test going
    # offline, a new deployment on the same port) leaves no kept-alive connection answering
    def log_message(self, *a): pass

    def send(self, code, body, ctype, path, extra=()):
        self.send_response(code)
        hs = headers_for(self.server.root, path)
        # a rule's Content-Type takes the place of the one Pages works out from the name
        if not any(k.lower() == 'content-type' for k, v in hs):
            self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        for k, v in hs:
            self.send_header(k, v)
        for k, v in extra:
            self.send_header(k, v)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def do_GET(self):
        self.server.hits.append(self.path)
        root = os.path.abspath(self.server.root)
        path = self.path.split('?')[0].split('#')[0]
        if path == '/index.html':
            return self.send(308, b'', 'text/plain', path, [('Location', '/')])
        rel = 'index.html' if path == '/' else path.lstrip('/')
        f = os.path.normpath(os.path.join(root, rel))
        if os.path.commonpath([root, f]) != root or not os.path.isfile(f):
            nf = os.path.join(root, '404.html')
            body = open(nf, 'rb').read() if os.path.isfile(nf) else b'Not found'
            return self.send(404, body, 'text/html; charset=utf-8', path)
        self.send(200, open(f, 'rb').read(), TYPES.get(os.path.splitext(f)[1], 'application/octet-stream'), path)

    do_HEAD = do_GET

    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0)
        if n: self.rfile.read(n)
        self.send(405, b'Method not allowed', 'text/plain', self.path.split('?')[0])


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def start(port, root=None):
    # other agents' browser tests may hold the port a moment longer
    for i in range(30):
        try:
            s = Server(('127.0.0.1', port), H)
            break
        except OSError as e:
            if 'in use' not in str(e) or i == 29: raise
            time.sleep(2)
    s.root = root or serve.ROOT
    s.hits = []
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s


if __name__ == '__main__':
    start(int(sys.argv[1]) if len(sys.argv) > 1 else 8791, sys.argv[2] if len(sys.argv) > 2 else None)
    threading.Event().wait()
