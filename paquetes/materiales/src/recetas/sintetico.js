// Recetas sinteticas: vidrio sucio, goma, plastico, lona y carton.

export const vidrio_sucio = /* glsl */ `
Campo campo(vec2 uv){
  Campo c = nuevoCampo();
  float S = uEsc;  vec2 p = uv * S;

  // el vidrio limpio es casi negro en albedo: lo que se ve es el REFLEJO.
  // toda la riqueza esta en la rugosidad y en la capa de mugre.

  // --- pelicula de polvo, mas densa hacia los bordes del panel
  float polvo = fbm(p * 7.0, 7.0*S, 5, 0.55, 3.0);
  float polvoFino = fbm(p * 55.0, 55.0*S, 3, 0.55, 5.0);
  float capaPolvo = smoothstep(0.30, 0.80, polvo*0.75 + polvoFino*0.25);

  // --- regueros de lluvia: verticales, con la cola sucia
  float lluvia = 0.0;
  lluvia = max(lluvia, reguero(uv, 34.0*S, 0.18, 0.62, 11.0));
  lluvia = max(lluvia, reguero(uv, 61.0*S, 0.10, 0.40, 13.0)*0.7);
  lluvia *= smoothstep(0.25, 0.65, fbm(p*3.0, 3.0*S, 3, 0.5, 17.0));
  // el reguero LIMPIA el centro y acumula suciedad en los bordes del canal
  float canal = lluvia;

  // --- cercos de gota seca (cal): anillos
  Celular go = celular(p * 26.0, vec2(26.0*S), 1.0, 19.0);
  float gota = step(0.55, go.id);
  float rr = go.f1 / 0.42;
  float cerco = gota * (1.0 - smoothstep(0.06, 0.16, abs(rr - 0.85))) * step(rr, 1.05);
  float discoGota = gota * (1.0 - smoothstep(0.80, 1.0, rr)) * 0.35;
  Celular go2 = celular(p * 58.0, vec2(58.0*S), 1.0, 23.0);
  float rr2 = go2.f1/0.40;
  float cerco2 = step(0.68, go2.id) * (1.0-smoothstep(0.08,0.20,abs(rr2-0.85))) * step(rr2,1.05);

  // --- barridos de trapo: arcos suaves de grasa
  float trapo = fbm2(deformar(vec2(p.x*1.6, p.y*5.0), vec2(1.6*S, 5.0*S), 0.45, 2, 29.0),
                     vec2(1.6*S, 5.0*S), 3, 0.5, 31.0);
  float grasa = smoothstep(0.52, 0.78, trapo) * smoothstep(0.30, 0.70, polvo);

  // --- salpicaduras de barro
  float barro = 0.0;
  float sal1 = poros(p * 30.0, vec2(30.0*S), 0.10, 0.22, 37.0);
  float sal2 = poros(p * 70.0, vec2(70.0*S), 0.16, 0.20, 41.0) * uMicro;
  barro = max(sal1, sal2*0.8) * smoothstep(0.45, 0.80, fbm(p*2.5, 2.5*S, 3, 0.5, 43.0));

  // --- arañazos finos del limpiaparabrisas / limpieza en seco
  float ar = aranazosDir(p*20.0, vec2(20.0*S), 0.35, 0.42, 0.12, 0.8, 47.0);
  float aranazo = 1.0 - smoothstep(0.0, 0.0026, ar);

  // --- ondulacion del vidrio flotado (muy leve, pero rompe el reflejo plano)
  float ondul = fbm2(vec2(p.x*1.0, p.y*2.5), vec2(1.0*S, 2.5*S), 3, 0.5, 53.0);

  float mugre = clamp(capaPolvo*0.42 + grasa*0.34 + barro*0.85
                    + cerco*0.55 + cerco2*0.34 + discoGota*0.30
                    + canal*0.12, 0.0, 1.0);
  mugre *= 1.0 - canal*0.55;          // por donde escurre el agua queda limpio

  float h = 0.86 + (ondul-0.5)*0.030 + mugre*0.020 + cerco*0.010
          + barro*0.030 - aranazo*0.012;

  vec3 vidrio = vec3(0.022,0.026,0.027);
  vec3 sucio  = vec3(0.250,0.238,0.212);
  vec3 cal    = vec3(0.640,0.640,0.625);
  vec3 barroC = vec3(0.245,0.185,0.125);
  vec3 col = mezclaLin(vidrio, sucio, mugre*0.80);
  col = mezclaLin(col, cal, (cerco*0.38 + cerco2*0.24));
  col = mezclaLin(col, barroC, barro*0.75);
  col = mezclaLin(col, vec3(0.16,0.17,0.17), canal*0.25);
  col = mezclaLin(col, vec3(0.30,0.31,0.31), aranazo*0.45);

  c.altura = h;
  c.base   = col;
  // RUGOSIDAD: el corazon de este material. Vidrio limpio 0.03, mugre hasta 0.65.
  c.rug    = clamp(0.035 + mugre*0.55 + aranazo*0.25 + capaPolvo*0.10
                   - canal*0.02, 0.02, 1.0);
  c.met    = 0.0;
  c.cav    = 0.0;
  c.sucK   = 0.35;
  c.suc    = vec3(0.22,0.21,0.19);
  c.borde  = 0.20;
  return c;
}`;

