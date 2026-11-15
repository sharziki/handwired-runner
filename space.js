// Space renderer: minimal black and white, thin lines, monospaced annotations.
// Shared by the page and the video. Purely visual: it never changes the simulation.
const Space = (() => {
  const R = Runner;
  const ROW0 = 3, ROWS = R.H - ROW0; // show rows 3..13
  const FONT = "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace";
  const W = "#ffffff", BG = "#000000";
  const a = v => `rgba(255,255,255,${v})`;
  const NEURON_SHORT = ["wall", "pit", "drone", "drone-on-me", "ground", "tall-wall", "air-brake", "land-short"];
  const hash = i => { const x = Math.sin(i * 127.1 + 0.3) * 43758.5453; return x - Math.floor(x); };

  function stars(ctx, x0, y0, w, h, camPx, unit) {
    // three layers of stars with slow parallax
    for (const [n, par, size, alpha] of [[90, 0.04, 1, 0.35], [45, 0.1, 1, 0.6], [14, 0.2, 2, 0.9]]) {
      const span = w + 200;
      for (let i = 0; i < n; i++) {
        const sx = ((hash(i * 3 + par * 100) * span - camPx * par) % span + span) % span - 100;
        if (sx < 0 || sx > w) continue;
        const sy = hash(i * 7 + par * 50) * h * 0.85;
        ctx.fillStyle = a(alpha * (0.5 + 0.5 * hash(i + 11)));
        const s = Math.max(1, Math.round(size * unit));
        ctx.fillRect(Math.round(x0 + sx), Math.round(y0 + sy), s, s);
      }
    }
    // a faint ringed planet, far away
    const px = x0 + w * 0.78 - camPx * 0.015, py = y0 + h * 0.28, pr = h * 0.17;
    ctx.save(); ctx.lineWidth = Math.max(1, unit);
    ctx.strokeStyle = a(0.22); ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = a(0.1);
    for (const k of [-0.5, 0, 0.5]) { ctx.beginPath(); ctx.ellipse(px, py + k * pr * 0.8, pr * Math.sqrt(1 - (k * 0.8) ** 2), pr * 0.12, 0, 0, Math.PI * 2); ctx.stroke(); }
    ctx.strokeStyle = a(0.3); ctx.beginPath(); ctx.ellipse(px, py, pr * 1.8, pr * 0.32, -0.25, 0.15 * Math.PI, 0.95 * Math.PI, true); ctx.stroke();
    ctx.restore();
  }

  function terrain(ctx, lv, x0, y0, w, h, camPx, tile, lw) {
    const c0 = Math.max(0, Math.floor(camPx / tile) - 1), c1 = Math.min(lv.W - 1, Math.ceil((camPx + w) / tile) + 1);
    const S = (tx, ty) => tx >= 0 && tx < lv.W && ty >= 0 && ty < R.H && lv.solid[tx][ty];
    const X = tx => Math.round(x0 + tx * tile - camPx), Y = ty => Math.round(y0 + (ty - ROW0) * tile);
    // fills: black body (hides stars) + texture by block kind
    for (let tx = c0; tx <= c1; tx++) for (let ty = ROW0; ty < R.H; ty++) {
      if (!S(tx, ty)) continue;
      const px = X(tx), py = Y(ty), q = X(tx + 1) - px, k = lv.kind[tx][ty];
      ctx.fillStyle = BG; ctx.fillRect(px, py, q, Y(ty + 1) - py);
      if (k === 1) { // dot matrix
        ctx.fillStyle = a(0.28); const d = Math.max(1, Math.round(lw));
        for (let i = 1; i < 4; i++) for (let j = 1; j < 4; j++) ctx.fillRect(px + Math.round((i * q) / 4), py + Math.round((j * q) / 4), d, d);
      } else if (k === 2) { // inset panel with a cross
        ctx.strokeStyle = a(0.55); ctx.lineWidth = lw;
        const m = Math.round(q * 0.18); ctx.strokeRect(px + m + 0.5, py + m + 0.5, q - 2 * m - 1, q - 2 * m - 1);
        ctx.beginPath(); ctx.moveTo(px + q / 2, py + m + q * 0.12); ctx.lineTo(px + q / 2, py + q - m - q * 0.12); ctx.moveTo(px + m + q * 0.12, py + q / 2); ctx.lineTo(px + q - m - q * 0.12, py + q / 2); ctx.stroke();
      } else { // hatched tower
        ctx.strokeStyle = a(0.3); ctx.lineWidth = lw; ctx.beginPath();
        for (let i = 1; i < 4; i++) { const yy = py + Math.round((i * q) / 4) + 0.5; ctx.moveTo(px + 2, yy); ctx.lineTo(px + q - 2, yy); }
        ctx.stroke();
      }
    }
    // silhouette outline: draw every edge that faces empty space
    ctx.strokeStyle = W; ctx.lineWidth = lw * 1.5; ctx.beginPath();
    const o = (ctx.lineWidth % 2) / 2;
    for (let tx = c0; tx <= c1; tx++) for (let ty = ROW0; ty < R.H; ty++) {
      if (!S(tx, ty)) continue;
      const x1 = X(tx) + o, x2 = X(tx + 1) + o, y1 = Y(ty) + o, y2 = Y(ty + 1) + o;
      if (!S(tx, ty - 1)) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y1); }
      if (!S(tx - 1, ty)) { ctx.moveTo(x1, y1); ctx.lineTo(x1, y2); }
      if (!S(tx + 1, ty)) { ctx.moveTo(x2, y1); ctx.lineTo(x2, y2); }
    }
    ctx.stroke();
    // goal: a dashed beacon line with a small pennant
    const gx = Math.round(x0 + (lv.flagX + 0.5) * tile - camPx) + 0.5, gy = Y(R.H - 2);
    if (gx > x0 - tile * 3 && gx < x0 + w + tile) {
      ctx.strokeStyle = W; ctx.lineWidth = lw; ctx.setLineDash([tile * 0.18, tile * 0.14]);
      ctx.beginPath(); ctx.moveTo(gx, y0); ctx.lineTo(gx, gy); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = W; ctx.beginPath(); ctx.moveTo(gx, y0 + tile * 0.6); ctx.lineTo(gx + tile * 0.9, y0 + tile * 0.9); ctx.lineTo(gx, y0 + tile * 1.2); ctx.fill();
      ctx.font = `${Math.round(tile * 0.3)}px ${FONT}`; ctx.textBaseline = "top"; ctx.textAlign = "left";
      ctx.fillText("GOAL", gx + tile * 0.25, y0 + tile * 1.4);
    }
  }

  function drone(ctx, px, py, tile, lw, frame) {
    const w = R.EW * tile, h = R.EH * tile;
    ctx.strokeStyle = W; ctx.lineWidth = lw * 1.3; ctx.fillStyle = BG;
    ctx.beginPath(); ctx.arc(px + w / 2, py + h * 0.75, w * 0.45, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px + w * 0.15, py + h * 0.75); ctx.lineTo(px + w * 0.05, py + h); ctx.moveTo(px + w * 0.85, py + h * 0.75); ctx.lineTo(px + w * 0.95, py + h); ctx.stroke();
    if ((frame >> 3) % 2 === 0) { ctx.fillStyle = W; ctx.fillRect(Math.round(px + w / 2 - lw), Math.round(py + h * 0.5), Math.max(2, Math.round(lw * 2)), Math.max(2, Math.round(lw * 2))); }
  }

  function runner(ctx, r, px, py, tile, lw, solid, frame) {
    const w = R.PW * tile, h = R.PH * tile, rr = w * 0.28;
    const bob = r.onGround && !r.dead && !r.won ? Math.round(Math.sin(r.t * 0.5) * lw) : 0;
    ctx.save();
    if (r.dead) ctx.globalAlpha = (frame >> 2) % 2 ? 0.25 : 0.7;
    const body = () => { ctx.beginPath(); ctx.roundRect(px, py + bob, w, h * 0.86, rr); };
    ctx.lineWidth = lw * 1.6; ctx.strokeStyle = W;
    if (solid) { ctx.fillStyle = W; body(); ctx.fill(); ctx.fillStyle = BG; }
    else { ctx.fillStyle = BG; body(); ctx.fill(); ctx.stroke(); ctx.fillStyle = W; }
    const flip = r.vx < 0;
    const vx = flip ? px + w * 0.1 : px + w * 0.42;
    ctx.fillRect(Math.round(vx), Math.round(py + bob + h * 0.22), Math.round(w * 0.48), Math.max(2, Math.round(h * 0.14)));
    // feet
    ctx.fillStyle = W; const step = r.onGround && !r.dead && !r.won ? Math.sin(r.t * 0.5) : 0, fh = Math.max(2, Math.round(lw * 2));
    ctx.fillRect(Math.round(px + w * 0.12 + step * w * 0.08), Math.round(py + h * 0.9), Math.round(w * 0.26), fh);
    ctx.fillRect(Math.round(px + w * 0.62 - step * w * 0.08), Math.round(py + h * 0.9), Math.round(w * 0.26), fh);
    ctx.restore();
  }

  function trail(ctx, r, x0, y0, camPx, tile, lw, solid) {
    if (!r._trail) r._trail = [];
    if (r._lastT !== r.t) { r._lastT = r.t; if (r.t % 3 === 0) r._trail.push([r.x + R.PW / 2, r.y + R.PH]); if (r._trail.length > 70) r._trail.shift(); }
    const n = r._trail.length, s = Math.max(2, Math.round(lw * 1.5));
    r._trail.forEach(([tx, ty], i) => {
      const px = Math.round(x0 + tx * tile - camPx), py = Math.round(y0 + (ty - ROW0) * tile) - s;
      ctx.globalAlpha = 0.15 + 0.6 * (i / n);
      if (solid) { ctx.fillStyle = W; ctx.fillRect(px, py, s, s); } else { ctx.strokeStyle = W; ctx.lineWidth = 1; ctx.strokeRect(px + 0.5, py + 0.5, s, s); }
    });
    ctx.globalAlpha = 1;
  }

  // opts: { solid: bool, sensor: {acts, units}, frame }
  function lane(ctx, r, rect, opts = {}) {
    const { x: x0, y: y0, w, h } = rect;
    if (!(w > 20 && h > 20)) return {};
    const tile = h / ROWS, lw = Math.max(1, Math.round(tile / 28)), frame = opts.frame || 0;
    const camPx = Math.max(0, Math.min(r.lv.W * tile - w, r.x * tile - w * 0.3));
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
    ctx.fillStyle = BG; ctx.fillRect(x0, y0, w, h);
    stars(ctx, x0, y0, w, h, camPx, lw);
    terrain(ctx, r.lv, x0, y0, w, h, camPx, tile, lw);
    for (const e of r.enemies) if (e.alive) drone(ctx, x0 + e.x * tile - camPx, y0 + (e.y - ROW0) * tile, tile, lw, frame);
    trail(ctx, r, x0, y0, camPx, tile, lw, opts.solid);
    // sensor window and the cells active neurons read, with callouts
    if (opts.sensor) {
      const pc = Math.floor(r.x + R.PW / 2), pr = Math.floor(r.y + R.PH / 2);
      const wx = Math.round(x0 + (pc - R.VIEW_L) * tile - camPx) + 0.5, wy = Math.round(y0 + (pr - R.VIEW_U - ROW0) * tile) + 0.5;
      const ww = R.VC * tile, wh = R.VR * tile;
      ctx.strokeStyle = a(0.55); ctx.lineWidth = lw; ctx.setLineDash([lw * 3, lw * 4]); ctx.strokeRect(wx, wy, ww, wh); ctx.setLineDash([]);
      // corner ticks
      ctx.strokeStyle = W; ctx.lineWidth = lw * 1.5; const k = tile * 0.35;
      for (const [cx, cy, dx, dy] of [[wx, wy, 1, 1], [wx + ww, wy, -1, 1], [wx, wy + wh, 1, -1], [wx + ww, wy + wh, -1, -1]]) { ctx.beginPath(); ctx.moveTo(cx + dx * k, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + dy * k); ctx.stroke(); }
      const a1 = opts.sensor.acts[0], labels = [];
      if (a1) opts.sensor.units.forEach((u, i) => {
        if (!(a1[i] > 0.05) || !u.cells.length) return;
        let mx = 0, my = 0;
        for (const [dc, dr] of u.cells) {
          const cx = Math.round(x0 + (pc + dc) * tile - camPx), cy = Math.round(y0 + (pr + dr - ROW0) * tile);
          ctx.fillStyle = a(0.16); ctx.fillRect(cx + 2, cy + 2, Math.round(tile) - 4, Math.round(tile) - 4);
          ctx.strokeStyle = W; ctx.lineWidth = lw; ctx.strokeRect(cx + 2.5, cy + 2.5, Math.round(tile) - 5, Math.round(tile) - 5);
          mx += cx + tile / 2; my += cy + tile / 2;
        }
        labels.push({ name: NEURON_SHORT[i], v: a1[i], x: mx / u.cells.length, y: my / u.cells.length });
      });
      // callouts stacked above the sensor window
      ctx.font = `${Math.round(tile * 0.3)}px ${FONT}`; ctx.textBaseline = "bottom"; ctx.textAlign = "left";
      labels.forEach((l, i) => {
        const ty = wy - tile * 0.25 - i * tile * 0.42, tx = wx + ww * 0.55;
        ctx.strokeStyle = a(0.6); ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(l.x, ty - tile * 0.12); ctx.lineTo(tx - tile * 0.1, ty - tile * 0.12); ctx.stroke();
        ctx.fillStyle = W; ctx.fillText(`${l.name} ${Math.min(9.99, l.v).toFixed(2)}`, tx, ty);
      });
    }
    runner(ctx, r, x0 + r.x * tile - camPx, y0 + (r.y - ROW0) * tile, tile, lw, opts.solid, frame);
    ctx.restore();
    return { tile, camPx, lw };
  }

  const pctOf = r => Math.round(Math.min(1, (r.maxX - r.lv.startX) / (r.lv.flagX - r.lv.startX)) * 100);
  function statusOf(r) {
    if (r.won) return "CLEARED";
    if (r.dead) return r.cause === "pit" ? "LOST TO THE VOID" : r.cause === "beetle" ? "HIT A DRONE" : "OUT OF TIME";
    return null;
  }

  return { ROW0, ROWS, FONT, NEURON_SHORT, lane, pctOf, statusOf };
})();
if (typeof module !== "undefined") module.exports = Space;
