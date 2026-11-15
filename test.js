// node test.js  ->  scores both agents on the two hand-made levels and 100 held-out generated levels
const R = require("./runner.js"), P = require("./ppo.json");
const hand = R.handNet().net;
const ppo = { sizes: P.net.sizes, act: "tanh", W: P.net.W.map(a => Float32Array.from(a)), b: P.net.b.map(a => Float32Array.from(a)) };
const show = r => (r.won ? `cleared in ${r.t} ticks` : `${r.cause} at x=${r.maxX.toFixed(1)}`);
for (const lv of R.LEVELS) console.log(lv.name.padEnd(34), "| hand:", show(R.playLevel(hand, lv)).padEnd(24), "| ppo:", show(R.playLevel(ppo, lv)));
let a = 0, b = 0;
for (let s = 1001; s <= 1100; s++) { const lv = R.genLevel(s); if (R.playLevel(hand, lv).won) a++; if (R.playLevel(ppo, lv).won) b++; }
console.log(`held-out generated levels 1001-1100 | hand: ${a}/100 | ppo: ${b}/100`);
