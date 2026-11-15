# Static server for this folder plus POST /save?name=<file>.mp4 to write a rendered video next to it.
import http.server, os, re, sys, urllib.parse
ROOT = os.path.dirname(os.path.abspath(__file__))
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def do_POST(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        name = (q.get("name") or [""])[0]
        if not re.fullmatch(r"[a-z0-9-]+\.(mp4|png)", name):
            self.send_response(400); self.end_headers(); return
        n = int(self.headers.get("Content-Length", 0)); data = self.rfile.read(n)
        os.makedirs(os.path.join(ROOT, "media"), exist_ok=True)
        with open(os.path.join(ROOT, "media", name), "wb") as f: f.write(data)
        self.send_response(200); self.end_headers(); self.wfile.write(f"saved {len(data)} bytes".encode())
http.server.ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 8766), H).serve_forever()
