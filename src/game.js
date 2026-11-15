// IRON CANOPY — Operation Emberfall. An original run-and-gun stage.
(() => {
'use strict';
const cv = document.getElementById('game'), ctx = cv.getContext('2d');
const W = 1280, H = 720, META = window.SPRITE_META;
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------------ assets
const IMG = {};
const FILES = {
  jungle: 'assets/bg/jungle.jpg', fortress: 'assets/bg/fortress.jpg', title: 'assets/bg/title.jpg',
  hero: 'assets/sprites/hero.png', arm: 'assets/sprites/hero_arm.png', trooper: 'assets/sprites/trooper.png',
  heavy: 'assets/sprites/heavy.png', turretBase: 'assets/sprites/turret_base.png', turretGun: 'assets/sprites/turret_gun.png',
  drone: 'assets/sprites/drone.png', carrier: 'assets/sprites/carrier.png', crates: 'assets/sprites/crates.png',
  boss: 'assets/sprites/boss.png', tileGround: 'assets/sprites/tile_ground.png', tileSteel: 'assets/sprites/tile_steel.png',
  platWood: 'assets/sprites/plat_wood.png', platSteel: 'assets/sprites/plat_steel.png',
};
let loaded = 0;
const total = Object.keys(FILES).length;
for (const k in FILES) {
  const im = new Image();
  im.onload = im.onerror = () => { loaded++; };
  im.src = FILES[k];
  IMG[k] = im;
}

// ------------------------------------------------------------------ input
const keys = {}, pressed = {};
addEventListener('keydown', e => {
  if (!keys[e.code]) pressed[e.code] = true;
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  Sfx.init();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
document.querySelectorAll('#touch .b').forEach(b => {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); Sfx.init(); if (!keys[k]) pressed[k] = true; keys[k] = true; b.classList.add('on'); };
  const off = e => { e.preventDefault(); keys[k] = false; b.classList.remove('on'); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off);
  b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
});
const pad = { l: 0, r: 0, u: 0, d: 0, jump: 0, fire: 0, hold: 0, start: 0, pj: 0, ps: 0 };
function pollPad() {
  const g = (navigator.getGamepads ? navigator.getGamepads() : [])[0];
  pad.pj = pad.jump; pad.ps = pad.start;
  if (!g) { pad.l = pad.r = pad.u = pad.d = pad.jump = pad.fire = pad.hold = pad.start = 0; return; }
  const B = i => g.buttons[i] && g.buttons[i].pressed;
  pad.l = g.axes[0] < -0.4 || B(14); pad.r = g.axes[0] > 0.4 || B(15);
  pad.u = g.axes[1] < -0.4 || B(12); pad.d = g.axes[1] > 0.4 || B(13);
  pad.jump = B(0); pad.fire = B(2) || B(7); pad.hold = B(5) || B(4); pad.start = B(9);
  if (pad.jump || pad.start) Sfx.init();
}
const In = {
  get left() { return keys.ArrowLeft || keys.KeyA || pad.l; },
  get right() { return keys.ArrowRight || keys.KeyD || pad.r; },
  get up() { return keys.ArrowUp || keys.KeyW || pad.u; },
  get down() { return keys.ArrowDown || keys.KeyS || pad.d; },
  get fire() { return keys.KeyX || keys.KeyJ || pad.fire; },
  get hold() { return keys.ShiftLeft || keys.ShiftRight || keys.KeyL || pad.hold; },
  get jumpHeld() { return keys.KeyZ || keys.KeyK || keys.Space || pad.jump; },
  get jump() { return pressed.KeyZ || pressed.KeyK || pressed.Space || (pad.jump && !pad.pj); },
  get start() { return pressed.Enter || (pad.start && !pad.ps); },
};

// ------------------------------------------------------------------ state
let state = 'TITLE', time = 0, camX = 0, shake = 0, score = 0, stageTime = 0, banner = null;
let hiscore = 0;
try { hiscore = +localStorage.getItem('ironcanopy.hi') || 0; } catch (e) {}
let P, bullets, ebullets, enemies, pickups, parts, boss, triggers, spawnT, arenaCarrierT, endT;

const WEAPONS = {
  RIFLE:   { cd: 0.13, color: '#ffe36a', sfx: 'rifle' },
  SCATTER: { cd: 0.27, color: '#ff8a2a', sfx: 'scatter' },
  LASER:   { cd: 0.22, color: '#6af4ff', sfx: 'laser' },
  RAPID:   { cd: 0.06, color: '#fff36a', sfx: 'rapid' },
};
const CRATE = { S: 'SCATTER', L: 'LASER', R: 'RAPID' };

function reset() {
  camX = 0; score = 0; stageTime = 0; shake = 0; banner = null; endT = 0;
  P = { x: 140, y: GROUND_Y, vx: 0, vy: 0, w: 34, h: 84, facing: 1, grounded: true, crouch: false, ax: 1, ay: 0,
        hp: 5, lives: 3, weapon: 'RIFLE', invuln: 2, cool: 0, jumps: 0, coyote: 0, dropT: 0, anim: 0, muzzle: 0,
        checkpoint: 140, safeX: 140, deadT: 0, onPlat: false };
  bullets = []; ebullets = []; pickups = []; parts = [];
  enemies = Level.enemies.map(e => makeEnemy(e.t, e.x, e.y || GROUND_Y));
  triggers = Level.triggers.map(t => ({ ...t, done: false }));
  boss = null; spawnT = 3; arenaCarrierT = 12;
}

function makeEnemy(t, x, y, o = {}) {
  const base = { t, x, y, vx: 0, vy: 0, flash: 0, active: false, anim: rand(0, 1), cd: rand(0.8, 2), dir: -1 };
  const kind = {
    trooper: { w: 34, h: 84, hp: 2, pts: 100 },
    heavy:   { w: 60, h: 120, hp: 14, pts: 500, burst: 0 },
    turret:  { w: 76, h: 76, hp: 9, pts: 300, ang: Math.PI },
    drone:   { w: 70, h: 50, hp: 3, pts: 150, air: true, ox: rand(-160, 160), oy: rand(-300, -200) },
    carrier: { w: 70, h: 90, hp: 2, pts: 50, air: true },
  }[t];
  return Object.assign(base, kind, o);
}

// ------------------------------------------------------------------ world queries
function surfaceBelow(x, hw, prevY, newY, skipPlat) {
  let best = null;
  if (prevY <= GROUND_Y + 1 && newY >= GROUND_Y) {
    for (const g of Level.ground) if (x + hw > g.x && x - hw < g.x + g.w) { best = { y: GROUND_Y, plat: false }; break; }
  }
  if (!skipPlat) {
    for (const p of Level.platforms) {
      if (x + hw > p.x && x - hw < p.x + p.w && prevY <= p.y + 1 && newY >= p.y && (!best || p.y < best.y)) best = { y: p.y, plat: true };
    }
  }
  return best;
}
const groundAt = x => Level.ground.some(g => x > g.x && x < g.x + g.w);
function supportAt(x, y) {
  if (Math.abs(y - GROUND_Y) < 3) return groundAt(x);
  return Level.platforms.some(p => Math.abs(p.y - y) < 3 && x > p.x && x < p.x + p.w);
}
function snapToGround(x) {
  if (groundAt(x)) return x;
  let best = x, bd = 1e9;
  for (const g of Level.ground) {
    for (const c of [g.x + 50, g.x + g.w - 50]) if (Math.abs(c - x) < bd && c > camX + 40) { bd = Math.abs(c - x); best = c; }
  }
  return best;
}
const rectOf = e => e.air ? [e.x - e.w / 2, e.y - e.h / 2, e.w, e.h] : [e.x - e.w / 2, e.y - e.h, e.w, e.h];
const playerRect = () => [P.x - 13, P.y - (P.crouch ? 50 : 80), 26, P.crouch ? 50 : 80];
const overlap = (a, b) => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];

// ------------------------------------------------------------------ particles
function spark(x, y, n, color, speed = 300, life = 0.4, grav = 600) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), s = rand(0.2, 1) * speed;
    parts.push({ k: 0, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.5, 1) * life, max: life, size: rand(2, 5), color, grav });
  }
}
function smoke(x, y, n, size = 22) {
  for (let i = 0; i < n; i++) parts.push({ k: 1, x: x + rand(-12, 12), y: y + rand(-12, 12), vx: rand(-40, 40), vy: rand(-90, -20),
    life: rand(0.5, 1.1), max: 1.1, size: rand(0.6, 1.2) * size, color: '#40454d', grav: -30 });
}
function explode(x, y, big = 1) {
  parts.push({ k: 2, x, y, vx: 0, vy: 0, life: 0.28, max: 0.28, size: 70 * big, color: '#fff3c0', grav: 0 });
  spark(x, y, 14 * big, '#ffb347', 420 * big, 0.6);
  spark(x, y, 8 * big, '#ff5a1f', 260 * big, 0.8);
  smoke(x, y, 6 * big, 26 * big);
  shake = Math.max(shake, 6 * big);
  Sfx.play(big > 1.5 ? 'bigBoom' : 'boom');
  if (parts.length > 700) parts.splice(0, parts.length - 700);
}

