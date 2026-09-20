# `@fragua/audio` — Motor de audio procedural

Todo el sonido del sandbox se **sintetiza en tiempo real con WebAudio**. No hay ni una sola
muestra grabada, ni se descarga ningún archivo de audio: los únicos datos son buffers de
ruido y respuestas al impulso, y ambos se **calculan en JavaScript al arrancar**.

Paquete ESM sin dependencias. No conoce Three.js, Rapier ni ningún motor 3D: recibe
posiciones y materiales como datos planos.

```js
import { MotorAudio } from '@fragua/audio';

const audio = new MotorAudio();          // no crea el AudioContext todavía
await audio.iniciar();                    // tras un gesto del usuario
audio.escucha({ posicion, orientacion }); // oyente (posición + frente/arriba o cuaternión)
audio.ambiente('interior_nave');
audio.impacto({ material: 'acero', materialB: 'hormigon', momento: 420, posicion });
```

---

## 1. API

### Ciclo de vida

| Método | Efecto |
|---|---|
| `new MotorAudio(opciones)` | Construye. **No** crea el `AudioContext` (política de autoplay). |
| `await audio.iniciar()` | Crea/reanuda el contexto, genera ruido e impulsos. Llamar tras un gesto. |
| `await audio.pausar()` / `reanudar()` | Suspende el contexto (pestaña en segundo plano). |
| `await audio.detener()` | Para todo lo continuo y cierra el contexto. |
| `audio.volumen(0..1.5)` | Volumen maestro, con rampa. |
| `audio.estadisticas` | `{creadas, fusionadas, descartadas, robadas, pico, activas, escala}` para el HUD. |

Opciones del constructor: `contexto` (usar uno existente, p. ej. `OfflineAudioContext`),
`limitador` (`false` desnuda la cadena maestra), `maxVoces` (48), `volumen` (0.9),
`hrtf` (`true`), `reverb` (1), `semilla` (determinismo).

### Oyente y espacio

```js
audio.escucha({ posicion: [x,y,z], orientacion: { frente:[0,0,-1], arriba:[0,1,0] } });
audio.escucha({ posicion, orientacion: { x, y, z, w } });   // también acepta cuaternión
audio.ambiente('exterior' | 'interior_nave' | 'interior_pequeno', duracionFundido = 1.5);
audio.escalaTiempo(0.2);   // cámara lenta: 1 = normal, 0.05..4
```

### Eventos puntuales

```js
audio.impacto({ material, materialB, momento, posicion, oclusion, cuando, ganancia });
audio.explosion({ potencia, posicion, oclusion, superficie, metralla });
audio.disparo({ arma: 'pistola'|'escopeta'|'rifle'|'subfusil'|'laser', posicion });
audio.paso({ superficie, correr, posicion });
audio.rotura({ material, potencia, posicion, superficie });
audio.interfaz('hover'|'click'|'abrir'|'cerrar'|'error'|'aceptar');
```

`momento` es el **momento lineal del impacto en kg·m/s**, el que ya calcula la física.
Calibrado contra las masas reales del juego: un roce suave está en 20–60, un choque fuerte
por encima de 800. `oclusion` va de 0 (línea directa) a 1 (tras un muro).
`cuando` permite programar en el futuro (instante absoluto del reloj de audio).

### Continuos (se crean, se actualizan y se paran por `id`)

```js
audio.friccion(idObjeto, { material, velocidad, posicion });  // velocidad <= 0 → para
audio.fuego(idObjeto,    { intensidad, posicion });            // intensidad <= 0 → apaga
audio.motor(idObjeto,    { rpm, carga, posicion, cilindros }); // rpm <= 0 → apaga
audio.manipulador({ tension: 0..1, masa });                    // tension 0 → apaga
audio.parar(id);
```

Llamar repetidamente con el mismo `id` **actualiza** la voz existente con rampas; nunca
reinicia el sonido.

### Materiales

La matriz de timbres usa **los mismos identificadores que la tabla de materiales sistémicos
del juego** (`juego/src/fisica/materiales.js`), de modo que el juego puede pasar el `id` del
material de un cuerpo **o** su campo `timbre`, indistintamente y sin traducción:

