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
| Mute / unmute | the speaker button (top-right) or `M` |
| Pause | `P` or `Esc` (also auto-pauses when the tab loses focus) |

- Fly through the gaps in the mako ducts. Each pipe pair you clear scores **+1**.
- Hitting a pipe or the ground ends the run. Tap again to retry.
- The game never stops ramping up: scroll speed rises every point, gaps and pipe spacing tighten, and from score 15 some pipes start moving. `LV` (top-left) ticks up every 5 points.
- Your best score is saved in `localStorage` under `ff7-flappy-best`; the mute setting is saved too.

## Global leaderboard

The title screen shows the **global top 10**, and after a run that scored at least 1 you can enter a name
(letters, digits, space, `. _ -`, up to 12 characters) to submit your score; **Enter** submits, **Esc** skips, and
**Skip** / **Submit** also work by tap or click. Your last-used name is remembered in `localStorage` (`ff7-flappy-name`).
Each run can be submitted once.

- It is backed by a small Supabase table, read and written with plain `fetch` calls to the Supabase REST API
  (`game.js`, search for `// <leaderboard>`). No client library, no build step.
- It **needs a network connection**. Offline (or if the API errors or times out after 8 s) the board shows `OFFLINE`,
  the last successfully loaded list is kept, and the game stays fully playable.
- The key in `game.js` is Supabase's *publishable* (public) key; access is limited to reading and inserting rows by
  row-level security. Because the game is client-side code, scores are not tamper-proof; treat the board as for fun.

## Run locally

No build step and no dependencies. Either open `index.html` directly in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000/
```

## Deploy (GitHub Pages)

It is a static site served from the repo root: all paths are relative (`style.css`, `game.js`), so it
works at `https://<user>.github.io/ff7-flappy/` as well as from a local file or server.

## Files

- `index.html` – page shell, canvas and the leaderboard name form
- `style.css` – full-viewport letterboxing, the mute button and the name-prompt controls
- `game.js` – game loop, physics, procedural art, pixel font, Web Audio sound effects and the leaderboard client
- `README.md`, `.gitignore`

## Assets & originality

Everything is **100% original and generated at runtime**:

- **Graphics:** the hero, reactor ducts, parallax Midgar-style skyline, smokestacks, searchlights, mako haze and
  ground are all painted procedurally on a `<canvas>` with rectangles/gradients — no image files.
- **Font:** a custom 5×7 pixel font drawn with rectangles — no font files, no web fonts.
- **Audio:** simple sound effects synthesized with the Web Audio API (oscillators + noise). No samples, no music
  from any game. Audio starts only after your first flap/tap (browser autoplay rules).
- No Square Enix sprites, logos, fonts, music or other copyrighted material are used or referenced as files.