export const goma = /* glsl */ `
Campo campo(vec2 uv){
  Campo c = nuevoCampo();
  float S = uEsc;  vec2 p = uv * S;

  // --- textura del molde: granulado fino irregular (no ruido blanco)
  Celular m1 = celular(p * 90.0, vec2(90.0*S), 1.0, 3.0);
  Celular m2 = celular(p * 180.0, vec2(180.0*S), 1.0, 5.0);
  float granM = (1.0 - m1.f1) * 0.6 + (1.0 - m2.f1) * 0.4 * uMicro;
  float granF = fbm(p * 130.0, 130.0*S, 2, 0.5, 7.0) * uMicro;
  float medio = fbm(p * 22.0, 22.0*S, 4, 0.55, 11.0);
  float macro = macroVar(uv, 13.0);

  // --- burbujitas y puntos de inyeccion
  float burb = max(poros(p * 48.0, vec2(48.0*S), 0.22, 0.24, 17.0),
                   poros(p * 105.0, vec2(105.0*S), 0.26, 0.20, 19.0)*0.6*uMicro);

  // --- linea de particion del molde y rebaba
  float lin = abs(fract(uv.y * 2.0 * S) - 0.5);
  float rebaba = (1.0 - smoothstep(0.004, 0.011, lin));
  float pelo = rebaba * smoothstep(0.35, 0.75, fbm2(vec2(p.x*40.0, p.y*4.0), vec2(40.0*S, 4.0*S), 3, 0.5, 23.0));

  // --- rozaduras: la goma se pule donde roza y brilla mas
  float roce = smoothstep(0.45, 0.82, fbm(deformar(p*4.0, vec2(4.0*S), 0.35, 2, 29.0), 4.0*S, 4, 0.55, 31.0));
  float ar = aranazos(p*13.0, vec2(13.0*S), 0.30, 0.42, 37.0);
  float corte = 1.0 - smoothstep(0.0, 0.0035, ar);
  float corteAncho = 1.0 - smoothstep(0.0, 0.012, ar);

  // --- exudado de ceras antiozono: velo grisaceo mate
  float velo = smoothstep(0.42, 0.85, fbm(p*6.0, 6.0*S, 4, 0.55, 41.0)) * (1.0 - roce*0.7);

  float h = 0.74 + (medio-0.5)*0.040 + (granM-0.5)*0.030 + granF*0.012
          - burb*0.40 + rebaba*0.10 + pelo*0.04 - corte*0.22 + roce*0.010;

  // caucho negro: albedo MUY bajo, apenas 0.04-0.05
  vec3 negro = vec3(0.052,0.052,0.054);
  vec3 col = negro * (0.78 + 0.44*medio) * (0.88 + 0.24*macro);
  col = mezclaLin(col, vec3(0.032,0.032,0.034), burb*0.7);
  col = mezclaLin(col, vec3(0.115,0.113,0.110), velo*0.75);      // velo de cera
  col = mezclaLin(col, vec3(0.088,0.086,0.086), roce*0.45);      // zona pulida
  col = mezclaLin(col, vec3(0.135,0.130,0.125), corte*0.55);     // el corte se ve gris
  col = mezclaLin(col, col*1.15, corteAncho*0.15);
  col *= 0.94 + 0.12*granM;

  c.altura = h;
  c.base   = col;
  // goma: mate en general, algo mas satinada donde roza, muy mate con el velo
  c.rug    = clamp(0.88 - roce*0.26 + velo*0.09 + (1.0-granM)*0.06
                   + burb*0.05 + corte*0.05, 0.35, 1.0);
  c.met    = 0.0;
  c.cav    = burb*0.75 + corte*0.35;
  c.sucK   = 0.55;
  c.suc    = vec3(0.105,0.092,0.075);
  c.borde  = 0.60;
  return c;
}`;

