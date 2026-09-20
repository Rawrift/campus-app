// Motor de generacion: contexto WebGL2 fuera de pantalla, cache de programas y
// reutilizacion de buffers. No depende de ningun motor 3D.

import { VS_TRI, FS_PASO_B, FS_BLIT, FS_CALCO_B, fsPasoA, fsCalcoA } from './glsl/pasos.js';

const ATT = (gl, i) => gl.COLOR_ATTACHMENT0 + i;

function compilar (gl, tipo, fuente, etiqueta) {
  const s = gl.createShader(tipo);
  gl.shaderSource(s, fuente);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s) || '';
    const lineas = fuente.split('\n');
    const ctx = (log.match(/\d+:(\d+)/) || [])[1];
    const cerca = ctx ? lineas.slice(Math.max(0, ctx - 4), +ctx + 3)
      .map((l, k) => `${Math.max(1, ctx - 3) + k}| ${l}`).join('\n') : '';
    gl.deleteShader(s);
    throw new Error(`[materiales] fallo al compilar "${etiqueta}":\n${log}\n${cerca}`);
  }
  return s;
}

function enlazar (gl, vs, fs, etiqueta) {
  const p = gl.createProgram();
  const a = compilar(gl, gl.VERTEX_SHADER, vs, etiqueta + ':vs');
  const b = compilar(gl, gl.FRAGMENT_SHADER, fs, etiqueta + ':fs');
  gl.attachShader(p, a); gl.attachShader(p, b);
  gl.linkProgram(p);
  gl.deleteShader(a); gl.deleteShader(b);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error(`[materiales] fallo al enlazar "${etiqueta}": ${log}`);
  }
  // cache de localizaciones
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    const nom = info.name.replace(/\[0\]$/, '');
    u[nom] = gl.getUniformLocation(p, nom);
  }
  return { prog: p, u };
}

export class Motor {
  constructor (opciones = {}) {
    this.gl = null;
    this.lienzo = null;
    this.programas = new Map();     // clave -> {prog,u}
    this.recursos = new Map();      // resolucion -> {texA[], fboA, texB[], fboB, texC[], fboC}
    this.soportaBitmap = true;
    this.bufferLectura = null;
    this.prefiereOffscreen = opciones.offscreen !== false;
    this.estadisticas = { materiales: 0, msGenerado: 0 };
  }

  iniciar () {
    if (this.gl) return this.gl;
    const w = 4, h = 4;
    let lienzo;
    if (this.prefiereOffscreen && typeof OffscreenCanvas !== 'undefined') {
      lienzo = new OffscreenCanvas(w, h);
      this.soportaBitmap = typeof lienzo.transferToImageBitmap === 'function';
    } else if (typeof document !== 'undefined') {
      lienzo = document.createElement('canvas');
      lienzo.width = w; lienzo.height = h;
      this.soportaBitmap = false;
    } else {
      throw new Error('[materiales] no hay Canvas disponible en este entorno');
    }
    const gl = lienzo.getContext('webgl2', {
      alpha: true, premultipliedAlpha: false, antialias: false,
      depth: false, stencil: false, preserveDrawingBuffer: false,
      powerPreference: 'high-performance', desynchronized: true
    });
    if (!gl) throw new Error('[materiales] WebGL2 no disponible');
    this.lienzo = lienzo;
    this.gl = gl;
    this.flotante = !!(gl.getExtension('EXT_color_buffer_float') ||
                       gl.getExtension('EXT_color_buffer_half_float'));
    gl.getExtension('OES_texture_float_linear');
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    this.pBlit = this.programa('blit', VS_TRI, FS_BLIT);
    this.pB    = this.programa('pasoB', VS_TRI, FS_PASO_B);
    this.pCB   = this.programa('calcoB', VS_TRI, FS_CALCO_B);
    return gl;
  }

  programa (clave, vs, fs) {
    let p = this.programas.get(clave);
    if (!p) { p = enlazar(this.gl, vs, fs, clave); this.programas.set(clave, p); }
    return p;
  }

  programaMaterial (nombre, receta) {
    const clave = 'mat:' + nombre;
    let p = this.programas.get(clave);
    if (!p) { p = enlazar(this.gl, VS_TRI, fsPasoA(receta), clave); this.programas.set(clave, p); }
    return p;
  }

