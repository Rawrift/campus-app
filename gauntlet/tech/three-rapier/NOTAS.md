# Three.js + Rapier3D — notas del banco de pruebas

## Versiones exactas
| paquete | versión |
|---|---|
| `three` | 0.186.0 |
| `@dimforge/rapier3d-compat` | 0.20.0 |
| `vite` (build) | 8.3.0 |
| Node | 22.22.2 |
| Chromium | 1194 (headless, ANGLE + SwiftShader, WebGL2) |

Renderer: `WebGLRenderer` (WebGL2). **`WebGPURenderer` no es utilizable aquí**: `navigator.gpu`
es `undefined` en este contenedor, así que todo el render va por el backend WebGL2 clásico.

Build: `npx vite build` con `root: 'src'`, `base: './'`, `outDir: '../'`. El `index.html` de la
raíz del stack carga `./assets/index-*.js`. Salida 100 % estática y autocontenida (el WASM de
Rapier viaja en base64 dentro del bundle gracias a `-compat`, no hay fetch extra).

---

## Lo que está implementado

### Geometría (§1)
- Suelo 160×160 m exacto + **plano lejano de 1400 m y 26 volúmenes de skyline** añadidos por mí
  (no están en el contrato) porque si no el suelo termina en un canto contra el cielo y se ve
  el truco. Declarado aquí explícitamente.
- Charco/asfalto mojado 14×10 en (16, 0, 14): plano metálico rugosidad 0.04 con máscara alfa
  procedural + anillo de asfalto húmedo.
- Nave 24×16 m, muro 8 m, espesor 0.35 m, fachada +Z abierta con portón 10×6.
- Cubierta con **16 vigas** (13 perfiles en I de 24.4 m + 3 jácenas) más tirantes diagonales.
- Entreplanta 23.2×4.9 a y=4 en el lado −Z, con chapa lagrimada, barandilla (postes + 2 tubos +
  rodapié) y **escalera de 14 peldaños**.
- **4 pilares interiores** de hormigón 0.55×0.55×8.
- **10 ventanas** con vidrio transparente: 4 por muro lateral (±X) + 2 en el muro trasero. Los
  huecos son reales (el muro se construye por bandas y machones), no texturas.
- Suelo interior de hormigón pulido distinto del exterior + explanada de carga.
- Exterior: 4 contenedores/casetas, **89 tramos de valla** (chapa de tela metálica con alpha
  test + postes + 2 tubos corridos), **14 farolas** (base + poste + brazo + luminaria emisiva),
  y ~130 piezas de escombro (tablones, palés, cascotes, ladrillos, bidones tumbados, tubos,
  conos, cajas de plástico, bobinas de cable, pilas de neumáticos).

### Materiales (§2)
Todo procedural, generado en carga con ruido de valor + fbm + worley sobre `DataTexture`
(no hay canvas 2D de por medio; se escriben `Uint8Array` directamente). Por material se generan
tres mapas: **albedo (sRGB), normal tangente (sobel del campo de altura) y ORM** (R=AO,
G=roughness, B=metalness). 14 familias: asfalto, hormigón pulido, hormigón de muro, metal
pintado (2 tintes), óxido, madera, goma, plástico, chapa grecada (2 tintes), chapa lagrimada,
agua, cartel, tela metálica.

Dos decisiones que importan para el coste por píxel:
- El **AO se hornea en el albedo** y el `metalnessMap` sólo se monta en los materiales que de
  verdad son metal parcial. Con eso los dieléctricos hacen 3 fetches en vez de 5.
- Se añade un **break-up macro en espacio de mundo** (`onBeforeCompile`, 1 fetch reutilizado
  para albedo y roughness) sobre asfalto, hormigón de muro, suelo interior y chapa. Sin esto el
  teselado se ve a la legua.

### Iluminación y atmósfera (§3)
- Sol direccional con sombras (mapa 2048², frustum ±34 m, PCF).
- Cielo procedural (`Sky` de three, Rayleigh/Mie) **horneado una sola vez** en un cubemap para
  el fondo y en un PMREM para la IBL. Esto es una decisión de rendimiento importante: dejar el
  `Sky` en la escena significa ejecutar su fragment shader a pantalla completa cada frame, y en
  SwiftShader eso solo ya cuesta cientos de ms.
- Hemisférica de relleno + 6 luces locales: 4 lámparas de nave con geometría emisiva coherente,
  1 foco de obra sobre trípode, 1 luz de fuego parpadeante en el bidón, más la luz de fogonazo
  de las explosiones.
- `FogExp2` contenida (densidad 0.0021→0.0036) para dar profundidad sin borrar la escena.
- Haces de luz volumétricos falsos: 6 cajas con shader propio (atenuación por distancia y por
  silueta, aditivo) desde el portón y las ventanas.
