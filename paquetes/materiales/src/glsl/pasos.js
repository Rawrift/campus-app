// Plantillas de los dos pasos de generacion.
//
// PASO A  (campo)      : evalua la receta del material -> 3 destinos RGBA16F
//                        T0 = (altura, rugosidad, metalico, cavidad)
//                        T1 = (base.rgb, factorSuciedad)
//                        T2 = (colorSuciedad.rgb, factorBorde)
// PASO B  (composicion): deriva la NORMAL y la OCLUSION del mapa de altura, y aplica
//                        el desgaste dependiente de la forma:
//                          - suciedad/agua/oxido que se acumula en las CAVIDADES
//                          - pintura saltada y metal pulido en los CANTOS convexos
//                        Escribe los 6 mapas finales en MRT RGBA8.
// BLIT                 : copia un destino al canvas para transferToImageBitmap().

import { COMUN } from './comun.js';

export const VS_TRI = /* glsl */ `#version 300 es
out vec2 vUv;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  // v crece hacia ABAJO en la imagen: asi la fila 0 del bitmap es v = 0 y el
  // visor puede subir la textura sin voltear (UNPACK_FLIP_Y_WEBGL = false).
  vUv = vec2(p.x, 1.0 - p.y);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Fragment del paso A. `receta` debe definir `Campo campo(vec2 uv)`. */
export function fsPasoA (receta) {
  return `#version 300 es
precision highp float;
in vec2 vUv;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
layout(location = 2) out vec4 o2;

struct Campo {
  float altura;    // 0..1  relieve del material
  vec3  base;      // color base (sRGB de almacenamiento)
  float rug;       // rugosidad 0..1
  float met;       // metalico 0..1
  float cav;       // cavidad explicita extra (poros, juntas) 0..1
  float sucK;      // cuanta suciedad admite esta zona 0..1
  vec3  suc;       // color de la suciedad/oxido/agua en esta zona
  float borde;     // cuanto responde al desgaste por canto 0..1
};

Campo nuevoCampo(){
  Campo c;
  c.altura = 0.5; c.base = vec3(0.5); c.rug = 0.7; c.met = 0.0;
  c.cav = 0.0; c.sucK = 0.0; c.suc = vec3(0.12,0.10,0.09); c.borde = 0.0;
  return c;
}

${COMUN}

${receta}

