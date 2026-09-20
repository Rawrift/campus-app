// Recetas minerales: hormigon, asfalto, ladrillo, yeso, tierra, grava.
// Cada receta define `Campo campo(vec2 uv)`; ver src/glsl/pasos.js.

export const hormigon_liso = /* glsl */ `
Campo campo(vec2 uv){
  Campo c = nuevoCampo();
  float S = uEsc;  vec2 p = uv * S;

  float macro = macroVar(uv, 21.0);
  float medio = fbm(p *  9.0,  9.0*S, 5, 0.52,  3.0);
  float grano = fbm(p * 62.0, 62.0*S, 3, 0.55,  7.0);
  float micro = fbm(p *170.0,170.0*S, 2, 0.50, 11.0) * uMicro;
  float arido = aridoMulti(p * 30.0, vec2(30.0*S), 5.0);

  // burbujas de aire contra el encofrado, dos tamaños
  float burb = max(poros(p * 34.0, vec2(34.0*S), 0.20, 0.30, 17.0),
                   poros(p * 78.0, vec2(78.0*S), 0.28, 0.24, 19.0) * 0.55);
  // microfisuras de retraccion: dominio DEFORMADO para que no sean poligonos
  // rectos, muy finas y solo en zonas puntuales
  Celular re = celular(deformar(p*6.0, vec2(6.0*S), 0.26, 2, 23.0), vec2(6.0*S), 1.0, 23.0);
  float fisura = (1.0 - smoothstep(0.0, 0.013, bordeCelda(re)))
               * smoothstep(0.62, 0.93, fbm(p * 2.5, 2.5*S, 3, 0.5, 29.0));

  // moteado mineral: granos de arena y de cemento. Es lo que hace que de cerca
  // se lea como hormigon y no como un plano gris con puntos.
  Celular sp = celular(p * 150.0, vec2(150.0*S), 1.0, 43.0);
  float mote    = smoothstep(0.55, 0.05, sp.f1) * fract(sp.id*7.7);
  float moteOsc = step(0.62, fract(sp.id*3.3)) * smoothstep(0.45, 0.05, sp.f1);
  Celular sp2 = celular(p * 66.0, vec2(66.0*S), 1.0, 47.0);
  float mote2 = smoothstep(0.50, 0.08, sp2.f1) * step(0.55, fract(sp2.id*5.1));
  // juntas de encofrado: lineas rectas muy tenues
  float enc = pow(abs(sin(uv.y * PI * 3.0 * S)), 34.0);

  c.altura = 0.68 + medio*0.070 + grano*0.036 + micro*0.016
           + (arido-0.5)*0.030 + mote*0.008 + mote2*0.006
           - burb*0.26 - fisura*0.11 - enc*0.05;

  vec3 col = vec3(0.585,0.588,0.578) * (0.80+0.40*medio) * (0.88+0.24*macro);
  col = mezclaLin(col, vec3(0.470,0.470,0.492), smoothstep(0.52,0.92,arido)*0.42);
  col = mezclaLin(col, vec3(0.715,0.710,0.688), mote*0.42);        // granos claros
  col = mezclaLin(col, vec3(0.330,0.326,0.322), moteOsc*0.38);     // granos oscuros
  col = mezclaLin(col, vec3(0.640,0.630,0.600), mote2*0.26);
  col *= 1.0 - burb*0.15;
  col = mezclaLin(col, vec3(0.395,0.392,0.400), fisura*0.45);
  col *= 0.90 + 0.20*grano;
  col *= 0.95 + 0.10*micro;

  c.base  = col;
  c.rug   = 0.60 + 0.20*grano + 0.10*medio + burb*0.10 - macro*0.05 + mote*0.10;
  c.cav   = burb*0.45 + fisura*0.30 + enc*0.25;
  c.sucK  = 0.50 + 0.40*macro;
  c.suc   = vec3(0.155,0.150,0.140);
  c.borde = 0.22;
  return c;
}`;

