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
    ├── data/signos.js         contenido de los 12 signos + cálculo de signo
    ├── js/horoscopo.js        estados, animación y tarjeta compartible
    └── img/                   disco, glifos, nubes, wordmark
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

**Los glifos son vectores con grano de filtro.** Cada uno pesa ~1,2 KB y es
nítido a cualquier tamaño. El `viewBox` es cuadrado y está centrado en la caja
de tinta real del dibujo, así los doce tienen el mismo tamaño óptico aunque
unos sean anchos (Acuario) y otros altos (Tauro).

**La tipografía se ajusta por medición.** El ancho por carácter de Anton va de
0.387em (PISCIS) a 0.470em (CÁNCER). El script mide el nombre con la métrica
real de la fuente y fija `--ancho-em`, de modo que los doce signos ocupan
exactamente el mismo ancho en la pieza. El poster es un contenedor
(`container-type: inline-size`) y todo lo de adentro va en `cqw`: la
composición es idéntica en un teléfono, en escritorio y al exportarla.

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

695 KB en la primera carga de un signo (373 KB imágenes, 256 KB fuentes).

Las fuentes se sirven desde el propio dominio con `unicode-range`, así que el
navegador sólo baja el subconjunto latin. Los assets originales pesaban 1,5 MB
y bajaron a 396 KB reencodificados al tamaño en que realmente se muestran.

## Lo que falta

**Animales recortados con alpha, los 12.** Es lo único que falta de verdad, y
es la capa que sostiene la composición. La pieza funciona sin ellos —el disco
queda solo y no se rompe nada— pero está diseñada para llevarlos.

Se agregan como `assets/img/animal-<id>.webp` y se pone el nombre del archivo
en `ARTE_DISPONIBLE` dentro de `data/signos.js`. No hay que tocar nada más: ni
el layout, ni la animación, ni el generador de la tarjeta. Al sumarlos conviene
revisar el equilibrio de la composición, porque la figura ocupa el centro y
cambia el peso de la pieza.

No hace falta que vengan recortados: si llegan con fondo, el recorte a alpha se
puede automatizar.

**Revisar el glifo de Escorpio.** Los once glifos que faltaban están dibujados
como SVG en el registro de la serie (trazo de 22 sobre caja de 200, terminales
redondeados, grano por filtro), pero no son los originales de SIESTA: son un
reemplazo hecho acá. El de Escorpio es el más flojo — con ese grosor de trazo
la punta de flecha tiende a macizarse. Si aparecen los originales, se copian a
`assets/img/` y se cambia el nombre del archivo en `ARTE_DISPONIBLE`.

**`favicon.svg` es provisorio.** Usa el disco mandarina para no inventar una
marca compacta que ya existe dibujada. Reemplazar por `icon-s.svg` del
Brand System 1.2.

**Open Graph por signo.** Hoy todos los signos comparten
`assets/img/og-horoscopo.jpg`. Una OG por signo necesita renderizado del lado
del servidor; la tarjeta que ya se genera en el navegador sirve de plantilla.

**Revisar las fechas de Libra.** El poster grande dice 23 SEP — 22 OCT y la
lámina de contacto dice 21 SEP. El código usa 23 SEP, que es lo convencional,
pero conviene unificarlo también en las piezas gráficas.

**Lecturas diarias.** El campo `energia` de cada signo es hoy un texto fijo.
Para pasar a diario se reemplaza por una lectura traída de un JSON o del CMS,
sin tocar el layout ni la animación. El resto del contenido es estable y no
necesita mantenimiento.
