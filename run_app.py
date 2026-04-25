#!/usr/bin/env python3
"""Servidor mínimo para Campus App.

- Sirve frontend estático desde ./frontend
- Expone API JSON en /api/*
"""

from __future__ import annotations

import json
import os
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
FRONTEND_DIR = Path(__file__).parent / "frontend"

DATA = {
    "courses": [
        {"name": "Programación I", "professor": "Dra. Pérez"},
        {"name": "Bases de Datos", "professor": "Ing. Rojas"},
        {"name": "Redes", "professor": "Lic. Gómez"},
    ],
    "tasks": [
        {"title": "TP1 de Programación", "dueDate": "2026-04-30"},
        {"title": "Modelo ER", "dueDate": "2026-05-02"},
    ],
    "issues": [
        "No hay autenticación implementada.",
        "No existe persistencia en base de datos.",
        "No hay tests automáticos.",
    ],
}


class CampusHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(FRONTEND_DIR), **kwargs)

    def _send_json(self, payload: dict | list, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self._send_json({"status": "ok"})
            return

        if self.path == "/api/courses":
            self._send_json(DATA["courses"])
            return

        if self.path == "/api/tasks":
            self._send_json(DATA["tasks"])
            return

        if self.path == "/api/issues":
            self._send_json(DATA["issues"])
            return

        if self.path in {"/", "/index.html", "/styles.css", "/app.js"}:
            super().do_GET()
            return

        self.send_error(HTTPStatus.NOT_FOUND, "Ruta no encontrada")


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), CampusHandler)
    print(f"Campus App disponible en http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