export const hormigon_rugoso = /* glsl */ `
Campo campo(vec2 uv){
  Campo c = nuevoCampo();
  float S = uEsc;  vec2 p = uv * S;

  float macro = macroVar(uv, 41.0);
  // arido visto: guijarros de varios calibres que sobresalen de la pasta
  Celular g1 = celular(p * 15.0, vec2(15.0*S), 1.0, 2.0);
  Celular g2 = celular(p * 31.0, vec2(31.0*S), 1.0, 8.0);
  Celular g3 = celular(p * 64.0, vec2(64.0*S), 1.0, 14.0);
  // cobertura parcial: entre los guijarros TIENE que verse la pasta de cemento
  float cup1 = sqrt(max(0.0, 1.0 - g1.f1*2.25)) * step(0.46, g1.id);
  float cup2 = sqrt(max(0.0, 1.0 - g2.f1*2.35)) * step(0.52, g2.id);
  float cup3 = sqrt(max(0.0, 1.0 - g3.f1*2.45)) * step(0.62, g3.id);
  float piedra = max(max(cup1*1.0, cup2*0.62), cup3*0.35);

  float pasta = fbm(p * 12.0, 12.0*S, 5, 0.52, 21.0);
  float grano = fbm(p * 70.0, 70.0*S, 3, 0.55, 33.0);
  float micro = fbm(p *190.0,190.0*S, 2, 0.50, 37.0) * uMicro;
  float burb  = poros(p * 30.0, vec2(30.0*S), 0.30, 0.34, 44.0);
  // arena de la pasta: moteado fino entre los guijarros
  Celular sp = celular(p * 140.0, vec2(140.0*S), 1.0, 51.0);
  float mote    = smoothstep(0.55, 0.05, sp.f1) * fract(sp.id*7.7);
  float moteOsc = step(0.60, fract(sp.id*3.3)) * smoothstep(0.45, 0.05, sp.f1);

  float h = 0.46 + pasta*0.10 + piedra*0.36 + grano*0.05 + micro*0.015
          + mote*0.010 - burb*0.22;

  // color: pasta gris + aridos de tonos distintos segun el id de celda
  vec3 pastaCol = vec3(0.500,0.503,0.500) * (0.80+0.38*pasta);
  // arido de verdad: desde granito oscuro hasta caliza casi blanca, en gama FRIA
  float t1 = fract(g1.id*7.3), t2 = fract(g2.id*3.9);
  vec3 ar1 = mezclaLin(vec3(0.255,0.250,0.248), vec3(0.660,0.650,0.620), t1*t1);
  ar1 = mezclaLin(ar1, vec3(0.430,0.395,0.350), step(0.82, t1)*0.7);   // alguno ocre
  vec3 ar2 = mezclaLin(vec3(0.230,0.228,0.228), vec3(0.580,0.575,0.552), t2*t2);
  vec3 col = pastaCol;
  col = mezclaLin(col, ar1, smoothstep(0.05,0.55,cup1));
  col = mezclaLin(col, ar2, smoothstep(0.05,0.55,cup2)*0.8);
  col = mezclaLin(col, vec3(0.50,0.49,0.47), smoothstep(0.1,0.6,cup3)*0.5);
  col = mezclaLin(col, vec3(0.700,0.690,0.665), mote*0.36);
  col = mezclaLin(col, vec3(0.300,0.296,0.290), moteOsc*0.34);
  col *= (0.90+0.20*macro) * (0.90+0.20*grano);
  col *= 1.0 - burb*0.16;

  c.altura = h;
  c.base   = col;
  // el arido pulido es menos rugoso que la pasta
  c.rug    = 0.86 - piedra*0.26 + grano*0.10 - macro*0.05 + mote*0.08;
  c.cav    = burb*0.5;
  c.sucK   = 0.80;
  c.suc    = vec3(0.135,0.128,0.118);
  c.borde  = 0.55;
  return c;
}`;

