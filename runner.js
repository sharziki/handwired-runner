// Runner: a tiny tile platformer. Shared by Node (training, tests) and the page. No dependencies.
const H = 14;                         // level height in tiles; y grows downward
const PW = 0.7, PH = 0.9;             // player box
const EW = 0.8, EH = 0.7;             // enemy box
const RUN = 0.15, JUMP = -0.5, GRAV = 0.035, VMAX = 0.55, EV = 0.04;
const MAX_TICKS = 1400, REPEAT = 2;   // agents choose an action every 2 physics ticks
const VIEW_L = 2, VIEW_R = 7, VIEW_U = 4, VIEW_D = 8;
const VC = VIEW_L + VIEW_R + 1, VR = VIEW_U + VIEW_D + 1; // 10 x 13 window
const N_IN = VC * VR * 2 + 3;         // solid plane, enemy plane, onGround, vy, x-in-tile = 263
const ACTIONS = ["wait", "run", "run+jump", "back"];

// ---------- levels (original layouts) ----------
function buildLevel(spec) {
  const W = spec.width, solid = Array.from({ length: W }, () => new Uint8Array(H));
  const kind = Array.from({ length: W }, () => new Uint8Array(H)); // 1 ground, 2 block, 3 pillar
  const put = (x, y, k) => { if (x >= 0 && x < W && y >= 0 && y < H) { solid[x][y] = 1; kind[x][y] = k; } };
  const ground = (a, b) => { for (let x = a; x <= b; x++) { put(x, H - 1, 1); put(x, H - 2, 1); } };
  const pillar = (x, h, w = 2) => { for (let i = 0; i < w; i++) for (let k = 0; k < h; k++) put(x + i, H - 3 - k, 3); };
  const stairsUp = (x, n) => { for (let i = 0; i < n; i++) for (let k = 0; k <= i; k++) put(x + i, H - 3 - k, 2); };
  const stairsDown = (x, n) => { for (let i = 0; i < n; i++) for (let k = 0; k < n - i; k++) put(x + i, H - 3 - k, 2); };
  const platform = (x, y, w) => { for (let i = 0; i < w; i++) put(x + i, y, 2); };
  spec.build({ ground, pillar, stairsUp, stairsDown, platform });
  return { name: spec.name, W, solid, kind, enemies: spec.enemies.map(([x, y]) => ({ x, y: y ?? H - 2 - EH })), flagX: spec.flagX, startX: 2 };
}

const LEVEL_SPECS = [
  {
    name: "Level 1 · Basalt Run", width: 150, flagX: 143,
    enemies: [[18], [34], [52], [71], [74], [98], [120], [124]],
    build: ({ ground, pillar, stairsUp, stairsDown, platform }) => {
      ground(0, 23); pillar(12, 1); pillar(26 - 4, 2);
      ground(27, 44); pillar(38, 3);
      ground(47, 58); stairsUp(53, 4);
      ground(62, 80); stairsDown(63, 3); pillar(77, 2);
      // wide chasm with a floating stepping stone
      platform(84, H - 4, 3);
      ground(90, 108); pillar(95, 1); pillar(103, 3);
      ground(112, 116);
      ground(120, 149); stairsUp(130, 4); stairsDown(135, 3);
    },
  },
  {
    name: "Level 2 · Glass Canyon (unseen)", width: 150, flagX: 143,
    enemies: [[14], [30], [33], [58], [80], [92], [114], [131]],
    build: ({ ground, pillar, stairsUp, stairsDown, platform }) => {
      ground(0, 20); pillar(9, 2);
      ground(24, 40); stairsUp(36, 3);
      ground(43, 52); pillar(48, 3);
      ground(55, 63);
      platform(66, H - 5, 3);
      ground(71, 86); pillar(76, 1); stairsUp(82, 4);
      ground(89, 100); pillar(96, 2);
      ground(104, 106);
      ground(110, 122); stairsDown(111, 3); pillar(118, 3);
      ground(126, 149); pillar(136, 1);
    },
  },
];
const LEVELS = LEVEL_SPECS.map(buildLevel);