| familia de timbre | materiales del juego que la usan |
|---|---|
| `piedra` | hormigón, ladrillo |
| `metal` | acero, aluminio |
| `metalSordo` | hierro oxidado, bidón de gasolina |
| `madera` | madera, contrachapado |
| `vidrio` | vidrio, hielo |
| `goma` | goma |
| `plastico` | plástico, explosivo |
| `carton` | cartón |
| `tela` | lona |

Además hay familias propias del entorno para pasos y escombros: `grava`, `tierra`, `agua`,
`nieve`, `hierba`, `carne`.

---

## 2. Cómo suena lo que suena

### La masa cambia el timbre, no el volumen

Todo sale de un único tamaño implícito: `masa = momento / v_típica`, `tam = (masa/10 kg)^⅓`.

| magnitud | ley | por qué |
|---|---|---|
| tono fundamental | `f0 ∝ 1/tam` | la frecuencia de un modo es inversa a la longitud del sólido |
| decaimiento | `t60 ∝ tam^0.45` | más masa = más energía almacenada por unidad de pérdida |
| ancho de banda del golpe | `fc ≈ 1/t_contacto`, `t_contacto ∝ tam^0.6` | el contacto de Hertz dura más cuanto más pesado; un pulso de duración `tc` **solo excita hasta ~1/tc Hz** |
| cuerpo grave | `∝ tam^0.75` | y por debajo de cierto tamaño simplemente no existe |
| densidad de transitorios | crece con `tam` | lo pesado no da *un* golpe: da golpe, repique y reasentamiento |

Cada modo se excita **solo en la medida en que el transitorio tiene energía a su
frecuencia** (factor `1/√(1+(f/fc)²)`). El oscurecimiento por masa sale de ahí, no de un
ecualizador pegado encima.

### Por par de materiales

El material **más resonante** aporta la cola modal; el **más blando** manda en el tiempo de
contacto (por eso un martillo de acero sobre goma suena a goma). Encima, una tabla de
correcciones por par da el carácter reconocible: `metal+piedra` chirría y repica,
`madera+madera` es seco y medio, `vidrio` astilla, `goma` es sordo, `carton`/`tela` son
casi solo transitorio.

Las razones modales no son armónicas, son las reales del sólido: placa circular
(1, 2.76, 5.40, 8.93, 13.34) para metal y vidrio, barra libre-libre (1, 2.57, 4.91, 7.99)
para madera, parciales bajos muy amortiguados para piedra y goma.

### Sin clics

Ninguna ganancia cambia de forma instantánea. Toda envolvente es *rampa lineal a cero →
pico → caída exponencial → rampa lineal a cero* (la exponencial no puede tocar el cero, la
lineal sí). El robo de voces aplica un fundido de 15 ms, nunca un corte. Las respuestas al
impulso entran y salen con rampa para que la convolución no introduzca un clic por evento.

### Que 300 impactos no revienten la mezcla

Cuatro defensas en cascada, de la más barata a la más cara:

1. **Agrupación**: dos impactos del mismo par de materiales, a menos de 2.5 m y dentro de
   45 ms, son perceptualmente uno solo. Se suman con la ley incoherente (1/√n) y a partir
   de la séptima copia se descartan.
2. **Techo de polifonía** (48 voces): se roban las de menor nivel y más antiguas. Las voces
   continuas (fuego, motor, ambiente) están marcadas como no robables.
3. **Nivel de detalle**: con la mezcla cargada se dejan de sintetizar astillas, repiques y
   rebotes antes de que el limitador tenga que trabajar.
4. **Cadena maestra**: compresor de pegamento (3.2:1) → limitador (20:1, ataque 1 ms) →
   filtro de escala de tiempo → **saturador tanh**. Como `|tanh(x)| < 1`, la salida **no
   puede** recortar digitalmente aunque el limitador se vea desbordado.

### Reverberación y espacio

Respuestas al impulso **generadas proceduralmente**: reflexiones tempranas discretas
(tamaño de la sala), cola difusa con densidad creciente y amortiguación de agudos
dependiente del tiempo, y coloración modal (una nave metálica tiene modos propios audibles).
Dos convolvers en paralelo con ganancias cruzadas: cambiar de espacio es un fundido de
1.5 s, nunca un corte.