export const hormigon_desconchado = /* glsl */ `
Campo campo(vec2 uv){
  Campo c = nuevoCampo();
  float S = uEsc;  vec2 p = uv * S;

  float macro = macroVar(uv, 61.0);
  // zonas donde ha saltado la piel de mortero dejando el arido a la vista
  vec2 pw = deformar(p * 3.4, vec2(3.4*S), 0.42, 2, 51.0);
  float mancha = fbm2(pw, vec2(3.4*S), 4, 0.55, 53.0);
  float salto = smoothstep(0.50, 0.60, mancha);          // 1 = desconchado
  float labio = smoothstep(0.47, 0.52, mancha) - salto;  // borde del desconchado

  // piel lisa
  float medio = fbm(p * 10.0, 10.0*S, 5, 0.52, 3.0);
  float grano = fbm(p * 66.0, 66.0*S, 3, 0.55, 7.0);
  float micro = fbm(p *175.0,175.0*S, 2, 0.50, 9.0) * uMicro;
  float burb  = poros(p * 36.0, vec2(36.0*S), 0.20, 0.28, 17.0);
  Celular sp = celular(p * 145.0, vec2(145.0*S), 1.0, 91.0);
  float mote    = smoothstep(0.55, 0.05, sp.f1) * fract(sp.id*7.7);
  float moteOsc = step(0.62, fract(sp.id*3.3)) * smoothstep(0.45, 0.05, sp.f1);

  // interior desconchado: arido grueso expuesto
  Celular g1 = celular(p * 17.0, vec2(17.0*S), 1.0, 71.0);
  Celular g2 = celular(p * 38.0, vec2(38.0*S), 1.0, 73.0);
  float cup1 = sqrt(max(0.0,1.0-g1.f1*2.0)) * step(0.25, g1.id);
  float cup2 = sqrt(max(0.0,1.0-g2.f1*2.1)) * step(0.45, g2.id);
  float aridoExp = max(cup1, cup2*0.6);

  float hPiel = 0.78 + medio*0.055 + grano*0.030 + micro*0.012 + mote*0.008 - burb*0.24;
  float hRoto = 0.44 + aridoExp*0.30 + fbm(p*20.0,20.0*S,4,0.5,77.0)*0.10;
  float h = mix(hPiel, hRoto, salto) + labio*0.03;

  // grietas radiales que parten de los desconchados
  Celular cr = celular(deformar(p*5.0, vec2(5.0*S), 0.30, 2, 81.0), vec2(5.0*S), 1.0, 81.0);
  float grieta = (1.0 - smoothstep(0.0, 0.011, bordeCelda(cr)))
               * smoothstep(0.42, 0.56, mancha);
  h -= grieta * 0.10;

  vec3 piel = vec3(0.60,0.60,0.59) * (0.84+0.32*medio) * (0.90+0.20*macro);
  piel = mezclaLin(piel, vec3(0.720,0.715,0.695), mote*0.40);
  piel = mezclaLin(piel, vec3(0.335,0.330,0.326), moteOsc*0.36);
  piel *= 0.92 + 0.16*grano;
  vec3 roto = mezclaLin(vec3(0.50,0.485,0.46), vec3(0.62,0.59,0.54), fract(g1.id*5.1));
  roto = mezclaLin(roto, vec3(0.40,0.385,0.37), 1.0-smoothstep(0.0,0.5,aridoExp));
  vec3 col = mezclaLin(piel, roto, salto);

  // oxido de la armadura que mancha alrededor del desconchado
  float ox = smoothstep(0.44,0.52,mancha) * (1.0-salto*0.75)
           * smoothstep(0.52,0.86, fbm(p*7.0,7.0*S,4,0.55,83.0));
  ox += reguero(vec2(uv.x, uv.y), 22.0*S, 0.10, 0.34, 87.0) * salto * 0.55;
  ox = clamp(ox, 0.0, 1.0);
  col = mezclaLin(col, vec3(0.44,0.235,0.115), ox*0.55);
  col = mezclaLin(col, vec3(0.36,0.355,0.350), grieta*0.55);

  c.altura = h;
  c.base   = col;
  c.rug    = mix(0.62, 0.90, salto) + grano*0.10 + ox*0.06 - macro*0.04;
  c.cav    = burb*0.4*(1.0-salto) + grieta*0.7 + salto*0.15;
  c.sucK   = 0.55 + salto*0.35;
  c.suc    = mezclaLin(vec3(0.145,0.140,0.132), vec3(0.28,0.14,0.06), ox);
  c.borde  = 0.70;
  return c;
}`;

