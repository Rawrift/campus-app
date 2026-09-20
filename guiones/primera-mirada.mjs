// Primera sesión de juego: recorre el mundo, mira lo que hay y prueba el manipulador.
export default {
  nombre: 'primera-mirada',
  descripcion: 'Llegada, recorrido exterior, interior de la nave y prueba del manipulador.',
  async ejecutar(ctx, informe) {
    const { ev, wait, shot, log } = ctx;

    await wait(1200);
    await shot('llegada');

    // Vista general exterior desde el aire
    await ev(() => window.__JUEGO.fijarCamara([34, 14, 40], [0, 4, -6], 55));
    await wait(1500); await shot('exterior_general');

    await ev(() => window.__JUEGO.fijarCamara([0, 1.7, 30], [0, 3, -6], 60));
    await wait(1200); await shot('aproximacion');

    // Interior de la nave
    await ev(() => window.__JUEGO.fijarCamara([3, 1.7, 2], [-7, 2.5, -12], 60));
    await wait(1500); await shot('interior');

    // Primer plano de materiales
    await ev(() => window.__JUEGO.fijarCamara([-5, 1.2, 1], [-6, 0.7, -3], 50));
    await wait(1200); await shot('materiales_cerca');

    // Contraluz
    await ev(() => window.__JUEGO.fijarCamara([-30, 7, -26], [0, 5, -6], 55));
    await wait(1200); await shot('contraluz');

    informe.estadoInicial = await ev(() => window.__JUEGO.stats());
    log('entidades iniciales:', informe.estadoInicial?.entidades);

    // Prueba del manipulador: volver a vista de jugador, mirar a una caja y agarrarla
    await ev(() => { window.__JUEGO.camaraLibre(false); window.__JUEGO.teletransportar([0, 2, 8], Math.PI, 0); });
    await wait(600);
    await ev(() => window.__JUEGO.mirarA(-6, 1, -8));
    await wait(400); await shot('apuntando');

    // Explosión dentro de la nave
    await ev(() => window.__JUEGO.fijarCamara([12, 4, 10], [-2, 1.5, -6], 60));
    await wait(800);
    await ev(() => window.__JUEGO.explotar([-6, 1, -4], 14000, 14));
    await wait(350); await shot('explosion_0');
    await wait(500); await shot('explosion_1');
    await wait(1200); await shot('explosion_2');

    informe.trasExplosion = await ev(() => window.__JUEGO.stats());
    informe.errores_juego = await ev(() => window.__JUEGO.registroErrores());
  },
};
