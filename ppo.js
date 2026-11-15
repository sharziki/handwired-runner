// PPO from scratch (no libraries) on Level 1 of the runner. Policy and value are separate 263 -> 64 -> k tanh MLPs.
// Usage: node ppo.js [minutes]
const fs = require("fs");
const R = require("./runner.js");
const N_IN = R.N_IN, HID = 64, NA = 4;
const MINUTES = +(process.argv[2] || 25);
const NENV = 16, T = 128, EPOCHS = 4, MB = 256, CLIP = 0.2, GAMMA = 0.99, LAM = 0.95, ENT = 0.01, VF = 0.5, LR = 5e-4, MAXNORM = 0.5;
const LEVEL = R.LEVELS[0];

// ---------- rng ----------
let seed = 12345;
const rand = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const randn = () => Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand());

// ---------- params ----------
function mlp(nout, outScale) {
  const p = { W1: new Float32Array(HID * N_IN), b1: new Float32Array(HID), W2: new Float32Array(nout * HID), b2: new Float32Array(nout), nout };
  for (let i = 0; i < p.W1.length; i++) p.W1[i] = randn() / Math.sqrt(30); // ~30 active inputs per observation
  for (let i = 0; i < p.W2.length; i++) p.W2[i] = (randn() / Math.sqrt(HID)) * outScale;
  return p;
}
const pi = mlp(NA, 0.01), vf = mlp(1, 1.0);
const zerosLike = p => ({ W1: new Float32Array(p.W1.length), b1: new Float32Array(p.b1.length), W2: new Float32Array(p.W2.length), b2: new Float32Array(p.b2.length) });
const adam = p => ({ m: zerosLike(p), v: zerosLike(p), t: 0 });
const optPi = adam(pi), optVf = adam(vf);

function nz(x) { const idx = []; for (let i = 0; i < x.length; i++) if (x[i] !== 0) idx.push(i); return idx; }
function fwd(p, x, idx, h) {
  for (let i = 0; i < HID; i++) { let s = p.b1[i]; const r = i * N_IN; for (const j of idx) s += p.W1[r + j] * x[j]; h[i] = Math.tanh(s); }
  const out = new Float32Array(p.nout);
  for (let k = 0; k < p.nout; k++) { let s = p.b2[k]; const r = k * HID; for (let i = 0; i < HID; i++) s += p.W2[r + i] * h[i]; out[k] = s; }
  return out;
}
function softmax(z) { const m = Math.max(...z); const e = z.map(v => Math.exp(v - m)); const s = e.reduce((a, b) => a + b, 0); return e.map(v => v / s); }
function backward(p, g, x, idx, h, dout) { // accumulate grads
  const dh = new Float32Array(HID);
  for (let k = 0; k < p.nout; k++) { const d = dout[k]; if (!d) continue; g.b2[k] += d; const r = k * HID; for (let i = 0; i < HID; i++) { g.W2[r + i] += d * h[i]; dh[i] += d * p.W2[r + i]; } }
  for (let i = 0; i < HID; i++) { const dz = dh[i] * (1 - h[i] * h[i]); if (!dz) continue; g.b1[i] += dz; const r = i * N_IN; for (const j of idx) g.W1[r + j] += dz * x[j]; }
}
function step(p, g, opt, scale) {
  let n2 = 0; for (const k of ["W1", "b1", "W2", "b2"]) for (const v of g[k]) n2 += (v * scale) ** 2;
  const clip = Math.min(1, MAXNORM / (Math.sqrt(n2) + 1e-8));
  opt.t++; const c1 = 1 - 0.9 ** opt.t, c2 = 1 - 0.999 ** opt.t;
  for (const k of ["W1", "b1", "W2", "b2"]) {
    const P = p[k], G = g[k], M = opt.m[k], V = opt.v[k];
    for (let i = 0; i < P.length; i++) { const gi = G[i] * scale * clip; if (gi === 0 && M[i] === 0) continue; M[i] = 0.9 * M[i] + 0.1 * gi; V[i] = 0.999 * V[i] + 0.001 * gi * gi; P[i] -= LR * (M[i] / c1) / (Math.sqrt(V[i] / c2) + 1e-8); }
  }
}

// ---------- envs ----------
// Exploration aid (documented on the page): half of training episodes start at a random flat spot on Level 1.
const starts = [];
for (let x = 2; x < LEVEL.flagX - 4; x++) {
  const ok = [x, x + 1].every(c => R.isSolid(LEVEL, c, R.H - 2) && !R.isSolid(LEVEL, c, R.H - 3) && !R.isSolid(LEVEL, c, R.H - 4));
  if (ok && !LEVEL.enemies.some(e => Math.abs(e.x - x) < 4)) starts.push(x);
}
function resetEnv() {
  const r = R.newRun(LEVEL);
  if (rand() < 0.5) { r.x = starts[Math.floor(rand() * starts.length)]; r.maxX = r.x; }
  return r;
}
const envs = Array.from({ length: NENV }, resetEnv);
const epRet = new Float32Array(NENV); const recentReturns = [];

function greedyEval(level) {
  const r = R.newRun(level), obs = new Float32Array(N_IN), h = new Float32Array(HID);
  while (!r.dead && !r.won) { R.observe(r, obs); const z = fwd(pi, obs, nz(obs), h); let a = 0; for (let k = 1; k < NA; k++) if (z[k] > z[a]) a = k; R.stepRun(r, a); }
  return r;
}
function exportNet() { // in the same {sizes, W, b, act} format the page uses
  return { sizes: [N_IN, HID, NA], act: "tanh", W: [Array.from(pi.W1, v => +v.toFixed(4)), Array.from(pi.W2, v => +v.toFixed(4))], b: [Array.from(pi.b1, v => +v.toFixed(4)), Array.from(pi.b2, v => +v.toFixed(4))] };
}