export const asfalto = /* glsl */ `
Campo campo(vec2 uv){
  Campo c = nuevoCampo();
  float S = uEsc;  vec2 p = uv * S;

  float macro = macroVar(uv, 101.0);
  // aglomerado: piedras de varios calibres embebidas en betun
  Celular a1 = celular(p * 22.0, vec2(22.0*S), 1.0, 2.0);
  Celular a2 = celular(p * 44.0, vec2(44.0*S), 1.0, 6.0);
  Celular a3 = celular(p * 88.0, vec2(88.0*S), 1.0, 10.0);
  float d1 = sqrt(max(0.0,1.0-a1.f1*1.95)) * step(0.22, a1.id);
  float d2 = sqrt(max(0.0,1.0-a2.f1*2.05)) * step(0.36, a2.id);
  float d3 = sqrt(max(0.0,1.0-a3.f1*2.15)) * step(0.66, a3.id) * uMicro;
  float piedra = max(max(d1, d2*0.66), d3*0.38);

  float betun = fbm(p * 15.0, 15.0*S, 5, 0.5, 14.0);
  float grano = fbm(p * 80.0, 80.0*S, 3, 0.55, 18.0);
  float hueco = poros(p * 26.0, vec2(26.0*S), 0.34, 0.30, 22.0);  // huecos del arido

  // fisuras de fatiga
  Celular cr = celular(p * 4.5, vec2(4.5*S), 1.0, 26.0);
  float fis = (1.0 - smoothstep(0.0, 0.022, bordeCelda(cr)))
            * smoothstep(0.48, 0.80, fbm(p*2.0, 2.0*S, 3, 0.5, 31.0));

  float h = 0.42 + betun*0.10 + piedra*0.34 + grano*0.05 - hueco*0.30 - fis*0.25;

  // betun casi negro; algunos aridos claros (cuarcita) segun el id
  vec3 betunCol = vec3(0.075,0.074,0.078) * (0.65+0.80*betun);
  vec3 pi1 = mezclaLin(vec3(0.105,0.102,0.100), vec3(0.325,0.318,0.305), pow(fract(a1.id*4.7),3.2));
  vec3 pi2 = mezclaLin(vec3(0.092,0.092,0.094), vec3(0.255,0.250,0.244), pow(fract(a2.id*9.1),3.4));
  vec3 col = betunCol;
  col = mezclaLin(col, pi1, smoothstep(0.14,0.62,d1)*0.88);
  col = mezclaLin(col, pi2, smoothstep(0.14,0.62,d2)*0.60);
  col = mezclaLin(col, vec3(0.145,0.145,0.148), smoothstep(0.16,0.66,d3)*0.40);
  col *= (0.85+0.30*macro) * (0.92+0.16*grano);

  c.altura = h;
  c.base   = col;
  // el betun es mate; la piedra pulida por el trafico brilla algo mas
  c.rug    = 0.94 - piedra*0.30 + grano*0.06 - macro*0.06;
  c.cav    = hueco*0.9 + fis*0.7;
  c.sucK   = 0.45;
  c.suc    = vec3(0.045,0.044,0.046);
  c.borde  = 0.60;
  return c;
}`;

