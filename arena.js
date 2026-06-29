/* arena.js — Rocket League-accurate arena + boost pads.
 * RL uses Unreal Units; we scale by 1/50 so the field is a comfortable size.
 * Real values from the RLBot wiki:
 *   side wall x = ±4096, back wall y = ±5120, goal height 642, goal post ±892, goal depth 880
 *   6 big pads (100 boost, 10s) + 28 small pads (12 boost, 5s) at exact coordinates.
 */
const UU = 1 / 50; // Unreal-units → world scale

const ARENA = {
  HALF_W: 4096 * UU,
  HALF_L: 5120 * UU,
  WALL_H: 2044 * UU,
  GOAL_W: 892 * UU * 2,
  GOAL_H: 642 * UU,
  GOAL_D: 880 * UU,
  CORNER: 1152 * UU
};
ARENA.W = ARENA.HALF_W * 2;
ARENA.L = ARENA.HALF_L * 2;

const RL_PADS = [
  [0,-4240,0],[-1792,-4184,0],[1792,-4184,0],[-3072,-4096,1],[3072,-4096,1],
  [-940,-3308,0],[940,-3308,0],[0,-2816,0],[-3584,-2484,0],[3584,-2484,0],
  [-1788,-2300,0],[1788,-2300,0],[-2048,-1036,0],[0,-1024,0],[2048,-1036,0],
  [-3584,0,1],[-1024,0,0],[1024,0,0],[3584,0,1],
  [-2048,1036,0],[0,1024,0],[2048,1036,0],[-1788,2300,0],[1788,2300,0],
  [-3584,2484,0],[3584,2484,0],[0,2816,0],[-940,3308,0],[940,3308,0],
  [-3072,4096,1],[3072,4096,1],[-1792,4184,0],[1792,4184,0],[0,4240,0]
];

