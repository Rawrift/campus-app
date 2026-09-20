// Recetas metalicas. Nota sobre F0: para conductores el "albedo" ES la reflectancia
// especular. Los valores se escriben en sRGB de almacenamiento para que, tras la
// conversion a lineal del visor (^2.2), caigan en el F0 fisico correcto:
//   hierro/acero  lineal 0.56 -> sRGB 0.77
//   aluminio      lineal 0.91 -> sRGB 0.96
//   zinc          lineal 0.66 -> sRGB 0.83

export const metal_pintado = /* glsl */ `
uniform vec3 uPintura;
Campo campo(vec2 uv){
  Campo c = nuevoCampo();
  float S = uEsc;  vec2 p = uv * S;

  // --- chapa: ondulacion muy suave del soporte + costillas de refuerzo
  float chapa = fbm(p * 3.0, 3.0*S, 3, 0.5, 2.0);
  // --- capa de pintura: piel de naranja de la pistola
  float naranja = fbm(p * 130.0, 130.0*S, 2, 0.5, 5.0) * uMicro;
  float naranja2 = fbm(p * 46.0, 46.0*S, 3, 0.55, 9.0);
  float polvo = fbm(p * 18.0, 18.0*S, 4, 0.55, 13.0);

  // --- saltados de pintura: se concentran donde hay roce (bordes de celda)
  Celular ce = celular(p * 9.0, vec2(9.0*S), 1.0, 17.0);
  float zonaRoce = smoothstep(0.40, 0.78, fbm(p * 4.0, 4.0*S, 4, 0.55, 19.0));
  float saltadoRaw = (1.0 - smoothstep(0.02, 0.16, bordeCelda(ce))) * zonaRoce;
  float saltado = smoothstep(0.30, 0.62, saltadoRaw);            // pintura ausente
  float halo    = smoothstep(0.12, 0.40, saltadoRaw) - saltado;  // borde levantado

  // arañazos que atraviesan la pintura
  float ar = aranazos(p * 16.0, vec2(16.0*S), 0.26, 0.40, 23.0);
  float aranazo = 1.0 - smoothstep(0.0, 0.0045, ar);
  float aranazoAncho = 1.0 - smoothstep(0.0, 0.013, ar);
  float pelado = clamp(saltado + aranazo*0.85, 0.0, 1.0);

  // --- oxido que nace EN los saltados y en los arañazos, y se extiende
  float ox = smoothstep(0.25, 0.85, saltadoRaw + aranazoAncho*0.45)
           * smoothstep(0.30, 0.70, fbm(p*11.0, 11.0*S, 4, 0.55, 29.0));
  ox = clamp(ox * 1.2, 0.0, 1.0);
  // regueros de oxido que bajan desde los saltados
  float chorro = reguero(uv, 26.0*S, 0.06, 0.30, 31.0)
               * smoothstep(0.35, 0.8, fbm(p*5.0,5.0*S,3,0.5,37.0));

  float h = 0.72 + chapa*0.10 + naranja2*0.020 + naranja*0.010 - saltado*0.10
          + halo*0.035 - aranazo*0.07 + ox*0.035;

  // --- color
  vec3 pintura = uPintura;                    // color industrial parametrizable
  pintura = mezclaLin(pintura, pintura*vec3(1.18,1.16,1.12), polvo*0.5);
  pintura *= 0.93 + 0.14*naranja2;
  // calcinado del pigmento por el sol
  float tiza = smoothstep(0.45, 0.90, fbm(p*2.2, 2.2*S, 3, 0.5, 41.0));
  pintura = mezclaLin(pintura, mezclaLin(pintura, vec3(0.66,0.66,0.64), 0.55), tiza*0.55);

  vec3 acero = vec3(0.770,0.775,0.780) * (0.88 + 0.20*naranja2);
  vec3 oxido = mezclaLin(vec3(0.360,0.170,0.082), vec3(0.530,0.290,0.135),
                         fbm(p*22.0,22.0*S,3,0.5,43.0));

  vec3 col = pintura;
  col = mezclaLin(col, acero, pelado * (1.0 - ox*0.85));
  col = mezclaLin(col, oxido, clamp(ox + chorro*0.8, 0.0, 1.0)*0.92);
  col = mezclaLin(col, vec3(0.88,0.88,0.89), aranazo*(1.0-ox)*0.35);  // brillo del arañazo

  float metal = clamp(pelado*(1.0-ox*0.9), 0.0, 1.0);

  c.altura = h;
  c.base   = col;
  c.rug    = mix(0.34 + naranja2*0.12 + tiza*0.22, 0.30 + naranja2*0.10, pelado);
  c.rug    = mix(c.rug, 0.90, clamp(ox+chorro*0.6,0.0,1.0));
  c.rug    = mix(c.rug, 0.16, aranazo*(1.0-ox)*0.5);
  c.met    = metal;
  c.cav    = saltado*0.35 + aranazo*0.4;
  c.sucK   = 0.60;
  c.suc    = vec3(0.115,0.105,0.095);
  // el canto convexo pierde pintura y deja ver metal pulido: lo aplica el paso B
  c.borde  = 0.90;
  return c;
}`;

