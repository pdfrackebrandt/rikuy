"""A git smart-HTTP server for the Git tests: `git http-backend` behind a small Python server
that adds the CORS headers a browser needs (as a CORS proxy would for GitHub).
Usage: git_server.py ROOT PORT  (serves ROOT/*.git)"""
import http.server, os, subprocess, sys, threading, socketserver

ROOT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/git-root'
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8810
CORS = [('Access-Control-Allow-Origin', '*'), ('Access-Control-Allow-Headers', 'Authorization, Content-Type, Git-Protocol, Accept'),
        ('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'), ('Access-Control-Expose-Headers', '*'),
        ('Access-Control-Allow-Private-Network', 'true')]


class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def do_OPTIONS(self):
        self.send_response(204)
        for k, v in CORS: self.send_header(k, v)
        self.end_headers()

    def run(self, body=b''):
        path, _, query = self.path.partition('?')
        env = dict(os.environ, GIT_PROJECT_ROOT=ROOT, GIT_HTTP_EXPORT_ALL='1', REQUEST_METHOD=self.command, PATH_INFO=path,
                   QUERY_STRING=query, CONTENT_TYPE=self.headers.get('Content-Type', ''), CONTENT_LENGTH=str(len(body)),
                   REMOTE_USER='tester', REMOTE_ADDR='127.0.0.1', GIT_PROTOCOL=self.headers.get('Git-Protocol', ''))
        p = subprocess.run(['git', 'http-backend'], input=body, env=env, capture_output=True)
        head, _, rest = p.stdout.partition(b'\r\n\r\n')
        status = 200
        headers = []
        for line in head.decode('latin1').split('\r\n'):
            if not line: continue
            k, _, v = line.partition(':')
            if k.lower() == 'status': status = int(v.strip().split()[0])
            else: headers.append((k, v.strip()))
        self.send_response(status)
        for k, v in headers + CORS: self.send_header(k, v)
        self.send_header('Content-Length', str(len(rest)))
        self.end_headers()
        self.wfile.write(rest)

    def do_GET(self): self.run()

    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0)
        body = self.rfile.read(n) if n else b''
        if self.headers.get('Content-Encoding') == 'gzip':
            import gzip
            body = gzip.decompress(body)
        self.run(body)


class S(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def start(root, port):
    global ROOT
    ROOT = root
    s = S(('127.0.0.1', port), H)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s


if __name__ == '__main__':
    start(ROOT, PORT)
    threading.Event().wait()
