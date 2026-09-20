// Calcomanias RGBA. No son teselables: el alfa cae a cero en el borde del cuadro.
// Cada receta define `Calco calco(vec2 uv)` -> color RGBA + altura + rugosidad + metalico.

const POLAR = /* glsl */ `
// radio 0..1 (1 = borde del cuadro) y angulo
float radio(vec2 uv){ return length(uv - 0.5) * 2.0; }
float angulo(vec2 uv){ vec2 d = uv - 0.5; return atan(d.y, d.x); }
// radio deformado: rompe la circunferencia perfecta
float radioRoto(vec2 uv, float amp, float frec, float s){
  vec2 d = uv - 0.5;
  float r = length(d) * 2.0;
  float n = fbm(uv * frec, frec, 4, 0.55, s);
  return r * (1.0 + (n - 0.5) * amp);
}
// margen: garantiza alfa 0 en el borde
float margen(vec2 uv){
  vec2 q = min(uv, 1.0 - uv);
  return smoothstep(0.0, 0.06, min(q.x, q.y));
}`;

export const impacto_bala_metal = /* glsl */ `
${POLAR}
Calco calco(vec2 uv){
  Calco c = nuevaCalco();
  float r  = radioRoto(uv, 0.22, 14.0, 3.0);
  float a  = angulo(uv);

  // --- crater: agujero pasante con el labio desgarrado hacia fuera
  float rp = r * (1.0 + 0.16*sin(a*7.0 + fbm(uv*9.0,9.0,3,0.5,5.0)*6.0)
                      + 0.10*sin(a*13.0 + 2.1));
  float agujero = 1.0 - smoothstep(0.10, 0.17, rp);
  float labio   = (1.0 - smoothstep(0.17, 0.30, rp)) - agujero;
  float petalo  = (1.0 - smoothstep(0.17, 0.40, rp)) * (0.5 + 0.5*sin(a*9.0 + 1.0));

  // --- metal deformado y estirado alrededor
  float deform = (1.0 - smoothstep(0.15, 0.55, rp))
               * (0.4 + 0.6*fbm(uv*16.0, 16.0, 4, 0.55, 7.0));

  // --- arañazos radiales del fragmento
  float ray = 0.0;
  for (int k = 0; k < 5; k++){
    float fk = float(k);
    float ang = h21(vec2(fk, 1.0) + sem(11.0)) * TAU;
    float largo = 0.25 + 0.35*h21(vec2(fk, 3.0) + sem(13.0));
    float da = abs(mod(a - ang + PI, TAU) - PI);
    float linea = 1.0 - smoothstep(0.0, 0.035 + rp*0.10, da);
    ray = max(ray, linea * (1.0 - smoothstep(0.14, largo, rp)));
  }

  // --- hollin del disparo
  float hollin = (1.0 - smoothstep(0.16, 0.62, rp))
               * (0.35 + 0.65*fbm(uv*7.0, 7.0, 4, 0.55, 17.0));
  float salpica = (1.0 - smoothstep(0.2, 0.9, rp))
                * smoothstep(0.70, 0.92, fbm(uv*22.0, 22.0, 3, 0.55, 19.0));

  float grano = fbm(uv * 60.0, 60.0, 3, 0.55, 23.0);

  vec3 metalVivo = vec3(0.845,0.850,0.860) * (0.80 + 0.40*grano);
  vec3 metalOsc  = vec3(0.320,0.320,0.330);
  vec3 negro     = vec3(0.020,0.020,0.022);
  vec3 sootCol   = vec3(0.085,0.080,0.078);

  vec3 col = metalVivo;
  col = mezclaLin(col, metalOsc, (1.0 - petalo) * 0.45);
  col = mezclaLin(col, sootCol, hollin*0.80);
  col = mezclaLin(col, metalVivo*1.05, ray*0.65);
  col = mezclaLin(col, negro, agujero);

  float alfa = clamp(agujero + labio*1.0 + petalo*0.9 + deform*0.55
                   + ray*0.55 + hollin*0.75 + salpica*0.5, 0.0, 1.0);
  alfa *= margen(uv);

  c.color  = vec4(col, alfa);
  c.altura = 0.62 + labio*0.30 + petalo*0.18 + deform*0.06 - agujero*0.60 - ray*0.06;
  c.rug    = clamp(0.22 + hollin*0.65 + (1.0-petalo)*0.18 - ray*0.10, 0.05, 1.0);
  c.met    = clamp(1.0 - hollin*0.85 - agujero, 0.0, 1.0);
  return c;
}`;

