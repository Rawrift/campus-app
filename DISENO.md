# FRAGUA — Diseño del sandbox 3D

> "Estoy dentro de una caja de arena física y puedo hacer prácticamente lo que quiera."

Referencia de **libertad, herramientas y emergencia**: Garry's Mod.
Referencia de **presentación** (iluminación, materiales, VFX, animación, UI, audio, sensación
de producto): juegos contemporáneos de alta calidad. Garry's Mod NO es el techo gráfico.

Todo el texto visible al jugador está en **español**.

---

## 1. Pilar de diseño

El juego no se gana ni se pierde. El jugador **compone situaciones**. Todo lo que ve es un
cuerpo físico con propiedades reales, y todos los sistemas se cruzan entre sí. El valor del
juego es el producto cartesiano de sus sistemas, no la suma de sus contenidos.

Regla de oro: **si el jugador imagina una interacción razonable, debe ocurrir.**
Un bidón de gasolina junto a una hoguera explota aunque nadie lo haya programado como "evento".

---

## 2. Sistemas nucleares

### 2.1 Jugador
- Controlador FPS con cápsula: andar, correr, agacharse, saltar, escalar escalones,
  deslizamiento en pendientes, inercia y aceleración con sensación de peso.
- Modo **noclip** (vuelo libre) para construir.
- Empuja cuerpos dinámicos al caminar, con fuerza proporcional a su masa.
- Cámara con balanceo sutil, retroceso de armas, y desenfoque por velocidad contenido.

### 2.2 Manipulador físico (la "physgun")
El verbo central. Debe sentirse perfecto antes que cualquier otra cosa.
- Agarrar a distancia por raycast; el objeto se mantiene en un punto controlado por un muelle
  crítico (PD controller), no por teletransporte: conserva momento e inercia.
- Rueda del ratón: acercar/alejar. `E` + ratón: rotar sobre ejes. `Shift`: rotación fina.
- Clic derecho: **congelar** (cuerpo estático). `R`: descongelar todo lo congelado.
- Soltar con impulso conservando la velocidad de la mano → se puede lanzar.
- Feedback: haz de energía con distorsión, halo en el objeto, sonido de tensión que varía
  con la masa. Un objeto de 400 kg debe *sonar* y *moverse* distinto de uno de 5 kg.

### 2.3 Herramienta multiuso (la "toolgun")
Modos (menú contextual en español):
| Modo | Efecto |
|---|---|
| Soldar | Unión fija entre dos cuerpos |
| Eje | Bisagra con eje libre |
| Motor | Bisagra motorizada, con tecla asignable y control de par |
| Muelle | Muelle amortiguado con rigidez ajustable |
| Cuerda | Restricción de distancia máxima, con cuerda renderizada |
| Propulsor | Empuje continuo conmutable, con llama y humo |
| Globo | Fuerza ascendente con cuerda al objeto |
| Sin colisión | Desactiva la colisión entre dos cuerpos |
| Peso | Cambia la masa del objeto |
| Material | Cambia el material físico y visual |
| Duplicar | Copia el objeto y todo lo que tenga unido |
| Eliminar | Borra |
Cada modo tiene ajustes propios en el panel lateral, en español.

### 2.4 Generador de entidades ("menú de objetos", tecla Q)
Rejilla por categorías con miniaturas renderizadas en vivo:
- **Construcción**: tablones, vigas, placas, ruedas, ejes, bisagras, planchas.
- **Mobiliario y chatarra**: cajas, bidones, palés, sillas, neumáticos, bañeras, ordenadores.
- **Explosivos**: bidón de gasolina, barril explosivo, carga adhesiva, mina, botella incendiaria.
- **Energía**: batería, cable, interruptor, motor eléctrico, lámpara, generador.
- **Vehículos**: buggy, carretilla, chasis, plataforma con propulsores.
- **Seres**: maniquí (ragdoll), NPC pacífico, NPC hostil, torreta.
- **Herramientas de escena**: rampa, plataforma, trampolín, cañón, ventilador.

### 2.5 Materiales sistémicos
Cada cuerpo tiene un material con propiedades que **todos los sistemas leen**:
```
densidad · fricción · restitución · dureza · inflamabilidad · conductividad ·
fragilidad · sonido de impacto · comportamiento al romper
```
- madera: arde, flota, se astilla
- metal: conduce, chispea al raspar, se abolla
- vidrio: frágil, se rompe en fragmentos cortantes
- goma: rebota, no conduce, arde con humo negro
- hormigón: pesado, se desconcha, no arde
- plástico: ligero, se funde
- explosivo: detona por calor o impacto fuerte

### 2.6 Fuego y calor
- El fuego es una entidad que vive sobre un cuerpo, lo calienta y **se propaga** a cuerpos
  inflamables próximos según viento y distancia.
- El calor acumulado puede detonar explosivos, fundir plástico y romper vidrio.
- Se apaga con agua, con el tiempo o por falta de combustible.

