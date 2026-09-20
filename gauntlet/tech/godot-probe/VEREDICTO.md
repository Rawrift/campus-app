# Sonda de viabilidad: Godot 4 → Web (WASM) en este contenedor

Fecha: 2026-09-20 · Directorio: `/home/user/campus-app/gauntlet/tech/godot-probe/`
Todo lo que sigue son comandos ejecutados y salidas reales de esta máquina. Nada está supuesto.

---

## 0. Entorno verificado

```
$ df -h .            → /dev/vda 252G, 30G libres (28G tras la sonda)
$ nproc              → 4
$ free -g            → 15 GB RAM
$ /opt/pw-browsers/chromium --version → Chromium 141.0.7390.37
                       (symlink → /opt/pw-browsers/chromium-1194/chrome-linux/chrome)
$ node -v            → v22.22.2 ; playwright en /home/user/campus-app/node_modules/playwright
```

Corrección a la premisa del briefing: **`navigator.gpu` SÍ está definido** en este Chromium
(`typeof navigator.gpu === "object"`, medido dentro de la página). Da igual para Godot,
que en web no usa WebGPU en ningún caso.

Acceso a red: la API de GitHub está bloqueada por el proxy…

```
$ curl -sSL https://api.github.com/repos/godotengine/godot/releases/latest
{"message":"GitHub access to this repository is not enabled for this session. Use add_repo…"}
```

…pero **los assets de release sí descargan** (redirigen a `release-assets.githubusercontent.com`):

```
$ curl -sSL -I -o /dev/null -w "%{http_code}" .../4.5.1-stable/Godot_v4.5.1-stable_linux.x86_64.zip
200
```

---

## 1. Descarga e instalación (FUNCIONÓ)

```
$ curl -sSL -o dl/godot_editor.zip https://github.com/godotengine/godot/releases/download/\
4.5.1-stable/Godot_v4.5.1-stable_linux.x86_64.zip
editor_zip_seconds=1        69.572.744 B  (66 MiB)

$ curl -sSL -o dl/templates.tpz https://github.com/godotengine/godot/releases/download/\
4.5.1-stable/Godot_v4.5.1-stable_export_templates.tpz
templates_seconds=7         1,3 GB

$ unzip -o -q -j dl/templates.tpz "templates/web*" "templates/version.txt" \
    -d $HOME/.local/share/godot/export_templates/4.5.1.stable
extract_s=1                 80 MB (solo las 8 variantes web)

$ ./bin/Godot_v4.5.1-stable_linux.x86_64 --headless --version
4.5.1.stable.official.f62fdbde1
```

El binario estándar de Linux funciona con `--headless`; **no hace falta la build "server"**.
Extrayendo solo `templates/web*` el `.tpz` de 1,3 GB se puede borrar después (hecho).

## 2. Proyecto mínimo y export (FUNCIONÓ)

Tres ficheros de texto escritos a mano, **sin abrir nunca el editor gráfico**:
`project/project.godot`, `project/main.tscn`, `project/main.gd`, más `project/export_presets.cfg`.
Escena: suelo 40×40 + 4 muros (StaticBody3D), `DirectionalLight3D` con sombras (mapa 2048),
`WorldEnvironment` con cielo procedural + tonemap ACES, cámara, y 50 `RigidBody3D`
(cajas y esferas) con `StandardMaterial3D` PBR (metallic/roughness/specular) generados por script.

```
$ ./bin/Godot_v4.5.1-stable_linux.x86_64 --headless --path project --import
[ DONE ] first_scan_filesystem              import_ms=7073   (en frío, una sola vez)

$ ./bin/Godot_v4.5.1-stable_linux.x86_64 --headless --path project --export-release "Web" ../web/index.html
[ DONE ] savepack                            export_ms=6129   (primera vez)
                                             export_only_ms_run1=5111 / run2=4934 (en caliente)
```