// ------------------------------------------------------------------ player
function muzzlePos() {
  const f = heroFrame(), sh = META.hero.shoulder[f], a = aimAngle();
  const sx = (sh[0] - 128) / 2, sy = (sh[1] - META.hero.ground) / 2;
  const mx = (META.hero_arm.muzzle[0] - META.hero_arm.pivot[0]) / 2, my = (META.hero_arm.muzzle[1] - META.hero_arm.pivot[1]) / 2;
  const lx = sx + Math.cos(a) * mx - Math.sin(a) * my, ly = sy + Math.sin(a) * mx + Math.cos(a) * my;
  return [P.x + lx * P.facing, P.y + ly];
}
const aimAngle = () => Math.atan2(P.ay, Math.abs(P.ax) < 0.01 ? 0.0001 : Math.abs(P.ax));
function heroFrame() {
  if (P.crouch) return 11;
  if (!P.grounded) return P.vy < 0 ? 9 : 10;
  if (Math.abs(P.vx) > 10) return 1 + Math.floor(P.anim * 14) % 8;
  return 0;
}

function fire() {
  const w = WEAPONS[P.weapon], [mx, my] = muzzlePos();
  const base = Math.atan2(P.ay, P.ax);
  const shot = (a, sp, o) => bullets.push(Object.assign({ x: mx, y: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg: 1, r: 5, life: 1.2, color: w.color }, o));
  if (P.weapon === 'SCATTER') for (const d of [-0.28, -0.14, 0, 0.14, 0.28]) shot(base + d, 820, { r: 6, life: 0.55 });
  else if (P.weapon === 'LASER') shot(base, 1700, { dmg: 2, r: 5, pierce: true, hit: new Set(), len: 90 });
  else if (P.weapon === 'RAPID') shot(base + rand(-0.05, 0.05), 1100, { dmg: 0.7, r: 4 });
  else shot(base, 980, {});
  P.cool = w.cd; P.muzzle = 0.06;
  Sfx.play(w.sfx);
}

function hurt(n, force) {
  if (P.deadT > 0 || (!force && P.invuln > 0)) return;
  P.hp -= n; P.invuln = 1.4; shake = Math.max(shake, 9);
  spark(P.x, P.y - 45, 12, '#ff8a2a');
  if (P.hp <= 0) {
    explode(P.x, P.y - 40, 1.6); Sfx.play('die');
    P.lives--; P.deadT = 1.4; P.weapon = 'RIFLE';
  } else { Sfx.play('hurt'); P.vy = Math.min(P.vy, -260); }
}

function respawn() {
  P.hp = 5; P.invuln = 2.6; P.vx = 0; P.vy = 0; P.x = P.checkpoint; P.y = GROUND_Y - 160; P.jumps = 0;
  camX = boss ? ARENA_X : clamp(P.checkpoint - 420, 0, ARENA_X);
  ebullets.length = 0;
}

