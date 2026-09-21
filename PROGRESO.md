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
| Three.js + Rapier3D | medido (imagen en corrección) |
| Babylon.js 9 + Havok | en construcción |
| PlayCanvas 2.x + física | medido |
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


---

## ⚠ RETRACTACIÓN: las primeras mediciones del Gauntlet 001 no eran válidas

La tabla que aparece debajo **se publicó con cifras falsas** y se conserva tachada como
registro del error. Dos defectos, ambos míos:

**1. El arnés se fiaba del FPS que declaraba cada candidato.** Cada builder implementaba
`stats().fps` a su manera. El candidato Three devolvía `1000 / msCPU`, que no es FPS sino el
inverso del tiempo de CPU por fotograma. El candidato PlayCanvas devolvía FPS de reloj de
pared. **Comparé dos magnitudes distintas** y de ahí salió el ridículo "290 fps contra 1,4".
Medido bien, Three está en 0,3-1,1 fps de reloj de pared con 8-23 ms de CPU por fotograma: la
diferencia real entre ambos es mucho menor de lo que publiqué, y el orden está por decidir.

**2. Las mediciones no se hicieron en exclusiva.** Mientras medía, un agente ejecutaba su
propio benchmark: un Chrome al 356 % de CPU sobre 4 núcleos, carga media 4,4. Comprobado
empíricamente: un stub que da ~60 fps en exclusiva dio **32** en esas condiciones. Todas las
cifras de reloj de pared de esa tanda están contaminadas.

Lo que **sí** sigue siendo válido de aquella tanda, porque no depende del reloj: triángulos,
draw calls, cuerpos físicos simulados, ausencia de errores de consola y el juicio visual.

**Correcciones aplicadas al método (`tools/bench.mjs`):**
- El arnés instala **su propio bucle rAF**, idéntico para todos, y cuenta los fotogramas que
  el navegador presenta de verdad. Lo que declara el candidato se guarda aparte, en
  `declarado`, y **nunca se mezcla** con la medición.
- **Guarda de exclusividad**: antes de medir comprueba carga media y navegadores ajenos
  activos, y **aborta** si el contenedor no está libre. Abortar es mejor que publicar una
  comparación falsa. Se puede forzar con `BENCH_FORZAR=1`, y entonces el informe queda marcado
  como no comparable.

El gauntlet se remide entero, en exclusiva y con el arnés corregido, cuando los tres
candidatos estén terminados.

---

## ~~Mediciones del Gauntlet 001~~ (RETRACTADAS — ver arriba)

Ejecutadas por el agente líder con `tools/bench.mjs`, no por los builders. Secuencialmente,
nunca en paralelo: bajo rasterizado software dos procesos compitiendo por 4 núcleos falsearían
la comparación.

| Métrica | Three.js + Rapier | PlayCanvas + Ammo |
|---|---|---|
| FPS cámaras (idle) | **247 – 290** | 0,5 – 1,4 |
| FPS fase props (445/450 cuerpos) | 146 | 1,25 |
| FPS fase explosión | 69 | 0,49 |
| FPS fase ragdoll | 54 | 0,48 |
| FPS fase caos | **59** (781 cuerpos, 778 activos) | 1,17 (626 cuerpos) |
| Triángulos | 80 437 | 362 026 |
| Draw calls | 85 | 167 |
| Payload real (gzip) | 1,19 MB | 1,04 MB |
| Tiempo hasta `ready` | 8,7 s | 6,8 s |
| Errores de consola | **0** | **0** |

Notas de honestidad sobre estas cifras:

- PlayCanvas dibuja 4,5x más triángulos, pero eso no explica ser 50x más lento. Bajo
  SwiftShader domina el coste de shader y de relleno, y el pipeline PBR por defecto de
  PlayCanvas es mucho más caro por píxel. En una GPU real la distancia se estrecharía; el
  orden, no.
- Ambos candidatos se midieron **a medio terminar**: sus builders se cortaron por un límite de
  API. Las cifras de física y coste son válidas; el juicio visual todavía no es justo y por eso
  no se ha emitido.
- Corrección de una medición propia anterior: un `find` mal formado me dio un payload de 2 GB
  de wasm para Three. Es falso — Rapier-compat embebe el wasm en base64 dentro del JS y no hay
  `.wasm` suelto. Las cifras de la tabla son las buenas.

### Estado visual (mirado, no supuesto)

- **Three.js**: la niebla y la exposición lavan la escena a blanco. Hay estructura real (nave,
  farolas, contenedores, bidones, valla, columna de humo, asfalto mojado) pero sin contraste ni
  color, con teselado de suelo evidente y el charco como un rectángulo negro.
- **PlayCanvas**: la nave es una caja negra sin interior legible, el suelo tiene un patrón de
  manchas desagradable y hay un contenedor rojo/verde que rompe la dirección artística.

Ninguno de los dos pasa todavía el listón. Ambos builders han sido reanudados con el encargo
de corregir su mayor delta, que en los dos casos es **la imagen**, no el rendimiento.

---

## Componente: biblioteca de materiales PBR procedurales

**Referencia usada:** materiales reales a 1 m de distancia (hormigón con árido visible, veta de
madera, costra de óxido, goma mate). **Punto de partida a batir:**
`gauntlet/results/three-rapier/cam3.png`, donde el hormigón era gris plano con puntitos, las
cajas no tenían veta y los neumáticos parecían plástico.

