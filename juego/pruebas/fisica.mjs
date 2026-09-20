// Prueba del mundo físico sin navegador. Comprueba lo que el juego necesita que sea cierto:
// que el paso fijo es determinista, que el momento de impacto distingue masas, que las
// restricciones sostienen, que la explosión respeta la oclusión y que aguanta el estrés.
import { iniciarRapier, MundoFisico } from '../src/fisica/mundo.js';
import { sucesos } from '../src/nucleo/sucesos.js';
import { Azar } from '../src/nucleo/aleatorio.js';
import { RELLENO } from '../src/fisica/materiales.js';

await iniciarRapier();
let fallos = 0;
const ok = (c, n, extra='') => { console.log((c?' OK  ':' MAL ') + n + (extra?'  '+extra:'')); if(!c) fallos++; };

function suelo(m) {
  m.crear({ tipo:'fijo', pos:[0,-0.5,0], forma:{clase:'caja', medias:[80,0.5,80]}, material:'hormigon',
            meta:{protegido:true} });
}
function torre(m, azar, n=60) {
  for (let i=0;i<n;i++) {
    m.crear({ pos:[azar.simetrico(3), 1+i*0.85, azar.simetrico(3)],
              forma:{clase:'caja', medias:[0.4,0.4,0.4]}, material:'madera', relleno:RELLENO.cajaTablas });
  }
}

// 1) DETERMINISMO: dos mundos, misma semilla, mismo número de pasos -> mismo estado.
function estadoTras(pasos, semilla) {
  const m = new MundoFisico(); suelo(m); torre(m, new Azar(semilla), 40);
  for (let i=0;i<pasos;i++) m.paso();
  let h = 0;
  for (const e of m.entidades.values()) {
    const t = e.cuerpo.translation();
    h = (h*31 + Math.round(t.x*1e4) + Math.round(t.y*1e4)*7 + Math.round(t.z*1e4)*13) | 0;
  }
  return h;
}
const h1 = estadoTras(240, 42), h2 = estadoTras(240, 42), h3 = estadoTras(240, 99);
ok(h1 === h2, 'determinismo: misma semilla -> mismo estado', `(${h1})`);
ok(h1 !== h3, 'semillas distintas -> estados distintos');

// 2) MOMENTO: un cuerpo pesado debe producir mucho más momento que uno ligero a igual altura.
const momentos = {};
for (const [nombre, mat, rell, r] of [['ligero','carton',1,0.3], ['pesado','acero',1,0.3]]) {
  const m = new MundoFisico(); suelo(m);
  let pico = 0;
  const off = sucesos.en('impacto', d => { pico = Math.max(pico, d.momento); });
  m.crear({ pos:[0,6,0], forma:{clase:'esfera', radio:r}, material:mat, relleno:rell });
  for (let i=0;i<180;i++) m.paso();
  off(); momentos[nombre] = pico;
}
ok(momentos.pesado > momentos.ligero * 5, 'el momento distingue masas',
   `cartón ${momentos.ligero.toFixed(0)} vs acero ${momentos.pesado.toFixed(0)} kg·m/s`);

// 3) RESTRICCIONES: una cadena colgada debe quedarse colgada, no caerse ni explotar.
{
  const m = new MundoFisico(); suelo(m);
  // Ancla alta a propósito: 12 eslabones con separación máxima de 0,85 m cuelgan más de 10 m,
  // así que desde y=10 la cadena tocaría el suelo y la comprobación no diría nada.
  const ancla = m.crear({ tipo:'fijo', pos:[0,22,0], forma:{clase:'caja', medias:[0.2,0.2,0.2]}, material:'acero' });
  let prev = ancla.id;
  const eslabones = [];
  for (let i=1;i<=12;i++) {
    const e = m.crear({ pos:[0,22-i*0.5,0], forma:{clase:'caja', medias:[0.1,0.2,0.1]}, material:'acero' });
    m.cuerda(prev, e.id, [0,-0.2,0], [0,0.2,0], 0.45); prev = e.id; eslabones.push(e);
  }
  for (let i=0;i<300;i++) m.paso();
  const ultimo = eslabones[eslabones.length-1].cuerpo.translation();
  const finito = Number.isFinite(ultimo.x) && Number.isFinite(ultimo.y);
  ok(finito, 'cadena de 12 eslabones sin NaN');
  ok(finito && ultimo.y < 21 && ultimo.y > 9, 'la cadena cuelga tensa y se sostiene', `y=${ultimo.y.toFixed(2)}`);
}

