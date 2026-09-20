# @fragua/materiales

Biblioteca de **materiales PBR procedurales** para el sandbox 3D. Genera los mapas en
tiempo de carga con **WebGL2 fuera de pantalla** y no depende de ningún motor 3D:
no importa `three`, `babylon` ni nada parecido. La salida son `ImageBitmap`
(o `HTMLCanvasElement`) y datos planos; el motor que los consuma decide qué hacer con ellos.

```js
import { crearMaterial, MATERIALES } from './src/index.js';

const m = await crearMaterial('hormigon_rugoso', { resolucion: 1024, semilla: 7, escala: 2 });
// m.albedo · m.normal · m.rugosidad · m.metalico · m.oclusion · m.altura   (teselables)
// m.fisica.densidad, m.fisica.friccion, m.fisica.sonidoImpacto, ...
```

---

## 1. Cómo está hecho

La generación son **dos pasadas** sobre un triángulo a pantalla completa:

**Paso A — campo del material.** La receta del material (GLSL) evalúa una función
`campo(uv)` que devuelve altura, color base, rugosidad, metálico, cavidad, y *cuánta*
suciedad admite cada punto y *de qué color*. Se escribe en 3 destinos `RGBA16F` (MRT).

**Paso B — composición.** Lee ese campo y deriva lo que depende de la **forma**:

| Qué | Cómo |
|---|---|
| Normal | Sobel 3×3 sobre el mapa de altura, espacio tangente, +Y arriba |
| Oclusión | 14 muestras en espiral de ángulo áureo sobre la altura: horizonte medio real |
| Curvatura | Laplaciano a radio 4 téxeles → distingue canto convexo de hueco |
| **Suciedad** | Se deposita donde hay **cavidad** (oclusión baja o concavidad), nunca de forma independiente del relieve |
| **Desgaste de canto** | La pintura salta y el metal se pule donde la **curvatura es convexa** |

Esa es la razón de que el óxido nazca en las juntas, la suciedad se meta en el fondo del
tejido de la lona y en la junta del ladrillo, y la pintura falte justo en las aristas.
No es ruido superpuesto: está correlacionado con el mapa de altura.

El mismo mecanismo, con el signo cambiado, produce el **asfalto mojado**: ahí la
"suciedad" es agua, y en vez de subir la rugosidad a 0,95 la baja a 0,045, así que los
charcos aparecen exactamente en los huecos del aglomerado.

**Teselado.** Todo el ruido es periódico por construcción: cada función recibe su periodo
en celdas de retícula y la lacunaridad está fijada a 2, de modo que el campo es
exactamente periódico en `uv`. Las texturas intermedias usan `REPEAT`, así que las
normales y la oclusión de los bordes también se calculan sin costura.

**Determinismo.** `semilla` es un entero; se convierte en un desplazamiento del campo de
ruido con un hash fijo. La misma semilla da la misma imagen, píxel a píxel.

---

## 2. API

### `crearMaterial(nombre, opciones?) → Promise<Material>`

| Opción | Por defecto | Qué hace |
|---|---|---|
| `resolucion` | `1024` | Lado en píxeles; se redondea a potencia de 2. `512` = calidad baja |
| `semilla` | `0` | Determinista |
| `escala` | según material | Repeticiones enteras del patrón dentro del tile |
| `formato` | `'bitmap'` | `'bitmap'` (`ImageBitmap`) o `'canvas'` |
| `relieve` | según material | Altura pico-a-pico en metros |
| `uniformes` | `{}` | Sobrescribe parámetros de la receta (p. ej. `uPintura`) |

Devuelve `{ nombre, etiqueta, grupo, resolucion, semilla, escala, albedo, normal,
rugosidad, metalico, oclusion, altura, fisica, ajustes }`.

> Los mapas grises (`rugosidad`, `metalico`, `oclusion`, `altura`) llevan el valor
> replicado en R, G y B: se pueden subir tal cual o empaquetar en un solo RGBA.

