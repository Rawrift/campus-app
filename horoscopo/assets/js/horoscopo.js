/* =========================================================================
   SIESTA · HORÓSCOPO — Lógica de la experiencia

   Tres estados: portal (pedir fecha) → revelado (armar el poster) → lectura.
   El estado vive en la URL, así que cualquier resultado es un link que se
   puede compartir y que abre directo en la pieza del signo.
   ========================================================================= */

import {
  SIGNOS, GLIFOS_UNICODE, ARTE_DISPONIBLE,
  porId, signoDe, diasDelMes, MESES,
} from '../data/signos.js';

const $ = (sel, ctx = document) => ctx.querySelector(sel);

const IMG = {
  disco:    'assets/img/disco.webp',
  wordmark: 'assets/img/wordmark-siesta.webp',
  // Los nombres de archivo salen de ARTE_DISPONIBLE, no se arman acá: cada
  // signo puede traer su glifo en el formato que corresponda (el de Aries es
  // el webp original de la serie; los otros once, SVG dibujados).
  arte:     (archivo) => `assets/img/${archivo}`,
};

/* La secuencia del armado. El orden importa: es el poster construyéndose
   por capas, de fondo a frente. Los tiempos salen de los tokens de
   movimiento del manual (180–400 ms, encadenados). */
const SECUENCIA = [
  { capa: 'disco',  delay: 120 },
  { capa: 'animal', delay: 460 },
  { capa: 'glifo',  delay: 700 },
  { capa: 'kicker', delay: 860 },
  { capa: 'nombre', delay: 940 },
  { capa: 'fechas', delay: 1060 },
];

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Ancho del nombre en el display, medido con la métrica real de la fuente.
   El ancho por carácter de Anton va de 0.387em (PISCIS) a 0.470em (CÁNCER):
   con un promedio, los nombres cortos quedan chicos y los largos se salen.
   Midiendo, los doce ocupan exactamente el mismo ancho en la pieza. */
const medidor = document.createElement('canvas').getContext('2d');

function anchoEm(texto) {
  medidor.font = '100px Anton, Arial Narrow, sans-serif';
  return medidor.measureText(texto.toUpperCase()).width / 100;
}

/* --- Selector de fecha --------------------------------------------------- */

function armarSelectores() {
  const selDia = $('#dia');
  const selMes = $('#mes');

  MESES.forEach((nombre, i) => {
    selMes.append(new Option(nombre, String(i + 1)));
  });

  const poblarDias = () => {
    const mes = Number(selMes.value) || 1;
    const max = diasDelMes(mes);
    const previo = Number(selDia.value);
    selDia.textContent = '';
    for (let d = 1; d <= max; d++) selDia.append(new Option(String(d), String(d)));
    // Si el mes nuevo tiene menos días, el 31 de marzo no debe quedar
    // seleccionado al pasar a abril.
    selDia.value = String(Math.min(previo || 1, max));
  };

  selMes.addEventListener('change', poblarDias);
  poblarDias();
}

/* --- Render del poster --------------------------------------------------- */