  programaCalco (nombre, receta) {
    const clave = 'cal:' + nombre;
    let p = this.programas.get(clave);
    if (!p) { p = enlazar(this.gl, VS_TRI, fsCalcoA(receta), clave); this.programas.set(clave, p); }
    return p;
  }

  // -------------------------------------------------------------- recursos
  _textura (n, fmt, filtro) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, fmt, n, n);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filtro);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filtro);
    // REPEAT es imprescindible: el paso B muestrea fuera de [0,1] al calcular la
    // normal y la oclusion cerca de los bordes; con CLAMP apareceria una costura.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return t;
  }

  _fbo (texturas) {
    const gl = this.gl;
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    const bufs = [];
    texturas.forEach((t, i) => {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, ATT(gl, i), gl.TEXTURE_2D, t, 0);
      bufs.push(ATT(gl, i));
    });
    gl.drawBuffers(bufs);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    if (!ok) throw new Error('[materiales] framebuffer incompleto');
    return { fbo: f, bufs };
  }

  /** Buffers reutilizados por resolucion: se crean una vez y sirven a todo el catalogo. */
  recursosDe (n) {
    let r = this.recursos.get(n);
    if (r) return r;
    const gl = this.gl;
    const fmtCampo = this.flotante ? gl.RGBA16F : gl.RGBA8;
    const texA = [0, 1, 2].map(() => this._textura(n, fmtCampo, gl.LINEAR));
    const texB = [0, 1, 2, 3, 4, 5].map(() => this._textura(n, gl.RGBA8, gl.NEAREST));
    r = { n, texA, fboA: this._fbo(texA), texB, fboB: this._fbo(texB) };
    if (this.lienzo.width !== n) { this.lienzo.width = n; this.lienzo.height = n; }
    this.recursos.set(n, r);
    return r;
  }

  ajustarLienzo (n) {
    if (this.lienzo.width !== n || this.lienzo.height !== n) {
      this.lienzo.width = n; this.lienzo.height = n;
    }
  }

  // -------------------------------------------------------------- captura
  /** Copia el destino i del FBO al canvas y lo extrae como ImageBitmap/Canvas. */
  _capturar (tex, n, formato) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, n, n);
    gl.useProgram(this.pBlit.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this.pBlit.u.T, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (this.soportaBitmap && formato !== 'canvas') {
      return this.lienzo.transferToImageBitmap();
    }
    // Camino de respaldo: leer pixeles y volcarlos en un canvas 2D.
    const bytes = n * n * 4;
    if (!this.bufferLectura || this.bufferLectura.length < bytes) {
      this.bufferLectura = new Uint8ClampedArray(bytes);
    }
    const buf = this.bufferLectura;
    gl.readPixels(0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const out = (typeof OffscreenCanvas !== 'undefined')
      ? new OffscreenCanvas(n, n)
      : Object.assign(document.createElement('canvas'), { width: n, height: n });
    const cx = out.getContext('2d');
    // readPixels devuelve la fila 0 abajo; ImageData la espera arriba -> volcar invertido.
    const img = cx.createImageData(n, n);
    const fila = n * 4;
    for (let y = 0; y < n; y++) {
      img.data.set(buf.subarray((n - 1 - y) * fila, (n - y) * fila), y * fila);
    }
    cx.putImageData(img, 0, 0);
    return out;
  }

  // -------------------------------------------------------------- material
  generarMaterial (nombre, receta, cfg) {
    const gl = this.iniciar();
    const n = cfg.resolucion;
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const R = this.recursosDe(n);
    this.ajustarLienzo(n);

    // ---- paso A: campo del material -> 3 destinos RGBA16F
    const pA = this.programaMaterial(nombre, receta);
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.fboA.fbo);
    gl.drawBuffers(R.fboA.bufs);
    gl.viewport(0, 0, n, n);
    gl.useProgram(pA.prog);
    if (pA.u.uSem) gl.uniform2f(pA.u.uSem, cfg.semX, cfg.semY);
    if (pA.u.uEsc) gl.uniform1f(pA.u.uEsc, cfg.escala);
    for (const [k, v] of Object.entries(cfg.uniformes || {})) {
      const loc = pA.u[k]; if (!loc) continue;
      if (Array.isArray(v)) {
        if (v.length === 2) gl.uniform2fv(loc, v);
        else if (v.length === 3) gl.uniform3fv(loc, v);
        else if (v.length === 4) gl.uniform4fv(loc, v);
      } else gl.uniform1f(loc, v);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // ---- paso B: normales, oclusion, suciedad por cavidad, desgaste por canto
    const pB = this.pB;
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.fboB.fbo);
    gl.drawBuffers(R.fboB.bufs);
    gl.useProgram(pB.prog);
    for (let i = 0; i < 3; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, R.texA[i]);
      gl.uniform1i(pB.u['T' + i], i);
    }
    const esc = cfg.escala;
    gl.uniform2f(pB.u.uTexel, 1 / n, 1 / n);
    // el relieve se expresa en metros; pasa a unidades de uv dividiendo por el
    // tamaño fisico del tile, y se multiplica por la escala de repeticion.
    gl.uniform1f(pB.u.uRelieve, (cfg.relieve / cfg.tamano) * esc);
    gl.uniform1f(pB.u.uAoRadio, cfg.aoRadio / esc);
    gl.uniform1f(pB.u.uAoFuerza, cfg.aoFuerza);
    gl.uniform1f(pB.u.uCurvGan, cfg.curvGanancia);
    gl.uniform4fv(pB.u.uSuc, cfg.suciedad);
    gl.uniform4fv(pB.u.uBorde, cfg.borde);
    gl.uniform3fv(pB.u.uBordeCol, cfg.bordeColor);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // ---- captura de los seis mapas
    const claves = ['albedo', 'normal', 'rugosidad', 'metalico', 'oclusion', 'altura'];
    const salida = {};
    for (let i = 0; i < 6; i++) salida[claves[i]] = this._capturar(R.texB[i], n, cfg.formato);

    this.estadisticas.materiales++;
    this.estadisticas.msGenerado += (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    return salida;
  }

  // ------------------------------------------------------------ calcomania
  generarCalco (nombre, receta, cfg) {
    const gl = this.iniciar();
    const n = cfg.resolucion;
    const R = this.recursosDe(n);
    this.ajustarLienzo(n);

    const pA = this.programaCalco(nombre, receta);
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.fboA.fbo);
    gl.drawBuffers(R.fboA.bufs.slice(0, 2));
    gl.viewport(0, 0, n, n);
    gl.useProgram(pA.prog);
    if (pA.u.uSem) gl.uniform2f(pA.u.uSem, cfg.semX, cfg.semY);
    if (pA.u.uEsc) gl.uniform1f(pA.u.uEsc, cfg.escala);
    for (const [k, v] of Object.entries(cfg.uniformes || {})) {
      const loc = pA.u[k]; if (!loc) continue;
      if (Array.isArray(v)) {
        if (v.length === 2) gl.uniform2fv(loc, v);
        else if (v.length === 3) gl.uniform3fv(loc, v);
        else if (v.length === 4) gl.uniform4fv(loc, v);
      } else gl.uniform1f(loc, v);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const pB = this.pCB;
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.fboB.fbo);
    gl.drawBuffers(R.fboB.bufs.slice(0, 3));
    gl.useProgram(pB.prog);
    for (let i = 0; i < 2; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, R.texA[i]);
      gl.uniform1i(pB.u['T' + i], i);
    }
    gl.uniform2f(pB.u.uTexel, 1 / n, 1 / n);
    gl.uniform1f(pB.u.uRelieve, cfg.relieve);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.drawBuffers(R.fboB.bufs);   // restaurar

    return {
      color:  this._capturar(R.texB[0], n, cfg.formato),
      normal: this._capturar(R.texB[1], n, cfg.formato),
      ard:    this._capturar(R.texB[2], n, cfg.formato)
    };
  }

  liberar () {
    const gl = this.gl; if (!gl) return;
    for (const r of this.recursos.values()) {
      r.texA.forEach(t => gl.deleteTexture(t));
      r.texB.forEach(t => gl.deleteTexture(t));
      gl.deleteFramebuffer(r.fboA.fbo);
      gl.deleteFramebuffer(r.fboB.fbo);
    }
    this.recursos.clear();
    for (const p of this.programas.values()) gl.deleteProgram(p.prog);
    this.programas.clear();
    gl.deleteVertexArray(this.vao);
    const pierde = gl.getExtension('WEBGL_lose_context');
    if (pierde) pierde.loseContext();
    this.gl = null; this.lienzo = null;
  }
}
