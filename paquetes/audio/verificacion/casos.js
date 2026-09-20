// Catalogo de casos de render. Este modulo se carga DENTRO de Chromium, donde cada caso
// se sintetiza en un OfflineAudioContext real del navegador.
//
// Cada caso es determinista: misma semilla -> mismo PCM -> mismas metricas. Eso permite
// comparar dos ejecuciones y detectar regresiones de verdad, no ruido de medida.

export const SR = 48000;
export const SEMILLA = 20260920;

const EN = [0, 0, -3];        // fuente a 3 m por delante del oyente
const IZQ = [-2.2, 0, -1.2];
const DER = [8, 0, -22];

/** Prepara el oyente en el origen mirando a -Z. */
function oyente(a) {
  a.escucha({ posicion: [0, 1.6, 0], orientacion: { frente: [0, 0, -1], arriba: [0, 1, 0] } });
}

export const CASOS = [
  // === 1. LA MASA CAMBIA EL TIMBRE (caso de prueba explicito del pliego) ==============
  ...[5, 50, 200, 800].map((m) => ({
    id: `masa_${String(m).padStart(3, '0')}`,
    grupo: 'A · La masa cambia el timbre',
    etiqueta: `Impacto metal/hormigón · momento ${m}`,
    dur: 4.0,
    correr(a) {
      oyente(a);
      a.impacto({ material: 'metal', materialB: 'hormigon', momento: m, posicion: EN, cuando: 0.02 });
    },
  })),

  // === 2. MATRIZ DE PARES DE MATERIALES =================================================
  ...[
    ['metal', 'hormigon', 'metal sobre hormigón · chirría y repica'],
    ['metal', 'metal', 'metal sobre metal · repique largo y brillante'],
    ['madera', 'madera', 'madera sobre madera · seco y medio'],
    ['vidrio', 'hormigon', 'vidrio sobre hormigón · se astilla'],
    ['goma', 'metal', 'goma sobre metal · sordo'],
    ['hormigon', 'hormigon', 'hormigón sobre hormigón · mate y grave'],
    ['plastico', 'madera', 'plástico sobre madera'],
    ['grava', 'metal', 'grava sobre metal'],
  ].map(([a1, b1, txt]) => ({
    id: `par_${a1}_${b1}`,
    grupo: 'B · Matriz de pares de materiales (momento 120)',
    etiqueta: txt,
    dur: 4.0,
    correr(a) {
      oyente(a);
      a.impacto({ material: a1, materialB: b1, momento: 120, posicion: EN, cuando: 0.02 });
    },
  })),

  // === 3. DENSIDAD: 200 IMPACTOS EN 300 ms ===============================================
  {
    id: 'densidad_200_con_limitador',
    grupo: 'C · 200 impactos en 300 ms',
    etiqueta: '200 impactos en 300 ms · cadena completa (agrupación + techo de voces + limitador)',
    dur: 5.0,
    correr(a) {
      oyente(a);
      sembrarDensidad(a);
    },
  },
  {
    id: 'densidad_200_sin_limitador',
    grupo: 'C · 200 impactos en 300 ms',
    etiqueta: '200 impactos en 300 ms · MISMO material, cadena maestra desnuda (referencia)',
    dur: 5.0,
    opcionesMotor: { limitador: false },
    correr(a) {
      oyente(a);
      sembrarDensidad(a);
    },
  },
  {
    id: 'densidad_200_sin_agrupacion',
    grupo: 'C · 200 impactos en 300 ms',
    etiqueta: '200 impactos en 300 ms · sin agrupación ni techo de voces, sin limitador',
    dur: 5.0,
    opcionesMotor: { limitador: false, maxVoces: 100000 },
    correr(a) {
      oyente(a);
      sembrarDensidad(a, { agrupar: false });
    },
  },

  // === 4. EXPLOSION =======================================================================
  {
    id: 'explosion_p1', grupo: 'D · Explosión', etiqueta: 'Explosión · potencia 1 (granada)',
    dur: 5.0, correr(a) { oyente(a); a.explosion({ potencia: 1, posicion: [0, 0.5, -8], cuando: 0.03 }); },
  },
  {
    id: 'explosion_p6', grupo: 'D · Explosión', etiqueta: 'Explosión · potencia 6 (bidón de combustible)',
    dur: 6.0, correr(a) { oyente(a); a.explosion({ potencia: 6, posicion: [0, 0.5, -10], cuando: 0.03 }); },
  },

  // === 5. DISPAROS =========================================================================
  ...['pistola', 'escopeta', 'rifle', 'laser'].map((w) => ({
    id: `disparo_${w}`, grupo: 'E · Disparos', etiqueta: `Disparo · ${w}`,
    dur: 3.0, correr(a) { oyente(a); a.disparo({ arma: w, posicion: [0.3, 1.4, -0.6], cuando: 0.02 }); },
  })),

  // === 6. CONTINUOS ========================================================================
  {
    id: 'friccion_metal', grupo: 'F · Continuos', etiqueta: 'Fricción metal · velocidad 0→9→0 m/s',
    dur: 5.0,
    correr(a) {
      oyente(a);
      const pasos = [[0.05, 0.4], [0.6, 2.2], [1.3, 5.0], [2.0, 9.0], [2.8, 5.5], [3.4, 1.5], [3.9, 0]];
      for (const [t, v] of pasos) {
        a.fijarReloj(t);
        a.friccion('caja', v > 0 ? { material: 'metal', velocidad: v, posicion: [-1.5, 0, -2.5] } : null);
      }
    },
  },
  {
    id: 'friccion_madera', grupo: 'F · Continuos', etiqueta: 'Fricción madera · velocidad 0→6→0 m/s',
    dur: 5.0,
    correr(a) {
      oyente(a);
      for (const [t, v] of [[0.05, 0.5], [0.9, 3.0], [1.9, 6.0], [3.0, 2.0], [3.9, 0]]) {
        a.fijarReloj(t);
        a.friccion('tabla', v > 0 ? { material: 'madera', velocidad: v, posicion: [-1.5, 0, -2.5] } : null);
      }
    },
  },
  {
    id: 'fuego', grupo: 'F · Continuos', etiqueta: 'Fuego · intensidad 0.15→1→0',
    dur: 7.0,
    correr(a) {
      oyente(a);
      for (const [t, i] of [[0.05, 0.15], [1.2, 0.45], [2.6, 0.8], [3.8, 1.0], [5.0, 0.4], [5.9, 0]]) {
        a.fijarReloj(t);
        a.fuego('hoguera', i > 0 ? { intensidad: i, posicion: [1.5, 0, -3] } : null);
      }
    },
  },
  {
    id: 'motor', grupo: 'F · Continuos', etiqueta: 'Motor · 800→5200 rpm con carga variable',
    dur: 7.0,
    correr(a) {
      oyente(a);
      const pasos = [[0.05, 800, 0.05], [0.9, 1400, 0.55], [1.8, 2600, 0.8], [2.7, 4200, 0.95],
        [3.6, 5200, 1.0], [4.5, 3000, 0.25], [5.3, 1100, 0.08], [6.2, 0, 0]];
      for (const [t, rpm, carga] of pasos) {
        a.fijarReloj(t);
        a.motor('coche', rpm > 0 ? { rpm, carga, posicion: [2, 0, -5] } : null);
      }
    },
  },
  {
    id: 'manipulador_5kg', grupo: 'F · Continuos', etiqueta: 'Manipulador · masa 5 kg, tensión 0→0.9',
    dur: 4.0,
    correr(a) {
      oyente(a);
      for (const [t, te] of [[0.05, 0.1], [0.8, 0.45], [1.6, 0.9], [2.6, 0.5], [3.2, 0]]) {
        a.fijarReloj(t); a.manipulador({ tension: te, masa: 5 });
      }
    },
  },
  {
    id: 'manipulador_400kg', grupo: 'F · Continuos', etiqueta: 'Manipulador · masa 400 kg, tensión 0→0.9',
    dur: 4.0,
    correr(a) {
      oyente(a);
      for (const [t, te] of [[0.05, 0.1], [0.8, 0.45], [1.6, 0.9], [2.6, 0.5], [3.2, 0]]) {
        a.fijarReloj(t); a.manipulador({ tension: te, masa: 400 });
      }
    },
  },

  // === 7. PASOS ==============================================================================
  {
    id: 'pasos_metal_andar', grupo: 'G · Pasos', etiqueta: 'Pasos sobre metal · andando',
    dur: 3.2,
    correr(a) {
      oyente(a);
      for (let i = 0; i < 5; i++) a.paso({ superficie: 'metal', correr: false, posicion: [0, 0, -0.5], cuando: 0.1 + i * 0.58 });
    },
  },
  {
    id: 'pasos_metal_correr', grupo: 'G · Pasos', etiqueta: 'Pasos sobre metal · corriendo',
    dur: 3.2,
    correr(a) {
      oyente(a);
      for (let i = 0; i < 9; i++) a.paso({ superficie: 'metal', correr: true, posicion: [0, 0, -0.5], cuando: 0.1 + i * 0.32 });
    },
  },
  {
    id: 'pasos_grava_correr', grupo: 'G · Pasos', etiqueta: 'Pasos sobre grava · corriendo',
    dur: 3.2,
    correr(a) {
      oyente(a);
      for (let i = 0; i < 9; i++) a.paso({ superficie: 'grava', correr: true, posicion: [0, 0, -0.5], cuando: 0.1 + i * 0.32 });
    },
  },

  // === 8. ROTURA ==============================================================================
  ...[['vidrio', 2], ['madera', 2], ['hormigon', 3]].map(([m, p]) => ({
    id: `rotura_${m}`, grupo: 'H · Rotura', etiqueta: `Rotura de ${m} · potencia ${p}`,
    dur: 4.0, correr(a) { oyente(a); a.rotura({ material: m, potencia: p, posicion: EN, cuando: 0.03 }); },
  })),

  // === 9. INTERFAZ =============================================================================
  {
    id: 'interfaz', grupo: 'I · Interfaz', etiqueta: 'Interfaz · hover, click, abrir, cerrar, error, aceptar',
    dur: 3.6,
    correr(a) {
      oyente(a);
      ['hover', 'click', 'abrir', 'cerrar', 'error', 'aceptar'].forEach((n, i) => {
        a.fijarReloj(0.1 + i * 0.55); a.interfaz(n);
      });
    },
  },

  // === 10. AMBIENTE Y REVERBERACION ==============================================================
  {
    id: 'ambiente_exterior', grupo: 'J · Ambiente y reverberación',
    etiqueta: 'Exterior · lecho de viento + impacto de referencia',
    dur: 5.0,
    correr(a) {
      oyente(a);
      a.fijarReloj(0); a.ambiente('exterior', 0.3);
      a.impacto({ material: 'metal', materialB: 'hormigon', momento: 150, posicion: EN, cuando: 2.0 });
    },
  },
  {
    id: 'ambiente_nave', grupo: 'J · Ambiente y reverberación',
    etiqueta: 'Interior de nave · zumbido + MISMO impacto (cola de convolución)',
    dur: 5.0,
    correr(a) {
      oyente(a);
      a.fijarReloj(0); a.ambiente('interior_nave', 0.3);
      a.impacto({ material: 'metal', materialB: 'hormigon', momento: 150, posicion: EN, cuando: 2.0 });
    },
  },
  {
    id: 'ambiente_transicion', grupo: 'J · Ambiente y reverberación',
    etiqueta: 'Transición exterior → nave en 1.5 s, con un impacto en cada extremo',
    dur: 7.0,
    correr(a) {
      oyente(a);
      a.fijarReloj(0); a.ambiente('exterior', 0.3);
      a.impacto({ material: 'metal', materialB: 'hormigon', momento: 150, posicion: EN, cuando: 0.8 });
      a.fijarReloj(2.2); a.ambiente('interior_nave', 1.5);
      a.impacto({ material: 'metal', materialB: 'hormigon', momento: 150, posicion: EN, cuando: 4.6 });
    },
  },

  // === 11. AUDIO POSICIONAL ==========================================================================
  {
    id: 'espacial_cerca_izquierda', grupo: 'K · Audio posicional',
    etiqueta: 'Impacto a 2.5 m a la izquierda', dur: 3.5,
    correr(a) { oyente(a); a.impacto({ material: 'metal', materialB: 'hormigon', momento: 150, posicion: IZQ, cuando: 0.02 }); },
  },
  {
    id: 'espacial_lejos_derecha', grupo: 'K · Audio posicional',
    etiqueta: 'El MISMO impacto a 24 m a la derecha (atenuación + absorción del aire)', dur: 3.5,
    correr(a) { oyente(a); a.impacto({ material: 'metal', materialB: 'hormigon', momento: 150, posicion: DER, cuando: 0.02 }); },
  },
  {
    id: 'espacial_ocluido', grupo: 'K · Audio posicional',
    etiqueta: 'El MISMO impacto a 2.5 m pero con oclusión 0.85 (tras un muro)', dur: 3.5,
    correr(a) { oyente(a); a.impacto({ material: 'metal', materialB: 'hormigon', momento: 150, posicion: IZQ, oclusion: 0.85, cuando: 0.02 }); },
  },

  // === 12. ESCALA DE TIEMPO ============================================================================
  {
    id: 'tiempo_normal', grupo: 'L · Cámara lenta',
    etiqueta: 'Escala 1.0 · impacto + explosión + disparo', dur: 5.0,
    correr(a) { oyente(a); escenaTiempo(a, 1.0); },
  },
  {
    id: 'tiempo_lento_02', grupo: 'L · Cámara lenta',
    etiqueta: 'Escala 0.2 · la MISMA escena (tono, colas y filtro maestro)', dur: 9.0,
    correr(a) { oyente(a); escenaTiempo(a, 0.2); },
  },
  {
    id: 'tiempo_lento_05', grupo: 'L · Cámara lenta',
    etiqueta: 'Escala 0.5 · la MISMA escena', dur: 7.0,
    correr(a) { oyente(a); escenaTiempo(a, 0.5); },
  },

  // === 13. ESCENA COMPLETA =================================================================================
  {
    id: 'escena_completa', grupo: 'M · Escena mixta',
    etiqueta: 'Nave: ambiente + motor + fuego + pasos + disparos + explosión con metralla',
    dur: 9.0,
    correr(a) {
      oyente(a);
      a.fijarReloj(0); a.ambiente('interior_nave', 0.5);
      a.fijarReloj(0.1); a.motor('grua', { rpm: 1200, carga: 0.3, posicion: [4, 0, -7] });
      a.fijarReloj(0.2); a.fuego('barril', { intensidad: 0.5, posicion: [-4, 0, -6] });
      for (let i = 0; i < 6; i++) a.paso({ superficie: 'metal', correr: true, posicion: [0, 0, -1], cuando: 0.4 + i * 0.3 });
      a.disparo({ arma: 'escopeta', posicion: [0.3, 1.4, -0.6], cuando: 2.4 });
      a.disparo({ arma: 'escopeta', posicion: [0.3, 1.4, -0.6], cuando: 3.1 });
      a.fijarReloj(3.2); a.motor('grua', { rpm: 3800, carga: 0.9, posicion: [4, 0, -7] });
      a.rotura({ material: 'vidrio', potencia: 3, posicion: [-2, 1, -5], cuando: 3.6 });
      a.explosion({ potencia: 5, posicion: [3, 0.5, -9], cuando: 4.4 });
      a.fijarReloj(4.5); a.fuego('barril', { intensidad: 1.0, posicion: [-4, 0, -6] });
      a.fijarReloj(6.5); a.motor('grua', { rpm: 1000, carga: 0.1, posicion: [4, 0, -7] });
    },
  },
];

