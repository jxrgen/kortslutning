# AGENTS.md — arbejdsnoter til Kortslutning / Cardware Crash

Skrevet af Claude til fremtidige Claude-sessioner. Jørgen arbejder på dansk; kode
og UI er på engelsk. Læs denne fil før du begynder — den koster 2 minutter og
sparer en hel session.

Grundprincip fra Jørgen: **udfør, opsummer ikke.** Klon, ret, test, byg, commit,
push — og vis en målbar før/efter når det handler om ydelse eller adfærd. Lad
være med at forklare hvad du *ville* gøre; gør det.

---

## 1. Ydelse er den vigtigste lære (læs denne først)

Symptomet "UI'et/hover hakker ekstremt" i Card Library tog flere runder at løse,
fordi jeg gættede forkert. Sådan her forholder det sig:

### jsdom kan IKKE måle det der gør browseren langsom
Test-harnessen kører i jsdom. jsdom måler JS/React-arbejde (element-skabelse,
reconciliation, render-tællere) — men **ikke paint, rasterisering eller
compositing**. Næsten al "det hakker visuelt"-langsomhed bor i paint/composite.
Så hvis du optimerer React og problemet består: **det er CSS-paint, ikke React.**
Stop med at optimere React.

### De faktiske rod-årsager (bekræftet løst — Jørgen: "Nu virker det perfekt")
Alle tre sad på hvert af de 120 kort i gitteret, dvs. de blev ganget op:

1. **`background-blend-mode`** — den værste. En enkelt property tog paint fra
   16 ms til ~800 ms i en veldokumenteret case
   (sam.today/blog/1-css-property-that-will-ruin-your-scroll-performance).
   Jeg havde selv sat `background-blend-mode:overlay` på hvert `.mkort` da jeg
   lavede papirteksturen. På 120 kort blev det katastrofalt.
2. **Inline-SVG der re-rasteriseres når noget flyver over.** Hvert korts kunst
   var en levende inline-`<svg>` (dusinvis af path-noder). Når hover-panelet
   glider hen over gitteret, tvinger det browseren til at re-rasterisere hvert
   overlappet SVG (codepen.io/tigt/post/improving-svg-rendering-performance;
   cloudfour.com/thinks/svg-icon-stress-test/). Med 120 kort = jank ved hver
   musebevægelse.
3. **`filter: drop-shadow(...)` på hvert kunst-element** (endda dobbelt). Filtre
   er dyre og re-rasteriseres på samme måde.

### Fixet der virkede
- **Flade grid-kort**: en `.mkort.flad`-variant der dræber alle tre — flad
  `linear-gradient`-baggrund uden blend-mode, `filter:none` på kunsten, ingen
  shimmer/`::before`-sweep-animation, `content-visibility:auto`.
- **Kortkunst som `<img>` data-URI** i stedet for inline-`<svg>` i gitteret.
  Benchmarks udpeger url-kodet SVG-data-URI i `<img>` som den *hurtigste* teknik
  for mange ens billeder: browseren rasteriserer én gang og cacher bitmap'en, så
  intet re-rasteriseres når panelet glider over. Se `artDataUri()` + `CardArtImg`
  og `imgArt`-proppen på `MiniCard`. Resultat: **0 SVG-tegneelementer i gitteret**
  (før: mange tusinde), 4 DOM-noder pr. kort.
- In-game-kortene beholder den fine papir/3D-look — der er kun en håndfuld på
  skærmen ad gangen, så prisen betyder intet der. Kun *gitteret* skal være fladt.

### Hover må aldrig gå gennem React i en stor liste
Selv efter memoisering var hover for tung, fordi hver musebevægelse udløste en
React-state-ændring → komponent-gennemkørsel → mount/unmount. I artifact-miljøet
kører React ofte i dev-mode, hvilket ganger det op. Løsningen: **tag hover helt
ud af React.** Ét permanent popup-element på `document.body`, alle paneler bygget
som HTML én gang og cachet som DOM-noder (`_hovNodes`, `cardInfoHtml()`), og én
delegeret native `mouseover`-listener på panen der slår op via `data-id`. En
hover = Map-opslag + `replaceChildren` + én `translate3d`. Nul renders.