- Post: `EffectComposer` → `RenderPass` → `UnrealBloomPass` (base 400×225) → `OutputPass`
  (ACES + sRGB) → **pase de gradación propio** (curva S de contraste, split-tone sombras frías /
  luces cálidas, saturación, viñeta y un suavizado direccional de bordes de 2 taps que sustituye
  a FXAA para ahorrar un pase completo).

### VFX (§4)
- **480 motas de polvo** en suspensión. Cumple el mínimo de 400. El color de cada mota se
  precalcula con una sonda de luz que traza el rayo al sol a través de los huecos reales de
  ventanas y portón y suma la caída de las lámparas, así que reaccionan a la iluminación de la
  escena en vez de ser puntos blancos.
- Columna de humo continua (150 partículas, animadas enteras en el vertex shader) saliendo del
  bidón encendido en (15.6, 1, −6.2).
- Chispas (360) en impactos fuertes: se detecta la caída brusca de velocidad de un cuerpo entre
  frames y se emite ahí. Más ráfagas en explosiones.
- Puffs de explosión (420) y ondas de choque expansivas.

### Física (§5)
- **120 cuerpos dinámicos iniciales exactos**: 45 cajas de madera de 0.8 m en 3 pirámides de 5
  niveles, 30 bidones, 15 esferas de acero, 30 neumáticos. Más cadena, cartel y un ragdoll ya
  tumbado → 145 cuerpos dinámicos en `idle`.
- Masas por densidad calculada: caja 18 kg (ρ 35.2), bidón 22 kg (ρ 86.5), esfera 190 kg
  (ρ 1058), neumático 9 kg (ρ 92). Fricción/restitución por material (madera 0.62/0.07,
  metal 0.38/0.16, acero 0.42/0.26, goma 0.95/0.52, hormigón 0.78/0.04).
- **Cadena de 12 eslabones** + gancho lastrado colgando de una viga, con `spherical joints`.
- **Cartel sobre bisagra** (`revolute` con límites ±0.85 rad) en la fachada.
- **Ragdoll de 11 cuerpos y 10 joints** (pelvis, torso, cabeza, 2×brazo sup/inf, 2×pierna
  sup/inf; columna, cuello, 2 hombros, 2 codos, 2 caderas, 2 rodillas).
- Paso fijo 1/60 con acumulador y tope de subpasos.

### API `__BENCH` (§6)
Completa, más dos extras no exigidos: `cpuFrameMs` y `counts`. Las fases nunca lanzan
(todo el cuerpo de `phase()` va en try/catch).

---

## Lo que NO está y por qué

- **SSAO / GTAO**: probado y descartado. Exige un pase de geometría extra a resolución completa
  más el pase de AO y el denoise; en SwiftShader eso multiplicaba el coste por frame sin aportar
  tanto como las sombras direccionales bien puestas. En su lugar: AO horneado en el albedo,
  oclusión de contacto vía sombra del sol y `envMapIntensity` por material.
- **Reflexión planar real en el charco**: sería un render extra de la escena. Se usa reflexión de
  la IBL con rugosidad 0.04.
- **Sombras en las luces locales**: cada point light con sombra añade un pase cubemap de 6 caras.
  Con 6 luces locales era inasumible. Las lámparas iluminan pero no proyectan sombra.
- **Transmisión física en el vidrio** (`MeshPhysicalMaterial.transmission`): obliga a un render
  adicional de la escena a un target. Se usa `MeshStandardMaterial` transparente con rugosidad
  baja y `envMapIntensity` alto.
- **Límites en los joints esféricos del ragdoll**: la API JS de Rapier expone `setLimits` sólo en
  `UnitImpulseJoint` (revolute/prismatic). `SphericalImpulseJoint` **no tiene `setLimits`**. Por
  eso hombros y caderas son esféricos libres y columna, cuello, codos y rodillas son revolute con
  límites reales (−2.15..0 en codos, 0..2.1 en rodillas, etc.). 6 de los 10 joints tienen límite
  angular explícito; los otros 4 quedan acotados por la anatomía y el amortiguamiento. Es una
  limitación del binding, no una decisión estética.
- **`WebGPURenderer` / TSL**: no disponible (sin `navigator.gpu`).

---

## Medidas (arnés neutral, 1280×720, SwiftShader)

`loadTimeMs` ≈ 9–10 s (generación de todas las texturas procedurales + `RAPIER.init()` +
220 pasos de asentamiento + `renderer.compile()` + 6 frames de precalentamiento para que ningún
frame medido sea una compilación de shader).

Estado de escena: **93 draw calls, ~81 k triángulos, 63 programas**, heap JS ~40 MB.
Cuerpos: 145 en idle → 445 tras `props` → 533 tras `ragdoll` → **781 en `chaos`** (778 despiertos).
Cero errores de consola, cero `fatal`, cero NaN tras el estrés.