export const metal_oxidado = /* glsl */ `
Campo campo(vec2 uv){
  Campo c = nuevoCampo();
  float S = uEsc;  vec2 p = uv * S;

  float macro = macroVar(uv, 71.0);
  // el oxido avanza desde focos: manchas de baja frecuencia deformadas
  vec2 w = deformar(p * 3.0, vec2(3.0*S), 0.45, 2, 3.0);
  float frente = fbm2(w, vec2(3.0*S), 5, 0.55, 5.0);
  float ox = smoothstep(0.38, 0.62, frente + macro*0.18 - 0.09);

  // escamas de oxido laminado: celdas con escalon
  Celular es = celular(p * 26.0, vec2(26.0*S), 1.0, 11.0);
  float escama = smoothstep(0.03, 0.14, bordeCelda(es));
  float escalon = (fract(es.id*5.7) - 0.5);
  Celular es2 = celular(p * 55.0, vec2(55.0*S), 1.0, 13.0);
  float escama2 = smoothstep(0.03, 0.16, bordeCelda(es2));

  // picaduras profundas donde el oxido ya ha comido el acero
  float pic = max(poros(p * 34.0, vec2(34.0*S), 0.34, 0.34, 17.0),
                  poros(p * 72.0, vec2(72.0*S), 0.30, 0.26, 19.0)*0.6);

  float rugOx  = fbm(p * 60.0, 60.0*S, 4, 0.55, 23.0);
  float micro  = fbm(p * 175.0, 175.0*S, 2, 0.5, 29.0) * uMicro;
  float acGrano= granoDir(p * 12.0, 12.0*S, 8.0, 2, 0.5, 31.0);

  float hAcero = 0.78 + acGrano*0.02 + micro*0.008;
  float hOxido = 0.70 + rugOx*0.10 + escalon*0.07*(1.0-escama)
               + (1.0-escama)*0.045 - escama2*0.02 + micro*0.012;
  float h = mix(hAcero, hOxido, ox) - pic*ox*0.42 - pic*(1.0-ox)*0.10;

  // color: tres estratos de oxido (naranja fresco, marron, casi negro)
  float t1 = fbm(p*13.0, 13.0*S, 4, 0.55, 37.0);
  float t2 = fbm(p*30.0, 30.0*S, 3, 0.55, 41.0);
  vec3 oxNaranja = vec3(0.560,0.295,0.120);
  vec3 oxMarron  = vec3(0.355,0.180,0.090);
  vec3 oxNegro   = vec3(0.175,0.105,0.070);
  vec3 oxCol = mezclaLin(oxMarron, oxNaranja, smoothstep(0.42,0.78,t1));
  oxCol = mezclaLin(oxCol, oxNegro, smoothstep(0.52,0.85,t2)*0.8);
  oxCol *= 0.85 + 0.30*rugOx;
  oxCol = mezclaLin(oxCol, oxCol*0.55, pic*0.7);

  vec3 acero = vec3(0.745,0.750,0.760) * (0.85+0.24*acGrano);
  // pelicula gris de oxidacion incipiente sobre el acero aun sano
  acero = mezclaLin(acero, vec3(0.44,0.40,0.36), smoothstep(0.20,0.50,frente)*0.5);

  vec3 col = mezclaLin(acero, oxCol, ox);
  // regueros del oxido sobre el metal limpio
  float chorro = reguero(uv, 30.0*S, 0.05, 0.36, 47.0) * smoothstep(0.18,0.55,frente);
  col = mezclaLin(col, oxNaranja*0.85, chorro*0.7);

  c.altura = h;
  c.base   = col;
  c.rug    = mix(0.30 + acGrano*0.12, 0.88 + rugOx*0.10, ox);
  c.rug    = mix(c.rug, 0.80, chorro*0.6);
  c.met    = (1.0 - ox) * (1.0 - chorro*0.6);   // el oxido NO es conductor
  c.cav    = pic*0.8 + (1.0-escama)*ox*0.25;
  c.sucK   = 0.55;
  c.suc    = vec3(0.105,0.075,0.055);
  c.borde  = 0.75;
  return c;
}`;

