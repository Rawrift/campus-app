// Biblioteca GLSL comun: hashes deterministas, ruido teselable multiescala,
// celular/Worley, grano direccional, arañazos, poros y helpers de aparejo.
//
// REGLA DE TESELADO: toda funcion de ruido recibe su PERIODO en celdas de reticula.
// Si el periodo es entero y la frecuencia se duplica junto con el, el campo resultante
// es exactamente periodico en uv -> teselable en los cuatro bordes sin costura.

export const COMUN = /* glsl */ `
const float PI  = 3.14159265358979;
const float TAU = 6.28318530717959;

uniform vec2  uSem;   // desplazamiento de semilla (no entero)
uniform float uEsc;   // repeticiones del patron dentro del tile (entero >= 1)
uniform float uMicro; // 1.0 a resolucion plena; baja el detalle mas fino a 512 y menos
                      // (evita que la ultima octava caiga por debajo de Nyquist)

// ---------------------------------------------------------------- hashes
float h21(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 h22(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
vec3 h23(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}
vec2 sem(float s){ return uSem + vec2(s * 11.713, s * 7.317); }

// ------------------------------------------------- ruido de valor teselable
// per: periodo por eje, en celdas. Debe ser entero para teselar.
float rv2(vec2 p, vec2 per, float s){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);   // quintica: C2
  vec2 o = sem(s);
  float a = h21(mod(i,                 per) + o);
  float b = h21(mod(i + vec2(1.0,0.0), per) + o);
  float c = h21(mod(i + vec2(0.0,1.0), per) + o);
  float d = h21(mod(i + vec2(1.0,1.0), per) + o);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float rv(vec2 p, float per, float s){ return rv2(p, vec2(per), s); }

// ------------------------------------------------------------------- fBm
// Ruido fractal. lacunaridad fija a 2 (obligatorio para conservar el teselado).
float fbm2(vec2 p, vec2 per, int oct, float gan, float s){
  float a = 0.5, sum = 0.0, nrm = 0.0;
  for (int i = 0; i < 10; i++){
    if (i >= oct) break;
    sum += a * rv2(p, per, s + float(i) * 13.37);
    nrm += a;  p *= 2.0;  per *= 2.0;  a *= gan;
  }
  return sum / nrm;
}
float fbm(vec2 p, float per, int oct, float gan, float s){ return fbm2(p, vec2(per), oct, gan, s); }

// fBm con crestas: vetas, grietas, fibras. Devuelve 0..1 con maximos afilados.
float fbmCresta(vec2 p, vec2 per, int oct, float gan, float s){
  float a = 0.5, sum = 0.0, nrm = 0.0;
  for (int i = 0; i < 10; i++){
    if (i >= oct) break;
    float n = rv2(p, per, s + float(i) * 13.37);
    n = 1.0 - abs(n * 2.0 - 1.0);  n *= n;
    sum += a * n;  nrm += a;  p *= 2.0;  per *= 2.0;  a *= gan;
  }
  return sum / nrm;
}

// fBm "billow": nubes/grumos redondeados.
float fbmGrumo(vec2 p, vec2 per, int oct, float gan, float s){
  float a = 0.5, sum = 0.0, nrm = 0.0;
  for (int i = 0; i < 10; i++){
    if (i >= oct) break;
    sum += a * abs(rv2(p, per, s + float(i) * 13.37) * 2.0 - 1.0);
    nrm += a;  p *= 2.0;  per *= 2.0;  a *= gan;
  }
  return sum / nrm;
}

// Deformacion del dominio (domain warp) teselable: desplaza p con dos campos de ruido.
vec2 deformar(vec2 p, vec2 per, float amp, int oct, float s){
  float wx = rv2(p, per, s)        * 2.0 - 1.0;
  float wy = rv2(p, per, s + 91.3) * 2.0 - 1.0;
  if (oct > 1){
    wx += 0.5 * (rv2(p*2.0, per*2.0, s + 5.1)  * 2.0 - 1.0);
    wy += 0.5 * (rv2(p*2.0, per*2.0, s + 77.7) * 2.0 - 1.0);
  }
  return p + vec2(wx, wy) * amp;
}

// -------------------------------------------------------------- celular
// f1 = distancia al punto mas cercano, f2 = al segundo, id = aleatorio por celda,
// d1 = vector al punto mas cercano (para cupulas / guijarros), cc = celda ganadora.
struct Celular { float f1; float f2; float id; vec2 d1; vec2 cc; };
Celular celular(vec2 p, vec2 per, float jit, float s){
  vec2 i = floor(p), f = fract(p);
  Celular r;  r.f1 = 8.0;  r.f2 = 8.0;  r.id = 0.0;  r.d1 = vec2(0.0);  r.cc = vec2(0.0);
  for (int y = -1; y <= 1; y++){
    for (int x = -1; x <= 1; x++){
      vec2 g = vec2(float(x), float(y));
      vec2 c = mod(i + g, per);
      vec2 o = h22(c + sem(s));
      vec2 d = g + 0.5 + (o - 0.5) * jit - f;
      float dd = dot(d, d);
      if (dd < r.f1){
        r.f2 = r.f1;  r.f1 = dd;  r.d1 = d;  r.cc = c;
        r.id = h21(c + sem(s + 5.17));
      } else if (dd < r.f2) r.f2 = dd;
    }
  }
  r.f1 = sqrt(r.f1);  r.f2 = sqrt(r.f2);
  return r;
}
// Bordes de celda (juntas, mortero, escamas de oxido): 0 en el borde, 1 en el centro.
float bordeCelda(Celular c){ return c.f2 - c.f1; }

// Celular multiescala: agregado de arido con varios tamaños de grano.
float aridoMulti(vec2 p, vec2 per, float s){
  Celular a = celular(p,        per,        1.0, s);
  Celular b = celular(p * 2.0,  per * 2.0,  1.0, s + 31.0);
  Celular c = celular(p * 4.0,  per * 4.0,  1.0, s + 67.0);
  return (1.0 - a.f1) * 0.55 + (1.0 - b.f1) * 0.3 + (1.0 - c.f1) * 0.15;
}

// -------------------------------------------------------- grano direccional
// Estira el dominio: aniso >> 1 alarga el ruido en X (cepillado, fibra, hilado).
float granoDir(vec2 p, float per, float aniso, int oct, float gan, float s){
  return fbm2(vec2(p.x * aniso, p.y), vec2(per * aniso, per), oct, gan, s);
}

// --------------------------------------------------------------- arañazos
// Segmentos aleatorios por celda. Devuelve la DISTANCIA minima al arañazo
// (pequeña = encima del arañazo). largo <= 0.5 para no salirse del vecindario 3x3.
float aranazos(vec2 p, vec2 per, float dens, float largo, float s){
  vec2 i = floor(p), f = fract(p);
  float d = 1e9;
  for (int y = -1; y <= 1; y++){
    for (int x = -1; x <= 1; x++){
      vec2 g = vec2(float(x), float(y));
      vec2 c = mod(i + g, per);
      vec3 hh = h23(c + sem(s));
      if (hh.z > dens) continue;
      float ang = hh.x * TAU;
      vec2 ctr = g + vec2(hh.y, h21(c + sem(s + 3.9)));
      vec2 dir = vec2(cos(ang), sin(ang)) * largo * (0.35 + 0.65 * hh.z / max(dens, 1e-4));
      vec2 a = ctr - dir, b = ctr + dir;
      vec2 pa = f - a, ba = b - a;
      float t = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
      d = min(d, length(pa - ba * t));
    }
  }
  return d;
}
// Arañazos con direccion preferente (cepillado circular, roce de puerta...).
float aranazosDir(vec2 p, vec2 per, float dens, float largo, float angFijo, float disp, float s){
  vec2 i = floor(p), f = fract(p);
  float d = 1e9;
  for (int y = -1; y <= 1; y++){
    for (int x = -1; x <= 1; x++){
      vec2 g = vec2(float(x), float(y));
      vec2 c = mod(i + g, per);
      vec3 hh = h23(c + sem(s));
      if (hh.z > dens) continue;
      float ang = angFijo + (hh.x - 0.5) * disp;
      vec2 ctr = g + vec2(hh.y, h21(c + sem(s + 3.9)));
      vec2 dir = vec2(cos(ang), sin(ang)) * largo * (0.35 + 0.65 * hh.z / max(dens, 1e-4));
      vec2 a = ctr - dir, b = ctr + dir;
      vec2 pa = f - a, ba = b - a;
      float t = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
      d = min(d, length(pa - ba * t));
    }
  }
  return d;
}

// ----------------------------------------------------------------- poros
// Picaduras/burbujas: cavidades esfericas dispersas. Devuelve profundidad 0..1.
float poros(vec2 p, vec2 per, float dens, float radio, float s){
  vec2 i = floor(p), f = fract(p);
  float prof = 0.0;
  for (int y = -1; y <= 1; y++){
    for (int x = -1; x <= 1; x++){
      vec2 g = vec2(float(x), float(y));
      vec2 c = mod(i + g, per);
      vec3 hh = h23(c + sem(s));
      if (hh.z > dens) continue;
      vec2 ctr = g + hh.xy;
      float r = radio * (0.35 + 0.65 * h21(c + sem(s + 8.3)));
      float dd = length(f - ctr) / max(r, 1e-4);
      prof = max(prof, 1.0 - smoothstep(0.55, 1.0, dd));
    }
  }
  return prof;
}

// ------------------------------------------------------------ manchas/goteo
// Regueros verticales (oxido, suciedad de lluvia). Coordenada de caida = uv.y.
float reguero(vec2 uv, float n, float largoMin, float largoMax, float s){
  float col = floor(uv.x * n);
  vec3 hh = h23(vec2(mod(col, n), 0.0) + sem(s));
  if (hh.z > 0.55) return 0.0;
  float ini  = hh.x;
  float largo = mix(largoMin, largoMax, hh.y);
  float t = fract(uv.y - ini);                       // teselable en Y
  // arranque corto (la fuente del reguero) + desvanecido largo hacia abajo
  float cuerpo = smoothstep(0.0, 0.012, t) * (1.0 - smoothstep(largo * 0.15, largo, t));
  float ancho = abs(fract(uv.x * n) - 0.5) * 2.0;
  float perfil = 1.0 - smoothstep(0.25, 1.0, ancho);
  float rot = 0.7 + 0.3 * fbm2(vec2(uv.x * n * 3.0, uv.y * 24.0), vec2(n * 3.0, 24.0), 3, 0.5, s + 4.4);
  return cuerpo * perfil * rot;
}

// ------------------------------------------------------------ aparejos
// Ladrillo / bloque. n = (columnas, filas), ambos enteros; filas PAR si desfase != 0.
vec2 aparejo(vec2 uv, vec2 n, float desfase, out vec2 cid){
  float fil = floor(uv.y * n.y);
  float ox  = mod(fil, 2.0) * desfase;
  float x   = uv.x * n.x + ox;
  cid = vec2(mod(floor(x), n.x), mod(fil, n.y));
  return vec2(fract(x), fract(uv.y * n.y));
}
// Tablas apiladas en Y, cada una corrida a lo largo de X, con testas desplazadas.
// Devuelve uv local y el id de tabla.
vec2 tablas(vec2 uv, float nFilas, float nTestas, float s, out vec2 tid){
  float fil = floor(uv.y * nFilas);
  float off = h21(vec2(mod(fil, nFilas), 3.0) + sem(s));
  float x = uv.x * nTestas + off * nTestas;
  tid = vec2(mod(floor(x), nTestas), mod(fil, nFilas));
  return vec2(fract(x), fract(uv.y * nFilas));
}

// ----------------------------------------------------------------- utiles
float suave(float a, float b, float x){ return smoothstep(a, b, x); }
float rango(float x, float a, float b){ return clamp((x - a) / max(b - a, 1e-5), 0.0, 1.0); }
float contraste(float x, float k){ return clamp((x - 0.5) * k + 0.5, 0.0, 1.0); }
vec3  tintar(vec3 c, vec3 t, float k){ return mix(c, c * t, k); }
// Mezcla perceptual de dos colores en un espacio aproximadamente lineal.
vec3 mezclaLin(vec3 a, vec3 b, float t){
  return sqrt(mix(a * a, b * b, clamp(t, 0.0, 1.0)));
}
// Variacion de tono a muy baja frecuencia: rompe la repeticion a distancia.
float macroVar(vec2 uv, float s){
  return fbm(uv * 2.0, 2.0, 4, 0.55, s) * 0.65 + fbm(uv * 1.0, 1.0, 2, 0.5, s + 61.0) * 0.35;
}
`;
