# GAUNTLET TÉCNICO — CONTRATO DE ESCENA REPRESENTATIVA

Objetivo: construir LA MISMA escena en varios stacks para poder compararlos con evidencia
(imagen + métricas). No es un juego. Es un banco de pruebas representativo del caso real:
un sandbox físico tipo Garry's Mod con calidad visual moderna.

Unidades: metros. Eje vertical: **Y**. Mano derecha. Escala humana: ojos a 1.7 m.

---------------------------------------------------------------------------
## 1. GEOMETRÍA DEL MUNDO (obligatoria, idéntica en todos los stacks)

### 1.1 Terreno
- Suelo de 160 x 160 m centrado en el origen. Material hormigón/asfalto con variación.
- Zona de asfalto mojado / charco reflectante de ~14 x 10 m centrado en (16, 0, 14).

### 1.2 Nave principal (arquitectura, en el origen)
- Huella 24 x 16 m (X x Z), altura de muro 8 m. Centro en (0, 0, 0).
- Fachada frontal (+Z) ABIERTA: portón de 10 m de ancho x 6 m de alto, para ver el interior.
- Muros de hormigón con espesor visible (>= 0.3 m), no planos infinitamente finos.
- Cubierta con **>= 12 vigas metálicas** visibles desde dentro (celosía o perfil en I).
- Entreplanta/mezzanine de 24 x 5 m a 4 m de altura en el lado -Z, con barandilla metálica.
- **4 pilares interiores** de hormigón.
- **>= 8 ventanas con vidrio transparente** en los muros laterales (±X).
- Suelo interior distinto del exterior (hormigón pulido, algo reflectante).

### 1.3 Exterior
- 3 construcciones secundarias (contenedores/casetas) de escala variada.
- Valla perimetral: **>= 40 segmentos**.
- **>= 12 farolas** con geometría real (poste + luminaria).
- Escombros/detalle disperso: >= 60 piezas pequeñas (palés, tablones, piedras, bidones caídos).

---------------------------------------------------------------------------
## 2. MATERIALES (PBR obligatorio)
Deben ser distinguibles por su respuesta física, no solo por el color:
- hormigón (rugoso, no metálico, con suciedad/variación)
- metal pintado (metálico, rugosidad media, desgaste en aristas)
- metal oxidado (bidones)
- madera (cajas, palés, palés con veta)
- vidrio transparente (ventanas)
- goma (neumáticos, muy rugoso, negro)
- plástico
Se permiten texturas procedurales generadas en tiempo de carga (canvas/noise). NO se permiten
materiales de color plano sin variación. NO se permiten assets con copyright.

---------------------------------------------------------------------------
## 3. ILUMINACIÓN Y ATMÓSFERA
- 1 luz direccional (sol) con sombras. Cascadas o mapa de alta resolución.
- Entorno/IBL (cielo procedural o HDR generado) que ilumine indirectamente.
- >= 4 luces locales en el interior (lámparas con geometría emisiva coherente).
- Niebla / dispersión atmosférica que dé profundidad.
- Postprocesado controlado: como mínimo tone mapping + exposición correcta. Bloom/SSAO/etc.
  permitidos si ayudan y no destrozan el rendimiento.

---------------------------------------------------------------------------
## 4. VFX
- Motas de polvo en suspensión en el interior (>= 400 partículas).
- Columna de humo continua saliendo de un bidón exterior.
- Chispas en impactos fuertes.
- Todo debe reaccionar a la iluminación de la escena de forma coherente.

---------------------------------------------------------------------------
## 5. FÍSICA (obligatoria)
- **120 cuerpos rígidos dinámicos** en el estado inicial:
  - cajas de madera 0.8 m apiladas en 3 pirámides de 5 niveles
  - bidones metálicos (cilindros) 0.6 x 0.9 m
  - esferas (masa alta, radio 0.35 m)
  - neumáticos
- Masas realistas y distintas: caja de madera ~18 kg, bidón vacío ~22 kg, esfera de acero ~190 kg,
  neumático ~9 kg. La fricción y restitución deben variar por material.