// 4) OCLUSIÓN DE LA EXPLOSIÓN: un muro debe proteger de verdad.
{
  const m = new MundoFisico(); suelo(m);
  m.crear({ tipo:'fijo', pos:[3,2,0], forma:{clase:'caja', medias:[0.4,2,6]}, material:'hormigon' });
  const tapado = m.crear({ pos:[6,1,0], forma:{clase:'caja', medias:[0.3,0.3,0.3]}, material:'madera' });
  const libre  = m.crear({ pos:[0,1,6], forma:{clase:'caja', medias:[0.3,0.3,0.3]}, material:'madera' });
  m.explotar([0,1,0], 9000, 14);
  m.paso();
  const vt = tapado.cuerpo.linvel(), vl = libre.cuerpo.linvel();
  const st = Math.hypot(vt.x,vt.y,vt.z), sl = Math.hypot(vl.x,vl.y,vl.z);
  ok(sl > st * 1.8, 'el muro protege de la explosión', `libre ${sl.toFixed(1)} vs tapado ${st.toFixed(1)} m/s`);
}

// 5) ESTRÉS: 800 cuerpos, explosiones encadenadas, sin NaN y sin colarse por el suelo.
{
  const m = new MundoFisico(); suelo(m);
  const azar = new Azar(7);
  for (let i=0;i<800;i++) {
    m.crear({ pos:[azar.simetrico(18), 2+azar.real()*26, azar.simetrico(18)],
              forma: azar.suerte(0.5) ? {clase:'caja', medias:[0.35,0.35,0.35]} : {clase:'esfera', radio:0.35},
              material: azar.elegir(['madera','acero','hormigon','goma','plastico']),
              relleno: RELLENO.cajaTablas });
  }
  const t0 = Date.now();
  for (let i=0;i<420;i++) { m.paso(); if (i===200||i===260||i===320) m.explotar([azar.simetrico(8),1.5,azar.simetrico(8)], 22000, 16); }
  const ms = Date.now()-t0;
  let nan = 0, bajoSuelo = 0;
  for (const e of m.entidades.values()) {
    const t = e.cuerpo.translation();
    if (!Number.isFinite(t.x)||!Number.isFinite(t.y)||!Number.isFinite(t.z)) nan++;
    else if (t.y < -3) bajoSuelo++;
  }
  const st = m.estadisticas();
  ok(nan === 0, 'estrés 800 cuerpos + 3 explosiones: cero NaN');
  // Tolerancia declarada, no cero: es una prueba deliberadamente patológica (800 cuerpos
  // soltados desde 28 m y tres explosiones de 22 kN). Se midió que ni el grosor del suelo
  // (1/4/10 m), ni el CCD, ni generar sin solapes eliminan estas expulsiones: no son
  // atravesamiento por velocidad, son penetración profunda resuelta al lado equivocado.
  ok(bajoSuelo <= 8, 'expulsiones por compresión dentro de lo tolerable', `${bajoSuelo} en tránsito`);
  // La red de seguridad no puede convertirse en una excusa: si expulsa mucho, el solver va mal.
  const fugados = m.fugados || 0;
  ok(fugados <= 10, 'la red de seguridad recoge lo poco que escapa', `${fugados} de 800 retirados`);
  console.log(`      ${st.cuerpos} cuerpos, ${st.cuerposActivos} activos, 420 pasos en ${ms} ms (${(ms/420).toFixed(2)} ms/paso)`);
}

console.log(fallos ? `\n${fallos} FALLOS` : '\nTodo correcto');
process.exit(fallos ? 1 : 0);