export const plastico = /* glsl */ `
uniform vec3 uPlastico;
Campo campo(vec2 uv){
  Campo c = nuevoCampo();
  float S = uEsc;  vec2 p = uv * S;

  // --- texturado VDI del molde: erosion por chispa, granulado celular fino
  Celular v1 = celular(p * 110.0, vec2(110.0*S), 1.0, 3.0);
  Celular v2 = celular(p * 220.0, vec2(220.0*S), 1.0, 5.0);
  float vdi = (1.0 - v1.f1)*0.62 + (1.0 - v2.f1)*0.38*uMicro;
  float vdiF = fbm(p * 150.0, 150.0*S, 2, 0.5, 7.0) * uMicro;

  // --- lineas de flujo del material al inyectar
  float flujo = fbm2(deformar(vec2(p.x*2.0, p.y*7.0), vec2(2.0*S, 7.0*S), 0.30, 2, 11.0),
                     vec2(2.0*S, 7.0*S), 3, 0.5, 13.0);
  // --- rechupes (sink marks) sobre los nervios interiores
  float rechupe = fbm(p * 3.0, 3.0*S, 3, 0.5, 17.0);

  // --- rayones blanquecinos por roce
  float a1 = aranazos(p * 11.0, vec2(11.0*S), 0.38, 0.44, 23.0);
  float a2 = aranazos(p * 26.0, vec2(26.0*S), 0.45, 0.42, 29.0);
  float r1 = 1.0 - smoothstep(0.0, 0.0038, a1);
  float r2 = 1.0 - smoothstep(0.0, 0.0024, a2);
  float raya = clamp(r1 + r2*0.7, 0.0, 1.0);

  // --- marcas de golpe (blanqueo por tension) y polvo
  float golpe = poros(p*8.0, vec2(8.0*S), 0.14, 0.26, 31.0);
  float polvo = fbm(p*16.0, 16.0*S, 4, 0.55, 37.0);

  float h = 0.82 + (vdi-0.5)*0.028 + vdiF*0.010 + (flujo-0.5)*0.012
          + (rechupe-0.5)*0.020 - raya*0.020 - golpe*0.16;

  vec3 base = uPlastico;
  base *= 0.95 + 0.10*polvo;
  base = mezclaLin(base, base*vec3(0.94,0.95,0.97), flujo*0.20);
  // el plastico rayado y golpeado blanquea
  base = mezclaLin(base, mezclaLin(base, vec3(0.92,0.92,0.92), 0.70), raya*0.55);
  base = mezclaLin(base, mezclaLin(base, vec3(0.88,0.88,0.89), 0.60), golpe*0.45);
  // amarilleo por UV, por zonas
  float uvAm = smoothstep(0.45, 0.88, fbm(p*2.2, 2.2*S, 3, 0.5, 41.0));
  base = mezclaLin(base, base*vec3(1.10,1.02,0.86), uvAm*0.45);
  base *= 0.96 + 0.08*vdi;

  c.altura = h;
  c.base   = base;
  // satinado: el texturado del molde lo apaga, el roce lo pule
  c.rug    = clamp(0.42 + (1.0-vdi)*0.16 + golpe*0.12 + uvAm*0.06
                   - raya*0.16, 0.10, 1.0);
  c.met    = 0.0;
  c.cav    = golpe*0.4 + raya*0.2;
  c.sucK   = 0.45;
  c.suc    = vec3(0.145,0.140,0.132);
  c.borde  = 0.55;
  return c;
}
`;

