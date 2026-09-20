# Babylon.js 9 + Havok — notas del banco de pruebas

## Versiones exactas
| paquete | versión |
|---|---|
| `@babylonjs/core` | 9.27.1 |
| `@babylonjs/havok` | 1.3.14 (HavokPhysics.wasm, copiado a `dist/`) |
| `vite` | 8.3.0 (rolldown) + `esbuild` 0.27.x para minificar |
| Node | 22.22.2 |
| Chromium | /opt/pw-browsers/chromium, ANGLE + **SwiftShader** (software), 4 núcleos |

Motor: `Engine` WebGL2 clásico (no WebGPU). `deterministicLockstep: true`,
`timeStep: 1/60`, `lockstepMaxSteps: 8` → **la física corre siempre a paso fijo
de 1/60 s**, independientemente del framerate.

Build estático: `npx vite build` → `dist/app.js` + `dist/HavokPhysics.wasm`.
El `index.html` de la raíz carga `./dist/app.js` con rutas relativas. Sin CDN,
sin assets externos, todo same-origin (compatible con COOP/COEP `require-corp`).

## Qué está implementado
**Geometría** — nave 24×16 m, muro 8 m, espesor 0,35 m; portón 10×6 en +Z y un
segundo hueco de carga de 4,7×4,6 (necesario para que la cámara 4, que el
contrato fija en (10,3,12) mirando a (4,1,6), no quede tapada por el machón);
13 celosías de cubierta (2 cordones + 12 diagonales + 6 montantes cada una);
entreplanta 24×5 a 4 m con barandilla, rodapié y escalera de obra completa;
4 pilares de hormigón; 8 ventanas con vidrio y carpintería metálica; solera
interior pulida distinta del exterior. Exterior: suelo 160×160, charco de
14×10 en (16,0,14), 3 construcciones secundarias (contenedor, apilado doble,
caseta), **~86 tramos de valla** de simple torsión con postes y alambrada,
**12 farolas** con poste, brazo y luminaria, y ~140 piezas de escombro
(piedras, tablones, ladrillos, 11 palés) como *thin instances*.

**Materiales PBR** — 100 % procedurales en CPU: albedo + normal (Sobel sobre
altura) + ORM empaquetado (R=AO de cavidad, G=roughness, B=metallic) generados
con value-noise/fbm/worley tileables. Hormigón exterior, hormigón encofrado,
hormigón pulido, metal pintado con desconchados (metallic **varía por téxel**:
pintura 0 / acero desnudo 1), chapa grecada, óxido, madera con vetas y nudos,
goma, plástico, acero, grava, vidrio translúcido, malla de valla con alpha-test
y cartel con texto dibujado en canvas 2D. UV por proyección triplanar a escala
de mundo (texel density constante).

**Luz / atmósfera** — sol direccional con sombras, IBL procedural: el cielo
analítico (Rayleigh+Mie aproximado, nubes fbm, disco solar) se evalúa en CPU a
un cubemap de 320² para el skybox y las reflexiones, y **los armónicos
esféricos se calculan de los datos float HDR reales** (`CubeMapToSphericalPolynomialTools`)
para la difusa. 4 focos interiores con lámparas emisivas + 1 luz de fuego en el
bidón. Niebla EXP2 contenida (0,0031). Tone mapping **ACES dentro de los
materiales** (`applyByPostProcess = false`) + bloom.

**VFX** — ~660 motas de polvo en suspensión, bruma volumétrica, columna de humo
continua con fuego en un bidón, 5 sistemas de chispas en pool, polvo y
fogonazo de explosión, y 5 haces de luz aditivos por ventanas y portón.

**Física (Havok)** — 141 cuerpos iniciales: 47 cajas de madera (3 pirámides de
5 niveles), 25 bidones, 20 esferas de acero, 30 neumáticos, cajas de plástico y
tablones; masas y fricción/restitución reales por material (caja 18 kg, bidón
22 kg, esfera 190 kg, neumático 9 kg). Cadena de **13 eslabones + gancho** con
`BallAndSocketConstraint`; cartel sobre `HingeConstraint`; ragdolls de **11
cuerpos y 10 joints** con límites reales (`Physics6DoFConstraint`, lineales
bloqueados y angulares limitados; codos y rodillas como bisagra).
Los lotes de props usan **thin instances con un único `PhysicsBody` instanciado**
de Havok → 1 draw call y 1 shape por lote, con hasta 841 cuerpos en `chaos`.