export const asfalto_mojado = /* glsl */ `
Campo campo(vec2 uv){
  Campo c = nuevoCampo();
  float S = uEsc;  vec2 p = uv * S;

  float macro = macroVar(uv, 103.0);
  Celular a1 = celular(p * 22.0, vec2(22.0*S), 1.0, 2.0);
  Celular a2 = celular(p * 44.0, vec2(44.0*S), 1.0, 6.0);
  Celular a3 = celular(p * 88.0, vec2(88.0*S), 1.0, 10.0);
  float d1 = sqrt(max(0.0,1.0-a1.f1*1.95)) * step(0.22, a1.id);
  float d2 = sqrt(max(0.0,1.0-a2.f1*2.05)) * step(0.36, a2.id);
  float d3 = sqrt(max(0.0,1.0-a3.f1*2.15)) * step(0.66, a3.id) * uMicro;
  float piedra = max(max(d1, d2*0.66), d3*0.38);

  float betun = fbm(p * 15.0, 15.0*S, 5, 0.5, 14.0);
  float grano = fbm(p * 80.0, 80.0*S, 3, 0.55, 18.0);
  float hueco = poros(p * 26.0, vec2(26.0*S), 0.34, 0.30, 22.0);
  Celular cr = celular(p * 4.5, vec2(4.5*S), 1.0, 26.0);
  float fis = (1.0 - smoothstep(0.0, 0.022, bordeCelda(cr)))
            * smoothstep(0.48, 0.80, fbm(p*2.0, 2.0*S, 3, 0.5, 31.0));

  // charcos: zonas bajas rellenas de agua -> el relieve se aplana ahi
  float charco = smoothstep(0.42, 0.62, fbm2(deformar(p*2.6, vec2(2.6*S), 0.35, 2, 41.0),
                                             vec2(2.6*S), 4, 0.55, 43.0));
  float hSeco = 0.42 + betun*0.10 + piedra*0.34 + grano*0.05 - hueco*0.30 - fis*0.25;
  float nivel = 0.52;
  float h = mix(hSeco, max(hSeco, nivel), charco * 0.85);

  vec3 betunCol = vec3(0.075,0.074,0.078) * (0.65+0.80*betun);
  vec3 pi1 = mezclaLin(vec3(0.105,0.102,0.100), vec3(0.325,0.318,0.305), pow(fract(a1.id*4.7),3.2));
  vec3 pi2 = mezclaLin(vec3(0.092,0.092,0.094), vec3(0.255,0.250,0.244), pow(fract(a2.id*9.1),3.4));
  vec3 col = betunCol;
  col = mezclaLin(col, pi1, smoothstep(0.14,0.62,d1)*0.88);
  col = mezclaLin(col, pi2, smoothstep(0.14,0.62,d2)*0.60);
  col *= (0.85+0.30*macro) * (0.92+0.16*grano);

  // el agua oscurece y satura ligeramente el sustrato
  float humedo = clamp(charco*0.9 + (1.0-smoothstep(0.40,0.72,hSeco))*0.45, 0.0, 1.0);
  col = mezclaLin(col, col*vec3(0.42,0.45,0.52), humedo);
  // pelicula de gasoil con iridiscencia en algunos charcos
  float iris = charco * smoothstep(0.55,0.85, fbm(p*6.0,6.0*S,4,0.55,57.0));
  vec3 arcoiris = 0.5 + 0.5*cos(vec3(0.0,2.1,4.2) + fbm(p*9.0,9.0*S,3,0.5,59.0)*12.0);
  col = mezclaLin(col, arcoiris*0.30, iris*0.35);

  c.altura = h;
  c.base   = col;
  // la lamina de agua es casi especular; el asfalto seco muy mate
  c.rug    = mix(0.93 - piedra*0.28 + grano*0.06, 0.055, charco*0.92);
  c.met    = 0.0;
  c.cav    = (hueco*0.9 + fis*0.7) * (1.0-charco*0.8);
  // la "suciedad" de este material es AGUA: se acumula en las cavidades y las alisa
  c.sucK   = 0.95;
  c.suc    = vec3(0.026,0.030,0.036);
  c.borde  = 0.30;
  return c;
}`;

