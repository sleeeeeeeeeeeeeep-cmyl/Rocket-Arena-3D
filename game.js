  /* game.js — scene, physics, controls, ball, AI, and the main loop. */
(function () {
  const V3 = THREE.Vector3;
  let scene, camera, renderer, clock;
  let player, opponent, ball;
  let allCars = [], blueCars = [], orangeCars = [];
  let teamSize = 1;
  let practice = false;
  let arenaGrp, lights, pads;
  const keys = {};
  let state = 'menu';
  let score = { blue: 0, orange: 0 };

  // --- economy / save profile ---
  const SAVE_KEY = 'rocketArena3D_save_v1';
  // prices: car id -> credits (0 = free/unlocked by default); decal id -> credits
  const CAR_PRICES = { car1: 0, car2: 0, car3: 0, car4: 800, car5: 800, car6: 1200, car7: 1200, car8: 1800, car9: 2500 };
  const DECAL_PRICES = { none: 0, stripes: 0, flames: 300, carbon: 500, hex: 500, camo: 900 };
  let profile = { credits: 0, cars: ['car1','car2','car3'], decals: ['none','stripes'], explosions: ['default'], stats: { wins: 0, goals: 0, demos: 0, matches: 0 } };
  function loadProfile() {
    try { const raw = localStorage.getItem(SAVE_KEY); if (raw) { const p = JSON.parse(raw); profile = Object.assign(profile, p); profile.stats = Object.assign({ wins:0,goals:0,demos:0,matches:0 }, p.stats||{}); } } catch (e) {}
    // restore customization (migrate gracefully — defaults if absent)
    if (typeof profile.bodyColor === 'number') playerColor = profile.bodyColor;
    if (typeof profile.wheelColor === 'number') wheelColor = profile.wheelColor;
    if (typeof profile.decal === 'string') chosenDecal = profile.decal;
    if (typeof profile.arena === 'string') chosenArena = profile.arena;
    if (typeof profile.car === 'string') chosenCarId = profile.car;
    if (typeof profile.explosion === 'string') chosenExplosion = profile.explosion;
    if (typeof profile.accentColor === 'number') accentColor = profile.accentColor;
    if (!profile.explosions) profile.explosions = ['default'];
  }
  function saveCustomization() {
    profile.bodyColor = playerColor; profile.wheelColor = wheelColor;
    profile.decal = chosenDecal; profile.arena = chosenArena; profile.car = chosenCarId;
    profile.explosion = chosenExplosion; profile.accentColor = accentColor;
    saveProfile();
  }
  function saveProfile() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(profile)); } catch (e) {} }
  function ownsCar(id) { return (CAR_PRICES[id] || 0) === 0 || profile.cars.indexOf(id) >= 0; }
  function ownsDecal(id) { return (DECAL_PRICES[id] || 0) === 0 || profile.decals.indexOf(id) >= 0; }

  let matchTime = 300, matchLen = 300, chosenCarId = 'car1', chosenMutator = 'none', playerColor = 0xffffff;
  let chosenDecal = 'none', chosenArena = 'night', wheelColor = 0xd7dbe2, chosenExplosion = 'default', accentColor = 0xffffff;
  // goal explosions (ported from the original game's shop)
  const EXPLOSIONS = [
    { id: 'default',   name: 'Team Colors', price: 0,   colors: null,                                  count: 120, speed: 1.0, rise: 8 },
    { id: 'electric',  name: 'Electric',    price: 350, colors: [0x4ab8ff, 0xbfe8ff, 0xffffff],        count: 150, speed: 1.5, rise: 6 },
    { id: 'confetti',  name: 'Confetti',    price: 400, colors: [0xff4a4a, 0x4a8aff, 0xffd23f, 0x2bd34a, 0xff4ab8, 0xffffff], count: 180, speed: 0.7, rise: 14 },
    { id: 'toxic',     name: 'Toxic',       price: 450, colors: [0x2bff4a, 0x8aff2b, 0x0a5a1a],        count: 130, speed: 1.0, rise: 8 },
    { id: 'prismatic', name: 'Prismatic',   price: 500, colors: 'rainbow',                             count: 160, speed: 1.1, rise: 9 },
    { id: 'frostbite', name: 'Frostbite',   price: 500, colors: [0x9fe8ff, 0xffffff, 0x4ab8d8],        count: 140, speed: 0.9, rise: 5 },
    { id: 'galaxy',    name: 'Galaxy',      price: 550, colors: [0x8a4aff, 0xff4ad8, 0x4a6aff, 0xffffff], count: 170, speed: 1.2, rise: 10 },
    { id: 'gold',      name: 'Gold Royale', price: 600, colors: [0xffd24a, 0xfff0b0, 0xc89a20],        count: 160, speed: 1.0, rise: 9 },
    { id: 'phoenix',   name: 'Phoenix',     price: 650, colors: [0xff3300, 0xff8a1a, 0xffd23f],        count: 170, speed: 1.1, rise: 18 }
  ];
  const EXPLOSION_PRICES = {}; EXPLOSIONS.forEach(e => EXPLOSION_PRICES[e.id] = e.price);
  function ownsExplosion(id) { return (EXPLOSION_PRICES[id] || 0) === 0 || (profile.explosions || []).indexOf(id) >= 0; }
  const DECALS = [
    { id: 'none', name: 'None' },
    { id: 'stripes', name: 'Twin Stripes' },
    { id: 'flames', name: 'Center Stripe' },
    { id: 'carbon', name: 'Side Stripes' },
    { id: 'hex', name: 'Full Top' },
    { id: 'camo', name: 'GT Wrap' }
  ];
  const ARENA_THEMES = [
    { id: 'night',   name: 'Midnight',  sky: 0x0a1228, turf: 0x2a7a44, fog: 0x0a1228, accent: 0x6c8cff, hemi: 0x9ec0ff, ground: 0x1a2233, hInt: 1.0,  dir: 0xffffff, crowdPal: [[0.95,0.3,0.3],[0.3,0.6,1],[1,0.8,0.3],[0.5,1,0.5],[0.9,0.5,1],[1,1,1]] },
    { id: 'sunset',  name: 'Sunset',    sky: 0x3a1a40, turf: 0x357a46, fog: 0x6a3a5a, accent: 0xffb347, hemi: 0xffc99a, ground: 0x4a2a4a, hInt: 1.05, dir: 0xffd0a0, crowdPal: [[1,0.6,0.4],[1,0.8,0.5],[1,0.9,0.7],[0.9,0.5,0.6],[1,1,0.85]] },
    { id: 'ice',     name: 'Ice',       sky: 0x12304a, turf: 0x4a8aaa, fog: 0x9fd6ff, accent: 0x8fe3ff, hemi: 0xcff4ff, ground: 0x244a55, hInt: 1.1,  dir: 0xdff6ff, crowdPal: [[0.6,0.9,1],[0.8,1,1],[0.5,0.85,0.95],[1,1,1],[0.7,0.95,1]] },
    { id: 'neon',    name: 'Neon',      sky: 0x12082a, turf: 0x4a2a9a, fog: 0x12082a, accent: 0xff2bd6, hemi: 0x8a6aff, ground: 0x140a1c, hInt: 0.9,  dir: 0xb09aff, crowdPal: [[1,0.3,0.85],[0.4,0.6,1],[1,0.5,0.9],[0.5,0.9,1],[1,0.7,1]] },
    { id: 'day',     name: 'Day',       sky: 0x7ab0e0, turf: 0x3a9a4e, fog: 0xbfe3ff, accent: 0xffffff, hemi: 0xdfffe8, ground: 0x2a5a32, hInt: 1.15, dir: 0xfff4d0, crowdPal: [[0.5,0.8,0.4],[0.9,0.3,0.3],[0.3,0.5,0.9],[1,1,1],[1,0.8,0.3]] },
    { id: 'volcano', name: 'Volcano',   sky: 0x2a0d08, turf: 0x3a2420, fog: 0x2a0d08, accent: 0xff3300, hemi: 0xff8a4a, ground: 0x2a0c04, hInt: 0.95, dir: 0xffb070, crowdPal: [[1,0.4,0.2],[1,0.6,0.3],[1,0.3,0.1],[1,0.8,0.4],[0.9,0.4,0.2]] },
    { id: 'aquatic', name: 'Aquatic',   sky: 0x024a5a, turf: 0x0a8a9a, fog: 0x024a5a, accent: 0x00e5ff, hemi: 0x9fe8ff, ground: 0x0a3a4a, hInt: 1.0,  dir: 0xc0f0ff, crowdPal: [[0.3,0.9,0.9],[0.4,1,0.8],[1,0.6,0.7],[0.9,0.85,0.4],[0.6,0.7,1]] },
    { id: 'orbital', name: 'Orbital',   sky: 0x05071a, turf: 0x2a3a5a, fog: 0x05071a, accent: 0x00b3ff, hemi: 0x6a5aff, ground: 0x0a0a1a, hInt: 0.9,  dir: 0xc0b0ff, crowdPal: [[0.6,0.4,1],[1,0.4,0.9],[0.4,0.9,1],[1,1,1],[0.8,0.5,1]] },
    { id: 'desert',  name: 'Desert',    sky: 0xc38d5f, turf: 0x9a8050, fog: 0xd8a070, accent: 0xff9e4f, hemi: 0xffe4b0, ground: 0x7a5a32, hInt: 1.15, dir: 0xfff0c0, crowdPal: [[1,0.85,0.5],[0.95,0.7,0.4],[1,0.9,0.65],[1,1,0.85],[0.9,0.6,0.35]] },
    { id: 'synth',   name: 'Synthwave', sky: 0x33105a, turf: 0x3a1a6a, fog: 0x33105a, accent: 0xff10f0, hemi: 0xff6cf0, ground: 0x1a0a3a, hInt: 0.95, dir: 0xffa0f0, crowdPal: [[1,0.3,0.85],[0.4,0.6,1],[1,0.5,0.9],[0.5,0.9,1],[1,0.7,1]] },
    { id: 'champ',   name: 'Champions', sky: 0x15151f, turf: 0x4a6a7a, fog: 0x15151f, accent: 0xffd24a, hemi: 0xffe8b0, ground: 0x1a1a24, hInt: 1.0,  dir: 0xfff0c8, crowdPal: [[1,0.85,0.3],[1,1,1],[0.9,0.7,0.2],[1,0.9,0.5],[0.8,0.8,0.9]] }
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
      new THREE.MeshStandardMaterial({ color: 0xf2f5fa, metalness: 0.25, roughness: 0.4, envMapIntensity: 1.2, emissive: 0x1a1e26, emissiveIntensity: 0.35, map: makeBallTexture() })
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
      if (e.code === 'Space' && state === 'play') doJump(player);
      if (e.code === 'KeyC') { ballCam = !ballCam; const bc = DOM('bcIndic'); if (bc) bc.textContent = 'BALL CAM: ' + (ballCam ? 'ON' : 'OFF'); }
      if (e.code === 'Enter' && state === 'replay') endReplay();
      if (e.code === 'KeyR' && practice && (state === 'play' || state === 'countdown')) {
        ball.pos.set(0, ball.radius, 0); ball.vel.set(0, 0, 0);
        if (ball.mesh) { ball.mesh.position.copy(ball.pos); ball.mesh.visible = true; }
      }
      if (e.code === 'Escape') {
        if (state === 'replay') endReplay();
        else if (state === 'play') pauseGame();
        else if (state === 'paused') resumeGame();
      }
      if (e.code === 'KeyF' && player && player.group) { player.modelFlip = !player.modelFlip; player.group.children.forEach(ch => { ch.rotation.y = player.modelFlip ? Math.PI : 0; }); } });
    const skipBtn = DOM('skipReplay'); if (skipBtn) skipBtn.onclick = () => { if (state === 'replay') endReplay(); };
    const rb2 = DOM('resumeBtn'); if (rb2) rb2.onclick = resumeGame;
    const qb = DOM('quitBtn'); if (qb) qb.onclick = quitToMenu;
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
      [0,1,2,3,4,5].forEach(n => {
        const b = document.createElement('button');
        b.className = 'carbtn' + (n === teamSize ? ' on' : '');
        b.textContent = n === 0 ? 'Practice' : (n + 'v' + n);
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
      const colors = [0xffffff, 0xbfc6cf, 0x3a3f48, 0x101725, 0x2f8bff, 0x14306a, 0x9fd6ff, 0xff3b3b, 0x6a1420, 0xff8a1a, 0xa06a2a, 0xffd23f, 0x2bd34a, 0x1e5a2a, 0x9aff2b, 0x00e5d0, 0xb84aff, 0xff4ab8];
      colors.forEach(col => {
        const b = document.createElement('button');
        b.className = 'carbtn' + (col === playerColor ? ' on' : '');
        b.style.background = '#' + col.toString(16).padStart(6, '0');
        b.style.width = '34px'; b.style.height = '34px'; b.style.padding = '0';
        b.title = colorName(col);
        b.onclick = () => { playerColor = col; saveCustomization(); buildMenu(); refreshPreview(); };
        cpk.appendChild(b);
      });
    }
    const wpk = DOM('wheelpick'); if (wpk) { wpk.innerHTML = '';
      const wcolors = [0xd7dbe2, 0x2a2e36, 0x0c0e12, 0xffffff, 0xa06a2a, 0xff3b3b, 0xff8a1a, 0x2f8bff, 0xffd23f, 0x2bd34a, 0x9aff2b, 0xff4ab8, 0xb84aff, 0x00e5d0];
      wcolors.forEach(col => {
        const b = document.createElement('button');
        b.className = 'carbtn' + (col === wheelColor ? ' on' : '');
        b.style.background = '#' + col.toString(16).padStart(6, '0');
        b.style.width = '34px'; b.style.height = '34px'; b.style.padding = '0';
        b.title = colorName(col);
        b.onclick = () => { wheelColor = col; saveCustomization(); buildMenu(); refreshPreview(); };
        wpk.appendChild(b);
      });
    }
    const acp = DOM('accentpick'); if (acp) { acp.innerHTML = '';
      const acolors = [0xffffff, 0xbfc6cf, 0x101318, 0xff3b3b, 0x6a1420, 0xff8a1a, 0x2f8bff, 0x14306a, 0xffd23f, 0xa06a2a, 0x2bd34a, 0x9aff2b, 0xff4ab8, 0xb84aff, 0x00e5d0];
      acolors.forEach(col => {
        const b = document.createElement('button');
        b.className = 'carbtn' + (col === accentColor ? ' on' : '');
        b.style.background = '#' + col.toString(16).padStart(6, '0');
        b.style.width = '34px'; b.style.height = '34px'; b.style.padding = '0';
        b.title = colorName(col);
        b.onclick = () => { accentColor = col; saveCustomization(); buildMenu(); refreshPreview(); };
        acp.appendChild(b);
      });
    }
    const dpk = DOM('decalpick'); if (dpk) { dpk.innerHTML = '';
      DECALS.forEach(dc => {
        const b = document.createElement('button');
        const owned = ownsDecal(dc.id);
        b.className = 'carbtn thumbbtn' + (dc.id === chosenDecal ? ' on' : '') + (owned ? '' : ' locked');
        if (dc.id !== 'none') { const th2 = patternThumb(dc.id); th2.style.cssText = 'width:60px;height:37px;border-radius:6px;display:block;margin:0 auto 3px'; b.appendChild(th2); }
        const lbl = document.createElement('div');
        lbl.innerHTML = dc.name + (owned ? '' : ' <span class="price">◉' + DECAL_PRICES[dc.id] + '</span>');
        b.appendChild(lbl);
        b.onclick = () => {
          if (ownsDecal(dc.id)) { chosenDecal = dc.id; }
          else if (profile.credits >= DECAL_PRICES[dc.id]) { profile.credits -= DECAL_PRICES[dc.id]; profile.decals.push(dc.id); saveProfile(); chosenDecal = dc.id; }
          else { flashCredits(); return; }
          saveCustomization(); buildMenu(); refreshPreview();
        };
        dpk.appendChild(b);
      });
    }
    const epk = DOM('explopick'); if (epk) { epk.innerHTML = '';
      EXPLOSIONS.forEach(ex => {
        const b = document.createElement('button');
        const owned = ownsExplosion(ex.id);
        b.className = 'carbtn' + (ex.id === chosenExplosion ? ' on' : '') + (owned ? '' : ' locked');
        let dots = '';
        const pal = ex.colors === 'rainbow' ? [0xff3b3b, 0xffd23f, 0x2bd34a, 0x2f8bff, 0xb84aff] : (ex.colors || [0x2f8bff, 0xff8a1a, 0xffffff]);
        pal.slice(0, 5).forEach(pc => { dots += '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;margin:0 1px;background:#' + pc.toString(16).padStart(6, '0') + '"></span>'; });
        b.innerHTML = '<div style="margin-bottom:2px">' + dots + '</div>' + ex.name + (owned ? '' : ' <span class="price">◉' + ex.price + '</span>');
        b.onclick = () => {
          if (ownsExplosion(ex.id)) { chosenExplosion = ex.id; }
          else if (profile.credits >= ex.price) { profile.credits -= ex.price; profile.explosions.push(ex.id); saveProfile(); chosenExplosion = ex.id; }
          else { flashCredits(); return; }
          saveCustomization(); buildMenu();
          pvBurst(ex);
        };
        epk.appendChild(b);
      });
    }
    const apk = DOM('arenapick'); if (apk) { apk.innerHTML = '';
      ARENA_THEMES.forEach(th => {
        const b = document.createElement('button');
        b.className = 'arenabtn' + (th.id === chosenArena ? ' on' : '');
        // canvas postcard: sky, floor, glow line, and the theme's signature props
        const cv = document.createElement('canvas'); cv.width = 108; cv.height = 64;
        const g = cv.getContext('2d');
        const hex = n => '#' + n.toString(16).padStart(6, '0');
        const grd = g.createLinearGradient(0, 0, 0, 64);
        grd.addColorStop(0, hex(th.sky)); grd.addColorStop(0.62, hex(th.sky)); grd.addColorStop(0.63, hex(th.turf)); grd.addColorStop(1, hex(th.turf));
        g.fillStyle = grd; g.fillRect(0, 0, 108, 64);
        // accent glow line at the horizon
        g.fillStyle = hex(th.accent); g.globalAlpha = 0.9; g.fillRect(0, 39, 108, 2); g.globalAlpha = 1;
        // perspective floor lines fanning to the horizon
        g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 1;
        for (let ln = -4; ln <= 4; ln++) { g.beginPath(); g.moveTo(54 + ln * 6, 41); g.lineTo(54 + ln * 22, 64); g.stroke(); }
        g.beginPath(); g.moveTo(0, 50); g.lineTo(108, 50); g.stroke();
        // center circle on the floor
        g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.5;
        g.beginPath(); g.ellipse(54, 54, 14, 5, 0, 0, Math.PI * 2); g.stroke();
        // goal arch on the horizon
        g.strokeStyle = hex(th.accent); g.lineWidth = 2;
        g.beginPath(); g.arc(54, 41, 9, Math.PI, 0); g.stroke();
        // vignette
        const vg = g.createRadialGradient(54, 32, 20, 54, 32, 70);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.35)');
        g.fillStyle = vg; g.fillRect(0, 0, 108, 64);
        // signature props
        if (th.id === 'synth' || th.id === 'sunset') { const sun = g.createRadialGradient(54, 30, 2, 54, 30, 16); sun.addColorStop(0, hex(th.accent)); sun.addColorStop(1, 'transparent'); g.fillStyle = sun; g.fillRect(30, 10, 48, 40); g.fillStyle = hex(th.accent); g.beginPath(); g.arc(54, 30, 9, 0, Math.PI * 2); g.fill(); }
        else if (th.id === 'orbital') { g.fillStyle = '#2a6aff'; g.beginPath(); g.arc(84, 16, 8, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; for (let i = 0; i < 14; i++) g.fillRect((Math.random() * 108) | 0, (Math.random() * 36) | 0, 1, 1); }
        else if (th.id === 'volcano') { g.fillStyle = '#ff5a1f'; for (let i = 0; i < 12; i++) g.fillRect((Math.random() * 108) | 0, (Math.random() * 50) | 0, 2, 2); }
        else if (th.id === 'ice') { g.fillStyle = '#fff'; for (let i = 0; i < 16; i++) g.fillRect((Math.random() * 108) | 0, (Math.random() * 60) | 0, 1.5, 1.5); }
        else if (th.id === 'aquatic') { g.strokeStyle = 'rgba(159,255,240,.8)'; for (let i = 0; i < 8; i++) { g.beginPath(); g.arc((Math.random() * 108) | 0, (Math.random() * 55) | 0, 1 + Math.random() * 2, 0, Math.PI * 2); g.stroke(); } }
        else if (th.id === 'champ') { const cols = ['#ffd24a', '#fff', '#e8b020']; for (let i = 0; i < 14; i++) { g.fillStyle = cols[i % 3]; g.fillRect((Math.random() * 108) | 0, (Math.random() * 55) | 0, 2, 3); } }
        else if (th.id === 'desert') { g.fillStyle = 'rgba(216,160,112,.7)'; for (let i = 0; i < 10; i++) g.fillRect((Math.random() * 108) | 0, 30 + (Math.random() * 20) | 0, 3, 1); }
        else if (th.id === 'night') { g.fillStyle = '#aaccff'; for (let i = 0; i < 12; i++) g.fillRect((Math.random() * 108) | 0, (Math.random() * 30) | 0, 1, 1); }
        cv.style.cssText = 'width:94px;height:56px;border-radius:8px;display:block';
        b.appendChild(cv);
        const label = document.createElement('span'); label.textContent = th.name; b.appendChild(label);
        b.onclick = () => { chosenArena = th.id; [...apk.children].forEach(x => x.classList.remove('on')); b.classList.add('on'); saveCustomization(); };
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
    applyWheelColor(grp, wheelColor);
    pvCar = grp; pvScene.add(pvCar);
  }
  const pvFX = [];
  let pvLastT = 0;
  function pvBurst(ex) {
    if (!pvScene || DOM('garage').classList.contains('hide')) return;
    const n = 34;
    for (let i = 0; i < n; i++) {
      let colHex;
      if (ex.colors === 'rainbow') { const c = new THREE.Color(); c.setHSL(i / n, 0.9, 0.6); colHex = c.getHex(); }
      else if (ex.colors) colHex = ex.colors[i % ex.colors.length];
      else colHex = [0x2f8bff, 0x9ed1ff, 0xffffff][i % 3];
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTexture(), color: colHex, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
      sp.position.set(0, 2.6, 0);
      const a = Math.random() * Math.PI * 2, e2 = Math.random() * Math.PI - Math.PI / 2;
      const spd = (3 + Math.random() * 5) * (ex.speed || 1);
      sp.userData.v = new THREE.Vector3(Math.cos(a) * Math.cos(e2) * spd, Math.sin(e2) * spd + (ex.rise || 8) * 0.25, Math.sin(a) * Math.cos(e2) * spd);
      sp.userData.t = 0; sp.userData.life = 0.7 + Math.random() * 0.4;
      sp.scale.set(0.7, 0.7, 1);
      pvScene.add(sp); pvFX.push(sp);
    }
  }
  function pvAnimate() {
    pvRAF = requestAnimationFrame(pvAnimate);
    const nowT = performance.now() * 0.001;
    const pdt = pvLastT ? Math.min(0.05, nowT - pvLastT) : 0.016;
    pvLastT = nowT;
    if (pvCar) pvCar.rotation.y += 0.012;
    for (let i = pvFX.length - 1; i >= 0; i--) {
      const sp = pvFX[i], u = sp.userData;
      u.t += pdt;
      if (u.t >= u.life) { pvScene.remove(sp); sp.material.dispose(); pvFX.splice(i, 1); continue; }
      u.v.y -= 6 * pdt;
      sp.position.addScaledVector(u.v, pdt);
      sp.material.opacity = 1 - u.t / u.life;
    }
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

  const COLOR_NAMES = { 0xffffff: 'White', 0xbfc6cf: 'Silver', 0x3a3f48: 'Gunmetal', 0x101725: 'Midnight', 0x2f8bff: 'Blue', 0x14306a: 'Navy', 0x9fd6ff: 'Sky', 0xff3b3b: 'Red', 0x6a1420: 'Maroon', 0xff8a1a: 'Orange', 0xa06a2a: 'Bronze', 0xffd23f: 'Gold', 0x2bd34a: 'Green', 0x1e5a2a: 'Forest', 0x9aff2b: 'Lime', 0x00e5d0: 'Teal', 0xb84aff: 'Purple', 0xff4ab8: 'Pink', 0x2a2e36: 'Graphite', 0x0c0e12: 'Black', 0xd7dbe2: 'Chrome', 0x101318: 'Onyx' };
  function colorName(c) { return COLOR_NAMES[c] || ('#' + c.toString(16).padStart(6, '0')); }
  // top-view car thumbnail showing a pattern in the CURRENT body + accent colours
  function patternThumb(id) {
    const c = document.createElement('canvas'); c.width = 72; c.height = 44;
    const g = c.getContext('2d');
    const body = '#' + (playerColor === 0xffffff ? 0x2f8bff : playerColor).toString(16).padStart(6, '0');
    const acc = '#' + accentColor.toString(16).padStart(6, '0');
    // car top-view silhouette
    g.fillStyle = body;
    g.beginPath();
    if (g.roundRect) g.roundRect(8, 6, 56, 32, 10); else g.rect(8, 6, 56, 32);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.25)'; // canopy hint
    g.beginPath();
    if (g.roundRect) g.roundRect(26, 12, 22, 20, 6); else g.rect(26, 12, 22, 20);
    g.fill();
    g.fillStyle = acc;
    if (id === 'stripes') { g.fillRect(8, 15, 56, 4.5); g.fillRect(8, 24.5, 56, 4.5); }
    else if (id === 'flames') { g.fillRect(8, 17, 56, 10); }
    else if (id === 'carbon') { g.fillRect(8, 7, 56, 3.5); g.fillRect(8, 33.5, 56, 3.5); }
    else if (id === 'hex') { g.globalAlpha = 0.9; g.fillRect(8, 9, 56, 26); g.globalAlpha = 1; }
    else if (id === 'camo') { g.fillRect(8, 18, 56, 8); g.fillRect(8, 7, 56, 3); g.fillRect(8, 34, 56, 3); }
    return c;
  }
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
  function applyWheelColor(group, color) {
    if (group.userData && group.userData.rimMat) {
      group.userData.rimMat.color = new THREE.Color(color);
      group.userData.rimMat.needsUpdate = true;
    }
  }
  function styleCar(group, color, decalId) {
    group.traverse(o => {
      if (o.isMesh && o.material && !o.userData.carPart) {   // skip wheels/glass/lights/shadow
        o.material = o.material.clone();
        o.material.color = new THREE.Color(color);
        o.material.map = null;
        o.material.needsUpdate = true;
      }
    });
    // body patterns are accent-coloured strips that conform to the car's real surface
    if (group.userData && group.userData.setPattern) group.userData.setPattern(decalId, accentColor);
  }
  let envRT = null;
  function buildEnvironment(th) {
    try {
      const pm = new THREE.PMREMGenerator(renderer);
      const es = new THREE.Scene();
      const c = document.createElement('canvas'); c.width = 4; c.height = 128;
      const g = c.getContext('2d');
      const sky = new THREE.Color(th.sky), acc = new THREE.Color(th.accent);
      const hor = sky.clone().lerp(acc, 0.3).offsetHSL(0, 0, 0.16);
      const gr = g.createLinearGradient(0, 0, 0, 128);
      gr.addColorStop(0, '#' + sky.getHexString());
      gr.addColorStop(0.6, '#' + hor.getHexString());
      gr.addColorStop(0.62, '#20242c'); gr.addColorStop(1, '#101318');
      g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
      const tex = new THREE.CanvasTexture(c);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 16, 12), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide }));
      es.add(dome);
      const rt = pm.fromScene(es, 0.05);
      if (envRT) envRT.dispose();
      envRT = rt; scene.environment = rt.texture;
      pm.dispose(); tex.dispose();
    } catch (e) { /* env map is an enhancement; never break the game for it */ }
  }
  function applyArenaTheme(id) {
    const th = ARENA_THEMES.find(t => t.id === id) || ARENA_THEMES[0];
    scene.background = new THREE.Color(th.sky);
    scene.fog = new THREE.Fog(th.fog, 320, 900);
    buildEnvironment(th);
    // paint the sky dome with a vertical gradient: deep sky at the top → accent-tinted horizon
    if (arenaGrp && arenaGrp.userData.skyDome) {
      const dome = arenaGrp.userData.skyDome;
      const c = document.createElement('canvas'); c.width = 4; c.height = 128;
      const g = c.getContext('2d');
      const skyC = new THREE.Color(th.sky);
      const horizon = skyC.clone().lerp(new THREE.Color(th.accent), 0.28).offsetHSL(0, 0, 0.10);
      const grd = g.createLinearGradient(0, 0, 0, 128);
      grd.addColorStop(0, '#' + skyC.clone().offsetHSL(0, 0, -0.04).getHexString());
      grd.addColorStop(0.55, '#' + skyC.getHexString());
      grd.addColorStop(1, '#' + horizon.getHexString());
      g.fillStyle = grd; g.fillRect(0, 0, 4, 128);
      const tex = new THREE.CanvasTexture(c);
      if (dome.material.map) dome.material.map.dispose();
      dome.material.map = tex; dome.material.needsUpdate = true;
      dome.renderOrder = -1;
    }
    // per-theme LIGHTING — this is what makes each arena feel genuinely different
    if (lights) {
      if (lights.hemi) { lights.hemi.color.setHex(th.hemi || 0x9ec0ff); lights.hemi.groundColor.setHex(th.ground || 0x1a2233); lights.hemi.intensity = th.hInt || 1.0; }
      if (lights.dir) lights.dir.color.setHex(th.dir || 0xffffff);
    }
    // recolour the dense crowd from the theme palette
    if (arenaGrp && arenaGrp.userData.crowdPts && th.crowdPal) {
      const colAttr = arenaGrp.userData.crowdPts.geometry.getAttribute('color');
      const pal = th.crowdPal;
      for (let i = 0; i < colAttr.count; i++) {
        const c = pal[(Math.random() * pal.length) | 0], v = 0.7 + Math.random() * 0.3;
        colAttr.setXYZ(i, c[0] * v, c[1] * v, c[2] * v);
      }
      colAttr.needsUpdate = true;
    }
    const accent = new THREE.Color(th.accent);
    // per-theme floor finish: some arenas are glossy (ice/neon/orbital), some matte (day/desert)
    const glossy = ['ice', 'neon', 'orbital', 'aquatic', 'synth'].indexOf(id) >= 0;
    if (arenaGrp) arenaGrp.traverse(o => {
      if (!o.material) return;
      if (o.userData.turf) {
        const base = new THREE.Color(th.turf);
        if (o.userData.stripe === 1) base.offsetHSL(0, 0.05, 0.10);
        else if (o.userData.stripe === 0) base.offsetHSL(0, 0.05, -0.06);
        o.material.color = base;
        o.material.roughness = glossy ? 0.25 : 0.85;
        o.material.metalness = glossy ? 0.5 : 0.05;
        if (o.material.transparent) o.material.opacity = 0.7;
        o.material.needsUpdate = true;
      } else if (o.userData.accent) {
        o.material.color = accent.clone();
        if (o.material.emissive) { o.material.emissive = accent.clone(); o.material.emissiveIntensity = 0.7; }
        o.material.needsUpdate = true;
      } else if (o.userData.crowd) {
        // tint the crowd toward the theme accent so stands read differently per arena
        const c = accent.clone().offsetHSL(0, -0.25, -0.1);
        o.material.color = c;
        if (o.material.emissive) o.material.emissive = accent.clone().multiplyScalar(0.25);
        o.material.needsUpdate = true;
      } else if (o.userData.led) {
        // handled by loop animation, but seed with accent
      }
    });
    // theme the LED perimeter base color
    if (arenaGrp && arenaGrp.userData.animated && arenaGrp.userData.animated.led) {
      arenaGrp.userData.animated.led.userData.accent = th.accent;
    }
    buildThemeProps(th);
  }

  // per-theme atmospheric prop layer (rebuilt each theme change)
  let themePropGroup = null;
  function buildThemeProps(th) {
    if (themePropGroup) { scene.remove(themePropGroup); themePropGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
    themePropGroup = new THREE.Group(); scene.add(themePropGroup);
    const accent = new THREE.Color(th.accent);
    const HW = ARENA.HALF_W, HL = ARENA.HALF_L, WH = ARENA.WALL_H;
    // floating atmosphere particles whose look depends on the theme
    const kinds = { volcano: 'ember', aquatic: 'bubble', neon: 'spark', synth: 'spark', orbital: 'star', desert: 'dust', ice: 'snow', night: 'spark', champ: 'confetti', sunset: 'dust', day: 'none' };
    const kind = kinds[th.id] || 'none';
    if (kind !== 'none') {
      const n = 120;
      const geo = new THREE.BufferGeometry(); const pos = [];
      for (let i = 0; i < n; i++) pos.push((Math.random() - 0.5) * ARENA.W * 1.2, Math.random() * WH * 1.4, (Math.random() - 0.5) * ARENA.L * 1.2);
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      let col = accent, size = 1.6, rise = true;
      if (kind === 'ember') { col = new THREE.Color(0xff5a1f); size = 1.4; }
      else if (kind === 'bubble') { col = new THREE.Color(0x9ffff0); size = 1.8; }
      else if (kind === 'snow') { col = new THREE.Color(0xffffff); size = 1.6; rise = false; }
      else if (kind === 'dust') { col = new THREE.Color(0xd8a070); size = 1.2; }
      else if (kind === 'star') { col = new THREE.Color(0xffffff); size = 1.2; rise = false; }
      else if (kind === 'confetti') { col = new THREE.Color(0xffd24a); size = 2.0; rise = false; }
      const mat = new THREE.PointsMaterial({ color: col, size, transparent: true, opacity: 0.8, depthWrite: false, blending: kind === 'snow' || kind === 'confetti' ? THREE.NormalBlending : THREE.AdditiveBlending });
      const pts = new THREE.Points(geo, mat);
      pts.userData.drift = kind; pts.userData.rise = rise;
      themePropGroup.add(pts);
    }
    // ---- signature environments per theme ----
    const cvPlane = (w, h, draw, opts) => {
      const c = document.createElement('canvas'); c.width = opts && opts.res ? opts.res : 256; c.height = opts && opts.res ? opts.res : 256;
      draw(c.getContext('2d'), c.width, c.height);
      const tex = new THREE.CanvasTexture(c);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: (opts && opts.add) ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false });
      return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    };
    const neonGrid = gcol => {
      const g2 = cvPlane(900, 900, (g, w, h) => {
        g.strokeStyle = gcol; g.lineWidth = 3; g.globalAlpha = 0.7;
        for (let i = 0; i <= 24; i++) { const p = i / 24 * w; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, h); g.stroke(); g.beginPath(); g.moveTo(0, p); g.lineTo(w, p); g.stroke(); }
      }, { res: 512, add: true });
      g2.rotation.x = -Math.PI / 2; g2.position.y = -0.4;
      return g2;
    };
    if (th.id === 'synth') {
      // THE iconic synthwave sun: gradient disc with slats cut from the lower half
      const sun = cvPlane(64, 64, (g, w, h) => {
        const grd = g.createLinearGradient(0, 0, 0, h);
        grd.addColorStop(0, '#ffe94a'); grd.addColorStop(0.45, '#ff8a3a'); grd.addColorStop(1, '#ff10a8');
        g.fillStyle = grd; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2); g.fill();
        g.globalCompositeOperation = 'destination-out';
        let y = h * 0.52, gap = 3;
        while (y < h) { g.fillRect(0, y, w, gap); y += gap * 2.4; gap *= 1.35; }
      }, { res: 512 });
      sun.position.set(0, 30, -HL - 85);
      themePropGroup.add(sun);
      const halo = cvPlane(110, 110, (g, w, h) => {
        const r = g.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w / 2);
        r.addColorStop(0, 'rgba(255,60,190,0.55)'); r.addColorStop(1, 'rgba(255,60,190,0)');
        g.fillStyle = r; g.fillRect(0, 0, w, h);
      }, { add: true });
      halo.position.set(0, 30, -HL - 86);
      themePropGroup.add(halo);
      themePropGroup.add(neonGrid('#ff2bd6'));
      // wireframe mountain silhouettes flanking the sun
      [-1, 1].forEach(sx => {
        const mtn = cvPlane(180, 46, (g, w, h) => {
          g.strokeStyle = '#05d9e8'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, h);
          for (let x = 0; x <= w; x += w / 9) g.lineTo(x, h - Math.random() * h * 0.9);
          g.lineTo(w, h); g.stroke();
        }, { res: 512, add: true });
        mtn.position.set(sx * 120, 20, -HL - 95);
        themePropGroup.add(mtn);
      });
    } else if (th.id === 'sunset') {
      const sun = cvPlane(70, 70, (g, w, h) => {
        const r = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
        r.addColorStop(0, '#fff2c0'); r.addColorStop(0.5, '#ffb347'); r.addColorStop(1, 'rgba(255,120,60,0)');
        g.fillStyle = r; g.fillRect(0, 0, w, h);
      }, { add: true });
      sun.position.set(30, 22, -HL - 80); themePropGroup.add(sun);
      for (let b = 0; b < 4; b++) {
        const band = cvPlane(240, 4 + b * 2, (g, w, h) => { g.fillStyle = 'rgba(255,140,90,0.35)'; g.fillRect(0, 0, w, h); }, { add: true });
        band.position.set(0, 10 + b * 7, -HL - 82); themePropGroup.add(band);
      }
    } else if (th.id === 'orbital') {
      // banded gas giant + tilted ring + small moon
      const c2 = document.createElement('canvas'); c2.width = 128; c2.height = 128;
      const g2 = c2.getContext('2d');
      const bands = ['#3a5adf', '#5a7af0', '#2a3aa0', '#7a9aff', '#26308a'];
      for (let y = 0; y < 128; y += 8) { g2.fillStyle = bands[(y / 8) % bands.length | 0]; g2.fillRect(0, y, 128, 8); }
      const ptex = new THREE.CanvasTexture(c2);
      const planet = new THREE.Mesh(new THREE.SphereGeometry(36, 28, 22), new THREE.MeshStandardMaterial({ map: ptex, roughness: 0.85, emissive: 0x111a44, emissiveIntensity: 0.6 }));
      planet.position.set(-85, 75, -HL - 100); themePropGroup.add(planet);
      const ring = new THREE.Mesh(new THREE.RingGeometry(46, 66, 48),
        new THREE.MeshBasicMaterial({ color: 0x9ab4ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, fog: false }));
      ring.position.copy(planet.position); ring.rotation.x = Math.PI / 2.6; ring.rotation.y = 0.4;
      themePropGroup.add(ring);
      const moon = new THREE.Mesh(new THREE.SphereGeometry(7, 14, 10), new THREE.MeshStandardMaterial({ color: 0xb8c0cc, roughness: 1 }));
      moon.position.set(60, 55, -HL - 70); themePropGroup.add(moon);
    } else if (th.id === 'volcano') {
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.W, ARENA.L), new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2; glow.position.y = 0.15; themePropGroup.add(glow);
      // volcano cone on the horizon with a glowing crater
      const cone = new THREE.Mesh(new THREE.ConeGeometry(55, 70, 24), new THREE.MeshStandardMaterial({ color: 0x14100e, roughness: 1 }));
      cone.position.set(-40, 34, -HL - 130); themePropGroup.add(cone);
      const crater = cvPlane(48, 48, (g, w, h) => {
        const r = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
        r.addColorStop(0, 'rgba(255,140,40,0.95)'); r.addColorStop(1, 'rgba(255,60,0,0)');
        g.fillStyle = r; g.fillRect(0, 0, w, h);
      }, { add: true });
      crater.position.set(-40, 72, -HL - 128); themePropGroup.add(crater);
    } else if (th.id === 'ice') {
      // aurora curtains, animated in the loop
      for (let a2 = 0; a2 < 3; a2++) {
        const aur = cvPlane(140, 60, (g, w, h) => {
          const grd = g.createLinearGradient(0, 0, 0, h);
          grd.addColorStop(0, 'rgba(80,255,190,0)'); grd.addColorStop(0.4, 'rgba(80,255,190,0.5)');
          grd.addColorStop(0.8, 'rgba(90,160,255,0.35)'); grd.addColorStop(1, 'rgba(90,160,255,0)');
          g.fillStyle = grd; g.fillRect(0, 0, w, h);
        }, { add: true });
        aur.position.set((a2 - 1) * 90, 70 + a2 * 8, -HL - 90 - a2 * 12);
        aur.userData.aurora = { phase: a2 * 2.1 };
        themePropGroup.add(aur);
      }
    } else if (th.id === 'night') {
      // city skyline with lit windows + moon
      [[0, -HL - 90, 0], [0, HL + 90, Math.PI]].forEach(d => {
        const sky2 = cvPlane(320, 44, (g, w, h) => {
          for (let x = 0; x < w;) {
            const bw = 14 + Math.random() * 26, bh = h * (0.3 + Math.random() * 0.65);
            g.fillStyle = '#0a0f1e'; g.fillRect(x, h - bh, bw, bh);
            g.fillStyle = 'rgba(255,220,130,0.8)';
            for (let wy = h - bh + 3; wy < h - 4; wy += 6) for (let wx = x + 2; wx < x + bw - 3; wx += 5)
              if (Math.random() > 0.55) g.fillRect(wx, wy, 2, 3);
            x += bw + 3;
          }
        }, { res: 1024 });
        sky2.position.set(d[0], 20, d[1]); sky2.rotation.y = d[2];
        themePropGroup.add(sky2);
      });
      const moon = cvPlane(30, 30, (g, w, h) => {
        const r = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
        r.addColorStop(0, 'rgba(240,246,255,1)'); r.addColorStop(0.55, 'rgba(220,232,255,0.9)'); r.addColorStop(1, 'rgba(200,220,255,0)');
        g.fillStyle = r; g.fillRect(0, 0, w, h);
      }, { add: true });
      moon.position.set(70, 68, -HL - 80); themePropGroup.add(moon);
    } else if (th.id === 'aquatic') {
      for (let r2 = 0; r2 < 4; r2++) {
        const ray = cvPlane(16, 90, (g, w, h) => {
          const grd = g.createLinearGradient(0, 0, 0, h);
          grd.addColorStop(0, 'rgba(160,255,240,0.5)'); grd.addColorStop(1, 'rgba(160,255,240,0)');
          g.fillStyle = grd; g.fillRect(0, 0, w, h);
        }, { add: true });
        ray.position.set(-HW + r2 * (ARENA.W / 3), 45, -20 + r2 * 14);
        ray.rotation.z = 0.22; ray.userData.ray = { phase: r2 * 1.6 };
        themePropGroup.add(ray);
      }
    } else if (th.id === 'desert') {
      [[-HL - 80, '#8a5a30', 26], [-HL - 110, '#6a441f', 38]].forEach(d => {
        const dune = cvPlane(340, d[2], (g, w, h) => {
          g.fillStyle = d[1]; g.beginPath(); g.moveTo(0, h);
          for (let x = 0; x <= w; x += 8) g.lineTo(x, h - (Math.sin(x * 0.02) * 0.4 + 0.55) * h);
          g.lineTo(w, h); g.fill();
        }, { res: 1024 });
        dune.position.set(0, d[2] / 2, d[0]); themePropGroup.add(dune);
      });
      const sun = cvPlane(46, 46, (g, w, h) => {
        const r = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
        r.addColorStop(0, '#fff0c0'); r.addColorStop(1, 'rgba(255,200,120,0)');
        g.fillStyle = r; g.fillRect(0, 0, w, h);
      }, { add: true });
      sun.position.set(-60, 26, -HL - 95); themePropGroup.add(sun);
    } else if (th.id === 'day') {
      for (let cl = 0; cl < 7; cl++) {
        const cloud = cvPlane(40 + Math.random() * 30, 14, (g, w, h) => {
          g.fillStyle = 'rgba(255,255,255,0.85)';
          for (let p = 0; p < 6; p++) { g.beginPath(); g.ellipse(w * (0.15 + Math.random() * 0.7), h * 0.6, w * 0.16, h * 0.3, 0, 0, Math.PI * 2); g.fill(); }
        });
        cloud.position.set((Math.random() - 0.5) * ARENA.W * 2.2, 55 + Math.random() * 25, (Math.random() - 0.5) * ARENA.L * 2.2);
        cloud.userData.cloud = { v: 1.5 + Math.random() * 1.5 };
        themePropGroup.add(cloud);
      }
    } else if (th.id === 'neon') {
      themePropGroup.add(neonGrid('#05d9e8'));
    } else if (th.id === 'champ') {
      for (let r3 = 0; r3 < 3; r3++) {
        const arc = new THREE.Mesh(new THREE.TorusGeometry(46 + r3 * 14, 0.5, 8, 48, Math.PI),
          new THREE.MeshStandardMaterial({ color: 0xffd24a, emissive: 0xffd24a, emissiveIntensity: 0.8 }));
        arc.position.set(0, 2, 0); themePropGroup.add(arc);
      }
    }
  }
  function makeCar(group, team) {
    return { group, team, pos: new V3(), vel: new V3(), yaw: team === 'blue' ? 0 : Math.PI,
      onGround: true, boost: START_BOOST, boosting: false, demoTimer: 0,
      faceFix: (group.userData && group.userData.faceFix) || 0,
      wheels: group.userData.wheels || [] };
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
    applyWheelColor(pGroup, wheelColor);
    scene.add(pGroup);
    player = makeCar(pGroup, 'blue'); player.isPlayer = true; player.human = true;
    pGroup.traverse(o => { if (o.userData && o.userData.headlight && o.isLight) o.intensity = 0.6; });
    blueCars.push(player);
    // blue AI teammates
    for (let i = 1; i < (practice ? 1 : teamSize); i++) {
      const e = CAR_CATALOG[(CAR_CATALOG.indexOf(pEntry) + i) % CAR_CATALOG.length];
      const g = await loadCar(e, 0x2f8bff, 0x9ed1ff); styleCar(g, 0x2f8bff, 'none'); scene.add(g);
      blueCars.push(makeCar(g, 'blue'));
    }
    // orange opponents
    for (let i = 0; i < (practice ? 0 : teamSize); i++) {
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
    const spd0 = DOM('speedo'); if (spd0) spd0.classList.remove('hide');
    practice = (teamSize === 0);
    score = { blue: 0, orange: 0 }; matchTime = practice ? 99 * 60 : matchLen; overtime = false; otTime = 0;
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
      // face the centre of the field (toward the ball), not the back wall.
      // blue spawns at +Z and must face -Z (yaw 0); orange spawns at -Z and faces +Z (yaw π).
      arr[i].yaw = sideSign > 0 ? 0 : Math.PI;
      arr[i].vel.set(0, 0, 0); arr[i].boost = START_BOOST; arr[i].onGround = true;
    }
  }

  let countdown = 0;
  let overtime = false, otTime = 0;
  // --- tiny WebAudio SFX kit (goal horn, hits, jump, pads, demo) ---
  let actx = null;
  function sfx(type, k) {
    if (typeof muted !== 'undefined' && muted) return;
    k = k || 1;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t = actx.currentTime, out = actx.destination;
      const osc = (wave, f0, f1, dur, vol) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = wave; o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + dur);
      };
      const noise = (dur, vol, fc) => {
        const n = actx.createBufferSource(), buf = actx.createBuffer(1, Math.floor(actx.sampleRate * dur), actx.sampleRate);
        const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
        n.buffer = buf;
        const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = fc;
        const g = actx.createGain(); g.gain.value = vol;
        n.connect(f); f.connect(g); g.connect(out); n.start(t);
      };
      if (type === 'goal') { osc('sawtooth', 440, 220, 0.8, 0.22); osc('sawtooth', 554, 277, 0.8, 0.18); noise(0.5, 0.18, 1200); }
      else if (type === 'hit') { noise(0.15, Math.min(0.5, 0.18 * k), 900); osc('sine', 120, 60, 0.15, 0.2 * Math.min(1, k)); }
      else if (type === 'jump') { osc('square', 300, 520, 0.12, 0.07); }
      else if (type === 'pad') { osc('sine', 880, 1320, 0.1, 0.05 * k); }
      else if (type === 'demo') { noise(0.5, 0.45, 500); osc('sine', 200, 40, 0.5, 0.3); }
    } catch (e) {}
  }
  function duckMusic() {
    try {
      const mu = document.getElementById('bgMusic'); if (!mu) return;
      mu.volume = 0.2; let v = 0.2;
      const iv = setInterval(() => { v = Math.min(1, v + 0.08); mu.volume = v; if (v >= 1) clearInterval(iv); }, 150);
    } catch (e) {}
  }
  // --- goal replay system ---
  let replayBuf = [], replayMax = 360, replayPlaying = false, replayIdx = 0, replayTeam = null, replayHold = 0;
  let replayGoal = null, replayExploded = false;
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
    camYaw = 0; ballCam = false;   // always start each kickoff looking straight behind the car
    countdown = 3; state = 'countdown';
  }

  function fwd(yaw, out) { out.set(-Math.sin(yaw), 0, -Math.cos(yaw)); return out; }
  const _f = new V3();

  function jump(car) { if (car.onGround) { car.vel.y = JUMP_V; car.onGround = false; if (car.human) sfx('jump'); } }
  const DODGE_IMPULSE = 26;
  function doJump(car) {
    if (!car) return;
    if (car.onGround) { jump(car); car.jumps = 1; car.jumpT = 0; return; }
    if (car.jumps === 1 && (car.jumpT || 0) < 1.3) {
      car.jumps = 2;
      const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
      const s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
      if (f || s) {
        // directional dodge: strong impulse in the input direction + a full flip animation
        const fx2 = -Math.sin(car.yaw), fz2 = -Math.cos(car.yaw);
        const rx = -fz2, rz = fx2;             // right vector
        let dx = f * fx2 + s * rx, dz = f * fz2 + s * rz;
        const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
        car.vel.x = car.vel.x * 0.4 + dx * DODGE_IMPULSE;
        car.vel.z = car.vel.z * 0.4 + dz * DODGE_IMPULSE;
        car.vel.y = Math.max(car.vel.y * 0.3, 5);
        car.flip = { t: 0, dur: 0.55, pitch: f, roll: s };
        sfx('jump'); camShake = Math.max(camShake, 0.15);
      } else {
        car.vel.y = JUMP_V * 0.8;   // plain double jump
        sfx('jump');
      }
    }
  }

  function stepCar(car, dt, input) {
    if (car.demoTimer > 0) {
      car.demoTimer -= dt;
      if (car.demoTimer <= 0) {
        // respawn near own goal
        const ownZ = car.team === 'blue' ? HALF_L : -HALF_L;
        car.pos.set((Math.random() - 0.5) * HALF_W, CAR_REST_Y, ownZ * 0.7);
        car.yaw = car.team === 'blue' ? 0 : Math.PI;
        car.vel.set(0, 0, 0); car.boost = 33;
        if (car.group) car.group.visible = true;
      }
      return;
    }
    const speed = Math.hypot(car.vel.x, car.vel.z);
    if (practice && car.human) car.boost = MAX_BOOSTAMT;
    const boostWanted = input.boost && car.boost > 0;
    car._steer = input.s || 0;
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
      car.jumpT = (car.jumpT || 0) + dt;
      fwd(car.yaw, _f);
      car.yaw += (-input.s) * 2.0 * dt;
      if (boostWanted) { car.vel.x += _f.x * BOOST_ACCEL * (mut.boost || 1) * dt; car.vel.z += _f.z * BOOST_ACCEL * (mut.boost || 1) * dt; car.boost = Math.max(0, car.boost - BOOST_USE * dt); car.boosting = true; }
      car.vel.y -= GRAVITY * (mut.grav || 1) * dt;
      car.pos.x += car.vel.x * dt; car.pos.y += car.vel.y * dt; car.pos.z += car.vel.z * dt;
      if (car.pos.y <= CAR_REST_Y) { car.pos.y = CAR_REST_Y; car.vel.y = 0; car.onGround = true; car.jumps = 0; car.flip = null; }
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
  let camShake = 0; // decaying shake intensity
  let ballGlow = null, ballTrailAcc = 0;
  const _ballCol = new THREE.Color(0xffffff);
  function updateBallLook(dt) {
    if (!ball || !ball.mesh) return;
    // colour by field side: blue half (+Z) → blue, orange half (−Z) → orange, white at centre
    const k = Math.max(-1, Math.min(1, ball.pos.z / (HALF_L * 0.55)));
    const target = new THREE.Color(0xffffff);
    if (k > 0) target.lerp(new THREE.Color(0x5ab4ff), k);
    else target.lerp(new THREE.Color(0xffa04a), -k);
    _ballCol.lerp(target, 1 - Math.exp(-4 * dt));
    ball.mesh.material.color.copy(_ballCol);
    // glow halo that follows and matches the ball
    if (!ballGlow) {
      ballGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTexture(), color: 0xffffff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
      ballGlow.scale.set(ball.radius * 5.2, ball.radius * 5.2, 1);
      scene.add(ballGlow);
    }
    ballGlow.visible = ball.mesh.visible;
    ballGlow.position.copy(ball.pos);
    ballGlow.material.color.copy(_ballCol);
    // speed trail: faint streaks when the ball is really moving
    const spd = ball.vel.length();
    if (spd > 24 && ball.mesh.visible) {
      ballTrailAcc += dt;
      if (ballTrailAcc > 0.045) {
        ballTrailAcc = 0;
        const tr = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTexture(), color: _ballCol.getHex(), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
        tr.position.copy(ball.pos);
        const s0 = ball.radius * 2.6;
        addFX(tr, 0.4, (mm, kk) => { const s = s0 * (1 - kk * 0.6); mm.scale.set(s, s, 1); mm.material.opacity = 0.35 * (1 - kk); });
      }
    }
  }
  let frameDt = 1 / 60;
  // --- FX framework: short-lived meshes with per-frame update functions ---
  const fxList = [];
  function addFX(mesh, life, update) {
    mesh.userData._fx = { t: 0, life, update };
    scene.add(mesh); fxList.push(mesh);
  }
  function updateFX(dt) {
    for (let i = fxList.length - 1; i >= 0; i--) {
      const m = fxList[i], f = m.userData._fx;
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) {
        scene.remove(m);
        if (m.geometry) m.geometry.dispose();
        if (m.material) { if (m.material.map) m.material.map.dispose(); m.material.dispose(); }
        fxList.splice(i, 1); continue;
      }
      if (f.update) f.update(m, k, dt);
    }
  }
  let _smokeTex = null;
  function smokeTexture() {
    if (_smokeTex) return _smokeTex;
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    _smokeTex = new THREE.CanvasTexture(c); return _smokeTex;
  }
  // core flash sphere: blinding pop that inflates and dies in a blink
  function fxFlash(x, y, z, color, size) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set(x, y, z);
    addFX(m, 0.28, (mm, k) => { const s = 0.5 + k * (size || 7); mm.scale.set(s, s, s); mm.material.opacity = 0.95 * (1 - k) * (1 - k); });
  }
  // soft glowing smoke puffs that drift upward
  function fxSmoke(x, y, z, color, n, additive) {
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTexture(), color, transparent: true, opacity: 0.5, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
      const a = Math.random() * Math.PI * 2, r = Math.random() * 2.5;
      sp.position.set(x + Math.cos(a) * r, y + Math.random() * 1.5, z + Math.sin(a) * r);
      const vy = 2.5 + Math.random() * 3, vx = (Math.random() - 0.5) * 2, vz = (Math.random() - 0.5) * 2;
      const s0 = 2 + Math.random() * 2.5;
      addFX(sp, 1.1 + Math.random() * 0.5, (mm, k, dt2) => {
        mm.position.x += vx * dt2; mm.position.y += vy * dt2; mm.position.z += vz * dt2;
        const s = s0 * (1 + k * 1.6); mm.scale.set(s, s, 1);
        mm.material.opacity = 0.5 * (1 - k);
      });
    }
  }
  // jagged lightning bolts radiating from the burst
  function fxBolts(x, y, z, color, n) {
    for (let b = 0; b < n; b++) {
      const pts = [], segs = 5, a = Math.random() * Math.PI * 2, el = (Math.random() - 0.3) * 0.9;
      let px = x, py = y, pz = z;
      const dirX = Math.cos(a) * Math.cos(el), dirY = Math.sin(el), dirZ = Math.sin(a) * Math.cos(el);
      pts.push(new THREE.Vector3(px, py, pz));
      for (let s = 1; s <= segs; s++) {
        px += dirX * 2.4 + (Math.random() - 0.5) * 1.6;
        py += dirY * 2.4 + (Math.random() - 0.5) * 1.6;
        pz += dirZ * 2.4 + (Math.random() - 0.5) * 1.6;
        pts.push(new THREE.Vector3(px, py, Math.max(0.1, pz) === pz ? pz : pz));
      }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
      addFX(line, 0.3 + Math.random() * 0.2, (mm, k) => { mm.material.opacity = (Math.random() > 0.4 ? 1 : 0.2) * (1 - k); });
    }
  }
  // tumbling solid chunks (ice shards, coins, prisms) with gravity + spin
  function fxChunks(x, y, z, geoFn, matFn, n, spd, grav) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geoFn(), matFn());
      m.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2, el = Math.random() * Math.PI * 0.5;
      const v = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el) + 0.3, Math.sin(a) * Math.cos(el)).multiplyScalar(spd * (0.5 + Math.random() * 0.8));
      const rv = new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      addFX(m, 1.1 + Math.random() * 0.5, (mm, k, dt2) => {
        v.y -= (grav || 22) * dt2;
        mm.position.addScaledVector(v, dt2);
        if (mm.position.y < 0.2) { mm.position.y = 0.2; v.y = Math.abs(v.y) * 0.4; v.x *= 0.8; v.z *= 0.8; }
        mm.rotation.x += rv.x * dt2; mm.rotation.y += rv.y * dt2; mm.rotation.z += rv.z * dt2;
        if (mm.material.transparent) mm.material.opacity = Math.min(1, 2 - k * 2);
      });
    }
  }
  // spiral swirl of glowing points orbiting the burst centre (galaxy)
  function fxSwirl(x, y, z, colors, n) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), ang = [], rad = [], hgt = [];
    for (let i = 0; i < n; i++) {
      ang.push(Math.random() * Math.PI * 2); rad.push(0.5 + Math.random() * 1.5); hgt.push(Math.random() * 2 - 0.5);
      const c = new THREE.Color(colors[i % colors.length]);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.4, vertexColors: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
    addFX(pts, 1.4, (mm, k, dt2) => {
      const p = mm.geometry.attributes.position;
      for (let i = 0; i < n; i++) {
        ang[i] += dt2 * (3.5 - rad[i] * 0.15);
        rad[i] += dt2 * 9; hgt[i] += dt2 * (2 + (i % 5));
        p.setXYZ(i, x + Math.cos(ang[i]) * rad[i], y + hgt[i] * 0.4, z + Math.sin(ang[i]) * rad[i]);
      }
      p.needsUpdate = true;
      mm.material.opacity = 1 - k;
    });
  }
  // rising column of fire (phoenix): staged upward bursts
  function fxColumn(x, y, z, colors, dur) {
    let emitted = 0;
    const dummy = new THREE.Object3D();
    addFX(new THREE.Group(), dur, (mm, k, dt2) => {
      emitted += dt2 * 90;
      while (emitted > 1) {
        emitted -= 1;
        const a = Math.random() * Math.PI * 2, r = Math.random() * 1.6;
        spawnParticle(x + Math.cos(a) * r, y + k * 10, z + Math.sin(a) * r,
          colors[(Math.random() * colors.length) | 0],
          Math.cos(a) * 2, 14 + Math.random() * 8, Math.sin(a) * 2,
          0.5 + Math.random() * 0.3, 1.2);
      }
    });
  }
  let shockwaves = [];
  function addShockwave(x, y, z, color) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 1.2, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    ring.position.set(x, y, z); ring.rotation.x = -Math.PI / 2;
    scene.add(ring); shockwaves.push({ m: ring, t: 0, max: 0.7 });
  }
  function updateShockwaves(dt) {
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const s = shockwaves[i]; s.t += dt;
      const k = s.t / s.max;
      if (k >= 1) { scene.remove(s.m); s.m.material.dispose(); s.m.geometry.dispose(); shockwaves.splice(i, 1); continue; }
      const sc = 1 + k * 30; s.m.scale.set(sc, sc, sc);
      s.m.material.opacity = 0.8 * (1 - k);
    }
  }
  const _pgeo = new THREE.SphereGeometry(0.3, 6, 6);
  function spawnParticle(x, y, z, color, vx, vy, vz, life, size) {
    const m = new THREE.Mesh(_pgeo, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set(x, y, z); m.scale.setScalar(size || 1); scene.add(m);
    particles.push({ m, vx, vy, vz, life, max: life });
    if (particles.length > 700) { const old = particles.shift(); scene.remove(old.m); old.m.material.dispose(); }
  }
  function spawnBoostTrail(car) {
    const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw);
    const bx = car.pos.x - fx * 2.4, bz = car.pos.z - fz * 2.4;
    const col = Math.random() < 0.5 ? 0xffae3a : 0xfff0b0;
    spawnParticle(bx + (Math.random() - 0.5), car.pos.y + 0.6, bz + (Math.random() - 0.5), col,
      (Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2, 0.4, 0.7 + Math.random() * 0.5);
  }
  function spawnGoalExplosion(x, y, z, team) {
    // player's chosen explosion fires on blue goals; orange uses team colors
    const ex = (team === 'blue') ? (EXPLOSIONS.find(e => e.id === chosenExplosion) || EXPLOSIONS[0]) : EXPLOSIONS[0];
    const teamCols = team === 'blue' ? [0x2f8bff, 0x9ed1ff, 0xffffff] : [0xff8a1a, 0xffd23f, 0xffffff];
    const n = ex.count || 120, spMul = ex.speed || 1, rise = ex.rise != null ? ex.rise : 8;
    for (let i = 0; i < n; i++) {
      let col;
      if (ex.colors === 'rainbow') { const c = new THREE.Color(); c.setHSL((i / n), 0.9, 0.6); col = c.getHex(); }
      else if (ex.colors) col = ex.colors[i % ex.colors.length];
      else col = teamCols[i % teamCols.length];
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2;
      const sp = (14 + Math.random() * 26) * spMul;
      spawnParticle(x, y, z, col,
        Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + rise, Math.sin(a) * Math.cos(e) * sp,
        0.9 + Math.random() * 0.7, 1 + Math.random() * 1.5);
    }
    addShockwave(x, 0.3, z, ex.colors && ex.colors !== 'rainbow' ? ex.colors[0] : teamCols[0]);
    camShake = Math.max(camShake, 1.35);
    // ---- signature layers per explosion type (multi-layered, RocketGoal-style arcade juice) ----
    const mainCol = ex.colors && ex.colors !== 'rainbow' ? ex.colors[0] : teamCols[0];
    fxFlash(x, y, z, 0xffffff, 6);
    fxFlash(x, y, z, mainCol, 10);
    switch (ex.id) {
      case 'electric':
        fxBolts(x, y, z, 0x9fdcff, 14);
        fxBolts(x, y, z, 0xffffff, 6);
        fxSmoke(x, y, z, 0x4ab8ff, 5, true);
        setTimeout(() => fxBolts(x, y + 1, z, 0x9fdcff, 8), 140);
        break;
      case 'confetti':
        fxChunks(x, y, z,
          () => new THREE.PlaneGeometry(0.45, 0.7),
          () => new THREE.MeshBasicMaterial({ color: ex.colors[(Math.random() * ex.colors.length) | 0], side: THREE.DoubleSide, transparent: true }),
          36, 14, 9);
        fxSmoke(x, y, z, 0xffffff, 3, false);
        break;
      case 'toxic':
        fxChunks(x, y, z,
          () => new THREE.SphereGeometry(0.28 + Math.random() * 0.25, 8, 6),
          () => new THREE.MeshBasicMaterial({ color: 0x2bff4a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
          18, 12, 14);
        fxSmoke(x, y, z, 0x2bff4a, 8, true);
        fxSmoke(x, y + 1, z, 0x0a5a1a, 4, false);
        break;
      case 'prismatic': {
        for (let w = 1; w <= 3; w++) setTimeout(() => { const c = new THREE.Color(); c.setHSL(w / 3, 0.9, 0.6); addShockwave(x, 0.3 + w * 0.5, z, c.getHex()); }, w * 110);
        fxChunks(x, y, z,
          () => new THREE.TetrahedronGeometry(0.35 + Math.random() * 0.2),
          () => { const c = new THREE.Color(); c.setHSL(Math.random(), 0.9, 0.6); return new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }); },
          22, 13, 18);
        break;
      }
      case 'frostbite':
        fxChunks(x, y, z,
          () => new THREE.ConeGeometry(0.16 + Math.random() * 0.1, 0.9 + Math.random() * 0.6, 4),
          () => new THREE.MeshBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0.85 }),
          24, 13, 20);
        fxSmoke(x, y, z, 0x9fe8ff, 8, true);
        fxSmoke(x, y, z, 0xffffff, 4, false);
        break;
      case 'galaxy':
        fxSwirl(x, y, z, ex.colors, 90);
        fxSmoke(x, y, z, 0x8a4aff, 6, true);
        fxBolts(x, y, z, 0xff4ad8, 4);
        break;
      case 'gold':
        fxChunks(x, y, z,
          () => new THREE.CylinderGeometry(0.26, 0.26, 0.06, 12),
          () => new THREE.MeshStandardMaterial({ color: 0xffd24a, metalness: 0.95, roughness: 0.2, emissive: 0x6a4a00, emissiveIntensity: 0.5 }),
          26, 13, 22);
        fxSmoke(x, y, z, 0xffd24a, 6, true);
        break;
      case 'phoenix':
        fxColumn(x, y, z, ex.colors, 0.8);
        fxSmoke(x, y, z, 0xff5a1a, 8, true);
        fxSmoke(x, y + 2, z, 0x331008, 5, false);
        setTimeout(() => fxFlash(x, y + 8, z, 0xffd23f, 7), 500);
        break;
      default:
        fxBolts(x, y, z, 0xffffff, 4);
        fxSmoke(x, y, z, mainCol, 6, true);
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
    addShockwave(car.pos.x, 0.3, car.pos.z, 0xffffff);
    camShake = Math.max(camShake, 0.8);
    sfx('demo');
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
      if (power > 20) {   // hard touch: sparks + thump + a nudge of shake
        for (let sp2 = 0; sp2 < Math.min(14, (power - 14) | 0); sp2++) {
          const a2 = Math.random() * Math.PI * 2;
          spawnParticle(ball.pos.x, ball.pos.y, ball.pos.z, 0xfff0c0, Math.cos(a2) * power * 0.3, 3 + Math.random() * 6, Math.sin(a2) * power * 0.3, 0.3 + Math.random() * 0.2, 0.7);
        }
        camShake = Math.max(camShake, Math.min(0.5, power * 0.012));
        sfx('hit', power / 35);
      }
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
    // the ball bursts: freeze it, hide it, and replace it with the explosion
    ball.vel.set(0, 0, 0);
    if (ball.mesh) ball.mesh.visible = false;
    spawnGoalExplosion(ball.pos.x, ball.pos.y, ball.pos.z, team);
    const bx = ball.pos.x, by = ball.pos.y, bz = ball.pos.z;
    replayGoal = { x: bx, y: by, z: bz, team, frame: replayBuf.length - 1 };
    for (let i = 0; i < 40; i++) {   // white-hot core burst where the ball was
      const a = Math.random() * Math.PI * 2, e2 = Math.random() * Math.PI - Math.PI / 2, sp = 6 + Math.random() * 12;
      spawnParticle(bx, by, bz, 0xffffff, Math.cos(a) * Math.cos(e2) * sp, Math.sin(e2) * sp + 4, Math.sin(a) * Math.cos(e2) * sp, 0.5 + Math.random() * 0.4, 1.6);
    }
    setTimeout(() => addShockwave(bx, Math.max(0.4, by * 0.5), bz, 0xffffff), 130);
    sfx('goal'); duckMusic();
    const fl = DOM('flash'); if (fl) { fl.classList.add('go'); setTimeout(() => fl.classList.remove('go'), 140); }
    const cm = DOM('centerMsg'); if (cm) { cm.textContent = 'GOAL!'; cm.style.color = team === 'blue' ? '#46b9ff' : '#ff8a1a'; cm.classList.add('show'); }
    setTimeout(() => {
      if (cm) cm.classList.remove('show');
      if (replayBuf.length > 30) startReplay(); else finishGoal();
    }, 1400);
  }
  function finishGoal() { if (ball.mesh) ball.mesh.visible = true; if (overtime) { endMatch(); return; } kickoff(); }
  function startReplay() {
    replayPlaying = true; replayIdx = 0; replayHold = 0; state = 'replay';
    replayExploded = false;
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
      if (c.group) { c.group.position.set(s.x, s.y, s.z); c.group.rotation.y = s.yaw + (c.faceFix || 0); c.group.visible = s.vis; }
    }
    ball.pos.set(snap.bx, snap.by, snap.bz);
    if (ball.mesh) ball.mesh.position.copy(ball.pos);
    // the goal moment replays too: ball bursts again on camera
    if (!replayExploded && replayGoal && fi >= replayGoal.frame - 1) {
      replayExploded = true;
      if (ball.mesh) ball.mesh.visible = false;
      spawnGoalExplosion(replayGoal.x, replayGoal.y, replayGoal.z, replayGoal.team);
    }
    if (replayExploded && ball.mesh) ball.mesh.visible = false;
  }
  function endReplay() {
    replayPlaying = false;
    const rb = DOM('replayBar'); if (rb) rb.classList.remove('show');
    replayBuf = [];
    finishGoal();
  }
  function pauseGame() {
    state = 'paused';
    const pm = DOM('pauseMenu'); if (pm) pm.classList.remove('hide');
  }
  function resumeGame() {
    state = 'play';
    const pm = DOM('pauseMenu'); if (pm) pm.classList.add('hide');
  }
  function quitToMenu() {
    const pm = DOM('pauseMenu'); if (pm) pm.classList.add('hide');
    DOM('hud').classList.add('hide');
    const sp = DOM('speedo'); if (sp) sp.classList.add('hide');
    state = 'menu';
    const m = DOM('menu');
    const h1 = m.querySelector('h1'); if (h1) h1.textContent = 'ROCKET ARENA';
    buildMenu();
    m.classList.remove('hide');
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

  function spawnPadPop(x, z, big) {
    sfx('pad', big ? 1 : 0.5);
    const n = big ? 26 : 12;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (big ? 10 : 6) + Math.random() * 8;
      spawnParticle(x, 0.8, z, big ? 0xffd23f : 0xffe9a0, Math.cos(a) * sp, 4 + Math.random() * 8, Math.sin(a) * sp, 0.4 + Math.random() * 0.3, big ? 1.1 : 0.7);
    }
  }
  function updatePads(dt) {
    const t = performance.now() * 0.001;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (p.cd > 0) p.cd -= dt;
      const ready = p.cd <= 0;
      // respawn pop: scale-bounce the instant a pad refills
      if (ready && p.wasReady === false) p.pop = 0.35;
      p.wasReady = ready;
      if (p.pop > 0) p.pop -= dt;
      const popS = p.pop > 0 ? 1 + p.pop * 1.4 : 1;
      if (p.big) {
        p.orb.visible = ready; p.glow.visible = ready; if (p.beam) p.beam.visible = ready;
        if (p.ring) p.ring.material.opacity = ready ? 0.6 : 0.12;
        if (p.ring2) { p.ring2.material.opacity = ready ? 0.5 : 0.08; p.ring2.rotation.z += dt * 0.9; }
        if (ready) {
          p.orb.position.y = p.baseY + Math.sin(t * 2 + i) * 0.3;
          p.orb.rotation.y += dt * 1.6;
          p.orb.scale.setScalar(popS);
          if (p.sparks) p.sparks.forEach((sp, k) => {
            const a = t * 2.2 + k * (Math.PI * 2 / 3);
            sp.visible = true;
            sp.position.set(Math.cos(a) * 1.9, p.baseY + Math.sin(t * 3 + k * 2) * 0.6, Math.sin(a) * 1.9);
            sp.rotation.y += dt * 4;
          });
        } else if (p.sparks) p.sparks.forEach(sp => sp.visible = false);
      } else {
        if (p.gem) {
          p.gem.visible = true;
          p.gem.material.emissiveIntensity = ready ? (1.0 + Math.sin(t * 3 + i) * 0.3) : 0.06;
          if (ready) { p.gem.position.y = 0.85 + Math.sin(t * 2.4 + i) * 0.12; p.gem.rotation.y += dt * 2.2; p.gem.scale.setScalar(popS); }
          else { p.gem.position.y = 0.45; p.gem.scale.setScalar(0.7); }
        }
        if (p.glow) p.glow.material.opacity = ready ? (0.3 + Math.sin(t * 3 + i) * 0.1) : 0.05;
        if (p.ring) p.ring.material.opacity = ready ? 0.5 : 0.1;
      }
      if (!ready) continue;
      for (const car of allCars) {
        if (!car) continue;
        const dx = car.pos.x - p.x, dz = car.pos.z - p.z;
        if (dx * dx + dz * dz < p.radius * p.radius) {
          if (p.big) { if (car.boost < MAX_BOOSTAMT) { car.boost = MAX_BOOSTAMT; p.cd = p.max; spawnPadPop(p.x, p.z, true); } }
          else { if (car.boost < MAX_BOOSTAMT) { car.boost = Math.min(MAX_BOOSTAMT, car.boost + 12); p.cd = p.max; spawnPadPop(p.x, p.z, false); } }
          break;
        }
      }
    }
  }

  function syncVisual(car) {
    car.group.position.set(car.pos.x, car.pos.y, car.pos.z);
    car.group.rotation.y = car.yaw + (car.faceFix || 0);   // faceFix is cosmetic-only
    // dodge flip: full 360° pitch/roll over the flip duration
    if (car.flip) {
      car.flip.t += frameDt;
      const p = Math.min(1, car.flip.t / car.flip.dur);
      const e2 = 1 - Math.pow(1 - p, 2);   // ease-out
      car.group.rotation.x = -car.flip.pitch * Math.PI * 2 * e2;
      car.group.rotation.z = car.flip.roll * Math.PI * 2 * e2;
      if (p >= 1) { car.flip = null; car.group.rotation.x = 0; car.group.rotation.z = 0; }
    } else if (!car.onGround) {
      car.group.rotation.x *= 0.9; car.group.rotation.z *= 0.9;
    } else { car.group.rotation.x = 0; car.group.rotation.z = 0; }
    // forward speed along the car heading, for wheel roll
    const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw);
    const fSpeed = car.vel.x * fx + car.vel.z * fz;
    const steer = car._steer || 0;
    car.group.userData.wheels && car.group.userData.wheels.forEach(w => {
      if (w.userData.spinner) w.userData.spinner.rotation.x += fSpeed * 0.09;   // spin on inner
      if (w.userData.front) w.rotation.y = steer * 0.38;                          // steer on outer
    });
    // brake lights glow when reversing/braking
    if (car.group.userData.brakeLights) {
      const braking = ((car.human && keys.KeyS) || fSpeed < -1) ? 1 : 0;
      car.group.userData.brakeLights.forEach(m => { m.emissiveIntensity += ((braking ? 1.2 : 0) - m.emissiveIntensity) * 0.3; });
    }
    // boost flames: show + flicker when boosting
    if (car.group.userData.flames) {
      const on = !!car.boosting;
      car.group.userData.flames.forEach(fl => {
        fl.visible = on;
        if (on) {
          const flick = 0.8 + Math.random() * 0.5;
          fl.scale.set(flick, 0.8 + Math.random() * 0.7, flick);
          fl.material.opacity = 0.7 + Math.random() * 0.3;
        }
      });
    }
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
    // look straight ahead along the car's heading so 'forward' reads as forward on screen
    const aheadX = player.pos.x + fx * 14, aheadZ = player.pos.z + fz * 14;
    const look = new V3(aheadX, 2.5, aheadZ);
    camera.lookAt(look);
    // camera shake (decays)
    if (camShake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * camShake;
      camera.position.y += (Math.random() - 0.5) * camShake;
      camera.position.z += (Math.random() - 0.5) * camShake;
    }
  }

  function updateHUD() {
    const kEl = DOM('kph'); if (kEl && player) kEl.textContent = Math.round(Math.hypot(player.vel.x, player.vel.z) * 3.6);
    // live jumbotron: redraw score + clock (cheap 512x288 canvas)
    if (arenaGrp && arenaGrp.userData.jumbo) {
      const J = arenaGrp.userData.jumbo, g = J.ctx;
      const mm = Math.max(0, Math.floor(matchTime / 60)), ss = Math.max(0, Math.floor(matchTime % 60));
      const clock = mm + ':' + (ss < 10 ? '0' : '') + ss;
      const key = score.blue + '|' + score.orange + '|' + clock;
      if (J.last !== key) {
        J.last = key;
        g.fillStyle = '#070b14'; g.fillRect(0, 0, 512, 288);
        g.fillStyle = '#10182a'; g.fillRect(0, 0, 512, 60);
        g.font = 'bold 44px sans-serif'; g.textAlign = 'center';
        g.fillStyle = '#9ecbff'; g.fillText('ROCKET ARENA', 256, 44);
        g.font = 'bold 120px sans-serif';
        g.fillStyle = '#46b9ff'; g.fillText(score.blue, 140, 190);
        g.fillStyle = '#556'; g.fillText(':', 256, 182);
        g.fillStyle = '#ff8a1a'; g.fillText(score.orange, 372, 190);
        g.font = 'bold 56px sans-serif'; g.fillStyle = '#eaf2ff'; g.fillText(clock, 256, 262);
        J.tex.needsUpdate = true;
      }
    }
    DOM('sB').textContent = score.blue; DOM('sO').textContent = score.orange;
    const m = Math.floor(matchTime / 60), s = Math.floor(matchTime % 60);
    if (practice) { DOM('timer').textContent = 'FREE PLAY'; } else if (overtime) { const om = Math.floor(otTime / 60), os = Math.floor(otTime % 60); DOM('timer').textContent = '+OT ' + om + ':' + (os < 10 ? '0' : '') + os; } else { DOM('timer').textContent = m + ':' + (s < 10 ? '0' : '') + s; } DOM('timer').classList.toggle('low', matchTime < 60 && state === 'play');
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
      if (matchTime <= 0 && !practice) {
        if (score.blue !== score.orange) { endMatch(); }
        else if (!overtime) {
          overtime = true; matchTime = 0;
          const cm = DOM('centerMsg');
          if (cm) { cm.textContent = 'OVERTIME'; cm.style.color = '#ffd23f'; cm.classList.add('show'); setTimeout(() => cm.classList.remove('show'), 1800); }
          sfx('goal');
        }
      }
      if (overtime && state === 'play') otTime += dt;
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
    updateShockwaves(dt);
    updateFX(dt);
    updateBallLook(dt);
    if (camShake > 0.001) camShake *= Math.exp(-6 * dt); else camShake = 0;
    // animate arena accents
    if (arenaGrp && arenaGrp.userData.animated) {
      const t = performance.now() * 0.001;
      const a = arenaGrp.userData.animated;
      if (a.center) a.center.material.opacity = 0.25 + Math.abs(Math.sin(t * 1.5)) * 0.3;
      if (a.led) { const hue = (t * 0.05) % 1; a.led.children.forEach(s => s.material.color.setHSL(hue, 0.8, 0.6)); }
      if (arenaGrp.userData.sweeps) arenaGrp.userData.sweeps.children.forEach(pv => { pv.rotation.y += pv.userData.sweepSpeed * dt; });
    }
    // animate theme atmosphere (embers rise, snow falls, etc.)
    if (themePropGroup) {
      const tNow = performance.now() * 0.001;
      themePropGroup.children.forEach(o => {
        if (o.userData && o.userData.aurora) { o.rotation.z = Math.sin(tNow * 0.4 + o.userData.aurora.phase) * 0.12; o.material.opacity = 0.7 + Math.sin(tNow * 0.7 + o.userData.aurora.phase) * 0.3; }
        if (o.userData && o.userData.cloud) { o.position.x += o.userData.cloud.v * dt; if (o.position.x > ARENA.W * 1.4) o.position.x = -ARENA.W * 1.4; }
        if (o.userData && o.userData.ray) { o.material.opacity = 0.55 + Math.sin(tNow * 0.9 + o.userData.ray.phase) * 0.35; }
        if (o.userData && o.userData.drift) {
          const arr = o.geometry.attributes.position.array;
          const rise = o.userData.rise;
          for (let i = 1; i < arr.length; i += 3) {
            arr[i] += (rise ? 1 : -1) * dt * 4;
            if (rise && arr[i] > ARENA.WALL_H * 1.4) arr[i] = 0;
            if (!rise && arr[i] < 0) arr[i] = ARENA.WALL_H * 1.4;
          }
          o.geometry.attributes.position.needsUpdate = true;
        }
      });
    }
    frameDt = dt;
    for (const c of allCars) syncVisual(c);
    if (ball) {
      ball.mesh.position.copy(ball.pos);
      // roll the ball based on horizontal velocity (perpendicular to motion)
      const r = ball.radius || BALL_R;
      ball.mesh.rotation.x += (ball.vel.z / r) * dt;
      ball.mesh.rotation.z -= (ball.vel.x / r) * dt;
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
