# SIESTA · Horóscopo

Experiencia interactiva de horóscopo para el sitio de SIESTA. La persona pone
su fecha de nacimiento, el poster de su signo se arma capa por capa frente a
ella, y se lleva una pieza para compartir.

Estático y autocontenido: HTML, CSS y JavaScript sin build, sin dependencias y
sin backend. Se puede montar en cualquier stack (Next, Astro, WordPress o un
servidor plano) copiando la carpeta.

## Cómo verlo

Necesita servirse por HTTP: usa módulos ES, que no funcionan sobre `file://`.

```
cd horoscopo
python3 -m http.server 8099
# http://localhost:8099
```

## Estructura

```
horoscopo/
├── index.html
└── assets/
    ├── css/
    │   ├── horoscopo.css      sistema visual y composición
    │   ├── fuentes.css        @font-face auto-hospedados
    │   └── fonts/             Anton · Inter · Newsreader (woff2)
    ├── data/
    │   ├── signos.js          contenido de los 12 signos + cálculo de signo
    │   └── medidas.js         caja de tinta de cada asset, medida
    ├── js/horoscopo.js        estados, animación y tarjeta compartible
    └── img/                   papel, disco, nubes, wordmark
                               + glifo, lockup y figura por signo
```

## Decisiones

**Subidentidad, no la web sobria.** El manual dice *"la web es sobria, las
redes pueden gritar un poco más"*. El horóscopo toma el registro de los
posters (papel, grano, azul cálido, disco mandarina) en vez de la paleta web.
Lo que sí se respeta del Brand System 1.2: Newsreader e Inter para la lectura
y la metadata, la escala de espaciado, los tokens de movimiento y, sin
excepción, las reglas de accesibilidad.

**El armado del poster es la animación.** Las capas entran encadenadas —
disco, animal, glifo, kicker, nombre, fechas — con los tiempos y el easing del
manual (`cubic-bezier(.2,.8,.2,1)`). El disco nace como punto y crece hasta ser
sol: es el punto de marca actuando como firma animada, que el manual habilita
explícitamente. No hay parallax, ni rebotes, ni nada en loop permanente.

**Se pide la fecha, no el signo.** Elegir de una lista de doce es completar un
formulario. Poner la fecha de nacimiento y recibir un resultado es otra cosa.

**El estado vive en la URL.** `?signo=aries` abre directo en la pieza, así que
todo resultado compartido lleva a la pieza y no al home.

**Todo el arte es el original de la serie.** Papel, disco, nubes, wordmark y,
por signo, glifo, lockup tipográfico y figura sobre su roca. Nada se
reconstruye con tipografía web: el nombre de cada signo es el lockup dibujado,
con su textura.

**Los assets se recortan a su caja de tinta.** Venían con mucho margen
transparente y en proporciones distintas, así que dimensionarlos por el borde
del archivo daba tamaños ópticos dispares. Recortados, el tamaño que se les
pide en CSS es el que ocupan. Sus medidas quedan en `data/medidas.js`.

**Los lockups se normalizan por la línea "HORÓSCOPO".** No se pueden escalar
por ancho ni por alto: en LEO el elemento más ancho del bloque es "HORÓSCOPO",
y en CAPRICORNIO es el nombre. Escalando por el borde, "HORÓSCOPO" cambiaría
de tamaño entre signos. Se mide esa banda en cada archivo y se guarda el
factor, de modo que la línea mide lo mismo en los doce y cada nombre conserva
el cuerpo con que fue diseñado: LEO grande, CAPRICORNIO chico.

**La figura se dimensiona por alto y se apoya en el borde inferior**, para que
las doce se lean paradas sobre el mismo piso aunque unas sean anchas
(Capricornio, con la cola) y otras estrechas (la balanza).

El poster es un contenedor (`container-type: inline-size`) y todo lo de
adentro va en `cqw`: la composición es idéntica en un teléfono, en escritorio
y al exportarla a 1080×1350.

**La tarjeta se genera en el navegador**, en 1080×1350 (formato de feed del
manual). No hace falta servidor. En móvil abre el menú nativo de compartir;
en escritorio descarga el PNG y copia el link.