## Qué NO está y por qué
- **SSAO2 y FXAA**: medidos, costaban ~40 % del frame en SwiftShader. Eliminados.
- **MirrorTexture en el charco**: sustituida por reflexión del cubemap de entorno
  (el mirror duplicaba pases y salía negro sin render list útil).
- **CascadedShadowGenerator**: ver limitaciones. Sustituido por un mapa único.
- **Sombras de luces locales** (focos y fuego): desactivadas por coste.
- **`activeBodies`**: Havok/Babylon no exponen el estado de sueño; se cuenta por
  velocidad lineal > 0,09 m/s. Está declarado, no es el contador nativo.
- **Forma del neumático**: cilindro (no toro) en física; convexo equivalente.
- **Partículas no reciben iluminación de escena** (limitación de Babylon):
  se tintan a mano con el color del sol/cielo para que encajen.

## Limitaciones REALES encontradas (esto es lo importante)
1. **Los shadow maps de Babylon fallan en silencio en SwiftShader según el tamaño.**
   Un `ShadowGenerator` de **2048² sale completamente vacío** (sin error de
   consola, sin warning, `isReady()` true, 42 casters en la render list). A
   **1024² funciona**. Lo mismo con `CascadedShadowGenerator`: solo la cascada 0
   del texture array produce sombra; las cascadas >0 salen vacías, así que solo
   había sombras a menos de ~8 m. Perdí varias horas aquí porque no hay ningún
   diagnóstico: la imagen simplemente sale sin sombras.
2. **El cálculo automático de extents del sol** (`autoUpdateExtends`) da un
   volumen inservible cuando los casters son mallas fusionadas con
   `freezeWorldMatrix()`. Hay que fijar `orthoLeft/Right/Top/Bottom`,
   `shadowMinZ/MaxZ` y `light.position` a mano. Aquí: ±38 m y 8–168 m, lo que
   da ~7,4 cm/texel; fuera de ese volumen no hay sombra.
3. **El render target half-float del `DefaultRenderingPipeline` (`hdr: true`) es
   carísimo en SwiftShader**: pasar el tone mapping a los materiales
   (`applyByPostProcess = false`) y dejar el pipeline solo con bloom en LDR
   ahorró ~200 ms/frame de 520. A cambio, el skybox necesita su propio tone
   mapping — por eso el cielo es un `StandardMaterial` con el cubemap, y no un
   `ShaderMaterial` con cielo analítico (que salía blanco porque no pasaba por
   el image processing).
4. **El coste está dominado por el fill rate del shader PBR**, no por draw calls
   ni por triángulos: 73–82 draw calls y ~93 k triángulos por frame, y aun así
   480–1070 ms/frame. Bajar de 3 cascadas a 1 mapa, quitar SSAO y recortar el
   overdraw transparente (haces de luz de 2 planos a 1, menos bruma) fue lo que
   más movió la aguja. En hardware real esta escena es trivial.
5. **`anisotropicFilteringLevel = 4`** multiplica el coste de cada fetch en el
   rasterizador software; a 1 se nota.
6. **Physics v2 + thin instances es excelente**: un `PhysicsBody` instanciado por
   lote, `applyImpulse(imp, punto, instanceIndex)` y `getLinearVelocityToRef`
   por instancia. 841 cuerpos, 160 joints de ragdoll y 3 explosiones encadenadas
   sin una sola excepción ni inestabilidad numérica. La física **no** es el
   cuello de botella aquí.
7. **El impulso de la explosión se satura a `masa × 16 m/s`.** 45 kN aplicados
   como impulso de un paso a 1/60 s lanzan una caja de 18 kg a >40 m/s y con
   paso fijo sin CCD eso produce túneles. Está declarado, no escondido.
