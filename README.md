# SOLMARA HEAT — Make GTA 6 (make.fun gta6-01)

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/messbiily273-jpg/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/messbiily273-jpg/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game in the coastal city of **Solmara Bay**.
Mara Voss owes the Harbor Kings $2,000. Drive, steal, fight and outrun the
Bay PD across a sun-soaked city built from scratch. Five story chapters,
then free roam.

100% original: own city, characters, vehicles, names, story, art and sounds.
Nothing from Rockstar Games or any other commercial game.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

Desktop Chrome, keyboard + mouse. No network requests: every asset is a
file under `game/` or generated in code (WebAudio synth, canvas textures).

- **WASD** move / drive · **Mouse** look & aim · **E** steal / enter / exit car
- **Click** shoot / punch · **Q** switch weapon · **Shift** sprint · **Space** jump
- **P** pause · **M** mute

## What is in the game

- A 7x7-block city on the shore: towers, a plaza with a fountain, the Grand
  Solmara Hotel, The Rusty Anchor bar, the Harbor Warehouse, a boardwalk,
  Pier 9, a beach and the sea.
- On foot and by car: 7 car models, parked cars to steal, moving traffic,
  pedestrians who flee from danger.
- Wanted level 0-5 stars with Bay PD car chases and foot officers who try
  to bust you; the heat falls when you stay clean and out of sight.
- Five story missions: a delivery, a hot-wheels getaway, a warehouse
  shootout, a timed checkpoint run, and the finale heist.
- Combat: pistol and SMG, armed Harbor Kings hostiles, tracers, pickups.
- HUD with money, clock, health, wanted stars, mission objective, feed and
  a live minimap. Start screen, pause, death / busted screens, and a
  localStorage save (Continue on the title screen).

## Shots

`shots.json` lists the four staged screenshots in `screenshots/`, each taken
from the real game in headless Chrome with a fixed seed (`?shot=…&seed=1337`).

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and
writes `dossier.json` with the vendored make.fun library.

---

<sub>Entered on [make.fun](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