export const impacto_bala_hormigon = /* glsl */ `
${POLAR}
Calco calco(vec2 uv){
  Calco c = nuevaCalco();
  float r = radioRoto(uv, 0.30, 11.0, 3.0);
  float a = angulo(uv);

  // --- crater conico con el arido a la vista
  float rp = r * (1.0 + 0.20*sin(a*5.0 + fbm(uv*7.0,7.0,3,0.5,5.0)*7.0)
                      + 0.12*sin(a*11.0 + 0.7));
  float fondo   = 1.0 - smoothstep(0.06, 0.15, rp);
  float crater  = 1.0 - smoothstep(0.12, 0.26, rp);
  float descon  = 1.0 - smoothstep(0.22, 0.42, rp);   // desconchon exterior

  // arido expuesto dentro del crater
  Celular ag = celular(uv * 34.0, vec2(34.0), 1.0, 7.0);
  float arido = sqrt(max(0.0, 1.0 - ag.f1*2.1)) * step(0.35, ag.id);
  float grano = fbm(uv * 70.0, 70.0, 3, 0.55, 11.0);
  float polvo = fbm(uv * 13.0, 13.0, 4, 0.55, 13.0);

  // --- grietas radiales
  float gr = 0.0;
  for (int k = 0; k < 7; k++){
    float fk = float(k);
    float ang = h21(vec2(fk, 1.0) + sem(17.0)) * TAU;
    float largo = 0.30 + 0.50*h21(vec2(fk, 3.0) + sem(19.0));
    float serp = fbm(uv*10.0, 10.0, 3, 0.5, 23.0 + fk) - 0.5;
    float da = abs(mod(a - ang + serp*0.55 + PI, TAU) - PI);
    float linea = 1.0 - smoothstep(0.0, 0.012 + rp*0.030, da);
    gr = max(gr, linea * (1.0 - smoothstep(0.18, largo, rp)));
  }

  // --- nube de polvo blanco proyectada
  float nube = (1.0 - smoothstep(0.25, 0.95, rp))
             * smoothstep(0.35, 0.80, polvo) * 0.7;
  float salpica = (1.0 - smoothstep(0.3, 1.0, rp))
                * smoothstep(0.72, 0.93, fbm(uv*26.0, 26.0, 3, 0.55, 29.0));

  vec3 claro  = vec3(0.735,0.730,0.712) * (0.86 + 0.28*grano);
  vec3 medio  = vec3(0.520,0.515,0.500);
  vec3 oscuro = vec3(0.150,0.148,0.145);
  vec3 aridoC = mezclaLin(vec3(0.45,0.43,0.40), vec3(0.66,0.63,0.57), fract(ag.id*6.1));

  vec3 col = claro;
  col = mezclaLin(col, aridoC, crater * smoothstep(0.1,0.6,arido) * 0.8);
  col = mezclaLin(col, medio, crater*0.35);
  col = mezclaLin(col, oscuro, fondo*0.85);
  col = mezclaLin(col, oscuro, gr*0.70);
  col = mezclaLin(col, vec3(0.80,0.795,0.78), nube*0.75 + salpica*0.6);

  float alfa = clamp(crater + descon*0.85 + gr*0.85 + nube*0.65 + salpica*0.55, 0.0, 1.0);
  alfa *= margen(uv);

  c.color  = vec4(col, alfa);
  c.altura = 0.66 - fondo*0.55 - crater*0.22 - descon*0.06 - gr*0.30
           + arido*crater*0.10 + nube*0.02;
  c.rug    = clamp(0.80 + crater*0.10 + nube*0.08 - arido*crater*0.15, 0.4, 1.0);
  c.met    = 0.0;
  return c;
}`;

