// Prueba de cordura de las masas: contrasta la tabla de materiales contra masas reales
// conocidas. Si alguien toca densidades o factores de relleno y rompe la sensación de peso,
// esto lo caza. Ejecutar: node pruebas/masas.mjs
import { masaDe, RELLENO as R, contacto, flota } from '../src/fisica/materiales.js';

const casos = [
  ['bidón acero 200 L vacío', masaDe('acero', Math.PI*0.3**2*0.9, R.bidon), 19],
  ['neumático turismo',       masaDe('goma', 2*Math.PI**2*0.35*0.12**2, R.neumatico), 9],
  ['caja madera 0,8 m',       masaDe('madera', 0.8**3, R.cajaTablas), 28],
  ['palé europeo',            masaDe('madera', 1.2*0.8*0.14, 0.35), 25],
  ['bloque hormigón 40x20x20',masaDe('hormigon', 0.4*0.2*0.2, R.macizo), 38],
  ['placa vidrio 1,2x1 8 mm', masaDe('vidrio', 1.2*1.0*0.008, R.macizo), 24],
  ['bola acero maciza r=18cm',masaDe('acero', 4/3*Math.PI*0.18**3, R.macizo), 190],
];
let fallos = 0;
for (const [n, calc, real] of casos) {
  const ok = Math.abs(calc - real) / real <= 0.35;
  if (!ok) fallos++;
  console.log((ok ? ' OK  ' : ' MAL ') + n.padEnd(28) + calc.toFixed(1).padStart(8) + ' kg  (real ~' + real + ')');
}
// La fricción de contacto debe ordenar correctamente: goma agarra, hielo resbala.
const gomaHormigon = contacto('goma','hormigon').friccion;
const hieloAcero = contacto('hielo','acero').friccion;
if (!(gomaHormigon > 0.8 && hieloAcero < 0.25)) { console.log(' MAL orden de fricción'); fallos++; }
else console.log(' OK  fricción: goma-hormigón ' + gomaHormigon.toFixed(2) + ' > hielo-acero ' + hieloAcero.toFixed(2));
// La flotación debe emerger de la densidad, no de una lista.
if (!(flota('madera') && !flota('acero') && flota('carton'))) { console.log(' MAL flotación'); fallos++; }
else console.log(' OK  flotación por densidad');

console.log(fallos ? `\n${fallos} FALLOS` : '\nTodo correcto');
process.exit(fallos ? 1 : 0);
