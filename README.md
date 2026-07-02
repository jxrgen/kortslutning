# ⚡ KORTSLUTNING

Dansk 2-spiller deckbuilder-kortspil (Hearthstone-stil) med elektroniktema. Én klasse — **Teknikeren** — og præcis **100 forskellige kort**. Bygget som ét selvstændigt React-artefakt til [Claude](https://claude.ai). 

## Spillet kort fortalt

- Begge teknikere har 30 liv. Brænd modstanderens kredsløb af først.
- **Energi ⚡**: +1 pr. tur (maks 10). Twist: ubrugt energi gemmes i **kondensatorbanken 🔋** (op til 3) og lægges oveni næste tur.
- **Overophedning**: kraftige kort låser en del af din energi i den efterfølgende tur.
- Heltekraft **Loddekolben 🔧** (2⚡): 1 skade til fjender eller reparér 2 på egne.
- Nøgleord: Jordet (taunt), Turbo (rush), Isoleret (skjold), Højspænding (giftig), Dobbeltkerne (2 angreb), Energihøst (lifesteal), Skjult (stealth) — plus Signalstyrke, Installation, Nedbrud og Kæde.
- Deck: præcis 25 kort, maks 2 af hvert, 1 af hvert legendariske (★).

## Sådan spiller du

Filen `kortslutning.jsx` er et komplet Claude-artefakt: indsæt indholdet i et artefakt (eller bed Claude om at oprette det), og spillet kører direkte i chatten.

**Online (2 enheder):** Begge spillere skal have *det samme publicerede artefakt-link* åbent. Den ene opretter et spil og får en 4-tegns kode, den anden taster den ind. Synkronisering sker via artefaktets delte lager med ~2 sekunders polling; et afbrudt spil kan genoptages med koden.

**Lokalt (samme enhed):** Hotseat-tilstand med skjul-skærmen-overlay mellem turene.

Derudover indeholder appen en deckbygger med filtre og gemte decks samt en regelskærm med hele nøgleordsglossaret.

## Kør tests

```bash
npm install
npm test        # motortest: alle 100 kort spilles + 300 simulerede hele spil
npm run test:ui # SSR-røgtest af alle skærme med ægte spilstate
```

## Arkitektur

Alt ligger i én fil, `kortslutning.jsx`:

1. **Motor** (ren JS, ingen JSX — mellem `__ENGINE_START__`/`__ENGINE_END__`-markørerne): kortdatabase, regler, targeting, kamp, auraer, triggere. Testene evaluerer denne del headless uden React.
2. **UI** (React): menu, deckbygger, lobby, spilskærm, regler. Styling via injiceret `<style>`-tag med PCB-inspireret tema (kobber, fosforgrøn, guldfinger-kanter).

**Multiplayer-synk:** last-write-wins over `window.storage` (Claudes artefakt-API) med `seq`-numre mod forældede skrivninger; som udgangspunkt skriver kun den aktive spiller. Bemærk: `window.storage` findes kun i Claude-artefakter — spillet kører ikke standalone i en browser uden en shim, og en anden backend (fx Firebase) ville være næste skridt for en fritstående version.

**Ærlige forbehold:** Spildata i det delte lager kan i princippet læses af andre brugere af samme artefakt, og anti-snyd er tillidsbaseret — modstanderens hånd findes i den synkroniserede state. Balancen er røgtestet, ikke turneringstunet.