export const acero_cepillado = /* glsl */ `
Campo campo(vec2 uv){
  Campo c = nuevoCampo();
  float S = uEsc;  vec2 p = uv * S;

  // cepillado: ruido MUY anisotropo, varias escalas, todas en la misma direccion
  float b1 = granoDir(p *  2.0,  2.0*S, 24.0, 3, 0.55,  2.0);
  float b2 = granoDir(p *  6.0,  6.0*S, 28.0, 2, 0.55,  7.0);
  float b3 = granoDir(p * 10.0, 10.0*S, 30.0, 1, 0.50, 11.0) * uMicro;
  float cep = b1*0.45 + b2*0.35 + b3*0.20;

  // surcos individuales del abrasivo
  float surco = granoDir(p * 1.0, 1.0*S, 110.0, 2, 0.5, 13.0);
  surco = abs(surco*2.0-1.0);

  // bandas anchas de la pasada de la cepilladora
  float banda = fbm2(vec2(p.x*1.5, p.y*9.0), vec2(1.5*S, 9.0*S), 3, 0.5, 17.0);

  // algun arañazo accidental cruzado y algun golpe
  float ar = aranazosDir(p*14.0, vec2(14.0*S), 0.16, 0.40, 1.15, 1.9, 19.0);
  float aranazo = 1.0 - smoothstep(0.0, 0.004, ar);
  float golpe = poros(p*7.0, vec2(7.0*S), 0.09, 0.22, 23.0);

  float h = 0.80 + (cep-0.5)*0.055 + (surco-0.5)*0.030 + (banda-0.5)*0.012
          - aranazo*0.10 - golpe*0.22;

  // acero inoxidable: neutro, muy poca variacion de color
  vec3 base = vec3(0.772,0.778,0.786);
  base *= 0.94 + 0.12*cep;
  base = mezclaLin(base, vec3(0.80,0.79,0.77), banda*0.20);   // ligerisimo calido
  base = mezclaLin(base, vec3(0.62,0.62,0.64), golpe*0.5);
  base = mezclaLin(base, vec3(0.86,0.87,0.88), aranazo*0.5);

  // huellas de dedos: grasa que baja la reflectancia y sube la rugosidad
  float huella = smoothstep(0.58, 0.80, fbmGrumo(deformar(p*4.5, vec2(4.5*S), 0.25, 2, 29.0),
                                                 vec2(4.5*S), 3, 0.5, 31.0));
  huella *= smoothstep(0.55, 0.85, fbm(p*2.0, 2.0*S, 3, 0.5, 37.0));
  base = mezclaLin(base, base*0.90, huella*0.6);

  c.altura = h;
  c.base   = base;
  // ANISOTROPIA aproximada: la rugosidad sigue el surco del cepillado
  c.rug    = clamp(0.24 + (1.0-surco)*0.20 + cep*0.10 + huella*0.30
                   + golpe*0.20 - aranazo*0.12, 0.05, 1.0);
  c.met    = 1.0 - huella*0.10;
  c.cav    = golpe*0.5;
  c.sucK   = 0.35;
  c.suc    = vec3(0.16,0.155,0.15);
  c.borde  = 0.85;
  return c;
}`;

