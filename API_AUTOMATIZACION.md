# Contrato de automatización del juego — `window.__JUEGO`

El juego **debe** exponer estos ganchos. Son la única forma de ejecutarlo, jugarlo y capturarlo
de forma reproducible en el bucle CONSTRUIR → EJECUTAR → CAPTURAR → JUZGAR.

No son "modo demo": el juego real se comporta igual con o sin ellos. Está **prohibido** que la
presencia del arnés cambie la calidad visual, la física o el rendimiento.

```ts
window.__JUEGO = {
  listo: Promise<void>,        // resuelve cuando el mundo, la física y los recursos están listos
  version: string,

  // ---- control del jugador (simula entrada real, pasa por el mismo camino que el teclado) ----
  entrada(mapa: {adelante?, atras?, izquierda?, derecha?, saltar?, correr?, agachar?, usar?}): void,
  mirarRelativo(dx: number, dy: number, pasos?: number): void,   // como mover el ratón bloqueado
  mirarA(x: number, y: number, z: number): void,                 // apunta a un punto del mundo
  teleportar(pos: [x,y,z], yaw?: number, pitch?: number): void,
  noclip(on: boolean): void,

  // ---- cámara de observación (para capturas; no mueve al jugador) ----
  camaraLibre(on: boolean): void,
  fijarCamara(pos: [x,y,z], mira: [x,y,z], fov?: number): void,
  seguir(idEntidad: number|null): void,

  // ---- acciones de juego ----
  seleccionarHerramienta(id: string): void,      // 'manipulador','herramienta','pistola',...
  modoHerramienta(modo: string): void,           // 'soldar','eje','motor','muelle',...
  generar(idProp: string, pos?: [x,y,z], opciones?: object): number,   // devuelve id de entidad
  agarrar(idEntidad: number): void,
  soltar(impulso?: number): void,
  disparar(veces?: number): void,
  explotar(pos: [x,y,z], potencia: number, radio: number): void,
  prenderFuego(idEntidad: number): void,
  eliminar(idEntidad: number): void,
  limpiarEscena(): void,
  escalaTiempo(x: number): void,
  hud(visible: boolean): void,
  abrirMenu(nombre: 'objetos'|'herramientas'|'opciones'|'principal'|null): void,

  // ---- escenarios reproducibles (para pruebas y para el juicio) ----
  escenario(nombre: string): Promise<void>,
  // Obligatorios:
  //  'inicio'      : estado de partida nueva
  //  'torre'       : torre de 120 cajas apiladas lista para derribar
  //  'cadena'      : cadena de 16 eslabones + péndulo + puente colgante
  //  'ragdolls'    : 10 maniquíes en diversas posturas
  //  'vehiculo'    : buggy listo para conducir en un circuito con rampas
  //  'fuego'       : estructura de madera + bidones de gasolina, lista para arder
  //  'electricidad': circuito con batería, interruptor, motor y detonador
  //  'agua'        : objetos de distintas densidades sobre la balsa
  //  'caos'        : 600+ cuerpos, 10 NPC, 3 vehículos, explosiones encadenadas
  //  'vitrina'     : composición cuidada para capturas de presentación

  // ---- determinismo y medición ----
  semilla(n: number): void,
  resetStats(): void,
  stats(): {
    fps, frameMs, p95FrameMs, drawCalls, triangles, programas,
    entidades, cuerpos, cuerposActivos, restricciones, particulas,
    jsHeapMB, tiempoFisicaMs, tiempoRenderMs, llamadasSonido
  },
  registroErrores(): string[],   // errores internos capturados, vacío si todo bien
}
```

## Reglas
- `listo` **nunca** debe resolver antes de que la primera imagen sea representativa
  (nada de resolver y mostrar una pantalla negra 3 segundos).
- Ninguna función puede lanzar excepción; los fallos se acumulan en `registroErrores()`.
- `escenario()` debe dejar el mundo en un estado **determinista** dada una `semilla`.
- El HUD debe poder ocultarse completamente para capturas limpias.
- El juego debe funcionar con el puntero **no** bloqueado (el arnés no puede bloquear el ratón):
  `mirarRelativo` es el camino de entrada para la vista en automatización.
