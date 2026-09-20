// Dibujo de forma de onda + espectrograma sobre Canvas, dentro de Chromium.
// Escala de frecuencia LOGARITMICA: es la unica en la que un impacto se lee bien, porque
// los modos graves (que son los que cambian con la masa) ocupan la mitad inferior en vez
// de aplastarse contra el borde, como pasaria en escala lineal.

import { espectrograma, aMono, envolvente } from './analisis.js';

const FMIN = 30, FMAX = 18000;
const PISO_DB = -96;          // suelo del espectrograma
const TECHO_DB = -6;

function color(v) {
  // Paleta perceptualmente creciente (negro -> azul -> magenta -> naranja -> blanco).
  const t = Math.max(0, Math.min(1, v));
  const p = [
    [0.00, 8, 10, 24], [0.18, 32, 24, 96], [0.38, 110, 30, 140],
    [0.58, 190, 50, 110], [0.76, 240, 110, 50], [0.90, 252, 194, 80], [1.00, 255, 250, 235],
  ];
  for (let i = 0; i < p.length - 1; i++) {
    if (t >= p[i][0] && t <= p[i + 1][0]) {
      const k = (t - p[i][0]) / (p[i + 1][0] - p[i][0]);
      return [
        Math.round(p[i][1] + (p[i + 1][1] - p[i][1]) * k),
        Math.round(p[i][2] + (p[i + 1][2] - p[i][2]) * k),
        Math.round(p[i][3] + (p[i + 1][3] - p[i][3]) * k),
      ];
    }
  }
  return [255, 250, 235];
}

