# REGISTRO DE PROGRESO — Sandbox 3D

Bitácora de evidencia del método Gauntlet. Cada entrada registra: componente, referencia
usada, resultado del juicio ciego, delta principal detectado, cambio realizado y métricas.

> Este registro es EVIDENCIA, no sustituto del trabajo.

---

## Condiciones del entorno (medidas, no supuestas) — 2026-09-20

| Aspecto | Resultado |
|---|---|
| Navegador de prueba | Chromium 1194 headless (Playwright 1.56.1) |
| WebGL2 | ✅ disponible — ANGLE sobre **SwiftShader** (rasterizado por SOFTWARE, sin GPU) |
| WebGPU | ❌ `navigator.gpu` undefined con TODAS las combinaciones de flags probadas (`--enable-unsafe-webgpu`, `--use-webgpu-adapter=swiftshader`, `--enable-features=Vulkan,WebGPU`) |
| MAX_TEXTURE_SIZE | 8192 · MAX_SAMPLES 4 · MAX_DRAW_BUFFERS 6 |
| Compresión de texturas | S3TC, ETC, ASTC, BPTC, RGTC disponibles |
| CPU / RAM | 4 núcleos / 15 GB |
| npm registry | ✅ accesible |

**Consecuencia para el método:** todas las métricas de FPS de este proyecto se miden bajo
rasterizado por software. Son **comparables entre sí** (mismo rasterizador, misma CPU, misma
resolución) pero **NO son representativas del FPS en una GPU real**, donde serán muy superiores.
Lo que sí es representativo: draw calls, triángulos, nº de cuerpos físicos activos, coste de CPU
de la física, tiempos de carga, estabilidad y, sobre todo, **la imagen capturada**.

**Consecuencia para la arquitectura:** una ruta WebGPU no puede validarse aquí. El producto se
construye WebGL2-first (verificable) y se deja la puerta abierta a una ruta WebGPU opcional.

---

## Gauntlet 001 — Selección de stack tecnológico

**Contrato de escena:** `gauntlet/tech/SPEC.md` (idéntico para todos los candidatos)
**Arnés de medición:** `tools/bench.mjs` (neutral, escrito por el agente líder, no por los builders)

| Candidato | Estado |
|---|---|
| Three.js + Rapier3D | en construcción |
| Babylon.js 9 + Havok | en construcción |
| PlayCanvas 2.x + física | en construcción |
| Godot 4 → export web | ❌ **DESCARTADO** (evidencia abajo) |

_(resultados de los tres stacks JS, abajo, cuando completen)_

### Godot 4.5.1 → web: descartado, con evidencia

La sonda funcionó de punta a punta: descarga por CLI, import, export web sin abrir el editor
gráfico, servidor con COOP/COEP (`crossOriginIsolated: true`) y **render 3D correcto** en
Chromium+SwiftShader (ver `gauntlet/tech/godot-probe/shots/`). Es decir: se descarta por lo
que mide, no por prejuicio.

| Métrica | Godot 4.5.1 web | Baseline Three.js equivalente |
|---|---|---|
| Payload | **37,7 MB** (9,3 MB gzip) | 1,31 MB (0,26 MB gzip) |
| Arranque a primer fotograma | 2,4 – 4,3 s | 0,14 – 0,21 s |
| FPS 1280x720 (SwiftShader) | 4 | 15 |
| FPS 640x360 (SwiftShader) | 8 | 30 |
| Ciclo build → captura | ~22 s (suelo 10-12 s) | 2-3 s |

Tres razones de peso, por orden de importancia:

1. **Techo visual.** Forward+ **no existe en la exportación web**: se pidió
   `rendering_method="forward_plus"` y Godot lo ignoró en silencio — el log dice
   `- Compatibility -` y el `.wasm` resultante tiene el mismo md5. El techo es GLES3:
   sin SSAO, SSIL, SDFGI, reflejos en espacio de pantalla ni volumétricos. Incompatible con
   el requisito de calidad visual moderna.
2. **Rompe el bucle de crítica.** El agente no controla el fotograma: a 2-8 FPS la física
   avanza según el reloj de pared y dos ejecuciones del mismo build con la misma semilla dan
   pilas de objetos distintas. Sin capturas reproducibles, un juicio A/B no distingue el
   efecto del cambio del efecto del azar.
3. **Coste de iteración** 4-5x mayor y payload 28x mayor.

**Hallazgo adoptado para la arquitectura:** el punto 2 se convierte en requisito duro del
producto — `window.__JUEGO.determinista` (paso fijo cedido al arnés, PRNG con semilla, misma
imagen píxel a píxel entre ejecuciones). Ver `API_AUTOMATIZACION.md`.

**Corrección de un dato del informe de la sonda:** afirmaba que `navigator.gpu` sí está
definido. Es falso. Re-verificado por el agente líder en los dos binarios disponibles
(`chromium-1194` y `chromium_headless_shell-1194`, ambos Chrome 141) y con tres juegos de
flags, incluido `--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader`:
`typeof navigator.gpu === "undefined"` en los seis casos. Se mantiene la conclusión original:
aquí no hay WebGPU y la ruta WebGPU no es verificable.