export const lona = /* glsl */ `
uniform vec3 uLona;
Campo campo(vec2 uv){
  Campo c = nuevoCampo();
  float S = uEsc;  vec2 p = uv * S;

  // --- tejido a la plana: urdimbre y trama alternando por encima
  float nH = 46.0 * S;                     // hilos por lado (par)
  vec2 t = uv * nH;
  vec2 ci = floor(t);
  vec2 cf = fract(t);
  float alterna = mod(ci.x + ci.y, 2.0);   // 0 -> urdimbre arriba

  // perfil redondeado de cada hilo
  float perfU = sin(cf.x * PI);            // hilo vertical
  float perfT = sin(cf.y * PI);            // hilo horizontal
  float arriba = mix(perfT, perfU, alterna);
  float abajo  = mix(perfU, perfT, alterna);
  float trama = arriba * 0.78 + abajo * 0.22;

  // fibrillas dentro de cada hilo
  float fibU = fbm2(vec2(t.x*3.0, t.y*22.0), vec2(nH*3.0, nH*22.0), 2, 0.5, 3.0);
  float fibT = fbm2(vec2(t.x*22.0, t.y*3.0), vec2(nH*22.0, nH*3.0), 2, 0.5, 5.0);
  float fib = mix(fibT, fibU, alterna) * uMicro;

  // --- pliegues: arrugas anchas del toldo
  vec2 pw = deformar(p * 2.2, vec2(2.2*S), 0.40, 2, 11.0);
  float plieg = fbmCresta(pw, vec2(2.2*S), 3, 0.5, 13.0);
  float pliegF = fbmCresta(p*5.5, vec2(5.5*S), 3, 0.5, 17.0);
  float arruga = plieg*0.7 + pliegF*0.3;

  // --- desgaste: en la CRESTA del pliegue la fibra se pela
  float cresta = smoothstep(0.55, 0.92, arruga);
  float pelada = cresta * smoothstep(0.35, 0.75, fbm(p*6.0, 6.0*S, 4, 0.55, 19.0));

  // --- rotos y deshilachado
  float roto = smoothstep(0.80, 0.93, fbm(deformar(p*4.0, vec2(4.0*S), 0.35, 2, 23.0), 4.0*S, 4, 0.55, 29.0));

  // --- recubrimiento de PVC: brillo desigual
  float pvc = fbm(p*9.0, 9.0*S, 4, 0.55, 31.0);

  float h = 0.58 + trama*0.26 + fib*0.020 + arruga*0.085
          - roto*0.30 - pelada*0.030;

  vec3 lonaCol = uLona;
  lonaCol *= 0.86 + 0.28*trama;                      // sombreado del hilo
  lonaCol = mezclaLin(lonaCol, lonaCol*vec3(1.12,1.10,1.06), fib*0.35);
  // decoloracion por sol en las crestas
  lonaCol = mezclaLin(lonaCol, mezclaLin(lonaCol, vec3(0.62,0.62,0.58), 0.55), cresta*0.45);
  // fibra pelada: mas clara y mate
  lonaCol = mezclaLin(lonaCol, mezclaLin(lonaCol, vec3(0.70,0.69,0.64), 0.70), pelada*0.60);
  lonaCol = mezclaLin(lonaCol, vec3(0.045,0.045,0.048), roto*0.85);
  lonaCol *= 0.94 + 0.12*pvc;

  c.altura = h;
  c.base   = lonaCol;
  c.rug    = clamp(0.74 + pelada*0.16 + (1.0-trama)*0.10 - pvc*0.14
                   - cresta*0.04, 0.25, 1.0);
  c.met    = 0.0;
  // los valles del tejido son cavidades: ahi se mete la suciedad (paso B)
  c.cav    = (1.0 - trama)*0.55 + roto*0.5;
  c.sucK   = 0.90;
  c.suc    = vec3(0.115,0.108,0.092);
  c.borde  = 0.75;
  return c;
}
`;