export const ladrillo = /* glsl */ `
Campo campo(vec2 uv){
  Campo c = nuevoCampo();
  float S = uEsc;  vec2 p = uv * S;
  vec2 n = vec2(4.0*S, 12.0*S);     // 4 ladrillos de ancho, 12 hiladas

  vec2 cid;
  vec2 luv = aparejo(uv, n, 0.5, cid);
  float rnd  = h21(cid + sem(3.0));
  float rnd2 = h21(cid + sem(9.0));

  // junta de mortero: rehundida respecto a la testa del ladrillo
  float jx = min(luv.x, 1.0-luv.x);
  float jy = min(luv.y, 1.0-luv.y);
  float anchoJ = 0.085, anchoJy = 0.16;
  float mx = smoothstep(anchoJ*0.35, anchoJ, jx);
  float my = smoothstep(anchoJy*0.35, anchoJy, jy);
  float cara = min(mx, my);                       // 1 dentro del ladrillo
  float junta = 1.0 - cara;

  // textura del ladrillo: arcilla con poros, vetas de extrusion y desconchones
  vec2 lp = luv + cid * 3.17;
  float arc   = fbm(lp * 7.0, 7.0*S*4.0, 4, 0.55, 11.0 + rnd*30.0);
  float veta  = granoDir(lp*vec2(1.0,1.0)*9.0, 9.0*S*4.0, 4.0, 3, 0.5, 13.0+rnd*20.0);
  float poroL = poros(lp * 26.0, vec2(26.0*S*4.0), 0.30, 0.26, 17.0+rnd*10.0);
  float picad = poros(lp * 12.0, vec2(12.0*S*4.0), 0.14, 0.30, 23.0+rnd*10.0);

  // mortero: arena gruesa, mucho mas rugoso
  float mort = fbm(p * 60.0, 60.0*S, 4, 0.55, 29.0);
  float arena = aridoMulti(p * 80.0, vec2(80.0*S), 31.0) * uMicro;

  float hCara = 0.80 + arc*0.05 + veta*0.025 - poroL*0.30 - picad*0.22;
  float hJunta = 0.58 + mort*0.07 + (arena-0.5)*0.05;
  float h = mix(hJunta, hCara, cara);
  // canto redondeado del ladrillo
  h -= (1.0-smoothstep(0.0, 0.05, jx))*0.03*cara + (1.0-smoothstep(0.0,0.08,jy))*0.03*cara;

  // color: gama de rojos/marrones por ladrillo + variacion interna
  vec3 rojoA = vec3(0.385,0.150,0.105);
  vec3 rojoB = vec3(0.520,0.235,0.150);
  vec3 oscuro= vec3(0.215,0.115,0.095);
  vec3 tost  = vec3(0.470,0.320,0.215);
  vec3 lad = mezclaLin(rojoA, rojoB, rnd);
  lad = mezclaLin(lad, oscuro, smoothstep(0.72,1.0,rnd2)*0.8);
  lad = mezclaLin(lad, tost,   smoothstep(0.0,0.18,rnd2)*0.7);
  lad = mezclaLin(lad, lad*vec3(1.25,1.10,0.95), arc*0.55);
  lad *= 0.88 + 0.24*veta;
  lad = mezclaLin(lad, vec3(0.30,0.20,0.16), picad*0.6);
  // eflorescencias blancas
  float efl = smoothstep(0.62,0.88, fbm(p*5.0,5.0*S,4,0.55,37.0)) * (0.35+0.65*junta);
  vec3 mortCol = vec3(0.505,0.495,0.470)*(0.82+0.34*mort);
  vec3 col = mezclaLin(mortCol, lad, cara);
  col = mezclaLin(col, vec3(0.74,0.73,0.70), efl*0.45);

  c.altura = h;
  c.base   = col;
  c.rug    = mix(0.90, 0.72 + poroL*0.18 + arc*0.08, cara);
  c.cav    = poroL*0.8*cara + picad*0.6*cara + junta*0.30;
  // la suciedad se deposita en la junta rehundida: el paso B la correlaciona
  // con la oclusion, que ya es alta ahi.
  c.sucK   = 0.85;
  c.suc    = vec3(0.115,0.105,0.095);
  c.borde  = 0.55;
  return c;
}`;

export const yeso = /* glsl */ `
Campo campo(vec2 uv){
  Campo c = nuevoCampo();
  float S = uEsc;  vec2 p = uv * S;

  // pasadas de llana: ondas anchas deformadas, con direccion dominante
  vec2 w = deformar(p * 2.2, vec2(2.2*S), 0.55, 2, 5.0);
  float llana = fbm2(vec2(w.x*1.0, w.y*2.3), vec2(2.2*S, 2.2*S*2.3), 4, 0.55, 7.0);
  vec2 w2 = deformar(p * 5.0, vec2(5.0*S), 0.30, 2, 11.0);
  float llana2 = fbm2(w2, vec2(5.0*S), 3, 0.5, 13.0);

  // crestas del filo de la llana
  float filo = fbmCresta(p * 3.2, vec2(3.2*S), 3, 0.5, 17.0);
  float grano = fbm(p * 90.0, 90.0*S, 3, 0.55, 19.0) * uMicro;
  float medio = fbm(p * 26.0, 26.0*S, 4, 0.5, 23.0);

  // pinchazos de aire y pelos de fisura
  float pinch = max(poros(p * 60.0, vec2(60.0*S), 0.16, 0.20, 29.0),
                    poros(p * 96.0, vec2(96.0*S), 0.22, 0.22, 31.0)*0.5*uMicro);
  Celular cr = celular(p * 8.0, vec2(8.0*S), 1.0, 37.0);
  float pelo = (1.0 - smoothstep(0.0, 0.016, bordeCelda(cr)))
             * smoothstep(0.55, 0.88, fbm(p*3.0,3.0*S,3,0.5,41.0));

  float h = 0.72 + llana*0.10 + llana2*0.045 + filo*0.05 + medio*0.02 + grano*0.012
          - pinch*0.45 - pelo*0.22;

  vec3 base = vec3(0.735,0.728,0.705);
  vec3 col = base * (0.90+0.18*llana) * (0.95+0.10*medio);
  // parcheos de reparacion, algo mas blancos
  float parche = smoothstep(0.58,0.70, fbm(deformar(p*3.0,vec2(3.0*S),0.4,2,43.0)*1.0, 3.0*S, 4, 0.55, 47.0));
  col = mezclaLin(col, vec3(0.80,0.795,0.775), parche*0.55);
  col = mezclaLin(col, vec3(0.50,0.49,0.47), pinch*0.5);
  col = mezclaLin(col, vec3(0.44,0.435,0.42), pelo*0.55);
  col *= 0.96 + 0.08*grano;

  c.altura = h;
  c.base   = col;
  c.rug    = 0.84 + grano*0.10 - llana*0.06 + pinch*0.08 - parche*0.04;
  c.cav    = pinch*0.85 + pelo*0.6;
  c.sucK   = 0.55;
  c.suc    = vec3(0.235,0.225,0.208);
  c.borde  = 0.30;
  return c;
}`;

