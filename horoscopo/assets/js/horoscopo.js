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
  glifo:    (id) => `assets/img/glifo-${id}.webp`,
  animal:   (id) => `assets/img/animal-${id}.webp`,
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

  // Glifo: ilustración propia si existe, símbolo Unicode con textura si no.
  const glifo = arte.glifo
    ? `<img src="${IMG.glifo(signo.id)}" alt="" width="264" height="264" data-anim="glifo" style="--d:${SECUENCIA[2].delay}ms">`
    : `<span class="glifo-fallback" aria-hidden="true" data-anim="glifo" style="--d:${SECUENCIA[2].delay}ms">${GLIFOS_UNICODE[signo.id]}</span>`;

  // El animal es una capa opcional: si todavía no está exportado con alpha,
  // la composición se sostiene sola en vez de mostrar un hueco.
  const animal = arte.animal
    ? `<img src="${IMG.animal(signo.id)}" alt="${signo.animal}, símbolo de ${signo.nombre}" width="940" height="1170" data-anim="animal" style="--d:${SECUENCIA[1].delay}ms">`
    : '';

  $('#poster').innerHTML = `
    <div class="capa capa--disco">
      <img src="${IMG.disco}" alt="" width="780" height="780" data-anim="disco" style="--d:${SECUENCIA[0].delay}ms">
    </div>
    <div class="capa capa--animal">${animal}</div>
    <div class="capa capa--glifo">${glifo}</div>
    <div class="capa capa--tipo">
      <span class="poster__kicker" data-anim style="--d:${SECUENCIA[3].delay}ms">Horóscopo</span>
      <h1 class="poster__nombre" data-anim
          style="--d:${SECUENCIA[4].delay}ms; --ancho-em:${anchoEm(signo.nombre).toFixed(3)}">${signo.nombre}</h1>
      <p class="poster__fechas" data-anim style="--d:${SECUENCIA[5].delay}ms">${signo.fechas}</p>
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

function dibujarGrano(ctx, w, h, alpha) {
  const datos = ctx.createImageData(w, h);
  const px = datos.data;
  for (let i = 0; i < px.length; i += 4) {
    const v = 120 + Math.random() * 135;
    px[i] = px[i + 1] = px[i + 2] = v;
    px[i + 3] = alpha;
  }
  ctx.putImageData(datos, 0, 0);
}

async function generarTarjeta(signo) {
  const canvas = document.createElement('canvas');
  canvas.width = CARD.w;
  canvas.height = CARD.h;
  const ctx = canvas.getContext('2d');

  // Cielo
  const cielo = ctx.createRadialGradient(CARD.w / 2, CARD.h * 0.2, 60, CARD.w / 2, CARD.h * 0.5, CARD.h * 0.9);
  cielo.addColorStop(0, '#3f819c');
  cielo.addColorStop(0.5, '#2d6b87');
  cielo.addColorStop(1, '#1e5570');
  ctx.fillStyle = cielo;
  ctx.fillRect(0, 0, CARD.w, CARD.h);

  const arte = ARTE_DISPONIBLE[signo.id] || {};
  const [disco, glifo, animal, wordmark] = await Promise.all([
    cargarImagen(IMG.disco),
    arte.glifo ? cargarImagen(IMG.glifo(signo.id)) : null,
    arte.animal ? cargarImagen(IMG.animal(signo.id)) : null,
    cargarImagen(IMG.wordmark),
  ]);

  /* Las proporciones son las mismas que en pantalla: la tarjeta tiene el
     mismo 4:5 que el poster, así que se reutilizan los porcentajes en vez
     de inventar una composición paralela que después se desincroniza. */
  const P = { glifoTop: .012, glifoAlto: .12, discoTop: .176, discoAncho: .52,
              kicker: .615, nombreBase: .885, frase: .925, firma: .955 };

  if (disco) {
    const d = CARD.w * P.discoAncho;
    ctx.drawImage(disco, (CARD.w - d) / 2, CARD.h * P.discoTop, d, d);
  }

  if (animal) {
    const aw = CARD.w * .84;
    const ah = aw * (animal.height / animal.width);
    ctx.drawImage(animal, (CARD.w - aw) / 2, CARD.h * .60 - ah + aw * .5, aw, ah);
  }

  const gAlto = CARD.h * P.glifoAlto;
  if (glifo) {
    const gw = gAlto * (glifo.width / glifo.height);
    ctx.drawImage(glifo, (CARD.w - gw) / 2, CARD.h * P.glifoTop, gw, gAlto);
  } else {
    ctx.fillStyle = '#f2e4c6';
    ctx.font = `${Math.round(gAlto)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(GLIFOS_UNICODE[signo.id], CARD.w / 2, CARD.h * P.glifoTop);
  }

  ctx.textAlign = 'center';

  /* El nombre se ajusta al ancho medido, igual que en pantalla: así los doce
     signos ocupan lo mismo y LEO no queda perdido al lado de CAPRICORNIO.

     Se ancla por línea de base, no por el borde superior: en canvas el
     textBaseline 'top' incluye todo el ascenso de la fuente y no equivale
     al line-height de CSS. */
  const NOMBRE = signo.nombre.toUpperCase();
  ctx.font = '100px Anton, Arial Narrow, sans-serif';
  const anchoBase = ctx.measureText(NOMBRE).width / 100;
  const cuerpo = Math.round(Math.min(CARD.w * .78 / anchoBase, CARD.w * .44));

  ctx.font = `${cuerpo}px Anton, Arial Narrow, sans-serif`;
  ctx.textBaseline = 'alphabetic';
  const base = CARD.h * P.nombreBase;
  ctx.fillStyle = '#f2e4c6';
  ctx.fillText(NOMBRE, CARD.w / 2, base);

  /* El kicker se coloca contra el alto real de las mayúsculas, medido, no
     contra una fracción estimada del cuerpo: Anton tiene la caja alta y con
     un porcentaje fijo el kicker terminaba tapado por el nombre. */
  const m = ctx.measureText(NOMBRE);
  const topeNombre = base - m.actualBoundingBoxAscent;

  ctx.fillStyle = '#e6d4b0';
  ctx.font = '600 28px Inter, system-ui, sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.letterSpacing = '12px';
  ctx.fillText('HORÓSCOPO', CARD.w / 2, topeNombre - CARD.h * .022);
  ctx.letterSpacing = '0px';

  // La frase es lo que se cita: es el activo que viaja.
  ctx.font = 'italic 40px Newsreader, Georgia, serif';
  ctx.fillStyle = '#e6d4b0';
  ctx.fillText(signo.frase, CARD.w / 2, CARD.h * P.frase);

  if (wordmark) {
    const ww = 190;
    ctx.globalAlpha = .9;
    ctx.drawImage(wordmark, (CARD.w - ww) / 2, CARD.h * P.firma, ww, ww * (wordmark.height / wordmark.width));
    ctx.globalAlpha = 1;
  }

  // Grano encima de todo, en su propia capa para no teñir el resto
  const gr = document.createElement('canvas');
  gr.width = CARD.w; gr.height = CARD.h;
  dibujarGrano(gr.getContext('2d'), CARD.w, CARD.h, 26);
  ctx.globalCompositeOperation = 'overlay';
  ctx.drawImage(gr, 0, 0);
  ctx.globalCompositeOperation = 'source-over';

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
