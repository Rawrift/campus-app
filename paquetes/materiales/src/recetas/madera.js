// Recetas de madera. El hilo corre a lo largo de X; las tablas se apilan en Y.
// Los anillos nacen de una coordenada radial deformada (arcos de catedral) y se
// vuelven concentricos alrededor de los nudos.

export const madera_tabla = /* glsl */ `
Campo campo(vec2 uv){
  Campo c = nuevoCampo();
  float S = uEsc;
  float nT = 4.0 * S;                       // 4 tablas apiladas

  float fil = floor(uv.y * nT);
  float ly  = fract(uv.y * nT);
  float r1 = h21(vec2(mod(fil,nT), 1.0) + sem(3.0));
  float r2 = h21(vec2(mod(fil,nT), 9.0) + sem(5.0));
  float r3 = h21(vec2(mod(fil,nT), 17.0) + sem(7.0));

  // dominio del hilo: periodico en X (periodo S*GX), local a la tabla en Y
  float GX = 3.0;
  vec2 G = vec2(uv.x * S * GX + r1 * 53.0, ly * 2.0 + r2 * 31.0);
  vec2 P = vec2(S * GX, 8.0);

  // --- nudos: hasta dos por tabla
  float kx1 = h21(vec2(mod(fil,nT), 23.0)+sem(11.0));
  float ky1 = 0.25 + 0.5*h21(vec2(mod(fil,nT), 29.0)+sem(13.0));
  float kOn1 = step(0.42, r3);
  float dx1 = abs(fract(uv.x - kx1 + 0.5) - 0.5);
  float dk1 = length(vec2(dx1 * 2.6 * S, (ly - ky1) * 0.55));

  float kx2 = h21(vec2(mod(fil,nT), 31.0)+sem(17.0));
  float ky2 = 0.25 + 0.5*h21(vec2(mod(fil,nT), 37.0)+sem(19.0));
  float kOn2 = step(0.78, r2);
  float dx2 = abs(fract(uv.x - kx2 + 0.5) - 0.5);
  float dk2 = length(vec2(dx2 * 3.2 * S, (ly - ky2) * 0.60));

  float dk = min(kOn1 > 0.5 ? dk1 : 9.0, kOn2 > 0.5 ? dk2 : 9.0);
  float infl  = 1.0 - smoothstep(0.012, 0.085, dk);      // desvio del hilo
  float nucleo= 1.0 - smoothstep(0.006, 0.020, dk);      // madera del nudo

  // --- anillos de crecimiento, deformados
  float w1 = fbm2(G,               P,               4, 0.55, 11.0) * 2.0 - 1.0;
  float w2 = fbm2(G * 3.0,         P * 3.0,         3, 0.50, 13.0) * 2.0 - 1.0;
  float w3 = fbm2(G * vec2(9.0,2.0), P * vec2(9.0,2.0), 2, 0.5, 23.0) * 2.0 - 1.0;
  float rt = G.y * 9.0 + w1 * 3.1 + w2 * 0.7 + w3 * 0.22;
  rt = mix(rt, dk * 130.0, infl);                        // concentrico en el nudo

  float anillo = fract(rt);
  float dAn = abs(anillo - 0.72);
  float tardia = 1.0 - smoothstep(0.040, 0.150, dAn);    // banda oscura y dura
  float temprana = smoothstep(0.10, 0.45, dAn);

  // --- fibra: lineas finisimas A LO LARGO del hilo
  float fibra  = fbm2(G * vec2(2.0, 40.0), P * vec2(2.0, 40.0), 2, 0.55, 17.0);
  float fibra2 = fbm2(G * vec2(1.0, 14.0), P * vec2(1.0, 14.0), 3, 0.55, 19.0);
  float poro   = fbm2(G * vec2(6.0, 70.0), P * vec2(6.0, 70.0), 1, 0.5, 29.0) * uMicro;

  // --- junta entre tablas y chaflan
  float bordeT = min(ly, 1.0 - ly);
  float junta = 1.0 - smoothstep(0.0, 0.013, bordeT);
  float chaflan = 1.0 - smoothstep(0.010, 0.055, bordeT);

  // --- clavos
  float nxa = 0.12 + 0.06*r1, nxb = 0.88 - 0.06*r2;
  float dn = min(length(vec2(abs(fract(uv.x*S - nxa + 0.5)-0.5)*S, (ly-0.5)*0.45)),
                 length(vec2(abs(fract(uv.x*S - nxb + 0.5)-0.5)*S, (ly-0.5)*0.45)));
  float clavo = 1.0 - smoothstep(0.008, 0.014, dn);
  float halonClavo = 1.0 - smoothstep(0.010, 0.045, dn);

  // --- superficie
  float ray = 1.0 - smoothstep(0.0, 0.0035, aranazosDir(vec2(uv.x*S, ly)*vec2(6.0,6.0),
                     vec2(6.0*S, 6.0), 0.30, 0.42, 0.0, 0.45, 31.0));

  float h = 0.80 + temprana*0.020 - tardia*0.030 + (fibra-0.5)*0.022 + (fibra2-0.5)*0.012
          + poro*0.006 - ray*0.020
          - nucleo*0.035 - junta*0.55 - chaflan*0.045
          - clavo*0.30 + halonClavo*0.010;

  // --- color: pino con variacion por tabla
  vec3 claro  = mezclaLin(vec3(0.640,0.468,0.290), vec3(0.735,0.560,0.365), r1);
  vec3 oscuro = mezclaLin(vec3(0.360,0.222,0.110), vec3(0.470,0.300,0.158), r2);
  claro  *= 0.86 + 0.28 * r3;
  oscuro *= 0.88 + 0.24 * r3;

  vec3 col = mezclaLin(claro, oscuro, tardia * 0.92);
  col = mezclaLin(col, col * vec3(0.90,0.86,0.80), (1.0 - fibra2) * 0.30);
  col *= 0.93 + 0.14 * fibra;
  col = mezclaLin(col, col * vec3(1.08,1.05,0.98), temprana * 0.25);
  // nudo: mucho mas oscuro y resinoso
  col = mezclaLin(col, vec3(0.185,0.108,0.055), nucleo * 0.88);
  col = mezclaLin(col, vec3(0.300,0.185,0.098), (infl - nucleo) * 0.45);
  // junta y chaflan en sombra
  col = mezclaLin(col, vec3(0.085,0.058,0.036), junta * 0.9);
  // clavo de acero con su cerco de oxido
  col = mezclaLin(col, vec3(0.330,0.185,0.098), halonClavo * 0.45);
  col = mezclaLin(col, vec3(0.640,0.630,0.620), clavo * 0.85);
  // grisaceo de intemperie en las zonas expuestas
  float gris = smoothstep(0.42, 0.85, fbm(vec2(uv.x*S, ly)*2.5, 2.5*S, 4, 0.55, 41.0));
  col = mezclaLin(col, mezclaLin(col, vec3(0.44,0.42,0.40), 0.60), gris * 0.35);

  c.altura = h;
  c.base   = col;
  c.rug    = clamp(0.62 + tardia*0.10 + (1.0-fibra2)*0.10 + gris*0.14
                   - temprana*0.05 + ray*0.06, 0.2, 1.0);
  c.met    = clavo * 0.85;
  c.cav    = junta*0.6 + nucleo*0.25 + clavo*0.4;
  c.sucK   = 0.65;
  c.suc    = vec3(0.105,0.080,0.055);
  c.borde  = 0.55;
  return c;
}`;

