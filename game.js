  /* game.js — scene, physics, controls, ball, AI, and the main loop. */
(function () {
  const V3 = THREE.Vector3;
  let scene, camera, renderer, clock;
  let player, opponent, ball;
  let allCars = [], blueCars = [], orangeCars = [];
  let teamSize = 1;
  let arenaGrp, lights, pads;
  const keys = {};
  let state = 'menu';
  let score = { blue: 0, orange: 0 };

  // --- economy / save profile ---
  const SAVE_KEY = 'rocketArena3D_save_v1';
  // prices: car id -> credits (0 = free/unlocked by default); decal id -> credits
  const CAR_PRICES = { car1: 0, car2: 0, car3: 0, car4: 800, car5: 800, car6: 1200, car7: 1200, car8: 1800, car9: 2500 };
  const DECAL_PRICES = { none: 0, stripes: 0, flames: 300, carbon: 500, hex: 500, camo: 900 };
  let profile = { credits: 0, cars: ['car1','car2','car3'], decals: ['none','stripes'], stats: { wins: 0, goals: 0, demos: 0, matches: 0 } };
  function loadProfile() {
    try { const raw = localStorage.getItem(SAVE_KEY); if (raw) { const p = JSON.parse(raw); profile = Object.assign(profile, p); profile.stats = Object.assign({ wins:0,goals:0,demos:0,matches:0 }, p.stats||{}); } } catch (e) {}
  }
  function saveProfile() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(profile)); } catch (e) {} }
  function ownsCar(id) { return (CAR_PRICES[id] || 0) === 0 || profile.cars.indexOf(id) >= 0; }
  function ownsDecal(id) { return (DECAL_PRICES[id] || 0) === 0 || profile.decals.indexOf(id) >= 0; }

  let matchTime = 300, matchLen = 300, chosenCarId = 'car1', chosenMutator = 'none', playerColor = 0xffffff;
  let chosenDecal = 'none', chosenArena = 'night';
  const DECALS = [
    { id: 'none', name: 'None' },
    { id: 'stripes', name: 'Stripes' },
    { id: 'flames', name: 'Flames' },
    { id: 'carbon', name: 'Carbon' },
    { id: 'hex', name: 'Hex' },
    { id: 'camo', name: 'Camo' }
  ];
  const ARENA_THEMES = [
    { id: 'night', name: 'Midnight', sky: 0x0a1228, turf: 0x2a7a44, fog: 0x0a1228 },
    { id: 'sunset', name: 'Sunset', sky: 0x3a1a40, turf: 0x357a46, fog: 0x3a1a40 },
    { id: 'ice', name: 'Ice', sky: 0x12304a, turf: 0x3a7a9a, fog: 0x12304a },
    { id: 'neon', name: 'Neon', sky: 0x12082a, turf: 0x6a3aff, fog: 0x12082a },
    { id: 'day', name: 'Day', sky: 0x7ab0e0, turf: 0x3a9a4e, fog: 0x9ec0e0 }
  ];
  const MUTATORS = {
    none:    { name: 'Normal',     grav: 1,    ballGrav: 1,    ballScale: 1,   boost: 1 },
    lowgrav: { name: 'Low Gravity',grav: 0.45, ballGrav: 0.45, ballScale: 1,   boost: 1 },
    giant:   { name: 'Giant Ball', grav: 1,    ballGrav: 1,    ballScale: 2.0, boost: 1 },
    speed:   { name: 'Speed Demon',grav: 1,    ballGrav: 1,    ballScale: 1,   boost: 1.4 },
    beach:   { name: 'Beach Ball', grav: 1,    ballGrav: 0.5,  ballScale: 1.6, boost: 1 }
  };
  let mut = MUTATORS.none;
  let camYaw = 0, camPitch = 0.32, dragging = false, lastX = 0, lastY = 0, ballCam = false;

  // physics constants
  const FIELD = ARENA, HALF_W = ARENA.W / 2, HALF_L = ARENA.L / 2;
  const CAR_REST_Y = 0, MAX_SPEED = 42, MAX_BOOST = 68, ACCEL = 70, REVERSE = 38;
  const STEER = 3.4, GRIP = 12, GRAVITY = 55, JUMP_V = 22, BOOST_ACCEL = 60, BOOST_USE = 33;
  const MAX_BOOSTAMT = 100, START_BOOST = 33; // RL-style 0..100 boost meter
  const BALL_R = 2.2, CAR_R = 2.4;

  const DOM = id => document.getElementById(id);

  function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05080f);
    scene.fog = new THREE.Fog(0x05080f, 320, 900);

    camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.5, 1200);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (THREE.ACESFilmicToneMapping) renderer.toneMapping = THREE.ACESFilmicToneMapping;
    if (THREE.sRGBEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMappingExposure = 1.1;
    DOM('app').appendChild(renderer.domElement);

    arenaGrp = buildArena(scene);
    lights = buildLighting(scene, renderer);
    pads = buildBoostPads(scene);

    // ball — clean white sphere with a subtle hex pattern (Rocket-League style)
    const ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R, 40, 28),
      new THREE.MeshStandardMaterial({ color: 0xf2f5fa, metalness: 0.25, roughness: 0.4, envMapIntensity: 1.2, map: makeBallTexture() })
    );
    ballMesh.castShadow = true; scene.add(ballMesh);
    ball = { mesh: ballMesh, pos: new V3(0, BALL_R, 0), vel: new V3(), radius: BALL_R };

    clock = new THREE.Clock();
    loadProfile();
    buildMenu();
    DOM('loading').classList.add('hide');
    DOM('menu').classList.remove('hide');

    addEventListener('resize', onResize);
    addEventListener('keydown', e => { keys[e.code] = true; if (['Space','ArrowUp','ArrowDown'].includes(e.code)) e.preventDefault();
      if (e.code === 'Space' && state === 'play') jump(player);
      if (e.code === 'KeyC') ballCam = !ballCam;
      if ((e.code === 'Enter' || e.code === 'Escape') && state === 'replay') endReplay();
      if (e.code === 'KeyF' && player && player.group) { player.modelFlip = !player.modelFlip; player.group.children.forEach(ch => { ch.rotation.y = player.modelFlip ? Math.PI : 0; }); } });
    const skipBtn = DOM('skipReplay'); if (skipBtn) skipBtn.onclick = () => { if (state === 'replay') endReplay(); };
    addEventListener('keyup', e => { keys[e.code] = false; });
    // mouse-drag orbit
    renderer.domElement.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
    addEventListener('pointerup', () => dragging = false);
    addEventListener('pointermove', e => { if (!dragging) return; camYaw -= (e.clientX - lastX) * 0.005; camPitch = Math.max(0.05, Math.min(1.2, camPitch + (e.clientY - lastY) * 0.004)); lastX = e.clientX; lastY = e.clientY; });

    animate();
  }

  function buildMenu() {
    const pick = DOM('pick'); pick.innerHTML = '';
    CAR_CATALOG.forEach(c => {
      const b = document.createElement('button');
      const owned = ownsCar(c.id);
      b.className = 'carbtn' + (c.id === chosenCarId ? ' on' : '') + (owned ? '' : ' locked');
      b.innerHTML = c.name + (owned ? '' : ' <span class="price">◉' + CAR_PRICES[c.id] + '</span>');
      b.onclick = () => {
        if (ownsCar(c.id)) { chosenCarId = c.id; }
        else if (profile.credits >= CAR_PRICES[c.id]) { profile.credits -= CAR_PRICES[c.id]; profile.cars.push(c.id); saveProfile(); chosenCarId = c.id; }
        else { flashCredits(); return; }
        buildMenu(); refreshPreview();
      };
      pick.appendChild(b);
    });
    DOM('play').onclick = startMatch;
    updateCreditsUI();
    const ms = DOM('menuStats');
    if (ms) ms.innerHTML = '<span style="color:#ffd23f">◉ ' + profile.credits + '</span>  ·  ' +
      profile.stats.wins + ' wins  ·  ' + profile.stats.goals + ' goals  ·  ' + profile.stats.demos + ' demos';
    const gb = DOM('garageBtn'); if (gb) gb.onclick = openGarage;
    const gback = DOM('garageBack'); if (gback) gback.onclick = closeGarage;
    // music: start on first interaction, toggle with mute button
    var music = DOM('bgMusic'), muted = false;
    function kickMusic() { if (!muted) { var p = music.play(); if (p && p.catch) p.catch(function(){}); } }
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, kickMusic, { once: false }));
    var mb = DOM('muteBtn');
    if (mb) mb.onclick = function (e) { e.stopPropagation(); muted = !muted; mb.textContent = muted ? '🔇' : '🔊'; if (muted) music.pause(); else kickMusic(); };
    const mp = DOM('mutpick'); mp.innerHTML = '';
    Object.keys(MUTATORS).forEach(k => {
      const b = document.createElement('button');
      b.className = 'carbtn' + (k === chosenMutator ? ' on' : '');
      b.textContent = MUTATORS[k].name;
      b.onclick = () => { chosenMutator = k; [...mp.children].forEach(x => x.classList.remove('on')); b.classList.add('on'); };
      mp.appendChild(b);
    });
    const tp = DOM('teampick'); if (tp) { tp.innerHTML = '';
      [1,2,3,4,5].forEach(n => {
        const b = document.createElement('button');
        b.className = 'carbtn' + (n === teamSize ? ' on' : '');
        b.textContent = n + 'v' + n;
        b.onclick = () => { teamSize = n; [...tp.children].forEach(x => x.classList.remove('on')); b.classList.add('on'); };
        tp.appendChild(b);
      });
    }
    const lp = DOM('lenpick'); if (lp) { lp.innerHTML = '';
      [['1 min',60],['3 min',180],['5 min',300],['10 min',600]].forEach(opt => {
        const b = document.createElement('button');
        b.className = 'carbtn' + (opt[1] === matchLen ? ' on' : '');
        b.textContent = opt[0];
        b.onclick = () => { matchLen = opt[1]; [...lp.children].forEach(x => x.classList.remove('on')); b.classList.add('on'); };
        lp.appendChild(b);
      });
    }
    const cpk = DOM('colorpick'); if (cpk) { cpk.innerHTML = '';
      const colors = [0xffffff, 0x2f8bff, 0xff3b3b, 0x2bd34a, 0xffd23f, 0xff8a1a, 0xb84aff, 0xff4ab8, 0x00e5d0, 0x101725];
      colors.forEach(col => {
        const b = document.createElement('button');
        b.className = 'carbtn' + (col === playerColor ? ' on' : '');
        b.style.background = '#' + col.toString(16).padStart(6, '0');
        b.style.width = '34px'; b.style.height = '34px'; b.style.padding = '0';
        b.onclick = () => { playerColor = col; [...cpk.children].forEach(x => x.classList.remove('on')); b.classList.add('on'); refreshPreview(); };
        cpk.appendChild(b);
      });
    }
    const dpk = DOM('decalpick'); if (dpk) { dpk.innerHTML = '';
      DECALS.forEach(dc => {
        const b = document.createElement('button');
        const owned = ownsDecal(dc.id);
        b.className = 'carbtn' + (dc.id === chosenDecal ? ' on' : '') + (owned ? '' : ' locked');
        b.innerHTML = dc.name + (owned ? '' : ' <span class="price">◉' + DECAL_PRICES[dc.id] + '</span>');
        b.onclick = () => {
          if (ownsDecal(dc.id)) { chosenDecal = dc.id; }
          else if (profile.credits >= DECAL_PRICES[dc.id]) { profile.credits -= DECAL_PRICES[dc.id]; profile.decals.push(dc.id); saveProfile(); chosenDecal = dc.id; }
          else { flashCredits(); return; }
          buildMenu(); refreshPreview();
        };
        dpk.appendChild(b);
      });
    }
    const apk = DOM('arenapick'); if (apk) { apk.innerHTML = '';
      ARENA_THEMES.forEach(th => {
        const b = document.createElement('button');
        b.className = 'carbtn' + (th.id === chosenArena ? ' on' : '');
        b.textContent = th.name;
        b.onclick = () => { chosenArena = th.id; [...apk.children].forEach(x => x.classList.remove('on')); b.classList.add('on'); };
        apk.appendChild(b);
      });
    }
  }

  // --- GARAGE with live 3D car preview ---
  let pvRenderer, pvScene, pvCamera, pvCar, pvRAF = 0, pvLoadToken = 0;
  function initPreview() {
    if (pvRenderer) return;
    const cv = DOM('previewCanvas'); if (!cv) return;
    pvRenderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
    pvRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    if (THREE.sRGBEncoding !== undefined) pvRenderer.outputEncoding = THREE.sRGBEncoding;
    pvScene = new THREE.Scene();
    pvCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    pvCamera.position.set(7, 4, 9);
    pvCamera.lookAt(0, 0.6, 0);
    pvScene.add(new THREE.HemisphereLight(0xcfe0ff, 0x202838, 1.2));
    const d = new THREE.DirectionalLight(0xffffff, 1.4); d.position.set(5, 8, 6); pvScene.add(d);
    const d2 = new THREE.DirectionalLight(0x88aaff, 0.5); d2.position.set(-6, 3, -4); pvScene.add(d2);
    // turntable disc
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.3, 40),
      new THREE.MeshStandardMaterial({ color: 0x1a2236, metalness: 0.4, roughness: 0.5 }));
    disc.position.y = -0.15; pvScene.add(disc);
  }
  function sizePreview() {
    const cv = DOM('previewCanvas'); if (!cv || !pvRenderer) return;
    const w = cv.clientWidth || 400, h = cv.clientHeight || 300;
    pvRenderer.setSize(w, h, false); pvCamera.aspect = w / h; pvCamera.updateProjectionMatrix();
  }
  async function loadPreviewCar() {
    const token = ++pvLoadToken;
    const entry = CAR_CATALOG.find(c => c.id === chosenCarId) || CAR_CATALOG[0];
    const nameEl = DOM('previewName'); if (nameEl) nameEl.textContent = entry.name;
    const grp = await loadCar(entry, 0x2f8bff, 0x9ed1ff);
    if (token !== pvLoadToken) return; // a newer selection superseded this load
    if (pvCar) { pvScene.remove(pvCar); }
    styleCar(grp, playerColor, chosenDecal);
    pvCar = grp; pvScene.add(pvCar);
  }
  function pvAnimate() {
    pvRAF = requestAnimationFrame(pvAnimate);
    if (pvCar) pvCar.rotation.y += 0.012;
    if (pvRenderer) pvRenderer.render(pvScene, pvCamera);
  }
  function openGarage() {
    DOM('menu').classList.add('hide');
    DOM('garage').classList.remove('hide');
    initPreview(); sizePreview(); loadPreviewCar();
    if (!pvRAF) pvAnimate();
  }
  function closeGarage() {
    DOM('garage').classList.add('hide');
    DOM('menu').classList.remove('hide');
    if (pvRAF) { cancelAnimationFrame(pvRAF); pvRAF = 0; }
  }
  function refreshPreview() { if (!DOM('garage').classList.contains('hide')) { sizePreview(); loadPreviewCar(); } }

  function flashCredits() {
    const c = DOM('credits'); if (!c) return;
    c.style.transition = 'none'; c.style.color = '#ff5a5a';
    setTimeout(() => { c.style.transition = 'color .4s'; c.style.color = '#ffd23f'; }, 60);
  }
  function updateCreditsUI() { const c = DOM('credits'); if (c) c.textContent = '◉ ' + profile.credits; }

  function makeBallTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#eef2f8'; g.fillRect(0, 0, 256, 256);
    // hex grid
    g.strokeStyle = 'rgba(80,110,160,.35)'; g.lineWidth = 2;
    const R = 20, h = R * Math.sqrt(3);
    for (let row = -1; row < 9; row++) for (let col = -1; col < 9; col++) {
      const hx = col * R * 1.5, hy = row * h + (col % 2 ? h / 2 : 0);
      g.beginPath();
      for (let a = 0; a < 6; a++) { const ang = Math.PI / 3 * a, px = hx + R * Math.cos(ang), py = hy + R * Math.sin(ang); a === 0 ? g.moveTo(px, py) : g.lineTo(px, py); }
      g.closePath(); g.stroke();
    }
    // a couple of accent panels
    g.fillStyle = 'rgba(47,139,255,.12)';
    for (let i = 0; i < 6; i++) { g.beginPath(); g.arc((i * 47) % 256, (i * 83) % 256, 16, 0, Math.PI * 2); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 1);
    if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function makeDecalTexture(decalId, baseColor) {
    if (!decalId || decalId === 'none') return null;
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    const hex = '#' + (baseColor >>> 0 & 0xffffff).toString(16).padStart(6, '0');
    g.fillStyle = hex; g.fillRect(0, 0, 256, 256);
    if (decalId === 'stripes') { g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(104, 0, 18, 256); g.fillRect(134, 0, 18, 256); }
    else if (decalId === 'flames') { const grd = g.createLinearGradient(0, 256, 0, 0); grd.addColorStop(0, '#ffd23f'); grd.addColorStop(.5, '#ff7a1a'); grd.addColorStop(1, '#ff2a00'); g.fillStyle = grd; for (let i = 0; i < 8; i++) { const x = i * 34; g.beginPath(); g.moveTo(x - 10, 256); g.bezierCurveTo(x + 6, 150, x + 2, 120, x + 18, 40); g.bezierCurveTo(x + 28, 120, x + 34, 160, x + 46, 256); g.fill(); } }
    else if (decalId === 'carbon') { for (let y = 0; y < 256; y += 8) for (let x = 0; x < 256; x += 8) { g.fillStyle = ((x / 8 + y / 8) % 2 === 0) ? '#15171c' : '#23262e'; g.fillRect(x, y, 8, 8); g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(x, y, 8, 2); } }
    else if (decalId === 'hex') { g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2.5; const R = 18, h = R * Math.sqrt(3); for (let row = 0; row < 10; row++) for (let col = 0; col < 10; col++) { const hx = col * R * 1.5, hy = row * h + (col % 2 ? h / 2 : 0); g.beginPath(); for (let a = 0; a < 6; a++) { const ang = Math.PI / 3 * a, px = hx + R * Math.cos(ang), py = hy + R * Math.sin(ang); a === 0 ? g.moveTo(px, py) : g.lineTo(px, py); } g.closePath(); g.stroke(); } }
    else if (decalId === 'camo') { const cols = ['#3a4a2a', '#55663a', '#2a331c', '#6a7a4a']; g.fillStyle = cols[0]; g.fillRect(0, 0, 256, 256); for (let k = 0; k < 80; k++) { g.fillStyle = cols[k % cols.length]; g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 256, 18 + Math.random() * 24, 14 + Math.random() * 16, Math.random() * 3, 0, Math.PI * 2); g.fill(); } }
    const t = new THREE.CanvasTexture(c); if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function styleCar(group, color, decalId) {
    const decalTex = makeDecalTexture(decalId, color);
    group.traverse(o => {
      if (o.isMesh && o.material) {
        o.material = o.material.clone();
        o.material.color = new THREE.Color(color);
        if (decalTex) { o.material.map = decalTex; }
        else { o.material.map = null; }   // clear so a previous decal doesn't linger
        o.material.needsUpdate = true;
      }
    });
  }
  function applyArenaTheme(id) {
    const th = ARENA_THEMES.find(t => t.id === id) || ARENA_THEMES[0];
    scene.background = new THREE.Color(th.sky);
    // fog only as a distant backdrop haze — start well beyond the field so it never bleaches play
    scene.fog = new THREE.Fog(th.fog, 320, 900);
    if (arenaGrp) arenaGrp.traverse(o => {
      if (o.userData && o.userData.turf) {
        const base = new THREE.Color(th.turf);
        // stripes: clear light/dark mow bands derived from the theme's turf colour
        if (o.userData.stripe === 1) base.offsetHSL(0, 0.05, 0.10);
        else if (o.userData.stripe === 0) base.offsetHSL(0, 0.05, -0.06);
        o.material.color = base;
        if (o.material.transparent) o.material.opacity = 0.7; // less see-through so stripes read as turf, not haze
        o.material.needsUpdate = true;
      }
    });
  }
  function makeCar(group, team) {
    return { group, team, pos: new V3(), vel: new V3(), yaw: team === 'blue' ? 0 : Math.PI,
      onGround: true, boost: START_BOOST, boosting: false, demoTimer: 0, wheels: group.userData.wheels || [] };
  }

  async function startMatch() {
    DOM('menu').classList.add('hide');
    DOM('loading').classList.remove('hide');
    // clear any previous cars
    allCars.forEach(c => { if (c.group) scene.remove(c.group); });
    allCars = []; blueCars = []; orangeCars = [];
    const pEntry = CAR_CATALOG.find(c => c.id === chosenCarId) || CAR_CATALOG[0];
    // player = blue slot 0. Player's chosen colour, or team blue if left default.
    const pGroup = await loadCar(pEntry, 0x2f8bff, 0x9ed1ff);
    styleCar(pGroup, playerColor === 0xffffff ? 0x2f8bff : playerColor, chosenDecal);
    scene.add(pGroup);
    player = makeCar(pGroup, 'blue'); player.isPlayer = true; player.human = true;
    blueCars.push(player);
    // blue AI teammates
    for (let i = 1; i < teamSize; i++) {
      const e = CAR_CATALOG[(CAR_CATALOG.indexOf(pEntry) + i) % CAR_CATALOG.length];
      const g = await loadCar(e, 0x2f8bff, 0x9ed1ff); styleCar(g, 0x2f8bff, 'none'); scene.add(g);
      blueCars.push(makeCar(g, 'blue'));
    }
    // orange opponents
    for (let i = 0; i < teamSize; i++) {
      const e = CAR_CATALOG[(CAR_CATALOG.indexOf(pEntry) + 3 + i) % CAR_CATALOG.length];
      const g = await loadCar(e, 0xff7a1a, 0xffd23f); styleCar(g, 0xff7a1a, 'none'); scene.add(g);
      orangeCars.push(makeCar(g, 'orange'));
    }
    opponent = orangeCars[0];
    allCars = blueCars.concat(orangeCars);
    // ball model
    const ballModel = await loadBallModel(BALL_R);
    if (ballModel) { scene.remove(ball.mesh); ball.mesh = ballModel; scene.add(ball.mesh); ball.baseScale = ballModel.scale.x; }
    else { ball.baseScale = 1; }
    DOM('loading').classList.add('hide');
    DOM('hud').classList.remove('hide');
    score = { blue: 0, orange: 0 }; matchTime = matchLen;
    applyArenaTheme(chosenArena);
    mut = MUTATORS[chosenMutator] || MUTATORS.none;
    ball.mesh.scale.setScalar(ball.baseScale * mut.ballScale);
    ball.radius = BALL_R * mut.ballScale;
    kickoff();
  }

  function placeTeam(arr, sideSign) {
    const n = arr.length;
    for (let i = 0; i < n; i++) {
      const col = n === 1 ? 0 : ((i / (n - 1)) - 0.5) * 2;
      const x = col * HALF_W * 0.45;
      const z = sideSign * HALF_L * (0.5 + (i % 2) * 0.12);
      arr[i].pos.set(x, CAR_REST_Y, z);
      arr[i].yaw = sideSign > 0 ? Math.PI : 0;
      arr[i].vel.set(0, 0, 0); arr[i].boost = START_BOOST; arr[i].onGround = true;
    }
  }

  let countdown = 0;
  // --- goal replay system ---
  let replayBuf = [], replayMax = 360, replayPlaying = false, replayIdx = 0, replayTeam = null, replayHold = 0;
  function recordFrame() {
    const snap = { bx: ball.pos.x, by: ball.pos.y, bz: ball.pos.z, cars: [] };
    for (const c of allCars) snap.cars.push({ x: c.pos.x, y: c.pos.y, z: c.pos.z, yaw: c.yaw, vis: c.group ? c.group.visible : true });
    replayBuf.push(snap);
    if (replayBuf.length > replayMax) replayBuf.shift();
  }
  function kickoff() {
    placeTeam(blueCars, 1);
    placeTeam(orangeCars, -1);
    ball.pos.set(0, ball.radius || BALL_R, 0); ball.vel.set(0, 0, 0);
    if (pads) pads.forEach(p => p.cd = 0);
    replayBuf = [];
    countdown = 3; state = 'countdown';
  }

  function fwd(yaw, out) { out.set(-Math.sin(yaw), 0, -Math.cos(yaw)); return out; }
  const _f = new V3();

  function jump(car) { if (car.onGround) { car.vel.y = JUMP_V; car.onGround = false; } }

  function stepCar(car, dt, input) {
    if (car.demoTimer > 0) {
      car.demoTimer -= dt;
      if (car.demoTimer <= 0) {
        // respawn near own goal
        const ownZ = car.team === 'blue' ? HALF_L : -HALF_L;
        car.pos.set((Math.random() - 0.5) * HALF_W, CAR_REST_Y, ownZ * 0.7);
        car.yaw = car.team === 'blue' ? Math.PI : 0;
        car.vel.set(0, 0, 0); car.boost = 33;
        if (car.group) car.group.visible = true;
      }
      return;
    }
    const speed = Math.hypot(car.vel.x, car.vel.z);
    const boostWanted = input.boost && car.boost > 0;
    if (car.onGround) {
      fwd(car.yaw, _f);
      // steering: always turn the same way for a given key (no reverse-flip), scaled gently by speed
      const steerAuth = 0.55 + 0.45 * Math.min(1, speed / 10);
      car.yaw += (-input.s) * STEER * steerAuth * dt;
      fwd(car.yaw, _f);
      let accel = input.f > 0 ? ACCEL : input.f < 0 ? -REVERSE : 0;
      if (boostWanted) { accel += BOOST_ACCEL * (mut.boost || 1); car.boost = Math.max(0, car.boost - BOOST_USE * dt); car.boosting = true; }
      else car.boosting = false;
      car.vel.x += _f.x * accel * dt; car.vel.z += _f.z * accel * dt;
      // grip: bleed lateral velocity so the car tracks where it points
      const vF = car.vel.x * _f.x + car.vel.z * _f.z;
      let latx = car.vel.x - _f.x * vF, latz = car.vel.z - _f.z * vF;
      const keep = Math.exp(-GRIP * dt); latx *= keep; latz *= keep;
      let nf = vF; if (input.f === 0 && !boostWanted) { nf *= Math.exp(-1.4 * dt); if (Math.abs(nf) < 0.4) nf = 0; }
      car.vel.x = _f.x * nf + latx; car.vel.z = _f.z * nf + latz; car.vel.y = 0;
      const sp = Math.hypot(car.vel.x, car.vel.z), maxv = boostWanted ? MAX_BOOST : MAX_SPEED;
      if (sp > maxv) { const k = maxv / sp; car.vel.x *= k; car.vel.z *= k; }
      car.pos.x += car.vel.x * dt; car.pos.z += car.vel.z * dt; car.pos.y = CAR_REST_Y;
    } else {
      fwd(car.yaw, _f);
      car.yaw += (-input.s) * 2.0 * dt;
      if (boostWanted) { car.vel.x += _f.x * BOOST_ACCEL * (mut.boost || 1) * dt; car.vel.z += _f.z * BOOST_ACCEL * (mut.boost || 1) * dt; car.boost = Math.max(0, car.boost - BOOST_USE * dt); car.boosting = true; }
      car.vel.y -= GRAVITY * (mut.grav || 1) * dt;
      car.pos.x += car.vel.x * dt; car.pos.y += car.vel.y * dt; car.pos.z += car.vel.z * dt;
      if (car.pos.y <= CAR_REST_Y) { car.pos.y = CAR_REST_Y; car.vel.y = 0; car.onGround = true; }
    }
    // arena bounds
    car.pos.x = Math.max(-HALF_W + CAR_R, Math.min(HALF_W - CAR_R, car.pos.x));
    car.pos.z = Math.max(-HALF_L + CAR_R, Math.min(HALF_L - CAR_R, car.pos.z));
  }

  function nearestBigPad(car) {
    let best = null, bd = 1e9;
    for (const p of pads) { if (!p.big || p.cd > 0) continue; const dx = p.x - car.pos.x, dz = p.z - car.pos.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = p; } }
    return best;
  }
  function aiInput(car) {
    const team = car.team === 'blue' ? blueCars : orangeCars;
    let closest = null, cd = 1e9;
    for (const c of team) { if (c.human) continue; const dd = (c.pos.x - ball.pos.x) ** 2 + (c.pos.z - ball.pos.z) ** 2; if (dd < cd) { cd = dd; closest = c; } }
    const isChaser = (car === closest) || team.filter(c => !c.human).length <= 1;
    const ownZ = car.team === 'blue' ? HALF_L : -HALF_L;
    const atkZ = car.team === 'blue' ? -HALF_L : HALF_L;
    let tx, tz;
    if (car.boost < 15) { const pad = nearestBigPad(car); if (pad) { tx = pad.x; tz = pad.z; } }
    if (tx === undefined) {
      if (isChaser) {
        // aim for a point on the far side of the ball so we hit it toward the attacking goal
        let gx = ball.pos.x - 0, gz = ball.pos.z - atkZ; const gl = Math.hypot(gx, gz) || 1; gx /= gl; gz /= gl;
        tx = ball.pos.x + gx * 7; tz = ball.pos.z + gz * 7;
      } else {
        const slot = Math.max(0, team.indexOf(car));
        tx = ball.pos.x * 0.3 + ((slot % 3) - 1) * 18;
        tz = ownZ * 0.5;
      }
    }
    // clamp target inside the field
    tx = Math.max(-HALF_W + 3, Math.min(HALF_W - 3, tx));
    tz = Math.max(-HALF_L + 3, Math.min(HALF_L - 3, tz));
    const dx = tx - car.pos.x, dz = tz - car.pos.z;
    const dist = Math.hypot(dx, dz);
    // desired yaw so that forward (-sin,-cos) points at the target
    const want = Math.atan2(-dx, -dz);
    let d = want - car.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    // steering: car.yaw += (-s)*..., so to turn toward +d we need s = -d
    const s = Math.max(-1, Math.min(1, -d * 1.5));
    // drive forward unless we need to turn hard (then ease off so we can pivot)
    const f = Math.abs(d) > 1.6 ? 0.3 : 1;
    const boost = isChaser && car.boost > 10 && Math.abs(d) < 0.4 && dist > 14;
    return { f, s, boost };
  }

  // --- particle system: boost trails + goal explosions ---
  let particles = [];
  const _pgeo = new THREE.SphereGeometry(0.3, 6, 6);
  function spawnParticle(x, y, z, color, vx, vy, vz, life, size) {
    const m = new THREE.Mesh(_pgeo, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set(x, y, z); m.scale.setScalar(size || 1); scene.add(m);
    particles.push({ m, vx, vy, vz, life, max: life });
    if (particles.length > 400) { const old = particles.shift(); scene.remove(old.m); old.m.material.dispose(); }
  }
  function spawnBoostTrail(car) {
    const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw);
    const bx = car.pos.x - fx * 2.4, bz = car.pos.z - fz * 2.4;
    const col = Math.random() < 0.5 ? 0xffae3a : 0xfff0b0;
    spawnParticle(bx + (Math.random() - 0.5), car.pos.y + 0.6, bz + (Math.random() - 0.5), col,
      (Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2, 0.4, 0.7 + Math.random() * 0.5);
  }
  function spawnGoalExplosion(x, y, z, team) {
    const colors = team === 'blue' ? [0x2f8bff, 0x9ed1ff, 0xffffff] : [0xff8a1a, 0xffd23f, 0xffffff];
    for (let i = 0; i < 120; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2;
      const sp = 14 + Math.random() * 26;
      spawnParticle(x, y, z, colors[i % colors.length],
        Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 8, Math.sin(a) * Math.cos(e) * sp,
        0.9 + Math.random() * 0.7, 1 + Math.random() * 1.5);
    }
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.life -= dt;
      if (p.life <= 0) { scene.remove(p.m); p.m.material.dispose(); particles.splice(i, 1); continue; }
      p.vy -= 24 * dt;
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      if (p.m.position.y < 0.1) { p.m.position.y = 0.1; p.vy = Math.abs(p.vy) * 0.4; }
      p.m.material.opacity = Math.max(0, p.life / p.max);
      p.m.scale.multiplyScalar(1 + 0.4 * dt);
    }
  }

  function carCar(a, b) {
    if (a.demoTimer > 0 || b.demoTimer > 0) return;
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, dy = b.pos.y - a.pos.y;
    const d = Math.hypot(dx, dz, dy), min = CAR_R * 2;
    if (d < min && d > 0.001) {
      // demolition: a fast boosting car on a different team destroys the other
      const sa = Math.hypot(a.vel.x, a.vel.z), sb = Math.hypot(b.vel.x, b.vel.z);
      if (a.team !== b.team) {
        if (a.boosting && sa > 30 && sa > sb + 5) { demolish(b); return; }
        if (b.boosting && sb > 30 && sb > sa + 5) { demolish(a); return; }
      }
      const nx = dx / d, nz = dz / d, push = (min - d) * 0.5;
      a.pos.x -= nx * push; a.pos.z -= nz * push; b.pos.x += nx * push; b.pos.z += nz * push;
      const rel = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
      if (rel < 0) { a.vel.x += nx * rel * 0.5; a.vel.z += nz * rel * 0.5; b.vel.x -= nx * rel * 0.5; b.vel.z -= nz * rel * 0.5; }
    }
  }
  function demolish(car) {
    spawnGoalExplosion(car.pos.x, car.pos.y + 1, car.pos.z, car.team === 'blue' ? 'orange' : 'blue');
    car.demoTimer = 3;
    if (car.group) car.group.visible = false;
    car.vel.set(0, 0, 0);
    if (car.team === 'orange') { profile.stats.demos++; }
  }

  function carBall(car) {
    const R = ball.radius || BALL_R;
    const dx = ball.pos.x - car.pos.x, dz = ball.pos.z - car.pos.z, dy = ball.pos.y - (car.pos.y + 1);
    const d = Math.hypot(dx, dz, dy), min = R + CAR_R;
    if (d < min && d > 0.001) {
      const nx = dx / d, ny = dy / d, nz = dz / d;
      const carSpeed = Math.hypot(car.vel.x, car.vel.z);
      const power = 14 + carSpeed * 0.9 + (car.boosting ? 10 : 0);
      ball.vel.x = nx * power; ball.vel.z = nz * power; ball.vel.y = Math.max(ball.vel.y, ny * power * 0.5 + 6);
      ball.pos.x = car.pos.x + nx * min; ball.pos.z = car.pos.z + nz * min;
    }
  }

  function stepBall(dt) {
    const R = ball.radius || BALL_R;
    ball.vel.y -= GRAVITY * 0.6 * (mut.ballGrav || 1) * dt;
    ball.pos.x += ball.vel.x * dt; ball.pos.y += ball.vel.y * dt; ball.pos.z += ball.vel.z * dt;
    // ground
    if (ball.pos.y < R) { ball.pos.y = R; ball.vel.y = Math.abs(ball.vel.y) * 0.6; ball.vel.x *= 0.99; ball.vel.z *= 0.99; }
    // side walls
    if (ball.pos.x < -HALF_W + R) { ball.pos.x = -HALF_W + R; ball.vel.x = Math.abs(ball.vel.x) * 0.8; }
    if (ball.pos.x > HALF_W - R) { ball.pos.x = HALF_W - R; ball.vel.x = -Math.abs(ball.vel.x) * 0.8; }
    // end walls + goals
    const inGoalMouth = Math.abs(ball.pos.x) < ARENA.GOAL_W / 2 && ball.pos.y < ARENA.GOAL_H;
    if (ball.pos.z < -HALF_L + R) {
      if (inGoalMouth) { goalScored('blue'); return; }
      ball.pos.z = -HALF_L + R; ball.vel.z = Math.abs(ball.vel.z) * 0.8;
    }
    if (ball.pos.z > HALF_L - R) {
      if (inGoalMouth) { goalScored('orange'); return; }
      ball.pos.z = HALF_L - R; ball.vel.z = -Math.abs(ball.vel.z) * 0.8;
    }
    ball.vel.x *= (1 - 0.02 * dt); ball.vel.z *= (1 - 0.02 * dt);
  }

  function goalScored(team) {
    score[team]++; state = 'goal'; replayTeam = team;
    spawnGoalExplosion(ball.pos.x, ball.pos.y, ball.pos.z, team);
    if (ball.mesh) ball.mesh.visible = false;
    const fl = DOM('flash'); if (fl) { fl.classList.add('go'); setTimeout(() => fl.classList.remove('go'), 140); }
    const cm = DOM('centerMsg'); if (cm) { cm.textContent = 'GOAL!'; cm.style.color = team === 'blue' ? '#46b9ff' : '#ff8a1a'; cm.classList.add('show'); }
    setTimeout(() => {
      if (cm) cm.classList.remove('show');
      if (replayBuf.length > 30) startReplay(); else finishGoal();
    }, 1400);
  }
  function finishGoal() { if (ball.mesh) ball.mesh.visible = true; kickoff(); }
  function startReplay() {
    replayPlaying = true; replayIdx = 0; replayHold = 0; state = 'replay';
    if (ball.mesh) ball.mesh.visible = true;
    const rb = DOM('replayBar'); if (rb) rb.classList.add('show');
  }
  function stepReplay(dt) {
    if (!replayBuf.length) { endReplay(); return; }
    replayIdx += dt * 75;
    const fi = Math.floor(replayIdx);
    if (fi >= replayBuf.length) { replayHold += dt; if (replayHold > 1.2) endReplay(); return; }
    const snap = replayBuf[fi];
    for (let i = 0; i < allCars.length && i < snap.cars.length; i++) {
      const c = allCars[i], s = snap.cars[i];
      c.pos.set(s.x, s.y, s.z); c.yaw = s.yaw;
      if (c.group) { c.group.position.set(s.x, s.y, s.z); c.group.rotation.y = s.yaw; c.group.visible = s.vis; }
    }
    ball.pos.set(snap.bx, snap.by, snap.bz);
    if (ball.mesh) ball.mesh.position.copy(ball.pos);
  }
  function endReplay() {
    replayPlaying = false;
    const rb = DOM('replayBar'); if (rb) rb.classList.remove('show');
    replayBuf = [];
    finishGoal();
  }
  function endMatch() {
    state = 'ended';
    const playerWon = score.blue > score.orange;
    const winner = playerWon ? 'BLUE WINS' : score.orange > score.blue ? 'ORANGE WINS' : 'DRAW';
    // award credits: base + per blue goal + win bonus
    const earned = 100 + score.blue * 50 + (playerWon ? 250 : 0);
    profile.credits += earned;
    profile.stats.matches++;
    if (playerWon) profile.stats.wins++;
    profile.stats.goals += score.blue;
    saveProfile();
    const m = DOM('menu');
    DOM('hud').classList.add('hide');
    const h1 = m.querySelector('h1'), sub = m.querySelector('.sub');
    if (h1) h1.textContent = winner;
    if (sub) sub.textContent = score.blue + ' : ' + score.orange + '  ·  +' + earned + '◉  ·  press PLAY for a rematch';
    buildMenu();
    m.classList.remove('hide');
  }

  function updatePads(dt) {
    const t = performance.now() * 0.001;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (p.cd > 0) p.cd -= dt;
      const ready = p.cd <= 0;
      if (p.big) {
        p.orb.visible = ready; p.glow.visible = ready; if (p.beam) p.beam.visible = ready;
        if (p.ring) p.ring.material.opacity = ready ? 0.6 : 0.12;
        if (ready) { p.orb.position.y = p.baseY + Math.sin(t * 2 + i) * 0.3; p.orb.rotation.y += dt * 1.6; p.orb.rotation.x += dt * 0.8; }
      } else {
        if (p.disc) { p.disc.material.emissiveIntensity = ready ? (0.7 + Math.sin(t * 3 + i) * 0.2) : 0.08; }
        if (p.glow) p.glow.material.opacity = ready ? (0.3 + Math.sin(t * 3 + i) * 0.1) : 0.05;
        if (p.ring) p.ring.material.opacity = ready ? 0.5 : 0.1;
      }
      if (!ready) continue;
      for (const car of allCars) {
        if (!car) continue;
        const dx = car.pos.x - p.x, dz = car.pos.z - p.z;
        if (dx * dx + dz * dz < p.radius * p.radius) {
          if (p.big) { if (car.boost < MAX_BOOSTAMT) { car.boost = MAX_BOOSTAMT; p.cd = p.max; } }
          else { if (car.boost < MAX_BOOSTAMT) { car.boost = Math.min(MAX_BOOSTAMT, car.boost + 12); p.cd = p.max; } }
          break;
        }
      }
    }
  }

  function syncVisual(car) {
    car.group.position.set(car.pos.x, car.pos.y, car.pos.z);
    car.group.rotation.y = car.yaw;
    // spin placeholder wheels
    const roll = (car.vel.x * -Math.sin(car.yaw) + car.vel.z * -Math.cos(car.yaw)) * 0.05;
    car.wheels.forEach(w => { w.rotation.x += roll * (w.userData.flip || 1); });
  }

  function updateCamera(dt) {
    if (state === 'replay') {
      // cinematic orbit around the ball
      replayHold; const t = performance.now() * 0.0004;
      const r = 40, h = 22;
      camera.position.lerp(new V3(ball.pos.x + Math.cos(t) * r, h, ball.pos.z + Math.sin(t) * r), 1 - Math.exp(-4 * dt));
      camera.lookAt(ball.pos.x, ball.pos.y + 2, ball.pos.z);
      return;
    }
    if (!player) { camera.position.set(0, 40, 90); camera.lookAt(0, 0, 0); return; }
    // recenter the mouse-orbit offset toward 0 so the camera returns behind the car
    if (!dragging) camYaw *= Math.exp(-3 * dt);
    // ball-cam: orient behind the car along the car->ball direction; else behind the car's heading
    let yaw;
    if (ballCam) {
      const dx = ball.pos.x - player.pos.x, dz = ball.pos.z - player.pos.z;
      yaw = Math.atan2(-dx, -dz) + camYaw;
    } else {
      yaw = player.yaw + camYaw;
    }
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const dist = 15, height = 11 + camPitch * 6;
    const cx = player.pos.x - fx * dist;
    const cz = player.pos.z - fz * dist;
    camera.position.lerp(new V3(cx, player.pos.y + height, cz), 1 - Math.exp(-8 * dt));
    // look mostly ahead of the car (small bias toward ball) and slightly down, so the view is stable
    const aheadX = player.pos.x + fx * 12, aheadZ = player.pos.z + fz * 12;
    const look = new V3(aheadX, 2, aheadZ).lerp(new V3(ball.pos.x, ball.pos.y + 1, ball.pos.z), 0.18);
    camera.lookAt(look);
  }

  function updateHUD() {
    DOM('sB').textContent = score.blue; DOM('sO').textContent = score.orange;
    const m = Math.floor(matchTime / 60), s = Math.floor(matchTime % 60);
    DOM('timer').textContent = m + ':' + (s < 10 ? '0' : '') + s;
    if (player) { DOM('bf').style.height = (player.boost / MAX_BOOSTAMT * 100) + '%'; DOM('bn').textContent = Math.round(player.boost); }
  }

  function onResize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); }

  function animate() {
    requestAnimationFrame(animate);
    let dt = clock.getDelta(); if (dt > 0.05) dt = 0.05;
    const cm = DOM('centerMsg');
    if (state === 'countdown') {
      countdown -= dt;
      if (cm) { cm.textContent = Math.ceil(countdown); cm.style.color = '#ffffff'; cm.classList.add('show'); }
      if (countdown <= 0) { state = 'play'; if (cm) cm.classList.remove('show'); }
    } else if (state === 'play') {
      matchTime = Math.max(0, matchTime - dt);
      if (matchTime <= 0) { endMatch(); }
      const pin = { f: (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), s: (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), boost: keys.ShiftLeft || keys.ShiftRight };
      for (const c of allCars) stepCar(c, dt, c.human ? pin : aiInput(c));
      stepBall(dt);
      for (let i = 0; i < allCars.length; i++) for (let j = i + 1; j < allCars.length; j++) carCar(allCars[i], allCars[j]);
      for (const c of allCars) carBall(c);
      for (const c of allCars) { if (c.boosting && c.boost > 0) spawnBoostTrail(c); }
      updatePads(dt);
      recordFrame();
      const ss = DOM('ssIndic');
      if (ss && player) { const sp = Math.hypot(player.vel.x, player.vel.z); ss.classList.toggle('show', sp > 33); }
    } else if (state === 'replay') {
      stepReplay(dt);
    }
    updateParticles(dt);
    // animate arena accents
    if (arenaGrp && arenaGrp.userData.animated) {
      const t = performance.now() * 0.001;
      const a = arenaGrp.userData.animated;
      if (a.center) a.center.material.opacity = 0.25 + Math.abs(Math.sin(t * 1.5)) * 0.3;
      if (a.led) { const hue = (t * 0.05) % 1; a.led.children.forEach(s => s.material.color.setHSL(hue, 0.8, 0.6)); }
    }
    for (const c of allCars) syncVisual(c);
    if (ball) {
      ball.mesh.position.copy(ball.pos);
      // roll the ball based on horizontal velocity (perpendicular to motion)
      const r = ball.radius || BALL_R;
      ball.mesh.rotation.x += (ball.vel.z / r) * dt;
      ball.mesh.rotation.z -= (ball.vel.x / r) * dt;
    }
    updateCamera(dt);
    if (state !== 'menu') updateHUD();
    renderer.render(scene, camera);
  }

  // boot
  if (typeof THREE === 'undefined') {
    DOM('loading').innerHTML = '<div>Could not load 3D engine. Check your connection.</div>';
  } else {
    init();
  }
})();