## Accesibilidad

Verificado sobre los elementos renderizados, no sobre los tokens en abstracto:

| Elemento | Contraste | Piso |
|---|---|---|
| Cuerpo de lectura | 6.45:1 | 4.5 |
| Botón principal | 4.87:1 | 4.5 |
| Títulos de sección | 5.57:1 | 4.5 |
| Etiquetas y metadata | 5.57:1 | 4.5 |

Tres correcciones que salieron de medir:

- El botón principal usaba crema sobre mandarina (2.96:1). Ahora usa texto
  oscuro sobre el acento, como indica el propio manual en *03 / Contraste*.
- Los títulos de sección eran mandarina sobre azul (2.7:1). El texto pasó a
  crema; el naranja quedó sólo en el punto, que es decorativo.
- El anillo de foco era naranja (2.7:1, por debajo del 3:1 que pide un
  indicador de foco). Ahora es crema con halo naranja.

Además: `prefers-reduced-motion` desactiva toda la animación sin que la
experiencia dependa de ella, touch targets ≥ 44 px, jerarquía semántica de
headings, y ningún estado comunicado sólo por color.

## Peso

894 KB en la primera carga de un signo: 569 KB de imágenes y 256 KB de
fuentes. Es una experiencia con arte propia en cada pieza y el peso va casi
entero a eso.

Los 36 assets por signo pesaban 11,8 MB y quedaron en 4,1 MB reencodificados
al tamaño en que realmente se muestran. Sólo se descargan los tres del signo
que se está viendo. Las nubes del portal cargan en diferido, así que un link
compartido —que abre directo en la pieza— no las pide. Las fuentes se sirven
desde el propio dominio con `unicode-range`, de modo que el navegador sólo
baja el subconjunto latin.

## Lo que falta

**Rehacer la figura de Capricornio.** Es la única que quedó pendiente de
regenerar. Se reemplaza el archivo `assets/img/figura-capricornio.webp`, se
vuelve a medir y listo; no hay nada que tocar en el código.

**Los lockups no son consistentes entre sí.** Seis vienen en crema plano
(Aries, Tauro, Géminis, Escorpio, Libra, Sagitario) y tres con perfilado
oscuro (Cáncer, Leo, Virgo). Los tres perfilados son consecutivos en el
zodíaco, lo que apunta más a una tanda generada aparte que a una decisión de
diseño. Conviene unificar antes de publicar.

**El glifo de Acuario tiene dos versiones.** El asset suelto es un zigzag de
vértices angulosos; el que aparece en el poster de Acuario son ondas curvas.
No es el mismo dibujo. Acá se usa el asset suelto, que es el que se entregó
como pieza.

**Los posters completos traen un defecto de generación.** En el borde
superior hay una franja con una repetición invertida del logo, el glifo y las
palabras clave, y abajo la roca tiene un reflejo especular. Está en los doce.
Acá no afecta, porque la pieza se recompone por capas, pero si se publican
como imagen hay que recortarlos.

**El nombre sobre el disco no llega a AA.** En los lockups el crema sobre
mandarina da 2.96:1 y el piso para texto grande es 3:1. La composición evita
que el texto chico caiga sobre naranja, que es lo que importa para leer, pero
el bloque tipográfico grande sí lo toca en algunos signos. Es el diseño de la
serie y se respeta; queda anotado, no corregido.

**`favicon.svg` es provisorio.** Usa el disco mandarina para no inventar una
marca compacta que ya existe dibujada. Reemplazar por `icon-s.svg` del
Brand System 1.2.

**Open Graph por signo.** Hoy todos comparten `assets/img/og-horoscopo.jpg`.
Una OG por signo necesita renderizado del lado del servidor; la tarjeta que ya
se genera en el navegador sirve de plantilla.

**Lecturas diarias.** El campo `energia` de cada signo es hoy un texto fijo.
Para pasar a diario se reemplaza por una lectura traída de un JSON o del CMS,
sin tocar el layout ni la animación. El resto del contenido es estable y no
necesita mantenimiento.