### Aviso importante y honesto sobre el FPS
`stats().fps` devuelve **fps de reloj de pared** (intervalo real entre frames presentados),
no el tiempo de CPU del bucle. Son cosas muy distintas aquí: el coste de CPU por frame
(`cpuFrameMs`, campo extra que expongo) es de **6–20 ms**, mientras que el frame completo
tarda entre 0.9 y 3.5 s porque SwiftShader rasteriza en software y la escena es fill-bound.
Si otro stack mide `1000 / tiempo_de_CPU` reportará cifras de tres dígitos que no significan
lo mismo. **Para comparar de forma justa hay que comparar `cpuFrameMs` contra `cpuFrameMs`, o
fps de pared contra fps de pared.**

Segundo aviso: durante casi toda la sesión había **otro benchmark corriendo en paralelo** en
la misma caja de 4 núcleos (`tools/_probe_babylon.mjs`), lo que contamina las cifras de pared
(se ven p95 de varios segundos y ventanas de muestreo sin ningún frame completo). Las cifras
de `cpuFrameMs` y los contadores de draw calls / triángulos / cuerpos son estables y fiables;
las de fps de pared hay que tomarlas con pinzas y, idealmente, volver a medir en exclusiva.

---

## Dónde duele este stack (evidencia para la decisión)

1. **Forward rendering + luces analíticas.** En `MeshStandardMaterial` cada píxel evalúa *todas*
   las luces de la escena. Pasar de 6 a 11 point lights degradó el frame de forma muy visible.
   Con este renderer hay que presupuestar luces como si fuera 2010: no hay light culling por
   tile ni clustered. Esto es lo que más limita la ambición de iluminación.
2. **Coste por fetch de textura.** El filtrado anisotrópico es carísimo en software (8–16 taps
   por fetch). Hubo que bajar de 8× a 4× y eliminar `aoMap` y los `metalnessMap` innecesarios.
   En una GPU real esto sería irrelevante; aquí fue uno de los mayores ahorros.
3. **Cada pase de pantalla completa se paga entero.** Bloom + tonemap + gradación son tres
   barridos de 0.92 MP. Acabé fusionando el antialiasing dentro del pase de gradación para
   ahorrar uno. `EffectComposer` no ofrece fusión automática de pases: si quieres N efectos,
   pagas N barridos.
4. **`toneMapping` y espacio de color son fáciles de equivocar.** El error más caro de toda la
   sesión fue escribir reflectancias *lineales* en texturas marcadas como sRGB: todo salía entre
   5 y 10 veces demasiado oscuro y lo compensé subiendo luces, lo que reventó el rango dinámico
   y dejó la imagen lavada. three no avisa de nada. Hay que decidir explícitamente en qué espacio
   se autoran los mapas procedurales y codificar a mano (`lin2srgb`).
5. **`THREE.Euler` orden XYZ muerde.** `placed(geo, x,y,z, PI/2, yaw, 0)` ignora el yaw en la
   práctica porque la rotación en X se aplica la última. Eso metió barras de 68 m atravesando la
   escena (visibles como una cuña negra en cam1) hasta que las localicé con una sonda que apaga
   objetos uno a uno y lee un píxel con `readPixels`. Error mío, pero es un pie del que este API
   se deja pisar con mucha facilidad.
6. **`mergeGeometries` es quisquilloso**: falla si mezclas geometrías indexadas y no indexadas
   (`DodecahedronGeometry` no está indexada, `BoxGeometry` sí) y el mensaje de error sólo dice el
   índice del array. Hay que normalizar a mano.
7. **`PCFSoftShadowMap` fue eliminado en r186** y three lo degrada a `PCFShadowMap` con un
   warning. La suavidad de sombra hay que buscarla por `VSM` (más caro) o asumir PCF duro.
8. **`SphericalImpulseJoint` sin límites** (ver arriba). Es la carencia más molesta de Rapier
   para ragdolls; en Bullet o PhysX se resuelve con cone-twist.
9. **Blending aditivo**: three multiplica por `srcAlpha`, así que emitir `vec4(color*a, a)`
   eleva la contribución al cuadrado y los efectos salen casi invisibles. Hay que emitir
   `vec4(color*a, 1.0)`. No está documentado de forma evidente.

## Lo que sí funciona muy bien
- **Rapier es sólido.** 781 cuerpos dinámicos, 3 explosiones encadenadas, 17 ragdolls con 170
  joints y una cadena de 12 eslabones, con paso fijo, y ni un NaN ni jitter perceptible. El
  coste de `world.step()` se mantiene en el orden de los pocos ms. Es la parte del stack de la
  que menos me preocuparía.
- **`InstancedMesh` + geometría fusionada** dejan toda la escena en 93 draw calls con ~900
  objetos visibles. El pipeline de three escala bien en número de objetos; lo que no escala es
  el coste por píxel.
- La generación procedural de texturas en `DataTexture` es rápida (todas las familias en menos
  de 2 s) y da microdetalle real sin assets.
