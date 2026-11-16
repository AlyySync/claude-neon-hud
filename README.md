# neon-hud

A sci-fi HUD mod for [Claude Code](https://claude.com/claude-code). Replaces the space above the prompt with an animated cyan banner and a compact session HUD.

![status: experimental](https://img.shields.io/badge/status-experimental-cyan)

## What it does

On a fresh session, the band above your prompt shows a large animated **CLAUDE** logo inside a bordered frame, with a starfield drifting horizontally above and below it — stars like `★ ✦ ✧ ⋆ ✴ ✫ ☆` moving at different speeds and directions. All in a single cyan palette.

Once you send your first message, the greeting collapses into a compact HUD row that stays for the rest of the session:

```
NEXUS ∷ ⟨ ACTIVE ◢ ⟩ │ calls 3 │ ⧗ 12s ⟦███████░░░░░⟧        [ — hide ]
```

- `⟨ ACTIVE … ⟩` with a rotating pulse glyph while a turn is running, or `⟨ IDLE ◇ ⟩` between turns.
- Live counters for tool calls this turn and for errors (shown in red if any).
- A yellow elapsed-time readout and a filling progress bar while the model works.
- Between turns, shows how long the last turn took.
- Press `h` or run `/hud` to toggle the whole band off; run `/hud` again to bring it back.

The mod writes nothing to the network and makes no model calls, so it adds zero API cost.

## Install

Copy the folder into your Claude Code skills directory, where it auto-loads on every new session:

```bash
git clone https://github.com/AlyySync/claude-neon-hud.git ~/.claude/skills/neon-hud
```

Restart Claude Code. The band should appear above your prompt. To confirm it loaded, run `claude plugin list` — you should see `neon-hud@skills-dir`.

## Customize

Edit `hooks/register.tsx`:

- **Palette** — the constants at the top (`CYAN`, `MAGENTA`, `PURPLE`, `GREEN`, …) are 24-bit hex colors. Change them for a different look.
- **Logo** — `LOGO` is a 6-row ASCII block. Replace it with any ASCII art up to the width you want; the banner recenters automatically.
- **Star glyphs** — `PARTICLE_GLYPHS` is the pool the starfield picks from.
- **Density / speed** — `STAR_ROWS` and the `density` formula in the greeting; the `$.clock.every(400, …)` interval in `session.start` controls animation speed.

Changes hot-reload automatically when the file is saved while a Claude Code session is open — no restart needed.

## Status line

This repo ships only the plugin. A matching bash status line (see the commented header in `hooks/register.tsx`) can be wired into `~/.claude/settings.json` under the `statusLine` key — same cyberpunk palette, with model, path, git branch, context usage bar, and clock.

## License

MIT. See [LICENSE](./LICENSE).
