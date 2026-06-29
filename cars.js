/* cars.js — loads the real .glb car models (Draco-compressed) with a placeholder fallback. */

const CAR_CATALOG = [
  { id: 'car1', name: 'Fennec',     file: 'car1.glb', length: 5.0, faceFix: 0 },
  { id: 'car2', name: 'Octane',     file: 'car2.glb', length: 5.0, faceFix: 0 },
  { id: 'car3', name: 'Dominus',    file: 'car3.glb', length: 5.0, faceFix: 0 },
  { id: 'car4', name: 'Breakout',   file: 'car4.glb', length: 5.0, faceFix: 0 },
  { id: 'car5', name: 'Road Hog',   file: 'car5.glb', length: 5.0, faceFix: 0 },
  { id: 'car6', name: 'Hot Rod',    file: 'car6.glb', length: 5.0, faceFix: 0 },
  { id: 'car7', name: 'Dominus GT', file: 'car7.glb', length: 5.0, faceFix: 0 },
  { id: 'car8', name: 'Batmobile',  file: 'car8.glb', length: 5.0, faceFix: 0 },
  { id: 'car9', name: 'Merc',       file: 'car9.glb', length: 5.0, faceFix: 0 }
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
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; if (o.material) { o.material.envMapIntensity = 1.2; } } });
  wrap.add(root);
  wrap.scale.setScalar(scale);
  wrap.userData.wheels = [];
  return wrap;
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
          root.traverse(o => { if (o.isMesh) { o.castShadow = true; if (o.material) o.material.envMapIntensity = 1.3; } });
          const wrap = new THREE.Group(); wrap.add(root);
          wrap.scale.setScalar(targetRadius / r);
          resolve(wrap);
        } catch (e) { resolve(null); }
      },
      undefined,
      () => resolve(null));
  });
}
