export default { nombre:'d3', async ejecutar(ctx, informe){
  const { ev, wait } = ctx;
  await wait(800);
  await ev(() => { window.__JUEGO.camaraLibre(false); window.__JUEGO.teletransportar([4,2,8]); });
  await ev(() => window.__JUEGO.mirarA(-6,1.2,-2));
  informe.antesActivar = await ev(() => {
    const j=window.__FRAGUA; const o=j.jugador.posicionOjos(), d=j.jugador.direccion();
    const h=j.fisica.rayo(o,d,300);
    return { pos:[+j.jugador.posicion.x.toFixed(2),+j.jugador.posicion.y.toFixed(2),+j.jugador.posicion.z.toFixed(2)],
             dir:d.map(x=>+x.toFixed(3)), impacta:!!h, id:h?h.id:null, pasos:j.bucle.pasosTotales };
  });
  await ev(() => window.__JUEGO.determinista.activar(7));
  informe.trasActivar = await ev(() => ({ determinista: window.__FRAGUA.bucle.determinista,
                                          corriendo: window.__FRAGUA.bucle.corriendo,
                                          pasos: window.__FRAGUA.bucle.pasosTotales }));
  await ev(() => window.__JUEGO.determinista.avanzar(60));
  informe.trasAvanzar = await ev(() => {
    const j=window.__FRAGUA; const o=j.jugador.posicionOjos(), d=j.jugador.direccion();
    const h=j.fisica.rayo(o,d,300);
    return { pasos:j.bucle.pasosTotales,
             pos:[+j.jugador.posicion.x.toFixed(2),+j.jugador.posicion.y.toFixed(2),+j.jugador.posicion.z.toFixed(2)],
             dir:d.map(x=>+x.toFixed(3)), impacta:!!h, id:h?h.id:null, entidades:j.fisica.entidades.size };
  });
  informe.errores = await ev(() => window.__JUEGO.registroErrores());
}};
