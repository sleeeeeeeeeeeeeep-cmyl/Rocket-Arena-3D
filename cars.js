/* cars.js — loads the real .glb car models (Draco-compressed) with a placeholder fallback. */

const CAR_CATALOG = [
  { id: 'car1', name: 'Raptor',   file: 'car1.glb', length: 5.0, faceFix: 0 },
  { id: 'car2', name: 'Phantom',  file: 'car2.glb', length: 5.0, faceFix: 0 },
  { id: 'car3', name: 'Vortex',   file: 'car3.glb', length: 5.0, faceFix: 0 },
  { id: 'car4', name: 'Striker',  file: 'car4.glb', length: 5.0, faceFix: 0 },
  { id: 'car5', name: 'Titan',    file: 'car5.glb', length: 5.0, faceFix: 0 },
  { id: 'car6', name: 'Mammoth',  file: 'car6.glb', length: 5.0, faceFix: 0 },
  { id: 'car7', name: 'Apex',     file: 'car7.glb', length: 5.0, faceFix: 0 },
  { id: 'car8', name: 'Vanguard', file: 'car8.glb', length: 5.0, faceFix: 0 },
  { id: 'car9', name: 'Blade',    file: 'car9.glb', length: 5.0, faceFix: 0 }
];

// GLTFLoader with Draco support (models are Draco-compressed).
let carLoader = null;
if (typeof THREE !== 'undefined' && THREE.GLTFLoader) {
  carLoader = new THREE.GLTFLoader();
  if (THREE.DRACOLoader) {
    const draco = new THREE.DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    carLoader.setDRACOLoader(draco);
  }
}

function buildPlaceholderCar(paint, accent) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: paint, metalness: 0.6, roughness: 0.3 });
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.7, 4.4), bodyMat);
  chassis.position.y = 0.7; chassis.castShadow = true; g.add(chassis);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 1.9), new THREE.MeshStandardMaterial({ color: 0x10141c }));
  cabin.position.set(0, 1.2, -0.1); g.add(cabin);
  g.userData.wheels = [];
  return g;
}

function normalizeModel(root, targetLength, faceFix) {
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3(); box.getSize(size);
  const center = new THREE.Vector3(); box.getCenter(center);
  const len = Math.max(size.x, size.z) || 1;
  const scale = targetLength / len;
  const wrap = new THREE.Group();
  root.position.sub(center);
  root.position.y += (size.y / 2);
  if (faceFix) root.rotation.y += faceFix;
  // glossy car paint shell (clearcoat if available, else standard). Replaces the noisy print texture.
  root.traverse(o => { if (o.isMesh && o.material) { o.castShadow = true;
    let m;
    if (THREE.MeshPhysicalMaterial) {
      m = new THREE.MeshPhysicalMaterial({ color: 0xcfd6e0, metalness: 0.4, roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.28, envMapIntensity: 1.1 });
    } else {
      m = new THREE.MeshStandardMaterial({ color: 0xcfd6e0, metalness: 0.4, roughness: 0.34, envMapIntensity: 1.2 });
    }
    o.material = m; o.material.needsUpdate = true;
  } });
  // attach procedural car parts sized to the model's real bounding box (pre-scale space)
  dressCar(wrap, size, box.min.clone());
  wrap.add(root);
  wrap.scale.setScalar(scale);
  return wrap;
}

/* Attach wheels, windshield, brake/head lights and a contact shadow so the flat print
 * shell reads as a real car. All sized from the model's bounding box (W,H,L,bottom). */