El IR se normaliza por su **norma L2**, que es la ganancia real de la convolución. (Ver
limitaciones: normalizarlo por RMS fue un error que costó el ataque de todos los impactos.)

### Audio posicional

`PannerNode` en HRTF con modelo de distancia inverso, más dos filtros por voz: **absorción
del aire** (paso bajo cuya fc cae con la distancia) y **oclusión** (paso bajo severo más
atenuación de banda ancha). El envío a reverberación **crece** con la distancia y con la
oclusión: de cerca domina el directo, de lejos y tras un muro domina la sala.

### Cámara lenta

`escalaTiempo(e)` multiplica todas las frecuencias por `e` y divide todas las duraciones,
reajusta con rampas las voces continuas ya sonando, y cierra el filtro paso bajo maestro
(convención cinematográfica del *bullet time*).

---

## 3. Verificación

```bash
node verificacion/render.mjs     # WAV + métricas (OfflineAudioContext real en Chromium)
node verificacion/graficos.mjs   # PNG: forma de onda + espectrograma + métricas
node verificacion/informe.mjs    # tabla de métricas + comprobaciones automáticas
```

El render **no** usa una reimplementación de WebAudio en Node: arranca Chromium con
Playwright y sintetiza en su `OfflineAudioContext`, es decir con el mismo `PannerNode` HRTF,
el mismo `DynamicsCompressor` y el mismo `ConvolverNode` que oirá el jugador. Los gráficos se
dibujan con Canvas en el mismo navegador (este entorno no tiene numpy ni matplotlib).

Cada caso es determinista: misma semilla → mismo PCM → mismas métricas. Dos ejecuciones
comparables detectan regresiones de verdad, no ruido de medida.

Salida en `verificacion/salida/`: 50 `.wav`, 50 `.png`, `metricas.json`, `METRICAS.md`.

### Los dos casos obligatorios

**Impacto metal/hormigón con momento 5 / 50 / 200 / 800.** Las cuatro magnitudes que
definen el timbre se mueven de forma **estrictamente monótona**, y ninguna es el volumen:

| momento | centroide | −40 dB | energía < 250 Hz | energía > 4 kHz |
|--:|--:|--:|--:|--:|
| 5 | 1670 Hz | 0.86 s | −46.4 dB | −29.2 dB |
| 50 | 647 Hz | 1.21 s | −9.3 dB | −33.9 dB |
| 200 | 507 Hz | 1.53 s | −0.6 dB | −40.2 dB |
| 800 | 304 Hz | 1.92 s | −0.5 dB | −56.9 dB |

El centroide baja 2.4 octavas, la cola se duplica, el grave sube 46 dB y el agudo cae 28 dB.
En los espectrogramas (`masa_005.png` … `masa_800.png`) se ve directamente: el golpe ligero
es un abanico de parciales entre 300 Hz y 10 kHz que muere en 1.4 s; el pesado es una banda
dominante de 80–250 Hz que dura 3 s y cuyos agudos desaparecen a los 0.6 s.

**200 impactos en 300 ms.** Con la cadena completa no hay ni una muestra recortada; con la
cadena desnuda, el mismo material recorta. La diferencia la hacen las cuatro defensas:

| caso | fusionadas | robadas | pico simultáneo | pico dBFS | recorte |
|---|--:|--:|--:|--:|:-:|
| cadena completa | 36 | 152 | 49 | −1.3 | no |
| sin limitador | 36 | 152 | 49 | **+2.5** | **sí (210)** |
| sin agrupación ni techo de voces | 0 | 0 | 200 | **+4.9** | **sí** |

---

## 4. Tabla de métricas

Leyenda: *dur. activa* = tramo por encima de −60 dBFS. *cresta* = pico − RMS. *centroide* =
centroide espectral ponderado por energía de trama. *−40 dB* = tiempo desde el pico de la
envolvente hasta caer 40 dB (— = no cae dentro del render, propio de lechos continuos).
*<250 Hz* / *>4 kHz* = energía de banda relativa al total. *transit.* = frentes detectados
por flujo espectral logarítmico.

<!-- TABLA:INICIO -->

### A · La masa cambia el timbre