function updatePlayer(dt) {
  if (P.deadT > 0) {
    P.deadT -= dt;
    if (P.deadT <= 0) { if (P.lives <= 0) { state = 'OVER'; Sfx.stopMusic(); saveHi(); } else respawn(); }
    return;
  }
  const l = In.left, r = In.right, u = In.up, d = In.down, hold = In.hold;
  if (l && !r) P.facing = -1; else if (r && !l) P.facing = 1;
  P.crouch = !!(d && P.grounded && !(l || r) || (d && P.grounded && hold));
  const move = (P.crouch || hold) ? 0 : (r ? 1 : 0) - (l ? 1 : 0);
  P.vx = move * 300;
  // aim
  const side = l || r;
  if (P.crouch) { P.ax = P.facing; P.ay = 0; }
  else if (u && side) { P.ax = P.facing * 0.7071; P.ay = -0.7071; }
  else if (d && side) { P.ax = P.facing * 0.7071; P.ay = 0.7071; }
  else if (u) { P.ax = 0; P.ay = -1; }
  else if (d && !P.grounded) { P.ax = 0; P.ay = 1; }
  else { P.ax = P.facing; P.ay = 0; }
  // jump / drop / jet boost
  P.coyote = P.grounded ? 0.09 : P.coyote - dt;
  if (In.jump) {
    if (P.coyote > 0) {
      if (d && P.onPlat) { P.dropT = 0.22; P.y += 3; P.grounded = false; P.coyote = 0; }
      else { P.vy = -760; P.grounded = false; P.coyote = 0; Sfx.play('jump'); }
    } else if (P.jumps < 1) {
      P.jumps++; P.vy = -640; Sfx.play('jet');
      for (let i = 0; i < 14; i++) parts.push({ k: 0, x: P.x - P.facing * 16, y: P.y - 40, vx: rand(-60, 60) - P.facing * 40, vy: rand(150, 420),
        life: rand(0.15, 0.4), max: 0.4, size: rand(3, 7), color: i % 2 ? '#6af4ff' : '#ffffff', grav: 0 });
    }
  }
  if (!In.jumpHeld && P.vy < -280) P.vy = -280;
  P.dropT -= dt;
  P.vy = Math.min(P.vy + 2000 * dt, 1100);
  // horizontal move (pits have walls once you are below the floor line)
  let nx = clamp(P.x + P.vx * dt, camX + 22, Math.min(LEVEL_W - 22, camX + W - 22));
  if (P.y > GROUND_Y + 6) for (const g of Level.ground) if (nx + 15 > g.x && nx - 15 < g.x + g.w) nx = P.x;
  P.x = nx;
  const prevY = P.y;
  P.y += P.vy * dt;
  P.grounded = false; P.onPlat = false;
  if (P.vy >= 0) {
    const s = surfaceBelow(P.x, 12, prevY, P.y, P.dropT > 0);
    if (s) { P.y = s.y; P.vy = 0; P.grounded = true; P.onPlat = s.plat; P.jumps = 0; if (!s.plat) P.safeX = P.x; }
  }
  if (P.y > H + 80) {                       // fell into a pit
    hurt(1, true);
    if (P.deadT <= 0) { P.x = snapToGround(Math.max(P.safeX, camX + 90)); P.y = GROUND_Y - 170; P.vy = 0; P.invuln = 1.8; }
  }
  for (const c of Level.checkpoints) if (P.x > c && P.checkpoint < c) { P.checkpoint = c; banner = { text: 'CHECKPOINT', t: 1.4, small: true }; Sfx.play('pickup'); }
  if (P.grounded && Math.abs(P.vx) > 10) P.anim += dt;
  P.invuln -= dt; P.cool -= dt; P.muzzle -= dt;
  if (In.fire && P.cool <= 0) fire();
}

// ------------------------------------------------------------------ enemies
function eshot(x, y, a, sp, o = {}) {
  ebullets.push(Object.assign({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 8, grav: 0 }, o));
}
const aimAt = (x, y) => Math.atan2(P.y - 45 - y, P.x - x);

function killEnemy(e) {
  e.dead = true; score += e.pts;
  explode(e.x, e.air ? e.y : e.y - e.h / 2, e.t === 'heavy' || e.t === 'turret' ? 1.4 : 1);
  if (e.t === 'carrier') pickups.push({ x: e.x, y: e.y + 30, vy: -200, type: e.drop, t: 14, rest: false });
}

function updateEnemies(dt) {
  // reinforcements from the screen edges
  if (!boss) {
    spawnT -= dt;
    if (spawnT <= 0) {
      spawnT = lerp(2.8, 1.7, camX / ARENA_X);
      const right = Math.random() < 0.72, x = right ? camX + W + 40 : camX - 40;
      if (groundAt(x) && enemies.filter(e => e.t === 'trooper').length < 5 && x > 0)
        enemies.push(makeEnemy('trooper', x, GROUND_Y, { dir: right ? -1 : 1, active: true }));
    }
  }
  for (const tr of triggers) {
    if (tr.done || camX < tr.x) continue;
    tr.done = true;
    if (tr.drones) for (let i = 0; i < tr.drones; i++) enemies.push(makeEnemy('drone', camX + W + 80 + i * 110, 110 + i * 50));
    if (tr.carrier) enemies.push(makeEnemy('carrier', camX + W + 80, 170, { drop: tr.carrier }));
  }
  const pr = playerRect();
  for (const e of enemies) {
    if (!e.active) { if (e.x < camX + W + 70) e.active = true; else continue; }
    e.flash -= dt; e.anim += dt; e.cd -= dt;
    const dx = P.x - e.x, onScreen = e.x > camX - 20 && e.x < camX + W + 20;
    if (e.t === 'trooper') {
      if (e.grounded && !supportAt(e.x + e.dir * 26, e.y)) e.dir = -e.dir;
      if (e.grounded && Math.abs(dx) > 260 && Math.sign(dx) !== e.dir && e.cd < 0.4 && supportAt(e.x - e.dir * 26, e.y)) e.dir = -e.dir;
      e.x += e.dir * 175 * dt;
      const py = e.y; e.vy += 2000 * dt; e.y += e.vy * dt; e.grounded = false;
      const s = surfaceBelow(e.x, 10, py, e.y, false);
      if (s) { e.y = s.y; e.vy = 0; e.grounded = true; }
      if (e.cd <= 0 && onScreen && Math.sign(dx) === e.dir && Math.abs(dx) < 640 && Math.abs(P.y - e.y) < 70) {
        e.cd = rand(1.4, 2.2); eshot(e.x + e.dir * 50, e.y - 56, e.dir > 0 ? 0 : Math.PI, 420); Sfx.play('enemyShot');
      } else if (e.cd <= 0) e.cd = 0.5;
      if (e.y > H + 100 || e.x < camX - 400 || e.x > camX + W + 500) e.dead = true;
    } else if (e.t === 'heavy') {
      e.dir = dx < 0 ? -1 : 1;
      if (onScreen && e.cd <= 0) {
        const mx = e.x + e.dir * 68, my = e.y - 93;
        eshot(mx, my, aimAt(mx, my) + rand(-0.05, 0.05), 400, { r: 9 }); Sfx.play('enemyShot');
        e.burst++; e.cd = e.burst % 3 === 0 ? 2.1 : 0.16;
      }
    } else if (e.t === 'turret') {
      const cy = e.y - 46, want = aimAt(e.x, cy);
      let da = ((want - e.ang + Math.PI * 3) % TAU) - Math.PI;
      e.ang += clamp(da, -2.4 * dt, 2.4 * dt);
      if (onScreen && e.cd <= 0 && Math.abs(da) < 0.3 && Math.hypot(dx, P.y - e.y) < 780) {
        e.cd = 1.5; eshot(e.x + Math.cos(e.ang) * 70, cy + Math.sin(e.ang) * 70, e.ang, 360); Sfx.play('enemyShot');
      }
    } else if (e.t === 'drone') {
      const tx = P.x + e.ox, ty = Math.max(90, P.y + e.oy) + Math.sin(e.anim * 2.4) * 24;
      e.vx = lerp(e.vx, clamp((tx - e.x) * 2, -330, 330), 1 - Math.pow(0.02, dt));
      e.vy = lerp(e.vy, clamp((ty - e.y) * 2, -260, 260), 1 - Math.pow(0.02, dt));
      e.x += e.vx * dt; e.y += e.vy * dt; e.dir = dx < 0 ? -1 : 1;
      if (onScreen && e.cd <= 0) {
        e.cd = rand(1.7, 2.6); e.ox = rand(-220, 220);
        eshot(e.x, e.y + 20, aimAt(e.x, e.y + 20), 320); Sfx.play('enemyShot');
      }
    } else if (e.t === 'carrier') {
      e.x -= 150 * dt; e.y = 170 + Math.sin(e.anim * 2) * 26;
      if (e.x < camX - 120) e.dead = true;
    }
    if (!e.dead && e.t !== 'carrier' && overlap(pr, rectOf(e))) hurt(1);
  }
  enemies = enemies.filter(e => !e.dead);
}

