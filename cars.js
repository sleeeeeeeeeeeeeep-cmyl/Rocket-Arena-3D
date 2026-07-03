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
  // ROOT-CAUSE FIX: these models are authored with the nose along +X, but the game
  // drives along -Z. Rotate +X → -Z (yaw +90°) FIRST, then measure everything in
  // the rotated frame. This is why cars appeared to "move sideways" — the mesh
  // pointed 90° off from its motion.
  root.rotation.y = Math.PI / 2;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);   // measured AFTER rotation
  const size = new THREE.Vector3(); box.getSize(size);
  const center = new THREE.Vector3(); box.getCenter(center);
  const len = size.z || 1;                            // length is now along Z, as the game expects
  const scale = targetLength / len;
  const wrap = new THREE.Group();
  root.position.sub(center);
  root.position.y += (size.y / 2);
  // entry.faceFix stays a COSMETIC extra offset applied in syncVisual, for any odd model.
  // glossy car paint shell (clearcoat if available). Replaces the noisy print texture.
  root.traverse(o => { if (o.isMesh && o.material) { o.castShadow = true;
    let m;
    if (THREE.MeshPhysicalMaterial) {
      m = new THREE.MeshPhysicalMaterial({ color: 0xcfd6e0, metalness: 0.4, roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.28, envMapIntensity: 1.1 });
    } else {
      m = new THREE.MeshStandardMaterial({ color: 0xcfd6e0, metalness: 0.4, roughness: 0.34, envMapIntensity: 1.2 });
    }
    o.material = m; o.material.needsUpdate = true;
  } });
  // attach procedural parts in the wrap's local frame AFTER centering/grounding:
  // the model now occupies x:±size.x/2, y:0..size.y, z:±size.z/2
  dressCar(wrap, size, new THREE.Vector3(-size.x / 2, 0, -size.z / 2));
  wrap.add(root);
  wrap.scale.setScalar(scale);
  wrap.userData.faceFix = faceFix || 0;
  return wrap;
}

/* The car models are ex-3D-print meshes that ALREADY include wheels and body detail
 * molded into the single mesh. So we do NOT add wheels/glass/lights (that caused the
 * doubled 8-wheel look). We only add what the print models genuinely lack:
 * a soft contact shadow and twin boost flames. */
