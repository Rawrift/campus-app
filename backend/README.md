# Backend funcional mínimo

La API está implementada en `run_app.py` con servidor HTTP estándar de Python.

## Endpoints actuales

- `GET /health` → devuelve `{"status":"ok"}`.
- `GET /api/courses` → lista de materias.
- `GET /api/tasks` → lista de tareas.
- `GET /api/issues` → lista de issues conocidos.

## Próximo paso recomendado

Migrar esta API mock a un framework backend (FastAPI/Express), con autenticación, DB y tests.