### Tjekliste ved "det er langsomt" (i denne rækkefølge)
1. Optræder symptomet ved hover/scroll/animation over mange elementer? → mistænk
   **paint**, ikke JS. jsdom vil ikke afsløre det.
2. Grep efter `background-blend-mode`, `mix-blend-mode`, `filter:` (særligt
   `drop-shadow`/`blur`) og `backdrop-filter` på elementer der findes i stort
   antal. Fjern eller isolér dem for lister/gitre.
3. Tælles der mange levende inline-`<svg>` i en liste? → lav dem til `<img>`
   data-URI (url-kodet, ikke base64).
4. Går hover/tooltip gennem React-state i en stor liste? → flyt til ét DOM-popup
   + delegeret native listener.
5. Rives der store undertræer ned ved navigation? → hold-montér og toggle
   `display:none` i stedet (se punkt 3 nedenfor om Back-knappen).
6. Kan du ikke bevise det i jsdom? Bed Jørgen om ét tal: DevTools → Performance,
   optag under interaktionen, aflæs længste **Paint**/**Rasterize** i ms. Det
   peger direkte på synderen.

---

## 2. Hvad projektet er (kort)

Browser-baseret 2-spiller deckbuilder med elektronik-tema, bygget som **én
selvstændig JSX-fil** (`kortslutning.jsx`, ~5000+ linjer): fuld spilmotor, bot-AI,
online-multiplayer via delt lager, tutorial, Card Library, og en roguelike
solo-mode ("Meltdown Run"). Ingen binære assets — al grafik er procedurel SVG
eller game-icons.net-ikoner inlinet som paths; lyd er Web Audio-syntese.

Arkitektur:
- Ren-JS motor mellem `/* __ENGINE_START__ */` og `/* __ENGINE_END__ */` —
  headless-testbar, ingen React-afhængigheder. Al spillogik hører til her.
- React-UI nedenunder. CSS er én stor template-streng injiceret via `<style>`.
- `export default App` skal stå på `App` — se landmine nedenfor.
- Ikoner mellem `/* __ICONS_START__ */` og `/* __ICONS_END__ */` genereres af
  `tools/gen-icons.mjs` (må ikke redigeres i hånden).
- Statisk web/desktop-build: `web/index.html`-templat + `tools/build-web.mjs`
  injicerer titel/splash. Forsidens PCB-titel genereres i build-scriptet.

---

## 3. Arkitektur-mønstre der virker (genbrug dem)

- **Memoisér globalt, ikke pr. instans.** Deterministisk output (kort-kunst med
  seed = kort-id, ikoner, keyword-badges) caches i modul-niveau `Map`s og
  `React.memo`. Se `_artProps`, `_artUri`, `_icoCache`, `cardInfoHtml`.
- **Gitre i `useMemo`.** Byg kun gitteret om når dets data ændrer sig, ikke når
  et sideliggende panel skifter. Ved hover får React samme element-reference og
  springer hele undertræet over.
- **Hold-montér tunge skærme.** Card Library unmountes ALDRIG efter første besøg
  (`harSetDeck` i App); Back er en `display:none`-toggle. At rive ~5000 DOM-noder
  ned gjorde Back træg. Bonus: deck-kladden overlever et smut til menuen.
- **Log/tekst som serialiserbare tokens.** Log-linjer gemmes som ren tekst med
  `§bolt§`/`§kw_jord§`-tokens (så online-state forbliver serialiserbar) og
  renderes af `LogTekst`/`Ico`. Ingen emoji i state.

---

## 4. Landminer (kostede mig en session hver)

- **`export default` skal blive på `App`.** Da jeg indsatte nye komponenter lige
  over `function App()`, endte `export default` på en kommentar → appen blev
  **helt blank** i produktion. `test:ui` (SSR-røgtest) fangede det. Tjek altid at
  `grep -c "export default" == 1` og at den sidder på App.
- **SSR-tests fanger IKKE `useEffect`-crashes.** En sort-skærm-bug
  (`ReferenceError` i en effect) var usynlig for SSR. Derfor findes
  `test/testmount.mjs` (jsdom, kører `useEffect`). Kør den altid.
- **`useState`-lækage mellem faser.** Ét delt `valg`-state til både kort- og
  opgraderingsvalg i RunView gav crash da et kort-id endte hvor en opgrade-nøgle
  blev slået op. Adskil state pr. betydning.
- **Child safety / rimelighed osv.** gælder uændret; intet i denne app rører ved
  det, men lad være med at drifte fra kerneværdier over lange sessioner.

---

## 5. Arbejdsgang

```bash
git clone --depth 1 https://github.com/jxrgen/kortslutning.git
cd kortslutning && npm install
# ret kortslutning.jsx direkte (motoren mellem markørerne; UI nedenfor; CSS i template-strengen)
```

Tests (alle skal være grønne før commit — pre-commit-hook kører de fleste):
```bash
npm test            # motor: alle kort + ~300 simulerede spil + bot-tjek
npm run test:mount  # jsdom: mount + useEffect + Library-hover-assertions + RunView
npm run test:icons  # ikon-slots, tokens, og at CC BY 3.0-krediteringen er intakt
npm run test:ui     # SSR-røgtest af hver skærm (fanger export-default-landminen)
npm run agents      # regler, effekter, dækning, fuzz, bots, og Meltdown-Run-balance
npm run build:web   # bundler docs/ (Pages) + desktop/app/ — commit docs/ med
```

Skriv en ny test/assertion når du fikser noget vigtigt, så det ikke regredierer.
Eksempler jeg har låst fast: Library-kort skal have `<img>`-kunst og `.flad`
(ikke inline-SVG/blend-mode); hover-popup skal vises ved native mouseover og
genbruge cachede noder; titlens hover-panel skal være let.

### Secrets & push
Jørgen uploader `secrets.txt` til `/mnt/user-data/uploads/` (Project-filer ligger
IKKE på disk — de kommer som upload eller i konteksten). Format:
```
GITHUB_TOKEN="github_pat_..."
GITHUB_REPO="jxrgen/kortslutning"
```
Push (redigér altid tokenet ud af enhver terminal-output):
```bash
set -a && . /mnt/user-data/uploads/secrets.txt && set +a
git push -q "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPO}.git" main 2>&1 \
  | sed -E 's/github_pat_[A-Za-z0-9_]+/[REDACTED]/g'