function renderPoster(signo) {
  const arte = ARTE_DISPONIBLE[signo.id] || {};

  // Glifo: dibujo propio si existe, símbolo Unicode con textura si no.
  const glifo = arte.glifo
    ? `<img src="${IMG.arte(arte.glifo)}" alt="" width="420" height="420" data-anim="glifo" style="--d:${SECUENCIA[2].delay}ms">`
    : `<span class="glifo-fallback" aria-hidden="true" data-anim="glifo" style="--d:${SECUENCIA[2].delay}ms">${GLIFOS_UNICODE[signo.id]}</span>`;

  // El animal es una capa opcional: si todavía no está exportado con alpha,
  // la composición se sostiene sola en vez de mostrar un hueco.
  const animal = arte.animal
    ? `<img src="${IMG.arte(arte.animal)}" alt="${signo.animal}, símbolo de ${signo.nombre}" data-anim="animal" style="--d:${SECUENCIA[1].delay}ms">`
    : '';

  // Las fechas vienen como "21 MAR — 19 ABR" y en el poster van en dos
  // líneas, una por extremo, como en las piezas de la serie.
  const fechas = signo.fechas.split('—').map((t) => t.trim()).join('<br>');

  $('#poster').innerHTML = `
    <div class="capa capa--cielo" aria-hidden="true">
      <img src="assets/img/nube-1.webp" alt="" width="705" height="356" data-anim style="--d:60ms">
      <img src="assets/img/nube-6.webp" alt="" width="393" height="233" data-anim style="--d:60ms">
    </div>
    <div class="capa capa--disco">
      <img src="${IMG.disco}" alt="" width="800" height="800" data-anim="disco" style="--d:${SECUENCIA[0].delay}ms">
    </div>
    <div class="capa capa--animal">${animal}</div>
    <div class="capa capa--glifo">${glifo}</div>

    <div class="poster__marca" data-anim style="--d:${SECUENCIA[3].delay}ms">
      <img src="${IMG.wordmark}" alt="SIESTA" width="420" height="140">
      <span class="regla"></span>
    </div>

    <div class="poster__meta" data-anim style="--d:${SECUENCIA[3].delay}ms">
      <p class="poster__palabras">${signo.palabras.join('<br>')}</p>
      <span class="regla"></span>
      <p class="poster__fechas">${fechas}</p>
    </div>

    <div class="poster__tipo">
      <h1 class="poster__nombre" data-anim
          style="--d:${SECUENCIA[4].delay}ms; --ancho-em:${anchoEm(signo.nombre).toFixed(3)}">${signo.nombre}</h1>
      <p class="poster__frase" data-anim style="--d:${SECUENCIA[5].delay}ms">${signo.frase}</p>
      <span class="regla" data-anim style="--d:${SECUENCIA[5].delay}ms"></span>
    </div>`;

  // Forzar un reflow antes de agregar la clase para que la animación
  // arranque siempre, incluso al cambiar de signo sin recargar.
  const escena = $('#escena');
  escena.classList.remove('entra');
  void escena.offsetWidth;
  escena.classList.add('entra');
}

/* --- Render de la lectura ------------------------------------------------ */

function renderLectura(signo) {
  const bloque = (titulo, texto, mod = '') => `
    <section class="bloque ${mod} revela">
      <h2 class="bloque__titulo">${titulo}</h2>
      <p class="bloque__texto">${texto}</p>
    </section>`;

  const afines = signo.afines
    .map((id) => porId(id))
    .filter(Boolean)
    .map(
      (s) => `<li><a href="?signo=${s.id}" data-signo="${s.id}">
        <span class="simbolo" aria-hidden="true">${GLIFOS_UNICODE[s.id]}</span>${s.nombre}
      </a></li>`
    )
    .join('');

  $('#lectura').innerHTML = `
    <p class="lectura__frase revela">${signo.frase}</p>

    <dl class="ficha revela">
      <div class="ficha__dato"><dt class="ficha__label">Elemento</dt><dd class="ficha__valor">${signo.elemento}</dd></div>
      <div class="ficha__dato"><dt class="ficha__label">Regente</dt><dd class="ficha__valor">${signo.regente}</dd></div>
      <div class="ficha__dato"><dt class="ficha__label">Modalidad</dt><dd class="ficha__valor">${signo.modalidad}</dd></div>
      <div class="ficha__dato"><dt class="ficha__label">Número</dt><dd class="ficha__valor">${signo.numero}</dd></div>
    </dl>

    <ul class="palabras revela">${signo.palabras.map((p) => `<li>${p}</li>`).join('')}</ul>

    ${bloque('Quién sos', signo.retrato)}
    ${bloque('Tu energía', signo.energia)}
    ${bloque('En el amor', signo.amor)}
    ${bloque('En el trabajo', signo.trabajo)}
    ${bloque('Tu sombra', signo.sombra, 'bloque--sombra')}

    <section class="bloque revela">
      <h2 class="bloque__titulo">Te entendés con</h2>
      <ul class="afines">${afines}</ul>
    </section>

    <section class="compartir revela">
      <h2 class="compartir__titulo">Mandale esto a alguien que ya sabés de qué signo es.</h2>
      <p class="compartir__nota">Se descarga como imagen o se comparte con link.</p>
      <div class="compartir__acciones">
        <button class="boton boton--primario" id="btn-compartir" type="button">Compartir mi signo</button>
        <button class="boton boton--linea" id="btn-copiar" type="button">Copiar link</button>
        <a class="boton boton--linea" href="./" id="btn-otro">Probar otra fecha</a>
      </div>
      <p class="aviso" id="aviso" role="status" aria-live="polite"></p>
    </section>`;

  observarRevelados();
}