`export_presets.cfg` escrito a mano funcionó a la primera (Godot rellena las claves ausentes).
Preset con `variant/thread_support=true`.

### Tamaño del payload web

| fichero | bytes |
|---|---|
| `index.wasm` | 37.322.260 |
| `index.js` | 358.024 |
| `index.pck` (todo el juego) | 11.480 |
| **suma wasm+js+pck** | **37.691.764 (35,9 MiB)** |
| directorio completo (con iconos y audio worklets) | 37.746.570 |
| `gzip -9` del wasm | **9.242.749 (8,8 MiB)** |

Dato relevante: el `.wasm` es **el template, idéntico entre builds**
(`md5sum web/index.wasm web-fwd/index.wasm` → mismo hash `147bc098…`).
Solo cambia el `.pck` (11 KB). Con `Cache-Control` correcto, el coste por iteración en red es trivial.

## 3. Ejecución en Chromium headless (FUNCIONÓ, CON SOMBRAS Y PBR)

Servidor propio `serve.py` con aislamiento de origen cruzado:

```
$ curl -sS -D- -o /dev/null http://127.0.0.1:8791/index.html
HTTP/1.0 200 OK
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Playwright con `--no-sandbox --enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader`:

```json
{ "loadMs": 139, "readyMs_fromNav": 2621,
  "env": { "crossOriginIsolated": true, "hasSAB": true, "gpu": "object" },
  "stats": { "canvas": {"w":1280,"h":720}, "readyMs": 2111.6, "firstFramesMs": 4282.1,
             "webgl": {"version":"WebGL 2.0 (OpenGL ES 3.0 Chromium)"} } }