export const quemadura = /* glsl */ `
${POLAR}
Calco calco(vec2 uv){
  Calco c = nuevaCalco();
  // frente de combustion irregular: dominio deformado, nada de circunferencias
  vec2 w = deformar(uv * 3.0, vec2(3.0), 0.55, 2, 3.0);
  float n = fbm2(w, vec2(3.0), 5, 0.55, 5.0);
  float r = radio(uv) * (1.0 + (n - 0.5) * 0.70);

  float nucleo  = 1.0 - smoothstep(0.18, 0.46, r);   // carbon
  float chamusc = 1.0 - smoothstep(0.38, 0.72, r);   // tostado
  float aureola = 1.0 - smoothstep(0.60, 0.92, r);   // amarilleo

  float burbuja = fbmGrumo(uv * 26.0, vec2(26.0), 4, 0.55, 11.0);
  float ceniza  = fbm(uv * 48.0, 48.0, 3, 0.55, 13.0);
  float cuarteo = 1.0 - smoothstep(0.0, 0.020,
                    bordeCelda(celular(uv * 30.0, vec2(30.0), 1.0, 17.0)));
  cuarteo *= nucleo;

  vec3 carbon = vec3(0.028,0.026,0.026) * (0.6 + 0.8*ceniza);
  vec3 tostado= vec3(0.215,0.115,0.055);
  vec3 ambar  = vec3(0.420,0.275,0.135);

  vec3 col = ambar;
  col = mezclaLin(col, tostado, chamusc*0.85);
  col = mezclaLin(col, carbon, nucleo*0.92);
  col = mezclaLin(col, vec3(0.135,0.125,0.120), cuarteo*0.55);   // grietas con brasa apagada
  col = mezclaLin(col, vec3(0.50,0.48,0.46), (1.0-cuarteo)*nucleo*smoothstep(0.7,1.0,ceniza)*0.30);

  float alfa = clamp(nucleo*1.0 + chamusc*0.85 + aureola*0.45, 0.0, 1.0);
  alfa *= 0.55 + 0.45*fbm(uv*9.0, 9.0, 4, 0.55, 19.0);
  alfa = clamp(alfa*1.3, 0.0, 1.0) * margen(uv);

  c.color  = vec4(col, alfa);
  c.altura = 0.55 + burbuja*0.10*nucleo - cuarteo*0.18 - nucleo*0.05;
  c.rug    = clamp(0.92 - chamusc*0.10 + nucleo*0.05, 0.5, 1.0);
  c.met    = 0.0;
  return c;
}`;

export const grieta = /* glsl */ `
${POLAR}
Calco calco(vec2 uv){
  Calco c = nuevaCalco();
  // red de fracturas: bordes de Voronoi a dos escalas, afinados con crestas
  Celular c1 = celular(deformar(uv*5.0, vec2(5.0), 0.30, 2, 3.0), vec2(5.0), 1.0, 5.0);
  Celular c2 = celular(deformar(uv*11.0, vec2(11.0), 0.25, 2, 7.0), vec2(11.0), 1.0, 11.0);
  Celular c3 = celular(uv*23.0, vec2(23.0), 1.0, 13.0);

  float g1 = 1.0 - smoothstep(0.004, 0.028, bordeCelda(c1));
  float g2 = 1.0 - smoothstep(0.004, 0.026, bordeCelda(c2));
  float g3 = 1.0 - smoothstep(0.003, 0.020, bordeCelda(c3));

  // la grieta principal domina; las secundarias solo cerca de ella
  float principal = g1;
  float red = clamp(principal + g2*0.65*principal + g2*0.25 + g3*0.30*g2, 0.0, 1.0);

  // concentrada en el centro del cuadro y desvanecida hacia fuera
  float r = radioRoto(uv, 0.35, 6.0, 17.0);
  float cae = 1.0 - smoothstep(0.25, 0.95, r);
  red *= cae;
  // interrupciones: la grieta no es continua
  red *= smoothstep(0.30, 0.62, fbm(uv*7.0, 7.0, 4, 0.55, 19.0));

  float ancho = red;
  float nucleoG = smoothstep(0.45, 0.85, red);
  float polvo = fbm(uv*40.0, 40.0, 3, 0.55, 23.0);

  vec3 fondoG = vec3(0.045,0.043,0.042);
  vec3 bordeG = vec3(0.330,0.322,0.308) * (0.85+0.3*polvo);
  vec3 col = mezclaLin(bordeG, fondoG, nucleoG);

  float alfa = clamp(ancho*1.25, 0.0, 1.0) * margen(uv);

  c.color  = vec4(col, alfa);
  c.altura = 0.70 - nucleoG*0.55 - ancho*0.12;
  c.rug    = clamp(0.85 + nucleoG*0.10, 0.4, 1.0);
  c.met    = 0.0;
  return c;
}`;