| caso | dur. activa | pico dBFS | RMS dBFS | cresta dB | centroide Hz | −40 dB | <250 Hz | >4 kHz | transit. | recorte |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|
| `masa_005` | 1.27 s | -15.5 | -32.9 | 17.4 | 1670 | 0.86 s | -46.4 | -29.2 | 4 | no |
| `masa_050` | 1.80 s | -8.9 | -25.7 | 16.7 | 647 | 1.21 s | -9.3 | -33.9 | 3 | no |
| `masa_200` | 2.26 s | -6.3 | -23.1 | 16.8 | 507 | 1.53 s | -0.6 | -40.2 | 3 | no |
| `masa_800` | 2.83 s | -3.8 | -19.6 | 15.7 | 304 | 1.92 s | -0.5 | -56.9 | 3 | no |
| `masa_800_sin_limitador` | 2.57 s | -17.2 | -35.9 | 18.8 | 316 | 1.73 s | -0.6 | -58.0 | 3 | no |
| `diag_masa_005_seco` | 1.23 s | -27.8 | -46.0 | 18.2 | 1653 | 0.90 s | -43.3 | -28.2 | 4 | no |
| `diag_masa_005_seco_sinhrtf` | 1.10 s | -25.2 | -46.5 | 21.2 | 2509 | 0.77 s | -41.0 | -17.2 | 4 | no |

### B · Matriz de pares de materiales (momento 120)

| caso | dur. activa | pico dBFS | RMS dBFS | cresta dB | centroide Hz | −40 dB | <250 Hz | >4 kHz | transit. | recorte |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|
| `par_metal_hormigon` | 2.06 s | -6.9 | -23.8 | 16.9 | 496 | 1.39 s | -4.5 | -42.8 | 4 | no |
| `par_metal_metal` | 3.00 s | -5.9 | -23.6 | 17.7 | 845 | 2.02 s | -13.6 | -26.5 | 3 | no |
| `par_madera_madera` | 0.46 s | -13.1 | -28.3 | 15.2 | 412 | 0.28 s | -0.3 | -54.9 | 4 | no |
| `par_vidrio_hormigon` | 0.80 s | -9.1 | -25.1 | 16.1 | 1034 | 0.49 s | -9.2 | -25.9 | 5 | no |
| `par_goma_metal` | 0.51 s | -9.4 | -24.0 | 14.6 | 251 | 0.36 s | -1.8 | -63.5 | 5 | no |
| `par_hormigon_hormigon` | 0.37 s | -13.5 | -31.5 | 18.0 | 229 | 0.28 s | -0.1 | -60.4 | 3 | no |
| `par_plastico_madera` | 0.45 s | -11.1 | -27.7 | 16.6 | 490 | 0.28 s | -10.7 | -53.1 | 4 | no |
| `par_grava_metal` | 1.71 s | -8.3 | -24.8 | 16.5 | 608 | 1.12 s | -9.6 | -44.6 | 3 | no |
| `par_metalSordo_piedra` | 0.40 s | -11.5 | -26.6 | 15.1 | 329 | 0.30 s | -0.1 | -57.6 | 5 | no |
| `par_carton_piedra` | 0.45 s | -15.8 | -35.0 | 19.2 | 191 | 0.28 s | -0.1 | -66.8 | 4 | no |
| `par_tela_piedra` | 0.46 s | -16.6 | -36.5 | 19.9 | 205 | 0.27 s | -0.1 | -64.1 | 4 | no |

### C · 200 impactos en 300 ms

| caso | dur. activa | pico dBFS | RMS dBFS | cresta dB | centroide Hz | −40 dB | <250 Hz | >4 kHz | transit. | recorte |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|
| `densidad_200_con_limitador` | 2.65 s | -1.3 | -16.1 | 14.7 | 517 | 1.83 s | -1.1 | -43.9 | 5 | no |
| `densidad_200_sin_limitador` | 2.16 s | 2.5 | -18.2 | 20.7 | 603 | 1.05 s | -1.7 | -45.0 | 5 | **sí (210)** |
| `densidad_200_sin_agrupacion` | 2.29 s | 4.9 | -14.1 | 19.0 | 743 | 1.20 s | -1.6 | -32.9 | 4 | **sí (2043)** |

