/* Link Up — minimal GLB loader (constrained subset).
 * Supports exactly what scripts/generate-glb.mjs emits:
 * TRIANGLES with POSITION/NORMAL/COLOR_0 (float VEC3) + indexed geometry,
 * node TRS/matrix transforms, and materials carrying an emissiveFactor hint.
 * Full GLTFLoader is unnecessary weight for an offline PWA; this is ~120 lines.
 */
import * as THREE from 'three';

const COMP = { 5126: { ctor: Float32Array, size: 4 } };
const INDX = { 5123: { ctor: Uint16Array, size: 2 }, 5125: { ctor: Uint32Array, size: 4 } };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function readAccessor(json, bin, acc) {
  const bv = json.bufferViews[acc.bufferView];
  const off = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const table = acc.type === 'SCALAR' && INDX[acc.componentType] ? INDX : COMP;
  const t = table[acc.componentType];
  if (!t) throw new Error('unsupported accessor componentType ' + acc.componentType);
  const n = acc.count * NCOMP[acc.type];
  return new t.ctor(bin.buffer, bin.byteOffset + off, n);
}

export async function loadGLB(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('GLB fetch failed: ' + url);
  const buf = new Uint8Array(await res.arrayBuffer());
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB: ' + url);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + jsonLen)));
  const binOff = 20 + jsonLen + 8;
  const binLen = dv.getUint32(20 + jsonLen, true);
  const bin = buf.subarray(binOff, binOff + binLen);

  const materials = (json.materials || []).map((m) => {
    const em = m.emissiveFactor || [0, 0, 0];
    const isGlow = em[0] + em[1] + em[2] > 0.01;
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.88, metalness: 0.04, side: THREE.DoubleSide,
    });
    if (isGlow) {
      mat.emissive = new THREE.Color(em[0], em[1], em[2]);
      mat.emissiveIntensity = 0.15;
      mat.userData.isWindowGlow = true;
    }
    return mat;
  });
  if (!materials.length) materials.push(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
  const windowMats = materials.filter((m) => m.userData.isWindowGlow);

  const group = new THREE.Group();
  const nodeObjs = (json.nodes || []).map((nd) => {
    const o = new THREE.Group();
    if (nd.matrix) {
      const m = new THREE.Matrix4().fromArray(nd.matrix);
      o.position.setFromMatrixPosition(m);
      o.quaternion.setFromRotationMatrix(m);
      o.scale.setFromMatrixScale(m);
    } else {
      if (nd.translation) o.position.fromArray(nd.translation);
      if (nd.rotation) o.quaternion.fromArray(nd.rotation);
      if (nd.scale) o.scale.fromArray(nd.scale);
    }
    if (nd.mesh !== undefined) {
      const meshDef = json.meshes[nd.mesh];
      for (const prim of meshDef.primitives) {
        const g = new THREE.BufferGeometry();
        const pos = readAccessor(json, bin, json.accessors[prim.attributes.POSITION]);
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        if (prim.attributes.NORMAL) g.setAttribute('normal', new THREE.BufferAttribute(readAccessor(json, bin, json.accessors[prim.attributes.NORMAL]), 3));
        else g.computeVertexNormals();
        if (prim.attributes.COLOR_0) g.setAttribute('color', new THREE.BufferAttribute(readAccessor(json, bin, json.accessors[prim.attributes.COLOR_0]), 3));
        if (prim.indices !== undefined) g.setIndex(new THREE.BufferAttribute(readAccessor(json, bin, json.accessors[prim.indices]), 1));
        const mesh = new THREE.Mesh(g, materials[prim.material || 0]);
        mesh.castShadow = true; mesh.receiveShadow = true;
        o.add(mesh);
      }
    }
    return o;
  });
  (json.nodes || []).forEach((nd, i) => {
    for (const c of nd.children || []) nodeObjs[i].add(nodeObjs[c]);
  });
  const sceneIdx = (json.scene ?? 0);
  for (const n of (json.scenes[sceneIdx]?.nodes || [])) group.add(nodeObjs[n]);
  return { group, windowMats };
}
