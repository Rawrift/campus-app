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
| Godot 4 → export web | sonda de viabilidad |

_(resultados abajo cuando completen)_
