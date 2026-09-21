# FRAGUA — caja de arena física

Sandbox 3D en navegador. Three.js r186 + Rapier3D 0.20, WebGL2.

## Ejecutar

```bash
cd juego
npm install
npm run build      # deja el build estático en dist/
npx vite preview   # o servir dist/ con cualquier servidor estático
```

Para desarrollo con recarga: `npm run dev`.

> El build no se versiona: pesa 3,6 MB y cada recompilación añadiría otra copia al historial.

## Controles

```
WASD moverse · Shift correr · Espacio saltar · V volar
Clic izq agarrar y lanzar · Clic der congelar · R descongelar todo
Rueda acercar/alejar · E + ratón rotar · T cámara lenta
G caja · B bidón de gasolina · N bola de acero · H ocultar interfaz
```

Si el navegador deniega el bloqueo de puntero (pasa dentro de un iframe), mantén pulsado el
botón izquierdo y arrastra para mirar.

## Pruebas

```bash
node pruebas/masas.mjs    # las masas contra masas reales conocidas
node pruebas/fisica.mjs   # determinismo, momento, restricciones, oclusión y estrés
```

Ambas corren en Node sin navegador. La de física cazó tres fallos reales antes de que
llegaran al juego, entre ellos que Rapier no construye su índice espacial hasta el primer
`step()`, lo que hacía que **todos** los raycast devolvieran "nada" en silencio.

## Estado

Implementado: mundo, jugador, manipulador físico, generación de props, explosiones con
oclusión, cámara lenta, presupuesto de luces, oclusión ambiental, interfaz en español y la
API de automatización `window.__JUEGO`.

Pendiente: herramienta multiuso (soldar, ejes, motores, muelles, cuerdas, propulsores), menú
de objetos, NPCs, vehículos, armas, fuego, electricidad, agua, destrucción con fractura, y
conectar el motor de audio, que existe y está verificado pero aún no está cableado.
