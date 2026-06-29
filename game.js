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
  let matchTime = 300, matchLen = 300, chosenCarId = 'car1', chosenMutator = 'none';
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
  const CAR_REST_Y = 0, MAX_SPEED = 38, MAX_BOOST = 60, ACCEL = 55, REVERSE = 30;
  const STEER = 2.8, GRIP = 9, GRAVITY = 55, JUMP_V = 22, BOOST_ACCEL = 50, BOOST_USE = 33;
  const MAX_BOOSTAMT = 100, START_BOOST = 33; // RL-style 0..100 boost meter
  const BALL_R = 2.2, CAR_R = 2.4;

  const DOM = id => document.getElementById(id);

  function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05080f);
    scene.fog = new THREE.Fog(0x05080f, 120, 360);

    camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.5, 1200);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (THREE.ACESFilmicToneMapping) renderer.toneMapping = THREE.ACESFilmicToneMapping;
    DOM('app').appendChild(renderer.domElement);

    arenaGrp = buildArena(scene);
    lights = buildLighting(scene, renderer);
    pads = buildBoostPads(scene);

    // ball
    const ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R, 32, 24),
      new THREE.MeshStandardMaterial({ color: 0xdfe6ef, metalness: 0.5, roughness: 0.35, envMapIntensity: 1.2 })
    );
    ballMesh.castShadow = true; scene.add(ballMesh);
    ball = { mesh: ballMesh, pos: new V3(0, BALL_R, 0), vel: new V3(), radius: BALL_R };

    clock = new THREE.Clock();
    buildMenu();
    DOM('loading').classList.add('hide');
    DOM('menu').classList.remove('hide');

    addEventListener('resize', onResize);
    addEventListener('keydown', e => { keys[e.code] = true; if (['Space','ArrowUp','ArrowDown'].includes(e.code)) e.preventDefault();
      if (e.code === 'Space' && state === 'play') jump(player);
      if (e.code === 'KeyC') ballCam = !ballCam; });
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
      b.className = 'carbtn' + (c.id === chosenCarId ? ' on' : '');
      b.textContent = c.name;
      b.onclick = () => { chosenCarId = c.id; [...pick.children].forEach(x => x.classList.remove('on')); b.classList.add('on'); };
      pick.appendChild(b);
    });
    DOM('play').onclick = startMatch;
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
    // player = blue slot 0
    const pGroup = await loadCar(pEntry, 0x2f8bff, 0x9ed1ff);
    scene.add(pGroup);
    player = makeCar(pGroup, 'blue'); player.isPlayer = true; player.human = true;
    blueCars.push(player);
    // blue AI teammates
    for (let i = 1; i < teamSize; i++) {
      const e = CAR_CATALOG[(CAR_CATALOG.indexOf(pEntry) + i) % CAR_CATALOG.length];
      const g = await loadCar(e, 0x2f8bff, 0x9ed1ff); scene.add(g);
      blueCars.push(makeCar(g, 'blue'));
    }
    // orange opponents
    for (let i = 0; i < teamSize; i++) {
      const e = CAR_CATALOG[(CAR_CATALOG.indexOf(pEntry) + 3 + i) % CAR_CATALOG.length];
      const g = await loadCar(e, 0xff7a1a, 0xffd23f); scene.add(g);
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
  function kickoff() {
    placeTeam(blueCars, 1);
    placeTeam(orangeCars, -1);
    ball.pos.set(0, ball.radius || BALL_R, 0); ball.vel.set(0, 0, 0);
    if (pads) pads.forEach(p => p.cd = 0);
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
      const fSpeed = car.vel.x * _f.x + car.vel.z * _f.z;
      const dirSign = speed < 2 ? (input.f >= 0 ? 1 : -1) : (fSpeed >= 0 ? 1 : -1);
      car.yaw += (-input.s) * STEER * (0.4 + 0.6 * Math.min(1, speed / 6)) * dt * dirSign;
      fwd(car.yaw, _f);
      let accel = input.f > 0 ? ACCEL : input.f < 0 ? -REVERSE : 0;
      if (boostWanted) { accel += BOOST_ACCEL * (mut.boost || 1); car.boost = Math.max(0, car.boost - BOOST_USE * dt); car.boosting = true; }
      else car.boosting = false;
      car.vel.x += _f.x * accel * dt; car.vel.z += _f.z * accel * dt;
      // grip: kill lateral velocity
      const vF = car.vel.x * _f.x + car.vel.z * _f.z;
      let latx = car.vel.x - _f.x * vF, latz = car.vel.z - _f.z * vF;
      const keep = Math.exp(-GRIP * dt); latx *= keep; latz *= keep;
      let nf = vF; if (input.f === 0 && !boostWanted) { nf *= Math.exp(-1.0 * dt); if (Math.abs(nf) < 0.4) nf = 0; }
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
    let tx, tz;
    // role: only the closest non-human car on the team chases; others hold a defensive spot
    const team = car.team === 'blue' ? blueCars : orangeCars;
    let closest = null, cd = 1e9;
    for (const c of team) { if (c.human) continue; const dd = (c.pos.x - ball.pos.x) ** 2 + (c.pos.z - ball.pos.z) ** 2; if (dd < cd) { cd = dd; closest = c; } }
    const isChaser = (car === closest) || team.filter(c => !c.human).length <= 1;
    const ownZ = car.team === 'blue' ? HALF_L : -HALF_L;
    if (car.boost < 20) { const pad = nearestBigPad(car); if (pad) { tx = pad.x; tz = pad.z; } }
    if (tx === undefined) {
      if (isChaser) {
        const atkZ = car.team === 'blue' ? -HALF_L : HALF_L;
        let gx = ball.pos.x, gz = ball.pos.z - atkZ; const gl = Math.hypot(gx, gz) || 1; gx /= gl; gz /= gl;
        tx = ball.pos.x + gx * 6; tz = ball.pos.z + gz * 6;
      } else {
        // defender: hold between ball and own goal, offset by slot
        const slot = team.indexOf(car);
        tx = ball.pos.x * 0.4 + (slot % 3 - 1) * HALF_W * 0.3;
        tz = ownZ * 0.55;
      }
    }
    const dx = tx - car.pos.x, dz = tz - car.pos.z;
    const want = Math.atan2(-dx, -dz);
    let d = want - car.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    const dist = Math.hypot(dx, dz);
    return { f: dist > 4 ? 1 : 0.2, s: Math.max(-1, Math.min(1, d * 2)), boost: isChaser && car.boost > 6 && Math.abs(d) < 0.5 && dist > 12 };
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
    score[team]++; state = 'goal';
    spawnGoalExplosion(ball.pos.x, ball.pos.y, ball.pos.z, team);
    if (ball.mesh) ball.mesh.visible = false;
    setTimeout(() => { if (ball.mesh) ball.mesh.visible = true; kickoff(); }, 1800);
  }
  function endMatch() {
    state = 'ended';
    const winner = score.blue > score.orange ? 'BLUE WINS' : score.orange > score.blue ? 'ORANGE WINS' : 'DRAW';
    const m = DOM('menu');
    DOM('hud').classList.add('hide');
    // reuse the menu screen as a result screen
    const h1 = m.querySelector('h1'), sub = m.querySelector('.sub');
    if (h1) h1.textContent = winner;
    if (sub) sub.textContent = score.blue + ' : ' + score.orange + '  ·  press PLAY for a rematch';
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
    if (!player) { camera.position.set(0, 40, 90); camera.lookAt(0, 0, 0); return; }
    // ball-cam: orient behind the car along the car->ball direction; else behind the car's heading
    let yaw;
    if (ballCam) {
      const dx = ball.pos.x - player.pos.x, dz = ball.pos.z - player.pos.z;
      yaw = Math.atan2(-dx, -dz) + camYaw;
    } else {
      yaw = player.yaw + camYaw;
    }
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const dist = 18, height = 8 + camPitch * 7;
    const cx = player.pos.x - fx * dist;
    const cz = player.pos.z - fz * dist;
    camera.position.lerp(new V3(cx, player.pos.y + height, cz), 1 - Math.exp(-7 * dt));
    const look = new V3().copy(player.pos).lerp(ball.pos, 0.3); look.y += 2;
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
      if (cm) { cm.textContent = Math.ceil(countdown); cm.classList.add('show'); }
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
      // supersonic indicator
      const ss = DOM('ssIndic');
      if (ss && player) { const sp = Math.hypot(player.vel.x, player.vel.z); ss.classList.toggle('show', sp > 33); }
    }
    updateParticles(dt);
    for (const c of allCars) syncVisual(c);
    if (ball) ball.mesh.position.copy(ball.pos);
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
