# Campus App

Campus App es una app funcional mínima con frontend + API local.

## Opción simple (1 comando)

Si querés literalmente "apretar un botón" desde terminal, ejecutá:

```bash
./launch_app.sh
```

Esto levanta la app y trata de abrir el navegador automáticamente.

## Opción manual

```bash
python3 run_app.py
```

Abrí: `http://127.0.0.1:8000`

## Endpoints disponibles

- `GET /health`
- `GET /api/courses`
- `GET /api/tasks`
- `GET /api/issues`

## Estado actual (MVP)

- Frontend de panel académico con datos mock desde API.
- Backend HTTP mínimo en Python (sin DB real).

## Qué falta para producción

- Autenticación y roles.
- Persistencia en base de datos.
- Tests automatizados + CI.
- Observabilidad (logs/métricas/tracing).


## Ponerla online

Ver guía: `ONLINE_DEPLOY.md`.
