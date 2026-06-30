# Rocket Arena 3D

A browser-based car-soccer game (Rocket League style) built with Three.js,
using real 3D car models. Runs entirely in the browser — no install, no server code.

**Live site:** https://YOURNAME.github.io/YOUR-REPO-NAME/
*(replace with your actual GitHub Pages URL)*

---

## How to play

| Action | Key |
|--------|-----|
| Drive / reverse | **W** / **S** |
| Steer | **A** / **D** |
| Boost | **Shift** |
| Jump | **Space** |
| Ball cam (toggle) | **C** |
| Look around | **drag mouse** |
| Mute / unmute music | **🔊 button** (top-right) |

**Goal:** knock the ball into the orange goal. Defend the blue goal. Most goals
before the timer runs out wins.

**Boost:** your meter starts at 33 and drains while boosting. Refill it by driving
over boost pads — small pads give +12, the big glowing orbs fill you to 100%.

---

## Features

- **9 car models** to choose from
- **Team sizes 1v1 through 5v5** with AI teammates and opponents
- **Rocket League-accurate arena** and the exact **34-pad boost layout** (6 big, 28 small)
- **Mutators:** Normal, Low Gravity, Giant Ball, Speed Demon, Beach Ball
- **Boost trails** and **goal explosions**
- **Soundtrack** with a mute toggle
- Match timer with a winner screen and rematch

---

## Running it locally

This is a multi-file project, so most browsers won't run it by double-clicking
`index.html` (they block local file loading). Serve it over HTTP instead:

```bash
# Python 3
python3 -m http.server 8000
# then open http://localhost:8000

# or Node
npx serve
```

---

## Publishing on GitHub Pages

1. Upload **all the files** to the repository (they're all loose files — no folders).
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source: Deploy from a branch**,
   **Branch: main**, folder **/ (root)**, then **Save**.
4. Wait about a minute, then open the URL it shows.

**After any update:** hard-refresh (Ctrl+Shift+R / Cmd+Shift+R) or open the site in
a private/incognito window, or the browser will keep showing the cached old version.

---

## Files

All files sit at the root of the repository (this layout is intentional so uploads
can't break the folder structure):

| File | Purpose |
|------|---------|
| `index.html` | the page, HUD, menu; loads Three.js + loaders from a CDN |
| `cars.js` | loads the car and ball models; the car list lives here |
| `arena.js` | builds the arena, goals, lighting, and boost pads |
| `game.js` | physics, controls, ball, AI, boost, mutators, effects, game loop |
| `car1.glb` … `car9.glb` | the 9 car models |
| `ball.glb` | the ball model |
| `music.mp3` | the soundtrack |

---

## Customising the cars

Open `cars.js`. Each car is one line in `CAR_CATALOG`:

```js
{ id: 'car1', name: 'Raptor', file: 'car1.glb', length: 5.0, faceFix: 0 },
```

- **`name`** — what shows in the car-select menu. Rename freely.
- **`length`** — target size in world units (~5 fits the arena). Raise/lower to scale a car.
- **`faceFix`** — rotation in radians if a car faces the wrong way. Try `Math.PI`
  if a car drives backwards, or `Math.PI/2` / `-Math.PI/2` if it faces sideways.

---

## Credits

- Built with [Three.js](https://threejs.org/).
- Car models were optimized for the web (simplified and Draco-compressed) so they
  load quickly in the browser.
- Inspired by Rocket League. Not affiliated with or endorsed by Psyonix/Epic Games.

---

## Notes & known limitations

- It's a single-player game versus AI (with AI teammates in team modes).
- First load downloads the models, the soundtrack, and the 3D engine, so give it
  a moment; it's cached after that.
- Skins, a shop/economy, and goal replays are not in this version yet.