/* --- Revelado por scroll -------------------------------------------------- */

let observer;

function observarRevelados() {
  if (reduceMotion) {
    document.querySelectorAll('.revela').forEach((el) => el.classList.add('visible'));
    return;
  }

  observer?.disconnect();
  observer = new IntersectionObserver(
    (entradas) => {
      entradas.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('visible');
        observer.unobserve(e.target);   // una sola vez: no es un efecto de scroll
      });
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.1 }
  );

  document.querySelectorAll('.revela').forEach((el) => observer.observe(el));
}

/* --- Tarjeta compartible -------------------------------------------------- */

/* Se genera del lado del cliente en 1080×1350, el formato de feed del
   manual. Nada de servidor: la imagen sale del mismo navegador. */

const CARD = { w: 1080, h: 1350 };

function cargarImagen(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);   // una capa que falta no rompe la tarjeta
    img.src = src;
  });
}

/* Dibuja un texto en mayúsculas con tracking y salto de línea por ancho.
   Canvas no tiene wrapping: hay que medir palabra por palabra. */
function parrafo(ctx, texto, x, y, maxAncho, alto) {
  const palabras = texto.toUpperCase().split(' ');
  let linea = '';
  let cursor = y;
  for (const w of palabras) {
    const prueba = linea ? `${linea} ${w}` : w;
    if (ctx.measureText(prueba).width > maxAncho && linea) {
      ctx.fillText(linea, x, cursor);
      cursor += alto;
      linea = w;
    } else {
      linea = prueba;
    }
  }
  if (linea) { ctx.fillText(linea, x, cursor); cursor += alto; }
  return cursor;
}

