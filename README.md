# IRON CANOPY — Operation Emberfall

An original HTML5 run-and-gun action game, built as a ground-up upgrade of a small canvas prototype.
No build step and no dependencies: open `index.html` (or serve the folder) and play.

## Play

| Action | Keys |
| --- | --- |
| Move | `A` / `D` or `◀` / `▶` |
| Aim up / diagonals, crouch | `W` / `S` or `▲` / `▼` |
| Jump (press again in the air for a jet boost, `▼` + jump drops through platforms) | `Z`, `K` or `Space` |
| Fire (hold) | `X` or `J` |
| Hold position while aiming | `Shift` |
| Pause / mute / start | `P` / `M` / `Enter` |

Gamepads and touch screens (on-screen buttons) are supported too.

## What's in it

- 1280×720 stage with two zones (bioluminescent jungle, storm-lit fortress) and a locked boss arena
- 8-way aiming with a separately rotating gun arm, jet-boost double jump, crouch, drop-through platforms
- Four weapons (Rifle, Scatter, Laser, Rapid) and repair crates, delivered by supply drones you shoot down
- Enemies: troopers, heavy gunners, tracking turrets, attack drones
- Boss "Warden MK-IV": cannon volleys, telegraphed mortars, and a floor-sweeping beam in phase two; its reactor core is the weak point
- Health, lives, checkpoints, score and saved hi-score
- Particles, additive glow, screen shake, rain and fireflies, parallax backdrops
- Sound effects and a two-track soundtrack synthesised live with the Web Audio API

## How the art was made

- **Sprites and tiles** are modelled procedurally and rendered with **Blender** (Cycles) by `tools/render_sprites.py`,
  which also packs the sprite sheets and writes pivot metadata to `assets/sprites/meta.js`.
  Regenerate with `pip install bpy pillow && python3 tools/render_sprites.py`.
- **Backdrops and title art** (`assets/bg/`) are AI-generated images (Google Gemini image model).

## Layout

```
index.html              page shell, touch controls
src/game.js             game loop, entities, rendering
src/level.js            stage layout and enemy placement
src/audio.js            synthesised SFX and music
tools/render_sprites.py Blender sprite pipeline
assets/                 sprites, tiles, backdrops
```