export const carton = /* glsl */ `
Campo campo(vec2 uv){
  Campo c = nuevoCampo();
  float S = uEsc;  vec2 p = uv * S;

  // --- fibra de papel: filamentos cortos en todas direcciones
  float f1 = 1.0 - smoothstep(0.0, 0.0050, aranazos(p * 22.0, vec2(22.0*S), 0.70, 0.45, 3.0));
  float f2 = 1.0 - smoothstep(0.0, 0.0032, aranazos(p * 46.0, vec2(46.0*S), 0.75, 0.45, 7.0));
  float f3 = (1.0 - smoothstep(0.0, 0.0022, aranazos(p * 88.0, vec2(88.0*S), 0.80, 0.45, 11.0))) * uMicro;
  float fibra = clamp(f1*0.5 + f2*0.35 + f3*0.28, 0.0, 1.0);
  float granoP = fbm(p * 95.0, 95.0*S, 3, 0.55, 13.0);
  float nube = fbm(p * 9.0, 9.0*S, 4, 0.55, 17.0);       // gramaje desigual

  // --- la onda interior marca el liner: acanalado suave y periodico
  float nOnda = 26.0 * S;
  float onda = sin(TAU * uv.x * nOnda) * 0.5 + 0.5;
  onda = pow(onda, 1.3);
  float ondaVis = onda * (0.45 + 0.55*smoothstep(0.35,0.75,nube));

  // --- zona reventada: el liner se ha arrancado y asoma la onda
  float rotoMapa = fbm2(deformar(p*2.6, vec2(2.6*S), 0.40, 2, 19.0), vec2(2.6*S), 4, 0.55, 23.0);
  float roto = smoothstep(0.66, 0.74, rotoMapa);
  float bordeRoto = smoothstep(0.62, 0.68, rotoMapa) - roto;
  float ondaFuerte = (sin(TAU * uv.x * nOnda - 0.6) * 0.5 + 0.5);

  // --- aplastamientos y golpes en las aristas
  float golpe = poros(p*6.0, vec2(6.0*S), 0.20, 0.30, 29.0);
  float pliegue = 1.0 - smoothstep(0.0, 0.010, abs(fract(uv.y*3.0*S) - 0.5));
  float raspado = smoothstep(0.55, 0.85, fbm(p*5.0, 5.0*S, 4, 0.55, 31.0));

  // --- humedad: manchas oscuras que abomban el carton
  float humedad = smoothstep(0.60, 0.85, fbm(deformar(p*3.2, vec2(3.2*S), 0.35, 2, 37.0), 3.2*S, 4, 0.55, 41.0));

  float h = 0.78 + (nube-0.5)*0.035 + fibra*0.020 + granoP*0.012
          + ondaVis*0.022 - golpe*0.16 - pliegue*0.10
          - roto*0.16 + roto*ondaFuerte*0.20 + bordeRoto*0.03;

  // kraft: marron calido
  vec3 kraft = vec3(0.520,0.375,0.228);
  kraft = mezclaLin(kraft, vec3(0.610,0.462,0.300), nube);
  kraft *= 0.90 + 0.20*granoP;
  kraft = mezclaLin(kraft, kraft*vec3(1.14,1.10,1.04), fibra*0.35);
  kraft = mezclaLin(kraft, kraft*vec3(0.93,0.92,0.90), ondaVis*0.22);
  // interior reventado: onda mas clara y mate
  vec3 interior = vec3(0.585,0.450,0.300) * (0.82 + 0.36*ondaFuerte);
  kraft = mezclaLin(kraft, interior, roto*0.85);
  kraft = mezclaLin(kraft, vec3(0.330,0.230,0.140), bordeRoto*0.55);
  // fibras blancas donde se ha raspado el liner
  kraft = mezclaLin(kraft, vec3(0.700,0.630,0.520), raspado*golpe*0.55 + pliegue*0.25);
  // mancha de humedad
  kraft = mezclaLin(kraft, kraft*vec3(0.60,0.58,0.56), humedad*0.65);
  // tinta de serigrafia descolorida
  float tinta = smoothstep(0.66, 0.80, fbm(p*3.4, 3.4*S, 3, 0.5, 43.0))
              * smoothstep(0.40, 0.70, fbm(p*1.2, 1.2*S, 2, 0.5, 47.0));
  kraft = mezclaLin(kraft, vec3(0.180,0.175,0.185), tinta*0.42*(1.0-roto));

  c.altura = h;
  c.base   = kraft;
  c.rug    = clamp(0.90 + fibra*0.06 + roto*0.05 - humedad*0.10
                   - pliegue*0.04, 0.5, 1.0);
  c.met    = 0.0;
  c.cav    = golpe*0.5 + roto*0.35 + pliegue*0.4;
  c.sucK   = 0.70;
  c.suc    = vec3(0.145,0.108,0.070);
  c.borde  = 0.65;
  return c;
}
`;