function dressCar(wrap, size, min) {
  const W = size.x, H = size.y, L = size.z, bottom = min.y;
  wrap.userData.wheels = [];
  const tagPart = o => { o.traverse(x => { x.userData.carPart = true; }); o.userData.carPart = true; };

  // --- wheels: dark tire + bright rim, four corners ---
  const wr = H * 0.34, ww = W * 0.16;
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.85, metalness: 0.1 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xd7dbe2, metalness: 0.9, roughness: 0.28, envMapIntensity: 1.3 });
  const tireGeo = new THREE.CylinderGeometry(wr, wr, ww, 20);
  const rimGeo = new THREE.CylinderGeometry(wr * 0.6, wr * 0.6, ww * 1.04, 14);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(c => {
    const sx = c[0], sz = c[1];
    const w = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat); tire.rotation.z = Math.PI / 2; tire.castShadow = true;
    const rim = new THREE.Mesh(rimGeo, rimMat); rim.rotation.z = Math.PI / 2;
    // a couple of spokes so the rim reads
    for (let s = 0; s < 4; s++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(ww * 0.5, wr * 0.9, wr * 0.12), rimMat);
      spoke.rotation.x = s * Math.PI / 4; rim.add(spoke);
    }
    w.add(tire, rim);
    w.position.set(sx * W * 0.44, bottom + wr, sz * L * 0.32);
    w.userData.front = sz > 0; w.userData.rimMat = rimMat;
    tagPart(w);
    wrap.add(w); wrap.userData.wheels.push(w);
  });
  wrap.userData.rimMat = rimMat;

  // --- windshield / canopy: tinted glass wedge on the upper-front body ---
  const glassMat = (THREE.MeshPhysicalMaterial)
    ? new THREE.MeshPhysicalMaterial({ color: 0x0d1626, metalness: 0.3, roughness: 0.06, transparent: true, opacity: 0.6, envMapIntensity: 1.4 })
    : new THREE.MeshStandardMaterial({ color: 0x101a2c, metalness: 0.3, roughness: 0.08, transparent: true, opacity: 0.55 });
  const glass = new THREE.Mesh(new THREE.BoxGeometry(W * 0.6, H * 0.3, L * 0.32), glassMat);
  glass.position.set(0, bottom + H * 0.74, L * 0.06); glass.rotation.x = -0.16;
  tagPart(glass);
  wrap.add(glass);

  // --- head + brake lights (emissive quads) ---
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c0, emissiveIntensity: 0.8 });
  const brakeMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1a1a, emissiveIntensity: 0.0 });
  for (let s = -1; s <= 1; s += 2) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(W * 0.14, H * 0.1, 0.1), headMat);
    hl.position.set(s * W * 0.3, bottom + H * 0.42, -L * 0.48); tagPart(hl); wrap.add(hl);
    const bl = new THREE.Mesh(new THREE.BoxGeometry(W * 0.14, H * 0.1, 0.1), brakeMat.clone());
    bl.position.set(s * W * 0.3, bottom + H * 0.42, L * 0.48); tagPart(bl); wrap.add(bl);
    wrap.userData.brakeLights = wrap.userData.brakeLights || [];
    wrap.userData.brakeLights.push(bl.material);
  }

  // --- contact shadow: soft dark blob under the car ---
  const shadowTex = makeBlobShadow();
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 1.5, L * 1.35),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.5, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = bottom + 0.05;
  tagPart(shadow);
  wrap.add(shadow);
}

let _blobShadowTex = null;
function makeBlobShadow() {
  if (_blobShadowTex) return _blobShadowTex;
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grd.addColorStop(0, 'rgba(0,0,0,0.7)'); grd.addColorStop(0.6, 'rgba(0,0,0,0.35)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  _blobShadowTex = new THREE.CanvasTexture(c);
  return _blobShadowTex;
}

function loadCar(entry, paint, accent) {
  return new Promise((resolve) => {
    if (!entry || !entry.file || !carLoader) { resolve(buildPlaceholderCar(paint, accent)); return; }
    carLoader.load(entry.file,
      (gltf) => { try { resolve(normalizeModel(gltf.scene, entry.length || 5, entry.faceFix || 0)); }
        catch (e) { console.warn('normalize failed', e); resolve(buildPlaceholderCar(paint, accent)); } },
      undefined,
      (err) => { console.warn('load failed for ' + entry.file, err); resolve(buildPlaceholderCar(paint, accent)); });
  });
}

// Load the ball model (returns a Promise<THREE.Group> or null to use the default sphere).
function loadBallModel(targetRadius) {
  // The imported ball.glb is a dark, busy print-model texture that doesn't read as a
  // ball. We intentionally skip it and let the game use its clean built-in sphere.
  return Promise.resolve(null);
}
function loadBallModel_unused(targetRadius) {
  return new Promise((resolve) => {
    if (!carLoader) { resolve(null); return; }
    carLoader.load('ball.glb',
      (gltf) => {
        try {
          const root = gltf.scene;
          const box = new THREE.Box3().setFromObject(root);
          const size = new THREE.Vector3(); box.getSize(size);
          const center = new THREE.Vector3(); box.getCenter(center);
          const r = Math.max(size.x, size.y, size.z) / 2 || 1;
          root.position.sub(center);
          root.traverse(o => { if (o.isMesh) { o.castShadow = true; if (o.material) {
            // models often import as fully-metallic with no env map -> renders black. Force a lit, visible material.
            o.material.metalness = 0.2; o.material.roughness = 0.5; o.material.envMapIntensity = 1.0;
            if (o.material.emissive) o.material.emissive.setHex(0x000000);
            o.material.needsUpdate = true;
          } } });
          const wrap = new THREE.Group(); wrap.add(root);
          wrap.scale.setScalar(targetRadius / r);
          resolve(wrap);
        } catch (e) { resolve(null); }
      },
      undefined,
      () => resolve(null));
  });
}