--- browser logs ---
[console.log] Godot Engine v4.5.1.stable.official.f62fdbde1
[console.log] OpenGL API OpenGL ES 3.0 (WebGL 2.0 (OpenGL ES 3.0 Chromium)) - Compatibility - Using Device: WebKit
[console.log] Build configuration: Emscripten 4.0.10, multi-threaded, no GDExtension support.
[console.error] Blocking on the main thread is very dangerous, see …pthreads.html
```

- COOP/COEP → `crossOriginIsolated: true`, `SharedArrayBuffer` disponible, template **multi-threaded** arrancó.
- **Arranque**: HTML en ~75–139 ms; `_ready()` a **1,1–2,6 s** desde la navegación;
  **primeros 5 frames pintados a 2,4–4,3 s**.
- `no GDExtension support` en el template con hilos: nada de módulos nativos (Jolt custom, etc.).

### Renderer: Forward+ NO existe en web (comprobado, no supuesto)

Exporté una segunda build con `renderer/rendering_method="forward_plus"` en `project.godot`.
Godot **no falla ni avisa: lo ignora**. El log del navegador de esa build es idéntico
(`… - Compatibility - …`) y el render píxel-a-píxel equivalente.
En web solo existe **Compatibility (GLES3 sobre WebGL2)**. Consecuencia directa:
sin SSAO/SSIL, sin SDFGI, sin reflejos en espacio de pantalla, sin niebla volumétrica.
Sí hay glow, sombras direccionales, PBR, MSAA. El techo visual de Godot-web es,
en la práctica, el mismo que uno se escribe a mano en Three.js.

### Capturas

**`shots/01-compat.png`** (1280×720, 50 cuerpos, glow ON) — *Renderiza correctamente.*
Se ve un recinto: suelo gris-azulado grande con muros bajos alrededor, un montón de ~50 cubos
y esferas de colores saturados (rojo, azul, amarillo, verde, violeta) apilados en el centro,
algunos aún cayendo en el aire. **Sombras direccionales nítidas proyectadas sobre el suelo**,
especulares claramente visibles en las esferas metálicas, degradado de cielo procedural arriba.
La iluminación está lavada (ambiente de cielo + ACES + glow) pero es una escena 3D PBR real.

**`shots/02-forwardplus.png`** — idéntica en calidad a la anterior: prueba de que `forward_plus` se ignora.

**`shots/03-iter150.png`** (tras editar SOLO ficheros de texto: 150 cuerpos, cámara nueva,
luz 1.6→2.4) — cámara ahora en picado lateral, se ve el borde del recinto, mucha más
densidad de cuerpos, **sombras largas y bien definidas**, especulares más intensos.
Confirma que editar `.tscn`/`.gd` como texto cambia la escena sin tocar el editor.

**`shots/05-640x360.png`** — misma escena a 640×360, correcta, con sombras.

**`shots/06-three-1280.png`** — baseline Three.js (ver §5): 50 cuerpos, `MeshStandardMaterial`,
sombras PCF soft 2048, tonemap ACES. Calidad visual comparable.

### Rendimiento real bajo SwiftShader (sin GPU)

| build | resolución | cuerpos | glow | FPS medido |
|---|---|---|---|---|
| Godot Compatibility | 1280×720 | 150 | sí | **2** |
| Godot Compatibility | 1280×720 | 50 | no | **4** |
| Godot Compatibility | 640×360 | 50 | no | **8** |

Es limitado por *fill rate* de SwiftShader (÷4 píxeles ≈ ×4 FPS), no por física.

## 4. Iterabilidad por agente

**Sí, 100 % por CLI y ficheros de texto.** Nunca se abrió el editor gráfico.
Cambié `const BODY_COUNT: int = 50` → `150` en `main.gd` con `sed`, la `Transform3D` de la
cámara y `light_energy` en `main.tscn`, y el resultado apareció en la captura.

Ciclo completo medido (`iterate.sh`: export → Chromium headless → PNG):

```
=== CYCLE START ===
FULL_CYCLE_MS=22414
```

Desglose: `--export-release` ≈ **5,0 s** · lanzar Chromium + cargar + primer frame ≈ **3–4 s** ·
el resto (≈10 s) es la espera deliberada para que la física se asiente.
**Suelo realista del ciclo: 10–12 s.** No hace falta re-importar salvo si se añaden assets nuevos.

### El problema serio de la iteración: no hay control de frame

Godot-web corre en el bucle del navegador y **el agente no puede pedir "avanza 120 ticks de
física y pinta un frame"**. A 2–8 FPS, Godot limita los pasos de física por frame
(`max_physics_steps_per_frame`), así que el **tiempo simulado avanza mucho más lento que el
tiempo de pared y de forma no determinista**. Dos ejecuciones del mismo build dan pilas distintas
(compárense `01-compat.png` y `02-forwardplus.png`: mismo `RNG_SEED`, mismo código, disposición
final distinta). Para un bucle "capturar → juzgar → mejorar" eso significa que el agente no
puede distinguir un cambio de diseño de ruido temporal.

## 5. Baseline de control: Three.js en el MISMO navegador

Escena equivalente (50 cuerpos, `MeshStandardMaterial` metallic/roughness, `DirectionalLight`
con `PCFSoftShadowMap` 2048, `ACESFilmicToneMapping`), mismos flags de Chromium:

| | Godot 4.5.1 web | Three.js r169 |
|---|---|---|
| payload sin comprimir | **37,7 MB** | **1,31 MB** |
| payload gzip | **~9,3 MB** | **0,26 MB** |
| listo para pintar (desde navegación) | **1,1–2,6 s** | **0,14–0,21 s** |
| FPS 1280×720 (50 cuerpos, sin glow) | **4** | **15** |
| FPS 640×360 | **8** | **30** |
| ciclo build→captura | **~10–12 s** (export obligatorio) | **~2–3 s** (no hay build) |
| control de frame por el agente | no | sí (`renderer.render()` a mano) |
| requiere COOP/COEP | sí (para hilos) | no |
| toolchain a instalar | 1,4 GB descarga + 210 MB en disco | un fichero de 1,3 MB |

(El baseline Three.js usa un integrador trivial en vez de un motor de física; a 50–150 cuerpos
la física es despreciable frente al coste de fragmentos de SwiftShader en ambos casos.
Rapier-WASM o cannon-es cubren esa parte por ~1 MB extra.)

---

## VEREDICTO: **VIABLE CON RESERVAS — pero INFERIOR a JS (Three/Babylon/PlayCanvas) para ESTE entorno y ESTE flujo de trabajo**

**Qué funcionó, sin excepción:** descarga del editor y templates, import y export por CLI sin
editor gráfico, servidor con COOP/COEP, arranque real en Chromium headless con SwiftShader,
render 3D correcto con sombras direccionales y materiales PBR, hilos activos, captura PNG,
y edición de la escena tocando solo ficheros de texto. **Godot 4 web es técnicamente viable aquí.**

**Por qué aun así no lo elegiría:**

1. **El techo visual es el mismo, no superior.** En web Godot solo ofrece Compatibility:
   sin SSAO, SDFGI, SSR ni volumétricos. Todo lo que queda (PBR, sombras, glow, tonemapping)
   se escribe igual en Three.js. Se paga el peso de un motor completo sin recibir a cambio
   el pipeline que lo justificaría.
2. **40× más payload y 10× más lento en arrancar** (37,7 MB / 2,1 s vs 1,3 MB / 0,2 s).
3. **3–4× menos FPS bajo SwiftShader** con escenas equivalentes (4 vs 15 a 720p). En un
   contenedor sin GPU eso decide cuántas capturas por minuto puede juzgar el agente.
4. **Rompe el requisito duro de iteración determinista.** El agente no controla el frame:
   a 2–8 FPS la física avanza de forma dependiente del reloj y dos ejecuciones del mismo build
   difieren. En JS el agente hace `world.step()` N veces y `renderer.render()` una vez, y la
   captura es reproducible bit a bit. Esto, por sí solo, es descalificante para "build → capturar
   → juzgar → mejorar".
5. **Ciclo 4–5× más lento** (10–12 s con export obligatorio vs 2–3 s de editar y recargar),
   y cero *hot reload*.
6. **`no GDExtension support`** en el template con hilos: no se puede extender en nativo.

**Cuándo sí valdría la pena Godot:** si el objetivo real fuese un build de escritorio/consola
con Forward+ (Vulkan) y la web solo una demo secundaria. No es el caso descrito.

**Recomendación:** desarrollar directamente en JS (Three.js + Rapier-WASM, o Babylon.js si se
quiere un motor con más batería incluida). Se conserva el control de frame, la captura determinista,
el ciclo de 2–3 s y un payload dos órdenes de magnitud menor, sin renunciar a nada de la calidad
visual que este entorno puede realmente rasterizar.

---

## Reproducir

```bash
cd /home/user/campus-app/gauntlet/tech/godot-probe
# (el .tpz y el .zip se borraron tras instalar; re-descargar si hace falta:)
# curl -sSL -o dl/godot_editor.zip https://github.com/godotengine/godot/releases/download/4.5.1-stable/Godot_v4.5.1-stable_linux.x86_64.zip
# curl -sSL -o dl/templates.tpz    https://github.com/godotengine/godot/releases/download/4.5.1-stable/Godot_v4.5.1-stable_export_templates.tpz
python3 serve.py 8791 web &          # COOP/COEP
./iterate.sh shots/nueva.png 8000    # export + captura
python3 serve.py 8793 three &        # baseline Three.js
node shot3.js "http://127.0.0.1:8793/index.html?n=50" shots/three.png 8000
```

Ficheros: `serve.py` (COOP/COEP), `shot.js` (Playwright+Godot), `shot3.js` (Playwright+Three),
`iterate.sh` (ciclo completo), `project/` (proyecto Godot en texto), `web/` (export),
`web-fwd/` (export con forward_plus, prueba de que se ignora), `three/` (baseline), `shots/`, `logs/`.