### `crearCalcomania(nombre, opciones?) → Promise<Calcomania>`

Devuelve `{ color, normal, ard }`. `color` es **RGBA** con alfa real; `ard` empaqueta
`(oclusión, rugosidad, metálico)` en R, G, B y repite el alfa en A.

### Otras

```js
crearBiblioteca(opts)   // Map con las 24 familias, reutilizando los mismos buffers
crearCalcomanias(opts)  // Map con las 7 calcomanías
listarMateriales()      // [{nombre, etiqueta, grupo}]
listarCalcomanias()
fisicaDe(nombre)        // propiedades físicas (copia)
masaDe(nombre, m3)      // kg para un volumen dado
estadisticas()          // { materiales, msGenerado }
liberar()               // suelta el contexto WebGL2 y todos los buffers
```

---

## 3. Catálogo (24 familias)

### Minerales
| Clave | Qué es | Detalle característico |
|---|---|---|
| `hormigon_liso` | Encofrado visto | Moteado mineral, burbujas de aire irregulares, microfisuras finas, marcas de encofrado |
| `hormigon_rugoso` | Árido visto | Guijarros de tres calibres, pasta de cemento arenosa, árido menos rugoso que la pasta |
| `hormigon_desconchado` | Piel saltada | Desconchones con árido expuesto, grietas radiales, óxido de armadura y regueros |
| `asfalto` | Aglomerado | Piedra de tres calibres sobre betún, huecos, fisuras de fatiga, cuarcita clara |
| `asfalto_mojado` | Tras la lluvia | Charcos en los huecos (rugosidad 0,045), sustrato saturado, iridiscencia de gasoil |
| `ladrillo` | Aparejo a soga | 4×12 piezas, tono por ladrillo, mortero con arena, eflorescencias, suciedad en la junta |
| `yeso` | Enlucido | Pasadas de llana, filo de la herramienta, pinchazos de aire, pelos de fisura, parcheos |
| `tierra` | Suelo | Terrones a tres escalas, chinas, grietas de desecación, raicillas |
| `grava` | Zahorra | Cuatro calibres resueltos por altura, color y rugosidad por piedra, finos y polvo calizo |

### Metales
| Clave | Qué es | Detalle característico |
|---|---|---|
| `metal_pintado` | Chapa pintada | Piel de naranja, saltados en zonas de roce, óxido que nace en el saltado y chorrea |
| `metal_oxidado` | Acero corroído | Frente de óxido deformado, escamas con escalón, picaduras, tres estratos de color |
| `acero_cepillado` | Inoxidable | Cepillado anisótropo a tres escalas, surcos, huellas de dedos, rugosidad direccional |
| `chapa_ondulada` | Grecada galvanizada | Perfil trapezoidal, cristal de zinc (*spangle*), tornillos, óxido en el valle |
| `aluminio_rayado` | Aluminio usado | Red de arañazos en cuatro escalas, alúmina pulverulenta, golpes |
| `oxido_fuerte` | Corrosión consumada | Láminas con escalones reales, cráteres, costra, sin componente metálica |
| `pintura_desgastada` | Tres capas | Acabado → imprimación rojo óxido → acero, craquelado, escamas con borde rizado |

### Maderas
| Clave | Qué es | Detalle característico |
|---|---|---|
| `madera_tabla` | Tabla de pino | Anillos deformados con arcos de catedral, nudos que curvan el hilo, fibra fina, clavos con cerco |
| `madera_contrachapado` | Chapa desenrollada | Veta muy abierta, parches ovalados, microfisuras de desenrollo, lijado |
| `madera_pale` | Madera de palé | Marcas de sierra circular, plateado de intemperie, fendas, astillas, clavos oxidados |