export const tierra = /* glsl */ `
Campo campo(vec2 uv){
  Campo c = nuevoCampo();
  float S = uEsc;  vec2 p = uv * S;

  float macro = macroVar(uv, 67.0);
  // terrones: grumos de varios tamaños
  float terr1 = fbmGrumo(p * 6.0,  vec2(6.0*S),  4, 0.55, 3.0);
  float terr2 = fbmGrumo(p * 18.0, vec2(18.0*S), 4, 0.55, 9.0);
  float terr3 = fbm(p * 55.0, 55.0*S, 3, 0.55, 13.0);
  float micro = fbm(p * 160.0, 160.0*S, 2, 0.5, 17.0) * uMicro;

  // chinas y gravilla dispersa
  Celular ch = celular(p * 40.0, vec2(40.0*S), 1.0, 21.0);
  float china = sqrt(max(0.0, 1.0-ch.f1*2.3)) * step(0.72, ch.id);
  Celular ch2 = celular(p * 19.0, vec2(19.0*S), 1.0, 25.0);
  float china2 = sqrt(max(0.0, 1.0-ch2.f1*2.4)) * step(0.85, ch2.id);

  // grietas de desecacion
  Celular cr = celular(p * 7.0, vec2(7.0*S), 1.0, 29.0);
  float grieta = (1.0 - smoothstep(0.0, 0.030, bordeCelda(cr)))
               * smoothstep(0.35, 0.70, fbm(p*3.0,3.0*S,3,0.5,33.0));

  // fibras vegetales / raicillas
  float fib = 1.0 - smoothstep(0.0, 0.020, aranazos(p*13.0, vec2(13.0*S), 0.30, 0.42, 39.0));

  float h = 0.44 + terr1*0.22 + terr2*0.12 + terr3*0.055 + micro*0.015
          + max(china, china2)*0.16 - grieta*0.26 + fib*0.02;

  vec3 marronOsc = vec3(0.145,0.098,0.062);
  vec3 marronMed = vec3(0.272,0.190,0.118);
  vec3 ocre      = vec3(0.400,0.290,0.160);
  vec3 col = mezclaLin(marronOsc, marronMed, terr1*0.7+terr2*0.3);
  col = mezclaLin(col, ocre, smoothstep(0.45,0.85,terr3)*0.45*(0.4+0.6*macro));
  col = mezclaLin(col, vec3(0.44,0.42,0.39), smoothstep(0.1,0.6,china)*0.85);
  col = mezclaLin(col, vec3(0.36,0.34,0.31), smoothstep(0.1,0.6,china2)*0.75);
  col = mezclaLin(col, vec3(0.085,0.058,0.036), grieta*0.75);
  col = mezclaLin(col, vec3(0.22,0.19,0.10), fib*0.35);
  col *= 0.88+0.24*macro;

  c.altura = h;
  c.base   = col;
  c.rug    = 0.93 - china*0.22 - china2*0.18 + terr3*0.05;
  c.cav    = grieta*0.8;
  c.sucK   = 0.60;
  c.suc    = vec3(0.070,0.048,0.030);
  c.borde  = 0.35;
  return c;
}`;