export function dibujar(canales, sr, info) {
  const An = 1280, Alt = 640;
  const mL = 66, mR = 150, mT = 70, mB = 42;
  const hOnda = 130, hueco = 26;
  const hEsp = Alt - mT - mB - hOnda - hueco;
  const anchoUtil = An - mL - mR;

  const cv = document.createElement('canvas');
  cv.width = An; cv.height = Alt;
  const g = cv.getContext('2d');
  g.fillStyle = '#0c0d14'; g.fillRect(0, 0, An, Alt);

  const mono = aMono(canales);
  const n = mono.length;
  const dur = n / sr;

  // ---------------------------------------------------------------- forma de onda ----
  const yOnda = mT, cOnda = yOnda + hOnda / 2;
  g.fillStyle = '#12131d'; g.fillRect(mL, yOnda, anchoUtil, hOnda);

  // rejilla de dBFS
  g.strokeStyle = 'rgba(255,255,255,0.09)'; g.lineWidth = 1;
  g.fillStyle = 'rgba(255,255,255,0.40)'; g.font = '10px monospace'; g.textAlign = 'right';
  for (const db of [0, -6, -12, -24]) {
    const a = Math.pow(10, db / 20);
    for (const sgn of [1, -1]) {
      const y = Math.round(cOnda - sgn * a * (hOnda / 2)) + 0.5;
      g.beginPath(); g.moveTo(mL, y); g.lineTo(An - mR, y); g.stroke();
    }
    g.fillText(`${db}`, mL - 6, cOnda - a * (hOnda / 2) + 3);
  }
  // linea de recorte
  g.strokeStyle = 'rgba(255,90,90,0.55)';
  for (const sgn of [1, -1]) {
    const y = Math.round(cOnda - sgn * (hOnda / 2)) + 0.5;
    g.beginPath(); g.moveTo(mL, y); g.lineTo(An - mR, y); g.stroke();
  }

  // picos por columna (min/max) + RMS superpuesto
  const porPx = n / anchoUtil;
  g.strokeStyle = '#4fd1ff';
  g.beginPath();
  for (let x = 0; x < anchoUtil; x++) {
    const i0 = Math.floor(x * porPx), i1 = Math.min(n, Math.floor((x + 1) * porPx));
    let mn = 0, mx = 0;
    for (let i = i0; i < i1; i++) { const v = mono[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    g.moveTo(mL + x + 0.5, cOnda - mx * (hOnda / 2));
    g.lineTo(mL + x + 0.5, cOnda - mn * (hOnda / 2));
  }
  g.stroke();

  g.strokeStyle = 'rgba(255,214,102,0.95)'; g.lineWidth = 1.4;
  g.beginPath();
  for (let x = 0; x < anchoUtil; x++) {
    const i0 = Math.floor(x * porPx), i1 = Math.min(n, Math.floor((x + 1) * porPx));
    let s = 0; for (let i = i0; i < i1; i++) s += mono[i] * mono[i];
    const r = Math.sqrt(s / Math.max(1, i1 - i0));
    const y = cOnda - r * (hOnda / 2);
    if (x === 0) g.moveTo(mL + x, y); else g.lineTo(mL + x, y);
  }
  g.stroke(); g.lineWidth = 1;

  // -------------------------------------------------------------- espectrograma ----
  const yEsp = yOnda + hOnda + hueco;
  const nfft = dur > 6 ? 2048 : 1024;
  const salto = Math.max(32, Math.floor((n - nfft) / anchoUtil));
  const e = espectrograma(mono, sr, { nfft, salto });
  const hz = sr / nfft;
  const logMin = Math.log(FMIN), logMax = Math.log(FMAX);

  const img = g.createImageData(anchoUtil, hEsp);
  const d = img.data;
  const [f0r, f0g, f0b] = color(0);
  for (let i = 0; i < d.length; i += 4) { d[i] = f0r; d[i + 1] = f0g; d[i + 2] = f0b; d[i + 3] = 255; }
  for (let x = 0; x < anchoUtil; x++) {
    const t = Math.min(e.tramas - 1, Math.floor((x / anchoUtil) * e.tramas));
    for (let y = 0; y < hEsp; y++) {
      // y=0 es FMAX (arriba), y=hEsp-1 es FMIN (abajo)
      const fr = 1 - y / (hEsp - 1);
      const f = Math.exp(logMin + fr * (logMax - logMin));
      const bFrac = f / hz;
      const b0 = Math.floor(bFrac), b1 = Math.min(e.nBins - 1, b0 + 1);
      if (b0 < 1 || b0 >= e.nBins) continue;
      // Interpolacion + agregado por maximo en la banda que cubre este pixel: sin esto,
      // en la zona aguda (donde un pixel abarca decenas de bins) se pierden los parciales.
      const fSup = Math.exp(logMin + (1 - (y - 1) / (hEsp - 1)) * (logMax - logMin));
      const bSup = Math.min(e.nBins - 1, Math.ceil(fSup / hz));
      let m;
      if (bSup - b0 >= 2) {
        m = 0;
        for (let b = b0; b <= bSup; b++) { const v = e.mags[t * e.nBins + b]; if (v > m) m = v; }
      } else {
        const k = bFrac - b0;
        m = e.mags[t * e.nBins + b0] * (1 - k) + e.mags[t * e.nBins + b1] * k;
      }
      const db = 20 * Math.log10(Math.max(m, 1e-12));
      const v = (db - PISO_DB) / (TECHO_DB - PISO_DB);
      const [r, gg, bb] = color(v);
      const o = (y * anchoUtil + x) * 4;
      d[o] = r; d[o + 1] = gg; d[o + 2] = bb; d[o + 3] = 255;
    }
  }
  g.putImageData(img, mL, yEsp);

  // ejes de frecuencia
  g.strokeStyle = 'rgba(255,255,255,0.13)';
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.font = '10px monospace'; g.textAlign = 'right';
  for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
    const fr = (Math.log(f) - logMin) / (logMax - logMin);
    const y = Math.round(yEsp + (1 - fr) * (hEsp - 1)) + 0.5;
    g.beginPath(); g.moveTo(mL, y); g.lineTo(An - mR, y); g.stroke();
    g.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, mL - 6, y + 3);
  }

  // eje de tiempo
  g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,0.55)';
  g.strokeStyle = 'rgba(255,255,255,0.13)';
  const pasoT = dur <= 1 ? 0.1 : dur <= 4 ? 0.5 : 1;
  for (let t = 0; t <= dur + 1e-6; t += pasoT) {
    const x = Math.round(mL + (t / dur) * anchoUtil) + 0.5;
    g.beginPath(); g.moveTo(x, yEsp); g.lineTo(x, yEsp + hEsp); g.stroke();
    g.fillText(`${t.toFixed(pasoT < 1 ? 1 : 0)}s`, x, Alt - mB + 16);
  }

  // marcos
  g.strokeStyle = 'rgba(255,255,255,0.22)';
  g.strokeRect(mL + 0.5, yOnda + 0.5, anchoUtil - 1, hOnda - 1);
  g.strokeRect(mL + 0.5, yEsp + 0.5, anchoUtil - 1, hEsp - 1);

  // ------------------------------------------------------------------- leyendas ----
  g.textAlign = 'left';
  g.fillStyle = '#eef0ff'; g.font = 'bold 16px system-ui, sans-serif';
  g.fillText(info.etiqueta || info.id, mL, 26);
  g.fillStyle = 'rgba(255,255,255,0.45)'; g.font = '11px monospace';
  g.fillText(info.id, mL, 44);

  const m = info.metricas;
  if (m) {
    const lineas = [
      ['pico', `${m.picoDbfs.toFixed(1)} dBFS`, m.recorte ? '#ff6b6b' : '#8de08d'],
      ['RMS', `${m.rmsDbfs.toFixed(1)} dBFS`, '#cfd3e8'],
      ['cresta', `${m.crestaDb.toFixed(1)} dB`, '#cfd3e8'],
      ['centroide', `${m.centroideHz.toFixed(0)} Hz`, '#ffd666'],
      ['-40 dB', m.t40 === null ? '> render' : `${m.t40.toFixed(2)} s`, '#4fd1ff'],
      ['grave<250', `${m.graveRel.toFixed(1)} dB`, '#b48dff'],
      ['transit.', `${m.transitorios}`, '#cfd3e8'],
      ['recorte', m.recorte ? `SI (${m.muestrasRecortadas})` : 'no', m.recorte ? '#ff6b6b' : '#8de08d'],
    ];
    const xP = An - mR + 12;
    g.font = 'bold 10px system-ui, sans-serif';
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.textAlign = 'left';
    g.fillText('MÉTRICAS', xP, mT - 6);
    g.font = '11px monospace';
    lineas.forEach(([k, v, col], i) => {
      const y = mT + 12 + i * 17;
      g.fillStyle = 'rgba(255,255,255,0.38)'; g.textAlign = 'left';
      g.fillText(k, xP, y);
      g.fillStyle = col; g.textAlign = 'right';
      g.fillText(v, An - 10, y + 12);
      g.strokeStyle = 'rgba(255,255,255,0.06)';
      g.beginPath(); g.moveTo(xP, y + 17.5); g.lineTo(An - 10, y + 17.5); g.stroke();
    });
  }

  // escala de color
  const xB = An - mR + 12, yB = yEsp + 30, wB = 13, hB = hEsp - 60;
  for (let i = 0; i < hB; i++) {
    const [r, gg, bb] = color(1 - i / hB);
    g.fillStyle = `rgb(${r},${gg},${bb})`;
    g.fillRect(xB, yB + i, wB, 1);
  }
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.strokeRect(xB + 0.5, yB + 0.5, wB, hB);
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.font = '9px monospace'; g.textAlign = 'left';
  g.fillText(`${TECHO_DB}`, xB + wB + 3, yB + 8);
  g.fillText(`${PISO_DB}`, xB + wB + 3, yB + hB);
  g.save(); g.translate(An - 12, yEsp + hEsp / 2); g.rotate(Math.PI / 2);
  g.textAlign = 'center'; g.fillText('dBFS', 0, 0); g.restore();

  g.fillStyle = 'rgba(255,255,255,0.42)'; g.font = '10px system-ui, sans-serif'; g.textAlign = 'left';
  g.fillText('forma de onda — pico (azul) y RMS (ámbar) · dBFS', mL, yOnda - 8);
  g.fillText('espectrograma — frecuencia logarítmica (Hz)', mL, yEsp - 8);

  return cv.toDataURL('image/png');
}

globalThis.dibujarGrafico = dibujar;