### D · Explosión

| caso | dur. activa | pico dBFS | RMS dBFS | cresta dB | centroide Hz | −40 dB | <250 Hz | >4 kHz | transit. | recorte |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|
| `explosion_p1` | 2.12 s | -6.0 | -25.9 | 19.8 | 1666 | 1.53 s | -2.1 | -25.5 | 7 | no |
| `explosion_p6` | 3.45 s | -2.9 | -20.3 | 17.4 | 882 | 2.60 s | -0.7 | -32.5 | 9 | no |

### E · Disparos

| caso | dur. activa | pico dBFS | RMS dBFS | cresta dB | centroide Hz | −40 dB | <250 Hz | >4 kHz | transit. | recorte |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|
| `disparo_pistola` | 0.38 s | -6.9 | -23.0 | 16.1 | 2277 | 0.18 s | -1.4 | -25.1 | 2 | no |
| `disparo_escopeta` | 0.43 s | -3.3 | -17.0 | 13.7 | 1575 | 0.29 s | -0.1 | -30.5 | 2 | no |
| `disparo_rifle` | 0.44 s | -3.1 | -20.0 | 16.9 | 2390 | 0.28 s | -0.2 | -21.3 | 2 | no |
| `disparo_laser` | 0.36 s | -10.6 | -33.8 | 23.2 | 2893 | 0.30 s | -21.2 | -13.6 | 1 | no |

### F · Continuos

| caso | dur. activa | pico dBFS | RMS dBFS | cresta dB | centroide Hz | −40 dB | <250 Hz | >4 kHz | transit. | recorte |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|
| `friccion_metal` | 4.07 s | -11.1 | -35.2 | 24.1 | 3066 | 1.43 s | -3.9 | -12.6 | 32 | no |
| `friccion_madera` | 4.11 s | -15.7 | -37.7 | 22.0 | 2498 | 3.57 s | -5.8 | -19.5 | 31 | no |
| `fuego` | 6.64 s | -3.5 | -21.7 | 18.2 | 965 | 1.91 s | -2.3 | -32.3 | 100 | no |
| `motor` | 6.83 s | -1.6 | -12.4 | 10.8 | 1046 | 3.12 s | -0.7 | -31.7 | 119 | no |
| `manipulador_5kg` | 3.53 s | -2.4 | -14.3 | 11.9 | 1297 | 1.27 s | -6.0 | -33.8 | 30 | no |
| `manipulador_400kg` | 3.49 s | -2.6 | -14.5 | 11.9 | 865 | 1.38 s | -0.4 | -37.4 | 83 | no |

### G · Pasos

| caso | dur. activa | pico dBFS | RMS dBFS | cresta dB | centroide Hz | −40 dB | <250 Hz | >4 kHz | transit. | recorte |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|
| `pasos_metal_andar` | 2.69 s | -14.6 | -33.3 | 18.8 | 951 | 0.24 s | -4.6 | -20.8 | 15 | no |
| `pasos_metal_correr` | 2.96 s | -5.6 | -20.5 | 14.8 | 1256 | 0.28 s | -1.2 | -28.5 | 19 | no |
| `pasos_grava_correr` | 2.88 s | -5.5 | -25.7 | 20.2 | 348 | 0.14 s | -0.2 | -24.7 | 23 | no |

### H · Rotura

| caso | dur. activa | pico dBFS | RMS dBFS | cresta dB | centroide Hz | −40 dB | <250 Hz | >4 kHz | transit. | recorte |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|
| `rotura_vidrio` | 1.61 s | -10.0 | -29.0 | 19.0 | 3506 | 0.53 s | -49.1 | -6.3 | 18 | no |
| `rotura_madera` | 1.32 s | -10.6 | -30.8 | 20.2 | 1565 | 0.18 s | -3.5 | -23.4 | 11 | no |
| `rotura_hormigon` | 1.96 s | -8.9 | -28.9 | 20.0 | 1746 | 0.54 s | -0.5 | -26.0 | 16 | no |

### I · Interfaz