function sembrarDensidad(a, extra = {}) {
  // 200 impactos repartidos en 300 ms sobre una esfera de 6 m: exactamente el caso del
  // pliego. Materiales y momentos variados, como en un derrumbe real.
  const mats = ['hormigon', 'metal', 'vidrio', 'grava', 'madera'];
  let s = 12345;
  const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = 0; i < 200; i++) {
    const t = 0.05 + (i / 200) * 0.3 + r() * 0.004;
    const ang = r() * Math.PI * 2;
    const rad = 1 + r() * 5;
    a.impacto({
      material: mats[Math.floor(r() * mats.length)],
      materialB: 'hormigon',
      momento: 20 + r() * 260,
      posicion: [Math.cos(ang) * rad, r() * 2, -2 - Math.sin(ang) * rad],
      cuando: t,
      ...extra,
    });
  }
}

function escenaTiempo(a, escala) {
  const k = 1 / escala;
  a.fijarReloj(0);
  a.escalaTiempo(escala);
  a.impacto({ material: 'metal', materialB: 'hormigon', momento: 300, posicion: EN, cuando: 0.05 });
  a.disparo({ arma: 'rifle', posicion: [0.3, 1.4, -0.6], cuando: 0.05 + 0.9 * k * 0.35 });
  a.explosion({ potencia: 3, posicion: [0, 0.5, -9], cuando: 0.05 + 1.6 * k * 0.35 });
}