// ------------------------------------------------------------------ boss
function startBoss() {
  boss = { x: LEVEL_W + 260, y: GROUND_Y, hp: 260, max: 260, st: 'enter', t: 0, n: 0, cycle: 0, flash: 0, anim: 0, phase: 1, beam: 0, warn: 0, tx: 8320 };
  banner = { text: 'WARNING — WARDEN MK-IV', t: 3.2, warn: true };
  Sfx.play('alarm'); Sfx.music('boss');
  enemies = enemies.filter(e => e.t !== 'trooper');
}
const bossCore = () => [boss.x - 88, boss.y - 172];

function updateBoss(dt) {
  const b = boss;
  b.flash -= dt; b.t -= dt;
  if (b.st === 'dying') {
    if (Math.random() < dt * 9) explode(b.x + rand(-150, 150), b.y - rand(30, 280), rand(0.8, 1.6));
    if (b.t <= 0) { explode(b.x, b.y - 150, 3); explode(b.x - 80, b.y - 200, 2.4); b.st = 'gone'; score += 10000; endT = 2.2; Sfx.stopMusic(); }
    return;
  }
  if (b.st === 'gone') return;
  const walking = b.st === 'enter' || b.st === 'walk';
  if (walking) {
    const d = b.tx - b.x;
    if (Math.abs(d) > 4) { b.x += Math.sign(d) * (b.st === 'enter' ? 170 : 90 * b.phase) * dt; b.anim += dt * (b.st === 'enter' ? 5 : 3.2); }
    if (Math.abs(d) <= 4 || (b.st === 'walk' && b.t <= 0)) {
      const order = b.phase === 1 ? ['cannon', 'mortar'] : ['cannon', 'beam', 'mortar', 'beam'];
      b.st = order[b.cycle++ % order.length]; b.n = 0; b.t = 0.5;
      if (b.st === 'beam') { b.t = 1.2; b.warn = 1.2; Sfx.play('charge'); }
    }
  } else if (b.st === 'cannon') {
    if (b.t <= 0) {
      const gx = b.x - 110, gy = b.y - 136, a = aimAt(gx, gy);
      for (const d of b.phase === 1 ? [-0.16, 0, 0.16] : [-0.3, -0.15, 0, 0.15, 0.3]) eshot(gx, gy, a + d, 430, { r: 10 });
      spark(gx, gy, 8, '#ffb347'); Sfx.play('scatter');
      b.t = 0.6 / b.phase; if (++b.n >= 3 + b.phase) nextWalk();
    }
  } else if (b.st === 'mortar') {
    if (b.t <= 0) {
      const x0 = b.x - 2, y0 = b.y - 247, T = 1.25, g = 900, tx = clamp(P.x + rand(-110, 110), ARENA_X + 30, b.x - 170);
      ebullets.push({ x: x0, y: y0, vx: (tx - x0) / T, vy: (GROUND_Y - y0 - 0.5 * g * T * T) / T, r: 12, grav: g, mortar: true, tx });
      smoke(x0, y0, 3, 16); Sfx.play('jet');
      b.t = 0.3 / b.phase; if (++b.n >= 4 + b.phase * 2) nextWalk();
    }
  } else if (b.st === 'beam') {
    if (b.warn > 0) { b.warn -= dt; if (b.warn <= 0) { b.beam = 1.25; Sfx.play('beam'); } }
    else {
      b.beam -= dt; shake = Math.max(shake, 4);
      if (P.y > GROUND_Y - 62 && P.x < b.x - 120) hurt(2);
      if (Math.random() < dt * 40) spark(rand(ARENA_X, b.x - 130), GROUND_Y - 6, 2, '#ff6a3a', 200, 0.4, -200);
      if (b.beam <= 0) nextWalk();
    }
  }
  if (b.phase === 1 && b.hp < b.max / 2) {
    b.phase = 2; banner = { text: 'REACTOR OVERLOAD', t: 2, warn: true }; Sfx.play('alarm');
    explode(b.x - 40, b.y - 250, 1.5);
    for (let i = 0; i < 2; i++) enemies.push(makeEnemy('drone', camX + W + 80 + i * 120, 120, { active: true }));
  }
  if (b.phase === 2 && Math.random() < dt * 5) smoke(b.x + rand(-80, 60), b.y - rand(200, 300), 1, 18);
  if (b.st !== 'enter' && overlap(playerRect(), [b.x - 140, b.y - 290, 290, 290])) hurt(1);
  function nextWalk() { b.st = 'walk'; b.t = 1.5 / b.phase; b.tx = rand(8120, 8480); }
}