```
**Sig ALTID til Jørgen at tokenet skal roteres bagefter** — det ligger i
klartekst i samtalen så snart filen er delt.

---

## 6. Deployment-særheder

- **GitHub Pages** deployes fra branch → `main` → `/docs` (ikke Actions; Actions
  var upålideligt). Derfor SKAL `docs/app.js` og `docs/index.html` committes.
- **Divergeret remote** (Jørgen redigerer i Claude-artifact-editoren mellem
  sessioner): `git config pull.rebase false && git pull --no-edit "<url>" main`,
  løs evt. trivielle konflikter, push igen. Mine ændringer er i `kortslutning.jsx`
  / `docs/` / `test/`; hans er typisk andre steder.
- **PAT mangler workflow-scope**, så filer under `.github/workflows/` kan ikke
  pushes med det — de skal uploades manuelt via GitHub-web-UI'et.
- En shallow klon skal måske `git fetch --unshallow` før en pull kan merge.

---

## 7. Nyttige placeringer

- Motor-grænse: `/* __ENGINE_START__ */` … `/* __ENGINE_END__ */`
- Kort-kunst: `artProps()` (inline-SVG), `artDataUri()`+`CardArtImg` (img/data-URI)
- Hover uden React: `cardInfoHtml()`, `_hovNodes`, `showHov()`/`hideHov()`,
  delegeret listener i `DeckBuilder`
- Meltdown Run (roguelike): motoren efter `RUN_LEN`/`UPGRADES`; balance i
  `tools/agents/agent-run.mjs` (botten spiller spillerens side = konservativt)
- Ikon-generator: `tools/gen-icons.mjs` → også `ICONS-CREDITS.md` + `ICON_CREDITS`
- Forsidens PCB-titel: `titleSvg()` i `tools/build-web.mjs`
- Pre-commit: `.githooks/pre-commit` (kør `git config core.hooksPath .githooks`
  hvis hooken ikke fyrer i en frisk klon)