export const chapa_ondulada = /* glsl */ `
Campo campo(vec2 uv){
  Campo c = nuevoCampo();
  float S = uEsc;  vec2 p = uv * S;

  // --- perfil grecado: trapecios, no senoide pura
  float nOnda = 7.0 * S;                 // entero -> tesela en X
  float t = fract(uv.x * nOnda);
  float tri = abs(t*2.0-1.0);
  float greca = smoothstep(0.22, 0.78, 1.0-tri);          // meseta arriba/abajo
  float valle = 1.0 - greca;

  // --- galvanizado: cristales de zinc (spangle)
  Celular zn = celular(p * 13.0, vec2(13.0*S), 1.0, 3.0);
  float cristal = bordeCelda(zn);
  float facetas = fract(zn.id*7.9);
  float znGrano = fbm(p * 70.0, 70.0*S, 3, 0.55, 7.0);
  float micro = fbm(p * 180.0, 180.0*S, 2, 0.5, 11.0) * uMicro;

  // --- abolladuras
  float abol = poros(p*5.0, vec2(5.0*S), 0.22, 0.32, 13.0);

  // --- oxido: nace en el fondo del valle (se acumula agua) y en los bordes bajos
  float humedad = valle;
  float focos = smoothstep(0.44, 0.72, fbm(p*6.0, 6.0*S, 4, 0.55, 17.0));
  float ox = clamp(focos * (0.35 + 0.65*humedad), 0.0, 1.0);
  ox *= smoothstep(0.30, 0.62, fbm(deformar(p*2.4, vec2(2.4*S), 0.4, 2, 19.0), 2.4*S, 4, 0.55, 23.0));
  float chorro = reguero(uv, nOnda, 0.08, 0.45, 29.0) * (0.35+0.65*valle);
  ox = clamp(ox + chorro*0.75, 0.0, 1.0);
  float oxFuerte = smoothstep(0.55, 0.95, ox);

  // --- tornillos en una linea horizontal (cada chapa va atornillada a la correa)
  float filaY = 0.5;
  float dTorn = length(vec2(fract(uv.x*nOnda + 0.5)-0.5, (uv.y-filaY)*nOnda*0.5));
  float torn = 1.0 - smoothstep(0.16, 0.24, dTorn);
  torn *= greca;

  float h = 0.50 + greca*0.42 + (znGrano-0.5)*0.020 + micro*0.008
          - abol*0.16 + torn*0.10 - oxFuerte*0.04
          + cristal*0.010;

  // --- color
  vec3 zinc = vec3(0.805,0.812,0.818);
  zinc *= 0.90 + 0.18*facetas;                    // caras del cristal
  zinc = mezclaLin(zinc, vec3(0.66,0.67,0.69), smoothstep(0.0,0.12,cristal)*0.35);
  zinc *= 0.93 + 0.14*znGrano;
  // patina gris oscura del zinc viejo
  float patina = smoothstep(0.40, 0.80, fbm(p*3.5, 3.5*S, 4, 0.55, 31.0));
  zinc = mezclaLin(zinc, vec3(0.50,0.505,0.51), patina*0.55*(0.4+0.6*valle));

  vec3 oxido = mezclaLin(vec3(0.480,0.250,0.110), vec3(0.310,0.155,0.078),
                         fbm(p*20.0,20.0*S,3,0.5,37.0));
  vec3 col = mezclaLin(zinc, oxido, ox*0.92);
  col = mezclaLin(col, vec3(0.70,0.71,0.72), torn*0.35);

  c.altura = h;
  c.base   = col;
  c.rug    = mix(0.38 + znGrano*0.14 + patina*0.20, 0.90, ox);
  c.met    = (1.0 - ox*0.95);
  c.cav    = abol*0.3 + valle*0.10;
  c.sucK   = 0.75;
  c.suc    = vec3(0.155,0.105,0.070);
  c.borde  = 0.80;
  return c;
}`;