function buildArena(scene) {
  const grp = new THREE.Group();
  const HALF_W = ARENA.HALF_W, HALF_L = ARENA.HALF_L;

  // --- richer pitch: base + mow stripes + subtle sheen ---
  const turfBase = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA.W, ARENA.L),
    new THREE.MeshStandardMaterial({ color: 0x14401f, roughness: 0.92, metalness: 0.05 })
  );
  turfBase.rotation.x = -Math.PI / 2; turfBase.receiveShadow = true; grp.add(turfBase);
  const stripeCount = 16;
  for (let i = 0; i < stripeCount; i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA.W, ARENA.L / stripeCount),
      new THREE.MeshStandardMaterial({ color: i % 2 ? 0x2a7344 : 0x205534, roughness: 0.9, metalness: 0.08 })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, 0.005, -HALF_L + (i + 0.5) * (ARENA.L / stripeCount));
    m.receiveShadow = true; grp.add(m);
  }
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xdfeaff, transparent: true, opacity: 0.22, side: THREE.DoubleSide });
  const halfway = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.W, 0.4), lineMat);
  halfway.rotation.x = -Math.PI / 2; halfway.position.y = 0.02; grp.add(halfway);
  const circle = new THREE.Mesh(new THREE.RingGeometry(9, 9.4, 64), lineMat);
  circle.rotation.x = -Math.PI / 2; circle.position.y = 0.02; grp.add(circle);

  const glassMat = new THREE.MeshStandardMaterial({ color: 0xbfe0ff, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.14, side: THREE.DoubleSide });
  function wallPanel(w, x, z, ry) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, ARENA.WALL_H), glassMat); m.position.set(x, ARENA.WALL_H / 2, z); m.rotation.y = ry; grp.add(m); }
  const cc = ARENA.CORNER;
  wallPanel(ARENA.W - cc * 1.4, 0, -HALF_L, 0);
  wallPanel(ARENA.W - cc * 1.4, 0, HALF_L, 0);
  wallPanel(ARENA.L - cc * 1.4, -HALF_W, 0, Math.PI / 2);
  wallPanel(ARENA.L - cc * 1.4, HALF_W, 0, Math.PI / 2);
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(s => {
    wallPanel(cc * 1.5, s[0] * (HALF_W - cc * 0.42), s[1] * (HALF_L - cc * 0.42), s[0] * s[1] > 0 ? -Math.PI / 4 : Math.PI / 4);
  });

  [-1, 1].forEach(s => {
    const t = new THREE.Mesh(new THREE.BoxGeometry(ARENA.W, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x2f8bff, emissive: 0x2f8bff, emissiveIntensity: 0.6 }));
    t.position.set(0, 0.3, s * HALF_L); grp.add(t);
    const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, ARENA.L), new THREE.MeshStandardMaterial({ color: 0xff8a1a, emissive: 0xff8a1a, emissiveIntensity: 0.4 }));
    t2.position.set(s * HALF_W, 0.3, 0); grp.add(t2);
  });

  function goal(zSign, color) {
    const frameMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, metalness: 0.5, roughness: 0.4 });
    for (let s = -1; s <= 1; s += 2) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, ARENA.GOAL_H, 0.6), frameMat);
      post.position.set(s * ARENA.GOAL_W / 2, ARENA.GOAL_H / 2, zSign * HALF_L); grp.add(post);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(ARENA.GOAL_W + 0.6, 0.6, 0.6), frameMat);
    bar.position.set(0, ARENA.GOAL_H, zSign * HALF_L); grp.add(bar);
    const netMat = new THREE.MeshStandardMaterial({ color: 0x0a0e16, transparent: true, opacity: 0.45, side: THREE.DoubleSide });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.GOAL_W, ARENA.GOAL_H), netMat);
    back.position.set(0, ARENA.GOAL_H / 2, zSign * (HALF_L + ARENA.GOAL_D)); grp.add(back);
    for (let s = -1; s <= 1; s += 2) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.GOAL_D, ARENA.GOAL_H), netMat);
      side.position.set(s * ARENA.GOAL_W / 2, ARENA.GOAL_H / 2, zSign * (HALF_L + ARENA.GOAL_D / 2)); side.rotation.y = Math.PI / 2; grp.add(side);
    }
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.GOAL_W, ARENA.GOAL_D), netMat);
    roof.position.set(0, ARENA.GOAL_H, zSign * (HALF_L + ARENA.GOAL_D / 2)); roof.rotation.x = Math.PI / 2; grp.add(roof);
    const line = new THREE.Mesh(new THREE.BoxGeometry(ARENA.GOAL_W, 0.06, 0.3), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }));
    line.position.set(0, 0.05, zSign * HALF_L); grp.add(line);
  }
  goal(-1, 0xff8a1a);
  goal(1, 0x2f8bff);

  // --- crowd stands with a speckled "people" texture ---
  function crowdTexture() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#0c1018'; g.fillRect(0, 0, 128, 64);
    const cols = ['#ff5a5a', '#5aa0ff', '#ffd23f', '#7affa0', '#ff8a3a', '#c98aff', '#ffffff', '#ff4ab8'];
    for (let i = 0; i < 900; i++) {
      g.fillStyle = cols[(Math.random() * cols.length) | 0];
      g.fillRect((Math.random() * 128) | 0, (Math.random() * 64) | 0, 2, 2);
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(12, 2);
    return t;
  }
  const crowdTex = crowdTexture();
  const standMat = new THREE.MeshStandardMaterial({ map: crowdTex, color: 0xffffff, roughness: 0.95, emissive: 0x222233, emissiveMap: crowdTex, emissiveIntensity: 0.5 });
  for (let t = 0; t < 7; t++) {
    const y = ARENA.WALL_H + 1 + t * 3.6, inset = t * 4.4;
    const longGeo = new THREE.BoxGeometry(ARENA.W + 26 + inset * 2, 3.2, 6.5);
    [HALF_L + 12 + inset, -(HALF_L + 12 + inset)].forEach(z => { const m = new THREE.Mesh(longGeo, standMat); m.position.set(0, y, z); m.rotation.x = z > 0 ? -0.25 : 0.25; grp.add(m); });
    const sideGeo = new THREE.BoxGeometry(6.5, 3.2, ARENA.L + 26 + inset * 2);
    [HALF_W + 12 + inset, -(HALF_W + 12 + inset)].forEach(x => { const m = new THREE.Mesh(sideGeo, standMat); m.position.set(x, y, 0); m.rotation.z = x > 0 ? 0.25 : -0.25; grp.add(m); });
  }

  // --- jumbotron: a four-sided screen hanging above center ---
  const jumbo = new THREE.Group();
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x0a0e16, emissive: 0x2f6bff, emissiveIntensity: 0.6 });
  const frameMat2 = new THREE.MeshStandardMaterial({ color: 0x1a2030, metalness: 0.7, roughness: 0.4 });
  for (let s = 0; s < 4; s++) {
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(16, 9), screenMat);
    const ang = s * Math.PI / 2;
    scr.position.set(Math.sin(ang) * 8.2, 0, Math.cos(ang) * 8.2);
    scr.rotation.y = ang; jumbo.add(scr);
  }
  const jbox = new THREE.Mesh(new THREE.BoxGeometry(17, 11, 17), frameMat2);
  jbox.scale.set(1, 1, 1); jumbo.add(jbox);
  jumbo.position.set(0, ARENA.WALL_H + 16, 0); jumbo.scale.setScalar(0.9); grp.add(jumbo);
  // cables to the jumbotron
  for (let s = 0; s < 4; s++) {
    const ang = s * Math.PI / 2 + Math.PI / 4;
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 30, 6), frameMat2);
    cable.position.set(Math.sin(ang) * 10, ARENA.WALL_H + 30, Math.cos(ang) * 10); grp.add(cable);
  }

  // --- floodlight rigs in the corners ---
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(s => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, ARENA.WALL_H + 30, 8), frameMat2);
    pole.position.set(s[0] * (HALF_W + 14), (ARENA.WALL_H + 30) / 2, s[1] * (HALF_L + 14)); grp.add(pole);
    const rig = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 2), frameMat2);
    rig.position.set(s[0] * (HALF_W + 10), ARENA.WALL_H + 28, s[1] * (HALF_L + 10));
    rig.lookAt(0, 0, 0); grp.add(rig);
    for (let lx = -1; lx <= 1; lx++) for (let ly = 0; ly <= 1; ly++) {
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(1.1, 12), new THREE.MeshBasicMaterial({ color: 0xfffbe0 }));
      lamp.position.set(s[0] * (HALF_W + 9.4), ARENA.WALL_H + 27 + ly * 2, s[1] * (HALF_L + 9.4));
      lamp.lookAt(0, 0, 0); lamp.position.x += lx * 2.6 * (s[1]); grp.add(lamp);
    }
  });

  // --- sky dome with subtle stars ---
  const skyGeo = new THREE.SphereGeometry(700, 24, 16);
  const skyMat = new THREE.MeshBasicMaterial({ color: 0x070b18, side: THREE.BackSide });
  grp.add(new THREE.Mesh(skyGeo, skyMat));
  const starGeo = new THREE.BufferGeometry();
  const starPos = [];
  for (let i = 0; i < 600; i++) {
    const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI / 2.2 + 0.1, r = 650;
    starPos.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r + 40, Math.sin(a) * Math.cos(e) * r);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  grp.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xaaccff, size: 2.2, sizeAttenuation: false })));

  scene.add(grp);
  return grp;
}