void main(){
  Campo c = campo(vUv);
  o0 = vec4(clamp(c.altura,0.0,1.0), clamp(c.rug,0.0,1.0), clamp(c.met,0.0,1.0), clamp(c.cav,0.0,1.0));
  o1 = vec4(max(c.base, 0.0), clamp(c.sucK,0.0,1.0));
  o2 = vec4(max(c.suc, 0.0),  clamp(c.borde,0.0,1.0));
}`;
}

export const FS_PASO_B = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D T0, T1, T2;
uniform vec2  uTexel;      // 1 / resolucion
uniform float uRelieve;    // altura maxima en unidades de uv (pendiente de la normal)
uniform float uAoRadio;    // radio de muestreo de oclusion en uv
uniform float uAoFuerza;
uniform float uCurvGan;    // ganancia de curvatura para el desgaste de canto
uniform vec4  uSuc;        // (rugosidadObjetivo, fuerza, umbral, quitaMetal)
uniform vec4  uBorde;      // (rugosidadObjetivo, metalicoObjetivo, mezclaColor, ganancia)
uniform vec3  uBordeCol;   // color que asoma en el canto desgastado

layout(location = 0) out vec4 gAlbedo;
layout(location = 1) out vec4 gNormal;
layout(location = 2) out vec4 gRug;
layout(location = 3) out vec4 gMet;
layout(location = 4) out vec4 gOcl;
layout(location = 5) out vec4 gAlt;

// El paso A escribio el texel (x,y_fb) con el valor de vUv = (x/W, 1 - y_fb/H).
// Para leer el campo EN un vUv dado hay que invertir la componente v.
#define ST(uv) vec2((uv).x, 1.0 - (uv).y)
float H(vec2 uv){ return texture(T0, ST(uv)).r; }

float ruidoDither(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 19.19);
  return fract((p3.x + p3.y) * p3.z) - 0.5;
}

void main(){
  vec4 a = texture(T0, ST(vUv));   // altura, rug, met, cav
  vec4 b = texture(T1, ST(vUv));   // base.rgb, sucK
  vec4 c = texture(T2, ST(vUv));   // suc.rgb, borde
  float h = a.x;
  vec2  e = uTexel;

  // ---------------- NORMAL: Sobel sobre el mapa de altura (espacio tangente) ----
  // Sobel 3x3 da un gradiente menos ruidoso que la diferencia central de 2 muestras
  // y conserva el microdetalle de 1 texel.
  float h00 = H(vUv + vec2(-e.x,-e.y)), h10 = H(vUv + vec2(0.0,-e.y)), h20 = H(vUv + vec2(e.x,-e.y));
  float h01 = H(vUv + vec2(-e.x, 0.0)),                                h21 = H(vUv + vec2(e.x, 0.0));
  float h02 = H(vUv + vec2(-e.x, e.y)), h12 = H(vUv + vec2(0.0, e.y)), h22 = H(vUv + vec2(e.x, e.y));
  float gx = (h20 + 2.0*h21 + h22) - (h00 + 2.0*h01 + h02);
  float gy = (h02 + 2.0*h12 + h22) - (h00 + 2.0*h10 + h20);
  // gradiente en unidades de uv: Sobel acumula 8x el paso -> /(8*e)
  float dx = gx / (8.0 * e.x) * uRelieve;
  float dy = gy / (8.0 * e.y) * uRelieve;
  vec3 n = normalize(vec3(-dx, -dy, 1.0));

  // ---------------- CURVATURA: canto convexo (> 0) vs hueco (< 0) ---------------
  float r2 = 4.0;
  float w00 = H(vUv + vec2(-e.x*r2, 0.0)), w01 = H(vUv + vec2(e.x*r2, 0.0));
  float w10 = H(vUv + vec2(0.0, -e.y*r2)), w11 = H(vUv + vec2(0.0, e.y*r2));
  float lap = (4.0*h - (w00 + w01 + w10 + w11)) * 0.25;
  float convexo = clamp( lap * uCurvGan, 0.0, 1.0);
  float concavo = clamp(-lap * uCurvGan, 0.0, 1.0);

  // ---------------- OCLUSION: horizonte medio sobre el mapa de altura -----------
  // 14 muestras en espiral de angulo aureo: cada una aporta la pendiente hacia
  // el posible ocluyente. Es la oclusion REAL de la geometria del relieve.
  float ao = 0.0;
  for (int k = 0; k < 14; k++){
    float fk = float(k);
    float ang = fk * 2.39996323;
    float t = (fk + 0.5) / 14.0;
    float rad = pow(t, 0.65) * uAoRadio;
    vec2 d = vec2(cos(ang), sin(ang)) * rad;
    float hs = H(vUv + d);
    ao += clamp((hs - h) * uRelieve / max(rad, 1e-4), 0.0, 1.0);
  }
  ao /= 14.0;
  float oclusion = clamp(1.0 - ao * uAoFuerza, 0.0, 1.0);
  // la cavidad explicita del material (poros, juntas) oscurece tambien
  oclusion = clamp(oclusion * (1.0 - a.w * 0.85), 0.0, 1.0);

  // ---------------- DESGASTE DEPENDIENTE DE LA FORMA ---------------------------
  // 1) suciedad / agua / oxido: se acumula donde hay cavidad (oclusion baja o
  //    concavidad), NUNCA de forma independiente del relieve.
  float cavidad = max(max(1.0 - oclusion, a.w), concavo * 0.8);
  float suciedad = b.w * smoothstep(uSuc.z, min(uSuc.z + 0.55, 1.0), cavidad) * uSuc.y;
  suciedad = clamp(suciedad, 0.0, 1.0);

  vec3  albedo = mix(b.rgb, c.rgb, suciedad);
  float rug    = mix(a.y, uSuc.x, suciedad);
  float met    = a.z * (1.0 - suciedad * uSuc.w);

  // 2) canto: pintura saltada / metal pulido por roce donde la forma es convexa.
  float desgasteBorde = clamp(convexo * c.w * uBorde.w, 0.0, 1.0);
  albedo = mix(albedo, uBordeCol, desgasteBorde * uBorde.z);
  rug    = mix(rug, uBorde.x, desgasteBorde);
  met    = mix(met, uBorde.y, desgasteBorde * uBorde.z);

  float dth = ruidoDither(gl_FragCoord.xy) / 255.0;

  gAlbedo = vec4(clamp(albedo + dth, 0.0, 1.0), 1.0);
  gNormal = vec4(n * 0.5 + 0.5, 1.0);
  gRug    = vec4(vec3(clamp(rug + dth, 0.0, 1.0)), 1.0);
  gMet    = vec4(vec3(clamp(met, 0.0, 1.0)), 1.0);
  gOcl    = vec4(vec3(clamp(oclusion + dth, 0.0, 1.0)), 1.0);
  gAlt    = vec4(vec3(clamp(h + dth, 0.0, 1.0)), 1.0);
}`;

