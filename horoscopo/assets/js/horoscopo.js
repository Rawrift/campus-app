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
import { MEDIDAS, BANDA_CQW } from '../data/medidas.js';

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
const SECUENCIA = {
  cielo:  60,
  disco:  140,
  figura: 480,
  glifo:  760,
  marca:  900,
  lockup: 980,
};

/* Ancho del lockup de un signo, en cqw, para que la línea "HORÓSCOPO" mida
   lo mismo en los doce. El factor sale de medir cada archivo. */
function anchoLockup(id) {
  return (BANDA_CQW * (MEDIDAS[id]?.lockup.factor ?? 1.3)).toFixed(1);
}

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  const med = MEDIDAS[signo.id] || {};

  // Las tres piezas son opcionales por separado: si falta una, la pieza se
  // sostiene con las demás en vez de mostrar un hueco.
  const glifo = arte.glifo
    ? `<img src="${IMG.arte(arte.glifo)}" alt="" width="${med.glifo?.w || 400}" height="${med.glifo?.h || 400}"
           data-anim="glifo" style="--d:${SECUENCIA.glifo}ms">`
    : `<span class="glifo-fallback" aria-hidden="true" data-anim="glifo"
             style="--d:${SECUENCIA.glifo}ms">${GLIFOS_UNICODE[signo.id]}</span>`;

  const lockup = arte.lockup
    ? `<img src="${IMG.arte(arte.lockup)}" alt="Horóscopo ${signo.nombre}, ${signo.fechas}"
           width="${med.lockup?.w || 680}" height="${med.lockup?.h || 500}"
           data-anim style="--d:${SECUENCIA.lockup}ms">`
    : '';

  const figura = arte.figura
    ? `<img src="${IMG.arte(arte.figura)}" alt="${signo.animal}, símbolo de ${signo.nombre}"
           width="${med.figura?.w || 820}" height="${med.figura?.h || 1000}"
           data-anim="figura" style="--d:${SECUENCIA.figura}ms">`
    : '';

  $('#poster').style.setProperty('--lockup-cqw', `${anchoLockup(signo.id)}cqw`);

  $('#poster').innerHTML = `
    <div class="capa capa--cielo" aria-hidden="true">
      <img src="assets/img/nube-1.webp" alt="" width="620" height="313" data-anim style="--d:${SECUENCIA.cielo}ms">
      <img src="assets/img/nube-6.webp" alt="" width="380" height="225" data-anim style="--d:${SECUENCIA.cielo}ms">
    </div>

    <div class="capa capa--disco">
      <img src="${IMG.disco}" alt="" width="620" height="620" data-anim="disco" style="--d:${SECUENCIA.disco}ms">
    </div>

    <div class="capa capa--animal">${figura}</div>
    <div class="capa capa--glifo">${glifo}</div>
    <div class="capa capa--lockup">${lockup}</div>

    <div class="poster__marca" data-anim style="--d:${SECUENCIA.marca}ms">
      <img src="${IMG.wordmark}" alt="SIESTA" width="420" height="140">
      <span class="regla"></span>
    </div>

    <div class="poster__meta" data-anim style="--d:${SECUENCIA.marca}ms">
      <p class="poster__palabras">${signo.palabras.join('<br>')}</p>
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

async function generarTarjeta(signo) {
  const canvas = document.createElement('canvas');
  canvas.width = CARD.w;
  canvas.height = CARD.h;
  const ctx = canvas.getContext('2d');
  const W = CARD.w, H = CARD.h;

  ctx.fillStyle = '#2d6b87';
  ctx.fillRect(0, 0, W, H);

  const arte = ARTE_DISPONIBLE[signo.id] || {};
  const [papel, disco, glifo, figura, lockup, wordmark, nubeA, nubeB] = await Promise.all([
    cargarImagen('assets/img/papel.webp'),
    cargarImagen(IMG.disco),
    arte.glifo  ? cargarImagen(IMG.arte(arte.glifo))  : null,
    arte.figura ? cargarImagen(IMG.arte(arte.figura)) : null,
    arte.lockup ? cargarImagen(IMG.arte(arte.lockup)) : null,
    cargarImagen(IMG.wordmark),
    cargarImagen('assets/img/nube-1.webp'),
    cargarImagen('assets/img/nube-6.webp'),
  ]);

  /* Las proporciones son las mismas que en pantalla, calcadas del CSS: la
     tarjeta es el mismo poster y no una composición paralela que después se
     desincroniza. Los valores en cqw se convierten con cq(); los que en CSS
     eran porcentaje del alto van directo sobre H. */
  const cq = (n) => W * n / 100;

  if (papel) {
    const esc = Math.max(W / papel.width, H / papel.height);
    const pw = papel.width * esc, ph = papel.height * esc;
    ctx.drawImage(papel, (W - pw) / 2, (H - ph) / 2, pw, ph);
  }

  // Nubes del horizonte, recortadas por el borde inferior
  ctx.globalAlpha = .4;
  if (nubeA) {
    const w = W * .66, h = w * (nubeA.height / nubeA.width);
    ctx.drawImage(nubeA, -W * .14, H + H * .08 - h, w, h);
  }
  if (nubeB) {
    const w = W * .46, h = w * (nubeB.height / nubeB.width);
    ctx.save();
    ctx.translate(W + W * .10, H + H * .03 - h);
    ctx.scale(-1, 1);
    ctx.drawImage(nubeB, 0, 0, w, h);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // Disco
  if (disco) {
    const d = W * .43;
    ctx.drawImage(disco, (W - d) / 2, H * .52, d, d);
  }

  // Figura, apoyada en el borde inferior y dimensionada por alto
  if (figura) {
    const fh = cq(58);
    const fw = fh * (figura.width / figura.height);
    ctx.drawImage(figura, (W - fw) / 2, H - fh, fw, fh);
  }

  // Glifo: encajado en su caja, como el object-fit del CSS
  const gw = cq(17), gh = cq(12);
  if (glifo) {
    const esc = Math.min(gw / glifo.width, gh / glifo.height);
    const w = glifo.width * esc, h = glifo.height * esc;
    ctx.drawImage(glifo, (W - w) / 2, H * .06 + (gh - h) / 2, w, h);
  } else {
    ctx.fillStyle = '#f2e4c6';
    ctx.font = `${Math.round(gh)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(GLIFOS_UNICODE[signo.id], W / 2, H * .06);
  }

  // Lockup, con el ancho normalizado por la banda "HORÓSCOPO"
  if (lockup) {
    const lw = cq(Number(anchoLockup(signo.id)));
    const lh = lw * (lockup.height / lockup.width);
    ctx.drawImage(lockup, (W - lw) / 2, H * .195, lw, lh);
  }

  // Wordmark y su regla, arriba a la izquierda
  if (wordmark) {
    const ww = cq(11);
    const wh = ww * (wordmark.height / wordmark.width);
    ctx.drawImage(wordmark, W * .055, H * .055, ww, wh);
    ctx.fillStyle = '#e6d4b0';
    ctx.fillRect(W * .055, H * .055 + wh + cq(2), cq(5), cq(.5));
  }

  // Palabras clave, arriba a la derecha
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#e6d4b0';
  ctx.font = `500 ${Math.round(cq(2.2))}px Inter, system-ui, sans-serif`;
  ctx.letterSpacing = `${cq(.44).toFixed(1)}px`;
  let y = H * .055;
  for (const palabra of signo.palabras) {
    ctx.fillText(palabra.toUpperCase(), W * .945, y);
    y += cq(2.2) * 1.8;
  }
  ctx.letterSpacing = '0px';

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

  // Anton sólo sostiene la frase de la lectura; el poster usa los lockups
  // dibujados. Se precarga igual para que el texto no salte al aparecer.
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