export const aluminio_rayado = /* glsl */ `
Campo campo(vec2 uv){
  Campo c = nuevoCampo();
  float S = uEsc;  vec2 p = uv * S;

  // red de arañazos en todas las direcciones, a cuatro escalas
  float a1 = aranazos(p *  7.0, vec2( 7.0*S), 0.55, 0.45,  2.0);
  float a2 = aranazos(p * 15.0, vec2(15.0*S), 0.60, 0.45,  7.0);
  float a3 = aranazos(p * 31.0, vec2(31.0*S), 0.65, 0.45, 13.0);
  float a4 = aranazos(p * 62.0, vec2(62.0*S), 0.70, 0.45, 19.0);

  float s1 = 1.0 - smoothstep(0.0, 0.0060, a1);
  float s2 = 1.0 - smoothstep(0.0, 0.0040, a2);
  float s3 = 1.0 - smoothstep(0.0, 0.0028, a3);
  float s4 = (1.0 - smoothstep(0.0, 0.0018, a4)) * uMicro;
  float raya = clamp(s1*1.0 + s2*0.8 + s3*0.6 + s4*0.45, 0.0, 1.6);
  float rayaProf = s1*0.55 + s2*0.30 + s3*0.15;

  float lij = fbm(p * 120.0, 120.0*S, 2, 0.55, 23.0) * uMicro;
  float ondul = fbm(p * 3.0, 3.0*S, 3, 0.5, 29.0);
  float golpe = poros(p*6.0, vec2(6.0*S), 0.16, 0.26, 31.0);
  float medio = fbm(p * 26.0, 26.0*S, 3, 0.55, 37.0);

  float h = 0.82 + (ondul-0.5)*0.030 + (lij-0.5)*0.010 + (medio-0.5)*0.012
          - rayaProf*0.09 - golpe*0.26;

  // aluminio: F0 alto y neutro, apenas azulado
  vec3 base = vec3(0.945,0.952,0.958);
  base *= 0.95 + 0.10*medio;
  base = mezclaLin(base, vec3(0.80,0.81,0.83), golpe*0.5);
  // oxidacion blanquecina del aluminio (alumina pulverulenta)
  float alumina = smoothstep(0.52, 0.85, fbm(deformar(p*4.0,vec2(4.0*S),0.35,2,41.0), 4.0*S, 4, 0.55, 43.0));
  base = mezclaLin(base, vec3(0.78,0.785,0.78), alumina*0.55);
  base = mezclaLin(base, vec3(0.99,0.99,1.00), clamp(raya,0.0,1.0)*0.30);

  c.altura = h;
  c.base   = base;
  // el rayado pule el fondo del surco -> mas liso; la alumina lo apaga
  c.rug    = clamp(0.42 + lij*0.12 + alumina*0.40 + golpe*0.15
                   - clamp(raya,0.0,1.0)*0.26, 0.04, 1.0);
  c.met    = 1.0 - alumina*0.35;
  c.cav    = golpe*0.45 + rayaProf*0.25;
  c.sucK   = 0.45;
  c.suc    = vec3(0.145,0.145,0.142);
  c.borde  = 0.85;
  return c;
}`;