// Procedural levels from the same pieces, with the same fairness rules used for the hand-made ones:
// gaps up to 3 wide, walls up to 3 high, stairs up to 4, and a flat tile on both sides of every gap.
function genLevel(seed) {
  let a = seed | 0; const rnd = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const W = 150, enemies = [];
  return buildLevel({
    name: `Generated #${seed}`, width: W, flagX: W - 7, enemies,
    build: ({ ground, pillar, stairsUp, stairsDown, platform }) => {
      let x = 0; ground(0, 9); x = 10;
      while (x < W - 22) {
        const k = rnd();
        if (k < 0.3) { // gap
          const g = ri(2, 3); x += g; const len = ri(6, 12); ground(x, x + len - 1);
          if (rnd() < 0.4) enemies.push([x + ri(3, len - 2)]);
          x += len;
        } else if (k < 0.5) { // pillar on flat ground
          const len = ri(8, 12); ground(x, x + len - 1); pillar(x + ri(2, len - 5), ri(1, 3)); x += len;
        } else if (k < 0.65) { // stairs up then flat
          const n = ri(2, 4), len = n + ri(4, 8); ground(x, x + len - 1); stairsUp(x + 1, n); x += len;
        } else if (k < 0.75) { // chasm with a stepping stone
          x += 3; platform(x, H - 4, 3); x += 6; const len = ri(6, 10); ground(x, x + len - 1); x += len;
        } else { // flat run with beetles
          const len = ri(8, 14); ground(x, x + len - 1); enemies.push([x + ri(3, len - 3)]); if (rnd() < 0.4) enemies.push([x + ri(3, len - 3)]); x += len;
        }
      }
      ground(x, W - 1);
    },
  });
}

// ---------- world ----------
function newRun(level) {
  return {
    lv: level, x: level.startX, y: H - 2 - PH, vx: 0, vy: 0, onGround: true, t: 0, dead: false, won: false, stomps: 0, maxX: level.startX,
    enemies: level.enemies.map(e => ({ x: e.x, y: e.y, vx: -EV, vy: 0, alive: true })), jumps: 0,
  };
}
const isSolid = (lv, tx, ty) => (tx < 0 ? true : tx >= lv.W ? false : ty < 0 ? false : ty >= H ? false : lv.solid[tx][ty] === 1);
function overlapSolid(lv, x, y, w, h) {
  const x0 = Math.floor(x), x1 = Math.floor(x + w - 1e-6), y0 = Math.floor(y), y1 = Math.floor(y + h - 1e-6);
  for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++) if (isSolid(lv, tx, ty)) return { tx, ty };
  return null;
}
function moveBox(lv, b, w, h) {
  // horizontal
  b.x += b.vx;
  let hit = overlapSolid(lv, b.x, b.y, w, h);
  let bumped = false;
  if (hit) { if (b.vx > 0) b.x = Math.floor(b.x + w) - w - 1e-4; else if (b.vx < 0) b.x = Math.floor(b.x) + 1 + 1e-4; bumped = true; }
  // vertical
  b.vy = Math.min(VMAX, b.vy + GRAV);
  b.y += b.vy;
  b.onGround = false;
  hit = overlapSolid(lv, b.x, b.y, w, h);
  if (hit) {
    if (b.vy > 0) { b.y = Math.floor(b.y + h) - h - 1e-4; b.onGround = true; } else { b.y = Math.floor(b.y) + 1 + 1e-4; }
    b.vy = 0;
  }
  return bumped;
}
function physicsTick(r, action) {
  if (r.dead || r.won) return;
  const lv = r.lv;
  const prevFeet = r.y + PH;
  r.vx = action === 1 || action === 2 ? RUN : action === 3 ? -RUN : 0;
  if (action === 2 && r.onGround) { r.vy = JUMP; r.onGround = false; r.jumps++; }
  moveBox(lv, r, PW, PH);
  if (r.x < 0) r.x = 0;
  for (const e of r.enemies) {
    if (!e.alive) continue;
    const bumped = moveBox(lv, e, EW, EH);
    if (bumped) e.vx = -e.vx;
    else if (e.onGround) { // turn at ledges
      const ahead = e.vx > 0 ? Math.floor(e.x + EW + 0.05) : Math.floor(e.x - 0.05);
      if (!isSolid(lv, ahead, Math.floor(e.y + EH + 0.1))) e.vx = -e.vx;
    }
    if (e.y > H) e.alive = false;
    // contact
    if (r.x < e.x + EW && r.x + PW > e.x && r.y < e.y + EH && r.y + PH > e.y) {
      if (r.vy > 0 && prevFeet <= e.y + 0.25) { e.alive = false; r.vy = -0.3; r.stomps++; }
      else { r.dead = true; r.cause = "beetle"; }
    }
  }
  if (r.y > H) { r.dead = true; r.cause = "pit"; }
  if (r.x >= lv.flagX) r.won = true;
  r.maxX = Math.max(r.maxX, r.x);
  r.t++;
  if (r.t >= MAX_TICKS && !r.won) { r.dead = true; r.cause = "time"; }
}
// one agent decision = REPEAT physics ticks; returns progress-based reward
function stepRun(r, action) {
  const x0 = r.maxX;
  for (let k = 0; k < REPEAT && !r.dead && !r.won; k++) physicsTick(r, action);
  let rew = (r.maxX - x0) * 1.0 - 0.01;
  if (r.won) rew += 20; else if (r.dead) rew -= 5;
  return rew;
}

