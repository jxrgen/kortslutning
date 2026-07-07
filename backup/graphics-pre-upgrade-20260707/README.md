# Grafik-backup (før 3D/tekstur-opgradering)

Oprettet: 2026-07-07

Indeholder kopier af alle grafik-relaterede filer **før** opgraderingen med 3D-kort, papirtekstur og forbedrede animationer.

## Indhold

- `assets/` — alle SVG, PNG, atlas og manifest
- `kortslutning.jsx` — spil + UI + CSS
- `_app.jsx` — alternativ app-kopi
- `web/` — landing page-skabelon
- `gen-assets.mjs`, `icons.mjs` — asset-generering

## Gendan

Fra repo-roden (fuld backup med alle PNG/SVG findes lokalt i denne mappe hvis den ikke er slettet):

```bash
cp -r backup/graphics-pre-upgrade-20260707/assets ./
cp backup/graphics-pre-upgrade-20260707/kortslutning.jsx ./
cp backup/graphics-pre-upgrade-20260707/_app.jsx ./
cp -r backup/graphics-pre-upgrade-20260707/web ./
cp backup/graphics-pre-upgrade-20260707/gen-assets.mjs tools/
cp backup/graphics-pre-upgrade-20260707/icons.mjs tools/
npm run build:web
```

Kilde-backup (jsx, mjs, web) er committet i git. Binære assets (png/svg) ligger i backup-mappen på disk men er ikke i git pga. størrelse — kør `git checkout main -- assets/` for at hente den gamle version fra main, hvis du ruller tilbage via git.
