# Errores actuales y plan de mejora

## Errores / huecos actuales

1. **Sin autenticación**: cualquier usuario podría ver datos sin control.
2. **Sin persistencia**: los datos del frontend están hardcodeados.
3. **Sin pruebas automáticas**: alto riesgo de regresiones.
4. **Sin observabilidad**: no hay logging ni métricas.

## Plan de mejora sugerido

### Fase 1 (rápida)

- Definir stack backend (por ejemplo Node + Express o Python + FastAPI).
- Implementar `/health` y `/auth/login` con JWT.
- Migrar los datos mock a una API local.

### Fase 2 (calidad)

- Añadir pruebas unitarias para servicios y utilidades.
- Añadir pruebas de integración para endpoints clave.
- Configurar CI para ejecutar lint y test en cada PR.

### Fase 3 (producto)

- Gestión de perfiles (estudiante/docente/admin).
- Notificaciones de vencimientos.
- Panel de analítica académica.