function observe(r, out) {
  out = out || new Float32Array(N_IN);
  out.fill(0);
  const pc = Math.floor(r.x + PW / 2), pr = Math.floor(r.y + PH / 2);
  for (let dc = -VIEW_L; dc <= VIEW_R; dc++) for (let dr = -VIEW_U; dr <= VIEW_D; dr++) {
    const i = (dr + VIEW_U) * VC + (dc + VIEW_L);
    if (isSolid(r.lv, pc + dc, pr + dr) && pr + dr < H) out[i] = 1;
  }
  for (const e of r.enemies) {
    if (!e.alive) continue;
    const dc = Math.floor(e.x + EW / 2) - pc, dr = Math.floor(e.y + EH / 2) - pr;
    if (dc >= -VIEW_L && dc <= VIEW_R && dr >= -VIEW_U && dr <= VIEW_D) out[VC * VR + (dr + VIEW_U) * VC + (dc + VIEW_L)] = 1;
  }
  out[VC * VR * 2] = r.onGround ? 1 : 0;
  out[VC * VR * 2 + 1] = r.vy / 0.5;
  out[VC * VR * 2 + 2] = r.x + PW / 2 - pc;
  return out;
}
const cellIdx = (dc, dr, plane = 0) => plane * VC * VR + (dr + VIEW_U) * VC + (dc + VIEW_L);

// ---------- MLP (same shape for both agents) ----------
// net = { sizes, W[], b[], act: "relu" | "tanh" }; last layer linear
function forward(net, x, acts) {
  let h = x;
  for (let l = 0; l < net.W.length; l++) {
    const nin = net.sizes[l], nout = net.sizes[l + 1], W = net.W[l], b = net.b[l], o = new Float32Array(nout);
    const last = l === net.W.length - 1;
    for (let i = 0; i < nout; i++) {
      let s = b[i]; const row = i * nin;
      for (let j = 0; j < nin; j++) { const v = h[j]; if (v !== 0) s += W[row + j] * v; }
      o[i] = last ? s : net.act === "tanh" ? Math.tanh(s) : s > 0 ? s : 0;
    }
    if (acts) acts[l] = o;
    h = o;
  }
  return h;
}
const argmax = y => { let b = 0; for (let i = 1; i < y.length; i++) if (y[i] > y[b]) b = i; return b; };
function zeroNet(sizes, act = "relu") {
  return { sizes, act, W: sizes.slice(1).map((n, l) => new Float32Array(n * sizes[l])), b: sizes.slice(1).map(n => new Float32Array(n)) };
}
function playLevel(net, level, pickFn) {
  const r = newRun(level), obs = new Float32Array(N_IN);
  while (!r.dead && !r.won) stepRun(r, pickFn ? pickFn(r) : argmax(forward(net, observe(r, obs))));
  return r;
}

