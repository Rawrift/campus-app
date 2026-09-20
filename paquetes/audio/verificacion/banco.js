// Banco de render. Corre DENTRO de Chromium: usa el OfflineAudioContext real del
// navegador (mismo motor de audio que veria el jugador, incluido el HRTF).

import { MotorAudio } from '../src/index.js';
import { CASOS, SR, SEMILLA } from './casos.js';
import { metricas, codificarWav, aBase64 } from './analisis.js';

async function renderizar(id) {
  const caso = CASOS.find((c) => c.id === id);
  if (!caso) throw new Error('caso desconocido: ' + id);

  const ctx = new OfflineAudioContext(2, Math.ceil(caso.dur * SR), SR);
  const audio = new MotorAudio({
    contexto: ctx,
    semilla: SEMILLA,
    hrtf: true,
    ...(caso.opcionesMotor || {}),
  });
  audio.iniciado = true;
  audio.fijarReloj(0);
  caso.correr(audio);

  const t0 = performance.now();
  const buf = await ctx.startRendering();
  const ms = performance.now() - t0;

  const canales = [buf.getChannelData(0), buf.getChannelData(1)];
  const m = metricas(canales, SR);
  const wav = codificarWav(canales, SR);

  return {
    id: caso.id,
    grupo: caso.grupo,
    etiqueta: caso.etiqueta,
    metricas: m,
    estadisticas: audio.estadisticas,
    msRender: ms,
    wav: aBase64(wav),
  };
}

globalThis.renderizarCaso = renderizar;
globalThis.listaCasos = () => CASOS.map((c) => ({ id: c.id, grupo: c.grupo, etiqueta: c.etiqueta, dur: c.dur }));
globalThis.bancoListo = true;