export const mancha_aceite = /* glsl */ `
${POLAR}
Calco calco(vec2 uv){
  Calco c = nuevaCalco();
  // charco: contorno muy irregular por la tension superficial y el sustrato
  vec2 w = deformar(uv * 2.6, vec2(2.6), 0.60, 2, 3.0);
  float n = fbm2(w, vec2(2.6), 5, 0.58, 5.0);
  float r = radio(uv) * (1.0 + (n - 0.5) * 0.85);

  float charco = 1.0 - smoothstep(0.42, 0.62, r);
  float pelicula = 1.0 - smoothstep(0.58, 0.88, r);   // pelicula fina exterior
  float menisco = (1.0 - smoothstep(0.42, 0.52, r)) - (1.0 - smoothstep(0.36,0.46,r));

  // gotas satelite
  float gotas = poros(uv * 16.0, vec2(16.0), 0.16, 0.22, 11.0)
              * (1.0 - smoothstep(0.35, 1.0, radio(uv)));

  float espesor = charco*0.7 + pelicula*0.3 + gotas*0.6;
  float irid = fbm(uv * 11.0, 11.0, 4, 0.55, 13.0);
  // interferencia en pelicula fina: solo donde la capa es delgada
  vec3 arco = 0.5 + 0.5*cos(vec3(0.0, 2.09, 4.19) + irid*15.0 + r*9.0);
  float zonaIrid = pelicula * (1.0 - charco*0.75);

  vec3 aceite = vec3(0.030,0.027,0.022);
  vec3 col = aceite * (0.7 + 0.6*fbm(uv*30.0, 30.0, 3, 0.55, 17.0));
  col = mezclaLin(col, arco*0.30, zonaIrid*0.55);
  col = mezclaLin(col, vec3(0.055,0.048,0.038), menisco*0.6);

  float alfa = clamp(charco*1.0 + pelicula*0.70 + gotas*0.9, 0.0, 1.0);
  alfa *= margen(uv);

  c.color  = vec4(col, alfa);
  c.altura = 0.52 + espesor*0.10 + menisco*0.06;
  // el aceite es casi especular: es lo que lo delata
  c.rug    = clamp(0.10 + (1.0-espesor)*0.28 + irid*0.05, 0.04, 1.0);
  c.met    = 0.0;
  return c;
}`;

