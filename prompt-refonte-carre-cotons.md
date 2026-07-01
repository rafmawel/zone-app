# Prompt de refonte — Carré Cotons (V2 moderne)

> Prompt prêt à coller dans un générateur de site / maquette IA (v0, Lovable, Figma Make, Claude, Bolt…).
> Il réutilise la charte réelle extraite du site actuel et l'élève vers les tendances mode & beauté 2026.

---

## A. Contexte tendances mode & beauté 2026 (synthèse pour cadrer la DA)

Tendances retenues et **traduites pour Carré Cotons** :

1. **Layouts éditoriaux « magazine »** — visuels full-bleed (bord à bord), grandes images, mise en page type revue haut de gamme. *→ Valorise les tissus, motifs et le fait-main.*
2. **Duo typographique serif + sans-serif** — un serif de caractère pour les titres, un sans-serif propre pour le texte. C'est LE marqueur d'élégance éditoriale 2026. *→ On garde Work Sans en texte, on ajoute un serif display pour les titres.*
3. **Design « human-centric », chaud et texturé** — rejet du « tout-lisse IA » : grain, matière, imperfection maîtrisée, chaleur. *→ Colle au positionnement artisanal.*
4. **« Transformative Teals »** — bleus-verts profonds / jade, couleurs de confiance et de sérénité. *→ La marque les possède déjà (`#00646c`, `#78a5a3`) : on les met au centre.*
5. **Durabilité intégrée au code** — site léger, images optimisées (WebP/AVIF), animations sobres, lazy-load. *→ Répond directement aux points Perf de l'audit.*
6. **Mobile-first, checkout ≤ 3 taps** — pensé pour le pouce, tunnel ultra-court.
7. **Micro-interactions & italiques expressives** — animations discrètes au scroll/hover, un accent typographique italique comme signature (à la place des caractères Unicode bricolés à bannir).

---

## B. LE PROMPT (à copier tel quel)

