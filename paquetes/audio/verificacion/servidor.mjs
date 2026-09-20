// Servidor estatico minimo para servir el paquete a Chromium (los modulos ESM necesitan
// origen http, no file://).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.wav': 'audio/wav', '.png': 'image/png', '.css': 'text/css',
};

export function servir(raiz, puerto = 0) {
  const base = path.resolve(raiz);
  return new Promise((res) => {
    const srv = http.createServer((req, rep) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(base, p);
      if (!f.startsWith(base)) { rep.writeHead(403).end(); return; }
      fs.readFile(f, (e, data) => {
        if (e) { rep.writeHead(404).end('404 ' + p); return; }
        rep.writeHead(200, {
          'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        });
        rep.end(data);
      });
    });
    srv.listen(puerto, '127.0.0.1', () => res({ srv, puerto: srv.address().port }));
  });
}
