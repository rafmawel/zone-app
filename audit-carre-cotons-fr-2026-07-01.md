# Audit e-commerce — Carré Cotons

**Site audité :** https://carre-cotons.fr/
**Secteur :** Accessoires textiles (zéro déchet, Made in France)
**Marché :** B2C
**Plateforme détectée :** Shopify (thème type Avada / Shella)
**Date de l'audit :** 1er juillet 2026
**Méthodologie :** découverte via `sitemap.xml`, chargement HTTP de 17 pages représentatives, extraction automatisée des signaux UX / SEO / Performance / Trust / Conversion (HTML brut, données structurées JSON-LD, en-têtes, catalogue complet).

> ⚠️ **Périmètre de mesure.** L'analyse repose sur le HTML servi côté serveur et les données structurées. Les temps de rendu (LCP, INP) sont **estimés** à partir du poids des pages, du nombre d'images et du JavaScript bloquant, non mesurés en conditions réelles (WebPageTest / CrUX recommandés en complément). Les pages panier/checkout ont été inspectées à vide (redirigent vers l'accueil sans article).

---

## 1. Scorecard globale

| Module | Note /10 | Verdict |
|---|:---:|---|
| 🎨 UX & Design | **7,0** | Bon socle, identité soignée, hiérarchie de titres à revoir |
| 🔍 SEO | **5,0** | Fondations correctes mais **handicap majeur : URLs/titres en Unicode stylisé** |
| ⚡ Performance | **4,0** | Pages lourdes, **aucun lazy-load natif, aucun WebP** |
| 🛡️ Réassurance & Trust | **7,0** | Trustpilot 4,9/5 fort, mais avis non exploités sur les fiches |
| 💳 Conversion | **6,5** | Bon éventail de paiement, quelques frictions du tunnel |
| **MOYENNE GLOBALE** | **⭐ 5,9 / 10** | **Boutique saine à fort potentiel, bridée par la technique SEO & Perf** |

**Synthèse en une phrase :** Carré Cotons a une marque désirable, un catalogue riche (137 produits) et une réassurance crédible, mais laisse **une part significative de son trafic organique et de sa vitesse sur la table** à cause de choix techniques évitables (caractères Unicode dans les URLs, images non optimisées, avis non structurés).

---

## 2. Pages analysées (17 URLs)

| # | Type | URL | Poids HTML |
|---|---|---|---:|
| 1 | Accueil | `/` | 256 Ko |
| 2 | Catégorie | `/collections/boxdemaquillante-5-cotons` | 184 Ko |
| 3 | Catégorie | `/collections/top-bags` | 170 Ko |
| 4 | Catégorie | `/collections/headband` | 246 Ko |
| 5 | Produit | `/products/box-nenuphars-5-cotons` | 192 Ko |
| 6 | Produit | `/products/top-bag-tokyo` | 194 Ko |
| 7 | Produit | `/products/trousse-de-toilette-monstera` | 211 Ko |
| 8 | Panier | `/cart` | 140 Ko |
| 9 | Contact | `/pages/contactez-moi` | 144 Ko |
| 10 | Qui sommes-nous | `/pages/qui-sommes-nous` | 144 Ko |
| 11 | Où nous trouver | `/pages/ou-nous-trouver` | 152 Ko |
| 12 | CGV | `/pages/conditions-generales-de-vente...` | 165 Ko |
| 13 | Mentions légales | `/policies/legal-notice` | 140 Ko |
| 14 | Confidentialité | `/policies/privacy-policy` | 149 Ko |
| 15 | Remboursement | `/policies/refund-policy` | 144 Ko |
| 16 | Expédition | `/policies/shipping-policy` | 140 Ko |
| 17 | CGU | `/policies/terms-of-service` | 164 Ko |

---

## 3. Analyse détaillée par module

### 🎨 3.1 UX & Design — 7,0/10

**Points forts**
- Proposition de valeur claire et différenciante en page d'accueil : *« Accessoires de toilette 100 % Made in France — chaque pièce est pensée pour être utile, belle et bien finie »*.
- Univers visuel cohérent, palette douce, photographie produit soignée (jusqu'à 82 visuels en accueil).
- Barre d'annonce persistante « LIVRAISON OFFERTE ♡ » + rappel « dès 60 € d'achats » : incitation au panier moyen visible.
- Navigation catégorielle lisible (Box démaquillantes, Top Bags, Trousses, Headbands, Charlottes, Pochettes à savon, Étuis à brosse à dents).
- `viewport` mobile présent sur 100 % des pages → responsive de base assuré.

**Problèmes identifiés**
- 🟠 **Important — H1 d'accueil = simple nom de marque (« Carré Cotons »).** Le H1 le plus stratégique du site ne porte aucune promesse ni mot-clé. → Remplacer par un H1 orienté bénéfice + requête, ex. *« Accessoires textiles zéro déchet, faits main en France »*.
- 🟠 **Important — hiérarchie de titres cassée.** L'accueil enchaîne H1 → **H3** sans aucun H2 (10 balises H3, 0 H2). La structure sémantique est incohérente pour l'utilisateur (lecteurs d'écran) comme pour Google. → Réordonner en H1 › H2 (sections) › H3 (sous-blocs).
- 🟡 **Mineur — emojis dans les titres de section** (« TROUSSES DE TOILETTE 👛 », « HEADBANDS FLEURIS 💐 »). Sympathique mais à utiliser avec parcimonie ; certains lecteurs d'écran les vocalisent intégralement.
- 🟡 **Mineur — page Contact sans H1.** La page `/pages/contactez-moi` n'a aucun H1 (titre visuel injecté autrement). → Ajouter un H1 « Contactez-nous ».

---

### 🔍 3.2 SEO — 5,0/10

**Points forts**
- `<title>` présents, uniques et de longueur maîtrisée sur toutes les pages.
- Données structurées riches : `Organization`, `WebSite` + `SearchAction`, `BreadcrumbList` partout ; `Product` + `AggregateOffer` + `Brand` sur les fiches ; `ItemList` sur les collections.
- Balises `canonical`, `og:image` et `viewport` présentes sur 100 % des pages testées.
- Fiches produit dotées d'une meta description construite automatiquement.

**Problèmes identifiés**
- 🔴 **CRITIQUE — 104 produits sur 137 (76 %) utilisent des caractères Unicode « mathématiques » stylisés** dans leur nom ET leur URL (ex. `Box démaquillante 𝑵𝒆𝒏𝒖𝒑𝒉𝒂𝒓𝒔`, `Top Bag 𝑻𝒐𝒌𝒚𝒐`). Dans l'URL ils deviennent `%F0%9D%91%B0%F0%9D...` — illisibles.
  - **Impact :** ces glyphes ne sont pas indexés comme du texte normal par Google, cassent la pertinence sur les requêtes de marque produit, sont invocalisables par les lecteurs d'écran (accessibilité RGAA) et illisibles quand l'URL est copiée/partagée.
  - **Reco :** renommer tous les produits en typographie standard (« Box démaquillante Nénuphars »). Le style visuel doit passer par la CSS, jamais par des caractères Unicode. Mettre en place des redirections 301 des anciennes URLs.
- 🔴 **CRITIQUE — aucun `aggregateRating` dans les données structurées produit.** Le site affiche pourtant « 4,9/5 sur +140 avis clients ». Résultat : **pas d'étoiles dans les résultats Google** (rich snippets), alors que la matière existe. C'est une perte directe de CTR organique. → Injecter `aggregateRating` (ratingValue + reviewCount) dans le JSON-LD `Product` via l'app d'avis.
- 🟠 **Important — pages de collection sans meta description.** Les catégories (Box démaquillantes, Top Bags, Headbands…) n'ont **aucune meta description** → Google génère un extrait aléatoire. Ces pages captent des requêtes génériques à fort volume. → Rédiger une meta description unique par collection (140-160 car.).
- 🟠 **Important — doublons de catalogue.** 7 produits « copie-de-… » sont indexables (`copie-de-headband-daisy`, `copie-de-trousse-de-maquillage-eventails-rouges`…) → contenu dupliqué / dilution. → Supprimer, fusionner ou passer en `noindex`/redirection.
- 🟡 **Mineur — meta description d'accueil courte (107 car.).** Correcte mais sous-exploitée. → L'étendre à ~155 car. avec un appel à l'action.
- 🟡 **Mineur — pas de `hreflang`.** Acceptable pour un site mono-marché FR ; à prévoir seulement en cas d'expansion (BE/CH francophone déjà pressenti via l'usage de Bancontact).

---

### ⚡ 3.3 Performance — 4,0/10

**Estimation LCP :** ~3,5 – 5 s sur mobile 4G (à confirmer par mesure réelle). Fourchette déduite du poids HTML, du volume d'images non optimisées et du JS.

**Problèmes identifiés**
- 🔴 **CRITIQUE — aucune image en `loading="lazy"` natif sur l'ensemble du site (0 occurrence).** Le lazy-load repose uniquement sur du JavaScript (`data-src`, 51 occurrences en accueil). Conséquences : dépendance au JS, images non chargées si le JS échoue, et surtout **le navigateur ne peut pas prioriser nativement le LCP**. → Adopter `loading="lazy"` natif hors du premier écran + `fetchpriority="high"` sur l'image hero.
- 🔴 **CRITIQUE — aucune image au format WebP/AVIF (0 occurrence).** Le catalogue est servi en PNG/JPG (148 PNG + 157 JPG sur l'échantillon). Le CDN Shopify sait générer du WebP à la volée, mais les balises `<img src>` pointent vers du jpg/png. → Forcer la livraison WebP/AVIF (paramètre `format` du CDN / réglage du thème). Gain typique : -30 à -50 % de poids image.
- 🟠 **Important — pages HTML lourdes : 140 à 256 Ko de HTML seul** (accueil 256 Ko, collection Headband 246 Ko). Beaucoup de contenu est injecté en dur (JSON-LD volumineux, markup répété). → Alléger le thème, différer les blocs non critiques.
- 🟠 **Important — JavaScript abondant : 46 à 55 balises `<script>` par page, dont 14 à 17 scripts externes** (Trustpilot, apps Shopify, tracking…). Chaque script tiers ajoute des requêtes bloquantes. → Auditer les apps, supprimer les inutilisées, charger les widgets tiers en `defer`/`async` et après interaction.
- 🟠 **Important — responsive images sous-exploité.** `srcset` n'est présent que sur ~18 images (sur 368 collectées) ; `data-srcset` absent. → Généraliser `srcset`/`sizes` pour éviter de servir des visuels surdimensionnés sur mobile.
- 🟡 **Mineur — un seul `rel="preload"` en accueil.** → Précharger la police principale et l'image hero LCP.

---

### 🛡️ 3.4 Réassurance & Trust — 7,0/10

**Points forts**
- **Preuve sociale forte et crédible :** « ⭐️ 4,9/5 sur +140 avis clients » + intégration **Trustpilot** (widget officiel, script chargé).
- Storytelling de marque : pages « Qui sommes-nous », « Où nous trouver », discours « marque engagée », « artisanat français », « fait main » répétés.
- **Cadre légal complet :** CGV, CGU, Mentions légales, Politique de confidentialité, Politique de remboursement, Politique d'expédition — les 6 pages existent et répondent en 200.
- Réassurance livraison affichée (« Livraison offerte dès 60 € », Colissimo mentionné).
- Mentions « paiement sécurisé » / « SSL » présentes.

**Problèmes identifiés**
- 🟠 **Important — les avis ne sont pas exploités sur les fiches produit.** Le 4,9/5 vit surtout en page d'accueil et en pied de page ; les fiches ne portent pas de note produit-par-produit visible ni structurée (cf. absence d'`aggregateRating`, §3.2). → Afficher les avis au niveau produit (widget + étoiles) : c'est le point où la décision se prend.
- 🟡 **Mineur — bloc de réassurance à consolider dans le tunnel.** Les garanties (retours, délais, SAV, sécurité paiement) sont dispersées. → Regrouper 3-4 pictos de réassurance sous le bouton « Ajouter au panier » et sur la page panier.
- 🟡 **Mineur — pas de certification/label affiché** (Oeko-Tex, origine France Garantie, etc.) alors que le positionnement s'y prête. → Ajouter les labels détenus, forte valeur de réassurance sur ce secteur.

---

### 💳 3.5 Conversion — 6,5/10

**Points forts**
- **Large éventail de moyens de paiement** détecté dans le footer et le panier : Visa, Mastercard, American Express, PayPal, Apple Pay, Shop Pay, Klarna, Bancontact. Couverture FR + international + paiement en plusieurs fois (Klarna).
- Seuil de livraison offerte clair (60 €) → levier de panier moyen.
- Boutons « Ajouter au panier » présents et identifiables sur les fiches.
- Prix cohérents et accessibles (Box démaquillante 32 €, Top Bag 36 €, Trousse 45 €).

**Problèmes identifiés**
- 🟠 **Important — pas de paiement en plusieurs fois « à la française » mis en avant (type Alma / 3x CB).** Klarna est présent mais moins rassurant qu'un 3x CB pour une cible FR. → Tester Alma/Scalapay et l'afficher dès la fiche produit (« ou 3× 15 € »).
- 🟠 **Important — friction Unicode jusque dans le tunnel.** Les noms de produits stylisés (𝑻𝒐𝒌𝒚𝒐…) se retrouvent dans le panier et les e-mails de confirmation, où ils s'affichent mal selon les clients mail. → Résolu par le renommage catalogue (§3.2).
- 🟡 **Mineur — barre de progression vers la livraison offerte non confirmée dans le panier.** Un indicateur « Plus que X € pour la livraison offerte » augmente le panier moyen. → Ajouter la jauge dynamique au panier/mini-panier.
- 🟡 **Mineur — pas de réassurance de rupture / délais sur la fiche.** L'`availability` n'est pas clairement exposée dans les données structurées. → Afficher stock/délai d'expédition explicite (« Fait main, expédié sous 48 h »).

---

### 🖼️ 3.6 Design & identité visuelle — analyse dédiée

> Analyse fondée sur l'extraction des *design tokens* réels du thème (couleurs, polices, système de grille) dans le HTML/CSS servi. Le rendu visuel en conditions réelles (navigateur) n'a pas pu être capturé depuis l'environnement d'audit ; les jugements ci-dessous portent sur les tokens et la structure, à confirmer par une revue visuelle.

**Système de design détecté**

| Élément | Valeur réelle | Commentaire |
|---|---|---|
| Police principale | **Work Sans** (sans-serif géométrique) | Choix moderne, lisible, cohérent avec un positionnement épuré |
| Couleur de marque 1 | **Vert sauge `#78a5a3`** | Évoque le naturel / végétal / éco — juste pour le secteur |
| Couleur de marque 2 | **Teal profond `#00646c`** | Bonne couleur de contraste pour titres et boutons |
| Neutres | Gris chaud `#71706f`, quasi-noir `#111111`, fond `#f9f9f9` | Palette douce, reposante |
| Accent | Magenta `#c8036f` | Touche pop, à doser (risque de dissonance avec le vert sauge) |
| Grille | Système responsive 12 colonnes (thème type Avada/Shella) | Structure éprouvée |

#### ✅ Ce qui fonctionne bien (design)
- **Cohérence chromatique avec le positionnement.** Le duo vert sauge / teal sur fond blanc cassé installe immédiatement un registre « naturel, doux, artisanal » parfaitement aligné avec le zéro déchet et le Made in France. La couleur *travaille* pour la marque.
- **Typographie unique et maîtrisée.** Une seule famille (Work Sans) sur tout le site → sobriété et cohérence. Pas de collision de polices.
- **Direction artistique produit forte.** Photographie soignée et abondante (visuels lifestyle + packshots), qui valorise le fait-main et les tissus (motifs japonais, imprimés fleuris).
- **Respiration visuelle.** Fond clair `#f9f9f9`, neutres chauds : l'ensemble est aéré, non agressif, cohérent avec une cible féminine sensible à l'esthétique.
- **Repères de marque récurrents** (♡ dans la barre d'annonce, emojis thématiques) qui donnent une personnalité chaleureuse et « fait maison ».

#### ⚠️ Ce qui ne va pas (design)
- 🟠 **Incohérence typographique de fond : les noms de produits en Unicode « stylisé ».** C'est autant un problème SEO (§3.2) qu'un **problème de design** : `𝑵𝒆𝒏𝒖𝒑𝒉𝒂𝒓𝒔`, `𝑻𝒐𝒌𝒚𝒐` sont des caractères imposés qui *ignorent la police Work Sans du thème*. Résultat : ces titres s'affichent dans une fausse police italique incohérente avec le reste, au rendu variable selon l'OS/navigateur, parfois en « tofu » (□) sur certains appareils. **Le style décoratif doit venir de la CSS (italique, graisse), pas des caractères.**
- 🟠 **Surcharge d'emojis dans les titres de section.** « TROUSSES DE TOILETTE 👛 », « CHARLOTTES COUVRE-PLATS 🥣 », « HEADBANDS FLEURIS 💐 »… La répétition d'un emoji par titre alourdit la lecture, donne un côté « amateur » qui contraste avec la qualité de la DA photo, et pose un souci d'accessibilité (vocalisation). → En garder 1 ou 2 maximum comme signature, pas un par section.
- 🟠 **Hiérarchie visuelle du titrage incohérente** (H1 → H3 sans H2, cf. §3.1) : les niveaux de titres ne reflètent pas une échelle typographique claire, ce qui brouille la lecture des priorités sur la page d'accueil.
- 🟡 **Risque de dissonance de l'accent magenta `#c8036f`** avec le vert sauge : ces deux couleurs sont presque complémentaires et « vibrent » si mal dosées. → Réserver le magenta aux micro-signaux (badges promo, ♡), jamais aux grandes surfaces.
- 🟡 **Densité d'images très élevée par page** (jusqu'à 82 visuels en accueil) : belle générosité, mais sans rythme éditorial (alternance texte/visuel, blocs de respiration) la page devient un long défilé qui dilue le message. → Structurer en sections espacées avec titres H2 clairs.
- 🟡 **Cohérence du bouton d'action à vérifier.** Le bouton d'ajout au panier (`product-form__cart-submit`) doit être la couleur la plus contrastée et constante du site (idéalement le teal `#00646c`) et ne jamais varier d'une page à l'autre — point à contrôler en revue visuelle.

**Verdict design :** une **identité visuelle réellement réussie et différenciante** (palette + photo + police), **sabotée par des détails d'exécution** (Unicode dans les titres, emojis en excès, hiérarchie) qui la font paraître moins professionnelle qu'elle ne l'est. Ce sont des corrections rapides à fort effet perçu.

---

## 4. Notes détaillées par page

| Page | UX | SEO | Perf | Trust | Conv. | Moy. | Remarque clé |
|---|:--:|:--:|:--:|:--:|:--:|:--:|---|
| Accueil | 7,5 | 5,5 | 4,0 | 8,0 | 7,0 | **6,4** | H1 = marque ; 82 images non lazy/WebP |
| Collection Box | 7,0 | 4,5 | 4,5 | 6,5 | 6,5 | **5,8** | Pas de meta description |
| Collection Top Bags | 7,0 | 4,5 | 5,0 | 6,5 | 6,5 | **5,9** | Pas de meta description |
| Collection Headband | 7,0 | 4,5 | 3,5 | 6,5 | 6,5 | **5,6** | 70 images, page 246 Ko |
| Produit Box Nénuphars | 7,0 | 4,0 | 4,5 | 6,5 | 6,5 | **5,7** | Nom Unicode, pas d'`aggregateRating` |
| Produit Top Bag Tokyo | 7,0 | 4,0 | 4,5 | 6,5 | 6,5 | **5,7** | Nom Unicode `𝑻𝒐𝒌𝒚𝒐` |
| Produit Trousse | 7,0 | 4,0 | 4,0 | 6,5 | 6,5 | **5,6** | 50 images, nom Unicode |
| Panier | 6,5 | — | 6,0 | 6,5 | 6,5 | **6,4** | Paiements multiples OK, jauge livraison à ajouter |
| Contact | 6,0 | 5,0 | 6,5 | 6,5 | — | **6,0** | Aucun H1 |
| Qui sommes-nous | 7,5 | 6,0 | 6,5 | 8,0 | — | **7,0** | Bon storytelling |
| Où nous trouver | 7,0 | 6,0 | 6,0 | 7,5 | — | **6,6** | Renforce l'ancrage local |
| CGV / CGU / Mentions / Confidentialité / Remboursement / Expédition | 6,5 | 5,5 | 6,5 | 8,5 | — | **6,8** | Cadre légal complet ✅ |

---

## 5. Top 10 des problèmes critiques consolidés

| # | Priorité | Problème | Module | Impact business |
|:--:|:--:|---|---|---|
| 1 | 🔴 | 104/137 produits (76 %) avec caractères Unicode stylisés dans nom + URL | SEO / Conv. | Indexation dégradée, accessibilité, e-mails cassés |
| 2 | 🔴 | Aucun `aggregateRating` structuré (pas d'étoiles Google) malgré 4,9/5 sur 140+ avis | SEO / Trust | Perte directe de CTR organique |
| 3 | 🔴 | Aucune image WebP/AVIF (100 % PNG/JPG) | Perf | LCP dégradé, poids +30-50 % |
| 4 | 🔴 | Aucun `loading="lazy"` natif (lazy 100 % JS) | Perf | LCP et robustesse dégradés |
| 5 | 🟠 | Collections sans meta description | SEO | Snippets non maîtrisés sur requêtes volume |
| 6 | 🟠 | 7 produits doublons « copie-de-… » indexables | SEO | Contenu dupliqué / dilution |
| 7 | 🟠 | Hiérarchie de titres cassée (H1→H3, 0 H2) + H1 accueil = marque | UX / SEO | Sémantique et accessibilité |
| 8 | 🟠 | Avis non exploités au niveau fiche produit | Trust / Conv. | Réassurance absente au moment décisif |
| 9 | 🟠 | Pages HTML lourdes (jusqu'à 256 Ko) + 46-55 scripts/page | Perf | Temps de rendu, budget crawl |
| 10 | 🟠 | Pas de 3x CB « à la française » (Alma/Scalapay) mis en avant | Conv. | Frein au passage de commande sur paniers 40 €+ |

---

## 6. Plan d'action sur 3 horizons

### ⚡ Quick wins (0-2 semaines, effort faible, impact fort)
1. **Injecter `aggregateRating`** dans le JSON-LD produit via l'app d'avis (Trustpilot/Judge.me) → étoiles Google, +CTR. *(Pb #2)*
2. **Rédiger une meta description par collection** (12 collections) + étendre celle de l'accueil à ~155 car. *(Pb #5, #10-mineur)*
3. **Activer WebP** sur le CDN Shopify (réglage thème / paramètre `format`). *(Pb #3)*
4. **Ajouter `loading="lazy"` natif** hors premier écran + `fetchpriority="high"` sur l'image hero. *(Pb #4)*
5. **Traiter les 7 doublons « copie-de- »** : suppression, fusion ou `noindex` + 301. *(Pb #6)*
6. **Ajouter un H1 à la page Contact** et remplacer le H1 d'accueil par une promesse orientée mot-clé. *(Pb #7)*
7. **Ajouter la jauge « plus que X € pour la livraison offerte »** au panier. *(Conv.)*

### 🛠️ Moyen terme (1-2 mois, effort modéré)
1. **Renommer tout le catalogue en typographie standard** (script Shopify sur 137 produits) + redirections 301 des anciens handles. Chantier prioritaire mais volumineux. *(Pb #1)*
2. **Refonte de la hiérarchie de titres** du thème (H1 › H2 › H3 cohérents sur accueil et collections). *(Pb #7)*
3. **Widget d'avis sur les fiches produit** (étoiles + verbatims au niveau produit). *(Pb #8)*
4. **Audit des apps/scripts tiers** : désinstaller l'inutile, passer les widgets en `defer`/chargement différé, viser < 30 scripts/page. *(Pb #9)*
5. **Généraliser `srcset`/`sizes`** sur les visuels catalogue.
6. **Intégrer un 3x CB** (Alma ou Scalapay) affiché dès la fiche produit. *(Pb #10)*
7. **Bloc réassurance standardisé** (retours, délais, sécurité, Made in France) sous chaque « Ajouter au panier ».

### 🚀 Long terme (3-6 mois, effort structurant)
1. **Optimisation Core Web Vitals mesurée** (WebPageTest + CrUX) : cible LCP < 2,5 s mobile, allègement du thème, critical CSS.
2. **Stratégie de contenu SEO** : pages guides/blog sur les usages (« démaquillant lavable », « alternatives zéro déchet »), maillage interne vers collections.
3. **Programme d'avis systématique** (relance post-achat, photos clients) pour nourrir la preuve sociale et le SEO.
4. **Ajout de labels/certifications** (Oeko-Tex, Origine France Garantie) si éligibles.
5. **Préparer l'internationalisation francophone** (BE/CH) : `hreflang`, devises, déjà amorcée via Bancontact.
6. **A/B testing du tunnel** (page produit, panier, express checkout) pour arbitrer les frictions restantes.

---

## 7. Rapport exécutif (synthèse dirigeant)

### En une page

**Carré Cotons est une boutique en bonne santé, portée par une marque désirable et une vraie preuve sociale (4,9/5 sur plus de 140 avis Trustpilot).** Le cadre légal est complet, l'offre de paiement est large (CB, PayPal, Apple Pay, Klarna, Bancontact) et le positionnement « accessoires textiles Made in France, faits main » est clair et différenciant. La note globale de **5,9/10** reflète un socle solide — mais bridé par des choix techniques qui coûtent du trafic et des ventes, sans que le client final n'en soit responsable.

**Trois chantiers déterminent l'essentiel du potentiel non exploité :**

1. **Le catalogue est écrit en caractères « stylisés » invisibles pour Google.** 76 % des produits (104 sur 137) portent un nom en typographie Unicode décorative (ex. `𝑻𝒐𝒌𝒚𝒐`). Ces caractères ne sont ni correctement indexés, ni lisibles par les lecteurs d'écran, ni affichables dans les e-mails de confirmation. C'est le frein n°1 à la visibilité organique. **Correctif : renommer en texte normal ; le style doit passer par le graphisme, pas par les lettres.**

2. **Les 4,9/5 d'avis ne rapportent pas ce qu'ils devraient.** La note existe et est excellente, mais elle n'est pas « branchée » sur les données structurées : **Google n'affiche donc aucune étoile** sous les liens du site. C'est une correction rapide (quelques jours de développement) à fort retour sur le taux de clic.

3. **Les pages sont lourdes et les images non optimisées.** Aucune image n'est servie en format moderne (WebP), et le chargement différé dépend entièrement du JavaScript. Résultat : un temps d'affichage estimé à 3,5–5 s sur mobile, pénalisant à la fois l'expérience et le référencement.

**Recommandation dirigeant :** lancer immédiatement les **7 quick wins** (0-2 semaines, faible coût, dont l'activation des étoiles Google et du format WebP), puis engager le **renommage du catalogue** comme chantier structurant du trimestre. Ces actions n'exigent pas de refonte : elles corrigent des réglages et libèrent un potentiel déjà présent. Le ROI attendu est concentré sur l'acquisition organique (SEO/CTR) et la vitesse mobile, deux leviers directs du chiffre d'affaires.

### Tableau de bord dirigeant

| Indicateur | État actuel | Cible 3 mois |
|---|---|---|
| Note d'audit globale | 5,9/10 | ≥ 7,5/10 |
| Produits en typographie exploitable | 24 % | 100 % |
| Étoiles Google (rich snippets) | ❌ absentes | ✅ actives |
| Images en format moderne (WebP) | 0 % | 100 % |
| LCP mobile estimé | 3,5-5 s | < 2,5 s |
| Collections avec meta description | 0/12 | 12/12 |
| Doublons catalogue indexables | 7 | 0 |

---

*Audit généré automatiquement — analyse basée sur le HTML servi et les données structurées au 1er juillet 2026. Les métriques de performance en conditions réelles (Core Web Vitals) doivent être confirmées par une mesure terrain (WebPageTest / Google Search Console / PageSpeed Insights).*