async function generarTarjeta(signo) {
  const canvas = document.createElement('canvas');
  canvas.width = CARD.w;
  canvas.height = CARD.h;
  const ctx = canvas.getContext('2d');

  // Papel de fondo: el mismo asset de la serie que usa el poster en pantalla.
  ctx.fillStyle = '#2d6b87';
  ctx.fillRect(0, 0, CARD.w, CARD.h);

  const arte = ARTE_DISPONIBLE[signo.id] || {};
  const [papel, disco, glifo, animal, wordmark, nubeA, nubeB] = await Promise.all([
    cargarImagen('assets/img/papel.webp'),
    cargarImagen(IMG.disco),
    arte.glifo ? cargarImagen(IMG.arte(arte.glifo)) : null,
    arte.animal ? cargarImagen(IMG.arte(arte.animal)) : null,
    cargarImagen(IMG.wordmark),
    cargarImagen('assets/img/nube-1.webp'),
    cargarImagen('assets/img/nube-6.webp'),
  ]);

  /* Las proporciones son las mismas que en pantalla, calcadas del CSS: la
     tarjeta es el mismo poster, no una composición paralela que después se
     desincroniza. Los porcentajes de X van sobre el ancho; los de Y, sobre
     lo que corresponda según de dónde salen en el CSS. */
  const W = CARD.w, H = CARD.h;
  const cq = (n) => W * n / 100;   // equivalente de la unidad cqw

  if (papel) {
    // cover: se escala al lado que falte y se centra, como background-size
    const esc = Math.max(W / papel.width, H / papel.height);
    const pw = papel.width * esc, ph = papel.height * esc;
    ctx.drawImage(papel, (W - pw) / 2, (H - ph) / 2, pw, ph);
  }

  // Nubes del horizonte
  ctx.globalAlpha = .42;
  if (nubeA) {
    const w = W * .66, h = w * (nubeA.height / nubeA.width);
    ctx.drawImage(nubeA, -W * .14, H + H * .09 - h, w, h);
  }
  if (nubeB) {
    const w = W * .46, h = w * (nubeB.height / nubeB.width);
    ctx.save();
    ctx.translate(W + W * .10, H + H * .04 - h);
    ctx.scale(-1, 1);
    ctx.drawImage(nubeB, 0, 0, w, h);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // Disco
  if (disco) {
    const d = W * .47;
    ctx.drawImage(disco, (W - d) / 2, cq(28), d, d);
  }

  // Animal
  if (animal) {
    const aw = W * .76;
    const ah = aw * (animal.height / animal.width);
    ctx.drawImage(animal, (W - aw) / 2, H - H * .12 - ah, aw, ah);
  }

  // Glifo
  const gw = W * .19;
  if (glifo) {
    ctx.drawImage(glifo, (W - gw) / 2, cq(11), gw, gw * (glifo.height / glifo.width));
  } else {
    ctx.fillStyle = '#f2e4c6';
    ctx.font = `${Math.round(cq(17))}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(GLIFOS_UNICODE[signo.id], W / 2, cq(11));
  }

  const regla = (x, y, alineado = 'left') => {
    ctx.fillStyle = '#e6d4b0';
    const w = cq(5);
    ctx.fillRect(alineado === 'right' ? x - w : x, y, w, cq(.55));
  };

  // Wordmark arriba a la izquierda
  if (wordmark) {
    const ww = cq(10);
    ctx.drawImage(wordmark, W * .05, H * .145, ww, ww * (wordmark.height / wordmark.width));
    regla(W * .05, H * .145 + ww * (wordmark.height / wordmark.width) + cq(2));
  }

  // Palabras clave y fechas, arriba a la derecha
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#e6d4b0';
  ctx.font = `500 ${Math.round(cq(2.5))}px Inter, system-ui, sans-serif`;
  ctx.letterSpacing = `${cq(.5).toFixed(1)}px`;
  const altoMeta = cq(2.5) * 1.85;
  let my = H * .15;
  for (const palabra of signo.palabras) {
    ctx.fillText(palabra.toUpperCase(), W * .95, my);
    my += altoMeta;
  }
  my += cq(2.4);
  regla(W * .95, my, 'right');
  my += cq(.55) + cq(2.4);
  for (const t of signo.fechas.split('—').map((x) => x.trim())) {
    ctx.fillText(t, W * .95, my);
    my += altoMeta;
  }
  ctx.letterSpacing = '0px';

  // Nombre grande a la izquierda
  const NOMBRE = signo.nombre.toUpperCase();
  ctx.font = '100px Anton, Arial Narrow, sans-serif';
  const anchoBase = ctx.measureText(NOMBRE).width / 100;
  const cuerpo = Math.round(Math.min(cq(14.5), cq(58) / anchoBase));

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `${cuerpo}px Anton, Arial Narrow, sans-serif`;
  ctx.fillStyle = '#f2e4c6';
  const m = ctx.measureText(NOMBRE);
  const base = H * .32 + m.actualBoundingBoxAscent;
  ctx.fillText(NOMBRE, W * .05, base);

  // Frase debajo, en versalitas con tracking, y la regla de cierre
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#e6d4b0';
  ctx.font = `500 ${Math.round(cq(2.6))}px Inter, system-ui, sans-serif`;
  ctx.letterSpacing = `${cq(.62).toFixed(1)}px`;
  const finFrase = parrafo(ctx, signo.frase, W * .05, base + cq(4), cq(24), cq(2.6) * 2);
  ctx.letterSpacing = '0px';
  regla(W * .05, finFrase + cq(1.6));

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

function avisar(texto) {
  const aviso = $('#aviso');
  if (aviso) aviso.textContent = texto;
}

async function compartir(signo) {
  const btn = $('#btn-compartir');
  btn.disabled = true;
  avisar('Armando tu imagen…');

  try {
    await document.fonts.ready;      // sin esto el canvas dibuja con la fuente de respaldo
    const blob = await generarTarjeta(signo);
    if (!blob) throw new Error('sin blob');

    const archivo = new File([blob], `siesta-horoscopo-${signo.id}.png`, { type: 'image/png' });
    const url = `${location.origin}${location.pathname}?signo=${signo.id}`;

    if (navigator.canShare?.({ files: [archivo] })) {
      await navigator.share({
        files: [archivo],
        title: `${signo.nombre} · Horóscopo SIESTA`,
        text: signo.frase,
      });
      avisar('');
      return;
    }

    // Sin Web Share (escritorio): se descarga la imagen.
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(blob);
    enlace.download = archivo.name;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
    avisar('Imagen descargada. El link también está copiado.');
    navigator.clipboard?.writeText(url).catch(() => {});
  } catch (e) {
    // Cancelar el diálogo de compartir no es un error que valga reportar.
    if (e?.name !== 'AbortError') avisar('No se pudo generar la imagen. Probá de nuevo.');
  } finally {
    btn.disabled = false;
  }
}

async function copiarLink(signo) {
  const url = `${location.origin}${location.pathname}?signo=${signo.id}`;
  try {
    await navigator.clipboard.writeText(url);
    avisar('Link copiado.');
  } catch {
    avisar(url);   // si el portapapeles está bloqueado, al menos se puede copiar a mano
  }
}

/* --- Navegación y estado -------------------------------------------------- */

function mostrarSigno(signo, { empujarHistorial = true } = {}) {
  document.title = `${signo.nombre} · Horóscopo SIESTA`;
  $('#portal').hidden = true;
  $('#resultado').hidden = false;
  // El poster ya lleva el wordmark y la metadata: el encabezado del sitio
  // repetiría la marca dos veces en la misma pantalla.
  document.body.classList.add('con-signo');

  renderPoster(signo);
  renderLectura(signo);

  $('#btn-compartir').addEventListener('click', () => compartir(signo));
  $('#btn-copiar').addEventListener('click', () => copiarLink(signo));

  // Los signos afines navegan sin recargar, manteniendo la animación.
  $('#lectura').querySelectorAll('[data-signo]').forEach((a) => {
    a.addEventListener('click', (ev) => {
      ev.preventDefault();
      const destino = porId(a.dataset.signo);
      if (destino) {
        mostrarSigno(destino);
        window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    });
  });

  if (empujarHistorial) {
    history.pushState({ signo: signo.id }, '', `?signo=${signo.id}`);
  }
}

function mostrarPortal() {
  document.title = 'Horóscopo · SIESTA';
  $('#resultado').hidden = true;
  $('#portal').hidden = false;
  document.body.classList.remove('con-signo');
}

async function init() {
  armarSelectores();

  // Sin esperar a la fuente, el medidor devuelve la métrica de la de
  // respaldo y el nombre del signo queda con el tamaño equivocado.
  try { await document.fonts.load('100px Anton'); } catch { /* seguimos con el respaldo */ }

  $('#form-fecha').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const dia = Number($('#dia').value);
    const mes = Number($('#mes').value);
    const signo = signoDe(dia, mes);
    if (signo) mostrarSigno(signo);
  });

  // Atrás/adelante del navegador vuelven donde corresponde.
  window.addEventListener('popstate', () => {
    const id = new URLSearchParams(location.search).get('signo');
    const signo = id && porId(id);
    if (signo) mostrarSigno(signo, { empujarHistorial: false });
    else mostrarPortal();
  });

  // Quien abre un link compartido cae directo en la pieza, no en el home.
  const idInicial = new URLSearchParams(location.search).get('signo');
  const signoInicial = idInicial && porId(idInicial);
  if (signoInicial) mostrarSigno(signoInicial, { empujarHistorial: false });
  else observarRevelados();
}

init();