// ---------- training ----------
const t0 = Date.now(); let steps = 0, update = 0, best = null; const curve = [];
const buf = { obs: [], idx: [], act: [], logp: [], val: [], rew: [], done: [] };
while ((Date.now() - t0) / 60000 < MINUTES) {
  for (const k in buf) buf[k] = [];
  const h = new Float32Array(HID), hv = new Float32Array(HID);
  for (let t = 0; t < T; t++) for (let e = 0; e < NENV; e++) {
    const r = envs[e], o = R.observe(r), idx = nz(o);
    const p = softmax(Array.from(fwd(pi, o, idx, h))); const v = fwd(vf, o, idx, hv)[0];
    let u = rand(), a = 0; while (a < NA - 1 && u > p[a]) { u -= p[a]; a++; }
    const rew = R.stepRun(r, a); epRet[e] += rew; steps++;
    const done = r.dead || r.won;
    buf.obs.push(o); buf.idx.push(idx); buf.act.push(a); buf.logp.push(Math.log(p[a] + 1e-10)); buf.val.push(v); buf.rew.push(rew); buf.done.push(done ? 1 : 0);
    if (done) { recentReturns.push(epRet[e]); if (recentReturns.length > 50) recentReturns.shift(); epRet[e] = 0; envs[e] = resetEnv(); }
  }
  // GAE, laid out [t][e]
  const N = T * NENV, adv = new Float32Array(N), ret = new Float32Array(N);
  const lastV = envs.map(r => { const o = R.observe(r); return fwd(vf, o, nz(o), hv)[0]; });
  const gae = new Float32Array(NENV);
  for (let t = T - 1; t >= 0; t--) for (let e = 0; e < NENV; e++) {
    const i = t * NENV + e, nextV = t === T - 1 ? lastV[e] : buf.val[i + NENV], nonTerm = 1 - buf.done[i];
    const delta = buf.rew[i] + GAMMA * nextV * nonTerm - buf.val[i];
    gae[e] = delta + GAMMA * LAM * nonTerm * gae[e]; adv[i] = gae[e]; ret[i] = adv[i] + buf.val[i];
  }
  let am = 0, as = 0; for (const a of adv) am += a; am /= N; for (const a of adv) as += (a - am) ** 2; as = Math.sqrt(as / N) + 1e-8;
  for (let i = 0; i < N; i++) adv[i] = (adv[i] - am) / as;
  // epochs
  const order = Array.from({ length: N }, (_, i) => i);
  for (let ep = 0; ep < EPOCHS; ep++) {
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    for (let s = 0; s < N; s += MB) {
      const gp = zerosLike(pi), gv = zerosLike(vf);
      for (let q = s; q < Math.min(N, s + MB); q++) {
        const i = order[q], o = buf.obs[i], idx = buf.idx[i], a = buf.act[i];
        const z = fwd(pi, o, idx, h), p = softmax(Array.from(z));
        const logp = Math.log(p[a] + 1e-10), ratio = Math.exp(logp - buf.logp[i]), A = adv[i];
        const active = A >= 0 ? ratio < 1 + CLIP : ratio > 1 - CLIP;
        let H = 0; for (const pk of p) H -= pk * Math.log(pk + 1e-10);
        const dz = new Float32Array(NA);
        for (let k = 0; k < NA; k++) {
          if (active) dz[k] += -A * ratio * ((k === a ? 1 : 0) - p[k]);
          dz[k] += ENT * p[k] * (Math.log(p[k] + 1e-10) + H);
        }
        backward(pi, gp, o, idx, h, dz);
        const v = fwd(vf, o, idx, hv)[0];
        backward(vf, gv, o, idx, hv, [VF * (v - ret[i])]);
      }
      const n = Math.min(MB, N - s);
      step(pi, gp, optPi, 1 / n); step(vf, gv, optVf, 1 / n);
    }
  }
  update++;
  if (update % 5 === 0) {
    const r = greedyEval(LEVEL);
    const progress = Math.min(1, (r.maxX - LEVEL.startX) / (LEVEL.flagX - LEVEL.startX));
    const meanRet = recentReturns.reduce((a, b) => a + b, 0) / Math.max(1, recentReturns.length);
    curve.push({ steps, minutes: +((Date.now() - t0) / 60000).toFixed(2), progress: +progress.toFixed(3), won: r.won, ticks: r.t, meanReturn: +meanRet.toFixed(2) });
    const key = r.won ? 2 - r.t / 10000 : progress;
    if (!best || key > best.key) best = { key, update, steps, won: r.won, ticks: r.t, net: exportNet() };
    console.log(`update ${update} steps ${steps} greedy ${r.won ? "WON in " + r.t : "died " + r.cause + " at " + r.maxX.toFixed(1)} meanRet ${meanRet.toFixed(1)} best ${best.won ? "WON " + best.ticks : best.key.toFixed(2)}@${best.update} ${((Date.now() - t0) / 60000).toFixed(1)}min`);
    fs.writeFileSync("ppo.json", JSON.stringify({ best_update: best.update, best_steps: best.steps, best_won: best.won, best_ticks: best.ticks, net: best.net, curve, settings: { NENV, T, EPOCHS, MB, CLIP, GAMMA, LAM, ENT, VF, LR, HID, randomStartFraction: 0.5 } }));
  }
}
console.log("done", steps, "steps");
