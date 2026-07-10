# ⚡ KORTSLUTNING

A 2-player deckbuilder card game (Hearthstone-style) with an electronics theme. One class — **The Technician** — and exactly **100 different cards**. Built as a single self-contained React artifact for [Claude](https://claude.ai), playable on web and desktop.

## The game in short

- Both technicians have 30 HP. Burn out your opponent's circuit first.
- **Energy ⚡**: +1 per turn (max 10). The twist: unspent energy is stored in the **capacitor bank 🔋** (up to 3) and added next turn.
- **Overheat**: powerful cards lock part of your energy on the following turn.
- Hero power **Soldering Iron 🔧** (2⚡): 1 damage to enemies or repair 2 on friendlies.
- Keywords: Grounded (taunt), Turbo (rush), Insulated (shield), High Voltage (poisonous), Dual Core (2 attacks), Energy Harvest (lifesteal), Cloaked (stealth) — plus Signal Strength, Install, Breakdown and Chain.
- Deck: exactly 25 cards, max 2 of each, 1 of each legendary.

## Play

`kortslutning.jsx` is a complete Claude artifact. There is also a static web build in `docs/` (solo vs. built-in bot + local hotseat) and an Electron desktop app in `desktop/` — build both with `node tools/build-web.mjs`. Online multiplayer requires the Claude artifact edition (shared storage).

## Development

```bash
npm install
npm test              # engine: all 100 cards + 300 simulated games + bot checks
npm run test:ui       # SSR smoke test of every screen
npm run build:assets  # regenerate all card art from the card database
npm run build:web     # bundle docs/ (GitHub Pages) and desktop/app/
```

Architecture: pure-JS engine between `__ENGINE_START__`/`__ENGINE_END__` markers (headless-testable), React UI below, PCB-themed CSS injected via a style tag. Multiplayer sync is last-write-wins over the artifact's shared storage with sequence numbers. Adding a new class = one entry in the `CLASSES` table + cards with a `cls` field.

## Icons

Interface icons come from [game-icons.net](https://game-icons.net) and are used under
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). They are inlined into
`kortslutning.jsx` by `tools/gen-icons.mjs`, which also regenerates
[`ICONS-CREDITS.md`](ICONS-CREDITS.md).

```sh
node tools/gen-icons.mjs      # klon af game-icons hentes automatisk til .iconsrc/
npm run test:icons            # tjekker slots, tokens og at krediteringen er intakt
```

Attribution is a licence requirement: don't remove `ICON_CREDITS` or the Credits
section on the Rules screen.