// ------------------------------------------------------------------ projectiles & pickups
function updateBullets(dt) {
  for (const b of bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0 || b.x < camX - 40 || b.x > camX + W + 40 || b.y < -40 || b.y > H) { b.dead = true; continue; }
    if (b.y >= GROUND_Y + 4 && groundAt(b.x)) { b.dead = true; spark(b.x, GROUND_Y, 3, b.color, 160, 0.25); continue; }
    for (const e of enemies) {
      if (!e.active || e.dead) continue;
      const r = rectOf(e);
      if (b.x > r[0] - b.r && b.x < r[0] + r[2] + b.r && b.y > r[1] - b.r && b.y < r[1] + r[3] + b.r) {
        if (b.pierce) { if (b.hit.has(e)) continue; b.hit.add(e); } else b.dead = true;
        e.hp -= b.dmg; e.flash = 0.08; spark(b.x, b.y, 4, b.color, 220, 0.25); Sfx.play('hit');
        if (e.hp <= 0) killEnemy(e);
        if (!b.pierce) break;
      }
    }
    if (b.dead || !boss || boss.st === 'dying' || boss.st === 'gone') continue;
    const [cx, cy] = bossCore();
    const core = Math.hypot(b.x - cx, b.y - cy) < 50 + b.r;
    const body = b.x > boss.x - 150 && b.x < boss.x + 150 && b.y > boss.y - 290 && b.y < boss.y;
    if (core || body) {
      if (b.pierce) { if (b.hit.has(boss)) continue; b.hit.add(boss); } else b.dead = true;
      boss.hp -= b.dmg * (core ? 1 : 0.25);
      if (core) { boss.flash = 0.08; spark(b.x, b.y, 6, '#ffb347', 300, 0.35); Sfx.play('hit'); }
      else { spark(b.x, b.y, 3, '#cfe6ff', 200, 0.2); Sfx.play('ting'); }
      if (boss.hp <= 0) { boss.st = 'dying'; boss.t = 2.6; boss.beam = 0; boss.warn = 0; ebullets.length = 0; }
    }
  }
  bullets = bullets.filter(b => !b.dead);

  const pr = playerRect();
  for (const b of ebullets) {
    b.vy += b.grav * dt; b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.mortar) {
      if (Math.random() < dt * 30) smoke(b.x, b.y, 1, 9);
      if (b.y >= GROUND_Y - 4 && b.vy > 0) {
        b.dead = true; explode(b.x, GROUND_Y - 20, 1.5);
        if (Math.abs(P.x - b.x) < 80 && P.y > GROUND_Y - 90) hurt(1);
        continue;
      }
    }
    if (b.x < camX - 40 || b.x > camX + W + 40 || b.y < -300 || b.y > H + 40) { b.dead = true; continue; }
    if (b.x > pr[0] + 3 && b.x < pr[0] + pr[2] - 3 && b.y > pr[1] + 3 && b.y < pr[1] + pr[3] - 3) { b.dead = true; hurt(1); }
  }
  ebullets = ebullets.filter(b => !b.dead);

  for (const c of pickups) {
    c.t -= dt;
    if (!c.rest) {
      const py = c.y; c.vy += 1400 * dt; c.y += c.vy * dt;
      const s = c.vy > 0 && surfaceBelow(c.x, 16, py + 24, c.y + 24, false);
      if (s) { c.y = s.y - 24; c.rest = true; }
      if (c.y > H + 60) c.t = 0;
    }
    if (P.deadT <= 0 && Math.abs(P.x - c.x) < 40 && Math.abs(P.y - 42 - c.y) < 60) {
      c.t = 0; score += 500; Sfx.play('pickup'); spark(c.x, c.y, 16, '#ffffff', 260, 0.5, 0);
      if (c.type === 'H') { if (P.hp >= 5) { P.lives++; banner = { text: '1UP', t: 1.2, small: true }; } else P.hp = Math.min(5, P.hp + 2); }
      else { P.weapon = CRATE[c.type]; banner = { text: P.weapon, t: 1.2, small: true }; }
    }
  }
  pickups = pickups.filter(c => c.t > 0);

  for (const p of parts) { p.life -= dt; p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  parts = parts.filter(p => p.life > 0);
}

// ------------------------------------------------------------------ update
function saveHi() { if (score > hiscore) { hiscore = score; try { localStorage.setItem('ironcanopy.hi', hiscore); } catch (e) {} } }

function update(dt) {
  time += dt;
  if (pressed.KeyM) Sfx.toggleMute();
  if (state === 'TITLE' || state === 'OVER' || state === 'WIN') {
    if (In.start && loaded >= total) { Sfx.init(); reset(); state = 'PLAY'; Sfx.music('stage'); }
    return;
  }
  if (pressed.KeyP || pressed.Escape || (In.start && state !== 'TITLE')) state = state === 'PAUSE' ? 'PLAY' : 'PAUSE';
  if (state === 'PAUSE') return;
  stageTime += dt;
  updatePlayer(dt);
  if (state !== 'PLAY') return;
  // camera only scrolls forward and locks at the arena
  if (!boss) {
    camX = Math.max(camX, Math.min(lerp(camX, P.x - W * 0.38, 1 - Math.pow(0.001, dt)), ARENA_X));
    if (camX >= ARENA_X - 1) { camX = ARENA_X; startBoss(); }
  } else if (boss.st !== 'gone') {
    arenaCarrierT -= dt;
    if (arenaCarrierT <= 0) { arenaCarrierT = 20; enemies.push(makeEnemy('carrier', camX + W + 80, 170, { drop: 'HSLR'[Math.floor(rand(0, 4))], active: true })); }
  }
  updateEnemies(dt);
  if (boss) updateBoss(dt);
  updateBullets(dt);
  shake = Math.max(0, shake - dt * 30);
  if (banner && (banner.t -= dt) <= 0) banner = null;
  if (endT > 0 && (endT -= dt) <= 0) { score += P.lives * 2000 + P.hp * 300; saveHi(); state = 'WIN'; Sfx.play('win'); }
}