export const oxido_fuerte = /* glsl */ `
Campo campo(vec2 uv){
  Campo c = nuevoCampo();
  float S = uEsc;  vec2 p = uv * S;

  // corrosion consumada: laminas de oxido que se levantan y saltan
  Celular L1 = celular(p * 7.0,  vec2( 7.0*S), 1.0, 2.0);
  Celular L2 = celular(p * 16.0, vec2(16.0*S), 1.0, 5.0);
  Celular L3 = celular(p * 37.0, vec2(37.0*S), 1.0, 11.0);
  Celular L4 = celular(p * 80.0, vec2(80.0*S), 1.0, 17.0);

  float b1 = smoothstep(0.02, 0.13, bordeCelda(L1));
  float b2 = smoothstep(0.02, 0.14, bordeCelda(L2));
  float b3 = smoothstep(0.02, 0.15, bordeCelda(L3));
  float b4 = smoothstep(0.02, 0.16, bordeCelda(L4)) * uMicro;

  // cada lamina tiene su propio espesor -> escalones reales entre placas
  float e1 = (fract(L1.id*3.13)-0.5);
  float e2 = (fract(L2.id*5.71)-0.5);
  float e3 = (fract(L3.id*7.37)-0.5);

  float rugoso = fbm(p * 44.0, 44.0*S, 4, 0.55, 23.0);
  float grumo  = fbmGrumo(p * 12.0, vec2(12.0*S), 4, 0.55, 29.0);
  float micro  = fbm(p * 170.0, 170.0*S, 2, 0.5, 31.0) * uMicro;

  // crateres donde la lamina ya se desprendio
  float crater = max(poros(p*9.0,  vec2(9.0*S),  0.26, 0.34, 37.0),
                     poros(p*20.0, vec2(20.0*S), 0.30, 0.30, 41.0)*0.7);
  float picadura = poros(p*55.0, vec2(55.0*S), 0.34, 0.26, 43.0);

  float h = 0.56 + grumo*0.13 + rugoso*0.075 + micro*0.015
          + e1*0.10*b1 + e2*0.06*b2 + e3*0.035*b3
          - (1.0-b1)*0.075 - (1.0-b2)*0.045 - (1.0-b3)*0.025 - (1.0-b4)*0.012
          - crater*0.26 - picadura*0.10;

  // estratos: naranja vivo en lo recien expuesto, marron y negro en lo viejo
  float est1 = fbm(p*8.0,  8.0*S, 4, 0.55, 47.0);
  float est2 = fbm(p*19.0, 19.0*S, 4, 0.55, 53.0);
  float est3 = fbm(p*48.0, 48.0*S, 3, 0.55, 59.0);
  vec3 vivo   = vec3(0.625,0.330,0.125);
  vec3 medio  = vec3(0.430,0.215,0.100);
  vec3 viejo  = vec3(0.265,0.140,0.082);
  vec3 negro  = vec3(0.140,0.092,0.068);
  vec3 col = mezclaLin(medio, vivo, smoothstep(0.45,0.80,est1));
  col = mezclaLin(col, viejo, smoothstep(0.40,0.75,est2)*0.75);
  col = mezclaLin(col, negro, smoothstep(0.58,0.92,est3)*0.70);
  // el interior de los crateres muestra oxido fresco, mas saturado
  col = mezclaLin(col, vivo*1.06, crater*0.55);
  col *= 0.84 + 0.32*rugoso;
  col = mezclaLin(col, col*0.62, picadura*0.6);
  // costra pulverulenta clara en las cimas
  col = mezclaLin(col, vec3(0.50,0.38,0.30), smoothstep(0.62,0.95,grumo)*0.30);

  c.altura = h;
  c.base   = col;
  c.rug    = clamp(0.88 + rugoso*0.10 - smoothstep(0.7,1.0,grumo)*0.06, 0.4, 1.0);
  c.met    = 0.0;                       // el oxido es un dielectrico
  c.cav    = crater*0.7 + picadura*0.6 + (1.0-b1)*0.3;
  c.sucK   = 0.60;
  c.suc    = vec3(0.085,0.055,0.040);
  c.borde  = 0.55;
  return c;
}`;