### Sintéticos
| Clave | Qué es | Detalle característico |
|---|---|---|
| `vidrio_sucio` | Cristal industrial | Rugosidad de 0,035 a 0,6: polvo, regueros de lluvia que limpian, cercos de cal, barridos de trapo |
| `goma` | Caucho | Albedo 0,05, granulado del molde, línea de partición, velo de ceras, zonas pulidas por roce |
| `plastico` | ABS inyectado | Texturado VDI, líneas de flujo, rechupes, rayones que blanquean, amarilleo UV |
| `lona` | Toldo | Tejido a la plana real (urdimbre/trama alternando), pliegues, fibra pelada en la cresta |
| `carton` | Corrugado | Fibra de papel multiescala, onda que marca el liner, zona reventada, humedad, tinta |

### Calcomanías (RGBA)
`impacto_bala_metal` · `impacto_bala_hormigon` · `quemadura` · `grieta` ·
`mancha_aceite` · `salpicadura_agua` · `hollin`

Cada una trae además normal y `ard`, así que un impacto de bala deforma la superficie
y cambia su rugosidad, no solo la pinta.

---

## 4. Propiedades físicas

Las lee todo el juego: masa, fricción, fuego, electricidad, rotura y audio.

| Material | Densidad kg/m³ | Fricc. | Restit. | Dureza | Inflam. | Conduct. | Fragil. | Rotura | Sonido |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|
| hormigon_liso | 2350 | 0,72 | 0,12 | 0,78 | 0,00 | 0,02 | 0,55 | desconchar | hormigón 180 Hz |
| hormigon_rugoso | 2320 | 0,88 | 0,10 | 0,76 | 0,00 | 0,02 | 0,58 | desconchar | hormigón 172 Hz |
| hormigon_desconchado | 2280 | 0,90 | 0,09 | 0,62 | 0,00 | 0,03 | 0,70 | fragmentar | hormigón 158 Hz |
| asfalto | 2240 | 0,95 | 0,06 | 0,48 | 0,18 | 0,01 | 0,30 | agrietar | sordo 120 Hz |
| asfalto_mojado | 2260 | 0,42 | 0,05 | 0,48 | 0,04 | 0,25 | 0,30 | agrietar | sordo 112 Hz |
| metal_pintado | 7800 | 0,45 | 0,34 | 0,88 | 0,05 | 0,86 | 0,10 | abollar | metal 620 Hz |
| metal_oxidado | 7650 | 0,68 | 0,22 | 0,66 | 0,00 | 0,40 | 0,34 | abollar | metal 480 Hz |
| acero_cepillado | 7850 | 0,38 | 0,42 | 0,94 | 0,00 | 0,96 | 0,08 | abollar | metal 780 Hz |
| chapa_ondulada | 7200 | 0,50 | 0,30 | 0,70 | 0,00 | 0,80 | 0,14 | abollar | chapa 340 Hz |
| aluminio_rayado | 2700 | 0,42 | 0,36 | 0,62 | 0,02 | 0,92 | 0,12 | abollar | metal 900 Hz |
| oxido_fuerte | 5300 | 0,82 | 0,10 | 0,34 | 0,00 | 0,08 | 0,62 | desmenuzar | sordo 260 Hz |
| pintura_desgastada | 7750 | 0,52 | 0,30 | 0,82 | 0,08 | 0,70 | 0,14 | abollar | metal 560 Hz |
| madera_tabla | 520 | 0,58 | 0,28 | 0,40 | 0,78 | 0,02 | 0,42 | astillar | madera 300 Hz |
| madera_contrachapado | 600 | 0,54 | 0,24 | 0,36 | 0,82 | 0,02 | 0,52 | delaminar | madera 380 Hz |
| madera_pale | 470 | 0,72 | 0,22 | 0,30 | 0,88 | 0,02 | 0,56 | astillar | madera 260 Hz |
| vidrio_sucio | 2500 | 0,28 | 0,30 | 0,86 | 0,00 | 0,01 | **0,98** | estallar | vidrio 1450 Hz |
| goma | 1150 | **1,15** | **0,78** | 0,18 | 0,62 | 0,00 | 0,04 | deformar | goma 90 Hz |
| plastico | 980 | 0,40 | 0,46 | 0,44 | 0,70 | 0,00 | 0,48 | fundir | plástico 700 Hz |
| lona | 420 | 0,66 | 0,08 | 0,08 | 0,74 | 0,00 | 0,20 | rasgar | tela 150 Hz |
| carton | 180 | 0,60 | 0,12 | 0,06 | **0,92** | 0,00 | 0,30 | aplastar | cartón 220 Hz |
| tierra | 1550 | 0,92 | 0,04 | 0,14 | 0,06 | 0,10 | 0,10 | desmenuzar | sordo 95 Hz |
| grava | 1700 | **0,98** | 0,12 | 0,60 | 0,00 | 0,02 | 0,20 | dispersar | grava 320 Hz |
| ladrillo | 1900 | 0,80 | 0,14 | 0,66 | 0,00 | 0,02 | 0,68 | fragmentar | cerámica 420 Hz |
| yeso | 950 | 0,70 | 0,08 | 0,22 | 0,04 | 0,02 | 0,86 | pulverizar | yeso 280 Hz |

