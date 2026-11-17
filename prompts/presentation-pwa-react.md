APPLICATION : NomDeLApp

<!-- Mode d'emploi : remplacer « NomDeLApp » ci-dessus par le nom du dossier de l'application
     (dans /home/patrick/Documents/Claude/Projets/), puis coller tout ce fichier dans Claude. -->

Brancher le paquet @nouhailler/video-studio sur l'application indiquée ci-dessus (PWA React,
dossier /home/patrick/Documents/Claude/Projets/<APPLICATION>) et produire une première vidéo de
présentation courte (≈ 30–60 s, 2 ou 3 écrans).

Étapes :

1. **Comprendre le paquet** — Lire /home/patrick/Documents/Claude/Projets/video-studio/README.md
   (configuration, pilote runtime, scénarios) et src/runtime/engine.ts (moteur injecté).
   Lire aussi le package.json, la config Vite et le routeur de l'application pour savoir comment
   elle se construit et navigue.

2. **Installer** — Dans le dossier de l'application :
   `npm install -D github:nouhailler/video-studio#v0.2.0`, puis `npx video-studio init`.
   Vérifier que node_modules/ et les sorties générées de video/ sont dans le .gitignore.
   `video-studio setup` est déjà fait sur la machine (voix dans ~/.cache/video-studio) : ne pas le
   relancer, sauf si le navigateur de rendu Remotion manque dans ce projet.

3. **Cibles** — Poser `data-demo-id="…"` dans le JSX sur les éléments à montrer (navigation,
   bouton principal, champ de recherche, une carte de liste…).
   - Sur un composant maison (`<Button>`, `<Card>`…), vérifier que l'attribut atteint bien le DOM
     (props transmises) ; sinon le poser sur l'élément HTML intérieur.
   - Pour un clic, poser l'identifiant sur l'élément cliquable lui-même.
   - Identifiants littéraux de préférence ; un identifiant dynamique n'est pas vu par la validation
     statique → l'ajouter dans `validation.extraTargets`.
   - Vérifier dans Chromium (Playwright) que les éléments existent et ont une taille non nulle.

4. **video/video.config.ts** :
   - `app: { build: 'npm run build', staticDir: 'dist' }` (adapter au dossier de sortie réel) ;
   - `driver: { type: 'runtime' }` (+ `loadingSelector` si l'app a un indicateur de chargement) ;
   - `layout: 'phone'`, `validation: { sourceDirs: ['src'] }` ;
   - thème aux couleurs de l'application (palette lue dans le CSS / Tailwind / manifest) et son logo,
     `url` = adresse publique de l'app si elle est connue ;
   - `preseed` : clés localStorage pour passer l'onboarding, l'avertissement légal ou les bannières,
     et pour afficher des données de démonstration (jamais de données réelles) ;
   - `network.fixtures` si l'application appelle des API externes.

5. **video/scenarios/presentation-fr.ts** — Étapes `highlight`, `click` et `navigate` (et `type`
   si un champ de recherche s'y prête), avec intro, chapitres et outro.
   - Pour changer d'écran, préférer `navigate` avec `target` (clic sur le menu) ; `navigate` avec
     `url` ne fonctionne qu'avec un routeur basé sur history (pas HashRouter).
   - Les narrations ne décrivent que ce qui est réellement à l'écran : vérifier sur des captures.

6. **Générer et contrôler** — `npm run video:generate -- --scenario presentation-fr`, puis
   contrôler le MP4 et des images clés : curseur et surbrillance sur les bons éléments, voix
   synchronisée, aucun écran vide ou d'erreur. Corriger et relancer jusqu'à ce que ce soit propre.

Contraintes :
- Ne pas ajouter SKIP_DEPENDENCY_INSTALL au déploiement (Cloudflare Pages) : le build React a
  besoin de `npm install`. video-studio en devDependency allonge seulement l'installation.
- Ne pas modifier le comportement de l'application pour les utilisateurs : seuls les attributs
  data-demo-id et le dossier video/ sont ajoutés.
- Ne rien committer ni pousser sans me le demander ; à la fin, me résumer les fichiers modifiés,
  la durée de la vidéo et le chemin du MP4.
