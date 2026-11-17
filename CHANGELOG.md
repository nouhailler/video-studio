# Journal des modifications

## 0.3.0 — 2026-11-17

video-studio devient un outil de la machine, installé une fois globalement, et non plus une
dépendance des applications : les déploiements n'installent plus Remotion, Playwright, etc.

- Installation : `npm install -g github:nouhailler/video-studio#v0.3.0`, puis `video-studio setup`.
- `init` ne modifie plus le `package.json` (ni dépendance, ni scripts `video:*`) et fonctionne sans
  `package.json` (nom lu dans `pubspec.yaml` ou le nom du dossier ; build Flutter détecté).
- Les imports `'@nouhailler/video-studio'` des fichiers `video/` sont résolus par la CLI qui
  s'exécute : rien à installer dans le projet (ESM comme CommonJS).
- Racine du projet : le dossier qui contient `video/`, même sans `package.json`.
- Navigateur de rendu et cache webpack de Remotion partagés dans `~/.cache/video-studio/remotion`
  au lieu de `node_modules/.remotion` et `.cache/` du projet.
- `setup` installe Chromium avec la version de Playwright du paquet (plus `npx playwright` au hasard).
- `theme.fontCss` : cherché dans le projet, puis dans les dépendances de video-studio.
- Node ≥ 20.6 (crochets de résolution `module.register`).

## 0.2.0 — 2026-11-16

Retours de la première intégration dans une application Flutter Web (Boulangeor).

### Moteur injecté (pilote `runtime`)
- `type` : la cible peut être un conteneur qui contient le champ (TextField Flutter :
  `<flt-semantics>` > `<input>`). Avant : « non saisissable ».
- `click` / `navigate` par cible : si la cible ne porte pas d'action mais contient un élément
  actionnable qui la recouvre (≥ 60 % de sa surface), le clic lui est transmis. Avant : clic sans effet
  quand l'identifiant était posé au-dessus d'un bouton ou d'un InkWell.
- `navigate` par cible échoue explicitement si le clic n'a rien changé (ni DOM, ni URL).
- Les mutations du DOM dues à l'overlay (curseur, onde) ne comptent plus dans l'attente de stabilité.
- La surbrillance réapparaît directement sur sa cible au lieu de glisser depuis sa position précédente.

### Validation
- Lecture des fichiers `.dart` : `Semantics(identifier: 'x')`, interpolations `'x-$id'` → préfixe.
- Avec `driver.targetAttribute: 'flt-semantics-identifier'`, l'attribut cherché dans le code est
  `identifier` par défaut.
- Nouvelle option `validation.patterns` (expressions régulières, groupe 1 = identifiant).

### Capture et rendu
- Taille réelle de la capture mesurée (ffprobe) au lieu d'être calculée ; avertissement si elle est
  inférieure à `viewport × deviceScaleFactor`.
- `screen.mp4` encodé avec une image clé par seconde : extraction plus rapide par Remotion.
- Rendu : délai `output.timeoutMs` (120 s par défaut) et, en cas de délai dépassé ou d'onglet fermé,
  un nouvel essai avec un seul onglet et un délai doublé.
- `setup` installe aussi le Chrome Headless Shell de Remotion ; sinon son téléchargement est annoncé
  au premier rendu.

### Documentation
- Section « Applications Flutter Web » dans le README.

## 0.1.0

Première version publique.
