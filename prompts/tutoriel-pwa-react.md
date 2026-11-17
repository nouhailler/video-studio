APPLICATION : NomDeLApp

<!-- Mode d'emploi : remplacer « NomDeLApp » ci-dessus par le nom du dossier de l'application
     (dans /home/patrick/Documents/Claude/Projets/), puis coller tout ce fichier dans Claude.
     Fonctionne que la courte vidéo de présentation (presentation-pwa-react.md) ait déjà été
     faite ou non. -->

Avec le paquet @nouhailler/video-studio, produire un **tutoriel vidéo complet d'environ 4 minutes**
de l'application indiquée ci-dessus (PWA React, dossier
/home/patrick/Documents/Claude/Projets/<APPLICATION>) : la plupart des écrans, les fonctions
principales montrées en action, et des explications plus détaillées qu'une simple présentation.

Étapes :

1. **Comprendre le paquet et l'application** — Lire
   /home/patrick/Documents/Claude/Projets/video-studio/README.md (configuration, pilote runtime,
   scénarios) et src/runtime/engine.ts. Parcourir l'application (routes, écrans, composants, doc
   utilisateur ou FAQ si elle existe) et dresser la liste des écrans et des fonctions à montrer.

2. **Installation (si nécessaire)** — Si video/video.config.ts existe déjà, réutiliser
   l'installation et la config existantes. Sinon : `npm install -D github:nouhailler/video-studio#v0.2.0`,
   `npx video-studio init`, vérifier le .gitignore (node_modules/, sorties de video/), et écrire
   video/video.config.ts : `app: { build: 'npm run build', staticDir: 'dist' }` (adapter),
   `driver: { type: 'runtime' }` (+ `loadingSelector` si besoin), `layout: 'phone'`,
   `validation: { sourceDirs: ['src'] }`, thème aux couleurs et logo de l'app, `preseed`
   (onboarding / avertissement légal passés, données de démonstration crédibles et assez riches
   pour remplir les écrans — jamais de données réelles), `network.fixtures` pour les API externes.
   `video-studio setup` est déjà fait sur la machine : ne pas le relancer.

3. **Plan du tutoriel** — Avant d'écrire le scénario, me proposer un plan de 5 à 7 chapitres
   (≈ 30–45 s chacun) : titre du chapitre, écrans traversés, actions montrées, idée de la
   narration. Viser ≈ 550–600 mots de narration au total (≈ 4 min de voix) et 30 à 45 étapes.
   Ordre logique d'un nouvel utilisateur : découverte → usage principal → fonctions secondaires →
   réglages / hors-ligne / installation de la PWA si pertinent. Attendre ma validation du plan.

4. **Cibles** — Poser les `data-demo-id="…"` manquants dans le JSX pour tous les éléments du plan.
   - Sur un composant maison, vérifier que l'attribut atteint bien le DOM ; sinon le poser sur
     l'élément HTML intérieur. Pour un clic, sur l'élément cliquable lui-même.
   - Identifiants littéraux de préférence ; sinon `validation.extraTargets`.
   - Pour un élément situé plus bas dans un écran, utiliser une étape `scroll` ou `highlight`
     (le moteur fait défiler jusqu'à la cible).
   - Vérifier dans Chromium (Playwright) que chaque cible existe et a une taille non nulle.

5. **video/scenarios/tutoriel-fr.ts** (id `tutoriel-fr`, sans toucher à `presentation-fr`) et
   l'ajouter à `scenarios` dans video.config.ts.
   - Intro qui annonce ce que l'on va apprendre, un `chapter` (avec `transition: 'fade'`) au début
     de chaque chapitre du plan, outro qui récapitule les points clés et donne le lien de l'app.
   - Mélanger `highlight` (expliquer un élément), `click`, `type`, `scroll` et `navigate`
     (de préférence par `target` ; `url` seulement avec un routeur basé sur history).
   - Narration pédagogique : dire à quoi sert chaque élément et pourquoi l'utiliser, pas seulement
     le nommer ; phrases courtes ; une idée par étape. `zoom` (1,2–1,4) sur les petits éléments,
     `readingPause` après une explication dense.
   - Les narrations ne décrivent que ce qui est réellement à l'écran : vérifier sur des captures.

6. **Générer et contrôler** — `npm run video:validate -- --scenario tutoriel-fr`, puis
   `npm run video:generate -- --scenario tutoriel-fr`. Si le rendu dépasse le délai, augmenter
   `output.timeoutMs`. Contrôler le MP4 (durée ≈ 3 min 30 – 4 min 30) et des images clés de
   chaque chapitre : curseur et surbrillance sur les bons éléments, voix synchronisée, titres de
   chapitre corrects, aucun écran vide ou d'erreur. Corriger et relancer jusqu'à ce que ce soit
   propre.

7. **Description YouTube** — Pour la vidéo générée, écrire un texte de présentation à mettre en
   description YouTube : accroche de 1–2 phrases, paragraphe sur ce que le tutoriel apprend
   (fidèle au scénario réel), liste courte des fonctions montrées, lien vers l'application, puis
   le chapitrage repris du fichier `tutoriel-fr.chapters.txt` produit. L'enregistrer dans
   `video/tutoriel-fr.youtube.txt` et l'afficher en entier dans ton message final.

Contraintes :
- Ne pas ajouter SKIP_DEPENDENCY_INSTALL au déploiement (Cloudflare Pages) : le build React a
  besoin de `npm install`.
- Ne pas modifier le comportement de l'application pour les utilisateurs : seuls les attributs
  data-demo-id et le dossier video/ sont ajoutés.
- Ne rien committer ni pousser sans me le demander ; à la fin, me résumer les fichiers modifiés,
  la durée de la vidéo, le chemin du MP4 et la description YouTube.
