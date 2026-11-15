# Handwired Runner

A platformer agent whose neural network weights were written by hand, raced against a PPO agent that learned by trial and error.

https://github.com/sharziki/handwired-runner/raw/main/media/handwired-runner.mp4

Runner **A** is a 263 → 8 → 4 network. Every nonzero weight (67 of them) was set by reasoning about the game's jump physics. No training, no gradients, no search.
Runner **B** is a 263 → 64 → 4 PPO agent, written from scratch in plain JavaScript and trained for 5.7M steps on level 01.

Both see the same 10 × 13 tile window around themselves and press one of the same four buttons: wait, run, run+jump, back.

Inspired by [Weight-Space Programming](https://rikiyat.github.io/blog/weight-space-programming/): treating a network's weights as a program you can read and write.

## Results

| | A · hand-written | B · PPO |
|---|---|---|
| Level 01 (B trained here) | cleared, 1124 ticks | cleared, 960 ticks |
| Level 02 (unseen) | cleared, 1055 ticks | hit a drone at 17% |
| 100 held-out generated levels (seeds 1001–1100) | **64 / 100** | 51 / 100 |
| Weights | 67 nonzero | 17,156 |
| Training | 0 steps | 5.7M steps, 25 min on one CPU core |

Run `node test.js` to reproduce these numbers.

## The eight neurons

Each hidden neuron reads a few cells of the tile window and fires on one situation.

| Neuron | Fires when |
|---|---|
| wall | a solid tile is right in front of the body |
| pit | no ground anywhere under the next column, gated by position inside the tile so the jump starts at the lip |
| drone | an enemy is 1 to 3 tiles ahead at body height |
| drone-on-me | an enemy is in my tile or just behind |
| ground | feet are on a solid tile |
| tall-wall | the wall ahead is at least 2 tiles high |
| air-brake | falling, ground below me, nothing below the next column: stop and land |
| land-short | falling onto the side of a drone: stop, land in front of it, then hop it |

Output layer: `run = 2`, `jump = 4·wall + 8·pit + 4·drone + 4·drone-on-me + 1·tall-wall`, `wait = 10·air-brake + 10·land-short`, press the largest.

The network grew the way the post describes: run it, read a failure trace, write the weights that fix it. `air-brake` came from overshooting a staircase into a pit. `land-short` came from landing on drones from the side. The pit neuron's position gate came from takeoffs that started a full tile early.

## Honest notes

- I debugged A on generated seeds 1–100, so the table reports seeds 1001–1100, which neither agent saw.
- Half of B's training episodes started at a random flat spot on level 01 to help it explore. Its best checkpoint is in `ppo.json`.
- Two spots in my hand-made levels were impossible (a 3-high wall right after a 3-wide gap). I fixed the levels, not the agents.
- A is not better at everything: B clears its own training level faster.

## Files

| File | What it is |
|---|---|
| `runner.js` | game physics, levels, level generator, and the hand-written network |
| `ppo.js` | PPO from scratch: `node ppo.js 25` trains for 25 minutes and writes `ppo.json` |
| `space.js` | the black-and-white renderer shared by the page and the video |
| `page.src.html`, `build.py` | the interactive page; `python3 build.py` writes `index.html` |
| `film.html`, `rec_server.py` | renders the 1080p video in the browser with WebCodecs: run `python3 rec_server.py`, open `http://localhost:8766/film.html`, and it saves `media/handwired-runner.mp4` |
| `test.js` | reproduces the results table |

No dependencies beyond Node and a modern browser.

## License

MIT
