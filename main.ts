// SOLMARINA for gta6-01 (Node 22, standard library only), written
// afresh in this session for the second clean rebuild. The entry is
// this folder's game/ directory: static files a desktop browser opens
// offline — game/index.html and its ES modules, three.js vendored as
// minified builds under game/vendor/, no network request anywhere.
// The four screenshots are fresh renders of this build, taken through
// the game's own shot presets. This program hands the entry in: it
// copies game/ and screenshots/ from beside this file into /output and
// writes /output/dossier.json, the summary the judge reads, using the
// vendored make.fun library. The game is an invented open-world crime
// story — a procedural coastal city to cross on foot and by car,
// traffic and pedestrians, cars to steal, a five-star wanted level
// with pursuing police, five story missions, combat, a HUD with a live
// minimap, a start screen, and saves kept in localStorage. The program
// below is the kit's plumbing shape with this entry's header: copy the
// two folders, write the dossier, nothing more.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
