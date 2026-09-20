// Analisis de senal: FFT, metricas objetivas, espectrograma y codificacion WAV.
// Se ejecuta dentro de Chromium, sobre el PCM real que devuelve el OfflineAudioContext.

// --------------------------------------------------------------------------- FFT ----

/** FFT radix-2 en el sitio. `re` e `im` son Float32Array de longitud potencia de dos. */
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

export function ventanaHann(n) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

const dB = (x) => 20 * Math.log10(Math.max(Math.abs(x), 1e-12));

/** Mezcla a mono (media de canales). */
export function aMono(canales) {
  const n = canales[0].length;
  const m = new Float32Array(n);
  for (const c of canales) for (let i = 0; i < n; i++) m[i] += c[i];
  const k = 1 / canales.length;
  for (let i = 0; i < n; i++) m[i] *= k;
  return m;
}

/**
 * Espectrograma por STFT. Devuelve magnitudes lineales por trama y bin.
 */
export function espectrograma(mono, sr, opciones = {}) {
  const nfft = opciones.nfft || 2048;
  const salto = opciones.salto || Math.floor(nfft / 4);
  const w = ventanaHann(nfft);
  const nBins = nfft / 2;
  const tramas = Math.max(1, Math.floor((mono.length - nfft) / salto) + 1);
  const mags = new Float32Array(tramas * nBins);
  const re = new Float32Array(nfft), im = new Float32Array(nfft);
  for (let t = 0; t < tramas; t++) {
    const off = t * salto;
    for (let i = 0; i < nfft; i++) { re[i] = (mono[off + i] || 0) * w[i]; im[i] = 0; }
    fft(re, im);
    for (let b = 0; b < nBins; b++) {
      mags[t * nBins + b] = Math.sqrt(re[b] * re[b] + im[b] * im[b]) / (nfft / 2);
    }
  }
  return { mags, tramas, nBins, nfft, salto, sr };
}

/** Envolvente de energia en ventanas de `ms` milisegundos, en dBFS. */
export function envolvente(mono, sr, ms = 5) {
  const n = Math.max(1, Math.floor((sr * ms) / 1000));
  const tramas = Math.floor(mono.length / n);
  const env = new Float32Array(tramas);
  for (let t = 0; t < tramas; t++) {
    let s = 0;
    for (let i = 0; i < n; i++) { const v = mono[t * n + i]; s += v * v; }
    env[t] = dB(Math.sqrt(s / n));
  }
  return { env, paso: n / sr };
}

/**
 * Deteccion de transitorios por flujo espectral con umbral adaptativo.
 * Es la medida de "densidad de transitorios" que pide el pliego: un golpe de 800 kg*m/s
 * no da un solo frente, da varios (reasentamiento, repique, microimpactos).
 */
export function transitorios(mono, sr) {
  const nfft = 1024, salto = 256;
  const e = espectrograma(mono, sr, { nfft, salto });
  // Flujo espectral en dominio LOGARITMICO. En lineal, el primer frente de un impacto
  // fuerte es tan grande que aplasta el umbral adaptativo y los transitorios posteriores
  // (repique, rebotes, metralla) quedan por debajo: se contarian menos transitorios
  // cuanto MAS denso es el suceso, que es justo lo contrario de lo que hay que medir.
  const flujo = new Float32Array(e.tramas);
  for (let t = 1; t < e.tramas; t++) {
    let s = 0;
    for (let b = 1; b < e.nBins; b++) {
      const a = Math.log10(1 + e.mags[(t - 1) * e.nBins + b] * 1e4);
      const c = Math.log10(1 + e.mags[t * e.nBins + b] * 1e4);
      const d = c - a;
      if (d > 0) s += d;
    }
    flujo[t] = s;
  }
  // Umbral adaptativo: mediana local + margen.
  const V = 18;                       // semiventana (~96 ms)
  const minSep = Math.ceil(0.025 * sr / salto);
  const picos = [];
  let maxFlujo = 0;
  for (let t = 0; t < e.tramas; t++) if (flujo[t] > maxFlujo) maxFlujo = flujo[t];
  if (maxFlujo <= 0) return { n: 0, instantes: [] };
  let ultimo = -1e9;
  for (let t = 1; t < e.tramas - 1; t++) {
    const a = Math.max(0, t - V), b = Math.min(e.tramas, t + V);
    const loc = Array.prototype.slice.call(flujo.subarray(a, b)).sort((x, y) => x - y);
    const med = loc[Math.floor(loc.length / 2)];
    const umbral = med * 1.7 + maxFlujo * 0.030;
    if (flujo[t] > umbral && flujo[t] >= flujo[t - 1] && flujo[t] > flujo[t + 1] && t - ultimo >= minSep) {
      picos.push((t * salto) / sr);
      ultimo = t;
    }
  }
  return { n: picos.length, instantes: picos };
}

/**
 * Metricas objetivas de un render.
 */
