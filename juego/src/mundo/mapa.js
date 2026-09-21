// EL MUNDO. Polígono industrial al atardecer.
//
// Regla que guía todo este fichero: NADA DE EXPLANADAS VACÍAS. En el gauntlet, lo que más
// delataba la escena como demo era el suelo desnudo con objetos sueltos encima. La densidad
// ambiental (tuberías, cables, basura, marcas, bordillos, charcos) es lo que hace que un
// espacio parezca un sitio en vez de un nivel de pruebas.

import * as THREE from 'three';
import { Azar } from '../nucleo/aleatorio.js';
import { RELLENO } from '../fisica/materiales.js';
import { uvMundo, uvPlano } from '../render/uv.js';
import { romperTeselado } from '../render/macro.js';

// Metros por tesela por defecto. Las recetas de material están pensadas para leerse bien a
// esta escala: por encima, la variación de baja frecuencia se convierte en manchas.
const TESELA = 2.0;
const g = (w, h, d, tesela = TESELA) => uvMundo(new THREE.BoxGeometry(w, h, d), tesela);
const plano = (w, h, tesela = TESELA) => uvPlano(new THREE.PlaneGeometry(w, h), tesela);

export class Mapa {
  constructor(escena, fisica, biblioteca) {
    this.escena = escena;
    this.fisica = fisica;
    this.bib = biblioteca;
    this.raiz = new THREE.Group();
    this.raiz.name = 'mapa';
    escena.add(this.raiz);
    this.mallas = [];
    this.luminarias = [];      // posiciones de farolas, para el presupuesto de luces
    this.azar = new Azar(20260920);
  }