export const madera_contrachapado = /* glsl */ `
Campo campo(vec2 uv){
  Campo c = nuevoCampo();
  float S = uEsc;  vec2 p = uv * S;

  // chapa desenrollada: anillos MUY abiertos, casi paralelos, con arcos amplios
  vec2 G = vec2(uv.x * S * 2.0, uv.y * S * 2.0);
  vec2 P = vec2(S * 2.0);

  float w1 = fbm2(G,                 P,                 4, 0.58, 3.0) * 2.0 - 1.0;
  float w2 = fbm2(G * vec2(4.0,1.5), P * vec2(4.0,1.5), 3, 0.50, 7.0) * 2.0 - 1.0;
  float rt = uv.y * S * 7.0 + w1 * 2.4 + w2 * 0.5;
  float anillo = fract(rt);
  float dAn = abs(anillo - 0.70);
  float veta = 1.0 - smoothstep(0.035, 0.22, dAn);
  float clara = smoothstep(0.12, 0.48, dAn);

  // fibra fina y poros del desenrollo
  float fibra = fbm2(G * vec2(1.5, 34.0), P * vec2(1.5, 34.0), 2, 0.55, 11.0);
  float micro = fbm2(G * vec2(4.0, 60.0), P * vec2(4.0, 60.0), 1, 0.5, 13.0) * uMicro;
  // microfisuras del desenrollo (lathe checks): lineas a contrahilo
  float checks = fbm2(G * vec2(70.0, 1.2), P * vec2(70.0, 1.2), 2, 0.5, 17.0);
  checks = smoothstep(0.62, 0.90, checks) * uMicro;

  // parches ovalados de reparacion ("footballs")
  vec2 pc = deformar(p * 2.0, vec2(2.0*S), 0.20, 1, 19.0);
  Celular pf = celular(pc, vec2(2.0*S), 1.0, 23.0);
  float parche = 1.0 - smoothstep(0.18, 0.26, length(pf.d1 * vec2(1.0, 2.2)));
  parche *= step(0.80, pf.id);
  float parcheBorde = (1.0 - smoothstep(0.24, 0.28, length(pf.d1*vec2(1.0,2.2)))) - parche;
  parcheBorde = max(parcheBorde, 0.0) * step(0.80, pf.id);

  // huecos y grietas del canto de la chapa
  float hueco = poros(p * 14.0, vec2(14.0*S), 0.10, 0.26, 29.0);
  // lijado
  float lija = 1.0 - smoothstep(0.0, 0.0030,
               aranazosDir(p*22.0, vec2(22.0*S), 0.45, 0.42, 0.0, 0.7, 31.0));

  float h = 0.84 - veta*0.016 + (fibra-0.5)*0.018 + micro*0.006 - checks*0.010
          - hueco*0.30 - lija*0.012 + parche*0.008 - parcheBorde*0.030;

  // abedul/chopo: claro, amarillento
  vec3 claroCol  = vec3(0.735,0.610,0.420);
  vec3 vetaCol   = vec3(0.520,0.385,0.235);
  float manchon = fbm(p*3.0, 3.0*S, 4, 0.55, 37.0);
  vec3 col = mezclaLin(claroCol, vetaCol, veta*0.85);
  col = mezclaLin(col, col*vec3(1.06,1.02,0.94), clara*0.30);
  col *= 0.90 + 0.20*fibra;
  col = mezclaLin(col, col*vec3(0.92,0.88,0.82), (1.0-manchon)*0.25);
  col = mezclaLin(col, vec3(0.300,0.215,0.130), checks*0.30);
  // parche mas oscuro y cola reseca en su borde
  col = mezclaLin(col, vec3(0.545,0.420,0.265), parche*0.75);
  col = mezclaLin(col, vec3(0.330,0.250,0.160), parcheBorde*0.80);
  col = mezclaLin(col, vec3(0.180,0.130,0.080), hueco*0.7);
  // sello de tinta descolorido
  float sello = smoothstep(0.70, 0.86, fbm(p*5.0, 5.0*S, 3, 0.5, 41.0))
              * smoothstep(0.55, 0.75, fbm(p*1.5, 1.5*S, 2, 0.5, 43.0));
  col = mezclaLin(col, vec3(0.28,0.30,0.34), sello*0.30);

  c.altura = h;
  c.base   = col;
  c.rug    = clamp(0.58 + veta*0.08 + (1.0-fibra)*0.10 + lija*0.08
                   + hueco*0.15 + parche*0.06, 0.2, 1.0);
  c.cav    = hueco*0.8 + parcheBorde*0.4;
  c.sucK   = 0.50;
  c.suc    = vec3(0.130,0.098,0.065);
  c.borde  = 0.45;
  return c;
}`;