`sonidoImpacto` es `{ tipo, frecuencia, decaimiento, brillo, ruido }`, pensado para
sintetizar el golpe en WebAudio y escalarlo con el momento lineal del impacto.

---

## 5. Visor de verificación

`visor/index.html` — WebGL2 propio, **sin motor 3D de terceros**. Rejilla de esferas y
cubos de aristas redondeadas (las aristas existen de verdad: es donde se ve el desgaste
de canto), PBR Cook-Torrance con GGX + Smith + Schlick, luz direccional de atardecer,
entorno equirectangular procedural con mipmaps para los reflejos según rugosidad,
aproximación analítica del BRDF de entorno, y tono ACES.

Expone `window.__BENCH` con `ready`, `setCamera(0..5)`, `phase()`, `resetStats()` y
`stats()`. Las seis cámaras recorren la rejilla, un plano rasante sobre los metales, un
primer plano a ~1 m de hormigón rugoso y el muro de calcomanías.

```
node tools/bench.mjs paquetes/materiales/visor materiales /tmp/selftest-mat
```

Herramientas de verificación propias del paquete:

```
node herramientas/servir.mjs . /herramientas/prueba.html        # compila y mide las 31 recetas
node herramientas/hojas.mjs  . /tmp/teselado albedo             # hojas de contacto 3x3 (costuras)
```

Las hojas de contacto repiten cada material 3×3 y dibujan en rojo dónde están las
juntas: si se ve una línea, hay costura.

---

## 6. Rendimiento

El coste real depende por completo del rasterizador. Medido en este contenedor, que
renderiza **por software** (SwiftShader, 4 núcleos, sin GPU):

| Medida (1024 px, 24 familias) | Valor |
|---|---:|
| Despacho JS, sin forzar sincronizacion (`estadisticas().msGenerado`) | ~240 ms |
| Ciclo completo del visor: generar + subir a textura + mipmaps, rasterizado por CPU | ~25 s |

El despacho es barato; lo caro es rasterizar por CPU. Sobre una GPU real el paso A y el
paso B de una familia son dos triángulos a pantalla completa, así que el objetivo de
**24 familias a 1024 px por debajo de 4 s** se cumple con holgura. Aquí no es medible:
este entorno no tiene GPU y ese dato consta en `PROGRESO.md`.

Lo que sí es independiente del rasterizador y está resuelto:

- **Buffers reutilizados**: un único contexto WebGL2, un FBO de campo y uno de salida
  por resolución, compartidos por todo el catálogo. Generar 24 materiales no asigna 24
  juegos de texturas.
- **Programas cacheados** por receta.
- **Captura sin `readPixels`**: `transferToImageBitmap()` mueve el resultado sin bajarlo
  a CPU. Hay camino de respaldo con `readPixels` si el entorno no lo soporta.
- **Calidad baja**: `resolucion: 512`. El uniforme `uMicro` atenúa la octava más fina
  cuando un téxel deja de resolverla, para que bajar la resolución no genere aliasing.