export const salpicadura_agua = /* glsl */ `
${POLAR}
Calco calco(vec2 uv){
  Calco c = nuevaCalco();
  // impacto: corona central + corona de gotas proyectadas
  vec2 w = deformar(uv*3.4, vec2(3.4), 0.45, 2, 3.0);
  float n = fbm2(w, vec2(3.4), 4, 0.55, 5.0);
  float r = radio(uv) * (1.0 + (n-0.5)*0.55);

  float centro = 1.0 - smoothstep(0.16, 0.34, r);
  float anillo = (1.0 - smoothstep(0.30, 0.42, r)) - (1.0 - smoothstep(0.24, 0.36, r));
  anillo = max(anillo, 0.0);

  // gotas: celulas con radio aleatorio, mas densas cerca del centro
  Celular g1 = celular(uv * 13.0, vec2(13.0), 1.0, 11.0);
  float rad1 = 0.10 + 0.30*fract(g1.id*5.3);
  float got1 = (1.0 - smoothstep(rad1*0.75, rad1, g1.f1)) * step(0.30, g1.id);
  Celular g2 = celular(uv * 27.0, vec2(27.0), 1.0, 13.0);
  float rad2 = 0.08 + 0.22*fract(g2.id*7.1);
  float got2 = (1.0 - smoothstep(rad2*0.75, rad2, g2.f1)) * step(0.52, g2.id);
  float densidad = 1.0 - smoothstep(0.10, 0.95, radio(uv));
  float gotas = clamp(got1 + got2*0.8, 0.0, 1.0) * densidad;

  // borde de la gota: menisco mas brillante
  float menisco1 = (1.0 - smoothstep(rad1, rad1*1.12, g1.f1)) - got1;

  float agua = clamp(centro*0.9 + anillo*0.8 + gotas*1.0, 0.0, 1.0);
  float mojado = clamp(agua + (1.0 - smoothstep(0.2,0.85,r))*0.35, 0.0, 1.0);

  // el agua oscurece el sustrato (lo satura) y lo alisa
  vec3 col = vec3(0.030,0.034,0.040);
  col = mezclaLin(col, vec3(0.055,0.062,0.072), (1.0-agua)*0.5);

  float alfa = clamp(mojado*0.92, 0.0, 1.0) * margen(uv);

  c.color  = vec4(col, alfa);
  c.altura = 0.50 + centro*0.10 + anillo*0.08 + gotas*0.16 + max(menisco1,0.0)*0.05;
  c.rug    = clamp(0.06 + (1.0-mojado)*0.35, 0.03, 1.0);
  c.met    = 0.0;
  return c;
}`;

export const hollin = /* glsl */ `
${POLAR}
Calco calco(vec2 uv){
  Calco c = nuevaCalco();
  // pluma de hollin: se estira hacia arriba, como si la fuente estuviera abajo
  vec2 q = vec2(uv.x - 0.5, (uv.y - 0.68) * 0.55);
  vec2 w = deformar((uv + vec2(0.0, 0.0)) * 3.0, vec2(3.0), 0.55, 2, 3.0);
  float n = fbm2(w, vec2(3.0), 5, 0.55, 5.0);
  float r = length(q) * 2.0 * (1.0 + (n - 0.5) * 0.80);

  float nucleo = 1.0 - smoothstep(0.10, 0.40, r);
  float pluma  = 1.0 - smoothstep(0.30, 0.85, r);
  // volutas: estructura interna de la deposicion
  float voluta = fbmGrumo(deformar(uv*6.0, vec2(6.0), 0.40, 2, 11.0), vec2(6.0), 4, 0.55, 13.0);
  float mota   = fbm(uv*34.0, 34.0, 3, 0.55, 17.0);
  float grumo  = smoothstep(0.62, 0.90, fbm(uv*15.0, 15.0, 4, 0.55, 19.0));

  vec3 negro = vec3(0.022,0.021,0.021);
  vec3 gris  = vec3(0.105,0.100,0.098);
  vec3 col = mezclaLin(gris, negro, nucleo*0.85 + voluta*0.25);
  col = mezclaLin(col, vec3(0.16,0.15,0.15), grumo*0.30);

  float alfa = clamp(nucleo*0.95 + pluma*0.55, 0.0, 1.0);
  alfa *= 0.45 + 0.55*voluta;
  alfa *= 0.75 + 0.25*mota;
  alfa = clamp(alfa*1.35, 0.0, 1.0) * margen(uv);

  c.color  = vec4(col, alfa);
  c.altura = 0.52 + grumo*0.05;
  c.rug    = clamp(0.95 - grumo*0.08, 0.6, 1.0);
  c.met    = 0.0;
  return c;
}`;