| caso | dur. activa | pico dBFS | RMS dBFS | cresta dB | centroide Hz | −40 dB | <250 Hz | >4 kHz | transit. | recorte |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|
| `interfaz` | 3.09 s | -4.6 | -28.2 | 23.6 | 1777 | 0.18 s | -6.3 | -30.4 | 11 | no |

### J · Ambiente y reverberación

| caso | dur. activa | pico dBFS | RMS dBFS | cresta dB | centroide Hz | −40 dB | <250 Hz | >4 kHz | transit. | recorte |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|
| `ambiente_exterior` | 4.97 s | -4.2 | -24.6 | 20.4 | 4273 | — | -1.9 | -15.4 | 0 | no |
| `ambiente_nave` | 4.97 s | -2.6 | -12.5 | 9.9 | 432 | — | -0.1 | -47.3 | 1 | no |
| `ambiente_transicion` | 6.97 s | -2.9 | -14.7 | 11.8 | 792 | — | -0.2 | -29.5 | 2 | no |

### K · Audio posicional

| caso | dur. activa | pico dBFS | RMS dBFS | cresta dB | centroide Hz | −40 dB | <250 Hz | >4 kHz | transit. | recorte |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|
| `espacial_cerca_izquierda` | 2.05 s | -5.1 | -23.3 | 18.1 | 427 | 1.38 s | -1.0 | -44.8 | 3 | no |
| `espacial_lejos_derecha` | 1.91 s | -9.3 | -31.9 | 22.6 | 740 | 1.40 s | -1.6 | -34.9 | 6 | no |
| `espacial_ocluido` | 1.95 s | -10.2 | -29.4 | 19.2 | 392 | 1.31 s | -1.1 | -49.9 | 4 | no |

### L · Cámara lenta

| caso | dur. activa | pico dBFS | RMS dBFS | cresta dB | centroide Hz | −40 dB | <250 Hz | >4 kHz | transit. | recorte |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|
| `tiempo_normal` | 3.27 s | -1.1 | -18.5 | 17.4 | 1141 | 2.14 s | -1.5 | -29.1 | 13 | no |
| `tiempo_lento_02` | 8.93 s | -1.5 | -20.1 | 18.6 | 344 | — | -0.8 | -30.5 | 11 | no |
| `tiempo_lento_05` | 5.23 s | -1.2 | -18.6 | 17.5 | 670 | 3.66 s | -1.7 | -30.7 | 15 | no |

### M · Escena mixta

| caso | dur. activa | pico dBFS | RMS dBFS | cresta dB | centroide Hz | −40 dB | <250 Hz | >4 kHz | transit. | recorte |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|
| `escena_completa` | 8.97 s | -1.2 | -11.5 | 10.3 | 953 | — | -0.5 | -32.0 | 15 | no |

### Control de voces en el caso denso

| caso | voces creadas | fusionadas | descartadas | robadas | pico simultáneo | pico dBFS | recorte |
|---|--:|--:|--:|--:|--:|--:|:-:|
| `densidad_200_con_limitador` | 200 | 36 | 0 | 152 | 49 | -1.3 | no |
| `densidad_200_sin_limitador` | 200 | 36 | 0 | 152 | 49 | 2.5 | **sí (210)** |
| `densidad_200_sin_agrupacion` | 200 | 0 | 0 | 0 | 200 | 4.9 | **sí (2043)** |

_Generado por `verificacion/informe.mjs` el 2026-09-20 · 50 casos · 48000 Hz._

### Comprobaciones automáticas

| comprobación | resultado | evidencia |
|---|:-:|---|
| centroide espectral decrece con el momento | ✅ | 1670 Hz > 647 Hz > 507 Hz > 304 Hz |
| decaimiento a −40 dB crece con el momento | ✅ | 0.86 s < 1.21 s < 1.53 s < 1.92 s |
| energía < 250 Hz crece con el momento | ✅ | -46.4 dB < -9.3 dB < -0.6 dB < -0.5 dB |
| energía > 4 kHz decrece con el momento | ✅ | -29.2 dB > -33.9 dB > -40.2 dB > -56.9 dB |
| 200 impactos en 300 ms NO recortan con la cadena completa | ✅ | pico -1.3 dBFS |
| el limitador actúa: la cadena desnuda SÍ recorta | ✅ | pico 2.5 dBFS, 210 muestras recortadas |
| ningún otro caso recorta | ✅ | ninguno |