**Capturas:** `gauntlet/results/materiales/` (arnés neutral, 24 materiales + 7 calcomanías).

**Técnica que marca la diferencia (y por qué importa):** dos pasadas WebGL2. La receta escribe
altura, color, rugosidad, metálico y cavidad; la segunda pasada **deriva de la forma**: normal
por Sobel, oclusión por 14 muestras en espiral áurea, curvatura por laplaciano. Con eso la
suciedad se deposita **donde hay cavidad** y la pintura salta **donde la curvatura es convexa**.
Eso es lo que separa un material creíble de uno falso: el desgaste está correlacionado con el
relieve, no superpuesto como ruido independiente. El mismo mecanismo con el signo invertido da
el asfalto mojado (el agua llena los huecos y les baja la rugosidad a 0,045).

**Juicio propio, mirando las capturas:**

Lo conseguido — hormigón desconchado con árido y pasta de cemento visibles, óxido con costra
celular convincente, madera con veta real en tabla y contrachapado, ladrillo con suciedad en la
junta, grava, asfalto. Es un salto grande respecto al punto de partida.

Defectos que quedan, anotados sin adornos:
1. **Pellizco polar en las esferas del visor**: destello azul/blanco en el polo de chapa
   ondulada, aluminio rayado y vidrio sucio. Es artefacto de la proyección equirectangular del
   visor, no del material, pero corrompe el juicio.
2. **La goma lee como negro plano**, sin microrrelieve perceptible.
3. **Manchas especulares quemadas** en metal oxidado y aluminio rayado.
4. **Las etiquetas del visor no identifican de forma fiable qué material es cuál** (se solapan
   en espacio de pantalla). Es un defecto del instrumento de juicio, no del producto, y limita
   lo que puedo concluir del visor.
5. El propio constructor deja anotado: hormigón liso algo plano a media distancia y la
   calcomanía de grieta demasiado tenue.

**Decisión:** se acepta como base y se integra. Seguir puliendo materiales dentro de un visor
sintético tiene rendimiento decreciente: el juicio que vale es cómo se ven **en el juego**,
sobre la geometría real, con la iluminación real. Los defectos 1 y 4 son del visor y
desaparecen al integrar; 2 y 3 se reevalúan en situ.

**Dato de rendimiento, honesto:** el despacho JS de las 24 familias es ~240 ms, pero el ciclo
completo en este contenedor tarda ~25 s porque rasteriza por CPU con SwiftShader. El objetivo
de "<4 s a 1024" es un objetivo de GPU y **aquí no es medible**: no se da por cumplido.

---

## Bucle de crítica sobre el interior de la nave

Método: construir → ejecutar el juego → capturar → **juicio ciego por un crítico con contexto
limpio, que no sabe qué versión es cuál ni qué se cambió** → corregir el mayor delta → repetir.
Las claves de cada A/B están en `gauntlet/_claves/`, fuera del alcance del crítico.

| # | Cambio | Elegida a ciegas | Nota | Mayor delta detectado |
|---|---|---|---|---|
| 1 | Densidad de textura en espacio de mundo | la nueva | 3,5/10 | "El muro es una foto repetida, no arquitectura" |
| 2 | Muros articulados + rotura del teselado | la nueva | 4/10 | "La luz no está ocluida; las cajas parecen calcomanías" |
| 3 | Oclusión ambiental (GTAO) + gradación | _pendiente_ | — | — |

### Iteración 1 — el hormigón parecía camuflaje
Causa raíz: no era la receta del material sino la escala. Una `BoxGeometry` da UV de 0..1 en
cada cara mida 0,4 m o 26 m, así que el mismo hormigón salía 65 veces más estirado en un muro
que en una caja, y su variación de baja frecuencia se convertía en manchones.
Corrección: UV reescritos según las dimensiones reales, en metros por tesela.

### Iteración 2 — el muro era una foto repetida
El crítico: _"la misma placa se repite en cuadrícula, las mismas manchas en la misma posición;
el ojo detecta el patrón en medio segundo"_, y añadió que el relieve sube más que cualquier
retoque de luz. Corrección: variación macro ligada a la posición en el mundo (dos teselas
contiguas dejan de ser idénticas aunque compartan textura) + muros articulados con zócalo
saliente, pilastras cada 4,3 m y franja alta de chapa nervada.

### Iteración 3 — la luz no estaba ocluida
El crítico: _"la zona bajo el altillo brilla casi igual que el suelo abierto; ninguna pila de
cajas tiene contacto oscuro en su base, parecen calcomanías apoyadas"_.

Investigándolo apareció **un fallo mayor que el señalado**: el juego estaba fijado a las 18:24
con ocaso a las 18:00, es decir **con el sol por debajo del horizonte**. No había luz
direccional en absoluto; la escena se sostenía solo con el relleno hemisférico. Corregido a
las 17:06 y añadido un aviso si la altura solar baja de 0,12.

Pero el diagnóstico del crítico seguía siendo correcto por otra razón: el tejado es opaco, así
que el interior **no recibe sol aunque lo haya**, y queda bañado por ambiental uniforme que
llega igual al rincón que al centro. La solución correcta no era más sombras sino **oclusión
ambiental**: GTAO más un pase de gradación con curva S, viñeta y grano.
