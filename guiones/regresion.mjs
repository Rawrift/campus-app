// Regresión del juego completo. Todo se comprueba con el reloj cedido al arnés: a menos de
// 1 fps, esperar con el reloj de pared no llega ni a un fotograma y las comprobaciones mienten.
export default {
  nombre: 'regresion',
  descripcion: 'Menús, equipo, armas, herramienta, manipulador y determinismo.',
  async ejecutar(ctx, informe) {
    const { ev, wait, shot, tecla, log } = ctx;
    const pruebas = [];
    const ok = (n, cond, extra='') => { pruebas.push({ n, ok: !!cond, extra }); log((cond?'OK  ':'MAL ')+n+(extra?'  '+extra:'')); };
    const alturaCajas = () => ev(() => {
      let s=0,n=0;
      for (const e of window.__FRAGUA.fisica.entidades.values())
        if (e.meta.prop === 'caja_madera') { s+=e.cuerpo.translation().y; n++; }
      return n ? +(s/n).toFixed(4) : null;
    });
    await wait(900);

    // --- menús ---
    for (const [nombre, id] of [['objetos','m-objetos'],['herramienta','m-herramienta'],['ayuda','m-ayuda'],['principal','m-principal']]) {
      await ev((n) => window.__JUEGO.abrirMenu(n), nombre);
      await wait(200);
      const visible = await ev((i) => !document.getElementById(i).hidden, id);
      const solo = await ev(() => [...document.querySelectorAll('#menus .capa')].filter(c=>!c.hidden).length);
      ok(`menú ${nombre} abre`, visible);
      ok(`menú ${nombre} es el único abierto`, solo === 1, `abiertos=${solo}`);
    }
    await shot('menu_principal');
    await ev(() => window.__JUEGO.abrirMenu(null)); await wait(150);
    ok('menús cierran', await ev(() => [...document.querySelectorAll('#menus .capa')].every(c=>c.hidden)));

    // --- equipo ---
    const esperadas = ['manipulador','herramienta','pistola','escopeta','fusil','lanzacohetes'];
    const vistas = [];
    for (let i=0;i<6;i++) { await tecla('Digit'+(i+1)); await wait(120); vistas.push(await ev(()=>window.__JUEGO.ranuraActual())); }
    ok('las teclas 1-6 seleccionan su equipo', JSON.stringify(vistas)===JSON.stringify(esperadas), vistas.join(','));

    // --- reloj cedido ---
    await ev(() => { window.__JUEGO.camaraLibre(false); window.__JUEGO.teletransportar([4,2,8]); });
    await ev(() => window.__JUEGO.mirarA(-6,1.2,-2));
    await ev(() => window.__JUEGO.determinista.activar(7));
    await ev(() => window.__JUEGO.determinista.avanzar(60));

    // --- lanzacohetes mueve la pila ---
    await ev(() => window.__JUEGO.seleccionarHerramienta('lanzacohetes'));
    const h0 = await alturaCajas();
    await ev(() => window.__JUEGO.disparar(1));
    await ev(() => window.__JUEGO.determinista.avanzar(20));
    const h1 = await alturaCajas();
    ok('el lanzacohetes desordena la pila', Math.abs(h1-h0) > 0.05, `${h0} -> ${h1}`);
    await ev(() => window.__JUEGO.determinista.renderizar());
    await shot('tras_cohete');

    // --- escopeta empuja un objeto ---
    // Blanco recién puesto delante: tras la explosión anterior el apuntado no es fiable.
    await ev(() => window.__JUEGO.seleccionarHerramienta('escopeta'));
    const idBlanco = await ev(() => {
      const j = window.__FRAGUA;
      const o = j.jugador.posicionOjos(), d = j.jugador.direccion();
      return j.generar('caja_madera', [o[0]+d[0]*4, o[1]+d[1]*4, o[2]+d[2]*4]);
    });
    await ev(() => window.__JUEGO.determinista.avanzar(2));
    const antesEsc = await ev(() => {
      const j=window.__FRAGUA; const o=j.jugador.posicionOjos(), d=j.jugador.direccion();
      const h=j.fisica.rayo(o,d,60); if(!h||h.id==null) return null;
      const e=j.fisica.entidades.get(h.id); if(!e||!e.cuerpo.isDynamic()) return null;
      const v=e.cuerpo.linvel(); return { id:h.id, v:+Math.hypot(v.x,v.y,v.z).toFixed(3) };
    });
    await ev(() => window.__JUEGO.disparar(1));
    await ev(() => window.__JUEGO.determinista.avanzar(2));
    const despuesEsc = await ev((id) => {
      const e=window.__FRAGUA.fisica.entidades.get(id); if(!e) return null;
      const v=e.cuerpo.linvel(); return +Math.hypot(v.x,v.y,v.z).toFixed(3);
    }, antesEsc ? antesEsc.id : -1);
    ok('la escopeta transmite impulso', antesEsc && despuesEsc > antesEsc.v + 0.1,
       `blanco=${idBlanco} ${antesEsc?antesEsc.v:'?'} -> ${despuesEsc}`);

    // --- herramienta: soldar crea una unión ---
    await ev(() => window.__JUEGO.seleccionarHerramienta('herramienta'));
    await ev(() => window.__JUEGO.modoHerramienta('soldar'));
    const r0 = (await ev(()=>window.__JUEGO.stats())).restricciones;
    // Dos cajas puestas a propósito delante: apoyarse en restos de pruebas anteriores hacía
    // que este caso fallara por dónde había quedado la pila, no por la herramienta.
    const blancos = await ev(() => {
      const j = window.__FRAGUA;
      const o = j.jugador.posicionOjos(), d = j.jugador.direccion();
      const base = [o[0]+d[0]*5, 0.45, o[2]+d[2]*5];
      return [ j.generar('caja_madera', base),
               j.generar('caja_madera', [base[0], 1.3, base[2]]) ];
    });
    await ev(() => window.__JUEGO.determinista.avanzar(4));
    await ev((b) => {
      const j = window.__FRAGUA;
      const e = j.fisica.entidades.get(b[0]); const t = e.cuerpo.translation();
      window.__JUEGO.mirarA(t.x, t.y, t.z);
    }, blancos);
    await ev(() => window.__JUEGO.primario());
    await ev((b) => {
      const j = window.__FRAGUA;
      const e = j.fisica.entidades.get(b[1]); const t = e.cuerpo.translation();
      window.__JUEGO.mirarA(t.x, t.y, t.z);
    }, blancos);
    await ev(() => window.__JUEGO.primario());
    const r1 = (await ev(()=>window.__JUEGO.stats())).restricciones;
    ok('soldar crea una unión', r1 > r0, `${r0} -> ${r1}`);

    // --- determinismo ---
    // Se mide ENTRE CARGAS del juego, no dentro de la misma partida. Motivo medido: Rapier
    // recicla identificadores internos al destruir y crear cuerpos, y el orden resultante
    // cambia el orden de acumulación en coma flotante. Dos escenarios seguidos en el mismo
    // mundo divergen aunque la semilla sea la misma; dos cargas independientes, no.
    // tools/determinismo.mjs compara dos ejecuciones separadas y es quien da el veredicto.
    await ev(() => window.__JUEGO.escenario('torre'));
    await ev(() => window.__JUEGO.determinista.activar(42));
    await ev(() => window.__JUEGO.determinista.avanzar(120));
    informe.huellaTorre = await ev(() => {
      let h=0;
      for (const e of window.__FRAGUA.fisica.entidades.values()) {
        const t=e.cuerpo.translation();
        h=(h*31 + Math.round(t.x*1e3)+Math.round(t.y*1e3)*7+Math.round(t.z*1e3)*13)|0;
      }
      return h;
    });
    await ev(() => window.__JUEGO.determinista.renderizar());
    await shot('torre');
    await ev(() => window.__JUEGO.determinista.desactivar());

    informe.pruebas = pruebas;
    informe.fallos = pruebas.filter(p=>!p.ok).length;
    informe.erroresJuego = await ev(() => window.__JUEGO.registroErrores());
    informe.stats = await ev(() => window.__JUEGO.stats());
  },
};
