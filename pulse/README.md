# VOLT — browser music studio

A complete in-browser DAW: drum machine, subtractive synth, melodic sequencer, sampler, mixer, master FX, arrange chain, and project save/load.

## Run locally

```bash
# from repo root
npx --yes serve pulse -p 4173
# open http://localhost:4173
```

Or open `pulse/index.html` via any static server (ES modules need HTTP).

## Features

- **Transport** — play/stop, BPM, swing, metronome, pattern bank A–H
- **Drums** — 4 synthesized kits (Analog, 808 Boom, Loft, Glitch), 16-step grid, accents
- **Synth** — dual-osc subtractive, filter, amp/filter ADSR, LFO, unison, presets
- **Sequencer** — 32-step × 24-note piano grid routed to the synth
- **Sampler** — 16 pads, file drop, mic record, procedural tones
- **Mixer** — per-bus level/pan/mute/solo + master
- **Master FX** — reverb, delay, drive into compressor
- **Arrange** — chain patterns into a song loop
- **Keyboard** — on-screen + computer keys (A–K, Z/X octave, Space play)
- **Persistence** — localStorage save/load + JSON export/import (`.volt.json`)

## Stack

Vanilla JS (ES modules) + Web Audio API. No build step required.