### 2.7 Electricidad
- Grafo de nodos: baterías, cables, interruptores, sensores, motores, lámparas, detonadores.
- Un cable conecta dos cuerpos; si ambos son conductores, la corriente pasa.
- Permite circuitos emergentes: sensor de presión → detonador → barril.

### 2.8 Agua
- Volumen de agua con flotación real por densidad: la madera flota, el acero se hunde.
- Arrastre y chapoteo; apaga fuego; los NPC no nadan bien.

### 2.9 Destrucción
- Props frágiles pre-fracturados (celdas de Voronoi) que se rompen al superar un umbral de
  impulso; los fragmentos son cuerpos reales con vida limitada y se funden con el suelo.
- Impactos dejan **calcomanías** (marcas de bala, quemaduras, salpicaduras) sobre superficies.

### 2.10 NPCs y ragdolls
- IA por comportamientos simples: deambular, curiosear, huir, atacar, entrar en pánico por fuego.
- Cuerpo animado que conmuta a **ragdoll articulado** al morir o al recibir un impulso grande,
  con transición continua (el ragdoll hereda la pose y la velocidad).
- Son objetos físicos de pleno derecho: se pueden agarrar, soldar, lanzar y atropellar.

### 2.11 Vehículos
- Buggy con suspensión por raycast, tracción, frenos, derrape y volcado.
- Cualquier construcción del jugador puede volverse vehículo añadiendo ruedas con eje y motor.

### 2.12 Armas
Pistola, escopeta, fusil, lanzacohetes, lanzallamas, cañón de gravedad.
Todas transmiten **impulso físico real** al impacto. Retroceso, casquillos, trazadoras,
destellos de boca, calcomanías, chispas y humo.

### 2.13 Juguetes de presentación
- **Cámara lenta** (`T`): escala de tiempo continua para admirar el caos.
- **Modo foto** (`P`): cámara libre, profundidad de campo, ocultar HUD, encuadre y captura.
- **Duplicador**: guardar y cargar construcciones completas con sus uniones.

---

## 3. Mundo

Polígono industrial al atardecer. Aproximadamente 320 x 320 m jugables.
- Nave principal con entreplanta, vigas y portón (interior amplio para construir).
- Patio de maniobras con contenedores, grúa pórtico y depósito elevado.
- Rampas, torre de andamios, túnel, muro de pruebas, campo abierto con colinas suaves.
- Balsa de agua.
- Zona "campo de tiro" con dianas y estructuras sacrificables.
- Iluminación de atardecer con posibilidad de ciclo día/noche manual.

Debe haber **densidad ambiental**: basura, tuberías, cables, charcos, manchas, vegetación
seca, señales, marcas de neumático. Nada de explanadas vacías.

---

## 4. Interfaz (toda en español)

- **Menú principal**: Jugar · Mapas · Opciones · Controles · Créditos. Fondo con la escena
  real renderizada detrás, no una imagen estática.
- **HUD**: mínimo y limpio. Herramienta activa, munición, retícula contextual que reacciona a
  lo que apuntas, contador de entidades, aviso de rendimiento.
- **Menú de objetos (Q)**: rejilla con miniaturas, búsqueda, favoritos.
- **Menú de herramientas (C)**: lista de modos + panel de ajustes del modo activo.
- **Opciones**: calidad gráfica (Bajo/Medio/Alto/Ultra + escalado de resolución), sombras,
  postprocesado, campo de visión, sensibilidad, volumen, límite de entidades.
- **Consola** (`º`/`~`): comandos de depuración y creación.
- Tipografía y ritmo visual de juego moderno: contraste alto, sin bordes de 1px grises,
  animaciones de entrada breves, sonido de interfaz.

## 5. Controles
```
WASD mover · Shift correr · Ctrl agachar · Espacio saltar · V noclip
Ratón mirar · Clic izq usar · Clic der alternativo
Rueda: acercar/alejar objeto agarrado · E+ratón rotar · R descongelar todo
Q menú de objetos · C menú de herramientas · 1-9 seleccionar
F usar/entrar en vehículo · G soltar · Z deshacer · X vaciar escena
T cámara lenta · P modo foto · F1 ayuda · Esc menú
```

## 6. Audio
Todo sintetizado en WebAudio (sin material con copyright):
- Impactos por material y por momento lineal (un golpe de 400 kg no suena como uno de 2 kg).
- Fricción al arrastrar, tensión del manipulador, fuego, viento ambiental, explosiones con
  cola y compresión, motores, pasos según superficie.
- Mezcla con reverberación distinta dentro y fuera de la nave.

## 7. Criterio de "terminado" (no negociable)
Un crítico independiente, con contexto limpio, debe mirar capturas del juego y **no poder
distinguirlo de un videojuego comercial modesto pero real**. Mientras siga pareciendo una
demo, el trabajo continúa.