export const madera_pale = /* glsl */ `
Campo campo(vec2 uv){
  Campo c = nuevoCampo();
  float S = uEsc;
  float nT = 5.0 * S;                     // tablas estrechas de pale

  float fil = floor(uv.y * nT);
  float ly  = fract(uv.y * nT);
  float r1 = h21(vec2(mod(fil,nT), 1.0) + sem(3.0));
  float r2 = h21(vec2(mod(fil,nT), 9.0) + sem(5.0));
  float r3 = h21(vec2(mod(fil,nT), 15.0) + sem(7.0));

  float GX = 3.0;
  vec2 G = vec2(uv.x * S * GX + r1 * 47.0, ly * 2.0 + r2 * 29.0);
  vec2 P = vec2(S * GX, 8.0);

  // --- anillos y fibra levantada por la intemperie
  float w1 = fbm2(G,       P,       4, 0.55, 11.0) * 2.0 - 1.0;
  float w2 = fbm2(G * 3.0, P * 3.0, 3, 0.50, 13.0) * 2.0 - 1.0;
  float rt = G.y * 8.0 + w1 * 2.9 + w2 * 0.6;
  float anillo = fract(rt);
  float tardia = 1.0 - smoothstep(0.035, 0.145, abs(anillo - 0.70));
  float fibra  = fbm2(G * vec2(2.0, 36.0), P * vec2(2.0, 36.0), 2, 0.55, 17.0);
  float fibra2 = fbm2(G * vec2(1.0, 12.0), P * vec2(1.0, 12.0), 3, 0.55, 19.0);

  // --- marcas de la sierra circular: bandas curvas, exactamente periodicas
  float fase = uv.y * nT * 14.0 + cos(TAU * uv.x) * 3.2 + sin(TAU * 2.0 * uv.x + 1.3) * 1.1;
  float sierra = sin(TAU * fase) * 0.5 + 0.5;
  sierra = pow(sierra, 1.6);

  // --- fendas (rajas a lo largo del hilo)
  float rajaMapa = fbm2(G * vec2(1.0, 7.0), P * vec2(1.0, 7.0), 4, 0.55, 23.0);
  float raja = (1.0 - smoothstep(0.0, 0.020, abs(rajaMapa - 0.5)))
             * smoothstep(0.35, 0.70, fbm2(G*vec2(1.5,0.8), P*vec2(1.5,0.8), 3, 0.5, 29.0));

  // --- astillas levantadas en el canto
  float bordeT = min(ly, 1.0 - ly);
  float junta = 1.0 - smoothstep(0.0, 0.020, bordeT);
  float chaflan = 1.0 - smoothstep(0.015, 0.075, bordeT);
  float astilla = (1.0 - smoothstep(0.02, 0.10, bordeT))
                * smoothstep(0.45, 0.80, fbm2(vec2(uv.x*S*9.0, ly*3.0), vec2(9.0*S, 3.0), 3, 0.5, 31.0));

  // --- nudos grandes y saltados
  float kx = h21(vec2(mod(fil,nT), 23.0)+sem(11.0));
  float ky = 0.3 + 0.4*h21(vec2(mod(fil,nT), 27.0)+sem(13.0));
  float dxk = abs(fract(uv.x - kx + 0.5) - 0.5);
  float dk = length(vec2(dxk * 3.0 * S, (ly - ky) * 0.55));
  float kOn = step(0.35, r3);
  float nucleo = (1.0 - smoothstep(0.008, 0.026, dk)) * kOn;
  float aro    = ((1.0 - smoothstep(0.020, 0.048, dk)) - nucleo) * kOn;

  // --- clavos hundidos con cerco de oxido
  float nx1 = 0.18 + 0.08*r1, nx2 = 0.5 + 0.06*r2, nx3 = 0.84 - 0.08*r3;
  float dn = min(min(abs(fract(uv.x - nx1 + 0.5)-0.5), abs(fract(uv.x - nx2 + 0.5)-0.5)),
                 abs(fract(uv.x - nx3 + 0.5)-0.5));
  float dnn = length(vec2(dn * 3.0 * S, (ly - 0.5) * 0.40));
  float clavo = 1.0 - smoothstep(0.009, 0.016, dnn);
  float cerco = 1.0 - smoothstep(0.012, 0.070, dnn);

  float h = 0.80 - tardia*0.045 + (fibra-0.5)*0.045 + (fibra2-0.5)*0.020
          - (sierra)*0.022 - raja*0.30 + astilla*0.05
          - nucleo*0.10 + aro*0.02 - junta*0.60 - chaflan*0.055
          - clavo*0.40;

  // --- color: pino muy agrisado por la intemperie
  float exposicion = smoothstep(0.25, 0.85, fbm2(vec2(uv.x*S*2.0, ly*1.5), vec2(2.0*S,1.5), 4, 0.55, 37.0));
  vec3 pinoClaro = mezclaLin(vec3(0.600,0.470,0.320), vec3(0.690,0.545,0.385), r1);
  vec3 pinoOsc   = mezclaLin(vec3(0.355,0.245,0.145), vec3(0.440,0.315,0.195), r2);
  vec3 gris      = mezclaLin(vec3(0.395,0.378,0.355), vec3(0.510,0.492,0.462), r3);

  vec3 col = mezclaLin(pinoClaro, pinoOsc, tardia*0.9);
  col *= 0.92 + 0.16*fibra;
  col = mezclaLin(col, gris, (0.35 + 0.55*exposicion));      // plateado de intemperie
  col = mezclaLin(col, col*0.86, (1.0-fibra2)*0.30);
  col = mezclaLin(col, col*vec3(1.05,1.02,0.97), sierra*0.22);
  col = mezclaLin(col, vec3(0.135,0.098,0.062), raja*0.85);
  col = mezclaLin(col, vec3(0.165,0.100,0.052), nucleo*0.85);
  col = mezclaLin(col, vec3(0.290,0.190,0.105), aro*0.55);
  col = mezclaLin(col, vec3(0.075,0.052,0.035), junta*0.92);
  col = mezclaLin(col, vec3(0.360,0.190,0.095), cerco*0.60);   // oxido alrededor del clavo
  col = mezclaLin(col, vec3(0.330,0.325,0.320), clavo*0.80);
  // manchon de tinta del sello del pale
  float tinta = smoothstep(0.72, 0.88, fbm2(vec2(uv.x*S*4.0, ly*2.0), vec2(4.0*S,2.0), 3, 0.5, 43.0));
  col = mezclaLin(col, vec3(0.22,0.20,0.19), tinta*0.35);

  c.altura = h;
  c.base   = col;
  c.rug    = clamp(0.80 + exposicion*0.12 + (1.0-fibra2)*0.08 + astilla*0.06
                   - tardia*0.04, 0.35, 1.0);
  c.met    = clavo*0.7;
  c.cav    = raja*0.8 + junta*0.6 + nucleo*0.3 + clavo*0.5;
  c.sucK   = 0.85;
  c.suc    = vec3(0.095,0.078,0.058);
  c.borde  = 0.70;
  return c;
}`;
