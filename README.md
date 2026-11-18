# gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Zhoya0077/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Zhoya0077/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**SOLMARINA** — an original open-world crime game in the browser. Mara Voss is back in Solmarina, broke and in debt to the fixer Dario Kessler. One wheelman. Five jobs. A city that never looks away.

Explore a procedural sun-soaked coastal city on foot and by car: steal cars, run drops, lose the cops. Traffic and pedestrians fill the streets, a five-star wanted level brings interceptors and officers after you, and five story missions — from a first timed fare to stealing the one-of-a-kind Aurora S — pay off Mara's debt. Combat with fists and pistol, health and ammo pickups, shops that sell supplies, a HUD with a live minimap, a start screen, pause, and localStorage saves. All art is generated in code, all sound is synthesised live with WebAudio — no external assets, no network requests. The city, characters, vehicles, names and story are invented here; nothing is taken from any commercial game.

## Controls

- **WASD** — move / drive · **Mouse drag** — camera · **Shift** — run · **Space** — jump / handbrake
- **E** — enter & steal cars, interact · **F** — punch · **Click** — shoot · **P / Esc** — pause · **M** — mute

## Run it

```sh
python3 -m http.server 8000 --directory game
```

Then open http://localhost:8000 in desktop Chrome. Or serve with the bundled server: `node serve.ts` (http://localhost:8080).

## Shots

The four screenshots in `screenshots/` are real renders of the game, staged through the game's own systems with `?shot=chase|street|mission|night`.

## What is new in this rebuild

Fresh session, fresh authoring: the camera eases after the car at speed with a widening field of view, police hunt in staggered formation instead of a single line, the minimap zooms out as you drive faster and clamps the objective to its edge, and every pickup, guard post and shop was re-placed for this build. This second rebuild re-authors the same game once more under a fresh recording, with the seal order fixed.

---

<sub>Entered on [make.fun](https://make.fun/?ref=wrbbpgtj&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
