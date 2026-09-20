import { Mesh, MeshBuilder, VertexBuffer, Vector3, Matrix, Quaternion } from '@babylonjs/core';

// Proyeccion triplanar por eje dominante -> UV a escala de mundo.
export function boxUV(mesh, scale) {
  const pos = mesh.getVerticesData(VertexBuffer.PositionKind);
  const nor = mesh.getVerticesData(VertexBuffer.NormalKind);
  if (!pos || !nor) return mesh;
  const uv = new Float32Array((pos.length / 3) * 2);
  const s = 1 / scale;
  for (let i = 0, j = 0; i < pos.length; i += 3, j += 2) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    const nx = Math.abs(nor[i]), ny = Math.abs(nor[i + 1]), nz = Math.abs(nor[i + 2]);
    if (ny >= nx && ny >= nz) { uv[j] = x * s; uv[j + 1] = z * s; }
    else if (nx >= nz) { uv[j] = z * s; uv[j + 1] = y * s; }
    else { uv[j] = x * s; uv[j + 1] = y * s; }
  }
  mesh.setVerticesData(VertexBuffer.UVKind, uv, false);
  return mesh;
}

export function bakeUV(mesh, scale) {
  mesh.bakeCurrentTransformIntoVertices();
  return boxUV(mesh, scale);
}

export function makeBox(scene, name, w, h, d, x, y, z, ry = 0) {
  const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
  m.position.set(x, y, z);
  if (ry) m.rotation.y = ry;
  return m;
}

export function merge(name, list, mat, scene, uvScale) {
  const kept = list.filter(Boolean);
  for (const m of kept) { if (uvScale) bakeUV(m, uvScale); else m.bakeCurrentTransformIntoVertices(); }
  const out = Mesh.MergeMeshes(kept, true, true, undefined, false, false);
  if (!out) return null;
  out.name = name;
  out.material = mat;
  out.isPickable = false;
  out.freezeWorldMatrix();
  return out;
}

// Matriz para thin instances
const _m = Matrix.Identity();
export function trs(x, y, z, rx, ry, rz, sx, sy, sz, target, offset) {
  Matrix.ComposeToRef(
    new Vector3(sx, sy, sz),
    Quaternion.FromEulerAngles(rx, ry, rz),
    new Vector3(x, y, z), _m);
  _m.copyToArray(target, offset);
}