function dressCar(wrap, size, min) {
  const W = size.x, H = size.y, L = size.z, bottom = min.y;
  wrap.userData.wheels = [];
  const tagPart = o => { o.traverse(x => { x.userData.carPart = true; }); o.userData.carPart = true; };

  // --- WHEELS: realistic — rounded-profile tire (torus), dished rim, radial spokes, hub, brake rotor ---
  // spin lives on an inner mesh; steer lives on the outer group, so they don't fight.
  const wr = H * 0.30, ww = W * 0.14;
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.92, metalness: 0.05 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xd7dbe2, metalness: 0.92, roughness: 0.22, envMapIntensity: 1.5 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x3a3f48, metalness: 0.8, roughness: 0.45 });
  // torus gives the tire a rounded shoulder profile like a real tyre
  const tireGeo = new THREE.TorusGeometry(wr * 0.72, wr * 0.30, 12, 26);
  const rimDishGeo = new THREE.CylinderGeometry(wr * 0.56, wr * 0.44, ww * 0.7, 18);   // dished barrel
  const rimLipGeo = new THREE.TorusGeometry(wr * 0.56, wr * 0.05, 8, 24);              // outer lip
  const hubGeo = new THREE.CylinderGeometry(wr * 0.14, wr * 0.14, ww * 0.9, 12);
  const rotorGeo = new THREE.CylinderGeometry(wr * 0.5, wr * 0.5, ww * 0.08, 20);
  const spokeGeo = new THREE.BoxGeometry(wr * 0.13, wr * 0.46, ww * 0.34);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(c => {
    const sx = c[0], sz = c[1];
    const wheelGroup = new THREE.Group();              // outer: position + steer (rotation.y)
    const spinner = new THREE.Group();                 // inner: spin (rotation.x)
    // tire (torus axis points sideways)
    const tire = new THREE.Mesh(tireGeo, tireMat); tire.rotation.y = Math.PI / 2; tire.castShadow = true;
    // brake rotor behind the rim
    const rotor = new THREE.Mesh(rotorGeo, darkSteel); rotor.rotation.z = Math.PI / 2; rotor.position.x = -sx * ww * 0.1;
    // dished rim barrel + lip + hub
    const dish = new THREE.Mesh(rimDishGeo, rimMat); dish.rotation.z = Math.PI / 2; dish.rotation.y = sx > 0 ? 0 : Math.PI;
    const lip = new THREE.Mesh(rimLipGeo, rimMat); lip.rotation.y = Math.PI / 2; lip.position.x = sx * ww * 0.32;
    const hub = new THREE.Mesh(hubGeo, rimMat); hub.rotation.z = Math.PI / 2;
    // 5 radial spokes
    const spokes = new THREE.Group();
    for (let s = 0; s < 5; s++) {
      const spoke = new THREE.Mesh(spokeGeo, rimMat);
      spoke.position.y = wr * 0.3;
      const arm = new THREE.Group(); arm.add(spoke); arm.rotation.x = s * (Math.PI * 2 / 5);
      spokes.add(arm);
    }
    spokes.position.x = sx * ww * 0.18;
    spinner.add(tire, rotor, dish, lip, hub, spokes);
    wheelGroup.add(spinner);
    wheelGroup.position.set(sx * W * 0.46, bottom + wr, sz * L * 0.34);
    wheelGroup.userData.front = sz > 0; wheelGroup.userData.spinner = spinner;
    tagPart(wheelGroup);
    wrap.add(wheelGroup); wrap.userData.wheels.push(wheelGroup);
  });
  wrap.userData.rimMat = rimMat;

  // --- WINDSHIELD: smooth curved glass canopy (clipped sphere) that hugs the cabin ---
  const glassMat = (THREE.MeshPhysicalMaterial)
    ? new THREE.MeshPhysicalMaterial({ color: 0x18283e, metalness: 0.2, roughness: 0.04, transparent: true, opacity: 0.5, envMapIntensity: 1.8, clearcoat: 1.0, clearcoatRoughness: 0.05 })
    : new THREE.MeshStandardMaterial({ color: 0x101a2c, metalness: 0.3, roughness: 0.06, transparent: true, opacity: 0.5, envMapIntensity: 1.6 });
  // upper hemisphere segment, squashed to a canopy that follows the cabin
  const canopyGeo = new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const glass = new THREE.Mesh(canopyGeo, glassMat);
  glass.scale.set(W * 0.30, H * 0.34, L * 0.24);
  glass.position.set(0, bottom + H * 0.62, -L * 0.02);
  tagPart(glass); wrap.add(glass);

  // --- HEADLAMPS: recessed housings with bright lens + glow; red tail-light bars ---
  wrap.userData.brakeLights = [];
  const housingMat = new THREE.MeshStandardMaterial({ color: 0x14181f, metalness: 0.6, roughness: 0.35 });
  const lensMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c0, emissiveIntensity: 2.0, roughness: 0.1 });
  for (let s = -1; s <= 1; s += 2) {
    // housing: shallow cylinder set into the nose
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.085, H * 0.095, 0.1, 16), housingMat);
    housing.rotation.x = Math.PI / 2;
    housing.position.set(s * W * 0.3, bottom + H * 0.42, -L * 0.485);
    tagPart(housing); wrap.add(housing);
    // lens: bright emissive disc inside the housing
    const lens = new THREE.Mesh(new THREE.CircleGeometry(H * 0.065, 16), lensMat);
    lens.position.set(s * W * 0.3, bottom + H * 0.42, -L * 0.492 - 0.051);
    lens.rotation.y = Math.PI;   // face forward (-Z)
    tagPart(lens); wrap.add(lens);
    // soft additive glow sprite in front of the lens
    const glow = new THREE.Mesh(new THREE.CircleGeometry(H * 0.14, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.set(s * W * 0.3, bottom + H * 0.42, -L * 0.5 - 0.08);
    glow.rotation.y = Math.PI;
    tagPart(glow); wrap.add(glow);
    // real light emitted forward (player-only; enabled after spawn)
    const hl = new THREE.PointLight(0xfff2c0, 0.0, W * 6, 2);
    hl.position.set(s * W * 0.3, bottom + H * 0.44, -L * 0.6); hl.userData.headlight = true; tagPart(hl); wrap.add(hl);
    // tail light: slim red bar in a dark housing, glows on brake
    const tailHouse = new THREE.Mesh(new THREE.BoxGeometry(W * 0.2, H * 0.09, 0.08), housingMat);
    tailHouse.position.set(s * W * 0.28, bottom + H * 0.46, L * 0.485); tagPart(tailHouse); wrap.add(tailHouse);
    const bl = new THREE.Mesh(new THREE.BoxGeometry(W * 0.17, H * 0.055, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x4a0505, emissive: 0xff1a1a, emissiveIntensity: 0.15 }));
    bl.position.set(s * W * 0.28, bottom + H * 0.46, L * 0.49 + 0.045); tagPart(bl); wrap.add(bl);
    wrap.userData.brakeLights.push(bl.material);
  }

  // --- boost flames: twin cones at the rear, hidden until boosting ---
  wrap.userData.flames = [];
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb24a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let s = -1; s <= 1; s += 2) {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(W * 0.1, L * 0.45, 12), flameMat.clone());
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(s * W * 0.18, bottom + H * 0.3, L * 0.5);
    flame.visible = false;
    const core = new THREE.Mesh(new THREE.ConeGeometry(W * 0.05, L * 0.3, 10), new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.rotation.x = -Math.PI / 2; core.position.set(0, 0, -L * 0.06); flame.add(core);
    tagPart(flame);
    wrap.add(flame); wrap.userData.flames.push(flame);
  }

  // --- contact shadow: soft dark blob under the car ---
  const shadowTex = makeBlobShadow();
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 1.6, L * 1.4),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.45, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = bottom + 0.04;
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
