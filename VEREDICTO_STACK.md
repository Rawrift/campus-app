# Veredicto del Gauntlet tecnológico

**Stack elegido: Three.js r186 + Rapier3D 0.20 (WebGL2).**
Decisión **reversible** por diseño. Si aparece evidencia de que otra tecnología gratuita mejora
sustancialmente calidad, rendimiento o física, se somete de nuevo al Gauntlet y se migra.

## Lo que la evidencia SÍ establece

| | Three + Rapier | PlayCanvas + Ammo | Godot 4 web | Babylon + Havok |
|---|---|---|---|---|
| Escena del contrato completa | ✅ | ✅ (parcial) | n/a (sonda) | ❌ no completó |
| FPS real (exclusiva, arnés propio) | 1,1 – 1,44 | 0,5 – 1,4 | 4 (escena trivial) | — |
| Triángulos · draw calls | 81k · 93 | 362k · 167 | — | — |
| Cuerpos en fase caos | **781, 0 NaN** | 626 | — | NaN en ragdolls |
| Payload gzip | 1,19 MB | 1,04 MB | **9,3 MB** | — |
| Errores de consola | 0 | 0 | — | — |

1. **La física de Rapier es la pieza más sólida medida.** 781 cuerpos, 17 ragdolls, 3 explosiones
   encadenadas, paso fijo, cero NaN y cero jitter. El candidato Babylon, en cambio, estaba
   peleándose con inestabilidad numérica (geometría NaN) en sus ragdolls al caer.
2. **El rendimiento NO diferencia a Three de PlayCanvas.** Ambos en el mismo orden (~1 fps bajo
   rasterizado software). La cifra "290 vs 1,4" que publiqué antes era falsa y está retractada.
3. **Payload equivalente** entre los dos candidatos JS, y 8x menor que Godot.
4. **Godot queda descartado con medición**: Forward+ no existe en web (techo GLES3), payload 28x
   mayor, y sin control del fotograma no hay capturas reproducibles.

## Lo que la evidencia NO establece, y hay que decirlo

**Babylon.js + Havok nunca completó su escena.** Se cortó dos veces por límite de presupuesto de
API del entorno, no por perder. No puedo afirmar que Three lo supere en imagen o rendimiento. Es
la principal deuda de este gauntlet.

Tampoco está establecido que Three renderice mejor que los otros: **la calidad de imagen que
observé estuvo dominada por el oficio del constructor, no por el techo del motor.** El fallo que
arruinaba la imagen de Three era escribir reflectancias lineales en texturas sRGB — un error de
programación, no una limitación de Three.js.

## Por qué Three + Rapier aun así, con los criterios de ESTE proyecto

- **Control del fotograma.** El requisito duro de determinismo (`avanzar(N)` + `renderizar()`,
  misma semilla → misma imagen) exige ceder el reloj al arnés. Three es la abstracción más baja
  de las tres y lo permite sin pelearse con el motor.
- **Rapier cumple el pilar del juego.** Paso fijo, determinista, set completo de constraints,
  y demostrado estable con 781 cuerpos.
- **Iterabilidad por agente.** Sin editor gráfico, PlayCanvas pierde su mayor ventaja y obliga a
  trabajar contra el framework.

## Riesgo asumido conocido, con mitigación

**Three hace forward rendering y evalúa todas las luces por píxel.** Medido: pasar de 6 a 11
luces puntuales hunde el frame; no hay clustered light culling (PlayCanvas sí lo tiene, y es su
ventaja real). En un sandbox donde el jugador genera lámparas, fuegos y explosiones esto importa.

Mitigación prevista: presupuesto duro de luces dinámicas con prioridad por distancia e
intensidad, charcos de luz resueltos con emisivos y calcomanías en vez de luces reales, y luz de
explosión como destello breve de una sola luz reutilizada. Si aun así resulta insuficiente,
la vía es un pase de iluminación agrupada propio, y si tampoco basta, se reabre el Gauntlet.

Otras limitaciones reales encontradas (en `gauntlet/tech/three-rapier/NOTAS.md`):
`SphericalImpulseJoint` de Rapier no expone `setLimits` (límites reales solo en 6 de los 10
joints del ragdoll); `PCFSoftShadowMap` eliminado en r186; `mergeGeometries` falla al mezclar
geometría indexada y no indexada; anisotropía carísima bajo software.

## El hallazgo que manda en lo que viene

Mirando el primer plano de materiales (`gauntlet/results/three-rapier/cam3.png`): hormigón plano
con puntos, cajas sin veta, neumáticos que parecen plástico, esferas cromadas de relleno y un
ragdoll que es una caja naranja con cápsulas.

**El cuello de botella dominante del producto no es el motor: son los materiales, la densidad de
detalle y la geometría de los props.** Y eso es independiente del motor elegido. Ahí va el
esfuerzo a partir de ahora.