export const grava = /* glsl */ `
Campo campo(vec2 uv){
  Campo c = nuevoCampo();
  float S = uEsc;  vec2 p = uv * S;

  // capas de piedra de distintos calibres, apiladas
  Celular g1 = celular(p * 11.0, vec2(11.0*S), 1.0, 2.0);
  Celular g2 = celular(p * 20.0, vec2(20.0*S), 1.0, 7.0);
  Celular g3 = celular(p * 38.0, vec2(38.0*S), 1.0, 12.0);
  Celular g4 = celular(p * 72.0, vec2(72.0*S), 1.0, 19.0);

  // cada piedra es una cupula achatada, deformada por ruido para no ser esferica
  float def1 = fbm(p*26.0, 26.0*S, 3, 0.5, 23.0)*0.22;
  float r1 = clamp(1.0 - (g1.f1+def1*0.5)*1.95, 0.0, 1.0);
  float r2 = clamp(1.0 - (g2.f1+def1*0.4)*2.00, 0.0, 1.0);
  float r3 = clamp(1.0 - (g3.f1+def1*0.3)*2.10, 0.0, 1.0);
  float r4 = clamp(1.0 - (g4.f1+def1*0.25)*2.20, 0.0, 1.0);
  float c1 = pow(r1,0.55)*step(0.30,g1.id);
  float c2 = pow(r2,0.55)*step(0.28,g2.id);
  float c3 = pow(r3,0.55)*step(0.34,g3.id);
  float c4 = pow(r4,0.55)*step(0.48,g4.id)*uMicro;

  // finos oscuros del fondo (el relleno entre piedras)
  float finos = fbm(p*70.0, 70.0*S, 3, 0.55, 31.0);
  float h = 0.20 + finos*0.05;
  vec3 col = mezclaLin(vec3(0.150,0.140,0.128), vec3(0.245,0.232,0.212), finos);
  float rug = 0.95;

  // composicion "por encima": gana la piedra que quede mas alta.
  // alturas candidatas por calibre (las grandes sobresalen mas)
  vec4 cup = vec4(c1, c2, c3, c4);
  vec4 alt = vec4(0.44, 0.30, 0.20, 0.13) * cup;
  vec4 ids = vec4(g1.id, g2.id, g3.id, g4.id);
  for (int k = 0; k < 4; k++){
    float a = alt[k];
    if (cup[k] < 0.02) continue;
    float hc = 0.22 + a;
    if (hc <= h) continue;
    h = hc;
    vec3 tA, tB; float rp;
    if (k == 0){ tA = vec3(0.22,0.212,0.200); tB = vec3(0.58,0.55,0.49); rp = 0.68; }
    else if (k == 1){ tA = vec3(0.24,0.230,0.215); tB = vec3(0.54,0.51,0.46); rp = 0.72; }
    else if (k == 2){ tA = vec3(0.26,0.250,0.235); tB = vec3(0.50,0.48,0.44); rp = 0.76; }
    else { tA = vec3(0.30,0.285,0.265); tB = vec3(0.46,0.44,0.41); rp = 0.80; }
    col = mezclaLin(tA, tB, fract(ids[k]*6.13)) * (0.80 + 0.40*cup[k]);
    rug = rp;
  }

  // caras planas y microrrelieve de cada piedra
  float caras = fbm(p*95.0, 95.0*S, 3, 0.5, 41.0);
  float polvo = fbm(p*8.0, 8.0*S, 4, 0.55, 47.0);
  h += (caras-0.5)*0.016;
  col *= 0.90+0.20*caras;
  // polvo calizo que se pega a todo
  col = mezclaLin(col, vec3(0.52,0.50,0.46), smoothstep(0.45,0.85,polvo)*0.28);

  c.altura = h;
  c.base   = col;
  c.rug    = rug + caras*0.10 + polvo*0.05;
  c.cav    = 0.0;
  c.sucK   = 0.85;
  c.suc    = vec3(0.075,0.068,0.058);
  c.borde  = 0.45;
  return c;
}`;