// ------------------------------------------------------------------ render helpers
function drawBG() {
  const fade = clamp((camX + W / 2 - (FORT_X - 500)) / 800, 0, 1);
  const layer = (img, alpha) => {
    if (alpha <= 0 || !img.width) return;
    const iw = img.width * H / img.height, off = camX * 0.12;
    ctx.globalAlpha = alpha;
    for (let i = Math.floor(off / iw); i * iw - off < W; i++) {
      const x = Math.round(i * iw - off);
      if (i & 1) { ctx.save(); ctx.translate(x + iw, 0); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, iw + 1, H); ctx.restore(); }
      else ctx.drawImage(img, x, 0, iw + 1, H);
    }
    ctx.globalAlpha = 1;
  };
  layer(IMG.jungle, 1);
  layer(IMG.fortress, fade);
  // mid-distance silhouettes (parallax 0.45)
  const off = camX * 0.45;
  for (let i = Math.floor(off / 230) - 1; i * 230 - off < W + 200; i++) {
    const h = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1, x = i * 230 - off + h * 90;
    const fort = i * 230 > (FORT_X - 200) * 0.45 + 300;
    if (fort) {
      ctx.fillStyle = 'rgba(8,12,22,0.6)';
      const th = 240 + h * 200;
      ctx.fillRect(x, GROUND_Y - th, 18, th); ctx.fillRect(x + 70, GROUND_Y - th, 18, th);
      for (let y = GROUND_Y - th; y < GROUND_Y; y += 60) ctx.fillRect(x, y, 88, 8);
      ctx.fillRect(x - 30, GROUND_Y - 90 - h * 60, 150, 90 + h * 60);
      ctx.fillStyle = Math.sin(time * 3 + i) > 0 ? '#ff3b2f' : '#5a1512';
      ctx.fillRect(x + 40, GROUND_Y - th - 8, 8, 8);
    }
  }
  const g = ctx.createLinearGradient(0, 330, 0, GROUND_Y + 40);
  g.addColorStop(0, 'rgba(20,60,70,0)'); g.addColorStop(1, fade > 0.5 ? 'rgba(40,30,50,0.55)' : 'rgba(30,90,95,0.5)');
  ctx.fillStyle = g; ctx.fillRect(0, 330, W, 400);
}

function drawWorld() {
  // liquid in the pits
  let prev = 0;
  for (const g of Level.ground.concat([{ x: LEVEL_W, w: 0 }])) {
    if (g.x > prev && g.x > camX && prev < camX + W) {
      const hot = prev >= FORT_X, y0 = 655;
      const grd = ctx.createLinearGradient(0, y0, 0, H);
      grd.addColorStop(0, hot ? '#ffb23a' : '#3df0d0'); grd.addColorStop(0.25, hot ? '#e0481a' : '#12808a'); grd.addColorStop(1, hot ? '#4a0d08' : '#05242c');
      ctx.fillStyle = '#04080c'; ctx.fillRect(prev - 4, GROUND_Y, g.x - prev + 8, H - GROUND_Y);
      ctx.fillStyle = grd; ctx.beginPath(); ctx.moveTo(prev - 4, H);
      for (let x = prev - 4; x <= g.x + 8; x += 8) ctx.lineTo(x, y0 + Math.sin(x * 0.05 + time * 3) * 4 + Math.sin(x * 0.021 - time * 2) * 3);
      ctx.lineTo(g.x + 8, H); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      const gl = ctx.createLinearGradient(0, y0 - 90, 0, y0);
      gl.addColorStop(0, 'rgba(0,0,0,0)'); gl.addColorStop(1, hot ? 'rgba(255,110,30,0.35)' : 'rgba(40,220,200,0.28)');
      ctx.fillStyle = gl; ctx.fillRect(prev, y0 - 90, g.x - prev, 96);
      ctx.globalCompositeOperation = 'source-over';
    }
    prev = g.x + g.w;
  }
  const tiled = (img, x, y, w, th, top) => {
    if (x + w < camX || x > camX + W) return;
    for (let tx = x; tx < x + w; tx += 128) {
      if (tx + 128 < camX || tx > camX + W) continue;
      const sw = Math.min(128, x + w - tx);
      ctx.drawImage(img, 0, 0, sw * 2, th * 2, tx, y - top, sw, th);
    }
  };
  for (const g of Level.ground) {
    ctx.fillStyle = g.type === 'steel' ? '#0c0f14' : '#140c08';
    ctx.fillRect(g.x, GROUND_Y + 60, g.w, H - GROUND_Y - 60);
    tiled(g.type === 'steel' ? IMG.tileSteel : IMG.tileGround, g.x, GROUND_Y, g.w, 128, 16.8);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(g.x, GROUND_Y + 4, 6, H); ctx.fillRect(g.x + g.w - 6, GROUND_Y + 4, 6, H);
  }
  for (const p of Level.platforms) tiled(p.type === 'steel' ? IMG.platSteel : IMG.platWood, p.x, p.y, p.w, 40, 6.4);
  for (const c of Level.checkpoints) {
    if (c < camX - 40 || c > camX + W + 40) continue;
    const on = P.checkpoint >= c;
    ctx.fillStyle = '#20262e'; ctx.fillRect(c - 4, GROUND_Y - 70, 8, 70);
    ctx.fillStyle = on ? '#4dffa0' : '#55606c'; ctx.fillRect(c - 9, GROUND_Y - 84, 18, 16);
    if (on) glow(c, GROUND_Y - 76, 34, 'rgba(77,255,160,0.5)');
  }
}

function glow(x, y, r, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.globalCompositeOperation = 'source-over';
}

// draw a sprite cell with its feet (or centre) at the origin; additive re-draw gives a hit flash
function cell(img, m, frame, flip, x, y, anchorY, flash) {
  const fw = m.fw, fh = m.fh, sx = (frame % m.cols) * fw, sy = Math.floor(frame / m.cols) * fh;
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, sx, sy, fw, fh, -fw / 4, -anchorY / 2, fw / 2, fh / 2);
  if (flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.8; ctx.drawImage(img, sx, sy, fw, fh, -fw / 4, -anchorY / 2, fw / 2, fh / 2); }
  ctx.restore();
}

function drawEnemies() {
  for (const e of enemies) {
    if (e.x < camX - 150 || e.x > camX + W + 150) continue;
    if (e.t === 'trooper') cell(IMG.trooper, META.trooper, Math.floor(e.anim * 13) % 8, e.dir < 0, e.x, e.y, META.trooper.ground, e.flash);
    else if (e.t === 'heavy') cell(IMG.heavy, META.heavy, 0, e.dir < 0, e.x, e.y, META.heavy.ground, e.flash);
    else if (e.t === 'turret') {
      cell(IMG.turretBase, META.turret_base, 0, false, e.x, e.y, META.turret_base.ground, e.flash);
      ctx.save(); ctx.translate(e.x, e.y - 46); ctx.rotate(e.ang);
      const up = Math.cos(e.ang) < 0; if (up) ctx.scale(1, -1);
      ctx.drawImage(IMG.turretGun, -48, -32, 128, 64);
      if (e.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(IMG.turretGun, -48, -32, 128, 64); }
      ctx.restore();
    } else {
      const m = e.t === 'drone' ? META.drone : META.carrier;
      cell(e.t === 'drone' ? IMG.drone : IMG.carrier, m, Math.floor(e.anim * 20) % 2, e.t === 'drone' ? e.dir < 0 : true, e.x, e.y + (e.t === 'carrier' ? 14 : 0), m.fh / 2, e.flash);
    }
  }
}

