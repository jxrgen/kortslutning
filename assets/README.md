# KORTSLUTNING — card art assets

138 kort (134 collectible + 4 tokens) + kortbagside, genereret fra spillets kortdatabase. Alle motiver er rene vektorer (ingen emoji/fonte-afhængighed i rasteriseringen ud over DejaVu, som er indlejret som kurver ved behov), og hvert korts kredsløbsmønster er deterministisk seedet fra kort-id'et — samme id giver altid samme grafik.

## Mappestruktur

```
assets/
├── svg/            138 kort + _bagside.svg — vektorkilde, 750×1050, redigérbar
├── png/            samme kort rasteriseret i 750×1050 (kortratio 2,5:3,5)
├── atlas/
│   ├── kort-atlas.png    sprite-atlas 2760×3864 (12 kolonner à 230×322)
│   └── kort-atlas.json   frame-koordinater pr. kort-id
└── manifest.json   alle kortdata + filreferencer
```

## manifest.json

Én post pr. kort:

```json
{
  "id": "l_titan", "name": "TITAN-9000", "cost": 9,
  "type": "enhed", "tribe": "Robot", "rarity": "L", "cls": null,
  "attack": 8, "health": 8, "keywords": ["jord"],
  "spellDamage": 0, "token": false, "collectible": true,
  "text": "Jordet. Installation: …",
  "files": { "svg": "svg/l_titan.svg", "png": "png/l_titan.png" }
}
```

`collectible: false` markerer tokens (t_*), som ikke indgår i samlingen men bruges af effekter.

## Integration

**Web/PixiJS/Phaser:** `kort-atlas.json` følger TexturePacker-hash-formatet (`frames[id].frame = {x,y,w,h}`) og kan indlæses direkte som spritesheet.

**Unity:** Brug de enkelte PNG'er som sprites, eller importér atlassen og skær den med Sprite Editor (fast grid 250×350). Manifestet parses med `JsonUtility`/Newtonsoft til kortdata.

**Godot:** `AtlasTexture` med `region` fra JSON'en, eller de enkelte PNG'er.

**Højere opløsning:** SVG'erne er kilden — rasterisér i vilkårlig størrelse, fx `sharp` eller `rsvg-convert -w 1500 svg/l_titan.svg`.

## Regenerering

Køres fra repo-roden (kræver `npm install`):

```bash
npm run build:assets
```

Scriptet (`tools/gen-assets.mjs`) læser kortdatabasen direkte fra `kortslutning.jsx`, så nye/ændrede kort automatisk får grafik der matcher.