/** Paso A de calcomania: color RGBA + altura. */
export function fsCalcoA (receta) {
  return `#version 300 es
precision highp float;
in vec2 vUv;
layout(location = 0) out vec4 o0;   // color.rgb, alfa
layout(location = 1) out vec4 o1;   // altura, rugosidad, metalico, -

struct Calco { vec4 color; float altura; float rug; float met; };
Calco nuevaCalco(){ Calco c; c.color = vec4(0.0); c.altura = 0.5; c.rug = 0.8; c.met = 0.0; return c; }

${COMUN}

${receta}

void main(){
  Calco c = calco(vUv);
  o0 = vec4(clamp(c.color.rgb, 0.0, 1.0), clamp(c.color.a, 0.0, 1.0));
  o1 = vec4(clamp(c.altura,0.0,1.0), clamp(c.rug,0.0,1.0), clamp(c.met,0.0,1.0), 0.0);
}`;
}

export const FS_CALCO_B = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D T0, T1;
uniform vec2  uTexel;
uniform float uRelieve;
layout(location = 0) out vec4 gColor;
layout(location = 1) out vec4 gNormal;
layout(location = 2) out vec4 gArd;   // (oclusion, rugosidad, metalico) empaquetado

#define ST(uv) vec2((uv).x, 1.0 - (uv).y)
float H(vec2 uv){ return texture(T1, ST(uv)).r; }
void main(){
  vec4 col = texture(T0, ST(vUv));
  vec4 arm = texture(T1, ST(vUv));
  vec2 e = uTexel;
  float h00=H(vUv+vec2(-e.x,-e.y)), h10=H(vUv+vec2(0.0,-e.y)), h20=H(vUv+vec2(e.x,-e.y));
  float h01=H(vUv+vec2(-e.x,0.0)),                             h21=H(vUv+vec2(e.x,0.0));
  float h02=H(vUv+vec2(-e.x,e.y)), h12=H(vUv+vec2(0.0,e.y)),  h22=H(vUv+vec2(e.x,e.y));
  float gx=(h20+2.0*h21+h22)-(h00+2.0*h01+h02);
  float gy=(h02+2.0*h12+h22)-(h00+2.0*h10+h20);
  vec3 n = normalize(vec3(-gx/(8.0*e.x)*uRelieve, -gy/(8.0*e.y)*uRelieve, 1.0));
  float ao = 0.0;
  for (int k=0;k<10;k++){
    float fk=float(k); float ang=fk*2.39996323; float t=(fk+0.5)/10.0;
    float rad=pow(t,0.65)*(e.x*22.0);
    ao += clamp((H(vUv+vec2(cos(ang),sin(ang))*rad)-arm.x)*uRelieve/max(rad,1e-4),0.0,1.0);
  }
  float ocl = clamp(1.0 - (ao/10.0)*1.3, 0.0, 1.0);
  gColor  = col;
  gNormal = vec4(n*0.5+0.5, col.a);
  gArd    = vec4(ocl, arm.y, arm.z, col.a);
}`;

export const FS_BLIT = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D T;
out vec4 frag;
void main(){ frag = texelFetch(T, ivec2(gl_FragCoord.xy), 0); }`;