export function metricas(canales, sr) {
  const mono = aMono(canales);
  const n = mono.length;

  // Pico verdadero y recorte -----------------------------------------------------------
  let pico = 0, nRecortes = 0, rachaMax = 0, racha = 0;
  for (const c of canales) {
    for (let i = 0; i < c.length; i++) {
      const v = Math.abs(c[i]);
      if (v > pico) pico = v;
      if (v >= 0.9995) { nRecortes++; racha++; if (racha > rachaMax) rachaMax = racha; }
      else racha = 0;
    }
  }

  // Region activa: del primer al ultimo instante por encima de -60 dBFS ----------------
  const umbral = Math.pow(10, -60 / 20) * Math.max(pico, 1e-9);
  let ini = 0, fin = n - 1;
  while (ini < n && Math.abs(mono[ini]) < umbral) ini++;
  while (fin > ini && Math.abs(mono[fin]) < umbral) fin--;
  const activa = Math.max(0, (fin - ini + 1) / sr);

  // RMS sobre la region activa ----------------------------------------------------------
  let s = 0;
  for (let i = ini; i <= fin; i++) s += mono[i] * mono[i];
  const rms = Math.sqrt(s / Math.max(1, fin - ini + 1));

  // Centroide espectral ponderado por energia de trama -----------------------------------
  const e = espectrograma(mono, sr, { nfft: 2048, salto: 512 });
  let numC = 0, denC = 0, bajo = 0, medio = 0, alto = 0;
  const hz = sr / e.nfft;
  for (let t = 0; t < e.tramas; t++) {
    let eT = 0, numT = 0, denT = 0;
    for (let b = 1; b < e.nBins; b++) {
      const m = e.mags[t * e.nBins + b];
      const p = m * m;
      eT += p;
      numT += b * hz * m;
      denT += m;
      const f = b * hz;
      if (f < 250) bajo += p; else if (f < 4000) medio += p; else alto += p;
    }
    if (denT > 1e-10) { numC += (numT / denT) * eT; denC += eT; }
  }
  const centroide = denC > 1e-12 ? numC / denC : 0;
  const totalBanda = bajo + medio + alto + 1e-20;

  // Tiempo de decaimiento a -40 dB desde el pico de la envolvente -------------------------
  const { env, paso } = envolvente(mono, sr, 5);
  let iPico = 0;
  for (let i = 0; i < env.length; i++) if (env[i] > env[iPico]) iPico = i;
  const objetivo = env[iPico] - 40;
  let t40 = null;
  for (let i = iPico; i < env.length; i++) {
    if (env[i] <= objetivo) {
      // Confirma que se mantiene por debajo 30 ms (evita disparos en valles)
      let estable = true;
      const hasta = Math.min(env.length, i + Math.ceil(0.03 / paso));
      for (let j = i; j < hasta; j++) if (env[j] > objetivo) { estable = false; break; }
      if (estable) { t40 = (i - iPico) * paso; break; }
    }
  }

  const tr = transitorios(mono, sr);

  return {
    sr,
    duracion: n / sr,
    duracionActiva: activa,
    picoDbfs: dB(pico),
    picoLineal: pico,
    rmsDbfs: dB(rms),
    crestaDb: dB(pico) - dB(rms),
    centroideHz: centroide,
    t40: t40,                                   // null = no cae 40 dB dentro del render
    graveRel: 10 * Math.log10(bajo / totalBanda + 1e-20),   // energia < 250 Hz, dB relativos
    medioRel: 10 * Math.log10(medio / totalBanda + 1e-20),
    agudoRel: 10 * Math.log10(alto / totalBanda + 1e-20),
    transitorios: tr.n,
    recorte: nRecortes > 0,
    muestrasRecortadas: nRecortes,
    rachaRecorteMax: rachaMax,
  };
}

// --------------------------------------------------------------------------- WAV ----

/** Codifica canales Float32 en un WAV PCM 16 bits. Devuelve Uint8Array. */
export function codificarWav(canales, sr) {
  const nc = canales.length, n = canales[0].length;
  const bytes = 44 + n * nc * 2;
  const buf = new ArrayBuffer(bytes);
  const v = new DataView(buf);
  const txt = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  txt(0, 'RIFF'); v.setUint32(4, bytes - 8, true); txt(8, 'WAVE');
  txt(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, nc, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * nc * 2, true); v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true);
  txt(36, 'data'); v.setUint32(40, n * nc * 2, true);
  let off = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nc; c++) {
      let x = canales[c][i];
      x = x > 1 ? 1 : (x < -1 ? -1 : x);
      v.setInt16(off, Math.round(x * 32767), true);
      off += 2;
    }
  }
  return new Uint8Array(buf);
}

/** Decodifica un WAV PCM 16 bits (el que escribe codificarWav). */
export function decodificarWav(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const nc = v.getUint16(22, true);
  const sr = v.getUint32(24, true);
  const bits = v.getUint16(34, true);
  // Busca el trozo 'data'
  let off = 12;
  let dataOff = 44, dataLen = bytes.length - 44;
  while (off < bytes.length - 8) {
    const id = String.fromCharCode(v.getUint8(off), v.getUint8(off + 1), v.getUint8(off + 2), v.getUint8(off + 3));
    const len = v.getUint32(off + 4, true);
    if (id === 'data') { dataOff = off + 8; dataLen = len; break; }
    off += 8 + len + (len % 2);
  }
  const n = Math.floor(dataLen / (nc * (bits / 8)));
  const canales = [];
  for (let c = 0; c < nc; c++) canales.push(new Float32Array(n));
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nc; c++) {
      canales[c][i] = v.getInt16(dataOff + (i * nc + c) * 2, true) / 32768;
    }
  }
  return { canales, sr };
}

export function aBase64(bytes) {
  let s = '';
  const paso = 0x8000;
  for (let i = 0; i < bytes.length; i += paso) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + paso));
  }
  return btoa(s);
}