```
Tu es un directeur artistique et développeur front. Conçois la maquette d'un
site e-commerce moderne, éditorial et haut de gamme pour « Carré Cotons »,
une marque française d'accessoires textiles zéro déchet, faits main en France
(box démaquillantes lavables, trousses de toilette et de voyage, headbands,
charlottes couvre-plats, pochettes à savon, étuis à brosse à dents).

POSITIONNEMENT
Artisanal, écoresponsable, féminin, doux mais premium. On veut le raffinement
d'un magazine de mode/beauté, pas d'une boutique Shopify générique. Cible :
femmes 25-55 ans sensibles au design, à la seconde main et au Made in France.

DIRECTION ARTISTIQUE (tendances mode & beauté 2026)
- Layout ÉDITORIAL type magazine : images full-bleed bord à bord, grandes
  respirations, grille asymétrique, blocs texte/image alternés.
- Ambiance « human-centric » : chaleureuse, texturée (grain papier, coton,
  matière), naturelle — surtout PAS l'esthétique lisse et froide de l'IA.
- Micro-interactions discrètes : fondus et légers translate au scroll, zoom
  doux des images produit au hover, transitions de 200-300ms, jamais tape-à-l'œil.
- Mobile-first strict, checkout en 3 étapes maximum.
- Sobriété technique : composants légers, images WebP/AVIF, lazy-loading natif.

PALETTE (charte réelle de la marque, à respecter)
- Teal profond (couleur principale, titres/CTA) : #00646C
- Vert sauge (couleur secondaire, fonds de sections, aplats) : #78A5A3
- Fond clair crème/blanc cassé (fond dominant) : #F9F9F9 et #FFFFFF
- Encre quasi-noire (texte courant) : #1C1C1C
- Gris chaud (texte secondaire, légendes) : #71706F
- Accent magenta (RARE : badges promo, ♡, soldes uniquement) : #C8036F
Extensions autorisées pour un système moderne : un teal très clair #E4ECE9
(fonds de cartes, hovers), un sable/lin #EFE9DE (blocs éditoriaux chaleureux).
Ratios : ~70% neutres clairs, ~20% verts de marque, ~10% encre, accent < 2%.
Toujours respecter un contraste AA (WCAG) texte/fond.

TYPOGRAPHIE (duo éditorial 2026)
- Titres (H1/H2) : un SERIF display élégant et contemporain (ex. Fraunces,
  Playfair Display, ou Canela). Grandes tailles, interlignage serré.
- Texte, boutons, navigation : Work Sans (police actuelle de la marque) —
  cohérence de marque conservée.
- Un seul accent italique serif comme signature pour un mot-clé par section.
- INTERDIT : les caractères Unicode « stylisés » (𝑵𝒆𝒏𝒖𝒑𝒉𝒂𝒓𝒔, 𝑻𝒐𝒌𝒚𝒐).
  Tout effet typo passe par la CSS (font italic / weight), jamais par les
  caractères. Les noms de produits s'écrivent en texte normal (« Box
  démaquillante Nénuphars »).
- Emojis : bannis des titres. Au maximum une icône linéaire fine et sobre.

STRUCTURE DES PAGES À PRODUIRE
1. ACCUEIL
   - Hero full-bleed : grande photo lifestyle (matière coton), titre serif
     porteur d'une promesse claire + mot-clé (ex. « L'accessoire textile
     utile, beau et fait main en France »), 1 CTA primaire teal.
   - Barre d'annonce fine « Livraison offerte dès 60€ » (discrète, pas criarde).
   - Bandeau réassurance (4 pictos linéaires) : Fait main en France · Zéro
     déchet · Livraison 48h · Paiement sécurisé.
   - Grille éditoriale des catégories (blocs image + titre serif).
   - Section « marque engagée » : storytelling + photo atelier, ton chaleureux.
   - Preuve sociale : note ⭐ 4,9/5 sur +140 avis + 2-3 verbatims clients.
   - Newsletter (bloc sable) + footer complet (mentions, CGV, paiements).
2. PAGE COLLECTION
   - En-tête éditorial (titre serif + courte intro), filtres discrets,
     grille produit aérée (2 col. mobile / 3-4 desktop), cartes avec zoom hover,
     note en étoiles visible sur chaque carte.
3. FICHE PRODUIT
   - Galerie immersive à gauche (images WebP, zoom), infos à droite : titre
     serif, prix, sélecteur de variante, GROS bouton « Ajouter au panier »
     teal #00646C constant, bloc réassurance sous le bouton, note + avis
     produit visibles, accordéons (description, matières, entretien, livraison).
   - Section « vous aimerez aussi » éditoriale.
4. PANIER / MINI-PANIER
   - Jauge dynamique « Plus que X€ pour la livraison offerte », récap clair,
     moyens de paiement affichés (CB, PayPal, Apple Pay, 3x), CTA unique.

EXIGENCES UX / TECHNIQUES (non négociables)
- Hiérarchie de titres propre : un seul H1 par page, puis H2 > H3 cohérents.
- Accessibilité : contraste AA, focus visibles, alt sur toutes les images,
  cibles tactiles ≥ 44px.
- Performance : LCP < 2,5s mobile, images responsive (srcset/sizes), format
  moderne, lazy-load hors premier écran, animations réduites si prefers-reduced-motion.
- Données structurées produit avec note (aggregateRating) prévues.

LIVRABLE
Maquette responsive (desktop + mobile) des 4 gabarits ci-dessus, avec un mini
design-system en tête : palette (avec hex), échelle typographique, styles de
boutons (primaire teal, secondaire outline), style de carte produit.
Rends un rendu chaleureux, éditorial et premium — l'opposé d'un template.
```

---

## C. Variante courte (si l'outil limite la longueur du prompt)

```
Crée la maquette d'un site e-commerce éditorial et premium pour « Carré Cotons »,
marque française d'accessoires textiles zéro déchet faits main.
Style : magazine mode/beauté 2026 — layout éditorial, images full-bleed,
chaleureux et texturé (pas lisse/IA), micro-interactions sobres, mobile-first.
Palette de marque à respecter : teal #00646C (principal/CTA), vert sauge #78A5A3,
fond crème #F9F9F9, encre #1C1C1C, gris chaud #71706F, accent magenta #C8036F (rare).
Typo : titres en serif display (Fraunces/Playfair), texte en Work Sans.
Interdits : caractères Unicode stylisés dans les titres, emojis dans les titres.
Pages : accueil (hero + réassurance + catégories + storytelling + avis 4,9/5),
collection, fiche produit (CTA teal constant + avis + réassurance), panier
(jauge livraison offerte dès 60€). LCP < 2,5s, images WebP, accessibilité AA.
```

---

## D. Notes d'usage
- Le prompt corrige au passage les points de l'audit : Unicode bannis, hiérarchie Hn propre, WebP + lazy-load, `aggregateRating`, réassurance sur la fiche, jauge panier.
- Polices serif suggérées libres de droits : **Fraunces** (Google Fonts, chaleureuse, idéale ici), **Playfair Display**, ou premium **Canela**. Work Sans reste en texte pour la continuité de marque.
- Remplace les images d'exemple par tes vraies photos produit (les plus valorisantes, tissus et fait-main).

*Sources tendances : Figma Web Design Trends 2026, Fontfabric Typography 2026, Squarespace Beauty/Fashion 2026, Ringly Beauty Ecommerce 2026, Selfnamed Branding 2026.*
