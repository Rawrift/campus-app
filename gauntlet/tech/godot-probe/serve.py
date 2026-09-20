#!/usr/bin/env python3
"""Static server with COOP/COEP (cross-origin isolation) required by Godot 4 web + threads."""
import sys, functools, http.server, socketserver

class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))

H.extensions_map[".wasm"] = "application/wasm"
port = int(sys.argv[1]); root = sys.argv[2]
socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(("127.0.0.1", port), functools.partial(H, directory=root)) as httpd:
    print("serving %s on %d" % (root, port), flush=True)
    httpd.serve_forever()
