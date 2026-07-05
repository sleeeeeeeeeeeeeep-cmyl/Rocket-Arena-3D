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
  // --- PER-CAR FIT: sample the real mesh to find nose height/width and cabin peak,
  //     so lamps and canopy sit correctly on every body (low Blade vs tall Titan) ---
  const fit = (function sampleFit() {
    const inv = new THREE.Matrix4();
    const v = new THREE.Vector3();
    let pts = [];
    root.updateMatrixWorld(true);
    root.traverse(o => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      const pos = o.geometry.attributes.position;
      const stride = Math.max(1, Math.floor(pos.count / 4000));   // sample ≤~4k verts per mesh
      for (let i = 0; i < pos.count; i += stride) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        // matrixWorld already includes the centering+grounding translation → already wrap-local
        pts.push([v.x, v.y, v.z]);
      }
    });
    if (!pts.length) return null;
    const L2 = size.z, noseZ = -L2 / 2;
    // nose face: verts within the front 10% of length
    const nose = pts.filter(p => p[2] < noseZ + L2 * 0.10);
    const noseYs = nose.map(p => p[1]).sort((a, b) => a - b);
    const noseXs = nose.map(p => Math.abs(p[0]));
    const noseY = noseYs.length ? noseYs[Math.floor(noseYs.length * 0.55)] : size.y * 0.42;   // mid of nose face
    const noseSpread = noseXs.length ? Math.max(...noseXs) * 0.62 : size.x * 0.3;
    // nose face vertical extent → lamp size; and the real surface z at lamp height → lamp depth
    const noseH = noseYs.length ? (noseYs[Math.floor(noseYs.length * 0.9)] - noseYs[Math.floor(noseYs.length * 0.1)]) : size.y * 0.3;
    const atLamp = nose.filter(p => Math.abs(p[1] - noseY) < size.y * 0.12);
    const noseSurfZ = atLamp.length ? Math.min(...atLamp.map(p => p[2])) : noseZ;
    // cabin peak: scan 12 z-slices for the tallest one in the middle 70% of the car
    let cabinZ = 0, cabinTop = size.y * 0.8, cabinW = size.x * 0.6, best = 0;
    const sliceTops = [];
    for (let s = 0; s < 12; s++) {
      const z0 = -L2 * 0.35 + (s / 11) * L2 * 0.7;
      const slice = pts.filter(p => Math.abs(p[2] - z0) < L2 * 0.05);
      if (!slice.length) { sliceTops.push(0); continue; }
      const top = Math.max(...slice.map(p => p[1]));
      sliceTops.push(top);
      if (top > best) { best = top; cabinZ = z0; cabinTop = top; cabinW = Math.max(...slice.map(p => Math.abs(p[0]))) * 2; }
    }
    // cabin length: contiguous slices at least 85% of the peak height
    let lo = 11, hi = 0;
    sliceTops.forEach((t, s) => { if (t >= best * 0.85) { lo = Math.min(lo, s); hi = Math.max(hi, s); } });
    const cabinLen = lo <= hi ? ((hi - lo + 1) / 12) * L2 * 0.7 : L2 * 0.22;
    // per-side lamp seating: true surface z near each lamp position (left/right)
    const lampXGuess = Math.max(size.x * 0.16, Math.min(size.x * 0.42, noseSpread));
    const sideZ = (sx, rear) => {
      const zone = pts.filter(p => Math.abs(p[0] - sx * lampXGuess) < size.x * 0.14 && Math.abs(p[1] - noseY) < size.y * 0.14
        && (rear ? p[2] > L2 * 0.30 : p[2] < -L2 * 0.30));
      if (!zone.length) return rear ? L2 / 2 : -L2 / 2;
      return rear ? Math.max(...zone.map(p => p[2])) : Math.min(...zone.map(p => p[2]));
    };
    const lampZs = [sideZ(-1, false), sideZ(1, false)];
    const tailZs = [sideZ(-1, true), sideZ(1, true)];
    // nose taper: how much the surface sweeps back from inner to outer edge → lamp yaw
    const zIn = pts.filter(p => Math.abs(p[0]) < size.x * 0.1 && Math.abs(p[1] - noseY) < size.y * 0.14 && p[2] < -L2 * 0.3);
    const zInMin = zIn.length ? Math.min(...zIn.map(p => p[2])) : -L2 / 2;
    const taper = Math.max(0, Math.min(0.7, Math.atan2((lampZs[0] + lampZs[1]) / 2 - zInMin, lampXGuess)));
    // windshield shell: heightfield of the cabin's real top surface
    const nx = 11, nz = 9;
    const shellW = Math.max(size.x * 0.4, Math.min(size.x * 0.92, cabinW)) * 0.5;
    const shellL = Math.max(L2 * 0.12, Math.min(L2 * 0.36, cabinLen * 0.55));
    const grid = new Array(nx * nz).fill(0);
    for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
      const gx = -shellW + (ix / (nx - 1)) * shellW * 2;
      const gz = cabinZ - shellL + (iz / (nz - 1)) * shellL * 2;
      const cell = pts.filter(p => Math.abs(p[0] - gx) < shellW / (nx - 1) * 1.4 && Math.abs(p[2] - gz) < shellL / (nz - 1) * 1.4);
      grid[iz * nx + ix] = cell.length ? Math.max(...cell.map(p => p[1])) : 0;
    }
    // fill gaps from neighbours, then one smoothing pass
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < grid.length; i++) if (!grid[i]) {
      const ix = i % nx, iz = (i / nx) | 0; let sum = 0, n = 0;
      [[1,0],[-1,0],[0,1],[0,-1]].forEach(d => { const jx = ix + d[0], jz = iz + d[1];
        if (jx >= 0 && jx < nx && jz >= 0 && jz < nz && grid[jz * nx + jx]) { sum += grid[jz * nx + jx]; n++; } });
      if (n) grid[i] = sum / n;
    }
    const sm = grid.slice();
    for (let i = 0; i < grid.length; i++) { const ix = i % nx, iz = (i / nx) | 0; let sum = grid[i], n = 1;
      [[1,0],[-1,0],[0,1],[0,-1]].forEach(d => { const jx = ix + d[0], jz = iz + d[1];
        if (jx >= 0 && jx < nx && jz >= 0 && jz < nz) { sum += grid[jz * nx + jx]; n++; } });
      sm[i] = Math.max(sum / n, size.y * 0.3); }
    const shell = { grid: sm, nx, nz, w: shellW, l: shellL, z: cabinZ };
    // fender line per end: widest body point near each axle → wheels seat flush, never clip
    const fender = end => {
      const zone = pts.filter(p => Math.abs(p[2] - end * L2 * 0.34) < L2 * 0.09 && p[1] < size.y * 0.55);
      return zone.length ? Math.max(...zone.map(p => Math.abs(p[0]))) : size.x * 0.46;
    };
    const fenderF = fender(-1), fenderR = fender(1);
    // full-length top-surface grid for body patterns (stripes that follow the real bodywork)
    const tnx = 7, tnz = 18, tw = size.x * 0.47, tl = L2 * 0.48;
    const tgrid = new Array(tnx * tnz).fill(0);
    for (let ix = 0; ix < tnx; ix++) for (let iz = 0; iz < tnz; iz++) {
      const gx = -tw + (ix / (tnx - 1)) * tw * 2, gz = -tl + (iz / (tnz - 1)) * tl * 2;
      const cell = pts.filter(p => Math.abs(p[0] - gx) < tw / (tnx - 1) * 1.4 && Math.abs(p[2] - gz) < tl / (tnz - 1) * 1.4);
      tgrid[iz * tnx + ix] = cell.length ? Math.max(...cell.map(p => p[1])) : 0;
    }
    for (let pass = 0; pass < 3; pass++) for (let i = 0; i < tgrid.length; i++) if (!tgrid[i]) {
      const ix = i % tnx, iz = (i / tnx) | 0; let sum = 0, n = 0;
      [[1,0],[-1,0],[0,1],[0,-1]].forEach(d => { const jx = ix + d[0], jz = iz + d[1];
        if (jx >= 0 && jx < tnx && jz >= 0 && jz < tnz && tgrid[jz * tnx + jx]) { sum += tgrid[jz * tnx + jx]; n++; } });
      if (n) tgrid[i] = sum / n;
    }
    const top = { grid: tgrid, nx: tnx, nz: tnz, w: tw, l: tl };
    return { noseY, noseSpread, noseH, noseSurfZ, cabinZ, cabinTop, cabinW, cabinLen, lampZs, tailZs, taper, shell, fenderF, fenderR, top };
  })();
  // attach procedural parts in the wrap's local frame AFTER centering/grounding:
  // the model now occupies x:±size.x/2, y:0..size.y, z:±size.z/2
  dressCar(wrap, size, new THREE.Vector3(-size.x / 2, 0, -size.z / 2), fit);
  wrap.add(root);
  wrap.scale.setScalar(scale);
  wrap.userData.faceFix = faceFix || 0;
  return wrap;
}

