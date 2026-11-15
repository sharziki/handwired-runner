import json
src = open("page.src.html").read()
ppo = json.load(open("ppo.json"))
data = json.dumps({"net": ppo["net"], "curve": ppo["curve"], "best_steps": ppo["best_steps"], "best_won": ppo["best_won"]}, separators=(",", ":"))
out = src.replace("/*RUNNER*/", open("runner.js").read()).replace("/*SPACE*/", open("space.js").read()).replace("/*PPO*/", data)
open("index.html", "w").write('<meta charset="utf-8">\n' + out)
print("built", len(out) // 1024, "KB; ppo best update", ppo["best_update"], "won", ppo["best_won"], "steps", ppo["best_steps"])
