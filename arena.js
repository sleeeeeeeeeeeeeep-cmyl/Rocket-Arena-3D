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
  // textured grass turf (procedural noise) instead of a flat colour fill
  function grassTexture() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#1c5a30'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 4000; i++) {
      const v = 0.5 + Math.random() * 0.5;
      g.fillStyle = `rgba(${(40 * v) | 0},${(120 * v) | 0},${(60 * v) | 0},.5)`;
      g.fillRect((Math.random() * 128) | 0, (Math.random() * 128) | 0, 1, 2);
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(20, 26);
    return t;
  }
  const grassTex = grassTexture();
  const turfBase = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA.W, ARENA.L),
    new THREE.MeshStandardMaterial({ color: 0x2a6a3a, roughness: 0.88, metalness: 0.04, map: grassTex })
  );
  turfBase.rotation.x = -Math.PI / 2; turfBase.receiveShadow = true; turfBase.userData.turf = true; grp.add(turfBase);
  const stripeCount = 16;
  for (let i = 0; i < stripeCount; i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA.W, ARENA.L / stripeCount),
      new THREE.MeshStandardMaterial({ color: i % 2 ? 0x2a7344 : 0x205534, roughness: 0.9, metalness: 0.08, transparent: true, opacity: 0.45 })
    );
    m.rotation.x = -Math.PI / 2;
    m.userData.turf = true; m.userData.stripe = i % 2;
    m.position.set(0, 0.005, -HALF_L + (i + 0.5) * (ARENA.L / stripeCount));
    m.receiveShadow = true; grp.add(m);
  }
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  const halfway = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.W, 0.7), lineMat);
  halfway.rotation.x = -Math.PI / 2; halfway.position.y = 0.02; grp.add(halfway);
  const circle = new THREE.Mesh(new THREE.RingGeometry(9, 9.6, 64), lineMat);
  circle.rotation.x = -Math.PI / 2; circle.position.y = 0.02; grp.add(circle);
  // boundary outline + goal-area boxes
  const boundary = new THREE.Mesh(new THREE.RingGeometry(0, 1, 4), lineMat); // placeholder, replaced below
  grp.remove(boundary);
  [-1, 1].forEach(s => {
    const goalBox = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.GOAL_W + 14, 0.5), lineMat);
    goalBox.rotation.x = -Math.PI / 2; goalBox.position.set(0, 0.02, s * (HALF_L - 16)); grp.add(goalBox);
    for (let x = -1; x <= 1; x += 2) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 16), lineMat);
      side.rotation.x = -Math.PI / 2; side.position.set(x * (ARENA.GOAL_W + 14) / 2, 0.02, s * (HALF_L - 8)); grp.add(side);
    }
  });

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
    t.userData.accent = true;
    t.position.set(0, 0.3, s * HALF_L); grp.add(t);
    const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, ARENA.L), new THREE.MeshStandardMaterial({ color: 0xff8a1a, emissive: 0xff8a1a, emissiveIntensity: 0.4 }));
    t2.userData.accent = true;
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
  const standMat = new THREE.MeshStandardMaterial({ color: 0x0e1420, roughness: 0.95 });
  for (let t = 0; t < 7; t++) {
    const y = ARENA.WALL_H + 1 + t * 3.6, inset = t * 4.4;
    const longGeo = new THREE.BoxGeometry(ARENA.W + 26 + inset * 2, 3.2, 6.5);
    [HALF_L + 12 + inset, -(HALF_L + 12 + inset)].forEach(z => { const m = new THREE.Mesh(longGeo, standMat); m.position.set(0, y, z); m.rotation.x = z > 0 ? -0.25 : 0.25; grp.add(m); });
    const sideGeo = new THREE.BoxGeometry(6.5, 3.2, ARENA.L + 26 + inset * 2);
    [HALF_W + 12 + inset, -(HALF_W + 12 + inset)].forEach(x => { const m = new THREE.Mesh(sideGeo, standMat); m.position.set(x, y, 0); m.rotation.z = x > 0 ? 0.25 : -0.25; grp.add(m); });
  }
  // dense vertex-coloured crowd (ported from the original game) — thousands of "people"
  (function buildCrowdPoints() {
    const tiers = 14, perTier = 620, pts = [], cols = [];
    for (let t = 0; t < tiers; t++) {
      const rx = HALF_W + 14 + t * 4.0, rz = HALF_L + 14 + t * 4.0, y = ARENA.WALL_H + 2 + t * 3.4;
      for (let i = 0; i < perTier; i++) {
        const ang = Math.random() * Math.PI * 2;
        pts.push(Math.cos(ang) * rx * (0.97 + Math.random() * 0.06), y + (Math.random() - 0.5) * 2.2, Math.sin(ang) * rz * (0.97 + Math.random() * 0.06));
        const v = 0.7 + Math.random() * 0.3; cols.push(v, v, v);   // recoloured per-theme by the game
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const crowdPts = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.8, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.92 }));
    grp.add(crowdPts);
    grp.userData.crowdPts = crowdPts;
  })();

  // --- jumbotron: a four-sided screen hanging above center ---
  const jumbo = new THREE.Group();
  // live screen: a canvas texture the game redraws with the real score + clock
  const jc = document.createElement('canvas'); jc.width = 512; jc.height = 288;
  const jctx = jc.getContext('2d');
  jctx.fillStyle = '#0a0e16'; jctx.fillRect(0, 0, 512, 288);
  const jtex = new THREE.CanvasTexture(jc);
  const screenMat = new THREE.MeshBasicMaterial({ map: jtex });
  grp.userData.jumbo = { canvas: jc, ctx: jctx, tex: jtex };
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

  // --- glowing LED strip running the full perimeter at ground level ---
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x3fa0ff, transparent: true, opacity: 0.85 });
  const ledGroup = new THREE.Group(); ledGroup.userData.led = true;
  [[ARENA.W, 0, -HALF_L, 0], [ARENA.W, 0, HALF_L, 0], [ARENA.L, -HALF_W, 0, Math.PI / 2], [ARENA.L, HALF_W, 0, Math.PI / 2]].forEach(d => {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(d[0], 0.25, 0.25), ledMat);
    strip.position.set(d[1], 0.5, d[2]); strip.rotation.y = d[3]; ledGroup.add(strip);
  });
  grp.add(ledGroup);

  // --- pulsing center circle glow ---
  const centerGlow = new THREE.Mesh(new THREE.RingGeometry(8.4, 9.6, 64),
    new THREE.MeshBasicMaterial({ color: 0x6fd0ff, transparent: true, opacity: 0.4, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  centerGlow.rotation.x = -Math.PI / 2; centerGlow.position.y = 0.03; centerGlow.userData.pulse = true; grp.add(centerGlow);

  // --- corner accent pylons with emissive caps ---
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(s => {
    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, ARENA.WALL_H, 8),
      new THREE.MeshStandardMaterial({ color: 0x2f8bff, emissive: 0x2f8bff, emissiveIntensity: 0.6 }));
    pylon.userData.accent = true;
    pylon.position.set(s[0] * (HALF_W - 1), ARENA.WALL_H / 2, s[1] * (HALF_L - 1)); grp.add(pylon);
  });

  // store animatable bits for the game loop
  grp.userData.animated = { led: ledGroup, center: centerGlow };

  // --- glowing light panels along both side walls (old-game style) ---
  for (let i = 0; i < 8; i++) {
    const px = -HALF_W * 0.78 + (i / 7) * ARENA.W * 0.78;
    [-1, 1].forEach(sz => {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.6),
        new THREE.MeshStandardMaterial({ color: 0x2f8bff, emissive: 0x2f8bff, emissiveIntensity: 0.9, side: THREE.DoubleSide }));
      panel.position.set(px, ARENA.WALL_H * 0.35, sz * (HALF_L - 0.4));
      panel.userData.accent = true; grp.add(panel);
    });
    if (i < 6) {
      const pz = -HALF_L * 0.7 + (i / 5) * ARENA.L * 0.7;
      [-1, 1].forEach(sx => {
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.6),
          new THREE.MeshStandardMaterial({ color: 0x2f8bff, emissive: 0x2f8bff, emissiveIntensity: 0.9, side: THREE.DoubleSide }));
        panel.position.set(sx * (HALF_W - 0.4), ARENA.WALL_H * 0.35, pz);
        panel.rotation.y = Math.PI / 2;
        panel.userData.accent = true; grp.add(panel);
      });
    }
  }
  // --- roof trusses spanning the arena ---
  const trussMat = new THREE.MeshStandardMaterial({ color: 0x2a3244, metalness: 0.7, roughness: 0.5 });
  for (let i = 0; i < 5; i++) {
    const tz = -HALF_L * 0.8 + (i / 4) * ARENA.L * 0.8;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(ARENA.W + 20, 1.2, 1.2), trussMat);
    beam.position.set(0, ARENA.WALL_H + 12, tz); grp.add(beam);
    for (let k = -2; k <= 2; k++) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6, 0.6), trussMat);
      strut.position.set(k * ARENA.W * 0.22, ARENA.WALL_H + 9, tz); grp.add(strut);
    }
  }

  // --- goal nets: line grid across the back and sides of each goal mouth ---
  const netMat = new THREE.LineBasicMaterial({ color: 0xcfd8e8, transparent: true, opacity: 0.35 });
  [-1, 1].forEach(zSign => {
    const gw = ARENA.GOAL_W, gh = ARENA.GOAL_H, gd = ARENA.GOAL_D;
    const backZ = zSign * (HALF_L + gd);
    const verts = [];
    const nx = 10, ny = 6;
    for (let i = 0; i <= nx; i++) {   // vertical strands, back plane
      const x = -gw / 2 + (i / nx) * gw;
      verts.push(x, 0, backZ, x, gh, backZ);
    }
    for (let j = 0; j <= ny; j++) {   // horizontal strands, back plane
      const y = (j / ny) * gh;
      verts.push(-gw / 2, y, backZ, gw / 2, y, backZ);
      // side panels: strands running from goal mouth to back
      verts.push(-gw / 2, y, zSign * HALF_L, -gw / 2, y, backZ);
      verts.push(gw / 2, y, zSign * HALF_L, gw / 2, y, backZ);
    }
    for (let i = 0; i <= 6; i++) {    // roof strands
      const x = -gw / 2 + (i / 6) * gw;
      verts.push(x, gh, zSign * HALF_L, x, gh, backZ);
    }
    const netGeo = new THREE.BufferGeometry();
    netGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    grp.add(new THREE.LineSegments(netGeo, netMat));
  });

  // --- floodlight beam cones (soft additive volumetric look) ---
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff6d0, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(s => {
    const beam = new THREE.Mesh(new THREE.ConeGeometry(16, ARENA.WALL_H + 26, 20, 1, true), beamMat);
    const topX = s[0] * (HALF_W + 9), topY = ARENA.WALL_H + 27, topZ = s[1] * (HALF_L + 9);
    // aim the cone from the rig down toward the field centre
    beam.position.set(topX * 0.55, topY / 2, topZ * 0.55);
    beam.lookAt(topX, topY, topZ);
    beam.rotateX(-Math.PI / 2);
    grp.add(beam);
  });

  // --- sky gradient dome (retinted per theme by the game) ---
  const domeGeo = new THREE.SphereGeometry(680, 24, 16);
  const domeMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.userData.skyDome = true;
  grp.add(dome);
  grp.userData.skyDome = dome;

  // --- ambient-occlusion strip where walls meet the floor (depth cue) ---
  (function aoStrips() {
    const c = document.createElement('canvas'); c.width = 4; c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 64);
    const aoTex = new THREE.CanvasTexture(c);
    const aoMat = new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false });
    [[ARENA.W, 0, -HALF_L + 2.5, 0], [ARENA.W, 0, HALF_L - 2.5, Math.PI], [ARENA.L, -HALF_W + 2.5, 0, -Math.PI / 2], [ARENA.L, HALF_W - 2.5, 0, Math.PI / 2]].forEach(d => {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(d[0], 5), aoMat); strip.renderOrder = 1;
      strip.rotation.x = -Math.PI / 2; strip.rotation.z = d[3];
      strip.position.set(d[1], 0.06, d[2]);
      grp.add(strip);
    });
  })();

  // --- hanging team banners in the stands behind each goal ---
  (function banners() {
    const mk = (col1, col2) => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = col1; g.fillRect(0, 0, 64, 128);
      g.fillStyle = col2; g.fillRect(0, 96, 64, 32);
      g.beginPath(); g.moveTo(0, 128); g.lineTo(32, 108); g.lineTo(64, 128); g.closePath();
      g.globalCompositeOperation = 'destination-out'; g.fill(); g.globalCompositeOperation = 'source-over';
      g.fillStyle = 'rgba(255,255,255,.9)'; g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.fillText('★', 32, 62);
      const t = new THREE.CanvasTexture(c);
      return new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide });
    };
    const blueB = mk('#1f63d6', '#12408f'), orangeB = mk('#e07414', '#9a4d0a');
    for (let i = -2; i <= 2; i++) {
      const b1 = new THREE.Mesh(new THREE.PlaneGeometry(5, 10), blueB);
      b1.position.set(i * 14, ARENA.WALL_H + 12, HALF_L + 11); grp.add(b1);
      const b2 = new THREE.Mesh(new THREE.PlaneGeometry(5, 10), orangeB);
      b2.position.set(i * 14, ARENA.WALL_H + 12, -(HALF_L + 11)); b2.rotation.y = Math.PI; grp.add(b2);
    }
  })();

  // --- glowing arch over each goal mouth ---
  [-1, 1].forEach(zs => {
    const arch = new THREE.Mesh(new THREE.TorusGeometry(ARENA.GOAL_W * 0.62, 0.35, 10, 40, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x2f8bff, emissive: 0x2f8bff, emissiveIntensity: 1.1 }));
    arch.position.set(0, 0.2, zs * HALF_L); arch.userData.accent = true;
    grp.add(arch);
  });

  // --- centre-field logo decal ---
  (function centerLogo() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 10;
    g.beginPath(); g.arc(128, 128, 96, 0, Math.PI * 2); g.stroke();
    g.font = '900 110px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,255,255,.9)'; g.fillText('RA', 128, 136);
    const t = new THREE.CanvasTexture(c);
    const logo = new THREE.Mesh(new THREE.CircleGeometry(7.5, 40),
      new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.5, depthWrite: false }));
    logo.rotation.x = -Math.PI / 2; logo.rotation.z = Math.PI / 2;
    logo.position.y = 0.04; grp.add(logo);
  })();

  // --- rotating spotlight sweeps from the roof (animated by the game loop) ---
  const sweepGrp = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const pivot = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.ConeGeometry(9, ARENA.WALL_H + 20, 18, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xbfdcff, transparent: true, opacity: 0.055, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = -(ARENA.WALL_H + 20) / 2;
    beam.rotation.x = Math.PI;
    const arm = new THREE.Group();
    arm.rotation.z = 0.5;             // beam leans outward, pivot spins it around
    arm.add(beam);
    pivot.add(arm);
    pivot.position.set(0, ARENA.WALL_H + 22, i === 0 ? -HALF_L * 0.4 : HALF_L * 0.4);
    pivot.userData.sweepSpeed = i === 0 ? 0.5 : -0.38;
    sweepGrp.add(pivot);
  }
  grp.add(sweepGrp);
  grp.userData.sweeps = sweepGrp;

  // --- glowing trim ring along the top edge of all four walls ---
  const topTrimMat = new THREE.MeshStandardMaterial({ color: 0x2f8bff, emissive: 0x2f8bff, emissiveIntensity: 0.9 });
  [[ARENA.W + 1, 0, -HALF_L, 0], [ARENA.W + 1, 0, HALF_L, 0], [ARENA.L + 1, -HALF_W, 0, Math.PI / 2], [ARENA.L + 1, HALF_W, 0, Math.PI / 2]].forEach(d => {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(d[0], 0.45, 0.45), topTrimMat);
    trim.position.set(d[1], ARENA.WALL_H, d[2]); trim.rotation.y = d[3];
    trim.userData.accent = true; grp.add(trim);
  });

  // --- canopy ring hovering above the stands ---
  const canopy = new THREE.Mesh(new THREE.RingGeometry(HALF_W + 16, HALF_W + 66, 40),
    new THREE.MeshStandardMaterial({ color: 0x10141c, roughness: 0.9, side: THREE.DoubleSide }));
  canopy.rotation.x = -Math.PI / 2;
  canopy.position.y = ARENA.WALL_H + 26;
  canopy.scale.set(1, (HALF_L + 40) / (HALF_W + 40), 1);
  grp.add(canopy);

  // --- accent chevron banners on the interior walls ---
  (function chevrons() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const g = c.getContext('2d');
    g.strokeStyle = '#2f8bff'; g.lineWidth = 10;
    for (let i = -1; i < 4; i++) { g.beginPath(); g.moveTo(i * 40, 64); g.lineTo(i * 40 + 32, 8); g.lineTo(i * 40 + 64, 64); g.stroke(); }
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: 0.5, emissive: 0x2f8bff, emissiveMap: tex, emissiveIntensity: 0.5, side: THREE.DoubleSide });
    [[0, -HALF_L + 0.6, 0], [0, HALF_L - 0.6, Math.PI]].forEach(d => {
      const band = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.W * 0.55, 3.2), mat);
      band.position.set(d[0], ARENA.WALL_H * 0.62, d[1]); band.rotation.y = d[2];
      band.userData.accent = true; grp.add(band);
    });
    [[-HALF_W + 0.6, Math.PI / 2], [HALF_W - 0.6, -Math.PI / 2]].forEach(d => {
      const band = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.L * 0.55, 3.2), mat.clone());
      band.material.userData = {};
      band.position.set(d[0], ARENA.WALL_H * 0.62, 0); band.rotation.y = d[1];
      band.userData.accent = true; grp.add(band);
    });
  })();

  // --- soft interior glow inside each goal mouth ---
  [-1, 1].forEach(zs => {
    const glowBox = new THREE.Mesh(new THREE.BoxGeometry(ARENA.GOAL_W, ARENA.GOAL_H, ARENA.GOAL_D),
      new THREE.MeshBasicMaterial({ color: 0x9ecbff, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false }));
    glowBox.position.set(0, ARENA.GOAL_H / 2, zs * (HALF_L + ARENA.GOAL_D / 2));
    grp.add(glowBox);
  });

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
      // hex boost crystal: 6-sided prism with tapered caps + white-hot core
      const crysMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffae20, emissiveIntensity: 1.2, metalness: 0.5, roughness: 0.15, transparent: true, opacity: 0.92 });
      const orb = new THREE.Group();
      const prism = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 1.6, 6), crysMat);
      const capT = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.8, 6), crysMat); capT.position.y = 1.2;
      const capB = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.8, 6), crysMat); capB.rotation.x = Math.PI; capB.position.y = -1.2;
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.45),
        new THREE.MeshBasicMaterial({ color: 0xfff6d0, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.95, depthWrite: false }));
      orb.add(prism, capT, capB, core);
      orb.position.y = 2.6; grp.add(orb);
      // three sparks orbiting the crystal
      const sparks = [];
      for (let sp = 0; sp < 3; sp++) {
        const spark = new THREE.Mesh(new THREE.OctahedronGeometry(0.16),
          new THREE.MeshBasicMaterial({ color: 0xfff0b0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
        grp.add(spark); sparks.push(spark);
      }
      const glow = new THREE.Mesh(new THREE.SphereGeometry(2.3, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.position.y = 2.6; grp.add(glow);
      // light beam that fades toward the top (gradient canvas)
      const bc = document.createElement('canvas'); bc.width = 4; bc.height = 64;
      const bg = bc.getContext('2d');
      const bgr = bg.createLinearGradient(0, 0, 0, 64);
      bgr.addColorStop(0, 'rgba(255,210,63,0)'); bgr.addColorStop(1, 'rgba(255,210,63,0.5)');
      bg.fillStyle = bgr; bg.fillRect(0, 0, 4, 64);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.1, 5.4, 12, 1, true),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(bc), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = 2.7; grp.add(beam);
      // solid inner ring + thin outer ring that spins
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.2, 32),
        new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; grp.add(ring);
      const ring2 = new THREE.Mesh(new THREE.RingGeometry(2.5, 2.72, 6),
        new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
      ring2.rotation.x = -Math.PI / 2; ring2.position.y = 0.07; grp.add(ring2);
      pads.push({ grp, orb, glow, beam, ring, ring2, sparks, big: true, x, z, cd: 0, max: 10, radius: 208 * UU, baseY: 2.6, pop: 0, wasReady: true });
    } else {
      // small pad: floating spinning diamond over a glowing base
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.55),
        new THREE.MeshStandardMaterial({ color: 0xffce3a, emissive: 0xffae20, emissiveIntensity: 1.0, metalness: 0.4, roughness: 0.2 }));
      gem.position.y = 0.85; grp.add(gem);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.14, 12),
        new THREE.MeshStandardMaterial({ color: 0x3a3226, emissive: 0xffae20, emissiveIntensity: 0.25, roughness: 0.6, metalness: 0.4 }));
      base.position.y = 0.07; grp.add(base);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(1.3, 18),
        new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2; glow.position.y = 0.3; grp.add(glow);
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.3, 18),
        new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.31; grp.add(ring);
      pads.push({ grp, disc: gem, gem, glow, ring, big: false, x, z, cd: 0, max: 5, radius: 144 * UU, pop: 0, wasReady: true });
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