export const pintura_desgastada = /* glsl */ `
uniform vec3 uPintura;
Campo campo(vec2 uv){
  Campo c = nuevoCampo();
  float S = uEsc;  vec2 p = uv * S;

  float soporte = fbm(p * 4.0, 4.0*S, 4, 0.5, 2.0);

  // --- craquelado: red de celdas de pintura, tipica de capa vieja y rigida
  Celular cq = celular(p * 30.0, vec2(30.0*S), 1.0, 5.0);
  float craq = 1.0 - smoothstep(0.004, 0.030, bordeCelda(cq));
  Celular cq2 = celular(p * 62.0, vec2(62.0*S), 1.0, 7.0);
  float craq2 = (1.0 - smoothstep(0.004, 0.028, bordeCelda(cq2))) * uMicro;
  float redCraq = clamp(craq + craq2*0.6, 0.0, 1.0);
  float zonaCraq = smoothstep(0.35, 0.70, fbm(p*3.0, 3.0*S, 4, 0.55, 11.0));
  redCraq *= zonaCraq;

  // --- desprendimiento en escamas: la placa de pintura salta entera
  Celular pl = celular(p * 11.0, vec2(11.0*S), 1.0, 13.0);
  float desgasteMapa = fbm(deformar(p*2.6, vec2(2.6*S), 0.45, 2, 17.0), 2.6*S, 5, 0.55, 19.0);
  float saltaRaw = smoothstep(0.38, 0.72, desgasteMapa) * smoothstep(0.30, 0.02, bordeCelda(pl));
  float capa2 = smoothstep(0.18, 0.40, saltaRaw);   // falta la capa de acabado
  float capa1 = smoothstep(0.48, 0.72, saltaRaw);   // falta tambien la imprimacion

  // levantamiento del borde de la escama (la pintura se riza antes de saltar)
  float rizo = smoothstep(0.12, 0.20, saltaRaw) - smoothstep(0.20, 0.34, saltaRaw);

  float ar = aranazos(p*18.0, vec2(18.0*S), 0.28, 0.40, 23.0);
  float aranazo = 1.0 - smoothstep(0.0, 0.0038, ar);

  float piel = fbm(p * 100.0, 100.0*S, 2, 0.5, 29.0) * uMicro;
  float polvo = fbm(p * 24.0, 24.0*S, 4, 0.55, 31.0);

  float h = 0.76 + soporte*0.045 + piel*0.010 - redCraq*0.030
          - capa2*0.035 - capa1*0.035 + rizo*0.055 - aranazo*0.05;

  // --- tres capas: acabado, imprimacion rojo oxido, acero
  vec3 acabado = uPintura;
  acabado = mezclaLin(acabado, acabado*vec3(1.14,1.12,1.10), polvo*0.45);
  float tiza = smoothstep(0.35, 0.85, fbm(p*2.0, 2.0*S, 3, 0.5, 37.0));
  acabado = mezclaLin(acabado, mezclaLin(acabado, vec3(0.70,0.70,0.68), 0.60), tiza*0.65);
  acabado *= 0.94 + 0.12*piel;

  vec3 imprim = vec3(0.395,0.190,0.135) * (0.90+0.20*polvo);
  vec3 acero  = vec3(0.755,0.760,0.770) * (0.88+0.20*polvo);
  // oxido alli donde el acero lleva expuesto tiempo
  float ox = capa1 * smoothstep(0.35, 0.75, fbm(p*14.0, 14.0*S, 4, 0.55, 41.0));
  vec3 oxido = vec3(0.420,0.215,0.105);

  vec3 col = acabado;
  col = mezclaLin(col, imprim, capa2);
  col = mezclaLin(col, acero,  capa1);
  col = mezclaLin(col, oxido,  ox*0.85);
  col = mezclaLin(col, col*0.55, redCraq*0.55);      // la fisura se ve oscura
  col = mezclaLin(col, vec3(0.86,0.86,0.87), aranazo*(1.0-capa1)*0.30);

  c.altura = h;
  c.base   = col;
  c.rug    = mix(mix(0.32 + tiza*0.34 + piel*0.10, 0.70, capa2), 0.34, capa1*(1.0-ox));
  c.rug    = mix(c.rug, 0.90, ox);
  c.rug    = mix(c.rug, 0.82, redCraq*0.4);
  c.met    = capa1 * (1.0 - ox*0.9);
  c.cav    = redCraq*0.55 + capa1*0.20 + aranazo*0.35;
  c.sucK   = 0.70;
  c.suc    = vec3(0.105,0.095,0.085);
  c.borde  = 0.95;
  return c;
}`;