- **1 cadena/cuerda de >= 10 eslabones** con constraints colgando de una viga.
- **1 cartel oscilante** sobre bisagra (hinge) en la fachada.
- **Ragdoll articulado de >= 11 cuerpos y >= 10 joints** (cabeza, torso, pelvis, 2x brazo sup/inf,
  2x pierna sup/inf), con límites de articulación razonables.
- El motor físico debe correr con paso fijo y ser estable (nada de jitter ni explosiones numéricas).

---------------------------------------------------------------------------
## 6. API DE BANCO DE PRUEBAS (obligatoria, el arnés la invoca)
La página debe exponer en `window.__BENCH`:

```ts
window.__BENCH = {
  ready: Promise<void>,      // resuelve cuando escena + física están listas y estabilizadas
  loadTimeMs: number,        // desde navigationStart hasta ready
  setCamera(i: number): void // i = 0..5, ver tabla; posiciona cámara DETERMINISTAMENTE
  phase(name: string): Promise<void>,  // 'idle' | 'props' | 'explosion' | 'ragdoll' | 'chaos'
  resetStats(): void,
  stats(): {
    fps: number,          // media desde el último resetStats
    frameMs: number,      // media
    p95FrameMs: number,
    drawCalls: number,    // del último frame
    triangles: number,
    programs: number,     // nº de shaders compilados
    bodies: number,       // cuerpos rígidos totales
    activeBodies: number, // cuerpos despiertos
    jsHeapMB: number,     // performance.memory.usedJSHeapSize/1e6 si existe, si no 0
  }
}
```

### Fases
- `'idle'`     : estado inicial, sin cambios.
- `'props'`    : genera **300 props dinámicos adicionales** cayendo desde 12 m sobre la nave.
- `'explosion'`: impulso radial de 45 kN en (0, 1, 0) radio 12 m + ráfaga de partículas + chispas.
- `'ragdoll'`  : genera **8 ragdolls** cayendo desde 6 m dentro de la nave.
- `'chaos'`    : acumulativo — sube hasta **>= 600 cuerpos dinámicos**, 3 explosiones escalonadas
                 y 8 ragdolls simultáneos. Es la prueba de estrés.

Las fases son ACUMULATIVAS en el orden en que las llama el arnés. Nunca deben lanzar excepción.

### Cámaras (posición / punto de mira, exactas)
| i | posición            | mira a          | propósito |
|---|---------------------|-----------------|-----------|
| 0 | ( 34, 12,  34)      | ( 0, 4,  0)     | exterior amplio |
| 1 | (  0, 1.7, 26)      | ( 0, 3,  0)     | aproximación a pie |
| 2 | (  2, 1.7,  6)      | (-6, 2.5,-6)    | interior |
| 3 | ( -4, 1.2, 10)      | (-4.5,0.8, 8)   | primer plano de materiales |
| 4 | ( 10, 3,   12)      | ( 4, 1,  6)     | montón físico |
| 5 | (-28, 6,  -20)      | ( 0, 5,  0)     | contraluz / atmósfera |

FOV vertical: 55°. Near 0.1, Far 500. Resolución de captura: 1280x720, devicePixelRatio 1.

---------------------------------------------------------------------------
## 7. ENTREGA
- Raíz del stack: `gauntlet/tech/<stack>/`
- `index.html` servible como estático desde esa carpeta (el arnés sirve la carpeta y abre `/`).
- Puede usarse un bundler, pero **el resultado final debe ser estático y autocontenido**
  (sin necesitar un dev server con HMR). Si usas build, deja el output listo y que `index.html`
  de la raíz lo cargue.
- `NOTAS.md` con: versiones usadas, qué se implementó, qué no y por qué.

## 8. REGLAS
- Prohibido detectar el arnés y cambiar de comportamiento. Prohibido bajar calidad al medir.
- Prohibido dejar `TODO`/placeholder visible en la imagen final.
- La escena debe verse bien **sin** interacción: lo que se juzga son fotogramas capturados.
- Si algo del contrato es imposible en tu stack, impleméntalo lo más cerca posible y
  DECLÁRALO en `NOTAS.md`. No lo escondas.