function drawBoss() {
  const b = boss; if (!b || b.st === 'gone') return;
  const m = META.boss;
  cell(IMG.boss, m, Math.floor(b.anim) % 4, true, b.x, b.y, m.ground, b.flash);
  const [cx, cy] = bossCore(), pulse = 0.6 + 0.4 * Math.sin(time * (b.phase === 2 ? 14 : 6));
  glow(cx, cy, 80 + pulse * 30, b.phase === 2 ? `rgba(255,60,30,${0.5 + pulse * 0.3})` : `rgba(255,150,40,${0.3 + pulse * 0.25})`);
  if (b.warn > 0) {
    ctx.fillStyle = `rgba(255,50,30,${0.18 + 0.2 * Math.abs(Math.sin(time * 18))})`;
    ctx.fillRect(camX, GROUND_Y - 62, b.x - 120 - camX, 62);
    glow(b.x - 110, b.y - 136, 60 * (1.3 - b.warn), 'rgba(255,220,180,0.9)');
  }
  if (b.beam > 0) {
    ctx.globalCompositeOperation = 'lighter';
    const y = GROUND_Y - 34, h = 26 + Math.sin(time * 60) * 6;
    const g = ctx.createLinearGradient(0, y - h * 2, 0, y + h * 2);
    g.addColorStop(0, 'rgba(255,40,0,0)'); g.addColorStop(0.4, 'rgba(255,120,40,0.8)'); g.addColorStop(0.5, '#fff'); g.addColorStop(0.6, 'rgba(255,120,40,0.8)'); g.addColorStop(1, 'rgba(255,40,0,0)');
    ctx.fillStyle = g; ctx.fillRect(camX, y - h * 2, b.x - 110 - camX, h * 4);
    ctx.globalCompositeOperation = 'source-over';
  }
}

function drawPlayer() {
  if (P.deadT > 0) return;
  const blink = P.invuln > 0 && Math.floor(time * 16) % 2;
  const f = heroFrame(), m = META.hero, sh = m.shoulder[f];
  ctx.save(); ctx.translate(Math.round(P.x), Math.round(P.y)); ctx.scale(P.facing, 1);
  if (blink) ctx.globalAlpha = 0.35;
  ctx.drawImage(IMG.hero, f * 256, 0, 256, 256, -64, -m.ground / 2, 128, 128);
  ctx.translate((sh[0] - 128) / 2, (sh[1] - m.ground) / 2); ctx.rotate(aimAngle());
  const pv = META.hero_arm.pivot;
  ctx.drawImage(IMG.arm, -pv[0] / 2, -pv[1] / 2, 128, 64);
  ctx.restore();
  if (P.muzzle > 0) { const [mx, my] = muzzlePos(); glow(mx, my, 34, WEAPONS[P.weapon].color); }
}