function buildBoostPads(scene) {
  const pads = [];
  RL_PADS.forEach(arr => {
    const ux = arr[0], uy = arr[1], big = arr[2];
    const x = ux * UU, z = uy * UU;
    const grp = new THREE.Group(); grp.position.set(x, 0, z);
    if (big) {
      const orb = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.4, 1),
        new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffae20, emissiveIntensity: 1.0, metalness: 0.4, roughness: 0.2 })
      );
      orb.position.y = 2.4; grp.add(orb);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.position.y = 2.4; grp.add(glow);
      // vertical light beam
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.0, 4.8, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = 2.4; grp.add(beam);
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.4, 32),
        new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; grp.add(ring);
      pads.push({ grp, orb, glow, beam, ring, big: true, x, z, cd: 0, max: 10, radius: 208 * UU, baseY: 2.4 });
    } else {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.3, 6),
        new THREE.MeshStandardMaterial({ color: 0xffce3a, emissive: 0xffae20, emissiveIntensity: 0.7, roughness: 0.4, metalness: 0.3 }));
      disc.position.y = 0.15; grp.add(disc);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(1.4, 18),
        new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2; glow.position.y = 0.32; grp.add(glow);
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.35, 18),
        new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.33; grp.add(ring);
      pads.push({ grp, disc, glow, ring, big: false, x, z, cd: 0, max: 5, radius: 144 * UU });
    }
    scene.add(grp);
  });
  return pads;
}

function buildLighting(scene, renderer) {
  const hemi = new THREE.HemisphereLight(0x9ec0ff, 0x1a2233, 1.15);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1.25);
  dir.position.set(50, 110, 40);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  dir.shadow.camera.near = 10; dir.shadow.camera.far = 320;
  dir.shadow.camera.left = -110; dir.shadow.camera.right = 110;
  dir.shadow.camera.top = 130; dir.shadow.camera.bottom = -130;
  dir.shadow.bias = -0.0004;
  scene.add(dir); scene.add(dir.target);
  const fill = new THREE.DirectionalLight(0x88aaff, 0.45);
  fill.position.set(-60, 50, -40); scene.add(fill);
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(s => {
    const pl = new THREE.PointLight(0xffffff, 0.6, 220);
    pl.position.set(s[0] * ARENA.HALF_W, ARENA.WALL_H + 20, s[1] * ARENA.HALF_L); scene.add(pl);
  });
  // environment map for glossy reflections on cars/ball/walls
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(0, '#1a2c5e'); grd.addColorStop(0.45, '#0d1838'); grd.addColorStop(0.5, '#2a7344'); grd.addColorStop(1, '#14401f');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 8; i++) { const x = (i + 0.5) / 8 * 256; const rg = g.createRadialGradient(x, 36, 1, x, 36, 18); rg.addColorStop(0, 'rgba(255,255,255,0.9)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(x - 18, 18, 36, 36); }
    const tex = new THREE.CanvasTexture(c); tex.mapping = THREE.EquirectangularReflectionMapping;
    const envMap = pmrem.fromEquirectangular(tex).texture;
    scene.environment = envMap; tex.dispose();
  } catch (e) { /* env optional */ }
  return { hemi, dir };
}