// ---------- the hand-written runner ----------
// Written by reasoning about the physics: a jump rises 3.6 tiles and carries 4.3 tiles forward.
function handNet() {
  const units = [];
  const HID = 8;
  const net = zeroNet([N_IN, HID, 4], "relu");
  const [W1, W2] = net.W, [b1, b2] = net.b;
  const w = (u, i, v) => (W1[u * N_IN + i] = v);
  // u0: wall directly ahead at body height. relu(solid(+1, 0))
  w(0, cellIdx(1, 0), 1);
  units.push({ name: "wall ahead", why: "solid tile right in front of my body", cells: [[1, 0, 0]] });
  // u1: pit ahead. relu(1 - any ground under the next column, looking 8 tiles down)
  // gated by where I stand inside my tile, so I take off from the lip, not a full tile early: relu(2*xInTile - 0.6 - 3*groundUnderNext)
  for (let dr = 1; dr <= VIEW_D; dr++) w(1, cellIdx(1, dr), -3);
  w(1, N_IN - 1, 2); b1[1] = -0.6;
  units.push({ name: "pit ahead", why: "no ground anywhere under the next column", cells: Array.from({ length: VIEW_D }, (_, k) => [1, k + 1, 0]) });
  // u2: beetle closing in at my height, 1-3 tiles ahead
  for (let dc = 1; dc <= 3; dc++) for (let dr = -1; dr <= 0; dr++) w(2, cellIdx(dc, dr, 1), 1);
  units.push({ name: "beetle ahead", why: "an enemy 1 to 3 tiles ahead at body height", cells: [[1, -1, 1], [2, -1, 1], [3, -1, 1], [1, 0, 1], [2, 0, 1], [3, 0, 1]] });
  // u3: beetle right on top of me / behind-adjacent: also jump (escape)
  w(3, cellIdx(0, 0, 1), 1); w(3, cellIdx(-1, 0, 1), 1);
  units.push({ name: "beetle on me", why: "an enemy in my tile or just behind", cells: [[0, 0, 1], [-1, 0, 1]] });
  // u4: on the ground (only then can a jump fire)
  w(4, N_IN - 3, 1);
  units.push({ name: "on ground", why: "feet touching a solid tile", cells: [] });
  // u5: tall wall: two tiles high ahead. Back up one step if I am pinned under an overhang? Not needed; reserved as "step up"
  w(5, cellIdx(1, -1), 1); w(5, cellIdx(1, 0), 1); b1[5] = -1;
  units.push({ name: "tall wall ahead", why: "wall at least 2 tiles high in front", cells: [[1, -1, 0], [1, 0, 0]] });
  // u6: air brake. Falling, ground under my column, none under the next one: stop moving forward and drop onto it.
  for (let dr = 1; dr <= VIEW_D; dr++) { w(6, cellIdx(0, dr), 1); w(6, cellIdx(1, dr), -4); }
  w(6, N_IN - 2, 2); w(6, N_IN - 3, -4); b1[6] = -1.5;
  units.push({ name: "air brake", why: "falling, ground below me, nothing below the next column", cells: Array.from({ length: VIEW_D }, (_, k) => [0, k + 1, 0]).concat(Array.from({ length: VIEW_D }, (_, k) => [1, k + 1, 0])) });
  // u7: land short. Falling toward a beetle that is below and ahead, with ground under me: stop, land in front of it, then hop it.
  for (let dc = 1; dc <= 2; dc++) for (let dr = 1; dr <= 3; dr++) w(7, cellIdx(dc, dr, 1), 1);
  for (let dr = 1; dr <= VIEW_D; dr++) w(7, cellIdx(0, dr), 0.5);
  w(7, N_IN - 2, 1); w(7, N_IN - 3, -4); b1[7] = -2.2;
  units.push({ name: "land short", why: "falling onto a beetle's side: brake and land in front of it", cells: [[1, 1, 1], [1, 2, 1], [1, 3, 1], [2, 1, 1], [2, 2, 1], [2, 3, 1]] });
  // outputs: wait, run, run+jump, back
  const o = (a, u, v) => (W2[a * HID + u] = v);
  b2[1] = 2;                                    // default: run right
  o(2, 0, 4); o(2, 1, 8); o(2, 2, 4); o(2, 3, 4); o(2, 5, 1); // any hazard -> jump
  o(0, 6, 10); o(0, 7, 10);                                  // brake beats everything while it fires
  return { net, units, outputs: ACTIONS };
}

const Runner = { H, PW, PH, EW, EH, RUN, JUMP, GRAV, MAX_TICKS, REPEAT, VIEW_L, VIEW_R, VIEW_U, VIEW_D, VC, VR, N_IN, ACTIONS, LEVELS, genLevel, newRun, stepRun, physicsTick, observe, cellIdx, forward, argmax, zeroNet, playLevel, handNet, isSolid };
if (typeof module !== "undefined") module.exports = Runner;
