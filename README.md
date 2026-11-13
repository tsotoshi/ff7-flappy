# MIDGAR FLAP

A Flappy-Bird-style browser game with a Final Fantasy VII–inspired mood: a spiky blond-haired
mercenary glides through the mako-lit ducts and reactor pipes of a smoggy, industrial night-city.

> **Fan work. Not affiliated with Square Enix.**
> "Final Fantasy" and "FF7" are trademarks of their respective owners. This is a small, non-commercial
> tribute and uses no official assets.

## How to play

| Action | Input |
| --- | --- |
| Flap | `Space` / `↑` / `W` / `Enter`, mouse click, or touch/tap |
| Music on / off | the note button (top-right) or `M` |
| Sound effects on / off | the speaker button (top-right, next to the note button) or `S` (on the character-select screen `S` is cursor-down, so use the button there) |
| Pause | `P` or `Esc` (also auto-pauses when the tab loses focus) |

- Pick your hero from the title screen: tap/click **CHARACTERS** (top-left) or press `C`, then use arrow keys / swipe / tap a portrait and confirm with `Enter`, a second tap or **OK** (`Esc` / **BACK** cancels). **CHARACTERS** is also on the game-over screen, so you can switch hero between runs. The ten heroes are cosmetic only, and your last pick is remembered (`ff7-flappy-char`).
- Fly through the gaps in the mako ducts. Each pipe pair you clear scores **+1**.
- Hitting a pipe or the ground ends the run. Tap again to retry.
- The game never stops ramping up: scroll speed rises every point, gaps and pipe spacing tighten, and from score 15 some pipes start moving. `LV` (top-right, under the two audio buttons) ticks up every 5 points.
- Your best score is saved in `localStorage` under `ff7-flappy-best`; the music and SFX on/off flags are saved too (`ff7-flappy-music`, `ff7-flappy-sfx`; `0` = off, both default on).

leaderboard: games project, tables flap_scores

## Run locally

No build step and no dependencies. Either open `index.html` directly in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000/
```

## Deploy (GitHub Pages)

It is a static site served from the repo root: all paths are relative (`style.css`, `music.js`, `game.js`), so it
works at `https://<user>.github.io/ff7-flappy/` as well as from a local file or server.

## Files

- `index.html` – page shell, canvas and the leaderboard name form
- `style.css` – full-viewport letterboxing, the music / SFX buttons and the name-prompt controls
- `music.js` – the shared Web Audio context (separate music and SFX gains) and the original character themes with their sequencer
- `game.js` – game loop, physics, procedural art, pixel font, Web Audio sound effects and the leaderboard client
- `README.md`, `.gitignore`

## Assets & originality

Everything is **100% original and generated at runtime**:

- **Graphics:** the hero, reactor ducts, parallax Midgar-style skyline, smokestacks, searchlights, mako haze and
  ground are all painted procedurally on a `<canvas>` with rectangles/gradients — no image files.
- **Font:** a custom 5×7 pixel font drawn with rectangles — no font files, no web fonts.
- **Audio:** 100% original and synthesized at runtime with the Web Audio API (oscillators + noise): the sound effects, plus
  short **original fan-made character theme sketches** for Cloud, Sephiroth, Yuffie and Barret (the other heroes have no music).
  The themes are generated live from note data in `music.js`, not played from audio files. **This is not official FF7 music**
  and contains no Square Enix melodies, samples or audio. Audio starts only after your first tap/click/key (browser autoplay
  rules); the theme plays softly on the title and character-select screens, at full level during a run, and stops on game over.
- No Square Enix sprites, logos, fonts, music or other copyrighted material are used or referenced as files.
