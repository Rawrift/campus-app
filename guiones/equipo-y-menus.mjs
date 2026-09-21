// Ejercita lo nuevo: ranuras de equipo, menús, armas y herramienta.
export default {
  nombre: 'equipo-y-menus',
  descripcion: 'Comprueba que los menús abren, el equipo cambia y las armas y la herramienta actúan.',
  async ejecutar(ctx, informe) {
    const { ev, wait, shot, tecla, mantener, log } = ctx;
    await wait(1000);
    await shot('inicio');

    // --- menú de objetos (Q mantenido) ---
    await ctx.page.keyboard.down('KeyQ'); await wait(500);
    await shot('menu_objetos');
    informe.menuObjetosVisible = await ev(() => !document.getElementById('m-objetos').hidden);
    // generar desde el menú: clic en la primera celda
    const celda = await ctx.page.$('#m-rejilla .celda');
    if (celda) { await celda.click(); await wait(300); }
    await ctx.page.keyboard.up('KeyQ'); await wait(300);
    informe.menuCerrado = await ev(() => document.getElementById('m-objetos').hidden);

    // --- menú de herramienta (X mantenido) ---
    await ctx.page.keyboard.down('KeyX'); await wait(500);
    await shot('menu_herramienta');
    informe.menuHerramientaVisible = await ev(() => !document.getElementById('m-herramienta').hidden);
    await ctx.page.keyboard.up('KeyX'); await wait(200);

    // --- ayuda (F1) ---
    await tecla('F1'); await wait(500);
    await shot('ayuda');
    informe.ayudaVisible = await ev(() => !document.getElementById('m-ayuda').hidden);
    await tecla('F1'); await wait(200);

    // --- menú principal (Esc) ---
    await tecla('Escape'); await wait(500);
    await shot('menu_principal');
    informe.principalVisible = await ev(() => !document.getElementById('m-principal').hidden);
    await tecla('Escape'); await wait(200);

    // --- cambio de equipo con 1..6 ---
    const ranuras = [];
    for (const d of ['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6']) {
      await tecla(d); await wait(160);
      ranuras.push(await ev(() => document.getElementById('hud-herramienta').textContent));
    }
    informe.ranuras = ranuras;
    log('ranuras:', ranuras.join(' | '));

    // --- disparo del lanzacohetes contra la nave ---
    // Situarse dentro de la nave y APUNTAR a una pirámide de cajas, no al vacío.
    await ev(() => { window.__JUEGO.camaraLibre(false); window.__JUEGO.teletransportar([4,2,8]); });
    await wait(300);
    await ev(() => window.__JUEGO.mirarA(-6, 1.2, -2));
    await wait(300);
    const antes = await ev(() => window.__JUEGO.stats());
    informe.alturaCajasAntes = await ev(() => {
      let s = 0, n = 0;
      // la altura media de las cajas dice si la explosión las movió de verdad
      for (const e of window.__FRAGUA.fisica.entidades.values())
        if (e.meta.prop === 'caja_madera') { s += e.cuerpo.translation().y; n++; }
      return n ? +(s / n).toFixed(3) : null;
    });
    await ev(() => window.__JUEGO.disparar(1));
    await wait(1600);
    informe.alturaCajasDespues = await ev(() => {
      let s = 0, n = 0;
      for (const e of window.__FRAGUA.fisica.entidades.values())
        if (e.meta.prop === 'caja_madera') { s += e.cuerpo.translation().y; n++; }
      return n ? +(s / n).toFixed(3) : null;
    });
    await shot('cohete');
    const despues = await ev(() => window.__JUEGO.stats());
    informe.cuerposActivosAntes = antes.cuerposActivos;
    informe.cuerposActivosDespues = despues.cuerposActivos;

    // --- herramienta: modo soldar sobre dos objetos ---
    await tecla('Digit2'); await wait(200);
    informe.restriccionesAntes = (await ev(() => window.__JUEGO.stats())).restricciones;
    await ev(() => { const j=window.__JUEGO; j.mirarA(-6,1,-4); });
    await wait(200); await ev(() => window.__JUEGO.primario()); await wait(200);
    await ev(() => window.__JUEGO.mirarA(-6,1.8,-4));
    await wait(200); await ev(() => window.__JUEGO.primario()); await wait(400);
    informe.restriccionesDespues = (await ev(() => window.__JUEGO.stats())).restricciones;

    await ev(() => window.__JUEGO.fijarCamara([12,4,12], [-2,1.5,-6], 60));
    await wait(800); await shot('final');
    informe.errores_juego = await ev(() => window.__JUEGO.registroErrores());
    informe.statsFinal = await ev(() => window.__JUEGO.stats());
  },
};
