APPLICATION : NomDeLApp

<!-- Mode d'emploi : remplacer « NomDeLApp » ci-dessus par le nom du dossier de l'application
     (dans /home/patrick/Documents/Claude/Projets/), puis coller tout ce fichier dans Claude. -->

Avec l'outil video-studio (installé sur la machine), préparer l'application indiquée ci-dessus (PWA React,
dossier /home/patrick/Documents/Claude/Projets/<APPLICATION>) et produire une première vidéo de
présentation courte (≈ 30–60 s, 2 ou 3 écrans ; cette durée est un ordre de grandeur, pas une
limite : une vidéo plus longue est acceptée).

Étapes :

1. **Comprendre le paquet** — Lire /home/patrick/Documents/Claude/Projets/video-studio/README.md
   (configuration, pilote runtime, scénarios) et src/runtime/engine.ts (moteur injecté).
   Lire aussi le package.json, la config Vite et le routeur de l'application pour savoir comment
   elle se construit et navigue.

2. **Initialiser** — Dans le dossier de l'application : `video-studio init` (crée video/ et
   les entrées .gitignore des fichiers générés ; ne touche pas au package.json).
   video-studio est installé **globalement** sur la machine (commande `video-studio`, `setup`
   déjà fait) : ne jamais l'ajouter au package.json de l'application (ni dépendance, ni script
   npm) — il ne doit rien ajouter au déploiement. Si la commande `video-studio` est
   introuvable, me le signaler au lieu de l'installer dans le projet.
   Si le package.json contient encore `@nouhailler/video-studio` ou des scripts `video:*`
   (ancienne installation), les retirer (`npm uninstall @nouhailler/video-studio`).

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

6. **Générer et contrôler** — `video-studio generate --scenario presentation-fr`, puis
   contrôler le MP4 et des images clés : curseur et surbrillance sur les bons éléments, voix
   synchronisée, aucun écran vide ou d'erreur. Corriger et relancer jusqu'à ce que ce soit propre.
   **Durée : ne jamais raccourcir une vidéo parce qu'elle dépasse 60 s** (pas de suppression
   d'étapes, de pauses de lecture ni de réduction de `breathMs` pour gagner du temps) ; ne
   raccourcir que si je le demande.

7. **Description YouTube** — Pour la vidéo générée, écrire un petit texte de présentation à mettre
   en description YouTube : une accroche de 1–2 phrases, ce que montre la vidéo (fidèle au
   scénario réel), le lien vers l'application, puis le chapitrage repris du fichier
   `presentation-fr.chapters.txt` produit. L'enregistrer dans
   `video/presentation-fr.youtube.txt` et l'afficher en entier dans ton message final.

Contraintes :
- package.json et package-lock.json de l'application inchangés par rapport à avant (sauf retrait
  d'une ancienne installation de video-studio). Ne pas ajouter SKIP_DEPENDENCY_INSTALL au
  déploiement (Cloudflare Pages) : le build React a besoin de `npm install`.
- Ne pas modifier le comportement de l'application pour les utilisateurs : seuls les attributs
  data-demo-id et le dossier video/ sont ajoutés.
- Ne rien committer ni pousser sans me le demander ; à la fin, me résumer les fichiers modifiés,
  la durée de la vidéo, le chemin du MP4 et la description YouTube.