<!-- TABLA:FIN -->

---

## 5. Limitaciones conocidas

1. **La reverberación no se estira en cámara lenta.** `ConvolverNode` no tiene control de
   velocidad, así que a `escalaTiempo(0.2)` las colas de convolución siguen durando lo
   mismo mientras el resto se alarga 5×. Se disimula cerrando el filtro maestro, pero es
   una aproximación. Arreglo real: regenerar los IR al cambiar de escala (coste de unos
   100 ms de CPU) o sustituir la convolución por una red de retardos realimentados.
2. **El `PannerNode` HRTF añade ~5 ms de latencia constante** en Chromium, y la cadena de
   compresores otros ~15 ms. Es un desfase global, no afecta a la mezcla relativa, pero
   cuenta si algún día hay que sincronizar audio con un evento visual al milisegundo.
3. **Sin oclusión geométrica real.** `oclusion` es un escalar que debe calcular el juego
   (raycast). El motor no conoce la escena.
4. **Sin efecto Doppler.** `PannerNode` lo soporta, pero exige velocidades fiables por
   fuente; queda pendiente de que la física las exponga.
5. **El conteo de transitorios es una medida, no una verdad.** El detector por flujo
   espectral fusiona frentes separados por menos de 25 ms y se satura en lechos continuos
   (el fuego marca ~100 “transitorios” que son crepitar). Sirve para comparar casos
   parecidos, no como cifra absoluta.
6. **El centroide espectral no es monótono en todos los ejes.** Lo es en el barrido de masa,
   que es lo exigido, pero entre pares de materiales muy distintos puede engañar: es una
   media, y dos espectros muy diferentes pueden compartirla. Las bandas `<250 Hz` y
   `>4 kHz` son más informativas.
7. **Coste de CPU no medido bajo carga real.** El render offline va ~5× más rápido que el
   tiempo real en este contenedor (sin GPU), pero eso no predice el coste en el bucle del
   juego compitiendo con física y render. Falta un perfilado con `AudioContext` en vivo.
8. **`v_típica = 4 m/s`** para deducir masa a partir del momento. Si la física expusiera
   masa y velocidad por separado el mapeo sería exacto en vez de estadístico.
9. **Voces continuas no robables.** Es lo correcto perceptualmente, pero significa que
   muchos fuegos o motores simultáneos pueden ocupar el techo de polifonía. Falta un
   agrupador espacial para continuos, como el que ya existe para impactos.

### Errores encontrados y corregidos durante la verificación

Se dejan anotados porque son justo los que la verificación existe para cazar:

- **Capas retardadas sonando a ganancia unidad.** Un `GainNode` nace con `gain = 1`, y ese
  valor rige hasta el primer evento programado. Cada repique, astilla o rebote programado a
  `t0 + dt` sonaba **a tope** desde `t0` hasta `dt`. Con ~20 capas retardadas por impacto,
  un solo golpe pesado llegaba a **+20 dBFS**. Corregido fijando `param.value = 0` en las
  envolventes.
- **IR normalizado por RMS en vez de por norma L2.** El RMS divide por la longitud, así que
  un IR de 3.2 s con el mismo RMS que uno de 1.1 s tiene casi el doble de ganancia de
  convolución. Salían **+16 dB** de reverberación: tapaba el directo y **movía el pico del
  impacto 100 ms después del golpe**, destruyendo el ataque. Corregido normalizando por L2.
- **Densidad difusa del IR demasiado lenta** (178 ms): la reverberación “hinchaba” después
  del golpe. Acotada a 60 ms.
- **Saturador antes del filtro maestro.** Un paso bajo biquad con la fc cerca de Nyquist
  tiene ganancia > 1 en la banda de paso, y ese rebasamiento salía sin acotar. El saturador
  pasó a ser la última etapa, con la fc tope en `0.375·sr`.
- **Fase coherente de los modos.** Todos los osciladores arrancan en fase 0, así que el pico
  del ataque crecía con el *número de capas* en vez de con la energía del golpe. Corregido
  con pre-arranque aleatorio (la ganancia ya es cero) y normalización de pico coherente.