/* The car models are ex-3D-print meshes that ALREADY include wheels and body detail
 * molded into the single mesh. So we do NOT add wheels/glass/lights (that caused the
 * doubled 8-wheel look). We only add what the print models genuinely lack:
 * a soft contact shadow and twin boost flames. */
function dressCar(wrap, size, min, fit) {
  const W = size.x, H = size.y, L = size.z, bottom = min.y;
  // fitted placement from real mesh sampling (fallback to bbox fractions)
  const lampY = fit ? Math.max(H * 0.2, Math.min(H * 0.7, fit.noseY)) : bottom + H * 0.42;
  const lampX = fit ? Math.max(W * 0.16, Math.min(W * 0.42, fit.noseSpread)) : W * 0.3;
  const cabZ = fit ? Math.max(-L * 0.25, Math.min(L * 0.3, fit.cabinZ)) : -L * 0.02;
  const cabTop = fit ? fit.cabinTop : H * 0.8;
  const cabW = fit ? Math.max(W * 0.4, Math.min(W * 0.9, fit.cabinW)) : W * 0.6;
  const lampR = fit && fit.noseH ? Math.max(H * 0.05, Math.min(H * 0.13, fit.noseH * 0.30)) : H * 0.085;
  const lampZ = fit && fit.noseSurfZ != null ? Math.max(-L * 0.5, fit.noseSurfZ) : -L * 0.485;
  const cabLen = fit && fit.cabinLen ? Math.max(L * 0.14, Math.min(L * 0.34, fit.cabinLen * 0.5)) : L * 0.22;
  // slight windshield rake: tilt toward the nose if the cabin sits behind centre
  const rake = fit ? Math.max(-0.22, Math.min(0, -(cabTop - lampY) / L * 0.5)) : -0.12;
  wrap.userData.wheels = [];
  const tagPart = o => { o.traverse(x => { x.userData.carPart = true; }); o.userData.carPart = true; };

  // --- WHEELS: realistic — rounded-profile tire (torus), dished rim, radial spokes, hub, brake rotor ---
  // spin lives on an inner mesh; steer lives on the outer group, so they don't fight.
  const wr = H * 0.30, ww = W * 0.115;
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
    // lug nuts: 5 small studs around the hub
    const lugGeo = new THREE.CylinderGeometry(wr * 0.035, wr * 0.035, ww * 0.95, 6);
    for (let lg = 0; lg < 5; lg++) {
      const lug = new THREE.Mesh(lugGeo, darkSteel);
      lug.rotation.z = Math.PI / 2;
      const la = lg * (Math.PI * 2 / 5);
      lug.position.set(0, Math.cos(la) * wr * 0.2, Math.sin(la) * wr * 0.2);
      spinner.add(lug);
    }
    // tread grooves: two thin dark rings on the tire face
    const grooveMat = new THREE.MeshStandardMaterial({ color: 0x060608, roughness: 1 });
    [0.62, 0.84].forEach(k => {
      const gv = new THREE.Mesh(new THREE.TorusGeometry(wr * 0.72 * k + wr * 0.09, wr * 0.02, 6, 24), grooveMat);
      gv.rotation.y = Math.PI / 2; spinner.add(gv);
    });
    spinner.add(tire, rotor, dish, lip, hub, spokes);
    // brake caliper: small red block on the rotor (on the steering group, doesn't spin)
    const caliper = new THREE.Mesh(new THREE.BoxGeometry(ww * 0.3, wr * 0.34, wr * 0.22),
      new THREE.MeshStandardMaterial({ color: 0xb02020, metalness: 0.4, roughness: 0.4 }));
    caliper.position.set(-sx * ww * 0.12, wr * 0.34, wr * 0.3);
    wheelGroup.add(caliper);
    wheelGroup.add(spinner);
    const fx = fit ? (sz > 0 ? fit.fenderR : fit.fenderF) : W * 0.46;
    wheelGroup.position.set(sx * Math.max(W * 0.34, Math.min(W * 0.52, fx * 0.985)), bottom + wr, sz * L * 0.34);
    wheelGroup.userData.front = sz > 0; wheelGroup.userData.spinner = spinner;
    tagPart(wheelGroup);
    wrap.add(wheelGroup); wrap.userData.wheels.push(wheelGroup);
  });
  wrap.userData.rimMat = rimMat;

  // --- WINDSHIELD: smooth curved glass canopy (clipped sphere) that hugs the cabin ---
  const glassMat = (THREE.MeshPhysicalMaterial)
    ? new THREE.MeshPhysicalMaterial({ color: 0x18283e, metalness: 0.2, roughness: 0.04, transparent: true, opacity: 0.5, envMapIntensity: 1.8, clearcoat: 1.0, clearcoatRoughness: 0.05 })
    : new THREE.MeshStandardMaterial({ color: 0x101a2c, metalness: 0.3, roughness: 0.06, transparent: true, opacity: 0.5, envMapIntensity: 1.6 });
  // REAL WINDOW PANES (not a dome): raked front windshield + side windows + rear glass,
  // all placed from this car's sampled hood/roof geometry.
  const glassGrp = new THREE.Group();
  (function buildWindows() {
    const T = fit && fit.top;
    const sampleTop = (x, z) => {
      if (!T) return cabTop * 0.8;
      const u = Math.max(0, Math.min(1, (x + T.w) / (2 * T.w))) * (T.nx - 1);
      const v = Math.max(0, Math.min(1, (z + T.l) / (2 * T.l))) * (T.nz - 1);
      const i0 = Math.floor(u), j0 = Math.floor(v), fu = u - i0, fv = v - j0;
      const i1 = Math.min(T.nx - 1, i0 + 1), j1 = Math.min(T.nz - 1, j0 + 1);
      const g = T.grid;
      return (g[j0 * T.nx + i0] * (1 - fu) + g[j0 * T.nx + i1] * fu) * (1 - fv)
           + (g[j1 * T.nx + i0] * (1 - fu) + g[j1 * T.nx + i1] * fu) * fv;
    };
    const roofY = cabTop, cabHalf = Math.max(L * 0.09, cabLen * 0.5);
    // front windshield: curved raked pane from the hood line up to the roof's leading edge
    const frontLowZ = cabZ - cabHalf - L * 0.10, frontTopZ = cabZ - cabHalf * 0.35;
    const hoodY = Math.min(roofY * 0.72, sampleTop(0, frontLowZ) + H * 0.02);
    const cols = 7, rows = 4, pane = [], pidx = [];
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      const z = frontLowZ + (frontTopZ - frontLowZ) * t;
      const yy = hoodY + (roofY * 0.97 - hoodY) * t;
      for (let cI = 0; cI <= cols; cI++) {
        const u = cI / cols - 0.5;
        const halfW2 = (cabW * 0.5) * (0.96 - 0.10 * t);
        // wrap the outer columns back for a curved-glass look
        pane.push(u * 2 * halfW2, yy + H * 0.012, z + Math.abs(u) * Math.abs(u) * L * 0.06);
      }
    }
    for (let r = 0; r < rows; r++) for (let cI = 0; cI < cols; cI++) {
      const a = r * (cols + 1) + cI, b = a + 1, c2 = a + cols + 1, d = c2 + 1;
      pidx.push(a, c2, b, b, c2, d);
    }
    const fgeo = new THREE.BufferGeometry();
    fgeo.setAttribute('position', new THREE.Float32BufferAttribute(pane, 3));
    fgeo.setIndex(pidx); fgeo.computeVertexNormals();
    glassGrp.add(new THREE.Mesh(fgeo, glassMat));
    // rear window: shorter, steeper mirrored pane
    const rear = fgeo.clone();
    const rp = rear.getAttribute('position');
    for (let i = 0; i < rp.count; i++) rp.setZ(i, (cabZ + cabHalf * 0.35) + ((cabZ + cabHalf + L * 0.06) - (cabZ + cabHalf * 0.35)) * ((rp.getY(i) - roofY * 0.97) / (hoodY - roofY * 0.97)) );
    rear.computeVertexNormals();
    glassGrp.add(new THREE.Mesh(rear, glassMat));
    // side windows: slim tinted panes tucked along the cabin flanks
    for (let s = -1; s <= 1; s += 2) {
      const sw = new THREE.Mesh(new THREE.PlaneGeometry(cabHalf * 1.5, roofY * 0.30), glassMat);
      sw.rotation.y = s * Math.PI / 2;
      sw.rotation.z = -s * 0.14;   // lean inward like real glass
      sw.position.set(s * cabW * 0.485, roofY * 0.76, cabZ);
      glassGrp.add(sw);
    }
    glassMat.side = THREE.DoubleSide;
  })();
  tagPart(glassGrp); wrap.add(glassGrp);

  // --- HEADLAMPS: recessed housings with bright lens + glow; red tail-light bars ---
  wrap.userData.brakeLights = [];
  const housingMat = new THREE.MeshStandardMaterial({ color: 0x14181f, metalness: 0.6, roughness: 0.35 });
  const lensMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c0, emissiveIntensity: 2.0, roughness: 0.1 });
  const taper = fit && fit.taper ? fit.taper : 0.25;
  for (let s = -1; s <= 1; s += 2) {
    const side = s > 0 ? 1 : 0;
    // HEADLAMP CLUSTER: one group per side, seated on that side's true surface depth,
    // yawed to follow the nose taper so it sits flush instead of poking straight out.
    const lampZside = (fit && fit.lampZs) ? Math.max(-L * 0.5, fit.lampZs[side]) : lampZ;
    const head = new THREE.Group();
    head.position.set(s * lampX, lampY, lampZside + 0.02);
    head.rotation.y = -s * taper * 0.55;
    // chrome bezel ring around a recessed reflector bowl
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(lampR, lampR * 0.14, 8, 20),
      new THREE.MeshStandardMaterial({ color: 0xcfd6e0, metalness: 0.95, roughness: 0.18, envMapIntensity: 1.6 }));
    head.add(bezel);
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(lampR * 0.92, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xe8edf5, metalness: 1.0, roughness: 0.08, envMapIntensity: 2.0, side: THREE.BackSide }));
    bowl.rotation.x = -Math.PI / 2; bowl.position.z = 0.03; head.add(bowl);
    // projector lens: small bright half-sphere at the bowl's heart
    const proj = new THREE.Mesh(new THREE.SphereGeometry(lampR * 0.38, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), lensMat);
    proj.rotation.x = Math.PI / 2; proj.position.z = -0.05; head.add(proj);
    // LED daytime strip under the lamp
    const drl = new THREE.Mesh(new THREE.BoxGeometry(lampR * 2.4, lampR * 0.16, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xcfe8ff, emissiveIntensity: 2.2 }));
    drl.position.set(0, -lampR * 1.15, -0.02); head.add(drl);
    // outer housing shroud + soft glow
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(lampR * 1.12, lampR * 1.2, 0.14, 16, 1, true), housingMat);
    housing.rotation.x = Math.PI / 2; housing.position.z = 0.05; head.add(housing);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(lampR * 1.65, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.z = -0.16; glow.rotation.y = Math.PI; head.add(glow);
    const hl = new THREE.PointLight(0xfff2c0, 0.0, W * 6, 2);
    hl.position.z = -0.6; hl.userData.headlight = true; head.add(hl);
    tagPart(head); wrap.add(head);
    // TAIL CLUSTER: seated on that side's real rear surface
    const tailZside = (fit && fit.tailZs) ? Math.min(L * 0.5, fit.tailZs[side]) : L * 0.485;
    const tail = new THREE.Group();
    tail.position.set(s * lampX * 0.93, lampY + H * 0.04, tailZside - 0.02);
    tail.rotation.y = s * taper * 0.4;
    const tailHouse = new THREE.Mesh(new THREE.BoxGeometry(W * 0.2, H * 0.09, 0.08), housingMat);
    tail.add(tailHouse);
    const blMat = new THREE.MeshStandardMaterial({ color: 0x4a0505, emissive: 0xff1a1a, emissiveIntensity: 0.15 });
    for (let seg = -1; seg <= 1; seg++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(W * 0.05, H * 0.05 * (seg === 0 ? 1.2 : 0.8), 0.06), blMat);
      bar.position.set(seg * W * 0.062, 0, 0.045); tail.add(bar);
    }
    const bl = { material: blMat };
    tagPart(tail); wrap.add(tail);
    wrap.userData.brakeLights.push(bl.material);
  }

  // --- body patterns: accent-coloured strips that follow the car's real top surface ---
  wrap.userData.setPattern = function (id, accentHex) {
    if (wrap.userData.patternGrp) { wrap.remove(wrap.userData.patternGrp); wrap.userData.patternGrp.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); wrap.userData.patternGrp = null; }
    if (!id || id === 'none' || !fit || !fit.top) return;
    const T = fit.top;
    const sampleY = (x, z) => {   // bilinear sample of the top grid
      const u = Math.max(0, Math.min(1, (x + T.w) / (2 * T.w))) * (T.nx - 1);
      const v = Math.max(0, Math.min(1, (z + T.l) / (2 * T.l))) * (T.nz - 1);
      const i0 = Math.floor(u), j0 = Math.floor(v), fu = u - i0, fv = v - j0;
      const i1 = Math.min(T.nx - 1, i0 + 1), j1 = Math.min(T.nz - 1, j0 + 1);
      const g = T.grid;
      return (g[j0 * T.nx + i0] * (1 - fu) + g[j0 * T.nx + i1] * fu) * (1 - fv)
           + (g[j1 * T.nx + i0] * (1 - fu) + g[j1 * T.nx + i1] * fu) * fv;
    };
    const mat = (THREE.MeshPhysicalMaterial)
      ? new THREE.MeshPhysicalMaterial({ color: accentHex, metalness: 0.4, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.25, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ color: accentHex, metalness: 0.4, roughness: 0.3, side: THREE.DoubleSide });
    const grpP = new THREE.Group();
    const strip = (xc, sw) => {
      const rows = 22, posArr = [], idxArr = [];
      for (let r = 0; r <= rows; r++) {
        const z = -T.l + (r / rows) * T.l * 2;
        [xc - sw / 2, xc + sw / 2].forEach(x => posArr.push(x, sampleY(x, z) + H * 0.028, z));
      }
      for (let r = 0; r < rows; r++) { const a = r * 2; idxArr.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
      geo.setIndex(idxArr); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat); grpP.add(m);
    };
    if (id === 'stripes') { strip(-W * 0.13, W * 0.11); strip(W * 0.13, W * 0.11); }
    else if (id === 'flames') { strip(0, W * 0.24); }
    else if (id === 'carbon') { strip(-W * 0.40, W * 0.09); strip(W * 0.40, W * 0.09); }
    else if (id === 'hex') { strip(0, W * 0.66); }
    else if (id === 'camo') { strip(0, W * 0.2); strip(-W * 0.40, W * 0.08); strip(W * 0.40, W * 0.08); }
    grpP.traverse(o => { o.userData.carPart = true; });
    grpP.userData.carPart = true;
    wrap.userData.patternGrp = grpP;
    wrap.add(grpP);
  };

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