function drawFx() {
  for (const c of pickups) {
    if (c.t < 3 && Math.floor(time * 10) % 2) continue;
    const bob = c.rest ? Math.sin(time * 4 + c.x) * 4 : 0, i = 'SLRH'.indexOf(c.type);
    glow(c.x, c.y + bob, 46, ['rgba(255,140,40,0.45)', 'rgba(60,220,255,0.45)', 'rgba(255,230,60,0.45)', 'rgba(80,255,120,0.45)'][i]);
    ctx.drawImage(IMG.crates, i * 128, 0, 128, 128, c.x - 32, c.y - 32 + bob, 64, 64);
    ctx.font = 'bold 18px Trebuchet MS'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
    const label = c.type === 'H' ? '+' : c.type; ctx.strokeText(label, c.x, c.y - 36 + bob); ctx.fillText(label, c.x, c.y - 36 + bob);
  }
  for (const p of parts) if (p.k === 1) {
    const a = p.life / p.max; ctx.globalAlpha = a * 0.55; ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.6 - a), 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (const b of bullets) {
    const sp = Math.hypot(b.vx, b.vy), len = b.len || 22, ux = b.vx / sp, uy = b.vy / sp;
    ctx.strokeStyle = b.color; ctx.lineWidth = b.r * 2; ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(b.x - ux * len, b.y - uy * len); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = b.r; ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.moveTo(b.x - ux * len * 0.7, b.y - uy * len * 0.7); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  for (const b of ebullets) {
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 2.6);
    g.addColorStop(0, '#fff'); g.addColorStop(0.3, b.mortar ? '#ffb347' : '#ff4f9a'); g.addColorStop(1, 'rgba(255,0,80,0)');
    ctx.fillStyle = g; ctx.fillRect(b.x - b.r * 3, b.y - b.r * 3, b.r * 6, b.r * 6);
  }
  for (const p of parts) {
    const a = p.life / p.max;
    if (p.k === 0) { ctx.globalAlpha = a; ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
    else if (p.k === 2) {
      ctx.globalAlpha = a; const r = p.size * (1.4 - a);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r); g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#ffb347'); g.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = g; ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    }
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  for (const b of ebullets) if (b.mortar) {            // landing marker
    ctx.strokeStyle = `rgba(255,80,40,${0.5 + 0.5 * Math.sin(time * 30)})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(b.tx, GROUND_Y - 2, 70, 10, 0, 0, TAU); ctx.stroke();
  }
}

function drawAtmosphere() {
  const fort = clamp((camX + W / 2 - FORT_X) / 600, 0, 1);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {                         // fireflies in the jungle
    if (fort >= 1) break;
    const x = ((i * 197.3 - camX * 0.8 + Math.sin(time * 0.7 + i) * 40) % (W + 100) + W + 100) % (W + 100) - 50;
    const y = 120 + ((i * 89.7) % 430) + Math.sin(time * 1.3 + i * 2) * 26;
    ctx.fillStyle = `rgba(120,255,220,${(0.25 + 0.25 * Math.sin(time * 3 + i)) * (1 - fort)})`;
    ctx.fillRect(x, y, 3, 3);
  }
  ctx.globalCompositeOperation = 'source-over';
  if (fort > 0) {                                        // rain over the fortress
    ctx.strokeStyle = `rgba(170,200,255,${0.22 * fort})`; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i < 90; i++) {
      const x = ((i * 73.1 - camX * 1.2 - time * 260) % W + W) % W, y = (i * 131.7 + time * 1100) % H;
      ctx.moveTo(x, y); ctx.lineTo(x - 7, y + 26);
    }
    ctx.stroke();
  }
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  if (P.invuln > 1.2 && P.deadT <= 0 && P.hp < 5) { ctx.fillStyle = 'rgba(255,40,20,0.18)'; ctx.fillRect(0, 0, W, H); }
}

function text(s, x, y, size, color, align = 'left', stroke = 5) {
  ctx.font = `bold ${size}px 'Trebuchet MS', sans-serif`; ctx.textAlign = align; ctx.lineJoin = 'round';
  if (stroke) { ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = stroke; ctx.strokeText(s, x, y); }
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}

function drawHUD() {
  ctx.fillStyle = 'rgba(4,10,14,0.55)'; ctx.fillRect(0, 0, W, 54);
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < P.hp ? (P.hp <= 2 ? '#ff4b3a' : '#4dffa0') : 'rgba(255,255,255,0.14)';
    ctx.beginPath(); ctx.moveTo(24 + i * 30, 16); ctx.lineTo(48 + i * 30, 16); ctx.lineTo(42 + i * 30, 38); ctx.lineTo(18 + i * 30, 38); ctx.fill();
  }
  text('× ' + Math.max(0, P.lives), 182, 35, 20, '#ffd9a0');
  const w = WEAPONS[P.weapon];
  ctx.fillStyle = w.color; ctx.fillRect(252, 16, 6, 22);
  text(P.weapon, 266, 35, 20, w.color);
  text(String(score).padStart(7, '0'), W / 2, 36, 26, '#fff', 'center');
  const t = Math.floor(stageTime);
  text(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, W - 200, 35, 20, '#9fd8ff', 'right');
  text('HI ' + String(Math.max(hiscore, score)).padStart(7, '0'), W - 24, 35, 20, '#ffd9a0', 'right');
  if (Sfx.muted) text('MUTED', W - 24, 80, 16, '#ff8a8a', 'right');
  if (boss && boss.st !== 'gone' && boss.st !== 'enter') {
    const bw = 620, x = (W - bw) / 2, y = H - 44, f = clamp(boss.hp / boss.max, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - 4, y - 4, bw + 8, 22);
    ctx.fillStyle = boss.phase === 2 ? '#ff3b2f' : '#ff8a2a'; ctx.fillRect(x, y, bw * f, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x, y, bw * f, 4);
    text('WARDEN MK-IV', W / 2, y - 12, 16, '#ffd9a0', 'center', 4);
  }
  if (banner) {
    const a = clamp(banner.t * 2, 0, 1);
    ctx.globalAlpha = banner.warn ? a * (0.55 + 0.45 * Math.abs(Math.sin(time * 9))) : a;
    if (banner.warn) { ctx.fillStyle = 'rgba(160,10,0,0.45)'; ctx.fillRect(0, 150, W, 90); }
    text(banner.text, W / 2, banner.small ? 130 : 212, banner.small ? 28 : 50, banner.warn ? '#ffe1d0' : '#4dffa0', 'center', 7);
    ctx.globalAlpha = 1;
  }
}

function overlay(title, color, lines) {
  ctx.fillStyle = 'rgba(2,6,10,0.72)'; ctx.fillRect(0, 0, W, H);
  text(title, W / 2, 290, 86, color, 'center', 10);
  lines.forEach((l, i) => text(l, W / 2, 360 + i * 40, 26, i === lines.length - 1 ? '#ffd9a0' : '#fff', 'center'));
}

function drawTitle() {
  if (IMG.title.width) ctx.drawImage(IMG.title, 0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(2,6,10,0.72)'); g.addColorStop(0.45, 'rgba(2,6,10,0.05)'); g.addColorStop(1, 'rgba(2,6,10,0.88)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(W / 2, 150);
  ctx.font = "900 112px 'Trebuchet MS', sans-serif"; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#150600'; ctx.lineWidth = 18; ctx.strokeText('IRON CANOPY', 0, 0);
  const tg = ctx.createLinearGradient(0, -90, 0, 10);
  tg.addColorStop(0, '#fff6c8'); tg.addColorStop(0.5, '#ffa52a'); tg.addColorStop(1, '#d83a08');
  ctx.fillStyle = tg; ctx.fillText('IRON CANOPY', 0, 0);
  ctx.restore();
  text('O P E R A T I O N   E M B E R F A L L', W / 2, 200, 24, '#8ff3ff', 'center', 6);
  if (loaded < total) text(`LOADING ${loaded}/${total}`, W / 2, 610, 26, '#fff', 'center');
  else if (Math.floor(time * 2.2) % 2 === 0) text('PRESS  ENTER  TO  DEPLOY', W / 2, 610, 34, '#fff', 'center', 7);
  text('HI-SCORE  ' + String(hiscore).padStart(7, '0'), W / 2, 656, 20, '#ffd9a0', 'center');
  text('Sprites modelled & rendered in Blender  ·  Backdrops AI-generated  ·  Audio synthesised live', W / 2, 698, 14, '#9fb4c2', 'center', 3);
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (state === 'TITLE') { drawTitle(); return; }
  drawBG();
  ctx.save();
  ctx.translate(-Math.round(camX) + rand(-shake, shake), rand(-shake, shake) * 0.6);
  drawWorld(); drawEnemies(); drawBoss(); drawPlayer(); drawFx();
  ctx.restore();
  drawAtmosphere(); drawHUD();
  const t = Math.floor(stageTime), ts = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  if (state === 'PAUSE') overlay('PAUSED', '#8ff3ff', ['P / Esc to resume']);
  if (state === 'OVER') overlay('MISSION FAILED', '#ff4b3a', [`Score  ${score}`, 'Press ENTER to redeploy']);
  if (state === 'WIN') overlay('FORTRESS DOWN', '#4dffa0', [`Score  ${score}`, `Time  ${ts}`, 'Press ENTER to play again']);
}

// ------------------------------------------------------------------ main loop
function fit() {
  const s = Math.min(innerWidth / W, (innerHeight - (matchMedia('(pointer: coarse)').matches ? 0 : 44)) / H);
  cv.style.width = Math.floor(W * s) + 'px'; cv.style.height = Math.floor(H * s) + 'px';
}
addEventListener('resize', fit); fit();

let last = performance.now(), acc = 0;
const STEP = 1 / 120;
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000); last = now;
  pollPad();
  while (acc >= STEP) { update(STEP); for (const k in pressed) delete pressed[k]; pad.pj = pad.jump; pad.ps = pad.start; acc -= STEP; }
  draw();
  requestAnimationFrame(frame);
}
reset();
requestAnimationFrame(frame);
window.__game = { get state() { return state; }, get P() { return P; }, get boss() { return boss; }, get camX() { return camX; },
                  get enemies() { return enemies; }, set camX(v) { camX = v; } };
})();
