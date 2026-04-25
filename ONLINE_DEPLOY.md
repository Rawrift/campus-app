# Poner Campus App online (rápido)

Sí, se puede. La opción más simple: **Render**.

## Opción A: Deploy desde GitHub (recomendada)

1. Subí este repo a GitHub.
2. Entrá a Render y creá un nuevo **Web Service** desde el repo.
3. Render detecta `render.yaml` automáticamente.
4. Esperá el deploy y te da una URL pública, por ejemplo:
   - `https://campus-app.onrender.com`

## Opción B: Deploy con configuración manual

- Runtime: Python
- Build command: `echo 'No build needed'`
- Start command: `python3 run_app.py`
- Environment variables:
  - `HOST=0.0.0.0`
  - `PORT=10000` (o la que Render inyecte)

## Qué cambia para vos

Después del deploy, abrís la URL pública desde cualquier navegador y probás la app sin entorno local.