  /** Crea malla + cuerpo fijo a la vez, que es lo que se necesita el 90% de las veces. */
  _solido(geo, mat, pos, rotY = 0, idMat = 'hormigon', extra = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(pos[0], pos[1], pos[2]);
    if (rotY) m.rotation.y = rotY;
    m.castShadow = extra.sombra !== false;
    m.receiveShadow = true;
    m.updateMatrixWorld();
    this.raiz.add(m);
    this.mallas.push(m);

    const p = geo.parameters;
    const medias = [p.width / 2, p.height / 2, p.depth / 2];
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0));
    this.fisica.crear({
      tipo: 'fijo', pos, rot: [q.x, q.y, q.z, q.w],
      forma: { clase: 'caja', medias }, material: idMat,
      meta: { protegido: true, estatico: true },
    });
    return m;
  }

  /** Malla decorativa sin cuerpo físico: para detalle que no necesita colisión. */
  _adorno(geo, mat, pos, rot = [0, 0, 0], escala = null) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(pos[0], pos[1], pos[2]);
    m.rotation.set(rot[0], rot[1], rot[2]);
    if (escala) m.scale.set(escala[0], escala[1], escala[2]);
    m.castShadow = true; m.receiveShadow = true;
    this.raiz.add(m); this.mallas.push(m);
    return m;
  }

  /**
   * Muro articulado. Un crítico independiente señaló que el paño liso de suelo a techo era el
   * mayor delta del interior: "ninguna nave real tiene un paño de 20 m sin un solo accidente".
   * Esto le da zócalo, pilastras que sobresalen del paño y un cambio de material en la franja
   * alta, que es lo que rompe la lectura de "caja con una foto pegada".
   *
   * @param eje 'x' si el muro es perpendicular a X (corre a lo largo de Z), 'z' si al revés.
   */
  _muroArticulado({ centro, largo, altura, espesor, eje, mats, pilastras = true,
                    franjaAlta = 0, idMat = 'hormigon' }) {
    const ZOCALO = 1.05, SALIENTE_Z = 0.14, SALIENTE_P = 0.22, ANCHO_P = 0.8;
    const alturaPaño = altura - (franjaAlta || 0);
    const [cx, cy, cz] = centro;
    const enX = eje === 'x';
    const dim = (l, e) => enX ? [e, 0, l] : [l, 0, e];

    // Paño principal
    const d1 = dim(largo, espesor);
    this._solido(g(enX ? espesor : largo, alturaPaño, enX ? largo : espesor),
      mats.paño, [cx, cy + alturaPaño / 2, cz], 0, idMat);

    // Franja alta de chapa nervada: cambio de material que corta la verticalidad.
    if (franjaAlta > 0) {
      this._solido(g(enX ? espesor * 0.85 : largo, franjaAlta, enX ? largo : espesor * 0.85),
        mats.chapa, [cx, cy + alturaPaño + franjaAlta / 2, cz], 0, 'acero');
      // Perfil de remate entre paño y chapa: sin él el cambio de material parece un error.
      this._adorno(g(enX ? espesor + 0.14 : largo, 0.16, enX ? largo : espesor + 0.14),
        mats.acero, [cx, cy + alturaPaño + 0.08, cz]);
    }

    // Zócalo: sobresale y va más sucio. Es el accidente que más se nota a ras de suelo.
    this._solido(g(enX ? espesor + SALIENTE_Z * 2 : largo, ZOCALO, enX ? largo : espesor + SALIENTE_Z * 2),
      mats.zocalo, [cx, cy + ZOCALO / 2, cz], 0, idMat);
    this._adorno(g(enX ? espesor + SALIENTE_Z * 2 + 0.06 : largo, 0.07, enX ? largo : espesor + SALIENTE_Z * 2 + 0.06),
      mats.zocalo, [cx, cy + ZOCALO, cz]);

    // Pilastras cada ~4,3 m, sobresaliendo del paño.
    if (pilastras) {
      const n = Math.max(2, Math.round(largo / 4.3));
      for (let i = 0; i <= n; i++) {
        const t = -largo / 2 + (largo / n) * i;
        const px = enX ? cx : cx + t;
        const pz = enX ? cz + t : cz;
        this._solido(g(enX ? espesor + SALIENTE_P * 2 : ANCHO_P, alturaPaño - 0.1, enX ? ANCHO_P : espesor + SALIENTE_P * 2),
          mats.pilastra, [px, cy + (alturaPaño - 0.1) / 2, pz], 0, idMat, { sombra: true });
      }
    }
  }

  async construir() {
    const bib = this.bib;
    const [asfalto, hormigon, hormigonViejo, pulido, chapa, metalPintado, oxido,
           acero, madera, vidrio, grava, ladrillo, goma] = await Promise.all([
      // repeticion [1,1] en todos: la densidad de textura la fija ahora la geometría, en
      // metros por tesela, no el material. Así una sola textura sirve a todo el mapa.
      bib.obtener('asfalto',       { repeticion: [1, 1], semilla: 3 }),
      bib.obtener('hormigon',      { repeticion: [1, 1], semilla: 5 }),
      bib.obtener('hormigonViejo', { repeticion: [1, 1], semilla: 11 }),
      bib.obtener('hormigonLiso',  { repeticion: [1, 1], semilla: 7 }),
      bib.obtener('chapa',         { repeticion: [1, 1], semilla: 13 }),
      bib.obtener('metalPintado',  { repeticion: [1, 1], semilla: 17 }),
      bib.obtener('oxido',         { repeticion: [1, 1], semilla: 19 }),
      bib.obtener('acero',         { repeticion: [1, 1], semilla: 23 }),
      bib.obtener('madera',        { repeticion: [1, 1], semilla: 29 }),
      bib.obtener('vidrio',        { repeticion: [1, 1], semilla: 31, transparente: true }),
      bib.obtener('grava',         { repeticion: [1, 1], semilla: 37 }),
      bib.obtener('ladrillo',      { repeticion: [1, 1], semilla: 41 }),
      bib.obtener('goma',          { repeticion: [1, 1], semilla: 43 }),
    ]);
    this.materiales = { asfalto, hormigon, hormigonViejo, pulido, chapa, metalPintado, oxido,
                        acero, madera, vidrio, grava, ladrillo, goma };

    // Rotura del teselado en las superficies grandes, que son las que delatan el patrón.
    // Los props pequeños no la necesitan: nunca se ven repetidos uno al lado de otro.
    romperTeselado(hormigon,      { escala: 22, fuerza: 0.30, suciedadSuelo: 2.6 });
    romperTeselado(hormigonViejo, { escala: 15, fuerza: 0.38, suciedadSuelo: 1.8 });
    romperTeselado(pulido,        { escala: 17, fuerza: 0.26, suciedadSuelo: 0 });
    romperTeselado(asfalto,       { escala: 34, fuerza: 0.32, suciedadSuelo: 0 });
    romperTeselado(ladrillo,      { escala: 19, fuerza: 0.26, suciedadSuelo: 1.4 });
    romperTeselado(chapa,         { escala: 13, fuerza: 0.22, suciedadSuelo: 0 });
    romperTeselado(metalPintado,  { escala: 11, fuerza: 0.28, suciedadSuelo: 0 });
    romperTeselado(oxido,         { escala:  9, fuerza: 0.34, suciedadSuelo: 0 });

    this._suelo(asfalto, grava);
    this._nave({ hormigon, hormigonViejo, pulido, chapa, acero, vidrio, metalPintado });
    this._patio({ oxido, metalPintado, chapa, hormigon, ladrillo, acero });
    this._farolas(acero);
    this._detalleAmbiental({ oxido, madera, acero, hormigonViejo, goma, metalPintado });
    return this;
  }

  // --- suelo ---------------------------------------------------------------------------
  _suelo(asfalto, grava) {
    // Base sólida y gruesa: el suelo es lo que sostiene todo el caos.
    this._solido(g(320, 4, 320, 3.0), asfalto, [0, -2, 0], 0, 'hormigon', { sombra: false });

    // Parches de grava y zonas desgastadas rompen la uniformidad del asfalto, que es lo que
    // delata un suelo procedural repetido.
    const a = this.azar.derivar(1);
    for (let i = 0; i < 9; i++) {
      const w = a.entre(9, 26), d = a.entre(9, 26);
      const geo = plano(w, d, 2.4);
      const m = new THREE.Mesh(geo, i % 2 ? grava : this.materiales?.hormigonViejo ?? grava);
      m.rotation.x = -Math.PI / 2;
      m.position.set(a.simetrico(90), 0.012 + i * 0.001, a.simetrico(90));
      m.receiveShadow = true;
      m.renderOrder = 1;
      this.raiz.add(m); this.mallas.push(m);
    }
  }

  // --- nave principal -------------------------------------------------------------------
  _nave(mat) {
    const AN = 26, PR = 18, AL = 9, ESP = 0.45;   // ancho, profundidad, altura, espesor
    const x0 = 0, z0 = -6;

    // Muros articulados: paño + zócalo + pilastras + franja alta de chapa.
    const mats = { paño: mat.hormigon, zocalo: mat.hormigonViejo, pilastra: mat.hormigon,
                   chapa: mat.chapa, acero: mat.acero };
    this._muroArticulado({ centro: [x0 - AN/2, 0, z0], largo: PR, altura: AL, espesor: ESP,
                           eje: 'x', mats, franjaAlta: 2.4 });
    this._muroArticulado({ centro: [x0 + AN/2, 0, z0], largo: PR, altura: AL, espesor: ESP,
                           eje: 'x', mats, franjaAlta: 2.4 });
    this._muroArticulado({ centro: [x0, 0, z0 - PR/2], largo: AN, altura: AL, espesor: ESP,
                           eje: 'z', mats, franjaAlta: 2.4 });

    // Fachada frontal con portón abierto de 11 x 6.
    const anchoJamba = (AN - 11) / 2;
    this._solido(g(anchoJamba, AL, ESP), mat.hormigon, [x0 - AN/2 + anchoJamba/2, AL/2, z0 + PR/2], 0, 'hormigon');
    this._solido(g(anchoJamba, AL, ESP), mat.hormigon, [x0 + AN/2 - anchoJamba/2, AL/2, z0 + PR/2], 0, 'hormigon');
    this._solido(g(11, AL - 6, ESP), mat.hormigon, [x0, 6 + (AL-6)/2, z0 + PR/2], 0, 'hormigon');

    // Suelo interior pulido, ligeramente reflectante: separa el dentro del fuera.
    const suelo = new THREE.Mesh(plano(AN - ESP, PR - ESP, 2.6), mat.pulido);
    suelo.rotation.x = -Math.PI/2; suelo.position.set(x0, 0.02, z0);
    suelo.receiveShadow = true; this.raiz.add(suelo); this.mallas.push(suelo);

    // Cubierta y vigas: lo que da escala al interior.
    this._solido(g(AN + 1, 0.35, PR + 1), mat.chapa, [x0, AL + 0.17, z0], 0, 'acero');
    for (let i = 0; i < 14; i++) {
      const z = z0 - PR/2 + 0.9 + i * ((PR - 1.8) / 13);
      this._adorno(g(AN - ESP, 0.42, 0.22), mat.acero, [x0, AL - 0.45, z]);
      // Tirantes en diagonal: la celosía es lo que hace que una nave parezca una nave.
      if (i % 2 === 0) {
        this._adorno(g(0.12, 0.12, 2.6), mat.acero, [x0 - 6, AL - 1.1, z], [0.5, 0, 0]);
        this._adorno(g(0.12, 0.12, 2.6), mat.acero, [x0 + 6, AL - 1.1, z], [-0.5, 0, 0]);
      }
    }

    // Pilares interiores.
    for (const [px, pz] of [[-7, -2], [7, -2], [-7, -11], [7, -11]]) {
      this._solido(g(0.6, AL - 0.6, 0.6), mat.hormigon, [x0 + px, (AL-0.6)/2, z0 + pz], 0, 'hormigon');
    }

    // Entreplanta con barandilla.
    const my = 4.2, mz = z0 - PR/2 + 3.0;
    this._solido(g(AN - ESP, 0.3, 6), mat.hormigonViejo, [x0, my, mz + 1.5], 0, 'hormigon');
    for (let i = 0; i < 13; i++) {
      this._adorno(g(0.07, 1.1, 0.07), mat.acero, [x0 - AN/2 + 1 + i * 2, my + 0.7, mz + 4.5]);
    }
    this._adorno(g(AN - ESP, 0.08, 0.08), mat.acero, [x0, my + 1.25, mz + 4.5]);
    this._adorno(g(AN - ESP, 0.06, 0.06), mat.acero, [x0, my + 0.75, mz + 4.5]);

    // Ventanas altas con vidrio real (transparente) en ambos muros laterales.
    for (let lado of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const z = z0 - PR/2 + 2.4 + i * 3.2;
        const v = new THREE.Mesh(g(0.08, 1.5, 2.1), mat.vidrio);
        v.position.set(x0 + lado * (AN/2 - 0.1), 6.2, z);
        v.renderOrder = 2;
        this.raiz.add(v); this.mallas.push(v);
        // Marco: sin marco, un cristal flotando parece un error.
        this._adorno(g(0.14, 1.7, 0.12), mat.acero, [x0 + lado*(AN/2 - 0.1), 6.2, z - 1.12]);
        this._adorno(g(0.14, 1.7, 0.12), mat.acero, [x0 + lado*(AN/2 - 0.1), 6.2, z + 1.12]);
        this._adorno(g(0.14, 0.12, 2.3), mat.acero, [x0 + lado*(AN/2 - 0.1), 7.0, z]);
        this._adorno(g(0.14, 0.12, 2.3), mat.acero, [x0 + lado*(AN/2 - 0.1), 5.4, z]);
      }
    }

    // Lámparas colgantes: geometría emisiva + petición al presupuesto de luces.
    const emis = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a, emissive: new THREE.Color(1.0, 0.86, 0.66), emissiveIntensity: 5.5,
      roughness: 0.5, metalness: 0.2 });
    for (const [lx, lz] of [[-7, 0], [7, 0], [-7, -10], [7, -10]]) {
      this._adorno(new THREE.CylinderGeometry(0.34, 0.5, 0.26, 12), emis, [x0+lx, AL - 1.5, z0+lz]);
      this._adorno(g(0.05, 1.0, 0.05), mat.acero, [x0+lx, AL - 0.95, z0+lz]);
      this.luminarias.push({ pos: [x0+lx, AL - 1.75, z0+lz], color: 0xffd9a8, intensidad: 42, alcance: 17, prioridad: 1 });
    }
  }

  // --- patio ----------------------------------------------------------------------------
  _patio(mat) {
    const a = this.azar.derivar(2);

    // Contenedores, apilados de forma creíble (no en rejilla perfecta).
    const cont = [[-30, 0, 14, 0.1], [-30, 2.7, 14, 0.1], [-24, 0, 22, 1.2],
                  [30, 0, 10, -0.3], [34, 0, 20, 0.6], [30, 2.7, 10, -0.28],
                  [-36, 0, -10, 1.6], [26, 0, -22, 0.2]];
    for (const [cx, cy, cz, rot] of cont) {
      const m = a.suerte(0.5) ? mat.oxido : mat.metalPintado;
      this._solido(g(6.1, 2.6, 2.44), m, [cx, cy + 1.3, cz], rot, 'hierroOx');
      // Nervios verticales del contenedor: el detalle que lo hace legible de lejos.
      for (let i = 0; i < 9; i++) {
        this._adorno(g(0.1, 2.4, 0.08), m, [cx, cy + 1.3, cz], [0, rot, 0])
          .position.set(cx + Math.cos(rot) * (-2.7 + i * 0.68), cy + 1.3, cz - Math.sin(rot) * (-2.7 + i * 0.68));
      }
    }

    // Muro de ladrillo del fondo y caseta.
    this._solido(g(40, 3.2, 0.5), mat.ladrillo, [-20, 1.6, -46], 0, 'ladrillo');
    this._solido(g(0.5, 3.2, 24), mat.ladrillo, [-40, 1.6, -34], 0, 'ladrillo');
    this._solido(g(7, 3.4, 6), mat.hormigon, [40, 1.7, -8], 0.25, 'hormigon');
    this._solido(g(7.6, 0.3, 6.6), mat.chapa, [40, 3.5, -8], 0.25, 'acero');

    // Valla perimetral: 64 tramos con postes.
    const tramos = [];
    for (let i = 0; i < 16; i++) tramos.push([[-64 + i * 8, 0, 60], 0]);
    for (let i = 0; i < 16; i++) tramos.push([[64, 0, 60 - i * 8], Math.PI/2]);
    for (let i = 0; i < 16; i++) tramos.push([[64 - i * 8, 0, -68], 0]);
    for (let i = 0; i < 16; i++) tramos.push([[-64, 0, -68 + i * 8], Math.PI/2]);
    for (const [p, rot] of tramos) {
      this._adorno(g(7.8, 2.4, 0.06), mat.acero, [p[0], 1.2, p[2]], [0, rot, 0]);
      this._solido(g(0.14, 2.6, 0.14), mat.acero, [p[0] - Math.cos(rot)*3.9, 1.3, p[2] + Math.sin(rot)*3.9], 0, 'acero', {sombra:false});
    }
  }

  _farolas(acero) {
    const puntos = [[-18, 16], [18, 16], [-18, -30], [18, -30], [-40, 4], [40, 4],
                    [-40, 30], [40, 30], [0, 30], [0, -44], [-52, -20], [52, -20],
                    [28, 36], [-28, 36]];
    const emis = new THREE.MeshStandardMaterial({
      color: 0x111111, emissive: new THREE.Color(1.0, 0.80, 0.55), emissiveIntensity: 7,
      roughness: 0.4, metalness: 0.3 });
    for (const [x, z] of puntos) {
      this._solido(g(0.22, 7.2, 0.22), acero, [x, 3.6, z], 0, 'acero');
      this._adorno(g(1.5, 0.14, 0.14), acero, [x + 0.65, 7.2, z]);
      this._adorno(g(0.9, 0.22, 0.44), emis, [x + 1.3, 7.05, z]);
      this.luminarias.push({ pos: [x + 1.3, 6.9, z], color: 0xffc98a, intensidad: 55, alcance: 22, prioridad: 0 });
    }
  }

  // --- densidad ambiental ----------------------------------------------------------------
  _detalleAmbiental(mat) {
    const a = this.azar.derivar(3);

    // Tuberías por las fachadas: verticalidad y ruido visual coherente.
    for (let i = 0; i < 14; i++) {
      const lado = a.suerte(0.5) ? -1 : 1;
      const z = a.entre(-14, 2);
      this._adorno(new THREE.CylinderGeometry(0.09, 0.09, a.entre(4, 8), 8), mat.oxido,
        [lado * 13.3, a.entre(2.5, 5), z]);
    }
    // Bordillos y bloques de hormigón sueltos.
    for (let i = 0; i < 26; i++) {
      this._solido(g(a.entre(1.6, 3.2), 0.28, 0.4), mat.hormigonViejo,
        [a.simetrico(60), 0.14, a.simetrico(60)], a.entre(0, Math.PI), 'hormigon', { sombra: false });
    }
    // Palés, tablones y chatarra estática repartidos: basura de fondo.
    for (let i = 0; i < 40; i++) {
      const x = a.simetrico(56), z = a.simetrico(56);
      if (Math.abs(x) < 14 && z > -16 && z < 4) continue;   // no dentro de la nave
      const t = a.entero(0, 2);
      if (t === 0) this._adorno(g(1.2, 0.14, 0.8), mat.madera, [x, 0.07, z], [0, a.entre(0, 6.28), 0]);
      else if (t === 1) this._adorno(g(a.entre(1.5, 3), 0.08, 0.16), mat.madera, [x, 0.04, z], [0, a.entre(0, 6.28), 0.02]);
      else this._adorno(new THREE.CylinderGeometry(0.3, 0.3, 0.88, 10), mat.oxido, [x, 0.44, z], [a.suerte(0.4) ? 1.57 : 0, a.entre(0,6.28), 0]);
    }
  }

  /** Props dinámicos iniciales: lo que el jugador encuentra para jugar desde el segundo uno. */
  async poblar() {
    const a = this.azar.derivar(4);
    const creados = [];
    // Pirámides de cajas dentro de la nave.
    for (const [bx, bz] of [[-6, -2], [6, -9], [-5, -13]]) {
      for (let n = 0; n < 5; n++) {
        for (let i = 0; i <= n; i++) {
          creados.push(this.fisica.crear({
            pos: [bx + (i - n / 2) * 0.86, 0.42 + (4 - n) * 0.86, bz + a.simetrico(0.05)],
            forma: { clase: 'caja', medias: [0.4, 0.4, 0.4] },
            material: 'madera', relleno: RELLENO.cajaTablas,
            meta: { prop: 'caja_madera' },
          }));
        }
      }
    }
    // Bidones, neumáticos y bloques por el patio y la entrada.
    for (let i = 0; i < 34; i++) {
      creados.push(this.fisica.crear({
        pos: [a.entre(-22, 22), 0.5 + a.real(), a.entre(2, 26)],
        forma: { clase: 'cilindro', mediaAltura: 0.45, radio: 0.3 },
        material: a.suerte(0.25) ? 'gasolina' : 'hierroOx', relleno: RELLENO.bidon,
        meta: { prop: 'bidon' },
      }));
    }
    for (let i = 0; i < 22; i++) {
      creados.push(this.fisica.crear({
        pos: [a.entre(-30, 30), 0.4, a.entre(-34, 30)],
        forma: { clase: 'cilindro', mediaAltura: 0.12, radio: 0.35 },
        material: 'goma', relleno: RELLENO.neumatico, meta: { prop: 'neumatico' },
      }));
    }
    for (let i = 0; i < 18; i++) {
      creados.push(this.fisica.crear({
        pos: [a.entre(-26, 26), 0.25, a.entre(4, 30)],
        forma: { clase: 'caja', medias: [0.2, 0.1, 0.1] },
        material: 'hormigon', meta: { prop: 'bloque' },
      }));
    }
    return creados;
  }

  /** Pide al presupuesto de luces las luminarias visibles. */
  pedirLuces(presupuesto) {
    for (const l of this.luminarias) {
      presupuesto.pedir({ posicion: l.pos, color: l.color, intensidad: l.intensidad,
                          alcance: l.alcance, prioridad: l.prioridad });
    }
  }
}
